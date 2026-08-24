"use client";

/* ============================================================================
   PortalConversation — the client's thread on a record: bubbles, the files
   that came with them, the composer, and the band that asks a client to
   approve something before anything is written.

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" chapter 27.10 (chat), ruling 36 (which side a
   bubble sits on), 27.44 (approving before anything runs) and 27.28's
   doors-differ note on how a client reviews a deliverable.

     ch27.10, doors differ, verbatim:
       "The portal has the client thread and the assistant only — no internal
        chat, no internal notes, no composer switch. Its composer says
        'kwapso will see this', and the thread lives on the record, never as a
        separate inbox."

     ch27.10 on the four kinds being one composition, verbatim: "Client ↔ team
       threads, internal team chat, the assistant, and comments on a record
       are the same composition with a different header and a different
       participant list."

     ch27.10 on the paperclip, verbatim: "There is no paperclip anywhere in
       chat: a message is text, files live on the record — the same
       context-left, actions-right order as every other bar."

     ch27.28, doors differ, verbatim: "The portal's gallery is how a client
       reviews deliverables: same grid, and a tile carries Approve and Comment
       on the record it opens, never on the tile itself."

     ch27.44, verbatim: "A proposal is never applied by arriving. Nothing is
       written until Approve is pressed, and the screen says so beside the
       button." Its own drawn line, verbatim: "Nothing is written until you
       press Approve".

     ch27 law 2, verbatim: "One mango button per screen — the thing the screen
       is for — and it sits furthest right in whatever bar it belongs to, with
       context ranged left and the retreat immediately to its left. Back,
       Cancel, Discard and Keep never take mango, even when they are the only
       button on the screen: retreating is not a primary action."

   THE LAW THIS FILE OBEYS
   · AN INTERNAL NOTE CANNOT ENTER THIS THREAD. ch27.10 says the portal has
     "no internal notes", so the message type is `Omit<ThreadMessage,
     "internal">` — passing one is a compile error — and a message that
     arrives with the flag set anyway, from untyped data, is DROPPED before
     the thread is built, with a development warning. A leak of an internal
     note to a client is the one failure on this screen that cannot be
     apologised for afterwards, so it is not left to a call site's care.
   · THERE IS NO PAPERCLIP. ch27.10 forbids one in chat by name, so
     `TicketThread`'s `onAttach` is not forwarded and not exposed. Files
     already ON a message still draw as chips, because those are the record's
     files arriving in the thread, which is exactly what the same sentence
     says should happen. Logged as PC-1 in GAPS-SHAPES2.md.
   · THERE IS NO COMPOSER SWITCH. Same sentence. The audience is stated in
     words instead — "kwapso will see this", the kit's own line — and a client
     never chooses who reads what they write.
   · THE APPROVAL BAND SAYS SO BESIDE THE BUTTON. `note` is drawn in the same
     row as the two controls, ranged left, and its default is 27.44's own
     sentence. It is not a tooltip and it is not under a disclosure.
   · THE RETREAT NEVER TAKES MANGO (law 2). The band's second control is a
     `secondary` Button and there is no variant prop to change that.
   · ONE MANGO PER SCREEN. The band's Approve is it. `TicketThread`'s send is
     the charcoal fill of ruling 36, not the brand, so the two do not compete
     — but a call site that puts a second mango on this screen has broken law
     2 somewhere above this file.
   · Focus is one global rule. No ring, no radius, no fill written here.

   RENDERING CONTEXT
   `"use client"`. The composer's state and the band's handlers are built
   during this module's own render.
   ========================================================================= */

import * as React from "react";

import { ActionRow } from "../../controls/action-row/action-row";
import { Button } from "../../controls/button/button";
import { Text } from "../../controls/typography/typography";
import {
  TicketThread,
  type ThreadAttachment,
  type ThreadMessage,
  type TicketThreadProps,
} from "../ticket-thread/ticket-thread";
import { cn } from "../../lib/utils";
import {
  SHAPE_SHELL,
  shapeCopy,
  type ScreenDensity,
  type ShapeState,
  type ShapeStateCopy,
} from "../../compositions/states/states";

export type { ThreadAttachment };

/**
 * A message in a client's thread. `internal` is REMOVED rather than defaulted
 * to false: ch27.10 says the portal has no internal notes, and a flag that
 * can be set is a flag that will be.
 */
export type PortalMessage = Omit<ThreadMessage, "internal">;

/* ============================================================================
   The approval band
   ========================================================================= */

export interface PortalApprovalBandProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  /** What is being approved — "Sprint 34 deliverables, ready for your review". */
  title?: React.ReactNode;
  /**
   * The sentence beside the button. ch27.44 requires one and this is its own
   * wording; a locale replaces it.
   */
  note?: React.ReactNode;
  /** Approve it. The one mango on this screen. */
  onApprove?: () => void;
  /** The commit's label. */
  approveLabel?: React.ReactNode;
  /**
   * The other route. ch27.28 names the pair "Approve and Comment", so the
   * default word is the kit's; in a thread the comment itself is written in
   * the composer below, and this control is what takes the reader there.
   */
  onComment?: () => void;
  /** The second control's label. */
  commentLabel?: React.ReactNode;
  /** The approval is in flight. Approve keeps its fill and grows a spinner. */
  submitting?: boolean;
  /** Nothing may be pressed. A fill and an ink, never an opacity. */
  disabled?: boolean;
}

/**
 * The band above the composer that asks for an approval.
 *
 * TEN STATES
 *  1. default        — the sentence, the note, the two controls.
 *  2. hover          — owned by `Button`.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by `Button`.
 *  5. disabled       — `disabled` reaches both controls, each drawing its own
 *                      fill and ink.
 *  6. loading        — `submitting`: Approve keeps its fill and grows a
 *                      spinner; the second control stops for the duration, so
 *                      the same decision cannot be sent twice.
 *  7. empty          — no `onApprove` and no `onComment`: renders `null`. A
 *                      band that asks for a decision it cannot take is chrome.
 *  8. error          — does not apply. An approval that FAILED is the call
 *                      site's own notice, so the reader's decision is never
 *                      thrown away by a state change inside this component.
 *  9. selected       — does not apply. This is all-or-nothing; a per-item
 *                      approval is 27.44's per-field confidence, a different
 *                      composition.
 * 10. read-only      — no handlers, so nothing is drawn at all rather than a
 *                      row of dead buttons.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. One column of copy and one action
 *  row, which wraps on its own; `ActionRow align="end"` already stacks below
 *  its own breakpoint and this file adds none.
 *
 * RTL — LTR only by client ruling. `me-auto` on the note is logical.
 */
function PortalApprovalBand({
  className,
  title,
  note = "Nothing is written until you press Approve",
  onApprove,
  approveLabel = "Approve",
  onComment,
  commentLabel = "Comment",
  submitting = false,
  disabled = false,
  ...props
}: PortalApprovalBandProps) {
  if (onApprove === undefined && onComment === undefined) return null;

  return (
    <div
      data-slot="portal-approval-band"
      className={cn("flex min-w-0 flex-col gap-3", className)}
      {...props}
    >
      {title === undefined ? null : (
        <Text as="p" size="sm">
          {title}
        </Text>
      )}

      {/* Law 2 — context ranged left, the retreat immediately left of the
          primary, the primary furthest right. The note IS the reason and it
          sits beside the button, which is 27.44's requirement in words. */}
      <ActionRow align="end">
        {note === undefined ? null : (
          <Text as="span" size="sm" tone="tertiary" className="me-auto">
            {note}
          </Text>
        )}
        {onComment === undefined ? null : (
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || submitting}
            onClick={onComment}
          >
            {commentLabel}
          </Button>
        )}
        {onApprove === undefined ? null : (
          <Button type="button" loading={submitting} disabled={disabled} onClick={onApprove}>
            {approveLabel}
          </Button>
        )}
      </ActionRow>
    </div>
  );
}

PortalApprovalBand.displayName = "PortalApprovalBand";

/* ============================================================================
   The screen
   ========================================================================= */

export interface PortalConversationProps
  extends Omit<
    TicketThreadProps,
    | "messages"
    | "banner"
    | "onAttach"
    | "attachLabel"
    | "internalLabel"
    | "state"
    | "className"
  > {
  /** Extra classes on the shape's own wrapper. */
  className?: string;
  /**
   * The measure. `calm` by default — this thread only exists behind the
   * narrow door (commission §9).
   */
  density?: ScreenDensity;

  /** The conversation, oldest first. An internal note cannot be passed. */
  messages?: readonly PortalMessage[];

  /** Anything else the band should carry, drawn under the approval row. */
  banner?: React.ReactNode;

  /**
   * The line under the band that says who reads this. ch27.10: the portal's
   * composer "says 'kwapso will see this'". Pass `null` where the surrounding
   * screen already says it.
   */
  audience?: React.ReactNode;

  /** What is being approved. Absent, no band is drawn. */
  approvalTitle?: React.ReactNode;
  /** 27.44's sentence beside the button. */
  approvalNote?: React.ReactNode;
  /** Approve it. */
  onApprove?: () => void;
  /** The commit's label. */
  approveLabel?: React.ReactNode;
  /** The other route. */
  onComment?: () => void;
  /** Its label. */
  commentLabel?: React.ReactNode;
  /** The approval is in flight. */
  approving?: boolean;

  /** Loading, empty or error. The composer and the band stay drawn (law 4). */
  state?: ShapeState;
  /** Per-locale words. */
  copy?: Partial<ShapeStateCopy>;
}

/**
 * A client's conversation on a record.
 *
 * TEN STATES — nine of the ten are `TicketThread`'s and are not decided a
 * second time here: the bubbles, their sides, the 62% measure, the composer's
 * disabled fill, the sending state, the loading skeletons, the empty and
 * error registers and the read-only transcript all belong to it. What this
 * file adds is the band above the composer, whose own ten are listed on
 * `PortalApprovalBand`, and one refusal:
 *
 *  · INTERNAL — not a state, a prohibition. A message carrying the flag is
 *    removed before the thread sees it.
 *
 * THREE BREAKPOINTS — `TicketThread`'s. Ruling 36 states one bubble measure
 * at every width and it is measured against the column this shape is given,
 * which `density` sets, so a thread in a narrow panel on a wide screen is
 * already right without a media query.
 *
 * RTL — LTR only by client ruling.
 */
function PortalConversation({
  className,
  density = "calm",
  messages,
  banner,
  audience = "kwapso will see this",
  approvalTitle,
  approvalNote,
  onApprove,
  approveLabel,
  onComment,
  commentLabel,
  approving = false,
  state = "ready",
  copy,
  disabled,
  ...props
}: PortalConversationProps) {
  const words = shapeCopy("portalConversation", copy);

  /* ch27.10 — "no internal notes" in the portal. The type already refuses
     one; this refuses the untyped case too, and it drops the MESSAGE rather
     than the flag: a note written for the team, shown to the client with its
     marking removed, is worse than a note that never arrives. */
  const safe: ThreadMessage[] = [];
  for (const message of messages ?? []) {
    if ((message as ThreadMessage).internal === true) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `PortalConversation: message "${message.id ?? "(no id)"}" is marked internal and was dropped. ch27.10 — the portal has no internal notes.`,
        );
      }
      continue;
    }
    safe.push(message);
  }

  const approval =
    onApprove === undefined && onComment === undefined ? null : (
      <PortalApprovalBand
        title={approvalTitle}
        note={approvalNote}
        onApprove={onApprove}
        approveLabel={approveLabel}
        onComment={onComment}
        commentLabel={commentLabel}
        submitting={approving}
        disabled={disabled}
      />
    );

  const audienceLine =
    audience === undefined || audience === null ? null : (
      <Text as="p" size="caption" tone="tertiary">
        {audience}
      </Text>
    );

  const band =
    approval === null && banner === undefined && audienceLine === null ? undefined : (
      <div data-slot="portal-conversation-band" className="flex min-w-0 flex-col gap-3">
        {approval}
        {banner}
        {audienceLine}
      </div>
    );

  return (
    <div
      data-slot="portal-conversation"
      data-density={density}
      data-state={state}
      className={cn("flex w-full min-w-0 flex-col", SHAPE_SHELL[density], className)}
    >
      <TicketThread
        messages={safe}
        banner={band}
        state={state}
        disabled={disabled}
        loadingLabel={words.loadingLabel}
        emptyTitle={words.emptyTitle}
        emptyDescription={words.emptyDescription}
        errorTitle={words.errorTitle}
        errorDescription={words.errorDescription}
        {...props}
      />
    </div>
  );
}

PortalConversation.displayName = "PortalConversation";

export { PortalApprovalBand, PortalConversation };
