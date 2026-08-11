// The INPUT-BOUNDARY contract (shared/workers/validate.ts). Adversarial probing of
// staging found that the old `body.field?.trim()` pattern threw a TypeError → 500
// on a non-string / over-long / NUL-containing value instead of a clean 400. These
// helpers are the fix; this test locks their behavior so the 500s can't come back.

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { GuardError } from "@shared/workers/gating"
import { MENTIONS_LIMIT } from "@shared/workers/limits"
import { optionalText, queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"

const NUL = String.fromCharCode(0)

function thrown(fn: () => unknown): GuardError | null {
  try {
    fn()
    return null
  } catch (e) {
    return e instanceof GuardError ? e : null
  }
}

describe("requireText", () => {
  it("returns the trimmed string for valid input", () => {
    expect(requireText("  hello  ", "Field")).toBe("hello")
  })

  it("throws a 400 GuardError for non-string types (the 500 bug)", () => {
    for (const bad of [12345, ["a"], { x: 1 }, true, null, undefined]) {
      const err = thrown(() => requireText(bad, "Field"))
      expect(err, `non-string ${JSON.stringify(bad)} must be a clean 400`).toBeInstanceOf(GuardError)
      expect(err?.status).toBe(400)
      expect(err?.code).toBe("invalid_input")
    }
  })

  it("throws a 400 for blank / whitespace-only", () => {
    expect(thrown(() => requireText("", "Field"))?.status).toBe(400)
    expect(thrown(() => requireText("   ", "Field"))?.status).toBe(400)
  })

  it("throws a 400 when over the length cap", () => {
    const ok = "a".repeat(TEXT_LIMITS.short)
    expect(requireText(ok, "Field", TEXT_LIMITS.short)).toBe(ok)
    expect(thrown(() => requireText("a".repeat(TEXT_LIMITS.short + 1), "Field", TEXT_LIMITS.short))?.status).toBe(400)
  })

  it("strips embedded NUL bytes (SQLite rejects them → was a 500)", () => {
    expect(requireText(`a${NUL}b`, "Field")).toBe("ab")
  })
})

describe("optionalText", () => {
  it("maps null/undefined/blank to undefined", () => {
    expect(optionalText(undefined, "Field")).toBeUndefined()
    expect(optionalText(null, "Field")).toBeUndefined()
    expect(optionalText("   ", "Field")).toBeUndefined()
  })

  it("returns the trimmed string for a present value, NULs stripped", () => {
    expect(optionalText("  hi  ", "Field")).toBe("hi")
    expect(optionalText(`x${NUL}y`, "Field")).toBe("xy")
  })

  it("throws a 400 GuardError for non-string types (the 500 bug)", () => {
    for (const bad of [5, ["a"], { a: 1 }, true]) {
      const err = thrown(() => optionalText(bad, "Field"))
      expect(err, `non-string ${JSON.stringify(bad)} must be a clean 400`).toBeInstanceOf(GuardError)
      expect(err?.status).toBe(400)
    }
  })

  it("throws a 400 when over the length cap", () => {
    expect(thrown(() => optionalText("a".repeat(TEXT_LIMITS.long + 1), "Field", TEXT_LIMITS.long))?.status).toBe(400)
  })
})

describe("queryText — the QUERY half of the same boundary", () => {
  it("caps by default at the short limit (an id/cursor/facet is short)", () => {
    const ok = "a".repeat(TEXT_LIMITS.short)
    expect(queryText(ok, "Id")).toBe(ok)
    const err = thrown(() => queryText("a".repeat(TEXT_LIMITS.short + 1), "Id"))
    expect(err, "an over-long query parameter must be a clean 400, not a giant SQL string").toBeInstanceOf(GuardError)
    expect(err?.status).toBe(400)
  })

  it("maps a missing/blank parameter to undefined, and trims + strips NULs", () => {
    expect(queryText(null, "Id")).toBeUndefined()
    expect(queryText("", "Id")).toBeUndefined()
    expect(queryText("   ", "Id")).toBeUndefined()
    expect(queryText("  01H  ", "Id")).toBe("01H")
    expect(queryText(`a${NUL}b`, "Id")).toBe("ab")
  })
})

/* ------------------------------------------------------------------------- */

const ROOT = join(__dirname, "..", "..", "..") // repo root (workers/content/test → .)

/** Every route-handler source in the workers that own team data. auth / mcp /
 * realtime are excluded on purpose: they parse no team query parameter into a
 * statement, and each is another lane's file — a scan that reaches into them
 * would couple this check to work it doesn't guard. */
const ROUTE_DIRS = [
  "workers/tenancy/src/routes",
  "workers/content/src/routes",
  "workers/data-ops/src/routes",
]

/** The name of the function call `at` sits inside: walk back to the first
 * unmatched `(`, then read the identifier in front of it. "" when nothing encloses. */
function enclosingCall(src: string, at: number): string {
  let depth = 0
  for (let i = at - 1; i >= 0; i--) {
    if (src[i] === ")") depth++
    else if (src[i] === "(") {
      if (depth === 0) return /([A-Za-z_$][\w$]*)\s*$/.exec(src.slice(0, i))?.[1] ?? ""
      depth--
    }
  }
  return ""
}

describe("no query parameter reaches a handler uncapped", () => {
  it("every searchParams.get() in a route is wrapped by the queryText seam", () => {
    const offenders: string[] = []
    let seen = 0
    for (const dir of ROUTE_DIRS) {
      for (const name of readdirSync(join(ROOT, dir))) {
        if (!name.endsWith(".ts")) continue
        const src = readFileSync(join(ROOT, dir, name), "utf8")
        for (const m of src.matchAll(/searchParams\.get\(/g)) {
          seen++
          // The call this one sits INSIDE must be the seam. `Number(...)` is the one
          // other honest wrapper — a numeric parse can't carry length into a
          // statement. (Read the enclosing name rather than the 120 chars before:
          // `queryText(new URL(request.url).searchParams.get(` has its own parens
          // in between, and a text-window regex quietly mis-reads that as unwrapped.)
          if (["queryText", "Number"].includes(enclosingCall(src, m.index))) continue
          const line = src.slice(0, m.index).split("\n").length
          offenders.push(`${dir}/${name}:${line}`)
        }
      }
    }
    // Tripwire: a scan that finds nothing reports "all clear" like a passing one.
    expect(seen, "the query-parameter scan found no searchParams.get calls — it has gone blind").toBeGreaterThan(10)
    expect(
      offenders,
      `a query parameter is read raw — put it through queryText() so an over-long value is a 400, not a 500: ${offenders.join(", ")}`
    ).toEqual([])
  })

  it("a help reply's @mentions are capped (an unbounded list is an unbounded send)", () => {
    const src = readFileSync(join(ROOT, "workers/content/src/routes/help.ts"), "utf8")
    expect(src, "the mention list must be de-duped before it is counted").toMatch(
      /new Set\(body\.taggedUserIds\.filter/
    )
    expect(src, "the mention list must be refused past MENTIONS_LIMIT").toMatch(
      /tagged\.length > MENTIONS_LIMIT/
    )
    expect(MENTIONS_LIMIT).toBeGreaterThan(0)
  })
})
