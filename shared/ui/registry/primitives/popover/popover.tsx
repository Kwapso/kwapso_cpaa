"use client"

// Popover — the floating panel behind filters, sort and Choice. Radix Root is
// re-exported verbatim so every prop passes straight through and only the content
// surface is styled. Read the `modal` note below before using this in a Dialog.

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "../../../lib/utils"

// `Popover` is Radix's Root verbatim, so every Root prop forwards — including
// **`modal`**, which matters more than it looks:
//
// A popover is portaled to <body>. When one opens inside a Dialog, the Dialog's
// scroll lock (react-remove-scroll) preventDefaults wheel/touchmove on every
// node outside its own subtree — which now includes the popover. Typing still
// works, scrolling is dead. `modal` makes the popover own the scroll lock for
// its own content, so a long list scrolls again.
//
// It stays OFF by default: a modal popover traps focus and blocks outside
// clicks, so in a normal page you could no longer click straight from one
// filter to the next. Components that may live in a Dialog (Choice, FilterBar)
// take a `modal` prop and pass it through — see their docs.
const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger
const PopoverAnchor = PopoverPrimitive.Anchor

function PopoverContent({
  className,
  align = "center",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          // OPAQUE surface (bg-popover, not glass): a popover floats over arbitrary
          // page content, so a translucent frost would make its contents unreadable.
          "z-50 w-72 rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent }
