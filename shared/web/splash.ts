// shared/web/splash.ts — THE OPENING FRAME, ON EVERY FRONT DOOR.
//
// The kwapso mark accretes out of the dark, builds torque until the rim smears
// into a solid ring, strobe-locks to one frozen upward-facing frame, and then
// lets go — the lock smearing into a long-exposure ring that falls dark as the
// app arrives through it. It is the owner's own composition (an 1080-square,
// 11.4-second, five-scene piece), re-implemented here with no React, no runtime
// and no library: the whole thing is arithmetic and one <svg>.
//
// THREE PROPERTIES THIS FILE EXISTS TO HOLD, none of them obvious:
//
//  1. IT PAINTS BEFORE THE APP DOES. The markup below is rendered by the ROOT
//     LAYOUT, which means it is baked into the exported .html the gateway serves
//     — it is on screen at first paint, before a single byte of the React bundle
//     has been fetched. A splash that waits for JavaScript has failed at the one
//     job it has. The SVG in the HTML is the mark AT REST, correctly oriented,
//     drawn by the parser; the inline script only takes it over and moves it.
//     So there is no frame in which nothing is on screen.
//
//  2. IT LEAVES WITHOUT BEING TOLD. The overlay's own CSS animation ends on
//     `visibility: hidden` with a forwards fill, so it clears itself with
//     scripting disabled, with the bundle 404ing, with React never hydrating,
//     and with the animator having thrown on its first line. The ANIMATION is
//     the only thing here that needs JavaScript; the LEAVING never does. The
//     inline script adds the two courtesies CSS cannot: a tap or a keypress
//     skips it, and the node is display:none'd at the end so it stops being a
//     thing at all. It NEVER removes the node — React hydrates this tree, and a
//     node that vanished between server render and hydration is a mismatch.
//
//  3. IT IS ONE FILE, NOT TWO. The agency app and the client portal are the same
//     product wearing two permissions, and their opening frame is the same frame.
//     shared/web/pwa.ts learned this the hard way — the identity used to be two
//     byte-identical copies and a rebrand half-succeeded. So both root layouts
//     import SplashScreen from here, and web/test/splash.test.ts fails if one of
//     them stops.
//
// AND ONE MORE, NEW: the animator this file inlines is also what the APP'S OWN
// boot states draw (shared/web/mark-loader.tsx → ShellLoading, the portal's
// session wait). It is published once as `window.__ksMark`, from markup that is
// already in every exported page, so the in-app loader costs the React bundle
// nothing and cannot drift from the splash. The handover reads as one continuous
// movement: the ident dissolves and the app's own wait already has the mark
// turning (MARK_INAPP_START_MS below).
//
// TO CHANGE THE ANIMATION, CHANGE `splashSource` BELOW — that is the whole
// interface, and it is deliberately the only one. Today it is the built-in mark.
// To swap in a rendered video or a still, drop the file into BOTH apps' public
// folders (web/public/splash/… and web-portal/public/splash/…) and write:
//
//     export const splashSource: SplashSource = { kind: "video", src: "/splash/loop.mp4" }
//
// Nothing else moves — not a layout, not a component, not a test. The source
// must be a same-origin path (it is asserted below): a splash that reaches out
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
//   Dissolve  1.2s → 0.75s   gets the most of that compression back, because the
//                            app arrives THROUGH it (see SPLASH_REVEAL_AT_MS)
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

/** How long the mark runs, start to finish — the sum of the played column, not a
 * number typed beside it. The owner asked for "three to four seconds". */
export const SPLASH_MARK_MS = total((s) => s.played)

/** The authored length of the piece, for anyone checking that the warp is a warp
 * and not a rewrite. */
export const SPLASH_AUTHORED_MS = total((s) => s.authored)

/** How long the app takes to arrive: the Dissolve, exactly. */
export const SPLASH_REVEAL_MS = Math.round(SCENES[SCENES.length - 1].played * 1000)

/** WHEN the app starts arriving — and the number that carries the owner's
 * direction, so it is derived rather than typed:
 *
 *   "we enter the app just as the last part of the animation of the logo
 *    breaking apart happens, like in the last 0.75 seconds remaining"
 *
 * The reveal does not WAIT for the release, it RIDES it: the overlay begins
 * dissolving on the frame the lock lets go, and for three quarters of a second
 * the ring is smearing outward across the app rather than across a black
 * rectangle. Subtraction, not a constant — and because both terms come from the
 * score above, the instruction stays true if the score is ever retuned. */
export const SPLASH_REVEAL_AT_MS = SPLASH_MARK_MS - SPLASH_REVEAL_MS

/** Total time from first paint to an app you can touch. A tap cuts it short at
 * any point. */
export const SPLASH_TOTAL_MS = SPLASH_MARK_MS

/** Where the app's OWN boot states join the loop (shared/web/mark-loader.tsx).
 * Not zero, and that is the whole point: the splash has just finished, so
 * starting the in-app mark from the fly-in would read as the ident restarting.
 * It picks the animation up at the spin-up instead. */
export const MARK_INAPP_START_MS = Math.round((SCENES[0].played + SCENES[1].played) * 1000)

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
// field are the BRAND's colours, so a re-skin reaches the opening frame; the
// onyx field and the two glows are the composition's own, and the onyx is
// deliberately deeper than the app's dark screen — this is an ident, and an
// ident is shown against black.
const FIELD_DARK = "#08090b"
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

/** The stylesheet, as a string, injected inline by SplashScreen.
 *
 * Every rule is scoped under #ks-splash or .ks-mark-host so nothing here can
 * reach the app, and the whole thing is about a kilobyte because it ships in
 * every exported page.
 *
 * THE COLOURS ARE TWO CUSTOM PROPERTIES AND NOTHING ELSE READS A HEX. That is
 * what lets one animator serve two situations: over the splash's own field the
 * mark is mango on near-black (the authored `onyx`), and inside the app the same
 * markup inherits whatever the theme has already decided — mango on the dark
 * screen, charcoal on the light one, because mango on near-white is not a mark,
 * it is a suggestion.
 *
 * The splash cannot ask the app what theme it is: next-themes writes its class
 * onto <html> from a script the parser has not reached yet. So the inline script
 * resolves it the way next-themes does (the stored choice, then the OS
 * preference) and puts `ks-lit` on the overlay before the first frame — the
 * right colour immediately, rather than the wrong one corrected. With scripting
 * off there is no stored choice to read, so the media query is the fallback, and
 * the default with neither is the authored onyx.
 *
 * `ease-in` on the reveal, not `linear`, and the reason is contrast rather than
 * taste. A straight cross-fade puts the field at half strength halfway through
 * the release — and in LIGHT mode the screen underneath is a pale mango wash, so
 * a charcoal ring over it at half opacity lands on nearly the value of the app
 * behind it. Ease-in holds the field near full for most of the reveal and drops
 * it in the last quarter, so the release plays out against something it can be
 * seen against and the app still arrives during it.
 *
 * REDUCED MOTION IS THE RESTING FRAME, not a shorter spin: the animator refuses
 * to start (it asks the same media query), so what stays on screen is the mark
 * the parser drew — still, upright, correct — and the overlay leaves early.
 *
 * `overflow:visible` is load-bearing, not tidying. The pieces fly in from a
 * radius of 1010 in a 1080 box — outside the viewBox — so a clipped SVG would
 * hold them at the frame edge until they popped into existence. And the widths
 * are set so the mark itself lands at about 180px, which is the size the splash
 * this replaces drew it at: the mark is only 55% of its own viewBox, because the
 * rest of that box is the room the pieces arrive across. */
export function splashStyle(): string {
  return `#ks-splash,.ks-mark-host{--ks-field:${FIELD_DARK};--ks-mark:${brand.accentHex.primary};--ks-glow:${GLOW_DARK}}
#ks-splash.ks-lit,.ks-mark-host{--ks-field:${brand.accentHex.primary};--ks-mark:${brand.accentHex.ink};--ks-glow:${GLOW_LIGHT}}
.dark .ks-mark-host{--ks-mark:${brand.accentHex.primary}}
#ks-splash{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:var(--ks-field);animation:ks-splash-out ${SPLASH_REVEAL_MS}ms ease-in ${SPLASH_REVEAL_AT_MS}ms both}
@keyframes ks-splash-out{from{opacity:1}to{opacity:0;visibility:hidden}}
#ks-splash svg,#ks-splash video,#ks-splash img{width:min(56vmin,320px);height:auto;overflow:visible;display:block}
.ks-mark-host{display:grid;place-items:center}
.ks-mark-host svg{width:min(34vmin,190px);height:auto;overflow:visible;display:block}
.ks-mark-host .ks-amb{display:none}
@media (prefers-color-scheme:light){#ks-splash{--ks-field:${brand.accentHex.primary};--ks-mark:${brand.accentHex.ink};--ks-glow:${GLOW_LIGHT}}}
@media (prefers-reduced-motion:reduce){#ks-splash{animation-delay:520ms}}`
}

/** What sits inside the overlay, for whichever source is configured.
 *
 * `muted` + `playsinline` are not optional on the video branch: without both,
 * iOS refuses to autoplay and the opening frame is a still with a play button on
 * it. `loop` because a supplied file would be a loop; the overlay's own fade is
 * what ends it, not the clip. */
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
    'var svg=host.querySelector("svg");if(!svg)return noop;' +
    'var cast=svg.querySelector(".ks-cast");if(!cast)return noop;' +
    'try{if(W.matchMedia&&W.matchMedia("(prefers-reduced-motion: reduce)").matches)return noop}catch(_){}' +
    'var NS="http://www.w3.org/2000/svg",cr=[],sw=[],n,i,g=document.createElementNS(NS,"g");' +
    'function mk(d){var e=document.createElementNS(NS,"path");if(d)e.setAttribute("d",d);' +
    'e.style.display="none";e.__k=false;g.appendChild(e);return e}' +
    'for(n=0;n<12;n++)for(i=0;i<3;i++)cr.push(mk(PATH[i]));' +
    'for(n=0;n<27;n++)sw.push(mk(""));' +
    'var rim=document.createElementNS(NS,"circle");rim.setAttribute("fill","none");' +
    'rim.setAttribute("stroke","var(--ks-mark)");rim.style.display="none";rim.__k=false;' +
    'g.appendChild(rim);cast.textContent="";cast.appendChild(g);' +
    'var amb=svg.querySelector(".ks-amb");' +
    'var qs=function(c){return amb?amb.querySelector(c):null};' +
    'var room=qs(".ks-room"),halo=qs(".ks-halo"),rimg=qs(".ks-rim"),hair=qs(".ks-hair");' +
    'var op=function(e,v){if(e)e.setAttribute("opacity",v.toFixed(4))};' +
    'var ctr=function(e,x,y){if(e){e.setAttribute("cx",(CTR+x).toFixed(2));' +
    'e.setAttribute("cy",(CTR+y).toFixed(2))}};' +
    'function draw(T){var w=om(T),L=lock(T),ex=cl(exp(T),0,1),vb=vib(T);' +
    'var vx=(si(T*58.3)*1.05+si(T*121.7+2)*.42)*vb,vy=(co(T*67.1+1)*1.05+si(T*103.3)*.38)*vb;' +
    'var sm=(1-L)*mn(372,w*.042)+L*cl(4+w*.0035,4,19);' +
    'var rmx=cl((sm-62)/44,0,1),smx=cl((sm-14)/20,0,1),spx=smx*(1-rmx),cmx=1-smx;' +
    'var nc=0,ns=0,i,k,j,p,s,inv,d,sg,tu,A,sc,e;' +
    'if(cmx>.002){var M=cl(Math.ceil(sm/3.2),1,12),st=sm>.2?sm/mx(w,40):0;' +
    'var al=(1-pw(1-.985*ex,1/M))*cmx;' +
    'for(k=0;k<M;k++){var tk=T-(M>1?st*k/(M-1):0);A=ang(tk);sc=scl(tk);' +
    'for(i=0;i<3;i++){p=PC[i];s=seat(cl((tk-p[6])/(tSeat-p[6]),0,1));inv=1-s;' +
    'd=D0*p[3]*inv+ct(tk)*s;sg=-SWIRL*p[5]*pw(inv,1.35);tu=-p[4]*inv;e=cr[nc++];' +
    'e.setAttribute("transform",xf(p[2],A,sg,tu,d,sc,vx,vy));op(e,al);sh(e,true)}}}' +
    'if(spx>.002){A=ang(T);sc=scl(T);var a9=(1-pw(1-.9*ex,1/9))*spx;' +
    'for(i=0;i<3;i++){p=PC[i];s=seat(cl((T-p[6])/(tSeat-p[6]),0,1));inv=1-s;' +
    'd=D0*p[3]*inv+ct(T)*s;sg=-SWIRL*p[5]*pw(inv,1.35);tu=-p[4]*inv;' +
    'var t2=xf(p[2],A,sg,tu,d,sc,vx,vy),wd=p[1]-p[0];' +
    'for(j=1;j<=9;j++){var s9=mn(359.9,wd+sm*j/9);e=sw[ns++];' +
    'e.setAttribute("d",s9>=359.4?FULL:arc(p[0],p[0]+s9));' +
    'e.setAttribute("transform",t2);op(e,a9);sh(e,true)}}}' +
    'for(k=nc;k<cr.length;k++)sh(cr[k],false);' +
    'for(k=ns;k<sw.length;k++)sh(sw[k],false);' +
    'if(rmx>.002){sc=scl(T);ctr(rim,vx,vy);rim.setAttribute("r",(MIDR*sc).toFixed(2));' +
    'rim.setAttribute("stroke-width",(BANDW*sc).toFixed(2));' +
    'op(rim,.82*ex*rmx);sh(rim,true)}else sh(rim,false);' +
    'if(amb){s=seat(cl(T/tSeat,0,1));var nr=cl(1-(D0*.92*(1-s)+ct(T)*s)/140,0,1);' +
    'op(room,ex);op(halo,(.1+cl(sm/260,0,1)*.34)*nr*ex);' +
    'ctr(rimg,vx,vy);op(rimg,cl(sm/120,0,1)*.16*nr*ex);' +
    'ctr(hair,vx,vy);op(hair,L*cl((w-2600)/3000,0,1)*.05*ex)}}' +
    'var t0=(o.at||0)/1000,live=1,id=0,' +
    'base=(W.performance&&performance.now?performance.now():Date.now());' +
    'function tick(now){if(!live)return;var el=(now-base)/1000+t0;' +
    'var pl=o.loop?el%PLAY:mn(el,PLAY);draw(warp(pl));' +
    'if(!o.loop&&el>=PLAY){live=0;return}id=W.requestAnimationFrame(tick)}' +
    'id=W.requestAnimationFrame(tick);' +
    'return function(){live=0;if(id)W.cancelAnimationFrame(id)}}'
  )
}

/** The animator, wrapped so it runs once and leaves exactly one name behind. */
export function markLoopScript(): string {
  return `!function(){if(window.__ksMark)return;${markLoopBody()}}()`
}

/** The inline script: publish the animator, resolve the theme, start the mark,
 * and add the two things CSS cannot do.
 *
 * The theme is read the way next-themes reads it — the stored choice first, the
 * OS preference second — because next-themes' own script sits further down the
 * document than this one and has not run yet.
 *
 * Capture-phase listeners so a tap anywhere skips before the app beneath can act
 * on it, and both are torn down on the way out so the app is not left holding
 * two document-level listeners for the rest of the session. Skipping also STOPS
 * the animator: a loop still running behind an invisible overlay is a loop still
 * costing frames on the screen that replaced it.
 *
 * `display:none` rather than `remove()`: React hydrates this subtree, and a node
 * that disappeared between server render and hydration is a mismatch — see the
 * header. The try/catch cannot swallow the EXIT, because the exit is the CSS
 * animation and nothing in here touches it. */
export function splashScript(): string {
  return (
    `${markLoopScript()};` +
    `!function(){var d=document,e=d.getElementById("ks-splash");if(!e)return;var s=null;` +
    `try{var m=null;try{m=localStorage.getItem("theme")}catch(_){}` +
    `if(m!=="dark"&&(m==="light"||!(window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches)))` +
    `e.className="ks-lit";s=window.__ksMark(e)}catch(_){}` +
    `var f=function(){e.style.display="none";if(s)s();` +
    `d.removeEventListener("pointerdown",f,!0);d.removeEventListener("keydown",f,!0)};` +
    `d.addEventListener("pointerdown",f,!0);d.addEventListener("keydown",f,!0);` +
    `setTimeout(f,${SPLASH_TOTAL_MS})}()`
  )
}
