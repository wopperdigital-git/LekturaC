import { describe, expect, it } from 'vitest'
import { FACE_ROTATIONS, FACE_TRANSFORMS, PIP_CELLS, arcCardPose, calloutPath, type FaceNumber } from './dieGeometry'

type Vec = [number, number, number]
const rad = (deg: number) => (deg * Math.PI) / 180

// CSS rotation matrices (y points down), applied to a column vector.
const rotX = (deg: number, [x, y, z]: Vec): Vec => {
  const c = Math.cos(rad(deg)), s = Math.sin(rad(deg))
  return [x, c * y - s * z, s * y + c * z]
}
const rotY = (deg: number, [x, y, z]: Vec): Vec => {
  const c = Math.cos(rad(deg)), s = Math.sin(rad(deg))
  return [c * x + s * z, y, -s * x + c * z]
}

/** The outward normal of a face placed with FACE_TRANSFORMS + translateZ. */
function faceNormal(face: FaceNumber): Vec {
  const m = /rotate([XY])\((-?\d+)deg\)/.exec(FACE_TRANSFORMS[face])!
  const deg = Number(m[2])
  return m[1] === 'X' ? rotX(deg, [0, 0, 1]) : rotY(deg, [0, 0, 1])
}

const faces: FaceNumber[] = [1, 2, 3, 4, 5, 6]

describe('die faces', () => {
  it.each(faces)('rotation for face %i brings that face to the front', (face) => {
    const { x, y } = FACE_ROTATIONS[face]
    // transform: rotateX(x) rotateY(y) → the rightmost function applies first
    const [nx, ny, nz] = rotX(x, rotY(y, faceNormal(face)))
    expect(nx).toBeCloseTo(0)
    expect(ny).toBeCloseTo(0)
    expect(nz).toBeCloseTo(1)
  })

  it('opposite faces sum to seven', () => {
    for (const a of faces) {
      const [ax, ay, az] = faceNormal(a)
      const opposite = faces.find((b) => {
        const [bx, by, bz] = faceNormal(b)
        return Math.abs(ax + bx) + Math.abs(ay + by) + Math.abs(az + bz) < 1e-9
      })
      expect((opposite ?? 0) + a).toBe(7)
    }
  })

  it('each face carries its own number of pips', () => {
    for (const face of faces) expect(PIP_CELLS[face]).toHaveLength(face)
  })
})

describe('calloutPath', () => {
  it('runs out, jogs 45° and ends on a caption that spans the last run', () => {
    const p = calloutPath({ ax: 1, ay: 0, dir: 1, rise: -0.5, reach: 2 }, 500, 400, 100)
    expect(p.node).toEqual({ x: 600, y: 400 })
    expect(p.d).toBe('M600 400H622L672 350H800')
    expect(p.label).toEqual({ x: 672, y: 350, width: 128 })
  })

  it('mirrors for a leftward slot, with the caption box starting at the far end', () => {
    const p = calloutPath({ ax: -1, ay: 0, dir: -1, rise: 0.5, reach: 2 }, 500, 400, 100)
    expect(p.d).toBe('M400 400H378L328 450H200')
    expect(p.label).toEqual({ x: 200, y: 450, width: 128 })
  })

  it('never lets the last run collapse below 24px', () => {
    const p = calloutPath({ ax: 0, ay: 0, dir: 1, rise: -1, reach: 0 }, 0, 0, 100)
    expect(p.label.width).toBe(24)
  })
})

describe('arcCardPose', () => {
  it('is flat at the centre, tilts and drops symmetrically off-centre, and clamps', () => {
    expect(arcCardPose(500, 1000)).toEqual({ rotation: 0, y: 0 })
    expect(arcCardPose(1000, 1000)).toEqual({ rotation: 7, y: 46 })
    expect(arcCardPose(0, 1000)).toEqual({ rotation: -7, y: 46 })
    expect(arcCardPose(99999, 1000)).toEqual(arcCardPose(1300, 1000))
  })
})
