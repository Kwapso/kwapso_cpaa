// THE APP SPEAKS THE KIT'S MOTION, OR IT SPEAKS NOBODY'S.
//
// `shared/ui/foundations/motion/motion.css` ships a whole vocabulary — page and route
// transitions, row enter/exit/move, hover, hover-lift, drag, disclosure,
// dialog, sheet, scrim, pull-to-refresh, progress — and both front doors
// import it. For a year the app used exactly ONE of its classes,
// `motion-panel-in`, and drew everything else with a hand-rolled Tailwind
// `transition-colors`.
//
// That is not a missing animation. It is a SECOND motion system: Tailwind's
// 150ms linear beside the kit's `--duration-colour` on `--ease`, on surfaces
// that sit next to each other. Nobody files that as a bug, because nobody sees
// two hovers at once — which is exactly the argument R32 makes about colour
// drift, and the reason this is checked rather than remembered.
//
// So: a hand-rolled transition utility in `web/`, `web-portal/` or
// `shared/web/` is a breach. The kit's class is the spelling.
//   · a fill or ink swap  → `motion-hover`
//   · a card that is a link, a draggable card, the copilot launcher, and
//     nothing else (motion.css §13) → `motion-hover-lift`
//   · a row              → `motion-row-hover` / `-enter` / `-exit` / `-move`
//   · a route's content  → `motion-page-in`, on the content and never on the
//                          chrome
//
// The exemptions are DATA with a reason each, and they are rot-checked: a pin
// whose file no longer carries a transition turns this red, so the list can
// only shrink.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"

const HERE = dirname(fileURLToPath(import.meta.url)) // web/test
const ROOT = join(HERE, "..", "..") // repo root

/** Tailwind's own transition utilities. `transition-` alone is deliberately not
 * matched: the kit's classes are `motion-*` and nothing here emits a bare
 * `transition`. */
const HAND_ROLLED =
  /\btransition-(colors|opacity|shadow|transform|all|\[[^\]]+\])/

/** Pinned, with the reason each. Rot-checked below. */
const HAND_ROLLED_OK: Record<string, string> = {
  "web/components/record-chrome.tsx":
    "transition-[height] on the collapsing sticky record header. motion.css has " +
    "no class for a SIZE change on scroll — every §7 row class animates a row " +
    "arriving or leaving, not a header shrinking — so there is nothing to reach " +
    "for. Delete this pin the day the kit draws one.",
}

describe("motion is the kit's, everywhere", () => {
  /** Both front doors and the host seams they share. `shared/ui/` is NOT walked:
   * it is the kit, it is hash-pinned, and its own repo lints it. */
  const files = sourceFiles([join(ROOT, "web"), join(ROOT, "web-portal"), join(ROOT, "shared/web")], {
    extensions: [".tsx", ".ts"],
    skipTests: true,
    relativeTo: ROOT,
  })

  it("no front-door file hand-rolls a transition", () => {
    const offenders: string[] = []
    for (const file of files) {
      // Comments are not code, and the reasoning above one of these fixes
      // quotes the utility it replaced.
      if (HAND_ROLLED.test(stripComments(file.source)) && !(file.rel in HAND_ROLLED_OK)) {
        offenders.push(file.rel)
      }
    }
    expect(
      offenders,
      "these draw their own transition instead of the kit's motion class. " +
        "Use `motion-hover` / `motion-hover-lift` / `motion-row-*` / " +
        "`motion-page-in`, or pin it in HAND_ROLLED_OK with a reason.",
    ).toEqual([])
  })

  it("every pin still describes a file that hand-rolls one", () => {
    const stale: string[] = []
    for (const rel of Object.keys(HAND_ROLLED_OK)) {
      const source = readFileSync(join(ROOT, rel), "utf8")
      if (!HAND_ROLLED.test(stripComments(source))) stale.push(rel)
    }
    expect(stale, "these pins describe nothing any more — delete them.").toEqual([])
  })

  it("the route transition is on the content and not on the chrome", () => {
    // The agency shell. `AppShell` is the chrome; the wrapper must sit INSIDE
    // it, around what the route renders.
    const shell = readFileSync(join(ROOT, "web/components/deep-link-screen.tsx"), "utf8")
    expect(shell).toContain("motion-page-in")
    const chromeAt = shell.indexOf("<AppShell")
    const motionAt = shell.indexOf("motion-page-in")
    expect(motionAt).toBeGreaterThan(chromeAt)

    // The portal shell, same sentence.
    const portal = readFileSync(join(ROOT, "web-portal/components/portal-shell.tsx"), "utf8")
    expect(portal).toContain("motion-page-in")
  })
})
