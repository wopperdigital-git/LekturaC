import { describe, expect, it } from 'vitest'
import {
  CREATABLE_KINDS,
  contentLines,
  layoutForKind,
  starterBlocks,
  type CreatableKind,
} from './cardTemplates'
import { cardKind, layoutVarieties, resolveLayout } from './layoutEngine'
import type { ContentBlock } from './contentBlocks'
import type { Photo } from '@/images/types'

/*
  The one promise the picker makes: the type you pick is the type you get.

  A user choosing "Timeline" from the modal and landing on a card the classifier
  reads as a bullet list would be the whole feature broken, and nothing else in
  the app would notice — the card would render, save and export perfectly well
  as the wrong kind of slide. So the round trip is pinned here rather than left
  to the starter table agreeing by eye.
*/

/** The context a card of this kind sits in — `title` only classifies as one at the front. */
const PHOTO: Photo = {
  url: 'https://images.pexels.com/photos/1/photo.jpeg',
  alt: 'A mountain lake',
  credit: { name: 'Ada Lens', url: 'https://www.pexels.com/@ada', source: 'pexels' },
}

/** A kind's starter blocks; an image slide needs the photo it is created with. */
const starter = (kind: CreatableKind) => starterBlocks(kind, PHOTO)

const contextFor = (kind: CreatableKind) => ({ isFirstCard: kind === 'title' })

describe('starterBlocks', () => {
  it.each(CREATABLE_KINDS)('a new %s card reads back as that type', (kind) => {
    expect(cardKind(starter(kind), contextFor(kind))).toBe(kind)
  })

  it.each(CREATABLE_KINDS)('a new %s card resolves to a layout its own picker offers', (kind) => {
    const blocks = starter(kind)
    const resolved = resolveLayout(layoutForKind(kind), blocks, contextFor(kind))
    const offered = layoutVarieties(blocks, kind).map((v) => v.layout)
    expect(offered).toContain(resolved)
  })

  /*
    A title slide added at position 9 is still a title slide. `chooseLayout`
    only awards `hero` to the first card in the deck, so this is the one type
    that has to name its layout explicitly — without it the card silently
    renders as a plain standard slide and the modal's promise is broken for
    every position but the first.
  */
  it('gives a title card the hero layout wherever it sits', () => {
    const blocks = starterBlocks('title')
    expect(resolveLayout(layoutForKind('title'), blocks, { isFirstCard: false })).toBe('hero')
  })

  it('leaves every other type on the classifier, except an image slide', () => {
    for (const kind of CREATABLE_KINDS.filter((k) => k !== 'title' && k !== 'image')) {
      expect(layoutForKind(kind)).toBe('auto')
    }
  })

  it('names the photo layout for an image slide', () => {
    expect(layoutForKind('image')).toBe('imageFocus')
  })

  it('builds an image slide from the photo: heading, the image with its credit, a caption', () => {
    expect(starterBlocks('image', PHOTO)).toEqual([
      { type: 'heading', text: 'Image title' },
      { type: 'image', url: PHOTO.url, alt: PHOTO.alt, credit: PHOTO.credit },
      { type: 'paragraph', text: 'Add a caption' },
    ])
  })

  it('refuses to build an image slide without a photo', () => {
    expect(() => starterBlocks('image')).toThrow()
  })

  /*
    Editing one card's placeholder text must not edit every other card created
    from the same template — the starter table would otherwise be shared
    structure handed out by reference.
  */
  it('hands out a fresh copy each time', () => {
    const first = starterBlocks('list')
    const second = starterBlocks('list')
    expect(first[1]).not.toBe(second[1])
    ;(first[1] as { items: string[] }).items[0] = 'Edited'
    expect((second[1] as { items: string[] }).items[0]).toBe('First point')
  })
})

const HEADING: ContentBlock = { type: 'heading', text: 'The heading' }

describe('contentLines', () => {
  it('skips the heading and keeps everything else in reading order', () => {
    const lines = contentLines([
      HEADING,
      { type: 'paragraph', text: 'Prose' },
      { type: 'bulletList', items: ['One', 'Two'] },
      { type: 'timelineStep', label: 'Step', text: 'Detail' },
    ])
    expect(lines).toEqual(['Prose', 'One', 'Two', 'Step — Detail'])
  })

  // A stat's number and its label are two runs on screen but one thought;
  // splitting them into two lines reads as an accidental duplicate.
  it('keeps a stat value with its label', () => {
    expect(contentLines([HEADING, { type: 'stat', value: '40%', label: 'Faster' }])).toEqual([
      '40% Faster',
    ])
  })

  it('drops an image with no alt text rather than writing a line about it', () => {
    expect(contentLines([HEADING, { type: 'image', url: 'x.png' }])).toEqual([])
    expect(contentLines([HEADING, { type: 'image', url: 'x.png', alt: 'A chart' }])).toEqual([
      'A chart',
    ])
  })
})
