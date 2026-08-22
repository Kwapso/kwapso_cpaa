"use client"

// Checkbox — a Radix checkbox styled with tokens. Radix supplies the tri-state
// (checked / unchecked / indeterminate) and the label association; this file
// only draws it.

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check } from "lucide-react"

import { cn } from "../../../lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        // `rounded-select` (6px) is the ONE named exception to the two-radius
        // law, and this is the control it exists for. See RADIUS_EXCEPTION.
        "peer size-[1.375rem] shrink-0 rounded-select border border-input bg-background shadow-none transition-colors hover:border-foreground disabled:cursor-not-allowed disabled:bg-secondary data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        <Check className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
