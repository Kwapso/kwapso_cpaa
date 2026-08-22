"use client"

// ProgressToggle — a reversible "Mark as done" ⇄ "Done ✓" control for a learning
// item. Composed from the Button primitive; `aria-pressed` conveys the state.

import * as React from "react"
import { Check } from "lucide-react"

import { cn } from "../../../lib/utils"
import { Button } from "../button/button"

function ProgressToggle({
  done,
  onToggle,
  className,
}: {
  done: boolean
  onToggle: () => void
  className?: string
}) {
  return (
    <Button
      type="button"
      variant={done ? "secondary" : "outline"}
      onClick={onToggle}
      aria-pressed={done}
      className={cn("gap-1.5", className)}
    >
      {done ? (
        <>
          <Check className="size-4 text-success" aria-hidden /> Done
        </>
      ) : (
        "Mark as done"
      )}
    </Button>
  )
}

export { ProgressToggle }
