import { describe, expect, it, vi } from 'vitest'
import {
  deleteFacePhoto,
  facePath,
  faceUploadProblem,
  readFacePhoto,
  saveFacePhoto,
  type FacePorts,
} from './facePhoto'

function fakePorts(names: string[] = [], over: Partial<FacePorts> = {}) {
  const calls: string[] = []
  const ports: FacePorts = {
    list: vi.fn(async () => ({ names, error: null })),
    upload: vi.fn(async (path: string) => {
      calls.push(`upload:${path}`)
      return { error: null }
    }),
    remove: vi.fn(async (paths: string[]) => {
      calls.push(`remove:${paths.join(',')}`)
      return { error: null }
    }),
    signedUrl: vi.fn(async (path: string) => ({ url: `https://signed/${path}`, error: null })),
    ...over,
  }
  return { ports, calls }
}

const png = (size = 1024) => new Blob([new Uint8Array(size)], { type: 'image/png' })

describe('facePath', () => {
  it('names the file by content type under the owner folder', () => {
    expect(facePath('u', 'image/jpeg')).toBe('u/face.jpg')
    expect(facePath('u', 'image/png')).toBe('u/face.png')
    expect(facePath('u', 'image/webp')).toBe('u/face.webp')
  })
})

describe('faceUploadProblem', () => {
  const ok = { type: 'image/png', size: 1024 * 1024 }
  it('needs consent', () => {
    expect(faceUploadProblem(ok, false)).toBe('Tick the box to confirm this is your face, or that you have permission.')
  })
  it('refuses other types', () => {
    expect(faceUploadProblem({ type: 'image/gif', size: 10 }, true)).toBe('Use a JPG, PNG or WebP photo.')
  })
  it('refuses a photo over 10 MB', () => {
    expect(faceUploadProblem({ type: 'image/jpeg', size: 10 * 1024 * 1024 + 1 }, true)).toBe('Use a photo under 10 MB.')
  })
  it('accepts a 1 MB png with consent', () => {
    expect(faceUploadProblem(ok, true)).toBeNull()
  })
})

describe('saveFacePhoto', () => {
  it('refuses without consent and uploads nothing', async () => {
    const { ports } = fakePorts()
    await expect(saveFacePhoto(ports, 'u', png(), false)).rejects.toThrow(/Tick the box/)
    expect(ports.upload).not.toHaveBeenCalled()
  })

  it('uploads the new file, then removes the old extension', async () => {
    const { ports, calls } = fakePorts(['face.jpg'])
    const saved = await saveFacePhoto(ports, 'u', png(), true)
    expect(calls).toEqual(['upload:u/face.png', 'remove:u/face.jpg'])
    expect(saved).toEqual({ path: 'u/face.png', url: 'https://signed/u/face.png' })
  })

  it('uploads with upsert semantics through the port and keeps the new file out of the removal', async () => {
    const { ports, calls } = fakePorts(['face.png'])
    await saveFacePhoto(ports, 'u', png(), true)
    expect(calls).toEqual(['upload:u/face.png'])
  })

  it('ignores a failed removal of leftovers', async () => {
    const { ports } = fakePorts(['face.jpg'], {
      remove: vi.fn(async () => ({ error: { message: 'nope' } })),
    })
    await expect(saveFacePhoto(ports, 'u', png(), true)).resolves.toMatchObject({ path: 'u/face.png' })
  })

  it('ignores a failed leftover listing', async () => {
    const { ports } = fakePorts([], { list: vi.fn(async () => ({ names: [], error: { message: 'x' } })) })
    await expect(saveFacePhoto(ports, 'u', png(), true)).resolves.toMatchObject({ path: 'u/face.png' })
  })

  it('throws when the upload fails, removing nothing', async () => {
    const { ports } = fakePorts(['face.jpg'], { upload: vi.fn(async () => ({ error: { message: 'boom' } })) })
    await expect(saveFacePhoto(ports, 'u', png(), true)).rejects.toThrow()
    expect(ports.remove).not.toHaveBeenCalled()
  })

  it('points at migration 0021 when the bucket is missing', async () => {
    const { ports } = fakePorts([], { upload: vi.fn(async () => ({ error: { message: 'Bucket not found' } })) })
    await expect(saveFacePhoto(ports, 'u', png(), true)).rejects.toThrow(/0021/)
  })
})

describe('readFacePhoto', () => {
  it('signs the first face file', async () => {
    const { ports } = fakePorts(['notes.txt', 'face.webp'])
    expect(await readFacePhoto(ports, 'u')).toEqual({ path: 'u/face.webp', url: 'https://signed/u/face.webp' })
  })
  it('is null with no photo', async () => {
    const { ports } = fakePorts([])
    expect(await readFacePhoto(ports, 'u')).toBeNull()
  })
  it('is null on a list error', async () => {
    const { ports } = fakePorts(['face.png'], { list: vi.fn(async () => ({ names: [], error: { message: 'x' } })) })
    expect(await readFacePhoto(ports, 'u')).toBeNull()
  })
  it('is null when signing fails or throws', async () => {
    const a = fakePorts(['face.png'], { signedUrl: vi.fn(async () => ({ url: null, error: { message: 'x' } })) })
    expect(await readFacePhoto(a.ports, 'u')).toBeNull()
    const b = fakePorts(['face.png'], {
      signedUrl: vi.fn(async () => {
        throw new Error('net')
      }),
    })
    expect(await readFacePhoto(b.ports, 'u')).toBeNull()
  })
})

describe('deleteFacePhoto', () => {
  it('removes every face file', async () => {
    const { ports, calls } = fakePorts(['face.jpg', 'face.png', 'other.txt'])
    expect(await deleteFacePhoto(ports, 'u')).toEqual({ error: null })
    expect(calls).toEqual(['remove:u/face.jpg,u/face.png'])
  })

  it('has nothing to do with no photo', async () => {
    const { ports } = fakePorts([])
    expect(await deleteFacePhoto(ports, 'u')).toEqual({ error: null })
    expect(ports.remove).not.toHaveBeenCalled()
  })

  it('treats a list error (such as a missing bucket) as nothing to delete', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { ports } = fakePorts([], { list: vi.fn(async () => ({ names: [], error: { message: 'Bucket not found' } })) })
    expect(await deleteFacePhoto(ports, 'u')).toEqual({ error: null })
    expect(ports.remove).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('reports a failed removal of photos that exist', async () => {
    const { ports } = fakePorts(['face.jpg'], { remove: vi.fn(async () => ({ error: { message: 'denied' } })) })
    const res = await deleteFacePhoto(ports, 'u')
    expect(res.error).toMatch(/face photo/i)
  })

  it('reports a removal that throws', async () => {
    const { ports } = fakePorts(['face.jpg'], {
      remove: vi.fn(async () => {
        throw new Error('net')
      }),
    })
    expect((await deleteFacePhoto(ports, 'u')).error).not.toBeNull()
  })
})
