import { ROLE_HINT, ROLE_LABEL, ROLES, type Role } from '@/classroom/roles'

/** The three account types as a radio group, used at sign-up. */
export function RoleChoice({
  value,
  onChange,
  name,
}: {
  value: Role
  onChange: (role: Role) => void
  name: string
}) {
  return (
    <div role="radiogroup" aria-label="Account type" className="flex flex-col gap-2">
      <span className="block text-xs font-medium text-app-muted">I'm using LekturaC as…</span>
      {ROLES.map((role) => {
        const selected = role === value
        return (
          <label
            key={role}
            className={`flex cursor-pointer items-start gap-3 rounded-app-sm border px-3 py-2.5 transition-colors ${
              selected ? 'border-app-accent bg-app-accent/8' : 'border-app-border hover:bg-app-surface'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={role}
              checked={selected}
              onChange={() => onChange(role)}
              className="mt-0.5 accent-[var(--app-accent)]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-app-foreground">{ROLE_LABEL[role]}</span>
              <span className="block text-xs text-app-muted">{ROLE_HINT[role]}</span>
            </span>
          </label>
        )
      })}
      {/*
        Account type is pinned in the database (migration 0010) the moment
        this form submits — there's no Account type modal to fix a wrong pick
        afterwards anymore, only deleting the account, which takes every deck
        with it. Say so before the commitment, not after.
      */}
      <p className="text-xs text-app-muted">
        Your account type is fixed once you sign up. A General account becomes a Student when it
        joins a class.
      </p>
    </div>
  )
}
