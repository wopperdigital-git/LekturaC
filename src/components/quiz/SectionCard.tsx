import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Radios } from './Radios'
import {
  sectionConfig,
  totalItems,
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

const TYPE_OPTIONS: { value: QuizType; label: string }[] = [
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'fill_blank', label: 'Fill in the blank' },
  { value: 'true_false', label: 'True or False' },
]

/** One test of the quiz being created: title, type, its sub-option, items and instructions. */
function SectionCard({
  draft,
  index,
  canRemove,
  dispatch,
  disabled,
}: {
  draft: SectionDraft
  index: number
  canRemove: boolean
  dispatch: (action: SectionAction) => void
  disabled: boolean
}) {
  const config = sectionConfig(draft)
  const name = draft.title.trim() || defaultSectionTitle(index)

  return (
    <li className="rounded-app border border-app-border bg-app-surface/30 p-4">
      <div className="flex items-center gap-2">
        <Input
          aria-label={`Test ${index + 1} title`}
          value={draft.title}
          maxLength={MAX_SECTION_TITLE}
          disabled={disabled}
          onChange={(e) => dispatch({ kind: 'setTitle', index, title: e.target.value })}
          className="font-semibold"
        />
        {canRemove && (
          <Button
            variant="secondary"
            className="shrink-0 !px-2.5 !py-1.5 text-xs"
            aria-label={`Remove ${name}`}
            disabled={disabled}
            onClick={() => dispatch({ kind: 'remove', index })}
          >
            Remove
          </Button>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-medium text-app-muted">Type</p>
            <Radios
              label={`${name} type`}
              value={draft.type}
              options={TYPE_OPTIONS}
              onChange={(type) => dispatch({ kind: 'setType', index, type })}
              disabled={disabled}
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-app-muted">Options</p>
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

        <div className="w-24">
          <Field
            label="Items"
            hint={`${MIN_QUIZ_ITEMS}–${MAX_QUIZ_ITEMS}`}
            render={(fieldProps) => (
              <Input
                {...fieldProps}
                inputMode="numeric"
                autoComplete="off"
                value={draft.countText}
                disabled={disabled}
                onChange={(e) => dispatch({ kind: 'setCountText', index, text: e.target.value })}
                onBlur={() => dispatch({ kind: 'commitCount', index })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    dispatch({ kind: 'commitCount', index })
                  }
                }}
              />
            )}
          />
        </div>
      </div>

      <div className="mt-4">
        <Field
          label="Instructions"
          render={(p) => (
            <Textarea
              id={p.id}
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

/** Every test card, then Add test and the running total. */
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
  const total = totalItems(drafts)
  return (
    <div>
      <ol className="space-y-3">
        {drafts.map((draft, index) => (
          <SectionCard
            key={draft.key}
            draft={draft}
            index={index}
            canRemove={drafts.length > 1}
            dispatch={dispatch}
            disabled={disabled}
          />
        ))}
      </ol>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Button
          variant="secondary"
          disabled={disabled || full}
          title={full ? `A quiz has at most ${MAX_QUIZ_SECTIONS} tests` : undefined}
          onClick={onAdd}
        >
          + Add test
        </Button>
        <p className="text-xs text-app-muted">
          {drafts.length} {drafts.length === 1 ? 'test' : 'tests'} · {total} items
        </p>
      </div>
    </div>
  )
}
