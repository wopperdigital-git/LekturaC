import { describe, expect, it } from 'vitest'
import { buildBlueprintSection, DECK_SYSTEM_PROMPT } from './prompts'
import { BLUEPRINTS, FIELD_PLAYBOOK, sequenceFor } from './slideBlueprints'

/**
 * The prompt is a string, so these are the only checks worth making: that the
 * model is actually handed the sequence it must follow, and that `'auto'` — the
 * one path where the count is not known in advance — carries every column
 * rather than leaving the model to invent its own merges.
 */
describe('buildBlueprintSection at an exact count', () => {
  const section = buildBlueprintSection(6)

  it('names all three blueprints', () => {
    for (const blueprint of Object.values(BLUEPRINTS)) {
      expect(section).toContain(blueprint.name)
    }
  })

  it('carries every row of every blueprint at that count, with its role id', () => {
    for (const id of ['inform', 'persuade', 'story'] as const) {
      for (const spec of sequenceFor(id, 6)) {
        expect(section).toContain(spec.role)
        expect(section).toContain(spec.label)
      }
    }
  })

  it('does not offer counts other than the one requested', () => {
    // A 9-slide-only row must not appear in a 6-slide prompt.
    expect(buildBlueprintSection(6)).not.toContain('choose a slide count')
  })

  it('includes the field playbook so the choice is guided', () => {
    expect(section).toContain(FIELD_PLAYBOOK[0].type)
  })

  it('says to skip objectives/agenda/roadmap rows unless the deck is a formal lesson or the user asked', () => {
    expect(section).toMatch(/skip objectives\/agenda\/roadmap-style rows unless/i)
  })

  it('still says the slide count is exact', () => {
    expect(section).toMatch(/slide count.*exact/i)
  })
})

describe('buildBlueprintSection at auto', () => {
  const section = buildBlueprintSection('auto')

  it('asks the model to choose the count as well as the blueprint', () => {
    expect(section).toContain('choose a slide count')
  })

  it('carries every column from 5 to 10 for every blueprint', () => {
    for (const id of ['inform', 'persuade', 'story'] as const) {
      for (let count = 5; count <= 10; count++) {
        for (const spec of sequenceFor(id, count)) {
          expect(section).toContain(spec.role)
        }
      }
    }
  })
})

describe('system prompt content rules', () => {
  it('keeps numbers opt-in rather than demanding a data point per slide', () => {
    // The blueprint doc's assertion-evidence rule says "one visual or short
    // data point"; taken literally that reintroduces invented statistics,
    // which the existing rules exist to prevent.
    expect(DECK_SYSTEM_PROMPT).toMatch(/example, mechanism|not invent|only when/i)
  })

  it('caps items per slide without licensing dropped or blurred content', () => {
    // A bare /7|seven/ match would pass against any of the ~4KB prompt's
    // stray digits — pin the actual ceiling rule and its guard against using
    // it to justify losing real items.
    expect(DECK_SYSTEM_PROMPT).toMatch(/5-7 items is the comfortable range/)
    expect(DECK_SYSTEM_PROMPT).toMatch(/never a reason to drop or blur a real item/)
  })

  it('tells the model to echo the role on every card', () => {
    expect(DECK_SYSTEM_PROMPT).toContain('role')
  })
})
