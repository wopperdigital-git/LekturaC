# Narrated video: "Generate Presentation" in the voice modal

Date: 2026-09-27. Status: design approved in conversation; written spec awaiting review.
Builds on `2026-09-27-narration-voice-design.md` (the modal this changes) and
`2026-09-26-narration-tab-design.md`. Leaves the narration data rules untouched.

## Intent

The user wants the voice modal's **Save voice** button renamed **Generate Presentation**. Clicking it
stitches the deck's slides together with the narration, spoken in the chosen Cartesia voice, into one
**narrated video**, which is **saved in the app** (Supabase Storage) so it can be replayed and
downloaded later.

Success: from the Narration tab, a user with a voice chosen and a deck with scripts clicks the button,
watches progress, and ends up with a playable video of every slide, each held for the length of its
narration. Reopening the modal later shows that video.

## Decisions (agreed)

1. **Output is saved in the app**, not just downloaded: a private Supabase Storage bucket, one video
   per deck, replaced on each generation. The modal plays it and offers Download.
2. **Slides with a blank narration script** are shown **silently for 4 seconds** (`SILENT_SLIDE_SECONDS`),
   so the video always has every slide.
3. **One video per deck, replaced each time.** The new file replaces the old one only after it uploaded.
4. **Approach: encode in the browser** with WebCodecs through `mediabunny`, drawing each slide with
   `html-to-image`. Rejected: real-time `MediaRecorder` (takes as long as the video, tab must stay
   foreground, unseekable WebM) and a server-side ffmpeg render (adds a backend this repo has avoided on
   purpose; Supabase Edge Functions cannot run ffmpeg).
5. **Tall slides are scaled to fit** a 1280x720 frame, never cropped: a narrator must not read text the
   viewer cannot see. (Thumbnails crop; a video must not.)
6. **The button also saves the voice** (the existing `voiceStore.save`), because the video needs it.

## Not in scope

- Any change to `cards`, narration text or how narration is generated. A video is a **separate
  artifact generated from a deck on demand**, like a quiz: it never reads-then-writes card content and
  is no precedent for a "regenerate this slide" button (see CLAUDE.md "Core rule: generate once").
- Background music, transitions, subtitles, per-slide timing overrides, several videos per deck.
- Temporary ink (editor-only by design) is **not** in the video. Ink saved on the slide
  (`card.overlay`) **is**, because `SlideBody` draws it on every surface.
- A server proxy for the Cartesia key. The existing risk (a full-account key in the bundle) is
  unchanged, and generation makes it spendable in bulk: one click is one `speak()` call per narrated slide.

## User flow (the modal)

`CloneVoiceModal` now takes the deck: `{ presentationId, cards, theme, textStyle }`, passed by
`NarrationTab`, its only caller. Footer: **Cancel** and **Generate Presentation**.

1. Click. If a video exists, a confirm line says it will be replaced; either way it says generation
   spends Cartesia credits. (`canSaveVoice` still gates the button: modal loaded, saved voice readable,
   not already busy; add "a voice is chosen" and "at least one slide").
2. Save the voice. On failure stop; the existing `saveError` shows.
3. Run the pipeline. A progress list shows the stage: Narrating n/N, Rendering n/N, Encoding,
   Uploading. A **Cancel** button replaces the primary one and aborts everything. All other controls
   are disabled while it runs (as they are during a clone).
4. Done: a `<video controls>` on a signed URL, a **Download** link and **Generate again**. Reopening
   the modal loads the deck's video record and shows the same.
5. Failure: a stage-specific message ("Narrating slide 3 failed: ..."); the previous video is untouched.

Closing the modal (Escape, backdrop, Cancel) runs the same cleanup as today plus aborting the pipeline.

## Architecture (`src/video/`)

Pure modules first; the DOM and WebCodecs sit behind small interfaces so the pipeline is testable.

| File | Kind | Purpose |
| --- | --- | --- |
| `timeline.ts` | pure | From per-slide durations: start times, total length, frame timestamps (one per second of hold), and `fitScale(contentHeight, frameHeight)` for scale-to-fit. |
| `format.ts` | pure | `chooseFormat(support)` -> `{container, videoCodec, audioCodec, ext, contentType}` or `null`. MP4 (avc + aac) preferred, WebM (vp9 + opus) fallback. |
| `paths.ts` | pure | `videoPath(uid, presentationId, ext)` = `<uid>/<presentationId>.<ext>`. |
| `videoRow.ts` | pure | `parseVideo(json)` for `presentations.video`; malformed reads as none. |
| `pipeline.ts` | orchestration | `generateVideo({cards, voice, signal, onProgress}, deps)`, with injected `narrate`, `renderFrame`, `encoder`, `upload`. |
| `narrate.ts` | thin | `speak()` -> WAV `Blob` -> `AudioBuffer` (`decodeAudioData`), or a silent `AudioBuffer` for a blank script. |
| `renderFrame.ts` | DOM | Mounts one card off-screen at 1280x720 and rasterizes it into a reused canvas. |
| `encode.ts` | WebCodecs | `mediabunny` `Output` + `CanvasSource` + `AudioBufferSource`, `BufferTarget`. |
| `storage.ts` | Supabase | Upload, signed URL, remove; writes/reads `presentations.video`. |
| (modal state) | state | The existing-video record and its signed URL live in `CloneVoiceModal` state, loaded on open; no store, since nothing else reads them. |

### Pipeline

1. **Narrate** each slide sequentially (Cartesia's concurrency limits for this account are not known,
   and one request at a time also keeps cancel prompt). `card.narration?.text` trimmed; empty -> a
   `SILENT_SLIDE_SECONDS` silent buffer. Decode each WAV to an `AudioBuffer`; its `duration` is that
   slide's hold time.
2. **Plan** with `timeline.ts`.
3. **Render** slide by slide: `ThemeProvider` + `SlideStage` + `TextStyleScope` + `SlideSurface` +
   `SlideBody` + `LayoutRenderer` (the `SlidePreview` composition, at a fixed 1280px width, no
   16:9 crop), measured, then scaled to fit the frame height when taller than 16:9 and centred.
   `await document.fonts.ready` first. Rasterized with `html-to-image` `toCanvas` into one canvas.
4. **Encode**: for each slide, add its `AudioBuffer` to the audio track and its frames (one per second
   of hold, same picture) to the video track. Audio buffers are appended in order, so timestamps
   accumulate; a silent slide is just a silent buffer. `finalize()`, then take the buffer.
5. **Upload** to `deck-videos`, then write `presentations.video`.

Container/codec are picked once up front from `mediabunny`'s `canEncode*` checks. If none works the
button is disabled with an explanation (no attempt, no partial state).

### Cancellation

One `AbortController` for the whole run. `speak()` already honours a signal; the render loop and the
encode loop check `signal.aborted` between slides/frames; on abort call `output.cancel()`. Abort
surfaces as a quiet return to the modal (as with the voice calls), never as an error. **Open point to
verify while building:** whether the Storage `upload` accepts an `AbortSignal` in the pinned
`supabase-js`. If not, a cancel during upload waits for it and then removes the object instead of
writing the record, so cancel never leaves a half-applied video.

## Storage (migration `0015_deck_videos.sql`)

- Private bucket `deck-videos` (`public = false`). Policies on `storage.objects` for the bucket:
  select/insert/update/delete only where `(storage.foldername(name))[1] = auth.uid()::text`.
- `presentations.video jsonb` (nullable): `{ path, contentType, durationSeconds, generatedAt }`.
  Written in **its own best-effort update**, never through `cardRow`, and **not** a gate on card
  writes (same rule as `generation` and `overlay`). A project without 0015 still saves and loads decks;
  generating fails at the upload step with "Run migration 0015 in Supabase."
- Playback: `createSignedUrl(path, 3600)` when the modal opens with a record.
- Replacement: uploading to the same path with `upsert: true` replaces it. If the extension changed
  (mp4 -> webm), the old object is removed **after** the new upload and record succeed.
- Deleting a deck removes its video object first, client-side and best effort (SQL cannot safely
  delete Storage files). `delete_own_account()` does **not** remove videos: they are orphaned, and
  CLAUDE.md documents it as the same class of gap as the Cartesia clones. Not handled in this work.
- Size: a slide is a static picture, so files are small (a few MB for the 7-slide cap, `MAX_SLIDES`).
  Raising `MAX_SLIDES` still needs revisiting Storage's per-file limit, Cartesia spend and the encode time.

## Errors

| Stage | Failure | Result |
| --- | --- | --- |
| Save voice | store error | existing `saveError`; stop |
| Narrate | `CartesiaError` (auth, capacity, ...) | "Narrating slide n failed: <message>"; nothing written |
| Render | throws | "Could not draw slide n."; nothing written |
| Encode | unsupported / encoder error | message; nothing written |
| Upload | missing migration / storage error | message; previous video kept |
| Record write | fails after upload | warn; the file exists but is not shown; reopening will not list it (the record is the pointer) |
| Cancel | abort | quiet; previous video kept |

No retry: each run is a single user action with a button to press again.

## Testing

- **Pure Vitest** (colocated): `timeline.test.ts` (starts, totals, frame times, fit scale, blank slide
  = 4s), `format.test.ts` (preference and fallback, `null` when neither), `paths.test.ts`,
  `videoRow.test.ts`, `pipeline.test.ts` against fakes (order; abort at each stage returns quietly and
  writes nothing; a failure keeps the previous video; blank slides get silence; the record is written
  only after the upload). Mutation-check the two safety rules: cancel never writes, and a failed run
  never removes the previous video.
- **Render smoke** for the modal (`renderToStaticMarkup`, the existing pattern): button label,
  disabled states (no voice, no Cartesia key, no slides), the existing-video state, the replace notice.
  Add to `everyBlockRenders` only if a new layout/block is added (none is).
- **Not testable here (no jsdom, no WebCodecs, no key):** DOM-to-canvas fidelity, the real encode,
  real playback and upload. **Check by hand in Chrome and one other browser**, on a deck using each
  theme, ink and a tall card. **Highest risk: web fonts.** `html-to-image` inlines fonts by fetching
  stylesheets, and theme fonts loaded from another origin can be missed, producing a fallback font in the
  video. If it shows, the fix is to pass `fontEmbedCSS`. `supabase/tests/0015_video_rls.sql` is
  **hand-run and has not been run** (state this in CLAUDE.md as for 0012/0014).

## Dependencies

`mediabunny` (1.60) and `html-to-image` (1.11). Both are imported lazily (`import()` at generation time,
own chunks, never in the entry bundle), as `jspdf` is.

## CLAUDE.md changes

Update the Voice section (the saved voice no longer feeds only the preview; nothing else exports audio
is now false: the video does), add a "Narrated video" section for the invariants above, add migration
0015 to Persistence, and add the Cartesia-spend note to the key warning.
