// IF A MODULE'S READS REFUSE A CLIENT LOGIN, SO MUST ITS WRITES.
//
// R21 is enforced (`client-reachable-doors` in rules.test.ts) and it asks exactly
// the right question — "can a caller holding the Client role's rights pass this
// door?" — which means it stops at every door the shipped role cannot reach.
// Eleven agency-only WRITE doors sat in that shadow: the learning library, the
// dropdown vocabulary and the team's own record each had `refusePortalCaller` on
// EVERY read door and on NOT ONE write door.
//
// Nothing was leaking. The seeded Client role holds no write right, so the doors
// were refuted as findings — and that is precisely the objection. R21's own text
// says the refusal belongs at the door "so it does not depend on how carefully a
// role was built", and an owner who ticks `learning: edit` on their client role
// is one checkbox away from a client editing the agency's how-to library. A
// defence that survives only because of a permission matrix somebody may change
// tomorrow is a defence with a date on it.
//
// So this asks the question R21 cannot: for each module, do the two halves AGREE?
// Nothing is hand-listed — the modules are discovered from the read doors that
// already refuse, and the writes are found in the same file.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"

const ROOT = join(__dirname, "..", "..")

/** Every route handler in a worker's routes/ directory, name → body. */
function handlers(worker: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const { source } of sourceFiles(join(ROOT, "workers", worker, "src", "routes"), {
    extensions: [".ts"],
  })) {
    const starts = [...source.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)]
    starts.forEach((m, i) =>
      out.set(m[1], stripComments(source.slice(m.index, starts[i + 1]?.index ?? source.length)))
    )
  }
  return out
}

/** The module + right a handler gates on, if it says so at its own opening. */
function gatesOf(body: string): { module: string; right: string }[] {
  return [
    ...body.matchAll(/\bgated(?:Body)?(?:<[^>]*>)?\s*\(\s*request,\s*env,\s*"(\w+)",\s*"(\w+)"/g),
    ...body.matchAll(/\brequireRight\s*\(\s*\w+,\s*\w+,\s*"(\w+)",\s*"(\w+)"/g),
  ].map((m) => ({ module: m[1], right: m[2] }))
}

describe("a module refuses a client login on both halves, or on neither", () => {
  it("every module whose reads refuse a client login refuses them on its writes too", () => {
    // door → { module, right, refuses }, for every gated door in the three
    // workers R21 walks.
    type Door = { key: string; module: string; right: string; refuses: boolean }
    const doors: Door[] = []
    for (const worker of ["tenancy", "content", "data-ops"]) {
      const index = readFileSync(join(ROOT, "workers", worker, "src", "index.ts"), "utf8")
      const table = /export const ROUTES[^=]*=\s*\{([\s\S]*?)\n\}/.exec(index)
      expect(table, `workers/${worker} has no ROUTES table — did it move?`).toBeTruthy()
      const fns = handlers(worker)
      for (const [, door, handler] of (table as RegExpExecArray)[1].matchAll(
        /"([A-Z]+ \/[^"]+)":\s*\{\s*handler:\s*(\w+)/g
      )) {
        const body = fns.get(handler)
        if (!body) continue
        for (const g of gatesOf(body))
          doors.push({
            key: `${door} (${worker}/${handler})`,
            module: g.module,
            right: g.right,
            refuses: /refusePortalCaller\s*\(/.test(body),
          })
      }
    }
    expect(doors.length, "no gated doors parsed — this test is reading nothing").toBeGreaterThan(20)

    // DISCOVERED, not listed: a module is "agency-only" because every one of its
    // READ doors already says so in code. That is the whole derivation — add a
    // module tomorrow and it joins the set the day its reads refuse.
    const agencyOnly = new Set<string>()
    for (const module of new Set(doors.map((d) => d.module))) {
      const reads = doors.filter((d) => d.module === module && d.right === "read")
      if (reads.length > 0 && reads.every((d) => d.refuses)) agencyOnly.add(module)
    }
    // Pinned so a SHRINKING set is a failure rather than a quiet pass: if a read
    // door loses its refusal, this derivation would stop calling its module
    // agency-only and the writes below would stop being checked — the test would
    // go green by learning less. The team's own record and the screen recipes are
    // NOT here, and that is the derivation being honest rather than incomplete:
    // their read doors gate on identity (`teamContext`), not on a module right,
    // so there is no `<module>:read` gate for this scan to read. They are named
    // by hand below, which is the only place in this file anything is.
    expect(
      [...agencyOnly].sort(),
      "the modules whose reads refuse a client login — if this set shrinks, a read door lost its refusal"
    ).toEqual(["learning", "selectable_data"])

    const asymmetric = doors
      .filter((d) => agencyOnly.has(d.module) && d.right !== "read" && !d.refuses)
      .map((d) => `${d.key} [${d.module}:${d.right}]`)
    expect(
      asymmetric,
      `these doors WRITE to a module whose reads all refuse a client login, and do not refuse one themselves. The shipped Client role cannot reach them today; R21's point is that the door must not depend on that: ${asymmetric.join(", ")}`
    ).toEqual([])
  })

  // The two the derivation above cannot see. Their READ siblings refuse a client
  // login (`getScreens`, and `active` / `switch-team` / `team-meta` through
  // agencyContext) but they gate on identity rather than on `teams:read`, so no
  // module gate exists for the scan to pair them with. Named here rather than
  // left out: an unwatched door is how the write half got missed in the first place.
  it("the team's own record and its screen recipes refuse one on the write half too", () => {
    const cases = [
      ["tenancy", "postUpdateTeam"],
      ["tenancy", "postScreen"],
    ] as const
    for (const [worker, handler] of cases) {
      const body = handlers(worker).get(handler)
      expect(body, `${worker}/${handler} has moved — re-read this list`).toBeTruthy()
      expect(body, `${handler} writes the agency's own record and must refuse a client login`).toMatch(
        /refusePortalCaller\s*\(/
      )
    }
  })
})
