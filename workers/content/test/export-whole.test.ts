// AN EXPORT IS ONE WHOLE DOCUMENT, OR IT IS AN ERROR — the brand library's half
// of the rule the accounts door already kept, proved against a real SQLite
// database through the shipped route.
//
// The columns lead with the import format (name, category, description, fileUrl)
// so an exported file goes straight back in through the CSV importer. That is
// what makes a silent truncation worse than a refusal: a short file re-imported
// is a library that quietly lost its tail, and nothing in either direction says
// so.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
import { EXPORT_HARD_CAP } from "@shared/workers/limits"
import { buildSpineDb, IDS, makeEnv } from "../../tenancy/test/spine-harness"

const db = () => holder.db as DatabaseSync

const call = (route: string) => {
  const [method, path] = route.split(" ")
  return worker.fetch(
    new Request(`https://content${path}`, { method, headers: { Cookie: "session=x" } }),
    makeEnv(() => db(), IDS.staffUser)
  )
}

/** N assets, straight in — the caps are the shipped ones and they are large. */
function seedAssets(n: number) {
  const rows: string[] = []
  for (let i = 0; i < n; i++)
    rows.push(
      `INSERT INTO brand_assets (id, name, created_at, creator_id)
       VALUES ('B_${i}', 'Asset ${i}', '2026-01-01', '${IDS.staffUser}');`
    )
  db().exec(rows.join("\n"))
}

beforeEach(() => {
  holder.db = buildSpineDb()
  // The shared fixture's Admin role covers the customer spine; `brand_assets` is
  // agency material and is granted here rather than widening a fixture every
  // other suite depends on.
  db().exec(
    `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
     VALUES ('P_ADMIN_BRD', '${IDS.adminRole}', 'brand_assets', 1, 1, 1, 1);`
  )
})

describe("the brand-library export refuses rather than truncating", () => {
  it("under the ceiling it is the whole library", async () => {
    seedAssets(3)
    const res = await call("GET /api/content/brand-assets/export")
    expect(res.status).toBe(200)
    const csv = await res.text()
    expect(csv).toContain("Asset 0")
    expect(csv).toContain("Asset 2")
  })

  it("at the ceiling EXACTLY it is still a file — the +1 read must not cry wolf", async () => {
    seedAssets(EXPORT_HARD_CAP)
    const res = await call("GET /api/content/brand-assets/export")
    expect(res.status).toBe(200)
  })

  it("one past it, a 413 that names the assets and says what to do", async () => {
    seedAssets(EXPORT_HARD_CAP + 1)
    const res = await call("GET /api/content/brand-assets/export")
    expect(res.status).toBe(413)
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe("export_too_large")
    expect(body.message).toContain("brand assets")
    expect(body.message.toLowerCase()).toContain("archive")
  })
})
