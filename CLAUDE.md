# CLAUDE.md

Guidance for Claude Code in this repo. This file holds only what applies everywhere. Topic rules live in `.claude/rules/*.md` and load automatically when you read files under their `paths:` (see the index below; read one by hand if your task touches its area without opening its files). Long-form rationale lives in `docs/superpowers/specs/*` and in code comments. Older detail is in git history of this file.

## Commands

```
npm run dev       # Vite dev server (localhost:5173)
npm run build     # tsc -b && vite build — type-checks before bundling
npm run lint      # oxlint (type-aware via oxlint-tsgolint, see .oxlintrc.json)
npm run test      # vitest run
npm run preview   # preview a production build
```

CI (`.github/workflows/ci.yml`): typecheck, lint, test, build.

## Core rule: generate once

A deck's cards come from **one** AI call at creation; nothing afterwards asks the model for card content again. To get different content, start a new project. Hand edits (text, reorder, delete, nudge, add slide/item/block, remove) never call a provider. Research and repair happen *before* the deck exists, inside `generatePresentation`.

Narration, quizzes, lessons and the narrated video are **separate artifacts generated from a deck on demand**: they never write `cards` and are **not precedent for a "regenerate this slide" button**.

Authority: the AI decides what a card says and which blocks it holds; the layout engine decides how it renders. Element nudges are *deltas* on the layout, never a replacement. No free-form canvas for content; the only free-positioned thing is hand-drawn ink (`card.overlay`), which the AI never writes.

## Testing

- Vitest covers **pure, high-value logic** in `*.test.ts` beside the module. Add a colocated test for new pure logic, and mutation-check safety rules (e.g. which failures fail over).
- **No jsdom.** Component tests (`*.test.tsx`) are SSR render smoke tests for JSX-only failures (what is offered in which state). Look beside the component you change; most components with state-dependent UI have one.
- Guard tests for layouts are listed in `.claude/rules/layout-engine.md`; prompt-size and schema caps in `.claude/rules/generation.md`.
- **Fixtures:** `engine/fixtures/cppDeck.ts` (`CPP_DECK`, one slide per arrangement) and `engine/fixtures/galleryDeck.ts` (`GALLERY_DECK`, one card per arrangement and size variant, ids like `g-section`, `g-termrows`; `galleryDeck.test.ts` pins each id resolves to its arrangement).
- **Dev slide gallery** `/dev/slides` (`pages/DevSlidesPage.tsx`, dev builds only, no login): `?deck=gallery` (else `CPP_DECK`), `?theme=<id>`, `?style=expressive`, `?only=<card id>`, `?all=1`. It draws the read-only presenter path, not the editor.
- **Not testable here, checked by hand:** the live editing DOM (`EditableText`, selection, zoom, pan, drag, drawing), two presenter windows, video encode, voice recording, the lesson player. Recent layout work was checked only on `/dev/slides`; the editor, thumbnails, Present, video and PPTX on it are unchecked.
- **RLS/SQL** is hand-run (`supabase/tests/*.sql`; status in `.claude/rules/persistence.md`).

## Environment

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (see `.env.example`). Absent → `supabaseConfigured` false, store methods no-op, `/login` explains; the app is unusable.
- `VITE_ANTHROPIC_API_KEY`, `VITE_GROQ_API_KEY` (two chain links), `VITE_GEMINI_API_KEY`: build `PROVIDER_CHAIN` in `fallbackProvider.ts`. Any may be omitted; at least one required (`/new` checks on mount). **Baked into the client bundle by design** (no in-app key entry, no proxy). The Anthropic key is billed per token, so a deployed build is spendable.
- `VITE_CARTESIA_API_KEY` (optional): voice cloning/preview/video narration. A full-account key in the bundle.
- `VITE_WAVESPEED_API_KEY` (optional): talking intro/outro (WaveSpeed InfiniteTalk, 480p). **Baked into the bundle by decision, and billed per second of video**, so a deployed build is spendable. Without it the video dialog's face step explains it is not set up and the video is made without the clips.
- `VITE_PEXELS_API_KEY` (optional, 200 requests/hour): photo search. Without it decks get no photos and the image picker is paste-link only (`imagesConfigured` false).
- **Users never see a key's variable name** outside `/new`'s and `/login`'s setup messages. User-facing copy lives in `lib/setupCopy.ts`; variable names go to the console (`warnMissingKey`). Tests assert no `VITE_` in user UI.
- Accounts required: everything except `/login`, `/admin/login`, `/reset-password` is under `<RequireAuth>`. No guest mode.

## Path alias & TypeScript

`@/*` → `src/*`. `verbatimModuleSyntax: true` (type-only imports need `import type`); `erasableSyntaxOnly: true` (no constructor parameter properties).

## Topic rules index (`.claude/rules/`)

| File | Covers | Loads on |
|---|---|---|
| `generation.md` | creation flow, pipeline, validation/repair, AI providers, token budgets | `src/generation`, `src/ai`, `CreatePage` |
| `brief-drafts.md` | `/drafts`, user-namespaced localStorage pattern | `lib/briefDrafts.ts`, `DraftsPage` |
| `layout-engine.md` | content model, layout choice, frames, composition, grounds, structured blocks, photos, sizing, layout guard tests | `src/engine`, `components/layouts`, `components/theme` |
| `editing.md` | selection, undo, removal/insert, marks, zoom, nudging, drawing, card types | `components/editor`, `src/engine` |
| `theme.md` | `app-*` vs `slide-*`, fonts, built-in themes, celestial backdrops | `index.css`, `theme-tokens.ts`, `components/ui`, `components/theme` |
| `app-shell.md` | dashboard, covers, narrow windows, editor shell, GSAP motion | `components/home`, `components/editor`, `lib/motion.ts` |
| `presenter.md` | presenter console + slide window | `src/present`, `components/present` |
| `persistence.md` | Supabase migrations table, save timing, auth | `supabase/`, `src/store` |
| `narration-voice.md` | narration tab, Cartesia voice | `src/voice`, `NarrationTab`, narration engine |
| `video.md` | narrated video, talking intro/outro | `src/video`, `src/avatar` |
| `jobs.md` | background jobs | `src/jobs`, `components/jobs` |
| `quiz.md` / `lessons.md` / `classroom.md` | quizzes, lessons, classroom roles | their `src/` folders |
| `admin.md` / `export.md` | admin counts, PPTX export | `src/admin`, `src/export` |
