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

/* ----------------------------------------------------------------------------
   tailwind-merge's own built-in `font-family`/`font-weight` groups have the
   same opaque-`var()` ambiguity Tailwind itself has (see `family-name:` hints
   at every `font-[var(--font-sans/serif)]` call site). Its default `isAny`
   catch-all for `font-family` swallows an unlabelled arbitrary value too, so
   an unhinted `font-[var(--font-weight-medium)]` and a hinted
   `font-[family-name:var(--font-sans)]` both land in the SAME group and the
   merge keeps only the last one — exactly the drop this file exists to
   prevent. `extend` can't fix this: it appends to the built-in `isAny`
   validator rather than replacing it, so the swallow-everything match still
   wins. These groups must be replaced via `override` instead, routing by the
   arbitrary value's label (`family-name:` → family, anything else → weight, matching
   Tailwind's own default-to-weight inference for an unlabelled value).
   ---------------------------------------------------------------------------- */
const arbitraryFontValueRegex = /^\[(?:([a-z-]+):)?(.+)\]$/i;
const isArbitraryFontFamily = (value: string) =>
  arbitraryFontValueRegex.exec(value)?.[1] === "family-name";
const isArbitraryFontWeight = (value: string) => {
  const match = arbitraryFontValueRegex.exec(value);
  if (!match) return false;
  const label = match[1];
  // No label at all defaults to weight too — matching Tailwind's own
  // inference for an opaque `font-[var(...)]` with no type hint.
  return label !== "family-name" && label !== "style";
};

const twMerge = extendTailwindMerge({
  override: {
    classGroups: {
      "font-weight": [
        {
          font: [
            "thin",
            "extralight",
            "light",
            "normal",
            "medium",
            "semibold",
            "bold",
            "extrabold",
            "black",
            isArbitraryFontWeight,
          ],
        },
      ],
      "font-family": [{ font: [isArbitraryFontFamily] }],
    },
  },
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
