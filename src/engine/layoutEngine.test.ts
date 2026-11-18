import { describe, expect, it } from 'vitest'
import {
  STATEMENT_MAX_LEAD,
  cardKind,
  cardKindOf,
  chooseLayout,
  componentsForKind,
  resolveLayout,
} from './layoutEngine'
import type { ContentBlock, LayoutType } from './contentBlocks'
import { accentOwner, compositionOf, groundOfLayout } from './composition'
import { inferGroups } from './groups'
import { CPP_DECK } from './fixtures/cppDeck'
import { GALLERY_DECK } from './fixtures/galleryDeck'

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
function point(label = 'Term', text = 'Meaning'): ContentBlock {
  return { type: 'point', label, text }
}
function callout(text = 'Key idea'): ContentBlock {
  return { type: 'callout', text }
}
function code(src = 'int x = 0;'): ContentBlock {
  return { type: 'code', code: src }
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
    expect(chooseLayout([heading(), heading()])).toBe('standard')
    expect(chooseLayout([paragraph()])).toBe('standard')
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

describe('chooseLayout with a single photo set aside', () => {
  it('keeps the title treatment for the opening card', () => {
    expect(chooseLayout([heading(), paragraph(), image()], { isFirstCard: true })).toBe('hero')
    expect(chooseLayout([heading(), image()], { isFirstCard: true })).toBe('hero')
  })

  it('keeps a quote a quote', () => {
    expect(chooseLayout([heading(), quote(), image()])).toBe('quote')
  })

  it('keeps one stat a statHero', () => {
    expect(chooseLayout([heading(), stat(), image()])).toBe('statHero')
  })

  it('makes a short list beside a photo a photoList', () => {
    expect(chooseLayout([heading(), bulletList(['a', 'b', 'c']), image()])).toBe('photoList')
  })

  it('keeps heading + paragraph + photo a standardSplit', () => {
    expect(chooseLayout([heading(), paragraph(), image()])).toBe('standardSplit')
  })

  it('sends two paragraphs and a photo to standardSplit rather than textFocus', () => {
    expect(chooseLayout([heading(), paragraph(), paragraph(), image()])).toBe('standardSplit')
  })

  it('makes a heading and a photo an image slide', () => {
    expect(chooseLayout([heading(), image()])).toBe('imageFocus')
  })

  it('makes a photo on its own an image slide', () => {
    expect(chooseLayout([image()])).toBe('imageFocus')
  })

  it('keeps two photos with no paragraph a gallery', () => {
    expect(chooseLayout([heading(), image(), image()])).toBe('gallery')
  })
})

describe('the new layouts: classifier awards', () => {
  const long = (n: number) => 'x'.repeat(n)

  it('names the statement limit 140', () => {
    expect(STATEMENT_MAX_LEAD).toBe(140)
  })

  describe('section and statement', () => {
    it('are never awarded to an auto card: ingest names them, so typing never swaps the slide', () => {
      expect(chooseLayout([heading()], { isFirstCard: false })).toBe('standard')
      expect(chooseLayout([heading()])).toBe('standard')
      expect(chooseLayout([heading(), paragraph('Short.')])).toBe('standard')
      expect(chooseLayout([heading(), paragraph(long(STATEMENT_MAX_LEAD))])).toBe('standard')
      expect(chooseLayout([heading(), paragraph(long(STATEMENT_MAX_LEAD + 1))])).toBe('standard')
    })
    it('leave the opener a hero and a photo beside them an image slide or a split', () => {
      expect(chooseLayout([heading()], { isFirstCard: true })).toBe('hero')
      expect(chooseLayout([heading(), paragraph()], { isFirstCard: true })).toBe('hero')
      expect(chooseLayout([heading(), image()])).toBe('imageFocus')
      expect(chooseLayout([heading(), paragraph(), image()])).toBe('standardSplit')
    })
    it('keep two paragraphs a text focus slide', () => {
      expect(chooseLayout([heading(), paragraph(), paragraph()])).toBe('textFocus')
    })
  })

  describe('statSplit', () => {
    it('is one stat and one list, plus headings and paragraphs', () => {
      expect(chooseLayout([heading(), stat(), bulletList(['a', 'b'])])).toBe('statSplit')
      expect(chooseLayout([heading(), paragraph(), stat(), bulletList(['a', 'b'])])).toBe('statSplit')
    })
    it('does not take a quote, a second stat, steps or groups', () => {
      expect(chooseLayout([heading(), stat(), bulletList(['a']), quote()])).not.toBe('statSplit')
      expect(chooseLayout([heading(), stat(), stat(), bulletList(['a'])])).not.toBe('statSplit')
      expect(chooseLayout([heading(), stat(), bulletList(['a']), timelineStep(), timelineStep()])).not.toBe(
        'statSplit',
      )
      expect(chooseLayout([heading(), stat(), bulletList(['a']), comparisonGroup(), comparisonGroup()])).not.toBe(
        'statSplit',
      )
    })
    it('still leaves a stat without a list a statHero', () => {
      expect(chooseLayout([heading(), stat()])).toBe('statHero')
    })
    it('keeps a photo card a statHero: the photo has no place in a stat split', () => {
      expect(chooseLayout([heading(), stat(), bulletList(['a', 'b']), image()])).toBe('statHero')
    })
  })

  describe('photoList', () => {
    it('is one photo and one list, plus headings and paragraphs', () => {
      expect(chooseLayout([heading(), bulletList(['a', 'b']), image()])).toBe('photoList')
      expect(chooseLayout([heading(), paragraph(), bulletList(['a', 'b']), image()])).toBe('photoList')
      expect(chooseLayout([heading(), bulletList(['a', long(60)]), image()])).toBe('photoList')
    })
    it('takes nothing else beside them', () => {
      expect(chooseLayout([heading(), bulletList(['a']), stat(), image()])).not.toBe('photoList')
      expect(chooseLayout([heading(), bulletList(['a']), quote(), image()])).not.toBe('photoList')
    })
    it('needs exactly one photo and exactly one list', () => {
      expect(chooseLayout([heading(), bulletList(['a']), image(), image()])).not.toBe('photoList')
      expect(chooseLayout([heading(), bulletList(['a']), bulletList(['b']), image()])).not.toBe('photoList')
    })
    it('is a list slide without the photo', () => {
      expect(chooseLayout([heading(), bulletList(['a', 'b'])])).toBe('iconGrid')
    })
  })

  it('never awards the picker-only ones', () => {
    const cards: ContentBlock[][] = [
      [heading(), paragraph(), paragraph()],
      [heading(), timelineStep(), timelineStep()],
      [heading(), comparisonGroup(), comparisonGroup()],
    ]
    for (const blocks of cards) {
      expect(['twoColumn', 'steps', 'beforeAfter']).not.toContain(chooseLayout(blocks))
    }
  })
})

describe('the seven new layouts: card kinds and the picker', () => {
  const card = (layout: LayoutType, blocks: ContentBlock[]) => ({ layout, blocks })

  it('files each named layout under its kind', () => {
    expect(cardKindOf(card('section', [heading()]))).toBe('title')
    expect(cardKindOf(card('statement', [heading(), paragraph()]))).toBe('text')
    expect(cardKindOf(card('twoColumn', [heading(), paragraph(), paragraph()]))).toBe('text')
    expect(cardKindOf(card('statSplit', [heading(), stat(), bulletList(['a'])]))).toBe('stats')
    expect(cardKindOf(card('steps', [heading(), timelineStep(), timelineStep()]))).toBe('timeline')
    expect(cardKindOf(card('photoList', [heading(), bulletList(['a']), image()]))).toBe('list')
    expect(cardKindOf(card('beforeAfter', [heading(), comparisonGroup(), comparisonGroup()]))).toBe('comparison')
  })

  it('calls a lone heading a title card wherever it sits', () => {
    expect(cardKind([heading()], { isFirstCard: false })).toBe('title')
    expect(cardKind([heading()], { isFirstCard: true })).toBe('title')
  })

  it('keeps a heading beside a photo an image card', () => {
    expect(cardKind([heading(), image()], { isFirstCard: false })).toBe('image')
  })

  it('offers hero and section on a title', () => {
    expect(componentsForKind('title', [heading()])).toEqual(['hero', 'section'])
  })

  it('offers statement on text only for a heading and one paragraph', () => {
    expect(componentsForKind('text', [heading(), paragraph()])).toContain('statement')
    expect(componentsForKind('text', [heading(), paragraph(), paragraph()])).not.toContain('statement')
    expect(componentsForKind('text', [heading(), paragraph(), bulletList(['a'])])).not.toContain('statement')
    expect(componentsForKind('text', [paragraph()])).not.toContain('statement')
  })

  it('offers twoColumn on text only with two or more paragraphs', () => {
    expect(componentsForKind('text', [heading(), paragraph()])).not.toContain('twoColumn')
    expect(componentsForKind('text', [heading(), paragraph(), paragraph()])).toContain('twoColumn')
    expect(componentsForKind('text', [heading(), paragraph(), paragraph(), paragraph()])).toContain('twoColumn')
  })

  it('offers statSplit beside statHero for one stat and a list', () => {
    expect(componentsForKind('stats', [heading(), stat(), bulletList(['a'])])).toEqual(['statHero', 'statSplit'])
    expect(componentsForKind('stats', [heading(), stat()])).toEqual(['statHero'])
    expect(componentsForKind('stats', [heading(), stat(), stat(), bulletList(['a'])])).not.toContain('statSplit')
  })

  it('offers steps on a timeline', () => {
    expect(componentsForKind('timeline', [heading(), timelineStep(), timelineStep()])).toEqual([
      'timeline',
      'timelineRow',
      'steps',
    ])
  })

  it('offers beforeAfter on a comparison of exactly two groups', () => {
    const two = [heading(), comparisonGroup(), comparisonGroup()]
    expect(componentsForKind('comparison', two)).toEqual(['comparison', 'comparisonTable', 'beforeAfter'])
    const three = [heading(), comparisonGroup(), comparisonGroup(), comparisonGroup()]
    expect(componentsForKind('comparison', three)).toEqual(['comparison', 'comparisonTable'])
  })

  it('offers photoList on a list with exactly one photo', () => {
    expect(componentsForKind('list', [heading(), bulletList(['a']), image()])).toContain('photoList')
    expect(componentsForKind('list', [heading(), bulletList(['a'])])).not.toContain('photoList')
  })

  it('always lists what the classifier picked for the cards the new layouts touch', () => {
    const cards: ContentBlock[][] = [
      [heading(), paragraph()],
      [heading(), stat(), bulletList(['a', 'b'])],
      [heading(), bulletList(['a', 'b']), image()],
    ]
    for (const blocks of cards) {
      const context = { isFirstCard: false }
      expect(componentsForKind(cardKind(blocks, context), blocks)).toContain(chooseLayout(blocks, context))
    }
  })
})

describe('the seven new layouts: ground, accent and composition', () => {
  const SEVEN = ['section', 'statement', 'twoColumn', 'statSplit', 'steps', 'photoList', 'beforeAfter'] as const

  it('puts section on the deep ground, statement on the tint and the rest on neither', () => {
    expect(groundOfLayout('section')).toBe('deep')
    expect(groundOfLayout('statement')).toBe('tint')
    for (const layout of ['twoColumn', 'statSplit', 'steps', 'photoList', 'beforeAfter'] as const) {
      expect(groundOfLayout(layout), layout).toBe('plain')
    }
  })

  it('gives none of them an accent owner', () => {
    const blocks: ContentBlock[] = [heading(), stat(), comparisonGroup(), comparisonGroup()]
    for (const layout of SEVEN) expect(accentOwner(blocks, layout), layout).toBeNull()
  })

  it('stacks every one of them, whatever the units', () => {
    const blocks: ContentBlock[] = [heading('Loops'), bulletList(['a']), stat()]
    for (const layout of SEVEN) expect(compositionOf(blocks, [[1], [2]], layout), layout).toBe('stack')
    // The same card on a layout that does zone it, so the rule above is the layouts' own.
    expect(compositionOf(blocks, [[1], [2]], 'standard')).toBe('sideHead')
  })
})

describe('the seven new layouts: arrangements per hint', () => {
  const shape = (blocks: ContentBlock[], hint: LayoutType) =>
    inferGroups(blocks, hint).map((n) => (n.kind === 'leaf' ? n.block.type : n.arrangement))

  it('draws a run of timeline steps as steps under the steps hint', () => {
    expect(shape([heading(), timelineStep(), timelineStep()], 'steps')).toEqual(['heading', 'steps'])
    expect(shape([heading(), timelineStep(), timelineStep()], 'auto')).toEqual(['heading', 'timeline'])
  })

  it('draws exactly two comparison groups as beforeAfter under its hint', () => {
    expect(shape([heading(), comparisonGroup(), comparisonGroup()], 'beforeAfter')).toEqual(['heading', 'beforeAfter'])
  })

  it('falls back to columns for any other count of groups', () => {
    const three = [heading(), comparisonGroup(), comparisonGroup(), comparisonGroup()]
    expect(shape(three, 'beforeAfter')).toEqual(['heading', 'columns'])
  })

  it('draws a photo list as numbered rows', () => {
    expect(shape([heading(), bulletList(['a', 'b']), image()], 'photoList')).toEqual(['heading', 'numbered', 'image'])
  })
})

/*
  Review focus: the classifier must not move any card the rulings do not name.
  The resolved layouts below were recorded on master before the classifier
  changed, for every card of the two fixture decks, twice: as stored (an explicit
  layout wins) and with the layout forced to 'auto', so the classifier itself is
  what is measured.
*/
describe('classifier stability over the fixture decks', () => {
  const BASELINE_STORED: Record<string, string> = {
    'g-hero': 'hero', 'g-icons3': 'iconGrid', 'g-icons6': 'iconGrid', 'g-numbered': 'numberedList',
    'g-numbered10': 'numberedList', 'g-checklist': 'checklist', 'g-split': 'splitList', 'g-stats3': 'statGrid',
    'g-stats5': 'statGrid', 'g-statlist': 'statList', 'g-stathero': 'statHero', 'g-timeline': 'timeline',
    'g-timelinerow': 'timelineRow', 'g-timelinerow6': 'timelineRow', 'g-compare': 'comparison',
    'g-compare3': 'comparison', 'g-table': 'comparisonTable', 'g-quote': 'quote', 'g-text': 'textFocus',
    'g-standard': 'standard', 'g-split-photo': 'standardSplit', 'g-image': 'imageFocus',
    'g-list-photo': 'iconGrid', 'g-hero-extra': 'hero', 'g-sidehead': 'numberedList',
    'g-sidehead-stats': 'statGrid', 'g-splitbody': 'iconGrid', 'g-section': 'section', 'g-statement': 'statement',
    'g-twocol': 'twoColumn', 'g-statsplit': 'statSplit', 'g-photolist': 'photoList',
    'g-steps': 'steps', 'g-beforeafter': 'beforeAfter', 'g-kicker': 'standard', 'g-termrows': 'termRows',
    'g-callout': 'standard', 'g-code': 'standard', 'g-code-deep': 'section',
    'cpp-1': 'hero', 'cpp-2': 'iconGrid', 'cpp-3': 'statGrid', 'cpp-4': 'timeline', 'cpp-5': 'comparison',
    'cpp-6': 'quote', 'cpp-7': 'standardSplit',
  }
  const BASELINE_AUTO: Record<string, string> = {
    'g-hero': 'hero', 'g-icons3': 'iconGrid', 'g-icons6': 'iconGrid', 'g-numbered': 'numberedList',
    'g-numbered10': 'numberedList', 'g-checklist': 'iconGrid', 'g-split': 'numberedList', 'g-stats3': 'statGrid',
    'g-stats5': 'standard', 'g-statlist': 'statGrid', 'g-stathero': 'statHero', 'g-timeline': 'timeline',
    'g-timelinerow': 'timeline', 'g-timelinerow6': 'timeline', 'g-compare': 'comparison',
    'g-compare3': 'comparison', 'g-table': 'comparison', 'g-quote': 'quote', 'g-text': 'textFocus',
    'g-standard': 'iconGrid', 'g-split-photo': 'standardSplit', 'g-image': 'standardSplit',
    'g-list-photo': 'iconGrid', 'g-hero-extra': 'statGrid', 'g-sidehead': 'numberedList',
    'g-sidehead-stats': 'statGrid', 'g-splitbody': 'comparison', 'g-section': 'standard', 'g-statement': 'standard',
    'g-twocol': 'textFocus', 'g-statsplit': 'statHero', 'g-photolist': 'numberedList',
    'g-steps': 'timeline', 'g-beforeafter': 'comparison', 'g-kicker': 'standard', 'g-termrows': 'standard',
    'g-callout': 'standard', 'g-code': 'standard', 'g-code-deep': 'standard',
    'cpp-1': 'hero', 'cpp-2': 'iconGrid', 'cpp-3': 'statGrid', 'cpp-4': 'timeline', 'cpp-5': 'comparison',
    'cpp-6': 'quote', 'cpp-7': 'standardSplit',
  }
  /** The cards a ruling moves under the classifier, old to new. Every other card must be unchanged. */
  const MOVED_AUTO: Record<string, [string, string]> = {
    'g-list-photo': ['iconGrid', 'photoList'],
    'g-statsplit': ['statHero', 'statSplit'],
    'g-photolist': ['numberedList', 'photoList'],
    'g-termrows': ['standard', 'termRows'],
  }

  const cards = [...GALLERY_DECK, ...CPP_DECK]

  it('moves no stored layout: every card still resolves as before', () => {
    for (const card of cards) {
      const resolved = resolveLayout(card.layout, card.blocks, { isFirstCard: card.orderIndex === 0 })
      expect([card.id, resolved]).toEqual([card.id, BASELINE_STORED[card.id]])
    }
  })

  it('moves only the cards a ruling names when the classifier decides every one', () => {
    const moved: Record<string, [string, string]> = {}
    for (const card of cards) {
      const now = chooseLayout(card.blocks, { isFirstCard: card.orderIndex === 0 })
      if (now !== BASELINE_AUTO[card.id]) moved[card.id] = [BASELINE_AUTO[card.id], now]
    }
    expect(moved).toEqual(MOVED_AUTO)
  })
})

describe('termRows', () => {
  it('is awarded to one run of two or more points with only headings and paragraphs round it', () => {
    expect(chooseLayout([heading(), point(), point()])).toBe('termRows')
    expect(chooseLayout([heading(), paragraph(), point(), point(), point()])).toBe('termRows')
    expect(chooseLayout([heading(), point(), point(), paragraph()])).toBe('termRows')
    expect(chooseLayout([heading(), paragraph(), point(), point(), paragraph()], { isFirstCard: false })).toBe('termRows')
  })

  it('is not awarded to a lone point, or to points a block separates', () => {
    expect(chooseLayout([heading(), point()])).toBe('standard')
    expect(chooseLayout([heading(), point(), paragraph(), point()])).toBe('standard')
    // A second, separate point beside a run is not one run either.
    expect(chooseLayout([heading(), point(), point(), paragraph(), point()])).not.toBe('termRows')
  })

  it('is not awarded on the first card, which keeps the rules it had', () => {
    expect(chooseLayout([heading(), point(), point()], { isFirstCard: true })).toBe('standard')
    expect(chooseLayout([heading(), point()], { isFirstCard: true })).toBe('hero')
  })

  it('is not awarded when any other block type is on the card', () => {
    expect(chooseLayout([heading(), point(), point(), stat()])).toBe('statHero')
    expect(chooseLayout([heading(), point(), point(), bulletList(['a', 'b'])])).not.toBe('termRows')
    expect(chooseLayout([heading(), point(), point(), quote()])).not.toBe('termRows')
    expect(chooseLayout([heading(), point(), point(), timelineStep()])).not.toBe('termRows')
    expect(chooseLayout([heading(), point(), point(), comparisonGroup()])).not.toBe('termRows')
    expect(chooseLayout([heading(), point(), point(), callout()])).not.toBe('termRows')
    expect(chooseLayout([heading(), point(), point(), code()])).not.toBe('termRows')
  })

  it('takes the photo path for points beside a lone photo, drawing the run as rows', () => {
    expect(chooseLayout([heading(), point(), point(), image()])).toBe('termRows')
    expect(chooseLayout([heading(), image(), paragraph(), point(), point()])).toBe('termRows')
    // On the first card the photo path finds no rows and keeps its split.
    expect(chooseLayout([heading(), point(), point(), image()], { isFirstCard: true })).toBe('imageFocus')
    // Two photos are a gallery, not set aside.
    expect(chooseLayout([heading(), point(), point(), image(), image()])).not.toBe('termRows')
  })

  it('is an explicit layout only when stored, and resolves as itself', () => {
    expect(resolveLayout('termRows', [heading(), point()])).toBe('termRows')
  })
})

describe('termRows and the card kind', () => {
  it('calls a card whose typed content is only points a list', () => {
    expect(cardKind([heading(), point(), point()])).toBe('list')
    expect(cardKind([heading(), paragraph(), point(), point()])).toBe('list')
    expect(cardKind([heading(), point(), point(), image()])).toBe('list')
  })

  it('does not let points count toward the kind of a mixed card', () => {
    expect(cardKind([heading(), point(), point(), stat()])).toBe('stats')
    expect(cardKind([heading(), point(), point(), quote()])).toBe('quote')
    expect(cardKind([heading(), point(), point(), callout()])).toBe('text')
    expect(cardKind([heading(), point(), point(), code()])).toBe('text')
    expect(cardKind([heading(), point(), point(), bulletList(['a', 'b'])])).toBe('list')
  })

  it('keeps the first-card title rule', () => {
    expect(cardKind([heading(), point()], { isFirstCard: true })).toBe('title')
  })

  it('reports a card that names termRows as a list', () => {
    expect(cardKindOf({ layout: 'termRows', blocks: [heading(), point(), point()] })).toBe('list')
  })

  it('offers termRows in the list kind only when the card has a run of points', () => {
    const withRun = componentsForKind('list', [heading(), point(), point()])
    expect(withRun).toContain('termRows')
    expect(withRun).toEqual(expect.arrayContaining(['iconGrid', 'numberedList', 'checklist', 'splitList']))
    expect(componentsForKind('list', [heading(), bulletList(['a'])])).not.toContain('termRows')
    expect(componentsForKind('list', [heading(), point()])).not.toContain('termRows')
    expect(componentsForKind('list', [heading(), point(), paragraph(), point()])).not.toContain('termRows')
  })
})
