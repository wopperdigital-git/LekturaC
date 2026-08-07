import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-app-sm border border-app-border bg-app-background px-3 py-2 text-sm text-app-foreground outline-none focus:border-app-accent ${className}`}
      {...props}
    />
  )
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full resize-none rounded-app-sm border border-app-border bg-app-background px-3 py-2 text-sm text-app-foreground outline-none focus:border-app-accent ${className}`}
      {...props}
    />
  )
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-app-muted">{children}</label>
}
