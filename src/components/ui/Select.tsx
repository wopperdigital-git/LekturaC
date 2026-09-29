import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

export interface SelectOption<T extends string = string> {
  value: T
  label: string
  icon?: ReactNode
}

export function Select<T extends string = string>({
  options,
  value,
  onChange,
  ariaLabel,
  placeholder = 'Select…',
  className = '',
  disabled = false,
  size = 'md',
  align = 'left',
}: {
  options: SelectOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel?: string
  placeholder?: string
  className?: string
  disabled?: boolean
  size?: 'sm' | 'md'
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listboxRef = useRef<HTMLUListElement>(null)
  const listboxId = useId()

  const selectedOption = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return

    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  function handleTriggerClick() {
    if (disabled) return
    setOpen((prev) => {
      const next = !prev
      if (next) {
        const idx = options.findIndex((o) => o.value === value)
        setHighlightedIndex(idx >= 0 ? idx : 0)
      }
      return next
    })
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return

    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setOpen(true)
        const idx = options.findIndex((o) => o.value === value)
        setHighlightedIndex(idx >= 0 ? idx : 0)
      }
      return
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
        break
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev + 1) % options.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev - 1 + options.length) % options.length)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < options.length) {
          const opt = options[highlightedIndex]
          if (opt) {
            onChange(opt.value)
            setOpen(false)
            triggerRef.current?.focus()
          }
        }
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  function handleSelect(opt: SelectOption<T>) {
    onChange(opt.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const isSmall = size === 'sm'

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      className={`relative inline-block text-left ${open ? 'z-30' : 'z-10'} ${className}`}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={handleTriggerClick}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        className={`flex w-full cursor-pointer items-center justify-between rounded-app-sm border bg-app-surface/90 text-app-foreground shadow-2xs backdrop-blur-xs transition-all duration-150 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
          isSmall ? 'gap-2 px-2.5 py-1 text-xs font-medium' : 'gap-2.5 px-3 py-1.5 text-sm font-medium'
        } ${
          open
            ? 'border-app-accent ring-2 ring-app-accent/25'
            : 'border-app-border hover:border-app-border/90 hover:bg-app-surface focus-visible:border-app-accent focus-visible:ring-2 focus-visible:ring-app-accent/25'
        }`}
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          {selectedOption?.icon}
          <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        </span>
        <svg
          className={`shrink-0 text-app-muted transition-transform duration-200 ${
            isSmall ? 'size-3.5' : 'size-4'
          } ${open ? 'rotate-180 text-app-accent' : ''}`}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <ul
          id={listboxId}
          ref={listboxRef}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          className={`scrollbar-subtle absolute top-full mt-1.5 max-h-60 min-w-full w-max max-w-xs overflow-y-auto rounded-app-sm border border-app-border bg-app-surface/95 p-1 shadow-app backdrop-blur-md focus:outline-none ${
            align === 'right' ? 'right-0 left-auto' : 'left-0'
          }`}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value
            const isHighlighted = index === highlightedIndex

            return (
              <li
                key={option.value}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(option)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-[calc(var(--app-radius-sm)-2px)] transition-colors select-none ${
                  isSmall ? 'px-2 py-1 text-xs' : 'px-2.5 py-1.5 text-sm'
                } ${
                  isSelected
                    ? 'bg-app-accent/10 font-semibold text-app-accent-text dark:bg-app-accent/20'
                    : isHighlighted
                      ? 'bg-app-border/40 text-app-foreground'
                      : 'text-app-foreground hover:bg-app-border/25'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2 truncate">
                  {option.icon}
                  <span className="truncate">{option.label}</span>
                </span>
                {isSelected && (
                  <svg
                    className={`shrink-0 text-app-accent-text ${isSmall ? 'size-3' : 'size-3.5'}`}
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
                  </svg>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
