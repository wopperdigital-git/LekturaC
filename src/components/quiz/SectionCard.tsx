import { useEffect, useRef } from 'react'
import { Field, Input, LABEL_CLASSES, Textarea } from '@/components/ui/Input'
import { Radios } from './Radios'
import {
  committedCount,
  sectionConfig,
  type SectionAction,
  type SectionDraft,
} from '@/quiz/sectionForm'
import {
  MAX_QUIZ_ITEMS,
  MAX_QUIZ_SECTIONS,
  MAX_SECTION_INSTRUCTIONS,
  MAX_SECTION_TITLE,
  MIN_QUIZ_ITEMS,
  defaultSectionTitle,
  type QuizType,
} from '@/quiz/types'
import { prefersReducedMotion } from '@/lib/motion'

const TYPE_OPTIONS: { value: QuizType; label: string }[] = [
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'fill_blank', label: 'Fill in the blank' },
  { value: 'true_false', label: 'True or False' },
]

/** What the type's own sub-option is called, so the caption says what it controls. */
const OPTION_LABEL: Record<QuizType, string> = {
  multiple_choice: 'Choices',
  fill_blank: 'Word box',
  true_false: 'Answer format',
}

/** Marks each card's title box, so the list can move focus to it after an add or a remove. */
const TITLE_ATTR = 'data-test-title'

const STEP_CLASSES =
  'grid size-9 shrink-0 cursor-pointer place-items-center rounded-app-sm border-[1.5px] border-app-foreground bg-app-background text-app-foreground transition-colors hover:bg-app-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-40'

function StepGlyph({ plus }: { plus: boolean }) {
  return (
    <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M3.5 8h9" />
      {plus && <path d="M8 3.5v9" />}
    </svg>
  )
}

/** One test of the quiz being created: title, type, its sub-option, items and instructions. */
function SectionCard({
  draft,
  index,
  canRemove,
  dispatch,
  onRemove,
  disabled,
}: {
  draft: SectionDraft
  index: number
  canRemove: boolean
  dispatch: (action: SectionAction) => void
  onRemove: () => void
  disabled: boolean
}) {
  const config = sectionConfig(draft)
  const name = draft.title.trim() || defaultSectionTitle(index)
  const count = committedCount(draft)

  return (
    <li className="rounded-app border border-app-border bg-app-surface/30 p-4">
      {/* The header: a number, then the title as an inline-editable heading (its border shows on hover and focus). */}
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="grid size-7 shrink-0 place-items-center rounded-full bg-app-foreground text-xs font-bold tabular-nums text-app-background"
        >
          {index + 1}
        </span>
        <div className="group relative min-w-0 flex-1">
          <Input
            {...{ [TITLE_ATTR]: '' }}
            aria-label={`Test ${index + 1} title`}
            placeholder={defaultSectionTitle(index)}
            value={draft.title}
            maxLength={MAX_SECTION_TITLE}
            disabled={disabled}
            onChange={(e) => dispatch({ kind: 'setTitle', index, title: e.target.value })}
            className="!border-transparent !bg-transparent !pl-2 pr-9 !text-base font-semibold hover:!border-app-border focus:!border-app-foreground focus:!bg-app-background"
          />
          <svg
            className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-app-muted opacity-60 transition-opacity group-focus-within:opacity-0"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10.5 2.5l3 3L6 13H3v-3l7.5-7.5z" />
          </svg>
        </div>
        {canRemove && (
          <button
            type="button"
            aria-label={`Remove ${name}`}
            title="Remove test"
            disabled={disabled}
            onClick={onRemove}
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-app-muted transition-colors hover:bg-app-danger/10 hover:text-app-danger-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2.5 4.5h11M6.5 4.5V3h3v1.5M4 4.5l.7 8.5h6.6l.7-8.5M6.75 7v3.5M9.25 7v3.5" />
            </svg>
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <div>
            <p className={LABEL_CLASSES}>Type</p>
            <Radios
              label={`${name} type`}
              value={draft.type}
              options={TYPE_OPTIONS}
              onChange={(type) => dispatch({ kind: 'setType', index, type })}
              disabled={disabled}
            />
          </div>
          <div>
            <p className={LABEL_CLASSES}>{OPTION_LABEL[config.type]}</p>
            {config.type === 'multiple_choice' && (
              <Radios
                label={`${name} number of choices`}
                value={String(config.choiceCount)}
                options={[
                  { value: '3', label: 'A–C' },
                  { value: '4', label: 'A–D' },
                ]}
                onChange={(v) =>
                  dispatch({ kind: 'setConfig', index, config: { type: 'multiple_choice', choiceCount: v === '3' ? 3 : 4 } })
                }
                disabled={disabled}
              />
            )}
            {config.type === 'fill_blank' && (
              <Radios
                label={`${name} word box`}
                value={config.wordBox ? 'box' : 'none'}
                options={[
                  { value: 'none', label: 'No word box' },
                  { value: 'box', label: 'Word box' },
                ]}
                onChange={(v) => dispatch({ kind: 'setConfig', index, config: { type: 'fill_blank', wordBox: v === 'box' } })}
                disabled={disabled}
              />
            )}
            {config.type === 'true_false' && (
              <Radios
                label={`${name} answer notation`}
                value={config.notation}
                options={[
                  { value: 'word', label: 'TRUE / FALSE' },
                  { value: 'letter', label: 'T / F' },
                ]}
                onChange={(v) => dispatch({ kind: 'setConfig', index, config: { type: 'true_false', notation: v } })}
                disabled={disabled}
              />
            )}
          </div>
        </div>

        <Field
          label="Items"
          hint={`${MIN_QUIZ_ITEMS}–${MAX_QUIZ_ITEMS}`}
          render={(fieldProps) => (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className={STEP_CLASSES}
                aria-label={`Fewer ${name} items`}
                disabled={disabled || count <= MIN_QUIZ_ITEMS}
                onClick={() => dispatch({ kind: 'stepCount', index, by: -1 })}
              >
                <StepGlyph plus={false} />
              </button>
              <Input
                {...fieldProps}
                aria-label={`${name} items`}
                inputMode="numeric"
                autoComplete="off"
                value={draft.countText}
                disabled={disabled}
                className="!w-14 text-center tabular-nums"
                onChange={(e) => dispatch({ kind: 'setCountText', index, text: e.target.value })}
                onBlur={() => dispatch({ kind: 'commitCount', index })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    dispatch({ kind: 'commitCount', index })
                  } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault()
                    dispatch({ kind: 'stepCount', index, by: e.key === 'ArrowUp' ? 1 : -1 })
                  }
                }}
              />
              <button
                type="button"
                className={STEP_CLASSES}
                aria-label={`More ${name} items`}
                disabled={disabled || count >= MAX_QUIZ_ITEMS}
                onClick={() => dispatch({ kind: 'stepCount', index, by: 1 })}
              >
                <StepGlyph plus />
              </button>
            </div>
          )}
        />
      </div>

      <div className="mt-4">
        <Field
          label="Instructions"
          render={(p) => (
            <Textarea
              id={p.id}
              aria-label={`${name} instructions`}
              aria-describedby={p['aria-describedby']}
              rows={2}
              value={draft.instructions}
              maxLength={MAX_SECTION_INSTRUCTIONS}
              disabled={disabled}
              onChange={(e) => dispatch({ kind: 'setInstructions', index, text: e.target.value })}
            />
          )}
        />
      </div>
    </li>
  )
}

/**
 * Every test card, then Add test. After an add, the new card scrolls into view
 * with its title focused; after a remove, focus goes to the card before it (or
 * the new first card), so it never falls back to the page.
 */
export function SectionList({
  drafts,
  dispatch,
  onAdd,
  disabled,
}: {
  drafts: SectionDraft[]
  dispatch: (action: SectionAction) => void
  onAdd: () => void
  disabled: boolean
}) {
  const full = drafts.length >= MAX_QUIZ_SECTIONS
  const listRef = useRef<HTMLOListElement | null>(null)
  const lastLength = useRef(drafts.length)
  /** Which card's title takes focus after the next remove. */
  const focusAfterRemove = useRef(0)

  useEffect(() => {
    const before = lastLength.current
    lastLength.current = drafts.length
    if (drafts.length === before) return
    const titles = listRef.current?.querySelectorAll<HTMLInputElement>(`[${TITLE_ATTR}]`)
    if (!titles || titles.length === 0) return
    const target = drafts.length > before ? titles[titles.length - 1] : titles[Math.min(focusAfterRemove.current, titles.length - 1)]
    target.focus({ preventScroll: true })
    target.closest('li')?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [drafts.length])

  return (
    <div>
      <ol ref={listRef} className="space-y-3">
        {drafts.map((draft, index) => (
          <SectionCard
            key={draft.key}
            draft={draft}
            index={index}
            canRemove={drafts.length > 1}
            dispatch={dispatch}
            onRemove={() => {
              focusAfterRemove.current = Math.max(0, index - 1)
              dispatch({ kind: 'remove', index })
            }}
            disabled={disabled}
          />
        ))}
      </ol>
      <button
        type="button"
        disabled={disabled || full}
        onClick={onAdd}
        className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-app border-[1.5px] border-dashed border-app-border py-3 text-sm font-bold text-app-muted transition-colors hover:border-app-foreground hover:text-app-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:hover:border-app-border disabled:hover:text-app-muted"
      >
        {full ? (
          <span className="font-medium">A quiz holds at most {MAX_QUIZ_SECTIONS} tests</span>
        ) : (
          <>
            <StepGlyph plus />
            Add test
          </>
        )}
      </button>
    </div>
  )
}
