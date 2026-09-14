import { useState, type FormEvent } from 'react'
import { describeError } from '@/store/presentationStore'
import { formatDate } from '@/classroom/format'
import type { Announcement, AnnouncementDetails } from '@/classroom/types'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'

function AnnouncementForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: AnnouncementDetails
  submitLabel: string
  onSubmit: (details: AnnouncementDetails) => Promise<void>
  onCancel?: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [titleError, setTitleError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setTitleError('Give the announcement a title.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit({ title, body })
      if (!initial) {
        setTitle('')
        setBody('')
      }
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-3">
      <Field
        label="Title"
        error={titleError}
        render={(fieldProps) => (
          <Input
            {...fieldProps}
            maxLength={160}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              if (titleError) setTitleError(null)
            }}
          />
        )}
      />
      <Field
        label="Message"
        render={(fieldProps) => (
          <Textarea
            id={fieldProps.id}
            aria-describedby={fieldProps['aria-describedby']}
            rows={3}
            maxLength={4000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        )}
      />
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" loading={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

/** A class's announcements, newest first. With `editable`, a composer on top and Edit/Delete on each. */
export function AnnouncementList({
  announcements,
  emptyMessage,
  editable,
}: {
  announcements: Announcement[]
  emptyMessage: string
  editable?: {
    onCreate: (details: AnnouncementDetails) => Promise<void>
    onUpdate: (id: string, details: AnnouncementDetails) => Promise<void>
    onDelete: (announcement: Announcement) => void
  }
}) {
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4">
      {editable && (
        <div className="rounded-app-sm border border-app-border bg-app-surface/40 p-4">
          <AnnouncementForm submitLabel="Post announcement" onSubmit={editable.onCreate} />
        </div>
      )}

      {announcements.length === 0 ? (
        <p className="py-6 text-center text-sm text-app-muted">{emptyMessage}</p>
      ) : (
        announcements.map((a) =>
          editable && editingId === a.id ? (
            <div key={a.id} className="rounded-app-sm border border-app-accent/50 p-4">
              <AnnouncementForm
                initial={{ title: a.title, body: a.body }}
                submitLabel="Save changes"
                onCancel={() => setEditingId(null)}
                onSubmit={async (details) => {
                  await editable.onUpdate(a.id, details)
                  setEditingId(null)
                }}
              />
            </div>
          ) : (
            <article key={a.id} className="rounded-app-sm border border-app-border px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-app-foreground">{a.title}</h3>
                  <p className="text-xs text-app-muted">
                    {formatDate(a.createdAt)}
                    {a.updatedAt !== a.createdAt && ' · edited'}
                  </p>
                </div>
                {editable && (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEditingId(a.id)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-2 py-1 text-xs text-red-600 dark:text-red-400"
                      onClick={() => editable.onDelete(a)}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>
              {a.body && <p className="mt-2 text-sm whitespace-pre-line text-app-foreground/90">{a.body}</p>}
            </article>
          ),
        )
      )}
    </div>
  )
}
