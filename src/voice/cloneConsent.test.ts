import { describe, expect, it } from 'vitest'
import { cloneConsentKey, hasCloneConsent, rememberCloneConsent } from './cloneConsent'

function memory() {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  }
}

describe('clone consent', () => {
  it('is not given until remembered, then is given for that user only', () => {
    const s = memory()
    expect(hasCloneConsent('u1', s)).toBe(false)
    rememberCloneConsent('u1', s)
    expect(hasCloneConsent('u1', s)).toBe(true)
    expect(hasCloneConsent('u2', s)).toBe(false)
  })

  // One person's yes must not stand for whoever signs in next on the same browser.
  it('keys the agreement by user id and wording version', () => {
    expect(cloneConsentKey('u1')).toBe('lektura:voice-clone-consent:v1:u1')
  })

  it('never counts as given with no user, and remembers nothing for no user', () => {
    const s = memory()
    rememberCloneConsent(null, s)
    expect(s.data.size).toBe(0)
    expect(hasCloneConsent(null, s)).toBe(false)
  })

  it('reads a storage that throws as not given, and survives one that refuses writes', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(hasCloneConsent('u1', broken)).toBe(false)
    expect(() => rememberCloneConsent('u1', broken)).not.toThrow()
    expect(hasCloneConsent('u1', null)).toBe(false)
  })
})
