// Input — the one text field. `truncate` (overflow-hidden + text-ellipsis +
// whitespace-nowrap) makes an overflowing VALUE *and* placeholder end in an
// ellipsis rather than a hard clip: at any width "Search attributes…" degrades
// to "Search attr…", never "Search attribut".

import * as React from "react"

import { cn } from "../../../lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full truncate rounded-full border border-border bg-background px-4 text-sm shadow-none transition-colors hover:border-input focus-visible:border-foreground file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground hover:border-ring/60 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
