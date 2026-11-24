import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CLONE_CONSENT_POINTS, CLONE_CONSENT_STATEMENT } from '@/voice/cloneConsent'
import { CloneConsentModal } from './CloneConsentModal'

/** A render smoke test: what the one-time consent dialog says and offers. */

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/'/g, '&#x27;')

describe('CloneConsentModal', () => {
  const html = renderToStaticMarkup(<CloneConsentModal onAgree={() => {}} onCancel={() => {}} />)

  // The recording leaves the browser for a shared account: said before the first recording, not after.
  it('says where the recording goes and who can see the copy', () => {
    expect(html).toContain('>Before you record<')
    for (const point of CLONE_CONSENT_POINTS) expect(html).toContain(escape(point))
    expect(html).toContain('Deleting your Lektura account deletes it too.')
  })

  it('states what agreeing means, and offers I agree and Cancel', () => {
    expect(html).toContain(CLONE_CONSENT_STATEMENT)
    expect(html).toContain('>I agree<')
    expect(html).toContain('>Cancel<')
  })

  // A stray Enter must never agree on the user's behalf.
  it('focuses nothing by default', () => {
    expect(html).not.toContain('autofocus')
  })
})
