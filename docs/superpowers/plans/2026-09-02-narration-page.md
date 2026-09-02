# Narration Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/deck/:id/narrate` page pairing a read-only, presenter-stepped slide viewer on the left with an AI-written, hand-editable narration script panel on the right.

**Architecture:** Narration is a new optional field on `Card` holding two strings — the current script and the generated one it came from — so "edited", "regenerable" and "resettable" are all derived rather than flagged. A `generateNarration` method joins `generateDeck` on the existing `AIProvider` interface, inheriting the Groq→Gemini fallback, retry and abort machinery unchanged. Read-only rendering on the left is achieved by *omitting* the editor's `TextEditingContext` and the interaction half of `BlockAdjustContext`, not by threading a `readOnly` prop through twelve layout components.

**Tech Stack:** React 19, TypeScript (`verbatimModuleSyntax`, `erasableSyntaxOnly`), zustand, zod v4, react-router-dom v7, Tailwind v4 (CSS-configured), Vitest, Supabase.

**Spec:** `docs/superpowers/specs/2026-09-02-narration-page-design.md`

## Global Constraints

- **Path alias:** `@/*` → `src/*`. Use it in all imports; never write deep relative paths.
- **`verbatimModuleSyntax: true`** — every type-only import MUST use `import type { X } from '...'` or `import { type X }`.
- **`erasableSyntaxOnly: true`** — no constructor parameter properties. Write `private apiKey: string` as a field and assign it in the constructor body, as `GroqProvider` does.
- **No component or integration tests.** This repo tests pure, high-value logic only. Do not add React Testing Library or write tests that render components.
- **Token namespaces:** app chrome uses `app-*` classes (`bg-app-background`, `text-app-muted`, `rounded-app`); slide content uses `slide-*` classes and only inside a `ThemeProvider`. Never mix them.
- **Never reintroduce `aspect-video`** on a card container. Cards size to their content.
- **The generate-once rule still holds:** no code path added here may regenerate a card's `blocks`.
- **Commands:** `npm run test` (vitest run), `npx tsc -b` (typecheck), `npm run lint` (oxlint). All three must pass before any commit.
- **Commit message footer** — every commit in this plan ends with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_012xarEEiXiSkZzuqQYnVPGw
  ```

## File Structure

| File | Responsibility |
|---|---|
| `src/engine/narration.ts` | **Create.** Schema, derived status, the merge rule. Pure. Generic over a structural type so `contentBlocks.ts` can import it without a cycle. |
| `src/lib/speakingTime.ts` | **Create.** Word count → estimated seconds → display string. Pure. |
| `src/engine/contentBlocks.ts` | **Modify.** Add `narration` to `cardSchema`. |
| `supabase/migrations/0008_add_card_narration.sql` | **Create.** Adds the `narration` jsonb column. |
| `src/store/presentationStore.ts` | **Modify.** `cardRow`/`cardFromRow` round-trip; three new store methods. |
| `src/ai/provider.ts` | **Modify.** `NarrationSlide`, `narrationResponseSchema`, `generateNarration` on `AIProvider`. |
| `src/ai/narrationPrompt.ts` | **Create.** System prompt, user-prompt builder, `narrationSlides(cards)`. |
| `src/ai/groqProvider.ts` | **Modify.** Implement `generateNarration`. |
| `src/ai/geminiProvider.ts` | **Modify.** Implement `generateNarration`. |
| `src/ai/fallbackProvider.ts` | **Modify.** Implement `generateNarration` with the same failover rule. |
| `src/components/narrate/SlideViewer.tsx` | **Create.** Left column: read-only stepped slide. |
| `src/components/narrate/ScriptPanel.tsx` | **Create.** Right column: slide list, Generate all, current script. |
| `src/pages/NarratePage.tsx` | **Create.** Split shell, navigation state, `AbortController`. |
| `src/App.tsx` | **Modify.** Add the route. |
| `src/components/editor/TopBar.tsx` | **Modify.** Enable the Narrate PPT button. |
| `CLAUDE.md` | **Modify.** Document the feature and the 0008 migration hazard. |

---

### Task 1: Narration data model (pure)

The schema plus every derived question about a script. Generic over a structural type, **not** `Card`: `contentBlocks.ts` will import this file, so importing `Card` back would be a circular import.

**Files:**
- Create: `src/engine/narration.ts`
- Test: `src/engine/narration.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `narrationSchema: z.ZodObject` and `type Narration = { text: string; generated?: string }`
  - `type NarrationStatus = 'empty' | 'generated' | 'edited'`
  - `narrationStatus(n: Narration | undefined): NarrationStatus`
  - `isRegenerable(n: Narration | undefined): boolean`
  - `isResettable(n: Narration | undefined): boolean`
  - `parseNarration(raw: unknown): Narration | undefined`
  - `type GeneratedScript = { slide: number; text: string }`
  - `mergeNarration<T extends { narration?: Narration }>(cards: T[], scripts: GeneratedScript[]): T[]`

- [ ] **Step 1: Write the failing test**

Create `src/engine/narration.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  isRegenerable,
  isResettable,
  mergeNarration,
  narrationStatus,
  parseNarration,
  type Narration,
} from './narration'

describe('narrationStatus', () => {
  it('is empty when there is no narration at all', () => {
    expect(narrationStatus(undefined)).toBe('empty')
  })

  it('is generated when the text still matches what the AI wrote', () => {
    expect(narrationStatus({ text: 'Hello there.', generated: 'Hello there.' })).toBe('generated')
  })

  it('is edited when the text has diverged from the generated copy', () => {
    expect(narrationStatus({ text: 'My words.', generated: 'AI words.' })).toBe('edited')
  })

  it('is edited when text was typed by hand with nothing generated', () => {
    expect(narrationStatus({ text: 'Typed from scratch.' })).toBe('edited')
  })

  /*
    The chip has to predict what "Generate all" will do. A blanked script IS
    rewritten, so reporting it as `edited` would be a lie the user only
    discovers after pressing the button.
  */
  it('is empty when the text is blank even though a generated copy survives', () => {
    expect(narrationStatus({ text: '   ', generated: 'AI words.' })).toBe('empty')
  })
})

describe('isRegenerable', () => {
  it('regenerates a slide that has never been written', () => {
    expect(isRegenerable(undefined)).toBe(true)
  })

  it('regenerates a slide still holding the AI version untouched', () => {
    expect(isRegenerable({ text: 'AI words.', generated: 'AI words.' })).toBe(true)
  })

  it('regenerates a deliberately blanked slide', () => {
    expect(isRegenerable({ text: '', generated: 'AI words.' })).toBe(true)
  })

  it('never regenerates a hand-edited slide', () => {
    expect(isRegenerable({ text: 'My words.', generated: 'AI words.' })).toBe(false)
  })
})

describe('isResettable', () => {
  it('offers reset once an edit has diverged from the generated copy', () => {
    expect(isResettable({ text: 'My words.', generated: 'AI words.' })).toBe(true)
  })

  it('still offers reset on a blanked slide, so blanking cannot lose the AI copy', () => {
    expect(isResettable({ text: '', generated: 'AI words.' })).toBe(true)
  })

  it('offers nothing to reset to when the AI never wrote this slide', () => {
    expect(isResettable({ text: 'Typed from scratch.' })).toBe(false)
  })

  it('offers nothing when the text already is the generated copy', () => {
    expect(isResettable({ text: 'AI words.', generated: 'AI words.' })).toBe(false)
  })
})

describe('parseNarration', () => {
  it('reads a stored value back', () => {
    expect(parseNarration({ text: 'a', generated: 'b' })).toEqual({ text: 'a', generated: 'b' })
  })

  /*
    The column defaults to '{}', so every row written before migration 0008
    reads back as an empty object. "Has a narration column" is not the same
    question as "has a script" — the same distinction `parseAdjusts` draws.
  */
  it('maps the default empty object to undefined', () => {
    expect(parseNarration({})).toBeUndefined()
  })

  it('maps malformed values to undefined rather than throwing', () => {
    expect(parseNarration(null)).toBeUndefined()
    expect(parseNarration('a script')).toBeUndefined()
    expect(parseNarration({ text: 42 })).toBeUndefined()
  })
})

describe('mergeNarration', () => {
  const cards = (): { id: string; narration?: Narration }[] => [
    { id: 'a' },
    { id: 'b', narration: { text: 'My words.', generated: 'Old AI words.' } },
    { id: 'c', narration: { text: 'Old AI words.', generated: 'Old AI words.' } },
  ]

  it('writes a script into a slide that had none', () => {
    const out = mergeNarration(cards(), [{ slide: 1, text: 'Fresh.' }])
    expect(out[0].narration).toEqual({ text: 'Fresh.', generated: 'Fresh.' })
  })

  it('rewrites a slide still holding an untouched generated script', () => {
    const out = mergeNarration(cards(), [{ slide: 3, text: 'New AI words.' }])
    expect(out[2].narration).toEqual({ text: 'New AI words.', generated: 'New AI words.' })
  })

  /*
    THE load-bearing rule. The prompt asks the model to leave edited slides
    alone, but a prompt is a request; this is the invariant. Deleting the
    guard in mergeNarration must fail this test.
  */
  it('drops a script aimed at a hand-edited slide', () => {
    const out = mergeNarration(cards(), [{ slide: 2, text: 'Model tried to overwrite.' }])
    expect(out[1].narration).toEqual({ text: 'My words.', generated: 'Old AI words.' })
  })

  it('ignores a slide number that matches no card', () => {
    const out = mergeNarration(cards(), [{ slide: 99, text: 'Nowhere.' }])
    expect(out).toEqual(cards())
  })

  it('ignores a slide number below the first slide', () => {
    const out = mergeNarration(cards(), [{ slide: 0, text: 'Nowhere.' }])
    expect(out).toEqual(cards())
  })

  it('leaves the input array untouched', () => {
    const input = cards()
    mergeNarration(input, [{ slide: 1, text: 'Fresh.' }])
    expect(input[0].narration).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/narration.test.ts`
Expected: FAIL — `Failed to resolve import "./narration"`.

- [ ] **Step 3: Write the implementation**

Create `src/engine/narration.ts`:

```ts
import { z } from 'zod'

/**
 * One slide's narration: the script a voice will read, and the AI's version of
 * it.
 *
 * Two strings rather than a string and an `edited` flag. Everything the UI asks
 * about a script — is it edited, will regenerate rewrite it, can it be reset —
 * is derivable from these two, and a derived value cannot fall out of sync with
 * the thing it describes.
 *
 * `generated` is what makes Reset literal: without it, "reset" could only clear
 * the field and wait for the next generation to refill it.
 */
export const narrationSchema = z.object({
  text: z.string(),
  generated: z.string().optional(),
})

export type Narration = z.infer<typeof narrationSchema>

export type NarrationStatus = 'empty' | 'generated' | 'edited'

/**
 * What the panel's status chip shows for one slide.
 *
 * A blank `text` reads as `empty` even when `generated` survives, because the
 * chip predicts what "Generate all" will do — and a blanked script is rewritten.
 * Calling it `edited` would be a lie the user only discovers afterwards.
 */
export function narrationStatus(n: Narration | undefined): NarrationStatus {
  if (!n || n.text.trim() === '') return 'empty'
  if (n.text === n.generated) return 'generated'
  return 'edited'
}

/** Will "Generate all scripts" write over this slide? */
export function isRegenerable(n: Narration | undefined): boolean {
  return narrationStatus(n) !== 'edited'
}

/** Is there a generated version to go back to, different from what is there now? */
export function isResettable(n: Narration | undefined): boolean {
  return n !== undefined && n.generated !== undefined && n.text !== n.generated
}

/**
 * One stored `narration` value as the app's `Narration`.
 *
 * The column defaults to `'{}'`, so every row written before migration 0008
 * reads back as an empty object — which is a card with no script, not a card
 * with an empty one. Same distinction `parseAdjusts` draws, and for the same
 * reason: an empty-but-present script would show a whole deck as narrated.
 */
export function parseNarration(raw: unknown): Narration | undefined {
  const parsed = narrationSchema.safeParse(raw)
  if (!parsed.success) return undefined
  if (parsed.data.text === '' && parsed.data.generated === undefined) return undefined
  return parsed.data
}

/**
 * One script from the model, addressed by the 1-based slide number the prompt
 * showed it. Named `slide` rather than `index` precisely so it cannot be
 * mistaken for an array index at a call site.
 */
export interface GeneratedScript {
  slide: number
  text: string
}

/**
 * Folds generated scripts into a deck, in slide order.
 *
 * `cards` MUST already be sorted by `orderIndex`: `slide` is the 1-based
 * position the model was shown, and this is the single place that number
 * becomes an array index.
 *
 * The guard is the whole guarantee of the feature: a script is applied **only**
 * to a regenerable slide, whatever the model returned. The prompt asks it to
 * leave edited slides alone, but a prompt is a request and losing the user's
 * writing is unrecoverable — nothing here can be generated a second time.
 */
export function mergeNarration<T extends { narration?: Narration }>(
  cards: T[],
  scripts: GeneratedScript[],
): T[] {
  const byIndex = new Map<number, string>()
  for (const s of scripts) byIndex.set(s.slide - 1, s.text)

  return cards.map((card, i) => {
    const text = byIndex.get(i)
    if (text === undefined || !isRegenerable(card.narration)) return card
    return { ...card, narration: { text, generated: text } }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/narration.test.ts`
Expected: PASS — all 22 tests green.

- [ ] **Step 5: Verify the merge guard is actually load-bearing**

Temporarily delete `|| !isRegenerable(card.narration)` from `mergeNarration`, re-run the test, and confirm **"drops a script aimed at a hand-edited slide"** FAILS. Then restore it and re-run to confirm PASS. A guard whose removal no test notices is not protected.

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc -b && npm run lint`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add src/engine/narration.ts src/engine/narration.test.ts
git commit -m "$(cat <<'EOF'
Add the narration data model

Two strings per slide — the current script and the generated one it came from —
so edited/regenerable/resettable are all derived rather than flagged, and Reset
can restore the AI's version literally.

mergeNarration applies a generated script only to a regenerable slide whatever
the model returned. The prompt asks it to leave edited slides alone, but a
prompt is a request; losing the user's writing is unrecoverable.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012xarEEiXiSkZzuqQYnVPGw
EOF
)"
```

---

### Task 2: Speaking-time estimate (pure)

**Files:**
- Create: `src/lib/speakingTime.ts`
- Test: `src/lib/speakingTime.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `wordCount(text: string): number`, `speakingSeconds(text: string): number`, `formatDuration(seconds: number): string`

- [ ] **Step 1: Write the failing test**

Create `src/lib/speakingTime.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatDuration, speakingSeconds, wordCount } from './speakingTime'

describe('wordCount', () => {
  it('counts plain words', () => {
    expect(wordCount('one two three')).toBe(3)
  })

  it('is zero for blank and whitespace-only text', () => {
    expect(wordCount('')).toBe(0)
    expect(wordCount('   \n  ')).toBe(0)
  })

  it('collapses runs of whitespace rather than counting empty strings', () => {
    expect(wordCount('  one   two \n three  ')).toBe(3)
  })

  it('counts a hyphenated or punctuated word once', () => {
    expect(wordCount('well-known, yes: it is.')).toBe(4)
  })
})

describe('speakingSeconds', () => {
  it('is zero for an empty script', () => {
    expect(speakingSeconds('')).toBe(0)
  })

  /* 150 words per minute, so 150 words is a minute exactly. */
  it('reads 150 words in 60 seconds', () => {
    expect(speakingSeconds(Array(150).fill('word').join(' '))).toBe(60)
  })

  it('reads 75 words in 30 seconds', () => {
    expect(speakingSeconds(Array(75).fill('word').join(' '))).toBe(30)
  })
})

describe('formatDuration', () => {
  it('shows seconds alone under a minute', () => {
    expect(formatDuration(38)).toBe('38s')
  })

  it('shows minutes and zero-padded seconds at or over a minute', () => {
    expect(formatDuration(60)).toBe('1m 00s')
    expect(formatDuration(95)).toBe('1m 35s')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/speakingTime.test.ts`
Expected: FAIL — `Failed to resolve import "./speakingTime"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/speakingTime.ts`:

```ts
/*
  150 wpm is the low end of conversational narration pace.

  Deliberately the low end: the estimate exists so somebody writing a script can
  tell whether a slide runs long, and a script that comes in under its estimate
  is a much better failure than one that overruns the slide it belongs to.
*/
const WORDS_PER_MINUTE = 150

export function wordCount(text: string): number {
  const trimmed = text.trim()
  if (trimmed === '') return 0
  return trimmed.split(/\s+/).length
}

export function speakingSeconds(text: string): number {
  return Math.round((wordCount(text) / WORDS_PER_MINUTE) * 60)
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}m ${String(rest).padStart(2, '0')}s`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/speakingTime.test.ts`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc -b && npm run lint && npm run test
git add src/lib/speakingTime.ts src/lib/speakingTime.test.ts
git commit -m "$(cat <<'EOF'
Add the speaking-time estimate

150 wpm, the low end of conversational narration pace: a script that runs short
is a better failure than one that overruns its slide.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012xarEEiXiSkZzuqQYnVPGw
EOF
)"
```

---

### Task 3: Persist narration on the card row

Adds the column, puts `narration` on `Card`, and closes the read/write round-trip. **This task changes `cardRow`, which is what makes migration 0008 mandatory before any card write at all.**

**Files:**
- Create: `supabase/migrations/0008_add_card_narration.sql`
- Modify: `src/engine/contentBlocks.ts` (`cardSchema`)
- Modify: `src/store/presentationStore.ts` (`cardRow`, `cardFromRow`)
- Test: `src/store/narrationRow.test.ts`

**Interfaces:**
- Consumes: `narrationSchema`, `parseNarration` from Task 1.
- Produces: `Card.narration?: Narration`; `cardRow` emits `narration`; `cardFromRow` reads it. `cardRow` and `cardFromRow` stay non-exported — the test reaches them through the exported `cardRowForTest`/`cardFromRowForTest` added in Step 3.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0008_add_card_narration.sql`:

```sql
-- One slide's narration script: { text, generated }.
--
-- `text` is the script a voice will read; `generated` is the AI's version of it,
-- kept so "Reset to generated" can restore it literally after a hand edit.
--
-- Defaults to '{}' like `adjusts` before it, so every existing row is valid
-- immediately. The app maps that empty object back to "no script" on read
-- (`parseNarration`) — a card with the column is not a card with a script.
alter table cards add column if not exists narration jsonb not null default '{}';
```

- [ ] **Step 2: Write the failing test**

Create `src/store/narrationRow.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { cardFromRowForTest, cardRowForTest } from './presentationStore'
import type { Card } from '@/engine/contentBlocks'

const baseCard: Card = {
  id: 'card-1',
  orderIndex: 0,
  blocks: [{ type: 'heading', text: 'Title' }],
  layout: 'auto',
  visualStyle: 'structured',
}

describe('narration round-trip through the card row', () => {
  it('writes a script to the row and reads it back unchanged', () => {
    const card: Card = { ...baseCard, narration: { text: 'Spoken.', generated: 'Spoken.' } }
    const row = cardRowForTest('pres-1', card)
    expect(row.narration).toEqual({ text: 'Spoken.', generated: 'Spoken.' })
    expect(cardFromRowForTest({ ...row, visual_style: 'structured' }).narration).toEqual({
      text: 'Spoken.',
      generated: 'Spoken.',
    })
  })

  it('keeps an edit distinct from the generated copy across the round-trip', () => {
    const card: Card = { ...baseCard, narration: { text: 'Mine.', generated: 'Theirs.' } }
    const row = cardRowForTest('pres-1', card)
    expect(cardFromRowForTest({ ...row, visual_style: 'structured' }).narration).toEqual({
      text: 'Mine.',
      generated: 'Theirs.',
    })
  })

  it('writes the empty object for a card with no script', () => {
    expect(cardRowForTest('pres-1', baseCard).narration).toEqual({})
  })

  /*
    Every row written before migration 0008 reads back as '{}'. Treating that as
    a script would mark an entire pre-existing deck as narrated.
  */
  it('reads a pre-0008 row back as a card with no script', () => {
    const row = cardRowForTest('pres-1', baseCard)
    const card = cardFromRowForTest({ ...row, visual_style: 'structured', narration: {} })
    expect(card.narration).toBeUndefined()
  })

  it('reads a row missing the column entirely back as a card with no script', () => {
    const row = cardRowForTest('pres-1', baseCard)
    const { narration: _dropped, ...withoutColumn } = row
    const card = cardFromRowForTest({ ...withoutColumn, visual_style: 'structured' })
    expect(card.narration).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/store/narrationRow.test.ts`
Expected: FAIL — `cardRowForTest` is not exported from `./presentationStore`.

- [ ] **Step 4: Add `narration` to the Card schema**

In `src/engine/contentBlocks.ts`, add the import at the top alongside the other engine imports:

```ts
import { narrationSchema } from './narration'
```

Then add this field to `cardSchema`, immediately after the `adjusts` field:

```ts
  /*
    The slide's narration script — see `engine/narration.ts`.

    Optional and absent by default, like every field above it: a freshly
    generated deck has none, and a card gains one only when somebody generates
    or writes a script for it. Never rendered on the slide and never exported to
    .pptx; it exists to be read aloud.
  */
  narration: narrationSchema.optional(),
```

- [ ] **Step 5: Round-trip it through the store's row mapping**

In `src/store/presentationStore.ts`, add to the imports:

```ts
import { parseNarration } from '@/engine/narration'
```

In `cardRow`, add a final property after `adjusts`:

```ts
    narration: card.narration ?? {},
```

In `cardFromRow`, add a final property to the returned object after `adjusts`:

```ts
    narration: parseNarration(row.narration),
```

Then export both for the test — place these directly below `cardFromRow`:

```ts
/*
  Exported for `narrationRow.test.ts` only.

  The round-trip these two form is the part worth pinning: `cardRow` names every
  column on every upsert, and `cardFromRow` repairs every older-shaped row, so a
  field added to one and forgotten in the other fails silently rather than
  loudly.
*/
export const cardRowForTest = cardRow
export const cardFromRowForTest = cardFromRow
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/store/narrationRow.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 7: Run the whole suite, typecheck and lint**

Run: `npm run test && npx tsc -b && npm run lint`
Expected: all clean, 24+ files passing. The existing `saveTiming.test.ts` exercises `cardRow`; if it fails, `narration` was added in a way that changes an existing payload shape — fix rather than update the assertion.

- [ ] **Step 8: Apply the migration to your Supabase project**

Run the contents of `supabase/migrations/0008_add_card_narration.sql` in the Supabase dashboard's SQL editor. **The editor cannot write any card until this is applied** — see the note in Task 9.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0008_add_card_narration.sql src/engine/contentBlocks.ts src/store/presentationStore.ts src/store/narrationRow.test.ts
git commit -m "$(cat <<'EOF'
Persist narration on the card row

Adds cards.narration (jsonb, default '{}') and rounds it through cardRow and
cardFromRow. The default reads back as undefined, since a row that has the
column is not a row that has a script — the same distinction parseAdjusts draws.

cardRow names every column on every upsert, so 0008 is now required before any
card write, delete and reorder included.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012xarEEiXiSkZzuqQYnVPGw
EOF
)"
```

---

### Task 4: Store methods for narration

Three mutations, following the store's existing timing rules exactly: typing debounces, structural writes go immediately.

**Files:**
- Modify: `src/store/presentationStore.ts` (interface `PresentationState`, then the `create()` body)

**Interfaces:**
- Consumes: `mergeNarration`, `type GeneratedScript`, `isResettable` from Task 1.
- Produces, on the store:
  - `setNarrationText(cardId: string, text: string): void`
  - `resetNarration(cardId: string): void`
  - `applyGeneratedNarration(scripts: GeneratedScript[]): void`

- [ ] **Step 1: Declare the three methods on the interface**

In `src/store/presentationStore.ts`, add to the imports:

```ts
import { isResettable, mergeNarration, type GeneratedScript } from '@/engine/narration'
```

Then add to the `PresentationState` interface, directly after `reorderCards`:

```ts
  /**
   * Replaces one slide's narration script, keeping the generated copy Reset
   * restores from.
   *
   * Debounced like any other typing: the script is a textarea, and a row write
   * per keystroke is what `scheduleSave` exists to absorb.
   */
  setNarrationText: (cardId: string, text: string) => void
  /** Puts the AI's version back after a hand edit. No-op if there is nothing to go back to. */
  resetNarration: (cardId: string) => void
  /**
   * Folds a whole generation's scripts into the deck.
   *
   * Structural, so it is written immediately rather than debounced, and pushes
   * exactly one undo entry for the whole batch. Slides the user has edited are
   * left alone by `mergeNarration` regardless of what the model returned.
   */
  applyGeneratedNarration: (scripts: GeneratedScript[]) => void
```

- [ ] **Step 2: Implement them**

In the `create()` body, add these three methods immediately after `reorderCards`'s closing `},`:

```ts
  setNarrationText(cardId, text) {
    const card = get().cards.find((c) => c.id === cardId)
    if (!card) return

    // Coalesced per card so a typed paragraph is one undo step, not one per
    // character — the same window `setTitle` uses.
    pushHistory(set, get, `narration:${cardId}`)
    const narration = { text, generated: card.narration?.generated }
    set({ cards: get().cards.map((c) => (c.id === cardId ? { ...c, narration } : c)) })

    const id = get().presentationId
    if (id) {
      scheduleSave(`narration:${cardId}`, () =>
        runSave(set, () => persistCardPatch(cardId, { narration })),
      )
    }
  },

  resetNarration(cardId) {
    const card = get().cards.find((c) => c.id === cardId)
    if (!card || !isResettable(card.narration)) return

    pushHistory(set, get)
    const narration = { text: card.narration!.generated!, generated: card.narration!.generated }
    set({ cards: get().cards.map((c) => (c.id === cardId ? { ...c, narration } : c)) })

    const id = get().presentationId
    if (id) {
      /*
        A discrete click, not a keystroke: the value is final the moment it
        happens, so holding it on a timer only widens the window a reload could
        lose it in. The pending debounced write is dropped first so the older
        text cannot land after this one.
      */
      clearScheduledSave(`narration:${cardId}`)
      void runSave(set, () => persistCardPatch(cardId, { narration }))
    }
  },

  applyGeneratedNarration(scripts) {
    const previous = get().cards
    if (previous.length === 0) return

    /*
      `mergeNarration` addresses slides by the 1-based number the model was
      shown, which is position in *sorted* order — the store's array is not
      guaranteed to be sorted, so it is sorted here and mapped back by id.
    */
    const sorted = [...previous].sort((a, b) => a.orderIndex - b.orderIndex)
    const merged = mergeNarration(sorted, scripts)
    const byId = new Map(merged.map((c) => [c.id, c]))

    pushHistory(set, get)
    set({ cards: previous.map((c) => byId.get(c.id) ?? c) })

    const id = get().presentationId
    if (id) {
      // Structural, like a card delete: written straight through rather than
      // debounced, since this lands a whole deck's worth of text at once.
      void runSave(set, () => persistCardsSync(id, previous, get().cards))
    }
  },
```

- [ ] **Step 3: Verify the whole suite still passes**

Run: `npm run test && npx tsc -b && npm run lint`
Expected: all clean. `saveTiming.test.ts` must still pass — it pins the ordering rules these methods follow.

- [ ] **Step 4: Commit**

```bash
git add src/store/presentationStore.ts
git commit -m "$(cat <<'EOF'
Add narration store mutations

Typing a script debounces and coalesces undo per card; Reset and a whole
generation write immediately, since neither has anything left to coalesce.

applyGeneratedNarration sorts before merging: mergeNarration addresses slides by
the 1-based number the model was shown, which is position in sorted order.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012xarEEiXiSkZzuqQYnVPGw
EOF
)"
```

---

### Task 5: `generateNarration` on the provider chain

Puts narration generation on the `AIProvider` interface so `FallbackProvider` covers it with the existing capacity-only failover, retry backoff and abort handling — no new failure machinery.

**Files:**
- Modify: `src/ai/provider.ts`
- Create: `src/ai/narrationPrompt.ts`
- Modify: `src/ai/groqProvider.ts`
- Modify: `src/ai/geminiProvider.ts`
- Modify: `src/ai/fallbackProvider.ts`
- Test: `src/ai/narrationFallback.test.ts`

**Interfaces:**
- Consumes: `type Card` from `@/engine/contentBlocks`, `contentLines` from `@/engine/cardTemplates`.
- Produces:
  - In `provider.ts`: `interface NarrationSlide { slide: number; heading: string; lines: string[]; existingScript?: string }`, `narrationResponseSchema`, `type NarrationResponse = { scripts: { slide: number; text: string }[] }`, and `generateNarration(title: string, slides: NarrationSlide[], signal?: AbortSignal): Promise<NarrationResponse>` on `AIProvider`.
  - In `narrationPrompt.ts`: `NARRATION_SYSTEM_PROMPT`, `buildNarrationUserPrompt(title: string, slides: NarrationSlide[]): string`, `narrationSlides(cards: Card[]): NarrationSlide[]`, `narrationMaxTokens(slideCount: number): number`.

- [ ] **Step 1: Extend the provider contract**

In `src/ai/provider.ts`, add after the `GeneratedDeck` type:

```ts
/**
 * One slide as the narration model sees it.
 *
 * `existingScript` present means the user has written this slide themselves and
 * the model must not rewrite it — it is sent anyway so the surrounding scripts
 * can flow into and out of it. A call that saw only the gaps would write
 * transitions into nothing.
 */
export interface NarrationSlide {
  slide: number
  heading: string
  lines: string[]
  existingScript?: string
}

export const narrationResponseSchema = z.object({
  scripts: z
    .array(
      z.object({
        slide: z.number().int().positive(),
        text: z.string().min(1),
      }),
    )
    .min(1),
})

export type NarrationResponse = z.infer<typeof narrationResponseSchema>
```

Then add the method to the `AIProvider` interface, below `generateDeck`:

```ts
  /**
   * Writes an expanded spoken script for each slide that needs one.
   *
   * Deliberately NOT a second content generation: the scripts never touch a
   * card's `blocks`, are never rendered on a slide and are never exported. The
   * "generated once" rule is about the deck's content, which this does not
   * rewrite.
   */
  generateNarration(
    title: string,
    slides: NarrationSlide[],
    signal?: AbortSignal,
  ): Promise<NarrationResponse>
```

- [ ] **Step 2: Write the prompt module**

Create `src/ai/narrationPrompt.ts`:

```ts
import type { Card } from '@/engine/contentBlocks'
import { contentLines } from '@/engine/cardTemplates'
import { isRegenerable } from '@/engine/narration'
import type { NarrationSlide } from './provider'

export const NARRATION_SYSTEM_PROMPT = `You write narration scripts for presentation slides — the words a presenter says out loud while a slide is on screen.

You are given a whole deck at once so the narration flows from slide to slide as one continuous talk.

WRITING RULES
- Write to be SPOKEN, not read. Full sentences, natural rhythm, contractions welcome.
- EXPAND on the slide. The slide holds the headline; the script explains, gives context, and says why it matters. Never just read the bullets aloud.
- 90 to 140 words per slide — roughly 35 to 55 seconds of speech.
- Connect to the slide before and the slide after. Use real transitions ("that brings us to…", "so what does that mean in practice?").
- The first slide opens the talk. The last slide closes it.
- Never invent statistics, dates, names or facts that are not on the slide.
- Plain prose only: no markdown, no asterisks, no bullet characters, no stage directions, no "Slide 3:" prefixes.

FIXED SLIDES
Some slides arrive with an existing script the user wrote. Those are FIXED. Do not return a script for them. Do read them, and make the slides on either side flow into and out of them.

OUTPUT
Return ONLY a JSON object, no other text:
{"scripts":[{"slide":1,"text":"..."},{"slide":4,"text":"..."}]}
Include an entry for every slide that is not fixed, and for no slide that is.`

export function buildNarrationUserPrompt(title: string, slides: NarrationSlide[]): string {
  const body = slides
    .map((s) => {
      const head = `Slide ${s.slide}: ${s.heading}`
      const content = s.lines.length > 0 ? `\n${s.lines.map((l) => `- ${l}`).join('\n')}` : ''
      const fixed = s.existingScript
        ? `\n[FIXED — the user wrote this script. Do not return one for this slide.]\n"${s.existingScript}"`
        : ''
      return `${head}${content}${fixed}`
    })
    .join('\n\n')

  const wanted = slides.filter((s) => !s.existingScript).map((s) => s.slide)

  return `Presentation title: ${title}

${body}

Write narration for these slides only: ${wanted.join(', ')}.`
}

/**
 * The deck as slides for the prompt.
 *
 * Every slide is included — the model needs the whole talk to write transitions
 * — but a slide whose script the user has edited carries it as `existingScript`
 * and is marked fixed. `contentLines` is reused rather than reimplemented so
 * the narration sees exactly the words a card conversion would preserve.
 *
 * `cards` MUST be sorted by `orderIndex`; `slide` is 1-based position, which is
 * what `mergeNarration` reads back.
 */
export function narrationSlides(cards: Card[]): NarrationSlide[] {
  return cards.map((card, i) => {
    const heading = card.blocks[0]?.type === 'heading' ? card.blocks[0].text : `Slide ${i + 1}`
    return {
      slide: i + 1,
      heading,
      lines: contentLines(card.blocks),
      ...(isRegenerable(card.narration) ? {} : { existingScript: card.narration?.text }),
    }
  })
}

/**
 * Output budget for one narration call.
 *
 * An expanded script runs 90–140 words, about 180 tokens, plus JSON overhead.
 * Clamped at 8192 like the deck path: past that the provider truncates the JSON
 * rather than granting a bigger budget, so asking for more buys nothing.
 */
export function narrationMaxTokens(slideCount: number): number {
  return Math.min(8192, Math.max(2048, slideCount * 260 + 600))
}
```

- [ ] **Step 3: Implement it on GroqProvider**

In `src/ai/groqProvider.ts`, extend the imports from `./provider`:

```ts
import {
  AIProviderError,
  generatedDeckSchema,
  kindForStatus,
  narrationResponseSchema,
  type AIProvider,
  type GeneratedDeck,
  type GenerationBrief,
  type NarrationResponse,
  type NarrationSlide,
} from './provider'
```

and add:

```ts
import {
  NARRATION_SYSTEM_PROMPT,
  buildNarrationUserPrompt,
  narrationMaxTokens,
} from './narrationPrompt'
```

Add this parse helper beside `tryParseDeck`:

```ts
function tryParseNarration(raw: string): { data: NarrationResponse } | { error: string } {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (err) {
    return { error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` }
  }
  const result = narrationResponseSchema.safeParse(json)
  if (result.success) return { data: result.data }
  return { error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
}
```

Then add the method to the class, after `generateDeck`:

```ts
  async generateNarration(
    title: string,
    slides: NarrationSlide[],
    signal?: AbortSignal,
  ): Promise<NarrationResponse> {
    if (!this.apiKey.trim()) {
      throw new AIProviderError('No Groq API key configured. Add VITE_GROQ_API_KEY to your .env file.', {
        kind: 'auth',
      })
    }

    const messages: GroqMessage[] = [
      { role: 'system', content: NARRATION_SYSTEM_PROMPT },
      { role: 'user', content: buildNarrationUserPrompt(title, slides) },
    ]
    const maxTokens = narrationMaxTokens(slides.length)

    const first = await callGroq(this.apiKey, messages, maxTokens, signal)
    const firstResult = tryParseNarration(first)
    if ('data' in firstResult) return firstResult.data

    // One retry with the exact validation errors, as the deck path does.
    const retryMessages: GroqMessage[] = [
      ...messages,
      { role: 'assistant', content: first },
      {
        role: 'user',
        content: `That response failed schema validation with these errors: ${firstResult.error}. Reply again with ONLY the corrected JSON object, no other text.`,
      },
    ]
    const second = await callGroq(this.apiKey, retryMessages, maxTokens, signal)
    const secondResult = tryParseNarration(second)
    if ('data' in secondResult) return secondResult.data

    throw new AIProviderError('The AI returned narration that could not be parsed. Try again.', {
      kind: 'response',
    })
  }
```

- [ ] **Step 4: Implement it on GeminiProvider**

In `src/ai/geminiProvider.ts`, extend the imports from `./provider`:

```ts
import {
  AIProviderError,
  generatedDeckSchema,
  kindForStatus,
  narrationResponseSchema,
  type AIProvider,
  type GeneratedDeck,
  type GenerationBrief,
  type NarrationResponse,
  type NarrationSlide,
} from './provider'
```

and add:

```ts
import {
  NARRATION_SYSTEM_PROMPT,
  buildNarrationUserPrompt,
  narrationMaxTokens,
} from './narrationPrompt'
```

Add this parse helper beside this file's `tryParseDeck` (the two providers each keep their own, exactly as they already each keep a `tryParseDeck` — they are separate modules with no shared parsing layer, and introducing one is out of scope here):

```ts
function tryParseNarration(raw: string): { data: NarrationResponse } | { error: string } {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (err) {
    return { error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` }
  }
  const result = narrationResponseSchema.safeParse(json)
  if (result.success) return { data: result.data }
  return { error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
}
```

Then add to the class after `generateDeck`:

```ts
  async generateNarration(
    title: string,
    slides: NarrationSlide[],
    signal?: AbortSignal,
  ): Promise<NarrationResponse> {
    if (!this.apiKey.trim()) {
      throw new AIProviderError('No Gemini API key configured. Add VITE_GEMINI_API_KEY to your .env file.', {
        kind: 'auth',
      })
    }

    const contents: GeminiContent[] = [
      { role: 'user', parts: [{ text: buildNarrationUserPrompt(title, slides) }] },
    ]
    const maxOutputTokens = narrationMaxTokens(slides.length)

    const first = await callGemini(this.apiKey, NARRATION_SYSTEM_PROMPT, contents, maxOutputTokens, signal)
    const firstResult = tryParseNarration(first)
    if ('data' in firstResult) return firstResult.data

    const retryContents: GeminiContent[] = [
      ...contents,
      { role: 'model', parts: [{ text: first }] },
      {
        role: 'user',
        parts: [
          {
            text: `That response failed schema validation with these errors: ${firstResult.error}. Reply again with ONLY the corrected JSON object, no other text.`,
          },
        ],
      },
    ]
    const second = await callGemini(
      this.apiKey,
      NARRATION_SYSTEM_PROMPT,
      retryContents,
      maxOutputTokens,
      signal,
    )
    const secondResult = tryParseNarration(second)
    if ('data' in secondResult) return secondResult.data

    throw new AIProviderError('The AI returned narration that could not be parsed. Try again.', {
      kind: 'response',
    })
  }
```

- [ ] **Step 5: Write the failing fallback test**

Create `src/ai/narrationFallback.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { FallbackProvider } from './fallbackProvider'
import { AIProviderError, type AIProvider, type NarrationResponse, type NarrationSlide } from './provider'

const SLIDES: NarrationSlide[] = [{ slide: 1, heading: 'Intro', lines: ['A point'] }]
const RESPONSE: NarrationResponse = { scripts: [{ slide: 1, text: 'Spoken words.' }] }

function stub(behavior: () => Promise<NarrationResponse>): AIProvider & { calls: () => number } {
  let calls = 0
  return {
    calls: () => calls,
    generateDeck: vi.fn(),
    generateNarration: async () => {
      calls++
      return behavior()
    },
  } as AIProvider & { calls: () => number }
}

describe('FallbackProvider.generateNarration', () => {
  it('returns the first provider’s narration without touching the second', async () => {
    const a = stub(async () => RESPONSE)
    const b = stub(async () => RESPONSE)
    const chain = new FallbackProvider([
      { name: 'A', provider: a },
      { name: 'B', provider: b },
    ])

    await expect(chain.generateNarration('Deck', SLIDES)).resolves.toEqual(RESPONSE)
    expect(b.calls()).toBe(0)
  })

  it('falls over to the second provider when the first is out of capacity', async () => {
    const a = stub(async () => {
      throw new AIProviderError('busy', { kind: 'capacity', status: 429 })
    })
    const b = stub(async () => RESPONSE)
    const chain = new FallbackProvider([
      { name: 'A', provider: a },
      { name: 'B', provider: b },
    ])

    await expect(chain.generateNarration('Deck', SLIDES)).resolves.toEqual(RESPONSE)
    expect(b.calls()).toBe(1)
  })

  /*
    The load-bearing rule, same as the deck path: a bad key must surface rather
    than quietly serving every script from the backup.
  */
  it('does not fall over on an auth failure', async () => {
    const a = stub(async () => {
      throw new AIProviderError('bad key', { kind: 'auth', status: 401 })
    })
    const b = stub(async () => RESPONSE)
    const chain = new FallbackProvider([
      { name: 'A', provider: a },
      { name: 'B', provider: b },
    ])

    await expect(chain.generateNarration('Deck', SLIDES)).rejects.toThrow('bad key')
    expect(b.calls()).toBe(0)
  })

  it('does not fall over on an unparseable response', async () => {
    const a = stub(async () => {
      throw new AIProviderError('garbage', { kind: 'response' })
    })
    const b = stub(async () => RESPONSE)
    const chain = new FallbackProvider([
      { name: 'A', provider: a },
      { name: 'B', provider: b },
    ])

    await expect(chain.generateNarration('Deck', SLIDES)).rejects.toThrow('garbage')
    expect(b.calls()).toBe(0)
  })

  /*
    Cancelling must not start a second request — otherwise the scripts the user
    walked away from still land, which is what the AbortSignal exists to stop.
  */
  it('does not fall over when the user cancelled', async () => {
    const controller = new AbortController()
    const a = stub(async () => {
      controller.abort()
      throw new AIProviderError('busy', { kind: 'capacity', status: 429 })
    })
    const b = stub(async () => RESPONSE)
    const chain = new FallbackProvider([
      { name: 'A', provider: a },
      { name: 'B', provider: b },
    ])

    await expect(chain.generateNarration('Deck', SLIDES, controller.signal)).rejects.toThrow('busy')
    expect(b.calls()).toBe(0)
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/ai/narrationFallback.test.ts`
Expected: FAIL — `chain.generateNarration is not a function`.

- [ ] **Step 7: Implement it on FallbackProvider**

In `src/ai/fallbackProvider.ts`, extend the imports:

```ts
import {
  AIProviderError,
  type AIProvider,
  type GeneratedDeck,
  type GenerationBrief,
  type NarrationResponse,
  type NarrationSlide,
} from './provider'
```

Add the method to the class after `generateDeck`:

```ts
  /**
   * Same chain, same rules as `generateDeck`: only a capacity failure moves to
   * the next provider, and cancellation never does.
   */
  async generateNarration(
    title: string,
    slides: NarrationSlide[],
    signal?: AbortSignal,
  ): Promise<NarrationResponse> {
    for (let i = 0; i < this.chain.length; i++) {
      const { name, provider } = this.chain[i]
      const isLast = i === this.chain.length - 1
      try {
        return await provider.generateNarration(title, slides, signal)
      } catch (err) {
        if (isLast || isAbort(err, signal) || !isFailoverable(err)) throw err
        console.warn(
          `[ai] ${name} is out of capacity (${err instanceof AIProviderError ? err.status : '?'}); falling back to ${this.chain[i + 1].name} for narration`,
        )
      }
    }
    throw new AIProviderError('No AI provider was able to write narration.')
  }
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/ai/narrationFallback.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 9: Full suite, typecheck, lint, commit**

```bash
npm run test && npx tsc -b && npm run lint
git add src/ai/
git commit -m "$(cat <<'EOF'
Add generateNarration to the provider chain

Putting it on the AIProvider interface means FallbackProvider covers it with the
existing rules unchanged: only a capacity failure hands off, cancellation never
does, and each provider has already spent its ai/retry.ts attempts first.

Every slide is sent, including ones the user has scripted by hand — those are
marked fixed so the surrounding narration can flow into and out of them, rather
than writing transitions into nothing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012xarEEiXiSkZzuqQYnVPGw
EOF
)"
```

---

### Task 6: The page shell, route, and read-only slide viewer

After this task you can open `/deck/:id/narrate` from the editor and step through the deck read-only. The right column is a static placeholder, replaced in Task 7.

**Files:**
- Create: `src/components/narrate/SlideViewer.tsx`
- Create: `src/pages/NarratePage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/editor/TopBar.tsx`

**Interfaces:**
- Consumes: `usePresentationStore`, `flushScheduledSaves` from `@/store/presentationStore`.
- Produces: `<SlideViewer card={Card} isFirstCard={boolean} />`; route `/deck/:id/narrate`.

- [ ] **Step 1: Build the read-only viewer**

Create `src/components/narrate/SlideViewer.tsx`:

```tsx
import { usePresentationStore } from '@/store/presentationStore'
import { LayoutRenderer } from '@/components/layouts/LayoutRenderer'
import { SlideBody } from '@/components/layouts/SlideBody'
import { SlideSurface } from '@/components/theme/SlideSurface'
import { TextStyleScope } from '@/components/theme/TextStyleScope'
import { mergeTextStyle } from '@/engine/textStyle'
import type { Card } from '@/engine/contentBlocks'

/**
 * One slide, rendered exactly as the editor and presenter draw it, and inert.
 *
 * Read-only is achieved by OMISSION, not by a `readOnly` prop threaded through
 * twelve layout components. Typing needs `TextEditingContext` and selection
 * boxes need the interaction half of `BlockAdjustContext`; neither is provided
 * here, so every layout renders its normal output with nothing to grab.
 *
 * `SlideBody` is still required: it provides `BlockDataContext`, the DATA half,
 * which is what makes stored element nudges and bold marks render at all.
 * Dropping it would show the narration viewer a different slide than the one
 * the user arranged.
 */
export function SlideViewer({ card, isFirstCard }: { card: Card; isFirstCard: boolean }) {
  const deckTextStyle = usePresentationStore((s) => s.textStyle)

  return (
    <TextStyleScope style={mergeTextStyle(deckTextStyle, card.textStyle)}>
      <SlideSurface className="w-full max-w-4xl rounded-slide p-8 shadow-slide-card sm:p-10">
        <SlideBody card={card}>
          <LayoutRenderer card={card} context={{ isFirstCard }} />
        </SlideBody>
      </SlideSurface>
    </TextStyleScope>
  )
}
```

- [ ] **Step 2: Build the page shell**

Create `src/pages/NarratePage.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { flushScheduledSaves, usePresentationStore } from '@/store/presentationStore'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { SlideStage } from '@/components/theme/SlideStage'
import { SlideViewer } from '@/components/narrate/SlideViewer'
import { Button } from '@/components/ui/Button'

export function NarratePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const store = usePresentationStore()
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (id) void store.loadDeck(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // A script is debounced 500ms after the last keystroke; leaving the page
  // sooner than that would drop the last sentence typed.
  useEffect(() => {
    return () => {
      void flushScheduledSaves()
    }
  }, [])

  const sorted = [...store.cards].sort((a, b) => a.orderIndex - b.orderIndex)
  const count = sorted.length

  const goTo = useCallback(
    (next: number) => {
      setIndex((current) => (count > 0 ? Math.min(Math.max(next, 0), count - 1) : current))
    },
    [count],
  )

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // The script textarea lives on the same page: without this, typing a
      // space or an arrow inside it would step the slide instead.
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        goTo(index + 1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goTo(index - 1)
      } else if (e.key === 'Escape') {
        void navigate(`/deck/${id}`)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [index, goTo, navigate, id])

  if (!id || store.status === 'loading') {
    return <div className="p-8 text-app-muted">Loading…</div>
  }

  const card = sorted[Math.min(index, Math.max(count - 1, 0))]

  return (
    <div className="flex h-screen flex-col bg-app-background">
      <div className="flex items-center justify-between border-b border-app-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            to={`/deck/${id}`}
            className="rounded-app-sm text-sm text-app-muted transition-colors hover:text-app-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
          >
            ← Back to editor
          </Link>
          <span className="text-base font-semibold text-app-foreground">{store.title}</span>
        </div>
        <span className="text-xs text-app-muted">Narration</span>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {count === 0 ? (
            <div className="flex flex-1 items-center justify-center p-8 text-app-muted">
              This deck has no slides yet.
            </div>
          ) : (
            <>
              {/* The deck's theme is scoped to the slide alone — the script
                  panel beside it is app chrome and stays on `app-*` tokens. */}
              <ThemeProvider theme={store.theme}>
                {/* SlideStage hardcodes `overflow-hidden` and must not scroll —
                    the backdrop's orbits and stars are percentages, so letting
                    the stage grow to the content height stretches every circle
                    into an ellipse. The scroll container goes INSIDE it, which
                    is the same arrangement EditorPage uses. */}
                <SlideStage className="min-h-0 flex-1">
                  <div className="scrollbar-subtle h-full overflow-y-auto p-6 sm:p-10">
                    <div className="flex min-h-full items-center justify-center">
                      <SlideViewer card={card} isFirstCard={index === 0} />
                    </div>
                  </div>
                </SlideStage>
              </ThemeProvider>

              <div className="flex items-center justify-center gap-4 border-t border-app-border py-3">
                <Button variant="secondary" onClick={() => goTo(index - 1)} disabled={index === 0}>
                  ‹ Previous
                </Button>
                <span className="text-xs tabular-nums text-app-muted">
                  {index + 1} / {count}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => goTo(index + 1)}
                  disabled={index >= count - 1}
                >
                  Next ›
                </Button>
              </div>
            </>
          )}
        </div>

        <aside className="w-96 shrink-0 border-l border-app-border bg-app-surface p-4">
          <p className="text-sm text-app-muted">Script panel goes here.</p>
        </aside>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Register the route**

In `src/App.tsx`, add the import beside the other pages:

```tsx
import { NarratePage } from '@/pages/NarratePage'
```

and add this route directly after the `/deck/:id/present` route:

```tsx
        <Route
          path="/deck/:id/narrate"
          element={
            <RequireAuth>
              <NarratePage />
            </RequireAuth>
          }
        />
```

- [ ] **Step 4: Light up the Narrate PPT button**

In `src/components/editor/TopBar.tsx`, replace the commented-out disabled button — the whole block from `{/* TODO: no behaviour yet` through `</Button>` — with:

```tsx
        <Link to={`/deck/${presentationId}/narrate`}>
          <Button variant="primary">Narrate PPT</Button>
        </Link>
```

`Link` is already imported in this file.

- [ ] **Step 5: Verify by hand**

Run `npm run dev`, open a deck, click **Narrate PPT**. Confirm:
- the slide renders in the deck's theme, matching the editor;
- ‹ › and ←/→ step the deck, the counter tracks, and the buttons disable at each end;
- clicking a heading places **no** caret and shows **no** selection box — nothing is editable;
- a card carrying an element nudge shows it in the same place the editor does;
- Escape and "Back to editor" both return to `/deck/:id`.

- [ ] **Step 6: Typecheck, lint, test, commit**

```bash
npm run test && npx tsc -b && npm run lint
git add src/components/narrate/SlideViewer.tsx src/pages/NarratePage.tsx src/App.tsx src/components/editor/TopBar.tsx
git commit -m "$(cat <<'EOF'
Add the narration page shell and read-only slide viewer

Read-only falls out of omitting TextEditingContext and the interaction half of
BlockAdjustContext rather than a readOnly prop through twelve layouts. SlideBody
stays, since its BlockDataContext is what makes stored nudges and marks render —
without it the viewer would show a different slide than the one the user
arranged.

Lights up the Narrate PPT button that has been disabled in TopBar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012xarEEiXiSkZzuqQYnVPGw
EOF
)"
```

---

### Task 7: The script panel

Replaces the placeholder `<aside>` with the working panel: slide list, editable script, word count, Reset. Generation arrives in Task 8.

**Files:**
- Create: `src/components/narrate/ScriptPanel.tsx`
- Modify: `src/pages/NarratePage.tsx`

**Interfaces:**
- Consumes: `narrationStatus`, `isResettable` (Task 1); `speakingSeconds`, `formatDuration` (Task 2); `setNarrationText`, `resetNarration` (Task 4).
- Produces: `<ScriptPanel cards={Card[]} index={number} onSelect={(i: number) => void} onGenerate={() => void} generating={boolean} onCancel={() => void} error={string | null} />`

`onGenerate`, `generating`, `onCancel` and `error` are wired to a real call in Task 8; this task passes a no-op `onGenerate`, `generating={false}`, a no-op `onCancel` and `error={null}`.

- [ ] **Step 1: Build the panel**

Create `src/components/narrate/ScriptPanel.tsx`:

```tsx
import { usePresentationStore } from '@/store/presentationStore'
import { isResettable, narrationStatus, type NarrationStatus } from '@/engine/narration'
import { formatDuration, speakingSeconds, wordCount } from '@/lib/speakingTime'
import { Button } from '@/components/ui/Button'
import type { Card } from '@/engine/contentBlocks'

/*
  Glyph plus duration rather than the word "generated": the row is 384px wide
  and shares it with a heading, and the duration is the number somebody writing
  a talk actually scans the list for.
*/
const STATUS_GLYPH: Record<NarrationStatus, string> = {
  empty: '—',
  generated: '✓',
  edited: '✎',
}

const STATUS_CLASS: Record<NarrationStatus, string> = {
  empty: 'text-app-muted',
  generated: 'text-app-accent-text',
  edited: 'text-app-highlight-text',
}

function headingOf(card: Card, i: number): string {
  return card.blocks[0]?.type === 'heading' ? card.blocks[0].text : `Slide ${i + 1}`
}

export function ScriptPanel({
  cards,
  index,
  onSelect,
  onGenerate,
  generating,
  onCancel,
  error,
}: {
  cards: Card[]
  index: number
  onSelect: (i: number) => void
  onGenerate: () => void
  generating: boolean
  onCancel: () => void
  error: string | null
}) {
  const setNarrationText = usePresentationStore((s) => s.setNarrationText)
  const resetNarration = usePresentationStore((s) => s.resetNarration)

  const card = cards[index]
  const narration = card?.narration
  const text = narration?.text ?? ''
  const words = wordCount(text)

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-app-border p-4">
        {generating ? (
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onCancel} className="w-full">
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="primary" onClick={onGenerate} disabled={cards.length === 0} className="w-full">
            Generate all scripts
          </Button>
        )}
        <p className="mt-2 text-xs text-app-muted">
          {generating
            ? 'Writing narration for the whole deck…'
            : 'Scripts you have edited are never overwritten.'}
        </p>
        {error && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
      </div>

      <ul className="scrollbar-subtle max-h-52 shrink-0 overflow-y-auto border-b border-app-border">
        {cards.map((c, i) => {
          const status = narrationStatus(c.narration)
          const seconds = speakingSeconds(c.narration?.text ?? '')
          return (
            <li key={c.id}>
              <button
                onClick={() => onSelect(i)}
                title={status === 'edited' ? 'You edited this script — Generate all will not overwrite it' : undefined}
                className={`flex w-full items-center gap-2 px-4 py-2 text-left text-xs transition-colors hover:bg-app-border/40 ${
                  i === index ? 'bg-app-border/60' : ''
                }`}
              >
                <span className="w-4 shrink-0 tabular-nums text-app-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-app-foreground">{headingOf(c, i)}</span>
                <span className={`shrink-0 ${STATUS_CLASS[status]}`}>{STATUS_GLYPH[status]}</span>
                <span className="w-12 shrink-0 text-right tabular-nums text-app-muted">
                  {status === 'empty' ? '' : formatDuration(seconds)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {card && (
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-app-foreground">Slide {index + 1} script</h2>
            {isResettable(narration) && (
              <button
                onClick={() => resetNarration(card.id)}
                className="rounded-app-sm text-xs text-app-muted underline transition-colors hover:text-app-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
                title="Put the AI's version back"
              >
                Reset to generated
              </button>
            )}
          </div>

          <textarea
            value={text}
            onChange={(e) => setNarrationText(card.id, e.target.value)}
            placeholder="What the narrator says while this slide is on screen."
            className="scrollbar-subtle min-h-0 flex-1 resize-none rounded-app border border-app-border bg-app-background p-3 text-sm leading-relaxed text-app-foreground outline-none focus:border-app-accent"
          />

          <p className="mt-2 text-xs text-app-muted">
            {words} {words === 1 ? 'word' : 'words'} · ~{formatDuration(speakingSeconds(text))}
          </p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Mount it in the page**

In `src/pages/NarratePage.tsx`, add the import:

```tsx
import { ScriptPanel } from '@/components/narrate/ScriptPanel'
```

and replace the placeholder `<aside>…</aside>` with:

```tsx
        <aside className="w-96 shrink-0 border-l border-app-border bg-app-surface">
          <ScriptPanel
            cards={sorted}
            index={index}
            onSelect={goTo}
            onGenerate={() => {}}
            generating={false}
            onCancel={() => {}}
            error={null}
          />
        </aside>
```

- [ ] **Step 3: Verify by hand**

Run `npm run dev` and open the narration page. Confirm:
- typing in the textarea updates the word count and estimated duration live;
- the slide's chip flips from `— empty` to `✎ edited` as you type;
- clicking a row in the list steps the slide on the left;
- typing a space or pressing ← inside the textarea does **not** step the slide;
- **Reset to generated** does not appear yet (nothing has been generated);
- reload the page and confirm the typed script came back — that proves the debounced write landed.

- [ ] **Step 4: Typecheck, lint, test, commit**

```bash
npm run test && npx tsc -b && npm run lint
git add src/components/narrate/ScriptPanel.tsx src/pages/NarratePage.tsx
git commit -m "$(cat <<'EOF'
Add the narration script panel

Slide list with status chips, an editable script for the current slide, live
word count and speaking-time estimate, and Reset to generated once a hand edit
has diverged from the AI's version.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012xarEEiXiSkZzuqQYnVPGw
EOF
)"
```

---

### Task 8: Wire "Generate all scripts"

**Files:**
- Modify: `src/pages/NarratePage.tsx`

**Interfaces:**
- Consumes: `FallbackProvider`, `GroqProvider`, `GeminiProvider`, `narrationSlides` (Task 5); `applyGeneratedNarration` (Task 4).
- Produces: nothing further.

- [ ] **Step 1: Build the provider chain and generation state**

In `src/pages/NarratePage.tsx`, add these imports:

```tsx
import { useRef } from 'react'
import { FallbackProvider, type NamedProvider } from '@/ai/fallbackProvider'
import { GroqProvider } from '@/ai/groqProvider'
import { GeminiProvider } from '@/ai/geminiProvider'
import { narrationSlides } from '@/ai/narrationPrompt'
import { describeError } from '@/store/presentationStore'
```

Merge `useRef` into the existing `react` import rather than adding a second one, and merge `describeError` into the existing `@/store/presentationStore` import.

Add above the component, at module level:

```tsx
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY ?? ''
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY ?? ''

/*
  Same chain and same construction as CreatePage: Groq first, Gemini behind it,
  each included only if its key is present. A provider with no key is left OUT
  rather than added and allowed to fail, so dropping VITE_GROQ_API_KEY makes
  this Gemini-only with no code change.
*/
const PROVIDER_CHAIN: NamedProvider[] = [
  ...(GROQ_API_KEY ? [{ name: 'Groq', provider: new GroqProvider(GROQ_API_KEY) }] : []),
  ...(GEMINI_API_KEY ? [{ name: 'Gemini', provider: new GeminiProvider(GEMINI_API_KEY) }] : []),
]
```

- [ ] **Step 2: Add the generation handler**

Inside the component, after the `goTo` definition, add:

```tsx
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Cancelling has to stop the request, not just stop listening to it —
  // otherwise scripts the user walked away from land and overwrite the deck.
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  async function handleGenerate() {
    if (PROVIDER_CHAIN.length === 0) {
      setError('No AI provider is configured. Add VITE_GROQ_API_KEY or VITE_GEMINI_API_KEY to your .env file.')
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    setGenerating(true)
    setError(null)

    try {
      const provider = new FallbackProvider(PROVIDER_CHAIN)
      const response = await provider.generateNarration(
        store.title,
        narrationSlides(sorted),
        controller.signal,
      )
      if (controller.signal.aborted) return
      store.applyGeneratedNarration(response.scripts)
    } catch (err) {
      // A cancel is a return to the panel, not a failure to report.
      if (controller.signal.aborted) return
      setError(describeError(err))
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setGenerating(false)
    }
  }
```

- [ ] **Step 3: Pass the real props**

Replace the `ScriptPanel` props from Task 7 with:

```tsx
          <ScriptPanel
            cards={sorted}
            index={index}
            onSelect={goTo}
            onGenerate={() => void handleGenerate()}
            generating={generating}
            onCancel={() => abortRef.current?.abort()}
            error={error}
          />
```

- [ ] **Step 4: Verify by hand against a real deck**

Run `npm run dev`, open a deck with several slides, and confirm:
- **Generate all scripts** fills every slide, and the scripts read as continuous speech with real transitions, not the bullets read aloud;
- edit slide 2's script by hand, press Generate again, and **slide 2 keeps your words** while the others are rewritten;
- **Reset to generated** now appears on slide 2 and restores the AI's version;
- blank a script, press Generate, and that slide is rewritten;
- press Generate and then Cancel mid-flight: no scripts change, no error banner appears;
- ⌘Z after a generation restores every previous script in one step;
- reload and confirm the scripts persisted.

- [ ] **Step 5: Typecheck, lint, test, commit**

```bash
npm run test && npx tsc -b && npm run lint
git add src/pages/NarratePage.tsx
git commit -m "$(cat <<'EOF'
Wire Generate all scripts

One call writes the whole deck so narration flows slide to slide. Cancel aborts
the request itself and returns to the panel rather than reporting an error, and
a generation is one undo step.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012xarEEiXiSkZzuqQYnVPGw
EOF
)"
```

---

### Task 9: Document it in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the migration hazard to the Persistence section**

In `CLAUDE.md`, find the sentence in **Persistence (Supabase)** beginning *"`0007_touch_presentation_on_card_change.sql` makes a card write bump…"* and add immediately after that sentence:

```markdown
`0008_add_card_narration.sql` adds `cards.narration` (`jsonb not null default '{}'`) — and, exactly like 0006, it is required before **any** card write rather than only before narrating one, because `cardRow` names `narration` on every upsert. An un-migrated project fails on card delete, reorder and undo/redo too. `parseNarration` maps the `{}` default back to `undefined` for the same reason `parseAdjusts` does: a row that has the column is not a row that has a script, and treating it as one would show every pre-existing deck as fully narrated.
```

- [ ] **Step 2: Add the feature section**

Insert this new section immediately **before** the `### PPTX export (`src/export/`)` heading:

```markdown
### Narration page (`pages/NarratePage.tsx`, `engine/narration.ts`, `ai/narrationPrompt.ts`)

`/deck/:id/narrate` pairs a read-only slide viewer on the left with a narration script panel on the right: an expanded spoken script per slide, for a cloned voice to read in later development. It is what the previously-disabled "Narrate PPT" button in `TopBar` now opens. Design doc: `docs/superpowers/specs/2026-09-02-narration-page-design.md`.

- **This is a second AI call, and the generate-once rule is unchanged.** The rule is that no code path regenerates a card's **`blocks`** — narration is a separate field that the layout engine never reads, no slide ever renders, and the PPTX export never writes. The deck the user sees still comes from the single call at creation. Do not treat `generateNarration` as precedent for a "regenerate this slide" button.
- **Read-only is achieved by omission, not by a `readOnly` prop.** `SlideViewer` renders the same `SlideSurface`/`SlideBody`/`LayoutRenderer` chain the presenter does and simply does not provide `TextEditingContext` (typing) or the interaction half of `BlockAdjustContext` (selection boxes). Threading a flag through twelve hand-designed layouts would have created a second render path to drift. `SlideBody` is still required — its `BlockDataContext` is what makes stored nudges and bold marks render, and without it the viewer would show a different slide than the one the user arranged.
- **A card stores two scripts, not a script and an `edited` flag.** `narration` is `{ text, generated }`: what a voice will read, and the AI's version of it. `narrationStatus`, `isRegenerable` and `isResettable` are all *derived* from those two, so none of them can fall out of sync — and keeping `generated` is what makes "Reset to generated" literal rather than "clear and hope the next generation refills it".
- **A blank script reads as `empty` even when a generated copy survives**, because the status chip predicts what Generate-all will do and a blanked script *is* rewritten. Reset stays offered on it, so blanking never loses the AI's copy.
- **`mergeNarration` applies a script only to a regenerable slide, whatever the model returned.** The prompt asks it to leave edited slides alone, but a prompt is a request and this is the invariant the feature is sold on; the guard lives in a pure function precisely so a test can fail when someone removes it. Slides the user has edited are still *sent* to the model, marked fixed, because a call that saw only the gaps would write transitions into nothing.
- **The whole deck is one call**, not one per slide: narration that flows slide-to-slide ("that brings us to…") cannot come from N requests that each start cold. `generateNarration` sits on the `AIProvider` interface beside `generateDeck`, so `FallbackProvider` covers it with the existing capacity-only failover, `ai/retry.ts` backoff and abort handling, and a missing key still drops that provider from the chain.
- Timing follows the store's existing rules rather than extending them: typing debounces at 500ms and coalesces undo on `narration:<cardId>`, while Reset and a whole generation are written immediately (neither has anything left to coalesce). `NarratePage` calls `flushScheduledSaves()` on unmount so returning to the editor cannot outrun the last sentence typed.
- **Accepted limitation:** the creation brief (audience, tone, detail level) is deleted with the draft once a deck is created and is not stored on the deck, so narration infers tone from the deck's own text.
```

- [ ] **Step 3: Add the new tests to the test-coverage list**

In the **Commands** section's coverage sentence, add before the closing `. No component/integration tests.`:

```markdown
, `engine/narration.test.ts` (the derived script states and — the one that matters — that a generated script aimed at a hand-edited slide is dropped, since nothing here can be regenerated), `lib/speakingTime.test.ts` (the word count and 150-wpm estimate), `ai/narrationFallback.test.ts` (that narration inherits the same capacity-only failover rule as deck generation, against call-counting stubs), and `store/narrationRow.test.ts` (that `narration` survives `cardRow`/`cardFromRow` and that the `{}` default reads back as no script)
```

- [ ] **Step 4: Final full verification**

```bash
npm run test && npx tsc -b && npm run lint && npm run build
```
Expected: all four clean.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
Document the narration page in CLAUDE.md

Records why a second AI call does not reopen the generate-once rule, why
read-only is achieved by omitting contexts rather than a readOnly prop, and that
0008 — like 0006 — is required before any card write at all.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012xarEEiXiSkZzuqQYnVPGw
EOF
)"
```

---

## Verification checklist

Run through this after Task 9. Every item is a spec requirement.

- [ ] `npm run test`, `npx tsc -b`, `npm run lint`, `npm run build` all pass.
- [ ] The editor's **Narrate PPT** button is enabled and opens `/deck/:id/narrate`.
- [ ] The left slide is not editable: no caret, no selection box, no drag handles.
- [ ] The left slide matches the editor exactly, including element nudges and bold marks.
- [ ] ‹ ›, ←/→ and the slide list all step the same slide; the counter tracks; Escape returns to the editor.
- [ ] Arrow keys and space inside the textarea do **not** step the slide.
- [ ] Generate-all writes every empty slide, and the scripts read as continuous speech with transitions.
- [ ] A hand-edited script survives a regenerate; a blanked one is rewritten.
- [ ] **Reset to generated** appears only after an edit diverges, and restores the AI's exact text.
- [ ] Cancel mid-generation changes nothing and shows no error.
- [ ] ⌘Z undoes a whole generation in one step; ⌘Z undoes a typed paragraph in one step, not per character.
- [ ] Scripts survive a page reload, and survive navigating to the editor and back.
- [ ] The right panel uses only `app-*` tokens; the left slide uses only `slide-*`.
