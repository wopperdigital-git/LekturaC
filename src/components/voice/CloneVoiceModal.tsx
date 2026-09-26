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
  const warning = useVoiceStore((s) => s.warning)
  const saveError = useVoiceStore((s) => s.error)
  const saving = useVoiceStore((s) => s.status === 'saving')
  const configured = isCartesiaConfigured()

  const [draft, setDraft] = useState<VoiceSettings>(() => useVoiceStore.getState().settings)
  // An initial value, not something to subscribe to: read once, from the store as it is now.
  const [ready, setReady] = useState(() => useVoiceStore.getState().loaded)

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
