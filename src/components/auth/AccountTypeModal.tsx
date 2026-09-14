import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { invalidateMyClasses } from '@/classroom/useMyClasses'
import type { Role } from '@/classroom/roles'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { RoleChoice } from './RoleChoice'

/**
 * Changes the signed-in account's type. The database refuses while the account
 * still owns classes (teacher) or belongs to one (student); that refusal is
 * shown here as-is, and nothing changes until the save succeeds.
 */
export function AccountTypeModal({ onClose }: { onClose: () => void }) {
  const current = useAuthStore((s) => s.profile?.role ?? 'general')
  const updateRole = useAuthStore((s) => s.updateRole)
  const [role, setRole] = useState<Role>(current)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (role === current) {
      onClose()
      return
    }
    setSaving(true)
    setError(null)
    const result = await updateRole(role)
    if (result.error) {
      setError(result.error)
      setSaving(false)
      return
    }
    invalidateMyClasses()
    onClose()
  }

  return (
    <Modal title="Account type" onClose={saving ? () => {} : onClose}>
      <RoleChoice name="account-type" value={role} onChange={setRole} />
      {error && (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void save()} loading={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Modal>
  )
}
