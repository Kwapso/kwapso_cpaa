"use client";

/* ============================================================================
   PortalLoginRoute — `/login` in the client portal.

   THE SHAPE
   `SignIn` (shape 7 of the twelve). Two steps: the address, then the six
   digits. THE MARK NOW HAS A DEFAULT — corrected 2026-08-24, when the client
   asked why the logo was nowhere: the shape defaults it to `Logotype`, "the
   isotype + logotype version, the one with the name on it". This route still
   forwards `mark` so a door can pass its own. The PHOTOGRAPH is still a prop
   with no default in the shape and none here, because the kit ships none.

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" chapter 27.16 (sign in) and 27.17 (link sent).

     ch27.16 on the shell, verbatim:
       "Sign in, link sent, invite and session expired are the same two-panel
        shell — photography left, one column of content right on off-beige,
        with the isotype sitting directly above the title where an eyebrow
        would otherwise go. Only the title and the body change; there is no
        eyebrow on an auth screen and no wordmark in the corner."

     ch27.16 on alignment, verbatim: "Nothing on an auth screen is centred.
       The title, the field label, the helper line and the button label all
       range left … A centred auth card is the most common way this brand gets
       misdrawn."

     ch27.16 on failure, verbatim: "An unknown address, a rate limit or an
       expired link is one poppy line beneath the field naming what happened
       and what to do — never a red banner across the top, never a dialog."

     ch27.17 on the second step, verbatim: "Send again sits in quiet ink with
       a live countdown next to it rather than disappearing." And: "'Wrong
       address?' is the only way back — there is no chevron."

   HOW THIS DOOR DIFFERS FROM THE SYSTEM'S
   Same shell, three differences and no fourth:
     1. THE SERIF LINE IS THE PORTAL'S. "Your work, in the open." — the line
        the shape's own documentation names for this door.
     2. NO PROVIDER ROW. `providers` is left empty, which is ch27.16's screen
        verbatim: "there is never a social sign-in row: the account is the
        company's, not a Google profile's." The system door may pass one; a
        client's does not.
     3. "USE A PASSWORD INSTEAD" IS NOT OFFERED. A client has one route in,
        and offering two makes the simpler one look like the fallback.
   The larger type is the root `data-scale="large"`, not a step bumped here.

   THE LAW THIS FILE OBEYS
   · ONE MANGO, AND IT MOVES FORWARD (law 2). Continue. "Send again" and
     "Wrong address?" are text buttons and never a second fill.
   · A FAILURE IS ONE LINE UNDER THE FIELD — `emailError` / `codeError`, never
     a banner, never a dialog.
   · THE AMBIENT FIELD IS ALLOWED HERE. Ruling 05/06 scopes it to "auth,
     splash and portal home", and this is auth.
   · EVERY USER-FACING STRING IS A PROP (PATTERN §7).
   · No fill, no radius, no ring and no type step is written in this file.


   IT IS ON NEITHER OF THE TWO SCREEN MODELS, AND THAT IS THE CHAPTER'S CALL
   `SHELL.md` has exactly two screens and one test between them: "a main
   screen is in the navbar; a detail screen has breadcrumbs." This screen is in neither
   place. It is the portal's half of 27.16's two-panel auth shell — the same
   shell `system/login.tsx`, `screens/sign-in.tsx`, `screens/link-sent.tsx`,
   `screens/invite-acceptance.tsx` and `screens/session-expired.tsx` share.
   There is no rail to draw and no parent collection to keep lit: a client who
   has not signed in has no portal around them yet.

   So this screen keeps its own shell and is NOT migrated onto `MainScreen` or
   `DetailScreen`. Recorded here rather than left silent, because the next
   reader sweeping for the four levels will otherwise "fix" it.

   RENDERING CONTEXT
   `"use client"`. The submit handler is built during this module's own
   render and `Field` calls `useId`.
   ========================================================================= */

import * as React from "react";

import { Button } from "../../controls/button/button";
import { SignIn } from "../templates";
import type { SignInStep } from "../templates";
import type { ShapeState, ShapeStateCopy } from "../states";

/** Every user-facing string on this route. */
export interface PortalLoginLabels {
  serifLine: string;
  emailTitle: string;
  emailDescription: string;
  emailLabel: string;
  emailHelp: string;
  codeTitle: string;
  codeDescription: string;
  codeLabel: string;
  continueLabel: string;
  resendLabel: string;
  backLabel: string;
  retry: string;
}

const DEFAULT_LABELS: PortalLoginLabels = {
  /* The portal's own serif line — the shape names it for this door. */
  serifLine: "Your work, in the open.",
  emailTitle: "Sign in",
  emailDescription: "Use the address we set your account up with.",
  emailLabel: "Work email",
  emailHelp: "We send a six-digit code. No password to remember.",
  codeTitle: "Check your mail",
  codeDescription: "The code is good for ten minutes.",
  codeLabel: "Enter your code",
  continueLabel: "Continue",
  resendLabel: "Send again",
  backLabel: "Wrong address?",
  retry: "Retry",
};

const DEFAULT_COPY: Partial<ShapeStateCopy> = {
  errorDescription: "We could not reach the sign-in service. Try again in a moment.",
};

export interface PortalLoginRouteProps {
  /** Which step. */
  step?: SignInStep;
  /**
   * The brand artwork, directly above the title. Left unset it takes the
   * shape's default, `Logotype` — the lockup with the name on it. Pass a node
   * to override, or `null` for no mark.
   */
  mark?: React.ReactNode;
  /** The photograph, left on desktop and dropped on a phone. */
  media?: React.ReactNode;

  /** The address. */
  email?: string;
  /** Address changed. */
  onEmailChange?: (value: string) => void;
  /** One poppy line under the field. Never a banner (ch27.16). */
  emailError?: React.ReactNode;

  /** The six digits. */
  code?: string;
  /** Code changed. */
  onCodeChange?: (value: string) => void;
  /** One line under the field. */
  codeError?: React.ReactNode;
  /** "We sent six digits to …" — the caller writes the sentence with the address in it. */
  codeSentLine?: React.ReactNode;

  /** Move forward. */
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  /** The primary is working. */
  submitting?: boolean;
  /** Nothing may be typed or pressed. */
  disabled?: boolean;

  /** Send the code again. */
  onResend?: () => void;
  /** The live countdown beside it — the control states its own condition. */
  resendCountdown?: React.ReactNode;
  /** The only way back from the code step (ch27.17). */
  onBack?: () => void;

  /** Loading or error. */
  state?: ShapeState;
  /** Per-locale words for the registers. */
  copy?: Partial<ShapeStateCopy>;
  /** Per-locale words for the screen. */
  labels?: Partial<PortalLoginLabels>;
  /** Try the door again. */
  onRetry?: () => void;
}

/**
 * The portal's door.
 *
 * TEN STATES — `SignIn`'s. This route decides the words, and that there is no
 * provider row and no password route behind this door.
 *
 * THREE BREAKPOINTS — the shape's: one column below 48rem with the photograph
 * dropped, two above it.
 *
 * RTL — LTR only by client ruling.
 */
function PortalLoginRoute({
  step = "email",
  mark,
  media,
  email,
  onEmailChange,
  emailError,
  code,
  onCodeChange,
  codeError,
  codeSentLine,
  onSubmit,
  submitting = false,
  disabled = false,
  onResend,
  resendCountdown,
  onBack,
  state = "ready",
  copy,
  labels,
  onRetry,
}: PortalLoginRouteProps) {
  const words: PortalLoginLabels = { ...DEFAULT_LABELS, ...labels };
  const onCode = step === "code";

  return (
    <SignIn
      step={step}
      mark={mark}
      media={media}
      serifLine={words.serifLine}
      title={onCode ? words.codeTitle : words.emailTitle}
      description={onCode ? words.codeDescription : words.emailDescription}
      email={email}
      onEmailChange={onEmailChange}
      emailLabel={words.emailLabel}
      emailHelp={words.emailHelp}
      emailError={emailError}
      code={code}
      onCodeChange={onCodeChange}
      codeLabel={words.codeLabel}
      codeError={codeError}
      codeSentLine={codeSentLine}
      onSubmit={onSubmit}
      continueLabel={words.continueLabel}
      submitting={submitting}
      disabled={disabled}
      onResend={onResend}
      resendLabel={words.resendLabel}
      resendCountdown={resendCountdown}
      onBack={onBack}
      backLabel={words.backLabel}
      /* ch27.16 — "there is never a social sign-in row". Not passed, not
         defaulted off somewhere else: absent. */
      ambient
      state={state}
      copy={{ ...DEFAULT_COPY, ...copy }}
      errorAction={
        onRetry === undefined ? undefined : (
          <Button variant="secondary" onClick={onRetry}>
            {words.retry}
          </Button>
        )
      }
    />
  );
}

PortalLoginRoute.displayName = "PortalLoginRoute";

export { PortalLoginRoute };
