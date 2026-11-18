import { describe, expect, it } from 'vitest'
import type { ContentBlock } from './contentBlocks'
import { STATEMENT_MAX_LEAD } from './layoutEngine'
import { generatedLayout, roleLayoutHint, structuralLayout } from './roleLayout'

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

  it('still sees a title-shaped card when a photo was appended after its words', () => {
    const photo: ContentBlock = { type: 'image', url: 'https://example.com/a.jpg' }
    expect(roleLayoutHint('insight', [heading, paragraph, photo])).toBe('hero')
    expect(roleLayoutHint('closing-line', [heading, photo])).toBe('hero')
    expect(roleLayoutHint('insight', [heading, bullets, photo])).toBeNull()
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

describe('generatedLayout', () => {
  it('always makes the first card a title slide, whatever it holds or its role', () => {
    expect(generatedLayout(0, undefined, [heading, paragraph])).toBe('hero')
    expect(generatedLayout(0, 'problem', [heading, bullets])).toBe('hero')
    expect(generatedLayout(0, 'recap', [heading, stat])).toBe('hero')
  })

  it('defers to the role hint, then the classifier, for every later card', () => {
    expect(generatedLayout(1, 'insight', [heading, paragraph])).toBe('hero')
    expect(generatedLayout(1, 'recap', [heading, bullets])).toBe('numberedList')
    expect(generatedLayout(1, undefined, [heading, bullets])).toBe('auto')
  })
})

describe('structuralLayout and generatedLayout: section and statement named at ingest', () => {
  const longParagraph = (n: number): ContentBlock => ({ type: 'paragraph', text: 'x'.repeat(n) })

  it('names a lone heading a section', () => {
    expect(structuralLayout([heading])).toBe('section')
    expect(generatedLayout(3, undefined, [heading])).toBe('section')
  })

  it('names a heading and a paragraph of at most 140 characters a statement', () => {
    expect(structuralLayout([heading, longParagraph(STATEMENT_MAX_LEAD)])).toBe('statement')
    expect(generatedLayout(2, undefined, [heading, paragraph])).toBe('statement')
  })

  it('leaves a 141-character paragraph, a different order or any other shape unnamed', () => {
    expect(structuralLayout([heading, longParagraph(STATEMENT_MAX_LEAD + 1)])).toBeNull()
    expect(generatedLayout(2, undefined, [heading, longParagraph(STATEMENT_MAX_LEAD + 1)])).toBe('auto')
    expect(structuralLayout([paragraph, heading])).toBeNull()
    expect(structuralLayout([heading, paragraph, paragraph])).toBeNull()
    expect(structuralLayout([heading, stat])).toBeNull()
    expect(structuralLayout([paragraph])).toBeNull()
    expect(structuralLayout([])).toBeNull()
  })

  it('never names card 0, which stays hero', () => {
    expect(generatedLayout(0, undefined, [heading])).toBe('hero')
    expect(generatedLayout(0, undefined, [heading, paragraph])).toBe('hero')
  })

  it('lets a role hint that already named a layout win', () => {
    expect(generatedLayout(2, 'insight', [heading])).toBe('hero')
    expect(generatedLayout(2, 'closing-line', [heading, paragraph])).toBe('hero')
  })
})
