// R14, THE SEARCH HALF — a paged collection's search box reaches past the cursor.
//
// The law's own check (bounded-lists, in rules.test.ts) proves a growing
// collection PAGES and that a client can reach page two. It says nothing about
// the search box on top of that list, and that box was the same bug wearing
// different clothes: the library frame filters the array it holds, so on a paged
// screen typing a name searched the loaded fifty and answered "nothing" about
// everything past the cursor — under an exact badge (R16) counting all of it.
// Reported from staging as "it only searches on loaded screen".
//
// So, for every GROWING collection with a list screen (data — read off
// GROWING_COLLECTIONS, never hand-listed here):
//
//   1. its DOOR parses `q`, so there is something honest to ask;
//   2. its recipe does NOT leave the frame's own search box on, so the screen
//      cannot ship two boxes where one of them lies;
//   3. its screen wires a <PagedFind> to that collection's own cache key — the
//      same "the control and the key are one control" test bounded-lists makes
//      of <LoadMore>, and for the same reason: a file mentioning both strings
//      somewhere proves nothing.
//
// And one seam check: the FILTERED total renders through `formatSearchTotal` in
// exactly one place. A collection total and a filtered total are different
// numbers with different rules (only the second may end in "+"), so a screen
// computing its own would be the beginning of two answers to one question.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"
import { GROWING_COLLECTIONS } from "@shared/rules/registry"
import { BASE_RECIPES } from "../lib/screens"

const HERE = dirname(fileURLToPath(import.meta.url)) // web/test
const WEB = join(HERE, "..")
const ROOT = join(WEB, "..")
const read = (p: string) => readFileSync(p, "utf8")
const componentFiles = () => sourceFiles(join(WEB, "components"), { extensions: [".tsx"] }).map((f) => f.path)

/** The collections this file governs: the growing ones that have a LIST SCREEN.
 * (The activity feeds and the work logs page too, but they are read inside a
 * record's tab / a panel rather than through a searchable list recipe.) */
const SEARCHABLE = Object.entries(GROWING_COLLECTIONS).filter(([, c]) => c.listRecipe)

describe("paged-search (R14, the search half): a paged list searches the whole collection", () => {
  it("finds the collections to check (a blind scan reports all clear exactly like a passing one)", () => {
    expect(SEARCHABLE.length).toBeGreaterThanOrEqual(6)
  })

  for (const [name, c] of SEARCHABLE) {
    it(`${name}: its door parses q, its recipe leaves the frame's box off, its screen wires a find bar`, () => {
      // 1 — the door can be asked.
      expect(
        read(join(ROOT, c.routes)),
        `${name} pages (${c.why}) but its door parses no "q" — there is nothing for a search box to ask`
      ).toContain('searchParams.get("q")')

      // 2 — the frame's own (in-memory, page-one) box is off.
      const recipe = BASE_RECIPES[c.listRecipe as string]
      expect(recipe, `${name}: recipe ${c.listRecipe} must exist`).toBeDefined()
      expect(
        recipe.collection?.searchable,
        `${name} is paged, so the frame's own search box must stay off — it filters the loaded prefix, which is a search that quietly answers "no" about everything past the cursor`
      ).toBe(false)

      // 3 — …and the screen wires a find bar to THIS collection's key.
      // The window starts AT the tag — `<PagedFind<Account>` carries a generic, so
      // "up to the first `>`" would stop inside the type argument. `listKey` is
      // the bar's first prop by convention, so 300 characters is the bar's own
      // props and not the screen around it.
      const wired = componentFiles().some((f) =>
        [...read(f).matchAll(/<PagedFind[\s\S]{0,300}/g)].some((m) => m[0].includes(c.webKey))
      )
      expect(
        wired,
        `${name}'s door can be searched but no screen asks it — a <PagedFind> whose listKey is built from ${c.webKey}`
      ).toBe(true)
    })
  }

  // THE COUNT AND THE LIST ARE ONE ANSWER (R16 meets the search half).
  //
  // A find bar asks the door and renders the door's own exact total beside the
  // rows it got back — "1 meetings match". If the screen then narrows those rows
  // in the browser, the number and the list are answering two different
  // questions, and the screen says "1 meetings match" over "Nothing matched."
  // That is what the meetings list shipped: it asked for the whole meetings list (`view: "all"`,
  // correctly) and then kept only this week's rows out of the answer.
  //
  // Derived from the binding, not from a list of screens: every find-bar screen
  // names its rows in the same line (`const rows = found.active ? found.rows :
  // …`), so the check follows that name and demands that any narrowing of it
  // stands down while a find is active. A resting screen may filter as much as
  // it likes — nothing is counting it.
  it("no screen re-filters the rows a find bar gave it while a find is running", () => {
    const bindings = /const (\w+) = found\.active \? found\.rows/g
    let inspected = 0
    const offenders: string[] = []
    for (const f of componentFiles()) {
      const src = stripComments(read(f))
      for (const bind of src.matchAll(bindings)) {
        inspected++
        for (const hit of src.matchAll(new RegExp(`\\b${bind[1]}\\.filter\\(`, "g"))) {
          const line = src.slice(src.lastIndexOf("\n", hit.index) + 1, hit.index)
          if (!line.includes("found.active"))
            offenders.push(`${f.replace(`${ROOT}/`, "")}: ${bind[1]}.filter(…)`)
        }
      }
    }
    // A derivation that matches nothing reports all clear exactly like a passing
    // one — the failure this whole file was written about, one level up.
    expect(inspected, "no find-bar screen was inspected — the binding scan has gone blind").toBeGreaterThanOrEqual(5)
    expect(
      offenders,
      "these screens narrow the door's own answer in the browser, under the door's own exact count (R16) — " +
        "guard the filter with `!found.active`, or ask the door the narrower question in the first place"
    ).toEqual([])
  })

  it("the filtered total has ONE renderer, and it is the seam allowed to end in a +", () => {
    const users = componentFiles().filter((f) => read(f).includes("formatSearchTotal"))
    expect(
      users.map((f) => f.replace(`${ROOT}/`, "")),
      "formatSearchTotal is the filtered-total seam — the find bar renders it, and nothing else should hand-roll a second one beside it"
    ).toEqual([join(WEB, "components", "paged-find.tsx").replace(`${ROOT}/`, "")])
  })
})
