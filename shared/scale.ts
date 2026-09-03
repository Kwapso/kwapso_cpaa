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
//
// ── THIS CONTROL SUPERSEDES THE DESIGN KIT'S, AND THE KIT SAYS SO ──────────
//
// The kwapso kit ships a text-size control of its own: `data-scale` on <html>,
// three steps at 13 / 15 / 17px, and ruling 18 saying "both doors default to
// 15". Two mechanisms doing one job is one too many, so one had to win.
//
// This one does, on the kit's own instruction. `tokens.css` names its standing
// law in its header: "CLAUDE.md — overrides the kit where the two disagree".
// And they disagree on the half that matters: ruling 18 gives both doors the
// same default, while UI-RULEBOOK L5 is a LOCKED decision that the portal reads
// a step larger than the agency app, because the portal is a reading surface for
// one client and the agency app is a working surface. A single number cannot say
// that, which is why each step here carries two.
//
// It is also the mechanism that actually wins at runtime: `applyScale` sets an
// inline `style.fontSize` on <html>, and an inline style beats any
// `:root[data-scale=…]` rule regardless of which was intended. So adopting the
// kit's attribute would have changed nothing except how many places a reader has
// to look.
//
// What DID come across from the kit is the discipline underneath: every size is
// rem against a 16px authoring base, and a px value in consuming code silently
// opts that property out of this control. That is why the reskin deleted 54
// hand-set `text-[10px]`-family sizes rather than re-tuning them.
//
// ── AND IT IS WHY THE HEADING-SIZE PROPOSAL WAS DECLINED (3 Sep 2026) ──────
//
// An open design decision asked whether a page title and a record heading
// should grow from 32px to 44, and the portal's title from 24 to 32 — the
// reference PDF names three roles ("Page title" 56, "Record heading" 44,
// "Section title" 32) and both doors currently spend the smallest of them on
// their largest thing. The owner declined all three, and the reason IS this
// file: a person who wants bigger headings already has a control that gives
// them bigger headings, across the whole app, without anybody choosing a number
// on their behalf. `large` moves the agency app to 18px and the portal to 19,
// and because every size in the theme is rem, a title moves with it.
//
// THAT REASONING ONLY HOLDS WHILE THE HEADINGS ARE REM, which is the sentence
// worth keeping. A heading hand-set in px would sit still while every step of
// this control moved around it — the setting would look broken on exactly the
// text a person raised the setting to fix. So the paragraph above is not
// housekeeping: it is the precondition of the answer given here.
//
// WHAT WAS NOT SETTLED, so nobody reads more into this than was decided: the
// kit's own `Title` primitive stops at 32 and has no 44 rung, while `Headline`
// draws 44 and 56 and is wired to nothing. That mismatch is still on file
// upstream. The ruling is that we are not spending the app's headings to fix
// it, not that it is fixed.

/** One step: the root font size it sets on each front door. `agencyPx` is
 * `web/`; `portalPx` is `web-portal/`. Carries no `label` — `scale-section.tsx`
 * is the one reader of a step's name and declares its own `t("Compact")`-
 * style literal per option (the ordinary translation shape, `wrapped-strings`
 * checks it directly), rather than this table holding an English word for a
 * translator to find one directory outside the front doors' own walk. */
export type ScaleStep = {
  value: string
  agencyPx: number
  portalPx: number
}

export const SCALE_STEPS: ScaleStep[] = [
  { value: "compact", agencyPx: 15, portalPx: 16 },
  { value: "comfortable", agencyPx: 16, portalPx: 17 },
  { value: "large", agencyPx: 18, portalPx: 19 },
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
function toScale(value: string | null | undefined): ScaleStep {
  return SCALE_STEPS.find((s) => s.value === value) ?? SCALE_STEPS[1]
}

/** The root font size, in pixels, for one front door. */
export function scaleFontSize(value: string | null | undefined, door: "agency" | "portal"): number {
  const step = toScale(value)
  return door === "agency" ? step.agencyPx : step.portalPx
}
