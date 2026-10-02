import type { ComponentProps } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QuizModal } from './QuizModal'
import { SectionList } from './SectionCard'
import { DeckQuizList } from './DeckQuizList'
import { QuizPreviewBody } from './QuizPreviewModal'
import type { DeckQuizSummary, OwnerQuiz } from '@/quiz/rows'
import { newSection, sectionsReducer, type SectionDraft } from '@/quiz/sectionForm'
import type { Card } from '@/engine/contentBlocks'

/**
 * Render smoke tests (no jsdom, nothing can be clicked): what the modal and its
 * parts offer for which state.
 */

const noop = () => {}

const CARDS = [
  {
    id: 'c0',
    orderIndex: 0,
    layout: 'auto',
    visualStyle: 'structured',
    blocks: [
      { type: 'heading', text: 'Cells' },
      { type: 'paragraph', text: 'Mitochondria make ATP.' },
    ],
  },
] as unknown as Card[]

function drafts(n: number): SectionDraft[] {
  let s = [newSection(0, 'k0')]
  for (let i = 1; i < n; i++) s = sectionsReducer(s, { kind: 'add', key: `k${i}` })
  return s
}

/** The opening tag of the first button whose text includes `label`. */
function buttonTag(html: string, label: string): string {
  const at = html.indexOf(label)
  const start = html.lastIndexOf('<button', at)
  return html.slice(start, html.indexOf('>', start) + 1)
}

/** The `disabled` attribute itself, not the `disabled:` Tailwind variants in the class list. */
const DISABLED_ATTR = /\sdisabled=""/

describe('QuizModal', () => {
  it('opens on the Create tab, beside Quizzes from this deck, and is wide', () => {
    const html = renderToStaticMarkup(<QuizModal presentationId="p" title="Cells" cards={CARDS} onClose={noop} />)
    expect(html).toContain('max-w-3xl')
    const create = buttonTag(html, 'Create new quiz')
    const list = buttonTag(html, 'Quizzes from this deck')
    expect(create).toContain('role="tab"')
    expect(create).toContain('aria-selected="true"')
    expect(list).toContain('aria-selected="false"')
    expect(html).toContain('value="Test 1"')
    expect(html).not.toContain('value="Test 2"')
  })

  it('opens on the list tab when asked, with the new dot', () => {
    const html = renderToStaticMarkup(
      <QuizModal presentationId="p" title="Cells" cards={CARDS} onClose={noop} initialTab="list" quizIsNew />,
    )
    expect(buttonTag(html, 'Quizzes from this deck')).toContain('aria-selected="true"')
    expect(html).toContain('aria-label="New quiz"')
    expect(renderToStaticMarkup(<QuizModal presentationId="p" title="Cells" cards={CARDS} onClose={noop} />)).not.toContain('aria-label="New quiz"')
  })

  it('disables Generate while a quiz is generating', () => {
    const html = renderToStaticMarkup(<QuizModal presentationId="p" title="Cells" cards={CARDS} onClose={noop} quizRunning />)
    expect(html).toContain('A quiz is already generating')
    expect(buttonTag(html, '>Generate<')).toMatch(DISABLED_ATTR)
  })

  it('keeps both tab panels mounted inside one fixed-height area, so switching tabs never resizes it', () => {
    const html = renderToStaticMarkup(<QuizModal presentationId="p" title="Cells" cards={CARDS} onClose={noop} />)
    const area = html.indexOf('h-[60vh]')
    const create = html.indexOf('id="quiz-panel-create"')
    const list = html.indexOf('id="quiz-panel-list"')
    expect(area).toBeGreaterThan(-1)
    expect(create).toBeGreaterThan(area)
    expect(list).toBeGreaterThan(create)
    // The list panel is rendered (hidden), not left out, so the area doesn't depend on which tab is open.
    const listTag = html.slice(html.lastIndexOf('<div', list), html.indexOf('>', list) + 1)
    expect(listTag).toContain('hidden=""')
    expect(listTag).toContain('h-full')
  })
})

describe('SectionList', () => {
  it('offers Add test and no remove button with a single test', () => {
    const html = renderToStaticMarkup(<SectionList drafts={drafts(1)} dispatch={noop} onAdd={noop} disabled={false} />)
    expect(buttonTag(html, 'Add test')).not.toMatch(DISABLED_ATTR)
    expect(html).not.toContain('Remove Test 1')
  })

  it('disables Add test at three tests and offers remove on each', () => {
    const html = renderToStaticMarkup(<SectionList drafts={drafts(3)} dispatch={noop} onAdd={noop} disabled={false} />)
    expect(buttonTag(html, 'Add test')).toMatch(DISABLED_ATTR)
    expect(html).toContain('Remove Test 1')
    expect(html).toContain('Remove Test 3')
    expect(html).toContain('3 tests · 30 items')
  })
})

const MIXED: DeckQuizSummary = {
  id: 'q',
  code: 'ABCD23XY',
  title: 'Cells — quiz',
  createdAt: '2026-10-01T00:00:00Z',
  itemCount: 12,
  sections: [
    { title: 'Test 1', instructions: '', config: { type: 'multiple_choice', choiceCount: 4 } },
    { title: 'Test 2', instructions: '', config: { type: 'true_false', notation: 'word' } },
  ],
}

function list(extra: Partial<ComponentProps<typeof DeckQuizList>> = {}) {
  return renderToStaticMarkup(
    <DeckQuizList
      quizzes={[MIXED]}
      loadError={false}
      isTeacher={false}
      pdfBusy={null}
      busy={false}
      onPdf={noop}
      onOpen={noop}
      {...extra}
    />,
  )
}

describe('DeckQuizList', () => {
  it('shows an empty state when the deck has no quizzes', () => {
    expect(list({ quizzes: [] })).toContain('No quizzes from this deck yet')
  })

  it('labels a mixed quiz and hides the code from non-Teachers', () => {
    const html = list()
    expect(html).toContain('12 questions · 2 tests · Mixed')
    expect(html).not.toContain('ABCD23XY')
  })

  it('opens a quiz from a real button named after it', () => {
    expect(buttonTag(list(), 'Cells — quiz')).toContain('aria-label="Open preview of Cells — quiz"')
  })

  it('makes the code itself the copy button, with no separate Copy button', () => {
    const html = list({ isTeacher: true })
    const chip = buttonTag(html, 'ABCD23XY')
    expect(chip).toContain('aria-label="Quiz code ABCD23XY, click to copy"')
    expect(html).not.toMatch(/>Copy</)
    // No toast until something is copied.
    expect(html).not.toContain('Copied to clipboard')
  })
})

describe('QuizPreviewBody', () => {
  const quiz: OwnerQuiz = {
    id: 'q',
    code: 'ABCD23XY',
    title: 'Cells — quiz',
    deckTitle: 'Cells',
    createdAt: '2026-10-01T00:00:00Z',
    sections: MIXED.sections,
    questions: [
      { id: 'a', sectionIndex: 0, type: 'multiple_choice', slideNumber: 1, slideHeading: 'H', prompt: 'Which organelle makes ATP?', choices: ['Nucleus', 'Mitochondrion', 'Ribosome', 'Golgi'], answer: 1 },
      { id: 'b', sectionIndex: 1, type: 'true_false', slideNumber: 2, slideHeading: 'H', prompt: 'Cells have nuclei.', choices: [], answer: true },
    ],
  }

  it('says it is loading before the quiz arrives', () => {
    const html = renderToStaticMarkup(
      <QuizPreviewBody summary={MIXED} state={{ status: 'loading' }} isTeacher={false} />,
    )
    expect(html).toContain('Loading quiz…')
    expect(html).toContain('12 questions · 2 tests · Mixed')
  })

  it('shows a load failure as an alert', () => {
    const html = renderToStaticMarkup(
      <QuizPreviewBody summary={MIXED} state={{ status: 'error', message: 'Network down' }} isTeacher={false} />,
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('Network down')
  })

  it('shows every test with its questions and answers once loaded, and the code for Teachers', () => {
    const html = renderToStaticMarkup(
      <QuizPreviewBody summary={MIXED} state={{ status: 'ready', quiz }} isTeacher />,
    )
    expect(html).toContain('Test 1')
    expect(html).toContain('Test 2')
    expect(html).toContain('Which organelle makes ATP?')
    expect(html).toContain('Cells have nuclei.')
    expect(html).toContain('TRUE')
    expect(html).toContain('ABCD23XY')
  })
})
