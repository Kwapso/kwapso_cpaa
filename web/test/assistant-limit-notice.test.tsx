// THE GENTLE WARNING, AS PAINTED — and, more to the point, as REACHED.
//
// The owner asked for "a gentle, well-done warning" because every model failure
// arrived as one sentence telling him to try again in a moment, which is wrong
// advice for three of the four things it covered. So there are two questions
// here and only the second one is about pixels:
//
//   1. does the REASON actually travel? worker → wire → state machine → screen.
//      Every link is silent when it breaks: drop the reason anywhere along it
//      and the app shows the old generic bubble, which is exactly what it did
//      before and exactly what nobody notices.
//   2. does each reason say a TRUE and DIFFERENT thing? A classification that
//      renders one sentence for four causes is the bug wearing a taxonomy.
//
// No model is called. The failure is forced onto the wire, which is the only
// honest way to test a path whose real trigger is somebody else's outage.

import { act, render, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { ModelFailure } from "@shared/types"
import { AssistantLimitNotice } from "@/components/assistant-limit-notice"

const ALL: ModelFailure[] = [
  "unconfigured",
  "refused",
  "rate_limited",
  "provider_out_of_credit",
  "overloaded",
  "unavailable",
]

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

const quota = { freeDaily: 5, freeUsedToday: 1, freeRemaining: 4, creditBalance: 0, remaining: 4, blocked: false, unlimited: false }

describe("the reason reaches the screen", () => {
  it("a settled turn that failed carries its reason out of the loop", async () => {
    // The shape the loop actually produces: `done: true` with a friendly reply,
    // because a model failure is turned into a saved turn rather than a 500. The
    // `failure` field is the ONLY thing that distinguishes it from a short answer.
    const { useAgentChat } = await import("@/lib/use-agent-chat")
    stream = [
      { t: "text", d: "I couldn't answer that one." },
      { t: "final", outcome: { done: true, threadId: "t1", reply: "I couldn't answer that one.", quota, failure: "rate_limited" } },
    ]
    const { result } = renderHook(() => useAgentChat("team1", true, true))
    await act(async () => {
      await result.current.send("what did we agree?")
    })
    await waitFor(() => expect(result.current.failure).toBe("rate_limited"))
  })

  it("a failure that never reached the loop carries it too", async () => {
    // A worker with no key: `selectModel` throws before the loop's own catch
    // exists, so it arrives as the terminal error event instead.
    const { useAgentChat } = await import("@/lib/use-agent-chat")
    stream = [{ t: "error", message: "model_error: no ANTHROPIC_API_KEY", reason: "unconfigured" }]
    const { result } = renderHook(() => useAgentChat("team1", true, true))
    await act(async () => {
      await result.current.send("hello")
    })
    await waitFor(() => expect(result.current.failure).toBe("unconfigured"))
  })

  it("asking again clears it — a warning about a limit that has passed is a lie", async () => {
    const { useAgentChat } = await import("@/lib/use-agent-chat")
    stream = [{ t: "error", message: "x", reason: "overloaded" }]
    const { result } = renderHook(() => useAgentChat("team1", true, true))
    await act(async () => {
      await result.current.send("first")
    })
    await waitFor(() => expect(result.current.failure).toBe("overloaded"))

    stream = [
      { t: "text", d: "Here you go." },
      { t: "final", outcome: { done: true, threadId: "t1", reply: "Here you go.", quota } },
    ]
    await act(async () => {
      await result.current.send("second")
    })
    await waitFor(() => expect(result.current.failure).toBeNull())
  })
})

describe("each reason says a true and different thing", () => {
  it("every reason renders words of its own", () => {
    // A classifier whose branches all say the same sentence is a taxonomy with
    // no product behind it. Six reasons, six distinct bodies of text.
    const said = new Set<string>()
    for (const failure of ALL) {
      const { container, unmount } = render(<AssistantLimitNotice failure={failure} />)
      const text = container.textContent ?? ""
      expect(text.length, `${failure} must say something`).toBeGreaterThan(40)
      said.add(text)
      unmount()
    }
    expect(said.size, "each reason needs its own words").toBe(ALL.length)
  })

  it("says whether waiting will help, and never the opposite", () => {
    // THE FAULT THIS WHOLE CHANGE EXISTS FOR: "try again in a moment" told to
    // somebody whose key has been switched off. It is wrong advice, it wastes
    // their afternoon, and it makes the product look broken rather than unpaid.
    const wontClear: ModelFailure[] = ["unconfigured", "refused", "provider_out_of_credit"]
    for (const failure of wontClear) {
      const { container, unmount } = render(<AssistantLimitNotice failure={failure} />)
      const text = (container.textContent ?? "").toLowerCase()
      expect(text, `${failure} must not tell somebody to try again`).not.toMatch(/try again|ask again/)
      unmount()
    }
    // …and the ones that DO clear must say so, or a person sits waiting for
    // somebody to fix something that is already fixing itself.
    for (const failure of ["rate_limited", "overloaded"] as ModelFailure[]) {
      const { container, unmount } = render(<AssistantLimitNotice failure={failure} />)
      expect((container.textContent ?? "").toLowerCase()).toMatch(/again/)
      unmount()
    }
  })

  it("does not send a manager to look at their own credits", () => {
    // The app has its OWN thing called a credit (glossary). "Out of credit"
    // about the PROVIDER's account would send somebody to the usage screen to
    // read a number that is perfectly healthy.
    const { container } = render(<AssistantLimitNotice failure="provider_out_of_credit" />)
    const text = (container.textContent ?? "").toLowerCase()
    expect(text, "it must name the team's credits to rule them out").toContain("your team's assistant credits")
    expect(text).toMatch(/isn't|not/)
  })

  it("is drawn by the kit, quietly", () => {
    // The kit's law: the state lives in the DOT, the panel stays neutral. A
    // panel filled with a colour is on the kit's own Don't list, and the
    // instruction was "gentle".
    const { container } = render(<AssistantLimitNotice failure="refused" />)
    const alert = container.querySelector("[data-slot='alert']") ?? container.firstElementChild
    expect(alert, "the kit's Alert must be what draws this").not.toBeNull()
    expect(alert?.className ?? "", "the panel is neutral paper, never a fill").toContain("bg-card")
    // …and it reports rather than interrupts.
    expect(container.querySelector("[role='status']")).not.toBeNull()
  })
})
