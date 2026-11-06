export const POST_MIGRATION_MESSAGE = 'Run migration 0018 in Supabase.'

/** The parts of a PostgREST error this file looks at. */
export interface PostError {
  message?: string
  code?: string
}

/**
 * What to throw for a failed `quiz_classes` insert that asked for a lesson. A project without
 * migration 0018 has no `mode` column, and PostgREST says so in its own words (PGRST204 "could
 * not find the 'mode' column in the schema cache", or Postgres 42703 "column ... does not
 * exist"); that becomes a sentence that names the fix. Any other error (the trigger's refusals,
 * a dropped connection) is returned untouched.
 */
export function describePostFailure(err: unknown): unknown {
  if (!err || typeof err !== 'object') return err
  const { message = '', code } = err as PostError
  const namesMode = /\bmode\b/i.test(message)
  const missingColumn = code === 'PGRST204' || code === '42703' || /schema cache|does not exist/i.test(message)
  return namesMode && missingColumn ? new Error(POST_MIGRATION_MESSAGE) : err
}
