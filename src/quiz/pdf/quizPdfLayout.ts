import { groupBySection, type OwnerQuiz } from '@/quiz/rows'

/*
  The PDF's content and pagination, with no drawing. Geometry (fonts, margins,
  the jsPDF calls) lives in quizPdf.ts; everything decidable without a canvas
  is decided here so it can be tested.
*/

export type PdfItemKind =
  | 'title'
  | 'subtitle'
  | 'instruction'
  | 'heading'
  | 'question'
  | 'choice'
  | 'answerLine'
  | 'wordBox'
  | 'keyLine'
  | 'blank'

export interface PdfItem {
  kind: PdfItemKind
  text: string
}

const LETTERS = ['A', 'B', 'C', 'D']

/** The quiz sheet and its answer key as flat, geometry-free items. Numbering restarts in each test. */
export function buildQuizItems(quiz: OwnerQuiz): { sheet: PdfItem[]; key: PdfItem[] } {
  const sheet: PdfItem[] = [
    { kind: 'title', text: quiz.title },
    { kind: 'subtitle', text: `From: ${quiz.deckTitle}` },
    { kind: 'subtitle', text: 'Name: ____________________________     Date: ______________' },
  ]
  const key: PdfItem[] = [{ kind: 'title', text: 'Answer key' }, { kind: 'subtitle', text: quiz.title }]

  groupBySection(quiz.sections, quiz.questions).forEach(({ section, questions }, gi) => {
    const { config } = section
    // Spacers only BETWEEN things: a trailing one could open an empty page before the key.
    if (gi > 0) sheet.push({ kind: 'blank', text: '' })
    sheet.push({ kind: 'heading', text: section.title })
    if (section.instructions) sheet.push({ kind: 'instruction', text: section.instructions })

    if (config.type === 'fill_blank' && config.wordBox) {
      const words = [
        ...new Set(questions.map((q) => (typeof q.answer === 'object' ? q.answer.text : '')).filter(Boolean)),
      ].sort((a, b) => a.localeCompare(b))
      if (words.length > 0) sheet.push({ kind: 'wordBox', text: words.join('   ·   ') })
    }

    key.push({ kind: 'heading', text: section.title })
    const letter = config.type === 'true_false' && config.notation === 'letter'

    questions.forEach((q, i) => {
      const n = i + 1
      if (i > 0) sheet.push({ kind: 'blank', text: '' })
      sheet.push({ kind: 'question', text: `${n}. ${q.prompt}` })

      if (q.type === 'multiple_choice') {
        q.choices.forEach((c, ci) => sheet.push({ kind: 'choice', text: `${LETTERS[ci]}. ${c}` }))
        key.push({ kind: 'keyLine', text: `${n}. ${LETTERS[typeof q.answer === 'number' ? q.answer : 0]}` })
      } else if (q.type === 'fill_blank') {
        const a = typeof q.answer === 'object' ? q.answer : { text: '', accepted: [] as string[] }
        const also = a.accepted.length > 0 ? ` (also accepted: ${a.accepted.join(', ')})` : ''
        key.push({ kind: 'keyLine', text: `${n}. ${a.text}${also}` })
      } else {
        const value = q.answer === true
        sheet.push({ kind: 'answerLine', text: letter ? 'T / F' : 'TRUE / FALSE' })
        key.push({ kind: 'keyLine', text: `${n}. ${letter ? (value ? 'T' : 'F') : value ? 'TRUE' : 'FALSE'}` })
      }
    })
  })

  return { sheet, key }
}

/**
 * Greedy word wrap against a measuring function (jsPDF's `getTextWidth` in the
 * app). A word wider than the line is broken by characters so nothing is ever
 * clipped off the page.
 */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  if (text === '') return ['']
  const lines: string[] = []
  let line = ''

  const flushWord = (word: string) => {
    let rest = word
    while (measure(rest) > maxWidth && rest.length > 1) {
      let cut = rest.length - 1
      while (cut > 1 && measure(rest.slice(0, cut)) > maxWidth) cut--
      lines.push(rest.slice(0, cut))
      rest = rest.slice(cut)
    }
    line = rest
  }

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word
    if (measure(candidate) <= maxWidth) {
      line = candidate
    } else {
      if (line) lines.push(line)
      line = ''
      flushWord(word)
    }
  }
  if (line) lines.push(line)
  return lines.length > 0 ? lines : ['']
}

export interface PaginateLine {
  height: number
  /** Stay on the same page as the line after this one (a question with its choices, a heading with its body). */
  keepWithNext?: boolean
}

/**
 * The page index of every line. A line that would overflow starts a new page;
 * a `keepWithNext` line moves to the next page too if the line it heads would
 * not fit beside it, so a question number is never stranded at a page bottom.
 */
export function paginate(lines: PaginateLine[], pageHeight: number): number[] {
  const pages: number[] = []
  let page = 0
  let used = 0
  lines.forEach((line, i) => {
    const follower = line.keepWithNext ? (lines[i + 1]?.height ?? 0) : 0
    if (used > 0 && used + line.height + follower > pageHeight) {
      page++
      used = 0
    }
    pages.push(page)
    used += line.height
  })
  return pages
}
