# Narration tab: AI icon and Cartesia voice (clone voice modal)

Date: 2026-09-27. Status: approved; implemented on branch feat/narration-voice.
Builds on `2026-09-26-narration-tab-design.md` (the tab this changes) and leaves the data rules in
`2026-09-02-narration-page-design.md` untouched.

## Context

The Narration tab (right panel) has two big buttons, "Generate script for this slide only" and
"Generate scripts for all slides". The user wants:

1. Those two buttons replaced by a small **AI icon** that opens a small modal asking which slide(s)
   to use. (Generation is *kept*; the user first asked to remove it, then reversed.)
2. A **Clone voice** button at the **bottom right of the script box** that opens a **centred modal**
   for setting up a voice with **Cartesia AI**: a **Record voice** button, **premade voices**, and
   the other voice settings Cartesia offers.
3. In that modal, a **Preview** that reads **two premade sentences** (not the slide's script), and a
   **script for the user to read** while recording their voice.

## Decisions (agreed)

1. **The saved voice only feeds Preview.** Nothing else in the app plays or exports audio (no play
   button on slides, no audio export). A saved voice exists so the settings have an audible effect and
   so later work can build on them.
2. **Key: `VITE_CARTESIA_API_KEY` in the client bundle**, like the Anthropic and Groq keys. Cartesia's
   own guidance is "never use API keys in client apps" (a key grants full account access) and its
   short-lived browser tokens only cover speech, not cloning or listing voices, so this is a
   deliberate, documented tradeoff: a deployed build lets anyone who loads it spend on the account and
   list or delete its voices. All calls live in **one module** so a proxy can replace it later.
   Browser access is confirmed: a preflight to `/voices`, `/voices/clone` and `/tts/bytes` allows
   `Authorization`, `Cartesia-Version` and `Content-Type` from any origin.
3. **Storage: per user, in Supabase**, in a **new table** (`voice_settings`), not a column on
   `profiles`. `profiles_select` lets a teacher read their students' profiles and the reverse; a
   voice choice on that table would be visible to classmates. The new table is owner-only.
4. **The AI icon reuses the existing "Generate scripts" picker unchanged** (tick the slides; hand-edited
   ones start unticked; overwriting them asks first). The tab's own single-slide confirm goes, because
   the picker has its own.

## Design

### The Narration tab

- **Footer row** under the script box, always shown (with or without a slide selected):
  - left: the **AI icon** button (sparkle, `aria-label="Generate scripts with AI"`, tooltip "Write
    scripts with AI"), enabled whenever the deck has slides. It opens `GenerateScriptsModal`.
  - right: **Clone voice** button (mic icon + label). It does not depend on the selected slide (the
    voice is per user, not per slide); it is enabled whenever `VITE_CARTESIA_API_KEY` is set, and
    disabled with the tooltip "Add VITE_CARTESIA_API_KEY to enable voice cloning" when it is not.
  - The "N words · ~Ns" line stays above the footer row.
- **Removed from `NarrationTab`**: the two Generate buttons, `confirmingId`, `confirmingIndex` and the
  direct `ConfirmReplaceModal` render (the picker still uses it internally).
- **Kept**: `runGeneration`, `hasValidTargets`, `sameSlides` and the "slides changed, nothing was
  applied" message, Cancel, the abort-on-unmount cleanup, and the save-error-outranks-generation-error
  rule.
- **Top strip** (the old button block) now renders only when there is something to say: while
  generating ("Cancel" button + "Writing narration…") or when there is an error. Otherwise it is absent.
- With **no slide selected** the script box area shows "Select a slide to write its script." (as now),
  and the footer row still shows below it.

### Cartesia module (`src/voice/cartesia.ts`)

The only file that touches the network for voices. Everything else is pure or UI.

- `CARTESIA_KEY = (import.meta.env.VITE_CARTESIA_API_KEY ?? '').trim()`; `cartesiaConfigured =
  CARTESIA_KEY !== ''`. Base URL `https://api.cartesia.ai`; version header `Cartesia-Version:
  2026-08-14`; model `sonic-3.6`. Auth is `Authorization: Bearer <key>` (the only credential header the
  API's CORS policy allows), built in one small function so a change is one line.
- `listVoices({ mine, language, q, signal })` -> `GET /voices?limit=100&is_owner=<mine>` plus optional
  `language` and `q`. **First page only**; the search box narrows it. Returns `VoiceSummary[]`
  (`id`, `name`, `tagline`, `description`, `gender`, `language`), parsed leniently (drops entries with
  no `id` or `name`).
- `cloneVoice({ clip: Blob, name, language, signal })` -> `POST /voices/clone` (`multipart/form-data`:
  `clip`, `name`, `language`, `access=private`) -> `VoiceSummary`.
- `speak({ voiceId, transcript, language, speed, volume, emotion, signal })` ->
  `POST /tts/bytes` with `model_id`, `transcript`, `voice`, `language`,
  `output_format {container:'wav', encoding:'pcm_f32le', sample_rate:44100}`, and
  `generation_config {speed, volume, emotion?}` -> `Blob`.
- **Errors:** one `CartesiaError` carrying `kind` and `status`: 401/403 `auth` ("Cartesia rejected the
  API key"), 429/503 `capacity` ("Cartesia is busy, try again"), other 4xx `request` (with the server's
  message when it sends one), network `unknown`. **No retry**: these are user-initiated single actions
  with a visible button to press again.
- **Every call honours the `AbortSignal`** (closing the modal cancels an in-flight request).
- `generation_config.emotion` is sent only when set **and** the language is English (Cartesia supports
  emotion tags for English only).

### Saved voice

Migration `supabase/migrations/0014_voice_settings.sql`:

```sql
create table if not exists voice_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  voice_id text,
  voice_name text,
  voice_source text check (voice_source in ('premade', 'cloned')),
  language text not null default 'en',
  speed numeric not null default 1,
  volume numeric not null default 1,
  emotion text,
  updated_at timestamptz not null default now()
);
alter table voice_settings enable row level security;
create policy voice_settings_owner on voice_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- Account deletion (`delete_own_account`, which deletes the auth user) removes the row by cascade. It
  **cannot** delete the user's cloned voices from Cartesia (that needs the key); noted in the docs.
- **Does not gate anything else**: nothing else reads it. A project without 0014 still works; opening
  the modal reports "Run migration 0014 in Supabase to save your voice" and the chosen voice works for
  the session only (held in memory).
- **Pure mapping** (`src/voice/settingsRow.ts`): `settingsFromRow(row)` parses defensively (unknown
  language -> `en`, speed clamped to 0.6-1.5, volume to 0.5-2.0, unknown emotion dropped, a row with no
  `voice_id` -> no voice); `rowFromSettings(settings)`. Constants `MIN_SPEED 0.6`, `MAX_SPEED 1.5`,
  `MIN_VOLUME 0.5`, `MAX_VOLUME 2.0`.
- **Store** (`src/voice/voiceStore.ts`, zustand): `settings`, `status` (`idle|loading|saving|error`),
  `warning`, `load()`, `save(settings)`. Loads when the modal opens, not at startup. **Cleared when the
  signed-in user changes** (`useAuthStore.subscribe`, the pattern `briefDrafts` uses), so one account's
  voice is never shown to the next on a shared browser.

### The modal (`components/voice/CloneVoiceModal.tsx`)

Built on `ui/Modal` (centred, `aria-modal`, Escape closes; the editor's shortcuts already stand down
for any `aria-modal` dialog). It works on a **draft** copy of the settings; nothing is saved until
**Save voice**. Sections, top to bottom:

1. **Voice**: two lists in one scroll area, "Premade voices" (`is_owner=false`) and "Your voices"
   (`is_owner=true`), each row showing name, tagline and gender; click to select (radio semantics,
   `aria-checked`). A **search** box (sent as `q`, debounced) and the language filter narrow the list.
   Errors and "no voices match" are shown in place. The selected voice is highlighted and named in the
   modal footer.
2. **Record your voice**:
   - **Reading script**: a short passage for the user to read aloud, in the selected language (below).
   - **Record / Stop** with a live timer. Minimum 3 s, automatic stop at 15 s (`MIN_CLIP_SECONDS`,
     `MAX_CLIP_SECONDS`; Cartesia's instant clone works from about 3-10 s of clean audio). After
     stopping: **Play back**, **Record again**.
   - **Name** field (required, up to 60 characters) and **Clone voice** (enabled with a clip of at least
     3 s and a name). On success the new voice is added to "Your voices" and selected.
   - Microphone problems say what happened in plain words: permission denied, no microphone, or a
     browser that cannot record in a format Cartesia accepts (webm or ogg; Safari without them shows
     "Use Chrome, Edge or Firefox to record"). **Recording is disabled, not hidden.**
   - **The microphone is always released**: stopping, closing the modal and unmounting all stop every
     track, so the browser's recording indicator goes off.
3. **Settings**: language (English, Spanish, French, German, Portuguese, Italian), **speed** slider
   (0.6-1.5, step 0.05), **volume** slider (0.5-2.0, step 0.05), **emotion** select (Cartesia's full
   list, "Default" meaning none; **disabled with a note when the language is not English**).
   Changing language resets nothing else.
4. **Preview**: **Preview voice** speaks two fixed sentences using the *draft* settings (unsaved), with
   a spinner while generating and a stop control while playing. Disabled with no voice selected.
5. **Footer**: **Cancel** and **Save voice** (writes `voice_settings`, closes on success, shows the
   error otherwise).

**Languages.** Cartesia supports many more, but the reading script and preview sentences must be in the
language the voice will speak or the clone and preview come out wrong. Six languages ship, each with its
own two strings (`src/voice/scripts.ts`: `READING_SCRIPTS`, `PREVIEW_SENTENCES`). Adding a language is
adding a row there and one entry in `VOICE_LANGUAGES`.

English texts (the other five are translations of the same length):
- Reading script (about 25 words, roughly 10 s): "The quick brown fox jumps over the lazy dog.
  Today I am reading at a steady, natural pace, so my voice sounds clear and calm."
- Preview (two sentences): "Hello, this is how your narration will sound. Every slide in your deck
  can be read aloud in this voice."

**Playback** uses an object URL on an `Audio` element, revoked when playback ends, the modal closes or a
new preview starts. Only one preview plays at a time.

### Files

| File | Change |
|---|---|
| `supabase/migrations/0014_voice_settings.sql`, `supabase/tests/0014_voice_rls.sql` | new (test is hand-run) |
| `src/voice/cartesia.ts` | new: the network calls, `CartesiaError` |
| `src/voice/settingsRow.ts` | new: pure row <-> settings mapping, clamps |
| `src/voice/scripts.ts` | new: languages, reading scripts, preview sentences |
| `src/voice/voiceStore.ts` | new: load/save, cleared on user change |
| `src/voice/recorder.ts` | new: thin `MediaRecorder` wrapper (untested; needs a microphone) |
| `src/components/voice/CloneVoiceModal.tsx` | new |
| `src/components/editor/NarrationTab.tsx` | footer row; remove the two buttons and the single-slide confirm |
| `.env.example`, `CLAUDE.md` | document the key, the tradeoff, the table and the tab change |

## Testing

Pure Vitest plus small SSR smoke tests, per CLAUDE.md. **No jsdom.**

- `cartesia.test.ts` against a mocked `fetch`: URL, headers (`Authorization`, `Cartesia-Version`),
  multipart body for clone, JSON body for speak (`generation_config`, emotion omitted for non-English),
  lenient list parsing, error kind per status, and that an aborted signal rejects without a result.
- `settingsRow.test.ts`: defaults, clamping, unknown language/emotion, a row with no voice, round trip.
- `scripts.test.ts`: every language has a reading script and two preview sentences; the two English
  preview strings are exactly two sentences.
- `NarrationTab.test.tsx` (updated): the AI icon and Clone voice button render in the footer with and
  without a selected slide; the two old buttons are gone; the top strip is absent when idle; Clone voice
  is disabled without the key.
- `CloneVoiceModal.test.tsx` (SSR): the three sections render, emotion is disabled off English, Clone
  voice is disabled until there is a clip and a name, Preview is disabled with no voice.
- **Not testable here (no jsdom, no microphone, no key), to be tried by hand:** recording, playback,
  the live Cartesia calls, that the microphone indicator goes off on close, and that a clone becomes
  selectable and previewable. **The auth header form is untested live** (see Risks).
- `supabase/tests/0014_voice_rls.sql` (hand-run, not yet run against a database): a user reads and
  writes only their own row; another user reads none; a row cascades away when the user is deleted.

## Out of scope

- Playing or exporting narration audio; any change to how scripts are written or stored.
- Deleting or renaming a cloned voice (managed in Cartesia's own dashboard).
- More than six languages; pagination beyond the first 100 voices.
- A server-side proxy for the key (a documented later swap).
- Persisting a recorded clip (it is sent to Cartesia and discarded).

## Risks

- **Key exposure.** Anyone who can load a deployed build can read the key and use the account. Same class
  of risk as the Anthropic key, but Cartesia's key is full-account. The `.env.example` entry says so.
- **Auth header form unverified.** The API reference says bearer auth, while a few of its curl samples
  omit `Bearer`. The code uses `Bearer`; if a valid key gets a 401, that one line changes.
- **Recording format.** `MediaRecorder` support differs by browser; the modal detects it and says so
  rather than sending a format Cartesia rejects.
- **Cloning may be plan-limited or billed** by Cartesia; a refusal is shown with the server's message.
- **Migration 0014 not applied by this work.** Without it the voice is session-only, with a warning.
