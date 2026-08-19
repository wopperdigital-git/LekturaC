/**
 * Drop your logo in here.
 *
 * Replace the placeholder block below with an <img>, e.g.
 *   <img src="/logo.svg" alt="LekturaC" className="h-8 w-auto" />
 * The surrounding slot is already positioned and sized — nothing else needs to change.
 *
 * `onDark` picks the outline color for use on the auth panel's dark background;
 * everywhere else (light or dark app theme) omit it and it follows `app-*` tokens.
 */
export function LogoSlot({ onDark = false }: { onDark?: boolean }) {
  return (
    <div className="flex h-10 items-center">
      {/* --- replace from here --- */}
      <div
        className={`flex h-10 w-32 items-center justify-center rounded-app-sm border border-dashed text-[10px] font-medium tracking-wide uppercase ${
          onDark ? 'border-white/25 text-white/40' : 'border-app-border text-app-muted'
        }`}
      >
        Logo
      </div>
      {/* --- to here --- */}
    </div>
  )
}
