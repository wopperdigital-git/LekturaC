import { describe, expect, it } from 'vitest'
import { photoFromLink } from './link'

describe('photoFromLink', () => {
  it('accepts an https link and carries no credit', () => {
    expect(photoFromLink('https://x.example/y.jpg')).toEqual({
      url: 'https://x.example/y.jpg',
      alt: '',
      credit: { name: '', url: '', source: 'url' },
    })
  })

  it('accepts http and trims the pasted text', () => {
    expect(photoFromLink('  http://x.example/a.png \n')?.url).toBe('http://x.example/a.png')
  })

  it('rejects other schemes, plain words and empty input', () => {
    expect(photoFromLink('javascript:alert(1)')).toBeNull()
    expect(photoFromLink('ftp://x.example/y.jpg')).toBeNull()
    expect(photoFromLink('data:image/png;base64,AAAA')).toBeNull()
    expect(photoFromLink('a cat on a sofa')).toBeNull()
    expect(photoFromLink('   ')).toBeNull()
  })
})
