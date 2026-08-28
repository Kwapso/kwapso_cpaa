"use client";

/* ============================================================================
   Chat — the message thread: both sides, composer, attachments
   (0 direct call sites; the shape 3 other collections are drawn from).

   DESIGN SOURCE
   `design-mothership/specimens/kwapso-patterns.css` → `.kw-thread`, `.kw-msg`,
   `.kw-msg__bubble`, `.kw-msg--theirs`, `.kw-msg--mine`, `.kw-msg__receipt`,
   `.kw-comment__avatar`, `.kw-composer`, `.kw-composer__ghost`,
   `.kw-composer__send`; plus `_fragments/t22.css` →
   `.kw-msg__bubble--media` and `.kw-msg__media`, and the decisions in
   `_fragments/t22-gaps.md` (T22-1, T22-3, T22-5).

   The controlling text is RULING 36, quoted in full because it settles the
   whole component and supersedes the drawn chapter 22 specimen:

       "The 'no alternating sides' sentence described something the kit never
        drew. Threads are yours-right on the charcoal fill, theirs-left on
        paper, avatars outside, 62% maximum width. The ban stands on tails,
        scrims and gradients only."

   The kit's own appendix rule settles which wins: "Where a ruling contradicts
   an older page, the ruling wins." The drawn chapter 22 specimen (mango-right
   / card-left at 78% with no avatars) is therefore NOT built. Recorded again
   in GAPS-COL1 CH-1 so nobody re-opens it.

   Figures kept verbatim:
     · thread    — column, gap 10 (`--space-2h`)
     · message   — flex, gap 8, `align-items: flex-end`, `max-width: 62%`
     · bubble    — box radius, inset 12/16, caption at `--leading-normal`
     · mine      — `--surface-inverse` fill, `--ink-on-inverse` ink, reversed
     · theirs    — `--surface-raised` fill
     · receipt   — micro, `--ink-disabled`, tabular, inline-end inset 6
     · media     — bubble inset steps to 6, block 13rem at 4/3, radius stepped
                   in by the same 6 so the corners stay concentric
     · composer  — `--surface-raised`, pill, inset 8 with 16 at the inline
                   start; send is `--surface-inverse` at the dense height

   THE LAW THIS FILE OBEYS
   · Ruling 36, above: sides, fills, avatars outside, 62%. No tails, no
     scrims, no gradients — and none is drawn here.
   · A pill is a person at 24 / 32 / 48 with `flex: none` (ruling 30). The
     thread's mark is 24, `Avatar size="sm"`, outside the bubble.
   · White type on an accent is a rejection. The charcoal bubble carries
     `--ink-on-inverse`, which is off-beige on charcoal in light and charcoal
     on off-beige in dark — a token flip, not a second drawing.
   · Focus is one global rule (tokens.css §8). The composer field, the send
     control and any attachment link are all real controls and take it.
   · Every user-facing string is a prop with a default, including the two the
     screen reader hears and the eye never does.

   RENDERING CONTEXT
   `"use client"` — the composer holds a submit handler and a key handler
   created during this module's own render.
   ========================================================================= */

import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../avatar/avatar";
import { Button } from "../button/button";
import { Image } from "../image/image";
import { Skeleton } from "../skeleton/skeleton";
import { Textarea } from "../textarea/textarea";
import { CollectionRegister } from "../collection-frame/collection-frame";
import { Paperclip } from "../../foundations/icons";

/* ----------------------------------------------------------------------------
   The bubble. Two fills, one shape — the whole of ruling 36's colour half.
   ------------------------------------------------------------------------- */
const bubbleVariants = cva(
  [
    // Box radius, the kit's 12/16 inset, caption at prose leading.
    "rounded-[var(--radius)] px-4 py-3",
    "text-caption leading-[var(--leading-normal)]",
    // A bubble holds pasted links and unbreakable strings.
    "min-w-0 break-words",
  ],
  {
    variants: {
      side: {
        /** `.kw-msg--theirs .kw-msg__bubble` — paper. */
        theirs: "bg-card text-card-foreground",
        /** `.kw-msg--mine .kw-msg__bubble` — the charcoal fill. Ruling 36. */
        mine: "bg-surface-inverse text-ink-on-inverse",
      },
      /**
       * `.kw-msg__bubble--media` — the inset steps down so a media block
       * reads edge to edge inside the bubble's own radius.
       */
      media: { true: "p-[var(--space-1h)]", false: "" },
    },
    defaultVariants: { side: "theirs", media: false },
  },
);

export interface ChatAttachment {
  /** Stable key. */
  id: string;
  /** What it is called. Shown for a file, used as the picture's alt when none is given. */
  name: string;
  /** A picture sits in its own bubble on the sender's side (ruling 36). */
  src?: string;
  /** Alternative text, where the name is not a description. */
  alt?: string;
  /** A size, a page count, a duration — whatever the caller wants under the name. */
  meta?: React.ReactNode;
  /** Opening it. Given, the file row becomes a real link. */
  href?: string;
}

export interface ChatMessage {
  /** Stable key. Never an array index — a thread appends. */
  id: string;
  /** Yours (right, charcoal) or theirs (left, paper). Ruling 36. */
  mine?: boolean;
  /** The body. A node, so a mention pill or a link can ride inside it. */
  body?: React.ReactNode;
  /** Who said it, for the mark's accessible name and the optional name line. */
  author?: string;
  /** Two characters. Ruling 30: never three, never a photograph as initials. */
  initials?: React.ReactNode;
  /** A photograph on the mark. Falls back to the initials silently. */
  avatarSrc?: string;
  /** One mark per view may take mango (ruling 30). Opt in per message. */
  avatarVariant?: "default" | "inverse" | "brand" | "quiet";
  /** When, already formatted by the caller. Ruling 07 — format follows the app language. */
  time?: React.ReactNode;
  /** Machine-readable instant for `<time datetime>`. */
  dateTime?: string;
  /** Pictures and files. Each gets its own bubble, on the sender's side. */
  attachments?: ChatAttachment[];
  /** The line under the last of your messages — "read 12:09". Yours only. */
  receipt?: React.ReactNode;
  /** This message failed to send. Poppy ink on the receipt line, and the words say so. */
  failed?: boolean;
}

export interface ChatProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onSubmit" | "onChange"> {
  /** The thread, OLDEST FIRST — a thread reads down, unlike a history. */
  messages?: ChatMessage[];
  /** Draw the 24 marks outside the bubbles. Ruling 36 says yes; off for a two-party thread. */
  avatars?: boolean;
  /** Draw the author's name over the first bubble of a run. Off: ruling 36 draws no name line. */
  authorNames?: boolean;

  /* -- composer ------------------------------------------------------- */
  /** Mount the composer. Off for a read-only thread. */
  composer?: boolean;
  /** Controlled draft. */
  value?: string;
  /** Uncontrolled starting draft. */
  defaultValue?: string;
  /** Fires on every keystroke. */
  onValueChange?: (value: string) => void;
  /** Fires on send — the button, or Enter without a modifier. */
  onSend?: (value: string) => void;
  /** Grow the composer to the box radius and let it wrap. */
  multiline?: boolean;
  /** The composer cannot be typed in. A fill and an ink, never an opacity. */
  disabled?: boolean;
  /** A send is in flight. The control keeps its fill and grows a spinner. */
  sending?: boolean;
  /** Ghost text in the composer. `.kw-composer__ghost` is tertiary ink. */
  placeholder?: string;
  /** The send control's label. */
  sendLabel?: string;
  /** The receipt line on a message that failed to send. Poppy ink says it too. */
  sendFailedLabel?: string;
  /** Accessible name for the composer field, where no visible label sits over it. */
  composerLabel?: string;
  /** Extra controls beside send — an attach button, an emoji picker. */
  composerActions?: React.ReactNode;

  /* -- registers ------------------------------------------------------ */
  /** The thread has not arrived. Cold cache only. */
  loading?: boolean;
  /** How many placeholder rows to draw while `loading`. */
  loadingRows?: number;
  /** The thread failed to load. Beats `empty`. */
  error?: boolean;
  loadingState?: React.ReactNode;
  emptyState?: React.ReactNode;
  errorState?: React.ReactNode;
  loadingLabel?: string;
  emptyLabel?: string;
  emptyBody?: string;
  errorLabel?: string;
  errorBody?: string;
  /** Accessible name for the thread region. */
  label?: string;
}

/** One attachment. Local; a thread's parts are never addressable from outside. */
function Attachment({
  attachment,
  side,
}: {
  attachment: ChatAttachment;
  side: "mine" | "theirs";
}) {
  if (attachment.src) {
    return (
      <div className={cn(bubbleVariants({ side, media: true }))}>
        {/* `.kw-msg__media` — 13rem at 4/3, radius stepped in by the bubble's
            own 6 so the two corners stay concentric. */}
        <Image
          src={attachment.src}
          alt={attachment.alt ?? attachment.name}
          ratio="4 / 3"
          className="w-[13rem] max-w-full rounded-[calc(var(--radius)-var(--space-1h))]"
        />
      </div>
    );
  }

  const inner = (
    <span className="flex min-w-0 items-center gap-2">
      <Paperclip aria-hidden="true" className="size-[var(--icon-16)] shrink-0" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{attachment.name}</span>
        {attachment.meta === undefined || attachment.meta === null ? null : (
          <span className="text-micro tabular-nums">{attachment.meta}</span>
        )}
      </span>
    </span>
  );

  return attachment.href ? (
    <a
      href={attachment.href}
      className={cn(
        bubbleVariants({ side }),
        "underline decoration-hair-strong underline-offset-[0.1875rem]",
        "transition-colors duration-[var(--duration-colour)] ease-kwapso",
        "hover:decoration-current",
      )}
    >
      {inner}
    </a>
  ) : (
    <div className={cn(bubbleVariants({ side }))}>{inner}</div>
  );
}

/** One message: mark outside, bubbles inside, receipt under. Local. */
function Message({
  message,
  avatars,
  authorNames,
  failedLabel,
}: {
  message: ChatMessage;
  avatars: boolean;
  authorNames: boolean;
  failedLabel: string;
}) {
  const side: "mine" | "theirs" = message.mine ? "mine" : "theirs";

  return (
    <div
      data-slot="chat-message"
      data-side={side}
      className={cn(
        // `align-items: flex-start; gap: 10px` — CH19 view 16 levels the 24
        // mark with the TOP of the bubble, and states the mark-to-bubble
        // measure as 10 (CH22's thread draws no avatars, so view 16 is the
        // artifact's ONE statement of it). The row was hanging the mark off
        // the bottom at 8.
        //
        // THE 62% CAP IS ON THE BUBBLE COLUMN, NOT ON THIS ROW. The artifact
        // puts `max-width: 62%` on the column that holds the bubble and the
        // receipt — a SIBLING of the 24 mark. Capping the row instead spent
        // 24 of mark and 10 of gap out of the bubble's own 62%.
        "flex min-w-0 items-start gap-[var(--space-2h)]",
        // `.kw-msg--mine` reverses the row so the mark lands outside on the end.
        side === "mine" ? "flex-row-reverse self-end" : "self-start",
        // Below `sm:` a 62% cap leaves a bubble too narrow to read; see the
        // breakpoint note on `Chat`.
      )}
    >
      {avatars ? (
        <Avatar
          size="sm"
          variant={message.avatarVariant ?? (message.mine ? "brand" : "default")}
          className="mb-1"
        >
          {message.avatarSrc ? (
            <AvatarImage src={message.avatarSrc} alt={message.author ?? ""} />
          ) : null}
          <AvatarFallback aria-label={message.author}>{message.initials}</AvatarFallback>
        </Avatar>
      ) : null}

      <div
        className={cn(
          // Ruling 36's 62%, on the box the artifact puts it on. Below `sm:`
          // a 62% cap leaves a bubble too narrow to read; see the breakpoint
          // note on `Chat`.
          "flex max-w-[62%] min-w-0 flex-col gap-1 max-sm:max-w-[85%]",
          side === "mine" ? "items-end" : "items-start",
        )}
      >
        {authorNames && message.author ? (
          <span className="text-caption font-[var(--font-weight-medium)]">{message.author}</span>
        ) : null}

        {message.body === undefined || message.body === null ? null : (
          <div className={cn(bubbleVariants({ side }))}>{message.body}</div>
        )}

        {message.attachments?.map((attachment) => (
          <Attachment key={attachment.id} attachment={attachment} side={side} />
        ))}

        {message.time === undefined && message.receipt === undefined && !message.failed ? null : (
          <span
            data-slot="chat-receipt"
            className={cn(
              // `.kw-msg__receipt` — micro, tabular, 6 of inline-end inset
              // so it sits under the bubble's own corner.
              /* `--fg4` IS TERTIARY, NOT DISABLED. The artifact's own root declares
                 `--fg3` and `--fg4` at the SAME value — #5f5d59 light, #bdb9b1 dark —
                 which is ruling 27 folding the old quiet grey into tertiary, and CH01
                 states the consequence in one line: "#a8a59f now means disabled and
                 nothing else." `.kw-msg__receipt`'s "disabled ink" is a mothership-CSS
                 reading of a tier that no longer exists. A receipt is a readable line, so
                 it takes the tertiary ink and stays inside the contrast budget. */
              "pe-[var(--space-1h)] text-micro tabular-nums",
              message.failed ? "text-destructive-ink" : "text-ink-tertiary",
            )}
          >
            {message.failed ? failedLabel : (message.receipt ?? null)}
            {message.time !== undefined && !message.failed ? (
              <time dateTime={message.dateTime}>{message.time}</time>
            ) : null}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * A message thread.
 *
 * TEN STATES
 *  1. default        — a column of bubbles, yours right on charcoal, theirs
 *                      left on paper, marks outside, capped at 62%.
 *  2. hover          — does not apply to a bubble. A message is not a target;
 *                      the kit draws no hovered bubble and a thread whose
 *                      every line lit up would twinkle as you read it. An
 *                      attachment LINK hovers, as a link does: its underline
 *                      moves to the current ink. Logged as GAPS-COL1 CH-4.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the control's own radius. The composer field, the
 *                      send control and an attachment link are all real
 *                      controls and are reached by keyboard already.
 *  4. active/pressed — belongs to the send control, which nudges 1 hairline
 *                      like every other Button. A bubble has no press.
 *  5. disabled       — `disabled` on the composer: the field takes the
 *                      disabled skin (`--surface-quiet` / `--ink-disabled`)
 *                      and the send control takes `--btn-disabled-fill` and
 *                      `--btn-disabled-label`. A fill and an ink, never an
 *                      opacity. The THREAD is never disabled — a conversation
 *                      you may not add to is a read-only thread, which is
 *                      `composer={false}`.
 *  6. loading        — two different waits, and they are not the same
 *                      picture. `loading` is the THREAD arriving: skeleton
 *                      rows, cold cache only. `sending` is a message in
 *                      flight: the composer keeps its fill and the send
 *                      control grows a spinner, exactly as `button.tsx`
 *                      draws a submitting control.
 *  7. empty          — no messages: the quiet register, and the composer
 *                      stays mounted. A thread you can start is not the same
 *                      thing as a thread that is missing, and hiding the
 *                      composer would remove the one next step.
 *  8. error          — two, again. `error` is the thread failing to load:
 *                      the register, poppy dot, its own wording. A single
 *                      message failing to send is `message.failed`, which
 *                      puts poppy ink and the words on that message's receipt
 *                      line — the dot never carries the meaning alone
 *                      (ruling 26).
 *  9. selected       — the kit draws no selected message. Not invented;
 *                      logged as GAPS-COL1 CH-5.
 * 10. read-only      — `composer={false}`. The thread renders unchanged; only
 *                      the way in is gone. This is the honest read-only: a
 *                      greyed-out composer implies it might come back.
 *
 * THREE BREAKPOINTS
 *  · mobile (base) — the 62% cap is RELAXED to 85%. 62% of a 320 viewport is
 *    198 minus the 24 mark and the gap, which is about 22 characters a line;
 *    ruling 36 states 62% as a MAXIMUM and a phone is the width where that
 *    maximum stops being readable. The composer stays a single row and its
 *    send control keeps the 32 dense height, so the whole bar clears a 44
 *    touch row without growing.
 *  · tablet (`sm:`, 40rem) — the drawn state: 62% cap, marks outside.
 *  · desktop — UNCHANGED from tablet. The cap is a percentage, so the thread
 *    keeps its measure as the column grows and never runs a bubble the full
 *    width of a wide screen.
 *
 * RTL — safe, and unused: the system is LTR only. Sides are `self-start` and
 * `self-end` on the inline axis, the reversal is `flex-row-reverse`, and the
 * receipt's inset is `pe-*` (padding-inline-end). Nothing names a side.
 */
const Chat = React.forwardRef<HTMLDivElement, ChatProps>(
  (
    {
      className,
      messages,
      avatars = true,
      authorNames = false,
      composer = true,
      value,
      defaultValue,
      onValueChange,
      onSend,
      multiline = false,
      disabled = false,
      sending = false,
      placeholder = "Write a message…",
      sendLabel = "Send",
      sendFailedLabel = "Not sent",
      composerLabel = "Message",
      composerActions,
      loading = false,
      loadingRows = 4,
      error = false,
      loadingState,
      emptyState,
      errorState,
      loadingLabel = "Loading messages…",
      emptyLabel = "No messages yet",
      emptyBody = "Start the conversation below.",
      errorLabel = "Messages unavailable",
      errorBody = "We can’t show this right now. Try again in a moment.",
      label,
      ...props
    },
    ref,
  ) => {
    const list = messages ?? [];

    /* Exclusive states resolved in JS (PATTERN §4): loading beats error beats
       empty. A request in flight has not failed; a request that failed has
       not come back empty. */
    const state = loading ? "loading" : error ? "error" : list.length === 0 ? "empty" : "default";

    /* The draft. Controlled when `value` is passed, uncontrolled otherwise —
       the same contract every field in this system keeps. */
    const [draft, setDraft] = React.useState(defaultValue ?? "");
    const text = value ?? draft;

    const write = (next: string) => {
      if (value === undefined) setDraft(next);
      onValueChange?.(next);
    };

    const send = () => {
      if (disabled || sending) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      onSend?.(trimmed);
      if (value === undefined) setDraft("");
    };

    return (
      <div
        ref={ref}
        data-slot="chat"
        data-state={state}
        aria-busy={loading || undefined}
        aria-label={label}
        className={cn("flex min-w-0 flex-col gap-4", className)}
        {...props}
      >
        {/* `.kw-thread` — the column, at the kit's 10 gap. */}
        <div data-slot="chat-thread" className="flex min-w-0 flex-col gap-[var(--space-2h)]">
          {state === "loading"
            ? (loadingState ?? (
                <Skeleton variant="list" lines={loadingRows} label={loadingLabel} />
              ))
            : null}

          {state === "error"
            ? (errorState ?? (
                <CollectionRegister tone="error" eyebrow={errorLabel} body={errorBody} />
              ))
            : null}

          {state === "empty"
            ? (emptyState ?? (
                <CollectionRegister tone="quiet" eyebrow={emptyLabel} body={emptyBody} />
              ))
            : null}

          {state === "default"
            ? list.map((message) => (
                <Message
                  key={message.id}
                  message={message}
                  avatars={avatars}
                  authorNames={authorNames}
                  failedLabel={sendFailedLabel}
                />
              ))
            : null}
        </div>

        {composer ? (
          <div
            data-slot="chat-composer"
            /* `.kw-composer` — raised paper, pill, 8 of inset with **18** at
               the inline start. CH19 view 16's own drawn value is
               `padding: 8px 8px 8px 18px`; this read `ps-4` (16) until
               2026-08-24, which is a ladder step and not the chapter's — 18
               is `--space-4h`, one of ruling 28's four half-steps, and the
               kit reaches for it deliberately here so the ghost text clears
               the pill's own curve. A multiline composer steps to the box
               radius, because a pill that has grown three lines tall is a
               stadium. */
            className={cn(
              "flex min-w-0 items-end gap-2 bg-card ps-[var(--space-4h)] pe-2 py-2",
              multiline ? "rounded-[var(--radius)]" : "rounded-pill",
            )}
          >
            {/* The kit draws `.kw-composer__ghost` as static text; t22-gaps
                T22-5 turns it into a real control and resets the chrome the
                shell already provides. The shell IS the field's box here, so
                the field itself draws no second box — that is the reset, and
                it is a call-site override of the primitive, not a fork of it. */}
            <Textarea
              aria-label={composerLabel}
              placeholder={placeholder}
              value={text}
              disabled={disabled}
              rows={1}
              onChange={(event) => write(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !multiline) {
                  event.preventDefault();
                  send();
                }
              }}
              autoGrow
              className={cn(
                /* `shadow-none` for `agent-chat.tsx`'s reason, said once
                   there and true here: `border-0` does not reach the
                   Textarea's resting hairline, which is a box-shadow. Two
                   composers in one kit do not get two answers. */
                "min-h-[var(--control-height-dense)] flex-1 resize-none border-0 bg-transparent shadow-none",
                /* SYMMETRIC BLOCK PADDING, not `p-0`. A textarea sets its first
                   line at the TOP of its box, so a field held open by
                   `min-h` parks one line high with all the slack underneath —
                   which is what put this placeholder off its centre. Padding
                   centres it by construction at one line and travels with the
                   text as it grows; `items-end` on the pill was always right
                   FOR A COMPOSER THAT GROWS and only looked wrong because this
                   one did not. */
                "px-0 py-[var(--space-1h)]",
                "text-caption leading-[var(--leading-normal)]",
                /* The cap belongs to the multiline shape; a single-line
                   composer stops at one line because that is all its content
                   is. `autoGrow` reads this back and scrolls at the clamp. */
                multiline ? "max-h-[9rem]" : "max-h-[var(--control-height-input)]",
              )}
            />

            {composerActions}

            <Button
              type="button"
              variant="inverse"
              size="sm"
              disabled={disabled}
              loading={sending}
              onClick={send}
            >
              {/* THE WORD, not the glyph. Both artifact drawings of a thread
                  composer put "Send" on the control at 12 / 500; the only
                  glyph-only send in the system is 27.9's round Post on the
                  ACTIVITY LOG, which is a different composer. */}
              {sendLabel}
            </Button>
          </div>
        ) : null}
      </div>
    );
  },
);

Chat.displayName = "Chat";

export { Chat, bubbleVariants as chatBubbleVariants };
