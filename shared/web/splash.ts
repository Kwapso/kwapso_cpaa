// shared/web/splash.ts — THE ONE ANIMATION, ON EVERY FRONT DOOR.
//
// The kwapso mark accretes out of the dark, builds torque until the rim smears
// into a solid ring, strobe-locks to one frozen upward-facing frame, and then
// lets go — the lock smearing into a long-exposure ring that falls dark. It is
// the owner's own composition (an 1080-square, 11.4-second, five-scene piece),
// re-implemented here with no React, no runtime and no library: the whole thing
// is arithmetic and one <svg>.
//
// ── THERE USED TO BE TWO OF IT ON SCREEN AT ONCE ──────────────────────────
//
// This file shipped an OVERLAY — `#ks-splash`, a fixed full-viewport ident with
// its own copy of the mark, its own animator run, its own opaque field and its
// own 3.8-second timer — and the app ALSO drew the mark for its own boot states
// (`MarkLoader`). Both ran during every boot: two element pools, two rAF loops,
// two of the same picture, one of them behind an opaque sheet. Measured at 20×
// CPU throttle it cost about a third of the frame rate, and roughly 2.7 seconds
// of the second copy was drawn where nobody could see it.
//
// The overlay is gone. What is left is the half that was already everywhere:
// the mark, drawn by `MarkLoader`, which every route that has to wait already
// server-renders. It kept the overlay's whole job, because the overlay's job was
// never the overlay:
//
//  1. IT PAINTS BEFORE THE APP DOES. `MarkLoader` renders the resting mark into
//     the exported .html the gateway serves, so it is on screen at first paint,
//     before a byte of the React bundle has been fetched. A loader that waits for
//     JavaScript has failed at the one job it has. And it MOVES before the bundle
//     too: the inline script below publishes the animator and starts it on the
//     host as soon as the document is parsed (`markScript`), which is many
//     seconds earlier than hydration on the connection this exists for.
//
//  2. IT LEAVES WHEN THE APP IS READY, and not on a timer. That is the whole
//     reason the overlay could be deleted rather than re-timed: a loading screen
//     that IS the page's content is unmounted by React the moment there is
//     something to show. There is no sheet left over the app to clear, so the
//     entire class of "the overlay never left" — the fill mode, the tap-to-skip,
//     the safety timeout, the display:none — has nothing to fail at.
//
//  3. IT IS ONE FILE, NOT TWO. The agency app and the client portal are the same
//     product wearing two permissions, and their opening frame is the same frame.
//     shared/web/pwa.ts learned this the hard way — the identity used to be two
//     byte-identical copies and a rebrand half-succeeded. So both root layouts
//     import MarkRuntime from here, and web/test/splash.test.ts fails if one of
//     them stops.
//
//  4. ONE HOST, ONE RUN — now structurally, not by convention. `__ksMark`
//     remembers the run it started on a host and hands the same one back to the
//     next caller, so the bootstrap below and `MarkLoader`'s own effect cannot
//     produce two. That is the defect above turned into something a future
//     caller cannot re-commit by accident.
//
// TO CHANGE THE ANIMATION, CHANGE `splashSource` BELOW — that is the whole
// interface, and it is deliberately the only one. Today it is the built-in mark.
// To swap in a rendered video or a still, drop the file into BOTH apps' public
// folders (web/public/splash/… and web-portal/public/splash/…) and write:
//
//     export const splashSource: SplashSource = { kind: "video", src: "/splash/loop.mp4" }
//
// Nothing else moves — not a layout, not a component, not a test. The source
// must be a same-origin path (it is asserted below): a loader that reaches out
// to another host has re-introduced the wait it was built to hide, and would be
// the one remote fetch on a door that otherwise makes none.

import { brand } from "../brand"

/* -------------------------------- the score ------------------------------- */

// THE COMPOSITION IS 11.4 SECONDS LONG AND A COLD BOOT IS UNDER FOUR, so the
// five scenes are AUTHORED at one length and PLAYED at another. That is not a
// liberty taken with somebody else's piece — it is the piece's own model: the
// runtime it was written against carries `nat` (the authored length a scene's
// arithmetic is written in) beside `dur` (the length it occupies on the
// timeline) and warps between them, per scene. This table is that warp, and it
// is the answer to the only real question a boot loader asks.
//
// Play the arc at authored speed and almost nobody ever sees past the fly-in:
// they get three pieces drifting inward, and the payoff — the spin-up, the lock,
// the release — plays to an empty room every time, because the app arrived.
// Cutting it off mid-beat is worse than not having it. So the WHOLE arc plays,
// every boot, compressed:
//
//   Coalesce  3.4s → 1.30s   the beat EVERY boot sees, so it keeps the most
//   Seat      0.8s → 0.22s   an idle drift; the first thing you shorten
//   SpinUp    2.6s → 0.85s   torque still reads as torque at 3×, because it is
//                            a law and not a keyframe
//   Lock      3.4s → 0.68s   a HOLD. Holding is the one thing you can cut to a
//                            fifth and lose nothing but the holding
//   Dissolve  1.2s → 0.75s   gets the most of that compression back: it is the
//                            beat the app most often arrives during
//
// Speed is not the same as haste: every easing curve, every mass proxy and the
// damped settle are the author's, unchanged, and the warp is per-scene so the
// shape of each beat survives. Only the dwell goes.
export const SCENES = [
  { name: "Coalesce", authored: 3.4, played: 1.3 },
  { name: "Seat", authored: 0.8, played: 0.22 },
  { name: "SpinUp", authored: 2.6, played: 0.85 },
  { name: "Lock", authored: 3.4, played: 0.68 },
  { name: "Dissolve", authored: 1.2, played: 0.75 },
] as const

const total = (pick: (s: (typeof SCENES)[number]) => number) =>
  Math.round(SCENES.reduce((n, s) => n + pick(s), 0) * 1000)

/** How long one pass of the mark takes, start to finish — the sum of the played
 * column, not a number typed beside it. The owner asked for "three to four
 * seconds", and that is now the length of the LOOP rather than the length of a
 * wait: the loader is on screen for exactly as long as the app takes to arrive,
 * which on a fast boot is less than one pass and on a slow one is several. */
export const SPLASH_MARK_MS = total((s) => s.played)

/** The authored length of the piece, for anyone checking that the warp is a warp
 * and not a rewrite. */
export const SPLASH_AUTHORED_MS = total((s) => s.authored)

/** HOW MUCH EXPOSURE A SCREEN GETS, and the one thing in this file that is a
 * judgement about a DEVICE rather than about the composition.
 *
 * `[shortest viewport side below which this tier applies, shutter samples,
 * swept sub-arcs]`, first match wins. The pool the animator allocates is
 * `samples × 3 + sweeps × 3 + 1`, so the tiers are 31, 52 and 64 elements.
 *
 * WHY THE VIEWPORT AND NOT THE MARK'S OWN SIZE, which is what actually costs a
 * rasteriser. Because they do not discriminate. `min(56vmin,320px)` renders the
 * mark at 320px on an iPad AND on a laptop — measured, both engines — so an
 * iPad and a laptop draw a pixel-identical picture and the only difference
 * between them is the machine. A layout-derived tier therefore cannot separate
 * the two, and the viewport's shortest side is the only signal in the room that
 * can. It is a proxy, and it is named as one.
 *
 * The thresholds are chosen so that a phone (375) takes the first tier, an iPad
 * takes the second in BOTH orientations (its short side is 768 either way), and
 * a laptop (900 on a 1440×900) takes the authored composition untouched. 820
 * rather than 800 because a 1366×768 laptop is rarer than an iPad and the
 * middle tier costs it nothing anyone can see.
 *
 * WHY THE MIDDLE TIER CUTS ONLY THE SHUTTER. The stacked samples are the
 * regime that runs while the mark is SLOW, where twelve near-identical copies
 * of the same three arcs buy very little; the swept arcs are the regime that
 * runs while it is fast, and thinning those is what makes a trail band. So the
 * tablet loses four samples and no sweeps, and only the phone — which is also
 * the only screen the composition does not fit on — gives up trail resolution. */
export const DETAIL_TIERS = [
  [600, 6, 4],
  [820, 8, 9],
  [1e9, 12, 9],
] as const

/* ------------------------------- the source ------------------------------- */

/** What plays. `mark` is the built-in composition (no request of any kind);
 * `video` and `image` point at a file this app serves itself. */
export type SplashSource =
  | { kind: "mark" }
  | { kind: "video"; src: string }
  | { kind: "image"; src: string }

/** THE PLACEHOLDER. Change this one value to change the opening frame of both
 * front doors. See the header for how to swap in a video. */
export const splashSource: SplashSource = { kind: "mark" }

/** Same-origin or nothing, checked when this module loads — which is during the
 * export, so a bad source fails the BUILD rather than the first paint.
 *
 * A source on another host would turn the screen that exists to hide a network
 * wait into a network wait, and it would do it silently: a splash that failed to
 * load just looks like a slightly different splash, and the person who would
 * notice is a client on hotel wifi, not us.
 *
 * A function rather than a bare `if` because TypeScript narrows a module-level
 * const to its literal initialiser: written inline, the guard's body is
 * unreachable code that the compiler rejects, and the obvious way to quiet that
 * is to delete the guard. Here the parameter is the full union, so the check is
 * real for every value the constant could be given next. */
export function assertSameOrigin(source: SplashSource): void {
  if (source.kind === "mark") return
  // "/…" yes, "//…" NO. A protocol-relative URL begins with a slash and is not
  // same-origin at all — the browser resolves //cdn.example.com/loop.mp4 against
  // the page's scheme and fetches it from cdn.example.com. The first version of
  // this guard checked only the leading slash and waved it through; the test
  // below is the one that noticed, which is the only reason it says `//` here.
  if (!source.src.startsWith("/") || source.src.startsWith("//"))
    throw new Error(
      `shared/web/splash.ts: splashSource.src must be a same-origin path beginning with a single "/", got ${JSON.stringify(source.src)}`
    )
}

assertSameOrigin(splashSource)

/* -------------------------------- the mark -------------------------------- */

// THE GEOMETRY, MEASURED BY THE COMPOSITION'S AUTHOR AND NOT RE-MEASURED HERE.
// Three arcs on one circle at mid-radius — a 246° "smile" and two eye wedges of
// 21° and 21.15°, separated by three 24° gaps.
//
// AT ZERO ROTATION THEY ARE THE LOGO. The smile runs 23.25°→269.25° clockwise
// from east, which leaves its opening in the upper right with the two wedges
// inside it at about 1:30 and 3:00 — public/icons/kwapso-mark.png, exactly. That
// matters here because the composition ALSO has a -56.25° pose it strobe-locks
// to, which the author calls "looking straight up" and which is a deliberately
// different picture: eyes at the top, mouth at the bottom. It is a beat in the
// animation, not the logo, and the resting frame below must not borrow it.
//
// (The splash this replaces measured its arcs off a still frame of this same
// animation and got 189° where the logo has 225°, because the frame it measured
// was taken after the rim had already begun to fail. Deriving geometry from a
// picture of a moving thing is only safe when you know which frame you have.
// These numbers come from the source, so there is no frame to pick.)
const SIZE = 1080
const CTR = SIZE / 2
const R = 300
const MIDR = (R * (1 + 0.599)) / 2
const BANDW = R * (1 - 0.599)

/** Every number the resting markup below carries, derived rather than typed —
 * because the markup itself cannot interpolate one (see `markSvg`). The test
 * asserts each of these strings appears in the shipped SVG, so changing `R` here
 * goes red with the value to paste rather than silently drawing a different
 * mark. It is the compromise the toolchain forced: the derivation is real, it
 * just runs in the test instead of in the string. */
export const GEOMETRY = {
  box: String(SIZE),
  centre: String(CTR),
  /** the mark's own circle, and the stroke that fattens it into a band */
  midRadius: String(MIDR),
  band: BANDW.toFixed(2),
  /** the bloom behind it, the faint rim halo, the strobe hairline */
  bloom: (R * 1.45).toFixed(2),
  rim: (R * 1.055).toFixed(2),
  hair: (BANDW * 0.2).toFixed(2),
}

/** The three pieces, at rest: each an arc about the origin, in the order the
 * composition lists them (smile, then the two eyes). */
export const ARCS = [
  [23.25, 269.25],
  [-66.75, -45.75],
  [-21.75, -0.6],
].map(([a0, a1]) => {
  const at = (a: number) => {
    const r = (a * Math.PI) / 180
    return `${(MIDR * Math.cos(r)).toFixed(2)} ${(MIDR * Math.sin(r)).toFixed(2)}`
  }
  return `M ${at(a0)} A ${MIDR} ${MIDR} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${at(a1)}`
})

// The composition's two palettes. `onyx` is the authored one and the app's dark
// mode; `amber` is its inverse and the app's light mode. The mark and the amber
// field are the BRAND's colours, so a re-skin reaches the opening frame.
//
// THE DARK FIELD IS THE APP'S OWN UNLIT PAPER NOW (ruling 22: mango in light,
// #141310 in dark). It was #08090b, with a real argument attached — "this is an
// ident, and an ident is shown against black" — and the ruling overrides it for
// a reason the argument did not consider: #08090b is a COLD near-black, and the
// kit's dark surfaces are warm unlit paper on the stated grounds that "a neutral
// grey reads as a different product". The splash is the first frame of the app,
// so opening on a colder surface than the app itself is the one place that
// mismatch is guaranteed to be seen, back to back, every launch.
//
// The two glows are still the composition's own. The kit does not specify them
// and they are not invented here; they are logged in NEEDS-A-SPEC.md.
const FIELD_DARK = "#141310"
const GLOW_DARK = "#3a2c10"
const GLOW_LIGHT = "#f6b83f"

/** The mark AT REST — what the parser paints, what stands still for anyone who
 * asked for less motion, and what is left on screen if the animator never runs.
 * The animator replaces the contents of `.ks-cast` and touches nothing else.
 *
 * Unrotated, so it is the LOGO (see above) — and, as it happens, the same pose
 * the animation itself settles into at the end of the fly-in, so the still frame
 * and the moving one agree about what the mark looks like standing still.
 *
 * ── NOT ONE NUMBER IS INTERPOLATED, AND THAT IS NOT A STYLE CHOICE ────────
 *
 * This was `[ …template literals with ${SIZE}, ${CTR}, ${MIDR}… ].join("")` for
 * about an hour, and the production build SHIPPED IT BROKEN. Next's minifier
 * constant-folds template literals whose substitutions are compile-time
 * constants — every number here is one — and folding this one DROPPED text:
 * `r="435" fill="url(#ks-glow)" opacity="0"/>` came out of `next build` as
 * `r="435`, so the halo, the rim ring and the strobe hairline reached the
 * browser as three malformed tags for it to guess at. Moving the whole thing
 * into a function body did not help; it moved the damage earlier.
 *
 * The two sibling strings came through the same build byte for byte, and now
 * the reason is clear: `splashStyle()` interpolates only property reads off an
 * imported object, and the animator is plain quoted strings — neither has a
 * constant to fold. So this one has none either. The geometry above is still
 * the source of truth: `web/test/splash.test.ts` recomputes every number from
 * `R` and fails with the value to paste if one of them ever moves.
 *
 * EVERY TEST IN THIS REPO PASSED WHILE IT WAS BROKEN, because vitest compiles
 * this file with a different toolchain (oxc) that folds nothing. A unit test
 * cannot see a compiler, so the same test file also re-reads the built export
 * whenever one exists. */
function markSvg(): string {
  return (
    '<svg viewBox="0 0 1080 1080" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' +
    '<defs>' +
    '<radialGradient id="ks-glow" cx="50%" cy="50%" r="50%">' +
    '<stop offset="0%" stop-color="var(--ks-glow)" stop-opacity=".95"/>' +
    '<stop offset="55%" stop-color="var(--ks-glow)" stop-opacity=".28"/>' +
    '<stop offset="100%" stop-color="var(--ks-glow)" stop-opacity="0"/>' +
    '</radialGradient>' +
    '<radialGradient id="ks-room" cx="50%" cy="46%" r="62%">' +
    '<stop offset="0%" stop-color="var(--ks-glow)" stop-opacity=".16"/>' +
    '<stop offset="100%" stop-color="var(--ks-glow)" stop-opacity="0"/>' +
    '</radialGradient>' +
    '</defs>' +
    // The room, the bloom, the rim halo and the strobe hairline. All four are
    // lit by the animator and invisible without it — they are the photograph of
    // the motion, and a resting frame has no motion to photograph.
    '<g class="ks-amb">' +
    '<rect class="ks-room" x="0" y="0" width="1080" height="1080" fill="url(#ks-room)" opacity="0"/>' +
    '<circle class="ks-halo" cx="540" cy="540" r="435.00" fill="url(#ks-glow)" opacity="0"/>' +
    '<circle class="ks-rim" cx="540" cy="540" r="316.50" fill="none" stroke="var(--ks-mark)" stroke-width="1" opacity="0"/>' +
    '<circle class="ks-hair" cx="540" cy="540" r="239.85" fill="none" stroke="var(--ks-mark)" stroke-width="24.06" opacity="0"/>' +
    '</g>' +
    '<g class="ks-cast" fill="none" stroke="var(--ks-mark)" stroke-width="120.30" stroke-linecap="butt">' +
    '<g class="ks-rest" transform="translate(540 540)">' +
    '<path d="M 220.37 94.68 A 239.85 239.85 0 1 1 -3.14 -239.83"/>' +
    '<path d="M 94.68 -220.37 A 239.85 239.85 0 0 1 167.37 -171.81"/>' +
    '<path d="M 222.77 -88.88 A 239.85 239.85 0 0 1 239.84 -2.51"/>' +
    '</g></g></svg>'
  )
}

/* --------------------------------- render --------------------------------- */

/** The stylesheet, as a string, injected inline by MarkRuntime.
 *
 * Every rule is scoped under `.ks-mark-host` so nothing here can reach the app,
 * and the whole thing is well under a kilobyte because it ships in every
 * exported page.
 *
 * THE COLOURS ARE THREE CUSTOM PROPERTIES AND NOTHING ELSE READS A HEX. The
 * field and the two glows are the composition's own (an ident is shown against
 * black); the mark and the amber field are the BRAND's, so a re-skin reaches the
 * opening frame. Mango on the dark screen, charcoal on the light one — mango on
 * near-white is not a mark, it is a suggestion.
 *
 * THREE WAYS THE THEME IS ANSWERED, AND THE ORDER MATTERS. The media query is
 * the one that works with scripting off; the two `html.light` / `html.dark`
 * rules come after it and beat it on specificity, so an explicit choice wins in
 * both directions. This can lean on next-themes' class where the overlay could
 * not: next-themes writes it from a blocking script that sits ABOVE the loader
 * in the body, so the class is already on <html> when the parser reaches the
 * mark. The overlay was FIRST in the body and had to resolve the theme itself —
 * nine lines of script that went with it.
 *
 * REDUCED MOTION IS THE RESTING FRAME, not a shorter spin: the animator refuses
 * to start (it asks the same media query), so what stays on screen is the mark
 * the parser drew — still, upright, correct.
 *
 * `overflow:visible` is load-bearing, not tidying. The pieces fly in from a
 * radius of 1010 in a 1080 box — outside the viewBox — so a clipped SVG would
 * hold them at the frame edge until they popped into existence. And the width is
 * set so the mark itself lands at about 180px: the mark is only 55% of its own
 * viewBox, because the rest of that box is the room the pieces arrive across.
 *
 * `100svh` and not `100vh`, because on iOS Safari `vh` is the tallest the
 * viewport ever gets and the address bar is over the bottom of it at rest —
 * a field measured in `vh` is a field with a seam across it until you scroll,
 * and a boot screen is the one page you cannot scroll. */
export function splashStyle(): string {
  return `.ks-mark-host{--ks-field:${brand.accentHex.primary};--ks-mark:${brand.accentHex.ink};--ks-glow:${GLOW_LIGHT};min-height:100svh;display:grid;place-items:center;background:var(--ks-field)}
@media (prefers-color-scheme:dark){.ks-mark-host{--ks-field:${FIELD_DARK};--ks-mark:${brand.accentHex.primary};--ks-glow:${GLOW_DARK}}}
html.light .ks-mark-host{--ks-field:${brand.accentHex.primary};--ks-mark:${brand.accentHex.ink};--ks-glow:${GLOW_LIGHT}}
html.dark .ks-mark-host{--ks-field:${FIELD_DARK};--ks-mark:${brand.accentHex.primary};--ks-glow:${GLOW_DARK}}
.ks-mark-host svg,.ks-mark-host video,.ks-mark-host img{width:min(56vmin,320px);height:auto;overflow:visible;display:block}`
}

/** What sits inside the loader, for whichever source is configured.
 *
 * `muted` + `playsinline` are not optional on the video branch: without both,
 * iOS refuses to autoplay and the opening frame is a still with a play button on
 * it. `loop` because the loader is on screen for as long as the app takes, which
 * is a length no clip can know in advance. */
export function splashInner(source: SplashSource = splashSource): string {
  if (source.kind === "video")
    return `<video src="${source.src}" autoplay muted loop playsinline aria-hidden="true"></video>`
  if (source.kind === "image") return `<img src="${source.src}" alt="" aria-hidden="true">`
  return markSvg()
}

/* ------------------------------- the animator ------------------------------ */

// THE PORT. The owner's composition with React, the composition runtime and the
// tweaks panel taken out, and nothing else changed: same geometry, same easing
// curves, same mass proxies (the heavy smile drifts in slower, tumbles less and
// trails further behind its slot than the two eyes), same torque law, same
// strobe lock, same three exposure regimes, all three tweak defaults folded in
// as the constants they were shipped at.
//
// WHY IT LOOKS AUTHORED RATHER THAN GENERIC — the part that would be lost first
// if somebody "simplified" this into a CSS spin:
//   · seat() is a near-constant closing velocity and then a critically damped
//     settle: one small rock into the detent, no bounce. It is not an ease.
//   · omega is a torque LAW, ω = 13 + 452·Δt^1.6, so speed only ever increases,
//     and phi is its integral. There is no keyframe anywhere in the spin.
//   · the lock is a STROBE. The true angle is blended toward one fixed frame
//     that keeps slipping and precessing, which is why it reads as a wheel
//     photographed under a strobe rather than a wheel that stopped.
//   · motion blur is a SWEPT ARC — not a filter, not a stack of samples: the
//     whole angular path a piece covers during the shutter, drawn once at
//     duty-cycle intensity, in nine nested sub-arcs so the trail ramps off
//     behind the piece instead of ending in a hard-edged sector. Cheaper than an
//     SVG filter, and it does not band.
//
// SHAPE. It publishes ONE global, `window.__ksMark(host, opts) -> stop()`, and
// returns a no-op for anything it cannot drive (no host, no rAF, no <svg>, no
// `.ks-cast`, reduced motion) — so every caller can ignore every failure. It
// allocates its element pool ONCE (12 shutter samples × 3 pieces, 9 sweeps × 3,
// one rim) and then only writes attributes, because this runs while the browser
// is still fetching and parsing the bundle it is covering for, and a loader that
// slows the load down has picked the wrong fight.
//
// ONE HOST, ONE RUN, AND IT IS THE FUNCTION THAT GUARANTEES IT — not the two
// callers agreeing. A host that already has a live run gets that run's own stop
// function back, so the inline bootstrap (which starts the mark the moment the
// document is parsed) and `MarkLoader`'s effect (which starts it at hydration,
// and stops it on unmount) are the SAME run whichever order they arrive in. Two
// copies of this animation used to run at once during every boot; making a
// second one impossible is cheaper than remembering not to ask for one.
//
// AND IT STOPS ITSELF WHEN ITS HOST LEAVES THE DOCUMENT. A run whose host was
// unmounted with nobody holding its stopper is a rAF loop that ticks forever on
// a detached tree — invisible, permanent, and exactly the cost this change was
// made to remove. `isConnected===false` rather than `!isConnected`, so a browser
// that has never heard of the property keeps animating rather than stopping on
// the first frame.
//
// It is injected as script TEXT, so it is written as one expression with no
// template holes. The single interpolation is the score — this module's own
// numbers, spliced as JSON — because the alternative is two copies of the
// timing, and two copies of a timing is how a timing drifts.
function markLoopBody(): string {
  return (
    'var W=window,PI=Math.PI,co=Math.cos,si=Math.sin,pw=Math.pow,mn=Math.min,mx=Math.max;' +
    'function cl(v,a,b){return v<a?a:v>b?b:v}' +
    'var CTR=540,MIDR=239.85,BANDW=120.3,GSYM=-56.25,DRIFT=13,K=452,PP=1.6,D0=1010,SWIRL=168;' +
    // a0, a1, mid, speed, tumble, swirl, lag — the mass proxies, per piece
    'var PC=[[23.25,269.25,146.25,.92,86,1,0],[-66.75,-45.75,-56.25,1.14,196,1.55,.3],' +
    '[-21.75,-.6,-11.175,1.07,-168,1.38,.16]];' +
    'function arc(a0,a1){var f=function(a){var r=a*PI/180;' +
    'return (MIDR*co(r)).toFixed(2)+" "+(MIDR*si(r)).toFixed(2)};' +
    'return "M "+f(a0)+" A "+MIDR+" "+MIDR+" 0 "+(a1-a0>180?1:0)+" 1 "+f(a1)}' +
    'var PATH=[arc(PC[0][0],PC[0][1]),arc(PC[1][0],PC[1][1]),arc(PC[2][0],PC[2][1])];' +
    'var FULL=arc(0,180)+arc(180,359.999);' +
    // Spliced for the same reason the score is: the alternative is two copies of
    // the tiers, and one of them would be the one nobody edits.
    'var DT=' +
    JSON.stringify(DETAIL_TIERS) +
    ';' +
    'var SC=' +
    JSON.stringify(SCENES.map((s) => [s.authored, s.played])) +
    ',PS=[],AS=[],ps=0,as=0,i;' +
    'for(i=0;i<SC.length;i++){PS[i]=ps;AS[i]=as;ps+=SC[i][1];as+=SC[i][0]}' +
    'var PLAY=ps,END=as,tSeat=AS[1],tTorq=AS[2],CLK=AS[3],CDIS=AS[4];' +
    'var tOn=CLK-.5,tFull=CLK+.2,tRel=CDIS+.1;' +
    // played seconds -> authored seconds, scene by scene
    'function warp(p){var k=SC.length-1,j;for(j=0;j<SC.length;j++){if(p<PS[j]+SC[j][1]){k=j;break}}' +
    'return mn(AS[k]+cl(p-PS[k],0,SC[k][1])*(SC[k][0]/SC[k][1]),END)}' +
    'function lin(t){return t}function eIQ(t){return t*t}' +
    'function eIOQ(t){return t<.5?2*t*t:-1+(4-2*t)*t}' +
    'function eIOS(t){return -(co(PI*t)-1)/2}' +
    'function eOS(t){return si(t*PI/2)}function eIS(t){return 1-co(t*PI/2)}' +
    'function ip(x,y,e){return function(t){var n=x.length,j;if(t<=x[0])return y[0];' +
    'if(t>=x[n-1])return y[n-1];for(j=0;j<n-1;j++){if(t>=x[j]&&t<=x[j+1]){' +
    'var s=x[j+1]-x[j],l=s===0?0:(t-x[j])/s,f=e&&e.push?(e[j]||lin):(e||lin);' +
    'return y[j]+(y[j+1]-y[j])*f(l)}}return y[n-1]}}' +
    // THE ONE CORRECTION TO THE SOURCE, and it is a bug fix rather than a
    // retime. The damped rock at the end of the settle overshoots 1 by about
    // 1.8e-5 just before it lands — a hundredth of a pixel of travel, invisible
    // — and `1 - s` therefore goes very slightly NEGATIVE for a frame or two,
    // which `Math.pow(inv, 1.35)` turns into NaN and NaN turns into
    // `transform="translate(NaN NaN)"`. The pieces vanish for those frames. So
    // seat() is clamped at its own ceiling here. Found by driving the ported
    // clock frame by frame in a test, which is not something you can do to a
    // preview you are watching.
    'function seat(e){if(e<=0)return 0;if(e>=1)return 1;if(e<.72)return e/.72*.87;' +
    'var u=(e-.72)/.28;return mn(1,.87+.13*(1-pw(1-u,2.4))+.03*Math.exp(-5.4*u)*si(u*PI*2.1))}' +
    'function om(t){return DRIFT+(t>tTorq?K*pw(t-tTorq,PP):0)}' +
    'function ph(t){var b=-DRIFT*(t-tTorq);return t<=tTorq?b:b-K*pw(t-tTorq,PP+1)/(PP+1)}' +
    'function ct(t){return cl(pw(om(t),2)*1.5e-7,0,6.5)}' +
    'var ALOCK=GSYM+360*Math.round((ph(tFull)-GSYM)/360);' +
    'var lock=ip([tOn,tFull,tRel,tRel+.62],[0,1,1,0],[eIOQ,lin,eIQ]);' +
    'var wob=ip([tOn,tFull,tRel+.4],[0,1,.55],eIOS);' +
    'var scl=ip([0,tSeat,CDIS,END],[1.045,1,1,1.035],[eOS,lin,eIS]);' +
    'var vib=ip([tTorq+.8,CLK,tRel+.5],[0,1,0],eIOS);' +
    'var exp=ip([0,.62,CDIS,END-.15,END],[0,1,.94,.06,0],[eIOS,lin,eIQ,lin]);' +
    'function ang(t){var p=ph(t),L=lock(t);if(L<=0)return p;var d=t-tFull;' +
    'var w=(si(d*2*PI*2.35)*1.45+si(d*2*PI*5.7+.9)*.42)*wob(t);' +
    'return p+(ALOCK-3.6*d-1.1*si(d*1.7)+w-p)*L}' +
    'function xf(m,A,sg,tu,d,sc,tx,ty){var a=(m+A+sg)*PI/180,C=co(a),S=si(a);' +
    'return "translate("+(CTR+tx+d*C).toFixed(2)+" "+(CTR+ty+d*S).toFixed(2)+") rotate("+tu.toFixed(2)+' +
    '" "+(MIDR*sc*C).toFixed(2)+" "+(MIDR*sc*S).toFixed(2)+") rotate("+sg.toFixed(3)+' +
    '") rotate("+A.toFixed(3)+") scale("+sc.toFixed(4)+")"}' +
    'function sh(e,on){if(e.__k!==on){e.__k=on;e.style.display=on?"":"none"}}' +
    'W.__ksMark=function(host,o){o=o||{};var noop=function(){};' +
    'if(!host||!W.requestAnimationFrame)return noop;' +
    // The second caller on this host gets the FIRST caller's run back. See the
    // note above: this is the invariant, not a courtesy.
    'if(host.__ksRun)return host.__ksRun;' +
    'var svg=host.querySelector("svg");if(!svg)return noop;' +
    'var cast=svg.querySelector(".ks-cast");if(!cast)return noop;' +
    'try{if(W.matchMedia&&W.matchMedia("(prefers-reduced-motion: reduce)").matches)return noop}catch(_){}' +
    'var NS="http://www.w3.org/2000/svg",cr=[],sw=[],n,i,g=document.createElementNS(NS,"g");' +
    // The tier, and the entry radius, resolved ONCE per run — never per frame.
    // Both read layout, and a layout read inside the frame loop is the thing a
    // loader must never do while the browser is parsing the bundle behind it.
    'var SS=mn(W.innerWidth||1280,W.innerHeight||800),TI=DT[DT.length-1];' +
    'for(n=0;n<DT.length;n++)if(SS<DT[n][0]){TI=DT[n];break}' +
    'var NSA=TI[1],NSW=TI[2],d0=D0;' +
    // THE PIECES ARRIVE FROM OFF-FRAME, NOT FROM OFF-PHONE. D0 is in viewBox
    // units, so what it means on screen depends entirely on how big the box
    // was drawn — and `min(56vmin,320px)` draws it at 210px on a 375px phone
    // and 320px everywhere wider. Sampled with getBBox across the whole
    // Coalesce, in both engines, the fly-in's ink reaches 456 CSS px on a phone
    // whose screen is 375 — 72px off the left edge and 9px off the right at
    // once — against 676px inside a 768px iPad and 691px inside a 1440 laptop.
    // So on a phone, and only on a phone, the first beat happens partly off the
    // screen. This pulls the farthest piece (the 1.14× eye) back to 92% of the
    // half-width, with a floor that keeps it well outside the mark's own circle
    // so it is still an arrival. It can only ever pull IN: on an iPad the limit
    // works out at 1046 and on a laptop 1961, both above D0, so both are left
    // at exactly the number the composition was authored with — measured
    // afterwards at 673px and 690px, unchanged.
    'try{var bw=svg.getBoundingClientRect().width/1080,vw=W.innerWidth||0;' +
    'if(bw>0&&vw>0)d0=mn(D0,mx(560,vw*.46/(1.14*bw)))}catch(_){}' +
    'function mk(d){var e=document.createElementNS(NS,"path");if(d)e.setAttribute("d",d);' +
    'e.style.display="none";e.__k=false;g.appendChild(e);return e}' +
    'for(n=0;n<NSA;n++)for(i=0;i<3;i++)cr.push(mk(PATH[i]));' +
    'for(n=0;n<NSW*3;n++)sw.push(mk(""));' +
    'var rim=document.createElementNS(NS,"circle");rim.setAttribute("fill","none");' +
    'rim.setAttribute("stroke","var(--ks-mark)");rim.style.display="none";rim.__k=false;' +
    // TAKING THE CAST OVER IS SOMETHING THIS HAS TO BE ABLE TO DO TWICE.
    //
    // `MarkLoader` hands the mark to React through `dangerouslySetInnerHTML` —
    // it has to, because the parser must find the resting mark already in the
    // exported HTML — and React re-applies that on the first update after
    // hydration even when the string has not changed. It replaces the whole
    // <svg>, which throws away the pool this just installed AND detaches every
    // node cached below. Measured on the real export, on both front doors, at
    // 286ms on a laptop and 348ms on a phone: the mark stopped a third of a
    // second in and stood at the resting pose for the rest of the boot. Every
    // boot, on every device, and nothing errored, which is why nothing caught
    // it.
    //
    // So the animator does not assume it owns the subtree: it re-acquires and
    // re-installs whenever its own group has been detached. `isConnected===false`
    // rather than `!isConnected`, so a browser that has never heard of the
    // property re-installs never rather than every frame. The cost of the guard
    // is one property read per frame; the cost of not having it is the whole
    // animation. It is also the general answer — an extension, a second render,
    // anything that re-writes this subtree loses one frame instead of all of them.
    'var amb,room,halo,rimg,hair;' +
    'var qs=function(c){return amb?amb.querySelector(c):null};' +
    'function take(){var s=host.querySelector("svg");if(!s)return;' +
    'var c=s.querySelector(".ks-cast");if(!c)return;' +
    'c.textContent="";c.appendChild(g);amb=s.querySelector(".ks-amb");' +
    'room=qs(".ks-room");halo=qs(".ks-halo");rimg=qs(".ks-rim");hair=qs(".ks-hair")}' +
    'g.appendChild(rim);take();' +
    'var op=function(e,v){if(e)e.setAttribute("opacity",v.toFixed(4))};' +
    'var ctr=function(e,x,y){if(e){e.setAttribute("cx",(CTR+x).toFixed(2));' +
    'e.setAttribute("cy",(CTR+y).toFixed(2))}};' +
    // THE SHUTTER IS THE FRAME, NOT A CONSTANT. This is the fix for what the
    // owner actually saw, and it is worth being precise about the mechanism.
    //
    // The authored smear is a function of SPEED alone — `w*.042` — which is
    // right only if the frames arrive at the rate it was tuned against. They do
    // not. Through the spin-up the mark turns 43°–103° between two 60Hz frames
    // while that formula draws at most 65° of blur, so even a perfect phone is
    // already drawing a trail shorter than the gap it has to cover; at the ~30
    // frames a second a phone actually gets while it is parsing 700KB of
    // bundle, the step is 87°–258° against the same 32°–65°. A long-exposure
    // ring whose exposures do not touch is not a ring, it is a strobe — which
    // is exactly "glitching very badly", and exactly why it looks fine on a
    // laptop that never drops a frame.
    //
    // So the exposure covers the angle actually travelled since the previous
    // drawn frame. A dropped frame now produces a LONGER streak instead of a
    // jump, which is what a real shutter does, and the piece degrades into
    // itself rather than into a stutter. It also gets CHEAPER as it slows: a
    // wider smear crosses `rmx` sooner, and past that the whole cast collapses
    // to the one uniform rim circle.
    //
    // Only the unlocked share catches up. During the lock the visible angle is
    // pinned to one frozen pose on purpose, so `w` is no longer what the eye
    // sees turning and covering it would erase the strobe the composition is
    // built around. `.35` authored seconds is the outer edge of a gap worth
    // covering — beyond that the mark has not blurred, it has been away, and
    // the honest thing is to re-expose from where it now is.
    'var pT=-1;' +
    'function draw(T){var w=om(T),L=lock(T),ex=cl(exp(T),0,1),vb=vib(T);' +
    'var dt=(pT>=0&&T>pT&&T-pT<.35)?T-pT:0;pT=T;' +
    'var vx=(si(T*58.3)*1.05+si(T*121.7+2)*.42)*vb,vy=(co(T*67.1+1)*1.05+si(T*103.3)*.38)*vb;' +
    'var sm=mx((1-L)*mn(372,w*.042)+L*cl(4+w*.0035,4,19),(1-L)*mn(372,w*dt));' +
    'var rmx=cl((sm-62)/44,0,1),smx=cl((sm-14)/20,0,1),spx=smx*(1-rmx),cmx=1-smx;' +
    'var nc=0,ns=0,i,k,j,p,s,inv,d,sg,tu,A,sc,e;' +
    'if(cmx>.002){var M=cl(Math.ceil(sm/3.2),1,NSA),st=sm>.2?sm/mx(w,40):0;' +
    'var al=(1-pw(1-.985*ex,1/M))*cmx;' +
    'for(k=0;k<M;k++){var tk=T-(M>1?st*k/(M-1):0);A=ang(tk);sc=scl(tk);' +
    'for(i=0;i<3;i++){p=PC[i];s=seat(cl((tk-p[6])/(tSeat-p[6]),0,1));inv=1-s;' +
    'd=d0*p[3]*inv+ct(tk)*s;sg=-SWIRL*p[5]*pw(inv,1.35);tu=-p[4]*inv;e=cr[nc++];' +
    'e.setAttribute("transform",xf(p[2],A,sg,tu,d,sc,vx,vy));op(e,al);sh(e,true)}}}' +
    'if(spx>.002){A=ang(T);sc=scl(T);var a9=(1-pw(1-.9*ex,1/NSW))*spx;' +
    'for(i=0;i<3;i++){p=PC[i];s=seat(cl((T-p[6])/(tSeat-p[6]),0,1));inv=1-s;' +
    'd=d0*p[3]*inv+ct(T)*s;sg=-SWIRL*p[5]*pw(inv,1.35);tu=-p[4]*inv;' +
    'var t2=xf(p[2],A,sg,tu,d,sc,vx,vy),wd=p[1]-p[0];' +
    'for(j=1;j<=NSW;j++){var s9=mn(359.9,wd+sm*j/NSW);e=sw[ns++];' +
    'e.setAttribute("d",s9>=359.4?FULL:arc(p[0],p[0]+s9));' +
    'e.setAttribute("transform",t2);op(e,a9);sh(e,true)}}}' +
    'for(k=nc;k<cr.length;k++)sh(cr[k],false);' +
    'for(k=ns;k<sw.length;k++)sh(sw[k],false);' +
    'if(rmx>.002){sc=scl(T);ctr(rim,vx,vy);rim.setAttribute("r",(MIDR*sc).toFixed(2));' +
    'rim.setAttribute("stroke-width",(BANDW*sc).toFixed(2));' +
    'op(rim,.82*ex*rmx);sh(rim,true)}else sh(rim,false);' +
    'if(amb){s=seat(cl(T/tSeat,0,1));var nr=cl(1-(d0*.92*(1-s)+ct(T)*s)/140,0,1);' +
    'op(room,ex);op(halo,(.1+cl(sm/260,0,1)*.34)*nr*ex);' +
    'ctr(rimg,vx,vy);op(rimg,cl(sm/120,0,1)*.16*nr*ex);' +
    'ctr(hair,vx,vy);op(hair,L*cl((w-2600)/3000,0,1)*.05*ex)}}' +
    'var live=1,id=0,' +
    // THE CLOCK BELONGS TO THE PAGE LOAD, NOT TO THE HOST ELEMENT.
    //
    // THE OWNER, 24 Aug 2026: "every time I reload my app, the bootloader
    // animation, for a split second, runs and then, in that same split second,
    // runs again. I can see it… restart and then run again properly."
    //
    // He was watching the mark start over. Reloading the bare domain paints
    // `/`'s loader, the bootstrap starts a run on THAT element, and then
    // `RootRedirect` replaces the route with /home — so React unmounts that host
    // and mounts a fresh one for the next screen's loader. The guard above
    // (`host.__ksRun`) is a property on the ELEMENT, so the new element has no
    // run, gets a new `base`, and the animation begins again from frame nought
    // a few hundred milliseconds in. Every reload, because `/` is the PWA's
    // start_url.
    //
    // Anchoring `base` to the DOCUMENT fixes the whole class rather than that
    // one route: a real page load makes a new window and therefore a new clock,
    // which is exactly when the mark SHOULD start over, while any number of
    // host swaps inside one load — the /roles and /members hops, a bounce
    // through /onboarding, a stop-then-start on one node — pick the animation up
    // where the last host left it. The alternative was deleting the redirect,
    // which would have left the same restart waiting on three other paths.
    'base=(W.__ksMarkBase||(W.__ksMarkBase=' +
    '(W.performance&&performance.now?performance.now():Date.now())));' +
    'var stop=function(){live=0;host.__ksRun=null;if(id)W.cancelAnimationFrame(id)};' +
    'function tick(now){if(!live)return;' +
    // The host was unmounted and nobody stopped us. Nothing is on screen, so
    // neither is this.
    'if(host.isConnected===false)return stop();var el=(now-base)/1000;' +
    // Heal on the RESTING MARK, not merely on being detached — that narrowness
    // is the whole safety of it. `.ks-rest` is in `splashInner` and in nothing
    // else, so its presence says precisely "somebody re-applied the server
    // markup", which is the one fault this repairs. A run that is detached
    // because ANOTHER run took the host finds a pool instead, no `.ks-rest`,
    // and quietly does nothing — where a bare "if detached, take it back" would
    // have had the two of them tearing the cast apart every frame forever.
    'if(g.isConnected===false){var c2=host.querySelector(".ks-cast");' +
    'if(c2&&c2.querySelector(".ks-rest"))take()}' +
    'var pl=o.loop?el%PLAY:mn(el,PLAY);draw(warp(pl));' +
    'if(!o.loop&&el>=PLAY)return stop();id=W.requestAnimationFrame(tick)}' +
    'id=W.requestAnimationFrame(tick);host.__ksRun=stop;return stop}'
  )
}

/** The animator, wrapped so it runs once and leaves exactly one name behind. */
export function markLoopScript(): string {
  return `!function(){if(window.__ksMark)return;${markLoopBody()}}()`
}

/** The inline script: publish the animator, then START it on the loader the
 * exported page already carries — without waiting for React.
 *
 * ── WHY THIS EXISTS AT ALL, WHEN `MarkLoader` STARTS THE MARK ITSELF ───────
 *
 * Because `MarkLoader` starts it at HYDRATION, and hydration is the thing the
 * loader is covering for. Measured on the real export, hydration lands at 286ms
 * on a laptop and 348ms on a phone with a warm cache — and on the cold, slow
 * connection this screen exists for, it is however long 700KB of bundle takes.
 * Without this the parser paints a mark that then stands perfectly still for all
 * of it, which is the exact symptom the owner reported the last time the boot
 * loader broke. So the animation and the bundle race, and the animation wins by
 * everything except a cache hit.
 *
 * `DOMContentLoaded` and not "now", because this script is FIRST in the body and
 * the loader is further down it: at this instant `.ks-mark-stage` has not been
 * parsed yet. DCL fires when the HTML is finished (35KB, already downloaded) and
 * it does not wait for the async bundle scripts, so it is early by construction.
 * The `readyState` branch covers being re-run against a document that is already
 * past that point.
 *
 * IT DOES NOT NEED A STOPPER. `__ksMark` hands the same run to `MarkLoader` when
 * it hydrates, so the component's own cleanup stops it on unmount; and if the
 * bundle never arrives at all, the run ends itself the moment its host leaves
 * the document. There is nothing left over either way.
 *
 * ── WHAT USED TO BE HERE, AND WHY IT ISN'T ────────────────────────────────
 *
 * Nine lines resolving the theme the way next-themes resolves it (the overlay
 * was above next-themes' own script and could not ask), a capture-phase
 * tap-to-skip carefully tuned to tell a deliberate tap from a thumb resting on
 * the glass, a keydown skip, four listener teardowns, and a `setTimeout` that
 * hid the overlay after 3.8 seconds no matter what. All of it was the cost of
 * putting a SHEET over the app: every line answers "how does this get out of the
 * way again". A loading screen that is the page's own content is taken away by
 * React when there is something to show, so none of those questions has an
 * answer to get wrong. */
export function markScript(): string {
  return (
    `${markLoopScript()};` +
    `!function(){var d=document,go=function(){var h=d.querySelector(".ks-mark-stage");` +
    `if(h&&window.__ksMark)window.__ksMark(h,{loop:!0})};` +
    `if(d.readyState==="loading")d.addEventListener("DOMContentLoaded",go);else go()}()`
  )
}
