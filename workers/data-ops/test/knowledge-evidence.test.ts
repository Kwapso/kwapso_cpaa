// WHAT THE PANEL IS TOLD ABOUT A RETRIEVAL (Law R23, the wire half).
//
// The client is sent step rows and never a tool's result, so for as long as this
// app has had an assistant, a knowledge answer's citations reached the MODEL and
// stopped there — the panel could not have drawn a source under an answer if it
// had wanted to. `knowledgeEvidence` is the one frame that changes that, and
// these lock the two ways it can go wrong, both of them silent:
//
//   · it fires for a door it should not, and a turn draws "sources" that are
//     rows out of some other tool;
//   · it does NOT fire when it should, and every answer is prose again — which
//     looks exactly like an assistant that simply did not cite anything.
//
// And the third link, which is the one nobody would think to test: a conversation
// REOPENED tomorrow. The evidence is not stored in a column of its own; it is
// recovered out of the tool row's own saved text, so the writer and the reader
// have to agree on that text forever.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { evidenceFromSaved, SAVED_RESULT_PREFIX } from "@shared/agent-cites"
import { KNOWLEDGE_CITATION_RULE, knowledgeEvidence, SYSTEM, trimResult } from "../src/lib/agent"
import { SHARED_TOOLS } from "@shared/workers/tool-catalog"

/** A found answer, in the shape `knowledgeAnswer` hands back. */
const found = {
  question: "when is dispatch?",
  found: true,
  message: "1 source in the knowledge base answers this.",
  answer: null,
  compartments: ["account:a1"],
  reason: "It reads like a question about Bergman.",
  records: [],
  passages: [{ sourceId: "s-1", title: "Dispatch note", kind: "note", url: null, recordPath: null, compartment: "account:a1", seq: 1, text: "Thursdays.", score: 0.9 }],
  citations: [{ sourceId: "s-1", title: "Dispatch note", kind: "note", url: null, recordPath: null, liveStatus: null, checkedAt: null }],
  candidates: 12,
}

const nothing = { ...found, found: false, passages: [], citations: [], answer: null }

describe("knowledgeEvidence: the retrieval reaches the screen", () => {
  it("forwards the seam's own two lists, unchanged", () => {
    const ev = knowledgeEvidence("ask_knowledge", found)
    expect(ev).toEqual({ t: "sources", citations: found.citations, passages: found.passages })
  })

  it("says nothing when the base had nothing", () => {
    // R23: no citation means no passage means nothing to draw. A turn that drew
    // an empty source strip would be claiming provenance for an answer that has
    // none, which is worse than the bare sentence.
    expect(knowledgeEvidence("ask_knowledge", nothing)).toBeNull()
  })

  it("is not fired by any other door", () => {
    // A list of tickets is rows, not sources. `pagedJson` results carry no
    // `found`, so the guard is real rather than decorative — but a future door
    // that answers `{found:true}` about something else must still not paint
    // citations, which is what naming the tool does.
    expect(knowledgeEvidence("list_help_tickets", { rows: [], total: 0, found: true })).toBeNull()
    expect(knowledgeEvidence("ask_knowledge", "not json at all")).toBeNull()
    expect(knowledgeEvidence("ask_knowledge", null)).toBeNull()
  })
})

describe("a reopened conversation still shows what it read", () => {
  it("recovers the evidence out of the tool row the app already saves", () => {
    // Exactly the text the agent loop writes for a tool row.
    const saved = `${SAVED_RESULT_PREFIX}${trimResult(found)}`
    expect(evidenceFromSaved("ask_knowledge", saved)).toEqual({
      citations: found.citations,
      passages: found.passages,
    })
  })

  it("degrades to nothing rather than to half a citation", () => {
    expect(evidenceFromSaved("ask_knowledge", "FAILED: no.")).toBeNull()
    expect(evidenceFromSaved("list_help_tickets", `${SAVED_RESULT_PREFIX}{"found":true}`)).toBeNull()
    expect(evidenceFromSaved("ask_knowledge", `${SAVED_RESULT_PREFIX}{"found":tr`)).toBeNull()
    expect(evidenceFromSaved(undefined, null)).toBeNull()
  })
})

describe("the model is told to mark the claim, not to write a list", () => {
  // R9's own shape: both surfaces the model reads must agree, or it obeys
  // neither. The knowledge lane measured 10 answers in 16 appending a source
  // list the prompt told it not to write — so the instruction now gives it
  // somewhere better to put the attribution, and the app draws the list itself.
  const ask = SHARED_TOOLS.find((t) => t.name === "ask_knowledge")

  it("both surfaces name the mark and refuse the prose list", () => {
    expect(ask, "the ask_knowledge tool must exist").toBeDefined()
    for (const [surface, text] of [
      ["the system rule wall", KNOWLEDGE_CITATION_RULE],
      ["the tool's own description", ask!.summary],
    ] as const) {
      expect(text, `${surface} must name the mark's own spelling`).toContain("[[src:")
      expect(
        text.toLowerCase(),
        `${surface} must tell it not to write its own list of sources`
      ).toMatch(/never write a list of sources/)
    }
    expect(SYSTEM, "the rule wall must carry the citation rule").toContain(KNOWLEDGE_CITATION_RULE)
  })

  it("a follow-up must stand on its own retrieval", () => {
    // The failure a conversation invites and a one-shot box could not have: the
    // second question answered out of the first one's passages. No unit test can
    // catch that happening; this only proves the model was told.
    expect(KNOWLEDGE_CITATION_RULE.toLowerCase()).toMatch(/each question gets its own ask_knowledge/)
  })
})

describe("the frame is actually emitted (a function nobody calls is a function nobody notices)", () => {
  // VERIFY THE INSTRUMENT, NOT ONLY THE RESULT. Every assertion above would stay
  // green if the loop stopped emitting the frame — `knowledgeEvidence` would be
  // a correct, tested, dead function and every answer would go back to prose.
  // So the STEP SEAM is read off disk: the emitter runs where a tool result is
  // in hand, and it goes out on the same stream the step rows do.
  it("runToolCall emits what knowledgeEvidence returns", () => {
    const src = readFileSync(join(__dirname, "..", "src", "lib", "agent.ts"), "utf8")
    const step = src.slice(src.indexOf("async function runToolCall"), src.indexOf("/** Files attached to a chat"))
    expect(step, "the step seam must ask for the evidence").toContain("knowledgeEvidence(tc.name, result.data)")
    expect(step, "…and must put it on the stream").toMatch(/emit\(evidence\)/)
  })
})
