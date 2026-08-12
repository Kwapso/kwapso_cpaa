// Staff-profile routes — a member's profile and the certificates they hold.
//
// TWO THINGS ARE DIFFERENT HERE from the other three internal modules, and both
// are about the same fact: these rows are about a PERSON.
//
//   • THE PROFILE IS ONE DOOR, not a create and an edit. A person either has a
//     profile or they don't, and the screen filling in the form has no way of
//     knowing which — two doors would push that question onto the caller, and
//     the answer they would both use is a read-then-decide, which is a race
//     between two open tabs. So it is an upsert, gated once on `edit`: writing
//     down what a colleague is like is the same act whether or not a row already
//     existed, and a permission that depends on invisible state is one nobody
//     can reason about. `create` gates the CERTIFICATE door instead, where a new
//     record really is a new record.
//   • THERE IS NO PROFILE EXPORT. A credential register is the kind of thing
//     somebody hands an auditor; a one-click spreadsheet of what the team is bad
//     at is a capability nobody asked for.
//
// R21 on every door, both halves. This is the sharpest case of agency-only
// material in the app: a client login reading a colleague's weaknesses.

import { refusePortalCaller } from "@shared/workers/account-scope"
import { fail, json } from "@shared/workers/http"
import { csvResponse, exportTooLarge, toCsv } from "@shared/workers/csv"
import { EXPORT_HARD_CAP } from "@shared/workers/limits"
import { queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { publishChange } from "@shared/workers/realtime"
import { mediaKey, parseUploadDataUrl } from "@shared/workers/image"
import { gated, gatedBody } from "@shared/workers/route"
import {
  countStaffCertificates,
  countStaffProfiles,
  createStaffCertificate,
  listStaffCertificates,
  listStaffCertificatesForExport,
  listStaffProfiles,
  saveStaffProfile,
  setStaffCertificateActive,
  setStaffProfileActive,
  updateStaffCertificate,
  type StaffCertificateInput,
  type StaffProfileInput,
} from "../lib/staff"
import type { Env } from "../env"

/* -------------------------------- profiles -------------------------------- */

export async function getStaffProfiles(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "staff_profiles", "read")
  await refusePortalCaller(cfg, guard)
  const profiles = await listStaffProfiles(cfg, guard)
  // ?userId= → one person's, which is how a member's own page reads it.
  const userId = queryText(new URL(request.url).searchParams.get("userId"), "Member")
  // R16: the exact server total rides every list response.
  return json({
    profiles: userId ? profiles.filter((p) => p.userId === userId) : profiles,
    total: await countStaffProfiles(cfg, guard),
  })
}

/** Write a person's profile — one door for "there wasn't one" and "there was".
 * Gated `staff_profiles:edit`: writing down what a colleague is like is the same
 * act either way, and a permission that depends on invisible state is one nobody
 * can reason about. */
export async function postSaveStaffProfile(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<StaffProfileInput>(request, env, "staff_profiles", "edit")
  await refusePortalCaller(cfg, guard)
  requireText(body.userId, "Member", TEXT_LIMITS.short)
  const { id, created } = await saveStaffProfile(cfg, guard, actor, body)
  await publishChange(env, guard.teamId, "staff_profiles", id, created ? "add" : "edit")
  return json({ profiles: await listStaffProfiles(cfg, guard), total: await countStaffProfiles(cfg, guard) })
}

/** Take a profile down, or put it back — never deleted. Gated
 * staff_profiles:delete. */
export async function postSetStaffProfileActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown; active?: unknown }>(
    request, env, "staff_profiles", "delete"
  )
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Profile", TEXT_LIMITS.short)
  if (typeof body.active !== "boolean") return fail(400, "invalid_input", "id and active are required.")
  // R17: a no-op repeat moves zero rows → no ping, no duplicate history.
  const changed = await setStaffProfileActive(cfg, guard, actor, id, body.active)
  if (changed) await publishChange(env, guard.teamId, "staff_profiles", id)
  return json({ profiles: await listStaffProfiles(cfg, guard), total: await countStaffProfiles(cfg, guard) })
}

/** Upload a profile photo or a certificate PDF as a base64 data URL. Gated
 * staff_profiles:edit — the same right that writes the row the URL lands on.
 * HOUSEKEEPING: it writes a file, not a record, so there is nothing to broadcast. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
export async function postUploadStaffFile(request: Request, env: Env): Promise<Response> {
  const { cfg, guard, body } = await gatedBody<{ dataUrl?: unknown }>(request, env, "staff_profiles", "edit")
  await refusePortalCaller(cfg, guard)
  const parsed = parseUploadDataUrl(body.dataUrl, MAX_UPLOAD_BYTES)
  if (!parsed) return fail(400, "invalid_input", "That file isn't a supported upload (max 25 MB).")
  // The key IS the credential (the gateway serves /media/* with no session), so
  // it carries a random ULID segment under the team's own prefix.
  const key = mediaKey(guard.teamId)
  await env.INTERNAL_MEDIA.put(key, parsed.bytes, { httpMetadata: { contentType: parsed.contentType } })
  return json({ url: `/media/internal/${key}?v=${Date.now()}`, contentType: parsed.contentType })
}

/* ------------------------------ certificates ------------------------------ */

export async function getStaffCertificates(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "staff_profiles", "read")
  await refusePortalCaller(cfg, guard)
  // ?userId= narrows at the DOOR rather than in the client: a member's page
  // shows one person's certificates, and filtering a capped list after the fact
  // would disagree with the count beside it (R16).
  const userId = queryText(new URL(request.url).searchParams.get("userId"), "Member")
  return json({
    certificates: await listStaffCertificates(cfg, guard, userId),
    total: await countStaffCertificates(cfg, guard, userId),
  })
}

export async function getStaffCertificatesExport(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "staff_profiles", "read")
  await refusePortalCaller(cfg, guard)
  const { rows, complete } = await listStaffCertificatesForExport(cfg, guard)
  if (!complete)
    return exportTooLarge(EXPORT_HARD_CAP, "certificates", "Archive the ones that have lapsed, then export again.")
  const csv = toCsv(
    ["userId", "title", "issuer", "issuedOn", "expiresOn", "fileUrl", "active", "created_at", "created_by", "updated_at", "updated_by"],
    rows.map((c) => [
      c.user_id, c.title, c.issuer, c.issued_on, c.expires_on, c.file_url,
      c.deactivated_at == null, c.created_at, c.creator_name, c.updated_at, c.editor_name,
    ])
  )
  return csvResponse("certificates.csv", csv)
}

export async function postCreateStaffCertificate(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<StaffCertificateInput>(
    request, env, "staff_profiles", "create"
  )
  await refusePortalCaller(cfg, guard)
  requireText(body.userId, "Member", TEXT_LIMITS.short)
  requireText(body.title, "Title", TEXT_LIMITS.short)
  const id = await createStaffCertificate(cfg, guard, actor, body)
  await publishChange(env, guard.teamId, "staff_certificates", id, "add")
  return json({
    certificates: await listStaffCertificates(cfg, guard),
    total: await countStaffCertificates(cfg, guard),
  })
}

export async function postUpdateStaffCertificate(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<StaffCertificateInput & { id?: string }>(
    request, env, "staff_profiles", "edit"
  )
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Certificate", TEXT_LIMITS.short)
  requireText(body.title, "Title", TEXT_LIMITS.short)
  await updateStaffCertificate(cfg, guard, actor, id, body)
  await publishChange(env, guard.teamId, "staff_certificates", id)
  return json({
    certificates: await listStaffCertificates(cfg, guard),
    total: await countStaffCertificates(cfg, guard),
  })
}

/** Archive / restore a certificate — never deleted. Gated staff_profiles:delete. */
export async function postSetStaffCertificateActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown; active?: unknown }>(
    request, env, "staff_profiles", "delete"
  )
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Certificate", TEXT_LIMITS.short)
  if (typeof body.active !== "boolean") return fail(400, "invalid_input", "id and active are required.")
  // R17: a no-op repeat moves zero rows → no ping, no duplicate history.
  const changed = await setStaffCertificateActive(cfg, guard, actor, id, body.active)
  if (changed) await publishChange(env, guard.teamId, "staff_certificates", id)
  return json({
    certificates: await listStaffCertificates(cfg, guard),
    total: await countStaffCertificates(cfg, guard),
  })
}
