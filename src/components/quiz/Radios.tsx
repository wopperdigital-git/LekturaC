import type { KeyboardEvent } from 'react'

export interface RadioOption<T extends string> {
  value: T
  label: string
}

/** A small exclusive choice, drawn as chips. Arrow keys move between options like a native radio group. */
export function Radios<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string
  value: T
  options: RadioOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
}) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (step === 0 || disabled) return
    e.preventDefault()
    const at = options.findIndex((o) => o.value === value)
    const next = options[(at + step + options.length) % options.length]
    onChange(next.value)
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    buttons[(at + step + options.length) % options.length]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const checked = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`cursor-pointer rounded-app-sm border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-50 ${
              checked
                ? 'border-app-accent bg-app-accent/15 text-app-accent-text'
                : 'border-app-border bg-app-surface text-app-foreground hover:bg-app-border/40'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
