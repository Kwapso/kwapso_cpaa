// Collection data operations — the pure, testable logic behind every collection.
// Given rows + a CollectionConfig (+ the live search text and page), it applies,
// in order: the total `limit` → `filter` rules → search → sort → pagination, and
// returns the current page plus the totals the UI needs. Keeping this here (not
// inside a component) means it's deterministic and unit-tested.

import { type CollectionConfig, evaluateRules, type Rule } from "./config"
import { parseRange } from "./range"

export interface CollectionSlice<T> {
  /** Rows for the current page (what you render). */
  visible: T[]
  /** All rows after limit + filter + search + sort, before pagination. */
  filtered: T[]
  /** filtered.length — drives the "Showing X of Y" count. */
  total: number
  /** Number of pages. */
  pageCount: number
  /** The current page, clamped into range. */
  page: number
}

/** Derive the distinct, sorted values of a field from the data — used by the
 * filter bar when a facet doesn't declare its own `options`. Pure + testable. */
export function facetOptions<T>(
  data: T[],
  field: string
): { value: string; label: string }[] {
  const seen = new Set<string>()
  const out: { value: string; label: string }[] = []
  for (const row of data) {
    const raw = (row as Record<string, unknown>)[field]
    if (raw == null || raw === "") continue
    const v = String(raw)
    if (!seen.has(v)) {
      seen.add(v)
      out.push({ value: v, label: v })
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label))
}

export function selectRows<T>(
  data: T[],
  config: CollectionConfig,
  opts: {
    query?: string
    searchKeys?: (keyof T)[]
    page?: number
    /** User-facing facet selections: { field: chosenValue }. Each becomes an
     * `is` Rule ANDed with the builder `filter` in the SAME filter step. */
    facetValues?: Record<string, string>
  } = {}
): CollectionSlice<T> {
  const { query = "", searchKeys = [], page = 0, facetValues = {} } = opts
  const get = (row: T, key: PropertyKey) =>
    (row as Record<PropertyKey, unknown>)[key]

  // 1) cap the TOTAL number of rows
  let rows = config.limit != null ? data.slice(0, config.limit) : data.slice()

  // 2) filter: builder rules + user-facet rules, ANDed, via the SAME engine.
  // A `control:"range"` facet carries "min..max" and compiles to INCLUSIVE
  // gte/lte rules; every other facet is a plain `is`. The facet's control is
  // looked up (not guessed from the value's shape) so a string field that
  // happens to contain ".." is still matched exactly.
  const facetRules: Rule[] = Object.entries(facetValues)
    .filter(([, v]) => v != null && v !== "")
    .flatMap(([field, value]): Rule[] => {
      const facet = config.filterFacets?.find((f) => f.field === field)
      if (facet?.control !== "range")
        return [{ source: "row", field, op: "is", value }]
      const { min, max } = parseRange(value)
      const out: Rule[] = []
      if (min != null)
        out.push({ source: "row", field, op: "gte", value: String(min) })
      if (max != null)
        out.push({ source: "row", field, op: "lte", value: String(max) })
      return out
    })
  const allFilters: Rule[] = [...(config.filter ?? []), ...facetRules]
  if (allFilters.length > 0) {
    rows = rows.filter((row) =>
      evaluateRules(allFilters, {
        row: row as Record<string, unknown>,
        user: {},
        app: {},
      })
    )
  }

  // 3) free-text search over the named keys
  const q = query.trim().toLowerCase()
  if (config.searchable && q && searchKeys.length > 0) {
    rows = rows.filter((row) =>
      searchKeys.some((k) =>
        String(get(row, k) ?? "")
          .toLowerCase()
          .includes(q)
      )
    )
  }

  // 4) sort by a column (numbers compare numerically, else locale string compare)
  if (config.sortBy) {
    const dir = config.sortDir === "desc" ? -1 : 1
    rows = rows.slice().sort((a, b) => {
      const av = get(a, config.sortBy)
      const bv = get(b, config.sortBy)
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === "number" && typeof bv === "number")
        return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  }

  const filtered = rows
  const per = config.itemsPerPage ?? filtered.length
  const pageCount = per > 0 ? Math.max(1, Math.ceil(filtered.length / per)) : 1
  const current = Math.min(Math.max(page, 0), pageCount - 1)
  const visible = config.itemsPerPage
    ? filtered.slice(current * per, current * per + per)
    : filtered

  return { visible, filtered, total: filtered.length, pageCount, page: current }
}
