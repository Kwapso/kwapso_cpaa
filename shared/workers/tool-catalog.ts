// THE ONE tool catalog — the single source of truth for the endpoints BOTH machine
// surfaces expose: the in-app AI agent (workers/data-ops) and the external MCP surface
// (workers/mcp). Before this, each declared the same ~two dozen tenancy/content CRUD
// endpoints separately, so a new capability had to be added twice and the two could
// silently drift. Now a capability is declared ONCE here and each surface PROJECTS it:
//   • the agent adds its model-facing bits (write / confirm rule / step summary) — see
//     data-ops/src/lib/tools.ts `toAgentTool`;
//   • the MCP adds only its protocol shape (inputSchema = schema, its own name) — see
//     mcp/src/lib/tools.ts `toMcpTool`.
// Both forward to the SAME gated door (the real doors gate + validate + audit + publish),
// so the wiring here (path · method · binding · schema · buildBody) must match the door.
// Surface-ONLY tools stay in each surface's own file: the agent's run_import_batch (SELF)
// + bulk_* + set_help_status_by_filter (all confirm-gated, no MCP confirm panel) +
// get_role_permissions; the MCP's whoami + the caller's own rights + exports + the
// import-catalogue reads + the agentic-import batch tools + the AI-allowance reads +
// the saved conversations + agent_chat/agent_confirm.

import { FENCE_INPUTS } from "./account-scope"
import { GuardError } from "./gating"

/* ------------------------------- schema helpers ------------------------------- */

export const S = { type: "string" } as const
export const B = { type: "boolean" } as const
export const N = { type: "number" } as const
export const obj = (props: Record<string, unknown>, required: string[] = []): Record<string, unknown> => ({
  type: "object",
  properties: props,
  required,
})

/** Read a tool input field as a string. A value of the WRONG TYPE reads as absent
 * rather than being coerced: `String({})` is `"[object Object]"`, which is a
 * perfectly valid 17-character name as far as the door's text validation is
 * concerned, so a machine could invent a record called "[object Object]" through
 * a door that was doing exactly what it was told. A browser form cannot produce a
 * non-string; a JSON-RPC client can send anything.
 *
 * Reading as absent is the FLOOR, not the refusal — the refusal is
 * `checkArgTypes` below, which both executors run before the builders, so a
 * wrong-typed argument is answered with a 400 that says which field. This stays
 * lenient so it can also be used in the step SUMMARIES (which run before the
 * executor and must never throw a label). */
export const str = (input: Record<string, unknown>, key: string): string => {
  const v = input[key]
  return typeof v === "string" ? v : ""
}

/** REFUSE A WRONG-TYPED ARGUMENT, once, at the boundary of both machine surfaces.
 * The tool's own JSON-Schema already declares each field's type for the model;
 * this is the same declaration enforced. Only the field types the catalog uses are
 * checked (string / boolean / number / object / array) and only for keys the caller
 * actually sent — an omitted optional stays omitted. Throws the GuardError both
 * executors already know how to turn into a clean 400. */
export function checkArgTypes(schema: Record<string, unknown>, input: Record<string, unknown>): void {
  const props = (schema.properties ?? {}) as Record<string, { type?: string }>
  for (const [key, spec] of Object.entries(props)) {
    const v = input[key]
    if (v === undefined || v === null) continue
    const want = spec?.type
    const ok =
      want === "string" ? typeof v === "string"
      : want === "boolean" ? typeof v === "boolean"
      : want === "number" ? typeof v === "number" && Number.isFinite(v)
      : want === "array" ? Array.isArray(v)
      : want === "object" ? typeof v === "object" && !Array.isArray(v)
      : true // an undeclared type is nothing to check against
    if (!ok)
      throw new GuardError(
        400,
        "invalid_input",
        `"${key}" must be ${want === "array" ? "a list" : want === "object" ? "an object" : `a ${want}`}.`
      )
  }
}
/** An OPTIONAL string body field: the value, or undefined so JSON.stringify drops it
 * (the door then treats it as an omitted form field). */
const opt = (input: Record<string, unknown>, key: string): string | undefined => str(input, key) || undefined

/** A role reference for a step summary: "the Sub Admin role" when the id resolved to a
 * title (via `names`), else "role <id>". */
export const roleLabel = (input: Record<string, unknown>, names?: Record<string, string>): string => {
  const id = str(input, "roleId")
  const title = names?.[id]
  return title ? `the ${title} role` : `role ${id}`
}
/** A member reference for a summary: the resolved name/email, else "member <id>". */
export const memberLabel = (input: Record<string, unknown>, names?: Record<string, string>): string => {
  const id = str(input, "userId")
  return names?.[id] ?? `member ${id}`
}

/** The optional fields an account carries — the SAME set on create and edit, so
 * the two tools can't drift into different shapes (the door validates them
 * identically for exactly that reason). */
const accountFields = (i: Record<string, unknown>): Record<string, unknown> => ({
  code: opt(i, "code"),
  email: opt(i, "email"),
  phone: opt(i, "phone"),
  address: opt(i, "address"),
  currency: opt(i, "currency"),
  locale: opt(i, "locale"),
  timezone: opt(i, "timezone"),
  status: opt(i, "status"),
})

/** The learning create/edit body — the same optional field set both surfaces send
 * (undefined keys drop out of JSON.stringify, so the door treats them as omitted). */
const learningBody = (i: Record<string, unknown>): Record<string, unknown> => ({
  title: str(i, "title"),
  category: opt(i, "category"),
  description: opt(i, "description"),
  contentType: opt(i, "contentType"),
  contentLink: opt(i, "contentLink"),
  body: opt(i, "body"),
  sequence: typeof i.sequence === "number" ? i.sequence : undefined,
  required: typeof i.required === "boolean" ? i.required : undefined,
})

/* ---------------------------------- the type ---------------------------------- */

/** One endpoint both machine surfaces expose. Neutral wiring at the top; the agent-only
 * projection nested under `agent`; `mcpName` is the MCP's historical name where it differs
 * from the agent's (kept so external MCP scripts don't break). */
export type SharedTool = {
  /** Canonical tool name (the agent's, and the MCP's unless `mcpName` overrides). */
  name: string
  /** The MCP's own name for this endpoint, when it differs (external-contract stable). */
  mcpName?: string
  /** ONE human description — handed to the model AND shown to MCP developers. */
  summary: string
  binding: "TENANCY" | "CONTENT"
  method: "GET" | "POST"
  path: string
  /** JSON-Schema of the input (the model's input_schema AND the MCP inputSchema). */
  schema: Record<string, unknown>
  buildBody?: (input: Record<string, unknown>) => Record<string, unknown>
  buildQuery?: (input: Record<string, unknown>) => string
  /** The in-app agent's projection of this endpoint (the MCP ignores it). */
  agent: {
    write: boolean
    /** show the yes/no panel — boolean, or an input-aware predicate for the toggles. */
    confirm?: boolean | ((input: Record<string, unknown>) => boolean)
    /** one-line human label for the step row / confirm panel. */
    summarize: (input: Record<string, unknown>, names?: Record<string, string>) => string
  }
}

/* -------------------------------- the catalog --------------------------------- */

/** WHY SOME CONSTRUCTIVE WRITES STILL CONFIRM. The rule is that only DESTRUCTIVE
 * acts stop for a yes/no panel — creating an article or replying to a ticket just
 * runs. ACCESS writes are the reviewed exception, and access has two halves:
 *   • WHO CAN DO WHAT — anything gated on member_roles: or team_members:;
 *   • WHO CAN SEE WHOSE — anything that writes an input to the ACCOUNT FENCE
 *     (`FENCE_INPUTS` in account-scope.ts: the parent pointer, account_links,
 *     portal_users). A client login's whole world is resolved from those rows,
 *     so linking a contact or re-parenting an account widens what an outside
 *     company can read — without touching a permission at all.
 * The model reaches all of them while reading team data an attacker can author (a
 * ticket description is up to 20,000 characters of someone else's text). Fenced
 * tool output plus one system-prompt sentence is a soft defence; a confirm panel
 * the admin must click is a hard one. So these confirm — not because they are
 * destructive, but because a silent one is a silent widening of someone's reach.
 * The set is DERIVED, not listed: isPrivilegeWrite() reads each tool's own gate
 * AND matches its door against the fence's own declared inputs, so a write added
 * tomorrow to any of those tables confirms the moment it exists. A name list
 * would have locked the tools above and waved through the next one — which is
 * exactly where update_role was found, and then where link_contact and
 * set_account_parent were found sitting at confirm:false because the derivation
 * only knew about module NAMES and the fence is not a module.
 * The MCP surface ignores `agent.confirm` — it has no panel to show, and the
 * confirming UI belongs to the connecting client. Same door, same gate, same
 * audit row; the asymmetry is documented in MCP.md, not a capability gap. */
export const SHARED_TOOLS: SharedTool[] = [
  /* --------------------------------- reads --------------------------------- */
  {
    name: "list_members",
    summary: "List the team's members, with their roles. Pass `id` (a member's user id) to fetch just that one member.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/members",
    schema: obj({ id: S }),
    buildQuery: (i) => (str(i, "id") ? `?id=${encodeURIComponent(str(i, "id"))}` : ""),
    agent: { write: false, summarize: (i) => (str(i, "id") ? "Look up one member" : "List members") },
  },
  {
    name: "list_roles",
    summary: "List the team's roles. Pass `id` (a role id) to fetch just that one role.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/roles",
    schema: obj({ id: S }),
    buildQuery: (i) => (str(i, "id") ? `?id=${encodeURIComponent(str(i, "id"))}` : ""),
    agent: { write: false, summarize: (i) => (str(i, "id") ? "Look up one role" : "List roles") },
  },
  {
    name: "list_invites",
    summary:
      "List the team's invites — each one's email, role, status (pending / accepted / revoked) and its invite id. Use this to find a PENDING invite's id before revoking it (list_members only shows people who've already joined, so an unaccepted invite won't be there).",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/invites",
    schema: obj({ id: S }),
    buildQuery: (i) => (str(i, "id") ? `?id=${encodeURIComponent(str(i, "id"))}` : ""),
    agent: { write: false, summarize: (i) => (str(i, "id") ? "Look up one invite" : "List invites") },
  },
  {
    name: "list_dropdown_values",
    summary:
      "List the team's dropdown values (selectable data), active first then deactivated — each carries `active`. Deactivated values are listed too, so you can find one's id and reactivate it.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/selectable",
    schema: obj({ id: S }),
    buildQuery: (i) => (str(i, "id") ? `?id=${encodeURIComponent(str(i, "id"))}` : ""),
    agent: { write: false, summarize: (i) => (str(i, "id") ? "Look up one dropdown value" : "List dropdown values") },
  },
  {
    name: "list_learning",
    summary: "List the team's learning / how-to articles. Pass `id` to fetch just one article.",
    binding: "CONTENT", method: "GET", path: "/api/content/learning",
    schema: obj({ id: S }),
    buildQuery: (i) => (str(i, "id") ? `?id=${encodeURIComponent(str(i, "id"))}` : ""),
    agent: { write: false, summarize: (i) => (str(i, "id") ? "Look up one article" : "List learning articles") },
  },
  {
    name: "list_help_tickets",
    summary:
      "List the team's support tickets. scope: 'mine' (yours) or 'all' (default all); pass `id` to fetch just one ticket. Returns ONE page plus the exact `total`, `hasMore`, and an opaque `nextCursor` — to read further, call again passing that value as `cursor` (never invent one).",
    binding: "CONTENT", method: "GET", path: "/api/content/help",
    schema: obj({ scope: S, id: S, cursor: S }),
    buildQuery: (i) => {
      const q = [str(i, "scope") === "mine" ? "scope=mine" : "scope=all"]
      if (str(i, "id")) q.push(`id=${encodeURIComponent(str(i, "id"))}`)
      if (str(i, "cursor")) q.push(`cursor=${encodeURIComponent(str(i, "cursor"))}`)
      return `?${q.join("&")}`
    },
    agent: { write: false, summarize: (i) => (str(i, "id") ? "Look up one ticket" : "List support tickets") },
  },
  {
    name: "get_help_thread",
    summary:
      "Read one support ticket's conversation — every reply, oldest first — by ticket id. The list tools return the ticket; this returns what was said on it.",
    binding: "CONTENT", method: "GET", path: "/api/content/help/thread",
    schema: obj({ id: S }, ["id"]),
    buildQuery: (i) => `?id=${encodeURIComponent(str(i, "id"))}`,
    agent: { write: false, summarize: (i) => `Read the conversation on ticket ${str(i, "id")}` },
  },
  {
    name: "list_help_stakeholders",
    summary:
      "The people following one support ticket (by ticket id): the person who raised it, the team's admins, anyone mentioned on it, and anyone added by hand.",
    binding: "CONTENT", method: "GET", path: "/api/content/help/stakeholders",
    schema: obj({ id: S }, ["id"]),
    buildQuery: (i) => `?id=${encodeURIComponent(str(i, "id"))}`,
    agent: { write: false, summarize: (i) => `List who's following ticket ${str(i, "id")}` },
  },

  /* --------------------------------- the team ------------------------------ */
  // Renaming the team the caller is standing in. It was agent-only, on the
  // reading that teams are off the machine surface — but that exclusion is about
  // the PIN (list / create / switch would move a token to a team it wasn't made
  // in), and renaming the pinned team moves nothing. Same door, same teams:edit
  // gate, same audit row.
  {
    name: "update_team",
    summary: "Rename the team this caller is standing in. Its people, records and history are untouched.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/teams/update",
    schema: obj({ name: S }, ["name"]),
    buildBody: (i) => ({ name: str(i, "name") }),
    agent: { write: true, confirm: false, summarize: (i) => `Rename the team to "${str(i, "name")}"` },
  },

  /* -------------------------------- accounts ------------------------------- */
  // The customer spine. Reads are fenced by the caller's account set as well as
  // their role, so these tools inherit that fence for free — a token held by a
  // person pinned to one account answers about that account and no other.
  {
    name: "list_accounts",
    summary:
      "List the team's accounts — companies and people in one list. Filters: `q` (searches name, reference and email), `type` ('entity' for a company or 'individual' for a person), `parentId` (only the accounts sitting under that one). Returns ONE page plus the exact `total`, `hasMore`, and an opaque `nextCursor` — to read further, call again passing that value as `cursor` (never invent one).",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/accounts",
    schema: obj({ q: S, type: S, parentId: S, cursor: S }),
    buildQuery: (i) => {
      const q: string[] = []
      for (const key of ["q", "type", "parentId", "cursor"])
        if (str(i, key)) q.push(`${key}=${encodeURIComponent(str(i, key))}`)
      return q.length ? `?${q.join("&")}` : ""
    },
    agent: { write: false, summarize: (i) => (str(i, "q") ? `Search accounts for "${str(i, "q")}"` : "List accounts") },
  },
  {
    name: "get_account",
    summary:
      "One account in full (by id), with its contacts (the people linked to it) and its portal logins. Use list_accounts to find the id.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/accounts/detail",
    schema: obj({ id: S }, ["id"]),
    buildQuery: (i) => `?id=${encodeURIComponent(str(i, "id"))}`,
    agent: { write: false, summarize: (i) => `Look up account ${str(i, "id")}` },
  },
  {
    name: "create_account",
    summary:
      "Create an account. `accountType` is 'entity' (a company) or 'individual' (a person) — nothing else is accepted. `parentAccountId` puts it under another account; leave it out for a top-level one.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/accounts",
    schema: obj(
      { accountType: S, name: S, parentAccountId: S, code: S, email: S, phone: S, address: S, currency: S, locale: S, timezone: S, status: S },
      ["accountType", "name"]
    ),
    buildBody: (i) => ({
      accountType: str(i, "accountType"),
      name: str(i, "name"),
      parentAccountId: opt(i, "parentAccountId"),
      ...accountFields(i),
    }),
    // FENCE WRITE (accounts.parent_account_id) → confirm. It takes a parent, so
    // it hangs a row inside a client's world; and it is how an email address
    // enters the books, which is what a later portal grant resolves a login
    // from. See the note above SHARED_TOOLS.
    agent: { write: true, confirm: true, summarize: (i) => `Create the account "${str(i, "name")}"` },
  },
  {
    name: "update_account",
    summary:
      "Edit an account's own details (by id) — never its place in the hierarchy; that's set_account_parent. Any field you leave out is CLEARED (status and commercialsVisible keep their current value), so send the whole record — read it with get_account first.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/accounts/update",
    schema: obj(
      { id: S, name: S, code: S, email: S, phone: S, address: S, currency: S, locale: S, timezone: S, status: S, commercialsVisible: B },
      ["id", "name"]
    ),
    buildBody: (i) => ({
      id: str(i, "id"),
      name: str(i, "name"),
      ...accountFields(i),
      commercialsVisible: typeof i.commercialsVisible === "boolean" ? i.commercialsVisible : undefined,
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Edit account ${str(i, "id")}` },
  },
  {
    name: "set_account_parent",
    summary:
      "Move an account under another one (by id), or send it back to the top by leaving `parentAccountId` out. A move that would close a loop is refused.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/accounts/parent",
    schema: obj({ id: S, parentAccountId: S }, ["id"]),
    buildBody: (i) => ({ id: str(i, "id"), parentAccountId: opt(i, "parentAccountId") ?? null }),
    // FENCE WRITE (accounts.parent_account_id) → confirm BOTH ways. The fence
    // reaches DOWN from the company a client stands in, so moving an account
    // under another hands that client everything nested beneath it — and moving
    // one out takes it away. See the note above SHARED_TOOLS.
    agent: {
      write: true, confirm: true,
      summarize: (i) =>
        str(i, "parentAccountId")
          ? `Move account ${str(i, "id")} under ${str(i, "parentAccountId")}`
          : `Move account ${str(i, "id")} to the top level`,
    },
  },
  {
    name: "set_account_active",
    summary: "Archive an account (active:false) or restore it (active:true) — never deleted; every record it carries survives.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/accounts/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    agent: {
      write: true,
      confirm: (i) => i.active !== true, // destructive only when ARCHIVING
      summarize: (i) => `${i.active === true ? "Restore" : "Archive"} account ${str(i, "id")}`,
    },
  },
  {
    name: "link_contact",
    summary:
      "Say that a person is a contact of an account: `accountId` is the company, `personAccountId` is the person's own account row (create it first with create_account if it isn't there). The same person can be a contact of more than one account.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/accounts/links",
    schema: obj({ accountId: S, personAccountId: S, relationship: S, isMainStakeholder: B }, ["accountId", "personAccountId"]),
    buildBody: (i) => ({
      accountId: str(i, "accountId"),
      personAccountId: str(i, "personAccountId"),
      relationship: opt(i, "relationship"),
      isMainStakeholder: i.isMainStakeholder === true,
    }),
    // FENCE WRITE (account_links) → confirm. A link IS a "you belong to this
    // company": a person already holding a portal login gains that company as a
    // place they may stand, and with it everything nested beneath it. No
    // permission changes hands, which is exactly why the old privilege-module
    // list waved it through. See the note above SHARED_TOOLS.
    agent: { write: true, confirm: true, summarize: (i) => `Link ${str(i, "personAccountId")} to account ${str(i, "accountId")}` },
  },
  {
    name: "set_contact_link_active",
    summary:
      "Unlink a contact from an account (active:false) or link them back (active:true), by the CONTACT LINK's id — get_account returns it. The person's own account is untouched either way.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/accounts/links/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    // FENCE WRITE (account_links) → confirm BOTH ways. Unlinking takes a company
    // away from a client login; RELINKING hands it straight back, which the old
    // "destructive only" predicate ran silently. See the note above SHARED_TOOLS.
    agent: {
      write: true, confirm: true,
      summarize: (i) => `${i.active === true ? "Relink" : "Unlink"} contact link ${str(i, "id")}`,
    },
  },

  /* ------------------------------ portal access ---------------------------- */
  {
    name: "list_portal_access",
    summary:
      "Who can log in to the client portal — every portal access the caller may see, or just one account's with `accountId`. Each row carries the person's email and whether their access is live.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/portal-users",
    schema: obj({ accountId: S }),
    buildQuery: (i) => (str(i, "accountId") ? `?accountId=${encodeURIComponent(str(i, "accountId"))}` : ""),
    agent: {
      write: false,
      summarize: (i) => (str(i, "accountId") ? `List portal access on account ${str(i, "accountId")}` : "List portal access"),
    },
  },
  {
    name: "grant_portal_access",
    summary:
      "Give someone at an account a login to the client portal. `accountId` is the account they'll see; `personAccountId` is the person, picked off that account's own records — the door reads their email from there, so it never takes a typed-in address. They must have signed in here at least once, and a member of your own team is refused.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/portal-users",
    schema: obj({ accountId: S, personAccountId: S, appRestriction: S }, ["accountId", "personAccountId"]),
    buildBody: (i) => ({
      accountId: str(i, "accountId"),
      personAccountId: str(i, "personAccountId"),
      appRestriction: opt(i, "appRestriction"),
    }),
    // PRIVILEGE WRITE (portal_users) → confirm. Handing out a login decides who
    // can SEE a customer's world; see the note above SHARED_TOOLS.
    agent: { write: true, confirm: true, summarize: (i) => `Give ${str(i, "personAccountId")} a login on account ${str(i, "accountId")}` },
  },
  {
    name: "set_portal_access_active",
    summary:
      "Revoke a portal login (active:false) or restore it (active:true), by the PORTAL ACCESS row's id — get_account and list_portal_access both return it. The login dies; every record stays.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/portal-users/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    // PRIVILEGE WRITE (portal_users) → confirm BOTH ways: revoking takes sight
    // of a customer's world away, restoring hands it back.
    agent: {
      write: true, confirm: true,
      summarize: (i) => `${i.active === true ? "Restore" : "Revoke"} portal access ${str(i, "id")}`,
    },
  },

  /* --------------------------------- roles --------------------------------- */
  {
    name: "create_role",
    summary: "Create a new team role. It starts with no access rights; use set_role_permissions to grant them.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/roles",
    schema: obj({ title: S, description: S }, ["title"]),
    buildBody: (i) => ({ title: str(i, "title"), description: str(i, "description") || "" }),
    // PRIVILEGE GRANT → confirm (see the note above SHARED_TOOLS).
    agent: { write: true, confirm: true, summarize: (i) => `Create the role "${str(i, "title")}"` },
  },
  {
    name: "update_role",
    summary: "Rename or re-describe an existing team role (by id).",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/roles/update",
    schema: obj({ roleId: S, title: S, description: S }, ["roleId", "title"]),
    buildBody: (i) => ({ roleId: str(i, "roleId"), title: str(i, "title"), description: str(i, "description") || "" }),
    // PRIVILEGE WRITE (member_roles) → confirm. Renaming isn't a grant, but a
    // rename is how a grant gets socially engineered ("call Viewer Admin").
    agent: { write: true, confirm: true, summarize: (i, names) => `Rename ${roleLabel(i, names)} to "${str(i, "title")}"` },
  },
  {
    name: "set_role_active",
    summary: "Switch a role off (deactivate — holders keep access) or back on (reactivate) — never deleted.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/roles/active",
    schema: obj({ roleId: S, active: B }, ["roleId", "active"]),
    buildBody: (i) => ({ roleId: str(i, "roleId"), active: i.active === true }),
    agent: {
      write: true,
      // PRIVILEGE WRITE (member_roles) → confirm BOTH ways. Deactivating removes
      // access; REACTIVATING hands it back to everyone still holding the role.
      confirm: true,
      summarize: (i, names) => `${i.active === true ? "Activate" : "Deactivate"} ${roleLabel(i, names)}`,
    },
  },
  {
    name: "set_role_permissions",
    summary:
      "Set a role's access rights (by role id). `value` is an object keyed by module — one of teams, team_members, member_roles, learning, help, selectable_data, screens, agent — each mapping to { read, create, edit, delete } booleans. Turning on create/edit/delete auto-enables read. The Admin role is locked (the server enforces this).",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/roles/permissions",
    schema: obj({ roleId: S, value: { type: "object" } }, ["roleId", "value"]),
    buildBody: (i) => ({ roleId: str(i, "roleId"), value: i.value }),
    // PRIVILEGE GRANT → confirm (see the note above SHARED_TOOLS).
    agent: { write: true, confirm: true, summarize: (i, names) => `Set access rights for ${roleLabel(i, names)}` },
  },

  /* -------------------------------- members -------------------------------- */
  {
    name: "set_member_role",
    summary: "Change a member's role (by user id). The last admin can't be demoted and you can't change your own role (guarded).",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/members/role",
    schema: obj({ userId: S, roleId: S }, ["userId", "roleId"]),
    buildBody: (i) => ({ userId: str(i, "userId"), roleId: str(i, "roleId") }),
    agent: {
      write: true, confirm: true, // PRIVILEGE GRANT → confirm
      summarize: (i, names) => {
        const id = str(i, "roleId")
        return `Change ${memberLabel(i, names)} to ${names?.[id] ?? `role ${id}`}`
      },
    },
  },
  {
    name: "remove_member",
    summary: "Remove a member from the team (by user id). You can't remove yourself or the last admin (guarded).",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/members/remove",
    schema: obj({ userId: S }, ["userId"]),
    buildBody: (i) => ({ userId: str(i, "userId") }),
    agent: { write: true, confirm: true, summarize: (i, names) => `Remove ${names?.[str(i, "userId")] ?? str(i, "userId")} from the team` },
  },

  /* -------------------------------- invites -------------------------------- */
  {
    name: "invite_member",
    mcpName: "create_invite",
    summary:
      "Invite someone to the team by email, assigning them a role (by role id). Sends the branded invite email. Refuses if the email is the caller's own address or someone already on the team, and returns `emailSent` so you know whether the email actually went out.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/invites",
    schema: obj({ email: S, roleId: S }, ["email", "roleId"]),
    buildBody: (i) => ({ email: str(i, "email"), roleId: str(i, "roleId") }),
    agent: {
      write: true, confirm: true, // PRIVILEGE GRANT → confirm
      summarize: (i, names) => {
        const id = str(i, "roleId")
        return `Invite ${str(i, "email")} as ${names?.[id] ?? `role ${id}`}`
      },
    },
  },
  {
    name: "revoke_invite",
    summary: "Revoke a pending invitation that hasn't been accepted yet (by invite id).",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/invites/revoke",
    schema: obj({ inviteId: S }, ["inviteId"]),
    buildBody: (i) => ({ inviteId: str(i, "inviteId") }),
    agent: { write: true, confirm: true, summarize: (i, names) => `Revoke the invite for ${names?.[str(i, "inviteId")] ?? str(i, "inviteId")}` },
  },

  /* --------------------------- dropdown values ----------------------------- */
  {
    name: "create_dropdown_value",
    summary:
      "Add a dropdown value: type = the group name, value = the option. A dropdown write NEVER invents an option — for 'create X and move things onto it', call THIS first and the write second, in the SAME turn.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/selectable",
    schema: obj({ type: S, value: S }, ["type", "value"]),
    buildBody: (i) => ({ type: str(i, "type"), value: str(i, "value") }),
    agent: { write: true, confirm: false, summarize: (i) => `Add "${str(i, "value")}" to the ${str(i, "type")} list` },
  },
  {
    name: "update_dropdown_value",
    summary: "Rename a dropdown value (by id).",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/selectable/update",
    schema: obj({ id: S, value: S }, ["id", "value"]),
    buildBody: (i) => ({ id: str(i, "id"), value: str(i, "value") }),
    agent: { write: true, confirm: false, summarize: (i) => `Rename dropdown value ${str(i, "id")} to "${str(i, "value")}"` },
  },
  {
    name: "set_dropdown_active",
    mcpName: "set_dropdown_value_active",
    summary: "Switch a dropdown value off (deactivate) or back on (reactivate) — never deleted.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/selectable/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    agent: {
      write: true,
      confirm: (i) => i.active !== true, // destructive only when DEACTIVATING
      summarize: (i) => `${i.active === true ? "Activate" : "Deactivate"} dropdown value ${str(i, "id")}`,
    },
  },

  /* -------------------------------- learning ------------------------------- */
  {
    name: "create_learning",
    summary: "Create a new learning / how-to article (title required; category is picked-or-created).",
    binding: "CONTENT", method: "POST", path: "/api/content/learning",
    schema: obj(
      { title: S, category: S, description: S, contentType: S, contentLink: S, body: S, sequence: N, required: B },
      ["title"]
    ),
    buildBody: (i) => learningBody(i),
    agent: { write: true, confirm: false, summarize: (i) => `Create the learning article "${str(i, "title")}"` },
  },
  {
    name: "update_learning",
    summary: "Edit an existing learning article (by id).",
    binding: "CONTENT", method: "POST", path: "/api/content/learning/update",
    schema: obj(
      { id: S, title: S, category: S, description: S, contentType: S, contentLink: S, body: S, sequence: N, required: B },
      ["id", "title"]
    ),
    buildBody: (i) => ({ id: str(i, "id"), ...learningBody(i) }),
    agent: { write: true, confirm: false, summarize: (i) => `Edit learning article ${str(i, "id")}` },
  },
  {
    name: "set_learning_active",
    summary: "Switch a learning article off (deactivate — member progress survives) or back on (reactivate) — never deleted.",
    binding: "CONTENT", method: "POST", path: "/api/content/learning/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    agent: {
      write: true,
      confirm: (i) => i.active !== true, // destructive only when DEACTIVATING
      summarize: (i) => `${i.active === true ? "Activate" : "Deactivate"} learning article ${str(i, "id")}`,
    },
  },

  {
    name: "mark_learning_done",
    summary: "Mark a learning article done (or not done) for YOURSELF — never for anyone else. Everyone's done state is a separate read (the curator's progress view).",
    binding: "CONTENT", method: "POST", path: "/api/content/learning/done",
    schema: obj({ id: S, done: B }, ["id", "done"]),
    buildBody: (i) => ({ id: str(i, "id"), done: i.done === true }),
    agent: {
      write: true, confirm: false,
      summarize: (i) => `Mark learning article ${str(i, "id")} ${i.done === true ? "done" : "not done"}`,
    },
  },

  /* ---------------------------------- help --------------------------------- */
  {
    name: "raise_help_ticket",
    mcpName: "create_help_ticket",
    summary: "Raise a new support ticket for the team (description required).",
    binding: "CONTENT", method: "POST", path: "/api/content/help",
    schema: obj({ description: S, helpType: S, screenRecordingLink: S }, ["description"]),
    buildBody: (i) => ({ description: str(i, "description"), helpType: opt(i, "helpType"), screenRecordingLink: opt(i, "screenRecordingLink") }),
    agent: { write: true, confirm: false, summarize: (i) => `Raise a support ticket: "${str(i, "description").slice(0, 60)}"` },
  },
  {
    name: "update_help_ticket",
    summary: "Edit a support ticket's details (by id).",
    binding: "CONTENT", method: "POST", path: "/api/content/help/update",
    schema: obj({ id: S, description: S, helpType: S, screenRecordingLink: S }, ["id", "description"]),
    buildBody: (i) => ({ id: str(i, "id"), description: str(i, "description"), helpType: opt(i, "helpType"), screenRecordingLink: opt(i, "screenRecordingLink") }),
    agent: { write: true, confirm: false, summarize: (i) => `Edit support ticket ${str(i, "id")}` },
  },
  {
    name: "set_help_status",
    summary: "Move a support ticket along its lifecycle (open, in_progress, resolved, reopened), by id.",
    binding: "CONTENT", method: "POST", path: "/api/content/help/status",
    schema: obj({ id: S, status: S }, ["id", "status"]),
    buildBody: (i) => ({ id: str(i, "id"), status: str(i, "status") }),
    agent: { write: true, confirm: false, summarize: (i) => `Set ticket ${str(i, "id")} to "${str(i, "status")}"` },
  },
  {
    name: "reply_help_ticket",
    summary: "Add a reply to a support ticket's thread (by id).",
    binding: "CONTENT", method: "POST", path: "/api/content/help/reply",
    schema: obj({ helpId: S, body: S }, ["helpId", "body"]),
    buildBody: (i) => ({ helpId: str(i, "helpId"), body: str(i, "body") }),
    agent: { write: true, confirm: false, summarize: (i) => `Reply to ticket ${str(i, "helpId")}` },
  },
  {
    name: "add_help_stakeholder",
    summary:
      "Pull a teammate into a support ticket so they follow it (`id` = the ticket, `userId` = the person). Add-only — it never removes anyone.",
    binding: "CONTENT", method: "POST", path: "/api/content/help/stakeholders",
    schema: obj({ id: S, userId: S }, ["id", "userId"]),
    buildBody: (i) => ({ id: str(i, "id"), userId: str(i, "userId") }),
    agent: { write: true, confirm: false, summarize: (i) => `Add someone to ticket ${str(i, "id")}` },
  },
]

/** The permission each SHARED WRITE needs (module:right). The door ENFORCES it; this is
 * only the developer hint the MCP `tools/list` description shows external clients ("…
 * Needs member_roles:create."). Keyed by canonical name (works for the mcpName ones too).
 * Reads carry no hint (they just need the module's read right). */
export const TOOL_GATES: Record<string, string> = {
  update_team: "teams:edit",
  create_account: "accounts:create",
  update_account: "accounts:edit",
  set_account_parent: "accounts:edit",
  set_account_active: "accounts:delete",
  link_contact: "accounts:create",
  set_contact_link_active: "accounts:delete",
  grant_portal_access: "portal_users:create",
  set_portal_access_active: "portal_users:delete",
  add_help_stakeholder: "help:read",
  create_role: "member_roles:create",
  update_role: "member_roles:edit",
  set_role_active: "member_roles:delete",
  set_role_permissions: "member_roles:edit",
  set_member_role: "team_members:edit",
  remove_member: "team_members:delete",
  invite_member: "team_members:create",
  revoke_invite: "team_members:delete",
  create_dropdown_value: "selectable_data:create",
  update_dropdown_value: "selectable_data:edit",
  set_dropdown_active: "selectable_data:delete",
  create_learning: "learning:create",
  update_learning: "learning:edit",
  set_learning_active: "learning:delete",
  mark_learning_done: "learning:read",
  raise_help_ticket: "help:create",
  update_help_ticket: "help:edit",
  set_help_status: "help:edit",
  reply_help_ticket: "help:read",
}

/** Lookup by canonical name (the agent's name). */
/** The MODULES whose rows decide WHO CAN DO WHAT — the permission matrix, and
 * `portal_users` because a portal grant is the same order of decision: it hands
 * a person outside the team sight of a customer's whole world. One half of
 * "access"; the other half is the ACCOUNT FENCE below. */
export const PRIVILEGE_MODULES = ["member_roles", "team_members", "portal_users"]

/** A path or a field name, as a bag of lowercase words. */
const words = (s: string): Set<string> => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))

/** A body field is its column in camel: "parentAccountId" → "parent_account_id". */
const snake = (s: string): string => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()

/** Does this tool's door write an input to the ACCOUNT FENCE?
 *
 * DERIVED from the fence's own inputs — `FENCE_INPUTS`, declared beside the SQL
 * that reads them — against the two things a catalogued tool declares about its
 * door: the PATH (a door is named after the table it writes: /accounts/links →
 * `account_links`, /portal-users → `portal_users`) and, for a table the fence
 * reads only ONE column of, the BODY FIELD carrying that column
 * (`parent_account_id` → `parentAccountId`). Editing an account's name touches
 * no fence input and stays free; re-parenting it or linking a contact does not.
 *
 * This reads NAMES, so it is the belt, not the proof: a door named something
 * else would slip past it. The proof is `workers/tenancy/test/fence-confirm.test.ts`,
 * which reads the tenancy doors' own SOURCE, works out which of them really
 * write a fence input, and fails if any is reachable from a tool this missed. */
function touchesAccountFence(tool: { path: string; schema?: Record<string, unknown> }): boolean {
  const inPath = words(tool.path)
  const fields = Object.keys((tool.schema?.properties ?? {}) as Record<string, unknown>).map(snake)
  for (const [table, columns] of Object.entries(FENCE_INPUTS)) {
    // "account_links" is the door at /accounts/links; "portal_users" at /portal-users.
    if (!table.split("_").every((w) => inPath.has(w) || inPath.has(`${w}s`))) continue
    if (columns.length === 0 || columns.some((c) => fields.includes(c))) return true
  }
  return false
}

/** Is this an ACCESS write — one that changes who can do what, or who can see
 * whose? DERIVED, never a list of names: a name list locks the tools you thought
 * of and waves through the next one, which is exactly how `update_role` sat at
 * confirm:false beside four that confirmed, and then how `link_contact` and
 * `set_account_parent` did the same to the account fence.
 *
 * Two derivations, because there are two ways to widen someone's reach:
 *   • the tool's own declared GATE lands on a privilege module (falling back to
 *     the door it posts to, so an agent-only tool can't slip through by being
 *     absent from TOOL_GATES) — who can DO what;
 *   • or its door writes an input to the account fence — who can SEE whose. */
export function isPrivilegeWrite(tool: {
  name: string
  path: string
  write?: boolean
  schema?: Record<string, unknown>
}): boolean {
  if (tool.write === false) return false
  if (touchesAccountFence(tool)) return true
  const gate = TOOL_GATES[tool.name]
  if (gate) return PRIVILEGE_MODULES.includes(gate.split(":")[0])
  return /\/api\/tenancy\/(roles|members|invites)\b/.test(tool.path)
}

export const sharedByName = (name: string): SharedTool | undefined => SHARED_TOOLS.find((t) => t.name === name)
