// Owner-only import-catalog maintenance (x-admin-key, like tenancy's maintenance
// endpoints). The import catalog (importable_databases) is global + owner-maintained;
// seeded to the code-supported targets in DEFAULT_CATALOG (Object.values(TARGETS)):
// today selectable_data (Dropdown values) + member_roles + learning.
// Re-running the seed is idempotent (upsert by table_key), so it's safe at deploy.

import { json } from "@shared/workers/http"
import { optionalText, queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { adminGuard } from "@shared/workers/gating"
import { DEFAULT_CATALOG } from "../lib/targets"
import { seedDefaultCatalog } from "../lib/import"
import type { Env } from "../env"

/** POST /api/data-ops/admin/seed-targets — upsert the default import catalog. */
export async function postSeedTargets(request: Request, env: Env): Promise<Response> {
  const blocked = adminGuard(request, env)
  if (blocked) return blocked
  const actor = { id: "owner", email: "owner", name: "Owner" }
  const count = await seedDefaultCatalog(env, actor, DEFAULT_CATALOG)
  return json({ seeded: count, targets: DEFAULT_CATALOG.map((d) => d.tableKey) })
}

/** GET /api/data-ops/admin/errors?status=open|resolved|all&limit=N — the central
 * error log, newest first (ERROR-HANDLING.md). Owner-only: reading stack traces
 * is a maintainer activity, so it sits behind the maintenance key, not a role. */
export async function getErrors(request: Request, env: Env): Promise<Response> {
  const blocked = adminGuard(request, env)
  if (blocked) return blocked
  const url = new URL(request.url)
  const status = queryText(url.searchParams.get("status"), "Status") ?? "open"
  // R14 — the cap has to survive a hostile number, not just an absent one.
  // `Math.min(Number(x) || 100, 200)` looks bounded and isn't: ?limit=-1 is a
  // finite negative, so it beats the min, and SQLite reads a NEGATIVE LIMIT as
  // NO LIMIT — the ceiling on the one table designed to grow turned off by a
  // minus sign. Clamped from BOTH ends, and truncated, so the value interpolated
  // below is always an integer in [1, 200].
  const limit = Math.min(Math.max(1, Math.trunc(Number(url.searchParams.get("limit")) || 100)), 200)
  const where = status === "all" ? "" : "WHERE status = ?"
  const stmt = env.DB.prepare(
    // `request_id` is what turns eight separate rows back into one failing
    // click (shared/workers/trace.ts). Reading the store without it means the
    // id is written and never seen, which is the same as not having it.
    `SELECT id, at, source, place, message, stack, team_id, user_id, url, request_id, status, resolved_at, resolution_note
     FROM error_logs ${where} ORDER BY at DESC LIMIT ${limit}`
  )
  const rows = await (status === "all" ? stmt : stmt.bind(status)).all()
  return json({ errors: rows.results ?? [] })
}

/** POST /api/data-ops/admin/errors/resolve { id, note } — close an error with the
 * what-went-wrong / how-it-was-fixed note. Idempotent (re-resolving overwrites
 * the note); an unknown id is a clean 404 via updated:0. */
export async function postResolveError(request: Request, env: Env): Promise<Response> {
  const blocked = adminGuard(request, env)
  if (blocked) return blocked
  const b = (await request.json().catch(() => ({}))) as { id?: unknown; note?: unknown }
  const id = requireText(b.id, "Error", TEXT_LIMITS.short)
  // `(b.note ?? "").slice(...)` was a live 500: a NUMBER has no .slice, and an
  // admin key is not a promise the body is well-formed.
  const note = optionalText(b.note, "Note", 2000)
  const res = await env.DB.prepare(
    `UPDATE error_logs SET status = 'resolved', resolved_at = ?, resolution_note = ? WHERE id = ?`
  )
    .bind(new Date().toISOString(), note ?? null, id.slice(0, 40))
    .run()
  return json({ updated: res.meta.changes ?? 0 })
}
