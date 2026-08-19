import { useId, useState } from 'react'
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'

/** Shared field chrome: border, focus ring, and the red variant used when `invalid` is set. */
function fieldClasses(invalid: boolean) {
  return [
    'w-full rounded-app-sm border bg-app-background px-3 py-2 text-sm text-app-foreground',
    'placeholder:text-app-muted/60 outline-none transition-[border-color,box-shadow] duration-150',
    invalid
      ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/25'
      : 'border-app-border focus:border-app-accent focus:ring-2 focus:ring-app-accent/25',
  ].join(' ')
}

export function Input({
  className = '',
  invalid = false,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={`${fieldClasses(invalid)} ${className}`}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
}

/**
 * Password field with a show/hide toggle. The toggle is a real button so it is
 * keyboard reachable, and it never submits the surrounding form (`type="button"`).
 */
export function PasswordInput({
  className = '',
  invalid = false,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { invalid?: boolean }) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        className={`${fieldClasses(invalid)} pr-11 ${className}`}
        aria-invalid={invalid || undefined}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center rounded-r-app-sm text-app-muted transition-colors hover:text-app-foreground"
      >
        {visible ? (
          <svg
            className="size-4"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M3 3l14 14" />
            <path d="M8.2 8.3a2.5 2.5 0 003.5 3.5" />
            <path d="M6.2 6.4C4.5 7.4 3.1 8.9 2.2 10c1.6 2.1 4.3 4.5 7.8 4.5 1.3 0 2.5-.3 3.5-.8" />
            <path d="M16.1 12.3c.7-.7 1.3-1.5 1.7-2.3-1.6-2.1-4.3-4.5-7.8-4.5-.5 0-1 .05-1.5.15" />
          </svg>
        ) : (
          <svg
            className="size-4"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M2.2 10C3.8 7.9 6.5 5.5 10 5.5s6.2 2.4 7.8 4.5c-1.6 2.1-4.3 4.5-7.8 4.5S3.8 12.1 2.2 10z" />
            <circle cx="10" cy="10" r="2.5" />
          </svg>
        )}
      </button>
    </div>
  )
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${fieldClasses(false)} resize-none ${className}`} {...props} />
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-app-muted">
      {children}
    </label>
  )
}

/**
 * A labelled field that wires up label/input/error ids for screen readers.
 * `render` receives the props the control must spread onto itself.
 */
export function Field({
  label,
  error,
  hint,
  render,
}: {
  label: string
  error?: string | null
  hint?: string
  render: (props: {
    id: string
    invalid: boolean
    'aria-describedby': string | undefined
  }) => ReactNode
}) {
  const id = useId()
  const messageId = `${id}-message`
  const message = error ?? hint

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {render({
        id,
        invalid: Boolean(error),
        'aria-describedby': message ? messageId : undefined,
      })}
      {message && (
        <p
          id={messageId}
          className={`mt-1 text-xs ${error ? 'text-red-600' : 'text-app-muted'}`}
        >
          {message}
        </p>
      )}
    </div>
  )
}
