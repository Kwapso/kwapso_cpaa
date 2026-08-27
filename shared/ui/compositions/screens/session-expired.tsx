"use client";

/* ============================================================================
   SessionExpiredScreen — composition 27.19. The one state allowed to replace
   the frame.

   DESIGN SOURCE — KWAPSO-SPEC.md, composition 27.19.

     27.19's opening, verbatim:
       "The one state allowed to replace the frame — A member who has been away
        comes back to a page that cannot load. Per law 4 the frame normally
        stays drawn — this is the exception: a signed-out session replaces the
        whole window, because there is nothing behind it we are allowed to
        show."

     27.19 on the exception, verbatim:
       "Every other state keeps the rail and the header drawn. A dead session
        does not, because a signed-out browser must not keep showing a
        workspace — not even greyed out. This and a whole-page failure are the
        only two."

     27.19 on the destination, verbatim:
       "The record or screen that was open is stated as a chip and restored
        after sign-in. A session ending should cost a member one button, not
        their place in the work."

     27.19 on the reason, verbatim:
       "Thirty days, or signed out from another device. 'Your session has
        expired' on its own invites a support ticket; the reason and the
        reassurance travel together."

     27.19 on the field, verbatim:
       "We know who it was, so the field arrives filled and Continue is one
        press. Nothing about being signed out should feel like starting from
        scratch."

     27.19 on what it must never be, verbatim:
       "A session cannot expire into a dialog on top of stale data — the
        numbers behind it would be wrong and readable. The page is replaced,
        once, and no toast announces it."

     The strings the artifact draws:
       "Sign in to carry on" · "Sessions end after 30 days, or when someone
        signs you out from another device. Nothing you had open was lost." ·
        "We will take you back to" · "4182" · "Record title" · "Work email" ·
        "name@company.com" · "Continue"

   THE LAW THIS FILE OBEYS
   · IT REPLACES THE WINDOW. `AuthShell` is `min-h-dvh` and this screen must be
     mounted at the top of the tree with no rail and no header around it. That
     is not a hint: 27.19 is the chapter that MAKES the shell the window.
   · THE SHELL IS NOT REDRAWN. It is 27.16's, unchanged, because the artifact
     names this screen as one of the four on that shell.
   · ONE MANGO, AND IT IS CONTINUE.
   · THE FIELD ARRIVES FILLED. `email` is a value, not a placeholder.
   · NO MODAL, NO TOAST, NO DIM. This file mounts no overlay of any kind.

   RENDERING CONTEXT
   `"use client"`. `Field` calls `useId`; the form builds a submit handler.
   ========================================================================= */

import * as React from "react";

import { Badge } from "../../components/badge/badge";
import { Button } from "../../components/button/button";
import { Field } from "../../components/field/field";
import { Input } from "../../components/input/input";
import { Text } from "../../components/typography/typography";
import { AuthShell } from "./sign-in";

export interface SessionExpiredScreenProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title" | "onSubmit"> {
  /**
   * The brand artwork, above the title. Left undefined it takes
   * `AuthShell`'s default, which is `Logotype` — the version with the
   * name on it, per the client's 2026-08-24 instruction. Pass a node to
   * override, or `null` for no mark.
   */
  mark?: React.ReactNode;
  /** The photograph. The same shell as 27.16. */
  media?: React.ReactNode;
  /** The door's serif line. */
  serifLine?: React.ReactNode;

  /** The title. 27.19 draws "Sign in to carry on". */
  title?: React.ReactNode;
  /** Why, and the reassurance, in one line. They travel together. */
  reason?: React.ReactNode;

  /** The words before the chip. 27.19 draws "We will take you back to". */
  destinationLabel?: React.ReactNode;
  /** The chip. 27.19 draws "4182" — the record's own reference. */
  destinationRef?: React.ReactNode;
  /**
   * The destination's name beside the chip. 27.19 draws "Record title" on
   * desktop and drops it at narrow, where the reference alone identifies it.
   */
  destinationTitle?: React.ReactNode;

  /** The address, PRE-FILLED. We know who it was. */
  email?: string;
  /** The address changed. */
  onEmailChange?: (value: string) => void;
  /** The field's label. 27.19 draws "Work email". */
  emailLabel?: React.ReactNode;
  /** One poppy line under the field, if the address is refused. */
  error?: React.ReactNode;

  /** Press Continue. */
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  /** The one mango. */
  continueLabel?: React.ReactNode;
  /** The press is in flight. */
  submitting?: boolean;
  /** Nothing may be typed or pressed. */
  disabled?: boolean;
}

/**
 * The screen a signed-out session lands on.
 *
 * TEN STATES
 *  1. default        — isotype, "Sign in to carry on", the reason and the
 *                      reassurance in one line, the destination chip, the
 *                      pre-filled field, one mango Continue.
 *  2. hover          — owned by `Button` and by `Input`'s hairline token.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by `Button`.
 *  5. disabled       — `disabled` closes the field and the button, each a fill
 *                      and an ink. Never an opacity.
 *  6. loading        — `submitting` on Continue only. The screen itself never
 *                      loads: it is what is drawn when loading was refused.
 *  7. empty          — cannot occur for the sentence or the field, both of
 *                      which always draw. The destination CAN be absent — a
 *                      session that died on a screen with no record — and the
 *                      chip block is then not drawn at all rather than drawn
 *                      empty, because "we will take you back to" with nothing
 *                      after it is worse than not saying it. The rest of the
 *                      screen is unchanged and still signs the member in.
 *  8. error          — `error`: one poppy line under the field. No banner, no
 *                      dialog — 27.16's rule, and this screen shares its shell.
 *  9. selected       — does not apply.
 * 10. read-only      — does not apply.
 *
 * THREE BREAKPOINTS
 *  mobile (below 48rem) — the photograph is dropped. The destination line
 *      wraps into the prose instead of standing as its own block, and the
 *      RECORD'S NAME DROPS, leaving the reference alone in the chip — both are
 *      the artifact's narrow drawing. The reason sentence is KEPT IN FULL,
 *      which is the one place this file does not follow that drawing: 27.19's
 *      narrow render shows only "Nothing you had open was lost", and the
 *      chapter's own rule is "the reason and the reassurance travel together".
 *      A rule beats an abbreviated render. Logged as T3A-8.
 *      The field and Continue are full width and unchanged.
 *  tablet (48rem and up) — the photograph returns and the record's name
 *      returns beside the chip.
 *  desktop (64rem and up) — unchanged from tablet apart from the shell's page
 *      inset stepping 24 → 32.
 *
 * RTL — LTR only by client ruling.
 */
function SessionExpiredScreen({
  mark,
  media,
  serifLine,
  title = "Sign in to carry on",
  reason = "Sessions end after 30 days, or when someone signs you out from another device. Nothing you had open was lost.",
  destinationLabel = "We will take you back to",
  destinationRef = "4182",
  destinationTitle = "Record title",
  email = "name@company.com",
  onEmailChange,
  emailLabel = "Work email",
  error,
  onSubmit,
  continueLabel = "Continue",
  submitting = false,
  disabled = false,
  ...props
}: SessionExpiredScreenProps) {
  return (
    <AuthShell
      data-slot="screen-session-expired"
      mark={mark}
      media={media}
      serifLine={serifLine}
      title={title}
      description={reason}
      {...props}
    >
      <div className="flex w-full min-w-0 flex-col gap-[var(--space-6)]">
        {/* Where you were going, stated as a chip. A wrapping row, so at
            narrow the chip sits inside the sentence instead of under it. */}
        {destinationRef === undefined ? null : (
          /* IT IS A SOFT-PAPER ROW, NOT A LINE OF PROSE. p29 draws the
             destination inside its own contained strip on the content
             column's off-beige — "the destination stays named" is the
             narrow caption, and the strip is what makes it a statement
             rather than a sentence someone might read past. It was drawn
             bare, so the chip floated in running text. Law 3's alternation:
             off-beige column, soft-paper strip. */
          <div
            data-slot="session-expired-destination"
            className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius)] bg-surface-panel px-[var(--space-4)] py-[var(--space-3)]"
          >
            <Text as="span" size="sm" tone="secondary">
              {destinationLabel}
            </Text>
            {/* THE BLACK CHIP IS ALWAYS THE ID — override 73, the client's
                universal rule ("we always use black chips for IDs"). It was
                `outline`; the ruling beats the artifact's lighter drawing. */}
            <Badge variant="inverse">{destinationRef}</Badge>
            {destinationTitle === undefined ? null : (
              <Text as="span" size="sm" className="hidden min-w-0 truncate md:inline">
                {destinationTitle}
              </Text>
            )}
          </div>
        )}

        <form
          data-slot="session-expired-form"
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

          {/* THE FIELD'S MEASURE, as on 27.16. p29 draws `Continue` edge to
              edge under the pre-filled address at both widths. */}
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
        </form>
      </div>
    </AuthShell>
  );
}

SessionExpiredScreen.displayName = "SessionExpiredScreen";

export { SessionExpiredScreen };
