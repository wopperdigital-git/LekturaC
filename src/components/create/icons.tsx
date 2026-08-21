/** Small inline glyphs for the create flow, matching the stroke style used in ui/Input.tsx. */

export function SparkIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M10 1.5l1.55 4.95a2 2 0 001.3 1.3L17.8 9.3l-4.95 1.55a2 2 0 00-1.3 1.3L10 17.1l-1.55-4.95a2 2 0 00-1.3-1.3L2.2 9.3l4.95-1.55a2 2 0 001.3-1.3L10 1.5z" />
    </svg>
  )
}

export function CheckIcon({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8.4l3.2 3.2L13 4.8" />
    </svg>
  )
}

export function PencilIcon({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11.1 2.2l2.7 2.7" />
      <path d="M2.6 10.7l-.7 3 3-.7 8.2-8.2a1.4 1.4 0 000-2l-.6-.6a1.4 1.4 0 00-2 0L2.6 10.7z" />
    </svg>
  )
}

export function ArrowLeftIcon({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12.5 8H3.5" />
      <path d="M7 3.5L3.5 8l3.5 4.5" />
    </svg>
  )
}
