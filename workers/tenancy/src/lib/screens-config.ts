// Screen-engine config store. The BASE recipes ship in app code (one definition
// every team inherits); this stores a team's per-screen OVERRIDES — the
// runtime-editable layer that lets an admin/agent reshape a screen with no
// deploy. The worker treats a recipe as OPAQUE JSON (the web app owns the
// ScreenRecipe shape + validates it); we only check it's valid, bounded JSON.

import { logActivity, type Actor } from "@shared/workers/activity"
import { d1ExecScript, d1Query, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { GuardError, type MemberGuard } from "./permissions"

const MAX_RECIPE_BYTES = 64 * 1024

/** How many screens one team may override.
 *
 * The key is a screen key (`<module>.<view>`), and this worker cannot check it
 * against a list — it treats a recipe as opaque on purpose, because the web app
 * owns the `ScreenRecipe` shape. So the key space here is ANY string, every
 * distinct one mints a row through the upsert, and each row carries up to 64 KB.
 * That made the table's size a choice belonging to whoever holds `teams:edit`,
 * and the read below runs on EVERY page load. A ceiling on the rows is the
 * bounded thing this worker can honestly assert without borrowing the web app's
 * vocabulary. Ten screens ship today; this is room for a fork to grow. */
const MAX_SCREEN_OVERRIDES = 100

/** Every screen override this team has set: { module: recipeJSON }. The web app
 * merges these over the in-code base recipes (override wins per screen). */
export async function getScreenOverrides(
  cfg: D1Rest,
  guard: MemberGuard
): Promise<Record<string, string>> {
  const rows = await d1Query<{ module: string; recipe: string }>(
    cfg,
    guard.databaseId,
    // R14 hard cap — this is the read behind every page load, and until the write
    // door was capped the number of rows it returned (× 64 KB each) was set by
    // whoever last called the write. Ordered so a team at the ceiling gets the
    // same screens back on every request rather than an arbitrary subset.
    `SELECT module, recipe FROM screens ORDER BY module LIMIT ${MAX_SCREEN_OVERRIDES}`
  )
  const out: Record<string, string> = {}
  for (const r of rows) out[r.module] = r.recipe
  return out
}

/** Upsert this team's override for one screen (agent/admin-callable). `recipe`
 * is a JSON string the web app already validated; stored opaque + bounded. */
export async function setScreenOverride(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  module: string,
  recipe: string
): Promise<void> {
  const key = module.trim()
  if (!key) throw new GuardError(400, "invalid_input", "A screen module is required.")
  try {
    JSON.parse(recipe)
  } catch {
    throw new GuardError(400, "invalid_recipe", "That screen recipe isn't valid JSON.")
  }
  if (recipe.length > MAX_RECIPE_BYTES)
    throw new GuardError(400, "recipe_too_large", "That screen recipe is too large.")

  // CAP THE TABLE, not just the row. An UPSERT on an existing key is always
  // allowed (that is the ordinary edit, and it changes no row count); a key that
  // does not exist yet is a new row, and new rows are what the ceiling is for.
  const [existing, counted] = await Promise.all([
    d1Query<{ module: string }>(cfg, guard.databaseId, "SELECT module FROM screens WHERE module = ?", [key]),
    d1Query<{ n: number }>(cfg, guard.databaseId, "SELECT COUNT(*) AS n FROM screens"),
  ])
  if (!existing[0] && (counted[0]?.n ?? 0) >= MAX_SCREEN_OVERRIDES)
    throw new GuardError(
      400,
      "too_many_screens",
      `This team already customises ${MAX_SCREEN_OVERRIDES} screens, which is the limit. Reset one before adding another.`
    )

  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO screens (module, recipe, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(key)}, ${sqlString(recipe)}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)})
ON CONFLICT(module) DO UPDATE SET
  recipe = excluded.recipe, updated_at = ${sqlString(now)},
  editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)};`
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Screen configured",
    description: `${actor.name} customized the ${key} screen`,
    relatedTable: "screens",
    relatedRowId: key,
  })
}
