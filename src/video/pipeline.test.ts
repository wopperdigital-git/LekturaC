import { describe, expect, it } from 'vitest'
import { VideoError } from './errors'
import {
  generateVideo,
  type BookendDeps,
  type Clip,
  type PipelineBookends,
  type PipelineDeps,
  type Progress,
} from './pipeline'
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
      start: async (_quality) => {
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
  const run = (texts: string[], onProgress?: (p: Progress) => void, cardIds = texts.map((_, i) => `c${i + 1}`)) =>
    generateVideo({ texts, cardIds, signal: controller.signal, onProgress }, deps)
  return { deps, log, controller, run }
}

describe('generateVideo: the happy path', () => {
  it('narrates, then draws and encodes each slide in order, then finishes and saves', async () => {
    const { log, run } = setup()
    const result = await run(['A', '   '])
    expect(result).toEqual({ status: 'done', record: { ...RECORD, durationSeconds: 6 }, faceFailed: false })
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

describe('generateVideo: the size guard', () => {
  it('starts the encoder at medium for a short video', async () => {
    const { deps, run } = setup()
    let quality: string | undefined
    deps.encoder.start = async (q) => {
      quality = q
    }
    await run(['A'])
    expect(quality).toBe('medium')
  })

  it('refuses a video too long to save before starting the encoder', async () => {
    const { deps, log, run } = setup()
    deps.narrate = async () => clip(30 * 60)
    await expect(run(['A'])).rejects.toMatchObject({ stage: 'encoding' })
    expect(log).not.toContain('start')
    expect(log).not.toContain('cancel')
    expect(log.some((l) => l.startsWith('save'))).toBe(false)
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

  // A start that fails part-way may already hold an encoder, so it is cancelled too.
  it('cancels the encoder when start() itself fails', async () => {
    const { deps, log, run } = setup()
    deps.encoder.start = async () => {
      throw new Error('boom')
    }
    const err = await run(['A']).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(VideoError)
    expect((err as VideoError).stage).toBe('encoding')
    expect((err as VideoError).message).toBe('Could not start the video: boom')
    expect(log).toContain('cancel')
    expect(log).not.toContain('finish')
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

  it('cancels the encoder when the signal is aborted during start()', async () => {
    const { deps, log, controller, run } = setup()
    deps.encoder.start = async () => {
      log.push('start')
      controller.abort()
    }
    expect(await run(['A'])).toEqual({ status: 'cancelled' })
    expect(log).toContain('cancel')
    expect(log.some((l) => l.startsWith('save'))).toBe(false)
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

describe('generateVideo: slide timings', () => {
  it('passes each slide timing to save', async () => {
    const { deps, run } = setup()
    let seen: unknown
    deps.save = async (_blob, seconds, slides) => {
      seen = slides
      return { ...RECORD, durationSeconds: seconds }
    }
    await run(['hi', ''])
    expect(seen).toEqual([
      { cardId: 'c1', startSeconds: 0, durationSeconds: 2 },
      { cardId: 'c2', startSeconds: 2, durationSeconds: 4 },
    ])
  })

  it('refuses mismatched cardIds before narrating anything', async () => {
    const { log, run } = setup()
    const err = await run(['hi', 'there'], undefined, ['only-one']).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RangeError)
    expect(log).toEqual([])
  })
})

/* ---- face intro and outro ---- */

interface Deferred<T> {
  promise: Promise<T>
  resolve: (v: T) => void
  reject: (e: unknown) => void
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

type Talk = { id: string }

/** The plain setup, plus bookend fakes. Intro audio is 3 s and outro audio 2 s; `talk` resolves at once unless told otherwise. */
function bookendSetup(bookends: PipelineBookends = { intro: 'Hello', outro: 'Bye' }) {
  const base = setup()
  const { deps, log, controller } = base
  const intro = clip(3)
  const outro = clip(2)
  let drawTitleCalls = 0
  let talkResult: (file: Blob, signal: AbortSignal) => Promise<Talk | null> = async () => ({ id: 'clip' })
  const bookendDeps: BookendDeps<Clip, Talk> = {
    narrateWithFile: async (text) => {
      log.push(`narrateWithFile:${text === 'Hello' ? 'intro' : 'outro'}`)
      return { audio: text === 'Hello' ? intro : outro, file: new Blob([text]) }
    },
    talk: (file, signal) => {
      log.push('talk')
      return talkResult(file, signal)
    },
    encodeTalk: async (_clip, start, duration) => {
      log.push(`encodeTalk(${start},${duration})`)
    },
    drawTitleCard: async () => {
      drawTitleCalls++
      log.push('title')
    },
  }
  const full: PipelineDeps<Clip, Talk> = { ...deps, bookends: bookendDeps }
  full.narrate = async (text) => {
    log.push(`narrate:${text}`)
    return clip(text === 'A' ? 2 : 4)
  }
  // An explicit third argument (even `undefined`) replaces the default bookends.
  const run = (texts: string[], onProgress?: (p: Progress) => void, ...override: (PipelineBookends | undefined)[]) =>
    generateVideo<Clip, Talk>(
      {
        texts,
        cardIds: texts.map((_, i) => String.fromCharCode(97 + i)),
        signal: controller.signal,
        onProgress,
        bookends: override.length > 0 ? override[0] : bookends,
      },
      full,
    )
  return {
    deps: full,
    bookendDeps,
    log,
    controller,
    run,
    drawTitleCalls: () => drawTitleCalls,
    setTalk: (fn: typeof talkResult) => {
      talkResult = fn
    },
  }
}

describe('generateVideo: bookends', () => {
  it('bookends off makes zero talk and narrateWithFile calls', async () => {
    for (const b of [undefined, { intro: '', outro: '  ' }]) {
      const { log, run } = bookendSetup()
      const result = await run(['A', 'B'], undefined, b)
      expect(result.status).toBe('done')
      expect(log.filter((l) => l === 'talk' || l.startsWith('narrateWithFile'))).toEqual([])
    }
  })

  it('refuses an intro with no way to make one', async () => {
    const { deps, run } = bookendSetup()
    deps.bookends = undefined
    const err = await run(['A']).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RangeError)
  })

  it('narrates intro and outro first and starts both talks before slide narration', async () => {
    const { log, run } = bookendSetup()
    await run(['A', 'B'])
    expect(log.slice(0, 5)).toEqual(['narrateWithFile:intro', 'narrateWithFile:outro', 'talk', 'talk', 'narrate:A'])
  })

  it('encodes intro, slides, outro in order', async () => {
    const { log, run } = bookendSetup()
    const result = await run(['A', 'B'])
    const enc = log.filter((l) => l.startsWith('encodeTalk') || l.startsWith('draw '))
    expect(enc).toEqual(['encodeTalk(0,3)', 'draw 0', 'draw 1', 'encodeTalk(9,2)'])
    expect(log.filter((l) => l.startsWith('audio'))).toEqual(['audio 3', 'audio 2', 'audio 4', 'audio 2'])
    expect(log).toContain('save 11')
    expect(result).toMatchObject({ status: 'done', faceFailed: false })
    expect(log.some((l) => l.startsWith('frame'))).toBe(true)
  })

  it('reports narrating, animating, rendering, encoding, uploading with bookends counted first', async () => {
    const { run } = bookendSetup()
    const seen: Progress[] = []
    await run(['A', 'B'], (p) => seen.push(p))
    expect(seen[0]).toEqual({ stage: 'narrating', done: 0, total: 4 })
    expect(seen.find((p) => p.stage === 'narrating' && p.done === 2)).toEqual({ stage: 'narrating', done: 2, total: 4 })
    expect(seen.filter((p) => p.stage === 'animating')).toEqual([
      { stage: 'animating', done: 0, total: 2 },
      { stage: 'animating', done: 1, total: 2 },
      { stage: 'animating', done: 2, total: 2 },
    ])
    const stages = seen.map((p) => p.stage).filter((s, i, all) => i === 0 || s !== all[i - 1])
    expect(stages).toEqual(['narrating', 'animating', 'rendering', 'encoding', 'uploading'])
  })

  // Review Focus 5.
  it('slide timings are offset by the intro and exclude bookends', async () => {
    const { deps, run } = bookendSetup()
    let seen: unknown
    deps.save = async (_blob, seconds, slides) => {
      seen = slides
      return { ...RECORD, durationSeconds: seconds }
    }
    await run(['A', 'B'])
    expect(seen).toEqual([
      { cardId: 'a', startSeconds: 3, durationSeconds: 2 },
      { cardId: 'b', startSeconds: 5, durationSeconds: 4 },
    ])
  })

  it('an outro alone leaves slide timings starting at zero', async () => {
    const { deps, log, run } = bookendSetup()
    let seen: unknown
    deps.save = async (_blob, seconds, slides) => {
      seen = slides
      return { ...RECORD, durationSeconds: seconds }
    }
    await run(['A', 'B'], undefined, { intro: '', outro: 'Bye' })
    expect(seen).toEqual([
      { cardId: 'a', startSeconds: 0, durationSeconds: 2 },
      { cardId: 'b', startSeconds: 2, durationSeconds: 4 },
    ])
    expect(log).toContain('encodeTalk(6,2)')
  })

  it('a null talk falls back to a title card and reports faceFailed', async () => {
    const { log, setTalk, drawTitleCalls, run } = bookendSetup()
    setTalk(async () => null)
    const result = await run(['A'], undefined, { intro: 'Hello', outro: '' })
    expect(result).toMatchObject({ status: 'done', faceFailed: true })
    expect(drawTitleCalls()).toBe(1)
    expect(log.some((l) => l.startsWith('encodeTalk'))).toBe(false)
    // The title card's three seconds are three frames, added before the first slide is drawn.
    const before = log.slice(0, log.indexOf('draw 0'))
    expect(before.filter((l) => l.startsWith('frame'))).toEqual(['frame 0', 'frame 1', 'frame 2'])
    expect(before).toContain('title')
    expect(before).toContain('audio 3')
  })

  it('a talk that rejects without a cancel also falls back', async () => {
    const { setTalk, run } = bookendSetup()
    setTalk(async () => {
      throw new Error('boom')
    })
    expect(await run(['A'], undefined, { intro: 'Hello', outro: '' })).toMatchObject({
      status: 'done',
      faceFailed: true,
    })
  })

  it('refuses bookend audio with no sound in it', async () => {
    const { bookendDeps, run } = bookendSetup()
    bookendDeps.narrateWithFile = async () => ({ audio: clip(0.05), file: new Blob() })
    const err = await run(['A']).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(VideoError)
    expect((err as VideoError).stage).toBe('narrating')
    expect((err as VideoError).message).toBe('Narrating the intro failed: no audio came back.')
  })

  // Review Focus 1.
  it('cancel during animating returns cancelled and saves nothing', async () => {
    const { log, controller, setTalk, deps, run } = bookendSetup()
    const pending = deferred<Talk | null>()
    setTalk(() => pending.promise)
    let cancelled = 0
    deps.encoder.cancel = async () => {
      cancelled++
    }
    const done = run(['A'])
    await new Promise((r) => setTimeout(r, 0))
    controller.abort()
    pending.reject(new DOMException('aborted', 'AbortError'))
    expect(await done).toEqual({ status: 'cancelled' })
    expect(log.some((l) => l.startsWith('save'))).toBe(false)
    expect(log).not.toContain('start')
    // The encoder had not started, so there is nothing for it to cancel.
    expect(cancelled).toBe(0)
  })

  it('cancel while the encoder runs still cancels the encoder', async () => {
    const { controller, deps, log, run } = bookendSetup()
    deps.drawSlide = async () => {
      controller.abort()
    }
    expect(await run(['A'])).toEqual({ status: 'cancelled' })
    expect(log).toContain('cancel')
    expect(log.some((l) => l.startsWith('save'))).toBe(false)
  })

  // Review Focus 1: a failure while the clips are still processing.
  it('a slide narration failure with talks in flight throws that error, no unhandled rejection', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      const { deps, setTalk, run } = bookendSetup()
      const intro = deferred<Talk | null>()
      const outro = deferred<Talk | null>()
      let n = 0
      setTalk(() => (n++ === 0 ? intro.promise : outro.promise))
      deps.narrate = async (text) => {
        if (text === 'B') throw new Error('boom')
        return clip(2)
      }
      const err = await run(['A', 'B']).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(VideoError)
      expect((err as VideoError).stage).toBe('narrating')
      expect((err as VideoError).message).toBe('Narrating slide 2 failed: boom')
      intro.reject(new Error('late'))
      outro.reject(new Error('late'))
      await new Promise((r) => setTimeout(r, 0))
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('stops the clips still being made when the run fails', async () => {
    const { deps, setTalk, run } = bookendSetup()
    let signalSeen: AbortSignal | undefined
    setTalk((_file, signal) => {
      signalSeen = signal
      return new Promise(() => {})
    })
    deps.narrate = async () => {
      throw new Error('boom')
    }
    await run(['A']).catch(() => {})
    expect(signalSeen?.aborted).toBe(true)
  })
})
