// A WAVE — what a client BOUGHT: a package of sprints.
//
// The owner's own example is the whole definition: "Alex sells Hogo a package —
// he maps their processes, builds two automations, they test it, he trains them.
// Three weeks later he sells a second, identical package." That is TWO waves,
// and they are told apart by their NAME and their DATES, never by a kind.
//
// THREE RULINGS ARE BUILT INTO THIS SHAPE, and each of them is a decision that
// was made once and must not be re-made by whoever writes the next screen:
//
//   • THERE IS NO PRICE ON A WAVE, and nothing here reaches the internal rate
//     card or the account rate card. The owner ruled the money out of the first
//     version four separate times — "leave the whole internal_rates and
//     account_rates out of V1… This is a fix decision" — which is why the `waves`
//     table has no price column for a field here to mirror. R24 forbids an
//     internal number reaching the client's side at all, so the safe shape is
//     the one that cannot carry one.
//
//   • THE DATES ARE DERIVED FROM THE SPRINTS AND STORED. `startsOn` is the
//     earliest start of the live sprints in the wave and `endsOn` the latest
//     end, recalculated whenever a sprint is added, moved or removed — never
//     computed per row on a read, because a list of waves would then be a
//     sub-query per row for a number that changes a handful of times a year.
//
//   • BOTH DATES ARE NULLABLE, and that is a real state rather than a gap: a
//     wave is sold before anybody plans the sprints inside it, so a wave with no
//     sprints has no dates and is perfectly ordinary.
//
// The shapes live here rather than beside the SQL for the same reason every
// other record's do: the workers produce them and both front doors read them, so
// one master copy is the only way the two halves cannot drift.

/** ONE WAVE, as the tenancy worker lists it. */
export type Wave = {
  id: string
  /** The client who bought it. A wave always belongs to one. */
  accountId: string
  accountName: string | null
  name: string
  /** What the package is for, in the team's own words. */
  goal: string | null
  /** DERIVED from the sprints inside it and STORED — see the header. Null until
   * a sprint with dates is put in the wave. */
  startsOn: string | null
  endsOn: string | null
  /** How many live sprints are in it. Read in the same statement as the row, so
   * a list of waves is one round trip rather than one per wave. */
  sprintCount: number
  /** Deactivate, never delete — a switched-off wave is still the package a
   * two-year-old sprint was sold inside. */
  active: boolean
  createdAt: string
  createdByName: string | null
  updatedAt: string | null
  editedByName: string | null
}

/** A SPRINT, as a wave's screen shows it: enough to name it, date it and say
 * whether it is still live. Never the sprint's price — that is the work engine's
 * record to show, on the sprint's own screen. */
export type WaveSprint = {
  id: string
  waveId: string | null
  accountId: string | null
  name: string
  startsOn: string | null
  endsOn: string | null
  active: boolean
}

/** TWO SPRINTS IN ONE WAVE WHOSE DATES OVERLAP.
 *
 * A WARNING, NEVER A REFUSAL. Aurora's ruling, and it is about what really
 * happens rather than what would be tidy: "warn, but we can save it (it can
 * happen…)". Two sprints of one package genuinely can run over each other — a
 * build that slips into the week the training was booked for — and a door that
 * refused the save would leave the team unable to record the truth. So the write
 * lands, the response carries this, and the screen says it out loud. */
export type WaveOverlap = {
  firstId: string
  firstName: string
  secondId: string
  secondName: string
}
