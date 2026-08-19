// WHAT A TICKET NEEDS BEFORE IT CAN BE TRIAGED — one definition, read by the
// door that refuses and by the screen that explains.
//
// THE RULING (owner, 19 Aug 2026): "A ticket must always be linked to a client
// or app before being triaged. If that is not the case, then let it be in a
// pre-triage or draft state. Only when I assign it a client app and who made the
// ticket, and all of the fields that are already required, can it go into a
// triage state."
//
// SO `new` IS THE PRE-TRIAGE STATE, and no new status was added. `new` has
// always meant "raised, and nobody has read it yet", which is the same sentence
// as "pre-triage" — a `draft` beside it would be two names for one place, and
// every screen, filter, digest and machine tool that knows about `new` would
// have to learn the second one. What was missing was never a state: it was a
// REASON. A ticket sat at `new` and nothing said why it could not move, so the
// gate reports its gaps rather than just refusing.
//
// WHY THERE IS NO EXEMPTION FOR THE AGENCY'S OWN WORK. An earlier draft of this
// rule let a ticket with no client through on the grounds that our own
// housekeeping belongs to nobody. That was unenforceable: a ticket that is
// deliberately ours and a ticket where somebody forgot to say whose are the SAME
// ROW — both simply have no client (workers/content/src/lib/help.ts, on
// `accountForStaffTicket`: "correct for the agency's own internal questions, and
// silently wrong for everything else"). An exemption anybody can claim by
// leaving a field blank is not a rule. The owner closed it the other way: every
// ticket names a client, ours included.
//
// IT IS NOT A VALIDATION AT THE DOOR THAT CREATES A TICKET, deliberately. A
// person raising a request should not have to know which app it is about — that
// is precisely the judgement triage exists to make. So the fields stay optional
// on the way IN and become required on the way THROUGH.

/** The four facts a ticket must carry before it leaves the pre-triage state. */
export const TRIAGE_REQUIRES = ["type", "client", "app", "raisedBy"] as const

export type TriageGap = (typeof TRIAGE_REQUIRES)[number]

/** The ticket, in the only shape this question needs. Both callers map to it:
 * the worker off its database row, the screen off the ticket it is holding. */
export type TriageSubject = {
  helpType?: string | null
  accountId?: string | null
  appId?: string | null
  raisedByContactId?: string | null
}

/** WHAT IS STILL MISSING, in the order a person would fill it in. An empty array
 * means the ticket is ready; the caller never asks "is it ready" separately,
 * because two questions drift and one cannot. */
export function triageGaps(t: TriageSubject): TriageGap[] {
  const gaps: TriageGap[] = []
  if (!t.helpType?.trim()) gaps.push("type")
  if (!t.accountId?.trim()) gaps.push("client")
  if (!t.appId?.trim()) gaps.push("app")
  if (!t.raisedByContactId?.trim()) gaps.push("raisedBy")
  return gaps
}

/** The English name of each gap, for the door's refusal message. The SCREEN does
 * not use these — it translates its own, because a worker's error string is
 * outside the i18n catalogue (R28 walks the front doors' import closure). */
export const TRIAGE_GAP_ENGLISH: Record<TriageGap, string> = {
  type: "a ticket type",
  client: "a client",
  app: "an app",
  raisedBy: "who raised it",
}

/** "a client and an app" — the tail of the sentence the door refuses with. */
export function listGaps(gaps: TriageGap[]): string {
  const words = gaps.map((g) => TRIAGE_GAP_ENGLISH[g])
  if (words.length <= 1) return words[0] ?? ""
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`
}
