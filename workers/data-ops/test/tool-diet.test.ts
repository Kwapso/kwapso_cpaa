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

import { TOOL_GATES } from "@shared/workers/tool-gates"
import { toolSpecs } from "../src/lib/tools"

const names = (held?: ReadonlySet<string>) => new Set(toolSpecs(held).map((t) => t.name))

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
