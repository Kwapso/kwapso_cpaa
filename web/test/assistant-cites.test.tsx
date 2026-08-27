// AN ANSWER THAT QUOTES ITS SOURCES, AS PAINTED (Law R23, ruling D7-2).
//
// The whole feature is a chain with four links and every one of them is quiet
// when it breaks: the model writes a mark, the renderer turns it into the kit's
// `<Cite>`, the kit numbers it against the turn's own sources, and the pill
// underneath says which source that number is. A break anywhere renders PROSE —
// a perfectly readable answer with no provenance, which is exactly the failure
// the law exists to prevent and exactly the failure nobody notices.
//
// So this reads the DOM the person looks at, through the real kit component,
// with the real renderer. Four things it proves and each one has been a real bug
// in this class somewhere:
//
//   1. the mark is drawn, numbered by POSITION, inside the sentence it belongs
//      to — not on its own line, which is what splitting the rendered HTML would
//      have produced;
//   2. the raw `[[src:…]]` never reaches the screen;
//   3. a mark naming a source this turn does NOT carry draws nothing at all,
//      so a model reaching back to an earlier question's passages cannot leave a
//      superscript pointing at a pill that is not there;
//   4. the pill says BOTH halves of the ruled shape, `collection · record`.

import { act, render, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { AgentChat } from "@shared/ui/components/agent-chat/agent-chat"
import { splitCites } from "@shared/agent-cites"
import type { KnowledgeCitation, KnowledgePassage } from "@shared/types"

import { AgentMarkdown } from "@/components/agent-markdown"
import { citationPills } from "@/components/agent-sources"

const citation = (sourceId: string, title: string, kind: string): KnowledgeCitation => ({
  sourceId,
  title,
  kind,
  url: null,
  recordPath: null,
  liveStatus: null,
  checkedAt: null,
})

const passage = (sourceId: string, text: string): KnowledgePassage => ({
  sourceId,
  title: "t",
  kind: "note",
  url: null,
  recordPath: null,
  compartment: "agency",
  seq: 1,
  text,
  score: 0.9,
})

/** One assistant turn, rendered the way the panel renders it. */
function turn(reply: string, citations: KnowledgeCitation[]) {
  const evidence = { citations, passages: citations.map((c) => passage(c.sourceId, "the words")) }
  return render(
    <AgentChat
      composer={false}
      messages={[
        {
          id: "m1",
          role: "assistant",
          content: <AgentMarkdown text={reply} />,
          sources: citationPills(evidence, (english) => english),
        },
      ]}
    />
  )
}

describe("the assistant's answer carries its sources", () => {
  it("draws the mark INSIDE the sentence, numbered by position", () => {
    const { container } = turn(
      "Three invoices are on the retainer[[src:s-1]] and the cap moved in August[[src:s-2]].",
      [citation("s-1", "Ostwald retainer", "file"), citation("s-2", "August note", "note")]
    )
    const marks = container.querySelectorAll('[data-slot="agent-chat-cite"]')
    expect([...marks].map((m) => m.textContent?.replace(/Source \d+/, "").trim())).toEqual(["1", "2"])
    // INSIDE the paragraph, not beside it. A mark that ended up as its own block
    // is the exact failure of splitting rendered HTML at the marker, and it is
    // invisible to a text-content assertion.
    for (const mark of marks) expect(mark.closest("p")).not.toBeNull()
    // …and the sentence still reads as one sentence.
    expect(container.querySelector("p")?.textContent).toContain("on the retainer")
    expect(container.querySelector("p")?.textContent).toContain("and the cap moved")
  })

  it("never shows the raw marker to a person", () => {
    const { container } = turn("It is due on Friday[[src:s-1]].", [
      citation("s-1", "Dispatch note", "note"),
    ])
    expect(container.textContent).not.toContain("[[src:")
    expect(container.textContent).not.toContain("s-1")
  })

  it("draws NOTHING for a mark this turn cannot back", () => {
    // The model reaching back to an earlier question's passages. The kit's own
    // Cite refuses it, which is what makes the boundary clean rather than
    // trusted — and the alternative (a superscript pointing at no pill) is worse
    // than no superscript.
    const { container } = turn("We agreed it in June[[src:s-9]].", [
      citation("s-1", "June minutes", "meeting"),
    ])
    const marks = container.querySelectorAll('[data-slot="agent-chat-cite"]')
    expect(marks.length).toBe(0)
    expect(container.textContent).not.toContain("[[src:")
    // The turn still carries its one real source underneath.
    expect(container.textContent).toContain("June minutes")
  })

  it("the pill says BOTH halves of the ruled shape", () => {
    // RULING D7-2: "a pill carrying only a collection is the invention this
    // ruling closes." Both halves, in that order, with the artifact's middot.
    const pills = citationPills(
      { citations: [citation("s-1", "Ostwald retainer", "file")], passages: [] },
      (english) => english
    )
    expect(pills).toHaveLength(1)
    expect(pills[0].collection).toBe("From a file")
    expect(pills[0].record).toBe("Ostwald retainer")
    // No in-app href on a pill: the kit renders it as a bare anchor, which would
    // throw the whole shell away (R37). See agent-sources.tsx.
    expect(pills[0].href).toBeUndefined()
  })

  it("splitCites leaves ordinary prose alone", () => {
    expect(splitCites("nothing to mark here")).toEqual([{ t: "text", text: "nothing to mark here" }])
    // Two calls in a row must not share the /g cursor — the second answer on a
    // screen would skip its first citation.
    const twice = () => splitCites("a[[src:x]]b")
    expect(twice()).toEqual(twice())
  })
})

/* ────────────────────────────────────────────────────────────────────────────
   AND THE LINK BEFORE ALL OF THEM: the wire.

   Everything above renders a turn that already HAS its sources. The state
   machine is what puts them there, and if it drops the frame every assertion
   above stays green while the app shows prose — the same shape as the emitter
   being tested and never called. So this drives the real hook with the real
   `sources` event and reads the item back.
   ──────────────────────────────────────────────────────────────────────────── */

/** The stream the mocked door plays back for the next send(). */
let stream: unknown[] = []

vi.mock("@/lib/api", () => ({
  ApiFailure: class ApiFailure extends Error {},
  dataOps: {
    agentUsage: async () => ({ quota: { remaining: 5, freeRemaining: 5, freeDaily: 5, creditBalance: 0, blocked: false } }),
    agentThreads: async () => ({ threads: [] }),
    agentThread: async () => ({ messages: [] }),
    agentChatStream: async (_body: unknown, onEvent: (ev: unknown) => void) => {
      for (const ev of stream) onEvent(ev)
    },
    agentConfirmStream: async () => {},
  },
}))

describe("the sources frame reaches the turn", () => {
  it("hangs what was read on the assistant turn that is being written", async () => {
    const { useAgentChat } = await import("@/lib/use-agent-chat")
    stream = [
      { t: "step_start", tool: "ask_knowledge", summary: "Ask the knowledge base" },
      { t: "step_end", tool: "ask_knowledge", ok: true, summary: "Ask the knowledge base" },
      { t: "sources", citations: [citation("s-1", "Dispatch note", "note")], passages: [passage("s-1", "Thursdays.")] },
      { t: "text", d: "Thursdays[[src:s-1]]." },
      { t: "final", outcome: { done: true, threadId: "th1", reply: "", quota: { remaining: 4, freeRemaining: 4, freeDaily: 5, creditBalance: 0, blocked: false } } },
    ]
    const { result } = renderHook(() => useAgentChat("team1", true, true))
    await act(async () => {
      await result.current.send("when is dispatch?")
    })
    await waitFor(() => {
      const assistant = result.current.items.filter((it) => it.role === "assistant")
      const last = assistant[assistant.length - 1] as { evidence?: { citations: unknown[] } }
      expect(last?.evidence?.citations).toHaveLength(1)
    })
  })
})
