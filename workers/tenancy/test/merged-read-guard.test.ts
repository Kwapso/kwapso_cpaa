// A CONCATENATION CANNOT PAGE, SORT OR COUNT.
//
// `d1QueryAcross` runs one statement against several databases and returns every
// row as one list. That is exactly right for "give me the rows", and quietly wrong
// for the three shapes below — each of which looks like it works while there is
// only ONE database, which is every environment until the mover runs:
//
//   • LIMIT n     → each shard returns up to n, so the caller gets the top n OF
//                   EACH shard, up to n × shards rows. A keyset page built on that
//                   has the wrong rows in it and takes its `nextCursor` from the
//                   last row of a concatenation — a position in no shard's order.
//                   Page two repeats and skips, silently.
//   • ORDER BY    → sorted within each shard, unsorted between them.
//   • COUNT(…)    → one row per shard, and every caller in this base reads
//                   `rows[0].n`. R16's exact total would report the FIRST shard's
//                   count as the whole thing.
//
// Nothing paged goes through the split path today, so this refuses nothing that
// currently runs. It is the tripwire for the day somebody points a paged or counted
// read at it and gets a plausible answer.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi, afterEach } from "vitest"

import { sourceFiles } from "@shared/rules/source-scan"
import { d1QueryAcross } from "@shared/workers/d1-rest"

import { SPLIT_READS_WIRED } from "../src/lib/sharding"
import { moveModule } from "../src/routes/admin"

const CFG = { accountId: "a", apiToken: "t" }

afterEach(() => vi.unstubAllGlobals())

/** Every database answers one row, so a concatenation is visibly a concatenation. */
function stubShards() {
  vi.stubGlobal("fetch", async () =>
    new Response(JSON.stringify({ success: true, errors: [], result: [{ results: [{ n: 1 }] }] }), {
      status: 200,
    })
  )
}

describe("one database is a plain read — nothing is refused", () => {
  it("allows a LIMIT, an ORDER BY and a COUNT against a single database", async () => {
    stubShards()
    // Every read in the base today is this call. It must be untouched.
    await expect(
      d1QueryAcross(CFG, ["only"], "SELECT COUNT(*) AS n FROM help ORDER BY created_at DESC LIMIT 51")
    ).resolves.toEqual([{ n: 1 }])
  })
})

describe("two or more databases refuse what a concatenation cannot answer", () => {
  const SHARDS = ["one", "two"]

  it("refuses a LIMIT", async () => {
    stubShards()
    await expect(d1QueryAcross(CFG, SHARDS, "SELECT id FROM help LIMIT 51")).rejects.toThrow(/LIMIT/)
  })

  it("refuses an ORDER BY", async () => {
    stubShards()
    await expect(
      d1QueryAcross(CFG, SHARDS, "SELECT id FROM help ORDER BY created_at DESC")
    ).rejects.toThrow(/ORDER BY/)
  })

  it("refuses an aggregate — the one that would make R16's exact count wrong", async () => {
    stubShards()
    for (const sql of [
      "SELECT COUNT(*) AS n FROM help",
      "SELECT SUM(minutes) AS n FROM work_logs",
      "SELECT MAX(rank) AS top FROM stories",
    ])
      await expect(d1QueryAcross(CFG, SHARDS, sql)).rejects.toThrow(/aggregate/)
  })

  it("still allows a plain row read across shards — the thing the path is FOR", async () => {
    stubShards()
    await expect(
      d1QueryAcross(CFG, SHARDS, "SELECT id, title FROM help WHERE account_id = ?", ["A1"])
    ).resolves.toEqual([{ n: 1 }, { n: 1 }])
  })

  it("says what to do instead, not just that it refused", async () => {
    stubShards()
    await expect(d1QueryAcross(CFG, SHARDS, "SELECT id FROM help LIMIT 5")).rejects.toThrow(
      /read one database, or give this path a real merge/i
    )
  })
})

// ── AND THE RELIEF VALVE THAT DEPENDS ON ALL OF THE ABOVE ───────────────────
//
// The header of this file says "nothing paged goes through the split path today"
// and treats that as a tripwire for the future. It is also, read the other way, a
// statement that the MOVER CANNOT BE RUN — and until 5 Sep 2026 nothing said so
// and the door answered `{ ok: true, status: "done" }`.
//
// What the mover does: copy a module's tables into a new database, verify the
// counts, write the routing row, then DRAIN the old home — its own comment saying
// "routing has already flipped: `resolveModuleDatabases` now returns both
// databases and every read is a MERGED read over them."
//
// What the app does: `requireMember` resolves ONE `guard.databaseId` out of
// `teams.database_id`, consults `team_module_databases` nowhere, and every module
// lib reads that id. So the drain empties the database every screen is still
// querying, on both front doors, for every member of that team — and the mover
// reports success and resolves the size alarm that prompted it.
//
// The refusal is now at the door, and this is what keeps the refusal HONEST: the
// flag is checked against a census of the read path's real callers, so it cannot
// be left set the wrong way in either direction.
describe("the module mover refuses while the app cannot read a moved module", () => {
  const ROOT = join(__dirname, "..", "..", "..")

  /** Every production .ts under workers/ and shared/ — no tests, because a test
   * calling the split path proves nothing about whether the APP does. */
  function productionSources(): { rel: string; source: string }[] {
    const dirs = [join(ROOT, "workers"), join(ROOT, "shared")]
    return sourceFiles(dirs, { extensions: [".ts"], relativeTo: ROOT }).filter(
      (f) => !/(^|\/)test(s)?\//.test(f.rel) && !/\.test\.ts$/.test(f.rel)
    )
  }

  it("SPLIT_READS_WIRED agrees with whether anything actually reads across databases", () => {
    // A call to the merged read from anywhere that is not the sharding lib itself.
    // `resolveModuleDatabases` and `queryModule` are the two entry points; the
    // third name is the primitive under them. `queryModule` is deliberately
    // matched only where it is IMPORTED FROM THE SHARDING LIB, because
    // shared/workers/query-grammar.ts exports an unrelated function of the same
    // name and a bare name match would report the read path as wired by a
    // coincidence of vocabulary.
    const callers: string[] = []
    for (const { rel, source } of productionSources()) {
      if (rel.endsWith("workers/tenancy/src/lib/sharding.ts")) continue
      const importsSharding = /from\s+"[^"]*(?:lib\/)?sharding"/.test(source)
      const usesEntry =
        (importsSharding && /\b(resolveModuleDatabases|queryModule)\s*\(/.test(source)) ||
        /\bd1QueryAcross\s*\(/.test(source)
      if (usesEntry) callers.push(rel)
    }

    // THE CANARY. If the census cannot see the sharding lib's own use of the path
    // it is looking for, its zero means nothing — so prove the pattern matches
    // where the thing is definitely present before believing it anywhere else.
    const shardingSrc = readFileSync(
      join(ROOT, "workers", "tenancy", "src", "lib", "sharding.ts"),
      "utf8"
    )
    expect(
      /\bd1QueryAcross\s*\(/.test(shardingSrc),
      "the census pattern must match the merged read where it definitely exists"
    ).toBe(true)

    expect(
      SPLIT_READS_WIRED,
      callers.length
        ? `${callers.join(", ")} now read across databases, so the mover's relief valve may be real — read d1QueryAcross's refusals (LIMIT/ORDER BY/COUNT) and R14/R16 first, then set SPLIT_READS_WIRED to true`
        : "nothing outside sharding.ts reads across databases, so a moved module would be invisible to the app — SPLIT_READS_WIRED must stay false"
    ).toBe(callers.length > 0)
  })

  it("the mover has exactly one caller, and it is the door that refuses", () => {
    // The refusal is at the door rather than in the lib (so the mover's own
    // mechanics stay testable), which is only safe while the door is the whole
    // way in. A second caller would route around it.
    const callers = productionSources()
      .filter(({ rel, source }) => !rel.endsWith("lib/sharding.ts") && /moveModuleToOwnDatabase\s*\(/.test(source))
      .map((f) => f.rel)
    expect(callers, "the mover is reached through the admin door and nowhere else").toEqual([
      "workers/tenancy/src/routes/admin.ts",
    ])
  })

  it("the door refuses without creating a database or copying a row", async () => {
    // The half that matters most: a refusal that arrived AFTER `d1CreateDatabase`
    // would leave an orphan database on a shared Cloudflare account every time
    // somebody tried.
    const touched: string[] = []
    vi.stubGlobal("fetch", async (url: string) => {
      touched.push(url)
      return new Response(JSON.stringify({ success: true, errors: [], result: {} }), { status: 200 })
    })
    const res = await moveModule(
      new Request("https://tenancy/api/tenancy/admin/move-module", {
        method: "POST",
        headers: { "x-admin-key": "k", "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: "t1", module: "help", tables: ["help"] }),
      }),
      { ADMIN_KEY: "k" } as never
    )
    expect(res.status).toBe(503)
    expect((await res.json()) as { error?: string }).toMatchObject({ error: "module_move_unavailable" })
    expect(touched, "nothing was created and nothing was copied").toEqual([])
  })
})
