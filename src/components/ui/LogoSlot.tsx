import { DetentCross } from './Rubric'

/**
 * The product's mark. Until there is a drawn logo it is the name set in the
 * chrome's serif, keyed by the rubric's detent cross; a logo file replaces the
 * contents of this slot and nothing around it needs to change.
 *
 * `onDark` sets it in light ink for the auth panel's dark background;
 * everywhere else (light or dark app theme) omit it and it follows `app-*` tokens.
 */
export function LogoSlot({ onDark = false }: { onDark?: boolean }) {
  return (
    <div className="flex h-10 items-center gap-2">
      <span
        className={`font-app text-[1.375rem] leading-none font-semibold tracking-[-0.01em] ${
          onDark ? 'text-white' : 'text-app-foreground'
        }`}
      >
        Lektura
      </span>
      <DetentCross className={`size-2.5 ${onDark ? 'text-[#e8664c]' : 'text-app-accent-text'}`} />
    </div>
  )
}
