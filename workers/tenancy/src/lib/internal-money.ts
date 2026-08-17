// WHAT OUR OWN HOUR COSTS, AND WHAT IS LEFT — the agency's side of the money.
//
// NOTHING A CLIENT LOGIN CAN REACH MAY IMPORT THIS FILE. That is the whole point
// of it being a file at all. SCOPE's ruling is absolute: internal rates and
// margin never render in the portal, under any flag, ever — "not behind a
// permission, not behind a feature toggle, not for an admin viewing the portal"
// — and the instruction was to make it STRUCTURALLY true rather than a condition
// somebody can invert later.
//
// A condition can be inverted. A permission can be granted. An import cannot be
// forgotten: Law R24 walks the portal gateway's own door table through to the
// handlers behind it and the lib files those handlers call, and turns the build
// red if any of them reaches this file or names the table it reads. So the
// sentence "a margin cannot render in the portal" is a fact about the import
// graph, checked on every build, rather than a promise in a comment.
//
// The account rate card — what a client IS CHARGED, which they may be shown when
// their price visibility is switched on — lives in lib/rates.ts, on purpose. Two
// numbers of identical shape and opposite audiences do not share a file.

import { logActivity, describeChanges, type Actor } from "@shared/workers/activity"
import { d1Query, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { LIST_HARD_CAP } from "@shared/workers/limits"
import type { AppMoneyBack, InternalRate, RoleRate } from "@shared/types"
import { GuardError, type MemberGuard } from "./permissions"
import { workEngineFacts } from "./work-engine"
import { listSavings } from "./processes"
import type { AccountScope } from "@shared/workers/account-scope"

/** One line of the margin's arithmetic: a kind of work, the time logged against
 * it, the rate applied, and what that came to. The drill-down for a number the
 * owner has to be able to defend to himself. */
export type MarginLine = {
  label: string
  seconds: number
  centsPerHour: number
  costCents: number
}

/** Everything a margin is made of, so no part of it has to be taken on trust. */
export type MarginInputs = {
  revenueCents: number
  /** logged time, grouped by the kind of work it was. One group labelled by the
   * default rate is what today's work log can say; the shape takes the groups the
   * log will carry once it names a kind of work, so nothing here changes then. */
  loggedSeconds: { label: string; seconds: number }[]
  internalRates: { label: string; centsPerHour: number }[]
  /** the rate applied to time whose kind of work is unknown */
  defaultCentsPerHour: number
  toolCostCents: number
}

export type MarginResult = {
  revenueCents: number
  timeCostCents: number
  toolCostCents: number
  marginCents: number
  /** revenue − everything, as a percentage of revenue. `null` when there is no
   * revenue to be a percentage OF — a margin of "∞%" on zero revenue is the kind
   * of number that makes a person stop believing the rest of the screen. */
  marginPercent: number | null
  lines: MarginLine[]
  /** false while the work engine's tables are not in this database: the time
   * half of the subtraction is missing and the screen must say so rather than
   * present revenue minus tool costs as a margin. */
  loggedTimeAvailable: boolean
}

/** MARGIN = revenue − (logged seconds × internal rates) − tool costs.
 *
 * PURE, and separate from the reading, for the same reason the savings
 * arithmetic is: a number the owner cannot check is a number he will stop
 * believing. Every input arrives as an argument and every intermediate step
 * comes back in `lines`, so the whole calculation can be read — and tested —
 * without a database anywhere near it.
 *
 * Cents throughout, and integers throughout: money in floats is how a total
 * disagrees with the sum of its own rows. */
export function margin(inputs: MarginInputs, loggedTimeAvailable = true): MarginResult {
  const byLabel = new Map(inputs.internalRates.map((r) => [r.label, r.centsPerHour]))
  const lines: MarginLine[] = inputs.loggedSeconds
    .filter((g) => g.seconds > 0)
    .map((g) => {
      const centsPerHour = byLabel.get(g.label) ?? inputs.defaultCentsPerHour
      return {
        label: g.label,
        seconds: g.seconds,
        centsPerHour,
        // Rounded once, per line, so the lines always add up to the total shown.
        costCents: Math.round((g.seconds / 3600) * centsPerHour),
      }
    })
  const timeCostCents = lines.reduce((n, l) => n + l.costCents, 0)
  const marginCents = inputs.revenueCents - timeCostCents - inputs.toolCostCents
  return {
    revenueCents: inputs.revenueCents,
    timeCostCents,
    toolCostCents: inputs.toolCostCents,
    marginCents,
    marginPercent:
      inputs.revenueCents > 0 ? Math.round((marginCents / inputs.revenueCents) * 1000) / 10 : null,
    lines,
    loggedTimeAvailable,
  }
}

/** The team's internal rate card. No account column and no account fence: an
 * internal rate is a fact about the agency, not about any client. The door in
 * front of it refuses client logins outright. */
export async function listInternalRates(
  cfg: D1Rest,
  guard: MemberGuard
): Promise<{ rows: InternalRate[]; total: number }> {
  const [rows, counted] = await Promise.all([
    d1Query<{
      id: string
      label: string
      cents_per_hour: number
      currency: string | null
      is_default: number
      deactivated_at: string | null
      created_at: string
      creator_name: string | null
      updated_at: string | null
      editor_name: string | null
    }>(
      cfg,
      guard.databaseId,
      // R14 hard cap — kinds of work, not hours.
      `SELECT id, label, cents_per_hour, currency, is_default, deactivated_at,
              created_at, creator_name, updated_at, editor_name
         FROM internal_rates ORDER BY (deactivated_at IS NULL) DESC, is_default DESC, label ASC
        LIMIT ${LIST_HARD_CAP}`,
      []
    ),
    // R16 — the exact server total.
    d1Query<{ n: number }>(cfg, guard.databaseId, "SELECT COUNT(*) AS n FROM internal_rates", []),
  ])
  return {
    rows: rows.map((r) => ({
      id: r.id,
      label: r.label,
      centsPerHour: r.cents_per_hour,
      currency: r.currency,
      isDefault: r.is_default === 1,
      active: r.deactivated_at == null,
      createdAt: r.created_at,
      createdByName: r.creator_name,
      updatedAt: r.updated_at,
      editedByName: r.editor_name,
    })),
    total: counted[0]?.n ?? 0,
  }
}

const RATE_TAKEN = "That kind of work already has an internal rate. Edit the one that's there."
const DEFAULT_TAKEN =
  "Another rate is already the default one. Turn that one off first, a margin can only apply one."

/** A UNIQUE INDEX REFUSING A ROW IS BAD INPUT, NOT A CRASH. Two indexes guard
 * this table: one live rate per label, and at most one default. They give
 * different refusals, so the caller is told which rule they met. */
async function refusingDuplicate<T>(isDefault: boolean, write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (e) {
    const message = String((e as Error)?.message ?? "")
    if (!/UNIQUE constraint/i.test(message)) throw e
    throw new GuardError(409, "duplicate", /is_default/.test(message) && isDefault ? DEFAULT_TAKEN : RATE_TAKEN)
  }
}

export async function createInternalRate(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  input: { label: string; centsPerHour: number; currency?: string; isDefault?: boolean }
): Promise<string> {
  const id = ulid()
  await refusingDuplicate(input.isDefault === true, () =>
    d1Query(
      cfg,
      guard.databaseId,
      `INSERT INTO internal_rates (id, label, cents_per_hour, currency, is_default,
         created_at, creator_id, creator_email, creator_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.label,
        input.centsPerHour,
        input.currency ?? null,
        input.isDefault ? 1 : 0,
        new Date().toISOString(),
        actor.id,
        actor.email,
        actor.name,
      ]
    )
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Internal rate added",
    description: `${actor.name} set the internal rate for ${input.label}`,
    relatedTable: "internal_rates",
    relatedRowId: id,
  })
  return id
}

export async function updateInternalRate(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  input: { label: string; centsPerHour: number; currency?: string | null; isDefault?: boolean }
): Promise<void> {
  const before = await internalRateOrThrow(cfg, guard, id)
  const now = new Date().toISOString()
  const changed = await refusingDuplicate(input.isDefault === true, () =>
    d1Query<{ id: string }>(
      cfg,
      guard.databaseId,
      `UPDATE internal_rates SET label = ?, cents_per_hour = ?, currency = ?, is_default = ?,
         updated_at = ?, editor_id = ?, editor_email = ?, editor_name = ?
       WHERE id = ? RETURNING id`,
      [
        input.label,
        input.centsPerHour,
        input.currency === undefined ? before.currency : input.currency,
        input.isDefault === undefined ? (before.isDefault ? 1 : 0) : input.isDefault ? 1 : 0,
        now,
        actor.id,
        actor.email,
        actor.name,
        id,
      ]
    )
  )
  if (!changed[0]) throw new GuardError(404, "not_found", "That internal rate doesn't exist.")
  const changes = describeChanges([
    { label: "Kind of work", from: before.label, to: input.label },
    { label: "Rate", from: String(before.centsPerHour), to: String(input.centsPerHour) },
  ])
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Internal rate edited",
    description: `${actor.name} edited the internal rate for ${input.label}${changes ? `, ${changes}` : ""}`,
    relatedTable: "internal_rates",
    relatedRowId: id,
  })
}

/** Retire / restore an internal rate. R17 predicate; zero rows moved = silence. */
export async function setInternalRateActive(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  active: boolean
): Promise<boolean> {
  const before = await internalRateOrThrow(cfg, guard, id)
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    active
      ? `UPDATE internal_rates SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL,
           deactivator_name = NULL, updated_at = ?
         WHERE id = ? AND deactivated_at IS NOT NULL RETURNING id`
      : `UPDATE internal_rates SET deactivated_at = ?, deactivator_id = ?, deactivator_email = ?,
           deactivator_name = ?, updated_at = ?
         WHERE id = ? AND deactivated_at IS NULL RETURNING id`,
    active ? [now, id] : [now, actor.id, actor.email, actor.name, now, id]
  )
  if (!changed[0]) return false
  await logActivity(cfg, guard.databaseId, actor, {
    type: active ? "Internal rate restored" : "Internal rate retired",
    description: `${actor.name} ${active ? "restored" : "retired"} the internal rate for ${before.label}`,
    relatedTable: "internal_rates",
    relatedRowId: id,
  })
  return true
}

/** THE MARGIN ON ONE ACCOUNT, with every figure it was built from.
 *
 * `accountId` has already been resolved against the caller's fence by the door —
 * and the door refuses client logins outright, so the only caller that ever
 * reaches here is staff holding `commercials:read`.
 *
 * Tool costs are the apps' own monthly figure, which is why they are a column on
 * the app: what a system costs us to keep running is one number about one system,
 * and this is the only thing that reads it. */
export async function readMargin(
  cfg: D1Rest,
  guard: MemberGuard,
  accountId: string
): Promise<MarginResult> {
  const [rates, tools, borrowed] = await Promise.all([
    listInternalRates(cfg, guard),
    d1Query<{ n: number | null }>(
      cfg,
      guard.databaseId,
      // Bounded by construction: one aggregate row. Archived apps cost nothing.
      "SELECT SUM(tool_cost_cents_per_month) AS n FROM apps WHERE account_id = ? AND deactivated_at IS NULL",
      [accountId]
    ),
    workEngineFacts(cfg, guard, accountId),
  ])

  const live = rates.rows.filter((r) => r.active)
  const fallback = live.find((r) => r.isDefault) ?? live[0]
  return margin(
    {
      revenueCents: borrowed.soldCents,
      // ONE group today, labelled by the rate that will be applied to it, because
      // that is the most a work log can currently say (see lib/work-engine.ts).
      // The shape is already the grouped one, so the day a log names its kind of
      // work, the door passes real groups and none of the arithmetic changes.
      loggedSeconds: [{ label: fallback?.label ?? "Our time", seconds: borrowed.loggedSeconds }],
      internalRates: live.map((r) => ({ label: r.label, centsPerHour: r.centsPerHour })),
      defaultCentsPerHour: fallback?.centsPerHour ?? 0,
      toolCostCents: Math.max(0, Math.round(tools[0]?.n ?? 0)),
    },
    borrowed.ready
  )
}

async function internalRateOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  id: string
): Promise<{ id: string; label: string; centsPerHour: number; currency: string | null; isDefault: boolean }> {
  const rows = await d1Query<{
    id: string
    label: string
    cents_per_hour: number
    currency: string | null
    is_default: number
  }>(
    cfg,
    guard.databaseId,
    "SELECT id, label, cents_per_hour, currency, is_default FROM internal_rates WHERE id = ? LIMIT 1",
    [id]
  )
  if (!rows[0]) throw new GuardError(404, "not_found", "That internal rate doesn't exist.")
  return {
    id: rows[0].id,
    label: rows[0].label,
    centsPerHour: rows[0].cents_per_hour,
    currency: rows[0].currency,
    isDefault: rows[0].is_default === 1,
  }
}

/* ------------- what a ROLE's hour costs, and the app it pays for ----------- */
//
// AURORA'S MODEL FOR "HOURS AND MONEY GIVEN BACK, PER APP" (CHECKLIST 8.13),
// settled over the owner's "client rate times hours saved". Her sentence: for
// each process, record WHICH ROLE does it; store a rate per role; the figure is
// the hours that role no longer spends, times its rate. Before minus after.
//
// IT IS A THIRD RATE CARD AND IT BELONGS IN THIS FILE, which is the whole of
// R24's defence. `account_rates` is what a client is CHARGED and lives in
// rates.ts behind the account fence; `internal_rates` is what a KIND OF WORK
// costs us; this is what a ROLE's hour costs. All three are prices, only two of
// them are ours, and the one thing that reliably keeps ours off the client's
// side is that the file they live in is a file no portal-reachable path
// imports. A condition can be inverted; an import cannot be forgotten.
//
// WHY THE ROLES ARE NOT `member_roles`. The person who does a client's invoicing
// is THEIR bookkeeper, not one of our logins. So a role here is free text
// against the team's own vocabulary, and the rate is what an hour of that
// person's time is worth — which is exactly the number that makes "we gave four
// hours a month back" into a figure somebody can put in a proposal.

/** The team's role rate card. No account column and no fence, for the same
 * reason the internal rate card has neither: it is a fact about the work, not
 * about any one client. The doors in front of it refuse a portal caller. */
export async function listRoleRates(
  cfg: D1Rest,
  guard: MemberGuard
): Promise<{ rows: RoleRate[]; total: number }> {
  const [rows, counted] = await Promise.all([
    d1Query<{
      id: string
      role_name: string
      cents_per_hour: number
      deactivated_at: string | null
      created_at: string
      creator_name: string | null
      updated_at: string | null
      editor_name: string | null
    }>(
      cfg,
      guard.databaseId,
      // R14 hard cap — kinds of person, not hours.
      `SELECT id, role_name, cents_per_hour, deactivated_at, created_at, creator_name,
              updated_at, editor_name
         FROM internal_role_rates ORDER BY (deactivated_at IS NULL) DESC, role_name ASC
        LIMIT ${LIST_HARD_CAP}`,
      []
    ),
    // R16 — the exact server total.
    d1Query<{ n: number }>(cfg, guard.databaseId, "SELECT COUNT(*) AS n FROM internal_role_rates", []),
  ])
  return {
    rows: rows.map((r) => ({
      id: r.id,
      roleName: r.role_name,
      centsPerHour: r.cents_per_hour,
      active: r.deactivated_at == null,
      createdAt: r.created_at,
      createdByName: r.creator_name,
      updatedAt: r.updated_at,
      editedByName: r.editor_name,
    })),
    total: counted[0]?.n ?? 0,
  }
}

/** SET WHAT A ROLE'S HOUR COSTS — one door for all three moves, and that is the
 * lean decision rather than an oversight. A rate card of `{role, price}` has no
 * "edit" that is not "say what it is now": the ROLE is the key, so naming one
 * that exists re-prices it, naming one that does not adds it, and `active:false`
 * retires it. Three doors would have been three gates, three tools and three
 * refusals for one sentence.
 *
 * Idempotent (R17): re-sending the same price moves the row to the state it is
 * already in, and re-retiring a retired rate returns without a second history
 * line. The current-state predicate rides the UPDATE rather than a read before
 * it, so two people saving at once cannot both write. */
export async function setRoleRate(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  input: { roleName: string; centsPerHour: number; active: boolean }
): Promise<{ id: string; moved: boolean }> {
  const now = new Date().toISOString()
  const existing = await d1Query<{ id: string; cents_per_hour: number; deactivated_at: string | null }>(
    cfg,
    guard.databaseId,
    // R14: the role IS the key, so at most one row can come back.
    "SELECT id, cents_per_hour, deactivated_at FROM internal_role_rates WHERE role_name = ? LIMIT 1",
    [input.roleName]
  )
  const before = existing[0]
  if (!before) {
    const id = ulid()
    await d1Query(
      cfg,
      guard.databaseId,
      `INSERT INTO internal_role_rates (id, role_name, cents_per_hour, created_at, creator_id,
          creator_email, creator_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.roleName, input.centsPerHour, now, actor.id, actor.email, actor.name]
    )
    if (!input.active)
      await d1Query(
        cfg,
        guard.databaseId,
        `UPDATE internal_role_rates SET deactivated_at = ?, deactivator_id = ?, deactivator_email = ?,
            deactivator_name = ? WHERE id = ? AND deactivated_at IS NULL`,
        [now, actor.id, actor.email, actor.name, id]
      )
    await logActivity(cfg, guard.databaseId, actor, {
      type: "Role rate set",
      description: `${actor.name} priced an hour of ${input.roleName}`,
      relatedTable: "internal_role_rates",
      relatedRowId: id,
    })
    return { id, moved: true }
  }
  // R17 — nothing to say when nothing changed. Both facts in one predicate, so
  // a re-save of an unchanged rate writes no row and rings no bell.
  const unchanged = before.cents_per_hour === input.centsPerHour && (before.deactivated_at == null) === input.active
  if (unchanged) return { id: before.id, moved: false }
  await d1Query(
    cfg,
    guard.databaseId,
    input.active
      ? `UPDATE internal_role_rates SET cents_per_hour = ?, deactivated_at = NULL, deactivator_id = NULL,
            deactivator_email = NULL, deactivator_name = NULL, updated_at = ?, editor_id = ?,
            editor_email = ?, editor_name = ? WHERE id = ?`
      : `UPDATE internal_role_rates SET cents_per_hour = ?, deactivated_at = ?, deactivator_id = ?,
            deactivator_email = ?, deactivator_name = ?, updated_at = ?, editor_id = ?,
            editor_email = ?, editor_name = ? WHERE id = ?`,
    input.active
      ? [input.centsPerHour, now, actor.id, actor.email, actor.name, before.id]
      : [
          input.centsPerHour,
          now,
          actor.id,
          actor.email,
          actor.name,
          now,
          actor.id,
          actor.email,
          actor.name,
          before.id,
        ]
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: input.active ? "Role rate set" : "Role rate retired",
    description: `${actor.name} ${input.active ? "priced" : "retired the price of"} an hour of ${input.roleName}`,
    relatedTable: "internal_role_rates",
    relatedRowId: before.id,
  })
  return { id: before.id, moved: true }
}

/** WHAT ONE APP HAS GIVEN BACK — hours, and what those hours are worth (8.13).
 *
 * The hours are `listSavings`' own arithmetic, unchanged and un-recomputed: the
 * baseline minus the latest, step by step, rolled up per process. This adds the
 * one thing that file cannot know without importing a price — WHOSE hours they
 * were, and what an hour of that person is worth.
 *
 * A PROCESS WITH NO ROLE, OR A ROLE WITH NO LIVE RATE, CONTRIBUTES ZERO MONEY
 * AND ITS FULL HOURS. That asymmetry is deliberate and it is the honest one: the
 * time saved is a measurement and it is true whether or not anybody has priced
 * it, while the money is an inference that needs a number nobody has given yet.
 * Inventing a default rate would produce a figure that looks the same as a real
 * one, which is precisely the sort of number that costs a screen its credit.
 *
 * R25 rides the object: the caption comes from `listSavings` and is passed on
 * word for word, because the money is made of the same estimates the hours are.
 */
export async function appMoneyBack(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  appId: string
): Promise<AppMoneyBack> {
  const [view, roles, rates] = await Promise.all([
    listSavings(cfg, guard, scope, { appId }),
    d1Query<{ id: string; role_name: string | null }>(
      cfg,
      guard.databaseId,
      // R14 hard cap — the processes inside one app, which is a bounded set.
      `SELECT id, role_name FROM processes WHERE app_id = ? AND deactivated_at IS NULL LIMIT ${LIST_HARD_CAP}`,
      [appId]
    ),
    listRoleRates(cfg, guard),
  ])
  const roleOf = new Map(roles.map((r) => [r.id, r.role_name]))
  const priceOf = new Map(rates.rows.filter((r) => r.active).map((r) => [r.roleName, r.centsPerHour]))
  const app = view.apps[0]
  const lines = (app?.processes ?? []).map((p) => {
    const roleName = roleOf.get(p.processId) ?? null
    const centsPerHour = roleName ? (priceOf.get(roleName) ?? null) : null
    return {
      processId: p.processId,
      name: p.name,
      roleName,
      savedSecondsPerMonth: p.savedSecondsPerMonth,
      centsPerHour,
      // Rounded ONCE per line, so the lines always add up to the total shown —
      // the same rule `margin` keeps one function up this file.
      moneyCentsPerMonth:
        centsPerHour == null ? null : Math.round((p.savedSecondsPerMonth / 3600) * centsPerHour),
    }
  })
  return {
    appId,
    savedSecondsPerMonth: view.savedSecondsPerMonth,
    moneyCentsPerMonth: lines.reduce((sum, l) => sum + (l.moneyCentsPerMonth ?? 0), 0),
    /** how many of the lines could not be priced — the screen says so rather
     * than quietly reporting a smaller number as if it were the whole. */
    unpricedProcesses: lines.filter((l) => l.moneyCentsPerMonth == null).length,
    lines,
    caption: view.caption,
  }
}
