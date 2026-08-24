// PROCESS MAPS — apps, the processes inside them, the versions cut over those,
// the steps each version is made of, and the conversation a client has on a map.
//
// This is the ONLY file in the worker that writes SQL against `apps`,
// `processes`, `process_versions`, `process_steps` or `process_comments` — the
// same boundary lib/accounts.ts draws around the customer spine, and for the same
// reason: every exported function here takes an `AccountScope` and ANDs its
// clause into the statement, so "did this query carry the caller's stamp?" is a
// question with exactly one place to look, and a machine-checkable one
// (test/account-leak.test.ts derives the account-scoped doors off disk and sends
// a burglar at every one of them).
//
// The fence rides the WHERE, never a pre-check. `SELECT … then UPDATE` is two
// steps a concurrent write slips between; `UPDATE … WHERE id = ? AND <scope>` is
// one statement D1 runs atomically, and zero rows changed is the refusal.
//
// WHY EVERY TABLE CARRIES `account_id`. It could be resolved by joining up to the
// app, and that is exactly what makes it wrong: a fence that needs a join is a
// fence the next reader forgets to join. Denormalised, every read here fences with
// the same one clause the accounts list uses, and an app's account is written once
// at creation and never edited (there is no move-app door — see the migration).

import { logActivity, describeChanges, type Actor } from "@shared/workers/activity"
import { accountScopeClause, appScopeClause, requireAccountInScope, type AccountScope } from "@shared/workers/account-scope"
import { countCollection } from "@shared/workers/count"
import { d1Query, likeLiteral, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { APP_MODULE_CAP, LIST_HARD_CAP, THREAD_HARD_CAP } from "@shared/workers/limits"
import { decodeCursor, keysetAfter, PAGE_SIZE, toPage, type Page } from "@shared/workers/paging"
import { orderBy, resolveOrdering, type Ordering, type SortMenu } from "@shared/workers/sorting"
import {
  PERIODS,
  runsPerMonthFrom,
  savingsView,
  type SavingsView,
  type StepFigures,
} from "@shared/workers/savings"
import type { AppModule, AppRow, ProcessComment, ProcessDetail, ProcessStep, ProcessSummary, ProcessVersion } from "@shared/types"
import { GuardError, type MemberGuard } from "./permissions"

/** Glue optional clauses into a WHERE, dropping the empty ones, so a scope clause
 * that is empty for staff can't leave a dangling `AND`. (The same helper
 * lib/accounts.ts keeps beside its own statements — two copies of four lines
 * beats one import that makes two security boundaries share a file.) */
function where(parts: (string | undefined)[]): string {
  const live = parts.filter((p): p is string => !!p && p.length > 0)
  return live.length ? ` WHERE ${live.join(" AND ")}` : ""
}

/** The audit set-clause every edit here shares. */
function editedBy(actor: Actor, now: string): { sql: string; params: string[] } {
  return {
    sql: "updated_at = ?, editor_id = ?, editor_email = ?, editor_name = ?",
    params: [now, actor.id, actor.email, actor.name],
  }
}

/** A parameterised INSERT — the table name is a code literal, every value bound.
 * A process name is the customer's own text (apostrophes, newlines, whatever the
 * workshop produced), and bound parameters are the door that can't be talked past. */
async function insertRow(
  cfg: D1Rest,
  guard: MemberGuard,
  table:
    | "apps"
    | "app_modules"
    | "app_staff"
    | "app_stakeholders"
    | "process_step_tools"
    | "process_links"
    | "processes"
    | "process_versions"
    | "process_steps"
    | "process_comments",
  row: Record<string, string | number | null>
): Promise<void> {
  const cols = Object.keys(row)
  await d1Query(
    cfg,
    guard.databaseId,
    `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    cols.map((c) => row[c])
  )
}

// ── apps ─────────────────────────────────────────────────────────────────────

/** THE APPS THIS CALLER MAY SEE, AS A QUESTION — the account fence plus the
 * optional narrowing to one client, written once so the rows and the count over
 * them cannot be asked differently (R16). */
/* THERE IS NO STAFFING FENCE IN THIS QUERY, AND THAT IS THE RULING.
 *
 * The owner asked on 19 Aug 2026 for the agency side to be fenced, and the first
 * reading of that hid the ROW: an app with people on it disappeared from the
 * list for everybody else. He read it back the same day and narrowed it — "I
 * just want to make it such that people who are not main stakeholders of the app
 * can see it. They just can't enter the details screen of it and stuff like
 * that."
 *
 * So the fence is RECORD-LEVEL and not row-level: every app in the agency is
 * visible to anybody holding `processes:read`, and what a non-staffed reader
 * cannot have is the app's own material — its address, its four context fields,
 * its running cost and the two people lists. That decision is made once, on the
 * row, as `canOpen` in listApps below, and the withheld fields are LEFT OUT of
 * the payload rather than hidden by the screen: a field that never crosses the
 * wire cannot be read out of the network tab, and "the screen doesn't render it"
 * is not a permission.
 *
 * WHAT STILL LEAKS, said plainly because he asked and accepted it: the knowledge
 * base and the assistant read the same rows through their own doors, so an app's
 * name and the prose written about it can still be reached that way. He ruled
 * that acceptable for now ("I think that's fine for now"). It is written down
 * here so the next person finds a known gap rather than an oversight. */

function appsWhere(
  scope: AccountScope,
  opts: { accountId?: string; q?: string }
): { sql: string; params: string[] } {
  const fence = accountScopeClause(scope, "account_id")
    // AND THE APP FENCE (SCOPE ch.03 "per-person restriction"). A client login
    // may be narrowed to named apps; a staff caller and an unrestricted client
    // both get an empty clause, so this changes nothing for either. It is an AND
    // beside the account fence and never instead of it — see appScopeClause.
  const apps = appScopeClause(scope, "id")
  const filters = [fence.sql, apps.sql]
  const params = [...fence.params, ...apps.params]
  if (opts.accountId) {
    filters.push("account_id = ?")
    params.push(opts.accountId)
  }
  // THE SEARCH BOX (the owner, 24 Aug 2026: "I cannot search through any of my
  // apps, which is a weird thing to begin with").
  //
  // OVER THE NAME, AND DELIBERATELY NOTHING ELSE. The obvious second column is
  // `about`, and it is exactly the one that must not be here: `about`,
  // `client_context`, `solution` and `key_actors` are the MATERIAL `canOpen`
  // withholds from one of our own people who is not staffed on this app. A
  // search that matched on them would answer "yes, something in here says that"
  // about text the caller may not read — the same leak, spelled with a boolean
  // instead of a string, and invisible because the withheld field never appears
  // in the response. A filter is a read.
  //
  // `name` and `stage` ride to everyone who sees the row (8.11: everyone SEES
  // every app), so the name is the whole safe surface — and it is what a person
  // types anyway.
  //
  // ESCAPED, for the same two reasons the accounts search is: `%` and `_` are
  // LIKE's own wildcards, so an unescaped needle answers a different question
  // than the one typed, and a pattern of alternating `%` costs SQLite
  // exponential time over the whole table for a handful of bytes.
  if (opts.q) {
    filters.push("name LIKE ? ESCAPE '\\'")
    params.push(`%${likeLiteral(opts.q)}%`)
  }
  return { sql: where(filters), params }
}

/** R16: the exact server COUNT(*) an Apps badge shows, over the SAME fence and
 * the same narrowing the list applies. Not bounded through the count seam
 * because `apps` is not a GROWING_COLLECTIONS row — an agency has tens of built
 * systems, not thousands, which is the same reason the list is capped and not
 * paged.
 *
 * Apart from the list because a client's record now badges its Apps tab BEFORE
 * the tab is opened (shared/record-counts.ts) — the whole point being not to
 * pull the rows to learn how many there are.
 *
 * IT COUNTS EVERY APP THE CALLER CAN SEE, which since the owner's narrowing on
 * 19 Aug 2026 is every app in the agency: staffing withholds an app's MATERIAL
 * and never its existence (see appsWhere above). So the badge and the list agree
 * for the reason R16 wants them to — one WHERE, asked once — and not because two
 * filters happen to match. A count is the easy thing to forget when a fence
 * moves, so it moved with it: the fence used to be in this query and is now on
 * the row, and this expression lost a term on the same commit. */
export async function countApps(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  opts: { accountId?: string; q?: string } = {}
): Promise<number> {
  const q = appsWhere(scope, opts)
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM apps${q.sql}`,
    q.params
  )
  return rows[0]?.n ?? 0
}

/** The team's apps. BOUNDED, not paged: an app is a whole built system, and an
 * agency has tens of them, not thousands — the collection that grows underneath
 * is `processes`, which pages. */
export async function listApps(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  opts: { accountId?: string; q?: string } = {}
): Promise<{ rows: AppRow[]; total: number }> {
  const { sql, params } = appsWhere(scope, opts)
  const [rows, counted] = await Promise.all([
    d1Query<{
      id: string
      account_id: string | null
      name: string
      url: string | null
      stage: string | null
      logo_url: string | null
      tool_cost_cents_per_month: number
      about: string | null
      client_context: string | null
      solution: string | null
      key_actors: string | null
      deactivated_at: string | null
      created_at: string
      creator_name: string | null
      updated_at: string | null
      editor_name: string | null
    }>(
      cfg,
      guard.databaseId,
      // R14 hard cap — an app list is bounded by how many systems exist.
      //
      // THE FOUR CONTEXT FIELDS RIDE THE LIST, and that is a decision rather than
      // laziness: the apps set is bounded and read whole, the detail screen reads
      // the record out of the same cache the list filled, and a second door for
      // four columns would be a round trip that buys a page nothing.
      `SELECT id, account_id, name, url, stage, logo_url, tool_cost_cents_per_month,
              about, client_context, solution, key_actors, deactivated_at,
              created_at, creator_name, updated_at, editor_name
         FROM apps${sql} ORDER BY (deactivated_at IS NULL) DESC, name ASC LIMIT ${LIST_HARD_CAP}`,
      params
    ),
    // R16: the exact total of what THIS caller may see — the same WHERE, so a
    // badge can never count rows the list withholds. ONE expression, shared with
    // the eager badge above.
    countApps(cfg, guard, scope, opts),
  ])
  // WHO MAY OPEN WHAT (8.11, narrowed by the owner on 19 Aug 2026). Everyone
  // SEES every app; only the staff on it, plus an admin, get its material. That
  // is record-level visibility, which this codebase had never done — so it is
  // decided HERE, on the row, and the material a non-staffed reader may not have
  // is left out of the payload rather than hidden by the screen. A withheld
  // field cannot be read out of the network tab, and "the screen doesn't render
  // it" is not a permission.
  //
  // AN APP WITH NOBODY ON IT IS NOT A SECRET, IT IS UNASSIGNED. This carve-out
  // moved here from the WHERE clause it used to live in, and it is the reason
  // this rule can be switched on at all: on staging there are 28 live apps and
  // exactly TWO with anybody staffed. Without it, 26 of 28 systems would close
  // to everyone but an admin on the day this shipped — and a rule that locks
  // almost everything gets switched off rather than filled in. With it, the
  // fence closes around an app the MOMENT somebody is put on it, so the more of
  // the rota is filled in the tighter it gets and nothing has to be back-filled
  // first. `people.staff` is the same live set `staffedAppIds` reads (both
  // `deactivated_at IS NULL`), so "nobody is on it" cannot mean two things.
  //
  // A CLIENT LOGIN IS NOT SUBJECT TO IT, deliberately — `admin` is true for a
  // portal caller. The account fence has already decided which apps they may see
  // at all, and every one of those is their own system; staffing is OUR rota,
  // and applying it to them would hide a client's own app from them because none
  // of our people had been assigned yet.
  const [admin, staffedIds, people] = await Promise.all([
    scope.kind === "portal" ? Promise.resolve(true) : isAdmin(cfg, guard),
    scope.kind === "portal" ? Promise.resolve(new Set<string>()) : staffedAppIds(cfg, guard),
    appPeople(cfg, guard),
  ])
  return {
    rows: rows.map((r) => {
      const canOpen =
        admin || staffedIds.has(r.id) || (people.staff.get(r.id) ?? []).length === 0
      // AND THE MONEY IS STRICTER THAN THE REST OF IT, deliberately, because two
      // separate rulings meet on this one row and only one of them was relaxed.
      //
      // The owner asked for the app's PAGE to reopen to colleagues who are not on
      // it. He did not ask for what an app costs us to run to reopen with it, and
      // it would have: with 26 of 28 apps unassigned, the carve-out above would
      // hand the running cost of nearly every system to anybody holding
      // `processes:read` — quietly undoing the fence he put on that number the
      // same day, as a side effect of a visibility change.
      //
      // So the carve-out does NOT extend here. An unassigned app is not a secret
      // (you can open it and work in it); our hosting bill for it still is. That
      // is R24's own argument — an internal figure travels further than anybody
      // expects unless something stops it — and the cost is the number the margin
      // is computed from. The way back in is to be put on the app, which is the
      // same door as everything else here.
      const canSeeCost = admin || staffedIds.has(r.id)
      return {
        id: r.id,
        accountId: r.account_id,
        name: r.name,
        url: canOpen ? r.url : null,
        stage: r.stage,
        // THE LOGO RIDES FOR EVERYONE, and that is the same ruling 8.11 made
        // about the app's existence rather than an exception to it: everyone
        // SEES an app in the overview, and on this screen the overview IS the
        // picture (`app-tiles.tsx`). Withholding it from a colleague who is not
        // staffed would leave them a wall of identical marks — hiding the one
        // thing that makes the list readable, to protect nothing. It is a
        // client's own logo, not a fact about us (R24).
        logoUrl: r.logo_url,
        // WHAT AN APP COSTS US is an internal number and never crosses to a client.
        // It is withheld HERE, on the row, rather than at the three call sites — a
        // redaction you have to remember is one somebody forgets (the same argument
        // toAccount makes one table over, and the reason R24 exists).
        // WHAT IT COSTS US TO RUN, and it is now the same answer as the URL and
        // the prose: only for somebody on this app, or an admin (owner, 19 Aug
        // 2026 — "yes of course" to fencing the agency side).
        //
        // It was withheld from a CLIENT and sent to every single staff member
        // holding `processes:read`, which is the wrong half: a client seeing our
        // hosting bill is the obvious leak, and a whole agency seeing the running
        // cost of twenty-eight systems they are not on is the quiet one. It is
        // the number the margin is computed from (R24's neighbourhood), and R24's
        // own argument is that an internal figure travels further than anybody
        // expects unless something stops it.
        toolCostCentsPerMonth:
          scope.kind === "portal" || !canSeeCost ? null : r.tool_cost_cents_per_month,
        // The four context fields go to a client login as well. They are the
        // agency's description of the client's OWN system and the situation it was
        // built into — the same material the portal's value screen already names
        // the app on. Nothing here is a number about us.
        //
        // They are the DETAIL, though, so they are also the thing 8.11 withholds
        // from one of our own people who is not on this app.
        about: canOpen ? r.about : null,
        clientContext: canOpen ? r.client_context : null,
        solution: canOpen ? r.solution : null,
        keyActors: canOpen ? r.key_actors : null,
        canOpen,
        staff: canOpen ? (people.staff.get(r.id) ?? []) : [],
        stakeholders: canOpen ? (people.stakeholders.get(r.id) ?? []) : [],
        active: r.deactivated_at == null,
        createdAt: r.created_at,
        createdByName: scope.kind === "portal" ? null : r.creator_name,
        updatedAt: r.updated_at,
        editedByName: scope.kind === "portal" ? null : r.editor_name,
      }
    }),
    total: counted,
  }
}

/* ------------------------- who is on an app (8.10 + 8.5) ------------------- */

/** The team's locked Admin role (member_roles WHERE is_default = 1). An admin
 * opens every app whether they are staffed to it or not — 8.11's own sentence. */
async function isAdmin(cfg: D1Rest, guard: MemberGuard): Promise<boolean> {
  const rows = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    "SELECT id FROM member_roles WHERE is_default = 1 LIMIT 1" // R14: one row
  )
  return rows[0]?.id === guard.roleId
}

/** EVERY APP THE CALLER IS STAFFED TO. Read whole rather than per app: the set is
 * one person's assignments, which is bounded by how many systems exist. */
export async function staffedAppIds(cfg: D1Rest, guard: MemberGuard): Promise<Set<string>> {
  const rows = await d1Query<{ app_id: string }>(
    cfg,
    guard.databaseId,
    // R14 hard cap — one person cannot be staffed to more apps than exist.
    `SELECT app_id FROM app_staff WHERE user_id = ? AND deactivated_at IS NULL LIMIT ${LIST_HARD_CAP}`,
    [guard.userId]
  )
  return new Set(rows.map((r) => r.app_id))
}

/** The live staff and stakeholder rows of every app in one read each, grouped by
 * app. Two statements for a whole page of apps, never one per row. */
async function appPeople(
  cfg: D1Rest,
  guard: MemberGuard
): Promise<{
  staff: Map<string, { userId: string; isLead: boolean }[]>
  stakeholders: Map<string, { contactId: string; isMain: boolean }[]>
}> {
  const [staffRows, holderRows] = await Promise.all([
    d1Query<{ app_id: string; user_id: string; is_lead: number }>(
      cfg,
      guard.databaseId,
      // R14 hard cap — staff rows are (apps × the team), both bounded sets.
      `SELECT app_id, user_id, is_lead FROM app_staff WHERE deactivated_at IS NULL
        ORDER BY is_lead DESC, id ASC LIMIT ${LIST_HARD_CAP}`
    ),
    d1Query<{ app_id: string; contact_id: string; is_main: number }>(
      cfg,
      guard.databaseId,
      // R14 hard cap — the same shape, over the client's own people.
      `SELECT app_id, contact_id, is_main FROM app_stakeholders WHERE deactivated_at IS NULL
        ORDER BY is_main DESC, id ASC LIMIT ${LIST_HARD_CAP}`
    ),
  ])
  const staff = new Map<string, { userId: string; isLead: boolean }[]>()
  for (const r of staffRows)
    staff.set(r.app_id, [...(staff.get(r.app_id) ?? []), { userId: r.user_id, isLead: r.is_lead === 1 }])
  const stakeholders = new Map<string, { contactId: string; isMain: boolean }[]>()
  for (const r of holderRows)
    stakeholders.set(r.app_id, [
      ...(stakeholders.get(r.app_id) ?? []),
      { contactId: r.contact_id, isMain: r.is_main === 1 },
    ])
  return { staff, stakeholders }
}

/** WHO IS ON THIS APP — the whole set, replaced in one go (8.10).
 *
 * The form asks the question once, so the door answers it once: the set you send
 * IS the set the app has afterwards. Anybody dropped is DEACTIVATED rather than
 * deleted, and anybody re-added re-activates the row they already had — which is
 * why the membership index is unique across both states. The lead is cleared
 * before it is set, because "exactly one" is a partial unique index and two
 * UPDATEs in the wrong order would collide with it rather than replace it.
 *
 * Idempotent by construction (R17): sending the same set twice moves rows to the
 * state they are already in, and the caller gets the same answer. */
export async function setAppStaff(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  appId: string,
  userIds: string[],
  leadUserId: string | null
): Promise<void> {
  const now = new Date().toISOString()
  const wanted = [...new Set(userIds)]
  // The lead has to be ON the app — a lead nobody staffed is a Done button
  // nobody can press (6.10), which is the failure this refuses out loud.
  if (leadUserId && !wanted.includes(leadUserId))
    throw new GuardError(400, "invalid_input", "The team lead has to be one of the people on this app.")
  const existing = await d1Query<{ id: string; user_id: string }>(
    cfg,
    guard.databaseId,
    `SELECT id, user_id FROM app_staff WHERE app_id = ? LIMIT ${LIST_HARD_CAP}`, // R14 hard cap
    [appId]
  )
  const known = new Map(existing.map((r) => [r.user_id, r.id]))
  // Off the app first, and the lead flag with them: a retired row that kept
  // is_lead = 1 would hold the one live lead slot against everybody else.
  await d1Query(
    cfg,
    guard.databaseId,
    `UPDATE app_staff SET is_lead = 0, deactivated_at = ?, deactivator_id = ?, deactivator_email = ?,
        deactivator_name = ?, ${editedBy(actor, now).sql}
      WHERE app_id = ? AND deactivated_at IS NULL${
        wanted.length ? ` AND user_id NOT IN (${wanted.map(() => "?").join(", ")})` : ""
      }`,
    [now, actor.id, actor.email, actor.name, ...editedBy(actor, now).params, appId, ...wanted]
  )
  for (const userId of wanted) {
    const rowId = known.get(userId)
    if (rowId)
      await d1Query(
        cfg,
        guard.databaseId,
        `UPDATE app_staff SET is_lead = 0, deactivated_at = NULL, deactivator_id = NULL,
            deactivator_email = NULL, deactivator_name = NULL, ${editedBy(actor, now).sql}
          WHERE id = ?`,
        [...editedBy(actor, now).params, rowId]
      )
    else
      await insertRow(cfg, guard, "app_staff", {
        id: ulid(),
        app_id: appId,
        user_id: userId,
        is_lead: 0,
        created_at: now,
        creator_id: actor.id,
        creator_email: actor.email,
        creator_name: actor.name,
      })
  }
  if (leadUserId)
    await d1Query(
      cfg,
      guard.databaseId,
      `UPDATE app_staff SET is_lead = 1, ${editedBy(actor, now).sql}
        WHERE app_id = ? AND user_id = ? AND deactivated_at IS NULL`,
      [...editedBy(actor, now).params, appId, leadUserId]
    )
  await logActivity(cfg, guard.databaseId, actor, {
    type: "App staffed",
    description: `${actor.name} set who is on this app, ${wanted.length} ${
      wanted.length === 1 ? "person" : "people"
    }${leadUserId ? ", with a team lead" : ""}`,
    relatedTable: "apps",
    relatedRowId: appId,
  })
}

/** THE CLIENT'S PEOPLE ON THIS APP, one of them the main one (8.5). The same
 * replace-the-whole-set shape as the staff above, over the client's contacts
 * instead of our own logins — and every id is proved to be an account inside the
 * caller's own fence before it is written, so a stakeholder from another
 * company's books is a refusal rather than a row. */
export async function setAppStakeholders(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  appId: string,
  contactIds: string[],
  mainContactId: string | null
): Promise<void> {
  const now = new Date().toISOString()
  const wanted = [...new Set(contactIds)]
  if (mainContactId && !wanted.includes(mainContactId))
    throw new GuardError(400, "invalid_input", "The main stakeholder has to be one of the people on this app.")
  // The ids were proved to be real accounts INSIDE THE CALLER'S FENCE by the
  // door, through lib/accounts.ts — the one file in this worker that writes SQL
  // against the customer spine. This file deliberately does not look them up
  // itself: two files reading `accounts` is two places to forget the stamp, and
  // workers/tenancy/test/account-leak.test.ts fails the build for exactly that.
  for (const id of wanted) requireAccountInScope(scope, id)
  const existing = await d1Query<{ id: string; contact_id: string }>(
    cfg,
    guard.databaseId,
    `SELECT id, contact_id FROM app_stakeholders WHERE app_id = ? LIMIT ${LIST_HARD_CAP}`, // R14 hard cap
    [appId]
  )
  const known = new Map(existing.map((r) => [r.contact_id, r.id]))
  await d1Query(
    cfg,
    guard.databaseId,
    `UPDATE app_stakeholders SET is_main = 0, deactivated_at = ?, deactivator_id = ?, deactivator_email = ?,
        deactivator_name = ?, ${editedBy(actor, now).sql}
      WHERE app_id = ? AND deactivated_at IS NULL${
        wanted.length ? ` AND contact_id NOT IN (${wanted.map(() => "?").join(", ")})` : ""
      }`,
    [now, actor.id, actor.email, actor.name, ...editedBy(actor, now).params, appId, ...wanted]
  )
  for (const contactId of wanted) {
    const rowId = known.get(contactId)
    if (rowId)
      await d1Query(
        cfg,
        guard.databaseId,
        `UPDATE app_stakeholders SET is_main = 0, deactivated_at = NULL, deactivator_id = NULL,
            deactivator_email = NULL, deactivator_name = NULL, ${editedBy(actor, now).sql}
          WHERE id = ?`,
        [...editedBy(actor, now).params, rowId]
      )
    else
      await insertRow(cfg, guard, "app_stakeholders", {
        id: ulid(),
        app_id: appId,
        contact_id: contactId,
        is_main: 0,
        created_at: now,
        creator_id: actor.id,
        creator_email: actor.email,
        creator_name: actor.name,
      })
  }
  if (mainContactId)
    await d1Query(
      cfg,
      guard.databaseId,
      `UPDATE app_stakeholders SET is_main = 1, ${editedBy(actor, now).sql}
        WHERE app_id = ? AND contact_id = ? AND deactivated_at IS NULL`,
      [...editedBy(actor, now).params, appId, mainContactId]
    )
  await logActivity(cfg, guard.databaseId, actor, {
    type: "App stakeholders set",
    description: `${actor.name} set the client's people on this app, ${wanted.length} named${
      mainContactId ? ", one of them the main one" : ""
    }`,
    relatedTable: "apps",
    relatedRowId: appId,
  })
}

/** THE APP'S MAIN STAKEHOLDER, or nothing (8.5 → 5.7). One row, read by the
 * ticket resolution email so the person told is the person who owns THAT system
 * rather than whoever the account named years ago. */
export async function mainStakeholderOf(
  cfg: D1Rest,
  guard: MemberGuard,
  appId: string
): Promise<string | null> {
  const rows = await d1Query<{ contact_id: string }>(
    cfg,
    guard.databaseId,
    // R14: at most one row can be live, by the partial unique index.
    `SELECT contact_id FROM app_stakeholders
      WHERE app_id = ? AND is_main = 1 AND deactivated_at IS NULL LIMIT 1`,
    [appId]
  )
  return rows[0]?.contact_id ?? null
}

/** IS AN HOURLY COST WITHHELD FROM THIS CALLER, ON THIS APP.
 *
 * `null` means no restriction — a staff caller, who sees everything. A SET means
 * a portal caller, and the rate rides only on the apps they are the main
 * stakeholder of.
 *
 * IT IS A FUNCTION AND NOT A LINE AT EACH READER because that is the mistake
 * this exists to correct. The rule shipped on 24 Aug 2026 in `listSavings`
 * alone, and the same field rode `listProcessSteps` and `mapAsOf` — both reached
 * through `getProcessDetail`, which FENCES a client login rather than refusing
 * one. So one response carried the redaction and the leak together: the saving's
 * steps had a null rate and the map's steps did not.
 *
 * An unknown app id withholds. A caller whose app cannot be identified is not a
 * caller whose rights can be proved. */
function withheldRate(visibleOn: Set<string> | null | undefined, appId: string | undefined): boolean {
  if (!visibleOn) return false
  return !appId || !visibleOn.has(appId)
}

/** THE APPS THIS PORTAL CALLER IS THE MAIN STAKEHOLDER OF.
 *
 * The owner's ruling, 24 Aug 2026, settling his disagreement with Aurora about
 * whether a client sees what their own people cost per hour:
 *
 *   "everybody from the Kwapso system can see this, but from the client portal
 *    site, the main stakeholder of that app could see it."
 *
 * Aurora said every contact; he said none. This is the answer that respects
 * both: the person who signed the contract can check our arithmetic, and nobody
 * else at their company learns a colleague's salary from a screen we built. His
 * own objection, in his words: "they could just get to know each other's salary,
 * given that we are having cost per hour on roles, so it's not advisable."
 *
 * A staff caller gets `null`, meaning "no restriction" — a wave of `undefined`
 * would read the same as "restricted to nothing", and this is the kind of
 * boolean where the two must not be confused.
 */
export async function mainStakeholderApps(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope
): Promise<Set<string> | null> {
  if (scope.kind !== "portal") return null
  const rows = await d1Query<{ app_id: string }>(
    cfg,
    guard.databaseId,
    // R14 hard cap — the apps of one client, and only the ones this contact is
    // named the main stakeholder of.
    `SELECT app_id FROM app_stakeholders
      WHERE contact_id = ? AND is_main = 1 AND deactivated_at IS NULL
      LIMIT ${LIST_HARD_CAP}`,
    [scope.personAccountId]
  )
  return new Set(rows.map((r) => r.app_id))
}

export async function createApp(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: {
    name: string
    accountId?: string
    url?: string
    stage?: string
    logoUrl?: string
    toolCostCentsPerMonth?: number
    about?: string
    clientContext?: string
    solution?: string
    keyActors?: string
  }
): Promise<string> {
  if (input.accountId) requireAccountInScope(scope, input.accountId)
  const id = ulid()
  await insertRow(cfg, guard, "apps", {
    id,
    account_id: input.accountId ?? null,
    name: input.name,
    url: input.url ?? null,
    stage: input.stage ?? null,
    logo_url: input.logoUrl ?? null,
    tool_cost_cents_per_month: input.toolCostCentsPerMonth ?? 0,
    about: input.about ?? null,
    client_context: input.clientContext ?? null,
    solution: input.solution ?? null,
    key_actors: input.keyActors ?? null,
    created_at: new Date().toISOString(),
    creator_id: actor.id,
    creator_email: actor.email,
    creator_name: actor.name,
  })
  await logActivity(cfg, guard.databaseId, actor, {
    type: "App created",
    description: `${actor.name} added the app "${input.name}"`,
    relatedTable: "apps",
    relatedRowId: id,
  })
  return id
}

/** Edit an app's own fields. NOT its account — see the migration for why there is
 * no move-app door. */
export async function updateApp(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  input: {
    name: string
    url?: string | null
    stage?: string | null
    logoUrl?: string | null
    toolCostCentsPerMonth?: number
    about?: string | null
    clientContext?: string | null
    solution?: string | null
    keyActors?: string | null
  }
): Promise<void> {
  const before = await appOrThrow(cfg, guard, scope, id)
  const fence = accountScopeClause(scope, "account_id")
  const audit = editedBy(actor, new Date().toISOString())
  // Absent means "say nothing", the patch rule this door already keeps for the
  // address and the stage — an edit that erased what it was not asked about is
  // the mistake the accounts door made once and nothing here repeats.
  const keep = <T,>(sent: T | undefined, existing: T): T => (sent === undefined ? existing : sent)
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE apps SET name = ?, url = ?, stage = ?, logo_url = ?, tool_cost_cents_per_month = ?,
            about = ?, client_context = ?, solution = ?, key_actors = ?, ${audit.sql}
     ${where([fence.sql, "id = ?"])} RETURNING id`,
    [
      input.name,
      keep(input.url, before.url),
      keep(input.stage, before.stage),
      keep(input.logoUrl, before.logoUrl),
      keep(input.toolCostCentsPerMonth, before.toolCost),
      keep(input.about, before.about),
      keep(input.clientContext, before.clientContext),
      keep(input.solution, before.solution),
      keep(input.keyActors, before.keyActors),
      ...audit.params,
      ...fence.params,
      id,
    ]
  )
  if (!changed[0]) throw new GuardError(404, "not_found", "That app doesn't exist.")
  // The four context fields are reported as CHANGED and never quoted: they are
  // paragraphs, and an activity line that pastes one is a feed nobody can read.
  const changes = describeChanges([
    { label: "Name", from: before.name, to: input.name },
    { label: "Address", from: before.url, to: keep(input.url, before.url) },
    { label: "Stage", from: before.stage, to: keep(input.stage, before.stage) },
    // The logo is reported as CHANGED and never quoted, for the same reason the
    // four paragraphs are: an activity line that pastes a media path is a feed
    // nobody can read.
    { label: "Logo", from: before.logoUrl, to: keep(input.logoUrl, before.logoUrl), hideValues: true },
    { label: "About", from: before.about, to: keep(input.about, before.about), hideValues: true },
    {
      label: "Client context",
      from: before.clientContext,
      to: keep(input.clientContext, before.clientContext),
      hideValues: true,
    },
    { label: "Solution", from: before.solution, to: keep(input.solution, before.solution), hideValues: true },
    { label: "Key actors", from: before.keyActors, to: keep(input.keyActors, before.keyActors), hideValues: true },
  ])
  await logActivity(cfg, guard.databaseId, actor, {
    type: "App edited",
    description: `${actor.name} edited ${input.name}${changes ? `, ${changes}` : ""}`,
    relatedTable: "apps",
    relatedRowId: id,
  })
}

/** Archive / restore an app (never delete — its processes, versions and the
 * savings computed from them all survive). R17: the current-status predicate
 * rides the UPDATE, so a double-clicked Archive moves zero rows the second time. */
export async function setAppActive(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  active: boolean
): Promise<boolean> {
  const app = await appOrThrow(cfg, guard, scope, id)
  const fence = accountScopeClause(scope, "account_id")
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    active
      ? `UPDATE apps SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL,
           deactivator_name = NULL, updated_at = ?
         ${where([fence.sql, "id = ?", "deactivated_at IS NOT NULL"])} RETURNING id`
      : `UPDATE apps SET deactivated_at = ?, deactivator_id = ?, deactivator_email = ?,
           deactivator_name = ?, updated_at = ?
         ${where([fence.sql, "id = ?", "deactivated_at IS NULL"])} RETURNING id`,
    active ? [now, ...fence.params, id] : [now, actor.id, actor.email, actor.name, now, ...fence.params, id]
  )
  if (!changed[0]) return false
  await logActivity(cfg, guard.databaseId, actor, {
    type: active ? "App restored" : "App archived",
    description: `${actor.name} ${active ? "restored" : "archived"} ${app.name}`,
    relatedTable: "apps",
    relatedRowId: id,
  })
  return true
}

// ── processes ────────────────────────────────────────────────────────────────

/** WHAT A CALLER MAY NARROW a processes read to — the fence plus the two filters,
 * built ONCE so the paged list and any other reader can never disagree about what
 * a filter means. */
// ── modules ──────────────────────────────────────────────────────────────────
//
// A MODULE IS A SECTION OF AN APP, and this is every statement written against
// `app_modules`. The fence is the app's: a module has no account of its own to
// be reasoned about separately, so `account_id` is denormalised off the app at
// creation exactly as `processes` does it, and every read below ANDs the same
// one clause. See the migration (0048_app_modules) for why it is a table rather
// than a dropdown group.

/** The one WHERE every module read shares — the account fence, the app, and
 * whether archived rows are in. Written once so the rows and the count over them
 * cannot answer differently. */
function appModulesWhere(
  scope: AccountScope,
  opts: { id?: string; appId?: string; archived?: string }
): { sql: string; params: (string | number)[] } {
  const fence = accountScopeClause(scope, "m.account_id")
  const parts: (string | undefined)[] = [fence.sql]
  const params: (string | number)[] = [...fence.params]
  // ONE ROW BY ID — the live layer's re-pull after a ping, through the same door
  // and therefore the same fence (the shape /api/tenancy/selectable uses).
  if (opts.id) {
    parts.push("m.id = ?")
    params.push(opts.id)
  }
  if (opts.appId) {
    parts.push("m.app_id = ?")
    params.push(opts.appId)
  }
  // ARCHIVED IS OUT UNLESS ASKED FOR. A picker must never offer a section that
  // was switched off, and the tickets already filed against it keep pointing at
  // it — which is the whole reason a module is deactivated and never deleted.
  if (opts.archived !== "all") parts.push("m.deactivated_at IS NULL")
  return { sql: where(parts), params }
}

export async function countAppModules(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  opts: { id?: string; appId?: string; archived?: string } = {}
): Promise<number> {
  const { sql, params } = appModulesWhere(scope, opts)
  return countCollection(
    cfg,
    guard.databaseId,
    `SELECT 1 FROM app_modules m JOIN apps a ON a.id = m.app_id${sql}`,
    params
  )
}

/** THE SECTIONS OF AN APP — or of every app, when no `appId` narrows it.
 * Alphabetical, capped at APP_MODULE_CAP (R14 — a bounded read, and the cap is
 * said in limits.ts beside the number: 1,000, four times the agency's whole
 * history). Not paged, because this collection does not grow with USE — it is
 * the shape of the software we have built, and it moves only when we build more.
 *
 * THE WHOLE TEAM'S IS THE ORDINARY READ, and the narrowing is the exception. A
 * ticket form needs whichever app was just chosen, and asking the server again
 * on every change of a dropdown is a spinner where a list should be — so the
 * screens hold all of them and narrow locally.
 *
 * ALPHABETICAL AND NOT NEWEST-FIRST, which is the opposite of every other list
 * in this file. The difference is what the list is FOR: a person reads a process
 * list to see what has been happening, and reads a module list to FIND ONE in a
 * picker. Newest-first is a stream; a picker is an index. */
export async function listAppModules(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  opts: { id?: string; appId?: string; archived?: string } = {}
): Promise<AppModule[]> {
  const { sql, params } = appModulesWhere(scope, opts)
  const rows = await d1Query<{
    id: string
    app_id: string
    app_name: string
    account_id: string | null
    name: string
    mark: string | null
    name_de: string | null
    description: string | null
    benefit: string | null
    deactivated_at: string | null
    created_at: string
    ticket_count: number
  }>(
    cfg,
    guard.databaseId,
    `SELECT m.id, m.app_id, a.name AS app_name, m.account_id, m.name, m.mark, m.name_de,
            m.description, m.benefit, m.deactivated_at, m.created_at,
            (SELECT COUNT(*) FROM help h WHERE h.module_id = m.id AND h.resolved = 0) AS ticket_count
       FROM app_modules m JOIN apps a ON a.id = m.app_id${sql}
      ORDER BY m.name COLLATE NOCASE ASC LIMIT ${APP_MODULE_CAP}`,
    params
  )
  return rows.map((r) => ({
    id: r.id,
    appId: r.app_id,
    appName: r.app_name,
    accountId: r.account_id,
    name: r.name,
    mark: r.mark,
    nameDe: r.name_de,
    description: r.description,
    benefit: r.benefit,
    ticketCount: r.ticket_count,
    active: r.deactivated_at == null,
    createdAt: r.created_at,
  }))
}

/** One module inside the caller's fence, or a 404 identical to a made-up id. */
async function moduleOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  id: string
): Promise<{ id: string; appId: string; name: string; mark: string | null; nameDe: string | null; description: string | null; benefit: string | null }> {
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{
    id: string
    app_id: string
    name: string
    mark: string | null
    name_de: string | null
    description: string | null
    benefit: string | null
  }>(
    cfg,
    guard.databaseId,
    `SELECT id, app_id, name, mark, name_de, description, benefit FROM app_modules${where([fence.sql, "id = ?"])}`,
    [...fence.params, id]
  )
  const row = rows[0]
  if (!row) throw new GuardError(404, "not_found", "That module doesn't exist.")
  return {
    id: row.id,
    appId: row.app_id,
    name: row.name,
    mark: row.mark,
    nameDe: row.name_de,
    description: row.description,
    benefit: row.benefit,
  }
}

/** Add a section to an app.
 *
 * THE DUPLICATE IS REFUSED BY THE INDEX, not by a read-then-write: two people
 * naming a module "Settings" at the same moment is exactly the race a SELECT
 * first loses, and `idx_app_modules_name` is unique over ACTIVE rows of one app.
 * A clash comes back as the sentence a person can act on rather than a 500. */
export async function createAppModule(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { appId: string; name: string; mark?: string | null; nameDe?: string | null; description?: string | null; benefit?: string | null }
): Promise<string> {
  const app = await appOrThrow(cfg, guard, scope, input.appId)
  const id = ulid()
  const now = new Date().toISOString()
  try {
    await insertRow(cfg, guard, "app_modules", {
      id,
      app_id: input.appId,
      account_id: app.accountId,
      name: input.name,
      mark: input.mark ?? null,
      name_de: input.nameDe ?? null,
      description: input.description ?? null,
      benefit: input.benefit ?? null,
      created_at: now,
      creator_id: actor.id,
      creator_email: actor.email,
      creator_name: actor.name,
    })
  } catch (err) {
    if (String(err).includes("UNIQUE"))
      throw new GuardError(409, "duplicate", `${app.name} already has a module called "${input.name}".`)
    throw err
  }
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Module created",
    description: `${actor.name} added the module "${input.name}" to ${app.name}`,
    relatedTable: "app_modules",
    relatedRowId: id,
  })
  return id
}

/** Rename or re-describe a module.
 *
 * A RENAME REACHES EVERY TICKET FOR FREE, and that is the whole reason a ticket
 * stores `module_id` rather than the word. Every other vocabulary in this app
 * stores the WORD on the record and needs `VOCABULARY_HOMES` to rewrite them on
 * rename (shared/selectable-homes.ts argues why, and 107 tickets are the reason
 * it exists). A module had no CSV column, no filter contract and no MCP argument
 * to break, so it could afford the join the note there calls out of reach. */
export async function updateAppModule(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  input: { name: string; mark?: string | null; nameDe?: string | null; description?: string | null; benefit?: string | null }
): Promise<void> {
  const before = await moduleOrThrow(cfg, guard, scope, id)
  const fence = accountScopeClause(scope, "account_id")
  const audit = editedBy(actor, new Date().toISOString())
  // ABSENT MEANS "SAY NOTHING", the patch rule every other door in this file
  // keeps — so a picker that sends only a name cannot silently erase an emoji.
  const mark = input.mark === undefined ? before.mark : input.mark
  const nameDe = input.nameDe === undefined ? before.nameDe : input.nameDe
  const description = input.description === undefined ? before.description : input.description
  const benefit = input.benefit === undefined ? before.benefit : input.benefit
  let changed: { id: string }[]
  try {
    changed = await d1Query<{ id: string }>(
      cfg,
      guard.databaseId,
      `UPDATE app_modules SET name = ?, mark = ?, name_de = ?, description = ?, benefit = ?, ${audit.sql}
       ${where([fence.sql, "id = ?"])} RETURNING id`,
      [input.name, mark, nameDe, description, benefit, ...audit.params, ...fence.params, id]
    )
  } catch (err) {
    if (String(err).includes("UNIQUE"))
      throw new GuardError(409, "duplicate", `That app already has a module called "${input.name}".`)
    throw err
  }
  if (!changed[0]) throw new GuardError(404, "not_found", "That module doesn't exist.")
  const changes = describeChanges([
    { label: "Name", from: before.name, to: input.name },
    { label: "Emoji", from: before.mark, to: mark },
    { label: "German name", from: before.nameDe, to: nameDe },
    { label: "Description", from: before.description, to: description, hideValues: true },
    { label: "Benefit", from: before.benefit, to: benefit, hideValues: true },
  ])
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Module edited",
    description: `${actor.name} edited ${input.name}${changes ? `, ${changes}` : ""}`,
    relatedTable: "app_modules",
    relatedRowId: id,
  })
}

/** Switch a module off, or back on. R17: the current-status predicate rides the
 * UPDATE, so a second press moves zero rows and writes no activity and pings
 * nobody.
 *
 * THE TICKETS KEEP POINTING AT IT. Deactivating a section does not orphan two
 * years of tickets — they still name it, it still reads correctly on every one
 * of them, and it simply stops being offered on the form. That is the whole
 * difference between deactivate and delete, and the reason the unique index is
 * over ACTIVE rows only: the name is free to be used again. */
export async function setAppModuleActive(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  active: boolean
): Promise<boolean> {
  const mod = await moduleOrThrow(cfg, guard, scope, id)
  const fence = accountScopeClause(scope, "account_id")
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    active
      ? `UPDATE app_modules SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL,
           deactivator_name = NULL, updated_at = ?
         ${where([fence.sql, "id = ?", "deactivated_at IS NOT NULL"])} RETURNING id`
      : `UPDATE app_modules SET deactivated_at = ?, deactivator_id = ?, deactivator_email = ?,
           deactivator_name = ?, updated_at = ?
         ${where([fence.sql, "id = ?", "deactivated_at IS NULL"])} RETURNING id`,
    active ? [now, ...fence.params, id] : [now, actor.id, actor.email, actor.name, now, ...fence.params, id]
  )
  if (!changed[0]) return false
  await logActivity(cfg, guard.databaseId, actor, {
    type: active ? "Module restored" : "Module switched off",
    description: `${actor.name} ${active ? "switched on" : "switched off"} the module ${mod.name}`,
    relatedTable: "app_modules",
    relatedRowId: id,
  })
  return true
}

// ── processes ────────────────────────────────────────────────────────────────

export type ProcessFilters = { q?: string; appId?: string; archived?: string }

function processesWhere(scope: AccountScope, opts: ProcessFilters): { sql: string; params: string[] } {
  const fence = accountScopeClause(scope, "p.account_id")
    // AND THE APP FENCE (SCOPE ch.03 "per-person restriction"). A client login
    // may be narrowed to named apps; a staff caller and an unrestricted client
    // both get an empty clause, so this changes nothing for either. It is an AND
    // beside the account fence and never instead of it — see appScopeClause.
  const apps = appScopeClause(scope, "p.app_id")
  const filters: string[] = apps.sql ? [apps.sql] : []
  const params: string[] = [...fence.params, ...apps.params]
  if (opts.q) {
    // ESCAPED — `%` and `_` are LIKE's own wildcards, so an unescaped needle
    // answers a different question than the one typed, and a pattern of nothing
    // but `%` costs the worker exponential time over the whole table. The
    // backslash goes first or it would escape the escapes.
    filters.push("(p.name LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')")
    const like = `%${likeLiteral(opts.q)}%`
    params.push(like, like)
  }
  if (opts.appId) {
    filters.push("p.app_id = ?")
    params.push(opts.appId)
  }
  // PUT AWAY, OR STILL IN USE. A map is archived and never deleted (the savings
  // computed from its baseline have to stay checkable years later), so the
  // put-away ones accumulate in the same list as the live ones. Two words, an
  // ALLOW-LIST rather than a boolean because this arrives off a query string
  // where `"false"` is truthy — and matched against literals here, so what
  // reaches the statement is our SQL and never the caller's text.
  if (opts.archived === "yes") filters.push("p.deactivated_at IS NOT NULL")
  if (opts.archived === "no") filters.push("p.deactivated_at IS NULL")
  return { sql: where([fence.sql, ...filters]), params }
}

/** R16 (amended): the exact server total behind a process-map badge — the SAME
 * WHERE and the SAME join the page uses, counted exactly to TOTAL_COUNT_CAP
 * through the one bounded seam and reported as "at least" beyond it, because
 * `processes` GROWS with ordinary use.
 *
 * Apart from the list for the reason the whole of shared/record-counts.ts
 * exists: an app's Process maps tab is badged when the record opens, and pulling
 * a page of maps to learn how many there are is what the eager count replaces. */
export async function countProcesses(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  opts: ProcessFilters = {}
): Promise<number> {
  const { sql, params } = processesWhere(scope, opts)
  return countCollection(
    cfg,
    guard.databaseId,
    `SELECT 1 FROM processes p JOIN apps a ON a.id = p.app_id${sql}`,
    params
  )
}

/** One process, as the list reads it off the join. Named rather than inline
 * because PROCESS_SORTS reads the same row: a menu entry pairs its SQL with the
 * field that mirrors it, and it can only do that if the field has a type. */
type ProcessListRow = {
  id: string
  app_id: string
  app_name: string
  account_id: string | null
  name: string
  description: string | null
  role_name: string | null
  role_id: string | null
  audit_date: string | null
  deactivated_at: string | null
  created_at: string
  version_count: number
  step_count: number
}

/** WHAT THE PROCESS LIST MAY BE ORDERED BY (shared/workers/sorting.ts). Four
 * names, each a column already on the row in front of whoever asked: the map's
 * own name, the app it hangs off, when it was written down, and how many steps
 * it has — which is the one an agency actually asks for ("which of these is the
 * monster?"). `created` is the fallback, because newest-first is the order this
 * list has always been in. */
export const PROCESS_SORTS: SortMenu<ProcessListRow> = {
  created: { expr: "p.created_at", dir: "desc", key: (r) => r.created_at },
  name: { expr: "p.name", dir: "asc", key: (r) => r.name },
  app: { expr: "a.name", dir: "asc", key: (r) => r.app_name },
  // A COUNT is a number, and the cursor's key is text — so the position is
  // zero-padded on both sides (`printf` in SQL, `padStart` off the row) and the
  // comparison stays the one the ORDER BY made. Sorting "10" before "9" is the
  // classic version of the bug this whole lane is about; doing it in the KEYSET
  // is the version that silently drops rows instead of misplacing them.
  steps: {
    expr: `printf('%08d', (SELECT COUNT(*) FROM process_steps s WHERE s.process_id = p.id
             AND s.version_id = (SELECT id FROM process_versions v2 WHERE v2.process_id = p.id
                                  ORDER BY v2.version_no DESC LIMIT 1)))`,
    dir: "desc",
    key: (r) => String(r.step_count ?? 0).padStart(8, "0"),
  },
}

/** The team's processes, newest first, PAGED by key.
 *
 * R14: processes GROW with ordinary use — every app of every client grows a map,
 * and a map grows a process each time somebody describes another way of working
 * — so this door answers with a cursor rather than a ceiling. `processes` is a
 * GROWING_COLLECTIONS row in shared/rules/registry.ts, which also holds the check
 * to a client that can actually reach page two. */
export async function listProcesses(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  opts: ProcessFilters & { cursor?: string | null; ordering?: Ordering<ProcessListRow> } = {}
): Promise<Page<ProcessSummary> & { total: number }> {
  const { sql: base, params } = processesWhere(scope, opts)
  // The ORDER BY, the keyset predicate and the next cursor's key all come off
  // ONE ordering, so a sort cannot reach the rows and miss the cursor.
  const ordering = opts.ordering ?? resolveOrdering(PROCESS_SORTS, "created", undefined, undefined)
  const after = keysetAfter(decodeCursor(opts.cursor, ordering.sig), ordering.expr, ordering.dir, "p.id")
  const pageWhere = after.sql ? `${base ? `${base} AND` : " WHERE"} ${after.sql}` : base

  const [rows, counted] = await Promise.all([
    // PAGE_SIZE + 1 is how hasMore is known without a second query.
    d1Query<ProcessListRow>(
      cfg,
      guard.databaseId,
      `SELECT p.id, p.app_id, a.name AS app_name, p.account_id, p.name, p.description, p.role_name, p.role_id, p.audit_date,
              p.deactivated_at, p.created_at,
              (SELECT COUNT(*) FROM process_versions v WHERE v.process_id = p.id) AS version_count,
              (SELECT COUNT(*) FROM process_steps s WHERE s.process_id = p.id
                 AND s.version_id = (SELECT id FROM process_versions v2 WHERE v2.process_id = p.id
                                      ORDER BY v2.version_no DESC LIMIT 1)) AS step_count
         FROM processes p JOIN apps a ON a.id = p.app_id${pageWhere}
        ${orderBy(ordering, "p.id")} LIMIT ${PAGE_SIZE + 1}`,
      [...params, ...after.params]
    ),
    // R16 (amended): the total behind the page — the SAME WHERE and the SAME
    // join, so a badge can never count rows the list withholds — counted exactly
    // to TOTAL_COUNT_CAP and "at least" beyond it. ONE expression, shared with
    // the eager badge above.
    countProcesses(cfg, guard, scope, opts),
  ])

  const page = toPage(rows, PAGE_SIZE, (r) => [ordering.key(r), r.id], ordering.sig)
  return {
    ...page,
    rows: page.rows.map((r) => ({
      id: r.id,
      appId: r.app_id,
      appName: r.app_name,
      accountId: r.account_id,
      name: r.name,
      description: r.description,
      roleName: r.role_name,
      roleId: r.role_id,
      auditDate: r.audit_date,
      versionCount: r.version_count,
      stepCount: r.step_count,
      active: r.deactivated_at == null,
      createdAt: r.created_at,
    })),
    total: counted,
  }
}

/** One process opened: its versions, the steps of ONE of them, the exact counts
 * its tabs are badged with (R16 — never `rows.length`, which is a capped read's
 * ceiling wearing a total's clothes), and the subtraction the whole map exists
 * to produce. Outside the fence it is a 404, identical to a made-up id.
 *
 * `versionId` IS THE ANSWER TO "I CAN'T SEE THE OLD VERSION" (tester L4, 17 Aug
 * 2026). It defaults to the latest — the answer this door has always given — and
 * naming an older one returns THAT version's steps, with their times as they
 * were agreed. A version id belonging to another map is a 404 rather than an
 * empty list: an empty list reads as "this version had no steps", which is a
 * different and much worse sentence than "no such version".
 *
 * `saving` comes back through `listSavings` rather than being computed here, and
 * that is the point of the round trip. It is the SAME statement and the SAME
 * pure function the value screen and the client's portal read, so the figure on
 * this screen cannot disagree with the one a client is looking at. A second
 * implementation of the subtraction — even a correct-looking one — is exactly
 * how "the numbers stop being believable" starts. `null` when the map is
 * archived: an archived map is out of the value picture by construction (the
 * savings read excludes it), and reporting a figure for it would contradict the
 * value screen on the same page. */
export async function getProcess(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  id: string,
  opts: { versionId?: string; asOf?: string } = {}
): Promise<ProcessDetail> {
  const summary = await processOrThrow(cfg, guard, scope, id)
  const auditDate = summary.auditDate ?? summary.createdAt.slice(0, 10)
  const shown = await versionOrThrow(cfg, guard, scope, id, opts.versionId)
  // WHO MAY SEE AN HOURLY COST ON THIS MAP, resolved ONCE and handed to every
  // reader on this screen. Resolving it per reader is what let the rule ship in
  // `listSavings` alone while the same field rode two other readers in the same
  // payload (25 Aug 2026).
  const rateVisibleOn = await mainStakeholderApps(cfg, guard, scope)
  const [versions, liveSteps, shownStepCount, commentsTotal, savings, dates, links] = await Promise.all([
    listProcessVersions(cfg, guard, scope, id),
    listProcessSteps(cfg, guard, scope, id, shown.id, rateVisibleOn, summary.appId),
    countVersionSteps(cfg, guard, scope, shown.id),
    countProcessComments(cfg, guard, scope, id),
    listSavings(cfg, guard, scope, { processId: id }),
    revisionDates(cfg, guard, scope, id),
    listProcessLinks(cfg, guard, scope, id),
  ])
  // THE SLIDER. `asOf` is a DAY, and it reads the dated history rather than the
  // live rows — which is what makes moving it show the client's business as it
  // was rather than as it is. Without it the screen shows the live map, which is
  // the same thing as "as of today" and is worth one fewer read.
  const steps = opts.asOf
    ? await mapAsOf(cfg, guard, scope, id, opts.asOf, rateVisibleOn, summary.appId)
    : liveSteps
  return {
    process: summary,
    versions,
    steps,
    shownVersionId: shown.id,
    shownStepCount,
    commentsTotal,
    saving: savings.apps[0]?.processes[0] ?? null,
    savingsCaption: savings.caption,
    auditDate,
    asOf: opts.asOf ?? null,
    // EVERY DAY THIS MAP CHANGED, plus the audit date itself. A slider whose
    // stops are the days something happened spends none of its travel on days
    // nothing did — and the audit date has to be reachable even when no step
    // changed on it, because it is the day every figure is measured from.
    revisionDates: [...new Set([auditDate, ...dates])].sort(),
    links,
  }
}

/** Every version of one process, newest first. BOUNDED: a version is cut once per
 * completed sprint, so this is a handful of rows for years of work. */
export async function listProcessVersions(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  processId: string
): Promise<ProcessVersion[]> {
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{
    id: string
    version_no: number
    label: string | null
    created_at: string
    creator_name: string | null
  }>(
    cfg,
    guard.databaseId,
    // R14 hard cap — a version list is bounded by how many sprints have completed.
    `SELECT id, version_no, label, created_at, creator_name
       FROM process_versions${where([fence.sql, "process_id = ?"])}
      ORDER BY version_no DESC LIMIT ${LIST_HARD_CAP}`,
    [...fence.params, processId]
  )
  return rows.map((r) => ({
    id: r.id,
    processId,
    versionNo: r.version_no,
    label: r.label,
    // v1 IS the baseline, always — it is written with the process itself and the
    // unique index on (process_id, version_no) means there can never be a second.
    isBaseline: r.version_no === 1,
    createdAt: r.created_at,
    createdByName: scope.kind === "portal" ? null : r.creator_name,
  }))
}

/** The steps of ONE version of a process — the latest by default (what the work
 * looks like today), or a named older one (what it looked like when that version
 * was cut).
 *
 * THE ORDER IS THE FEATURE, not a detail of the read. A reader who cannot tell
 * what follows what cannot check the arithmetic underneath it, and the times on
 * these steps are what a client's savings figure is a subtraction between.
 *
 * `position` decides; `created_at` then `id` settle a tie. Name was the old
 * settler, and it sorted "Chase the paperwork" above "Collect the documents"
 * whenever two positions matched — an alphabetical list wearing a sequence's
 * clothes, which is worse than an arbitrary one because it looks deliberate.
 * The id is there to make the order TOTAL rather than to say anything about
 * time: it is unique, so two reads of the same rows always come back the same
 * way round. (Within one millisecond the data holds no order to recover — a
 * ULID's second half is random — and that is honest: nothing wrote one down.) */
export async function listProcessSteps(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  processId: string,
  versionId?: string,
  rateVisibleOn?: Set<string> | null,
  appId?: string
): Promise<ProcessStep[]> {
  const fence = accountScopeClause(scope, "s.account_id")
  // WHICH VERSION, said once — the one asked for, or the newest.
  const versionSql = versionId
    ? "?"
    : "(SELECT id FROM process_versions v WHERE v.process_id = ? ORDER BY v.version_no DESC LIMIT 1)"
  const versionParam = versionId ?? processId

  const rows = await d1Query<{
    id: string
    version_id: string
    step_key: string
    name: string
    description: string | null
    position: number
    seconds_per_run: number
    runs_per_month: number
    frequency_period: string
    removed_at: string | null
    client_role_id: string | null
    role_name: string | null
    role_cents_per_hour: number | null
    client_tool_id: string | null
    tool_name: string | null
    tool_mark: string | null
    branch_label: string | null
    loops_back_to: string | null
  }>(
    cfg,
    guard.databaseId,
    // R14 hard cap — the steps of ONE version of ONE process. A map a person can
    // read is tens of steps; the cap is the honest refusal past that.
    //
    // THE ROLE AND THE TOOL RIDE THE JOIN rather than being looked up per step,
    // and the role's cost comes off the STEP rather than off the role: it was
    // frozen at write time, so a rate corrected later cannot move a figure a
    // client already agreed. Both LEFT JOINs, because a step with neither named
    // is ordinary and must still be listed.
    `SELECT s.id, s.version_id, s.step_key, s.name, s.description, s.position,
            s.seconds_per_run, s.runs_per_month, s.frequency_period, s.removed_at,
            s.client_role_id, r.name AS role_name, s.role_cents_per_hour,
            s.client_tool_id, t.name AS tool_name, t.mark AS tool_mark,
            s.branch_label, s.loops_back_to, s.account_id
       FROM process_steps s
       LEFT JOIN client_roles r ON r.id = s.client_role_id
       LEFT JOIN client_tools t ON t.id = s.client_tool_id
      ${where([fence.sql, "s.process_id = ?", `s.version_id = ${versionSql}`])}
      ORDER BY s.position ASC, s.created_at ASC, s.id ASC LIMIT ${LIST_HARD_CAP}`,
    [...fence.params, processId, versionParam]
  )

  return rows.map((r) => ({
    id: r.id,
    processId,
    versionId: r.version_id,
    stepKey: r.step_key,
    name: r.name,
    description: r.description,
    position: r.position,
    secondsPerRun: r.seconds_per_run,
    // `runs_per_month` HOLDS THE COUNT IN ITS OWN PERIOD, and the column keeps
    // its old name because this codebase does not rename a column that thousands
    // of rows already sit in. The pair (count, period) is the fact; the monthly
    // figure is derived, once, where every other conversion happens.
    runsPerPeriod: r.runs_per_month,
    frequencyPeriod: (r.frequency_period as ProcessStep["frequencyPeriod"]) ?? "month",
    runsPerMonth: runsPerMonthFrom(r.runs_per_month, r.frequency_period ?? "month"),
    removed: r.removed_at != null,
    roleId: r.client_role_id,
    roleName: r.role_name,
    // FROZEN, off the step. See the note on the column.
    roleCentsPerHour: withheldRate(rateVisibleOn, appId) ? null : r.role_cents_per_hour,
    toolId: r.client_tool_id,
    toolName: r.tool_name,
    toolMark: r.tool_mark,
    branchLabel: r.branch_label,
    loopsBackTo: r.loops_back_to,
  }))
}

/** R16 — the exact server total behind the Steps tab, for the version being
 * SHOWN. It has to move with the version selector: a badge counting today's
 * steps over a list showing version 1's is the quietly-wrong number R16 exists
 * to prevent, and on this screen it would be quietly wrong about the arithmetic
 * a client is reading.
 *
 * A PLAIN `COUNT(*)`, not the bounded seam in shared/workers/count.ts, and that
 * is the seam's own instruction rather than a shortcut past it: it is scoped to
 * GROWING_COLLECTIONS on purpose, because a bounded collection already has a
 * ceiling and wrapping one "would be ceremony". The steps of ONE version of ONE
 * map are bounded by what a person can read — the same reason `listProcessSteps`
 * above takes a hard cap rather than a cursor. */
export async function countVersionSteps(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  versionId: string
): Promise<number> {
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM process_steps${where([fence.sql, "version_id = ?"])}`,
    [...fence.params, versionId]
  )
  return rows[0]?.n ?? 0
}

/** Create a process AND its baseline. The two are one act, deliberately: a
 * process with no version 1 can never produce a saving and would report zero for
 * ever while looking perfectly healthy. `baselineLabel` is what the client calls
 * the way they worked before us. */
export async function createProcess(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: {
    appId: string
    name: string
    description?: string
    baselineLabel?: string
    /** WHOSE HOURS THIS TAKES (8.13) — the role the saving is priced in.
     * It is on the CREATE now, not only the edit: the form has asked "who
     * does it" since the role rate card shipped, and this door dropped the
     * answer on the floor. So every process ever mapped was born with no
     * role, and a process with no role has no rate, and an app whose
     * processes have no rate reports its hours and 0.00 for the money —
     * which is exactly what the owner opened the Value tab and saw. */
    roleName?: string
  }
): Promise<string> {
  const app = await appOrThrow(cfg, guard, scope, input.appId)
  const id = ulid()
  const now = new Date().toISOString()
  await insertRow(cfg, guard, "processes", {
    id,
    app_id: input.appId,
    account_id: app.accountId,
    name: input.name,
    description: input.description ?? null,
    role_name: input.roleName ?? null,
    created_at: now,
    creator_id: actor.id,
    creator_email: actor.email,
    creator_name: actor.name,
  })
  await insertRow(cfg, guard, "process_versions", {
    id: ulid(),
    process_id: id,
    account_id: app.accountId,
    version_no: 1,
    label: input.baselineLabel ?? "How it worked before",
    created_at: now,
    creator_id: actor.id,
    creator_email: actor.email,
    creator_name: actor.name,
  })
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Process created",
    description: `${actor.name} mapped the process "${input.name}" on ${app.name}`,
    relatedTable: "processes",
    relatedRowId: id,
  })
  return id
}

export async function updateProcess(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  input: { name: string; description?: string | null; roleName?: string | null }
): Promise<void> {
  const before = await processOrThrow(cfg, guard, scope, id)
  const fence = accountScopeClause(scope, "account_id")
  const audit = editedBy(actor, new Date().toISOString())
  const description = input.description === undefined ? before.description : input.description
  // WHO DOES THIS WORK (CHECKLIST 8.13). Absent means "say nothing", the same
  // patch rule every other field on this door keeps. The word itself is not
  // checked against the rate card: naming a role nobody has priced is a legal,
  // useful answer — the app's money figure reports its hours and says the
  // process could not be priced, which is the honest half-answer.
  const roleName = input.roleName === undefined ? before.roleName : input.roleName
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE processes SET name = ?, description = ?, role_name = ?, ${audit.sql}
     ${where([fence.sql, "id = ?"])} RETURNING id`,
    [input.name, description, roleName, ...audit.params, ...fence.params, id]
  )
  if (!changed[0]) throw new GuardError(404, "not_found", "That process doesn't exist.")
  const changes = describeChanges([
    { label: "Name", from: before.name, to: input.name },
    { label: "Description", from: before.description, to: description, hideValues: true },
    { label: "Who does it", from: before.roleName, to: roleName },
  ])
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Process edited",
    description: `${actor.name} edited ${input.name}${changes ? `, ${changes}` : ""}`,
    relatedTable: "processes",
    relatedRowId: id,
  })
}

/** Archive / restore a process. R17 predicate; zero rows moved = silence. */
export async function setProcessActive(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  active: boolean
): Promise<boolean> {
  const process = await processOrThrow(cfg, guard, scope, id)
  const fence = accountScopeClause(scope, "account_id")
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    active
      ? `UPDATE processes SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL,
           deactivator_name = NULL, updated_at = ?
         ${where([fence.sql, "id = ?", "deactivated_at IS NOT NULL"])} RETURNING id`
      : `UPDATE processes SET deactivated_at = ?, deactivator_id = ?, deactivator_email = ?,
           deactivator_name = ?, updated_at = ?
         ${where([fence.sql, "id = ?", "deactivated_at IS NULL"])} RETURNING id`,
    active ? [now, ...fence.params, id] : [now, actor.id, actor.email, actor.name, now, ...fence.params, id]
  )
  if (!changed[0]) return false
  await logActivity(cfg, guard.databaseId, actor, {
    type: active ? "Process restored" : "Process archived",
    description: `${actor.name} ${active ? "restored" : "archived"} the process ${process.name}`,
    relatedTable: "processes",
    relatedRowId: id,
  })
  return true
}

// ── steps ────────────────────────────────────────────────────────────────────

/** Add a step to a process's LATEST version. A new step gets a fresh `step_key`,
 * which is the identity every later version will carry it forward under.
 *
 * WITH NO POSITION GIVEN IT GOES ON THE END, and that is a fix rather than a
 * preference. The default was `0`, and `0` sorts FIRST — so every step added
 * from the app landed above the whole map, and a reader watching a sequence
 * build up saw it grow backwards. (The seeded maps set an explicit position and
 * looked fine, which is why it survived: the only steps that misbehaved were the
 * ones a person typed.) A tie is harmless — two concurrent adds may land on the
 * same number and the read's `created_at` tie-break settles them — so this needs
 * no lock; it is a display order, not an invariant. */
/** A ROLE ON A STEP MUST BE THE SAME CLIENT'S ROLE.
 *
 * The account fence stops a caller reaching another client's rows; it does not
 * stop them WRITING one client's role id onto another client's step, because
 * both ends are inside the fence when the caller can see both clients — which
 * every staff member can. That would price Bergman's work at Confia's rates and
 * be invisible afterwards, since the map only ever displays the role's name.
 *
 * So the pairing is checked, not just the reach. A map with no client cannot
 * carry a role at all: a role belongs to a client, and there is no client here
 * to own one. */
async function roleInScopeOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  roleId: string,
  accountId: string | null
): Promise<{ name: string; cents_per_hour: number | null }> {
  if (!accountId)
    throw new GuardError(
      400,
      "no_client",
      "This map isn't filed under a client yet, so it has nobody's roles to choose from."
    )
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{ name: string; cents_per_hour: number | null }>(
    cfg,
    guard.databaseId,
    `SELECT name, cents_per_hour FROM client_roles
      ${where([fence.sql, "id = ?", "account_id = ?", "deactivated_at IS NULL"])} LIMIT 1`,
    [...fence.params, roleId, accountId]
  )
  if (!rows[0])
    throw new GuardError(404, "role_not_found", "That role isn't one of this client's live roles.")
  return rows[0]
}

/** The role's hourly cost, checked into scope on the way — what gets FROZEN onto
 * a step. Null is a real answer ("nobody has said yet") and is deliberately not
 * zero, which would read as "this person is free". */
async function roleCostOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  roleId: string,
  accountId: string | null
): Promise<number | null> {
  return (await roleInScopeOrThrow(cfg, guard, scope, roleId, accountId)).cents_per_hour
}

/** ONE OF FOUR WORDS, checked at the boundary rather than trusted. An unknown
 * period would silently convert as "month" and quietly divide a daily step's
 * frequency by thirty. */
function frequencyPeriodOrThrow(period: string | undefined): string {
  if (period === undefined) return "month"
  if (!PERIODS.includes(period as (typeof PERIODS)[number]))
    throw new GuardError(400, "invalid_input", "How often it happens must be per day, week, month or year.")
  return period
}

/** WHAT A STEP IS DONE IN — the WHOLE set, every time.
 *
 * It takes the complete list rather than an add and a remove, which is the same
 * shape `setAppStaff` and `setRoleDepartments` take and for the same reason: a
 * form shows a set of chips and saves what the set now IS. Two doors would make
 * the screen responsible for computing a difference, and a difference computed
 * from a stale read removes a tool somebody else added a second ago.
 *
 * Keyed on (version_id, step_key) so it travels with a version cut — see 0053.
 * Every tool is checked against the client that owns the map, for exactly the
 * reason the role above is.
 */
/** THE TOOL ON A STEP IS THIS CLIENT'S TOOL — checked before anything is
 * written, and returning its name so the history can say it.
 *
 * The account fence stops a caller REACHING another client's rows. It does not
 * stop them WRITING one client's tool id onto another client's step, because a
 * staff member can see both. Same argument as the role above, same shape.
 *
 * IT ANSWERS BEFORE THE ROW EXISTS, and that is not tidiness: `addStep` used to
 * insert the step and then save its tools, so naming a tool belonging to another
 * client returned a refusal AND left a step behind on the map with nothing on it.
 * A refusal that leaves a row is worse than either answer alone, because the map
 * looks finished and nobody re-reads a step that saved.
 */
async function toolInScopeOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  toolId: string,
  accountId: string | null
): Promise<string> {
  if (!accountId)
    throw new GuardError(
      400,
      "no_client",
      "This map isn't filed under a client yet, so it has no tools to choose from."
    )
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{ name: string }>(
    cfg,
    guard.databaseId,
    `SELECT name FROM client_tools
      ${where([fence.sql, "id = ?", "account_id = ?", "deactivated_at IS NULL"])} LIMIT 1`,
    [...fence.params, toolId, accountId]
  )
  if (!rows[0])
    throw new GuardError(404, "tool_not_found", "That tool isn't one of this client's live tools.")
  return rows[0].name
}

/** APPEND WHAT THE STEP NOW SAYS, DATED TODAY.
 *
 * `process_steps` is the LIVE row — what the map says right now, and what every
 * screen that is not the slider reads. `process_step_revisions` is its LOG. That
 * is one fact and its history, not two sources of truth, and the direction is
 * strict: every write to the row appends here, and nothing ever writes here
 * alone.
 *
 * ONE REVISION PER STEP PER DAY. Typing a duration, looking at it, and typing a
 * better one is a person correcting themselves — it is one description of the
 * step, not two — so the same day overwrites rather than stacking. A slider with
 * eleven entries for last Tuesday would be a record of somebody's keystrokes
 * rather than of the client's business.
 *
 * THE ROLE'S COST IS COPIED, NOT REFERENCED. That is the owner's ruling and the
 * reason this table can be trusted a year later: a rate corrected in 2027 must
 * not move a figure a client agreed in 2026.
 */
async function writeRevision(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  step: {
    processId: string
    accountId: string | null
    stepKey: string
    name: string
    description: string | null
    position: number
    secondsPerRun: number
    runsPerPeriod: number
    frequencyPeriod: string
    roleId: string | null
    roleCentsPerHour: number | null
    toolId: string | null
    branchLabel: string | null
    loopsBackTo: string | null
    removed: boolean
  },
  on?: string
): Promise<void> {
  const day = on ?? new Date().toISOString().slice(0, 10)
  const now = new Date().toISOString()
  await d1Query(
    cfg,
    guard.databaseId,
    `INSERT INTO process_step_revisions
       (id, process_id, account_id, step_key, effective_on, name, description, position,
        seconds_per_run, runs_per_period, frequency_period, client_role_id, role_cents_per_hour,
        client_tool_id, branch_label, loops_back_to, removed, created_at, creator_id, creator_email, creator_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (process_id, step_key, effective_on) DO UPDATE SET
       name = excluded.name, description = excluded.description, position = excluded.position,
       seconds_per_run = excluded.seconds_per_run, runs_per_period = excluded.runs_per_period,
       frequency_period = excluded.frequency_period, client_role_id = excluded.client_role_id,
       role_cents_per_hour = excluded.role_cents_per_hour, client_tool_id = excluded.client_tool_id,
       branch_label = excluded.branch_label, loops_back_to = excluded.loops_back_to,
       removed = excluded.removed`,
    [
      ulid(), step.processId, step.accountId, step.stepKey, day, step.name, step.description,
      step.position, step.secondsPerRun, step.runsPerPeriod, step.frequencyPeriod, step.roleId,
      step.roleCentsPerHour, step.toolId, step.branchLabel, step.loopsBackTo, step.removed ? 1 : 0,
      now, actor.id, actor.email, actor.name,
    ]
  )
}

/** WHAT THE MAP LOOKED LIKE ON ONE DAY — the newest revision on or before it, per
 * step key.
 *
 * This is the whole date slider, and the whole baseline of every saving. A step
 * with no revision on or before the date DID NOT EXIST YET, and is simply absent
 * — which is what makes "a step we added later makes the saving smaller" come
 * out right without a special case anywhere.
 */
export async function mapAsOf(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  processId: string,
  on: string,
  /** WHICH APPS THIS CALLER MAY SEE AN HOURLY COST ON — `null` = no restriction
   * (a staff caller). Threaded in rather than resolved here so ONE decision
   * covers every reader on the screen; see getProcess. */
  rateVisibleOn?: Set<string> | null,
  appId?: string
): Promise<ProcessStep[]> {
  const fence = accountScopeClause(scope, "r.account_id")
  const rows = await d1Query<{
    step_key: string
    effective_on: string
    name: string
    description: string | null
    position: number
    seconds_per_run: number
    runs_per_period: number
    frequency_period: string
    client_role_id: string | null
    role_name: string | null
    role_cents_per_hour: number | null
    client_tool_id: string | null
    tool_name: string | null
    tool_mark: string | null
    branch_label: string | null
    loops_back_to: string | null
    removed: number
  }>(
    cfg,
    guard.databaseId,
    // THE NEWEST ON OR BEFORE, per step key, in one statement. The correlated
    // MAX is what makes it "as of" rather than "everything up to" — and the date
    // comparison is a plain string compare because every date here is ISO
    // YYYY-MM-DD, where lexical order IS chronological order.
    //
    // R14 hard cap — one version of one map, which is tens of steps.
    `SELECT r.step_key, r.effective_on, r.name, r.description, r.position,
            r.seconds_per_run, r.runs_per_period, r.frequency_period,
            r.client_role_id, cr.name AS role_name, r.role_cents_per_hour,
            r.client_tool_id, ct.name AS tool_name, ct.mark AS tool_mark,
            r.branch_label, r.loops_back_to, r.removed
       FROM process_step_revisions r
       LEFT JOIN client_roles cr ON cr.id = r.client_role_id
       LEFT JOIN client_tools ct ON ct.id = r.client_tool_id
      ${where([fence.sql, "r.process_id = ?", "r.effective_on <= ?"])}
        AND r.effective_on = (
          SELECT MAX(r2.effective_on) FROM process_step_revisions r2
           WHERE r2.process_id = r.process_id AND r2.step_key = r.step_key
             AND r2.effective_on <= ?)
      ORDER BY r.position ASC, r.step_key ASC LIMIT ${LIST_HARD_CAP}`,
    [...fence.params, processId, on, on]
  )
  return rows.map((r) => ({
    // A REVISION HAS NO STEP ROW ID of its own to hand back — it is a
    // description, not the live row — so the key doubles as the identity here.
    // Nothing edits a historic revision, which is why that is safe.
    id: r.step_key,
    processId,
    versionId: "",
    stepKey: r.step_key,
    name: r.name,
    description: r.description,
    position: r.position,
    secondsPerRun: r.seconds_per_run,
    runsPerMonth: runsPerMonthFrom(r.runs_per_period, r.frequency_period),
    runsPerPeriod: r.runs_per_period,
    frequencyPeriod: r.frequency_period as ProcessStep["frequencyPeriod"],
    removed: r.removed === 1,
    roleId: r.client_role_id,
    roleName: r.role_name,
    roleCentsPerHour: withheldRate(rateVisibleOn, appId) ? null : r.role_cents_per_hour,
    toolId: r.client_tool_id,
    toolName: r.tool_name,
    toolMark: r.tool_mark,
    branchLabel: r.branch_label,
    loopsBackTo: r.loops_back_to,
    effectiveOn: r.effective_on,
  }))
}

/** EVERY DAY THIS MAP CHANGED — the stops the slider snaps to.
 *
 * A slider over a continuous date range would spend most of its travel on days
 * nothing happened. These are the days something did, which makes every position
 * on it a real state of the client's business. */
export async function revisionDates(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  processId: string
): Promise<string[]> {
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{ effective_on: string }>(
    cfg,
    guard.databaseId,
    `SELECT DISTINCT effective_on FROM process_step_revisions
      ${where([fence.sql, "process_id = ?"])}
      ORDER BY effective_on ASC LIMIT ${LIST_HARD_CAP}`,
    [...fence.params, processId]
  )
  return rows.map((r) => r.effective_on)
}

export async function addStep(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: {
    processId: string
    name: string
    description?: string
    secondsPerRun: number
    runsPerPeriod: number
    frequencyPeriod?: string
    position?: number
    /** who does it — one of the CLIENT's own roles. Undefined inherits the map's. */
    roleId?: string | null
    /** what it is done in — exactly ONE (both respondents' ruling). */
    toolId?: string | null
    /** the word on a fork, when this step is one branch of a decision */
    branchLabel?: string | null
    /** the step key this one can send the work back to */
    loopsBackTo?: string | null
  }
): Promise<string> {
  const process = await processOrThrow(cfg, guard, scope, input.processId)
  const version = await latestVersionOrThrow(cfg, guard, scope, input.processId)
  const id = ulid()
  const stepKey = ulid()
  // THE MAP'S ROLE IS THE STARTING POINT, not a fallback read at display time.
  // A new step on a map whose work is done by one person should not need the
  // role picking again; a map handed between three should. Copying it in means
  // an older version keeps saying what it was mapped with even after the map's
  // default changes, which a fallback would quietly rewrite (0053).
  const roleId = input.roleId === undefined ? (process.roleId ?? null) : input.roleId
  const toolId = input.toolId ?? null
  // EVERY REFUSAL HAPPENS BEFORE THE ROW EXISTS. See toolInScopeOrThrow for the
  // day a half-saved step taught us that.
  const roleCents = roleId
    ? await roleCostOrThrow(cfg, guard, scope, roleId, process.accountId)
    : null
  if (toolId) await toolInScopeOrThrow(cfg, guard, scope, toolId, process.accountId)
  const period = frequencyPeriodOrThrow(input.frequencyPeriod)
  const position = input.position ?? (await nextPosition(cfg, guard, version.id))
  await insertRow(cfg, guard, "process_steps", {
    id,
    process_id: input.processId,
    version_id: version.id,
    account_id: process.accountId,
    step_key: stepKey,
    client_role_id: roleId,
    // FROZEN AT WRITE TIME (the owner's ruling). A rate corrected next year must
    // not move a figure a client agreed this year.
    role_cents_per_hour: roleCents,
    client_tool_id: toolId,
    branch_label: input.branchLabel ?? null,
    loops_back_to: input.loopsBackTo ?? null,
    name: input.name,
    description: input.description ?? null,
    position,
    seconds_per_run: input.secondsPerRun,
    runs_per_month: input.runsPerPeriod,
    frequency_period: period,
    created_at: new Date().toISOString(),
    creator_id: actor.id,
    creator_email: actor.email,
    creator_name: actor.name,
  })
  // …AND THE SAME FACT, DATED. The live row is what the map says now; this is
  // what it said on the day. Nothing reads the history without it.
  await writeRevision(cfg, guard, actor, {
    processId: input.processId,
    accountId: process.accountId,
    stepKey,
    name: input.name,
    description: input.description ?? null,
    position,
    secondsPerRun: input.secondsPerRun,
    runsPerPeriod: input.runsPerPeriod,
    frequencyPeriod: period,
    roleId,
    roleCentsPerHour: roleCents,
    toolId,
    branchLabel: input.branchLabel ?? null,
    loopsBackTo: input.loopsBackTo ?? null,
    removed: false,
  })
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Step added",
    description: `${actor.name} added the step "${input.name}" to ${process.name}`,
    relatedTable: "process_steps",
    relatedRowId: id,
  })
  return id
}

/** Edit ONE step, in the version it belongs to. Editing a step of an OLD version
 * is refused: a baseline that can be edited after the fact is a saving anybody
 * can dial up, which is the whole of "the numbers stop being believable". The
 * predicate rides the UPDATE, so it cannot be raced past. */
export async function updateStep(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  input: {
    name: string
    description?: string | null
    secondsPerRun: number
    runsPerPeriod: number
    frequencyPeriod?: string
    position?: number
    /** who does it. Undefined leaves it alone; null clears it. */
    roleId?: string | null
    /** what it is done in — ONE. Undefined leaves it alone; null clears it. */
    toolId?: string | null
    branchLabel?: string | null
    loopsBackTo?: string | null
  }
): Promise<string> {
  const before = await stepOrThrow(cfg, guard, scope, id)
  const process = await processOrThrow(cfg, guard, scope, before.processId)
  const nextRoleId = input.roleId === undefined ? before.roleId : input.roleId
  const nextTool = input.toolId === undefined ? before.toolId : input.toolId
  // THE ROLE'S COST IS RE-FROZEN ONLY WHEN THE ROLE CHANGES, and that is the
  // owner's ruling working: leaving the role alone keeps the cost the step was
  // recorded with, so editing a duration does not silently re-price history at
  // today's rate. Picking a DIFFERENT role is a new fact and takes that role's
  // cost as of now.
  const roleChanged = nextRoleId !== before.roleId
  const nextRole = roleChanged && nextRoleId
    ? await roleInScopeOrThrow(cfg, guard, scope, nextRoleId, process.accountId)
    : null
  const nextRoleName = roleChanged ? (nextRole?.name ?? null) : before.roleName
  const nextRoleCents = roleChanged
    ? (nextRole?.cents_per_hour ?? null)
    : before.roleCentsPerHour
  if (nextTool && nextTool !== before.toolId)
    await toolInScopeOrThrow(cfg, guard, scope, nextTool, process.accountId)
  const period = input.frequencyPeriod === undefined
    ? before.frequencyPeriod
    : frequencyPeriodOrThrow(input.frequencyPeriod)
  const nextDescription = input.description === undefined ? before.description : input.description
  const nextPos = input.position ?? before.position
  const nextBranch = input.branchLabel === undefined ? before.branchLabel : input.branchLabel
  const nextLoop = input.loopsBackTo === undefined ? before.loopsBackTo : input.loopsBackTo

  const fence = accountScopeClause(scope, "account_id")
  const audit = editedBy(actor, new Date().toISOString())
  const changed = await d1Query<{ process_id: string }>(
    cfg,
    guard.databaseId,
    // `COALESCE(?, client_role_id)` would be wrong: null is how a caller CLEARS
    // the role, and coalesce cannot tell "clear it" from "leave it". So the
    // decision is made above in JS, where undefined and null are still two
    // different things, and one settled value arrives here.
    `UPDATE process_steps SET name = ?, description = ?, seconds_per_run = ?, runs_per_month = ?,
       frequency_period = ?, position = ?, client_role_id = ?, role_cents_per_hour = ?,
       client_tool_id = ?, branch_label = ?, loops_back_to = ?, ${audit.sql}
     ${where([
       fence.sql,
       "id = ?",
       // …and only in the newest version. See the note above.
       "version_id = (SELECT id FROM process_versions v WHERE v.process_id = process_steps.process_id ORDER BY v.version_no DESC LIMIT 1)",
     ])} RETURNING process_id`,
    [
      input.name,
      nextDescription,
      input.secondsPerRun,
      input.runsPerPeriod,
      period,
      nextPos,
      nextRoleId,
      nextRoleCents,
      nextTool,
      nextBranch,
      nextLoop,
      ...audit.params,
      ...fence.params,
      id,
    ]
  )
  if (!changed[0])
    throw new GuardError(
      409,
      "not_latest",
      "That step belongs to an older version of the process. Only the current version can be edited."
    )
  await writeRevision(cfg, guard, actor, {
    processId: before.processId,
    accountId: process.accountId,
    stepKey: before.stepKey,
    name: input.name,
    description: nextDescription,
    position: nextPos,
    secondsPerRun: input.secondsPerRun,
    runsPerPeriod: input.runsPerPeriod,
    frequencyPeriod: period,
    roleId: nextRoleId,
    roleCentsPerHour: nextRoleCents,
    toolId: nextTool,
    branchLabel: nextBranch,
    loopsBackTo: nextLoop,
    removed: false,
  })
  const changes = describeChanges([
    { label: "Name", from: before.name, to: input.name },
    { label: "Minutes per run", from: String(Math.round(before.secondsPerRun / 60)), to: String(Math.round(input.secondsPerRun / 60)) },
    { label: "How often", from: `${before.runsPerPeriod} a ${before.frequencyPeriod}`, to: `${input.runsPerPeriod} a ${period}` },
    // WHO DOES IT is a change worth a history line, because it changes the MONEY
    // the map reports without changing a single minute on it. The ids are what
    // is compared and the names are what is said — a reader of the feed should
    // not have to look up a ULID to know what happened.
    { label: "Who does it", from: before.roleName ?? "", to: nextRoleName ?? "" },
  ])
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Step edited",
    description: `${actor.name} edited the step "${input.name}"${changes ? `, ${changes}` : ""}`,
    relatedTable: "process_steps",
    relatedRowId: id,
  })
  return changed[0].process_id
}

/** THE WORK STOPPED HAPPENING. Not a delete: the row stays, its frequency stays,
 * and its duration goes to zero — which is what makes the plain savings sentence
 * true for the largest saving there is (work we removed entirely). Deleting the
 * row instead would drop the step out of the baseline join and report NO saving
 * for it, silently.
 *
 * R17: `removed_at IS NULL` rides the UPDATE, so removing twice moves zero rows,
 * writes no second history line and publishes nothing.
 *
 * AND ONLY IN THE NEWEST VERSION — the same predicate `updateStep` carries, added
 * here on 17 Aug 2026 when the detail screen learned to show older versions. The
 * hole was real and had simply been out of reach: this write sets a duration to
 * ZERO, so against a baseline it would have manufactured the largest saving the
 * app can report, on the exact figure a client is shown. Nothing but the absence
 * of a button was stopping it, and a button is not a permission. */
export async function removeStep(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string
): Promise<string | null> {
  const before = await stepOrThrow(cfg, guard, scope, id)
  const fence = accountScopeClause(scope, "account_id")
  const now = new Date().toISOString()
  const changed = await d1Query<{ process_id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE process_steps SET removed_at = ?, seconds_per_run = 0, ${editedBy(actor, now).sql}
     ${where([
       fence.sql,
       "id = ?",
       "removed_at IS NULL",
       // …and only in the newest version. It rides the UPDATE rather than sitting
       // in front of it because a version cut between a check and a write would
       // leave the check true and the write wrong.
       "version_id = (SELECT id FROM process_versions v WHERE v.process_id = process_steps.process_id ORDER BY v.version_no DESC LIMIT 1)",
     ])} RETURNING process_id`,
    [now, ...editedBy(actor, now).params, ...fence.params, id]
  )
  // ZERO ROWS MOVED HAS TWO CAUSES NOW, and they are not the same answer. Already
  // removed is nothing wrong (R17: silence, no second history line, no ping).
  // Belonging to a frozen version is a refusal, and it has to SAY so — a silent
  // 200 would tell somebody the baseline had been edited when it had not. The
  // read happens only on this path, so the ordinary write still costs one
  // statement and the predicate above is still the thing that decided.
  if (!changed[0] && !(await isInLatestVersion(cfg, guard, scope, id)))
    throw new GuardError(
      409,
      "not_latest",
      "That step belongs to an older version of the process. Only the current version can be changed."
    )
  if (!changed[0]) return null
  // THE HISTORY SAYS IT STOPPED, on the day it stopped. Without this the slider
  // would show the step still running for ever, and the saving for the largest
  // kind of change we make — taking work away entirely — would never appear on
  // the timeline at all.
  await writeRevision(cfg, guard, actor, {
    processId: before.processId,
    // ITS OWNER, NOT NULL. A revision written without an account is invisible to
    // the one person entitled to it: mapAsOf and revisionDates both fence on
    // account_id, and `NULL IN (…)` is never true — so a client's slider went on
    // showing a removed step running at its old duration for ever, and the day it
    // stopped was not a stop on the slider. It fails closed, which is why nothing
    // shouted; it is still a row hidden from its owner.
    accountId: before.accountId,
    stepKey: before.stepKey,
    name: before.name,
    description: before.description,
    position: before.position,
    secondsPerRun: 0,
    runsPerPeriod: before.runsPerPeriod,
    frequencyPeriod: before.frequencyPeriod,
    roleId: before.roleId,
    roleCentsPerHour: before.roleCentsPerHour,
    toolId: before.toolId,
    branchLabel: before.branchLabel,
    loopsBackTo: before.loopsBackTo,
    removed: true,
  })
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Step removed",
    description: `${actor.name} recorded that the step "${before.name}" no longer happens`,
    relatedTable: "process_steps",
    relatedRowId: id,
  })
  return changed[0].process_id
}

// ── the version cut ──────────────────────────────────────────────────────────

/** CUT A NEW VERSION: copy the current version's steps forward, keeping every
 * `step_key`, so the next edit describes the new way of working and the old one
 * stays exactly as it was agreed.
 *
 * ONE CALLER: a person, pressing the button (owner, 24 Aug 2026). An earlier
 * plan had a completing sprint cut one too, and nothing was ever wired to do it
 * — the parameter, the column and its index existed and only tests ever used
 * them. The decision was purged rather than switched off (migration 0051).
 *
 * IDEMPOTENT (R17), and this is the one transition in the build where "the same
 * thing happened twice" is an INSERT rather than an UPDATE — so the predicate
 * cannot ride a WHERE. It rides the unique index on (process_id, version_no)
 * instead: two quick presses both read version N and both try to insert N+1, and
 * the loser is refused by the database rather than by a check a second request
 * could slip past. `null` back means "already cut", which is a 200 with no
 * activity row and no ping, exactly like a zero-row move. */
export async function cutVersion(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { processId: string; label?: string }
): Promise<{ versionId: string; versionNo: number } | null> {
  const process = await processOrThrow(cfg, guard, scope, input.processId)
  const current = await latestVersionOrThrow(cfg, guard, scope, input.processId)

  const versionId = ulid()
  const now = new Date().toISOString()
  try {
    await insertRow(cfg, guard, "process_versions", {
      id: versionId,
      process_id: input.processId,
      account_id: process.accountId,
      version_no: current.versionNo + 1,
      label: input.label ?? null,
      created_at: now,
      creator_id: actor.id,
      creator_email: actor.email,
      creator_name: actor.name,
    })
  } catch (e) {
    // ONLY a duplicate is swallowed; anything else is rethrown untouched, because
    // a swallowed database error is exactly what this must not become. Both data
    // doors phrase it the same way ("UNIQUE constraint failed: …").
    if (!/UNIQUE constraint/i.test(String((e as Error)?.message ?? ""))) throw e
    return null
  }

  // The steps travel forward WITH their keys — that is what makes "the same step,
  // one version later" a subtraction rather than a name match. A removed step
  // travels too, with its frequency intact and zero seconds, so the work we took
  // away goes on being counted as a saving.
  //
  // AND SO DOES WHO DOES IT (0053). A cut that dropped the role would price the
  // new version's hours at nothing while the old one still had a rate — which
  // reads on the screen as the saving having grown, on a version where not one
  // minute changed.
  await d1Query(
    cfg,
    guard.databaseId,
    `INSERT INTO process_steps
       (id, process_id, version_id, account_id, step_key, name, description, position,
        seconds_per_run, runs_per_month, removed_at, client_role_id,
        role_cents_per_hour, client_tool_id, frequency_period, branch_label, loops_back_to,
        created_at, creator_id, creator_email, creator_name)
     SELECT lower(hex(randomblob(16))), s.process_id, ?, s.account_id, s.step_key, s.name, s.description,
            s.position, s.seconds_per_run, s.runs_per_month, s.removed_at, s.client_role_id,
            s.role_cents_per_hour, s.client_tool_id, s.frequency_period, s.branch_label, s.loops_back_to,
            ?, ?, ?, ?
       FROM process_steps s
      WHERE s.process_id = ? AND s.version_id = ?`,
    [versionId, now, actor.id, actor.email, actor.name, input.processId, current.id]
  )

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Version cut",
    description: `${actor.name} cut version ${current.versionNo + 1} of ${process.name}`,
    relatedTable: "process_versions",
    relatedRowId: versionId,
  })
  return { versionId, versionNo: current.versionNo + 1 }
}

// ── the conversation on a map ────────────────────────────────────────────────

/** A process map's comments, oldest first — it reads as a conversation. */
export async function listProcessComments(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  processId: string
): Promise<ProcessComment[]> {
  // The process decides visibility FIRST: a comment set is a property of a map,
  // so an invisible map yields an empty set rather than a readable conversation.
  await processOrThrow(cfg, guard, scope, processId)
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{
    id: string
    body: string
    explains_step_key: string | null
    is_staff: number
    created_at: string
    creator_id: string | null
    creator_name: string | null
  }>(
    cfg,
    guard.databaseId,
    // R14 hard cap — a conversation, like a ticket's replies.
    `SELECT id, body, explains_step_key, is_staff, created_at, creator_id, creator_name
       FROM process_comments${where([fence.sql, "process_id = ?"])}
      ORDER BY created_at ASC LIMIT ${THREAD_HARD_CAP}`,
    [...fence.params, processId]
  )
  return rows.map((r) => ({
    id: r.id,
    processId,
    body: r.body,
    explainsStepKey: r.explains_step_key,
    fromStaff: r.is_staff === 1,
    createdAt: r.created_at,
    // WHICH STAFF MEMBER WROTE IT is not the client's to read (SCOPE ch.06 — the
    // portal shows work status, never who inside the agency is doing it). Their
    // OWN colleagues' names stay, because those are their own people.
    createdByName: scope.kind === "portal" && r.is_staff === 1 ? null : r.creator_name,
  }))
}

/** R16 — the exact server total behind the conversation, through the SAME fence. */
export async function countProcessComments(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  processId: string
): Promise<number> {
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM process_comments${where([fence.sql, "process_id = ?"])}`,
    [...fence.params, processId]
  )
  return rows[0]?.n ?? 0
}

/** Say something on a map. THE ONE WRITE A CLIENT LOGIN CAN REACH here, and it
 * is a conversation, never an edit: it changes no duration, cuts no version and
 * moves no number.
 *
 * `explainsStepKey` is the staff half — the explanation a regression must carry
 * before the portal will show it. A client login cannot set it (the route
 * refuses), because "why this got slower" is the agency's account of its own
 * work. */
export async function addProcessComment(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { processId: string; body: string; explainsStepKey?: string }
): Promise<{ id: string; accountId: string | null }> {
  // The fence decides WHOSE map this is BEFORE a word is appended, and answers
  // 404 rather than 403 so "not yours" never confirms the map exists.
  const process = await processOrThrow(cfg, guard, scope, input.processId)
  const id = ulid()
  await insertRow(cfg, guard, "process_comments", {
    id,
    process_id: input.processId,
    account_id: process.accountId,
    body: input.body,
    explains_step_key: input.explainsStepKey ?? null,
    is_staff: scope.kind === "staff" ? 1 : 0,
    created_at: new Date().toISOString(),
    creator_id: actor.id,
    creator_email: actor.email,
    creator_name: actor.name,
  })
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Process comment added",
    description: `${actor.name} commented on the process ${process.name}`,
    relatedTable: "process_comments",
    relatedRowId: id,
  })
  // The ACCOUNT travels back with the id: the route's live ping has to name it
  // (a client login's socket is fenced by account and cannot check a process id),
  // and re-reading the process to find it would be a second four-query round trip
  // for a value this function already holds.
  return { id, accountId: process.accountId }
}

// ── the savings drill-down ───────────────────────────────────────────────────

/** THE FIGURE, AND EVERYTHING IT IS MADE OF — App → Process → Step, so a client
 * asking "where does 208 hours come from?" gets an answer three clicks deep
 * rather than an assurance.
 *
 * The read is ONE statement, joining each step of the BASELINE version to the
 * step of the LATEST version that carries the same `step_key`. Both sides are
 * LEFT-joined, because the two honest edge cases are a step that only exists in
 * one of them: a step we REMOVED (baseline only → the whole of its time is
 * saved) and a step we ADDED (latest only → new work, which is a regression, and
 * internal screens always show it).
 *
 * The arithmetic itself is NOT here. It lives in shared/workers/savings.ts as a
 * pure function so it can be read and tested without a database, which is what
 * makes it checkable by anyone who doubts a number. */
export async function listSavings(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  opts: { accountId?: string; appId?: string; processId?: string } = {}
): Promise<SavingsView> {
  if (opts.accountId) requireAccountInScope(scope, opts.accountId)
  const fence = accountScopeClause(scope, "p.account_id")
  const sql = where([
    fence.sql,
    opts.accountId ? "p.account_id = ?" : undefined,
    opts.appId ? "p.app_id = ?" : undefined,
    // ONE MAP'S OWN SUBTRACTION, for the map's own screen. It narrows the same
    // statement rather than adding a second one, which is what makes the figure
    // on a process's detail the same figure as on the value screen by
    // construction instead of by inspection. Not a query parameter on the value
    // door: nothing asks a machine for one map's saving, and a filter with no
    // caller is a contract to keep for nothing (R19 measures the door's own
    // parameters, so this stays honest by staying a lib option).
    opts.processId ? "p.id = ?" : undefined,
    // An archived app or process is not part of today's picture.
    "p.deactivated_at IS NULL",
    "a.deactivated_at IS NULL",
  ])
  const params = [...fence.params]
  if (opts.accountId) params.push(opts.accountId)
  if (opts.appId) params.push(opts.appId)
  if (opts.processId) params.push(opts.processId)

  // WHICH STEPS WE HAVE EXPLAINED — one bounded read, not one per step. A staff
  // comment naming a step IS the explanation (BUILD-3 §3), so this is the set of
  // step keys that have one, and a regression next to its explanation is the
  // shape both front doors render. A CLIENT's comment naming a step would not
  // count even if the door let them write one, which it does not.
  const commentFence = accountScopeClause(scope, "account_id")
  const explained = new Set(
    (
      await d1Query<{ explains_step_key: string }>(
        cfg,
        guard.databaseId,
        // R14 hard cap — one row per explained step.
        `SELECT DISTINCT explains_step_key FROM process_comments
          ${where([commentFence.sql, "explains_step_key IS NOT NULL", "is_staff = 1"])}
          LIMIT ${LIST_HARD_CAP}`,
        [...commentFence.params]
      )
    ).map((r) => r.explains_step_key)
  )

  // WHO MAY SEE AN HOURLY COST, decided once and applied on the row.
  const mainOf = await mainStakeholderApps(cfg, guard, scope)

  const rows = await d1Query<{
    app_id: string
    app_name: string
    process_id: string
    process_name: string
    step_key: string
    step_name: string | null
    baseline_seconds: number | null
    latest_seconds: number | null
    runs_per_period: number | null
    frequency_period: string | null
    role_cents_per_hour: number | null
    removed: number | null
  }>(
    cfg,
    guard.databaseId,
    // MEASURED FROM THE AUDIT DATE — Aurora's ruling, replacing "version 1".
    // A version number is a thing WE did; the audit date is the day Alex walked
    // in, which is the moment a client recognises as "before". A map that has
    // been re-cut three times for our own reasons must still subtract from the
    // day the client remembers.
    //
    // BOTH SIDES ARE THE SAME QUERY at two dates: the newest revision on or
    // before the audit date, and the newest revision full stop. That is what
    // makes the slider and the saving the same mechanism rather than two — move
    // the slider to the audit date and the "after" column becomes the "before".
    //
    // A step with no revision at the audit date DID NOT EXIST THEN. It comes out
    // with a null baseline, which the pure function reads as zero seconds of old
    // work — so work we ADDED correctly makes the saving smaller, with no
    // special case anywhere. That is the comprehension check both respondents
    // passed, holding as arithmetic rather than as a rule somebody remembered.
    //
    // R14 hard cap — every step of every process of every app the caller may see.
    // Past the cap the caller narrows by account or by app; both filters are on
    // this door.
    `WITH baseline_version AS (
       -- WHICH VERSION WAS IN FORCE ON THE AUDIT DATE. Aurora's ruling put the
       -- baseline on a DATE rather than on "version 1", and this is what a date
       -- means here: the map as it was agreed on the day Alex walked in.
       --
       -- IT IS THE VERSION AND NOT THE DATED REVISIONS, and that distinction was
       -- earned. Revisions are one-per-day, so a map drawn in the morning and
       -- improved the same afternoon has ONE revision for that day — and the
       -- baseline and the current state would be the same row, reporting a
       -- saving of zero on a real afternoon's work. A VERSION is a moment
       -- somebody deliberately marked as agreed, which is exactly the
       -- disambiguation that needs. Revisions drive the SLIDER, where
       -- one-per-day is the right grain; versions drive the SUBTRACTION, where
       -- "what did we agree" is the question.
       --
       -- Falls back to version 1 for a map whose audit date predates every cut,
       -- which is what "before we touched anything" has always meant here.
       -- …AND NEVER THE CURRENT ONE. A version cut TODAY is on or before an audit
       -- date of today, so without this the newest version would be picked as its
       -- own baseline and every map would report a saving of exactly zero — which
       -- is the shape of a bug that looks like an honest answer. You cannot
       -- subtract today from today. If the only version is the first, it is both
       -- sides and the saving is zero, which is correct: nothing has changed yet.
       SELECT p.id AS process_id,
              COALESCE(
                (SELECT v.id FROM process_versions v
                  WHERE v.process_id = p.id
                    AND date(v.created_at) <= COALESCE(p.audit_date, date(p.created_at))
                    AND v.version_no < (SELECT MAX(v3.version_no) FROM process_versions v3
                                         WHERE v3.process_id = p.id)
                  ORDER BY v.version_no DESC LIMIT 1),
                (SELECT v.id FROM process_versions v
                  WHERE v.process_id = p.id ORDER BY v.version_no ASC LIMIT 1)
              ) AS version_id
         FROM processes p
     ),
     baseline AS (
       SELECT s.process_id, s.step_key, s.name, s.seconds_per_run, s.runs_per_month,
              s.frequency_period
         FROM process_steps s
         JOIN baseline_version bv ON bv.version_id = s.version_id AND bv.process_id = s.process_id
     ),
     newest AS (
       SELECT s.process_id, s.step_key, s.name, s.seconds_per_run, s.runs_per_month,
              s.frequency_period, s.role_cents_per_hour, s.removed_at
         FROM process_steps s
        WHERE s.version_id = (SELECT id FROM process_versions v2
                               WHERE v2.process_id = s.process_id
                               ORDER BY v2.version_no DESC LIMIT 1)
     )
     SELECT a.id AS app_id, a.name AS app_name, p.id AS process_id, p.name AS process_name,
            COALESCE(b.step_key, n.step_key) AS step_key,
            COALESCE(n.name, b.name) AS step_name,
            b.seconds_per_run AS baseline_seconds,
            n.seconds_per_run AS latest_seconds,
            COALESCE(n.runs_per_month, b.runs_per_month) AS runs_per_period,
            COALESCE(n.frequency_period, b.frequency_period) AS frequency_period,
            n.role_cents_per_hour,
            CASE WHEN n.removed_at IS NULL THEN 0 ELSE 1 END AS removed
       FROM processes p
       JOIN apps a ON a.id = p.app_id
       LEFT JOIN baseline b ON b.process_id = p.id
       LEFT JOIN newest n ON n.process_id = p.id AND n.step_key = b.step_key
      ${sql}
      UNION
     SELECT a.id, a.name, p.id, p.name, n.step_key, n.name, NULL, n.seconds_per_run,
            n.runs_per_month, n.frequency_period, n.role_cents_per_hour,
            CASE WHEN n.removed_at IS NULL THEN 0 ELSE 1 END
       FROM processes p
       JOIN apps a ON a.id = p.app_id
       JOIN newest n ON n.process_id = p.id
       LEFT JOIN baseline b ON b.process_id = p.id AND b.step_key = n.step_key
      ${sql ? `${sql} AND b.step_key IS NULL` : " WHERE b.step_key IS NULL"}
      ORDER BY app_name, process_name, step_name
      LIMIT ${LIST_HARD_CAP}`,
    [...params, ...params]
  )

  // Shape the flat rows into the App → Process → Step tree the pure function
  // rolls up. A step that exists in neither version is not a row at all.
  const apps = new Map<string, { appId: string; name: string; processes: Map<string, { processId: string; name: string; steps: StepFigures[] }> }>()
  for (const r of rows) {
    if (!r.step_key) continue
    const app = apps.get(r.app_id) ?? { appId: r.app_id, name: r.app_name, processes: new Map() }
    apps.set(r.app_id, app)
    const process = app.processes.get(r.process_id) ?? { processId: r.process_id, name: r.process_name, steps: [] }
    app.processes.set(r.process_id, process)
    process.steps.push({
      stepKey: r.step_key,
      name: r.step_name ?? "Step",
      baselineSecondsPerRun: r.baseline_seconds ?? 0,
      latestSecondsPerRun: r.latest_seconds ?? 0,
      // CONVERTED ONCE, in the one place a period becomes a month.
      runsPerMonth: runsPerMonthFrom(r.runs_per_period ?? 0, r.frequency_period ?? "month"),
      // THE RATE THE STEP WAS RECORDED WITH, never today's (savings.ts) — AND
      // WITHHELD HERE, on the row, from a portal caller who is not this app's
      // main stakeholder.
      //
      // It is withheld at the row rather than at the three screens for the
      // reason R24 gives about the internal figures one table over: a redaction
      // you have to remember is one somebody forgets, and a number that never
      // crosses the wire cannot be read out of the network tab. Withholding it
      // takes the MONEY with it — `savedCentsPerMonth` comes out null — which is
      // the honest result rather than a zero pretending the work is free.
      roleCentsPerHour: mainOf && !mainOf.has(r.app_id) ? null : r.role_cents_per_hour,
      removed: r.removed === 1,
      explained: explained.has(r.step_key),
    })
  }
  return savingsView(
    [...apps.values()].map((a) => ({ appId: a.appId, name: a.name, processes: [...a.processes.values()] }))
  )
}

// ── shared internals ─────────────────────────────────────────────────────────

/** One app inside the fence, or a clean 404 (identical to a made-up id). */
async function appOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  id: string
): Promise<{
  id: string
  accountId: string | null
  name: string
  url: string | null
  stage: string | null
  logoUrl: string | null
  toolCost: number
  about: string | null
  clientContext: string | null
  solution: string | null
  keyActors: string | null
}> {
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{
    id: string
    account_id: string | null
    name: string
    url: string | null
    stage: string | null
    logo_url: string | null
    tool_cost_cents_per_month: number
    about: string | null
    client_context: string | null
    solution: string | null
    key_actors: string | null
  }>(
    cfg,
    guard.databaseId,
    `SELECT id, account_id, name, url, stage, logo_url, tool_cost_cents_per_month,
            about, client_context, solution, key_actors
       FROM apps${where([fence.sql, "id = ?"])} LIMIT 1`,
    [...fence.params, id]
  )
  if (!rows[0]) throw new GuardError(404, "not_found", "That app doesn't exist.")
  return {
    id: rows[0].id,
    accountId: rows[0].account_id,
    name: rows[0].name,
    url: rows[0].url,
    stage: rows[0].stage,
    logoUrl: rows[0].logo_url,
    toolCost: rows[0].tool_cost_cents_per_month,
    about: rows[0].about,
    clientContext: rows[0].client_context,
    solution: rows[0].solution,
    keyActors: rows[0].key_actors,
  }
}

/** One process inside the fence, or a clean 404. */
async function processOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  id: string
): Promise<ProcessSummary> {
  const fence = accountScopeClause(scope, "p.account_id")
  const rows = await d1Query<{
    id: string
    app_id: string
    app_name: string
    account_id: string | null
    name: string
    description: string | null
    role_name: string | null
    role_id: string | null
    audit_date: string | null
    deactivated_at: string | null
    created_at: string
    version_count: number
    step_count: number
  }>(
    cfg,
    guard.databaseId,
    `SELECT p.id, p.app_id, a.name AS app_name, p.account_id, p.name, p.description, p.role_name, p.role_id, p.audit_date,
            p.deactivated_at, p.created_at,
            (SELECT COUNT(*) FROM process_versions v WHERE v.process_id = p.id) AS version_count,
            (SELECT COUNT(*) FROM process_steps s WHERE s.process_id = p.id
               AND s.version_id = (SELECT id FROM process_versions v2 WHERE v2.process_id = p.id
                                    ORDER BY v2.version_no DESC LIMIT 1)) AS step_count
       FROM processes p JOIN apps a ON a.id = p.app_id${where([fence.sql, "p.id = ?"])} LIMIT 1`,
    [...fence.params, id]
  )
  if (!rows[0]) throw new GuardError(404, "not_found", "That process doesn't exist.")
  const r = rows[0]
  return {
    id: r.id,
    appId: r.app_id,
    appName: r.app_name,
    accountId: r.account_id,
    name: r.name,
    description: r.description,
    roleName: r.role_name,
    roleId: r.role_id,
    auditDate: r.audit_date,
    versionCount: r.version_count,
    stepCount: r.step_count,
    active: r.deactivated_at == null,
    createdAt: r.created_at,
  }
}

/** The newest version of a process, inside the fence. Every process has one — it
 * is written with the process itself — so an absence here is a database somebody
 * has been editing by hand, and it says so rather than computing from nothing. */
async function latestVersionOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  processId: string
): Promise<{ id: string; versionNo: number }> {
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{ id: string; version_no: number }>(
    cfg,
    guard.databaseId,
    `SELECT id, version_no FROM process_versions${where([fence.sql, "process_id = ?"])}
      ORDER BY version_no DESC LIMIT 1`,
    [...fence.params, processId]
  )
  if (!rows[0])
    throw new GuardError(409, "no_baseline", "That process has no version 1 yet, it can't be measured from.")
  return { id: rows[0].id, versionNo: rows[0].version_no }
}

/** Is this step part of the version that can still be edited? Asked ONLY to tell
 * two zero-row outcomes apart after a refused write — never to decide one, which
 * is why it is not called before the UPDATE that carries the same predicate. */
async function isInLatestVersion(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  stepId: string
): Promise<boolean> {
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM process_steps${where([
      fence.sql,
      "id = ?",
      "version_id = (SELECT id FROM process_versions v WHERE v.process_id = process_steps.process_id ORDER BY v.version_no DESC LIMIT 1)",
    ])}`,
    [...fence.params, stepId]
  )
  return (rows[0]?.n ?? 0) > 0
}

/** The next place on the end of a version's list of steps. No fence clause: the
 * version id reaching here has already been resolved through one
 * (`latestVersionOrThrow`), and this reads no row's contents — it asks for a
 * number to sort by. */
async function nextPosition(cfg: D1Rest, guard: MemberGuard, versionId: string): Promise<number> {
  const rows = await d1Query<{ n: number | null }>(
    cfg,
    guard.databaseId,
    "SELECT MAX(position) AS n FROM process_steps WHERE version_id = ?",
    [versionId]
  )
  return (rows[0]?.n ?? 0) + 1
}

/** THE VERSION A READER ASKED FOR — the named one, or the latest when they named
 * none.
 *
 * `process_id = ?` rides the WHERE beside the id, so a version id belonging to
 * ANOTHER map is a 404 and not that map's steps. The account fence would already
 * refuse another CLIENT's version; this is the clause that refuses another map
 * of the same client's, which the fence cannot see the difference of. */
async function versionOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  processId: string,
  versionId?: string
): Promise<{ id: string; versionNo: number }> {
  if (!versionId) return latestVersionOrThrow(cfg, guard, scope, processId)
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{ id: string; version_no: number }>(
    cfg,
    guard.databaseId,
    `SELECT id, version_no FROM process_versions${where([fence.sql, "id = ?", "process_id = ?"])} LIMIT 1`,
    [...fence.params, versionId, processId]
  )
  if (!rows[0]) throw new GuardError(404, "not_found", "That version doesn't exist.")
  return { id: rows[0].id, versionNo: rows[0].version_no }
}

/** One step inside the fence, or a clean 404. */
async function stepOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  id: string
): Promise<{
  id: string
  processId: string
  versionId: string
  stepKey: string
  name: string
  description: string | null
  position: number
  secondsPerRun: number
  runsPerPeriod: number
  frequencyPeriod: string
  roleId: string | null
  roleName: string | null
  roleCentsPerHour: number | null
  toolId: string | null
  branchLabel: string | null
  loopsBackTo: string | null
  accountId: string | null
}> {
  const fence = accountScopeClause(scope, "s.account_id")
  const rows = await d1Query<{
    id: string
    process_id: string
    version_id: string
    step_key: string
    name: string
    description: string | null
    position: number
    seconds_per_run: number
    runs_per_month: number
    frequency_period: string | null
    client_role_id: string | null
    role_name: string | null
    role_cents_per_hour: number | null
    client_tool_id: string | null
    branch_label: string | null
    loops_back_to: string | null
    account_id: string | null
  }>(
    cfg,
    guard.databaseId,
    // EVERYTHING AN EDIT CAN LEAVE ALONE has to be read here, because "undefined
    // means leave it" is decided against this row. A field missing from this
    // SELECT is a field an edit would silently blank.
    //
    // The role's WORD travels with its id so an edit can say "Who does it:
    // Dispatch clerk → Adjuster" in the history rather than two ULIDs nobody can
    // read. LEFT JOIN: a step with no role is ordinary.
    `SELECT s.id, s.process_id, s.version_id, s.step_key, s.name, s.description, s.position,
            s.seconds_per_run, s.runs_per_month, s.frequency_period, s.client_role_id,
            r.name AS role_name, s.role_cents_per_hour, s.client_tool_id,
            s.branch_label, s.loops_back_to, s.account_id
       FROM process_steps s
       LEFT JOIN client_roles r ON r.id = s.client_role_id
       ${where([fence.sql, "s.id = ?"])} LIMIT 1`,
    [...fence.params, id]
  )
  if (!rows[0]) throw new GuardError(404, "not_found", "That step doesn't exist.")
  const r = rows[0]
  return {
    id: r.id,
    processId: r.process_id,
    versionId: r.version_id,
    stepKey: r.step_key,
    name: r.name,
    description: r.description,
    position: r.position,
    secondsPerRun: r.seconds_per_run,
    runsPerPeriod: r.runs_per_month,
    frequencyPeriod: r.frequency_period ?? "month",
    roleId: r.client_role_id,
    roleName: r.role_name,
    roleCentsPerHour: r.role_cents_per_hour,
    toolId: r.client_tool_id,
    branchLabel: r.branch_label,
    loopsBackTo: r.loops_back_to,
    accountId: r.account_id,
  }
}

// ── the audit date, and the maps a map is connected to ───────────────────────

/** MOVE THE DAY THE SAVING IS MEASURED FROM.
 *
 * Editable, and it warns — Aurora's ruling. The warning is the screen's job; the
 * door's job is to make the move honest, which means it happens in one write and
 * the activity feed says what it was and what it became. Every figure on every
 * screen changes the instant this does, which is exactly why it is worth a line
 * in the history rather than a silent column update. */
export async function setAuditDate(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  processId: string,
  auditDate: string
): Promise<void> {
  const process = await processOrThrow(cfg, guard, scope, processId)
  const fence = accountScopeClause(scope, "account_id")
  const audit = editedBy(actor, new Date().toISOString())
  const rows = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    // R17: the current value rides the UPDATE, so setting it to what it already
    // is moves zero rows — no second history line, no ping, no "changed X → X".
    `UPDATE processes SET audit_date = ?, ${audit.sql}
      ${where([fence.sql, "id = ?", "COALESCE(audit_date, '') <> ?"])} RETURNING id`,
    [auditDate, ...audit.params, ...fence.params, processId, auditDate]
  )
  if (!rows[0]) return
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Audit date moved",
    description: `${actor.name} set the audit date of ${process.name} to ${auditDate}`,
    relatedTable: "processes",
    relatedRowId: processId,
  })
}

/** THE MAPS THIS ONE CONNECTS TO, both ways.
 *
 * The owner: "many times the last step of a process is the first step — or
 * connected to — another process". LOOSE, by his ruling: naming a link changes
 * no duration, no frequency and no saving on either side. It is a signpost, and
 * a signpost that altered the road would be worse than none.
 *
 * Read in BOTH directions on purpose. A person who linked "Taking the order" to
 * "Packing it" should find the link from either end; making them remember which
 * way round they typed it is the kind of small cruelty that stops a feature
 * being used. */
export async function listProcessLinks(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  processId: string
): Promise<{ id: string; processId: string; name: string; note: string | null; direction: "to" | "from" }[]> {
  const fence = accountScopeClause(scope, "l.account_id")
  const joined = accountScopeClause(scope, "p.account_id")
  const rows = await d1Query<{
    id: string
    other_id: string
    other_name: string
    note: string | null
    direction: string
  }>(
    cfg,
    guard.databaseId,
    // R14 hard cap — a map connects to a handful of others, not thousands.
    // THE JOINED TABLE CARRIES THE FENCE TOO. Fencing `l.account_id` alone says
    // nothing about the row the join reaches — and a link written across two
    // clients (which the write now refuses, but historic rows may exist) would
    // hand back the other client's process name through a query that looked
    // fenced. A fence on the outer row is not a fence on the answer.
    `SELECT l.id, p.id AS other_id, p.name AS other_name, l.note, 'to' AS direction
       FROM process_links l JOIN processes p ON p.id = l.to_process_id
      ${where([fence.sql, joined.sql, "l.from_process_id = ?", "p.deactivated_at IS NULL"])}
      UNION ALL
     SELECT l.id, p.id, p.name, l.note, 'from'
       FROM process_links l JOIN processes p ON p.id = l.from_process_id
      ${where([fence.sql, joined.sql, "l.to_process_id = ?", "p.deactivated_at IS NULL"])}
      ORDER BY other_name ASC LIMIT ${LIST_HARD_CAP}`,
    [...fence.params, ...joined.params, processId, ...fence.params, ...joined.params, processId]
  )
  return rows.map((r) => ({
    id: r.id,
    processId: r.other_id,
    name: r.other_name,
    note: r.note,
    direction: r.direction === "to" ? "to" : "from",
  }))
}

/** Connect one map to another. Both ends are checked into the fence, which is
 * what stops a caller wiring their own client's map to somebody else's. */
export async function linkProcesses(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { fromProcessId: string; toProcessId: string; note?: string | null }
): Promise<string | null> {
  if (input.fromProcessId === input.toProcessId)
    throw new GuardError(400, "same_process", "A process can't be connected to itself.")
  const from = await processOrThrow(cfg, guard, scope, input.fromProcessId)
  const to = await processOrThrow(cfg, guard, scope, input.toProcessId)
  // BOTH ENDS MUST BE THE SAME CLIENT'S. `processOrThrow` proves each id is
  // inside the CALLER's scope, which for a staff member is every client — so it
  // never compared them to each other. Connecting client X's map to client Y's
  // wrote a row owned by X, and a contact at X then read Y's process NAME out of
  // their own map's links. The same check waves.ts makes on a sprint, and
  // roleInScopeOrThrow makes on a role: reaching two rows is not the same as
  // their belonging together.
  if (from.accountId !== to.accountId)
    throw new GuardError(
      400,
      "wrong_client",
      "Those two process maps belong to different clients, so they can't be connected."
    )
  const id = ulid()
  try {
    await insertRow(cfg, guard, "process_links", {
      id,
      account_id: from.accountId,
      from_process_id: input.fromProcessId,
      to_process_id: input.toProcessId,
      note: input.note ?? null,
      created_at: new Date().toISOString(),
      creator_id: actor.id,
      creator_email: actor.email,
      creator_name: actor.name,
    })
  } catch (e) {
    // R17 through the unique index: connecting the same pair twice is the same
    // sentence, so the second one is not an error — it is already true.
    if (!/UNIQUE constraint/i.test(String((e as Error)?.message ?? ""))) throw e
    return null
  }
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Processes connected",
    description: `${actor.name} connected ${from.name} to ${to.name}`,
    relatedTable: "processes",
    relatedRowId: input.fromProcessId,
  })
  return id
}

/** Take a connection away. A link is a signpost, not a record of work, so this
 * is the one thing in the module that really deletes: there is no history to
 * lose and a "removed connection" on a screen would be noise. */
export async function unlinkProcesses(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string
): Promise<boolean> {
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{ from_process_id: string }>(
    cfg,
    guard.databaseId,
    `DELETE FROM process_links ${where([fence.sql, "id = ?"])} RETURNING from_process_id`,
    [...fence.params, id]
  )
  if (!rows[0]) return false
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Processes disconnected",
    description: `${actor.name} removed a connection between process maps`,
    relatedTable: "processes",
    relatedRowId: rows[0].from_process_id,
  })
  return true
}
