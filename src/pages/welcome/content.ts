import type { CalloutSlot, FaceNumber } from './dieGeometry'

export interface Callout {
  k: string
  t: string
}

export interface Chapter {
  id: string
  /** Which die face this chapter rolls to; the intro spins freely. */
  face: FaceNumber | null
  tag: string
  title: string
  body: string
  /** Up to four, filling CALLOUT_SLOTS in order. Shown inline on phones. */
  callouts: Callout[]
}

/**
 * Four fixed slots around the die, in die half-sizes (see calloutPath). All on
 * the right or below, so the left text column scrolls past without crossing a line.
 */
export const CALLOUT_SLOTS: CalloutSlot[] = [
  { ax: 0.95, ay: -0.9, dir: 1, rise: -0.55, reach: 3.3 },
  { ax: 1.3, ay: -0.1, dir: 1, rise: 0.2, reach: 3.5 },
  { ax: 1.1, ay: 0.8, dir: 1, rise: 0.25, reach: 3.4 },
  { ax: 0.1, ay: 1.3, dir: 1, rise: 0.45, reach: 3.2 },
]

export const INTRO: Chapter = {
  id: 'intro',
  face: null,
  tag: '00 / Intro',
  title: 'Every deck starts with a roll.',
  body: 'Lektura turns five answers into a researched, written and designed presentation, ready to edit, in minutes instead of days.',
  callouts: [
    { k: 'Fig. 0 — the Lektura die', t: 'Six faces. One deck, from brief to classroom.' },
    { k: 'Researched', t: 'Facts and sources gathered before you see a slide.' },
    { k: '.pptx, not pictures', t: 'Editable text boxes in PowerPoint, Slides, Keynote and Canva.' },
    { k: 'Your voice', t: 'A narrated video in a clone of your own voice.' },
  ],
}

export const CHAPTERS: Chapter[] = [
  {
    id: 'brief',
    face: 1,
    tag: '01 / Brief',
    title: 'Answer five questions.',
    body: 'Tell Lektura what you are presenting and who it is for. The fifth question is optional.',
    callouts: [
      { k: 'Q1 · Topic', t: 'What are you presenting?' },
      { k: 'Q2 · Length', t: 'One to ten slides, or let it decide.' },
      { k: 'Q3 · Audience', t: 'Who will be in the room?' },
      { k: 'Q4–5 · Detail & focus', t: 'How deep to go, and what to stress or leave out.' },
    ],
  },
  {
    id: 'generate',
    face: 2,
    tag: '02 / Generate',
    title: 'One call. A whole deck.',
    body: 'Research, writing, layout and a quality check all happen in seconds, before you see anything. It generates once, then the deck is yours.',
    callouts: [
      { k: 'Research', t: 'Facts and sources, gathered first.' },
      { k: 'Write', t: 'Slide copy plus speaker notes.' },
      { k: 'Design', t: 'A layout picked for what each slide holds.' },
      { k: 'Check', t: 'A quality pass before the deck opens.' },
    ],
  },
  {
    id: 'edit',
    face: 3,
    tag: '03 / Edit',
    title: 'Yours to shape.',
    body: 'Change any line, rearrange the slides, and move things by hand. Layouts adapt to text, bullets, numbers, timelines and quotes.',
    callouts: [
      { k: 'Text', t: 'Edit any line on any slide.' },
      { k: 'Arrange', t: 'Add, delete and reorder slides.' },
      { k: 'Transform', t: 'Drag, resize and rotate elements.' },
      { k: 'Undo', t: 'Every change is tracked.' },
    ],
  },
  {
    id: 'themes',
    face: 4,
    tag: '04 / Themes',
    title: 'Five looks. Light or dark.',
    body: 'Each theme carries its own type, colour and backdrop. Drag the strip to compare them, then fine-tune the typography and colours.',
    callouts: [],
  },
  {
    id: 'export',
    face: 5,
    tag: '05 / Export',
    title: 'PowerPoint, video or live.',
    body: 'Download real PowerPoint files, render a narrated video, or present straight from the browser.',
    callouts: [
      { k: 'PowerPoint', t: 'A real .pptx with editable text boxes.' },
      { k: 'Everywhere', t: 'The same look in Google Slides, Keynote and Canva.' },
      { k: 'Video', t: 'Narrated by your cloned voice.' },
      { k: 'Present', t: 'Right in the app, or shared for feedback.' },
    ],
  },
  {
    id: 'classroom',
    face: 6,
    tag: '06 / Classroom',
    title: 'Teach with it.',
    body: 'Teachers open a class and share a join code. Quizzes come straight from your decks.',
    callouts: [
      { k: 'Join code', t: 'Students join a class in one step.' },
      { k: 'Quizzes', t: 'Post a quiz from any deck.' },
      { k: 'Progress', t: 'See how every student is doing.' },
      { k: 'Students', t: 'Practise and track their own scores.' },
    ],
  },
]

export const OUTRO: Chapter = {
  id: 'start',
  face: 6,
  tag: '07 / Start',
  title: 'Roll your first deck.',
  body: 'All you need is an email and a password. Your decks save to the cloud and open on any device.',
  callouts: [
    { k: 'Minutes, not days', t: 'A complete first pass, ready to refine.' },
    { k: 'Saved to the cloud', t: 'Every deck, on every device.' },
  ],
}

/** Intro, the six faces, then the outro: the order the chapter pill counts. */
export const ALL_CHAPTERS: Chapter[] = [INTRO, ...CHAPTERS, OUTRO]
