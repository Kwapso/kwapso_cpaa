"use client"

// Label — the form label. Radix wires the htmlFor/id association, so clicking the
// text focuses the control. Used INSIDE Field rather than placed on its own,
// which is why it has no entry of its own in the docs catalog.

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"

import { cn } from "../../../lib/utils"

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn(
        "text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className
      )}
      {...props}
    />
  )
}

export { Label }
