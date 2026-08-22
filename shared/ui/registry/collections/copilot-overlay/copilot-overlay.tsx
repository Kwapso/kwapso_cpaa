"use client"

// CopilotOverlay — the "someone took over the computer, step by step" affordance.
// A subtle, NON-blocking floating bar that narrates the current step while an
// agent drives the real app screens, with a "step N of M" indicator and a
// prominent Stop. Nothing is blocked except the Stop control (the bar is the only
// pointer-events target). An optional highlight ring is positioned over the
// element being acted on. Token-driven; respects reduced-motion.

import * as React from "react"
import { Square } from "lucide-react"

import { cn } from "../../../lib/utils"
import { Button } from "../../primitives/button/button"

export type CopilotStepStatus = "pending" | "active" | "done" | "failed"

export interface CopilotStep {
  label: string
  status?: CopilotStepStatus
}

export interface HighlightRect {
  top: number
  left: number
  width: number
  height: number
}

function CopilotOverlay({
  active,
  steps,
  currentIndex,
  onStop,
  position = "bottom",
  highlightRect,
  className,
}: {
  active: boolean
  steps: CopilotStep[]
  currentIndex: number
  onStop: () => void
  position?: "top" | "bottom"
  /** The host positions this over the element being acted on. */
  highlightRect?: HighlightRect
  className?: string
}) {
  if (!active) return null
  const current = steps[currentIndex]

  return (
    <>
      {highlightRect && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[60] rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background transition-all duration-300 motion-reduce:transition-none"
          style={{
            top: highlightRect.top,
            left: highlightRect.left,
            width: highlightRect.width,
            height: highlightRect.height,
          }}
        />
      )}

      {/* The wrapper ignores pointer events so the app stays usable; only the bar
          (and its Stop button) are interactive. */}
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 z-[61] flex justify-center px-4",
          position === "top" ? "top-4" : "bottom-4",
          className
        )}
      >
        <div
          role="status"
          aria-live="polite"
          className="glass pointer-events-auto flex max-w-xl items-center gap-3 rounded-full border py-2 pr-2 pl-4 shadow-lg"
        >
          <span className="relative flex size-2.5 shrink-0" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60 motion-reduce:hidden" />
            <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {current?.label ?? "Working…"}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              Step {Math.min(currentIndex + 1, steps.length)} of {steps.length}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={onStop}
            className="shrink-0 gap-1"
          >
            <Square className="size-3.5 fill-current" aria-hidden /> Stop
          </Button>
        </div>
      </div>
    </>
  )
}

export { CopilotOverlay }
