import { describe, expect, it } from 'vitest'
import type { KeyValueStore } from '@/lib/temporaryInk'
import {
  allAnswered,
  answerText,
  buildAnswers,
  clearSavedAnswers,
  defaultClassId,
  firstUnanswered,
  isAlreadySubmitted,
  isAnswered,
  quizAnswersKey,
  readSavedAnswers,
  saveAnswers,
} from './taking'

describe('isAnswered', () => {
  it('treats index 0 and false as answers', () => {
    expect(isAnswered(0)).toBe(true)
    expect(isAnswered(false)).toBe(true)
    expect(isAnswered(true)).toBe(true)
  })
  it('treats missing, empty and whitespace-only text as unanswered', () => {
    expect(isAnswered(undefined)).toBe(false)
    expect(isAnswered('')).toBe(false)
    expect(isAnswered('   \n')).toBe(false)
    expect(isAnswered(' atom ')).toBe(true)
  })
})

describe('allAnswered', () => {
  const qs = [{ id: 'a' }, { id: 'b' }]
  it('needs every question answered', () => {
    expect(allAnswered(qs, { a: 0 })).toBe(false)
    expect(allAnswered(qs, { a: 0, b: '  ' })).toBe(false)
    expect(allAnswered(qs, { a: 0, b: 'x' })).toBe(true)
  })
  it('is false for a quiz with no questions', () => {
    expect(allAnswered([], {})).toBe(false)
  })
})

describe('buildAnswers', () => {
  it('keeps only known question ids', () => {
    expect(buildAnswers([{ id: 'a' }], { a: false, stale: 3 })).toEqual({ a: false })
  })
})

describe('defaultClassId', () => {
  it('prefers the first class not yet attempted', () => {
    expect(
      defaultClassId([
        { id: '1', attempted: true },
        { id: '2', attempted: false },
        { id: '3', attempted: false },
      ]),
    ).toBe('2')
  })
  it('falls back to the first class, or null', () => {
    expect(defaultClassId([{ id: '1', attempted: true }, { id: '2', attempted: true }])).toBe('1')
    expect(defaultClassId([])).toBeNull()
  })
})

describe('firstUnanswered', () => {
  const qs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  it('is the first question, in order, without an answer', () => {
    expect(firstUnanswered(qs, { a: 1, c: true })).toBe('b')
    expect(firstUnanswered(qs, { a: 1, b: '  ', c: true })).toBe('b')
  })
  it('is null when every question is answered', () => {
    expect(firstUnanswered(qs, { a: 0, b: 'x', c: false })).toBeNull()
  })
})

/*
  Answers kept in this browser while a student works, so a reload or a stray
  click on "My classes" does not wipe them. The rules are `briefDrafts`': the key
  is namespaced by user (signing out clears only the Supabase session, so a shared
  key would hand one student's answers to the next on a shared machine), and
  there is no key at all while the session hydrates.
*/
function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

const questions = [
  { id: 'mc', type: 'multiple_choice' as const, choices: ['a', 'b', 'c'] },
  { id: 'tf', type: 'true_false' as const, choices: [] },
  { id: 'fb', type: 'fill_blank' as const, choices: [] },
]

describe('quizAnswersKey', () => {
  it('is namespaced by user and quiz', () => {
    expect(quizAnswersKey('u1', 'q1')).toBe('lekturac:quiz-answers:u1:q1')
  })
  it('is null while the user is unknown, with no shared fallback', () => {
    expect(quizAnswersKey(null, 'q1')).toBeNull()
  })
})

describe('saved answers', () => {
  it('round-trips what the student entered', () => {
    const store = memoryStore()
    expect(saveAnswers(store, 'u1', 'q1', { mc: 2, tf: false, fb: 'atom' })).toBe(true)
    expect(readSavedAnswers(store, 'u1', 'q1', questions)).toEqual({ mc: 2, tf: false, fb: 'atom' })
  })

  it("never reads another user's answers", () => {
    const store = memoryStore()
    saveAnswers(store, 'u1', 'q1', { mc: 1 })
    expect(readSavedAnswers(store, 'u2', 'q1', questions)).toEqual({})
  })

  it('reads and writes nothing while the user is unknown', () => {
    const store = memoryStore()
    expect(saveAnswers(store, null, 'q1', { mc: 1 })).toBe(false)
    expect(store.data.size).toBe(0)
    expect(readSavedAnswers(store, null, 'q1', questions)).toEqual({})
  })

  // The quiz can differ from when the answers were saved; only answers that still fit come back.
  it('drops answers for unknown questions or of the wrong shape', () => {
    const store = memoryStore()
    store.setItem(
      'lekturac:quiz-answers:u1:q1',
      JSON.stringify({ mc: 3, tf: 'yes', fb: 4, gone: 1 }),
    )
    expect(readSavedAnswers(store, 'u1', 'q1', questions)).toEqual({})
    store.setItem('lekturac:quiz-answers:u1:q1', JSON.stringify({ mc: 1.5, tf: true, fb: 'x' }))
    expect(readSavedAnswers(store, 'u1', 'q1', questions)).toEqual({ tf: true, fb: 'x' })
  })

  it('reads nothing from a malformed value or a store that throws', () => {
    const store = memoryStore()
    store.setItem('lekturac:quiz-answers:u1:q1', '{not json')
    expect(readSavedAnswers(store, 'u1', 'q1', questions)).toEqual({})
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readSavedAnswers(broken, 'u1', 'q1', questions)).toEqual({})
    // `false` is what tells the page its answers are not being kept.
    expect(saveAnswers(broken, 'u1', 'q1', { mc: 1 })).toBe(false)
  })

  it('removes the key when there is nothing to keep, and on clear', () => {
    const store = memoryStore()
    saveAnswers(store, 'u1', 'q1', { mc: 1 })
    expect(saveAnswers(store, 'u1', 'q1', {})).toBe(true)
    expect(store.data.size).toBe(0)
    saveAnswers(store, 'u1', 'q1', { mc: 1 })
    clearSavedAnswers(store, 'u1', 'q1')
    expect(store.data.size).toBe(0)
  })
})

// A submit whose reply was lost, or one sent from a second tab, meets this refusal on retry.
describe('isAlreadySubmitted', () => {
  it("recognises submit_quiz_attempt's one-attempt refusal", () => {
    expect(isAlreadySubmitted("You've already submitted this quiz for this class.")).toBe(true)
  })
  it('is false for any other refusal', () => {
    expect(isAlreadySubmitted("This quiz isn't posted to that class.")).toBe(false)
    expect(isAlreadySubmitted('Failed to fetch')).toBe(false)
  })
})

describe('answerText', () => {
  const mc = { type: 'multiple_choice' as const, choices: ['Mars', 'Jupiter', 'Venus'] }

  it('names a choice by its letter and its words', () => {
    expect(answerText(mc, 1)).toBe('B. Jupiter')
    expect(answerText(mc, 0)).toBe('A. Mars')
  })

  it('says True or False for a true/false pick', () => {
    const tf = { type: 'true_false' as const, choices: [] }
    expect(answerText(tf, true)).toBe('True')
    expect(answerText(tf, false)).toBe('False')
  })

  it('shows typed text trimmed', () => {
    expect(answerText({ type: 'fill_blank', choices: [] }, '  photosynthesis ')).toBe('photosynthesis')
  })

  // Nothing to show is not an answer: blank typing, a missing answer, or one that no longer fits the question.
  it('is null for no answer, blank text, or a value that does not fit the question', () => {
    expect(answerText(mc, undefined)).toBeNull()
    expect(answerText({ type: 'fill_blank', choices: [] }, '   ')).toBeNull()
    expect(answerText(mc, 7)).toBeNull()
    expect(answerText(mc, 'Jupiter')).toBeNull()
    expect(answerText({ type: 'true_false', choices: [] }, 1)).toBeNull()
  })
})
