// THE QUERY ENGINE — a structured request in, SQL out, and nothing in between
// that a caller wrote.
//
// The grammar it speaks lives in `@shared/workers/query-grammar` (read its
// header first: it says WHY there are two tools here instead of fifty). This
// file is the half that touches the database, and its whole job is the sentence
// the owner's ruling turns on:
//
//   THE MODEL FILLS IN A REQUEST. THIS CODE BUILDS THE STATEMENT.
//
// Three separate promises hold that up, and they are worth naming apart because
// breaking any one of them would look fine in a test that only checked the
// others:
//
//   1. THE TABLE comes from `QUERY_MODULES` and from nowhere else. A module name
//      that is not a key in that map is a 400 naming what the caller could have
//      asked for instead. There is no deny-list to keep current — `internal_rates`
//      is not queryable because it was never declared, not because something
//      remembered to forbid it (R24).
//   2. EVERY COLUMN comes from the module's own declared `fields`. A field name
//      that does not resolve is a 400. So `field` can only ever be one of a
//      fixed set of literals written in our own source.
//   3. EVERY VALUE is a BOUND PARAMETER. Not escaped, not interpolated — bound.
//      The one addition is the LIKE needle, which is bound AND passed through
//      `likeLiteral` first, because binding stops a value becoming SQL and does
//      nothing at all to stop it becoming a PATTERN.
//
// R14: the rows path PAGES by key (the collections behind it grow), and the
// grouped path is capped at GROUP_CAP with the truncation reported honestly.
// R20: the door validates every query parameter at the boundary; the clause
// shapes inside `where` are validated here, positionally, field by field.

import { d1Query, likeLiteral, type D1Rest } from "@shared/workers/d1-rest"
import { GuardError, type MemberGuard } from "@shared/workers/gating"
import { countCollection } from "@shared/workers/count"
import { D1_MAX_BOUND_PARAMS, LIST_HARD_CAP } from "@shared/workers/limits"
import { decodeCursor, keysetAfter, PAGE_SIZE, toPage, type Page } from "@shared/workers/paging"
import { orderBy, resolveOrdering, type SortMenu } from "@shared/workers/sorting"
import { TEXT_LIMITS } from "@shared/workers/validate"
import {
  LIST_OPS,
  QUERY_OPS,
  queryField,
  VALUELESS_OPS,
  type QueryField,
  type QueryModule,
  type QueryOp,
} from "@shared/workers/query-grammar"

type Row = Record<string, unknown>
type Param = string | number | null

/** HOW MANY GROUPS A GROUPED ANSWER MAY CARRY (R14: a hard cap, said at the
 * query). A grouped read is bounded by the number of DISTINCT values, not by the
 * number of rows, so 200 is far above any real facet here — seven ticket
 * statuses, ten sprint types, two dozen clients — and still a ceiling rather
 * than a hope. Past it the answer says `groupsTruncated`, because a truncated
 * tally that looks complete is worse than no tally at all. */
export const GROUP_CAP = 200

/** HOW MANY VALUES ONE FILTER MAY CARRY. Every value is a bound parameter and D1
 * refuses a statement binding more than D1_MAX_BOUND_PARAMS of them, so an
 * uncapped list is not a big query, it is a 500. Well under the ceiling, with
 * room for the rest of the statement's own parameters. */
export const VALUES_PER_CLAUSE = 40

/** HOW MANY FILTERS ONE QUERY MAY CARRY. The same ceiling seen from the other
 * side: filters times values must stay under what one statement may bind. */
export const MAX_CLAUSES = 12

/* ------------------------------ the parsed shape ----------------------------- */

/** One filter. `fields` is a LIST because a filter may name several — "search
 * the reference, the title AND the description" is one question, and the ONE
 * thing the old list doors did that a per-field grammar could not say. Any of
 * them matching satisfies the filter; the filters themselves still AND. */
export type ParsedClause = { fields: QueryField[]; op: QueryOp; values: Param[] }

export type ParsedQuery = {
  where: ParsedClause[]
  groupBy: QueryField[]
  select: QueryField[]
  /** "How many?" and nothing else — the total, with no rows at all.
   *
   * It earned its place on real data: "how many tickets did we resolve in July"
   * came back with the exact total AND fifty ticket rows, 23,250 characters of
   * them, because a paged door always hands back a page. The number is the whole
   * answer to that question, so the rows are 6,000 tokens the model must read to
   * ignore — which is the same waste, one layer along, that this door was built
   * to end. */
  countOnly: boolean
  sort: string
  dir: string
  cursor: string | null
}

/* -------------------------------- validation --------------------------------- */

function bad(message: string): never {
  throw new GuardError(400, "invalid_query", message)
}

/** A DATE BOUND, widened to the edge of the day it names.
 *
 * "resolved in July" is `between 2026-07-01 and 2026-07-31`, and a timestamp
 * column holds `2026-07-31T16:04:00.000Z`, which sorts AFTER the bare date — so
 * the honest-looking filter silently drops the last day of every range. The
 * upper edge of an inclusive comparison therefore becomes the last instant of
 * the day it names, and the lower edge of an EXCLUSIVE one (`gt`) does too, so
 * "after the 1st" means after the 1st rather than after midnight on it.
 *
 * A value that already carries a time is left exactly as it was: the caller was
 * precise, and widening it would be answering a different question. Columns that
 * store a bare date (`due_on`, `starts_on`) compare correctly against the widened
 * bound too, because '2026-07-31' sorts before '2026-07-31T23:59:59.999Z'. */
const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/
function dateBound(value: string, edge: "start" | "end"): string {
  if (!BARE_DATE.test(value)) return value
  return edge === "end" ? `${value}T23:59:59.999Z` : value
}

/** Which edge of the day each comparison wants. `gte` and `lt` take the START of
 * the day (at or after it begins; strictly before it begins); `gt` and `lte`
 * take the END (after it finishes; at or before it finishes). */
function edgeFor(op: QueryOp, index: number): "start" | "end" {
  if (op === "gte" || op === "lt") return "start"
  if (op === "gt" || op === "lte") return "end"
  // between: [lower, upper]
  return index === 0 ? "start" : "end"
}

/** One value, checked against the field's declared type and turned into
 * something a statement may bind. POSITIONAL, in the R20 sense: the value sits
 * inside a real type check on every branch — `typeof`, a literal comparison, a
 * membership test on a declared list — never a truthiness guard and never a cast. */
function checkValue(field: QueryField, op: QueryOp, raw: unknown, index: number): Param {
  if (field.type === "boolean") {
    if (typeof raw !== "boolean") bad(`"${field.name}" takes true or false.`)
    return raw === true ? 1 : 0
  }
  if (field.type === "number") {
    if (typeof raw !== "number" || !Number.isFinite(raw)) bad(`"${field.name}" takes a number.`)
    return raw as number
  }
  if (typeof raw !== "string") bad(`"${field.name}" takes text.`)
  const text = raw as string
  if (text.length > TEXT_LIMITS.short)
    bad(`A value for "${field.name}" is too long (max ${TEXT_LIMITS.short} characters).`)
  const value = text.trim()
  if (!value) bad(`"${field.name}" was given an empty value.`)
  // A FIXED enum is checked against its own list, so a model guessing "open" at
  // a seven-value lifecycle is told the seven rather than handed nothing back. A
  // TEAM-EDITED vocabulary is NOT checked here: those words belong to the team
  // and change without a deploy, so the honest answer to a wrong one is no rows.
  if (field.type === "enum" && field.values && op !== "contains" && !field.values.includes(value))
    bad(`"${value}" isn't a ${field.name}. It is one of: ${field.values.join(", ")}.`)
  if (field.type === "date") return dateBound(value, edgeFor(op, index))
  return value
}

/** HOW MANY FIELDS ONE FILTER MAY SEARCH AT ONCE. Three is what the widest list
 * door searched (an account by name, code or email); five leaves room without
 * letting one filter turn into a scan of a whole row. */
const FIELDS_PER_CLAUSE = 5

/** One filter, checked end to end. */
function parseClause(mod: QueryModule, raw: unknown): ParsedClause {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    bad("Each filter must be an object like {field, op, value}.")
  const clause = raw as Record<string, unknown>
  // ONE FIELD, OR SEVERAL. Several means "any of these matches", which is what a
  // search box is: the accounts door looks in the name, the code and the email
  // and calls the three of them `q`. Without this the grammar could express
  // every filter those doors took except the one people actually use.
  const named = Array.isArray(clause.field) ? (clause.field as unknown[]) : [clause.field]
  if (!named.length) bad("Each filter needs a `field` name.")
  if (named.length > FIELDS_PER_CLAUSE)
    bad(`A filter may search at most ${FIELDS_PER_CLAUSE} fields at once.`)
  const fields = named.map((n) => {
    if (typeof n !== "string") bad("Each filter needs a `field` name.")
    const f = queryField(mod, n as string)
    if (!f) bad(`"${String(n)}" isn't a field here. Call describe_module to see what is.`)
    return f as QueryField
  })
  if (typeof clause.op !== "string" || !(QUERY_OPS as readonly string[]).includes(clause.op))
    bad(`"${String(clause.op)}" isn't an operator. Use one of: ${QUERY_OPS.join(", ")}.`)
  const op = clause.op as QueryOp
  const on = fields[0]

  if (VALUELESS_OPS.includes(op)) return { fields, op, values: [] }

  const given = clause.value
  // `contains` takes one needle OR a list of them (match any) — the one shape
  // that lets "flu clinic, confia and HORSt" be a single filter.
  const many = Array.isArray(given)
  if (LIST_OPS.includes(op) && !many) bad(`"${op}" on "${on.name}" takes a list of values.`)
  if (!LIST_OPS.includes(op) && op !== "contains" && many)
    bad(`"${op}" on "${on.name}" takes a single value.`)
  const list = many ? (given as unknown[]) : [given]
  if (list.length === 0) bad(`"${on.name}" was given an empty list.`)
  if (op === "between" && list.length !== 2)
    bad(`"between" on "${on.name}" takes exactly two values: from and to.`)
  if (list.length > VALUES_PER_CLAUSE)
    bad(`"${on.name}" was given ${list.length} values; at most ${VALUES_PER_CLAUSE} fit one filter.`)
  return { fields, op, values: list.map((v, i) => checkValue(on, op, v, i)) }
}

/** The whole request, validated against the module. `where`, `groupBy` and
 * `fields` arrive already parsed from JSON (the door does that parse, capped, so
 * a malformed request is a clean 400 at the boundary). */
export function parseQuery(
  mod: QueryModule,
  input: {
    where?: unknown
    groupBy?: unknown
    fields?: unknown
    countOnly?: unknown
    sort?: string
    dir?: string
    cursor?: string | null
  }
): ParsedQuery {
  const whereRaw = input.where === undefined ? [] : input.where
  if (!Array.isArray(whereRaw)) bad("`where` must be a list of filters.")
  const list = whereRaw as unknown[]
  if (list.length > MAX_CLAUSES)
    bad(`That is ${list.length} filters; at most ${MAX_CLAUSES} fit one query.`)
  const where = list.map((c) => parseClause(mod, c))
  const bound = where.reduce((n, c) => n + c.values.length * Math.max(1, c.fields.length), 0)
  // Every value is bound, and D1 refuses a statement that binds more than its
  // ceiling. Eight are left over for the cursor's own comparisons and the limit.
  if (bound > D1_MAX_BOUND_PARAMS - 8)
    bad(`That query carries ${bound} values, which is more than one statement may bind.`)

  const fieldList = (raw: unknown, what: string): QueryField[] => {
    if (raw === undefined) return []
    if (!Array.isArray(raw)) bad(`\`${what}\` must be a list of field names.`)
    return (raw as unknown[]).map((n) => {
      if (typeof n !== "string") bad(`\`${what}\` must be a list of field names.`)
      const f = queryField(mod, n as string)
      if (!f) bad(`"${String(n)}" isn't a field here. Call describe_module to see what is.`)
      return f as QueryField
    })
  }
  const groupBy = fieldList(input.groupBy, "groupBy")
  if (groupBy.length > 2)
    bad("Group by at most two fields — a deeper tally is a report, not a question.")
  const asked = fieldList(input.fields, "fields")
  // THE DEFAULT PROJECTION LEAVES THE BULKY COLUMNS OUT — see `bulky` in the
  // grammar for why: one long column silently costs the caller the rows under it.
  const select = asked.length ? asked : mod.fields.filter((f) => !f.bulky)

  if (input.countOnly !== undefined && typeof input.countOnly !== "boolean")
    bad("`countOnly` is true or false.")
  return {
    where,
    groupBy,
    select,
    countOnly: input.countOnly === true,
    sort: input.sort ?? "",
    dir: input.dir ?? "",
    cursor: input.cursor ?? null,
  }
}

/* --------------------------------- the SQL ----------------------------------- */

const holes = (n: number): string => Array.from({ length: n }, () => "?").join(", ")

/** Which field types compare WITHOUT regard to case. Text and ids: a reference
 * is the same reference in either case, and `contains` has always agreed. An
 * `enum` is excluded because its values are checked against a declared list at
 * the boundary, and a date or a number has no case to fold. */
const foldsCase = (field: QueryField): boolean => field.type === "text" || field.type === "id"

/** An exact comparison, folded where case should not decide it. `LOWER()` on the
 * column costs the index on that column — accepted deliberately: every one of
 * these reads is already bounded, and a lookup that silently misses is worse
 * than one that scans. */
const folded = (field: QueryField, col: string, op: string, rhs: string): string =>
  foldsCase(field) ? `LOWER(${col}) ${op} ${rhs}` : `${col} ${op} ${rhs}`

const foldValues = (field: QueryField, values: Param[]): Param[] =>
  foldsCase(field) ? values.map((v) => (typeof v === "string" ? v.toLowerCase() : v)) : values

/** One filter, as SQL plus its bound parameters.
 *
 * `field.column` is a literal from our own source (promise 2 in the header);
 * every `?` below is filled from `values`, which have been through `checkValue`
 * (promise 3). A reference field additionally resolves NAMES through a subquery
 * over the referenced module's own table — also a literal, also from the map. */
function clauseSql(
  c: ParsedClause,
  refs: Record<string, QueryModule>
): { sql: string; params: Param[] } {
  // SEVERAL FIELDS = OR. Each half is built by exactly the same code as a
  // one-field filter, so a multi-field search cannot mean something a
  // single-field one does not.
  if (c.fields.length > 1) {
    const parts = c.fields.map((f) => oneFieldSql(f, c, refs))
    return {
      sql: `(${parts.map((p) => p.sql).join(" OR ")})`,
      params: parts.flatMap((p) => p.params),
    }
  }
  return oneFieldSql(c.fields[0], c, refs)
}

function oneFieldSql(
  field: QueryField,
  c: ParsedClause,
  refs: Record<string, QueryModule>
): { sql: string; params: Param[] } {
  const col = `t.${field.column}`
  const ref = field.ref ? refs[field.ref] : undefined

  switch (c.op) {
    case "isNull":
      return { sql: `${col} IS NULL`, params: [] }
    case "notNull":
      return { sql: `${col} IS NOT NULL`, params: [] }
    case "gt":
      return { sql: `${col} > ?`, params: c.values }
    case "gte":
      return { sql: `${col} >= ?`, params: c.values }
    case "lt":
      return { sql: `${col} < ?`, params: c.values }
    case "lte":
      return { sql: `${col} <= ?`, params: c.values }
    case "between":
      return { sql: `(${col} >= ? AND ${col} <= ?)`, params: c.values }
    case "contains": {
      // Bound AND escaped: binding stops a needle becoming SQL, `likeLiteral`
      // stops it becoming a PATTERN (an alternating %-and-letter needle costs
      // the worker exponential time over the whole table).
      const needles = c.values.map((v) => `%${likeLiteral(String(v)).toLowerCase()}%`)
      if (!ref)
        return {
          sql: `(${needles.map(() => `LOWER(${col}) LIKE ? ESCAPE '\\'`).join(" OR ")})`,
          params: needles,
        }
      // On a REFERENCE field the needle is a substring of the referenced
      // record's NAME — "the tickets from flu clinic", without knowing its id.
      const byName = needles.map(() => `LOWER(r.${ref.labelColumn}) LIKE ? ESCAPE '\\'`).join(" OR ")
      return { sql: `${col} IN (SELECT r.id FROM ${ref.table} r WHERE ${byName})`, params: needles }
    }
    case "in":
    case "notIn": {
      const not = c.op === "notIn"
      // CASE DOES NOT DECIDE WHETHER A RECORD EXISTS. `contains` has always
      // compared without it; an exact match did not, so a model that lowercased
      // a reference it had just been given got nothing back — measured on
      // staging with BERG2-T0002 on 29 Aug 2026. One rule for all string
      // comparison rather than two, and the fold is the same one either side.
      const plain = folded(field, col, not ? "NOT IN" : "IN", `(${holes(c.values.length)})`)
      const vals = foldValues(field, c.values)
      if (!ref) return { sql: plain, params: vals }
      // An id OR the referenced record's exact name, so a caller holding the
      // name and not the id is not made to look it up first.
      const byName = `${col} ${not ? "NOT IN" : "IN"} (SELECT r.id FROM ${ref.table} r WHERE LOWER(r.${ref.labelColumn}) IN (${holes(c.values.length)}))`
      const lowered = c.values.map((v) => String(v).toLowerCase())
      return {
        sql: not ? `(${plain} AND ${byName})` : `(${plain} OR ${byName})`,
        params: [...vals, ...lowered],
      }
    }
    default: {
      const not = c.op === "ne"
      const plain = folded(field, col, not ? "<>" : "=", "?")
      const vals = foldValues(field, c.values)
      if (!ref) return { sql: plain, params: vals }
      const byName = `${col} ${not ? "NOT IN" : "IN"} (SELECT r.id FROM ${ref.table} r WHERE LOWER(r.${ref.labelColumn}) = ?)`
      return {
        sql: not ? `(${plain} AND ${byName})` : `(${plain} OR ${byName})`,
        params: [vals[0], String(c.values[0]).toLowerCase()],
      }
    }
  }
}

/** The WHERE, as one fragment. An empty filter list is `1 = 1` rather than an
 * empty string, so every statement below concatenates without having to know. */
function whereSql(
  q: ParsedQuery,
  refs: Record<string, QueryModule>
): { sql: string; params: Param[] } {
  if (!q.where.length) return { sql: "1 = 1", params: [] }
  const parts = q.where.map((c) => clauseSql(c, refs))
  return { sql: parts.map((p) => p.sql).join(" AND "), params: parts.flatMap((p) => p.params) }
}

/** The sort menu a module offers: every declared field, ordered by its own
 * column. Built FROM the grammar rather than written beside it, so a field
 * cannot be filterable and un-orderable. Dates land newest-first; the rest A→Z. */
function sortMenu(mod: QueryModule): SortMenu<Row> {
  const menu: SortMenu<Row> = {}
  for (const f of mod.fields)
    menu[f.name] = {
      expr: `t.${f.column}`,
      dir: f.type === "date" ? "desc" : "asc",
      key: (row) => {
        const v = row[f.column]
        return v === null || v === undefined ? null : String(v)
      },
    }
  return menu
}

/* ------------------------------- running it ---------------------------------- */

export type QueryGroup = { key: Record<string, unknown>; label?: string | null; count: number }

/** A value the caller filtered by that names NOTHING here.
 *
 * WHY THIS RIDES THE ANSWER. Asked "how many open tickets from flu clinic,
 * confia and HORSt combined", the door answered 97 — correctly, across the two
 * clients that exist — and the assistant then wrote "97 open tickets for
 * FluClinic, Confia and HORSt combined", because those were the words it had
 * been given. The number was right and the sentence was a lie: it told the
 * reader a third client contributed to a total it is missing from.
 *
 * A filter value that matched no entity is a FACT ABOUT THE ANSWER, not a
 * detail of how it was computed, and dropping it silently is how a correct
 * number becomes a wrong statement. So it travels WITH the total, in the same
 * object, the way R23 makes `found`, `passages` and `citations` one decision —
 * a caller cannot receive the count without also receiving what it excludes. */
export type Unmatched = { field: string; values: string[] }

export type QueryAnswer = {
  page: Page<Row>
  total: number
  groups: QueryGroup[] | null
  groupsTruncated: boolean
  /** the filter values that named nothing — empty when everything resolved */
  unmatched: Unmatched[]
  sort: string
  dir: "asc" | "desc"
}

/** Run the request. One database read for the rows (or for the groups), one for
 * the exact total, plus at most one bounded label lookup when a grouped answer
 * names records rather than values. */
export async function runQuery(
  cfg: D1Rest,
  guard: MemberGuard,
  mod: QueryModule,
  q: ParsedQuery,
  refs: Record<string, QueryModule>
): Promise<QueryAnswer> {
  const where = whereSql(q, refs)
  // WHAT NAMED NOTHING — worked out alongside the count rather than after it, so
  // no return path below can hand back a total without it.
  const unmatchedPromise = findUnmatched(cfg, guard, mod, q, refs)
  // R14/R16 — the exact total, bounded by the ONE counting ceiling, over exactly
  // the question the rows themselves answer.
  const totalPromise = countCollection(
    cfg,
    guard.databaseId,
    `SELECT t.id FROM ${mod.table} t WHERE ${where.sql}`,
    where.params
  )

  if (q.groupBy.length) {
    const cols = q.groupBy.map((f) => `t.${f.column}`)
    // R14 — a HARD CAP, said at the query: GROUP_CAP + 1, so "exactly at the
    // cap" and "past it" are told apart without a second read.
    const rows = await d1Query<Row>(
      cfg,
      guard.databaseId,
      `SELECT ${cols.join(", ")}, COUNT(*) AS n FROM ${mod.table} t
        WHERE ${where.sql}
        GROUP BY ${cols.join(", ")}
        ORDER BY n DESC
        LIMIT ${GROUP_CAP + 1}`,
      where.params
    )
    const truncated = rows.length > GROUP_CAP
    const groups: QueryGroup[] = (truncated ? rows.slice(0, GROUP_CAP) : rows).map((r) => ({
      key: Object.fromEntries(q.groupBy.map((f) => [f.name, r[f.column] ?? null])),
      count: Number(r.n ?? 0),
    }))
    await labelGroups(cfg, guard, q.groupBy, groups, refs)
    return {
      page: { rows: [], hasMore: false, nextCursor: null },
      total: await totalPromise,
      groups,
      groupsTruncated: truncated,
      unmatched: await unmatchedPromise,
      sort: "",
      dir: "desc",
    }
  }

  // "HOW MANY?" — the count is already in flight, so the answer is that and
  // nothing else. No ordering is resolved and no page is read, because a caller
  // who asked for a number did not ask for fifty rows to skim past it.
  if (q.countOnly)
    return {
      page: { rows: [], hasMore: false, nextCursor: null },
      total: await totalPromise,
      groups: null,
      groupsTruncated: false,
      unmatched: await unmatchedPromise,
      sort: "",
      dir: "desc",
    }

  const ordering = resolveOrdering(sortMenu(mod), mod.defaultSort, q.sort, q.dir)
  const after = keysetAfter(decodeCursor(q.cursor, ordering.sig), ordering.expr, ordering.dir, "t.id")
  // R14 — this collection GROWS, so it pages by key rather than stopping at a
  // cap; PAGE_SIZE + 1, where the spare row is how `toPage` learns there is
  // more. LIST_HARD_CAP is named as the ceiling the page size sits under.
  const limit = Math.min(PAGE_SIZE, LIST_HARD_CAP)
  const cols = [...new Set(["t.id", ...q.select.map((f) => `t.${f.column}`)])]
  const rows = await d1Query<Row>(
    cfg,
    guard.databaseId,
    `SELECT ${cols.join(", ")} FROM ${mod.table} t
      WHERE ${where.sql}${after.sql ? ` AND ${after.sql}` : ""}
      ${orderBy(ordering, "t.id")}
      LIMIT ${limit + 1}`,
    [...where.params, ...after.params]
  )
  return {
    page: toPage(rows, limit, (r) => [ordering.key(r), String(r.id)], ordering.sig),
    total: await totalPromise,
    groups: null,
    groupsTruncated: false,
    unmatched: await unmatchedPromise,
    sort: ordering.name,
    dir: ordering.dir,
  }
}

/** WHICH OF THE CALLER'S OWN WORDS NAMED NOTHING.
 *
 * Two kinds of filter value can silently match nothing, and both produce a
 * confident wrong sentence rather than an error:
 *   · a REFERENCE by name — "HORSt" when no client is called that;
 *   · a HANDLE on one record — an id or a human reference that names none;
 *   · a TEAM-EDITED vocabulary value — "Bug" when this team calls them Defects.
 * (A fixed enum cannot: `checkValue` refuses an unknown status outright and
 * names the seven it could have been. That is the same honesty, one step
 * earlier, where the answer is knowable without asking the database.)
 *
 * One small read per eligible filter, and only for the ops where a value is a
 * NAME rather than a range: nothing here runs for a date or a number. */
async function findUnmatched(
  cfg: D1Rest,
  guard: MemberGuard,
  mod: QueryModule,
  q: ParsedQuery,
  refs: Record<string, QueryModule>
): Promise<Unmatched[]> {
  const NAME_OPS: QueryOp[] = ["eq", "in", "contains"]
  const out: Unmatched[] = []
  for (const c of q.where) {
    if (!NAME_OPS.includes(c.op) || !c.values.length) continue
    const needles = c.values.map((v) => String(v))
    for (const field of c.fields) {
      const ref = field.ref ? refs[field.ref] : undefined
      if (ref) {
        // The SAME predicate the filter itself used, asked of the referenced
        // table alone — so "matched nothing" here means exactly what it means
        // there. Bounded: the caller's own value list is already capped.
        const rows = await d1Query<{ label: string | null }>(
          cfg,
          guard.databaseId,
          `SELECT DISTINCT ${ref.labelColumn} AS label FROM ${ref.table}
            WHERE ${needles.map(() => `LOWER(${ref.labelColumn}) LIKE ? ESCAPE '\\'`).join(" OR ")}
              OR id IN (${holes(needles.length)})
            LIMIT ${VALUES_PER_CLAUSE * 4}`,
          [...needles.map((n) => `%${likeLiteral(n).toLowerCase()}%`), ...needles]
        )
        const labels = rows.map((r) => (r.label ?? "").toLowerCase())
        const missed = needles.filter((n) => !labels.some((l) => l.includes(n.toLowerCase())))
        if (missed.length) out.push({ field: field.name, values: missed })
        continue
      }
      // A HANDLE ON ONE RECORD — its id, or its human reference. A zero here is
      // "no such thing", not "no rows met your criteria", and the difference is
      // the difference between a correction and an answer. This was the hole the
      // client case did not cover: the assistant looked ticket BERG2-T0002 up by
      // the wrong handle, got a bare zero, and said the ticket did not exist one
      // turn after naming it.
      if (field.identity) {
        const exact = c.op !== "contains"
        const rows = await d1Query<{ v: string | null }>(
          cfg,
          guard.databaseId,
          `SELECT DISTINCT ${field.column} AS v FROM ${mod.table}
            WHERE ${needles
              .map(() =>
                exact
                  ? `LOWER(${field.column}) = ?`
                  : `LOWER(${field.column}) LIKE ? ESCAPE '\\'`
              )
              .join(" OR ")}
            LIMIT ${VALUES_PER_CLAUSE * 4}`,
          needles.map((n) => (exact ? n.toLowerCase() : `%${likeLiteral(n).toLowerCase()}%`))
        )
        const found = rows.map((r) => (r.v ?? "").toLowerCase())
        const missed = needles.filter((n) =>
          exact ? !found.includes(n.toLowerCase()) : !found.some((f) => f.includes(n.toLowerCase()))
        )
        if (missed.length) out.push({ field: field.name, values: missed })
        continue
      }
      // A word from the team's own vocabulary. Only the EXACT ops: `contains`
      // on one of these is a substring question and a partial word is not a
      // mistake.
      if (!field.vocabulary || c.op === "contains") continue
      const rows = await d1Query<{ value: string }>(
        cfg,
        guard.databaseId,
        `SELECT value FROM selectable_data WHERE type = ? AND LOWER(value) IN (${holes(needles.length)})`,
        [field.vocabulary, ...needles.map((n) => n.toLowerCase())]
      )
      const known = new Set(rows.map((r) => r.value.toLowerCase()))
      const missed = needles.filter((n) => !known.has(n.toLowerCase()))
      if (missed.length) out.push({ field: field.name, values: missed })
    }
  }
  return out
}

/** A grouped answer over a REFERENCE field comes back labelled — "Bergman S.A.",
 * not a ULID. One bounded read over the referenced module's own table, and only
 * for the FIRST group-by field: a label for a second dimension would be a join
 * nobody asked for. */
async function labelGroups(
  cfg: D1Rest,
  guard: MemberGuard,
  groupBy: QueryField[],
  groups: QueryGroup[],
  refs: Record<string, QueryModule>
): Promise<void> {
  const first = groupBy[0]
  const ref = first?.ref ? refs[first.ref] : undefined
  if (!ref) return
  const ids = [
    ...new Set(groups.map((g) => g.key[first.name]).filter((v): v is string => typeof v === "string")),
  ]
  if (!ids.length) return
  const names = new Map<string, string>()
  // D1 refuses a statement binding more than D1_MAX_BOUND_PARAMS values and
  // GROUP_CAP sits above that, so the lookup is batched, never one long IN list.
  const size = D1_MAX_BOUND_PARAMS - 2
  for (let i = 0; i < ids.length; i += size) {
    const batch = ids.slice(i, i + size)
    const rows = await d1Query<{ id: string; label: string | null }>(
      cfg,
      guard.databaseId,
      `SELECT id, ${ref.labelColumn} AS label FROM ${ref.table} WHERE id IN (${holes(batch.length)})`,
      batch
    )
    for (const r of rows) names.set(r.id, r.label ?? "")
  }
  for (const g of groups) {
    const id = g.key[first.name]
    g.label = typeof id === "string" ? names.get(id) ?? null : null
  }
}
