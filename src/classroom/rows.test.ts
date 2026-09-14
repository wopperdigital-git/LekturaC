import { describe, expect, it } from 'vitest'
import { announcementFromRow, attemptFromRow, classFromRow, memberFromRow, personFromRow, postingFromRow, quizFromRow } from './rows'

describe('row mapping', () => {
  it('maps a class, defaulting a null description to empty', () => {
    expect(
      classFromRow({
        id: 'c1',
        teacher_id: 't1',
        name: 'Biology',
        description: null,
        join_code: 'QWERT9',
        created_at: '2026-09-01T00:00:00+00:00',
      }),
    ).toEqual({ id: 'c1', teacherId: 't1', name: 'Biology', description: '', joinCode: 'QWERT9', createdAt: '2026-09-01T00:00:00+00:00' })
  })

  it('maps a person with missing name and email to empty strings', () => {
    expect(personFromRow({ id: 'p1', display_name: null, email: null })).toEqual({ id: 'p1', displayName: '', email: '' })
  })

  it('keeps a quiz whose deck was deleted, and collects cited slides', () => {
    expect(
      quizFromRow({
        id: 'q1',
        title: 'Cells quiz',
        deck_title: 'Cells',
        presentation_id: null,
        created_at: '2026-09-02T00:00:00+00:00',
        quiz_questions: [{ slide_number: 2 }, { slide_number: 3 }],
      }),
    ).toEqual({ id: 'q1', title: 'Cells quiz', deckTitle: 'Cells', presentationId: null, createdAt: '2026-09-02T00:00:00+00:00', slideNumbers: [2, 3] })
  })

  it('treats absent embedded questions as no slides', () => {
    expect(
      quizFromRow({ id: 'q1', title: 't', deck_title: 'd', presentation_id: 'p1', created_at: 'x', quiz_questions: null }).slideNumbers,
    ).toEqual([])
  })

  it('reads a numeric score that arrives as a string', () => {
    expect(
      attemptFromRow({ quiz_id: 'q1', class_id: 'c1', student_id: 's1', score: '0.85', submitted_at: 'x' }).score,
    ).toBe(0.85)
  })

  it('maps members, postings and announcements', () => {
    expect(memberFromRow({ class_id: 'c1', student_id: 's1', joined_at: 'j' })).toEqual({ classId: 'c1', studentId: 's1', joinedAt: 'j' })
    expect(postingFromRow({ quiz_id: 'q1', class_id: 'c1', posted_at: 'p' })).toEqual({ quizId: 'q1', classId: 'c1', postedAt: 'p' })
    expect(
      announcementFromRow({ id: 'a1', class_id: 'c1', title: 'Hi', body: null, created_at: 'c', updated_at: 'u' }),
    ).toEqual({ id: 'a1', classId: 'c1', title: 'Hi', body: '', createdAt: 'c', updatedAt: 'u' })
  })
})
