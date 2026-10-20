import type { ButtonHTMLAttributes } from 'react'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT_CLASSES: Record<Variant, string> = {
  // Ink on the signal orange; the programme's one "act here" fill.
  primary:
    'border-[1.5px] border-app-accent bg-app-accent text-app-accent-foreground hover:brightness-105 active:brightness-95',
  // Badge-stock button ruled in ink.
  secondary:
    'border-[1.5px] border-app-foreground bg-app-background text-app-foreground hover:bg-app-surface',
  ghost: 'bg-transparent text-app-foreground hover:bg-app-surface',
  danger: 'border-[1.5px] border-app-danger bg-app-danger text-white hover:brightness-110 active:brightness-95',
}

export function Button({
  variant = 'secondary',
  loading = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-app-sm px-4 py-2 text-sm font-bold transition-[background-color,filter,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}
