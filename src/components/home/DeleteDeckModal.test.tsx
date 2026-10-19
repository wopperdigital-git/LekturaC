import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DeckSummary } from '@/store/presentationStore'
import { DeleteDeckModal } from './DeleteDeckModal'

/**
 * A render smoke test: what the dialog says goes and what stays. Deleting a deck removes
 * its video (`deleteDeckWithVideo`) but keeps its quizzes (`quizzes.presentation_id` is
 * `on delete set null`), which only a Teacher has a page to find again.
 */

const deck = { id: 'd1', title: 'Volcanoes' } as DeckSummary

const render = (isTeacher: boolean) =>
  renderToStaticMarkup(<DeleteDeckModal deck={deck} isTeacher={isTeacher} onCancel={() => {}} onConfirm={async () => {}} />)

describe('DeleteDeckModal', () => {
  it('says the narrated video goes with the deck', () => {
    expect(render(true)).toContain('narrated video')
  })

  it("tells a teacher the quizzes stay on the Quizzes page, with students' scores", () => {
    expect(render(true)).toContain('Quizzes made from it stay on your Quizzes page')
  })

  // A General account has no Quizzes page: the quizzes are kept, but nothing lists them.
  it("tells anyone else the quizzes are kept but won't be listed anywhere", () => {
    const html = render(false)
    expect(html).toContain('Quizzes made from it are kept')
    expect(html).not.toContain('Quizzes page')
  })
})
