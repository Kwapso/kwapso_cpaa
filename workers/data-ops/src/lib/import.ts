// The import CATALOGUE (which tables this team may import into, in the global core DB)
// and the one gated write every importer shares. The staged engine that used to sit here
// — session → upload → mapping → preview → confirm, one table at a time — is gone: the
// agentic batch engine (lib/import-batch.ts) replaced it on every surface, and its five
// doors had no caller left at all. What survives is what BOTH the batch engine and the
// picker still need:
//   • the catalogue — self-healing on read (R13), so a fresh environment can import;
//   • writeRow — one mapped row written through the target's own GATED create endpoint,
//     act-as-user (the caller's cookie is forwarded), so every imported row respects the
//     caller's permissions and the module's validation exactly like a typed-in one.

import { ulid } from "@shared/workers/id"
import { type Actor } from "@shared/workers/gating"
import type { Env } from "../env"
import type { ImportColumn } from "@shared/types"
import { TARGETS, type TargetDef } from "./targets"

export type CatalogTarget = {
  id: string
  tableKey: string
  displayName: string
  description: string | null
  requiredColumns: ImportColumn[]
}

/* ------------------------------ the catalog (core DB) ------------------------------ */

/** R13: SHIPPING THE CODE SHIPS THE CAPABILITY. A TargetDef only becomes a
 * target the picker OFFERS once a ROW exists in the core catalogue table — and
 * rows are data, which no deploy carries. That let staging import modules that
 * production, running byte-identical code, could not, and nothing said so. So
 * the catalogue RECONCILES itself against the code on READ: INSERT-only
 * (ON CONFLICT DO NOTHING) — a target an owner deliberately switched OFF (its
 * row exists, is_active=0) stays off; only a target with NO row at all gets one.
 * The owner seed door remains for refreshing labels; it is no longer a step
 * anyone must remember. */
export async function reconcileCatalog(env: Env): Promise<void> {
  const now = new Date().toISOString()
  for (const t of Object.values(TARGETS)) {
    await env.DB.prepare(
      `INSERT INTO importable_databases (id, table_key, display_name, description, required_columns_json, is_active, created_at, creator_id, creator_email, creator_name)
       VALUES (?, ?, ?, ?, ?, 1, ?, 'system', 'system', 'System')
       ON CONFLICT(table_key) DO NOTHING`
    )
      .bind(ulid(), t.tableKey, t.displayName, t.description, JSON.stringify(t.columns), now)
      .run()
  }
}

/** The active, code-supported import targets (catalog rows whose table_key has a
 * TargetDef and is active). Read from the global core DB, self-healed first (R13). */
export async function getActiveCatalog(env: Env): Promise<CatalogTarget[]> {
  await reconcileCatalog(env)
  // NO is_active pre-filter in SQL (R13): filter in memory, or "switched off"
  // and "never existed" look identical and the reconcile can't tell them apart.
  const { results } = await env.DB.prepare(
    "SELECT id, table_key, display_name, description, required_columns_json, is_active FROM importable_databases"
  ).all<{
    id: string
    table_key: string
    display_name: string
    description: string | null
    required_columns_json: string | null
    is_active: number
  }>()
  return (results ?? [])
    .filter((r) => r.is_active === 1 && TARGETS[r.table_key])
    .map((r) => ({
      id: r.id,
      tableKey: r.table_key,
      displayName: r.display_name,
      description: r.description,
      requiredColumns: TARGETS[r.table_key].columns,
    }))
}

/** Owner-only: upsert the default catalog rows — a LABEL refresh (display name /
 * description / schema), idempotent, never duplicating. R13: it deliberately
 * does NOT touch is_active on conflict — a re-seed used to silently REACTIVATE a
 * target the owner had switched off. Existence now self-heals on read
 * (reconcileCatalog), so running this is never a step anyone must remember. */
export async function seedDefaultCatalog(
  env: Env,
  actor: Actor,
  defaults: { tableKey: string; displayName: string; description: string; columns: ImportColumn[] }[]
): Promise<number> {
  const now = new Date().toISOString()
  for (const d of defaults) {
    const cols = JSON.stringify(d.columns)
    await env.DB.prepare(
      `INSERT INTO importable_databases (id, table_key, display_name, description, required_columns_json, is_active, created_at, creator_id, creator_email, creator_name)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
       ON CONFLICT(table_key) DO UPDATE SET
         display_name = excluded.display_name,
         description = excluded.description,
         required_columns_json = excluded.required_columns_json,
         updated_at = ?, editor_id = ?, editor_email = ?, editor_name = ?`
    )
      .bind(
        ulid(), d.tableKey, d.displayName, d.description, cols, now, actor.id, actor.email, actor.name,
        now, actor.id, actor.email, actor.name
      )
      .run()
  }
  return defaults.length
}

/** Write one mapped row through the target's gated create endpoint, AS the caller
 * (the original request's cookie is forwarded — the create endpoint re-checks the
 * caller's permission + validates the row). Shared with the batch engine. */
export async function writeRow(
  env: Env,
  request: Request,
  target: TargetDef,
  body: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const fetcher = target.endpoint.binding === "CONTENT" ? env.CONTENT : env.TENANCY
  const res = await fetcher.fetch(`https://internal${target.endpoint.path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: request.headers.get("Cookie") ?? "" },
    body: JSON.stringify(body),
  })
  if (res.ok) return { ok: true }
  let error = `Couldn't add a row (HTTP ${res.status}).`
  try {
    const j = (await res.json()) as { message?: string }
    if (j?.message) error = j.message
  } catch {
    /* keep the default */
  }
  return { ok: false, error }
}
