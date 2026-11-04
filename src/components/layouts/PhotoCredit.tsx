import type { PhotoCredit as PhotoCreditData } from '@/images/types'
import { SLIDE_BODY_FONT } from '@/lib/theme-tokens'

/**
 * The photographer's credit Pexels asks for, drawn small on a photo's bottom
 * edge: "Photo: <name> / Pexels". Plain text, not a link: a slide is drawn inside
 * `aria-hidden` previews and `<button>`s (dashboard covers, outline thumbnails), where
 * a link would be an invisible tab stop and invalid HTML, and in the presenter a click
 * on it would be a click on the slide. The photographer's link lives in the image
 * picker.
 *
 * It is part of the layout JSX of every photo, so it shows wherever a slide is
 * drawn (canvas, presenter, thumbnails, cover, video) with no surface having to
 * remember it. It is not an element: no `Adjustable`, so it cannot be selected,
 * moved or removed on its own; it goes when its photo does. A photo from a
 * pasted link has no credit to give, and draws nothing.
 *
 * Its own dark pill keeps it legible on any picture. Position is the caller's:
 * pass classes that place it (it is `absolute`, so the photo's box must be
 * `relative`).
 */
export function PhotoCredit({
  credit,
  className = 'bottom-2 right-3',
}: {
  credit?: PhotoCreditData
  className?: string
}) {
  if (!credit || credit.source !== 'pexels') return null
  return (
    <span
      data-photo-credit=""
      className={`absolute z-[1] max-w-[85%] truncate rounded-full bg-black/55 px-2 py-0.5 text-[0.65rem] font-medium leading-tight text-white ${className}`}
      style={{ fontFamily: SLIDE_BODY_FONT }}
    >
      {`Photo: ${credit.name} / Pexels`}
    </span>
  )
}
