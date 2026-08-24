// A RECORD YOU CAME IN THROUGH IS STILL ON SCREEN.
//
// THE OWNER, 24 Aug 2026, on `/accounts/01KZ…/sprints/01KZ…`: the breadcrumb
// read "Account › Sprints › CONFIA-SPR0020" while the screen underneath it
// displayed "CLIENT: Confia". The client's name was right there, and the crumb
// above it said the generic word.
//
// THE CAUSE, and why it is a CLASS rather than one slip: every list in
// `useScreenData` is loaded when `module === "<its own name>"` — which was the
// entire truth until an address could nest. On a nested URL the module is the
// DEEPEST level, so an ancestor's list is never asked for, so `recordLabel` in
// crumbs.ts finds nothing to look the name up in and falls back to its section
// title. Nothing errors. The crumb just quietly says less than it knows.
//
// So the rule: if a module's record can be NAMED in a breadcrumb, its list must
// be loaded when that module is anywhere in the trail — `onScreen(x)`, not
// `module === x`. Both halves are derived from source, so a record type added
// next year is covered without anybody remembering this file exists.

import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")

function read(rel: string): string {
  const [file] = sourceFiles(join(ROOT, dirname(rel)), {
    extensions: [rel.split("/").pop() as string],
    relativeTo: ROOT,
    recursive: false,
  })
  if (!file) throw new Error(`${rel} not found — did it move?`)
  return stripComments(file.source)
}

/** WHICH MODULES A BREADCRUMB CAN NAME — read out of `recordLabel` itself, which
 * is the one function that turns a module + id into a person-readable name. Its
 * shape is a run of `module === "x"` tests, one per record type. */
function namedModules(): string[] {
  const body = read("web/components/deep-link/crumbs.ts")
  const start = body.indexOf("function recordLabel")
  expect(start, "recordLabel moved or was renamed — this check reads it by name").toBeGreaterThan(-1)
  const fn = body.slice(start, body.indexOf("\n}", start))
  return [...new Set([...fn.matchAll(/module === "([a-z_]+)"/g)].map((m) => m[1]))]
}

/** How `useScreenData` decides to load each module's list: the ancestor-aware
 * `onScreen("x")`, or the flat `module === "x"` that predates nesting. */
function loadingConditions(): { onScreen: Set<string>; flat: Set<string> } {
  const body = read("web/lib/use-screen-data.ts")
  return {
    onScreen: new Set([...body.matchAll(/onScreen\("([a-z_]+)"\)/g)].map((m) => m[1])),
    flat: new Set([...body.matchAll(/module === "([a-z_]+)"/g)].map((m) => m[1])),
  }
}

/** Modules whose crumb label needs no list of their own, with the reason. Data,
 * and rot-checked below, so this can only shrink. */
const NO_LIST_NEEDED: Record<string, string> = {
  roles: "loaded across the whole team area already (it also backs the role picker and the invite form), so it is never absent on a nested address.",
  invites:
    "loaded across the whole team area already, because it backs the section tab's count badge.",
  tickets:
    "recordLabel returns the constant \"Ticket\" for it — there is no name to look up, so no list can supply one.",
}

describe("a record named in a breadcrumb has its list loaded, however deep the address", () => {
  const named = namedModules()

  it("there are modules to check — this cannot pass by finding nothing", () => {
    expect(named.length).toBeGreaterThan(4)
  })

  it("every module a crumb can name is loaded when it is an ANCESTOR too", () => {
    const { onScreen, flat } = loadingConditions()
    const blind = named.filter(
      (m) => !onScreen.has(m) && flat.has(m) && !(m in NO_LIST_NEEDED)
    )
    expect(
      blind,
      `these back a breadcrumb label but their list only loads when they are the ` +
        `DEEPEST level, so a nested address shows the section's generic word instead ` +
        `of the record's name — with the name usually visible on the same screen. ` +
        `Use onScreen("x") rather than module === "x" in use-screen-data.ts: ` +
        `${blind.join(", ")}`
    ).toEqual([])
  })

  it("the exemptions are all still real modules", () => {
    for (const m of Object.keys(NO_LIST_NEEDED))
      expect(
        named,
        `NO_LIST_NEEDED names "${m}", which no longer appears in recordLabel — delete the line.`
      ).toContain(m)
  })

  it("…and none of them has quietly gained an ancestor-aware read", () => {
    // If one did, the exemption is no longer carrying anything and should go,
    // so the list stays a record of real decisions rather than old ones.
    const { onScreen } = loadingConditions()
    for (const m of Object.keys(NO_LIST_NEEDED))
      expect(
        onScreen.has(m),
        `"${m}" is now loaded with onScreen(), so its NO_LIST_NEEDED reason is stale — delete the line.`
      ).toBe(false)
  })
})
