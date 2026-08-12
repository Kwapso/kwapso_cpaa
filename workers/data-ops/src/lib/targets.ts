// The code side of the import catalog: which tables an import may write into, and
// HOW each row is written. The GLOBAL importable_databases table (owner-maintained)
// holds the catalog data the UI/agent see; this map holds the bits that are code —
// the permission module gated on, and the gated create endpoint each row is POSTed
// to (act-as-user). A table is importable ONLY if it appears here AND is active in
// the catalog. Locked for now (owner's call): member roles + learning content only.

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
  // multi-table demo: import these first, then learning articles reference them.
  selectable_data: {
    tableKey: "selectable_data",
    module: "selectable_data",
    displayName: "Dropdown values",
    description: "Add selectable dropdown values in bulk (e.g. Learning categories, Ticket types).",
    columns: [
      { key: "type", label: "Group", required: true },
      { key: "value", label: "Value", required: true },
    ],
    endpoint: { binding: "TENANCY", path: "/api/tenancy/selectable" },
    exportPath: "/api/tenancy/selectable/export",
    naturalKey: "value",
    sample: { type: "Learning category", value: "Getting Started" },
    buildBody: (r) => ({ type: r.type, value: r.value }),
  },
  member_roles: {
    tableKey: "member_roles",
    module: "member_roles",
    displayName: "Member roles",
    description:
      "Create team roles in bulk — optionally with their permission matrix (one module.right column each, yes/no). Rows without matrix columns start with permissions off.",
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
      "learning.read": "yes",
      "learning.create": "yes",
      "learning.edit": "yes",
      "help.read": "yes",
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
  // set on the account itself (its detail screen refuses a move that would close
  // a loop); this target's job is getting the records in.
  accounts: {
    tableKey: "accounts",
    module: "accounts",
    displayName: "Accounts",
    description:
      "Create accounts in bulk — companies and people in one file. Say which each row is in the Type column (company or person). The account each one sits under is set afterwards on the account itself.",
    columns: [
      { key: "name", label: "Name", required: true },
      { key: "accountType", label: "Type", required: true },
      { key: "code", label: "Reference", required: false },
      { key: "email", label: "Email", required: false },
      { key: "phone", label: "Phone", required: false },
      { key: "address", label: "Address", required: false },
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
      code: "BERG",
      email: "hola@bergman.example",
      phone: "+34 600 000 000",
      address: "Calle Mayor 1, Madrid",
      status: "client",
    },
    buildBody: (r) => ({
      accountType: accountType(r.accountType),
      name: r.name,
      code: r.code || undefined,
      email: r.email || undefined,
      phone: r.phone || undefined,
      address: r.address || undefined,
      status: r.status || undefined,
    }),
  },
  learning: {
    tableKey: "learning",
    module: "learning",
    displayName: "Learning content",
    description: "Create how-to / learning items in bulk.",
    columns: [
      { key: "title", label: "Title", required: true },
      { key: "category", label: "Category", required: false },
      { key: "description", label: "Description", required: false },
      { key: "contentType", label: "Type", required: false },
      { key: "contentLink", label: "Link", required: false },
      { key: "body", label: "Body", required: false },
    ],
    endpoint: { binding: "CONTENT", path: "/api/content/learning" },
    exportPath: "/api/content/learning/export",
    naturalKey: "title",
    sample: {
      title: "How to log in",
      category: "Getting Started",
      description: "Step-by-step sign-in guide",
      contentType: "Other link",
      contentLink: "https://example.com/guide",
      body: "1. Open the app. 2. Enter your email. 3. Type the code we send you.",
    },
    // The worked base dependency: a learning article's category is a Dropdown value.
    // mode:"value" (the endpoint auto-creates a missing category), so the reference's
    // job is ORDER — import dropdowns before articles so categories are canonical.
    references: [
      { column: "category", target: "selectable_data", by: "value", mode: "value", onMissing: "create" },
    ],
    buildBody: (r) => ({
      title: r.title,
      category: r.category || undefined,
      description: r.description || undefined,
      contentType: r.contentType || undefined,
      contentLink: r.contentLink || undefined,
      body: r.body || undefined,
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
  // job is ORDER: import the vocabulary first and the channels, departments and
  // categories are canonical before the rows that use them arrive — which is
  // precisely the thing the two legacy label tables were folded in to achieve.
  marketing_posts: {
    tableKey: "marketing_posts",
    module: "marketing",
    displayName: "Marketing posts",
    description:
      "Bring the agency's own published posts in in bulk — what went out, on which channel, on which day. Ours alone: nothing here ever reaches a client's portal.",
    columns: [
      { key: "title", label: "Title", required: true },
      { key: "channel", label: "Channel", required: false },
      { key: "status", label: "Status", required: false },
      { key: "summary", label: "Summary", required: false },
      { key: "body", label: "Body", required: false },
      { key: "link", label: "Link", required: false },
      { key: "publishedOn", label: "Published on", required: false },
    ],
    endpoint: { binding: "CONTENT", path: "/api/content/marketing" },
    exportPath: "/api/content/marketing/export",
    naturalKey: "title",
    sample: {
      title: "How we halved a dispatch handover",
      channel: "Newsletter",
      status: "Published",
      summary: "A short write-up of the Bergman process map",
      body: "We mapped the handover, timed every step with them, and cut two of them entirely.",
      link: "https://example.com/posts/dispatch-handover",
      publishedOn: "2026-05-14",
    },
    references: [
      { column: "channel", target: "selectable_data", by: "value", mode: "value", onMissing: "create" },
    ],
    buildBody: (r) => ({
      title: r.title,
      channel: r.channel || undefined,
      status: r.status || undefined,
      summary: r.summary || undefined,
      body: r.body || undefined,
      link: r.link || undefined,
      publishedOn: r.publishedOn || undefined,
    }),
  },
  brand_assets: {
    tableKey: "brand_assets",
    module: "brand_assets",
    displayName: "Brand library",
    description:
      "Bring the agency's own brand material in in bulk — logos, decks, templates. The file column takes a link; the bytes are re-hosted separately.",
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
  programs: {
    tableKey: "programs",
    module: "delivery",
    displayName: "Delivery programmes",
    description: "Bring the ways the agency runs an engagement in in bulk, in the order they should read.",
    columns: [
      { key: "name", label: "Name", required: true },
      { key: "description", label: "Description", required: false },
      { key: "sequence", label: "Order", required: false },
    ],
    endpoint: { binding: "CONTENT", path: "/api/content/delivery/programs" },
    exportPath: "/api/content/delivery/programs/export",
    naturalKey: "name",
    sample: { name: "Blueprint", description: "Two weeks mapping how the work is done today.", sequence: "1" },
    buildBody: (r) => ({
      name: r.name,
      description: r.description || undefined,
      sequence: r.sequence ? Number(r.sequence) : undefined,
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
