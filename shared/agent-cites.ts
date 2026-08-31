// THE CITATION MARK — one declaration the model's prompt and the app's renderer
// both read, so the assistant can never write a mark the app cannot draw.
//
// The SHAPE of a citation is not decided here and must not be: the design kit
// ruled it (RULING D7-2, shared/ui/components/agent-chat/agent-chat.tsx) and the
// kit draws it — a superscript `<Cite for="…">` where the claim is made, and a
// numbered `collection · record` pill underneath the turn. What is decided here
// is the far smaller question the kit cannot answer: how a MODEL, which writes a
// string, says "the mark goes here".
//
//     Three of the four overdue invoices are on the Ostwald retainer[[src:01J…]].
//
// WHY THIS SPELLING.
//   · It survives `escapeText`. The reply is untrusted, so it is escaped before
//     anything else happens to it; a mark built from < or & would come out the
//     other side as an entity and the renderer would never find it.
//   · It is not markdown. `[[` is not a link, an emphasis or a fence, so a model
//     that has never heard of this — or a transcript replayed into a plain-text
//     client — degrades to a visible, honest breadcrumb rather than to markup.
//   · It names the SOURCE, never a number. The kit's ruling is explicit that the
//     number is the source's position in the turn's own list and is derived, so a
//     model that numbered by hand and then re-ordered would be the one thing the
//     ruling exists to prevent.
//
// AND A MARK THE TURN CANNOT BACK IS DRAWN AS NOTHING. `Cite` renders null when
// its `for` names no source under that turn, so a model reaching back to an
// earlier question's passages produces no superscript at all. That is the
// boundary being cleaned rather than the instruction being trusted: on 26 Aug
// 2026 the compose path measured 10 answers in 16 appending a source list the
// prompt had told it not to write, so "the model was asked nicely" is not a
// defence this base accepts any more.
//
// A KNOWN LIMIT, WRITTEN DOWN RATHER THAN FIXED (31 Aug 2026). R23 makes
// retrieval hand back real passages and real sources — it does not, and cannot,
// stop the model writing something ungrounded in the PROSE BETWEEN two marked
// claims. Measured on staging: asked to summarise a meeting, the reply carried
// six real citations, correctly marked, AND a specific enumeration ("the four
// payment branches: flu-private, flu-com...") that appears in NO indexed
// source at all — the real passage says only "the four payment branches",
// unnamed. `splitCites` faithfully renders whatever the model wrote; it has no
// way to know a run of unmarked text is invented rather than a fair paraphrase
// of the passage either side of it, because the two look identical on the wire.
// The mark proves a claim HAS a source; it says nothing about the sentence
// standing next to it that has none. Closing this gap — verifying an unmarked
// span against the passages it sits beside, or requiring a mark on any specific
// enumerated detail — is a real project, not a line here.

import type { KnowledgeAnswer, KnowledgeCitation, KnowledgePassage } from "@shared/types"

/** The knowledge door the marks come from. Named once, so the loop that streams
 * the evidence and the panel that recovers it from a saved thread cannot mean
 * two different tools. */
export const KNOWLEDGE_ASK_TOOL = "ask_knowledge"

/** A citation mark in a reply: `[[src:<sourceId>]]`. The id is a ULID the door
 * handed back, so the character class is deliberately narrow — anything else is
 * left in the text as the model wrote it rather than being half-recognised. */
export const CITE_MARK = /\[\[src:([A-Za-z0-9_-]{1,64})\]\]/g

/** One run of a reply: prose, or a mark naming the source it stands on. */
export type CiteSegment = { t: "text"; text: string } | { t: "cite"; sourceId: string }

/**
 * Split one line of a reply at its citation marks.
 *
 * Takes the line as it will be RENDERED (already escaped), because the mark is
 * chosen so escaping cannot touch it — see above. Empty text runs are dropped;
 * a line with no mark comes back as itself, so the common case costs one regex
 * and allocates nothing extra.
 */
export function splitCites(line: string): CiteSegment[] {
  const out: CiteSegment[] = []
  let at = 0
  // A fresh lastIndex every call: the constant is a shared /g regex and a leaked
  // cursor would make the second reply on a screen skip its first citation.
  CITE_MARK.lastIndex = 0
  for (let m = CITE_MARK.exec(line); m !== null; m = CITE_MARK.exec(line)) {
    if (m.index > at) out.push({ t: "text", text: line.slice(at, m.index) })
    out.push({ t: "cite", sourceId: m[1] })
    at = m.index + m[0].length
  }
  if (at < line.length) out.push({ t: "text", text: line.slice(at) })
  return out
}

/**
 * WHAT THE MODEL IS TOLD, in one sentence both surfaces carry.
 *
 * Named rather than inlined for the reason DROPDOWN_ORDER_RULE is: a model obeys
 * what every surface it reads agrees on, so this exact wording rides the system
 * rule wall AND the `ask_knowledge` tool's own description, and agent-parity
 * asserts both. It says three things and the third is the one that costs money
 * when it is missing — the app already draws the sources under every answer, so
 * a list written in prose is the same list twice.
 */
export const CITE_RULE =
  "Mark every claim where you make it: write [[src:<sourceId>]] straight after the sentence it supports, using the sourceId of the passage you took it from. The app draws the mark and the list of sources under your answer itself, so never write a list of sources, titles or links of your own — that is the same list twice. Each question gets its own ask_knowledge call: never answer a later question out of an earlier one's passages."

/* ------------------------------ the evidence ------------------------------ */

/** WHAT ONE TURN READ — the answer seam's own two lists, carried together
 * because they are one decision (Law R23) and separating them is how a citation
 * ends up with no passage behind it. */
export type TurnEvidence = { citations: KnowledgeCitation[]; passages: KnowledgePassage[] }

/**
 * A retrieval result → the evidence a turn draws, or null.
 *
 * ONE DECISION, READ IN ONE PLACE, ON BOTH SIDES OF THE WIRE. The agent loop
 * calls this to decide what to stream (workers/data-ops/src/lib/agent.ts), and
 * the panel calls it again to recover the evidence of a turn it is REOPENING out
 * of the saved thread — where the same object is sitting in the tool row's own
 * text. Two copies of "is this answer worth drawing?" would be two answers the
 * day one of them was edited.
 *
 * `found` is the whole test, because the seam made it the whole decision: no
 * citation means no passage means nothing to draw. The array guards cannot fire
 * for an answer this base built; they are here because this is JSON that came
 * off a fetch or out of a database column, and JSON is checked where it is used.
 */
export function evidenceFrom(data: unknown): TurnEvidence | null {
  if (!data || typeof data !== "object") return null
  const answer = data as Partial<KnowledgeAnswer>
  if (answer.found !== true) return null
  const citations = Array.isArray(answer.citations) ? answer.citations : []
  const passages = Array.isArray(answer.passages) ? answer.passages : []
  return citations.length ? { citations, passages } : null
}

/** Two turns' worth of evidence, merged. A turn may ask more than once, and the
 * same source can answer both questions — the citation is kept ONCE, at its
 * first position, because that position is the number the mark in the prose is
 * already pointing at. */
export function mergeEvidence(before: TurnEvidence | undefined, next: TurnEvidence): TurnEvidence {
  if (!before) return next
  const seen = new Set(before.citations.map((c) => c.sourceId))
  return {
    citations: [...before.citations, ...next.citations.filter((c) => !seen.has(c.sourceId))],
    passages: [...before.passages, ...next.passages],
  }
}

/** The opening of a tool row's SAVED text. `fence()` in the agent loop writes it
 * and `evidenceFromSaved` below reads it, so the two cannot be renamed apart —
 * which matters more here than it looks: a reopened conversation recovers its
 * citations out of that column and nowhere else. */
export const SAVED_RESULT_PREFIX = "OK. Result data: "

/**
 * A REOPENED TURN'S EVIDENCE, out of the thread the app already saves.
 *
 * The retrieval is stored verbatim as the tool row's own text — the audit trail
 * R23 wanted anyway — so a conversation opened tomorrow can draw the same
 * sources it drew live, with no column added to carry them and no second copy of
 * the truth to fall out of step with the first.
 *
 * BEST-EFFORT AND SILENT ON FAILURE, on purpose. A result the model was handed
 * TRIMMED (a very large answer) has a plain-English note after its JSON and may
 * have had rows dropped, so it does not always parse. The honest degradation is
 * an answer with no pills under it — never a half-recovered list of sources,
 * which would be a citation that no longer matches what was read.
 */
export function evidenceFromSaved(tool: string | undefined, content: string | null): TurnEvidence | null {
  if (tool !== KNOWLEDGE_ASK_TOOL || !content?.startsWith(SAVED_RESULT_PREFIX)) return null
  const body = content.slice(SAVED_RESULT_PREFIX.length)
  // The trim's note is appended AFTER the object, so the object ends at its own
  // last brace. A body that was cut mid-object simply fails to parse.
  const end = body.lastIndexOf("}")
  if (end < 0) return null
  try {
    return evidenceFrom(JSON.parse(body.slice(0, end + 1)))
  } catch {
    return null
  }
}
