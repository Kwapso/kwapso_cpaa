// A TABLE SOMEBODY CAN GROW HAS A CEILING AT THE WRITE AND A LIMIT AT THE READ.
//
// R14 bounds every list read, and a bound is only a promise about the ROWS in
// front of it. Two tables here had the promise on neither end:
//
//   • `member_roles`. The create door was uncapped, and two HOT reads pulled the
//     title lookup with no LIMIT at all — the members list and the invitations
//     list, both opened by everyone. So an ordinary `member_roles:create` grant
//     (the one an office manager gets) set the size of somebody else's screen,
//     and of the roles CSV export, which reads roles × modules.
//   • `screens`. The key is a screen key and this worker cannot check it against
//     a list — it treats a recipe as opaque on purpose, because the web app owns
//     the shape. So any string minted a row, each carrying up to 64 KB, and the
//     read behind EVERY page load pulled all of them back unbounded.
//
// Both ends are asserted here: the door refuses at the ceiling, and the read that
// consumes the table carries a LIMIT. Against a real SQLite database, through the
// shipped handlers.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
import { MAX_ROLES_PER_TEAM } from "@shared/workers/limits"
import { getScreenOverrides, setScreenOverride } from "../src/lib/screens-config"
import { buildSpineDb, IDS, makeEnv, req } from "./spine-harness"

const db = () => holder.db as DatabaseSync
const env = () => makeEnv(db, IDS.staffUser)
const cfg = { accountId: "a", apiToken: "t" } as never
const guard = { userId: IDS.staffUser, teamId: IDS.team, roleId: IDS.adminRole, databaseId: "db_team" }
const actor = { id: IDS.staffUser, email: "staff@kwapso.app", name: "Staff" }

beforeEach(() => {
  holder.db = buildSpineDb()
  // `teams:edit` is what the screen-config door gates on; the spine fixture's
  // Admin role covers the customer spine only.
  db().exec(
    `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
     VALUES ('P_ADMIN_TEAMS', '${IDS.adminRole}', 'teams', 1, 1, 1, 1);`
  )
})

/** Fill `member_roles` to exactly `n` rows (the seed already put a couple there). */
function rolesUpTo(n: number) {
  const have = (db().prepare("SELECT COUNT(*) AS n FROM member_roles").get() as { n: number }).n
  const rows: string[] = []
  for (let i = 0; i < n - have; i++)
    rows.push(
      `INSERT INTO member_roles (id, title, is_default, created_at) VALUES ('R_FILL_${i}', 'Fill ${i}', 0, '2026-01-01');`
    )
  if (rows.length) db().exec(rows.join("\n"))
}

describe("role creation has a ceiling", () => {
  it("one below the limit, a role is created", async () => {
    rolesUpTo(MAX_ROLES_PER_TEAM - 1)
    const res = await worker.fetch(req("POST /api/tenancy/roles", { title: "One more" }), env())
    expect(res.status).toBe(200)
  })

  it("at the limit, the door refuses and says what to do", async () => {
    rolesUpTo(MAX_ROLES_PER_TEAM)
    const res = await worker.fetch(req("POST /api/tenancy/roles", { title: "One too many" }), env())
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe("role_limit")
    expect(body.message.toLowerCase()).toContain("deactivate")
    // And it refused BEFORE writing — a cap that counts after the insert is a
    // cap that is always one row late.
    expect((db().prepare("SELECT COUNT(*) AS n FROM member_roles").get() as { n: number }).n).toBe(
      MAX_ROLES_PER_TEAM
    )
  })

  // The reads the ceiling exists to protect. Asserted on the SQL rather than on a
  // row count, because "it happens to be small today" is what these two said for
  // their whole lives — the defect was the missing word, not the current data.
  //
  // EVERY statement, not the first one that matches: the earlier draft of this
  // test found `SELECT id FROM member_roles WHERE is_default = 1 LIMIT 1` and
  // declared the file bounded while the unbounded read sat forty lines below it.
  // A scan that stops at the first hit measures whichever statement happens to be
  // at the top.
  it("and EVERY open read of member_roles carries a LIMIT", () => {
    const files = ["src/lib/members.ts", "src/lib/invites.ts", "src/lib/roles.ts"]
    const offenders: string[] = []
    let seen = 0
    for (const file of files) {
      const src = readFileSync(join(__dirname, "..", file), "utf8")
      // Anchored on the NEAREST preceding SELECT, then forward to the end of the
      // statement's own literal. A lazy regex reaching FORWARD from the first
      // SELECT swallows the statement above and inherits its WHERE — which is how
      // the previous draft of this line called an unbounded read bounded.
      for (const m of src.matchAll(/FROM member_roles/g)) {
        const start = src.lastIndexOf("SELECT", m.index)
        const end = src.slice(m.index).search(/[`"']/)
        const stmt = src.slice(start, m.index + (end === -1 ? 200 : end)).replace(/\s+/g, " ")
        seen++
        // A row-keyed read (WHERE) and an aggregate return one row by
        // construction; everything else is an open read and needs the word.
        if (/\bWHERE\b/i.test(stmt) || /COUNT\(/i.test(stmt)) continue
        if (!/\bLIMIT\b/i.test(stmt)) offenders.push(`${file}: ${stmt.slice(0, 90)}`)
      }
    }
    expect(seen, "no member_roles reads found at all — did these files move?").toBeGreaterThan(3)
    expect(offenders, "an unbounded read of a table the create door feeds").toEqual([])
  })
})

describe("screen overrides have a ceiling too", () => {
  it("an existing key can always be re-saved — an edit is not growth", async () => {
    await setScreenOverride(cfg, guard, actor, "members.list", '{"a":1}')
    await setScreenOverride(cfg, guard, actor, "members.list", '{"a":2}')
    expect((await getScreenOverrides(cfg, guard))["members.list"]).toBe('{"a":2}')
  })

  it("a NEW key past the ceiling is refused — the key space is arbitrary, the table is not", async () => {
    const rows: string[] = []
    for (let i = 0; i < 100; i++)
      rows.push(
        `INSERT INTO screens (module, recipe, created_at) VALUES ('junk.${i}', '{}', '2026-01-01');`
      )
    db().exec(rows.join("\n"))
    await expect(setScreenOverride(cfg, guard, actor, "one.too.many", "{}")).rejects.toMatchObject({
      code: "too_many_screens",
    })
    // …and the one already there still saves, so a full table is not a frozen app.
    await expect(setScreenOverride(cfg, guard, actor, "junk.0", '{"b":1}')).resolves.toBeUndefined()
  })

  it("the read behind every page load is bounded", () => {
    const src = readFileSync(join(__dirname, "..", "src/lib/screens-config.ts"), "utf8")
    const at = src.indexOf("FROM screens")
    expect(at, "screens-config no longer reads the screens table — re-read this test").toBeGreaterThan(-1)
    expect(src.slice(src.lastIndexOf("SELECT", at), src.indexOf("\n", at) + 1)).toMatch(/LIMIT/)
  })
})
