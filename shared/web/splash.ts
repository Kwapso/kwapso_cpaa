// shared/web/splash.ts — THE OPENING FRAME, ON EVERY FRONT DOOR.
//
// The first three-and-three-quarter seconds of a cold start belong to the brand:
// the kwapso mark assembles, locks, spins up until the rim smears, and then comes
// apart — the C and the two eyes leaving on their own release tangents — and the
// app arrives THROUGH that, not after it. The last three quarters of a second are
// a cross-dissolve: the pieces fly outward across the screen you were waiting for.
// It is a loading screen in the honest sense — a cold start on
// a phone really does spend that long fetching a chunk graph — so the animation
// is not decoration laid over a fast thing; it is what a person looks at instead
// of a white rectangle.
//
// THREE PROPERTIES THIS FILE EXISTS TO HOLD, none of them obvious:
//
//  1. IT PAINTS BEFORE THE APP DOES. The markup below is rendered by the ROOT
//     LAYOUT, which means it is baked into the exported .html the gateway serves
//     — it is on screen at first paint, before a single byte of the React bundle
//     has been fetched. A splash that waits for JavaScript has failed at the one
//     job it has. That is also why the animation is CSS and the mark is inline
//     SVG: nothing here can be late, because nothing here is a request.
//
//  2. IT LEAVES WITHOUT BEING TOLD. The overlay's own CSS animation ends on
//     `visibility: hidden` with a forwards fill, so it clears itself with
//     scripting disabled, with the bundle 404ing, with React never hydrating.
//     The inline script (splashScript) only adds the two courtesies CSS cannot:
//     a tap or a keypress skips it, and the node is display:none'd at the end so
//     it stops being a thing at all. It NEVER removes the node — React hydrates
//     this tree, and a node that vanished between server render and hydration is
//     a mismatch. Inert is cheaper than absent.
//
//  3. IT IS ONE FILE, NOT TWO. The agency app and the client portal are the same
//     product wearing two permissions, and their opening frame is the same frame.
//     shared/web/pwa.ts learned this the hard way — the identity used to be two
//     byte-identical copies and a rebrand half-succeeded. So both root layouts
//     import SplashScreen from here, and web/test/splash.test.ts fails if one of
//     them stops.
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
//
// WHY IT IS ALWAYS ONYX, in a theme-aware app. The theme class is written onto
// <html> by next-themes' own script, which runs AFTER this markup has painted —
// so a theme-aware splash would flash the wrong colour and then correct itself,
// which is precisely the ugliness a splash exists to prevent. It is also the
// right answer aesthetically: a studio ident looks the same for everybody. The
// mark's colour is the brand's, so a re-skin still reaches it.

import { brand } from "../brand"

/* ------------------------------- the timing ------------------------------- */

/** How long the mark runs, start to finish. The five beats of the original
 * animation — assemble, lock, spin-up, static, burst — are laid out across this
 * span as percentage stops in `ks-splash-spin` below, and the whole of it plays:
 * the screen is never taken away mid-beat. */
export const SPLASH_MARK_MS = 3800

/** How long the app takes to arrive. */
export const SPLASH_REVEAL_MS = 750

/** WHEN the app starts arriving — and the number that carries the owner's
 * direction, so it is derived rather than typed:
 *
 *   "we enter the app just as the last part of the animation of the logo
 *    breaking apart happens, like in the last 0.75 seconds remaining"
 *
 * So the reveal does not WAIT for the burst, it RIDES it. The overlay begins
 * dissolving exactly as the mark starts to come apart, and for three quarters of
 * a second the pieces are flying outward across the app rather than across a
 * black rectangle. Subtraction, not a constant: change either number above and
 * the overlap stays true by construction — which is the whole reason
 * web/test/splash.test.ts can assert the instruction instead of the arithmetic. */
export const SPLASH_REVEAL_AT_MS = SPLASH_MARK_MS - SPLASH_REVEAL_MS

/** Total time from first paint to an app you can touch. The owner asked for
 * "three to four seconds"; this is 3.8 — and because the reveal overlaps the
 * burst rather than following it, the animation got LONGER while the wait got
 * shorter by only a tenth. A tap cuts it short at any point. */
export const SPLASH_TOTAL_MS = SPLASH_MARK_MS

/* ------------------------------- the source ------------------------------- */

/** What plays. `mark` is the built-in SVG animation (no request, ~2KB of markup);
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

// The three arcs of the kwapso isotype, at rest.
//
// MEASURED OFF public/icons/kwapso-mark.png — the shipped brand asset — and not
// off the animation file the owner supplied, which is where the first attempt
// went wrong and is worth writing down. That file carries a thumbnail SVG of the
// same three arcs, so it read like a gift: exact paths, no measuring. But its
// arcs span 189°, and the logo's span 225°. The thumbnail is a frame from the
// BURST beat, caught after the rim has already begun to fail — a picture of the
// mark coming apart, which looks like the mark until you put the two side by
// side. Deriving geometry from a still of a moving thing is only safe when you
// know which frame you have.
//
// So: one circle, radius 120, centred in a 400 box; three arcs on it, given as
// the angles they occupy clockwise from east (SVG's y grows downward, so a
// clockwise sweep is sweep-flag 1):
//
//   the C     45° → 270°   (225°, the large arc)   — opens to the right
//   the eye   293° → 317°  (24°)                   — upper right, ~1:30
//   the tick  337° → 357°  (20°)                   — right, just above 3:00
//
// pathLength="1" normalises every path to a single unit, which is what lets one
// stroke-dashoffset keyframe draw a 470-unit arc and a 42-unit tick at the same
// rate without either being measured.
const MARK = `<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><g class="ks-mark" fill="none" stroke="${brand.accentHex.primary}" stroke-width="60"><path class="ks-arc" pathLength="1" d="M 284.9 284.9 A 120 120 0 1 1 200 80"/><path class="ks-arc ks-arc-2" pathLength="1" d="M 246.9 89.5 A 120 120 0 0 1 287.8 118.2"/><path class="ks-arc ks-arc-3" pathLength="1" d="M 310.5 153.1 A 120 120 0 0 1 319.8 193.7"/></g></svg>`

/** The onyx the mark sits on. Not a theme token, on purpose — see the header. */
const FIELD = "#08090b"

/* --------------------------------- render --------------------------------- */

/** The stylesheet, as a string, injected inline by SplashScreen.
 *
 * Every rule is scoped under #ks-splash so nothing here can reach the app, and
 * the whole thing is under a kilobyte because it ships in the head of every
 * exported page.
 *
 * `ease-in` on the reveal, not `linear`, and the reason is contrast rather than
 * taste. A straight cross-fade puts the onyx field at half strength halfway
 * through the burst — and in LIGHT mode the screen underneath is a pale mango
 * wash, so a mango mark at half opacity over it simply vanishes. Frozen at that
 * frame the pieces were not there at all. Ease-in holds the field near full for
 * most of the reveal and drops it in the last quarter, so the burst plays out
 * against something it can be seen against and the app still arrives during it.
 * Dark mode never showed this; the check that found it was looking at the wrong
 * mode by luck.
 *
 * The group's timing function is `linear` and the acceleration is spelled out in
 * where the percentage stops fall — that is how you hand-author a spin that
 * builds torque rather than easing politely in and out of one.
 *
 * `ks-splash-fly-1/2/3` are the burst, and they are three keyframe sets rather
 * than one because each arc leaves in a DIFFERENT direction — outward along the
 * radius it sits on. They translate inside the group, so the group's rotation
 * carries them: the pieces leave on tangents that keep turning, which is what
 * makes it read as a thing coming apart rather than a thing zooming. Each holds
 * still until 80%, the same instant the overlay begins to dissolve. Every arc
 * therefore runs TWO animations at once (draw, then fly), which is why the
 * -2/-3 rules re-state `animation-name` alongside their delay: a single
 * `animation-delay` value applies to every animation in the list, and staggering
 * the draw would otherwise stagger the burst off the end of the screen. */
export function splashStyle(): string {
  return `#ks-splash{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:${FIELD};animation:ks-splash-out ${SPLASH_REVEAL_MS}ms ease-in ${SPLASH_REVEAL_AT_MS}ms both}
@keyframes ks-splash-out{from{opacity:1}to{opacity:0;visibility:hidden}}
#ks-splash svg,#ks-splash video,#ks-splash img{width:min(42vmin,240px);height:auto;overflow:visible;display:block}
#ks-splash .ks-mark{transform-origin:200px 200px;animation:ks-splash-spin ${SPLASH_MARK_MS}ms linear both}
#ks-splash .ks-arc{stroke-dasharray:1;stroke-dashoffset:1;animation:ks-splash-draw 760ms cubic-bezier(.22,1,.36,1) both,ks-splash-fly-1 ${SPLASH_MARK_MS}ms cubic-bezier(.3,0,.7,1) both}
#ks-splash .ks-arc-2{animation-name:ks-splash-draw,ks-splash-fly-2;animation-delay:200ms,0ms}
#ks-splash .ks-arc-3{animation-name:ks-splash-draw,ks-splash-fly-3;animation-delay:330ms,0ms}
@keyframes ks-splash-draw{to{stroke-dashoffset:0}}
@keyframes ks-splash-fly-1{0%,80%{transform:translate(0,0)}100%{transform:translate(-178px,74px)}}
@keyframes ks-splash-fly-2{0%,80%{transform:translate(0,0)}100%{transform:translate(112px,-160px)}}
@keyframes ks-splash-fly-3{0%,80%{transform:translate(0,0)}100%{transform:translate(190px,-44px)}}
@keyframes ks-splash-spin{
0%{transform:rotate(-20deg) scale(.76);filter:blur(0)}
21%{transform:rotate(3deg) scale(1.07)}
26%{transform:rotate(0deg) scale(1)}
35%{transform:rotate(7deg) scale(1)}
42%{transform:rotate(64deg) scale(1)}
49%{transform:rotate(215deg) scale(1)}
57%{transform:rotate(520deg) scale(1);filter:blur(0)}
65%{transform:rotate(1010deg) scale(1)}
72%{transform:rotate(1650deg) scale(1.01);filter:blur(1.4px)}
80%{transform:rotate(2500deg) scale(1.03);filter:blur(2.4px);opacity:1}
88%{transform:rotate(3180deg) scale(1.12);filter:blur(1.6px);opacity:.9}
100%{transform:rotate(4060deg) scale(1.34);filter:blur(0);opacity:0}}
@media (prefers-reduced-motion:reduce){#ks-splash{animation-delay:520ms}#ks-splash .ks-mark{animation:none;transform:none}#ks-splash .ks-arc{animation:none;stroke-dashoffset:0}}`
}

/** What sits inside the overlay, for whichever source is configured.
 *
 * `muted` + `playsinline` are not optional on the video branch: without both,
 * iOS refuses to autoplay and the opening frame is a still with a play button
 * on it. `loop` because the file the owner supplied is a loop; the overlay's own
 * fade is what ends it, not the clip. */
export function splashInner(source: SplashSource = splashSource): string {
  if (source.kind === "video")
    return `<video src="${source.src}" autoplay muted loop playsinline aria-hidden="true"></video>`
  if (source.kind === "image") return `<img src="${source.src}" alt="" aria-hidden="true">`
  return MARK
}

/** The inline script — the two things CSS cannot do, and nothing else.
 *
 * Capture-phase listeners so a tap anywhere skips before the app beneath can act
 * on it, and both are torn down on the way out so the app is not left holding
 * two document-level listeners for the rest of the session. `display:none`
 * rather than `remove()`: React hydrates this subtree, and a node that
 * disappeared between server render and hydration is a mismatch — see the
 * header. Written as one expression with no template holes, because it is
 * injected as script text and the only safe amount of interpolation into script
 * text is none. */
export function splashScript(): string {
  return `!function(){var d=document,e=d.getElementById("ks-splash");if(!e)return;var f=function(){e.style.display="none";d.removeEventListener("pointerdown",f,!0);d.removeEventListener("keydown",f,!0)};d.addEventListener("pointerdown",f,!0);d.addEventListener("keydown",f,!0);setTimeout(f,${SPLASH_TOTAL_MS})}()`
}
