export const MIGRATION_MESSAGE = 'Run migration 0015 in Supabase.'

/** The parts of a Storage or PostgREST error this file looks at. Both libraries' errors fit. */
export interface PortError {
  message?: string
  code?: string
  statusCode?: string | number
}

/**
 * The message to show for a failed upload or record write. Only a missing bucket or column
 * says "run the migration": anything else (an expired session, a network drop) must not send
 * the user to their database. The raw error is logged by the caller, not shown.
 */
export function describeStorageFailure(err: PortError | null | undefined): string {
  const message = err?.message ?? ''
  if (/bucket not found/i.test(message)) return MIGRATION_MESSAGE
  // PGRST204: PostgREST "column not found in the schema cache". 42703: Postgres "undefined_column".
  if (err?.code === 'PGRST204' || err?.code === '42703') return MIGRATION_MESSAGE
  if (String(err?.statusCode) === '413' || /exceeded the maximum allowed size|payload too large/i.test(message)) {
    return 'The video is too large to store.'
  }
  return 'The video could not be saved. Try again.'
}
