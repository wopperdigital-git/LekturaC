import { describe, expect, it, vi } from 'vitest'
import type { Photo } from '@/images/types'
import { addPhotos } from './photos'
import { generatedDeckSchema, type GeneratedCard, type GeneratedDeck } from './schemas'

function photo(n: number): Photo {
  return {
    url: `https://images.example/${n}.jpg`,
    alt: `Photo ${n}`,
    credit: { name: `Photographer ${n}`, url: `https://pexels.com/@p${n}`, source: 'pexels' },
  }
}

function card(heading: string, extra: Partial<GeneratedCard> & { imageQuery?: string } = {}): GeneratedCard {
  return {
    plan: {
      purpose: 'concept_explanation',
      audienceQuestion: 'What matters here?',
      keyMessage: 'A message worth telling.',
      visualType: 'text',
      layoutFamily: 'list',
      transition: '',
      importance: 'supporting',
    },
    blocks: [
      { type: 'heading', text: heading },
      { type: 'paragraph', text: 'Body copy.' },
    ],
    visualStyle: 'structured',
    speakerNotes: 'Notes.',
    claims: [],
    ...extra,
  } as GeneratedCard
}

function deck(cards: GeneratedCard[]): GeneratedDeck {
  return {
    title: 'Test deck',
    blueprint: 'inform',
    brief: {
      objective: 'Explain',
      audienceKnowledgeLevel: 'beginner',
      presentationType: 'informational',
      freshnessRequired: false,
      keyQuestions: [],
    },
    cards,
  }
}

describe('addPhotos', () => {
  it('appends one image block as the last block of each card with an imageQuery', async () => {
    const input = deck([card('One', { imageQuery: 'mountain lake' }), card('Two')])
    const search = vi.fn(async (_query: string, _signal?: AbortSignal) => [photo(1)])
    const out = await addPhotos(input, search)

    expect(search).toHaveBeenCalledTimes(1)
    expect(search.mock.calls[0][0]).toBe('mountain lake')
    const blocks = out.cards[0].blocks
    expect(blocks).toHaveLength(3)
    expect(blocks.slice(0, 2)).toEqual(input.cards[0].blocks)
    expect(blocks[2]).toEqual({
      type: 'image',
      url: photo(1).url,
      alt: photo(1).alt,
      prompt: 'mountain lake',
      credit: photo(1).credit,
    })
    expect(out.cards[1].blocks).toEqual(input.cards[1].blocks)
  })

  it('removes every model-written image block, even on a card with no imageQuery', async () => {
    const invented = { type: 'image' as const, url: 'https://invented.example/x.jpg', alt: 'made up' }
    const input = deck([
      card('One', {
        imageQuery: 'harbour at dawn',
        blocks: [
          { type: 'heading', text: 'One' },
          invented,
          { type: 'paragraph', text: 'Body.' },
        ],
      }),
      card('Two', {
        blocks: [{ type: 'heading', text: 'Two' }, invented],
      }),
    ])
    const out = await addPhotos(input, async () => [photo(1)])

    expect(out.cards[0].blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'image'])
    expect(out.cards[0].blocks[2]).toMatchObject({ url: photo(1).url })
    expect(out.cards[1].blocks).toEqual([{ type: 'heading', text: 'Two' }])
  })

  it('keeps a card without a photo when its search rejects or returns nothing', async () => {
    const input = deck([
      card('Fails', { imageQuery: 'a' + 'b' }),
      card('Empty', { imageQuery: 'cd' }),
      card('Works', { imageQuery: 'ef' }),
    ])
    const search = async (q: string) => {
      if (q === 'ab') throw new Error('429')
      if (q === 'cd') return []
      return [photo(3)]
    }
    const out = await addPhotos(input, search)

    expect(out.cards[0].blocks).toEqual(input.cards[0].blocks)
    expect(out.cards[1].blocks).toEqual(input.cards[1].blocks)
    expect(out.cards[2].blocks.at(-1)).toMatchObject({ type: 'image', url: photo(3).url })
  })

  it('treats a search that throws synchronously as that card failing, not the stage', async () => {
    const input = deck([card('Throws', { imageQuery: 'ab' }), card('Works', { imageQuery: 'cd' })])
    const search = (q: string): Promise<Photo[]> => {
      if (q === 'ab') throw new Error('sync boom')
      return Promise.resolve([photo(2)])
    }
    const out = await addPhotos(input, search)

    expect(out.cards[0].blocks).toEqual(input.cards[0].blocks)
    expect(out.cards[1].blocks.at(-1)).toMatchObject({ url: photo(2).url })
  })

  it('gives the second of two cards that found the same first photo the next unused one', async () => {
    const input = deck([card('One', { imageQuery: 'forest' }), card('Two', { imageQuery: 'woods' })])
    const out = await addPhotos(input, async () => [photo(1), photo(2)])

    expect(out.cards[0].blocks.at(-1)).toMatchObject({ url: photo(1).url })
    expect(out.cards[1].blocks.at(-1)).toMatchObject({ url: photo(2).url })
  })

  it('adds no photo when every result was already taken by an earlier card', async () => {
    const input = deck([card('One', { imageQuery: 'forest' }), card('Two', { imageQuery: 'woods' })])
    const out = await addPhotos(input, async () => [photo(1)])

    expect(out.cards[0].blocks.at(-1)).toMatchObject({ type: 'image' })
    expect(out.cards[1].blocks).toEqual(input.cards[1].blocks)
  })

  it('rejects with an AbortError when the signal is already aborted, searching nothing', async () => {
    const controller = new AbortController()
    controller.abort()
    const search = vi.fn(async (_query: string, _signal?: AbortSignal) => [photo(1)])
    await expect(
      addPhotos(deck([card('One', { imageQuery: 'forest' })]), search, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(search).not.toHaveBeenCalled()
  })

  it('rejects with an AbortError when aborted mid-search, even if the searches reject', async () => {
    const controller = new AbortController()
    const search = async () => {
      controller.abort()
      throw new Error('some image search error')
    }
    await expect(
      addPhotos(deck([card('One', { imageQuery: 'forest' })]), search, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('does not mutate the input deck, and untouched cards keep identity', async () => {
    const input = deck([card('One', { imageQuery: 'forest' }), card('Two')])
    const snapshot = JSON.parse(JSON.stringify(input))
    const out = await addPhotos(input, async () => [photo(1)])

    expect(input).toEqual(snapshot)
    expect(out.cards[1]).toBe(input.cards[1])
    expect(out.cards[0]).not.toBe(input.cards[0])
  })

  it('passes the signal to each search', async () => {
    const controller = new AbortController()
    const search = vi.fn(async (_query: string, _signal?: AbortSignal) => [photo(1)])
    await addPhotos(deck([card('One', { imageQuery: 'forest' })]), search, controller.signal)
    expect(search.mock.calls[0][1]).toBe(controller.signal)
  })
})

describe('generatedCardSchema imageQuery', () => {
  function raw(extra: Record<string, unknown> = {}) {
    return {
      title: 'T',
      blueprint: 'inform',
      brief: { objective: 'O', audienceKnowledgeLevel: 'beginner', presentationType: 'other', freshnessRequired: false, keyQuestions: [] },
      cards: [
        {
          plan: { purpose: 'hook', audienceQuestion: 'q', keyMessage: 'k', visualType: 'text', transition: '', importance: 'essential' },
          blocks: [{ type: 'heading', text: 'H' }],
          visualStyle: 'structured',
          speakerNotes: 'n',
          claims: [],
          ...extra,
        },
      ],
    }
  }

  it('parses a non-string imageQuery to undefined instead of failing the deck', () => {
    const result = generatedDeckSchema.parse(raw({ imageQuery: 42 }))
    expect(result.cards[0].imageQuery).toBeUndefined()
  })

  it('keeps a valid imageQuery, trimmed', () => {
    const result = generatedDeckSchema.parse(raw({ imageQuery: '  mountain lake  ' }))
    expect(result.cards[0].imageQuery).toBe('mountain lake')
  })

  it('still parses a deck without imageQuery', () => {
    const result = generatedDeckSchema.parse(raw())
    expect(result.cards[0].imageQuery).toBeUndefined()
  })
})
