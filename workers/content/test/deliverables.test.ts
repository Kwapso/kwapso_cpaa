// WHAT WE HAND OVER (CHECKLIST 8.7) — the invariants this module adds, driven
// through the SHIPPED route handlers against a real SQLite database running the
// real team migrations.
//
// Four groups, in order of what it would cost to get each one wrong:
//
//   1. THE ACCOUNT IS COPIED OFF THE APP, never accepted from a caller. This is
//      the fence, and the fence is the whole reason the module can be opened to
//      a client later without a data migration. A caller who could assert an
//      account could file our handover material under somebody else's company —
//      a row that a fenced read would then hand to the wrong client on the day
//      the portal door is opened, which is the worst thing this module could do.
//   2. IT IS ITS OWN SWITCH. `processes` opens the app; it must not open the
//      shelf. A module that turns out to be gated on its neighbour is a
//      permission an owner cannot actually grant.
//   3. THE FIELD RULES a deliverable adds: a date is a real day, a link is one a
//      reader can safely click, and an archive is idempotent (R17).
//   4. NONE OF IT REACHES A CLIENT TODAY — the same three-legged proof the
//      agency-internal modules stand on: no portal door, a refusal at every
//      door, and a client app that does not name the table or the paths.

import type { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
import { buildSpineDb, IDS, makeEnv } from "../../tenancy/test/spine-harness"
import { sourceFiles } from "@shared/rules/source-scan"
import { ROUTES } from "../src/index"
import type { Deliverable } from "@shared/types"

const ROOT = join(__dirname, "..", "..", "..")
const db = () => holder.db as DatabaseSync

function env(userId: string) {
  const base = makeEnv(() => db(), userId) as unknown as Record<string, unknown>
  return {
    ...base,
    INTERNAL_KEY: "k",
    PUBLIC_APP_URL: "https://kwapso.example",
    REALTIME: { fetch: async () => new Response("{}") },
    MEDIA: { put: async () => undefined },
    INTERNAL_MEDIA: { put: async () => undefined },
  } as never
}

const get = (userId: string, query: string) =>
  worker.fetch(
    new Request(`https://content/api/content/deliverables${query}`, { headers: { Cookie: "session=x" } }),
    env(userId) as never
  )

const post = (userId: string, path: string, body: unknown) =>
  worker.fetch(
    new Request(`https://content/api/content/deliverables${path}`, {
      method: "POST",
      headers: { Cookie: "session=x", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env(userId) as never
  )

/** Take the shelf right away from a role that keeps every other one — including
 * `processes`, which is what opens the app itself. The harness grants both roles
 * everything on purpose, so this is how the module is proved to be its own
 * switch rather than four more rights on its neighbour. */
function revokeDeliverables(roleId: string) {
  db()
    .prepare(
      `UPDATE role_permissions SET can_read = 0, can_create = 0, can_edit = 0, can_delete = 0
        WHERE role_id = ? AND module = 'deliverables'`
    )
    .run(roleId)
}

const shelf = async (userId: string, appId: string) =>
  (await (await get(userId, `?appId=${appId}`)).json()) as { deliverables: Deliverable[]; total: number }

beforeEach(() => {
  holder.db = buildSpineDb()
})

describe("the account rides on the app, never on the request", () => {
  it("stamps the app's own account on the row, and ignores one a caller asserts", async () => {
    const res = await post(IDS.staffUser, "", {
      appId: IDS.victimApp,
      title: "Dispatch handover",
      kind: "Handover doc",
      // A caller trying to file Bergman's handover under Delaval. The door does
      // not read this field at all — that is the point of it not being one.
      accountId: IDS.burglarAccount,
    })
    expect(res.status).toBe(200)
    const row = db().prepare(`SELECT app_id, account_id FROM deliverables`).get() as {
      app_id: string
      account_id: string
    }
    expect(row.app_id).toBe(IDS.victimApp)
    expect(row.account_id).toBe(IDS.victimAccount)
  })

  it("refuses a write that names the wrong app for the row", async () => {
    db()
      .prepare(
        `INSERT INTO apps (id, account_id, name, created_at, creator_id)
         VALUES ('AP_OTHER', ?, 'Another system', '2026-02-01', ?)`
      )
      .run(IDS.burglarAccount, IDS.staffUser)
    await post(IDS.staffUser, "", { appId: IDS.victimApp, title: "Dispatch handover" })
    const id = (await shelf(IDS.staffUser, IDS.victimApp)).deliverables[0].id

    // Taking the caller's word for the app would let one misdirect BOTH halves
    // of the answer: the ping would wake the wrong screen and the reply would be
    // the wrong shelf, while the row that changed sat somewhere else.
    const edited = await post(IDS.staffUser, "/update", {
      id,
      appId: "AP_OTHER",
      title: "Renamed from somewhere else",
    })
    expect(edited.status).toBe(400)
    const archived = await post(IDS.staffUser, "/active", { id, appId: "AP_OTHER", active: false })
    expect(archived.status).toBe(400)
    const still = await shelf(IDS.staffUser, IDS.victimApp)
    expect(still.deliverables[0].title).toBe("Dispatch handover")
    expect(still.deliverables[0].active).toBe(true)
  })

  it("refuses an app that does not exist, rather than filing an orphan", async () => {
    const res = await post(IDS.staffUser, "", { appId: "NOPE", title: "Handover" })
    expect(res.status).toBe(400)
    expect(db().prepare(`SELECT COUNT(*) AS n FROM deliverables`).get()).toEqual({ n: 0 })
  })

  it("answers about ONE app's shelf, with the door's own exact total (R16)", async () => {
    db()
      .prepare(
        `INSERT INTO apps (id, account_id, name, created_at, creator_id)
         VALUES ('AP_OTHER', ?, 'Another system', '2026-02-01', ?)`
      )
      .run(IDS.burglarAccount, IDS.staffUser)
    await post(IDS.staffUser, "", { appId: IDS.victimApp, title: "One" })
    await post(IDS.staffUser, "", { appId: IDS.victimApp, title: "Two" })
    await post(IDS.staffUser, "", { appId: "AP_OTHER", title: "Somebody else's" })

    const mine = await shelf(IDS.staffUser, IDS.victimApp)
    expect(mine.deliverables.map((d) => d.title).sort()).toEqual(["One", "Two"])
    // The total is counted over the SAME narrowing the rows came from — a badge
    // over a different WHERE is R16's failure in its quietest form.
    expect(mine.total).toBe(2)
  })
})

describe("deliverables is its own switch, not four more rights on processes", () => {
  it("refuses a caller who may open the app but not its handover shelf", async () => {
    // Every other right stays — `processes` most of all, which is what opens the
    // app record this shelf is a tab on. Only the shelf right is taken away, so
    // a 403 here is the module being its own switch and nothing else.
    revokeDeliverables(IDS.adminRole)
    expect((await get(IDS.staffUser, `?appId=${IDS.victimApp}`)).status).toBe(403)
    expect((await post(IDS.staffUser, "", { appId: IDS.victimApp, title: "x" })).status).toBe(403)
    // …and the app itself is still open to them, which is what makes the line
    // above a statement about this module rather than about the caller.
    const apps = await worker.fetch(
      new Request("https://content/api/content/record-counts?table=apps&id=" + IDS.victimApp, {
        headers: { Cookie: "session=x" },
      }),
      env(IDS.staffUser) as never
    )
    expect(apps.status).toBe(200)
  })
})

describe("the field rules a deliverable adds", () => {
  it("keeps a real calendar day and refuses one the calendar does not have", async () => {
    const ok = await post(IDS.staffUser, "", {
      appId: IDS.victimApp,
      title: "Demo walkthrough",
      datedOn: "2026-07-20",
    })
    expect(ok.status).toBe(200)
    expect((await shelf(IDS.staffUser, IDS.victimApp)).deliverables[0].datedOn).toBe("2026-07-20")
    // A value that NEARLY parses is the worst kind of bad data: it sorts, it
    // renders, and it is wrong.
    const bad = await post(IDS.staffUser, "", {
      appId: IDS.victimApp,
      title: "Bad date",
      datedOn: "20/07/2026",
    })
    expect(bad.status).toBe(400)
  })

  it("stores a link a reader can click, and drops one that runs code", async () => {
    await post(IDS.staffUser, "", {
      appId: IDS.victimApp,
      title: "Loom review",
      url: "https://loom.example/abc",
    })
    await post(IDS.staffUser, "", {
      appId: IDS.victimApp,
      title: "A trap",
      url: "javascript:alert(1)",
    })
    const rows = (await shelf(IDS.staffUser, IDS.victimApp)).deliverables
    expect(rows.find((d) => d.title === "Loom review")?.url).toBe("https://loom.example/abc")
    // Dropped rather than refused — a link is optional, and losing a bad one
    // costs nothing. What it must never do is reach an href.
    expect(rows.find((d) => d.title === "A trap")?.url).toBeNull()
  })

  it("adds the kind to the team's own vocabulary rather than refusing a new word", async () => {
    await post(IDS.staffUser, "", { appId: IDS.victimApp, title: "A thing", kind: "Teller review" })
    const row = db()
      .prepare(`SELECT COUNT(*) AS n FROM selectable_data WHERE type = 'Deliverable kind' AND value = ?`)
      .get("Teller review") as { n: number }
    expect(row.n).toBe(1)
  })

  it("archives instead of deleting, and a second archive moves nothing (R17)", async () => {
    await post(IDS.staffUser, "", { appId: IDS.victimApp, title: "Superseded doc" })
    const id = (await shelf(IDS.staffUser, IDS.victimApp)).deliverables[0].id

    const first = await post(IDS.staffUser, "/active", { id, appId: IDS.victimApp, active: false })
    expect(first.status).toBe(200)
    const second = await post(IDS.staffUser, "/active", { id, appId: IDS.victimApp, active: false })
    expect(second.status).toBe(200)

    // The row survives — and the shelf still shows it, because a superseded
    // handover doc is still something we sent.
    const after = await shelf(IDS.staffUser, IDS.victimApp)
    expect(after.total).toBe(1)
    expect(after.deliverables[0].active).toBe(false)
    // History says what happened, not how many times a button was pressed.
    const history = db()
      .prepare(`SELECT COUNT(*) AS n FROM activity WHERE related_table = 'deliverables' AND type = ?`)
      .get("Deliverable archived") as { n: number }
    expect(history.n).toBe(1)
  })

  it("has no DELETE anywhere in the module", () => {
    for (const file of ["lib/deliverables.ts", "routes/deliverables.ts"]) {
      const src = readFileSync(join(__dirname, "..", "src", file), "utf8")
      expect(/DELETE\s+FROM/i.test(src), `${file} deletes a row — this base archives`).toBe(false)
    }
  })
})

describe("what we hand over does not reach the client's side today", () => {
  /** DERIVED from the worker's own route table — a door added tomorrow is
   * judged today. */
  const doors = Object.keys(ROUTES).filter((d) => d.includes("/api/content/deliverables"))

  it("finds the doors it is about (a blind scan reports 'all clear' like a pass)", () => {
    expect(doors.length, "no deliverables doors found — this scan is reading nothing").toBeGreaterThan(4)
  })

  it("not one of them is on the client portal's surface", () => {
    const portal = readFileSync(join(ROOT, "workers", "portal-gateway", "src", "index.ts"), "utf8")
    const named = new Set([...portal.matchAll(/"([A-Z]+ \/[^"]+)":\s*"\w+"/g)].map((m) => m[1]))
    expect(named.size, "PORTAL_DOORS did not parse").toBeGreaterThan(5)
    expect(doors.filter((d) => named.has(d))).toEqual([])
  })

  it("every one of them refuses a portal caller at the door (R21)", () => {
    // Belt AND braces. The routing above says a client cannot knock; this says
    // that if one ever could, the door would still turn them away — R21's own
    // sentence about not depending on how carefully something else was built.
    const bodies = new Map<string, string>()
    for (const { source } of sourceFiles(join(__dirname, "..", "src", "routes"), { extensions: [".ts"] })) {
      const starts = [...source.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)]
      starts.forEach((m, i) => bodies.set(m[1], source.slice(m.index, starts[i + 1]?.index ?? source.length)))
    }
    const naked = doors.filter((d) => !/refusePortalCaller\s*\(/.test(bodies.get(ROUTES[d].handler.name) ?? ""))
    expect(naked, `these deliverables doors do not refuse a client login: ${naked.join(", ")}`).toEqual([])
  })

  it("turns a client login away even holding every right (R21)", async () => {
    // The harness's Client role holds `deliverables` on purpose — the material
    // IS the client's, so a role somebody built would plausibly tick it. What
    // stops them is the door, not the role.
    const res = await get(IDS.victimUser, `?appId=${IDS.victimApp}`)
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error: string }).error).toBe("client_login")
  })

  it("the client's app does not name the table or the paths", () => {
    // The leg a permission cannot grant its way past: even if a door opened and
    // even if a gate were inverted, nothing in the client app knows these rows
    // exist. An import cannot be forgotten.
    const offenders: string[] = []
    for (const { path, source } of sourceFiles(join(ROOT, "web-portal"), { extensions: [".ts", ".tsx"] }))
      for (const word of ["deliverables", "/api/content/deliverables"])
        if (source.includes(word)) offenders.push(`${path} names "${word}"`)
    expect(offenders, `the client portal names the handover shelf: ${offenders.join(", ")}`).toEqual([])
  })
})
