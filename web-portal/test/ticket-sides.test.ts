// A THREAD THAT READS LIKE A CONVERSATION — the sides half.
//
// The owner asked to "show a clear distinction between chats sent by the current
// active user and chats sent by another user… similar to WhatsApp". He typed
// "ours on the left, theirs on the right"; WhatsApp — the app he named — puts
// YOUR OWN messages on the RIGHT. The screen builds the convention he named, and
// the first describe below is what stops that being quietly reversed by someone
// who reads only the sentence.
//
// The second describe is the part with teeth. Alignment is the first thing on
// this screen that varies PER AUTHOR, and the portal's whole promise is that a
// client can never tell which staff member is talking (SCOPE ch.06). A side that
// grouped, coloured or ordered by author id would turn "the agency" into a
// countable set of people without a single name appearing. So the real screen is
// rendered with two DIFFERENT staff replies on it and the two rows are compared
// to each other.

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { brand } from "@shared/brand"

const ME = "usr_me"

/** The thread under test. Hoisted so the module mock below can serve it — the
 * screen revalidates on mount, so a mock answering with empty lists would wipe
 * anything primed into the cache a moment earlier. */
const fixture = vi.hoisted(() => {
  const me = "usr_me"
  const ticket = {
    id: "tkt_1",
    description: "The booking page shows last month's prices",
    status: "in_progress" as const,
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-01T09:00:00.000Z",
  }
  const reply = (id: string, authorId: string | null, authorName: string | null, body: string) => ({
    id,
    ticketId: ticket.id,
    body,
    taggedUserIds: [],
    isAgent: false,
    authorId,
    authorName,
    createdAt: "2026-08-01T10:00:00.000Z",
  })
  return {
    ticket,
    replies: [
      reply("m1", me, "Me Myself", "Any update on this?"),
      reply("m2", "usr_colleague", "Dana Okafor", "I raised this one too."),
      // TWO DIFFERENT STAFF, deliberately handed to the screen WITH distinct
      // ids. The live wire strips them (shared/types HelpMessage), so passing
      // nulls here would prove only that two identical inputs render
      // identically — which is not a promise about this component at all. The
      // screen's own promise is that it never distinguishes two authors on the
      // other side however it is fed, and that is what belt-and-braces means
      // when the belt lives in another repo's worker.
      reply("m3", "usr_staff_a", null, "Looking into it now."),
      reply("m4", "usr_staff_b", null, "Fixed — can you confirm?"),
    ],
  }
})

vi.mock("@/lib/api", () => ({
  ApiFailure: class ApiFailure extends Error {},
  support: {
    tickets: () =>
      Promise.resolve({ tickets: [fixture.ticket], total: 1, nextCursor: null }),
    ticket: () => Promise.resolve(fixture.ticket),
    thread: () => Promise.resolve({ replies: fixture.replies, total: fixture.replies.length }),
    reply: () => Promise.resolve({ replies: fixture.replies, total: fixture.replies.length }),
  },
}))

const { OTHER_SIDE, OWN_SIDE, TicketScreen, sideFor } = await import("@/components/ticket-screen")

describe("which side a message sits on", () => {
  it("puts YOUR OWN messages on the right — the WhatsApp convention, not the typed direction", () => {
    // If this ever reads "items-start", the screen has been flipped back to the
    // words rather than the app the owner named. Flip both, or neither.
    expect(OWN_SIDE).toBe("items-end")
    expect(OTHER_SIDE).toBe("items-start")
  })

  it("everyone who is not you is on the other side", () => {
    expect(sideFor(ME, ME)).toBe(OWN_SIDE)
    expect(sideFor("usr_colleague", ME)).toBe(OTHER_SIDE)
  })

  it("an author the wire refused to name is on the other side, not on yours", () => {
    // A staff reply arrives with authorId null (shared/types HelpMessage). A
    // truthiness check here — `authorId && authorId === me` reversed, or a
    // `?? me` default — would put the agency on the client's own side.
    expect(sideFor(null, ME)).toBe(OTHER_SIDE)
  })
})

describe("the side never becomes a fingerprint", () => {
  let root: Root | null = null
  let host: HTMLDivElement

  const ready = {
    state: "ready" as const,
    user: {
      id: ME,
      email: "someone@example.com",
      firstName: "Me",
      lastName: "Myself",
      imageUrl: null,
      onboardingComplete: true,
      currentTeamId: "team_1",
      pinnedTeamId: null,
    },
    teamId: "team_1",
    accounts: [{ id: "acc_1", name: "Northwind" }],
    currentAccountId: "acc_1",
  }

  beforeEach(async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    Object.defineProperty(window, "scrollTo", { value: vi.fn(), configurable: true })
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root?.render(React.createElement(TicketScreen, { ready, ticketId: fixture.ticket.id }))
    })
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    host.remove()
    root = null
  })

  const rows = () => [...host.querySelectorAll("ol > li")]

  it("renders the whole thread (guards the walk)", () => {
    expect(rows()).toHaveLength(4)
  })

  it("your message is on the right and wears the brand surface; theirs are not", () => {
    const [mine, colleague, staff] = rows()
    expect(mine.className).toContain(OWN_SIDE)
    expect(mine.querySelector("div")?.className).toContain("bg-primary")
    for (const other of [colleague, staff]) {
      expect(other.className).toContain(OTHER_SIDE)
      expect(other.querySelector("div")?.className).toContain("bg-muted")
    }
  })

  it("TWO DIFFERENT STAFF REPLIES ARE INDISTINGUISHABLE apart from what they say", () => {
    const [, , a, b] = rows()
    // Same alignment, same surface, same attribution, same everything — strip
    // the words and the two rows are the same row. The moment a side, a colour,
    // an avatar seed or a grouping keys on the author, this diverges and a
    // client can count the people behind "kwapso".
    const shape = (li: Element) =>
      li.outerHTML.replace("Looking into it now.", "…").replace("Fixed — can you confirm?", "…")
    expect(shape(a)).toBe(shape(b))
  })

  it("names a colleague, and never names one of ours", () => {
    const [, colleague, staff] = rows()
    expect(colleague.textContent).toContain("Dana Okafor")
    expect(staff.textContent).toContain(brand.name)
  })

  it("says only the time on your own side — the side IS the attribution", () => {
    expect(rows()[0].textContent).not.toContain("Me Myself")
  })
})
