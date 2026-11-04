import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { imagesConfigured, searchPhotos, ImageSearchError } from '@/images/pexels'
import { photoFromLink } from '@/images/link'
import type { Photo } from '@/images/types'
import { PHOTOS_NOT_SET_UP } from '@/lib/setupCopy'

/**
 * Pick a photo: search Pexels, or paste an image link. App chrome (`app-*` tokens), not
 * slide styling. Without a Pexels key the search is replaced by a set-up message and the
 * paste field still works.
 *
 * Results show "Photo: <name> / Pexels" with the photographer linked, which is where
 * Pexels' link attribution lives; slides themselves show the credit as plain text. The
 * credit sits beside the photo button, not inside it (a link in a button is invalid).
 */

export const SEARCH_DEBOUNCE_MS = 400
const RESULTS_PER_PAGE = 15

type Search =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'done'; photos: Photo[] }
  | { state: 'error'; message: string }

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

export function ImagePicker({
  open,
  onClose,
  onPick,
  initialQuery = '',
}: {
  open: boolean
  onClose: () => void
  onPick: (photo: Photo) => void
  initialQuery?: string
}) {
  if (!open) return null
  // Mounted only while open, so every opening starts from a clean search and link field.
  return (
    <Modal title="Choose a photo" onClose={onClose} maxWidth="max-w-3xl">
      <PickerBody onPick={onPick} initialQuery={initialQuery} />
    </Modal>
  )
}

function PickerBody({ onPick, initialQuery }: { onPick: (photo: Photo) => void; initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery)
  const [search, setSearch] = useState<Search>({ state: 'idle' })
  const [link, setLink] = useState('')
  const [linkInvalid, setLinkInvalid] = useState(false)

  // Debounced search. Cleanup runs on every keystroke, on close and on unmount: it cancels
  // the timer and aborts the request in flight, so a stale reply can never land.
  useEffect(() => {
    const q = query.trim()
    if (!imagesConfigured || q === '') return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setSearch({ state: 'loading' })
      searchPhotos(q, { signal: controller.signal, perPage: RESULTS_PER_PAGE })
        .then((photos) => {
          if (!controller.signal.aborted) setSearch({ state: 'done', photos })
        })
        .catch((err: unknown) => {
          // An abort is a cancel, never an error to show.
          if (controller.signal.aborted || isAbort(err)) return
          setSearch({
            state: 'error',
            message: err instanceof ImageSearchError ? err.message : 'Photo search failed. Try again.',
          })
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  const showing: Search = query.trim() === '' ? { state: 'idle' } : search

  function submitLink(e: FormEvent) {
    e.preventDefault()
    const photo = photoFromLink(link)
    if (!photo) {
      setLinkInvalid(true)
      return
    }
    onPick(photo)
  }

  return (
    <div className="space-y-6">
      <section aria-label="Search photos">
        {imagesConfigured ? (
          <>
            <label htmlFor="photo-search" className="mb-1.5 block text-sm font-medium text-app-foreground">
              Search for a photo
            </label>
            <Input
              id="photo-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. mountain lake at sunrise"
              autoFocus
            />
            <SearchResults search={showing} onPick={onPick} />
            <p className="mt-3 text-xs text-app-muted">
              Photos from{' '}
              <a
                href="https://www.pexels.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-app-foreground"
              >
                Pexels
              </a>
            </p>
          </>
        ) : (
          <p className="rounded-app-sm border border-app-border bg-app-surface px-3 py-2.5 text-sm text-app-muted">
            {PHOTOS_NOT_SET_UP}
          </p>
        )}
      </section>

      <form onSubmit={submitLink} className="border-t border-app-border pt-5" noValidate>
        <label htmlFor="photo-link" className="mb-1.5 block text-sm font-medium text-app-foreground">
          Paste an image link
        </label>
        <div className="flex gap-2">
          <Input
            id="photo-link"
            type="url"
            value={link}
            onChange={(e) => {
              setLink(e.target.value)
              setLinkInvalid(false)
            }}
            placeholder="https://example.com/photo.jpg"
            invalid={linkInvalid}
            aria-describedby={linkInvalid ? 'photo-link-error' : undefined}
          />
          <Button type="submit" variant="primary" className="shrink-0" disabled={link.trim() === ''}>
            Use this image
          </Button>
        </div>
        {linkInvalid && (
          <p id="photo-link-error" role="alert" className="mt-1.5 text-xs text-app-danger-text">
            That does not look like an image link. It should start with http:// or https://.
          </p>
        )}
      </form>
    </div>
  )
}

function SearchResults({ search, onPick }: { search: Search; onPick: (photo: Photo) => void }) {
  if (search.state === 'idle') return null
  if (search.state === 'loading') {
    return (
      <div className="mt-4 flex items-center gap-2 text-sm text-app-muted" role="status">
        <Spinner /> Searching…
      </div>
    )
  }
  if (search.state === 'error') {
    return (
      <p role="alert" className="mt-4 text-sm text-app-danger-text">
        {search.message}
      </p>
    )
  }
  if (search.photos.length === 0) {
    return (
      <p role="status" className="mt-4 text-sm text-app-muted">
        No photos for that search
      </p>
    )
  }
  return (
    <ul className="mt-4 grid grid-cols-3 gap-3">
      {search.photos.map((photo) => (
        <li key={photo.url} className="min-w-0">
          <button
            type="button"
            onClick={() => onPick(photo)}
            aria-label={photo.alt}
            className="block w-full cursor-pointer overflow-hidden rounded-app-sm border border-app-border transition-colors hover:border-app-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
          >
            <img src={photo.url} alt="" loading="lazy" className="aspect-video w-full object-cover" />
          </button>
          <p className="mt-1 truncate text-xs text-app-muted">
            Photo:{' '}
            <a
              href={photo.credit.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-app-foreground"
            >
              {photo.credit.name}
            </a>{' '}
            / Pexels
          </p>
        </li>
      ))}
    </ul>
  )
}
