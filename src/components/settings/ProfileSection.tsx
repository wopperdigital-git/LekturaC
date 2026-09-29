import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { ROLE_LABEL } from '@/classroom/roles'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'

/**
 * Executive Profile & Identity section.
 * Displays user identity, role privileges, and provides display name management.
 */
export function ProfileSection() {
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const degraded = useAuthStore((s) => s.profileDegraded)
  const updateDisplayName = useAuthStore((s) => s.updateDisplayName)

  const saved = profile?.displayName ?? ''
  const [name, setName] = useState(saved)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const trimmed = name.trim()
  const dirty = trimmed !== saved.trim()
  const role = profile?.role ?? 'general'
  const email = user?.email ?? '—'
  const initial = (trimmed || email || '?').charAt(0).toUpperCase()

  async function save() {
    if (!trimmed) {
      setError('Enter your name.')
      return
    }
    setSaving(true)
    setError(null)
    const result = await updateDisplayName(trimmed)
    setSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setDone(true)
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Identity Hero Banner */}
      <div className="flex items-center gap-4 rounded-app-sm border border-app-border bg-app-surface/40 p-4">
        <div
          aria-hidden="true"
          className="grid size-14 shrink-0 place-items-center rounded-full bg-app-highlight text-lg font-bold text-app-highlight-foreground shadow-xs ring-2 ring-app-border/80"
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-base font-semibold text-app-foreground">
              {trimmed || 'Your Name'}
            </h4>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                role === 'teacher'
                  ? 'border-app-accent/30 bg-app-accent/10 text-app-accent-text'
                  : role === 'student'
                  ? 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  : 'border-app-border bg-app-surface text-app-muted'
              }`}
            >
              {role === 'teacher' && (
                <svg className="size-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 1.5l6.5 3.5L8 8.5 1.5 5 8 1.5z" />
                  <path d="M3.5 7.5v4c0 1.2 2 2.5 4.5 2.5s4.5-1.3 4.5-2.5v-4L8 10 3.5 7.5z" opacity="0.7" />
                </svg>
              )}
              {role === 'student' && (
                <svg className="size-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <path d="M4 14V8a4 4 0 018 0v6M2 14h12" />
                </svg>
              )}
              {degraded ? '—' : ROLE_LABEL[role]}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-app-muted">{email}</p>
        </div>
      </div>

      {/* Editable Display Name */}
      <div className="rounded-app-sm border border-app-border bg-app-background p-4">
        <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-app-muted">
          Display Information
        </h5>
        <div className="flex flex-col gap-3">
          <Field
            label="Display name"
            error={error}
            render={(fieldProps) => (
              <Input
                {...fieldProps}
                type="text"
                autoComplete="name"
                value={name}
                placeholder="Enter your full name"
                onChange={(e) => {
                  setName(e.target.value)
                  if (error) setError(null)
                  if (done) setDone(false)
                }}
              />
            )}
          />

          {done && <Alert tone="success">Your display name was successfully updated.</Alert>}

          <div className="flex justify-end pt-1">
            <Button
              variant="primary"
              onClick={() => void save()}
              loading={saving}
              disabled={saving || !dirty}
            >
              {saving ? 'Saving changes…' : 'Save name'}
            </Button>
          </div>
        </div>
      </div>

      {/* Read-Only Account Identity */}
      <div className="rounded-app-sm border border-app-border bg-app-surface/30 p-4">
        <div className="flex items-center gap-1.5 pb-2">
          <svg className="size-3.5 text-app-muted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <rect x="3" y="6" width="10" height="8" rx="1.5" />
            <path d="M5.5 6V4a2.5 2.5 0 015 0v2" />
          </svg>
          <h5 className="text-xs font-semibold uppercase tracking-wider text-app-muted">
            Permanent Identity & Access
          </h5>
        </div>

        <dl className="divide-y divide-app-border/50 text-sm">
          <div className="flex items-center justify-between py-2.5">
            <dt className="text-xs text-app-muted">Primary Email</dt>
            <dd className="font-mono text-xs font-medium text-app-foreground">{email}</dd>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <dt className="text-xs text-app-muted">Assigned Role</dt>
            <dd className="text-xs font-medium text-app-foreground">
              {degraded ? '—' : ROLE_LABEL[role]}
            </dd>
          </div>
        </dl>

        <p className="mt-2.5 text-xs text-app-muted/90">
          {degraded
            ? "We couldn't load your account type. Reload the page to retry."
            : 'Email address and role permissions are anchored to your account credentials. A General account automatically transitions to a Student when joining a class.'}
        </p>
      </div>
    </div>
  )
}
