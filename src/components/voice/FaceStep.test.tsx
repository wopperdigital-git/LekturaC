import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FaceStep } from './FaceStep'

/**
 * A render smoke test: what the step offers in which state. The file picker, the upload and the
 * two-press Remove are live DOM state and are checked by hand.
 */

const PHOTO = { path: 'u1/face.jpg', url: 'https://example.test/face.jpg' }

const render = (props: Partial<Parameters<typeof FaceStep>[0]> = {}) =>
  renderToStaticMarkup(
    <FaceStep
      uid="u1"
      photo={null}
      onPhoto={() => {}}
      checked={false}
      onToggle={() => {}}
      blocker={null}
      costLine={null}
      {...props}
    />,
  )

const switchTag = (html: string) => html.match(/<input[^>]*id="voice-face-switch"[^>]*>/)?.[0] ?? ''

describe('FaceStep', () => {
  it('offers the file picker, consent and a disabled Upload photo while there is no photo', () => {
    const html = render({ blocker: 'Add a photo of your face first.' })
    expect(html).toContain('accept="image/jpeg,image/png,image/webp"')
    expect(html).toContain('This is my face, or I have permission to use it.')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Upload photo/)
    expect(html).not.toContain('Remove')
    expect(html).not.toContain('Replace')
  })

  it('shows the blocker beside a disabled, unchecked switch', () => {
    const html = render({ blocker: 'Add a photo of your face first.' })
    expect(html).toContain('Add a talking intro &amp; outro')
    expect(switchTag(html)).toContain('disabled=""')
    expect(switchTag(html)).not.toContain('checked=""')
    expect(html).toContain('Add a photo of your face first.')
  })

  it('shows the saved photo as a 64px round thumbnail with Replace and Remove, and no picker', () => {
    const html = render({ photo: PHOTO, checked: true })
    expect(html).toMatch(/<img[^>]*src="https:\/\/example.test\/face.jpg"[^>]*class="[^"]*size-16[^"]*rounded-full/)
    expect(html).toContain('>Replace<')
    expect(html).toContain('>Remove<')
    expect(html).not.toContain('type="file"')
    expect(html).not.toContain('Upload photo')
    expect(switchTag(html)).not.toContain('disabled=""')
    expect(switchTag(html)).toContain('checked=""')
  })

  it('shows the cost line when it is given, and not otherwise', () => {
    const line = 'Adds about 2–5 min and $0.45 (WaveSpeed). It still bills if you cancel.'
    expect(render({ photo: PHOTO, checked: true, costLine: line })).toContain(line)
    expect(render({ photo: PHOTO, checked: true })).not.toContain('WaveSpeed')
  })

  it('while the saved photo is being looked up, hides the picker and thumbnail, shows no blocker and keeps the switch off', () => {
    const html = render({ checking: true, blocker: 'Add a photo of your face first.' })
    expect(html).toContain('Checking for your photo…')
    expect(html).not.toContain('Add a photo of your face first.')
    expect(html).not.toContain('type="file"')
    expect(html).not.toContain('Upload photo')
    expect(html).not.toContain('<img')
    expect(switchTag(html)).toContain('disabled=""')
    expect(render({ blocker: 'x' })).not.toContain('Checking for your photo')
  })

  it('never names a key variable', () => {
    expect(render()).not.toContain('VITE_')
  })
})
