import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Draggable } from 'gsap/Draggable'
import { InertiaPlugin } from 'gsap/InertiaPlugin'
import Lenis from 'lenis'
import { ALL_CHAPTERS, CALLOUT_SLOTS, CHAPTERS } from './content'
import { FACE_ROTATIONS, arcCardPose, calloutPath } from './dieGeometry'

gsap.registerPlugin(ScrollTrigger, Draggable, InertiaPlugin)

const EASE_OUT = 'expo.out' // cubic-bezier(0.16,1,0.3,1), Durup's --ease-out-expo
const EASE_EXIT = 'power3.in'
const IDLE_SPIN = 24 // deg/s while the intro is on screen
const BASE_TILT = { x: -21, y: 31 } // a three-face view, like a product shot
const DESKTOP = '(min-width: 900px)'

/**
 * Boots the landing page's motion inside `root` and returns a teardown that
 * leaves nothing behind (React StrictMode mounts twice in dev).
 *
 * One render loop owns every die transform (anchor, tilt, spin, cube); GSAP
 * only tweens the numbers in `state`, so transforms never fight each other.
 */
export function initWelcomeMotion(root: HTMLElement): () => void {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s)!
  const $$ = <T extends Element = HTMLElement>(s: string) => [...root.querySelectorAll<T>(s)]

  const anchor = $('.lw-die-anchor')
  const tilt = $('.lw-die-tilt')
  const spin = $('.lw-die-spin')
  const cube = $('.lw-die-cube')
  const pillTag = $('.lw-pill-tag')
  const clock = $('.lw-clock-time')
  const lineGroups = $$<SVGGElement>('.lw-callout-line')
  const captions = $$('.lw-callout')

  document.documentElement.classList.add('lw-html')

  const state = {
    t: 0,
    spin: 0,
    spinning: !reduce,
    x: FACE_ROTATIONS[1].x,
    y: FACE_ROTATIONS[1].y,
    bonusX: 0,
    bonusY: 0,
    tiltX: 0,
    tiltY: 0,
    lift: 0, // desktop: die shrinks and fades while the theme strip passes
    dock: 0, // phones: die parks in the top-right corner after the intro
  }

  /* ---------------- Smooth scroll ---------------- */
  let lenis: Lenis | null = null
  const raf = (time: number) => lenis?.raf(time * 1000)
  if (!reduce) {
    lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 1 })
    lenis.on('scroll', () => ScrollTrigger.update())
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)
  }

  const onAnchorClick = (e: MouseEvent) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]')
    if (!a || !root.contains(a)) return
    const target = root.querySelector<HTMLElement>(a.getAttribute('href')!)
    if (!target) return
    e.preventDefault()
    if (lenis) lenis.scrollTo(target, { duration: 1.4 })
    else target.scrollIntoView()
    target.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
  }
  root.addEventListener('click', onAnchorClick)

  /* ---------------- Render loop ---------------- */
  const render = (_time: number, deltaMs: number) => {
    const dt = Math.min(deltaMs, 64) / 1000
    if (!reduce) state.t += dt
    if (state.spinning) state.spin += IDLE_SPIN * dt

    const vh = innerHeight
    const size = anchor.offsetWidth || 1
    // docked: a 34px die in the middle of the phone bar (its centre is 30px down)
    const dockScale = 1 - state.dock * (1 - 34 / size)
    const scale = (1 - 0.5 * state.lift) * dockScale
    const dy = -state.lift * vh * 0.06 + state.dock * (-vh / 2 + 30)
    anchor.style.transform = `translate3d(0, ${dy}px, 0) scale(${scale})`
    anchor.style.opacity = String(1 - state.lift)
    anchor.style.visibility = state.lift > 0.99 ? 'hidden' : ''

    const bob = Math.sin(state.t * 1.1) * 6
    const wobble = Math.sin(state.t * 0.7) * 3
    tilt.style.transform = `translateY(${bob}px) rotateX(${BASE_TILT.x + state.tiltX + wobble}deg) rotateY(${BASE_TILT.y + state.tiltY}deg)`
    spin.style.transform = `rotateY(${state.spin}deg)`
    cube.style.transform = `rotateX(${state.x + state.bonusX}deg) rotateY(${state.y + state.bonusY}deg)`
  }
  gsap.ticker.add(render)

  /* ---------------- Clock (SUTÉRA's local-time HUD) ---------------- */
  const tick = () => {
    clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  tick()
  const clockTimer = window.setInterval(tick, 15_000)

  /* ---------------- Click the die: one extra tumble ---------------- */
  const roll = () => {
    if (reduce) return
    gsap.to(state, { bonusX: '+=360', bonusY: '+=360', duration: 1.6, ease: EASE_OUT })
  }
  const dieButton = $('.lw-die')
  dieButton.addEventListener('click', roll)

  /* ---------------- Callouts ---------------- */
  let showCallouts = false
  let current = -1
  let calloutTl: gsap.core.Timeline | null = null

  function layoutCallouts() {
    const rect = anchor.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const half = rect.width / 2
    CALLOUT_SLOTS.forEach((slot, i) => {
      // keep every caption inside the viewport's right margin
      const reach = Math.min(slot.reach, (innerWidth - 32 - cx - slot.ax * half) / half + slot.ax)
      const p = calloutPath({ ...slot, reach }, cx, cy, half)
      const g = lineGroups[i]
      g.querySelector('path')!.setAttribute('d', p.d)
      const [box, dot] = g.querySelectorAll('rect')
      box.setAttribute('x', String(p.node.x - 7))
      box.setAttribute('y', String(p.node.y - 7))
      dot.setAttribute('x', String(p.node.x - 3))
      dot.setAttribute('y', String(p.node.y - 3))
      const cap = captions[i]
      cap.style.left = `${p.label.x}px`
      cap.style.bottom = `${innerHeight - p.label.y + 8}px`
      cap.style.width = `${Math.max(p.label.width, 140)}px`
    })
  }

  function fillCallouts(index: number) {
    const callouts = ALL_CHAPTERS[index].callouts
    captions.forEach((cap, i) => {
      cap.querySelector('.lw-callout-k')!.textContent = callouts[i]?.k ?? ''
      cap.querySelector('.lw-callout-t')!.textContent = callouts[i]?.t ?? ''
    })
    return callouts.length
  }

  function showCalloutsFor(index: number) {
    calloutTl?.kill()
    const paths = lineGroups.map((g) => g.querySelector('path')!)
    const boxes = lineGroups.map((g) => [...g.querySelectorAll('rect')])
    if (!showCallouts) {
      gsap.set([...captions, ...boxes.flat()], { autoAlpha: 0 })
      gsap.set(paths, { strokeDashoffset: 1 })
      return
    }
    if (reduce) {
      const n = fillCallouts(index)
      captions.forEach((cap, i) => gsap.set([cap, ...boxes[i]], { autoAlpha: i < n ? 1 : 0, y: 0 }))
      paths.forEach((p, i) => gsap.set(p, { strokeDashoffset: i < n ? 0 : 1 }))
      return
    }
    // exits are faster than entrances: 0.25s out, 0.7s in
    calloutTl = gsap
      .timeline()
      .to(captions, { autoAlpha: 0, y: 6, duration: 0.2, ease: EASE_EXIT, stagger: 0.03 }, 0)
      .to(paths, { strokeDashoffset: 1, duration: 0.25, ease: EASE_EXIT }, 0)
      .to(boxes.flat(), { autoAlpha: 0, duration: 0.15 }, 0.1)
      .add(() => {
        const n = fillCallouts(index)
        const live = (i: number) => i < n
        gsap
          .timeline()
          .to(boxes.filter((_, i) => live(i)).flat(), { autoAlpha: 1, duration: 0.25, stagger: 0.06 }, 0)
          .to(paths.filter((_, i) => live(i)), { strokeDashoffset: 0, duration: 0.7, ease: EASE_OUT, stagger: 0.08 }, 0.08)
          .fromTo(
            captions.filter((_, i) => live(i)),
            { autoAlpha: 0, y: 10 },
            { autoAlpha: 1, y: 0, duration: 0.55, ease: 'power4.out', stagger: 0.08 },
            0.35,
          )
      })
  }

  function setChapter(index: number) {
    if (index === current) return
    current = index
    pillTag.textContent = ALL_CHAPTERS[index].tag
    showCalloutsFor(index)
    if (reduce) {
      const face = ALL_CHAPTERS[index].face ?? 1
      state.x = FACE_ROTATIONS[face].x
      state.y = FACE_ROTATIONS[face].y
      render(0, 0)
    }
  }

  /* ---------------- Scroll choreography ---------------- */
  let killStrip = () => {}
  let mm: gsap.MatchMedia | null = null
  const ctx = gsap.context(() => {
    const sections = $$('[data-chapter]')
    sections.forEach((section) => {
      const index = Number(section.dataset.chapter)
      ScrollTrigger.create({
        trigger: section,
        start: 'top 55%',
        end: 'bottom 55%',
        onToggle: (self) => self.isActive && setChapter(index),
      })
    })

    // The intro spins freely; leaving it, the die eases to the next full turn (face 1).
    ScrollTrigger.create({
      trigger: '#intro',
      start: 'top top',
      end: 'bottom 55%',
      onLeave: () => {
        state.spinning = false
        gsap.to(state, { spin: Math.ceil(state.spin / 360) * 360, duration: 1.1, ease: 'power2.out', overwrite: 'auto' })
      },
      onEnterBack: () => {
        if (!reduce) state.spinning = true
      },
    })

    if (!reduce) {
      // Roll face to face. Each tumble straddles the chapter boundary (from 80%
      // of one chapter to 20% into the next), so the new face lands as its
      // chapter's text and callouts arrive.
      const faceSections = CHAPTERS.map((c) => root.querySelector<HTMLElement>(`#${c.id}`)!)
      const tops = faceSections.map((s) => s.offsetTop - faceSections[0].offsetTop)
      const lens = tops.slice(1).map((t, i) => t - tops[i])
      const total = tops[tops.length - 1] + 0.2 * lens[lens.length - 1]
      const tl = gsap.timeline({
        defaults: { ease: 'power2.inOut' },
        scrollTrigger: { trigger: faceSections[0], start: 'top 55%', end: `+=${total}`, scrub: 0.6 },
      })
      tl.set({}, {}, total) // pin the timeline's length to the scroll distance
      lens.forEach((len, i) => {
        const face = CHAPTERS[i + 1].face!
        tl.to(state, { x: FACE_ROTATIONS[face].x, y: FACE_ROTATIONS[face].y, duration: 0.4 * len }, tops[i] + 0.8 * len)
      })
    }

    mm = gsap.matchMedia()
    mm.add({ desktop: DESKTOP, phone: `not all and ${DESKTOP}` }, (c) => {
      const { desktop } = c.conditions as { desktop: boolean }
      showCallouts = desktop
      state.lift = 0
      state.dock = 0
      layoutCallouts()
      const replay = current
      current = -1
      setChapter(Math.max(replay, 0))

      if (desktop) {
        const strip = root.querySelector<HTMLElement>('.lw-strip')
        if (strip) {
          // the strip runs full width, so the die steps aside: it shrinks and
          // fades as the strip arrives and returns once it has passed
          ScrollTrigger.create({
            trigger: strip,
            start: 'top bottom',
            end: 'bottom top',
            onUpdate: () => {
              const r = strip.getBoundingClientRect()
              const vh = innerHeight
              const arrive = gsap.utils.clamp(0, 1, (0.9 * vh - r.top) / (0.3 * vh))
              const leave = gsap.utils.clamp(0, 1, (r.bottom - 0.1 * vh) / (0.3 * vh))
              const v = Math.min(arrive, leave)
              state.lift = reduce ? (v > 0.5 ? 1 : 0) : v * v * (3 - 2 * v)
              if (reduce) render(0, 0)
            },
            onLeave: () => (state.lift = 0),
            onLeaveBack: () => (state.lift = 0),
          })
        }
        const onMove = (e: PointerEvent) => {
          toX((e.clientY / innerHeight - 0.5) * -14)
          toY((e.clientX / innerWidth - 0.5) * 22)
        }
        const toX = gsap.quickTo(state, 'tiltX', { duration: 0.9, ease: 'power3.out' })
        const toY = gsap.quickTo(state, 'tiltY', { duration: 0.9, ease: 'power3.out' })
        const fine = matchMedia('(hover: hover) and (pointer: fine)').matches
        if (fine && !reduce) window.addEventListener('pointermove', onMove)
        window.addEventListener('resize', layoutCallouts)
        return () => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('resize', layoutCallouts)
        }
      }

      // phones: no pins, the die simply parks in the corner as the intro scrolls away
      ScrollTrigger.create({
        trigger: '#intro',
        start: 'top top',
        end: 'bottom 30%',
        onUpdate: (self) => {
          state.dock = reduce ? (self.progress > 0.5 ? 1 : 0) : self.progress
          if (reduce) render(0, 0)
        },
      })
      return undefined
    })

    killStrip = initThemeStrip(root, reduce)
  }, root)

  render(0, 0)
  ScrollTrigger.refresh()
  void document.fonts.ready.then(() => ScrollTrigger.refresh())

  return () => {
    window.clearInterval(clockTimer)
    root.removeEventListener('click', onAnchorClick)
    dieButton.removeEventListener('click', roll)
    calloutTl?.kill()
    killStrip()
    mm?.revert()
    ctx.revert()
    gsap.ticker.remove(render)
    gsap.ticker.remove(raf)
    lenis?.destroy()
    gsap.killTweensOf(state)
    document.documentElement.classList.remove('lw-html')
  }
}

/** Codapress's arc strip: drag or throw it, and every card re-tilts on the arc as it moves. */
function initThemeStrip(root: HTMLElement, reduce: boolean): () => void {
  const viewport = root.querySelector<HTMLElement>('.lw-strip-viewport')
  const track = root.querySelector<HTMLElement>('.lw-strip-track')
  if (!viewport || !track) return () => {}
  const cards = [...track.querySelectorAll<HTMLElement>('.lw-theme')]
  const trackX = () => gsap.getProperty(track, 'x') as number

  // from layout offsets, not rects: a rect already includes the card's own tilt
  const pose = () => {
    const origin = viewport.getBoundingClientRect().left + trackX()
    for (const card of cards) {
      const { rotation, y } = arcCardPose(origin + card.offsetLeft + card.offsetWidth / 2, innerWidth)
      gsap.set(card, { rotation, y, transformOrigin: '50% 100%' })
    }
  }

  const bounds = () => ({ minX: Math.min(0, viewport.clientWidth - track.scrollWidth - 24), maxX: 24 })
  const clampX = (x: number) => gsap.utils.clamp(bounds().minX, bounds().maxX, x)
  const step = () => (cards[1]?.offsetLeft ?? 0) - (cards[0]?.offsetLeft ?? 0)
  const centreOn = (card: HTMLElement) => clampX(viewport.clientWidth / 2 - (card.offsetLeft + card.offsetWidth / 2))

  // start with the middle card centred
  gsap.set(track, { x: centreOn(cards[Math.floor(cards.length / 2)]) })
  pose()

  const [drag] = Draggable.create(track, {
    type: 'x',
    bounds: bounds(),
    inertia: !reduce,
    edgeResistance: 0.85,
    onDrag: pose,
    onThrowUpdate: pose,
    onPress() {
      this.applyBounds(bounds())
    },
  })

  const glide = (x: number) =>
    gsap.to(track, { x, duration: reduce ? 0 : 0.7, ease: EASE_OUT, overwrite: true, onUpdate: pose, onComplete: () => void drag.update() })

  const onButton = (e: Event) => glide(clampX(trackX() - Number((e.currentTarget as HTMLElement).dataset.step) * step()))
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    glide(clampX(trackX() - (e.key === 'ArrowRight' ? 1 : -1) * step()))
  }
  // a card focused by Tab slides to the centre
  const onFocus = (e: FocusEvent) => {
    const card = (e.target as Element).closest<HTMLElement>('.lw-theme')
    if (card) glide(centreOn(card))
  }
  const onResize = () => {
    drag.applyBounds(bounds())
    pose()
  }

  const buttons = [...root.querySelectorAll<HTMLButtonElement>('.lw-strip-btn')]
  buttons.forEach((b) => b.addEventListener('click', onButton))
  viewport.addEventListener('keydown', onKey)
  track.addEventListener('focusin', onFocus)
  window.addEventListener('resize', onResize)
  return () => {
    buttons.forEach((b) => b.removeEventListener('click', onButton))
    viewport.removeEventListener('keydown', onKey)
    track.removeEventListener('focusin', onFocus)
    window.removeEventListener('resize', onResize)
    drag.kill()
    gsap.set([track, ...cards], { clearProps: 'transform' })
  }
}
