# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Anyone with a presentation to give: students, professionals, people preparing a talk. They arrive with a topic and little time, and their job is to walk away with a deck they can present, export or narrate. Teachers are a supported secondary audience: they get a classroom on top of the deck tools (classes, join codes, quizzes posted to classes, student statistics). Students in a class are a third audience who only take quizzes and see their own results.

Account type (General, Teacher, Student) is chosen at sign-up and is permanent; a General account becomes a Student only by joining a class.

## Product Purpose

Lektura turns a short brief (topic, slide count, audience, detail level, optional guidance) into a researched, written and laid-out slide deck, then hands the user full manual control. Making a deck normally takes hours of research, writing and layout; Lektura does the first pass so the user spends their time improving the deck instead of starting it.

Success: a user goes from an empty brief to a deck they would actually present, with sources they can check, in minutes.

## Positioning

- **Generate once, then it is yours.** The AI writes a deck's content in one creation call and never rewrites slides afterwards. Every later change is the user's own edit. To get different content, the user starts a new project.
- **The AI decides what a slide says; the layout engine decides how it looks.** Layout is rule-based, not a free-form canvas for content.
- **Checked, not just written.** Research runs before writing, claims are tied to sources, unsourced claims are flagged for review in the editor.
- **One deck, several outputs:** in-app presenting, native editable PowerPoint, a narration script, a narrated video in the user's cloned voice, and quizzes generated from the deck.

## Operating Context

- Desktop browser is the main editing surface. Under 768px the editor becomes a read-only phone view (slides, scripts, Present, export). iPad portrait gets a compact editor with panels that open over the canvas.
- Long generations (deck, quiz, video, narration scripts) run as background jobs in the tab and show progress in a corner panel; a reload ends them.
- Teachers work in classes: post quizzes, share a quiz code or link, read class statistics. Students take quizzes by link or code.
- Exported .pptx files are opened in PowerPoint, Google Slides, Canva and Keynote.

## Capabilities and Constraints

- Brief intake is a one-question-at-a-time chat; unfinished briefs are saved as drafts. Slide count is 1 to 7 for now.
- Editing: text in place, add/delete/reorder slides, insert elements, drag/resize/rotate elements, five built-in themes (Moonlight, Cosmic Observatory, Deep Space, Solar Flare, Aurora), typography and text colour, pen/marker/shapes drawing, grid with snap, undo/redo.
- Accounts are required (email and password). No guest mode.
- This is a school/thesis project, evaluated by instructors and used by a small test group. AI and voice keys are baked into the client bundle by decision; a public launch would need a server proxy first.
- Terminology: "deck", "slide" (internally "card"), "brief", "draft", "script" (narration), "quiz" made of up to three "tests", "class", "join code".
- The product name is **Lektura**. "LekturaC" is the repository/project name; product copy that still says LekturaC is a known inconsistency to fix.

## Brand Commitments

- Name: Lektura.
- Voice: plain, literal, matter-of-fact. Users never see technical names such as API key variable names; setup problems are phrased for the person ("Whoever runs it needs to add a Groq key").
- The five slide themes are celestial (star fields, orbits, constellations) and their ids are fixed. App chrome and slide themes are separate systems: a deck's theme never restyles the app.

## Evidence on Hand

- Product description: `description.md`; plain-language tour: `docs/HOW-IT-WORKS.md`; requirements history: `REQUIREMENTS.md`; design specs: `docs/superpowers/specs/`.
- Existing welcome page copy: `src/pages/welcome/content.ts`.
- No testimonials, customer names, usage numbers, benchmarks or pricing exist. Do not invent them.

## Product Principles

1. **Hand over control.** After creation the user owns the deck; never add a feature that quietly asks the model to rewrite slides.
2. **Honest about sources.** Show what is unsourced instead of hiding it; never fabricate a citation.
3. **Fast to a usable first draft.** The path from brief to editable deck is the core experience; everything else serves it.
4. **Fail softly.** A missing key, migration or failed research degrades one feature with a clear message, never the whole deck.
5. **Say it plainly.** Copy names the action and the consequence, in words a non-technical presenter understands.

## Accessibility & Inclusion

- Slide theme colour pairings are AA-checked; text colours below 3:1 against the slide background are dropped automatically.
- Touch screens get 44px targets on the editor's bars and slide actions.
- Keyboard: radio groups use one Tab stop with arrow keys; icon-only controls carry tooltips with their shortcuts.
- Quizzes are taken by students in classes; that flow must stay usable on phones and by keyboard.
