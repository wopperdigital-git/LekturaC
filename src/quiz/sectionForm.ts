import type { SectionRequest } from './sections'
import {
  DEFAULT_CONFIGS,
  MAX_QUIZ_SECTIONS,
  MAX_SECTION_INSTRUCTIONS,
  MAX_SECTION_TITLE,
  clampItemCount,
  defaultInstructions,
  defaultSectionTitle,
  type QuizConfig,
  type QuizType,
} from './types'

/*
  The quiz modal's test cards as pure state. Rules: 1–3 tests; a default title
  follows the test's position until the user types one; instructions follow
  the type and sub-option until the user edits them; each type remembers its
  own sub-option.
*/

export const DEFAULT_SECTION_COUNT = 10

export interface SectionDraft {
  /** Stable React key; never shown. */
  key: string
  configs: Record<QuizType, QuizConfig>
  type: QuizType
  count: number
  /** What the Items field shows; settled into `count` on commit. */
  countText: string
  title: string
  titleEdited: boolean
  instructions: string
  instructionsEdited: boolean
}

export type SectionAction =
  | { kind: 'add'; key: string }
  | { kind: 'remove'; index: number }
  | { kind: 'setType'; index: number; type: QuizType }
  | { kind: 'setConfig'; index: number; config: QuizConfig }
  | { kind: 'setCountText'; index: number; text: string }
  | { kind: 'commitCount'; index: number }
  | { kind: 'commitAll' }
  | { kind: 'setTitle'; index: number; title: string }
  | { kind: 'setInstructions'; index: number; text: string }

/** An integer within 1–20, or `null` when the text isn't a whole number. */
export function parseCount(text: string): number | null {
  if (!/^\s*\d+\s*$/.test(text)) return null
  return clampItemCount(Number(text))
}

export function sectionConfig(draft: SectionDraft): QuizConfig {
  return draft.configs[draft.type]
}

export function newSection(index: number, key: string): SectionDraft {
  const configs = { ...DEFAULT_CONFIGS }
  const type: QuizType = 'multiple_choice'
  return {
    key,
    configs,
    type,
    count: DEFAULT_SECTION_COUNT,
    countText: String(DEFAULT_SECTION_COUNT),
    title: defaultSectionTitle(index),
    titleEdited: false,
    instructions: defaultInstructions(configs[type]),
    instructionsEdited: false,
  }
}

function withDefaults(draft: SectionDraft, index: number): SectionDraft {
  return {
    ...draft,
    title: draft.titleEdited ? draft.title : defaultSectionTitle(index),
    instructions: draft.instructionsEdited ? draft.instructions : defaultInstructions(sectionConfig(draft)),
  }
}

export function committedCount(draft: SectionDraft): number {
  return parseCount(draft.countText) ?? draft.count
}

function commit(draft: SectionDraft): SectionDraft {
  const count = committedCount(draft)
  return { ...draft, count, countText: String(count) }
}

function update(state: SectionDraft[], index: number, change: (d: SectionDraft) => SectionDraft): SectionDraft[] {
  if (index < 0 || index >= state.length) return state
  return state.map((d, i) => (i === index ? change(d) : d))
}

export function sectionsReducer(state: SectionDraft[], action: SectionAction): SectionDraft[] {
  switch (action.kind) {
    case 'add':
      if (state.length >= MAX_QUIZ_SECTIONS) return state
      return [...state, newSection(state.length, action.key)]
    case 'remove':
      if (state.length <= 1 || action.index < 0 || action.index >= state.length) return state
      return state.filter((_, i) => i !== action.index).map(withDefaults)
    case 'setType':
      return update(state, action.index, (d) => withDefaults({ ...d, type: action.type }, action.index))
    case 'setConfig':
      return update(state, action.index, (d) =>
        withDefaults({ ...d, type: action.config.type, configs: { ...d.configs, [action.config.type]: action.config } }, action.index),
      )
    case 'setCountText':
      return update(state, action.index, (d) => ({ ...d, countText: action.text }))
    case 'commitCount':
      return update(state, action.index, commit)
    case 'commitAll':
      return state.map(commit)
    case 'setTitle':
      return update(state, action.index, (d) => ({ ...d, title: action.title, titleEdited: true }))
    case 'setInstructions':
      return update(state, action.index, (d) => ({ ...d, instructions: action.text, instructionsEdited: true }))
  }
}

export function totalItems(drafts: readonly SectionDraft[]): number {
  return drafts.reduce((n, d) => n + committedCount(d), 0)
}

/**
 * Does this action change what the user asked for? Tests written before a
 * failure are kept only while the form is unchanged; settling a count that was
 * already typed (a blur, or Generate's own commit) is not a change.
 */
export function changesForm(action: SectionAction): boolean {
  return action.kind !== 'commitCount' && action.kind !== 'commitAll'
}

/** What generation and saving use: trimmed, capped, a blank title replaced by the default. */
export function toSectionRequests(drafts: readonly SectionDraft[]): SectionRequest[] {
  return drafts.map((d, i) => {
    const title = d.title.trim().slice(0, MAX_SECTION_TITLE)
    return {
      count: committedCount(d),
      section: {
        config: sectionConfig(d),
        title: title || defaultSectionTitle(i),
        instructions: d.instructions.trim().slice(0, MAX_SECTION_INSTRUCTIONS),
      },
    }
  })
}
