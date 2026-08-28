// A QUESTION HANDED IN THE MOMENT THE PANEL OPENS, AND THE ANSWER THAT VANISHED.
//
// REPORTED LIVE, 2026-08-28. The owner asked the knowledge base "what was
// discussd on the latest flu clinic related call?" from its ask box. The panel
// showed the tool row, ticked it green — and then nothing. No answer, no error,
// two credits gone, and the answer sitting in the database the whole time.
//
// THE CAUSE. Opening the panel and sending are ONE action on that path, so the
// panel's RESUME (restore the last conversation) and the turn start together.
// The resume began when the transcript really was empty, its fetch took a few
// hundred milliseconds, and then it replaced the whole array — including the
// empty assistant bubble the stream was writing into. Every later delta mapped
// over an id that was no longer there. A stale async write that never re-asked
// its own question at the moment it landed.
//
// WHY THE TOOL ROWS SURVIVED AND THE ANSWER DID NOT: `step_start` appends when
// it cannot find the bubble. Nothing else did. That asymmetry is the whole
// visible symptom, and it is why this looked like a rendering bug.
//
// TWO LOCKS, because the second one holds for a cause nobody has thought of yet:
//   · the resume leaves a panel alone once a turn has begun (the cause);
//   · an answer whose bubble has gone is APPENDED, never dropped (the class).
// A test that only proved the answer appeared would pass on the safety net
// alone, so this asserts the things only the CAUSE fix can give: the person's
// own question still in the transcript, and the NEW thread pinned.

import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

let landResume: () => void = () => {}
const resumeFetch = new Promise<void>((r) => {
  landResume = r
})

vi.mock("@/lib/api", () => ({
  ApiFailure: class ApiFailure extends Error {},
  dataOps: {
    agentUsage: async () => ({ quota: { remaining: 5, freeRemaining: 5, freeDaily: 5, creditBalance: 0, blocked: false } }),
    agentThreads: async () => ({ threads: [{ id: "yesterday" }] }),
    agentThread: async () => {
      await resumeFetch
      return {
        messages: [
          { id: "m0", threadId: "yesterday", role: "user", content: "something I asked last week", source: null, createdAt: "x" },
        ],
      }
    },
    agentChatStream: async (_b: unknown, onEvent: (ev: unknown) => void) => {
      onEvent({ t: "step_start", tool: "ask_knowledge", summary: "Ask the knowledge base" })
      onEvent({ t: "step_end", tool: "ask_knowledge", ok: true, summary: "Ask the knowledge base" })
      landResume() // …and the resume's fetch settles right here, mid-turn
      await new Promise((r) => setTimeout(r, 0))
      onEvent({ t: "text", d: "The most recent call was on 12 August." })
      onEvent({
        t: "final",
        outcome: {
          done: true,
          threadId: "this-turn",
          reply: "The most recent call was on 12 August.",
          quota: { freeDaily: 5, freeUsedToday: 2, freeRemaining: 3, creditBalance: 0, remaining: 3, blocked: false, unlimited: false },
        },
      })
    },
    agentConfirmStream: async () => {},
  },
}))

const QUESTION = "what was discussd on the latest flu clinic related call?"

describe("a question handed in the moment the panel opens", () => {
  it("keeps the whole turn — the question, the answer, and this turn's thread", async () => {
    const { useAgentChat } = await import("@/lib/use-agent-chat")
    const { result } = renderHook(() => useAgentChat("team1", true, true))
    await act(async () => {
      await result.current.send(QUESTION)
    })

    await waitFor(() => {
      const said = result.current.items.filter((i) => i.role === "assistant" && i.content)
      expect(said.length, "the answer must be in the transcript").toBeGreaterThan(0)
    })

    // ONLY THE CAUSE FIX GIVES THESE. The safety net would put the answer back
    // while the question and the thread stayed trampled — an answer with no
    // question above it, and the NEXT message posted into last week's thread.
    // `role: "tool"` rows carry no `content`, so the union has to be narrowed
    // before it is read — the same question tsc asks of the panel itself.
    const said = (i: (typeof result.current.items)[number]) =>
      i.role === "tool" ? "" : String(i.content ?? "")
    const mine = result.current.items.filter((i) => i.role === "user")
    expect(mine.map(said), "the person's own question must survive").toContain(QUESTION)
    expect(
      result.current.items.some((i) => said(i).includes("something I asked last week")),
      "and last week's conversation must not have been pasted over this one"
    ).toBe(false)
    expect(result.current.threadId, "the next message must go to THIS turn's thread").toBe("this-turn")
  })
})
