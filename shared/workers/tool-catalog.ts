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

import { FENCE_IDENTITY_INPUTS, FENCE_INPUTS, FENCED_ROW_OWNERS } from "./account-scope"
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

/** An ACCOUNT reference for a summary — "Jane Patel (jane@patel.co)" when the id
 * resolved, else "account <id>".
 *
 * This is the line that makes a portal-grant panel readable, and readable is the
 * whole of its security value: the door resolves the person's login from the
 * EMAIL on their account row, so a panel naming only a ULID asks an admin to
 * approve an address it won't show them. `resolveNames` (workers/data-ops) fills
 * `names` with name AND email for exactly this reason. Falling back to the raw id
 * is honest about knowing less, rather than inventing a name. */
export const accountLabel = (
  input: Record<string, unknown>,
  key: string,
  names?: Record<string, string>
): string => {
  const id = str(input, key)
  return names?.[id] ?? `account ${id}`
}

/** A field EXACTLY as the caller sent it, or nothing at all if they didn't.
 *
 * `opt` cannot express this: it folds an empty string into `undefined`, which
 * JSON.stringify then drops, so "" and "never mentioned" arrive at the door as
 * the same request. On the account EDIT door those are now opposite instructions
 * — clear this field, versus leave it alone — so the distinction has to survive
 * the trip. (On create both still mean "no value", so nothing changes there.) */
const sent = (i: Record<string, unknown>, key: string): string | undefined =>
  key in i ? str(i, key) : undefined

/** The optional fields an account carries — the SAME set on create and edit, so
 * the two tools can't drift into different shapes (the door validates them
 * identically for exactly that reason). */
const accountFields = (i: Record<string, unknown>): Record<string, unknown> => ({
  code: sent(i, "code"),
  email: sent(i, "email"),
  phone: sent(i, "phone"),
  address: sent(i, "address"),
  currency: sent(i, "currency"),
  locale: sent(i, "locale"),
  timezone: sent(i, "timezone"),
  status: sent(i, "status"),
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
      "List the team's tickets. scope: 'mine' (yours) or 'all' (default all); view: 'live' (default — the everyday list) or 'archived' (tickets that have been put away); pass `id` to fetch just one ticket, archived or not. Returns ONE page plus the exact `total`, `hasMore`, and an opaque `nextCursor` — to read further, call again passing that value as `cursor` (never invent one).",
    binding: "CONTENT", method: "GET", path: "/api/content/help",
    schema: obj({ scope: S, view: S, id: S, cursor: S }),
    buildQuery: (i) => {
      const q = [str(i, "scope") === "mine" ? "scope=mine" : "scope=all"]
      // Forwarded only when the caller asked for the archive: the door defaults
      // to the live list, and sending `view=live` on every call would be noise
      // the model has to keep re-reading.
      if (str(i, "view") === "archived") q.push("view=archived")
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
      "Edit an account's own details (by id) — never its place in the hierarchy; that's set_account_parent. Send ONLY the fields you are changing: anything you leave out keeps its current value. To empty a field, send it as an empty string.",
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
    // IDENTITY WRITE (accounts.email) → confirm. It carries the same field
    // create_account confirms for, and for the same stated reason: an account's
    // email "is what a later portal grant resolves a login from". Only the CREATE
    // half was ever guarded, so the UPDATE could re-point an existing customer
    // contact's address in silence — its trace line reads "Edit account 01J…" —
    // and the next grant on that person hands their portal to the new address.
    // See FENCE_IDENTITY_INPUTS and the note above SHARED_TOOLS.
    agent: { write: true, confirm: true, summarize: (i) => `Edit account ${str(i, "id")}` },
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
    //
    // And the panel NAMES BOTH ENDS. It used to print the two raw ULIDs — "Give
    // 01JXXXX… a login on account 01JYYYY…" — which is a yes/no question an admin
    // cannot actually answer, on the one write where the answer matters most: the
    // door resolves this person's login from the EMAIL on their account row, so
    // whoever holds that address gets the customer's whole world. Resolving to
    // name AND email is what lets the human check the address before saying yes.
    agent: {
      write: true, confirm: true,
      summarize: (i, names) =>
        `Give ${accountLabel(i, "personAccountId", names)} a login on ${accountLabel(i, "accountId", names)}`,
    },
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
    summary:
      "Create a new team role. It starts with no access rights unless you pass `permissions` — the same object set_role_permissions takes (keyed by module → { read, create, edit, delete }). Creating WITH a matrix is create + edit in one move, so the door demands member_roles:edit on top of member_roles:create; leave it out for a plain create and grant rights afterwards.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/roles",
    schema: obj({ title: S, description: S, permissions: { type: "object" } }, ["title"]),
    buildBody: (i) => ({
      title: str(i, "title"),
      description: str(i, "description") || "",
      // R22 — the door reads `permissions`, so the tool offers it. Only SENT when
      // one arrived (an undefined key drops out of JSON.stringify), so a plain
      // create still needs member_roles:create alone and never trips the door's
      // second gate. checkArgTypes has already refused anything but an object.
      permissions: typeof i.permissions === "object" && i.permissions !== null ? i.permissions : undefined,
    }),
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

  /* --------------------------------- tickets -------------------------------- */
  {
    name: "raise_help_ticket",
    mcpName: "create_help_ticket",
    summary:
      "Raise a new support ticket (description required). `accountId` names the CLIENT it is raised for — use it whenever the ticket is on a client's behalf, because the client's own people see their company's tickets and a ticket with no client belongs to nobody. Leave it off only for the agency's own internal questions. A client-portal caller cannot set it; theirs is always their own company.",
    binding: "CONTENT", method: "POST", path: "/api/content/help",
    schema: obj({ description: S, helpType: S, screenRecordingLink: S, accountId: S }, ["description"]),
    // accountId is read in lib/help.ts, not in the handler, so R22's source scan
    // cannot derive it (see its own note on fields forwarded wholesale to a lib).
    // Exposed by hand, deliberately: without it a machine can only raise tickets
    // that no client will ever see.
    buildBody: (i) => ({ description: str(i, "description"), helpType: opt(i, "helpType"), screenRecordingLink: opt(i, "screenRecordingLink"), accountId: opt(i, "accountId") }),
    // CONFIRM, because `accountId` decides WHO CAN READ THIS TICKET. Naming a
    // client puts the conversation in their portal — the same order of decision
    // as a permission grant, reached by a model that has been reading ticket text
    // a client wrote. (isPrivilegeWrite derives this too; the catalog declares it
    // so it reads honestly — see workers/content/test/fence-row-confirm.test.ts.)
    agent: { write: true, confirm: true, summarize: (i) => `Raise a support ticket: "${str(i, "description").slice(0, 60)}"` },
  },
  {
    name: "update_help_ticket",
    summary:
      "Edit a support ticket's details (by id). `accountId` names the client a ticket has none for — it can be SET once and never moved, because moving a ticket would take the conversation away from the people reading it.",
    binding: "CONTENT", method: "POST", path: "/api/content/help/update",
    schema: obj({ id: S, description: S, helpType: S, screenRecordingLink: S, accountId: S }, ["id", "description"]),
    // Same note as create_help_ticket: read in lib/help.ts, so R22's scan cannot
    // derive it. Exposed by hand.
    buildBody: (i) => ({ id: str(i, "id"), description: str(i, "description"), helpType: opt(i, "helpType"), screenRecordingLink: opt(i, "screenRecordingLink"), accountId: opt(i, "accountId") }),
    // CONFIRM, and this is the one that mattered. The door SETS `account_id` on a
    // ticket that had none, and a ticket carries its whole reply history — so one
    // silent call could hand an internal agency conversation to a client's portal.
    // It ran with no panel because the confirm derivation only knew about tables
    // the fence READS, and `help` is a table the fence is APPLIED TO.
    agent: { write: true, confirm: true, summarize: (i) => `Edit support ticket ${str(i, "id")}` },
  },
  {
    name: "set_help_status",
    summary:
      "Move a ticket along its lifecycle, by id. In order: new (raised, nobody has read it), triaged (read and sorted), in_progress (being worked on), ready (every piece of work is done, the client has not been told yet), resolved (answered and closed). Moving a resolved ticket back to triaged is how a ticket is reopened — there is no separate reopened state.",
    binding: "CONTENT", method: "POST", path: "/api/content/help/status",
    schema: obj({ id: S, status: S }, ["id", "status"]),
    buildBody: (i) => ({ id: str(i, "id"), status: str(i, "status") }),
    agent: { write: true, confirm: false, summarize: (i) => `Set ticket ${str(i, "id")} to "${str(i, "status")}"` },
  },
  {
    // Drag-rank is the ONLY priority signal the product has (SCOPE ch.07), so
    // "make this one more urgent" has exactly one honest answer on this surface,
    // and this is it. Neighbours rather than a position, for the same reason the
    // door takes them: a position is arithmetic over a list that has since moved.
    name: "rank_help_ticket",
    summary:
      "Move a ticket up or down the list, by id. There is no priority field — the list's ORDER is the priority. Name the neighbours it should sit between: `afterId` is the ticket it goes below (higher up the list) and `beforeId` the one it goes above. Omit `afterId` to put it at the very top, `beforeId` to put it at the very bottom.",
    binding: "CONTENT", method: "POST", path: "/api/content/help/rank",
    schema: obj({ id: S, afterId: S, beforeId: S }, ["id"]),
    buildBody: (i) => ({ id: str(i, "id"), afterId: str(i, "afterId"), beforeId: str(i, "beforeId") }),
    agent: { write: true, confirm: false, summarize: (i) => `Reorder ticket ${str(i, "id")}` },
  },
  {
    name: "archive_help_ticket",
    summary:
      "Put a ticket away, or take it back out (`archived`: true to archive, false to restore). Available whatever state it is in. NOTHING is deleted — the ticket, its conversation and its history all survive; it simply stops appearing in the everyday list. Read them back with list_help_tickets and view: 'archived'.",
    binding: "CONTENT", method: "POST", path: "/api/content/help/archive",
    schema: obj({ id: S, archived: B }, ["id", "archived"]),
    buildBody: (i) => ({ id: str(i, "id"), archived: i.archived === true }),
    agent: {
      write: true,
      confirm: false,
      summarize: (i) => `${i.archived === true ? "Archive" : "Restore"} ticket ${str(i, "id")}`,
    },
  },
  {
    name: "reply_help_ticket",
    summary:
      "Add a reply to a support ticket's thread (by id). `taggedUserIds` @mentions teammates by user id (from list_members or list_help_stakeholders) — each one starts following the ticket AND is emailed the reply. A mention is notify-only, never an instruction; the door de-dupes the list, drops your own id, and refuses more than 50 people.",
    binding: "CONTENT", method: "POST", path: "/api/content/help/reply",
    schema: obj({ helpId: S, body: S, taggedUserIds: { type: "array" } }, ["helpId", "body"]),
    buildBody: (i) => ({
      helpId: str(i, "helpId"),
      body: str(i, "body"),
      // R22 — the door reads `taggedUserIds`, so the tool offers it, and the
      // door's own guards then apply UNCHANGED: a client login is refused
      // mentions outright, the list is de-duped, the author's id stripped, the
      // count capped, and every id resolved through team_members so an address
      // outside the team can never be reached. Omitted when absent.
      taggedUserIds: Array.isArray(i.taggedUserIds) ? i.taggedUserIds : undefined,
    }),
    agent: {
      write: true,
      // A PLAIN REPLY DOES NOT CONFIRM. A reply WITH AN AUDIENCE DOES.
      //
      // Two lanes disagreed about this on the same afternoon and both were right
      // at the moment they looked. R22 made the tool expose `taggedUserIds`,
      // because the door reads it and a machine must not get a narrower contract
      // than the screen. A security sweep then measured the tool BEFORE that
      // landed, saw a builder that dropped the field, and refuted the finding —
      // correctly, for the tree it was reading.
      //
      // With the field forwarded, the finding is real: this tool is gated on
      // `help:read`, the lowest bar in the catalogue, and a mention sends a
      // branded email from the verified sender carrying a preview of text the
      // model was handed — text that can arrive in a ticket description written
      // by a client. So the model may answer a ticket freely, and must ask before
      // it addresses a roomful of people in the caller's name.
      confirm: (i) => Array.isArray(i.taggedUserIds) && i.taggedUserIds.length > 0,
      summarize: (i) => {
        const to = Array.isArray(i.taggedUserIds) ? i.taggedUserIds.length : 0
        return to
          ? `Reply to ticket ${str(i, "helpId")} and email ${to} ${to === 1 ? "person" : "people"}`
          : `Reply to ticket ${str(i, "helpId")}`
      },
    },
  },
  /* ------------------------------ the work engine ---------------------------- */
  // A ticket is what an account ASKS FOR; a story is what WE DO about it. Keeping
  // the two apart matters more on this surface than anywhere else, because the
  // model is the one caller that cannot see the screens: told only about tickets
  // it would answer "what are we working on?" with a list of requests, which is a
  // different question and a wrong answer. Every tool here sits on a door that
  // refuses a client login outright (R21), so none of them can be reached by one.
  {
    name: "list_stories",
    summary:
      "List the team's STORIES — the pieces of work WE do, as opposed to the tickets a client raises. Filters: `status` (open / in_progress / in_review / done), `ticketId` (the work on one request), `sprintId`, `assigneeId`, and `view` ('open' by default, which hides finished work — pass 'all' to include it). Pass `id` to fetch one story. Returns ONE page plus the exact `total`, `hasMore`, and an opaque `nextCursor` — to read further, call again passing that value as `cursor` (never invent one).",
    binding: "CONTENT", method: "GET", path: "/api/content/stories",
    schema: obj({ id: S, status: S, ticketId: S, sprintId: S, assigneeId: S, view: S, cursor: S }),
    buildQuery: (i) => {
      const q: string[] = []
      for (const k of ["id", "status", "ticketId", "sprintId", "assigneeId", "view", "cursor"])
        if (str(i, k)) q.push(`${k}=${encodeURIComponent(str(i, k))}`)
      return q.length ? `?${q.join("&")}` : ""
    },
    agent: { write: false, summarize: (i) => (str(i, "id") ? "Look up one story" : "List the work in hand") },
  },
  {
    name: "create_story",
    summary:
      "Write down one piece of work. Only `title` is required. `ticketId` links it to the request it answers — most work has none, so leave it off unless you know the ticket. `stepKey` names the process step this work changes and `changesNoStep` says it changes none; one of the two is REQUIRED before the story can be marked done, so set it now if you know it. There is deliberately NO story type: the ticket carries the type.",
    binding: "CONTENT", method: "POST", path: "/api/content/stories",
    schema: obj(
      {
        title: S, detail: S, ticketId: S, sprintId: S, appId: S, processId: S,
        stepKey: S, changesNoStep: B, assigneeId: S, reviewerId: S, startsOn: S, dueOn: S, accountId: S,
      },
      ["title"]
    ),
    // Every field the door reads off the body, forwarded. Most are read inside
    // lib/stories.ts rather than in the handler, exactly as create_help_ticket's
    // `accountId` is — exposed by hand for the same reason: without them a machine
    // could only write a title.
    buildBody: (i) => ({
      title: str(i, "title"),
      detail: opt(i, "detail"),
      ticketId: opt(i, "ticketId"),
      sprintId: opt(i, "sprintId"),
      appId: opt(i, "appId"),
      processId: opt(i, "processId"),
      stepKey: opt(i, "stepKey"),
      changesNoStep: i.changesNoStep === true ? true : undefined,
      assigneeId: opt(i, "assigneeId"),
      reviewerId: opt(i, "reviewerId"),
      startsOn: opt(i, "startsOn"),
      dueOn: opt(i, "dueOn"),
      accountId: opt(i, "accountId"),
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Add a story: "${str(i, "title").slice(0, 60)}"` },
  },
  {
    name: "update_story",
    summary:
      "Edit a story (by id). Same fields as create_story; `title` stays required. Re-pointing it at another ticket moves the work onto that client's books, which is why the reference number does NOT follow — a client may already be quoting it.",
    binding: "CONTENT", method: "POST", path: "/api/content/stories/update",
    schema: obj(
      {
        id: S, title: S, detail: S, ticketId: S, sprintId: S, appId: S, processId: S,
        stepKey: S, changesNoStep: B, assigneeId: S, reviewerId: S, startsOn: S, dueOn: S, accountId: S,
      },
      ["id", "title"]
    ),
    buildBody: (i) => ({
      id: str(i, "id"),
      title: str(i, "title"),
      detail: opt(i, "detail"),
      ticketId: opt(i, "ticketId"),
      sprintId: opt(i, "sprintId"),
      appId: opt(i, "appId"),
      processId: opt(i, "processId"),
      stepKey: opt(i, "stepKey"),
      changesNoStep: i.changesNoStep === true ? true : undefined,
      assigneeId: opt(i, "assigneeId"),
      reviewerId: opt(i, "reviewerId"),
      startsOn: opt(i, "startsOn"),
      dueOn: opt(i, "dueOn"),
      accountId: opt(i, "accountId"),
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Edit story ${str(i, "id")}` },
  },
  {
    name: "set_story_status",
    summary:
      "Move a story along its four states, by id: open, in_progress, in_review (someone is checking it), done. `closingNote` is what we will tell the client, and it is appended to the ticket's DRAFT resolution rather than sent. A story CANNOT be set to done until it names the process step it changed (`stepKey` on the story) or is marked as changing none — the door refuses with 'step_required' rather than guessing, because every savings figure is computed from that answer.",
    binding: "CONTENT", method: "POST", path: "/api/content/stories/status",
    schema: obj({ id: S, status: S, closingNote: S }, ["id", "status"]),
    buildBody: (i) => ({ id: str(i, "id"), status: str(i, "status"), closingNote: opt(i, "closingNote") }),
    agent: {
      write: true,
      confirm: false,
      summarize: (i) => `Set story ${str(i, "id")} to "${str(i, "status")}"`,
    },
  },
  {
    name: "rank_story",
    summary:
      "Move a story up or down the backlog, by id. There is no priority field — the list's ORDER is the priority, exactly as it is for tickets. Name the neighbours it should sit between: `afterId` is the story it goes below (higher up) and `beforeId` the one it goes above. Omit `afterId` for the very top, `beforeId` for the very bottom.",
    binding: "CONTENT", method: "POST", path: "/api/content/stories/rank",
    schema: obj({ id: S, afterId: S, beforeId: S }, ["id"]),
    buildBody: (i) => ({ id: str(i, "id"), afterId: str(i, "afterId"), beforeId: str(i, "beforeId") }),
    agent: { write: true, confirm: false, summarize: (i) => `Reorder story ${str(i, "id")}` },
  },
  {
    name: "list_sprints",
    summary:
      "List the blocks of delivery work sold, newest first — each with its kind, its dates, the flat price it was sold for (in whole cents) and how many of its stories are done. Pass `accountId` for one client's. Bounded, not paged: a sprint is a contract, so there are few of them.",
    binding: "CONTENT", method: "GET", path: "/api/content/sprints",
    schema: obj({ accountId: S }),
    buildQuery: (i) => (str(i, "accountId") ? `?accountId=${encodeURIComponent(str(i, "accountId"))}` : ""),
    agent: { write: false, summarize: () => "List sprints" },
  },
  {
    name: "create_sprint",
    summary:
      "Start a sprint — a block of delivery work sold to one account, with a start, an end and a flat price. `soldPriceCents` is WHOLE CENTS (4500 euros is 450000), because a fractional price loses money between here and a margin. `sprintType` is Planning, Implementation or Iteration; a 'blueprint' is a PRICED PLANNING sprint, not a fourth kind.",
    binding: "CONTENT", method: "POST", path: "/api/content/sprints",
    schema: obj(
      { name: S, goal: S, sprintType: S, accountId: S, appId: S, startsOn: S, endsOn: S, soldPriceCents: N, currency: S },
      ["name"]
    ),
    buildBody: (i) => ({
      name: str(i, "name"),
      goal: opt(i, "goal"),
      sprintType: opt(i, "sprintType"),
      accountId: opt(i, "accountId"),
      appId: opt(i, "appId"),
      startsOn: opt(i, "startsOn"),
      endsOn: opt(i, "endsOn"),
      soldPriceCents: typeof i.soldPriceCents === "number" ? i.soldPriceCents : undefined,
      currency: opt(i, "currency"),
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Start sprint "${str(i, "name")}"` },
  },
  {
    name: "complete_sprint",
    summary:
      "Mark a sprint finished, or reopen it (`complete`: true / false). Completing one CUTS A VERSION of every process map beneath it — the point from which the next savings figure is measured — so it is not a label, it is an event. Re-completing an already-complete sprint changes nothing and cuts nothing.",
    binding: "CONTENT", method: "POST", path: "/api/content/sprints/complete",
    schema: obj({ id: S, complete: B }, ["id", "complete"]),
    buildBody: (i) => ({ id: str(i, "id"), complete: i.complete === true }),
    agent: {
      write: true,
      // CONFIRM, and it is the only work-engine write that does. Completing a
      // sprint is not an edit to a row — it is the moment a process map's next
      // version is cut, which is the baseline every later savings figure a client
      // is shown is subtracted from. A model reaching it while reading a ticket
      // somebody else wrote should stop and ask.
      confirm: (i) => i.complete === true,
      summarize: (i) => `${i.complete === true ? "Complete" : "Reopen"} sprint ${str(i, "id")}`,
    },
  },
  /* --------------------------------- triage --------------------------------- */
  {
    name: "get_triage",
    summary:
      "Whose week it is on triage duty, and every ticket nobody has read yet that has been sitting more than three days — oldest first, with how many days each has waited. An INTERNAL prompt: it is never shown to a client and implies no service-level promise. Pass `week` (any date in it) to ask who was on duty for a different week.",
    binding: "CONTENT", method: "GET", path: "/api/content/triage",
    schema: obj({ week: S }),
    buildQuery: (i) => (str(i, "week") ? `?week=${encodeURIComponent(str(i, "week"))}` : ""),
    agent: { write: false, summarize: () => "Check what's waiting to be triaged" },
  },
  {
    name: "set_triage_duty",
    summary:
      "Put one named person on triage duty for a week — `userId` from list_members, and `week` as any date inside it (it snaps to that Monday; leave it off for this week). Exactly one person holds a week: naming a second replaces the first.",
    binding: "CONTENT", method: "POST", path: "/api/content/triage",
    schema: obj({ userId: S, week: S }, ["userId"]),
    buildBody: (i) => ({ userId: str(i, "userId"), week: opt(i, "week") }),
    agent: {
      write: true,
      confirm: false,
      summarize: (i, names) => `Put ${memberLabel(i, names)} on triage duty`,
    },
  },
  /* ---------------------------- to-dos and tasks ---------------------------- */
  // The two nouns that are the same shape and opposite audiences, and the model
  // needs to be told which is which more than a person does — a person reads two
  // different screens, and the assistant reads two tool descriptions.
  {
    name: "list_todos",
    summary:
      "List the things we are WAITING ON A CLIENT FOR — never our own admin, which is list_tasks. Each carries the reference the client quotes, the due date, whether they have completed it and the file they sent if there is one. `view` is 'open' by default; pass 'all' to include the completed. `accountId` narrows to one client.",
    binding: "CONTENT", method: "GET", path: "/api/content/todos",
    schema: obj({ accountId: S, view: S }),
    buildQuery: (i) => {
      const q: string[] = []
      for (const k of ["accountId", "view"]) if (str(i, k)) q.push(`${k}=${encodeURIComponent(str(i, k))}`)
      return q.length ? `?${q.join("&")}` : ""
    },
    agent: { write: false, summarize: () => "List what we're waiting on clients for" },
  },
  {
    name: "raise_todo",
    summary:
      "Ask a client for something — `accountId` says which client and `title` says what we need. A to-do sits in THEIR portal with a due date, and they complete it and attach a file themselves. Use it only for something we genuinely cannot proceed without; our own admin is create_task and a piece of delivery work is create_story.",
    binding: "CONTENT", method: "POST", path: "/api/content/todos",
    schema: obj({ accountId: S, title: S, detail: S, dueOn: S, ticketId: S }, ["accountId", "title"]),
    buildBody: (i) => ({
      accountId: str(i, "accountId"),
      title: str(i, "title"),
      detail: opt(i, "detail"),
      dueOn: opt(i, "dueOn"),
      ticketId: opt(i, "ticketId"),
    }),
    agent: {
      write: true,
      // CONFIRM, and it is the only CONSTRUCTIVE write in the work engine that
      // does. This door SENDS EMAIL to a client — one of two in the whole product
      // that reach outside the building — from the team's verified sender, and
      // the model reaches it while reading text a client wrote. A wrong story is
      // a row somebody deletes; a wrong to-do is a demand in a customer's inbox.
      confirm: true,
      summarize: (i, names) =>
        `Ask ${accountLabel(i, "accountId", names)} for "${str(i, "title").slice(0, 50)}" — this emails them`,
    },
  },
  {
    name: "complete_todo",
    summary:
      "Mark a to-do done, by id. Usually the client does this themselves in their portal; a staff member does it when the thing arrived another way (on the phone, by email). Completing an already-completed to-do changes nothing.",
    binding: "CONTENT", method: "POST", path: "/api/content/todos/complete",
    schema: obj({ id: S }, ["id"]),
    // The file half is NOT on this surface — see NARROWED_BODY_FIELDS.
    buildBody: (i) => ({ id: str(i, "id") }),
    agent: { write: true, confirm: false, summarize: (i) => `Mark to-do ${str(i, "id")} done` },
  },
  {
    name: "cancel_todo",
    summary:
      "Withdraw a to-do we no longer need, by id. Nothing is deleted — it leaves the client's list and the decision stays on the record. Their side is simply told nothing, which is the point: an email saying 'ignore the last email' is worse than silence.",
    binding: "CONTENT", method: "POST", path: "/api/content/todos/cancel",
    schema: obj({ id: S }, ["id"]),
    buildBody: (i) => ({ id: str(i, "id") }),
    agent: { write: true, confirm: false, summarize: (i) => `Withdraw to-do ${str(i, "id")}` },
  },
  {
    name: "list_tasks",
    summary:
      "List KWAPSO'S OWN internal admin — never anything a client sees, which is list_todos. `view` is 'open' by default; pass 'all' for the finished ones. `assigneeId` narrows to one person's.",
    binding: "CONTENT", method: "GET", path: "/api/content/tasks",
    schema: obj({ view: S, assigneeId: S }),
    buildQuery: (i) => {
      const q: string[] = []
      for (const k of ["view", "assigneeId"]) if (str(i, k)) q.push(`${k}=${encodeURIComponent(str(i, k))}`)
      return q.length ? `?${q.join("&")}` : ""
    },
    agent: { write: false, summarize: () => "List our own admin" },
  },
  {
    name: "create_task",
    summary:
      "Write down a piece of OUR OWN admin — the quarterly VAT return, renewing a domain, preparing next week's review. Nobody outside the agency ever sees one. `accountId` is optional and usually left off; naming a client is for admin ABOUT them (chasing an invoice), which is what puts the time in the right margin. Time can be logged against a task, unlike a to-do.",
    binding: "CONTENT", method: "POST", path: "/api/content/tasks",
    schema: obj({ title: S, detail: S, dueOn: S, assigneeId: S, accountId: S }, ["title"]),
    buildBody: (i) => ({
      title: str(i, "title"),
      detail: opt(i, "detail"),
      dueOn: opt(i, "dueOn"),
      assigneeId: opt(i, "assigneeId"),
      accountId: opt(i, "accountId"),
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Add a task: "${str(i, "title").slice(0, 50)}"` },
  },
  {
    name: "set_task_done",
    summary: "Tick a task off, or put it back (`done`: true / false), by id. Ticking a done task changes nothing.",
    binding: "CONTENT", method: "POST", path: "/api/content/tasks/done",
    schema: obj({ id: S, done: B }, ["id", "done"]),
    buildBody: (i) => ({ id: str(i, "id"), done: i.done === true }),
    agent: {
      write: true,
      confirm: false,
      summarize: (i) => `${i.done === true ? "Finish" : "Reopen"} task ${str(i, "id")}`,
    },
  },
  /* ---------------------------------- time ---------------------------------- */
  // "Logging time takes too many clicks" is the thing the owner named as most
  // likely to make him abandon this (.plans/BUILD-1 §5), and a machine surface is
  // one of the answers to it: "start a timer on the dispatch story" said out loud
  // is fewer clicks than any screen can be. So the assistant can start, stop and
  // write time down — and it can NEVER edit somebody's hours, which is a
  // different act entirely (see the note on update_work_log's absence below).
  {
    name: "list_work_logs",
    summary:
      "List rows of time — who worked on what, and for how long in whole seconds. Filters: `scope` ('mine' for the caller's own, 'all' otherwise), `targetTable` + `targetId` (the time against one story or ticket), and `userId`. Returns ONE page plus the exact `total` (rows), `totalSeconds` (the number anybody actually wants), `hasMore` and an opaque `nextCursor` — call again passing that as `cursor` to read further. Binned runaway timers are never in the list.",
    binding: "CONTENT", method: "GET", path: "/api/content/work-logs",
    schema: obj({ scope: S, targetTable: S, targetId: S, userId: S, cursor: S }),
    buildQuery: (i) => {
      const q: string[] = []
      for (const k of ["scope", "targetTable", "targetId", "userId", "cursor"])
        if (str(i, k)) q.push(`${k}=${encodeURIComponent(str(i, k))}`)
      return q.length ? `?${q.join("&")}` : ""
    },
    agent: { write: false, summarize: (i) => (str(i, "scope") === "mine" ? "List my time" : "List logged time") },
  },
  {
    name: "list_running_timers",
    summary:
      "What the caller has running RIGHT NOW — one row per timer, with what it is on, when it started and how many whole seconds it has been going. `runaway` is true once one has been running more than eight hours, which is the prompt to ask what they want done about it.",
    binding: "CONTENT", method: "GET", path: "/api/content/work-logs/running",
    schema: obj({}),
    buildQuery: () => "",
    agent: { write: false, summarize: () => "Check my running timers" },
  },
  {
    name: "start_timer",
    summary:
      "Start a timer on a story or a ticket — `targetTable` is 'stories' or 'help' and `targetId` is that row's id. Time is logged against a story, a ticket or a task and NOTHING else: never a to-do (that is the client's time, not ours) and never an account on its own. Parallel timers on different things are fine; starting a second one on the SAME thing is refused. The start moment is the server's clock, never a time you pass.",
    binding: "CONTENT", method: "POST", path: "/api/content/work-logs/start",
    schema: obj({ targetTable: S, targetId: S, note: S, kind: S }, ["targetTable", "targetId"]),
    buildBody: (i) => ({
      targetTable: str(i, "targetTable"),
      targetId: str(i, "targetId"),
      note: opt(i, "note"),
      kind: opt(i, "kind"),
    }),
    agent: {
      write: true,
      confirm: false,
      summarize: (i) => `Start a timer on ${str(i, "targetTable") === "help" ? "ticket" : "story"} ${str(i, "targetId")}`,
    },
  },
  {
    name: "stop_timer",
    summary:
      "Stop one of the caller's running timers, by the timer's id (from list_running_timers). `endedAt` is optional and is how 'it really stopped at five o'clock on Friday' is said — leave it off and it stops now. Stopping an already-stopped timer changes nothing.",
    binding: "CONTENT", method: "POST", path: "/api/content/work-logs/stop",
    schema: obj({ id: S, endedAt: S }, ["id"]),
    buildBody: (i) => ({ id: str(i, "id"), endedAt: opt(i, "endedAt") }),
    agent: { write: true, confirm: false, summarize: (i) => `Stop timer ${str(i, "id")}` },
  },
  {
    name: "log_time",
    summary:
      "Write time down by hand, for work already finished. `startedAt` and `endedAt` are ISO moments and the duration is computed FROM them — there is no field for a number of hours, because two moments can be checked afterwards and a number cannot. `billable` defaults to true. Same targets as start_timer: a story or a ticket, never a to-do and never an account.",
    binding: "CONTENT", method: "POST", path: "/api/content/work-logs",
    schema: obj(
      { targetTable: S, targetId: S, startedAt: S, endedAt: S, note: S, kind: S, billable: B },
      ["targetTable", "targetId", "startedAt", "endedAt"]
    ),
    buildBody: (i) => ({
      targetTable: str(i, "targetTable"),
      targetId: str(i, "targetId"),
      startedAt: str(i, "startedAt"),
      endedAt: str(i, "endedAt"),
      note: opt(i, "note"),
      kind: opt(i, "kind"),
      // R22 — forwarded ALWAYS, never conditionally. An `undefined` here would
      // mean the door never sees the field a caller deliberately set, and the
      // door's own default (billable on) would quietly overrule them.
      billable: i.billable !== false,
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Log time on ${str(i, "targetId")}` },
  },
  {
    name: "resolve_runaway_timer",
    summary:
      "Answer for a timer left running (from list_running_timers, where `runaway` is true). Three answers and no fourth — `answer`: 'keep' (it really did run that long; stop it now), 'stopAt' (it ran until the moment in `at`), or 'discard' (nothing happened; the row is kept and marked binned, and every total subtracts it). Nothing is ever stopped automatically: a number a person did not choose is a number nobody can defend.",
    binding: "CONTENT", method: "POST", path: "/api/content/work-logs/runaway",
    schema: obj({ id: S, answer: S, at: S }, ["id", "answer"]),
    buildBody: (i) => ({ id: str(i, "id"), answer: str(i, "answer"), at: opt(i, "at") }),
    agent: {
      write: true,
      // CONFIRM on the destructive answer only. "Keep" and "stop it at five" are
      // ordinary stops; "discard" strikes hours off a timesheet, which is the one
      // answer somebody would want to have been asked about.
      confirm: (i) => str(i, "answer") === "discard",
      summarize: (i) =>
        str(i, "answer") === "discard"
          ? `Bin the runaway timer ${str(i, "id")}`
          : `Stop the runaway timer ${str(i, "id")}`,
    },
  },
  {
    name: "set_timer_auto_stop",
    summary:
      "The caller's OWN preference: does starting a timer stop the ones they already have running? Off by default, because working on two things in a morning is ordinary and a setting that silently stopped the other one would be discovered by losing an hour.",
    binding: "CONTENT", method: "POST", path: "/api/content/work-logs/auto-stop",
    schema: obj({ on: B }, ["on"]),
    buildBody: (i) => ({ on: i.on === true }),
    agent: {
      write: true,
      confirm: false,
      summarize: (i) => `Turn auto-stop ${i.on === true ? "on" : "off"} for my timers`,
    },
  },
  /* ------------------------------- knowledge ------------------------------- */
  // THE ASSISTANT IS NOT JUST A READER HERE (the owner's own words): it can ask
  // the knowledge base a question AND add, correct or take away a source — each
  // one gated by exactly the right a PERSON needs for the same act, because it
  // acts as the signed-in caller through these same doors. Someone who cannot
  // delete a source cannot ask the assistant to delete one either; the door
  // refuses them both with the same sentence.
  {
    name: "ask_knowledge",
    summary:
      "Ask the team's knowledge base a question and get the passages that answer it, each with the source it came from. Pass `accountId` when the question is about one client and you know which — the answer is otherwise compartmented from the question's own words. It NEVER writes an answer for you: use the passages, quote the titles, and if `found` is false say so in the words of `message` rather than answering from memory. `reason` says which compartment it searched and why — repeat it when the answer looks wrong for the question.",
    binding: "CONTENT", method: "GET", path: "/api/content/knowledge/ask",
    schema: obj({ q: S, accountId: S, limit: N }, ["q"]),
    buildQuery: (i) => {
      const q = [`q=${encodeURIComponent(str(i, "q"))}`]
      if (str(i, "accountId")) q.push(`accountId=${encodeURIComponent(str(i, "accountId"))}`)
      if (typeof i.limit === "number") q.push(`limit=${i.limit}`)
      return `?${q.join("&")}`
    },
    agent: { write: false, summarize: (i) => `Ask the knowledge base: "${str(i, "q").slice(0, 60)}"` },
  },
  {
    name: "list_knowledge_sources",
    summary:
      "List what the assistant is allowed to read. Filters: `kind` ('note' for something typed here, or 'ticket' / 'article' / 'account' for material mirrored from the app's own rows), `compartment` ('agency' or 'account:<id>'), `q` (searches the title and the text). Pass `id` for one source. Returns ONE page plus the exact `total`, `hasMore`, and an opaque `nextCursor` — to read further, call again passing that value as `cursor` (never invent one).",
    binding: "CONTENT", method: "GET", path: "/api/content/knowledge",
    schema: obj({ id: S, kind: S, compartment: S, q: S, cursor: S }),
    buildQuery: (i) => {
      const q: string[] = []
      for (const key of ["id", "kind", "compartment", "q", "cursor"])
        if (str(i, key)) q.push(`${key}=${encodeURIComponent(str(i, key))}`)
      return q.length ? `?${q.join("&")}` : ""
    },
    agent: {
      write: false,
      summarize: (i) => (str(i, "id") ? "Look up one knowledge source" : "List the knowledge base's sources"),
    },
  },
  {
    name: "get_knowledge_status",
    summary:
      "Is the knowledge base in step? One row per kind of material the app keeps in step for you (tickets, learning articles, accounts): how far the sweep has read, when it last ran, when it last SUCCEEDED, and what went wrong if it didn't. `lastError` set with an old `lastOkAt` is the shape of 'it has been failing since Tuesday' — read this before trusting an answer that seems to be missing something recent.",
    binding: "CONTENT", method: "GET", path: "/api/content/knowledge/sync",
    schema: obj({}),
    agent: { write: false, summarize: () => "Check whether the knowledge base is up to date" },
  },
  {
    name: "add_knowledge_source",
    summary:
      "Write something into the knowledge base so the assistant can use it from now on: `title` and `body` are the material itself. `accountId` files it under one client (leave it out for the agency's own); `visibility` 'private' keeps it to you alone, and anything else means the team. It is searchable immediately.",
    binding: "CONTENT", method: "POST", path: "/api/content/knowledge",
    schema: obj({ title: S, body: S, sourceUrl: S, accountId: S, visibility: S }, ["title"]),
    buildBody: (i) => ({
      title: str(i, "title"),
      body: opt(i, "body"),
      sourceUrl: opt(i, "sourceUrl"),
      accountId: opt(i, "accountId"),
      visibility: opt(i, "visibility"),
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Add "${str(i, "title")}" to the knowledge base` },
  },
  {
    name: "update_knowledge_source",
    summary:
      "Correct a source (by id). A source MIRRORED from the app's own rows (a ticket, an article, an account) owns its own text — for those, only the filing can change here (`accountId`, `visibility`), because the sweep would overwrite anything else on its next pass. A note typed into the knowledge base is editable in full.",
    binding: "CONTENT", method: "POST", path: "/api/content/knowledge/update",
    schema: obj({ id: S, title: S, body: S, sourceUrl: S, accountId: S, visibility: S }, ["id", "title"]),
    buildBody: (i) => ({
      id: str(i, "id"),
      title: str(i, "title"),
      body: opt(i, "body"),
      sourceUrl: opt(i, "sourceUrl"),
      accountId: opt(i, "accountId"),
      visibility: opt(i, "visibility"),
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Correct knowledge source ${str(i, "id")}` },
  },
  {
    name: "set_knowledge_source_active",
    summary:
      "Take a source away from the assistant (active:false) or give it back (active:true), by id. Nothing is deleted: the row and its history survive, its searchable pieces do not — and the sweep will not quietly re-add a source somebody took away.",
    binding: "CONTENT", method: "POST", path: "/api/content/knowledge/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    agent: {
      write: true,
      // DESTRUCTIVE ONLY WHEN TAKING AWAY — the same predicate the three other
      // (de)activate toggles carry. Removing a source changes what every future
      // answer can be built from, which is the blast radius that earns a panel;
      // giving one back does not.
      confirm: (i) => i.active !== true,
      summarize: (i) =>
        `${i.active === true ? "Give the assistant back" : "Take away the assistant's sight of"} source ${str(i, "id")}`,
    },
  },
  {
    name: "sync_knowledge",
    summary:
      "Bring the knowledge base into step with the app's own rows — tickets, learning articles and accounts — one bounded slice at a time. Every result carries `caughtUp`; keep calling while any of them is false. A 15-minute sweep does this on its own, so this is for 'do it now' and for the first fill.",
    binding: "CONTENT", method: "POST", path: "/api/content/knowledge/sync",
    schema: obj({}),
    buildBody: () => ({}),
    agent: {
      write: true,
      // Writes only MIRRORS of rows the caller can already read, adds nothing a
      // person did not already put in the app, and is idempotent by construction
      // (a row whose text has not changed is skipped). Nothing to approve.
      confirm: false,
      summarize: () => "Bring the knowledge base up to date",
    },
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

  /* ------------------------- process maps and value ------------------------- */
  // App → Process → Step, the versions cut over them, and the savings drilled
  // through all three. Every one of these doors is fenced by the caller's account
  // set on the way in, and the AUTHORING ones refuse a client login outright — so
  // a machine caller reaches exactly what the person holding the token reaches.
  {
    name: "list_apps",
    summary:
      "List the systems we have built — an App is the thing with its own address and its own stage (SCOPE ch.02). `accountId` narrows to one client's systems. Bounded: an agency has tens of apps, so there is no cursor here; the collection that grows underneath is process maps.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/apps",
    schema: obj({ accountId: S }),
    buildQuery: (i) => (str(i, "accountId") ? `?accountId=${encodeURIComponent(str(i, "accountId"))}` : ""),
    agent: { write: false, summarize: () => "List the apps we've built" },
  },
  {
    name: "create_app",
    summary:
      "Record a system we have built. `accountId` is whose it is (leave it out for the agency's own). `toolCostCentsPerMonth` is what it costs US to keep running — an internal figure, never shown to a client.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/apps",
    schema: obj({ name: S, accountId: S, url: S, stage: S, toolCostCentsPerMonth: N }, ["name"]),
    buildBody: (i) => ({
      name: str(i, "name"),
      accountId: opt(i, "accountId"),
      url: opt(i, "url"),
      stage: opt(i, "stage"),
      toolCostCentsPerMonth: typeof i.toolCostCentsPerMonth === "number" ? i.toolCostCentsPerMonth : undefined,
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Record the app "${str(i, "name")}"` },
  },
  {
    name: "update_app",
    summary:
      "Edit an app's own details (by id) — never which account it belongs to, which is set once when it is created. Send ONLY the fields you are changing; anything you leave out keeps its current value.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/apps/update",
    schema: obj({ id: S, name: S, url: S, stage: S, toolCostCentsPerMonth: N }, ["id", "name"]),
    buildBody: (i) => ({
      id: str(i, "id"),
      name: str(i, "name"),
      url: sent(i, "url"),
      stage: sent(i, "stage"),
      toolCostCentsPerMonth: typeof i.toolCostCentsPerMonth === "number" ? i.toolCostCentsPerMonth : undefined,
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Edit the app "${str(i, "name")}"` },
  },
  {
    name: "set_app_active",
    summary:
      "Archive an app (`active: false`) or restore it (`active: true`). Never deleted — its maps, its versions and every saving computed from them stay exactly where they are. An archived app drops out of the value figures.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/apps/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    agent: {
      write: true,
      confirm: (i) => i.active !== true,
      summarize: (i) => `${i.active === true ? "Restore" : "Archive"} app ${str(i, "id")}`,
    },
  },
  {
    name: "list_processes",
    summary:
      "List process maps — a Process is a way of working inside an App. Filters: `q` (searches the name and description), `appId` (only that app's maps). Returns ONE page plus the exact `total`, `hasMore`, and an opaque `nextCursor` — to read further, call again passing that value as `cursor` (never invent one).",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/processes",
    schema: obj({ q: S, appId: S, cursor: S }),
    buildQuery: (i) => {
      const q: string[] = []
      for (const key of ["q", "appId", "cursor"])
        if (str(i, key)) q.push(`${key}=${encodeURIComponent(str(i, key))}`)
      return q.length ? `?${q.join("&")}` : ""
    },
    agent: {
      write: false,
      summarize: (i) => (str(i, "q") ? `Search process maps for "${str(i, "q")}"` : "List process maps"),
    },
  },
  {
    name: "get_process",
    summary:
      "One process map in full (by id): its versions newest-first, the steps of its CURRENT version with their times, and the exact number of comments on it. Version 1 is always the baseline — how the work was done before us — and every saving is measured from it.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/processes/detail",
    schema: obj({ id: S }, ["id"]),
    buildQuery: (i) => `?id=${encodeURIComponent(str(i, "id"))}`,
    agent: { write: false, summarize: (i) => `Look up process map ${str(i, "id")}` },
  },
  {
    name: "create_process",
    summary:
      "Map a way of working inside an app. It is created WITH its version 1 — the way the work was done before we touched anything — because a process with no baseline can never produce a saving. `baselineLabel` is what the client calls that old way.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/processes",
    schema: obj({ appId: S, name: S, description: S, baselineLabel: S }, ["appId", "name"]),
    buildBody: (i) => ({
      appId: str(i, "appId"),
      name: str(i, "name"),
      description: opt(i, "description"),
      baselineLabel: opt(i, "baselineLabel"),
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Map the process "${str(i, "name")}"` },
  },
  {
    name: "update_process",
    summary:
      "Rename or re-describe a process map (by id). Send ONLY what you are changing; to empty the description, send it as an empty string.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/processes/update",
    schema: obj({ id: S, name: S, description: S }, ["id", "name"]),
    buildBody: (i) => ({ id: str(i, "id"), name: str(i, "name"), description: sent(i, "description") }),
    agent: { write: true, confirm: false, summarize: (i) => `Edit the process "${str(i, "name")}"` },
  },
  {
    name: "set_process_active",
    summary:
      "Archive a process map (`active: false`) or restore it (`active: true`). Never deleted: every version, every step and the whole conversation survive, and an archived map simply stops counting toward the value figures.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/processes/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    agent: {
      write: true,
      confirm: (i) => i.active !== true,
      summarize: (i) => `${i.active === true ? "Restore" : "Archive"} process map ${str(i, "id")}`,
    },
  },
  {
    name: "add_process_step",
    summary:
      "Add a step to a process map's CURRENT version. `secondsPerRun` is how long it takes each time and `runsPerMonth` how often it happens — both are AGREED ESTIMATES, and every savings figure in the app is a subtraction between two of them, so do not guess: ask.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/processes/steps",
    schema: obj(
      { processId: S, name: S, description: S, secondsPerRun: N, runsPerMonth: N, position: N },
      ["processId", "name", "secondsPerRun", "runsPerMonth"]
    ),
    buildBody: (i) => ({
      processId: str(i, "processId"),
      name: str(i, "name"),
      description: opt(i, "description"),
      secondsPerRun: typeof i.secondsPerRun === "number" ? i.secondsPerRun : undefined,
      runsPerMonth: typeof i.runsPerMonth === "number" ? i.runsPerMonth : undefined,
      position: typeof i.position === "number" ? i.position : undefined,
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Add the step "${str(i, "name")}"` },
  },
  {
    name: "update_process_step",
    summary:
      "Edit ONE step (by id) — only in the map's CURRENT version. Editing an older version is refused: a baseline that can be changed after the fact is a saving anybody can dial up, and the whole point of these numbers is that a client can check them.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/processes/steps/update",
    schema: obj(
      { id: S, name: S, description: S, secondsPerRun: N, runsPerMonth: N, position: N },
      ["id", "name", "secondsPerRun", "runsPerMonth"]
    ),
    buildBody: (i) => ({
      id: str(i, "id"),
      name: str(i, "name"),
      description: sent(i, "description"),
      secondsPerRun: typeof i.secondsPerRun === "number" ? i.secondsPerRun : undefined,
      runsPerMonth: typeof i.runsPerMonth === "number" ? i.runsPerMonth : undefined,
      position: typeof i.position === "number" ? i.position : undefined,
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Edit the step "${str(i, "name")}"` },
  },
  {
    name: "remove_process_step",
    summary:
      "Record that a step NO LONGER HAPPENS (by id). Not a delete: the step keeps its place and its frequency and drops to zero time, which is exactly what turns work we removed entirely into the largest saving there is.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/processes/steps/remove",
    schema: obj({ id: S }, ["id"]),
    buildBody: (i) => ({ id: str(i, "id") }),
    agent: { write: true, confirm: true, summarize: (i) => `Record that step ${str(i, "id")} stopped happening` },
  },
  {
    name: "cut_process_version",
    summary:
      "Cut a new version of a process map: today's steps are copied forward and the current version is frozen exactly as it was agreed. `sprintId` marks the cut as the automatic one a completed sprint makes — pass the same sprint twice and the second call answers `alreadyCut: true` rather than cutting again.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/processes/versions",
    schema: obj({ processId: S, label: S, sprintId: S }, ["processId"]),
    buildBody: (i) => ({
      processId: str(i, "processId"),
      label: opt(i, "label"),
      sprintId: opt(i, "sprintId"),
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Cut a new version of map ${str(i, "processId")}` },
  },
  {
    name: "list_process_comments",
    summary:
      "The conversation on one process map (`processId`) — the client's questions and the team's answers, oldest first. A comment marked `explainsStepKey` is the team's explanation for a step that now takes LONGER than it used to.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/processes/comments",
    schema: obj({ processId: S }, ["processId"]),
    buildQuery: (i) => `?processId=${encodeURIComponent(str(i, "processId"))}`,
    agent: { write: false, summarize: (i) => `Read the conversation on map ${str(i, "processId")}` },
  },
  {
    name: "comment_on_process",
    summary:
      "Say something on a process map. A comment is a CONVERSATION, never an edit — it changes no step, no time and no figure. `explainsStepKey` marks it as the explanation for a step that got slower, which is what the client's own screen shows beside it; only the team may set that.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/processes/comments",
    schema: obj({ processId: S, body: S, explainsStepKey: S }, ["processId", "body"]),
    buildBody: (i) => ({
      processId: str(i, "processId"),
      body: str(i, "body"),
      explainsStepKey: opt(i, "explainsStepKey"),
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Comment on map ${str(i, "processId")}` },
  },
  {
    name: "read_value",
    summary:
      "THE SAVINGS, drilled App → Process → Step: for each step, what it took before, what it takes now, how often it happens, and the subtraction between them. `accountId` / `appId` narrow it. Every answer carries the caption that makes it honest — the times are agreed estimates, the subtraction is arithmetic — and a `prices` block appears ONLY for an account whose price visibility is switched on. A step that got slower is included and counted, never filtered out.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/value",
    schema: obj({ accountId: S, appId: S }),
    buildQuery: (i) => {
      const q: string[] = []
      for (const key of ["accountId", "appId"])
        if (str(i, key)) q.push(`${key}=${encodeURIComponent(str(i, key))}`)
      return q.length ? `?${q.join("&")}` : ""
    },
    agent: { write: false, summarize: () => "Work out the value: hours saved, App → Process → Step" },
  },

  /* ------------------------------- the money -------------------------------- */
  // BOTH rate cards and the margin. Every door below refuses a client login, and
  // the internal two are the figures SCOPE says a client must never see under any
  // flag, ever — a machine caller reaches them only as a staff member whose role
  // holds `commercials`, which no client role does (R23).
  {
    name: "list_account_rates",
    summary:
      "What one account is CHARGED per hour, by kind of work (`accountId`). This is the client-facing rate card — what they agreed — not what our own hour costs us.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/rates",
    schema: obj({ accountId: S }, ["accountId"]),
    buildQuery: (i) => `?accountId=${encodeURIComponent(str(i, "accountId"))}`,
    agent: { write: false, summarize: (i) => `Read the rate card for ${accountLabel(i, "accountId")}` },
  },
  {
    name: "create_account_rate",
    summary:
      "Add a line to an account's rate card: a kind of work and what it is charged per hour, in whole CENTS (4,500 = 45.00). One live line per kind of work per account.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/rates",
    schema: obj({ accountId: S, label: S, centsPerHour: N, currency: S }, ["accountId", "label", "centsPerHour"]),
    buildBody: (i) => ({
      accountId: str(i, "accountId"),
      label: str(i, "label"),
      centsPerHour: typeof i.centsPerHour === "number" ? i.centsPerHour : undefined,
      currency: opt(i, "currency"),
    }),
    agent: { write: true, confirm: true, summarize: (i) => `Set the rate for ${str(i, "label")}` },
  },
  {
    name: "update_account_rate",
    summary: "Edit one line of an account's rate card (by id). `centsPerHour` is whole cents.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/rates/update",
    schema: obj({ id: S, label: S, centsPerHour: N, currency: S }, ["id", "label", "centsPerHour"]),
    buildBody: (i) => ({
      id: str(i, "id"),
      label: str(i, "label"),
      centsPerHour: typeof i.centsPerHour === "number" ? i.centsPerHour : undefined,
      currency: sent(i, "currency"),
    }),
    agent: { write: true, confirm: true, summarize: (i) => `Change the rate for ${str(i, "label")}` },
  },
  {
    name: "set_account_rate_active",
    summary:
      "Retire a rate (`active: false`) or bring it back (`active: true`). Never deleted — what an account was charged last year has to stay true.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/rates/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    agent: {
      write: true,
      confirm: true,
      summarize: (i) => `${i.active === true ? "Restore" : "Retire"} rate ${str(i, "id")}`,
    },
  },
  {
    name: "list_internal_rates",
    summary:
      "What an hour of OUR OWN work costs us, by kind of work. INTERNAL: this is the agency's own cost, it is never shown to a client under any setting, and the one marked `isDefault` is the rate a margin applies to logged time whose kind of work is not yet named.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/internal-rates",
    schema: obj({}),
    buildQuery: () => "",
    agent: { write: false, summarize: () => "Read what our own hours cost" },
  },
  {
    name: "create_internal_rate",
    summary:
      "Add what a kind of our own work costs per hour, in whole CENTS. `isDefault: true` makes it the rate a margin applies to time whose kind of work is unknown — there can be only one, and setting a second is refused.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/internal-rates",
    schema: obj({ label: S, centsPerHour: N, currency: S, isDefault: B }, ["label", "centsPerHour"]),
    buildBody: (i) => ({
      label: str(i, "label"),
      centsPerHour: typeof i.centsPerHour === "number" ? i.centsPerHour : undefined,
      currency: opt(i, "currency"),
      isDefault: typeof i.isDefault === "boolean" ? i.isDefault : undefined,
    }),
    agent: { write: true, confirm: true, summarize: (i) => `Set our internal rate for ${str(i, "label")}` },
  },
  {
    name: "update_internal_rate",
    summary: "Edit one of our own cost lines (by id). `centsPerHour` is whole cents.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/internal-rates/update",
    schema: obj({ id: S, label: S, centsPerHour: N, currency: S, isDefault: B }, ["id", "label", "centsPerHour"]),
    buildBody: (i) => ({
      id: str(i, "id"),
      label: str(i, "label"),
      centsPerHour: typeof i.centsPerHour === "number" ? i.centsPerHour : undefined,
      currency: sent(i, "currency"),
      isDefault: typeof i.isDefault === "boolean" ? i.isDefault : undefined,
    }),
    agent: { write: true, confirm: true, summarize: (i) => `Change our internal rate for ${str(i, "label")}` },
  },
  {
    name: "set_internal_rate_active",
    summary: "Retire one of our own cost lines (`active: false`) or bring it back. Never deleted.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/internal-rates/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    agent: {
      write: true,
      confirm: true,
      summarize: (i) => `${i.active === true ? "Restore" : "Retire"} internal rate ${str(i, "id")}`,
    },
  },
  {
    name: "read_margin",
    summary:
      "Revenue minus our own logged time minus tool costs, for one account (`accountId`), with every line it was built from. INTERNAL — never repeat this figure to a client, in any form; it is the one number SCOPE says they must never see. `loggedTimeAvailable: false` means the work engine's time records are not in this database yet, so the time half of the subtraction is missing and the number is not yet a margin.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/margin",
    schema: obj({ accountId: S }, ["accountId"]),
    buildQuery: (i) => `?accountId=${encodeURIComponent(str(i, "accountId"))}`,
    agent: { write: false, summarize: (i) => `Work out the margin on ${accountLabel(i, "accountId")}` },
  },
]

/** The permission each WRITE needs (module:right) — every write tool on either machine
 * surface, not just the shared ones. The door ENFORCES it; this is the developer hint the
 * MCP `tools/list` description shows external clients ("… Needs member_roles:create."),
 * AND the input `isPrivilegeWrite` derives the agent's confirm rule from. Keyed by
 * canonical name (works for the mcpName ones too). Reads carry no hint (they just need
 * the module's read right).
 *
 * COMPLETENESS IS CHECKED. `isPrivilegeWrite` falls back to a PATH REGEX when a write has
 * no line here — so a future privilege write on a path that regex doesn't match would
 * silently skip the confirm panel, and nothing said the map had to be whole. Now
 * `workers/mcp/test/catalog.test.ts` asserts every write tool resolves HERE or names a
 * reason in GATELESS_WRITES below, so the fallback can never be what decides. */
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
  add_knowledge_source: "knowledge:create",
  update_knowledge_source: "knowledge:edit",
  set_knowledge_source_active: "knowledge:delete",
  // It CREATES sources (mirrors of rows the caller can already read), so it is
  // gated as a create — the same right a person needs to fill the base by hand.
  sync_knowledge: "knowledge:create",
  raise_help_ticket: "help:create",
  update_help_ticket: "help:edit",
  set_help_status: "help:edit",
  // Reordering and archiving are both moves along the row, so both sit on the
  // same right the status move does. Note what that means for a client login:
  // the seeded Client role holds help:read + help:create and NOT help:edit, so
  // neither door is open to them today. SCOPE ch.07 does say a contact may
  // re-rank their own company's tickets — when an owner grants that, the LOCK
  // (workers/content/src/lib/help.ts refuseIfLocked) is what keeps it safe, not
  // this line.
  rank_help_ticket: "help:edit",
  archive_help_ticket: "help:edit",
  reply_help_ticket: "help:read",
  // THE WORK ENGINE. One module for stories and the sprints they sit in, and no
  // client login holds it — so unlike the ticket doors above, the question "what
  // happens when a contact reaches this?" has a shorter answer here: the door
  // refuses them (refusePortalCaller), whatever an owner ticks.
  create_story: "work:create",
  update_story: "work:edit",
  set_story_status: "work:edit",
  rank_story: "work:edit",
  create_sprint: "work:create",
  complete_sprint: "work:edit",
  raise_todo: "todos:create",
  complete_todo: "todos:edit",
  cancel_todo: "todos:delete",
  create_task: "work:create",
  set_task_done: "work:edit",
  // The rota is about TICKETS, so it gates with them. `help:edit` is a right the
  // seeded Client role does not hold — and the door refuses a portal caller
  // anyway, because an unread backlog is our failure and not an SLA.
  set_triage_duty: "help:edit",
  // TIME. Logging your OWN is a create, not an edit — a person who may do the
  // work may say how long it took them. Correcting a row that already exists is
  // `work:edit`, and there is deliberately no tool on that door (see MCP.md).
  start_timer: "work:create",
  stop_timer: "work:create",
  log_time: "work:create",
  resolve_runaway_timer: "work:create",
  set_timer_auto_stop: "work:create",
  // The AGENT-ONLY writes (no MCP tool — they're built around the confirm panel a
  // headless client hasn't got). Listed for the same reason as the rest: the gate
  // is what isPrivilegeWrite reads, and a write with no line is a write the PATH
  // REGEX decides for.
  bulk_set_help_status: "help:edit",
  set_help_status_by_filter: "help:edit",
  bulk_set_learning_active: "learning:delete",
  // The map: one module, four rights, and the same three-way split every other
  // module has — create maps and steps, edit them, and `delete` for the two acts
  // that take something out of the picture (archiving, and recording that a step
  // stopped happening).
  create_app: "processes:create",
  update_app: "processes:edit",
  set_app_active: "processes:delete",
  create_process: "processes:create",
  update_process: "processes:edit",
  set_process_active: "processes:delete",
  add_process_step: "processes:create",
  update_process_step: "processes:edit",
  remove_process_step: "processes:delete",
  cut_process_version: "processes:create",
  comment_on_process: "processes:create",
  // The money. Both rate cards live under one module because they are one
  // decision-maker's job — and they live in two TABLES and two FILES because they
  // are two audiences (R23).
  create_account_rate: "commercials:create",
  update_account_rate: "commercials:edit",
  set_account_rate_active: "commercials:delete",
  create_internal_rate: "commercials:create",
  update_internal_rate: "commercials:edit",
  set_internal_rate_active: "commercials:delete",
}

/** Writes that genuinely have no single `module:right` to name, each with its reason.
 * The reasoned half of the completeness check above — and a RATCHET: a name here that
 * also appears in TOOL_GATES, or that is no longer a write tool, turns the build red, so
 * the list can only shrink. */
export const GATELESS_WRITES: Record<string, string> = {
  run_import_batch:
    "binding:'SELF' — it runs the attached-in-chat batch INSIDE data-ops rather than posting to a door, and the rows it writes go through each target module's OWN gated door one at a time (the batch doors themselves open with requireAnyImportRight, which is an ANY-of set, not one module:right). So there is no single gate to name, and isPrivilegeWrite is answered by what it does: an import writes records, never who may do what.",
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
  // …and the other end of the fence: a tool that can set the column deciding
  // WHICH ACCOUNT OWNS A ROW moves that row across the fence, replies and all.
  // FENCE_INPUTS alone could never see this — `help` is not a table the fence
  // READS — so `update_help_ticket` carried `accountId` and never confirmed.
  for (const [table, column] of Object.entries(FENCED_ROW_OWNERS)) {
    if (!table.split("_").every((w) => inPath.has(w) || inPath.has(`${w}s`))) continue
    if (fields.includes(column)) return true
  }
  // …and the third way in, which neither of the two above can see: the column a
  // GRANT resolves a person from. `accounts.email` is not a fence input (the
  // corridor never reads it) and not a row owner (it says nothing about which
  // account owns the row) — it decides WHO the login goes to. `update_account`
  // shipped it at confirm:false while `create_account`, the same field, confirmed
  // and said why. Re-point the address, then let a routine-looking portal grant be
  // approved, and the login lands on whoever owns the new address.
  for (const [table, columns] of Object.entries(FENCE_IDENTITY_INPUTS)) {
    if (!table.split("_").every((w) => inPath.has(w) || inPath.has(`${w}s`))) continue
    if (columns.some((c) => fields.includes(c))) return true
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
