import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-app-accent text-app-accent-foreground hover:opacity-90',
  secondary: 'bg-app-surface text-app-foreground border border-app-border hover:bg-app-border/40',
  ghost: 'bg-transparent text-app-foreground hover:bg-app-surface',
  danger: 'bg-transparent text-red-600 hover:bg-red-50',
}

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-app-sm px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  )
}
