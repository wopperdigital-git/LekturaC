import type { ReactNode } from 'react'
import { CheckIcon, PencilIcon } from './icons'

/**
 * One turn of the brief.
 *
 * `active` is the question currently being answered — it gets the prominent
 * card treatment. Everything already answered collapses to a compact
 * question/value row, so the history reads as accumulated context rather than
 * as a stack of form fields.
 *
 * The active step is not necessarily the last one: editing an earlier answer
 * makes that step active again while the answers below it stay collapsed.
 */
export function StepBlock({
  active,
  question,
  hint,
  questionId,
  children,
}: {
  active: boolean
  question: string
  hint?: string
  questionId?: string
  children: ReactNode
}) {
  if (!active) {
    return (
      <div className="flex items-center justify-between gap-4 py-1.5">
        <p id={questionId} className="min-w-0 truncate text-sm text-app-muted">
          {question}
        </p>
        <div className="flex min-w-0 max-w-[60%] shrink-0 justify-end">{children}</div>
      </div>
    )
  }

  return (
    <div className="create-step-in mt-3 rounded-app border border-app-accent/40 bg-app-surface/50 p-4 sm:p-5">
      <h2 id={questionId} className="text-base font-semibold text-app-foreground">
        {question}
      </h2>
      {hint && <p className="mt-1 text-sm text-app-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </div>
  )
}

/**
 * A settled answer, styled as a configuration value rather than a chat message.
 *
 * The edit control lives inside the pill so it reads as attached to the value,
 * and it is only faded out (never unmounted or `hidden`) so it stays in the tab
 * order and causes no layout shift on hover.
 */
export function AnswerPill({
  children,
  onEdit,
  editLabel,
}: {
  children: ReactNode
  onEdit?: () => void
  editLabel: string
}) {
  return (
    <div className="group flex min-w-0 items-center rounded-full border border-app-border bg-app-surface py-1 pl-3 text-sm text-app-foreground transition-colors hover:border-app-accent/40 has-[:focus-visible]:border-app-accent/40">
      <CheckIcon className="mr-1.5 size-3.5 shrink-0 text-app-accent-text" />
      <span className="min-w-0 truncate">{children}</span>
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label={editLabel}
          className="ml-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-app-muted opacity-0 transition-[opacity,color] duration-150 group-hover:opacity-100 hover:text-app-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent"
        >
          <PencilIcon />
        </button>
      ) : (
        <span className="w-3" />
      )}
    </div>
  )
}

/**
 * Selectable option cards for the fixed-choice steps.
 *
 * Kept as plain toggle buttons with `aria-pressed` (rather than a
 * `radiogroup`/`radio` pairing) because a real radiogroup is expected to
 * implement roving-tabindex arrow-key navigation — declaring the role without
 * that behaviour would be a regression over the current markup.
 */
export function OptionCards<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { value: T; label: string; description: string }[]
  selected?: T | null
  onSelect: (value: T) => void
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((opt) => {
        const isSelected = selected === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSelect(opt.value)}
            aria-pressed={isSelected}
            className={`cursor-pointer rounded-app-sm border p-3 text-left transition-[background-color,border-color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${
              isSelected
                ? 'border-app-accent bg-app-accent/10'
                : 'border-app-border bg-app-background hover:border-app-accent/50 hover:bg-app-surface/70'
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-app-foreground">{opt.label}</span>
              {isSelected && <CheckIcon className="size-4 shrink-0 text-app-accent-text" />}
            </span>
            <span className="mt-0.5 block text-xs text-app-muted">{opt.description}</span>
          </button>
        )
      })}
    </div>
  )
}
