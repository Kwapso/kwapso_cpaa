"use client"

// Rating — a row of stars for showing or collecting a score (e.g. 4 / 5).

import * as React from "react"
import { Star } from "lucide-react"

import { cn } from "../../../lib/utils"

export interface RatingProps {
  value: number
  onChange?: (value: number) => void
  /** Number of stars. */
  max?: number
  /** Display-only (no hover/click). */
  readOnly?: boolean
  className?: string
}

function Rating({
  value,
  onChange,
  max = 5,
  readOnly = false,
  className,
}: RatingProps) {
  const [hover, setHover] = React.useState<number | null>(null)
  const shown = hover ?? value

  return (
    <div
      role="radiogroup"
      className={cn("flex items-center gap-0.5", className)}
    >
      {Array.from({ length: max }, (_, i) => {
        const n = i + 1
        const filled = n <= shown
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onMouseEnter={() => !readOnly && setHover(n)}
            onMouseLeave={() => !readOnly && setHover(null)}
            onClick={() => !readOnly && onChange?.(n)}
            className={cn(
              "transition-transform",
              readOnly ? "cursor-default" : "cursor-pointer hover:scale-110"
            )}
          >
            <Star
              className={cn(
                "size-5 transition-colors",
                filled
                  ? "fill-chart-2 text-chart-2"
                  : "text-muted-foreground/40"
              )}
            />
          </button>
        )
      })}
    </div>
  )
}

export { Rating }
