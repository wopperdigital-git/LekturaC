import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VideoError } from './errors'
import { MP4_FORMAT, WEBM_FORMAT } from './format'
import { MIGRATION_MESSAGE } from './storageErrors'
import { loadVideo, removeDeckVideo, saveVideo, type SaveVideoInput, type StoragePorts } from './storage'
import type { VideoRecord } from './videoRecord'

function fakePorts(overrides: Partial<StoragePorts> = {}) {
  const log: string[] = []
  const ports: StoragePorts = {
    upload: async (path) => {
      log.push(`upload ${path}`)
      return { error: null }
    },
    remove: async (paths) => {
      log.push(`remove ${paths.join(',')}`)
      return { error: null }
    },
    writeRecord: async (id) => {
      log.push(`write ${id}`)
      return { error: null }
    },
    readRecord: async () => ({ data: null, error: null }),
    signedUrl: async (path, downloadName) => ({
      url: `https://signed/${path}${downloadName ? `?download=${downloadName}` : ''}`,
      error: null,
    }),
    ...overrides,
  }
  return { ports, log }
}

const previous: VideoRecord = {
  path: 'u1/p1.mp4',
  contentType: 'video/mp4',
  durationSeconds: 10,
  generatedAt: '2026-09-01T00:00:00.000Z',
}

const input = (over: Partial<SaveVideoInput> = {}): SaveVideoInput => ({
  uid: 'u1',
  presentationId: 'p1',
  blob: new Blob(['video']),
  format: MP4_FORMAT,
  durationSeconds: 42.5,
  previous: null,
  now: () => new Date('2026-09-27T10:00:00.000Z'),
  ...over,
})

describe('saveVideo', () => {
  // saveVideo logs the raw error on failure; keep that out of the test output.
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uploads, then writes the record, and returns it', async () => {
    const { ports, log } = fakePorts()
    const record = await saveVideo(ports, input())
    expect(log).toEqual(['upload u1/p1.mp4', 'write p1'])
    expect(record).toEqual({
      path: 'u1/p1.mp4',
      contentType: 'video/mp4',
      durationSeconds: 42.5,
      generatedAt: '2026-09-27T10:00:00.000Z',
    })
  })

  it('replaces at the same path without removing anything', async () => {
    const { ports, log } = fakePorts()
    await saveVideo(ports, input({ previous }))
    expect(log).toEqual(['upload u1/p1.mp4', 'write p1'])
  })

  // Review Focus 4: a different browser can make a different container.
  it('removes the previous object, but only after the new record is written', async () => {
    const { ports, log } = fakePorts()
    await saveVideo(ports, input({ previous, format: WEBM_FORMAT }))
    expect(log).toEqual(['upload u1/p1.webm', 'write p1', 'remove u1/p1.mp4'])
  })

  it('keeps the previous video when the upload fails, and writes nothing', async () => {
    const { ports, log } = fakePorts({
      upload: async () => ({ error: { message: 'Bucket not found', statusCode: '404' } }),
    })
    const err = await saveVideo(ports, input({ previous, format: WEBM_FORMAT })).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(VideoError)
    expect((err as VideoError).message).toBe(MIGRATION_MESSAGE)
    expect((err as VideoError).stage).toBe('uploading')
    expect(log).toEqual([])
  })

  // Review Focus 4, the other half: never remove the old file when the new record was not written.
  it('keeps the previous object and removes the new one when the record write fails', async () => {
    const { ports, log } = fakePorts({
      writeRecord: async () => ({ error: { code: 'PGRST204', message: "no 'video' column" } }),
    })
    const err = await saveVideo(ports, input({ previous, format: WEBM_FORMAT })).catch((e: unknown) => e)
    expect((err as VideoError).message).toBe(MIGRATION_MESSAGE)
    expect(log).toContain('remove u1/p1.webm')
    expect(log).not.toContain('remove u1/p1.mp4')
  })

  it('does not remove a file it just overwrote when the record write fails at the same path', async () => {
    const { ports, log } = fakePorts({ writeRecord: async () => ({ error: { message: 'boom' } }) })
    await expect(saveVideo(ports, input({ previous }))).rejects.toBeInstanceOf(VideoError)
    expect(log.filter((l) => l.startsWith('remove'))).toEqual([])
  })

  it('removes the new object when there was no previous video and the record write fails', async () => {
    const { ports, log } = fakePorts({ writeRecord: async () => ({ error: { message: 'boom' } }) })
    await expect(saveVideo(ports, input())).rejects.toBeInstanceOf(VideoError)
    expect(log).toContain('remove u1/p1.mp4')
  })

  it('still succeeds when removing the previous object fails', async () => {
    const { ports } = fakePorts({ remove: async () => Promise.reject(new Error('offline')) })
    await expect(saveVideo(ports, input({ previous, format: WEBM_FORMAT }))).resolves.toMatchObject({ path: 'u1/p1.webm' })
  })

  it('reports the original error, not a clean-up failure', async () => {
    const { ports } = fakePorts({
      writeRecord: async () => ({ error: { message: 'boom' } }),
      remove: async () => Promise.reject(new Error('offline')),
    })
    const err = await saveVideo(ports, input()).catch((e: unknown) => e)
    expect((err as VideoError).message).toMatch(/could not be saved/i)
  })

  it('logs the raw error rather than showing it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { ports } = fakePorts({ upload: async () => ({ error: { message: 'secret internals' } }) })
    const err = await saveVideo(ports, input()).catch((e: unknown) => e)
    expect((err as VideoError).message).not.toContain('secret internals')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('loadVideo', () => {
  const stored = { ...previous }

  it('returns the record with a playback and a download link', async () => {
    const { ports } = fakePorts({ readRecord: async () => ({ data: stored, error: null }) })
    const view = await loadVideo(ports, 'p1', 'Deck')
    expect(view?.record).toEqual(previous)
    expect(view?.url).toBe('https://signed/u1/p1.mp4')
    expect(view?.downloadUrl).toBe('https://signed/u1/p1.mp4?download=Deck.mp4')
  })

  it('names the download after the stored file type, not the browser', async () => {
    const webm: VideoRecord = { ...previous, path: 'u1/p1.webm', contentType: 'video/webm' }
    const { ports } = fakePorts({ readRecord: async () => ({ data: webm, error: null }) })
    expect((await loadVideo(ports, 'p1', 'Deck'))?.downloadUrl).toBe('https://signed/u1/p1.webm?download=Deck.webm')
  })

  // The name goes into a signed URL that storage-js encodes twice, so characters that are special in a URL
  // or illegal in a file name become `_`. Letters of any script stay as they are.
  describe('the download name', () => {
    const downloadFor = async (title: string) => {
      const { ports } = fakePorts({ readRecord: async () => ({ data: stored, error: null }) })
      return (await loadVideo(ports, 'p1', title))?.downloadUrl
    }

    it('replaces characters that are special in a URL or a file name', async () => {
      expect(await downloadFor('Q3 / Plan: A&B 100%')).toBe('https://signed/u1/p1.mp4?download=Q3 _ Plan_ A_B 100_.mp4')
    })

    it('leaves non-Latin titles alone', async () => {
      expect(await downloadFor('Квартальный план')).toBe('https://signed/u1/p1.mp4?download=Квартальный план.mp4')
      expect(await downloadFor('季度计划')).toBe('https://signed/u1/p1.mp4?download=季度计划.mp4')
    })

    it('replaces a backslash', async () => {
      expect(await downloadFor('a\\b')).toBe('https://signed/u1/p1.mp4?download=a_b.mp4')
    })

    it('replaces control characters and trims', async () => {
      expect(await downloadFor('  a\tb\nc  ')).toBe('https://signed/u1/p1.mp4?download=a_b_c.mp4')
    })

    it('falls back to "presentation" for an empty or all-forbidden title', async () => {
      const fallback = 'https://signed/u1/p1.mp4?download=presentation.mp4'
      expect(await downloadFor('')).toBe(fallback)
      expect(await downloadFor('   ')).toBe(fallback)
      expect(await downloadFor('///:*?')).toBe(fallback)
    })
  })

  it('is null when there is no video, a malformed one, or the read failed', async () => {
    expect(await loadVideo(fakePorts().ports, 'p1', 'x')).toBeNull()
    expect(await loadVideo(fakePorts({ readRecord: async () => ({ data: { path: 1 }, error: null }) }).ports, 'p1', 'x')).toBeNull()
    expect(await loadVideo(fakePorts({ readRecord: async () => ({ data: stored, error: { message: 'x' } }) }).ports, 'p1', 'x')).toBeNull()
  })

  it('keeps the record but no links when signing fails', async () => {
    const { ports } = fakePorts({
      readRecord: async () => ({ data: stored, error: null }),
      signedUrl: async () => ({ url: null, error: { message: 'x' } }),
    })
    const view = await loadVideo(ports, 'p1', 'x')
    expect(view).toEqual({ record: previous, url: null, downloadUrl: null })
  })

  it('never throws', async () => {
    const { ports } = fakePorts({ readRecord: async () => Promise.reject(new Error('offline')) })
    expect(await loadVideo(ports, 'p1', 'x')).toBeNull()
  })
})

describe('removeDeckVideo', () => {
  it("removes the deck's video object", async () => {
    const { ports, log } = fakePorts({ readRecord: async () => ({ data: previous, error: null }) })
    await removeDeckVideo(ports, 'p1')
    expect(log).toEqual(['remove u1/p1.mp4'])
  })

  it('does nothing when the deck has no video', async () => {
    const { ports, log } = fakePorts()
    await removeDeckVideo(ports, 'p1')
    expect(log).toEqual([])
  })

  // Deleting a deck must never be blocked by its video.
  it('never throws', async () => {
    const { ports } = fakePorts({ readRecord: async () => Promise.reject(new Error('offline')) })
    await expect(removeDeckVideo(ports, 'p1')).resolves.toBeUndefined()
    const removing = fakePorts({
      readRecord: async () => ({ data: previous, error: null }),
      remove: async () => Promise.reject(new Error('offline')),
    })
    await expect(removeDeckVideo(removing.ports, 'p1')).resolves.toBeUndefined()
  })
})
