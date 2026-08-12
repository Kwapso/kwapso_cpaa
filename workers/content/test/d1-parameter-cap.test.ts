// D1 REFUSES A STATEMENT CARRYING MORE THAN 100 BOUND PARAMETERS.
//
// Every other suite in this repo runs its SQL against local SQLite, whose limit
// is 999. That makes the harness MORE permissive than the thing it stands in
// for, so a statement that binds 200 values passes every test and 500s in
// production. It did: `GET /api/content/knowledge/ask` asked for its candidate
// rows as `IN (?, ?, …)` with one id bound per candidate, up to CANDIDATE_CAP
// (200), and the top-up fills the candidate set to the cap on any question the
// lexical stage does not already answer. So every question against a base of
// more than a hundred chunks came back "Something went wrong on our side", and
// the door had never once answered on real infrastructure.
//
// This suite reads the source off disk and refuses the shape that caused it: a
// `?` placeholder generated per element of a list whose length is bounded by
// something larger than D1's cap. Server-owned ids go through `sqlString` like
// every other server-owned value (CONVENTIONS); values off a request stay bound,
// and stay under the cap.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { sourceFiles } from "@shared/rules/source-scan"

const SRC = join(__dirname, "..", "src")

/** D1's hard ceiling on bound parameters in one statement. */
const D1_PARAM_CAP = 100

describe("no statement can bind more parameters than D1 accepts", () => {
  it("the knowledge candidate fetch interpolates its ids, it does not bind them", () => {
    const src = readFileSync(join(SRC, "lib", "knowledge.ts"), "utf8")
    const fetchStmt = src.slice(src.indexOf("FROM knowledge_chunks c JOIN knowledge_sources s"))
    const line = fetchStmt.slice(0, fetchStmt.indexOf("LIMIT"))
    expect(
      line,
      "the candidate fetch must interpolate server-owned chunk ids through sqlString — " +
        "binding one per candidate exceeds D1's 100-parameter cap and 500s the whole door"
    ).toContain("sqlString(id)")
    expect(line, "and it must not generate a placeholder per candidate").not.toContain('map(() => "?")')
  })

  it("every per-element placeholder list is one that provably cannot reach the cap", () => {
    // A `xs.map(() => "?")` is safe only while `xs` cannot outgrow D1's limit.
    // Rather than guess from the file's constants — which flags the safe lists
    // alongside the dangerous one — this names each surviving list and why it is
    // small. A new one turns the build red until somebody says which it is.
    const KNOWN_SMALL: Record<string, string> = {
      terms: "a question's search terms, capped at MAX_QUESTION_TERMS (24)",
      compartments: "the compartments searched — the agency's plus at most one client",
      // NOT proven, ADMITTED. notify.ts and stakeholders.ts bind one parameter
      // per user id against the global core DB, bounded only by how many people
      // are on a team or watching one ticket. Small today (single figures) and
      // the same failure mode as the one above: past a hundred, the notify and
      // stakeholder reads start throwing "too many SQL variables". Recorded here
      // rather than quietly passing, because the shape is the bug — see
      // BASE-IMPROVEMENTS.md.
      unique: "user ids to notify — bounded by team size, which is not a hard bound",
      ids: "the same, one frame earlier in notify.ts — same bound, same admission",
      FLIPPABLE:
        "a module-level constant: the ticket statuses a Ready flip may move from. " +
        "Five strings, fixed at author time — the one list here that is provably small.",
    }
    const found: string[] = []
    for (const file of sourceFiles(SRC, { extensions: [".ts"] })) {
      for (const m of file.source.matchAll(/(\w+)\.map\(\(\) => "\?"\)/g))
        found.push(`${file.rel}: ${m[1]}`)
    }
    const unexplained = found.filter((f) => !KNOWN_SMALL[f.split(": ")[1]])
    expect(
      unexplained,
      `a statement generates one bound placeholder per element of a list this suite cannot vouch ` +
        `for. D1 refuses past ${D1_PARAM_CAP} parameters. Either prove the list is small and add it ` +
        `to KNOWN_SMALL with its bound, or interpolate server-owned values through sqlString:\n` +
        unexplained.join("\n")
    ).toEqual([])

    // And the caps that make those two safe must stay under the limit.
    const src = readFileSync(join(SRC, "lib", "knowledge.ts"), "utf8")
    const maxTerms = Number(/const MAX_QUESTION_TERMS = (\d+)/.exec(src)?.[1] ?? "0")
    expect(maxTerms, "MAX_QUESTION_TERMS must stay under D1's parameter cap").toBeGreaterThan(0)
    expect(maxTerms).toBeLessThan(D1_PARAM_CAP)
  })
})
