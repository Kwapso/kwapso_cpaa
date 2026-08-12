// WHAT EACH RECORD IS ABOUT — the piece the old design was missing, and the
// reason routing here is a decision rather than a guess.
//
// The owner's picture: "the agent already knows what each notebook contains."
// That is not a property a search can have by trying harder. It is a property of
// having READ the covers first. So every record the knowledge base mirrors —
// every account, app, ticket, sprint and story — carries a short written summary
// of itself, and those summaries are searched BEFORE any material is.
//
// A question arrives → the summaries are searched → the handful of records the
// question is plausibly about come back → THEIR ids become the filter the real
// search runs under. Two queries instead of one, and the second one is looking
// in the right place.
//
// ════════════════════════════════════════════════════════════════════════════
// WHY NO MODEL WRITES THESE
//
// The obvious build is "ask an LLM to summarise each record". It was rejected on
// four counts, and the fourth is the one that settles it:
//
//   • COST. 4,000 records re-summarised whenever they change is a recurring
//     model bill against a €50/month ceiling, for text nobody reads.
//   • LATENCY. A summary has to exist the moment a ticket does (rule 4: instant,
//     silent). A generated one arrives when the queue gets to it.
//   • DRIFT. A generated summary is a SECOND account of the record, written once
//     and then wrong — the status moves and the sentence still says "in
//     progress". A derived one cannot drift, because it is rebuilt from the row
//     every time the row changes.
//   • TRUTH. This is the text the router decides on. A summary that hallucinated
//     an account name would send a question into the wrong client's material,
//     and the answer would look perfectly well-sourced. Everything below is
//     COPIED from columns; there is nowhere for an invention to enter.
//
// WHAT WOULD CHANGE OUR MIND: material whose subject is genuinely not in any
// column — a 90-minute transcript, where "what was this call about" is real work
// and no field holds it. When transcripts land, the honest shape is a generated
// summary for THAT kind alone, written once at ingest, with the derived line
// still carrying the facts (who, when, which client) beneath it.

/** How long a summary may be. Long enough to name the thing, whose it is, what
 * state it is in and what it is for; short enough that a hundred of them are a
 * cheap read and one embedding each is a rounding error. A summary that grew
 * into a second copy of the body would make the router's search as expensive as
 * the search it exists to narrow. */
export const SUMMARY_MAX_CHARS = 480

/** The facts a record hands over to be summarised. Deliberately flat and
 * deliberately strings: every value here is a column, so a caller cannot pass
 * something derived without it being obvious in the caller. */
export type SummaryFacts = {
  /** what kind of record this is, in the glossary's own word ("ticket", "app"). */
  noun: string
  /** what it is called. */
  title: string
  /** its reference, if it has one. */
  ref?: string | null
  /** whose it is. */
  accountName?: string | null
  /** where it is in its life ("in progress", "completed", "live"). */
  status?: string | null
  /** the record's own opening words — its description, goal or detail. */
  detail?: string | null
  /** anything else worth one clause, already in words ("Sprint 4", "due 3 March"). */
  notes?: (string | null | undefined)[]
}

/** THE ONE SUMMARY SENTENCE, built the same way for every kind so that a router
 * comparing an app to a ticket is comparing like with like.
 *
 * Shape: "<Title> — a <noun> for <client>, <status>. <its own first words>"
 *
 * It reads as a sentence on purpose. The router does not grep it, it EMBEDS it,
 * and an embedding of "Ticket. Bergman. bug. open." is a bag of labels pointing
 * nowhere in particular, while an embedding of a sentence about a dispatch app
 * that keeps logging drivers out sits next to the question a person would ask. */
export function buildSummary(facts: SummaryFacts): string {
  const who = facts.accountName ? ` for ${facts.accountName}` : ""
  const ref = facts.ref ? ` (${facts.ref})` : ""
  const state = facts.status ? `, ${facts.status}` : ""
  const opening = `${facts.title}${ref} — a ${facts.noun}${who}${state}.`
  const extras = (facts.notes ?? []).filter(Boolean).join(" ")
  const detail = firstSentences(facts.detail ?? "", SUMMARY_MAX_CHARS - opening.length - extras.length - 2)
  return [opening, extras, detail].filter(Boolean).join(" ").slice(0, SUMMARY_MAX_CHARS).trim()
}

/** As much of a record's own words as fits, cut at a sentence boundary rather
 * than mid-word — a summary ending "the dispatch screen keeps logging dri" is
 * worse than one sentence shorter, both to read and to embed. */
function firstSentences(text: string, budget: number): string {
  const clean = text.replace(/\s+/g, " ").trim()
  if (budget <= 20 || !clean) return ""
  if (clean.length <= budget) return clean
  const cut = clean.slice(0, budget)
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "))
  return (stop > budget * 0.4 ? cut.slice(0, stop + 1) : cut.slice(0, cut.lastIndexOf(" "))).trim()
}
