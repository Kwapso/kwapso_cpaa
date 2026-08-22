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

// ── THE KIT'S BUTTON ────────────────────────────────────────────────────────
//
// NO BORDERS. EVER. Not an outline, not a hairline, not a stroke, in any state.
// That single rule is why the `outline` variant no longer exists: a secondary
// action is a FILLED button in the other paper tone, not an outlined one. Its
// call sites were rewritten to `secondary`, which is what they always meant.
//
// PRESS DROPS 1px; it does not shrink. `active:scale-[0.97]` scaled the label
// too, which reads as the button moving away from the finger.
//
// DISABLED IS A FILL AND A LABEL, not `opacity-50`. Fading a control leaves it
// legible-ish and ambiguous; the kit gives disabled its own quiet surface and
// its own ink, and disabled is the one state exempt from the contrast floor.
//
// HOVERS ARE NAMED VALUES, never `/90`. An opacity hover is a different colour
// every time the surface underneath changes, and the kit's hover hexes were
// chosen by eye and approved — computing them would drift from what was signed
// off.
//
// NO FOCUS RING HERE. Ruling 24 gives every control one shared `:focus-visible`
// outline, defined once in styles.css.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium leading-none whitespace-nowrap transition-colors active:translate-y-px active:shadow-none disabled:pointer-events-none disabled:bg-secondary disabled:text-ink-disabled [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Mango, charcoal label. The brand fill.
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-btn-primary-hover",
        // The other paper tone from the band it sits in — see the context
        // classes at the bottom of styles.css.
        secondary:
          "bg-btn-secondary-fill text-btn-secondary-label hover:bg-btn-secondary-hover",
        // Solid poppy with a CHARCOAL label: charcoal on poppy is 4.59:1 and
        // passes, off-beige on poppy fails, and the accent rule wins over the
        // instinct that a red button takes white text.
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-btn-destructive-hover",
        // A quiet action is text only, underlined in a hairline that goes to ink
        // on hover.
        text: "px-2 underline decoration-input underline-offset-[3px] hover:decoration-current",
        // NOT IN THE KIT, and kept deliberately. The kit's quiet action is the
        // underlined `text` above, which is wrong for the icon-only row actions
        // and overflow triggers this app uses `ghost` for 29 times. Borderless
        // and opacity-free, so it obeys every rule the kit does state; its
        // geometry is an open question in NEEDS-A-SPEC.md.
        ghost: "hover:bg-accent hover:text-accent-foreground",
        // Ink, underlined on hover. Never blue, and never `--primary`: mango as
        // text is unreadable on paper, which is what this said before.
        link: "underline-offset-[3px] hover:underline",
      },
      size: {
        // 40 tall, 20 side padding, 14/500 — the kit fixes ONE size by law.
        default: "h-10 px-5",
        // The dense 32, for a button living inside another component (a toast's
        // action, a composer's send). One of the kit's two stated exceptions.
        sm: "h-8 px-3",
        // 44, the touch row — the kit's other stated exception, and the height
        // it draws the full-width auth button at.
        lg: "h-11 px-6",
        icon: "size-10",
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
