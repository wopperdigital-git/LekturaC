import { describe, expect, it } from 'vitest'
import { PLAIN_LANGUAGE_RULES, PLAIN_WORDS_RULES } from './plainLanguage'
import { QUIZ_SYSTEM_PROMPT } from './quizPrompt'
import { DECK_SYSTEM_PROMPT } from './prompts'
import { REPAIR_SYSTEM_PROMPT } from './repairPrompt'
import { NARRATION_SYSTEM_PROMPT } from './narrationPrompt'

describe('PLAIN_LANGUAGE_RULES', () => {
  /*
    Every prompt that writes words people read or hear carries the same rules.
    A prompt missing them writes the stock phrasing back in: a repaired slide
    would read differently from its neighbours, and regenerated narration
    differently from the deck's own speaker notes.
  */
  it.each([
    ['deck', DECK_SYSTEM_PROMPT],
    ['repair', REPAIR_SYSTEM_PROMPT],
    ['narration', NARRATION_SYSTEM_PROMPT],
  ])('is carried verbatim by the %s system prompt', (_name, prompt) => {
    expect(prompt).toContain(PLAIN_LANGUAGE_RULES)
  })

  /*
    The quiz carries only the word-level layer: its Groq window is the
    tightest, and the prose rules don't apply to a one-line question.
  */
  it('reaches the quiz prompt as the word-level layer only', () => {
    expect(QUIZ_SYSTEM_PROMPT).toContain(PLAIN_WORDS_RULES)
    expect(QUIZ_SYSTEM_PROMPT).not.toContain(PLAIN_LANGUAGE_RULES)
  })

  it('builds on the word-level layer, so the two cannot drift', () => {
    expect(PLAIN_LANGUAGE_RULES.startsWith(PLAIN_WORDS_RULES)).toBe(true)
  })

  it('leaves no long dash in the quiz prompt outside the rule that bans them', () => {
    expect(QUIZ_SYSTEM_PROMPT.replace(PLAIN_WORDS_RULES, '')).not.toMatch(/[—–]/)
  })

  it('appears once in the deck prompt, which also writes the speaker notes', () => {
    expect(DECK_SYSTEM_PROMPT.split(PLAIN_LANGUAGE_RULES)).toHaveLength(2)
  })

  it('bans every long dash and names the replacements', () => {
    for (const dash of ['—', '–', '--']) expect(PLAIN_WORDS_RULES).toContain(`(${dash})`)
    expect(PLAIN_LANGUAGE_RULES).toMatch(/comma, colon, period or parentheses/)
  })

  it('names the stock AI words', () => {
    for (const word of ['delve', 'tapestry', 'testament', 'pivotal', 'showcase', 'underscore']) {
      expect(PLAIN_WORDS_RULES).toContain(word)
    }
  })

  /*
    The rules ride in every call's input, against Groq's ~8,000 tokens a
    minute. ~4 characters a token: 2,400 characters is ~600 tokens, a ceiling
    that makes growth a deliberate choice rather than drift.
  */
  it('stays short', () => {
    expect(PLAIN_LANGUAGE_RULES.length).toBeLessThan(2400)
  })
})
