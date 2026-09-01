// THE SIDEBAR SPINE — ink, paper or mango. Client ruling D3 puts all three in
// Settings · Appearance; this file is the twin of shared/scale.ts: the
// allow-list a door validates against, and the fallback an unset or
// unrecognised value reads as.
//
// PAPER IS THE FALLBACK HERE, not the kit's own `screen-shell.tsx` default of
// mango (override 56, a later client ruling this app has not adopted for its
// own shell). `web/components/app-shell.tsx` has painted a paper rail since
// before the spine was a choice at all, and a person who has never opened
// Settings must keep seeing exactly the rail they always had — switching
// everyone to mango the day this shipped would be a redesign nobody asked
// for, wearing a bug fix's clothes.
//
// NULL IS A REAL ANSWER, same discipline as `language` and `scale`: "this
// person has never chosen" is kept distinct from a deliberate choice of
// paper, and no CHECK constraint on the column for the same reason those two
// carry none — the allow-list lives here, the door validates against it, and
// an unrecognised value falls back rather than throws (db/core/0028_user_spine.sql).

export type Spine = "ink" | "paper" | "mango"

export const SPINE_VALUES: readonly Spine[] = ["ink", "paper", "mango"]

export const DEFAULT_SPINE: Spine = "paper"

/** Is this a spine kwapso offers? The door's allow-list. */
export function isSpine(value: unknown): value is Spine {
  return typeof value === "string" && (SPINE_VALUES as readonly string[]).includes(value)
}

/** The spine a stored value means, falling back to paper. A bad or missing
 * value costs a person their preferred rail; it can never cost them a screen. */
export function toSpine(value: string | null | undefined): Spine {
  return isSpine(value) ? value : DEFAULT_SPINE
}
