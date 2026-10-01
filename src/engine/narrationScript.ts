import type { Card } from './contentBlocks'

/*
  The deck's narration as one plain-text script, for reading outside the app.

  Pure and DOM-free: the editor turns the string into a download. It reads
  `card.narration` only — the words a voice would say — never the slide's own
  text, and asks no provider for anything.
*/

/** Whether any slide has a script worth exporting. */
export function hasNarrationScript(cards: readonly Card[]): boolean {
  return cards.some((card) => (card.narration?.text ?? '').trim() !== '')
}

function headingOf(card: Card): string {
  const heading = card.blocks.find((block) => block.type === 'heading')
  return heading?.type === 'heading' ? heading.text.trim() : ''
}

/**
 * Every slide in deck order under a "Slide N: heading" line, with its script
 * beneath. A slide with no script is kept, marked as such, so the numbering
 * still matches the deck.
 */
export function narrationScriptText(title: string, cards: readonly Card[]): string {
  const sorted = [...cards].sort((a, b) => a.orderIndex - b.orderIndex)
  const sections = sorted.map((card, index) => {
    const heading = headingOf(card)
    const label = heading ? `Slide ${index + 1}: ${heading}` : `Slide ${index + 1}`
    const script = (card.narration?.text ?? '').trim()
    return `${label}\n${script === '' ? '(No script)' : script}`
  })
  const name = title.trim() || 'Untitled presentation'
  return [name, ...sections].join('\n\n') + '\n'
}

/** A file name for the script that every common file system accepts. */
export function scriptFileName(title: string): string {
  const safe = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
  return `${safe || 'Presentation'} - script.txt`
}
