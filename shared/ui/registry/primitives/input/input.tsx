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
        "flex h-9 w-full truncate rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground hover:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
