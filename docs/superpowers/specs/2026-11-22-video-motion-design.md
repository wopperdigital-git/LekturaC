# Narrated video: motion (builds and a slow camera)

Date: 2026-11-22. Status: approved 2026-11-22; implemented on branch feat/video-motion; hand check pending.
Builds on `2026-09-27-narrated-video-design.md` (the pipeline this changes) and
`2026-11-21-talking-intro-outro-design.md` (the face clips it leaves alone).

## Intent

The user: the narrated video "feels flat when I'm just watching it and someone is talking. It lacks
life." Today each slide is drawn once and held as a still picture for the whole of its narration
(one frame per second, hard cut to the next). Nothing on screen moves unless a face clip is playing.

The fix is gentle, continuous motion that keeps the picture alive while the narrator talks. It does
not have to follow the narrator's words.

Success: watching a generated video, every slide visibly comes together part by part as it opens,
then never sits perfectly still. Slides move into each other instead of cutting. Nothing reads as
gimmicky.

## Approaches

1. **Builds + slow camera (picked by the user).** Each slide's parts arrive one after another as it
   opens. Then a slow push-in until it ends, and a short crossfade into the next slide. Several
   captures per slide, animated on the canvas. Makes the content come alive, not just the frame.
   Costs more drawing time per slide. Builds follow a fixed rhythm, not the speech.
2. **Camera only.** Slow zoom or drift and crossfades on the single capture made today. Smallest
   change. It moves, but the content never comes alive, so it would likely still feel flat.
3. **Builds timed to the narration.** Each part appears when the narrator reaches it. Needs Cartesia
   word timings (a different endpoint from the `/tts/bytes` used now) and matching spoken words to
   slide parts. Scripts paraphrase the slide, so the matching can be wrong. About three times the work
   of 1, and the most fragile. Left for later. 1 must not make it harder to add.

## Goals

- **Builds.** As a slide opens, its content parts appear one at a time, in reading order, each
  fading in (with a small rise where it can be drawn cleanly, see Constraints).
- **Camera.** For the whole time a slide is held, the picture slowly scales up (a push-in). The
  direction or origin varies from slide to slide, so consecutive slides don't move identically.
- **Transitions.** A short crossfade from the previous slide's last picture into the new slide.
- Applies to every slide segment, including silent slides (4 s) and the face-failed title card's
  neighbours. The title card itself may stay still.

## Non-goals

- Word-synced builds (approach 3).
- Any change to the presenter, Present mode, thumbnails, the editor or the PPTX export. Only the video.
- A per-slide or per-deck motion setting, or a switch to turn it off.
- Music, subtitles, sound effects.
- Motion inside the face intro and outro clips. They are drawn as today, and the cut into and out of
  them may stay a hard cut.

## Anti-goals (failure even if it works)

- **Distracting motion**: bounces, overshoot, spins, large zooms, fast pans. It should feel like a
  calm documentary, not a slideshow template.
- **Text cropped or pushed out of frame** at any moment. The existing rule (scale to fit, never crop)
  holds on every frame, including at the end of the push-in.
- **Slide timings change.** `VideoRecord.slides` (start and duration per slide) must be exactly what
  it is today for the same narration. Lessons place their checkpoints from it. Transitions and builds
  happen *inside* a slide's own time.
- **Picture and sound drift.** The audio track is unchanged. The picture for slide N covers exactly
  slide N's time span.
- **New cost.** No new paid calls (Cartesia, WaveSpeed, AI). Motion comes only from the deck as it is.
- **Breaking the core rule.** Nothing writes `cards`. Nothing asks a model what to emphasise.

## Constraints

- Everything stays in the browser: `html-to-image` to capture, a canvas to compose, `mediabunny` to
  encode. Both libraries stay lazy, reached only through `import('@/video/generate')`.
- **The slide's layout must not shift between captures.** Parts are hidden in a way that keeps their
  space (e.g. `visibility: hidden`, which inherits through `Adjustable`'s `display: contents` holder),
  never removed. Every capture of a slide has identical geometry, and the last state is pixel-identical
  to today's single capture.
- **No visible box or seam** on any ground while a part is animating, including photo grounds
  (`hero`/`quote` background photos), deep and tint grounds, and celestial theme backdrops. If a rise
  cannot be drawn cleanly on a ground, that ground gets a fade only.
- **What is never hidden:** the slide's ground, a photo drawn as the ground (`BackgroundPhoto`), and
  the surface itself. Only content parts build.
- **Saved ink (`card.overlay`)** appears with the last build step, so a drawn arrow never points at
  something that hasn't arrived yet.
- The tab must still be visible while slides are captured (`whenVisible`). The font embedding and the
  font probe are unchanged.
- Cancellation, failure messages and the save order in `pipeline.ts` keep their current rules.

## Decided

- **Approach 1** (the user's pick).
- **Build unit:** a block (`data-block-index`) in index order. For a list-like block (bullet list, a
  run of points, timeline steps, stat columns, comparison groups), each item is its own step. Today
  items carry no marker outside the editor (`useItemProps` returns nothing without an editing
  context), so the video gives them one. *(My call: per-item steps are what make a typical heading +
  bullets slide come alive; block-only would build it in two steps.)*
- **Builds are fade-only on every ground.** The rise was dropped: blending whole frames is seam-free, a
  shifted patch is not.
- **Unit order is document order** (`querySelectorAll`), which is the reading order in every layout; not
  block index, and not geometry (holders are `display: contents`).
- **Balanced cap:** when a slide's item-level units exceed 6 but its holder-level units (one per block
  holder, items not split) fit in 6, it builds per holder; otherwise units past the fifth arrive in step 6.
- **Step cap:** at most 6 steps per slide. Past that, the remaining parts arrive together in the last
  step. *(My call: bounds capture time and keeps long slides from building for too long.)*
- **Rhythm:** first step starts shortly after the slide opens (after the crossfade), each step's
  entrance lasts about 0.5 s, steps start about 0.6 s apart, eased out (no overshoot). On a short slide
  the interval compresses so every part has arrived by 40% of the slide's duration. *(My call.)*
- **Camera:** the whole stage (backdrop and card together, one bitmap per state) is pushed in from
  1.00 to 1.03 over the slide's whole duration, linear or very gently eased. The fit scale stays as
  today, so the first fully built picture matches today's capture. The origin varies per slide,
  deterministically from the slide's index, but stays near the centre (x 400–880, y 260–460 in frame
  pixels). That keeps the card's edges inside the 1280×720 frame at 1.03. The stage padding and the
  card's shadow may be trimmed at the frame edge; the card and its text never are. *(My call, after the
  builder check found that `frameScale` already fills the padded area, so "stays inside the padding"
  was wrong.)*
- **Crossfade:** about 0.4 s at the start of each slide, inside that slide's time. The first slide
  (or the first after the intro clip) fades from the stage background, not from a previous slide.
  *(My call.)*
- **Frame rate:** 30 fps for slide segments. The 1-frame-per-second rule in `frameSlots` was only
  there because the picture never changed. *(My call. Drop to 24 fps if encoding turns out too slow
  on a typical laptop.)*
- **Always on**, no setting. *(My call, per the non-goals.)*
- **Generation time budget:** at most about 2× today's time for the same ~10-slide deck. The frame
  rate is one constant. Compositing runs on the main thread (the tab already has to be visible).
  Progress stays per slide. *(My call. Revisit only if the hand check misses the budget.)*

## Measured (spike, 2026-11-22)

The builder check raised the `deck-videos` bucket's 50 MB per-file cap (`0015_deck_videos.sql`).
A throwaway test encoded 60 s of 1280×720 H.264 with mediabunny in Chromium, using a real slide
captured from `/dev/slides` (gallery `g-termrows`, Moonlight theme) on a starry gradient stage. The
figures are **video track only**:

| Case | Size per minute | Encode time per minute of video |
|---|---|---|
| Today: still, 1 fps, `medium` | 0.56 MB | 3.6 s |
| Push-in 1.00→1.03, crossfade, 30 fps, `medium` | 2.05 MB | 11.4 s |
| Same, `low` | 1.04 MB | 11.1 s |
| Fade then still, 30 fps, `medium` | 1.02 MB | 10.9 s |
| Worst case: grainy photo ground, push-in, 30 fps, `medium` | 1.56 MB | 13.2 s |

Audio (AAC `medium`) adds an estimated ~1 MB per minute, the same as today (not measured). So a
moving video is about 3 MB per minute, and the 50 MB cap is reached at roughly 16 minutes of video,
against roughly 30 minutes today. Encoding adds about 75 s to a 10-minute video.

**Decision:** keep the continuous push-in at `medium`. **Size guard** *(my call)*: the total length is
known once narration finishes and before encoding starts. If the estimated file at `medium` would pass
about 45 MB, encode that video at `low` instead. If even `low` would pass the cap, refuse before
encoding with a clear message. That message is new copy, so it goes in user-facing words, not bytes.
The narration credits are already spent at that point, as they are today when an upload fails. Text
sharpness at `low` is a hand check.

## Left to the builder

- How states are captured: cumulative captures (state k = steps 1..k visible) with the new part's
  bounding box blended in, or separate part captures. It must meet the no-seam and no-shift constraints.
- How the pipeline port changes (`drawSlide` today draws one still). For example, a prepare step per
  slide plus a draw-at-time call, with the frame loop in the pipeline or in the renderer.
- Exact easing curves and timings within the ranges above.
- How items get a video-only marker (a provider for the video surface is the obvious route, so the
  editor and presenter markup stays as it is).

## Testing

- **Pure module** (e.g. `src/video/motion.ts`) with colocated tests: the build schedule (step start
  times, the cap, compression on short slides, everything arrived by 40%), the camera scale at any t
  (never above the fit limit), crossfade alpha at any t, the per-slide origin, and the frame slots at
  30 fps covering a slide's span exactly with no gap or overlap.
- **Pipeline tests** (existing fakes): slide timings and `VideoRecord.slides` are unchanged for the
  same narration. Cancel and failure behaviour is unchanged.
- **Hand checks** (not testable here): generate a video on `GALLERY_DECK`-like content and on a real
  deck in at least three themes, including one with a photo ground and a celestial backdrop. Check
  for seams, crop, motion feel, and encode time. Record before/after generation time for a ~10-slide deck.
- Check the build's chunk list: no new eager imports of the encoder or rasteriser.
