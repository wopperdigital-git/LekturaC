import { describe, expect, it } from 'vitest'
import { restorePending } from './resumePending'

describe('restorePending', () => {
  it('puts text into the text field it was typed for', () => {
    expect(restorePending('topic', 'Volcanoes')).toEqual({ topic: 'Volcanoes' })
    expect(restorePending('audience', 'Nurses')).toEqual({ audience: 'Nurses' })
    expect(restorePending('guidance', 'Keep it short')).toEqual({ guidance: 'Keep it short' })
  })

  it('reads a slide count or "auto" into the slide-count chips', () => {
    expect(restorePending('slideCount', ' 6 ')).toEqual({ slideCount: 6 })
    expect(restorePending('slideCount', 'Let AI decide')).toEqual({ slideCount: 'auto' })
  })

  it('reads a detail level by name', () => {
    expect(restorePending('detailLevel', 'Detailed')).toEqual({ detailLevel: 'detailed' })
  })

  it('never drops text a chip cannot take: it goes to guidance', () => {
    expect(restorePending('slideCount', '12')).toEqual({ guidance: '12' })
    expect(restorePending('detailLevel', 'very deep please')).toEqual({ guidance: 'very deep please' })
  })

  it('restores nothing for blank text or a finished draft', () => {
    expect(restorePending('topic', '   ')).toEqual({})
    expect(restorePending(null, 'anything')).toEqual({})
  })
})
