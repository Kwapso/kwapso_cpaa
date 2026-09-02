// POST /api/tenancy/selectable[/update] — the "mark" field refuses an emoji
// (R20). A live example reached staging: a warning sign saved as the "Issue"
// ticket kind's mark, because the write door validated with bare `optionalText`
// (type-check + length cap) and nothing ever checked for a GLYPH. Driven
// through the SHIPPED worker (`worker.fetch`) and the real gate, exactly as
// activity-note.test.ts drives its own R20 cases — a source scan can prove a
// validator is CALLED, never that it actually refuses the value that reached
// staging.

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

// Named by codepoint rather than pasted as a literal character — the same way
// `optionalMark`'s own comment and UI-RULEBOOK.md name a glyph.
const warningSign = String.fromCodePoint(0x26a0, 0xfe0f) // the exact glyph that reached staging, on "Issue"

beforeEach(() => {
  holder.db = buildSpineDb()
  // The spine harness's R_ADMIN role holds a fixed module list (see
  // spine-harness.ts's `grantAll`) that does not include `selectable_data` —
  // grant it here rather than widen a shared fixture every other suite reads.
  db().exec(`
    INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
    VALUES ('R_ADMIN_selectable_data', '${IDS.adminRole}', 'selectable_data', 1, 1, 1, 1);
  `)
})

// A GROUP THE SEED DOES NOT ALSO SHIP (the same reason selectable-doors.test.ts
// picks its own id): the migrations seed real "Ticket type" values, and one of
// them ("Issue") already carries this exact warning-sign mark from
// `team-schema.ts`'s own seed SQL — the shipped default, not a typo. A fixture
// reusing that name would find the SEEDED row instead of its own and assert
// against data this test did not write.
const GROUP = "Widget kind"

const row = (value: string) =>
  db()
    .prepare("SELECT id, mark FROM selectable_data WHERE type = ? AND value = ?")
    .get(GROUP, value) as { id: string; mark: string | null } | undefined

describe("POST /api/tenancy/selectable — create", () => {
  it("refuses a mark containing an emoji with a 400, and writes nothing", async () => {
    const res = await worker.fetch(
      req("POST /api/tenancy/selectable", { type: GROUP, value: "Alpha widget", mark: warningSign }),
      makeEnv(() => db(), IDS.staffUser)
    )
    expect(res.status).toBe(400)
    expect(row("Alpha widget")).toBeUndefined()
  })

  it("accepts a normal short-text mark", async () => {
    const res = await worker.fetch(
      req("POST /api/tenancy/selectable", { type: GROUP, value: "Alpha widget", mark: "AW" }),
      makeEnv(() => db(), IDS.staffUser)
    )
    expect(res.status).toBe(200)
    expect(row("Alpha widget")?.mark).toBe("AW")
  })

  it("still accepts a value with no mark at all (the field stays optional)", async () => {
    const res = await worker.fetch(
      req("POST /api/tenancy/selectable", { type: GROUP, value: "Beta widget" }),
      makeEnv(() => db(), IDS.staffUser)
    )
    expect(res.status).toBe(200)
    expect(row("Beta widget")?.mark ?? null).toBeNull()
  })
})

describe("POST /api/tenancy/selectable/update", () => {
  it("refuses an emoji on an existing value's mark, and leaves the old mark in place", async () => {
    const create = await worker.fetch(
      req("POST /api/tenancy/selectable", { type: GROUP, value: "Gamma widget", mark: "GW" }),
      makeEnv(() => db(), IDS.staffUser)
    )
    expect(create.status).toBe(200)
    const id = row("Gamma widget")?.id
    expect(id).toBeTruthy()

    const res = await worker.fetch(
      req("POST /api/tenancy/selectable/update", { id, value: "Gamma widget", mark: warningSign }),
      makeEnv(() => db(), IDS.staffUser)
    )
    expect(res.status).toBe(400)
    expect(row("Gamma widget")?.mark).toBe("GW") // unchanged — the bad write never lands
  })
})
