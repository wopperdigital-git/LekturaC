import type { Card } from '@/engine/contentBlocks'
import { contentLines } from '@/engine/cardTemplates'
import { isRegenerable } from '@/engine/narration'
import type { NarrationSlide } from './provider'

export const NARRATION_SYSTEM_PROMPT = `You write narration scripts for presentation slides — the words a presenter says out loud while a slide is on screen.

You are given a whole deck at once so the narration flows from slide to slide as one continuous talk.

WRITING RULES
- Write to be SPOKEN, not read. Full sentences, natural rhythm, contractions welcome.
- EXPAND on the slide. The slide holds the headline; the script explains, gives context, and says why it matters. Never just read the bullets aloud.
- 90 to 140 words per slide — roughly 35 to 55 seconds of speech.
- Connect to the slide before and the slide after. Use real transitions ("that brings us to…", "so what does that mean in practice?").
- The first slide opens the talk. The last slide closes it.
- Never invent statistics, dates, names or facts that are not on the slide.
- Plain prose only: no markdown, no asterisks, no bullet characters, no stage directions, no "Slide 3:" prefixes.

FIXED SLIDES
Some slides arrive with an existing script the user wrote. Those are FIXED. Do not return a script for them. Do read them, and make the slides on either side flow into and out of them.

OUTPUT
Return ONLY a JSON object, no other text:
{"scripts":[{"slide":1,"text":"..."},{"slide":4,"text":"..."}]}
Include an entry for every slide that is not fixed, and for no slide that is.`

export function buildNarrationUserPrompt(title: string, slides: NarrationSlide[]): string {
  const body = slides
    .map((s) => {
      const head = `Slide ${s.slide}: ${s.heading}`
      const content = s.lines.length > 0 ? `\n${s.lines.map((l) => `- ${l}`).join('\n')}` : ''
      const fixed = s.existingScript
        ? `\n[FIXED — the user wrote this script. Do not return one for this slide.]\n"${s.existingScript}"`
        : ''
      return `${head}${content}${fixed}`
    })
    .join('\n\n')

  const wanted = slides.filter((s) => !s.existingScript).map((s) => s.slide)

  return `Presentation title: ${title}

${body}

Write narration for these slides only: ${wanted.join(', ')}.`
}

/**
 * The deck as slides for the prompt.
 *
 * Every slide is included — the model needs the whole talk to write transitions
 * — but a slide whose script the user has edited carries it as `existingScript`
 * and is marked fixed. `contentLines` is reused rather than reimplemented so
 * the narration sees exactly the words a card conversion would preserve.
 *
 * `cards` MUST be sorted by `orderIndex`; `slide` is 1-based position, which is
 * what `mergeNarration` reads back.
 */
export function narrationSlides(cards: Card[]): NarrationSlide[] {
  return cards.map((card, i) => {
    const heading = card.blocks[0]?.type === 'heading' ? card.blocks[0].text : `Slide ${i + 1}`
    return {
      slide: i + 1,
      heading,
      lines: contentLines(card.blocks),
      ...(isRegenerable(card.narration) ? {} : { existingScript: card.narration?.text }),
    }
  })
}

/**
 * Output budget for one narration call.
 *
 * An expanded script runs 90–140 words, about 180 tokens, plus JSON overhead.
 * Clamped at 8192 like the deck path: past that the provider truncates the JSON
 * rather than granting a bigger budget, so asking for more buys nothing.
 */
export function narrationMaxTokens(slideCount: number): number {
  return Math.min(8192, Math.max(2048, slideCount * 260 + 600))
}
