// Textarea — multi-line text input. Carries the same token-backed border, ring
// and placeholder treatment as Input, so the two line up when they share a form.

import * as React from "react"

import { cn } from "../../../lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-24 w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-sm shadow-none transition-colors placeholder:text-muted-foreground hover:border-input focus-visible:border-foreground disabled:cursor-not-allowed disabled:bg-secondary disabled:text-ink-disabled",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
