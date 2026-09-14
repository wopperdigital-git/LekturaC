import { useState, type FormEvent } from 'react'
import { describeError } from '@/store/presentationStore'
import type { ClassDetails } from '@/classroom/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Field, Input, Textarea } from '@/components/ui/Input'

/** New class and Edit details share this form. The join code is never edited here. */
export function ClassFormModal({
  title,
  submitLabel,
  initial,
  onCancel,
  onSubmit,
}: {
  title: string
  submitLabel: string
  initial?: ClassDetails
  onCancel: () => void
  onSubmit: (details: ClassDetails) => Promise<void>
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [nameError, setNameError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setNameError('Give the class a name.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit({ name, description })
    } catch (err) {
      setError(describeError(err))
      setSaving(false)
    }
  }

  return (
    <Modal title={title} onClose={saving ? () => {} : onCancel}>
      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
        <Field
          label="Name"
          error={nameError}
          render={(fieldProps) => (
            <Input
              {...fieldProps}
              autoFocus
              maxLength={120}
              placeholder="e.g. Biology — Period 3"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (nameError) setNameError(null)
              }}
            />
          )}
        />
        <Field
          label="Description (optional)"
          render={(fieldProps) => (
            <Textarea
              id={fieldProps.id}
              aria-describedby={fieldProps['aria-describedby']}
              rows={3}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        />
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
