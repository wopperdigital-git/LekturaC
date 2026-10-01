import type { GenerationStage } from '@/generation/pipeline'
import type { Progress } from '@/video/pipeline'
import { stageRows } from '@/video/ui'

/*
  What the panel's timeline says for each kind of job, and how full its bar is. Pure, so the
  wording and the order are pinned without a browser.
*/

export interface StageEntry {
  id: string
  label: string
  state: 'pending' | 'active' | 'done'
}

export interface TimelineReport {
  timeline: StageEntry[]
  progress: number
}

function entries(rows: { id: string; label: string }[], active: number): StageEntry[] {
  return rows.map((r, i) => ({ ...r, state: i < active ? 'done' : i === active ? 'active' : 'pending' }))
}

const DECK_PROGRESS: Record<GenerationStage | 'save', number> = {
  research: 0.08,
  write: 0.25,
  validate: 0.7,
  repair: 0.8,
  save: 0.95,
}

export function deckTimeline(stage: GenerationStage | 'save', repairSlides: number | null): TimelineReport {
  const rows = [
    { id: 'research', label: 'Researching sources' },
    { id: 'write', label: 'Writing slides' },
    { id: 'validate', label: 'Checking quality' },
  ]
  if (repairSlides !== null) {
    rows.push({ id: 'repair', label: `Tightening ${repairSlides} slide${repairSlides === 1 ? '' : 's'}` })
  }
  rows.push({ id: 'save', label: 'Saving' })
  return { timeline: entries(rows, rows.findIndex((r) => r.id === stage)), progress: DECK_PROGRESS[stage] }
}

export function quizTimeline(titles: readonly string[], at: number | 'save'): TimelineReport {
  const rows = [...titles.map((t, i) => ({ id: `test-${i}`, label: `Writing ${t}` })), { id: 'save', label: 'Saving' }]
  const active = at === 'save' ? titles.length : at
  return { timeline: entries(rows, active), progress: active / rows.length }
}

/** Share of the bar each video stage fills, in order: narrating, rendering, encoding, uploading. */
const VIDEO_SPANS = [0.4, 0.4, 0.1, 0.1]

export function videoTimeline(p: Progress | null): TimelineReport {
  const rows = stageRows(p)
  const timeline: StageEntry[] = rows.map((r) => ({
    id: r.stage,
    label: r.detail ? `${r.label} ${r.detail}` : r.label,
    state: r.state,
  }))
  if (!p) return { timeline: timeline.map((e, i) => (i === 0 ? { ...e, state: 'active' } : e)), progress: 0 }
  const index = rows.findIndex((r) => r.stage === p.stage)
  const before = VIDEO_SPANS.slice(0, index).reduce((a, b) => a + b, 0)
  const within = p.total > 0 ? Math.min(1, p.done / p.total) : 0
  return { timeline, progress: before + VIDEO_SPANS[index] * within }
}
