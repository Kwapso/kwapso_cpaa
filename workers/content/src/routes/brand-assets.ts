// Brand-library routes. Same shape as marketing's next door, plus the one thing
// this module has that the others don't: an UPLOAD door, because 74 legacy assets
// are Google-hosted URLs that die with the Glide account and the bytes have to
// land somewhere we own before that happens.
//
// R21 on every door, both halves — the brand library is the agency's own
// material and there is no fenced slice of it to serve a client.

import { refusePortalCaller } from "@shared/workers/account-scope"
import { fail, json } from "@shared/workers/http"
import { csvResponse, exportTooLarge, toCsv } from "@shared/workers/csv"
import { EXPORT_HARD_CAP, STREAM_UPLOAD_MAX_BYTES } from "@shared/workers/limits"
import { queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { publishChange } from "@shared/workers/realtime"
import { INLINE_SAFE_UPLOAD, mediaKey, parseUploadDataUrl } from "@shared/workers/image"
import { gated, gatedBody } from "@shared/workers/route"
import {
  countBrandAssets,
  createBrandAsset,
  listBrandAssets,
  listBrandAssetsForExport,
  setBrandAssetActive,
  updateBrandAsset,
  type BrandAssetInput,
} from "../lib/brand-assets"
import type { Env } from "../env"

export async function getBrandAssets(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "brand_assets", "read")
  await refusePortalCaller(cfg, guard)
  const assets = await listBrandAssets(cfg, guard)
  const id = queryText(new URL(request.url).searchParams.get("id"), "Id") // ?id= → one asset
  // R16: the exact server total rides every list response.
  return json({
    assets: id ? assets.filter((a) => a.id === id) : assets,
    total: await countBrandAssets(cfg, guard),
  })
}

/** GET /api/content/brand-assets/export — the library as a CSV download. */
export async function getBrandAssetsExport(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "brand_assets", "read")
  await refusePortalCaller(cfg, guard)
  const { rows, complete } = await listBrandAssetsForExport(cfg, guard)
  if (!complete)
    return exportTooLarge(EXPORT_HARD_CAP, "brand assets", "Archive the material you no longer use, then export again.")
  const csv = toCsv(
    ["name", "category", "description", "fileUrl", "active", "created_at", "created_by", "updated_at", "updated_by"],
    rows.map((a) => [
      a.name, a.category, a.description, a.file_url,
      a.deactivated_at == null, a.created_at, a.creator_name, a.updated_at, a.editor_name,
    ])
  )
  return csvResponse("brand-assets.csv", csv)
}

export async function postCreateBrandAsset(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<BrandAssetInput>(request, env, "brand_assets", "create")
  await refusePortalCaller(cfg, guard)
  requireText(body.name, "Name", TEXT_LIMITS.short)
  const id = await createBrandAsset(cfg, guard, actor, body)
  await publishChange(env, guard.teamId, "brand_assets", id, "add")
  return json({ assets: await listBrandAssets(cfg, guard), total: await countBrandAssets(cfg, guard) })
}

export async function postUpdateBrandAsset(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<BrandAssetInput & { id?: string }>(
    request, env, "brand_assets", "edit"
  )
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Asset", TEXT_LIMITS.short)
  requireText(body.name, "Name", TEXT_LIMITS.short)
  await updateBrandAsset(cfg, guard, actor, id, body)
  await publishChange(env, guard.teamId, "brand_assets", id)
  return json({ assets: await listBrandAssets(cfg, guard), total: await countBrandAssets(cfg, guard) })
}

/** Archive / restore an asset — never deleted, and its bytes are never reclaimed
 * on this path (see the note on setBrandAssetActive). Gated brand_assets:delete. */
export async function postSetBrandAssetActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown; active?: unknown }>(
    request, env, "brand_assets", "delete"
  )
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Asset", TEXT_LIMITS.short)
  if (typeof body.active !== "boolean") return fail(400, "invalid_input", "id and active are required.")
  // R17: a no-op repeat moves zero rows → no ping, no duplicate history.
  const changed = await setBrandAssetActive(cfg, guard, actor, id, body.active)
  if (changed) await publishChange(env, guard.teamId, "brand_assets", id)
  return json({ assets: await listBrandAssets(cfg, guard), total: await countBrandAssets(cfg, guard) })
}

/** Upload the bytes behind a brand asset (a logo, a deck, a template) as a
 * base64 data URL — the same JSON pattern as the learning-media door, not
 * multipart. Stores them in the team's own slice of the internal bucket and
 * hands back the gateway URL the form puts in `fileUrl`.
 *
 * HOUSEKEEPING: it writes a FILE, not a record — there is no row to patch, so
 * there is nothing to broadcast (the create/edit that references the URL pings
 * its own row). Gated by brand_assets:create.
 *
 * 25 MB, matching the learning door: a brand deck is the biggest thing an agency
 * routinely hands around, and a cap the real files don't fit under is a cap
 * somebody works around by pasting a Google link — which is the exact dependency
 * this door exists to end. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
export async function postUploadBrandAsset(request: Request, env: Env): Promise<Response> {
  const { cfg, guard, body } = await gatedBody<{ dataUrl?: unknown }>(request, env, "brand_assets", "create")
  await refusePortalCaller(cfg, guard)
  const parsed = parseUploadDataUrl(body.dataUrl, MAX_UPLOAD_BYTES)
  if (!parsed) return fail(400, "invalid_input", "That file isn't a supported upload (max 25 MB).")
  // The key IS the credential — the gateway serves /media/* with no session, so
  // every upload carries a random ULID segment (mediaKey, the one place that's
  // decided), and the team id in front of it is what proves ownership later.
  const key = mediaKey(guard.teamId)
  await env.INTERNAL_MEDIA.put(key, parsed.bytes, { httpMetadata: { contentType: parsed.contentType } })
  // ?v= busts caches; the file itself is served immutable by the gateway.
  return json({ url: `/media/internal/${key}?v=${Date.now()}`, contentType: parsed.contentType })
}


/** The bytes behind a brand asset — STREAMED. The same capability as the door above,
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
export async function postStreamBrandAsset(request: Request, env: Env): Promise<Response> {
  // The envelope BEFORE the gate and before a byte is read, because a cap is only
  // a cap if it is checked before the expensive step.
  const declared = Number(request.headers.get("content-length") ?? 0)
  if (!Number.isFinite(declared) || declared <= 0)
    return fail(411, "length_required", "That upload did not say how big it is, so we did not start it.")
  if (declared > STREAM_UPLOAD_MAX_BYTES)
    return fail(
      413,
      "too_large",
      `That upload is too big, the most we can take in one file is ${Math.round(STREAM_UPLOAD_MAX_BYTES / 1_000_000)} MB. Nothing was saved.`
    )

  const { cfg, guard } = await gated(request, env, "brand_assets", "create")
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
  await env.INTERNAL_MEDIA.put(key, request.body, { httpMetadata: { contentType } })
  // ?v= busts caches; the file itself is served immutable by the gateway.
  return json({ url: `/media/internal/${key}?v=${Date.now()}`, contentType })
}
