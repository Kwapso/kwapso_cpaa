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
        // A pill at the touch height, with a hairline that steps up twice: hair
        // at rest, hair-strong on hover, ink on keyboard focus. The old class
        // ended with `hover:border-ring/60` and an opacity-based disabled, which
        // both had to go — an alpha of a colour is a colour the palette does not
        // contain, `--ring` is the FOCUS token now rather than the brand, and
        // disabled is a fill and an ink rather than a fade.
        "flex h-11 w-full truncate rounded-full border border-border bg-background px-4 text-sm shadow-none transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground hover:border-input focus-visible:border-foreground disabled:cursor-not-allowed disabled:bg-secondary disabled:text-ink-disabled",
        className
      )}
      {...props}
    />
  )
}

export { Input }
