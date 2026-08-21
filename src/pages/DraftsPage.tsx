import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { AppSidebar } from '@/components/home/AppSidebar'
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
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)

  const drafts = useDrafts()
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<BriefDraft | null>(null)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return drafts
    return drafts.filter((d) => draftTitle(d).toLowerCase().includes(q))
  }, [drafts, query])

  const hasDrafts = drafts.length > 0

  return (
    <div className="flex h-screen overflow-hidden bg-app-canvas">
      <AppSidebar
        query={query}
        onQueryChange={setQuery}
        email={user?.email}
        onSignOut={() => void signOut()}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
          <div className="mb-6 flex items-start gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className="mt-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-app-sm border border-app-border bg-app-background text-app-foreground transition-colors hover:bg-app-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent lg:hidden"
            >
              <svg
                className="size-4"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
              </svg>
            </button>

            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-app-foreground sm:text-3xl">
                Drafts
              </h1>
              <p className="mt-1.5 text-sm text-app-muted">
                {hasDrafts
                  ? `${drafts.length} unfinished ${drafts.length === 1 ? 'brief' : 'briefs'} · Saved on this device`
                  : 'Briefs you started but never generated show up here'}
              </p>
            </div>
          </div>

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
        </div>
      </main>

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
    </div>
  )
}
