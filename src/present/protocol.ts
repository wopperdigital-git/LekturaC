import { z } from 'zod'
import type { Card } from '@/engine/contentBlocks'
import { parseOverlay, type Stroke } from '@/engine/overlay'
import type { TextStyle } from '@/engine/textStyle'
import type { ThemeTokens } from '@/lib/theme-tokens'
import type { PresenterAction } from './presenterState'
import { parseLiveInk, type LiveInk } from './liveInk'

// Messages between the presenter console and the slide window, both windows of
// this app, over a BroadcastChannel named by the session.

export const SLIDE_WINDOW_NAME = 'lekturac-slides'
export const ALIVE_INTERVAL_MS = 1000
export const SILENCE_MS = 3000
/** A new slide window loads the app and resolves the session before its first hello. */
export const CONNECT_GRACE_MS = 10000
export const ORPHAN_AFTER_MS = 3000

export interface DeckSnapshot {
  title: string
  theme: ThemeTokens
  textStyle: TextStyle
  cards: Card[] // sorted
}

export type ForwardedKey = PresenterAction | { type: 'digit'; digit: string } | { type: 'enter' }

export interface ShownState {
  index: number
  black: boolean
  ended: boolean
}

export type ConsoleMessage =
  | { type: 'ping' }
  | { type: 'deck'; deck: DeckSnapshot }
  | ({ type: 'state' } & ShownState)
  | { type: 'bye' }
  | { type: 'end' }
  /** Every slide's finished ink, after each change. */
  | { type: 'ink'; ink: LiveInk }
  /** The stroke being drawn right now on `cardId`; `null` once it is finished or abandoned. */
  | { type: 'inkLive'; cardId: string; stroke: Stroke | null }
  /** Where the laser pointer is on `cardId`; `null` when it leaves the slide. */
  | { type: 'laser'; cardId: string; point: [number, number] | null }

export type ScreenMessage =
  | { type: 'hello' }
  | { type: 'alive' }
  | { type: 'key'; key: ForwardedKey }
  | { type: 'bye' }

const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('next') }),
  z.object({ type: z.literal('prev') }),
  z.object({ type: z.literal('first') }),
  z.object({ type: z.literal('last') }),
  z.object({ type: z.literal('goto'), index: z.number() }),
  z.object({ type: z.literal('toggleBlack') }),
])

const keySchema = z.union([
  actionSchema,
  z.object({ type: z.literal('digit'), digit: z.string().regex(/^[0-9]$/) }),
  z.object({ type: z.literal('enter') }),
])

// Only this app's own windows post here, so the deck is checked shallowly.
const deckSchema = z.object({
  title: z.string(),
  theme: z.object({}).passthrough(),
  textStyle: z.object({}).passthrough(),
  cards: z.array(z.object({ id: z.string(), orderIndex: z.number() }).passthrough()),
})

const consoleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ping') }),
  z.object({ type: z.literal('deck'), deck: deckSchema }),
  z.object({
    type: z.literal('state'),
    index: z.number(),
    black: z.boolean(),
    ended: z.boolean(),
  }),
  z.object({ type: z.literal('bye') }),
  z.object({ type: z.literal('end') }),
  // Ink is drawn from these, so each stroke is checked like a stored one.
  z.object({ type: z.literal('ink'), ink: z.unknown().transform(parseLiveInk) }),
  z.object({
    type: z.literal('inkLive'),
    cardId: z.string(),
    stroke: z.unknown().transform((raw, ctx) => {
      if (raw === null) return null
      const item = parseOverlay([raw])?.[0]
      if (item?.kind === 'stroke') return item
      ctx.addIssue({ code: 'custom', message: 'not a stroke' })
      return z.NEVER
    }),
  }),
  z.object({
    type: z.literal('laser'),
    cardId: z.string(),
    point: z.tuple([z.number().refine(Number.isFinite), z.number().refine(Number.isFinite)]).nullable(),
  }),
])

const screenSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello') }),
  z.object({ type: z.literal('alive') }),
  z.object({ type: z.literal('key'), key: keySchema }),
  z.object({ type: z.literal('bye') }),
])

export function parseConsoleMessage(data: unknown): ConsoleMessage | null {
  const parsed = consoleSchema.safeParse(data)
  return parsed.success ? (parsed.data as ConsoleMessage) : null
}

export function parseScreenMessage(data: unknown): ScreenMessage | null {
  const parsed = screenSchema.safeParse(data)
  return parsed.success ? (parsed.data as ScreenMessage) : null
}

export function channelName(session: string): string {
  return `lekturac:present:${session}`
}

export function screenUrl(deckId: string, session: string): string {
  return `/deck/${encodeURIComponent(deckId)}/present?view=screen&session=${encodeURIComponent(session)}`
}

export function consoleUrl(deckId: string, session: string, start: number): string {
  return `/deck/${encodeURIComponent(deckId)}/present?view=presenter&session=${encodeURIComponent(session)}&start=${start}`
}

export type PresentParams =
  | { view: 'single' }
  | { view: 'presenter'; session: string | null; start: number }
  | { view: 'screen'; session: string | null }

export function parsePresentParams(search: string): PresentParams {
  const params = new URLSearchParams(search)
  const view = params.get('view')
  const session = params.get('session')
  if (view === 'presenter') {
    const start = Number(params.get('start'))
    return {
      view: 'presenter',
      session,
      start: Number.isInteger(start) && start >= 0 ? start : 0,
    }
  }
  if (view === 'screen') return { view: 'screen', session }
  return { view: 'single' }
}

export type ScreenLink = 'connecting' | 'open' | 'closed' | 'blocked'

/**
 * The console's once-a-second verdict on the slide window. Connecting gets a longer
 * grace (counted from the open click) than an open window's silence, because a
 * window still loading cannot post yet. `blocked` and `closed` only change by an
 * explicit event (a click, a hello, a bye).
 */
export function nextScreenLink(
  link: ScreenLink,
  now: number,
  lastHeardAt: number | null,
  connectingSince: number,
): ScreenLink {
  if (link === 'connecting') return now - connectingSince > CONNECT_GRACE_MS ? 'closed' : link
  if (link === 'open') return lastHeardAt !== null && now - lastHeardAt > SILENCE_MS ? 'closed' : link
  return link
}
