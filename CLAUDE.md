# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```
npm run dev       # Vite dev server (localhost:5173)
npm run build     # tsc -b && vite build — type-checks before bundling
npm run lint      # oxlint (type-aware rules enabled via oxlint-tsgolint, see .oxlintrc.json)
npm run test      # vitest run
npm run preview   # preview a production build
```

Test coverage is intentionally narrow: Vitest unit tests exist only for pure, high-value logic — `engine/layoutEngine.test.ts` (the layout classifier) and `lib/theme-tokens.test.ts` (`darken`/`applyTheme`). No component/integration tests. `.github/workflows/ci.yml` runs typecheck, lint, test, and build on push/PR.

### Environment

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `.env` (see `.env.example`) enable Supabase persistence. If absent, `supabaseConfigured` (`src/lib/supabaseClient.ts`) is `false` and every store method that touches Supabase no-ops gracefully — but this no longer means the app is usable: since accounts are required (see below), an unconfigured Supabase means nobody can ever log in, so `/login` just shows an explanatory message instead of a form. The graceful no-op behavior still matters for the Supabase-backed store methods themselves, just not as a full offline/in-memory mode anymore.
- The active AI provider's key comes from `.env` — `VITE_GEMINI_API_KEY` (`GeminiProvider`), `VITE_GROQ_API_KEY` sits unused alongside it for `GroqProvider` (see Data flow below for why). Whichever is active is read directly in `CreatePage.tsx` (baked into the client bundle at build time — convenient for local/personal dev, but readable by anyone with access to the built app, so don't rely on it for a deployment other people can reach). There is no in-app way to enter a key anymore (the old Settings modal was removed) and no server-side proxy for AI calls by design; the key is sent directly from the browser to the provider's API.
- Accounts are required: every route except `/login` and `/reset-password` is wrapped in `<RequireAuth>` (`src/components/auth/RequireAuth.tsx`), which redirects unauthenticated visitors to `/login`. There is no anonymous/guest mode. Auth state lives in `src/store/authStore.ts` (email/password via Supabase Auth, email confirmation required — toggle at Auth → Providers → Email → "Confirm email" in the Supabase dashboard). `ensureSession()` in `supabaseClient.ts` only waits for the client's session to finish hydrating from storage; it no longer creates a session itself.

## Architecture

This is a Gamma-style AI presentation generator: describe a topic once, get a full deck, view/reorder/present it. **There is no manual content editing** — a project's cards are generated once at creation time and are read-only afterward in the editor (only reordering and deleting cards is possible). To change content, start a new project.

### Data flow: creation → generation → storage

1. `pages/CreatePage.tsx` — a chat-bubble-style conversational intake (not a form): topic → slide count (a number, or "let AI decide" → `'auto'`) → audience → detail level → tone → optional free-text guidance (what to focus on/avoid), answered one question at a time, each locking in before the next appears.
2. On the last answer, `CreatePage.tsx` calls whichever `AIProvider` (`ai/provider.ts`) is currently wired up — **`ai/geminiProvider.ts`'s `GeminiProvider`** (model `gemini-flash-latest`), the default again after a brief stint on Groq while Gemini was returning 503s under high demand. `ai/groqProvider.ts`'s `GroqProvider` (model `llama-3.3-70b-versatile` via Groq's OpenAI-compatible `chat/completions` endpoint) is left in place, unused, as a fallback if Gemini acts up again — `CreatePage.tsx` has a comment at its provider import marking exactly what to swap. Watch out if you do: Groq's free tier has previously hit an ~8000 TPM cap on larger/auto-sized decks, which is the original reason this app moved to Gemini in the first place. `GeminiProvider`'s `callGemini` retries transient 503/429 responses with exponential backoff (up to 3 retries, 1s/2s/4s) before giving up — Google's own guidance for "model currently experiencing high demand," since a spike usually clears within a few seconds; `GroqProvider` has no equivalent retry logic. Either provider is called with a system prompt (`ai/prompts.ts`) plus the user's brief (`GenerationBrief`: audience/detailLevel/tone/slideCount/guidance) — this part is provider-agnostic. `maxOutputTokens`/`max_tokens` scales with `slideCount` (`slideCount * 260 + 800`, clamped 4096–8192; 8192 when `slideCount === 'auto'`) so larger decks don't get truncated mid-JSON. `guidance`, when non-empty, is injected into the user prompt as a hard constraint that overrides the system prompt's general content rules (e.g. it can suppress invented statistics — see `ai/prompts.ts`'s CONTENT QUALITY RULES, which treat numbers as opt-in rather than a default to avoid padding decks with unnecessary invented figures).
3. The response is parsed and validated against a zod schema (`ai/provider.ts`); a card-level refinement requires every card's first block to be a `heading`. On validation failure, one retry is sent with the exact zod error messages so the model can self-correct.
4. `store/presentationStore.ts` (`createDeckFromGeneration`) atomically creates the Supabase `presentations` row and all `cards` rows, then navigates to `/deck/:id`.

There is intentionally no "regenerate" path — one topic per project. `CreatePage` also has a "skip and start blank" escape hatch (`createDeck`) for an empty project with no AI call.

### Content model & layout engine (`src/engine/`)

- `contentBlocks.ts` defines `ContentBlock` as a zod discriminated union (`heading`, `paragraph`, `bulletList`, `stat`, `image`, `quote`, `timelineStep`, `comparisonGroup`) and `Card` (`id`, `orderIndex`, `blocks`, `layout`, `visualStyle`).
- `layoutEngine.ts`'s `chooseLayout(blocks, context)` is a **rule-based classifier** (no LLM call) that inspects what block types a card actually contains and picks one of: `hero`, `statHero`, `statGrid`, `comparison`, `timeline`, `quote`, `iconGrid`, `numberedList`, `textFocus`, `gallery`, `standardSplit`, `standard`. `context.isFirstCard` is how the opening card gets a shot at the cinematic `hero` treatment instead of the generic fallback. `resolveLayout` defers to this whenever `card.layout === 'auto'` (the only value anything ever sets it to now — the manual per-card layout override UI was removed). Layout *selection* is orthogonal to `visualStyle` below — neither depends on the other.
- `card.visualStyle` (`'structured' | 'expressive'`) is chosen by the AI per card at generation time (see `ai/prompts.ts`) and gives every one of the 12 layout components a second visual treatment, so a deck doesn't look templated when a layout repeats. `LayoutRenderer` passes it down as each component's `variant` prop; each component branches its own JSX on it (no shared "variant" component — the two treatments are hand-designed per layout). Legacy rows from before this field existed default to `'structured'` at the `loadDeck` read boundary in `presentationStore.ts`, not in the `Card` type itself.
- `components/layouts/LayoutRenderer.tsx` dispatches a resolved layout to its one dedicated component in `components/layouts/*` (`HeroLayout`, `StatHeroLayout`, `StatGridLayout`, `ComparisonLayout`, `TimelineLayout`, `QuoteLayout`, `IconGridLayout`, `NumberedListLayout`, `TextFocusLayout`, `GalleryLayout`, `StandardLayout`, `StandardSplitLayout`). All heading sizes across these are deliberately uniform (`h2`, via the shared `Heading` component in `BlockRenderer.tsx`) except the opening `HeroLayout` (`h1`) — don't reintroduce per-layout heading-size variance.
- Cards in `CardCanvas`/`PresentPage` have **no fixed aspect ratio or height** — they size purely to their content (this was a deliberate reversal of an earlier fixed-16:9-aspect-ratio design; don't reintroduce `aspect-video` on the card container).

### Theme system: two CSS token namespaces (the main thing to understand before touching styling)

`src/index.css` defines **two parallel sets** of CSS custom properties, both bridged into Tailwind v4 via `@theme inline` (there is no `tailwind.config.*` — Tailwind v4 is configured entirely in CSS):

- **`app-*`** (`--app-background`, `--app-accent`, `--app-font`, `--radius-app`, `--shadow-app`, …) — static values fixed in `:root`. Every piece of editor/app chrome (TopBar, sidebars, buttons, inputs, modals, Home/Create pages) uses `bg-app-*`/`text-app-*`/`rounded-app-*` classes and never changes regardless of any deck's theme.
- **`slide-*`** (`--slide-background`, `--slide-accent`, `--font-slide-heading`, `--radius-slide`, `--shadow-slide`, …) — the *deck's* visual theme, applied only inside a scoped `ThemeProvider` wrapper (`components/theme/ThemeProvider.tsx`), never on `document.documentElement`. `ThemeProvider` renders a `display: contents` div and calls `applyTheme(theme, thatDivRef)` (`lib/theme-tokens.ts`), which sets the `--slide-*` custom properties (plus Tailwind's own global `--spacing` multiplier) as inline styles on that div. Because CSS custom properties cascade through `display: contents` elements, every `bg-slide-*`/`font-slide-*`/`rounded-slide-*` class *inside* that subtree picks up the scoped values, while everything outside it keeps the `:root` fallback. `layouts/*` components use `slide-*` classes exclusively; `components/ui/*` (shared chrome primitives) use `app-*` exclusively.
- Practical effect: switching a deck's theme (`ThemePanel`, now a **preset-only** picker — no manual color/font/radius/spacing controls) restyles only the cards wrapped in that `ThemeProvider` instance, never the surrounding editor UI. `ThemeProvider` is instantiated separately around `CardCanvas` and around the sidebar's card thumbnails (and again standalone in `PresentPage`), each reading the same `store.theme`.
- `lib/theme-tokens.ts` also exports `darken()` (hex→HSL→hex) used to derive `--slide-canvas-background` (and the app's own static `--app-canvas`) — the page background sits a few HSL-lightness points below the card background so cards read as floating panels with a shadow, in both light and dark presets.
- `BUILTIN_THEMES` (5 presets: Minimal, Editorial, Midnight, Bold, Sage) is the only source of themes — there's no user-created/custom-theme storage anymore.

### Editor layout (`pages/EditorPage.tsx`)

Two independent slide-in/out side panels, not a shared mode switcher: a left outline panel (`CardOutlineSidebar.tsx`) and a right `Theme` panel, both animated via width transition (`w-0` ↔ fixed width, `overflow-hidden`) and able to be open simultaneously. The right panel is toggled from `TopBar`; the left panel floats (rounded corners, margin, shadow — not flush against the window edge) and is toggled by its own arrow button pinned to the vertical center of its right edge, not a `TopBar` button.

`CardOutlineSidebar`'s thumbnails are **not screenshots** — each is the real `LayoutRenderer` output rendered at a fixed offscreen size (800×450) and shrunk with `transform: scale()`, so they're always pixel-accurate to the live card and update instantly with theme/content changes.

### Persistence (Supabase)

`supabase/migrations/0001_init.sql` defines `presentations`, `cards`, and `themes` (the `themes` table is legacy/unused now that custom themes were removed — harmless to leave, not read from). `0002_add_visual_style.sql` adds `cards.visual_style` (`not null default 'structured'`) — run it against any project created before this field existed. RLS on every table is scoped to `owner_id = auth.uid()`, with `cards` checked via a join back to its parent `presentations` row. `store/presentationStore.ts` debounces text/theme field saves (`scheduleSave`, 500ms) but persists structural changes (card delete/reorder) immediately.

### Auth

`src/store/authStore.ts` is a zustand store, initialized once at module load (subscribing to `supabase.auth.onAuthStateChange`), exposing `user`/`status` plus `signUp`/`signIn`/`signOut`/`resetPasswordForEmail`/`updatePassword`. `resolveAuthState()` treats a session where `session.user.is_anonymous` is `true` the same as no session at all — this matters because browsers that used the app before this feature shipped may still be holding a leftover anonymous Supabase session in `localStorage`, and without this check that stale session would silently satisfy `RequireAuth` and skip the login screen entirely. `LoginPage.tsx` (route `/login`) handles login, signup, and forgot-password as one page via local mode state, rather than three separate routes. `ResetPasswordPage.tsx` (route `/reset-password`) is the landing page for the password-reset email link — Supabase's client auto-detects the recovery session from the URL. Decks created under the old anonymous-auth model (before this feature) are orphaned rows in Supabase, invisible to any real account under RLS — harmless to leave, or delete manually from the Supabase dashboard.

### Path alias

`@/*` → `src/*` (configured in both `tsconfig.app.json` and `vite.config.ts`).

### TypeScript strictness notes

`tsconfig.app.json` has `verbatimModuleSyntax: true` (type-only imports must use `import type`) and `erasableSyntaxOnly: true` (no TS constructor-parameter-property shorthand, e.g. `constructor(private x: string)` — assign fields in the constructor body instead).
