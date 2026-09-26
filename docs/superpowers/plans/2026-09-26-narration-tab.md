# Narration Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate `/deck/:id/narrate` page with a **Narration** tab beside **Design** in the editor's right panel.

**Architecture:** `ToolsPanel` gets an optional `tab` / `onTabChange` / `narrationTab` slot and renders both tab bodies mounted (the inactive one `hidden`), so a generation in flight is never aborted by a tab click. A new `NarrationTab` component owns the generation state, both modals and the script UI (today's `ScriptPanel` plus the logic in `NarratePage`) and follows the editor's current slide. `EditorPage` composes them; the old page, its route, its viewer and the "Narrate PPT" button are deleted, and the old URL redirects.

**Tech Stack:** React 19, TypeScript (`verbatimModuleSyntax`), Tailwind v4 (`app-*` tokens), zustand, Vitest (SSR render smoke tests, **no jsdom**), oxlint.

**Spec:** `docs/superpowers/specs/2026-09-26-narration-tab-design.md` (data rules still from `2026-09-02-narration-page-design.md`).

## Global Constraints

- No change to narration data or generation: `engine/narration.ts` (except the one new pure helper in Task 1), `store.applyGeneratedNarration`, `setNarrationText`, `resetNarration`, `ai/narrationPrompt.ts` and the provider call stay as they are.
- The tab follows `selectedCardId ?? activeCardId`. **No slide stepper** in the tab.
- Both tab bodies stay mounted; the inactive one is `hidden` (a generation in flight must survive a tab switch).
- Every tab button refuses focus on mousedown (`onMouseDown={(e) => e.preventDefault()}`), like every other button in `ToolsPanel`.
- The region's `aria-label` changes from `"Design"` to `"Tools"`.
- App chrome uses `app-*` tokens only; no `slide-*` tokens in the panel.
- `verbatimModuleSyntax`: type-only imports need `import type` (or an inline `type`); `erasableSyntaxOnly`: no constructor parameter properties.
- No jsdom. Tests are pure Vitest or `renderToStaticMarkup` smoke tests. `everyBlockRenders` and the existing `ToolsPanel` assertions must stay green unchanged.
- Commit steps below run only once the user has approved committing (this repo commits on request). Trailer for every commit: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Implementer subagents are dispatched with `model: "sonnet"`.

## Review Focus

1. **Slides added, deleted or reordered while a generation runs.** The editor stays live, and a generation's targets are positions in the sorted deck, so `applyGeneratedNarration` would write scripts onto slides the user never selected. Expected: nothing is applied and the user is told to try again. Pinned by `sameSlides` tests (Task 1) and its use in `runGeneration` (Task 2).
2. **The current slide disappears** (deleted, or an undo removed it) while the tab is showing it. Expected: the "Select a slide to write its script." state, not a crash or a stale script. Pinned in Task 2 (`cardId` that matches no card).
3. **Empty deck.** Expected: "This deck has no slides yet." and Generate-all disabled. Pinned in Task 2.
4. **Switching tabs mid-generation.** Expected: not cancelled. Pinned in Task 1 (the slot is rendered, hidden, while Design is selected). The cancel-on-unmount cleanup is in Task 2.
5. **Typing a script must not trigger editor shortcuts** (Backspace/Delete removing an element, Escape stepping selection, undo). Expected: the existing listener ignores `TEXTAREA` targets. Not testable without jsdom; a manual check in Task 4.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/engine/narration.ts` | Modify | Add pure `sameSlides` (guards Review Focus 1) |
| `src/engine/narration.test.ts` | Modify | Tests for `sameSlides` |
| `src/components/editor/ToolsPanel.tsx` | Modify | Tab row, two mounted bodies, `PanelTab` type |
| `src/components/editor/ToolsPanel.test.tsx` | Modify | Tab row and hidden-but-mounted tests |
| `src/components/editor/NarrationTab.tsx` | Create | Script UI + generation state + modals |
| `src/components/editor/NarrationTab.test.tsx` | Create | SSR smoke tests |
| `src/pages/EditorPage.tsx` | Modify | `panelTab` state, compose `NarrationTab` |
| `src/components/editor/TopBar.tsx` | Modify | Remove "Narrate PPT" |
| `src/App.tsx` | Modify | `NarrateRedirect` replaces `NarratePage` route |
| `src/pages/NarratePage.tsx` | **Delete** | |
| `src/components/narrate/ScriptPanel.tsx`, `SlideViewer.tsx`, `SlideCanvas.tsx` | **Delete** | folded into `NarrationTab` / unused |
| `src/lib/fitScale.ts`, `src/lib/fitScale.test.ts` | **Delete** | only `SlideCanvas` used it |
| `CLAUDE.md`, `docs/superpowers/specs/2026-09-02-narration-page-design.md` | Modify | Docs |

`GenerateScriptsModal.tsx` and `ConfirmReplaceModal.tsx` stay in `components/narrate/`, unchanged.

---

### Task 1: `sameSlides` helper and the tab row in `ToolsPanel`

**Files:**
- Modify: `src/engine/narration.ts` (append after `mergeNarration`)
- Modify: `src/engine/narration.test.ts`
- Modify: `src/components/editor/ToolsPanel.tsx` (import line 1, props at 119–176, header at 217–276, body at 278 and its closing at ~443)
- Modify: `src/components/editor/ToolsPanel.test.tsx`

**Interfaces:**
- Produces: `sameSlides(before: readonly string[], after: readonly string[]): boolean` from `@/engine/narration`.
- Produces: `export type PanelTab = 'design' | 'narration'` from `ToolsPanel.tsx`; `ToolsPanel` accepts `tab?: PanelTab` (default `'design'`), `onTabChange?: (tab: PanelTab) => void`, `narrationTab?: ReactNode`.
- Behaviour: the Narration tab button appears **only when `narrationTab` is passed** (otherwise it would open nothing). Panel and tab ids: `tools-tab-design`, `tools-tab-narration`, `tools-panel-design`, `tools-panel-narration`.

- [ ] **Step 1: Write the failing `sameSlides` tests**

In `src/engine/narration.test.ts` add `sameSlides,` to the import list (alphabetical, after `parseNarration`) and append:

```ts
describe('sameSlides', () => {
  it('is true for the same ids in the same order', () => {
    expect(sameSlides(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(true)
  })

  it('is true for two empty decks', () => {
    expect(sameSlides([], [])).toBe(true)
  })

  // A generation's targets are positions, so a deleted slide shifts every later script onto the wrong card.
  it('is false when a slide was removed', () => {
    expect(sameSlides(['a', 'b', 'c'], ['a', 'c'])).toBe(false)
  })

  it('is false when a slide was added', () => {
    expect(sameSlides(['a', 'b'], ['a', 'b', 'c'])).toBe(false)
  })

  it('is false when slides were reordered', () => {
    expect(sameSlides(['a', 'b', 'c'], ['a', 'c', 'b'])).toBe(false)
  })

  it('is false when one slide was swapped for another of the same count', () => {
    expect(sameSlides(['a', 'b'], ['a', 'z'])).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/engine/narration.test.ts`
Expected: FAIL (`sameSlides` is not exported / is not a function).

- [ ] **Step 3: Implement `sameSlides`**

Append to `src/engine/narration.ts`:

```ts
/**
 * Are these the same slides in the same order?
 *
 * A generation's targets are *positions* in the sorted deck, and the editor stays
 * live while one runs. If a slide was added, deleted or moved in the meantime,
 * position N is a different slide than the one the model was asked about, and
 * applying the result would write a script onto a slide the user never selected.
 * The caller compares the slide ids it started with against the ids now, and
 * applies nothing if they differ.
 */
export function sameSlides(before: readonly string[], after: readonly string[]): boolean {
  return before.length === after.length && before.every((id, i) => id === after[i])
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/engine/narration.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing `ToolsPanel` tab tests**

In `src/components/editor/ToolsPanel.test.tsx`:

a) Add a fifth parameter to `render` and spread it last into `<ToolsPanel …>`. Change the signature and the props end:

```tsx
import type { ComponentProps } from 'react'
```
(add to the imports at the top, with the other imports), then:

```tsx
function render(
  level: ToolbarLevel,
  withCard: boolean,
  textStyle: TextStyle = {},
  grid: EditorGrid = DEFAULT_GRID,
  extra: Partial<ComponentProps<typeof ToolsPanel>> = {},
) {
```
and after `onZoomChange={noop}` add `{...extra}` (last prop, before `/>`).

b) Append these tests inside `describe('ToolsPanel', …)`:

```tsx
  /* The opening tag that carries `id`, so an assertion can look at its attributes
     without depending on the order React prints them in. */
  function tagWithId(html: string, id: string): string {
    return html.match(new RegExp(`<[^>]*id="${id}"[^>]*>`))?.[0] ?? ''
  }

  it('offers only the Design tab when there is no narration slot', () => {
    const html = render(1, false)
    expect(tagWithId(html, 'tools-tab-design')).toContain('aria-selected="true"')
    expect(html).not.toContain('tools-tab-narration')
  })

  it('offers Design and Narration, with Design selected by default', () => {
    const html = render(1, false, {}, DEFAULT_GRID, { narrationTab: <p>SLOT</p> })
    expect(tagWithId(html, 'tools-tab-design')).toContain('aria-selected="true"')
    expect(tagWithId(html, 'tools-tab-narration')).toContain('aria-selected="false"')
    expect(html).toContain('>Narration<')
  })

  // Unmounting the slot on a tab switch would run NarrationTab's cleanup and abort a
  // generation the user only looked away from, so it is rendered and merely hidden.
  it('keeps the narration slot mounted, but hidden, while Design is selected', () => {
    const html = render(1, false, {}, DEFAULT_GRID, { narrationTab: <p>SLOT</p> })
    expect(html).toContain('SLOT')
    expect(tagWithId(html, 'tools-panel-narration')).toContain('hidden=""')
    expect(tagWithId(html, 'tools-panel-design')).not.toContain('hidden=""')
  })

  it('hides the Design sections, not unmounts them, while Narration is selected', () => {
    const html = render(1, false, {}, DEFAULT_GRID, { tab: 'narration', narrationTab: <p>SLOT</p> })
    expect(tagWithId(html, 'tools-tab-narration')).toContain('aria-selected="true"')
    expect(tagWithId(html, 'tools-panel-narration')).not.toContain('hidden=""')
    expect(tagWithId(html, 'tools-panel-design')).toContain('hidden=""')
    expect(html).toContain('>Typography<')
  })

  it('keeps the zoom in the header on the Narration tab too', () => {
    const html = render(1, false, {}, DEFAULT_GRID, { tab: 'narration', narrationTab: <p>SLOT</p> })
    expect(html.indexOf('aria-label="Zoom (50')).toBeLessThan(html.indexOf('SLOT'))
  })
```

- [ ] **Step 6: Run to verify they fail**

Run: `npx vitest run src/components/editor/ToolsPanel.test.tsx`
Expected: the five new tests FAIL (no `tools-tab-design` id yet); every pre-existing test still passes.

- [ ] **Step 7: Implement the tabs in `ToolsPanel.tsx`**

1. Export the type, just under `export type ToolbarLevel = 1 | 2 | 3`:

```tsx
/** Which body of the panel is showing. View state: not stored, not undoable. */
export type PanelTab = 'design' | 'narration'
```

2. Add three props to the destructuring list (after `onZoomChange,`) and to the props type (after the `onZoomChange` line):

```tsx
  tab = 'design',
  onTabChange,
  narrationTab,
```
```tsx
  /** Which tab is showing. Defaults to Design. */
  tab?: PanelTab
  onTabChange?: (tab: PanelTab) => void
  /**
   * The Narration tab's body. Supplied by the page so this panel knows nothing about
   * narration, and mounted even while hidden: unmounting it on a tab switch would
   * abort a generation in flight. With none, there is no Narration tab.
   */
  narrationTab?: ReactNode
```

3. Change `aria-label="Design"` (line 220) to `aria-label="Tools"`.

4. Replace the single-tab block (the comment and `<span …>Design</span>`, lines 242–246) with:

```tsx
          <div
            role="tablist"
            aria-label="Panel"
            className="flex items-center gap-3"
            onKeyDown={(e) => {
              // Two tabs, so either arrow just goes to the other one.
              if (!narrationTab || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
              e.preventDefault()
              const next: PanelTab = tab === 'design' ? 'narration' : 'design'
              onTabChange?.(next)
              document.getElementById(`tools-tab-${next}`)?.focus()
            }}
          >
            <TabButton id="tools-tab-design" panelId="tools-panel-design" selected={tab === 'design'} onSelect={() => onTabChange?.('design')}>
              Design
            </TabButton>
            {narrationTab && (
              <TabButton id="tools-tab-narration" panelId="tools-panel-narration" selected={tab === 'narration'} onSelect={() => onTabChange?.('narration')}>
                Narration
              </TabButton>
            )}
          </div>
```

5. Turn the body wrapper into the Design tabpanel. Replace line 278
`<div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">` with:

```tsx
      <div
        role="tabpanel"
        id="tools-panel-design"
        aria-labelledby="tools-tab-design"
        hidden={tab !== 'design'}
        className="scrollbar-none min-h-0 flex-1 overflow-y-auto"
      >
```
   (Do not add a `display` utility to this element: it would override `hidden`.)

6. After that wrapper's closing `</div>` (the one just before the closing `</div>` of the whole panel, after the Theme `</Section>`), add:

```tsx
      {narrationTab && (
        <div
          role="tabpanel"
          id="tools-panel-narration"
          aria-labelledby="tools-tab-narration"
          hidden={tab !== 'narration'}
          className="min-h-0 flex-1 overflow-hidden"
        >
          {narrationTab}
        </div>
      )}
```

7. Add `TabButton` next to `IconButton` (in the "structure" area of the file):

```tsx
/** One tab in the header row: the selected one carries the underline. Never takes focus from a run. */
function TabButton({
  id,
  panelId,
  selected,
  onSelect,
  children,
}: {
  id: string
  panelId: string
  selected: boolean
  onSelect: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={selected}
      aria-controls={panelId}
      tabIndex={selected ? 0 : -1}
      // Never take focus — see the note at the top of the file.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      className={`-mb-px flex h-9 cursor-pointer items-center border-b-2 text-[11px] font-semibold transition-colors ${FOCUS_RING} ${
        selected
          ? 'border-app-foreground text-app-foreground'
          : 'border-transparent text-app-muted hover:text-app-foreground'
      }`}
    >
      {children}
    </button>
  )
}
```

8. Update the file's header comment: in the bullet "The header holds what is not a property" change `a "Design" tab row` to `a "Design / Narration" tab row`.

- [ ] **Step 8: Run to verify everything passes**

Run: `npx vitest run src/components/editor/ToolsPanel.test.tsx src/engine/narration.test.ts`
Expected: PASS, including every pre-existing `ToolsPanel` test (`>Design<` still matches the tab button's text).

- [ ] **Step 9: Type-check and commit**

Run: `npx tsc -b`
Expected: no errors.

```bash
git add src/engine/narration.ts src/engine/narration.test.ts src/components/editor/ToolsPanel.tsx src/components/editor/ToolsPanel.test.tsx
git commit -m "feat(editor): Design/Narration tab row in the tools panel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `NarrationTab`

**Files:**
- Create: `src/components/editor/NarrationTab.tsx`
- Create: `src/components/editor/NarrationTab.test.tsx`

**Interfaces:**
- Consumes: `sameSlides` from `@/engine/narration` (Task 1); `GenerateScriptsModal({ cards, onClose, onGenerate(targets: Set<number>) })` and `ConfirmReplaceModal({ slides: number[], onBack, onClose, onConfirm })` from `@/components/narrate/*`; `narrationSlides(cards, targets)` from `@/ai/narrationPrompt`; `FallbackProvider`, `PROVIDER_CHAIN` from `@/ai/fallbackProvider`; `describeError`, `usePresentationStore` from `@/store/presentationStore`.
- Produces: `NarrationTab({ cards, cardId }: { cards: Card[]; cardId: string | null })`. `cards` must already be sorted by `orderIndex`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/editor/NarrationTab.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Card } from '@/engine/contentBlocks'
import { NarrationTab } from './NarrationTab'

/**
 * A render smoke test, and a deliberate exception to "pure logic only" like the
 * other editor panels: the failures worth catching are in what the tab draws for
 * which state (no slide, an empty deck, an edited script), which no pure function
 * can see. The gesture side (tab switching mid-generation, the modals opening
 * inside the panel) needs a browser and is not covered here.
 */

function card(id: string, orderIndex: number, narration?: { text: string; generated: string }): Card {
  return {
    id,
    orderIndex,
    blocks: [{ type: 'heading', text: `Slide ${orderIndex + 1}` }],
    layout: 'auto',
    visualStyle: 'structured',
    narration,
  }
}

const DECK = [
  card('a', 0, { text: 'Hello there', generated: 'Hello there' }),
  card('b', 1, { text: 'I rewrote this myself', generated: 'The AI version' }),
  card('c', 2),
]

/** The opening `<button …>` whose label starts with `text`, so its attributes can be read. */
function buttonTag(html: string, text: string): string {
  return html.match(new RegExp(`<button[^>]*>\\s*${text}`))?.[0] ?? ''
}

describe('NarrationTab', () => {
  it('says so when the deck has no slides, and offers no generation', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={[]} cardId={null} />)
    expect(html).toContain('This deck has no slides yet.')
    expect(buttonTag(html, 'Generate scripts for all slides')).toContain('disabled=""')
  })

  it('asks for a slide when none is selected, and disables only the single-slide button', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId={null} />)
    expect(html).toContain('Select a slide to write its script.')
    expect(buttonTag(html, 'Generate script for this slide only')).toContain('disabled=""')
    expect(buttonTag(html, 'Generate scripts for all slides')).not.toContain('disabled=""')
  })

  // The selected slide can vanish while the tab is showing it (a delete, or an undo).
  it('treats a slide id that matches nothing as no selection, not a crash', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="gone" />)
    expect(html).toContain('Select a slide to write its script.')
  })

  it('shows the selected slide by its position, with its script and length', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="a" />)
    expect(html).toContain('Slide 1 script')
    expect(html).toContain('Hello there')
    expect(html).toContain('2 words')
    expect(buttonTag(html, 'Generate script for this slide only')).not.toContain('disabled=""')
  })

  it('marks a generated script as generated, with nothing to reset', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="a" />)
    expect(html).toContain('>Generated<')
    expect(html).not.toContain('Reset to generated')
  })

  it('marks a hand-edited script, and offers to put the generated one back', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="b" />)
    expect(html).toContain('Slide 2 script')
    expect(html).toContain('>Edited by you<')
    expect(html).toContain('Reset to generated')
  })

  it('says a slide with no script has none', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="c" />)
    expect(html).toContain('>No script yet<')
    expect(html).toContain('0 words')
  })

  it('names the textarea for the slide it belongs to', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="b" />)
    expect(html).toContain('aria-label="Script for slide 2"')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/editor/NarrationTab.test.tsx`
Expected: FAIL (cannot resolve `./NarrationTab`).

- [ ] **Step 3: Implement `NarrationTab`**

Create `src/components/editor/NarrationTab.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { describeError, usePresentationStore } from '@/store/presentationStore'
import { FallbackProvider, PROVIDER_CHAIN } from '@/ai/fallbackProvider'
import { narrationSlides } from '@/ai/narrationPrompt'
import { isResettable, narrationStatus, sameSlides, type NarrationStatus } from '@/engine/narration'
import { formatDuration, speakingSeconds, wordCount } from '@/lib/speakingTime'
import { Button } from '@/components/ui/Button'
import { GenerateScriptsModal } from '@/components/narrate/GenerateScriptsModal'
import { ConfirmReplaceModal } from '@/components/narrate/ConfirmReplaceModal'
import type { Card } from '@/engine/contentBlocks'

const STATUS_LABEL: Record<NarrationStatus, string> = {
  empty: 'No script yet',
  generated: 'Generated',
  edited: 'Edited by you',
}

const STATUS_CLASS: Record<NarrationStatus, string> = {
  empty: 'text-app-muted',
  generated: 'text-app-accent-text',
  edited: 'text-app-highlight-text',
}

/** The slide ids in deck order, read fresh from the store (not from a render's closure). */
function currentSlideIds(): string[] {
  return [...usePresentationStore.getState().cards]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((c) => c.id)
}

/**
 * The Narration tab of the editor's right panel: one slide's spoken script, and the
 * two ways to generate. It writes for the slide the editor is on (`cardId`), so there
 * is no slide stepper here — the canvas beside it is the viewer.
 *
 * It owns everything the old narration page owned: the generation request and its
 * `AbortController`, the choose-slides dialog and the confirm-replace dialog. It
 * must stay mounted while the panel shows another tab (`ToolsPanel` keeps it
 * mounted, hidden), or switching tabs would abort a request the user only looked
 * away from.
 *
 * `cards` must already be sorted by `orderIndex`.
 */
export function NarrationTab({ cards, cardId }: { cards: Card[]; cardId: string | null }) {
  const title = usePresentationStore((s) => s.title)
  const status = usePresentationStore((s) => s.status)
  const errorMessage = usePresentationStore((s) => s.errorMessage)
  const setNarrationText = usePresentationStore((s) => s.setNarrationText)
  const resetNarration = usePresentationStore((s) => s.resetNarration)
  const applyGeneratedNarration = usePresentationStore((s) => s.applyGeneratedNarration)

  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [confirmingOne, setConfirmingOne] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Cancelling has to stop the request, not just stop listening to it —
  // otherwise scripts the user walked away from land and overwrite the deck.
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const index = cardId === null ? -1 : cards.findIndex((c) => c.id === cardId)
  const card = index >= 0 ? cards[index] : undefined
  const narration = card?.narration
  const text = narration?.text ?? ''
  const words = wordCount(text)
  const scriptStatus = narrationStatus(narration)

  /**
   * Runs one generation over an explicit set of 0-based slide positions.
   *
   * The set is the whole of the user's intent and travels all the way through:
   * `narrationSlides` marks everything outside it SKIP so the model still sees
   * the deck for continuity but is asked for nothing else, and
   * `applyGeneratedNarration` refuses to write outside it whatever comes back.
   * One slide or twenty is the same code path — the only difference is the size
   * of the set.
   *
   * The editor stays live while this runs, and the set is *positions*. If a slide
   * is added, deleted or moved before the reply lands, position N is no longer the
   * slide the model was asked about, so nothing is applied (see `sameSlides`).
   */
  async function runGeneration(targets: Set<number>) {
    if (targets.size === 0) return
    if (PROVIDER_CHAIN.length === 0) {
      setError(
        'No AI provider is configured. Add VITE_ANTHROPIC_API_KEY, VITE_GROQ_API_KEY, or VITE_GEMINI_API_KEY to your .env file.',
      )
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    const startIds = cards.map((c) => c.id)
    setGenerating(true)
    setError(null)

    try {
      const provider = new FallbackProvider(PROVIDER_CHAIN)
      const response = await provider.generateNarration(
        title,
        narrationSlides(cards, targets),
        controller.signal,
      )
      if (controller.signal.aborted) return
      if (!sameSlides(startIds, currentSlideIds())) {
        setError(
          'Slides were added, removed or reordered while the scripts were being written, so nothing was applied. Try again.',
        )
        return
      }
      applyGeneratedNarration(response.scripts, targets)
    } catch (err) {
      // A cancel is a return to the panel, not a failure to report.
      if (controller.signal.aborted) return
      setError(describeError(err))
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setGenerating(false)
    }
  }

  // A narration script is typed by hand and can never be regenerated the way a
  // deck can, so a save that fails silently is the worst outcome here: the text
  // looks saved, and it is gone on reload with nothing said. It is also how a
  // missing migration 0008 announces itself. Save failure first: it describes
  // work already done and unrecoverable, so it outranks a stale generation error
  // (`error` is only cleared when the NEXT generation starts).
  const saveError = status === 'error' ? (errorMessage ?? 'Your changes could not be saved.') : null
  const shownError = saveError ?? error

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-app-border px-3 py-2.5">
        {generating ? (
          <>
            <Button variant="secondary" onClick={() => abortRef.current?.abort()} className="w-full">
              Cancel
            </Button>
            <p className="mt-2 text-xs text-app-muted">Writing narration…</p>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <Button
              variant="secondary"
              // One slide is just a one-element target set — same path, same
              // guarantees. The confirm is the same one the dialog uses: a
              // narrower action must not be the one that destroys hand-written
              // words silently.
              onClick={() => {
                if (!card) return
                if (narrationStatus(card.narration) === 'edited') setConfirmingOne(true)
                else void runGeneration(new Set([index]))
              }}
              disabled={!card}
              className="w-full"
              title="Write a script for the selected slide"
            >
              Generate script for this slide only
            </Button>
            <Button
              variant="primary"
              onClick={() => setChoosing(true)}
              disabled={cards.length === 0}
              className="w-full"
              title="Choose which slides to write"
            >
              Generate scripts for all slides
            </Button>
          </div>
        )}
        {shownError && (
          <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{shownError}</p>
        )}
      </div>

      {card ? (
        <div className="flex min-h-0 flex-1 flex-col px-3 py-2.5">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <h2 className="text-[11px] font-semibold text-app-foreground">Slide {index + 1} script</h2>
            {isResettable(narration) && (
              <button
                type="button"
                onClick={() => resetNarration(card.id)}
                className="rounded-app-sm text-[11px] text-app-muted underline transition-colors hover:text-app-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
                title="Put the AI's version back"
              >
                Reset to generated
              </button>
            )}
          </div>

          <p className={`mb-2 text-[11px] ${STATUS_CLASS[scriptStatus]}`}>{STATUS_LABEL[scriptStatus]}</p>

          <textarea
            value={text}
            onChange={(e) => setNarrationText(card.id, e.target.value)}
            aria-label={`Script for slide ${index + 1}`}
            placeholder="What the narrator says while this slide is on screen."
            className="scrollbar-subtle min-h-0 flex-1 resize-none rounded-app border border-app-border bg-app-background p-3 text-sm leading-relaxed text-app-foreground outline-none focus:border-app-accent"
          />

          <p className="mt-2 text-[11px] text-app-muted">
            {words} {words === 1 ? 'word' : 'words'} · ~{formatDuration(speakingSeconds(text))}
          </p>
        </div>
      ) : (
        <p className="px-3 py-4 text-xs text-app-muted">
          {cards.length === 0 ? 'This deck has no slides yet.' : 'Select a slide to write its script.'}
        </p>
      )}

      {confirmingOne && (
        <ConfirmReplaceModal
          slides={[index + 1]}
          onBack={() => setConfirmingOne(false)}
          onClose={() => setConfirmingOne(false)}
          onConfirm={() => {
            setConfirmingOne(false)
            void runGeneration(new Set([index]))
          }}
        />
      )}

      {choosing && (
        <GenerateScriptsModal
          cards={cards}
          onClose={() => setChoosing(false)}
          onGenerate={(targets) => {
            setChoosing(false)
            void runGeneration(targets)
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/editor/NarrationTab.test.tsx`
Expected: PASS (8 tests). If `buttonTag` finds nothing for a button, print `html` and check that `Button` renders its label directly after the opening tag (it does when `loading` is false).

- [ ] **Step 5: Type-check, lint, commit**

Run: `npx tsc -b && npm run lint`
Expected: no errors. (`ScriptPanel` and `NarratePage` still exist and still compile; they go in Task 3.)

```bash
git add src/components/editor/NarrationTab.tsx src/components/editor/NarrationTab.test.tsx
git commit -m "feat(editor): NarrationTab, the narration script UI as a panel body

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Wire it into the editor, remove the page

**Files:**
- Modify: `src/pages/EditorPage.tsx` (import at line 17, state near line 86, `<ToolsPanel` props at ~922–991)
- Modify: `src/components/editor/TopBar.tsx` (lines 1 and 131–133)
- Modify: `src/App.tsx` (import line 8, route at ~96–103)
- Delete: `src/pages/NarratePage.tsx`, `src/components/narrate/ScriptPanel.tsx`, `src/components/narrate/SlideViewer.tsx`, `src/components/narrate/SlideCanvas.tsx`, `src/lib/fitScale.ts`, `src/lib/fitScale.test.ts`

**Interfaces:**
- Consumes: `ToolsPanel` `tab` / `onTabChange` / `narrationTab` and `PanelTab` (Task 1); `NarrationTab` (Task 2).

- [ ] **Step 1: Confirm nothing else uses what is being deleted**

Run: `grep -rn "SlideViewer\|SlideCanvas\|fitScale\|ScriptPanel\|NarratePage" src --include=*.ts --include=*.tsx`
Expected: matches only inside the six files listed for deletion plus `App.tsx`. Anything else means stop and report.

- [ ] **Step 2: Wire `EditorPage`**

a) Line 17 becomes:
```tsx
import { ToolsPanel, type PanelTab } from '@/components/editor/ToolsPanel'
import { NarrationTab } from '@/components/editor/NarrationTab'
```

b) Next to the other view state (after `const [grid, setGrid] = useState<EditorGrid>(DEFAULT_GRID)` at line 88) add:
```tsx
  // Which tab the right panel shows. View state like zoom and grid: not stored, not undoable.
  const [panelTab, setPanelTab] = useState<PanelTab>('design')
```

c) In the `<ToolsPanel …>` element, after the `onZoomChange={…}` prop, add:
```tsx
                tab={panelTab}
                onTabChange={setPanelTab}
                // The slide the editor is on: the selected one, else the outline's active
                // one (the same rule the pen uses). No stepper — the canvas is the viewer.
                narrationTab={<NarrationTab cards={sortedCards} cardId={selectedCardId ?? activeCardId} />}
```

- [ ] **Step 3: Remove "Narrate PPT" from `TopBar`**

In `src/components/editor/TopBar.tsx` delete these lines:
```tsx
        <Link to={`/deck/${presentationId}/narrate`}>
          <Button variant="primary">Narrate PPT</Button>
        </Link>
```
`Link` is still used (line 46), so keep the import. `presentationId` is still used by that other `Link`; if `npm run lint` reports it unused, remove it from the props and from `EditorPage`'s `<TopBar …>` call.

- [ ] **Step 4: Replace the route with a redirect in `App.tsx`**

Change the imports: remove `import { NarratePage } from '@/pages/NarratePage'` and change line 2 to
```tsx
import { BrowserRouter, Navigate, Routes, Route, useParams } from 'react-router-dom'
```
Add above `function teacherOnly`:
```tsx
/** The narration page is gone; its script lives in the editor's Narration tab. Old links land on the deck. */
function NarrateRedirect() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={id ? `/deck/${id}` : '/'} replace />
}
```
and change the route's element from `<NarratePage />` to `<NarrateRedirect />` (keep it inside `<RequireAuth>` so a signed-out visitor is sent to login first).

- [ ] **Step 5: Delete the dead files**

```bash
git rm src/pages/NarratePage.tsx src/components/narrate/ScriptPanel.tsx src/components/narrate/SlideViewer.tsx src/components/narrate/SlideCanvas.tsx src/lib/fitScale.ts src/lib/fitScale.test.ts
```

- [ ] **Step 6: Verify the whole project**

Run: `npm run build && npm run lint && npm run test`
Expected: all three succeed. `build` type-checks (`tsc -b`) before bundling, so a dangling import of a deleted file fails here.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(editor): narration moves into the tools panel; the narrate page is removed

/deck/:id/narrate now redirects to the editor.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Docs and manual browser check

**Files:**
- Modify: `CLAUDE.md` (the "Narration page" section at ~180–188, the Editor bullet at ~166, the `TopBar` sentence, two "narration page" mentions at ~28 and ~82)
- Modify: `docs/superpowers/specs/2026-09-02-narration-page-design.md` (line 1–3)
- Modify: `docs/superpowers/specs/2026-09-26-narration-tab-design.md` (add the mid-generation section)

- [ ] **Step 1: Rewrite the `CLAUDE.md` narration section**

Replace the heading and opening paragraph:

```markdown
## Narration tab (`components/editor/NarrationTab.tsx`, `engine/narration.ts`, `ai/narrationPrompt.ts`)

The **Narration** tab beside **Design** in the editor's right panel: the per-slide spoken script for a cloned voice. (It replaced the `/deck/:id/narrate` page, which now redirects to the editor.) Most decks arrive already narrated (from `speakerNotes`); the tab's own call fills blanks or regenerates chosen slides. Design: `docs/superpowers/specs/2026-09-26-narration-tab-design.md` (data rules: `2026-09-02-narration-page-design.md`).
```

Replace the **Read-only by omission** bullet with:

```markdown
- **The tab writes for the slide the editor is on**: `selectedCardId ?? activeCardId` (the pen's rule), no stepper — the canvas is the viewer. `ToolsPanel` takes the tab as a `narrationTab` slot and keeps it **mounted while hidden** (`hidden`, not unmounted), because `NarrationTab` owns the `AbortController` and its cleanup aborts on unmount; unmounting on a tab switch would silently cancel a request. **Positions are what a generation targets, and the editor stays live**: `runGeneration` records the slide ids at the start and applies nothing if `sameSlides` says they changed before the reply landed.
```

In the last bullet replace `` `NarratePage` calls `flushScheduledSaves()` on unmount.`` with ``The editor's own unmount and `beforeunload` flush already covers a typed script.`` (keep the rest of the bullet).

- [ ] **Step 2: Fix the other mentions**

- Editor bullet: `then a "Design" tab row with the **zoom on its right**` → `then a "Design / Narration" tab row with the **zoom on its right** (both tabs stay mounted; Narration is a slot the page supplies)`.
- `TopBar` sentence: delete `, Narrate PPT link` at the end of the list (leaving `…icon-only Export (spinner replaces glyph), theme toggle.`).
- Line ~28 and ~82: `and the narration page` → `and the Narration tab`.

- [ ] **Step 3: Mark the old spec superseded**

Insert as the first line under the title in `docs/superpowers/specs/2026-09-02-narration-page-design.md`:

```markdown
> **Superseded in part (2026-09-26):** the page and its slide viewer no longer exist; narration is a tab in the editor's right panel — see `2026-09-26-narration-tab-design.md`. The data rules below (script shape, statuses, merge, token budgets) still apply.
```

- [ ] **Step 4: Add the hardening to the new spec**

Append to `docs/superpowers/specs/2026-09-26-narration-tab-design.md`, before "Out of scope":

```markdown
## Slides changing during a generation (added while planning)

The old page could not change the deck while a generation ran; the editor can. A generation's
targets are *positions* in the sorted deck, so a slide added, deleted or moved before the reply
lands would put a script on a slide the user never selected — breaking the feature's core invariant.
`runGeneration` records the slide ids at the start; on completion, `sameSlides(startIds, nowIds)`
(pure, in `engine/narration.ts`, tested) must hold or **nothing is applied** and the tab says: "Slides
were added, removed or reordered while the scripts were being written, so nothing was applied. Try
again." Text edits to a targeted slide during the request are not guarded (the old page had the same
behaviour: the generated script replaces it).
```

- [ ] **Step 5: Verify and commit the docs**

Run: `npm run lint && npm run test`
Expected: PASS (docs only; confirms nothing regressed).

```bash
git add CLAUDE.md docs/superpowers/specs
git commit -m "docs: narration is a tab in the editor, not a page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Manual browser check (not covered by tests — no jsdom)**

Run `npm run dev`, open a deck in the editor, and confirm each:
1. The header shows `Design | Narration`; zoom stays on the right for both; Design looks and works as before.
2. Clicking a slide, then **Narration**, shows "Slide N script"; clicking another slide switches the script.
3. Typing a script, then clicking another slide and back, shows the text (saved). Backspace, Delete and Escape inside the box do not remove or deselect anything on the canvas.
4. "Generate script for this slide only" on an **edited** slide asks first; on others it runs. "Generate scripts for all slides" opens the dialog **centred on the screen** (not clipped by the panel).
5. Start a generation, switch to **Design** and back: the request is still running (Cancel visible); Cancel stops it.
6. Start a generation, delete a slide in the outline before it finishes: the tab reports the "nothing was applied" message and no script changed.
7. Collapse the panel with the arrow mid-generation: it keeps running.
8. Visiting `/deck/<id>/narrate` lands on `/deck/<id>`. The top bar no longer has "Narrate PPT".

Report anything that fails; do not mark the task done on a partial pass.
