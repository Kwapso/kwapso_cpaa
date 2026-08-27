"use client";

/* ============================================================================
   LinkSentScreen — composition 27.17. The waiting room that names the address.

   DESIGN SOURCE — KWAPSO-SPEC.md, composition 27.17.

     27.17's own subtitle and opening, verbatim:
       "A waiting room that names the address — What replaces the form once
        Continue is pressed. It exists so nobody presses Continue twice, and it
        says the address out loud so a typo is caught here rather than in a
        support thread."

     27.17 on the address, verbatim:
       "Spelled out, with 'Wrong address?' beside it going straight back to the
        form with the value kept. Most failed sign-ins are typos, and this is
        the cheapest place to catch one."

     27.17 on the resend, verbatim:
       "Send again sits in quiet ink with a live countdown next to it rather
        than disappearing. A disabled control that states its own condition
        never needs a tooltip."

     27.17 on what it must never do, verbatim:
       "No inbox theatre. No animated envelope, no 'waiting…' spinner, no
        auto-refresh. The page is a statement, not a process. If the link is
        opened elsewhere this tab simply keeps saying what it said."

     27.17 on the transition, verbatim:
       "The image and the layout do not move between 27.16 and this screen, so
        the transition is a body swap, not a new page. 'Wrong address?' is the
        only way back — there is no chevron."

     The strings the artifact draws, desktop then narrow:
       "We sent you a link" · "name@company.com" · "Wrong address?"
       "Open it on this device and you land where you left off. The link works
        once and expires in 15 minutes." · "Send again" · "available in 0:47"
       narrow: "It works once and expires in 15 minutes." · "Send again" · "0:47"

   THE LAW THIS FILE OBEYS
   · THE SHELL IS NOT REDRAWN. `AuthShell` from `./sign-in` — the same object
     27.16 uses, because the artifact says the layout does not move between
     the two screens. Only the body is swapped.
   · NO MANGO ON THIS SCREEN, AND THAT IS THE DRAWING. The only two controls
     are "Wrong address?" and "Send again", and the artifact puts the second
     "in quiet ink". One mango is a ceiling, not a quota.
   · THE COUNTDOWN IS LIVE. It ticks in this component, once a second, and it
     stops at zero and releases the control. It is not a static string: the
     chapter says "a live countdown".
   · NO SPINNER, NO POLL, NO AUTO-REFRESH. Nothing in this file sets a timer
     other than the countdown, and nothing re-fetches.
   · NO CHEVRON, NO BACK BUTTON. "Wrong address?" is the only way back.

   RENDERING CONTEXT
   `"use client"`. `useState` + `useEffect` drive the countdown, which is the
   whole reason this screen cannot be a server component.
   ========================================================================= */

import * as React from "react";

import { Button } from "../../components/button/button";
import { Text } from "../../components/typography/typography";
import { AuthShell } from "./sign-in";

/**
 * m:ss, zero-padded on the seconds. The kit has no time formatter and the
 * artifact draws "0:47", so this is that shape and nothing wider. Exported so
 * a locale that counts differently can be given `formatCountdown` instead of
 * forking the screen.
 */
export function formatResendCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export interface LinkSentScreenProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  /**
   * The brand artwork, above the title. Left undefined it takes
   * `AuthShell`'s default, which is `Logotype` — the version with the
   * name on it, per the client's 2026-08-24 instruction. Pass a node to
   * override, or `null` for no mark.
   */
  mark?: React.ReactNode;
  /** The photograph. The same one 27.16 drew — the image does not move. */
  media?: React.ReactNode;
  /** The door's serif line. */
  serifLine?: React.ReactNode;

  /** The title. 27.17 draws "We sent you a link". */
  title?: React.ReactNode;

  /**
   * The address the link went to, said out loud. Required in practice: the
   * whole screen exists to name it. Defaulted to the artifact's own drawn
   * value so a bare mount is never a blank statement.
   */
  email?: string;

  /** "Wrong address?" — the only way back, and there is no chevron. */
  onWrongAddress?: () => void;
  /** Its label. */
  wrongAddressLabel?: React.ReactNode;

  /** What the link does. The artifact draws a longer line on desktop… */
  helpLine?: React.ReactNode;
  /** …and a shorter one at narrow. */
  helpLineNarrow?: React.ReactNode;

  /** Send the link again. Quiet ink, never mango, never disappearing. */
  onResend?: () => void;
  /** Its label. 27.17 draws "Send again". */
  resendLabel?: React.ReactNode;
  /**
   * How many seconds the control stays closed for. The artifact draws the
   * countdown mid-flight at 47. Counting starts on mount and restarts every
   * time this value changes, which is how a caller re-arms it after a resend.
   */
  resendSeconds?: number;
  /**
   * The words around the countdown on desktop — "available in 0:47". A
   * function, because the number sits inside a sentence and word order is
   * per-locale.
   */
  formatCountdown?: (clock: string) => React.ReactNode;
  /** The narrow render draws the clock alone. */
  formatCountdownNarrow?: (clock: string) => React.ReactNode;

  /** Nothing may be pressed. */
  disabled?: boolean;
}

/**
 * The screen that replaces the form once Continue is pressed.
 *
 * TEN STATES
 *  1. default        — isotype, "We sent you a link", the address with "Wrong
 *                      address?" beside it, the expiry prose, and Send again
 *                      in quiet ink with its countdown.
 *  2. hover          — owned by `Button`. Neither control has a fill to shift.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by `Button`.
 *  5. disabled       — TWO different disablings, and they are not the same
 *                      statement. `disabled` closes the whole screen. The
 *                      countdown closes Send again ALONE and says why, in
 *                      words, next to it — which is why it needs no tooltip.
 *                      Both are a fill and an ink from `Button`'s one
 *                      disabled skin. Never an opacity.
 *  6. loading        — DOES NOT EXIST, and that is the chapter, not an
 *                      omission: "No animated envelope, no 'waiting…'
 *                      spinner, no auto-refresh. The page is a statement, not
 *                      a process."
 *  7. empty          — cannot occur. The screen is four sentences and two
 *                      controls, all of them always drawn. An address that
 *                      never arrived would be a caller bug; `email` therefore
 *                      carries the artifact's own value rather than allowing
 *                      a blank line where the address should be.
 *  8. error          — does not belong here. A resend that fails returns the
 *                      reader to 27.16, where an error is one poppy line under
 *                      the field. This screen has no field to put one under
 *                      and 27.16 forbids the banner that would be the
 *                      alternative.
 *  9. selected       — does not apply.
 * 10. read-only      — always, in effect. The screen holds no value.
 *
 * THREE BREAKPOINTS
 *  mobile (below 48rem) — the photograph is dropped; everything else keeps its
 *      order, which is the narrow caption's own words: "same order, no image".
 *      Two strings shorten because the artifact draws shorter ones: the expiry
 *      prose loses its first clause, and the countdown loses "available in"
 *      and shows the clock alone. The address and "Wrong address?" sit on one
 *      wrapping row rather than restacking, so the correction stays beside the
 *      thing it corrects at every width.
 *  tablet (48rem and up) — the photograph returns, the long strings return.
 *  desktop (64rem and up) — unchanged from tablet apart from the shell's page
 *      inset stepping 24 → 32.
 *
 * RTL — LTR only by client ruling.
 */
function LinkSentScreen({
  mark,
  media,
  serifLine,
  title = "We sent you a link",
  email = "name@company.com",
  onWrongAddress,
  wrongAddressLabel = "Wrong address?",
  helpLine = "Open it on this device and you land where you left off. The link works once and expires in 15 minutes.",
  helpLineNarrow = "It works once and expires in 15 minutes.",
  onResend,
  resendLabel = "Send again",
  resendSeconds = 47,
  formatCountdown = (clock) => `available in ${clock}`,
  formatCountdownNarrow = (clock) => clock,
  disabled = false,
  ...props
}: LinkSentScreenProps) {
  /* The live countdown. It is state and not a prop-through because the
     chapter asks for a clock that moves, and a caller re-arming it on every
     tick would re-render the whole door once a second. */
  const [remaining, setRemaining] = React.useState(() => Math.max(0, Math.floor(resendSeconds)));

  React.useEffect(() => {
    setRemaining(Math.max(0, Math.floor(resendSeconds)));
  }, [resendSeconds]);

  React.useEffect(() => {
    if (remaining <= 0) return undefined;
    const id = window.setInterval(() => {
      setRemaining((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [remaining]);

  const counting = remaining > 0;
  const clock = formatResendCountdown(remaining);

  return (
    <AuthShell
      data-slot="screen-link-sent"
      mark={mark}
      media={media}
      serifLine={serifLine}
      title={title}
      {...props}
    >
      <div className="flex w-full min-w-0 flex-col gap-[var(--space-5)]">
        {/* THE ADDRESS IS A CONTAINED ROW, NOT A LINE OF PROSE. p28 draws it
            inside a soft-paper strip on the content column's off-beige —
            the address at the reading start and "Wrong address?" pushed to
            the other end — and p28's phone render draws the same strip with
            the two stacked inside it. It was bare, so the one statement this
            screen exists to make ("it went HERE") sat in running text beside
            its own correction. Law 3's alternation: off-beige column,
            soft-paper strip. */}
        <div
          data-slot="link-sent-address"
          className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[var(--radius)] bg-surface-panel px-[var(--space-5)] py-[var(--space-4)]"
        >
          {/* The address at 500 — p28 draws it `font-weight: 500` at both
              widths, the one bolded thing in the strip, because it IS the
              statement. "Wrong address?" sits BESIDE it (the artifact's
              `gap: 12px` row, wrapping under it at narrow) — it was pushed
              to the strip's far end, which is nobody's drawing. */}
          <Text
            as="span"
            size="sm"
            className="min-w-0 break-all font-[var(--font-weight-medium)]"
          >
            {email}
          </Text>
          {onWrongAddress === undefined ? null : (
            <Button
              type="button"
              variant="text"
              disabled={disabled}
              onClick={onWrongAddress}
            >
              {wrongAddressLabel}
            </Button>
          )}
        </div>

        {/* What the link does — once, fifteen minutes, this device. */}
        <Text as="p" size="sm" tone="secondary">
          <span className="hidden md:inline">{helpLine}</span>
          <span className="md:hidden">{helpLineNarrow}</span>
        </Text>

        {/* A PILL IN THE DISABLED SKIN, NOT A TEXT LINK. p28 draws Send again
            as a 999-radius button — 44 high, a paper fill, the disabled ink —
            with the countdown as loose type beside it; "sits in quiet ink"
            names the INK, and the drawing puts it on a pill. A text link here
            was the build's own reading and read as a second "Wrong address?".
            `Button`'s one disabled skin is the kit's fill-and-ink pair. */}
        <div className="flex min-w-0 flex-wrap items-center gap-[var(--space-3h)]">
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || counting}
            onClick={onResend}
          >
            {resendLabel}
          </Button>
          {counting ? (
            <Text
              as="span"
              size="sm"
              tone="tertiary"
              numeric
              /* The clock changes under the reader without them acting, so it
                 is announced politely rather than silently or urgently. */
              aria-live="polite"
            >
              <span className="hidden md:inline">{formatCountdown(clock)}</span>
              <span className="md:hidden">{formatCountdownNarrow(clock)}</span>
            </Text>
          ) : null}
        </div>
      </div>
    </AuthShell>
  );
}

LinkSentScreen.displayName = "LinkSentScreen";

export { LinkSentScreen };
