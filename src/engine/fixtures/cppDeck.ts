import type { Card, VisualStyle } from '@/engine/contentBlocks'

/**
 * A seven-slide deck on Control Structures in C++, one slide per arrangement
 * the composition work has to get right: title, list, stats, timeline,
 * comparison, quote and a photo split. Shared by composition tests so they all
 * read the same realistic content.
 */
export const CPP_DECK: Card[] = [
  {
    id: 'cpp-1',
    orderIndex: 0,
    layout: 'hero',
    visualStyle: 'structured',
    blocks: [
      { type: 'heading', text: 'Control Structures in C++' },
      { type: 'paragraph', text: 'How a program decides what to do next.' },
    ],
  },
  {
    id: 'cpp-2',
    orderIndex: 1,
    layout: 'auto',
    visualStyle: 'structured',
    blocks: [
      { type: 'heading', text: 'Three ways to choose' },
      { type: 'paragraph', text: 'Pick the form that matches the decision.' },
      { type: 'bulletList', items: ['if and else', 'switch', 'ternary', 'early return'] },
    ],
  },
  {
    id: 'cpp-3',
    orderIndex: 2,
    layout: 'auto',
    visualStyle: 'structured',
    blocks: [
      { type: 'heading', text: 'Loops in numbers' },
      { type: 'stat', value: '3', label: 'loop forms' },
      { type: 'stat', value: '1', label: 'condition per loop' },
      { type: 'stat', value: '0', label: 'tolerance for infinite loops' },
    ],
  },
  {
    id: 'cpp-4',
    orderIndex: 3,
    layout: 'auto',
    visualStyle: 'structured',
    blocks: [
      { type: 'heading', text: 'How a loop runs' },
      { type: 'paragraph', text: 'Every pass follows the same steps.' },
      { type: 'timelineStep', label: 'Start', text: 'Set the counter.' },
      { type: 'timelineStep', label: 'Check', text: 'Test the condition.' },
      { type: 'timelineStep', label: 'Run', text: 'Do the body once.' },
      { type: 'timelineStep', label: 'Step', text: 'Update the counter.' },
    ],
  },
  {
    id: 'cpp-5',
    orderIndex: 4,
    layout: 'auto',
    visualStyle: 'structured',
    blocks: [
      { type: 'heading', text: 'for versus while' },
      { type: 'comparisonGroup', heading: 'for', items: ['Known count', 'Counter in the header', 'Compact'] },
      { type: 'comparisonGroup', heading: 'while', items: ['Unknown count', 'Condition only', 'Flexible'] },
    ],
  },
  {
    id: 'cpp-6',
    orderIndex: 5,
    layout: 'auto',
    visualStyle: 'structured',
    blocks: [
      { type: 'heading', text: 'A rule worth keeping' },
      {
        type: 'quote',
        text: 'Make it work, make it right, then make it fast.',
        attribution: 'Kent Beck',
      },
    ],
  },
  {
    id: 'cpp-7',
    orderIndex: 6,
    layout: 'auto',
    visualStyle: 'structured',
    blocks: [
      { type: 'heading', text: 'Read the flow' },
      { type: 'paragraph', text: 'Trace the code one branch at a time.' },
      { type: 'paragraph', text: 'Most bugs hide where two branches meet.' },
      { type: 'image', url: 'https://example.com/p.jpg', alt: 'A flowchart on a whiteboard' },
    ],
  },
]

/** The same cards in another visual treatment; the input is left untouched. */
export function withStyle(cards: Card[], style: VisualStyle): Card[] {
  return cards.map((card) => ({ ...card, visualStyle: style }))
}
