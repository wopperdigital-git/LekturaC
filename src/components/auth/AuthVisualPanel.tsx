import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

/** Star tints, straight from the palette: background, primary, accent, secondary. */
const STAR_COLORS = ['250,244,251', '159,80,195', '150,203,103', '218,206,149']

/** One star per this many px² of panel, clamped — keeps density even across screen sizes. */
const AREA_PER_STAR = 14000
const MIN_STARS = 40
const MAX_STARS = 90

const PARALLAX_RANGE = 16
/** Stars closer than this (px) get joined by a line. */
const LINK_DISTANCE = 120
/** Pointer influence radius (px) for the push + highlight. */
const POINTER_RADIUS = 150
const POINTER_PUSH = 0.55
/** Spring constant and damping pulling each star back to its resting spot. */
const SPRING = 0.012
const DAMPING = 0.92
const RIPPLE_SPEED = 0.42
const RIPPLE_WIDTH = 70
const RIPPLE_MAX_RADIUS = 620

interface Star {
  /** resting position, normalized 0..1 so resizes are free */
  x: number
  y: number
  /** live displacement from rest, in px */
  ox: number
  oy: number
  vx: number
  vy: number
  radius: number
  color: string
  baseAlpha: number
  twinkleSpeed: number
  twinklePhase: number
  driftX: number
  /** 0.4..1 — nearer stars parallax and react further */
  depth: number
}

interface Ripple {
  x: number
  y: number
  /** ms timestamp of the click that spawned it */
  start: number
}

function createStars(count: number): Star[] {
  const stars: Star[] = []
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random(),
      y: Math.random(),
      ox: 0,
      oy: 0,
      vx: 0,
      vy: 0,
      radius: Math.random() * 1.4 + 0.5,
      color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
      baseAlpha: Math.random() * 0.5 + 0.35,
      twinkleSpeed: (Math.random() * 0.6 + 0.2) / 1000,
      twinklePhase: Math.random() * Math.PI * 2,
      driftX: (Math.random() * 0.3 + 0.1) / 100000,
      depth: Math.random() * 0.6 + 0.4,
    })
  }
  return stars
}

/**
 * Decorative panel for the auth screens: an interactive constellation field.
 *
 * Interactions — pointer parallax, a cursor that pushes and links to nearby
 * stars, and a click shockwave that ripples through the field before the
 * springs pull everything home.
 *
 * Kept cheap on purpose so it never costs a device its frame budget:
 * - one 2D canvas, no per-frame allocation, star count scaled to panel area
 * - the O(n²) neighbour pass is bounded by MAX_STARS (~4k cheap distance checks)
 * - gradient blobs animate `transform`/`opacity` only, so they stay on the compositor
 * - the rAF loop stops entirely while the tab is hidden
 * - `prefers-reduced-motion: reduce` paints one static frame and never loops
 */
export function AuthVisualPanel({ children }: { children?: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let stars: Star[] = []
    let width = 0
    let height = 0
    let frame = 0
    let running = true

    let targetX = 0
    let targetY = 0
    let currentX = 0
    let currentY = 0

    // pointer position in canvas space; null while the pointer is elsewhere
    let pointerX: number | null = null
    let pointerY: number | null = null

    let ripples: Ripple[] = []

    function resize() {
      if (!canvas || !container || !ctx) return
      const rect = container.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const target = Math.round(
        Math.min(MAX_STARS, Math.max(MIN_STARS, (width * height) / AREA_PER_STAR)),
      )
      if (target !== stars.length) stars = createStars(target)
    }

    function step(elapsed: number) {
      for (const star of stars) {
        // spring the star back toward its resting position
        star.vx += -star.ox * SPRING
        star.vy += -star.oy * SPRING

        if (pointerX !== null && pointerY !== null) {
          const px = star.x * width + star.ox - pointerX
          const py = star.y * height + star.oy - pointerY
          const distSq = px * px + py * py
          if (distSq < POINTER_RADIUS * POINTER_RADIUS && distSq > 0.01) {
            const dist = Math.sqrt(distSq)
            const force = (1 - dist / POINTER_RADIUS) * POINTER_PUSH * star.depth
            star.vx += (px / dist) * force
            star.vy += (py / dist) * force
          }
        }

        for (const ripple of ripples) {
          const age = elapsed - ripple.start
          const ringRadius = age * RIPPLE_SPEED
          const px = star.x * width + star.ox - ripple.x
          const py = star.y * height + star.oy - ripple.y
          const dist = Math.sqrt(px * px + py * py)
          const offset = Math.abs(dist - ringRadius)
          if (offset < RIPPLE_WIDTH && dist > 0.01) {
            // impulse fades as the ring expands outward
            const falloff = (1 - offset / RIPPLE_WIDTH) * (1 - ringRadius / RIPPLE_MAX_RADIUS)
            const force = falloff * 1.9 * star.depth
            star.vx += (px / dist) * force
            star.vy += (py / dist) * force
          }
        }

        star.vx *= DAMPING
        star.vy *= DAMPING
        star.ox += star.vx
        star.oy += star.vy
      }

      ripples = ripples.filter((r) => (elapsed - r.start) * RIPPLE_SPEED < RIPPLE_MAX_RADIUS)
    }

    function draw(elapsed: number) {
      if (!ctx) return
      ctx.clearRect(0, 0, width, height)

      // resolve every star's on-screen position once, then reuse for links + dots
      const positions: { x: number; y: number; star: Star }[] = []
      for (const star of stars) {
        const drift = reduceMotion ? 0 : (elapsed * star.driftX) % 1
        positions.push({
          x: ((star.x + drift) % 1) * width + star.ox + currentX * star.depth,
          y: star.y * height + star.oy + currentY * star.depth,
          star,
        })
      }

      // constellation links between near neighbours
      ctx.lineWidth = 0.6
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const dx = positions[i].x - positions[j].x
          const dy = positions[i].y - positions[j].y
          const distSq = dx * dx + dy * dy
          if (distSq > LINK_DISTANCE * LINK_DISTANCE) continue
          const alpha = (1 - Math.sqrt(distSq) / LINK_DISTANCE) * 0.22
          ctx.strokeStyle = `rgba(159,80,195,${alpha})`
          ctx.beginPath()
          ctx.moveTo(positions[i].x, positions[i].y)
          ctx.lineTo(positions[j].x, positions[j].y)
          ctx.stroke()
        }
      }

      // links from the cursor to whatever is near it
      if (pointerX !== null && pointerY !== null) {
        for (const p of positions) {
          const dx = p.x - pointerX
          const dy = p.y - pointerY
          const distSq = dx * dx + dy * dy
          if (distSq > POINTER_RADIUS * POINTER_RADIUS) continue
          const alpha = (1 - Math.sqrt(distSq) / POINTER_RADIUS) * 0.4
          ctx.strokeStyle = `rgba(150,203,103,${alpha})`
          ctx.beginPath()
          ctx.moveTo(pointerX, pointerY)
          ctx.lineTo(p.x, p.y)
          ctx.stroke()
        }
      }

      for (const { x, y, star } of positions) {
        const twinkle = reduceMotion
          ? 1
          : 0.65 + 0.35 * Math.sin(elapsed * star.twinkleSpeed + star.twinklePhase)

        // stars near the cursor brighten and swell slightly
        let boost = 0
        if (pointerX !== null && pointerY !== null) {
          const dx = x - pointerX
          const dy = y - pointerY
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < POINTER_RADIUS) boost = 1 - dist / POINTER_RADIUS
        }

        ctx.globalAlpha = Math.min(1, star.baseAlpha * twinkle + boost * 0.5)
        ctx.fillStyle = `rgb(${star.color})`
        ctx.beginPath()
        ctx.arc(x, y, star.radius * (1 + boost * 0.8), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    function loop(now: number) {
      if (!running) return
      currentX += (targetX - currentX) * 0.05
      currentY += (targetY - currentY) * 0.05
      step(now)
      draw(now)
      frame = requestAnimationFrame(loop)
    }

    function handlePointerMove(e: PointerEvent) {
      if (reduceMotion || !container) return
      const rect = container.getBoundingClientRect()
      targetX = ((e.clientX - rect.left) / rect.width - 0.5) * -PARALLAX_RANGE
      targetY = ((e.clientY - rect.top) / rect.height - 0.5) * -PARALLAX_RANGE

      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      pointerX = inside ? e.clientX - rect.left : null
      pointerY = inside ? e.clientY - rect.top : null
    }

    function handlePointerDown(e: PointerEvent) {
      if (reduceMotion || !container) return
      const rect = container.getBoundingClientRect()
      ripples.push({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        start: performance.now(),
      })
      // never let a mash of clicks stack up unbounded
      if (ripples.length > 4) ripples.shift()
    }

    function handlePointerLeave() {
      pointerX = null
      pointerY = null
    }

    function handleVisibility() {
      if (reduceMotion) return
      if (document.hidden) {
        running = false
        cancelAnimationFrame(frame)
      } else if (!running) {
        running = true
        frame = requestAnimationFrame(loop)
      }
    }

    resize()

    const observer = new ResizeObserver(() => {
      resize()
      if (reduceMotion) draw(0)
    })
    observer.observe(container)

    if (reduceMotion) {
      draw(0)
    } else {
      frame = requestAnimationFrame(loop)
      window.addEventListener('pointermove', handlePointerMove)
      container.addEventListener('pointerdown', handlePointerDown)
      container.addEventListener('pointerleave', handlePointerLeave)
      document.addEventListener('visibilitychange', handleVisibility)
    }

    return () => {
      running = false
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('pointermove', handlePointerMove)
      container.removeEventListener('pointerdown', handlePointerDown)
      container.removeEventListener('pointerleave', handlePointerLeave)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative isolate hidden overflow-hidden bg-[#13091b] lg:flex lg:flex-col"
    >
      {/* soft gradient blobs — transform/opacity only, so they stay off the layout path */}
      <div
        aria-hidden="true"
        className="auth-blob absolute -top-32 -left-24 size-[32rem] rounded-full opacity-60 blur-3xl"
        style={{ background: 'radial-gradient(circle, #9f50c3 0%, transparent 68%)' }}
      />
      <div
        aria-hidden="true"
        className="auth-blob auth-blob-delayed absolute -right-28 bottom-[-8rem] size-[28rem] rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, #96cb67 0%, transparent 70%)' }}
      />
      <div
        aria-hidden="true"
        className="auth-blob auth-blob-slow absolute top-1/3 right-1/4 size-[22rem] rounded-full opacity-25 blur-3xl"
        style={{ background: 'radial-gradient(circle, #dace95 0%, transparent 72%)' }}
      />

      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0" />

      {/* keeps text legible over whatever the blobs are doing underneath */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-[#13091b] via-transparent to-transparent"
      />

      <div className="pointer-events-none relative z-10 flex h-full flex-col justify-between p-12">
        {children}
      </div>
    </div>
  )
}
