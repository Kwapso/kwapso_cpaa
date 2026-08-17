// THE CONFIRM PANEL, AS PAINTED. The yes/no panel is the last thing standing
// between a talked-into assistant and a real change, so this test reads the
// PIXELS' text — the actual DOM the admin looks at — not "the summary function
// was called". It drives the real chat state machine with a real `confirm` event
// off the wire, then renders the panel's own step list and reads it back.
//
// The gap this closes: the panel used to render the one-line summary alone, so
// "Set access rights for the Sub Admin role" asked for a yes to a payload nobody
// could see. A confirm you cannot read is not a confirm.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { act, render, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RunSteps } from "@kwapso/ui/registry/collections/run-steps/run-steps"
import type { PendingCall } from "@shared/types"

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

import { confirmStepsFrom, useAgentChat } from "@/lib/use-agent-chat"

/** What the server sends for "give the Sub Admin role these rights" — summary
 * plus the payload built by shared/workers/confirm-payload.ts. */
const grant: PendingCall = {
  name: "set_role_permissions",
  input: { roleId: "01ROLE", value: {} },
  summary: "Set access rights for the Sub Admin role",
  details: [
    "Role: Sub Admin",
    "Members: read, create, edit, delete",
    "Roles & permissions: read, edit",
    "Knowledge base: no access",
  ],
}

beforeEach(() => {
  stream = []
})

describe("the confirm panel shows what it is asking the admin to approve", () => {
  it("paints every payload line under the action, straight off the wire", async () => {
    stream = [{ t: "confirm", threadId: "t1", calls: [grant], text: "" }]
    const { result } = renderHook(() => useAgentChat("TEAM1", true, true))

    await act(async () => {
      await result.current.send("make the sub admins admins")
    })
    await waitFor(() => expect(result.current.pending).not.toBeNull())

    // The panel's own confirm block (agent-panel.tsx renders exactly this).
    const { container } = render(<RunSteps steps={result.current.confirmSteps} />)
    const shown = container.textContent ?? ""

    expect(shown).toContain("Set access rights for the Sub Admin role")
    // …and, critically, the payload behind that sentence:
    expect(shown).toContain("Members: read, create, edit, delete")
    expect(shown).toContain("Roles & permissions: read, edit")
    // A module being taken down to nothing is a change too — it must be readable.
    expect(shown).toContain("Knowledge base: no access")
    // Still pending: nothing has run, the human hasn't decided.
    expect(shown).toContain("Pending")
  })

  it("renders one line per detail, so a long payload can't collapse into one blur", () => {
    const { container } = render(<RunSteps steps={confirmStepsFrom([grant])} />)
    const lines = [...container.querySelectorAll("p > span > span")].map((n) => n.textContent)
    expect(lines).toEqual(grant.details)
  })

  it("an action with nothing to show still renders its label (no empty detail line)", () => {
    const bare: PendingCall = { name: "x", input: {}, summary: "Run the attached file import", details: [] }
    const { container } = render(<RunSteps steps={confirmStepsFrom([bare])} />)
    expect(container.textContent).toContain("Run the attached file import")
    expect(container.querySelectorAll("p > span > span")).toHaveLength(0)
  })
})

describe("the panel is wired to that step list", () => {
  // The render above proves the steps paint; this proves the PANEL is what
  // renders them — otherwise the two could drift and the admin would still be
  // approving a bare label.
  const HERE = dirname(fileURLToPath(import.meta.url))
  const panel = readFileSync(join(HERE, "..", "components", "agent-panel.tsx"), "utf8")

  it("agent-panel.tsx feeds chat.confirmSteps to <RunSteps>", () => {
    expect(panel).toMatch(/<RunSteps\s+steps=\{chat\.confirmSteps\}/)
  })
})
