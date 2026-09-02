// THE SIDEBAR SPINE — mango or quiet. Client ruling D3 puts both in Settings ·
// Appearance; this file is the twin of shared/scale.ts: the allow-list a door
// validates against, and the fallback an unset or unrecognised value reads as.
//
// THREE BECAME TWO, v1.2.28. CLIENT RULING, 2026-09-02, verbatim (it overturns
// the count in D3, "offer teh threee!"): "default spine to mango, but everyone
// can change it during the onboarding or anytime at settings" — the kit cut
// `ink` and `paper` the same day and shipped ONE muted rail, `quiet`, in their
// place. `SPINE_VALUES` and the `Spine` union below are `"mango" | "quiet"`
// now; `ink` and `paper` are not a third and fourth option that happen to be
// unused, they no longer exist as choices at all.
//
// A PERSON WHO CHOSE ink OR paper MUST LAND ON quiet, EXPLICITLY, and that is
// the whole reason `toSpine` below is not the one-line fallback it looks like
// it could be. `isSpine` now refuses "ink" and "paper" — they are not in
// `SPINE_VALUES` — so the OLD `toSpine` (an unrecognised value falls back to
// `DEFAULT_SPINE`) would silently move every person who deliberately picked
// the muted rail onto the loud one, because the default those two years ago
// was never mango. `toSpine` therefore checks the two retired values FIRST
// and sends them to `quiet` by name, before the allow-list even runs. Nobody
// who chose the quiet rail asked for the brand one; the mapping is the fix,
// the fallback below it is for a value that was never a spine at all.
//
// MANGO IS STILL THE FALLBACK for null, undefined, or genuine garbage — that
// half of the ruling did not move. The argument that used to run the other
// way (paper as the fallback, so a person who never opened Settings keeps the
// rail they always had) is kept below rather than deleted, because a default
// that changed under people once is exactly the thing the next reader arrives
// suspicious about.
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
// nobody can undo; this one is two cards away on the first screen of the
// product and two more in Settings for ever after.
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

export type Spine = "mango" | "quiet"

export const SPINE_VALUES: readonly Spine[] = ["mango", "quiet"]

export const DEFAULT_SPINE: Spine = "mango"

/** Is this a spine kwapso offers TODAY? The door's allow-list. `ink` and
 * `paper` are deliberately not here — see the header — a stored row can still
 * hold either, `toSpine` is where that gets resolved. */
export function isSpine(value: unknown): value is Spine {
  return typeof value === "string" && (SPINE_VALUES as readonly string[]).includes(value)
}

/** The spine a stored value means. Retired first: a person who chose `ink` or
 * `paper` before v1.2.28 lands on `quiet`, explicitly and by name — the muted
 * rail they picked, never the fallback (see the header for why that matters).
 * Anything else unrecognised, or missing, falls back to mango (the client's
 * ruling of 2026-09-02). A bad or missing value costs a person their
 * preferred rail; it can never cost them a screen. */
export function toSpine(value: string | null | undefined): Spine {
  if (value === "ink" || value === "paper") return "quiet"
  return isSpine(value) ? value : DEFAULT_SPINE
}
