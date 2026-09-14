export function ClassChip({ name }: { name: string }) {
  return (
    <span className="inline-flex max-w-[12rem] items-center truncate rounded-full border border-app-border bg-app-surface px-2 py-0.5 text-[11px] text-app-foreground">
      {name}
    </span>
  )
}
