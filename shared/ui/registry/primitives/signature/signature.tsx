"use client"

// Signature — a canvas pad to draw a signature with a mouse/finger/stylus.
// Calls onChange with a PNG data URL (or null when cleared).

import * as React from "react"
import { Eraser } from "lucide-react"

import { cn } from "../../../lib/utils"
import { Button } from "../button/button"

function Signature({
  onChange,
  required = false,
  className,
}: {
  onChange?: (dataUrl: string | null) => void
  /** Draw the animated teal required-ring around the canvas (only). */
  required?: boolean
  className?: string
}) {
  const ref = React.useRef<HTMLCanvasElement>(null)
  const drawing = React.useRef(false)

  function point(e: React.PointerEvent) {
    const c = ref.current!
    const r = c.getBoundingClientRect()
    return {
      x: (e.clientX - r.left) * (c.width / r.width),
      y: (e.clientY - r.top) * (c.height / r.height),
    }
  }
  function start(e: React.PointerEvent) {
    drawing.current = true
    // capture the pointer so a fast stroke that briefly leaves the canvas keeps
    // drawing instead of silently ending.
    e.currentTarget.setPointerCapture(e.pointerId)
    const ctx = ref.current!.getContext("2d")!
    const p = point(e)
    const color = getComputedStyle(ref.current!).color
    // a single tap should leave a dot — draw one immediately.
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(p.x, p.y, 1, 0, Math.PI * 2)
    ctx.fill()
    // then begin the stroke path from the same point.
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return
    const ctx = ref.current!.getContext("2d")!
    const p = point(e)
    ctx.strokeStyle = getComputedStyle(ref.current!).color
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }
  function end() {
    if (!drawing.current) return
    drawing.current = false
    onChange?.(ref.current!.toDataURL())
  }
  function clear() {
    const c = ref.current!
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height)
    onChange?.(null)
  }

  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      {/* the ring hugs just the canvas, not the Clear button below it */}
      <div className={cn("rounded-xl", required && "required-ring")}>
        <canvas
          ref={ref}
          width={480}
          height={180}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          className="w-full touch-none rounded-xl border bg-card text-foreground"
        />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={clear}
        className="w-fit"
      >
        <Eraser /> Clear
      </Button>
    </div>
  )
}

export { Signature }
