import type { ClassRoom } from '@/classroom/types'

/** `''` means all classes. */
export function ClassFilter({
  classes,
  value,
  onChange,
}: {
  classes: ClassRoom[]
  value: string
  onChange: (classId: string) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-app-muted">
      <span>Class</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-app-sm border border-app-border bg-app-background px-2.5 py-1.5 text-sm text-app-foreground outline-none focus:border-app-accent focus:ring-2 focus:ring-app-accent/25"
      >
        <option value="">All classes</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  )
}
