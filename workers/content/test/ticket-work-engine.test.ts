// THE WORK ENGINE'S TICKET — the five states, the reference number, the drag-rank,
// the lock and the archive, driven through the SHIPPED route handlers against a
// real SQLite database running the real team migrations.
//
// Behavioural, not source-scanning, on purpose. Every rule here is the kind a
// scan cannot see: whether two simultaneous writers can take the same reference,
// whether a client can still rewrite a question after we have read it, whether
// archiving twice writes history twice. Each one is a sentence SCOPE ch.07 says
// and the database has to keep.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
import { buildSpineDb, IDS, makeEnv } from "../../tenancy/test/spine-harness"

const db = () => holder.db as DatabaseSync

function env(userId: string) {
  const base = makeEnv(() => db(), userId) as unknown as Record<string, unknown>
  return {
    ...base,
    INTERNAL_KEY: "k",
    PUBLIC_APP_URL: "https://kwapso.example",
    REALTIME: { fetch: async () => new Response("{}") },
  } as never
}

const call = (userId: string, route: string, body?: unknown, query = "") => {
  const [method, path] = route.split(" ")
  return worker.fetch(
    new Request(`https://content${path}${query}`, {
      method,
      headers: { Cookie: "session=x", "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    }),
    env(userId) as never
  )
}

const ticketIds = async (res: Response): Promise<string[]> =>
  ((await res.json()) as { tickets?: { id: string }[] }).tickets?.map((t) => t.id) ?? []

const row = (id: string) =>
  db().prepare(`SELECT * FROM help WHERE id = ?`).get(id) as Record<string, string | number | null>

const historyFor = (id: string) =>
  db().prepare(`SELECT type FROM activity WHERE related_row_id = ? ORDER BY id`).all(id) as { type: string }[]

beforeEach(() => {
  holder.db = buildSpineDb()
  // The victim's company carries a short code, which is what a reference number
  // is built out of. The shared fixture doesn't set one (it isn't about
  // references), so this suite gives it one rather than asserting against a
  // fixture nobody else needs to reason about.
  db().exec(`UPDATE accounts SET code = 'BERG' WHERE id = '${IDS.victimAccount}';`)
})

describe("the five states", () => {
  it("a ticket is raised as `new`, not as anything the old vocabulary knew", async () => {
    const res = await call(IDS.staffUser, "POST /api/content/help", {
      description: "The dispatch board stopped refreshing",
      accountId: IDS.victimAccount,
    })
    expect(res.status).toBe(200)
    const raised = db()
      .prepare(`SELECT status FROM help WHERE description = 'The dispatch board stopped refreshing'`)
      .get() as { status: string }
    expect(raised.status).toBe("new")
  })

  it("moves through triaged, in progress, ready and resolved, and refuses anything else", async () => {
    const id = (await ticketIds(
      await call(IDS.staffUser, "POST /api/content/help", { description: "Walk the lifecycle" })
    ))[0]
    for (const status of ["triaged", "in_progress", "ready", "resolved"]) {
      expect((await call(IDS.staffUser, "POST /api/content/help/status", { id, status })).status).toBe(200)
      expect(row(id).status).toBe(status)
    }
    // `reopened` was a state and is not one any more — the way back is `triaged`.
    const gone = await call(IDS.staffUser, "POST /api/content/help/status", { id, status: "reopened" })
    expect(gone.status).toBe(400)
    expect(row(id).status).toBe("resolved")
  })

  it("resolving twice moves zero rows the second time — no duplicate history (R17)", async () => {
    const id = (await ticketIds(
      await call(IDS.staffUser, "POST /api/content/help", { description: "Idempotent resolve" })
    ))[0]
    await call(IDS.staffUser, "POST /api/content/help/status", { id, status: "resolved" })
    await call(IDS.staffUser, "POST /api/content/help/status", { id, status: "resolved" })
    expect(historyFor(id).filter((h) => h.type === "Ticket resolved")).toHaveLength(1)
  })
})

describe("the reference number the client quotes", () => {
  it("is built from the account's own code and counts per account", async () => {
    const first = (await ticketIds(
      await call(IDS.staffUser, "POST /api/content/help", {
        description: "First for Bergman",
        accountId: IDS.victimAccount,
      })
    ))[0]
    const second = (await ticketIds(
      await call(IDS.staffUser, "POST /api/content/help", {
        description: "Second for Bergman",
        accountId: IDS.victimAccount,
      })
    ))[0]
    expect(row(first).ref).toBe("BERG-T0001")
    expect(row(second).ref).toBe("BERG-T0002")
  })

  it("is null when there is nothing to build one out of", async () => {
    // The agency's own question: no account, so no code, so no reference. A
    // number nobody can quote would look like it meant something.
    const ours = (await ticketIds(
      await call(IDS.staffUser, "POST /api/content/help", { description: "Our own internal question" })
    ))[0]
    expect(row(ours).ref).toBeNull()

    // A client with no short code yet — same answer, different reason.
    db().exec(`UPDATE accounts SET code = NULL WHERE id = '${IDS.victimAccount}';`)
    const uncoded = (await ticketIds(
      await call(IDS.staffUser, "POST /api/content/help", {
        description: "Before they were given a code",
        accountId: IDS.victimAccount,
      })
    ))[0]
    expect(row(uncoded).ref).toBeNull()
  })

  it("two tickets raised at the same instant never take the same number", async () => {
    // THE RACE, run for real. The allocator is one statement — INSERT … ON
    // CONFLICT DO UPDATE … RETURNING — precisely so that a read-then-write cannot
    // hand two callers the same value. Twelve concurrent raises on ONE account is
    // the shape that breaks a read-then-write every time.
    const raises = Array.from({ length: 12 }, (_, i) =>
      call(IDS.staffUser, "POST /api/content/help", {
        description: `Concurrent ${i}`,
        accountId: IDS.victimAccount,
      })
    )
    await Promise.all(raises)
    const refs = db()
      .prepare(`SELECT ref FROM help WHERE ref IS NOT NULL ORDER BY ref`)
      .all() as { ref: string }[]
    expect(refs).toHaveLength(12)
    expect(new Set(refs.map((r) => r.ref)).size, "every reference must be its own").toBe(12)
    // …and they are a dense run, not twelve copies of the same gap.
    expect(refs.map((r) => r.ref)).toEqual(
      Array.from({ length: 12 }, (_, i) => `BERG-T${String(i + 1).padStart(4, "0")}`)
    )
  })
})

describe("the lock: the account owns the wording until we read it", () => {
  /** A client's own brand-new question, raised through the portal door. */
  async function clientTicket(): Promise<string> {
    const ids = await ticketIds(
      await call(IDS.victimUser, "POST /api/content/help", { description: "Our March report is wrong" })
    )
    return ids[0]
  }

  it("a client may correct their own question while nobody here has read it", async () => {
    const id = await clientTicket()
    expect(row(id).locked_at).toBeNull()
    const res = await call(IDS.victimUser, "POST /api/content/help/update", {
      id,
      description: "Our March report is wrong — the VAT line is missing",
    })
    expect(res.status).toBe(200)
    expect(row(id).description).toBe("Our March report is wrong — the VAT line is missing")
  })

  it("the first staff touch locks it, and the client is refused after that", async () => {
    const id = await clientTicket()
    // A staff member moves it along — that IS the first touch.
    await call(IDS.staffUser, "POST /api/content/help/status", { id, status: "triaged" })
    expect(row(id).locked_at, "a staff status move must close the lock").not.toBeNull()

    const res = await call(IDS.victimUser, "POST /api/content/help/update", {
      id,
      description: "Actually, ignore all that",
    })
    expect(res.status).toBe(409)
    expect(row(id).description, "the wording must not have moved").toBe("Our March report is wrong")
  })

  it("the lock records when we FIRST read it, not the last time anyone typed", async () => {
    const id = await clientTicket()
    await call(IDS.staffUser, "POST /api/content/help/status", { id, status: "triaged" })
    // Back-date the lock to a moment nothing in this test could produce. Two
    // moves in the same millisecond would otherwise write the SAME timestamp,
    // and the test would pass whether the write COALESCEs or overwrites — which
    // is exactly what the sabotage run caught it doing.
    const FIRST_READ = "2020-01-01T00:00:00.000Z"
    db().prepare(`UPDATE help SET locked_at = ? WHERE id = ?`).run(FIRST_READ, id)
    await call(IDS.staffUser, "POST /api/content/help/status", { id, status: "in_progress" })
    expect(row(id).locked_at, "a later move must not push the moment forward").toBe(FIRST_READ)
  })

  it("a staff-raised ticket is locked from the moment it exists", async () => {
    // We typed it, on their behalf, so the first staff touch has already happened.
    const id = (await ticketIds(
      await call(IDS.staffUser, "POST /api/content/help", {
        description: "Called in by phone",
        accountId: IDS.victimAccount,
      })
    ))[0]
    expect(row(id).locked_at).not.toBeNull()
  })

  it("staff are never stopped by the lock — it is theirs", async () => {
    const id = await clientTicket()
    await call(IDS.staffUser, "POST /api/content/help/status", { id, status: "triaged" })
    const res = await call(IDS.staffUser, "POST /api/content/help/update", {
      id,
      description: "Rewritten by us, which is allowed",
    })
    expect(res.status).toBe(200)
  })

  it("a client cannot rewrite a COLLEAGUE's question, even an unread one", async () => {
    // A contact sees their whole company's requests now. Being allowed to read a
    // colleague's question is not being allowed to speak for them.
    const id = await clientTicket()
    db().exec(`
      INSERT INTO users (id, email, first_name, current_team_id) VALUES ('U_COLL', 'jon@bergman.example', 'Jon', '${IDS.team}');
      INSERT INTO team_members (id, team_id, user_id, role_id, created_at) VALUES ('m_coll', '${IDS.team}', 'U_COLL', '${IDS.clientRole}', '2026-01-01');
      INSERT INTO accounts (id, account_type, parent_account_id, name, created_at, creator_id)
        VALUES ('A_COLL', 'individual', '${IDS.victimAccount}', 'Jon Vidal', '2026-01-01', '${IDS.staffUser}');
      INSERT INTO portal_users (id, account_id, user_id, created_at, creator_id)
        VALUES ('P_COLL', 'A_COLL', 'U_COLL', '2026-01-01', '${IDS.staffUser}');
    `)
    // They can SEE it…
    expect(await ticketIds(await call("U_COLL", "GET /api/content/help"))).toContain(id)
    // …and they cannot rewrite it.
    const res = await call("U_COLL", "POST /api/content/help/update", { id, description: "Speaking for Marta" })
    expect(res.status).toBe(403)
    expect(row(id).description).toBe("Our March report is wrong")
  })
})

describe("drag-rank is the order the list is read in", () => {
  async function three(): Promise<string[]> {
    const ids: string[] = []
    for (const text of ["oldest", "middle", "newest"])
      ids.push(
        (await ticketIds(await call(IDS.staffUser, "POST /api/content/help", { description: text })))[0]
      )
    return ids // raised oldest → newest
  }

  /** The listed order of just OUR three. The shared fixture ships a ticket of its
   * own, and this suite is about the three it raised — not about where a fixture
   * row written before the rank column existed happens to land. */
  const orderOf = async (ids: string[]) =>
    (await ticketIds(await call(IDS.staffUser, "GET /api/content/help"))).filter((id) => ids.includes(id))

  it("a new ticket goes to the top", async () => {
    const [oldest, middle, newest] = await three()
    expect(await orderOf([oldest, middle, newest])).toEqual([newest, middle, oldest])
  })

  it("dragging a ticket moves it, and only it", async () => {
    const [oldest, middle, newest] = await three()
    // Put the oldest between newest and middle — i.e. below `newest`, above `middle`.
    const res = await call(IDS.staffUser, "POST /api/content/help/rank", {
      id: oldest,
      afterId: newest,
      beforeId: middle,
    })
    expect(res.status).toBe(200)
    expect(await orderOf([oldest, middle, newest])).toEqual([newest, oldest, middle])
  })

  it("a reply no longer shoves a ticket above the one somebody dragged to the top", async () => {
    // The order used to be newest-ACTIVITY-first, so any comment on an old ticket
    // undid the arrangement. This is the sentence that changed.
    const [oldest, middle, newest] = await three()
    await call(IDS.staffUser, "POST /api/content/help/reply", { helpId: oldest, body: "Bumping this" })
    expect(await orderOf([oldest, middle, newest])).toEqual([newest, middle, oldest])
  })

  it("dropping a ticket back where it started moves zero rows (R17)", async () => {
    const [, middle, newest] = await three()
    await call(IDS.staffUser, "POST /api/content/help/rank", { id: middle, afterId: newest })
    const settled = row(middle).rank
    const again = await call(IDS.staffUser, "POST /api/content/help/rank", { id: middle, afterId: newest })
    expect(again.status).toBe(200)
    // A second identical drag lands on the same key, so the R17 predicate matches
    // nothing — and history records the move once, not twice.
    expect(row(middle).rank).toBe(settled)
    expect(historyFor(middle).filter((h) => h.type === "Ticket reordered")).toHaveLength(1)
  })

  it("a client cannot pin their ticket next to one they cannot see", async () => {
    const mine = (await ticketIds(
      await call(IDS.victimUser, "POST /api/content/help", { description: "Mine" })
    ))[0]
    // The burglar's ticket is another company's; naming it must not even confirm
    // it exists. (The Client role holds no help:edit, so the door refuses first —
    // which is the outer of the two answers, and the one that ships today.)
    const res = await call(IDS.victimUser, "POST /api/content/help/rank", {
      id: mine,
      afterId: IDS.burglarAccount,
    })
    expect([403, 404]).toContain(res.status)
  })
})

describe("archive: put away, never lost", () => {
  async function archivedTicket(): Promise<string> {
    const id = (await ticketIds(
      await call(IDS.staffUser, "POST /api/content/help", { description: "Something to put away" })
    ))[0]
    await call(IDS.staffUser, "POST /api/content/help/archive", { id, archived: true })
    return id
  }

  it("drops out of the everyday list and its count, and the row survives", async () => {
    const id = await archivedTicket()
    const res = await call(IDS.staffUser, "GET /api/content/help")
    expect(await ticketIds(res)).not.toContain(id)
    // The row, its description and its history are all still there.
    expect(row(id).description).toBe("Something to put away")
    expect(historyFor(id).some((h) => h.type === "Ticket archived")).toBe(true)
  })

  it("is reachable in the archive view and by id, so it can be restored", async () => {
    const id = await archivedTicket()
    expect(await ticketIds(await call(IDS.staffUser, "GET /api/content/help", undefined, "?view=archived"))).toContain(id)
    expect(await ticketIds(await call(IDS.staffUser, "GET /api/content/help", undefined, `?id=${id}`))).toContain(id)

    await call(IDS.staffUser, "POST /api/content/help/archive", { id, archived: false })
    expect(await ticketIds(await call(IDS.staffUser, "GET /api/content/help"))).toContain(id)
  })

  it("the count follows the view it belongs to (R16)", async () => {
    const id = await archivedTicket()
    const total = async (query: string) =>
      ((await (await call(IDS.staffUser, "GET /api/content/help", undefined, query)).json()) as { total: number })
        .total
    const live = await total("")
    const archived = await total("?view=archived")
    expect(archived, "the archive view counts the archive").toBe(1)
    const listed = await ticketIds(await call(IDS.staffUser, "GET /api/content/help"))
    expect(live, "the live badge counts the live list, never both").toBe(listed.length)
    expect(listed).not.toContain(id)
  })

  it("archiving twice writes history once (R17)", async () => {
    const id = await archivedTicket()
    await call(IDS.staffUser, "POST /api/content/help/archive", { id, archived: true })
    expect(historyFor(id).filter((h) => h.type === "Ticket archived")).toHaveLength(1)
  })

  it("is available from ANY state, resolved included", async () => {
    const id = (await ticketIds(
      await call(IDS.staffUser, "POST /api/content/help", { description: "Resolved then filed" })
    ))[0]
    await call(IDS.staffUser, "POST /api/content/help/status", { id, status: "resolved" })
    expect((await call(IDS.staffUser, "POST /api/content/help/archive", { id, archived: true })).status).toBe(200)
    expect(row(id).archived_at).not.toBeNull()
  })
})

describe("both titles, and neither overwrites the other", () => {
  it("an edit that names one title leaves the other exactly as it was", async () => {
    const id = (await ticketIds(
      await call(IDS.staffUser, "POST /api/content/help", {
        description: "Zwei Titel",
        titleDe: "Rechnung fehlt",
      })
    ))[0]
    expect(row(id).title_de).toBe("Rechnung fehlt")

    // The translate step sets the English one. The German original must survive —
    // 788 of the tickets arriving from Glide exist ONLY in German.
    await call(IDS.staffUser, "POST /api/content/help/update", {
      id,
      description: "Zwei Titel",
      titleEn: "Invoice missing",
    })
    expect(row(id).title_en).toBe("Invoice missing")
    expect(row(id).title_de, "the original must never be overwritten by a translation").toBe("Rechnung fehlt")
  })
})
