/** Small inline glyphs for the create flow, matching the stroke style used in ui/Input.tsx. */

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
