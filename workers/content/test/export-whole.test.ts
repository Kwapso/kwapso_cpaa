// AN EXPORT IS ONE WHOLE DOCUMENT, OR IT IS AN ERROR — the learning library's
// half of the rule the accounts door already kept, proved against a real SQLite
// database through the shipped route.
//
// The columns lead with the import format (title, category, description,
// contentType, contentLink, body) so an exported file goes straight back in
// through the CSV importer. That is what makes a silent truncation worse than a
// refusal: a short file re-imported is a library that quietly lost its tail, and
// nothing in either direction says so.

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

/** N articles, straight in — the caps are the shipped ones and they are large. */
function seedArticles(n: number) {
  const rows: string[] = []
  for (let i = 0; i < n; i++)
    rows.push(
      `INSERT INTO learning (id, content_title, sequence, is_required, created_at, creator_id)
       VALUES ('L_${i}', 'Article ${i}', ${i}, 0, '2026-01-01', '${IDS.staffUser}');`
    )
  db().exec(rows.join("\n"))
}

beforeEach(() => {
  holder.db = buildSpineDb()
  // The shared fixture's Admin role covers the customer spine; `learning` is
  // agency material and is granted here rather than widening a fixture every
  // other suite depends on.
  db().exec(
    `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
     VALUES ('P_ADMIN_LRN', '${IDS.adminRole}', 'learning', 1, 1, 1, 1);`
  )
})

describe("the learning export refuses rather than truncating", () => {
  it("under the ceiling it is the whole library", async () => {
    seedArticles(3)
    const res = await call("GET /api/content/learning/export")
    expect(res.status).toBe(200)
    const csv = await res.text()
    expect(csv).toContain("Article 0")
    expect(csv).toContain("Article 2")
  })

  it("at the ceiling EXACTLY it is still a file — the +1 read must not cry wolf", async () => {
    seedArticles(EXPORT_HARD_CAP)
    const res = await call("GET /api/content/learning/export")
    expect(res.status).toBe(200)
  })

  it("one past it, a 413 that names the articles and says what to do", async () => {
    seedArticles(EXPORT_HARD_CAP + 1)
    const res = await call("GET /api/content/learning/export")
    expect(res.status).toBe(413)
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe("export_too_large")
    expect(body.message).toContain("articles")
    expect(body.message.toLowerCase()).toContain("learning screen")
  })
})
