import { textRef } from '@/engine/marks'
import { CODE_FONT, CODE_SIZE, SLIDE_BODY_FONT, SLIDE_GAP } from '@/lib/theme-tokens'
import { EditableText } from './EditableText'
import { GROUND_ATTR, useBlockAdjusting } from './adjustContext'
import { useSlideFacts } from './slideFacts'

/**
 * A monospace panel for source text. It is a ground, never an accent fill: on a plain or tint slide it
 * carries the theme's deep ground itself (`data-ground="deep"`, so the stylesheet re-points the colours
 * inside it and a picked colour is ignored there, as on any deep ground); on a deep slide it carries
 * none and `[data-ground='deep'] [data-code]` in `index.css` draws it as a light panel with dark ink,
 * so it still stands apart from its slide.
 *
 * The code field is plain text. Its face is always the code face, set on the `pre` itself (never through
 * the slide font variables, so a font pick at element, card or deck reaches nothing here), its ink is
 * the panel's (the colour rules leave a deep ground, which the panel is or sits in, alone), and
 * `EditableText` draws no mark on it. Only the size follows a pick (`fontScale` moves the body size the
 * code size is a step of). The run inside the `pre` is `white-space: pre`, not the pre-wrap every run
 * has, so lines never wrap: a long one scrolls inside the panel on the live editor and is clipped
 * everywhere else (thumbnails, Present, the video), and the panel may shrink (`min-w-0 max-w-full`),
 * so the slide never grows wider. The label (above) and caption (below) are ordinary runs in muted ink.
 */
export function CodeBlock({
  index,
  label,
  code,
  caption,
}: {
  index: number
  label?: string
  code: string
  caption?: string
}) {
  const { ground } = useSlideFacts()
  // Only the live editor can scroll a long line; every other surface clips it.
  const scrolls = useBlockAdjusting() !== null
  return (
    <div
      data-code=""
      {...(ground === 'deep' ? {} : { [GROUND_ATTR]: 'deep' })}
      className="min-w-0 max-w-full rounded-slide bg-slide-background text-slide-foreground"
      style={{ fontFamily: SLIDE_BODY_FONT, padding: SLIDE_GAP.group }}
    >
      {label && (
        <p data-code-label="" className="text-slide-muted" style={{ fontSize: CODE_SIZE, marginBottom: SLIDE_GAP.tight }}>
          <EditableText textRef={textRef(index, 'label')} value={label} />
        </p>
      )}
      <pre
        className={`m-0 min-w-0 max-w-full whitespace-pre text-slide-foreground ${scrolls ? 'overflow-x-auto' : 'overflow-hidden'}`}
        style={{ fontFamily: CODE_FONT, fontSize: CODE_SIZE, lineHeight: 1.5, minHeight: '1.5em', tabSize: 4, fontVariantLigatures: 'none' }}
      >
        <EditableText textRef={textRef(index, 'code')} value={code} style={{ whiteSpace: 'pre' }} />
      </pre>
      {caption && (
        <p data-code-caption="" className="text-slide-muted" style={{ fontSize: CODE_SIZE, marginTop: SLIDE_GAP.tight }}>
          <EditableText textRef={textRef(index, 'caption')} value={caption} />
        </p>
      )}
    </div>
  )
}
