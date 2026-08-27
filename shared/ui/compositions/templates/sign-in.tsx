"use client";

/* ============================================================================
   SignIn — the email step, the six-digit code step, any provider row a door
   opts into, and the splash that follows.

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" chapter 23 ("Auth & account"), 27.16 (sign in),
   27.17 (link sent) and 27.45 (splash).

     ch27.16 on the shell, verbatim:
       "Sign in, link sent, invite and session expired are the same two-panel
        shell — photography left, one column of content right on off-beige,
        with the isotype sitting directly above the title where an eyebrow
        would otherwise go. Only the title and the body change; there is no
        eyebrow on an auth screen and no wordmark in the corner."

     ch27.16 on alignment, verbatim: "Nothing on an auth screen is centred.
       The title, the field label, the helper line and the button label all
       range left, the same as every other kwapso surface. A centred auth card
       is the most common way this brand gets misdrawn."

     ch27.16 on failure, verbatim: "An unknown address, a rate limit or an
       expired link is one poppy line beneath the field naming what happened
       and what to do — never a red banner across the top, never a dialog."

     ch27.17 on the second step, verbatim: "Send again sits in quiet ink with
       a live countdown next to it rather than disappearing. A disabled control
       that states its own condition never needs a tooltip." And: "'Wrong
       address?' is the only way back — there is no chevron."

     ch27.45 on the splash, verbatim: "The isotype centred on the brand field.
       No wordmark, no tagline, no version number, no spinner and no progress
       bar: if the wait is long enough to need one, the loading composition
       takes over." And when: "It appears once, while the app is being started
       from nothing."

   THE SPLASH IS THE ONE SCREEN WHERE THE CLIENT AND THE ARTIFACT COLLIDE
   Both sides, in their own words, because this must not be settled silently:

     ch27.45, verbatim: "The isotype centred on the brand field. NO WORDMARK,
       no tagline, no version number."

     the client, 2026-08-24, verbatim: "in the outside screens (sign in, link,
       etc) i want the isotype + logotype version, THE ONE WITH THE NAME ON
       IT".

   The splash is a screen you meet before you are signed in — it is one of the
   "etc" — so the two instructions land on it at once and say opposite things
   about the wordmark. THE CLIENT WINS, because a client ruling beats the
   artifact and that is the standing rule on this project. `SignInSplash`
   therefore defaults to `Logotype`.

   IT IS ONE PROP TO PUT BACK. A route that wants 27.45 exactly passes
   `mark={<Isotype size="splash" on="brand" />}` and gets the chapter's screen
   with nothing else changed. If the client, seeing it, says the splash should
   keep the glyph alone, that is the whole edit.

   THE COMMISSION AND THE KIT DISAGREE HERE — BOTH SIDES ARE CARRIED
   Commission §9 asks for "email, six-digit code entry, Google". Chapter 23
   draws exactly a six-digit code — "We sent six digits to …" with "Resend in
   0:42" — and a "Continue with company SSO" button. Chapter 27.16 draws a
   magic LINK instead, and says in words: "there is never a social sign-in
   row: the account is the company's, not a Google profile's."
   WHAT WAS DONE. The six-digit step is built, because two of the three
   sources want it. The provider row is built but DEFAULTS TO EMPTY, so a door
   that passes nothing gets ch27.16's screen and a door that passes Google
   gets the commission's. Neither source is overruled silently. GAPS-SHAPES.md
   SHP-9 and SHP-10.

   THE LAW THIS FILE OBEYS
   · NOTHING IS CENTRED, except the splash's mark, which ch27.45 centres by
     name. Every label, line and button label ranges to the inline start.
   · ONE MANGO, AND IT MOVES FORWARD. Continue is the primary. "Use a password
     instead", "Wrong address?" and "Send again" are text buttons — never a
     second filled button.
   · A FAILURE IS ONE LINE UNDER THE FIELD. `Field`'s `error` draws it. There
     is no banner and no dialog on this screen.
   · THE ARTWORK IS REAL AND IS THE DEFAULT — CORRECTED 2026-08-24. This line
     read "NO ARTWORK IS INVENTED: the isotype is a `mark` prop with no
     default". Six masters landed in `assets/logos/` on 2026-08-23 and nothing
     in the delivery drew them, so this door rendered with a hole where the
     mark goes and the client asked why. `mark` now defaults to `Logotype` —
     "the isotype + logotype version, the one with the name on it", their
     words — and stays a prop, so a door can pass its own or `null`.
   · THE PHOTOGRAPH IS REAL TOO, AS OF LATER THE SAME DAY. `media` defaults to
     `AuthPhotograph`. Client: "we will replace it later, but so far for the
     external screens image use the attached (the phone mockup)" — so it is a
     placeholder they intend to swap, and the swap is one file plus one command
     because every screen on this shell draws the same component.
   · Focus is one global rule. No ring, no radius, no fill written here.

   RENDERING CONTEXT
   `"use client"`. `useId` through `Field`, and submit handlers built here.
   ========================================================================= */

import * as React from "react";

import { AmbientBackground } from "../../components/ambient-background/ambient-background";
import { Logotype } from "../../components/brand/brand";
import { Button } from "../../components/button/button";
import { Field } from "../../components/field/field";
import { Image } from "../../components/image/image";
import { Input } from "../../components/input/input";
import {
  Headline,
  Text,
} from "../../components/typography/typography";
import { cn } from "../../lib/utils";
import {
  ShapeStateBody,
  shapeCopy,
  type ShapeState,
  type ShapeStateCopy,
} from "../states/states";

/* ----------------------------------------------------------------------------
   AuthPhotograph — the picture on the outside screens' left half.

   ONE PICTURE, ONE SHELL, SIX SCREENS: sign in, link sent, session expired,
   invitation, password/security and the portal's door all share 27.16's
   two-panel shell, so they share this. It lives HERE, beside `SignIn`, and
   `screens/sign-in.tsx`'s `AuthShell` imports it — one component so the swap
   the client already asked for is one file and not six paths.

   Client, 2026-08-24, verbatim: "we will replace it later, but so far for the
   external screens image use the attached (the phone mockup)".

   TO SWAP THE PICTURE: replace `assets/photography/exterior-mockup.png` and
   run `node assets/build-assets.mjs`. Nothing in `compositions/` names a
   width, a byte count or a file path except the three imports below, and those
   are derived names that the generator keeps stable across a swap.

   THE CROP IS THE HARD PART, AND IT IS MEASURED, NOT CHOSEN BY EYE.
   The source is 1920 x 1080 — 16:9 landscape. The slot is half the viewport
   wide and the WHOLE viewport tall (the shell is `min-h-dvh`), so it is a tall
   column and `object-fit: cover` keeps the full height and throws width away.
   Only the horizontal position matters; the vertical one cannot bite.

   Measured on the master: the phone spans 40.1% to 62.5% of the frame's width
   and its centre is at 51.3%. What `cover` keeps is a band of width
   (column aspect / 1.778) centred on `object-position`:

     1440 wide, ~900 tall  -> column 0.76:1  -> keeps 28.5% .. 71.5%   whole tray
      834 wide, ~1100 tall -> column 0.33:1  -> keeps 41.7% .. 60.3%   the screen

   So the position is 51%, not 50%: one percent of nudge buys the phone's right
   edge a real margin at the narrow end, where the band is only 19% wide and
   the default centre clips the handset. At the tightest aspect the tray and the
   pencil are gone and what survives is the phone's screen with the kwapso
   wordmark on it, which is the right thing to lose last.

   BELOW 48rem IT IS NOT DRAWN AT ALL — 27.16, "the image drops". The wrapper
   is `hidden md:block`, so the element is in the DOM but has no layout box; it
   is `loading="lazy"` (the `Image` primitive's default) and a lazy image with
   no box is never fetched. A phone therefore downloads none of this, which is
   the part that actually matters and is why `lazy` is not turned off here even
   though on a desktop this picture is above the fold. On a desktop the box IS
   in the viewport, so the lazy rule fetches it at first layout anyway.

   IT IS DECORATIVE. `alt=""` — the `Image` primitive's own default, and the
   correct value: the heading beside it already names the screen, and a screen
   reader announcing a stock photograph on a sign-in page is noise.
   ------------------------------------------------------------------------- */

import photo960src from "../../assets/photography/exterior-mockup-960.jpg";
import photo1440src from "../../assets/photography/exterior-mockup-1440.jpg";
import photo1920src from "../../assets/photography/exterior-mockup-1920.jpg";

import { assetUrl } from "../../lib/asset-url";

/* A bundler decides what an asset import evaluates to and they disagree — Vite
   a URL string, Next a `StaticImageData` object. `assetUrl` settles it. Without
   it this file does not COMPILE under Next, and because AuthShell imports
   AuthPhotograph at module scope the error lands on every importer whether the
   photograph is rendered or not. See lib/asset-url.ts. */
const photo960 = assetUrl(photo960src);
const photo1440 = assetUrl(photo1440src);
const photo1920 = assetUrl(photo1920src);

/**
 * The outside screens' photograph, filling whatever box it is given.
 *
 * TEN STATES — every one of them is `Image`'s. This component chooses a
 * source, a crop and a `sizes` hint and adds no state of its own, but the ten
 * are named rather than deferred to by reference, because a reader looking for
 * "what does this do while it loads" should not have to open another file.
 *  1. default        — the picture, cover-cropped, on the quiet ground.
 *  2. hover          — does not apply. A photograph is not a control.
 *  3. focus-visible  — NOT here. An <img> is not focusable and neither this
 *                      component nor `Image` makes it one.
 *  4. active/pressed — does not apply, for the same reason as hover.
 *  5. disabled       — does not apply. A picture cannot be disabled, and
 *                      greying one would be an opacity, which is forbidden.
 *  6. loading        — `Image`'s register: the quiet ground and a spinner,
 *                      `aria-busy` set, in a box already the right size. On a
 *                      phone this state never begins, because the picture is
 *                      never fetched.
 *  7. empty          — cannot occur. The source is not passed in; it is this
 *                      component. A screen that wants no picture passes
 *                      `media={null}` to the shell instead.
 *  8. error          — `Image`'s failure register, in the box the picture
 *                      would have had, so a broken fetch does not reflow the
 *                      door beside it.
 *  9. selected       — does not apply.
 * 10. read-only      — always. There is nothing here to write to.
 *
 * THREE BREAKPOINTS — mobile: NOT DRAWN, by the shell (27.16, "the image
 * drops"). tablet / desktop: half the viewport wide and the whole viewport
 * tall, cropped as the header describes.
 *
 * RTL — LTR only by client ruling. `object-position` names a percentage, not a
 * side, so it does not need mirroring.
 */
function AuthPhotograph({ className }: { className?: string }) {
  return (
    <Image
      data-slot="auth-photograph"
      src={photo1440}
      srcSet={`${photo960} 960w, ${photo1440} 1440w, ${photo1920} 1920w`}
      /* A cover crop on a tall column PAINTS a far wider image than the column
         is — the band it keeps is only a fifth to a half of the frame — so the
         browser needs a hint well above the slot's own 50vw or it picks a file
         it then has to upscale. 100vw is the honest approximation of what is
         actually rasterised; below 48rem nothing is drawn and the value is
         moot. */
      sizes="100vw"
      /* `null`: this is not a ratio box, it is a whole grid column whose height
         comes from the content beside it. `size-full` fills that column. */
      ratio={null}
      className={cn("size-full", className)}
      /* 51%, measured. See the header. */
      mediaClassName="object-[51%_50%]"
    />
  );
}

AuthPhotograph.displayName = "AuthPhotograph";

/** Which step of the door this is. */
export type SignInStep = "email" | "code";

/** How many digits the code step takes. Chapter 23 draws six. */
export const SIGN_IN_CODE_LENGTH = 6;

/**
 * A provider button. EMPTY BY DEFAULT: ch27.16 forbids a social row and
 * chapter 23 draws one for company SSO, so the choice belongs to the door,
 * not to this file. Commission §9's Google is one entry in this array.
 */
export interface SignInProvider {
  /** Stable key. */
  id: string;
  /** The button's words. Chapter 23's own is "Continue with company SSO". */
  label: React.ReactNode;
  /** A mark before the words. */
  icon?: React.ReactNode;
  /** Press. */
  onSelect?: () => void;
  /** This route is not available to this reader. */
  disabled?: boolean;
}

export interface SignInProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title" | "onSubmit"> {
  /** Which step. */
  step?: SignInStep;

  /**
   * The brand artwork, directly above the title where an eyebrow would go.
   * Defaults to `Logotype` — the lockup with the name on it, which is what
   * the client asked every signed-out screen to carry (2026-08-24). Pass a
   * node to override, or `null` for no mark.
   */
  mark?: React.ReactNode;
  /**
   * The photograph. Left on desktop, dropped on a phone (27.16, "the image
   * drops"). Defaults to `AuthPhotograph`, the one picture every outside
   * screen shares. Pass a node to override, or `null` to draw a single column.
   */
  media?: React.ReactNode;
  /** The serif line each door carries. The portal's is "Your work, in the open." */
  serifLine?: React.ReactNode;

  /** The step's title. */
  title?: React.ReactNode;
  /** The helper line under the title. */
  description?: React.ReactNode;

  /** The address. Controlled, so the code step can say it out loud. */
  email?: string;
  /** Address changed. */
  onEmailChange?: (value: string) => void;
  /** The field's label. */
  emailLabel?: string;
  /** The field's helper line. */
  emailHelp?: React.ReactNode;
  /** One line under the field. Never a banner (ch27.16). */
  emailError?: React.ReactNode;

  /** The six digits. */
  code?: string;
  /** Code changed. */
  onCodeChange?: (value: string) => void;
  /** The field's label. */
  codeLabel?: string;
  /** How many digits. */
  codeLength?: number;
  /** One line under the field. */
  codeError?: React.ReactNode;
  /** "We sent six digits to a.mira@padelbase.de." — the caller writes the sentence. */
  codeSentLine?: React.ReactNode;

  /** Move forward. */
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  /** The primary's label. */
  continueLabel?: React.ReactNode;
  /** The primary is working. */
  submitting?: boolean;
  /** Nothing may be typed or pressed. */
  disabled?: boolean;

  /** Send the code again. Quiet ink, never disappearing (ch27.17). */
  onResend?: () => void;
  /** The resend's label. */
  resendLabel?: React.ReactNode;
  /**
   * The live countdown beside it. While this is set the control states its own
   * condition, which is why it needs no tooltip.
   */
  resendCountdown?: React.ReactNode;

  /** "Wrong address?" — the only way back from the code step (ch27.17). */
  onBack?: () => void;
  /** Its label. */
  backLabel?: React.ReactNode;

  /** "Use a password instead" — a text link, never a second button. */
  onUsePassword?: () => void;
  /** Its label. */
  usePasswordLabel?: React.ReactNode;

  /** Provider buttons. Empty by default — see the header. */
  providers?: readonly SignInProvider[];
  /** The rule above the provider row. */
  providersLabel?: React.ReactNode;

  /** Draw the brand wash behind the column. Scoped to auth, splash and portal home. */
  ambient?: boolean;

  /** Loading or error. */
  state?: ShapeState;
  /** Per-locale words. */
  copy?: Partial<ShapeStateCopy>;
  /** The retry on a block failure. */
  errorAction?: React.ReactNode;
}

/**
 * The first screen of either door.
 *
 * TEN STATES
 *  1. default        — mark, title, helper, one field, one primary.
 *  2. hover          — owned by `Button` and by the field's border token.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by `Button`.
 *  5. disabled       — `disabled` reaches the field and every button, each
 *                      drawing a fill and an ink. Never an opacity. "Send
 *                      again" during its countdown states its own condition
 *                      in words beside it rather than growing a tooltip.
 *  6. loading        — `submitting`: the primary keeps its fill and grows a
 *                      spinner. `state="loading"` covers the rarer case where
 *                      the door itself has not arrived.
 *  7. empty          — does not apply: an auth screen always has its one
 *                      field. The nearest case is `state="loading"`.
 *  8. error          — one line under the field, poppy, naming what happened
 *                      and what to do. `state="error"` is the different case
 *                      where the service could not be reached at all.
 *  9. selected       — does not apply.
 * 10. read-only      — does not apply. A door that cannot be typed into is
 *                      `disabled`, which is a different statement.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — one column below 48rem with the photograph
 *  dropped, two columns above it. ch27.16 draws the photograph as half the
 *  shell; on a phone there is no room for it and the content column is the
 *  whole screen.
 *
 * RTL — LTR only by client ruling. Logical properties throughout.
 */
function SignIn({
  className,
  step = "email",
  /* The lockup, not the glyph alone. See the prop's own note. */
  mark = <Logotype />,
  /* One picture, every outside screen. See `AuthPhotograph` above. */
  media = <AuthPhotograph />,
  serifLine,
  title,
  description,
  email,
  onEmailChange,
  emailLabel = "Work email",
  emailHelp,
  emailError,
  code,
  onCodeChange,
  codeLabel = "Enter your code",
  codeLength = SIGN_IN_CODE_LENGTH,
  codeError,
  codeSentLine,
  onSubmit,
  continueLabel = "Continue",
  submitting = false,
  disabled = false,
  onResend,
  resendLabel = "Send again",
  resendCountdown,
  onBack,
  backLabel = "Wrong address?",
  onUsePassword,
  usePasswordLabel = "Use a password instead",
  providers,
  providersLabel,
  ambient = true,
  state = "ready",
  copy,
  errorAction,
  ...props
}: SignInProps) {
  const words = shapeCopy("signIn", copy);

  const body =
    state === "loading" || state === "error" ? (
      <ShapeStateBody
        shape="signIn"
        state={state}
        copy={copy}
        action={state === "error" ? errorAction : undefined}
      />
    ) : (
      <form
        data-slot="sign-in-form"
        onSubmit={onSubmit}
        className="flex w-full min-w-0 flex-col gap-6"
      >
        {step === "email" ? (
          <Field label={emailLabel} help={emailHelp} error={emailError} disabled={disabled}>
            {(control) => (
              <Input
                {...control}
                type="email"
                name="email"
                autoComplete="email"
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
        ) : (
          <div className="flex min-w-0 flex-col gap-3">
            {codeSentLine === undefined ? null : (
              <Text as="p" size="sm" tone="secondary">
                {codeSentLine}
              </Text>
            )}
            <Field label={codeLabel} error={codeError} disabled={disabled}>
              {(control) => (
                <Input
                  {...control}
                  /* One field of `codeLength` digits, not `codeLength` boxes:
                     chapter 23 draws a single entry and a row of boxes would
                     be a control this system does not have. SHP-11. */
                  type="text"
                  name="one-time-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={codeLength}
                  className="tabular-nums"
                  value={code}
                  onChange={
                    onCodeChange === undefined
                      ? undefined
                      : (event) => {
                          onCodeChange(event.currentTarget.value);
                        }
                  }
                />
              )}
            </Field>
          </div>
        )}

        {/* The one mango, and it moves forward. */}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={submitting} disabled={disabled}>
            {continueLabel}
          </Button>
          {step === "code" && onResend !== undefined ? (
            <span className="flex items-center gap-2">
              <Button
                type="button"
                variant="text"
                disabled={disabled || resendCountdown !== undefined}
                onClick={onResend}
              >
                {resendLabel}
              </Button>
              {resendCountdown === undefined ? null : (
                <Text as="span" size="sm" tone="tertiary" numeric>
                  {resendCountdown}
                </Text>
              )}
            </span>
          ) : null}
        </div>

        {/* Text links, never a second filled button. */}
        {step === "email" && onUsePassword !== undefined ? (
          <Button type="button" variant="link" disabled={disabled} onClick={onUsePassword}>
            {usePasswordLabel}
          </Button>
        ) : null}
        {step === "code" && onBack !== undefined ? (
          <Button type="button" variant="link" disabled={disabled} onClick={onBack}>
            {backLabel}
          </Button>
        ) : null}

        {providers === undefined || providers.length === 0 ? null : (
          <div className="flex min-w-0 flex-col gap-3">
            {providersLabel === undefined ? null : (
              <Text as="p" size="sm" tone="tertiary">
                {providersLabel}
              </Text>
            )}
            {providers.map((provider) => (
              <Button
                key={provider.id}
                type="button"
                variant="secondary"
                disabled={disabled || provider.disabled}
                onClick={provider.onSelect}
              >
                {provider.icon}
                {provider.label}
              </Button>
            ))}
          </div>
        )}
      </form>
    );

  return (
    <div
      data-slot="sign-in"
      data-step={step}
      className={cn(
        /* `min-h-dvh`, not `min-h-full`. A percentage min-height resolves
           against the PARENT's height, and every call site mounts this shape
           in an auto-height parent, so `min-h-full` computed to 0 and the door
           drew a zero-height box (measured at 1440 on `LoginRoute booting` and
           on `PortalIndexRoute boot="booting"`). The artifact settles the unit
           rather than this file guessing it: ch27.16 states the five auth
           screens are "the same two-panel shell", and one of those five —
           ch27.19 — is stated verbatim as "a signed-out session replaces the
           whole window". The shell is therefore the window, and the window is
           `dvh`. Track 3A, GAPS-TRACK3A.md T3A-1. */
        "relative grid min-h-dvh w-full min-w-0 gap-[var(--space-7)] md:grid-cols-2",
        className,
      )}
      {...props}
    >
      {ambient ? <AmbientBackground variant="brand" /> : null}

      {/* Photography left. Dropped below the two-column breakpoint — and
          `hidden` rather than unmounted is deliberate: the <img> inside is
          `loading="lazy"`, and a lazy image with no layout box is never
          fetched, so a phone pays nothing for a picture it will not see. */}
      {media === null || media === undefined ? null : (
        <div data-slot="sign-in-media" className="hidden min-w-0 md:block">
          {media}
        </div>
      )}

      {/* One column of content right. Nothing here is centred. */}
      <div
        data-slot="sign-in-content"
        className="flex min-w-0 flex-col justify-center gap-6"
      >
        {/* `undefined` cannot reach here — the destructuring defaults it — so
            `null` is how a door says "no mark", and it has to be tested for. */}
        {mark === null || mark === undefined ? null : (
          <span className="flex">{mark}</span>
        )}
        {serifLine === undefined ? null : (
          <Headline as="p" size="h3" serif weight="light">
            {serifLine}
          </Headline>
        )}
        <div className="flex min-w-0 flex-col gap-2">
          <Headline as="h1" size="h2">
            {title ?? words.emptyTitle}
          </Headline>
          {description === undefined ? null : (
            <Text as="p" size="sm" tone="secondary">
              {description}
            </Text>
          )}
        </div>
        {body}
      </div>
    </div>
  );
}

SignIn.displayName = "SignIn";

/**
 * Which field the splash paints. Ruling 22: mango in light, the unlit page
 * tone in dark, "chosen from the stored theme before the first frame so the
 * splash never flashes the wrong palette" — a runtime choice by the boot
 * script, not a media query, which is why it is a prop and not a class.
 */
export type SplashField = "brand" | "unlit";

const SPLASH_FIELD: Record<SplashField, string> = {
  /** Light. `--surface-brand` is the kit's mango field. */
  brand: "bg-surface-brand",
  /** Dark. `--background` resolves to the unlit page tone ruling 22 names. */
  unlit: "bg-background",
};

export interface SignInSplashProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "children"> {
  /**
   * The brand artwork, centred on the field.
   *
   * DEFAULTS TO `Logotype` at `size="splash"`, with the cut following `field`
   * — the black cut on mango, the reversed cut on unlit. This is the one
   * screen where the client's instruction and ch27.45 collide; see the
   * header. Pass `<Isotype size="splash" on="brand" />` for 27.45 exactly.
   */
  mark?: React.ReactNode;
  /** Which field, read from the stored theme before the first frame. */
  field?: SplashField;
  /**
   * What a screen reader hears while the app starts. The splash draws no
   * words at all, so this is the only string on it.
   */
  label?: string;
}

/**
 * The screen between pressing the icon and the app being ready.
 *
 * ch27.45 governs when it may appear: "once, while the app is being started
 * from nothing. Never between two in-app screens, never on a route change,
 * never after a save — that waiting is chapter 27.6's job." This component
 * cannot enforce that; the route that mounts it must.
 *
 * TEN STATES — this screen has exactly one, and the other nine are named.
 *  1. default        — the isotype centred on the brand field.
 *  2. hover          — does not apply. Nothing here is a control.
 *  3. focus-visible  — does not apply. Nothing here is focusable.
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply.
 *  6. loading        — this screen IS the loading state, and ch27.45 forbids
 *                      it drawing a second one: no spinner, no progress bar.
 *  7. empty          — CLOSED as of 2026-08-24. It used to be reachable and it
 *                      used to be the likely outcome: no artwork shipped, so a
 *                      route that forgot `mark` drew an unlabelled colour at
 *                      full window height, which is not a screen. The mark now
 *                      has a real default and the only way to an empty field
 *                      is `mark={null}`, i.e. a route asking for it in words.
 *  8. error          — does not apply. A start-up that fails lands on ruling
 *                      06's error page, which is a different screen.
 *  9. selected       — does not apply.
 * 10. read-only      — does not apply.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. One centred mark on a full field is
 *  the same object at every width.
 *
 * RTL — LTR only by client ruling. Centring is direction-neutral.
 */
function SignInSplash({
  className,
  mark,
  field = "brand",
  label = "Starting",
  ...props
}: SignInSplashProps) {
  /* Computed in the body rather than as a destructuring default, because it
     reads `field` and the reader should not have to know that a later default
     in the same pattern may see an earlier binding. `null` draws no mark. */
  const artwork =
    mark === undefined ? (
      <Logotype size="splash" on={field === "brand" ? "brand" : "unlit"} />
    ) : (
      mark
    );

  return (
    <div
      data-slot="sign-in-splash"
      data-field={field}
      role="status"
      aria-label={label}
      className={cn(
        /* `min-h-dvh` for the same reason the door above takes it, and here it
           is load-bearing twice over: the splash's only content is a mark that
           may not have arrived yet, so a 0-height field draws NOTHING at all.
           ch27.45 calls this screen "the screen between pressing the icon and
           the app being ready" and says the destination "is replaced by" it —
           it stands where a whole screen stands. GAPS-TRACK3A.md T3A-1. */
        "relative grid min-h-dvh w-full place-content-center",
        SPLASH_FIELD[field],
        className,
      )}
      {...props}
    >
      {artwork}
    </div>
  );
}

SignInSplash.displayName = "SignInSplash";

export { AuthPhotograph, SignIn, SignInSplash };
