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
  /** WHAT AN HOUR OF THE PERSON DOING IT COSTS THE CLIENT, in cents, AS IT WAS
   * WHEN THE STEP WAS RECORDED — never today's rate.
   *
   * The owner's ruling, and it is the architecture half of the tie-breaker: "even
   * if the cost changes, they have to be retained as they were at the time we
   * recorded them". A saving computed live from today's rate would rewrite a
   * figure a client already agreed, the day somebody gave a payroll rise — their
   * own number moving because of something they did, with nothing on screen
   * saying so.
   *
   * `null` means nobody has said yet, which is a real answer and deliberately
   * not zero: zero reads as "this person is free" and comes out of the
   * arithmetic as a saving of nothing with nothing to flag that a number is
   * missing. A null here produces hours with NO money beside them. */
  roleCentsPerHour?: number | null
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
  /** THE HOURS, IN THE CLIENT'S OWN MONEY. Null when no hourly cost is known —
   * see roleCentsPerHour. Never 0 for "unknown", because 0 is a real saving. */
  savedCentsPerMonth: number | null
  /** a step that now takes LONGER than the baseline. Information, not a mistake
   * — internal screens always show it (see the regression rule in BUILD-3 §3). */
  regression: boolean
}

/** A process's savings: the roll-up, and the steps it is made of. */
export type ProcessSaving = {
  processId: string
  name: string
  savedSecondsPerMonth: number
  /** The money the hours above are worth, summed from the steps that HAVE a
   * rate. See `pricedSteps` for why the two counts travel with it. */
  savedCentsPerMonth: number
  /** How many of this process's steps carry an hourly cost, and how many there
   * are. A figure built from four steps out of nine is not wrong, it is
   * INCOMPLETE — and a screen that cannot tell the difference will quote it to a
   * client as if it were the whole picture. */
  pricedSteps: number
  totalSteps: number
  steps: StepSaving[]
}

/** An app's savings: the roll-up, and the processes it is made of. */
export type AppSaving = {
  appId: string
  name: string
  savedSecondsPerMonth: number
  savedCentsPerMonth: number
  pricedSteps: number
  totalSteps: number
  processes: ProcessSaving[]
}

/** The whole drill-down, App → Process → Step, with its total at the top. */
export type SavingsView = {
  savedSecondsPerMonth: number
  savedCentsPerMonth: number
  pricedSteps: number
  totalSteps: number
  apps: AppSaving[]
  /** the sentence that ships with the number — never assembled at a call site. */
  caption: string
}

/** HOW OFTEN, IN THE PERIOD SOMEBODY ACTUALLY SAYS IT IN.
 *
 * "Twice a day" and "forty times a month" are the same fact, and asking a person
 * to convert it in their head at the moment they are describing their own job is
 * how a wrong number gets typed. So the form takes the period, and everything
 * downstream converts to MONTHS here — one function, so a week can never be 4 in
 * one file and 4.33 in another.
 *
 * A month is 365.25 / 12 days, not 30: thirty would lose five days a year, which
 * on a daily step is a fortnight of work missing from an annual figure. */
export const PERIODS = ["day", "week", "month", "year"] as const
export type FrequencyPeriod = (typeof PERIODS)[number]
const PER_MONTH: Record<FrequencyPeriod, number> = {
  day: 365.25 / 12,
  week: 365.25 / 84,
  month: 1,
  year: 1 / 12,
}
export function runsPerMonthFrom(count: number, period: FrequencyPeriod | string): number {
  const per = PER_MONTH[period as FrequencyPeriod] ?? 1
  const n = typeof count === "number" && Number.isFinite(count) && count > 0 ? count : 0
  // ROUNDED ONCE, HERE. A step run daily is 30.4 times a month; carrying the
  // fraction into the multiplication and rounding at the screen would make the
  // steps of a process fail to add up to the process, which is the exact shape
  // of a number a client stops believing.
  return Math.round(n * per)
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
    // THE SAME SUBTRACTION, IN THEIR MONEY. Seconds → hours → cents, in that
    // order and rounded once at the end, so a step's euros and its hours are the
    // same fact rather than two roundings of it.
    //
    // NULL, NOT ZERO, when nobody has priced the role. The distinction is the
    // whole reason this is nullable: a step nobody has priced contributes no
    // money AND says so, where a zero would quietly claim the work is free.
    savedCentsPerMonth:
      typeof figures.roleCentsPerHour === "number" && figures.roleCentsPerHour >= 0
        ? Math.round((perMonth / 3600) * figures.roleCentsPerHour)
        : null,
    // A step that is slower but never runs is not a regression anybody feels, and
    // showing one would spend the client's attention on nothing. The test is what
    // it costs per MONTH, which is the number on the screen.
    regression: savedSecondsPerRun * runsPerMonth < 0,
  }
}

/** Roll one process up from its steps. */
function processSaving(
  process: { processId: string; name: string },
  steps: StepFigures[]
): ProcessSaving {
  const computed = steps.map(stepSaving)
  const priced = computed.filter((s) => s.savedCentsPerMonth !== null)
  return {
    ...process,
    savedSecondsPerMonth: computed.reduce((n, s) => n + s.savedSecondsPerMonth, 0),
    savedCentsPerMonth: priced.reduce((n, s) => n + (s.savedCentsPerMonth ?? 0), 0),
    pricedSteps: priced.length,
    totalSteps: computed.length,
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
      savedCentsPerMonth: processes.reduce((n, p) => n + p.savedCentsPerMonth, 0),
      pricedSteps: processes.reduce((n, p) => n + p.pricedSteps, 0),
      totalSteps: processes.reduce((n, p) => n + p.totalSteps, 0),
      processes,
    }
  })
  rolled.sort((a, b) => b.savedSecondsPerMonth - a.savedSecondsPerMonth)
  return {
    savedSecondsPerMonth: rolled.reduce((n, a) => n + a.savedSecondsPerMonth, 0),
    savedCentsPerMonth: rolled.reduce((n, a) => n + a.savedCentsPerMonth, 0),
    pricedSteps: rolled.reduce((n, a) => n + a.pricedSteps, 0),
    totalSteps: rolled.reduce((n, a) => n + a.totalSteps, 0),
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
