import { describe, expect, it } from 'vitest'
import { BLUEPRINTS, sequenceFor } from './slideBlueprints'

/**
 * The scaling tables are the product here — a wrong cell silently produces a
 * differently-shaped deck that nothing else in the app would notice. So the
 * columns are pinned against the doc's own labels, verbatim, rather than
 * against whatever the module happens to hold.
 */
const INFORM_COLUMNS: Record<number, string[]> = {
  5: ['Title + why it matters', 'Gap + objectives', 'Core content (main idea)', 'Application', 'Recap + next steps'],
  6: ['Title + why it matters', 'Gap + objectives', 'Core idea 1', 'Core idea 2', 'Application', 'Recap + next steps'],
  7: ['Title + roadmap', 'Why it matters', 'Gap + objectives', 'Core idea 1', 'Core idea 2', 'Application', 'Recap + next steps'],
  8: ['Title + roadmap', 'Why it matters', 'Gap + objectives', 'Core idea 1', 'Core idea 2', 'Core idea 3', 'Application', 'Recap + next steps'],
  9: ['Title + roadmap', 'Why it matters', 'Gap', 'Objectives', 'Core idea 1', 'Core idea 2', 'Core idea 3', 'Application', 'Recap + next steps'],
  10: ['Title + roadmap', 'Why it matters', 'Gap', 'Objectives', 'Core idea 1', 'Core idea 2', 'Core idea 3', 'Application', 'Recap', 'Next steps'],
}

const INFORM_MASTER_LABELS = [
  'Title + roadmap',
  'Why it matters',
  'Gap',
  'Objectives',
  'Core idea 1',
  'Core idea 2',
  'Core idea 3',
  'Application',
  'Recap',
  'Next steps',
]

describe('inform blueprint', () => {
  it('has a ten-slide master sequence', () => {
    expect(BLUEPRINTS.inform.master).toHaveLength(10)
  })

  it('master sequence labels match the doc', () => {
    expect(BLUEPRINTS.inform.master.map((s) => s.label)).toEqual(INFORM_MASTER_LABELS)
  })

  it('matches the doc table for every count from 5 to 10', () => {
    for (const [count, labels] of Object.entries(INFORM_COLUMNS)) {
      expect(sequenceFor('inform', Number(count)).map((s) => s.label)).toEqual(labels)
    }
  })
})

describe('sequenceFor', () => {
  it('returns exactly the requested number of slides for every count 1-10', () => {
    for (let count = 1; count <= 10; count++) {
      expect(sequenceFor('inform', count)).toHaveLength(count)
    }
  })

  it('compresses below five by keeping the opening and the close', () => {
    // 1-4 are outside the doc's tables; the 5-slide column is compressed so a
    // short deck is still the blueprint's shape rather than a different one.
    const five = sequenceFor('inform', 5)
    for (let count = 2; count <= 4; count++) {
      const seq = sequenceFor('inform', count)
      expect(seq[0]).toEqual(five[0])
      expect(seq[seq.length - 1]).toEqual(five[five.length - 1])
    }
  })

  it('fills the middle in order', () => {
    expect(sequenceFor('inform', 3).map((s) => s.label)).toEqual([
      'Title + why it matters',
      'Gap + objectives',
      'Recap + next steps',
    ])
  })

  it('gives a single slide the opening only', () => {
    expect(sequenceFor('inform', 1).map((s) => s.label)).toEqual(['Title + why it matters'])
  })

  it('clamps above ten rather than returning nothing', () => {
    // slideCountProblem already refuses these; sequenceFor must still be total,
    // because the prompt builder depends on its length.
    expect(sequenceFor('inform', 11)).toHaveLength(10)
    expect(sequenceFor('inform', 0)).toHaveLength(1)
  })
})

describe('role vocabulary', () => {
  it('uses unique role ids within a blueprint', () => {
    for (const blueprint of Object.values(BLUEPRINTS)) {
      const roles = blueprint.master.map((s) => s.role)
      expect(new Set(roles).size).toBe(roles.length)
    }
  })

  it('role ids follow the format convention', () => {
    for (const blueprint of Object.values(BLUEPRINTS)) {
      for (const column of Object.values(blueprint.columns)) {
        for (const spec of column) {
          expect(spec.role).toMatch(/^[a-z0-9-]+$/)
        }
      }
    }
  })

  it('every role has a non-empty instruction', () => {
    for (const blueprint of Object.values(BLUEPRINTS)) {
      for (const column of Object.values(blueprint.columns)) {
        for (const spec of column) {
          expect(spec.instruction.length).toBeGreaterThan(0)
        }
      }
    }
  })

  it('only uses roles from the master sequence or a documented merge', () => {
    // For inform blueprint: master roles + merged-row roles
    const informLegalRoles = new Set([
      // Master roles
      'title-roadmap',
      'why-matters',
      'gap',
      'objectives',
      'core-idea-1',
      'core-idea-2',
      'core-idea-3',
      'application',
      'recap',
      'next-steps',
      // Merged-row roles that only appear in columns
      'title-why-matters',
      'gap-objectives',
      'core-content',
      'recap-next-steps',
    ])

    for (const blueprint of Object.values(BLUEPRINTS)) {
      const legalRoles = blueprint.id === 'inform' ? informLegalRoles : new Set<string>()
      for (const column of Object.values(blueprint.columns)) {
        for (const spec of column) {
          expect(legalRoles.has(spec.role)).toBe(true)
        }
      }
    }
  })
})
