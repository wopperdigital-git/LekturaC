import { headingTextOf, type Card } from '@/engine/contentBlocks'
import { contentLines } from '@/engine/cardTemplates'
import type { QuizConfig, QuizRequest, QuizSlide } from '@/quiz/types'

/*
  Groq's free tier counts *input plus requested output* against an ~8,000
  tokens-per-minute window, so the deck text sent to the model is capped: the
  output budget below already takes 5,200–7,000 of it.
*/
export const MAX_SLIDE_CHARS = 600
export const MAX_TOTAL_CHARS = 6000

/** Whole lines while they fit; a lone over-long first line is cut with an ellipsis. */
function takeLines(lines: string[], budget: number): string[] {
  const out: string[] = []
  let used = 0
  for (const line of lines) {
    if (used + line.length > budget) {
      if (out.length === 0 && budget > 1) out.push(`${line.slice(0, budget - 1).trimEnd()}…`)
      break
    }
    out.push(line)
    used += line.length
  }
  return out
}

/**
 * The deck as slides for the prompt. Every slide keeps its heading (so slide
 * numbers stay meaningful); body text is shared out of the total budget.
 * `cards` MUST be sorted by `orderIndex` — `slide` is the 1-based position and
 * is what `buildQuestions` maps back to a card.
 */
export function quizSlides(cards: Card[]): QuizSlide[] {
  const perSlide = Math.min(MAX_SLIDE_CHARS, Math.floor(MAX_TOTAL_CHARS / Math.max(1, cards.length)))
  return cards.map((card, i) => ({
    slide: i + 1,
    heading: headingTextOf(card, i),
    lines: takeLines(contentLines(card.blocks), perSlide),
  }))
}

/** A deck with only headings has nothing to ask about. */
export function hasQuizContent(cards: Card[]): boolean {
  return cards.some((card) => contentLines(card.blocks).length > 0)
}

export const QUIZ_SYSTEM_PROMPT = `You write quizzes from presentation slides.

RULES
- Every question must be answerable from the slides you are given. Never use outside facts, and never invent numbers, names or dates that are not on a slide.
- Every question cites the slide it came from with "slide" (the slide number shown).
- Spread the questions across the slides; do not ask about one slide over and over.
- Ask about ideas and facts, not about the slides themselves ("what does slide 3 say" is not a question).
- Write exactly the number of questions asked for. Return fewer ONLY if the slides cannot support that many distinct questions — never pad with near-duplicates.

OUTPUT
Return ONLY a JSON object, no other text, in the exact shape the request shows.`

function typeRules(config: QuizConfig): string {
  switch (config.type) {
    case 'multiple_choice':
      return `QUESTION TYPE: multiple choice.
- Each question has exactly ${config.choiceCount} choices and exactly one correct choice.
- Distractors must be plausible and drawn from the same slides. Never use "all of the above" or "none of the above".
- "answerIndex" is the 0-based index of the correct choice.
Reply shape: {"questions":[{"slide":2,"prompt":"...","choices":[${Array.from({ length: config.choiceCount }, () => '"..."').join(',')}],"answerIndex":0}]}`
    case 'fill_blank':
      return `QUESTION TYPE: fill in the blank.
- Each prompt is one sentence with exactly one blank written as _____ (five underscores).
- The blank hides a key term stated on the slide, one to three words. "answer" is that term.
- "accepted" lists up to three other spellings or forms that should also count (for example an abbreviation or a plural). Use [] if there are none.
Reply shape: {"questions":[{"slide":3,"prompt":"The _____ produces most of the cell's energy.","answer":"mitochondria","accepted":["mitochondrion"]}]}`
    case 'true_false':
      return `QUESTION TYPE: true or false.
- Each prompt is a single statement. About half should be true and half false.
- False statements must be plausible, changing one fact from the slide, not obviously absurd.
- "answer" is true or false as a JSON boolean.
Reply shape: {"questions":[{"slide":4,"prompt":"A statement about the slide.","answer":true}]}`
  }
}

export function buildQuizUserPrompt(request: QuizRequest): string {
  const body = request.slides
    .map((s) => {
      const lines = s.lines.length > 0 ? `\n${s.lines.map((l) => `- ${l}`).join('\n')}` : ''
      return `Slide ${s.slide}: ${s.heading}${lines}`
    })
    .join('\n\n')

  return `Presentation title: ${request.title}

${body}

Write exactly ${request.count} questions.

${typeRules(request.config)}`
}

/**
 * Output budget for one quiz call. The 5,200 floor is the same reasoning-token
 * floor `narrationMaxTokens` documents (`gpt-oss-120b` spends ~3,400 tokens
 * thinking before any JSON); the 7,000 ceiling keeps requested output inside
 * Groq's 8,000 TPM window. 20 items lands at 6,000.
 */
export function quizMaxTokens(count: number): number {
  return Math.min(7000, Math.max(5200, count * 110 + 3800))
}
