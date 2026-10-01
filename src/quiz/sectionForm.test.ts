import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SECTION_COUNT,
  newSection,
  changesForm,
  parseCount,
  sectionConfig,
  sectionsReducer,
  toSectionRequests,
  totalItems,
  type SectionDraft,
} from './sectionForm'
import { defaultInstructions } from './types'

function three(): SectionDraft[] {
  let s = [newSection(0, 'a')]
  s = sectionsReducer(s, { kind: 'add', key: 'b' })
  s = sectionsReducer(s, { kind: 'add', key: 'c' })
  return s
}

describe('parseCount', () => {
  it('clamps whole numbers and rejects anything else', () => {
    expect(parseCount(' 7 ')).toBe(7)
    expect(parseCount('0')).toBe(1)
    expect(parseCount('99')).toBe(20)
    expect(parseCount('abc')).toBeNull()
    expect(parseCount('2.5')).toBeNull()
  })
})

describe('sectionsReducer', () => {
  it('starts a test as multiple choice with default title, count and instructions', () => {
    const [s] = [newSection(0, 'a')]
    expect(s.title).toBe('Test 1')
    expect(s.count).toBe(DEFAULT_SECTION_COUNT)
    expect(sectionConfig(s)).toEqual({ type: 'multiple_choice', choiceCount: 4 })
    expect(s.instructions).toBe(defaultInstructions(sectionConfig(s)))
  })

  it('adds up to three tests and no more', () => {
    const s = three()
    expect(s.map((d) => d.title)).toEqual(['Test 1', 'Test 2', 'Test 3'])
    expect(sectionsReducer(s, { kind: 'add', key: 'd' })).toBe(s)
  })

  it('never removes the last test', () => {
    const one = [newSection(0, 'a')]
    expect(sectionsReducer(one, { kind: 'remove', index: 0 })).toBe(one)
  })

  it('renumbers default titles after a removal but keeps edited ones', () => {
    let s = three()
    s = sectionsReducer(s, { kind: 'setTitle', index: 2, title: 'Bonus' })
    s = sectionsReducer(s, { kind: 'remove', index: 0 })
    expect(s.map((d) => d.title)).toEqual(['Test 1', 'Bonus'])
    expect(s.map((d) => d.key)).toEqual(['b', 'c'])
  })

  it('updates instructions with the type until they are edited', () => {
    let s = [newSection(0, 'a')]
    s = sectionsReducer(s, { kind: 'setType', index: 0, type: 'true_false' })
    expect(s[0].instructions).toBe('Write TRUE if the statement is true or FALSE if it is false.')
    s = sectionsReducer(s, { kind: 'setConfig', index: 0, config: { type: 'true_false', notation: 'letter' } })
    expect(s[0].instructions).toBe('Write T if the statement is true or F if it is false.')
    s = sectionsReducer(s, { kind: 'setInstructions', index: 0, text: 'My own words.' })
    s = sectionsReducer(s, { kind: 'setType', index: 0, type: 'fill_blank' })
    expect(s[0].instructions).toBe('My own words.')
  })

  it('remembers each type sub-option when switching away and back', () => {
    let s = [newSection(0, 'a')]
    s = sectionsReducer(s, { kind: 'setConfig', index: 0, config: { type: 'multiple_choice', choiceCount: 3 } })
    s = sectionsReducer(s, { kind: 'setType', index: 0, type: 'true_false' })
    s = sectionsReducer(s, { kind: 'setType', index: 0, type: 'multiple_choice' })
    expect(sectionConfig(s[0])).toEqual({ type: 'multiple_choice', choiceCount: 3 })
  })

  it('commits typed counts, reverting non-numbers', () => {
    let s = [newSection(0, 'a')]
    s = sectionsReducer(s, { kind: 'setCountText', index: 0, text: '25' })
    s = sectionsReducer(s, { kind: 'commitCount', index: 0 })
    expect([s[0].count, s[0].countText]).toEqual([20, '20'])
    s = sectionsReducer(s, { kind: 'setCountText', index: 0, text: 'x' })
    s = sectionsReducer(s, { kind: 'commitAll' })
    expect([s[0].count, s[0].countText]).toEqual([20, '20'])
  })
})

describe('toSectionRequests / totalItems', () => {
  it('uses typed counts, trims titles and falls back to the default title when blank', () => {
    let s = three()
    s = sectionsReducer(s, { kind: 'setTitle', index: 0, title: '   ' })
    s = sectionsReducer(s, { kind: 'setTitle', index: 1, title: '  Part B  ' })
    s = sectionsReducer(s, { kind: 'setCountText', index: 2, text: '4' })
    s = sectionsReducer(s, { kind: 'setInstructions', index: 2, text: `  ${'y'.repeat(400)}  ` })
    const requests = toSectionRequests(s)
    expect(requests.map((r) => r.section.title)).toEqual(['Test 1', 'Part B', 'Test 3'])
    expect(requests.map((r) => r.count)).toEqual([10, 10, 4])
    expect(requests[2].section.instructions.length).toBe(300)
    expect(totalItems(s)).toBe(24)
  })

  it('caps a long title at 80 characters', () => {
    const s = sectionsReducer([newSection(0, 'a')], { kind: 'setTitle', index: 0, title: 'z'.repeat(120) })
    expect(toSectionRequests(s)[0].section.title).toHaveLength(80)
  })
})

describe('changesForm', () => {
  it('is false only for settling a count already typed (a blur must not drop written tests)', () => {
    expect(changesForm({ kind: 'commitCount', index: 0 })).toBe(false)
    expect(changesForm({ kind: 'commitAll' })).toBe(false)
    expect(changesForm({ kind: 'setCountText', index: 0, text: '5' })).toBe(true)
    expect(changesForm({ kind: 'setTitle', index: 0, title: 'x' })).toBe(true)
    expect(changesForm({ kind: 'add', key: 'k' })).toBe(true)
    expect(changesForm({ kind: 'remove', index: 0 })).toBe(true)
    expect(changesForm({ kind: 'setType', index: 0, type: 'fill_blank' })).toBe(true)
  })
})
