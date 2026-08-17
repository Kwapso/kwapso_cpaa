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

/** One stage: what it is called, the mark somebody recognises it by, and whether
 * an app sitting in it is finished with. */
export type AppStage = {
  name: string
  /** the pictograph the agency already uses for it — a TYPE MARK, never copy
   * (UI-CONVENTIONS §5): it sits where an icon sits and never inside a sentence */
  mark: string
  /** true = the app is done or put away, so it belongs under Inactive */
  closed: boolean
}

export const APP_STAGES: AppStage[] = [
  { name: "Not started", mark: "◻️", closed: false },
  { name: "Blueprint", mark: "🧠", closed: false },
  { name: "Development", mark: "⚙️", closed: false },
  { name: "Documentation", mark: "📹", closed: false },
  { name: "Iteration", mark: "🚀", closed: false },
  { name: "Maintenance", mark: "🔌", closed: false },
  { name: "Completed", mark: "✅", closed: true },
  { name: "Archived", mark: "🗄️", closed: true },
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
