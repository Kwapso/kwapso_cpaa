// WHO MAY CALL A TOOL, AND WHAT HAS TO BE CONFIRMED FIRST.
//
// Split out of tool-catalog.ts because it answers a different question from the
// catalogue and is read by different people. SHARED_TOOLS says what the app CAN
// do; this file says which permission each write needs and which writes are grave
// enough to stop and ask about. The security suites that care — fence-confirm,
// grant-identity, fence-row-confirm, catalog — want this half and not the other.
//
// Nothing here reads SHARED_TOOLS: every function takes the tool it is judging as
// an argument, which is what lets the two files sit side by side with the
// dependency pointing one way (the catalogue may know about gates; gates never
// need the catalogue).

import { FENCE_IDENTITY_INPUTS, FENCE_INPUTS, FENCED_ROW_OWNERS } from "./account-scope"

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
  create_marketing_post: "marketing:create",
  update_marketing_post: "marketing:edit",
  set_marketing_post_active: "marketing:delete",
  create_brand_asset: "brand_assets:create",
  update_brand_asset: "brand_assets:edit",
  set_brand_asset_active: "brand_assets:delete",
  create_programme: "delivery:create",
  update_programme: "delivery:edit",
  set_programme_active: "delivery:delete",
  create_meeting_purpose: "delivery:create",
  update_meeting_purpose: "delivery:edit",
  set_meeting_purpose_active: "delivery:delete",
  // The profile door is ONE door for "there wasn't one" and "there was", so it
  // is gated once on `edit`: writing down what a colleague is like is the same
  // act either way, and a permission that depends on invisible state is one
  // nobody can reason about. `create` gates the certificate door instead.
  save_staff_profile: "staff_profiles:edit",
  set_staff_profile_active: "staff_profiles:delete",
  create_staff_certificate: "staff_profiles:create",
  update_staff_certificate: "staff_profiles:edit",
  set_staff_certificate_active: "staff_profiles:delete",
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
  // Answering is a status move, so it sits on the same right every other move
  // does — and the door refuses a portal caller, because "resolved" is our word.
  resolve_help_ticket: "help:edit",
  // THE WORK ENGINE. One module for stories and the sprints they sit in, and no
  // client login holds it — so unlike the ticket doors above, the question "what
  // happens when a contact reaches this?" has a shorter answer here: the door
  // refuses them (refusePortalCaller), whatever an owner ticks.
  create_story: "work:create",
  update_story: "work:edit",
  set_story_status: "work:edit",
  rank_story: "work:edit",
  create_sprint: "work:create",
  update_sprint: "work:edit",
  complete_sprint: "work:edit",
  raise_todo: "todos:create",
  complete_todo: "todos:edit",
  cancel_todo: "todos:delete",
  create_task: "work:create",
  set_task_done: "work:edit",
  // MEETINGS gate on their own module. `set_meeting_active` is a `delete`
  // because cancelling IS this module's delete; the row survives it.
  create_meeting: "meetings:create",
  update_meeting: "meetings:edit",
  set_meeting_held: "meetings:edit",
  set_meeting_active: "meetings:delete",
  // The two doors that reach OUTSIDE this app. Each is listed at the gate the
  // door opens with — the FIRST one, which is the one a role has to hold before
  // any of the others are even asked about. Pushing a meeting to a calendar also
  // demands `google:edit` and the events switch at the door itself; reading
  // somebody's Google into the knowledge base also demands `google:read`.
  add_meeting_to_calendar: "meetings:read",
  sync_google_knowledge: "knowledge:create",
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
  // are two audiences (R24).
  create_account_rate: "commercials:create",
  update_account_rate: "commercials:edit",
  set_account_rate_active: "commercials:delete",
  create_internal_rate: "commercials:create",
  update_internal_rate: "commercials:edit",
  set_internal_rate_active: "commercials:delete",
  // GOOGLE. Every write through somebody's own connection is `google:edit` —
  // "change something in the world you connected" — because `create` on this
  // module means CONNECT AN ACCOUNT, which is the switch an owner grants
  // separately and which no tool here holds.
  //
  // The doors that reach OUTSIDE that world demand a second right on top, and
  // this map names only ONE gate per tool — so it names the one an owner would
  // look for. Every one is recorded here so a reader does not have to open the
  // handler to learn that the switches exist:
  //   google_send_mail          — also google_mail:create
  //   google_reply_mail         — also google_mail:create (a reply IS a message)
  //   google_create_event       — also google_events:create
  //   google_sprint_to_calendar — also google_events:create (and work:read, to
  //                               read the sprint it is pushing)
  //   google_update_event       — also google_events:create
  //   google_event_guests       — also google_events:create
  //   google_event_location     — also google_events:create
  //   google_cancel_event       — also google_events:create
  // None of them is a PRIVILEGE write: they change what is in a person's own
  // Drive, mailbox or diary, never who may do what, and never who can see whose.
  // The confirm rule they DO get is the owner's own, written on each tool.
  //
  // TAKING SOMETHING BACK is `google:delete`, which is the same reading this
  // module already applies to withdrawing a shared folder: the row survives (a
  // binned file keeps its history for thirty days), what ends is kwapso's own
  // handiwork. It is a separate right so an owner can grant an assistant that
  // writes without granting one that un-writes.
  google_drive_upload: "google:edit",
  google_drive_update: "google:edit",
  google_drive_folder: "google:edit",
  google_mail_to_drive: "google:edit",
  google_drive_trash: "google:delete",
  google_draft_reply: "google:edit",
  google_send_mail: "google:edit",
  google_reply_mail: "google:edit",
  google_label_mail: "google:edit",
  google_create_event: "google:edit",
  google_sprint_to_calendar: "google:edit",
  google_update_event: "google:edit",
  google_event_guests: "google:edit",
  google_event_location: "google:edit",
  google_cancel_event: "google:edit",
  google_chat_post: "google:edit",
  google_chat_delete: "google:delete",
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
const PRIVILEGE_MODULES = ["member_roles", "team_members", "portal_users"]

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
