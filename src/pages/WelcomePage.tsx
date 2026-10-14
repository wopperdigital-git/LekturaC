import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import '@fontsource-variable/hanken-grotesk'
import 'lenis/dist/lenis.css'
import '@/pages/welcome/welcome.css'
import { BUILTIN_THEMES } from '@/lib/theme-tokens'
import { ALL_CHAPTERS, CALLOUT_SLOTS, CHAPTERS, INTRO, OUTRO, type Chapter } from '@/pages/welcome/content'
import { FACE_TRANSFORMS, PIP_CELLS, type FaceNumber } from '@/pages/welcome/dieGeometry'
import { initWelcomeMotion } from '@/pages/welcome/motion'

const FACES: FaceNumber[] = [1, 2, 3, 4, 5, 6]

/**
 * The public landing page. A specimen plate (after SUTÉRA): a CSS-3D die
 * stays fixed in the centre of a hairline grid while the chapters scroll past,
 * rolling to one face per chapter with leader-line callouts. All motion lives
 * in welcome/motion.ts; this file is markup only.
 */
export function WelcomePage() {
  const rootRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!rootRef.current) return
    return initWelcomeMotion(rootRef.current)
  }, [])

  return (
    <div className="lw" ref={rootRef}>
      <a className="lw-skip" href="#brief">Skip to content</a>

      {/* The plate: fixed grid, crosshairs, the die and its callouts. */}
      <div className="lw-plate" aria-hidden="true">
        <span className="lw-cross" style={{ left: '25%', top: '33.333%' }} />
        <span className="lw-cross" style={{ left: '50%', top: '33.333%' }} />
        <span className="lw-cross" style={{ left: '75%', top: '33.333%' }} />
        <span className="lw-cross" style={{ left: '25%', top: '66.666%' }} />
        <span className="lw-cross" style={{ left: '50%', top: '66.666%' }} />
        <span className="lw-cross" style={{ left: '75%', top: '66.666%' }} />
      </div>

      <svg className="lw-callout-lines" aria-hidden="true">
        {CALLOUT_SLOTS.map((_, i) => (
          <g key={i} className="lw-callout-line" data-slot={i}>
            <path pathLength={1} />
            <rect width="14" height="14" />
            <rect className="lw-node-dot" width="6" height="6" />
          </g>
        ))}
      </svg>
      <div className="lw-callouts" aria-hidden="true">
        {CALLOUT_SLOTS.map((_, i) => (
          <div key={i} className="lw-callout" data-slot={i}>
            <span className="lw-callout-k" />
            <span className="lw-callout-t" />
          </div>
        ))}
      </div>

      <div className="lw-die-anchor">
        <button type="button" className="lw-die" aria-label="Roll the die">
          <span className="lw-die-tilt">
            <span className="lw-die-spin">
              <span className="lw-die-cube">
                <span className="lw-core lw-core-a" />
                <span className="lw-core lw-core-b" />
                <span className="lw-core lw-core-c" />
                {FACES.map((face) => (
                  <span key={face} className={`lw-face lw-face-${face}`} style={{ '--face': FACE_TRANSFORMS[face] } as CSSProperties}>
                    {Array.from({ length: 9 }, (_, cell) => (
                      <i key={cell} className={PIP_CELLS[face].includes(cell) ? 'lw-pip' : undefined} />
                    ))}
                  </span>
                ))}
              </span>
            </span>
          </span>
        </button>
      </div>

      <header className="lw-bar">
        <a className="lw-wordmark" href="#intro">Lektura</a>
        <nav className="lw-nav" aria-label="Sections">
          <a href="#brief">How it works</a>
          <a href="#themes">Themes</a>
          <a href="#classroom">Classroom</a>
        </nav>
        <p className="lw-pill" aria-live="polite">
          <span className="lw-pill-tag">{INTRO.tag}</span>
        </p>
        <p className="lw-clock">
          <span>Local time</span>
          <time className="lw-clock-time">--:--</time>
        </p>
        <div className="lw-bar-actions">
          <Link className="lw-link" to="/login">Log in</Link>
          <Link className="lw-btn" to="/login?mode=signup">Start free</Link>
        </div>
      </header>

      <main className="lw-main">
        <section className="lw-hero" id="intro" data-chapter={0}>
          <h1 className="lw-display">
            Every deck
            <br />
            starts with
            <br />a roll.
          </h1>
          <div className="lw-hero-foot">
            <p className="lw-lede">{INTRO.body}</p>
            <div className="lw-cta-row">
              <Link className="lw-btn lw-btn-lg" to="/login?mode=signup">Generate a deck</Link>
              <a className="lw-link" href="#brief">See how it works ↓</a>
            </div>
          </div>
          <aside className="lw-card">
            <span className="lw-card-tab">Not a template, a whole deck</span>
            <p>Lektura researches, writes, designs and checks every slide in one pass. Then it hands you the controls.</p>
          </aside>
          <CalloutList chapter={INTRO} />
        </section>

        {CHAPTERS.map((chapter, i) => (
          <section key={chapter.id} className={`lw-chapter lw-chapter-${chapter.id}`} id={chapter.id} data-chapter={i + 1}>
            <div className="lw-col">
              <p className="lw-tag">{chapter.tag}</p>
              <h2 className="lw-title">{chapter.title}</h2>
              <p className="lw-body">{chapter.body}</p>
              <CalloutList chapter={chapter} />
            </div>
            {chapter.id === 'themes' && <ThemeStrip />}
          </section>
        ))}

        <section className="lw-chapter lw-outro" id={OUTRO.id} data-chapter={ALL_CHAPTERS.length - 1}>
          <div className="lw-col">
            <p className="lw-tag">{OUTRO.tag}</p>
            <h2 className="lw-title lw-title-xl">{OUTRO.title}</h2>
            <p className="lw-body">{OUTRO.body}</p>
            <div className="lw-cta-row">
              <Link className="lw-btn lw-btn-lg" to="/login?mode=signup">Start free</Link>
              <Link className="lw-link" to="/login">I have an account</Link>
            </div>
            <CalloutList chapter={OUTRO} />
          </div>
        </section>
      </main>

      <footer className="lw-foot">
        <span>© {new Date().getFullYear()} Lektura</span>
        <span>AI presentations, generated once and edited by you.</span>
      </footer>
    </div>
  )
}

/** The chapter's callouts as a plain list: what phones and screen readers get. */
function CalloutList({ chapter }: { chapter: Chapter }) {
  if (!chapter.callouts.length) return null
  return (
    <ul className="lw-inline-callouts">
      {chapter.callouts.map((c) => (
        <li key={c.k}>
          <strong>{c.k}</strong>
          <span>{c.t}</span>
        </li>
      ))}
    </ul>
  )
}

/** Codapress's arc-fanned strip, with the app's real built-in themes as the cards. */
function ThemeStrip() {
  return (
    <div className="lw-strip" role="group" aria-roledescription="carousel" aria-label="Built-in themes">
      <div className="lw-strip-controls">
        <button type="button" className="lw-strip-btn" data-step={-1} aria-label="Previous theme">‹</button>
        <span className="lw-strip-hint">Drag</span>
        <button type="button" className="lw-strip-btn" data-step={1} aria-label="Next theme">›</button>
      </div>
      <div className="lw-strip-viewport">
        <ul className="lw-strip-track">
          {BUILTIN_THEMES.map((theme, i) => (
            <li key={theme.id} className="lw-theme" tabIndex={0} aria-label={`${theme.name} theme`}>
              <div
                className="lw-theme-slide"
                style={{
                  background: theme.colors.background,
                  color: theme.colors.foreground,
                  borderRadius: Math.min(theme.shape.radius, 14),
                }}
              >
                <span className="lw-theme-rule" style={{ background: theme.colors.accent }} />
                <span className="lw-theme-h" style={{ fontFamily: theme.typography.headingFont }}>
                  Quarterly
                  <br />
                  review
                </span>
                <span className="lw-theme-bullets">
                  {[0, 1, 2].map((b) => (
                    <span key={b}>
                      <i style={{ background: b === 0 ? theme.colors.accent : theme.colors.accentSoft }} />
                      <em style={{ background: theme.colors.muted }} />
                    </span>
                  ))}
                </span>
              </div>
              <p className="lw-theme-meta">
                <span>{String(i + 1).padStart(2, '0')}.</span>
                <strong>{theme.name}</strong>
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
