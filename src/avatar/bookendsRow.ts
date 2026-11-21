import type { SupabaseClient } from '@supabase/supabase-js'

/*
  The editor's read and write of `presentations.bookends` (migration 0021).

  Separate from `loadDeck` on purpose, like `generation/metaRow.ts`: the column gates only
  the talking intro and outro, so naming it in the deck's own select would break every deck
  on a project without the migration. Both calls are best effort and never touch card rows.
*/

/** The stored row, or `null` when there is none or it could not be read. */
export async function readBookendsRow(client: SupabaseClient, deckId: string): Promise<unknown> {
  try {
    const { data, error } = await client.from('presentations').select('bookends').eq('id', deckId).maybeSingle()
    if (error) throw error
    return (data as { bookends?: unknown } | null)?.bookends ?? null
  } catch (err) {
    console.warn('[avatar] could not read the intro and outro (run migration 0021):', err)
    return null
  }
}

/** Writes the whole row back; `false` when it could not be saved. */
export async function writeBookendsRow(
  client: SupabaseClient,
  deckId: string,
  row: Record<string, string>,
): Promise<boolean> {
  try {
    const { error } = await client.from('presentations').update({ bookends: row }).eq('id', deckId)
    if (error) throw error
    return true
  } catch (err) {
    console.warn('[avatar] could not save the intro and outro (run migration 0021):', err)
    return false
  }
}
