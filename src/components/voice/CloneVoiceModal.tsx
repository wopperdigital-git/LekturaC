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
  DEFAULT_SETTINGS,
  isEmotion,
  type VoiceSettings,
  type VoiceSource,
} from '@/voice/settingsRow'
import {
  READING_SCRIPTS,
  previewTranscript,
  type VoiceLanguage,
} from '@/voice/scripts'
import {
  MAX_CLIP_SECONDS,
  MAX_NAME_LENGTH,
  MIN_CLIP_SECONDS,
  TARGET_CLIP_SECONDS,
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
import { loadVideo, loadVideoHistory, supabasePorts, type VideoView } from '@/video/storage'
import { bookendsReady, canStartGenerate, faceBlocker, faceRequest, generateBlocker } from '@/video/ui'
import { videoLength } from '@/video/library'
import type { VideoDeck } from '@/video/generate'
import { startVideoJob } from '@/jobs/start'
import { useJobsStore } from '@/jobs/jobsStore'
import { clearNew } from '@/jobs/newItems'
import { VOICE_NOT_SET_UP } from '@/lib/setupCopy'
import { useAuthStore } from '@/store/authStore'
import { isWavespeedConfigured } from '@/avatar/wavespeed'
import { readFacePhoto, supabaseFacePorts, type FacePhoto } from '@/avatar/facePhoto'
import { EMPTY_BOOKENDS, bookendText, clipCost, formatUsd } from '@/avatar/bookends'
import { useBookendsStore } from '@/avatar/bookendsStore'
import { clipSeconds, faceCostLine } from '@/avatar/costLine'
import { FaceStep } from './FaceStep'
import { CloneConsentModal } from './CloneConsentModal'
import { hasCloneConsent, rememberCloneConsent } from '@/voice/cloneConsent'
import { BookendBox } from '@/components/narrate/BookendBox'
import { VIDEO_STEPS, faceSummary, scriptPlan, slideList, soundSummary, stepAfter, type VideoStep } from '@/video/steps'
import { SILENT_SLIDE_SECONDS } from '@/video/timeline'

/*
  Makes the narrated video. First the voice: pick a premade voice or record and clone your
  own, tune how it speaks, and hear two fixed sentences in it. It works on a draft; nothing
  is saved until Generate video, which saves the voice and then starts the video. (It was
  "Narration voice" with a "Generate Presentation" button, the same words that make a deck
  at /new, behind a "Clone voice" button; nobody looking for a video looked there.)

  Three things are cleaned up when it closes, because closing is done by Escape, the
  backdrop or the ✕ and none of them run any code of ours first: the microphone
  (`recorderRef.cancel()`, which stops every track), the preview audio, and every
  request still in flight (their AbortControllers). The video run is not one of them: it
  is a background job (`startVideoJob`) that outlives the modal and is cancelled from the
  corner panel. The cleanup effect below is that.

  Recorded voices have owners (`clonedVoices.ts`): the site's one Cartesia account holds
  every user's clones, so "Your voices" lists only this user's, a saved pick of anyone
  else's is dropped, and recording waits for the notice's consent box and for ownership
  to be known. A clone in flight when the dialog closes still gets recorded as theirs.
*/

/*
  English only: the voice, its preview and the reading passage are always English. A setting saved
  in another language (the dialog used to offer five more) is read as English, and saved that way.
*/
function inEnglish(settings: VoiceSettings): VoiceSettings {
  return settings.language === 'en' ? settings : { ...settings, language: 'en' }
}

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
  'cursor-pointer rounded-app-sm border-[1.5px] border-app-foreground bg-app-background px-2.5 py-2 text-sm text-app-foreground outline-none transition-shadow duration-150 focus:ring-3 focus:ring-app-accent/35 disabled:cursor-not-allowed disabled:opacity-50'

export function CloneVoiceModal({
  deck,
  onClose,
  initialStep = 'voice',
}: {
  deck: VideoDeck
  onClose: () => void
  /** The step on screen when it opens: the voice from a menu, the video from "View Video". */
  initialStep?: VideoStep
}) {
  const warning = useVoiceStore((s) => s.warning)
  // False after a failed read of the saved voice: what is on screen is then the defaults, not
  // what is stored, and Save is off (see `canSaveVoice`). Reopening the modal tries the read again.
  const savedVoiceKnown = useVoiceStore((s) => s.loaded)
  const saveError = useVoiceStore((s) => s.error)
  const saving = useVoiceStore((s) => s.status === 'saving')
  const configured = isCartesiaConfigured()

  const [draft, setDraft] = useState<VoiceSettings>(() => inEnglish(useVoiceStore.getState().settings))
  // An initial value, not something to subscribe to: read once, from the store as it is now.
  const [ready, setReady] = useState(() => useVoiceStore.getState().loaded)

  /* ---- the video ---- */
  const [existing, setExisting] = useState<VideoView | null>(null)
  // Any video running (it is a background job): Generate stays off until it finishes.
  const generating = useJobsStore((s) => s.jobs.video?.status === 'running')
  const [videoError, setVideoError] = useState<string | null>(null)
  const webCodecs = useMemo(() => hasWebCodecs(), [])

  // The deck's earlier videos (0022), newest first: kept, not replaced, each time a video is made.
  const [history, setHistory] = useState<VideoView[]>([])

  // The deck's saved video, if it has one, and its earlier ones. Nothing to show is not an error: a
  // project without migration 0015 says so when you generate; one without 0022 has no earlier videos.
  useEffect(() => {
    if (!supabase || !deck.presentationId) return
    let cancelled = false
    const ports = supabasePorts(supabase)
    const name = deck.title || 'presentation'
    void loadVideo(ports, deck.presentationId, name).then((view) => {
      if (!cancelled) setExisting(view)
    })
    void loadVideoHistory(ports, deck.presentationId, name).then((views) => {
      if (!cancelled) setHistory(views)
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
        setDraft(inEnglish(useVoiceStore.getState().settings))
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
  // Until this deck's intro and outro are read, the cost line and Generate would use starters, not the saved words.
  const bookendsLoadedForThisDeck = useBookendsStore((s) =>
    bookendsReady({ presentationId: deck.presentationId, hasDatabase: supabase !== null, loaded: s.loaded, deckId: s.deckId }),
  )

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
  // Agreed once, remembered per user on this device: the consent dialog is asked the first time only.
  const [consented, setConsented] = useState(() => hasCloneConsent(useAuthStore.getState().user?.id ?? null))
  const [askingConsent, setAskingConsent] = useState(false)
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

  /** Record pressed: asks for consent the first time, then records. */
  function pressRecord() {
    if (!consented) {
      setAskingConsent(true)
      return
    }
    void startRecord()
  }

  function agreeToClone() {
    rememberCloneConsent(uid)
    setConsented(true)
    setAskingConsent(false)
    // The press on "I agree" is the go-ahead to record; the consent is checked here rather than
    // through state, which is not updated until the next render.
    void startRecord(true)
  }

  async function startRecord(consentGiven = consented) {
    if (!support.supported || !consentGiven || !canRecord({ ...recordGate, supported: true, consented: true })) return
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
  // The voice being heard: the chosen one from the Sound step, or any row's play button in the list.
  const [previewVoiceId, setPreviewVoiceId] = useState<string | null>(null)
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
    setPreviewVoiceId(null)
  }

  async function playPreview(voiceId: string | null = choice.voiceId) {
    if (!voiceId) return
    stopPreview()
    const controller = new AbortController()
    const state = { controller, audio: null as HTMLAudioElement | null, url: null as string | null }
    previewRef.current = state
    setPreview('loading')
    setPreviewVoiceId(voiceId)
    setPreviewError(null)
    try {
      const blob = await speak({
        voiceId,
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
  // Until the saved photo is known, the face step cannot say what Generate would do.
  const canGenerate = !checkingPhoto && bookendsLoadedForThisDeck && canStartGenerate({
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
    // The switch as drawn when pressed, taken before any await.
    const faceWasOn = faceOn
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
    // A switch that showed off or blocked makes a plain video; one that showed on and has since become
    // impossible says why instead of making a video without the face in silence.
    const request = faceRequest({ effectiveOn: faceWasOn, blockerNow: stop, intro, outro })
    if (request.kind === 'blocked') {
      setVideoError(request.message)
      return
    }
    const face = request.kind === 'on' ? { bookends: request.bookends } : null
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

  /* ---- steps ---- */
  const [step, setStep] = useState<VideoStep>(initialStep)
  const headingRefs = useRef<Partial<Record<VideoStep, HTMLHeadingElement | null>>>({})
  const stepsTopRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<HTMLVideoElement | null>(null)

  /**
   * Shows another step. A video playing on the Video step is paused, since a hidden one would keep
   * talking. From a button inside a panel (`focus`), focus moves to the new step's heading: the button
   * pressed has just been hidden, and focus would otherwise fall back to the page.
   */
  function goStep(next: VideoStep, focus = false) {
    if (next !== 'video') playerRef.current?.pause()
    setStep(next)
    stepsTopRef.current?.scrollIntoView({ block: 'nearest' })
    if (focus) requestAnimationFrame(() => headingRefs.current[next]?.focus({ preventScroll: true }))
  }

  const plan = scriptPlan({
    texts: deck.cards.map((c) => c.narration?.text ?? ''),
    speed: draft.speed,
    bookends: faceOn ? { intro: introText, outro: outroText } : null,
  })
  const faceConfigured = isWavespeedConfigured()
  const faceCost = faceOn ? faceCostLine(introText, outroText) : null
  const faceDollars = clipCost(clipSeconds(introText)) + clipCost(clipSeconds(outroText))
  const soundIsDefault =
    draft.speed === DEFAULT_SETTINGS.speed && draft.volume === DEFAULT_SETTINGS.volume && draft.emotion === DEFAULT_SETTINGS.emotion

  const railItems: RailItem[] = VIDEO_STEPS.map((s) => {
    switch (s.id) {
      case 'voice':
        return { ...s, summary: !ready ? 'Loading…' : (choice.voiceName ?? 'Not chosen'), attention: ready && configured && choice.voiceId === null }
      case 'sound':
        return { ...s, summary: soundSummary(draft), attention: false }
      case 'face':
        return {
          ...s,
          summary:
            faceOn && faceDollars > 0
              ? `On · ${formatUsd(faceDollars)}`
              : faceSummary({ checking: checkingPhoto, configured: faceConfigured, on: faceOn, blocked: faceStop !== null }),
          attention: false,
        }
      case 'video':
        return {
          ...s,
          summary: generating ? 'Generating…' : existing ? videoLength(existing.record.durationSeconds) : 'None yet',
          attention: false,
        }
    }
  })

  /*
    Premade voices fold away. Until the user opens or closes them, they start open unless the user has
    voices of their own and is not using a premade one, and a search opens them so its matches show.
  */
  const [premadeOpen, setPremadeOpen] = useState<boolean | null>(null)
  const premadeShown = premadeOpen ?? (mineShown.length === 0 || choice.voiceSource === 'premade' || debouncedQuery.trim() !== '')

  /** Every row's play button: hears that voice with the current sound settings; pressed again, stops. */
  const rowPlay = {
    playingId: preview === 'idle' ? null : previewVoiceId,
    playPhase: preview,
    playDisabled: disabledAll,
    onPlay: (voice: VoiceSummary) => (previewVoiceId === voice.id && preview !== 'idle' ? stopPreview() : void playPreview(voice.id)),
  }

  const heading = (id: VideoStep) => (el: HTMLHeadingElement | null) => {
    headingRefs.current[id] = el
  }

  /* ---- which video is in the player ---- */
  // The latest first, then the earlier ones: the grid's order. `null` picks the latest.
  const allVideos = existing ? [existing, ...history] : history
  const [shownPath, setShownPath] = useState<string | null>(null)
  const shown = allVideos.find((v) => v.record.path === shownPath) ?? allVideos[0] ?? null

  function showVideo(path: string) {
    playerRef.current?.pause()
    setShownPath(path)
    stepsTopRef.current?.querySelector('#voice-step-video')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /*
    The footer moves through the steps: Back and Next, and Generate video only on the last step, where
    the summary and the cost are on screen. A missing voice is said there too (the rail's dot marks it
    earlier); anything else that stops Generate, such as a browser that cannot encode, is said on every
    step so nobody walks through the setup to find it at the end.
  */
  const back = stepAfter(step, -1)
  const next = stepAfter(step, 1)
  const onlyVoiceMissing = blocker !== null && generateBlocker({
    webCodecs,
    hasDeck: deck.presentationId !== null,
    slideCount: deck.cards.length,
    voiceChosen: true,
  }) === null
  const noteHere = footerNote !== null && (next === null || !(footerNote === blocker && onlyVoiceMissing))

  const footer = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        {footerErrors.map((error) => (
          <p key={error} role="alert" className="text-sm font-medium text-app-danger-text">
            {error}
          </p>
        ))}
        {noteHere && (
          <p role="status" className="text-sm font-medium text-app-foreground">
            {footerNote}
          </p>
        )}
        {/* Beside Generate, what the rail cannot hold: how many slides the next video has, and which are silent. */}
        {next === null && (
          <p className="text-sm text-app-muted tabular-nums">
            <span className="font-semibold text-app-foreground">{existing ? 'Next video' : 'Your video'}</span>
            {' · '}
            {plan.slides} {plan.slides === 1 ? 'slide' : 'slides'}
          </p>
        )}
        {next === null && plan.silent.length > 0 && (
          <Notice tone="warn">
            {slideList(plan.silent)} {plan.silent.length === 1 ? 'has' : 'have'} no script and will play in silence for{' '}
            {SILENT_SLIDE_SECONDS}s.
          </Notice>
        )}
      </div>
      <div className="flex shrink-0 justify-end gap-2 sm:ml-auto">
        {back && (
          <Button variant="ghost" onClick={() => goStep(back, true)} className="px-3">
            <ChevronGlyph dir="left" />
            Back
          </Button>
        )}
        {next ? (
          <Button variant="primary" onClick={() => goStep(next, true)}>
            Next
            <ChevronGlyph dir="right" />
          </Button>
        ) : (
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
        )}
      </div>
    </div>
  )

  return (
    <Modal title="Narrated video" onClose={onClose} maxWidth="max-w-4xl" footer={footer} bodyClassName="flex flex-col">
      <div className="flex flex-col gap-5 md:min-h-0">
        {(!configured || warning) && (
          <div className="flex flex-col gap-2">
            {!configured && <p className="text-sm text-app-danger-text">{VOICE_NOT_SET_UP}</p>}
            {warning && <Notice tone="warn">{warning}</Notice>}
          </div>
        )}

        {/* One fixed height for every step on wide screens, so the dialog does not jump as the steps
            change and nothing in it needs the page to scroll: the voice list scrolls inside itself. */}
        {/* Up to 27rem on wide screens, shrinking with a short window: the voice list gives up the room,
            so the dialog itself does not scroll. */}
        <div
          ref={stepsTopRef}
          className="grid scroll-mt-6 gap-5 md:h-[27rem] md:min-h-0 md:grid-cols-[12.5rem_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] md:gap-7"
        >
          <StepRail items={railItems} step={step} onStep={(s) => goStep(s)} />

          {/* Every step stays mounted and is only hidden: a recording, a clone or an upload in
              progress survives a move to another step. The rail names the step on screen, so each
              step's heading is for screen readers and for focus to land on. */}
          <div className="flex min-h-0 min-w-0 flex-col">
            {/* ---- 1. Voice: pick one, or record your own ---- */}
            <section
              id="voice-step-voice"
              aria-labelledby="voice-voice"
              hidden={step !== 'voice'}
              className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
            >
              <StepHeader n={1} id="voice-voice" headingRef={heading('voice')}>
                Voice
              </StepHeader>

              <VoiceTabs tab={voiceTab} onTabChange={setVoiceTab} />

              {/* Both panels stay mounted: a recording or a clone in progress survives a switch of tab. */}
              <div id="voice-panel-pick" role="tabpanel" aria-labelledby="voice-tab-pick" hidden={voiceTab !== 'pick'} className="flex min-h-0 flex-col gap-2">
                <Input
                  type="search"
                  aria-label="Search voices"
                  placeholder="Search voices"
                  value={query}
                  disabled={disabledAll}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <div
                  // As tall as its voices, never taller than the room left in the dialog: folded premade
                  // voices leave no empty box, and a long list scrolls inside itself, not the dialog.
                  className="scrollbar-subtle max-h-72 min-h-0 overflow-y-auto rounded-app-sm border border-app-border md:max-h-none"
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
                      <VoiceGroup
                        title="Your voices"
                        voices={mineShown}
                        selectedId={choice.voiceId}
                        onPick={(v) => pick(v, 'cloned')}
                        onDelete={(v) => {
                          setDeleteError(null)
                          setConfirmDelete(v)
                        }}
                        deleteDisabled={disabledAll || deletingVoice}
                        {...rowPlay}
                      />
                      <VoiceGroup
                        title="Premade voices"
                        voices={lists.premade}
                        selectedId={choice.voiceId}
                        onPick={(v) => pick(v, 'premade')}
                        open={premadeShown}
                        onOpenChange={setPremadeOpen}
                        {...rowPlay}
                      />
                      {mineShown.length === 0 && lists.premade.length === 0 && (
                        <p className="p-3 text-xs text-app-muted">No voices match.</p>
                      )}
                    </>
                  )}
                </div>
                {previewError && step === 'voice' && <p className="text-xs text-app-danger-text">{previewError}</p>}
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
                {own?.kind === 'missing' && <Notice tone="warn">{CLONES_MIGRATION_MESSAGE}</Notice>}
                {own?.kind === 'failed' && (
                  <Notice tone="warn">
                    Couldn&apos;t check which voices are yours, so recording is off. Close this and open it again to retry.
                  </Notice>
                )}

                <div className="flex flex-col gap-1.5">
                  <p className="caps text-[0.6875rem] text-app-muted">
                    Read this aloud in a quiet room · about {TARGET_CLIP_SECONDS} seconds
                  </p>
                  <blockquote className="rounded-app-sm border border-app-border bg-app-surface p-3 text-sm leading-relaxed text-app-foreground">
                    {READING_SCRIPTS[draft.language]}
                  </blockquote>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {recording ? (
                    <Button variant="danger" onClick={() => recorderRef.current?.stop()} aria-label="Stop recording">
                      Stop
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={pressRecord}
                      // Consent is asked by the press itself, so it does not hold the button off.
                      disabled={!canRecord({ ...recordGate, supported: support.supported, consented: true })}
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
                {clip && clip.seconds < MIN_CLIP_SECONDS && (
                  <Notice tone="warn">That was too short: read the whole passage, at least {MIN_CLIP_SECONDS} seconds.</Notice>
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

            {/* ---- 2. Sound: how it speaks, then hear it ---- */}
            <section
              id="voice-step-sound"
              aria-labelledby="voice-settings"
              hidden={step !== 'sound'}
              className="flex min-w-0 flex-1 flex-col gap-4"
            >
              <StepHeader n={2} id="voice-settings" headingRef={heading('sound')}>
                Sound
              </StepHeader>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="flex flex-col gap-4 rounded-app-sm border border-app-border p-4">
                  {!soundIsDefault && (
                    <button
                      type="button"
                      disabled={disabledAll}
                      onClick={() =>
                        setDraft((d) => ({ ...d, speed: DEFAULT_SETTINGS.speed, volume: DEFAULT_SETTINGS.volume, emotion: DEFAULT_SETTINGS.emotion }))
                      }
                      className="-mt-1 -mb-2 self-end cursor-pointer rounded-app-sm px-1.5 py-1 text-xs font-semibold text-app-muted underline-offset-2 hover:text-app-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Reset to default
                    </button>
                  )}
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
                      className={`${SELECT} w-full`}
                      value={draft.emotion ?? ''}
                      disabled={disabledAll}
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
                </div>

                <div aria-labelledby="voice-preview" role="group" className="flex flex-col gap-3 rounded-app-sm bg-app-surface p-4">
                  <h4 id="voice-preview" className="caps text-[0.6875rem] text-app-foreground">
                    Preview
                  </h4>
                  <p className="text-sm leading-relaxed text-app-foreground">“{previewTranscript(draft.language)}”</p>
                  <div className="mt-auto flex flex-wrap items-center gap-2">
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
                        {preview === 'loading' ? <Spinner /> : <StopGlyph />}
                        Stop
                      </Button>
                    )}
                    {choice.voiceId === null && (
                      <span className="text-xs text-app-muted">
                        Choose a voice first.{' '}
                        <button
                          type="button"
                          onClick={() => goStep('voice', true)}
                          className="cursor-pointer font-semibold text-app-accent-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
                        >
                          Go to Voice
                        </button>
                      </span>
                    )}
                  </div>
                  {previewError && step === 'sound' && <p className="text-xs text-app-danger-text">{previewError}</p>}
                </div>
              </div>
            </section>

            {/* ---- 3. A talking intro and outro ---- */}
            <section
              id="voice-step-face"
              aria-labelledby="voice-face"
              hidden={step !== 'face'}
              className="flex min-w-0 flex-1 flex-col gap-4"
            >
              <StepHeader n={3} id="voice-face" headingRef={heading('face')}>
                Talking intro & outro
              </StepHeader>
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
                costLine={faceCost}
              />
              {faceConfigured && (
                <div className="border-t border-app-border pt-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <BookendBox
                      id="video-bookend-intro"
                      label="Intro"
                      value={bookends.intro ?? introText}
                      disabled={!bookendsLoadedForThisDeck || deck.presentationId === null}
                      onChange={(value) => {
                        setVideoError(null)
                        useBookendsStore.getState().set({ intro: value })
                      }}
                    />
                    <BookendBox
                      id="video-bookend-outro"
                      label="Outro"
                      value={bookends.outro ?? outroText}
                      disabled={!bookendsLoadedForThisDeck || deck.presentationId === null}
                      onChange={(value) => {
                        setVideoError(null)
                        useBookendsStore.getState().set({ outro: value })
                      }}
                    />
                  </div>
                </div>
              )}
            </section>

            {/* ---- 4. The video ---- */}
            <section
              id="voice-step-video"
              aria-labelledby="voice-video"
              hidden={step !== 'video'}
              // The one step that scrolls: a deck can have many videos.
              className="scrollbar-subtle flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto md:pr-1"
            >
              <StepHeader n={4} id="voice-video" headingRef={heading('video')}>
                Video
              </StepHeader>

              {/* The video in the player is the step's full width, at 16:9, with one line under it. */}
              {shown ? (
                <>
                  <div>
                    {shown.url ? (
                      <video
                        ref={playerRef}
                        key={shown.record.path}
                        controls
                        // Only play, time, volume and fullscreen: the browser's ⋮ menu (download, speed,
                        // picture-in-picture) goes, since Download is the button under the player.
                        controlsList="nodownload noplaybackrate noremoteplayback"
                        disablePictureInPicture
                        preload="metadata"
                        src={shown.url}
                        aria-label="Presentation video"
                        className="aspect-video w-full rounded-app-sm bg-black"
                      />
                    ) : (
                      <Notice tone="warn">The video is saved, but a link to play it could not be made. Reopen this.</Notice>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-app-muted tabular-nums">
                      <span className="font-semibold text-app-foreground">{videoLength(shown.record.durationSeconds)}</span> · Made{' '}
                      {madeAt(shown.record.generatedAt)}
                      {shown === existing && history.length > 0 && <> · Latest</>}
                    </p>
                    {shown.downloadUrl && (
                      <a
                        href={shown.downloadUrl}
                        aria-label="Download video"
                        title="Download video"
                        className="grid size-10 shrink-0 place-items-center rounded-app-sm text-app-foreground transition-colors hover:bg-app-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
                      >
                        <DownloadGlyph className="size-5" />
                      </a>
                    )}
                  </div>
                </>
              ) : (
                <p className="grid min-h-32 place-items-center rounded-app-sm border border-dashed border-app-border p-4 text-sm text-app-muted md:flex-1">
                  No video yet.
                </p>
              )}

              {/* Every video of the deck, newest first, three to a row: one press plays it above. */}
              {allVideos.length > 1 && (
                <div className="flex flex-col gap-2 border-t border-app-border pt-3">
                  <p className="caps text-[0.6875rem] text-app-muted">
                    All videos <span className="tabular-nums">· {allVideos.length}</span>
                  </p>
                  <ul className="grid grid-cols-3 gap-3" aria-label="All videos">
                    {allVideos.map((view) => (
                      <li key={view.record.path}>
                        <VideoTile
                          view={view}
                          latest={view === existing}
                          playing={view === shown}
                          onPlay={() => showVideo(view.record.path)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
      {askingConsent && <CloneConsentModal onAgree={agreeToClone} onCancel={() => setAskingConsent(false)} />}
    </Modal>
  )
}

/** "Nov 23, 2026, 11:05 PM": when a video was made, without the seconds. */
function madeAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * One video in the grid: its first picture (the browser draws it from the file's start, no thumbnail
 * is stored), its length on it, and when it was made under it. The one in the player is ringed in the
 * accent and says so; pressing another plays it there.
 */
export function VideoTile({ view, latest, playing, onPlay }: { view: VideoView; latest: boolean; playing: boolean; onPlay: () => void }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-pressed={playing}
      aria-label={`${latest ? 'Latest video' : 'Video'} made ${madeAt(view.record.generatedAt)}, ${videoLength(view.record.durationSeconds)}`}
      className="group flex w-full cursor-pointer flex-col gap-1.5 rounded-app-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
    >
      <span
        className={`relative block aspect-video w-full overflow-hidden rounded-app-sm bg-black ring-offset-2 ring-offset-app-background transition-shadow ${
          playing ? 'ring-2 ring-app-accent' : 'ring-1 ring-app-border group-hover:ring-app-foreground/40'
        }`}
      >
        {view.url && (
          // `#t=0.1` asks for a picture a moment in, since the very first one can be the stage colour alone.
          <video src={`${view.url}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1} aria-hidden="true" className="pointer-events-none size-full object-cover" />
        )}
        <span className="absolute right-1.5 bottom-1.5 rounded-[4px] bg-black/70 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-white tabular-nums">
          {videoLength(view.record.durationSeconds)}
        </span>
        {playing && (
          <span className="absolute top-1.5 left-1.5 rounded-[4px] bg-app-accent px-1.5 py-0.5 text-[0.6875rem] font-bold text-app-accent-foreground">
            Playing
          </span>
        )}
      </span>
      <span className="truncate text-xs text-app-muted tabular-nums">
        {latest && <span className="font-semibold text-app-foreground">Latest · </span>}
        {madeAt(view.record.generatedAt)}
      </span>
    </button>
  )
}

type VoiceTab = 'pick' | 'record'

interface RailItem {
  id: VideoStep
  n: number
  name: string
  summary: string
  /** The step holds Generate back (no voice yet): a sun dot says so beside its number. */
  attention: boolean
}

/**
 * The dialog's step rail: every step with its number, its name and what is chosen there, so the whole
 * setup reads at a glance and any step is one press away. The current step is filled in ink with an
 * orange number, like the active row of the dashboard rail. Below `md` it lies across the top, names only.
 */
function StepRail({ items, step, onStep }: { items: RailItem[]; step: VideoStep; onStep: (step: VideoStep) => void }) {
  return (
    <nav aria-label="Video steps" className="md:sticky md:top-0 md:self-start">
      <ol className="grid grid-cols-4 gap-1 md:flex md:flex-col">
        {items.map((item) => {
          const current = item.id === step
          return (
            <li key={item.id} className="min-w-0">
              <button
                type="button"
                aria-current={current ? 'step' : undefined}
                aria-controls={`voice-step-${item.id}`}
                onClick={() => onStep(item.id)}
                className={`group flex w-full cursor-pointer items-center gap-2.5 rounded-app-sm px-2 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent max-md:flex-col max-md:gap-1 max-md:text-center md:px-2.5 ${
                  current ? 'bg-app-foreground text-app-background' : 'text-app-foreground hover:bg-app-surface'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`relative grid size-6 shrink-0 place-items-center rounded-[4px] text-xs font-bold tabular-nums ${
                    current ? 'bg-app-accent text-app-accent-foreground' : 'bg-app-surface text-app-foreground ring-1 ring-app-border'
                  }`}
                >
                  {item.n}
                  {item.attention && !current && (
                    <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-app-track-sun ring-2 ring-app-background" />
                  )}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="sr-only">Step {item.n}: </span>
                  <span className="text-xs leading-tight font-bold md:text-sm">{item.name}</span>
                  <span className={`truncate text-xs max-md:hidden ${current ? 'text-app-background/70' : 'text-app-muted'}`}>
                    {item.summary}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/**
 * A step's heading, for screen readers only: the rail beside the step already shows its number and
 * name, so a visible copy would only push the step's content down. Focusable so moving to a step can
 * land on it.
 */
function StepHeader({
  n,
  id,
  headingRef,
  children,
}: {
  n: number
  id: string
  headingRef: (el: HTMLHeadingElement | null) => void
  children: string
}) {
  return (
    <h3 id={id} ref={headingRef} tabIndex={-1} className="sr-only">
      {`Step ${n}: ${children}`}
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

export function VoiceGroup({
  title,
  voices,
  selectedId,
  onPick,
  onDelete,
  deleteDisabled = false,
  open = true,
  onOpenChange,
  onPlay,
  playingId = null,
  playPhase = 'idle',
  playDisabled = false,
}: {
  title: string
  voices: VoiceSummary[]
  selectedId: string | null
  onPick: (voice: VoiceSummary) => void
  /** Only the user's own recorded voices can be deleted: each row then carries a delete button. */
  onDelete?: (voice: VoiceSummary) => void
  deleteDisabled?: boolean
  /** With `onOpenChange`, the title is a button that folds the rows away. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Each row then carries a play button that hears that voice. */
  onPlay?: (voice: VoiceSummary) => void
  /** The voice being heard, and whether it is still loading or playing. */
  playingId?: string | null
  playPhase?: 'idle' | 'loading' | 'playing'
  playDisabled?: boolean
}) {
  if (voices.length === 0) return null
  const titleClass = 'caps sticky top-0 z-[1] bg-app-surface px-3 py-1.5 text-[0.6875rem] text-app-muted'
  const groupId = `voice-group-${title.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <div>
      {onOpenChange ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={groupId}
          onClick={() => onOpenChange(!open)}
          className={`${titleClass} flex w-full cursor-pointer items-center justify-between gap-2 text-left hover:text-app-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-app-accent`}
        >
          <span>
            {title} <span className="tabular-nums">· {voices.length}</span>
          </span>
          <ChevronGlyph dir={open ? 'up' : 'down'} />
        </button>
      ) : (
        <p className={titleClass}>{title}</p>
      )}
      <div id={groupId} hidden={!open}>
      {voices.map((voice) => {
        const selected = voice.id === selectedId
        return (
          // The row's fill is on the wrapper so hovering the delete button keeps the row lit.
          <div
            key={voice.id}
            className={`group flex items-center transition-colors ${
              selected ? 'bg-app-accent/10 text-app-accent-text' : 'text-app-foreground hover:bg-app-surface'
            }`}
          >
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onPick(voice)}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2 pl-3 text-left text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-app-accent"
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
            {onPlay && (
              <button
                type="button"
                aria-label={playingId === voice.id ? `Stop ${voice.name}` : `Hear ${voice.name}`}
                title={playingId === voice.id ? 'Stop' : 'Hear this voice'}
                disabled={playDisabled}
                onClick={() => onPlay(voice)}
                className={`grid size-8 shrink-0 cursor-pointer place-items-center rounded-app-sm transition-colors duration-150 hover:bg-app-accent/10 hover:text-app-accent-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-40 ${
                  playingId === voice.id ? 'text-app-accent-text' : 'text-app-muted'
                } ${onDelete ? 'ml-1.5' : 'mx-1.5'}`}
              >
                {playingId === voice.id ? playPhase === 'loading' ? <Spinner className="size-3.5" /> : <StopGlyph /> : <PlayGlyph />}
              </button>
            )}
            {onDelete ? (
              // Shown on the chosen row, and on any row while hovered or focused by keyboard.
              <button
                type="button"
                aria-label={`Delete ${voice.name}`}
                title="Delete this voice"
                disabled={deleteDisabled}
                onClick={() => onDelete(voice)}
                className={`mx-1.5 grid size-8 shrink-0 cursor-pointer place-items-center rounded-app-sm text-app-muted transition-[opacity,color,background-color] duration-150 hover:bg-app-danger/10 hover:text-app-danger-text focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-40 ${
                  selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
              >
                <TrashGlyph />
              </button>
            ) : (
              !onPlay && <span className="w-3 shrink-0" aria-hidden="true" />
            )}
          </div>
        )
      })}
      </div>
    </div>
  )
}

function TrashGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 4.5h11M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4 4.5l.7 8.6a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L12 4.5M6.75 7v4.5M9.25 7v4.5" />
    </svg>
  )
}

function StopGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="size-3.5" fill="currentColor" aria-hidden="true">
      <rect x="5" y="5" width="10" height="10" rx="1.5" />
    </svg>
  )
}

const CHEVRONS = {
  left: 'M10 3.5 5.5 8l4.5 4.5',
  right: 'M6 3.5 10.5 8 6 12.5',
  up: 'M3.5 10 8 5.5l4.5 4.5',
  down: 'M3.5 6 8 10.5 12.5 6',
} as const

function ChevronGlyph({ dir }: { dir: keyof typeof CHEVRONS }) {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={CHEVRONS[dir]} />
    </svg>
  )
}

function DownloadGlyph({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" />
    </svg>
  )
}
