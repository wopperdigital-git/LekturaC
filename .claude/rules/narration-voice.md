---
paths:
  - "src/voice/**"
  - "src/components/voice/**"
  - "src/components/narrate/**"
  - "src/components/editor/NarrationTab.tsx"
  - "src/engine/narration.ts"
  - "src/engine/narrationScript.ts"
  - "src/ai/narrationPrompt.ts"
  - "src/jobs/narrationJob.ts"
---

# Narration tab & voice

## Narration tab (`NarrationTab.tsx`, `engine/narration.ts`, `ai/narrationPrompt.ts`)

Per-slide spoken script for a cloned voice. Spec: `2026-09-26-narration-tab-design.md`.

- Writes for `selectedCardId ?? activeCardId`. Generating scripts is a background job (`jobs/narrationJob.ts`) that **targets card ids** and applies nothing if the slides changed before the reply (`sameSlides`). On the open deck it applies via `applyGeneratedNarration` (one undo step); otherwise `insertNarration` (write-only).
- `narration` is `{text, generated}`; status is derived. **`mergeNarration` writes only to slides the user selected**, whatever the model returned (the core invariant). Replacing hand-written words asks twice.
- `narrationMaxTokens`: floor 5200, ceiling 7000 (Groq refuses 8192). ~20–25 slides max; above that it's a 400 `request` error that does not fail over.
- Typing debounces 500ms on `narration:<cardId>`. The panel surfaces `status === 'error'` (how a missing 0008 shows).
- **`NarrationTab` flushes the bookends store on unmount** (see `video.md` rule).

## Voice (`src/voice/`, `CloneVoiceModal.tsx`)

Cartesia voice: pick premade or record and clone (consent required: a one-time "I agree" dialog on the first Record press, remembered per user per device in `voice/cloneConsent.ts`; bump `CLONE_CONSENT_VERSION` if its wording changes), tune settings, preview, then **Generate video**. **English only in the dialog**: no language picker; `inEnglish` reads a setting saved in another language as `en` (the other languages' texts stay in `voice/scripts.ts`). The reading passage is ~20 s; Sonic 3.6 learns from up to 60 s of clip. Spec: `2026-09-27-narration-voice-design.md`.

- **All network calls are in `voice/cartesia.ts`.** The key is a full-account key in the bundle by decision (cloning needs it); a server proxy would replace only this file. Sent as `Authorization: Bearer` (the only credential header Cartesia's CORS allows).
- Every call honours `AbortSignal`, and **an abort stays an `AbortError`** (never a `CartesiaError`). No retry.
- **The microphone is always released** (`voice/recorder.ts`) on stop, cancel, limit, error and unmount. Safari's mp4-only recording is reported as unsupported.
- **Recorded voices have owners** (`voice/clonedVoices.ts`, 0017): all users share one Cartesia account, so ownership comes from our table. **Fails closed**: unknown owner = shown to nobody. Account deletion deletes the user's Cartesia voices first and stops if any fails.
- Settings saved in `voice_settings`, deliberately **not on `profiles`** (teachers can read students' profiles). Store cleared on user change.
- **SSR test quirk:** zustand server rendering reads a hook's *initial* state, so `setState` can't drive what a component reads through a hook; set `getInitialState()` instead.
