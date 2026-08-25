// THE data-access door to per-team databases (locked rule: one door).
// Team databases are created at runtime, so workers can't have them as
// pre-wired bindings — instead we talk to Cloudflare's D1 REST API with a
// scoped token. Every module worker that touches team data goes through this
// ONE file — which is also where sharding routing plugs in (see
// workers/tenancy/src/lib/sharding.ts for the routing + mover machinery).

import type { D1Database } from "@cloudflare/workers-types"

export type D1Rest = {
  accountId: string
  apiToken: string
  /** TEAM DATABASES THIS DEPLOYMENT CAN REACH DIRECTLY, by database id.
   *
   * The REST door above is a call to Cloudflare's MANAGEMENT API — the interface
   * for creating and listing databases, which we use to run queries because a
   * database made at runtime cannot be named in a config file that shipped
   * before it existed. Measured on staging, 24 Aug 2026: ~400ms per statement,
   * for SQL the database itself reports finishing in 0.95ms.
   *
   * A native binding is the same database over the data plane, in single-digit
   * milliseconds. It has to be named in wrangler config, so it can only ever
   * cover databases that exist at deploy time — which is why this is a MAP with
   * a fall-through rather than a replacement. A team here goes direct; a team
   * created after the last deploy keeps working over REST, exactly as before,
   * until somebody adds its binding. Nothing has to be migrated and nothing
   * breaks if this is empty.
   *
   * WHY THIS CANNOT BE POINTED SOMEWHERE IT SHOULD NOT GO. The key is a database
   * id, and the only database id that reaches this door is `guard.databaseId` —
   * read by `requireMember` out of the `teams` row for the team the caller is a
   * member of, over the core database, on this request. There is no route, body
   * or query string anywhere in the codebase that supplies one. So the native
   * path is reachable exactly where the REST path was reachable, for exactly the
   * same caller, and a wrong or hostile id finds no entry and falls through to a
   * REST call that is itself scoped to that same id. The pipe changed; nothing
   * about who may put something in it did. */
  natives?: Record<string, D1Database>
  /** WHERE THIS REQUEST'S TRIPS ARE COUNTED (timing.ts), when somebody is
   * counting. Every statement here is a separate HTTPS request to Cloudflare, so
   * the COUNT is the cost model — and it rides on the config because the config
   * is the one thing already threaded to every call site in the codebase. No
   * handler had to change to be measured. Absent = nobody asked, and the door
   * pays nothing. */
  stats?: { op: string; ms: number }[]
  /** WHERE A NEW TEAM DATABASE IS BORN — a Cloudflare primary-location hint.
   * Set from `D1_LOCATION` where a deployment sets it; `weur` otherwise. It is
   * on the config rather than passed at the one call site because a database
   * that lands in the wrong region cannot be moved, and a default that lives
   * beside the door is one nobody has to remember to pass. */
  location?: string
}

type CfResponse<T> = {
  success: boolean
  errors: { code: number; message: string }[]
  result: T
}

import { D1_LIST_PAGE_CAP } from "./limits"
import { labelFor } from "./timing"

const API = "https://api.cloudflare.com/client/v4"
const RETRIES = 2 // total attempts = 1 + RETRIES — 5xx, network blips, and CF's 7500-in-a-200

/** THE MEASURED DOOR. Everything below goes through `cfTimed`, so a trip cannot
 * be made without being counted — the alternative (asking each call site to
 * report itself) is the shape that always ends with the expensive path being the
 * one nobody instrumented. Retries are counted INSIDE the trip they belong to,
 * because a statement that needed three attempts genuinely cost three attempts
 * and reporting it as one would flatter the number. */
async function cf<T>(
  cfg: D1Rest,
  path: string,
  body?: unknown,
  method: "GET" | "POST" | "DELETE" = body === undefined ? "GET" : "POST"
): Promise<T> {
  if (!cfg.stats) return cfRaw<T>(cfg, path, body, method)
  const started = Date.now()
  const sql = (body as { sql?: string } | undefined)?.sql
  try {
    return await cfRaw<T>(cfg, path, body, method)
  } finally {
    // In a `finally`, so a statement that THREW is still counted. A failing
    // query is usually the slow one, and leaving it out would hide it.
    cfg.stats.push({ op: sql ? labelFor(sql) : method, ms: Date.now() - started })
  }
}

async function cfRaw<T>(
  cfg: D1Rest,
  path: string,
  body?: unknown,
  method: "GET" | "POST" | "DELETE" = body === undefined ? "GET" : "POST"
): Promise<T> {
  let lastError: Error = new Error("unreachable")
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 250 * attempt))
    let res: Response
    try {
      // A GET carries no body, so the key is ABSENT rather than present-and-
      // undefined. Same bytes on the wire, but it states the invariant (`method`
      // only defaults to GET when there is no body) in one place instead of
      // leaving a reader — or a linter — to correlate two lines to find it.
      res = await fetch(`${API}/accounts/${cfg.accountId}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${cfg.apiToken}`,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        // LAW R11: bound the socket. A hung D1 REST call would otherwise never return
        // and stall the worker; a timeout throws → the retry loop above handles it.
        signal: AbortSignal.timeout(15_000),
      })
    } catch (e) {
      // Network hiccup — worth retrying.
      lastError = e instanceof Error ? e : new Error(String(e))
      continue
    }
    if (res.status >= 500) {
      lastError = new Error(`Cloudflare D1 API ${res.status} on ${path}`)
      continue
    }
    const data = (await res.json()) as CfResponse<T>
    if (!res.ok || !data.success) {
      // A TRANSIENT FAILURE IN A success:false COSTUME. Cloudflare sometimes
      // reports its own internal failure as HTTP 200 with `success:false` and
      // "internal error; reference = …" instead of a 5xx — same failure as a
      // 500, different dress. This branch used to classify it as "our request
      // is wrong, fail loudly", so the retry loop above never fired for exactly
      // the failure it exists for: 36 of the 67 open error rows on 2026-08-17
      // were single-shot internal errors across nine different read doors.
      //
      // The MESSAGE is the discriminator, not the code — measured live, not
      // assumed: D1 answers code 7500 for EVERYTHING ("no such table: x:
      // SQLITE_ERROR" and "internal error; reference = …" both carry it), so a
      // code check would retry bad SQL. Cloudflare's transient wording is the
      // one thing that separates them. Retrying it is the SAME policy the 5xx
      // branch already applies to the same statements — not a new stance on
      // retrying writes.
      if (data.errors?.some((e) => /^internal error/i.test(e.message))) {
        lastError = new Error(
          `Cloudflare D1 API failed: ${data.errors.map((e) => e.message).join("; ")}`
        )
        continue
      }
      // 4xx = our request is wrong — retrying won't help, fail loudly.
      const msg = data.errors?.map((e) => e.message).join("; ") || res.statusText
      // A REFUSED KEY IS NOT A MALFORMED REQUEST, and until 2026-08-14 it read
      // as one. Every secret in this codebase is guarded by a PRESENCE check
      // (`cloud_key_missing`, gating.ts) and none by a VALIDITY one — so "not
      // set" produced a named 503 that says what to do, and "set but rotated
      // away" fell through to the generic `internal` 500 that says nothing.
      // The day the owner rotated the Cloudflare token, that difference cost an
      // afternoon: 150 identical 500s, every signed-in person bounced to a
      // sign-in door that was itself perfectly healthy, and nothing anywhere
      // naming the one fact that mattered. 401/403 is the cloud telling us our
      // key is no longer ours; say so, and let the central catches answer 503.
      if (res.status === 401 || res.status === 403)
        throw new Error(
          `cloud_key_rejected: the Cloudflare D1 token was refused (${msg}), it has probably been rotated. Re-set CF_D1_TOKEN on tenancy, content, data-ops and realtime, in both environments.`
        )
      throw new Error(`Cloudflare D1 API failed: ${msg}`)
    }
    return data.result
  }
  throw lastError
}

/** WHERE A NEW TEAM'S DATABASE SHOULD LIVE.
 *
 * Measured on staging, 25 Aug 2026: the team database had been created with no
 * hint and Cloudflare put it in APAC, while the workers and the core database
 * are in WEUR. Every team read then crossed the planet — about 150ms a trip,
 * NATIVE BINDING OR NOT, because a binding removes the API round trip and not
 * the distance. Eight trips on one screen is the second the owner was feeling.
 *
 * So the region is ASKED FOR rather than left to chance. `weur` is the default
 * because that is where this deployment's core database and its people are; a
 * deployment elsewhere sets `D1_LOCATION` and every team it makes follows.
 *
 * It only decides where a database is BORN — D1 cannot be moved afterwards,
 * which is exactly why getting it right at creation matters more than it looks. */
const DEFAULT_D1_LOCATION = "weur"

/** Create a brand-new D1 database; returns its database id.
 *
 * `location` is a Cloudflare primary-location hint (`weur`, `enam`, `apac`, …).
 * Omitted, it takes the deployment's default rather than whatever colo the
 * creating request happened to land in. */
export async function d1CreateDatabase(
  cfg: D1Rest,
  name: string,
  location?: string
): Promise<string> {
  const result = await cf<{ uuid: string }>(cfg, "/d1/database", {
    name,
    primary_location_hint: location || cfg.location || DEFAULT_D1_LOCATION,
  })
  return result.uuid
}

/** Delete a database — used to clean up after a failed team creation. */
export async function d1DeleteDatabase(
  cfg: D1Rest,
  databaseId: string
): Promise<void> {
  await cf(cfg, `/d1/database/${databaseId}`, undefined, "DELETE")
}

/** Every database in the account (id, name, size) — feeds the 80% alarms. */
export async function d1ListDatabases(
  cfg: D1Rest
): Promise<{ uuid: string; name: string; file_size: number | null }[]> {
  const all: { uuid: string; name: string; file_size: number | null }[] = []
  // BOUNDED: the loop used to be `for (;;)` with only "a short page" to stop it —
  // an upstream that keeps answering with a full page (a paging bug, a `page`
  // parameter it ignores) spun this forever, building an array until the worker
  // died. D1_LIST_PAGE_CAP × 100 rows is the ceiling, and hitting it is loud.
  for (let page = 1; page <= D1_LIST_PAGE_CAP; page++) {
    const batch = await cf<
      { uuid: string; name: string; file_size: number | null }[]
    >(cfg, `/d1/database?page=${page}&per_page=100`)
    all.push(...batch)
    if (batch.length < 100) return all
  }
  console.error(
    `d1ListDatabases: stopped at the ${D1_LIST_PAGE_CAP}-page ceiling (${all.length} databases), the list is INCOMPLETE.`
  )
  return all
}

/** Run ONE parameterized statement; returns its rows.
 *
 * Direct if this deployment holds a binding for the database, over the REST door
 * if it does not — see `natives` above. Both paths bind the SAME parameters the
 * same way: a native statement is `.bind(...params)`, which is D1's own
 * placeholder binding, so nothing about how untrusted text is kept out of SQL
 * changes with the route it takes. */
export async function d1Query<Row = Record<string, unknown>>(
  cfg: D1Rest,
  databaseId: string,
  sql: string,
  params: (string | number | null)[] = []
): Promise<Row[]> {
  const native = cfg.natives?.[databaseId]
  if (native) return nativeQuery<Row>(cfg, native, sql, params)
  const result = await cf<{ results: Row[] }[]>(
    cfg,
    `/d1/database/${databaseId}/query`,
    { sql, params }
  )
  return result[0]?.results ?? []
}

/** The direct path, counted by the same seam as the REST one so a door's trip
 * report stays comparable across the two — that is how the change is PROVED
 * rather than asserted, and how a team still on REST is visible as such. */
async function nativeQuery<Row>(
  cfg: D1Rest,
  db: D1Database,
  sql: string,
  params: (string | number | null)[]
): Promise<Row[]> {
  if (!cfg.stats) return runNative<Row>(db, sql, params)
  const started = Date.now()
  try {
    return await runNative<Row>(db, sql, params)
  } finally {
    cfg.stats.push({ op: labelFor(sql), ms: Date.now() - started })
  }
}

async function runNative<Row>(
  db: D1Database,
  sql: string,
  params: (string | number | null)[]
): Promise<Row[]> {
  const out = await db.prepare(sql).bind(...params).all<Row>()
  return out.results ?? []
}

/** Statement shapes a CONCATENATION of per-shard answers cannot honestly give.
 *
 * The three below are wrong in the same way and it is worth naming precisely,
 * because each looks like it works when there is only one database — which is
 * every environment until the mover runs:
 *
 *   • `LIMIT n` — each shard returns up to n, so the caller gets up to n × shards
 *     rows, and they are the top n OF EACH shard rather than the top n overall.
 *     A keyset page built on that has the wrong rows in it AND takes its
 *     `nextCursor` from the last row of a concatenation, which is a position in no
 *     shard's ordering. Page two then repeats and skips, silently.
 *   • `ORDER BY` — sorted within each shard, unsorted between them. A merge sort
 *     across the results is the fix, and it has to know the sort key, which this
 *     seam does not.
 *   • `COUNT(` and the other aggregates — one row per shard. Every caller in the
 *     base reads `rows[0].n`, so a split module would report the FIRST shard's
 *     count as the whole total: R16's exact count, quietly wrong.
 *
 * FAIL LOUD RATHER THAN ANSWER WRONG. Nothing paged is routed through
 * `queryModule` today, so this refuses nothing that currently runs — it is a
 * tripwire for the day somebody points a paged or counted read at the split path
 * and gets a plausible answer. Making it CORRECT (a per-shard cursor token and a
 * merge, an aggregate that folds) is a real piece of work with a decision in it;
 * the one thing that must not happen in the meantime is a wrong number nobody
 * questions. Single-database reads — every read today — are untouched.
 */
const UNMERGEABLE: { pattern: RegExp; what: string }[] = [
  { pattern: /\bLIMIT\b/i, what: "a LIMIT (each shard returns its own n, so the page is wrong)" },
  { pattern: /\bORDER\s+BY\b/i, what: "an ORDER BY (sorted per shard, unsorted between them)" },
  {
    pattern: /\b(COUNT|SUM|AVG|MIN|MAX|GROUP_CONCAT)\s*\(/i,
    what:
      "an aggregate (one row per shard, and every caller reads the first). " +
      "A collection COUNT now HAS a real merge, countCollectionAcross in " +
      "shared/workers/count.ts sums the per-shard bounded counts and clamps once, " +
      "which is exact below the ceiling and an honest floor above it. Use that " +
      "rather than reaching for this seam",
  },
]

/**
 * Merged reads (the "splitter" read path): run the same query against several
 * databases — e.g. a module split across shards — and return all rows as one
 * list. Pair with resolveModuleDatabases() in the tenancy sharding lib.
 *
 * ONE database is a plain read and anything goes. TWO OR MORE is a concatenation,
 * and a concatenation cannot page, sort or count — see UNMERGEABLE above.
 */
export async function d1QueryAcross<Row = Record<string, unknown>>(
  cfg: D1Rest,
  databaseIds: string[],
  sql: string,
  params: (string | number | null)[] = []
): Promise<Row[]> {
  if (databaseIds.length > 1)
    for (const { pattern, what } of UNMERGEABLE)
      if (pattern.test(sql))
        throw new Error(
          `d1QueryAcross: this statement carries ${what}, and it is being run across ` +
            `${databaseIds.length} databases. A concatenation of per-shard answers would be ` +
            `plausible and wrong. Read one database, or give this path a real merge.`
        )
  // allSettled, not all: gather every shard's outcome so a failure names WHICH shard(s)
  // failed (Promise.all throws the first raw error and hides the rest). It still fails
  // LOUD on any error — a sharded read that silently dropped a shard's rows would be
  // wrong (a count/aggregate would under-report). If a future query can tolerate a
  // degraded shard, that's a deliberate per-query opt-in, not the default here.
  const settled = await Promise.allSettled(
    databaseIds.map((id) => d1Query<Row>(cfg, id, sql, params))
  )
  const failed = databaseIds.filter((_, i) => settled[i].status === "rejected")
  if (failed.length)
    throw new Error(`d1QueryAcross: ${failed.length}/${databaseIds.length} shard(s) failed (${failed.join(", ")})`)
  return settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []))
}

/** Run a multi-statement script (schema/seeds — no params allowed).
 *
 * Direct where the deployment holds a binding. `.exec` is D1's own
 * multi-statement entry point, which is what this always asked the REST door
 * for — so migrations, seeds and the copy path behave identically, they just
 * stop paying for a management-API call each. */
/**
 * SPLIT A SCRIPT INTO ITS STATEMENTS, respecting quoting.
 *
 * `D1Database.exec()` is a MAINTENANCE door: it splits its input by NEWLINE and
 * treats each line as a whole statement. Every script in this repo is written as
 * an indented multi-line template, so on the native path the first line arrived
 * alone and SQLite answered `incomplete input` — which is precisely what it was
 * given. That went unseen because `logActivity` writes its row inside a
 * try/catch, so the audit trail stopped without a single failed request.
 *
 * `batch()` has no such rule: it takes prepared statements and runs them in one
 * transaction, which is also the semantics an exec SCRIPT already implied. So
 * the only thing missing is the split, and the only hard part of the split is
 * that a `;` inside a value is not a statement boundary — `sqlString` escapes a
 * quote by doubling it, so the scanner has to read the same grammar back.
 */
function splitStatements(script: string): string[] {
  const out: string[] = []
  let start = 0
  let inString = false
  for (let i = 0; i < script.length; i++) {
    const c = script[i]
    if (inString) {
      /* '' inside a string is an escaped quote, not the end of one. */
      if (c === "'") {
        if (script[i + 1] === "'") i++
        else inString = false
      }
      continue
    }
    if (c === "'") { inString = true; continue }
    /* -- runs to the end of the line, and a `;` inside one is not a boundary. */
    if (c === "-" && script[i + 1] === "-") {
      const nl = script.indexOf("\n", i)
      i = nl === -1 ? script.length : nl
      continue
    }
    if (c === ";") {
      const stmt = script.slice(start, i).trim()
      if (stmt) out.push(stmt)
      start = i + 1
    }
  }
  const tail = script.slice(start).trim()
  if (tail) out.push(tail)
  return out
}

export async function d1ExecScript(
  cfg: D1Rest,
  databaseId: string,
  script: string
): Promise<void> {
  const native = cfg.natives?.[databaseId]
  if (native) {
    const started = Date.now()
    try {
      /* NOT `exec()` — see splitStatements above for why it cannot take these.
         batch() runs the lot in one transaction, which is what a script meant. */
      const statements = splitStatements(script)
      if (statements.length === 0) return
      await native.batch(statements.map((sql) => native.prepare(sql)))
    } finally {
      cfg.stats?.push({ op: "EXEC script", ms: Date.now() - started })
    }
    return
  }
  await cf(cfg, `/d1/database/${databaseId}/query`, { sql: script })
}

/** Escape a value for inlining into a seed/copy script ('' doubling). Only
 * used where the REST API forbids params (multi-statement scripts). Coerces any
 * non-string runtime value to its string form FIRST (defence-in-depth: route bodies
 * are `as`-cast, so a field typed `string` can arrive as a number/object/array —
 * String() it so the one SQL door never throws a 500, and the escaping still holds). */
export function sqlString(value: unknown): string {
  if (value === null || value === undefined) return "NULL"
  return `'${String(value).replaceAll("'", "''")}'`
}

/** A user's search text as a LITERAL inside a LIKE pattern.
 *
 * Binding a needle as a parameter stops it becoming SQL — it does NOT stop it
 * becoming a PATTERN, and those are two different escapes. `%` and `_` are LIKE's
 * own wildcards, so an unescaped search for "PO_1" matches "PO-1"; and because
 * SQLite compares a pattern by recursing at every `%`, a needle of alternating
 * `%` and letters costs the worker exponential time over the whole table — a
 * denial of service that fits in a query string.
 *
 * The backslash is escaped FIRST (or it would escape the escapes this adds), and
 * every statement using this must say `ESCAPE '\'` — the marker is not SQLite's
 * default. Beside sqlString because it is the same kind of promise: one seam that
 * makes untrusted text mean only itself. */
export function likeLiteral(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")
}

/** Inline any copied cell value into a script (numbers, NULLs, strings). */
export function sqlValue(value: string | number | null): string {
  if (value === null) return "NULL"
  if (typeof value === "number") return String(value)
  return sqlString(value)
}
