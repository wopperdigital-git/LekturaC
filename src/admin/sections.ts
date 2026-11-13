/*
  The admin page's sections, one per rail link (`/admin/<id>`), so each view
  is short instead of one long scroll. Pure, shared by the rail and the page.
*/

export const ADMIN_SECTIONS = [
  { id: 'people', label: 'People', blurb: 'Accounts, activity and how far people get.' },
  { id: 'decks', label: 'Decks', blurb: 'Decks made, when, and how long they are.' },
  { id: 'quality', label: 'AI quality', blurb: 'Research, quality flags and fact checking on AI-made decks.' },
  { id: 'classroom', label: 'Classroom', blurb: 'Classes, quizzes, lessons and scores.' },
  { id: 'voice', label: 'Voice', blurb: 'Recorded voices and saved voice setups.' },
] as const

export type AdminSectionId = (typeof ADMIN_SECTIONS)[number]['id']

export const DEFAULT_ADMIN_SECTION: AdminSectionId = 'people'

export function adminPath(id: AdminSectionId): string {
  return `/admin/${id}`
}

/** The section a URL names, or `null` for anything else. */
export function parseAdminSection(value: string | undefined): AdminSectionId | null {
  return ADMIN_SECTIONS.find((s) => s.id === value)?.id ?? null
}
