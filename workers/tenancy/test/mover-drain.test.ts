// THE ONE RELIEF VALVE HAS TO SURVIVE THE SIZE IT EXISTS FOR.
//
// The module mover is what an 80% size alarm tells you to run, so it is only ever
// pointed at a table that has grown too big for its database. Two of its steps
// could not survive that:
//
//   • THE COPY walked `LIMIT 250 OFFSET n`. SQLite reaches offset four million by
//     reading and discarding four million rows, so copying a big table cost O(n²)
//     reads — and the window shifted under any concurrent write, so rows could be
//     copied twice or skipped and step 3 would only notice afterwards.
//   • THE EMPTYING was one statement: `DELETE FROM <table>;`. D1 refuses a
//     statement past 30 seconds, so on a multi-million-row table that DELETE was
//     the step guaranteed to fail — AFTER the routing flip had committed. Routing
//     flipped means `resolveModuleDatabases` returns BOTH databases and every read
//     is a merged read, so a row left behind is a row returned twice: a doubled
//     list, a doubled count, doubled money, and nothing anywhere saying so.
//
// This suite reads the source, because both bugs are shapes rather than values —
// proving them behaviourally would mean standing up two real D1 databases with a
// million rows in them.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { RETENTION_DELETE_CAP } from "@shared/workers/limits"

const SRC = readFileSync(join(__dirname, "..", "src", "lib", "sharding.ts"), "utf8")

/** `moveModuleToOwnDatabase` and everything after it.
 *
 * Not brace-balanced: the signature's own return type is `Promise<{ databaseId:
 * string; movedRows: number }>`, so a naive "first `{` after the last `)`" lands
 * inside the type and matches nothing. It is the LAST function in the file, so
 * "from here to the end" is the body plus nothing — and the assertion below fails
 * loudly if that ever stops being true. */
function moverBody(): string {
  return code(moverSource())
}

/** THE CODE, WITHOUT THE PROSE. This file explains both bugs at length in
 * comments, quoting the very shapes the assertions below refuse — so a search for
 * `DELETE FROM` or `OFFSET` finds the explanation before it finds the statement,
 * and every assertion passes or fails on a paragraph. Comments are stripped first
 * so the suite reads code, which is the only thing that runs. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ")
}

function moverSource(): string {
  const at = SRC.indexOf("export async function moveModuleToOwnDatabase")
  expect(at, "the mover must exist").toBeGreaterThan(-1)
  const rest = SRC.slice(at)
  expect(
    rest.slice(1).includes("\nexport "),
    "the mover must stay the last export in sharding.ts, or this slice reads more than the mover"
  ).toBe(false)
  return rest
}

describe("the mover copies by key, not by offset", () => {
  it("never pages the source with OFFSET", () => {
    const body = moverBody()
    expect(
      body,
      "OFFSET paging over the table this tool exists for is quadratic, and its window " +
        "shifts under a concurrent write"
    ).not.toMatch(/OFFSET/)
  })

  it("walks the primary key forward instead", () => {
    const body = moverBody()
    expect(body, "the copy must seek past the last id it wrote").toMatch(/WHERE id > /)
    expect(body, "and read in that order, or 'the last id' means nothing").toMatch(/ORDER BY id/)
  })
})

describe("the mover empties the old home in bounded bites, and proves it emptied", () => {
  const body = moverBody()

  it("never sends one unbounded DELETE", () => {
    // `DELETE FROM x;` with nothing bounding it is the statement that times out.
    expect(body, "an unbounded DELETE is the one step guaranteed to fail at size").not.toMatch(
      /DELETE FROM \$\{table\};/
    )
  })

  it("bounds each DELETE with the retention cap, the way the nightly sweep does", () => {
    const at = body.indexOf("DELETE FROM")
    expect(at, "it must still delete").toBeGreaterThan(-1)
    const statement = body.slice(at, at + 200)
    expect(statement, "the same bounded-delete shape as shared/workers/retention.ts").toMatch(
      /LIMIT \$\{RETENTION_DELETE_CAP\}/
    )
    expect(RETENTION_DELETE_CAP, "and the cap must be a real number").toBeGreaterThan(0)
  })

  it("counts what is left and REFUSES rather than leaving duplicates behind", () => {
    // Routing has already flipped by this point, so "some rows left" is not a
    // warning — it is a state where every read of the module double-counts. The
    // only honest end is to name the table and stop.
    expect(body, "it must check what remains").toMatch(/SELECT COUNT\(\*\) AS n FROM \$\{table\}/)
    const at = body.indexOf("move_drain_incomplete")
    expect(at, "and throw when the source did not empty").toBeGreaterThan(-1)
    const message = body.slice(at, at + 500)
    expect(message, "the error must name the table and the database still holding rows").toMatch(
      /\$\{table\}/
    )
    expect(message.toLowerCase(), "and say why it matters, not just that it happened").toMatch(
      /duplicat|merged/
    )
  })

  it("the drain loop is itself bounded — an unbounded retry is the other way a cron dies", () => {
    expect(body).toMatch(/MOVE_DRAIN_PASSES/)
    expect(code(SRC), "and the ceiling is declared with its arithmetic").toMatch(
      /const MOVE_DRAIN_PASSES = \d+/
    )
  })
})
