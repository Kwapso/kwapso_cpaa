// THE RELATIONSHIP MAP'S DATA LAYER — and mostly, its fence.
//
// A MAP LEAKS BY AGGREGATION EVEN WHEN EVERY NODE IS FENCED. That is R24's
// reasoning about numbers, arriving at relationships: each record on its own is
// compartment-fenced and the fences work, but an EDGE is a fact about TWO records
// and can disclose something neither endpoint states. A contact in one client's
// compartment sharing a meeting with a contact in another says that those two
// clients met — which is exactly what SCOPE's account fence exists to keep apart.
//
// So the assertions that matter here are the negative ones: an edge whose FAR END
// the caller may not read is absent. Not greyed, not counted, not "3 more" —
// absent, because a count of things you may not see is itself the fact being
// withheld. Every one of them is written from the far end's side, because that is
// the side a near-end-only check would let through.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import { buildSpineDb, IDS, makeEnv } from "../../tenancy/test/spine-harness"
import worker from "../src/index"
import { edgesFor, NEIGHBOURS_PER_EDGE, RECORD_EDGES } from "../src/lib/record-map"
import { ACTIVITY_GATE_MAP } from "@shared/rules/registry"

const db = () => holder.db as DatabaseSync

/** Every module the map's edges touch, granted to the admin role — the spine
 * harness grants what its own suites needed, and this is the first map read. */
function grantMapModules() {
  const modules = [
    // …plus `knowledge`, which is the door's own gate: this is the knowledge
    // section's screen, and the per-module subtraction decides what is IN the
    // picture rather than whether there is one.
    "knowledge",
    ...new Set(RECORD_EDGES.flatMap((e) => [e.from, e.to]).map((t) => ACTIVITY_GATE_MAP[t])),
  ]
  for (const m of modules)
    db().exec(
      `INSERT OR IGNORE INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
         VALUES ('${IDS.adminRole}_map_${m}', '${IDS.adminRole}', '${m}', 1, 1, 1, 1)`
    )
}

/** Take one module's read right away, without touching the others. */
function deny(module: string) {
  db().exec(
    `UPDATE role_permissions SET can_read = 0 WHERE role_id = '${IDS.adminRole}' AND module = '${module}'`
  )
}

async function map(table: string, id: string) {
  const res = await worker.fetch(
    new Request(`https://content/api/content/knowledge/map?table=${table}&id=${id}`, {
      headers: { Cookie: "session=x" },
    }),
    makeEnv(() => holder.db as DatabaseSync, IDS.staffUser)
  )
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

beforeEach(() => {
  holder.db = buildSpineDb()
  grantMapModules()
  db().exec(`
    INSERT INTO accounts (id, account_type, name, created_at)
      VALUES ('A_MAP', 'entity', 'Mapland GmbH', '2026-01-01');
    INSERT INTO apps (id, account_id, name, created_at)
      VALUES ('APP_MAP', 'A_MAP', 'Dispatch', '2026-01-01');
    INSERT INTO help (id, account_id, app_id, description, status, created_at)
      VALUES ('T_MAP', 'A_MAP', 'APP_MAP', 'The screen logs drivers out', 'new', '2026-02-01');
    INSERT INTO processes (id, app_id, name, created_at)
      VALUES ('P_MAP', 'APP_MAP', 'Invoice approval', '2026-01-05');
  `)
})

describe("one record's neighbourhood", () => {
  it("draws what sits one step away, in both directions", async () => {
    const { status, body } = await map("apps", "APP_MAP")
    expect(status).toBe(200)
    const nodes = body.nodes as { table: string; id: string; label: string }[]
    // OUTWARD: the app points at its account. INWARD: the ticket and the process
    // point at the app. One edge table, two readings, and the picture reads the
    // same whichever end you opened it from.
    expect(nodes.map((n) => `${n.table}:${n.id}`).sort()).toEqual(
      ["accounts:A_MAP", "apps:APP_MAP", "help:T_MAP", "processes:P_MAP"].sort()
    )
    expect((body.focus as { label: string }).label).toBe("Dispatch")
    // The label, not the ULID — a map without labels is a diagram of identifiers.
    expect(nodes.find((n) => n.id === "A_MAP")?.label).toBe("Mapland GmbH")
  })

  it("says what each line MEANS, in the edge's own direction", async () => {
    const { body } = await map("apps", "APP_MAP")
    const links = body.links as { from: string; to: string; relation: string }[]
    expect(links).toContainEqual({
      from: "apps:APP_MAP",
      to: "accounts:A_MAP",
      relation: "is built for",
    })
    expect(links).toContainEqual({ from: "help:T_MAP", to: "apps:APP_MAP", relation: "is about" })
  })

  it("answers nothing for a record that does not exist", async () => {
    const { body } = await map("apps", "NOPE")
    expect(body.focus).toBeNull()
    expect(body.nodes).toEqual([])
  })

  it("refuses a table it does not draw", async () => {
    const { status } = await map("__proto__", "APP_MAP")
    expect(status, "an inherited member is not a table").toBe(400)
  })
})

describe("the fence is on BOTH ends of every edge", () => {
  it("a caller denied the far end's module does not see the edge at all", async () => {
    deny("accounts")
    const { body } = await map("apps", "APP_MAP")
    const nodes = body.nodes as { table: string; id: string }[]
    expect(
      nodes.some((n) => n.table === "accounts"),
      "the account is the FAR end — a near-end-only check would have drawn it"
    ).toBe(false)
    const links = body.links as { to: string }[]
    expect(links.some((l) => l.to === "accounts:A_MAP")).toBe(false)
    // …and the rest of the neighbourhood is untouched: the fence removes an edge,
    // never the picture.
    expect(nodes.some((n) => n.id === "T_MAP")).toBe(true)
  })

  it("and it is ABSENT, never counted — a count of what you may not see is the fact", async () => {
    const withAccounts = await map("apps", "APP_MAP")
    deny("accounts")
    const without = await map("apps", "APP_MAP")
    expect(
      (without.body.total as number) < (withAccounts.body.total as number),
      "the denied edge must leave the total, not sit inside it as an unnamed one"
    ).toBe(true)
  })

  it("a caller denied the NEAR end's module gets nothing at all", async () => {
    deny("processes") // apps and processes share this module
    const { body } = await map("apps", "APP_MAP")
    expect(body.focus, "you cannot stand on a record you may not read").toBeNull()
    expect(body.nodes).toEqual([])
  })

  it("edgesFor keeps only edges whose BOTH ends are readable", () => {
    const all = new Set(Object.keys(ACTIVITY_GATE_MAP))
    expect(edgesFor("help", all).length, "the fixture has ticket edges").toBeGreaterThan(0)
    // The far end gone: the edge goes with it.
    const noAccounts = new Set([...all].filter((t) => t !== "accounts"))
    expect(edgesFor("help", noAccounts).some((e) => e.to === "accounts")).toBe(false)
    // The near end gone: nothing at all.
    expect(edgesFor("help", new Set([...all].filter((t) => t !== "help")))).toEqual([])
  })
})

describe("the map is bounded by construction", () => {
  it("every edge's read is capped, and the cap is a constant in the file", () => {
    expect(NEIGHBOURS_PER_EDGE).toBeGreaterThan(0)
    expect(NEIGHBOURS_PER_EDGE).toBeLessThanOrEqual(100)
  })

  it("and every edge names two tables the gate map knows", () => {
    // A table missing from ACTIVITY_GATE_MAP has no module, so `readableTables`
    // can never admit it and the edge would be silently undrawable — a line in
    // the table that does nothing, which is the shape every deny-list in this
    // base rot-checks against.
    for (const e of RECORD_EDGES) {
      expect(ACTIVITY_GATE_MAP[e.from], `edge from "${e.from}" maps to no module`).toBeTruthy()
      expect(ACTIVITY_GATE_MAP[e.to], `edge to "${e.to}" maps to no module`).toBeTruthy()
      expect(e.relation.length, `the edge ${e.from}→${e.to} says nothing`).toBeGreaterThan(2)
    }
  })
})
