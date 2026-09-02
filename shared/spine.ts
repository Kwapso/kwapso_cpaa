// THE SIDEBAR SPINE — ink, paper or mango. Client ruling D3 puts all three in
// Settings · Appearance; this file is the twin of shared/scale.ts: the
// allow-list a door validates against, and the fallback an unset or
// unrecognised value reads as.
//
// MANGO IS THE FALLBACK. OVERRULED 2026-09-02, AND THE ARGUMENT IT OVERTURNED
// IS KEPT HERE RATHER THAN DELETED, because a default that changed under
// people is exactly the thing the next reader will arrive suspicious about.
//
// THE ARGUMENT THAT WAS MADE, in the words it was made in: paper is the
// fallback, not the kit's own `screen-shell.tsx` default of mango (override
// 56); `web/components/app-shell.tsx` has painted a paper rail since before
// the spine was a choice at all, and a person who has never opened Settings
// must keep seeing exactly the rail they always had — switching everyone to
// mango the day this shipped would be a redesign nobody asked for, wearing a
// bug fix's clothes.
//
// THE CLIENT OVERRULED IT, 2026-09-02, verbatim: "default spine to mango, but
// everyone can change it during the onboarding or anytime at settings". So the
// value below is mango. The argument was not wrong about the mechanism — every
// person who has never chosen does see a different rail than they saw
// yesterday — the client simply weighed that against having her own brand on
// the rail by default and decided which one she wanted. That is a product
// decision and it is hers; this file records that it was taken with the cost
// in view rather than by nobody noticing.
//
// AND THE SECOND HALF OF THE RULING IS WHY THE FIRST HALF IS SURVIVABLE. Mango
// is the value a person LANDS on, never the only one they can have: the choice
// is offered on the onboarding screen itself (web/app/onboarding/page.tsx,
// which is the "during the onboarding" half, and where skipping it means
// exactly this constant) and changed at any time in Settings · Appearance
// (shared/web/spine-section.tsx). The redesign the old paragraph feared is one
// nobody can undo; this one is three cards away on the first screen of the
// product and three more in Settings for ever after.
//
// THE DIVERGENCE FROM THE KIT IS THEREFORE GONE. This file deliberately
// disagreed with `screen-shell.tsx`'s own `spine="mango"` default; it no longer
// does, and the two agree on one value again. `app-shell.tsx` still names the
// spine explicitly rather than letting the shell default — that is now
// belt-and-braces rather than a correction, and it stays because the rail must
// paint what THIS person chose, not what the shell would have guessed.
//
// NULL IS A REAL ANSWER, same discipline as `language` and `scale`: "this
// person has never chosen" is kept distinct from a deliberate choice of
// mango, and no CHECK constraint on the column for the same reason those two
// carry none — the allow-list lives here, the door validates against it, and
// an unrecognised value falls back rather than throws (db/core/0028_user_spine.sql).

export type Spine = "ink" | "paper" | "mango"

export const SPINE_VALUES: readonly Spine[] = ["ink", "paper", "mango"]

export const DEFAULT_SPINE: Spine = "mango"

/** Is this a spine kwapso offers? The door's allow-list. */
export function isSpine(value: unknown): value is Spine {
  return typeof value === "string" && (SPINE_VALUES as readonly string[]).includes(value)
}

/** The spine a stored value means, falling back to mango (the client's ruling
 * of 2026-09-02 — see the header). A bad or missing value costs a person their
 * preferred rail; it can never cost them a screen. */
export function toSpine(value: string | null | undefined): Spine {
  return isSpine(value) ? value : DEFAULT_SPINE
}
