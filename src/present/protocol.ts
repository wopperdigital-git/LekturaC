import { z } from 'zod'
import type { Card } from '@/engine/contentBlocks'
import type { TextStyle } from '@/engine/textStyle'
import type { ThemeTokens } from '@/lib/theme-tokens'
import type { PresenterAction } from './presenterState'

// Messages between the presenter console and the slide window, both windows of
// this app, over a BroadcastChannel named by the session.

export const SLIDE_WINDOW_NAME = 'lekturac-slides'
export const ALIVE_INTERVAL_MS = 1000
export const SILENCE_MS = 3000
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
