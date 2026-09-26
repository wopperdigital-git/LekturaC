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
  // Annotated: inferred, it would be a type predicate and `() => false` could not replace it.
  static isTypeSupported: (mime: string) => boolean = (mime) => mime === 'audio/webm;codecs=opus'
  static failOnConstruct = false
  static failOnStart = false
  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  stream: unknown
  options: { mimeType: string }
  // No parameter properties: `erasableSyntaxOnly` forbids them.
  constructor(stream: unknown, options: { mimeType: string }) {
    if (FakeRecorder.failOnConstruct) throw new DOMException('mime rejected', 'NotSupportedError')
    this.stream = stream
    this.options = options
    FakeRecorder.instances.push(this)
  }
  start() {
    if (FakeRecorder.failOnStart) throw new DOMException('cannot start', 'InvalidStateError')
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
  FakeRecorder.failOnConstruct = false
  FakeRecorder.failOnStart = false
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

  // The stream is live as soon as getUserMedia resolves, so a failure to build or start the
  // recorder after that must still give the microphone back.
  it('releases the microphone when the recorder cannot be created', async () => {
    FakeRecorder.failOnConstruct = true
    await expect(startRecording(opts())).rejects.toMatchObject({ reason: 'failed' })
    expect(trackStops).toHaveBeenCalledTimes(2)
  })

  it('releases the microphone when the recorder cannot start', async () => {
    FakeRecorder.failOnStart = true
    await expect(startRecording(opts())).rejects.toMatchObject({ reason: 'failed' })
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
