// WHERE AN APP HAS GOT TO — the eight stages, and the one thing each of them
// decides.
//
// They are not an enum. The eight names are seeded as ordinary values in the
// `App stage` dropdown group (SELECTABLE_GROUPS.appStage), so a team adds or
// retires one on the Dropdown values screen without a deploy — the same shape as
// the departments and the sprint types. What lives HERE is the part a dropdown
// row cannot carry on its own: the ORDER the agency reads them in, and whether a
// stage means the app is still being worked on or is put away.
//
// The names, marks and order are read off the legacy data
// (`glide/data/agency.choices.json`, rows where `Name` is "APPS" and the field is
// "Stage") rather than invented. The legacy spelling of one of them is
// "Mainteinance"; it is carried across as **Maintenance**, because a typo is not
// a vocabulary and the checklist names it correctly.
//
// THE ACTIVE / INACTIVE SPLIT is one boolean per stage, and the default for a
// stage the code has never met is ACTIVE. A team that invents "Pilot" should see
// its apps beside the ones being worked on, not filed away in Inactive — the
// harm of the wrong guess is asymmetric, and an app nobody can find is worse than
// an app in the wrong group.
//
// THE DOT COLOUR (client ruling, 2026-08-31): "the second pill with status (and
// color dot)". The six tones a status pill can carry are `Badge`'s own
// (`--dot-shipped/-building/-review/-blocked/-archived/-done`,
// shared/ui/components/badge/badge.tsx) — the reused vocabulary, not an eighth
// colour invented for apps. Reading the client's own screenshot back
// ("Maintenance" in a green dot) is what fixes the mapping rather than guessing
// it: green is `--dot-shipped`/`--dot-done` (the same token, twice-named), so a
// live, healthy app in Maintenance is `done`. The rest read off the same idea —
// still being worked on is `building` (the charcoal dot, "in build"), still being
// scoped is `review`, and put away is `archived`.

/** `Badge`'s own six dot tones (`shared/ui/components/badge/badge.tsx`'s
 * `BadgeDot`), restated here rather than imported: this file is compiled by
 * both front doors AND every worker (`workers/tenancy/src/team-schema.ts`
 * reads `APP_STAGES` for seed data), and `shared/ui/` is DOM-only — a
 * worker's tsconfig excludes it outright (no `--jsx`), so even a type-only
 * import of a `.tsx` module fails there (TS6142). Same six string literals,
 * so a value from here still satisfies the kit's `dot` prop structurally. */
export type DotTone = "shipped" | "building" | "review" | "blocked" | "archived" | "done"

/** One stage: what it is called, the mark somebody recognises it by, the colour
 * its status chip's dot takes, and whether an app sitting in it is finished
 * with. */
export type AppStage = {
  name: string
  /** the glyph the agency recognises it by — a TYPE MARK, never copy
   * (UI-CONVENTIONS §5): it sits where an icon sits and never inside a sentence.
   * A two-letter code, not a pictograph — client ruling, 2026-08-31: "there's an
   * emoji! i said no emojis", on the exact app-detail screen this glyph draws.
   * The legacy data (see the header note) carried an emoji per stage; this is
   * the same eight stages, the same one-glyph-per-stage shape, with the glyph
   * itself made of letters instead. */
  mark: string
  /** the status chip's dot tone — `Badge`'s own six, see the note above. */
  dotTone: DotTone
  /** true = the app is done or put away, so it belongs under Inactive */
  closed: boolean
}

export const APP_STAGES: AppStage[] = [
  { name: "Not started", mark: "NS", dotTone: "archived", closed: false },
  { name: "Blueprint", mark: "BP", dotTone: "review", closed: false },
  { name: "Development", mark: "DV", dotTone: "building", closed: false },
  { name: "Documentation", mark: "DC", dotTone: "building", closed: false },
  { name: "Iteration", mark: "IT", dotTone: "building", closed: false },
  { name: "Maintenance", mark: "MT", dotTone: "done", closed: false },
  { name: "Completed", mark: "OK", dotTone: "shipped", closed: true },
  { name: "Archived", mark: "AR", dotTone: "archived", closed: true },
]

/** The stage a name refers to, or null for one a team invented itself. */
export function appStage(name: string | null | undefined): AppStage | null {
  if (!name) return null
  return APP_STAGES.find((s) => s.name === name) ?? null
}

/** The mark for a stage, empty for one the code has never met. */
export function appStageMark(name: string | null | undefined): string {
  return appStage(name)?.mark ?? ""
}

/** The status chip's dot tone for a stage — `undefined` (no dot) for one the
 * code has never met, the same "reads as itself" answer `departmentGlyph`
 * gives for an invented department. */
export function appStageDotTone(name: string | null | undefined): DotTone | undefined {
  return appStage(name)?.dotTone
}

/** Is an app in this stage still being worked on? A stage nobody has told us
 * about counts as active — see the note at the top of this file. */
export function appStageIsActive(name: string | null | undefined): boolean {
  return !(appStage(name)?.closed ?? false)
}

/** The reading order for a stage — its place in APP_STAGES, and last for a stage
 * a team invented, so the eight the agency knows always come first. */
export function appStageOrder(name: string | null | undefined): number {
  const index = APP_STAGES.findIndex((s) => s.name === name)
  return index === -1 ? APP_STAGES.length : index
}

/** The word an app with no stage at all is grouped under. One string, so the
 * heading on the apps page and the label in a picker can never disagree. */
export const NO_STAGE = "No stage yet"
