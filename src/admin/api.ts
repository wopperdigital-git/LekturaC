import { db } from '@/classroom/api'
import { parseAdminOverview, type AdminOverview, type RangeKey } from './overview'

/*
  Every admin read (migrations 0019/0020). The admin flag itself is read at sign-in
  beside the profile (`authStore.isAdmin`); this is the page's data.
*/

/** The site-wide counts. Throws (for the page's Retry) when the call fails. */
export async function loadAdminOverview(range: RangeKey): Promise<AdminOverview> {
  const client = await db()
  const { data, error } = await client.rpc('admin_overview', { p_range: range })
  if (error) {
    const code = (error as { code?: string }).code
    if (code === 'PGRST202') throw new Error('Run migration 0020 in Supabase.')
    throw error
  }
  return parseAdminOverview(data)
}
