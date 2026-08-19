import type { ButtonHTMLAttributes } from 'react'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-app-accent text-app-accent-foreground shadow-sm hover:brightness-110 active:brightness-95',
  secondary: 'bg-app-surface text-app-foreground border border-app-border hover:bg-app-border/40',
  ghost: 'bg-transparent text-app-foreground hover:bg-app-surface',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800',
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
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-app-sm px-4 py-2 text-sm font-medium transition-[background-color,filter,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}
