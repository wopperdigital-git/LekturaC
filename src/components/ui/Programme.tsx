import type { Track } from '@/components/home/deckSwatch'

const TRACK_FILL: Record<Track, string> = {
  orange: 'bg-app-track-orange',
  teal: 'bg-app-track-teal',
  sun: 'bg-app-track-sun',
  cobalt: 'bg-app-track-cobalt',
}

/** The fill class for a track, so callers never assemble class names Tailwind can't see. */
export function trackFill(track: Track): string {
  return TRACK_FILL[track]
}

/**
 * The programme's track band (DESIGN.md, "Conference Programme"): the four track
 * colours side by side, over page titles (never on dialogs).
 * Decorative, so hidden from assistive tech.
 */
export function TrackBand({ className = 'h-1.5' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`flex ${className}`}>
      <span className="flex-1 bg-app-track-orange" />
      <span className="flex-1 bg-app-track-teal" />
      <span className="flex-1 bg-app-track-sun" />
      <span className="flex-1 bg-app-track-cobalt" />
    </div>
  )
}

/**
 * The wordmark's glyph, drawn from the badge itself: a card ruled in the current
 * ink, its punched lanyard slot, and an orange track stripe.
 */
export function BadgeMark({ className = 'h-[18px] w-[14px]' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 14 18" aria-hidden="true">
      <rect x="0.9" y="0.9" width="12.2" height="16.2" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="4.5" y="3.2" width="5" height="1.8" rx="0.9" fill="currentColor" />
      <rect x="0.9" y="11.2" width="12.2" height="2.6" fill="var(--app-accent)" />
    </svg>
  )
}
