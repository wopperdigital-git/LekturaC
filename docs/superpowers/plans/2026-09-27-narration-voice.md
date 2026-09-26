# Narration Tab: AI Icon and Cartesia Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Narration tab's two Generate buttons with an AI icon that opens the existing slide picker, and add a **Clone voice** button (bottom right of the script box) that opens a centred modal for choosing, cloning and previewing a Cartesia voice, saved per user in Supabase.

**Architecture:** All Cartesia network calls live in one module (`src/voice/cartesia.ts`); everything else is pure (settings mapping, scripts, recording rules) or UI. The chosen voice is stored in a new owner-only table `voice_settings` (migration 0014) through a small zustand store that is cleared when the signed-in user changes. The modal works on a draft and saves only on **Save voice**. The microphone is wrapped in a thin recorder whose release-on-stop/cancel behaviour is unit-tested with faked browser globals.

**Tech Stack:** React 19, TypeScript (`verbatimModuleSyntax`, `erasableSyntaxOnly`), Tailwind v4 (`app-*` tokens), zustand, Supabase, Cartesia REST API, Vitest (pure tests + SSR render smoke tests, **no jsdom**), oxlint.

**Spec:** `docs/superpowers/specs/2026-09-27-narration-voice-design.md` (the tab it changes: `2026-09-26-narration-tab-design.md`).

## Global Constraints

- **Cartesia, verbatim from the docs:** base URL `https://api.cartesia.ai`; header `Cartesia-Version: 2026-08-14`; auth `Authorization: Bearer <key>` (the only credential header the API's CORS policy allows: `Authorization, Cartesia-Version, Content-Type`); model `sonic-3.6`; endpoints `GET /voices`, `POST /voices/clone` (`multipart/form-data`: `clip`, `name`, `language`, `access`), `POST /tts/bytes` (JSON: `model_id`, `transcript`, `voice` (the id as a string), `language`, `output_format`, `generation_config`); `generation_config.speed` 0.6-1.5, `.volume` 0.5-2.0, `.emotion` a string from the documented list, **English only**.
- The key is `VITE_CARTESIA_API_KEY`, read at call time by `isCartesiaConfigured()`; baked into the client bundle **by decision** (documented tradeoff). All Cartesia calls stay in `src/voice/cartesia.ts`.
- Every network call honours the `AbortSignal`; an abort propagates as the browser's `AbortError`, never as a `CartesiaError`.
- **The microphone is always released** on stop, cancel, error and unmount.
- Six languages only: `en`, `es`, `fr`, `de`, `pt`, `it`. Reading script and preview sentences exist for each.
- Clip rules: at least `MIN_CLIP_SECONDS = 3`, auto-stop at `MAX_CLIP_SECONDS = 15`; clone name required, at most `MAX_NAME_LENGTH = 60`.
- The migration does **not** gate anything else; a project without 0014 still works (session-only voice, with a warning).
- The editor's key handler already stands down for any `aria-modal` dialog (`modalIsOpen`), so both modals get that for free.
- Panel rule: every button in the tab refuses focus on mousedown (`onMouseDown={(e) => e.preventDefault()}`).
- `verbatimModuleSyntax`: type-only imports need `import type` (or an inline `type`). `erasableSyntaxOnly`: no constructor parameter properties (assign fields in the constructor body).
- **Line endings:** repo files are CRLF; do not edit them with scripted string replacement, use the Edit tool (a scripted `replace` on a multi-line string silently misses).
- No jsdom. `npm run test` must stay green; existing tests keep passing.
- Commit steps below run once the user has approved committing (they approved the plan and native execution). Trailer: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Work on a new branch `feat/narration-voice` cut from `master`.
- Implementer subagents (if used) are dispatched with `model: "sonnet"`.

## Review Focus

1. **A closed modal must not keep the microphone or leak requests.** Closing (Escape, Cancel, backdrop) mid-recording, or while the browser's permission prompt is still open, must stop every track and abandon in-flight list/clone/preview requests. Pinned by `recorder.test.ts` (tracks stopped on stop/cancel/error; result `null` on cancel) and the abort tests in `cartesia.test.ts`; the modal-side wiring (`mountedRef`, cleanup effect) is a manual check.
2. **A different account on the same browser.** One user's voice must never show for the next. Pinned by `voiceStore.test.ts` (reset when the auth user changes; a load that finishes after the switch is discarded).
3. **Emotion for a non-English voice.** Cartesia supports emotion only for English; sending it elsewhere is a wrong-output request. Pinned in `cartesia.test.ts` (`speakBody`) and the modal test (select disabled off English).
4. **Too-short clip or blank name.** Cloning must not be offered (and not sent) for a clip under 3 s or a whitespace-only name. Pinned by `recording.test.ts` (`canClone`) and the modal test.
5. **No key configured / migration missing.** No key: no `fetch` is made and the button is disabled with a reason. No migration 0014: the voice works for the session with a warning instead of failing the save. Pinned by `cartesia.test.ts` and `voiceStore.test.ts`.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/voice/scripts.ts`, `.test.ts` | Create | Languages, reading scripts, preview sentences |
| `src/voice/settingsRow.ts`, `.test.ts` | Create | `VoiceSettings`, emotions, clamps, row mapping |
| `src/voice/recording.ts`, `.test.ts` | Create | Pure recording rules (mime pick, clock, canClone, filename) |
| `src/voice/cartesia.ts`, `.test.ts` | Create | The only file that calls Cartesia |
| `supabase/migrations/0014_voice_settings.sql`, `supabase/tests/0014_voice_rls.sql` | Create | Table + RLS (test hand-run) |
| `src/voice/voiceStore.ts`, `.test.ts` | Create | Load/save, cleared on user change |
| `src/voice/recorder.ts`, `.test.ts` | Create | `MediaRecorder` wrapper, release-on-stop tested with fakes |
| `src/components/voice/CloneVoiceModal.tsx`, `.test.tsx` | Create | The modal |
| `src/components/editor/NarrationTab.tsx`, `.test.tsx` | Modify | Footer row (AI icon + Clone voice); remove Generate buttons |
| `.env.example`, `CLAUDE.md`, spec | Modify | Docs |

---

### Task 1: Voice constants and pure settings

**Files:**
- Create: `src/voice/scripts.ts`, `src/voice/scripts.test.ts`
- Create: `src/voice/settingsRow.ts`, `src/voice/settingsRow.test.ts`
- Create: `src/voice/recording.ts`, `src/voice/recording.test.ts`

**Interfaces (produced, used by later tasks):**
- `scripts.ts`: `VOICE_LANGUAGES: readonly {code: VoiceLanguage; label: string}[]`, `type VoiceLanguage = 'en'|'es'|'fr'|'de'|'pt'|'it'`, `DEFAULT_LANGUAGE`, `isVoiceLanguage(v: unknown): v is VoiceLanguage`, `READING_SCRIPTS: Record<VoiceLanguage, string>`, `PREVIEW_SENTENCES: Record<VoiceLanguage, readonly [string, string]>`, `previewTranscript(lang: VoiceLanguage): string`.
- `settingsRow.ts`: `MIN_SPEED/MAX_SPEED/SPEED_STEP/MIN_VOLUME/MAX_VOLUME/VOLUME_STEP`, `EMOTIONS`, `type Emotion`, `isEmotion`, `type VoiceSource = 'premade'|'cloned'`, `interface VoiceSettings {voiceId: string|null; voiceName: string|null; voiceSource: VoiceSource|null; language: VoiceLanguage; speed: number; volume: number; emotion: Emotion|null}`, `DEFAULT_SETTINGS`, `clampSpeed(n)`, `clampVolume(n)`, `settingsFromRow(raw: unknown): VoiceSettings`, `rowFromSettings(s: VoiceSettings): VoiceSettingsRow`, `interface VoiceSettingsRow {voice_id: string|null; voice_name: string|null; voice_source: VoiceSource|null; language: string; speed: number; volume: number; emotion: string|null}`.
- `recording.ts`: `MIN_CLIP_SECONDS`, `MAX_CLIP_SECONDS`, `MAX_NAME_LENGTH`, `pickRecordingMime(isSupported: (mime: string) => boolean): string | null`, `formatClock(seconds: number): string`, `canClone(state: {clipSeconds: number; name: string}): boolean`, `clipFileName(mime: string): string`.

- [ ] **Step 1: Create the branch**

Run: `git checkout -b feat/narration-voice`
Expected: `Switched to a new branch 'feat/narration-voice'` (on `master`, clean tree apart from the new plan/spec docs).

- [ ] **Step 2: Write the failing tests**

`src/voice/scripts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  PREVIEW_SENTENCES,
  READING_SCRIPTS,
  VOICE_LANGUAGES,
  isVoiceLanguage,
  previewTranscript,
} from './scripts'

const words = (text: string) => text.trim().split(/\s+/).length

describe('voice scripts', () => {
  it('ships six languages, each with a reading script and two preview sentences', () => {
    expect(VOICE_LANGUAGES.map((l) => l.code)).toEqual(['en', 'es', 'fr', 'de', 'pt', 'it'])
    for (const { code } of VOICE_LANGUAGES) {
      expect(READING_SCRIPTS[code].length).toBeGreaterThan(0)
      expect(PREVIEW_SENTENCES[code]).toHaveLength(2)
    }
  })

  // Cartesia's instant clone works from about 3-10 s of clean audio: ~25 words read aloud.
  it('keeps every reading script short enough to read in roughly ten seconds', () => {
    for (const { code } of VOICE_LANGUAGES) {
      const n = words(READING_SCRIPTS[code])
      expect(n).toBeGreaterThanOrEqual(20)
      expect(n).toBeLessThanOrEqual(40)
    }
  })

  // "Two premade sentences": each entry is exactly one sentence, ending in one terminator.
  it('makes every preview exactly two single sentences', () => {
    for (const { code } of VOICE_LANGUAGES) {
      for (const sentence of PREVIEW_SENTENCES[code]) {
        expect(sentence).toMatch(/^[^.!?]+[.!?]$/)
      }
    }
  })

  it('joins the two sentences into the transcript that is spoken', () => {
    expect(previewTranscript('en')).toBe(
      'Hello, this is how your narration will sound. Every slide in your deck can be read aloud in this voice.',
    )
  })

  it('recognises only the shipped language codes', () => {
    expect(isVoiceLanguage('fr')).toBe(true)
    expect(isVoiceLanguage('ja')).toBe(false)
    expect(isVoiceLanguage(undefined)).toBe(false)
  })
})
```

`src/voice/settingsRow.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  EMOTIONS,
  MAX_SPEED,
  MAX_VOLUME,
  MIN_SPEED,
  MIN_VOLUME,
  clampSpeed,
  clampVolume,
  rowFromSettings,
  settingsFromRow,
} from './settingsRow'

describe('clamps', () => {
  it('keeps speed and volume inside Cartesia limits', () => {
    expect(clampSpeed(0.1)).toBe(MIN_SPEED)
    expect(clampSpeed(9)).toBe(MAX_SPEED)
    expect(clampVolume(0)).toBe(MIN_VOLUME)
    expect(clampVolume(9)).toBe(MAX_VOLUME)
  })

  it('rounds away float noise from a slider', () => {
    expect(clampSpeed(0.7000000000000001)).toBe(0.7)
  })

  it('falls back to 1 for a number that is not a number', () => {
    expect(clampSpeed(Number.NaN)).toBe(1)
    expect(clampVolume(Number.NaN)).toBe(1)
  })
})

describe('emotions', () => {
  it('lists the primary emotions and the full set', () => {
    for (const e of ['neutral', 'calm', 'angry', 'content', 'sad', 'scared', 'determined']) {
      expect(EMOTIONS).toContain(e)
    }
  })
})

describe('settingsFromRow', () => {
  it('reads a full row', () => {
    expect(
      settingsFromRow({
        voice_id: 'v1',
        voice_name: 'Skylar',
        voice_source: 'premade',
        language: 'fr',
        speed: 1.2,
        volume: 0.8,
        emotion: 'calm',
      }),
    ).toEqual({
      voiceId: 'v1',
      voiceName: 'Skylar',
      voiceSource: 'premade',
      language: 'fr',
      speed: 1.2,
      volume: 0.8,
      emotion: 'calm',
    })
  })

  it('reads a missing or malformed row as the defaults', () => {
    expect(settingsFromRow(null)).toEqual(DEFAULT_SETTINGS)
    expect(settingsFromRow('nope')).toEqual(DEFAULT_SETTINGS)
    expect(settingsFromRow({})).toEqual(DEFAULT_SETTINGS)
  })

  it('treats a row with no voice id as no voice at all', () => {
    const s = settingsFromRow({ voice_id: '', voice_name: 'Ghost', voice_source: 'cloned' })
    expect(s.voiceId).toBeNull()
    expect(s.voiceName).toBeNull()
    expect(s.voiceSource).toBeNull()
  })

  it('repairs out-of-range and unknown values instead of trusting them', () => {
    const s = settingsFromRow({
      voice_id: 'v1',
      language: 'ja',
      speed: 99,
      volume: '0.1',
      emotion: 'ecstatic-dragon',
      voice_source: 'stolen',
    })
    expect(s.language).toBe('en')
    expect(s.speed).toBe(MAX_SPEED)
    expect(s.volume).toBe(MIN_VOLUME)
    expect(s.emotion).toBeNull()
    expect(s.voiceSource).toBeNull()
  })

  it('round-trips through rowFromSettings', () => {
    const settings = { ...DEFAULT_SETTINGS, voiceId: 'v9', voiceName: 'Me', voiceSource: 'cloned' as const, speed: 1.1 }
    expect(settingsFromRow(rowFromSettings(settings))).toEqual(settings)
  })
})
```

`src/voice/recording.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  MAX_NAME_LENGTH,
  MIN_CLIP_SECONDS,
  canClone,
  clipFileName,
  formatClock,
  pickRecordingMime,
} from './recording'

describe('pickRecordingMime', () => {
  it('prefers webm with opus, then webm, then ogg', () => {
    expect(pickRecordingMime(() => true)).toBe('audio/webm;codecs=opus')
    expect(pickRecordingMime((m) => m === 'audio/webm')).toBe('audio/webm')
    expect(pickRecordingMime((m) => m.startsWith('audio/ogg'))).toBe('audio/ogg;codecs=opus')
  })

  // Safari records mp4/aac, which Cartesia does not accept: report "cannot", do not send it.
  it('returns null when only unsupported formats (mp4) are available', () => {
    expect(pickRecordingMime((m) => m === 'audio/mp4')).toBeNull()
    expect(pickRecordingMime(() => false)).toBeNull()
  })
})

describe('formatClock', () => {
  it('formats seconds as m:ss, rounding down', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(7.9)).toBe('0:07')
    expect(formatClock(65)).toBe('1:05')
  })

  it('never shows a negative or non-numeric time', () => {
    expect(formatClock(-3)).toBe('0:00')
    expect(formatClock(Number.NaN)).toBe('0:00')
  })
})

describe('canClone', () => {
  it('needs a clip of at least the minimum length and a name', () => {
    expect(canClone({ clipSeconds: MIN_CLIP_SECONDS, name: 'My voice' })).toBe(true)
    expect(canClone({ clipSeconds: MIN_CLIP_SECONDS - 0.1, name: 'My voice' })).toBe(false)
  })

  it('refuses a blank or whitespace-only name', () => {
    expect(canClone({ clipSeconds: 8, name: '' })).toBe(false)
    expect(canClone({ clipSeconds: 8, name: '   ' })).toBe(false)
  })

  it('refuses a name longer than the limit', () => {
    expect(canClone({ clipSeconds: 8, name: 'x'.repeat(MAX_NAME_LENGTH) })).toBe(true)
    expect(canClone({ clipSeconds: 8, name: 'x'.repeat(MAX_NAME_LENGTH + 1) })).toBe(false)
  })
})

describe('clipFileName', () => {
  it('names the upload after the format it is in', () => {
    expect(clipFileName('audio/webm;codecs=opus')).toBe('voice.webm')
    expect(clipFileName('audio/ogg;codecs=opus')).toBe('voice.ogg')
    expect(clipFileName('')).toBe('voice.webm')
  })
})
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/voice`
Expected: FAIL (three suites: "Cannot find module './scripts'", './settingsRow', './recording').

- [ ] **Step 4: Implement**

`src/voice/scripts.ts`:

```ts
/*
  The languages the voice tools support, and the words spoken in them.

  Cartesia speaks many more, but two texts here have to be in the language the voice
  will use: the passage a person reads aloud to be cloned, and the sentences the
  preview speaks. Reading English into a French clone, or previewing French with
  English words, gives the wrong result, so a language is only offered once it has
  both. Adding one is one row in each table and one entry in VOICE_LANGUAGES.
*/

export const VOICE_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
] as const

export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number]['code']

export const DEFAULT_LANGUAGE: VoiceLanguage = 'en'

export function isVoiceLanguage(value: unknown): value is VoiceLanguage {
  return VOICE_LANGUAGES.some((l) => l.code === value)
}

/** About 25 words: roughly ten seconds read aloud, which is what an instant clone wants. */
export const READING_SCRIPTS: Record<VoiceLanguage, string> = {
  en: 'The quick brown fox jumps over the lazy dog. Today I am reading at a steady, natural pace, so my voice sounds clear and calm.',
  es: 'El veloz zorro marrón salta sobre el perro perezoso. Hoy leo a un ritmo tranquilo y natural, para que mi voz suene clara y serena.',
  fr: "Le renard brun rapide saute par-dessus le chien paresseux. Aujourd'hui, je lis à un rythme régulier et naturel, pour que ma voix soit claire et calme.",
  de: 'Der schnelle braune Fuchs springt über den faulen Hund. Heute lese ich in einem ruhigen, natürlichen Tempo, damit meine Stimme klar und gelassen klingt.',
  pt: 'A rápida raposa marrom pula sobre o cão preguiçoso. Hoje leio num ritmo calmo e natural, para que a minha voz soe clara e serena.',
  it: 'La rapida volpe marrone salta sopra il cane pigro. Oggi leggo con un ritmo calmo e naturale, così la mia voce suona chiara e serena.',
}

/** The two fixed sentences the Preview button speaks. Exactly two, one terminator each. */
export const PREVIEW_SENTENCES: Record<VoiceLanguage, readonly [string, string]> = {
  en: ['Hello, this is how your narration will sound.', 'Every slide in your deck can be read aloud in this voice.'],
  es: ['Hola, así sonará tu narración.', 'Cada diapositiva de tu presentación puede leerse en voz alta con esta voz.'],
  fr: ['Bonjour, voici à quoi ressemblera votre narration.', 'Chaque diapositive de votre présentation peut être lue à voix haute avec cette voix.'],
  de: ['Hallo, so wird Ihre Erzählung klingen.', 'Jede Folie Ihrer Präsentation kann mit dieser Stimme vorgelesen werden.'],
  pt: ['Olá, é assim que a sua narração vai soar.', 'Cada slide da sua apresentação pode ser lido em voz alta com esta voz.'],
  it: ['Ciao, ecco come suonerà la tua narrazione.', 'Ogni diapositiva della tua presentazione può essere letta ad alta voce con questa voce.'],
}

export function previewTranscript(language: VoiceLanguage): string {
  return PREVIEW_SENTENCES[language].join(' ')
}
```

`src/voice/settingsRow.ts`:

```ts
import { DEFAULT_LANGUAGE, isVoiceLanguage, type VoiceLanguage } from './scripts'

/* Cartesia's documented limits for `generation_config`. */
export const MIN_SPEED = 0.6
export const MAX_SPEED = 1.5
export const SPEED_STEP = 0.05
export const MIN_VOLUME = 0.5
export const MAX_VOLUME = 2.0
export const VOLUME_STEP = 0.05

/** Cartesia's full emotion list (English only). The first six are the ones it recommends. */
export const EMOTIONS = [
  'neutral', 'calm', 'angry', 'content', 'sad', 'scared',
  'happy', 'excited', 'enthusiastic', 'elated', 'euphoric', 'triumphant', 'amazed', 'surprised',
  'flirtatious', 'curious', 'peaceful', 'serene', 'grateful', 'affectionate', 'trust',
  'sympathetic', 'anticipation', 'mysterious', 'mad', 'outraged', 'frustrated', 'agitated',
  'threatened', 'disgusted', 'contempt', 'envious', 'sarcastic', 'ironic', 'dejected',
  'melancholic', 'disappointed', 'hurt', 'guilty', 'bored', 'tired', 'rejected', 'nostalgic',
  'wistful', 'apologetic', 'hesitant', 'insecure', 'confused', 'resigned', 'anxious', 'panicked',
  'alarmed', 'proud', 'confident', 'distant', 'skeptical', 'contemplative', 'determined',
] as const

export type Emotion = (typeof EMOTIONS)[number]

export function isEmotion(value: unknown): value is Emotion {
  return typeof value === 'string' && (EMOTIONS as readonly string[]).includes(value)
}

export type VoiceSource = 'premade' | 'cloned'

export interface VoiceSettings {
  voiceId: string | null
  voiceName: string | null
  voiceSource: VoiceSource | null
  language: VoiceLanguage
  speed: number
  volume: number
  emotion: Emotion | null
}

export const DEFAULT_SETTINGS: VoiceSettings = {
  voiceId: null,
  voiceName: null,
  voiceSource: null,
  language: DEFAULT_LANGUAGE,
  speed: 1,
  volume: 1,
  emotion: null,
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return 1
  // Two decimals: a slider step of 0.05 accumulates float noise otherwise.
  return Math.round(Math.min(Math.max(n, min), max) * 100) / 100
}

export const clampSpeed = (n: number) => clamp(n, MIN_SPEED, MAX_SPEED)
export const clampVolume = (n: number) => clamp(n, MIN_VOLUME, MAX_VOLUME)

/** The `voice_settings` row, as the database names it. */
export interface VoiceSettingsRow {
  voice_id: string | null
  voice_name: string | null
  voice_source: VoiceSource | null
  language: string
  speed: number
  volume: number
  emotion: string | null
}

/**
 * Reads whatever the database returned, repairing rather than trusting it: an unknown
 * language becomes English, out-of-range numbers are clamped, an unknown emotion or
 * source is dropped, and a row with no voice id is no voice at all.
 */
export function settingsFromRow(raw: unknown): VoiceSettings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS }
  const row = raw as Record<string, unknown>

  const voiceId = typeof row.voice_id === 'string' && row.voice_id !== '' ? row.voice_id : null
  const source = row.voice_source === 'premade' || row.voice_source === 'cloned' ? row.voice_source : null

  return {
    voiceId,
    voiceName: voiceId !== null && typeof row.voice_name === 'string' ? row.voice_name : null,
    voiceSource: voiceId !== null ? source : null,
    language: isVoiceLanguage(row.language) ? row.language : DEFAULT_LANGUAGE,
    // `numeric` columns can come back as strings; Number() takes both.
    speed: row.speed === undefined || row.speed === null ? 1 : clampSpeed(Number(row.speed)),
    volume: row.volume === undefined || row.volume === null ? 1 : clampVolume(Number(row.volume)),
    emotion: isEmotion(row.emotion) ? row.emotion : null,
  }
}

export function rowFromSettings(s: VoiceSettings): VoiceSettingsRow {
  return {
    voice_id: s.voiceId,
    voice_name: s.voiceName,
    voice_source: s.voiceSource,
    language: s.language,
    speed: clampSpeed(s.speed),
    volume: clampVolume(s.volume),
    emotion: s.emotion,
  }
}
```

`src/voice/recording.ts`:

```ts
/*
  The rules about a recording that need no browser: how long, what format, when a clip
  is good enough to clone. Kept apart from `recorder.ts` (which touches the microphone)
  so they can be tested without one.
*/

/** Cartesia's instant clone works from about 3-10 s of clean audio. */
export const MIN_CLIP_SECONDS = 3
/** Recording stops by itself here: a longer clip adds nothing and invites background noise. */
export const MAX_CLIP_SECONDS = 15
export const MAX_NAME_LENGTH = 60

/* Formats Cartesia accepts (flac, mp3, mpeg, mpga, oga, ogg, wav, webm), best first. Safari's
   mp4/aac is not among them, so a browser that can only produce it is reported as unable. */
const CANDIDATE_MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']

export function pickRecordingMime(isSupported: (mime: string) => boolean): string | null {
  return CANDIDATE_MIMES.find((mime) => isSupported(mime)) ?? null
}

/** `m:ss` from a number of seconds, rounded down; never negative. */
export function formatClock(seconds: number): string {
  const whole = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

export function canClone({ clipSeconds, name }: { clipSeconds: number; name: string }): boolean {
  const trimmed = name.trim()
  return clipSeconds >= MIN_CLIP_SECONDS && trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH
}

/** Cartesia reads the format from the upload's extension, so name it after what it is. */
export function clipFileName(mime: string): string {
  return mime.startsWith('audio/ogg') ? 'voice.ogg' : 'voice.webm'
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/voice`
Expected: PASS (three suites).

- [ ] **Step 6: Type-check, lint, commit**

Run: `npx tsc -b && npm run lint`
Expected: no errors from `src/voice`.

```bash
git add src/voice docs/superpowers/specs/2026-09-27-narration-voice-design.md docs/superpowers/plans/2026-09-27-narration-voice.md
git commit -m "feat(voice): languages, scripts, settings mapping and recording rules

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: The Cartesia client

**Files:**
- Create: `src/voice/cartesia.ts`, `src/voice/cartesia.test.ts`

**Interfaces:**
- Consumes: `clipFileName` (`recording.ts`), `clampSpeed`/`clampVolume` and `Emotion` (`settingsRow.ts`), `VoiceLanguage` (`scripts.ts`).
- Produces:
  - `isCartesiaConfigured(): boolean` (reads the env at call time)
  - `class CartesiaError extends Error { kind: 'auth'|'capacity'|'request'|'unknown'; status?: number }`
  - `interface VoiceSummary { id: string; name: string; tagline: string; description: string; gender: string; language: string }`
  - `parseVoices(body: unknown): VoiceSummary[]`, `parseVoice(body: unknown): VoiceSummary | null`
  - `listVoices(o: { mine: boolean; language?: string; q?: string; signal?: AbortSignal }): Promise<VoiceSummary[]>`
  - `cloneVoice(o: { clip: Blob; name: string; language: string; signal?: AbortSignal }): Promise<VoiceSummary>`
  - `interface SpeakOptions { voiceId: string; transcript: string; language: VoiceLanguage; speed: number; volume: number; emotion: Emotion | null; signal?: AbortSignal }`, `speakBody(o: SpeakOptions): Record<string, unknown>`, `speak(o: SpeakOptions): Promise<Blob>`

- [ ] **Step 1: Write the failing tests**

`src/voice/cartesia.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CartesiaError,
  cloneVoice,
  isCartesiaConfigured,
  listVoices,
  parseVoices,
  speak,
  speakBody,
} from './cartesia'

/*
  Against a mocked `fetch`, like the AI provider tests: what is being checked is the
  request that would be sent (URL, headers, body) and what each failure is reported as.
*/

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubEnv('VITE_CARTESIA_API_KEY', 'sk_car_test')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const voice = { id: 'v1', name: 'Skylar', tagline: 'Friendly Guide', description: 'Warm.', gender: 'feminine', language: 'en' }

describe('isCartesiaConfigured', () => {
  it('reflects whether a key is set, at call time', () => {
    expect(isCartesiaConfigured()).toBe(true)
    vi.stubEnv('VITE_CARTESIA_API_KEY', '   ')
    expect(isCartesiaConfigured()).toBe(false)
  })
})

describe('parseVoices', () => {
  it('reads the data array and drops entries without an id or a name', () => {
    const out = parseVoices({ data: [voice, { id: '', name: 'x' }, { id: 'v2' }, 'junk', { id: 'v3', name: 'Ok' }] })
    expect(out.map((v) => v.id)).toEqual(['v1', 'v3'])
    expect(out[1]).toEqual({ id: 'v3', name: 'Ok', tagline: '', description: '', gender: '', language: '' })
  })

  it('reads a body with no data as no voices', () => {
    expect(parseVoices({})).toEqual([])
    expect(parseVoices(null)).toEqual([])
  })
})

describe('listVoices', () => {
  it('asks for the first 100 voices, filtered, with the key and version headers', async () => {
    fetchMock.mockResolvedValue(json({ data: [voice], has_more: false }))
    const out = await listVoices({ mine: false, language: 'fr', q: '  calm ' })

    expect(out).toHaveLength(1)
    const [url, init] = fetchMock.mock.calls[0]
    const u = new URL(url as string)
    expect(u.origin + u.pathname).toBe('https://api.cartesia.ai/voices')
    expect(u.searchParams.get('limit')).toBe('100')
    expect(u.searchParams.get('is_owner')).toBe('false')
    expect(u.searchParams.get('language')).toBe('fr')
    expect(u.searchParams.get('q')).toBe('calm')
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer sk_car_test')
    expect(init.headers['Cartesia-Version']).toBe('2026-08-14')
  })

  it('leaves out an empty search and no language', async () => {
    fetchMock.mockResolvedValue(json({ data: [] }))
    await listVoices({ mine: true, q: '  ' })
    const u = new URL(fetchMock.mock.calls[0][0] as string)
    expect(u.searchParams.get('is_owner')).toBe('true')
    expect(u.searchParams.has('q')).toBe(false)
    expect(u.searchParams.has('language')).toBe(false)
  })
})

describe('cloneVoice', () => {
  it('uploads the clip as multipart form data, private, and returns the new voice', async () => {
    fetchMock.mockResolvedValue(json(voice))
    const clip = new Blob(['audio'], { type: 'audio/webm;codecs=opus' })
    const out = await cloneVoice({ clip, name: '  My voice ', language: 'en' })

    expect(out.id).toBe('v1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.cartesia.ai/voices/clone')
    expect(init.method).toBe('POST')
    const form = init.body as FormData
    expect(form.get('name')).toBe('My voice')
    expect(form.get('language')).toBe('en')
    expect(form.get('access')).toBe('private')
    expect((form.get('clip') as File).name).toBe('voice.webm')
    // The browser has to set the multipart boundary itself.
    expect(init.headers['Content-Type']).toBeUndefined()
  })

  it('reports a reply that is not a voice as an error', async () => {
    fetchMock.mockResolvedValue(json({ nope: true }))
    await expect(cloneVoice({ clip: new Blob(['a']), name: 'x', language: 'en' })).rejects.toBeInstanceOf(CartesiaError)
  })
})

describe('speakBody', () => {
  const base = { voiceId: 'v1', transcript: 'Hi.', language: 'en' as const, speed: 1.2, volume: 0.9, emotion: 'calm' as const }

  it('builds the documented request', () => {
    expect(speakBody(base)).toEqual({
      model_id: 'sonic-3.6',
      transcript: 'Hi.',
      voice: 'v1',
      language: 'en',
      output_format: { container: 'wav', encoding: 'pcm_f32le', sample_rate: 44100 },
      generation_config: { speed: 1.2, volume: 0.9, emotion: 'calm' },
    })
  })

  // Cartesia supports emotion for English only; elsewhere it is a wrong-output request.
  it('sends no emotion for a language other than English', () => {
    const body = speakBody({ ...base, language: 'fr' })
    expect(body.generation_config).toEqual({ speed: 1.2, volume: 0.9 })
  })

  it('sends no emotion when none is chosen', () => {
    expect(speakBody({ ...base, emotion: null }).generation_config).toEqual({ speed: 1.2, volume: 0.9 })
  })

  it('clamps speed and volume to Cartesia limits', () => {
    expect(speakBody({ ...base, speed: 9, volume: 0 }).generation_config).toMatchObject({ speed: 1.5, volume: 0.5 })
  })
})

describe('speak', () => {
  it('posts JSON and returns the audio', async () => {
    fetchMock.mockResolvedValue(new Response(new Blob(['RIFF']), { status: 200 }))
    const blob = await speak({ voiceId: 'v1', transcript: 'Hi.', language: 'en', speed: 1, volume: 1, emotion: null })

    expect(blob.size).toBeGreaterThan(0)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.cartesia.ai/tts/bytes')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body as string).voice).toBe('v1')
  })
})

describe('errors', () => {
  const call = () => listVoices({ mine: false })

  it('reports no key without making a request', async () => {
    vi.stubEnv('VITE_CARTESIA_API_KEY', '')
    await expect(call()).rejects.toMatchObject({ kind: 'auth' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps 401 to an auth error that names the key', async () => {
    fetchMock.mockResolvedValue(json({}, 401))
    await expect(call()).rejects.toMatchObject({ kind: 'auth', status: 401, message: expect.stringContaining('API key') })
  })

  it('maps 403 to an auth error and keeps the server\'s reason', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Voice cloning is not on your plan' }, 403))
    await expect(call()).rejects.toMatchObject({ kind: 'auth', message: expect.stringContaining('not on your plan') })
  })

  it('maps 429 and 503 to a busy error', async () => {
    fetchMock.mockResolvedValue(json({}, 429))
    await expect(call()).rejects.toMatchObject({ kind: 'capacity' })
    fetchMock.mockResolvedValue(json({}, 503))
    await expect(call()).rejects.toMatchObject({ kind: 'capacity' })
  })

  it('maps another 4xx to a request error with the server message', async () => {
    fetchMock.mockResolvedValue(json({ message: 'clip is too short' }, 400))
    await expect(call()).rejects.toMatchObject({ kind: 'request', status: 400, message: 'clip is too short' })
  })

  it('maps a network failure to an unknown error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(call()).rejects.toMatchObject({ kind: 'unknown' })
  })

  // A cancel must stay a cancel: the caller tells it apart by `signal.aborted`.
  it('lets an abort through as an AbortError, not a Cartesia error', async () => {
    fetchMock.mockRejectedValue(new DOMException('Aborted', 'AbortError'))
    const controller = new AbortController()
    controller.abort()
    const result = listVoices({ mine: false, signal: controller.signal })
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    await expect(result).rejects.not.toBeInstanceOf(CartesiaError)
  })

  it('passes the abort signal on to fetch', async () => {
    fetchMock.mockResolvedValue(json({ data: [] }))
    const controller = new AbortController()
    await listVoices({ mine: false, signal: controller.signal })
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/voice/cartesia.test.ts`
Expected: FAIL ("Cannot find module './cartesia'").

- [ ] **Step 3: Implement `src/voice/cartesia.ts`**

```ts
import { clipFileName } from './recording'
import { clampSpeed, clampVolume, type Emotion } from './settingsRow'
import type { VoiceLanguage } from './scripts'

/*
  The one file that talks to Cartesia. Everything else in `src/voice/` is pure or UI.

  The key is `VITE_CARTESIA_API_KEY`, read into the client bundle by decision: cloning
  and listing voices need a full API key (Cartesia's short-lived browser tokens only
  cover speech), and this app has no server. Cartesia's own advice is never to put a
  key in a client app, because it grants full account access, so a deployed build lets
  anyone who loads it spend on the account. If that ever matters, replace this file
  with calls to a proxy; nothing else knows how the requests are made.

  Browser access works: the API allows `Authorization`, `Cartesia-Version` and
  `Content-Type` from any origin, which is why the key travels as `Authorization`.
*/

export const CARTESIA_URL = 'https://api.cartesia.ai'
export const CARTESIA_VERSION = '2026-08-14'
export const CARTESIA_MODEL = 'sonic-3.6'

function apiKey(): string {
  return (import.meta.env.VITE_CARTESIA_API_KEY ?? '').trim()
}

/** Read at call time so a key added to `.env` is seen and a test can set one. */
export function isCartesiaConfigured(): boolean {
  return apiKey() !== ''
}

export type CartesiaErrorKind = 'auth' | 'capacity' | 'request' | 'unknown'

export class CartesiaError extends Error {
  kind: CartesiaErrorKind
  status?: number

  constructor(message: string, kind: CartesiaErrorKind, status?: number) {
    super(message)
    this.name = 'CartesiaError'
    this.kind = kind
    this.status = status
  }
}

export interface VoiceSummary {
  id: string
  name: string
  tagline: string
  description: string
  gender: string
  language: string
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '')

/** One voice, or `null` if it has no id or no name (nothing could select or show it). */
export function parseVoice(raw: unknown): VoiceSummary | null {
  if (typeof raw !== 'object' || raw === null) return null
  const v = raw as Record<string, unknown>
  const id = text(v.id)
  const name = text(v.name)
  if (id === '' || name === '') return null
  return { id, name, tagline: text(v.tagline), description: text(v.description), gender: text(v.gender), language: text(v.language) }
}

export function parseVoices(body: unknown): VoiceSummary[] {
  const data = typeof body === 'object' && body !== null ? (body as { data?: unknown }).data : undefined
  if (!Array.isArray(data)) return []
  return data.map(parseVoice).filter((v): v is VoiceSummary => v !== null)
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

async function errorFor(res: Response): Promise<CartesiaError> {
  let detail = ''
  try {
    const body: unknown = await res.json()
    if (typeof body === 'object' && body !== null) {
      const b = body as { message?: unknown; error?: unknown }
      detail = typeof b.message === 'string' ? b.message : typeof b.error === 'string' ? b.error : ''
    }
  } catch {
    // No readable body: the status alone has to do.
  }
  if (res.status === 401) {
    return new CartesiaError('Cartesia rejected the API key. Check VITE_CARTESIA_API_KEY.', 'auth', 401)
  }
  if (res.status === 403) {
    return new CartesiaError(
      detail ? `Cartesia refused the request: ${detail}` : 'Cartesia rejected the API key or your plan does not allow this.',
      'auth',
      403,
    )
  }
  if (res.status === 429 || res.status === 503) {
    return new CartesiaError('Cartesia is busy right now. Try again in a moment.', 'capacity', res.status)
  }
  return new CartesiaError(
    detail || `Cartesia returned an error (${res.status}).`,
    res.status >= 400 && res.status < 500 ? 'request' : 'unknown',
    res.status,
  )
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${apiKey()}`, 'Cartesia-Version': CARTESIA_VERSION, ...extra }
}

async function send(path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  if (!isCartesiaConfigured()) {
    throw new CartesiaError('Add VITE_CARTESIA_API_KEY to your .env file to use voices.', 'auth')
  }
  let res: Response
  try {
    res = await fetch(`${CARTESIA_URL}${path}`, { ...init, signal })
  } catch (err) {
    // A cancel is not a failure to report: let it through for the caller to recognise.
    if (signal?.aborted || isAbort(err)) throw err
    throw new CartesiaError('Could not reach Cartesia. Check your connection and try again.', 'unknown')
  }
  if (!res.ok) throw await errorFor(res)
  return res
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    throw new CartesiaError('Cartesia sent a reply the app could not read.', 'unknown')
  }
}

/** The first 100 voices, premade (`mine: false`) or the account's own (`mine: true`). */
export async function listVoices(o: {
  mine: boolean
  language?: string
  q?: string
  signal?: AbortSignal
}): Promise<VoiceSummary[]> {
  const params = new URLSearchParams({ limit: '100', is_owner: String(o.mine) })
  if (o.language) params.set('language', o.language)
  const q = o.q?.trim()
  if (q) params.set('q', q)
  const res = await send(`/voices?${params.toString()}`, { method: 'GET', headers: headers() }, o.signal)
  return parseVoices(await readJson(res))
}

/** Clones a voice from a recorded clip. The language must be the one the clip was spoken in. */
export async function cloneVoice(o: {
  clip: Blob
  name: string
  language: string
  signal?: AbortSignal
}): Promise<VoiceSummary> {
  const form = new FormData()
  form.append('clip', o.clip, clipFileName(o.clip.type))
  form.append('name', o.name.trim())
  form.append('language', o.language)
  form.append('access', 'private')
  // No Content-Type: the browser has to set the multipart boundary itself.
  const res = await send('/voices/clone', { method: 'POST', headers: headers(), body: form }, o.signal)
  const voice = parseVoice(await readJson(res))
  if (!voice) throw new CartesiaError('Cartesia did not return the new voice.', 'unknown')
  return voice
}

export interface SpeakOptions {
  voiceId: string
  transcript: string
  language: VoiceLanguage
  speed: number
  volume: number
  emotion: Emotion | null
  signal?: AbortSignal
}

/** The JSON for `POST /tts/bytes`. Pure, so it can be checked without a request. */
export function speakBody(o: SpeakOptions): Record<string, unknown> {
  return {
    model_id: CARTESIA_MODEL,
    transcript: o.transcript,
    voice: o.voiceId,
    language: o.language,
    output_format: { container: 'wav', encoding: 'pcm_f32le', sample_rate: 44100 },
    generation_config: {
      speed: clampSpeed(o.speed),
      volume: clampVolume(o.volume),
      // Cartesia supports emotion for English only; elsewhere it would be a wrong-output request.
      ...(o.emotion && o.language === 'en' ? { emotion: o.emotion } : {}),
    },
  }
}

export async function speak(o: SpeakOptions): Promise<Blob> {
  const res = await send(
    '/tts/bytes',
    { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(speakBody(o)) },
    o.signal,
  )
  return res.blob()
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/voice/cartesia.test.ts`
Expected: PASS. If a `Response`-related assertion fails in this Node version, print the failing value before changing the code.

- [ ] **Step 5: Mutation-check the two safety rules, then commit**

Temporarily change `o.language === 'en'` to `true` in `speakBody`; run `npx vitest run src/voice/cartesia.test.ts` and confirm "sends no emotion for a language other than English" FAILS; revert. Temporarily delete the `if (signal?.aborted || isAbort(err)) throw err` line; confirm the AbortError test FAILS; revert. Then:

Run: `npx tsc -b && npm run lint` (no errors from `src/voice`), then

```bash
git add src/voice/cartesia.ts src/voice/cartesia.test.ts
git commit -m "feat(voice): Cartesia client (list, clone, speak) with abort and error mapping

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Saved voice: migration, store, env docs

**Files:**
- Create: `supabase/migrations/0014_voice_settings.sql`, `supabase/tests/0014_voice_rls.sql`
- Create: `src/voice/voiceStore.ts`, `src/voice/voiceStore.test.ts`
- Modify: `.env.example` (append)

**Interfaces:**
- Consumes: `VoiceSettings`, `DEFAULT_SETTINGS`, `settingsFromRow`, `rowFromSettings` (Task 1); `supabase` from `@/lib/supabaseClient`; `useAuthStore` from `@/store/authStore` (`state.user?.id`).
- Produces: `useVoiceStore` (zustand) with `settings: VoiceSettings`, `loaded: boolean`, `status: 'idle'|'loading'|'saving'`, `warning: string|null`, `error: string|null`, `load(): Promise<void>` (always resolves), `save(next: VoiceSettings): Promise<boolean>`, `reset(): void`.

- [ ] **Step 1: Write the migration and its hand-run test**

`supabase/migrations/0014_voice_settings.sql`:

```sql
-- The narration voice a user picked (or cloned) with Cartesia, and how it should sound.
--
-- One row per user, owner-only. It is deliberately NOT a column on `profiles`: the
-- profiles_select policy (0009) lets a teacher read their students' profiles and the
-- reverse, so a voice choice stored there would be visible to classmates.
--
-- The voice itself lives in the user's Cartesia account; this row only remembers which
-- voice was picked and its settings. Deleting an account (delete_own_account deletes the
-- auth user) removes the row by cascade; it cannot delete the cloned voices from Cartesia.
--
-- Does NOT gate anything else: nothing but the Clone voice modal reads it, and a project
-- that has not run this migration works normally (the voice then lasts for the session).
create table if not exists voice_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  voice_id text,
  voice_name text,
  voice_source text check (voice_source in ('premade', 'cloned')),
  language text not null default 'en',
  speed numeric not null default 1,
  volume numeric not null default 1,
  emotion text,
  updated_at timestamptz not null default now()
);

alter table voice_settings enable row level security;

drop policy if exists voice_settings_owner on voice_settings;
create policy voice_settings_owner on voice_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

`supabase/tests/0014_voice_rls.sql`:

```sql
-- Hand-run checks for 0014_voice_settings.sql.
--
-- Paste into the Supabase SQL editor (runs as postgres) after applying 0014. One
-- transaction that rolls back, so no fixture survives. Any failed check raises and
-- aborts with a message naming it; a clean run ends by printing "voice settings
-- checks passed". Same shape as 0009_classroom_rls.sql: fixtures as postgres, then
-- each check under `set local role authenticated` with a forged jwt claim.
--
-- NOT YET RUN against a database.

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a200-000000000001', 'voice-a@example.test', '{"display_name":"Vera Voice"}'),
  ('00000000-0000-4000-a200-000000000002', 'voice-b@example.test', '{"display_name":"Vic Voice"}');

set local role authenticated;

-- ── user A writes and reads their own row ───────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a200-000000000001","role":"authenticated"}', true);

insert into voice_settings (user_id, voice_id, voice_name, voice_source, language)
values ('00000000-0000-4000-a200-000000000001', 'v-a', 'A voice', 'cloned', 'en');

do $$ begin
  if (select count(*) from voice_settings) <> 1 then
    raise exception 'own row: user A cannot read the row they wrote';
  end if;
end $$;

-- ── user A cannot write a row for user B ────────────────────────────────────
do $$ begin
  begin
    insert into voice_settings (user_id, voice_id) values ('00000000-0000-4000-a200-000000000002', 'x');
    raise exception 'rls: user A inserted a row for user B';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── a source outside premade/cloned is refused ──────────────────────────────
do $$ begin
  begin
    update voice_settings set voice_source = 'stolen'
      where user_id = '00000000-0000-4000-a200-000000000001';
    raise exception 'check: an unknown voice_source was accepted';
  exception when check_violation then null;
  end;
end $$;

-- ── user B sees none of A's row and cannot change it ────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a200-000000000002","role":"authenticated"}', true);

do $$
declare n integer;
begin
  if (select count(*) from voice_settings) <> 0 then
    raise exception 'rls: user B can read user A''s voice settings';
  end if;
  update voice_settings set voice_id = 'hijack'
    where user_id = '00000000-0000-4000-a200-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'rls: user B updated user A''s voice settings';
  end if;
end $$;

-- ── deleting the account takes the row with it ──────────────────────────────
reset role;

delete from auth.users where id = '00000000-0000-4000-a200-000000000001';

do $$ begin
  if exists (select 1 from voice_settings where user_id = '00000000-0000-4000-a200-000000000001') then
    raise exception 'cascade: the row outlived its user';
  end if;
end $$;

do $$ begin raise notice 'voice settings checks passed'; end $$;

rollback;
```

- [ ] **Step 2: Write the failing store tests**

`src/voice/voiceStore.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from './settingsRow'

/*
  Supabase and the auth store are mocked: what is checked is which calls are made, what
  a missing table or a failed write becomes, and that one account's voice never survives
  into the next.
*/

let selectResult: { data: unknown; error: { code?: string; message?: string } | null } = { data: null, error: null }
let upsertResult: { error: { code?: string; message?: string } | null } = { error: null }
const upserts: unknown[] = []
let userId: string | null = 'user-1'
// An array, not a `let ... | null`: TypeScript narrows a closure-assigned `let` to `null` at the use site.
const authListeners: Array<(state: { user: { id: string } | null }) => void> = []
const switchUserTo = (id: string) => authListeners.forEach((fn) => fn({ user: { id } }))
let holdSelect: Promise<void> | null = null

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (holdSelect) await holdSelect
            return selectResult
          },
        }),
      }),
      upsert: async (row: unknown) => {
        upserts.push(row)
        return upsertResult
      },
    }),
  },
}))

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({ user: userId ? { id: userId } : null }),
    subscribe: (fn: (state: { user: { id: string } | null }) => void) => {
      authListeners.push(fn)
      return () => {}
    },
  },
}))

const { useVoiceStore } = await import('./voiceStore')

const row = { voice_id: 'v1', voice_name: 'Skylar', voice_source: 'premade', language: 'fr', speed: 1.2, volume: 1, emotion: null }

beforeEach(() => {
  selectResult = { data: null, error: null }
  upsertResult = { error: null }
  upserts.length = 0
  userId = 'user-1'
  holdSelect = null
  useVoiceStore.getState().reset()
})

describe('load', () => {
  it('reads the saved voice', async () => {
    selectResult = { data: row, error: null }
    await useVoiceStore.getState().load()
    const s = useVoiceStore.getState()
    expect(s.settings).toMatchObject({ voiceId: 'v1', voiceName: 'Skylar', language: 'fr', speed: 1.2 })
    expect(s.loaded).toBe(true)
    expect(s.warning).toBeNull()
  })

  it('uses the defaults for a user who has not saved one', async () => {
    await useVoiceStore.getState().load()
    expect(useVoiceStore.getState().settings).toEqual(DEFAULT_SETTINGS)
    expect(useVoiceStore.getState().loaded).toBe(true)
  })

  // 42P01 = undefined_table; PGRST205 = PostgREST's "table not in the schema cache".
  it.each(['42P01', 'PGRST205'])('says to run migration 0014 when the table is missing (%s)', async (code) => {
    selectResult = { data: null, error: { code, message: 'no table' } }
    await useVoiceStore.getState().load()
    expect(useVoiceStore.getState().warning).toContain('0014')
    expect(useVoiceStore.getState().loaded).toBe(true)
  })

  it('warns, and stays unloaded so the next open retries, on any other failure', async () => {
    selectResult = { data: null, error: { code: '500', message: 'boom' } }
    await useVoiceStore.getState().load()
    expect(useVoiceStore.getState().warning).toContain('Could not load')
    expect(useVoiceStore.getState().loaded).toBe(false)
  })
})

describe('save', () => {
  const next = { ...DEFAULT_SETTINGS, voiceId: 'v9', voiceName: 'Me', voiceSource: 'cloned' as const, speed: 1.1 }

  it('upserts the row for the signed-in user and keeps the result', async () => {
    expect(await useVoiceStore.getState().save(next)).toBe(true)
    expect(upserts[0]).toMatchObject({ user_id: 'user-1', voice_id: 'v9', voice_source: 'cloned', speed: 1.1 })
    expect(useVoiceStore.getState().settings.voiceId).toBe('v9')
    expect(useVoiceStore.getState().status).toBe('idle')
  })

  it('keeps the voice for the session, with a warning, when the table is missing', async () => {
    upsertResult = { error: { code: '42P01', message: 'no table' } }
    expect(await useVoiceStore.getState().save(next)).toBe(true)
    expect(useVoiceStore.getState().settings.voiceId).toBe('v9')
    expect(useVoiceStore.getState().warning).toContain('0014')
  })

  it('reports another failure and keeps the old settings', async () => {
    upsertResult = { error: { code: '500', message: 'boom' } }
    expect(await useVoiceStore.getState().save(next)).toBe(false)
    expect(useVoiceStore.getState().error).toContain('could not be saved')
    expect(useVoiceStore.getState().settings.voiceId).toBeNull()
  })

  it('refuses when nobody is signed in', async () => {
    userId = null
    expect(await useVoiceStore.getState().save(next)).toBe(false)
    expect(upserts).toHaveLength(0)
  })
})

describe('when the signed-in user changes', () => {
  // One account's voice must never show for the next on a shared browser.
  it('drops the previous user\'s voice', async () => {
    selectResult = { data: row, error: null }
    await useVoiceStore.getState().load()
    expect(useVoiceStore.getState().settings.voiceId).toBe('v1')

    switchUserTo('user-2')

    expect(useVoiceStore.getState().settings).toEqual(DEFAULT_SETTINGS)
    expect(useVoiceStore.getState().loaded).toBe(false)
  })

  it('discards a load that finishes after the switch', async () => {
    selectResult = { data: row, error: null }
    let release: () => void = () => {}
    holdSelect = new Promise<void>((resolve) => {
      release = resolve
    })
    const pending = useVoiceStore.getState().load()

    switchUserTo('user-3')
    release()
    await pending

    expect(useVoiceStore.getState().settings).toEqual(DEFAULT_SETTINGS)
    expect(useVoiceStore.getState().loaded).toBe(false)
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/voice/voiceStore.test.ts`
Expected: FAIL ("Cannot find module './voiceStore'").

- [ ] **Step 4: Implement `src/voice/voiceStore.ts`**

```ts
import { create } from 'zustand'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/store/authStore'
import { DEFAULT_SETTINGS, rowFromSettings, settingsFromRow, type VoiceSettings } from './settingsRow'

/*
  The signed-in user's chosen voice, kept in `voice_settings` (migration 0014).

  Loaded when the Clone voice modal opens, not at startup: nothing else needs it. A
  project without the migration still works: the voice lasts for the session and the
  modal says how to make it stick.

  Cleared whenever the signed-in user changes, so one account's voice is never shown to
  the next on a shared browser (the same reason `briefDrafts` namespaces its key). A load
  still in flight when the user changes is discarded by the `request` counter.
*/

/** 42P01: Postgres "undefined_table". PGRST205: PostgREST "table not in the schema cache". */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

const MIGRATION_WARNING = 'Run migration 0014 in Supabase to save your voice. It will work for this session only.'

interface VoiceState {
  settings: VoiceSettings
  loaded: boolean
  status: 'idle' | 'loading' | 'saving'
  /** A problem that does not stop the modal working (missing migration, failed read). */
  warning: string | null
  /** A failed save. */
  error: string | null
  /** Always resolves; failures land in `warning`. */
  load: () => Promise<void>
  /** Resolves true when the voice is in effect (saved, or kept for the session). */
  save: (next: VoiceSettings) => Promise<boolean>
  reset: () => void
}

let request = 0

const EMPTY = {
  settings: { ...DEFAULT_SETTINGS },
  loaded: false,
  status: 'idle' as const,
  warning: null,
  error: null,
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  ...EMPTY,

  async load() {
    const uid = useAuthStore.getState().user?.id
    if (!supabase || !uid) return
    const mine = ++request
    set({ status: 'loading', warning: null })

    const { data, error } = await supabase.from('voice_settings').select('*').eq('user_id', uid).maybeSingle()
    // The user changed (or reset ran) while this was in flight: it is not theirs any more.
    if (mine !== request) return

    if (error) {
      if (isMissingTable(error)) set({ status: 'idle', loaded: true, warning: MIGRATION_WARNING })
      else set({ status: 'idle', warning: 'Could not load your saved voice.' })
      return
    }
    set({ status: 'idle', loaded: true, settings: settingsFromRow(data) })
  },

  async save(next) {
    const uid = useAuthStore.getState().user?.id
    if (!supabase || !uid) {
      set({ error: 'Sign in to save your voice.' })
      return false
    }
    const mine = request
    set({ status: 'saving', error: null })

    const { error } = await supabase
      .from('voice_settings')
      .upsert({ user_id: uid, ...rowFromSettings(next), updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (mine !== request) return false

    if (error && !isMissingTable(error)) {
      set({ status: 'idle', error: 'Your voice could not be saved. Try again.' })
      return false
    }
    // Saved, or the table is missing and the choice is kept for this session.
    set({ status: 'idle', settings: next, warning: error ? MIGRATION_WARNING : null })
    return true
  },

  reset() {
    request++
    set({ ...EMPTY, settings: { ...DEFAULT_SETTINGS } })
  },
}))

let lastUserId = useAuthStore.getState().user?.id ?? null
useAuthStore.subscribe((state) => {
  const uid = state.user?.id ?? null
  if (uid === lastUserId) return
  lastUserId = uid
  useVoiceStore.getState().reset()
})
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/voice/voiceStore.test.ts`
Expected: PASS (all tests, including both `it.each` cases).

- [ ] **Step 6: Document the key**

Append to `.env.example`:

```
# Cartesia (voice cloning and preview in the Narration tab's Clone voice modal).
# Get one at play.cartesia.ai/keys. BILLED against your Cartesia account, and
# unlike the AI keys above it is a FULL-ACCOUNT key: anyone who loads a built app
# can read it, spend on it, and list or delete your voices. Cartesia itself says
# never to put a key in a client app; this is local/personal dev only. All calls
# live in src/voice/cartesia.ts, so a server proxy can replace them later.
# Without it the Clone voice button is disabled.
VITE_CARTESIA_API_KEY=
```

- [ ] **Step 7: Mutation-check, verify, commit**

Temporarily remove the `if (mine !== request) return` line in `load`; confirm "discards a load that finishes after the switch" FAILS; revert. Then:

Run: `npx tsc -b && npm run lint && npx vitest run src/voice`
Expected: no errors; all voice tests pass.

```bash
git add supabase src/voice/voiceStore.ts src/voice/voiceStore.test.ts .env.example
git commit -m "feat(voice): voice_settings table (0014) and a store cleared on user change

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: The microphone recorder

**Files:**
- Create: `src/voice/recorder.ts`, `src/voice/recorder.test.ts`

**Interfaces:**
- Consumes: `pickRecordingMime` (Task 1).
- Produces:
  - `type RecordingFailure = 'unsupported' | 'denied' | 'no-device' | 'failed'`
  - `class RecordingError extends Error { reason: RecordingFailure }`
  - `interface Recording { blob: Blob; seconds: number; mime: string }`
  - `interface Recorder { result: Promise<Recording | null>; stop(): void; cancel(): void }` (`result` resolves `null` after `cancel()`)
  - `recordingSupport(): { supported: true; mime: string } | { supported: false; message: string }`
  - `startRecording(o: { mime: string; maxSeconds: number; onTick: (seconds: number) => void }): Promise<Recorder>`

- [ ] **Step 1: Write the failing tests (faked browser globals)**

`src/voice/recorder.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecordingError, recordingSupport, startRecording } from './recorder'

/*
  Node has no microphone, so `navigator.mediaDevices` and `MediaRecorder` are faked.
  What matters here is not the audio but the release: every path out of a recording
  (stop, cancel, error, the time limit) must stop every track, or the browser's
  recording indicator stays on after the modal is gone.
*/

class FakeRecorder {
  static instances: FakeRecorder[] = []
  static isTypeSupported = (mime: string) => mime === 'audio/webm;codecs=opus'
  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  stream: unknown
  options: { mimeType: string }
  // No parameter properties: `erasableSyntaxOnly` forbids them.
  constructor(stream: unknown, options: { mimeType: string }) {
    this.stream = stream
    this.options = options
    FakeRecorder.instances.push(this)
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['audio-bytes']) })
    this.onstop?.()
  }
}

const trackStops = vi.fn()
const getUserMedia = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  FakeRecorder.instances = []
  FakeRecorder.isTypeSupported = (mime: string) => mime === 'audio/webm;codecs=opus'
  trackStops.mockReset()
  getUserMedia.mockReset()
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: trackStops }, { stop: trackStops }] })
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const opts = (onTick = vi.fn()) => ({ mime: 'audio/webm;codecs=opus', maxSeconds: 15, onTick })

describe('recordingSupport', () => {
  it('reports the format it will record in', () => {
    expect(recordingSupport()).toEqual({ supported: true, mime: 'audio/webm;codecs=opus' })
  })

  it('says so when there is no MediaRecorder', () => {
    vi.stubGlobal('MediaRecorder', undefined)
    const s = recordingSupport()
    expect(s.supported).toBe(false)
  })

  it('names the browsers to use when only unsupported formats are available', () => {
    FakeRecorder.isTypeSupported = () => false
    const s = recordingSupport()
    expect(s).toMatchObject({ supported: false })
    expect((s as { message: string }).message).toContain('Chrome')
  })
})

describe('startRecording', () => {
  it('records, and stopping releases every track and returns the clip', async () => {
    const recorder = await startRecording(opts())
    vi.advanceTimersByTime(4000)
    recorder.stop()
    const clip = await recorder.result

    expect(clip).not.toBeNull()
    expect(clip!.mime).toBe('audio/webm;codecs=opus')
    expect(clip!.blob.size).toBeGreaterThan(0)
    expect(clip!.seconds).toBeGreaterThanOrEqual(4)
    expect(trackStops).toHaveBeenCalledTimes(2)
  })

  // Closing the modal mid-recording: the microphone must go, and nothing may be left waiting.
  it('cancelling releases every track and resolves with no clip', async () => {
    const recorder = await startRecording(opts())
    recorder.cancel()
    await expect(recorder.result).resolves.toBeNull()
    expect(trackStops).toHaveBeenCalledTimes(2)
  })

  it('stops by itself at the time limit and releases the microphone', async () => {
    const onTick = vi.fn()
    const recorder = await startRecording(opts(onTick))
    vi.advanceTimersByTime(15_500)
    const clip = await recorder.result

    expect(clip).not.toBeNull()
    expect(onTick).toHaveBeenCalled()
    expect(trackStops).toHaveBeenCalledTimes(2)
  })

  it('stops ticking once it has stopped', async () => {
    const onTick = vi.fn()
    const recorder = await startRecording(opts(onTick))
    recorder.stop()
    await recorder.result
    onTick.mockClear()
    vi.advanceTimersByTime(5000)
    expect(onTick).not.toHaveBeenCalled()
  })

  it('releases the microphone when the recorder errors, and rejects', async () => {
    const recorder = await startRecording(opts())
    FakeRecorder.instances[0].onerror?.()
    await expect(recorder.result).rejects.toBeInstanceOf(RecordingError)
    expect(trackStops).toHaveBeenCalledTimes(2)
  })

  it('says the microphone is blocked when permission is denied', async () => {
    getUserMedia.mockRejectedValue(new DOMException('no', 'NotAllowedError'))
    await expect(startRecording(opts())).rejects.toMatchObject({ reason: 'denied' })
  })

  it('says there is no microphone when none is found', async () => {
    getUserMedia.mockRejectedValue(new DOMException('none', 'NotFoundError'))
    await expect(startRecording(opts())).rejects.toMatchObject({ reason: 'no-device' })
  })

  it('reports any other failure to start as failed', async () => {
    getUserMedia.mockRejectedValue(new Error('weird'))
    await expect(startRecording(opts())).rejects.toMatchObject({ reason: 'failed' })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/voice/recorder.test.ts`
Expected: FAIL ("Cannot find module './recorder'").

- [ ] **Step 3: Implement `src/voice/recorder.ts`**

```ts
import { pickRecordingMime } from './recording'

/*
  A thin wrapper over the browser's microphone and MediaRecorder.

  What it promises is the release: every way a recording can end (stop, cancel, the
  time limit, an error) stops every track of the stream. A stream left open keeps the
  browser's recording indicator on after the modal has gone, which is the one failure
  here a person would notice and not forgive.
*/

export type RecordingFailure = 'unsupported' | 'denied' | 'no-device' | 'failed'

export class RecordingError extends Error {
  reason: RecordingFailure

  constructor(message: string, reason: RecordingFailure) {
    super(message)
    this.name = 'RecordingError'
    this.reason = reason
  }
}

export interface Recording {
  blob: Blob
  seconds: number
  mime: string
}

export interface Recorder {
  /** The clip once recording ends, or `null` if it was cancelled. Rejects if the recorder failed. */
  result: Promise<Recording | null>
  /** Ends the recording and produces the clip. */
  stop: () => void
  /** Ends the recording and discards it. Safe to call at any time, more than once. */
  cancel: () => void
}

export function recordingSupport(): { supported: true; mime: string } | { supported: false; message: string } {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    return { supported: false, message: 'This browser cannot record audio.' }
  }
  const mime = pickRecordingMime((m) => MediaRecorder.isTypeSupported(m))
  if (!mime) {
    return {
      supported: false,
      message: 'This browser cannot record in a format Cartesia accepts. Use Chrome, Edge or Firefox to record.',
    }
  }
  return { supported: true, mime }
}

export async function startRecording(o: {
  mime: string
  maxSeconds: number
  onTick: (seconds: number) => void
}): Promise<Recorder> {
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (err) {
    const name = err instanceof DOMException ? err.name : ''
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new RecordingError('Microphone access was blocked. Allow it in your browser and try again.', 'denied')
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new RecordingError('No microphone was found.', 'no-device')
    }
    throw new RecordingError('The microphone could not be started.', 'failed')
  }

  const release = () => stream.getTracks().forEach((track) => track.stop())
  const recorder = new MediaRecorder(stream, { mimeType: o.mime })
  const chunks: Blob[] = []
  const startedAt = Date.now()
  let cancelled = false
  let timer: ReturnType<typeof setInterval> | undefined

  const result = new Promise<Recording | null>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    recorder.onerror = () => {
      clearInterval(timer)
      release()
      reject(new RecordingError('Recording failed.', 'failed'))
    }
    recorder.onstop = () => {
      clearInterval(timer)
      release()
      if (cancelled) resolve(null)
      else resolve({ blob: new Blob(chunks, { type: o.mime }), seconds: (Date.now() - startedAt) / 1000, mime: o.mime })
    }
  })

  function stop() {
    if (recorder.state !== 'inactive') recorder.stop()
  }

  recorder.start()
  timer = setInterval(() => {
    const seconds = (Date.now() - startedAt) / 1000
    o.onTick(seconds)
    if (seconds >= o.maxSeconds) stop()
  }, 200)

  return {
    result,
    stop,
    cancel() {
      cancelled = true
      stop()
    },
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/voice/recorder.test.ts`
Expected: PASS. If `recordingSupport` "no MediaRecorder" fails because `typeof MediaRecorder` still sees a global, confirm `vi.stubGlobal('MediaRecorder', undefined)` took effect and print `typeof MediaRecorder` before changing code.

- [ ] **Step 5: Mutation-check and commit**

Temporarily delete `release()` from the `onstop` handler; confirm the stop, cancel and time-limit tests FAIL (tracks not stopped); revert. Then:

Run: `npx tsc -b && npm run lint && npx vitest run src/voice`
Expected: no errors; all voice tests pass.

```bash
git add src/voice/recorder.ts src/voice/recorder.test.ts
git commit -m "feat(voice): microphone recorder that always releases the stream

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: The Clone voice modal

**Files:**
- Create: `src/components/voice/CloneVoiceModal.tsx`, `src/components/voice/CloneVoiceModal.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1-4 (`useVoiceStore`, `isCartesiaConfigured`, `listVoices`, `cloneVoice`, `speak`, `CartesiaError`, `VoiceSummary`, `recordingSupport`, `startRecording`, `RecordingError`, `Recording`, `Recorder`, scripts, settings constants, recording rules); `Modal` (`{title, onClose, children}`), `Button`, `Input`, `Spinner` from `@/components/ui/*`.
- Produces: `CloneVoiceModal({ onClose }: { onClose: () => void })`.

- [ ] **Step 1: Write the failing SSR tests**

`src/components/voice/CloneVoiceModal.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DEFAULT_SETTINGS } from '@/voice/settingsRow'
import { READING_SCRIPTS } from '@/voice/scripts'
import { useVoiceStore } from '@/voice/voiceStore'
import { CloneVoiceModal } from './CloneVoiceModal'

/**
 * A render smoke test, like the other editor panels: what the modal draws for which
 * state. Recording, playback and the live Cartesia calls need a microphone and a key,
 * and are checked by hand.
 */

beforeEach(() => {
  vi.stubEnv('VITE_CARTESIA_API_KEY', 'sk_car_test')
  useVoiceStore.setState({ settings: { ...DEFAULT_SETTINGS }, loaded: true, warning: null, error: null, status: 'idle' })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const render = () => renderToStaticMarkup(<CloneVoiceModal onClose={() => {}} />)

/** The opening tag of the element with this `aria-label`; fails loudly if there is none, so a
    `.not.toContain` on it can never pass because the element was missing. */
function tagLabelled(html: string, label: string): string {
  const tag = html.match(new RegExp(`<[^>]*aria-label="${label}"[^>]*>`))?.[0]
  if (!tag) throw new Error(`no element labelled "${label}" in the markup`)
  return tag
}

describe('CloneVoiceModal', () => {
  it('draws the four parts of the voice setup', () => {
    const html = render()
    for (const heading of ['>Voice<', '>Record your voice<', '>Settings<', '>Preview<']) {
      expect(html).toContain(heading)
    }
    expect(html).toContain('role="dialog"')
  })

  it('shows the passage to read in the chosen language', () => {
    expect(render()).toContain(READING_SCRIPTS.en)
    useVoiceStore.setState({ settings: { ...DEFAULT_SETTINGS, language: 'fr' } })
    expect(render()).toContain('Le renard brun rapide')
  })

  // Cloning must not be offered without a clip of at least three seconds and a name.
  it('cannot clone until there is a clip and a name', () => {
    expect(tagLabelled(render(), 'Clone voice')).toContain('disabled=""')
  })

  it('cannot preview until a voice is chosen', () => {
    expect(tagLabelled(render(), 'Preview voice')).toContain('disabled=""')
  })

  it('can preview once a voice is chosen', () => {
    useVoiceStore.setState({
      settings: { ...DEFAULT_SETTINGS, voiceId: 'v1', voiceName: 'Skylar', voiceSource: 'premade' },
    })
    expect(tagLabelled(render(), 'Preview voice')).not.toContain('disabled=""')
    expect(render()).toContain('Skylar')
  })

  // Cartesia supports emotion for English only.
  it('offers emotion for English and disables it for another language', () => {
    expect(tagLabelled(render(), 'Emotion')).not.toContain('disabled=""')
    useVoiceStore.setState({ settings: { ...DEFAULT_SETTINGS, language: 'de' } })
    const html = render()
    expect(tagLabelled(html, 'Emotion')).toContain('disabled=""')
    expect(html).toContain('English only')
  })

  it('offers speed and volume within Cartesia\'s limits', () => {
    const html = render()
    expect(tagLabelled(html, 'Speed')).toContain('min="0.6"')
    expect(tagLabelled(html, 'Speed')).toContain('max="1.5"')
    expect(tagLabelled(html, 'Volume')).toContain('min="0.5"')
    expect(tagLabelled(html, 'Volume')).toContain('max="2"')
  })

  it('says how to make the voice stick when the migration is missing', () => {
    useVoiceStore.setState({ warning: 'Run migration 0014 in Supabase to save your voice. It will work for this session only.' })
    expect(render()).toContain('migration 0014')
  })

  it('explains itself when no Cartesia key is configured', () => {
    vi.stubEnv('VITE_CARTESIA_API_KEY', '')
    expect(render()).toContain('VITE_CARTESIA_API_KEY')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/voice/CloneVoiceModal.test.tsx`
Expected: FAIL ("Cannot find module './CloneVoiceModal'").

- [ ] **Step 3: Implement `src/components/voice/CloneVoiceModal.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { useVoiceStore } from '@/voice/voiceStore'
import {
  CartesiaError,
  cloneVoice,
  isCartesiaConfigured,
  listVoices,
  speak,
  type VoiceSummary,
} from '@/voice/cartesia'
import {
  EMOTIONS,
  MAX_SPEED,
  MAX_VOLUME,
  MIN_SPEED,
  MIN_VOLUME,
  SPEED_STEP,
  VOLUME_STEP,
  clampSpeed,
  clampVolume,
  isEmotion,
  type VoiceSettings,
  type VoiceSource,
} from '@/voice/settingsRow'
import { READING_SCRIPTS, VOICE_LANGUAGES, isVoiceLanguage, previewTranscript } from '@/voice/scripts'
import {
  MAX_CLIP_SECONDS,
  MAX_NAME_LENGTH,
  MIN_CLIP_SECONDS,
  canClone,
  formatClock,
} from '@/voice/recording'
import { RecordingError, recordingSupport, startRecording, type Recorder, type Recording } from '@/voice/recorder'

/*
  Sets up the narration voice: pick a premade voice or record and clone your own, tune
  how it speaks, and hear two fixed sentences in it. It works on a draft; nothing is
  saved until Save voice.

  Three things are cleaned up when it closes, because closing is done by Escape, the
  backdrop or Cancel and none of them run any code of ours first: the microphone
  (`recorderRef.cancel()`, which stops every track), the preview audio, and every
  request still in flight (their AbortControllers). The cleanup effect below is that.
*/

function describe(err: unknown): string {
  return err instanceof CartesiaError || err instanceof RecordingError
    ? err.message
    : 'Something went wrong. Try again.'
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

interface VoiceLists {
  key: string
  premade: VoiceSummary[]
  mine: VoiceSummary[]
  error: string | null
}

const SELECT =
  'h-8 w-full rounded-app-sm border border-app-border bg-app-background px-2 text-sm text-app-foreground outline-none focus:border-app-accent disabled:cursor-not-allowed disabled:opacity-50'

export function CloneVoiceModal({ onClose }: { onClose: () => void }) {
  const loaded = useVoiceStore((s) => s.loaded)
  const warning = useVoiceStore((s) => s.warning)
  const saveError = useVoiceStore((s) => s.error)
  const saving = useVoiceStore((s) => s.status === 'saving')
  const configured = isCartesiaConfigured()

  const [draft, setDraft] = useState<VoiceSettings>(() => useVoiceStore.getState().settings)
  const [ready, setReady] = useState(loaded)

  // Reads the saved voice once, on open. The draft only replaces itself here, before
  // anything can have been changed, because the controls are disabled until `ready`.
  useEffect(() => {
    if (useVoiceStore.getState().loaded) return
    let cancelled = false
    void useVoiceStore
      .getState()
      .load()
      .then(() => {
        if (cancelled) return
        setDraft(useVoiceStore.getState().settings)
        setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  /* ---- voices ---- */
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounced(query, 300)
  const [refresh, setRefresh] = useState(0)
  const listKey = `${draft.language}|${debouncedQuery}|${refresh}`
  const [lists, setLists] = useState<VoiceLists | null>(null)
  const loadingVoices = configured && lists?.key !== listKey

  useEffect(() => {
    if (!configured) return
    const controller = new AbortController()
    const common = { language: draft.language, q: debouncedQuery, signal: controller.signal }
    Promise.all([listVoices({ ...common, mine: false }), listVoices({ ...common, mine: true })])
      .then(([premade, mine]) => setLists({ key: listKey, premade, mine, error: null }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setLists({ key: listKey, premade: [], mine: [], error: describe(err) })
      })
    return () => controller.abort()
  }, [configured, draft.language, debouncedQuery, refresh, listKey])

  function pick(voice: VoiceSummary, source: VoiceSource) {
    setDraft((d) => ({ ...d, voiceId: voice.id, voiceName: voice.name, voiceSource: source }))
  }

  /* ---- recording ---- */
  const support = useMemo(() => recordingSupport(), [])
  const [recState, setRecState] = useState<'idle' | 'starting' | 'recording' | 'recorded'>('idle')
  const [seconds, setSeconds] = useState(0)
  const [clip, setClip] = useState<Recording | null>(null)
  const [clipUrl, setClipUrl] = useState<string | null>(null)
  const [recError, setRecError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [cloning, setCloning] = useState(false)
  const [cloneError, setCloneError] = useState<string | null>(null)
  const recorderRef = useRef<Recorder | null>(null)
  const clipUrlRef = useRef<string | null>(null)
  const cloneAbortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(false)

  function discardClip() {
    if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current)
    clipUrlRef.current = null
    setClipUrl(null)
    setClip(null)
    setSeconds(0)
    setRecState('idle')
  }

  async function startRecord() {
    if (!support.supported || recState === 'starting' || recState === 'recording') return
    discardClip()
    setRecError(null)
    setRecState('starting')
    try {
      const recorder = await startRecording({ mime: support.mime, maxSeconds: MAX_CLIP_SECONDS, onTick: setSeconds })
      // Closed while the browser's permission prompt was open: hand the microphone straight back.
      if (!mountedRef.current) {
        recorder.cancel()
        return
      }
      recorderRef.current = recorder
      setRecState('recording')
      const recording = await recorder.result
      if (recorderRef.current === recorder) recorderRef.current = null
      if (recording === null || !mountedRef.current) return
      const url = URL.createObjectURL(recording.blob)
      clipUrlRef.current = url
      setClipUrl(url)
      setClip(recording)
      setSeconds(recording.seconds)
      setRecState('recorded')
    } catch (err) {
      recorderRef.current = null
      if (!mountedRef.current) return
      setRecError(describe(err))
      setRecState('idle')
    }
  }

  async function clone() {
    if (!clip || !canClone({ clipSeconds: clip.seconds, name })) return
    const controller = new AbortController()
    cloneAbortRef.current = controller
    setCloning(true)
    setCloneError(null)
    try {
      const voice = await cloneVoice({ clip: clip.blob, name, language: draft.language, signal: controller.signal })
      if (controller.signal.aborted) return
      pick(voice, 'cloned')
      setRefresh((n) => n + 1)
      discardClip()
      setName('')
    } catch (err) {
      if (controller.signal.aborted) return
      setCloneError(describe(err))
    } finally {
      if (cloneAbortRef.current === controller) cloneAbortRef.current = null
      if (!controller.signal.aborted) setCloning(false)
    }
  }

  /* ---- preview ---- */
  const [preview, setPreview] = useState<'idle' | 'loading' | 'playing'>('idle')
  const [previewError, setPreviewError] = useState<string | null>(null)
  const previewRef = useRef<{ controller: AbortController; audio: HTMLAudioElement | null; url: string | null } | null>(
    null,
  )

  function stopPreview() {
    const p = previewRef.current
    if (!p) return
    p.controller.abort()
    p.audio?.pause()
    if (p.url) URL.revokeObjectURL(p.url)
    previewRef.current = null
    setPreview('idle')
  }

  async function playPreview() {
    if (!draft.voiceId) return
    stopPreview()
    const controller = new AbortController()
    const state = { controller, audio: null as HTMLAudioElement | null, url: null as string | null }
    previewRef.current = state
    setPreview('loading')
    setPreviewError(null)
    try {
      const blob = await speak({
        voiceId: draft.voiceId,
        transcript: previewTranscript(draft.language),
        language: draft.language,
        speed: draft.speed,
        volume: draft.volume,
        emotion: draft.emotion,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      state.url = url
      state.audio = audio
      audio.onended = () => {
        if (previewRef.current === state) stopPreview()
      }
      await audio.play()
      if (previewRef.current === state) setPreview('playing')
    } catch (err) {
      if (controller.signal.aborted) return
      if (previewRef.current === state) stopPreview()
      setPreviewError(describe(err))
    }
  }

  /* ---- closing ---- */
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      recorderRef.current?.cancel()
      cloneAbortRef.current?.abort()
      const p = previewRef.current
      if (p) {
        p.controller.abort()
        p.audio?.pause()
        if (p.url) URL.revokeObjectURL(p.url)
      }
      if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current)
    }
  }, [])

  async function saveAndClose() {
    if (await useVoiceStore.getState().save(draft)) onClose()
  }

  const recording = recState === 'recording'
  const cloneReady = clip !== null && canClone({ clipSeconds: clip.seconds, name })
  const emotionOff = draft.language !== 'en'
  const disabledAll = !ready || !configured

  return (
    <Modal title="Narration voice" onClose={onClose}>
      <div className="flex flex-col gap-5">
        {!configured && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Add VITE_CARTESIA_API_KEY to your .env file to use voices.
          </p>
        )}
        {warning && <p className="text-xs text-app-highlight-text">{warning}</p>}

        {/* ---- Voice ---- */}
        <section aria-labelledby="voice-voice" className="flex flex-col gap-2">
          <h3 id="voice-voice" className="text-sm font-semibold text-app-foreground">
            Voice
          </h3>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Input
              type="search"
              aria-label="Search voices"
              placeholder="Search voices"
              value={query}
              disabled={disabledAll}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              aria-label="Voice language"
              className={`${SELECT} w-32`}
              value={draft.language}
              disabled={disabledAll}
              onChange={(e) => {
                const language = e.target.value
                if (isVoiceLanguage(language)) setDraft((d) => ({ ...d, language }))
              }}
            >
              {VOICE_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div className="scrollbar-subtle max-h-48 overflow-y-auto rounded-app-sm border border-app-border" role="radiogroup" aria-label="Voices">
            {loadingVoices && (
              <p className="flex items-center gap-2 p-3 text-xs text-app-muted">
                <Spinner /> Loading voices…
              </p>
            )}
            {lists?.error && !loadingVoices && <p className="p-3 text-xs text-red-600 dark:text-red-400">{lists.error}</p>}
            {lists && !loadingVoices && !lists.error && (
              <>
                <VoiceGroup title="Your voices" voices={lists.mine} selectedId={draft.voiceId} onPick={(v) => pick(v, 'cloned')} />
                <VoiceGroup title="Premade voices" voices={lists.premade} selectedId={draft.voiceId} onPick={(v) => pick(v, 'premade')} />
                {lists.mine.length === 0 && lists.premade.length === 0 && (
                  <p className="p-3 text-xs text-app-muted">No voices match.</p>
                )}
              </>
            )}
          </div>
          <p className="text-xs text-app-muted">
            {draft.voiceName ? `Selected: ${draft.voiceName}` : 'No voice selected yet.'}
          </p>
        </section>

        {/* ---- Record your voice ---- */}
        <section aria-labelledby="voice-record" className="flex flex-col gap-2">
          <h3 id="voice-record" className="text-sm font-semibold text-app-foreground">
            Record your voice
          </h3>
          <p className="text-xs text-app-muted">
            Read this aloud in a quiet room, at your normal pace ({MIN_CLIP_SECONDS} to {MAX_CLIP_SECONDS} seconds):
          </p>
          <blockquote className="rounded-app-sm border border-app-border bg-app-surface p-3 text-sm leading-relaxed text-app-foreground">
            {READING_SCRIPTS[draft.language]}
          </blockquote>

          <div className="flex flex-wrap items-center gap-2">
            {recording ? (
              <Button variant="danger" onClick={() => recorderRef.current?.stop()} aria-label="Stop recording">
                Stop
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => void startRecord()}
                disabled={disabledAll || !support.supported || recState === 'starting'}
                aria-label="Record voice"
              >
                {recState === 'recorded' ? 'Record again' : 'Record voice'}
              </Button>
            )}
            <span className="text-xs tabular-nums text-app-muted" aria-live="off">
              {formatClock(seconds)} / {formatClock(MAX_CLIP_SECONDS)}
            </span>
            {clipUrl && <audio controls src={clipUrl} className="h-8 max-w-full" aria-label="Your recording" />}
          </div>
          {!support.supported && <p className="text-xs text-app-muted">{support.message}</p>}
          {recError && <p className="text-xs text-red-600 dark:text-red-400">{recError}</p>}
          {clip && clip.seconds < MIN_CLIP_SECONDS && (
            <p className="text-xs text-app-highlight-text">
              That was too short: record at least {MIN_CLIP_SECONDS} seconds.
            </p>
          )}

          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-app-muted">
              Name your voice
              <Input
                value={name}
                maxLength={MAX_NAME_LENGTH}
                placeholder="My narration voice"
                disabled={disabledAll}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <Button
              variant="primary"
              onClick={() => void clone()}
              disabled={disabledAll || !cloneReady || cloning}
              aria-label="Clone voice"
            >
              {cloning ? <Spinner /> : null}
              Clone voice
            </Button>
          </div>
          {cloneError && <p className="text-xs text-red-600 dark:text-red-400">{cloneError}</p>}
        </section>

        {/* ---- Settings ---- */}
        <section aria-labelledby="voice-settings" className="flex flex-col gap-3">
          <h3 id="voice-settings" className="text-sm font-semibold text-app-foreground">
            Settings
          </h3>
          <label className="grid grid-cols-[5rem_1fr_3rem] items-center gap-2 text-xs text-app-muted">
            Speed
            <input
              type="range"
              aria-label="Speed"
              min={MIN_SPEED}
              max={MAX_SPEED}
              step={SPEED_STEP}
              value={draft.speed}
              disabled={disabledAll}
              onChange={(e) => setDraft((d) => ({ ...d, speed: clampSpeed(Number(e.target.value)) }))}
            />
            <span className="tabular-nums text-app-foreground">{draft.speed.toFixed(2)}×</span>
          </label>
          <label className="grid grid-cols-[5rem_1fr_3rem] items-center gap-2 text-xs text-app-muted">
            Volume
            <input
              type="range"
              aria-label="Volume"
              min={MIN_VOLUME}
              max={MAX_VOLUME}
              step={VOLUME_STEP}
              value={draft.volume}
              disabled={disabledAll}
              onChange={(e) => setDraft((d) => ({ ...d, volume: clampVolume(Number(e.target.value)) }))}
            />
            <span className="tabular-nums text-app-foreground">{draft.volume.toFixed(2)}×</span>
          </label>
          <label className="grid grid-cols-[5rem_1fr] items-center gap-2 text-xs text-app-muted">
            Emotion
            <select
              aria-label="Emotion"
              className={SELECT}
              value={draft.emotion ?? ''}
              disabled={disabledAll || emotionOff}
              onChange={(e) => setDraft((d) => ({ ...d, emotion: isEmotion(e.target.value) ? e.target.value : null }))}
            >
              <option value="">Default</option>
              {EMOTIONS.map((emotion) => (
                <option key={emotion} value={emotion}>
                  {emotion}
                </option>
              ))}
            </select>
          </label>
          {emotionOff && <p className="text-xs text-app-muted">Emotion is available in English only.</p>}
        </section>

        {/* ---- Preview ---- */}
        <section aria-labelledby="voice-preview" className="flex flex-col gap-2">
          <h3 id="voice-preview" className="text-sm font-semibold text-app-foreground">
            Preview
          </h3>
          <p className="text-xs text-app-muted">“{previewTranscript(draft.language)}”</p>
          <div className="flex items-center gap-2">
            {preview === 'idle' ? (
              <Button
                variant="secondary"
                onClick={() => void playPreview()}
                disabled={disabledAll || draft.voiceId === null}
                aria-label="Preview voice"
              >
                Preview voice
              </Button>
            ) : (
              <Button variant="secondary" onClick={stopPreview} aria-label="Stop preview">
                {preview === 'loading' ? <Spinner /> : null}
                Stop
              </Button>
            )}
            {draft.voiceId === null && <span className="text-xs text-app-muted">Choose a voice first.</span>}
          </div>
          {previewError && <p className="text-xs text-red-600 dark:text-red-400">{previewError}</p>}
        </section>

        {saveError && <p className="text-xs font-medium text-red-600 dark:text-red-400">{saveError}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void saveAndClose()} disabled={disabledAll || saving}>
            {saving ? <Spinner /> : null}
            Save voice
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function VoiceGroup({
  title,
  voices,
  selectedId,
  onPick,
}: {
  title: string
  voices: VoiceSummary[]
  selectedId: string | null
  onPick: (voice: VoiceSummary) => void
}) {
  if (voices.length === 0) return null
  return (
    <div>
      <p className="sticky top-0 bg-app-surface px-3 py-1 text-[11px] font-semibold text-app-muted">{title}</p>
      {voices.map((voice) => {
        const selected = voice.id === selectedId
        return (
          <button
            key={voice.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onPick(voice)}
            className={`flex w-full cursor-pointer flex-col items-start px-3 py-1.5 text-left text-sm transition-colors hover:bg-app-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-app-accent ${
              selected ? 'bg-app-accent/10 text-app-accent-text' : 'text-app-foreground'
            }`}
          >
            <span className="font-medium">{voice.name}</span>
            {(voice.tagline || voice.gender) && (
              <span className="text-xs text-app-muted">{[voice.tagline, voice.gender].filter(Boolean).join(' · ')}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
```

Notes for the implementer:
- `Button` spreads native props, so `aria-label` and `disabled` reach the DOM (the tests read them).
- The modal's title (and so the dialog's `aria-label`) is "Narration voice", deliberately not "Clone voice": the Clone button's `aria-label` is "Clone voice" and `tagLabelled` returns the first element with a given label, so a shared name would make the tests read the dialog instead of the button.
- `lists` is null in SSR and until the first fetch resolves; `loadingVoices` is then true when configured.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/voice/CloneVoiceModal.test.tsx`
Expected: PASS (9 tests). If a `tagLabelled` lookup throws "no element labelled", print the markup around it; do not weaken the helper.

- [ ] **Step 5: Type-check, lint, commit**

Run: `npx tsc -b && npm run lint`
Expected: no errors from the new files. Fix any `react-hooks` warnings the new file introduces (the pre-existing warnings elsewhere are not yours).

```bash
git add src/components/voice
git commit -m "feat(voice): Clone voice modal (premade voices, record and clone, settings, preview)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: The Narration tab footer: AI icon and Clone voice

**Files:**
- Modify: `src/components/editor/NarrationTab.tsx` (replace the whole file)
- Modify: `src/components/editor/NarrationTab.test.tsx` (replace the whole file)

**Interfaces:**
- Consumes: `CloneVoiceModal({onClose})` (Task 5), `isCartesiaConfigured()` (Task 2). Everything else as in the existing tab (`GenerateScriptsModal`, `narrationSlides`, `hasValidTargets`, `sameSlides`, `FallbackProvider`, the store selectors).
- Behaviour change: the two Generate buttons and the single-slide confirm (`confirmingId`) are gone; `ConfirmReplaceModal` is no longer imported here (the picker uses it itself).

- [ ] **Step 1: Replace the tests first (they fail against the old component)**

Overwrite `src/components/editor/NarrationTab.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Card } from '@/engine/contentBlocks'
import { NarrationTab } from './NarrationTab'

/**
 * A render smoke test, and a deliberate exception to "pure logic only" like the
 * other editor panels: the failures worth catching are in what the tab draws for
 * which state (no slide, an empty deck, an edited script, no Cartesia key), which no
 * pure function can see. The gesture side (tab switching mid-generation, the modals
 * opening inside the panel) needs a browser and is not covered here.
 */

beforeEach(() => {
  vi.stubEnv('VITE_CARTESIA_API_KEY', 'sk_car_test')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

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

/** The opening tag of the element with this `aria-label`. Throws if there is none, so a
    `.not.toContain` on it cannot pass because the element was missing. */
function tagLabelled(html: string, label: string): string {
  const tag = html.match(new RegExp(`<[^>]*aria-label="${label}"[^>]*>`))?.[0]
  if (!tag) throw new Error(`no element labelled "${label}" in the markup`)
  return tag
}

const AI = 'Generate scripts with AI'
const CLONE = 'Clone voice'

describe('NarrationTab', () => {
  it('says so when the deck has no slides, and offers no generation', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={[]} cardId={null} />)
    expect(html).toContain('This deck has no slides yet.')
    expect(tagLabelled(html, AI)).toContain('disabled=""')
  })

  it('asks for a slide when none is selected, and still offers the AI icon for the deck', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId={null} />)
    expect(html).toContain('Select a slide to write its script.')
    expect(tagLabelled(html, AI)).not.toContain('disabled=""')
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

  // The two big buttons became one small icon, and the generation strip only exists while
  // something is happening.
  it('no longer has the two Generate buttons', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="a" />)
    expect(html).not.toContain('Generate script for this slide only')
    expect(html).not.toContain('Generate scripts for all slides')
  })

  it('shows no generation strip while idle', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="a" />)
    expect(html).not.toContain('Writing narration')
  })

  it('offers the AI icon and Clone voice in the footer with or without a slide selected', () => {
    for (const cardId of ['a', null]) {
      const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId={cardId} />)
      expect(tagLabelled(html, AI)).toContain('type="button"')
      expect(tagLabelled(html, CLONE)).toContain('type="button"')
    }
  })

  it('enables Clone voice when a Cartesia key is set', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="a" />)
    expect(tagLabelled(html, CLONE)).not.toContain('disabled=""')
  })

  it('disables Clone voice, saying why, when no Cartesia key is set', () => {
    vi.stubEnv('VITE_CARTESIA_API_KEY', '')
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="a" />)
    const tag = tagLabelled(html, CLONE)
    expect(tag).toContain('disabled=""')
    expect(tag).toContain('VITE_CARTESIA_API_KEY')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/editor/NarrationTab.test.tsx`
Expected: FAIL on the new tests ("no element labelled "Generate scripts with AI"", and the "no longer has the two Generate buttons" assertion); the unchanged-behaviour tests still pass.

- [ ] **Step 3: Replace `src/components/editor/NarrationTab.tsx`**

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { describeError, usePresentationStore } from '@/store/presentationStore'
import { FallbackProvider, PROVIDER_CHAIN } from '@/ai/fallbackProvider'
import { narrationSlides } from '@/ai/narrationPrompt'
import {
  hasValidTargets,
  isResettable,
  narrationStatus,
  sameSlides,
  type NarrationStatus,
} from '@/engine/narration'
import { formatDuration, speakingSeconds, wordCount } from '@/lib/speakingTime'
import { Button } from '@/components/ui/Button'
import { GenerateScriptsModal } from '@/components/narrate/GenerateScriptsModal'
import { CloneVoiceModal } from '@/components/voice/CloneVoiceModal'
import { isCartesiaConfigured } from '@/voice/cartesia'
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
 * The Narration tab of the editor's right panel: one slide's spoken script, an AI icon
 * that opens the slide picker, and a Clone voice button. It writes for the slide the
 * editor is on (`cardId`), so there is no slide stepper here — the canvas beside it is
 * the viewer.
 *
 * It owns everything the old narration page owned: the generation request and its
 * `AbortController`, and the choose-slides dialog (which asks before overwriting a
 * hand-edited script). It must stay mounted while the panel shows another tab
 * (`ToolsPanel` keeps it mounted, hidden), or switching tabs would abort a request the
 * user only looked away from.
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
  const [voiceOpen, setVoiceOpen] = useState(false)
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
  const voiceReady = isCartesiaConfigured()

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
    // A position can go stale between the click and here (an undo behind an open dialog).
    if (!hasValidTargets(targets, cards.length)) return
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
      {(generating || shownError) && (
        <div className="border-b border-app-border px-3 py-2.5">
          {generating && (
            <>
              <Button variant="secondary" onClick={() => abortRef.current?.abort()} className="w-full">
                Cancel
              </Button>
              <p className="mt-2 text-xs text-app-muted">Writing narration…</p>
            </>
          )}
          {shownError && (
            <p className={`text-xs font-medium text-red-600 dark:text-red-400 ${generating ? 'mt-2' : ''}`}>
              {shownError}
            </p>
          )}
        </div>
      )}

      {card ? (
        <div className="flex min-h-0 flex-1 flex-col px-3 pt-2.5">
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
        <p className="min-h-0 flex-1 px-3 py-4 text-xs text-app-muted">
          {cards.length === 0 ? 'This deck has no slides yet.' : 'Select a slide to write its script.'}
        </p>
      )}

      {/* The AI icon on the left and Clone voice on the right, under the script box. Neither
          depends on the selected slide: the icon opens a picker over the whole deck, and the
          voice belongs to the user. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-app-border px-3 py-2">
        <FooterButton
          label="Generate scripts with AI"
          title="Write scripts with AI"
          disabled={generating || cards.length === 0}
          onClick={() => setChoosing(true)}
          icon
        >
          <SparkleIcon />
        </FooterButton>
        <FooterButton
          label="Clone voice"
          title={voiceReady ? 'Set up a narration voice' : 'Add VITE_CARTESIA_API_KEY to enable voice cloning'}
          disabled={!voiceReady}
          onClick={() => setVoiceOpen(true)}
        >
          <MicIcon />
          Clone voice
        </FooterButton>
      </div>

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

      {voiceOpen && <CloneVoiceModal onClose={() => setVoiceOpen(false)} />}
    </div>
  )
}

/** A footer button in the panel's own style. Refuses focus on mousedown, like every button in the panel. */
function FooterButton({
  label,
  title,
  disabled,
  onClick,
  icon = false,
  children,
}: {
  label: string
  title: string
  disabled: boolean
  onClick: () => void
  icon?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-7 cursor-pointer items-center justify-center gap-1.5 rounded-[5px] bg-app-foreground/[0.06] text-[11px] font-semibold text-app-foreground transition-colors hover:bg-app-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-40 ${
        icon ? 'size-7' : 'px-2.5'
      }`}
    >
      {children}
    </button>
  )
}

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M6.5 1.5 7.6 5a2 2 0 0 0 1.4 1.4l3.5 1.1-3.5 1.1A2 2 0 0 0 7.6 10L6.5 13.5 5.4 10a2 2 0 0 0-1.4-1.4L.5 7.5 4 6.4A2 2 0 0 0 5.4 5l1.1-3.5Z" />
      <path d="M12.5 1 13 2.5a1 1 0 0 0 .5.5l1.5.5-1.5.5a1 1 0 0 0-.5.5L12.5 6 12 4.5a1 1 0 0 0-.5-.5L10 3.5l1.5-.5a1 1 0 0 0 .5-.5L12.5 1Z" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" />
      <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5V15" />
    </svg>
  )
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/components/editor/NarrationTab.test.tsx src/components/editor/ToolsPanel.test.tsx`
Expected: PASS (both files; `ToolsPanel` tests are unaffected).

- [ ] **Step 5: Full verification and commit**

Run: `npm run build && npm run lint && npm run test`
Expected: build succeeds; no lint errors; every test passes. If the suite shows a failure, re-run that file alone before deciding whether it is yours (a slow `temporaryInk.test.ts` timeout under full-suite load is a known pre-existing flake; a test in `src/voice`, `NarrationTab`, `CloneVoiceModal` or `ToolsPanel` failing is yours).

```bash
git add src/components/editor/NarrationTab.tsx src/components/editor/NarrationTab.test.tsx
git commit -m "feat(editor): AI icon and Clone voice replace the two Generate buttons

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Docs and the manual browser check

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-27-narration-voice-design.md` (status line)

- [ ] **Step 1: Document the voice section in `CLAUDE.md`**

Use the Edit tool (not a script). Insert a new section immediately before the `## Classroom (` heading: replace the line
`## Classroom (\`src/classroom/\`, \`pages/classroom/\`, \`components/classroom/\`)`
with the following block followed by that same heading line:

```markdown
## Voice (`src/voice/`, `components/voice/CloneVoiceModal.tsx`)

The Narration tab's footer has an **AI icon** (bottom left; opens the slide picker, `GenerateScriptsModal`, which asks before overwriting hand-edited scripts) and **Clone voice** (bottom right; opens `CloneVoiceModal`). The modal sets up a **Cartesia** voice: pick a premade voice or record and clone your own (with a passage to read aloud), tune language, speed (0.6–1.5), volume (0.5–2.0) and emotion, and **Preview** two fixed sentences. The saved voice feeds **only the preview**; nothing else plays or exports audio. Design: `docs/superpowers/specs/2026-09-27-narration-voice-design.md`.

- **All network calls are in `voice/cartesia.ts`** (`listVoices`, `cloneVoice`, `speak`); everything else is pure or UI. The key is `VITE_CARTESIA_API_KEY`, **baked into the client bundle by decision**: cloning and listing voices need a full API key (Cartesia's browser tokens only cover speech), and Cartesia itself says never to ship one in a client app, so **a deployed build lets anyone who loads it spend on the account and list or delete its voices**. Same class of risk as the Anthropic key, worse in scope. A server proxy would replace only this file. The key goes out as `Authorization: Bearer` because that is the only credential header the API's CORS policy allows (`Authorization, Cartesia-Version, Content-Type`). **Untested live**: the `Bearer` form (a few of Cartesia's curl samples omit it) and the `voice` field as a bare id string in `/tts/bytes`; a valid key that gets 401, or a speech request rejected for its voice field, is a one-line change in that file.
- **Every call honours the `AbortSignal`, and an abort stays an `AbortError`** (never a `CartesiaError`), so closing the modal cancels quietly. No retry: each is a single user action with a button to press again.
- **Emotion is English-only** in Cartesia; `speakBody` sends none for another language and the modal disables the select. Six languages ship (`voice/scripts.ts`: en, es, fr, de, pt, it), because the reading script and preview sentences must be in the voice's language; adding one is a row in each table plus `VOICE_LANGUAGES`. Only the first 100 voices are listed (search narrows).
- **The microphone is always released** (`voice/recorder.ts`): stop, cancel, the 15 s limit and errors all stop every track, and the modal's unmount cleanup cancels a recording, aborts requests and stops the preview, because Escape/backdrop/Cancel run no code of ours. A browser that can only record mp4 (Safari) is reported as unable (Cartesia accepts webm/ogg, not mp4). A clip needs at least 3 s and a name of at most 60 characters (`canClone`). `recorder.test.ts` fakes `navigator.mediaDevices` and `MediaRecorder` to pin the release.
- **Saved per user in `voice_settings` (migration 0014, owner-only RLS)**, deliberately not on `profiles` (whose `profiles_select` lets a teacher read their students' profiles). It stores which voice was picked and its settings; the voice itself lives in the user's Cartesia account, and **deleting an app account cannot delete the clones from Cartesia**. `voiceStore` loads on modal open, is **cleared when the signed-in user changes** (a load in flight across the switch is discarded), and **does not gate anything**: a project without 0014 works, the voice lasts for the session, and the modal says to run the migration. **`supabase/tests/0014_voice_rls.sql` is hand-run and has not been run.**
- **Not testable here (no jsdom, microphone or key), checked by hand:** recording, playback, the live Cartesia calls, the microphone indicator going off on close. Tested: request building, response parsing, error mapping and abort (`cartesia.test.ts` against mocked `fetch`), settings mapping, the recorder's release, the store, and the modal's and tab's render states.

```

Then, with the Edit tool, make these three small edits in `CLAUDE.md`:
1. After the `VITE_ANTHROPIC_API_KEY` bullet in **Environment** (the one ending "it's spendable; see `.env.example`."), add a new bullet:
   `- \`VITE_CARTESIA_API_KEY\` (optional): voice cloning and preview in the Narration tab. Full-account key, baked into the bundle; see Voice. Without it the Clone voice button is disabled.`
2. In the Narration tab section, in the bullet beginning "**The tab writes for the slide the editor is on**", append: ` The two Generate buttons are now one AI icon that opens the slide picker (the single-slide confirm is gone; the picker asks before overwriting).`
3. In **Persistence**, after the `0013` bullet, add: `- \`0014\` \`voice_settings\` (owner-only; the chosen Cartesia voice and settings). Does **not** gate card writes or anything else. See Voice.`

- [ ] **Step 2: Update the spec status**

In `docs/superpowers/specs/2026-09-27-narration-voice-design.md` change the status line to: `Date: 2026-09-27. Status: approved; implemented on branch feat/narration-voice.`

- [ ] **Step 3: Verify and commit**

Run: `npm run lint && npm run test`
Expected: PASS.

```bash
git add CLAUDE.md docs
git commit -m "docs: voice (Cartesia), the AI icon, and the new env key and migration

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Manual browser check (no jsdom, no microphone in tests)**

Apply migration 0014 in Supabase and run `supabase/tests/0014_voice_rls.sql` (report the result). Put a real `VITE_CARTESIA_API_KEY` in `.env`, run `npm run dev`, open a deck, **Narration** tab, and confirm each:
1. The footer shows the AI icon (left) and **Clone voice** (right) with or without a slide selected; the two old Generate buttons are gone. With the key removed, Clone voice is disabled with its tooltip.
2. The AI icon opens the slide picker; generating still works, asks before overwriting an edited script, and Cancel stops it.
3. **Clone voice** opens a centred modal that lists premade voices (search and language filter work), and "Your voices" once a clone exists. If every Cartesia call fails with 401, switch the header to the un-prefixed form in `cartesia.ts` `headers()` and report it.
4. **Preview** with a premade voice speaks the two sentences; changing speed/volume/emotion changes the result; emotion is disabled for a non-English language; Stop works mid-playback.
5. **Record voice** asks for the microphone, shows the timer, stops at 15 s, plays back, and **Record again** replaces the clip. A clip under 3 s cannot be cloned. **Clone voice** with a name creates the voice, selects it, and it appears under "Your voices".
6. **Closing mid-recording** (Escape, backdrop, Cancel) turns the browser's recording indicator off. Closing while the permission prompt is open also leaves no recording indicator.
7. **Save voice**, reload, reopen the modal: the voice and settings are back. Sign in as another account: it does not see the first account's voice.
8. Without migration 0014 the modal shows the "Run migration 0014" note and the voice still applies for the session.

Report anything that fails; do not mark this task done on a partial pass.
