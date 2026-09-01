// THE RELATIONSHIP MAP'S DATA LAYER — one record's neighbourhood, and nothing
// larger.
//
// ── WHY A NEIGHBOURHOOD AND NEVER THE WHOLE GRAPH ───────────────────────────
//
// The base holds a few thousand records. Drawn at once they are a hairball: no
// reader can find anything in it, every frame costs the whole set, and the one
// question a map is actually asked — "what is this connected to?" — is the one a
// hairball answers worst. So the door takes a record and hands back what sits one
// step away from it, and the screen expands from there as somebody pulls. That is
// R14's bounded read arriving as a product decision rather than as a cap bolted
// on: a neighbourhood is bounded BY CONSTRUCTION, and the cap below is the belt.
//
// ── THE EDGES ARE COLUMNS SOMEBODY ALREADY WROTE ────────────────────────────
//
// Nothing here infers a relationship. Every edge is a foreign key this app has
// always stored — a ticket's client, a story's ticket, a process's app — read as
// what it is. No AI, no similarity, no guessing. The one exception is named and
// argued where it is built (`meetingPeople`), because a meeting's guest list is
// JSON rather than a column and it is the single most useful edge on the map.
//
// ── AND THE FENCE, WHICH IS THE PART A GRAPH GETS WRONG ─────────────────────
//
// A MAP LEAKS BY AGGREGATION EVEN WHEN EVERY NODE IS FENCED, and this is the
// reasoning R24 already wrote down about numbers, arriving at relationships. Each
// record on its own is compartment-fenced and the fences work. An EDGE is a fact
// about TWO records at once, and it can disclose something neither endpoint
// states: a contact in one client's compartment sharing a meeting with a contact
// in another says that those two clients met, which is precisely what SCOPE's
// account fence exists to keep apart.
//
// So an edge is drawn only when the caller may read BOTH ENDS. Not greyed, not
// counted, not shown as "1 more" — ABSENT, because a count of things you may not
// see is itself the fact being withheld. `readableTables` is that clause, and it
// is applied to the far end of every edge as well as to the near one.
//
// AGENCY ONLY, DELIBERATELY, AND SAID OUT LOUD. Every door on this refuses a
// portal caller. The client portal has its own account fence with its own suite,
// and an edge rule proved on the agency side is NOT inherited there — it would
// have to be proved again, against a different gateway and a different fence. A
// map is a delight feature; it is not worth answering a fence question nobody has
// asked yet. When somebody wants this in the portal, that is a scoped piece of
// work with its own tests, and this comment is the reason it is not free.

import { d1Query, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { hasRight, type MemberGuard } from "@shared/workers/gating"
import { countCollection } from "@shared/workers/count"
import { ACTIVITY_GATE_MAP } from "@shared/rules/registry"

/** HOW MANY NEIGHBOURS ONE STEP MAY RETURN. Not a page — a neighbourhood past
 * this size is not a neighbourhood, and the honest answer is the count beside it
 * (R16) rather than a cursor into a picture nobody can read. Said here rather
 * than at each statement because every edge shares it. */
export const NEIGHBOURS_PER_EDGE = 40

/** One relationship, as the column that already holds it.
 *
 * `from`/`to` are TABLES, because that is what the gate map is keyed on and
 * therefore what the fence can be applied to. `relation` is the words a reader
 * sees on the line; it is English here and translated at the screen (R28/R33). */
export type RecordEdge = {
  /** the table holding the pointer */
  from: string
  /** the column on it */
  column: string
  /** what it points at */
  to: string
  /** what the line MEANS, read from `from` to `to`. */
  relation: string
}

/** EVERY EDGE THE MAP DRAWS. Data, so a new one is a line rather than a code
 * path, and so the fence below can be applied to all of them in one place.
 *
 * DELIBERATELY NOT EXHAUSTIVE OF EVERY FOREIGN KEY IN THE SCHEMA. A map is a
 * picture somebody reads, and an edge that answers no question a person has is
 * a line that makes the ones that do harder to see. Each of these is a sentence
 * somebody would say out loud: this ticket is Bergman's, this story answers that
 * ticket, this process belongs to that app. */
export const RECORD_EDGES: readonly RecordEdge[] = [
  // The customer spine — everything hangs off an account.
  { from: "apps", column: "account_id", to: "accounts", relation: "is built for" },
  { from: "help", column: "account_id", to: "accounts", relation: "was raised by" },
  { from: "help", column: "app_id", to: "apps", relation: "is about" },
  { from: "meetings", column: "account_id", to: "accounts", relation: "was with" },
  { from: "meetings", column: "app_id", to: "apps", relation: "was about" },
  { from: "todos", column: "account_id", to: "accounts", relation: "was asked of" },
  { from: "tasks", column: "account_id", to: "accounts", relation: "is about" },
  { from: "portal_users", column: "account_id", to: "accounts", relation: "signs in to" },
  { from: "account_links", column: "account_id", to: "accounts", relation: "works at" },
  // The work engine.
  { from: "stories", column: "ticket_id", to: "help", relation: "answers" },
  { from: "stories", column: "sprint_id", to: "sprints", relation: "sits in" },
  { from: "stories", column: "app_id", to: "apps", relation: "changes" },
  { from: "sprints", column: "account_id", to: "accounts", relation: "was sold to" },
  { from: "sprints", column: "wave_id", to: "waves", relation: "sits in" },
  { from: "waves", column: "account_id", to: "accounts", relation: "was sold to" },
  // What we actually do for them, and what we handed over.
  { from: "processes", column: "app_id", to: "apps", relation: "runs on" },
  { from: "deliverables", column: "app_id", to: "apps", relation: "was handed over on" },
  // Why we met.
  { from: "meetings", column: "purpose_id", to: "meeting_purposes", relation: "was held for" },
] as const

/** WHAT THIS CALLER MAY READ, as a set of TABLES — the same map the activity
 * feed subtracts through (R18), asked the same way.
 *
 * TABLES rather than modules, because an edge has table endpoints and the whole
 * point of the fence below is that it must be applied to a FAR END whose module
 * the caller may never have been told about.
 *
 * One read, not twenty: `hasRight` caches the whole permission sheet per request
 * (`sheetPerRequest` in shared/workers/gating.ts), so asking it once per module
 * costs one statement. Bounded by ACTIVITY_GATE_MAP, which is a constant. */
export async function readableTables(cfg: D1Rest, guard: MemberGuard): Promise<Set<string>> {
  const modules = [...new Set(Object.values(ACTIVITY_GATE_MAP))]
  const allowed = new Set<string>()
  for (const module of modules) if (await hasRight(cfg, guard, module, "read")) allowed.add(module)
  const out = new Set<string>()
  for (const [table, module] of Object.entries(ACTIVITY_GATE_MAP))
    if (allowed.has(module)) out.add(table)
  return out
}

/** The edges that touch a table AND whose OTHER END this caller may read.
 *
 * BOTH ENDS, and that is the clause the whole file exists for. An edge from a
 * ticket to an account is not a fact about the ticket — it is a fact about the
 * pair, and a caller who may read tickets but not accounts must not learn it
 * from the ticket's side either. */
export function edgesFor(table: string, readable: Set<string>): RecordEdge[] {
  if (!readable.has(table)) return []
  return RECORD_EDGES.filter(
    (e) =>
      (e.from === table || e.to === table) && readable.has(e.from) && readable.has(e.to)
  )
}

export type MapNode = { table: string; id: string; label: string }
export type MapLink = { from: string; to: string; relation: string }
/** A neighbourhood: the focus, what sits one step from it, the lines between
 * them, and — R16 — the EXACT number of neighbours, which is not the length of
 * the list when the list was capped. */
export type Neighbourhood = {
  focus: MapNode | null
  nodes: MapNode[]
  links: MapLink[]
  total: number
  capped: boolean
}

/** The column holding a row's human name, per table. A map without labels is a
 * diagram of ULIDs. Absent means the table has none and the node carries its
 * reference instead — which is true of `account_links`, a row that IS a
 * relationship and has no name of its own. */
const LABEL_COLUMN: Record<string, string> = {
  accounts: "name",
  apps: "name",
  help: "title_en",
  stories: "title",
  sprints: "name",
  waves: "name",
  meetings: "title",
  processes: "name",
  deliverables: "title",
  tasks: "title",
  todos: "title",
  meeting_purposes: "name",
  portal_users: "",
  account_links: "",
}

const key = (n: { table: string; id: string }) => `${n.table}:${n.id}`

/** ONE RECORD'S NEIGHBOURHOOD.
 *
 * R14: every statement below is capped at NEIGHBOURS_PER_EDGE, and the number of
 * statements is bounded by RECORD_EDGES, which is a constant in this file. So the
 * whole read is bounded by two constants and cannot grow with the base.
 *
 * R16: `total` is a real COUNT over the same predicate, not the length of a
 * capped list — a map that says "12" when there are 300 is worse than one that
 * says 300 and draws 40 of them. */
export async function neighbourhood(
  cfg: D1Rest,
  guard: MemberGuard,
  input: { table: string; id: string; readable: Set<string> }
): Promise<Neighbourhood> {
  const { table, id, readable } = input
  const edges = edgesFor(table, readable)
  const focusLabel = LABEL_COLUMN[table]
  if (!readable.has(table)) return { focus: null, nodes: [], links: [], total: 0, capped: false }

  const [focusRow] = await d1Query<{ id: string; label: string | null }>(
    cfg,
    guard.databaseId,
    // R14: one row by primary key.
    `SELECT id${focusLabel ? `, ${focusLabel} AS label` : ", NULL AS label"} FROM ${table}
      WHERE id = ${sqlString(id)} LIMIT 1`
  )
  if (!focusRow) return { focus: null, nodes: [], links: [], total: 0, capped: false }
  const focus: MapNode = { table, id: focusRow.id, label: focusRow.label ?? focusRow.id }

  const nodes = new Map<string, MapNode>([[key(focus), focus]])
  const links: MapLink[] = []
  let total = 0
  let capped = false

  for (const edge of edges) {
    // WHICH WAY THIS EDGE POINTS FROM WHERE WE ARE STANDING. On a ticket, the
    // account edge is followed forwards (read the pointer); on an account, the
    // same edge is followed backwards (find the rows pointing here). Same line,
    // same words, two readings — and the link is always recorded in the edge's
    // own direction so the picture reads the same whichever end you opened.
    const outward = edge.from === table
    const other = outward ? edge.to : edge.from
    const otherLabel = LABEL_COLUMN[other]
    const select = `SELECT o.id${otherLabel ? `, o.${otherLabel} AS label` : ", NULL AS label"}`
    const where = outward
      ? `n.id = ${sqlString(id)} AND o.id = n.${edge.column}`
      : `o.${edge.column} = ${sqlString(id)}`
    const from = outward
      ? `FROM ${table} n JOIN ${other} o ON o.id = n.${edge.column}`
      : `FROM ${other} o`
    const rows = await d1Query<{ id: string; label: string | null }>(
      cfg,
      guard.databaseId,
      // R14 hard cap: NEIGHBOURS_PER_EDGE, said here, at the statement.
      `${select} ${from} WHERE ${where} LIMIT ${NEIGHBOURS_PER_EDGE + 1}`
    )
    const shown = rows.slice(0, NEIGHBOURS_PER_EDGE)
    if (rows.length > NEIGHBOURS_PER_EDGE) capped = true
    // R16: the exact number on the other end of this line, counted rather than
    // measured off the page.
    total += outward
      ? shown.length
      : await countCollection(
          cfg,
          guard.databaseId,
          `SELECT 1 FROM ${other} o WHERE o.${edge.column} = ${sqlString(id)}`
        )
    for (const r of shown) {
      const node: MapNode = { table: other, id: r.id, label: r.label ?? r.id }
      nodes.set(key(node), node)
      links.push(
        outward
          ? { from: key(focus), to: key(node), relation: edge.relation }
          : { from: key(node), to: key(focus), relation: edge.relation }
      )
    }
  }
  return { focus, nodes: [...nodes.values()], links, total, capped }
}
