// SORTING A LIST THAT PAGES, the wiring half.
//
// `workers/content/test/paged-sort.test.ts` proves the BEHAVIOUR — a row that is
// not on page one arrives at the top when you sort by it, and the whole
// collection still walks. This file proves the two things that behaviour rests
// on and that a single door's suite cannot see:
//
//   1. THE SCREEN AND THE DOOR OFFER THE SAME NAMES. A sort travels as a name
//      (`sort=deadline`), so a screen offering an option the door's menu does not
//      hold is a control that produces a clean 400 the moment somebody presses
//      it — a dropdown entry that looks like every other one and simply breaks.
//      The door's menu is read off its own source, exactly as R19 reads a door's
//      filters, so nothing here is hand-paired.
//   2. EVERY PAGED LIST SCREEN HAS THE CONTROL. Paging that no one can reach is
//      dead code wearing a law's clothes (R14's own words); an ordering the door
//      can do and no screen asks for is the same thing one verb along.
//
// …plus the two rules an ordering has to answer to on the way past: a sort name
// never reaches a statement unchecked (R20), and a menu on a door a client login
// can pass names nothing a client may not already read (R18/R21/R24).

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"
import { GROWING_COLLECTIONS } from "@shared/rules/registry"
import { COLLECTION_SORTS } from "@/lib/collection-sorts"
import { BASE_RECIPES, withDataDrivenCollection } from "@/lib/screens"

const WEB = join(__dirname, "..")
const ROOT = join(WEB, "..")
const read = (p: string) => readFileSync(p, "utf8")

/** The keys of a door's own `SortMenu`, read off the lib that declares it. The
 * menu is an object literal whose top-level keys ARE the names a caller may
 * send, so the derivation is the same shape R19's `doorParams` uses: the door's
 * source is the truth, and this file only compares. */
function doorSortNames(libPath: string): string[] {
  const src = stripComments(read(join(ROOT, libPath)))
  const at = src.search(/export const \w+_SORTS: SortMenu</)
  if (at === -1) return []
  // The literal runs to the line that closes it at column zero.
  const body = src.slice(at, src.indexOf("\n}", at))
  return [...body.matchAll(/^ {2}(\w+):\s*\{/gm)].map((m) => m[1])
}

/** Every component file in the agency app. */
const components = () =>
  sourceFiles(join(WEB, "components"), { extensions: [".tsx"] }).map((f) => f.path)

/** The collections that PAGE and have a list SCREEN — the ones a person can sort
 * from. Derived from the registry, never listed here. */
const PAGED_SCREENS = Object.entries(GROWING_COLLECTIONS).filter(([, c]) => c.listRecipe)

/** The paged collections with no sort control, each with the reason. A feed's
 * order is its meaning; offering to rearrange it is offering to break it. */
const UNSORTED: Record<string, string> = {
  // (both activity feeds are in GROWING_COLLECTIONS without a listRecipe, so
  // they never reach the loop below — this list is for a paged LIST SCREEN that
  // deliberately has none, and there is none today.)
}

describe("a paged collection's sort names are the door's own", () => {
  it("finds the doors (the derivation must not go blind)", () => {
    expect(PAGED_SCREENS.length, "no paged list screens found — the scan is reading nothing").toBeGreaterThan(4)
    for (const [name] of PAGED_SCREENS)
      if (!(name in UNSORTED))
        expect(
          COLLECTION_SORTS[name],
          `${name} is a paged list screen with no entry in COLLECTION_SORTS — give it a sort, or a reasoned UNSORTED line`
        ).toBeDefined()
  })

  for (const [name, c] of PAGED_SCREENS) {
    if (name in UNSORTED) continue
    it(`${name}: every option the screen offers is a name its door knows`, () => {
      const door = doorSortNames(c.lib)
      expect(
        door.length,
        `${c.lib} declares no SortMenu — the screen offers a sort its door cannot answer`
      ).toBeGreaterThan(1)
      const screen = COLLECTION_SORTS[name].options.map((o) => o.value)
      // SETS, not sequences: the screen decides the ORDER options appear in (the
      // one people reach for first goes first), the door decides which exist.
      expect([...screen].sort(), `${name}: screen offers ${screen} · door knows ${door}`).toEqual(
        [...door].sort()
      )
      expect(
        door.includes(COLLECTION_SORTS[name].defaultSort),
        `${name}: the default sort must be one the door knows`
      ).toBe(true)
      // Every option lands SOMEWHERE deliberate. Without a direction a date
      // option opens oldest-first, which reads as broken.
      for (const o of COLLECTION_SORTS[name].options)
        expect(o.defaultDir, `${name}.${o.value} must say which way it lands`).toMatch(/^(asc|desc)$/)
    })
  }

  it("every paged list screen actually wires the control", () => {
    // The R14 sentence about paging, said about ordering: a door that can sort
    // and a screen that never asks it to is a capability nobody has.
    for (const [name, c] of PAGED_SCREENS) {
      if (name in UNSORTED) continue
      const wired = components().some((f) => {
        const src = read(f)
        // Inside the <PagedFind> whose listKey is built from THIS collection's
        // own cache key — a file-level AND would pass on a screen that mentions
        // both and wires neither (the blind spot R14's own check names).
        //
        // A FIXED window, never one that stops at the first `>`: `<PagedFind<Account>`
        // carries a generic, so a lazy match to the tag's close ends four
        // characters in and reports every screen as unwired. Its sibling
        // paged-search.test.ts says the same thing about the same tag.
        return [...src.matchAll(/<PagedFind[\s\S]{0,900}/g)].some(
          (m) => m[0].includes(c.webKey) && m[0].includes("sorts=")
        )
      })
      expect(
        wired,
        `${name} can be ordered at the door but no screen offers it — a <PagedFind sorts=…> whose listKey is built from ${c.webKey}`
      ).toBe(true)
    }
  })

  // ── the OTHER half of the report: the collections with no control at all ──
  //
  // "There are many places in the agency app and the client portal where I have
  // no way to sort a collection." Before this lane the ONLY sortable thing in
  // either front door was a column header on two screens; every list recipe wore
  // the library's default `sortable: false`. So the bounded ones now derive a
  // control from their own columns, and this is what keeps it derived: add a
  // facet to a recipe and it becomes a sort option, with no second list to edit.
  it("every BOUNDED list recipe offers a sort, derived from its own columns", () => {
    const bounded = Object.entries(BASE_RECIPES).filter(
      ([key, r]) => key.endsWith(".list") && r.collection?.searchable
    )
    expect(bounded.length, "no bounded list recipes found — the scan is reading nothing").toBeGreaterThan(5)
    for (const [key, recipe] of bounded) {
      // One row is enough: the tuner culls a facet no row carries, so a fixture
      // that carries every column is what asks "what would this screen offer?".
      const row: Record<string, unknown> = { id: "r1" }
      for (const f of recipe.fields) row[f.column] = "x"
      for (const f of recipe.collection?.filterFacets ?? []) row[f.field] = "x"
      const tuned = withDataDrivenCollection(recipe, [row]).collection
      expect(tuned?.sortable, `${key} shows a collection with no way to order it`).toBe(true)
      const values = (tuned?.sortOptions ?? []).map((o) => o.value)
      // The first field is a row's TITLE; the rest are the facets. The SECOND
      // field is always the summary line — a sentence made of four facts — and
      // ordering by it orders by whichever fact happens to come first.
      expect(values[0], `${key}'s first sort option must be its title column`).toBe(recipe.fields[0]?.column)
      expect(values, `${key} must not offer its summary line as an order`).not.toContain("detail")
      for (const o of tuned?.sortOptions ?? [])
        expect(o.label.trim(), `${key}: every sort option needs words`).not.toBe("")
    }
  })

  it("a PAGED recipe never grows a second sort control", () => {
    // One control per screen, and it is the one that can see past the cursor —
    // the same sentence `listCollection` already makes about the search box.
    for (const [name, c] of PAGED_SCREENS) {
      const recipe = BASE_RECIPES[c.listRecipe as string]
      const tuned = withDataDrivenCollection(recipe, [{ id: "r1", name: "x" }]).collection
      expect(
        tuned?.sortable,
        `${name} pages, so its order belongs to the door — the frame must not draw a picker of its own`
      ).toBe(false)
    }
  })

  it("a sort name never reaches a statement unchecked (R20)", () => {
    // Positional, exactly as R20 reads a body field: every `resolveOrdering`
    // call must take its two request values from inside the validation seam.
    // The alternative — a door reading `searchParams.get("sort")` and handing it
    // on — is how a name from the wire ends up somewhere near an ORDER BY.
    const offenders: string[] = []
    for (const f of sourceFiles(join(ROOT, "workers"), { extensions: [".ts"], relativeTo: ROOT })) {
      const src = stripComments(f.source)
      for (const m of src.matchAll(/resolveOrdering\(([\s\S]{0,400}?)\n\s*\)/g)) {
        const args = m[1]
        // A default-ordering call passes `undefined, undefined` and touches no
        // request at all; a door's call must validate both.
        if (args.includes("undefined, undefined")) continue
        if (!/queryText\(\s*url\.searchParams\.get\("sort"\)/.test(args)) offenders.push(`${f.rel} (sort)`)
        if (!/queryText\(\s*url\.searchParams\.get\("dir"\)/.test(args)) offenders.push(`${f.rel} (dir)`)
      }
    }
    expect(
      offenders,
      `an ordering was resolved from an unvalidated request value (R20): ${offenders.join(", ")}`
    ).toEqual([])
  })

  it("no sort menu names an internal number (R24), and none builds SQL from a request", () => {
    // AN ORDERING IS A FILTER'S COUSIN. It cannot show a caller a row the fence
    // excluded — the WHERE is untouched — but a POSITION can make a hidden value
    // inferable, one binary search at a time. So a menu may only name columns the
    // row already carries to whoever asked, and never the two tables R24 keeps
    // off the client's side entirely.
    const forbidden = /internal_rates|role_rates|\bmargin\b/
    for (const [, c] of PAGED_SCREENS) {
      const src = stripComments(read(join(ROOT, c.lib)))
      const at = src.search(/export const \w+_SORTS: SortMenu</)
      if (at === -1) continue
      const body = src.slice(at, src.indexOf("\n}", at))
      expect(forbidden.test(body), `${c.lib}'s sort menu names an internal number (R24)`).toBe(false)
      // …and the SQL in it is ours. A menu entry whose `expr` were assembled at
      // runtime would be the one way a request could reach a statement here, so
      // each is either a literal or a SCREAMING_CASE constant declared in this
      // same file from a literal (TICKET_ORDER, MEETING_ORDER — the orders these
      // lists already had, reused rather than respelled).
      for (const m of body.matchAll(/expr:\s*(`[^`]*`|"[^"]*"|'[^']*'|[A-Z][A-Z_]+)/g)) {
        const expr = m[1]
        if (/^[A-Z][A-Z_]+$/.test(expr))
          expect(
            new RegExp(`const ${expr} =\\s*["'\`]`).test(src),
            `${c.lib}: ${expr} is used as a sort expression but is not a literal constant in this file`
          ).toBe(true)
      }
      expect(
        [...body.matchAll(/expr:/g)].length,
        `${c.lib}: every sort expression must be a literal or a literal constant, never built`
      ).toBe([...body.matchAll(/expr:\s*(`[^`]*`|"[^"]*"|'[^']*'|[A-Z][A-Z_]+)/g)].length)
    }
  })
})
