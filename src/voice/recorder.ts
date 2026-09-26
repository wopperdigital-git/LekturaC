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
  // The stream is live from here, so anything that throws before recording is running (a
  // format the constructor rejects although `isTypeSupported` said yes, a recorder that
  // will not start) has to hand the microphone back itself: nothing else knows about it.
  let recorder: MediaRecorder
  try {
    recorder = new MediaRecorder(stream, { mimeType: o.mime })
  } catch {
    release()
    throw new RecordingError('The microphone could not be started.', 'failed')
  }
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

  try {
    recorder.start()
  } catch {
    release()
    throw new RecordingError('The microphone could not be started.', 'failed')
  }
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
