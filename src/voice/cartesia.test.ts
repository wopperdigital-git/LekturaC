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

  it("maps 403 to an auth error and keeps the server's reason", async () => {
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
