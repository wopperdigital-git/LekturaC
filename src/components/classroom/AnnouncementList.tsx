import { useState, type FormEvent } from 'react'
import { describeError } from '@/store/presentationStore'
import { formatDate } from '@/classroom/format'
import type { Announcement, AnnouncementDetails } from '@/classroom/types'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { PanelMessage } from '@/components/classroom/Panel'

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
        <PanelMessage title="No announcements yet" body={emptyMessage} />
      ) : (
        announcements.map((a) =>
          editable && editingId === a.id ? (
            <div key={a.id} className="rounded-app border border-app-accent/50 p-4">
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
            <article
              key={a.id}
              className="group relative overflow-hidden rounded-app border border-app-border bg-app-background p-4 sm:p-5 shadow-xs transition-all duration-150 hover:border-app-border/90 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded-md bg-app-accent/10 text-app-accent">
                      <svg className="size-3.5" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M2.5 6.5h2l4.5-3.5v10l-4.5-3.5h-2a1 1 0 01-1-1v-1a1 1 0 011-1z" />
                        <path d="M12 5.5a4 4 0 010 5M13.5 3.5a7 7 0 010 9" />
                      </svg>
                    </span>
                    <h3 className="truncate text-base font-semibold text-app-foreground">{a.title}</h3>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-app-muted">
                    <svg className="size-3 text-app-muted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <rect x="2" y="3" width="12" height="11" rx="1.5" />
                      <path d="M5 1.5v3M11 1.5v3M2 6.5h12" />
                    </svg>
                    <span>{formatDate(a.createdAt)}</span>
                    {a.updatedAt !== a.createdAt && (
                      <span className="rounded-full bg-app-surface px-1.5 py-0.2 text-[10px] font-medium text-app-muted">
                        edited
                      </span>
                    )}
                  </div>
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
              {a.body && (
                <p className="mt-3 text-sm whitespace-pre-line text-app-foreground/90 leading-relaxed">
                  {a.body}
                </p>
              )}
            </article>
          ),
        )
      )}
    </div>
  )
}
