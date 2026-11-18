import { Fragment } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { Card } from '@/engine/contentBlocks'
import { mergeTextStyle, type TextStyle } from '@/engine/textStyle'
import { groundOf } from '@/engine/composition'
import { CODE_FONT, type ThemeTokens } from '@/lib/theme-tokens'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { SlideStage } from '@/components/theme/SlideStage'
import { SlideSurface } from '@/components/theme/SlideSurface'
import { TextStyleScope } from '@/components/theme/TextStyleScope'
import { SlideBody } from '@/components/layouts/SlideBody'
import { LayoutRenderer } from '@/components/layouts/LayoutRenderer'
import { FRAME_HEIGHT, FRAME_WIDTH, STAGE_PADDING, frameScale } from './timeline'
import { SLIDE_WIDTH_PX } from '@/lib/slideSize'

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
  - Theme web fonts are embedded, not skipped. html-to-image rasterises through an SVG
    <foreignObject>, which cannot see the page's @font-face rules, so without the CSS inlined a
    Chalkboard video would show Arial for its Caveat. The CSS is built once per video
    (`getFontEmbedCSS`, a scan of the stylesheets plus a base64 fetch of every file of the families
    in use) and passed to every frame as `fontEmbedCSS`. It is built from a probe holding the
    theme's two fonts rather than from the first slide, because the library keeps only the families
    the node uses and a title slide with no body text would drop the body font for the whole video.
    The toolbar's own fonts are system fonts, which need no embedding; a web font added there must
    join the probe. The code panel's face (`CODE_FONT`, JetBrains Mono) is one: it joins the probe when a
    slide holds a code block.
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
  // The ground is read with the same first-card flag the layout is drawn with, so the two cannot disagree.
  const ground = groundOf(card, { isFirstCard })
  return (
    <ThemeProvider theme={theme}>
      <SlideStage
        ref={onStage}
        className="flex items-center justify-center p-10"
        style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT }}
      >
        {/* Laid out at the editor's width, so text wraps as it does there, then scaled about its
            centre to fill the frame (and down, never cropped, when the slide is tall); transforms do
            not affect layout, so `SlideBody`'s measured width (what nudges are fractions of) is unchanged. */}
        <div
          ref={onFit}
          className="shrink-0"
          style={{ width: SLIDE_WIDTH_PX, transformOrigin: 'center center' }}
        >
          <TextStyleScope style={mergeTextStyle(textStyle, card.textStyle)}>
            <SlideSurface padding="roomy" className="w-full rounded-slide shadow-slide-card" ground={ground}>
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
  const { toCanvas, getFontEmbedCSS } = await import('html-to-image')

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

  // A code panel always draws in the code face, whatever the theme's fonts are, so the probe holds it too
  // (only when a slide has one: it is one more font to fetch and embed).
  const hasCode = o.cards.some((card) => card.blocks.some((block) => block.type === 'code'))
  const themeFonts = [
    o.theme.typography.headingFont,
    o.theme.typography.bodyFont,
    ...(hasCode ? [CODE_FONT] : []),
  ]

  // Once per video: scanning every stylesheet and fetching every font file is the slow part. A
  // failure costs fidelity (fallback fonts), never the video, so it settles to no extra CSS.
  let fontEmbedCSS: Promise<string> | null = null
  const embeddedFonts = () => {
    fontEmbedCSS ??= (async () => {
      const probe = document.createElement('div')
      // The root would otherwise inherit the chrome font (Archivo) from <body>, and the library
      // would embed that family into every frame too.
      probe.style.fontFamily = o.theme.typography.bodyFont
      for (const family of themeFonts) {
        const span = document.createElement('span')
        span.style.fontFamily = family
        span.textContent = 'x'
        probe.appendChild(span)
      }
      host.appendChild(probe)
      try {
        return await getFontEmbedCSS(probe)
      } finally {
        probe.remove()
      }
    })().catch((error: unknown) => {
      console.warn('Could not embed the theme fonts in the video; slides use fallback fonts.', error)
      return ''
    })
    return fontEmbedCSS
  }

  // Once per video: a web font loads on first use, so make sure the first frame is not measured
  // (and `frameScale` not computed) against a fallback face. Failures are ignored.
  let fontsLoaded: Promise<unknown> | null = null
  const loadThemeFonts = () => {
    fontsLoaded ??= Promise.all(themeFonts.map((family) => document.fonts.load(`700 16px ${family}`))).catch(
      () => undefined,
    )
    return fontsLoaded
  }

  return {
    async draw(index, signal) {
      await whenVisible(signal)
      await loadThemeFonts()
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
      const scale = frameScale(
        SLIDE_WIDTH_PX,
        fit.offsetHeight,
        FRAME_WIDTH - 2 * STAGE_PADDING,
        FRAME_HEIGHT - 2 * STAGE_PADDING,
      )
      fit.style.transform = scale !== 1 ? `scale(${scale})` : ''

      const picture = await toCanvas(stage, {
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
        pixelRatio: 1,
        fontEmbedCSS: await embeddedFonts(),
      })
      context.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT)
      context.drawImage(picture, 0, 0, FRAME_WIDTH, FRAME_HEIGHT)
    },
    dispose() {
      root.unmount()
      host.remove()
    },
  }
}
