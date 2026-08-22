"use client"

// AmbientBackground — the slow, brand-tinted glow behind the whole page. Purely
// decorative: it sits under the content and never takes a pointer event. The
// animation is disabled under prefers-reduced-motion in styles.css.

import * as React from "react"

/**
 * AmbientBackground — a fixed, ultra-subtle field of blurred token-colored
 * light that drifts on its own and blooms softly toward pointer interaction
 * (move = faint follow-glow, tap = a gentle bloom). It gives the glass
 * surfaces something alive to refract. Mount once near the app root.
 *
 * pointer-events-none, GPU-cheap (one rAF loop writing two CSS vars),
 * token-driven, and disabled under prefers-reduced-motion. See `.ambient`
 * in app/globals.css for the visual layer.
 */
export function AmbientBackground() {
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    let targetX = 50
    let targetY = 38
    let x = 50
    let y = 38
    let bloom = 0
    let raf = 0

    const onMove = (e: PointerEvent) => {
      targetX = (e.clientX / window.innerWidth) * 100
      targetY = (e.clientY / window.innerHeight) * 100
      bloom = Math.min(1, bloom + 0.05)
    }
    const onDown = () => {
      bloom = 1
    }
    const tick = () => {
      x += (targetX - x) * 0.05
      y += (targetY - y) * 0.05
      bloom += (0 - bloom) * 0.03
      el.style.setProperty("--mx", `${x.toFixed(2)}%`)
      el.style.setProperty("--my", `${y.toFixed(2)}%`)
      el.style.setProperty("--bloom", bloom.toFixed(3))
      raf = requestAnimationFrame(tick)
    }

    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("pointerdown", onDown, { passive: true })
    raf = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerdown", onDown)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div
      ref={ref}
      aria-hidden
      className="ambient pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    />
  )
}
