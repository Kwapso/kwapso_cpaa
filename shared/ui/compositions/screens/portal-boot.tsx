"use client";

/* ============================================================================
   PortalIndexRoute — `/` in the client portal: the boot screen, and the one
   route in this batch that is not a destination.

   WHY THIS FILE IS NOT CALLED `index.tsx`
   The commission asks for the `/` route at `index` AND for the folder's
   barrel at `compositions/portal/index.ts`. Those two cannot both exist:
   `./index` from inside the barrel resolves to the barrel itself (TS2303,
   "Circular definition of import alias"), and naming the file explicitly as
   `./index.tsx` is TS5097 unless `allowImportingTsExtensions` is switched on
   for the whole project. Both were tried before this file was renamed. The
   BARREL keeps the commissioned name because that is the name every consumer
   imports; the route takes `root.tsx`, and the exported component is still
   `PortalIndexRoute`. Logged as SYS2-7 in GAPS-SYSTEM2.md, with the one-line
   alternative if the collision should be resolved the other way.

   WHAT THIS ROUTE IS
   `/` in the portal decides where the client actually goes: `/home` when the
   session is good, `/login` when it is not. It has no content of its own, and
   the screen it shows while it decides is ch27.45's splash — the one
   composition the kit draws for exactly this moment.

   THE SHAPES
   `SignInSplash` (part of shape 7) while it boots, and `ShapeStateBody`
   (shape 12) when the boot fails. Nothing else: there is no third state,
   because a decided boot has navigated away and this component is unmounted.

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" chapter 27.45 (splash).

     ch27.45, verbatim: "The isotype centred on the brand field. No wordmark,
       no tagline, no version number, no spinner and no progress bar: if the
       wait is long enough to need one, the loading composition takes over."

   THE ONE PLACE THE CLIENT AND THE ARTIFACT COLLIDE, AND IT IS THIS SCREEN
   Both sides, because this may not be settled silently:

     ch27.45, verbatim: "The isotype centred on the brand field. NO WORDMARK,
       no tagline, no version number."

     the client, 2026-08-24, verbatim: "in the outside screens (sign in, link,
       etc) i want the isotype + logotype version, THE ONE WITH THE NAME ON
       IT".

   The splash is a screen a client meets before they are signed in, so it is
   one of the "etc", and the two instructions say opposite things about the
   wordmark on exactly this screen and nowhere else. THE CLIENT WINS — a
   client ruling beats the artifact, which is the standing rule here — so the
   splash this route mounts now draws the LOCKUP and not the glyph alone.

   IT IS ONE PROP TO PUT BACK. `mark={<Isotype size="splash" on="brand" />}`
   on the `SignInSplash` below restores 27.45 exactly, with nothing else
   changed. Registered rather than absorbed, so whoever reads 27.45 next and
   finds the screen disagreeing with it knows it was decided and by whom.

     ch27.45 on when, verbatim: "It appears once, while the app is being
       started from nothing. Never between two in-app screens, never on a
       route change, never after a save — that waiting is chapter 27.6's job."

     ruling 22, verbatim in the shape: mango in light, the unlit page tone in
       dark, "chosen from the stored theme before the first frame so the
       splash never flashes the wrong palette" — which is why `field` is a
       prop the boot script sets and not a media query.

   WHAT NO SHAPE OFFERED
   None of the twelve draws a REDIRECT. `ShapeStateBody` is the register for a
   failed boot and the splash is the register for a running one, so the route
   is assembled from those two rather than inventing a thirteenth. What is
   missing is a ruling on how long the splash may hold before 27.6's loading
   composition takes over; the kit states the handover but not the threshold.
   Logged as SYS2-6 in GAPS-SYSTEM2.md.

   THE LAW THIS FILE OBEYS
   · THE SPLASH DRAWS NO SECOND LOADING STATE (ch27.45). No spinner, no bar,
     no percentage, and the shape would not draw one if this route asked.
   · A FAILED BOOT IS A SENTENCE AND A RETRY, not a blank brand field: a
     client staring at an orange page with no words does not know whether to
     wait or to write to us.
   · THE FIELD IS THE BOOT SCRIPT'S CHOICE (ruling 22), forwarded, never
     guessed from a media query here.
   · EVERY USER-FACING STRING IS A PROP (PATTERN §7).
   · No fill, no radius, no ring and no type step is written in this file.


   IT IS ON NEITHER OF THE TWO SCREEN MODELS, AND THAT IS THE CHAPTER'S CALL
   `SHELL.md` has exactly two screens and one test between them: "a main
   screen is in the navbar; a detail screen has breadcrumbs." This route is in neither
   place, and it is not a destination at all — it decides where the client
   goes and shows 27.45's splash while it decides. 27.45 is a cold start on
   the brand field with nothing else on it, which is a WHOLE-WINDOW screen and
   the family `SHELL.md` keeps outside the two. A boot that has decided has
   navigated away and this component is unmounted, so there is never a moment
   where a rail or a body pane would belong.

   So this screen keeps its own shell and is NOT migrated onto `MainScreen` or
   `DetailScreen`. Recorded here rather than left silent, because the next
   reader sweeping for the four levels will otherwise "fix" it.

   RENDERING CONTEXT
   `"use client"`. The retry handler is built during this module's own render.
   ========================================================================= */

import * as React from "react";

import { Button } from "../../components/button/button";
import { SignInSplash } from "../templates";
import { ShapeStateBody } from "../states";
import type { SplashField } from "../templates";
import type { ShapeStateCopy } from "../states";

/** Every user-facing string on this route. */
export interface PortalIndexLabels {
  /** What a screen reader hears while the app starts. The splash draws no words. */
  starting: string;
  /** The retry on a failed boot. */
  retry: string;
}

const DEFAULT_LABELS: PortalIndexLabels = {
  starting: "Starting your portal",
  retry: "Try again",
};

const DEFAULT_COPY: Partial<ShapeStateCopy> = {
  errorTitle: "We can't open your portal right now",
  errorDescription: "Try again, or write to us at the address on your last mail.",
};

export interface PortalIndexRouteProps {
  /**
   * Where the boot is. `booting` draws the splash; `failed` draws the words
   * and the retry. There is no third value: a boot that SUCCEEDED has already
   * navigated to `/home` or `/login` and this component is gone.
   */
  boot?: "booting" | "failed";
  /**
   * The brand artwork on the splash. Left unset it takes `SignInSplash`'s
   * default, which is `Logotype` at `size="splash"` with the cut following
   * `field` — the client's instruction, against ch27.45's "no wordmark". See
   * the collision note in this file's header before changing it.
   */
  mark?: React.ReactNode;
  /** Which field, read from the stored theme before the first frame (ruling 22). */
  field?: SplashField;
  /** Per-locale words for the failure register. */
  copy?: Partial<ShapeStateCopy>;
  /** Per-locale words for the screen. */
  labels?: Partial<PortalIndexLabels>;
  /** Start again. */
  onRetry?: () => void;
}

/**
 * The portal's front door before it knows which screen you want.
 *
 * TEN STATES — two apply and the shapes own both. `booting` is `SignInSplash`,
 * which ch27.45 rules IS the loading state and forbids drawing a second one
 * inside. `failed` is `ShapeStateBody` at `state="error"`, which is ruling
 * 06's register. Hover, focus, pressed, disabled, selected and read-only do
 * not apply: until the retry appears there is nothing on the screen that is a
 * control.
 *
 * THREE BREAKPOINTS — unchanged. One centred mark on a full field is the same
 * object at every width, and the failure register is a single column.
 *
 * RTL — LTR only by client ruling. Centring is direction-neutral.
 */
function PortalIndexRoute({
  boot = "booting",
  mark,
  field = "brand",
  copy,
  labels,
  onRetry,
}: PortalIndexRouteProps) {
  const words: PortalIndexLabels = { ...DEFAULT_LABELS, ...labels };

  if (boot === "failed") {
    return (
      <ShapeStateBody
        shape="portalHome"
        state="error"
        copy={{ ...DEFAULT_COPY, ...copy }}
        action={
          onRetry === undefined ? undefined : (
            <Button variant="secondary" onClick={onRetry}>
              {words.retry}
            </Button>
          )
        }
      />
    );
  }

  return <SignInSplash mark={mark} field={field} label={words.starting} />;
}

PortalIndexRoute.displayName = "PortalIndexRoute";

export { PortalIndexRoute };
