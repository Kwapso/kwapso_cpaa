// Button — the base action control. Variants and sizes are CVA; `asChild` swaps
// the rendered element through Radix Slot, so a link can be a button.
//
// LOAD-BEARING: `[&_svg]:pointer-events-none` in the base class removes EVERY
// descendant icon from hit-testing, so a click always lands on the button rather
// than the glyph. The consequence is that an interactive icon can never live
// inside a Button — a clear ✕ has to be a real sibling <button>. Missing that
// shipped a bug in v0.9.1; do not remove the rule to "fix" a nested control.

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // A FLAT FILL. It was `bg-gradient-to-b from-primary to-primary/90`
        // with a `shadow-primary/40` glow on hover — a gradient and a coloured
        // shadow, which are two of the kit's named Don'ts, on the most-used
        // control in the app. Hover darkens to a named value rather than
        // shifting opacity; the structural rest of this component (its sizes,
        // its focus ring, its press) is dealt with where the kit specifies it.
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-btn-primary-hover",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 rounded-full px-3 text-xs",
        default: "h-9 px-4 py-2",
        lg: "h-10 rounded-full px-6",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  /** Render as the child element (e.g. an `<a>`) instead of a `<button>`. */
  asChild?: boolean
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
