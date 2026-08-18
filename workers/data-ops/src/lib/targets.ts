// The code side of the import catalog: which tables an import may write into, and
// HOW each row is written. The GLOBAL importable_databases table (owner-maintained)
// holds the catalog data the UI/agent see; this map holds the bits that are code —
// the permission module gated on, and the gated create endpoint each row is POSTed
// to (act-as-user). A table is importable ONLY if it appears here AND is active in
// the catalog. Locked for now (owner's call): member roles + dropdown values first.

import type { ImportColumn } from "@shared/types"
import { MODULE_RIGHTS, TEAM_MODULE_CATALOG } from "@shared/team-modules"

export type { ImportColumn }

/** The permission matrix flattened to one optional `<module>.<right>` column each —
 * the SAME headers the roles export writes, so an exported roles file imports
 * straight back (round-trip). Built from the shared module list: a new module
 * appears in the matrix, the export, and the import columns in one move. */
const MATRIX_COLUMNS: ImportColumn[] = TEAM_MODULE_CATALOG.flatMap((m) =>
  MODULE_RIGHTS.map((rt) => ({ key: `${m.key}.${rt}`, label: `${m.key}.${rt}`, required: false }))
)

/** yes/true/1 (however the spreadsheet says it) → the right is ON. */
const isYes = (v?: string) => /^(1|y|yes|true|t)$/i.test((v ?? "").trim())

/** Read the flattened matrix cells off a mapped row → a PermissionValue-shaped
 * object, or undefined when the row carries NO matrix data at all (a plain
 * title+description import stays a plain create — no extra right demanded). */
function matrixFromRow(r: Record<string, string>): Record<string, Record<string, boolean>> | undefined {
  let any = false
  const permissions: Record<string, Record<string, boolean>> = {}
  for (const m of TEAM_MODULE_CATALOG) {
    const rights: Record<string, boolean> = {}
    for (const rt of MODULE_RIGHTS) {
      const v = r[`${m.key}.${rt}`]
      if (v && v.trim() !== "") any = true
      rights[rt] = isYes(v)
    }
    permissions[m.key] = rights
  }
  return any ? permissions : undefined
}

/** A cross-target foreign key: OUR `column` (a natural key in the file) points at
 * another `target`, matched against that parent's `by` natural key. `mode:"id"`
 * injects the parent's NEW id into buildBody's `refs`; `mode:"value"` keeps the
 * string (ordering just guarantees the parent exists first). See AGENTIC-IMPORT §4. */
export type ReferenceDef = {
  column: string
  target: string
  by: string
  mode: "id" | "value"
  onMissing: "reject" | "blank" | "create"
}

export type TargetDef = {
  tableKey: string
  /** the permission module the caller must hold `create` on (import has no own key). */
  module: string
  displayName: string
  description: string
  columns: ImportColumn[]
  /** the gated create endpoint each mapped row is written through (act-as-user). */
  endpoint: { binding: "CONTENT" | "TENANCY"; path: string }
  /** shape one mapped row into that endpoint's body. `refs` carries any resolved
   * parent ids (mode:"id" references) — existing single-key targets ignore it. */
  buildBody: (row: Record<string, string>, refs?: Record<string, string>) => Record<string, unknown>
  /** cross-target foreign keys this target's rows carry (drives import order). */
  references?: ReferenceDef[]
  /** the column that identifies a row so a CHILD can resolve to it by natural key. */
  naturalKey?: string
  /** ONLY needed for a target that is referenced by a `mode:"id"` child: how to read
   * back its rows to build naturalKey→newId after import. Base targets omit it (the
   * base's one dependency is value-mode); an app adds it to be an id-parent. */
  list?: { path: string; key: string; idField: string; nameField: string }
  /** the full-field CSV export door for this table, when one exists (export = READ
   * right; the agent's capability brief + the parity test read this, so the agent
   * always knows which tables can be exported). */
  exportPath?: string
  /** One example row (columnKey → example value) for the downloadable SAMPLE file
   * (AGENTIC-IMPORT §10). A column with no example falls back to `Example <label>`,
   * so every target always yields a usable sample. Show users a good file BEFORE
   * they prepare theirs. */
  sample?: Record<string, string>
}

/** A spreadsheet says "Company" / "Person"; the door speaks entity / individual.
 * Anything we don't recognise is passed through UNCHANGED so the door refuses it
 * by name — guessing a type would file a person as a company in silence. */
function accountType(v: string): string {
  const s = v.trim().toLowerCase()
  if (/^(entity|company|business|organisation|organization|firm|client)$/.test(s)) return "entity"
  if (/^(individual|person|people|contact|human)$/.test(s)) return "individual"
  return v.trim()
}

/** THE ONE WAY to look a target up from anything a caller supplied.
 *
 * A plain `TARGETS[key]` resolves INHERITED members too, so `?tableKey=constructor`
 * hands back a function that passes a truthiness check and then crashes deeper in
 * as a 500 — one error-log row per request, from a string anyone can send. Own
 * properties only, and `undefined` for everything else. */
export function targetFor(key: string | null | undefined): TargetDef | undefined {
  return key && Object.prototype.hasOwnProperty.call(TARGETS, key) ? TARGETS[key] : undefined
}

export const TARGETS: Record<string, TargetDef> = {
  // Dropdown values ("Selectable data") — the base's PARENT in the worked
  // multi-table demo: import these first, then the rows that name a value do.
  selectable_data: {
    tableKey: "selectable_data",
    module: "selectable_data",
    displayName: "Dropdown values",
    description: "Add selectable dropdown values in bulk (e.g. Ticket types, Sprint types).",
    columns: [
      { key: "type", label: "Group", required: true },
      { key: "value", label: "Value", required: true },
    ],
    endpoint: { binding: "TENANCY", path: "/api/tenancy/selectable" },
    exportPath: "/api/tenancy/selectable/export",
    naturalKey: "value",
    sample: { type: "Ticket type", value: "Question" },
    buildBody: (r) => ({ type: r.type, value: r.value }),
  },
  member_roles: {
    tableKey: "member_roles",
    module: "member_roles",
    displayName: "Member roles",
    description:
      "Create team roles in bulk, optionally with their permission matrix (one module.right column each, yes/no). Rows without matrix columns start with permissions off.",
    columns: [
      { key: "title", label: "Role name", required: true },
      { key: "description", label: "Description", required: false },
      ...MATRIX_COLUMNS,
    ],
    endpoint: { binding: "TENANCY", path: "/api/tenancy/roles" },
    exportPath: "/api/tenancy/roles/export",
    naturalKey: "title",
    sample: {
      title: "Editor",
      description: "Can create and edit, but not remove",
      "help.read": "yes",
      "help.create": "yes",
      "help.edit": "yes",
      "selectable_data.read": "yes",
    },
    // A row WITH matrix cells also sets the role's permissions (the endpoint then
    // requires the edit right too); a row without stays a plain create.
    buildBody: (r) => {
      const permissions = matrixFromRow(r)
      return { title: r.title, description: r.description ?? "", ...(permissions ? { permissions } : {}) }
    },
  },
  // The customer spine. Companies and people are ONE table (SCOPE ch.03), so one
  // target imports both — `accountType` says which a row is.
  //
  // WHAT THIS TARGET DELIBERATELY DOES NOT CARRY: the parent account. A file's
  // own rows can only be resolved to ids AFTER the file has been written (the
  // engine reads a parent target back once its step finishes), so a
  // self-referencing parent column would resolve to nothing on the very rows it
  // exists for — and silently file every account at the top level. Structure is
  // set through `/api/tenancy/accounts/parent`, which refuses a move that would
  // close a loop; since 18 Aug 2026 no screen offers that move (the owner: "each
  // new account created will be its own thing"), so the callers are the assistant
  // and the MCP surface. A CONTACT gets hers a different way and always has: she
  // is created on her company's Contacts tab, which writes the parent in code.
  // This target's job is getting the records in.
  accounts: {
    tableKey: "accounts",
    module: "accounts",
    displayName: "Accounts",
    description:
      "Create accounts in bulk, companies and people in one file. Say which each row is in the Type column (company or person). Every row lands at the top level: the account one sits under is set afterwards, by asking the assistant to move it.",
    columns: [
      { key: "name", label: "Name", required: true },
      { key: "accountType", label: "Type", required: true },
      { key: "code", label: "Reference", required: false },
      { key: "email", label: "Email", required: false },
      { key: "phone", label: "Phone", required: false },
      // The address is four columns, not one line — the same four the record
      // itself carries, so a file goes out and comes back meaning the same thing.
      { key: "street", label: "Street", required: false },
      { key: "postalCode", label: "Postal code", required: false },
      { key: "city", label: "City", required: false },
      { key: "country", label: "Country", required: false },
      { key: "industry", label: "Industry", required: false },
      { key: "status", label: "Status", required: false },
    ],
    endpoint: { binding: "TENANCY", path: "/api/tenancy/accounts" },
    // Accounts could be imported and never exported — a one-way street through
    // the module the whole product is about. The catalogue's own parity guard
    // could not catch it: it asserts every DECLARED exportPath is a tool, so an
    // absent one passed vacuously. Declaring it here is what puts the export in
    // the agent's capability brief AND on the machine surface, in one line.
    exportPath: "/api/tenancy/accounts/export",
    naturalKey: "name",
    sample: {
      name: "Bergman S.A.",
      accountType: "company",
      // A file may carry the agency's own legacy references. Leave the column
      // out and the door mints one (BERG, BERG2 on a clash) — nobody types these.
      code: "BERG",
      email: "hola@bergman.example",
      phone: "+34 600 000 000",
      street: "Calle Mayor 1",
      postalCode: "28013",
      city: "Madrid",
      country: "Spain",
      industry: "Hospitality",
      status: "active_client",
    },
    buildBody: (r) => ({
      accountType: accountType(r.accountType),
      name: r.name,
      code: r.code || undefined,
      email: r.email || undefined,
      phone: r.phone || undefined,
      street: r.street || undefined,
      postalCode: r.postalCode || undefined,
      city: r.city || undefined,
      country: r.country || undefined,
      industry: r.industry || undefined,
      status: r.status || undefined,
    }),
  },
  meetings: {
    tableKey: "meetings",
    module: "meetings",
    displayName: "Meetings",
    description:
      "Bring the diary in in bulk, one row per conversation, with what was on the agenda and what was decided. The reason we met is set afterwards on the meeting itself, because a meeting purpose is a record here and only a word in a file.",
    columns: [
      { key: "title", label: "Title", required: true },
      { key: "startsAt", label: "When", required: true },
      { key: "endsAt", label: "Until", required: false },
      { key: "account", label: "Client", required: false },
      { key: "location", label: "Where", required: false },
      { key: "agenda", label: "Agenda", required: false },
      { key: "notes", label: "Notes", required: false },
    ],
    endpoint: { binding: "CONTENT", path: "/api/content/meetings" },
    naturalKey: "title",
    sample: {
      title: "Quarterly review with Bergman",
      startsAt: "2026-09-14T10:00:00Z",
      endsAt: "2026-09-14T11:00:00Z",
      account: "Bergman Logistik",
      location: "Their office",
      agenda: "What shipped last quarter, what is next, and the dispatch screen complaints.",
      notes: "Agreed to move the driver app forward and park the reporting work.",
    },
    references: [
      // The client is resolved to a REAL account id, and a name that matches
      // nothing REJECTS the line rather than importing a meeting filed under
      // nobody: a note about Bergman sitting in the agency's own compartment is
      // an answer the assistant will give to the wrong person.
      { column: "account", target: "accounts", by: "name", mode: "id", onMissing: "reject" },
    ],
    buildBody: (r, refs) => ({
      title: r.title,
      startsAt: r.startsAt,
      endsAt: r.endsAt || undefined,
      accountId: refs?.account || undefined,
      location: r.location || undefined,
      agenda: r.agenda || undefined,
      notes: r.notes || undefined,
    }),
  },
  // THE WORK ENGINE'S BACKLOG. Importable, and unusually for this catalogue that
  // is not a convenience: two years of history arrive from the previous system
  // as 3,677 rows (.plans/BUILD-1 §10), and the alternative to a file is nobody
  // typing them and the margin having nothing to subtract.
  //
  // NO ASSIGNEE, NO SPRINT, NO STEP COLUMN, deliberately. Those three are ids in
  // this app and names in a spreadsheet, and a wrong guess is worse than a blank:
  // an assignee resolved by fuzzy name puts somebody else's work on your list, a
  // step resolved by name attaches a saving to the wrong part of a map. They are
  // set afterwards, on the story, by the person who knows. The file's job is
  // getting the work IN — the same sentence the accounts target makes about a
  // parent account, and for the same reason.
  stories: {
    tableKey: "stories",
    module: "work",
    displayName: "Stories",
    description:
      "Create stories in bulk, one row per piece of work. The sprint, the assignee and the process step each story changes are set afterwards on the story itself, because those are records here and only names in a file.",
    columns: [
      { key: "title", label: "Title", required: true },
      { key: "detail", label: "Detail", required: false },
      { key: "dueOn", label: "Due date", required: false },
    ],
    endpoint: { binding: "CONTENT", path: "/api/content/stories" },
    naturalKey: "title",
    sample: {
      title: "Move dispatch onto the driver app",
      detail: "Replace the paper run sheet with the list on the phone.",
      dueOn: "2026-09-30",
    },
    buildBody: (r) => ({
      title: r.title,
      detail: r.detail || undefined,
      dueOn: r.dueOn || undefined,
    }),
  },

  // ── THE AGENCY'S OWN HOUSEKEEPING ──────────────────────────────────────────
  // Four of the seven legacy tables land here as import targets, which is what
  // makes the migration a mapping exercise rather than a typing exercise: 251
  // posts, 74 brand assets, 10 programmes and 27 meeting purposes go in through
  // the SAME gated create doors a person uses, so every row lands audited,
  // published and permission-checked. The fifth module (staff profiles) is a
  // reasoned CATALOG_EXEMPT line instead — a CSV cannot say which colleague a
  // profile belongs to.
  //
  // Each declares its vocabulary column as a `mode:"value"` reference to the
  // dropdown target. The door auto-creates a missing value, so the reference's
  // job is ORDER: import the vocabulary first and the departments and categories
  // are canonical before the rows that use them arrive — which is precisely the
  // thing the legacy label tables were folded in to achieve.
  brand_assets: {
    tableKey: "brand_assets",
    module: "brand_assets",
    displayName: "Brand library",
    description:
      "Bring the agency's own brand material in in bulk, logos, decks, templates. The file column takes a link; the bytes are re-hosted separately.",
    columns: [
      { key: "name", label: "Name", required: true },
      { key: "category", label: "Category", required: false },
      { key: "description", label: "Description", required: false },
      { key: "fileUrl", label: "File", required: false },
    ],
    endpoint: { binding: "CONTENT", path: "/api/content/brand-assets" },
    exportPath: "/api/content/brand-assets/export",
    naturalKey: "name",
    sample: {
      name: "Primary logo (dark)",
      category: "Logos",
      description: "For light backgrounds. SVG, no padding.",
      fileUrl: "https://example.com/brand/logo-dark.svg",
    },
    references: [
      { column: "category", target: "selectable_data", by: "value", mode: "value", onMissing: "create" },
    ],
    buildBody: (r) => ({
      name: r.name,
      category: r.category || undefined,
      description: r.description || undefined,
      fileUrl: r.fileUrl || undefined,
    }),
  },
  meeting_purposes: {
    tableKey: "meeting_purposes",
    module: "delivery",
    displayName: "Meeting purposes",
    description:
      "Bring the reasons the agency meets in in bulk, each with the department it belongs to. A department that isn't a dropdown value yet is added as one.",
    columns: [
      { key: "name", label: "Name", required: true },
      { key: "department", label: "Department", required: false },
      { key: "description", label: "Description", required: false },
    ],
    endpoint: { binding: "CONTENT", path: "/api/content/delivery/purposes" },
    exportPath: "/api/content/delivery/purposes/export",
    naturalKey: "name",
    sample: { name: "Sprint review", department: "Delivery", description: "Show the client what shipped." },
    references: [
      { column: "department", target: "selectable_data", by: "value", mode: "value", onMissing: "create" },
    ],
    buildBody: (r) => ({
      name: r.name,
      department: r.department || undefined,
      description: r.description || undefined,
    }),
  },
}

/** A downloadable SAMPLE CSV for a target: a header row of the column LABELS + one
 * example data row (from `sample`; a REQUIRED column with no example falls back to
 * `Example <label>` so the sample always imports; an optional one stays empty — a
 * good file doesn't have to fill every column). So every import place can show
 * "here's what a good file looks like" (AGENTIC-IMPORT §10) — built from the
 * target's own columns, so it's automatic for every target. RFC-4180 quoting is
 * applied by the route's `toCsv`; here we just assemble the two rows. */
export function sampleRows(target: TargetDef): { header: string[]; row: string[] } {
  const header = target.columns.map((c) => c.label)
  const row = target.columns.map(
    (c) => target.sample?.[c.key] ?? (c.required ? `Example ${c.label.toLowerCase()}` : "")
  )
  return { header, row }
}

/** The default catalog rows the owner-only seed endpoint upserts (kept in sync with
 * TARGETS). New importable tables are added here AND given a TargetDef above. */
export const DEFAULT_CATALOG = Object.values(TARGETS).map((t) => ({
  tableKey: t.tableKey,
  displayName: t.displayName,
  description: t.description,
  columns: t.columns,
}))

/** Normalise a header / column name / natural key for fuzzy matching
 * ("Role Name" ≈ "role_name"; "Getting Started" ≈ "getting  started"). */
export function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/** Best-guess mapping target-column-key → source-header by matching the column key
 * or its label against the file's headers (case/space/punctuation-insensitive). */
export function autoMap(headers: string[], columns: ImportColumn[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const col of columns) {
    const want = [norm(col.key), norm(col.label)]
    const hit = headers.find((h) => want.includes(norm(h)))
    if (hit) map[col.key] = hit
  }
  return map
}
