import { describe, expect, it } from 'vitest'
import type { Card } from './contentBlocks'
import { hasNarrationScript, narrationScriptText, scriptFileName } from './narrationScript'

function card(orderIndex: number, heading: string | null, script?: string): Card {
  return {
    id: `c${orderIndex}`,
    orderIndex,
    blocks: heading === null ? [] : [{ type: 'heading', text: heading }, { type: 'paragraph', text: 'On the slide' }],
    layout: 'auto',
    visualStyle: 'structured',
    narration: script === undefined ? undefined : { text: script },
  } as Card
}

describe('narrationScriptText', () => {
  it('lists every slide in deck order under its number and heading', () => {
    const text = narrationScriptText('Cells', [card(1, 'Mitosis', 'Second.'), card(0, 'Intro', 'First.')])
    expect(text).toBe('Cells\n\nSlide 1: Intro\nFirst.\n\nSlide 2: Mitosis\nSecond.\n')
  })

  it('keeps a slide with no script, so the numbering matches the deck', () => {
    const text = narrationScriptText('Cells', [card(0, 'Intro', '  '), card(1, 'Mitosis', 'Second.')])
    expect(text).toContain('Slide 1: Intro\n(No script)')
    expect(text).toContain('Slide 2: Mitosis\nSecond.')
  })

  it('exports the script only, never the words on the slide', () => {
    expect(narrationScriptText('Cells', [card(0, 'Intro', 'Spoken.')])).not.toContain('On the slide')
  })

  it('names a blank card and an untitled deck without inventing a heading', () => {
    expect(narrationScriptText(' ', [card(0, null, 'Spoken.')])).toBe('Untitled presentation\n\nSlide 1\nSpoken.\n')
  })
})

describe('hasNarrationScript', () => {
  it('is true only when some slide has words to say', () => {
    expect(hasNarrationScript([])).toBe(false)
    expect(hasNarrationScript([card(0, 'Intro'), card(1, 'Next', '   ')])).toBe(false)
    expect(hasNarrationScript([card(0, 'Intro'), card(1, 'Next', 'Spoken.')])).toBe(true)
  })
})

describe('scriptFileName', () => {
  it('drops characters a file system refuses', () => {
    expect(scriptFileName('Q3: plans / "draft"?')).toBe('Q3 plans draft - script.txt')
  })

  it('falls back when nothing usable is left', () => {
    expect(scriptFileName(' /// ')).toBe('Presentation - script.txt')
  })
})
