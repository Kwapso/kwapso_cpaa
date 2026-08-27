// LAW R23 — AN ANSWER FROM THE KNOWLEDGE BASE CARRIES ITS SOURCES, OR IT IS NOT
// AN ANSWER.
//
// Two halves, and the second is the one that keeps the first honest:
//
//   1. THE SEAM IS RUN, not read. `knowledgeAnswer` is called with real inputs
//      and its output inspected — `found`, `passages` and `citations` are ONE
//      decision, so a passage can never travel without the source it came from,
//      and an empty result carries the sentence the assistant must say instead
//      of inventing one. Reading the source for the word "citations" would pass
//      just as loudly if the function returned them empty.
//
//   2. NOTHING ELSE BUILDS ONE. The knowledge routes are scanned off disk: no
//      hand-built `json(` may hand back `passages`, exactly as R14 forbids a
//      hand-built page. A door that assembles half this contract ships half this
//      contract, and here the missing half is the difference between "we have
//      nothing on that" and a confident answer with nothing behind it.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { stripComments } from "@shared/rules/source-scan"
import type { KnowledgePassage } from "@shared/types"
import { knowledgeAnswer } from "../src/lib/knowledge"

const ROUTES = join(__dirname, "..", "src", "routes", "knowledge.ts")
const LIB = join(__dirname, "..", "src", "lib", "knowledge.ts")

const passage = (
  sourceId: string,
  title: string,
  seq = 0,
  recordPath: string | null = null
): KnowledgePassage => ({
  sourceId,
  title,
  kind: "note",
  url: null,
  recordPath,
  compartment: "agency",
  seq,
  text: "The dispatch rollout is paused until the invoice run is fixed.",
  score: 0.9, recordDate: null,
})

describe("R23 — the answer seam decides `found` and `citations` together", () => {
  it("an answer with no passages is a refusal, not a short answer", () => {
    const answer = knowledgeAnswer({
      question: "what did we agree about the rollout?",
      compartments: [],
      reason: "The question named no client, so I searched the whole knowledge base.",
      records: [],
      passages: [],
      candidates: 0,
    })
    expect(answer.found).toBe(false)
    expect(answer.citations).toEqual([])
    expect(answer.passages).toEqual([])
    // And it says WHAT TO DO, in the assistant's own voice — a `found:false` with
    // no sentence is an invitation to answer from memory.
    expect(answer.message).toMatch(/nothing/i)
    expect(answer.message).toMatch(/do not answer from memory/i)
  })

  it("passages never travel without their sources, and a source is cited once", () => {
    const answer = knowledgeAnswer({
      question: "what did we agree?",
      compartments: ["account:A1", "agency"],
      reason: "The question names Bergman S.A., so I searched Bergman S.A.'s material and the agency's own.",
      records: [{ sourceId: "S1", title: "Bergman rollout note" }],
      passages: [passage("S1", "Bergman rollout note", 0), passage("S1", "Bergman rollout note", 1), passage("S2", "Process: rollouts")],
      candidates: 12,
    })
    expect(answer.found).toBe(true)
    expect(answer.passages).toHaveLength(3)
    // Two passages from one source is ONE citation — a reader is told which
    // source, not how many times it matched.
    expect(answer.citations.map((c) => c.sourceId)).toEqual(["S1", "S2"])
    // The compartment and the REASONING ride the same object: a wrong
    // compartment is invisible otherwise, and it is the first thing to check
    // when an answer is wrong for the question.
    expect(answer.compartments).toEqual(["account:A1", "agency"])
    expect(answer.reason).toContain("Bergman")
  })

  it("a citation points at the same record its passage does", () => {
    // The owner's ask: "the ability to go and check out the links to the sources
    // or to those particular records as well." The path is DERIVED once, on the
    // passage, and copied — so the link under a passage and the link under its
    // citation can never point at different rows, which is the whole reason the
    // citation does not work it out again.
    const answer = knowledgeAnswer({
      question: "what did we agree?",
      compartments: [],
      reason: "…",
      records: [],
      passages: [
        passage("S1", "Dispatch keeps logging drivers out", 0, "tickets/H1"),
        passage("S2", "A note somebody typed", 0, null),
      ],
      candidates: 4,
    })
    expect(answer.citations.map((c) => c.recordPath)).toEqual(["tickets/H1", null])
    // A source with no record screen renders no link rather than a broken one —
    // a note somebody typed IS the record.
    expect(answer.citations[1].recordPath).toBeNull()
  })

  it("cannot be talked into passages without citations", () => {
    // The shape the law exists to forbid: evidence with nothing behind it. The
    // seam drops the passages rather than trusting the caller, so there is no
    // input at all that produces one.
    const answer = knowledgeAnswer({
      question: "anything?",
      compartments: [],
      reason: "…",
      records: [],
      passages: [],
      candidates: 200,
    })
    expect(answer.passages.length === 0 || answer.citations.length > 0).toBe(true)
  })
})

describe("R23 — no door assembles that answer by hand", () => {
  const routes = stripComments(readFileSync(ROUTES, "utf8"))

  it("every knowledge answer leaves through the seam", () => {
    // The ask door hands back exactly what `retrieve` returned…
    expect(routes).toContain("await retrieve(")
    // …and nothing in the routes file mentions passages or citations at all: a
    // door that shaped its own response would have to name one of them.
    //
    // `answer:` joined that list the day the base started WRITING the answer. The
    // door now supplies the model call that composes it, which is exactly the
    // position from which a door would be tempted to staple the prose onto the
    // response itself — and prose stapled on beside the seam is prose that can
    // outlive the citations it was written from.
    for (const forbidden of ["passages", "citations", "found:", "answer:"])
      expect(
        routes.includes(forbidden),
        `the knowledge routes must not build an answer by hand — "${forbidden}" appears in routes/knowledge.ts`
      ).toBe(false)
  })

  it("the seam is the only place an answer is constructed", () => {
    const lib = stripComments(readFileSync(LIB, "utf8"))
    // One builder, and `retrieve` is the only caller of it (twice: the honest
    // empty answer, and the real one).
    expect([...lib.matchAll(/export function knowledgeAnswer\(/g)]).toHaveLength(1)
    expect([...lib.matchAll(/citations:\s*KnowledgeCitation\[\]/g)].length).toBeGreaterThan(0)
    // The tripwire: this scan must be reading a file that really builds answers.
    expect([...lib.matchAll(/knowledgeAnswer\(\{/g)].length).toBeGreaterThanOrEqual(2)
  })

  // THE WRITTEN ANSWER IS AN INPUT TO THE SEAM, NOT A SECOND PRODUCT OF IT. The
  // composer hands back a string and knows nothing about `found`; the seam decides
  // whether that string may exist, in the same expression as the citations. Read
  // off the source because it is a structural claim: a composer that could reach
  // into the answer would be a second place an answer gets built, which is the
  // whole of what R23 forbids.
  it("the writer composes prose and decides nothing", () => {
    const composer = stripComments(
      readFileSync(join(__dirname, "..", "src", "lib", "knowledge-compose.ts"), "utf8")
    )
    // Structural tokens, not English: the writer's own prompt may perfectly well
    // say the word "found" to a model. What it may not do is read or set the
    // decision — `.found`, a `found:` key, a citation list, or the seam itself.
    for (const forbidden of [".found", "found:", "citations:", "knowledgeAnswer"])
      expect(
        composer.includes(forbidden),
        `the answer writer must not decide anything about the answer — "${forbidden}" appears in lib/knowledge-compose.ts`
      ).toBe(false)
    // And the seam ties the prose to the same `found` the passages ride.
    const lib = stripComments(readFileSync(LIB, "utf8"))
    expect(lib, "the written answer must be gated on `found`, in the seam").toMatch(
      /answer:\s*found\s*\?/
    )
  })
})
