import { useCallback, useEffect, useState } from 'react'
import { pruneLaser, pushLaser, type LaserPoint } from '@/present/liveInk'

/** How often a trail that is not moving is thinned, so it fades out behind a still dot. */
const PRUNE_EVERY_MS = 50

/** A laser trail that fades on its own: `move` adds a point, or clears it with `null`. */
export function useLaserTrail(): [LaserPoint[], (point: [number, number] | null) => void] {
  const [trail, setTrail] = useState<LaserPoint[]>([])
  const move = useCallback((point: [number, number] | null) => {
    setTrail((t) => pushLaser(t, point, Date.now()))
  }, [])
  const fading = trail.length > 1
  useEffect(() => {
    if (!fading) return
    const timer = window.setInterval(() => {
      setTrail((t) => {
        const next = pruneLaser(t, Date.now())
        return next.length === t.length ? t : next
      })
    }, PRUNE_EVERY_MS)
    return () => window.clearInterval(timer)
  }, [fading])
  return [trail, move]
}
