import { Button } from '@/components/ui/Button'

/** A stack of angled cards, built from the same palette rather than a stock illustration. */
function StackIllustration() {
  return (
    <svg
      viewBox="0 0 160 120"
      className="h-28 w-auto"
      aria-hidden="true"
      fill="none"
    >
      <rect
        x="34"
        y="18"
        width="92"
        height="66"
        rx="10"
        transform="rotate(-8 34 18)"
        fill="var(--app-secondary)"
        opacity="0.35"
      />
      <rect
        x="30"
        y="26"
        width="92"
        height="66"
        rx="10"
        transform="rotate(4 30 26)"
        fill="var(--app-highlight)"
        opacity="0.4"
      />
      <rect x="34" y="30" width="92" height="66" rx="10" fill="var(--app-accent)" />
      <rect x="46" y="46" width="44" height="6" rx="3" fill="white" opacity="0.85" />
      <rect x="46" y="58" width="60" height="5" rx="2.5" fill="white" opacity="0.55" />
      <rect x="46" y="68" width="52" height="5" rx="2.5" fill="white" opacity="0.55" />
    </svg>
  )
}

export function EmptyDeckState({ onCreate }: { onCreate: () => void }) {
  return (
    // no card chrome of its own — it renders inside the dashboard panel
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <StackIllustration />
      <h2 className="mt-6 text-lg font-semibold text-app-foreground">
        Create your first presentation
      </h2>
      <p className="mt-2 max-w-sm text-sm text-app-muted">
        Describe a topic and LekturaC turns it into a complete, presentation-ready slide deck in
        one go.
      </p>
      <Button variant="primary" onClick={onCreate} className="mt-6">
        + New presentation
      </Button>
    </div>
  )
}
