import { BadgeMark } from './Programme'

/**
 * The product's mark. Until there is a drawn logo it is the name set in the
 * chrome's expanded cut beside a small drawn badge; a logo file replaces the
 * contents of this slot and nothing around it needs to change.
 *
 * `onDark` sets it in light ink for the auth panel's dark background;
 * everywhere else (light or dark app theme) omit it and it follows `app-*` tokens.
 */
export function LogoSlot({ onDark = false }: { onDark?: boolean }) {
  return (
    <div className="flex h-10 items-center gap-2.5">
      <BadgeMark className={`h-[20px] w-[15px] ${onDark ? 'text-white' : 'text-app-foreground'}`} />
      <span
        className={`display font-app text-[1.3125rem] leading-none font-extrabold uppercase ${
          onDark ? 'text-white' : 'text-app-foreground'
        }`}
      >
        Lektura
      </span>
    </div>
  )
}
