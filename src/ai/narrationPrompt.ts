import { headingTextOf, type Card } from '@/engine/contentBlocks'
import { contentLines } from '@/engine/cardTemplates'
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

SLIDES YOU ARE NOT WRITING
The request names exactly which slides to write. Every other slide is marked SKIP and is there for context only — do not return a script for it. Where a skipped slide already has a script it is quoted for you, so the slides on either side can flow into and out of it.

OUTPUT
Return ONLY a JSON object, no other text:
{"scripts":[{"slide":1,"text":"..."},{"slide":4,"text":"..."}]}
Include an entry for every requested slide, and for no other slide.`

export function buildNarrationUserPrompt(title: string, slides: NarrationSlide[]): string {
  const body = slides
    .map((s) => {
      const head = `Slide ${s.slide}: ${s.heading}`
      const content = s.lines.length > 0 ? `\n${s.lines.map((l) => `- ${l}`).join('\n')}` : ''
      /*
        Whether the slide is wanted and whether it already has a script are two
        independent facts, printed separately on purpose. A slide can be
        skipped with no script (the user left it unticked) or skipped with one
        (they are keeping what is there) — collapsing the two into "has text",
        as this once did, silently requests the first.
      */
      const skip = s.write ? '' : `\n[SKIP — do not return a script for this slide.]`
      const existing = s.existingScript ? `\nIts current script: "${s.existingScript}"` : ''
      return `${head}${content}${skip}${existing}`
    })
    .join('\n\n')

  const wanted = slides.filter((s) => s.write).map((s) => s.slide)

  return `Presentation title: ${title}

${body}

Write narration for these slides only: ${wanted.join(', ')}.`
}

/**
 * The deck as slides for the prompt.
 *
 * Every slide is included — the model needs the whole talk to write transitions
 * — but only those in `targets` are requested. `contentLines` is reused rather
 * than reimplemented so the narration reads the same words in the same order
 * everywhere a card's text is flattened.
 *
 * `targets` holds 0-based array positions and comes from what the user actually
 * picked: the one slide behind "Generate for this slide", or the ticked boxes
 * in the generate dialog. It is deliberately NOT derived from `isRegenerable`
 * here — that would put the choice in two places, and the copy in this file
 * would be the one nobody remembered to update. The same set is handed to
 * `mergeNarration`, so what the prompt asks for and what may be written cannot
 * drift apart.
 *
 * Any existing script travels as `existingScript` whether or not the slide is a
 * target, since a neighbour's words are context worth having either way.
 *
 * `cards` MUST be sorted by `orderIndex`; `slide` is 1-based position, which is
 * what `mergeNarration` reads back.
 */
export function narrationSlides(cards: Card[], targets: ReadonlySet<number>): NarrationSlide[] {
  return cards.map((card, i) => {
    const existing = card.narration?.text
    return {
      slide: i + 1,
      heading: headingTextOf(card, i),
      lines: contentLines(card.blocks),
      write: targets.has(i),
      ...(existing ? { existingScript: existing } : {}),
    }
  })
}

/**
 * Output budget for one narration call.
 *
 * The floor is NOT about script length — it's about `gpt-oss-120b` being a
 * reasoning model that spends tokens thinking before it emits any JSON, and
 * `max_tokens` is billed against reasoning first. A direct curl against Groq
 * measured 3400 reasoning tokens on an 8-slide deck (completion_tokens: 4532
 * total). The old floor of 2048, and the old formula's 2680 at 8 slides, sat
 * *below* that: the model spent the whole budget reasoning, emitted nothing,
 * and Groq returned a 400 `json_validate_failed` with an empty
 * `failed_generation` — not a short script, no output at all. 5200 clears the
 * measured overhead with room for the scripts themselves.
 *
 * The ceiling is 7000, not 8192 like the deck path. Groq's free tier reports
 * `x-ratelimit-limit-tokens: 8000` per minute and counts *requested* output
 * against that window before the model runs — ask for 8192 and the request is
 * refused outright with `rate_limit_exceeded`, independent of the reasoning
 * problem above. 7000 leaves headroom inside the 8000 window; 6000 was
 * confirmed working end-to-end (all 8 scripts, well-formed JSON) in the same
 * test.
 *
 * Residual, accepted, and NOT merely "very large decks": running the measured
 * numbers above forward, the 7000 ceiling leaves only 7000 - 3400 = 3600
 * tokens for the scripts themselves once the model reaches its floor, and the
 * same measurement put one script at (4532 - 3400) / 8 ≈ 141 tokens — so the
 * budget is arithmetically full around 3600 / 141 ≈ 25 slides, and reasoning
 * tokens likely grow with slide count too (more deck to read before answering),
 * which only pulls that point earlier. That puts the real threshold at roughly
 * **20-25 slides**, not "very large" — and `CreatePage`'s own `MAX_SLIDES` is
 * 30, so a deck that can never be narrated is fully creatable today. The
 * failure is also a dead end rather than a fallback: it surfaces as a 400
 * (`request` kind, from `tryParseNarration`/the empty-completion case), not a
 * 429, so `FallbackProvider` will NOT hand off to Gemini for it —
 * capacity-only failover is correct in general (see `fallbackProvider.ts`) but
 * doesn't reach this particular failure mode.
 *
 * Open question, also not resolved here: if Groq's 8000/min window counts
 * *prompt* tokens as well as requested output (unconfirmed either way), a
 * large deck's prompt — the whole deck's headings and bullets, once per call —
 * would trip that window from the input side too, independent of this output
 * budget. That failure mode would at least surface as a 429 and DOES fail over
 * to Gemini, unlike the one above.
 *
 * Not fixed here: fixing it for real means batching the call (multiple
 * narration requests per deck) or raising the ceiling, and that's a design
 * decision for the user to make, not a wording fix.
 */
export function narrationMaxTokens(slideCount: number): number {
  return Math.min(7000, Math.max(5200, slideCount * 300 + 2000))
}
