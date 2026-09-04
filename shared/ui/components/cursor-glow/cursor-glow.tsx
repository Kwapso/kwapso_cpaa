"use client";

/* ============================================================================
   CursorGlow — the one pointer-following flourish in the system
   (1 direct call site: `ScreenShell`'s ground).

   THIS IS A RESTORATION, NOT A RETUNE, 2026-09-04. The client looked at the
   single-gradient build twice and said "still not happy with how it is," and
   asked again whether the original exists in the repo. It does: `AmbientBackground`,
   in the SIBLING app repo (kwapso_system), recovered from commit
   `c2b963d13ced0aec487ed2375fff041b53483aed` —
   `shared/ui/registry/primitives/ambient-background/ambient-background.tsx`
   (the motion) and `web/app/globals.css` (the visual, `.ambient::before` /
   `.ambient::after`). Both files were read directly with `git show <sha>:<path>`
   before anything below was written. It is materially richer than the fresh
   build this replaces, which is almost certainly why the fresh build read
   wrong: one flat circle where the original was two independently drifting,
   heavily blurred fields that also chase the pointer and bloom on click.

   WHAT CARRIES OVER FROM THE PRIOR BUILD, UNCHANGED, BECAUSE IT WAS ALREADY
   RIGHT — kit rules, not taste:
     · `--primary` through `color-mix`, never a literal (RULES §2.2, §2.5).
     · The wrapper is `pointer-events-none absolute inset-0 -z-10
       overflow-hidden` inside `ScreenShell`'s `relative isolate` ground.
       That negative z-index is load-bearing — CSS2.1 §E.2 paints it in its
       stacking context's most-negative slot regardless of its own
       `position`, which is what keeps it behind the rail, the card and the
       aside no matter how the visual inside it changes. Left untouched;
       `screen-shell.tsx` is another agent's file this session and is not
       read or edited here.
     · Reduced motion is a bail-out, not a hide. See REDUCED MOTION below.
     · No touch handling. A `pointermove`/`pointerdown` listener still does
       not fire from touch input as a synthetic event on any current mobile
       browser, so this is silent on a touch-only device for the same reason
       the previous `mousemove` build was — nothing to add.
     · On the mango spine this is correctly invisible — mango glow on a
       mango ground has nothing to contrast against. The client has already
       said so herself; no variant exists to compensate.

   WHAT CAME BACK FROM THE ORIGINAL THAT THE FLAT BUILD DID NOT HAVE
   ---------------------------------------------------------------------------
   1 · A requestAnimationFrame LERP, not a CSS transition, for position.
       `x += (targetX - x) * POSITION_LERP` every frame. A transition
       restarting on every `pointermove` resets its own eased velocity to
       zero at the start of each new leg; a lerp's "distance remaining" is
       continuous state that survives across events, which is the difference
       between an approximation of trailing motion and the real thing. The
       CSS transition this replaces (`.motion-cursor-glow`, motion.css §18)
       is removed — see that section for the full account of why the
       reasoning that added it in the first place, while not wrong, wasn't
       the strongest available answer.
   2 · POSITION AS A PERCENTAGE, not a pixel. `--mx` / `--my` are written as
       percentages of this component's OWN box, read via
       `getBoundingClientRect` on every `pointermove` — not, as the
       original had it, of `window.innerWidth`/`innerHeight`. The original
       was mounted once at its app's root as a `fixed`, full-viewport layer,
       so "percentage of the viewport" and "percentage of its own box" were
       the same number. This component is mounted per-screen inside
       `ScreenShell`'s ground, which does not always span the full viewport
       (a rail and an aside can sit beside it) and — per the point above —
       must stay `absolute`, not `fixed`, to keep its `-z-10` meaningful
       inside that ground's own stacking context. Reading the percentage
       against its own box is the adaptation that preserves "percentage, not
       pixel" while keeping the geometry honest for the box it actually
       fills; a percentage of the viewport would drift out of alignment with
       the cursor the moment a rail or aside changed the ground's width.
   3 · BLOOM. `bloomRef` grows while the pointer moves (`+= BLOOM_GROWTH`
       per event, capped at 1), spikes to 1 on `pointerdown`, and decays
       every frame (`+= (0 - bloom) * BLOOM_DECAY`) — so the field visibly
       responds to a click and settles once the pointer stops. ONE THING IS
       CORRECTED, not just copied: in the recovered source, `--bloom` is
       written to the DOM every frame but never read by any rule in
       `globals.css` — a real value with no consumer, presumably meant for
       the "glass surfaces" its own doc comment mentions and never wired up.
       Reproducing that verbatim would restore a dead variable, not a
       behaviour, so bloom is connected here to the one place it can affect
       *this* component honestly: the pointer-tracking gradient's own
       strength, `calc(BLOOM_BASE% + var(--bloom) * BLOOM_RANGE%)`. Logged
       here rather than left silent, per RULES §11.1.
   4 · `pointermove` / `pointerdown`, not `mousemove`. Pointer events are the
       original's own choice and are a strict superset of mouse input, so
       nothing observed on mouse-only testing regresses.
   5 · THE VISUAL IS TWO LAYERS OF BLURRED RADIAL GRADIENT, not one flat
       circle: a pointer-tracking 42rem field plus a static 36rem field in
       one layer, and a third, 30rem, independent field in a second layer —
       `42rem`/`36rem`/`30rem` at `filter: blur(72px) saturate(112%)` /
       `blur(84px)` in the original, converted to rem here (`4.5rem` /
       `5.25rem`) because RULES §1.1 forbids a `px` literal in this file; the
       heavy blur is what reads as ambient light rather than a disc, and
       `inset: -25%` on each layer keeps that blur from clipping at its own
       edge before the wrapper's `overflow-hidden` crops it at the ground's
       true boundary.
   6 · A SLOW, INDEPENDENT DRIFT so the field is alive even when the pointer
       is still — two periods (not one, so the field never visibly loops),
       now `.motion-cursor-glow-drift-a` / `-b` in motion.css §18, per this
       kit's own law that a duration or a curve is never written in a
       component (RULES §6.1).
   7 · ITS OWN DARK-MODE VARIANT. `--kw-mango` is the identical #FED069 in
       both palettes (tokens.css §2 — brand colours are not themed), so
       without a dark-specific adjustment the glow would carry more contrast
       against charcoal than it ever does against off-beige. Implemented as
       CSS in motion.css §18, with a note there on why a colour rule sits in
       the motion file rather than `tokens.css` (RULES §8.2's usual home for
       one) — an ownership boundary of this delivery, not a design choice.
   8 · REDUCED MOTION AS A BAIL-OUT BEFORE ANY LISTENER IS ATTACHED, not a
       `motion-reduce:hidden` class hiding a loop that keeps running
       underneath it. The flat build this replaces argued for exactly that
       trade-off ("gating it on a duplicated JS media query would trade a
       well-understood CSS mechanism for a second one, for a saving that
       would not show up on a profile") — correct when the only running code
       was one assignment per `mousemove`, wrong once that code became a
       `requestAnimationFrame` loop with two listeners: a rAF loop should not
       run at all for someone who asked for less motion, profile or no
       profile. See REDUCED MOTION below for the full mechanism, including
       the one gap this still leaves open.

   WHY POSITION AND BLOOM ARE REFS, NEVER `useState`
   Both change on every `pointermove`, which can fire hundreds of times a
   second, and both are read back every animation frame besides. Routing
   either through `useState` would re-render this component, and let React
   diff a subtree with nothing else in it, at that frequency. Both are
   written straight to CSS custom properties on the field's own DOM node
   instead — `--mx`, `--my`, `--bloom` — which the two gradient layers below
   read directly through inheritance. No React render sits anywhere in the
   interaction loop; the previous build's `isMoving` state (and the 150ms
   timer that flipped it) is gone along with the single-circle visual it
   sized, superseded by `--bloom`'s continuous decay, which reports the same
   "is anything happening" fact without a state flip or a re-render.

   REDUCED MOTION
   Checked once, synchronously, at the top of the effect — before either
   `window.addEventListener` call and before the first
   `requestAnimationFrame` — so a reader who has asked for less motion never
   causes this component to add a listener or start a loop at all. The one
   gap this leaves, inherited from the recovered source and not solved here:
   a `matchMedia` check made once at mount does not notice the setting
   changing live during the session, the way a bare CSS media query would.
   Motion.css's own reduced-motion block (§19) closes that gap independently
   at the CSS layer — `.motion-cursor-glow-drift-a` / `-b` stop turning the
   moment the media query flips, live, with nothing to listen for — so a
   session-long toggle still silences the one thing that can be silenced
   without a listener (the drift) even though it cannot retroactively
   un-start a loop that was already running. `AmbientBackground` (this kit's
   own, unrelated component of the same name from the ORIGINAL commission —
   see that file) already made this exact trade for the same reason.

   THE SIZE TRANSITION IS GONE, NOT MOVED. The flat build's `isMoving ?
   "size-[27.5rem]" : "size-[35rem]"` toggle is superseded, not renamed:
   there is no longer a moving/idle size pair, because `--bloom`'s continuous
   growth-and-decay is a strictly richer version of the same "is the pointer
   doing something" signal, applied to gradient strength instead of a
   discrete box size. `motion.css` carries no size-transition class for this
   component any more; see that file's §18 for the full account.

   ROUGHLY DOUBLE THE FIRST VERSION'S SIZE — client want, restated for the
   record. The flat build's own comment already doubled once, from 220px /
   280px (13.75rem / 17.5rem, the untouched reference) to 27.5rem / 35rem.
   The radii restored here — 42rem, 36rem, 30rem, each additionally
   softened by a 4.5–5.25rem blur — read considerably larger again than that
   doubled pair without any further arithmetic; the original's own sizes
   already clear the bar.

   WHERE THIS RENDERS. Only inside the authenticated shell, mounted once at
   `ScreenShell`'s ground level — never on marketing or sign-in screens, none
   of which render this shell at all.

   RENDERING CONTEXT
   `"use client"` — pointer listeners, a `requestAnimationFrame` loop, and a
   ref. There is no server variant: a cursor has no meaning until there is a
   pointer to read.
   ========================================================================= */

import * as React from "react";

import { cn } from "../../lib/utils";

/* JS PHYSICS, NOT CSS TIMING — deliberately kept here rather than in
   motion.css. motion.css §18 states the law this obeys: "every duration and
   every curve is a var()." A lerp factor is neither: it is a per-frame
   convergence RATE (what fraction of the remaining distance to close this
   frame), which only means anything inside the loop that applies it every
   frame, has no unit a stylesheet can express, and produces no fixed
   duration at all — the time to arrive depends on how far the last pointer
   jump was. There is no CSS property this could be handed to. */
const POSITION_LERP = 0.05; // 5% of the remaining distance to the pointer, per frame
const BLOOM_GROWTH = 0.05; // per `pointermove`, while the pointer is moving
const BLOOM_DECAY = 0.03; // per frame, pulling back to rest once it stops
const BLOOM_MAX = 1;
const BLOOM_SPIKE = 1; // on `pointerdown`

/* The pointer-tracking gradient's own strength as `--bloom` moves 0 → 1.
   Percentages, matching this file's other `color-mix` stops — see point 3
   in the header for why `--bloom` is connected here at all. */
const BLOOM_BASE_PERCENT = 62;
const BLOOM_RANGE_PERCENT = 18;

/** Default position before the first `pointermove` arrives, and the value a
 *  reduced-motion session (which never writes to these at all) is left at:
 *  a little above and left of centre, matching the recovered source's own
 *  resting point rather than dead centre. */
const DEFAULT_MX = "50%";
const DEFAULT_MY = "38%";

/**
 * A soft mango light that follows the pointer, drifts on its own while the
 * pointer is still, and blooms toward pointer interaction — on the ground
 * behind every real surface.
 *
 * TEN STATES — nine of them genuinely do not apply, for the same reasons
 * `AmbientBackground` states its own nine: this is decoration with no value,
 * no input and no target.
 *
 *  1. default        — two blurred, drifting fields of mango light; the
 *                       nearer one eases toward the last pointer position
 *                       and strengthens toward a click, relaxing once the
 *                       pointer stops.
 *  2. hover           — does not apply. `pointer-events-none`: the layer
 *                       cannot be hovered, or it would eat clicks meant for
 *                       whatever it sits behind.
 *  3. focus-visible   — does not apply. Never focusable, never in the tab
 *                       order.
 *  4. active/pressed  — does not apply. `pointerdown` spikes `--bloom`, but
 *                       that is a continuous decoration value, not a
 *                       pressed STATE this component holds.
 *  5. disabled        — does not apply, and is not a prop on this
 *                       component. Reduced motion turns it into a still
 *                       field; that is a MEDIA condition, not a component
 *                       state.
 *  6. loading         — does not apply. Nothing here fetches.
 *  7. empty           — does not apply. An idle pointer is not an empty
 *                       state; it is the resting field.
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
    const fieldRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
      const field = fieldRef.current;
      if (!field) return;

      // REDUCED MOTION — the bail-out. Checked once, before either listener
      // and before the loop starts, so neither exists at all for a reader
      // who asked for less motion. See the file header for the one gap this
      // leaves (a live toggle mid-session) and how motion.css §19 covers it
      // independently at the CSS layer.
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      let targetX = 50;
      let targetY = 38;
      let x = targetX;
      let y = targetY;
      let bloom = 0;
      let raf = 0;

      const onMove = (event: PointerEvent) => {
        // Percentage of THIS component's own box — see header point 2 on
        // why that is not the same as the original's percentage of the
        // viewport, and why it has to be measured fresh on every event
        // rather than cached (the ground can resize under a rail/aside
        // toggle without this component re-mounting).
        const rect = field.getBoundingClientRect();
        if (rect.width) targetX = ((event.clientX - rect.left) / rect.width) * 100;
        if (rect.height) targetY = ((event.clientY - rect.top) / rect.height) * 100;
        bloom = Math.min(BLOOM_MAX, bloom + BLOOM_GROWTH);
      };

      const onDown = () => {
        bloom = BLOOM_SPIKE;
      };

      const tick = () => {
        x += (targetX - x) * POSITION_LERP;
        y += (targetY - y) * POSITION_LERP;
        bloom += (0 - bloom) * BLOOM_DECAY;

        // Written straight to the DOM — see the file header on why this is
        // a ref-driven custom property and not `setState`.
        field.style.setProperty("--mx", `${x.toFixed(2)}%`);
        field.style.setProperty("--my", `${y.toFixed(2)}%`);
        field.style.setProperty("--bloom", bloom.toFixed(3));

        raf = requestAnimationFrame(tick);
      };

      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
      raf = requestAnimationFrame(tick);

      return () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerdown", onDown);
        cancelAnimationFrame(raf);
      };
    }, []);

    return (
      <div
        ref={ref}
        data-slot="cursor-glow"
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 -z-10 overflow-hidden",
          className,
        )}
        {...props}
      >
        <div
          ref={fieldRef}
          data-slot="cursor-glow-field"
          // Tailwind's arbitrary-property scanner reads this FILE'S TEXT, not
          // the string it evaluates to — a class built by interpolating
          // `DEFAULT_MX` into a template literal never appears as its own
          // contiguous token in source, so the class would silently fail to
          // compile. The three defaults are therefore written as the literal
          // strings `DEFAULT_MX` / `DEFAULT_MY` hold, same convention
          // `AmbientBackground` uses for `[--ambient-1:var(--accent)]`.
          className="[--mx:50%] [--my:38%] [--bloom:0] absolute inset-0"
        >
          {/* LAYER A — the pointer-tracking field plus the first static
             field, sharing one drift so the two move as a single mass, the
             same grouping the recovered `.ambient::before` used. */}
          <div
            data-slot="cursor-glow-layer-a"
            className="motion-cursor-glow-drift-a absolute inset-[-25%]"
            style={{
              background: [
                `radial-gradient(42rem 42rem at calc(var(--mx, ${DEFAULT_MX}) * 0.55 + 22%) calc(var(--my, ${DEFAULT_MY}) * 0.55 + 12%), color-mix(in srgb, var(--primary) calc(${BLOOM_BASE_PERCENT}% + var(--bloom, 0) * ${BLOOM_RANGE_PERCENT}%), transparent) 0%, transparent 62%)`,
                "radial-gradient(36rem 36rem at 82% 78%, color-mix(in srgb, var(--primary) 46%, transparent) 0%, transparent 66%)",
              ].join(", "),
              filter: "blur(4.5rem) saturate(112%)",
            }}
          />
          {/* LAYER B — the third, independent field, on its own slower
             drift so the whole composition never repeats on one visible
             period. */}
          <div
            data-slot="cursor-glow-layer-b"
            className="motion-cursor-glow-drift-b absolute inset-[-25%]"
            style={{
              background:
                "radial-gradient(30rem 30rem at 16% 88%, color-mix(in srgb, var(--primary) 40%, transparent) 0%, transparent 64%)",
              filter: "blur(5.25rem)",
            }}
          />
        </div>
      </div>
    );
  },
);

CursorGlow.displayName = "CursorGlow";

export { CursorGlow };
