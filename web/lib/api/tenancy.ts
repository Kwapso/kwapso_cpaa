// TENANCY — teams, members, roles, invites, accounts, screen config.
//
// One of the five door lists behind `@/lib/api`. They are split by WORKER,
// because that is the boundary the doors already have: a path under
// `/api/tenancy/…` is answered by the tenancy worker and nothing else.
//
// THE WHOLE DIRECTORY IS THE ATTACK SURFACE the two gateway suites derive from —
// workers/gateway/test/agency-door.test.ts walks every file here to prove each
// door reaches a worker, and workers/portal-gateway/test/portal-door.test.ts
// walks the same files to prove none of them reaches the CLIENT door. They read
// the DIRECTORY, not one file, so a door added in a new domain file is covered
// the day it lands.

import { ApiFailure } from "@shared/web/api"
import type {
  ClientDepartment,
  ClientRole,
  ClientTool,
  ClientToolPrice,
  AppModule,
  Account,
  AccountDetail,
  AccountRate,
  ActiveContext,
  ActivityItem,
  AppMoneyBack,
  AppRow,
  InternalRate,
  Invite,
  InviteAudit,
  PermissionValue,
  ProcessComment,
  ProcessDetail,
  ProcessSummary,
  ReceivedInvite,
  RolePermissions,
  RoleRate,
  SelectableValue,
  TeamMeta,
  TeamMember,
  TeamRole,
  TeamSummary,
} from "@shared/types"
import type {
  DraftApplyResult,
  DraftDecisions,
  ProcessDraftDetail,
  ProcessDraftPayload,
  ProcessDraftSummary,
} from "@shared/process-drafts"
import type { RecordCounts } from "@shared/record-counts"
import type { SavingsView } from "@shared/workers/savings"
import { api, enc, listQuery, post } from "@shared/web/api"
import type { PagedResponse } from "@shared/web/api"

export const tenancy = {
  /** After onboarding: accept waiting invites OR create the personal team. */
  bootstrap: () =>
    api<{ teams: TeamSummary[]; currentTeamId: string | null }>(
      "/api/tenancy/bootstrap",
      { method: "POST" }
    ),

  teams: () =>
    api<{ teams: TeamSummary[]; currentTeamId: string | null }>(
      "/api/tenancy/teams"
    ),

  /** Current working context: active team + your role + member count + teams. */
  active: () => api<ActiveContext>("/api/tenancy/active"),

  /** Switch the active team (one at a time); returns the new context. */
  switchTeam: (teamId: string) =>
    api<ActiveContext>("/api/tenancy/switch-team", {
      method: "POST",
      body: JSON.stringify({ teamId }),
    }),

  /** Create a new team (its own database, you as Admin); returns the context. */
  createTeam: (name: string) =>
    api<ActiveContext>("/api/tenancy/teams", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  /** Edit the active team's name + optional logo (data URL) + the agency's own
   * legal details. Needs teams:edit.
   *
   * `legal` is PATCHED, never replaced: a field this call leaves out keeps what
   * it had, so the team-edit dialog can save a rename without erasing an address
   * it was never showing. Sending an empty string is how a caller clears one. */
  updateTeam: (
    name: string,
    logoDataUrl?: string,
    legal?: { legalName?: string; legalAddress?: string; legalNumbers?: string; phone?: string }
  ) =>
    api<{ ok: true }>("/api/tenancy/teams/update", {
      method: "POST",
      body: JSON.stringify({ name, logoDataUrl, ...legal }),
    }),

  /** Everyone on the active team (identity + role + the guard flags). */
  members: () => api<{ members: TeamMember[] }>("/api/tenancy/members"),

  /** ONE member by id (for row-level live patching) — null if they're no longer
   * an active member (the read passes the same filter as the list). */
  member: (userId: string) =>
    api<{ members: TeamMember[] }>(
      `/api/tenancy/members?id=${encodeURIComponent(userId)}`
    ).then((r) => r.members[0] ?? null),

  /** ONE role by id — null if it's gone. */
  role: (roleId: string) =>
    api<{ roles: TeamRole[] }>(`/api/tenancy/roles?id=${encodeURIComponent(roleId)}`).then(
      (r) => r.roles[0] ?? null
    ),

  /** ONE invite by id — null if it's gone. */
  invite: (inviteId: string) =>
    api<{ invites: Invite[] }>(
      `/api/tenancy/invites?id=${encodeURIComponent(inviteId)}`
    ).then((r) => r.invites[0] ?? null),

  /** The per-team invite_logs audit for one invite (inviter snapshot +
   * acceptance + shelf life) — null if there's no audit row. For the detail. */
  inviteAudit: (inviteId: string): Promise<InviteAudit | null> =>
    api<{ audit: InviteAudit | null }>(
      `/api/tenancy/invites/audit?id=${encodeURIComponent(inviteId)}`
    ).then((r) => r.audit),

  /** YOUR own effective rights for the active team — powers the page guard. */
  myPermissions: () =>
    api<{ permissions: PermissionValue }>("/api/tenancy/my-permissions"),

  /** Every role in the active team (for the role picker + roles screen). */
  roles: () => api<{ roles: TeamRole[]; total: number }>("/api/tenancy/roles"),

  /** One role's permission matrix (modules + saved value + locked flag). */
  rolePermissions: (roleId: string) =>
    api<RolePermissions>(
      `/api/tenancy/roles/permissions?roleId=${encodeURIComponent(roleId)}`
    ),

  /** Save a role's permission matrix (server re-applies auto-flip-read). */
  saveRolePermissions: (roleId: string, value: PermissionValue) =>
    api<{ ok: true }>("/api/tenancy/roles/permissions", {
      method: "POST",
      body: JSON.stringify({ roleId, value }),
    }),

  /** Create a new role (starts with no rights); returns the refreshed list. */
  createRole: (title: string, description: string) =>
    api<{ roles: TeamRole[] }>("/api/tenancy/roles", {
      method: "POST",
      body: JSON.stringify({ title, description }),
    }),

  /** Rename / re-describe a role (not the locked Admin); returns the list. */
  updateRole: (roleId: string, title: string, description: string) =>
    api<{ roles: TeamRole[] }>("/api/tenancy/roles/update", {
      method: "POST",
      body: JSON.stringify({ roleId, title, description }),
    }),

  /** Deactivate / reactivate a role (never deleted; holders keep access). Needs
   * member_roles:delete. Returns the refreshed role list. */
  setRoleActive: (roleId: string, active: boolean) =>
    api<{ roles: TeamRole[] }>("/api/tenancy/roles/active", {
      method: "POST",
      body: JSON.stringify({ roleId, active }),
    }),

  /** EVERY MODULE THE TEAM HAS — the sections of every app, read whole and
   * narrowed on screen. One read, one cache key, so a rename reaches the ticket
   * form, the ticket list and the app's own tab through the ordinary live path. */
  appModules: () => api<{ modules: AppModule[]; total: number }>("/api/tenancy/app-modules"),
  /** One module by id (the row-level live re-pull) — same door, ?id= filter. */
  appModuleOne: (id: string) =>
    api<{ modules: AppModule[] }>(`/api/tenancy/app-modules?id=${encodeURIComponent(id)}`).then(
      (r) => r.modules[0] ?? null
    ),
  // ── THE CLIENT'S OWN ORGANISATION ──────────────────────────────────────────
  // Who does the work at a client, what an hour of them costs, and what they run
  // on. Every read takes the client; every write names either the client (create)
  // or the row (everything else).
  clientDepartments: (accountId?: string) =>
    api<{ departments: ClientDepartment[]; total: number }>(
      `/api/tenancy/client/departments${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ""}`
    ),
  createClientDepartment: (input: { accountId: string; name: string }) =>
    api<{ id: string }>("/api/tenancy/client/departments", { method: "POST", body: JSON.stringify(input) }),
  updateClientDepartment: (input: { id: string; name: string }) =>
    api<{ ok: true }>("/api/tenancy/client/departments/update", { method: "POST", body: JSON.stringify(input) }),
  setClientDepartmentActive: (id: string, active: boolean) =>
    api<{ ok: true; moved: boolean }>("/api/tenancy/client/departments/active", {
      method: "POST",
      body: JSON.stringify({ id, active }),
    }),
  clientRoles: (accountId?: string) =>
    api<{ roles: ClientRole[]; total: number }>(
      `/api/tenancy/client/roles${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ""}`
    ),
  createClientRole: (input: {
    accountId: string
    name: string
    centsPerHour?: number | null
    departmentIds?: string[]
  }) => api<{ id: string }>("/api/tenancy/client/roles", { method: "POST", body: JSON.stringify(input) }),
  updateClientRole: (input: {
    id: string
    name: string
    centsPerHour?: number | null
    departmentIds?: string[]
  }) => api<{ ok: true }>("/api/tenancy/client/roles/update", { method: "POST", body: JSON.stringify(input) }),
  setClientRolePerson: (input: { id: string; personAccountId: string; attached: boolean }) =>
    api<{ ok: true }>("/api/tenancy/client/roles/people", { method: "POST", body: JSON.stringify(input) }),
  setClientRoleActive: (id: string, active: boolean) =>
    api<{ ok: true; moved: boolean }>("/api/tenancy/client/roles/active", {
      method: "POST",
      body: JSON.stringify({ id, active }),
    }),
  clientTools: (accountId?: string, asOf?: string) => {
    const q = new URLSearchParams()
    if (accountId) q.set("accountId", accountId)
    if (asOf) q.set("asOf", asOf)
    return api<{ tools: ClientTool[]; total: number }>(
      `/api/tenancy/client/tools${q.toString() ? `?${q}` : ""}`
    )
  },
  clientToolPrices: (id: string) =>
    api<{ prices: ClientToolPrice[] }>(`/api/tenancy/client/tools/prices?id=${encodeURIComponent(id)}`),
  createClientTool: (input: { accountId: string; name: string; mark?: string }) =>
    api<{ id: string }>("/api/tenancy/client/tools", { method: "POST", body: JSON.stringify(input) }),
  updateClientTool: (input: { id: string; name: string; mark?: string }) =>
    api<{ ok: true }>("/api/tenancy/client/tools/update", { method: "POST", body: JSON.stringify(input) }),
  setClientToolPrice: (input: {
    toolId: string
    cents: number
    billingPeriod: "month" | "year"
    effectiveOn: string
  }) => api<{ ok: true }>("/api/tenancy/client/tools/price", { method: "POST", body: JSON.stringify(input) }),
  setClientToolActive: (id: string, active: boolean) =>
    api<{ ok: true; moved: boolean }>("/api/tenancy/client/tools/active", {
      method: "POST",
      body: JSON.stringify({ id, active }),
    }),

  createAppModule: (input: { appId: string; name: string; mark?: string; nameDe?: string; description?: string; benefit?: string }) =>
    api<{ id: string }>("/api/tenancy/app-modules", { method: "POST", body: JSON.stringify(input) }),
  updateAppModule: (input: { id: string; name: string; mark?: string; nameDe?: string; description?: string; benefit?: string }) =>
    api<{ ok: true }>("/api/tenancy/app-modules/update", { method: "POST", body: JSON.stringify(input) }),
  setAppModuleActive: (id: string, active: boolean) =>
    api<{ ok: true; changed: boolean }>("/api/tenancy/app-modules/active", {
      method: "POST",
      body: JSON.stringify({ id, active }),
    }),

  /** The team's dropdown values ("selectable data"), ordered for grouping by type. */
  selectable: () => api<{ values: SelectableValue[]; total: number }>("/api/tenancy/selectable"),
  /** One dropdown value by id (the row-level live re-pull) — same door, ?id= filter. */
  selectableOne: (id: string) =>
    api<{ values: SelectableValue[] }>(`/api/tenancy/selectable?id=${encodeURIComponent(id)}`).then(
      (r) => r.values[0] ?? null
    ),

  /** Add a dropdown value to a type group (pick-or-create the type). Needs
   * selectable_data:create. Returns the refreshed value list. */
  createSelectable: (type: string, value: string, mark?: string) =>
    api<{ values: SelectableValue[] }>("/api/tenancy/selectable", {
      method: "POST",
      body: JSON.stringify({ type, value, mark }),
    }),

  /** Edit a dropdown value — its word and its emoji; its type stays. Needs
   * selectable_data:edit.
   *
   * `mark` UNDEFINED leaves the emoji alone, an empty string clears it — the
   * lib's own contract. The screen sends it either way, because it now has a
   * field for it: the door has parsed and written `mark` since the day it
   * shipped, and this client sent only the word, so a value's emoji could be
   * set when it was created and never changed afterwards. */
  updateSelectable: (id: string, value: string, mark?: string) =>
    api<{ values: SelectableValue[] }>("/api/tenancy/selectable/update", {
      method: "POST",
      body: JSON.stringify({ id, value, mark }),
    }),

  /** Mark a dropdown value as one of the team's defaults, or take the mark off.
   * Needs selectable_data:edit. A default value refuses to be switched off while
   * the mark is on — this is how a team takes the protection off. */
  setSelectableDefault: (id: string, isDefault: boolean) =>
    api<{ values: SelectableValue[] }>("/api/tenancy/selectable/default", {
      method: "POST",
      body: JSON.stringify({ id, isDefault }),
    }),

  /** Deactivate / reactivate a dropdown value (deactivate-only). Needs
   * selectable_data:delete. Returns the refreshed value list. */
  setSelectableActive: (id: string, active: boolean) =>
    api<{ values: SelectableValue[] }>("/api/tenancy/selectable/active", {
      method: "POST",
      body: JSON.stringify({ id, active }),
    }),

  /** Change a member's role; returns the refreshed member list. */
  setMemberRole: (userId: string, roleId: string) =>
    api<{ members: TeamMember[] }>("/api/tenancy/members/role", {
      method: "POST",
      body: JSON.stringify({ userId, roleId }),
    }),

  /** Remove (deactivate) a member; returns the refreshed member list. */
  removeMember: (userId: string) =>
    api<{ members: TeamMember[] }>("/api/tenancy/members/remove", {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),

  /** Every invite for the active team (pending / accepted / revoked / expired). */
  invites: () => api<{ invites: Invite[]; total: number }>("/api/tenancy/invites"),

  /** Invite someone by email to a role; returns the refreshed invite list. */
  createInvite: (email: string, roleId: string) =>
    api<{ invites: Invite[] }>("/api/tenancy/invites", {
      method: "POST",
      body: JSON.stringify({ email, roleId }),
    }),

  /** Revoke ("redact") a pending invite; returns the refreshed invite list. */
  revokeInvite: (inviteId: string) =>
    api<{ invites: Invite[] }>("/api/tenancy/invites/revoke", {
      method: "POST",
      body: JSON.stringify({ inviteId }),
    }),

  /** Invitations I've RECEIVED (by my email) — the inbox. Works for any
   * signed-in user, not just teamless ones. */
  receivedInvitations: () =>
    api<{ invitations: ReceivedInvite[] }>("/api/tenancy/invitations"),

  /** Accept one received invite → join + switch to that team. */
  acceptInvitation: (inviteId: string) =>
    api<{ invitations: ReceivedInvite[]; joinedTeamId: string }>(
      "/api/tenancy/invitations/accept",
      { method: "POST", body: JSON.stringify({ inviteId }) }
    ),

  /** The team's activity feed, or one record's (scope = team | user | role |
   * invite). For invite scope, `id` is the GLOBAL invite id (server maps it).
   * R14: a PAGE — `cursor` is the opaque one the previous response returned, and
   * `total` is the exact server count of what this caller may see. */
  activity: (scope: "team" | "user" | "role" | "invite" = "team", id?: string, cursor?: string | null) =>
    api<PagedResponse<{ activity: ActivityItem[] }>>(
      `/api/tenancy/activity?scope=${scope}${id ? `&id=${encodeURIComponent(id)}` : ""}${
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
      }`
    ),

  /** One record's activity slice (generic — any module's rows by table+id; e.g.
   * a help ticket's history). Gated server-side by that module's read right.
   * The door answers through the same paged seam as every other activity scope,
   * so the exact COUNT(*) AND the opaque next cursor ride along — R8/R16: the
   * record's Activity TAB badges that total, never the loaded page's length, and
   * R14: `cursor` is how the feed under it reaches page two. Kept as the whole
   * response rather than unwrapped to the rows: dropping `total` here is what left
   * every record's Activity tab with no count for want of a number already on the
   * wire — and dropping `nextCursor` is the same mistake one field along. */
  recordActivity: (table: string, id: string, cursor?: string | null) =>
    api<PagedResponse<{ activity: ActivityItem[] }>>(
      `/api/tenancy/activity?scope=record&table=${encodeURIComponent(table)}&id=${encodeURIComponent(id)}${
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
      }`
    ),

  /** The active team's Overview metadata (created by/when, last updated). */
  teamMeta: () => api<TeamMeta>("/api/tenancy/team-meta"),

  /** The active team's screen-recipe OVERRIDES ({ module: recipeJSON }). The web
   * app merges these over the in-code base recipes (override wins per screen). */
  screenOverrides: () =>
    api<{ screens: Record<string, string> }>("/api/tenancy/config/screens"),

  /** Set (author) a team's override for one screen — runtime-editable, no deploy.
   * Needs teams:edit. */
  setScreenOverride: (module: string, recipe: unknown) =>
    api<{ screens: Record<string, string> }>("/api/tenancy/config/screens", {
      method: "POST",
      body: JSON.stringify({ module, recipe }),
    }),

  /* ---- the customer spine: accounts, their people, their logins ---- */

  /** R14: a PAGE of accounts (a GROWING collection) — hand `cursor` back from the
   * previous response for the next one; `total` is the exact server count of what
   * this caller may see. `parentId` narrows to one account's children.
   *
   * `entityTotal` / `individualTotal` are the Companies / Contacts / All strip's
   * two other badges: the COLLECTION's counts rather than this call's, so a badge
   * on a tab nobody has pressed does not move while somebody types in the search
   * box. */
  accounts: (
    /** The door's own question, spread straight into the query string
     * (`listQuery`) so a filter cannot be lost between the find bar and the
     * door. */
    opts: {
      q?: string
      type?: string
      /** the team's own word for where an account stands, as stored */
      status?: string
      /** "yes" = only the put-away ones, "no" = only the live ones */
      archived?: string
      parentId?: string
      /** WHAT ORDER, one of the door's own sort names (ACCOUNT_SORTS), with
       * `dir` flipping it. Omit both for the door's default (newest first) —
       * the list pages, so this is the only honest place to ask. */
      sort?: string
      dir?: string
      cursor?: string | null
    } = {}
  ) =>
    api<PagedResponse<{ accounts: Account[]; entityTotal: number; individualTotal: number }>>(
      `/api/tenancy/accounts${listQuery(opts)}`
    ),

  /** One account opened: the record, its parent, its people, its logins, and the
   * two exact totals its tabs badge. */
  accountDetail: (id: string) => api<AccountDetail>(`/api/tenancy/accounts/detail?id=${enc(id)}`),

  /** ONE account row (the row-level live re-pull). A 404 means it's genuinely gone
   * — anything else propagates, so a network blip never drops a row off a list. */
  accountRow: (id: string): Promise<Account | null> =>
    tenancy
      .accountDetail(id)
      .then((d) => d.account)
      .catch((err) => {
        if (err instanceof ApiFailure && err.status === 404) return null
        throw err
      }),

  createAccount: (input: Record<string, unknown>) =>
    api<{ id: string }>("/api/tenancy/accounts", post(input)),
  updateAccount: (input: Record<string, unknown> & { id: string }) =>
    api<{ ok: true }>("/api/tenancy/accounts/update", post(input)),
  /** Move an account under another, or to the top with null. A move that would
   * close a loop comes back as a plain sentence (409). */
  setAccountParent: (id: string, parentAccountId: string | null) =>
    api<{ ok: true }>("/api/tenancy/accounts/parent", post({ id, parentAccountId })),
  /** Archive / restore — never deleted. */
  setAccountActive: (id: string, active: boolean) =>
    api<{ ok: true }>("/api/tenancy/accounts/active", post({ id, active })),

  linkPerson: (input: {
    accountId: string
    personAccountId: string
    relationship?: string
    isMainStakeholder?: boolean
  }) => api<{ id: string }>("/api/tenancy/accounts/links", post(input)),
  /** Unlink / relink a person (the row survives, so who was a contact when stays true). */
  setLinkActive: (id: string, active: boolean) =>
    api<{ ok: true }>("/api/tenancy/accounts/links/active", post({ id, active })),

  /** Give someone at this account a login. The person is picked off the account
   * (`personAccountId`); the door resolves their email to their platform account.
   *
   * `notify` sends them the welcome that tells them their portal exists and where
   * to sign in — opt-in, decided at the moment of the grant. `emailSent` in the
   * answer is what ACTUALLY happened, not what was asked for, so the screen never
   * claims a message went out when the send door refused it. */
  grantPortalAccess: (accountId: string, personAccountId: string, notify = false) =>
    api<{ id: string; emailSent: boolean }>(
      "/api/tenancy/portal-users",
      post({ accountId, personAccountId, notify })
    ),
  /** Revoke / restore a login. Revoking switches the login off; every record stays. */
  setPortalAccessActive: (id: string, active: boolean) =>
    api<{ ok: true }>("/api/tenancy/portal-users/active", post({ id, active })),

  /* ---- process maps: App -> Process -> Step, and the value drilled through ---- */

  /** The systems we've built. Bounded (an agency has tens of apps, not thousands)
   * — the collection that grows underneath is `processes`, which pages.
   *
   * `q` searches the app's NAME on the SERVER, so the `total` that comes back is
   * the total of what matched (R16) rather than of everything. Narrowing a
   * loaded list in the browser would have left the heading counting rows the
   * screen was no longer showing. */
  apps: (accountId?: string, q?: string) =>
    api<{ apps: AppRow[]; total: number }>(
      `/api/tenancy/apps${listQuery({ accountId, q })}`
    ),
  createApp: (input: Record<string, unknown>) => api<{ id: string }>("/api/tenancy/apps", post(input)),
  updateApp: (input: Record<string, unknown> & { id: string }) =>
    api<{ ok: true }>("/api/tenancy/apps/update", post(input)),
  setAppActive: (id: string, active: boolean) =>
    api<{ ok: true }>("/api/tenancy/apps/active", post({ id, active })),

  /** WHAT AN HOUR OF EACH ROLE IS WORTH, and what one app gives back (8.13).
   * INTERNAL, both of them: the money is computed from the role rate card, the
   * doors refuse a client login, and the portal gateway opens neither (R24). */
  roleRates: () => api<{ roleRates: RoleRate[]; total: number }>("/api/tenancy/role-rates"),
  /** One door for add, re-price and retire — the role name is the key. */
  setRoleRate: (input: { roleName: string; centsPerHour: number; active: boolean }) =>
    api<{ id: string }>("/api/tenancy/role-rates", post(input)),
  appMoney: (appId: string) => api<AppMoneyBack>(`/api/tenancy/app-money?appId=${enc(appId)}`),

  /** R14: a PAGE of process maps (a GROWING collection) — hand `cursor` back from
   * the previous response for the next one; `total` is the exact server count of
   * what this caller may see. */
  processes: (
    /** Spread straight into the query string (`listQuery`), so a narrowing this
     * door parses cannot be dropped on the way to it. */
    opts: {
      q?: string
      appId?: string
      /** "yes" = only the put-away maps, "no" = only the live ones. A map is
       * archived and never deleted, so both are ordinary rows in this list. */
      archived?: string
      /** The order, one of PROCESS_SORTS' own names — the maps page, so it is
       * asked of the door rather than applied to the fifty rows in the browser. */
      sort?: string
      dir?: string
      cursor?: string | null
    } = {}
  ) =>
    api<PagedResponse<{ processes: ProcessSummary[] }>>(
      `/api/tenancy/processes${listQuery(opts)}`
    ),
  /** One map opened: its versions, the steps of ONE of them, the exact totals its
   * tabs badge, and the saving those steps add up to.
   *
   * `versionId` reads an OLDER version — its steps and times exactly as they
   * were when it was cut. Omitted means the current one, which is what every
   * caller before the version selector existed was asking for. */
  /** Move the day the saving is measured from. Every figure on every screen
   * changes with it, which is why the screen warns before calling this. */
  setAuditDate: (input: { processId: string; auditDate: string }) =>
    api<{ ok: true }>("/api/tenancy/processes/audit-date", post(input)),
  /** Connect one map to another. LOOSE: it changes no duration and no saving on
   * either side. Connecting the same pair twice answers `alreadyLinked`. */
  linkProcesses: (input: { fromProcessId: string; toProcessId: string; note?: string }) =>
    api<{ ok: true } | { alreadyLinked: true }>("/api/tenancy/processes/link", post(input)),
  unlinkProcesses: (input: { id: string; processId: string }) =>
    api<{ ok: true }>("/api/tenancy/processes/unlink", post(input)),
  /** THE CALLS WE HAVE HAD READ. Bounded, not paged (R14): a draft is one
   * conversation about one process, and it does not grow with ordinary use. */
  processDrafts: (opts: { processId?: string; appId?: string; status?: string } = {}) =>
    api<{ drafts: ProcessDraftSummary[]; total: number }>(
      `/api/tenancy/processes/drafts${listQuery(opts)}`
    ),
  /** One proposal, in full — the payload and the caption its figures must be
   * quoted with (R25). */
  processDraftDetail: (id: string) =>
    api<ProcessDraftDetail>(`/api/tenancy/processes/drafts/detail?id=${enc(id)}`),
  /** ONE draft row (the row-level live re-pull). A 404 means it is genuinely
   * gone; anything else propagates, so a blip never drops a row off a list. */
  processDraftRow: (id: string): Promise<ProcessDraftSummary | null> =>
    tenancy
      .processDraftDetail(id)
      .then((d) => d.draft)
      .catch((err) => {
        if (err instanceof ApiFailure && err.status === 404) return null
        throw err
      }),
  /** READ A CALL. Spends one unit of the team's AI allowance. Nothing is written
   * to the map — "the draft is not the record" is the whole point of the table. */
  createProcessDraft: (input: { processId: string; meetingId?: string; sourceText?: string }) =>
    api<{ id: string; payload: ProcessDraftPayload }>("/api/tenancy/processes/drafts", post(input)),
  /** WRITE ONLY WHAT SURVIVED THE REVIEW. */
  applyProcessDraft: (id: string, decisions: DraftDecisions) =>
    api<DraftApplyResult>("/api/tenancy/processes/drafts/apply", post({ id, ...decisions })),
  /** Throw the proposal away. Nothing reaches the map. */
  discardProcessDraft: (id: string) =>
    api<{ ok: true; changed: boolean }>("/api/tenancy/processes/drafts/discard", post({ id })),
  processDetail: (id: string, versionId?: string, asOf?: string) =>
    api<ProcessDetail>(
      `/api/tenancy/processes/detail${listQuery({ id, versionId, asOf })}`
    ),
  /** ONE process row (the row-level live re-pull). A 404 means it's genuinely gone
   * — anything else propagates, so a network blip never drops a row off a list. */
  processRow: (id: string): Promise<ProcessSummary | null> =>
    tenancy
      .processDetail(id)
      .then((d) => d.process)
      .catch((err) => {
        if (err instanceof ApiFailure && err.status === 404) return null
        throw err
      }),
  createProcess: (input: Record<string, unknown>) =>
    api<{ id: string }>("/api/tenancy/processes", post(input)),
  updateProcess: (input: Record<string, unknown> & { id: string }) =>
    api<{ ok: true }>("/api/tenancy/processes/update", post(input)),
  setProcessActive: (id: string, active: boolean) =>
    api<{ ok: true }>("/api/tenancy/processes/active", post({ id, active })),

  addStep: (input: Record<string, unknown> & { processId: string }) =>
    api<{ ok: true }>("/api/tenancy/processes/steps", post(input)),
  updateStep: (input: Record<string, unknown> & { id: string }) =>
    api<{ ok: true }>("/api/tenancy/processes/steps/update", post(input)),
  /** The work stopped happening — the step keeps its frequency and drops to zero
   * seconds, which is what makes the saving for work we removed come out right. */
  removeStep: (id: string) => api<{ ok: true }>("/api/tenancy/processes/steps/remove", post({ id })),
  /** Hard delete, for a step added by mistake. The door refuses one that is
   * part of an agreed version or that another step loops back to. */
  deleteStep: (id: string) => api<{ ok: true }>("/api/tenancy/processes/steps/delete", post({ id })),

  /** Cut a new version. No `sprintId` = the manual button; the work engine passes
   * the completed sprint's id, and a second attempt answers `alreadyCut` (R17). */
  cutVersion: (processId: string, label?: string, sprintId?: string) =>
    api<{ versionId?: string; versionNo?: number; alreadyCut?: boolean }>(
      "/api/tenancy/processes/versions",
      post({ processId, label, sprintId })
    ),

  processComments: (processId: string) =>
    api<{ comments: ProcessComment[]; total: number }>(
      `/api/tenancy/processes/comments?processId=${enc(processId)}`
    ),
  /** Say something on a map. `explainsStepKey` marks the comment as the staff
   * explanation for a step that got slower — staff only, refused at the door. */
  addProcessComment: (input: { processId: string; body: string; explainsStepKey?: string }) =>
    api<{ id: string }>("/api/tenancy/processes/comments", post(input)),

  /** THE VALUE: savings drilled App → Process → Step, with the caption that says
   * what the numbers are made of (R25). */
  impact: (opts: { accountId?: string; appId?: string } = {}) => {
    const p = new URLSearchParams()
    if (opts.accountId) p.set("accountId", opts.accountId)
    if (opts.appId) p.set("appId", opts.appId)
    const qs = p.toString()
    return api<SavingsView>(`/api/tenancy/impact${qs ? `?${qs}` : ""}`)
  },

  /** HOW MANY OF EACH THING HANG OFF ONE RECORD — this worker's half (apps,
   * process maps, the rate card). Asked when the record opens so its tabs are
   * badged before anybody clicks one; the rows behind each tab stay lazy. */
  recordCounts: (table: string, id: string) =>
    api<RecordCounts>(`/api/tenancy/record-counts?table=${enc(table)}&id=${enc(id)}`),

  /* ---- the money (agency only — every door below refuses a client login) ---- */

  /** What an account is CHARGED, by kind of work. */
  accountRates: (accountId: string) =>
    api<{ rates: AccountRate[]; total: number }>(`/api/tenancy/rates?accountId=${enc(accountId)}`),
  createAccountRate: (input: Record<string, unknown>) =>
    api<{ id: string }>("/api/tenancy/rates", post(input)),
  updateAccountRate: (input: Record<string, unknown> & { id: string }) =>
    api<{ ok: true }>("/api/tenancy/rates/update", post(input)),
  setAccountRateActive: (id: string, active: boolean) =>
    api<{ ok: true }>("/api/tenancy/rates/active", post({ id, active })),

  /** What an hour of OUR work costs US. A separate door from the rate card above,
   * on a separate table, in a separate file behind it — R24. */
  internalRates: () =>
    api<{ internalRates: InternalRate[]; total: number }>("/api/tenancy/internal-rates"),
  createInternalRate: (input: Record<string, unknown>) =>
    api<{ id: string }>("/api/tenancy/internal-rates", post(input)),
  updateInternalRate: (input: Record<string, unknown> & { id: string }) =>
    api<{ ok: true }>("/api/tenancy/internal-rates/update", post(input)),
  setInternalRateActive: (id: string, active: boolean) =>
    api<{ ok: true }>("/api/tenancy/internal-rates/active", post({ id, active })),

  /** Revenue − our own time − tool costs, with every line it was built from. The
   * one figure a client never sees, under any flag, ever (R24). */
  margin: (accountId: string) => api<MarginView>(`/api/tenancy/margin?accountId=${enc(accountId)}`),
}

/** What the margin door hands back. Declared HERE rather than imported from the
 * worker: the shape is the wire contract, and the worker's own file is the one
 * thing the portal may never reach (R24), so the browser client must not be the
 * thing that imports it. */
export type MarginView = {
  revenueCents: number
  timeCostCents: number
  toolCostCents: number
  marginCents: number
  marginPercent: number | null
  lines: { label: string; seconds: number; centsPerHour: number; costCents: number }[]
  loggedTimeAvailable: boolean
}

/** Content worker — Learning + Tickets (team-DB content modules). */
