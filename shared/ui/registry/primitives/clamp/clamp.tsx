"use client"

// Clamp — wrap ANY mapped/displayed text in this to make it config-driven:
// truncate it (by responsive line-count, or a fixed character count) or expand
// it (show the whole thing). It never grows the width left-to-right — that would
// break layouts — so long text either clips or wraps downward.
//
//   <Clamp config={textDisplayConfig}>{record.description}</Clamp>

import * as React from "react"

import { type TextDisplayConfig } from "../../../lib/config"
import { truncateText } from "../../../lib/text"
import { cn } from "../../../lib/utils"

const clampClass: Record<number, string> = {
  1: "line-clamp-1",
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
  5: "line-clamp-5",
  6: "line-clamp-6",
}

function Clamp({
  config,
  children,
  className,
}: {
  config: TextDisplayConfig
  /** the text to display (a plain string, so we can cut by character if asked). */
  children: string
  className?: string
}) {
  // Expand — show everything; wraps and grows downward.
  if (config.overflow === "expand") {
    return <span className={cn("min-w-0", className)}>{children}</span>
  }

  // Truncate by a fixed character count (not responsive).
  if (config.truncateBy === "characters") {
    return (
      <span className={cn("min-w-0", className)}>
        {truncateText(children, config.maxChars)}
      </span>
    )
  }

  // Truncate by line count — the responsive default (CSS line-clamp adapts the
  // character count to each screen size for you).
  return (
    <span
      className={cn(
        "min-w-0",
        clampClass[config.lines] ?? "line-clamp-2",
        className
      )}
    >
      {children}
    </span>
  )
}

export { Clamp }
