import type { PhotoCredit as PhotoCreditData } from '@/images/types'
import { SLIDE_BODY_FONT } from '@/lib/theme-tokens'
import { useBlockAdjusting } from './adjustContext'

/**
 * The photographer's credit Pexels asks for, drawn small on a photo's bottom
 * edge: "Photo: <name> / Pexels", linking the photographer.
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
  const adjusting = useBlockAdjusting()
  if (!credit || credit.source !== 'pexels') return null
  return (
    <a
      data-photo-credit=""
      href={credit.url}
      target="_blank"
      rel="noreferrer noopener"
      // In the editor a click on the credit is a click on the slide, not a trip to Pexels.
      onClick={adjusting ? (event) => event.preventDefault() : undefined}
      className={`absolute z-[1] max-w-[85%] truncate rounded-full bg-black/55 px-2 py-0.5 text-[0.65rem] font-medium leading-tight text-white no-underline ${className}`}
      style={{ fontFamily: SLIDE_BODY_FONT }}
    >
      {`Photo: ${credit.name} / Pexels`}
    </a>
  )
}
