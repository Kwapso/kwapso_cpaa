import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import type { ScreenRecipe } from "@shared/ui/lib/recipe"
import { describe, expect, it } from "vitest"

import { sourceFiles } from "@shared/rules/source-scan"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..") // repo root

import {
  BASE_RECIPES,
  field,
  isScreenRecipe,
  resolveRecipe,
  tabCountKey,
  translateFields,
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

// A TOGGLE'S BUTTON SAYS WHAT IT WILL DO NEXT.
//
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

// A HOST-COMPOSED TABLE SPEAKS THE READER'S LANGUAGE TOO.
//
// `resolveRecipe` translates a recipe on the way to the screen, so everything
// declared in lib/screens.ts arrives in the reader's language. A screen that
// composes its OWN columns — the tasks list, the meetings "all" view — spreads
// them onto that recipe AFTERWARDS, which is after the pass has run, so those
// headings rendered in English whatever language the reader chose. Nothing could
// see it: TypeScript sees a string, and R28's catalogue check reads the SOURCE,
// where the English is correct and expected.
//
// So the rule is one function (`translateFields`) with two kinds of caller, and
// this is both halves: the function does the right thing, and no screen spreads
// columns past it.
describe("translateFields", () => {
  const shout = (english: string) => english.toUpperCase()

  it("translates the label and leaves the column alone", () => {
    const [out] = translateFields([field("assignee", "Who has it")], shout)
    expect(out.field.label).toBe("WHO HAS IT")
    expect(out.column, "a column is the name of data — translating it unbinds the screen").toBe(
      "assignee"
    )
  })

  it("translates help text when there is some, and leaves a blank one blank", () => {
    const one = field("name", "Task")
    const withHelp = [{ ...one, field: { ...one.field, helpText: "Why" } }]
    expect(translateFields(withHelp, shout)[0].field.helpText).toBe("WHY")
    // A blank must not become the translation OF a blank — `t("")` is a lookup
    // miss, and a miss answers with its own key, which is fine here and would not
    // be if the catalogue ever gained an empty entry.
    expect(translateFields([one], shout)[0].field.helpText).toBe("")
  })

  it("never mutates the fields it was handed", () => {
    const original = [field("name", "Task")]
    translateFields(original, shout)
    expect(original[0].field.label).toBe("Task")
  })

  it("is what resolveRecipe uses, so a recipe and a host table cannot disagree", () => {
    const resolved = resolveRecipe("members.detail", undefined, shout) as ScreenRecipe
    const base = BASE_RECIPES["members.detail"]
    expect(resolved.fields.map((f) => f.field.label)).toEqual(
      translateFields(base.fields, shout).map((f) => f.field.label)
    )
  })

  it("EVERY screen that spreads its own `fields` puts them through it", () => {
    // Derived from the source, not hand-listed: a new host-composed table is
    // covered the day it lands. The shape looked for is the one that broke —
    // `fields:` inside a spread recipe literal — and the only acceptable value is
    // a call to this function.
    const screens = sourceFiles([join(ROOT, "web", "components"), join(ROOT, "web-portal", "components")], {
      extensions: [".tsx"],
      relativeTo: ROOT,
    })
    const offenders: string[] = []
    for (const file of screens)
      for (const [line] of file.source.matchAll(/\{\s*\.\.\.recipe,[^}]*?\bfields:\s*([^,}\n]+)/g)) {
        const value = /\bfields:\s*([^,}\n]+)/.exec(line)?.[1]?.trim() ?? ""
        if (!value.startsWith("translateFields(")) offenders.push(`${file.rel}: fields: ${value}`)
      }
    expect(
      offenders,
      "a host-composed table's headings are the app's own words and must be translated"
    ).toEqual([])
  })
})
