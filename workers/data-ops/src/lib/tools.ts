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
import { brand } from "@shared/brand"
import { forwardToDoor } from "@shared/workers/http"
import { requestId } from "@shared/workers/trace"
import { BULK_IDS_LIMIT } from "@shared/workers/limits"
import { publishChange } from "@shared/workers/realtime"
import { B, checkArgTypes, obj, S, str } from "@shared/workers/tool-args"
import { RECORD_TOGGLES, recordToggle } from "@shared/workers/record-toggles"
import { roleLabel, SHARED_TOOLS, type SharedTool } from "@shared/workers/tool-catalog"
import { alwaysConfirms, isPrivilegeWrite, TOOL_GATES } from "@shared/workers/tool-gates"
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
  /** The other doors this ONE tool forwards to (`set_record_active`, over the
   * twenty-one record toggles). `path` stays the canonical one, and R19's
   * coverage census credits these to this tool. */
  routes?: string[]
  /** Which of them THIS call goes to. A tool without one goes to `path`. */
  route?: (input: Record<string, unknown>) => { binding: "TENANCY" | "CONTENT"; path: string }
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
  /* ------------------------ SWITCHING A RECORD OFF, OR BACK ON ----------------
   *
   * ONE TOOL OVER TWENTY-ONE DOORS, and the agent's catalogue is where it
   * belongs: this surface re-sends every tool definition on every model step, so
   * twenty-one names for one operation was about 2,500 tokens per step of pure
   * repetition. `shared/workers/record-toggles.ts` is the map and carries the
   * reasoning — including why `set_deliverable_visibility` is NOT in it, why the
   * MCP surface still publishes the twenty-one one at a time, and how each
   * door's own confirm rule survived the collapse.
   */
  {
    name: "set_record_active",
    description:
      "Switch a record off, or back on. `record` says WHICH KIND: account, contact_link, portal_access, role, dropdown_value, app, app_module, process, wave, client_department, client_role, client_tool, account_rate, internal_rate, meeting, knowledge_source, deliverable, brand_asset, meeting_purpose, staff_profile or staff_certificate. `id` is that record's id — except a role, which takes `roleId` — and a deliverable also needs `appId`, the app whose shelf it sits on. `active` false switches it off (archive, deactivate, revoke, cancel, unlink, depending on the kind) and true brings it back. NOTHING IS EVER DELETED: the row and everything hanging off it survive, so last year's figures stay true, and calling it twice changes nothing the second time. Each kind needs its own module's right, and switching one off asks the person first.",
    binding: "TENANCY",
    path: "/api/tenancy/accounts/active",
    method: "POST",
    // The rest of the family. `path` above is the canonical one; `route` picks
    // the real door per call, and record-toggles.test.ts PROVES every entry is
    // reachable by running it rather than trusting this list.
    routes: Object.values(RECORD_TOGGLES).map((e) => e.path),
    route: (i) => {
      const entry = recordToggle(str(i, "record"))
      // An unknown kind falls back to the canonical door, which then refuses the
      // call on its own terms — the executor's arg check has already rejected a
      // non-string, and the door is still the authority.
      return entry
        ? { binding: entry.binding, path: entry.path }
        : { binding: "TENANCY" as const, path: "/api/tenancy/accounts/active" }
    },
    schema: obj({ record: S, id: S, roleId: S, active: B, appId: S }, ["record", "active"]),
    buildBody: (i) => {
      const entry = recordToggle(str(i, "record"))
      // The door reads ONE id field and this sends that one. `roleId` is exposed
      // beside `id` because the roles door reads it by that name (R22), and a
      // caller who sent the id under the other spelling is not punished for it.
      const id = str(i, entry?.idField ?? "id") || str(i, "id") || str(i, "roleId")
      return {
        [entry?.idField ?? "id"]: id,
        active: i.active === true,
        ...(entry?.needsAppId ? { appId: str(i, "appId") } : {}),
      }
    },
    write: true,
    confirm: (i) => {
      const entry = recordToggle(str(i, "record"))
      // An unrecognised kind confirms: the safe direction for a question nobody
      // has an answer to.
      if (!entry) return true
      if (alwaysConfirms(entry)) return true
      return entry.confirm === "off" && i.active !== true
    },
    summarize: (i, names) => {
      const entry = recordToggle(str(i, "record"))
      if (!entry) return `Switch a record ${i.active === true ? "on" : "off"}`
      const id = str(i, entry.idField) || str(i, "id") || str(i, "roleId")
      const verb = i.active === true ? entry.on : entry.off
      // A role reads better by its title than by a ULID, and `names` is where
      // the resolved titles arrive.
      const what = entry.idField === "roleId" ? roleLabel(i, names) : `${entry.noun} ${id}`
      return `${verb} ${what}`
    },
  },
  {
    name: "get_role_permissions",
    description:
      "Read a role's access rights (its permission matrix, by role id): for each module. Read, create, edit, delete.",
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
      "The SET-shaped bulk: move EVERY support ticket matching a facet filter (status and/or type, the " +
      "same facets the Tickets screen sends; free text is NOT accepted for a write) to one status, in one " +
      "call. Call it FIRST with dryRun:true to learn the TRUE match count, then again for real, the " +
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
      "First list the tickets (a read) to get their ids, then call this with those ids, at most " +
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
  // Twenty-six tools on the four services somebody has connected THEIR OWN
  // account to — the thirteen below, and the thirteen that finish the sentence
  // further down (rewriting a file, filing mail, replying in a thread, labelling,
  // the four edits on an event, the transcript join, the space list, and the two
  // that take something back).
  //
  // Act-as-user does all the work here, as it does everywhere else: the
  // executor forwards the caller's cookie, the door resolves the connection from
  // `guard.userId`, and there is no parameter anywhere in this module that could
  // name a different person's Drive. So "the assistant sees only what that person
  // can see" needs no rule of its own — it is what act-as-user already means,
  // reaching one system further out.
  //
  // THE CONFIRM RULE. Anything that lands in somebody ELSE's inbox pauses for a
  // yes/no panel — `google_send_mail`, `google_reply_mail`, `google_chat_post` —
  // because a sent message cannot be recalled. The rule used to have a second
  // half about calendar entries running straight away (a calendar event is one click
  // from gone); there are no calendar writes left for it to govern.
  //
  // WHAT THE ASSISTANT DELIBERATELY CANNOT DO: connect an account, disconnect
  // one, change which folders and spaces are shared, or touch anybody's CALENDAR.
  // The first three are decisions about WHO CAN READ WHAT, made by a person at a
  // consent screen or a form that asks the question in words — those doors exist
  // and refuse nobody with the right; they simply have no tool (see TOOLLESS_DOORS
  // in workers/mcp/test/filter-parity.test.ts). The fourth is different in kind:
  // there is no door left to have a tool for. The calendar is read-only in this
  // product, on every surface (18 August 2026).
  {
    name: "list_google_connections",
    description:
      "Which Google services the signed-in person has connected (Drive, Gmail, Calendar, Google Chat), " +
      "which Google account each is, and which folders and spaces they have shared. Call this FIRST if " +
      "you are unsure whether you can read something, an unconnected service is not an error, it is a " +
      "thing to tell them about. READ `connected`: it is the list of services that are live right now. " +
      "`connections` is the whole HISTORY of connecting and disconnecting, so most rows in it are " +
      "switched off even when everything is working — never conclude from that list that nothing is " +
      "connected. `sources` are the folders and spaces shared; a service can be connected with none " +
      "shared, which means 'nothing handed over yet', not 'not connected'.",
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
      "List files in the Drive FOLDERS this person has shared with " + brand.name + ", never their whole Drive. " +
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
      "folder's id from list_google_connections, not a Google folder id, because you can only ever " +
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
      "Search this person's mail. ONLY messages to or from someone on one of the team's accounts. " +
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
      "straight to the draft, always give them that link.",
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
      "ACTUALLY SEND mail as this person. Needs their role's own send switch, a role without it gets a " +
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
  // THE ASSISTANT CANNOT TOUCH A CALENDAR, only read one. `google_create_event`
  // and `google_sprint_to_calendar` stood here, and four more further down
  // (change an entry, its guests, its location, call it off). All six went with
  // their doors on 18 August 2026, when the owner asked for the calendar to be
  // one-way. If somebody asks the assistant to put something in their calendar, the
  // honest answer is that kwapso reads calendars and does not write them.
  {
    name: "google_chat_messages",
    description:
      "Read recent messages in ONE Google Chat space this person has shared. `sourceId` is the shared " +
      "space's id from list_google_connections, a space they have not shared cannot be named here.",
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

  /* ------------------- GOOGLE: the acts that were missing ------------------- */
  // Nine more, and they divide into groups worth reading as groups. There were
  // thirteen; the four calendar writes went with the rest of the write half.
  //
  // TAKING SOMETHING BACK (`google_drive_trash`, `google_chat_delete`). Neither
  // was on the owner's list and both are here because the list makes them
  // necessary: an assistant that can make a folder, rewrite a file and post in a
  // space, with no way to undo any of it, turns every mistake into a permanent
  // one. Both confirm, both are the softest form of the act available — Drive's
  // bin rather than a delete, and a message this app itself sent.
  //
  // THE CONFIRM RULE, applied rather than restated. The owner's line is that mail
  // always asks, because a sent message is in somebody else's inbox forever. So
  // `google_reply_mail` asks (it sends). `google_label_mail` does not: a label is
  // filing, nobody else can see it, and taking it off again costs one call. The
  // rule's other half used to be "calendar entries do not ask, because a calendar
  // entry is one click from gone" — there are no calendar writes left for it to
  // govern.
  //
  // AND ONE JOIN NOBODY COULD MAKE BEFORE: `google_meeting_transcript` starts at
  // the calendar event, which is where a person starts ("what did we agree in
  // Tuesday's call?"), and finds what Meet filed in the folders they shared.
  {
    name: "google_drive_update",
    description:
      "Rewrite a Drive file " + brand.name + " can write to, `text` replaces the WHOLE contents, it is not " +
      "appended. `fileId` comes from google_drive_files or from google_drive_upload. Pass `name` to " +
      "rename it in the same breath. Google refuses a file this app did not create, and that refusal " +
      "is the fence: you cannot rewrite something the person only ever let " + brand.name + " read.",
    schema: obj({ fileId: S, text: S, name: S, mimeType: S }, ["fileId", "text"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/google/drive/update",
    write: true,
    // CONFIRMS. Its own description says `text` replaces the WHOLE contents —
    // that is the destructive shape every other Google write that destroys
    // (send, reply, trash, chat delete) puts behind the panel, and this was the
    // one whose call was made by a comment instead. Drive's file history is a
    // recovery path, not a reason to skip the question.
    confirm: true,
    buildBody: (i) => ({
      fileId: str(i, "fileId"),
      text: str(i, "text"),
      ...(str(i, "name") ? { name: str(i, "name") } : {}),
      ...(str(i, "mimeType") ? { mimeType: str(i, "mimeType") } : {}),
    }),
    summarize: (i) => `Rewrite a shared Drive file${str(i, "name") ? ` as "${str(i, "name")}"` : ""}`,
  },
  {
    name: "google_drive_folder",
    description:
      "Make a new folder INSIDE one of the folders this person has shared. `sourceId` is the shared " +
      "folder's id from list_google_connections, a folder can only be made somewhere they already " +
      "chose. The answer carries the new folder's id, which google_drive_upload cannot use: uploads " +
      "name a SHARED folder, not any folder.",
    schema: obj({ sourceId: S, name: S }, ["sourceId", "name"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/google/drive/folder",
    write: true,
    confirm: false,
    buildBody: (i) => ({ sourceId: str(i, "sourceId"), name: str(i, "name") }),
    summarize: (i) => `Make the "${str(i, "name")}" folder in a shared Drive folder`,
  },
  {
    name: "google_mail_to_drive",
    description:
      "File a message, or a whole conversation, into a shared Drive folder as a readable text " +
      "document. Pass `threadId` for the whole exchange (from google_mail_search) or `messageId` for " +
      "one message; `sourceId` is the shared folder it goes into. Use it when somebody says 'put that " +
      "exchange in the client folder'. The document is text, not a mail archive, so it can be read, " +
      "searched and indexed afterwards.",
    schema: obj({ sourceId: S, threadId: S, messageId: S, name: S }, ["sourceId"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/google/drive/save-mail",
    write: true,
    confirm: false,
    buildBody: (i) => ({
      sourceId: str(i, "sourceId"),
      ...(str(i, "threadId") ? { threadId: str(i, "threadId") } : {}),
      ...(str(i, "messageId") ? { messageId: str(i, "messageId") } : {}),
      ...(str(i, "name") ? { name: str(i, "name") } : {}),
    }),
    summarize: (i) => (str(i, "threadId") ? "File a conversation in Drive" : "File a message in Drive"),
  },
  {
    name: "google_drive_trash",
    description:
      "Put a Drive file in the bin, never a permanent delete. It keeps its name and its sharing for " +
      "thirty days and the person can restore it in one click. Use it to undo a file " + brand.name + " wrote. " +
      "`fileId` comes from google_drive_upload or google_drive_files; the answer says whether anything " +
      "moved (`changed` is false when the file was already in the bin).",
    schema: obj({ fileId: S }, ["fileId"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/google/drive/trash",
    write: true,
    // It takes something away. Every destructive act in this catalogue asks.
    confirm: true,
    buildBody: (i) => ({ fileId: str(i, "fileId") }),
    summarize: () => "Put a Drive file in the bin",
  },
  {
    name: "google_reply_mail",
    description:
      "SEND a reply inside an existing conversation. It takes `messageId` (from google_mail_search) " +
      "and what to say, who it goes to, what it is called and which thread it belongs to are all read " +
      "off the message being answered, so a reply can never land in the wrong person's inbox or start " +
      "a new conversation by accident. Needs their role's own send switch. Prefer google_draft_reply " +
      "unless the person has clearly asked for it to go now.",
    schema: obj({ messageId: S, body: S }, ["messageId", "body"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/google/gmail/reply",
    write: true,
    // It sends. MAIL ALWAYS ASKS — the same rule as google_send_mail, for the
    // same reason: it is in somebody else's inbox and cannot be recalled.
    confirm: true,
    buildBody: (i) => ({ messageId: str(i, "messageId"), body: str(i, "body") }),
    summarize: () => "Reply in the conversation",
  },
  {
    name: "google_label_mail",
    description:
      "File a message under a Gmail label, or take the label off. `label` is the name a person says " +
      "('Contracts'), matched without regard to capitals; applying one creates it if it isn't there, " +
      "removing one never does. `on` says which way. The answer's `changed` is false when the message " +
      "already was (or already wasn't) filed there, so a second call is safe.",
    schema: obj({ messageId: S, label: S, on: B }, ["messageId", "label", "on"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/google/gmail/label",
    write: true,
    // Filing, not sending: nobody else can see a label and taking it off again
    // is one call. The same reading that lets a Drive upload run straight away.
    confirm: false,
    buildBody: (i) => ({ messageId: str(i, "messageId"), label: str(i, "label"), on: i.on === true }),
    summarize: (i) =>
      i.on === true ? `File a message under "${str(i, "label")}"` : `Take "${str(i, "label")}" off a message`,
  },
  {
    name: "google_mail_trash",
    description:
      "Put mail in the Gmail bin, never a permanent delete: it sits in Trash for thirty days and the " +
      "person restores it in one click. `kind` says what to bin, a draft, a message, or a thread " +
      "(the whole exchange), and `id` is that thing's id, a draft id from google_draft_reply, a " +
      "message id or a thread id from google_mail_search. Use it to take back a draft " + brand.name + " wrote. " +
      "The answer's `changed` is false when it was already in the bin, so a second call is safe. " +
      "" + brand.name + " cannot delete mail permanently and never will, that needs a scope this app does not ask " +
      "for.",
    schema: obj({ kind: S, id: S }, ["kind", "id"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/google/gmail/trash",
    write: true,
    // It takes something away. Every destructive act in this catalogue asks —
    // the same rule google_drive_trash and google_chat_delete follow, and the
    // reason is the same one in a smaller room: the person, not the assistant,
    // decides that a letter should stop existing where they can see it.
    confirm: true,
    buildBody: (i) => ({ kind: str(i, "kind"), id: str(i, "id") }),
    summarize: (i) =>
      str(i, "kind") === "draft"
        ? "Put a draft in the Gmail bin"
        : str(i, "kind") === "thread"
          ? "Put a conversation in the Gmail bin"
          : "Put a message in the Gmail bin",
  },
  // FOUR CALENDAR WRITES STOOD HERE — change what an entry says and when, invite
  // and uninvite guests, set where it is, call it off. All four are gone with
  // their doors (18 August 2026): the calendar is read-only, so the assistant
  // can tell somebody what is in their calendar and never change it.
  {
    name: "google_meeting_transcript",
    description:
      "Read what was SAID in a meeting, starting from the meeting itself. Give it `eventId` from " +
      "google_calendar_events and it finds the transcript Google Meet filed. Meet writes one as an " +
      "ordinary document named after the meeting, so this is the only way to reach it without already " +
      "knowing which document it is. It looks ONLY in the Drive folders this person has shared: if the " +
      "answer's `transcript` is null the `note` says why, and 'share the Meet Recordings folder' is " +
      "usually the fix.",
    schema: obj({ eventId: S }, ["eventId"]),
    binding: "CONTENT",
    method: "GET",
    path: "/api/content/google/calendar/event/transcript",
    write: false,
    confirm: false,
    buildQuery: (i) => `?eventId=${encodeURIComponent(str(i, "eventId"))}`,
    summarize: () => "Read a meeting's transcript",
  },
  {
    name: "google_chat_spaces",
    description:
      "List every Google Chat space this person can see, and which of them are already shared with " +
      "" + brand.name + ". Each one carries `shared` and, where it is, the `sourceId` google_chat_messages needs. " +
      "Call this when somebody names a space you have no id for, reading the LIST is not reading what " +
      "is in them, and an unshared space still cannot be read.",
    schema: obj({}),
    binding: "CONTENT",
    method: "GET",
    path: "/api/content/google/chat/spaces",
    write: false,
    confirm: false,
    summarize: () => "List the Chat spaces",
  },
  {
    name: "google_chat_delete",
    description:
      "Take back a message " + brand.name + " posted in a shared space. `messageName` is the id google_chat_post " +
      "gave back, and `sourceId` is the space it went into. Google refuses a message this app did not " +
      "send, so this can only ever undo " + brand.name + "'s own posts.",
    schema: obj({ sourceId: S, messageName: S }, ["sourceId", "messageName"]),
    binding: "CONTENT",
    method: "POST",
    path: "/api/content/google/chat/delete",
    write: true,
    // Destructive, and in a space other people are reading. It asks.
    confirm: true,
    buildBody: (i) => ({ sourceId: str(i, "sourceId"), messageName: str(i, "messageName") }),
    summarize: () => "Take back a message in a shared Chat space",
  },
]

/** LIST TOOLS THE GRAMMAR REPLACED — dropped from THIS surface only.
 *
 * `query_records` asks any module a question, so a tool whose whole job was
 * "give me this collection, narrowed by these three words" is now a second way
 * to say something the grammar says better — and on this surface a second way
 * is not free: every definition is re-sent on every model step of every turn.
 * The MCP surface keeps all of them, unchanged, for the reason it kept the
 * twenty-one toggles: it fetches its catalogue once, and a tool name there is an
 * external contract.
 *
 * THE BAR FOR A LINE HERE is that the grammar is a STRICT SUPERSET of the door's
 * own narrowing — every parameter it parses maps to a declared field, and it
 * offers no derived view (`scope=mine`, `view=overdue`, `when=current`) that a
 * filter cannot express. Seven list tools deliberately stay: `list_help_tickets`
 * (`scope=mine` is a join through who is staffed to an app), `list_work_logs`
 * (the same, and the model has no way to name "me"), `list_stories`,
 * `list_todos`, `list_tasks`, `list_sprints` and `list_meetings` (each carries a
 * derived view or a month), and `list_knowledge_sources`, which returns a
 * SOURCE'S OWN WORDS when given an id and is the one read the prompt sends the
 * model to for reading a document whole.
 *
 * Rot-checked by `workers/data-ops/test/tool-diet.test.ts`: every name here must
 * still be a shared GET tool, and its module must still be one the grammar can
 * be asked about — so a line cannot outlive the capability that replaced it. */
export const REPLACED_BY_QUERY: Record<string, string> = {
  list_accounts: "query_records on `accounts` — its q/type/parentId narrowing is name+code+email (a multi-field filter), accountType and parentAccountId",
  list_apps: "query_records on `apps` — accountId, and q is a filter on the name",
  list_app_modules: "query_records on `app_modules` — id, appId and deactivatedAt",
  list_processes: "query_records on `processes` — appId, deactivatedAt, and q is name+description",
  list_waves: "query_records on `waves` — accountId, and the ordering is the door's",
  list_deliverables: "query_records on `deliverables` — appId and id, plus visibleToClientAt, which this tool never exposed",
  list_dropdown_values: "query_records on `dropdown_values` — by id, by type, or the whole vocabulary",
  list_account_rates: "query_records on `account_rates` — accountId, and it can now answer across clients rather than one at a time",
  list_roles: "query_records on `roles` — by id or the whole list, with the deactivated ones filterable rather than merely present",
}

/** The agent's full catalog: every shared endpoint (projected, less the list
 * tools the grammar replaced) + the agent-only tools. */
export const TOOL_CATALOG: AgentTool[] = [
  ...SHARED_TOOLS.filter((s) => !(s.name in REPLACED_BY_QUERY)).map(toAgentTool),
  ...AGENT_ONLY,
]

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

/** The specs handed to the model (name + description + input schema).
 *
 * ── WHY THIS TAKES AN ARGUMENT NOW ──────────────────────────────────────────
 *
 * The catalogue is a BILL, not a menu. 191 tool definitions are ~109 KB of the
 * ~130 KB preamble that is re-sent on every model turn, and at the owner's
 * stated volume each tool costs about $5 a month before it is ever called
 * (test/prompt-cache.test.ts derives it). Sending a Viewer the definition of
 * `remove_member` is money spent describing a door that will refuse them.
 *
 * So `held` — the caller's own rights, as `module:right` — drops the tools their
 * role could never call. It changes no permission: every tool still runs through
 * the real gated door as the user, and the door is still the authority. It only
 * stops paying to describe the ones that are certain to be refused.
 *
 * FAIL OPEN, DELIBERATELY, IN BOTH DIRECTIONS:
 *   • no `held` at all (the sheet could not be read) → the whole catalogue, which
 *     is exactly the behaviour before this existed. A permissions read that fails
 *     must never quietly shrink what the assistant can do.
 *   • a tool with no declared gate in TOOL_GATES → kept. An undeclared gate means
 *     "nobody has classified this", not "nobody may call it", and guessing the
 *     second from the first would silently retire a working tool.
 *
 * The cost of that choice is honest: 33 of the 166 shared tools carry no gate, so
 * they are sent to everybody. R36's `offered-rights` is what keeps that number
 * falling, because it fails when a right is asked for and never offered. */
export function toolSpecs(held?: ReadonlySet<string>): ToolSpec[] {
  return TOOL_CATALOG.filter((t) => {
    if (!held) return true
    const gate = TOOL_GATES[t.name]
    return !gate || held.has(gate)
  }).map((t) => ({ name: t.name, description: t.description, schema: t.schema }))
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

  // WHICH DOOR — asked of the tool, because one tool may cover a family of them
  // (`set_record_active` stands on twenty-one). `checkArgTypes` has already run,
  // so a `route` reading a record name off the input is reading a string.
  const dest = tool.route ? tool.route(input) : { binding: tool.binding, path: tool.path }
  const fetcher = dest.binding === "CONTENT" ? env.CONTENT : env.TENANCY
  const res = await forwardToDoor(fetcher, {
    path: dest.path,
    method: tool.method,
    cookie: request.headers.get("Cookie") ?? "",
    traceId: requestId(request),
    query: tool.method === "GET" && tool.buildQuery ? tool.buildQuery(input) : "",
    body: tool.buildBody ? tool.buildBody(input) : {},
    // The agent's act-as-user hop was the ONE cross-worker call with no
    // deadline (mcp's twin has carried one from its first commit). Two minutes
    // is the long-door ceiling the machine surface already uses; an import step
    // that needs longer needs a smaller step, not a longer wait.
    timeoutMs: 120_000,
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
