# Video Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each narrated-video slide builds in part by part, then slowly pushes in, with a crossfade from the slide before. Long videos drop to a lower quality, or are refused before encoding, so they never pass the 50 MB bucket cap.

**Architecture:** A pure module (`motion.ts`) holds all timing math: build schedule, easing, camera, crossfade, layer weights. Another pure module (`sizeGuard.ts`) picks the encode quality from the total length. The pipeline gains an optional `motion` port: after `drawSlide(index)` it calls `motion.paint(index, localSeconds, durationSeconds)` before every `addFrame`, at 30 fps. The renderer captures each slide once per build state (S0 = nothing built … Sn = everything, identical to today's capture) by toggling `visibility: hidden` on parts. It composites them on the canvas per frame. List items get a video-only marker through a context, so the editor and presenter markup stays as it is.

**Tech Stack:** TypeScript, React 19, html-to-image, mediabunny (WebCodecs), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-22-video-motion-design.md`

## Global Constraints

- Nothing writes `cards`. No new paid calls (Cartesia, WaveSpeed, AI).
- `VideoRecord.slides` and every slide's start and duration are exactly what they are today for the same narration. Builds and crossfades happen inside a slide's own time.
- Text is never cropped. Camera push is 1.00→1.03. Origins stay within x 400–880, y 260–460 (frame pixels, 1280×720).
- Parts are hidden with `visibility: hidden` only, so geometry is identical across a slide's captures. The final state equals today's single capture.
- Never hidden: the ground, the background photo (`[data-fixed-element]` holder), the surface. Saved ink (`[data-overlay]`) appears with the last step.
- At most 6 build steps per slide. Units past the fifth all arrive in step 6.
- Rhythm: entrance 0.5 s, steps 0.6 s apart, first step after the 0.4 s crossfade, eased out with no overshoot. Everything has arrived by 40% of the slide's duration.
- 30 fps for slide segments. The face clips and the title card are unchanged (the title card stays 1 fps). The cut into the outro stays a hard cut.
- Slide 0 crossfades from the theme's `colors.deep`. Every later slide crossfades from the last frame painted for the slide before it.
- Size guard: estimate at 3.2 MiB/min (`medium`) and 2.2 MiB/min (`low`), video plus audio. Use `medium` if the estimate is ≤ 45 MiB, else `low` if ≤ 48 MiB, else refuse before `encoder.start` with user-facing copy (no bytes, no variable names).
- `mediabunny` and `html-to-image` stay reachable only through `import('@/video/generate')`.
- `verbatimModuleSyntax`: type-only imports use `import type`.

## Review Focus

1. **A slide with no blocks, or only a background photo** (zero units): no build steps. The slide shows fully from its first frame and still gets the camera and crossfade. Pinned in Task 1 (`buildSchedule(0, …)`) and Task 5 (renderer handles `units.length === 0`).
2. **A very short slide** (a 0.3 s narration, or the 4 s silent slide with 6 steps): every step still finishes inside 40% of the slide, with no negative or NaN times. Pinned in Task 1.
3. **Frame slots at 1/30 s across a long slide** (e.g. 47.3 s): slots tile the span exactly, with no float drift, no gap, no overlap, and the last slot ends at start + duration. Pinned in Task 1.
4. **A video right at the size thresholds** (exactly 45 MiB and 48 MiB estimates): an estimate exactly at a budget keeps the higher quality (≤, not <). Pinned in Task 2.
5. **Cancel or failure during the 30 fps paint loop:** the encoder is still cancelled and nothing is saved, the same as today. Pinned in Task 3.

---

### Task 1: Pure motion math

**Files:**
- Create: `src/video/motion.ts`
- Create: `src/video/motion.test.ts`
- Modify: `src/video/timeline.ts:54-67` (`frameSlots` gets a step parameter)
- Modify: `src/video/timeline.test.ts` (add the step tests)

**Interfaces:**
- Produces (from `motion.ts`):
  - `MOTION_FPS = 30`, `CROSSFADE_SECONDS = 0.4`, `BUILD_ENTRANCE_SECONDS = 0.5`, `BUILD_INTERVAL_SECONDS = 0.6`, `BUILD_DONE_SHARE = 0.4`, `MAX_BUILD_STEPS = 6`, `CAMERA_PUSH = 0.03`
  - `interface BuildStep { start: number; duration: number }`
  - `buildSchedule(stepCount: number, durationSeconds: number): BuildStep[]`
  - `stepOf(unitIndex: number): number`: which step a unit arrives in (`min(unitIndex, MAX_BUILD_STEPS - 1)`)
  - `stepCountFor(unitCount: number): number`: `min(unitCount, MAX_BUILD_STEPS)`
  - `easeOut(x: number): number`: cubic ease-out, clamped to [0, 1]
  - `stepProgress(step: BuildStep, t: number): number`: eased, in [0, 1]
  - `interface LayerPlan { base: number; blends: { state: number; alpha: number }[] }`
  - `layerPlan(schedule: BuildStep[], t: number): LayerPlan`
  - `cameraScale(t: number, durationSeconds: number): number`
  - `cameraOrigin(slideIndex: number): { x: number; y: number }`
  - `crossfadeAlpha(t: number): number`
- Produces (from `timeline.ts`): `frameSlots(slide: SlideTiming, stepSeconds = FRAME_STEP_SECONDS): FrameSlot[]`

- [ ] **Step 1: Write the failing tests** in `motion.test.ts` and `timeline.test.ts`

```ts
describe('buildSchedule', () => {
  it('spaces steps 0.6 s apart after the crossfade on a long slide', () => {
    expect(buildSchedule(3, 20)).toEqual([
      { start: 0.4, duration: 0.5 },
      { start: 1.0, duration: 0.5 },
      { start: 1.6, duration: 0.5 },
    ].map((s) => expect.objectContaining({ start: expect.closeTo(s.start, 9), duration: s.duration })))
  })
  it('compresses so every step has arrived by 40% of a short slide', () => {
    for (const [n, d] of [[6, 4], [6, 1], [3, 0.3], [1, 0.2]] as const) {
      const steps = buildSchedule(n, d)
      expect(steps).toHaveLength(n)
      for (const s of steps) {
        expect(s.start).toBeGreaterThanOrEqual(0)
        expect(s.duration).toBeGreaterThan(0)
        expect(s.start + s.duration).toBeLessThanOrEqual(d * 0.4 + 1e-9)
      }
    }
  })
  it('has no steps for a slide with nothing to build', () => {
    expect(buildSchedule(0, 10)).toEqual([])
  })
})

describe('steps', () => {
  it('caps at six: units past the fifth arrive together in the last step', () => {
    expect([0, 1, 4, 5, 6, 11].map(stepOf)).toEqual([0, 1, 4, 5, 5, 5])
    expect(stepCountFor(0)).toBe(0)
    expect(stepCountFor(4)).toBe(4)
    expect(stepCountFor(9)).toBe(6)
  })
})

describe('easing and progress', () => {
  it('eases out without overshoot', () => {
    expect(easeOut(0)).toBe(0)
    expect(easeOut(1)).toBe(1)
    expect(easeOut(-1)).toBe(0)
    expect(easeOut(2)).toBe(1)
    for (let x = 0; x <= 1; x += 0.05) expect(easeOut(x)).toBeLessThanOrEqual(1)
    expect(easeOut(0.5)).toBeGreaterThan(0.5)
  })
  it('is 0 before a step and 1 after it', () => {
    const step = { start: 1, duration: 0.5 }
    expect(stepProgress(step, 0.9)).toBe(0)
    expect(stepProgress(step, 1.6)).toBe(1)
  })
})

describe('layerPlan', () => {
  const schedule = [{ start: 0.4, duration: 0.5 }, { start: 1.0, duration: 0.5 }]
  it('shows state 0 alone before anything builds', () => {
    expect(layerPlan(schedule, 0)).toEqual({ base: 0, blends: [] })
  })
  it('blends the next state in while a step runs', () => {
    const plan = layerPlan(schedule, 0.65)
    expect(plan.base).toBe(0)
    expect(plan.blends).toHaveLength(1)
    expect(plan.blends[0].state).toBe(1)
    expect(plan.blends[0].alpha).toBeGreaterThan(0)
    expect(plan.blends[0].alpha).toBeLessThan(1)
  })
  it('rests on the last state once every step is done', () => {
    expect(layerPlan(schedule, 5)).toEqual({ base: 2, blends: [] })
  })
  it('rests on state 0 when there is nothing to build', () => {
    expect(layerPlan([], 3)).toEqual({ base: 0, blends: [] })
  })
})

describe('camera and crossfade', () => {
  it('pushes from 1.00 to 1.03 over the slide and never past it', () => {
    expect(cameraScale(0, 10)).toBe(1)
    expect(cameraScale(10, 10)).toBeCloseTo(1.03, 9)
    expect(cameraScale(20, 10)).toBeCloseTo(1.03, 9)
  })
  it('keeps every origin near the centre and moves between neighbours', () => {
    for (let i = 0; i < 20; i++) {
      const o = cameraOrigin(i)
      expect(o.x).toBeGreaterThanOrEqual(400)
      expect(o.x).toBeLessThanOrEqual(880)
      expect(o.y).toBeGreaterThanOrEqual(260)
      expect(o.y).toBeLessThanOrEqual(460)
      expect(cameraOrigin(i + 1)).not.toEqual(o)
    }
  })
  it('crossfades over 0.4 s', () => {
    expect(crossfadeAlpha(0)).toBe(0)
    expect(crossfadeAlpha(0.2)).toBeCloseTo(0.5, 9)
    expect(crossfadeAlpha(0.4)).toBe(1)
    expect(crossfadeAlpha(3)).toBe(1)
  })
})
```

Add to `timeline.test.ts`:

```ts
it('tiles a long slide exactly at 30 fps, with no drift', () => {
  const slide = { index: 0, startSeconds: 12.5, durationSeconds: 47.3 }
  const slots = frameSlots(slide, 1 / 30)
  expect(slots[0].timestamp).toBe(12.5)
  for (let i = 1; i < slots.length; i++) {
    expect(slots[i].timestamp).toBeCloseTo(slots[i - 1].timestamp + slots[i - 1].duration, 9)
  }
  const last = slots.at(-1)!
  expect(last.timestamp + last.duration).toBeCloseTo(59.8, 9)
  expect(last.duration).toBeGreaterThan(0)
})
it('keeps the one-per-second default', () => {
  expect(frameSlots({ index: 0, startSeconds: 0, durationSeconds: 3 })).toHaveLength(3)
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/video/motion.test.ts src/video/timeline.test.ts`
Expected: FAIL, `motion.ts` not found, and the 30 fps test fails because `frameSlots` ignores the step.

- [ ] **Step 3: Implement `motion.ts` and the `frameSlots` step**

`frameSlots`: compute slot k's timestamp as `start + k * step` (integer k, not an accumulated offset). Count = `max(1, ceil(duration / step - 1e-9))`. The last slot's duration = `duration - (count - 1) * step`.

`buildSchedule` (the algorithm the tests don't fully determine):

```ts
const end = BUILD_DONE_SHARE * d
const first = Math.min(CROSSFADE_SECONDS, end / 2)
const entrance = Math.min(BUILD_ENTRANCE_SECONDS, end - first)
const interval = n > 1 ? Math.min(BUILD_INTERVAL_SECONDS, (end - first - entrance) / (n - 1)) : 0
// step k: { start: first + k * interval, duration: entrance }
```

`layerPlan`: `base` = number of steps with progress 1. `blends` = for each later step j with progress > 0, `{ state: j + 1, alpha: progress }`, in order. The painter draws `base`, then each blend over it. `cameraScale` is linear: `1 + CAMERA_PUSH * clamp(t / d)`. `cameraOrigin` cycles a fixed list of 5 points inside the bounds, e.g. `(640,360) (520,300) (760,420) (560,420) (720,300)`. `crossfadeAlpha` is linear `clamp(t / CROSSFADE_SECONDS)`.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/video/motion.test.ts src/video/timeline.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/video/motion.ts src/video/motion.test.ts src/video/timeline.ts src/video/timeline.test.ts
git commit -m "feat(video): pure motion math for builds, camera and crossfade"
```

---

### Task 2: Size guard and encoder quality

**Files:**
- Create: `src/video/sizeGuard.ts`
- Create: `src/video/sizeGuard.test.ts`
- Modify: `src/video/pipeline.ts` (`VideoEncoderPort.start`, the guard before start)
- Modify: `src/video/pipeline.test.ts` (guard tests)
- Modify: `src/video/encode.ts` (build the `Output` in `start(quality)`)

**Interfaces:**
- Produces:
  - `type EncodeQuality = 'medium' | 'low'`
  - `MEDIUM_MIB_PER_MINUTE = 3.2`, `LOW_MIB_PER_MINUTE = 2.2`, `MEDIUM_BUDGET_MIB = 45`, `LOW_BUDGET_MIB = 48`
  - `encodeQualityFor(totalSeconds: number): EncodeQuality | null`
  - `tooLongMessage(totalSeconds: number): string`
  - `VideoEncoderPort.start(quality: EncodeQuality): Promise<void>` (was `start()`)

- [ ] **Step 1: Write the failing tests**

```ts
describe('encodeQualityFor', () => {
  const secondsFor = (mib: number, perMinute: number) => (mib / perMinute) * 60
  it('keeps medium up to and including a 45 MiB estimate', () => {
    expect(encodeQualityFor(60)).toBe('medium')
    expect(encodeQualityFor(secondsFor(45, 3.2))).toBe('medium')
  })
  it('drops to low past 45 MiB, up to and including 48 MiB at low', () => {
    expect(encodeQualityFor(secondsFor(45, 3.2) + 1)).toBe('low')
    expect(encodeQualityFor(secondsFor(48, 2.2))).toBe('low')
  })
  it('refuses past what low can fit', () => {
    expect(encodeQualityFor(secondsFor(48, 2.2) + 1)).toBeNull()
  })
})

describe('tooLongMessage', () => {
  it('speaks in minutes, never bytes', () => {
    const m = tooLongMessage(30 * 60)
    expect(m).toMatch(/30 minutes/)
    expect(m).toMatch(/about 21 minutes/)
    expect(m).not.toMatch(/MB|MiB|byte|VITE_/i)
  })
})
```

Copy (exact): ``This video would run about ${minutes} minutes, which is too long to save. The longest that fits is about ${maxMinutes} minutes. Shorten the narration or split the deck, then try again.`` Both numbers are whole minutes, rounded down for the max and to the nearest minute for the length.

Add to `pipeline.test.ts`:

```ts
it('starts the encoder at medium for a short video', async () => {
  const { deps, run } = setup()
  let quality: string | undefined
  deps.encoder.start = async (q) => { quality = q }
  await run(['A'])
  expect(quality).toBe('medium')
})
it('refuses a video too long to save before starting the encoder', async () => {
  const { deps, log, run } = setup()
  deps.narrate = async () => clip(30 * 60)
  await expect(run(['A'])).rejects.toMatchObject({ stage: 'encoding' })
  expect(log).not.toContain('start')
  expect(log.some((l) => l.startsWith('save'))).toBe(false)
})
```

Update the fake's `start` to `async (_quality) => { log.push('start') }`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/video/sizeGuard.test.ts src/video/pipeline.test.ts`
Expected: FAIL, `sizeGuard.ts` not found, and the pipeline does not refuse.

- [ ] **Step 3: Implement**

- `sizeGuard.ts`: the estimate is `minutes * MIB_PER_MINUTE`. ≤ budget keeps that quality.
- `pipeline.ts`: right after `planTimeline` and before `encoderRunning = true`: `const quality = encodeQualityFor(timeline.totalSeconds)`. If `null`, throw `new VideoError('encoding', tooLongMessage(timeline.totalSeconds))`. Then `deps.encoder.start(quality)`.
- `encode.ts`: `createEncoder(format)` still returns the canvas at once. The `Output`, `CanvasSource` (with `new Quality(quality)`) and `AudioBufferSource` (audio stays `medium`) are built inside `start(quality)`. `addAudio`, `addFrame`, `finish` and `cancel` use them. `cancel()` before `start` is a no-op. `detectFormat` keeps probing at `medium`.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/video && npx tsc -b`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/video/sizeGuard.ts src/video/sizeGuard.test.ts src/video/pipeline.ts src/video/pipeline.test.ts src/video/encode.ts
git commit -m "feat(video): pick encode quality from length so a video fits the bucket"
```

---

### Task 3: Motion port in the pipeline

**Files:**
- Modify: `src/video/pipeline.ts:52-62` (`PipelineDeps`), `:258-268` (slide loop)
- Modify: `src/video/pipeline.test.ts`

**Interfaces:**
- Consumes: `frameSlots(slide, stepSeconds)` (Task 1).
- Produces:
  ```ts
  export interface MotionPort {
    /** Seconds between pictures for a slide, e.g. 1 / MOTION_FPS. */
    frameStepSeconds: number
    /** Paints slide `index` at `localSeconds` into its slide time, into the encoder's canvas. Synchronous. */
    paint(index: number, localSeconds: number, durationSeconds: number): void
  }
  // PipelineDeps gains: motion?: MotionPort
  ```
  Without `motion`, the behaviour is exactly today's, so every existing test stays as it is.

- [ ] **Step 1: Write the failing tests**

```ts
describe('generateVideo: motion', () => {
  it('paints before every picture at the motion step, from local time 0', async () => {
    const { deps, log, run } = setup()
    const painted: string[] = []
    deps.motion = {
      frameStepSeconds: 0.5,
      paint: (i, t, d) => { painted.push(`${i}@${t}/${d}`); log.push('paint') },
    }
    await run(['A']) // narrate gives 2 s
    expect(painted).toEqual(['0@0/2', '0@0.5/2', '0@1/2', '0@1.5/2'])
    const frames = log.filter((l) => l === 'paint' || l.startsWith('frame'))
    expect(frames).toEqual(['paint', 'frame 0', 'paint', 'frame 0.5', 'paint', 'frame 1', 'paint', 'frame 1.5'])
  })
  it('keeps slide timings unchanged', async () => {
    const a = setup()
    const b = setup()
    b.deps.motion = { frameStepSeconds: 1 / 30, paint: () => {} }
    const saved: unknown[] = []
    a.deps.save = b.deps.save = async (_blob, seconds, slides) => { saved.push(slides); return { ...RECORD, durationSeconds: seconds } }
    await a.run(['A', ' ', 'B'])
    await b.run(['A', ' ', 'B'])
    expect(saved[1]).toEqual(saved[0])
  })
  it('stops the encoder and saves nothing when painting throws', async () => {
    const { deps, log, run } = setup()
    deps.motion = { frameStepSeconds: 0.5, paint: () => { throw new Error('boom') } }
    await expect(run(['A'])).rejects.toMatchObject({ stage: 'encoding' })
    expect(log).toContain('cancel')
    expect(log.some((l) => l.startsWith('save'))).toBe(false)
  })
  it('cancels cleanly when aborted mid-slide', async () => {
    const { deps, log, controller, run } = setup()
    let n = 0
    deps.motion = { frameStepSeconds: 0.1, paint: () => { if (++n === 5) controller.abort() } }
    expect(await run(['A'])).toEqual({ status: 'cancelled' })
    expect(log).toContain('cancel')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/video/pipeline.test.ts -t motion`
Expected: FAIL, `motion` is not a known dep and paint is never called.

- [ ] **Step 3: Implement**

In the slide loop, inside the existing `step('encoding', …)`:
- use `frameSlots(slide, deps.motion?.frameStepSeconds ?? FRAME_STEP_SECONDS)`;
- before each `addFrame`, call `check()`, then `deps.motion?.paint(index, slot.timestamp - slide.startSeconds, slide.durationSeconds)`.

The bookend and title-card paths are untouched.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/video`
Expected: PASS (old and new tests).

- [ ] **Step 5: Commit**

```bash
git add src/video/pipeline.ts src/video/pipeline.test.ts
git commit -m "feat(video): optional motion port paints each picture of a slide"
```

---

### Task 4: Video-only item markers

**Files:**
- Modify: `src/components/layouts/adjustContext.ts:144-179` (`useItemProps`)
- Create: `src/components/layouts/buildItems.test.tsx`

**Interfaces:**
- Produces:
  - `export const BUILD_ITEM_ATTR = 'data-build-item'`
  - `export const BuildItemsContext = createContext(false)`
  - `useItemProps()`: with no editing context and `BuildItemsContext` true, it returns `(_, __) => ({ [BUILD_ITEM_ATTR]: '' })`. With no editing context and false, it still returns `NO_ITEM_PROPS`. Editing behaviour is unchanged.

- [ ] **Step 1: Write the failing test**

Render a card with a heading and a 4-item `bulletList` through `LayoutRenderer` inside `SlideBody` (follow the render helper in `components/layouts/newLayouts.test.tsx`), with `renderToStaticMarkup`.

```ts
it('marks each list item for the video when asked', () => {
  const marked = html(card, { buildItems: true })
  expect(marked.match(/data-build-item=""/g)).toHaveLength(4)
})
it('marks nothing on every other surface', () => {
  expect(html(card, { buildItems: false })).not.toContain('data-build-item')
})
```

`html(card, { buildItems })` wraps the tree in `<BuildItemsContext value={buildItems}>`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/layouts/buildItems.test.tsx`
Expected: FAIL, `BuildItemsContext` is not exported.

- [ ] **Step 3: Implement** the context and the `useItemProps` branch in `adjustContext.ts`.

- [ ] **Step 4: Run it and the layout guard tests**

Run: `npx vitest run src/components/layouts`
Expected: PASS (the guard tests are unchanged, because no surface sets the context yet).

- [ ] **Step 5: Commit**

```bash
git add src/components/layouts/adjustContext.ts src/components/layouts/buildItems.test.tsx
git commit -m "feat(layouts): video-only marker on list items for build steps"
```

---

### Task 5: Renderer captures build states and paints frames; wire it in

**Files:**
- Modify: `src/video/renderFrame.tsx`
- Modify: `src/video/generate.ts`
- Modify: `.claude/rules/video.md` (one bullet under "Narrated video")

**Interfaces:**
- Consumes: everything from Task 1. `MotionPort` (Task 3). `BuildItemsContext`, `BUILD_ITEM_ATTR` (Task 4). `FIXED_ELEMENT_ATTR`, and the `data-block-index` attribute from `adjustContext.ts`.
- Produces: `SlideRenderer` gains `paint(index: number, localSeconds: number, durationSeconds: number): void`. `draw(index, signal)` now captures every build state of slide `index` and paints its local time 0. `createSlideRenderer` also takes `stageColor: string` (the theme's `colors.deep`, used as slide 0's crossfade source).

- [ ] **Step 1: Wrap the video slide in `<BuildItemsContext value>`** inside `videoSlide`.

- [ ] **Step 2: Find the units after mount, in `draw`**

- Collect the holders: `stage.querySelectorAll('[data-block-index]:not([data-fixed-element])')`, sorted by the attribute's number.
- A holder with `[data-build-item]` descendants gives one unit per item, in DOM order. The holder's own non-item content arrives with its first item.
- Any other holder is one unit.
- The units list is the reading order.

- [ ] **Step 3: Capture the states**

- For k = 0 … `stepCountFor(units.length)`, set visibility so exactly the units with `stepOf(u) < k` show. The overlay (`[data-overlay]`) shows only at the last state.
- Hiding means `style.visibility = 'hidden'` on the holder or item. A shown item inside a hidden-by-default holder needs the holder set visible and its other items hidden explicitly.
- Then `toCanvas(stage, …)` with the same options as today, into its own `HTMLCanvasElement`.
- Restore styles after.
- Before capturing slide `index > 0`, copy the target canvas (the last frame painted for the slide before) into a kept `previous` canvas. Free the old state canvases when the next slide starts, and in `dispose`.
- Then `paint(index, 0, …)`.

- [ ] **Step 4: Implement `paint`**

- Compose `layerPlan(buildSchedule(stepCountFor(units), d), t)` into a scratch canvas: draw `states[base]`, then each blend with `globalAlpha = alpha`.
- On the target: draw `previous`, or fill `stageColor` for slide 0, at full alpha.
- Then the scratch canvas with `globalAlpha = crossfadeAlpha(t)` and the transform `scale(s)` about `cameraOrigin(index)` (`setTransform(s, 0, 0, s, x - s * x, y - s * y)`).
- Reset the transform and alpha after.

- [ ] **Step 5: Wire it in `generate.ts`**

- Pass `stageColor: o.deck.theme.colors.deep` to `createSlideRenderer`.
- Pass `motion: { frameStepSeconds: 1 / MOTION_FPS, paint: (i, t, d) => renderer.paint(i, t, d) }` to `generateVideo`.

- [ ] **Step 6: Add the rule bullet** to `.claude/rules/video.md`:

```
- **Motion** (spec `2026-11-22-video-motion-design.md`): slides build in (≤6 steps), push in 3% and crossfade, at 30 fps; the math is pure in `motion.ts`, quality comes from length in `sizeGuard.ts`. Build states are captures with parts set `visibility: hidden` (never removed, so geometry is identical); the last state must equal a plain capture. List items are marked only on the video surface (`BuildItemsContext`). Slide timings are unchanged by motion.
```

- [ ] **Step 7: Verify the whole project**

Run: `npm run build && npm run lint && npm run test`
Expected: all pass. Then `grep -l "mediabunny\|html-to-image" dist/assets/index-*.js` prints nothing: both libraries are only in lazy chunks.

- [ ] **Step 8: Commit**

```bash
git add src/video/renderFrame.tsx src/video/generate.ts .claude/rules/video.md
git commit -m "feat(video): slides build in, push in and crossfade in the narrated video"
```

---

### Task 6: Hand check (person in the loop)

Not automatable here (see CLAUDE.md "Not testable here").

- [ ] **Step 1:** `npm run dev`. Open a real ~10-slide deck with narration. Generate a video in three themes: one plain theme, one celestial (e.g. Moonlight), and a deck with a `hero` background photo. Note the generation time before (on `master`) and after.
- [ ] **Step 2:** Watch each video and check:
  - parts arrive in reading order;
  - no seams or boxes, including on the photo and the celestial backdrop;
  - no text cut off at the end of the push-in;
  - crossfades are smooth; the outro cut is hard;
  - ink arrives last;
  - sound stays in step to the last slide.
- [ ] **Step 3:** Open a lesson built on the deck. Checkpoints land on the same slides as before.
- [ ] **Step 4:** If a video took the `low` path, check that its text is sharp enough to read. Record the results in the spec's "Measured" section and commit.
