"use client";

/* ============================================================================
   LoginRoute — the system door. Email, six digits, an optional provider row,
   and the splash in front of all of it.

   ASSEMBLED FROM ONE SHAPE, NOT DESIGNED
     · SignIn / SignInSplash — shape 7. It already carries the two steps, the
       resend countdown, "Wrong address?", the provider row and the splash
       field. This route chooses the door's words and nothing else.

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" chapter 23, 27.16 (sign in), 27.17 (link sent) and
   27.45 (splash).

     ch27.16 on alignment, verbatim: "Nothing on an auth screen is centred.
       The title, the field label, the helper line and the button label all
       range left, the same as every other kwapso surface. A centred auth card
       is the most common way this brand gets misdrawn."

     ch27.17 on the second step, verbatim: "Send again sits in quiet ink with
       a live countdown next to it rather than disappearing. A disabled control
       that states its own condition never needs a tooltip."

     ch27.45 on when the splash may appear, verbatim: "It appears once, while
       the app is being started from nothing."

   THE LAW THIS FILE OBEYS
   · THE SHAPE ALREADY DECIDED THE SHELL. Two panels, nothing centred, one
     poppy line under the field, one mango moving forward. This route passes
     content into it and writes no layout at all.
   · THE PROVIDER ROW IS OPT-IN AND STAYS OPT-IN. ch27.16 forbids a social row
     outright; the commission asks for Google. `SignIn` already carries both
     sides by defaulting the row to empty, and this route keeps that default:
     a Google entry is passed by the application, never shipped from here.
   · THE ARTWORK IS THE BRAND'S, AND IT IS DRAWN — corrected 2026-08-24. This
     line read "NO ARTWORK IS INVENTED: `mark` and `media` have no defaults",
     which stopped being true when six masters landed in `assets/logos/` and
     nothing drew them; the client asked why the logo was nowhere and this
     door was one of the places it was nowhere. Nothing is invented here
     either — `SignIn` and `SignInSplash` default `mark` to the client's own
     lockup and this route forwards the prop unchanged, so an application can
     still pass its own. `media` genuinely has no default: no photography has
     been sent.
   · THE SPLASH IS A SEPARATE RETURN, NOT A STATE. ch27.45 lets it appear once
     while the app boots, so it stands in front of the door rather than being
     one of the door's own registers.


   IT IS ON NEITHER OF THE TWO SCREEN MODELS, AND THAT IS THE CHAPTER'S CALL
   `SHELL.md` has exactly two screens and one test between them: "a main
   screen is in the navbar; a detail screen has breadcrumbs." This screen is in neither
   place, and it is one of the four `SHELL.md` calls out by name: "form and
   edit panels … delete and archive modals … session expired replaces the
   window entirely". 27.16 is the two-panel auth shell — "photography one
   half, one column of content the other. No eyebrow, no wordmark in a
   corner" — shared by sign in, link sent, invite and session expired. There
   is no rail to draw, no parent collection to keep lit and no body pane: a
   person who has not signed in has no application around them yet.

   So this screen keeps its own shell and is NOT migrated onto `MainScreen` or
   `DetailScreen`. Recorded here rather than left silent, because the next
   reader sweeping for the four levels will otherwise "fix" it.

   RENDERING CONTEXT
   `"use client"`. `SignIn` builds submit handlers during its own render.
   ========================================================================= */

import * as React from "react";

import { Button } from "../../components/button/button";
import { SignIn, SignInSplash, type SignInProvider, type SignInStep, type SplashField } from "../templates";
import { type ShapeState, type ShapeStateCopy } from "../states";

export interface LoginRouteProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title" | "onSubmit"> {
  /**
   * The app has not finished starting. Renders ch27.45's splash instead of
   * the door — one screen, once, and never between two in-app screens.
   */
  booting?: boolean;
  /** Which field the splash paints, read from the stored theme before the first frame. */
  splashField?: SplashField;
  /** What a screen reader hears while the app starts. */
  splashLabel?: string;

  /** Which step of the door this is. */
  step?: SignInStep;
  /**
   * The brand artwork, above the title where an eyebrow would go — and, while
   * `booting`, centred on the splash field. Left unset each of the two takes
   * its own default from the shape: `Logotype` at `lg` on the door,
   * `Logotype` at `splash` on the splash. Pass a node to override both.
   */
  mark?: React.ReactNode;
  /** The photograph, on the inline start. Dropped on a phone. No default. */
  media?: React.ReactNode;
  /** The serif line the system door carries. */
  serifLine?: React.ReactNode;

  /** The email step's title. */
  emailTitle?: React.ReactNode;
  /** The email step's helper line. */
  emailDescription?: React.ReactNode;
  /** The code step's title. */
  codeTitle?: React.ReactNode;
  /** The code step's helper line. */
  codeDescription?: React.ReactNode;
  /**
   * The sentence naming the address the digits went to. A function, because
   * the address is a value inside a sentence and word order is per-locale.
   */
  formatCodeSent?: (email: string) => React.ReactNode;

  /** The address. Controlled, so the code step can say it out loud. */
  email?: string;
  /** Address changed. */
  onEmailChange?: (value: string) => void;
  /** One line under the field. Never a banner (ch27.16). */
  emailError?: React.ReactNode;

  /** The six digits. */
  code?: string;
  /** Code changed. */
  onCodeChange?: (value: string) => void;
  /** One line under the field. */
  codeError?: React.ReactNode;

  /** Move forward. */
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  /** The primary's label. */
  continueLabel?: React.ReactNode;
  /** The primary is working. */
  submitting?: boolean;

  /** Send the digits again. */
  onResend?: () => void;
  /** The live countdown beside it, already formatted by the app. */
  resendCountdown?: React.ReactNode;
  /** The only way back from the code step. */
  onBack?: () => void;

  /**
   * Provider buttons. EMPTY BY DEFAULT and deliberately so — see the header.
   * The commission's Google is one entry an application passes in.
   */
  providers?: readonly SignInProvider[];
  /** The rule above the provider row. */
  providersLabel?: React.ReactNode;

  /** Loading or error — the door itself could not be reached. */
  state?: ShapeState;
  /** Per-locale words. */
  copy?: Partial<ShapeStateCopy>;
  /** Try the door again. */
  onRetry?: () => void;
  /** Its label. */
  retryLabel?: React.ReactNode;
}

/* The system door's own words. Fictional address, so nothing here reads as a
   real account. */
const SAMPLE_ADDRESS = "you@studio.example";

function defaultFormatCodeSent(email: string): React.ReactNode {
  return `We sent six digits to ${email.length > 0 ? email : SAMPLE_ADDRESS}.`;
}

/**
 * The system sign-in screen.
 *
 * TEN STATES — all of them belong to `SignIn`, and none is redrawn here.
 *  1. default        — mark, title, helper, one field, one primary.
 *  2. hover          — owned by `Button` and the field's border token.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by `Button`.
 *  5. disabled       — the whole door goes quiet while `submitting`; "Send
 *                      again" states its countdown in words beside it.
 *  6. loading        — `submitting` on the primary; `booting` is the other
 *                      wait entirely and is the splash, not a spinner.
 *  7. empty          — does not apply. An auth screen always has its field.
 *  8. error          — one poppy line under the field for a bad address or a
 *                      rate limit; `state="error"` for an unreachable service.
 *  9. selected       — does not apply.
 * 10. read-only      — does not apply.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — one column with the photograph dropped below
 *  the two-column breakpoint, two above it. `SignIn` owns that.
 *
 * RTL — LTR only by client ruling.
 */
function LoginRoute({
  booting = false,
  splashField,
  splashLabel,
  step = "email",
  mark,
  media,
  serifLine = "The work, and how it is going.",
  emailTitle = "Sign in",
  emailDescription = "Use the address your account is registered to.",
  codeTitle = "Enter your code",
  codeDescription,
  formatCodeSent = defaultFormatCodeSent,
  email = "",
  onEmailChange,
  emailError,
  code,
  onCodeChange,
  codeError,
  onSubmit,
  continueLabel = "Continue",
  submitting = false,
  onResend,
  resendCountdown,
  onBack,
  providers,
  providersLabel,
  state = "ready",
  copy,
  onRetry,
  retryLabel = "Try again",
  ...props
}: LoginRouteProps) {
  if (booting) {
    return (
      <SignInSplash
        data-slot="system-login-splash"
        mark={mark}
        field={splashField}
        label={splashLabel}
        {...props}
      />
    );
  }

  return (
    <SignIn
      data-slot="system-login"
      step={step}
      mark={mark}
      media={media}
      serifLine={serifLine}
      title={step === "email" ? emailTitle : codeTitle}
      description={step === "email" ? emailDescription : codeDescription}
      email={email}
      onEmailChange={onEmailChange}
      emailLabel="Work email"
      emailError={emailError}
      code={code}
      onCodeChange={onCodeChange}
      codeError={codeError}
      codeSentLine={step === "code" ? formatCodeSent(email) : undefined}
      onSubmit={onSubmit}
      continueLabel={continueLabel}
      submitting={submitting}
      onResend={onResend}
      resendCountdown={resendCountdown}
      onBack={onBack}
      providers={providers}
      providersLabel={providersLabel}
      state={state}
      copy={copy}
      errorAction={
        onRetry === undefined ? undefined : (
          <Button variant="secondary" onClick={onRetry}>
            {retryLabel}
          </Button>
        )
      }
      {...props}
    />
  );
}

LoginRoute.displayName = "LoginRoute";

export { LoginRoute };
