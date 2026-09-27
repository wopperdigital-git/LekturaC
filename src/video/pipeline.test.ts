import { describe, expect, it } from 'vitest'
import { VideoError } from './errors'
import { generateVideo, type Clip, type PipelineDeps, type Progress } from './pipeline'
import type { VideoRecord } from './videoRecord'

const clip = (duration: number, numberOfChannels = 1): Clip => ({ duration, numberOfChannels })

const RECORD: VideoRecord = {
  path: 'u1/p1.mp4',
  contentType: 'video/mp4',
  durationSeconds: 0,
  generatedAt: '2026-09-27T00:00:00.000Z',
}

/** Every dependency logs what it is asked to do, so a test can assert the order. */
function setup() {
  const log: string[] = []
  const controller = new AbortController()
  const deps: PipelineDeps<Clip> = {
    narrate: async (text) => {
      log.push(`narrate ${text}`)
      return clip(2)
    },
    silence: (seconds, channels) => {
      log.push(`silence ${seconds} ${channels}`)
      return clip(seconds, channels)
    },
    drawSlide: async (i) => {
      log.push(`draw ${i}`)
    },
    encoder: {
      start: async () => {
        log.push('start')
      },
      addAudio: async (c) => {
        log.push(`audio ${c.duration}`)
      },
      addFrame: async (t) => {
        log.push(`frame ${t}`)
      },
      finish: async () => {
        log.push('finish')
        return new Blob(['video'])
      },
      cancel: async () => {
        log.push('cancel')
      },
    },
    save: async (_blob, seconds) => {
      log.push(`save ${seconds}`)
      return { ...RECORD, durationSeconds: seconds }
    },
  }
  const run = (texts: string[], onProgress?: (p: Progress) => void) =>
    generateVideo({ texts, signal: controller.signal, onProgress }, deps)
  return { deps, log, controller, run }
}

describe('generateVideo: the happy path', () => {
  it('narrates, then draws and encodes each slide in order, then finishes and saves', async () => {
    const { log, run } = setup()
    const result = await run(['A', '   '])
    expect(result).toEqual({ status: 'done', record: { ...RECORD, durationSeconds: 6 } })
    expect(log).toEqual([
      'narrate A',
      'silence 4 1',
      'start',
      'draw 0',
      'audio 2',
      'frame 0',
      'frame 1',
      'draw 1',
      'audio 4',
      'frame 2',
      'frame 3',
      'frame 4',
      'frame 5',
      'finish',
      'save 6',
    ])
  })

  it('reports the stages in order, ending with the save', async () => {
    const { run } = setup()
    const seen: Progress[] = []
    await run(['A', 'B'], (p) => seen.push(p))
    const stages = seen.map((p) => p.stage).filter((s, i, all) => i === 0 || s !== all[i - 1])
    expect(stages).toEqual(['narrating', 'rendering', 'encoding', 'uploading'])
    expect(seen[0]).toEqual({ stage: 'narrating', done: 0, total: 2 })
    expect(seen.at(-1)).toEqual({ stage: 'uploading', done: 1, total: 1 })
  })

  it('makes silent slides as wide as the narrated ones', async () => {
    const { deps, log, run } = setup()
    deps.narrate = async () => clip(2, 2)
    await run(['A', ''])
    expect(log).toContain('silence 4 2')
  })
})

describe('generateVideo: blank scripts', () => {
  // Review Focus 1.
  it('makes a silent slideshow with no narration request when every slide is blank', async () => {
    const { log, run } = setup()
    const result = await run(['', '  ', '\n'])
    expect(result.status).toBe('done')
    expect(log.filter((l) => l.startsWith('narrate'))).toEqual([])
    expect(log.filter((l) => l.startsWith('silence'))).toEqual(['silence 4 1', 'silence 4 1', 'silence 4 1'])
    expect(log).toContain('save 12')
  })

  it('refuses a deck with no slides', async () => {
    const { run } = setup()
    const err = await run([]).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(VideoError)
    expect((err as VideoError).message).toBe('This deck has no slides.')
  })
})

describe('generateVideo: failures', () => {
  it('names the slide whose narration failed, and starts no encoder', async () => {
    const { deps, log, run } = setup()
    deps.narrate = async (text) => {
      if (text === 'B') throw new Error('boom')
      return clip(2)
    }
    const err = await run(['A', 'B']).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(VideoError)
    expect((err as VideoError).stage).toBe('narrating')
    expect((err as VideoError).message).toBe('Narrating slide 2 failed: boom')
    expect(log).not.toContain('start')
    expect(log.some((l) => l.startsWith('save'))).toBe(false)
  })

  // Review Focus 2: a silent or empty clip would leave picture and sound out of step.
  it('refuses a clip with no audio in it', async () => {
    const { deps, run } = setup()
    deps.narrate = async () => clip(0.05)
    const err = await run(['A']).catch((e: unknown) => e)
    expect((err as VideoError).message).toBe('Narrating slide 1 failed: no audio came back.')
  })

  it('stops the encoder and saves nothing when a slide cannot be drawn', async () => {
    const { deps, log, run } = setup()
    deps.drawSlide = async () => {
      throw new Error('boom')
    }
    const err = await run(['A']).catch((e: unknown) => e)
    expect((err as VideoError).stage).toBe('rendering')
    expect((err as VideoError).message).toBe('Could not draw slide 1: boom')
    expect(log).toContain('cancel')
    expect(log).not.toContain('finish')
    expect(log.some((l) => l.startsWith('save'))).toBe(false)
  })

  it('stops the encoder and saves nothing when encoding fails', async () => {
    const { deps, log, run } = setup()
    deps.encoder.addFrame = async () => {
      throw new Error('boom')
    }
    const err = await run(['A']).catch((e: unknown) => e)
    expect((err as VideoError).stage).toBe('encoding')
    expect(log).toContain('cancel')
    expect(log.some((l) => l.startsWith('save'))).toBe(false)
  })

  it('passes a save failure through unchanged, and does not cancel a finished encode', async () => {
    const { deps, log, run } = setup()
    deps.save = async () => {
      throw new VideoError('uploading', 'Run migration 0015 in Supabase.')
    }
    const err = await run(['A']).catch((e: unknown) => e)
    expect((err as VideoError).message).toBe('Run migration 0015 in Supabase.')
    expect(log).not.toContain('cancel')
  })

  it('turns an unexpected save failure into an upload error', async () => {
    const { deps, run } = setup()
    deps.save = async () => {
      throw new Error('kaboom')
    }
    const err = await run(['A']).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(VideoError)
    expect((err as VideoError).stage).toBe('uploading')
    expect((err as VideoError).message).not.toContain('kaboom')
  })
})

describe('generateVideo: cancelling', () => {
  it('returns quietly, starting nothing, when cancelled while narrating', async () => {
    const { deps, log, controller, run } = setup()
    deps.narrate = async () => {
      controller.abort()
      return clip(2)
    }
    expect(await run(['A', 'B'])).toEqual({ status: 'cancelled' })
    expect(log).not.toContain('start')
    expect(log.some((l) => l.startsWith('save'))).toBe(false)
  })

  it('treats the abort error a cancelled request throws as a cancel, not a failure', async () => {
    const { deps, controller, run } = setup()
    deps.narrate = async () => {
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    }
    expect(await run(['A'])).toEqual({ status: 'cancelled' })
  })

  it('stops the encoder and saves nothing when cancelled while drawing', async () => {
    const { deps, log, controller, run } = setup()
    deps.drawSlide = async (i) => {
      if (i === 1) controller.abort()
    }
    expect(await run(['A', 'B', 'C'])).toEqual({ status: 'cancelled' })
    expect(log).toContain('cancel')
    expect(log).not.toContain('finish')
    expect(log.some((l) => l.startsWith('save'))).toBe(false)
  })

  // Review Focus 3: the last moment before the upload. Nothing may be written.
  it('saves nothing when cancelled while the file is being finished', async () => {
    const { deps, log, controller, run } = setup()
    deps.encoder.finish = async () => {
      log.push('finish')
      controller.abort()
      return new Blob(['video'])
    }
    expect(await run(['A'])).toEqual({ status: 'cancelled' })
    expect(log.some((l) => l.startsWith('save'))).toBe(false)
    // The file was already complete: there is no encoder left to cancel.
    expect(log).not.toContain('cancel')
  })

  it('is already cancelled when the signal was aborted before the run', async () => {
    const { controller, log, run } = setup()
    controller.abort()
    expect(await run(['A'])).toEqual({ status: 'cancelled' })
    expect(log).toEqual([])
  })

  // The upload cannot be aborted, so it is the point of no return: the record is written.
  it('finishes the save once it has started, even if cancelled during it', async () => {
    const { deps, controller, run } = setup()
    deps.save = async (_blob, seconds) => {
      controller.abort()
      return { ...RECORD, durationSeconds: seconds }
    }
    expect((await run(['A'])).status).toBe('done')
  })
})
