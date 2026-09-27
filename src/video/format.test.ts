import { describe, expect, it } from 'vitest'
import { AUDIO_SAMPLE_RATE, MP4_FORMAT, WEBM_FORMAT, chooseFormat, hasWebCodecs } from './format'

describe('chooseFormat', () => {
  it('prefers MP4 when it can be encoded', () => {
    expect(chooseFormat({ mp4: true, webm: true })).toBe(MP4_FORMAT)
    expect(chooseFormat({ mp4: true, webm: false })).toBe(MP4_FORMAT)
  })

  it('falls back to WebM', () => {
    expect(chooseFormat({ mp4: false, webm: true })).toBe(WEBM_FORMAT)
  })

  it('is null when neither can be encoded', () => {
    expect(chooseFormat({ mp4: false, webm: false })).toBeNull()
  })

  it('names the file type and codecs for each', () => {
    expect(MP4_FORMAT).toMatchObject({ ext: 'mp4', contentType: 'video/mp4', videoCodec: 'avc', audioCodec: 'aac' })
    expect(WEBM_FORMAT).toMatchObject({ ext: 'webm', contentType: 'video/webm', videoCodec: 'vp9', audioCodec: 'opus' })
  })
})

describe('hasWebCodecs', () => {
  it('needs both encoders', () => {
    expect(hasWebCodecs({ VideoEncoder: class {}, AudioEncoder: class {} })).toBe(true)
    expect(hasWebCodecs({ VideoEncoder: class {} })).toBe(false)
    expect(hasWebCodecs({ AudioEncoder: class {} })).toBe(false)
    expect(hasWebCodecs({})).toBe(false)
  })
})

it('narrates at the sample rate the silent buffers and the encoder are built for', () => {
  expect(AUDIO_SAMPLE_RATE).toBe(44100)
})
