import { resolveLayout } from '@/engine/layoutEngine'
import type { GeneratedDeck, QualityFlag } from '../schemas'
import { headingOf, normalize, visibleLines, wordCount } from './text'

/*
  Deterministic, pure structural validators — see the design spec's "[3]
  Deterministic validation". Every rule reads only the deck it was given; no
  Date, no network, no store. Heuristics stay conservative on purpose: a
  false "high" would trigger a repair call the deck didn't need, so anything
  this uncertain reports "low" instead.
*/

/** Headings that read as filler when the presentation isn't a lesson. */
const FILLER_HEADINGS = [
  'agenda',
  'objectives',
  'learning objectives',
  'what you will learn',
  'you will learn',
  'introduction',
  'thank you',
  'thanks',
  'questions',
]

/** Opening lines that describe the deck instead of starting it — banned regardless of presentation type. */
const OPENING_FILLER_PREFIXES = ['this presentation', 'this deck', 'this slide', 'in this presentation']

const OVERCLAIM_TERMS = [
  'proves',
  'always',
  'guarantees',
  'guaranteed',
  'completely eliminates',
  'clearly superior',
  'zero emissions',
]

const CONCLUDING_PURPOSES = new Set(['summary', 'conclusion', 'recommendation', 'call_to_action'])

const RICH_BLOCK_TYPES = new Set(['stat', 'timelineStep', 'comparisonGroup', 'quote'])

/** Which coarse family a resolved layout belongs to, for `LAYOUT_REPETITION`. */
const LAYOUT_FAMILY: Record<ReturnType<typeof resolveLayout>, string> = {
  hero: 'hero',
  statHero: 'data',
  statGrid: 'data',
  comparison: 'comparison',
  timeline: 'timeline',
  quote: 'quote',
  iconGrid: 'grid',
  numberedList: 'list',
  textFocus: 'text',
  standard: 'text',
  standardSplit: 'text',
  gallery: 'visual',
}

function slideLabel(index: number): string {
  return `Slide ${index + 1}`
}

/** A case-insensitive, whole-word/phrase regex for an `OVERCLAIM_TERMS` entry. */
function wordBoundaryRegex(term: string): RegExp {
  return new RegExp(`\\b${term.replace(/\s+/g, '\\s+')}\\b`, 'i')
}

/** `true` when `heading` (already normalized) equals or starts with one of `phrases`. */
function matchesAny(heading: string, phrases: string[]): boolean {
  return phrases.some((phrase) => heading === phrase || heading.startsWith(`${phrase} `))
}

function titleTooLongFlags(deck: GeneratedDeck): QualityFlag[] {
  const flags: QualityFlag[] = []
  deck.cards.forEach((card, index) => {
    const words = wordCount(headingOf(card))
    if (words > 14) {
      flags.push({
        type: 'TITLE_TOO_LONG',
        severity: 'medium',
        slideIndex: index,
        message: `${slideLabel(index)}'s title is ${words} words, past the 14-word limit.`,
        suggestedAction: 'Shorten the title to a label, claim or question of 10 words or fewer.',
      })
    } else if (words > 10) {
      flags.push({
        type: 'TITLE_TOO_LONG',
        severity: 'low',
        slideIndex: index,
        message: `${slideLabel(index)}'s title is ${words} words, past the 10-word guideline.`,
        suggestedAction: 'Trim the title toward 10 words or fewer.',
      })
    }
  })
  return flags
}

function bodyTooDenseFlags(deck: GeneratedDeck): QualityFlag[] {
  const flags: QualityFlag[] = []
  deck.cards.forEach((card, index) => {
    if (card.plan.purpose === 'timeline' || card.plan.purpose === 'references') return
    const words = visibleLines(card).reduce((sum, line) => sum + wordCount(line), 0)
    if (words > 70) {
      flags.push({
        type: 'BODY_TOO_DENSE',
        severity: 'medium',
        slideIndex: index,
        message: `${slideLabel(index)} carries ${words} visible words, past the 70-word limit.`,
        suggestedAction: 'Move explanation into speaker notes and trim the visible text.',
      })
    }
  })
  return flags
}

function tooManyBulletsFlags(deck: GeneratedDeck): QualityFlag[] {
  const flags: QualityFlag[] = []
  deck.cards.forEach((card, index) => {
    card.blocks.forEach((block) => {
      if (block.type === 'bulletList' && block.items.length > 6) {
        flags.push({
          type: 'TOO_MANY_BULLETS',
          severity: 'low',
          slideIndex: index,
          message: `${slideLabel(index)} has a bullet list with ${block.items.length} items, past the 6-item guideline.`,
          suggestedAction: 'Split the list across slides or cut it to 6 items or fewer.',
        })
      }
    })
  })
  return flags
}

function layoutRepetitionFlags(deck: GeneratedDeck): QualityFlag[] {
  const families = deck.cards.map((card, index) =>
    LAYOUT_FAMILY[resolveLayout('auto', card.blocks, { isFirstCard: index === 0 })],
  )
  const flags: QualityFlag[] = []
  for (let i = 2; i < families.length; i++) {
    if (families[i] === families[i - 1] && families[i - 1] === families[i - 2]) {
      flags.push({
        type: 'LAYOUT_REPETITION',
        severity: 'low',
        slideIndex: i,
        message: `${slideLabel(i - 2)} through ${slideLabel(i)} all resolve to the same "${families[i]}" layout family.`,
        suggestedAction: 'Vary one of these slides to a different layout family.',
      })
    }
  }
  return flags
}

function textOnlyDeckFlags(deck: GeneratedDeck): QualityFlag[] {
  if (deck.cards.length < 4) return []
  const hasRichBlock = deck.cards.some((card) => card.blocks.some((block) => RICH_BLOCK_TYPES.has(block.type)))
  if (hasRichBlock) return []
  return [
    {
      type: 'TEXT_ONLY_DECK',
      severity: 'medium',
      message: 'The whole deck is plain text and bullet lists, with no stat, timeline, comparison or quote slide.',
      suggestedAction: 'Add at least one stat, timeline, comparison or quote slide to break up the deck.',
    },
  ]
}

function weakConclusionFlags(deck: GeneratedDeck): QualityFlag[] {
  const lastIndex = deck.cards.length - 1
  const last = deck.cards[lastIndex]
  if (!last || CONCLUDING_PURPOSES.has(last.plan.purpose)) return []
  return [
    {
      type: 'WEAK_CONCLUSION',
      severity: 'medium',
      slideIndex: lastIndex,
      message: `${slideLabel(lastIndex)}, the deck's last slide, has purpose "${last.plan.purpose}" instead of a conclusion.`,
      suggestedAction: 'End the deck on a summary, conclusion, recommendation or call to action.',
    },
  ]
}

function fillerSlideFlags(deck: GeneratedDeck): QualityFlag[] {
  const flags: QualityFlag[] = []
  const { presentationType } = deck.brief
  deck.cards.forEach((card, index) => {
    const heading = normalize(headingOf(card))
    if (!heading) return
    const isAgendaLike =
      presentationType !== 'educational' && presentationType !== 'tutorial' && matchesAny(heading, FILLER_HEADINGS)
    const isOpeningFiller = index === 0 && matchesAny(heading, OPENING_FILLER_PREFIXES)
    if (isAgendaLike || isOpeningFiller) {
      flags.push({
        type: 'FILLER_SLIDE',
        severity: 'medium',
        slideIndex: index,
        message: `${slideLabel(index)}'s title "${headingOf(card)}" reads as a filler slide rather than content.`,
        suggestedAction: 'Replace the slide with one that states a claim, question or piece of content.',
      })
    }
  })
  return flags
}

function visualMismatchFlags(deck: GeneratedDeck): QualityFlag[] {
  const flags: QualityFlag[] = []
  deck.cards.forEach((card, index) => {
    const { visualType } = card.plan
    const hasTimelineStep = card.blocks.some((block) => block.type === 'timelineStep')
    const comparisonGroupCount = card.blocks.filter((block) => block.type === 'comparisonGroup').length
    const hasStat = card.blocks.some((block) => block.type === 'stat')

    const mismatch =
      (visualType === 'timeline' && !hasTimelineStep) ||
      ((visualType === 'two_column_comparison' || visualType === 'comparison_table') && comparisonGroupCount < 2) ||
      (visualType === 'metric_cards' && !hasStat)

    if (mismatch) {
      flags.push({
        type: 'VISUAL_MISMATCH',
        severity: 'low',
        slideIndex: index,
        message: `${slideLabel(index)} claims visual type "${visualType}" but its blocks don't support it.`,
        suggestedAction: "Add the matching block type, or change the plan's visual type.",
      })
    }
  })
  return flags
}

function duplicateContentFlags(deck: GeneratedDeck): QualityFlag[] {
  const flags: QualityFlag[] = []
  const seenHeadings = new Set<string>()
  const seenBulletItems = new Set<string>()

  deck.cards.forEach((card, index) => {
    const heading = normalize(headingOf(card))
    if (heading && seenHeadings.has(heading)) {
      flags.push({
        type: 'DUPLICATE_CONTENT',
        severity: 'medium',
        slideIndex: index,
        message: `${slideLabel(index)}'s title repeats an earlier slide's title.`,
        suggestedAction: 'Give this slide its own title.',
      })
    }

    const normalizedItems = card.blocks
      .flatMap((block) => (block.type === 'bulletList' ? block.items : []))
      .map((item) => normalize(item))
    const hasRepeatedBullet = normalizedItems.some((item) => wordCount(item) >= 4 && seenBulletItems.has(item))
    if (hasRepeatedBullet) {
      flags.push({
        type: 'DUPLICATE_CONTENT',
        severity: 'medium',
        slideIndex: index,
        message: `${slideLabel(index)} repeats a bullet point from an earlier slide.`,
        suggestedAction: 'Remove the repeated bullet or rewrite it for this slide.',
      })
    }

    if (heading) seenHeadings.add(heading)
    normalizedItems.forEach((item) => seenBulletItems.add(item))
  })

  return flags
}

function overclaimFlags(deck: GeneratedDeck): QualityFlag[] {
  const flags: QualityFlag[] = []
  deck.cards.forEach((card, index) => {
    const lines = [headingOf(card), ...visibleLines(card)]
    const found = lines.some((line) =>
      OVERCLAIM_TERMS.some((term) => {
        if (!wordBoundaryRegex(term).test(line)) return false
        if (term === 'zero emissions') {
          const lower = line.toLowerCase()
          const emissionsIndex = lower.search(/zero\s+emissions/)
          const tailpipeIndex = lower.indexOf('tailpipe')
          if (tailpipeIndex !== -1 && tailpipeIndex < emissionsIndex) return false
        }
        return true
      }),
    )
    if (found) {
      flags.push({
        type: 'OVERCLAIM',
        severity: 'low',
        slideIndex: index,
        message: `${slideLabel(index)} uses overclaiming language not calibrated to the evidence.`,
        suggestedAction: 'Soften the wording to what the evidence actually supports.',
      })
    }
  })
  return flags
}

function narrationDuplicatesSlideFlags(deck: GeneratedDeck): QualityFlag[] {
  const flags: QualityFlag[] = []
  deck.cards.forEach((card, index) => {
    const notes = card.speakerNotes
    if (notes.trim() === '') {
      flags.push({
        type: 'NARRATION_DUPLICATES_SLIDE',
        severity: 'medium',
        slideIndex: index,
        message: `${slideLabel(index)} has no speaker notes.`,
        suggestedAction: 'Write speaker notes that explain the slide rather than repeat it.',
      })
      return
    }

    const notesWords = normalize(notes)
      .split(' ')
      .filter((word) => word.length > 3)
    if (notesWords.length === 0) return

    const slideWords = new Set(
      normalize([headingOf(card), ...visibleLines(card)].join(' '))
        .split(' ')
        .filter((word) => word.length > 0),
    )
    const matches = notesWords.filter((word) => slideWords.has(word)).length
    if (matches / notesWords.length >= 0.7) {
      flags.push({
        type: 'NARRATION_DUPLICATES_SLIDE',
        severity: 'medium',
        slideIndex: index,
        message: `${slideLabel(index)}'s speaker notes mostly repeat words already on the slide.`,
        suggestedAction: 'Rewrite the notes to add explanation instead of repeating the slide.',
      })
    }
  })
  return flags
}

/**
 * All deterministic structural checks over a generated deck, in rule order.
 * Pure and synchronous — see the design spec's "[3] Deterministic validation".
 */
export function structureFlags(deck: GeneratedDeck): QualityFlag[] {
  return [
    ...titleTooLongFlags(deck),
    ...bodyTooDenseFlags(deck),
    ...tooManyBulletsFlags(deck),
    ...layoutRepetitionFlags(deck),
    ...textOnlyDeckFlags(deck),
    ...weakConclusionFlags(deck),
    ...fillerSlideFlags(deck),
    ...visualMismatchFlags(deck),
    ...duplicateContentFlags(deck),
    ...overclaimFlags(deck),
    ...narrationDuplicatesSlideFlags(deck),
  ]
}
