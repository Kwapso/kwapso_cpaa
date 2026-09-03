// THE REMOUNT THIS HOOK MUST SURVIVE.
//
// AgentHost (web/components/agent-host.tsx) renders EITHER the docked column
// OR a floating `Popover` — two structurally different subtrees at the same
// return, picked by `useShellColumns()`'s 48rem query — so crossing that
// width (a window drag, a tablet rotating through its own portrait width)
// UNMOUNTS AgentPanel and mounts a fresh one. `useAgentChat` used to be plain
// `React.useState` owned by that one component instance, so the crossing
// silently destroyed the transcript, the thread, staged attachments and a
// confirm the assistant was mid-way through waiting on.
//
// This locks the fix directly, at the level the bug actually lived: build a
// transcript with a staged attachment and a paused confirm, UNMOUNT the hook
// (exactly what a breakpoint crossing does to the component that calls it),
// mount it again, and check nothing was lost. No component or media query is
// rendered here — agent-host.test.ts already locks that AgentHost picks the
// presentation by width; this proves the STATE survives the remount that
// choice causes, regardless of how the width is decided.

import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { PendingCall } from "@shared/types"

const grant: PendingCall = {
  name: "set_role_permissions",
  input: { roleId: "01ROLE", value: {} },
  summary: "Set access rights for the Sub Admin role",
  details: ["Role: Sub Admin"],
}

vi.mock("@/lib/api", () => ({
  ApiFailure: class ApiFailure extends Error {},
  dataOps: {
    agentUsage: async () => ({
      quota: { remaining: 5, freeRemaining: 5, freeDaily: 5, creditBalance: 0, blocked: false },
    }),
    agentThreads: async () => ({ threads: [] }),
    agentThread: async () => ({ messages: [] }),
    // A confirm pause: the exact "assistant waiting on a yes/no" state the
    // task calls out as something a remount must not drop.
    agentChatStream: async (_body: unknown, onEvent: (ev: unknown) => void) => {
      onEvent({ t: "confirm", threadId: "t-remount", calls: [grant], text: "" })
    },
    agentConfirmStream: async () => {},
  },
}))

import { useAgentChat } from "@/lib/use-agent-chat"

describe("the chat state survives AgentPanel's own component being torn down and rebuilt", () => {
  it("keeps a staged attachment (not yet sent) across an unmount + remount", async () => {
    const teamId = "team-remount-attach"
    const first = renderHook(() => useAgentChat(teamId, true, true))

    // A file staged for the NEXT message — the chat import — never sent in
    // this test, so it must still be sitting there after the remount below.
    const file = new File(["a,b\n1,2"], "rows.csv", { type: "text/csv" })
    await act(async () => {
      await first.result.current.addAttachments([file] as unknown as FileList)
    })
    expect(first.result.current.attached).toEqual([{ name: "rows.csv", csv: "a,b\n1,2" }])

    // THE EXACT THING THE BUG DID: the component this hook lives in is torn
    // down (AgentHost swaps subtrees crossing 768px) and a fresh one takes
    // its place — same team, same "the panel is open" inputs.
    first.unmount()
    const second = renderHook(() => useAgentChat(teamId, true, true))

    expect(second.result.current.attached, "a staged attachment must survive the remount").toEqual([
      { name: "rows.csv", csv: "a,b\n1,2" },
    ])
  })

  it("keeps the transcript, the thread id and a pending confirm across an unmount + remount", async () => {
    const teamId = "team-remount-confirm"
    const first = renderHook(() => useAgentChat(teamId, true, true))

    // A turn that pauses on a confirm — the exact "waiting on a yes/no" state
    // the task calls out as something a remount must not drop.
    await act(async () => {
      await first.result.current.send("give the sub admins admin rights")
    })
    expect(first.result.current.pending).not.toBeNull()
    expect(first.result.current.threadId).toBe("t-remount")
    expect(first.result.current.items.some((i) => i.role === "user")).toBe(true)

    first.unmount()
    const second = renderHook(() => useAgentChat(teamId, true, true))

    expect(second.result.current.threadId, "the thread must survive the remount").toBe("t-remount")
    expect(second.result.current.pending, "the paused confirm must survive the remount").not.toBeNull()
    expect(second.result.current.pending?.calls[0]?.summary).toBe("Set access rights for the Sub Admin role")
    expect(
      second.result.current.items.some((i) => i.role === "user"),
      "the transcript must survive the remount"
    ).toBe(true)
  })
})
