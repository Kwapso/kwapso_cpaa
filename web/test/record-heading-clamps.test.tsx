// A RECORD'S NAME DOES NOT TAKE THE SCREEN.
//
// The owner opened a ticket on 1 Sep 2026 and got roughly 1,800 characters of
// German prose set at the heading step, filling the viewport before one field of
// the record. The cause is measured and is NOT "somebody wrote a long title":
// on staging's Kwapso team database, `help` holds 2,050 rows, 1,040 with no
// English title and 286 with no title in either language, and the ticket screen
// falls back to the DESCRIPTION when a ticket has no title of its own. Six
// titles in the whole table are over 120 characters. A missing-title problem
// wearing a long-title costume.
//
// The backfill is its own item. This is the other half, and it has to hold for
// every record type rather than for tickets: the name is clamped to two lines,
// and the full text stays reachable — the record's own body still renders it,
// and the clamped node carries the whole string as its `title` attribute.
//
// TWO SEAMS, ONE DECISION. Both places the app hands a record heading to the kit
// go through `clampRecordHeading`, and this reads that off disk rather than
// trusting a comment: the twelve bespoke details (web/components/record-chrome.tsx)
// and every recipe-driven detail on BOTH front doors
// (shared/web/screen-engine/screen-renderer.tsx). Deleting either call site
// turns this red.

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { RecordScreen } from "@/components/record-chrome"

afterEach(cleanup)

const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(ROOT, ...p.split("/")), "utf8")

/** The ticket that earned this: a description standing in for a missing title. */
const LONG =
  "Schadenprozess: der Kunde meldet einen Schaden per E-Mail, wir legen einen " +
  "Vorgang an, prüfen die Police, fordern Unterlagen an und geben den Vorgang " +
  "an die Regulierung weiter, die dann entscheidet und den Kunden informiert."

describe("a record's own name is clamped to two lines", () => {
  it("clamps a string title, and keeps the whole of it reachable", () => {
    const { container } = render(<RecordScreen title={LONG} />)
    const heading = container.querySelector("h1")
    expect(heading, "the record heading is drawn").toBeTruthy()
    const clamped = heading!.querySelector(".line-clamp-2")
    expect(clamped, "the name is clamped inside the heading").toBeTruthy()
    // Reachable in full: the pointer/screen-reader route, beside the record body.
    expect(clamped!.getAttribute("title")).toBe(LONG)
    expect(clamped!.textContent).toBe(LONG)
  })

  it("leaves a NODE title alone — a loading skeleton is not a record's name", () => {
    const { container } = render(
      <RecordScreen title={<span data-testid="skeleton" className="h-7 w-48" />} />
    )
    const skeleton = container.querySelector('[data-testid="skeleton"]')
    expect(skeleton, "the node is still drawn").toBeTruthy()
    expect(skeleton!.closest(".line-clamp-2"), "and it is not boxed by the clamp").toBeNull()
  })

  it("both record-heading seams apply it — read off disk, not off a comment", () => {
    for (const file of [
      "web/components/record-chrome.tsx",
      "shared/web/screen-engine/screen-renderer.tsx",
    ]) {
      const src = read(file)
      expect(src, `${file} imports the clamp`).toMatch(/clampRecordHeading/)
      // Not pinned to a `title={...}` PROP shape — record-chrome.tsx composes
      // the kit's `<RecordChrome>` by hand (R45) and feeds the clamped node in
      // as JSX children of its own `titleBlock`, while screen-renderer.tsx
      // passes it straight through as a prop. Both are genuine call sites; what
      // matters is that the file's own `title` reaches the clamp before either
      // heading step ever sees it.
      expect(src, `${file} feeds its title THROUGH the clamp`).toMatch(
        /clampRecordHeading\(title\)/
      )
    }
  })
})
