# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```
npm run dev       # Vite dev server (localhost:5173)
npm run build     # tsc -b && vite build — type-checks before bundling
npm run lint      # oxlint
npm run preview   # preview a production build
```

There is no test suite/framework configured in this project.

### Environment

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `.env` (see `.env.example`) enable Supabase persistence. If absent, `supabaseConfigured` (`src/lib/supabaseClient.ts`) is `false` and every store method that touches Supabase no-ops gracefully — the app still runs fully in-memory for local dev without any backend.
- The Gemini API key is **not** an env var — it's entered once in the in-app Settings modal and kept in `localStorage` (`src/store/settingsStore.ts`), then sent directly from the browser to Google's Generative Language API. There is no server-side proxy for AI calls by design.
- Supabase anonymous sign-in must be enabled on the Supabase project (Auth → Sign In / Providers) for persistence to work — `ensureSession()` in `supabaseClient.ts` calls `signInAnonymously()` on first use so every browser gets a persistent `auth.uid()` with no login screen.

## Architecture

This is a Gamma-style AI presentation generator: describe a topic once, get a full deck, view/reorder/present it. **There is no manual content editing** — a project's cards are generated once at creation time and are read-only afterward in the editor (only reordering and deleting cards is possible). To change content, start a new project.

### Data flow: creation → generation → storage

1. `pages/CreatePage.tsx` — a chat-bubble-style conversational intake (not a form): topic → slide count (a number, or "let AI decide" → `'auto'`) → audience → detail level → tone → optional free-text guidance (what to focus on/avoid), answered one question at a time, each locking in before the next appears.
2. On the last answer, `ai/geminiProvider.ts` (`GeminiProvider.generateDeck`) calls Gemini's `generateContent` REST endpoint (model `gemini-flash-latest` — an alias, not a pinned version, since new API keys lose access to older pinned generations over time; switched from Groq after Groq's free-tier TPM limit (8000) proved too low for larger/auto-sized decks) with a system prompt (`ai/prompts.ts`) plus the user's brief (`GenerationBrief`: audience/detailLevel/tone/slideCount/guidance). `maxOutputTokens` scales with `slideCount` (`slideCount * 260 + 800`, clamped 4096–8192; 8192 when `slideCount === 'auto'`) so larger decks don't get truncated mid-JSON. `guidance`, when non-empty, is injected into the user prompt as a hard constraint that overrides the system prompt's general content rules (e.g. it can suppress invented statistics — see `ai/prompts.ts`'s CONTENT QUALITY RULES, which treat numbers as opt-in rather than a default to avoid padding decks with unnecessary invented figures).
3. The response is parsed and validated against a zod schema (`ai/provider.ts`); a card-level refinement requires every card's first block to be a `heading`. On validation failure, one retry is sent with the exact zod error messages so the model can self-correct.
4. `store/presentationStore.ts` (`createDeckFromGeneration`) atomically creates the Supabase `presentations` row and all `cards` rows, then navigates to `/deck/:id`.

There is intentionally no "regenerate" path — one topic per project. `CreatePage` also has a "skip and start blank" escape hatch (`createDeck`) for an empty project with no AI call.

### Content model & layout engine (`src/engine/`)

- `contentBlocks.ts` defines `ContentBlock` as a zod discriminated union (`heading`, `paragraph`, `bulletList`, `stat`, `image`, `quote`, `timelineStep`, `comparisonGroup`) and `Card` (`id`, `orderIndex`, `blocks`, `layout`).
- `layoutEngine.ts`'s `chooseLayout(blocks, context)` is a **rule-based classifier** (no LLM call) that inspects what block types a card actually contains and picks one of: `hero`, `statHero`, `comparison`, `timeline`, `iconGrid`, `gallery`, `standardSplit`, `standard`. `context.isFirstCard` is how the opening card gets a shot at the cinematic `hero` treatment instead of the generic fallback. `resolveLayout` defers to this whenever `card.layout === 'auto'` (the only value anything ever sets it to now — the manual per-card layout override UI was removed).
- `components/layouts/LayoutRenderer.tsx` dispatches a resolved layout to its one dedicated component in `components/layouts/*` (`HeroLayout`, `StatHeroLayout`, `ComparisonLayout`, `TimelineLayout`, `IconGridLayout`, `GalleryLayout`, `StandardLayout`, `StandardSplitLayout`). All heading sizes across these are deliberately uniform (`h2`) except the opening `HeroLayout` (`h1`) — don't reintroduce per-layout heading-size variance.
- Cards in `CardCanvas`/`PresentPage` have **no fixed aspect ratio or height** — they size purely to their content (this was a deliberate reversal of an earlier fixed-16:9-aspect-ratio design; don't reintroduce `aspect-video` on the card container).

### Theme system: two CSS token namespaces (the main thing to understand before touching styling)

`src/index.css` defines **two parallel sets** of CSS custom properties, both bridged into Tailwind v4 via `@theme inline` (there is no `tailwind.config.*` — Tailwind v4 is configured entirely in CSS):

- **`app-*`** (`--app-background`, `--app-accent`, `--app-font`, `--radius-app`, `--shadow-app`, …) — static values fixed in `:root`. Every piece of editor/app chrome (TopBar, sidebars, buttons, inputs, modals, Home/Create pages) uses `bg-app-*`/`text-app-*`/`rounded-app-*` classes and never changes regardless of any deck's theme.
- **`slide-*`** (`--slide-background`, `--slide-accent`, `--font-slide-heading`, `--radius-slide`, `--shadow-slide`, …) — the *deck's* visual theme, applied only inside a scoped `ThemeProvider` wrapper (`components/theme/ThemeProvider.tsx`), never on `document.documentElement`. `ThemeProvider` renders a `display: contents` div and calls `applyTheme(theme, thatDivRef)` (`lib/theme-tokens.ts`), which sets the `--slide-*` custom properties (plus Tailwind's own global `--spacing` multiplier) as inline styles on that div. Because CSS custom properties cascade through `display: contents` elements, every `bg-slide-*`/`font-slide-*`/`rounded-slide-*` class *inside* that subtree picks up the scoped values, while everything outside it keeps the `:root` fallback. `layouts/*` components use `slide-*` classes exclusively; `components/ui/*` (shared chrome primitives) use `app-*` exclusively.
- Practical effect: switching a deck's theme (`ThemePanel`, now a **preset-only** picker — no manual color/font/radius/spacing controls) restyles only the cards wrapped in that `ThemeProvider` instance, never the surrounding editor UI. `ThemeProvider` is instantiated separately around `CardCanvas` and around the sidebar's card thumbnails (and again standalone in `PresentPage`), each reading the same `store.theme`.
- `lib/theme-tokens.ts` also exports `darken()` (hex→HSL→hex) used to derive `--slide-canvas-background` (and the app's own static `--app-canvas`) — the page background sits a few HSL-lightness points below the card background so cards read as floating panels with a shadow, in both light and dark presets.
- `BUILTIN_THEMES` (5 presets: Minimal, Editorial, Midnight, Bold, Sage) is the only source of themes — there's no user-created/custom-theme storage anymore.

### Editor layout (`pages/EditorPage.tsx`)

Two independent slide-in/out side panels, not a shared mode switcher: a left `Outline` panel (`CardOutlineSidebar.tsx`) and a right `Theme` panel, each toggled from `TopBar` and animated via width transition (`w-0` ↔ fixed width, `overflow-hidden`). Both can be open simultaneously.

`CardOutlineSidebar`'s thumbnails are **not screenshots** — each is the real `LayoutRenderer` output rendered at a fixed offscreen size (800×450) and shrunk with `transform: scale()`, so they're always pixel-accurate to the live card and update instantly with theme/content changes.

### Persistence (Supabase)

`supabase/migrations/0001_init.sql` defines `presentations`, `cards`, and `themes` (the `themes` table is legacy/unused now that custom themes were removed — harmless to leave, not read from). RLS on every table is scoped to `owner_id = auth.uid()`, with `cards` checked via a join back to its parent `presentations` row. `store/presentationStore.ts` debounces text/theme field saves (`scheduleSave`, 500ms) but persists structural changes (card delete/reorder) immediately.

### Path alias

`@/*` → `src/*` (configured in both `tsconfig.app.json` and `vite.config.ts`).

### TypeScript strictness notes

`tsconfig.app.json` has `verbatimModuleSyntax: true` (type-only imports must use `import type`) and `erasableSyntaxOnly: true` (no TS constructor-parameter-property shorthand, e.g. `constructor(private x: string)` — assign fields in the constructor body instead).
