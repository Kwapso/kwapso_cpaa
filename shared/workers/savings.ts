// THE SAVINGS ARITHMETIC — the one place a "hours saved" number is produced.
//
// WHY IT IS A PURE FUNCTION IN ITS OWN FILE. The owner named three things that
// would make him abandon this and go back to a spreadsheet, and one of them was
// "the numbers stop being believable". A savings figure a client cannot drill
// into is worse than no figure at all: the first time they question it and
// nobody can answer, every other number in the app loses its credit too.
//
// So the calculation takes rows in and hands the WHOLE derivation back — the
// step, its baseline, its latest, how often it runs, and the multiplication —
// rather than a total. "Where does 208 hours come from?" is then three clicks
// (App → Process → Step) instead of an argument, and this file is the one place
// anybody has to read to check the maths.
//
// THE SENTENCE, from SCOPE and non-negotiable: savings = the BASELINE version's
// duration minus the LATEST version's duration, times how often the step runs.
// The inputs are agreed estimates; the subtraction is arithmetic. Both halves of
// that caption ship WITH the number (see SAVINGS_CAPTION) — a client who
// understands it trusts the figure, and one who thinks we held a stopwatch stops
// trusting everything the day one figure looks wrong.

/** The caption every screen showing a savings figure renders, word for word.
 *
 * It lives here, beside the arithmetic it describes, because the two are one
 * feature: the number is only honest while the sentence is next to it. Law R25
 * fails the build if a screen renders the figure without it. */
export const SAVINGS_CAPTION =
  "The times in these steps are estimates we agreed with you. The subtraction is arithmetic."

/** One step, as the two versions describe it. `runsPerMonth` is the LATEST
 * version's frequency — how often the work happens NOW — which is what makes the
 * plain sentence true for a step we removed entirely: the cut carries a removed
 * step forward with its frequency intact and its duration at zero, so the saving
 * is the whole of the old work rather than nothing at all. */
export type StepFigures = {
  stepKey: string
  name: string
  /** version 1 — how long it took before we touched anything. */
  baselineSecondsPerRun: number
  /** the newest version — how long it takes now. */
  latestSecondsPerRun: number
  runsPerMonth: number
  /** true once the step no longer happens at all. */
  removed: boolean
  /** A STAFF EXPLANATION IS ATTACHED to this step (a comment on the map naming
   * it). It matters for exactly one case: a step that got SLOWER. Internal
   * screens always show a regression, because a step that got slower is
   * information; the client's side shows it too — no filter hides one, and the
   * totals never quietly drop it — with our explanation of why beside it. This
   * flag is what lets a screen tell "explained" from "we owe them a sentence". */
  explained: boolean
}

/** One step's saving, with every input it was computed from still attached. */
export type StepSaving = StepFigures & {
  /** baseline − latest. NEGATIVE means the step got slower. */
  savedSecondsPerRun: number
  /** savedSecondsPerRun × runsPerMonth. */
  savedSecondsPerMonth: number
  /** a step that now takes LONGER than the baseline. Information, not a mistake
   * — internal screens always show it (see the regression rule in BUILD-3 §3). */
  regression: boolean
}

/** A process's savings: the roll-up, and the steps it is made of. */
export type ProcessSaving = {
  processId: string
  name: string
  savedSecondsPerMonth: number
  steps: StepSaving[]
}

/** An app's savings: the roll-up, and the processes it is made of. */
export type AppSaving = {
  appId: string
  name: string
  savedSecondsPerMonth: number
  processes: ProcessSaving[]
}

/** The whole drill-down, App → Process → Step, with its total at the top. */
export type SavingsView = {
  savedSecondsPerMonth: number
  apps: AppSaving[]
  /** the sentence that ships with the number — never assembled at a call site. */
  caption: string
}

/** Whole seconds, or zero. A duration is typed INTEGER NOT NULL with a
 * non-negative CHECK at the boundary it enters through, but this function is
 * also handed rows that came back from a join where a missing side is null — a
 * step that only exists in one version — and `null - 3` is NaN, which would
 * poison a total all the way to the top of the drill-down without ever throwing.
 * A missing side means "this step did not exist in that version", which is zero
 * seconds of work, which is exactly what a client would say it was. */
function seconds(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/** ONE step's saving. The whole law of this build, in three lines. */
export function stepSaving(figures: StepFigures): StepSaving {
  const baselineSecondsPerRun = seconds(figures.baselineSecondsPerRun)
  const latestSecondsPerRun = seconds(figures.latestSecondsPerRun)
  const runsPerMonth = seconds(figures.runsPerMonth)
  const savedSecondsPerRun = baselineSecondsPerRun - latestSecondsPerRun
  const perMonth = savedSecondsPerRun * runsPerMonth
  return {
    ...figures,
    baselineSecondsPerRun,
    latestSecondsPerRun,
    runsPerMonth,
    savedSecondsPerRun,
    // NORMALISED THROUGH ZERO, and it is not pedantry. A step that got slower and
    // runs zero times a month multiplies out to NEGATIVE zero, which every
    // arithmetic check treats as zero and `(-0).toLocaleString()` renders as
    // "-0" — so the screen whose entire job is being believable would show a
    // client "-0 hours a month" on a step that costs them nothing.
    savedSecondsPerMonth: perMonth === 0 ? 0 : perMonth,
    // A step that is slower but never runs is not a regression anybody feels, and
    // showing one would spend the client's attention on nothing. The test is what
    // it costs per MONTH, which is the number on the screen.
    regression: savedSecondsPerRun * runsPerMonth < 0,
  }
}

/** Roll one process up from its steps. */
export function processSaving(
  process: { processId: string; name: string },
  steps: StepFigures[]
): ProcessSaving {
  const computed = steps.map(stepSaving)
  return {
    ...process,
    savedSecondsPerMonth: computed.reduce((n, s) => n + s.savedSecondsPerMonth, 0),
    steps: computed,
  }
}

/** Roll the whole picture up, App → Process → Step, newest saving first.
 *
 * The order is deliberate: the biggest saving is the one a client asks about,
 * and it should be the one they can reach without scrolling. A REGRESSION sorts
 * to the bottom rather than being dropped — it is information, and the one place
 * it is ever withheld is the portal, which withholds it by having no staff
 * explanation attached, never by filtering it out here. */
export function savingsView(
  apps: { appId: string; name: string; processes: { processId: string; name: string; steps: StepFigures[] }[] }[]
): SavingsView {
  const rolled: AppSaving[] = apps.map((app) => {
    const processes = app.processes
      .map((p) => processSaving({ processId: p.processId, name: p.name }, p.steps))
      .sort((a, b) => b.savedSecondsPerMonth - a.savedSecondsPerMonth)
    return {
      appId: app.appId,
      name: app.name,
      savedSecondsPerMonth: processes.reduce((n, p) => n + p.savedSecondsPerMonth, 0),
      processes,
    }
  })
  rolled.sort((a, b) => b.savedSecondsPerMonth - a.savedSecondsPerMonth)
  return {
    savedSecondsPerMonth: rolled.reduce((n, a) => n + a.savedSecondsPerMonth, 0),
    apps: rolled,
    caption: SAVINGS_CAPTION,
  }
}

/** Hours, to one decimal place, from whole seconds — the unit every screen shows
 * a saving in, rounded ONCE here so the drill-down's parts always add up to the
 * total a client reads at the top. Rounding at each level instead would make
 * three steps of 0.4 hours a process of "1.2" beside an app of "1.0", which is
 * the exact shape of an unbelievable number. */
export function savedHours(seconds: number): number {
  return Math.round((seconds / 3600) * 10) / 10
}

/** Hours, said the way a person says them — the SPELLING of the figure above,
 * kept beside the rounding rather than at each screen.
 *
 * It lives here for the reason `shared/web/money.ts` exists: both front doors
 * show this number, and the two copies that used to render it had already
 * drifted in their wording ("1 hours" was one keystroke away in each). A
 * formatter knows no table, no door and no audience, so it is safe on both
 * sides of the fence — and the rounding it spells happens ONCE, in savedHours,
 * so the steps inside an app always add up to the app's own figure. */
export function hoursText(seconds: number): string {
  const hours = savedHours(Math.abs(seconds))
  return `${hours.toLocaleString()} ${hours === 1 ? "hour" : "hours"}`
}

/** Minutes, for a step's own before/after — nobody describes one step in hours. */
export function minutesText(seconds: number): string {
  return `${Math.round(seconds / 60).toLocaleString()} min`
}
