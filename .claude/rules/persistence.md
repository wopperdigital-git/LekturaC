---
paths:
  - "supabase/**"
  - "src/store/**"
  - "src/lib/supabaseClient.ts"
  - "src/pages/LoginPage.tsx"
  - "src/pages/ResetPasswordPage.tsx"
  - "src/components/auth/**"
---

# Persistence (Supabase) & auth

Migrations in `supabase/migrations/`. RLS on deck tables is `owner_id = auth.uid()`. The `themes` table is legacy/unused. RLS/SQL tests are hand-run: `supabase/tests/*.sql` (0009, 0010, 0012, 0014, 0015, 0016, 0017, 0018, 0021); all passed at their last run (latest 2026-11-21, after 0021).

## What each migration gates

| Migration | Adds | Gates |
|---|---|---|
| 0006, 0008 | `cards.adjusts`, `cards.narration` | **every card write and deck creation** (`cardRow` names both) |
| 0007 | card write bumps `presentations.updated_at` | dashboard order |
| 0009, 0010 | classroom tables, role pin, `delete_own_account()` | classroom |
| 0011 | `presentations.generation` | nothing (best-effort write) |
| 0012 | quiz code/type/settings + RPCs | quiz generate/take/post **and the teacher classroom reads** (`QUIZ_COLUMNS` selects `code`, `quiz_type`) |
| 0013 | `cards.overlay` | saving ink only (warning) |
| 0014 | `voice_settings` | nothing (voice lasts for the session) |
| 0015 | `presentations.video` + `deck-videos` bucket | videos ("Run migration 0015 in Supabase.") |
| 0016 | quiz test sections, new `create_quiz(p_sections)` | quiz saving/taking/preview |
| 0017 | `cloned_voices` | recording your own voice |
| 0018 | lessons | posting/taking a lesson only |
| 0019, 0020 | `admins`, `admin_overview(p_range)` | admin page only |
| 0021 | `presentations.bookends`, private `face-photos` bucket | talking intro/outro only (own best-effort read/write, never `loadDeck`) |

## Rules

- `parseAdjusts`/`parseNarration` map the `{}` column default back to `undefined` ("has the column" ≠ "was adjusted").
- Title/theme are debounced (`scheduleSave`, 500ms); structural changes persist immediately via `persistCardsSync`.
- **A debounced write must never be outrun by a read**: `loadDeck` returns early for the deck it already holds; `flushScheduledSaves()` runs before reading a different deck and on `beforeunload`; a released gesture is written immediately. `store/saveTiming.test.ts` pins all three.
- **A failed read is `loadError`, never `status: 'error'`** (that means a *save* failed). `EditorPage`/`PresentPage` render `DeckLoadError`.
- **`cardRow` must never name `overlay`** (see `editing.md` rule: Drawing layer).

## Auth

`store/authStore.ts` (zustand, initialised at module load). `realUser()` treats anonymous sessions as none. `applySession()` holds `status: 'loading'` until the profile resolves, **except** a same-user token refresh with a profile loaded (flipping to loading would unmount the editor). An unreadable profile resolves to General.
