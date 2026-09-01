// POST /api/tenancy/activity/note — the write half of the generic (table, id)
// activity read (activity-scope.test.ts owns that half). Driven through the
// SHIPPED worker (`worker.fetch`), the real team-schema migrations and the
// real gate, exactly as help-fence.test.ts drives the ticket doors: a source
// scan can prove a gate is PRESENT, never that it actually refuses the caller
// it should.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
import { buildSpineDb, IDS, makeEnv, req } from "./spine-harness"

const db = () => holder.db as DatabaseSync

/** Every live ping the worker published, captured instead of broadcast — so a
 * successful note can be proved to publish the SAME resource+id every other
 * edit on that record already does (the reason the record's activity feed
 * refreshes with no new listener code, R15). */
let published: { resource?: string; id?: string; op?: string; scope?: string }[] = []

function env(userId: string) {
  const base = makeEnv(() => db(), userId) as unknown as Record<string, unknown>
  return {
    ...base,
    REALTIME: {
      fetch: async (_url: string, init?: { body?: string }) => {
        const body = JSON.parse((init as { body?: string })?.body ?? "{}") as {
          event?: Record<string, string>
        }
        if (body.event) published.push(body.event)
        return new Response("{}")
      },
    },
  } as never
}

/** A caller signed in as nobody the auth stub recognises — the "not signed in"
 * shape, for the door's identity check rather than its permission check. */
function signedOutEnv() {
  const base = makeEnv(() => db(), IDS.staffUser) as unknown as Record<string, unknown>
  return { ...base, AUTH: { fetch: async () => new Response(null, { status: 401 }) } } as never
}

// Filtered to `type = 'Note added'` — the spine harness seeds a real
// "Account edited" row against this same (table, id) (spine-harness.ts's
// ACT_V1), on purpose, so a leak suite has real history to steal. A bare
// (table, id) query would count that fixture row as a note.
const activityRows = (table: string = "accounts", id: string = IDS.victimAccount) =>
  db()
    .prepare(
      "SELECT type, description, related_table, related_row_id, creator_id FROM activity WHERE related_table = ? AND related_row_id = ? AND type = 'Note added' ORDER BY created_at DESC"
    )
    .all(table, id) as {
    type: string
    description: string
    related_table: string
    related_row_id: string
    creator_id: string
  }[]

beforeEach(() => {
  holder.db = buildSpineDb()
  published = []
  // A reader-only role: `accounts:read` but NOT `accounts:create`, so a real
  // door written against `create` refuses it — the wrong-role half of R10, not
  // just "some role exists and it happens to hold everything" the way the
  // admin/burglar fixtures do.
  db().exec(`
    INSERT INTO member_roles (id, title, is_default, created_at) VALUES ('R_READER', 'Reader', 0, '2026-01-01');
    INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
      VALUES ('R_READER_accounts', 'R_READER', 'accounts', 1, 0, 0, 0);
    INSERT INTO users (id, email, first_name, current_team_id) VALUES ('U_READER', 'reader@kwapso.app', 'Reader', '${IDS.team}');
    INSERT INTO team_members (id, team_id, user_id, role_id, created_at) VALUES ('m_reader', '${IDS.team}', 'U_READER', 'R_READER', '2026-01-01');
  `)
})

describe("POST /api/tenancy/activity/note", () => {
  it("a staff member with the module's create right adds a note, which lands in that record's own history", async () => {
    const res = await worker.fetch(
      req("POST /api/tenancy/activity/note", {
        table: "accounts",
        id: IDS.victimAccount,
        note: "Called Marta, she'll confirm the new billing contact by Friday.",
      }),
      env(IDS.staffUser)
    )
    expect(res.status).toBe(200)
    const rows = activityRows()
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe("Note added")
    expect(rows[0].description).toContain("Called Marta, she'll confirm the new billing contact by Friday.")
    expect(rows[0].description).toContain("Staff") // the actor's name rides the sentence, same as every other entry
    expect(rows[0].creator_id).toBe(IDS.staffUser)
  })

  it("publishes the SAME resource+id every real edit on that record already does (R15/R1)", async () => {
    await worker.fetch(
      req("POST /api/tenancy/activity/note", { table: "accounts", id: IDS.victimAccount, note: "Following up next week." }),
      env(IDS.staffUser)
    )
    expect(published).toHaveLength(1)
    expect(published[0]).toMatchObject({ resource: "accounts", id: IDS.victimAccount })
  })

  it("refuses an unauthenticated caller (R10's identity half)", async () => {
    const res = await worker.fetch(
      req("POST /api/tenancy/activity/note", { table: "accounts", id: IDS.victimAccount, note: "x" }),
      signedOutEnv()
    )
    expect(res.status).toBe(401)
    expect(activityRows()).toHaveLength(0)
  })

  it("refuses a role that holds read but not create on the target module", async () => {
    const res = await worker.fetch(
      req("POST /api/tenancy/activity/note", { table: "accounts", id: IDS.victimAccount, note: "Sneaking one in." }),
      env("U_READER")
    )
    expect(res.status).toBe(403)
    expect(activityRows()).toHaveLength(0)
    expect(published).toHaveLength(0)
  })

  // ch27.8: "the portal never shows internal notes" is a BLANKET rule, so this
  // caller is refused even though their (client) role holds accounts:create —
  // the spine harness grants the Client role every right on purpose, so a
  // refusal proved with it held is a refusal proved by the DOOR, not the role.
  it("refuses a portal caller outright, even one whose role would otherwise pass", async () => {
    const res = await worker.fetch(
      req("POST /api/tenancy/activity/note", { table: "accounts", id: IDS.victimAccount, note: "Client sneaks a note in." }),
      env(IDS.victimUser)
    )
    expect(res.status).toBe(403)
    expect(activityRows()).toHaveLength(0)
    expect(published).toHaveLength(0)
  })

  it("refuses an empty note (R20)", async () => {
    const res = await worker.fetch(
      req("POST /api/tenancy/activity/note", { table: "accounts", id: IDS.victimAccount, note: "   " }),
      env(IDS.staffUser)
    )
    expect(res.status).toBe(400)
    expect(activityRows()).toHaveLength(0)
  })

  it("refuses an oversized note (R20 — the TEXT_LIMITS.long ceiling replies use)", async () => {
    const res = await worker.fetch(
      req("POST /api/tenancy/activity/note", {
        table: "accounts",
        id: IDS.victimAccount,
        note: "x".repeat(20_001),
      }),
      env(IDS.staffUser)
    )
    expect(res.status).toBe(400)
    expect(activityRows()).toHaveLength(0)
  })

  it("refuses an unknown table rather than writing a row nothing can ever read back", async () => {
    const res = await worker.fetch(
      req("POST /api/tenancy/activity/note", { table: "invoices", id: "anything", note: "hello" }),
      env(IDS.staffUser)
    )
    expect(res.status).toBe(400)
  })

  it("refuses `table: \"__proto__\"` rather than resolving an inherited member as a module", async () => {
    const res = await worker.fetch(
      req("POST /api/tenancy/activity/note", { table: "__proto__", id: "anything", note: "hello" }),
      env(IDS.staffUser)
    )
    expect(res.status).toBe(400)
  })
})
