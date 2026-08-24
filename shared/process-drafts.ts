// WHAT AN EXTRACTION PROPOSES — the shape of a draft process map, shared by the
// worker that writes it and the screen that reviews it.
//
// THE DRAFT IS NOT THE RECORD. That sentence is the whole reason this file
// exists as a payload shape rather than as rows: with eleven proposed steps and
// nobody having touched anything, what is on the client's record is NOTHING.
// A draft normalised into `process_steps` would be indistinguishable from the
// map the moment anybody read it slightly wrong — a screen that forgot one
// `WHERE`, an export, a savings roll-up — and a client would be shown a figure
// derived from words a model put in their mouth. So a proposal lives in ONE
// JSON column of ONE table (`process_drafts.payload`, migration 0054) until a
// person applies it, and applying goes through the map's OWN doors.
//
// THERE ARE NO USER-VISIBLE SENTENCES IN THIS FILE, deliberately. Both front
// doors import it, so R28 walks it, and a sentence declared at module level
// cannot be wrapped in `t(...)` where it is written (`t` is a hook). Every word
// a person reads about a draft is written at the screen.
//
// THE KEYS ARE THE DRAFT'S OWN. A proposed step is named by a `key` this
// extraction minted, never by a `step_key` from the map — a proposal has no
// place in the map's identity space until somebody agrees to it. A proposal that
// REVISES an existing step carries that step's real id in `revisesStepId`, which
// is the one crossing point, and it is a single named field rather than an
// ambiguity spread across the shape.

import type { FrequencyPeriod } from "./workers/savings"

/** The three KINDS a person confirms separately — the ruling both respondents
 * gave, in the order the review screen shows them: "you can accept the steps and
 * reject the tools".
 *
 * They are separate decisions because they are separate KINDS OF CLAIM. That a
 * step happens is something the client said out loud. That it is done by the
 * dispatch clerk rather than the adjuster, or in the spreadsheet rather than the
 * inbox, is an inference — the same sentence supports several readings, and the
 * one the model picked is the one worth doubting on its own. */
export const DRAFT_KINDS = ["steps", "roles", "tools"] as const
export type DraftKind = (typeof DRAFT_KINDS)[number]

/** ONE PROPOSED STEP.
 *
 * The durations are AGREED ESTIMATES, and that is not a caveat on this type — it
 * is what the whole savings arithmetic already says about every duration in the
 * app (`SAVINGS_CAPTION`, shared/workers/savings.ts). What is different here is
 * that nobody has agreed them yet: a model read them out of a conversation. So
 * `secondsPerRun` and `runsPerPeriod` are ZERO whenever the call did not actually
 * say, and `askAbout` is how the extraction says so — a zero it invented and a
 * zero somebody stated are the same number, and only one of them is a question. */
export type DraftStep = {
  /** This draft's own name for this step. Stable within one payload; meaningless
   * outside it. What a keep/drop decision names. */
  key: string
  name: string
  description: string | null
  /** Where it sits in the order the call described it. */
  position: number
  /** How long one run takes, in whole seconds. 0 = the call did not say. */
  secondsPerRun: number
  /** How often, in the period a person actually said it in — never converted
   * here (shared/workers/savings.ts `runsPerMonthFrom` owns that conversion). */
  runsPerPeriod: number
  frequencyPeriod: FrequencyPeriod
  /** WHO DOES IT — by this draft's own role key, resolved to one of the client's
   * roles through `roles` below. Null is ordinary: a process is mapped in the
   * room, before anybody has looked up who sits at which desk. */
  roleKey: string | null
  /** WHAT IT IS DONE IN — one, by both respondents' ruling. Same indirection. */
  toolKey: string | null
  /** THE STEP THIS REVISES, when a SECOND call is about a process we already
   * hold. A revision is applied as an edit of that step, which writes a dated
   * revision the way every other edit does — never a duplicate step, and never a
   * second map (ruling 5). Null proposes a NEW step. */
  revisesStepId: string | null
  /** WHAT THE CALL DID NOT SAY, in the extraction's own words — the sentence a
   * reviewer is meant to go and ask about. Empty when nothing is missing. */
  askAbout: string | null
}

/** A ROLE the call named, and the client's own role it was matched to.
 *
 * `matchedId` NULL means the words named somebody who is not on this client's
 * record yet. It stays in the payload — a proposal a person can read and go and
 * act on is worth more than one silently dropped — but it cannot be applied,
 * because `addStep` resolves a role through the client's own rows and refuses
 * anything else. Nothing here invents a role: this module writes to
 * `process_steps` through the map's doors and to no other table at all. */
export type DraftMatch = {
  key: string
  /** the words the call used */
  said: string
  /** the client's own row this was matched to, or null for "not one of theirs" */
  matchedId: string | null
  /** that row's own name, so the screen can show what it matched WITHOUT a
   * second lookup and without trusting the model's spelling of it */
  matchedName: string | null
}

/** THE WHOLE PROPOSAL, as it sits in `process_drafts.payload`. */
export type ProcessDraftPayload = {
  /** What the extraction would call this process. Advisory only — applying a
   * draft never renames a map somebody already named. */
  processName: string | null
  /** One sentence saying what the extraction understood the process to be. */
  summary: string | null
  steps: DraftStep[]
  roles: DraftMatch[]
  tools: DraftMatch[]
}

/** An empty proposal — what a model answer that parsed to nothing becomes, so a
 * caller never has to tell `null` from "it found nothing". */
export const EMPTY_DRAFT: ProcessDraftPayload = {
  processName: null,
  summary: null,
  steps: [],
  roles: [],
  tools: [],
}

/** THE STATUSES the table's own CHECK constraint allows (migration 0054). */
export const DRAFT_STATUSES = ["proposed", "applied", "discarded"] as const
export type DraftStatus = (typeof DRAFT_STATUSES)[number]

/** One draft in a list — everything a row needs, and not the payload, which is
 * a whole conversation's worth of JSON and belongs on the screen that opens it. */
export type ProcessDraftSummary = {
  id: string
  accountId: string | null
  appId: string | null
  processId: string | null
  processName: string | null
  /** the meeting the words came from, when they came from one */
  sourceMeetingId: string | null
  /** true when somebody pasted the words instead */
  hasSourceText: boolean
  status: DraftStatus
  /** how many of each kind it proposes — the tab badges, counted off the payload
   * once on the server rather than by every screen that lists a draft */
  stepCount: number
  roleCount: number
  toolCount: number
  appliedAt: string | null
  createdAt: string
  createdByName: string | null
}

/** One draft opened: the row, and the proposal itself. */
export type ProcessDraftDetail = {
  draft: ProcessDraftSummary
  payload: ProcessDraftPayload
  /** the sentence every screen showing one of these durations must render, word
   * for word (R25) — carried WITH the numbers, never assembled at a screen */
  savingsCaption: string
}

/** WHAT SURVIVED THE REVIEW — the only thing `applyDraft` acts on.
 *
 * Three arrays of KEPT keys rather than a flag per kind plus a list per row,
 * because both decisions are the same decision at two altitudes: rejecting the
 * tools is dropping every tool. One mechanism cannot disagree with itself, and a
 * door reading one shape cannot apply a kind somebody rejected because a flag
 * defaulted to true somewhere. An absent array is an empty one: nothing is ever
 * applied because it was not mentioned. */
export type DraftDecisions = {
  keepSteps: string[]
  keepRoles: string[]
  keepTools: string[]
}

/** What one apply actually did — returned by the door, and said in the activity
 * row, because "7 of 11" is the sentence a reviewer needs and "applied" is not. */
export type DraftApplyResult = {
  /** false when the draft had already been applied or discarded (R17: the second
   * press moves zero rows, writes no steps and says so). */
  applied: boolean
  stepsAdded: number
  stepsRevised: number
  /** proposals the reviewer kept that could not be written — a revision whose
   * step has since moved to an older version, a role that is not the client's. */
  skipped: number
}
