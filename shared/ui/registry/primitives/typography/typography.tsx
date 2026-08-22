// Typography — consistent text blocks so pages don't reinvent heading/body
// styles. Use these instead of raw <h2>/<p> tags.
//   Headline  — a section or page title
//   Text      — body copy
//   Hint      — a small, muted helper / caption line

import * as React from "react"

import { cn } from "../../../lib/utils"

function Headline({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "text-2xl font-semibold tracking-tight text-foreground",
        className
      )}
      {...props}
    />
  )
}

function Text({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn("text-sm leading-relaxed text-foreground", className)}
      {...props}
    />
  )
}

function Hint({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)} {...props} />
  )
}

export { Headline, Text, Hint }
