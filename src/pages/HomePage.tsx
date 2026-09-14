import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePresentationStore, type DeckSummary } from '@/store/presentationStore'
import { DashboardShell } from '@/components/home/DashboardShell'
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
import { useExportPptx } from '@/export/useExportPptx'

export function HomePage() {
  const navigate = useNavigate()
  const { listDecks, deleteDeck } = usePresentationStore()
  const [decks, setDecks] = useState<DeckSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [deckPendingDelete, setDeckPendingDelete] = useState<DeckSummary | null>(null)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<DeckView>('grid')
  const [filters, setFilters] = useState<DeckFilters>(DEFAULT_FILTERS)
  const { error: exportError, exportingId, exportDeckById } = useExportPptx()

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
    <DashboardShell
      title="Your presentations"
      subtitle={
        loading
          ? 'Loading your workspace…'
          : hasDecks
            ? `${decks.length} ${decks.length === 1 ? 'presentation' : 'presentations'} · Describe a topic, get a finished deck`
            : 'Describe a topic, get a finished deck'
      }
      query={query}
      onQueryChange={setQuery}
    >
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
          {exportError && (
            <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
              Export failed: {exportError}
            </p>
          )}
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
                  onPresent={() => navigate(`/deck/${deck.id}/present`)}
                  onExport={() => void exportDeckById(deck.id)}
                  exporting={exportingId === deck.id}
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
                  onPresent={() => navigate(`/deck/${deck.id}/present`)}
                  onExport={() => void exportDeckById(deck.id)}
                  exporting={exportingId === deck.id}
                  onDelete={() => setDeckPendingDelete(deck)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

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
    </DashboardShell>
  )
}
