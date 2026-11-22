---
paths:
  - "src/video/**"
  - "src/avatar/**"
  - "src/components/videos/**"
  - "src/components/voice/**"
  - "src/components/editor/NarrationTab.tsx"
  - "src/pages/VideosPage.tsx"
  - "src/jobs/videoJob.ts"
---

# Narrated video & talking intro/outro

## Narrated video (`src/video/`)

Spec: `2026-09-27-narrated-video-design.md`. Narrates every slide, draws slides, encodes in the browser, saves to the private `deck-videos` bucket; one video per deck, replaced each time.

- Pure modules (`timeline`, `format`, `paths`, `videoRecord`, `storage`, `pipeline`, …) are tested; `narrate.ts`, `encode.ts`, `renderFrame.tsx`, `generate.ts` are browser-only, keep them thin.
- **Lazy:** `mediabunny` and `html-to-image` are reached only through `import('@/video/generate')`. Check the build's chunk list after touching imports.
- Frames are 1280×720, scaled to fit, never cropped. Audio and video timelines come from the same numbers, so a zero-length clip is refused.
- **The tab must be visible while slides are drawn** (`whenVisible`). **Theme web fonts are embedded** via a probe holding both theme fonts; **a web font added to the toolbar must join the probe** (as must `CODE_FONT`).
- MP4 preferred, WebM fallback; `detectFormat()` runs before any Cartesia request so a browser that can't encode never spends credits.
- **Save order is the safety rule** (`saveVideo`): upload → write record → remove old object if the path differs. Upload takes no `AbortSignal`, so it's the point of no return (`cancellable: false`).
- **Motion** (spec `2026-11-22-video-motion-design.md`): slides build in (≤6 steps), push in 3% and crossfade, at 30 fps; the math is pure in `motion.ts`, quality comes from length in `sizeGuard.ts`. Build states are captures with parts set `visibility: hidden` (never removed, so geometry is identical); the last state must equal a plain capture. List items are marked only on the video surface (`BuildItemsContext`). Slide timings are unchanged by motion. Units build in document order (the on-screen reading order; never sort by geometry, holders are `display: contents`). Builds are a fade only, no rise. The first slide fades from the stage background (`stageColor(theme)`), not `colors.deep`. When items exceed the 6-step cap but holders fit it, each holder is one unit (`chooseUnits`). Arrangements that don't spread item props (e.g. the numbered list) build as one unit (known gap). A video over ~21 minutes is refused after narration (size guard). The hand check (Task 6) is still pending.
- Deleting a deck deletes the row, then its video. `delete_own_account()` orphans videos.

## Talking intro & outro (`src/avatar/`)

Spec: `2026-11-21-talking-intro-outro-design.md`. An optional lip-synced face clip (WaveSpeed InfiniteTalk 480p, from the user's photo and the narration audio) before slide 1 and after the last slide. Not a card edit: nothing here writes `cards` or calls the deck model.

- **Pipeline** (`video/pipeline.ts`): segments are `[intro?, ...slides, outro?]`. The intro and outro are narrated first and their clips **start before the slides are narrated** (they take minutes), under an internal `AbortController` that follows the caller's signal and is aborted when the run ends. A `null` clip (any non-cancel failure) draws a **title card** and sets `faceFailed`, which becomes `Job.notice`; the video still saves. **`VideoRecord.slides` lists slides only, offset by the intro's length**, so lessons are unchanged (the outro plays after the last question).
- **`wavespeed.ts` holds every WaveSpeed call.** `submitTalk` is billed per job and **never retried**, here or by a caller; polling and download repeat freely. **An abort stays an `AbortError`**, never a `WavespeedError`. The key is in the bundle by decision (a proxy would replace only this file). Cancelling still bills a submitted job; the dialog's cost line (`costLine.ts`) says so.
- **Lazy:** `drawClip.ts` (mediabunny) and `talker.ts` are browser-only and reached only through `import('@/video/generate')`. `openClip` decodes a first picture, so a clip that cannot be decoded becomes a title card instead of failing the video. `clipFrames.ts` (pure) holds the placement rule: picture is clamped/held to the narration's length so sound and later slides keep their timing.
- **Text** (`bookends.ts`, `bookendsRow.ts`, `bookendsStore.ts`): `null` = never edited (the starter is used), `''` = cleared on purpose (no clip). Never conflate them. Stored in `presentations.bookends` by **its own best-effort read/write** (never `loadDeck`'s select or the card upsert); failure sets `warning`, never `status: 'error'`. The store debounces 500 ms, flushes before loading another deck and on `beforeunload`, **`NarrationTab` flushes on unmount**, and it resets on its own `authStore` subscription (an import from `authStore` would be a cycle).
- **Face photo** (`facePhoto.ts`): private `face-photos` bucket, one object at `<uid>/face.<ext>`, consent tick required to upload. **Deleted in `deleteAccount` before the RPC** (a failed removal stops the deletion). Only a missing bucket counts as no photo, so a project without 0021 is never blocked; any other list error stops the deletion.
- **Video dialog** (`CloneVoiceModal`, section 3 `FaceStep.tsx`): `faceRequest` (`video/ui.ts`) decides `off` / `blocked` / `on` from the switch and `faceBlocker` at press time; only a face that was on and became impossible blocks. **Generate is disabled while the photo is still being checked.** Job tray rows come from `videoTimeline(p, withFace)` (adds an `Animating your intro & outro` stage).
