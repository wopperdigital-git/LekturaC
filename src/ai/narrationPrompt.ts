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
 * Residual, accepted: a large enough deck can still exceed this budget. That
 * failure surfaces as a 400 (`request` kind, from `tryParseNarration`/the
 * empty-completion case), not a 429, so `FallbackProvider` will NOT hand off
 * to Gemini for it — capacity-only failover is correct in general (see
 * `fallbackProvider.ts`) but doesn't reach this particular failure mode. Not
 * fixed here.
 */
export function narrationMaxTokens(slideCount: number): number {
  return Math.min(7000, Math.max(5200, slideCount * 300 + 2000))
}
