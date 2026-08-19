// THE BRAND LIBRARY — 74 rows in the legacy Glide app, and the one migration
// with a deadline attached: every file behind them is a `storage.googleapis.com`
// URL that dies with the Glide account. `file_url` therefore holds either shape
// — an object we host (a /media/internal/… URL the upload door mints) or a link
// somewhere else — so the migration can land the rows first and re-host the bytes
// as it goes, rather than needing both to happen in one atomic step.
//
// Same three module rules as its siblings: retire rather than delete, category is
// pick-or-create against its dropdown group, and the list is capped (an asset
// library is curated, not accumulated — see the note in marketing.ts).

import { describeChanges, logActivity, type Actor } from "@shared/workers/activity"
import { d1ExecScript, d1Query, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { GuardError, type MemberGuard } from "@shared/workers/gating"
import { optionalText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { EXPORT_HARD_CAP, LIST_HARD_CAP } from "@shared/workers/limits"
import { SELECTABLE_GROUPS } from "@shared/selectable-groups"
import type { BrandAsset } from "@shared/types"
import { ensureSelectableValue } from "./vocabulary"
import { safeExternalLink } from "./internal-fields"

type AssetRow = {
  id: string
  name: string
  category: string | null
  description: string | null
  file_url: string | null
  color_hex: string | null
  deactivated_at: string | null
  created_at: string
  creator_name: string | null
  updated_at: string | null
  editor_name: string | null
}

function toAsset(r: AssetRow): BrandAsset {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    description: r.description,
    fileUrl: r.file_url,
    colorHex: r.color_hex,
    active: r.deactivated_at === null,
    createdAt: r.created_at,
    creatorName: r.creator_name,
    updatedAt: r.updated_at,
    editorName: r.editor_name,
  }
}

const COLUMNS = `id, name, category, description, file_url, color_hex,
                 deactivated_at, created_at, creator_name, updated_at, editor_name`

/** Every asset (active + retired), by category then name. */
export async function listBrandAssets(cfg: D1Rest, guard: MemberGuard): Promise<BrandAsset[]> {
  const rows = await d1Query<AssetRow>(
    cfg,
    guard.databaseId,
    // R14 hard cap: a curated library, capped like Learning's.
    `SELECT ${COLUMNS} FROM brand_assets ORDER BY category ASC, name ASC LIMIT ${LIST_HARD_CAP}`
  )
  return rows.map(toAsset)
}

/** R16: the exact server COUNT(*) the badge shows — never rows.length. */
export async function countBrandAssets(cfg: D1Rest, guard: MemberGuard): Promise<number> {
  const rows = await d1Query<{ n: number }>(cfg, guard.databaseId, "SELECT COUNT(*) AS n FROM brand_assets")
  return rows[0]?.n ?? 0
}

async function assetOrThrow(cfg: D1Rest, guard: MemberGuard, id: string): Promise<AssetRow> {
  const rows = await d1Query<AssetRow>(cfg, guard.databaseId, `SELECT ${COLUMNS} FROM brand_assets WHERE id = ?`, [id])
  if (!rows[0]) throw new GuardError(404, "brand_asset_not_found", "That brand asset doesn't exist.")
  return rows[0]
}

export type BrandAssetInput = {
  name?: string
  category?: string
  description?: string
  fileUrl?: string
  colorHex?: string
}

/** A COLOUR, NOT A LINK TO A PICTURE OF ONE (0043). `#RRGGBB`, upper-cased, or
 * null — nothing else is stored, so nothing else can be rendered.
 *
 * Checked POSITIONALLY, as R20 asks: the value sits inside the test rather than
 * being trusted because a form happened to send it. A brand asset is written by
 * the screen, by the importer and by two MCP tools, and the last two are typed
 * by a machine that has never seen the form's colour picker.
 *
 * A three-digit shorthand is expanded rather than refused — `#0F8` is a colour a
 * person can legitimately type, and doubling each digit is what every browser
 * does with it. Anything else is DROPPED rather than refused, the same choice
 * `safeExternalLink` makes one file over and for the same reason: the field is
 * optional, and losing a bad colour costs nothing. */
export function safeColorHex(value: unknown): string | null {
  const v = typeof value === "string" ? value.trim().replace(/^#/, "").toUpperCase() : ""
  if (/^[0-9A-F]{3}$/.test(v)) return `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`
  return /^[0-9A-F]{6}$/.test(v) ? `#${v}` : null
}

/** One validation path for both writes — see the note on marketing's `clean`. */
async function clean(cfg: D1Rest, guard: MemberGuard, actor: Actor, input: BrandAssetInput) {
  const name = requireText(input.name, "Name", TEXT_LIMITS.short)
  const category = optionalText(input.category, "Type", TEXT_LIMITS.short) ?? null
  if (category) await ensureSelectableValue(cfg, guard, actor, SELECTABLE_GROUPS.brandCategory, category)
  return {
    name,
    category,
    description: optionalText(input.description, "Description", TEXT_LIMITS.long) ?? null,
    fileUrl: safeExternalLink(optionalText(input.fileUrl, "File", TEXT_LIMITS.link)),
    colorHex: safeColorHex(optionalText(input.colorHex, "Colour", TEXT_LIMITS.short)),
  }
}

export async function createBrandAsset(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  input: BrandAssetInput
): Promise<string> {
  const v = await clean(cfg, guard, actor, input)
  const id = ulid()
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO brand_assets (id, name, category, description, file_url, color_hex, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(v.name)}, ${sqlString(v.category)}, ${sqlString(v.description)}, ${sqlString(v.fileUrl)}, ${sqlString(v.colorHex)}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Brand asset created",
    description: `${actor.name} added "${v.name}" to the brand library`,
    relatedTable: "brand_assets",
    relatedRowId: id,
  })
  return id
}

export async function updateBrandAsset(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  input: BrandAssetInput
): Promise<void> {
  const before = await assetOrThrow(cfg, guard, id)
  const v = await clean(cfg, guard, actor, input)
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `UPDATE brand_assets SET name = ${sqlString(v.name)}, category = ${sqlString(v.category)}, description = ${sqlString(v.description)}, file_url = ${sqlString(v.fileUrl)}, color_hex = ${sqlString(v.colorHex)}, updated_at = ${sqlString(now)}, editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)} WHERE id = ${sqlString(id)};`
  )
  const changes = describeChanges([
    { label: "Name", from: before.name, to: v.name },
    { label: "Type", from: before.category, to: v.category },
    { label: "Description", from: before.description, to: v.description },
    { label: "File", from: before.file_url, to: v.fileUrl },
    { label: "Colour", from: before.color_hex, to: v.colorHex },
  ])
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Brand asset edited",
    description: `${actor.name} edited "${v.name}"${changes ? `, ${changes}` : ""}`,
    relatedTable: "brand_assets",
    relatedRowId: id,
  })
}

/** Archive or restore an asset. R17: the predicate rides the UPDATE.
 *
 * The BYTES are deliberately not reclaimed here, for the reason Learning states
 * at length: an edit SUPERSEDES a file (nothing points at it, so it is garbage),
 * while retiring a row is a reversible decision about a row that survives on
 * purpose. Deleting the object here would hand back an asset whose file 404s the
 * moment somebody restores it. */
export async function setBrandAssetActive(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  active: boolean
): Promise<boolean> {
  const before = await assetOrThrow(cfg, guard, id)
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    active
      ? `UPDATE brand_assets SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL, deactivator_name = NULL, updated_at = ? WHERE id = ? AND deactivated_at IS NOT NULL RETURNING id`
      : `UPDATE brand_assets SET deactivated_at = ?, deactivator_id = ${sqlString(actor.id)}, deactivator_email = ${sqlString(actor.email)}, deactivator_name = ${sqlString(actor.name)}, updated_at = ? WHERE id = ? AND deactivated_at IS NULL RETURNING id`,
    active ? [now, id] : [now, now, id]
  )
  if (!changed[0]) return false
  await logActivity(cfg, guard.databaseId, actor, {
    type: active ? "Brand asset restored" : "Brand asset archived",
    description: `${actor.name} ${active ? "restored" : "archived"} "${before.name}"`,
    relatedTable: "brand_assets",
    relatedRowId: id,
  })
  return true
}

/** Whole, or an error — never a short file that looks like the library. */
export async function listBrandAssetsForExport(
  cfg: D1Rest,
  guard: MemberGuard
): Promise<{ rows: AssetRow[]; complete: boolean }> {
  const rows = await d1Query<AssetRow>(
    cfg,
    guard.databaseId,
    // R14 hard cap (export tier); the +1 answers "was there more?".
    `SELECT ${COLUMNS} FROM brand_assets ORDER BY category, name LIMIT ${EXPORT_HARD_CAP + 1}`
  )
  return { rows: rows.slice(0, EXPORT_HARD_CAP), complete: rows.length <= EXPORT_HARD_CAP }
}
