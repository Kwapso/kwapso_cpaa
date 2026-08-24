// =============================================================================
// Swift Struck UI configuration system — the shared vocabulary every component's
// `config` is built from. See ARCHITECTURE.md "Configuration" + "Taxonomy".
//
// Model: a universal BaseConfig (visibility) sits under every component, then a
// per-category mixin (Field / Action / Collection / Content) adds shared knobs
// for that kind of component, then each component adds its own. Compose with
// intersection types + spreading the matching `defaultXConfig`.
// =============================================================================

/* ----------------------------- visibility rules ---------------------------- */

/** Where a rule reads its value from. */
export type RuleSource = "row" | "user" | "app"

export type RuleOperator =
  | "is"
  | "isNot"
  | "contains"
  | "gt"
  | "lt"
  /** Inclusive numeric bounds — what a `control:"range"` facet compiles to. */
  | "gte"
  | "lte"
  | "isEmpty"
  | "isNotEmpty"

/** A single condition, e.g. { source:"row", field:"status", op:"is", value:"active" }. */
export interface Rule {
  source: RuleSource
  field: string
  op: RuleOperator
  value: string
}

/** The data a rule is evaluated against (current row, signed-in user, app state). */
export interface VisibilityContext {
  row: Record<string, unknown>
  user: Record<string, unknown>
  app: Record<string, unknown>
}

export const emptyContext: VisibilityContext = { row: {}, user: {}, app: {} }

function evalRule(rule: Rule, ctx: VisibilityContext): boolean {
  const raw = ctx[rule.source]?.[rule.field]
  const s = String(raw ?? "")
  switch (rule.op) {
    case "is":
      return s === rule.value
    case "isNot":
      return s !== rule.value
    case "contains":
      return s.toLowerCase().includes(rule.value.toLowerCase())
    case "gt":
    case "lt":
    case "gte":
    case "lte": {
      // A numeric comparison needs a real number on BOTH sides, and a blank or
      // non-numeric field never matches. Without the `s === ""` guard, Number("")
      // is 0 — so a product with no price would sneak into a "price ≤ 5" filter,
      // while a MISSING price (NaN) correctly wouldn't. This also mirrors SQL,
      // where comparing NULL is never true, so the in-memory result agrees with
      // what the D1/SQL layer returns for the same rule.
      const a = Number(s)
      const b = Number(rule.value)
      if (s === "" || !Number.isFinite(a) || !Number.isFinite(b)) return false
      if (rule.op === "gt") return a > b
      if (rule.op === "lt") return a < b
      if (rule.op === "gte") return a >= b
      return a <= b
    }
    case "isEmpty":
      return raw == null || s === ""
    case "isNotEmpty":
      return raw != null && s !== ""
    default:
      return true
  }
}

/** True if the rules pass. No rules → always true. `matchAny` switches AND→OR. */
export function evaluateRules(
  rules: Rule[],
  ctx: VisibilityContext,
  matchAny = false
): boolean {
  if (!rules || rules.length === 0) return true
  return matchAny
    ? rules.some((r) => evalRule(r, ctx))
    : rules.every((r) => evalRule(r, ctx))
}

/* ------------------------------- base config ------------------------------- */

/** On EVERY component. The minimum shared config. */
export interface BaseConfig {
  /** Hard show/hide switch. */
  visible: boolean
  /** Conditional visibility — all must pass (see evaluateRules). */
  visibilityRules: Rule[]
}

export const defaultBaseConfig: BaseConfig = {
  visible: true,
  visibilityRules: [],
}

/* ----------------------------- category configs ---------------------------- */

/** Validation for input fields (null = no limit). */
export interface FieldValidation {
  min: number | null
  max: number | null
  minLength: number | null
  maxLength: number | null
  pattern: string
}

export const defaultFieldValidation: FieldValidation = {
  min: null,
  max: null,
  minLength: null,
  maxLength: null,
  pattern: "",
}

/** Input components (text, number, choice, notes…). */
export interface FieldConfig extends BaseConfig {
  label: string
  helpText: string
  required: boolean
  disabled: boolean
  validation: FieldValidation
}

export const defaultFieldConfig: FieldConfig = {
  ...defaultBaseConfig,
  label: "",
  helpText: "",
  required: false,
  disabled: false,
  validation: { ...defaultFieldValidation },
}

/** Check a string value against a FieldConfig. Returns an error message to show
 * the user, or null when the value is valid. Numeric min/max only apply when the
 * value parses as a number; length/pattern apply to the raw string. */
export function validateField(
  value: string,
  config: FieldConfig
): string | null {
  const v = config.validation
  const name = config.label || "This field"
  if (value.trim() === "") {
    return config.required ? `${name} is required.` : null
  }
  if (v.minLength != null && value.length < v.minLength)
    return `Must be at least ${v.minLength} characters.`
  if (v.maxLength != null && value.length > v.maxLength)
    return `Must be at most ${v.maxLength} characters.`
  // Numeric min/max only apply to a plain decimal value — the regex stops
  // Number() from coercing "0x10" / "1e3" / "Infinity" into a passing number.
  // (A blank value already returned above, so "" never reaches here.)
  if (/^-?\d*\.?\d+$/.test(value.trim())) {
    const num = Number(value)
    if (v.min != null && num < v.min) return `Must be ${v.min} or more.`
    if (v.max != null && num > v.max) return `Must be ${v.max} or less.`
  }
  if (v.pattern && !new RegExp(v.pattern).test(value))
    return `${name} is not in the expected format.`
  return null
}

export interface FacetOption {
  value: string
  label: string
  count?: number
}

/** Past this many options a pick-a-value control searches itself, so a host
 * can't accidentally ship an unsearchable 200-item dropdown. Below it, a search
 * box is noise. One constant so every control agrees (FilterBar, SortControl). */
export const SEARCHABLE_THRESHOLD = 8

/** One field the user may sort by. `value` is the row field. */
export interface SortOption {
  value: string
  label: string
  /** The direction applied when this option is PICKED. Dates want `"desc"`
   * (newest first), names want `"asc"` — landing on oldest-first reads as
   * broken. Defaults to `"asc"`. The user can still flip it afterwards. */
  defaultDir?: "asc" | "desc"
  /** This option has no meaningful direction (e.g. best-match relevance). The
   * asc/desc toggle is DISABLED while it's active rather than silently ignored.
   * Don't make a directionless option the default `sortBy` — the user then
   * lands on a greyed-out toggle, which answers "am I A→Z or Z→A?" with
   * nothing. */
  directionless?: boolean
}

/** A user-facing filter control. A chosen value becomes an `is` Rule on `field`,
 * run through the SAME `evaluateRules` engine as the builder `filter` (no new
 * matching engine). `control` is just presentation: a dropdown or chips. When
 * `options` is omitted, the distinct values are derived from the data at render
 * (see `facetOptions` in lib/collection.ts). */
export interface FilterFacet {
  field: string
  label: string
  /** `select` = dropdown · `chips` = removable chips · `range` = numeric min/max.
   * A `range` facet reports `"min..max"` (either side may be empty, e.g. `"10.."`)
   * and compiles to inclusive `gte`/`lte` rules — see `selectRows`. */
  control: "select" | "chips" | "range"
  options?: FacetOption[]
  /** `control:"range"` bounds. With BOTH `min` and `max` the facet renders a
   * two-thumb slider; otherwise two number inputs. `step` defaults to 1. */
  min?: number
  max?: number
  step?: number
  /** Render a `control:"select"` facet as a searchable combobox instead of a
   * plain dropdown. (No effect on `chips` / `range`.) */
  searchable?: boolean
  /** Async option provider for a `searchable` select facet. Called (debounced)
   * as the user types; the resolved rows REPLACE the visible option list — so a
   * facet with thousands of values is searchable without ever loading them all.
   * `options` is shown before the user types. Requires `searchable`. */
  onSearch?: (field: string, query: string) => Promise<FacetOption[]>
}

/** Collection components — data-bound views. `filter`/`sort`/`limit` are
 * DECLARED here and EXECUTED by the data layer (D1/SQL) — the component itself
 * just receives the resulting rows. */
export interface CollectionConfig extends BaseConfig {
  dataSource: string
  /** Header shown above the collection (empty = no header). */
  title: string
  /** Builder-side conditions (always applied). User-facing facets live in
   * `filterFacets` and are ANDed with these. */
  filter: Rule[]
  /** The INITIAL sort. When `sortable` is on this seeds the header control and
   * the user's live choice takes over from there (state, not config — the same
   * split as `filter` vs `filterFacets`). Read the live value off
   * CollectionFrame's `onQueryChange`. */
  sortBy: string
  sortDir: "asc" | "desc"
  /** Show a USER-facing sort control in the header (the `sortOptions` below),
   * on the same row as search and the filters. Separate from `sortBy`/`sortDir`,
   * which only declare where it starts. */
  sortable: boolean
  /** The fields offered when `sortable` is on. Past SEARCHABLE_THRESHOLD the
   * picker searches itself. Empty = no control even if `sortable` is true. */
  sortOptions: SortOption[]
  /** Cap the TOTAL rows shown (null = no cap). Separate from itemsPerPage. */
  limit: number | null
  /** Rows per page (null = no pagination, show everything). */
  itemsPerPage: number | null
  /** On page change, scroll the collection's top back into view. */
  scrollToTop: boolean
  searchable: boolean
  /** Placeholder shown inside the search box. */
  searchPlaceholder: string
  /** Show a runtime, USER-facing filter bar (the `filterFacets` below). Separate
   * from `searchable` and from the builder `filter` — Glide calls this out. */
  userFilter: boolean
  /** The facets rendered when `userFilter` is on (a dropdown or chips each). */
  filterFacets: FilterFacet[]
  /** Show a live "Showing X of Y" count in the header. */
  showCount: boolean
  emptyText: string
  /** An OPTIONAL concept glyph above the empty sentence — a lucide name, the same
   * shape `TabItem.icon` takes as a name. Defaults to none, so a caller that sets
   * nothing renders exactly what it rendered before.
   *
   * WHY IT IS HERE. A lone line of grey text in the middle of a dashed box reads
   * as a screen that FAILED, not one with nothing on it yet — and that is
   * precisely the screen every brand-new team sees on every page. Hosts that
   * compose their own empty states already lead with a glyph for this reason; a
   * recipe-driven collection had no way to say it, and writing the glyph into
   * `emptyText` would put a pictograph inside a sentence, which is the one shape
   * a host style guide is most likely to forbid. */
  emptyIcon?: string | null
  /** Header arrangement. "stacked" (default) = a title+search row with the filter
   * bar on its own line below; "inline" = title, search, and filters together on
   * one wrapping row. */
  headerLayout: "stacked" | "inline"
}

export const defaultCollectionConfig: CollectionConfig = {
  ...defaultBaseConfig,
  dataSource: "",
  title: "",
  filter: [],
  sortBy: "",
  sortDir: "asc",
  sortable: false,
  sortOptions: [],
  limit: null,
  itemsPerPage: null,
  scrollToTop: true,
  searchable: true,
  searchPlaceholder: "Search…",
  userFilter: false,
  filterFacets: [],
  showCount: true,
  emptyText: "Nothing here yet.",
  emptyIcon: null,
  headerLayout: "stacked",
}

/* ----------------------------- text overflow ----------------------------- */
