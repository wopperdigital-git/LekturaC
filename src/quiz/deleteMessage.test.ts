import { describe, expect, it } from 'vitest'
import { deleteQuizMessage } from './deleteMessage'

describe('deleteQuizMessage', () => {
  it('is a plain warning for an unused quiz', () => {
    expect(deleteQuizMessage('Volcanoes — quiz', { classes: 0, attempts: 0 })).toBe(
      "Delete “Volcanoes — quiz”? This can't be undone.",
    )
  })

  it('names the classes it is posted to', () => {
    expect(deleteQuizMessage('Q', { classes: 1, attempts: 0 })).toBe(
      "Delete “Q”? It's posted to 1 class. This can't be undone.",
    )
  })

  it('names the submissions that will be lost, with the classes', () => {
    expect(deleteQuizMessage('Q', { classes: 2, attempts: 12 })).toBe(
      "Delete “Q”? It's posted to 2 classes and 12 student submissions will be deleted with it. This can't be undone.",
    )
  })

  it('names a single submission even after the quiz was unposted', () => {
    expect(deleteQuizMessage('Q', { classes: 0, attempts: 1 })).toBe(
      "Delete “Q”? 1 student submission will be deleted with it. This can't be undone.",
    )
  })
})
