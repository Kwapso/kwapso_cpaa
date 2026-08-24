// THE OPENING FRAME HAS FIVE WAYS TO FAIL SILENTLY, AND ALL FIVE LOOK FINE ON
// THE MACHINE THAT WROTE IT.
//
// A boot loader is the one piece of UI nobody notices working and everybody
// notices stuck. It is on screen before any of our code runs, it is the first
// thing anybody sees of this product, and every one of its failure modes is
// invisible in a dev build:
//
//   1. It mounts on ONE door. The agency app opens on the brand and the client
//      portal opens on a white flash — the same class of half-rebrand that made
//      shared/web/pwa.ts a single file, found only by whoever happens to open
//      the other hostname.
//   2. It is not in the exported HTML, so nothing is on screen until the bundle
//      lands — which is the entire wait it exists to cover. A loader that waits
//      for JavaScript has failed at the one job it has.
//   3. It is in the HTML but it does not MOVE until the bundle lands, which
//      looks exactly like a frozen logo and has shipped here twice.
//   4. Somebody swaps `splashSource` to a video on a CDN, and the screen that
//      exists to hide a network wait becomes a network wait.
//   5. THE REASON THIS FILE HAS A JSDOM SECTION. The animation is not CSS — it
//      is four kilobytes of JavaScript injected as script TEXT, and script text
//      is not type-checked, not linted and not parsed until a browser reaches
//      it. A stray comma in it is a build that passes every check in this repo
//      and a boot screen that is a frozen logo. So the last describe RUNS the
//      thing: it evaluates the shipped string, mounts it on the shipped markup,
//      and drives the clock.
//
// AND THERE USED TO BE A SIXTH, WHICH IS WHY HALF THIS FILE IS SHORTER THAN IT
// WAS. Two copies of the mark animated at once on every boot: a fixed
// full-viewport overlay (`#ks-splash`) with its own animator run, its own opaque
// field and its own 3.8-second timer, and — behind it, invisible for about 2.7
// seconds of that — the app's own `MarkLoader`. It cost roughly a third of the
// frame rate at 20× CPU throttle. The overlay is deleted, and with it every case
// here about a sheet leaving the screen: its tap-to-skip, its safety timeout,
// its fill mode, its theme pre-resolution. A loading screen that IS the page's
// content is taken away by React when there is something to show, so the whole
// question "how does this get out of the way again" no longer has an answer to
// get wrong. What replaced those cases is the one below that says there may only
// ever be ONE run on a host, enforced by the animator rather than by agreement.
//
// So: both layouts derived from their own source, the stylesheet and the script
// read as the shipped strings, the score proved to be a WARP of the author's
// composition rather than a rewrite of it, and the animator actually executed.

import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { stripComments } from "@shared/rules/source-scan"
import {
  ARCS,
  DETAIL_TIERS,
  GEOMETRY,
  SCENES,
  SPLASH_AUTHORED_MS,
  SPLASH_MARK_MS,
  assertSameOrigin,
  markLoopScript,
  markScript,
  splashInner,
  splashStyle,
} from "@shared/web/splash"

const ROOT = join(__dirname, "..", "..")
const LAYOUTS = [
  ["the agency app", join(ROOT, "web", "app", "layout.tsx")],
  ["the client portal", join(ROOT, "web-portal", "app", "layout.tsx")],
] as const

describe("both front doors open on the same frame", () => {
  for (const [door, path] of LAYOUTS) {
    it(`${door}'s root layout imports and renders MarkRuntime`, () => {
      const src = stripComments(readFileSync(path, "utf8"))
      expect(
        src,
        `${door} must import the shared mark runtime — a second copy is how a rebrand half-succeeds`
      ).toContain('from "@shared/web/mark-runtime"')
      expect(src, `${door} imports MarkRuntime but never renders it`).toMatch(/<MarkRuntime\s*\/>/)
    })

    // DOM ORDER IS THE WHOLE CONTRACT NOW, and it is a different contract from
    // the one the overlay had. The overlay was first in the body because the
    // parser had to PAINT it first. This is first in the body because it
    // PUBLISHES the animator, and the loader further down the same body is what
    // gets painted — so the animator has to exist by the time the document
    // finishes parsing, which is the moment it starts the mark.
    it(`${door} renders it as the first thing in the body`, () => {
      const src = stripComments(readFileSync(path, "utf8"))
      const body = src.indexOf("<body")
      const runtime = src.indexOf("<MarkRuntime")
      const anythingElse = src.slice(body).search(/<(?!body|MarkRuntime)[A-Z]/)
      expect(runtime, "MarkRuntime is rendered before <body> opens").toBeGreaterThan(body)
      expect(
        runtime - body,
        `${door} renders another component before the mark runtime — the animator is published later than it needs to be`
      ).toBeLessThanOrEqual(anythingElse)
    })
  }

  // FAILURE MODE 6, AS A RULE RATHER THAN A MEMORY. The overlay is deleted; a
  // layout that renders a second full-screen mark of its own has re-created it,
  // and the symptom — two animations, one of them invisible — is the kind of
  // thing nobody files as a bug because the screen looks right.
  it("neither door has grown a second mark of its own", () => {
    for (const [door, path] of LAYOUTS) {
      const src = stripComments(readFileSync(path, "utf8"))
      expect(src, `${door} still renders the deleted splash overlay`).not.toContain("ks-splash")
      expect(
        src,
        `${door}'s layout draws the mark itself — the app has two animations again, and one of them will be behind the other`
      ).not.toContain("MarkLoader")
    }
  })
})

// WHAT IS ON SCREEN BEFORE ANY OF OUR CODE HAS RUN.
//
// Failure modes 2 and 3. The animation is JavaScript, so "with no JavaScript at
// all" cannot mean a moving mark — it means the mark AT REST, in the HTML,
// drawn by the parser and not assembled by a script. That used to be the
// overlay's markup; it is now `MarkLoader`'s, server-rendered into the exported
// page of every route that has to wait, which is every route but the sign-in
// screen and the 404 (both of which have real content to paint instead).
describe("the parser paints a correct mark before anything runs", () => {
  const css = splashStyle()

  // THE OVERLAY IS NOT ALLOWED BACK BY THE SIDE DOOR. Every one of these was
  // load-bearing for a fixed sheet over the app, and every one of them is a
  // symptom of somebody re-introducing one.
  it("has no sheet over the app, and so nothing that has to clear itself", () => {
    for (const gone of ["#ks-splash", "ks-splash-out", "position:fixed", "z-index", "visibility:hidden"])
      expect(
        css,
        `the stylesheet is back to covering the app with "${gone}" — a loading screen that is the page's own content is removed by React, and an overlay is the thing that has to remember to leave`
      ).not.toContain(gone)
  })

  // The loader fills the screen it is the only thing on. `svh` and not `vh`:
  // on iOS `vh` is the tallest the viewport ever gets, so a field measured in
  // it has a seam across the bottom on the one page you cannot scroll.
  it("fills the viewport it is the whole of", () => {
    expect(css, "the loader no longer fills the screen — the field ends mid-page").toContain(
      "min-height:100svh"
    )
    expect(css, "the mark is not centred in it").toContain("place-items:center")
  })

  // THE THEME, ANSWERED THREE WAYS AND IN THIS ORDER. The media query is the
  // one that works with scripting off; the two class rules come after it and
  // beat it on specificity, so an explicit choice wins in both directions.
  it("is the right colour in both themes, chosen or inherited", () => {
    const media = css.indexOf("@media (prefers-color-scheme:dark)")
    expect(media, "no OS-preference fallback — with scripting off the dark screen gets the light mark").toBeGreaterThan(-1)
    for (const rule of ["html.light .ks-mark-host", "html.dark .ks-mark-host"])
      expect(
        css.indexOf(rule),
        `${rule} is missing or sits above the media query — an explicit theme choice loses to the OS preference`
      ).toBeGreaterThan(media)
  })
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

// THE LOADER LASTS AS LONG AS THE WAIT, AND NOTHING ELSE DECIDES.
//
// The overlay had a `setTimeout(f, 3800)` and a CSS fade, because a sheet over
// the app has to be told when to go. That timer was also the mechanism for the
// owner's direction at the time — "stays long enough for one complete loop … we
// enter the app just as the last part of the animation of the logo breaking
// apart happens". With the sheet gone the direction has no mechanism and no
// subject: the loading screen IS the page, and the page is replaced the instant
// there is something to put there. On a fast boot that is less than one pass; on
// a slow one it is several, because the mark loops. Nothing is ever cut off
// mid-beat to reveal something, because nothing is being revealed.
//
// What IS worth locking is the other half — that nothing anywhere schedules the
// loader's own disappearance. A timer here is a screen that clears itself while
// the app is still loading, which is a blank page, and it is the single most
// likely thing for somebody to add back while trying to make the app feel
// faster.
describe("the loader is taken away by the app, never by a clock", () => {
  const SOURCES = ["shared/web/splash.ts", "shared/web/mark-loader.tsx", "shared/web/mark-runtime.tsx"]

  it("schedules nothing, in any of its own files", () => {
    for (const f of SOURCES) {
      const src = stripComments(readFileSync(join(ROOT, f), "utf8"))
      expect(
        src,
        `${f} sets a timer — the only thing a loading screen can do on a clock is disappear while the app is still loading`
      ).not.toMatch(/setTimeout|setInterval/)
    }
  })

  // Not "hides nothing" — the animator hides its own pool elements every frame,
  // which is how the three exposure regimes switch over. What it must not do is
  // take the HOST off the screen: the overlay did that (`e.style.display="none"`
  // on the node it owned, plus a `remove()` it was careful never to call because
  // React hydrates the subtree), and a loader that is the page's own content has
  // React to do it properly.
  it("never takes its own host out of the document", () => {
    for (const f of SOURCES) {
      const src = stripComments(readFileSync(join(ROOT, f), "utf8"))
      expect(
        src,
        `${f} removes a node — React owns this subtree, and a tree that moved between server render and hydration is a mismatch`
      ).not.toMatch(/\.remove\(\)|removeChild/)
      expect(
        src,
        `${f} hides the loader itself — that is the overlay's exit coming back, and it can only ever fire while the app is still loading`
      ).not.toMatch(/host\.style|host\.hidden|e\.style\.display="none"\s*;?\s*if/)
    }
  })

  it("still plays the whole of the owner's arc, as a loop rather than a hold", () => {
    expect(
      SPLASH_MARK_MS,
      "one pass of the mark is no longer the three-to-four seconds the owner asked for"
    ).toBeGreaterThanOrEqual(3000)
    expect(SPLASH_MARK_MS).toBeLessThanOrEqual(4000)
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
  })

  // THE MARK STARTS AT THE BEGINNING, and the deletion forced that rather than
  // taste. It used to join at the spin-up (`at: MARK_INAPP_START_MS`) because
  // the ident had just played the fly-in over the top of it, and replaying it
  // would have read as the app restarting. There is no ident in front of it any
  // more, so joining mid-movement would mean nobody ever sees the beat the
  // composition opens with — the one beat EVERY boot is long enough for.
  it("starts the one loader at the fly-in, not part-way through", () => {
    expect(
      markScript(),
      "the bootstrap seeks into the composition — with no ident in front of it, the fly-in would never be seen"
    ).not.toContain("at:")
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
  const js = markScript()

  // FAILURE MODE 3, AND THE WHOLE REASON THIS SCRIPT STILL EXISTS AT ALL.
  // `MarkLoader` starts the animator in an effect, and an effect runs at
  // hydration — which is the wait the loader is covering for. Measured on the
  // real export, hydration lands at 286ms on a laptop and 348ms on a phone with
  // a warm cache, and on the cold connection this screen exists for it is
  // however long the bundle takes. Without these four lines the parser paints a
  // mark that then stands perfectly still for all of it, which is
  // indistinguishable from the frozen logo that has shipped here twice.
  it("starts the mark itself, without waiting for React", () => {
    expect(js, "the bootstrap no longer looks for the loader").toContain(".ks-mark-stage")
    expect(
      js,
      "the bootstrap never calls the animator — the mark would not move until hydration"
    ).toContain("__ksMark")
    expect(js, "the mark does not loop — it would stop mid-wait on a slow boot").toContain("loop:!0")
  })

  // This script is FIRST in the body and the loader is further down it, so at
  // the moment it runs `.ks-mark-stage` has not been parsed yet. DCL fires when
  // the HTML is finished and does not wait for the async bundle, so it is early
  // by construction; the readyState branch covers a document already past it.
  it("waits for the document, and only for the document", () => {
    expect(js, "the bootstrap runs before the loader has been parsed, and finds nothing").toContain(
      "DOMContentLoaded"
    )
    expect(
      js,
      "no readyState branch — on an already-parsed document DOMContentLoaded never fires again"
    ).toContain('d.readyState==="loading"')
    expect(
      js,
      "the bootstrap waits on load, which waits on the very bundle it is covering for"
    ).not.toMatch(/addEventListener\("load"/)
  })

  // It is injected as script TEXT, so anything interpolated into it is a value
  // being executed. There is nothing left to interpolate but the animator.
  it("interpolates nothing at all", () => {
    expect(
      js.slice(js.indexOf("!function(){var d=document")),
      "the bootstrap carries a value from outside this module"
    ).not.toMatch(/\$\{|location\./)
  })

  // Reduced motion is honoured in the ANIMATOR, not in the stylesheet — a
  // stylesheet cannot stop a JavaScript loop, and there is no CSS animation
  // left anywhere for a media query to shorten.
  it("refuses to animate for anyone who asked for less motion", () => {
    expect(
      markLoopScript(),
      "the animator no longer checks prefers-reduced-motion — a spinning mark is not optional for everybody"
    ).toContain("prefers-reduced-motion: reduce")
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
    const bytes = Buffer.byteLength(splashStyle() + splashInner() + markScript(), "utf8")
    expect(bytes, `the inline mark payload is ${bytes} bytes`).toBeLessThan(10 * 1024)
  })
})

// THE MARK HAS TO BE MOVING BEFORE REACT EXISTS, AND THAT IS NOT A PREFERENCE.
//
// This replaces the suite that used to be here, which drove three real gestures
// through the overlay's tap-to-skip. There is no overlay and nothing to skip;
// what is worth running instead is the thing the overlay used to do for free and
// now has to be done deliberately — starting the animation without React.
//
// The other tests in this file READ the bootstrap. These RUN it, on a document
// shaped like the exported page: the script first, the loader further down it,
// and no bundle anywhere. `take()` empties `.ks-cast` and installs its own pool
// the moment a run starts, so "the resting mark is gone" is exactly "the
// animator has this host".
describe("the mark is moving before the bundle arrives", () => {
  const opened: Array<() => void> = []
  afterEach(() => {
    while (opened.length) opened.pop()!()
  })

  /** A document that looks like an exported page. `parsing` puts it in the state
   * it is ACTUALLY in when this script runs on a real load — mid-parse, with the
   * loader not yet reached — which is the branch that matters and the one jsdom
   * would otherwise never take, because a test document is always complete. */
  function page({ parsing = false, loader = true } = {}) {
    const frames: Array<(t: number) => void> = []
    const real = window.requestAnimationFrame
    window.requestAnimationFrame = ((cb: (t: number) => void) => {
      frames.push(cb)
      return frames.length
    }) as typeof window.requestAnimationFrame
    window.cancelAnimationFrame = (() => {}) as typeof window.cancelAnimationFrame
    delete (window as { __ksMark?: unknown }).__ksMark
    // A FRESH PAGE LOAD, which is what this stands for. The mark's clock now lives
    // on the DOCUMENT (splash.ts) so it survives a host being replaced mid-load;
    // leaving it behind here would carry one test's elapsed time into the next.
    delete (window as { __ksMarkBase?: unknown }).__ksMarkBase

    if (parsing) Object.defineProperty(document, "readyState", { value: "loading", configurable: true })

    let host: HTMLDivElement | null = null
    let stage: HTMLDivElement | null = null
    if (loader) {
      host = document.createElement("div")
      host.className = "ks-mark-host"
      stage = document.createElement("div")
      stage.className = "ks-mark-stage"
      stage.innerHTML = splashInner({ kind: "mark" })
      host.appendChild(stage)
      document.body.appendChild(host)
    }

    // eslint-disable-next-line no-new-func -- the point of this suite is to parse and run the shipped text
    new Function(markScript())()

    opened.push(() => {
      window.requestAnimationFrame = real
      if (parsing) delete (document as unknown as Record<string, unknown>).readyState
      host?.remove()
    })
    return {
      stage,
      frames,
      /** the animator has taken this host over */
      running: () => !!stage && !stage.querySelector(".ks-rest") && frames.length > 0,
    }
  }

  it("takes the loader over the moment the document is parsed", () => {
    const m = page({ parsing: true })
    expect(
      m.running(),
      "the bootstrap started before the loader was parsed — on a real page it would have found nothing"
    ).toBe(false)
    document.dispatchEvent(new Event("DOMContentLoaded"))
    expect(
      m.running(),
      "the mark is not turning when the HTML finishes — it would stand still until the bundle lands, which is the wait it exists to cover"
    ).toBe(true)
  })

  it("starts immediately on a document that is already past that", () => {
    const m = page()
    expect(
      m.running(),
      "DOMContentLoaded has already fired and will not fire again — the mark never starts"
    ).toBe(true)
  })

  // The sign-in screen and the 404 render real content rather than a loader, so
  // there is nothing on the page to animate. It must publish the animator
  // anyway: a client-side navigation from there to a screen that DOES wait
  // reaches `MarkLoader`, which asks for it by name.
  it("publishes the animator on a page with no loader, and does not reach for one", () => {
    const m = page({ loader: false })
    expect(typeof window.__ksMark, "the animator was not published on a page with no loader").toBe(
      "function"
    )
    expect(m.frames.length, "something is animating on a page that has no mark on it").toBe(0)
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
    return [
      join(ROOT, "shared", "web", "splash.ts"),
      join(ROOT, "shared", "web", "mark-loader.tsx"),
      join(ROOT, "shared", "web", "mark-runtime.tsx"),
    ].some(
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
    ["the stylesheet", splashStyle(), ".ks-mark-host{"],
    ["the resting mark", splashInner(), "<svg viewBox="],
    ["the animator", markScript(), "!function(){if(window.__ksMark)"],
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

// THE LOADER PUTS ITS MARK IN THE HTML, AND THAT DECISION HAS BEEN BOTH WAYS.
//
// `MarkLoader` rendered the mark through `dangerouslySetInnerHTML` first, and it
// was a still logo on every built app: React re-applies that on the first update
// after hydration even when the string is unchanged, and that update arrives
// about two milliseconds after mount. It replaced the sixty-four element pool
// the animator had just installed with the three resting arcs, and the effect
// never ran again because its dependency list is empty. No error, no warning, no
// failing test — a logo that does not turn.
//
// The fix at the time was to render EMPTY and let the effect own the subtree.
// That was right while an OVERLAY was what the parser painted. It is wrong now
// that this is: an empty box in the exported HTML is a blank screen until the
// bundle lands, which is the entire wait this exists to cover. So the markup is
// back in the server render and the fault is answered where it actually lives —
// the animator notices its own group has been detached and takes the cast back
// (`take()` in splash.ts, and the case below that drives it).
//
// Both halves are a rule rather than a comment because the difference is
// invisible at the call site: an empty box and a full one render identically the
// moment React arrives, and the whole cost is paid before it does.
describe("the app's own loader is in the exported HTML", () => {
  const src = stripComments(readFileSync(join(ROOT, "shared", "web", "mark-loader.tsx"), "utf8"))

  it("server-renders the mark, so the parser paints it", () => {
    expect(
      src,
      "the loader renders an empty box — nothing is on screen until the bundle lands, which is the wait it exists to cover"
    ).toMatch(/dangerouslySetInnerHTML=\{\{\s*__html:\s*splashInner\(\)/)
  })

  // Found by running it: the inline bootstrap starts the animation before React
  // arrives, so the animator has already emptied `.ks-cast` and installed its
  // pool by the time hydration compares the DOM to the server render. React
  // logs a mismatch it says it "won't patch up" — on the very first screen of
  // the app, every cold load, on both doors. It is noise rather than a fault
  // (the next update re-applies the markup and `take()` heals it), and noise on
  // the boot screen is the kind that gets learned rather than fixed.
  it("tells React the mark will not match, because it has been moving since before hydration", () => {
    expect(
      src,
      "no suppressHydrationWarning — every cold boot logs a hydration mismatch, because the animation legitimately started before React did"
    ).toContain("suppressHydrationWarning")
  })

  it("asks for the animator instead of shipping a second one", () => {
    expect(src, "the animator is never asked for").toContain("__ksMark")
    expect(
      src,
      "the loader loops nothing — a wait longer than one pass would end on a still mark"
    ).toContain("loop: true")
  })

  // The host is found from OUTSIDE React — by the inline bootstrap, before this
  // component exists — so the class is a contract and not styling.
  it("carries the class the bootstrap finds it by", () => {
    expect(
      src,
      "the stage lost its class — the inline script can no longer find the loader, and the mark stands still until hydration"
    ).toContain('className="ks-mark-stage"')
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
    opts?: { loop?: boolean },
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
    // A FRESH PAGE LOAD, which is what this stands for. The mark's clock now lives
    // on the DOCUMENT (splash.ts) so it survives a host being replaced mid-load;
    // leaving it behind here would carry one test's elapsed time into the next.
    delete (window as { __ksMarkBase?: unknown }).__ksMarkBase
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
    const m = mount({ loop: true })
    m.step(SPLASH_MARK_MS * 3)
    expect(m.pending(), "the looping loader stopped — the app's wait would freeze mid-spin").toBe(1)
    expect(drawn(m.host).length).toBeGreaterThan(0)
    m.restore()
  })

  // ── THE DEFECT THIS WHOLE CHANGE WAS ABOUT, AS AN INVARIANT ─────────────
  //
  // Two copies of the mark used to animate at once on every boot, because two
  // callers each started their own run and neither knew about the other. The
  // overlay is deleted, so today there is only one caller per host — but there
  // are still TWO ways a run begins (the inline bootstrap at DOMContentLoaded,
  // and MarkLoader's effect at hydration), and on a cold load both fire on the
  // same element. Making the second impossible belongs in the animator, because
  // an agreement between call sites is exactly what failed last time.
  it("hands a second caller the first caller's run, rather than starting another", () => {
    const m = mount({ loop: true })
    m.step(300)
    const pool = cast(m.host).firstChild
    const again = window.__ksMark!(m.host, { loop: true })
    expect(
      cast(m.host).childNodes.length,
      "a second call installed a second pool — that is two animations on one element, which is the defect this replaced"
    ).toBe(1)
    expect(cast(m.host).firstChild, "the second call threw the first run's pool away").toBe(pool)

    // And it is the SAME run, so whoever holds either handle can stop it. If it
    // were a no-op instead, MarkLoader's cleanup would leave the bootstrap's
    // loop ticking after the app had arrived.
    again()
    m.step(600)
    expect(
      m.pending(),
      "stopping through the second caller's handle left the run going — the loop outlives the screen"
    ).toBe(0)
    m.restore()
  })

  // The other half of the same worry, for the run nobody is holding. On a cold
  // load the bootstrap starts a run before React exists; if React then replaces
  // that host with a different element instead of hydrating it, the original
  // handle is gone and nothing would ever stop the loop.
  it("stops itself when its host leaves the document", () => {
    const m = mount({ loop: true })
    m.step(300)
    expect(m.pending(), "the run was not going in the first place").toBe(1)
    m.host.remove()
    m.step(600)
    expect(
      m.pending(),
      "the run carried on after its host was removed — an invisible rAF loop, forever, which is precisely what this change was made to stop"
    ).toBe(0)
    m.restore()
  })

  // ── THE RESTART THE OWNER COULD SEE ────────────────────────────────────────
  //
  // 24 Aug 2026: "every time I reload my app, the bootloader animation, for a
  // split second, runs and then, in that same split second, runs again. I can
  // see it… restart and then run again properly."
  //
  // Reloading the bare domain paints `/`'s loader and starts a run on THAT
  // element; `RootRedirect` then replaces the route with /home, React unmounts
  // that host and mounts a fresh one for the next screen's loader. The guard
  // that stops a second run is a property on the ELEMENT, so the new element had
  // no run, took a new clock, and began again from frame nought a few hundred
  // milliseconds in. The test above already covered the orphaned run STOPPING;
  // nothing covered the replacement CONTINUING, which is the half he could see.
  it("a replacement host picks the animation up where the last one left it", () => {
    const m = mount({ loop: true })
    m.step(900) // most of the way through the 1.3s fly-in
    const partWayIn = exposure(m.host)

    // React swaps the host: the old one leaves, a new one takes its place, and
    // the animator is asked to run on it — all inside ONE page load.
    const clockBefore = (window as { __ksMarkBase?: number }).__ksMarkBase
    m.host.remove()
    const next = document.createElement("div")
    next.innerHTML = splashInner({ kind: "mark" })
    document.body.appendChild(next)
    window.__ksMark!(next, { loop: true })

    expect(
      (window as { __ksMarkBase?: number }).__ksMarkBase,
      "the replacement took a new clock — which is the restart, exactly as reported"
    ).toBe(clockBefore)

    // And it shows: one frame later the new host is where the old one had got
    // to, not back at the beginning.
    m.step(920)
    expect(
      exposure(next),
      "the new host is drawing the opening frame again instead of continuing"
    ).toBeGreaterThan(partWayIn * 0.5)
    next.remove()
    m.restore()
  })

  // The other side of the rule needs no test: `__ksMarkBase` lives on `window`,
  // and a real page load makes a new one. That a reload starts the mark over is
  // a property of the browser, not of this code — and `mount()` deletes the key
  // for the same reason, so each test here stands for its own load.

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
