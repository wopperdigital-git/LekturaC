import { describe, expect, it } from 'vitest'
import { chooseLayout, resolveLayout } from './layoutEngine'
import type { ContentBlock } from './contentBlocks'

function heading(text = 'Title'): ContentBlock {
  return { type: 'heading', text }
}
function paragraph(text = 'Body copy'): ContentBlock {
  return { type: 'paragraph', text }
}
function bulletList(items: string[]): ContentBlock {
  return { type: 'bulletList', items }
}
function stat(value = '42%', label = 'growth'): ContentBlock {
  return { type: 'stat', value, label }
}
function image(url = 'https://example.com/a.png'): ContentBlock {
  return { type: 'image', url }
}
function quote(text = 'A quote', attribution?: string): ContentBlock {
  return { type: 'quote', text, attribution }
}
function timelineStep(label = 'Step', text = 'Detail'): ContentBlock {
  return { type: 'timelineStep', label, text }
}
function comparisonGroup(heading = 'Option', items: string[] = ['a']): ContentBlock {
  return { type: 'comparisonGroup', heading, items }
}

describe('chooseLayout', () => {
  it('picks hero for a lone heading on the first card', () => {
    expect(chooseLayout([heading()], { isFirstCard: true })).toBe('hero')
  })

  it('does not pick hero for a lone heading on a non-first card', () => {
    expect(chooseLayout([heading()], { isFirstCard: false })).toBe('standard')
  })

  it('does not pick hero when the first card has more than a heading + one other block', () => {
    expect(chooseLayout([heading(), paragraph(), paragraph()], { isFirstCard: true })).not.toBe('hero')
  })

  it('picks statHero for exactly one stat', () => {
    expect(chooseLayout([heading(), stat()])).toBe('statHero')
  })

  it('picks statGrid for 2-4 stats', () => {
    expect(chooseLayout([stat(), stat()])).toBe('statGrid')
    expect(chooseLayout([stat(), stat(), stat(), stat()])).toBe('statGrid')
  })

  it('falls through statGrid back to standard above 4 stats', () => {
    expect(chooseLayout([stat(), stat(), stat(), stat(), stat()])).toBe('standard')
  })

  it('picks comparison for 2-4 comparison groups', () => {
    expect(chooseLayout([comparisonGroup(), comparisonGroup()])).toBe('comparison')
  })

  it('picks timeline for 2+ timeline steps', () => {
    expect(chooseLayout([timelineStep(), timelineStep()])).toBe('timeline')
  })

  it('picks quote for a single quote with no competing content', () => {
    expect(chooseLayout([quote()])).toBe('quote')
  })

  it('picks iconGrid for a short single bullet list', () => {
    expect(chooseLayout([bulletList(['short', 'items', 'here'])])).toBe('iconGrid')
  })

  it('picks numberedList when bullet items are too long for iconGrid', () => {
    const longItem = 'x'.repeat(41)
    expect(chooseLayout([bulletList([longItem])])).toBe('numberedList')
  })

  it('picks numberedList when there are more than 6 short bullet items', () => {
    const items = Array.from({ length: 7 }, (_, i) => `item ${i}`)
    expect(chooseLayout([bulletList(items)])).toBe('numberedList')
  })

  it('picks gallery for 2+ images with no paragraphs', () => {
    expect(chooseLayout([image(), image()])).toBe('gallery')
  })

  it('picks standardSplit for heading + paragraph + one image', () => {
    expect(chooseLayout([heading(), paragraph(), image()])).toBe('standardSplit')
  })

  it('picks textFocus for 2+ paragraphs with no other content', () => {
    expect(chooseLayout([paragraph(), paragraph()])).toBe('textFocus')
  })

  it('falls back to standard when nothing else matches', () => {
    expect(chooseLayout([heading()])).toBe('standard')
  })
})

describe('resolveLayout', () => {
  it('defers to chooseLayout when layout is auto', () => {
    expect(resolveLayout('auto', [stat(), stat()])).toBe('statGrid')
  })

  it('respects an explicit non-auto override', () => {
    expect(resolveLayout('gallery', [heading()])).toBe('gallery')
  })
})
