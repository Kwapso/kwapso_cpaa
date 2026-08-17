// Maintenance routes (x-admin-key only): the team-schema migration robot, the
// on-demand DB size check, and the module mover. The sharding machinery lives
// in lib/sharding; these just guard + drive it.

import { fail, json } from "@shared/workers/http"
import { d1Query } from "@shared/workers/d1-rest"
import { checkDatabaseSizes, daysUntilFull, moveModuleToOwnDatabase } from "../lib/sharding"
import { applyMigration, createTeam, d1Config } from "../lib/teams"
import { CRON_GROWTH_CAP } from "@shared/workers/limits"
import { requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { adminGuard } from "../context"
import { TEAM_MIGRATIONS } from "../team-schema"
import type { Env } from "../env"

/**
 * The migration robot (locked: per-team databases need a once-built rollout
 * machine). Applies any not-yet-applied team-schema migration to every ready
 * team database. Protected by the ADMIN_KEY secret.
 */
export async function migrateTeams(request: Request, env: Env): Promise<Response> {
  const denied = adminGuard(request, env)
  if (denied) return denied

  const cfg = d1Config(env)
  const teams = await env.DB.prepare(
    "SELECT id, database_id, schema_version FROM teams WHERE db_status = 'ready' AND deactivated_at IS NULL"
  ).all<{ id: string; database_id: string; schema_version: string }>()

  const latest = TEAM_MIGRATIONS[TEAM_MIGRATIONS.length - 1].version
  let migrated = 0
  for (const team of teams.results ?? []) {
    const applied = await d1Query<{ version: string }>(
      cfg,
      team.database_id,
      "SELECT version FROM _migrations"
    )
    const done = new Set(applied.map((r) => r.version))
    const missing = TEAM_MIGRATIONS.filter((m) => !done.has(m.version))
    if (missing.length === 0) continue

    for (const m of missing) await applyMigration(cfg, team.database_id, m)
    await env.DB.prepare(
      "UPDATE teams SET schema_version = ?, updated_at = ? WHERE id = ?"
    )
      .bind(latest, new Date().toISOString(), team.id)
      .run()
    migrated++
  }
  return json({ ok: true, teamsChecked: teams.results?.length ?? 0, teamsMigrated: migrated })
}

/** On-demand version of the nightly size check — the alarms, AND the trend.
 *
 * The alarm list answers "which databases are nearly full". `filling` answers the
 * question that follows it and used to have no answer anywhere: how long have I
 * got. 80% of a cap is a position, not a warning — see `recordGrowth`. */
export async function dbSizes(request: Request, env: Env): Promise<Response> {
  const denied = adminGuard(request, env)
  if (denied) return denied

  const result = await checkDatabaseSizes(env, d1Config(env))
  const open = await env.DB.prepare(
    "SELECT database_name, size_bytes, created_at FROM db_alerts WHERE resolved_at IS NULL"
  ).all()
  // Bounded (R14), and by the thing that makes a row worth reading: the fastest
  // fillers first, so the answer is a shortlist rather than the whole estate.
  // CRON_GROWTH_CAP is what the nightly tick writes, so the read can never ask for
  // more rows than exist.
  const growth = await env.DB.prepare(
    `SELECT database_name, size_bytes, at, prev_size_bytes, prev_at FROM db_growth
      ORDER BY size_bytes DESC LIMIT ${CRON_GROWTH_CAP}`
  ).all<{
    database_name: string
    size_bytes: number
    at: string
    prev_size_bytes: number | null
    prev_at: string | null
  }>()
  const filling = (growth.results ?? [])
    .map((r) => ({
      name: r.database_name,
      sizeBytes: r.size_bytes,
      // null = not answerable yet (one reading, or it is not growing). Reported as
      // null rather than as a very large number, which would read as a measurement.
      daysUntilFull: daysUntilFull(r),
    }))
    // The soonest first — the shortlist's whole purpose. Un-answerable rows go last
    // rather than being dropped: "we have no trend for this one yet" is information.
    .sort((a, b) => (a.daysUntilFull ?? Infinity) - (b.daysUntilFull ?? Infinity))
  return json({ ...result, openAlerts: open.results ?? [], filling })
}

/** The mover: POST { teamId, module, tables: [...] } with x-admin-key. */
export async function moveModule(request: Request, env: Env): Promise<Response> {
  const denied = adminGuard(request, env)
  if (denied) return denied

  const body = (await request.json().catch(() => ({}))) as {
    teamId?: string
    module?: string
    tables?: string[]
  }
  const teamId = requireText(body.teamId, "Team", TEXT_LIMITS.short)
  const module = requireText(body.module, "Module", TEXT_LIMITS.short)
  if (!Array.isArray(body.tables) || !body.tables.length)
    return fail(400, "invalid_input", "teamId, module and tables are required.")
  const tables = body.tables
  // Table/module names are interpolated into DDL/DML downstream (the script API
  // has no identifier params) — so they must be STRICT SQL identifiers here at
  // the boundary. Kills injection even for an admin-key holder (defense-in-depth).
  const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/
  if (!IDENT.test(module) || tables.some((t) => typeof t !== "string" || !IDENT.test(t)))
    return fail(400, "invalid_input", "module and tables must be plain SQL identifiers (letters, digits, underscores).")

  // BOUNDED PER CALL, RESUMABLE ACROSS CALLS (lib/sharding.ts). `done: false` is
  // not a failure and not a partial success — it means the call spent its budget
  // and the move's progress is recorded, so POST the same body again to continue.
  // A big move is several calls; each one is safe to repeat.
  const result = await moveModuleToOwnDatabase(env, d1Config(env), teamId, module, tables)
  return json({
    ok: true,
    ...result,
    next: result.done
      ? null
      : "Not finished. Call this door again with the same body to continue. Nothing is wrong.",
  })
}

/**
 * Seed a team on an environment where nobody can create one (shared/product.ts).
 *
 * This is NOT the user-facing door reopened under another name: it takes the
 * deployment's ADMIN_KEY, which no user, agent or access token ever holds, and
 * it names the owner explicitly rather than inferring them from a session — you
 * cannot reach it by being signed in. It exists for two jobs: standing up a
 * fresh environment, and giving the smoke suite the SECOND team it needs before
 * "a token is pinned to one team" can be proved at all.
 */
export async function adminCreateTeam(request: Request, env: Env): Promise<Response> {
  const denied = adminGuard(request, env)
  if (denied) return denied

  const body = (await request.json().catch(() => ({}))) as { name?: unknown; email?: unknown }
  const name = requireText(body.name, "Team name", TEXT_LIMITS.short)
  const email = requireText(body.email, "Owner email", TEXT_LIMITS.short)

  const owner = await env.DB.prepare(
    "SELECT id, email, first_name, last_name FROM users WHERE email = ? AND deactivated_at IS NULL"
  )
    .bind(email.toLowerCase())
    .first<{ id: string; email: string; first_name: string | null; last_name: string | null }>()
  if (!owner) return fail(404, "no_user", "No account with that email has signed in here yet.")

  const team = await createTeam(
    env,
    {
      id: owner.id,
      email: owner.email,
      name: [owner.first_name, owner.last_name].filter(Boolean).join(" ") || owner.email,
    },
    name,
    null
  )
  return json({ ok: true, team })
}
