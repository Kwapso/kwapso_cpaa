// cn() — the class-merge helper every component uses. clsx flattens conditional
// class lists, then tailwind-merge resolves Tailwind conflicts so the LAST class
// wins. That ordering is what lets a consumer override any component's styling by
// passing `className`, with no !important and no knowledge of our internals.

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Merge class names, resolving Tailwind conflicts so the last utility wins.
 * Every primitive and collection uses this to make `className` overridable.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
