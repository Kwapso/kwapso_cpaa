// WHAT WE HAND OVER (CHECKLIST 8.7) — the invariants this module adds, driven
// through the SHIPPED route handlers against a real SQLite database running the
// real team migrations.
//
// Five groups, in order of what it would cost to get each one wrong:
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
//   4. WHAT REACHES A CLIENT, AND WHAT STILL DOES NOT. Until 18 August 2026 the
//      answer was "nothing", proved three ways. The owner then opened the shelf
//      with a condition — "the deliverables are for them! but only once we mark
//      it as visible" — so the proof changed shape rather than being deleted:
//      the AGENCY's six doors are still absent from the portal's surface and
//      still refuse a client login, and exactly ONE new door answers a client.
//   5. THE TWO FENCES ON THAT DOOR, which is where the feature actually lives.
//      A client sees their own company's rows AND only the ones somebody marked
//      visible. Both, never either — a row that passes one test and fails the
//      other must be as absent as a row that fails both.

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

describe("the agency's own doors on the shelf still refuse a client", () => {
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

  it("the client's app names the portal door and NEVER the agency's paths", () => {
    // THIS TEST USED TO SAY SOMETHING STRONGER, and it is worth recording what
    // changed, because the weakening is the feature.
    //
    // It read: "the client's app does not name the table or the paths", and it
    // forbade the word `deliverables` anywhere under web-portal/. That was the
    // right assertion while the answer to "should a client see these?" was
    // unmade. On 18 August 2026 the owner made it — "the deliverables are for
    // them! but only once we mark it as visible" — so the portal now has a
    // screen, and the blanket ban became untrue by design rather than by
    // accident.
    //
    // What survives is the half that was always the point: the client's app must
    // not name the AGENCY's doors. `/api/content/deliverables` is the shelf on
    // one app, with our staff's names on every card and the archived rows still
    // in it; `/api/content/portal/deliverables` is the client's own fenced
    // question. The paths are deliberately not prefixes of each other, so this
    // stays a substring scan with no cleverness in it.
    //
    // PATHS ONLY, and that is a scope decision rather than an omission. The
    // other half of the old assertion — that no staff name reaches the client —
    // is owned by `web-portal/test/rules.test.ts`, which already forbids
    // `creatorName`, `editorName`, `assigneeName` and their siblings across every
    // portal component, with comments stripped first. Repeating it here would be
    // a second copy of a rule, and a worse copy: this scan reads test files and
    // prose, so a note explaining WHY we withhold a name would fail it. The
    // wire-level version of the same promise is further down this file, asserted
    // on a real response body.
    const offenders: string[] = []
    for (const { path, source } of sourceFiles(join(ROOT, "web-portal"), { extensions: [".ts", ".tsx"] }))
      if (source.includes("/api/content/deliverables")) offenders.push(path)
    expect(
      offenders,
      `the client portal names the AGENCY's handover doors: ${offenders.join(", ")}`
    ).toEqual([])
  })

  it("opens exactly ONE door to the client, and it is the portal one", () => {
    const portal = readFileSync(join(ROOT, "workers", "portal-gateway", "src", "index.ts"), "utf8")
    const named = new Set([...portal.matchAll(/"([A-Z]+ \/[^"]+)":\s*"\w+"/g)].map((m) => m[1]))
    const mine = [...named].filter((d) => d.includes("deliverables"))
    // Exactly one, and named exactly. A second line on this module's surface is a
    // decision somebody has to make on purpose, and this is where they find out.
    expect(mine).toEqual(["GET /api/content/portal/deliverables"])
  })
})

// ── THE CLIENT'S OWN SHELF, AND THE TWO FENCES ON IT ────────────────────────
//
// The owner opened this module to clients with a condition attached — "only once
// we mark it as visible" — so there are TWO fences and the whole value of the
// feature is that neither is optional:
//
//   1. THE ACCOUNT FENCE. A client sees their own company's rows. SCOPE's iron
//      rule, and the one this codebase has broken twice.
//   2. CLIENT VISIBILITY. Per ROW, defaulting to off, so the shelf can hold a
//      draft SOP and a finished one at the same time.
//
// Every test below tries to get a row out through ONE of them. A row that is
// visible but somebody else's, and a row that is theirs but not shared, must be
// equally absent — if either leaks, the feature is not what the owner asked for.
describe("what a client can see of the handover shelf", () => {
  const portalGet = (userId: string) =>
    worker.fetch(
      new Request("https://content/api/content/portal/deliverables", {
        headers: { Cookie: "session=x" },
      }),
      env(userId) as never
    )

  const clientShelf = async (userId: string) =>
    (await (await portalGet(userId)).json()) as {
      deliverables: { id: string; title: string; sharedOn: string }[]
      total: number
    }

  /** File one on an app, and hand back its id. Staff-side, through the real door. */
  async function file(appId: string, title: string): Promise<string> {
    await post(IDS.staffUser, "", { appId, title })
    const rows = (await shelf(IDS.staffUser, appId)).deliverables
    return (rows.find((d) => d.title === title) as Deliverable).id
  }

  const share = (id: string, appId: string, visible = true) =>
    post(IDS.staffUser, "/visibility", { id, appId, visible })

  /** A second company's system, so "somebody else's row" is a real row and not a
   * missing one — a fence can only be proved against something that exists. */
  function burglarApp(): string {
    db()
      .prepare(
        `INSERT INTO apps (id, account_id, name, created_at, creator_id)
         VALUES ('AP_BURGLAR', ?, 'Delaval dispatch', '2026-02-01', ?)`
      )
      .run(IDS.burglarAccount, IDS.staffUser)
    return "AP_BURGLAR"
  }

  it("EXISTING ROWS STAY HIDDEN — the column's default is the whole safety argument", async () => {
    // The migration is `ADD COLUMN visible_to_client_at TEXT`, so every row that
    // already existed got NULL, and NULL is "not visible". This is that promise,
    // driven through the real door: a deliverable filed the ordinary way is not
    // marked, and a client cannot see it.
    //
    // It is written as the FIRST test in this block on purpose. Everything else
    // here proves a fence turns somebody away; this proves the app does not need
    // anybody to have remembered anything for the shelf to be private on day one.
    await file(IDS.victimApp, "Dispatch handover")
    const row = db()
      .prepare(`SELECT visible_to_client_at AS v FROM deliverables`)
      .get() as { v: string | null }
    expect(row.v, "a newly filed deliverable must not be visible to the client").toBeNull()

    const seen = await clientShelf(IDS.victimUser)
    expect(seen.deliverables).toEqual([])
    // R16: the count is taken over the same clause, so it cannot advertise
    // material the list is withholding.
    expect(seen.total).toBe(0)
  })

  it("shows one that was shared, on the client's own account", async () => {
    const id = await file(IDS.victimApp, "Dispatch handover")
    expect((await share(id, IDS.victimApp)).status).toBe(200)

    const seen = await clientShelf(IDS.victimUser)
    expect(seen.deliverables.map((d) => d.title)).toEqual(["Dispatch handover"])
    expect(seen.total).toBe(1)
    // The date they can be told, carried as its own field rather than the switch
    // it came from.
    expect(seen.deliverables[0].sharedOn).toBeTruthy()
  })

  it("FENCE 1: a shared row on ANOTHER account is invisible", async () => {
    const other = burglarApp()
    const id = await file(other, "Delaval handover")
    await share(id, other)

    // Marta is at Bergman. The row is real, live and deliberately shared — with
    // somebody else. Nothing about "shared" widens WHO it was shared with.
    const seen = await clientShelf(IDS.victimUser)
    expect(seen.deliverables).toEqual([])
    expect(seen.total).toBe(0)

    // And the mirror, so the test is not passing because nothing is visible to
    // anyone: the burglar's own client login DOES see it.
    const theirs = await clientShelf(IDS.burglarUser)
    expect(theirs.deliverables.map((d) => d.title)).toEqual(["Delaval handover"])
  })

  it("FENCE 2: an unshared row on the client's OWN account is invisible", async () => {
    await file(IDS.victimApp, "Draft SOP, not finished")
    const shared = await file(IDS.victimApp, "Finished SOP")
    await share(shared, IDS.victimApp)

    // The shelf holds both at once, which is exactly why the switch is per row.
    const seen = await clientShelf(IDS.victimUser)
    expect(seen.deliverables.map((d) => d.title)).toEqual(["Finished SOP"])
    expect(seen.total).toBe(1)
  })

  it("BOTH, NEVER EITHER: the two fences are ANDed, not ORed", async () => {
    // The failure this catches is a refactor that reaches for `OR` — each row
    // below passes exactly one of the two tests, and neither may come back.
    const other = burglarApp()
    const theirsShared = await file(other, "Somebody else's, shared")
    await share(theirsShared, other)
    await file(IDS.victimApp, "Mine, not shared")

    const seen = await clientShelf(IDS.victimUser)
    expect(seen.deliverables).toEqual([])
    expect(seen.total).toBe(0)
  })

  it("takes it back: hiding one removes it again", async () => {
    const id = await file(IDS.victimApp, "Shared by mistake")
    await share(id, IDS.victimApp)
    expect((await clientShelf(IDS.victimUser)).total).toBe(1)

    await share(id, IDS.victimApp, false)
    const after = await clientShelf(IDS.victimUser)
    expect(after.deliverables).toEqual([])
    expect(after.total).toBe(0)
    expect(
      (db().prepare(`SELECT visible_to_client_at AS v FROM deliverables WHERE id = ?`).get(id) as {
        v: string | null
      }).v
    ).toBeNull()
  })

  it("archiving a shared one withdraws it, without un-sharing it", async () => {
    // The two switches are independent columns and the client's read demands
    // both. So "we put this away" removes it from their side and leaves the
    // sharing decision intact — restoring it puts it back exactly as it was,
    // rather than re-publishing something on a guess.
    const id = await file(IDS.victimApp, "Superseded walkthrough")
    await share(id, IDS.victimApp)
    await post(IDS.staffUser, "/active", { id, appId: IDS.victimApp, active: false })

    expect((await clientShelf(IDS.victimUser)).deliverables).toEqual([])
    expect(
      (db().prepare(`SELECT visible_to_client_at AS v FROM deliverables WHERE id = ?`).get(id) as {
        v: string | null
      }).v,
      "archiving must not silently un-share"
    ).not.toBeNull()

    await post(IDS.staffUser, "/active", { id, appId: IDS.victimApp, active: true })
    expect((await clientShelf(IDS.victimUser)).total).toBe(1)
  })

  it("R17: sharing twice is one line of history, one sharing date", async () => {
    const id = await file(IDS.victimApp, "Dispatch handover")
    await share(id, IDS.victimApp)
    const first = (
      db().prepare(`SELECT visible_to_client_at AS v FROM deliverables WHERE id = ?`).get(id) as {
        v: string
      }
    ).v

    await share(id, IDS.victimApp) // the double press
    const again = (
      db().prepare(`SELECT visible_to_client_at AS v FROM deliverables WHERE id = ?`).get(id) as {
        v: string
      }
    ).v
    // The SECOND write must not move the timestamp: the client is told when it
    // was shared with them, and a later date would be a quiet lie about it.
    expect(again).toBe(first)

    const shares = db()
      .prepare(`SELECT COUNT(*) AS n FROM activity WHERE type = 'Deliverable shared with the client'`)
      .get() as { n: number }
    expect(shares.n, "history says what happened, not how many times a button was pressed").toBe(1)

    // …and the same in the other direction.
    await share(id, IDS.victimApp, false)
    await share(id, IDS.victimApp, false)
    const hides = db()
      .prepare(`SELECT COUNT(*) AS n FROM activity WHERE type = 'Deliverable hidden from the client'`)
      .get() as { n: number }
    expect(hides.n).toBe(1)
  })

  it("says nothing about us — no staff name reaches the client's payload", async () => {
    const id = await file(IDS.victimApp, "Dispatch handover")
    await share(id, IDS.victimApp)

    // SCOPE ch.06: the portal shows the work, never which staff member is doing
    // it. Asserted on the WIRE rather than on the type, because a type is a
    // promise about the code and this is a promise about the response.
    const body = await (await portalGet(IDS.victimUser)).text()
    for (const word of ["creatorName", "editorName", "creator_name", "editor_name", "deactivated"])
      expect(body, `the client's shelf carries "${word}"`).not.toContain(word)
  })

  it("a client whose access was withdrawn reads an empty shelf, not every shelf", async () => {
    const id = await file(IDS.victimApp, "Dispatch handover")
    await share(id, IDS.victimApp)
    // Revoking the grant empties their account set, and an empty set becomes
    // `0 = 1` inside accountScopeClause. The direction matters: a fence that
    // vanished when it resolved to nothing would open the door it exists to shut.
    db().prepare(`UPDATE portal_users SET deactivated_at = '2026-03-01' WHERE user_id = ?`).run(IDS.victimUser)

    const seen = await clientShelf(IDS.victimUser)
    expect(seen.deliverables).toEqual([])
    expect(seen.total).toBe(0)
  })

  it("the sharing door itself refuses a client login (R21)", async () => {
    const id = await file(IDS.victimApp, "Dispatch handover")
    // A client cannot share a deliverable with themselves. The material is
    // theirs; the decision to hand it over is ours.
    const res = await post(IDS.victimUser, "/visibility", { id, appId: IDS.victimApp, visible: true })
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error: string }).error).toBe("client_login")
    expect(
      (db().prepare(`SELECT visible_to_client_at AS v FROM deliverables WHERE id = ?`).get(id) as {
        v: string | null
      }).v
    ).toBeNull()
  })

  it("THE TWO FENCES ARE INDEPENDENT — neither one opens the other", async () => {
    // The question the owner's answer creates, and it has to be asked in BOTH
    // directions, because "deliverables are visible now" is a sentence that
    // could mean either fence and must mean neither on its own.
    //
    // FENCE A is the MODULE PERMISSION (`deliverables:read`), which decides
    // whether a caller may knock on the door at all. It was missing from every
    // team born before migration 0036 — no role held it, not even Admin — which
    // is what 0039 fixes.
    // FENCE B is CLIENT VISIBILITY (`visible_to_client_at`), per row, which
    // decides whether a row is in the answer.
    //
    // A WITHOUT B: the harness's Client role holds every right there is,
    // including the whole deliverables module. The shelf is still empty, because
    // nobody has shared anything.
    const id = await file(IDS.victimApp, "Dispatch handover")
    const openedModule = await clientShelf(IDS.victimUser)
    expect(openedModule.deliverables, "the module right must not reveal a row").toEqual([])
    expect(openedModule.total).toBe(0)

    // B WITHOUT A: now share it — and take the module right away. Marking
    // something visible is a statement about ONE ROW, never a grant of the
    // module, so the door refuses before visibility is ever consulted.
    await share(id, IDS.victimApp)
    expect((await clientShelf(IDS.victimUser)).total, "sharing works when both are open").toBe(1)

    revokeDeliverables(IDS.clientRole)
    const res = await portalGet(IDS.victimUser)
    expect(res.status, "a shared row must not grant the module").toBe(403)
    // …and the row is untouched: the refusal is at the door, not a quiet unshare.
    expect(
      (db().prepare(`SELECT visible_to_client_at AS v FROM deliverables WHERE id = ?`).get(id) as {
        v: string | null
      }).v
    ).not.toBeNull()
  })

  it("R20: the sharing door refuses a body that is not a yes or a no", async () => {
    const id = await file(IDS.victimApp, "Dispatch handover")
    for (const bad of ["true", 1, {}, null, undefined]) {
      const res = await post(IDS.staffUser, "/visibility", { id, appId: IDS.victimApp, visible: bad })
      expect(res.status, JSON.stringify(bad)).toBe(400)
    }
    expect(
      (db().prepare(`SELECT visible_to_client_at AS v FROM deliverables WHERE id = ?`).get(id) as {
        v: string | null
      }).v
    ).toBeNull()
  })
})
