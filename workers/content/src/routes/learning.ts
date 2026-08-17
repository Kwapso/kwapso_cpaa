// Learning routes: list the team's how-to items (with the caller's own progress),
// create / edit / (de)activate an item, mark one done for the caller, and the
// curator progress dashboard. Mirrors tenancy's roles routes exactly: open with
// the shared gated opening (teamContext + requireRight on the `learning` module
// + defensive body read), parse + 400 on bad input, then publishChange (row id +
// op) so open lists patch just that row. Locked module rules (pick-or-create
// category, deactivate-not-delete) live in lib/learning.

import { refusePortalCaller } from "@shared/workers/account-scope"
import { fail, json } from "@shared/workers/http"
import { csvResponse, exportTooLarge, toCsv } from "@shared/workers/csv"
import { EXPORT_HARD_CAP, STREAM_UPLOAD_MAX_BYTES } from "@shared/workers/limits"
import { queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { publishChange } from "@shared/workers/realtime"
import { INLINE_SAFE_UPLOAD, mediaKey, parseUploadDataUrl } from "@shared/workers/image"
import { gated, gatedBody } from "@shared/workers/route"
import { requireIdList } from "../lib/bulk"
import {
  bulkSetLearningActive,
  createLearning,
  listLearning,
  listProgress,
  setLearningActive,
  setLearningDone,
  updateLearning,
  listLearningForExport,
  type LearningInput,
  countLearning,
} from "../lib/learning"
import type { Env } from "../env"

export async function getLearning(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "learning", "read")
  await refusePortalCaller(cfg, guard)
  const items = await listLearning(cfg, guard)
  const id = queryText(new URL(request.url).searchParams.get("id"), "Id") // ?id= → one item
  // R16: the exact server total rides every list response (badges never use rows.length).
  return json({ learning: id ? items.filter((l) => l.id === id) : items, total: await countLearning(cfg, guard) })
}

/** GET /api/content/learning/export — the team's articles as a CSV download.
 * The cross-cutting rule: EXPORT NEEDS READ (import needs create). Team-bound by
 * construction — teamContext resolves the caller's own team database and rows come
 * only from there. Columns lead with the import format (title, category,
 * description, contentType, contentLink, body) so an exported file round-trips
 * straight back through the CSV importer; `active` rides along as information. */
export async function getLearningExport(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "learning", "read")
  await refusePortalCaller(cfg, guard)
  const { rows: items, complete } = await listLearningForExport(cfg, guard)
  // Whole, or an error — never a short file that looks like the library.
  if (!complete)
    return exportTooLarge(EXPORT_HARD_CAP, "articles", "Read the Learning screen instead, or retire the articles you no longer publish.")
  const csv = toCsv(
    [
      "title", "category", "description", "contentType", "contentLink", "body",
      "sequence", "required", "active",
      "created_at", "created_by", "updated_at", "updated_by", "deactivated_at", "deactivated_by",
    ],
    items.map((l) => [
      l.content_title, l.category, l.content_description, l.content_type, l.content_link, l.content_body,
      l.sequence, l.is_required === 1, l.deactivated_at == null,
      l.created_at, l.creator_name, l.updated_at, l.editor_name, l.deactivated_at, l.deactivator_name,
    ])
  )
  return csvResponse("learning.csv", csv)
}

export async function postCreateLearning(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<LearningInput>(request, env, "learning", "create")
  // R21 AT THE DOOR, ON THE WRITE HALF TOO. Every READ door on this module already
  // refuses a client login; not one WRITE door did, so the refusal existed on the
  // module and was missing on exactly the half that changes things. It held only
  // because the shipped Client role happens not to carry the right — and R21's own
  // sentence is that the decision belongs at the door, precisely so it does not
  // depend on how carefully a role was built.
  await refusePortalCaller(cfg, guard)
  requireText(body.title, "Title", TEXT_LIMITS.short)
  const id = await createLearning(cfg, guard, actor, body)
  // Row-level: carry the new item's id so open learning lists patch just that row.
  await publishChange(env, guard.teamId, "learning", id, "add")
  return json({ learning: await listLearning(cfg, guard), total: await countLearning(cfg, guard) })
}

export async function postUpdateLearning(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<LearningInput & { id?: string }>(request, env, "learning", "edit")
  // R21 AT THE DOOR, ON THE WRITE HALF TOO. Every READ door on this module already
  // refuses a client login; not one WRITE door did, so the refusal existed on the
  // module and was missing on exactly the half that changes things. It held only
  // because the shipped Client role happens not to carry the right — and R21's own
  // sentence is that the decision belongs at the door, precisely so it does not
  // depend on how carefully a role was built.
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Article", TEXT_LIMITS.short)
  requireText(body.title, "Title", TEXT_LIMITS.short)
  await updateLearning(env, cfg, guard, actor, id, body)
  await publishChange(env, guard.teamId, "learning", id)
  return json({ learning: await listLearning(cfg, guard), total: await countLearning(cfg, guard) })
}

/** Deactivate / reactivate a learning item — never deleted (progress survives).
 * Gated by learning:delete (deactivate is our "delete" in the deactivate model). */
export async function postSetLearningActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown; active?: unknown }>(request, env, "learning", "delete")
  // R21 AT THE DOOR, ON THE WRITE HALF TOO. Every READ door on this module already
  // refuses a client login; not one WRITE door did, so the refusal existed on the
  // module and was missing on exactly the half that changes things. It held only
  // because the shipped Client role happens not to carry the right — and R21's own
  // sentence is that the decision belongs at the door, precisely so it does not
  // depend on how carefully a role was built.
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Article", TEXT_LIMITS.short)
  if (typeof body.active !== "boolean")
    return fail(400, "invalid_input", "id and active are required.")
  // R17: no-op repeat → no ping, no duplicate history (see setLearningActive).
  const changed = await setLearningActive(cfg, guard, actor, id, body.active)
  if (changed) await publishChange(env, guard.teamId, "learning", id)
  return json({ learning: await listLearning(cfg, guard), total: await countLearning(cfg, guard) })
}

/** Deactivate / reactivate MANY learning items in one call (the bulk sibling of
 * the single active endpoint). Gated ONCE by the SAME right (learning:delete),
 * validates ids at the boundary (non-empty array of non-empty strings, cap 500 →
 * clean 400), applies the same per-row change to every matching item, and — the
 * live-sync law — publishes ONE row-level ping per CHANGED row (patch that row,
 * never refetch the list). Returns { updated, skipped }. */
export async function postBulkSetLearningActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ ids?: unknown; active?: unknown }>(request, env, "learning", "delete")
  // R21 AT THE DOOR, ON THE WRITE HALF TOO. Every READ door on this module already
  // refuses a client login; not one WRITE door did, so the refusal existed on the
  // module and was missing on exactly the half that changes things. It held only
  // because the shipped Client role happens not to carry the right — and R21's own
  // sentence is that the decision belongs at the door, precisely so it does not
  // depend on how carefully a role was built.
  await refusePortalCaller(cfg, guard)
  const ids = requireIdList(body.ids)
  if (typeof body.active !== "boolean")
    return fail(400, "invalid_input", "active must be true or false.")
  const { changed, skipped } = await bulkSetLearningActive(cfg, guard, actor, ids, body.active)
  // Row-level live-sync: one ping per changed item (same row shape the single
  // endpoint patches) — no list refetch.
  for (const id of changed) await publishChange(env, guard.teamId, "learning", id)
  return json({ updated: changed.length, skipped })
}

/** Mark an item done / not-done for the caller (their OWN progress — any reader
 * may record their own). Publishes an "edit" on the row so open lists refresh the
 * viewer's done badge. */
export async function postLearningDone(request: Request, env: Env): Promise<Response> {
  const { cfg, guard, body } = await gatedBody<{ id?: unknown; done?: unknown }>(request, env, "learning", "read")
  // The odd one out: its three sibling learning doors refuse a client login and
  // this one did not, because it answers `{ok:true}` and looked like it had
  // nothing to disclose. It marks an INTERNAL article read, on a module a client
  // has no screen for — and it puts their name in the agency's curator
  // dashboard. A door on agency-only material refuses, whatever it returns.
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Article", TEXT_LIMITS.short)
  if (typeof body.done !== "boolean")
    return fail(400, "invalid_input", "id and done are required.")
  await setLearningDone(cfg, guard, id, body.done)
  await publishChange(env, guard.teamId, "learning", id, "edit")
  return json({ ok: true })
}

/** Curator dashboard: every member's done state for the team's items. Gated on
 * learning:read for now (the curator view shares the read right). */
export async function getLearningProgress(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "learning", "read")
  await refusePortalCaller(cfg, guard)
  return json({ progress: await listProgress(cfg, guard) })
}

/** Local file upload for a learning item (images + short clips, cap 25 MB) sent
 * as a base64 data URL — same JSON pattern as the profile-photo / team-logo
 * upload, not multipart. Stores the bytes in the team's learning-media bucket
 * under <teamId>/<random ULID> and hands back the gateway URL the editor pastes into
 * the article. HOUSEKEEPING: it writes a file, NOT a record — there's no row to
 * patch, so nothing to broadcast (the create/edit that references the URL pings
 * its own row). Gated by learning:create. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
export async function postUploadLearningFile(request: Request, env: Env): Promise<Response> {
  const { cfg, guard, body } = await gatedBody<{ dataUrl?: unknown }>(request, env, "learning", "create")
  // R21 AT THE DOOR, ON THE WRITE HALF TOO. Every READ door on this module already
  // refuses a client login; not one WRITE door did, so the refusal existed on the
  // module and was missing on exactly the half that changes things. It held only
  // because the shipped Client role happens not to carry the right — and R21's own
  // sentence is that the decision belongs at the door, precisely so it does not
  // depend on how carefully a role was built.
  await refusePortalCaller(cfg, guard)
  const parsed = parseUploadDataUrl(body.dataUrl, MAX_UPLOAD_BYTES)
  if (!parsed) return fail(400, "invalid_input", "That file isn't a supported upload (max 25 MB).")
  // The key IS the credential — the gateway serves /media/* with no session, so
  // every upload carries a random ULID segment (mediaKey, the one place that's
  // decided). Same shape this door has always used, now through the seam.
  const key = mediaKey(guard.teamId)
  await env.LEARNING_MEDIA.put(key, parsed.bytes, {
    httpMetadata: { contentType: parsed.contentType },
  })
  // ?v= busts caches; the file itself is served immutable by the gateway.
  return json({
    url: `/media/learning/${key}?v=${Date.now()}`,
    contentType: parsed.contentType,
  })
}


/** A learning article's image or clip — STREAMED. The same capability as the door above,
 * with the file arriving AS the request body instead of inside it.
 *
 * WHY A SECOND DOOR RATHER THAN A CHANGED ONE, and why all four upload doors now
 * come in pairs: the upload CONTRACT differs, and a browser holds its own copy of
 * this app for as long as the tab is open. A build shipped before the deploy keeps
 * posting a base64 data URL to the door above, so that one stays exactly as it was
 * until nothing in the wild uses it. An upload contract is the one change where the
 * server has to be ready before the client and outlast it afterwards.
 *
 * WHAT IT FIXES. 25 MB was never a judgement about files — it was the largest
 * number that fits in a 128 MB isolate three times over: `request.json()`
 * materialises the whole body, a base64 data URL is ~4/3 of the file it carries,
 * and the decode makes another copy. Here the body goes to R2 as it arrives, so
 * the isolate holds a window rather than a file (limits.ts:
 * STREAM_UPLOAD_MAX_BYTES, and what stops it THERE is the platform's own
 * request-body limit rather than anything in this code).
 *
 * AND THE ALLOW-LIST STILL DECIDES, which is the one way this door differs from
 * the knowledge base's streamed twin. That one stores every byte as
 * `application/octet-stream`, so it can afford to take any file at all. This one
 * serves the object BACK under the type the caller declared — that is what makes
 * an image render — so a script-capable type (`text/html`, `image/svg+xml`) would
 * be stored XSS on the app's own origin. `INLINE_SAFE_UPLOAD` is the boundary that
 * stops it, imported from `shared/workers/image.ts` rather than restated, because a
 * second copy of that list is one nobody remembers to narrow.
 *
 * There is NO metadata on this door and so no query string to validate: the file
 * is the whole request, the type is a header, and the key is minted here. R21 at
 * the door, on the write half, as the buffered door already does.
 *
 * HOUSEKEEPING: it writes a file, not a record — nothing to broadcast. */
export async function postStreamLearningFile(request: Request, env: Env): Promise<Response> {
  // The envelope BEFORE the gate and before a byte is read, because a cap is only
  // a cap if it is checked before the expensive step.
  const declared = Number(request.headers.get("content-length") ?? 0)
  if (!Number.isFinite(declared) || declared <= 0)
    return fail(411, "length_required", "That upload did not say how big it is, so we did not start it.")
  if (declared > STREAM_UPLOAD_MAX_BYTES)
    return fail(
      413,
      "too_large",
      `That upload is too big — the most we can take in one file is ${Math.round(STREAM_UPLOAD_MAX_BYTES / 1_000_000)} MB. Nothing was saved.`
    )

  const { cfg, guard } = await gated(request, env, "learning", "create")
  await refusePortalCaller(cfg, guard)

  // The DECLARED type, held to the same allow-list the buffered door applies —
  // this object is served back under it, so this is the stored-XSS boundary.
  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim()
  if (!INLINE_SAFE_UPLOAD.test(contentType))
    return fail(400, "invalid_input", "That file isn't a supported upload.")
  if (!request.body) return fail(400, "invalid_input", "That upload had no file in it.")

  // The key IS the credential — the gateway serves /media/* with no session — so it
  // is the team's prefix plus a random ULID and carries NOTHING the caller sent.
  // No path to contain and no escape to filter, which is the strongest form of the
  // rule rather than a filter over a weaker one.
  const key = mediaKey(guard.teamId)
  await env.LEARNING_MEDIA.put(key, request.body, { httpMetadata: { contentType } })
  // ?v= busts caches; the file itself is served immutable by the gateway.
  return json({ url: `/media/learning/${key}?v=${Date.now()}`, contentType })
}
