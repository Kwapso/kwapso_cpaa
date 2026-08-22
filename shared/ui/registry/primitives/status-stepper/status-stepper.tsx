"use client"

// StatusStepper — a left-to-right lifecycle stepper (e.g. Open -> In progress ->
// Resolved). Each stage carries a colour tone; stages up to and including the
// current one read as "reached" (filled with their tone), the current one is
// ringed ("you are here"), and later stages are muted. When `onChange` is given
// and it isn't `disabled`, clicking a stage changes the status. Token-driven,
// keyboard-operable, and it scrolls inside itself rather than widening the page.

import * as React from "react"
import { Check } from "lucide-react"

import { cn } from "../../../lib/utils"

/** A semantic colour per stage — maps to the same tokens the Badge uses. */
export type StepperTone = "neutral" | "info" | "warning" | "success" | "danger"

export interface StatusStage {
  value: string
  label: string
}

/** Solid fill for a reached stage. */
const toneSolid: Record<StepperTone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  info: "bg-primary text-primary-foreground",
  warning: "bg-warning text-warning-foreground",
  success: "bg-success text-success-foreground",
  danger: "bg-destructive text-destructive-foreground",
}

function StatusStepper({
  stages,
  value,
  tones,
  onChange,
  disabled = false,
  className,
}: {
  /** The lifecycle stages, in order, left to right. */
  stages: StatusStage[]
  /** The current stage's `value`. */
  value: string
  /** Optional colour tone per stage value (defaults to "neutral"). */
  tones?: Record<string, StepperTone>
  /** Fired with a stage's `value` when it's clicked. Omit for a read-only stepper. */
  onChange?: (value: string) => void
  /** Force a non-interactive, muted-interaction state. */
  disabled?: boolean
  className?: string
}) {
  const activeIndex = stages.findIndex((s) => s.value === value)
  const interactive = !disabled && typeof onChange === "function"

  return (
    // The horizontal scroll lives on the WRAPPER, not the <ol>. Per CSS, an
    // element with `overflow-x: auto` and a visible `overflow-y` computes the
    // y-axis to `auto` too — so a scrolling <ol> was a scroll box in BOTH axes
    // and clipped the active pill's ring-2 + ring-offset-2 (~4px outside the
    // pill). The wrapper scrolls; the <ol> keeps `overflow-visible` plus a
    // little padding, so the ring is never cut at any root font-size.
    //
    // THE PADDING IS ON BOTH AXES, and for a year it was on one. The fix above
    // was written looking at the top and bottom of the ring and shipped `py-1`,
    // which is the whole story only if the active stage is somewhere in the
    // middle. It never is, at the two moments that matter:
    //
    //   • FIRST stage active — every new story ("Open"), every fresh ticket. The
    //     ring's leading 4px sits at a negative offset, and a scroll container
    //     cannot be scrolled to a negative position, so it is simply gone.
    //   • LAST stage active — every finished thing ("Done", "Resolved"). A ring
    //     is a `box-shadow`, and per CSS Overflow a box-shadow contributes
    //     NOTHING to scrollable overflow, so the trailing 4px lies past the
    //     scroll width and cannot be reached either.
    //
    // Both ends, in other words, and only ever on the states people look at
    // most. `px-1` on the <ol> — not on the wrapper, whose inline-end padding a
    // scroll container is entitled to ignore — gives the ring the same 4px of
    // room sideways that it already had vertically.
    <div className={cn("w-full overflow-x-auto", className)}>
      <ol
        role="group"
        aria-label="Status"
        className="flex min-w-0 items-center gap-1 overflow-visible px-1 py-1"
      >
        {stages.map((stage, i) => {
          const reached = activeIndex >= 0 && i <= activeIndex
          const isActive = i === activeIndex
          const isPast = reached && !isActive
          const tone = tones?.[stage.value] ?? "neutral"

          return (
            <li key={stage.value} className="flex shrink-0 items-center">
              {i > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    "h-px w-4 shrink-0 sm:w-6",
                    reached ? "bg-foreground/30" : "bg-border"
                  )}
                />
              )}
              <button
                type="button"
                aria-current={isActive ? "step" : undefined}
                aria-label={`${stage.label}${isActive ? "(current)" : ""}`}
                disabled={!interactive}
                onClick={
                  interactive ? () => onChange?.(stage.value) : undefined
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors",
                  "   ",
                  reached ? toneSolid[tone] : "bg-muted text-muted-foreground",
                  isActive &&
                    "font-medium ring-2 ring-ring ring-offset-2 ring-offset-background",
                  interactive
                    ? "cursor-pointer hover:opacity-90"
                    : "cursor-default"
                )}
              >
                <span
                  aria-hidden
                  className="inline-flex size-4 items-center justify-center"
                >
                  {isPast ? (
                    <Check className="size-3.5" />
                  ) : (
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        isActive ? "bg-current" : "border border-current"
                      )}
                    />
                  )}
                </span>
                {stage.label}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export { StatusStepper }
