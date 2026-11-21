# Talking Intro & Outro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The narrated video gets an optional full-screen, lip-synced clip of the user's face (WaveSpeed InfiniteTalk 480p) before slide 1 and after the last slide. The words come from two boxes in the Narrate tab.

**Architecture:**
- A new `src/avatar/` folder holds:
  - the Intro/Outro text model and its store
  - the one WaveSpeed network file
  - the face-photo storage
  - the browser-only clip decoder
- The pure video pipeline (`src/video/pipeline.ts`) learns about bookend segments through injected deps. It is tested against fakes.
- `src/video/generate.ts` wires the real WaveSpeed calls and the mediabunny decoder behind the existing `import()`.

**Tech Stack:** React 19 + TypeScript, zustand, Supabase (Postgres + Storage), mediabunny (encode and decode), Vitest (no jsdom; SSR smoke tests for components).

**Spec:** `docs/superpowers/specs/2026-11-21-talking-intro-outro-design.md`. Read it first. Also read the `Narrated video`, `Voice` and `Background jobs` sections of `CLAUDE.md`.

## Global Constraints

- **Env key:** `VITE_WAVESPEED_API_KEY`, read at call time. User copy never names it. The copy is `FACE_NOT_SET_UP = "Talking intros aren't set up on this site yet. Whoever runs it needs to add a WaveSpeed key."` in `src/lib/setupCopy.ts`. The variable name goes only to `warnMissingKey`.
- **Endpoints**, base `https://api.wavespeed.ai/api/v3`:
  - upload `POST /media/upload/binary` (multipart `file`) → `data.download_url`
  - submit `POST /wavespeed-ai/infinitetalk` with `{ image, audio, resolution: '480p' }` → `data.id`
  - poll `GET /predictions/{id}/result` → `data.status`, `data.outputs[0]`, `data.error`
  - auth header is `Authorization: Bearer <key>`
- **Submit is never retried**, automatically or in a loop, because each submit is a separate billed job. Polling may retry.
- **Statuses:** terminal failures are `failed`, `cancelled`, `timeout`, `deleted`. Success is `completed`. Anything else means still running.
- **Price and wait:** `$0.03` per second, rounded up, 3 s minimum. Wait estimate is 10 to 30 s of processing per second of clip.
- **Aborts:** every network call takes an `AbortSignal`, and an abort always surfaces as a `DOMException` named `AbortError`, never a `WavespeedError`.
- **Lazy loading:** mediabunny and `src/avatar/drawClip.ts` are reached only through `import('@/video/generate')`. `src/jobs/*` never imports them statically.
- **Migration 0021** gates only this feature. `loadDeck`'s select never names `bookends`. The column is read and written in its own best-effort calls, and a failure sets a warning, never `presentationStore.status = 'error'`.
- **Photo storage:** private bucket `face-photos`, path `<uid>/face.<ext>`, jpeg/png/webp only, 10 MB maximum. Consent is required before upload, with the copy `This is my face, or I have permission to use it.`
- **Generate once:** no AI call is added, and nothing here writes `cards`.
- **Starter copy:**
  - intro: `Hi! Today we're looking at ${title}. Let's get started.`
  - intro with an empty title: `Hi! Let's get started.`
  - outro: `That's all for ${title}. Thanks for watching!`
  - outro with an empty title: `That's all for today. Thanks for watching!`

## Review Focus

1. **A cancel while the clips are processing.** Both talk promises are already running when slide narration starts. A cancel, or a failure on a later slide, must not leave an unhandled rejection, and must return `cancelled` or that error. *Test in Task 5: `cancel during animating returns cancelled and saves nothing` and `a slide narration failure with talks in flight throws that error, no unhandled rejection`.*
2. **The intro box cleared to blank.** That means "no intro clip". It must not fall back to the starter. Never edited means the starter is used. *Test in Task 2: `null uses the starter, '' means none`.*
3. **A clip shorter than its audio** (seen live: 2.92 s of video for 3.0 s of audio). The last frame is held, so picture and sound stay in step and slide timings are not shifted. *Test in Task 6 (pure `clipFrameSlots`): `holds the last frame to the segment end` and `drops frames past the segment end`.*
4. **A network blip or 5xx while polling.** Polling keeps going, and a 401 stops it. Submit errors are never retried. *Test in Task 3: `poll survives a 503 then completes` and `submit is called once even when it fails with 503`.*
5. **A video made with the intro on and then used for a lesson.** `VideoRecord.slides` must list slides only, offset by the intro's length, so checkpoints land after the right slide. *Test in Task 5: `slide timings are offset by the intro and exclude bookends`.*

---

### Task 1: Migration 0021 (bookends column + face-photos bucket)

**Files:**
- Create: `supabase/migrations/0021_talking_bookends.sql`
- Create: `supabase/tests/0021_face_photos.sql`

**Interfaces:**
- Produces:
  - the column `presentations.bookends jsonb not null default '{}'::jsonb`
  - the bucket `face-photos` (private, `file_size_limit` 10485760, `allowed_mime_types` `{image/jpeg,image/png,image/webp}`)
  - policies `face_photos_select|insert|update|delete` on `storage.objects`, each `bucket_id = 'face-photos' and (storage.foldername(name))[1] = auth.uid()::text`

- [ ] **Step 1: Write the migration.** Copy the structure of `supabase/migrations/0015_deck_videos.sql`: an idempotent `insert … on conflict (id) do update` for the bucket, and `drop policy if exists` before each `create policy`. Add `alter table presentations add column if not exists bookends jsonb not null default '{}'::jsonb;` with a comment saying it gates only the talking intro/outro.
- [ ] **Step 2: Write the hand-run RLS test**, in the style of `supabase/tests/0015*.sql` if present, else `0017`. User A inserts an object at `A/face.jpg`. User B cannot select, update or delete it. B cannot insert into `A/…`. A can do all four. Wrap it in `begin … rollback`.
- [ ] **Step 3: Do not apply.** Task 9 applies it, after the user says "go". Commit:

```bash
git add supabase/migrations/0021_talking_bookends.sql supabase/tests/0021_face_photos.sql
git commit -m "feat(db): 0021 bookends column and private face-photos bucket"
```

### Task 2: Intro/outro text model, row access and store

**Files:**
- Create: `src/avatar/bookends.ts`, `src/avatar/bookends.test.ts`
- Create: `src/avatar/bookendsRow.ts` (no test; mirrors `src/generation/metaRow.ts`)
- Create: `src/avatar/bookendsStore.ts`, `src/avatar/bookendsStore.test.ts`
- Modify: `src/store/authStore.ts`: call `useBookendsStore.getState().reset()` wherever other per-user stores are cleared on user change (search for `voiceStore` reset).

**Interfaces:**
- Produces (`bookends.ts`, pure):
  - `interface Bookends { intro: string | null; outro: string | null }`: `null` means never edited (use the starter), `''` means no clip.
  - `EMPTY_BOOKENDS: Bookends = { intro: null, outro: null }`
  - `parseBookends(raw: unknown): Bookends`: reads `{intro?: string, outro?: string}`. A missing or non-string field gives `null`. Non-objects give `EMPTY_BOOKENDS`.
  - `bookendsToRow(b: Bookends): Record<string, string>`: drops `null` fields and keeps `''`.
  - `starterIntro(title: string): string` and `starterOutro(title: string): string`, using the exact copy in Global Constraints, with the title trimmed.
  - `bookendText(b: Bookends, end: 'intro' | 'outro', title: string): string`: the starter when `null`, else the stored text trimmed.
  - `CLIP_PRICE_PER_SECOND = 0.03`, `MIN_BILLED_SECONDS = 3`
  - `clipCost(seconds: number): number`: `0` for `seconds <= 0`, else `Math.max(3, Math.ceil(seconds)) * 0.03`, rounded to cents.
  - `formatUsd(n: number): string`, for example `"$1.05"`.
  - `waitMinutes(longestClipSeconds: number): { min: number; max: number }`: `ceil(s*10/60)` and `ceil(s*30/60)`. The two clips run in parallel, so the longer one sets the wait.
- Produces (`bookendsRow.ts`):
  - `readBookendsRow(client: SupabaseClient, deckId: string): Promise<unknown | null>`
  - `writeBookendsRow(client: SupabaseClient, deckId: string, row: Record<string, string>): Promise<boolean>`
  - Both catch errors and `console.warn` with "(run migration 0021)".
- Produces (`bookendsStore.ts`):
  - `createBookendsStore(ports: { read(deckId: string): Promise<unknown | null>; write(deckId: string, row: Record<string, string>): Promise<boolean> }, delayMs = 500)`, returning a zustand store with:
    - `deckId: string | null`
    - `bookends: Bookends`
    - `loaded: boolean`
    - `warning: string | null`
    - `load(deckId: string): Promise<void>`: a no-op when this deck is already loaded. It flushes a pending write for the previous deck before reading.
    - `set(patch: Partial<Bookends>): void`: updates at once and debounces the write.
    - `flush(): Promise<void>`
    - `reset(): void`
  - `useBookendsStore`, the real instance, wired to `bookendsRow` with `supabase`. It registers `flush` on `beforeunload`, the same way `presentationStore` does.
  - Warning copy on a failed write: `Your intro and outro could not be saved.`

- [ ] **Step 1: Write failing tests** in `bookends.test.ts`:
  - `parseBookends`: `{}` gives both `null`. `{intro:'', outro:'Bye'}` gives `{intro:'', outro:'Bye'}`. `{intro: 5}` gives `intro: null`. `null`, `[]` and `'x'` give `EMPTY_BOOKENDS`.
  - `null uses the starter, '' means none`: `bookendText({intro:null,outro:''}, 'intro', 'Volcanoes') === "Hi! Today we're looking at Volcanoes. Let's get started."` and `bookendText(…, 'outro', …) === ''`.
  - Starters with a blank title give `"Hi! Let's get started."` and `"That's all for today. Thanks for watching!"`.
  - `clipCost(0) === 0`, `clipCost(1.2) === 0.09`, `clipCost(20) === 0.6`, `clipCost(20.1) === 0.63`. `formatUsd(1.05) === '$1.05'`.
  - `waitMinutes(20)` gives `{min: 4, max: 10}`.
  - `bookendsToRow({intro:'', outro:null})` gives `{intro: ''}`.
- [ ] **Step 2:** Run `npx vitest run src/avatar/bookends.test.ts`. Expect FAIL, because the module is missing.
- [ ] **Step 3:** Implement `bookends.ts`.
- [ ] **Step 4: Write failing store tests** in `bookendsStore.test.ts`, with fake ports and `vi.useFakeTimers()`:
  - `load` reads once and parses the row.
  - A second `load` of the same deck does not read again.
  - Three `set` calls within 500 ms produce one `write`, holding the last value.
  - `load('b')` with a pending write for `'a'` writes `'a'` first, then reads `'b'`.
  - A `write` that returns `false` sets `warning` and leaves `bookends` untouched.
  - `reset` clears everything.
- [ ] **Step 5:** Implement `bookendsRow.ts` and `bookendsStore.ts`, then wire the `authStore` reset.
- [ ] **Step 6:** Run `npx vitest run src/avatar`. Expect PASS.
- [ ] **Step 7: Commit** with `feat(avatar): intro/outro text model and best-effort store`.

### Task 3: WaveSpeed client

**Files:**
- Create: `src/avatar/wavespeed.ts`, `src/avatar/wavespeed.test.ts`
- Modify: `src/lib/setupCopy.ts`: add `FACE_NOT_SET_UP` (exact copy in Global Constraints).

**Interfaces:**
- Produces:
  - `WAVESPEED_URL = 'https://api.wavespeed.ai/api/v3'`
  - `isWavespeedConfigured(): boolean`: reads `import.meta.env.VITE_WAVESPEED_API_KEY` at call time, trimmed.
  - `type WavespeedErrorKind = 'auth' | 'capacity' | 'request' | 'failed' | 'timeout' | 'unknown'`
  - `class WavespeedError extends Error { kind: WavespeedErrorKind; status?: number }`, with no constructor parameter properties (`erasableSyntaxOnly`).
  - `uploadMedia(file: Blob, filename: string, signal?: AbortSignal): Promise<string>`: returns `data.download_url`.
  - `submitTalk(o: { imageUrl: string; audioUrl: string; signal?: AbortSignal }): Promise<string>`: returns `data.id`. The body is exactly `{ image, audio, resolution: '480p' }`.
  - `TALK_TIMEOUT_MS = 20 * 60_000`
  - `pollDelayMs(attempt: number): number`: `min(10_000, round(2000 * 1.5 ** attempt))`.
  - `waitForTalk(id: string, signal?: AbortSignal, o?: { sleep?: (ms: number, s?: AbortSignal) => Promise<void>; now?: () => number }): Promise<string>`: returns `outputs[0]`.
    - Defaults to `sleep` from `src/ai/retry.ts` and `Date.now`.
    - A fetch error, 429 or 5xx while polling: sleep and poll again.
    - A 401 or 403: throw `auth`.
    - A terminal failure status: throw `failed`, with `data.error` in the message.
    - Past `TALK_TIMEOUT_MS`: throw `timeout`.
    - `completed` with no outputs: throw `failed`.
  - `downloadClip(url: string, signal?: AbortSignal): Promise<Blob>`
- Error mapping follows `src/voice/cartesia.ts` `errorFor` and `send`: 401/403 give `auth`, 429/503 give `capacity`, other 4xx give `request`, anything else gives `unknown`. A network failure gives `unknown` with `Could not reach WaveSpeed. Check your connection and try again.` Without a key, throw `WavespeedError(FACE_NOT_SET_UP, 'auth')` before any fetch.

- [ ] **Step 1: Write failing tests.** Stub `fetch` with `vi.stubGlobal`, and set the key with `vi.stubEnv('VITE_WAVESPEED_API_KEY','k')`.
  - `submitTalk sends the exact body and bearer header`: the parsed body equals `{image:'i',audio:'a',resolution:'480p'}`, and `Authorization` is `'Bearer k'`.
  - `submit is called once even when it fails with 503`: it rejects with kind `capacity`, and `fetch` was called once.
  - `poll survives a 503 then completes`: the responses are 503, then `{data:{status:'processing'}}`, then `{data:{status:'completed',outputs:['u']}}`, and the result is `'u'`. Use a fake `sleep` that resolves at once.
  - Each of `failed`, `cancelled`, `timeout` and `deleted` rejects with kind `failed`, and the message includes `data.error`.
  - With a `now` fake that jumps past 20 min, it rejects with kind `timeout`.
  - A 401 while polling rejects with kind `auth` and makes no more fetches.
  - `abort stays an AbortError`: aborting the signal during a pending fetch rejects with `name === 'AbortError'` and is not an `instanceof WavespeedError`.
  - With no key, it rejects with `FACE_NOT_SET_UP` and makes zero fetches.
  - `uploadMedia` posts `FormData` with the `file` field and returns `download_url`.
- [ ] **Step 2:** Run `npx vitest run src/avatar/wavespeed.test.ts`. Expect FAIL.
- [ ] **Step 3:** Implement. The header comment should mirror `cartesia.ts`: why the key is in the bundle, and that CORS `*` was verified on 2026-11-21.
- [ ] **Step 4:** Run the tests. Expect PASS.
- [ ] **Step 5: Commit** with `feat(avatar): WaveSpeed InfiniteTalk client`.

### Task 4: Face photo storage and account deletion

**Files:**
- Create: `src/avatar/facePhoto.ts`, `src/avatar/facePhoto.test.ts`
- Modify: `src/store/authStore.ts` `deleteAccount`

**Interfaces:**
- Produces:
  - `FACE_BUCKET = 'face-photos'`, `FACE_TYPES = ['image/jpeg','image/png','image/webp'] as const`, `MAX_FACE_BYTES = 10 * 1024 * 1024`
  - `facePath(uid: string, contentType: string): string`: gives `${uid}/face.jpg|png|webp`.
  - `faceUploadProblem(file: { type: string; size: number }, consented: boolean): string | null`. The messages are:
    - not consented: `Tick the box to confirm this is your face, or that you have permission.`
    - wrong type: `Use a JPG, PNG or WebP photo.`
    - too big: `Use a photo under 10 MB.`
  - `interface FacePorts`:
    - `list(uid): Promise<{ names: string[]; error: PortError | null }>`
    - `upload(path, blob, contentType): Promise<{ error: PortError | null }>`
    - `remove(paths): Promise<{ error: PortError | null }>`
    - `signedUrl(path): Promise<{ url: string | null; error: PortError | null }>`
    - `PortError` comes from `src/video/storageErrors.ts`.
  - `interface FacePhoto { path: string; url: string }`
  - `readFacePhoto(ports, uid): Promise<FacePhoto | null>`: the first `face.*` name in the list, signed. Any error gives `null`.
  - `saveFacePhoto(ports, uid, file: Blob & { type: string; size: number }, consented: boolean): Promise<FacePhoto>`: throws `Error(problem)` from `faceUploadProblem`. Uploads with upsert, then removes any other `face.*` leftovers. A failed removal is ignored.
  - `deleteFacePhoto(ports, uid): Promise<{ error: string | null }>`
  - `supabaseFacePorts(client: SupabaseClient): FacePorts`, using signed URLs valid for 3600 s.
- In `deleteAccount`: after the voices step and before the RPC, `import('@/avatar/facePhoto')` and run `deleteFacePhoto`. On an error, `return { error }` with nothing else deleted, the same way voices stop the run.

- [ ] **Step 1: Write failing tests** with fake ports:
  - The three `faceUploadProblem` messages, and `null` for a 1 MB `image/png` with consent.
  - `saveFacePhoto` refuses without consent and calls no upload.
  - Saving a png when `face.jpg` exists uploads `u/face.png`, then removes `['u/face.jpg']`.
  - `readFacePhoto` returns `null` on a list error.
  - `deleteFacePhoto` removes every `face.*`.
- [ ] **Step 2:** Run `npx vitest run src/avatar/facePhoto.test.ts`. Expect FAIL.
- [ ] **Step 3:** Implement, then wire `deleteAccount`.
- [ ] **Step 4:** Run the tests. Expect PASS.
- [ ] **Step 5: Commit** with `feat(avatar): private face photo storage, removed with the account`.

### Task 5: Pipeline bookend segments

**Files:**
- Modify: `src/video/errors.ts`: `VideoStage` gains `'animating'`, giving the order `narrating | animating | rendering | encoding | uploading`.
- Modify: `src/video/pipeline.ts`, `src/video/pipeline.test.ts`
- Modify: `src/video/ui.ts`, `src/video/ui.test.ts`
- Modify: `src/jobs/timelines.ts`, `src/jobs/timelines.test.ts`

**Interfaces:**
- Produces (`pipeline.ts`):
  - `interface PipelineBookends { intro: string; outro: string }`: trimmed text, `''` means no clip at that end.
  - `PipelineInput.bookends?: PipelineBookends`
  - `interface BookendDeps<A extends Clip, T>`:
    - `narrateWithFile(text: string, signal: AbortSignal): Promise<{ audio: A; file: Blob }>`
    - `talk(file: Blob, signal: AbortSignal): Promise<T | null>`: `null` is a non-cancel failure. It rejects with an AbortError on cancel.
    - `encodeTalk(clip: T, startSeconds: number, durationSeconds: number, signal: AbortSignal): Promise<void>`: adds every frame for the segment through the encoder.
    - `drawTitleCard(signal: AbortSignal): Promise<void>`: draws the fallback picture into the encoder canvas.
  - `PipelineDeps<A, T = never>` gains `bookends?: BookendDeps<A, T>`. When `input.bookends` has non-empty text but `deps.bookends` is absent, throw `RangeError`.
  - `PipelineResult` done becomes `{ status: 'done'; record: VideoRecord; faceFailed: boolean }`.
- Run order:
  1. Narrate the intro, then the outro, through `narrateWithFile`. Stage `narrating`, with total = bookend count + slide count.
  2. Call `talk` for each at once, without awaiting. Attach a no-op `.catch` to each stored promise so an early exit never leaves an unhandled rejection.
  3. Narrate the slides as today.
  4. Stage `animating`, with done/total over the clips: await each talk. A cancel is honoured.
  5. `planTimeline([intro?, ...slides, outro?])`.
  6. For a bookend segment: `addAudio(bookendAudio)`, then either `encodeTalk(clip, start, duration)` or, when the clip is `null`, `drawTitleCard` followed by the `frameSlots` frames. The clip's own audio is ignored.
  7. `save` receives the slide timings only, taken from the slide segments, so the intro offsets them, and `timeline.totalSeconds`.
  8. `faceFailed` is true when any talk returned `null`.
- Produces (`ui.ts`):
  - `stageRows(progress: Progress | null, withFace = false)`: includes the `animating` row, labelled `Animating your intro & outro`, only when `withFace`.
  - `canCancelVideo` is unchanged.
  - `faceBlocker(i: { configured: boolean; hasPhoto: boolean; introText: string; outroText: string }): string | null`, returning in order:
    - `FACE_NOT_SET_UP`
    - `Add a photo of your face first.`
    - `Write an intro or an outro in the Narrate tab first.`
    - `null`
- Produces (`timelines.ts`): `videoTimeline(p: Progress | null, withFace = false)`. With the face, the spans are `[0.15, 0.45, 0.25, 0.08, 0.07]`. Without it, the spans stay `[0.4, 0.4, 0.1, 0.1]`.

- [ ] **Step 1: Write failing pipeline tests.** Extend the fakes already in `pipeline.test.ts`. Record call order in an array, and make `talk` a controllable deferred.
  - `bookends off makes zero talk and narrateWithFile calls` (no `bookends`, and also `{intro:'',outro:''}`).
  - `narrates intro and outro first and starts both talks before slide narration`: the order log begins with `narrateWithFile:intro`, `narrateWithFile:outro`, `talk`, `talk`, `narrate:0`.
  - `encodes intro, slides, outro in order`: with an intro of 3 s and slides of 2 s and 4 s, the encode log is `encodeTalk(…,0,3)`, slide 0, slide 1, `encodeTalk(…,9,2)` (outro of 2 s), and `totalSeconds === 11`.
  - `slide timings are offset by the intro and exclude bookends`: `save` gets `[{cardId:'a',startSeconds:3,durationSeconds:2},{cardId:'b',startSeconds:5,durationSeconds:4}]`.
  - `a null talk falls back to a title card and reports faceFailed`: intro talk resolves `null`. Then `drawTitleCard` is called once, `frameSlots` frames are added for 3 s, `faceFailed === true`, and the result is `done`.
  - `cancel during animating returns cancelled and saves nothing`: abort while the talk deferred is pending, then reject it with an AbortError. Result is `{status:'cancelled'}`, `save` is never called, and `encoder.cancel` is called.
  - `a slide narration failure with talks in flight throws that error, no unhandled rejection`: slide 1's `narrate` rejects, and the talk deferreds later reject. It throws `VideoError('narrating', …)`. Register `process.on('unhandledRejection')` in the test and assert it was not called after `await new Promise(r => setTimeout(r, 0))`.
- [ ] **Step 2: Write failing ui and timeline tests:**
  - `stageRows(p, true)` has 5 rows with `animating` second. `stageRows(p)` still has 4.
  - Each `faceBlocker` message, in order of precedence.
  - `videoTimeline({stage:'animating',done:0,total:2}, true).progress === 0.15`.
- [ ] **Step 3:** Run `npx vitest run src/video src/jobs/timelines.test.ts`. Expect the new tests to FAIL.
- [ ] **Step 4:** Implement the changes in `errors.ts`, `pipeline.ts`, `ui.ts` and `timelines.ts`. Keep the existing tests passing; they cover the no-bookend path unchanged, apart from `faceFailed: false` in the done result.
- [ ] **Step 5:** Run `npx vitest run src/video src/jobs`. Expect PASS.
- [ ] **Step 6: Commit** with `feat(video): intro and outro segments in the pipeline`.

### Task 6: Browser glue (decode, draw, talker, generate wiring, job notice)

**Files:**
- Create: `src/avatar/clipFrames.ts`, `src/avatar/clipFrames.test.ts` (pure)
- Create: `src/avatar/drawClip.ts` (browser-only: mediabunny decode, letterbox draw, title card)
- Create: `src/avatar/talker.ts` (browser glue: photo, upload, submit, wait, download, decode check)
- Modify: `src/video/narrate.ts` (adds `narrateWithFile`)
- Modify: `src/video/generate.ts`, `src/jobs/videoJob.ts`, `src/jobs/videoJob.test.ts`, `src/jobs/start.ts`
- Modify: `src/jobs/jobsStore.ts`, its test, `src/components/jobs/JobRow.tsx`

**Interfaces:**
- Produces (`clipFrames.ts`):
  - `clipFrameSlots(frames: readonly { timestamp: number; duration: number }[], segmentStart: number, segmentSeconds: number): { index: number; timestamp: number; duration: number }[]`
  - It maps each source frame, by its index in `frames`, to `segmentStart + timestamp`.
  - It drops frames that start at or after `segmentSeconds`, and clamps the last kept frame so it ends at `segmentStart + segmentSeconds`.
  - When the frames end early, it extends the last kept frame to the segment end (this holds the last picture).
  - With an empty `frames`, it returns `[]`.
- Produces (`drawClip.ts`):
  - `openClip(blob: Blob): Promise<DecodedClip | null>`: mediabunny `Input({ source: new BlobSource(blob), formats: ALL_FORMATS })` and `getPrimaryVideoTrack()`. Returns `null` when there is no track or the clip has zero duration.
  - `interface DecodedClip { duration: number; frames(): AsyncIterable<{ canvas: HTMLCanvasElement | OffscreenCanvas; timestamp: number; duration: number }>; dispose(): void }`, using `CanvasSink`.
  - `encodeClip(o: { clip: DecodedClip; target: HTMLCanvasElement; background: string; startSeconds: number; durationSeconds: number; addFrame(ts: number, dur: number): Promise<void>; signal: AbortSignal }): Promise<void>`
    - It collects frame metadata as it goes. For each source frame it draws letterboxed on `background` using `frameScale` from `src/video/timeline.ts` (fit, never crop), then calls `addFrame` per `clipFrameSlots`.
    - Frames are streamed, not buffered. Compute the slots incrementally with the same rules as `clipFrameSlots`, and test the rules through the pure function.
  - `drawTitleCard(target: HTMLCanvasElement, o: { title: string; background: string; foreground: string; font: string }): void`
    - Canvas 2D: fill `background`, then centre the title in `foreground` at 64px, `font` = `theme.typography.headingFont`.
    - Wrap at 80% of the width, with at most 3 lines and an ellipsis.
    - Call `await document.fonts.load(\`64px ${font}\`)` before drawing. `drawTitleCard` stays synchronous, so the font load happens in the caller.
- Produces (`talker.ts`):
  - `createTalker(o: { photoUrl: string }): { talk(file: Blob, signal: AbortSignal): Promise<DecodedClip | null> }`
  - It fetches the photo once and uploads it once, memoising the promise. For each call it then runs `uploadMedia(file,'clip.wav')`, `submitTalk`, `waitForTalk`, `downloadClip` and `openClip`.
  - Any non-abort error is logged with `console.warn('[avatar]', err)` and returns `null`. An abort is rethrown.
- Produces (`narrate.ts`): `Narrator.narrateWithFile(text, signal): Promise<{ audio: AudioBuffer; file: Blob }>`, sharing `speak` and the decode.
- Produces (`generate.ts`):
  - `generateVideoForDeck` takes `face: { bookends: PipelineBookends } | null`.
  - When `face` is set: check `isWavespeedConfigured()`, then `readFacePhoto(supabaseFacePorts(supabase), uid)`. A missing photo throws `VideoError('animating', 'Add a photo of your face first.')`, after `detectFormat` and before any Cartesia call.
  - Build `deps.bookends` from the talker, `encodeClip` (background `theme.colors.deep`) and `drawTitleCard` (deck title, `deep` / `deepForeground`).
  - Import `drawClip.ts` and `talker.ts` with `import()` next to the encoder imports.
  - `GenerateResult` done gains `faceFailed: boolean`.
- Produces (jobs):
  - `VideoJobInput.face: { bookends: PipelineBookends } | null`
  - `JobSpec.run` resolves `{ deckId: string; notice?: string }`
  - `Job.notice: string | null`, set on done and `null` otherwise
  - The video job's notice when `faceFailed` is `The talking clip could not be made, so a title card was used instead.`
  - `videoTimeline(p, input.face !== null)`
  - `JobRow` shows `job.notice` under the done row as `text-xs text-app-muted`.

- [ ] **Step 1: Write failing `clipFrames` tests:**
  - `drops frames past the segment end`: frames at 0, 0.04, … for 3.2 s with a 3 s segment. The last slot ends at exactly `start + 3`, and no slot starts at or after it.
  - `holds the last frame to the segment end`: frames covering 2.92 s with a 3 s segment. The last slot's `timestamp + duration === start + 3`.
  - `offsets by segmentStart`: the first slot's timestamp equals `segmentStart`.
  - With empty frames, it returns `[]`.
- [ ] **Step 2:** Run `npx vitest run src/avatar/clipFrames.test.ts`. Expect FAIL, then implement it and expect PASS.
- [ ] **Step 3: Write failing job tests:**
  - In `jobsStore.test.ts`, a spec resolving `{deckId:'d', notice:'n'}` gives `job.notice === 'n'`.
  - In `videoJob.test.ts`, a fake `generate` returning `faceFailed: true` makes `run` resolve with the notice copy. With `face: null`, the timeline has no `animating` row.
- [ ] **Step 4:** Implement `narrate.ts`, `drawClip.ts`, `talker.ts`, `generate.ts`, the jobs changes and `JobRow`. Then run `npx vitest run`. Expect PASS.
- [ ] **Step 5:** Run `npm run build`. Expect a pass. In the chunk list, `mediabunny` and the `drawClip`/`talker` code must appear only in the lazy chunk reached from `video/generate`, not in `index-*.js`. Check with `grep -l "BlobSource\|infinitetalk" dist/assets/index-*.js`, which should print nothing.
- [ ] **Step 6: Commit** with `feat(video): decode and draw the talking clips; job notice`.

### Task 7: Narrate tab Intro & outro boxes

**Files:**
- Modify: `src/components/editor/NarrationTab.tsx`, `src/components/editor/NarrationTab.test.tsx`

**Interfaces:**
- Consumes: `useBookendsStore` (Task 2), `bookendText`, `starterIntro` / `starterOutro`, `clipCost`, `formatUsd` (Task 2), and `speakingSeconds` / `formatDuration` (`src/lib/speakingTime.ts`).
- The section sits above the slide script: a `<details>` element with the summary `Intro & outro`.
  - It holds two labelled textareas, `Intro` and `Outro`, each 3 rows, using the same classes as the script box minus `flex-1`.
  - **Value:** the stored text, or the starter when the stored text is `null`.
  - **On change:** `set({ intro: value })`, storing exactly what was typed, including `''`.
  - **Meta line under each box:** `~${formatDuration(s)} · about ${formatUsd(clipCost(s))}`, or `No clip` when the trimmed text is blank.
  - **Hint under the section:** `Spoken over your face before the first slide and after the last. Leave a box empty for no clip.`
  - **Store warning:** `warning` shows as the tab's error text.
- `useEffect(() => { if (presentationId) void useBookendsStore.getState().load(presentationId) }, [presentationId])`

- [ ] **Step 1: Write failing SSR tests.** Set state through `getInitialState()`, per the CLAUDE.md SSR quirk.
  - With the store `{intro:null, outro:''}` and title `Volcanoes`, the markup contains the intro starter text and `No clip`.
  - The `Intro & outro` summary is present.
- [ ] **Step 2:** Run `npx vitest run src/components/editor/NarrationTab.test.tsx`. Expect FAIL, then implement and expect PASS.
- [ ] **Step 3: Commit** with `feat(narration): intro and outro boxes`.

### Task 8: Video dialog step "Talking intro & outro"

**Files:**
- Modify: `src/components/voice/CloneVoiceModal.tsx`, `src/components/voice/CloneVoiceModal.test.tsx`

**Interfaces:**
- Consumes:
  - `faceBlocker` (Task 5)
  - `readFacePhoto`, `saveFacePhoto`, `deleteFacePhoto`, `supabaseFacePorts`, `faceUploadProblem` (Task 4)
  - `isWavespeedConfigured` (Task 3)
  - `useBookendsStore`, `bookendText`, `clipCost`, `formatUsd`, `waitMinutes` (Task 2)
  - `speakingSeconds`
  - `startVideoJob({ …, face })` (Task 6)
- A new section 3 titled `Talking intro & outro` goes between "How it sounds" and the Video section, which becomes 4.
  - **Switch:** a checkbox labelled `Add a talking intro & outro`. It defaults to on when `faceBlocker(...) === null`. When a blocker exists it is disabled, with the blocker shown beside it.
  - **No photo yet:**
    - a file input (`accept="image/jpeg,image/png,image/webp"`)
    - a consent checkbox with the exact copy from Global Constraints
    - an `Upload photo` button, disabled while `faceUploadProblem` returns non-null, which shows that message
  - **Photo saved:** a 64px round thumbnail plus `Replace` and `Remove` buttons. `Remove` needs a second press within the same open dialog.
  - **Cost line**, when on: `Adds about ${min}–${max} min and ${formatUsd(introCost + outroCost)} (WaveSpeed). It still bills if you cancel.`
- `generate()` passes `face: on ? { bookends: { intro: bookendText(b,'intro',title), outro: bookendText(b,'outro',title) } } : null`. It calls `await useBookendsStore.getState().flush()` before starting.
- The footer's Cartesia line stays unchanged.

- [ ] **Step 1: Write failing SSR tests:**
  - With `isWavespeedConfigured` false (`vi.stubEnv` empty), the markup contains `FACE_NOT_SET_UP` and the switch is `disabled`.
  - With the key set and no photo, the markup contains the consent copy and `Add a photo of your face first.`
  - Section headings read `Talking intro & outro` and then `Video`.
  - `VITE_` never appears in the markup (the existing assertion style in that file).
- [ ] **Step 2:** Run `npx vitest run src/components/voice/CloneVoiceModal.test.tsx`. Expect FAIL, then implement and expect PASS.
- [ ] **Step 3:** Run `npm run lint` and `npm run test`. Expect a pass with 0 errors.
- [ ] **Step 4: Commit** with `feat(voice): talking intro & outro step in the video dialog`.

### Task 9: Docs, migration, end-to-end check

**Files:**
- Modify: `CLAUDE.md`:
  - Environment: add the `VITE_WAVESPEED_API_KEY` line.
  - Migration table: add 0021, gating "talking intro/outro only".
  - Narrated video: a paragraph on bookends, covering lazy loading, no submit retry, the slide timings offset and the title-card fallback.
  - RLS list: add 0021.
- Modify: `.env.example`: drop "Not wired into the app yet."

- [ ] **Step 1:** Update the docs, then commit with `docs: talking intro & outro`.
- [ ] **Step 2:** Ask the user for "go". Then apply 0021 with the Supabase MCP `apply_migration`, retrying at most once (see the memory note on Supabase approvals), and run `supabase/tests/0021_face_photos.sql` through `execute_sql`. Expect every assertion to pass and the transaction to roll back.
- [ ] **Step 3: Manual end-to-end** on `npm run dev`, about $0.30. Use a 2-slide deck, a short intro and outro, your photo, and the switch on.
  - The tray shows `Animating your intro & outro`.
  - The video plays face, then slide 1, then slide 2, then face.
  - The download works.
  - In the browser console, `presentations.video.slides[0].startSeconds` equals the intro's length.
- [ ] **Step 4: Failure path.** Set the WaveSpeed key to a bad value and restart dev. The video still saves, with the title card at both ends, and the tray shows the notice.
- [ ] **Step 5: Cancel during `animating`.** Nothing is saved, and the previous video is still shown in the dialog.
