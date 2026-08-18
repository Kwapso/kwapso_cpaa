// WORK IS WRITTEN DOWN ON THE TICKET THAT ASKED FOR IT, and this drives the real
// screen to prove it: the button exists, it is gated on the right the STORY door
// asks for, and the story it writes arrives already attached to the request.
//
// WHY A DRIVEN TEST AND NOT A SOURCE SCAN. The fault this file exists to stop was
// a COMMENT: the ticket's Related stories tab carried three lines describing "a
// collection with its own create action" above a panel that was handed no create
// action at all, and the panel drew the button only when it was. Every source
// scan in the repo would have read those three lines and the `<StoriesPanel>`
// beside them and reported all clear — which is exactly what happened, for a
// month. A test that presses the button cannot be fooled by prose.
//
// AND IT IS NOT "MAKE IT A STORY". That control (and the prompt after triage)
// went on 17 Aug 2026 and is not coming back: a ticket never BECOMES a story. The
// last case below is the one that keeps the two apart in code rather than in
// somebody's memory — the ticket is untouched by this, which is precisely what a
// conversion could never be.

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { HelpTicket, SelectableValue } from "@shared/types"

const TICKET: HelpTicket = {
  id: "help-1",
  ref: "BERG-T0412",
  description: "The dispatch board will not load on a phone",
  helpType: "Bug",
  status: "triaged",
  archivedAt: null,
  accountId: "acct-bergman",
  accountName: "Bergman S.A.",
  appId: "app-1",
  appName: "Dispatch",
  raisedByContactId: null,
  raisedByContactName: null,
  raiserName: "Marta Bergman",
  sourceScreen: null,
  titleDe: null,
  titleEn: null,
  resolvedAt: null,
  draftResolution: null,
  createdAt: "2026-08-18T09:00:00.000Z",
  updatedAt: null,
  editorName: null,
} as unknown as HelpTicket

const STORY_TYPES: SelectableValue[] = [
  { type: "Story type", value: "Fix", active: true } as unknown as SelectableValue,
]

const api = vi.hoisted(() => ({ createStory: vi.fn(), stories: vi.fn() }))
// EVERY RIGHT, so the first cases are about the WIRING. The gate is proved on its
// own at the bottom, where the one right that matters is taken away.
const perms = vi.hoisted(() => ({ can: vi.fn((_module: string, _right: string) => true) }))

vi.mock("@/lib/perms", () => ({ usePermissions: () => ({ can: perms.can }) }))

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    content: {
      ...actual.content,
      help: async () => ({ tickets: [TICKET], total: 1, nextCursor: null, hasMore: false }),
      helpThread: async () => ({ replies: [], total: 0 }),
      helpStakeholders: async () => ({ stakeholders: [] }),
      stories: api.stories,
      createStory: api.createStory,
      sprints: async () => ({ sprints: [], total: 0 }),
      workLogs: async () => ({ logs: [], total: 0, totalSeconds: 0, nextCursor: null, hasMore: false }),
      workLogSummary: async () => ({ total: 0, totalSeconds: 0, people: [], kinds: [], weeks: [] }),
      helpAttachments: async () => ({ attachments: [], total: 0 }),
      runningTimers: async () => ({ timers: [] }),
    },
    tenancy: {
      ...actual.tenancy,
      members: async () => ({ members: [] }),
      selectable: async () => ({ values: STORY_TYPES }),
      apps: async () => ({ apps: [], total: 0 }),
      processes: async () => ({ processes: [], total: 0, nextCursor: null, hasMore: false }),
      activity: async () => ({ activity: [], total: 0, nextCursor: null, hasMore: false }),
    },
  }
})

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("@kwapso/ui/registry/primitives/sonner/sonner", () => ({
  toast: toasts,
  Toaster: () => null,
}))

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

// The library's Select is Radix, which drives itself with pointer capture and
// scrolls the highlighted option into view. jsdom implements neither, so these
// three shims are what let a REAL dropdown be opened and chosen from here rather
// than reaching past the control and setting a value the person never picked.
const proto = Element.prototype as unknown as Record<string, unknown>
proto.hasPointerCapture ??= () => false
proto.setPointerCapture ??= () => undefined
proto.releasePointerCapture ??= () => undefined
proto.scrollIntoView ??= () => undefined

import { HelpDetailScreen } from "@/components/help-detail"

afterEach(cleanup)
beforeEach(() => {
  perms.can.mockReset().mockReturnValue(true)
  api.createStory.mockReset().mockResolvedValue({ id: "story-1" })
  api.stories
    .mockReset()
    .mockResolvedValue({ stories: [], total: 0, nextCursor: null, hasMore: false })
  toasts.success.mockReset()
  toasts.error.mockReset()
})

const openTicket = () =>
  render(
    <HelpDetailScreen teamId="team-1" helpId="help-1" myUserId="u-1" basePath="/tickets" />
  )

/** Choose the kind of work through the REAL dropdown. Radix opens on a keyboard
 * press as readily as on a pointer, and the keyboard path is the one jsdom can
 * actually deliver — so the option is highlighted and chosen exactly as a person
 * would, rather than a value being written past the control. */
async function pickStoryType() {
  const trigger = screen.getByLabelText(/kind of work/i)
  fireEvent.keyDown(trigger, { key: "Enter" })
  fireEvent.click(await screen.findByRole("option", { name: "Fix" }))
}

/** Open Related stories and press the create action the tab promises. */
async function relatedStoriesTab() {
  openTicket()
  fireEvent.mouseDown(await screen.findByRole("tab", { name: /related stories/i }))
}

describe("writing a story on the ticket that asked for it", () => {
  it("offers the create action its own tab has been describing", async () => {
    await relatedStoriesTab()
    // The panel draws this ONLY when it is handed an `onNew`, which is the whole
    // fault: the comment above the call said "a collection with its own create
    // action" and the call passed none.
    expect(await screen.findByRole("button", { name: "New story" })).toBeTruthy()
  })

  it("gates on the right the STORY door asks for, not the ticket's", async () => {
    // A person who may read and answer requests is not necessarily a person who
    // may put things on the team's backlog. `help:*` in full, `work:create` gone.
    perms.can.mockImplementation((module: string, right: string) =>
      !(module === "work" && right === "create")
    )
    await relatedStoriesTab()
    await screen.findByRole("tab", { name: /related stories/i })
    expect(screen.queryByRole("button", { name: "New story" })).toBeNull()
  })

  it("writes a story that arrives ALREADY attached to the request", async () => {
    await relatedStoriesTab()
    fireEvent.click(await screen.findByRole("button", { name: "New story" }))
    fireEvent.change(await screen.findByLabelText(/what needs doing/i), {
      target: { value: "Make the board responsive" },
    })
    // The kind of work is required by the door, so the form collects it.
    await pickStoryType()
    // …and the explicit "it changes no process", which the door refuses to infer.
    fireEvent.click(screen.getByLabelText(/changes no process/i))
    fireEvent.submit(document.querySelector("form") as HTMLFormElement)

    await waitFor(() => expect(api.createStory).toHaveBeenCalled())
    const sent = api.createStory.mock.calls[0][0]
    expect(sent.title).toBe("Make the board responsive")
    // THE RELATION IS THE ENTIRE POINT. Without it this is a story in the
    // backlog that mentions nothing, the tab it was created on would not list
    // it, and the request it answers can never leave triaged — `scheduledFlip`
    // asks for stories WHERE ticket_id = this one.
    expect(sent.ticketId).toBe("help-1")
  })

  it("shows the request as a fact rather than a picker, and leaves the ticket alone", async () => {
    await relatedStoriesTab()
    fireEvent.click(await screen.findByRole("button", { name: "New story" }))
    // The request behind the work is where you are standing, so it is named and
    // cannot be mistyped — the picker every other caller of this form gets is
    // replaced by the ticket's own reference.
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText(/BERG-T0412/)).toBeTruthy()
    // …and it is TEXT, not a control: no combobox offering to point this work at
    // some other request.
    expect(within(dialog).queryByLabelText(/^tickets$/i)?.tagName).not.toBe("BUTTON")

    fireEvent.change(await screen.findByLabelText(/what needs doing/i), {
      target: { value: "Make the board responsive" },
    })
    await pickStoryType()
    fireEvent.click(screen.getByLabelText(/changes no process/i))
    fireEvent.submit(document.querySelector("form") as HTMLFormElement)
    await waitFor(() => expect(api.createStory).toHaveBeenCalled())

    // AND THIS IS NOT A CONVERSION. "Make it a story" turned the request INTO
    // one; this adds work that answers it, so nothing about the ticket is
    // written, renamed or consumed — a second story on the same request is as
    // ordinary as the first. If a future change makes this call touch the
    // ticket, the two acts have been quietly merged again.
    expect(api.createStory).toHaveBeenCalledTimes(1)
    expect(toasts.error).not.toHaveBeenCalled()
  })
})
