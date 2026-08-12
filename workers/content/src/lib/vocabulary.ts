// PICK-OR-CREATE, once. A free-typed label that isn't already a dropdown value
// gets added as one, so the picker offers it next time and the fifth person to
// write "Newsletter" picks what the first one wrote instead of inventing
// "newsletter", "News letter" and "NEWSLETTER" alongside it.
//
// This was Learning's private `ensureCategory` for a long time and it only had
// one caller, so it lived in learning.ts. It has five now — a marketing post's
// channel and status, a brand asset's category, a meeting purpose's department —
// and five copies of a rule is five places for it to stop being the same rule.
// The GROUP names themselves are declared once too (shared/selectable-groups.ts),
// for exactly the same reason one layer up.

import { d1ExecScript, d1Query, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import type { Actor } from "@shared/workers/activity"
import type { MemberGuard } from "@shared/workers/gating"

/**
 * Make sure `value` exists as an ACTIVE dropdown value in `group`, adding it if
 * it doesn't. A blank value is nothing to canonicalise, so it does nothing.
 *
 * Deliberately silent about the outcome: the caller is writing a record, not
 * managing a vocabulary, and a record write must not fail because a label
 * already existed. A deactivated value with the same name is left alone — the
 * team retired it on purpose, and quietly reviving it from a form field would
 * undo a decision somebody made on the Dropdown values screen.
 */
export async function ensureSelectableValue(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  group: string,
  value: string
): Promise<void> {
  const clean = value.trim()
  if (!clean) return
  const existing = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    "SELECT id FROM selectable_data WHERE type = ? AND value = ? AND deactivated_at IS NULL",
    [group, clean]
  )
  if (existing[0]) return
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO selectable_data (id, type, value, is_default, created_at, creator_id, creator_email, creator_name) VALUES (${sqlString(ulid())}, ${sqlString(group)}, ${sqlString(clean)}, 0, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
}
