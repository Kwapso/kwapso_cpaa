// Badge — a small status pill. Each variant is a FILL that carries its own
// foreground token (`bg-warning` + `text-warning-foreground`), so those pairs are
// contrast-checked against EACH OTHER, not against the page. That is why a light
// amber badge is fine while amber TEXT is not — registry/tokens/README.md, trap 3.

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        success: "border-transparent bg-success text-success-foreground",
        warning: "border-transparent bg-warning text-warning-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.ComponentProps<"span">, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
