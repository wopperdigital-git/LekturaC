import type { ReactNode } from 'react'
import { AuthVisualPanel } from './AuthVisualPanel'
import { LogoSlot } from '@/components/ui/LogoSlot'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

/**
 * Full-bleed split screen for the auth routes: the animated panel owns the left
 * half of the viewport edge-to-edge, the form the right. Below `lg` the panel is
 * dropped entirely rather than stacked, so phones never pay for the animation.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="relative grid min-h-screen bg-app-background lg:grid-cols-2">
      {/*
        Anchored to the page corner, not to either column. The wrapper carries the
        positioning because ThemeToggle is itself `relative` (its icons stack
        absolutely inside it) — passing `absolute` in via className loses to that.
      */}
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>

      <AuthVisualPanel>
        <LogoSlot onDark />
        <div>
          <p className="max-w-sm text-3xl leading-snug font-semibold text-white">
            Describe a topic. Get a finished deck.
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/55">
            LekturaC turns a single brief into a complete, presentation-ready slide deck.
          </p>
        </div>
      </AuthVisualPanel>

      <div className="flex items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-sm">
          {/* mobile-only logo slot, since the visual panel is hidden there */}
          <div className="mb-10 lg:hidden">
            <LogoSlot />
          </div>

          <h1 className="text-3xl font-semibold tracking-tight text-app-foreground">{title}</h1>
          <p className="mt-2 text-sm text-app-muted">{subtitle}</p>

          <div className="mt-8">{children}</div>

          {footer && <div className="mt-6">{footer}</div>}
        </div>
      </div>
    </div>
  )
}
