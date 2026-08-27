"use client";

/* ============================================================================
   InviteAcceptanceScreen — composition 27.18. The screen behind an invite link.

   DESIGN SOURCE — KWAPSO-SPEC.md, composition 27.18.

     27.18's opening, verbatim:
       "Names the person, the account and the access — The screen behind an
        invite link. It is the only place a person meets kwapso before they
        have an account, so it states who invited them, into what, and what
        they will be able to see — then hands straight to onboarding (27.14)."

     27.18 on naming all three, verbatim:
       "Who invited you, which account, and the role you are being given. What
        that role opens is not listed here — a list of collections means
        nothing to someone who has not seen the app yet, and it would go stale
        the moment Roles (27.12) changes."

     27.18 on the one mango, verbatim:
       "Decline is a text link. An invite is not a decision the brand should
        push, but it is the reason the screen exists, so it takes the one mango
        and sits furthest right with the retreat immediately left."

     27.18 on the handover, verbatim:
       "Accept goes straight into onboarding (27.14) with the name and email
        already filled from the invite. There is no interstitial 'welcome' page
        between the two — that would be four screens to do two things."

     27.18 on expiry, verbatim:
       "An invite link is single-use and expires in seven days. An expired one
        lands on this same shell saying so, with 'Ask for a new invite' that
        emails the person who sent it — never a dead end."

     27.18 on the doors, verbatim:
       "A client invite names the apps kwapso runs for them instead of a role,
        because the portal has no roles — 'You will see: Padelbase, Academy'.
        The rest of the screen is the same."

     The strings the artifact draws:
       "Join the account" · "AC" · "Member name" · "invited you to Account
        name" · "Your role" · "Builder" · "Not you? Tell us and the invite is
        withdrawn." · "Decline" · "Accept"
       narrow: the same, with "· Account name" on its own line.

   THE LAW THIS FILE OBEYS
   · THE SHELL IS NOT REDRAWN. `AuthShell` from `./sign-in`.
   · ACCEPT IS THE ONLY MANGO, AND IT IS FURTHEST RIGHT WITH DECLINE
     IMMEDIATELY LEFT. `ActionRow align="end"` puts them in that order and
     keeps it at every width.
   · DECLINE IS A TEXT LINK, NOT A SECOND BUTTON, AND NOT POPPY. 27.18 calls
     it a text link and nothing else; declining is not destruction.
   · THE ROLE IS NAMED, NEVER EXPANDED. There is no permission list on this
     screen and no slot for one.
   · THE ACCOUNT MARK IS A SQUARE. Ruling 30: "A square is a thing, a pill is a
     person." The artifact draws "AC" — the ACCOUNT being joined, not the
     inviter, whose initials in the same drawings are "MN".
   · NO ARTWORK IS INVENTED. `mark` and `media` have no default.

   RENDERING CONTEXT
   `"use client"`. `AuthShell` is a client component and the buttons carry
   handlers.
   ========================================================================= */

import * as React from "react";

import { ActionRow } from "../../components/action-row/action-row";
import { Avatar, AvatarFallback } from "../../components/avatar/avatar";
import { Button } from "../../components/button/button";
import { Card } from "../../components/card/card";
import { Separator } from "../../components/separator/separator";
import { Text } from "../../components/typography/typography";
import { AuthShell } from "./sign-in";

export interface InviteAcceptanceScreenProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
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

  /** The title. 27.18 draws "Join the account". */
  title?: React.ReactNode;

  /** Who invited you. 27.18 draws "Member name". */
  inviterName?: React.ReactNode;
  /** The account's two-character mark. Ruling 30: two characters, never three. */
  accountInitials?: string;
  /** Which account. 27.18 draws "Account name". */
  accountName?: React.ReactNode;
  /**
   * The words between the two names on desktop. A function, because the two
   * names sit inside one sentence and word order is per-locale.
   */
  formatInvitation?: (accountName: React.ReactNode) => React.ReactNode;
  /**
   * The narrow render puts the account on its own line under the inviter,
   * led by a separator rather than by the verb.
   */
  formatInvitationNarrow?: (accountName: React.ReactNode) => React.ReactNode;

  /** The access label. 27.18 draws "Your role". A portal invite names apps. */
  accessLabel?: React.ReactNode;
  /** The access value. 27.18 draws "Builder". */
  accessValue?: React.ReactNode;

  /** The escape hatch. 27.18: "Not you? Tell us and the invite is withdrawn." */
  notYouLine?: React.ReactNode;

  /** Accept. The one mango, furthest right. Hands straight to 27.14. */
  onAccept?: () => void;
  /** Its label. */
  acceptLabel?: React.ReactNode;
  /** Decline. A text link immediately left of Accept. */
  onDecline?: () => void;
  /** Its label. */
  declineLabel?: React.ReactNode;
  /** Accept is running. */
  submitting?: boolean;
  /** Nothing may be pressed. */
  disabled?: boolean;

  /**
   * The link was single-use and has been used, or seven days have passed.
   * 27.18: an expired invite "lands on this same shell saying so".
   */
  expired?: boolean;
  /**
   * What the expired screen says. NO DEFAULT: 27.18 states that the screen
   * exists and names its one control, but never writes its title or its
   * sentence. Inventing kwapso's words is out of bounds, so the door supplies
   * them. Logged as T3A-6 in GAPS-TRACK3A.md.
   */
  expiredTitle?: React.ReactNode;
  /** The one line under it. No default, for the same reason. */
  expiredDescription?: React.ReactNode;
  /** Ask the sender for a new one. The one mango on the expired screen. */
  onAskForNewInvite?: () => void;
  /** Its label — this string IS in the artifact. */
  askForNewInviteLabel?: React.ReactNode;
}

/**
 * The invite screen, and the expired-invite screen behind the same shell.
 *
 * TEN STATES
 *  1. default        — isotype, "Join the account", the account mark beside
 *                      the inviter and the account, the role, the escape
 *                      line, then Decline and the one mango Accept.
 *  2. hover          — owned by `Button`.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by `Button`.
 *  5. disabled       — `disabled` closes both controls, each drawing the one
 *                      shared disabled fill and ink. Never an opacity.
 *  6. loading        — `submitting`: Accept keeps its mango and grows its own
 *                      ring while the account is being joined. No screen-level
 *                      spinner — the statement on the page is still true while
 *                      the press is in flight.
 *  7. empty          — cannot occur. The screen's job is to name three things
 *                      and it always names three; every one has the artifact's
 *                      own drawn value as its default, so a bare mount states
 *                      an invitation rather than an outline of one.
 *  8. error          — `expired`, which is this screen's only failure and is
 *                      a whole body swap rather than a message: the title, the
 *                      sentence and the one control all change, and the shell
 *                      does not. A failed Accept is not drawn by the chapter
 *                      and is not invented here (T3A-6).
 *  9. selected       — does not apply.
 * 10. read-only      — does not apply. An invite is answered or it is not.
 *
 * THREE BREAKPOINTS
 *  mobile (below 48rem) — the photograph is dropped. The inviter block keeps
 *      BOTH lines, which is the narrow caption's own instruction ("the access
 *      list keeps both lines"): the account moves off the inviter's line and
 *      under it, led by a separator instead of by "invited you to", because
 *      that is the second string the artifact draws. The role stays a
 *      label-over-value pair. Decline and Accept keep their order — retreat
 *      left, commit right — and `ActionRow` stacks them commit-first on the
 *      block axis so the mango is under the thumb.
 *      THE ESCAPE LINE IS KEPT AT NARROW, and this is the one place this file
 *      does not follow the narrow drawing: 27.18's narrow render omits "Not
 *      you? …", while the chapter's own rule "Decline is honest" gives a
 *      person the right to say the invite is not theirs. A phone losing the
 *      only way to report a misdirected invite is a content loss, not a
 *      layout response. Logged as T3A-7.
 *  tablet (48rem and up) — two panels; the inviter and the account share one
 *      sentence again.
 *  desktop (64rem and up) — unchanged from tablet apart from the shell's page
 *      inset stepping 24 → 32.
 *
 * RTL — LTR only by client ruling.
 */
function InviteAcceptanceScreen({
  mark,
  media,
  serifLine,
  title = "Join the account",
  inviterName = "Member name",
  accountInitials = "AC",
  accountName = "Account name",
  formatInvitation = (name) => <>invited you to {name}</>,
  formatInvitationNarrow = (name) => <>· {name}</>,
  accessLabel = "Your role",
  accessValue = "Builder",
  notYouLine = "Not you? Tell us and the invite is withdrawn.",
  onAccept,
  acceptLabel = "Accept",
  onDecline,
  declineLabel = "Decline",
  submitting = false,
  disabled = false,
  expired = false,
  expiredTitle,
  expiredDescription,
  onAskForNewInvite,
  askForNewInviteLabel = "Ask for a new invite",
  ...props
}: InviteAcceptanceScreenProps) {
  if (expired) {
    return (
      <AuthShell
        data-slot="screen-invite-acceptance"
        data-expired="true"
        mark={mark}
        media={media}
        serifLine={serifLine}
        title={expiredTitle}
        description={expiredDescription}
        {...props}
      >
        {/* Never a dead end: the one control emails the person who sent it,
            and it is the only mango on the screen. */}
        <ActionRow align="start">
          <Button type="button" disabled={disabled} onClick={onAskForNewInvite}>
            {askForNewInviteLabel}
          </Button>
        </ActionRow>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      data-slot="screen-invite-acceptance"
      mark={mark}
      media={media}
      serifLine={serifLine}
      title={title}
      {...props}
    >
      <div className="flex w-full min-w-0 flex-col gap-[var(--space-6)]">
        {/* ONE SOFT-PAPER CARD, TWO ROWS, ONE HAIRLINE BETWEEN THEM. p29
            draws the invitation and the role as a single contained block on
            the content column's off-beige: who invited you on the first row,
            `Your role` at the reading start of the second with `Builder`
            pushed to the other end. Both rows used to lie bare on the column
            in a 24 stack, so the two facts the screen exists to state read as
            two unrelated paragraphs and the role's value sat under its own
            label instead of across from it. Law 3's alternation, and the
            hairline is the kit's same-tone separation. */}
        <Card
          data-slot="invite-summary"
          className="gap-[var(--space-4)] p-[var(--space-5)]"
        >
          <div className="flex min-w-0 items-start gap-3">
            {/* SQUARE, and that is ruling 30 over the drawing: "A square is a
                thing, a pill is a person." The account is a thing. p29 draws
                it round; the ruling is the later and more general statement
                and the file has held it since it was written — see
                LOGGED L-F12. MANGO, and that is the drawing: override 17
                counts actions, not objects, and ruling 30's own sentence is
                "one mark per view may take mango". This screen's one mango
                ACTION is still Accept. */}
            <Avatar shape="square" size="md" variant="brand" aria-hidden="true">
              <AvatarFallback>{accountInitials}</AvatarFallback>
            </Avatar>
            <Text as="p" size="base" className="min-w-0">
              <span className="font-[var(--font-weight-medium)]">{inviterName}</span>
              <span className="hidden md:inline"> {formatInvitation(accountName)}</span>
              <span className="block md:hidden">{formatInvitationNarrow(accountName)}</span>
            </Text>
          </div>

          <Separator />

          {/* The access, named and not expanded. Label at the reading start,
              value at the other end — the kit's own key/value row. */}
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
            <Text as="p" size="sm" tone="tertiary">
              {accessLabel}
            </Text>
            <Text as="p" size="base" className="ms-auto">
              {accessValue}
            </Text>
          </div>
        </Card>

        {/* ONE ROW: the honest sentence at the reading start, the retreat and
            then the one mango at the other end. p29 draws all three on one
            line; the sentence used to sit on a line of its own above them. */}
        <ActionRow align="end" className="sm:justify-between">
          {notYouLine === undefined ? null : (
            /* Narrow drops it: p29's phone render is `Decline` facing mango
               `Accept` and nothing else on the row. `align="end"` reverses
               the stack below `sm`, so a line left in it would print under
               the buttons — which is neither render. */
            <Text
              as="p"
              size="sm"
              tone="secondary"
              className="hidden min-w-0 sm:block sm:me-auto"
            >
              {notYouLine}
            </Text>
          )}
          {onDecline === undefined ? null : (
            <Button
              type="button"
              variant="text"
              disabled={disabled}
              onClick={onDecline}
            >
              {declineLabel}
            </Button>
          )}
          <Button
            type="button"
            loading={submitting}
            disabled={disabled}
            onClick={onAccept}
          >
            {acceptLabel}
          </Button>
        </ActionRow>
      </div>
    </AuthShell>
  );
}

InviteAcceptanceScreen.displayName = "InviteAcceptanceScreen";

export { InviteAcceptanceScreen };
