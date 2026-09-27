# Narrated Video ("Generate Presentation") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Per the user's saved preference, dispatch implementer subagents with `model: "sonnet"`.

**Goal:** Rename the voice modal's "Save voice" to "Generate Presentation"; clicking it narrates every slide with the chosen Cartesia voice, stitches the slides and audio into a video in the browser, saves it to Supabase Storage (one per deck, replaced each time), and plays it back in the modal.

**Architecture:** A new `src/video/` module. Pure logic (timeline, format choice, storage paths, record parsing, error text, UI rules) is unit-tested; the pipeline is a generic orchestrator over injected ports (narrate, draw, encoder, save) so cancel/failure/ordering rules are tested without a browser; the DOM/WebCodecs/Supabase adapters are thin and checked by hand. The heavy libraries (`mediabunny`, `html-to-image`) load lazily behind `video/generate.ts`.

**Tech Stack:** React 19, TypeScript (`verbatimModuleSyntax`, `erasableSyntaxOnly`), Vitest (`environment: 'node'`, no jsdom), zustand, Supabase (Storage + Postgres), `mediabunny` 1.60 (WebCodecs muxing), `html-to-image` 1.11, Cartesia TTS via the existing `speak()`.

**Spec:** `docs/superpowers/specs/2026-09-27-narrated-video-design.md` (approved; corrected in this planning pass where reading the code disproved an assumption; Task 9 step 2 records what changed in its status line).

## Global Constraints

Copied from the spec and CLAUDE.md; every task includes them.

- Frame size **1280x720** (`FRAME_WIDTH`/`FRAME_HEIGHT`); a card taller than 16:9 is **scaled to fit, never cropped**.
- A blank narration script is shown **silently for 4 seconds** (`SILENT_SLIDE_SECONDS`).
- **One video per deck**, at `<uid>/<presentationId>.<ext>` in the private bucket `deck-videos`; the old object is removed only after the new upload **and** record succeed.
- Container/codec: MP4 (`avc` + `aac`) preferred, WebM (`vp9` + `opus`) fallback; if WebCodecs is missing the button is disabled; if no codec pair encodes, the run fails **before any Cartesia call**.
- `presentations.video` is written in **its own best-effort update, never through `cardRow`**, and migration 0015 must **not gate card writes**.
- **The upload is the point of no return**: cancel before it writes nothing; cancel is disabled during it.
- Every network call honours the `AbortSignal`; an abort is a quiet return (`status: 'cancelled'`), never an error.
- Slides are drawn only while the tab is visible.
- Sequential `speak()` calls, one per narrated slide; blank slides make no call.
- `mediabunny` and `html-to-image` are only imported through `import()` behind `video/generate.ts`; nothing in the entry bundle.
- TypeScript: `import type` for types, no constructor parameter properties, no enums. Lint is oxlint (type-aware): no floating promises (`void` them).
- Tests are colocated `*.test.ts`; no jsdom; modal render tests use `renderToStaticMarkup`.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- A video is a separate artifact generated on demand: it never reads-then-writes `cards`, and is no precedent for regenerating slides (CLAUDE.md "Core rule: generate once").

## Review Focus

Inputs and conditions the spec implies that no obvious test would catch, most likely first. Each has a test in the task named in brackets.

1. **A deck where every slide is blank** must yield a silent slideshow with **no Cartesia call**, not an error. [Task 5]
2. **Cartesia returns an (almost) empty or silent clip** for a slide: fail with a message naming the slide, rather than making a video whose audio and pictures drift apart. [Task 5]
3. **Cancel at the last moment** (during encode finalisation, before the upload starts) must write nothing and leave the previous video intact. [Task 5, with a mutation check]
4. **Regenerating switches container** (a different browser: MP4 -> WebM): the old object is removed only after the new record is written, and never when the new record write failed. [Task 4]
5. **A slide taller than 16:9** (long list, big paragraph) must be scaled to fit, and a degenerate height (0, NaN) must not produce a zero or NaN scale. [Task 2]

Not test-covered, checked by hand at the end (Task 9): image blocks from hosts without CORS, a background tab, real playback, and RLS.

---

## File Structure

| File | Create/Modify | Responsibility |
| --- | --- | --- |
| `supabase/migrations/0015_deck_videos.sql` | create | `presentations.video`, private `deck-videos` bucket, owner-folder policies |
| `supabase/tests/0015_video_rls.sql` | create | hand-run RLS checks (never run) |
| `src/video/errors.ts` | create | `VideoStage`, `VideoError` |
| `src/video/timeline.ts` (+test) | create | frame constants, `planTimeline`, `frameSlots`, `fitScale` |
| `src/video/format.ts` (+test) | create | `VideoFormat`, `chooseFormat`, `hasWebCodecs`, `AUDIO_SAMPLE_RATE` |
| `src/video/paths.ts`, `src/video/videoRecord.ts` (+tests) | create | bucket name, `videoPath`, `VideoRecord`, `parseVideo` |
| `src/video/storageErrors.ts` (+test) | create | `describeStorageFailure`, `MIGRATION_MESSAGE` |
| `src/video/storage.ts` (+test) | create | `StoragePorts`, `saveVideo`, `loadVideo`, `removeDeckVideo`, `supabasePorts` |
| `src/video/pipeline.ts` (+test) | create | `generateVideo` orchestrator over injected ports |
| `src/video/narrate.ts` | create | Cartesia -> `AudioBuffer`, silent buffers (browser API, thin) |
| `src/video/encode.ts` | create | mediabunny encoder + codec detection (browser API, thin) |
| `src/video/renderFrame.tsx` | create | off-screen slide drawing with `html-to-image` (DOM, thin) |
| `src/video/generate.ts` | create | wires the real adapters to the pipeline; the lazy-import boundary |
| `src/video/ui.ts` (+test) | create | button gating, stage rows, cancel rule |
| `src/components/voice/CloneVoiceModal.tsx` (+test) | modify | Generate Presentation button, progress, video player |
| `src/components/editor/NarrationTab.tsx` | modify | pass the deck to the modal |
| `src/store/presentationStore.ts` | modify | `deleteDeck` removes the deck's video first |
| `CLAUDE.md` | modify | Voice section, new "Narrated video" section, migration 0015 |
| `package.json`, `package-lock.json` | modify | add `mediabunny`, `html-to-image` |

Branch: `feat/narrated-video` (already created; the spec is committed on it).

---

### Task 1: Migration 0015 and its hand-run test

**Files:**
- Create: `supabase/migrations/0015_deck_videos.sql`
- Create: `supabase/tests/0015_video_rls.sql`

**Interfaces:**
- Produces: column `presentations.video jsonb` (nullable); private bucket id `deck-videos`; policies restricting every object to the folder named after `auth.uid()`. Later tasks assume exactly these names.

- [ ] **Step 1: Write the migration**

```sql
-- The narrated video generated from a deck ("Generate Presentation" in the voice modal).
--
-- One video per deck: the file lives in the private `deck-videos` bucket at
-- `<user id>/<presentation id>.<mp4|webm>` and `presentations.video` points at it:
--   { "path": "...", "contentType": "video/mp4", "durationSeconds": 42.5, "generatedAt": "..." }
--
-- Does NOT gate anything else: the app writes `video` in its own best-effort update (never
-- through the card upsert), so a project that has not run this migration still saves and
-- loads decks. Generating a video then fails at the upload step with "Run migration 0015".
--
-- Deleting a deck removes the file client-side first (SQL cannot safely delete Storage
-- objects). delete_own_account() does NOT remove a user's videos: they are orphaned, the same
-- class of gap as cloned Cartesia voices.
alter table presentations add column if not exists video jsonb;

-- 50 MB is Supabase's default per-file ceiling; a deck of at most MAX_SLIDES static slides is
-- a few MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('deck-videos', 'deck-videos', false, 52428800, array['video/mp4', 'video/webm'])
on conflict (id) do nothing;

-- Owner-only: the first folder of the object's name must be the caller's user id. Upsert
-- (replacing the deck's video) needs select + insert + update, so all four are defined.
drop policy if exists deck_videos_select on storage.objects;
create policy deck_videos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'deck-videos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists deck_videos_insert on storage.objects;
create policy deck_videos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'deck-videos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists deck_videos_update on storage.objects;
create policy deck_videos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'deck-videos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'deck-videos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists deck_videos_delete on storage.objects;
create policy deck_videos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'deck-videos' and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 2: Write the hand-run test** (same shape as `0014_voice_rls.sql`)

```sql
-- Hand-run checks for 0015_deck_videos.sql.
--
-- Paste into the Supabase SQL editor (runs as postgres) after applying 0015. One
-- transaction that rolls back, so no fixture survives. Any failed check raises and aborts
-- with a message naming it; a clean run ends by printing "deck video checks passed".
--
-- NOT YET RUN against a database.

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a300-000000000001', 'video-a@example.test', '{"display_name":"Vera Video"}'),
  ('00000000-0000-4000-a300-000000000002', 'video-b@example.test', '{"display_name":"Vic Video"}');

-- ── the bucket is private and limited to video ──────────────────────────────
do $$ begin
  if (select public from storage.buckets where id = 'deck-videos') is distinct from false then
    raise exception 'bucket: deck-videos must exist and be private';
  end if;
end $$;

set local role authenticated;

-- ── user A stores a video in their own folder ───────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a300-000000000001","role":"authenticated"}', true);

insert into storage.objects (bucket_id, name)
values ('deck-videos', '00000000-0000-4000-a300-000000000001/deck.mp4');

do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'deck-videos') <> 1 then
    raise exception 'own folder: user A cannot read the object they wrote';
  end if;
end $$;

-- ── user A can replace it (upsert needs update) ─────────────────────────────
update storage.objects set name = name
where bucket_id = 'deck-videos' and name = '00000000-0000-4000-a300-000000000001/deck.mp4';

do $$ begin
  if not found then raise exception 'own folder: user A cannot update their own object'; end if;
end $$;

-- ── user A cannot write into user B's folder ────────────────────────────────
do $$ begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('deck-videos', '00000000-0000-4000-a300-000000000002/deck.mp4');
    raise exception 'rls: user A wrote into user B''s folder';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── user B cannot see or delete user A's object ─────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a300-000000000002","role":"authenticated"}', true);

do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'deck-videos') <> 0 then
    raise exception 'rls: user B can read user A''s video';
  end if;
end $$;

delete from storage.objects
where bucket_id = 'deck-videos' and name = '00000000-0000-4000-a300-000000000001/deck.mp4';

reset role;
do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'deck-videos') <> 1 then
    raise exception 'rls: user B deleted user A''s video';
  end if;
end $$;

do $$ begin raise notice 'deck video checks passed'; end $$;

rollback;
```

- [ ] **Step 3: Sanity-check the SQL text** (no database is available here)

Run: `git diff --stat` and re-read both files once for typos (matching `'deck-videos'`, the four policy names, the `0015` file names). Expected: two new files, nothing else changed.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0015_deck_videos.sql supabase/tests/0015_video_rls.sql
git commit -m "$(cat <<'EOF'
feat(video): migration 0015, private deck-videos bucket and presentations.video

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Pure timeline and format modules

**Files:**
- Create: `src/video/errors.ts`
- Create: `src/video/timeline.ts`, `src/video/timeline.test.ts`
- Create: `src/video/format.ts`, `src/video/format.test.ts`

**Interfaces:**
- Produces (used by Tasks 4-8):
  - `errors.ts`: `type VideoStage = 'narrating' | 'rendering' | 'encoding' | 'uploading'`; `class VideoError extends Error { readonly stage: VideoStage; constructor(stage: VideoStage, message: string) }`.
  - `timeline.ts`: `FRAME_WIDTH = 1280`, `FRAME_HEIGHT = 720`, `STAGE_PADDING = 40`, `SILENT_SLIDE_SECONDS = 4`, `FRAME_STEP_SECONDS = 1`; `interface SlideTiming { index: number; startSeconds: number; durationSeconds: number }`; `interface Timeline { slides: SlideTiming[]; totalSeconds: number }`; `planTimeline(durations: readonly number[]): Timeline` (throws `RangeError` on a non-finite or non-positive duration); `interface FrameSlot { timestamp: number; duration: number }`; `frameSlots(slide: SlideTiming): FrameSlot[]` (always at least one); `fitScale(contentHeight: number, availableHeight: number): number` (in `(0, 1]`, `1` for degenerate input).
  - `format.ts`: `type VideoContentType = 'video/mp4' | 'video/webm'`; `type VideoExt = 'mp4' | 'webm'`; `interface VideoFormat { container: VideoExt; videoCodec: 'avc' | 'vp9'; audioCodec: 'aac' | 'opus'; ext: VideoExt; contentType: VideoContentType }`; `MP4_FORMAT`, `WEBM_FORMAT`; `interface EncodeSupport { mp4: boolean; webm: boolean }`; `chooseFormat(s: EncodeSupport): VideoFormat | null`; `hasWebCodecs(scope?): boolean`; `AUDIO_SAMPLE_RATE = 44100`.

- [ ] **Step 1: Write `errors.ts`** (no test of its own; it is exercised by later tests)

```ts
/** The four stages a run reports and can fail in, in order. */
export type VideoStage = 'narrating' | 'rendering' | 'encoding' | 'uploading'

/**
 * A failure with a message meant for the user. `message` is shown as it is, so every throw site
 * writes it as a sentence ("Narrating slide 3 failed: ...").
 */
export class VideoError extends Error {
  readonly stage: VideoStage

  constructor(stage: VideoStage, message: string) {
    super(message)
    this.name = 'VideoError'
    this.stage = stage
  }
}
```

- [ ] **Step 2: Write the failing timeline test** (`src/video/timeline.test.ts`)

```ts
import { describe, expect, it } from 'vitest'
import { FRAME_HEIGHT, FRAME_STEP_SECONDS, SILENT_SLIDE_SECONDS, STAGE_PADDING, fitScale, frameSlots, planTimeline } from './timeline'

describe('constants', () => {
  it('holds a silent slide for four seconds in a 1280x720 frame', () => {
    expect(SILENT_SLIDE_SECONDS).toBe(4)
    expect(FRAME_HEIGHT).toBe(720)
    expect(FRAME_STEP_SECONDS).toBe(1)
    expect(STAGE_PADDING).toBe(40)
  })
})

describe('planTimeline', () => {
  it('starts each slide where the previous one ends', () => {
    const t = planTimeline([2, 4, 1.5])
    expect(t.slides.map((s) => s.startSeconds)).toEqual([0, 2, 6])
    expect(t.slides.map((s) => s.index)).toEqual([0, 1, 2])
    expect(t.totalSeconds).toBe(7.5)
  })

  it('is empty for no slides', () => {
    expect(planTimeline([])).toEqual({ slides: [], totalSeconds: 0 })
  })

  // A zero-length slide would be a frame with no time on screen and would desync everything after it.
  it.each([0, -1, NaN, Infinity])('refuses a duration of %s', (bad) => {
    expect(() => planTimeline([2, bad])).toThrow(RangeError)
  })
})

describe('frameSlots', () => {
  it('emits one frame per second of hold, the last one shorter', () => {
    const [, second] = planTimeline([4, 2.5]).slides
    const slots = frameSlots(second)
    expect(slots.map((s) => s.timestamp)).toEqual([4, 5, 6])
    expect(slots.map((s) => s.duration)).toEqual([1, 1, 0.5])
  })

  it('covers the slide exactly: durations add up to the hold time', () => {
    const [slide] = planTimeline([3.3]).slides
    const total = frameSlots(slide).reduce((sum, s) => sum + s.duration, 0)
    expect(total).toBeCloseTo(3.3, 9)
  })

  // A slide always needs at least one picture, however short its audio.
  it('emits a frame even for a very short slide', () => {
    const [slide] = planTimeline([0.1]).slides
    expect(frameSlots(slide)).toEqual([{ timestamp: 0, duration: 0.1 }])
  })

  it('does not emit a phantom frame after an exact whole number of seconds', () => {
    const [slide] = planTimeline([3]).slides
    expect(frameSlots(slide)).toHaveLength(3)
  })
})

describe('fitScale', () => {
  it('leaves a slide that already fits at full size', () => {
    expect(fitScale(400, 640)).toBe(1)
    expect(fitScale(640, 640)).toBe(1)
  })

  it('shrinks a taller slide so all of it is visible', () => {
    expect(fitScale(1280, 640)).toBe(0.5)
  })

  // Review Focus 5: a degenerate height must never give a zero or NaN scale.
  it.each([0, -5, NaN, Infinity])('is 1 for a content height of %s', (h) => {
    expect(fitScale(h, 640)).toBe(1)
  })

  it('is 1 when there is no room to fit into', () => {
    expect(fitScale(500, 0)).toBe(1)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/video/timeline.test.ts`
Expected: FAIL (cannot resolve `./timeline`).

- [ ] **Step 4: Write `timeline.ts`**

```ts
/*
  The arithmetic of the video: how long each slide is held, when each picture is
  added, and how far to shrink a slide that is taller than the frame. Pure, so the
  rules that make the picture and the sound line up are checked without a browser.
*/

export const FRAME_WIDTH = 1280
export const FRAME_HEIGHT = 720
/** The stage's padding around the card, in frame pixels. `VideoSlide` uses the same number. */
export const STAGE_PADDING = 40
/** How long a slide with no narration stays on screen, with no sound. */
export const SILENT_SLIDE_SECONDS = 4
/**
 * A picture is added once per second of hold rather than one long one. The picture is the
 * same each time (cheap: nothing is redrawn), and players seek and scrub much better with
 * regular frames.
 */
export const FRAME_STEP_SECONDS = 1

export interface SlideTiming {
  index: number
  startSeconds: number
  durationSeconds: number
}

export interface Timeline {
  slides: SlideTiming[]
  totalSeconds: number
}

/**
 * Lays the slides end to end. A duration must be positive and finite: a slide with none
 * would have no time on screen and everything after it would drift against the audio,
 * which is built from the same numbers.
 */
export function planTimeline(durations: readonly number[]): Timeline {
  let cursor = 0
  const slides = durations.map((durationSeconds, index) => {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new RangeError(`Slide ${index + 1} has no duration.`)
    }
    const slide: SlideTiming = { index, startSeconds: cursor, durationSeconds }
    cursor += durationSeconds
    return slide
  })
  return { slides, totalSeconds: cursor }
}

export interface FrameSlot {
  timestamp: number
  duration: number
}

/** The pictures to add for one slide: one per second of hold, the last as long as what is left. Never empty. */
export function frameSlots(slide: SlideTiming): FrameSlot[] {
  const slots: FrameSlot[] = []
  let offset = 0
  do {
    slots.push({
      timestamp: slide.startSeconds + offset,
      duration: Math.min(FRAME_STEP_SECONDS, slide.durationSeconds - offset),
    })
    offset += FRAME_STEP_SECONDS
    // The epsilon keeps a whole number of seconds (3 -> frames at 0, 1, 2) from growing a fourth.
  } while (offset < slide.durationSeconds - 1e-9)
  return slots
}

/**
 * The scale that makes a slide of `contentHeight` fit in `availableHeight`, at most 1 (a slide
 * that fits is never enlarged). The video scales rather than crops, because the narrator reads
 * everything on the slide and the viewer has to be able to see it. Degenerate input gives 1
 * so a bad measurement cannot blank the frame.
 */
export function fitScale(contentHeight: number, availableHeight: number): number {
  if (!Number.isFinite(contentHeight) || contentHeight <= 0 || availableHeight <= 0) return 1
  return Math.min(1, availableHeight / contentHeight)
}
```

- [ ] **Step 5: Write the failing format test** (`src/video/format.test.ts`)

```ts
import { describe, expect, it } from 'vitest'
import { AUDIO_SAMPLE_RATE, MP4_FORMAT, WEBM_FORMAT, chooseFormat, hasWebCodecs } from './format'

describe('chooseFormat', () => {
  it('prefers MP4 when it can be encoded', () => {
    expect(chooseFormat({ mp4: true, webm: true })).toBe(MP4_FORMAT)
    expect(chooseFormat({ mp4: true, webm: false })).toBe(MP4_FORMAT)
  })

  it('falls back to WebM', () => {
    expect(chooseFormat({ mp4: false, webm: true })).toBe(WEBM_FORMAT)
  })

  it('is null when neither can be encoded', () => {
    expect(chooseFormat({ mp4: false, webm: false })).toBeNull()
  })

  it('names the file type and codecs for each', () => {
    expect(MP4_FORMAT).toMatchObject({ ext: 'mp4', contentType: 'video/mp4', videoCodec: 'avc', audioCodec: 'aac' })
    expect(WEBM_FORMAT).toMatchObject({ ext: 'webm', contentType: 'video/webm', videoCodec: 'vp9', audioCodec: 'opus' })
  })
})

describe('hasWebCodecs', () => {
  it('needs both encoders', () => {
    expect(hasWebCodecs({ VideoEncoder: class {}, AudioEncoder: class {} })).toBe(true)
    expect(hasWebCodecs({ VideoEncoder: class {} })).toBe(false)
    expect(hasWebCodecs({ AudioEncoder: class {} })).toBe(false)
    expect(hasWebCodecs({})).toBe(false)
  })
})

it('narrates at the sample rate the silent buffers and the encoder are built for', () => {
  expect(AUDIO_SAMPLE_RATE).toBe(44100)
})
```

- [ ] **Step 6: Run to verify it fails, then write `format.ts`**

Run: `npx vitest run src/video/format.test.ts` -> FAIL (cannot resolve `./format`). Then:

```ts
/*
  Which file the browser can be asked to make. The pure half of the encoder set-up: the
  capability probe itself (`detectFormat`, in encode.ts) needs the encoder library, so it
  lives there and reports into `chooseFormat`.
*/

export type VideoContentType = 'video/mp4' | 'video/webm'
export type VideoExt = 'mp4' | 'webm'

export interface VideoFormat {
  container: VideoExt
  videoCodec: 'avc' | 'vp9'
  audioCodec: 'aac' | 'opus'
  ext: VideoExt
  contentType: VideoContentType
}

export const MP4_FORMAT: VideoFormat = {
  container: 'mp4',
  videoCodec: 'avc',
  audioCodec: 'aac',
  ext: 'mp4',
  contentType: 'video/mp4',
}

export const WEBM_FORMAT: VideoFormat = {
  container: 'webm',
  videoCodec: 'vp9',
  audioCodec: 'opus',
  ext: 'webm',
  contentType: 'video/webm',
}

export interface EncodeSupport {
  /** The browser can encode both H.264 and AAC. */
  mp4: boolean
  /** The browser can encode both VP9 and Opus. */
  webm: boolean
}

/** MP4 is what people can open anywhere, so it wins when both work. `null`: neither does. */
export function chooseFormat(support: EncodeSupport): VideoFormat | null {
  if (support.mp4) return MP4_FORMAT
  if (support.webm) return WEBM_FORMAT
  return null
}

/**
 * The cheap, synchronous half of the check: are the WebCodecs encoders there at all? The modal
 * uses this to disable its button without loading the encoder library. Whether a usable codec
 * *pair* exists is decided when a run starts (`detectFormat`).
 */
export function hasWebCodecs(
  scope: { VideoEncoder?: unknown; AudioEncoder?: unknown } = globalThis,
): boolean {
  return typeof scope.VideoEncoder === 'function' && typeof scope.AudioEncoder === 'function'
}

/** Narration is requested at this rate (see `speakBody`), and silent buffers are made at it. */
export const AUDIO_SAMPLE_RATE = 44100
```

- [ ] **Step 7: Run both test files**

Run: `npx vitest run src/video/timeline.test.ts src/video/format.test.ts`
Expected: PASS (all).

- [ ] **Step 8: Commit**

```bash
git add src/video/errors.ts src/video/timeline.ts src/video/timeline.test.ts src/video/format.ts src/video/format.test.ts
git commit -m "$(cat <<'EOF'
feat(video): timeline, frame slots, fit scale and format choice (pure)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Paths, record parsing and storage error text

**Files:**
- Create: `src/video/paths.ts`, `src/video/paths.test.ts`
- Create: `src/video/videoRecord.ts`, `src/video/videoRecord.test.ts`
- Create: `src/video/storageErrors.ts`, `src/video/storageErrors.test.ts`

**Interfaces:**
- Consumes: `VideoExt`, `VideoContentType` from `./format`.
- Produces:
  - `paths.ts`: `VIDEO_BUCKET = 'deck-videos'`; `videoPath(uid: string, presentationId: string, ext: VideoExt): string`.
  - `videoRecord.ts`: `interface VideoRecord { path: string; contentType: VideoContentType; durationSeconds: number; generatedAt: string }`; `parseVideo(raw: unknown): VideoRecord | null`.
  - `storageErrors.ts`: `MIGRATION_MESSAGE = 'Run migration 0015 in Supabase.'`; `interface PortError { message?: string; code?: string; statusCode?: string | number }`; `describeStorageFailure(err: PortError | null | undefined): string`.

- [ ] **Step 1: Write the failing tests**

`src/video/paths.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { VIDEO_BUCKET, videoPath } from './paths'

describe('videoPath', () => {
  // The bucket's policy compares the first folder to the caller's user id.
  it("puts the video in the owner's folder", () => {
    expect(videoPath('u1', 'p1', 'mp4')).toBe('u1/p1.mp4')
    expect(videoPath('u1', 'p1', 'webm')).toBe('u1/p1.webm')
  })

  it('names the private bucket the migration creates', () => {
    expect(VIDEO_BUCKET).toBe('deck-videos')
  })
})
```

`src/video/videoRecord.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseVideo } from './videoRecord'

const good = { path: 'u1/p1.mp4', contentType: 'video/mp4', durationSeconds: 42.5, generatedAt: '2026-09-27T10:00:00.000Z' }

describe('parseVideo', () => {
  it('reads a well-formed record', () => {
    expect(parseVideo(good)).toEqual(good)
  })

  it.each([null, undefined, 'x', 3, [], {}])('reads %j as no video', (raw) => {
    expect(parseVideo(raw)).toBeNull()
  })

  it('reads a record with a bad field as no video, rather than half of one', () => {
    expect(parseVideo({ ...good, path: '' })).toBeNull()
    expect(parseVideo({ ...good, path: 5 })).toBeNull()
    expect(parseVideo({ ...good, contentType: 'video/quicktime' })).toBeNull()
    expect(parseVideo({ ...good, durationSeconds: 0 })).toBeNull()
    expect(parseVideo({ ...good, durationSeconds: NaN })).toBeNull()
    expect(parseVideo({ ...good, generatedAt: 12 })).toBeNull()
  })

  it('drops fields it does not know', () => {
    expect(parseVideo({ ...good, extra: 1 })).toEqual(good)
  })
})
```

`src/video/storageErrors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MIGRATION_MESSAGE, describeStorageFailure } from './storageErrors'

describe('describeStorageFailure', () => {
  it('tells you to run the migration when the bucket is missing', () => {
    expect(describeStorageFailure({ message: 'Bucket not found', statusCode: '404' })).toBe(MIGRATION_MESSAGE)
  })

  it('tells you to run the migration when presentations has no video column', () => {
    expect(describeStorageFailure({ code: 'PGRST204', message: "Could not find the 'video' column of 'presentations'" })).toBe(MIGRATION_MESSAGE)
    expect(describeStorageFailure({ code: '42703', message: 'column "video" of relation "presentations" does not exist' })).toBe(MIGRATION_MESSAGE)
  })

  it('says when the file is too big', () => {
    expect(describeStorageFailure({ message: 'The object exceeded the maximum allowed size', statusCode: '413' })).toMatch(/too large/i)
  })

  it('does not blame the migration for an unrelated error', () => {
    const text = describeStorageFailure({ message: 'JWT expired', statusCode: '401' })
    expect(text).not.toBe(MIGRATION_MESSAGE)
    expect(text).toMatch(/could not be saved/i)
  })

  it('has a message even with nothing to go on', () => {
    expect(describeStorageFailure(null)).toMatch(/could not be saved/i)
    expect(describeStorageFailure(undefined)).toMatch(/could not be saved/i)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/video/paths.test.ts src/video/videoRecord.test.ts src/video/storageErrors.test.ts`
Expected: FAIL (cannot resolve the three modules).

- [ ] **Step 3: Write the three modules**

`src/video/paths.ts`:

```ts
import type { VideoExt } from './format'

/** The private bucket migration 0015 creates. */
export const VIDEO_BUCKET = 'deck-videos'

/**
 * Where a deck's video lives. The first folder is the owner's user id: the bucket's policies
 * compare it to `auth.uid()`, so this is what keeps one account's videos from another's.
 */
export function videoPath(uid: string, presentationId: string, ext: VideoExt): string {
  return `${uid}/${presentationId}.${ext}`
}
```

`src/video/videoRecord.ts`:

```ts
import type { VideoContentType } from './format'

/** What `presentations.video` holds: a pointer to the file plus what the modal shows about it. */
export interface VideoRecord {
  path: string
  contentType: VideoContentType
  durationSeconds: number
  generatedAt: string
}

/**
 * Reads whatever the database returned. All or nothing: a record with one bad field is no
 * video, because half a record would show a player with nothing behind it.
 */
export function parseVideo(raw: unknown): VideoRecord | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (typeof r.path !== 'string' || r.path === '') return null
  if (r.contentType !== 'video/mp4' && r.contentType !== 'video/webm') return null
  if (typeof r.durationSeconds !== 'number' || !Number.isFinite(r.durationSeconds) || r.durationSeconds <= 0) return null
  if (typeof r.generatedAt !== 'string') return null
  return {
    path: r.path,
    contentType: r.contentType,
    durationSeconds: r.durationSeconds,
    generatedAt: r.generatedAt,
  }
}
```

`src/video/storageErrors.ts`:

```ts
export const MIGRATION_MESSAGE = 'Run migration 0015 in Supabase.'

/** The parts of a Storage or PostgREST error this file looks at. Both libraries' errors fit. */
export interface PortError {
  message?: string
  code?: string
  statusCode?: string | number
}

/**
 * The message to show for a failed upload or record write. Only a missing bucket or column
 * says "run the migration": anything else (an expired session, a network drop) must not send
 * the user to their database. The raw error is logged by the caller, not shown.
 */
export function describeStorageFailure(err: PortError | null | undefined): string {
  const message = err?.message ?? ''
  if (/bucket not found/i.test(message)) return MIGRATION_MESSAGE
  // PGRST204: PostgREST "column not found in the schema cache". 42703: Postgres "undefined_column".
  if (err?.code === 'PGRST204' || err?.code === '42703') return MIGRATION_MESSAGE
  if (String(err?.statusCode) === '413' || /exceeded the maximum allowed size|payload too large/i.test(message)) {
    return 'The video is too large to store.'
  }
  return 'The video could not be saved. Try again.'
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/video/paths.test.ts src/video/videoRecord.test.ts src/video/storageErrors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/video/paths.ts src/video/paths.test.ts src/video/videoRecord.ts src/video/videoRecord.test.ts src/video/storageErrors.ts src/video/storageErrors.test.ts
git commit -m "$(cat <<'EOF'
feat(video): storage path, video record parsing and storage error text

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Storage: save, load, remove (against ports)

**Files:**
- Create: `src/video/storage.ts`, `src/video/storage.test.ts`

**Interfaces:**
- Consumes: `VideoError` (`./errors`), `VideoFormat` (`./format`), `videoPath`, `VIDEO_BUCKET` (`./paths`), `VideoRecord`, `parseVideo` (`./videoRecord`), `PortError`, `describeStorageFailure` (`./storageErrors`).
- Produces (used by Tasks 6-8):
  - `interface StoragePorts { upload(path: string, blob: Blob, contentType: string): Promise<{ error: PortError | null }>; remove(paths: string[]): Promise<{ error: PortError | null }>; writeRecord(presentationId: string, record: VideoRecord): Promise<{ error: PortError | null }>; readRecord(presentationId: string): Promise<{ data: unknown; error: PortError | null }>; signedUrl(path: string, downloadName?: string): Promise<{ url: string | null; error: PortError | null }> }`
  - `interface SaveVideoInput { uid: string; presentationId: string; blob: Blob; format: VideoFormat; durationSeconds: number; previous: VideoRecord | null; now?: () => Date }`
  - `saveVideo(ports: StoragePorts, input: SaveVideoInput): Promise<VideoRecord>` (throws `VideoError('uploading', ...)`)
  - `interface VideoView { record: VideoRecord; url: string | null; downloadUrl: string | null }`
  - `loadVideo(ports: StoragePorts, presentationId: string, baseName: string): Promise<VideoView | null>` (never throws; the download file name is `baseName` plus the extension of the stored record's content type)
  - `removeDeckVideo(ports: StoragePorts, presentationId: string): Promise<void>` (never throws)
  - `supabasePorts(client: SupabaseClient): StoragePorts`

- [ ] **Step 1: Write the failing test** (`src/video/storage.test.ts`)

```ts
import { describe, expect, it, vi } from 'vitest'
import { VideoError } from './errors'
import { MP4_FORMAT, WEBM_FORMAT } from './format'
import { MIGRATION_MESSAGE } from './storageErrors'
import { loadVideo, removeDeckVideo, saveVideo, type SaveVideoInput, type StoragePorts } from './storage'
import type { VideoRecord } from './videoRecord'

function fakePorts(overrides: Partial<StoragePorts> = {}) {
  const log: string[] = []
  const ports: StoragePorts = {
    upload: async (path) => {
      log.push(`upload ${path}`)
      return { error: null }
    },
    remove: async (paths) => {
      log.push(`remove ${paths.join(',')}`)
      return { error: null }
    },
    writeRecord: async (id) => {
      log.push(`write ${id}`)
      return { error: null }
    },
    readRecord: async () => ({ data: null, error: null }),
    signedUrl: async (path, downloadName) => ({
      url: `https://signed/${path}${downloadName ? `?download=${downloadName}` : ''}`,
      error: null,
    }),
    ...overrides,
  }
  return { ports, log }
}

const previous: VideoRecord = {
  path: 'u1/p1.mp4',
  contentType: 'video/mp4',
  durationSeconds: 10,
  generatedAt: '2026-09-01T00:00:00.000Z',
}

const input = (over: Partial<SaveVideoInput> = {}): SaveVideoInput => ({
  uid: 'u1',
  presentationId: 'p1',
  blob: new Blob(['video']),
  format: MP4_FORMAT,
  durationSeconds: 42.5,
  previous: null,
  now: () => new Date('2026-09-27T10:00:00.000Z'),
  ...over,
})

describe('saveVideo', () => {
  it('uploads, then writes the record, and returns it', async () => {
    const { ports, log } = fakePorts()
    const record = await saveVideo(ports, input())
    expect(log).toEqual(['upload u1/p1.mp4', 'write p1'])
    expect(record).toEqual({
      path: 'u1/p1.mp4',
      contentType: 'video/mp4',
      durationSeconds: 42.5,
      generatedAt: '2026-09-27T10:00:00.000Z',
    })
  })

  it('replaces at the same path without removing anything', async () => {
    const { ports, log } = fakePorts()
    await saveVideo(ports, input({ previous }))
    expect(log).toEqual(['upload u1/p1.mp4', 'write p1'])
  })

  // Review Focus 4: a different browser can make a different container.
  it('removes the previous object, but only after the new record is written', async () => {
    const { ports, log } = fakePorts()
    await saveVideo(ports, input({ previous, format: WEBM_FORMAT }))
    expect(log).toEqual(['upload u1/p1.webm', 'write p1', 'remove u1/p1.mp4'])
  })

  it('keeps the previous video when the upload fails, and writes nothing', async () => {
    const { ports, log } = fakePorts({
      upload: async () => ({ error: { message: 'Bucket not found', statusCode: '404' } }),
    })
    const err = await saveVideo(ports, input({ previous, format: WEBM_FORMAT })).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(VideoError)
    expect((err as VideoError).message).toBe(MIGRATION_MESSAGE)
    expect((err as VideoError).stage).toBe('uploading')
    expect(log).toEqual([])
  })

  // Review Focus 4, the other half: never remove the old file when the new record was not written.
  it('keeps the previous object and removes the new one when the record write fails', async () => {
    const { ports, log } = fakePorts({
      writeRecord: async () => ({ error: { code: 'PGRST204', message: "no 'video' column" } }),
    })
    const err = await saveVideo(ports, input({ previous, format: WEBM_FORMAT })).catch((e: unknown) => e)
    expect((err as VideoError).message).toBe(MIGRATION_MESSAGE)
    expect(log).toContain('remove u1/p1.webm')
    expect(log).not.toContain('remove u1/p1.mp4')
  })

  it('does not remove a file it just overwrote when the record write fails at the same path', async () => {
    const { ports, log } = fakePorts({ writeRecord: async () => ({ error: { message: 'boom' } }) })
    await expect(saveVideo(ports, input({ previous }))).rejects.toBeInstanceOf(VideoError)
    expect(log.filter((l) => l.startsWith('remove'))).toEqual([])
  })

  it('removes the new object when there was no previous video and the record write fails', async () => {
    const { ports, log } = fakePorts({ writeRecord: async () => ({ error: { message: 'boom' } }) })
    await expect(saveVideo(ports, input())).rejects.toBeInstanceOf(VideoError)
    expect(log).toContain('remove u1/p1.mp4')
  })

  it('still succeeds when removing the previous object fails', async () => {
    const { ports } = fakePorts({ remove: async () => Promise.reject(new Error('offline')) })
    await expect(saveVideo(ports, input({ previous, format: WEBM_FORMAT }))).resolves.toMatchObject({ path: 'u1/p1.webm' })
  })

  it('reports the original error, not a clean-up failure', async () => {
    const { ports } = fakePorts({
      writeRecord: async () => ({ error: { message: 'boom' } }),
      remove: async () => Promise.reject(new Error('offline')),
    })
    const err = await saveVideo(ports, input()).catch((e: unknown) => e)
    expect((err as VideoError).message).toMatch(/could not be saved/i)
  })

  it('logs the raw error rather than showing it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { ports } = fakePorts({ upload: async () => ({ error: { message: 'secret internals' } }) })
    const err = await saveVideo(ports, input()).catch((e: unknown) => e)
    expect((err as VideoError).message).not.toContain('secret internals')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('loadVideo', () => {
  const stored = { ...previous }

  it('returns the record with a playback and a download link', async () => {
    const { ports } = fakePorts({ readRecord: async () => ({ data: stored, error: null }) })
    const view = await loadVideo(ports, 'p1', 'Deck')
    expect(view?.record).toEqual(previous)
    expect(view?.url).toBe('https://signed/u1/p1.mp4')
    expect(view?.downloadUrl).toBe('https://signed/u1/p1.mp4?download=Deck.mp4')
  })

  it('names the download after the stored file type, not the browser', async () => {
    const webm: VideoRecord = { ...previous, path: 'u1/p1.webm', contentType: 'video/webm' }
    const { ports } = fakePorts({ readRecord: async () => ({ data: webm, error: null }) })
    expect((await loadVideo(ports, 'p1', 'Deck'))?.downloadUrl).toBe('https://signed/u1/p1.webm?download=Deck.webm')
  })

  it('is null when there is no video, a malformed one, or the read failed', async () => {
    expect(await loadVideo(fakePorts().ports, 'p1', 'x')).toBeNull()
    expect(await loadVideo(fakePorts({ readRecord: async () => ({ data: { path: 1 }, error: null }) }).ports, 'p1', 'x')).toBeNull()
    expect(await loadVideo(fakePorts({ readRecord: async () => ({ data: stored, error: { message: 'x' } }) }).ports, 'p1', 'x')).toBeNull()
  })

  it('keeps the record but no links when signing fails', async () => {
    const { ports } = fakePorts({
      readRecord: async () => ({ data: stored, error: null }),
      signedUrl: async () => ({ url: null, error: { message: 'x' } }),
    })
    const view = await loadVideo(ports, 'p1', 'x')
    expect(view).toEqual({ record: previous, url: null, downloadUrl: null })
  })

  it('never throws', async () => {
    const { ports } = fakePorts({ readRecord: async () => Promise.reject(new Error('offline')) })
    expect(await loadVideo(ports, 'p1', 'x')).toBeNull()
  })
})

describe('removeDeckVideo', () => {
  it("removes the deck's video object", async () => {
    const { ports, log } = fakePorts({ readRecord: async () => ({ data: previous, error: null }) })
    await removeDeckVideo(ports, 'p1')
    expect(log).toEqual(['remove u1/p1.mp4'])
  })

  it('does nothing when the deck has no video', async () => {
    const { ports, log } = fakePorts()
    await removeDeckVideo(ports, 'p1')
    expect(log).toEqual([])
  })

  // Deleting a deck must never be blocked by its video.
  it('never throws', async () => {
    const { ports } = fakePorts({ readRecord: async () => Promise.reject(new Error('offline')) })
    await expect(removeDeckVideo(ports, 'p1')).resolves.toBeUndefined()
    const removing = fakePorts({
      readRecord: async () => ({ data: previous, error: null }),
      remove: async () => Promise.reject(new Error('offline')),
    })
    await expect(removeDeckVideo(removing.ports, 'p1')).resolves.toBeUndefined()
  })
})
```


- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/video/storage.test.ts`
Expected: FAIL (cannot resolve `./storage`).

- [ ] **Step 3: Write `storage.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { VideoError } from './errors'
import type { VideoFormat } from './format'
import { VIDEO_BUCKET, videoPath } from './paths'
import { describeStorageFailure, type PortError } from './storageErrors'
import { parseVideo, type VideoRecord } from './videoRecord'

/*
  Where a deck's video goes and how it is found again. The rules (what is written first, what is
  removed and when, what a failure leaves behind) live here against a small set of `ports`, so they
  are tested without Supabase; `supabasePorts` is the thin real implementation.

  The order is the point: upload, then write the record, then remove the previous object. A video the
  record does not point at is invisible, and the previous object is only ever removed once the new
  one is both stored and pointed at, so a failure at any step leaves the deck with the video it had.
*/

/** How long a playback or download link works. It is fetched when the modal opens. */
const SIGNED_URL_SECONDS = 3600

export interface StoragePorts {
  upload(path: string, blob: Blob, contentType: string): Promise<{ error: PortError | null }>
  remove(paths: string[]): Promise<{ error: PortError | null }>
  writeRecord(presentationId: string, record: VideoRecord): Promise<{ error: PortError | null }>
  /** `data` is the deck's `video` column as stored (unparsed). */
  readRecord(presentationId: string): Promise<{ data: unknown; error: PortError | null }>
  /** With `downloadName` the link makes the browser save the file rather than play it. */
  signedUrl(path: string, downloadName?: string): Promise<{ url: string | null; error: PortError | null }>
}

export interface SaveVideoInput {
  uid: string
  presentationId: string
  blob: Blob
  format: VideoFormat
  durationSeconds: number
  /** The deck's video before this run, if it has one. */
  previous: VideoRecord | null
  now?: () => Date
}

/** Clean-up must never turn a result into a failure, or hide the failure that caused it. */
async function bestEffortRemove(ports: StoragePorts, paths: string[]): Promise<void> {
  try {
    await ports.remove(paths)
  } catch {
    // Nothing to do: an orphaned file costs space, not correctness.
  }
}

export async function saveVideo(ports: StoragePorts, input: SaveVideoInput): Promise<VideoRecord> {
  const path = videoPath(input.uid, input.presentationId, input.format.ext)

  const uploaded = await ports.upload(path, input.blob, input.format.contentType)
  if (uploaded.error) {
    console.warn('[video] upload failed:', uploaded.error)
    throw new VideoError('uploading', describeStorageFailure(uploaded.error))
  }

  const record: VideoRecord = {
    path,
    contentType: input.format.contentType,
    durationSeconds: input.durationSeconds,
    generatedAt: (input.now?.() ?? new Date()).toISOString(),
  }
  const wrote = await ports.writeRecord(input.presentationId, record)
  if (wrote.error) {
    console.warn('[video] could not record the video:', wrote.error)
    // A new object nothing points at is removed again. At the same path the file was already
    // overwritten in place: it cannot be restored, and removing it would lose the deck's video.
    if (input.previous?.path !== path) await bestEffortRemove(ports, [path])
    throw new VideoError('uploading', describeStorageFailure(wrote.error))
  }

  if (input.previous && input.previous.path !== path) await bestEffortRemove(ports, [input.previous.path])
  return record
}

export interface VideoView {
  record: VideoRecord
  /** For the player. `null` when signing failed: the record is still shown. */
  url: string | null
  /** For the Download link. */
  downloadUrl: string | null
}

/**
 * The deck's existing video, ready to show. Never throws: no video (or a read that failed, a project
 * without migration 0015) is simply nothing to show; the migration message appears when generating.
 */
export async function loadVideo(
  ports: StoragePorts,
  presentationId: string,
  baseName: string,
): Promise<VideoView | null> {
  try {
    const { data, error } = await ports.readRecord(presentationId)
    if (error) return null
    const record = parseVideo(data)
    if (!record) return null
    // The extension comes from the stored file, not from what this browser would make today.
    const downloadName = `${baseName}.${record.contentType === 'video/webm' ? 'webm' : 'mp4'}`
    const [play, download] = await Promise.all([
      ports.signedUrl(record.path),
      ports.signedUrl(record.path, downloadName),
    ])
    return {
      record,
      url: play.error ? null : play.url,
      downloadUrl: download.error ? null : download.url,
    }
  } catch {
    return null
  }
}

/**
 * Removes a deck's video file before the deck row goes (SQL cannot safely delete Storage objects).
 * Best effort and never throws: deleting a deck must not be blocked by its video.
 */
export async function removeDeckVideo(ports: StoragePorts, presentationId: string): Promise<void> {
  try {
    const { data, error } = await ports.readRecord(presentationId)
    if (error) return
    const record = parseVideo(data)
    if (record) await bestEffortRemove(ports, [record.path])
  } catch {
    // Same reason as above.
  }
}

/** The real ports, over the app's Supabase client. */
export function supabasePorts(client: SupabaseClient): StoragePorts {
  const bucket = () => client.storage.from(VIDEO_BUCKET)
  return {
    async upload(path, blob, contentType) {
      // `cacheControl: '0'`: the same path is overwritten on every regeneration, and a cached copy
      // would keep playing the old video. (The storage client's `upload` takes no AbortSignal, which
      // is why the upload is the pipeline's point of no return.)
      const { error } = await bucket().upload(path, blob, { contentType, upsert: true, cacheControl: '0' })
      return { error }
    },
    async remove(paths) {
      const { error } = await bucket().remove(paths)
      return { error }
    },
    async writeRecord(presentationId, record) {
      // Its own update, never the card upsert: a project without migration 0015 must still save decks.
      const { error } = await client.from('presentations').update({ video: record }).eq('id', presentationId)
      return { error }
    },
    async readRecord(presentationId) {
      const { data, error } = await client.from('presentations').select('video').eq('id', presentationId).maybeSingle()
      return { data: data?.video ?? null, error }
    },
    async signedUrl(path, downloadName) {
      const { data, error } = await bucket().createSignedUrl(
        path,
        SIGNED_URL_SECONDS,
        downloadName ? { download: downloadName } : undefined,
      )
      return { url: data?.signedUrl ?? null, error }
    },
  }
}
```

- [ ] **Step 4: Run to verify it passes, then typecheck**

Run: `npx vitest run src/video/storage.test.ts` -> PASS. Then `npx tsc -b` -> no errors (if `error` from Supabase is not assignable to `PortError`, widen `PortError` in `storageErrors.ts` with the missing optional field; do not cast).

- [ ] **Step 5: Mutation-check the two safety rules**

Temporarily edit `saveVideo` and run `npx vitest run src/video/storage.test.ts` for each; each must FAIL, then revert:
1. Move the `if (input.previous && ...) await bestEffortRemove(...)` line to before `ports.writeRecord(...)` -> the "only after the new record is written" and "keeps the previous object" tests fail.
2. Delete the `if (input.previous?.path !== path)` guard (always remove `[path]`) -> "does not remove a file it just overwrote" fails.

Confirm the file is back to the code above (`git diff src/video/storage.ts` shows nothing).

- [ ] **Step 6: Commit**

```bash
git add src/video/storage.ts src/video/storage.test.ts
git commit -m "$(cat <<'EOF'
feat(video): save, load and remove a deck's video against storage ports

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The pipeline orchestrator

**Files:**
- Create: `src/video/pipeline.ts`, `src/video/pipeline.test.ts`

**Interfaces:**
- Consumes: `VideoError`, `VideoStage` (`./errors`); `SILENT_SLIDE_SECONDS`, `frameSlots`, `planTimeline` (`./timeline`); `VideoRecord` (`./videoRecord`).
- Produces (used by Task 6's `generate.ts` and Task 7's UI):
  - `interface Clip { readonly duration: number; readonly numberOfChannels: number }` (a Web Audio `AudioBuffer` satisfies it)
  - `interface Progress { stage: VideoStage; done: number; total: number }`
  - `interface VideoEncoderPort<A extends Clip> { start(): Promise<void>; addAudio(clip: A): Promise<void>; addFrame(timestamp: number, duration: number): Promise<void>; finish(): Promise<Blob>; cancel(): Promise<void> }`
  - `interface PipelineDeps<A extends Clip> { narrate(text: string, signal: AbortSignal): Promise<A>; silence(seconds: number, channels: number): A; drawSlide(index: number, signal: AbortSignal): Promise<void>; encoder: VideoEncoderPort<A>; save(blob: Blob, durationSeconds: number): Promise<VideoRecord> }`
  - `interface PipelineInput { texts: readonly string[]; signal: AbortSignal; onProgress?: (p: Progress) => void }`
  - `type PipelineResult = { status: 'done'; record: VideoRecord } | { status: 'cancelled' }`
  - `MIN_NARRATION_SECONDS = 0.1`
  - `generateVideo<A extends Clip>(input: PipelineInput, deps: PipelineDeps<A>): Promise<PipelineResult>` (throws `VideoError`)

- [ ] **Step 1: Write the failing test** (`src/video/pipeline.test.ts`)

```ts
import { describe, expect, it } from 'vitest'
import { VideoError } from './errors'
import { generateVideo, type Clip, type PipelineDeps, type Progress } from './pipeline'
import type { VideoRecord } from './videoRecord'

const clip = (duration: number, numberOfChannels = 1): Clip => ({ duration, numberOfChannels })

const RECORD: VideoRecord = {
  path: 'u1/p1.mp4',
  contentType: 'video/mp4',
  durationSeconds: 0,
  generatedAt: '2026-09-27T00:00:00.000Z',
}

/** Every dependency logs what it is asked to do, so a test can assert the order. */
function setup() {
  const log: string[] = []
  const controller = new AbortController()
  const deps: PipelineDeps<Clip> = {
    narrate: async (text) => {
      log.push(`narrate ${text}`)
      return clip(2)
    },
    silence: (seconds, channels) => {
      log.push(`silence ${seconds} ${channels}`)
      return clip(seconds, channels)
    },
    drawSlide: async (i) => {
      log.push(`draw ${i}`)
    },
    encoder: {
      start: async () => {
        log.push('start')
      },
      addAudio: async (c) => {
        log.push(`audio ${c.duration}`)
      },
      addFrame: async (t) => {
        log.push(`frame ${t}`)
      },
      finish: async () => {
        log.push('finish')
        return new Blob(['video'])
      },
      cancel: async () => {
        log.push('cancel')
      },
    },
    save: async (_blob, seconds) => {
      log.push(`save ${seconds}`)
      return { ...RECORD, durationSeconds: seconds }
    },
  }
  const run = (texts: string[], onProgress?: (p: Progress) => void) =>
    generateVideo({ texts, signal: controller.signal, onProgress }, deps)
  return { deps, log, controller, run }
}

describe('generateVideo: the happy path', () => {
  it('narrates, then draws and encodes each slide in order, then finishes and saves', async () => {
    const { log, run } = setup()
    const result = await run(['A', '   '])
    expect(result).toEqual({ status: 'done', record: { ...RECORD, durationSeconds: 6 } })
    expect(log).toEqual([
      'narrate A',
      'silence 4 1',
      'start',
      'draw 0',
      'audio 2',
      'frame 0',
      'frame 1',
      'draw 1',
      'audio 4',
      'frame 2',
      'frame 3',
      'frame 4',
      'frame 5',
      'finish',
      'save 6',
    ])
  })

  it('reports the stages in order, ending with the save', async () => {
    const { run } = setup()
    const seen: Progress[] = []
    await run(['A', 'B'], (p) => seen.push(p))
    const stages = seen.map((p) => p.stage).filter((s, i, all) => i === 0 || s !== all[i - 1])
    expect(stages).toEqual(['narrating', 'rendering', 'encoding', 'uploading'])
    expect(seen[0]).toEqual({ stage: 'narrating', done: 0, total: 2 })
    expect(seen.at(-1)).toEqual({ stage: 'uploading', done: 1, total: 1 })
  })

  it('makes silent slides as wide as the narrated ones', async () => {
    const { deps, log, run } = setup()
    deps.narrate = async () => clip(2, 2)
    await run(['A', ''])
    expect(log).toContain('silence 4 2')
  })
})

describe('generateVideo: blank scripts', () => {
  // Review Focus 1.
  it('makes a silent slideshow with no narration request when every slide is blank', async () => {
    const { log, run } = setup()
    const result = await run(['', '  ', '\n'])
    expect(result.status).toBe('done')
    expect(log.filter((l) => l.startsWith('narrate'))).toEqual([])
    expect(log.filter((l) => l.startsWith('silence'))).toEqual(['silence 4 1', 'silence 4 1', 'silence 4 1'])
    expect(log).toContain('save 12')
  })

  it('refuses a deck with no slides', async () => {
    const { run } = setup()
    const err = await run([]).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(VideoError)
    expect((err as VideoError).message).toBe('This deck has no slides.')
  })
})

describe('generateVideo: failures', () => {
  it('names the slide whose narration failed, and starts no encoder', async () => {
    const { deps, log, run } = setup()
    deps.narrate = async (text) => {
      if (text === 'B') throw new Error('boom')
      return clip(2)
    }
    const err = await run(['A', 'B']).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(VideoError)
    expect((err as VideoError).stage).toBe('narrating')
    expect((err as VideoError).message).toBe('Narrating slide 2 failed: boom')
    expect(log).not.toContain('start')
    expect(log.some((l) => l.startsWith('save'))).toBe(false)
  })

  // Review Focus 2: a silent or empty clip would leave picture and sound out of step.
  it('refuses a clip with no audio in it', async () => {
    const { deps, run } = setup()
    deps.narrate = async () => clip(0.05)
    const err = await run(['A']).catch((e: unknown) => e)
    expect((err as VideoError).message).toBe('Narrating slide 1 failed: no audio came back.')
  })

  it('stops the encoder and saves nothing when a slide cannot be drawn', async () => {
    const { deps, log, run } = setup()
    deps.drawSlide = async () => {
      throw new Error('boom')
    }
    const err = await run(['A']).catch((e: unknown) => e)
    expect((err as VideoError).stage).toBe('rendering')
    expect((err as VideoError).message).toBe('Could not draw slide 1: boom')
    expect(log).toContain('cancel')
    expect(log).not.toContain('finish')
    expect(log.some((l) => l.startsWith('save'))).toBe(false)
  })

  it('stops the encoder and saves nothing when encoding fails', async () => {
    const { deps, log, run } = setup()
    deps.encoder.addFrame = async () => {
      throw new Error('boom')
    }
    const err = await run(['A']).catch((e: unknown) => e)
    expect((err as VideoError).stage).toBe('encoding')
    expect(log).toContain('cancel')
    expect(log.some((l) => l.startsWith('save'))).toBe(false)
  })

  it('passes a save failure through unchanged, and does not cancel a finished encode', async () => {
    const { deps, log, run } = setup()
    deps.save = async () => {
      throw new VideoError('uploading', 'Run migration 0015 in Supabase.')
    }
    const err = await run(['A']).catch((e: unknown) => e)
    expect((err as VideoError).message).toBe('Run migration 0015 in Supabase.')
    expect(log).not.toContain('cancel')
  })

  it('turns an unexpected save failure into an upload error', async () => {
    const { deps, run } = setup()
    deps.save = async () => {
      throw new Error('kaboom')
    }
    const err = await run(['A']).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(VideoError)
    expect((err as VideoError).stage).toBe('uploading')
    expect((err as VideoError).message).not.toContain('kaboom')
  })
})

describe('generateVideo: cancelling', () => {
  it('returns quietly, starting nothing, when cancelled while narrating', async () => {
    const { deps, log, controller, run } = setup()
    deps.narrate = async () => {
      controller.abort()
      return clip(2)
    }
    expect(await run(['A', 'B'])).toEqual({ status: 'cancelled' })
    expect(log).not.toContain('start')
    expect(log.some((l) => l.startsWith('save'))).toBe(false)
  })

  it('treats the abort error a cancelled request throws as a cancel, not a failure', async () => {
    const { deps, controller, run } = setup()
    deps.narrate = async () => {
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    }
    expect(await run(['A'])).toEqual({ status: 'cancelled' })
  })

  it('stops the encoder and saves nothing when cancelled while drawing', async () => {
    const { deps, log, controller, run } = setup()
    deps.drawSlide = async (i) => {
      if (i === 1) controller.abort()
    }
    expect(await run(['A', 'B', 'C'])).toEqual({ status: 'cancelled' })
    expect(log).toContain('cancel')
    expect(log).not.toContain('finish')
    expect(log.some((l) => l.startsWith('save'))).toBe(false)
  })

  // Review Focus 3: the last moment before the upload. Nothing may be written.
  it('saves nothing when cancelled while the file is being finished', async () => {
    const { deps, log, controller, run } = setup()
    deps.encoder.finish = async () => {
      log.push('finish')
      controller.abort()
      return new Blob(['video'])
    }
    expect(await run(['A'])).toEqual({ status: 'cancelled' })
    expect(log.some((l) => l.startsWith('save'))).toBe(false)
    // The file was already complete: there is no encoder left to cancel.
    expect(log).not.toContain('cancel')
  })

  it('is already cancelled when the signal was aborted before the run', async () => {
    const { controller, log, run } = setup()
    controller.abort()
    expect(await run(['A'])).toEqual({ status: 'cancelled' })
    expect(log).toEqual([])
  })

  // The upload cannot be aborted, so it is the point of no return: the record is written.
  it('finishes the save once it has started, even if cancelled during it', async () => {
    const { deps, controller, run } = setup()
    deps.save = async (_blob, seconds) => {
      controller.abort()
      return { ...RECORD, durationSeconds: seconds }
    }
    expect((await run(['A'])).status).toBe('done')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/video/pipeline.test.ts`
Expected: FAIL (cannot resolve `./pipeline`).

- [ ] **Step 3: Write `pipeline.ts`**

```ts
import { VideoError, type VideoStage } from './errors'
import { SILENT_SLIDE_SECONDS, frameSlots, planTimeline } from './timeline'
import type { VideoRecord } from './videoRecord'

/*
  The whole run, in order: narrate every slide, then draw and encode each one, then finish the
  file and save it. It knows nothing about the browser: narration, drawing, encoding and saving are
  handed in, so the rules that matter here (what a cancel leaves behind, which failure says what,
  that blank slides cost nothing) are tested against fakes.

  Cancelling before the upload writes nothing and leaves the deck's previous video alone. The upload
  cannot be aborted (the storage client takes no signal), so the start of `save` is the point of no
  return: once it has begun the run finishes it.
*/

/** What the pipeline needs to know about a piece of audio. A Web Audio `AudioBuffer` fits. */
export interface Clip {
  readonly duration: number
  readonly numberOfChannels: number
}

export interface Progress {
  stage: VideoStage
  done: number
  total: number
}

export interface VideoEncoderPort<A extends Clip> {
  start(): Promise<void>
  addAudio(clip: A): Promise<void>
  addFrame(timestamp: number, duration: number): Promise<void>
  /** Completes the file. After it resolves there is nothing left to cancel. */
  finish(): Promise<Blob>
  cancel(): Promise<void>
}

export interface PipelineDeps<A extends Clip> {
  narrate(text: string, signal: AbortSignal): Promise<A>
  silence(seconds: number, channels: number): A
  /** Draws slide `index` into the encoder's canvas. */
  drawSlide(index: number, signal: AbortSignal): Promise<void>
  encoder: VideoEncoderPort<A>
  /** Stores the file and points the deck at it. Throws `VideoError('uploading', ...)`. */
  save(blob: Blob, durationSeconds: number): Promise<VideoRecord>
}

export interface PipelineInput {
  /** Each slide's script, in deck order. Blank means a silent slide. */
  texts: readonly string[]
  signal: AbortSignal
  onProgress?: (p: Progress) => void
}

export type PipelineResult = { status: 'done'; record: VideoRecord } | { status: 'cancelled' }

/**
 * A narration shorter than this is not narration: the service returned nothing, or silence. It is
 * refused rather than trusted, because a slide's hold time comes from its audio and a zero-length
 * clip would leave the picture and the sound out of step for the rest of the video.
 */
export const MIN_NARRATION_SECONDS = 0.1

/** Thrown internally to unwind to the top on a cancel; never escapes `generateVideo`. */
class Cancelled extends Error {}

function messageOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'unknown error'
}

export async function generateVideo<A extends Clip>(
  input: PipelineInput,
  deps: PipelineDeps<A>,
): Promise<PipelineResult> {
  const { texts, signal } = input
  const total = texts.length
  const report = (stage: VideoStage, done: number, of: number) => input.onProgress?.({ stage, done, total: of })
  const check = () => {
    if (signal.aborted) throw new Cancelled()
  }
  /** Runs one step, turning its failure into a `VideoError` for `stage` (or a cancel, if cancelled). */
  async function step<T>(stage: VideoStage, what: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      if (signal.aborted) throw new Cancelled()
      if (err instanceof VideoError) throw err
      throw new VideoError(stage, `${what}: ${messageOf(err)}`)
    }
  }

  if (total === 0) throw new VideoError('narrating', 'This deck has no slides.')

  let encoderRunning = false
  try {
    /* ---- narrate ---- */
    const narrated: (A | null)[] = []
    for (let i = 0; i < total; i++) {
      check()
      report('narrating', i, total)
      const text = texts[i].trim()
      if (text === '') {
        narrated.push(null)
        continue
      }
      const clip = await step('narrating', `Narrating slide ${i + 1} failed`, () => deps.narrate(text, signal))
      check()
      if (!(clip.duration >= MIN_NARRATION_SECONDS)) {
        throw new VideoError('narrating', `Narrating slide ${i + 1} failed: no audio came back.`)
      }
      narrated.push(clip)
    }
    report('narrating', total, total)

    // Silence takes the channel count of the real narration so every buffer in the track matches.
    const channels = narrated.find((c) => c !== null)?.numberOfChannels ?? 1
    const audio = narrated.map((c) => c ?? deps.silence(SILENT_SLIDE_SECONDS, channels))
    const timeline = planTimeline(audio.map((c) => c.duration))

    /* ---- draw and encode ---- */
    await step('encoding', 'Could not start the video', () => deps.encoder.start())
    encoderRunning = true
    for (const slide of timeline.slides) {
      check()
      report('rendering', slide.index, total)
      await step('rendering', `Could not draw slide ${slide.index + 1}`, () => deps.drawSlide(slide.index, signal))
      check()
      await step('encoding', `Could not encode slide ${slide.index + 1}`, async () => {
        await deps.encoder.addAudio(audio[slide.index])
        for (const slot of frameSlots(slide)) await deps.encoder.addFrame(slot.timestamp, slot.duration)
      })
    }
    report('rendering', total, total)

    /* ---- finish ---- */
    check()
    report('encoding', 0, 1)
    const blob = await step('encoding', 'Could not finish the video', () => deps.encoder.finish())
    // The file is complete: nothing is left to cancel, whatever happens next.
    encoderRunning = false
    report('encoding', 1, 1)

    // The last chance to cancel. Past here the upload runs to the end.
    check()

    /* ---- save ---- */
    report('uploading', 0, 1)
    let record: VideoRecord
    try {
      record = await deps.save(blob, timeline.totalSeconds)
    } catch (err) {
      throw err instanceof VideoError ? err : new VideoError('uploading', 'The video could not be saved. Try again.')
    }
    report('uploading', 1, 1)
    return { status: 'done', record }
  } catch (err) {
    if (err instanceof Cancelled) return { status: 'cancelled' }
    throw err
  } finally {
    if (encoderRunning) {
      try {
        await deps.encoder.cancel()
      } catch {
        // Already stopped, or never fully started; nothing more to release.
      }
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/video/pipeline.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Mutation-check the safety rules**

For each edit, run `npx vitest run src/video/pipeline.test.ts`, confirm the named test FAILS, then revert (`git diff src/video/pipeline.ts` must be empty afterwards):
1. Delete the `check()` under the comment "The last chance to cancel" -> "saves nothing when cancelled while the file is being finished" fails.
2. Move `encoderRunning = false` to after the `check()` that follows it -> "saves nothing when cancelled while the file is being finished" fails on its `not.toContain('cancel')` assertion (a finished file must not be cancelled).
3. Remove the `if (signal.aborted) throw new Cancelled()` line in `step` -> "treats the abort error ... as a cancel" fails.
4. Change `texts[i].trim()` to `texts[i]` -> "makes a silent slideshow ... every slide is blank" fails.

- [ ] **Step 6: Commit**

```bash
git add src/video/pipeline.ts src/video/pipeline.test.ts
git commit -m "$(cat <<'EOF'
feat(video): pipeline orchestrator with cancel, failure and blank-slide rules

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Browser adapters and the lazy `generate` entry point

These files use `AudioContext`, WebCodecs, the DOM and `html-to-image`; there is no jsdom, so they are **not unit-tested**. They are kept thin (every rule is already in Tasks 2-5), type-checked, and verified by hand in Task 9. Do not add mocks of the browser to test them.

**Files:**
- Modify: `package.json`, `package-lock.json` (dependencies)
- Create: `src/video/narrate.ts`, `src/video/encode.ts`, `src/video/renderFrame.tsx`, `src/video/generate.ts`

**Interfaces:**
- Consumes: everything from Tasks 2-5; `speak` (`@/voice/cartesia`); `VoiceSettings` (`@/voice/settingsRow`); `useAuthStore` (`@/store/authStore`); `supabase` (`@/lib/supabaseClient`); `SlideStage`, `SlideSurface`, `ThemeProvider`, `TextStyleScope` (`@/components/theme/*`); `SlideBody`, `LayoutRenderer` (`@/components/layouts/*`); `mergeTextStyle`, `TextStyle` (`@/engine/textStyle`); `ThemeTokens` (`@/lib/theme-tokens`); `Card` (`@/engine/contentBlocks`).
- Produces (used by Task 7):
  - `generate.ts`: `interface VideoDeck { presentationId: string | null; title: string; cards: readonly Card[]; theme: ThemeTokens; textStyle: TextStyle }`; `type GenerateResult = { status: 'done'; view: VideoView } | { status: 'cancelled' }`; `generateVideoForDeck(o: { deck: VideoDeck; voice: VoiceSettings; previous: VideoRecord | null; signal: AbortSignal; onProgress?: (p: Progress) => void }): Promise<GenerateResult>`.

- [ ] **Step 1: Record the entry-bundle baseline, then install the dependencies**

Run: `npm run build 2>&1 | tail -15` and note the size of the `index-*.js` chunk.
Run: `npm install mediabunny html-to-image`
Expected: both added to `dependencies` in `package.json`.

- [ ] **Step 2: Write `narrate.ts`**

```ts
import { speak } from '@/voice/cartesia'
import type { VoiceSettings } from '@/voice/settingsRow'
import { AUDIO_SAMPLE_RATE } from './format'

/*
  Speech for a slide, as a Web Audio buffer, and silence for a slide with none. Thin on purpose:
  the rules about blank scripts and empty clips are in pipeline.ts.

  One OfflineAudioContext does both jobs: it decodes without the autoplay rules a live
  AudioContext has, and buffers made from it and buffers it decoded share one sample rate, which
  is what the encoder's audio track needs.
*/

export type NarratorVoice = VoiceSettings & { voiceId: string }

export interface Narrator {
  narrate(text: string, signal: AbortSignal): Promise<AudioBuffer>
  silence(seconds: number, channels: number): AudioBuffer
}

export function createNarrator(voice: NarratorVoice): Narrator {
  const context = new OfflineAudioContext(1, 1, AUDIO_SAMPLE_RATE)
  return {
    async narrate(text, signal) {
      const wav = await speak({
        voiceId: voice.voiceId,
        transcript: text,
        language: voice.language,
        speed: voice.speed,
        volume: voice.volume,
        emotion: voice.emotion,
        signal,
      })
      return context.decodeAudioData(await wav.arrayBuffer())
    },
    silence(seconds, channels) {
      return context.createBuffer(channels, Math.round(seconds * AUDIO_SAMPLE_RATE), AUDIO_SAMPLE_RATE)
    },
  }
}
```

- [ ] **Step 3: Write `encode.ts`**

```ts
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny'
import { AUDIO_SAMPLE_RATE, chooseFormat, type VideoFormat } from './format'
import type { VideoEncoderPort } from './pipeline'
import { FRAME_HEIGHT, FRAME_WIDTH } from './timeline'

/*
  The encoder: pictures from a canvas and narration from AudioBuffers, muxed into one file in
  memory. This is the only file that imports the encoder library, and it is only ever reached
  through `import('./encode')` in generate.ts, so none of it is in the entry bundle.
*/

const VIDEO_QUALITY = new Quality('medium')
const AUDIO_QUALITY = new Quality('medium')

/** Which format this browser can actually encode. `null`: none, and the run must not start. */
export async function detectFormat(): Promise<VideoFormat | null> {
  const video = { width: FRAME_WIDTH, height: FRAME_HEIGHT, quality: VIDEO_QUALITY }
  const audio = { numberOfChannels: 1, sampleRate: AUDIO_SAMPLE_RATE, quality: AUDIO_QUALITY }
  const [avc, aac, vp9, opus] = await Promise.all([
    canEncodeVideo('avc', video),
    canEncodeAudio('aac', audio),
    canEncodeVideo('vp9', video),
    canEncodeAudio('opus', audio),
  ])
  return chooseFormat({ mp4: avc && aac, webm: vp9 && opus })
}

/** The encoder plus the canvas the slides are drawn into (each `addFrame` captures its current pixels). */
export interface CanvasEncoder extends VideoEncoderPort<AudioBuffer> {
  readonly canvas: HTMLCanvasElement
}

export function createEncoder(format: VideoFormat): CanvasEncoder {
  const canvas = document.createElement('canvas')
  canvas.width = FRAME_WIDTH
  canvas.height = FRAME_HEIGHT

  const output = new Output({
    format: format.container === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target: new BufferTarget(),
  })
  const video = new CanvasSource(canvas, { codec: format.videoCodec, quality: VIDEO_QUALITY })
  const audio = new AudioBufferSource({ codec: format.audioCodec, quality: AUDIO_QUALITY })
  output.addVideoTrack(video)
  output.addAudioTrack(audio)

  return {
    canvas,
    start: () => output.start(),
    addAudio: (clip) => audio.add(clip),
    addFrame: (timestamp, duration) => video.add(timestamp, duration),
    async finish() {
      await output.finalize()
      const buffer = output.target.buffer
      if (!buffer) throw new Error('the encoder produced no file')
      return new Blob([buffer], { type: format.contentType })
    },
    cancel: () => output.cancel(),
  }
}
```

If `npx tsc -b` reports a mismatch with the installed `mediabunny` typings (option names, generic parameters), adjust the call shapes to the declarations in `node_modules/mediabunny/dist/mediabunny.d.ts` without changing behaviour: MP4 = `avc` + `aac`, WebM = `vp9` + `opus`, in-memory `BufferTarget`, `quality` (not the deprecated `bitrate`).

- [ ] **Step 4: Write `renderFrame.tsx`**

```tsx
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { Card } from '@/engine/contentBlocks'
import { mergeTextStyle, type TextStyle } from '@/engine/textStyle'
import type { ThemeTokens } from '@/lib/theme-tokens'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { SlideStage } from '@/components/theme/SlideStage'
import { SlideSurface } from '@/components/theme/SlideSurface'
import { TextStyleScope } from '@/components/theme/TextStyleScope'
import { SlideBody } from '@/components/layouts/SlideBody'
import { LayoutRenderer } from '@/components/layouts/LayoutRenderer'
import { FRAME_HEIGHT, FRAME_WIDTH, STAGE_PADDING, fitScale } from './timeline'

/*
  Draws one slide, exactly as the presenter and the thumbnails do, into the encoder's canvas.

  The composition is `SlidePreview`'s (stage, text style, surface, `SlideBody`, `LayoutRenderer`),
  deliberately repeated here rather than shared: `SlidePreview` fits a *container's width* and crops
  the bottom, while a video frame is a fixed 1280x720 and a slide taller than that is scaled down to
  fit, never cropped (the narrator reads all of it).

  It is mounted off-screen (left: -100000px) and the *stage* element, not the host, is what gets
  rasterised: the library copies the captured node's own styles, so capturing the host would carry
  its off-screen position into the picture.

  Two things about the browser matter here:
  - A slide's element nudges and ink depend on `SlideBody` measuring its width with a
    ResizeObserver, which is part of the browser's rendering steps and does not run in a background
    tab. So drawing waits until the tab is visible (`whenVisible`).
  - The app loads no web fonts, so `skipFonts` is on: nothing needs embedding, and it saves scanning
    every stylesheet for every slide. If a web font is ever added, the video will silently use a
    fallback until this is revisited (spec: "Pipeline").
*/

/** Long enough for `SlideBody`'s ResizeObserver to run and React to redraw with the measured width. */
const SETTLE_MS = 100

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Resolves when the tab is visible; rejects with an AbortError if cancelled first. */
function whenVisible(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
  if (document.visibilityState === 'visible') return Promise.resolve()
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      document.removeEventListener('visibilitychange', onChange)
      signal.removeEventListener('abort', onAbort)
    }
    const onChange = () => {
      if (document.visibilityState !== 'visible') return
      cleanup()
      resolve()
    }
    const onAbort = () => {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    document.addEventListener('visibilitychange', onChange)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

interface Refs {
  stage: HTMLDivElement | null
  fit: HTMLDivElement | null
}

function VideoSlide({
  card,
  theme,
  textStyle,
  isFirstCard,
  refs,
}: {
  card: Card
  theme: ThemeTokens
  textStyle: TextStyle
  isFirstCard: boolean
  refs: Refs
}) {
  return (
    <ThemeProvider theme={theme}>
      <SlideStage
        ref={(node) => {
          refs.stage = node
        }}
        className="flex items-center justify-center p-10"
        style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT }}
      >
        {/* Scaled about its centre when the slide is taller than the frame; transforms do not affect
            layout, so `SlideBody`'s measured width (what nudges are fractions of) is unchanged. */}
        <div
          ref={(node) => {
            refs.fit = node
          }}
          className="w-full"
          style={{ transformOrigin: 'center center' }}
        >
          <TextStyleScope style={mergeTextStyle(textStyle, card.textStyle)}>
            <SlideSurface className="w-full rounded-slide p-10 shadow-slide-card">
              <SlideBody card={card}>
                <LayoutRenderer card={card} context={{ isFirstCard }} />
              </SlideBody>
            </SlideSurface>
          </TextStyleScope>
        </div>
      </SlideStage>
    </ThemeProvider>
  )
}

export interface SlideRenderer {
  /** Draws slide `index` into the target canvas. Rejects with an AbortError if cancelled while waiting. */
  draw(index: number, signal: AbortSignal): Promise<void>
  /** Unmounts and removes the off-screen slide. Always call it, including after a failure. */
  dispose(): void
}

export async function createSlideRenderer(o: {
  /** Sorted by `orderIndex`. */
  cards: readonly Card[]
  theme: ThemeTokens
  textStyle: TextStyle
  /** The encoder's canvas. */
  target: HTMLCanvasElement
}): Promise<SlideRenderer> {
  // Lazy: the library is only fetched when a video is actually made.
  const { toCanvas } = await import('html-to-image')

  const context = o.target.getContext('2d')
  if (!context) throw new Error('the canvas has no 2d context')

  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  Object.assign(host.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    width: `${FRAME_WIDTH}px`,
    height: `${FRAME_HEIGHT}px`,
    overflow: 'hidden',
    pointerEvents: 'none',
  })
  document.body.appendChild(host)
  const root = createRoot(host)

  return {
    async draw(index, signal) {
      await whenVisible(signal)
      const card = o.cards[index]
      const refs: Refs = { stage: null, fit: null }

      // A new key each slide remounts it, so nothing measured for the last card leaks into this one.
      flushSync(() =>
        root.render(
          <VideoSlide key={card.id} card={card} theme={o.theme} textStyle={o.textStyle} isFirstCard={index === 0} refs={refs} />,
        ),
      )
      await document.fonts.ready
      await delay(SETTLE_MS)
      await whenVisible(signal)

      const { stage, fit } = refs
      if (!stage || !fit) throw new Error('the slide did not mount')
      const scale = fitScale(fit.offsetHeight, FRAME_HEIGHT - 2 * STAGE_PADDING)
      fit.style.transform = scale < 1 ? `scale(${scale})` : ''

      const picture = await toCanvas(stage, { width: FRAME_WIDTH, height: FRAME_HEIGHT, pixelRatio: 1, skipFonts: true })
      context.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT)
      context.drawImage(picture, 0, 0, FRAME_WIDTH, FRAME_HEIGHT)
    },
    dispose() {
      root.unmount()
      host.remove()
    },
  }
}
```

- [ ] **Step 5: Write `generate.ts`**

```ts
import type { Card } from '@/engine/contentBlocks'
import type { TextStyle } from '@/engine/textStyle'
import type { ThemeTokens } from '@/lib/theme-tokens'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/store/authStore'
import type { VoiceSettings } from '@/voice/settingsRow'
import { VideoError } from './errors'
import { generateVideo, type Progress } from './pipeline'
import { loadVideo, saveVideo, supabasePorts, type VideoView } from './storage'
import type { VideoRecord } from './videoRecord'

/*
  The one door into the video code. The modal `import()`s this file only when Generate Presentation
  is pressed, and this file `import()`s the three that pull in the encoder library and the
  rasteriser, so none of it is downloaded until then. It wires the real narrator, renderer,
  encoder and storage into the pipeline; every rule is in pipeline.ts and storage.ts.
*/

/** What the modal needs to know about the deck. `cards` must already be sorted by `orderIndex`. */
export interface VideoDeck {
  presentationId: string | null
  title: string
  cards: readonly Card[]
  theme: ThemeTokens
  textStyle: TextStyle
}

export type GenerateResult = { status: 'done'; view: VideoView } | { status: 'cancelled' }

export async function generateVideoForDeck(o: {
  deck: VideoDeck
  voice: VoiceSettings
  previous: VideoRecord | null
  signal: AbortSignal
  onProgress?: (p: Progress) => void
}): Promise<GenerateResult> {
  const uid = useAuthStore.getState().user?.id
  const { presentationId } = o.deck
  if (!supabase || !uid || !presentationId) {
    throw new VideoError('uploading', 'Sign in and open a saved deck to make a video.')
  }
  const { voiceId } = o.voice
  if (!voiceId) throw new VideoError('narrating', 'Choose a voice first.')

  const [{ createEncoder, detectFormat }, { createNarrator }, { createSlideRenderer }] = await Promise.all([
    import('./encode'),
    import('./narrate'),
    import('./renderFrame'),
  ])

  // Before any Cartesia request: a browser that cannot encode must not spend the user's credits.
  const format = await detectFormat()
  if (!format) throw new VideoError('encoding', 'This browser cannot encode video. Try a recent Chrome, Edge or Safari.')

  const encoder = createEncoder(format)
  const renderer = await createSlideRenderer({
    cards: o.deck.cards,
    theme: o.deck.theme,
    textStyle: o.deck.textStyle,
    target: encoder.canvas,
  })
  const narrator = createNarrator({ ...o.voice, voiceId })
  const ports = supabasePorts(supabase)

  try {
    const result = await generateVideo(
      {
        texts: o.deck.cards.map((c) => c.narration?.text ?? ''),
        signal: o.signal,
        onProgress: o.onProgress,
      },
      {
        narrate: (text, signal) => narrator.narrate(text, signal),
        silence: (seconds, channels) => narrator.silence(seconds, channels),
        drawSlide: (index, signal) => renderer.draw(index, signal),
        encoder,
        save: (blob, durationSeconds) =>
          saveVideo(ports, {
            uid,
            presentationId,
            blob,
            format,
            durationSeconds,
            previous: o.previous,
          }),
      },
    )
    if (result.status === 'cancelled') return result

    // Fresh links for the video just saved, the same as reopening the modal would give.
    const view = await loadVideo(ports, presentationId, o.deck.title || 'presentation')
    return { status: 'done', view: view ?? { record: result.record, url: null, downloadUrl: null } }
  } finally {
    renderer.dispose()
  }
}
```

- [ ] **Step 6: Type-check, lint, build, and confirm the lazy split**

Run: `npx tsc -b` -> no errors. (Fix mismatches against the real `mediabunny`/`html-to-image` typings by adjusting call shapes only.)
Run: `npm run lint` -> no new findings in `src/video/`.
Run: `npm run build 2>&1 | tail -25`
Expected: separate chunks for `encode`, `narrate`, `renderFrame`, `generate` (named after their modules) and the `index-*.js` entry chunk **not larger than the baseline from Step 1 by more than a few kB**. Then run:

```bash
grep -l "mp4a" dist/assets/*.js
```
Expected: only the `encode-*.js` chunk (the codec string `mp4a` comes from `mediabunny`); the `index-*.js` entry must not be listed. If it is, something imports `mediabunny` or `html-to-image` statically: find it with `grep -rn "from 'mediabunny'\|from 'html-to-image'" src` (only `encode.ts` and the dynamic import in `renderFrame.tsx` are allowed).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/video/narrate.ts src/video/encode.ts src/video/renderFrame.tsx src/video/generate.ts
git commit -m "$(cat <<'EOF'
feat(video): narrator, encoder, off-screen slide renderer and the lazy generate entry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The button, progress and player in the modal

**Files:**
- Create: `src/video/ui.ts`, `src/video/ui.test.ts`
- Modify: `src/components/voice/CloneVoiceModal.tsx` (header comment at 49-58; signature at 85; state near 94-96; cleanup at 281-295; `saveAndClose` at 297-299; `disabledAll` at 304; record button at 391; footer at 520-538)
- Modify: `src/components/voice/CloneVoiceModal.test.tsx`
- Modify: `src/components/editor/NarrationTab.tsx` (store selectors near 53-58; modal use at 235)

**Interfaces:**
- Consumes: `Progress`, `VideoStage` (Tasks 2, 5); `VideoDeck`, `generateVideoForDeck` (Task 6); `VideoView`, `loadVideo`, `supabasePorts` (Task 4); `hasWebCodecs` (Task 2); `VideoError` (Task 2); `formatDuration` (`@/lib/speakingTime`, expects whole seconds); `canSaveVoice` (`@/voice/settingsRow`); `supabase` (`@/lib/supabaseClient`).
- Produces: `ui.ts`: `interface BlockerInput { webCodecs: boolean; hasDeck: boolean; slideCount: number; voiceChosen: boolean }`; `generateBlocker(i: BlockerInput): string | null`; `interface StageRow { stage: VideoStage; label: string; state: 'done' | 'active' | 'pending'; detail: string | null }`; `stageRows(p: Progress | null): StageRow[]`; `canCancelVideo(p: Progress | null): boolean`. The modal's new prop: `deck: VideoDeck`.

- [ ] **Step 1: Write the failing `ui` test** (`src/video/ui.test.ts`)

```ts
import { describe, expect, it } from 'vitest'
import { canCancelVideo, generateBlocker, stageRows } from './ui'

const ok = { webCodecs: true, hasDeck: true, slideCount: 3, voiceChosen: true }

describe('generateBlocker', () => {
  it('is null when everything is in place', () => {
    expect(generateBlocker(ok)).toBeNull()
  })

  it('explains what is missing', () => {
    expect(generateBlocker({ ...ok, webCodecs: false })).toMatch(/cannot encode video/i)
    expect(generateBlocker({ ...ok, hasDeck: false })).toMatch(/saved deck/i)
    expect(generateBlocker({ ...ok, slideCount: 0 })).toMatch(/no slides/i)
    expect(generateBlocker({ ...ok, voiceChosen: false })).toMatch(/choose a voice/i)
  })

  // The browser is the hardest blocker to fix, so it is the one named when several apply.
  it('names the browser first', () => {
    expect(generateBlocker({ webCodecs: false, hasDeck: true, slideCount: 0, voiceChosen: false })).toMatch(/cannot encode video/i)
  })
})

describe('stageRows', () => {
  it('lists the four stages in order, all pending before anything is reported', () => {
    const rows = stageRows(null)
    expect(rows.map((r) => r.stage)).toEqual(['narrating', 'rendering', 'encoding', 'uploading'])
    expect(rows.every((r) => r.state === 'pending')).toBe(true)
  })

  it('marks earlier stages done, the current one active with its count, later ones pending', () => {
    const rows = stageRows({ stage: 'rendering', done: 2, total: 5 })
    expect(rows.map((r) => r.state)).toEqual(['done', 'active', 'pending', 'pending'])
    expect(rows[1].detail).toBe('2/5')
    expect(rows[0].detail).toBeNull()
  })

  it('shows no count for a single-step stage', () => {
    expect(stageRows({ stage: 'uploading', done: 0, total: 1 })[3].detail).toBeNull()
  })
})

describe('canCancelVideo', () => {
  // The upload cannot be aborted, so it is the point of no return.
  it('is true until the video is being saved', () => {
    expect(canCancelVideo(null)).toBe(true)
    expect(canCancelVideo({ stage: 'narrating', done: 0, total: 3 })).toBe(true)
    expect(canCancelVideo({ stage: 'encoding', done: 0, total: 1 })).toBe(true)
    expect(canCancelVideo({ stage: 'uploading', done: 0, total: 1 })).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails, then write `ui.ts`**

Run: `npx vitest run src/video/ui.test.ts` -> FAIL (cannot resolve `./ui`). Then:

```ts
import type { VideoStage } from './errors'
import type { Progress } from './pipeline'

/*
  The rules the modal draws, kept out of the component so they are tested: what stops the button,
  what the progress list says, and when Cancel is still possible.
*/

export interface BlockerInput {
  webCodecs: boolean
  hasDeck: boolean
  slideCount: number
  voiceChosen: boolean
}

/** Why Generate Presentation cannot be pressed, or `null`. The browser is named first: it is the hardest to fix. */
export function generateBlocker(i: BlockerInput): string | null {
  if (!i.webCodecs) return 'This browser cannot encode video. Try a recent Chrome, Edge or Safari.'
  if (!i.hasDeck) return 'Open a saved deck to make a video.'
  if (i.slideCount === 0) return 'This deck has no slides yet.'
  if (!i.voiceChosen) return 'Choose a voice first.'
  return null
}

const ORDER: VideoStage[] = ['narrating', 'rendering', 'encoding', 'uploading']

const LABELS: Record<VideoStage, string> = {
  narrating: 'Narrating slides',
  rendering: 'Drawing slides',
  encoding: 'Encoding video',
  uploading: 'Saving video',
}

export interface StageRow {
  stage: VideoStage
  label: string
  state: 'done' | 'active' | 'pending'
  detail: string | null
}

export function stageRows(progress: Progress | null): StageRow[] {
  const current = progress ? ORDER.indexOf(progress.stage) : -1
  return ORDER.map((stage, i) => ({
    stage,
    label: LABELS[stage],
    state: i < current ? 'done' : i === current ? 'active' : 'pending',
    detail: i === current && progress && progress.total > 1 ? `${progress.done}/${progress.total}` : null,
  }))
}

/** The upload cannot be aborted, so once the video is being saved the run is past the point of no return. */
export function canCancelVideo(progress: Progress | null): boolean {
  return progress?.stage !== 'uploading'
}
```

Run: `npx vitest run src/video/ui.test.ts` -> PASS.

- [ ] **Step 3: Update the modal test first** (`src/components/voice/CloneVoiceModal.test.tsx`)

Edit the imports and setup:

```tsx
import { DEFAULT_THEME } from '@/lib/theme-tokens'
import { EMPTY_TEXT_STYLE } from '@/engine/textStyle'
import type { Card } from '@/engine/contentBlocks'
import type { VideoDeck } from '@/video/generate'
```

Replace `afterEach` and `render`:

```tsx
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

// The modal only counts the slides here; drawing them is the browser-only code in src/video.
const DECK: VideoDeck = {
  presentationId: 'p1',
  title: 'Deck',
  cards: [{ id: 'c1' }] as unknown as Card[],
  theme: DEFAULT_THEME,
  textStyle: EMPTY_TEXT_STYLE,
}

const render = (deck: VideoDeck = DECK) => renderToStaticMarkup(<CloneVoiceModal deck={deck} onClose={() => {}} />)

const stubEncoders = () => {
  vi.stubGlobal('VideoEncoder', class {})
  vi.stubGlobal('AudioEncoder', class {})
}

const withVoice = () =>
  useVoiceStore.setState({ settings: { ...DEFAULT_SETTINGS, voiceId: 'v1', voiceName: 'Skylar', voiceSource: 'premade' } })
```

Add these tests inside `describe('CloneVoiceModal', ...)`:

```tsx
  it('offers Generate Presentation, not Save voice', () => {
    const html = render()
    expect(html).toContain('Generate Presentation')
    expect(html).not.toContain('Save voice')
  })

  it('cannot generate until a voice is chosen', () => {
    stubEncoders()
    const html = render()
    expect(tagLabelled(html, 'Generate Presentation')).toContain('disabled=""')
    expect(html).toContain('Choose a voice first.')
  })

  it('can generate once a voice is chosen, the browser can encode and the deck has slides', () => {
    stubEncoders()
    withVoice()
    expect(tagLabelled(render(), 'Generate Presentation')).not.toContain('disabled=""')
  })

  it('cannot generate in a browser without WebCodecs, and says so', () => {
    withVoice()
    const html = render()
    expect(tagLabelled(html, 'Generate Presentation')).toContain('disabled=""')
    expect(html).toContain('cannot encode video')
  })

  it('cannot generate for a deck with no slides', () => {
    stubEncoders()
    withVoice()
    const html = render({ ...DECK, cards: [] })
    expect(tagLabelled(html, 'Generate Presentation')).toContain('disabled=""')
    expect(html).toContain('no slides')
  })

  it('warns that generating uses credits and asks for the tab to stay in front', () => {
    const html = render()
    expect(html).toContain('Cartesia')
    expect(html).toContain('credits')
    expect(html).toContain('foreground')
  })

  it('says there is no video yet before one is generated', () => {
    expect(render()).toContain('No video yet')
  })
```

Run: `npx vitest run src/components/voice/CloneVoiceModal.test.tsx` -> the new tests FAIL (modal still says Save voice; `deck` prop unknown; also a TS error is acceptable at this point).

- [ ] **Step 4: Change the modal**

Apply these edits to `src/components/voice/CloneVoiceModal.tsx`:

(a) Imports: add

```tsx
import { formatDuration } from '@/lib/speakingTime'
import { supabase } from '@/lib/supabaseClient'
import { VideoError } from '@/video/errors'
import { hasWebCodecs } from '@/video/format'
import type { Progress } from '@/video/pipeline'
import { loadVideo, supabasePorts, type VideoView } from '@/video/storage'
import { canCancelVideo, generateBlocker, stageRows } from '@/video/ui'
import type { VideoDeck } from '@/video/generate'
```

(b) Replace the header comment's second sentence "It works on a draft; nothing is saved until Save voice." with: "It works on a draft; nothing is saved until Generate Presentation, which saves the voice and then makes the narrated video." and add to the "closed" paragraph: "and the video run (`genAbortRef`, which cancels narration, drawing and encoding; a save already under way finishes)."

(c) Signature and state:

```tsx
export function CloneVoiceModal({ deck, onClose }: { deck: VideoDeck; onClose: () => void }) {
```

Add after the `ready` state (`const [ready, setReady] = ...`):

```tsx
  /* ---- the video ---- */
  const [existing, setExisting] = useState<VideoView | null>(null)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [videoError, setVideoError] = useState<string | null>(null)
  const genAbortRef = useRef<AbortController | null>(null)
  const webCodecs = useMemo(() => hasWebCodecs(), [])

  // The deck's saved video, if it has one. Nothing to show is not an error: a project without
  // migration 0015 says so when you generate.
  useEffect(() => {
    if (!supabase || !deck.presentationId) return
    let cancelled = false
    void loadVideo(supabasePorts(supabase), deck.presentationId, deck.title || 'presentation').then((view) => {
      if (!cancelled) setExisting(view)
    })
    return () => {
      cancelled = true
    }
  }, [deck.presentationId, deck.title])
```

(d) Cleanup effect (the block at "closing"): add `genAbortRef.current?.abort()` next to `cloneAbortRef.current?.abort()`.

(e) Replace `saveAndClose` with:

```tsx
  const blocker = generateBlocker({
    webCodecs,
    hasDeck: deck.presentationId !== null,
    slideCount: deck.cards.length,
    voiceChosen: draft.voiceId !== null,
  })
  const canGenerate =
    configured && blocker === null && canSaveVoice({ ready, savedVoiceKnown, saving: saving || generating })

  async function generate() {
    if (!canGenerate) return
    setVideoError(null)
    // The video needs the voice, so the voice is saved first; if that fails, its own error shows.
    if (!(await useVoiceStore.getState().save(draft))) return

    const controller = new AbortController()
    genAbortRef.current = controller
    setGenerating(true)
    setProgress(null)
    try {
      const { generateVideoForDeck } = await import('@/video/generate')
      const result = await generateVideoForDeck({
        deck,
        voice: draft,
        previous: existing?.record ?? null,
        signal: controller.signal,
        onProgress: (p) => {
          if (mountedRef.current) setProgress(p)
        },
      })
      if (!mountedRef.current) return
      if (result.status === 'done') setExisting(result.view)
    } catch (err) {
      // A cancel is a return to the modal, not a failure to report.
      if (!mountedRef.current || controller.signal.aborted) return
      setVideoError(err instanceof VideoError ? err.message : 'Something went wrong. Try again.')
    } finally {
      if (genAbortRef.current === controller) genAbortRef.current = null
      if (mountedRef.current) {
        setGenerating(false)
        setProgress(null)
      }
    }
  }
```

(f) `const disabledAll = !ready || !configured || generating` and, at the record button, `canRecord({ ready, configured, supported: support.supported, recState, cloning: cloning || generating })`.

(g) Insert this section after the Preview `</section>` and before the `ready && !savedVoiceKnown` warning:

```tsx
        {/* ---- The video ---- */}
        <section aria-labelledby="voice-video" className="flex flex-col gap-2">
          <h3 id="voice-video" className="text-sm font-semibold text-app-foreground">
            Presentation video
          </h3>
          {existing ? (
            <div className="flex flex-col gap-2">
              {existing.url ? (
                <video controls src={existing.url} aria-label="Presentation video" className="w-full rounded-app-sm bg-black" />
              ) : (
                <p className="text-xs text-app-highlight-text">The video is saved, but a link to play it could not be made. Reopen this.</p>
              )}
              <p className="text-xs text-app-muted">
                {formatDuration(Math.round(existing.record.durationSeconds))} · made {new Date(existing.record.generatedAt).toLocaleString()}
                {existing.downloadUrl && (
                  <>
                    {' · '}
                    <a href={existing.downloadUrl} className="text-app-accent-text underline">
                      Download
                    </a>
                  </>
                )}
              </p>
            </div>
          ) : (
            <p className="text-xs text-app-muted">No video yet.</p>
          )}

          {generating && (
            <ol aria-live="polite" className="flex flex-col gap-1 text-xs">
              {stageRows(progress).map((row) => (
                <li
                  key={row.stage}
                  className={row.state === 'active' ? 'font-medium text-app-foreground' : row.state === 'done' ? 'text-app-muted' : 'text-app-muted opacity-60'}
                >
                  {row.state === 'done' ? '✓ ' : row.state === 'active' ? '… ' : '· '}
                  {row.label}
                  {row.detail ? ` ${row.detail}` : ''}
                </li>
              ))}
            </ol>
          )}
          {videoError && <p className="text-xs font-medium text-red-600 dark:text-red-400">{videoError}</p>}
        </section>
```

(h) Footer: replace the `ready && !savedVoiceKnown` warning text "so saving is turned off" with "so generating is turned off", and replace the final button row (`Cancel` / `Save voice`) with:

```tsx
        {blocker && configured && <p className="text-xs text-app-muted">{blocker}</p>}
        <p className="text-xs text-app-muted">
          Generating narrates every slide with Cartesia, which uses credits
          {existing ? ' and replaces the current video' : ''}. Keep this tab in the foreground while the slides are drawn.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {generating ? (
            <Button
              variant="secondary"
              onClick={() => genAbortRef.current?.abort()}
              disabled={!canCancelVideo(progress)}
              aria-label="Cancel video"
            >
              Cancel video
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => void generate()}
              disabled={!canGenerate}
              aria-label="Generate Presentation"
            >
              {saving ? <Spinner /> : null}
              Generate Presentation
            </Button>
          )}
        </div>
```

(i) Remove the now-unused `saveAndClose` and, if `oxlint` flags it, any import that became unused.

- [ ] **Step 5: Pass the deck from `NarrationTab`**

In `src/components/editor/NarrationTab.tsx`, next to the other store selectors add:

```tsx
  const presentationId = usePresentationStore((s) => s.presentationId)
  const theme = usePresentationStore((s) => s.theme)
  const textStyle = usePresentationStore((s) => s.textStyle)
```

and change the modal line to:

```tsx
      {voiceOpen && (
        <CloneVoiceModal
          deck={{ presentationId, title, cards, theme, textStyle }}
          onClose={() => setVoiceOpen(false)}
        />
      )}
```

(`cards` is already sorted by `orderIndex`, as this component requires.)

- [ ] **Step 6: Run everything**

Run: `npx vitest run src/video src/components/voice src/components/editor` -> PASS.
Run: `npx tsc -b` -> no errors. Run: `npm run lint` -> no new findings.

- [ ] **Step 7: Commit**

```bash
git add src/video/ui.ts src/video/ui.test.ts src/components/voice/CloneVoiceModal.tsx src/components/voice/CloneVoiceModal.test.tsx src/components/editor/NarrationTab.tsx
git commit -m "$(cat <<'EOF'
feat(video): Generate Presentation replaces Save voice, with progress and a player

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Deleting a deck removes its video

**Files:**
- Modify: `src/store/presentationStore.ts:899-904` (`deleteDeck`)

**Interfaces:**
- Consumes: `removeDeckVideo`, `supabasePorts` (Task 4, both tested; `removeDeckVideo` never throws).

- [ ] **Step 1: Edit `deleteDeck`**

Add the import at the top with the other `@/` imports:

```ts
import { removeDeckVideo, supabasePorts } from '@/video/storage'
```

Change the body to:

```ts
  async deleteDeck(id: string) {
    if (!supabaseConfigured || !supabase) return
    await ensureSession()
    // The video is a Storage object the row's deletion cannot reach, and afterwards nothing would
    // point at it. Best effort and never throws (see `removeDeckVideo`): a video must not block a delete.
    await removeDeckVideo(supabasePorts(supabase), id)
    const { error } = await supabase.from('presentations').delete().eq('id', id)
    if (error) throw error
  },
```

- [ ] **Step 2: Verify**

Run: `npx tsc -b && npm run lint && npm test`
Expected: no type or lint errors; the whole suite passes (nothing tests `deleteDeck` directly; `removeDeckVideo`'s never-throws behaviour is pinned in `storage.test.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/store/presentationStore.ts
git commit -m "$(cat <<'EOF'
feat(video): deleting a deck removes its saved video first

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Documentation, final verification and the hand checks

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-27-narrated-video-design.md` (status line only)

- [ ] **Step 1: Update `CLAUDE.md`**

1. **Voice section.** In the paragraph beginning "The Narration tab's footer has an **AI icon**", replace "The saved voice feeds **only the preview**; nothing else plays or exports audio." with: "The saved voice feeds the preview **and the narrated video** (see Narrated video); nothing else plays or exports audio." and replace "(`voiceStore` ...)" nothing else. In the same section, where the modal's bottom button is described as saving the voice, name it **Generate Presentation** (it saves the voice, then makes the video).
2. **Persistence section.** Add after the `0014` bullet: "- `0015` `presentations.video` (`jsonb`) and the private `deck-videos` Storage bucket with owner-folder policies (the first folder of an object's name must be `auth.uid()`). Does **not** gate card writes: `video` is written in its own best-effort update (`saveVideo`'s `writeRecord`), never through `cardRow`. Without it a video fails at the upload step with "Run migration 0015 in Supabase." `supabase/tests/0015_video_rls.sql` is hand-run and **has not been run**."
3. **Environment section.** In the `VITE_CARTESIA_API_KEY` bullet, append: "Generating a video makes one `speak()` call per narrated slide, so a deployed build also lets anyone who loads it spend on the account in bulk."
4. **New section**, after "Voice":

```markdown
## Narrated video (`src/video/`)

**Generate Presentation** (the voice modal's primary button; it saves the voice first) narrates every slide, draws the slides, and stitches them into one video in the browser, saved to the private `deck-videos` bucket: **one video per deck, replaced each time**, played and downloaded from the modal. Design: `docs/superpowers/specs/2026-09-27-narrated-video-design.md`. A video is a **separate artifact generated from a deck on demand**: it never reads-then-writes `cards` and is **not precedent for a "regenerate this slide" button** (same carve-out as narration and quizzes).

- **Pure rules are tested; browser code is not.** `timeline.ts`, `format.ts`, `paths.ts`, `videoRecord.ts`, `storageErrors.ts`, `ui.ts`, `storage.ts` (against `StoragePorts`) and `pipeline.ts` (generic over injected `narrate`/`silence`/`drawSlide`/`encoder`/`save`) have colocated tests. `narrate.ts`, `encode.ts`, `renderFrame.tsx` and `generate.ts` use `OfflineAudioContext`, WebCodecs, the DOM and `html-to-image` and are checked by hand; keep them thin.
- **Lazy.** `mediabunny` and `html-to-image` are only reached through `import('@/video/generate')` (which imports `encode`, `narrate`, `renderFrame`); the entry bundle must not contain them. Check the build's chunk list after touching imports.
- **Slides.** Each slide is 1280x720 (`FRAME_WIDTH`/`FRAME_HEIGHT`), drawn by the `SlidePreview` composition (`renderFrame.tsx`, off-screen) and **scaled to fit, never cropped**, when taller than the frame (`fitScale`). A blank script is shown silently for 4 s (`SILENT_SLIDE_SECONDS`). Hold time is each clip's own `duration`, and the audio and video timelines are built from the same numbers, so a zero-length clip is refused (`MIN_NARRATION_SECONDS`) rather than allowed to desync the rest.
- **The tab must be visible while slides are drawn**: `SlideBody`'s `ResizeObserver` (which nudges and ink depend on) does not run in a background tab, so `renderFrame` waits for `visibilitychange`. **Fonts are skipped** (`skipFonts`): the app loads no web fonts. **Adding one means revisiting this**, or the video silently uses a fallback. An `image` block from a host without CORS headers will be missing from the frame.
- **Format**: MP4 (`avc` + `aac`) preferred, WebM (`vp9` + `opus`) fallback; `hasWebCodecs()` (sync) disables the button, `detectFormat()` (in `encode.ts`) runs before any Cartesia request so a browser that cannot encode never spends credits.
- **Save order is the safety rule** (`saveVideo`): upload (upsert), then write `presentations.video`, then remove the previous object if its path differs (MP4 -> WebM). A record-write failure removes a *new* object but never the previous one. Cancelling before the upload writes nothing. **The storage client's `upload` takes no `AbortSignal`, so the start of the upload is the point of no return**: Cancel is disabled then, and closing the modal lets the save finish.
- **Deleting a deck** removes its video first (`removeDeckVideo`, best effort, never throws). **`delete_own_account()` does not remove videos**: they are orphaned, like the cloned Cartesia voices.
- **Not testable here, checked by hand**: the real encode, DOM-to-canvas fidelity (themes, backdrops, ink, nudges, tall cards), playback, the upload, and RLS (`supabase/tests/0015_video_rls.sql`, never run).
```

- [ ] **Step 2: Update the spec's status line**

Change `Status: design approved in conversation; written spec awaiting review.` to `Status: approved; implemented on branch feat/narrated-video. Updated during planning: fonts and tab visibility (Pipeline), the codec check split (Format), upload not abortable (Cancellation), record-write rollback (Errors), and the risk list (Testing).`

- [ ] **Step 3: Full verification**

Run each, expect a clean result:
- `npx tsc -b` -> no errors
- `npm run lint` -> no findings in changed files
- `npm test` -> all tests pass (report the total)
- `npm run build` -> succeeds; confirm `encode-*.js` is a separate chunk and `grep -l "mp4a" dist/assets/*.js` does **not** list the `index-*.js` entry

- [ ] **Step 4: Hand checks (report to the user; do not claim these passed)**

The implementer cannot run these (no browser session with a Cartesia key and a Supabase project). State plainly in the final report which were **not** run, and give the user this checklist:
1. Apply `0015_deck_videos.sql`; run `supabase/tests/0015_video_rls.sql` in the SQL editor.
2. In Chrome: open a 3-slide deck with narration, choose a voice, click **Generate Presentation**. Watch the four stages; the result plays with sound, each slide held for its narration.
3. A deck with one blank slide: that slide is silent for 4 s. A deck using a nudged element, hand-drawn ink and a slide with a long list (taller than 16:9): nudge and ink are in place; the tall slide is scaled down, nothing cropped.
4. Cancel mid-narration and mid-drawing: no video is created or changed. Close the modal mid-run: the same. Generate again: the previous video is replaced; the file in Storage is the new one.
5. Switch tabs while drawing: it waits, then continues when you return (the slides must not lose their nudges/ink).
6. Another browser (Firefox/Safari): either a WebM/MP4 is produced, or the button explains the browser cannot encode video.
7. Delete a deck that has a video: the object is gone from the `deck-videos` bucket.
8. An `image` block with a cross-origin image: note whether it appears in the video.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-09-27-narrated-video-design.md
git commit -m "$(cat <<'EOF'
docs: narrated video (Generate Presentation) in CLAUDE.md, migration 0015, spec status

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review

**Spec coverage.** Rename to Generate Presentation and save-then-generate: Task 7. Narrate per slide with `speak()`, blank = 4 s silence: Tasks 5-6. 1280x720, scale-to-fit: Tasks 2, 6. WebCodecs encoding via mediabunny with MP4/WebM fallback and up-front codec check: Tasks 2, 6, 7. Private bucket, `presentations.video`, path, one per deck, replace-after-success, extension-change removal, signed playback: Tasks 1, 3, 4. Progress list, Cancel, credits notice, player + Download, reopen shows existing: Task 7. Cancel/abort semantics and point of no return: Tasks 5, 7. Errors table: Tasks 4, 5. Deck deletion removes video; account deletion documented as a gap: Tasks 1, 8, 9. Lazy imports: Task 6. Tests and hand checks: Tasks 2-5, 7, 9. CLAUDE.md changes: Task 9. Not in scope items (music, subtitles, several videos, temporary ink) have no task by design.

**Deviations from the approved spec, all reflected in the spec itself (Task 9 step 2):** the modal's cheap check is `hasWebCodecs`, the codec check runs at run start; the upload is uncancellable (checked in the pinned `storage-js`); the app has no web fonts so `skipFonts` replaces the font-embedding risk; slides need a visible tab; a failed record write removes the newly uploaded object instead of only warning; the replace notice is a visible line rather than a click-through confirm.

**Placeholders.** None: every code step has code. Two things are flagged as needing reconciliation against installed typings (mediabunny call shapes, Supabase error assignability to `PortError`), with the behaviour that must not change.

**Type consistency.** `VideoStage`/`VideoError` (Task 2) are used unchanged in Tasks 4-7. `VideoView` and `StoragePorts.signedUrl(path, downloadName?)` (Task 4) match `loadVideo`'s use in Tasks 6-7; `loadVideo`'s third parameter changes from a full file name to a base name in Task 7 step 4(c), with its tests and `generate.ts` updated in the same task. `Progress` (Task 5) is what `stageRows`/`canCancelVideo` (Task 7) consume. `VideoDeck` (Task 6) is the modal's `deck` prop. `Clip`/`VideoEncoderPort<AudioBuffer>` (Task 5) are satisfied by `CanvasEncoder` and `Narrator` (Task 6).
