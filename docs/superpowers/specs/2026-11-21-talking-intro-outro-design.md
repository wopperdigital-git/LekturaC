# Talking intro & outro (WaveSpeed InfiniteTalk) — design

## Intent

The narrated video (`src/video/`, spec `2026-09-27-narrated-video-design.md`) is slides plus the user's Cartesia voice. The user wants their own face, lip-synced, **only at the start and end**: a full-screen talking clip before slide 1 and after the last slide. It must not be an avatar talking through the whole video. Every slide in between stays a plain slide with the voice over it.

## Decided by the user

- **Layout:** each clip is its own full-screen segment, placed before slide 1 and after the last slide. It is never drawn over a slide.
- **Words:** two boxes in the Narrate tab, **Intro** and **Outro**, saved with the deck. Each starts with a short starter text the user edits. No AI call: the generate-once rule is untouched, and these words never write `cards`. A blank box means no clip at that end.
- **Photo:** uploaded once, saved privately to the account (owner-only) and reused for every deck. A consent checkbox ("This is my face, or I have permission to use it") is required before uploading.
- **On a clip failure** (a WaveSpeed error, a timeout, a bad photo) after the voice audio is already paid for: the video is still made. The failed segment shows a plain title card with the voice over it, and the finished job carries a notice that the face clip failed.
- **Resolution:** 480p only.

## Approaches considered

1. **Merge in the browser (picked).** The existing mediabunny encoder decodes the InfiniteTalk MP4 (`Input` + `BlobSource` + `CanvasSink`) and draws its frames into the same 1280×720 file. The result is one file, so download, the player and lessons work unchanged.
2. **Merge on a server.** Supabase edge functions have no ffmpeg, so this would need a separate rented server. Rejected.
3. **Three files played in a row.** This breaks the download and the lesson timings. Rejected.

## WaveSpeed API (verified by a live spike, 2026-11-21)

- **CORS:** both `api.wavespeed.ai` and the output CDN (`*.cloudfront.net`) answer with `Access-Control-Allow-Origin: *`. `Authorization` is an allowed header.
- **Upload:** `POST https://api.wavespeed.ai/api/v3/media/upload/binary`, multipart field `file`, returns `data.download_url` (a CloudFront URL). Files are kept 7 days.
- **Submit:** `POST https://api.wavespeed.ai/api/v3/wavespeed-ai/infinitetalk` with JSON `{image, audio, resolution: "480p"}` and `Authorization: Bearer <key>`. It returns `data.id`. **Never retry a submit automatically**, because each one is a separate billed job.
- **Poll:** `GET /api/v3/predictions/{id}/result`. Observed statuses: `processing`, then `completed`. Terminal failures are `failed | cancelled | timeout | deleted`. On `completed`, `data.outputs[0]` is the MP4 URL. `data.error` holds the error message.
- **Observed output:** a 1024×1024 photo with 3.0 s of audio gave a **624×624 H.264 video at 25 fps lasting 2.92 s**, with AAC audio. The output follows the photo's aspect ratio, and the video can run slightly shorter than the audio.
- **Time:** 67 s of wall time for 3 s of audio. The docs give 10–30 s per second of audio.
- **Price:** $0.03 per second at 480p, rounded up, with a 3 s minimum. Billed again on every remake.

## Constraints

- `VITE_WAVESPEED_API_KEY` is baked into the client bundle, like Cartesia's key. It is billed, so it is local-only until capped (see the memory note on keys). Without the key, the feature is off and shows a reason. No user-facing copy names the variable (`lib/setupCopy.ts`).
- All WaveSpeed network calls live in one file (`src/avatar/wavespeed.ts`), mirroring `voice/cartesia.ts`. Every call honours an `AbortSignal`, and an abort stays an `AbortError`.
- A cancel while waiting stops polling and saves nothing, which keeps the previous video. WaveSpeed still bills for jobs already submitted, and the UI says so before Generate.
- The encoder, the decoder and `drawClip` are reached only through `import('@/video/generate')`.
- Migration 0021 gates **only** this feature. `loadDeck`'s select must not name the new column. It is read and written in its own best-effort calls, like `generation/metaRow.ts`.

## Design

**Data (migration `0021_talking_bookends.sql`)**
- `presentations.bookends jsonb not null default '{}'`, holding `{intro?: string, outro?: string}`.
- A private bucket `face-photos` (jpeg/png/webp, 10 MB), with owner-folder policies copied from 0015. The path is `<uid>/face.<ext>`, one photo per user, replaced on re-upload.
- Account deletion removes the photo before the account goes, next to the Cartesia voice clean-up.

**Run order (pipeline)**
1. Narrate the intro and outro with Cartesia, keeping both the WAV blob and the decoded buffer.
2. Start both talking clips at once: upload the photo (once) and each WAV, then submit.
3. Narrate the slides while the clips process.
4. Wait for the clips (new progress stage `animating`).
5. Encode the segments in order: `[intro?, ...slides, outro?]`.
   - A clip's segment uses the Cartesia buffer as its audio and the audio's length as its duration.
   - Clip frames past the audio's end are dropped, and a short clip holds its last frame.
   - Frames are drawn letterboxed, never cropped, on the deck theme's `deep` colour.
6. Save as today. `VideoRecord.slides` lists slides only, offset by the intro's length, so lesson checkpoints still land after the right slides.

**UI**
- **Narrate tab:** an Intro box above the slide list and an Outro box below it, each with an estimated-seconds and cost line.
- **Video dialog:** a new step, "Talking intro & outro", with:
  - an on/off switch
  - the photo with its consent checkbox
  - the estimated cost and added wait
  The switch is disabled, with a reason, when there is no key, no photo, or both boxes are blank.

## Goals / non-goals / anti-goals

- **Goal:** the user's face introduces and closes the video in their own cloned voice, with one file to download.
- **Non-goals:** 720p; a face over slides; AI-written intro text; PPTX or presenter changes.
- **Anti-goals:**
  - silently spending money (no automatic resubmit, cost shown before Generate)
  - a face clip failure costing the whole video
  - anyone but the owner reading the face photo

## Left to the builder

- The exact starter wording.
- The chars-per-second estimate (about 15).
- The polling back-off (2 s growing to 10 s, 20 min ceiling).
- The title-card look for the fallback (a deep ground with the deck title).
