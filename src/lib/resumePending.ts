import type { DetailLevel } from '@/ai/detailLevel'
import type { StepKey } from './briefDrafts'
import { parseSlideCount } from './slideCount'

/** Where a resumed draft's `pendingText` lands on the one-sheet brief. */
export interface RestoredPending {
  topic?: string
  slideCount?: number | 'auto'
  audience?: string
  detailLevel?: DetailLevel
  guidance?: string
}

const DETAIL_LEVELS: readonly DetailLevel[] = ['simplified', 'balanced', 'detailed']

/**
 * Drafts saved by the old one-question-at-a-time brief kept the text typed
 * into the open question as `pendingText`. The sheet's text fields take it as
 * it is; a chip field (slide count, detail level) takes it only when it reads
 * as one of its options, and otherwise it goes to the guidance box, so the
 * user's words are never dropped (the sheet's autosave would otherwise
 * overwrite the stored draft without them).
 */
export function restorePending(step: StepKey | null, text: string): RestoredPending {
  const trimmed = text.trim()
  if (step === null || trimmed === '') return {}
  switch (step) {
    case 'topic':
      return { topic: text }
    case 'audience':
      return { audience: text }
    case 'guidance':
      return { guidance: text }
    case 'slideCount': {
      if (/^(auto|let ai decide)$/i.test(trimmed)) return { slideCount: 'auto' }
      const count = parseSlideCount(trimmed)
      return count === null ? { guidance: text } : { slideCount: count }
    }
    case 'detailLevel': {
      const level = DETAIL_LEVELS.find((l) => l === trimmed.toLowerCase())
      return level ? { detailLevel: level } : { guidance: text }
    }
  }
}
