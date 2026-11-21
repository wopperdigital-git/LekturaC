import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FACE_NOT_SET_UP } from '@/lib/setupCopy'
import {
  TALK_TIMEOUT_MS,
  WavespeedError,
  downloadClip,
  isWavespeedConfigured,
  pollDelayMs,
  submitTalk,
  uploadMedia,
  waitForTalk,
} from './wavespeed'

/*
  Against a mocked `fetch`. What matters: the exact request, that a submit is never
  repeated (each one is a billed job), that polling rides out blips, and that a cancel
  stays an AbortError.
*/

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubEnv('VITE_WAVESPEED_API_KEY', 'k')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const instantSleep = vi.fn(() => Promise.resolve())

describe('isWavespeedConfigured', () => {
  it('reflects whether a key is set, at call time', () => {
    expect(isWavespeedConfigured()).toBe(true)
    vi.stubEnv('VITE_WAVESPEED_API_KEY', '  ')
    expect(isWavespeedConfigured()).toBe(false)
  })
})

describe('pollDelayMs', () => {
  it('grows by half each time and stops at 10 seconds', () => {
    expect(pollDelayMs(0)).toBe(2000)
    expect(pollDelayMs(1)).toBe(3000)
    expect(pollDelayMs(2)).toBe(4500)
    expect(pollDelayMs(20)).toBe(10_000)
  })
})

describe('submitTalk', () => {
  it('sends the exact body and bearer header', async () => {
    fetchMock.mockResolvedValueOnce(json({ code: 200, data: { id: 'job1', status: 'created' } }))
    const id = await submitTalk({ imageUrl: 'i', audioUrl: 'a' })
    expect(id).toBe('job1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.wavespeed.ai/api/v3/wavespeed-ai/infinitetalk')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ image: 'i', audio: 'a', resolution: '480p' })
    expect(init.headers.Authorization).toBe('Bearer k')
  })

  it('is called once even when it fails with 503', async () => {
    fetchMock.mockResolvedValue(json({ message: 'busy' }, 503))
    await expect(submitTalk({ imageUrl: 'i', audioUrl: 'a' })).rejects.toMatchObject({ kind: 'capacity', status: 503 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('maps 401 to auth, other 4xx to request, 500 to unknown', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 401))
    await expect(submitTalk({ imageUrl: 'i', audioUrl: 'a' })).rejects.toMatchObject({ kind: 'auth' })
    fetchMock.mockResolvedValueOnce(json({}, 400))
    await expect(submitTalk({ imageUrl: 'i', audioUrl: 'a' })).rejects.toMatchObject({ kind: 'request' })
    fetchMock.mockResolvedValueOnce(json({}, 500))
    await expect(submitTalk({ imageUrl: 'i', audioUrl: 'a' })).rejects.toMatchObject({ kind: 'unknown' })
  })

  it('reports a network failure as unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(submitTalk({ imageUrl: 'i', audioUrl: 'a' })).rejects.toMatchObject({
      kind: 'unknown',
      message: 'Could not reach WaveSpeed. Check your connection and try again.',
    })
  })

  it('rejects a reply with no job id', async () => {
    fetchMock.mockResolvedValueOnce(json({ code: 200, data: {} }))
    await expect(submitTalk({ imageUrl: 'i', audioUrl: 'a' })).rejects.toBeInstanceOf(WavespeedError)
  })
})

describe('without a key', () => {
  it('rejects with the setup copy and makes no request', async () => {
    vi.stubEnv('VITE_WAVESPEED_API_KEY', '')
    const err = await submitTalk({ imageUrl: 'i', audioUrl: 'a' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(WavespeedError)
    expect((err as WavespeedError).message).toBe(FACE_NOT_SET_UP)
    expect((err as WavespeedError).kind).toBe('auth')
    await expect(uploadMedia(new Blob(['x']), 'f.png')).rejects.toMatchObject({ message: FACE_NOT_SET_UP })
    await expect(waitForTalk('id', undefined, { sleep: instantSleep })).rejects.toMatchObject({ message: FACE_NOT_SET_UP })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('uploadMedia', () => {
  it('posts the file as multipart and returns the download url', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ code: 200, message: 'success', data: { type: 'image/png', download_url: 'https://cdn/x.png', filename: 'f.png', size: 1 } }),
    )
    const url = await uploadMedia(new Blob(['x'], { type: 'image/png' }), 'f.png')
    expect(url).toBe('https://cdn/x.png')
    const [target, init] = fetchMock.mock.calls[0]
    expect(target).toBe('https://api.wavespeed.ai/api/v3/media/upload/binary')
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('file')).toBeInstanceOf(Blob)
    // No Content-Type: the browser sets the multipart boundary.
    expect(init.headers['Content-Type']).toBeUndefined()
    expect(init.headers.Authorization).toBe('Bearer k')
  })
})

describe('waitForTalk', () => {
  it('survives a 503 then completes', async () => {
    instantSleep.mockClear()
    fetchMock
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({ code: 200, data: { status: 'processing' } }))
      .mockResolvedValueOnce(json({ code: 200, data: { status: 'completed', outputs: ['u'] } }))
    const out = await waitForTalk('job1', undefined, { sleep: instantSleep })
    expect(out).toBe('u')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.wavespeed.ai/api/v3/predictions/job1/result')
    expect(instantSleep).toHaveBeenCalledTimes(2)
  })

  it('keeps polling through a network error and a 429', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json({}, 429))
      .mockResolvedValueOnce(json({ data: { status: 'completed', outputs: ['u'] } }))
    expect(await waitForTalk('job1', undefined, { sleep: instantSleep })).toBe('u')
  })

  it.each(['failed', 'cancelled', 'timeout', 'deleted'])('rejects a %s job as failed with the reason', async (status) => {
    fetchMock.mockResolvedValueOnce(json({ data: { status, error: 'bad face' } }))
    const err = await waitForTalk('job1', undefined, { sleep: instantSleep }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(WavespeedError)
    expect((err as WavespeedError).kind).toBe('failed')
    expect((err as WavespeedError).message).toContain('bad face')
  })

  it('rejects completed with no outputs as failed', async () => {
    fetchMock.mockResolvedValueOnce(json({ data: { status: 'completed', outputs: [] } }))
    await expect(waitForTalk('job1', undefined, { sleep: instantSleep })).rejects.toMatchObject({ kind: 'failed' })
  })

  it('times out past the limit', async () => {
    fetchMock.mockResolvedValue(json({ data: { status: 'processing' } }))
    let t = 0
    const now = () => {
      const v = t
      t += TALK_TIMEOUT_MS + 1
      return v
    }
    await expect(waitForTalk('job1', undefined, { sleep: instantSleep, now })).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('stops on a 401 with no more requests', async () => {
    fetchMock.mockResolvedValue(json({}, 401))
    await expect(waitForTalk('job1', undefined, { sleep: instantSleep })).rejects.toMatchObject({ kind: 'auth' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('stops on a 403', async () => {
    fetchMock.mockResolvedValue(json({}, 403))
    await expect(waitForTalk('job1', undefined, { sleep: instantSleep })).rejects.toMatchObject({ kind: 'auth' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('aborting', () => {
  const pendingFetch = (_url: unknown, init: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })

  it('stays an AbortError, not a WavespeedError', async () => {
    fetchMock.mockImplementation(pendingFetch)
    const ctrl = new AbortController()
    const p = submitTalk({ imageUrl: 'i', audioUrl: 'a', signal: ctrl.signal }).catch((e: unknown) => e)
    ctrl.abort()
    const err = await p
    expect(err).not.toBeInstanceOf(WavespeedError)
    expect((err as Error).name).toBe('AbortError')
  })

  it('stays an AbortError while polling', async () => {
    fetchMock.mockImplementation(pendingFetch)
    const ctrl = new AbortController()
    const p = waitForTalk('job1', ctrl.signal, { sleep: instantSleep }).catch((e: unknown) => e)
    ctrl.abort()
    const err = await p
    expect(err).not.toBeInstanceOf(WavespeedError)
    expect((err as Error).name).toBe('AbortError')
  })

  const abortErr = () => new DOMException('Aborted', 'AbortError')

  it('stays an AbortError when aborted while the submit reply is being read', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.reject(abortErr()) })
    const err = await submitTalk({ imageUrl: 'i', audioUrl: 'a' }).catch((e: unknown) => e)
    expect(err).not.toBeInstanceOf(WavespeedError)
    expect((err as Error).name).toBe('AbortError')
  })

  it('stays an AbortError when aborted while the clip is downloading', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, blob: () => Promise.reject(abortErr()) })
    const err = await downloadClip('https://cdn/clip.mp4').catch((e: unknown) => e)
    expect(err).not.toBeInstanceOf(WavespeedError)
    expect((err as Error).name).toBe('AbortError')
  })

  it('turns any rejection after an abort into an AbortError', async () => {
    const ctrl = new AbortController()
    fetchMock.mockImplementationOnce(() => {
      ctrl.abort()
      return Promise.reject(new TypeError('network error'))
    })
    const err = await submitTalk({ imageUrl: 'i', audioUrl: 'a', signal: ctrl.signal }).catch((e: unknown) => e)
    expect(err).not.toBeInstanceOf(WavespeedError)
    expect((err as Error).name).toBe('AbortError')
  })

  it('ends polling on a 404 as a request error', async () => {
    fetchMock.mockResolvedValue(json({ message: 'not found' }, 404))
    await expect(waitForTalk('job1', undefined, { sleep: instantSleep })).rejects.toMatchObject({ kind: 'request', status: 404 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not poll on once aborted between polls', async () => {
    const ctrl = new AbortController()
    fetchMock.mockResolvedValue(json({ data: { status: 'processing' } }))
    const sleepAndAbort = vi.fn(() => {
      ctrl.abort()
      return Promise.resolve()
    })
    const err = await waitForTalk('job1', ctrl.signal, { sleep: sleepAndAbort }).catch((e: unknown) => e)
    expect((err as Error).name).toBe('AbortError')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('downloadClip', () => {
  it('returns the file as a blob, without the API key', async () => {
    fetchMock.mockResolvedValueOnce(new Response(new Blob(['mp4']), { status: 200 }))
    const blob = await downloadClip('https://cdn/clip.mp4')
    expect(await blob.text()).toBe('mp4')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://cdn/clip.mp4')
    expect(init?.headers?.Authorization).toBeUndefined()
  })

  it('reports a failed download', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }))
    await expect(downloadClip('https://cdn/clip.mp4')).rejects.toMatchObject({ kind: 'request' })
  })
})
