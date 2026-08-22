// Spinner — a small spinning indicator for "loading…" moments.

import * as React from "react"
import { Loader2 } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../../lib/utils"

const spinnerVariants = cva("animate-spin text-muted-foreground", {
  variants: {
    size: { sm: "size-4", default: "size-6", lg: "size-8" },
  },
  defaultVariants: { size: "default" },
})

function Spinner({
  className,
  size,
  ...props
}: React.ComponentProps<typeof Loader2> &
  VariantProps<typeof spinnerVariants>) {
  return (
    <Loader2
      role="status"
      aria-label="Loading"
      className={cn(spinnerVariants({ size }), className)}
      {...props}
    />
  )
}

export { Spinner }
