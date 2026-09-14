import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DashboardShell } from '@/components/home/DashboardShell'
import { DraftRow } from '@/components/home/DraftRow'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { deleteDraft, draftTitle, useDrafts, type BriefDraft } from '@/lib/briefDrafts'

/**
 * Unfinished briefs, kept out of the deck list on purpose: a draft isn't a
 * presentation with a status, it's a half-answered form — nothing to open,
 * present, or theme. Same shell as `HomePage` so the rail stays put across both.
 */
export function DraftsPage() {
  const navigate = useNavigate()

  const drafts = useDrafts()
  const [query, setQuery] = useState('')
  const [pendingDelete, setPendingDelete] = useState<BriefDraft | null>(null)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return drafts
    return drafts.filter((d) => draftTitle(d).toLowerCase().includes(q))
  }, [drafts, query])

  const hasDrafts = drafts.length > 0

  return (
    <DashboardShell
      title="Drafts"
      subtitle={
        hasDrafts
          ? `${drafts.length} unfinished ${drafts.length === 1 ? 'brief' : 'briefs'} · Saved on this device`
          : 'Briefs you started but never generated show up here'
      }
      query={query}
      onQueryChange={setQuery}
    >
      <section className="overflow-hidden rounded-app border border-app-border bg-app-background shadow-md">
        <div className="p-4 sm:p-5">
          {!hasDrafts ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <h2 className="text-lg font-semibold text-app-foreground">No drafts right now</h2>
              <p className="mt-2 max-w-sm text-sm text-app-muted">
                Start a presentation and leave before it generates — the brief waits here
                until you come back to finish it.
              </p>
              <Button variant="primary" onClick={() => void navigate('/new')} className="mt-6">
                + New presentation
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <h2 className="text-lg font-semibold text-app-foreground">
                No drafts match “{query.trim()}”
              </h2>
              <Button variant="secondary" onClick={() => setQuery('')} className="mt-5">
                Clear search
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {visible.map((draft) => (
                <DraftRow
                  key={draft.id}
                  draft={draft}
                  onResume={() => void navigate(`/new?draft=${draft.id}`)}
                  onDelete={() => setPendingDelete(draft)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {pendingDelete && (
        <Modal title="Delete this draft?" onClose={() => setPendingDelete(null)}>
          <p className="text-sm text-app-muted">
            “{draftTitle(pendingDelete)}” will be removed. This can't be undone.
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                deleteDraft(pendingDelete.id)
                setPendingDelete(null)
              }}
            >
              Delete draft
            </Button>
          </div>
        </Modal>
      )}
    </DashboardShell>
  )
}
