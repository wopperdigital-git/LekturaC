/**
 * The chrome's apparatus marks (DESIGN.md, "Annotated Edition"): the detent
 * cross a ruling engine sets where a rule changes footing, and the rubric rule
 * that runs under a page or dialog title. Both are drawn, never glyphs, and both
 * take the rubric (`--app-accent-text`) unless told otherwise.
 */
export function DetentCross({ className = 'size-2.5 text-app-accent-text' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 10 10" aria-hidden="true">
      <path d="M5 0v10M0 5h10" stroke="currentColor" strokeWidth="1" />
      <rect x="3.5" y="3.5" width="3" height="3" fill="currentColor" />
    </svg>
  )
}

/** A one-pixel rule with a detent at its centre. Decorative, so hidden from assistive tech. */
export function RubricRule({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`flex items-center gap-2 ${className}`}>
      <span className="h-px flex-1 bg-app-accent-text/45" />
      <DetentCross />
      <span className="h-px flex-1 bg-app-accent-text/45" />
    </div>
  )
}
