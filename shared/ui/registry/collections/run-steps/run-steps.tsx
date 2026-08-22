"use client"

// RunSteps — a vertical step list for a multi-step agent job (the not-click-by-
// click kind), each step with a status (pending / running / done / failed) and an
// optional detail line, plus a Stop control. Flat, token-driven, dark-mode.

import * as React from "react"
import { Check, Circle, Loader2, X } from "lucide-react"

import { cn } from "../../../lib/utils"
import { Button } from "../../primitives/button/button"

export type RunStepStatus = "pending" | "running" | "done" | "failed"

export interface RunStep {
  label: string
  status: RunStepStatus
  detail?: React.ReactNode
}

function StepIcon({ status }: { status: RunStepStatus }) {
  switch (status) {
    case "running":
      return (
        <Loader2
          className="size-4 animate-spin text-primary motion-reduce:animate-none"
          aria-hidden
        />
      )
    case "done":
      return <Check className="size-4 text-success" aria-hidden />
    case "failed":
      return <X className="size-4 text-destructive" aria-hidden />
    default:
      return <Circle className="size-4 text-muted-foreground/50" aria-hidden />
  }
}

const statusText: Record<RunStepStatus, string> = {
  pending: "Pending",
  running: "Running",
  done: "Done",
  failed: "Failed",
}

function RunSteps({
  steps,
  onStop,
  className,
}: {
  steps: RunStep[]
  onStop?: () => void
  className?: string
}) {
  const running = steps.some((s) => s.status === "running")
  return (
    <div className={cn("flex w-full flex-col gap-4", className)}>
      <ol className="flex flex-col">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1
          return (
            <li key={i} className="flex gap-3">
              {/* rail: icon + connector line down to the next step */}
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border",
                    step.status === "done" && "border-success/40 bg-success/10",
                    step.status === "failed" &&
                      "border-destructive/40 bg-destructive/10",
                    step.status === "running" &&
                      "border-primary/40 bg-primary/10"
                  )}
                >
                  <StepIcon status={step.status} />
                </span>
                {!isLast && (
                  <span className="w-px flex-1 bg-border" aria-hidden />
                )}
              </div>
              <div className="-mt-0.5 flex min-w-0 flex-1 flex-col pb-5">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "text-sm font-medium break-words",
                      step.status === "pending" && "text-muted-foreground"
                    )}
                  >
                    {step.label}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {statusText[step.status]}
                  </span>
                </div>
                {step.detail != null && (
                  <p className="mt-0.5 text-xs break-words text-muted-foreground">
                    {step.detail}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      {onStop && running && (
        <div>
          <Button
            variant="destructive"
            size="sm"
            onClick={onStop}
            className="gap-1"
          >
            <X className="size-3.5" aria-hidden /> Stop
          </Button>
        </div>
      )}
    </div>
  )
}

export { RunSteps }
