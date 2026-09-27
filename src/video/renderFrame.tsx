import { Fragment } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { Card } from '@/engine/contentBlocks'
import { mergeTextStyle, type TextStyle } from '@/engine/textStyle'
import type { ThemeTokens } from '@/lib/theme-tokens'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { SlideStage } from '@/components/theme/SlideStage'
import { SlideSurface } from '@/components/theme/SlideSurface'
import { TextStyleScope } from '@/components/theme/TextStyleScope'
import { SlideBody } from '@/components/layouts/SlideBody'
import { LayoutRenderer } from '@/components/layouts/LayoutRenderer'
import { FRAME_HEIGHT, FRAME_WIDTH, STAGE_PADDING, fitScale } from './timeline'

/*
  Draws one slide, exactly as the presenter and the thumbnails do, into the encoder's canvas.

  The composition is `SlidePreview`'s (stage, text style, surface, `SlideBody`, `LayoutRenderer`),
  deliberately repeated here rather than shared: `SlidePreview` fits a *container's width* and crops
  the bottom, while a video frame is a fixed 1280x720 and a slide taller than that is scaled down to
  fit, never cropped (the narrator reads all of it).

  It is mounted off-screen (left: -100000px) and the *stage* element, not the host, is what gets
  rasterised: the library copies the captured node's own styles, so capturing the host would carry
  its off-screen position into the picture.

  Two things about the browser matter here:
  - Slides are drawn only while the tab is visible (`whenVisible`), for two reasons. html-to-image's
    `createImage` resolves inside `requestAnimationFrame`, which is paused in a background tab, so
    the rasterising would simply never finish; and the `SETTLE_MS` wait is a `setTimeout`, which a
    hidden tab throttles. (It is not `SlideBody`: that measures `clientWidth` synchronously in a
    `useLayoutEffect`, and forced layout works in a background tab, so nudges and ink do not
    depend on its ResizeObserver for the first render.)
  - The app loads no web fonts, so `skipFonts` is on: nothing needs embedding, and it saves scanning
    every stylesheet for every slide. If a web font is ever added, the video will silently use a
    fallback until this is revisited (spec: "Pipeline").
*/

/** Lets layout settle after the synchronous render, and any late resize callback run, before the capture. */
const SETTLE_MS = 100

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Resolves when the tab is visible; rejects with an AbortError if cancelled first. */
function whenVisible(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
  if (document.visibilityState === 'visible') return Promise.resolve()
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      document.removeEventListener('visibilitychange', onChange)
      signal.removeEventListener('abort', onAbort)
    }
    const onChange = () => {
      if (document.visibilityState !== 'visible') return
      cleanup()
      resolve()
    }
    const onAbort = () => {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    document.addEventListener('visibilitychange', onChange)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

interface Refs {
  stage: HTMLDivElement | null
  fit: HTMLDivElement | null
}

/* A plain function returning an element, not a component: it holds no state and takes callbacks
   for the two nodes, so nothing here mutates a prop. */
function videoSlide(o: {
  card: Card
  theme: ThemeTokens
  textStyle: TextStyle
  isFirstCard: boolean
  onStage: (node: HTMLDivElement | null) => void
  onFit: (node: HTMLDivElement | null) => void
}) {
  const { card, theme, textStyle, isFirstCard, onStage, onFit } = o
  return (
    <ThemeProvider theme={theme}>
      <SlideStage
        ref={onStage}
        className="flex items-center justify-center p-10"
        style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT }}
      >
        {/* Scaled about its centre when the slide is taller than the frame; transforms do not affect
            layout, so `SlideBody`'s measured width (what nudges are fractions of) is unchanged. */}
        <div
          ref={onFit}
          className="w-full"
          style={{ transformOrigin: 'center center' }}
        >
          <TextStyleScope style={mergeTextStyle(textStyle, card.textStyle)}>
            <SlideSurface className="w-full rounded-slide p-10 shadow-slide-card">
              <SlideBody card={card}>
                <LayoutRenderer card={card} context={{ isFirstCard }} />
              </SlideBody>
            </SlideSurface>
          </TextStyleScope>
        </div>
      </SlideStage>
    </ThemeProvider>
  )
}

export interface SlideRenderer {
  /** Draws slide `index` into the target canvas. Rejects with an AbortError if cancelled while waiting. */
  draw(index: number, signal: AbortSignal): Promise<void>
  /** Unmounts and removes the off-screen slide. Always call it, including after a failure. */
  dispose(): void
}

export async function createSlideRenderer(o: {
  /** Sorted by `orderIndex`. */
  cards: readonly Card[]
  theme: ThemeTokens
  textStyle: TextStyle
  /** The encoder's canvas. */
  target: HTMLCanvasElement
}): Promise<SlideRenderer> {
  // Lazy: the library is only fetched when a video is actually made.
  const { toCanvas } = await import('html-to-image')

  const context = o.target.getContext('2d')
  if (!context) throw new Error('the canvas has no 2d context')

  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  Object.assign(host.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    width: `${FRAME_WIDTH}px`,
    height: `${FRAME_HEIGHT}px`,
    overflow: 'hidden',
    pointerEvents: 'none',
  })
  document.body.appendChild(host)
  const root = createRoot(host)

  return {
    async draw(index, signal) {
      await whenVisible(signal)
      const card = o.cards[index]
      const refs: Refs = { stage: null, fit: null }

      // A new key each slide remounts it, so nothing measured for the last card leaks into this one.
      flushSync(() =>
        root.render(
          <Fragment key={card.id}>
            {videoSlide({
              card,
              theme: o.theme,
              textStyle: o.textStyle,
              isFirstCard: index === 0,
              onStage: (node) => {
                refs.stage = node
              },
              onFit: (node) => {
                refs.fit = node
              },
            })}
          </Fragment>,
        ),
      )
      await document.fonts.ready
      await delay(SETTLE_MS)
      await whenVisible(signal)

      const { stage, fit } = refs
      if (!stage || !fit) throw new Error('the slide did not mount')
      const scale = fitScale(fit.offsetHeight, FRAME_HEIGHT - 2 * STAGE_PADDING)
      fit.style.transform = scale < 1 ? `scale(${scale})` : ''

      const picture = await toCanvas(stage, { width: FRAME_WIDTH, height: FRAME_HEIGHT, pixelRatio: 1, skipFonts: true })
      context.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT)
      context.drawImage(picture, 0, 0, FRAME_WIDTH, FRAME_HEIGHT)
    },
    dispose() {
      root.unmount()
      host.remove()
    },
  }
}
