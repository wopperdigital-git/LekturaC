import { describe, expect, it } from 'vitest'
import { BLUEPRINTS, sequenceFor, sequenceMismatch } from './slideBlueprints'

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

const PERSUADE_COLUMNS: Record<number, string[]> = {
  5: ['Hook', 'Problem + why now', 'Solution + how it works', 'Proof + why us', 'Offer + handling + CTA'],
  6: ['Hook', 'Problem + why now', 'Solution + how it works', 'Proof + why us', 'Offer + handling', 'Call to action'],
  7: ['Hook', 'Problem + why now', 'Solution + how it works', 'Proof + why us', 'Offer', 'Handling', 'Call to action'],
  8: ['Hook', 'Problem + why now', 'Solution', 'How it works', 'Proof + why us', 'Offer', 'Handling', 'Call to action'],
  9: ['Hook', 'Problem + why now', 'Solution', 'How it works', 'Proof', 'Why us', 'Offer', 'Handling', 'Call to action'],
  10: ['Hook', 'Problem', 'Why now', 'Solution', 'How it works', 'Proof', 'Why us', 'Offer', 'Handling', 'Call to action'],
}

const STORY_COLUMNS: Record<number, string[]> = {
  5: ['Hook', 'What is', 'Journey + insight', 'What could be + meaning', 'Closing'],
  6: ['Hook', 'What is + complication', 'Journey', 'Insight', 'What could be + meaning', 'Closing'],
  7: ['Hook', 'What is', 'Complication', 'Journey', 'Insight', 'What could be + meaning', 'Closing'],
  8: ['Hook', 'What is', 'Complication', 'Journey', 'Insight', 'What could be + meaning', 'Proof', 'Closing'],
  9: ['Hook', 'What is', 'Complication', 'Journey', 'Insight', 'What could be', 'Meaning', 'Proof', 'Closing'],
  10: ['Hook', 'What is', 'Complication', 'Journey', 'Insight', 'What could be', 'Meaning', 'Proof', 'Call to action', 'Closing line'],
}

const PERSUADE_MASTER_LABELS = [
  'Hook',
  'Problem',
  'Why now',
  'Solution',
  'How it works',
  'Proof',
  'Why us',
  'Offer',
  'Handling',
  'Call to action',
]

const STORY_MASTER_LABELS = [
  'Hook',
  'What is',
  'Complication',
  'Journey',
  'Insight',
  'What could be',
  'Meaning',
  'Proof',
  'Call to action',
  'Closing line',
]

describe('persuade blueprint', () => {
  it('has a ten-slide master sequence', () => {
    expect(BLUEPRINTS.persuade.master).toHaveLength(10)
  })

  it('master sequence labels match the doc', () => {
    expect(BLUEPRINTS.persuade.master.map((s) => s.label)).toEqual(PERSUADE_MASTER_LABELS)
  })

  it('matches the doc table for every count from 5 to 10', () => {
    for (const [count, labels] of Object.entries(PERSUADE_COLUMNS)) {
      expect(sequenceFor('persuade', Number(count)).map((s) => s.label)).toEqual(labels)
    }
  })
})

describe('story blueprint', () => {
  it('has a ten-slide master sequence', () => {
    expect(BLUEPRINTS.story.master).toHaveLength(10)
  })

  it('master sequence labels match the doc', () => {
    expect(BLUEPRINTS.story.master.map((s) => s.label)).toEqual(STORY_MASTER_LABELS)
  })

  it('matches the doc table for every count from 5 to 10', () => {
    for (const [count, labels] of Object.entries(STORY_COLUMNS)) {
      expect(sequenceFor('story', Number(count)).map((s) => s.label)).toEqual(labels)
    }
  })
})

describe('every blueprint', () => {
  it('returns exactly the requested number of slides for every count 1-10', () => {
    for (const id of ['inform', 'persuade', 'story'] as const) {
      for (let count = 1; count <= 10; count++) {
        expect(sequenceFor(id, count)).toHaveLength(count)
      }
    }
  })

  it('opens every sequence with the blueprint opening and ends on its close', () => {
    for (const id of ['inform', 'persuade', 'story'] as const) {
      const five = sequenceFor(id, 5)
      for (let count = 2; count <= 4; count++) {
        const seq = sequenceFor(id, count)
        expect(seq[0]).toEqual(five[0])
        expect(seq[seq.length - 1]).toEqual(five[five.length - 1])
      }
    }
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

    // For persuade blueprint: master roles + merged-row roles
    const persuadeLegalRoles = new Set([
      // Master roles
      'hook',
      'problem',
      'why-now',
      'solution',
      'how-it-works',
      'proof',
      'why-us',
      'offer',
      'handling',
      'cta',
      // Merged-row roles that only appear in columns
      'problem-why-now',
      'solution-how-it-works',
      'proof-why-us',
      'offer-handling',
      'offer-handling-cta',
    ])

    // For story blueprint: master roles + merged-row roles
    const storyLegalRoles = new Set([
      // Master roles
      'hook',
      'what-is',
      'complication',
      'journey',
      'insight',
      'what-could-be',
      'meaning',
      'proof',
      'cta',
      'closing-line',
      // Merged-row roles that only appear in columns
      'what-is-complication',
      'journey-insight',
      'what-could-be-meaning',
      'closing',
    ])

    for (const blueprint of Object.values(BLUEPRINTS)) {
      let legalRoles = new Set<string>()
      if (blueprint.id === 'inform') legalRoles = informLegalRoles
      else if (blueprint.id === 'persuade') legalRoles = persuadeLegalRoles
      else if (blueprint.id === 'story') legalRoles = storyLegalRoles

      for (const column of Object.values(blueprint.columns)) {
        for (const spec of column) {
          expect(legalRoles.has(spec.role)).toBe(true)
        }
      }
    }
  })
})

describe('sequenceMismatch', () => {
  it('returns null when the roles match the sequence', () => {
    const expected = sequenceFor('persuade', 6)
    const roles = expected.map((s) => s.role)
    expect(sequenceMismatch(expected, roles)).toBeNull()
  })

  it('reports a wrong count', () => {
    const expected = sequenceFor('persuade', 6)
    const message = sequenceMismatch(expected, ['hook', 'problem-why-now'])
    expect(message).toContain('6')
    expect(message).toContain('2')
  })

  it('reports the first role that diverges, with its position', () => {
    const expected = sequenceFor('persuade', 5)
    const roles = expected.map((s) => s.role)
    roles[2] = 'proof'
    const message = sequenceMismatch(expected, roles)
    expect(message).toContain('slide 3')
    expect(message).toContain('proof')
    expect(message).toContain('solution-how-it-works')
  })

  it('reports an unknown role rather than throwing', () => {
    const expected = sequenceFor('inform', 5)
    const roles: string[] = expected.map((s) => s.role)
    roles[0] = 'introduction'
    expect(sequenceMismatch(expected, roles)).toContain('introduction')
  })
})
