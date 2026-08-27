/* ============================================================================
   Comments — threaded discussion with mentions (2 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/kwapso-patterns.css, CH22 — "Notifications &
   threads · Every note names a person and a record." Every figure below is
   transcribed, not derived:

     .kw-comment          display: flex; gap: var(--space-2h);          (10)
     .kw-comment__avatar  --avatar-sm (24), pill, --surface-raised,
                            --text-micro, --weight-strong
     .kw-comment__avatar--mango  --surface-brand / --ink-on-accent
     .kw-comment__name    --text-caption, --weight-strong
     .kw-comment__time    --text-badge, --ink-tertiary, tabular-nums
     .kw-comment__body    --text-caption, --leading-normal,
                            margin-top: var(--space-1)
     .kw-mention          inline-block, pill, --surface-brand,
                            --ink-on-accent, padding: 0 var(--space-2),
                            --weight-strong
     .kw-composer         flex, items-center, gap: var(--space-2),
                            --surface-raised, pill,
                            padding: 8 8 8 16  (inline-start 16, rest 8)
     .kw-composer__ghost  --text-caption; t22.css makes it a real input,
                            primary ink with the tertiary moved to
                            ::placeholder (T22-5)
     .kw-composer__send   32 tall, padding-inline 12, pill,
                            --surface-inverse / --ink-on-inverse,
                            --text-badge / --weight-strong
     .kw-notif__dot       7 pill, `margin-top: 0.375rem`, the unread mark
     .kw-notif__mark      --text-badge, --ink-tertiary, the "mark read" control

   design-mothership/specimens/_fragments/t22.css → `.t22-comments { gap:
     var(--space-4) }`, the distance between two comments.
   design-mothership/specimens/kwapso-ui.css → `.kw-empty`, the centred
     register. kwapso-patterns.css CH21 → `.kw-register`, the error register.

   WHAT THE KIT DOES NOT DRAW, AND WHAT WAS DONE — all logged in GAPS-COL2
   · No reply nesting, no `.kw-reply`, no indent. Built: ONE level, indented
     by the row's own geometry (`--avatar-sm` + `--space-2h`), so a reply's
     mark lands under its parent's body. GAPS-COL2 CMT-1.
   · No resolved state. Built: a quiet `Badge` and the actions withdrawn — no
     fill change, because a wash would fight the row hover. CMT-2.
   · No comment actions row. Built: `Button variant="link"` at the badge step.
   · Unread: the kit's own dot is `--danger`. The batch ruling is that poppy
     means BLOCKED only, so the dot here is the neutral ink dot
     (`--foreground`) and the words say it too. CONTRADICTION, CMT-3.

   THE LAW THIS FILE OBEYS
   · THE STACK, THE GAP AND THE TWO REGISTERS ARE `Notes`'. This file does not
     re-draw them: it renders `Notes` in its composed-children mode, which
     supplies `.t22-comments`' `--space-4` column, the `aria-busy`, and both
     of chapter 21's registers already transcribed. What this file adds is the
     threading, the mentions, the actions and the composer.
   · THE MARK IS A PERSON, SO IT IS `Avatar` AT 24. Ruling 30 fixes the three
     mark sizes and `Avatar` enforces the two-initial rule once for the whole
     system. A second circle drawn here would be a second system.
   · THE COMPOSER'S FIELD IS BARE ON PURPOSE. `.kw-composer` IS the pill —
     `--surface-raised` at the pill radius with the inset the kit states. An
     `Input` inside it would draw a SECOND pill and a second hairline, exactly
     the doubling `field.tsx` refuses when it takes the textarea's counter into
     its own footer. The stacked composer, which has room for a real box, uses
     the real `Textarea`.
   · THE SEND CONTROL IS `Button variant="inverse" size="sm"`. That is
     `.kw-composer__send` figure for figure — 32 tall, pill, charcoal fill,
     off-beige label — so no button is hand-rolled here.
   · Focus is ONE global rule (tokens.css §8). Nothing here rings and nothing
     writes `outline: none`; the bare composer input keeps the shared ring.
   · Disabled is a fill and an ink, never an opacity.
   · Every user-facing string is a prop with a default.
   · No product vocabulary (commission §11). People, comments, replies,
     mentions.

   RENDERING CONTEXT
   `"use client"`. `useState` for the uncontrolled composer and for the
   uncontrolled reply text, and handlers created during render.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { ActionRow } from "../action-row/action-row";
import { Avatar, AvatarFallback, AvatarImage } from "../avatar/avatar";
import { Badge } from "../badge/badge";
import { Button } from "../button/button";
import { Notes } from "../notes/notes";
import { Textarea } from "../textarea/textarea";

/* ============================================================================
   The shapes
   ========================================================================= */

/** One `@name` inside a comment. The `@` is part of the text, as the kit draws it. */
export interface CommentMention {
  /** Stable key, and the value handed to `onMentionSelect`. */
  id: string;
  /** What the pill says, `@` and all. The kit's specimen reads `@R. Salis`. */
  label: string;
  /**
   * This mention is of the READER. The one mention in a thread that may take
   * the brand fill without breaking "one mango per view" — see `mentionTone`.
   */
  self?: boolean;
}

/** One action under a comment — reply, resolve, copy a link. */
export interface CommentAction {
  /** Stable key, and the value handed to `onActionSelect`. */
  id: string;
  /** The words. Translatable at the call site, where the verb is known. */
  label: React.ReactNode;
  disabled?: boolean;
}

export interface CommentItem {
  /** Stable id. The React key, and the handle every callback is given. */
  id: string;
  /** Who wrote it. Caption step in Saans Medium, per `.kw-comment__name`. */
  author?: React.ReactNode;
  /**
   * The mark's letters. Derived from `author` when it is a plain string;
   * pass it where the name is a node, or where the two initials are not the
   * first and last word's.
   */
  initials?: string;
  /** A photograph for the mark. `Avatar` falls back to the initials silently. */
  avatarSrc?: string;
  /**
   * When. A node rather than a `Date`: formatting a date is a locale decision
   * and this component must not make one. The kit's specimen reads `12:04`.
   */
  timestamp?: React.ReactNode;
  /** The comment itself. */
  body: React.ReactNode;
  /**
   * The people named in it. Rendered as `.kw-mention` pills on a line under
   * the body, so a reader can see who was called without parsing prose. A
   * mention written INSIDE `body` is the caller's own node and is untouched.
   */
  mentions?: CommentMention[];
  /** The actions under this comment. Drawn only when there are some. */
  actions?: CommentAction[];
  /** Replies to this comment. ONE level; see the breakpoint and CMT-1. */
  replies?: CommentItem[];
  /** Nobody has read this yet: the kit's dot, plus the words in `unreadLabel`. */
  unread?: boolean;
  /** The thread is finished. A quiet `Badge`; the actions are withdrawn. */
  resolved?: boolean;
  /**
   * This comment is the one being answered, or the reader's own. Gives its
   * mark the brand fill. Opt-in and singular by convention — the kit rules
   * one mango per view and no component can enforce that.
   */
  highlight?: boolean;
  /**
   * Written, not yet acknowledged by the server. The row takes the read-only
   * ink and announces `aria-busy`; it is NOT hidden, because a comment that
   * vanishes between pressing send and the server answering reads as a
   * failure.
   */
  pending?: boolean;
  /** It could not be sent. Chapter 9's message under the body: a poppy dot, ink words. */
  failed?: React.ReactNode;
}

/* ----------------------------------------------------------------------------
   Two initials, cut on code points rather than UTF-16 units so a name in a
   script outside the basic plane is not cut through the middle of one. Copied
   in spirit from `notes.tsx`, which cuts the same way for the same reason;
   `Avatar` cuts to two again itself, so this is belt and braces.
   ------------------------------------------------------------------------- */
function initialsOf(name: string | undefined): string {
  if (!name) return "";
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return Array.from(words[0]).slice(0, 2).join("");
  return [words[0], words[words.length - 1]].map((word) => Array.from(word)[0] ?? "").join("");
}

/* ----------------------------------------------------------------------------
   Chapter 9's message, the same mark `field.tsx` draws: a 6 poppy dot leading
   INK words. The kit keeps the drawn 6 rather than snapping to `--dot-status`
   (t9-gaps T9-7) and that is kept here so the two do not diverge.
   ------------------------------------------------------------------------- */
function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 flex items-center gap-2 text-badge text-foreground">
      <span aria-hidden="true" className="size-[0.375rem] shrink-0 rounded-pill bg-destructive" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/* ============================================================================
   Comments
   ========================================================================= */

export interface CommentsProps extends Omit<React.ComponentPropsWithoutRef<"div">, "onSubmit"> {
  /** The thread, in the order it should read. This component never sorts. */
  items?: CommentItem[];

  /* ---- mentions ----------------------------------------------------------- */
  /**
   * `brand` is the kit's own `.kw-mention` — the mango pill with a charcoal
   * label, exactly as drawn, and it is **the DEFAULT**. `quiet` is
   * `--surface-quiet` with secondary ink. `self` gives the brand fill only to
   * a mention OF THE READER.
   *
   * THE DEFAULT WAS `self` AND OVERRIDE 17 RETIRES THE REASON. The old note
   * read: "the kit draws ONE mention in ONE thread, and separately rules
   * 'one mango per view'. A busy thread with five mentions renders five mango
   * pills and the colour stops meaning anything" (GAPS-COL2 CMT-4). That is
   * the exact reading the register overturned on 2026-08-23:
   *
   *     17 · "One mango per screen counts ACTIONS, not objects. One filled
   *          control you can press; any number of non-interactive marks."
   *
   * and its own worked examples are this species — *"CH26.05's three 'Picked'
   * chips stand beside a mango Next, 27.34's unread rows each keep the mango
   * mark"*. A mention names a person; it is a mark, not the view's action.
   * `calendar-view`'s event chip was moved back to `brand` on the same
   * override and for the same sentence; `comments` was the one the sweep did
   * not reach. CH22's page draws the mango pill. CMT-4 is closed by 17.
   *
   * `self` and `quiet` both stay, so an application that wants the quieter
   * thread keeps it with one prop and no fork.
   */
  mentionTone?: "self" | "brand" | "quiet";
  /** A mention was pressed. Without it, mentions render as plain marks, not controls. */
  onMentionSelect?: (mention: CommentMention, comment: CommentItem) => void;

  /* ---- actions ------------------------------------------------------------ */
  /** An action under a comment was pressed. */
  onActionSelect?: (action: CommentAction, comment: CommentItem) => void;
  /** The "mark read" control on an unread comment. Without it, no control is drawn. */
  onMarkRead?: (comment: CommentItem) => void;
  /** That control's words. `.kw-notif__mark` — badge step, tertiary ink. */
  markReadLabel?: string;
  /** What a screen reader hears on an unread comment. The dot never speaks alone. */
  unreadLabel?: string;
  /** The chip on a finished thread. */
  resolvedLabel?: string;

  /* ---- the composer ------------------------------------------------------- */
  /**
   * `inline` is the kit's `.kw-composer`: one pill, a bare field and a
   * charcoal send control. `stacked` is a real `Textarea` with an action row
   * under it, for a comment longer than a line. `none` draws no composer —
   * a read-only thread.
   */
  composer?: "inline" | "stacked" | "none";
  /** Controlled composer value. */
  value?: string;
  /** Uncontrolled starting value. */
  defaultValue?: string;
  /** The composer changed. */
  onValueChange?: (value: string) => void;
  /**
   * Send. Called with the text and, for a reply, the id of the comment being
   * answered. Nothing is cleared by this component when it is controlled; an
   * uncontrolled composer clears itself.
   */
  onSend?: (value: string, replyTo?: string) => void;
  /** The composer's placeholder AND its accessible name. The kit's is "Write a reply". */
  composerPlaceholder?: string;
  /** The send control's label. */
  sendLabel?: string;
  /** The cancel control's label, on the stacked composer and on a reply. */
  cancelLabel?: string;
  /** A message is being sent. The composer goes read-only and the send control spins. */
  sending?: boolean;
  /** Nothing may be written. A fill and an ink on the field, and the control disabled. */
  disabled?: boolean;
  /** The composer cannot be used but the thread still reads. Chapter 9's read-only. */
  readOnly?: boolean;
  /** How many rows the stacked composer starts at. */
  composerRows?: number;

  /* ---- replies ------------------------------------------------------------ */
  /**
   * Which comment's reply composer is open. Controlled; without
   * `onReplyToChange` no reply composer is ever drawn, because a control that
   * silently does nothing is worse than no control.
   */
  replyTo?: string | null;
  /** The reply target changed — a "Reply" action was pressed, or a reply cancelled. */
  onReplyToChange?: (id: string | null) => void;
  /** The words in the reply composer, when they differ from the top-level one. */
  replyPlaceholder?: string;

  /* ---- the three states --------------------------------------------------- */
  /**
   * The thread has not arrived. `Notes` renders the stack with `aria-busy`
   * and NO register: "there are no comments" is a fact that has not been
   * established yet, and flashing it before the data lands says something
   * false. The composer stays, because a reader may write into an empty
   * thread before it finishes loading.
   */
  loading?: boolean;
  /** The thread could not be read. `Notes` draws its register: ink words, one poppy dot. */
  error?: boolean;
  /** The words when there is nothing to show. */
  emptyLabel?: string;
  /** The words when `error` is set. */
  errorLabel?: string;
}

/**
 * A threaded discussion.
 *
 * TEN STATES
 *  1. default        — the kit's comment rows, `--space-4` apart, with the
 *                      composer pill at the end.
 *  2. hover          — the CONTROLS' only. A comment row does not wash under
 *                      the pointer: it is read, not operated, and a whole
 *                      thread that lit up row by row would be noise. The
 *                      actions are `Button variant="link"`, which underlines
 *                      on hover, and the send control is `Button
 *                      variant="inverse"`, which takes `--btn-inverse-hover`.
 *                      Named tokens, never an opacity, never mango.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the control's own radius — the bare composer input
 *                      included, which is why t22.css's own note says nothing
 *                      sets `outline: none` and nothing here does either.
 *  4. active/pressed — the controls' 1px nudge, which `Button` owns. A comment
 *                      is not pressed.
 *  5. disabled       — `disabled`: the composer's field takes `--hair-faint` /
 *                      `--ink-disabled` from `Textarea`'s own skin (and the
 *                      inline pill mirrors it), and the send control takes
 *                      `--btn-disabled-fill` / `--btn-disabled-label`. A fill
 *                      and an ink. A COMMENT is never disabled — it is a thing
 *                      that was written.
 *  6. loading        — two different waits, deliberately separate. `loading`
 *                      is the THREAD arriving: `aria-busy`, no register, no
 *                      skeleton invented over an unknown number of rows.
 *                      `sending` is one MESSAGE in flight: the composer goes
 *                      read-only and the send control keeps its fill and grows
 *                      a spinner (`button.tsx`'s rule). `item.pending` is a
 *                      comment already on screen and not yet acknowledged.
 *  7. empty          — `.kw-empty` through `Notes`: the centred register,
 *                      tertiary ink, with `emptyLabel` — and the composer
 *                      still under it, because an empty thread is exactly
 *                      where someone wants to write.
 *  8. error          — three tiers. The THREAD failing is `Notes`' register:
 *                      ink words with one poppy dot, announced as an alert.
 *                      One COMMENT failing to send is chapter 9's message
 *                      under its body. The composer's own validation belongs
 *                      to the caller and arrives as a `Field`, not here.
 *  9. selected       — does not apply to a comment; the kit draws none and a
 *                      thread is not a chooser. What DOES mark one comment out
 *                      is `highlight` (the brand mark, one per view) and
 *                      `unread` (the neutral dot plus its words) — both are
 *                      meanings, not selection states.
 * 10. read-only      — `readOnly`, or `composer="none"`: the thread reads and
 *                      the composer is withdrawn entirely, which is chapter
 *                      9's rule that a system-set value loses its box applied
 *                      to a whole control (`file-upload.tsx` does the same).
 *
 * THREE BREAKPOINTS
 *  mobile   — the reply indent COLLAPSES TO NOTHING below 40rem and each
 *             reply keeps a rule on its inline-start edge instead. At 320 the
 *             row is already 24 of mark plus 10 of gap; taking another 34 off
 *             the measure leaves a reply about 250 wide, which wraps a normal
 *             sentence to four lines. The rule is the cheapest thing that
 *             still says "this is inside that": it costs one hairline and no
 *             measure at all. The composer stacks its send control under the
 *             field at the same width, so a thumb is not reaching across a
 *             pill for a 32 target.
 *  tablet   — the indent returns at 40rem: `--avatar-sm` + `--space-2h`, so a
 *             reply's own mark lands exactly under its parent's body and the
 *             nesting is legible without a rule.
 *  desktop  — UNCHANGED from tablet. The thread takes its measure from the
 *             parent; a comment does not get wider on a wide screen, because
 *             a 13/1.45 line past about 70 characters is harder to read, not
 *             easier. The parent panel caps it.
 *
 * RTL — safe, with one deliberate change from the kit. `.kw-comment__time`
 * separates itself with `margin-left: var(--space-2h)`, which is physical;
 * here the name and the time are two items in a flex row with a `gap`, so the
 * time follows the name in both directions — the same correction `notes.tsx`
 * makes. The reply indent is `ms-*` (margin-inline-start) and its rule is
 * `border-s`, so both mirror. `.kw-composer`'s asymmetric 16/8 inset is
 * `ps-4 pe-2`, which mirrors too.
 */
const Comments = React.forwardRef<HTMLDivElement, CommentsProps>(
  (
    {
      className,
      items,
      mentionTone = "brand",
      onMentionSelect,
      onActionSelect,
      onMarkRead,
      markReadLabel = "Mark read",
      unreadLabel = "Unread",
      resolvedLabel = "Resolved",
      composer = "inline",
      value,
      defaultValue = "",
      onValueChange,
      onSend,
      composerPlaceholder = "Write a reply",
      sendLabel = "Send",
      cancelLabel = "Cancel",
      sending = false,
      disabled = false,
      readOnly = false,
      composerRows = 3,
      replyTo = null,
      onReplyToChange,
      replyPlaceholder,
      loading = false,
      error = false,
      emptyLabel = "No comments yet",
      errorLabel = "This discussion could not be loaded",
      ...props
    },
    ref,
  ) => {
    const [ownValue, setOwnValue] = React.useState(defaultValue);
    const [ownReplyValue, setOwnReplyValue] = React.useState("");

    const rows = items ?? [];
    const showComposer = composer !== "none" && !readOnly;

    const composerValue = value ?? ownValue;
    const setComposerValue = (next: string) => {
      if (value === undefined) setOwnValue(next);
      onValueChange?.(next);
    };

    const send = (text: string, target?: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0) return;
      onSend?.(trimmed, target);
      if (target === undefined) {
        if (value === undefined) setOwnValue("");
      } else {
        setOwnReplyValue("");
      }
    };

    return (
      <div
        ref={ref}
        data-slot="comments"
        className={cn("flex min-w-0 flex-col gap-4", className)}
        {...props}
      >
        {/* `Notes` supplies the `.t22-comments` column at --space-4, the
            `aria-busy`, and BOTH of chapter 21's registers already
            transcribed. Composed children rather than `items`, because a
            comment carries mentions, actions and replies that a note does
            not — and re-drawing the stack here would be a second system. */}
        <Notes
          loading={loading}
          error={error}
          emptyLabel={emptyLabel}
          errorLabel={errorLabel}
        >
          {rows.length > 0
            ? rows.map((item) => (
                <Comment
                  key={item.id}
                  item={item}
                  depth={0}
                  mentionTone={mentionTone}
                  onMentionSelect={onMentionSelect}
                  onActionSelect={onActionSelect}
                  onMarkRead={onMarkRead}
                  markReadLabel={markReadLabel}
                  unreadLabel={unreadLabel}
                  resolvedLabel={resolvedLabel}
                  replyTo={replyTo}
                  onReplyToChange={onReplyToChange}
                  replyValue={ownReplyValue}
                  onReplyValueChange={setOwnReplyValue}
                  onReplySend={send}
                  replyPlaceholder={replyPlaceholder ?? composerPlaceholder}
                  sendLabel={sendLabel}
                  cancelLabel={cancelLabel}
                  sending={sending}
                  disabled={disabled}
                  composer={composer === "none" ? "inline" : composer}
                />
              ))
            : undefined}
        </Notes>

        {showComposer ? (
          <Composer
            variant={composer === "stacked" ? "stacked" : "inline"}
            value={composerValue}
            onValueChange={setComposerValue}
            onSend={() => {
              send(composerValue);
            }}
            placeholder={composerPlaceholder}
            sendLabel={sendLabel}
            sending={sending}
            disabled={disabled}
            rows={composerRows}
          />
        ) : null}
      </div>
    );
  },
);

Comments.displayName = "Comments";

/* ============================================================================
   One comment — local. A `.kw-comment` outside a thread is meaningless, so it
   is not exported and cannot be misplaced.
   ========================================================================= */

function Comment({
  item,
  depth,
  mentionTone,
  onMentionSelect,
  onActionSelect,
  onMarkRead,
  markReadLabel,
  unreadLabel,
  resolvedLabel,
  replyTo,
  onReplyToChange,
  replyValue,
  onReplyValueChange,
  onReplySend,
  replyPlaceholder,
  sendLabel,
  cancelLabel,
  sending,
  disabled,
  composer,
}: {
  item: CommentItem;
  depth: number;
  mentionTone: "self" | "brand" | "quiet";
  onMentionSelect?: (mention: CommentMention, comment: CommentItem) => void;
  onActionSelect?: (action: CommentAction, comment: CommentItem) => void;
  onMarkRead?: (comment: CommentItem) => void;
  markReadLabel: string;
  unreadLabel: string;
  resolvedLabel: string;
  replyTo: string | null;
  onReplyToChange?: (id: string | null) => void;
  replyValue: string;
  onReplyValueChange: (value: string) => void;
  onReplySend: (value: string, target?: string) => void;
  replyPlaceholder: string;
  sendLabel: string;
  cancelLabel: string;
  sending: boolean;
  disabled: boolean;
  composer: "inline" | "stacked";
}) {
  const initials =
    item.initials ?? (typeof item.author === "string" ? initialsOf(item.author) : "");
  const actions = item.resolved === true ? [] : (item.actions ?? []);
  const replies = item.replies ?? [];
  const answering = replyTo === item.id && onReplyToChange !== undefined;

  return (
    <article
      data-slot="comment"
      data-depth={depth}
      data-unread={item.unread === true ? "" : undefined}
      data-resolved={item.resolved === true ? "" : undefined}
      aria-busy={item.pending === true || undefined}
      /* CH22 draws the comment row `display: flex; gap: 12px`. */
      className="flex min-w-0 gap-3"
    >
      <Avatar
        size="sm"
        shape="pill"
        variant={item.highlight === true ? "brand" : "default"}
        aria-hidden="true"
      >
        {item.avatarSrc !== undefined ? <AvatarImage src={item.avatarSrc} alt="" /> : null}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* The name and the time. A WRAPPING flex row with a gap, not the
            kit's `margin-left`, so the time follows the name in Arabic, Urdu
            and Persian too — the correction `notes.tsx` already makes. */}
        {/* BASELINE, as drawn: `align-items: baseline; gap: 10px`. The name
            and the time are two type steps and they line up on their feet,
            which is what `notes.tsx` and `ticket-thread.tsx` already do. */}
        <div className="flex flex-wrap items-baseline gap-[var(--space-2h)]">
          {item.unread === true ? (
            <span className="inline-flex items-center gap-2">
              {/* `.kw-notif__dot`, at `--dot-status`. NOT poppy: the batch
                  ruling is that poppy means blocked only, so this is the
                  neutral ink dot. Logged as CMT-3. And the words are beside
                  it, because a dot never carries meaning alone (ruling 26).

                  `--foreground`, NOT `--dot-building`. The two are the same
                  charcoal in light, but `--dot-building` is the "in build" /
                  "with us" STAGE dot, and ruling 26's dark clause makes it
                  charcoal on dark so it can be read against the accent fill
                  of the pill it lives in. This dot sits bare on an unlit
                  panel, where charcoal is invisible; a neutral ink dot flips
                  with the palette, which is what it always meant. */}
              <span
                aria-hidden="true"
                className="size-[var(--dot-status)] shrink-0 rounded-pill bg-foreground"
              />
              <span className="sr-only">{unreadLabel}</span>
            </span>
          ) : null}

          {item.author !== undefined ? (
            <span
              data-slot="comment-author"
              className="text-caption font-[var(--font-weight-medium)]"
            >
              {item.author}
            </span>
          ) : null}

          {item.timestamp !== undefined ? (
            <span
              data-slot="comment-time"
              className="text-badge tabular-nums text-ink-tertiary"
            >
              {item.timestamp}
            </span>
          ) : null}

          {item.resolved === true ? <Badge>{resolvedLabel}</Badge> : null}

          {item.unread === true && onMarkRead !== undefined ? (
            /* `.kw-notif__mark` — badge step, tertiary ink, no box.
               `Button variant="link"` is that, and it keeps the ring. */
            <Button
              type="button"
              variant="link"
              className="ms-auto text-badge text-ink-tertiary"
              onClick={() => {
                onMarkRead(item);
              }}
            >
              {markReadLabel}
            </Button>
          ) : null}
        </div>

        {/* `.kw-comment__body` — caption at the normal leading, --space-1 down.
            Pending takes the read-only ink; it is NOT hidden and NOT dimmed
            with an opacity. */}
        <div
          data-slot="comment-body"
          className={cn(
            "mt-1 min-w-0 text-caption leading-[var(--leading-normal)]",
            item.pending === true && "text-ink-secondary",
          )}
        >
          {item.body}
        </div>

        {item.mentions !== undefined && item.mentions.length > 0 ? (
          <ul className="mt-1 flex flex-wrap items-center gap-1">
            {item.mentions.map((mention) => (
              <li key={mention.id}>
                <Mention
                  mention={mention}
                  tone={mentionTone}
                  onSelect={
                    onMentionSelect === undefined
                      ? undefined
                      : () => {
                          onMentionSelect(mention, item);
                        }
                  }
                />
              </li>
            ))}
          </ul>
        ) : null}

        {item.failed !== undefined && item.failed !== null ? (
          <Problem>{item.failed}</Problem>
        ) : null}

        {actions.length > 0 ? (
          <div data-slot="comment-actions" className="mt-2 flex flex-wrap items-center gap-3">
            {actions.map((action) => (
              <Button
                key={action.id}
                type="button"
                variant="link"
                disabled={action.disabled}
                className="text-badge text-ink-tertiary"
                onClick={() => {
                  onActionSelect?.(action, item);
                }}
              >
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}

        {answering ? (
          <div className="mt-3">
            <Composer
              variant={composer}
              value={replyValue}
              onValueChange={onReplyValueChange}
              onSend={() => {
                onReplySend(replyValue, item.id);
              }}
              onCancel={() => {
                onReplyToChange?.(null);
              }}
              cancelLabel={cancelLabel}
              placeholder={replyPlaceholder}
              sendLabel={sendLabel}
              sending={sending}
              disabled={disabled}
              rows={3}
              autoFocus
            />
          </div>
        ) : null}

        {replies.length > 0 ? (
          /* ONE level. Below 40rem the indent collapses and a hairline on the
             inline-start edge carries the nesting instead — the measure is
             worth more than the indent on a 320 screen. `ms-*` and `--hairline-start`
             are both on the inline axis, so nothing is written by side. */
          <div
            data-slot="comment-replies"
            className={cn(
              "mt-4 flex min-w-0 flex-col gap-4",
              /* The reply indent's rule — an inset shadow on the inline
                 start, never a `border` (review 1A · fix 2). */
              "shadow-[var(--hairline-start)] ps-[var(--space-3)]",
              "sm:ms-[calc(var(--avatar-sm)+var(--space-2h))] sm:shadow-none sm:ps-0",
            )}
          >
            {replies.map((reply) => (
              <Comment
                key={reply.id}
                item={{ ...reply, replies: undefined }}
                depth={depth + 1}
                mentionTone={mentionTone}
                onMentionSelect={onMentionSelect}
                onActionSelect={onActionSelect}
                onMarkRead={onMarkRead}
                markReadLabel={markReadLabel}
                unreadLabel={unreadLabel}
                resolvedLabel={resolvedLabel}
                replyTo={replyTo}
                onReplyToChange={onReplyToChange}
                replyValue={replyValue}
                onReplyValueChange={onReplyValueChange}
                onReplySend={onReplySend}
                replyPlaceholder={replyPlaceholder}
                sendLabel={sendLabel}
                cancelLabel={cancelLabel}
                sending={sending}
                disabled={disabled}
                composer={composer}
              />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

/* ----------------------------------------------------------------------------
   `.kw-mention`, transcribed: an inline-block pill at `padding: 0 var(--space-2)`
   in weight 500. The kit's fill is `--surface-brand` with `--ink-on-accent`;
   the quiet twin is `--surface-quiet` with secondary ink, which is the
   `.kw-badge` base. Which of the two a mention gets is `mentionTone`'s
   decision and is argued in that prop's own comment.
   ------------------------------------------------------------------------- */
function Mention({
  mention,
  tone,
  onSelect,
}: {
  mention: CommentMention;
  tone: "self" | "brand" | "quiet";
  onSelect?: () => void;
}) {
  const brand = tone === "brand" || (tone === "self" && mention.self === true);
  const classes = cn(
    "inline-block rounded-pill px-2 text-caption font-[var(--font-weight-medium)]",
    brand ? "bg-surface-brand text-ink-on-accent" : "bg-surface-quiet text-ink-secondary",
  );

  if (onSelect === undefined) {
    return (
      <span data-slot="comment-mention" data-brand={brand ? "" : undefined} className={classes}>
        {mention.label}
      </span>
    );
  }

  return (
    <button
      type="button"
      data-slot="comment-mention"
      data-brand={brand ? "" : undefined}
      onClick={onSelect}
      className={cn(
        classes,
        "cursor-pointer border-0",
        // A hover is a named token, never an opacity and never mango — mango
        // is already this pill's FILL in the brand case, so the shift there
        // is to the pressed brand tone the button family already defines.
        brand
          ? "hover:bg-[var(--btn-primary-hover)]"
          : "hover:bg-[var(--btn-cancel-hover)]",
        "transition-colors duration-[var(--duration-colour)] ease-kwapso",
      )}
    >
      {mention.label}
    </button>
  );
}

/* ----------------------------------------------------------------------------
   The composer, in the kit's two shapes.

   INLINE is `.kw-composer` figure for figure: one pill in `--surface-raised`
   at the 8/8/8/16 inset, a BARE field, and `.kw-composer__send` — which is
   `Button variant="inverse" size="sm"` exactly (32 tall, pill, charcoal fill,
   off-beige label at the badge step in weight 500). The field is bare because
   the pill around it IS the field's box; an `Input` here would draw a second
   pill inside the first.

   STACKED is a real `Textarea` with an `ActionRow`-shaped footer, for a
   comment longer than a line. It uses the primitive because there IS room for
   a box here, and a hand-rolled multi-line field would be a second drawing of
   chapter 9.
   ------------------------------------------------------------------------- */
function Composer({
  variant,
  value,
  onValueChange,
  onSend,
  onCancel,
  cancelLabel,
  placeholder,
  sendLabel,
  sending,
  disabled,
  rows,
  autoFocus,
}: {
  variant: "inline" | "stacked";
  value: string;
  onValueChange: (value: string) => void;
  onSend: () => void;
  onCancel?: () => void;
  cancelLabel?: string;
  placeholder: string;
  sendLabel: string;
  sending: boolean;
  disabled: boolean;
  rows: number;
  autoFocus?: boolean;
}) {
  const frozen = disabled || sending;

  if (variant === "stacked") {
    return (
      <div data-slot="comment-composer" data-variant="stacked" className="flex min-w-0 flex-col gap-3">
        <Textarea
          rows={rows}
          value={value}
          placeholder={placeholder}
          aria-label={placeholder}
          disabled={disabled}
          loading={sending}
          autoFocus={autoFocus}
          onChange={(event) => {
            onValueChange(event.currentTarget.value);
          }}
        />
        {/* End-aligned, primary last — the settled footer ruling, and the
            reversed column below 40rem so a thumb reaches the commit control
            while it stays LAST in the DOM. `ActionRow` already encodes all of
            that; nothing is redrawn here. */}
        <ActionRow align="end">
          {onCancel !== undefined ? (
            <Button type="button" variant="cancel" disabled={frozen} onClick={onCancel}>
              {cancelLabel}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="inverse"
            loading={sending}
            disabled={disabled || value.trim().length === 0}
            onClick={onSend}
          >
            {sendLabel}
          </Button>
        </ActionRow>
      </div>
    );
  }

  return (
    <div
      data-slot="comment-composer"
      data-variant="inline"
      /* `.kw-composer`. Below 40rem it becomes a column so the 32 send
         control spans the row instead of being a small target at the far
         end of a pill — the same reasoning the footer ruling uses. A column
         wants the box radius, not the pill: a pill round a two-line block
         bulges. */
      className={cn(
        /* The comment thread's own composer is drawn at `gap: 12px`. (The
           chapter's OTHER composer, the one carrying an attach glyph, draws
           8 — that one is `ticket-thread`'s.)

           THE HAIRLINE IS LOAD-BEARING, measured on a phone in the dark
           palette (25 Aug 2026): `--surface-raised` there sits one step off
           the panel, so the pill vanished and the reader saw a bare
           placeholder floating over a dead Send — "the conversation section
           is completely broken". The field is real; nothing said so. The 20%
           ring is the same tier the thread's own dividers use. */
        "flex min-w-0 flex-col gap-3 rounded-[var(--radius)] bg-surface-raised p-2",
        "shadow-[var(--hairline-strong)]",
        "sm:flex-row sm:items-center sm:rounded-pill sm:ps-4 sm:pe-2 sm:py-2",
        frozen && "bg-hair-faint",
      )}
    >
      {/* `input.kw-composer__ghost` (t22.css): the UA chrome reset, typed text
          at primary ink, the tertiary moved to ::placeholder. Bare on purpose
          — see the block comment above. tokens.css §8 still rings it. */}
      <input
        type="text"
        data-slot="comment-composer-field"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        disabled={disabled}
        readOnly={sending}
        aria-busy={sending || undefined}
        autoFocus={autoFocus}
        onChange={(event) => {
          onValueChange(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (!frozen) onSend();
          }
        }}
        className={cn(
          "min-w-0 flex-1 appearance-none border-0 bg-transparent p-0",
          "text-caption text-foreground placeholder:text-ink-tertiary",
          // A fill and an ink, never an opacity. The pill above carries the
          // fill; the field carries the ink.
          "disabled:cursor-not-allowed disabled:text-ink-disabled",
        )}
      />
      <Button
        type="button"
        variant="inverse"
        size="sm"
        loading={sending}
        disabled={disabled || value.trim().length === 0}
        className="w-full sm:w-auto"
        onClick={onSend}
      >
        {sendLabel}
      </Button>
    </div>
  );
}

export { Comments };
