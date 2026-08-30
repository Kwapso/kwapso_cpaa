// THE CATALOGUE IS A BILL, NOT A MENU.
//
// 191 tool definitions are ~109 KB of the ~130 KB preamble re-sent on every model
// turn, so each tool costs about $5 a month at the owner's stated volume before
// it is ever called (prompt-cache.test.ts derives it). Describing
// `remove_member` to a Viewer is money spent on a door that will refuse them.
//
// `toolSpecs(held)` drops what a role could never call. It changes no permission
// — every tool still runs through the real gated door AS the user, and the door
// is still the authority — so the only thing that can go wrong here is the
// assistant losing an ability it should have had. These lock the two directions
// that would cause it, both of which fail OPEN.

import { describe, expect, it } from "vitest"

import { QUERY_MODULES } from "@shared/workers/query-grammar"
import { SHARED_TOOLS } from "@shared/workers/tool-catalog"
import { TOOL_GATES } from "@shared/workers/tool-gates"
import { REPLACED_BY_QUERY, toolSpecs } from "../src/lib/tools"
// The same census R19/R22/R27 stand on (workers/mcp/test/door-census.ts),
// reused rather than re-scanned — a second scan of the same source is exactly
// the drift this repo's own header warns about.
import { DOORS, doorParams, fnBody, moduleLibSources, routesSource, type Door } from "../../mcp/test/door-census"

const names = (held?: ReadonlySet<string>) => new Set(toolSpecs(held).map((t) => t.name))

describe("the tools the GRAMMAR replaced are gone from this surface, and only those", () => {
  // `query_records` asks any module a question, so a tool whose whole job was
  // "give me this collection, narrowed by these three words" became a second way
  // of saying something the grammar says better — and a second way is not free
  // where every definition is re-sent on every model step.
  //
  // The bar for a line in REPLACED_BY_QUERY is that the grammar is a STRICT
  // SUPERSET of that door's own narrowing. These hold the two halves of it: the
  // name must still be a real shared read, and the module must still be one the
  // grammar can actually be asked about — so a line cannot outlive the
  // capability that replaced it, which is how a diet turns into a gap.
  it("every replaced tool is still a real shared READ", () => {
    for (const name of Object.keys(REPLACED_BY_QUERY)) {
      const shared = SHARED_TOOLS.find((t) => t.name === name)
      expect(shared, `${name} is listed as replaced but is no longer a shared tool — delete the line`).toBeDefined()
      expect(shared!.method, `${name} is a write; the grammar replaces reads only`).toBe("GET")
    }
  })

  it("every reason names a module the grammar can be asked about", () => {
    for (const [name, why] of Object.entries(REPLACED_BY_QUERY)) {
      expect(why.length, `${name} needs a reason someone can disagree with`).toBeGreaterThan(40)
      const named = Object.keys(QUERY_MODULES).filter((m) => why.includes(`\`${m}\``))
      expect(
        named.length,
        `${name}'s reason must name the query module that replaced it, in backticks — it says: ${why}`
      ).toBe(1)
    }
  })

  it("…and none of them is still offered to the model", () => {
    const offered = new Set(toolSpecs().map((t) => t.name))
    for (const name of Object.keys(REPLACED_BY_QUERY))
      expect(offered.has(name), `${name} is listed as replaced but is still in the catalogue`).toBe(false)
    // The replacement itself must be there, or the diet is just a loss.
    expect(offered.has("query_records")).toBe(true)
    expect(offered.has("describe_module")).toBe(true)
  })
})

/** THE STRICT-SUPERSET BAR, CHECKED — the sentence at the top of
 * `REPLACED_BY_QUERY` in tools.ts states it and nothing before this enforced
 * it: "every parameter it parses maps to a declared field". The tests above
 * prove the module NAME is real and the tool is gone; neither ever asked
 * whether the grammar can actually SAY what the door's own `q` search says.
 *
 * `q` is the case that matters, because it is the one filter these doors
 * spread across SEVERAL columns rather than one. Deleting the `guests` field
 * this fold was built to add left every other check in this file green — the
 * name is still real, the module is still named, the tool is still gone — so
 * the gap it closes was provable only by reading the door's OWN source for
 * which columns its `q` really touches. That is what this does, the same way
 * R19 derives a tool's obligations: off disk, never hand-listed.
 *
 * TWO HOPS, not one. A door's handler does not build its own WHERE clause —
 * `getMeetings` calls `listMeetings`, and `listMeetings` calls `whereFor`,
 * which is where the LIKE clause actually lives (`getAccounts` →
 * `listAccounts` → `accountsWhere`, `getApps` → `listApps` → `appsWhere`, the
 * same shape three times). One hop would read the door's own handler and find
 * nothing; this follows calls into the module's lib source until the trail
 * goes cold. */
function reachableLibBodies(door: Door): string {
  const libSrcs = moduleLibSources(door)
  const calledNames = (src: string) => [...new Set([...src.matchAll(/\b([a-zA-Z_]\w*)\s*\(/g)].map((m) => m[1]))]
  const bodies: string[] = []
  const seen = new Set<string>()
  let frontier = calledNames(fnBody(routesSource(door), door.handler))
  // Bounded rather than fully recursive: the real call chains here are two
  // hops deep, and a bound stops a false match (a name that happens to
  // collide with an unrelated function elsewhere) from wandering forever.
  for (let hop = 0; hop < 4 && frontier.length; hop++) {
    const next: string[] = []
    for (const name of frontier) {
      if (seen.has(name)) continue
      seen.add(name)
      const src = libSrcs.find((s) => fnBody(s, name))
      if (!src) continue
      const body = fnBody(src, name)
      bodies.push(body)
      next.push(...calledNames(body))
    }
    frontier = next
  }
  return bodies.join("\n")
}

/** Every column a LIKE clause compares — `LOWER(m.title) LIKE ?`, `p.name LIKE
 * ?`, bare `name LIKE ?` all included, because the three folded doors that
 * take `q` spell it three different ways (meetings lower-folds and aliases,
 * processes aliases without folding, accounts does neither). */
function likeColumns(src: string): string[] {
  return [
    ...new Set(
      [...src.matchAll(/(?:LOWER\()?(?:[a-zA-Z_]\w*\.)?([a-zA-Z_]\w*)\)?\s*LIKE\s*\?/g)].map((m) => m[1])
    ),
  ]
}

describe("the strict-superset bar: a folded door's own `q` search, read off its source", () => {
  const withQ = Object.entries(REPLACED_BY_QUERY).flatMap(([toolName, why]) => {
    const shared = SHARED_TOOLS.find((t) => t.name === toolName)
    const door = shared && DOORS.find((d) => d.method === shared.method && d.path === shared.path)
    if (!door || !doorParams(door).includes("q")) return []
    const modName = Object.keys(QUERY_MODULES).find((m) => why.includes(`\`${m}\``))
    return modName ? [{ toolName, door, modName }] : []
  })

  it("finds the doors this half of the law actually governs (must not go blind)", () => {
    // Pinned so a future refactor that renames a handler silently drops a door
    // out of the census is a failing count, not a check that quietly checks
    // nothing. Grows only when a new folded tool takes a `q`.
    //
    // `list_apps` IS NOT HERE, and it is a gap in `doorParams` rather than in
    // this check or in the grammar: `getApps` (workers/tenancy/src/routes/
    // processes.ts) reads `const params = new URL(request.url).searchParams`
    // and then `params.get("q")` — `doorParams`'s own regex looks for the
    // literal text `searchParams.get(`, so a door that names the variable
    // anything else is invisible to it, exactly as `getAppModules` two
    // handlers below it is. Checked by hand instead: `appsWhere`
    // (workers/tenancy/src/lib/processes.ts) is `name LIKE ? ESCAPE '\\'`
    // alone, and `QUERY_MODULES.apps` already declares `name` — no capability
    // loss, just an oracle that cannot see this one door. Flagged separately
    // rather than patched here, because `doorParams` is R19/R22/R27's shared
    // oracle and widening it belongs in its own reviewed change, not folded
    // silently into a fix for a different law.
    expect(withQ.map((w) => w.toolName)).toEqual(
      expect.arrayContaining(["list_accounts", "list_processes", "list_meetings"])
    )
  })

  for (const { toolName, door, modName } of withQ) {
    it(`${toolName}'s "q" reaches every column the grammar can express on \`${modName}\``, () => {
      const cols = likeColumns(reachableLibBodies(door))
      expect(
        cols.length,
        `${toolName}'s door takes "q" but no LIKE clause turned up within four calls of its handler — ` +
          `the scan's own reach needs widening before this check means anything for it`
      ).toBeGreaterThan(0)
      const declared = new Set(QUERY_MODULES[modName].fields.map((f) => f.column))
      const missing = cols.filter((c) => !declared.has(c))
      expect(
        missing,
        `${toolName}'s "q" reaches column(s) ${missing.join(", ")} on \`${modName}\` that the grammar has ` +
          `no field for — folding this tool into query_records without one is exactly the capability loss ` +
          `this check exists to catch (declare the missing field, or take the tool back out of REPLACED_BY_QUERY)`
      ).toEqual([])
    })
  }
})

describe("toolSpecs — fewer tools, never fewer than the door allows", () => {
  it("no argument means the whole catalogue, exactly as before", () => {
    // The shape of the fail-open promise. A permissions read that throws hands
    // `undefined` here, and that must be indistinguishable from the behaviour
    // that shipped before any of this existed.
    const all = toolSpecs()
    expect(all.length).toBeGreaterThan(150)
    expect(new Set(all.map((t) => t.name)).size, "duplicate tool names in the catalogue").toBe(all.length)
  })

  it("an empty sheet still offers every UNGATED tool, and no gated one", () => {
    // A role with nothing at all. Everything TOOL_GATES classifies disappears;
    // everything it does not is kept, because an undeclared gate means "nobody
    // has classified this", never "nobody may call it".
    const nothing = names(new Set<string>())
    for (const n of nothing)
      expect(TOOL_GATES[n], `"${n}" survived an empty rights sheet but declares a gate`).toBeUndefined()
    const all = names()
    expect(nothing.size, "an empty sheet removed nothing — the filter is not wired").toBeLessThan(all.size)
    expect(nothing.size, "an empty sheet removed everything — an ungated tool was dropped").toBeGreaterThan(0)
  })

  it("a right held keeps exactly the tools that ask for it", () => {
    const held = new Set(["accounts:create"])
    const kept = names(held)
    const wanted = Object.entries(TOOL_GATES)
      .filter(([, g]) => g === "accounts:create")
      .map(([n]) => n)
    expect(wanted.length, "no tool gates on accounts:create any more — re-point this test").toBeGreaterThan(0)
    for (const n of wanted) expect(kept.has(n), `holding accounts:create must keep "${n}"`).toBe(true)
    // …and it does NOT leak a neighbouring right on the same module.
    for (const [n, g] of Object.entries(TOOL_GATES))
      if (g === "accounts:delete") expect(kept.has(n), `"${n}" needs accounts:delete and was kept`).toBe(false)
  })

  it("every right in the sheet gives back the whole catalogue", () => {
    // An owner loses nothing. If this ever fails, some tool's gate string is not
    // a right any role can hold — which is R36's `offered-rights` fault seen
    // from the other end, and it would silently retire a working tool.
    const everything = new Set(Object.values(TOOL_GATES))
    expect(names(everything).size).toBe(names().size)
  })

  it("the filter is the ONLY thing that shrinks it — no name is invented", () => {
    const all = names()
    for (const n of names(new Set(Object.values(TOOL_GATES))))
      expect(all.has(n), `"${n}" appeared only when rights were passed`).toBe(true)
  })
})
