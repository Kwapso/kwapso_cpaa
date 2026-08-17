// THE SCALE SETTING — three steps, one number, text and spacing together.
//
// This is the whole mechanism, and it is deliberately tiny. Every size token in
// the theme is expressed in `rem` (`--text-xs: 0.875rem`, `--text-sm: 0.9375rem`,
// `--text-base: 1rem`) and every spacing class is a Tailwind `rem` step, so
// setting ONE root font size on `<html>` moves type and spacing together — which
// is precisely what the iPhone's own setting does, and precisely what the owner
// asked for. No component takes a size prop and no component needs one
// (UI-RULEBOOK S4).
//
// The portal's own baseline is a step larger than the agency app's, and that
// divergence is deliberate (UI-RULEBOOK L5): the portal is a reading surface for
// one client, the agency app is a working surface. So each step carries BOTH
// numbers rather than one number and a multiplier somebody would eventually
// apply on the wrong side.
//
// A value the code has never met reads as comfortable rather than throwing —
// the same discipline `toLanguage` keeps, and the reason the database column
// carries no CHECK constraint.

/** One step: what it is called, and the root font size it sets on each front
 * door. `agencyPx` is `web/`; `portalPx` is `web-portal/`. */
export type ScaleStep = {
  value: string
  label: string
  agencyPx: number
  portalPx: number
}

export const SCALE_STEPS: ScaleStep[] = [
  { value: "compact", label: "Compact", agencyPx: 15, portalPx: 16 },
  { value: "comfortable", label: "Comfortable", agencyPx: 16, portalPx: 17 },
  { value: "large", label: "Large", agencyPx: 18, portalPx: 19 },
]

/** What a person has never chosen. Named rather than repeated, so the column's
 * NULL, the door's fallback and the picker's initial state are one decision. */
export const DEFAULT_SCALE = "comfortable"

/** Is this a step the code knows? The door's allow-list, and the reason the
 * column carries no CHECK — see db/core/0026_user_scale.sql. */
export function isScale(value: unknown): boolean {
  return typeof value === "string" && SCALE_STEPS.some((s) => s.value === value)
}

/** The step a stored value means, falling back to comfortable. A bad value costs
 * a person their preferred size; it can never cost them a screen. */
export function toScale(value: string | null | undefined): ScaleStep {
  return SCALE_STEPS.find((s) => s.value === value) ?? SCALE_STEPS[1]
}

/** The root font size, in pixels, for one front door. */
export function scaleFontSize(value: string | null | undefined, door: "agency" | "portal"): number {
  const step = toScale(value)
  return door === "agency" ? step.agencyPx : step.portalPx
}
