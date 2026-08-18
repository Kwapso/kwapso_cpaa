// THE OPENING FRAME HAS FIVE WAYS TO FAIL SILENTLY, AND ALL FIVE LOOK FINE ON
// THE MACHINE THAT WROTE IT.
//
// A boot loader is the one piece of UI nobody notices working and everybody
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
//   5. NEW, AND THE REASON THIS FILE GREW A JSDOM SECTION. The animation is no
//      longer CSS — it is four kilobytes of JavaScript injected as script TEXT,
//      and script text is not type-checked, not linted and not parsed until a
//      browser reaches it. A stray comma in it is a build that passes every
//      check in this repo and a boot screen that is a frozen logo. So the last
//      describe RUNS the thing: it evaluates the shipped string, mounts it on
//      the shipped markup, and drives the clock.
//
// So: both layouts derived from their own source, the stylesheet and the script
// read as the shipped strings, the score proved to be a WARP of the author's
// composition rather than a rewrite of it, and the animator actually executed.

import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { stripComments } from "@shared/rules/source-scan"
import {
  ARCS,
  DETAIL_TIERS,
  GEOMETRY,
  MARK_INAPP_START_MS,
  SCENES,
  SPLASH_AUTHORED_MS,
  SPLASH_MARK_MS,
  SPLASH_REVEAL_AT_MS,
  SPLASH_REVEAL_MS,
  SPLASH_TOTAL_MS,
  assertSameOrigin,
  markLoopScript,
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

  // The animation is JavaScript now, so "no JavaScript" has to mean something
  // other than "a still overlay that never goes". What the parser paints is the
  // mark AT REST, and it is in the HTML — not assembled by the script.
  //
  // AND IT IS THE LOGO, WHICH IS NOT THE SAME PICTURE AS THE LOCK. The
  // composition strobe-locks to a -56.25° pose the author calls "looking
  // straight up"; the logo (public/icons/kwapso-mark.png) is the unrotated one,
  // opening to the upper right. Borrowing the lock pose for the still frame
  // would put a mark on screen that nobody recognises, for exactly the people
  // who only ever see the still frame.
  it("paints the LOGO, unrotated, straight out of the markup", () => {
    const html = splashInner({ kind: "mark" })
    expect(ARCS.length, "the mark is three arcs — a smile and two eyes").toBe(3)
    for (const d of ARCS)
      expect(html, "an arc of the resting mark is not in the shipped markup").toContain(d)
    expect(html, "the resting group is gone").toContain('class="ks-rest" transform="translate(540 540)"')
    expect(
      html,
      "the resting mark has been turned — it is showing a beat of the animation instead of the logo"
    ).not.toMatch(/ks-rest[^>]*rotate\(/)
  })

  // The markup cannot interpolate a number — the production minifier mangles a
  // template literal whose substitutions are constants, and it mangled this one
  // (see the comment above `markSvg`). So the geometry is typed into the string
  // and DERIVED here instead. This is what stops the two drifting apart.
  it("carries the geometry the constants derive, to the digit", () => {
    const html = splashInner({ kind: "mark" })
    for (const [what, value] of Object.entries(GEOMETRY))
      expect(
        html,
        `the markup no longer carries ${what} = "${value}" — recompute it and paste it into markSvg()`
      ).toContain(`"${value}"`)
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
// logo that stops mid-spin. The second is arithmetic between constants, and
// arithmetic between constants is exactly what drifts when one of them is tuned
// by feel.
describe("the app arrives THROUGH the release, not after it", () => {
  it("never takes the screen away before the mark has finished", () => {
    const end = SPLASH_REVEAL_AT_MS + SPLASH_REVEAL_MS
    expect(
      end,
      `the overlay is gone at ${end}ms but the mark runs to ${SPLASH_MARK_MS}ms — the animation would be cut off mid-beat`
    ).toBeGreaterThanOrEqual(SPLASH_MARK_MS)
  })

  // Not "roughly during the last beat" — ON the frame the lock lets go. The
  // reveal window and the Dissolve are the same window, by construction.
  it("begins the reveal on the exact frame the Dissolve begins", () => {
    const beforeDissolve = SCENES.slice(0, -1).reduce((n, s) => n + s.played, 0)
    expect(
      Math.round(beforeDissolve * 1000),
      "the reveal no longer coincides with the release — the app would appear against a finished screen"
    ).toBe(SPLASH_REVEAL_AT_MS)
    expect(SPLASH_REVEAL_MS).toBeGreaterThanOrEqual(600)
    expect(SPLASH_REVEAL_MS).toBeLessThanOrEqual(900)
  })

  it("is on screen for the three-to-four seconds the owner asked for", () => {
    expect(SPLASH_TOTAL_MS).toBeGreaterThanOrEqual(3000)
    expect(SPLASH_TOTAL_MS).toBeLessThanOrEqual(4000)
  })
})

// THE SCORE IS A WARP, NOT A REWRITE.
//
// The composition is 11.4 seconds of authored time and a cold boot is under
// four, so every scene is played shorter than it was written. That is the piece's
// own model (`nat` beside `dur` in the runtime it was authored against) — but it
// is also one edit away from becoming "somebody deleted the middle". These four
// assertions are the difference: every authored scene is still played, none of
// them is played LONGER than it was written, the authored total is still the
// author's, and the played total is the number the CSS and the script both use.
describe("the five scenes are compressed, and all five are still there", () => {
  it("keeps the author's own five beats, in order", () => {
    expect(SCENES.map((s) => s.name)).toEqual(["Coalesce", "Seat", "SpinUp", "Lock", "Dissolve"])
  })

  it("is still the 11.4-second composition underneath", () => {
    expect(SPLASH_AUTHORED_MS, "the AUTHORED lengths have been edited — this is no longer a warp of the owner's piece").toBe(11400)
  })

  it("compresses every scene and stretches none", () => {
    for (const s of SCENES)
      expect(
        s.played,
        `${s.name} is played for longer than it was authored — that is a retime, not a compression`
      ).toBeLessThanOrEqual(s.authored)
  })

  it("plays for exactly as long as the stylesheet and the script believe", () => {
    expect(Math.round(SCENES.reduce((n, s) => n + s.played, 0) * 1000)).toBe(SPLASH_MARK_MS)
    expect(splashScript()).toContain(`setTimeout(f,${SPLASH_TOTAL_MS})`)
  })

  // The in-app loader picks the animation up mid-movement, not at the fly-in,
  // so the handover from the ident reads as one continuous thing.
  it("hands the app's own loader the spin-up, not the beginning", () => {
    expect(MARK_INAPP_START_MS).toBeGreaterThan(0)
    expect(
      MARK_INAPP_START_MS,
      "the in-app mark joins before the spin-up — it would replay the fly-in and read as a restart"
    ).toBe(Math.round((SCENES[0].played + SCENES[1].played) * 1000))
  })
})

// THE ONE JUDGEMENT IN THIS FILE THAT IS ABOUT A DEVICE, so it is the one most
// likely to be edited by feel later. Three properties keep it honest: the table
// is ordered (first match wins, so an out-of-order bound is a tier nothing can
// ever reach), no smaller screen is ever asked for more work than a bigger one,
// and the widest tier is still the authored composition rather than something
// that drifted while the phone was being tuned.
describe("the detail tiers", () => {
  it("is ordered, so every tier is reachable", () => {
    const bounds = DETAIL_TIERS.map(([b]) => b)
    expect(
      [...bounds].sort((a, b) => a - b),
      "the tiers are out of order — first match wins, so a tier behind a wider one is dead"
    ).toEqual(bounds)
  })

  it("never asks a smaller screen for more than a bigger one", () => {
    for (let i = 1; i < DETAIL_TIERS.length; i++) {
      const [bound, samples, sweeps] = DETAIL_TIERS[i - 1]
      expect(samples, `the tier under ${bound}px draws more shutter samples than the one above it`).toBeLessThanOrEqual(
        DETAIL_TIERS[i][1]
      )
      expect(sweeps, `the tier under ${bound}px draws more sub-arcs than the one above it`).toBeLessThanOrEqual(
        DETAIL_TIERS[i][2]
      )
    }
  })

  it("still ends on the composition as it was authored", () => {
    const [, samples, sweeps] = DETAIL_TIERS[DETAIL_TIERS.length - 1]
    expect(samples, "the widest tier no longer draws the authored twelve shutter samples").toBe(12)
    expect(sweeps, "the widest tier no longer draws the authored nine sub-arcs").toBe(9)
  })

  // Spliced, not retyped — the same reason the score is.
  it("ships as this module's own numbers, not a second copy", () => {
    expect(
      markLoopScript(),
      "the animator carries its own copy of the tiers — one of the two will be the one nobody edits"
    ).toContain(`var DT=${JSON.stringify(DETAIL_TIERS)}`)
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

  // A tap hides the overlay; the frame loop behind it would otherwise keep
  // running, invisible, on the screen that just replaced it.
  it("stops the animation when the splash is skipped", () => {
    expect(
      js,
      "the skip handler hides the overlay without calling the animator's stop — the loop runs on behind it"
    ).toMatch(/style\.display="none";if\(s\)s\(\)/)
  })

  it("gives up after the full duration even if nothing is ever tapped", () => {
    expect(js).toContain(`setTimeout(f,${SPLASH_TOTAL_MS})`)
  })

  // It is injected as script TEXT. The interpolations are this module's own
  // numbers; anything else here would be executing a string from elsewhere.
  it("interpolates nothing but its own timing constants", () => {
    const holes = js.split(String(SPLASH_TOTAL_MS)).join("").replace(/"theme"|"ks-lit"|"ks-splash"/g, "")
    expect(holes, "the script text carries a value from outside this module").not.toMatch(
      /\$\{|location\./
    )
  })

  // Reduced motion is honoured in the ANIMATOR, not only in the stylesheet —
  // the stylesheet can no longer stop a JavaScript loop.
  it("refuses to animate for anyone who asked for less motion", () => {
    expect(
      markLoopScript(),
      "the animator no longer checks prefers-reduced-motion — a 3.8s spin is not optional for everybody"
    ).toContain("prefers-reduced-motion: reduce")
  })

  it("shortens the hold under reduced motion too", () => {
    const block = /@media\s*\(prefers-reduced-motion:\s*reduce\)\{([\s\S]*)$/.exec(splashStyle())?.[1] ?? ""
    const early = /#ks-splash\{animation-delay:(\d+)ms\}/.exec(block)
    expect(early, "reduced motion no longer shortens the hold").toBeTruthy()
    expect(Number(early![1])).toBeLessThan(SPLASH_MARK_MS)
  })
})

// IT SHIPS IN EVERY EXPORTED PAGE, so its size is a property of the app and not
// of this file — and it is the price of the whole feature, because the in-app
// loader draws from this same payload and adds nothing to the React bundle.
//
// The budget is a RATCHET, not a dare to shave bytes: it is here to stop
// somebody inlining a base64 still or a font, which is the way an inline splash
// actually gets fat. The measured figure is in the failure message.
describe("the whole opening frame is small enough to inline", () => {
  it("fits in ten kilobytes of CSS + markup + script", () => {
    const bytes = Buffer.byteLength(splashStyle() + splashInner() + splashScript(), "utf8")
    expect(bytes, `the inline splash payload is ${bytes} bytes`).toBeLessThan(10 * 1024)
  })
})

// SKIPPING IS SOMETHING A PERSON DOES, NOT SOMETHING THAT HAPPENS TO THEM.
//
// The splash used to dismiss on `pointerdown` at the document — which is not a
// gesture anybody performs on purpose. A thumb resting on the glass while a
// phone loads is a pointerdown. The first millimetre of a scroll is a
// pointerdown. On a laptop nobody touches anything, so the ident played to the
// end and looked perfect; on a phone it could vanish before the fly-in
// finished, which from the owner's side reads as "the loader doesn't run on
// mobile" — close to his actual words.
//
// The other tests in this file READ the inline script. These RUN it, on the
// markup that ships, and put three real gestures through it: a phone being
// held, a scroll beginning, and somebody actually asking for it to go. The
// clock is faked because the difference between a rest and a tap is duration
// and nothing else — a rest is a press and a lift in nearly the same place.
describe("skipping the splash is a deliberate act", () => {
  // CLEANUP IS UNCONDITIONAL, and that is not tidiness. `boot()` puts a node
  // with the id the script looks up into the document; a case that FAILS never
  // reaches its own restore, so the node survives, and the next `boot()` leaves
  // `getElementById` resolving to the dead one. The first version of this suite
  // did exactly that, and breaking one guard on purpose turned four unrelated
  // cases red — which would have read as "the fix broke everything" rather than
  // "one test found its bug".
  const opened: Array<() => void> = []
  afterEach(() => {
    while (opened.length) opened.pop()!()
  })

  /** Evaluate the shipped inline script against the shipped markup. */
  function boot() {
    // Only what the script itself uses. rAF is left alone deliberately: the
    // animator is stubbed out below and a faked rAF here would fight it.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
    const realRaf = window.requestAnimationFrame
    window.requestAnimationFrame = (() => 0) as typeof window.requestAnimationFrame
    window.cancelAnimationFrame = (() => {}) as typeof window.cancelAnimationFrame
    delete (window as { __ksMark?: unknown }).__ksMark

    const host = document.createElement("div")
    host.id = "ks-splash"
    host.innerHTML = splashInner({ kind: "mark" })
    document.body.appendChild(host)
    // eslint-disable-next-line no-new-func -- the point is to run the shipped text
    new Function(splashScript())()

    opened.push(() => {
      window.requestAnimationFrame = realRaf
      host.remove()
      vi.useRealTimers()
    })
    return { host, gone: () => host.style.display === "none" }
  }

  /** jsdom has no PointerEvent constructor, so the two fields the script reads
   * are put on a plain event — which is all it ever touches. */
  const press = (type: string, x: number, y: number, id = 1) => {
    const ev = new Event(type, { bubbles: true, cancelable: true })
    Object.assign(ev, { clientX: x, clientY: y, pointerId: id })
    return ev
  }

  it("plays on under a thumb resting on the screen", () => {
    const m = boot()
    m.host.dispatchEvent(press("pointerdown", 180, 600))
    vi.advanceTimersByTime(1500) // holding the phone
    m.host.dispatchEvent(press("pointerup", 181, 602)) // and taking the thumb off
    expect(
      m.gone(),
      "holding the device dismissed the loader — this is the gesture nobody performs on purpose"
    ).toBe(false)
  })

  it("plays on when a scroll starts", () => {
    const m = boot()
    m.host.dispatchEvent(press("pointerdown", 180, 600))
    vi.advanceTimersByTime(80)
    m.host.dispatchEvent(press("pointerup", 184, 500)) // travelled 100px
    expect(m.gone(), "a swipe dismissed the loader — that is a scroll, not a tap").toBe(false)
  })

  // How a scroll usually arrives on iOS: the browser takes the gesture over and
  // there is never an up at all. The press must be FORGOTTEN, or an unrelated
  // lift later completes it.
  it("forgets a press the browser took over", () => {
    const m = boot()
    m.host.dispatchEvent(press("pointerdown", 180, 600))
    m.host.dispatchEvent(press("pointercancel", 180, 600))
    vi.advanceTimersByTime(40)
    m.host.dispatchEvent(press("pointerup", 180, 600))
    expect(m.gone(), "a cancelled gesture was completed by a later lift").toBe(false)
  })

  it("goes when somebody actually taps it", () => {
    const m = boot()
    m.host.dispatchEvent(press("pointerdown", 180, 600))
    vi.advanceTimersByTime(90)
    m.host.dispatchEvent(press("pointerup", 183, 602))
    expect(
      m.gone(),
      "a deliberate tap no longer dismisses the loader — the skip has to still work, or it is not a courtesy"
    ).toBe(true)
  })

  it("goes on a keypress, which nobody does by accident", () => {
    const m = boot()
    m.host.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }))
    expect(m.gone(), "the keyboard skip is gone").toBe(true)
  })

  it("goes on its own if nobody touches anything at all", () => {
    const m = boot()
    vi.advanceTimersByTime(SPLASH_TOTAL_MS)
    expect(m.gone(), "the splash outlived its own timeout").toBe(true)
  })
})

// FAILURE MODE 6, AND THE ONLY ONE THAT HAS EVER ACTUALLY SHIPPED HERE.
//
// Every other test in this file reads the strings this module produces UNDER
// VITEST, which compiles it with oxc. The app is compiled by Next, with SWC,
// which minifies — and SWC constant-folds a template literal whose
// substitutions are compile-time constants. The first version of the mark was
// exactly that, and folding it DROPPED text: `r="435" fill="url(#ks-glow)"
// opacity="0"/>` reached the browser as `r="435`, leaving three malformed tags
// in the middle of the opening frame of both front doors. Thirty-four green
// tests and a clean `npm run check` said nothing, because none of them had ever
// looked at a built file.
//
// So this one looks at the built file. And for two months it read a file that
// was usually not there: it SKIPS when `<door>/out/` is absent, a fresh clone has
// no export, and `npm run check` never builds — so the one guard covering a fault
// no other test in this repo can see was also the one most likely to be silently
// absent at the moment somebody asked "is it green?". A skipped test and a passing
// test print the same colour on the way to a deploy.
//
// SO THE GATE BUILDS FIRST. `npm run check:built` (package.json) runs the real
// static export of both doors and then re-runs this file with REQUIRE_EXPORT=1,
// which turns "there is no export" from a silence into a failure. It sits on the
// deploy path itself — `deploy:staging` and `deploy:production` call it instead of
// `npm run build`, so the export these bytes are read out of is the very export
// about to be uploaded — and it is listed in OPERATIONS.md's "Verify before
// shipping", which is the list `/ship-staging` reads and runs. `npm run check`
// stays as fast as it was; the build is bought once, on the path that was already
// paying for it.
//
// AND IT READS BOTH DOORS. The mangling that shipped was in a string both front
// ends inline from the same module, and only the agency app's export was ever
// looked at — the same one-door blindness this file's own failure mode 1 is about.
/** Is the exported HTML older than the source that generates it?
 *
 * `npm run check` does NOT build, so once an export exists on disk these cases
 * compare CURRENT source against a build from whenever somebody last ran one —
 * and after a deploy, that is always older. The failure then reads "the animator
 * was altered between the source and the export", which is the sentence for a
 * minifier mangling the script: the exact thing this test exists to catch, and
 * the exact wrong conclusion. It cost real time twice in one night before this
 * check existed. A stale export is not evidence of anything. */
function staleExport(exported: string): boolean {
  try {
    const built = statSync(exported).mtimeMs
    return [join(ROOT, "shared", "web", "splash.ts"), join(ROOT, "shared", "web", "mark-loader.tsx")].some(
      (src) => existsSync(src) && statSync(src).mtimeMs > built
    )
  } catch {
    return false
  }
}

describe("what the compiler actually shipped", () => {
  // Set by `npm run check:built` once the export exists. Without it these cases
  // skip, which is right for `npm run check` and wrong for a ship.
  const REQUIRED = process.env.REQUIRE_EXPORT === "1"

  const DOORS = [
    ["the agency app", join(ROOT, "web", "out", "index.html")],
    ["the client portal", join(ROOT, "web-portal", "out", "index.html")],
  ] as const

  const cases: Array<[string, string, string]> = [
    ["the stylesheet", splashStyle(), "#ks-splash,.ks-mark-host{"],
    ["the resting mark", splashInner(), "<svg viewBox="],
    ["the animator", splashScript(), "!function(){if(window.__ksMark)"],
  ]

  for (const [door, exported] of DOORS) {
    const html = existsSync(exported) ? readFileSync(exported, "utf8") : null

    // The tripwire on the gate itself. Without this, `check:built` could pass on
    // a build that produced nothing and report the same green as one that
    // produced the right bytes.
    it.skipIf(!REQUIRED)(`${door} has actually been exported`, () => {
      expect(
        html,
        `REQUIRE_EXPORT is set but ${exported} does not exist — run npm run check:built, which builds first`
      ).not.toBeNull()
    })

    for (const [what, want, anchor] of cases)
      it.skipIf(!html)(`${door}: ${what} survives the build byte for byte`, () => {
        const at = html!.indexOf(anchor)
        expect(at, `${what} is not in ${exported} at all`).toBeGreaterThan(-1)
        const got = html!.slice(at, at + want.length)
        // Report the first divergence rather than 6KB of diff.
        let i = 0
        while (i < want.length && want[i] === got[i]) i++
        expect(
          i,
          `${what} was altered between the source and ${door}'s export, from character ${i}:\n` +
            `  source: ${JSON.stringify(want.slice(i, i + 80))}\n` +
            `  export: ${JSON.stringify(got.slice(i, i + 80))}\n` +
            (staleExport(exported)
              ? `THE EXPORT ON DISK IS OLDER THAN THE SOURCE — this is almost certainly a STALE BUILD, not a mangled one. \`npm run check\` does not build; run \`npm run check:built\`, which does, and only worry if it still says this.`
              : `Interpolating a compile-time constant into a shipped string is what did this last time.`)
        ).toBe(want.length)
      })
  }
})

// THE IN-APP LOADER FROZE ON THE REAL BUILD AND ON NOTHING ELSE.
//
// `MarkLoader` rendered the mark through `dangerouslySetInnerHTML`, which reads
// as the obvious thing to do — the splash does exactly that. On the built app it
// was a still logo every time. React re-applies `dangerouslySetInnerHTML` on the
// first update after hydration even when the string is unchanged, and that
// update arrives about two milliseconds after mount; it replaced the sixty-four
// element pool the animator had just installed with the three resting arcs, and
// the effect never ran again because its dependency list is empty. No error, no
// warning, no failing test — just a logo that does not turn.
//
// This paragraph used to end "the splash is not exposed to this, being
// server-rendered and never re-rendered". It was, measurably: React re-applied
// `#ks-splash` at 286ms on a laptop and 348ms on a phone and the mark froze for
// the rest of every boot. The splash cannot take this component's way out — it
// has to be painted by the parser — so it heals instead, and the case above
// ("carries on when its whole subtree is replaced underneath it") is that.
// The difference is invisible at the call site, which is exactly why both
// halves are a rule rather than a comment.
describe("the app's own loader keeps its subtree away from React", () => {
  const src = stripComments(readFileSync(join(ROOT, "shared", "web", "mark-loader.tsx"), "utf8"))

  it("never hands the mark to dangerouslySetInnerHTML", () => {
    expect(
      src,
      "MarkLoader renders the mark through React again — the first post-hydration update will wipe the animator's pool and the mark will stand still"
    ).not.toContain("dangerouslySetInnerHTML")
  })

  it("writes the markup and starts the animator in the same effect", () => {
    expect(src, "the host is never filled — the loader would be an empty box").toMatch(
      /\.innerHTML\s*=\s*splashInner\(\)/
    )
    expect(src, "the animator is never asked for").toContain("__ksMark")
  })

  it("says the app is loading without describing the animation", () => {
    expect(src, "no live region — a screen reader is told nothing is happening").toMatch(
      /aria-live="polite"/
    )
    expect(src, "the mark is decorative and must be hidden from a screen reader").toContain(
      'aria-hidden="true"'
    )
    expect(src, "the wait is not announced as a wait").toContain('aria-busy="true"')
  })
})

describe("the placeholder the owner is meant to change", () => {
  it("draws the built-in mark with no request of any kind", () => {
    const html = splashInner({ kind: "mark" })
    expect(html).toContain("<svg")
    expect(html, "the built-in mark must not fetch anything — that is its whole advantage").not.toMatch(
      /src=|href=|url\((?!#)/
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

// FAILURE MODE 5. Everything above reads the shipped strings; this runs them.
//
// The animator is assembled as script text, so nothing in this repo's toolchain
// ever parses it: `npm run check` would stay green with a syntax error in the
// middle of the boot screen. So it is evaluated here exactly as a browser would
// evaluate it, mounted on exactly the markup that ships, and stepped through the
// timeline by a fake requestAnimationFrame — which is also the only honest way
// to assert the thing that actually matters about an animation, which is that
// the picture at one moment is different from the picture at another.
describe("the animator, run", () => {
  /** Evaluate the shipped script text and mount it on the shipped markup.
   * Returns the cast group and a `step(ms)` that advances the clock.
   *
   * `screen` is the second argument because the animator now reads TWO things
   * off layout, once, at start-up: how wide the viewport is (which detail tier
   * this is) and how big the mark was actually drawn (how far off-frame the
   * pieces can start without starting off the phone). jsdom has no layout at
   * all — `getBoundingClientRect` is all zeros and `innerWidth` is a fixed
   * 1024 — so a test that wants to be on a phone has to say so. Left out, the
   * run lands where it always did: no rect, so no clamp, and the authored
   * fly-in. */
  function mount(
    opts?: { loop?: boolean; at?: number },
    screen?: { width: number; height: number; box: number }
  ) {
    const frames: Array<(t: number) => void> = []
    const real = window.requestAnimationFrame
    window.requestAnimationFrame = ((cb: (t: number) => void) => {
      frames.push(cb)
      return frames.length
    }) as typeof window.requestAnimationFrame
    window.cancelAnimationFrame = (() => {}) as typeof window.cancelAnimationFrame

    delete (window as { __ksMark?: unknown }).__ksMark
    // eslint-disable-next-line no-new-func -- the point of this test is to parse and run the shipped text
    new Function(markLoopScript())()

    const host = document.createElement("div")
    host.innerHTML = splashInner({ kind: "mark" })
    document.body.appendChild(host)

    const realSize = { width: window.innerWidth, height: window.innerHeight }
    const setSize = (w: number, h: number) => {
      Object.defineProperty(window, "innerWidth", { value: w, configurable: true })
      Object.defineProperty(window, "innerHeight", { value: h, configurable: true })
    }
    if (screen) {
      setSize(screen.width, screen.height)
      const svg = host.querySelector("svg")!
      svg.getBoundingClientRect = (() => ({ width: screen.box, height: screen.box })) as never
    }

    const base = performance.now()
    const stop = window.__ksMark!(host, opts)
    const step = (ms: number) => {
      const next = frames.pop()
      frames.length = 0
      next?.(base + ms)
    }
    return {
      host,
      stop,
      step,
      pending: () => frames.length,
      restore: () => {
        window.requestAnimationFrame = real
        if (screen) setSize(realSize.width, realSize.height)
        host.remove()
      },
    }
  }

  const cast = (host: HTMLElement) => host.querySelector(".ks-cast")!
  // paths AND circles: at full smear the whole cast collapses to one uniform
  // rim, which is a <circle> — a filter that only counted paths would read that
  // frame as an empty screen.
  const drawn = (host: HTMLElement) =>
    [...cast(host).querySelectorAll<SVGElement>("path,circle")].filter(
      (p) => p.style.display !== "none"
    )

  /** How much of a turn is being exposed on screen right now, in degrees — the
   * widest single streak. A visible rim circle is a whole turn by definition;
   * otherwise every arc here is `M x y A r r 0 f 1 x2 y2`, so the angle between
   * its two endpoints IS its width. */
  const exposure = (host: HTMLElement) => {
    let best = 0
    for (const e of drawn(host)) {
      if (e.tagName.toLowerCase() === "circle") return 360
      const d = e.getAttribute("d") ?? ""
      if (d.split("M").length > 2) return 360 // the two-arc full circle
      const n = d.match(/-?[\d.]+/g)?.map(Number)
      if (!n || n.length < 9) continue
      let w = ((Math.atan2(n[8], n[7]) - Math.atan2(n[1], n[0])) * 180) / Math.PI
      while (w < 0) w += 360
      best = Math.max(best, w)
    }
    return best
  }

  it("parses, publishes exactly one global, and takes the cast over", () => {
    const m = mount()
    expect(typeof window.__ksMark, "the shipped script text did not define window.__ksMark").toBe(
      "function"
    )
    m.step(300)
    expect(drawn(m.host).length, "nothing was drawn on the first frame").toBeGreaterThan(0)
    m.restore()
  })

  // THE THREE MOMENTS THE BRIEF NAMES. A boot loader is looked at for whatever
  // the network gives it, so it has to be a composition at 400ms as much as at
  // three and a half seconds — not a fade-in that has not finished.
  it("draws a different picture at 400ms, at 2s and at 3.4s", () => {
    const m = mount()
    // The whole frame, not just the transforms: at full smear there is one
    // <circle> and no transform on it at all.
    const shot = (ms: number) => {
      m.step(ms)
      return drawn(m.host)
        .map((p) => p.outerHTML)
        .join("|")
    }
    const early = shot(400)
    const mid = shot(2000)
    const late = shot(3400)
    for (const [name, s] of [
      ["400ms", early],
      ["2s", mid],
      ["3.4s", late],
    ] as const)
      expect(s.length, `nothing is on screen at ${name} — a loader has to look intentional there`).toBeGreaterThan(0)
    expect(early, "the mark is identical at 400ms and 2s — it is not moving").not.toBe(mid)
    expect(mid, "the mark is identical at 2s and 3.4s — it is not moving").not.toBe(late)
    m.restore()
  })

  // The fly-in comes from outside the frame and settles onto the circle. The
  // seat is the whole reason the first beat reads as mass rather than a fade.
  // The fly-in comes from outside the frame and settles onto the circle. The
  // seat is the whole reason the first beat reads as mass rather than a fade —
  // and it is the beat EVERY boot sees, so it is the one worth measuring.
  //
  // It also catches the NaN the source's damped settle used to produce: a piece
  // whose transform is `translate(NaN NaN)` has no radius, and this fails.
  it("brings the pieces in from off-frame and seats them", () => {
    const m = mount()
    const radius = (ms: number) => {
      m.step(ms)
      const t = drawn(m.host)[0]!.getAttribute("transform")!
      const hit = /translate\((-?[\d.]+) (-?[\d.]+)\)/.exec(t)
      expect(hit, `the first piece has no usable position at ${ms}ms: ${t}`).toBeTruthy()
      return Math.hypot(Number(hit![1]) - 540, Number(hit![2]) - 540)
    }
    const out = radius(150)
    expect(out, "the pieces do not start away from the centre — there is no fly-in").toBeGreaterThan(200)
    // Walk the whole settle, not one sample: the overshoot that produced NaN
    // lived in a two-frame window near the end of it.
    for (let ms = 1200; ms <= 1520; ms += 8) radius(ms)
    expect(radius(1520), "the pieces never arrive — the seat did not complete").toBeLessThan(60)
    m.restore()
  })

  // The three exposure regimes, in the order the composition crosses them:
  // stacked shutter samples while it is slow, tapered swept arcs as the trail
  // grows, and one uniform rim once the sweeps have wrapped past each other.
  it("crosses from stacked samples to swept trails to one uniform rim", () => {
    const m = mount()
    const tags = (ms: number) => {
      m.step(ms)
      return drawn(m.host).map((e) => e.tagName.toLowerCase())
    }
    const seated = tags(1400)
    expect(seated.length, "the seated mark is not three arcs").toBe(3)

    const smearing = tags(2300)
    expect(
      smearing.length,
      "the spin-up draws no more shapes than the resting mark — there is no motion trail"
    ).toBeGreaterThan(20)

    const released = tags(3400) // the release, past the lock
    expect(released, "the release never collapses to one uniform rim").toEqual(["circle"])
    const rim = drawn(m.host)[0]!
    expect(Number(rim.getAttribute("opacity"))).toBeGreaterThan(0)
    m.restore()
  })

  it("stops when it is told to, and stops itself at the end of a one-shot", () => {
    const m = mount()
    m.step(300)
    m.stop()
    m.step(600)
    expect(m.pending(), "stop() left a frame queued — the loop outlives the screen").toBe(0)

    const one = mount()
    one.step(SPLASH_MARK_MS + 200)
    expect(one.pending(), "a one-shot run queued another frame past its own end").toBe(0)
    one.restore()
    m.restore()
  })

  // WHAT THE OWNER SAW ON HIS PHONE, AS ARITHMETIC.
  //
  // The authored shutter is a function of SPEED alone (`w*.042`), which is only
  // the right exposure if the frames arrive at the rate it was tuned against.
  // On a laptop they do. On a phone parsing 700KB of bundle behind the splash
  // they arrive at about half that, and the mark then turns further between two
  // frames than the blur drawn to cover the gap — so the two exposures do not
  // touch and the ring reads as a strobe rather than a smear. Measured on the
  // narrowest piece through the spin-up: at 30 frames a second, 23% of frames
  // were covered before this, 100% after. It is invisible at 60fps, which is
  // exactly why it was invisible to us.
  //
  // The invariant is one sentence: DROPPING A FRAME MUST WIDEN THE EXPOSURE,
  // NOT WIDEN THE JUMP. This drives the same moment of the spin-up at 60 and at
  // 20 frames a second and fails if the picture is the same, because "the same"
  // is precisely what a speed-only shutter produces.
  it("widens the exposure when frames come slower, rather than jumping", () => {
    const at = (fps: number, ms: number) => {
      const m = mount()
      for (let t = 0; t <= ms; t += 1000 / fps) m.step(t)
      const e = exposure(m.host)
      m.restore()
      return e
    }
    const fast = at(60, 2100)
    const slow = at(20, 2100)
    expect(fast, "nothing is being exposed in the middle of the spin-up at all").toBeGreaterThan(0)
    // A MARGIN, AND NOT `> fast`, because `> fast` passes on the broken code.
    // The two runs land a fraction of a float apart, so a speed-only shutter
    // still gives two numbers that differ — measured, 291.6° against 293.8°,
    // and the bare comparison went green on exactly the code this is here to
    // catch. Frame-aware, the same pair is 301.5° against a full 360°: the slow
    // run has smeared right through to the uniform rim. Twenty degrees sits an
    // order of magnitude above the noise and well below the signal.
    expect(
      slow - fast,
      "dropping frames no longer widens the exposure — the shutter is back to being a function of speed alone, and a dropped frame is a visible jump again"
    ).toBeGreaterThan(20)
  })

  // THE ONE THAT WAS ACTUALLY BROKEN ON THE REAL BUILD, ON EVERY DEVICE.
  //
  // `SplashScreen` hands the mark to React through `dangerouslySetInnerHTML`,
  // and React re-applies that on the first update after hydration even when the
  // string is unchanged — replacing the whole <svg> and throwing away the pool
  // the animator installed. Measured on the exported app: 286ms on a laptop,
  // 348ms on a phone, after which the mark stood still at its resting pose for
  // the remaining three seconds. mark-loader.tsx documents this exact fault and
  // states the splash is immune to it because it is server-rendered and never
  // re-renders. It is not immune, and nothing threw, so nothing noticed.
  //
  // This is that moment: the host's markup is replaced underneath a running
  // animator, exactly as React does it, and the animation has to carry on.
  it("carries on when its whole subtree is replaced underneath it", () => {
    const m = mount()
    m.step(1900)
    const before = drawn(m.host).map((e) => e.outerHTML).join("|")
    expect(before.length, "nothing was on screen before the subtree was replaced").toBeGreaterThan(0)

    // what React does: the same string, applied again
    m.host.innerHTML = splashInner({ kind: "mark" })
    expect(
      m.host.querySelector(".ks-rest"),
      "this test no longer reproduces the fault — the resting mark is not back"
    ).toBeTruthy()

    m.step(2400)
    expect(
      m.host.querySelector(".ks-rest"),
      "the animator never took the cast back — the mark is frozen at the resting pose, which is what shipped"
    ).toBeNull()
    const after = drawn(m.host).map((e) => e.outerHTML).join("|")
    expect(after.length, "nothing is on screen after the subtree was replaced").toBeGreaterThan(0)
    expect(after, "the picture stopped moving after the subtree was replaced").not.toBe(before)
    m.restore()
  })

  // The other half of healing, and the reason it triggers on the RESTING MARK
  // rather than on merely being detached. A pool that has been replaced by
  // ANOTHER run's pool must be left alone: a bare "if detached, take it back"
  // has two loops tearing the same cast apart every frame, forever.
  it("does not fight another run for the same host", () => {
    const m = mount()
    m.step(600)
    const mine = cast(m.host).firstChild
    // what a second run leaves behind: a pool, and no resting mark
    cast(m.host).textContent = ""
    const theirs = document.createElementNS("http://www.w3.org/2000/svg", "g")
    cast(m.host).appendChild(theirs)
    m.step(900)
    expect(
      cast(m.host).firstChild,
      "the detached run grabbed the cast back off another run — they will now do this to each other every frame"
    ).toBe(theirs)
    expect(cast(m.host).firstChild).not.toBe(mine)
    m.restore()
  })

  // A phone gets a lighter composition ON PURPOSE. Asserted through the
  // animator's own allocation rather than by re-reading DETAIL_TIERS, because a
  // test that recomputes the table it is checking proves only that the table
  // exists.
  it("gives a phone less to draw and leaves a laptop the authored composition", () => {
    const pool = (width: number, height: number, box: number) => {
      const m = mount(undefined, { width, height, box })
      m.step(300)
      const n = cast(m.host).querySelectorAll("path,circle").length
      m.restore()
      return n
    }
    const phone = pool(375, 812, 210)
    const tablet = pool(768, 1024, 320)
    const laptop = pool(1440, 900, 320)
    const [, samples, sweeps] = DETAIL_TIERS[DETAIL_TIERS.length - 1]
    expect(
      laptop,
      "a laptop is no longer drawing the composition as authored — twelve shutter samples, nine sub-arcs, one rim"
    ).toBe(samples * 3 + sweeps * 3 + 1)
    expect(tablet, "an iPad is being asked for as much as a laptop").toBeLessThan(laptop)
    expect(phone, "a phone is being asked for as much as an iPad").toBeLessThan(tablet)
  })

  // The fly-in is in viewBox units, so what it means on screen depends on how
  // big the box was drawn — and `min(56vmin,320px)` draws it at 210px on a
  // 375px phone against 320px on everything wider. Measured with getBBox in
  // both engines, the fly-in's ink spanned 456px on that 375px screen and hung
  // 72px past the left edge: pieces appearing at the bezel instead of arriving
  // across the dark. It must pull IN on a phone and must not move at all on a
  // laptop, where the composition already fits with room to spare.
  it("starts the fly-in inside a narrow screen, and nowhere else", () => {
    const start = (width: number, height: number, box: number) => {
      const m = mount(undefined, { width, height, box })
      m.step(0)
      const t = drawn(m.host)[0]!.getAttribute("transform")!
      const hit = /translate\((-?[\d.]+) (-?[\d.]+)\)/.exec(t)
      expect(hit, `the first piece has no usable position at ${width}px: ${t}`).toBeTruthy()
      m.restore()
      return Math.hypot(Number(hit![1]) - 540, Number(hit![2]) - 540)
    }
    const laptop = start(1440, 900, 320)
    const phone = start(375, 812, 210)
    expect(
      laptop,
      "the laptop's fly-in has been retuned — it fits already, and it is the author's number"
    ).toBeGreaterThan(900)
    expect(phone, "the pieces still start off the side of a phone").toBeLessThan(laptop)
    expect(
      phone,
      "the phone's fly-in has been pulled in so far it is no longer an arrival from off-frame"
    ).toBeGreaterThan(500)
  })

  it("keeps going forever when the app's own loader asks it to loop", () => {
    const m = mount({ loop: true, at: MARK_INAPP_START_MS })
    m.step(SPLASH_MARK_MS * 3)
    expect(m.pending(), "the looping loader stopped — the app's wait would freeze mid-spin").toBe(1)
    expect(drawn(m.host).length).toBeGreaterThan(0)
    m.restore()
  })

  it("leaves the resting mark exactly as it is for anyone who asked for less motion", () => {
    const real = window.matchMedia
    window.matchMedia = ((q: string) =>
      ({ matches: q.includes("reduced-motion"), media: q })) as typeof window.matchMedia
    const m = mount()
    const before = cast(m.host).innerHTML
    m.step(1200)
    expect(
      cast(m.host).innerHTML,
      "the animator ran for somebody who asked for reduced motion"
    ).toBe(before)
    expect(drawn(m.host).length, "the resting mark is not on screen under reduced motion").toBe(3)
    window.matchMedia = real
    m.restore()
  })
})
