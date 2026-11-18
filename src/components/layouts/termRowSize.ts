import { itemStep } from '@/engine/composition'
import { SLIDE_SIZE } from '@/lib/theme-tokens'

/** The size of a run's meaning text: the lead size for a few short meanings, the body size otherwise. */
export const termTextSize = (texts: string[]): string =>
  itemStep(texts) === 'roomy' ? SLIDE_SIZE.lead : 'var(--slide-size-body)'
