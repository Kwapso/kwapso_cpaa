// THE OPENING FRAME HAS FOUR WAYS TO FAIL SILENTLY, AND ALL FOUR LOOK FINE ON
// THE MACHINE THAT WROTE IT.
//
// A splash screen is the one piece of UI nobody notices working and everybody
// notices stuck. It covers the whole viewport at the highest z-index in the app,
// it is on screen before any of our code runs, and every one of its failure
// modes is invisible in a dev build:
//
//   1. It mounts on ONE door. The agency app opens on the brand and the client
//      portal opens on a white flash — the same class of half-rebrand that made
//      shared/web/pwa.ts a single file, found only by whoever happens to open
//      the other hostname.
//   2. It never leaves. The whole exit path is a CSS animation, so if the fill
//      mode or the visibility stop is edited away, the app is permanently behind
//      an invisible sheet — with scripting disabled, or the bundle 404ing, there
//      is nothing else to clear it.
//   3. The script removes the node instead of hiding it, and React's hydration
//      finds a tree that moved underneath it.
//   4. Somebody swaps `splashSource` to a video on a CDN, and the screen that
//      exists to hide a network wait becomes a network wait.
//
// So: both layouts derived from their own source, the stylesheet and the script
// read as the shipped strings, and the same-origin rule proved by calling the
// module the way a build would.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { stripComments } from "@shared/rules/source-scan"
import {
  assertSameOrigin,
  SPLASH_MARK_MS,
  SPLASH_REVEAL_AT_MS,
  SPLASH_REVEAL_MS,
  SPLASH_TOTAL_MS,
  splashInner,
  splashScript,
  splashStyle,
} from "@shared/web/splash"

const ROOT = join(__dirname, "..", "..")
const LAYOUTS = [
  ["the agency app", join(ROOT, "web", "app", "layout.tsx")],
  ["the client portal", join(ROOT, "web-portal", "app", "layout.tsx")],
] as const

describe("both front doors open on the same frame", () => {
  for (const [door, path] of LAYOUTS) {
    it(`${door}'s root layout imports and renders SplashScreen`, () => {
      const src = stripComments(readFileSync(path, "utf8"))
      expect(
        src,
        `${door} must import the shared splash — a second copy is how a rebrand half-succeeds`
      ).toContain('from "@shared/web/splash-screen"')
      expect(src, `${door} imports SplashScreen but never renders it`).toMatch(/<SplashScreen\s*\/>/)
    })

    // It is fixed and full-viewport, so DOM order does not decide what covers
    // what — but it does decide what the PARSER reaches first, which is the only
    // reason this thing beats the bundle to the screen.
    it(`${door} renders it as the first thing in the body`, () => {
      const src = stripComments(readFileSync(path, "utf8"))
      const body = src.indexOf("<body")
      const splash = src.indexOf("<SplashScreen")
      const anythingElse = src.slice(body).search(/<(?!body|SplashScreen)[A-Z]/)
      expect(splash, "SplashScreen is rendered before <body> opens").toBeGreaterThan(body)
      expect(
        splash - body,
        `${door} renders another component before the splash — the parser reaches it later than it needs to`
      ).toBeLessThanOrEqual(anythingElse)
    })
  }
})

describe("it leaves on its own, with no JavaScript at all", () => {
  const css = splashStyle()

  it("ends the overlay's animation on visibility:hidden", () => {
    expect(
      css,
      "the exit keyframe no longer hides the overlay — with scripting off, the app is behind a permanent sheet"
    ).toMatch(/@keyframes ks-splash-out\{[\s\S]{0,80}\bto\{[^}]*visibility:\s*hidden/)
  })

  it("holds that final frame (a fill mode), rather than snapping back", () => {
    const rule = /#ks-splash\{[^}]*animation:\s*ks-splash-out[^;}]*\b(both|forwards)\b/
    expect(
      css,
      "without a forwards/both fill the overlay reappears the instant the animation ends"
    ).toMatch(rule)
  })

  it("starts the reveal at the moment the constants say it does", () => {
    const delay = /animation:\s*ks-splash-out\s+(\d+)ms\s+\S+\s+(\d+)ms/.exec(css)
    expect(delay, "the exit animation's shorthand no longer parses — this scan is reading the wrong shape").toBeTruthy()
    expect(Number(delay![1])).toBe(SPLASH_REVEAL_MS)
    expect(Number(delay![2])).toBe(SPLASH_REVEAL_AT_MS)
  })
})

// THE OWNER'S DIRECTION, AS A TEST RATHER THAN A COMMENT.
//
//   "can we ensure that the loading screen … stays long enough for one complete
//    loop of the animation, or maybe we enter the app just as the last part of
//    the animation of the logo breaking apart happens, like in the last 0.75
//    seconds remaining?"
//
// Both halves of that sentence are invariants, and neither is safe as prose. The
// first — the animation is never cut off — dies quietly the moment somebody
// shortens the overlay to make the app feel faster, and the only symptom is a
// logo that stops mid-spin. The second is arithmetic between three constants,
// and arithmetic between constants is exactly what drifts when one of them is
// tuned by feel. So they are asserted from the shipped CSS, not from the numbers.
describe("the app arrives THROUGH the burst, not after it", () => {
  const css = splashStyle()

  it("never takes the screen away before the mark has finished", () => {
    const end = SPLASH_REVEAL_AT_MS + SPLASH_REVEAL_MS
    expect(
      end,
      `the overlay is gone at ${end}ms but the mark runs to ${SPLASH_MARK_MS}ms — the animation would be cut off mid-beat`
    ).toBeGreaterThanOrEqual(SPLASH_MARK_MS)
  })

  it("begins the reveal three quarters of a second before the end", () => {
    const overlap = SPLASH_MARK_MS - SPLASH_REVEAL_AT_MS
    expect(overlap, "the reveal no longer overlaps the burst — the app would appear against a finished screen").toBe(
      SPLASH_REVEAL_MS
    )
    expect(overlap).toBeGreaterThanOrEqual(600)
    expect(overlap).toBeLessThanOrEqual(900)
  })

  // The pieces have to be MOVING while the app comes up, or the cross-dissolve
  // is just a fade. Each arc leaves in its own direction; a burst that starts
  // before the reveal (or after it) reads as two events instead of one.
  it("starts the arcs flying at the same instant the overlay starts dissolving", () => {
    const flights = [...css.matchAll(/@keyframes ks-splash-fly-\d\{0%,(\d+)%\{transform:translate\(0,0\)\}/g)]
    expect(flights.length, "the per-arc burst keyframes are gone — the mark would scale instead of come apart").toBe(3)
    for (const f of flights) {
      const startsAt = (Number(f[1]) / 100) * SPLASH_MARK_MS
      expect(
        Math.abs(startsAt - SPLASH_REVEAL_AT_MS),
        `an arc starts leaving at ${Math.round(startsAt)}ms but the reveal starts at ${SPLASH_REVEAL_AT_MS}ms`
      ).toBeLessThanOrEqual(120)
    }
  })

  it("sends each arc somewhere different", () => {
    const ends = [...css.matchAll(/100%\{transform:translate\((-?\d+)px,(-?\d+)px\)\}/g)].map((m) => `${m[1]},${m[2]}`)
    expect(ends.length).toBe(3)
    expect(new Set(ends).size, "two arcs leave on the same tangent — that reads as sliding, not bursting").toBe(3)
  })

  it("honours prefers-reduced-motion by standing still and leaving early", () => {
    const block = /@media\s*\(prefers-reduced-motion:\s*reduce\)\{([\s\S]*)$/.exec(css)?.[1] ?? ""
    expect(block, "the reduced-motion block is gone — a 3.4s spin is not optional for everybody").not.toBe("")
    expect(block, "the mark still spins under reduced motion").toMatch(/\.ks-mark\{[^}]*animation:\s*none/)
    const early = /#ks-splash\{animation-delay:(\d+)ms\}/.exec(block)
    expect(early, "reduced motion no longer shortens the hold").toBeTruthy()
    expect(Number(early![1])).toBeLessThan(SPLASH_MARK_MS)
  })
})

describe("the inline script", () => {
  const js = splashScript()

  // Failure mode 3. The layout is server-rendered and then hydrated; a node that
  // the script deleted in between is a tree React did not expect.
  it("hides the node instead of removing it, so hydration finds what it rendered", () => {
    expect(js, "the splash script must not remove its own node — React hydrates this subtree").not.toMatch(
      /removeChild|\.remove\(\)/
    )
    expect(js).toContain('style.display="none"')
  })

  it("tears down both document listeners on the way out", () => {
    const added = [...js.matchAll(/addEventListener\("(\w+)"/g)].map((m) => m[1])
    const removed = [...js.matchAll(/removeEventListener\("(\w+)"/g)].map((m) => m[1])
    expect(added.length, "the skip listeners are gone — a tap no longer dismisses the splash").toBeGreaterThan(0)
    for (const ev of added)
      expect(removed, `"${ev}" is added at the document but never removed — the app carries it all session`).toContain(
        ev
      )
  })

  it("gives up after the full duration even if nothing is ever tapped", () => {
    expect(js).toContain(`setTimeout(f,${SPLASH_TOTAL_MS})`)
  })

  // It is injected as script TEXT. The one number in it is a module constant;
  // anything else interpolated here would be executing a string from elsewhere.
  it("interpolates nothing but its own timing constant", () => {
    const holes = js.replace(String(SPLASH_TOTAL_MS), "")
    expect(holes, "the script text carries a value from outside this module").not.toMatch(/\$\{|\bwindow\.|location\./)
  })
})

describe("the placeholder the owner is meant to change", () => {
  it("is on screen for the three-to-four seconds he asked for", () => {
    expect(SPLASH_TOTAL_MS).toBeGreaterThanOrEqual(3000)
    expect(SPLASH_TOTAL_MS).toBeLessThanOrEqual(4000)
  })

  it("draws the built-in mark with no request of any kind", () => {
    const html = splashInner({ kind: "mark" })
    expect(html).toContain("<svg")
    expect(html, "the built-in mark must not fetch anything — that is its whole advantage").not.toMatch(
      /src=|href=|url\(/
    )
  })

  // Failure mode 4, proved by running the branch rather than reading it.
  it("autoplays a video source in the two ways iOS requires", () => {
    const html = splashInner({ kind: "video", src: "/splash/loop.mp4" })
    for (const attr of ["autoplay", "muted", "playsinline"])
      expect(html, `a splash video without ${attr} shows a play button on iOS instead of playing`).toContain(attr)
  })

  it("refuses a source on another host", () => {
    for (const bad of ["https://cdn.example.com/loop.mp4", "//cdn.example.com/loop.mp4", "splash/loop.mp4"])
      expect(
        () => assertSameOrigin({ kind: "video", src: bad }),
        `"${bad}" was accepted — a splash that fetches from elsewhere re-introduces the wait it exists to hide`
      ).toThrow()
    expect(() => assertSameOrigin({ kind: "video", src: "/splash/loop.mp4" })).not.toThrow()
    expect(() => assertSameOrigin({ kind: "mark" })).not.toThrow()
  })

  it("runs that check on the value that actually ships", () => {
    const src = stripComments(readFileSync(join(ROOT, "shared", "web", "splash.ts"), "utf8"))
    expect(
      src,
      "the guard is declared but never applied to splashSource — it would pass forever"
    ).toMatch(/^assertSameOrigin\(splashSource\)$/m)
  })
})
