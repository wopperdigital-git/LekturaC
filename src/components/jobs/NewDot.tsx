import type { NewKind } from '@/jobs/newItems'

const NAMES: Record<NewKind, string> = { deck: 'deck', quiz: 'quiz', video: 'video' }

export function newLabel(kinds: readonly NewKind[]): string {
  const names = kinds.map((k) => NAMES[k])
  if (names.length <= 1) return `New ${names[0] ?? ''}`.trim()
  return `New ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** A small yellow dot saying a deck has a result the user has not opened yet. */
export function NewDot({ kinds, className = '' }: { kinds: readonly NewKind[]; className?: string }) {
  if (kinds.length === 0) return null
  const label = newLabel(kinds)
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`block size-2.5 rounded-full bg-amber-400 ring-2 ring-app-background ${className}`}
    />
  )
}
