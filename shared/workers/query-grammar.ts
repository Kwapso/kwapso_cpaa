// THE QUERY GRAMMAR — what a machine caller may ASK a module, declared once.
//
// WHY THIS EXISTS. The tool catalogue used to answer a question by enumerating
// its combinations: `list_help_tickets` parsed twelve filters, every one of them
// single-valued, none of them a date, and the fifty read tools between them
// differed mostly by which table they named. Measured on 27 Aug 2026, that was
// 192 tool definitions and 31,094 tokens of schema re-sent on EVERY model step,
// and it still could not answer "how many tickets did we resolve in July?" —
// `resolved_at` is on the row and no filter reaches it, so the only route was
// paging 1,820 tickets by hand. One real question cost 369,193 input tokens and
// gave up.
//
// THE OWNER'S RULING (27 Aug 2026): if the permission matrix says a caller may
// read a module, expose HOW TO QUERY it and let the model compose the question.
// Stop enumerating the combinations. So there are two tools instead of fifty —
// `describe_module` says what a module HAS, `query_records` asks it something —
// and this file is the vocabulary they share.
//
// ── NOT RAW SQL, AND THAT IS THE LOAD-BEARING CONSTRAINT ─────────────────────
//
// The model fills in a STRUCTURED request; the engine (workers/tenancy/src/lib/
// query-engine.ts) builds the SQL from it. Nothing a caller sends ever reaches a
// statement as SQL: the table comes from `QUERY_MODULES`, every column comes
// from that module's own declared `fields`, and every VALUE is a bound
// parameter. A model writing free SQL could read `internal_rates` — what our own
// hour costs, which R24 exists to keep off the client's side — and there is no
// undoing a query that has already run.
//
// ── THIS MAP IS AN ALLOW-LIST. NEVER A DENY-LIST ─────────────────────────────
//
// The engine can only ever name a table that appears HERE. There is no list of
// forbidden tables anywhere in the read path, and there must never be one: a
// deny-list is a promise that somebody remembered every case, and the table this
// law is about (`internal_rates`, and `internal_role_rates` beside it) is
// exactly the kind of thing a person adding a module forgets. An allow-list
// fails in the safe direction — a module nobody declared is simply not
// queryable, and the caller is told so by name.
//
// `workers/tenancy/test/query-fence.test.ts` proves it behaviourally, against
// the real schema, as a caller holding EVERY right including `commercials`: the
// internal rate card is seeded, asked for by every handle a caller has, and
// comes back empty every time. Delete the allow-list check and that suite goes
// red — which is the only kind of check worth having.

import { APP_STAGES } from "../app-stages"
import { DELIVERABLE_KINDS } from "../selectable-groups"
import { HELP_STATUSES, STORY_STATUSES } from "../types"

/** The comparisons a filter may make. `contains` is a case-insensitive substring
 * (and, on a reference field, a substring of the referenced record's NAME);
 * `between` takes exactly two values and includes both ends — which is what
 * makes "resolved in July" one clause instead of two. */
export const QUERY_OPS = [
  "eq",
  "ne",
  "in",
  "notIn",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "contains",
  "isNull",
  "notNull",
] as const
export type QueryOp = (typeof QUERY_OPS)[number]

/** The ops that take NO value at all — the two that ask about absence. */
export const VALUELESS_OPS: readonly QueryOp[] = ["isNull", "notNull"]

/** The ops that take a LIST of values rather than one. */
export const LIST_OPS: readonly QueryOp[] = ["in", "notIn", "between"]

export type FieldType = "text" | "number" | "date" | "boolean" | "id" | "enum"

/** One thing a caller may filter, group or order by.
 *
 * `name` is what the model says; `column` is the real column and is ALWAYS a
 * code literal — the two are separate so a column can be renamed without
 * changing a contract a model has learned, and so no request value can ever
 * decide a column name. */
export type QueryField = {
  name: string
  column: string
  type: FieldType
  /** an `enum` field's fixed values, where the product fixes them. */
  values?: readonly string[]
  /** an `enum` field whose values the TEAM edits: the `selectable_data.type`
   * group they live in. `describe_module` reads the live list. */
  vocabulary?: string
  /** an `id` field that points at another module in this map: `contains`/`eq`/
   * `in` then match the referenced record's NAME as well as its id, and a
   * `groupBy` on it comes back labelled. */
  ref?: string
  /** THIS FIELD'S JOB IS TO NAME A RECORD — its id, or its human reference.
   *
   * A filter on one of these that matches nothing is not "no rows met your
   * criteria", it is "no such thing exists", and the two need different
   * sentences: the first is an answer and the second is a correction. So a value
   * that names nothing here comes back in `unmatched`, exactly as an unknown
   * client does. Earned on 29 Aug 2026, when the assistant found ticket
   * BERG2-T0002, was asked to resolve it one turn later, looked it up by the
   * wrong handle, got a bare zero and said the ticket did not exist — one turn
   * after naming it. */
  identity?: boolean
  /** LIST THE NAMES A CALLER CAN ACTUALLY FILTER ON, in `describe_module`.
   *
   * Only the names IN USE on the module being described — the clients who have
   * tickets, not every company in the book — so it stays small and answers the
   * question a caller really has. It exists because of a real confusion: asked
   * about "flu clinic", a substring search returns nothing, because the company
   * is called "FluClinic"; and asked about "HORSt", nothing, because no such
   * client exists. Both are the honest behaviour of a substring match and both
   * look identical to a caller — an empty result that says nothing about which
   * of the two happened. Reading the list first turns a confusing empty answer
   * into an obvious one.
   *
   * Gated: the names come out only if the caller may read the module they
   * belong to. A field marked here whose target the caller cannot read simply
   * comes back without them. */
  choices?: boolean
  /** one short line for `describe_module`, where the column's meaning is not
   * obvious from its name. */
  note?: string
  /** LONG free text — a description, a set of notes, a transcript. Left OUT of
   * the default projection and returned only when a caller names it in `fields`,
   * because fifty of them is a page the model cannot read: the result trimmer
   * drops whole rows from the end, so one bulky column silently costs the
   * caller the rows underneath it. Filtering and grouping are untouched — a
   * `contains` on a bulky field works exactly as it does on any other. */
  bulky?: boolean
}

export type QueryModule = {
  /** the team-database table — the ONLY place a table name comes from. */
  table: string
  /** the permission module `requireRight(…, "read")` asks about. */
  module: string
  /** one sentence for `describe_module`. */
  summary: string
  /** the column holding the human name of a row, for a labelled `groupBy`. */
  labelColumn: string
  /** the field NAME rows come back in when nobody asked for an order. */
  defaultSort: string
  fields: QueryField[]
}

/* --------------------------- the shared field shapes ------------------------- */

const ID: QueryField = { name: "id", column: "id", type: "id", identity: true }
const CREATED: QueryField = { name: "createdAt", column: "created_at", type: "date" }
const UPDATED: QueryField = { name: "updatedAt", column: "updated_at", type: "date" }
/** Deactivate-never-delete: every archivable record carries the same field, so
 * "the live ones" is `{field:"deactivatedAt", op:"isNull"}` everywhere. */
const DEACTIVATED: QueryField = {
  name: "deactivatedAt",
  column: "deactivated_at",
  type: "date",
  note: "set when the record was archived — isNull means it is live",
}
const ACCOUNT: QueryField = {
  name: "accountId",
  column: "account_id",
  type: "id",
  ref: "accounts",
  choices: true,
  note: "the client this belongs to",
}
const APP: QueryField = { name: "appId", column: "app_id", type: "id", ref: "apps" }

const APP_STAGE_NAMES = APP_STAGES.map((s) => s.name)

/* -------------------------------- the modules -------------------------------- */

/**
 * WHAT IS HERE AND WHAT IS NOT.
 *
 * Here: the modules a person asks aggregate questions about — the ticket book,
 * the work engine, the customer spine, the delivery record. Each one names the
 * permission module its own list door gates on, so this door grants exactly
 * nothing new; it is the same rows, asked a better question.
 *
 * NOT here, and deliberately: `internal_rates` and `internal_role_rates` — what
 * our own hour costs (R24). They are absent rather than forbidden, which is the
 * whole design: there is no switch to invert. `account_rates` IS here (what a
 * client is CHARGED, on the `commercials` right) because it is the agency's
 * ordinary commercial record and the door refuses client logins outright.
 */
export const QUERY_MODULES: Record<string, QueryModule> = {
  tickets: {
    table: "help",
    module: "help",
    summary: "The team's tickets — what a client asked for, and where it has got to.",
    labelColumn: "ref",
    defaultSort: "createdAt",
    fields: [
      ID,
      { name: "ref", column: "ref", type: "text", identity: true, note: "the human reference, e.g. TIC-0000042" },
      { name: "title", column: "title_en", type: "text" },
      { name: "description", column: "description", type: "text", bulky: true },
      { name: "status", column: "status", type: "enum", values: HELP_STATUSES },
      { name: "helpType", column: "help_type", type: "enum", vocabulary: "Ticket type" },
      { name: "resolved", column: "resolved", type: "boolean" },
      {
        name: "resolvedAt",
        column: "resolved_at",
        type: "date",
        note: "when somebody sent the answer — the field 'how many did we resolve in July' asks about",
      },
      { name: "resolverId", column: "resolver_id", type: "id" },
      { name: "archivedAt", column: "archived_at", type: "date" },
      { name: "validatedAt", column: "validated_at", type: "date" },
      ACCOUNT,
      APP,
      { name: "moduleId", column: "module_id", type: "id", ref: "app_modules" },
      { name: "raisedByContactId", column: "raised_by_contact_id", type: "id", ref: "accounts" },
      CREATED,
      UPDATED,
    ],
  },
  stories: {
    table: "stories",
    module: "work",
    summary: "The backlog — one piece of work, inside the sprint it was sold in.",
    labelColumn: "title",
    defaultSort: "createdAt",
    fields: [
      ID,
      { name: "ref", column: "ref", type: "text", identity: true },
      { name: "title", column: "title", type: "text" },
      { name: "detail", column: "detail", type: "text", bulky: true },
      { name: "status", column: "status", type: "enum", values: STORY_STATUSES },
      { name: "storyType", column: "story_type", type: "text" },
      { name: "assigneeId", column: "assignee_id", type: "id" },
      { name: "assigneeName", column: "assignee_name", type: "text" },
      { name: "reviewerId", column: "reviewer_id", type: "id" },
      { name: "startsOn", column: "starts_on", type: "date" },
      { name: "dueOn", column: "due_on", type: "date" },
      { name: "closedAt", column: "closed_at", type: "date" },
      { name: "ticketId", column: "ticket_id", type: "id", ref: "tickets" },
      { name: "sprintId", column: "sprint_id", type: "id", ref: "sprints" },
      ACCOUNT,
      APP,
      CREATED,
      UPDATED,
    ],
  },
  sprints: {
    table: "sprints",
    module: "work",
    summary: "The blocks of work sold to a client, each with its dates and its price.",
    labelColumn: "name",
    defaultSort: "startsOn",
    fields: [
      ID,
      { name: "ref", column: "ref", type: "text", identity: true },
      { name: "name", column: "name", type: "text" },
      { name: "sprintType", column: "sprint_type", type: "enum", vocabulary: "Sprint type" },
      { name: "goal", column: "goal", type: "text", bulky: true },
      { name: "startsOn", column: "starts_on", type: "date" },
      { name: "endsOn", column: "ends_on", type: "date" },
      {
        name: "soldPriceCents",
        column: "sold_price_cents",
        type: "number",
        note: "what the client was charged for this block, in cents",
      },
      { name: "currency", column: "currency", type: "text" },
      { name: "completedAt", column: "completed_at", type: "date" },
      { name: "waveId", column: "wave_id", type: "id", ref: "waves" },
      ACCOUNT,
      APP,
      CREATED,
      UPDATED,
      DEACTIVATED,
    ],
  },
  work_logs: {
    table: "work_logs",
    module: "work",
    summary: "Time written down against a record — the hours behind the work.",
    labelColumn: "note",
    defaultSort: "startedAt",
    fields: [
      ID,
      { name: "userId", column: "user_id", type: "id" },
      { name: "userName", column: "user_name", type: "text" },
      { name: "kind", column: "kind", type: "text" },
      { name: "note", column: "note", type: "text" },
      { name: "targetTable", column: "target_table", type: "text" },
      { name: "targetId", column: "target_id", type: "id" },
      { name: "startedAt", column: "started_at", type: "date" },
      { name: "endedAt", column: "ended_at", type: "date", note: "null while the timer is still running" },
      { name: "seconds", column: "seconds", type: "number" },
      { name: "billable", column: "billable", type: "boolean" },
      { name: "discardedAt", column: "discarded_at", type: "date" },
      ACCOUNT,
      CREATED,
    ],
  },
  tasks: {
    table: "tasks",
    module: "work",
    summary: "The agency's own admin — a piece of work with nobody's ticket behind it.",
    labelColumn: "title",
    defaultSort: "createdAt",
    fields: [
      ID,
      { name: "ref", column: "ref", type: "text", identity: true },
      { name: "title", column: "title", type: "text" },
      { name: "detail", column: "detail", type: "text", bulky: true },
      { name: "status", column: "status", type: "enum", values: ["open", "done"] },
      { name: "assigneeId", column: "assignee_id", type: "id" },
      { name: "assigneeName", column: "assignee_name", type: "text" },
      { name: "department", column: "department", type: "text" },
      { name: "dueOn", column: "due_on", type: "date" },
      { name: "completedAt", column: "completed_at", type: "date" },
      { name: "important", column: "important", type: "boolean" },
      { name: "urgent", column: "urgent", type: "boolean" },
      ACCOUNT,
      APP,
      CREATED,
      UPDATED,
    ],
  },
  todos: {
    table: "todos",
    module: "todos",
    summary: "What we are waiting on a client for.",
    labelColumn: "title",
    defaultSort: "createdAt",
    fields: [
      ID,
      { name: "ref", column: "ref", type: "text", identity: true },
      { name: "title", column: "title", type: "text" },
      { name: "detail", column: "detail", type: "text", bulky: true },
      { name: "dueOn", column: "due_on", type: "date" },
      { name: "completedAt", column: "completed_at", type: "date" },
      { name: "cancelledAt", column: "cancelled_at", type: "date" },
      { name: "ticketId", column: "ticket_id", type: "id", ref: "tickets" },
      { name: "storyId", column: "story_id", type: "id", ref: "stories" },
      ACCOUNT,
      CREATED,
      UPDATED,
    ],
  },
  meetings: {
    table: "meetings",
    module: "meetings",
    summary: "The meetings list — when we met a client, and what was agreed.",
    labelColumn: "title",
    defaultSort: "startsAt",
    fields: [
      ID,
      { name: "ref", column: "ref", type: "text", identity: true },
      { name: "title", column: "title", type: "text" },
      { name: "agenda", column: "agenda", type: "text", bulky: true },
      { name: "notes", column: "notes", type: "text", bulky: true },
      { name: "location", column: "location", type: "text" },
      { name: "startsAt", column: "starts_at", type: "date" },
      { name: "endsAt", column: "ends_at", type: "date" },
      { name: "purposeId", column: "purpose_id", type: "id" },
      { name: "fromCalendar", column: "from_calendar", type: "boolean" },
      { name: "transcriptCapturedAt", column: "transcript_captured_at", type: "date" },
      ACCOUNT,
      APP,
      CREATED,
      UPDATED,
      DEACTIVATED,
    ],
  },
  accounts: {
    table: "accounts",
    module: "accounts",
    summary: "The customer spine — the companies and the people inside them.",
    labelColumn: "name",
    defaultSort: "name",
    fields: [
      ID,
      { name: "name", column: "name", type: "text" },
      {
        name: "accountType",
        column: "account_type",
        type: "enum",
        values: ["entity", "person"],
        note: "a company, or a person inside one",
      },
      { name: "parentAccountId", column: "parent_account_id", type: "id", ref: "accounts" },
      { name: "code", column: "code", type: "text" },
      { name: "email", column: "email", type: "text" },
      { name: "phone", column: "phone", type: "text" },
      { name: "city", column: "city", type: "text" },
      { name: "country", column: "country", type: "enum", vocabulary: "Country" },
      { name: "industry", column: "industry", type: "enum", vocabulary: "Industry" },
      { name: "currency", column: "currency", type: "text" },
      { name: "commercialsVisible", column: "commercials_visible", type: "boolean" },
      CREATED,
      UPDATED,
      DEACTIVATED,
    ],
  },
  apps: {
    table: "apps",
    module: "processes",
    summary: "The systems we built a client, each at a stage of its life.",
    labelColumn: "name",
    defaultSort: "name",
    fields: [
      ID,
      { name: "name", column: "name", type: "text" },
      { name: "url", column: "url", type: "text" },
      { name: "stage", column: "stage", type: "enum", values: APP_STAGE_NAMES },
      { name: "about", column: "about", type: "text", bulky: true },
      ACCOUNT,
      CREATED,
      UPDATED,
      DEACTIVATED,
    ],
  },
  app_modules: {
    table: "app_modules",
    module: "processes",
    summary: "The sections a system is divided into.",
    labelColumn: "name",
    defaultSort: "name",
    fields: [
      ID,
      { name: "name", column: "name", type: "text" },
      { name: "description", column: "description", type: "text", bulky: true },
      { name: "benefit", column: "benefit", type: "text", bulky: true },
      APP,
      ACCOUNT,
      CREATED,
      UPDATED,
      DEACTIVATED,
    ],
  },
  processes: {
    table: "processes",
    module: "processes",
    summary: "A client's process maps — how a piece of their work is actually done.",
    labelColumn: "name",
    defaultSort: "name",
    fields: [
      ID,
      { name: "name", column: "name", type: "text" },
      { name: "description", column: "description", type: "text", bulky: true },
      { name: "roleName", column: "role_name", type: "text" },
      { name: "auditDate", column: "audit_date", type: "date" },
      APP,
      ACCOUNT,
      CREATED,
      UPDATED,
      DEACTIVATED,
    ],
  },
  deliverables: {
    table: "deliverables",
    module: "deliverables",
    summary: "What we handed over on a system.",
    labelColumn: "title",
    defaultSort: "datedOn",
    fields: [
      ID,
      { name: "title", column: "title", type: "text" },
      { name: "kind", column: "kind", type: "enum", values: DELIVERABLE_KINDS },
      { name: "datedOn", column: "dated_on", type: "date" },
      {
        name: "visibleToClientAt",
        column: "visible_to_client_at",
        type: "date",
        note: "set when it was shown to the client; isNull means the agency only",
      },
      APP,
      ACCOUNT,
      CREATED,
      UPDATED,
      DEACTIVATED,
    ],
  },
  waves: {
    table: "waves",
    module: "work",
    summary: "The package a client's sprints were sold inside.",
    labelColumn: "name",
    defaultSort: "startsOn",
    fields: [
      ID,
      { name: "name", column: "name", type: "text" },
      { name: "goal", column: "goal", type: "text", bulky: true },
      { name: "startsOn", column: "starts_on", type: "date" },
      { name: "endsOn", column: "ends_on", type: "date" },
      ACCOUNT,
      CREATED,
      UPDATED,
      DEACTIVATED,
    ],
  },
  knowledge_sources: {
    table: "knowledge_sources",
    module: "knowledge",
    summary: "The material the assistant may read, and how far indexing has got.",
    labelColumn: "title",
    defaultSort: "createdAt",
    fields: [
      ID,
      { name: "title", column: "title", type: "text" },
      { name: "kind", column: "kind", type: "text" },
      { name: "compartment", column: "compartment", type: "text" },
      { name: "sourceUrl", column: "source_url", type: "text" },
      { name: "indexedAt", column: "indexed_at", type: "date" },
      { name: "chunkCount", column: "chunk_count", type: "number" },
      { name: "indexError", column: "index_error", type: "text" },
      { name: "recordDate", column: "record_date", type: "date" },
      ACCOUNT,
      APP,
      CREATED,
      UPDATED,
      DEACTIVATED,
    ],
  },
  roles: {
    table: "member_roles",
    module: "member_roles",
    summary: "The team's roles.",
    labelColumn: "title",
    defaultSort: "title",
    fields: [
      ID,
      { name: "title", column: "title", type: "text" },
      { name: "description", column: "description", type: "text", bulky: true },
      { name: "isDefault", column: "is_default", type: "boolean" },
      CREATED,
      UPDATED,
      DEACTIVATED,
    ],
  },
  dropdown_values: {
    table: "selectable_data",
    module: "selectable_data",
    summary: "The team's own vocabulary — the values its dropdowns offer.",
    labelColumn: "value",
    defaultSort: "type",
    fields: [
      ID,
      { name: "type", column: "type", type: "text", note: "which list the value belongs to" },
      { name: "value", column: "value", type: "text" },
      { name: "isDefault", column: "is_default", type: "boolean" },
      { name: "description", column: "description", type: "text", bulky: true },
      CREATED,
      UPDATED,
      DEACTIVATED,
    ],
  },
  account_rates: {
    table: "account_rates",
    module: "commercials",
    summary: "What a client is CHARGED for an hour. Never what our own hour costs.",
    labelColumn: "label",
    defaultSort: "label",
    fields: [
      ID,
      { name: "label", column: "label", type: "text" },
      { name: "centsPerHour", column: "cents_per_hour", type: "number" },
      { name: "currency", column: "currency", type: "text" },
      ACCOUNT,
      CREATED,
      UPDATED,
      DEACTIVATED,
    ],
  },
}

/** THE OTHER NAMES THE SAME THING GOES BY — derived, never hand-listed.
 *
 * WHY THIS EXISTS, and it is worth reading before touching it. On 29 Aug 2026
 * the assistant was asked the owner's own question on staging and failed on the
 * first call: it asked for `describe_module("help")`, this map calls that module
 * `tickets`, and the door refused. That was not the model being stupid — it was
 * the model counting. `list_help_tickets`, `set_help_status`, the API path
 * `/api/content/help`, the permission string on every role's sheet and the MCP
 * tool names ALL say help; CLAUDE.md says so deliberately (the section's LABEL
 * is Tickets, the module, tables, path and tool names stay `help` on purpose).
 * The grammar introduced the ONE place where the label is the name, and the
 * model reasonably followed the other forty signals.
 *
 * So a module answers to the names it already has elsewhere: its PERMISSION
 * module and its TABLE. Both are read off `QUERY_MODULES` itself, so a module
 * added tomorrow brings its own aliases and nobody has to remember. Two rules
 * keep it honest:
 *   · a name that is already a module KEY is never an alias (a key always wins);
 *   · a name claimed by TWO modules is no alias at all — `work` covers stories,
 *     sprints, work logs, tasks and waves, and guessing which one somebody meant
 *     would be worse than saying "which of these?".
 *
 * An alias can only ever resolve to a module that is already in the allow-list,
 * so this widens what a caller may SAY and not one row of what they may READ
 * (asserted in workers/tenancy/test/query-fence.test.ts). */
export const MODULE_ALIASES: Record<string, string> = (() => {
  const claims = new Map<string, string[]>()
  for (const [key, mod] of Object.entries(QUERY_MODULES))
    for (const other of [mod.module, mod.table]) {
      if (other === key || Object.prototype.hasOwnProperty.call(QUERY_MODULES, other)) continue
      claims.set(other, [...new Set([...(claims.get(other) ?? []), key])])
    }
  return Object.fromEntries(
    [...claims].filter(([, keys]) => keys.length === 1).map(([alias, keys]) => [alias, keys[0]])
  )
})()

/** A name reduced to what a person meant by it: no case, no separators. Lets
 * `Tickets`, `TICKETS` and `dropdown-values` land where they were aimed. */
const plain = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "")

/** The module a caller named, or undefined — by its own name, by a name it goes
 * by elsewhere, or by the same name spelled loosely.
 *
 * `hasOwnProperty`, not bracket access: `?module=__proto__` resolves an
 * INHERITED member on a bare object literal, which then reads as a live module
 * and 500s inside the engine. The same class of fault the activity feed's
 * generic record scope was fixed for — and now guarded on the alias map too,
 * which is a second bare object literal a request value reaches. */
export function queryModule(name: string | undefined): QueryModule | undefined {
  if (!name) return undefined
  if (Object.prototype.hasOwnProperty.call(QUERY_MODULES, name)) return QUERY_MODULES[name]
  if (Object.prototype.hasOwnProperty.call(MODULE_ALIASES, name))
    return QUERY_MODULES[MODULE_ALIASES[name]]
  const loose = plain(name)
  const key =
    Object.keys(QUERY_MODULES).find((k) => plain(k) === loose) ??
    Object.keys(MODULE_ALIASES).find((a) => plain(a) === loose)
  if (!key) return undefined
  return QUERY_MODULES[key] ?? QUERY_MODULES[MODULE_ALIASES[key]]
}

/** The CANONICAL name of whatever a caller named — echoed back in every answer,
 * so a caller who reached the right module by the wrong name learns the right
 * one instead of using the wrong one for the rest of the conversation. */
export function canonicalModule(name: string | undefined): string | undefined {
  const mod = queryModule(name)
  if (!mod) return undefined
  return Object.keys(QUERY_MODULES).find((k) => QUERY_MODULES[k] === mod)
}

/** THE NEAREST THING TO WHAT THEY ASKED FOR, for a refusal that can be acted on.
 *
 * A dead end costs a whole turn: the assistant that hit one on the owner's
 * question read the refusal, worked out the right name from it, and then OFFERED
 * to do the work rather than retrying. Naming the nearest candidate in the
 * refusal itself is the difference between a wall and a correction — the same
 * shape as `choices` above, where an empty result could not say which kind of
 * empty it was. Prefix and containment only: no edit distance, because a
 * confident wrong suggestion is worse than none — and where the name covers
 * SEVERAL modules, all of them come back rather than one chosen arbitrarily. */
export function suggestModule(name: string | undefined): string[] {
  if (!name) return []
  const loose = plain(name)
  if (!loose) return []
  // A PERMISSION MODULE THAT COVERS SEVERAL. `work` is stories, sprints, work
  // logs, tasks and waves, so it is deliberately not an alias — but it is also
  // the most likely thing somebody types, and naming all five is a better answer
  // than picking one of them and sounding sure.
  const covered = Object.entries(QUERY_MODULES)
    .filter(([, mod]) => plain(mod.module) === loose || plain(mod.table) === loose)
    .map(([key]) => key)
  if (covered.length) return covered
  const names = [...Object.keys(QUERY_MODULES), ...Object.keys(MODULE_ALIASES)]
  const hit =
    names.find((n) => plain(n).startsWith(loose) || loose.startsWith(plain(n))) ??
    names.find((n) => plain(n).includes(loose) || loose.includes(plain(n)))
  const canonical = hit ? canonicalModule(hit) : undefined
  return canonical ? [canonical] : []
}

/** THE OTHER NAMES A FIELD ANSWERS TO — the same lesson as MODULE_ALIASES, one
 * level down, and learned the same way.
 *
 * `list_help_tickets`' own description says "`q` searches the REFERENCE, the
 * description and the title". The column is `ref`. So the word the app uses in
 * front of a person is not the word the field answers to, and on 29 Aug 2026 a
 * lookup by `reference` was refused for exactly that reason.
 *
 * Small and hand-written, because unlike a module there is no second source to
 * derive a field's other name from — a table and a permission string exist
 * anyway, a synonym does not. Each line is rot-checked: it must resolve to a
 * real field on at least one module, and it must never shadow a field that
 * already exists. A field's own COLUMN is handled separately and needs no line
 * here, because that IS derivable. */
export const FIELD_ALIASES: Record<string, string> = {
  reference: "ref",
  // A ticket has a `title`, an account has a `name`, and which of the two a
  // person says depends on the record rather than on the app. Applied only
  // where the module has the target and not the alias, so neither ever shadows
  // a real field.
  name: "title",
  title: "name",
}

/** A module's field by the name the model uses — its own name, its COLUMN, a
 * loose spelling of either, or one of the few synonyms above. Same reasoning as
 * `queryModule`, one level down: a field name arrives from a request too, and a
 * refusal it did not deserve costs the same turn. */
export function queryField(mod: QueryModule, name: string | undefined): QueryField | undefined {
  if (!name) return undefined
  const exact = mod.fields.find((f) => f.name === name)
  if (exact) return exact
  // The COLUMN, which is derivable and therefore needs no list: a model that
  // read `title_en` or `account_id` somewhere means the field that carries it.
  const byColumn = mod.fields.find((f) => f.column === name)
  if (byColumn) return byColumn
  const loose = plain(name)
  const bySpelling = mod.fields.find((f) => plain(f.name) === loose || plain(f.column) === loose)
  if (bySpelling) return bySpelling
  if (!Object.prototype.hasOwnProperty.call(FIELD_ALIASES, name)) return undefined
  const target = FIELD_ALIASES[name]
  // An alias never shadows a real field: if this module HAS one by the name the
  // caller used, the branches above already returned it.
  return mod.fields.find((f) => f.name === target)
}

/** The module names, for a tool description and for an error that has to say
 * what the caller COULD have asked for. */
export const QUERY_MODULE_NAMES = Object.keys(QUERY_MODULES)
