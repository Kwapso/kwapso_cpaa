import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { stripComments } from "@shared/rules/source-scan"

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

/** Comment-stripped source: a rule satisfied by prose is not satisfied. The ONE
 * stripper (shared/rules/source-scan.ts) — this file used to carry its own, a
 * weaker one that left TRAILING comments standing, so a `// body.email` note at
 * the end of a line still read as a body field being used. */
const CODE = stripComments(SRC)

describe("auth validates at the boundary", () => {
  it("reads no request field without checking its type", () => {
    // EVERY use of a body field, not just the one shape the old bug had. An
    // earlier version of this test only looked for `body.x ?? ""`, and a cast
    // — `(body.email as string) ?? ""` — walked straight past it. So the rule
    // is positional: a body field may appear ONLY as the first argument to a
    // validator. Anything else is the field being trusted.
    //
    // ONE OTHER POSITION, and it is deliberately the narrowest widening this
    // rule could take. `imageFieldLimit(body.x)` is the CAP-CHOOSING half of the
    // very validator on the same line: a picture field carries either a data URL
    // (measured in bytes) or a stored path (measured in characters), so the
    // ceiling has to be read off the value's own shape, and the alternative is a
    // hand-written constant sitting beside a byte limit it does not reference —
    // which is precisely the 20,000-character prose cap that silently refused
    // every logo in the app for weeks. It is admitted ONLY for a field that ALSO
    // appears as a validator's first argument, so it cannot become a way to read
    // a field without validating it: on its own it is still an offender, and the
    // strictness this file was written for is untouched.
    const validated = new Set(
      [...CODE.matchAll(/(?:requireText|optionalText|queryText)\(\s*(body\.\w+)/g)].map((m) => m[1])
    )
    const raw: string[] = []
    for (const m of CODE.matchAll(/body\.\w+/g)) {
      const before = CODE.slice(Math.max(0, (m.index ?? 0) - 40), m.index).trimEnd()
      if (/(requireText|optionalText|queryText)\($/.test(before)) continue
      if (/imageFieldLimit\($/.test(before) && validated.has(m[0])) continue
      raw.push(m[0])
    }
    expect(
      raw,
      `these body fields are used without passing through a validator: ${raw.join(", ")}`
    ).toEqual([])
  })

  it("puts every body field through the one validation seam", () => {
    expect(CODE, "auth must import the shared validator").toMatch(
      /requireText[\s\S]{0,80}from "@shared\/workers\/validate"/
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
