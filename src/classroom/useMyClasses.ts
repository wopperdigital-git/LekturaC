import { useEffect, useSyncExternalStore } from 'react'
import { listMyClasses } from './api'
import type { ClassRoom } from './types'

/*
  The rail's class list, shared by every page that renders the rail — read
  here rather than threaded through each page, the way the Drafts badge is.

  Keyed by user id so a sign-out/sign-in never shows the previous account's
  classes. Any write that changes the list calls `invalidateMyClasses()`.
  `generation` discards a response that an invalidation has overtaken.
*/

type Snapshot = { userId: string; classes: ClassRoom[] } | null

let snapshot: Snapshot = null
let pendingFor: string | null = null
let generation = 0
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): Snapshot {
  return snapshot
}

function fetchFor(userId: string) {
  if (pendingFor === userId) return
  pendingFor = userId
  const mine = ++generation
  listMyClasses().then(
    (classes) => {
      if (mine !== generation) return
      pendingFor = null
      snapshot = { userId, classes }
      emit()
    },
    (err: unknown) => {
      if (mine !== generation) return
      pendingFor = null
      console.warn('[classroom] Could not load classes for the sidebar.', err)
      snapshot = { userId, classes: [] }
      emit()
    },
  )
}

export function invalidateMyClasses() {
  generation++
  pendingFor = null
  snapshot = null
  emit()
}

/** The signed-in account's classes, or `null` while loading or when `enabled` is false. */
export function useMyClasses(userId: string | null, enabled: boolean): ClassRoom[] | null {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const fresh = current && current.userId === userId ? current : null

  useEffect(() => {
    if (enabled && userId && !fresh) fetchFor(userId)
  }, [enabled, userId, fresh])

  return enabled && fresh ? fresh.classes : null
}
