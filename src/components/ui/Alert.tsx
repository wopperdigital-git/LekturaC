import type { ReactNode } from 'react'

type Tone = 'error' | 'success' | 'info'

/*
  Success uses the palette accent (#96cb67) as a tint, with `app-highlight-text`
  for the copy so it still clears AA in both themes. Error keeps a red — the
  five-color palette has no danger color, and recoloring failure states to fit
  the brand would cost more in clarity than it gains in consistency.
*/
const TONE_CLASSES: Record<Tone, string> = {
  error: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
  success: 'border-app-highlight/40 bg-app-highlight/12 text-app-highlight-text',
  info: 'border-app-border bg-app-surface text-app-foreground',
}

const ICONS: Record<Tone, ReactNode> = {
  error: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 6.5v4" />
      <path d="M10 13.4v.2" />
    </>
  ),
  success: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M6.8 10.2l2.2 2.2 4.2-4.4" />
    </>
  ),
  info: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9.5v4" />
      <path d="M10 6.6v.2" />
    </>
  ),
}

export function Alert({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-app-sm border px-3 py-2.5 text-sm ${TONE_CLASSES[tone]}`}
    >
      <svg
        className="mt-0.5 size-4 shrink-0"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {ICONS[tone]}
      </svg>
      <span>{children}</span>
    </div>
  )
}
