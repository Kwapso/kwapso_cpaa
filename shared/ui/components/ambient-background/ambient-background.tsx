/* ============================================================================
   AmbientBackground — the one background flourish in the system
   (1 direct call site).

   DESIGN SOURCE
   motion/motion.css §17 is the only place the kit's carrier describes this
   component at all, and it describes the MOVEMENT rather than the drawing:

     "The one background flourish in the system … AmbientBackground drifts
      extremely slowly and never in response to scroll — scroll-linked
      background movement is parallax, which is forbidden. It is off entirely
      under reduced motion."

   `.motion-ambient` is that drift, already written, already suppressed under
   `prefers-reduced-motion` in motion.css §18. This file attaches the class and
   writes no duration, no curve and no keyframe.
   The kit draws no shape and names no wash. What was chosen instead of
   inventing one is in GAPS-G.md (AMB-1 … AMB-3).

   THE LAW THIS FILE OBEYS
   · The two neutral washes are `--accent` and `--hair-faint`: real palette
     entries, defined in both themes, which exist precisely to be a barely
     visible tint of paper. Nothing is invented for the default variant.
   · Mango IS permitted here and nowhere near a hover or a status: `brand` is
     a brand FILL, which is the one thing ruling 26 says mango is for. It is
     opt-in, exactly as `Badge variant="default"` is.
   · No parallax, no scroll listener, no pointer listener. This component
     never reads the scroll position — that is the ruling, and it is also why
     this file needs no hook and no `"use client"`.
   · Decoration is `aria-hidden` and `pointer-events-none`. It must never
     take a click away from the page it sits behind, and it must never be
     read aloud.
   · No px. The blobs are sized in percentages of their own frame and blurred
     at `--space-10`, so the whole flourish rescales with the text-size
     control instead of pinning itself to a device pixel.

   RENDERING CONTEXT
   No `"use client"`. No hook, no state, no browser API, no event handler —
   the drift is a CSS class. It renders inside a Server Component unchanged.
   ========================================================================= */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const ambientBackgroundVariants = cva(
  [
    // The layer fills its positioned parent and sits behind everything in it.
    "pointer-events-none absolute inset-0 -z-10 overflow-hidden",
  ],
  {
    variants: {
      /**
       * Which tones the flourish is made of. The variant sets two custom
       * properties and the two blobs read them, so a variant is one place and
       * not two rules.
       */
      variant: {
        /**
         * Paper on paper. `--accent` (the neutral 5% wash) and `--hair-faint`
         * (6%) are the kit's own near-invisible tints and are defined in both
         * palettes, so this variant invents no colour at all.
         */
        default: "[--ambient-1:var(--accent)] [--ambient-2:var(--hair-faint)]",
        /**
         * The brand flourish. Mango as a FILL — ruling 26's one permitted use
         * — softened to a wash with `color-mix`, which produces a colour
         * rather than applying an opacity to an element.
         */
        brand: [
          "[--ambient-1:color-mix(in_srgb,var(--primary)_18%,transparent)]",
          "[--ambient-2:var(--accent)]",
        ],
        /** The informational tone, same construction. Sky, not mango. */
        info: [
          "[--ambient-1:color-mix(in_srgb,var(--info)_18%,transparent)]",
          "[--ambient-2:var(--accent)]",
        ],
      },
      /**
       * Where the layer is anchored. `absolute` fills the nearest positioned
       * ancestor and is the default; `fixed` pins it to the viewport for a
       * whole-page wash.
       */
      anchor: {
        absolute: "absolute",
        fixed: "fixed",
      },
    },
    defaultVariants: {
      variant: "default",
      anchor: "absolute",
    },
  },
);

/**
 * One soft field of tone. Local — the parts of a flourish are never
 * addressable from outside, and a call site that wants a different shape
 * wants a different component.
 */
function Blob({ className, animated }: { className?: string; animated: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute aspect-square rounded-pill",
        // 96 of blur, from the spacing scale, so it grows with the text size.
        "blur-[var(--space-10)]",
        // motion.css §17. It carries the duration, the curve and its own
        // reduced-motion suppression; this file states none of the three.
        animated && "motion-ambient",
        className,
      )}
    />
  );
}

export interface AmbientBackgroundProps
  extends React.ComponentPropsWithoutRef<"div">,
    VariantProps<typeof ambientBackgroundVariants> {
  /**
   * Attach the drift. Default `true`. Reduced motion is already handled by
   * motion.css §18 — this prop is for the other case, where a screen is busy
   * enough that even a slow drift is one thing too many.
   */
  animated?: boolean;
}

/**
 * A slow, soft wash of tone behind a page or a panel.
 *
 * TEN STATES — nine of them genuinely do not apply, and each is named rather
 * than quietly dropped. This component is decoration: it has no value, no
 * input and no target.
 *
 *  1. default        — two blurred fields of tone, drifting.
 *  2. hover          — does not apply. `pointer-events-none`: the layer cannot
 *                      be hovered, on purpose, or it would eat clicks meant for
 *                      the page in front of it.
 *  3. focus-visible  — does not apply. Never focusable, never in the tab order.
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply. `animated={false}` stops the drift; that
 *                      is a setting, not a state, and it is not drawn.
 *  6. loading        — does not apply. There is nothing to fetch. A background
 *                      that waited for something would be the one thing on the
 *                      screen reporting a request it is not making.
 *  7. empty          — does not apply: the flourish IS the content. A call site
 *                      that wants nothing renders nothing.
 *  8. error          — does not apply, and must not be faked. Decoration has no
 *                      failure to report.
 *  9. selected       — does not apply.
 * 10. read-only      — always. Nothing here can be written to.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED, and it costs nothing: every dimension
 *  is a percentage of the layer's own box and the blur is a rem, so the whole
 *  flourish is already relative at every width. On a phone the two fields
 *  overlap more, which is the same drawing at a smaller size rather than a
 *  second design.
 *
 * RTL — safe. Both fields are placed with `start-*` / `end-*`, so the
 * composition mirrors in Arabic, Urdu and Persian along with everything else.
 * The drift itself travels diagonally and is not directional.
 */
const AmbientBackground = React.forwardRef<HTMLDivElement, AmbientBackgroundProps>(
  (
    { className, variant = "default", anchor = "absolute", animated = true, ...props },
    ref,
  ) => (
    <div
      ref={ref}
      data-slot="ambient-background"
      aria-hidden="true"
      className={cn(ambientBackgroundVariants({ variant, anchor }), className)}
      {...props}
    >
      <Blob
        animated={animated}
        className="top-[-25%] start-[-10%] w-[70%] bg-[var(--ambient-1)]"
      />
      <Blob
        animated={animated}
        className="bottom-[-30%] end-[-15%] w-[60%] bg-[var(--ambient-2)]"
      />
    </div>
  ),
);

AmbientBackground.displayName = "AmbientBackground";

export { AmbientBackground, ambientBackgroundVariants };
