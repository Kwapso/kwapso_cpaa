import type { ScreenRecipe } from "@kwapso/ui/lib/recipe"
import { describe, expect, it } from "vitest"

import {
  BASE_RECIPES,
  isScreenRecipe,
  resolveRecipe,
  tabCountKey,
  withoutActions,
  withTabCounts,
} from "@/lib/screens"

/** A minimal-but-valid recipe object the structural guard should accept. */
const minimalRecipe = { type: "list", fields: [], actions: [], binding: {} }

describe("isScreenRecipe", () => {
  it("accepts a minimal valid recipe object", () => {
    expect(isScreenRecipe(minimalRecipe)).toBe(true)
  })

  it("accepts the real base recipes", () => {
    expect(isScreenRecipe(BASE_RECIPES["members.detail"])).toBe(true)
  })

  it("rejects null, numbers and an empty object", () => {
    expect(isScreenRecipe(null)).toBe(false)
    expect(isScreenRecipe(42)).toBe(false)
    expect(isScreenRecipe({})).toBe(false)
  })

  it("rejects objects missing actions / fields / binding", () => {
    expect(isScreenRecipe({ type: "list", fields: [], binding: {} })).toBe(false) // no actions
    expect(isScreenRecipe({ type: "list", actions: [], binding: {} })).toBe(false) // no fields
    expect(isScreenRecipe({ type: "list", fields: [], actions: [] })).toBe(false) // no binding
  })
})

describe("resolveRecipe", () => {
  it("returns the base for a known key with no overrides", () => {
    expect(resolveRecipe("members.detail", undefined)).toBe(BASE_RECIPES["members.detail"])
    expect(resolveRecipe("members.detail", {})).toBe(BASE_RECIPES["members.detail"])
  })

  it("returns a valid override over the base", () => {
    const override = { ...minimalRecipe, type: "detail" }
    const resolved = resolveRecipe("members.detail", {
      "members.detail": JSON.stringify(override),
    })
    expect(resolved).not.toBe(BASE_RECIPES["members.detail"])
    expect(resolved?.type).toBe("detail")
  })

  it("falls back to the base for a malformed (non-recipe) override", () => {
    const resolved = resolveRecipe("members.detail", {
      "members.detail": JSON.stringify({ type: "detail" }), // missing arrays + binding
    })
    expect(resolved).toBe(BASE_RECIPES["members.detail"])
  })

  it("falls back to the base for invalid JSON", () => {
    const resolved = resolveRecipe("members.detail", { "members.detail": "{not json" })
    expect(resolved).toBe(BASE_RECIPES["members.detail"])
  })

  it("returns null for an unknown key with no base", () => {
    expect(resolveRecipe("nope.nothere", undefined)).toBeNull()
    expect(resolveRecipe("nope.nothere", {})).toBeNull()
  })
})

describe("withoutActions", () => {
  it("drops the named action ids and returns a NEW object", () => {
    const base = BASE_RECIPES["members.detail"] as ScreenRecipe
    const beforeIds = base.actions.map((a) => a.id)
    expect(beforeIds).toContain("members.changeRole")

    const next = withoutActions(base, ["members.changeRole"])
    expect(next).not.toBe(base) // fresh copy
    expect(next.actions.map((a) => a.id)).not.toContain("members.changeRole")
    expect(next.actions.map((a) => a.id)).toContain("members.remove")
  })

  it("leaves the base recipe's actions array unmutated", () => {
    const base = BASE_RECIPES["members.detail"] as ScreenRecipe
    const originalLength = base.actions.length
    withoutActions(base, ["members.changeRole", "members.remove"])
    expect(base.actions.length).toBe(originalLength)
    expect(base.actions.map((a) => a.id)).toContain("members.changeRole")
  })
})

// LAW R8 (the record-detail half) meets LAW R16 (the number). rules.test.ts
// proves every base recipe's collection tab gets badged; these lock the EDGES
// the happy path never shows — the ones a count badge actually gets wrong.
describe("tabCountKey / withTabCounts", () => {
  const memberDetail = BASE_RECIPES["members.detail"] as ScreenRecipe
  const tabs = memberDetail.tabs ?? []
  const overview = tabs.find((t) => t.key === "overview")!
  const activity = tabs.find((t) => t.key === "activity")!

  it("names the collection a tab reveals, and null for the record's own fields", () => {
    expect(tabCountKey(activity)).toBe("activity") // the feed the block names
    expect(tabCountKey(overview)).toBeNull() // a description block is the record itself
  })

  it("badges the collection tab and leaves the record's own tab alone", () => {
    const next = withTabCounts(memberDetail, { activity: 24_011 })
    expect(next.tabs?.find((t) => t.key === "activity")?.badge).toBe("24k")
    expect(next.tabs?.find((t) => t.key === "overview")?.badge).toBeUndefined()
  })

  it("renders NOTHING for zero or a total that hasn't loaded yet", () => {
    // A "0" beside Activity reads as "nothing ever happened here" — which, while
    // page one is still in flight, is a lie the badge tells for free.
    for (const total of [0, undefined]) {
      const next = withTabCounts(memberDetail, { activity: total })
      expect(next.tabs?.find((t) => t.key === "activity")?.badge).toBe("")
    }
    // A tab whose collection is missing from `totals` is the same case, not a crash.
    expect(withTabCounts(memberDetail, {}).tabs?.find((t) => t.key === "activity")?.badge).toBe("")
  })

  it("returns a fresh copy and never mutates the base recipe", () => {
    const next = withTabCounts(memberDetail, { activity: 7 })
    expect(next).not.toBe(memberDetail)
    expect(next.tabs).not.toBe(memberDetail.tabs)
    expect(activity.badge).toBeUndefined() // the shipped default is still untouched
  })

  it("leaves a recipe with no tabs (a list) exactly as it was", () => {
    const list = BASE_RECIPES["members.list"] as ScreenRecipe
    expect(withTabCounts(list, { activity: 5 })).toBe(list)
  })
})
