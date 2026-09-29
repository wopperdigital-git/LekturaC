import type { ClassRoom } from '@/classroom/types'
import { Select } from '@/components/ui/Select'

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
  const options = [
    {
      value: '',
      label: 'All classes',
      icon: (
        <svg
          className="size-3.5 shrink-0 text-app-muted"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="6" />
          <path d="M2 8h12" />
        </svg>
      ),
    },
    ...classes.map((c) => ({
      value: c.id,
      label: c.name,
      icon: (
        <svg
          className="size-3.5 shrink-0 text-app-muted"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M8 1.5l6.5 3.5L8 8.5 1.5 5 8 1.5z" />
          <path d="M3.5 7.5v4c0 1.2 2 2.5 4.5 2.5s4.5-1.3 4.5-2.5v-4L8 10 3.5 7.5z" opacity="0.75" />
        </svg>
      ),
    })),
  ]

  return (
    <div className="flex items-center gap-2 text-sm text-app-muted">
      <span className="font-medium text-app-muted">Class</span>
      <Select
        value={value}
        onChange={onChange}
        options={options}
        ariaLabel="Filter by class"
        className="min-w-[140px]"
      />
    </div>
  )
}

