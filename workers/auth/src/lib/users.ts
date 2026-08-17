import type { SessionUser } from "@shared/types"
import type { Env } from "../env"
import { ulid } from "@shared/workers/id"

/** Raw users row as D1 returns it. */
export type UserRow = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  image_url: string | null
  onboarding_completed_at: string | null
  current_team_id: string | null
  /** null until this person picks one; reads as English (shared/i18n.ts). */
  language: string | null
  /** null until this person picks one; reads as comfortable (shared/scale.ts). */
  scale: string | null
  created_at: string
  updated_at: string
  deactivated_at: string | null
}

/** The session row's `team_pin` rides along (as `pinnedTeamId`) because it is the
 * only honest way a downstream worker can tell a MACHINE caller from a person: a
 * pinned session exists solely because the mcp worker bridged a verified token
 * through `/internal/mcp-session`. A browser session never has one, and a browser
 * cannot mint one — which is why this is read off the session rather than taken
 * from a header the caller sets. A row with no pin (a fresh login) reads null. */
export function toSessionUser(row: UserRow & { team_pin?: string | null }): SessionUser {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    imageUrl: row.image_url,
    onboardingComplete: row.onboarding_completed_at !== null,
    currentTeamId: row.current_team_id ?? null,
    pinnedTeamId: row.team_pin ?? null,
    language: row.language ?? null,
    scale: row.scale ?? null,
  }
}

export async function findUserByEmail(
  env: Env,
  email: string
): Promise<UserRow | null> {
  return await env.DB.prepare("SELECT * FROM users WHERE email = ?")
    .bind(email)
    .first<UserRow>()
}

/** Email-code sign-in: the verified email IS the identity.
 *
 * IDEMPOTENT, because this is the front door. Read-then-insert against the
 * `users.email` UNIQUE index is a race: two sign-ins for a brand-new address —
 * a double-submit, a retried request — both read "no such user" and both insert,
 * and the loser got a constraint violation, a 500, and a row in the global
 * `error_logs`, on that person's very first interaction with the product. The
 * uniqueness rule now rides the write (CONCURRENCY.md rule 2): `DO NOTHING`
 * means the loser writes no row, throws nothing, and simply reads back the row
 * the winner made. Whoever arrives second is not new — which is exactly true. */
export async function findOrCreateUserByEmail(
  env: Env,
  email: string
): Promise<{ user: UserRow; isNew: boolean }> {
  const existing = await findUserByEmail(env, email)
  if (existing) return { user: existing, isNew: false }

  const now = new Date().toISOString()
  const user: UserRow = {
    id: ulid(),
    email,
    first_name: null,
    last_name: null,
    image_url: null,
    onboarding_completed_at: null,
    current_team_id: null,
    // Never chosen, both of them. Language reads as English and size reads as
    // comfortable, and each stays distinguishable from somebody who actively
    // picked that answer (0024_user_language.sql, 0026_user_scale.sql).
    scale: null,
    language: null,
    created_at: now,
    updated_at: now,
    deactivated_at: null,
  }
  const inserted = await env.DB.prepare(
    "INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING"
  )
    .bind(user.id, user.email, now, now)
    .run()
  if ((inserted.meta.changes ?? 0) > 0) return { user, isNew: true }

  // Zero rows = someone else created this identity in the window. Their row is
  // the identity; ours never existed.
  const raced = await findUserByEmail(env, email)
  if (raced) return { user: raced, isNew: false }
  // No insert AND no row is not a race — it is a broken write, and sign-in must
  // not hand back a session for a user that isn't there.
  throw new Error(`user row for ${email} neither inserted nor found`)
}


