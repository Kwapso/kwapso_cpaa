// AN EXPORT IS ONE WHOLE DOCUMENT, OR IT IS AN ERROR — proved against a real
// SQLite database running the real team migrations, by driving the shipped route
// handlers and reading what actually comes back.
//
// The accounts door already refused past its ceiling. Its three siblings did not:
// they read a capped list and handed it over with nothing to say it was short.
// Every export's columns LEAD WITH THE IMPORT FORMAT, so a truncated file is not
// a smaller answer, it is a re-import that deletes the tail.
//
// The roles export was the one that made that literal. Its permission read is
// roles × modules, and `buildPermissionValue` renders a role with no rows as
// EVERY RIGHT OFF — so a short file did not omit roles, it revoked them. That is
// the assertion this suite exists for, and it is written the only way that can
// prove it: against a real database, at the real ceiling, reading the real CSV.
//
// The caps are the shipped ones, and they are large, so each case seeds past them
// with plain INSERTs rather than through the doors.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
import { EXPORT_HARD_CAP, LIST_HARD_CAP } from "@shared/workers/limits"
import { listAllRolePermissions } from "../src/lib/roles"
import { TEAM_MODULE_CATALOG } from "../src/team-schema"
import { buildSpineDb, IDS, makeEnv, req } from "./spine-harness"

const db = () => holder.db as DatabaseSync
const env = () => makeEnv(db, IDS.staffUser)
const cfg = { accountId: "a", apiToken: "t" } as never
const guard = { userId: IDS.staffUser, teamId: IDS.team, roleId: IDS.adminRole, databaseId: "db_team" }

beforeEach(() => {
  holder.db = buildSpineDb()
  // The shared fixture's Admin role covers the customer spine; these two exports
  // are agency material, so grant their modules here rather than widening a
  // harness every other suite depends on.
  db().exec(
    `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete) VALUES
       ('P_ADMIN_SEL', '${IDS.adminRole}', 'selectable_data', 1, 1, 1, 1),
       ('P_ADMIN_LRN', '${IDS.adminRole}', 'learning', 1, 1, 1, 1);`
  )
})

/** N extra roles, each carrying a FULL permission sheet — the shape a real team
 * has, and the shape that makes the permission read (roles × modules) the first
 * one to hit its ceiling. */
function seedRoles(n: number, withPermissions: boolean) {
  const rows: string[] = []
  for (let i = 0; i < n; i++) {
    const id = `R_BULK_${String(i).padStart(5, "0")}`
    rows.push(
      `INSERT INTO member_roles (id, title, is_default, created_at) VALUES ('${id}', 'Bulk ${i}', 0, '2026-01-01');`
    )
    if (withPermissions)
      for (const m of TEAM_MODULE_CATALOG)
        rows.push(
          `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
           VALUES ('P_${id}_${m.key}', '${id}', '${m.key}', 1, 1, 1, 1);`
        )
  }
  db().exec(rows.join("\n"))
}

/** Grow `role_permissions` until it holds EXACTLY `target` rows, using a FEW
 * roles with WIDE sheets (100 module rows each). That shape is what separates the
 * two ceilings: `module` is free text with only a UNIQUE (role_id, module) on it
 * — which is what lets a fork add modules without touching this table — so the
 * permission read can cross its cap with a role count nowhere near the list's. */
function fillPermissions(target: number) {
  const have = (db().prepare("SELECT COUNT(*) AS n FROM role_permissions").get() as { n: number }).n
  const rows: string[] = []
  let made = 0
  for (let r = 0; made < target - have; r++) {
    const id = `R_WIDE_${String(r).padStart(5, "0")}`
    rows.push(
      `INSERT INTO member_roles (id, title, is_default, created_at) VALUES ('${id}', 'Wide ${r}', 0, '2026-01-01');`
    )
    for (let m = 0; m < 100 && made < target - have; m++, made++)
      rows.push(
        `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
         VALUES ('PW_${r}_${m}', '${id}', 'mod_${m}', 1, 0, 0, 0);`
      )
  }
  db().exec(rows.join("\n"))
}

describe("the roles export refuses rather than revoking", () => {
  it("under the ceiling it is a CSV, and the rights in it are the rights in the database", async () => {
    seedRoles(3, true)
    const res = await worker.fetch(req("GET /api/tenancy/roles/export"), env())
    expect(res.status).toBe(200)
    const csv = await res.text()
    // The seeded roles hold every right; the file must say so. If the permission
    // read had silently returned nothing, every one of these would read "no".
    expect(csv).toContain("Bulk 0")
    expect(csv.split("\r\n").find((l) => l.startsWith("Bulk 0"))).not.toContain(",no,")
  })

  it("past the ROLE ceiling it is a 413 — the export had borrowed the SCREEN's cap", async () => {
    // The reachable truncation today: the export called the list reader, whose
    // cap is LIST_HARD_CAP, and shipped the first thousand as if they were all.
    // No permission rows here, so this case can only be the role count.
    seedRoles(LIST_HARD_CAP + 1, false)
    const res = await worker.fetch(req("GET /api/tenancy/roles/export"), env())
    expect(res.status).toBe(413)
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe("export_too_large")
    // It has to say what to DO — a refusal with no next step is a dead end.
    expect(body.message.toLowerCase()).toContain("retire")
  })

  // THE OTHER CEILING, and why it needs a case of its own. With ten modules
  // shipped, roles × modules only crosses EXPORT_HARD_CAP past a thousand roles —
  // which the role count above already refuses, so the two ceilings sit on top of
  // one another and a test that seeds roles proves nothing about the permission
  // read. They come apart the moment a fork adds an eleventh module (BASE-MANUAL
  // §5), and they come apart today for rows whose role no longer lists. So this
  // half is driven where it actually lives.
  it("the permission read reports its OWN truncation, cap-exactly and one over", async () => {
    // Exactly at the cap: whole. The `+1` read must not mistake a full page for
    // a truncated one, or every large team's export becomes a permanent 413.
    fillPermissions(EXPORT_HARD_CAP)
    expect((await listAllRolePermissions(cfg, guard)).complete).toBe(true)
    db().exec(
      `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
       VALUES ('PW_OVER', 'R_WIDE_00000', 'over_the_cap', 1, 0, 0, 0);`
    )
    expect((await listAllRolePermissions(cfg, guard)).complete).toBe(false)
  })

  it("and the door reads that signal — an incomplete sheet is refused, not shipped", async () => {
    // One row past the permission ceiling, with ~102 roles in a table whose list
    // cap is a thousand. The only thing that can refuse this request is the
    // permission read's own `complete`.
    fillPermissions(EXPORT_HARD_CAP + 1)
    const res = await worker.fetch(req("GET /api/tenancy/roles/export"), env())
    expect(res.status).toBe(413)
    expect(((await res.json()) as { error: string }).error).toBe("export_too_large")
  })
})

describe("the dropdown-value export refuses rather than truncating", () => {
  it("under the ceiling it is a CSV", async () => {
    db().exec(
      `INSERT INTO selectable_data (id, type, value, is_default, created_at) VALUES ('S1', 'File type', 'Image file', 0, '2026-01-01');`
    )
    const res = await worker.fetch(req("GET /api/tenancy/selectable/export"), env())
    expect(res.status).toBe(200)
    expect(await res.text()).toContain("Image file")
  })

  it("past it, a 413 that names the vocabulary", async () => {
    const rows: string[] = []
    for (let i = 0; i <= EXPORT_HARD_CAP; i++)
      rows.push(
        `INSERT INTO selectable_data (id, type, value, is_default, created_at) VALUES ('S_${i}', 'Bulk', 'v${i}', 0, '2026-01-01');`
      )
    db().exec(rows.join("\n"))
    const res = await worker.fetch(req("GET /api/tenancy/selectable/export"), env())
    expect(res.status).toBe(413)
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe("export_too_large")
    expect(body.message).toContain("dropdown values")
  })
})
