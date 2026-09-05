// WHO OWNS `users` — the column split, read off the source rather than trusted.
//
// `users` lives in the GLOBAL core database and is written by two workers. That
// is fine, and it is only fine while the split holds: **auth owns identity, and
// tenancy writes exactly one column.** auth creates the row, changes the email
// and writes the profile; tenancy writes `current_team_id` (plus its `updated_at`
// stamp) because "which team is this person looking at" is a tenancy fact that
// happens to live on an auth-owned row.
//
// Nothing enforced that. A tenancy handler that started writing `users.email` —
// on an email-change flow, say, or a "tidy up the name while we're here" — would
// give two workers an authoritative opinion about one field, and the loser of
// the race would be silent. There is no log that explains that class of bug
// afterwards, which is exactly why it is worth a test rather than a paragraph.
//
// The split is stated for a human in RESILIENCE.md § "Who owns a fact"; this is
// the half that fails the build.

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"

/** Every column tenancy is allowed to name in a write to `users`.
 *
 * `updated_at` rides along because a write that moves the pointer must stamp the
 * row — it is a timestamp, not a fact anyone can disagree about. Adding to this
 * list is a real decision: it hands tenancy authority over another field, and
 * the doc above has to move with it. */
const TENANCY_MAY_WRITE = new Set(["current_team_id", "updated_at"])

const ROOT = join(__dirname, "..", "..", "..")

/** Every `UPDATE users SET …` / `INSERT INTO users (…)` under one worker's src,
 * with the columns it names. Read through the shared walker (no hand-rolled
 * directory walk — `web/test/source-scan.test.ts` enforces that), and with
 * comments stripped first so a sentence about updating a user is not read as
 * SQL. Tests are skipped: a fixture may build whatever shape it likes. */
function userWrites(worker: string): { file: string; columns: string[] }[] {
  const found: { file: string; columns: string[] }[] = []
  for (const f of sourceFiles(join(ROOT, "workers", worker, "src"), {
    extensions: [".ts"],
    skipTests: true,
    relativeTo: ROOT,
  })) {
    const text = stripComments(f.source)
    for (const m of text.matchAll(/UPDATE\s+users\s+SET\s+([\s\S]*?)\s+WHERE/gi)) {
      const columns = [...m[1].matchAll(/([A-Za-z_][\w]*)\s*=/g)].map((c) => c[1].toLowerCase())
      found.push({ file: f.rel, columns })
    }
    for (const m of text.matchAll(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+users\s*\(([^)]*)\)/gi)) {
      found.push({ file: f.rel, columns: m[1].split(",").map((c) => c.trim().toLowerCase()) })
    }
    for (const m of text.matchAll(/DELETE\s+FROM\s+users\b/gi)) {
      found.push({ file: f.rel, columns: [`DELETE (${m[0]})`] })
    }
  }
  return found
}

describe("who owns the users table", () => {
  it("tenancy writes only the current-team pointer", () => {
    const offenders = userWrites("tenancy")
      .flatMap((w) =>
        w.columns.filter((c) => !TENANCY_MAY_WRITE.has(c)).map((c) => `${w.file} writes users.${c}`)
      )
      .sort()
    expect(
      offenders,
      "auth owns the users row (RESILIENCE.md § Who owns a fact). tenancy may " +
        `only write ${[...TENANCY_MAY_WRITE].join(" + ")}; route anything else ` +
        "through auth rather than giving two workers an opinion on one field."
    ).toEqual([])
  })

  it("tenancy does write the pointer — so the rule is guarding something real", () => {
    // A guard that passes because the thing it guards has moved is not a guard.
    // If the pointer write leaves tenancy entirely, this fails and somebody
    // re-reads the doc instead of keeping a rule about nothing.
    const pointerWrites = userWrites("tenancy").filter((w) => w.columns.includes("current_team_id"))
    expect(pointerWrites.length).toBeGreaterThan(0)
  })

  it("no third worker writes users at all", () => {
    const others = ["content", "data-ops", "realtime", "mcp", "gateway", "portal-gateway"]
    const offenders = others.flatMap((w) => userWrites(w).map((f) => f.file))
    expect(
      offenders,
      "only auth (identity) and tenancy (the current-team pointer) may write `users`."
    ).toEqual([])
  })
})

// ── AND THE CENSUS ITSELF, WHICH WAS THE HALF NOBODY CHECKED ────────────────
//
// The suite above pins ONE of the four splits RESILIENCE.md documents, and the
// document ends with a remember-to: "If you add a second writer to a table, add a
// row above." In a repo whose whole philosophy is that a rule with no check is
// not a law, that sentence was the law. A tenancy handler that started writing a
// content-owned column, or a fifth shared table nobody listed, ships green — and
// the failure mode is the one the document opens by describing: two components
// with an authoritative opinion about one fact, the loser of the race silent, and
// no log that explains it afterwards.
//
// So the SET is derived and compared with the document, both ways. A new shared
// writer turns the build red until somebody writes down the split; a documented
// row whose table stopped being shared turns it red too, so the list can only
// shrink honestly rather than becoming a record of what used to be true.
describe("every shared-write table is written down", () => {
  /** THE MIGRATION RUNNER IS NOT A RUNTIME WRITER, and it is the reason a
   * mechanical probe reports thirty shared tables where there are four.
   * `team-schema.ts` is `TEAM_MIGRATIONS` — the DDL and seed SQL that rolls every
   * team database forward. Tenancy owning that IS its job (RESILIENCE.md says so
   * in the paragraph under the table), and a `CREATE TABLE` is not an opinion
   * about a row. One file, named once, rather than a pattern that would also
   * excuse a real handler. */
  const MIGRATION_RUNNER = "workers/tenancy/src/team-schema.ts"

  /** Which component a file belongs to. `shared/workers/` is its own answer
   * rather than being attributed to whoever imports it: `logError` is a SEAM, and
   * RESILIENCE.md names it as `error_logs`' owner in exactly those words. */
  const componentOf = (rel: string) => (rel.startsWith("shared/") ? "shared" : rel.split("/")[1])

  /** Every table any production file WRITES, by component.
   *
   * `\bDELETE` carries a word boundary for a reason worth keeping: without it,
   * `SELECT can_read, can_delete FROM role_permissions` — the gating seam's own
   * rights read — parses as a DELETE, and the census reports a fifth shared table
   * that does not exist. A census's false POSITIVE is as damaging as its false
   * negative here: it teaches the next reader to distrust the list. */
  function writesByComponent(): Map<string, Set<string>> {
    const owners = new Map<string, Set<string>>()
    for (const f of sourceFiles([join(ROOT, "workers"), join(ROOT, "shared", "workers")], {
      extensions: [".ts"],
      skipTests: true,
      relativeTo: ROOT,
    })) {
      // `skipTests` only drops `*.test.ts`; a suite's own FIXTURES (a SQLite
      // double, a fake index, a deferred helper) are ordinary .ts files that
      // build whatever tables they like, and three of them were enough to report
      // `activity`, `agent_credits` and `help` as shared writes that do not
      // exist. The subject here is production code, so a test FOLDER is out
      // whatever a file inside it is called.
      if (f.rel === MIGRATION_RUNNER || /(^|\/)tests?\//.test(f.rel)) continue
      const text = stripComments(f.source)
      const tables = new Set<string>()
      for (const m of text.matchAll(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+([A-Za-z_]\w*)/gi))
        tables.add(m[1].toLowerCase())
      for (const m of text.matchAll(/UPDATE\s+([A-Za-z_]\w*)\s+SET/gi)) tables.add(m[1].toLowerCase())
      for (const m of text.matchAll(/\bDELETE\s+FROM\s+([A-Za-z_]\w*)/gi)) tables.add(m[1].toLowerCase())
      for (const t of tables) owners.set(t, (owners.get(t) ?? new Set()).add(componentOf(f.rel)))
    }
    return owners
  }

  /** The table names in RESILIENCE.md § "Who owns a fact" — the document IS the
   * registry, so there is no second list to keep in step with it. */
  function documented(): string[] {
    const doc = readFileSync(join(ROOT, "RESILIENCE.md"), "utf8")
    const section = doc.slice(doc.indexOf("## 2 · Who owns a fact"), doc.indexOf("## 3 ·"))
    return [...section.matchAll(/^\|\s*`([a-z_]+)`/gim)].map((m) => m[1])
  }

  it("the census can see a shared write where there definitely is one", () => {
    // THE CANARY. An empty result is the dangerous one, and this whole test is a
    // set comparison — two empty sets are equal. `users` is written by auth and by
    // tenancy today and is pinned by the suite above, so if the walker or the
    // patterns stop finding it, nothing below means anything.
    const owners = writesByComponent()
    expect(owners.get("users"), "the walker must be finding real writes").toBeTruthy()
    expect([...(owners.get("users") ?? [])].sort()).toEqual(["auth", "tenancy"])
    expect(owners.size, "and it must be seeing the whole estate, not one file").toBeGreaterThan(40)
    expect(documented().length, "and RESILIENCE.md's table must be parseable").toBeGreaterThan(2)
  })

  it("no table has two writers that RESILIENCE.md does not name", () => {
    const shared = [...writesByComponent()]
      .filter(([, components]) => components.size > 1)
      .map(([table]) => table)
      .sort()
    const undocumented = shared.filter((t) => !documented().includes(t))
    expect(
      undocumented,
      "these tables are written by more than one component and no row in RESILIENCE.md § " +
        "'Who owns a fact' says how the split works. Two components with an opinion about " +
        "one fact will eventually disagree, and no log explains it — write the split down " +
        "(or route the write through its owner)."
    ).toEqual([])
  })

  it("…and no row names a table that stopped being shared", () => {
    // The other direction, so the list can only shrink honestly. A row left
    // standing after a writer moved away is a document describing a system that
    // no longer exists, which is how a reader learns to skim it.
    const shared = new Set(
      [...writesByComponent()].filter(([, c]) => c.size > 1).map(([t]) => t)
    )
    const stale = documented().filter((t) => !shared.has(t))
    expect(
      stale,
      "RESILIENCE.md § 'Who owns a fact' lists these as written by two components and they no longer are — delete the row"
    ).toEqual([])
  })
})
