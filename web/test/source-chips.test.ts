// THE SOURCE CHIPS — which doors one conversation reads from.
//
// A chip that ticks and unticks is trivial. What matters is what the chips MEAN
// at the two places a mistake would be silent, and both are here:
//
//   1. "NOTHING NAMED" IS EVERY DOOR, NEVER NONE. All six are on by default, so
//      "nothing named" is exactly what a person who has never touched them
//      sends. Reading it as "search nothing" would turn the default state into a
//      base that answers no questions — and it would do it quietly, because a
//      refusal is a legitimate answer here (R23).
//   2. EVERY CHIP HAS A WORD. A key with no label renders as `records` or
//      `portal_login` on screen, which is what the Kind filter did before
//      somebody noticed.
//
// The narrowing ITSELF — that naming a chip really changes which passages come
// back — is proved where it happens, against a real index and a real database:
// workers/content/test/knowledge-coverage.test.ts, mutation-proved by deleting
// the clause. This file is the half that lives on this side of the wire.

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { kindsForChips, SOURCE_CHIPS, SOURCE_CHIP_KEYS } from "@shared/knowledge-chips"

describe("what a set of chips means", () => {
  it("nothing named is EVERY door, never none", () => {
    // Null is the shape `retrieve` reads as "do not narrow".
    expect(kindsForChips(undefined)).toBeNull()
    expect(kindsForChips(null)).toBeNull()
    expect(kindsForChips([])).toBeNull()
    // …and so is a list of keys nobody declared: a typo must not switch the
    // knowledge base off.
    expect(kindsForChips(["not-a-chip"])).toBeNull()
  })

  it("naming a chip resolves to exactly its kinds", () => {
    expect(kindsForChips(["mail"])).toEqual(["email"])
    expect(kindsForChips(["meetings"])?.sort()).toEqual(["event", "meeting"])
    // Two chips are the union, de-duplicated.
    const two = kindsForChips(["mail", "drive"]) ?? []
    expect(two.sort()).toEqual(["document", "email"])
  })

  it("every chip on resolves to every kind the chips cover", () => {
    const all = kindsForChips([...SOURCE_CHIP_KEYS]) ?? []
    const declared = SOURCE_CHIPS.flatMap((c) => [...c.kinds])
    expect(all.sort()).toEqual([...new Set(declared)].sort())
    expect(all.length, "the chips cover a real corpus, not a stub").toBeGreaterThan(10)
  })
})

describe("every chip has a word a person can read", () => {
  // Read off the disk rather than by rendering: the map is a local inside the
  // panel's own component, and what this asserts is that no chip key can reach a
  // screen as its raw key — the failure the knowledge Kind filter already had
  // once, where "sprint" and "account_links" sat beside "From a ticket".
  const panel = readFileSync(
    join(__dirname, "..", "components", "agent-panel.tsx"),
    "utf8"
  )
  const map = /const LABEL: Record<string, string> = \{([\s\S]*?)\n  \}/.exec(panel)

  it("the label map parsed — this scan has not gone blind", () => {
    expect(map).toBeTruthy()
  })

  it("names every chip, and invents none", () => {
    const named = [...(map as RegExpExecArray)[1].matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1])
    expect(named.sort()).toEqual([...SOURCE_CHIP_KEYS].sort())
  })

  it("and every label goes through the translator", () => {
    // R33: a chip's words are copy, and copy is asked for its translation where
    // it is said. A bare string here ships English to a reader who chose German.
    const labels = (map as RegExpExecArray)[1]
    for (const line of labels.split("\n").filter((l) => l.includes(":")))
      expect(line, `a chip label that does not ask for its translation: ${line.trim()}`).toMatch(
        /t\(/
      )
  })
})
