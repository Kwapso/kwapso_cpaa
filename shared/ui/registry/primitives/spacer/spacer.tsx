// Spacer — adds a fixed gap of empty vertical space between elements, when a
// margin would be awkward. Choose a size.

import * as React from "react"

import { cn } from "../../../lib/utils"

const sizes = {
  sm: "h-2",
  default: "h-4",
  lg: "h-8",
  xl: "h-16",
}

function Spacer({
  size = "default",
  className,
  ...props
}: React.ComponentProps<"div"> & { size?: keyof typeof sizes }) {
  return (
    <div
      aria-hidden
      className={cn("w-full", sizes[size], className)}
      {...props}
    />
  )
}

export { Spacer }
