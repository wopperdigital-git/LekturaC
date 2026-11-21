import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { useVoiceStore } from '@/voice/voiceStore'
import {
  CartesiaError,
  cloneVoice,
  deleteVoice,
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
import {
  READING_SCRIPTS,
  VOICE_LANGUAGES,
  isVoiceLanguage,
  previewTranscript,
  type VoiceLanguage,
} from '@/voice/scripts'
import {
  MAX_CLIP_SECONDS,
  MAX_NAME_LENGTH,
  MIN_CLIP_SECONDS,
  canClone,
  canRecord,
  formatClock,
  languageForClone,
  type RecState,
} from '@/voice/recording'
import {
  CLONES_MIGRATION_MESSAGE,
  CloneNotKeptError,
  cloneOwnVoice,
  deleteOwnVoice,
  keepOwnVoice,
  ownClones,
  readOwnVoices,
  supabaseClonePorts,
  type OwnVoices,
} from '@/voice/clonedVoices'
import { RecordingError, recordingSupport, startRecording, type Recorder, type Recording } from '@/voice/recorder'
import { supabase } from '@/lib/supabaseClient'
import { hasWebCodecs } from '@/video/format'
import { loadVideo, supabasePorts, type VideoView } from '@/video/storage'
import { canStartGenerate, faceBlocker, generateBlocker } from '@/video/ui'
import { videoLength } from '@/video/library'
import type { VideoDeck } from '@/video/generate'
import { startVideoJob } from '@/jobs/start'
import { useJobsStore } from '@/jobs/jobsStore'
import { clearNew } from '@/jobs/newItems'
import { VOICE_NOT_SET_UP } from '@/lib/setupCopy'
import { useAuthStore } from '@/store/authStore'
import { isWavespeedConfigured } from '@/avatar/wavespeed'
import { readFacePhoto, supabaseFacePorts, type FacePhoto } from '@/avatar/facePhoto'
import { EMPTY_BOOKENDS, bookendText } from '@/avatar/bookends'
import { useBookendsStore } from '@/avatar/bookendsStore'
import { faceCostLine } from '@/avatar/costLine'
import { FaceStep } from './FaceStep'

/*
  Makes the narrated video. First the voice: pick a premade voice or record and clone your
  own, tune how it speaks, and hear two fixed sentences in it. It works on a draft; nothing
  is saved until Generate video, which saves the voice and then starts the video. (It was
  "Narration voice" with a "Generate Presentation" button, the same words that make a deck
  at /new, behind a "Clone voice" button; nobody looking for a video looked there.)

  Three things are cleaned up when it closes, because closing is done by Escape, the
  backdrop or Cancel and none of them run any code of ours first: the microphone
  (`recorderRef.cancel()`, which stops every track), the preview audio, and every
  request still in flight (their AbortControllers). The video run is not one of them: it
  is a background job (`startVideoJob`) that outlives the modal and is cancelled from the
  corner panel. The cleanup effect below is that.

  Recorded voices have owners (`clonedVoices.ts`): the site's one Cartesia account holds
  every user's clones, so "Your voices" lists only this user's, a saved pick of anyone
  else's is dropped, and recording waits for the notice's consent box and for ownership
  to be known. A clone in flight when the dialog closes still gets recorded as theirs.
*/

function describe(err: unknown): string {
  return err instanceof CartesiaError || err instanceof RecordingError || err instanceof CloneNotKeptError
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

const OWNER_UNKNOWN: OwnVoices = { kind: 'failed' }
const ALREADY_GENERATING = 'A video is already generating. Wait for it to finish, then try again.'

// Ruled in ink like `Input`, so the dialog's fields read as one set.
const SELECT =
  'w-full cursor-pointer rounded-app-sm border-[1.5px] border-app-foreground bg-app-background px-2.5 py-2 text-sm text-app-foreground outline-none transition-shadow duration-150 focus:ring-3 focus:ring-app-accent/35 disabled:cursor-not-allowed disabled:opacity-50'

export function CloneVoiceModal({
  deck,
  onClose,
}: {
  deck: VideoDeck
  onClose: () => void
}) {
  const warning = useVoiceStore((s) => s.warning)
  // False after a failed read of the saved voice: what is on screen is then the defaults, not
  // what is stored, and Save is off (see `canSaveVoice`). Reopening the modal tries the read again.
  const savedVoiceKnown = useVoiceStore((s) => s.loaded)
  const saveError = useVoiceStore((s) => s.error)
  const saving = useVoiceStore((s) => s.status === 'saving')
  const configured = isCartesiaConfigured()

  const [draft, setDraft] = useState<VoiceSettings>(() => useVoiceStore.getState().settings)
  // An initial value, not something to subscribe to: read once, from the store as it is now.
  const [ready, setReady] = useState(() => useVoiceStore.getState().loaded)

  /* ---- the video ---- */
  const [existing, setExisting] = useState<VideoView | null>(null)
  // Any video running (it is a background job): Generate stays off until it finishes.
  const generating = useJobsStore((s) => s.jobs.video?.status === 'running')
  const [videoError, setVideoError] = useState<string | null>(null)
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

  // Showing a saved video here is seeing it: the card's video dot goes.
  useEffect(() => {
    if (existing && deck.presentationId) clearNew(deck.presentationId, 'video')
  }, [existing, deck.presentationId])

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

  /* ---- the talking intro and outro ---- */
  const uid = useAuthStore((s) => s.user?.id ?? null)
  const [photo, setPhoto] = useState<FacePhoto | null>(null)
  // The user the photo was read for. With no one signed in or no database there is nothing to wait for.
  const [photoReadFor, setPhotoReadFor] = useState<string | null>(null)
  const checkingPhoto = supabase !== null && uid !== null && photoReadFor !== uid
  // The switch starts on; whether it is *in effect* also depends on `faceStop` below.
  const [faceSwitch, setFaceSwitch] = useState(true)
  // The dialog loads the intro and outro itself: opened from the Create & export menu, the Narrate tab
  // that normally loads them may not be mounted.
  const bookends = useBookendsStore((s) => (s.deckId === deck.presentationId ? s.bookends : EMPTY_BOOKENDS))

  useEffect(() => {
    if (deck.presentationId) void useBookendsStore.getState().load(deck.presentationId)
  }, [deck.presentationId])

  // The photo, read once on open. Best effort: no photo on any failure.
  useEffect(() => {
    if (!supabase || !uid) return
    let cancelled = false
    void readFacePhoto(supabaseFacePorts(supabase), uid).then((found) => {
      if (cancelled) return
      setPhoto(found)
      setPhotoReadFor(uid)
    })
    return () => {
      cancelled = true
    }
  }, [uid])

  const introText = bookendText(bookends, 'intro', deck.title)
  const outroText = bookendText(bookends, 'outro', deck.title)
  const faceStop = faceBlocker({ configured: isWavespeedConfigured(), hasPhoto: photo !== null, introText, outroText })
  const faceOn = faceSwitch && faceStop === null

  /* ---- voices ---- */
  // Picking a voice is what most people do; recording one sits behind the second tab.
  const [voiceTab, setVoiceTab] = useState<'pick' | 'record'>('pick')
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

  /* ---- whose voices are whose ---- */
  const [own, setOwn] = useState<OwnVoices | null>(null)
  useEffect(() => {
    if (!supabase || !configured) return
    let cancelled = false
    void readOwnVoices(supabaseClonePorts(supabase)).then((result) => {
      if (!cancelled) setOwn(result)
    })
    return () => {
      cancelled = true
    }
  }, [configured])

  // The voice in use: a cloned pick only once it is known to be this user's (a pick saved before
  // voices had owners can be someone else's), so until then, and for anyone else's, none.
  const choice = keepOwnVoice(draft, own ?? OWNER_UNKNOWN)

  const [confirmDelete, setConfirmDelete] = useState<VoiceSummary | null>(null)
  const [deletingVoice, setDeletingVoice] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function removeVoice(voice: VoiceSummary) {
    if (!supabase) return
    setDeletingVoice(true)
    setDeleteError(null)
    try {
      await deleteOwnVoice(voice.id, { remove: (id) => deleteVoice(id), ports: supabaseClonePorts(supabase) })
      if (!mountedRef.current) return
      setOwn((o) => (o?.kind === 'known' ? { kind: 'known', ids: new Set([...o.ids].filter((id) => id !== voice.id)) } : o))
      setDraft((d) => (d.voiceId === voice.id ? { ...d, voiceId: null, voiceName: null, voiceSource: null } : d))
      // A saved pick of it would narrate the next video with a voice that no longer exists.
      const saved = useVoiceStore.getState().settings
      if (saved.voiceId === voice.id) {
        void useVoiceStore.getState().save({ ...saved, voiceId: null, voiceName: null, voiceSource: null })
      }
      setConfirmDelete(null)
      setRefresh((n) => n + 1)
    } catch (err) {
      if (mountedRef.current) setDeleteError(describe(err))
    } finally {
      if (mountedRef.current) setDeletingVoice(false)
    }
  }

  function pick(voice: VoiceSummary, source: VoiceSource) {
    setDraft((d) => ({ ...d, voiceId: voice.id, voiceName: voice.name, voiceSource: source }))
  }

  /* ---- recording ---- */
  const support = useMemo(() => recordingSupport(), [])
  const [recState, setRecState] = useState<RecState>('idle')
  const [seconds, setSeconds] = useState(0)
  const [clip, setClip] = useState<Recording | null>(null)
  // The language the passage was read in, kept with the clip: the picker can move on afterwards.
  const [clipLanguage, setClipLanguage] = useState<VoiceLanguage | null>(null)
  const [clipUrl, setClipUrl] = useState<string | null>(null)
  const [recError, setRecError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [cloning, setCloning] = useState(false)
  const [cloneError, setCloneError] = useState<string | null>(null)
  // The name of the voice just cloned: the confirmation has to be on this tab, since the
  // "Selected" line and Your voices are on the Pick tab, which is hidden while recording.
  const [clonedName, setClonedName] = useState<string | null>(null)
  const [consented, setConsented] = useState(false)
  const recorderRef = useRef<Recorder | null>(null)
  const clipUrlRef = useRef<string | null>(null)
  const cloneAbortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(false)

  function discardClip() {
    if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current)
    clipUrlRef.current = null
    setClipUrl(null)
    setClip(null)
    setClipLanguage(null)
    setSeconds(0)
    setRecState('idle')
  }

  async function startRecord() {
    if (!support.supported || !canRecord({ ...recordGate, supported: true })) return
    const startedIn = draft.language
    discardClip()
    setRecError(null)
    setClonedName(null)
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
      setClipLanguage(startedIn)
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
    const client = supabase
    if (!clip || !client || !consented || !canClone({ clipSeconds: clip.seconds, name })) return
    const controller = new AbortController()
    cloneAbortRef.current = controller
    setCloning(true)
    setCloneError(null)
    setClonedName(null)
    try {
      // Once Cartesia has made the voice it is recorded as this user's even if the dialog closes:
      // the signal only cancels the clone request itself.
      const voice = await cloneOwnVoice({
        clone: () =>
          cloneVoice({
            clip: clip.blob,
            name,
            language: languageForClone(clipLanguage, draft.language),
            signal: controller.signal,
          }),
        ports: supabaseClonePorts(client),
        discard: (id) => deleteVoice(id),
      })
      if (controller.signal.aborted) return
      setOwn((o) => (o?.kind === 'known' ? { kind: 'known', ids: new Set([...o.ids, voice.id]) } : o))
      pick(voice, 'cloned')
      setRefresh((n) => n + 1)
      discardClip()
      setName('')
      setClonedName(voice.name)
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
    if (!choice.voiceId) return
    stopPreview()
    const controller = new AbortController()
    const state = { controller, audio: null as HTMLAudioElement | null, url: null as string | null }
    previewRef.current = state
    setPreview('loading')
    setPreviewError(null)
    try {
      const blob = await speak({
        voiceId: choice.voiceId,
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

  const blocker = generateBlocker({
    webCodecs,
    hasDeck: deck.presentationId !== null,
    slideCount: deck.cards.length,
    voiceChosen: choice.voiceId !== null,
  })
  const canGenerate = canStartGenerate({
    configured,
    blocker,
    ready,
    savedVoiceKnown,
    saving,
    generating,
    cloning,
    recording: recState === 'recording',
  })

  async function generate() {
    if (!canGenerate) return
    const voice = choice
    if (voice.voiceId === null) return
    setVideoError(null)
    // The video needs the voice, so the voice is saved first; if that fails, its own error shows.
    if (!(await useVoiceStore.getState().save(voice))) return
    if (!mountedRef.current) return
    const { presentationId } = deck
    if (!presentationId) return
    // The words come from the store as it is after the read and any pending edit are done, not from
    // what was drawn: a late read must not send the starters over a box the user cleared.
    await useBookendsStore.getState().load(presentationId)
    await useBookendsStore.getState().flush()
    if (!mountedRef.current) return
    const saved = useBookendsStore.getState().bookends
    const intro = bookendText(saved, 'intro', deck.title)
    const outro = bookendText(saved, 'outro', deck.title)
    const stop = faceBlocker({ configured: isWavespeedConfigured(), hasPhoto: photo !== null, introText: intro, outroText: outro })
    // The switch was on when Generate was pressed, so a video without the face would be a surprise: say why.
    if (faceSwitch && stop !== null) {
      setVideoError(stop)
      return
    }
    const face = faceSwitch ? { bookends: { intro, outro } } : null
    const started = startVideoJob({ deck: { ...deck, presentationId }, voice, previous: existing?.record ?? null, face })
    if (!started) {
      setVideoError(ALREADY_GENERATING)
      return
    }
    // The editor stays open: the video shows its progress in the corner panel, like a quiz.
    onClose()
  }

  const recording = recState === 'recording'
  const recordGate = { ready, configured, recState, cloning, consented, ownVoicesKnown: own?.kind === 'known' }
  const cloneReady = clip !== null && consented && canClone({ clipSeconds: clip.seconds, name })
  const mineShown = own && lists ? ownClones(lists.mine, own) : []
  // Only a recorded voice of this user's can be deleted, and only from the list it is in.
  const selectedOwn = mineShown.find((v) => v.id === choice.voiceId) ?? null
  const emotionOff = draft.language !== 'en'
  const disabledAll = !ready || !configured

  // What the footer says about Generate: every error, and also why it is off or that a run is in
  // progress, so a stale error never hides the reason the button is disabled.
  // "One is already generating" stops holding once that run ends; the face blocker stays until the switch,
  // the photo or the next Generate clears it.
  const footerErrors = [saveError, videoError !== null && (generating || videoError !== ALREADY_GENERATING) ? videoError : null].filter((e): e is string => Boolean(e))
  const footerNote =
    ready && !savedVoiceKnown
      ? 'Your saved voice could not be read, so generating is turned off. Close this and open it again to retry.'
      : blocker && configured
        ? blocker
        : generating
          ? 'A video is already generating.'
          : null

  return (
    <Modal title="Narrated video" onClose={onClose} maxWidth="max-w-3xl">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-app-muted">Pick a voice, set how it sounds, then make a video of the whole deck read aloud.</p>
          {!configured && <p className="text-sm text-app-danger-text">{VOICE_NOT_SET_UP}</p>}
          {warning && <Notice tone="warn">{warning}</Notice>}
        </div>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          {/* ---- 1. Voice: pick one, or record your own ---- */}
          <section aria-labelledby="voice-voice" className="flex min-w-0 flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <StepHeading n={1} id="voice-voice">
                Voice
              </StepHeading>
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

            <VoiceTabs tab={voiceTab} onTabChange={setVoiceTab} />

            {/* Both panels stay mounted: a recording or a clone in progress survives a switch of tab. */}
            <div id="voice-panel-pick" role="tabpanel" aria-labelledby="voice-tab-pick" hidden={voiceTab !== 'pick'} className="flex flex-col gap-2">
              <Input
                type="search"
                aria-label="Search voices"
                placeholder="Search voices"
                value={query}
                disabled={disabledAll}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div
                className="scrollbar-subtle h-60 overflow-y-auto rounded-app-sm border border-app-border"
                role="radiogroup"
                aria-label="Voices"
              >
                {loadingVoices && (
                  <p className="flex items-center gap-2 p-3 text-xs text-app-muted">
                    <Spinner /> Loading voices…
                  </p>
                )}
                {lists?.error && !loadingVoices && <p className="p-3 text-xs text-app-danger-text">{lists.error}</p>}
                {lists && !loadingVoices && !lists.error && (
                  <>
                    <VoiceGroup title="Your voices" voices={mineShown} selectedId={choice.voiceId} onPick={(v) => pick(v, 'cloned')} />
                    <VoiceGroup title="Premade voices" voices={lists.premade} selectedId={choice.voiceId} onPick={(v) => pick(v, 'premade')} />
                    {mineShown.length === 0 && lists.premade.length === 0 && (
                      <p className="p-3 text-xs text-app-muted">No voices match.</p>
                    )}
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-xs text-app-muted">
                  {choice.voiceName ? (
                    <>
                      Selected: <span className="font-semibold text-app-foreground">{choice.voiceName}</span>
                    </>
                  ) : (
                    'No voice selected yet.'
                  )}
                </p>
                {selectedOwn && !confirmDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null)
                      setConfirmDelete(selectedOwn)
                    }}
                    disabled={disabledAll}
                    className="cursor-pointer text-xs font-medium text-app-danger-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Delete this voice
                  </button>
                )}
              </div>
              {confirmDelete && (
                <div
                  role="alertdialog"
                  aria-labelledby="voice-delete-title"
                  className="flex flex-col gap-2 rounded-app-sm border border-app-border bg-app-surface p-3"
                >
                  <p id="voice-delete-title" className="text-sm text-app-foreground">
                    Delete <span className="font-medium">“{confirmDelete.name}”</span>? It&apos;s removed from Cartesia for
                    good. Videos you already made keep their sound.
                  </p>
                  {deleteError && <p className="text-xs text-app-danger-text">{deleteError}</p>}
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setConfirmDelete(null)} disabled={deletingVoice}>
                      Keep
                    </Button>
                    <Button variant="danger" onClick={() => void removeVoice(confirmDelete)} loading={deletingVoice}>
                      {deleteError ? 'Try again' : 'Delete voice'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div
              id="voice-panel-record"
              role="tabpanel"
              aria-labelledby="voice-tab-record"
              hidden={voiceTab !== 'record'}
              className="flex flex-col gap-3"
            >
              <div className="rounded-app-sm border border-app-border bg-app-surface p-3 text-xs text-app-muted">
                <p className="font-semibold text-app-foreground">Before you record</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4">
                  <li>Your recording goes to Cartesia, the voice service this site uses, to make a copy of your voice.</li>
                  <li>
                    The copy is kept in this site&apos;s Cartesia account until you delete it here. Deleting your Lektura
                    account deletes it too.
                  </li>
                  <li>Only you can pick it in Lektura. Whoever runs this site can also see it in their Cartesia account.</li>
                </ul>
                <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-app-foreground">
                  <input
                    type="checkbox"
                    checked={consented}
                    disabled={disabledAll || recording || cloning}
                    onChange={(e) => setConsented(e.target.checked)}
                    className="mt-0.5 size-3.5 shrink-0 cursor-pointer accent-app-accent"
                  />
                  This is my own voice, and I agree to it being copied.
                </label>
              </div>
              {own?.kind === 'missing' && <Notice tone="warn">{CLONES_MIGRATION_MESSAGE}</Notice>}
              {own?.kind === 'failed' && (
                <Notice tone="warn">
                  Couldn&apos;t check which voices are yours, so recording is off. Close this and open it again to retry.
                </Notice>
              )}

              <div className="flex flex-col gap-1.5">
                <p className="caps text-[0.6875rem] text-app-muted">
                  Read aloud, {MIN_CLIP_SECONDS} to {MAX_CLIP_SECONDS} seconds
                </p>
                <blockquote className="rounded-app-sm border border-app-border bg-app-surface p-3 text-sm leading-relaxed text-app-foreground">
                  {READING_SCRIPTS[draft.language]}
                </blockquote>
                <p className="text-xs text-app-muted">A quiet room and your normal pace give the closest copy.</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {recording ? (
                  <Button variant="danger" onClick={() => recorderRef.current?.stop()} aria-label="Stop recording">
                    Stop
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => void startRecord()}
                    disabled={!canRecord({ ...recordGate, supported: support.supported })}
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
              {recError && <p className="text-xs text-app-danger-text">{recError}</p>}
              {clip && clipLanguage !== null && clipLanguage !== draft.language && (
                <p className="text-xs text-app-muted">
                  Recorded in {VOICE_LANGUAGES.find((l) => l.code === clipLanguage)?.label}; this clip will be cloned as{' '}
                  {VOICE_LANGUAGES.find((l) => l.code === clipLanguage)?.label}.
                </p>
              )}
              {clip && clip.seconds < MIN_CLIP_SECONDS && (
                <Notice tone="warn">That was too short: record at least {MIN_CLIP_SECONDS} seconds.</Notice>
              )}

              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <label className="flex flex-col gap-1.5">
                  <span className="caps text-[0.6875rem] text-app-muted">Name your voice</span>
                  <Input
                    value={name}
                    maxLength={MAX_NAME_LENGTH}
                    placeholder="My narration voice"
                    disabled={disabledAll}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <Button
                  variant="secondary"
                  onClick={() => void clone()}
                  disabled={disabledAll || !cloneReady || cloning}
                  aria-label="Clone voice"
                >
                  {cloning ? <Spinner /> : null}
                  Clone voice
                </Button>
              </div>
              {cloneError && <p className="text-xs text-app-danger-text">{cloneError}</p>}
              {clonedName && (
                <p role="status" className="text-xs font-medium text-app-foreground">
                  Cloned &ldquo;{clonedName}&rdquo; and selected it. It is under Your voices on the Pick a voice tab.
                </p>
              )}
            </div>
          </section>

          {/* ---- 2. How it sounds: settings, then hear it ---- */}
          <section aria-labelledby="voice-settings" className="flex min-w-0 flex-col gap-4">
            <StepHeading n={2} id="voice-settings">
              Settings
            </StepHeading>
            <div className="flex flex-col gap-4 rounded-app-sm border border-app-border p-4">
              <Slider
                label="Speed"
                min={MIN_SPEED}
                max={MAX_SPEED}
                step={SPEED_STEP}
                value={draft.speed}
                disabled={disabledAll}
                onChange={(v) => setDraft((d) => ({ ...d, speed: clampSpeed(v) }))}
              />
              <Slider
                label="Volume"
                min={MIN_VOLUME}
                max={MAX_VOLUME}
                step={VOLUME_STEP}
                value={draft.volume}
                disabled={disabledAll}
                onChange={(v) => setDraft((d) => ({ ...d, volume: clampVolume(v) }))}
              />
              <label className="flex flex-col gap-1.5">
                <span className="caps text-[0.6875rem] text-app-muted">Emotion</span>
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
                {emotionOff && <span className="text-xs text-app-muted">Emotion is available in English only.</span>}
              </label>
            </div>

            <div aria-labelledby="voice-preview" role="group" className="flex flex-col gap-2 rounded-app-sm bg-app-surface p-4">
              <h4 id="voice-preview" className="caps text-[0.6875rem] text-app-foreground">
                Preview
              </h4>
              <p className="text-sm text-app-foreground">“{previewTranscript(draft.language)}”</p>
              <div className="flex flex-wrap items-center gap-2">
                {preview === 'idle' ? (
                  <Button
                    variant="secondary"
                    onClick={() => void playPreview()}
                    disabled={disabledAll || choice.voiceId === null}
                    aria-label="Preview voice"
                  >
                    <PlayGlyph />
                    Preview voice
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={stopPreview} aria-label="Stop preview">
                    {preview === 'loading' ? <Spinner /> : null}
                    Stop
                  </Button>
                )}
                {choice.voiceId === null && <span className="text-xs text-app-muted">Choose a voice first.</span>}
              </div>
              {previewError && <p className="text-xs text-app-danger-text">{previewError}</p>}
            </div>
          </section>
        </div>

        {/* ---- 3. A talking intro and outro ---- */}
        <section aria-labelledby="voice-face" className="flex flex-col gap-3 border-t border-app-border pt-6">
          <StepHeading n={3} id="voice-face">
            Talking intro &amp; outro
          </StepHeading>
          <FaceStep
            uid={uid}
            photo={photo}
            onPhoto={(p) => {
              setVideoError(null)
              setPhoto(p)
            }}
            checked={faceOn}
            onToggle={(on) => {
              setVideoError(null)
              setFaceSwitch(on)
            }}
            checking={checkingPhoto}
            blocker={faceStop}
            costLine={faceOn ? faceCostLine(introText, outroText) : null}
          />
        </section>

        {/* ---- 4. The video ---- */}
        <section aria-labelledby="voice-video" className="flex flex-col gap-3 border-t border-app-border pt-6">
          <StepHeading n={4} id="voice-video">
            Video
          </StepHeading>
          {existing ? (
            <div className="grid gap-4 sm:grid-cols-[minmax(0,18rem)_1fr] sm:items-start">
              {existing.url ? (
                <video controls src={existing.url} aria-label="Presentation video" className="aspect-video w-full rounded-app-sm bg-black" />
              ) : (
                <Notice tone="warn">The video is saved, but a link to play it could not be made. Reopen this.</Notice>
              )}
              <div className="flex flex-col gap-2 text-sm">
                <p className="font-semibold text-app-foreground">
                  Current video · <span className="tabular-nums">{videoLength(existing.record.durationSeconds)}</span>
                </p>
                <p className="text-xs text-app-muted">Made {new Date(existing.record.generatedAt).toLocaleString()}</p>
                {existing.downloadUrl && (
                  <a
                    href={existing.downloadUrl}
                    className="w-fit text-sm font-semibold text-app-accent-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
                  >
                    Download
                  </a>
                )}
                <p className="text-xs text-app-muted">Generating again replaces this video.</p>
              </div>
            </div>
          ) : (
            <p className="rounded-app-sm border border-dashed border-app-border p-4 text-sm text-app-muted">
              No video yet. When it is done it plays here and on the Videos page.
            </p>
          )}
        </section>

        {/* ---- Generate: stays in view at the bottom of the dialog while the rest scrolls ---- */}
        <div className="sticky -bottom-6 -mx-6 -mb-6 flex flex-col gap-3 border-t border-app-border bg-app-background px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            {footerErrors.map((error) => (
              <p key={error} role="alert" className="text-sm font-medium text-app-danger-text">
                {error}
              </p>
            ))}
            {footerNote && (
              <p role="status" className="text-sm font-medium text-app-foreground">
                {footerNote}
              </p>
            )}
            <p className="text-xs text-app-muted">
              Narrates every slide with Cartesia, which uses credits. Keep this tab in the foreground while the slides are drawn.
            </p>
          </div>
          <div className="flex shrink-0 justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="primary"
              onClick={() => void generate()}
              disabled={!canGenerate}
              title={generating ? 'A video is already generating.' : undefined}
              aria-label="Generate video"
            >
              {saving ? <Spinner /> : null}
              Generate video
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

type VoiceTab = 'pick' | 'record'

/** A numbered step: the dialog is done in order, voice, then how it sounds, then the video. */
function StepHeading({ n, id, children }: { n: number; id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="caps flex items-center gap-2 text-[0.6875rem] text-app-foreground">
      <span aria-hidden="true" className="grid size-5 place-items-center rounded-[4px] bg-app-foreground text-[0.6875rem] text-app-background tabular-nums">
        {n}
      </span>
      {children}
    </h3>
  )
}

/** Warnings: a 25% sun tint under foreground text (DESIGN.md, The Tokens For State Rule). */
function Notice({ tone, children }: { tone: 'warn'; children: ReactNode }) {
  return (
    <p className={`rounded-app-sm px-3 py-2 text-xs text-app-foreground ${tone === 'warn' ? 'bg-app-track-sun/25' : ''}`}>
      {children}
    </p>
  )
}

/** Pick a voice or record one: the editor's mode-tab tray, with the orange lanyard tab on the chosen one. */
function VoiceTabs({ tab, onTabChange }: { tab: VoiceTab; onTabChange: (tab: VoiceTab) => void }) {
  const tabs: { id: VoiceTab; label: string }[] = [
    { id: 'pick', label: 'Pick a voice' },
    { id: 'record', label: 'Record your voice' },
  ]
  return (
    <div
      role="tablist"
      aria-label="Voice source"
      className="flex items-center gap-0.5 rounded-app border border-app-border bg-app-surface p-0.5"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        const next: VoiceTab = tab === 'pick' ? 'record' : 'pick'
        onTabChange(next)
        document.getElementById(`voice-tab-${next}`)?.focus()
      }}
    >
      {tabs.map((t) => {
        const selected = t.id === tab
        return (
          <button
            key={t.id}
            type="button"
            id={`voice-tab-${t.id}`}
            role="tab"
            aria-selected={selected}
            aria-controls={`voice-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onTabChange(t.id)}
            className={`relative h-8 flex-1 cursor-pointer rounded-[calc(var(--app-radius)-2px)] px-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent ${
              selected ? 'bg-app-background text-app-foreground ring-1 ring-app-border' : 'text-app-muted hover:text-app-foreground'
            }`}
          >
            {selected && <span aria-hidden="true" className="absolute bottom-0 left-1/2 h-1 w-5 -translate-x-1/2 bg-app-accent" />}
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

/** A labelled range with its value on the right, so the setting reads before the bar. */
function Slider({
  label,
  min,
  max,
  step,
  value,
  disabled,
  onChange,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between">
        <span className="caps text-[0.6875rem] text-app-muted">{label}</span>
        <span className="text-sm font-semibold text-app-foreground tabular-nums">{value.toFixed(2)}×</span>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer accent-app-accent disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  )
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="size-3.5" fill="currentColor" aria-hidden="true">
      <path d="M6 4.2v11.6a.6.6 0 0 0 .9.5l9.3-5.8a.6.6 0 0 0 0-1L6.9 3.7a.6.6 0 0 0-.9.5Z" />
    </svg>
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
      <p className="caps sticky top-0 z-[1] bg-app-surface px-3 py-1.5 text-[0.6875rem] text-app-muted">{title}</p>
      {voices.map((voice) => {
        const selected = voice.id === selectedId
        return (
          <button
            key={voice.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onPick(voice)}
            className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-app-accent ${
              selected ? 'bg-app-accent/10 text-app-accent-text' : 'text-app-foreground hover:bg-app-surface'
            }`}
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">{voice.name}</span>
              {(voice.tagline || voice.gender) && (
                <span className="truncate text-xs text-app-muted">{[voice.tagline, voice.gender].filter(Boolean).join(' · ')}</span>
              )}
            </span>
            {/* Not colour alone: the chosen voice also carries a tick. */}
            {selected && (
              <svg viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3.5 8.5l3 3 6-7" />
              </svg>
            )}
          </button>
        )
      })}
    </div>
  )
}
