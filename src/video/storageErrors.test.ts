import { describe, expect, it } from 'vitest'
import { MIGRATION_MESSAGE, describeStorageFailure } from './storageErrors'

describe('describeStorageFailure', () => {
  it('tells you to run the migration when the bucket is missing', () => {
    expect(describeStorageFailure({ message: 'Bucket not found', statusCode: '404' })).toBe(MIGRATION_MESSAGE)
  })

  it('tells you to run the migration when presentations has no video column', () => {
    expect(describeStorageFailure({ code: 'PGRST204', message: "Could not find the 'video' column of 'presentations'" })).toBe(MIGRATION_MESSAGE)
    expect(describeStorageFailure({ code: '42703', message: 'column "video" of relation "presentations" does not exist' })).toBe(MIGRATION_MESSAGE)
  })

  it('says when the file is too big', () => {
    expect(describeStorageFailure({ message: 'The object exceeded the maximum allowed size', statusCode: '413' })).toMatch(/too large/i)
  })

  it('does not blame the migration for an unrelated error', () => {
    const text = describeStorageFailure({ message: 'JWT expired', statusCode: '401' })
    expect(text).not.toBe(MIGRATION_MESSAGE)
    expect(text).toMatch(/could not be saved/i)
  })

  it('has a message even with nothing to go on', () => {
    expect(describeStorageFailure(null)).toMatch(/could not be saved/i)
    expect(describeStorageFailure(undefined)).toMatch(/could not be saved/i)
  })
})
