"use client";

/* ============================================================================
   SplashScreen — composition 27.45, "Splash · Cold start only · mode-aware ·
   rulings 09 and 22".

   COMPOSED, NOT DRAWN
     · SignInSplash — `compositions/shapes/sign-in.tsx`. It already draws
       27.45: the mark centred on the brand field, at window height, with
       nothing else on it. This file adds no fill, no radius and no class, and
       as of 2026-08-24 it adds no type either — see below.

   WHY THIS FILE EXISTED AT ALL, AND WHAT IS LEFT OF THAT REASON
   It was built to add ONE thing, a type: `SignInSplash.mark` was optional and
   the shape's own state 7 said what that cost, verbatim from its header at
   the time — "no mark passed: the brand field alone, at full window height.
   NOT a passing state … the field alone is an unlabelled colour … A route
   must pass `mark`. `screens/splash.tsx` makes it a required prop so the
   compiler says so." This is that file, and it did that job.

   THE HOLE IS NOW CLOSED AT THE SOURCE. On 2026-08-24 the shape got a real
   default, because the artwork it needed finally reached the components that
   draw it. A required prop here would no longer be a guard; it would be every
   route repeating a default that already exists one level down. So `mark`
   became optional and the guarantee is unchanged: the field is never drawn
   unlabelled unless a route asks for that in words with `mark={null}`.

   WHAT THIS FILE STILL ADDS is the whole of the rest of this header — 27.45's
   quotations, ruling 09's two doors, ruling 22's before-the-first-frame
   palette, and the "cold start only" rule no component can enforce. That was
   always the more useful half.

   DESIGN SOURCE — KWAPSO-SPEC.md, composition 27.45.

     27.45's opening, verbatim:
       "The screen between pressing the icon and the app being ready. Rulings
        09 and 22 already settled its colour and its mark — mango in light,
        unlit charcoal in dark, the isotype centred — so all that was missing
        was the screen itself and the rule about when it may appear."

     "Cold start only", verbatim:
       "It appears once, while the app is being started from nothing. Never
        between two in-app screens, never on a route change, never after a
        save — that waiting is chapter 27.6's job."

     "The mark, and nothing else", verbatim:
       "The isotype centred on the brand field. No wordmark, no tagline, no
        version number, no spinner and no progress bar: if the wait is long
        enough to need one, the loading composition takes over."

     "Mode-aware, decided before paint", verbatim:
       "Mango in light, unlit #141310 in dark, chosen from the stored theme
        before the first frame so the splash never flashes the wrong palette
        (ruling 22)."

     "It hands over, it does not fade out", verbatim:
       "The splash is replaced by the destination screen with its frame
        already drawn. No cross-fade, no zoom of the mark — the brand does not
        perform for its own start-up."

     "Doors differ", verbatim:
       "The portal splash is the same screen with the mango field and the
        client-portal icon (ruling 09); the agency app takes the charcoal icon
        and the same unlit field in dark."

     Ruling 09, verbatim: "Mango tile with the charcoal isotype for the client
       portal; charcoal tile with the mango isotype for the agency app. The
       browser and manifest theme colour follows the icon, so a pinned tab
       reads as the right door."

     Ruling 22, in the appendix's own summary of 19–23, verbatim: "The mango
       field applies everywhere. Tab colour follows the app icon. The splash is
       mode-aware — mango in light, unlit in dark."

     The narrow render's own caption, verbatim:
       "Narrow: identical, and it is the same asset"

     And the render's own note, verbatim:
       "Nothing else on it — no name, no spinner, no version"

   THE ONE EXCEPTION TO "NOTHING IS CENTRED"
   Every other kwapso surface ranges left, and 27.16 calls a centred auth card
   "the most common way this brand gets misdrawn". 27.45 is the exception and
   it is the artifact's own: "the isotype centred". The centring is done by
   `SignInSplash`'s `place-content-center` and is direction-neutral, so it is
   not an alignment decision this file makes — it is the one the chapter makes.

   THE LAW THIS FILE OBEYS
   · THE MARK CANNOT BE ABSENT — AND IT IS NO LONGER A REQUIRED PROP, CHANGED
     2026-08-24. It was `mark: React.ReactNode`, deliberately with no `?`, and
     the reason was written down: the shape left it optional, no artwork
     shipped, and a route that forgot it drew an unlabelled colour at window
     height, which is not a screen. The compiler was standing in for artwork
     that did not exist. It exists now, `SignInSplash` defaults it, and the
     hole this prop was guarding is closed at the source — so requiring it
     here would only force every route to repeat the shape's own default.
     The GUARANTEE is unchanged and is what mattered: the field is never
     drawn unlabelled unless a route passes `mark={null}` in words.
   · WHICH ARTWORK IS THE CONTESTED PART. ch27.45 says "no wordmark"; the
     client on 2026-08-24 asked every signed-out screen for "the one with the
     name on it". The shape carries both quotations and follows the client.
     Read `compositions/shapes/sign-in.tsx`'s header before changing it.
   · NOTHING ELSE IS ON IT. This file renders no wordmark, no tagline, no
     version, no spinner, no progress bar and no text. The only string it
     carries is `label`, which is what a screen reader hears and what nobody
     sees.
   · DARK IS A PROP HERE, AND ONLY HERE. Everywhere else in this system dark is
     a token flip and a literal colour is the bug. On the splash it cannot be:
     ruling 22 requires the palette to be "chosen from the stored theme before
     the first frame", which is a decision the boot script takes before any
     stylesheet has resolved a media query. `field` carries it. Both values are
     still tokens — `brand` is `--surface-brand`, `unlit` is `--background`,
     which resolves to `--kw-unlit-page` (#141310) in the dark palette. No hex
     is written in this file or in the shape.
   · NO ANIMATION. It hands over; it does not fade. Nothing here imports
     `motion/` and nothing sets a transition.
   · IT IS THE WINDOW. `min-h-dvh`, from the shape. Verified as a bare mount.

   WHAT THIS COMPONENT CANNOT ENFORCE, AND WHO MUST
   "Cold start only" is a rule about WHEN, and no component can hold it. The
   route that mounts this screen must guarantee it is a cold start; a splash on
   a route change is 27.6's loading composition wearing the wrong screen. Said
   here because it is the chapter's first rule and the easiest one to break.

   RENDERING CONTEXT
   `"use client"` to match the shape it composes. This file itself holds no
   hook, no handler and no browser API.
   ========================================================================= */

import * as React from "react";

import {
  SignInSplash,
  type SignInSplashProps,
  type SplashField,
} from "../templates/sign-in";

export type { SplashField };

export interface SplashScreenProps extends Omit<SignInSplashProps, "mark"> {
  /**
   * The brand artwork, centred on the field.
   *
   * OPTIONAL as of 2026-08-24, and it used to be required. Left unset it
   * takes `SignInSplash`'s default — `Logotype` at `size="splash"`, with the
   * cut following `field`: the black cut on mango, the reversed cut on unlit,
   * which is ruling 09's "mango tile with the charcoal isotype … charcoal
   * tile with the mango isotype" reached without either door naming a file.
   *
   * `null` draws an empty field, and is the only way to reach it.
   */
  mark?: React.ReactNode;
  /**
   * Which field to paint, read from the STORED theme before the first frame
   * (ruling 22) — not from a media query, and not from the class on `<html>`,
   * because both resolve too late to stop a wrong-palette flash.
   *
   * `"brand"` is mango, the light palette's field. `"unlit"` is `--background`,
   * which is #141310 in the dark palette. Left unset it is `"brand"`, the
   * shape's own default and the light-mode answer for both doors.
   */
  field?: SplashField;
}

/**
 * The screen between pressing the icon and the app being ready.
 *
 * TEN STATES — this screen has exactly one, and the other nine are named so
 * the omissions are decisions rather than gaps. They are the shape's, and
 * they are restated here because this is the file a route imports.
 *  1. default        — the isotype centred on the field. Nothing else.
 *  2. hover          — does not apply. Nothing here is a control.
 *  3. focus-visible  — does not apply. Nothing here is focusable, so nothing
 *                      can take tokens.css §8's ring. The screen is
 *                      `role="status"` and is read, not operated.
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply.
 *  6. loading        — THIS SCREEN IS THE LOADING STATE, and 27.45 forbids it
 *                      drawing a second one: "no spinner and no progress bar".
 *                      A wait long enough to need one is 27.6's screen.
 *  7. empty          — CANNOT OCCUR BY ACCIDENT, which was the whole point of
 *                      this file and is now true one level down as well: the
 *                      shape defaults the mark, so an unlabelled field needs a
 *                      route to pass `mark={null}` on purpose. Until
 *                      2026-08-24 this guarantee was bought with a required
 *                      prop, because there was no artwork to default to.
 *  8. error          — does not apply. A start-up that fails lands on ruling
 *                      06's full error card, which is a different screen. The
 *                      splash never says a word about a failure.
 *  9. selected       — does not apply.
 * 10. read-only      — does not apply.
 *
 * THREE BREAKPOINTS
 *  · 380 — IDENTICAL, and the artifact says so in its own caption: "Narrow:
 *    identical, and it is the same asset". Not "unchanged by omission" — the
 *    chapter states it. One centred mark on a full field is the same object at
 *    every width: there is no layout to reflow, no column to collapse and no
 *    second element to drop, and the mark is the same asset rather than a
 *    small variant of it. The field is `min-h-dvh`, so at 380 it is still the
 *    whole window and not a band.
 *  · tablet — the same.
 *  · desktop — the same.
 *
 * RTL — LTR only by client ruling, and centring is direction-neutral anyway.
 */
function SplashScreen({ mark, field = "brand", ...props }: SplashScreenProps) {
  return (
    <SignInSplash data-slot="screen-splash" mark={mark} field={field} {...props} />
  );
}

SplashScreen.displayName = "SplashScreen";

export { SplashScreen };
