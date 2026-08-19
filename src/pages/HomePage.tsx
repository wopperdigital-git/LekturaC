import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePresentationStore, type DeckSummary } from '@/store/presentationStore'
import { useAuthStore } from '@/store/authStore'
import { AppSidebar } from '@/components/home/AppSidebar'
import { DeckCard } from '@/components/home/DeckCard'
import { DeckGridSkeleton } from '@/components/home/DeckCardSkeleton'
import { DeckListRow } from '@/components/home/DeckListRow'
import { DeckToolbar } from '@/components/home/DeckToolbar'
import { DeleteDeckModal } from '@/components/home/DeleteDeckModal'
import { EmptyDeckState } from '@/components/home/EmptyDeckState'
import { NoDeckMatches } from '@/components/home/NoDeckMatches'
import {
  DEFAULT_FILTERS,
  selectDecks,
  type DeckFilters,
  type DeckView,
} from '@/components/home/deckFilters'

export function HomePage() {
  const navigate = useNavigate()
  const { listDecks, deleteDeck } = usePresentationStore()
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  const [decks, setDecks] = useState<DeckSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [deckPendingDelete, setDeckPendingDelete] = useState<DeckSummary | null>(null)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<DeckView>('grid')
  const [filters, setFilters] = useState<DeckFilters>(DEFAULT_FILTERS)
  const [menuOpen, setMenuOpen] = useState(false)

  async function refresh() {
    setLoading(true)
    const list = await listDecks().catch(() => [])
    setDecks(list)
    setLoading(false)
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visibleDecks = useMemo(
    () => selectDecks(decks, query, filters),
    [decks, query, filters],
  )

  const hasDecks = decks.length > 0

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
        <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 lg:px-10 ">
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
                Your presentations
              </h1>
              <p className="mt-1.5 text-sm text-app-muted">
                {loading
                  ? 'Loading your workspace…'
                  : hasDecks
                    ? `${decks.length} ${decks.length === 1 ? 'presentation' : 'presentations'} · Describe a topic, get a finished deck`
                    : 'Describe a topic, get a finished deck'}
              </p>
            </div>
          </div>

          {/* the working surface — toolbar strip on top, decks below, one bordered panel */}
          <section className="overflow-hidden rounded-app border border-app-border bg-app-background shadow-md">
            <DeckToolbar
              view={view}
              onViewChange={setView}
              filters={filters}
              onFiltersChange={setFilters}
              onCreate={() => navigate('/new')}
            />

            <div className="p-4 sm:p-5">
              {loading ? (
                <DeckGridSkeleton view={view} />
              ) : !hasDecks ? (
                <EmptyDeckState onCreate={() => navigate('/new')} />
              ) : visibleDecks.length === 0 ? (
                <NoDeckMatches
                  query={query.trim()}
                  onClear={() => {
                    setQuery('')
                    setFilters(DEFAULT_FILTERS)
                  }}
                />
              ) : view === 'list' ? (
                <div className="flex flex-col gap-1">
                  {visibleDecks.map((deck) => (
                    <DeckListRow
                      key={deck.id}
                      deck={deck}
                      onOpen={() => navigate(`/deck/${deck.id}`)}
                      onDelete={() => setDeckPendingDelete(deck)}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {visibleDecks.map((deck) => (
                    <DeckCard
                      key={deck.id}
                      deck={deck}
                      onOpen={() => navigate(`/deck/${deck.id}`)}
                      onDelete={() => setDeckPendingDelete(deck)}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {deckPendingDelete && (
        <DeleteDeckModal
          deck={deckPendingDelete}
          onCancel={() => setDeckPendingDelete(null)}
          onConfirm={async () => {
            await deleteDeck(deckPendingDelete.id)
            setDeckPendingDelete(null)
            await refresh()
          }}
        />
      )}
    </div>
  )
}
