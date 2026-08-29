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
