import { clipSeconds } from '@/avatar/costLine'
import { speakingSeconds } from '@/lib/speakingTime'
import { SILENT_SLIDE_SECONDS } from './timeline'

/*
  The video dialog's four steps and what its step rail says about each (pure). The rail is how the
  dialog is navigated: one step on screen at a time, every step's state summarised beside its name, so
  nothing below the fold has to be scrolled to before Generate.
*/

export type VideoStep = 'voice' | 'sound' | 'face' | 'video'

export const VIDEO_STEPS: readonly { id: VideoStep; n: number; name: string }[] = [
  { id: 'voice', n: 1, name: 'Voice' },
  { id: 'sound', n: 2, name: 'Sound' },
  { id: 'face', n: 3, name: 'Intro & outro' },
  { id: 'video', n: 4, name: 'Video' },
]

/** The step `delta` away, or `null` past either end. */
export function stepAfter(step: VideoStep, delta: -1 | 1): VideoStep | null {
  const i = VIDEO_STEPS.findIndex((s) => s.id === step)
  return VIDEO_STEPS[i + delta]?.id ?? null
}

/** "1.00× · Default": speed, then the emotion (English only, so another language says nothing about it). */
export function soundSummary(s: { speed: number; emotion: string | null; language: string }): string {
  const speed = `${s.speed.toFixed(2)}×`
  if (s.language !== 'en') return speed
  const emotion = s.emotion ? s.emotion[0].toUpperCase() + s.emotion.slice(1) : 'Default'
  return `${speed} · ${emotion}`
}

/** What the rail says about the talking intro and outro. */
export function faceSummary(f: { checking: boolean; configured: boolean; on: boolean; blocked: boolean }): string {
  if (!f.configured) return 'Not set up'
  if (f.checking) return 'Checking…'
  if (f.on) return 'On'
  return f.blocked ? 'Needs setup' : 'Off'
}

export interface ScriptPlan {
  slides: number
  /** 1-based numbers of the slides with no words: each is held on screen in silence. */
  silent: number[]
  /** A rough length of the whole video, intro and outro included when they will be made. */
  seconds: number
}

/**
 * How the deck will play: which slides are silent and roughly how long the video runs. A rough
 * figure from the scripts' word counts at the chosen speed (the real length comes from the audio).
 */
export function scriptPlan(o: {
  texts: readonly string[]
  speed: number
  bookends: { intro: string; outro: string } | null
}): ScriptPlan {
  const speed = o.speed > 0 ? o.speed : 1
  const silent: number[] = []
  let seconds = 0
  o.texts.forEach((text, i) => {
    if (text.trim() === '') {
      silent.push(i + 1)
      seconds += SILENT_SLIDE_SECONDS
    } else {
      seconds += Math.max(1, speakingSeconds(text)) / speed
    }
  })
  if (o.bookends) seconds += (clipSeconds(o.bookends.intro) + clipSeconds(o.bookends.outro)) / speed
  return { slides: o.texts.length, silent, seconds: Math.round(seconds) }
}

/** "Slide 3", "Slides 3 and 5", "Slides 2, 4 and 7", "7 slides" past five, so the line stays short. */
export function slideList(numbers: readonly number[]): string {
  if (numbers.length === 1) return `Slide ${numbers[0]}`
  if (numbers.length > 5) return `${numbers.length} slides`
  return `Slides ${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`
}
