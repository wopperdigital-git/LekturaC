import type { OwnerQuiz } from '@/quiz/rows'
import { buildQuizItems, paginate, wrapText, type PdfItem, type PdfItemKind } from './quizPdfLayout'

/*
  The drawing half of the PDF export. jsPDF is `import()`ed here, at export
  time, so it never enters the main bundle. Owner-only by construction: an
  `OwnerQuiz` (with answers) can only be loaded through the owner's own read of
  `quiz_questions`, which RLS refuses to anyone else.
*/

const PAGE_W = 595.28 // A4 in points
const PAGE_H = 841.89
const MARGIN = 54
const CONTENT_W = PAGE_W - MARGIN * 2
const CONTENT_H = PAGE_H - MARGIN * 2

interface Style {
  size: number
  bold: boolean
  indent: number
  gapAfter: number
  keepWithNext?: boolean
}

const STYLES: Record<PdfItemKind, Style> = {
  title: { size: 20, bold: true, indent: 0, gapAfter: 6 },
  subtitle: { size: 11, bold: false, indent: 0, gapAfter: 4 },
  instruction: { size: 11, bold: false, indent: 0, gapAfter: 12 },
  heading: { size: 14, bold: true, indent: 0, gapAfter: 6, keepWithNext: true },
  question: { size: 12, bold: true, indent: 0, gapAfter: 4, keepWithNext: true },
  choice: { size: 12, bold: false, indent: 18, gapAfter: 2 },
  answerLine: { size: 11, bold: false, indent: 18, gapAfter: 2 },
  wordBox: { size: 12, bold: false, indent: 8, gapAfter: 14 },
  keyLine: { size: 12, bold: false, indent: 0, gapAfter: 5 },
  blank: { size: 6, bold: false, indent: 0, gapAfter: 0 },
}

const FONT = 'NotoSans'
// The bundled Noto Sans (public/fonts) covers Latin, Greek and Cyrillic only: no CJK, no Arabic.
// Anything else falls outside the font and may not render.

/** TrueType (`00 01 00 00`, `true`) or OpenType/CFF (`OTTO`): a host that answers 200 with index.html is not a font. */
function isFontFile(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false
  const [a, b, c, d] = bytes
  const tag = String.fromCharCode(a, b, c, d)
  return (a === 0 && b === 1 && c === 0 && d === 0) || tag === 'true' || tag === 'OTTO'
}

async function loadFont(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (!isFontFile(bytes)) return null
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    return btoa(binary)
  } catch {
    return null
  }
}

export interface ExportQuizPdfResult {
  /** False when the Unicode font could not be loaded and Helvetica was used instead. */
  unicodeFont: boolean
}

export async function exportQuizPdf(quiz: OwnerQuiz): Promise<ExportQuizPdfResult> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true })

  const [regular, bold] = await Promise.all([
    loadFont('/fonts/NotoSans-Regular.ttf'),
    loadFont('/fonts/NotoSans-Bold.ttf'),
  ])
  let unicodeFont = false
  if (regular && bold) {
    try {
      doc.addFileToVFS('NotoSans-Regular.ttf', regular)
      doc.addFont('NotoSans-Regular.ttf', FONT, 'normal')
      doc.addFileToVFS('NotoSans-Bold.ttf', bold)
      doc.addFont('NotoSans-Bold.ttf', FONT, 'bold')
      unicodeFont = true
    } catch {
      // A font jsPDF can't register: fall back to Helvetica rather than fail the export.
    }
  }
  const family = unicodeFont ? FONT : 'helvetica'

  interface Line {
    text: string
    style: Style
    height: number
    keepWithNext?: boolean
    /** Part of the word box, which is drawn inside a border. */
    boxed: boolean
  }

  function toLines(items: PdfItem[]): Line[] {
    const lines: Line[] = []
    for (const item of items) {
      const style = STYLES[item.kind]
      doc.setFont(family, style.bold ? 'bold' : 'normal')
      doc.setFontSize(style.size)
      // The word box has padding on both sides; everything else only its left indent.
      const sides = item.kind === 'wordBox' ? 2 : 1
      const wrapped = wrapText(item.text, CONTENT_W - style.indent * sides, (s) => doc.getTextWidth(s))
      wrapped.forEach((text, i) => {
        const last = i === wrapped.length - 1
        lines.push({
          text,
          style,
          height: style.size * 1.35 + (last ? style.gapAfter : 0),
          // Only the last wrapped line of a heading/question binds to what follows.
          keepWithNext: last ? style.keepWithNext : true,
          boxed: item.kind === 'wordBox',
        })
      })
    }
    return lines
  }

  function draw(lines: Line[], firstPage: boolean) {
    const pages = paginate(lines, CONTENT_H)
    let currentPage = 0
    let y = MARGIN
    if (!firstPage) doc.addPage()

    // The word box may wrap over several lines, or across a page break: one
    // rectangle per page segment, drawn when the segment ends.
    const BOX_PAD = 4
    let box: { top: number; bottom: number } | null = null
    const flushBox = () => {
      if (!box) return
      doc.setDrawColor(120)
      doc.setLineWidth(0.75)
      doc.rect(MARGIN, box.top - BOX_PAD, CONTENT_W, box.bottom - box.top + BOX_PAD * 2)
      box = null
    }

    lines.forEach((line, i) => {
      while (currentPage < pages[i]) {
        flushBox()
        doc.addPage()
        currentPage++
        y = MARGIN
      }
      if (line.boxed) {
        const bottom = y + line.style.size * 1.35
        box = box ? { top: box.top, bottom } : { top: y, bottom }
      } else {
        flushBox()
      }
      doc.setFont(family, line.style.bold ? 'bold' : 'normal')
      doc.setFontSize(line.style.size)
      if (line.style.size > 6 && line.text) {
        doc.text(line.text, MARGIN + line.style.indent, y + line.style.size)
      }
      y += line.height
    })
    flushBox()
  }

  const { sheet, key } = buildQuizItems(quiz)
  draw(toLines(sheet), true)
  draw(toLines(key), false)

  const safe = quiz.title.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'quiz'
  doc.save(`${safe}.pdf`)
  return { unicodeFont }
}
