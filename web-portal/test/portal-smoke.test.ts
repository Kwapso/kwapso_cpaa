// THE PORTAL SMOKE, CHECKED BEFORE IT RUNS.
//
// `scripts/smoke-portal.mjs` proves the client's front door against live
// staging: every door on the allow-list answers, the account fence holds, a
// withdrawn deliverable takes its file URL with it, and no door reading the
// agency's own cost is reachable at the client's hostname. All of that is
// worth much more than this file — and none of it runs until somebody deploys.
//
// WHICH IS THE GAP THIS CLOSES. A smoke script is the one kind of test that can
// rot silently in both directions: a door added to `PORTAL_DOORS` today is
// simply never knocked on, and a path the script names with a typo is a check
// that passes against nothing. The run itself catches the first (its census is
// derived from what it actually called) and cannot catch the second in the way
// that matters — a mistyped path 404s, and a 404 is what half of these checks
// are LOOKING for. So the spelling is checked here, at `npm run check`, where a
// developer finds out in fifteen seconds rather than after a deploy.
//
// THREE THINGS, and each of them is a way the smoke could go quietly useless:
//
//   1. It is WIRED — `deploy:staging` runs it. A smoke nobody runs is a file.
//   2. Every door path it names is a real entry in the gateway's own table, and
//      every listener the portal registers has a door named for it, in both
//      directions. That map lives in the script (it is a judgement about which
//      read refills which cache key); this makes it a judgement the build reads.
//   3. It still names the things the two bugs of 2026-08-19 were about — the
//      per-row deliverable visibility and R24's internal money. A check whose
//      subject quietly leaves the file is the shape every law here was earned
//      on twice.
//
// It does NOT re-derive the internal-money doors or the fence: those are R24's
// and the portal-fence suite's jobs, and asserting them a third time here would
// be a third place to update. This file only guards the SMOKE.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..", "..")
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8")

const SMOKE = read("scripts", "smoke-portal.mjs")

/** The portal's surface, off the gateway's own table — the same parse the smoke
 * makes at run time, and the same one `web/test/rules.test.ts` makes for R24. */
function portalDoors(): string[] {
  const src = read("workers", "portal-gateway", "src", "index.ts")
  const table = /export const PORTAL_DOORS[^=]*=\s*\{([\s\S]*?)\n\}/.exec(src)
  expect(table, "PORTAL_DOORS not found — did the table move?").toBeTruthy()
  return [...(table as RegExpExecArray)[1].matchAll(/"([A-Z]+ \/[^"]+)":\s*"\w+"/g)].map((m) => m[1])
}

/** The resources the client's screens listen for, off the portal's registry. */
function portalListeners(): string[] {
  const src = read("web-portal", "lib", "live-resources.ts")
  // `[\s\S]*?` and not `[^=]*`: the declaration's own TYPE carries a `=>`, so a
  // scan that stopped at the first `=` never reached the opening brace.
  const table = /export const PORTAL_LISTENERS[\s\S]*?=\s*\{\r?\n([\s\S]*?)\r?\n\}/.exec(src)
  expect(table, "PORTAL_LISTENERS not found — did the registry move?").toBeTruthy()
  const body = (table as RegExpExecArray)[1]
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
  return [...body.matchAll(/^\s*(\w+):\s*\(/gm)].map((m) => m[1])
}

/** `FED_BY` out of the smoke: resource → the door that refills what a ping drops. */
function fedBy(): Record<string, string> {
  const table = /const FED_BY\s*=\s*\{([\s\S]*?)\n\}/.exec(SMOKE)
  expect(table, "FED_BY not found in scripts/smoke-portal.mjs").toBeTruthy()
  return Object.fromEntries(
    [...(table as RegExpExecArray)[1].matchAll(/(\w+):\s*"([A-Z]+ \/[^"]+)"/g)].map((m) => [m[1], m[2]])
  )
}

describe("the client portal's staging smoke", () => {
  it("is wired into the staging deploy", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> }
    expect(pkg.scripts["smoke:portal"], "package.json has no smoke:portal script").toContain(
      "scripts/smoke-portal.mjs"
    )
    // A SMOKE NOBODY RUNS IS A FILE. The agency's smoke has been the last step of
    // deploy:staging since it was written; the portal is half the product and
    // gets the same treatment or none.
    expect(
      pkg.scripts["deploy:staging"],
      "deploy:staging does not run the portal smoke — half the product would deploy unverified"
    ).toContain("smoke:portal")
  })

  it("knocks only on paths the portal gateway actually serves", () => {
    const paths = new Set(portalDoors().map((d) => d.split(" ")[1]))
    expect(paths.size, "PORTAL_DOORS did not parse").toBeGreaterThan(15)

    // EVERY PATH THE SMOKE ASKS THE CLIENT'S DOOR FOR. A typo here 404s, and a
    // 404 is precisely what half those checks are LOOKING for — so a mistyped
    // path does not fail, it passes for the wrong reason and quietly stops
    // covering the door it was named after. Query strings are cut: the door
    // table is keyed by path.
    //
    // The R24 block is deliberately not in this set. It calls `portalCall`, the
    // un-stamped helper, precisely because those paths are the ones that must
    // NOT be portal doors — and it proves that against the same table at run
    // time, so a typo there is caught by the check it already makes.
    const asked = new Set(
      [...SMOKE.matchAll(/\bportal(?:Post)?\(\s*[`"](\/api\/[^`"?]+)/g)].map((m) => m[1])
    )
    expect(asked.size, "found no portal calls in the smoke — has it been rewritten?").toBeGreaterThan(15)
    const stray = [...asked].filter((p) => !paths.has(p))
    expect(
      stray,
      `the smoke asks the client's door for paths the gateway does not serve: ${stray.join(", ")}`
    ).toEqual([])

    // …and the doors it stamps BY HAND (the three it reaches through the raw
    // helper — the two Google halves and the live channel) are real too. Those
    // stamps are the one place the census can be told something untrue.
    const stamped = [...SMOKE.matchAll(/knocked\.add\("([A-Z]+ \/[^"]+)"\)/g)].map((m) => m[1])
    const doors = new Set(portalDoors())
    const invented = stamped.filter((d) => !doors.has(d))
    expect(
      invented,
      `the smoke stamps its census with doors the gateway does not serve: ${invented.join(", ")}`
    ).toEqual([])
  })

  it("has a live door behind every resource the portal listens for", () => {
    const resources = portalListeners()
    const map = fedBy()
    expect(resources.length, "PORTAL_LISTENERS did not parse").toBeGreaterThan(5)

    // A LISTENER WITH NO DOOR IS A SCREEN THAT GOES QUIETLY STALE: the ping
    // arrives, the cache key is dropped, and nothing refills it. That failure has
    // no symptom until somebody stares at an unchanging screen.
    const unfed = resources.filter((r) => !map[r])
    expect(
      unfed,
      `the portal listens for these and the smoke names no door that refills them: ${unfed.join(", ")}`
    ).toEqual([])

    // …and the other way, so the map can only shrink when the registry does. An
    // entry for a resource nobody listens for is a line nobody reread.
    const stale = Object.keys(map).filter((r) => !resources.includes(r))
    expect(
      stale,
      `FED_BY names resources PORTAL_LISTENERS no longer carries — delete these: ${stale.join(", ")}`
    ).toEqual([])

    const doors = new Set(portalDoors())
    const unserved = [...new Set(Object.values(map))].filter((d) => !doors.has(d))
    expect(unserved, `FED_BY names doors the portal does not open: ${unserved.join(", ")}`).toEqual([])
  })

  it("still covers the two things it was written for", () => {
    // 2026-08-19, bug one: a deliverable whose visibility is revoked kept
    // handing back its file URL. The proof is a grep of the WHOLE response body
    // for the link, not a read of the field a screen renders — the value was
    // still in the JSON, one devtools panel away. So the smoke must still hold a
    // distinctive link and still hunt for it.
    expect(SMOKE, "the smoke no longer plants a file URL to hunt for").toMatch(
      /const FILE_URL\s*=\s*"https:\/\/\S+"/
    )
    // THE SEAM, NOT THE PATH — and the reason is a law one directory up.
    // `workers/content/test/deliverables.test.ts` forbids anything under
    // `web-portal/` from naming the AGENCY's handover doors, as a plain
    // substring scan that deliberately reads test files and prose ("a note
    // explaining WHY we withhold a name would fail it"). Spelling that path here
    // to assert the smoke still calls it would break that law to check this one,
    // and spelling half of it to slip past the scan would be worse — a law you
    // route around is a law nobody trusts. So this anchors on the smoke's own
    // one-line seam onto that door, which is what every check there actually
    // calls and is the sturdier anchor besides: a path can move, and the seam is
    // the thing that would have to be deleted for the coverage to vanish.
    expect(SMOKE, "the smoke no longer has a seam onto the visibility door").toMatch(
      /const setVisible = \([^)]*visible[^)]*\)/
    )
    // Hidden → shared → withdrawn is three moves, and the middle one is the only
    // one a lazier version would keep.
    expect(
      (SMOKE.match(/\bsetVisible\(/g) ?? []).length,
      "the smoke no longer walks a deliverable through hidden → shared → withdrawn"
    ).toBeGreaterThanOrEqual(3)
    expect(
      /!\w+\.dump\.includes\(FILE_URL\)/.test(SMOKE),
      "the smoke no longer greps the whole response body for the withdrawn file URL"
    ).toBe(true)

    // Bug two: R24. The doors are DERIVED from internal-money.ts's own exports,
    // the same walk the rule test makes — so the smoke must still be reading
    // that file rather than a list somebody typed.
    expect(
      SMOKE.includes("workers/tenancy/src/lib/internal-money.ts"),
      "the smoke no longer derives the internal-money doors from their own file"
    ).toBe(true)
  })
})
