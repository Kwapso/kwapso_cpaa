// The button can't come back on its own.
//
// The server refuses to create a team (workers/tenancy/test/team-cap.test.ts).
// This is the other half: the UI must not OFFER it. A menu item that always ends
// in "this app runs as one team" is worse than no menu item — it advertises a
// feature, then blames the person for wanting it.
//
// Source-scan, like the rule tests, because the thing being checked is that the
// guard is written at all. A component that renders the create path without
// consulting shared/product.ts fails here rather than in someone's sidebar.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { TEAM_CREATION_CLOSED } from "@shared/product"

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..")
const read = (p: string) => readFileSync(join(WEB, "components", p), "utf8")

describe("one team: the UI offers no way to make another", () => {
  it("is actually closed (the checks below mean nothing otherwise)", () => {
    expect(TEAM_CREATION_CLOSED).toBe(true)
  })

  for (const [file, what] of [
    ["team-switcher.tsx", "the sidebar's Create team item"],
    ["app-shell.tsx", "the create-team dialog"],
  ] as const) {
    it(`${what} is guarded by the product flag`, () => {
      const src = read(file)
      expect(
        src.includes("TEAM_CREATION_CLOSED"),
        `${file} renders a team-creation path — guard it with TEAM_CREATION_CLOSED from @shared/product`
      ).toBe(true)
      // The guard has to NEGATE the flag; importing it and ignoring it would
      // pass a naive check while still showing the button.
      expect(
        /!TEAM_CREATION_CLOSED/.test(src),
        `${file} imports the flag but doesn't gate on it`
      ).toBe(true)
    })
  }
})
