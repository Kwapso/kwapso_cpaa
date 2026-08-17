// THE AGENCY'S OWN HOUSEKEEPING — the invariants the four internal modules add
// that nothing else in the base already holds.
//
// Three groups, and they are in this order because that is their order of
// consequence:
//
//   1. A DATE IS A DAY OR IT IS A REFUSAL. Four of the six internal tables carry
//      a date somebody types, and a value that NEARLY parses is the worst kind
//      of bad data: it sorts, it renders, and it is wrong. An expiry that half
//      parses is a certificate that silently never lapses.
//   2. A LINK IS NOT A SCRIPT. These tables store URLs somebody clicks.
//   3. NONE OF IT REACHES A CLIENT — structurally, the way R24 makes the same
//      promise about margin: not by a condition somebody can invert, but by the
//      doors not being on the client's surface and the client's app not naming
//      the tables. A profile saying what a colleague is bad at is the sharpest
//      case of agency-only material in the app.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { GuardError } from "@shared/workers/gating"
import { sourceFiles } from "@shared/rules/source-scan"
import { optionalDate, safeExternalLink } from "../src/lib/internal-fields"
import { ROUTES } from "../src/index"

const ROOT = join(__dirname, "..", "..", "..")

describe("a date is a real calendar day, or it is a clean refusal", () => {
  it("keeps a real day, exactly as written", () => {
    expect(optionalDate("2026-05-14", "Published on")).toBe("2026-05-14")
    expect(optionalDate("  2026-05-14  ", "Published on")).toBe("2026-05-14")
    // A leap day in a leap year is a day. (2024 is; 2026 is not — see below.)
    expect(optionalDate("2024-02-29", "Issued on")).toBe("2024-02-29")
  })

  it("treats absent, null and blank as 'we don't know when'", () => {
    // NOT the same as a bad answer, and the column is nullable for this reason.
    expect(optionalDate(undefined, "Published on")).toBeNull()
    expect(optionalDate(null, "Published on")).toBeNull()
    expect(optionalDate("   ", "Published on")).toBeNull()
  })

  it("refuses a value that is not written the one way", () => {
    // Each of these parses somewhere, which is the whole danger.
    for (const bad of ["14/05/2026", "2026-5-1", "14 May 2026", "2026-05-14T09:00:00Z", "today"])
      expect(() => optionalDate(bad, "Published on"), bad).toThrow(GuardError)
  })

  it("refuses a day the calendar does not have", () => {
    // THE ROLL-OVER, which a shape check alone cannot catch: `new Date` turns
    // the 31st of February into the 3rd of March and reports no error at all.
    for (const bad of ["2026-02-31", "2026-02-29", "2026-13-01", "2026-00-10", "2026-04-31"])
      expect(() => optionalDate(bad, "Issued on"), bad).toThrow(GuardError)
  })

  it("refuses a value that is not a string at all (R20: bad input is a 400)", () => {
    for (const bad of [123, true, {}, ["2026-05-14"]])
      expect(() => optionalDate(bad, "Expires on"), JSON.stringify(bad)).toThrow(GuardError)
    // …and it is a 400, never a 500 — the whole point of throwing a GuardError.
    try {
      optionalDate(123, "Expires on")
      expect.unreachable("a number must not pass")
    } catch (e) {
      expect((e as GuardError).status).toBe(400)
    }
  })
})

describe("a stored link is one a reader can safely click", () => {
  it("keeps http, https and mailto — and our own hosted files", () => {
    expect(safeExternalLink("https://example.com/a.pdf")).toBe("https://example.com/a.pdf")
    expect(safeExternalLink("mailto:hola@example.com")).toBe("mailto:hola@example.com")
    // The upload doors hand back a root-relative URL; the brand asset that
    // references it must survive this filter or the file is unreachable.
    expect(safeExternalLink("/media/internal/01TEAM/01FILE")).toBe("/media/internal/01TEAM/01FILE")
  })

  it("drops a scheme that runs code when somebody clicks it", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,<script>x</script>", "vbscript:msgbox"])
      expect(safeExternalLink(bad), bad).toBeNull()
    expect(safeExternalLink(42)).toBeNull()
    expect(safeExternalLink("")).toBeNull()
  })
})

describe("the agency's own housekeeping never reaches the client's side", () => {
  /** The four internal modules' doors, DERIVED from the worker's own route
   * table rather than listed here — a door added tomorrow is judged today. */
  const internalDoors = Object.keys(ROUTES).filter((d) =>
    /\/api\/content\/(marketing|brand-assets|delivery|staff)\b/.test(d)
  )

  it("finds the doors it is about (a blind scan reports 'all clear' like a pass)", () => {
    expect(internalDoors.length, "no agency-internal doors found — this scan is reading nothing").toBeGreaterThan(15)
  })

  it("not one of them is on the client portal's surface", () => {
    // The portal gateway forwards a NAMED allow-list; the agency gateway
    // forwards by prefix. So this is the whole of the routing defence, and it is
    // the same shape R24 uses for the margin.
    const portal = readFileSync(join(ROOT, "workers", "portal-gateway", "src", "index.ts"), "utf8")
    const doors = new Set([...portal.matchAll(/"([A-Z]+ \/[^"]+)":\s*"\w+"/g)].map((m) => m[1]))
    expect(doors.size, "PORTAL_DOORS did not parse").toBeGreaterThan(5)
    const leaked = internalDoors.filter((d) => doors.has(d))
    expect(
      leaked,
      `the client portal opens a door on the agency's own housekeeping: ${leaked.join(", ")}`
    ).toEqual([])
  })

  it("every one of them refuses a portal caller at the door", () => {
    // Belt AND braces, on purpose. The routing above says a client cannot knock;
    // this says that if one ever could, the door would still turn them away —
    // which is R21's own sentence about not depending on how carefully something
    // else was built.
    const bodies = new Map<string, string>()
    for (const { source } of sourceFiles(join(__dirname, "..", "src", "routes"), { extensions: [".ts"] })) {
      const starts = [...source.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)]
      starts.forEach((m, i) => bodies.set(m[1], source.slice(m.index, starts[i + 1]?.index ?? source.length)))
    }
    const naked: string[] = []
    for (const door of internalDoors) {
      const handler = ROUTES[door].handler.name
      const body = bodies.get(handler)
      expect(body, `handler ${handler} for ${door} was not found on disk`).toBeTruthy()
      if (!/refusePortalCaller\s*\(/.test(body as string)) naked.push(`${door} (${handler})`)
    }
    expect(
      naked,
      `these doors serve the agency's own housekeeping and do not refuse a client login: ${naked.join(", ")}`
    ).toEqual([])
  })

  it("the client's app does not name the tables, the paths, or a profile field", () => {
    // The third leg, and the one a permission cannot grant its way past: even if
    // a door opened and even if a gate were inverted, nothing in the client app
    // knows these rows exist. An import cannot be forgotten.
    const forbidden = [
      "brand_assets",
      "staff_profiles",
      "staff_certificates",
      "meeting_purposes",
      "/api/content/brand-assets",
      "/api/content/delivery",
      "/api/content/staff",
      // The two fields whose disclosure would be worst, named directly: a
      // client reading what a colleague is bad at is the case this module's
      // whole posture exists for.
      "personalityType",
      "weaknesses",
    ]
    const offenders: string[] = []
    for (const { path, source } of sourceFiles(join(ROOT, "web-portal"), { extensions: [".ts", ".tsx"] }))
      for (const word of forbidden)
        if (source.includes(word)) offenders.push(`${path} names "${word}"`)
    expect(
      offenders,
      `the client portal's own code names the agency's internal material: ${offenders.join(", ")}`
    ).toEqual([])
  })
})
