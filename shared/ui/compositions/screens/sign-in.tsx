"use client";

/* ============================================================================
   AuthShell + SignInScreen — composition 27.16, and the one shell the five
   "before you are signed in" screens share.

   DESIGN SOURCE — KWAPSO-SPEC.md, group E and composition 27.16.

     Group E's own header, verbatim:
       "Before you are signed in — Four screens on one shell: photography one
        half, one column of content the other. No eyebrow, no wordmark in a
        corner."

     27.16 on the shell, verbatim:
       "Sign in, link sent, invite and session expired are the same two-panel
        shell — photography left, one column of content right on off-beige,
        with the isotype sitting directly above the title where an eyebrow
        would otherwise go. Only the title and the body change; there is no
        eyebrow on an auth screen and no wordmark in the corner."

     27.16 on alignment, verbatim:
       "Nothing on an auth screen is centred. The title, the field label, the
        helper line and the button label all range left, the same as every
        other kwapso surface. A centred auth card is the most common way this
        brand gets misdrawn."

     27.16 on the one action, verbatim:
       "The single mango button is the one that moves forward. 'Use a password
        instead' is a text link, never a second button, and there is never a
        social sign-in row: the account is the company's, not a Google
        profile's."

     27.16 on failure, verbatim:
       "An unknown address, a rate limit or an expired link is one poppy line
        beneath the field naming what happened and what to do — never a red
        banner across the top, never a dialog."

     27.16 on narrow, verbatim (the render's own caption):
       "Narrow · the image drops, the isotype stays above the title"

     27.16 on the doors, verbatim:
       "The portal takes the mango app icon and the serif line 'Your work, in
        the open.' Everything else — field, button, copy, link expiry — is
        identical, because a client and a builder sign in the same way."

   WHY THE SHELL LIVES IN THIS FILE
   27.16 is the composition that STATES the shell rule, so the shell is
   declared here and 27.17, 27.18 and 27.19 import it. It is built once, in
   one place, exactly as the chapter says.

   WHY IT IS NOT THE `SignIn` SHAPE — the drift, stated
   `compositions/shapes/sign-in.tsx` draws the same two-panel arrangement and
   is correct about it. It cannot serve as the shared shell, and it departs
   from the artifact in two places:
     1. ITS BODY IS FIXED. `SignIn` renders an email form or a six-digit code
        form and takes no body slot, so link sent (27.17), invite (27.18) and
        session expired (27.19) cannot be drawn through it. The artifact says
        all five ARE one shell; the shape's shell is reusable by one of them.
        Logged as T3A-2 — the shape should grow a `children` slot and this
        file's `AuthShell` should then become a call to it.
     2. IT CARRIES TWO ROUTES THE ARTIFACT FORBIDS. A six-digit code step and
        a `providers` row. 27.16 draws neither and rules out the second by
        name. Both come from the commission and from an older chapter 23, and
        the shape defaults the provider row to empty, so nothing ships unless
        a door asks. This file builds 27.16 as the artifact draws it: one
        field, magic link, password behind a text link, no social row, no
        code step. Logged as T3A-3.
   What was taken from the shape unchanged: `min-h-dvh` (see below), the brand
   ambient field, media dropped below the two-column breakpoint.

   THE LAW THIS FILE OBEYS
   · NOTHING IS CENTRED. Every heading, label, line and button ranges to the
     inline start. The shell centres its content column on the BLOCK axis
     only, which is vertical position, not text alignment.
   · ONE MANGO, AND IT MOVES FORWARD. `Continue` is the only filled control.
     "Use a password instead" and "The portal is the same door" are links.
   · NO EYEBROW, NO WORDMARK IN THE CORNER. The shell has no slot for either.
     The lockup above the title is not "a wordmark in the corner" — it is the
     one thing 27.16 puts in that position.
   · A FAILURE IS ONE LINE UNDER THE FIELD. `Field`'s `error`. No banner.
   · THE ARTWORK IS REAL AND BOTH SLOTS ARE FILLED — CORRECTED 2026-08-24.
     This line used to read "NO ARTWORK IS INVENTED: `mark` and `media` are
     props with no default". It was true when it was written and it had stopped
     being true twice over in one day. `mark` defaults to `Logotype`, the
     version with the name on it. `media` defaults to `AuthPhotograph`, the
     phone-on-a-tray picture the client sent for exactly these screens. Both
     stay props, so a door can pass its own or `null`. Nothing is invented:
     every pixel is the client's own file.
   · NO BORDER. The photography panel is a contained box at radius 24 —
     ch14, verbatim: "Photography is inset and contained, corners rounded to
     24 — never a full-bleed background" — and ruling 35: "Photography sits
     under type, never behind it."
   · THE SHELL IS THE WINDOW. `min-h-dvh`, not `min-h-full`: a percentage
     min-height resolves against the parent and computes to 0 under an
     auto-height mount. The unit is the artifact's: 27.19, one of the five
     screens on this shell, "replaces the whole window".

   RENDERING CONTEXT
   `"use client"`. `Field` calls `useId`; the form builds a submit handler.
   ========================================================================= */

import * as React from "react";

import { AmbientBackground } from "../../components/ambient-background/ambient-background";
import { Button } from "../../components/button/button";
import { Field } from "../../components/field/field";
import { Input } from "../../components/input/input";
import {
  Headline,
  Text,
} from "../../components/typography/typography";
import { Logotype } from "../../components/brand/brand";
/* The one picture every screen on this shell draws. Defined beside `SignIn`
   in the shape so the two shells cannot drift onto different photographs;
   this is the only thing this file takes from `../shapes`. */
import { AuthPhotograph } from "../templates/sign-in";
import { cn } from "../../lib/utils";

/* ---------------------------------------------------------------------------
   AuthShell — the two-panel shell all five of group E share.
   ------------------------------------------------------------------------ */

export interface AuthShellProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  /**
   * The brand artwork, sitting directly above the title "where an eyebrow
   * would otherwise go".
   *
   * DEFAULTS TO `Logotype` — the lockup, mark and name together. The client,
   * 2026-08-24, verbatim: "in the outside screens (sign in, link, etc) i want
   * the isotype + logotype version, the one with the name on it". 27.16 calls
   * this slot "the isotype"; a client ruling beats the artifact and both
   * sides are recorded rather than one being dropped.
   *
   * Still a prop: pass another node to override, or `null` to draw nothing.
   */
  mark?: React.ReactNode;
  /**
   * The photograph on the inline start. A contained box at radius 24, dropped
   * entirely below the two-column breakpoint (27.16: "the image drops").
   *
   * DEFAULTS TO `AuthPhotograph` as of 2026-08-24, when the client sent one:
   * "we will replace it later, but so far for the external screens image use
   * the attached (the phone mockup)". It is a placeholder they intend to swap,
   * which is exactly why no screen names a file — replacing
   * `assets/photography/exterior-mockup.png` and rerunning
   * `node assets/build-assets.mjs` changes all six screens at once.
   *
   * Pass a node to override, or `null` for a single column with no picture.
   */
  media?: React.ReactNode;
  /**
   * The serif line a door carries. The portal's is "Your work, in the open."
   * The system door's is the application's. Optional — 27.16's own render
   * draws none, and the line is named only under "Doors differ".
   */
  serifLine?: React.ReactNode;
  /** The screen's title. Ranges left, like everything else here. */
  title?: React.ReactNode;
  /** The one line under the title, when the screen has one. */
  description?: React.ReactNode;
  /** The body: the form, the waiting statement, the invite, the destination. */
  children?: React.ReactNode;
  /** The last block in the column — a door-swap line, a legal line. */
  footer?: React.ReactNode;
}

/**
 * The shell behind sign in, link sent, invite acceptance and session expired.
 *
 * TEN STATES — the shell itself holds none of them; it is a frame, and every
 * register belongs to the body a screen puts inside it. Named so the omission
 * is a decision and not a gap:
 *  1. default        — mark, title, optional line, body, optional footer, on
 *                      off-beige, with the photograph on the inline start
 *                      above the two-column breakpoint.
 *  2. hover          — does not apply. The shell holds no control.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply. A door that may not be used is a
 *                      different screen (27.19), not a dimmed one.
 *  6. loading        — does not apply, deliberately. 27.17 is explicit: "No
 *                      inbox theatre. No animated envelope, no 'waiting…'
 *                      spinner". A screen that is waiting says so in words.
 *  7. empty          — cannot occur. The shell always draws its title and its
 *                      body; a caller passing neither is a bug in the caller,
 *                      not a state of this component, and the compiler is the
 *                      wrong place to catch it because both are nodes.
 *  8. error          — does not apply here. 27.16: an error is "one poppy line
 *                      beneath the field", so it belongs to `Field` inside the
 *                      body. The shell never grows a banner.
 *  9. selected       — does not apply.
 * 10. read-only      — does not apply.
 *
 * THREE BREAKPOINTS
 *  mobile (below 48rem) — ONE COLUMN AND THE PHOTOGRAPH IS GONE, not shrunk:
 *      27.16's narrow render is captioned "the image drops, the isotype stays
 *      above the title". The media panel is not rendered small, it is not
 *      rendered at all, so nothing loads a photograph a phone will not show.
 *      The content column becomes the whole width at the 24 page inset.
 *  tablet (48rem and up) — the second column appears and the photograph with
 *      it, each half the shell.
 *  desktop (64rem and up) — the same two halves; the page inset steps 24 → 32,
 *      which is the width response `Card` already derives from ch05's stated
 *      "24–32px card inset" range.
 *
 * RTL — LTR only by client ruling. Every inset is logical anyway.
 */
function AuthShell({
  className,
  /* The lockup, not the glyph alone. See the prop's own note. */
  mark = <Logotype />,
  /* One picture, every outside screen. See `AuthPhotograph` in ../shapes. */
  media = <AuthPhotograph />,
  serifLine,
  title,
  description,
  children,
  footer,
  ...props
}: AuthShellProps) {
  /* Tested once, read twice — by the grid and by the panel — so the two can
     never disagree about whether there is a photograph. See the class below. */
  const hasMedia = media !== null && media !== undefined;

  return (
    <div
      data-slot="auth-shell"
      className={cn(
        /* The window, not the parent. See the header. */
        "relative grid min-h-dvh w-full min-w-0 bg-background",
        "gap-[var(--space-6)] p-[var(--space-6)]",
        /* ONE COLUMN WHEN THERE IS NO PHOTOGRAPH. This was an unconditional
           `md:grid-cols-2`, the same fault `SignIn` carried: `media={null}`
           removed the panel and left the grid still two columns, so the
           content sat in the first of them with an empty half beside it.
           Four screens reach this frame — sign-in, invite-acceptance,
           link-sent and session-expired — so any of them passing `null` drew
           it. The inset above is why this half was less visible than
           `SignIn`'s: the words were pinned left but never flush. */
        hasMedia ? "md:grid-cols-2" : null,
        "lg:gap-[var(--space-7)] lg:p-[var(--space-7)]",
        className,
      )}
      {...props}
    >
      {/* Ruling 05 · 06: "The mango ambient field stays, scoped to auth,
          splash and portal home." */}
      <AmbientBackground variant="brand" />

      {/* Photography on the inline start. Contained at radius 24, never
          full-bleed, never behind the type. Absent below `md` — and `hidden`
          rather than unmounted on purpose: the <img> inside is
          `loading="lazy"`, and a lazy image with no layout box is never
          fetched, so a phone downloads none of it. */}
      {!hasMedia ? null : (
        <div
          data-slot="auth-shell-media"
          className="relative hidden min-w-0 overflow-hidden rounded-[var(--radius)] md:block"
        >
          {media}
        </div>
      )}

      {/* One column of content. Centred on the BLOCK axis only — every line
          inside it ranges to the inline start. */}
      <div
        data-slot="auth-shell-content"
        className="relative flex min-w-0 flex-col justify-center"
      >
        <div className="flex w-full min-w-0 max-w-[var(--measure-body)] flex-col gap-[var(--space-6)]">
          {/* `undefined` cannot reach here — the destructuring defaults it —
              so `null` is the way a door says "draw no mark", and it has to
              be tested for or that door gets an empty box in the gap column. */}
          {mark === null || mark === undefined ? null : (
            <span data-slot="auth-shell-mark" className="flex">
              {mark}
            </span>
          )}

          {serifLine === undefined ? null : (
            <Headline as="p" size="h3" serif weight="light">
              {serifLine}
            </Headline>
          )}

          <div className="flex min-w-0 flex-col gap-3">
            {title === undefined ? null : (
              <Headline as="h1" size="h2">
                {title}
              </Headline>
            )}
            {description === undefined ? null : (
              <Text as="p" size="sm" tone="secondary">
                {description}
              </Text>
            )}
          </div>

          {children}

          {footer === undefined ? null : (
            <div data-slot="auth-shell-footer" className="flex min-w-0 flex-col">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

AuthShell.displayName = "AuthShell";

/* ---------------------------------------------------------------------------
   SignInScreen — 27.16.
   ------------------------------------------------------------------------ */

export interface SignInScreenProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title" | "onSubmit"> {
  /**
   * The brand artwork, above the title. Left undefined it takes
   * `AuthShell`'s default, which is `Logotype` — the version with the
   * name on it, per the client's 2026-08-24 instruction. Pass a node to
   * override, or `null` for no mark.
   */
  mark?: React.ReactNode;
  /** The photograph. Dropped below the two-column breakpoint. */
  media?: React.ReactNode;
  /** The door's serif line. The portal's is "Your work, in the open." */
  serifLine?: React.ReactNode;

  /** The title. 27.16 draws "Sign in". */
  title?: React.ReactNode;

  /** The address. Controlled, so 27.17 can say it out loud afterwards. */
  email?: string;
  /** The address changed. */
  onEmailChange?: (value: string) => void;
  /** The field's label. 27.16 draws "Work email". */
  emailLabel?: React.ReactNode;
  /** The field's placeholder. 27.16 draws "name@company.com". */
  emailPlaceholder?: string;
  /**
   * One poppy line beneath the field: an unknown address, a rate limit, an
   * expired link. Never a banner, never a dialog (27.16).
   */
  error?: React.ReactNode;

  /** Press Continue. */
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  /** The one mango. 27.16 draws "Continue". */
  continueLabel?: React.ReactNode;
  /** The link is being sent. */
  submitting?: boolean;
  /** Nothing may be typed or pressed. */
  disabled?: boolean;

  /**
   * What the link does, said before anyone asks. Two strings because the
   * artifact draws two: the desktop sentence and a shorter narrow one.
   */
  helpLine?: React.ReactNode;
  /** The narrow sentence. 27.16's narrow render draws its own, shorter. */
  helpLineNarrow?: React.ReactNode;

  /** "Use a password instead" — a text link, never a second button. */
  onUsePassword?: () => void;
  /** Its label. */
  usePasswordLabel?: React.ReactNode;

  /** The line that sends a client to the other door. */
  portalQuestion?: React.ReactNode;
  /** Its link's label. */
  portalLinkLabel?: React.ReactNode;
  /** Pressing that link. Omitted, the line is not drawn at all. */
  onPortal?: () => void;
}

/**
 * The first screen of either door.
 *
 * TEN STATES
 *  1. default        — isotype, "Sign in", one field, one mango Continue, the
 *                      expiry sentence, the password link, the door line.
 *  2. hover          — owned by `Button` and by `Input`'s hairline token.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by `Button`.
 *  5. disabled       — `disabled` reaches the field and every control, each
 *                      drawing a fill and an ink. Never an opacity.
 *  6. loading        — `submitting`: Continue keeps its mango and grows its
 *                      own ring. There is no screen-level spinner — 27.17
 *                      bans inbox theatre and this is the screen before it.
 *  7. empty          — cannot occur. An auth screen always has its one field,
 *                      its title and its button; there is nothing that can be
 *                      absent. The nearest real case is a door that cannot be
 *                      reached at all, which is a whole-page failure and a
 *                      different composition.
 *  8. error          — `error`: one poppy line under the field, naming what
 *                      happened and what to do. No banner. No dialog.
 *  9. selected       — does not apply.
 * 10. read-only      — does not apply. A door that cannot be typed into is
 *                      `disabled`, which is a different statement.
 *
 * THREE BREAKPOINTS
 *  mobile (below 48rem) — the photograph is dropped and the content column is
 *      the whole screen; the isotype stays above the title, which is exactly
 *      what 27.16's narrow caption asks for. The expiry sentence SWAPS to its
 *      shorter wording ("We will email you a link. It works once, for 15
 *      minutes.") because the artifact draws a second, shorter string on the
 *      narrow render rather than wrapping the long one. Only one of the two is
 *      in the layout at a time — the other is `display: none` and is therefore
 *      not announced twice. Field, button and links keep their full width and
 *      their order.
 *  tablet (48rem and up) — two panels; the long sentence returns.
 *  desktop (64rem and up) — unchanged from tablet apart from the shell's page
 *      inset stepping 24 → 32.
 *
 * RTL — LTR only by client ruling.
 */
function SignInScreen({
  mark,
  media,
  serifLine,
  title = "Sign in",
  email,
  onEmailChange,
  emailLabel = "Work email",
  emailPlaceholder = "name@company.com",
  error,
  onSubmit,
  continueLabel = "Continue",
  submitting = false,
  disabled = false,
  helpLine = "We will email you a link that signs you in. It works once and expires in 15 minutes.",
  helpLineNarrow = "We will email you a link. It works once, for 15 minutes.",
  onUsePassword,
  usePasswordLabel = "Use a password instead",
  portalQuestion = "Client of kwapso?",
  portalLinkLabel = "The portal is the same door",
  onPortal,
  ...props
}: SignInScreenProps) {
  return (
    <AuthShell
      data-slot="screen-sign-in"
      mark={mark}
      media={media}
      serifLine={serifLine}
      title={title}
      footer={
        onPortal === undefined ? undefined : (
          <Text as="p" size="sm" tone="secondary">
            {portalQuestion}{" "}
            <Button type="button" variant="link" disabled={disabled} onClick={onPortal}>
              {portalLinkLabel}
            </Button>
          </Text>
        )
      }
      {...props}
    >
      <form
        data-slot="sign-in-form"
        onSubmit={onSubmit}
        className="flex w-full min-w-0 flex-col gap-[var(--space-5)]"
      >
        <Field label={emailLabel} error={error} disabled={disabled}>
          {(control) => (
            <Input
              {...control}
              type="email"
              name="email"
              autoComplete="email"
              placeholder={emailPlaceholder}
              value={email}
              onChange={
                onEmailChange === undefined
                  ? undefined
                  : (event) => {
                      onEmailChange(event.currentTarget.value);
                    }
              }
            />
          )}
        </Field>

        {/* THE ONE MANGO, AND IT TAKES THE FIELD'S MEASURE. p28 draws
            `Continue` edge to edge under the address field — its ends are
            over the field's ends — at both widths, and p29 draws 27.19's the
            same way. It was a hug pill sitting alone at the reading start,
            which is the shape of a form with more than one control and this
            form has exactly one: "One field and Continue." The label stays
            centred in the pill, which is the only centred thing on an auth
            screen and is `Button`'s own drawing, not this file's. */}
        <div className="flex">
          <Button
            type="submit"
            className="w-full"
            loading={submitting}
            disabled={disabled}
          >
            {continueLabel}
          </Button>
        </div>

        {/* What the link does, in prose, before anyone asks. The artifact
            draws a different sentence at each width; exactly one is in the
            layout at a time. */}
        <Text as="p" size="sm" tone="secondary">
          <span className="hidden md:inline">{helpLine}</span>
          <span className="md:hidden">{helpLineNarrow}</span>
        </Text>

        {/* A text link, never a second button, and never a social row. */}
        {onUsePassword === undefined ? null : (
          <div className="flex">
            <Button
              type="button"
              variant="text"
              disabled={disabled}
              onClick={onUsePassword}
            >
              {usePasswordLabel}
            </Button>
          </div>
        )}
      </form>
    </AuthShell>
  );
}

SignInScreen.displayName = "SignInScreen";

export { AuthShell, SignInScreen };
