import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePresentationStore, type DeckSummary } from '@/store/presentationStore'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'

export function HomePage() {
  const navigate = useNavigate()
  const { listDecks, deleteDeck } = usePresentationStore()
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  const [decks, setDecks] = useState<DeckSummary[]>([])
  const [loading, setLoading] = useState(true)

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

  return (
    <div className="min-h-screen bg-app-canvas">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-semibold text-app-foreground">Your presentations</h1>
          <div className="flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-2 text-xs text-app-muted">
                <span>{user.email}</span>
                <button
                  onClick={() => void signOut()}
                  className="cursor-pointer hover:text-app-foreground hover:underline"
                >
                  Log out
                </button>
              </div>
            )}
            <Button variant="primary" onClick={() => navigate('/new')}>
              + New presentation
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="text-app-muted">Loading…</p>
        ) : decks.length === 0 ? (
          <p className="text-app-muted">No presentations yet — create one to get started.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {decks.map((deck) => (
              <li
                key={deck.id}
                className="flex items-center justify-between rounded-app bg-app-background px-5 py-4 shadow-app transition-transform hover:-translate-y-0.5"
              >
                <button
                  className="flex-1 cursor-pointer text-left"
                  onClick={() => navigate(`/deck/${deck.id}`)}
                >
                  <div className="font-medium text-app-foreground">{deck.title}</div>
                  <div className="text-xs text-app-muted">
                    Updated {new Date(deck.updatedAt).toLocaleString()}
                  </div>
                </button>
                <button
                  onClick={async () => {
                    await deleteDeck(deck.id)
                    await refresh()
                  }}
                  className="cursor-pointer text-xs text-red-600 hover:underline"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
