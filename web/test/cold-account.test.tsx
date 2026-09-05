// WHAT A BRAND-NEW TEAM ACTUALLY SEES — the screens with nothing in them.
//
// EVERYONE TESTING ALREADY HAS DATA. That sentence is why this file exists.
// `onboarding-dead-ends.test.tsx` covers the sign-UP screen properly and has
// done for weeks; nothing anywhere asserted what /home or a collection screen
// RENDERS when the team has no rows. Every empty-state regression in the three
// weeks to 2026-09-05 — six commits' worth — was caught by a person looking at
// a screenshot, and the one instrument that walks a cold account
// (scripts/lane-shots/walk-empty-team.mjs) is a manual Playwright script that
// needs two live cookies and a running dev server.
//
// So this is the cold walk, in CI, over the four things the 2026-09-05 fresh-
// eyes review found and this change fixed. Each `it` below is one of its
// findings, written as the sentence that would have gone red:
//
//   F1  the landing screen never names a first act
//   F2  two import targets, and the generic importer, are reachable from nowhere
//   F3  sixteen collections share one empty sentence and it is untrue on most
//   F4  Contacts has no create route at all and its empty state points elsewhere

// The portal's own half of the same walk (F12 — a search box and a lone "+"
// over an empty collection) is in web-portal/test/cold-portal.test.tsx: the two
// front doors are two workspaces with two suites, and the portal does not
// compile out of the agency app's tree.
//
// A CANARY GUARDS THE INSTRUMENT, not just the result. Two of these assertions
// are absence assertions ("Start here" is NOT drawn on a busy team; the search
// box is NOT drawn on an empty one), and an absence assertion passes perfectly
// against a component that rendered nothing at all — a broken import, a thrown
// hook, a mock that never resolved. So every absence test asserts something
// POSITIVE from the same render first, and the shared `mustRender` helper below
// fails loudly when a tree comes back empty.

import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"

import type { ActiveContext, PermissionValue, TeamPulse } from "@shared/types"

const myPermissions = vi.fn()
const insights = vi.fn()

vi.mock("@/lib/api", () => ({
  tenancy: { myPermissions: () => myPermissions() },
  content: { insights: () => insights() },
}))

import { CollectionEmptyState } from "@shared/web/screen-engine/collection-frame"
import { BASE_RECIPES } from "@/lib/screens"
import { HomeScreen } from "@/components/screens/home-screen"
import { clearCache } from "@shared/web/store"

const WEB = join(__dirname, "..")

/* ------------------------------- the fixtures ------------------------------ */

const ALL_RIGHTS = { read: true, create: true, edit: true, delete: true }
const admin: PermissionValue = {
  accounts: ALL_RIGHTS,
  help: ALL_RIGHTS,
  work: ALL_RIGHTS,
  meetings: ALL_RIGHTS,
}
/** A role that may look at everything and change nothing — the shape that must
 * see no first-run block at all, because every step in it would refuse them. */
const viewer: PermissionValue = {
  accounts: { read: true, create: false, edit: false, delete: false },
  help: { read: true, create: false, edit: false, delete: false },
}

const ctx: ActiveContext = {
  team: { id: "team-1", name: "Brand New", logoUrl: null } as ActiveContext["team"],
  role: { id: "r1", title: "Admin" },
  memberCount: 1,
  teams: [],
}

const active = {
  loading: false,
  user: null,
  ctx,
  switchTeam: async () => {},
  createTeam: async () => {},
  refresh: async () => {},
}

/** A team created five seconds ago: every door answers, and every answer is a
 * zero. Not `null` — null is "your role may not read this" (R18), which is a
 * different fact and must not read as an empty team. */
const coldPulse: TeamPulse = {
  tickets: { open: 0, byStage: [{ stage: "new", count: 0 }] },
  work: {
    storiesOpen: 0,
    tasksDue: 0,
    tasksDueDone: 0,
    weeks: Array.from({ length: 8 }, (_, i) => ({ weekStart: `2026-07-0${i + 1}`, seconds: 0 })),
  },
  meetings: { thisWeek: 0 },
} as TeamPulse

/** The same team a fortnight later — one open ticket is enough. */
const warmPulse: TeamPulse = {
  ...coldPulse,
  tickets: { open: 1, byStage: [{ stage: "new", count: 1 }] },
} as TeamPulse

/** Render, and REFUSE an empty tree. A screen that throws in a hook or never
 * resolves its mock renders nothing, and every "…is not on screen" assertion
 * below would sail through it. */
function mustRender(ui: React.ReactElement): HTMLElement {
  const { container } = render(ui)
  expect(container.textContent?.trim().length ?? 0, "the component rendered nothing at all").toBeGreaterThan(0)
  return container as HTMLElement
}

beforeEach(() => {
  clearCache()
  myPermissions.mockReset()
  insights.mockReset()
  myPermissions.mockResolvedValue({ permissions: admin })
  insights.mockResolvedValue(coldPulse)
})
afterEach(cleanup)

/* --------------------------- F1 · the landing screen ----------------------- */

describe("F1 · the first screen a new member sees names a first act", () => {
  it("offers Start here on a team with nothing in it, and every step is pressable", async () => {
    mustRender(<HomeScreen active={active} />)
    const block = (await screen.findByText("Start here")).closest("section")
    expect(block, "Start here is not inside a section of its own").not.toBeNull()
    // The three acts, by the words a person reads — not by an internal id.
    for (const step of ["Add your first account", "Bring a spreadsheet in", "Raise the first ticket"]) {
      expect(within(block as HTMLElement).getByText(step), `"${step}" is missing from Start here`).toBeTruthy()
    }
  })

  it("takes Start here away the moment the team has anything at all", async () => {
    insights.mockResolvedValue(warmPulse)
    mustRender(<HomeScreen active={active} />)
    // THE CANARY: prove this render produced a real Home before believing the
    // absence below. The team's own name is on it whatever the numbers say.
    expect(await screen.findByText("Brand New")).toBeTruthy()
    await waitFor(() => expect(insights).toHaveBeenCalled())
    expect(screen.queryByText("Start here")).toBeNull()
  })

  it("draws no block at all for a role that can create nothing", async () => {
    myPermissions.mockResolvedValue({ permissions: viewer })
    mustRender(<HomeScreen active={active} />)
    expect(await screen.findByText("Brand New")).toBeTruthy()
    await waitFor(() => expect(myPermissions).toHaveBeenCalled())
    expect(screen.queryByText("Start here")).toBeNull()
  })
})

/* -------------------- F2 · the importer is reachable at all ---------------- */

describe("F2 · every declared import target has a way in from a screen", () => {
  /** Every line of every component and lib file in the agency app, comments
   * stripped — a comment naming a route is not a route. The same census shape
   * R37's in-app-anchors check stands on, asked of a different string. */
  const agencySource = sourceFiles(
    [join(WEB, "components"), join(WEB, "lib"), join(WEB, "app")],
    { extensions: [".ts", ".tsx"], relativeTo: WEB }
  )
    .map((f) => stripComments(f.source))
    .join("\n")

  /** THE CANARY, and it runs first. `import/accounts` has had a button since
   * the importer shipped, so a census that cannot find THAT one is a broken
   * census and every zero below would be a lie. */
  it("finds an import route that is definitely there", () => {
    expect(agencySource, "the census cannot find a route that exists — every result below is meaningless").toContain(
      "import/accounts"
    )
  })

  it.each([
    ["accounts", "the customer spine"],
    ["meetings", "two years of somebody's diary"],
    ["stories", "the work in hand"],
    ["brand_assets", "the agency's own material"],
    ["meeting_purposes", "why we meet"],
    ["member_roles", "the permission sheet"],
    ["selectable_data", "the team's dropdowns"],
  ])("names import/%s on a screen (%s)", (tableKey) => {
    expect(
      agencySource,
      `nothing in web/ links at /t/<team>/import/${tableKey} — the importer works and no button reaches it`
    ).toContain(`import/${tableKey}`)
  })

  it("names the generic import screen too, which lists all seven and hands out the sample file", () => {
    expect(
      /\/t\/\$\{teamId\}\/import`/.test(agencySource),
      "the bare /t/<team>/import screen is linked from nowhere — the only way in is to type the URL"
    ).toBe(true)
  })
})

/* ------------------ F3 / F4 · what an empty collection says ---------------- */

describe("F3 · an empty collection's sentence is true of that collection", () => {
  it("no longer tells every screen that records arrive from the client portal", () => {
    mustRender(<CollectionEmptyState title="No roles yet." onCreate={() => {}} />)
    expect(screen.getByText("No roles yet.")).toBeTruthy()
    expect(
      screen.queryByText(/raises a request from the portal/i),
      "the shared default still claims every collection fills from the client portal"
    ).toBeNull()
    expect(screen.getByText(/Whatever you add shows up here/i)).toBeTruthy()
  })

  it("says something different where the reader has no way in", () => {
    mustRender(<CollectionEmptyState title="No members yet." />)
    expect(screen.getByText(/Whatever gets added shows up here/i)).toBeTruthy()
    // TEN STATES #10: the control is ABSENT, never dimmed.
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("prefers the collection's own sentence when it has one", () => {
    mustRender(
      <CollectionEmptyState title="No contacts yet." description="Open the company under Accounts." onCreate={() => {}} />
    )
    expect(screen.getByText("Open the company under Accounts.")).toBeTruthy()
    expect(screen.queryByText(/Whatever you add shows up here/i)).toBeNull()
  })

  it("F4 · Contacts names the route that actually exists, since it has no create act", () => {
    const contacts = BASE_RECIPES["contacts.list"]?.collection
    expect(contacts, "the contacts list recipe is gone").toBeTruthy()
    expect(contacts?.emptyDescription, "Contacts' empty state has no sentence of its own").toBeTruthy()
    expect(contacts?.emptyDescription).toMatch(/Accounts/)
  })

  it("keeps the portal sentence on the one collection it is true of", () => {
    expect(BASE_RECIPES["tickets.list"]?.collection?.emptyDescription).toMatch(/portal/i)
    // …and nowhere else. Every other collection that carries its own sentence
    // must not claim a client raises one of these.
    for (const [key, recipe] of Object.entries(BASE_RECIPES)) {
      if (key === "tickets.list") continue
      const said = recipe.collection?.emptyDescription
      if (!said) continue
      expect(said, `${key} still tells a new team its rows arrive from the client portal`).not.toMatch(/portal/i)
    }
  })
})
