"use client";

/* ============================================================================
   CursorGlow — the one pointer-following flourish in the system
   (1 direct call site: `ScreenShell`'s ground).

   THE CLIENT'S OWN WORDS, VERBATIM, 2026-09-03: "many versions ago, the
   movement of the mouse had a mango glow that followed it... lets bring that
   back (yes i am aware it will be invisible if mango ground - its ok)". Git
   history of both repos carries no prior implementation under any name — this
   is a new build, not a restoration, despite the memory of one. She supplied a
   found-online reference afterward, paraphrased: "was not exactly this / would
   be on the background layer, never over the body."

   WHAT SURVIVES FROM THE REFERENCE, AND WHAT DID NOT
   The reference was plain shadcn/Tailwind boilerplate: a `useState`-per-
   `mousemove` div, positioned with `left`/`top`, filled `rgba(56,189,248,0.7)`
   — a blue, a literal, and 70% opaque, which reads as a spotlight rather than
   a glow. KEPT: the behaviour — a soft circular light that shrinks a little
   while the pointer is moving and relaxes back to its resting size 150ms after
   it stops. That is a genuine, deliberate detail and there is no reason to
   drop it. CHANGED: the colour is `--primary` (`--kw-mango`) through
   `color-mix`, never a literal; the opacity is a fraction of the reference's,
   so this reads as an ambient lift and not a disc; the sizes are rem, per this
   kit's own "no px" convention (`RAIL_WIDTH`, `ASIDE_WIDTH` in
   `screen-shell.tsx`); and the two motion pieces are split by FREQUENCY rather
   than both running through `setState` — see the next note.

   WHY POSITION IS A REF AND SIZE IS STATE — TWO DIFFERENT KINDS OF MOTION
   Position changes on every `mousemove`, which can fire hundreds of times a
   second; routing that through `useState` would re-render this component (and
   let React diff its subtree) that often, for a layer with nothing else to
   reconcile. It is written straight to the glow's own `transform` through a
   ref instead — no React render in the loop at all. Size changes twice per
   pointer gesture — true on the first move, false 150ms after the last one —
   which is a handful of renders per interaction, not per pixel, so `useState`
   for it is not a shortcut taken for convenience, it is the honest cost of a
   value that genuinely changes rarely.

   `transform: translate3d`, NOT `left`/`top`. `left`/`top` are layout
   properties — the browser has to reflow before it can paint them — and this
   value changes as often as the pointer does. `translate3d` is composited: the
   position update never touches layout. `position: fixed` is what makes the
   arithmetic for that translate trivial: `event.clientX`/`clientY` ARE the
   coordinate space a `fixed` box is positioned in, with no bounding rect to
   read and no scroll offset to subtract on every event — the one operation
   left is centring the box on the point, `translate(-50%, -50%)`.

   WHY `position: fixed` DOES NOT ESCAPE THE GROUND'S STACKING ORDER. A
   `fixed` element's CONTAINING BLOCK (what its geometry is computed against)
   is the viewport; that is a layout fact, and a different fact from which
   STACKING CONTEXT paints it. Stacking is a tree property: this component's
   own wrapper carries `-z-10` inside `ScreenShell`'s `relative isolate` SCREEN
   (see that file's `SCREEN` and `CARD` comments), so the glow paints in that
   context's most-negative slot no matter what its own `position` is — the
   same guarantee `AmbientBackground` already relies on for the same slot,
   copied rather than reinvented. See `screen-shell.tsx` for where this mounts
   and the proof that it never reaches the card, the rail or the aside.

   COLOUR AND OPACITY — MEASURED AGAINST THE KIT'S OWN IDIOM, NOT INVENTED
   `AmbientBackground`'s `brand` variant washes `--primary` to 18% with
   `color-mix` for a field that covers most of a screen; this flourish is a
   few rem across and needs a little more presence to read as a light source
   at all, so it sits at 20% at its own centre, easing to fully transparent by
   70% of its own radius — the same falloff shape the reference chose, just far
   softer. ON THE MANGO SPINE THIS IS CORRECTLY INVISIBLE — mango glow on a
   mango ground has nothing to contrast against, and the client said so herself
   before this was built: "yes i am aware it will be invisible if mango ground
   - its ok." No spine gets a different colour to compensate; a variant here
   would be solving a problem she already declined to have solved.

   REDUCED MOTION — THE KIT'S OWN PATTERN, NOT A NEW ONE
   This is a continuously-moving, purely decorative effect with no status to
   report, so `AmbientBackground`'s own rule applies verbatim: "off entirely
   under reduced motion" (motion.css §17). `motion-reduce:hidden` is the same
   Tailwind variant `skeleton.tsx`, `donut.tsx`, `radar.tsx` and
   `run-steps.tsx` already use for exactly this kind of on/off decorative call
   — no new mechanism, and no `window.matchMedia` in this file: the media
   query is live in CSS, so a setting changed mid-session is honoured on the
   very next paint with nothing to listen for. The `mousemove` LISTENER keeps
   running underneath the hidden layer regardless — it is one assignment to
   `transform` per event with nothing to clean up early, and gating it on a
   duplicated JS media query would trade a well-understood CSS mechanism for a
   second one, for a saving that would not show up on a profile.

   THE SIZE TRANSITION IS A KIT CLASS, NOT A LOCAL ONE. motion.css law 3: "It
   never writes a duration, a curve... of its own. If a component needs motion
   this file does not have, the fix is a new class here, not a local
   transition." `.motion-cursor-glow` (motion.css §18) is that class; this
   file names no duration and no curve for it.

   TOUCH — NOT SPECIAL-CASED, AND CHECKED RATHER THAN ASSUMED. A `mousemove`
   listener does not fire from touch input on any current mobile browser
   (touch dispatches `touchstart`/`touchmove`/`pointer*` events with
   `pointerType: "touch"`, never a synthetic `mousemove` unless the page asks
   for one) — the effect is simply silent on a touch-only device, which is the
   same "does nothing, costs nothing" outcome the reference already had, and
   this file adds no touch handling in order to preserve it rather than invent
   a fix for a problem that was not observed.

   WHERE THIS RENDERS. Only inside the authenticated shell, mounted once at
   `ScreenShell`'s ground level — never on marketing or sign-in screens, none
   of which render this shell at all.

   RENDERING CONTEXT
   `"use client"` — a `mousemove` listener and two hooks. There is no server
   variant: a cursor has no meaning until there is a pointer to read.
   ========================================================================= */

import * as React from "react";

import { cn } from "../../lib/utils";

/** How long the pointer has to sit still before the glow relaxes back to its
 *  resting size. Matches the reference's own value — there was no reason
 *  found to retune it. */
const IDLE_DELAY_MS = 150;

/**
 * A soft mango light that follows the pointer, on the ground behind every
 * real surface.
 *
 * TEN STATES — nine of them genuinely do not apply, for the same reasons
 * `AmbientBackground` states its own nine: this is decoration with no value,
 * no input and no target.
 *
 *  1. default        — a soft circle, centred on the last known pointer
 *                       position, sized to whether the pointer moved in the
 *                       last 150ms.
 *  2. hover           — does not apply. `pointer-events-none`: the layer
 *                       cannot be hovered, or it would eat clicks meant for
 *                       whatever it sits behind.
 *  3. focus-visible   — does not apply. Never focusable, never in the tab
 *                       order.
 *  4. active/pressed  — does not apply.
 *  5. disabled        — does not apply, and is not a prop on this
 *                       component. `motion-reduce:hidden` turns it off; that
 *                       is a MEDIA condition, not a component state.
 *  6. loading         — does not apply. Nothing here fetches.
 *  7. empty           — does not apply. An idle pointer is not an empty
 *                       state; it is the resting size.
 *  8. error           — does not apply, and must not be faked. Decoration
 *                       has no failure to report.
 *  9. selected        — does not apply.
 * 10. read-only       — always. Nothing here can be written to.
 *
 * RTL — safe. The glow is centred on a coordinate, not on a side, so there is
 * nothing to mirror.
 */
const CursorGlow = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => {
    const orbRef = React.useRef<HTMLDivElement>(null);
    const [isMoving, setIsMoving] = React.useState(false);
    const idleTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => {
      const handleMove = (event: MouseEvent) => {
        // Written straight to the DOM — see the file header on why this is a
        // ref and not `setState`.
        const orb = orbRef.current;
        if (orb) {
          orb.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0) translate(-50%, -50%)`;
        }

        setIsMoving(true);
        if (idleTimer.current) clearTimeout(idleTimer.current);
        idleTimer.current = setTimeout(() => setIsMoving(false), IDLE_DELAY_MS);
      };

      window.addEventListener("mousemove", handleMove);
      return () => {
        window.removeEventListener("mousemove", handleMove);
        if (idleTimer.current) clearTimeout(idleTimer.current);
      };
    }, []);

    return (
      <div
        ref={ref}
        data-slot="cursor-glow"
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 -z-10 overflow-hidden motion-reduce:hidden",
          className,
        )}
        {...props}
      >
        <div
          ref={orbRef}
          data-slot="cursor-glow-orb"
          className={cn(
            "motion-cursor-glow fixed left-0 top-0 rounded-pill",
            // DOUBLED, 2026-09-03 — client ruling, "make it double as big as
            // it currently is". The reference's own 220px / 280px (converted
            // to rem against this kit's 16px reference, ruling 28) read as
            // 13.75rem / 17.5rem and were too small to register as a light
            // source on a full-width ground; 27.5rem / 35rem is exactly twice
            // each, kept as a doubling rather than re-derived so the
            // moving-vs-idle ratio the reference chose survives intact.
            isMoving ? "size-[27.5rem]" : "size-[35rem]",
          )}
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--primary) 20%, transparent) 0%, transparent 70%)",
          }}
        />
      </div>
    );
  },
);

CursorGlow.displayName = "CursorGlow";

export { CursorGlow };
