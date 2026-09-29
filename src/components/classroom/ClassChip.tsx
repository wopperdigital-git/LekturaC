export function ClassChip({ name }: { name: string }) {
  return (
    <span className="inline-flex max-w-[14rem] items-center gap-1.5 truncate rounded-full border border-app-accent/25 bg-app-accent/8 px-2.5 py-0.5 text-[11px] font-medium text-app-accent-text">
      <svg className="size-3 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M8 1.5l6.5 3.5L8 8.5 1.5 5 8 1.5z" />
        <path d="M3.5 7.5v4c0 1.2 2 2.5 4.5 2.5s4.5-1.3 4.5-2.5v-4L8 10 3.5 7.5z" opacity="0.75" />
      </svg>
      <span className="truncate">{name}</span>
    </span>
  )
}
