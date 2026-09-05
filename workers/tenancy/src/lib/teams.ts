// Team lifecycle: the factory that gives every new team its OWN database
// (locked architecture), seeded with default roles + dropdown values.

import type { ActiveContext, ReceivedInvite, TeamMeta, TeamSummary } from "@shared/types"
import { recordWorkerError } from "@shared/workers/error-log"
import { logActivity } from "@shared/workers/activity"
import {
  d1CreateDatabase,
  d1DeleteDatabase,
  d1ExecScript,
  d1Query,
  sqlString,
  type D1Rest,
} from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import {
  dataUrlBytes,
  MAX_IMAGE_BYTES,
  mediaKey,
  ownedMediaKey,
  parseDataUrl,
  reclaimMedia,
} from "@shared/workers/image"
import { publishChange, publishUserChange } from "@shared/workers/realtime"
import { d1ConfigFrom } from "@shared/workers/gating"
import type { Env } from "../env"
import { GuardError } from "./permissions"
import { buildTeamSeed, TEAM_MIGRATIONS, type Actor } from "../team-schema"
import { INVITE_SWEEP_CAP, LIST_HARD_CAP } from "@shared/workers/limits"

export function d1Config(env: Env): D1Rest {
  return d1ConfigFrom(env)
}

/** Apply ONE migration to a team database and stamp it in _migrations. */
export async function applyMigration(
  cfg: D1Rest,
  databaseId: string,
  m: { version: string; sql: string }
): Promise<void> {
  await d1ExecScript(
    cfg,
    databaseId,
    `${m.sql}\nINSERT INTO _migrations (version, applied_at) VALUES ('${m.version}', '${new Date().toISOString()}');`
  )
}

/** Apply every team-schema migration a fresh database needs. */
async function applyTeamSchema(
  cfg: D1Rest,
  databaseId: string
): Promise<string> {
  for (const m of TEAM_MIGRATIONS) await applyMigration(cfg, databaseId, m)
  return TEAM_MIGRATIONS[TEAM_MIGRATIONS.length - 1].version
}

/**
 * Stamp the per-team invite_logs audit row as accepted (M4). The global
 * invite_index is the routing truth; this is the team-DB audit copy, so it's
 * BEST-EFFORT — a missing cloud key or team-DB hiccup must never block a join.
 * `inviteRowId` is invite_index.invite_row_id (= the invite_logs row id).
 */
async function stampInviteAccepted(
  env: Env,
  teamId: string,
  inviteRowId: string | null,
  acceptedAt: string
): Promise<void> {
  if (!inviteRowId) return
  try {
    const cfg = d1Config(env)
    const row = await env.DB.prepare("SELECT database_id FROM teams WHERE id = ?")
      .bind(teamId)
      .first<{ database_id: string | null }>()
    if (!row?.database_id) return
    await d1ExecScript(
      cfg,
      row.database_id,
      `UPDATE invite_logs SET invite_accepted = 1, invite_acceptance_timestamp = ${sqlString(acceptedAt)} WHERE id = ${sqlString(inviteRowId)};`
    )
  } catch (e) {
    // "AUDIT ONLY" IS NOT "NOBODY NEEDS TO KNOW". The membership started; the
    // team's own invite record still says it did not. That is a row somebody
    // will read one day and believe, so the disagreement gets written down
    // rather than living in a console tail for a day.
    console.error("invite_logs accept stamp failed (audit only):", e)
    await recordWorkerError(
      env.DB,
      "tenancy",
      `invites/accept-stamp (team ${teamId})`,
      new Error(
        `the invite was accepted and the membership exists, but invite_logs row ${inviteRowId} was NOT stamped accepted, so the team's invite history under-reports it: ${e instanceof Error ? e.message : String(e)}`
      ),
      undefined,
      { teamId }
    )
  }
}

/** THE MEMBERSHIP STARTING is team history, and for a year it was the one step
 * of the invite story the feed never told: "Invite sent" and "Invite revoked"
 * both logged, and the moment between them — the person actually joining —
 * wrote nothing. Best-effort like the stamp above (joining must never fail on
 * its own history line), and in the ACCEPTER's name, because they are the one
 * who acted. */
async function logMemberJoined(env: Env, teamId: string, actor: Actor): Promise<void> {
  try {
    const row = await env.DB.prepare("SELECT database_id FROM teams WHERE id = ?")
      .bind(teamId)
      .first<{ database_id: string | null }>()
    if (!row?.database_id) return
    await logActivity(d1Config(env), row.database_id, actor, {
      type: "Member joined",
      description: `${actor.name} accepted their invitation and joined the team`,
      // "users", like every member entry in lib/members.ts — R18 resolves this
      // table to the team_members gate, so a client login cannot read it.
      relatedTable: "users",
      relatedRowId: actor.id,
    })
  } catch (e) {
    // Same reasoning as the stamp above, and the same R18 stake: the feed is the
    // only place "when did this person join" is answerable.
    console.error("member-joined activity failed (audit only):", e)
    await recordWorkerError(
      env.DB,
      "tenancy",
      `invites/member-joined (team ${teamId})`,
      new Error(
        `${actor.name || actor.id} joined the team and the "Member joined" activity row was NOT written, so the feed has a hole where the join is: ${e instanceof Error ? e.message : String(e)}`
      ),
      undefined,
      { teamId, userId: actor.id }
    )
  }
}

/**
 * Create a personal team for a fresh user: global team row → its own D1
 * database → schema → seeds (Admin/Viewer + dropdown defaults) → membership
 * (Admin) → mark ready + make it the user's current team.
 */
export async function createTeam(
  env: Env,
  actor: Actor,
  name: string,
  logoUrl: string | null
): Promise<{ teamId: string }> {
  const cfg = d1Config(env)
  const teamId = ulid()
  const now = new Date().toISOString()

  await env.DB.prepare(
    `INSERT INTO teams (id, name, logo_url, db_status, created_at, creator_id, creator_email, creator_name)
     VALUES (?, ?, ?, 'creating', ?, ?, ?, ?)`
  )
    .bind(teamId, name, logoUrl, now, actor.id, actor.email, actor.name)
    .run()

  let databaseId: string | null = null
  try {
    databaseId = await d1CreateDatabase(cfg, `team-${teamId.toLowerCase()}`)
    const schemaVersion = await applyTeamSchema(cfg, databaseId)

    const seed = buildTeamSeed(actor, now)
    await d1ExecScript(cfg, databaseId, seed.script)

    await logActivity(cfg, databaseId, actor, {
      type: "Team created",
      description: `${actor.name} created the team`,
      relatedTable: "teams",
      relatedRowId: teamId,
    })

    await env.DB.prepare(
      `INSERT INTO team_members (id, team_id, user_id, role_id, created_at, creator_id, creator_email, creator_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(ulid(), teamId, actor.id, seed.adminRoleId, now, actor.id, actor.email, actor.name)
      .run()

    await env.DB.prepare(
      "UPDATE teams SET database_id = ?, db_status = 'ready', schema_version = ?, updated_at = ? WHERE id = ?"
    )
      .bind(databaseId, schemaVersion, now, teamId)
      .run()

    await env.DB.prepare("UPDATE users SET current_team_id = ?, updated_at = ? WHERE id = ?")
      .bind(teamId, now, actor.id)
      .run()

    // Cross-team live event: the creator's OTHER devices should see the new team
    // appear in their switcher without a refetch. Rides the per-user channel
    // (the team channel doesn't exist for them yet). The client reacts in B.
    await publishUserChange(env, actor.id, "teams", teamId, "add")

    return { teamId }
  } catch (e) {
    // Leave a clear 'failed' trail AND clean up the half-created database so
    // nothing orphaned lingers in the account; a retry starts fresh.
    await env.DB.prepare(
      "UPDATE teams SET db_status = 'failed', updated_at = ? WHERE id = ?"
    )
      .bind(new Date().toISOString(), teamId)
      .run()
    if (databaseId) {
      await d1DeleteDatabase(cfg, databaseId).catch((cleanupErr) =>
        console.error("orphan DB cleanup failed:", cleanupErr)
      )
    }
    throw e
  }
}

/** Edit a team's name + optional logo (the global teams row). A new logo (data
 * URL) lands in R2 and is served by the gateway at /media/teams/<id>/<random> —
 * a capability URL (no session on that door), so the key carries a random tail.
 * Caller checks teams:edit. */
export async function updateTeamDetails(
  env: Env,
  teamId: string,
  name: string,
  logoDataUrl?: string,
  /** THE AGENCY'S OWN DETAILS (db/core/0025). All four optional and each one
   * PATCHED rather than replaced: `undefined` means "the caller said nothing
   * about this", which is what lets the team-edit dialog save a rename without
   * erasing an address it never showed. A caller that means "clear it" sends an
   * empty string, which lands as null. */
  legal?: {
    legalName?: string | null
    legalAddress?: string | null
    legalNumbers?: string | null
    phone?: string | null
  }
): Promise<void> {
  const clean = name.trim()
  if (!clean) throw new GuardError(400, "invalid_input", "A team needs a name.")

  let logoUrl: string | undefined // undefined = leave the existing logo as-is
  // The key the row points at NOW, read BEFORE anything moves — a new logo mints
  // a new key, so after the write nothing else can name the old object. Proved to
  // belong to THIS team from the caller's own teamId (ownedMediaKey), never from
  // a string a caller handed us.
  let supersededKey: string | null = null
  if (logoDataUrl) {
    // SIZE FIRST, off the ENCODED text, exactly as the profile photo does
    // (auth/src/lib/profile.ts) and for the same two reasons. Nothing is decoded
    // to find out how big it is; and the person is told WHICH refusal it is.
    //
    // The order used to be the other way round, and the size branch below was
    // therefore unreachable: `parseDataUrl` returns null for an oversize payload
    // as well as an unreadable one (shared/workers/image.ts), so a 3 MB team logo
    // came back "That image format isn't supported" and sent somebody off to
    // convert a perfectly good PNG. A dead branch and a wrong sentence are the
    // same defect seen from two sides.
    if (dataUrlBytes(logoDataUrl) > MAX_IMAGE_BYTES)
      throw new GuardError(400, "image_too_large", "That image is too large.")
    const parsed = parseDataUrl(logoDataUrl)
    if (!parsed) throw new GuardError(400, "bad_image", "That image format isn't supported.")
    const current = await env.DB.prepare("SELECT logo_url FROM teams WHERE id = ?")
      .bind(teamId)
      .first<{ logo_url: string | null }>()
    supersededKey = ownedMediaKey(current?.logo_url, "/media/", "teams", teamId)
    // Unguessable by construction — the logo is served with no session, so the
    // key is the credential (mediaKey; see the gateway's /media/* door).
    const key = mediaKey("teams", teamId)
    await env.MEDIA.put(key, parsed.bytes, { httpMetadata: { contentType: parsed.contentType } })
    logoUrl = `/media/${key}?v=${Date.now()}`
  }

  const now = new Date().toISOString()
  // COALESCE(?, column) is the patch: a bound null leaves the column alone, and
  // an empty string clears it. Written as SQL rather than as four branches
  // because sixteen combinations of "was it sent?" is how one of these fields
  // eventually gets wiped by a form that was not asking about it.
  const legalSet = `legal_name = COALESCE(?, legal_name),
                    legal_address = COALESCE(?, legal_address),
                    legal_numbers = COALESCE(?, legal_numbers),
                    phone = COALESCE(?, phone)`
  const legalParams = [
    legal?.legalName ?? null,
    legal?.legalAddress ?? null,
    legal?.legalNumbers ?? null,
    legal?.phone ?? null,
  ]
  if (logoUrl !== undefined) {
    await env.DB.prepare(
      `UPDATE teams SET name = ?, logo_url = ?, ${legalSet}, updated_at = ? WHERE id = ?`
    )
      .bind(clean, logoUrl, ...legalParams, now, teamId)
      .run()
  } else {
    await env.DB.prepare(`UPDATE teams SET name = ?, ${legalSet}, updated_at = ? WHERE id = ?`)
      .bind(clean, ...legalParams, now, teamId)
      .run()
  }

  // THE ROW HAS MOVED — now reclaim the logo it no longer points at (one leaked
  // object per logo change, before this). After the write and fail-soft: see
  // reclaimMedia for why that order is the safe one.
  await reclaimMedia(env.MEDIA, [supersededKey], {
    db: env.DB,
    source: "tenancy",
    place: "POST /api/tenancy/teams/update, logo reclaim",
  })
}

/**
 * Accept every active invite waiting for this email (locked flow: invited
 * users join automatically at onboarding — and get NO personal team).
 * NOTE: the per-team invite_logs rows get their acceptance stamps when the
 * invites module lands; the global index is the source of routing truth here.
 */
export async function acceptPendingInvites(
  env: Env,
  actor: Actor
): Promise<number> {
  const now = new Date().toISOString()
  // BOUNDED SWEEP: this list is keyed on an EMAIL ADDRESS, and anyone may invite
  // any address — so its length is attacker-influenced, and each row costs three
  // core-DB writes plus two live pings. Uncapped, one sign-in could be made to do
  // tens of thousands of writes. INVITE_SWEEP_CAP bounds the pass; anything past
  // it stays pending and is accepted from the Invitations inbox (oldest first, so
  // the sweep never starves the earliest invitations).
  const pending = await env.DB.prepare(
    `SELECT i.id, i.team_id, i.role_id, i.invite_row_id FROM invite_index i
     JOIN teams t ON t.id = i.team_id AND t.deactivated_at IS NULL
     WHERE i.email = ? AND i.status = 'pending' AND i.expires_at > ?
     ORDER BY i.created_at ASC LIMIT ${INVITE_SWEEP_CAP}`
  )
    .bind(actor.email, now)
    .all<{ id: string; team_id: string; role_id: string; invite_row_id: string }>()

  const sweeping = pending.results ?? []
  const invites: typeof sweeping = []
  for (const invite of sweeping) {
    // CLAIM IT FIRST, atomically — the same gate acceptInvite opens with, and for
    // the same two reasons. The SELECT above filtered on 'pending', but a SELECT
    // is not a write: two sweeps racing (a double-submitted onboarding) would each
    // join and each write history, and an invite REVOKED inside the window would
    // still be flipped to 'accepted' and still grant membership. Zero rows moved
    // here means this invite is no longer ours to accept, so nothing follows it.
    const claim = await env.DB.prepare(
      "UPDATE invite_index SET status = 'accepted' WHERE id = ? AND status = 'pending'"
    )
      .bind(invite.id)
      .run()
    if (!claim.meta?.changes) continue

    // UPSERT (not INSERT OR IGNORE): a previously-removed member's row is only
    // soft-deactivated (ARCHITECTURE §4), so reactivate + apply the invited role
    // — otherwise re-joining via a fresh signup would silently no-op.
    await env.DB.prepare(
      `INSERT INTO team_members (id, team_id, user_id, role_id, created_at, creator_id, creator_email, creator_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(team_id, user_id) DO UPDATE SET
         deactivated_at = NULL, role_id = excluded.role_id, updated_at = excluded.created_at`
    )
      .bind(ulid(), invite.team_id, actor.id, invite.role_id, now, actor.id, actor.email, actor.name)
      .run()
    await stampInviteAccepted(env, invite.team_id, invite.invite_row_id, now)
    // The history line rides the SWEEP too. This is the COMMON join path —
    // under TEAM_CREATION_CLOSED every new person arrives through here — and
    // the round-two review found only the explicit accept door writing it.
    await logMemberJoined(env, invite.team_id, actor)
    invites.push(invite)
  }

  if (invites.length > 0) {
    await env.DB.prepare(
      "UPDATE users SET current_team_id = ?, updated_at = ? WHERE id = ?"
    )
      .bind(invites[0].team_id, now, actor.id)
      .run()

    // Ping each affected team's live channel so members/invites screens that are
    // open update instantly (best-effort; publishChange swallows errors). Row-
    // level: the new member is this user (actor.id); each invite flips to
    // 'accepted' in place (carry its own id).
    for (const invite of invites) {
      await publishChange(env, invite.team_id, "invites", invite.id, "edit")
    }
    const affected = [...new Set(invites.map((i) => i.team_id))]
    for (const teamId of affected) {
      await publishChange(env, teamId, "members", actor.id, "add")
    }
    // Cross-team: the joiner's other devices pick up the newly-joined team(s).
    await publishUserChange(env, actor.id, "teams", affected[0], "add")
  }
  return invites.length
}

/**
 * Invitations this email has RECEIVED and not yet acted on — powers the
 * Invitations inbox so a missed/failed email is still recoverable in-app. Only
 * pending, unexpired invites to a still-live team; newest first. One global
 * query (no team database opened) so it's cheap for any signed-in user.
 */
export async function listReceivedInvites(
  env: Env,
  email: string
): Promise<ReceivedInvite[]> {
  const now = new Date().toISOString()
  const rows = await env.DB.prepare(
    `SELECT i.id, i.team_id, i.role_id, i.created_at, i.expires_at,
            t.name AS team_name, t.logo_url AS team_logo
     FROM invite_index i
     JOIN teams t ON t.id = i.team_id AND t.deactivated_at IS NULL AND t.db_status = 'ready'
     WHERE i.email = ? AND i.status = 'pending' AND i.expires_at > ?
     ORDER BY i.created_at DESC LIMIT ${LIST_HARD_CAP}` // R14 hard cap
  )
    .bind(email, now)
    .all<{
      id: string
      team_id: string
      role_id: string
      created_at: string
      expires_at: string
      team_name: string
      team_logo: string | null
    }>()

  return (rows.results ?? []).map((r) => ({
    id: r.id,
    teamId: r.team_id,
    teamName: r.team_name,
    teamLogoUrl: r.team_logo,
    roleId: r.role_id,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  }))
}

/**
 * Accept ONE invite the caller received — the path for an ALREADY-onboarded user
 * (the onboarding sweep above only runs for teamless users). Validates the
 * invite is theirs (email match), still pending, unexpired, and the team is
 * live; joins them (idempotent INSERT OR IGNORE, backed by the team_members
 * UNIQUE) and — per the locked "join + switch" choice — makes it their active
 * team. Returns the joined team's id, or null if the invite isn't valid for this
 * caller. Race-safe: the status flip is conditional on 'pending' (CONCURRENCY.md
 * rule 1) and the membership insert is idempotent, so a double-tap can't
 * double-join.
 */
export async function acceptInvite(
  env: Env,
  actor: Actor,
  inviteId: string
): Promise<string | null> {
  const now = new Date().toISOString()
  // Validate the invite is theirs (email), still pending, unexpired, to a live
  // team — and grab its team + role for the join.
  const invite = await env.DB.prepare(
    `SELECT i.id, i.team_id, i.role_id, i.invite_row_id FROM invite_index i
     JOIN teams t ON t.id = i.team_id AND t.deactivated_at IS NULL AND t.db_status = 'ready'
     WHERE i.id = ? AND i.email = ? AND i.status = 'pending' AND i.expires_at > ?`
  )
    .bind(inviteId, actor.email, now)
    .first<{ id: string; team_id: string; role_id: string; invite_row_id: string }>()
  if (!invite) return null

  // CLAIM IT FIRST, atomically: only the request that flips pending→accepted may
  // proceed. This is the race gate (CONCURRENCY.md rule 1) — a double-tap, or a
  // revoke landing in the window, makes this UPDATE change 0 rows, so we bail
  // BEFORE joining. (A revoked invite can therefore never grant membership.)
  const claim = await env.DB.prepare(
    "UPDATE invite_index SET status = 'accepted' WHERE id = ? AND status = 'pending'"
  )
    .bind(inviteId)
    .run()
  if (!claim.meta?.changes) return null

  // Join — UPSERT, not INSERT OR IGNORE: removal soft-deactivates the row
  // (ARCHITECTURE §4, deactivate-not-delete), so a previously-removed member
  // still occupies the UNIQUE(team_id,user_id) slot. Reactivate + apply the
  // invited role so a re-invite truly rejoins them (idempotent on a fresh join).
  await env.DB.prepare(
    `INSERT INTO team_members (id, team_id, user_id, role_id, created_at, creator_id, creator_email, creator_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(team_id, user_id) DO UPDATE SET
       deactivated_at = NULL, role_id = excluded.role_id, updated_at = excluded.created_at`
  )
    .bind(ulid(), invite.team_id, actor.id, invite.role_id, now, actor.id, actor.email, actor.name)
    .run()

  // Join + switch (locked): make the newly-joined team the active one.
  await env.DB.prepare("UPDATE users SET current_team_id = ?, updated_at = ? WHERE id = ?")
    .bind(invite.team_id, now, actor.id)
    .run()

  await stampInviteAccepted(env, invite.team_id, invite.invite_row_id, now)
  await logMemberJoined(env, invite.team_id, actor)

  // Row-level: the joiner becomes a member (added) and the invite flips to
  // 'accepted' in place — carry both ids so open lists patch just those rows.
  await publishChange(env, invite.team_id, "members", actor.id, "add")
  await publishChange(env, invite.team_id, "invites", inviteId, "edit")
  // Cross-team: the joiner's OTHER devices add the new team to their switcher.
  await publishUserChange(env, actor.id, "teams", invite.team_id, "add")
  return invite.team_id
}

/**
 * The signed-in person's current working context: which team they're in, the
 * role they hold there (title read from that team's OWN database), the member
 * count, and the full list for the switcher. Self-heals a stale/empty current
 * team by falling back to the first team they belong to.
 */
export async function getActiveContext(
  env: Env,
  cfg: D1Rest,
  userId: string
): Promise<ActiveContext> {
  const teams = await listMyTeams(env, userId)
  if (teams.length === 0)
    return { team: null, role: null, memberCount: 0, teams: [] }

  const stored = await env.DB.prepare(
    "SELECT current_team_id FROM users WHERE id = ?"
  )
    .bind(userId)
    .first<{ current_team_id: string | null }>()

  let current = teams.find((t) => t.id === stored?.current_team_id) ?? teams[0]
  if (current.id !== stored?.current_team_id) {
    await env.DB.prepare(
      "UPDATE users SET current_team_id = ?, updated_at = ? WHERE id = ?"
    )
      .bind(current.id, new Date().toISOString(), userId)
      .run()
  }

  // The team's database id and its live member count are two INDEPENDENT core-DB
  // reads (both keyed only on current.id, neither consumes the other) — run them
  // as one round-trip. The role read below depends on dbRow.database_id, so it
  // stays after.
  const [dbRow, countRow] = await Promise.all([
    env.DB.prepare("SELECT database_id FROM teams WHERE id = ?")
      .bind(current.id)
      .first<{ database_id: string }>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS n FROM team_members WHERE team_id = ? AND deactivated_at IS NULL"
    )
      .bind(current.id)
      .first<{ n: number }>(),
  ])

  let role: ActiveContext["role"] = null
  if (dbRow?.database_id) {
    const roleRows = await d1Query<{ id: string; title: string }>(
      cfg,
      dbRow.database_id,
      "SELECT id, title FROM member_roles WHERE id = ?",
      [current.roleId]
    )
    if (roleRows[0]) role = { id: roleRows[0].id, title: roleRows[0].title }
  }

  return { team: current, role, memberCount: countRow?.n ?? 0, teams }
}

/** Switch the active team (locked: one team session at a time). Validates the
 * person is an active member of the target before flipping their pointer. */
export async function switchTeam(
  env: Env,
  userId: string,
  teamId: string
): Promise<boolean> {
  const member = await env.DB.prepare(
    `SELECT 1 FROM team_members tm
     JOIN teams t ON t.id = tm.team_id AND t.deactivated_at IS NULL AND t.db_status = 'ready'
     WHERE tm.team_id = ? AND tm.user_id = ? AND tm.deactivated_at IS NULL`
  )
    .bind(teamId, userId)
    .first()
  if (!member) return false

  await env.DB.prepare(
    "UPDATE users SET current_team_id = ?, updated_at = ? WHERE id = ?"
  )
    .bind(teamId, new Date().toISOString(), userId)
    .run()
  return true
}

/** Every active team this user belongs to (for the team switcher + home). */
export async function listMyTeams(
  env: Env,
  userId: string
): Promise<TeamSummary[]> {
  const rows = await env.DB.prepare(
    // THE FOUR LEGAL FIELDS RIDE THIS READ rather than earning a door of their
    // own. They are four short columns on a row this query already opens, they
    // are read on one screen, and a second endpoint would be a round trip plus a
    // cache key plus a listener for a company's phone number.
    `SELECT t.id, t.name, t.logo_url, t.db_status, tm.role_id,
            t.legal_name, t.legal_address, t.legal_numbers, t.phone
     FROM team_members tm
     JOIN teams t ON t.id = tm.team_id AND t.deactivated_at IS NULL
     WHERE tm.user_id = ? AND tm.deactivated_at IS NULL
     ORDER BY t.created_at LIMIT ${LIST_HARD_CAP}` // R14 hard cap
  )
    .bind(userId)
    .all<{
      id: string
      name: string
      logo_url: string | null
      db_status: string
      role_id: string
      legal_name: string | null
      legal_address: string | null
      legal_numbers: string | null
      phone: string | null
    }>()

  return (rows.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    logoUrl: r.logo_url,
    roleId: r.role_id,
    dbStatus: r.db_status,
    legalName: r.legal_name,
    legalAddress: r.legal_address,
    legalNumbers: r.legal_numbers,
    phone: r.phone,
  }))
}

/** A team's metadata for its Overview tab: who created it + when, last updated.
 * (Reads the global teams row — the source of truth for team identity.) */
export async function getTeamMeta(env: Env, teamId: string): Promise<TeamMeta> {
  const row = await env.DB.prepare(
    "SELECT name, created_at, creator_name, creator_email, updated_at FROM teams WHERE id = ?"
  )
    .bind(teamId)
    .first<{
      name: string
      created_at: string
      creator_name: string | null
      creator_email: string | null
      updated_at: string | null
    }>()
  return {
    name: row?.name ?? "",
    createdAt: row?.created_at ?? "",
    creatorName: row?.creator_name ?? null,
    creatorEmail: row?.creator_email ?? null,
    updatedAt: row?.updated_at ?? null,
  }
}

/** PUT A CLIENT LOGIN ON THE TEAM — the other half of "give access".
 *
 * THE OWNER, 26 Aug 2026: he granted portal access to a contact, watched the
 * Portal access tab say "Can sign in", signed in at the client door, and was
 * told "There's nothing here for you yet. Someone at kwapso needs to switch your
 * access on." Both screens were telling the truth about different things.
 *
 * WHY IT HAPPENED. A client login is, by R21's own words, "an ordinary team
 * member holding an ordinary role" — the portal resolves which team's database
 * to ask from the caller's `current_team_id`, and every door behind it opens
 * with a `MemberGuard`. Granting portal access wrote a `portal_users` row and
 * nothing else, so the person had a fence and no membership: the portal could
 * not name a team, and `session.ts` fell to `no-access`.
 *
 * The seed script did BOTH acts — grant, then invite, then accept — which is why
 * every seeded client works and no real one could. The seed knew; the product
 * did not, and the button says "Switch their login on" as though it were one act.
 * It is one act now.
 *
 * WHY NOT AN INVITE. Because a client cannot accept one. The portal gateway
 * forwards a named allow-list that deliberately excludes `/api/tenancy/invites`
 * and `bootstrap` (R21), so the only way to spend a client's invite is to send
 * them to the AGENCY hostname — a door they may not pass — and let the 403 they
 * receive be the thing that enrols them. That is not a journey anybody would
 * design; it is what the seed's own comment describes as a curiosity.
 *
 * WHAT MAKES IT SAFE. The consent an invite exists to capture is already here in
 * a stronger form: the grant is a gated, confirmed act by a holder of
 * `portal_users:create`, on a person who is already on the account's own books
 * and has already signed in to this platform at least once, holding a role the
 * granter CHOSE. The grant door refuses an existing staff member outright, so
 * this can never quietly demote a colleague.
 *
 * UPSERT, like the accept path, because a removed member's row is deactivated
 * and never deleted: re-granting a login to somebody whose access was taken away
 * must revive them rather than silently do nothing. */
export async function enrolPortalMember(
  env: Env,
  teamId: string,
  userId: string,
  roleId: string,
  actor: Actor
): Promise<void> {
  const now = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO team_members (id, team_id, user_id, role_id, created_at, creator_id, creator_email, creator_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(team_id, user_id) DO UPDATE SET
       deactivated_at = NULL, role_id = excluded.role_id, updated_at = excluded.created_at`
  )
    .bind(ulid(), teamId, userId, roleId, now, actor.id, actor.email, actor.name)
    .run()
  // THEIR POINTER, ONLY IF THEY HAVE NONE. The portal reads `current_team_id` to
  // decide whose database to ask, so a client with no pointer has no portal
  // however valid their login — that is the fault this closes. But moving a
  // pointer that already points somewhere would yank a person out of the team
  // they are standing in, which is a different person's decision.
  await env.DB.prepare(
    "UPDATE users SET current_team_id = ?, updated_at = ? WHERE id = ? AND current_team_id IS NULL"
  )
    .bind(teamId, now, userId)
    .run()
  await publishChange(env, teamId, "members", userId, "add")
  // Cross-team, so the client's own other devices notice they are now somewhere.
  await publishUserChange(env, userId, "teams", teamId, "add")
}
