import { extendTailwindMerge } from "tailwind-merge";
import { clsx, type ClassValue } from "clsx";

/* ============================================================================
   `cn` — merge class names so a call site's class always beats a component's.

   WHY THIS IS NOT JUST `twMerge`
   ---------------------------------------------------------------------------
   tailwind-merge only knows how to resolve a conflict between two classes if
   it recognises them as belonging to the same group. It ships with Tailwind's
   OWN class list, and this system adds names Tailwind has never heard of —
   `rounded-pill`, `rounded-select`, `rounded-bar`, `text-badge`, `text-micro`,
   `text-caption`, `tracking-eyebrow`, `tracking-serif`.

   Unregistered, they do not conflict with anything, so BOTH survive the merge
   and the winner is decided by Tailwind's emission order rather than by the
   caller. Measured before this fix:

       twMerge("rounded-pill", "rounded-sm")   -> "rounded-pill rounded-sm"
       twMerge("rounded-select", "rounded-pill") -> "rounded-select rounded-pill"
       twMerge("text-badge", "text-sm")        -> "text-badge text-sm"

   That quietly breaks PATTERN.md §1's promise that "the caller's className
   goes last so a call site can always win" — for radius and for three of the
   type steps it simply was not true. Registering the custom names here fixes
   it once for all 91 components; no component changes.

   Found by the agent writing docs/, by running tailwind-merge rather than
   reading it. Logged as GAPS-DOCS A-1.
   ========================================================================= */

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      // The four kwapso radii. Ruling 03 admits no others.
      rounded: [{ rounded: ["pill", "select", "bar"] }],
      // The three kwapso-only type steps. The other thirteen are Tailwind's
      // own names, already known to the merger.
      "font-size": [{ text: ["badge", "micro", "caption"] }],
      tracking: [{ tracking: ["eyebrow", "serif"] }],
    },
  },
});

/**
 * Merge class names, letting a caller's utility win over a component default.
 * Every primitive takes `className` and passes it through this, so a call site
 * can override without a component rewrite.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
