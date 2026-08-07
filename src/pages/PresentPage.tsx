import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { usePresentationStore } from '@/store/presentationStore'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { LayoutRenderer } from '@/components/layouts/LayoutRenderer'

export function PresentPage() {
  const { id } = useParams<{ id: string }>()
  const store = usePresentationStore()

  useEffect(() => {
    if (id) store.loadDeck(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!id || store.status === 'loading') {
    return <div className="p-8 text-app-muted">Loading…</div>
  }

  const sorted = [...store.cards].sort((a, b) => a.orderIndex - b.orderIndex)

  return (
    <ThemeProvider theme={store.theme}>
      <div className="min-h-screen bg-slide-canvas">
        <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-16">
          {sorted.map((card, index) => (
            <section
              key={card.id}
              className="w-full rounded-slide bg-slide-background p-8 shadow-slide sm:p-10"
            >
              <LayoutRenderer card={card} context={{ isFirstCard: index === 0 }} />
            </section>
          ))}
        </div>
      </div>
    </ThemeProvider>
  )
}
