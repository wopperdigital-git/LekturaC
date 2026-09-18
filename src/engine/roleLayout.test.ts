import { describe, expect, it } from 'vitest'
import type { ContentBlock } from './contentBlocks'
import { roleLayoutHint } from './roleLayout'

const heading: ContentBlock = { type: 'heading', text: 'One clear sentence' }
const paragraph: ContentBlock = { type: 'paragraph', text: 'Supporting line.' }
const bullets: ContentBlock = { type: 'bulletList', items: ['a', 'b', 'c'] }
const stat: ContentBlock = { type: 'stat', value: '42%', label: 'of teams' }

describe('roleLayoutHint', () => {
  it('gives an opening role the hero treatment', () => {
    expect(roleLayoutHint('hook', [heading, paragraph])).toBe('hero')
    expect(roleLayoutHint('title-roadmap', [heading])).toBe('hero')
    expect(roleLayoutHint('title-why-matters', [heading, paragraph])).toBe('hero')
  })

  it('gives the story blueprint\'s dramatic slides the hero treatment too', () => {
    // chooseLayout awards `hero` only to card #1, so without this an insight or
    // a closing line renders as a generic standard slide.
    expect(roleLayoutHint('insight', [heading, paragraph])).toBe('hero')
    expect(roleLayoutHint('closing-line', [heading])).toBe('hero')
    expect(roleLayoutHint('closing', [heading])).toBe('hero')
  })

  it('refuses hero when the card carries more than a heading and a line', () => {
    // The hero layouts are built for one heading plus at most one paragraph.
    expect(roleLayoutHint('hook', [heading, paragraph, bullets])).toBeNull()
    expect(roleLayoutHint('insight', [heading, stat])).toBeNull()
  })

  it('numbers a recap that actually holds a list', () => {
    expect(roleLayoutHint('recap', [heading, bullets])).toBe('numberedList')
    expect(roleLayoutHint('recap-next-steps', [heading, bullets])).toBe('numberedList')
  })

  it('leaves a recap with no list to the classifier', () => {
    expect(roleLayoutHint('recap', [heading, paragraph])).toBeNull()
  })

  it('leaves every other role to the classifier', () => {
    for (const role of ['proof', 'offer', 'core-idea-2', 'journey', 'application']) {
      expect(roleLayoutHint(role, [heading, paragraph])).toBeNull()
    }
  })

  it('handles a missing or unknown role', () => {
    expect(roleLayoutHint(undefined, [heading])).toBeNull()
    expect(roleLayoutHint('introduction', [heading])).toBeNull()
  })
})
