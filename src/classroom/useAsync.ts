import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { describeError } from '@/store/presentationStore'

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; data: T }

/**
 * A page's one load, with retry.
 *
 * `reload` keeps the current data on screen while the fresh copy arrives, so
 * the list does not flash a skeleton after every write; only a retry from the
 * error state goes back to loading. `key` restarts the load when it changes
 * (the signed-in user's id, in practice).
 */
export function useAsync<T>(load: () => Promise<T>, key: string): { state: AsyncState<T>; reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  const loadRef = useRef(load)

  useLayoutEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    let cancelled = false
    loadRef.current().then(
      (data) => {
        if (!cancelled) setState({ status: 'ready', data })
      },
      (err: unknown) => {
        console.error('[classroom] Load failed.', err)
        if (!cancelled) setState({ status: 'error', error: describeError(err) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [key, version])

  const reload = useCallback(() => {
    setState((current) => (current.status === 'error' ? { status: 'loading' } : current))
    setVersion((v) => v + 1)
  }, [])

  return { state, reload }
}
