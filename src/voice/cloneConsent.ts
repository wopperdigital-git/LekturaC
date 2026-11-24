/*
  Whether this user has agreed to have their voice copied, so the consent dialog is asked once and
  not on every recording. Browser-local on purpose, like brief drafts: it only spares the user a
  repeat of the same question on this device; another browser asks again.

  The key carries the user id (localStorage knows nothing of who is signed in, and one person's yes
  must not stand for whoever signs in next) and a version: if the wording of what they agree to
  changes, bump it and everyone is asked again.

  Every storage access is guarded: a private window or blocked site data can throw, and then the
  user is simply asked each time.
*/

export const CLONE_CONSENT_VERSION = 1

/** What the user agrees to. Changing it means bumping CLONE_CONSENT_VERSION. */
export const CLONE_CONSENT_POINTS = [
  'Your recording goes to Cartesia, the voice service this site uses, to make a copy of your voice.',
  "The copy stays in this site's Cartesia account until you delete it. Deleting your Lektura account deletes it too.",
  'Only you can pick it in Lektura. Whoever runs this site can also see it in their Cartesia account.',
] as const

export const CLONE_CONSENT_STATEMENT = 'This is my own voice, and I agree to it being copied.'

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>

export function cloneConsentKey(uid: string): string {
  return `lektura:voice-clone-consent:v${CLONE_CONSENT_VERSION}:${uid}`
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** True when this user agreed on this device. No user, no storage or any failure reads as not yet. */
export function hasCloneConsent(uid: string | null, storage: Storage | null = defaultStorage()): boolean {
  if (!uid || !storage) return false
  try {
    return storage.getItem(cloneConsentKey(uid)) === '1'
  } catch {
    return false
  }
}

/** Remembers the agreement for this user on this device. A failure only means they are asked again. */
export function rememberCloneConsent(uid: string | null, storage: Storage | null = defaultStorage()): void {
  if (!uid || !storage) return
  try {
    storage.setItem(cloneConsentKey(uid), '1')
  } catch {
    // Nothing to do: the agreement holds for this dialog, and the next one asks again.
  }
}
