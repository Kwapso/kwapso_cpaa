// STAFF PROFILES — the person behind the member row, and the certificates they
// hold. Two tables, one module, one audience: the team.
//
// WHY IT IS A MODULE AND NOT A PAGE. Six staff rows in the legacy app carry a
// personality profile — strengths, weaknesses, the people they look up to — and
// the reconciliation's recommendation was to leave them behind as "a team page,
// not a system record". The owner overruled it and asked for real storage, and
// the overrule is right for a reason worth writing down: a profile edited by a
// colleague, with no history and no permission behind it, is a page anybody can
// quietly change about somebody else. Here it is a record — audited, gated,
// retired rather than deleted, with its own line in the activity feed.
//
// WHY IT IS ITS OWN PERMISSION and not four more rights on `team_members`: an
// agency can want everyone to see who their colleagues are without everyone
// being able to change who is on the team. Those are different questions and
// they get different switches.
//
// NEVER A CLIENT'S. There is no portal door on this module, and every handler on
// it refuses a portal caller (R21). A client login reading "what this person is
// bad at" is the clearest possible case of the agency's own material.

import { describeChanges, logActivity, type Actor } from "@shared/workers/activity"
import { d1ExecScript, d1Query, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { GuardError, type MemberGuard } from "@shared/workers/gating"
import { optionalText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { EXPORT_HARD_CAP, LIST_HARD_CAP } from "@shared/workers/limits"
import type { StaffCertificate, StaffProfile } from "@shared/types"
import { optionalDate, safeExternalLink } from "./internal-fields"

/* -------------------------------- profiles -------------------------------- */

type ProfileRow = {
  id: string
  user_id: string
  headline: string | null
  personality_type: string | null
  strengths: string | null
  weaknesses: string | null
  role_models: string | null
  about: string | null
  photo_url: string | null
  deactivated_at: string | null
  created_at: string
  creator_name: string | null
  updated_at: string | null
  editor_name: string | null
}

const PROFILE_COLUMNS = `id, user_id, headline, personality_type, strengths, weaknesses, role_models,
                         about, photo_url, deactivated_at, created_at, creator_name, updated_at, editor_name`

function toProfile(r: ProfileRow): StaffProfile {
  return {
    id: r.id,
    userId: r.user_id,
    headline: r.headline,
    personalityType: r.personality_type,
    strengths: r.strengths,
    weaknesses: r.weaknesses,
    roleModels: r.role_models,
    about: r.about,
    photoUrl: r.photo_url,
    active: r.deactivated_at === null,
    createdAt: r.created_at,
    creatorName: r.creator_name,
    updatedAt: r.updated_at,
    editorName: r.editor_name,
  }
}

/** Every live profile on the team. Bounded by the members themselves (one row
 * each, enforced by a partial unique index), so a cap is the honest shape. */
export async function listStaffProfiles(cfg: D1Rest, guard: MemberGuard): Promise<StaffProfile[]> {
  const rows = await d1Query<ProfileRow>(
    cfg,
    guard.databaseId,
    // R14 hard cap: one row per member, so this is bounded by the team's size.
    `SELECT ${PROFILE_COLUMNS} FROM staff_profiles ORDER BY created_at ASC LIMIT ${LIST_HARD_CAP}`
  )
  return rows.map(toProfile)
}

/** R16: the exact server COUNT(*) the badge shows — never rows.length. */
export async function countStaffProfiles(cfg: D1Rest, guard: MemberGuard): Promise<number> {
  const rows = await d1Query<{ n: number }>(cfg, guard.databaseId, "SELECT COUNT(*) AS n FROM staff_profiles")
  return rows[0]?.n ?? 0
}

export type StaffProfileInput = {
  userId?: string
  headline?: string
  personalityType?: string
  strengths?: string
  weaknesses?: string
  roleModels?: string
  about?: string
  photoUrl?: string
}

/**
 * WRITE A PERSON'S PROFILE — one door for both "there wasn't one" and "there was".
 *
 * A profile is not created and then edited: it either exists for this person or
 * it does not, and the caller filling in a form has no way of knowing which. Two
 * doors would push that question onto the screen and onto the assistant, and the
 * answer they'd both use is a read-then-decide, which is a race between two tabs.
 *
 * So this is an upsert, and the partial unique index on `user_id` is what makes
 * it safe: `ON CONFLICT(user_id)` cannot fire twice, so two simultaneous saves
 * settle into one row rather than into two profiles for one person.
 *
 * Returns whether the row was NEW, so the route knows which live ping to send
 * and the activity row says the true thing.
 */
export async function saveStaffProfile(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  input: StaffProfileInput
): Promise<{ id: string; created: boolean }> {
  const userId = requireText(input.userId, "Member", TEXT_LIMITS.short)
  const v = {
    headline: optionalText(input.headline, "Headline", TEXT_LIMITS.short) ?? null,
    personalityType: optionalText(input.personalityType, "Personality type", TEXT_LIMITS.short) ?? null,
    strengths: optionalText(input.strengths, "Strengths", TEXT_LIMITS.long) ?? null,
    weaknesses: optionalText(input.weaknesses, "Weaknesses", TEXT_LIMITS.long) ?? null,
    roleModels: optionalText(input.roleModels, "Role models", TEXT_LIMITS.long) ?? null,
    about: optionalText(input.about, "About", TEXT_LIMITS.long) ?? null,
    photoUrl: safeExternalLink(optionalText(input.photoUrl, "Photo", TEXT_LIMITS.link)),
  }

  const existing = await d1Query<ProfileRow>(
    cfg,
    guard.databaseId,
    `SELECT ${PROFILE_COLUMNS} FROM staff_profiles WHERE user_id = ? AND deactivated_at IS NULL`,
    [userId]
  )
  const before = existing[0] ?? null
  const id = before?.id ?? ulid()
  const now = new Date().toISOString()

  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO staff_profiles (id, user_id, headline, personality_type, strengths, weaknesses, role_models, about, photo_url, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(userId)}, ${sqlString(v.headline)}, ${sqlString(v.personalityType)}, ${sqlString(v.strengths)}, ${sqlString(v.weaknesses)}, ${sqlString(v.roleModels)}, ${sqlString(v.about)}, ${sqlString(v.photoUrl)}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)})
ON CONFLICT(user_id) WHERE deactivated_at IS NULL DO UPDATE SET
  headline = excluded.headline, personality_type = excluded.personality_type,
  strengths = excluded.strengths, weaknesses = excluded.weaknesses,
  role_models = excluded.role_models, about = excluded.about, photo_url = excluded.photo_url,
  updated_at = ${sqlString(now)}, editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)};`
  )

  const changes = before
    ? describeChanges([
        { label: "Headline", from: before.headline, to: v.headline },
        { label: "Personality type", from: before.personality_type, to: v.personalityType },
        { label: "Strengths", from: before.strengths, to: v.strengths, hideValues: true },
        { label: "Weaknesses", from: before.weaknesses, to: v.weaknesses, hideValues: true },
        { label: "Role models", from: before.role_models, to: v.roleModels },
        { label: "About", from: before.about, to: v.about, hideValues: true },
        { label: "Photo", from: before.photo_url, to: v.photoUrl },
      ])
    : ""
  await logActivity(cfg, guard.databaseId, actor, {
    type: before ? "Staff profile edited" : "Staff profile created",
    // The SUBJECT is named by id rather than by name on purpose: the members
    // themselves live in the core database, and reading a name out of it to
    // decorate a history line would be a cross-database read on every write.
    // The screen that renders the feed already has the member list in hand.
    description: before
      ? `${actor.name} edited a staff profile${changes ? `, ${changes}` : ""}`
      : `${actor.name} wrote a staff profile`,
    relatedTable: "staff_profiles",
    relatedRowId: id,
  })
  return { id, created: !before }
}

/** Retire or restore a profile. R17: the predicate rides the UPDATE.
 *
 * Retiring is how a profile is taken down without losing what it said — a person
 * leaving, or asking for it to come off the board. Restoring is refused by the
 * partial unique index if somebody has written a fresh profile for that person
 * in the meantime, which is the correct answer: two live profiles for one person
 * is the one state this table must never hold. */
export async function setStaffProfileActive(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  active: boolean
): Promise<boolean> {
  const rows = await d1Query<ProfileRow>(
    cfg,
    guard.databaseId,
    `SELECT ${PROFILE_COLUMNS} FROM staff_profiles WHERE id = ?`,
    [id]
  )
  if (!rows[0]) throw new GuardError(404, "staff_profile_not_found", "That profile doesn't exist.")
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    active
      ? `UPDATE staff_profiles SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL, deactivator_name = NULL, updated_at = ? WHERE id = ? AND deactivated_at IS NOT NULL RETURNING id`
      : `UPDATE staff_profiles SET deactivated_at = ?, deactivator_id = ${sqlString(actor.id)}, deactivator_email = ${sqlString(actor.email)}, deactivator_name = ${sqlString(actor.name)}, updated_at = ? WHERE id = ? AND deactivated_at IS NULL RETURNING id`,
    active ? [now, id] : [now, now, id]
  )
  if (!changed[0]) return false
  await logActivity(cfg, guard.databaseId, actor, {
    type: active ? "Staff profile restored" : "Staff profile taken down",
    description: `${actor.name} ${active ? "restored" : "took down"} a staff profile`,
    relatedTable: "staff_profiles",
    relatedRowId: id,
  })
  return true
}

/* ------------------------------ certificates ------------------------------ */

type CertRow = {
  id: string
  user_id: string
  title: string
  issuer: string | null
  issued_on: string | null
  expires_on: string | null
  file_url: string | null
  deactivated_at: string | null
  created_at: string
  creator_name: string | null
  updated_at: string | null
  editor_name: string | null
}

const CERT_COLUMNS = `id, user_id, title, issuer, issued_on, expires_on, file_url,
                      deactivated_at, created_at, creator_name, updated_at, editor_name`

function toCert(r: CertRow): StaffCertificate {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    issuer: r.issuer,
    issuedOn: r.issued_on,
    expiresOn: r.expires_on,
    fileUrl: r.file_url,
    active: r.deactivated_at === null,
    createdAt: r.created_at,
    creatorName: r.creator_name,
    updatedAt: r.updated_at,
    editorName: r.editor_name,
  }
}

/** Every certificate on the team, newest first — optionally just one member's.
 * A member's page reads it narrowed; the module screen reads it whole. */
export async function listStaffCertificates(
  cfg: D1Rest,
  guard: MemberGuard,
  userId?: string | null
): Promise<StaffCertificate[]> {
  const rows = await d1Query<CertRow>(
    cfg,
    guard.databaseId,
    // R14 hard cap: a handful per member, bounded by the team's size.
    `SELECT ${CERT_COLUMNS} FROM staff_certificates
      ${userId ? "WHERE user_id = ?" : ""}
      ORDER BY COALESCE(issued_on, created_at) DESC LIMIT ${LIST_HARD_CAP}`,
    userId ? [userId] : []
  )
  return rows.map(toCert)
}

/** R16: the exact server COUNT(*) the badge shows — never rows.length. */
export async function countStaffCertificates(
  cfg: D1Rest,
  guard: MemberGuard,
  userId?: string | null
): Promise<number> {
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM staff_certificates ${userId ? "WHERE user_id = ?" : ""}`,
    userId ? [userId] : []
  )
  return rows[0]?.n ?? 0
}

async function certOrThrow(cfg: D1Rest, guard: MemberGuard, id: string): Promise<CertRow> {
  const rows = await d1Query<CertRow>(cfg, guard.databaseId, `SELECT ${CERT_COLUMNS} FROM staff_certificates WHERE id = ?`, [id])
  if (!rows[0]) throw new GuardError(404, "staff_certificate_not_found", "That certificate doesn't exist.")
  return rows[0]
}

export type StaffCertificateInput = {
  userId?: string
  title?: string
  issuer?: string
  issuedOn?: string
  expiresOn?: string
  fileUrl?: string
}

/** One validation path for both writes. The two dates go through `optionalDate`,
 * which REFUSES anything that is not a real calendar day — an expiry that half
 * parses is a certificate that silently never lapses. */
function cleanCert(input: StaffCertificateInput) {
  return {
    title: requireText(input.title, "Title", TEXT_LIMITS.short),
    issuer: optionalText(input.issuer, "Issuer", TEXT_LIMITS.short) ?? null,
    issuedOn: optionalDate(input.issuedOn, "Issued on"),
    expiresOn: optionalDate(input.expiresOn, "Expires on"),
    fileUrl: safeExternalLink(optionalText(input.fileUrl, "File", TEXT_LIMITS.link)),
  }
}

export async function createStaffCertificate(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  input: StaffCertificateInput
): Promise<string> {
  const userId = requireText(input.userId, "Member", TEXT_LIMITS.short)
  const v = cleanCert(input)
  const id = ulid()
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO staff_certificates (id, user_id, title, issuer, issued_on, expires_on, file_url, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(userId)}, ${sqlString(v.title)}, ${sqlString(v.issuer)}, ${sqlString(v.issuedOn)}, ${sqlString(v.expiresOn)}, ${sqlString(v.fileUrl)}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Certificate recorded",
    description: `${actor.name} recorded the "${v.title}" certificate`,
    relatedTable: "staff_certificates",
    relatedRowId: id,
  })
  return id
}

export async function updateStaffCertificate(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  input: StaffCertificateInput
): Promise<void> {
  const before = await certOrThrow(cfg, guard, id)
  const v = cleanCert(input)
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `UPDATE staff_certificates SET title = ${sqlString(v.title)}, issuer = ${sqlString(v.issuer)}, issued_on = ${sqlString(v.issuedOn)}, expires_on = ${sqlString(v.expiresOn)}, file_url = ${sqlString(v.fileUrl)}, updated_at = ${sqlString(now)}, editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)} WHERE id = ${sqlString(id)};`
  )
  const changes = describeChanges([
    { label: "Title", from: before.title, to: v.title },
    { label: "Issuer", from: before.issuer, to: v.issuer },
    { label: "Issued on", from: before.issued_on, to: v.issuedOn },
    { label: "Expires on", from: before.expires_on, to: v.expiresOn },
    { label: "File", from: before.file_url, to: v.fileUrl },
  ])
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Certificate edited",
    description: `${actor.name} edited the "${v.title}" certificate${changes ? `, ${changes}` : ""}`,
    relatedTable: "staff_certificates",
    relatedRowId: id,
  })
}

/** Retire or restore a certificate. R17: the predicate rides the UPDATE. */
export async function setStaffCertificateActive(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  active: boolean
): Promise<boolean> {
  const before = await certOrThrow(cfg, guard, id)
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    active
      ? `UPDATE staff_certificates SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL, deactivator_name = NULL, updated_at = ? WHERE id = ? AND deactivated_at IS NOT NULL RETURNING id`
      : `UPDATE staff_certificates SET deactivated_at = ?, deactivator_id = ${sqlString(actor.id)}, deactivator_email = ${sqlString(actor.email)}, deactivator_name = ${sqlString(actor.name)}, updated_at = ? WHERE id = ? AND deactivated_at IS NULL RETURNING id`,
    active ? [now, id] : [now, now, id]
  )
  if (!changed[0]) return false
  await logActivity(cfg, guard.databaseId, actor, {
    type: active ? "Certificate restored" : "Certificate archived",
    description: `${actor.name} ${active ? "restored" : "archived"} the "${before.title}" certificate`,
    relatedTable: "staff_certificates",
    relatedRowId: id,
  })
  return true
}

/** Whole, or an error. Profiles have no export door: a personality profile is
 * about a person, and a one-click spreadsheet of what the team is bad at is a
 * capability nobody asked for. Certificates are a credential register, which is
 * exactly the kind of thing somebody has to hand to an auditor. */
export async function listStaffCertificatesForExport(
  cfg: D1Rest,
  guard: MemberGuard
): Promise<{ rows: CertRow[]; complete: boolean }> {
  const rows = await d1Query<CertRow>(
    cfg,
    guard.databaseId,
    // R14 hard cap (export tier); the +1 answers "was there more?".
    `SELECT ${CERT_COLUMNS} FROM staff_certificates ORDER BY COALESCE(issued_on, created_at) DESC LIMIT ${EXPORT_HARD_CAP + 1}`
  )
  return { rows: rows.slice(0, EXPORT_HARD_CAP), complete: rows.length <= EXPORT_HARD_CAP }
}
