/*
  The saved Intro and Outro text for a deck's narrated video (pure).

  `null` means never edited: the starter is used. `''` means the user cleared the box on
  purpose: no clip. The two must never be confused, or a cleared intro would come back.
*/

export interface Bookends {
  intro: string | null
  outro: string | null
}

export const EMPTY_BOOKENDS: Bookends = { intro: null, outro: null }

function field(o: Record<string, unknown>, key: 'intro' | 'outro'): string | null {
  const v = o[key]
  return typeof v === 'string' ? v : null
}

/** Reads the stored column; anything unexpected is "never edited". */
export function parseBookends(raw: unknown): Bookends {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...EMPTY_BOOKENDS }
  const o = raw as Record<string, unknown>
  return { intro: field(o, 'intro'), outro: field(o, 'outro') }
}

/** What is written back: `null` fields are dropped, `''` is kept. */
export function bookendsToRow(b: Bookends): Record<string, string> {
  const row: Record<string, string> = {}
  if (b.intro !== null) row.intro = b.intro
  if (b.outro !== null) row.outro = b.outro
  return row
}

export function starterIntro(title: string): string {
  const t = title.trim()
  return t ? `Hi! Today we're looking at ${t}. Let's get started.` : "Hi! Let's get started."
}

export function starterOutro(title: string): string {
  const t = title.trim()
  return t ? `That's all for ${t}. Thanks for watching!` : "That's all for today. Thanks for watching!"
}

/** The words to speak: the starter when never edited, else the stored text (maybe empty). */
export function bookendText(b: Bookends, end: 'intro' | 'outro', title: string): string {
  const stored = b[end]
  if (stored === null) return end === 'intro' ? starterIntro(title) : starterOutro(title)
  return stored.trim()
}

export const CLIP_PRICE_PER_SECOND = 0.03
export const MIN_BILLED_SECONDS = 3

/** Dollars for one clip: whole seconds rounded up, 3 s minimum, to the cent. */
export function clipCost(seconds: number): number {
  if (!(seconds > 0)) return 0
  const billed = Math.max(MIN_BILLED_SECONDS, Math.ceil(seconds))
  return Math.round(billed * CLIP_PRICE_PER_SECOND * 100) / 100
}

export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`
}

/** Minutes of processing to expect. The clips run in parallel, so the longer one sets it. */
export function waitMinutes(longestClipSeconds: number): { min: number; max: number } {
  return {
    min: Math.ceil((longestClipSeconds * 10) / 60),
    max: Math.ceil((longestClipSeconds * 30) / 60),
  }
}
