import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// THE UNAUTHENTICATED DOOR MUST NOT CRASH ON A WRONG-TYPED FIELD.
//
// `POST /api/auth/email/start` with `{"email": 123}` used to be a 500: the code
// read `body.email ?? ""` and handed a number to `.trim()`. Three things made
// that worse than an ordinary bug. It is reachable by ANYONE — no session, both
// public doors. It crashes BEFORE the send throttle runs, so none of the
// throttle's ceilings apply. And the worker's catch writes an `error_logs` row
// into the GLOBAL core database on every 500 — so a stranger in a loop is an
// unauthenticated write into the one database every team shares.
//
// TypeScript could never have caught it: `as { email?: string }` is a claim
// about a JSON body, not a fact. Only a runtime check is a check.
//
// The second half is why this is one test and not two. Auth's catch had no
// GuardError branch — every sibling worker maps refusals first, auth went
// straight to 500. So adding validation WITHOUT that branch would have turned
// each intended 400 into exactly the 500 the validation existed to prevent.

const SRC = readFileSync(join(__dirname, "../src/index.ts"), "utf8")

/** Comment-stripped source: a rule satisfied by prose is not satisfied. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

describe("auth validates at the boundary", () => {
  it("reads no request field without checking its type", () => {
    // EVERY use of a body field, not just the one shape the old bug had. An
    // earlier version of this test only looked for `body.x ?? ""`, and a cast
    // — `(body.email as string) ?? ""` — walked straight past it. So the rule
    // is positional: a body field may appear ONLY as the first argument to a
    // validator. Anything else is the field being trusted.
    const raw: string[] = []
    for (const m of CODE.matchAll(/body\.\w+/g)) {
      const before = CODE.slice(Math.max(0, (m.index ?? 0) - 40), m.index)
      if (!/(requireText|optionalText|queryText)\($/.test(before.trimEnd())) raw.push(m[0])
    }
    expect(
      raw,
      `these body fields are used without passing through a validator: ${raw.join(", ")}`
    ).toEqual([])
  })

  it("puts every body field through the one validation seam", () => {
    expect(CODE, "auth must import the shared validator").toMatch(
      /requireText[\s\S]{0,80}from "\.\.\/\.\.\/\.\.\/shared\/workers\/validate"/
    )
    // Every door that reads a body must validate: email start, verify, and both
    // halves of the email change.
    const uses = (CODE.match(/requireText\(/g) ?? []).length
    expect(uses, "every body field auth reads must go through requireText").toBeGreaterThanOrEqual(6)
  })

  it("answers a refusal as a refusal, not as a crash", () => {
    const at = CODE.indexOf("} catch (e)")
    expect(at, "the central catch must exist").toBeGreaterThan(-1)
    const body = CODE.slice(at, at + 500)
    expect(body, "GuardError must be mapped BEFORE anything else").toMatch(
      /if \(e instanceof GuardError\) return fail\(/
    )
    // And it must come first — a recordWorkerError above it would mean every
    // 400 still writes a row to the global database.
    const guardAt = body.indexOf("instanceof GuardError")
    const recordAt = body.indexOf("recordWorkerError")
    expect(guardAt, "the refusal branch must precede the crash recording").toBeLessThan(
      recordAt === -1 ? Number.MAX_SAFE_INTEGER : recordAt
    )
  })
})
