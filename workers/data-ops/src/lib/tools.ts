// The agent's TOOL CATALOG (opt-in: an action is a tool ONLY if it's here) and the
// act-as-user EXECUTOR. Every tool maps to a gated endpoint the UI already uses;
// executing it forwards the caller's session cookie, so the real door re-checks their
// permission and validates the input — the agent can never exceed the invoker's rights.
//
// The ~two dozen tenancy/content CRUD tools are DECLARED ONCE in the shared catalog
// (`shared/workers/tool-catalog.ts`) and shared with the MCP surface — this file
// PROJECTS each shared endpoint into an AgentTool (adding the model-facing description +
// confirm rule + step summary via `toAgentTool`), then adds the agent-ONLY tools below
// (reads/bulk/import that the MCP doesn't expose, and the SELF import-batch runner).
//
// SAFETY (locked):
//   • Act-as-user — every tool runs through the same gated endpoint AS the caller, so
//     the agent has the user's EXACT rights and the real door re-checks each call.
//   • Confirm rule — the agent pauses for a yes/no panel ONLY before a DESTRUCTIVE act
//     (removing a member, revoking an invite, or DEACTIVATING an existing role /
//     article / dropdown value) or a BULK / import write. Every constructive write runs
//     straight away (see `requiresConfirm` — the one place this is decided).
//   • Catastrophic blocks — controlling DEVICE SESSIONS and DELETING the team are not in
//     the catalog; the agent structurally cannot do them (identityBlocked is the backstop).
//   • Fence — tool RESULTS are returned to the model as DATA (role:"tool"), never as
//     instructions; the system prompt reinforces it.

import { GuardError, requireRight, teamContext } from "@shared/workers/gating"
import { forwardToDoor } from "@shared/workers/http"
import { BULK_IDS_LIMIT } from "@shared/workers/limits"
import { publishChange } from "@shared/workers/realtime"
import { B, checkArgTypes, obj, S, str } from "@shared/workers/tool-args"
import { roleLabel, SHARED_TOOLS, type SharedTool } from "@shared/workers/tool-catalog"
import { isPrivilegeWrite } from "@shared/workers/tool-gates"
import { confirmBatch, getBatchView, planModules } from "./import-batch"
import type { Env } from "../env"
import type { ToolSpec } from "./model"

export type AgentTool = {
  name: string
  description: string
  schema: Record<string, unknown>
  binding: "CONTENT" | "TENANCY" | "SELF"
  method: "GET" | "POST"
  path: string
  write: boolean
  /** show the yes/no confirm panel — a boolean, or an input-aware predicate (the three
   * (de)activate toggles confirm only when turning something OFF). Read by requiresConfirm. */
  confirm: boolean | ((input: Record<string, unknown>) => boolean)
  /** never exposed actions guard (identity acts) — true = always refuse. */
  identityBlocked?: boolean
  buildQuery?: (input: Record<string, unknown>) => string
  buildBody?: (input: Record<string, unknown>) => Record<string, unknown>
  /** One-line human label for the step row / confirm panel. `names` maps an id → a
   * friendly name so a summary reads "Remove Jane Doe" not a ULID. */
  summarize: (input: Record<string, unknown>, names?: Record<string, string>) => string
  /** binding:"SELF" tools run INSIDE data-ops (the import batch engine) instead of
   * fetching another worker — still act-as-user (the handler re-opens teamContext). */
  run?: (env: Env, request: Request, input: Record<string, unknown>) => Promise<ToolResult>
}

/** Project a shared endpoint into an AgentTool: the neutral wiring + the model-facing
 * description (the shared `summary`) + the agent's own write / confirm / step summary. */
function toAgentTool(s: SharedTool): AgentTool {
  return {
    name: s.name,
    description: s.summary,
    schema: s.schema,
    binding: s.binding,
    method: s.method,
    path: s.path,
    write: s.agent.write,
    confirm: s.agent.confirm ?? false,
    buildBody: s.buildBody,
    buildQuery: s.buildQuery,
    summarize: s.agent.summarize,
  }
}

/** Tools the AGENT exposes but the MCP does not: a read the MCP serves via export, the
 * two bulk writes, the set-shaped bulk, and the SELF import runner. */
const AGENT_ONLY: AgentTool[] = [
  {
    name: "get_role_permissions",
    description:
      "Read a role's access rights (its permission matrix, by role id): for each module — read, create, edit, delete.",
    schema: obj({ roleId: S }, ["roleId"]),
    binding: "TENANCY",
    method: "GET",
    path: "/api/tenancy/roles/permissions",
    write: false,
    confirm: false,
    buildQuery: (i) => `?roleId=${encodeURIComponent(str(i, "roleId"))}`,
    summarize: (i, names) => `Read access rights for ${roleLabel(i, names)}`,
  },
  {
    name: "set_help_status_by_filter",
    description:
      "The SET-shaped bulk: move EVERY support ticket matching a facet filter (status and/or type — the " +
      "same facets the Tickets screen sends; free text is NOT accepted for a write) to one status, in one " +
      "call. Call it FIRST with dryRun:true to learn the TRUE match count, then again for real — the " +
      `count you state must come from that dry run. Refuses a filter matching more than ${BULK_IDS_LIMIT} ` +
      "tickets; a re-run changes nothing (idempotent).",
    schema: obj(
      { toStatus: S, status: S, helpType: S, dryRun: { type: "boolean" } },
      ["toStatus"]
    ),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/help/bulk-status-by-filter",
    write: true,
    // The count-first step (dryRun) reads; only the real write pauses for yes/no.
    confirm: (i) => i.dryRun !== true,
    buildBody: (i) => ({
      toStatus: str(i, "toStatus"),
      ...(str(i, "status") ? { status: str(i, "status") } : {}),
      ...(str(i, "helpType") ? { helpType: str(i, "helpType") } : {}),
      ...(i.dryRun === true ? { dryRun: true } : {}),
    }),
    summarize: (i) =>
      i.dryRun === true
        ? `Count tickets matching the filter${str(i, "helpType") ? ` (type "${str(i, "helpType")}")` : ""}${str(i, "status") ? ` in ${str(i, "status")}` : ""}`
        : `Set every${str(i, "helpType") ? ` "${str(i, "helpType")}"` : ""} ticket${str(i, "status") ? ` in ${str(i, "status")}` : ""} to ${str(i, "toStatus")}`,
  },
  {
    name: "bulk_set_help_status",
    description:
      "Move MANY support tickets to the same status at once (open, in_progress, resolved, reopened). " +
      "First list the tickets (a read) to get their ids, then call this with those ids — at most " +
      `${BULK_IDS_LIMIT} per call (the door refuses more). A bulk change is confirmed with a count ` +
      "before it runs. For a filter-shaped job prefer set_help_status_by_filter (one call, true count).",
    schema: obj(
      { ids: { type: "array", items: S, maxItems: BULK_IDS_LIMIT }, status: S },
      ["ids", "status"]
    ),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/help/bulk-status",
    write: true,
    confirm: true, // a bulk change is high-blast — always confirm
    buildBody: (i) => ({ ids: i.ids, status: i.status }),
    summarize: (i) => `Set ${Array.isArray(i.ids) ? i.ids.length : 0} tickets to ${i.status}`,
  },
  {
    name: "bulk_set_learning_active",
    description:
      "Switch MANY learning articles off (deactivate) or back on (reactivate) at once — never deleted. " +
      "First list the articles (a read) to get their ids, then call this with those ids — at most " +
      `${BULK_IDS_LIMIT} per call (the door refuses more). A bulk change is confirmed with a count ` +
      "before it runs.",
    schema: obj(
      { ids: { type: "array", items: S, maxItems: BULK_IDS_LIMIT }, active: { type: "boolean" } },
      ["ids", "active"]
    ),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/learning/bulk-active",
    write: true,
    confirm: true, // a bulk change is high-blast — always confirm
    buildBody: (i) => ({ ids: i.ids, active: i.active }),
    summarize: (i) =>
      `${i.active ? "Activate" : "Deactivate"} ${Array.isArray(i.ids) ? i.ids.length : 0} articles`,
  },
  {
    // Runs INSIDE data-ops (binding SELF): the import batch engine, not a worker fetch.
    // Only reachable for a batch the SAME user created (creator-scoped load) — the model
    // can't run someone else's import, and every target module is re-gated for `create`.
    name: "run_import_batch",
    description:
      "Run a file import the user attached in THIS chat, after the app planned it. Call it ONLY with " +
      "the batchId given in an ATTACHED-IMPORT-PLAN block, plus a short human summary of what will be " +
      "imported. The app shows its own confirm panel first. Never invent a batchId.",
    schema: obj({ batchId: S, summary: S }, ["batchId"]),
    binding: "SELF",
    method: "POST",
    path: "(import batch engine)",
    write: true,
    confirm: true, // writing a whole file of rows is high-blast — always confirm
    summarize: (i) => (typeof i.summary === "string" && i.summary ? i.summary : "Run the attached file import"),
    run: (env, request, input) => runImportBatchTool(env, request, input),
  },

  /* ------------------------------- GOOGLE ---------------------------------- */
  // Thirteen tools on the four services somebody has connected THEIR OWN account
  // to. Act-as-user does all the work here, as it does everywhere else: the
  // executor forwards the caller's cookie, the door resolves the connection from
  // `guard.userId`, and there is no parameter anywhere in this module that could
  // name a different person's Drive. So "the assistant sees only what that person
  // can see" needs no rule of its own — it is what act-as-user already means,
  // reaching one system further out.
  //
  // THE CONFIRM RULE, and the one asymmetry in it. The owner decided: the
  // assistant may create calendar events WITHOUT asking; mail ALWAYS asks. So
  // `google_create_event` and `google_sprint_to_calendar` run straight away, and
  // `google_send_mail` pauses for a yes/no panel — because an event is a
  // suggestion in a diary its owner can delete in one click, and a sent mail is
  // in somebody else's inbox forever. `google_chat_post` confirms for the same
  // reason as mail: a colleague reads it the moment it lands.
  //
  // WHAT THE ASSISTANT DELIBERATELY CANNOT DO: connect an account, disconnect
  // one, or change which folders and spaces are shared. Those are decisions about
  // WHO CAN READ WHAT, made by a person at a consent screen or a form that asks
  // the question in words. The doors exist and refuse nobody with the right; they
  // simply have no tool. See TOOLLESS_DOORS in workers/mcp/test/filter-parity.test.ts.
  {
    name: "list_google_connections",
    description:
      "Which Google services the signed-in person has connected (Drive, Gmail, Calendar, Google Chat), " +
      "which Google account each is, and which folders and spaces they have shared. Call this FIRST if " +
      "you are unsure whether you can read something — an unconnected service is not an error, it is a " +
      "thing to tell them about.",
    schema: obj({}),
    binding: "CONTENT",
    method: "GET",
    path: "/api/content/google/connections",
    write: false,
    confirm: false,
    summarize: () => "Check which Google services are connected",
  },
  {
    name: "google_drive_files",
    description:
      "List files in the Drive FOLDERS this person has shared with kwapso — never their whole Drive. " +
      "`q` narrows by name INSIDE those folders. A person who has shared no folders gets an empty list, " +
      "which means 'nothing shared', not 'nothing there'.",
    schema: obj({ q: S }),
    binding: "CONTENT",
    method: "GET",
    path: "/api/content/google/drive/files",
    write: false,
    confirm: false,
    buildQuery: (i) => (str(i, "q") ? `?q=${encodeURIComponent(str(i, "q"))}` : ""),
    summarize: (i) => (str(i, "q") ? `Look for "${str(i, "q")}" in the shared Drive folders` : "List shared Drive files"),
  },
  {
    name: "google_drive_file",
    description:
      "Read one Drive file's text by its file id (get ids from google_drive_files). Google Docs, Sheets " +
      "and Slides are read as plain text; a file with no text comes back empty.",
    schema: obj({ fileId: S }, ["fileId"]),
    binding: "CONTENT",
    method: "GET",
    path: "/api/content/google/drive/file",
    write: false,
    confirm: false,
    buildQuery: (i) => `?fileId=${encodeURIComponent(str(i, "fileId"))}`,
    summarize: () => "Read a shared Drive file",
  },
  {
    name: "google_drive_upload",
    description:
      "Write a text file INTO one of the folders this person has shared. `sourceId` is the shared " +
      "folder's id from list_google_connections — not a Google folder id, because you can only ever " +
      "write into a folder they chose.",
    schema: obj({ sourceId: S, name: S, text: S, mimeType: S }, ["sourceId", "name", "text"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/google/drive/upload",
    write: true,
    // Constructive, and inside a folder the person chose themselves — the same
    // reading that lets every other create in the catalog run straight away.
    confirm: false,
    buildBody: (i) => ({
      sourceId: str(i, "sourceId"),
      name: str(i, "name"),
      text: str(i, "text"),
      ...(str(i, "mimeType") ? { mimeType: str(i, "mimeType") } : {}),
    }),
    summarize: (i) => `Write "${str(i, "name")}" into a shared Drive folder`,
  },
  {
    name: "google_mail_search",
    description:
      "Search this person's mail — ONLY messages to or from someone on one of the team's accounts. " +
      "That fence is built by the door from the accounts' own email addresses; `q` narrows INSIDE it " +
      "and cannot widen it. If no contact has an email address yet, the answer says so.",
    schema: obj({ q: S }),
    binding: "CONTENT",
    method: "GET",
    path: "/api/content/google/gmail/messages",
    write: false,
    confirm: false,
    buildQuery: (i) => (str(i, "q") ? `?q=${encodeURIComponent(str(i, "q"))}` : ""),
    summarize: (i) => (str(i, "q") ? `Search mail for "${str(i, "q")}"` : "List recent mail with contacts"),
  },
  {
    name: "google_mail_message",
    description: "Read one message in full by its id (get ids from google_mail_search).",
    schema: obj({ messageId: S }, ["messageId"]),
    binding: "CONTENT",
    method: "GET",
    path: "/api/content/google/gmail/message",
    write: false,
    confirm: false,
    buildQuery: (i) => `?messageId=${encodeURIComponent(str(i, "messageId"))}`,
    summarize: () => "Read one message",
  },
  {
    name: "google_draft_reply",
    description:
      "Write a reply and LEAVE IT IN THEIR GMAIL DRAFTS. Nothing is sent. This is the normal way to " +
      "answer mail: the person opens the draft, changes what they like and sends it. Pass `threadId` " +
      "(from google_mail_search) to keep it in the same conversation. The answer carries a link " +
      "straight to the draft — always give them that link.",
    schema: obj({ to: S, subject: S, body: S, threadId: S }, ["to", "subject", "body"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/google/gmail/draft",
    write: true,
    // A draft is a sentence somebody can still change their mind about, so it
    // does not spend a confirm panel. The panel belongs on the door that sends.
    confirm: false,
    buildBody: (i) => ({
      to: str(i, "to"),
      subject: str(i, "subject"),
      body: str(i, "body"),
      ...(str(i, "threadId") ? { threadId: str(i, "threadId") } : {}),
    }),
    summarize: (i) => `Draft a reply to ${str(i, "to")}`,
  },
  {
    name: "google_send_mail",
    description:
      "ACTUALLY SEND mail as this person. Needs their role's own send switch — a role without it gets a " +
      "refusal, and that is the intended answer, not a problem to work around. Prefer google_draft_reply " +
      "unless the person has clearly asked for it to go now. Pass `draftId` to send a draft you already " +
      "wrote, or the message fields to send a new one.",
    schema: obj({ draftId: S, to: S, subject: S, body: S, threadId: S }),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/google/gmail/send",
    write: true,
    // MAIL ALWAYS ASKS — the owner's rule, and the sharpest confirm in the
    // catalog: a sent message is in somebody else's inbox and cannot be recalled.
    confirm: true,
    buildBody: (i) => ({
      ...(str(i, "draftId") ? { draftId: str(i, "draftId") } : {}),
      ...(str(i, "to") ? { to: str(i, "to") } : {}),
      ...(str(i, "subject") ? { subject: str(i, "subject") } : {}),
      ...(str(i, "body") ? { body: str(i, "body") } : {}),
      ...(str(i, "threadId") ? { threadId: str(i, "threadId") } : {}),
    }),
    summarize: (i) => (str(i, "to") ? `Send mail to ${str(i, "to")}` : "Send the drafted reply"),
  },
  {
    name: "google_calendar_events",
    description:
      "Read this person's own calendar between two moments. `from` and `to` are RFC-3339 timestamps " +
      "(e.g. 2026-08-12T00:00:00Z); leave them out for what is coming up next.",
    schema: obj({ from: S, to: S }),
    binding: "CONTENT",
    method: "GET",
    path: "/api/content/google/calendar/events",
    write: false,
    confirm: false,
    buildQuery: (i) =>
      str(i, "from") || str(i, "to")
        ? `?from=${encodeURIComponent(str(i, "from"))}&to=${encodeURIComponent(str(i, "to"))}`
        : "",
    summarize: () => "Read the calendar",
  },
  {
    name: "google_create_event",
    description:
      "Put an event in this person's own calendar. `start` and `end` are RFC-3339 timestamps, or plain " +
      "dates with allDay:true. Needs their role's own events switch.",
    schema: obj({ summary: S, description: S, start: S, end: S, allDay: B }, ["summary", "start", "end"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/google/calendar/events",
    write: true,
    // NO CONFIRM, on purpose and by the owner's decision: an event lands in a
    // diary its owner can delete in one click, so asking every time would make
    // the assistant slower at the one thing it was asked to do without making
    // anything safer.
    confirm: false,
    buildBody: (i) => ({
      summary: str(i, "summary"),
      ...(str(i, "description") ? { description: str(i, "description") } : {}),
      start: str(i, "start"),
      end: str(i, "end"),
      ...(i.allDay === true ? { allDay: true } : {}),
    }),
    summarize: (i) => `Put "${str(i, "summary")}" in the calendar`,
  },
  {
    name: "google_sprint_to_calendar",
    description:
      "Put a sprint's dates in this person's calendar as an all-day block. Get the sprint id from " +
      "list_sprints. Needs their role's events switch, and the right to read work.",
    schema: obj({ sprintId: S }, ["sprintId"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/google/calendar/sprint",
    write: true,
    confirm: false, // same reading as google_create_event — it IS one.
    buildBody: (i) => ({ sprintId: str(i, "sprintId") }),
    summarize: () => "Put a sprint's dates in the calendar",
  },
  {
    name: "google_chat_messages",
    description:
      "Read recent messages in ONE Google Chat space this person has shared. `sourceId` is the shared " +
      "space's id from list_google_connections — a space they have not shared cannot be named here.",
    schema: obj({ sourceId: S }, ["sourceId"]),
    binding: "CONTENT",
    method: "GET",
    path: "/api/content/google/chat/messages",
    write: false,
    confirm: false,
    buildQuery: (i) => `?sourceId=${encodeURIComponent(str(i, "sourceId"))}`,
    summarize: () => "Read a shared Chat space",
  },
  {
    name: "google_chat_post",
    description:
      "Post a message in one of the shared Chat spaces, as this person. `sourceId` is the shared space's " +
      "id from list_google_connections.",
    schema: obj({ sourceId: S, text: S }, ["sourceId", "text"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/google/chat/messages",
    write: true,
    // Confirmed for the same reason mail is: colleagues read it the moment it
    // lands, and there is no version of "undo" that unreads it.
    confirm: true,
    buildBody: (i) => ({ sourceId: str(i, "sourceId"), text: str(i, "text") }),
    summarize: () => "Post in a shared Chat space",
  },
]

/** The agent's full catalog: every shared endpoint (projected) + the agent-only tools. */
export const TOOL_CATALOG: AgentTool[] = [...SHARED_TOOLS.map(toAgentTool), ...AGENT_ONLY]

/** binding:"SELF" — run the attached-in-chat import batch through the SAME engine the
 * Import screen uses: re-open teamContext from the request (act-as-user), gate `create`
 * on every target in the plan up front, execute in dependency order, then publish one
 * coarse ping per changed module. Mirrors routes/import postBatchConfirm. */
async function runImportBatchTool(
  env: Env,
  request: Request,
  input: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const { actor, cfg, guard } = await teamContext(request, env)
    const batchId = str(input, "batchId")
    if (!batchId) return { ok: false, status: 400, data: null, error: "A batchId is required." }
    const view = await getBatchView(cfg, guard, batchId)
    if (!view.plan) return { ok: false, status: 409, data: null, error: "That import hasn't been planned." }
    for (const m of planModules(view.plan)) await requireRight(cfg, guard, m, "create")
    const { report, modules } = await confirmBatch(env, request, cfg, guard, actor, batchId)
    for (const m of modules) await publishChange(env, guard.teamId, m)
    return {
      ok: true,
      status: 200,
      data: {
        created: report.created,
        skipped: report.skipped,
        failed: report.failed,
        perTarget: report.perTarget,
        rejections: report.rejections.slice(0, 10),
      },
    }
  } catch (e) {
    if (e instanceof GuardError) return { ok: false, status: e.status, data: null, error: e.message }
    throw e
  }
}

export function getTool(name: string): AgentTool | undefined {
  return TOOL_CATALOG.find((t) => t.name === name)
}

/** The specs handed to the model (name + description + input schema). */
export function toolSpecs(): ToolSpec[] {
  return TOOL_CATALOG.map((t) => ({ name: t.name, description: t.description, schema: t.schema }))
}

/** Confirm rule (the ONE place it's decided): a write pauses for the yes/no panel only
 * when it's DESTRUCTIVE — removes/withdraws access (remove a member, revoke an invite)
 * or DEACTIVATES an existing record (a role, an article, a dropdown value) — or
 * BULK/high-blast (a bulk change, a whole imported file). Everything constructive runs
 * straight away. `input` lets the (de)activate toggles confirm only when turning OFF. */
export function requiresConfirm(tool: AgentTool, input: Record<string, unknown> = {}): boolean {
  if (!tool.write) return false
  // A PRIVILEGE write always confirms, DERIVED from its own gate rather than
  // read off its flag — so a tool added tomorrow that writes to member_roles or
  // team_members is safe the moment it exists, even if whoever added it forgot.
  // (The catalog must still DECLARE confirm:true; agent.test.ts asserts that, so
  // the catalog reads honestly instead of relying on this line.)
  if (isPrivilegeWrite(tool)) return true
  return typeof tool.confirm === "function" ? tool.confirm(input) : tool.confirm === true
}

export type ToolResult = { ok: boolean; status: number; data: unknown; error?: string }

/** Run a tool AS the caller: forward their cookie to the gated endpoint so the real door
 * enforces permissions + validation. Identity-blocked tools are always refused. */
export async function executeTool(
  env: Env,
  request: Request,
  tool: AgentTool,
  input: Record<string, unknown>
): Promise<ToolResult> {
  if (tool.identityBlocked)
    return { ok: false, status: 403, data: null, error: "That action can only be done by you, in person." }
  // A wrong-typed argument is refused HERE, before any builder turns it into a
  // string — and returned as a failed step rather than thrown, so the model reads
  // "id must be a string" and can correct itself inside the same turn.
  try {
    checkArgTypes(tool.schema, input)
  } catch (e) {
    if (e instanceof GuardError) return { ok: false, status: e.status, data: null, error: e.message }
    throw e
  }
  if (tool.run) return tool.run(env, request, input)

  const fetcher = tool.binding === "CONTENT" ? env.CONTENT : env.TENANCY
  const res = await forwardToDoor(fetcher, {
    path: tool.path,
    method: tool.method,
    cookie: request.headers.get("Cookie") ?? "",
    query: tool.method === "GET" && tool.buildQuery ? tool.buildQuery(input) : "",
    body: tool.buildBody ? tool.buildBody(input) : {},
  })
  const text = await res.text()
  let data: unknown = text
  try {
    data = JSON.parse(text)
  } catch {
    /* leave as text */
  }
  const error = res.ok
    ? undefined
    : (data as { message?: string })?.message ?? `Action failed (HTTP ${res.status}).`
  return { ok: res.ok, status: res.status, data, error }
}
