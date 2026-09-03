// THE APP'S BACKGROUND — ink, paper or mango. Client ruling D3 puts all three
// in Settings · Appearance; this file is the twin of shared/scale.ts: the
// allow-list a door validates against, and the fallback an unset or
// unrecognised value reads as.
//
// THREE, CUT TO TWO, THEN REVERSED BACK TO THREE — all inside 24 hours.
// v1.2.28 (2026-09-02) cut `ink` and `paper` to one muted rail, `quiet`, the
// same day the client ruled "default spine to mango, but everyone can change
// it during the onboarding or anytime at settings" (kept below in full — that
// half of the ruling is untouched by any of this). The client then reversed
// the CUT, verbatim, 2026-09-03: "you know, i changed my mind. i want to go
// back to the 3 options (sorry)" — and said why, which matters more than the
// count: "my goal is that in light i can choose to have a 'dark' background
// option". Appearance and Background are independent: Appearance decides
// whether the app is light or dark, Background decides the colour behind
// everything, and Ink is how a person running a LIGHT-themed app gets a dark
// window. `quiet` could never be that — it was one muted rail, not "dark
// regardless of theme" — so it is gone again and `ink`/`paper` are back,
// unchanged from before v1.2.28. `SPINE_VALUES` and the `Spine` union below
// are `"ink" | "paper" | "mango"` again.
//
// THE ink/paper → quiet MIGRATION IN `toSpine` IS DELETED HERE, NOT KEPT
// DORMANT — said out loud because a two-line mapping that once solved a real
// problem is exactly the kind of thing a future reader re-adds "to be safe"
// without knowing the problem it solved no longer exists. It existed for one
// reason only: v1.2.28 REMOVED `ink` and `paper` as choices, so a person who
// had picked either needed to land somewhere real, explicitly and by name,
// rather than falling through to the unrelated mango default. That reason is
// gone — `ink` and `paper` are ordinary choices again — so anyone who chose
// one simply keeps exactly what they chose; a migration that forced them onto
// `quiet` would now be actively wrong, moving a person who has always run ink
// the moment this ships.
//
// A ROW STILL HOLDING `"quiet"` FROM THAT WINDOW (v1.2.28–v1.2.29,
// 2026-09-02 to 2026-09-03) IS NOT A THIRD RETIRED VALUE THAT NEEDS ITS OWN
// MAPPING. `quiet` is simply absent from `SPINE_VALUES` now, so
// `isSpine("quiet")` is false and `toSpine` falls through to its ordinary
// catch-all, DEFAULT_SPINE. Nobody who saved it in that window sees an error
// or a blank screen — they see mango, exactly like anyone else with a value
// this build does not recognise. That costs them the rail they picked
// yesterday, which is real, but it is not a broken row: the same discipline
// as "a bad or missing value costs a person their preferred rail; it can
// never cost them a screen" that the rest of this file rests on. And the door
// (workers/auth/src/index.ts's `spine` handler) only ever WRITES a value in
// `SPINE_VALUES`, so nobody can put a fresh `"quiet"` into a row from here on.
//
// MANGO IS STILL THE FALLBACK for null, undefined, or genuine garbage — that
// half of the ruling did not move, and it is a SEPARATE ruling from this
// reversal (2026-09-02) that survives it untouched. The argument that used to
// run the other way (paper as the fallback, so a person who never opened
// Settings keeps the rail they always had) is kept below rather than deleted,
// because a default that changed under people once is exactly the thing the
// next reader arrives suspicious about.
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

/** Is this a spine kwapso offers TODAY? The door's allow-list. `quiet` is
 * deliberately not here — see the header — a stored row can still hold it,
 * from the one-day window it was the only muted choice; `toSpine` is where
 * that gets resolved (to the ordinary fallback, not a special mapping). */
export function isSpine(value: unknown): value is Spine {
  return typeof value === "string" && (SPINE_VALUES as readonly string[]).includes(value)
}

/** The spine a stored value means. No retired-value migration any more — see
 * the header for why the old ink/paper → quiet mapping was deleted rather
 * than extended to cover `quiet` itself. Anything not in `SPINE_VALUES`,
 * including a `quiet` row from the one day it was legal, or missing, falls
 * back to mango (the client's ruling of 2026-09-02). A bad or missing value
 * costs a person their preferred rail; it can never cost them a screen. */
export function toSpine(value: string | null | undefined): Spine {
  return isSpine(value) ? value : DEFAULT_SPINE
}
