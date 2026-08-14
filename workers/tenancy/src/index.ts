// kwapso TENANCY worker — teams, memberships, and the team-database factory.
// This file is just the SWITCHBOARD: it maps each route to a handler (grouped
// by domain under ./routes/*) and centrally maps thrown GuardErrors to clean
// HTTP responses. The shared opening (whoAmI / teamContext / adminGuard) lives
// in ./context. Nightly cron drives the estate's housekeeping: the 80% DB-size
// alarms and the shared core database's retention sweep.
//
//   POST /api/tenancy/bootstrap            -> accept invites OR make the personal team
//   GET  /api/tenancy/active               -> current team + your role + teams
//   POST /api/tenancy/switch-team          -> change the active team
//   POST /api/tenancy/teams                -> create a new team (named)
//   POST /api/tenancy/teams/update         -> edit the active team's name + logo
//   GET  /api/tenancy/teams                -> my teams (for switcher + home)
//   GET  /api/tenancy/members              -> the team's members (+ identity)
//   POST /api/tenancy/members/role         -> change a member's role
//   POST /api/tenancy/members/remove       -> remove (deactivate) a member
//   GET  /api/tenancy/my-permissions       -> the caller's own rights (page guard)
//   GET  /api/tenancy/roles                -> the team's roles (+ member counts)
//   POST /api/tenancy/roles                -> create a new role
//   POST /api/tenancy/roles/update         -> rename / re-describe a role
//   POST /api/tenancy/roles/active         -> deactivate / reactivate a role (never deleted)
//   GET  /api/tenancy/roles/permissions    -> a role's permission matrix (?roleId)
//   POST /api/tenancy/roles/permissions    -> save a role's permission matrix
//   GET  /api/tenancy/accounts             -> the caller's accounts (paged, ?q= &type= &cursor=)
//   GET  /api/tenancy/accounts/export      -> the caller's accounts as a full-field CSV
//   GET  /api/tenancy/accounts/detail      -> one account + its people + its logins (?id)
//   POST /api/tenancy/accounts             -> create an account (company or person)
//   POST /api/tenancy/accounts/update      -> edit an account's own fields
//   POST /api/tenancy/accounts/parent      -> move it under another (loop-refused)
//   POST /api/tenancy/accounts/active      -> archive / restore (never deleted)
//   POST /api/tenancy/accounts/links       -> link a person to an account
//   POST /api/tenancy/accounts/links/active-> unlink / relink a person
//   GET  /api/tenancy/portal-users         -> who can log in (?accountId)
//   POST /api/tenancy/portal-users         -> grant portal access
//   POST /api/tenancy/portal-users/active  -> revoke / restore portal access
//   GET  /api/tenancy/portal/context       -> where a client login may stand, and where it stands
//   POST /api/tenancy/portal/switch-account-> stand in another of their own companies
//   GET  /api/tenancy/apps                 -> the systems we've built (?accountId=)
//   POST /api/tenancy/apps                 -> record an app (agency only)
//   POST /api/tenancy/apps/update          -> edit an app (agency only)
//   POST /api/tenancy/apps/active          -> archive / restore an app
//   GET  /api/tenancy/processes            -> process maps, paged (?q= &appId= &cursor=)
//   GET  /api/tenancy/processes/detail     -> one map: versions + current steps (?id)
//   POST /api/tenancy/processes            -> map a process + its baseline (agency only)
//   POST /api/tenancy/processes/update     -> rename / re-describe a process
//   POST /api/tenancy/processes/active     -> archive / restore a process
//   POST /api/tenancy/processes/steps      -> add a step to the current version
//   POST /api/tenancy/processes/steps/update -> edit a step (current version only)
//   POST /api/tenancy/processes/steps/remove -> the step no longer happens
//   POST /api/tenancy/processes/versions   -> cut a version (button, or a sprint's id)
//   GET  /api/tenancy/processes/comments   -> the conversation on a map (?processId)
//   POST /api/tenancy/processes/comments   -> comment on a map (clients too)
//   GET  /api/tenancy/value                -> savings, App -> Process -> Step
//   GET  /api/tenancy/rates                -> an account's rate card (?accountId)
//   POST /api/tenancy/rates                -> add a rate
//   POST /api/tenancy/rates/update         -> edit a rate
//   POST /api/tenancy/rates/active         -> retire / restore a rate
//   GET  /api/tenancy/internal-rates       -> what our own hour costs (internal)
//   POST /api/tenancy/internal-rates       -> add an internal rate
//   POST /api/tenancy/internal-rates/update-> edit an internal rate
//   POST /api/tenancy/internal-rates/active-> retire / restore an internal rate
//   GET  /api/tenancy/margin               -> revenue - our time - tool costs (internal)
//   GET  /api/tenancy/activity             -> activity feed (?scope=team|user|role&id=)
//   GET  /api/tenancy/team-meta            -> the active team's Overview metadata
//   GET  /api/tenancy/invites              -> the team's invites (all statuses)
//   GET  /api/tenancy/invites/audit        -> one invite's invite_logs audit (?id)
//   POST /api/tenancy/invites              -> invite someone by email + role
//   POST /api/tenancy/invites/revoke       -> revoke ("redact") a pending invite
//   GET  /api/tenancy/invitations          -> invites I've RECEIVED (any signed-in user)
//   POST /api/tenancy/invitations/accept   -> accept a received invite (join + switch)
//   GET  /api/tenancy/config/screens       -> a team's screen-recipe overrides (any member)
//   POST /api/tenancy/config/screens       -> set a screen override (teams:edit; people only —
//                                             it is on neither machine catalogue, and the R19
//                                             census says why)
//   POST /api/tenancy/admin/migrate-teams  -> roll team-schema migrations (x-admin-key)
//   POST /api/tenancy/admin/create-team    -> seed a team (x-admin-key; the user door is closed)
//   GET  /api/tenancy/admin/db-sizes       -> size every DB (core included) + open alarms
//   POST /api/tenancy/admin/move-module    -> relocate a heavy module (the mover)
//   GET  /api/tenancy/health
//   cron (nightly)                         -> the 80% size alarms (every database in
//                                             the account, core included) + the core
//                                             database's retention sweep

import { brand } from "@shared/brand"
import { fail, json } from "@shared/workers/http"
import { recordWorkerError } from "@shared/workers/error-log"
import { requestId } from "@shared/workers/trace"
import { sweepCoreRetention } from "@shared/workers/retention"
import { GuardError } from "./lib/permissions"
import { checkDatabaseSizes } from "./lib/sharding"
import { d1Config } from "./lib/teams"
import type { Env } from "./env"
import {
  active,
  bootstrap,
  createNamedTeam,
  getActivityFeed,
  getTeamMetaFeed,
  myTeams,
  postUpdateTeam,
  switchActiveTeam,
} from "./routes/team"
import { getMembers, postMemberRemove, postMemberRole } from "./routes/members"
import {
  getMyPerms,
  getRolePerms,
  getRoles,
  getRolesExport,
  postCreateRole,
  postRolePerms,
  postSetRoleActive,
  postUpdateRole,
} from "./routes/roles"
import {
  getInviteAudit,
  getInvites,
  getReceivedInvitations,
  postAcceptInvitation,
  postCreateInvite,
  postRevokeInvite,
} from "./routes/invites"
import { getScreens, postScreen } from "./routes/config"
import {
  getAccountDetail,
  getAccounts,
  getAccountsExport,
  getPortalContext,
  getPortalUsers,
  postSwitchPortalAccount,
  postAccountActive,
  postAccountParent,
  postCreateAccount,
  postGrantPortalAccess,
  postLinkActive,
  postLinkPerson,
  postPortalAccessActive,
  postUpdateAccount,
} from "./routes/accounts"
import {
  getSelectable,
  getSelectableExport,
  postCreateSelectable,
  postSetSelectableActive,
  postUpdateSelectable,
} from "./routes/selectable"
import {
  getApps,
  getProcessComments,
  getProcessDetail,
  getProcesses,
  getValue,
  postAddStep,
  postAppActive,
  postCreateApp,
  postCreateProcess,
  postCutVersion,
  postProcessActive,
  postProcessComment,
  postRemoveStep,
  postUpdateApp,
  postUpdateProcess,
  postUpdateStep,
} from "./routes/processes"
import {
  getAccountRates,
  getInternalRates,
  getMargin,
  postAccountRateActive,
  postCreateAccountRate,
  postCreateInternalRate,
  postInternalRateActive,
  postUpdateAccountRate,
  postUpdateInternalRate,
} from "./routes/money"
import { adminCreateTeam, dbSizes, migrateTeams, moveModule } from "./routes/admin"

/**
 * THE LIVE-SYNC SEAM (locked, CACHING.md "Every mutation publishes"). Every
 * route is classified so a new one CAN'T be added without consciously deciding
 * how it goes live — that's the structural can't-forget guarantee (a guard test,
 * publish-seam.test.ts, enforces it):
 *   • "read"        — a GET; changes nothing, broadcasts nothing.
 *   • "mutation"    — changes state, so it MUST broadcast a change ping
 *                     (publishChange / publishUserChange — directly or via a lib).
 *   • "housekeeping" — the deny-list: a write that intentionally broadcasts
 *                      NOTHING (a private session pointer, or an ops-only action
 *                      with no client-visible row). Adding one is a reviewed choice.
 */
type RouteKind = "read" | "mutation" | "housekeeping"
type Handler = (request: Request, env: Env) => Promise<Response>
export const ROUTES: Record<string, { handler: Handler; kind: RouteKind }> = {
  "POST /api/tenancy/bootstrap": { handler: bootstrap, kind: "mutation" },
  "GET /api/tenancy/active": { handler: active, kind: "read" },
  // switch-team flips only the caller's own current_team pointer — no shared row
  // changes, and we deliberately don't force the caller's OTHER devices to follow.
  "POST /api/tenancy/switch-team": { handler: switchActiveTeam, kind: "housekeeping" },
  "POST /api/tenancy/teams": { handler: createNamedTeam, kind: "mutation" },
  "POST /api/tenancy/teams/update": { handler: postUpdateTeam, kind: "mutation" },
  "GET /api/tenancy/teams": { handler: myTeams, kind: "read" },
  "GET /api/tenancy/members": { handler: getMembers, kind: "read" },
  "POST /api/tenancy/members/role": { handler: postMemberRole, kind: "mutation" },
  "POST /api/tenancy/members/remove": { handler: postMemberRemove, kind: "mutation" },
  "GET /api/tenancy/my-permissions": { handler: getMyPerms, kind: "read" },
  "GET /api/tenancy/roles": { handler: getRoles, kind: "read" },
  "GET /api/tenancy/roles/export": { handler: getRolesExport, kind: "read" },
  "POST /api/tenancy/roles": { handler: postCreateRole, kind: "mutation" },
  "POST /api/tenancy/roles/update": { handler: postUpdateRole, kind: "mutation" },
  "POST /api/tenancy/roles/active": { handler: postSetRoleActive, kind: "mutation" },
  "GET /api/tenancy/roles/permissions": { handler: getRolePerms, kind: "read" },
  "POST /api/tenancy/roles/permissions": { handler: postRolePerms, kind: "mutation" },
  // The customer spine. Reads are fenced by the caller's account set as well as
  // their role; writes are fenced inside the statement itself (lib/accounts.ts).
  "GET /api/tenancy/accounts": { handler: getAccounts, kind: "read" },
  "GET /api/tenancy/accounts/export": { handler: getAccountsExport, kind: "read" },
  "GET /api/tenancy/accounts/detail": { handler: getAccountDetail, kind: "read" },
  "POST /api/tenancy/accounts": { handler: postCreateAccount, kind: "mutation" },
  "POST /api/tenancy/accounts/update": { handler: postUpdateAccount, kind: "mutation" },
  "POST /api/tenancy/accounts/parent": { handler: postAccountParent, kind: "mutation" },
  "POST /api/tenancy/accounts/active": { handler: postAccountActive, kind: "mutation" },
  "POST /api/tenancy/accounts/links": { handler: postLinkPerson, kind: "mutation" },
  "POST /api/tenancy/accounts/links/active": { handler: postLinkActive, kind: "mutation" },
  "GET /api/tenancy/portal-users": { handler: getPortalUsers, kind: "read" },
  "POST /api/tenancy/portal-users": { handler: postGrantPortalAccess, kind: "mutation" },
  "POST /api/tenancy/portal-users/active": { handler: postPortalAccessActive, kind: "mutation" },
  // The client-side switcher. switch-account flips only the caller's OWN
  // current-account pointer — no shared row moves, so it publishes nothing,
  // exactly like switch-team.
  "GET /api/tenancy/portal/context": { handler: getPortalContext, kind: "read" },
  "POST /api/tenancy/portal/switch-account": {
    handler: postSwitchPortalAccount,
    kind: "housekeeping",
  },
  "GET /api/tenancy/activity": { handler: getActivityFeed, kind: "read" },
  "GET /api/tenancy/team-meta": { handler: getTeamMetaFeed, kind: "read" },
  "GET /api/tenancy/invites": { handler: getInvites, kind: "read" },
  "GET /api/tenancy/invites/audit": { handler: getInviteAudit, kind: "read" },
  "POST /api/tenancy/invites": { handler: postCreateInvite, kind: "mutation" },
  "POST /api/tenancy/invites/revoke": { handler: postRevokeInvite, kind: "mutation" },
  "GET /api/tenancy/invitations": { handler: getReceivedInvitations, kind: "read" },
  "POST /api/tenancy/invitations/accept": { handler: postAcceptInvitation, kind: "mutation" },
  "GET /api/tenancy/config/screens": { handler: getScreens, kind: "read" },
  "POST /api/tenancy/config/screens": { handler: postScreen, kind: "mutation" },
  "GET /api/tenancy/selectable": { handler: getSelectable, kind: "read" },
  "GET /api/tenancy/selectable/export": { handler: getSelectableExport, kind: "read" },
  "POST /api/tenancy/selectable": { handler: postCreateSelectable, kind: "mutation" },
  "POST /api/tenancy/selectable/update": { handler: postUpdateSelectable, kind: "mutation" },
  "POST /api/tenancy/selectable/active": { handler: postSetSelectableActive, kind: "mutation" },
  // PROCESS MAPS — App → Process → Step, the versions cut over them, and the
  // savings drilled through all three. Reads are fenced by the caller's account
  // set (a contact sees their company's maps); every AUTHORING write refuses a
  // client login outright, because a map is the agency's work about a client.
  // The two exceptions are deliberate and are the client's own half: the
  // conversation on a map, and the value it produced.
  "GET /api/tenancy/apps": { handler: getApps, kind: "read" },
  "POST /api/tenancy/apps": { handler: postCreateApp, kind: "mutation" },
  "POST /api/tenancy/apps/update": { handler: postUpdateApp, kind: "mutation" },
  "POST /api/tenancy/apps/active": { handler: postAppActive, kind: "mutation" },
  "GET /api/tenancy/processes": { handler: getProcesses, kind: "read" },
  "GET /api/tenancy/processes/detail": { handler: getProcessDetail, kind: "read" },
  "POST /api/tenancy/processes": { handler: postCreateProcess, kind: "mutation" },
  "POST /api/tenancy/processes/update": { handler: postUpdateProcess, kind: "mutation" },
  "POST /api/tenancy/processes/active": { handler: postProcessActive, kind: "mutation" },
  "POST /api/tenancy/processes/steps": { handler: postAddStep, kind: "mutation" },
  "POST /api/tenancy/processes/steps/update": { handler: postUpdateStep, kind: "mutation" },
  "POST /api/tenancy/processes/steps/remove": { handler: postRemoveStep, kind: "mutation" },
  "POST /api/tenancy/processes/versions": { handler: postCutVersion, kind: "mutation" },
  "GET /api/tenancy/processes/comments": { handler: getProcessComments, kind: "read" },
  "POST /api/tenancy/processes/comments": { handler: postProcessComment, kind: "mutation" },
  "GET /api/tenancy/value": { handler: getValue, kind: "read" },
  // THE MONEY. Every door here refuses a client login — the account rate card
  // included, because a client is shown what they bought through the value door's
  // projection, never by knocking on the card itself. `margin` is the figure SCOPE
  // says a client must never see under any flag: it is refused here, absent from
  // the portal gateway's table, and unreachable from portal code by R24.
  "GET /api/tenancy/rates": { handler: getAccountRates, kind: "read" },
  "POST /api/tenancy/rates": { handler: postCreateAccountRate, kind: "mutation" },
  "POST /api/tenancy/rates/update": { handler: postUpdateAccountRate, kind: "mutation" },
  "POST /api/tenancy/rates/active": { handler: postAccountRateActive, kind: "mutation" },
  "GET /api/tenancy/internal-rates": { handler: getInternalRates, kind: "read" },
  "POST /api/tenancy/internal-rates": { handler: postCreateInternalRate, kind: "mutation" },
  "POST /api/tenancy/internal-rates/update": { handler: postUpdateInternalRate, kind: "mutation" },
  "POST /api/tenancy/internal-rates/active": { handler: postInternalRateActive, kind: "mutation" },
  "GET /api/tenancy/margin": { handler: getMargin, kind: "read" },
  // admin/* are ops-only (roll migrations, relocate a module's DB) — they touch
  // no client-visible app row, so they broadcast nothing.
  "POST /api/tenancy/admin/migrate-teams": { handler: migrateTeams, kind: "housekeeping" },
  // Ops only (x-admin-key, never a session): seeds a team where the user-facing
  // door is closed — a fresh environment, and the smoke's second team.
  "POST /api/tenancy/admin/create-team": { handler: adminCreateTeam, kind: "housekeeping" },
  "GET /api/tenancy/admin/db-sizes": { handler: dbSizes, kind: "read" },
  "POST /api/tenancy/admin/move-module": { handler: moveModule, kind: "housekeeping" },
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    const route = `${request.method} ${pathname}`

    try {
      if (route === "GET /api/tenancy/health") return json({ ok: true })
      const def = ROUTES[route]
      if (!def) return fail(404, "not_found", "No such tenancy action.")
      return await def.handler(request, env)
    } catch (e) {
      if (e instanceof GuardError) return fail(e.status, e.code, e.message)
      console.error("tenancy worker error:", e)
      // Record the crash in the central error log (core DB) — best-effort,
      // never blocks the response. Clean GuardError refusals never reach here.
      await recordWorkerError(env.DB, "tenancy", `${request.method} ${new URL(request.url).pathname}`, e, requestId(request))
      const message = e instanceof Error ? e.message : ""
      if (message.startsWith("cloud_key_missing:"))
        return fail(503, "cloud_key_missing", `${brand.name}'s cloud key isn't set up yet — team creation is paused.`)
      return fail(500, "internal", "Something went wrong on our side. Try again.")
    }
  },

  /** Nightly cron: the estate's housekeeping — the 80% database-size alarms
   * (locked sharding machinery) and the core database's retention sweep.
   *
   * The sweep clears AUTH's spent rows (sign-in codes, the send ledger, expired
   * sessions) from a cron that lives in TENANCY, which reads oddly until you say
   * why: the sweep is about the shared CORE DATABASE, not about auth, and tenancy
   * is the worker that already owns the estate's nightly work and already holds
   * the core binding. Giving auth a cron of its own to run one delete would be a
   * second unattended schedule, a second deploy surface and a second thing to
   * forget — for no more safety than this line. */
  async scheduled(_controller, env): Promise<void> {
    // Two independent jobs, two try blocks. A failing size check must not cost
    // the estate its sweep, and a failing sweep must not hide an 80% alarm.
    try {
      const swept = await sweepCoreRetention(env.DB)
      console.log(`retention sweep: ${JSON.stringify(swept.deleted)}`)
      // R12 IN SPIRIT, the same lesson as the alarm ceiling below: a sweep that
      // stopped at its ceiling has NOT caught up, and a cheerful count is the
      // only thing anyone would read. Say what is still there.
      if (swept.capped.length)
        await recordWorkerError(
          env.DB,
          "tenancy",
          "cron/retention",
          new Error(
            `retention sweep hit its per-table ceiling on ${swept.capped.join(", ")} — those tables still hold rows past their retention window and were NOT fully swept tonight. Tomorrow's run continues.`
          )
        )
    } catch (e) {
      console.error("nightly retention sweep failed:", e)
      await recordWorkerError(env.DB, "tenancy", "cron/retention", e)
    }
    try {
      const result = await checkDatabaseSizes(env, d1Config(env))
      console.log(
        `size check: ${result.checked} team DBs, ${result.alerted.length} alarm(s)`
      )
      // R12 IN SPIRIT: the run has a ceiling, and hitting it means databases over
      // 80% went un-alarmed tonight. That is not a crash, so the catch below
      // never sees it — and a cheerful success line above it is the only thing
      // anyone would read. Record it, so "we stopped early" cannot look like
      // "there was nothing more to find".
      if (result.capped)
        await recordWorkerError(
          env.DB,
          "tenancy",
          "cron/size-check",
          new Error(
            `size check stopped at its ${result.alerted.length}-alarm ceiling — more team databases are over the threshold and were NOT alarmed tonight. Tomorrow's run continues from where this one stopped.`
          )
        )
    } catch (e) {
      // LAW R12: unattended work has no user watching, so a swallowed failure would be
      // invisible — record it to the error store, not just the console.
      console.error("nightly size check failed:", e)
      await recordWorkerError(env.DB, "tenancy", "cron/size-check", e)
    }
  },
} satisfies ExportedHandler<Env>
