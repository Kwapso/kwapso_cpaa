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
//
// THIS FILE IS THE DECLARATIONS, and only those. Two things that used to sit at
// the bottom of it have their own files now, because they answer different
// questions and are read by different people:
//   • `tool-gates.ts` — which permission each write needs, and which writes are
//     grave enough to stop and ask about (TOOL_GATES, isPrivilegeWrite).
//   • `tool-args.ts` — the JSON-Schema shapes and the one runtime type check.
// The dependency points one way: the catalogue may know about those; neither
// needs the catalogue. `SHARED_TOOLS` stays HERE and stays one array literal —
// scripts/smoke-mcp.mjs reads it off this path to derive the R19 filter check,
// and it is the one reader that cannot follow an import.

import { B, N, obj, S, str } from "./tool-args"

/* ---------------------- the body builders a tool declares --------------------- */

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
const memberLabel = (input: Record<string, unknown>, names?: Record<string, string>): string => {
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
const accountLabel = (
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
  // The postal address is four fields, not one line (R22: the door reads these,
  // so the tools offer and forward every one of them).
  street: sent(i, "street"),
  postalCode: sent(i, "postalCode"),
  city: sent(i, "city"),
  country: sent(i, "country"),
  industry: sent(i, "industry"),
  about: sent(i, "about"),
  logoUrl: sent(i, "logoUrl"),
  coverUrl: sent(i, "coverUrl"),
  currency: sent(i, "currency"),
  locale: sent(i, "locale"),
  timezone: sent(i, "timezone"),
})

/** WHO IS ON AN APP — the four fields the app doors read off the body for the
 * two sides of a project (CHECKLIST 8.10 + 8.5). Declared once and spread into
 * both tools, for the same reason the account fields are: create and edit must
 * offer one contract, and R22 proves the forwarding half by RUNNING the builder.
 *
 * The two lists stay `undefined` when the caller did not send them, because the
 * door only touches a set it was actually given — a machine renaming an app must
 * not empty its staff. */
const APP_PEOPLE_SCHEMA = {
  staffUserIds: { type: "array" },
  leadUserId: S,
  stakeholderContactIds: { type: "array" },
  mainStakeholderContactId: S,
}

const appPeopleBody = (i: Record<string, unknown>): Record<string, unknown> => ({
  staffUserIds: Array.isArray(i.staffUserIds) ? i.staffUserIds : undefined,
  leadUserId: sent(i, "leadUserId"),
  stakeholderContactIds: Array.isArray(i.stakeholderContactIds) ? i.stakeholderContactIds : undefined,
  mainStakeholderContactId: sent(i, "mainStakeholderContactId"),
})

/** The account fields' SCHEMA half — declared once beside `accountFields` so the
 * shape a tool advertises and the body it builds are written in one place. R22
 * proves them equal by RUNNING buildBody; this is what keeps them equal. */
const ACCOUNT_FIELD_SCHEMA = {
  code: S, email: S, phone: S, street: S, postalCode: S, city: S, country: S,
  industry: S, about: S, logoUrl: S, coverUrl: S, currency: S, locale: S,
  timezone: S,
}

/** THE AGENCY-INTERNAL BODIES. One builder per door shape, so create and edit
 * send the SAME field set and cannot drift into two contracts. R22 proves the forwarding half by RUNNING these rather than
 * reading them, which is exactly why they are shared functions — a builder that
 * delegates is judged by what the door receives. */
const brandAssetBody = (i: Record<string, unknown>): Record<string, unknown> => ({
  name: str(i, "name"),
  category: opt(i, "category"),
  description: opt(i, "description"),
  fileUrl: opt(i, "fileUrl"),
  colorHex: opt(i, "colorHex"),
})

/** WHAT WE HANDED OVER, as a body. The APP rides on both writes — the create
 * door needs it to resolve the account, and the edit door needs it to answer
 * with the right shelf — so it is in the shared builder rather than spelled
 * twice. R22 proves the forwarding half by RUNNING this. */
const deliverableBody = (i: Record<string, unknown>): Record<string, unknown> => ({
  appId: str(i, "appId"),
  title: str(i, "title"),
  kind: opt(i, "kind"),
  datedOn: opt(i, "datedOn"),
  url: opt(i, "url"),
  imageUrl: opt(i, "imageUrl"),
})

const meetingPurposeBody = (i: Record<string, unknown>): Record<string, unknown> => ({
  name: str(i, "name"),
  department: opt(i, "department"),
  description: opt(i, "description"),
})

const staffProfileBody = (i: Record<string, unknown>): Record<string, unknown> => ({
  userId: str(i, "userId"),
  headline: opt(i, "headline"),
  personalityType: opt(i, "personalityType"),
  strengths: opt(i, "strengths"),
  weaknesses: opt(i, "weaknesses"),
  roleModels: opt(i, "roleModels"),
  about: opt(i, "about"),
  photoUrl: opt(i, "photoUrl"),
})

const certificateBody = (i: Record<string, unknown>): Record<string, unknown> => ({
  title: str(i, "title"),
  issuer: opt(i, "issuer"),
  issuedOn: opt(i, "issuedOn"),
  expiresOn: opt(i, "expiresOn"),
  fileUrl: opt(i, "fileUrl"),
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
 * acts stop for a yes/no panel — recording a work log or replying to a ticket just
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
      "List the team's invites, each one's email, role, status (pending / accepted / revoked) and its invite id. Use this to find a PENDING invite's id before revoking it (list_members only shows people who've already joined, so an unaccepted invite won't be there).",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/invites",
    schema: obj({ id: S }),
    buildQuery: (i) => (str(i, "id") ? `?id=${encodeURIComponent(str(i, "id"))}` : ""),
    agent: { write: false, summarize: (i) => (str(i, "id") ? "Look up one invite" : "List invites") },
  },
  {
    name: "list_dropdown_values",
    summary:
      "List the team's dropdown values (selectable data), active first then deactivated, each carries `active`. Deactivated values are listed too, so you can find one's id and reactivate it.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/selectable",
    schema: obj({ id: S }),
    buildQuery: (i) => (str(i, "id") ? `?id=${encodeURIComponent(str(i, "id"))}` : ""),
    agent: { write: false, summarize: (i) => (str(i, "id") ? "Look up one dropdown value" : "List dropdown values") },
  },
  {
    name: "list_help_tickets",
    summary:
      "List the team's tickets. scope: 'mine', which now means the tickets on the apps you are STAFFED to, not the ones you typed, or 'all' (default all); view: 'live' (default, the everyday list) or 'archived' (tickets that have been put away); `q` searches the reference, the description and the title; `accountId` narrows to one client's tickets; `appId` narrows to one system's; `moduleId` narrows to one SECTION of that system, the modules an app is divided into (list_app_modules gives their ids). `helpType` narrows to one kind, as the team spells it in their own Ticket type list; `status` narrows to one stage of the lifecycle, 'awaiting_validation', 'new', 'triaged', 'scheduled', 'in_progress', 'ready' or 'resolved'. Pass `id` to fetch just one ticket, archived or not. `sort` puts the page in an order and `dir` ('asc' or 'desc') flips it: 'rank' (the default, the order somebody dragged them into), 'created', 'updated', 'status', 'kind' or 'title'. The order is the DOOR's, so it spans the whole collection rather than the page you are holding. The `total` counts the SAME filtered question the rows answer; `byType` and `byStatus` tally the whole (unfiltered by kind or stage) list a kind or a stage at a time. Returns ONE page plus `total` (exact up to 1,000,000; `totalCapped` true means there are more than that), `hasMore`, and an opaque `nextCursor`, to read further, call again passing that value as `cursor` (never invent one).",
    binding: "CONTENT", method: "GET", path: "/api/content/help",
    schema: obj({
      scope: S, view: S, q: S, accountId: S, appId: S, moduleId: S, helpType: S, status: S, id: S,
      sort: S, dir: S, cursor: S,
    }),
    buildQuery: (i) => {
      const q = [str(i, "scope") === "mine" ? "scope=mine" : "scope=all"]
      if (str(i, "q")) q.push(`q=${encodeURIComponent(str(i, "q"))}`)
      if (str(i, "accountId")) q.push(`accountId=${encodeURIComponent(str(i, "accountId"))}`)
      if (str(i, "appId")) q.push(`appId=${encodeURIComponent(str(i, "appId"))}`)
      if (str(i, "moduleId")) q.push(`moduleId=${encodeURIComponent(str(i, "moduleId"))}`)
      if (str(i, "helpType")) q.push(`helpType=${encodeURIComponent(str(i, "helpType"))}`)
      if (str(i, "status")) q.push(`status=${encodeURIComponent(str(i, "status"))}`)
      // Forwarded only when the caller asked for the archive: the door defaults
      // to the live list, and sending `view=live` on every call would be noise
      // the model has to keep re-reading.
      if (str(i, "view") === "archived") q.push("view=archived")
      if (str(i, "id")) q.push(`id=${encodeURIComponent(str(i, "id"))}`)
      // THE ORDER is a question for the door, exactly as the filters are: the
      // list pages, so ordering the rows a caller already has orders one page.
      if (str(i, "sort")) q.push(`sort=${encodeURIComponent(str(i, "sort"))}`)
      if (str(i, "dir")) q.push(`dir=${encodeURIComponent(str(i, "dir"))}`)
      if (str(i, "cursor")) q.push(`cursor=${encodeURIComponent(str(i, "cursor"))}`)
      return `?${q.join("&")}`
    },
    agent: { write: false, summarize: (i) => (str(i, "id") ? "Look up one ticket" : "List support tickets") },
  },
  {
    name: "get_help_thread",
    summary:
      "Read one support ticket's conversation, every reply, oldest first, by ticket id. The list tools return the ticket; this returns what was said on it.",
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
    summary:
      "Rename the team this caller is standing in, and set the agency's own details. Its people, records and history are untouched. `legalName` is what goes on a contract when it is not the short name in the rail, `legalAddress` is the registered address, `legalNumbers` is one block of text for whatever numbers the country asks for (a company number, a VAT number), and `phone` is the number somebody rings. Send only what you are changing: a field left out keeps its current value, and an empty string clears it.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/teams/update",
    schema: obj({ name: S, legalName: S, legalAddress: S, legalNumbers: S, phone: S }, ["name"]),
    buildBody: (i) => ({
      name: str(i, "name"),
      legalName: sent(i, "legalName"),
      legalAddress: sent(i, "legalAddress"),
      legalNumbers: sent(i, "legalNumbers"),
      phone: sent(i, "phone"),
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Update the team "${str(i, "name")}"` },
  },

  /* -------------------------------- accounts ------------------------------- */
  // The customer spine. Reads are fenced by the caller's account set as well as
  // their role, so these tools inherit that fence for free — a token held by a
  // person pinned to one account answers about that account and no other.
  {
    name: "list_accounts",
    summary:
      "List the team's accounts, companies and people in one list, unless the caller's role lacks the contacts right, in which case it is the companies. Filters: `q` (searches name, reference and email), `type` ('entity' for a company or 'individual' for a person), `archived` ('yes' for only the put-away ones, 'no' for only the live ones; both by default), `parentId` (only the accounts sitting under that one). `sort` puts the page in an order and `dir` ('asc' or 'desc') flips it: 'created' (the default, newest first), 'name', 'code' or 'updated'. The order is the DOOR's, so it spans the whole collection rather than the page you are holding. The `total` counts the SAME filtered question the rows answer, so it is the answer to 'how many are there?' as well. `entityTotal` and `individualTotal` are a different question, how many companies and how many people there are in the whole collection, whatever this call asked for. Returns ONE page plus `total` (exact up to 1,000,000; `totalCapped` true means there are more than that), `hasMore`, and an opaque `nextCursor`, to read further, call again passing that value as `cursor` (never invent one).",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/accounts",
    schema: obj({ q: S, type: S, archived: S, parentId: S, sort: S, dir: S, cursor: S }),
    buildQuery: (i) => {
      const q: string[] = []
      for (const key of ["q", "type", "archived", "parentId", "sort", "dir", "cursor"])
        if (str(i, key)) q.push(`${key}=${encodeURIComponent(str(i, key))}`)
      return q.length ? `?${q.join("&")}` : ""
    },
    agent: { write: false, summarize: (i) => (str(i, "q") ? `Search accounts for "${str(i, "q")}"` : "List accounts") },
  },
  {
    name: "get_account",
    summary:
      "One account in full (by id). For a company it carries `links`, the people linked to it, and for a person it carries `companies`, the accounts they are a contact of; both are empty without the contacts right. `portalUsers` is who can sign in, and needs the portal access right. Use list_accounts to find the id.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/accounts/detail",
    schema: obj({ id: S }, ["id"]),
    buildQuery: (i) => `?id=${encodeURIComponent(str(i, "id"))}`,
    agent: { write: false, summarize: (i) => `Look up account ${str(i, "id")}` },
  },
  {
    name: "create_account",
    summary:
      "Create an account. `accountType` is 'entity' (a company) or 'individual' (a person), nothing else is accepted. Both are still live here, but the agency's own screens now only ever create companies: a person is made on a company's Contacts tab, which creates the account and then links it the way `link_contact` does. `parentAccountId` puts it under another account; leave it out for a top-level one. The postal address is four fields, `street`, `postalCode`, `city`, `country`, and `country` and `industry` are picked from the team's own dropdown values. `code` is the reference, and you almost never send it: leave it out and one is minted from the name (BERG for Bergman S.A., BERG2 when that is taken).",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/accounts",
    schema: obj(
      { accountType: S, name: S, parentAccountId: S, ...ACCOUNT_FIELD_SCHEMA },
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
      "Edit an account's own details (by id), never its place in the hierarchy; that's set_account_parent. Send ONLY the fields you are changing: anything you leave out keeps its current value. To empty a field, send it as an empty string. The postal address is four fields, `street`, `postalCode`, `city`, `country`, and `about` is the paragraph about them.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/accounts/update",
    schema: obj(
      { id: S, name: S, ...ACCOUNT_FIELD_SCHEMA, commercialsVisible: B },
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
    summary: "Archive an account (active:false) or restore it (active:true), never deleted; every record it carries survives.",
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
      "Unlink a contact from an account (active:false) or link them back (active:true), by the CONTACT LINK's id, get_account returns it. The person's own account is untouched either way.",
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
      "Who can log in to the client portal, every portal access the caller may see, or just one account's with `accountId`. Each row carries the person's email and whether their access is live.",
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
      "Give someone at an account a login to the client portal. `accountId` is the account they'll see; `personAccountId` is the person, picked off that account's own records, the door reads their email from there, so it never takes a typed-in address. They must have signed in here at least once, and a member of your own team is refused. `appRestriction` narrows them to named systems INSIDE that account: a comma-separated list of app ids from `list_apps`, each of which must belong to this client or the grant is refused. Leave it out for their whole company's world, which is the usual case.",
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
      "Revoke a portal login (active:false) or restore it (active:true), by the PORTAL ACCESS row's id, get_account and list_portal_access both return it. The login dies; every record stays.",
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
      "Create a new team role. It starts with no access rights unless you pass `permissions`, the same object set_role_permissions takes (keyed by module → { read, create, edit, delete }). Creating WITH a matrix is create + edit in one move, so the door demands member_roles:edit on top of member_roles:create; leave it out for a plain create and grant rights afterwards.",
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
    summary: "Switch a role off (deactivate, holders keep access) or back on (reactivate), never deleted.",
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
      "Set a role's access rights (by role id). `value` is an object keyed by module, one of teams, team_members, member_roles, help, selectable_data, screens, agent, each mapping to { read, create, edit, delete } booleans. Turning on create/edit/delete auto-enables read. The Admin role is locked (the server enforces this).",
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
    summary: "Revoke a pending invite that hasn't been accepted yet (by invite id).",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/invites/revoke",
    schema: obj({ inviteId: S }, ["inviteId"]),
    buildBody: (i) => ({ inviteId: str(i, "inviteId") }),
    agent: { write: true, confirm: true, summarize: (i, names) => `Revoke the invite for ${names?.[str(i, "inviteId")] ?? str(i, "inviteId")}` },
  },

  /* --------------------------- dropdown values ----------------------------- */
  {
    name: "create_dropdown_value",
    summary:
      "Add a dropdown value: `type` = the group name, `value` = the option, and an optional `mark`, one glyph shown beside the word wherever the type appears. A dropdown write NEVER invents an option, for 'create X and move things onto it', call THIS first and the write second, in the SAME turn.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/selectable",
    schema: obj({ type: S, value: S, mark: S }, ["type", "value"]),
    buildBody: (i) => ({ type: str(i, "type"), value: str(i, "value"), mark: str(i, "mark") }),
    agent: { write: true, confirm: false, summarize: (i) => `Add "${str(i, "value")}" to the ${str(i, "type")} list` },
  },
  {
    name: "update_dropdown_value",
    summary: "Rename a dropdown value (by `id`), and optionally set its `mark`, the glyph shown beside the word.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/selectable/update",
    schema: obj({ id: S, value: S, mark: S }, ["id", "value"]),
    buildBody: (i) => ({ id: str(i, "id"), value: str(i, "value"), mark: str(i, "mark") }),
    agent: { write: true, confirm: false, summarize: (i) => `Rename dropdown value ${str(i, "id")} to "${str(i, "value")}"` },
  },
  {
    name: "set_dropdown_default",
    mcpName: "set_dropdown_value_default",
    summary:
      "Mark a dropdown value (by `id`) as one of the team's defaults, or take that mark off, with `isDefault`. A default value cannot be switched off by `set_dropdown_value_active` until the mark is taken off — that is what the mark is for. Renaming a default is always allowed.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/selectable/default",
    schema: obj({ id: S, isDefault: B }, ["id", "isDefault"]),
    buildBody: (i) => ({ id: str(i, "id"), isDefault: i.isDefault === true }),
    agent: {
      write: true,
      // Taking the mark OFF is the destructive half: it is the step that makes a
      // built-in value removable, so it is the one worth asking about.
      confirm: (i) => i.isDefault !== true,
      summarize: (i) =>
        `${i.isDefault === true ? "Make" : "Stop treating"} dropdown value ${str(i, "id")} ${i.isDefault === true ? "one of the defaults" : "as one of the defaults"}`,
    },
  },
  {
    name: "set_dropdown_active",
    mcpName: "set_dropdown_value_active",
    summary:
      "Switch a dropdown value off (deactivate) or back on (reactivate), never deleted. A value marked as one of the team's defaults refuses to switch off — take the mark off with `set_dropdown_default` first.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/selectable/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    agent: {
      write: true,
      confirm: (i) => i.active !== true, // destructive only when DEACTIVATING
      summarize: (i) => `${i.active === true ? "Activate" : "Deactivate"} dropdown value ${str(i, "id")}`,
    },
  },

  /* --------------------------------- tickets -------------------------------- */
  {
    name: "raise_help_ticket",
    mcpName: "create_help_ticket",
    summary:
      "Raise a new support ticket (description required). `accountId` names the CLIENT it is raised for. Use it whenever the ticket is on a client's behalf, because the client's own people see their company's tickets and a ticket with no client belongs to nobody. Leave it off only for the agency's own internal questions. A client-portal caller cannot set it; theirs is always their own company. `appId` names the system it is about and `moduleId` which SECTION of it, which is how tickets are grouped; a module must belong to the app named in `appId`. `raisedByContactId` is the person at that client who asked, which is not always whoever types it, since most of a client's history is written down on their behalf. A ticket whose kind is an extra, a request or feedback opens `awaiting_validation` and waits for that client's main stakeholder to confirm it; a question or an issue opens `new` and goes straight into the queue.",
    binding: "CONTENT", method: "POST", path: "/api/content/help",
    schema: obj({ description: S, helpType: S, screenRecordingLink: S, accountId: S, appId: S, moduleId: S, raisedByContactId: S }, ["description"]),
    // accountId is read in lib/help.ts, not in the handler, so R22's source scan
    // cannot derive it (see its own note on fields forwarded wholesale to a lib).
    // Exposed by hand, deliberately: without it a machine can only raise tickets
    // that no client will ever see.
    buildBody: (i) => ({ description: str(i, "description"), helpType: opt(i, "helpType"), screenRecordingLink: opt(i, "screenRecordingLink"), accountId: opt(i, "accountId"), appId: opt(i, "appId"), moduleId: opt(i, "moduleId"), raisedByContactId: opt(i, "raisedByContactId") }),
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
      "Edit a support ticket's details (by id). `accountId` names the client a ticket has none for, it can be SET once and never moved, because moving a ticket would take the conversation away from the people reading it. `appId` (the system it is about), `moduleId` (which SECTION of it — the module must belong to that app) and `raisedByContactId` (the person at that client who asked) can all be corrected freely; leaving either out keeps whatever the ticket already carries.",
    binding: "CONTENT", method: "POST", path: "/api/content/help/update",
    schema: obj({ id: S, description: S, helpType: S, screenRecordingLink: S, accountId: S, appId: S, moduleId: S, raisedByContactId: S }, ["id", "description"]),
    // Same note as create_help_ticket: read in lib/help.ts, so R22's scan cannot
    // derive it. Exposed by hand.
    buildBody: (i) => ({ id: str(i, "id"), description: str(i, "description"), helpType: opt(i, "helpType"), screenRecordingLink: opt(i, "screenRecordingLink"), accountId: opt(i, "accountId"), appId: opt(i, "appId"), moduleId: opt(i, "moduleId"), raisedByContactId: opt(i, "raisedByContactId") }),
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
      "Move a ticket along its lifecycle, by id. A STATUS IS A FACT here, not a switch, five of the seven stages are reached by something happening, so setting one by hand is a correction rather than the ordinary path. In order: awaiting_validation (an extra, a request or feedback, waiting for the client's main stakeholder, clear it with validate_help_ticket), new (raised, nobody has read it), triaged (somebody read it. Set by triage_help_ticket), scheduled (its work is booked into a sprint, happens by itself), in_progress (a timer started on it or on one of its stories, happens by itself), ready (every story closed, happens by itself), resolved (answered and closed). `status` will NOT accept 'resolved': answering a client is resolve_help_ticket, which requires the words to send. Moving a resolved ticket back to triaged is how a ticket is reopened, there is no separate reopened state.",
    binding: "CONTENT", method: "POST", path: "/api/content/help/status",
    schema: obj({ id: S, status: S }, ["id", "status"]),
    buildBody: (i) => ({ id: str(i, "id"), status: str(i, "status") }),
    agent: { write: true, confirm: false, summarize: (i) => `Set ticket ${str(i, "id")} to "${str(i, "status")}"` },
  },
  {
    // The two acts on the ladder a machine cannot infer. Everything else about a
    // ticket's status now happens by itself, so these are doors with their own
    // words rather than values in a status picker — and each is idempotent by
    // construction, so a second call moves nothing.
    name: "validate_help_ticket",
    summary:
      "The client CONFIRMS they want it: moves one ticket out of awaiting_validation and into the queue, by `id`. Only an extra, a request or feedback ever waits, a question or an issue goes straight in. A ticket in any other stage moves nothing, so this is safe to call twice.",
    binding: "CONTENT", method: "POST", path: "/api/content/help/validate",
    schema: obj({ id: S }, ["id"]),
    buildBody: (i) => ({ id: str(i, "id") }),
    agent: { write: true, confirm: false, summarize: (i) => `Confirm ticket ${str(i, "id")} should go ahead` },
  },
  {
    name: "triage_help_ticket",
    summary:
      "Record that somebody has READ a ticket, by `id`, the one judgement in the lifecycle nothing can infer. Moves it from new to triaged; a ticket already triaged, scheduled or being worked on moves nothing, so this never drags a started request backwards.",
    binding: "CONTENT", method: "POST", path: "/api/content/help/triage-read",
    schema: obj({ id: S }, ["id"]),
    buildBody: (i) => ({ id: str(i, "id") }),
    agent: { write: true, confirm: false, summarize: (i) => `Mark ticket ${str(i, "id")} triaged` },
  },
  {
    name: "list_help_attachments",
    summary:
      "The files and links on one ticket, by `id`, what somebody attached to show what they mean. `attachments` carries each one's `kind` ('file' or 'link'), its `label`, and the `url` to open it; `total` is how many there are.",
    binding: "CONTENT", method: "GET", path: "/api/content/help/attachments",
    schema: obj({ id: S }, ["id"]),
    buildQuery: (i) => `?id=${encodeURIComponent(str(i, "id"))}`,
    agent: { write: false, summarize: (i) => `List what's attached to ticket ${str(i, "id")}` },
  },
  {
    name: "add_help_link",
    summary:
      "Attach a LINK to a ticket: `id` is the ticket, `label` what a person reads, `url` where it goes. A ticket holds several. Files are attached from the app rather than here, this tool sends `kind` as 'link' and never uploads bytes.",
    binding: "CONTENT", method: "POST", path: "/api/content/help/attachments",
    schema: obj({ id: S, label: S, url: S }, ["id", "label", "url"]),
    // `kind` is fixed rather than exposed, and `fileDataUrl` is not offered at
    // all: a machine surface has no file picker, and an argument that can only
    // ever hold one value is a way to get it wrong. Both are named in
    // NARROWED_BODY_FIELDS with this reason.
    buildBody: (i) => ({ id: str(i, "id"), kind: "link", label: str(i, "label"), url: str(i, "url") }),
    agent: { write: true, confirm: false, summarize: (i) => `Attach "${str(i, "label")}" to ticket ${str(i, "id")}` },
  },
  {
    name: "remove_help_attachment",
    summary:
      "Take a file or a link off a ticket: `id` is the ticket, `attachmentId` the one to remove (from list_help_attachments). Nothing is deleted, the row keeps its history and the file stays where it was stored; it simply stops being listed.",
    binding: "CONTENT", method: "POST", path: "/api/content/help/attachments/remove",
    schema: obj({ id: S, attachmentId: S }, ["id", "attachmentId"]),
    buildBody: (i) => ({ id: str(i, "id"), attachmentId: str(i, "attachmentId") }),
    agent: { write: true, confirm: false, summarize: (i) => `Take an attachment off ticket ${str(i, "id")}` },
  },
  {
    name: "list_story_attachments",
    summary:
      "The files and links on one story, by `id` — what somebody put up to show what the work did. `attachments` carries each one's `kind` ('file' or 'link'), its `label`, and the `url` to open it; `total` is how many there are. A story needs at least one of these before it can go for review.",
    binding: "CONTENT", method: "GET", path: "/api/content/stories/attachments",
    schema: obj({ id: S }, ["id"]),
    buildQuery: (i) => `?id=${encodeURIComponent(str(i, "id"))}`,
    agent: { write: false, summarize: (i) => `List what's attached to story ${str(i, "id")}` },
  },
  {
    name: "add_story_link",
    summary:
      "Attach a LINK to a story: `id` is the story, `label` what a person reads, `url` where it goes. A story holds several, and needs at least one before `set_story_status` will move it to in_review. Files are attached from the app rather than here — this tool sends `kind` as 'link' and never uploads bytes.",
    binding: "CONTENT", method: "POST", path: "/api/content/stories/attachments",
    schema: obj({ id: S, label: S, url: S }, ["id", "label", "url"]),
    // `kind` fixed and `fileDataUrl` withheld, for the ticket door's reasons —
    // both named in NARROWED_BODY_FIELDS.
    buildBody: (i) => ({ id: str(i, "id"), kind: "link", label: str(i, "label"), url: str(i, "url") }),
    agent: { write: true, confirm: false, summarize: (i) => `Attach "${str(i, "label")}" to story ${str(i, "id")}` },
  },
  {
    name: "remove_story_attachment",
    summary:
      "Take a file or a link off a story: `id` is the story, `attachmentId` the one to remove (from list_story_attachments). Nothing is deleted, the row keeps its history and the file stays where it was stored; it simply stops being listed.",
    binding: "CONTENT", method: "POST", path: "/api/content/stories/attachments/remove",
    schema: obj({ id: S, attachmentId: S }, ["id", "attachmentId"]),
    buildBody: (i) => ({ id: str(i, "id"), attachmentId: str(i, "attachmentId") }),
    agent: { write: true, confirm: false, summarize: (i) => `Take an attachment off story ${str(i, "id")}` },
  },
  {
    // Drag-rank is the ONLY priority signal the product has (SCOPE ch.07), so
    // "make this one more urgent" has exactly one honest answer on this surface,
    // and this is it. Neighbours rather than a position, for the same reason the
    // door takes them: a position is arithmetic over a list that has since moved.
    name: "rank_help_ticket",
    summary:
      "Move a ticket up or down the list, by id. There is no priority field, the list's ORDER is the priority. Name the neighbours it should sit between: `afterId` is the ticket it goes below (higher up the list) and `beforeId` the one it goes above. Omit `afterId` to put it at the very top, `beforeId` to put it at the very bottom.",
    binding: "CONTENT", method: "POST", path: "/api/content/help/rank",
    schema: obj({ id: S, afterId: S, beforeId: S }, ["id"]),
    buildBody: (i) => ({ id: str(i, "id"), afterId: str(i, "afterId"), beforeId: str(i, "beforeId") }),
    agent: { write: true, confirm: false, summarize: (i) => `Reorder ticket ${str(i, "id")}` },
  },
  {
    name: "archive_help_ticket",
    summary:
      "Put a ticket away, or take it back out (`archived`: true to archive, false to restore). Available whatever state it is in. NOTHING is deleted, the ticket, its conversation and its history all survive; it simply stops appearing in the everyday list. Read them back with list_help_tickets and view: 'archived'.",
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
      "Add a reply to a support ticket's thread (by id). `taggedUserIds` @mentions teammates by user id (from list_members or list_help_stakeholders), each one starts following the ticket AND is emailed the reply. A mention is notify-only, never an instruction; the door de-dupes the list, drops your own id, and refuses more than 50 people.",
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
  {
    name: "resolve_help_ticket",
    summary:
      "ANSWER a ticket and TELL THE CLIENT: `resolution` is the words they will read. It resolves the ticket, appends those words to its conversation, and EMAILS the people at that client, one of only two things in the whole product that reach a customer's inbox. Read the ticket's draft resolution first (it is built from each story's closing note as the work finished) and send that, edited. An already-resolved ticket answers `{sent:false, alreadyResolved:true}` and emails nobody: a second call is not a second answer.",
    binding: "CONTENT", method: "POST", path: "/api/content/help/resolve",
    schema: obj({ id: S, resolution: S }, ["id", "resolution"]),
    buildBody: (i) => ({ id: str(i, "id"), resolution: str(i, "resolution") }),
    agent: {
      write: true,
      // CONFIRM, and of everything in this catalogue this is the one that most
      // obviously must. It sends a customer an answer, in the agency's name,
      // composed by a model that has been reading text a customer wrote. There
      // is no un-sending it.
      confirm: true,
      summarize: (i) => `Answer ticket ${str(i, "id")} and email the client`,
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
      "List the team's STORIES, the pieces of work WE do, as opposed to the tickets a client raises. Filters: `status` (open / in_progress / in_review / done), `ticketId` (the work on one request), `sprintId`, `appId` (all the work on one system, a story always has an app and only sometimes a sprint), `assigneeId`, `q` (searches the reference, the title and the detail), and `view` ('open' by default, which hides finished work. Pass 'all' to include it). Pass `id` to fetch one story. `sort` puts the page in an order and `dir` ('asc' or 'desc') flips it: 'rank' (the default, the order somebody dragged them into), 'deadline', 'created', 'status', 'assignee' or 'title'. The order is the DOOR's, so 'the three latest deadlines' is the whole backlog's three and not the loaded page's. Returns ONE page plus `total` (exact up to 1,000,000; `totalCapped` true means there are more than that), `hasMore`, and an opaque `nextCursor`, to read further, call again passing that value as `cursor` (never invent one).",
    binding: "CONTENT", method: "GET", path: "/api/content/stories",
    schema: obj({
      id: S, status: S, ticketId: S, sprintId: S, appId: S, assigneeId: S, q: S, view: S,
      sort: S, dir: S, cursor: S,
    }),
    buildQuery: (i) => {
      const q: string[] = []
      for (const k of [
        "id", "status", "ticketId", "sprintId", "appId", "assigneeId", "q", "view", "sort", "dir", "cursor",
      ])
        if (str(i, k)) q.push(`${k}=${encodeURIComponent(str(i, k))}`)
      return q.length ? `?${q.join("&")}` : ""
    },
    agent: { write: false, summarize: (i) => (str(i, "id") ? "Look up one story" : "List the work in hand") },
  },
  {
    name: "create_story",
    summary:
      "Write down one piece of work. `title` and `storyType` are both required, the kind is one of the team's own Story type values (Fix, Feature, Change as seeded). `ticketId` links it to the request it answers, most work has none, so leave it off unless you know the ticket. `processIds` names EVERY process this work touches and `changesNoStep` says it touches none; one of the two is required at the door, because a saving nobody can trace to a map is a saving nobody can check. `stepKey` names the step inside the map, and is required before the story can be marked done, so set it now if you know it.",
    binding: "CONTENT", method: "POST", path: "/api/content/stories",
    schema: obj(
      {
        title: S, detail: S, ticketId: S, sprintId: S, appId: S, processId: S,
        processIds: { type: "array" }, storyType: S,
        stepKey: S, changesNoStep: B, assigneeId: S, reviewerId: S, startsOn: S, dueOn: S, accountId: S,
      },
      ["title", "storyType"]
    ),
    // Every field the door reads off the body, forwarded. Most are read inside
    // lib/stories.ts rather than in the handler, exactly as create_help_ticket's
    // `accountId` is — exposed by hand for the same reason: without them a machine
    // could only write a title.
    buildBody: (i) => ({
      title: str(i, "title"),
      storyType: str(i, "storyType"),
      detail: opt(i, "detail"),
      ticketId: opt(i, "ticketId"),
      sprintId: opt(i, "sprintId"),
      appId: opt(i, "appId"),
      processId: opt(i, "processId"),
      processIds: Array.isArray(i.processIds) ? i.processIds : undefined,
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
      "Edit a story (by id). Same fields as create_story; `title` and `storyType` both stay required, and `processIds` is re-sent WHOLE, the set it names replaces the one the story carries. Re-pointing it at another ticket moves the work onto that client's books, which is why the reference number does NOT follow, a client may already be quoting it.",
    binding: "CONTENT", method: "POST", path: "/api/content/stories/update",
    schema: obj(
      {
        id: S, title: S, detail: S, ticketId: S, sprintId: S, appId: S, processId: S,
        processIds: { type: "array" }, storyType: S,
        stepKey: S, changesNoStep: B, assigneeId: S, reviewerId: S, startsOn: S, dueOn: S, accountId: S,
      },
      ["id", "title", "storyType"]
    ),
    buildBody: (i) => ({
      id: str(i, "id"),
      title: str(i, "title"),
      storyType: str(i, "storyType"),
      detail: opt(i, "detail"),
      ticketId: opt(i, "ticketId"),
      sprintId: opt(i, "sprintId"),
      appId: opt(i, "appId"),
      processId: opt(i, "processId"),
      processIds: Array.isArray(i.processIds) ? i.processIds : undefined,
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
      "Move a story along its four states, by id: open, in_progress (which also happens BY ITSELF the moment a timer starts on the story), in_review (someone is checking it), done. `closingNote` is what we will tell the client, and it is appended to the ticket's DRAFT resolution rather than sent. Two refusals, both deliberate: a story cannot go to in_review while any timer on it is still running, or without `reviewNote` saying what was done (`reviewFileUrl` and `reviewFileName` attach something to show for it, and are optional because plenty of work has nothing); and it cannot be set to done until it names the process step it changed (`stepKey` on the story) or is marked as changing none, the door refuses with 'step_required' rather than guessing, because every savings figure is computed from that answer.",
    binding: "CONTENT", method: "POST", path: "/api/content/stories/status",
    schema: obj({ id: S, status: S, closingNote: S, reviewNote: S, reviewFileUrl: S, reviewFileName: S }, ["id", "status"]),
    buildBody: (i) => ({
      id: str(i, "id"),
      status: str(i, "status"),
      closingNote: opt(i, "closingNote"),
      reviewNote: opt(i, "reviewNote"),
      reviewFileUrl: opt(i, "reviewFileUrl"),
      reviewFileName: opt(i, "reviewFileName"),
    }),
    agent: {
      write: true,
      confirm: false,
      summarize: (i) => `Set story ${str(i, "id")} to "${str(i, "status")}"`,
    },
  },
  {
    name: "list_sprints",
    summary:
      "List the blocks of delivery work sold, newest first, each with its kind, its dates, the flat price it was sold for (in whole cents) and how many of its stories are done. Pass `accountId` for one client's, or `appId` for one system's (a sprint covers exactly one app). `when` is 'all' by default; pass 'open' for only the blocks still worth putting work into, not completed, not archived, and not already past their end date. Bounded, not paged: a sprint is a contract, so there are few of them.",
    binding: "CONTENT", method: "GET", path: "/api/content/sprints",
    schema: obj({ accountId: S, appId: S, when: S }),
    buildQuery: (i) => {
      const q: string[] = []
      for (const k of ["accountId", "appId", "when"]) if (str(i, k)) q.push(`${k}=${encodeURIComponent(str(i, k))}`)
      return q.length ? `?${q.join("&")}` : ""
    },
    agent: { write: false, summarize: () => "List sprints" },
  },
  {
    name: "create_sprint",
    summary:
      "Start a sprint, a block of delivery work sold to one account, with a start, an end and a flat price. `soldPriceCents` is WHOLE CENTS (4500 euros is 450000), because a fractional price loses money between here and a margin. `sprintType` is Planning, Implementation or Iteration; a 'blueprint' is a PRICED PLANNING sprint, not a fourth kind.",
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
    name: "update_sprint",
    summary:
      "Edit a sprint by id, its name, kind, goal, dates and the flat price it was sold for. `soldPriceCents` is WHOLE CENTS, like `create_sprint`, and it is the field this door exists for: a sprint's price is the revenue half of every margin, and it was previously settable only at the moment the sprint was started. The CLIENT and the APP are NOT on this door and cannot be changed: the reference a client quotes was minted against the account, and the sprint's figures feed that account's margin, so re-pointing either would rewrite what an already-published number means. (Process-map versions are cut by hand on the map itself, not by completing a sprint — that automatic cut was purged in migration 0051.) Omitted fields are CLEARED, not kept: send the whole sprint as it should end up.",
    binding: "CONTENT", method: "POST", path: "/api/content/sprints/update",
    schema: obj(
      { id: S, name: S, goal: S, sprintType: S, startsOn: S, endsOn: S, soldPriceCents: N, currency: S },
      ["id", "name"]
    ),
    buildBody: (i) => ({
      id: str(i, "id"),
      name: str(i, "name"),
      goal: opt(i, "goal"),
      sprintType: opt(i, "sprintType"),
      startsOn: opt(i, "startsOn"),
      endsOn: opt(i, "endsOn"),
      soldPriceCents: typeof i.soldPriceCents === "number" ? i.soldPriceCents : undefined,
      currency: opt(i, "currency"),
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Edit sprint ${str(i, "id")}` },
  },
  {
    name: "complete_sprint",
    summary:
      "Mark a sprint finished, or reopen it (`complete`: true / false). Completing one CUTS A VERSION of every process map beneath it, the point from which the next savings figure is measured, so it is not a label, it is an event. Re-completing an already-complete sprint changes nothing and cuts nothing.",
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
      "Whose week it is on triage duty, and every ticket nobody has read yet that has been sitting more than three days, oldest first, with how many days each has waited. `onDuty` is public to the team; the `waiting` list is not, only the person on duty is given it, and `yours` says whether this caller is that person (when nobody holds the week, anyone who could triage it is). An INTERNAL prompt: it is never shown to a client and implies no service-level promise. Pass `week` (any date in it) to ask who was on duty for a different week.",
    binding: "CONTENT", method: "GET", path: "/api/content/triage",
    schema: obj({ week: S }),
    buildQuery: (i) => (str(i, "week") ? `?week=${encodeURIComponent(str(i, "week"))}` : ""),
    agent: { write: false, summarize: () => "Check what's waiting to be triaged" },
  },
  {
    name: "set_triage_duty",
    summary:
      "Put one named person on triage duty for a week, `userId` from list_members, and `week` as any date inside it (it snaps to that Monday; leave it off for this week). Exactly one person holds a week: naming a second replaces the first.",
    binding: "CONTENT", method: "POST", path: "/api/content/triage",
    schema: obj({ userId: S, week: S }, ["userId"]),
    buildBody: (i) => ({ userId: str(i, "userId"), week: opt(i, "week") }),
    agent: {
      write: true,
      confirm: false,
      summarize: (i, names) => `Put ${memberLabel(i, names)} on triage duty`,
    },
  },
  /* --------------------------------- meetings -------------------------------- */
  // THE CONVERSATIONS WE HAVE, and the two fields no other record can hold: what
  // we meant to cover, and what was decided. The assistant's most useful act here
  // is the one a person hates doing — writing the notes up straight after, out
  // loud, before the next call starts.
  {
    name: "list_meetings",
    summary:
      "List MEETINGS, conversations we have had or are about to have, newest first, with the agenda and the notes on each. `view` is 'upcoming' by default (what has not started yet, by the clock); pass 'week' for the week we are in, past and upcoming both, or 'all' for the whole meetings list including cancelled ones. `accountId` narrows to one client, `appId` to one system, `purposeId` to one reason we meet, `month` narrows to one calendar month as `YYYY-MM` (what a calendar asks for), and `q` searches the title, the agenda and the notes. Pass `id` for one meeting. `sort` puts the page in an order and `dir` ('asc' or 'desc') flips it: 'when' (the default, most recent first), 'title', 'client' or 'added'. The order is the DOOR's, so it spans the whole meetings list rather than the page you are holding. Returns ONE page plus `total` (exact up to 1,000,000; `totalCapped` true means there are more than that), `hasMore`, and an opaque `nextCursor`, to read further, call again passing that value as `cursor` (never invent one). A meeting is NOT a work log: it says what was agreed, never how long it took.",
    binding: "CONTENT", method: "GET", path: "/api/content/meetings",
    schema: obj({ id: S, accountId: S, appId: S, purposeId: S, view: S, month: S, q: S, sort: S, dir: S, cursor: S }),
    buildQuery: (i) => {
      const q: string[] = []
      for (const k of ["id", "accountId", "appId", "purposeId", "view", "month", "q", "sort", "dir", "cursor"])
        if (str(i, k)) q.push(`${k}=${encodeURIComponent(str(i, k))}`)
      return q.length ? `?${q.join("&")}` : ""
    },
    agent: {
      write: false,
      summarize: (i) => (str(i, "id") ? "Look up one meeting" : "List the meetings"),
    },
  },
  {
    name: "create_meeting",
    summary:
      "Put a meeting on the meetings list. `title` and `startsAt` are required; `startsAt` and `endsAt` are moments (a date AND a time, a meeting happens at an hour). `accountId` says which client it is with and is left off for an internal one; `appId` says which of their systems it was about and is left off when it was about the account itself; `purposeId` is why we meet, out of the meeting purposes list. `agenda` is what we mean to cover. This does NOT put anything in anybody's Google Calendar and nothing here can: kwapso reads calendars and never writes them. To have a meeting in both places, arrange it in Google Calendar and it arrives here on the next sync_calendar_series, with its guests, its join link and its attachments.",
    binding: "CONTENT", method: "POST", path: "/api/content/meetings",
    schema: obj(
      { title: S, startsAt: S, endsAt: S, accountId: S, appId: S, purposeId: S, agenda: S, notes: S, location: S },
      ["title", "startsAt"]
    ),
    buildBody: (i) => ({
      title: str(i, "title"),
      startsAt: str(i, "startsAt"),
      endsAt: opt(i, "endsAt"),
      accountId: opt(i, "accountId"),
      appId: opt(i, "appId"),
      purposeId: opt(i, "purposeId"),
      agenda: opt(i, "agenda"),
      notes: opt(i, "notes"),
      location: opt(i, "location"),
    }),
    agent: {
      write: true,
      confirm: false,
      summarize: (i) => `Arrange a meeting: "${str(i, "title").slice(0, 50)}"`,
    },
  },
  {
    name: "update_meeting",
    summary:
      "Correct a meeting, or write its notes up afterwards, by id. EVERY field is replaced by what you send. Read the meeting first and pass back what you are not changing, or you will blank it. `notes` is the one people actually use this for: what was said and decided, written straight after.",
    binding: "CONTENT", method: "POST", path: "/api/content/meetings/update",
    schema: obj(
      { id: S, title: S, startsAt: S, endsAt: S, accountId: S, appId: S, purposeId: S, agenda: S, notes: S, location: S },
      ["id", "title", "startsAt"]
    ),
    buildBody: (i) => ({
      id: str(i, "id"),
      title: str(i, "title"),
      startsAt: str(i, "startsAt"),
      endsAt: opt(i, "endsAt"),
      accountId: opt(i, "accountId"),
      appId: opt(i, "appId"),
      purposeId: opt(i, "purposeId"),
      agenda: opt(i, "agenda"),
      notes: opt(i, "notes"),
      location: opt(i, "location"),
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Update meeting ${str(i, "id")}` },
  },
  // `set_meeting_held` was here. A meeting's own `startsAt` says whether it has
  // happened, so the status it moved was a second source of truth for a question
  // the clock answers, and it is retired.
  {
    name: "set_meeting_active",
    summary:
      "Cancel a meeting (`active`: false) or put it back (true), by id. Nothing is deleted, the record and its notes survive, because 'didn't we speak in March?' has to stay answerable.",
    binding: "CONTENT", method: "POST", path: "/api/content/meetings/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    agent: {
      write: true,
      // Cancelling is this module's delete, so it pauses for a yes/no exactly as
      // the other three (de)activate toggles do; putting one back does not.
      confirm: (i) => i.active === false,
      summarize: (i) => `${i.active === false ? "Cancel" : "Reinstate"} meeting ${str(i, "id")}`,
    },
  },
  {
    name: "get_meeting_transcript",
    summary:
      "What was SAID in a meeting, by `id` — the transcript's own words, kept on the record rather than fetched from Google, so any colleague who may read meetings can read it. `text` is empty when none has been captured yet and `capturedAt` is then null; `foundBy` says which of the three hunts found it, `url` opens the document where it lives, and `note` is present only when the transcript was longer than one record may hold and says so in words. Use `read_meeting_transcript` first to go and find one.",
    binding: "CONTENT", method: "GET", path: "/api/content/meetings/transcript",
    schema: obj({ id: S }, ["id"]),
    buildQuery: (i) => `?id=${encodeURIComponent(str(i, "id"))}`,
    agent: { write: false, summarize: () => "Read what was said in a meeting" },
  },
  {
    name: "get_meeting_people",
    summary:
      "Which of the people on a meeting's invitation we already know, by `id`. Every address on the entry comes back once in `links`, with `memberUserId` and `memberName` set when it is one of our own team members, and `accountId` and `accountName` set when it is a contact on one of our accounts, resolved to the client the contact sits under rather than the contact's own row. Both halves are null for an address that is neither, which is most of them. Nothing is looked up anywhere outside this team. Who was INVITED, and what each of them answered, is on the meeting record itself.",
    binding: "CONTENT", method: "GET", path: "/api/content/meetings/people",
    schema: obj({ id: S }, ["id"]),
    buildQuery: (i) => `?id=${encodeURIComponent(str(i, "id"))}`,
    agent: { write: false, summarize: () => "Look up who was at a meeting" },
  },
  {
    name: "sync_calendar_series",
    summary:
      "Read the caller's Google Calendar into Meetings. ONE WAY, always: nothing in kwapso writes to a calendar. Every entry in the live window (a fortnight back, four weeks on) with no record yet becomes one, whether it repeats or not and whether it is past or future, and `created` counts them. Every meeting whose entry is in the window has its Google facts brought up to date, the description, the location, the guest list and what each person answered, the organiser, the join link, the attachments and the link back to the entry, and `updated` counts those. An entry called off in Google is cancelled here, counted by `cancelled`. Entries beyond the live horizon come back in `ahead` as read-only. It ALSO walks one slice of the caller's whole calendar, five years back to a year ahead, resuming from where the last call stopped: `swept` is the moment that walk has reached and `caughtUp` is true once it has reached the far end, so call it repeatedly to bring in a whole history. Safe to call twice: an entry that already has a record cannot get a second one, and one Google has not touched since the last call is skipped without a write.",
    binding: "CONTENT", method: "POST", path: "/api/content/meetings/sync-calendar",
    schema: obj({}),
    buildBody: () => ({}),
    agent: {
      write: true,
      confirm: false,
      summarize: () => "Bring in the repeating meetings from your calendar",
    },
  },
  {
    name: "read_meeting_transcript",
    summary:
      "Find and keep the transcript of a meeting that has already happened, by `id`, and record what its arrival means: a row of time is written for every one of OUR OWN people who was in the room. The client's people are never given one, a client's hour is not our cost. It hunts three ways in order of proof, the file Google attached to the calendar entry itself, then a document in a Drive folder the caller has shared, then a notice from Google in the caller's mail naming the document it made, and `foundBy` says which of the three found it. `captured` false means nothing was found or it had already been read, and `note` says which in a sentence; `logsWritten` counts the rows of time it wrote. Reading it twice does nothing the second time. The words themselves are read back with `get_meeting_transcript`.",
    binding: "CONTENT", method: "POST", path: "/api/content/meetings/transcript",
    schema: obj({ id: S }, ["id"]),
    buildBody: (i) => ({ id: str(i, "id") }),
    agent: {
      write: true,
      confirm: false,
      summarize: (i) => `Read the transcript of meeting ${str(i, "id")}`,
    },
  },
  // `add_meeting_to_calendar` was here, and it was one of only two tools on
  // either surface that WROTE into Google. The calendar is read-only as of
  // 18 August 2026 — the door it forwarded to no longer exists — so the honest
  // answer to "put this meeting in my calendar" is now: put it in Google, and it
  // will be read back here with its guests, its join link and its attachments.
  {
    name: "sync_google_knowledge",
    summary:
      "Bring MY OWN Google material into the knowledge base: the Drive folders and Chat spaces I named, mail to or from a known contact, and my calendar. Reads through MY connection only, never a colleague's, and files each item under the client it belongs to, keeping anything on my private shelf answerable to me alone. Safe to repeat: material that has not changed costs nothing, and pass `onlyIfStale` true to skip Google entirely when my material was already brought into step in the last five minutes, and `skipped` comes back true to say so, the answer is then the state as of that last sweep. Answers with a line per service and `caughtUp`, which is false when there is more to bring in on the next call.",
    binding: "CONTENT", method: "POST", path: "/api/content/knowledge/sync-google",
    schema: obj({ onlyIfStale: B }),
    buildBody: (i) => ({ onlyIfStale: i.onlyIfStale === true }),
    agent: { write: true, confirm: false, summarize: () => "Bring your Google material up to date" },
  },
  /* ---------------------------- to-dos and tasks ---------------------------- */
  // The two nouns that are the same shape and opposite audiences, and the model
  // needs to be told which is which more than a person does — a person reads two
  // different screens, and the assistant reads two tool descriptions.
  {
    name: "list_todos",
    summary:
      "List the things we are WAITING ON A CLIENT FOR, never our own admin, which is list_tasks. Each carries the reference the client quotes, the due date, whether they have completed it and the file they sent if there is one. `view` is 'open' by default; pass 'all' to include the completed. `accountId` narrows to one client.",
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
      "Ask a client for something, `accountId` says which client and `title` says what we need. A to-do sits in THEIR portal with a due date, and they complete it and attach a file themselves. Use it only for something we genuinely cannot proceed without; our own admin is create_task and a piece of delivery work is create_story.",
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
        `Ask ${accountLabel(i, "accountId", names)} for "${str(i, "title").slice(0, 50)}", this emails them`,
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
      "Withdraw a to-do we no longer need, by id. Nothing is deleted, it leaves the client's list and the decision stays on the record. Their side is simply told nothing, which is the point: an email saying 'ignore the last email' is worse than silence.",
    binding: "CONTENT", method: "POST", path: "/api/content/todos/cancel",
    schema: obj({ id: S }, ["id"]),
    buildBody: (i) => ({ id: str(i, "id") }),
    agent: { write: true, confirm: false, summarize: (i) => `Withdraw to-do ${str(i, "id")}` },
  },
  {
    name: "list_tasks",
    summary:
      "List KWAPSO'S OWN internal admin, never anything a client sees, which is list_todos. `view` is 'open' by default (everything not finished); the other five are 'overdue' (past its deadline), 'upcoming' (due today or later), 'completed', 'calendar' (everything with a deadline, finished or not) and 'all'. `assigneeId` narrows to one person's. Every view's count comes back whichever one you ask for, `openTotal`, `overdueTotal`, `upcomingTotal`, `completedTotal`, `calendarTotal`, `allTotal`, plus `dueTodayTotal` and `dueTodayDone`, which are everything due today or earlier and how many of those are done.",
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
      "Write down a piece of OUR OWN admin, the quarterly VAT return, renewing a domain, preparing next week's review. Nobody outside the agency ever sees one. `dueOn` is the deadline. `accountId` is optional and usually left off; naming a client is for admin ABOUT them (chasing an invoice), which is what puts the time in the right margin. `department` is one of the agency's five (Sales, Admin, Production, Marketing, Business) and it decides a second field: a Production task must name `appId`, a Sales task must name `accountId`, and an Admin task may. `important` and `urgent` are the two priority ticks, scored 1 to 4. `fileDataUrl` attaches one file (a base64 data URL, at most 10 MB) with `fileName` beside it. Time can be logged against a task, unlike a to-do.",
    binding: "CONTENT", method: "POST", path: "/api/content/tasks",
    schema: obj(
      {
        title: S, detail: S, dueOn: S, assigneeId: S, accountId: S,
        appId: S, department: S, important: B, urgent: B, fileDataUrl: S, fileName: S,
      },
      ["title"]
    ),
    buildBody: (i) => ({
      title: str(i, "title"),
      detail: opt(i, "detail"),
      dueOn: opt(i, "dueOn"),
      assigneeId: opt(i, "assigneeId"),
      accountId: opt(i, "accountId"),
      appId: opt(i, "appId"),
      department: opt(i, "department"),
      important: i.important === true,
      urgent: i.urgent === true,
      fileDataUrl: opt(i, "fileDataUrl"),
      fileName: opt(i, "fileName"),
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Add a task: "${str(i, "title").slice(0, 50)}"` },
  },
  {
    name: "update_task",
    summary:
      "Correct a task by `id` — its `title`, `detail`, `dueOn` deadline, `assigneeId`, `accountId`, `appId`, `department`, and the two priority ticks `important` and `urgent`. Every field is REPLACED by what you send, so send the whole task, not just the part you are changing: an omitted field is cleared. The two ticks are what the 1-to-4 priority score is derived from, so this is how a task is re-prioritised. A task that is already ticked off is refused — put it back with `set_task_done` first. The same rules the create door applies still hold: a Production task must name `appId` and a Sales task must name `accountId`.",
    binding: "CONTENT", method: "POST", path: "/api/content/tasks/update",
    schema: obj(
      {
        id: S, title: S, detail: S, dueOn: S, assigneeId: S, accountId: S,
        appId: S, department: S, important: B, urgent: B,
      },
      ["id", "title"]
    ),
    buildBody: (i) => ({
      id: str(i, "id"),
      title: str(i, "title"),
      detail: opt(i, "detail"),
      dueOn: opt(i, "dueOn"),
      assigneeId: opt(i, "assigneeId"),
      accountId: opt(i, "accountId"),
      appId: opt(i, "appId"),
      department: opt(i, "department"),
      important: i.important === true,
      urgent: i.urgent === true,
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Edit task ${str(i, "id")}` },
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
      "List rows of time, who worked on what, and for how long in whole seconds. Filters: `scope` ('mine' for the caller's own, 'all' otherwise), `targetTable` + `targetId` (the time against one story, ticket, task or meeting), `userId`, and `meetingTime`, 'exclude' drops the time spent in meetings, 'only' keeps nothing else, and leaving it off counts all of it. Returns ONE page plus `total` (rows, exact up to 1,000,000; `totalCapped` true means there are more than that), `totalSeconds` (the number anybody actually wants, and ALWAYS exact, it is billable time, never capped), `hasMore` and an opaque `nextCursor`. Call again passing that as `cursor` to read further. Binned runaway timers are never in the list.",
    binding: "CONTENT", method: "GET", path: "/api/content/work-logs",
    schema: obj({ scope: S, targetTable: S, targetId: S, userId: S, meetingTime: S, cursor: S }),
    buildQuery: (i) => {
      const q: string[] = []
      for (const k of ["scope", "targetTable", "targetId", "userId", "meetingTime", "cursor"])
        if (str(i, k)) q.push(`${k}=${encodeURIComponent(str(i, k))}`)
      return q.length ? `?${q.join("&")}` : ""
    },
    agent: { write: false, summarize: (i) => (str(i, "scope") === "mine" ? "List my time" : "List logged time") },
  },
  /* --------------------------------- the pulse ------------------------------ */
  {
    name: "get_team_pulse",
    // NO BACKTICKED IDENTIFIER IN THIS SUMMARY, and it is not shyness (R27). The
    // handler answers with shorthand properties, which the response-key
    // derivation reads as variables rather than field names — so naming them here
    // would need a DESCRIPTION_VOCABULARY line to explain a shape the caller can
    // simply read off one answer. The sentences below say what the tool is FOR,
    // which is the part a model cannot derive.
    summary:
      "The team's week in numbers, in one call: how many tickets are open and how they are spread across the stages of the lifecycle, how much work is in hand, how much of our own admin is due today or earlier, how many meetings are in this week, and — the part no other tool can give you — how many seconds were logged in each of the last eight weeks, oldest first, each labelled with the Monday that opens it. Ask it for a picture of how a week or a month went; ask list_help_tickets, list_stories or list_work_logs when you need the rows themselves. A section comes back empty when the caller's role cannot read that module, which is not the same as there being none.",
    binding: "CONTENT", method: "GET", path: "/api/content/insights",
    schema: obj({}),
    buildQuery: () => "",
    agent: { write: false, summarize: () => "Check how the team's week is going" },
  },
  {
    name: "list_running_timers",
    summary:
      "What the caller has running RIGHT NOW, one row per timer, with what it is on, when it started and how many whole seconds it has been going. `runaway` is true once one has been running more than eight hours, which is the prompt to ask what they want done about it.",
    binding: "CONTENT", method: "GET", path: "/api/content/work-logs/running",
    schema: obj({}),
    buildQuery: () => "",
    agent: { write: false, summarize: () => "Check my running timers" },
  },
  {
    name: "start_timer",
    summary:
      "Start a timer on a story or a ticket, `targetTable` is 'stories' or 'help' and `targetId` is that row's id. Time is logged against a story, a ticket or a task and NOTHING else: never a to-do (that is the client's time, not ours) and never an account on its own. Parallel timers on different things are fine; starting a second one on the SAME thing is refused. The start moment is the server's clock, never a time you pass.",
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
      "Stop one of the caller's running timers, by the timer's id (from list_running_timers). `endedAt` is optional and is how 'it really stopped at five o'clock on Friday' is said. Leave it off and it stops now. Stopping an already-stopped timer changes nothing.",
    binding: "CONTENT", method: "POST", path: "/api/content/work-logs/stop",
    schema: obj({ id: S, endedAt: S }, ["id"]),
    buildBody: (i) => ({ id: str(i, "id"), endedAt: opt(i, "endedAt") }),
    agent: { write: true, confirm: false, summarize: (i) => `Stop timer ${str(i, "id")}` },
  },
  {
    name: "log_time",
    summary:
      "Write time down by hand, for work already finished. `startedAt` and `endedAt` are ISO moments and the duration is computed FROM them, there is no field for a number of hours, because two moments can be checked afterwards and a number cannot. `billable` defaults to true. Same targets as start_timer: a story or a ticket, never a to-do and never an account.",
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
      "Answer for a timer left running (from list_running_timers, where `runaway` is true). Three answers and no fourth, `answer`: 'keep' (it really did run that long; stop it now), 'stopAt' (it ran until the moment in `at`), or 'discard' (nothing happened; the row is kept and marked binned, and every total subtracts it). Nothing is ever stopped automatically: a number a person did not choose is a number nobody can defend.",
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
      "Ask the team's knowledge base a question and get the passages that answer it, each with the source it came from. Pass `accountId` when the question is about one client and you know which, the answer is otherwise compartmented from the question's own words. By default it writes NOTHING for you: use the passages, quote the titles, and if `found` is false say so in the words of `message` rather than answering from memory (it refuses on purpose when nothing in the base is close enough, that is an answer, not a failure). `reason` says which compartment it searched and why, and `records` names what the question looks like it is ABOUT, repeat them when the answer looks wrong for the question. EVERY CITATION CARRIES `liveStatus`: the real row read at the moment of asking, which is what to say when it disagrees with the passage, the passage is what was indexed, `liveStatus` is what is true now. `recordPath` is where the record itself lives in the app (`tickets/<id>`, `processes/<id>`), null for a source with no record screen — offer it when somebody wants to go and read the original. `compose` true asks the app to write the answer out for you and return it as `answer`, which COSTS one of the team's assistant credits and needs the assistant right; leave it off when you are going to write the reply yourself, which is the normal case, or the same answer is paid for twice.",
    binding: "CONTENT", method: "GET", path: "/api/content/knowledge/ask",
    schema: obj({ q: S, accountId: S, limit: N, compose: B }, ["q"]),
    buildQuery: (i) => {
      const q = [`q=${encodeURIComponent(str(i, "q"))}`]
      if (str(i, "accountId")) q.push(`accountId=${encodeURIComponent(str(i, "accountId"))}`)
      if (typeof i.limit === "number") q.push(`limit=${i.limit}`)
      // The door reads the flag as the literal "1" (R20: a query value is checked
      // where it sits), so the only truthy spelling this surface sends is that one.
      if (i.compose === true) q.push("compose=1")
      return `?${q.join("&")}`
    },
    agent: { write: false, summarize: (i) => `Ask the knowledge base: "${str(i, "q").slice(0, 60)}"` },
  },
  {
    name: "list_knowledge_sources",
    summary:
      "List what the assistant is allowed to read. Filters: `kind` ('note' for something typed here, 'file' for one somebody uploaded, or 'ticket' / 'account' / 'contact' / 'app' / 'process' / 'sprint' / 'story' / 'meeting' / 'todo' / 'task' for material mirrored from the app's own rows, and 'document' / 'email' / 'event' / 'message' for material out of your own Google connection), `compartment` ('agency' or 'account:<id>'), `q` (searches the title and the summary), `active` ('yes' for the sources the assistant may read, 'no' for the ones somebody took away — they are kept, not deleted). `sort` puts the page in an order and `dir` ('asc' or 'desc') flips it: 'touched' (the default, most recently changed), 'added', 'title', 'kind' or 'dated' (the date the MATERIAL is from, which is not the date it was filed). Pass `id` for one source, a list row carries the SUMMARY of each source rather than its material, because a source can be a three-hundred-page contract; read one by id for its words. Returns ONE page plus `total` (exact up to 1,000,000; `totalCapped` true means there are more than that), `hasMore`, and an opaque `nextCursor`, to read further, call again passing that value as `cursor` (never invent one).",
    binding: "CONTENT", method: "GET", path: "/api/content/knowledge",
    schema: obj({ id: S, kind: S, compartment: S, q: S, active: S, sort: S, dir: S, cursor: S }),
    buildQuery: (i) => {
      const q: string[] = []
      for (const key of ["id", "kind", "compartment", "q", "active", "sort", "dir", "cursor"])
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
      "Is the knowledge base in step? One row per kind of material the app keeps in step for you — the customer spine (accounts, contacts), the built systems and their process maps, and the work (tickets, sprints, stories, meetings, to-dos, tasks): how far the sweep has read, when it last ran, when it last SUCCEEDED, and what went wrong if it didn't. `lastError` set with an old `lastOkAt` is the shape of 'it has been failing since Tuesday'. Read this before trusting an answer that seems to be missing something recent.",
    binding: "CONTENT", method: "GET", path: "/api/content/knowledge/sync",
    schema: obj({}),
    agent: { write: false, summarize: () => "Check whether the knowledge base is up to date" },
  },
  {
    name: "add_knowledge_source",
    summary:
      "Write something into the knowledge base so the assistant can use it from now on: `title` and `body` are the material itself. `accountId` files it under one client (leave it out for the agency's own). WHO MAY READ IT has three answers: `visibility` 'private' keeps it to you alone, `visibleToAppId` limits it to the people staffed to that app, and leaving both out means the whole team. An app you are not on is refused, so you cannot file something you would then be locked out of. It is searchable immediately. A whole document is fine, up to about 1.5 MB of text, roughly six hundred pages; past that it is REFUSED in words and nothing is saved, so split it and add the parts.",
    binding: "CONTENT", method: "POST", path: "/api/content/knowledge",
    schema: obj({ title: S, body: S, sourceUrl: S, accountId: S, visibility: S, visibleToAppId: S }, ["title"]),
    buildBody: (i) => ({
      title: str(i, "title"),
      body: opt(i, "body"),
      sourceUrl: opt(i, "sourceUrl"),
      accountId: opt(i, "accountId"),
      visibility: opt(i, "visibility"),
      visibleToAppId: opt(i, "visibleToAppId"),
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Add "${str(i, "title")}" to the knowledge base` },
  },
  {
    name: "update_knowledge_source",
    summary:
      "Correct a source (by id). A source MIRRORED from the app's own rows (a ticket, an account, an app) owns its own text, for those, only the filing can change here (`accountId`, `visibility`, `visibleToAppId`), because the sweep would overwrite anything else on its next pass. A note typed into the knowledge base is editable in full. Every field is written as you send it, so send the ones you are keeping too: omitting `visibleToAppId` widens a source back to the whole team.",
    binding: "CONTENT", method: "POST", path: "/api/content/knowledge/update",
    schema: obj({ id: S, title: S, body: S, sourceUrl: S, accountId: S, visibility: S, visibleToAppId: S }, ["id", "title"]),
    buildBody: (i) => ({
      id: str(i, "id"),
      title: str(i, "title"),
      body: opt(i, "body"),
      sourceUrl: opt(i, "sourceUrl"),
      accountId: opt(i, "accountId"),
      visibility: opt(i, "visibility"),
      visibleToAppId: opt(i, "visibleToAppId"),
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Correct knowledge source ${str(i, "id")}` },
  },
  {
    name: "set_knowledge_source_active",
    summary:
      "Take a source away from the assistant (active:false) or give it back (active:true), by id. Nothing is deleted: the row and its history survive, its searchable pieces do not, and the sweep will not quietly re-add a source somebody took away.",
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
      "Bring the knowledge base into step with the app's own rows, tickets, accounts, apps, stories and sprints, one bounded slice at a time. Every result carries `caughtUp`; keep calling while any of them is false. You rarely need it: asking a question catches the base up first, and a 15-minute sweep is the backstop. This is for the FIRST FILL of a base that has never been indexed.",
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
      "Pull a teammate into a support ticket so they follow it (`id` = the ticket, `userId` = the person). Add-only, it never removes anyone.",
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
      "List the systems we have built, an App is the thing with its own address and its own stage (SCOPE ch.02). `accountId` narrows to one client's systems, and `q` searches an app's `name`. Bounded: an agency has tens of apps, so there is no cursor here; the collection that grows underneath is process maps.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/apps",
    schema: obj({ accountId: S, q: S }),
    buildQuery: (i) => {
      const p = new URLSearchParams()
      if (str(i, "accountId")) p.set("accountId", str(i, "accountId"))
      if (str(i, "q")) p.set("q", str(i, "q"))
      return p.size ? `?${p}` : ""
    },
    agent: { write: false, summarize: () => "List the apps we've built" },
  },
  {
    name: "create_app",
    summary:
      "Record a system we have built. `accountId` is whose it is (leave it out for the agency's own). `toolCostCentsPerMonth` is what it costs US to keep running, an internal figure, never shown to a client. `stage` is where it has got to, one of the team's App stage values. `logoUrl` is the client's own mark: send a `data:image/png|jpeg|webp;base64,…` URL and the bytes are stored and the row keeps our own path, or send a path we already minted. The four context fields are prose: `about` is what the system is, `clientContext` is the situation it was built into, `solution` is what we did about it, and `keyActors` is who actually uses it. `staffUserIds` is who from OUR team is on it (`leadUserId` names the team lead, who must be one of them) and `stakeholderContactIds` is the client's own people (`mainStakeholderContactId` names the main one, who must be one of them, and is who a resolved ticket on this app is emailed to).",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/apps",
    schema: obj(
      {
        name: S, accountId: S, url: S, stage: S, logoUrl: S, toolCostCentsPerMonth: N, about: S, clientContext: S,
        solution: S, keyActors: S, ...APP_PEOPLE_SCHEMA,
      },
      ["name"]
    ),
    buildBody: (i) => ({
      name: str(i, "name"),
      accountId: opt(i, "accountId"),
      url: opt(i, "url"),
      stage: opt(i, "stage"),
      logoUrl: opt(i, "logoUrl"),
      toolCostCentsPerMonth: typeof i.toolCostCentsPerMonth === "number" ? i.toolCostCentsPerMonth : undefined,
      about: opt(i, "about"),
      clientContext: opt(i, "clientContext"),
      solution: opt(i, "solution"),
      keyActors: opt(i, "keyActors"),
      ...appPeopleBody(i),
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Record the app "${str(i, "name")}"` },
  },
  {
    name: "update_app",
    summary:
      "Edit an app's own details (by id), never which account it belongs to, which is set once when it is created. Send ONLY the fields you are changing; anything you leave out keeps its current value. `logoUrl` follows that rule too: send a `data:` image to replace the mark, send it empty to take the picture away, leave it out to keep the one the app has. The four context fields (`about`, `clientContext`, `solution`, `keyActors`) are prose and are edited here like any other field. `staffUserIds` and `stakeholderContactIds` are each re-sent WHOLE, the set you name replaces the one the app has, and anybody dropped keeps their history rather than being deleted. Leave a list out entirely to change nobody.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/apps/update",
    schema: obj(
      {
        id: S, name: S, url: S, stage: S, logoUrl: S, toolCostCentsPerMonth: N, about: S, clientContext: S,
        solution: S, keyActors: S, ...APP_PEOPLE_SCHEMA,
      },
      ["id", "name"]
    ),
    buildBody: (i) => ({
      id: str(i, "id"),
      name: str(i, "name"),
      url: sent(i, "url"),
      stage: sent(i, "stage"),
      logoUrl: sent(i, "logoUrl"),
      toolCostCentsPerMonth: typeof i.toolCostCentsPerMonth === "number" ? i.toolCostCentsPerMonth : undefined,
      about: sent(i, "about"),
      clientContext: sent(i, "clientContext"),
      solution: sent(i, "solution"),
      keyActors: sent(i, "keyActors"),
      ...appPeopleBody(i),
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Edit the app "${str(i, "name")}"` },
  },
  {
    name: "set_app_active",
    summary:
      "Archive an app (`active: false`) or restore it (`active: true`). Never deleted, its maps, its versions and every saving computed from them stay exactly where they are. An archived app drops out of the value figures.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/apps/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    agent: {
      write: true,
      confirm: (i) => i.active !== true,
      summarize: (i) => `${i.active === true ? "Restore" : "Archive"} app ${str(i, "id")}`,
    },
  },
  // WHAT WE HANDED OVER ON AN APP — its own module, so a token whose role opens
  // apps does not automatically reach the handover shelf, and one that reaches
  // the shelf does not automatically edit the app. Internal: like the brand
  // library, every one of these doors refuses a client login outright.
  {
    name: "list_deliverables",
    summary:
      "What we handed over on one system: handover docs, API references, recorded walkthroughs, SOPs. `appId` names the app whose shelf you want; `id` narrows to one row. Each carries a `kind` (the team's own word for what sort of thing it is), a `title`, a `datedOn` day, a `url` pointing at the material itself, and an `imageUrl` when there is a picture worth showing. Bounded: a shelf is curated rather than accumulated, so there is no cursor here. Internal: a client login cannot reach this door.",
    binding: "CONTENT", method: "GET", path: "/api/content/deliverables",
    schema: obj({ appId: S, id: S }),
    buildQuery: (i) => {
      const q: string[] = []
      for (const key of ["appId", "id"]) if (str(i, key)) q.push(`${key}=${encodeURIComponent(str(i, key))}`)
      return q.length ? `?${q.join("&")}` : ""
    },
    agent: { write: false, summarize: () => "Read what we handed over" },
  },
  {
    name: "create_deliverable",
    summary:
      "File something we handed over on an app. `appId` and `title` are required, and the app is what it belongs to for good, the account it was built for is copied off the app rather than sent. `kind` is picked-or-created as a dropdown value, so a word nobody has used yet becomes one. `datedOn` is a calendar day written YYYY-MM-DD. `url` is the material: a link anywhere (a recording, a document, an API reference) — uploading the bytes themselves is a screen action, not a tool. `imageUrl` is the picture on its card.",
    binding: "CONTENT", method: "POST", path: "/api/content/deliverables",
    schema: obj({ appId: S, title: S, kind: S, datedOn: S, url: S, imageUrl: S }, ["appId", "title"]),
    buildBody: (i) => deliverableBody(i),
    agent: {
      write: true,
      confirm: false,
      summarize: (i) => `File "${str(i, "title")}" as a deliverable`,
    },
  },
  {
    name: "update_deliverable",
    summary:
      "Correct a deliverable (by `id`). `appId` is which app's shelf it sits on and cannot be changed by sending a different one — file it again on the right app and archive this one. Same fields as filing one.",
    binding: "CONTENT", method: "POST", path: "/api/content/deliverables/update",
    schema: obj({ id: S, appId: S, title: S, kind: S, datedOn: S, url: S, imageUrl: S }, ["id", "appId", "title"]),
    buildBody: (i) => ({ id: str(i, "id"), ...deliverableBody(i) }),
    agent: { write: true, confirm: false, summarize: (i) => `Edit deliverable ${str(i, "id")}` },
  },
  {
    name: "set_deliverable_active",
    summary:
      "Archive a deliverable (`active: false`) or put it back (`active: true`). Never deleted, and the file behind it is never thrown away either way, restoring one whose bytes had gone would hand back a broken link.",
    binding: "CONTENT", method: "POST", path: "/api/content/deliverables/active",
    schema: obj({ id: S, appId: S, active: B }, ["id", "appId", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), appId: str(i, "appId"), active: i.active === true }),
    agent: {
      write: true,
      confirm: (i) => i.active !== true,
      summarize: (i) => `${i.active === true ? "Restore" : "Archive"} deliverable ${str(i, "id")}`,
    },
  },
  {
    // SHOWING ONE TO THE CLIENT, on the machine surface. It is here rather than
    // absent because the module's other four capabilities are here (R13: shipping
    // the code ships the capability), and because leaving it out would mean an
    // assistant could file a handover doc and archive it but not do the one thing
    // the shelf now exists for.
    //
    // IT CONFIRMS IN ONE DIRECTION, and that is the whole of its care. Sharing
    // hands material to somebody outside the agency; hiding takes it back. So the
    // confirm rides `visible === true`, the mirror of `set_deliverable_active`,
    // whose confirm rides the archiving direction. The model reads team text an
    // attacker can author, and "make every deliverable visible" is a sentence
    // somebody could plant in a ticket.
    name: "set_deliverable_visibility",
    summary:
      "Show a deliverable to the client (`visible: true`) or take it back (`visible: false`). `id` is the deliverable and `appId` is the app whose shelf it sits on. Off until somebody turns it on: a deliverable is invisible to the client until this is called, and the client then reads it in their own portal alongside the rest of their company's shared material. Withdrawing one is instant and leaves the record untouched. Archiving a deliverable also withdraws it, without changing this switch.",
    binding: "CONTENT", method: "POST", path: "/api/content/deliverables/visibility",
    schema: obj({ id: S, appId: S, visible: B }, ["id", "appId", "visible"]),
    buildBody: (i) => ({ id: str(i, "id"), appId: str(i, "appId"), visible: i.visible === true }),
    agent: {
      write: true,
      confirm: (i) => i.visible === true,
      summarize: (i) =>
        `${i.visible === true ? "Show" : "Hide"} deliverable ${str(i, "id")} ${i.visible === true ? "to" : "from"} the client`,
    },
  },
  {
    name: "list_app_modules",
    summary:
      "List the MODULES of an app — the sections the software is divided into, like Settings, Documents or Tasks. A module is what a ticket says it is about, so this is how tickets are grouped; it is NOT a process (a process is a way of working, and belongs to the account's world, not the app's structure). `appId` narrows to one system and is what you almost always want; `id` fetches just one module; `archived` accepts 'all' to include the sections that have been switched off. Each row carries `name`, `mark` (the emoji beside it), `nameDe` (the German name), `description`, `benefit` and `ticketCount`, the open tickets filed against it. Bounded, not paged: an app has a handful of sections, never a stream of them.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/app-modules",
    schema: obj({ id: S, appId: S, archived: S }),
    buildQuery: (i) => {
      const q: string[] = []
      for (const key of ["id", "appId", "archived"]) if (str(i, key)) q.push(`${key}=${encodeURIComponent(str(i, key))}`)
      return q.length ? `?${q.join("&")}` : ""
    },
    agent: {
      write: false,
      summarize: (i) => (str(i, "appId") ? `List the modules of app ${str(i, "appId")}` : "List app modules"),
    },
  },
  {
    name: "create_app_module",
    summary:
      "Add a section to an app. `name` is what it is called on screen; `mark` is an emoji shown beside it, `nameDe` the German name for a client who reads in German, `description` what the section does and `benefit` what it gives them. Two live modules of one app cannot share a name.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/app-modules",
    schema: obj({ appId: S, name: S, mark: S, nameDe: S, description: S, benefit: S }, ["appId", "name"]),
    buildBody: (i) => ({
      appId: str(i, "appId"),
      name: str(i, "name"),
      mark: opt(i, "mark"),
      nameDe: opt(i, "nameDe"),
      description: opt(i, "description"),
      benefit: opt(i, "benefit"),
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Add the module "${str(i, "name")}"` },
  },
  {
    name: "update_app_module",
    summary:
      "Rename or re-describe a module (by id). Send ONLY what you are changing; to empty a field, send it as an empty string. A rename reaches every ticket filed against it straight away, because a ticket stores the module rather than its spelling.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/app-modules/update",
    schema: obj({ id: S, name: S, mark: S, nameDe: S, description: S, benefit: S }, ["id", "name"]),
    buildBody: (i) => ({
      id: str(i, "id"),
      name: str(i, "name"),
      mark: sent(i, "mark"),
      nameDe: sent(i, "nameDe"),
      description: sent(i, "description"),
      benefit: sent(i, "benefit"),
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Edit the module "${str(i, "name")}"` },
  },
  {
    name: "set_app_module_active",
    summary:
      "Switch a module off (`active: false`) or back on (`active: true`). Never deleted: every ticket already filed against it keeps naming it and still reads correctly — it simply stops being offered on the ticket form.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/app-modules/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    agent: {
      write: true,
      confirm: (i) => i.active !== true,
      summarize: (i) => `${i.active === true ? "Switch on" : "Switch off"} module ${str(i, "id")}`,
    },
  },
  {
    name: "list_processes",
    summary:
      "List process maps, a Process is a way of working inside an App. Filters: `q` (searches the name and description), `appId` (only that app's maps), `archived` ('no' for the maps still in use, 'yes' for the ones put away — a map is archived, never deleted). `sort` puts the page in an order and `dir` ('asc' or 'desc') flips it: 'created' (the default, newest first), 'name', 'app' or 'steps' (the longest map first). The order is the DOOR's, so it spans every map rather than the page you are holding. Returns ONE page plus `total` (exact up to 1,000,000; `totalCapped` true means there are more than that), `hasMore`, and an opaque `nextCursor`, to read further, call again passing that value as `cursor` (never invent one).",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/processes",
    schema: obj({ q: S, appId: S, archived: S, sort: S, dir: S, cursor: S }),
    buildQuery: (i) => {
      const q: string[] = []
      for (const key of ["q", "appId", "archived", "sort", "dir", "cursor"])
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
      "One process map in full (by id): its versions newest-first, the steps of ONE version with their times and the order they happen in, the exact number of comments on it, the other maps it is connected to, and the saving it produces (step by step, with the caption that number must be quoted with). `versionId` reads an OLDER version, its steps exactly as they were agreed when it was cut; leave it off for the current one. `asOf` is a day (YYYY-MM-DD) and reads the map as it was on that day, out of its dated history; the reply also lists every day it changed. `auditDate` is the day every saving on this map is measured FROM, which is Alex's visit rather than a version number.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/processes/detail",
    schema: obj({ id: S, versionId: S, asOf: S }, ["id"]),
    buildQuery: (i) => {
      const p = new URLSearchParams({ id: str(i, "id") })
      if (str(i, "versionId")) p.set("versionId", str(i, "versionId"))
      if (str(i, "asOf")) p.set("asOf", str(i, "asOf"))
      return `?${p}`
    },
    agent: { write: false, summarize: (i) => `Look up process map ${str(i, "id")}` },
  },
  // ── THE CLIENT'S OWN ORGANISATION ──────────────────────────────────────────
  // Who does the work at a client, what an hour of them costs, and what they run
  // on. The reason it is on the machine surface at all: a saving is only MONEY
  // once a step's minutes meet a role's hourly cost, so an assistant asked "what
  // would automating this save Bergman" needs to be able to read and fill these.
  {
    name: "list_client_departments",
    summary:
      "The departments inside a client's own company. `accountId` narrows to one client; leave it off for every client you may see. Each carries `name`, whether it is `active`, and `roleCount` — how many roles sit in it. Answers `departments` and an exact `total`.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/client/departments",
    schema: obj({ accountId: S }),
    buildQuery: (i) => (str(i, "accountId") ? `?accountId=${encodeURIComponent(str(i, "accountId"))}` : ""),
    agent: { write: false, summarize: () => "List the client's departments" },
  },
  {
    name: "create_client_department",
    summary:
      "Add a department to a client's company. `accountId` is the client it belongs to and `name` is what they call it. Two live departments of one client cannot share a name.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/client/departments",
    schema: obj({ accountId: S, name: S }, ["accountId", "name"]),
    buildBody: (i) => ({ accountId: str(i, "accountId"), name: str(i, "name") }),
    agent: { write: true, confirm: false, summarize: (i) => `Add the department "${str(i, "name")}"` },
  },
  {
    name: "update_client_department",
    summary: "Rename a department. `id` is the department and `name` is the new word for it.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/client/departments/update",
    schema: obj({ id: S, name: S }, ["id", "name"]),
    buildBody: (i) => ({ id: str(i, "id"), name: str(i, "name") }),
    agent: { write: true, confirm: false, summarize: (i) => `Rename a department to "${str(i, "name")}"` },
  },
  {
    name: "set_client_department_active",
    summary:
      "Switch a department off, or bring it back. `active` false retires it; true restores it. Nothing is deleted — a retired department is still the one an old map was drawn against.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/client/departments/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    agent: {
      write: true, confirm: false,
      summarize: (i) => (i.active === true ? "Bring a department back" : "Switch a department off"),
    },
  },
  {
    name: "list_client_roles",
    summary:
      "The roles inside a client's own company — the jobs their people do. `accountId` narrows to one client. Each carries `name`, `centsPerHour` (what an hour of that role costs THE CLIENT, null when nobody has said yet — which is not the same as free), whether it is `active`, the `departmentIds` it sits in (a role can be in several) and the `peopleIds` holding it. Answers `roles` and an exact `total`.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/client/roles",
    schema: obj({ accountId: S }),
    buildQuery: (i) => (str(i, "accountId") ? `?accountId=${encodeURIComponent(str(i, "accountId"))}` : ""),
    agent: { write: false, summarize: () => "List the client's roles" },
  },
  {
    name: "create_client_role",
    summary:
      "Add a role to a client's company. `accountId` is the client, `name` is the job. `centsPerHour` is what an hour of it costs them, in cents — leave it off if nobody knows yet, and a saving computed from it will read as incomplete rather than as zero. `departmentIds` is the list of departments it sits in, and it may be more than one.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/client/roles",
    schema: obj(
      { accountId: S, name: S, centsPerHour: N, departmentIds: { type: "array" } },
      ["accountId", "name"]
    ),
    buildBody: (i) => ({
      accountId: str(i, "accountId"),
      name: str(i, "name"),
      centsPerHour: typeof i.centsPerHour === "number" ? i.centsPerHour : undefined,
      departmentIds: Array.isArray(i.departmentIds) ? i.departmentIds : undefined,
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Add the role "${str(i, "name")}"` },
  },
  {
    name: "update_client_role",
    summary:
      "Edit a role: its `name`, what an hour costs (`centsPerHour`, in cents), and the `departmentIds` it sits in. The departments are the WHOLE set, not an addition — send every department the role should be in, because anything left out is removed.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/client/roles/update",
    schema: obj({ id: S, name: S, centsPerHour: N, departmentIds: { type: "array" } }, ["id", "name"]),
    buildBody: (i) => ({
      id: str(i, "id"),
      name: str(i, "name"),
      centsPerHour: typeof i.centsPerHour === "number" ? i.centsPerHour : undefined,
      departmentIds: Array.isArray(i.departmentIds) ? i.departmentIds : undefined,
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Update the role "${str(i, "name")}"` },
  },
  {
    name: "set_client_role_person",
    summary:
      "Say that somebody holds a role, or that they no longer do. `id` is the role and `personAccountId` is a CONTACT you already have — there is no separate person record here on purpose. `attached` true links them, false unlinks. One person can hold several roles and one role can be held by several people.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/client/roles/people",
    schema: obj({ id: S, personAccountId: S, attached: B }, ["id", "personAccountId", "attached"]),
    buildBody: (i) => ({
      id: str(i, "id"),
      personAccountId: str(i, "personAccountId"),
      attached: i.attached === true,
    }),
    agent: {
      write: true, confirm: false,
      summarize: (i) => (i.attached === true ? "Put somebody on a role" : "Take somebody off a role"),
    },
  },
  {
    name: "set_client_role_active",
    summary:
      "Switch a role off, or bring it back. Nothing is deleted: a retired role is still the one a two-year-old map was drawn against, and deleting it would quietly turn that map's saving into nothing.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/client/roles/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    agent: {
      write: true, confirm: false,
      summarize: (i) => (i.active === true ? "Bring a role back" : "Switch a role off"),
    },
  },
  {
    name: "list_client_tools",
    summary:
      "The tools a client runs on — anything a step uses, digital or physical. `accountId` narrows to one client. `asOf` (a day, like 2026-03-01) reads the price that was in force ON THAT DAY rather than today's, which is what lets a map set to March cost March correctly; leave it off for today. Each carries `name`, `mark`, whether it is `active`, and `cents` / `billingPeriod` / `effectiveOn` for the price that applied. Answers `tools` and an exact `total`.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/client/tools",
    schema: obj({ accountId: S, asOf: S }),
    buildQuery: (i) => {
      const q: string[] = []
      for (const key of ["accountId", "asOf"])
        if (str(i, key)) q.push(`${key}=${encodeURIComponent(str(i, key))}`)
      return q.length ? `?${q.join("&")}` : ""
    },
    agent: { write: false, summarize: () => "List the client's tools" },
  },
  {
    name: "list_client_tool_prices",
    summary:
      "What one tool has cost over time, newest first. `id` is the tool. Each row carries `cents`, `billingPeriod` and the `effectiveOn` day it started being true — the record behind the single number a map shows.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/client/tools/prices",
    schema: obj({ id: S }, ["id"]),
    buildQuery: (i) => `?id=${encodeURIComponent(str(i, "id"))}`,
    agent: { write: false, summarize: () => "Read a tool's price history" },
  },
  {
    name: "create_client_tool",
    summary:
      "Add a tool to a client's estate. `accountId` is the client, `name` is the tool, `mark` is an optional icon. It is created with NO price — set one with set_client_tool_price, which files it under the day it started being true.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/client/tools",
    schema: obj({ accountId: S, name: S, mark: S }, ["accountId", "name"]),
    buildBody: (i) => ({
      accountId: str(i, "accountId"),
      name: str(i, "name"),
      mark: opt(i, "mark"),
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Add the tool "${str(i, "name")}"` },
  },
  {
    name: "update_client_tool",
    summary:
      "Rename a tool or change its `mark`. Its price is NOT here — a price belongs to a date, so it is set through set_client_tool_price and never overwritten in place.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/client/tools/update",
    schema: obj({ id: S, name: S, mark: S }, ["id", "name"]),
    buildBody: (i) => ({ id: str(i, "id"), name: str(i, "name"), mark: opt(i, "mark") }),
    agent: { write: true, confirm: false, summarize: (i) => `Update the tool "${str(i, "name")}"` },
  },
  {
    name: "set_client_tool_price",
    summary:
      "Say what a tool costs, from a given day. `toolId` is the tool, `cents` the amount, `billingPeriod` either 'month' or 'year', and `effectiveOn` the day that price started being true (like 2026-03-01). Setting a price for a day that already has one REPLACES it — that is a correction. Any other day is a new row, which is what keeps the history a history.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/client/tools/price",
    schema: obj(
      { toolId: S, cents: N, billingPeriod: S, effectiveOn: S },
      ["toolId", "cents", "billingPeriod", "effectiveOn"]
    ),
    buildBody: (i) => ({
      toolId: str(i, "toolId"),
      cents: typeof i.cents === "number" ? i.cents : undefined,
      billingPeriod: str(i, "billingPeriod"),
      effectiveOn: str(i, "effectiveOn"),
    }),
    agent: {
      write: true, confirm: false,
      summarize: (i) => `Set a tool's price from ${str(i, "effectiveOn")}`,
    },
  },
  {
    name: "set_client_tool_active",
    summary:
      "Switch a tool off, or bring it back. Nothing is deleted — its price history is what an old map reads to cost itself.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/client/tools/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    agent: {
      write: true, confirm: false,
      summarize: (i) => (i.active === true ? "Bring a tool back" : "Switch a tool off"),
    },
  },
  {
    name: "create_process",
    summary:
      "Map a way of working inside an app. It is created WITH its version 1, the way the work was done before we touched anything, because a process with no baseline can never produce a saving. `baselineLabel` is what the client calls that old way. `roleName` is WHOSE hours this takes, the bookkeeper, the dispatcher, whoever actually does it, and it is what turns the hours this map gives back into money (see get_app_impact) — a map created without one counts its hours and reports no money at all, so name it here rather than leaving it for update_process.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/processes",
    schema: obj({ appId: S, name: S, description: S, baselineLabel: S, roleName: S }, ["appId", "name"]),
    buildBody: (i) => ({
      appId: str(i, "appId"),
      name: str(i, "name"),
      description: opt(i, "description"),
      baselineLabel: opt(i, "baselineLabel"),
      roleName: opt(i, "roleName"),
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Map the process "${str(i, "name")}"` },
  },
  {
    name: "update_process",
    summary:
      "Rename or re-describe a process map (by id), or say who does the work. Send ONLY what you are changing; to empty a field, send it as an empty string. `roleName` is WHOSE hours this process takes, the bookkeeper, the dispatcher, whoever actually does it, and it is what turns the hours this map gives back into money (see get_app_impact). It is free text in the team's own words, and naming a role nobody has priced is fine: the hours still count and the money is reported as unpriced rather than invented.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/processes/update",
    schema: obj({ id: S, name: S, description: S, roleName: S }, ["id", "name"]),
    buildBody: (i) => ({
      id: str(i, "id"),
      name: str(i, "name"),
      description: sent(i, "description"),
      roleName: sent(i, "roleName"),
    }),
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
      "Add a step to a process map's CURRENT version. `secondsPerRun` is how long it takes each time; `runsPerPeriod` and `frequencyPeriod` are how often it happens, said the way a person says it: 2 a day, or 40 a month, and everything downstream converts to months once. Both are AGREED ESTIMATES, and every savings figure in the app is a subtraction between two of them, so do not guess: ask. `roleId` is WHICH of the client's own roles does this step, from `list_client_roles`, and it is what the step's minutes are priced at; leave it out and the step inherits the map's own role. `toolId` is the ONE thing it is done in, from `list_client_tools`: a step done in two systems has a handoff in the middle of it, and that is two steps. `branchLabel` is the word on a fork, such as: if the claim is rejected, and `loopsBackTo` is the step key this one sends the work back to.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/processes/steps",
    schema: obj(
      { processId: S, name: S, description: S, secondsPerRun: N, runsPerPeriod: N, frequencyPeriod: S, position: N, roleId: S, toolId: S, branchLabel: S, loopsBackTo: S },
      ["processId", "name", "secondsPerRun", "runsPerPeriod"]
    ),
    buildBody: (i) => ({
      processId: str(i, "processId"),
      name: str(i, "name"),
      description: opt(i, "description"),
      secondsPerRun: typeof i.secondsPerRun === "number" ? i.secondsPerRun : undefined,
      runsPerPeriod: typeof i.runsPerPeriod === "number" ? i.runsPerPeriod : undefined,
      frequencyPeriod: opt(i, "frequencyPeriod"),
      position: typeof i.position === "number" ? i.position : undefined,
      roleId: opt(i, "roleId"),
      toolId: opt(i, "toolId"),
      branchLabel: opt(i, "branchLabel"),
      loopsBackTo: opt(i, "loopsBackTo"),
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Add the step "${str(i, "name")}"` },
  },
  {
    name: "update_process_step",
    summary:
      "Edit ONE step (by id), only in the map's CURRENT version. Editing an older version is refused: a baseline that can be changed after the fact is a saving anybody can dial up, and the whole point of these numbers is that a client can check them. `runsPerPeriod` and `frequencyPeriod` are how often it happens, said the way a person says it. `roleId` is who does the step, from `list_client_roles`, and changing it changes the money the map reports without changing a minute on it; send it empty to say nobody is named, leave it out to keep who is. `toolId` is the ONE thing it is done in. `branchLabel` and `loopsBackTo` describe the shape — the word on a fork, and the step key this one sends work back to.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/processes/steps/update",
    schema: obj(
      { id: S, name: S, description: S, secondsPerRun: N, runsPerPeriod: N, frequencyPeriod: S, position: N, roleId: S, toolId: S, branchLabel: S, loopsBackTo: S },
      ["id", "name", "secondsPerRun", "runsPerPeriod"]
    ),
    buildBody: (i) => ({
      id: str(i, "id"),
      name: str(i, "name"),
      description: sent(i, "description"),
      secondsPerRun: typeof i.secondsPerRun === "number" ? i.secondsPerRun : undefined,
      runsPerPeriod: typeof i.runsPerPeriod === "number" ? i.runsPerPeriod : undefined,
      frequencyPeriod: opt(i, "frequencyPeriod"),
      position: typeof i.position === "number" ? i.position : undefined,
      roleId: sent(i, "roleId"),
      toolId: sent(i, "toolId"),
      branchLabel: sent(i, "branchLabel"),
      loopsBackTo: sent(i, "loopsBackTo"),
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
    name: "delete_process_step",
    summary:
      "Delete a step COMPLETELY (by `id`) — for a step added by mistake, as if it was never added, history included. This is a different verb from `remove_process_step`: stopping is a fact about the work and becomes a saving; deleting is an admission the row was wrong. The door refuses a step that is part of an agreed version, or one another step sends work back to — those can only be switched off — and says which rule refused.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/processes/steps/delete",
    schema: obj({ id: S }, ["id"]),
    buildBody: (i) => ({ id: str(i, "id") }),
    agent: { write: true, confirm: true, summarize: (i) => `Delete step ${str(i, "id")} completely` },
  },
  // ── WAVES ────────────────────────────────────────────────────────────────
  // What a client BOUGHT. On the machine surface because the owner ruled the
  // assistant should be able to help PLAN one — "plan a blueprint wave for Keno
  // Group should produce a draft you edit" — and a planner that cannot read what
  // has already been sold plans the same thing twice.
  {
    name: "list_waves",
    summary:
      "The packages clients have bought. A Wave is several sprints sold together; `accountId` narrows to one client's. Bounded: a wave is something the agency SELLS, so the list grows at the speed of contracts, not of work. Dates are DERIVED from the sprints inside and stored, so a wave with no sprints yet has none.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/waves",
    schema: obj({ accountId: S }),
    buildQuery: (i) => (str(i, "accountId") ? `?accountId=${encodeURIComponent(str(i, "accountId"))}` : ""),
    agent: { write: false, summarize: () => "List the packages clients bought" },
  },
  {
    name: "get_wave",
    summary:
      "One wave in full (by `id`): what it is for, the sprints inside it, and any clash between their dates. A clash is reported and never refused — two sprints really can overlap, and a door that said no would be describing a rule nobody agreed to.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/waves/one",
    schema: obj({ id: S }, ["id"]),
    buildQuery: (i) => `?id=${encodeURIComponent(str(i, "id"))}`,
    agent: { write: false, summarize: (i) => `Look up wave ${str(i, "id")}` },
  },
  {
    name: "create_wave",
    summary:
      "Sell a wave: `accountId` is whose it is, `name` is what it is called, `goal` is what it is for. It carries NO price — what a wave costs is deliberately out of this module's first version. Sprints are put in afterwards with `set_sprint_wave`, and the wave's dates follow them.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/waves",
    schema: obj({ accountId: S, name: S, goal: S }, ["accountId", "name"]),
    buildBody: (i) => ({ accountId: str(i, "accountId"), name: str(i, "name"), goal: opt(i, "goal") }),
    agent: { write: true, confirm: false, summarize: (i) => `Sell the wave "${str(i, "name")}"` },
  },
  {
    name: "update_wave",
    summary:
      "Rename a wave (by `id`) or re-word what it is for. Never its dates: those are derived from the sprints in it, and a date somebody typed would disagree with the sprints the moment one moved.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/waves/update",
    schema: obj({ id: S, name: S, goal: S }, ["id", "name"]),
    buildBody: (i) => ({ id: str(i, "id"), name: str(i, "name"), goal: sent(i, "goal") }),
    agent: { write: true, confirm: false, summarize: (i) => `Rename the wave to "${str(i, "name")}"` },
  },
  {
    name: "set_wave_active",
    summary:
      "Switch a wave off, or bring it back (by `id`). Never a delete: the sprints inside it keep their history, and a package a client paid for stays readable.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/waves/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    agent: { write: true, confirm: true, summarize: (i) => `${i.active === true ? "Bring back" : "Switch off"} a wave` },
  },
  {
    name: "set_sprint_wave",
    summary:
      "Put a sprint into a wave, or take it out. `sprintId` is the sprint; `waveId` is the wave, or leave it empty to take the sprint out of whichever wave it is in. The wave's start and end dates are recalculated on both ends, so a sprint moving between waves re-dates the one it left as well as the one it joined.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/waves/sprint",
    schema: obj({ sprintId: S, waveId: S }, ["sprintId"]),
    buildBody: (i) => ({ sprintId: str(i, "sprintId"), waveId: sent(i, "waveId") }),
    agent: { write: true, confirm: false, summarize: () => "Move a sprint between waves" },
  },
  {
    name: "set_audit_date",
    summary:
      "Move the day a process map's savings are measured FROM. `auditDate` is a day (YYYY-MM-DD) and it selects which agreed version counts as the before, so every figure on the map — and on the client's own portal — changes with it, without a single minute of their work changing. Setting it to the day it already holds does nothing and says so.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/processes/audit-date",
    schema: obj({ processId: S, auditDate: S }, ["processId", "auditDate"]),
    buildBody: (i) => ({ processId: str(i, "processId"), auditDate: str(i, "auditDate") }),
    agent: {
      write: true,
      // CONFIRM, because this is the one write in the module that moves a number
      // a client is already looking at while changing nothing about their work.
      confirm: true,
      summarize: (i) => `Measure savings from ${str(i, "auditDate")}`,
    },
  },
  {
    name: "connect_processes",
    summary:
      "Say that one process map hands its work to another. LOOSE: it changes no duration, no frequency and no saving on either side — it is a signpost, and the last step of one process very often is the first step of another. `note` is what the connection is, in the team's own words. Connecting the same pair twice is the same sentence, so the second call answers `alreadyLinked` rather than failing.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/processes/link",
    schema: obj({ fromProcessId: S, toProcessId: S, note: S }, ["fromProcessId", "toProcessId"]),
    buildBody: (i) => ({
      fromProcessId: str(i, "fromProcessId"),
      toProcessId: str(i, "toProcessId"),
      note: opt(i, "note"),
    }),
    agent: { write: true, confirm: false, summarize: () => "Connect two process maps" },
  },
  {
    name: "disconnect_processes",
    summary:
      "Take a connection between two process maps away. `id` is the connection, from `get_process`. Nothing about either map's times or savings changes, because nothing about them changed when it was made.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/processes/unlink",
    schema: obj({ id: S, processId: S }, ["id", "processId"]),
    buildBody: (i) => ({ id: str(i, "id"), processId: str(i, "processId") }),
    agent: { write: true, confirm: true, summarize: () => "Disconnect two process maps" },
  },
  {
    name: "cut_process_version",
    summary:
      "Cut a new version of a process map: today's steps are copied forward and the current version is frozen exactly as it was agreed. A version is only ever cut by hand. Press twice in quick succession and the second call answers `alreadyCut: true` rather than cutting a second one.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/processes/versions",
    schema: obj({ processId: S, label: S }, ["processId"]),
    buildBody: (i) => ({
      processId: str(i, "processId"),
      label: opt(i, "label"),
    }),
    agent: { write: true, confirm: false, summarize: (i) => `Cut a new version of map ${str(i, "processId")}` },
  },
  {
    name: "list_process_comments",
    summary:
      "The conversation on one process map (`processId`), the client's questions and the team's answers, oldest first. A comment marked `explainsStepKey` is the team's explanation for a step that now takes LONGER than it used to.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/processes/comments",
    schema: obj({ processId: S }, ["processId"]),
    buildQuery: (i) => `?processId=${encodeURIComponent(str(i, "processId"))}`,
    agent: { write: false, summarize: (i) => `Read the conversation on map ${str(i, "processId")}` },
  },
  {
    name: "comment_on_process",
    summary:
      "Say something on a process map. A comment is a CONVERSATION, never an edit, it changes no step, no time and no figure. `explainsStepKey` marks it as the explanation for a step that got slower, which is what the client's own screen shows beside it; only the team may set that.",
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
    name: "read_impact",
    summary:
      "THE SAVINGS, drilled App → Process → Step: for each step, what it took before, what it takes now, how often it happens, and the subtraction between them. `accountId` / `appId` narrow it. Every answer carries the caption that makes it honest, the times are agreed estimates, the subtraction is arithmetic, and a `prices` block appears ONLY for an account whose price visibility is switched on. A step that got slower is included and counted, never filtered out.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/impact",
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
  // holds `commercials`, which no client role does (R24).
  {
    name: "list_account_rates",
    summary:
      "What one account is CHARGED per hour, by kind of work (`accountId`). This is the client-facing rate card, what they agreed, not what our own hour costs us.",
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
      "Deactivate a rate (`active: false`) or bring it back (`active: true`). Never deleted, what an account was charged last year has to stay true.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/rates/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    agent: {
      write: true,
      confirm: true,
      summarize: (i) => `${i.active === true ? "Activate" : "Deactivate"} rate ${str(i, "id")}`,
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
      "Add what a kind of our own work costs per hour, in whole CENTS. `isDefault: true` makes it the rate a margin applies to time whose kind of work is unknown, there can be only one, and setting a second is refused.",
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
    summary: "Deactivate one of our own cost lines (`active: false`) or bring it back. Never deleted.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/internal-rates/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    agent: {
      write: true,
      confirm: true,
      summarize: (i) => `${i.active === true ? "Activate" : "Deactivate"} internal rate ${str(i, "id")}`,
    },
  },
  {
    name: "read_margin",
    summary:
      "Revenue minus our own logged time minus tool costs, for one account (`accountId`), with every line it was built from. INTERNAL, never repeat this figure to a client, in any form; it is the one number SCOPE says they must never see. `loggedTimeAvailable: false` means the work engine's time records are not in this database yet, so the time half of the subtraction is missing and the number is not yet a margin.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/margin",
    schema: obj({ accountId: S }, ["accountId"]),
    buildQuery: (i) => `?accountId=${encodeURIComponent(str(i, "accountId"))}`,
    agent: { write: false, summarize: (i) => `Work out the margin on ${accountLabel(i, "accountId")}` },
  },
  {
    name: "list_role_rates",
    summary:
      "What an hour of each ROLE is worth, the bookkeeper, the dispatcher, whoever actually does a process. INTERNAL: never quote one to a client. This is the third rate card and it answers a different question from the other two: `list_account_rates` is what a client is charged and `list_internal_rates` is what a kind of our own work costs us. Each row carries `roleName`, `centsPerHour` and whether it is still `active`.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/role-rates",
    schema: obj({}),
    buildQuery: () => "",
    agent: { write: false, summarize: () => "Read what an hour of each role is worth" },
  },
  {
    name: "set_role_rate",
    summary:
      "Set what an hour of one role is worth, by name. The ROLE is the key, so this one tool adds, re-prices and deactivates: `roleName` names it, `centsPerHour` is WHOLE CENTS an hour (45 euros is 4500), and `active: false` switches it off without deleting anything. Re-sending a price that has not changed moves nothing and writes no history. INTERNAL, this number feeds what an app is said to have given back, and it is never shown to a client.",
    binding: "TENANCY", method: "POST", path: "/api/tenancy/role-rates",
    schema: obj({ roleName: S, centsPerHour: N, active: B }, ["roleName", "centsPerHour", "active"]),
    buildBody: (i) => ({
      roleName: str(i, "roleName"),
      centsPerHour: typeof i.centsPerHour === "number" ? i.centsPerHour : 0,
      active: i.active !== false,
    }),
    agent: {
      write: true,
      confirm: false,
      summarize: (i) => `Price an hour of ${str(i, "roleName")}`,
    },
  },
  {
    name: "get_app_impact",
    summary:
      "What ONE app has given back every month: `savedSecondsPerMonth` (the hours), `moneyCentsPerMonth` (those hours at the rate of the role that used to spend them) and one line per process in `lines`, each naming its `roleName` and `centsPerHour`. `unpricedProcesses` counts the processes that could not be priced because they name no role or the role has no live rate, their HOURS are still in the total and their money is not, and saying so is the point. Always quote `caption` with the figure. INTERNAL: the money half comes from the role rate card, so never repeat it to a client, the hours half on its own is what the client's own value screen shows.",
    binding: "TENANCY", method: "GET", path: "/api/tenancy/app-money",
    schema: obj({ appId: S }, ["appId"]),
    buildQuery: (i) => `?appId=${encodeURIComponent(str(i, "appId"))}`,
    agent: { write: false, summarize: (i) => `Work out what app ${str(i, "appId")} gives back` },
  },

  /* ------------------- the agency's own housekeeping ------------------------ */
  // Three modules the assistant reaches exactly as a person does — same doors,
  // same gates, same audit rows. Every summary below says whose material it is,
  // because the assistant repeats what it reads: an agency asking it to draft a
  // client update must not be handed "what Ana is bad at" as context, and the
  // structural defence (no portal door, refusePortalCaller everywhere) protects
  // the CLIENT's session, not the assistant's own choice of words.

  {
    name: "list_brand_assets",
    summary:
      "The agency's own brand material, logos, decks, templates, and where each one lives. Internal: a client login cannot reach this door.",
    binding: "CONTENT", method: "GET", path: "/api/content/brand-assets",
    schema: obj({ id: S }),
    buildQuery: (i) => (str(i, "id") ? `?id=${encodeURIComponent(str(i, "id"))}` : ""),
    agent: { write: false, summarize: () => "Read the brand library" },
  },
  {
    name: "create_brand_asset",
    summary:
      "Add something to the brand library (name required). `category` is picked-or-created as a dropdown value. `fileUrl` may be a link anywhere; uploading the bytes themselves is a screen action, not a tool. An asset that IS a colour carries `colorHex` (`#RRGGBB`) instead of a file — a swatch is drawn from the value, never fetched from a website.",
    binding: "CONTENT", method: "POST", path: "/api/content/brand-assets",
    schema: obj({ name: S, category: S, description: S, fileUrl: S, colorHex: S }, ["name"]),
    buildBody: (i) => brandAssetBody(i),
    agent: { write: true, confirm: false, summarize: (i) => `Add "${str(i, "name")}" to the brand library` },
  },
  {
    name: "update_brand_asset",
    summary: "Edit a brand asset (by id). Same fields as creating one.",
    binding: "CONTENT", method: "POST", path: "/api/content/brand-assets/update",
    schema: obj({ id: S, name: S, category: S, description: S, fileUrl: S, colorHex: S }, ["id", "name"]),
    buildBody: (i) => ({ id: str(i, "id"), ...brandAssetBody(i) }),
    agent: { write: true, confirm: false, summarize: (i) => `Edit brand asset ${str(i, "id")}` },
  },
  {
    name: "set_brand_asset_active",
    summary:
      "Archive a brand asset, or put it back. The FILE is never deleted either way, restoring an asset whose bytes had been thrown away would hand back a broken link.",
    binding: "CONTENT", method: "POST", path: "/api/content/brand-assets/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    agent: {
      write: true,
      confirm: (i) => i.active !== true,
      summarize: (i) => `${i.active === true ? "Restore" : "Archive"} brand asset ${str(i, "id")}`,
    },
  },

  {
    name: "list_meeting_purposes",
    summary: "Why the agency meets, and which department each purpose belongs to. Internal.",
    binding: "CONTENT", method: "GET", path: "/api/content/delivery/purposes",
    schema: obj({ id: S }),
    buildQuery: (i) => (str(i, "id") ? `?id=${encodeURIComponent(str(i, "id"))}` : ""),
    agent: { write: false, summarize: () => "Read the meeting purposes" },
  },
  {
    name: "create_meeting_purpose",
    summary:
      "Add a meeting purpose (name required). `department` is picked-or-created as a dropdown value, which is why a purpose is a record and a department is not.",
    binding: "CONTENT", method: "POST", path: "/api/content/delivery/purposes",
    schema: obj({ name: S, department: S, description: S }, ["name"]),
    buildBody: (i) => meetingPurposeBody(i),
    agent: { write: true, confirm: false, summarize: (i) => `Add the "${str(i, "name")}" meeting purpose` },
  },
  {
    name: "update_meeting_purpose",
    summary: "Edit a meeting purpose (by id).",
    binding: "CONTENT", method: "POST", path: "/api/content/delivery/purposes/update",
    schema: obj({ id: S, name: S, department: S, description: S }, ["id", "name"]),
    buildBody: (i) => ({ id: str(i, "id"), ...meetingPurposeBody(i) }),
    agent: { write: true, confirm: false, summarize: (i) => `Edit meeting purpose ${str(i, "id")}` },
  },
  {
    name: "set_meeting_purpose_active",
    summary: "Archive a meeting purpose, or put it back, never deleted.",
    binding: "CONTENT", method: "POST", path: "/api/content/delivery/purposes/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    agent: {
      write: true,
      confirm: (i) => i.active !== true,
      summarize: (i) => `${i.active === true ? "Restore" : "Archive"} meeting purpose ${str(i, "id")}`,
    },
  },

  {
    name: "list_staff_profiles",
    summary:
      "What the team's own people are like and how they work best. Pass `userId` for one person's. THE AGENCY'S OWN, and the sharpest case of it in the app: never repeat any of this to a client, or into anything a client will read. A client login cannot reach the door.",
    binding: "CONTENT", method: "GET", path: "/api/content/staff/profiles",
    schema: obj({ userId: S }),
    buildQuery: (i) => (str(i, "userId") ? `?userId=${encodeURIComponent(str(i, "userId"))}` : ""),
    agent: { write: false, summarize: (i) => (str(i, "userId") ? `Read ${memberLabel(i)}'s profile` : "Read the team's staff profiles") },
  },
  {
    name: "save_staff_profile",
    summary:
      "Write a colleague's profile (`userId` required). ONE door for both cases: if they have no profile yet this writes one, and if they do this replaces its fields, a person either has a profile or they don't, and asking the caller which would be a race between two open tabs.",
    binding: "CONTENT", method: "POST", path: "/api/content/staff/profiles",
    schema: obj(
      { userId: S, headline: S, personalityType: S, strengths: S, weaknesses: S, roleModels: S, about: S, photoUrl: S },
      ["userId"]
    ),
    buildBody: (i) => staffProfileBody(i),
    agent: {
      write: true,
      // A profile is about a PERSON and this door overwrites it whole, so it
      // confirms — not because it is destructive in the permission sense, but
      // because "the assistant rewrote what my colleagues read about me" is not
      // something anybody should discover afterwards.
      confirm: true,
      summarize: (i) => `Write ${memberLabel(i)}'s staff profile`,
    },
  },
  {
    name: "set_staff_profile_active",
    summary: "Take a staff profile down, or put it back, never deleted.",
    binding: "CONTENT", method: "POST", path: "/api/content/staff/profiles/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    agent: {
      write: true,
      confirm: true,
      summarize: (i) => `${i.active === true ? "Restore" : "Take down"} staff profile ${str(i, "id")}`,
    },
  },

  {
    name: "list_staff_certificates",
    summary:
      "The qualifications the team holds. Pass `userId` for one person's. The door narrows, not the caller: filtering a capped list afterwards would disagree with the count beside it. Internal.",
    binding: "CONTENT", method: "GET", path: "/api/content/staff/certificates",
    schema: obj({ userId: S }),
    buildQuery: (i) => (str(i, "userId") ? `?userId=${encodeURIComponent(str(i, "userId"))}` : ""),
    agent: { write: false, summarize: (i) => (str(i, "userId") ? `Read ${memberLabel(i)}'s certificates` : "Read the team's certificates") },
  },
  {
    name: "create_staff_certificate",
    summary:
      "Record a qualification somebody holds (`userId` and `title` required). `issuedOn` / `expiresOn` are days, written YYYY-MM-DD, anything that is not a real calendar day is refused rather than stored, because an expiry that half parses is a certificate that silently never lapses.",
    binding: "CONTENT", method: "POST", path: "/api/content/staff/certificates",
    schema: obj({ userId: S, title: S, issuer: S, issuedOn: S, expiresOn: S, fileUrl: S }, ["userId", "title"]),
    buildBody: (i) => ({ userId: str(i, "userId"), ...certificateBody(i) }),
    agent: { write: true, confirm: false, summarize: (i) => `Record the "${str(i, "title")}" certificate for ${memberLabel(i)}` },
  },
  {
    name: "update_staff_certificate",
    summary: "Edit a certificate (by id). Same fields as recording one.",
    binding: "CONTENT", method: "POST", path: "/api/content/staff/certificates/update",
    schema: obj({ id: S, userId: S, title: S, issuer: S, issuedOn: S, expiresOn: S, fileUrl: S }, ["id", "title"]),
    buildBody: (i) => ({ id: str(i, "id"), userId: opt(i, "userId"), ...certificateBody(i) }),
    agent: { write: true, confirm: false, summarize: (i) => `Edit certificate ${str(i, "id")}` },
  },
  {
    name: "set_staff_certificate_active",
    summary: "Archive a certificate, or put it back, never deleted.",
    binding: "CONTENT", method: "POST", path: "/api/content/staff/certificates/active",
    schema: obj({ id: S, active: B }, ["id", "active"]),
    buildBody: (i) => ({ id: str(i, "id"), active: i.active === true }),
    agent: {
      write: true,
      confirm: (i) => i.active !== true,
      summarize: (i) => `${i.active === true ? "Restore" : "Archive"} certificate ${str(i, "id")}`,
    },
  },
]

/** Lookup by canonical name (the agent's name). */
export const sharedByName = (name: string): SharedTool | undefined => SHARED_TOOLS.find((t) => t.name === name)
