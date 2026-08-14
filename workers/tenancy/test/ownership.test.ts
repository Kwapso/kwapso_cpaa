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
