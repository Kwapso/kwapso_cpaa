// THE BADGE DOOR, content's half — driven through the SHIPPED route handler
// against a real SQLite database running the real team migrations.
//
// WHAT IT IS FOR. A record's collection tabs were badged out of a cache sidecar
// that only the tab PANEL's own list fetch ever primed, so the number appeared
// when you clicked the tab and not before — and `formatCount` renders nothing
// for "none" AND nothing for "not loaded", so an unopened tab was
// indistinguishable from an empty one. The fix is to fetch the COUNTS eagerly
// and leave the ROWS lazy, and this is the door that does it.
//
// FOUR THINGS ARE WORTH LOCKING, each a way it could be quietly wrong while
// looking right on screen:
//
//   1. IT REFUSES A CLIENT LOGIN (R21). Everything it counts is the agency's own
//      picture of a customer, and the door is reachable at the agency origin by
//      anybody with a session — a client login included, because that is an
//      ordinary team member holding an ordinary role.
//
//   2. A MODULE THE CALLER CANNOT READ COMES BACK `null`, NOT ZERO (R18). The
//      one that would never be noticed: a `0` is a confident statement that
//      there are none, and it looks identical to the truth.
//
//   3. EACH FIGURE IS THE COLLECTION THE TAB ACTUALLY REVEALS. The count and the
//      list must be the same question — an archived ticket counted under a tab
//      that hides archived tickets is a number the list can never reach, which
//      is R16's failure in its quietest form.
//
//   4. AN UNKNOWN RECORD KIND IS A CLEAN 400, not an empty object that reads
//      like an answer (R20: the table is held to an allow-list derived from the
//      registry).

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
import {
  childrenFor,
  COUNTED_RECORD_TABLES,
  recordTimeCountKey,
  type RecordCounts,
} from "@shared/record-counts"
import { WORK_LOG_TARGETS } from "../src/lib/work-logs"

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

const ask = (userId: string, table: string, id: string) =>
  worker.fetch(
    new Request(
      `https://content/api/content/record-counts?table=${encodeURIComponent(table)}&id=${encodeURIComponent(id)}`,
      { headers: { Cookie: "session=x" } }
    ),
    env(userId) as never
  )

const counts = async (userId: string, table: string, id: string) =>
  ((await (await ask(userId, table, id)).json()) as RecordCounts).counts

/* --------------------------- the fixture's children ----------------------- */

const sprint = (id: string, opts: { accountId?: string; appId?: string }) =>
  db()
    .prepare(
      `INSERT INTO sprints (id, account_id, app_id, name, created_at, creator_id)
       VALUES (?, ?, ?, ?, '2026-02-10', ?)`
    )
    .run(id, opts.accountId ?? null, opts.appId ?? null, `Sprint ${id}`, IDS.staffUser)

const story = (
  id: string,
  opts: { appId?: string; sprintId?: string; ticketId?: string; status?: string }
) =>
  db()
    .prepare(
      `INSERT INTO stories (id, app_id, sprint_id, ticket_id, title, status, created_at, creator_id)
       VALUES (?, ?, ?, ?, ?, ?, '2026-02-10', ?)`
    )
    .run(
      id,
      opts.appId ?? null,
      opts.sprintId ?? null,
      opts.ticketId ?? null,
      `Story ${id}`,
      opts.status ?? "open",
      IDS.staffUser
    )

const todo = (id: string, accountId: string, done = false) =>
  db()
    .prepare(
      `INSERT INTO todos (id, account_id, title, completed_at, created_at, creator_id)
       VALUES (?, ?, ?, ?, '2026-02-10', ?)`
    )
    .run(id, accountId, `To-do ${id}`, done ? "2026-02-11" : null, IDS.staffUser)

beforeEach(() => {
  holder.db = buildSpineDb()
})

describe("the record-counts door (content)", () => {
  it("refuses a client login outright (R21)", async () => {
    const res = await ask(IDS.contactUser, "accounts", IDS.victimAccount)
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error: string }).error).toBe("client_login")
  })

  it("answers only for a record kind the registry knows (R20)", async () => {
    const res = await ask(IDS.staffUser, "invoices", IDS.victimAccount)
    expect(res.status).toBe(400)
    // …and a missing id is refused too, rather than counting the whole team's
    // rows under a badge that claims to be about one record.
    const noId = await worker.fetch(
      new Request("https://content/api/content/record-counts?table=accounts", {
        headers: { Cookie: "session=x" },
      }),
      env(IDS.staffUser) as never
    )
    expect(noId.status).toBe(400)
  })

  // THE ONE THE OWNER REPORTED, at the door: a record whose child collections
  // are NOT empty answers with their sizes, in one call, without anybody having
  // opened a tab.
  it("counts every child collection of one record in ONE call", async () => {
    sprint("SP1", { accountId: IDS.victimAccount })
    sprint("SP2", { accountId: IDS.victimAccount })
    todo("TD1", IDS.victimAccount)
    todo("TD2", IDS.victimAccount)
    todo("TD3", IDS.victimAccount)

    const body = await counts(IDS.staffUser, "accounts", IDS.victimAccount)
    expect(body["sprints-account"]).toBe(2)
    expect(body["todos-account"]).toBe(3)
    // The fixture's ticket was raised BY this account, so the badge is 1 rather
    // than a number arranged for this test.
    expect(body["tickets-account"]).toBe(1)
  })

  it("counts a system's work, its maps' siblings and its requests", async () => {
    sprint("SP1", { appId: IDS.victimApp })
    story("ST1", { appId: IDS.victimApp })
    story("ST2", { appId: IDS.victimApp, status: "done" })

    const body = await counts(IDS.staffUser, "apps", IDS.victimApp)
    expect(body["sprints-app"]).toBe(1)
    // BOTH stories, finished one included — the app's Stories tab lists
    // `view: "all"` because it is the record of what was done, so a count that
    // hid the done one would badge a number the list can never reach (R16).
    expect(body["stories-app"]).toBe(2)
    // Nothing was ever counted for a collection this worker does not own: the
    // process-map figure is tenancy's, and the screen merges the two answers.
    expect("processes-app" in body).toBe(false)
  })

  it("counts the work written down against one request, and its files", async () => {
    story("ST1", { ticketId: IDS.victimTicket })
    story("ST2", { ticketId: IDS.victimTicket, status: "done" })
    db()
      .prepare(
        `INSERT INTO help_attachments (id, help_id, kind, label, url, created_at, creator_id)
         VALUES ('AT1', ?, 'link', 'The spec', 'https://example.test/spec', '2026-02-10', ?)`
      )
      .run(IDS.victimTicket, IDS.staffUser)

    const body = await counts(IDS.staffUser, "help", IDS.victimTicket)
    expect(body["stories-ticket"]).toBe(2)
    expect(body["help-attachments"]).toBe(1)
  })

  it("counts the work inside one sprint", async () => {
    sprint("SP1", { accountId: IDS.victimAccount })
    story("ST1", { sprintId: "SP1" })
    story("ST2", { sprintId: "SP1" })
    story("ST3", { sprintId: "SP1", status: "done" })
    story("ELSEWHERE", {})

    const body = await counts(IDS.staffUser, "sprints", "SP1")
    expect(body["stories-sprint"]).toBe(3)
  })

  // R18, and the reason the whole door has no single gate. The shared fixture's
  // role holds `help`, `work` and `todos` and has never held `meetings` — so
  // this is the law working on a role somebody built for other reasons, not on
  // one arranged to prove it.
  it("hands back null — never zero — for a module the role cannot read (R18)", async () => {
    const body = await counts(IDS.staffUser, "accounts", IDS.victimAccount)
    expect(body["meetings-account"]).toBeNull()
    // …and the distinction is the whole point: a collection this role CAN read
    // and that genuinely holds nothing comes back 0, in the same object.
    expect(body["sprints-account"]).toBe(0)
    expect(body["meetings-account"]).not.toBe(0)
  })

  it("stops counting a collection the moment the right is taken away", async () => {
    story("ST1", { appId: IDS.victimApp })
    expect((await counts(IDS.staffUser, "apps", IDS.victimApp))["stories-app"]).toBe(1)
    db()
      .prepare(`UPDATE role_permissions SET can_read = 0 WHERE role_id = ? AND module = 'work'`)
      .run(IDS.adminRole)
    const after = await counts(IDS.staffUser, "apps", IDS.victimApp)
    expect(after["stories-app"]).toBeNull()
    // …and the tickets figure beside it, on a module they still hold, survives —
    // a per-collection gate rather than one right standing in for five.
    expect(after["tickets-app"]).toBe(0)
  })

  // The registry is the contract between three surfaces (this door, the screen,
  // the live layer). A line with no counter behind it would answer `null` and
  // read exactly like a missing permission, which is the failure this door was
  // built to end — so every line this worker owes is proved to produce a NUMBER
  // for a caller who holds every right, derived from the registry itself.
  it("answers every collection the registry says this worker owes", async () => {
    // EVERY record kind the registry knows, never a hand-written four. The list
    // used to be `{ accounts, apps, help, sprints }` typed out here, so when a
    // story, a task and a meeting gained a Time badge the loop simply did not
    // reach them — a coverage test whose coverage is a literal proves whatever it
    // was last edited to prove.
    const owed = COUNTED_RECORD_TABLES.flatMap((table) =>
      childrenFor(table, "content").map((c) => [table, c.key] as const)
    )
    expect(owed.length, "the registry scan found nothing — it has gone blind").toBeGreaterThan(5)
    // Every module in the registry, granted, so nothing comes back null for a
    // reason other than a missing counter.
    db()
      .prepare(
        `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
         VALUES ('R_MEET', ?, 'meetings', 1, 1, 1, 1)`
      )
      .run(IDS.adminRole)
    const ids: Record<string, string> = {
      accounts: IDS.victimAccount,
      apps: IDS.victimApp,
      help: IDS.victimTicket,
      sprints: "SP_NONE",
    }
    for (const [table, key] of owed) {
      // A record kind with no seeded row still answers a NUMBER — zero is the
      // honest count of a story nobody has logged time against, and it is `null`
      // that would mean the counter is missing.
      const body = await counts(IDS.staffUser, table, ids[table] ?? `${table.toUpperCase()}_NONE`)
      expect(typeof body[key], `${table}.${key} has no counter behind it`).toBe("number")
    }
  })

  // …and the other direction, for the one family whose lines are DERIVED. The
  // counters are built from `WORK_LOG_TARGETS`, so a fifth thing time can be
  // logged against would grow a counter here and no registry line — a badge the
  // door could answer and no screen ever asks for, which looks exactly like a
  // record that has no time on it.
  it("badges every record time can be logged against", () => {
    for (const table of Object.keys(WORK_LOG_TARGETS))
      expect(
        childrenFor(table, "content").map((c) => c.key),
        `time can be logged against ${table}, so its record must badge ${recordTimeCountKey(table)}`
      ).toContain(recordTimeCountKey(table))
  })
})
