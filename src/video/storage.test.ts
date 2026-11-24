import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VideoError } from './errors'
import { MP4_FORMAT, WEBM_FORMAT } from './format'
import { MIGRATION_MESSAGE } from './storageErrors'
import { deleteDeckWithVideo, loadVideo, loadVideoHistory, saveVideo, signVideo, type SaveVideoInput, type StoragePorts } from './storage'
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
    copy: async (from, to) => {
      log.push(`copy ${from} -> ${to}`)
      return { error: null }
    },
    writeRecord: async (id) => {
      log.push(`write ${id}`)
      return { error: null }
    },
    readRecord: async () => ({ data: null, error: null }),
    readHistory: async () => ({ data: [], error: null }),
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

  it('writes slides into the record', async () => {
    const slides = [
      { cardId: 'a', startSeconds: 0, durationSeconds: 4 },
      { cardId: 'b', startSeconds: 4, durationSeconds: 3 },
    ]
    const written: VideoRecord[] = []
    const { ports } = fakePorts({
      writeRecord: async (_id, record) => {
        written.push(record)
        return { error: null }
      },
    })
    const record = await saveVideo(ports, input({ slides }))
    expect(record.slides).toEqual(slides)
    expect(written[0].slides).toEqual(slides)
  })

  it('leaves slides out of the record when none are given', async () => {
    const { ports } = fakePorts()
    expect('slides' in (await saveVideo(ports, input()))).toBe(false)
  })

  /* ---- earlier videos are kept (0022) ---- */
  const stored = (over: Partial<StoragePorts> = {}) =>
    fakePorts({ readRecord: async () => ({ data: previous, error: null }), ...over })
  const KEPT = 'u1/p1/2026-09-01T00-00-00-000Z.mp4'

  it('keeps the current video under its own name before uploading over it, and lists it first in the history', async () => {
    const older: VideoRecord = { ...previous, path: 'u1/p1/2026-08-01T00-00-00-000Z.mp4', generatedAt: '2026-08-01T00:00:00.000Z' }
    const written: (VideoRecord[] | undefined)[] = []
    const { ports, log } = stored({
      readHistory: async () => ({ data: [older], error: null }),
      writeRecord: async (id, _record, history) => {
        log.push(`write ${id}`)
        written.push(history)
        return { error: null }
      },
    })
    await saveVideo(ports, input())
    expect(log).toEqual([`copy u1/p1.mp4 -> ${KEPT}`, 'upload u1/p1.mp4', 'write p1'])
    expect(written[0]).toEqual([{ ...previous, path: KEPT }, older])
  })

  it('reads the stored video rather than trusting the caller, and uses the caller only when the read fails', async () => {
    const fromStore = stored()
    await saveVideo(fromStore.ports, input({ previous: null }))
    expect(fromStore.log[0]).toBe(`copy u1/p1.mp4 -> ${KEPT}`)
    const unreadable = fakePorts({ readRecord: async () => ({ data: null, error: { message: 'offline' } }) })
    await saveVideo(unreadable.ports, input({ previous }))
    expect(unreadable.log[0]).toBe(`copy u1/p1.mp4 -> ${KEPT}`)
  })

  it('copies nothing for a deck with no video yet, and writes an empty history', async () => {
    const histories: (VideoRecord[] | undefined)[] = []
    const { ports, log } = fakePorts({
      writeRecord: async (_id, _r, history) => {
        histories.push(history)
        return { error: null }
      },
    })
    await saveVideo(ports, input())
    expect(log.some((l) => l.startsWith('copy'))).toBe(false)
    expect(histories).toEqual([[]])
  })

  // Mutation check: a failed copy must stop the save, or the upload would overwrite the only copy.
  it('saves nothing when the current video cannot be kept, and says why', async () => {
    const { ports, log } = stored({ copy: async () => ({ error: { message: 'boom' } }) })
    const err = await saveVideo(ports, input()).catch((e: unknown) => e)
    expect((err as VideoError).message).toMatch(/previous video could not be kept/i)
    expect(log).toEqual([])
  })

  it('saves nothing when the earlier videos cannot be read, so none are dropped from the list', async () => {
    const { ports, log } = stored({ readHistory: async () => ({ data: null, error: { message: 'offline' } }) })
    await expect(saveVideo(ports, input())).rejects.toBeInstanceOf(VideoError)
    expect(log).toEqual([])
  })

  it('without migration 0022, replaces the video as before and writes no history', async () => {
    const histories: (VideoRecord[] | undefined)[] = []
    const { ports, log } = stored({
      readHistory: async () => ({ data: null, error: { code: '42703', message: 'no video_history' } }),
      writeRecord: async (id, _r, history) => {
        log.push(`write ${id}`)
        histories.push(history)
        return { error: null }
      },
    })
    await saveVideo(ports, input())
    expect(log).toEqual(['upload u1/p1.mp4', 'write p1'])
    expect(histories).toEqual([undefined])
  })

  // A different browser can make a different container: the old name is removed once its copy is kept.
  it('removes the current object under its old name, but only after the new record is written', async () => {
    const { ports, log } = stored()
    await saveVideo(ports, input({ format: WEBM_FORMAT }))
    expect(log).toEqual([`copy u1/p1.mp4 -> ${KEPT}`, 'upload u1/p1.webm', 'write p1', 'remove u1/p1.mp4'])
  })

  it('keeps the current video when the upload fails, writes nothing, and removes the copy', async () => {
    const { ports, log } = stored({
      upload: async () => ({ error: { message: 'Bucket not found', statusCode: '404' } }),
    })
    const err = await saveVideo(ports, input({ format: WEBM_FORMAT })).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(VideoError)
    expect((err as VideoError).message).toBe(MIGRATION_MESSAGE)
    expect((err as VideoError).stage).toBe('uploading')
    expect(log).toEqual([`copy u1/p1.mp4 -> ${KEPT}`, `remove ${KEPT}`])
  })

  // Never remove the current file when the new record was not written.
  it('keeps the current object and removes the new one and the copy when the record write fails', async () => {
    const { ports, log } = stored({
      writeRecord: async () => ({ error: { code: 'PGRST204', message: "no 'video' column" } }),
    })
    const err = await saveVideo(ports, input({ format: WEBM_FORMAT })).catch((e: unknown) => e)
    expect((err as VideoError).message).toBe(MIGRATION_MESSAGE)
    expect(log).toContain(`remove ${KEPT},u1/p1.webm`)
    expect(log).not.toContain('remove u1/p1.mp4')
  })

  it('does not remove a file it just overwrote when the record write fails at the same path', async () => {
    const { ports, log } = stored({ writeRecord: async () => ({ error: { message: 'boom' } }) })
    await expect(saveVideo(ports, input())).rejects.toBeInstanceOf(VideoError)
    expect(log.filter((l) => l.startsWith('remove'))).toEqual([`remove ${KEPT}`])
  })

  it('removes the new object when there was no previous video and the record write fails', async () => {
    const { ports, log } = fakePorts({ writeRecord: async () => ({ error: { message: 'boom' } }) })
    await expect(saveVideo(ports, input())).rejects.toBeInstanceOf(VideoError)
    expect(log).toContain('remove u1/p1.mp4')
  })

  it('still succeeds when removing the previous object fails', async () => {
    const { ports } = fakePorts({
      readRecord: async () => ({ data: previous, error: null }),
      remove: async () => Promise.reject(new Error('offline')),
    })
    await expect(saveVideo(ports, input({ format: WEBM_FORMAT }))).resolves.toMatchObject({ path: 'u1/p1.webm' })
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

// The Videos page already holds each record (it lists them in one read), so it signs without reading again.
describe('signVideo', () => {
  it('makes a playback and a download link for a record in hand, without reading the deck', async () => {
    const readRecord = vi.fn(async () => ({ data: null, error: null }))
    const { ports } = fakePorts({ readRecord })
    const view = await signVideo(ports, previous, 'My deck')
    expect(view).toEqual({
      record: previous,
      url: 'https://signed/u1/p1.mp4',
      downloadUrl: 'https://signed/u1/p1.mp4?download=My deck.mp4',
    })
    expect(readRecord).not.toHaveBeenCalled()
  })

  it('keeps the record with no links when signing throws', async () => {
    const { ports } = fakePorts({
      signedUrl: async () => {
        throw new Error('offline')
      },
    })
    expect(await signVideo(ports, previous, 'x')).toEqual({ record: previous, url: null, downloadUrl: null })
  })
})

describe('loadVideoHistory', () => {
  const older: VideoRecord = { ...previous, path: 'u1/p1/2026-08-01T00-00-00-000Z.mp4' }

  it('returns each earlier video with its links, in the stored order, leaving out bad entries', async () => {
    const { ports } = fakePorts({ readHistory: async () => ({ data: [older, { path: 1 }, previous], error: null }) })
    const views = await loadVideoHistory(ports, 'p1', 'Deck')
    expect(views.map((v) => v.record.path)).toEqual([older.path, previous.path])
    expect(views[0].url).toBe(`https://signed/${older.path}`)
  })

  it('is empty when the read fails, the column is missing, or it throws', async () => {
    expect(await loadVideoHistory(fakePorts({ readHistory: async () => ({ data: null, error: { code: '42703' } }) }).ports, 'p1', 'x')).toEqual([])
    expect(await loadVideoHistory(fakePorts({ readHistory: async () => Promise.reject(new Error('offline')) }).ports, 'p1', 'x')).toEqual([])
  })
})

describe('deleteDeckWithVideo', () => {
  it('removes the earlier videos along with the current one, after the row', async () => {
    const older: VideoRecord = { ...previous, path: 'u1/p1/2026-08-01T00-00-00-000Z.mp4' }
    const { ports, log } = fakePorts({
      readRecord: async () => ({ data: previous, error: null }),
      readHistory: async () => ({ data: [older], error: null }),
    })
    await deleteDeckWithVideo(ports, 'p1', async () => {
      log.push('delete row')
    })
    expect(log).toEqual(['delete row', `remove u1/p1.mp4,${older.path}`])
  })

  // The row goes first: a delete that fails must leave the deck with the video it had.
  it('deletes the row, then removes its video object', async () => {
    const { ports, log } = fakePorts({ readRecord: async () => ({ data: previous, error: null }) })
    await deleteDeckWithVideo(ports, 'p1', async () => {
      log.push('delete row')
    })
    expect(log).toEqual(['delete row', 'remove u1/p1.mp4'])
  })

  it('removes nothing when the row delete fails, and passes the failure on', async () => {
    const { ports, log } = fakePorts({ readRecord: async () => ({ data: previous, error: null }) })
    await expect(
      deleteDeckWithVideo(ports, 'p1', async () => Promise.reject(new Error('offline'))),
    ).rejects.toThrow('offline')
    expect(log).toEqual([])
  })

  it('removes nothing when the deck has no video', async () => {
    const { ports, log } = fakePorts()
    await deleteDeckWithVideo(ports, 'p1', async () => {})
    expect(log).toEqual([])
  })

  // Deleting a deck must never be blocked by its video.
  it('still deletes the row when the video cannot be read or removed', async () => {
    let deleted = 0
    const unreadable = fakePorts({ readRecord: async () => Promise.reject(new Error('offline')) })
    await deleteDeckWithVideo(unreadable.ports, 'p1', async () => {
      deleted++
    })
    const unremovable = fakePorts({
      readRecord: async () => ({ data: previous, error: null }),
      remove: async () => Promise.reject(new Error('offline')),
    })
    await expect(
      deleteDeckWithVideo(unremovable.ports, 'p1', async () => {
        deleted++
      }),
    ).resolves.toBeUndefined()
    expect(deleted).toBe(2)
  })
})
