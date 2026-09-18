import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { ROLE_LABEL } from '@/classroom/roles'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'

/**
 * Name, and the two things about an account that cannot be changed.
 *
 * Email is pinned by the guard trigger in migration 0009 and the account type
 * by 0010, so both are shown as plain text rather than as disabled inputs — a
 * greyed-out field reads as "not right now", which would be a lie about
 * something that never changes.
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
    <div className="flex flex-col gap-4">
      <Field
        label="Name"
        error={error}
        render={(fieldProps) => (
          <Input
            {...fieldProps}
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (error) setError(null)
              if (done) setDone(false)
            }}
          />
        )}
      />

      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-app-muted">Email</dt>
          <dd className="truncate text-app-foreground">{user?.email ?? '—'}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-app-muted">Account type</dt>
          <dd className="text-app-foreground">
            {degraded ? '—' : ROLE_LABEL[profile?.role ?? 'general']}
          </dd>
        </div>
      </dl>

      <p className="text-xs text-app-muted">
        {degraded
          ? "We couldn't load your account type. Reload the page to see it."
          : 'Your email and account type are fixed. A General account becomes a Student when it joins a class.'}
      </p>

      {done && <Alert tone="success">Name updated.</Alert>}

      <div className="flex justify-end">
        <Button
          variant="primary"
          onClick={() => void save()}
          loading={saving}
          disabled={saving || !dirty}
        >
          {saving ? 'Saving…' : 'Save name'}
        </Button>
      </div>
    </div>
  )
}
