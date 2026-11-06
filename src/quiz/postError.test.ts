import { describe, expect, it } from 'vitest'
import { describePostFailure, POST_MIGRATION_MESSAGE } from './postError'

describe('describePostFailure', () => {
  it("names the migration when PostgREST can't find the mode column", () => {
    const err = { code: 'PGRST204', message: "Could not find the 'mode' column of 'quiz_classes' in the schema cache" }
    expect(describePostFailure(err)).toEqual(new Error(POST_MIGRATION_MESSAGE))
  })
  it('names the migration for Postgres undefined_column on mode', () => {
    expect(describePostFailure({ code: '42703', message: 'column "mode" of relation "quiz_classes" does not exist' })).toEqual(
      new Error(POST_MIGRATION_MESSAGE),
    )
    expect(describePostFailure({ message: 'column quiz_classes.mode does not exist' })).toEqual(new Error(POST_MIGRATION_MESSAGE))
  })
  it("leaves the trigger's refusals and other failures alone", () => {
    for (const message of [
      'Make the narrated video first.',
      'Students already started this as a lesson in that class.',
      'Failed to fetch',
      'new row violates row-level security policy for table "quiz_classes"',
    ]) {
      const err = { code: '23514', message }
      expect(describePostFailure(err)).toBe(err)
    }
  })
  it('does not blame the migration for a different missing column', () => {
    const err = { code: 'PGRST204', message: "Could not find the 'foo' column of 'quiz_classes' in the schema cache" }
    expect(describePostFailure(err)).toBe(err)
  })
  it('passes non-objects through', () => {
    expect(describePostFailure(null)).toBeNull()
    expect(describePostFailure('boom')).toBe('boom')
  })
})
