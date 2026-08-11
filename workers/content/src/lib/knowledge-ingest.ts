// THE SWEEP — how the app's own rows become material the assistant can read,
// and stay in step afterwards.
//
// ONE ENGINE, KINDS AS DATA. A kind is a row in INGEST_KINDS: where its rows
// live, how to turn one into a source, and which compartment it belongs to.
// Adding the sixth Google source is a line in that table and a reader beside it,
// never a second ingestion path — the resumability, the failure recording, the
// hash-skip and the bounded slice below are written once and inherited.
//
// RESUMABLE, BOUNDED, AND NEVER ON THE REQUEST PATH. Every kind keeps a cursor
// in `knowledge_ingest` (the position of the last row it read, as sort-value +
// id). A tick reads INGEST_SOURCES_PER_TICK rows past that position, files them,
// and moves the cursor. A tick that dies costs the next one nothing; a source
// that is an hour behind catches up quietly, which is exactly what §3 asks for
// ("Google being down or an hour behind breaks nothing important").
//
// THE HASH IS WHAT MAKES IT CHEAP. A row whose text has not changed since it was
// indexed is skipped before any chunking, any embedding and any write. So the
// steady state of a 15-minute sweep over 4,000 sources is a handful of reads and
// no model calls at all — which is the difference between a knowledge base that
// costs €50 a month and one that costs it every day.

import { d1ExecScript, d1Query, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import type { MemberGuard } from "@shared/workers/gating"
import { ulid } from "@shared/workers/id"
import { THREAD_HARD_CAP } from "@shared/workers/limits"
import type { Env } from "../env"
import { AGENCY_COMPARTMENT, accountCompartment, indexableText, indexSource } from "./knowledge"
import { contentHash, plainText } from "./knowledge-text"

/** Rows one kind may ingest per tick. The bound on the work a single invocation
 * does — the reason a cron handler here cannot become a long-running job. Sized
 * so the whole sweep (every kind) fits comfortably inside one invocation even
 * when every row has changed and every chunk needs embedding. */
export const INGEST_SOURCES_PER_TICK = 25

/** Replies folded into a ticket's text. A ticket's conversation is most of what
 * makes it useful to the assistant, and THREAD_HARD_CAP is the same ceiling the
 * ticket screen reads it under (R14) — the index must not be able to ask for
 * more of a row than a person can. */
const REPLIES_PER_TICKET = Math.min(50, THREAD_HARD_CAP)

/** A row on its way to becoming a source. `sortAt` is the cursor's value. */
type IngestRow = {
  originRowId: string
  sortAt: string
  title: string
  body: string
  accountId: string | null
  sourceUrl: string | null
}

/** One kind of in-app material: where it lives, and how a row of it reads.
 *
 * `read` takes the cursor's position and hands back the next slice in cursor
 * order. It is SQL rather than a call to each module's own list function on
 * purpose: a list function answers what a SCREEN needs (fenced, shaped, capped
 * at a page), and this needs whole rows in a stable total order — asking a
 * screen's reader for that would bend it out of shape for a job it is not for. */
type IngestKind = {
  kind: string
  /** which table a source of this kind mirrors — also its `origin_table` */
  table: string
  /** plain words for the activity trail and the failure message */
  label: string
  read: (cfg: D1Rest, guard: MemberGuard, after: Cursor | null, limit: number) => Promise<IngestRow[]>
}

type Cursor = { at: string; id: string }

/** The keyset predicate every kind's read shares: everything strictly after the
 * cursor, in (sort value, id) order. Forward, not backward like a screen's page:
 * a sweep is catching UP, so it reads oldest-first and stops when it runs out. */
function after(cursor: Cursor | null, sortExpr: string): { sql: string; params: string[] } {
  if (!cursor) return { sql: "", params: [] }
  return {
    sql: `(${sortExpr} > ? OR (${sortExpr} = ? AND id > ?))`,
    params: [cursor.at, cursor.at, cursor.id],
  }
}

const TICKET_SORT = "COALESCE(h.updated_at, h.created_at)"
const ROW_SORT = "COALESCE(updated_at, created_at)"

export const INGEST_KINDS: IngestKind[] = [
  {
    kind: "ticket",
    table: "help",
    label: "tickets",
    read: async (cfg, guard, cursor, limit) => {
      const keyset = after(cursor, TICKET_SORT)
      const rows = await d1Query<{
        id: string
        ref: string | null
        title_en: string | null
        title_de: string | null
        description: string
        help_type: string | null
        status: string
        account_id: string | null
        sort_at: string
        thread: string | null
      }>(
        cfg,
        guard.databaseId,
        // R14 hard cap: `limit` is INGEST_SOURCES_PER_TICK. The conversation rides
        // the same read as its ticket (a correlated group_concat over a bounded
        // inner select) rather than a query per ticket — one round trip per tick,
        // not one per row.
        `SELECT h.id, h.ref, h.title_en, h.title_de, h.description, h.help_type, h.status, h.account_id,
                ${TICKET_SORT} AS sort_at,
                (SELECT group_concat(t.message_body, char(10)) FROM
                   (SELECT message_body FROM help_threads WHERE help_id = h.id ORDER BY created_at LIMIT ${REPLIES_PER_TICKET}) t
                ) AS thread
           FROM help h
          WHERE h.archived_at IS NULL${keyset.sql ? ` AND ${keyset.sql}` : ""}
          ORDER BY sort_at, h.id LIMIT ${limit}`,
        keyset.params
      )
      return rows.map((r) => ({
        originRowId: r.id,
        sortAt: r.sort_at,
        title: r.title_en || r.title_de || firstLine(r.description),
        body: [
          r.ref ? `Reference ${r.ref}.` : "",
          `A ${r.help_type ?? "general"} ticket, currently ${r.status.replace(/_/g, " ")}.`,
          r.description,
          r.thread ?? "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        accountId: r.account_id,
        sourceUrl: null,
      }))
    },
  },
  {
    kind: "article",
    table: "learning",
    label: "learning articles",
    read: async (cfg, guard, cursor, limit) => {
      const keyset = after(cursor, ROW_SORT)
      const rows = await d1Query<{
        id: string
        content_title: string
        content_description: string | null
        content_body: string | null
        content_link: string | null
        category: string | null
        sort_at: string
      }>(
        cfg,
        guard.databaseId,
        // R14 hard cap: `limit` is INGEST_SOURCES_PER_TICK.
        `SELECT id, content_title, content_description, content_body, content_link, category,
                ${ROW_SORT} AS sort_at
           FROM learning
          WHERE deactivated_at IS NULL${keyset.sql ? ` AND ${keyset.sql}` : ""}
          ORDER BY sort_at, id LIMIT ${limit}`,
        keyset.params
      )
      return rows.map((r) => ({
        originRowId: r.id,
        sortAt: r.sort_at,
        title: r.content_title,
        body: [r.category ? `Category: ${r.category}.` : "", r.content_description ?? "", r.content_body ?? ""]
          .filter(Boolean)
          .join("\n\n"),
        // The agency's own how-to library belongs to nobody's client.
        accountId: null,
        sourceUrl: r.content_link,
      }))
    },
  },
  {
    kind: "account",
    table: "accounts",
    label: "accounts",
    read: async (cfg, guard, cursor, limit) => {
      // The accounts read aliases its table (`a`), so its sort expression is
      // qualified — the same COALESCE, said the way this statement can read it.
      const keyset = after(cursor, "COALESCE(a.updated_at, a.created_at)")
      const rows = await d1Query<{
        id: string
        name: string
        account_type: string
        code: string | null
        status: string
        email: string | null
        phone: string | null
        address: string | null
        parent_name: string | null
        sort_at: string
      }>(
        cfg,
        guard.databaseId,
        // R14 hard cap: `limit` is INGEST_SOURCES_PER_TICK.
        `SELECT a.id, a.name, a.account_type, a.code, a.status, a.email, a.phone, a.address,
                (SELECT p.name FROM accounts p WHERE p.id = a.parent_account_id) AS parent_name,
                COALESCE(a.updated_at, a.created_at) AS sort_at
           FROM accounts a
          WHERE a.deactivated_at IS NULL${keyset.sql ? ` AND ${keyset.sql}` : ""}
          ORDER BY sort_at, a.id LIMIT ${limit}`,
        keyset.params
      )
      return rows.map((r) => ({
        originRowId: r.id,
        sortAt: r.sort_at,
        title: r.name,
        body: [
          `${r.name} is ${r.account_type === "entity" ? "a company" : "a person"} we work with${r.parent_name ? `, under ${r.parent_name}` : ""}.`,
          r.code ? `Reference ${r.code}.` : "",
          `Status: ${r.status}.`,
          [r.email, r.phone, r.address].filter(Boolean).join(" · "),
        ]
          .filter(Boolean)
          .join("\n"),
        // An account IS its own compartment — everything about a client is filed
        // under that client.
        accountId: r.id,
        sourceUrl: null,
      }))
    },
  },
]

/** The first sentence of a ticket's description, for a ticket that has no title
 * of its own. Bounded so a wall of pasted text can't become a title. */
function firstLine(description: string): string {
  const text = plainText(description)
  const stop = text.search(/[.!?\n]/)
  const line = (stop > 0 ? text.slice(0, stop) : text).trim()
  return (line || "Untitled ticket").slice(0, 120)
}

/** What one kind's tick did. Returned to the door AND recorded on the row, so a
 * person watching the screen and a person reading the table see one story. */
export type SweepResult = {
  kind: string
  read: number
  indexed: number
  /** true when this kind has caught up with its table (nothing left past cursor) */
  caughtUp: boolean
  error?: string
}

function parseCursor(raw: string | null): Cursor | null {
  if (!raw) return null
  const cut = raw.indexOf("|")
  return cut === -1 ? null : { at: raw.slice(0, cut), id: raw.slice(cut + 1) }
}

/** File one slice of one kind. Every row becomes (or updates) exactly one
 * source, and only a row whose TEXT changed is re-chunked and re-embedded.
 *
 * A source somebody EXCLUDED stays excluded: the upsert leaves `deactivated_at`
 * alone and `indexSource` refuses to index a deactivated row, so a sweep can
 * never quietly hand back material a person deliberately took away. */
export async function sweepKind(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  kind: IngestKind,
  limit = INGEST_SOURCES_PER_TICK
): Promise<SweepResult> {
  const state = await d1Query<{ cursor: string | null }>(
    cfg,
    guard.databaseId,
    "SELECT cursor FROM knowledge_ingest WHERE kind = ? LIMIT 1",
    [kind.kind]
  )
  const cursor = parseCursor(state[0]?.cursor ?? null)
  const rows = await kind.read(cfg, guard, cursor, limit)
  let indexed = 0
  let last: Cursor | null = cursor

  for (const row of rows) {
    const compartment = row.accountId ? accountCompartment(row.accountId) : AGENCY_COMPARTMENT
    const hash = contentHash(indexableText({ title: row.title, body: row.body }))
    const now = new Date().toISOString()
    // ONE STATEMENT decides create-or-update, so two ticks running at once (a
    // cron and a catch-up call) cannot both insert the same source. The conflict
    // target names the partial index's own WHERE clause, which is what makes it
    // match. `deactivated_at` is deliberately absent from the SET list.
    const upserted = await d1Query<{ id: string; content_hash: string | null; deactivated_at: string | null }>(
      cfg,
      guard.databaseId,
      `INSERT INTO knowledge_sources
         (id, kind, origin_table, origin_row_id, compartment, account_id, title, body, source_url, created_at, creator_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'kwapso')
       ON CONFLICT (origin_table, origin_row_id) WHERE origin_row_id IS NOT NULL
       DO UPDATE SET title = excluded.title, body = excluded.body, source_url = excluded.source_url,
                     compartment = excluded.compartment, account_id = excluded.account_id, updated_at = ?
       RETURNING id, content_hash, deactivated_at`,
      [
        ulid(),
        kind.kind,
        kind.table,
        row.originRowId,
        compartment,
        row.accountId,
        row.title,
        row.body,
        row.sourceUrl,
        now,
        now,
      ]
    )
    const source = upserted[0]
    last = { at: row.sortAt, id: row.originRowId }
    if (!source || source.deactivated_at !== null) continue
    // THE SKIP THAT PAYS FOR THE SWEEP: unchanged text is not re-chunked, so it
    // costs no embedding call and no writes.
    if (source.content_hash === hash) continue
    await indexSource(env, cfg, guard, source.id)
    indexed++
  }

  const caughtUp = rows.length < limit
  await recordRun(cfg, guard, kind.kind, {
    cursor: last ? `${last.at}|${last.id}` : null,
    indexed,
    error: null,
  })
  return { kind: kind.kind, read: rows.length, indexed, caughtUp }
}

/** Stamp what a tick did on the kind's own row — including, and especially, what
 * went wrong (R12). `last_ok_at` moves only on a clean run, so "it has been
 * running and failing since Tuesday" is readable from the row itself rather than
 * from a log nobody opens. */
async function recordRun(
  cfg: D1Rest,
  guard: MemberGuard,
  kind: string,
  outcome: { cursor: string | null; indexed: number; error: string | null }
): Promise<void> {
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO knowledge_ingest (kind, cursor, last_run_at, last_ok_at, last_error, runs, sources_indexed)
     VALUES (${sqlString(kind)}, ${sqlString(outcome.cursor)}, ${sqlString(now)}, ${outcome.error ? "NULL" : sqlString(now)}, ${sqlString(outcome.error)}, 1, ${outcome.indexed})
     ON CONFLICT (kind) DO UPDATE SET
       cursor = ${outcome.error ? "knowledge_ingest.cursor" : "excluded.cursor"},
       last_run_at = excluded.last_run_at,
       last_ok_at = ${outcome.error ? "knowledge_ingest.last_ok_at" : "excluded.last_ok_at"},
       last_error = excluded.last_error,
       runs = knowledge_ingest.runs + 1,
       sources_indexed = knowledge_ingest.sources_indexed + ${outcome.indexed};`
  )
}

/** One tick over every kind. A kind that throws is RECORDED and the rest of the
 * sweep still runs — one bad table must not stop the others from catching up,
 * and a failure that stopped everything silently is the shape R12 exists for. */
export async function sweepAll(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  limit = INGEST_SOURCES_PER_TICK
): Promise<SweepResult[]> {
  const results: SweepResult[] = []
  for (const kind of INGEST_KINDS) {
    try {
      results.push(await sweepKind(env, cfg, guard, kind, limit))
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      await recordRun(cfg, guard, kind.kind, { cursor: null, indexed: 0, error })
      results.push({ kind: kind.kind, read: 0, indexed: 0, caughtUp: false, error })
    }
  }
  return results
}

/** What the sweep has done so far, per kind — the screen's "is it in step?" row
 * and the machine surface's answer to the same question. */
export type IngestState = {
  kind: string
  cursor: string | null
  lastRunAt: string | null
  lastOkAt: string | null
  lastError: string | null
  runs: number
  sourcesIndexed: number
}

export async function listIngestState(cfg: D1Rest, guard: MemberGuard): Promise<IngestState[]> {
  const rows = await d1Query<{
    kind: string
    cursor: string | null
    last_run_at: string | null
    last_ok_at: string | null
    last_error: string | null
    runs: number
    sources_indexed: number
  }>(
    cfg,
    guard.databaseId,
    // R14 hard cap: one row per KIND, and the kinds are a fixed list in code —
    // the cap is here because the law is the law, not because this can grow.
    `SELECT kind, cursor, last_run_at, last_ok_at, last_error, runs, sources_indexed
       FROM knowledge_ingest ORDER BY kind LIMIT ${INGEST_KINDS.length + 10}`
  )
  return rows.map((r) => ({
    kind: r.kind,
    cursor: r.cursor,
    lastRunAt: r.last_run_at,
    lastOkAt: r.last_ok_at,
    lastError: r.last_error,
    runs: r.runs,
    sourcesIndexed: r.sources_indexed,
  }))
}
