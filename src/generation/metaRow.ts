import type { SupabaseClient } from '@supabase/supabase-js'

/*
  The editor's read and write of `presentations.generation` for the fact check.

  Separate from `loadDeck` on purpose: `generation` is migration 0011, which does not gate
  opening a deck, so naming it in the deck's own select would break every deck on a project
  without it. Both calls are best effort: a failed read means no fact check, a failed write
  means a checked claim shows again next time. Neither touches card rows.
*/

/** The stored row, or `null` when there is none or it could not be read. */
export async function readGenerationRow(client: SupabaseClient, deckId: string): Promise<unknown> {
  try {
    const { data, error } = await client.from('presentations').select('generation').eq('id', deckId).maybeSingle()
    if (error) throw error
    return (data as { generation?: unknown } | null)?.generation ?? null
  } catch (err) {
    console.warn('[generation] could not read generation metadata (run migration 0011):', err)
    return null
  }
}

/** Writes the whole row back; `false` when it could not be saved. */
export async function writeGenerationRow(client: SupabaseClient, deckId: string, row: unknown): Promise<boolean> {
  try {
    const { error } = await client.from('presentations').update({ generation: row }).eq('id', deckId)
    if (error) throw error
    return true
  } catch (err) {
    console.warn('[generation] could not save the fact check:', err)
    return false
  }
}
