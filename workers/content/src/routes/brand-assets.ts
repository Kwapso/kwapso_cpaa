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
import { EXPORT_HARD_CAP } from "@shared/workers/limits"
import { queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { publishChange } from "@shared/workers/realtime"
import { mediaKey, parseUploadDataUrl } from "@shared/workers/image"
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
