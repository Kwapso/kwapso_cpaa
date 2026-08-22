"use client"

// Stopwatch — a start / pause / reset timer that shows elapsed mm:ss.cs.

import * as React from "react"
import { Pause, Play, RotateCcw } from "lucide-react"

import { cn } from "../../../lib/utils"
import { Button } from "../button/button"

function format(ms: number) {
  const total = Math.floor(ms)
  const m = Math.floor(total / 60000)
  const s = Math.floor((total % 60000) / 1000)
  const cs = Math.floor((total % 1000) / 10)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(m)}:${pad(s)}.${pad(cs)}`
}

function Stopwatch({ className }: { className?: string }) {
  const [ms, setMs] = React.useState(0)
  const [running, setRunning] = React.useState(false)
  const raf = React.useRef<number | null>(null)
  const last = React.useRef(0)

  React.useEffect(() => {
    if (!running) return
    last.current = performance.now()
    const tick = (now: number) => {
      setMs((m) => m + (now - last.current))
      last.current = now
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [running])

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="text-2xl font-semibold tabular-nums">{format(ms)}</span>
      <Button
        size="icon"
        variant="outline"
        onClick={() => setRunning((r) => !r)}
        aria-label={running ? "Pause" : "Start"}
      >
        {running ? <Pause /> : <Play />}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => {
          setRunning(false)
          setMs(0)
        }}
        aria-label="Reset"
      >
        <RotateCcw />
      </Button>
    </div>
  )
}

export { Stopwatch }
