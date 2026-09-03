/* ============================================================================
   TicketThread — the client-facing conversation (1 direct call site).

   A NAMING CONTRADICTION IN THE COMMISSION, LOGGED NOT RESOLVED
   Commission §11 rules: "Tiers 0–2 carry no product vocabulary. No component
   may be named or documented in terms of tickets, sprints, accounts or
   clients. `List`, not `TicketList`." Commission §7 then requires this exact
   folder and this exact export: "`ticket-thread` | `TicketThread` | the
   client-facing conversation | 1". Both sentences are the commission's.

   The export name wins, because §2 rule 2 is the delivery contract — the name
   is already written into a call site and renaming it breaks the build, which
   is the one failure this commission exists to prevent. Everything the NAME
   does not force is generic: no prop, no type, no default string and no
   comment below this block says "ticket". A message has an `author`, a
   `side`, an `internal` flag and `attachments`; it does not have a
   requester, an agent or a case. The full entry, with both sections quoted,
   is GAPS-COL3 TCK-1.

   DESIGN SOURCE
   design-mothership/specimens/kwapso-patterns.css → CH22 "Notifications &
   threads": `.kw-thread`, `.kw-msg`, `.kw-msg__bubble`, `.kw-msg--theirs`,
   `.kw-msg--mine`, `.kw-msg__receipt`, `.kw-comment__avatar`, `.kw-composer`,
   `.kw-composer__ghost`, `.kw-composer__send`, `.kw-mention`. Figure for
   figure:

     · thread   — `display:flex; flex-direction:column; gap:var(--space-2h)`
     · message  — `display:flex; gap:var(--space-2); align-items:flex-end;
                   max-width:62%`
     · bubble   — `border-radius:var(--radius-card);
                   padding:var(--space-3) var(--space-4);
                   font-size:var(--text-caption);
                   line-height:var(--leading-normal)`
     · theirs   — `align-self:flex-start`, bubble on `--surface-raised`
     · mine     — `align-self:flex-end; flex-direction:row-reverse`, bubble on
                   `--surface-inverse` with `--ink-on-inverse`
     · receipt  — `align-self:flex-end; font-size:var(--text-micro);
                   color:var(--ink-disabled); tabular`
     · avatar   — `--avatar-sm` (24) pill, `--surface-raised`, micro/strong
     · composer — `display:flex; align-items:center; gap:var(--space-2);
                   background:var(--surface-raised);
                   border-radius:var(--radius-pill);
                   padding:var(--space-2) var(--space-2) var(--space-2)
                   var(--space-4)`
     · send     — dense height, `--space-3` inline, pill, inverse fill,
                   badge/strong

   The sheet's own comment states the governing ruling verbatim, and it
   overrides the drawn chapter:

       "Message thread — built to RULING 36, which supersedes the ch22
        drawing (the drawn specimen shows mango-right/card-left at 78% with
        no avatars; the appendix states 'where a ruling contradicts an older
        page, the ruling wins'). Ruling 36: yours-right on the charcoal fill,
        theirs-left on paper, avatars outside, 62% maximum width. Ban stands
        on tails, scrims, gradients."

   Chapter 27.10 adds the two things ruling 36 does not: the four kinds of
   thread are ONE composition ("Client ↔ team threads, internal team chat,
   the assistant, and comments on a record are the same composition with a
   different header and a different participant list"), and an internal note
   is marked in the thread rather than hidden from it.

   THE LAW THIS FILE OBEYS
   · NO TAILS, NO SCRIMS, NO GRADIENTS. Ruling 36 bans all three by name.
     A bubble is a paper card with the box radius, and nothing else.
   · SIDES, NOT COLOURS, CARRY AUTHORSHIP. Mine is charcoal at the inline
     end; theirs is raised paper at the inline start. Mango never appears in
     a bubble: it is the brand, never a status and never a speaker.
   · 62% MAXIMUM WIDTH, at every breakpoint. Ruling 36 states one figure and
     it is not a function of viewport width — see the breakpoint block.
   · The avatar is OUTSIDE the bubble, and it is `Avatar`, not a redrawn
     circle.
   · An empty composer sends nothing: the send control is `disabled` — a fill
     and an ink — rather than absent, so the row does not reflow as the
     reader types.
   · Focus is ONE global rule (tokens.css §8). Nothing here sets
     `outline: none`; the composer's field carries no ring of its own and the
     shared `:focus-visible` rule lands on it at the pill radius.

   RENDERING CONTEXT
   `"use client"`. Controlled and uncontrolled composer state, a submit
   handler, and `Avatar` underneath.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../avatar/avatar";
import { Badge } from "../badge/badge";
import { Skeleton } from "../skeleton/skeleton";
import {
  Paperclip,
  PaperPlaneTilt,
} from "../../foundations/icons";
import { Checkbox } from "../checkbox/checkbox";
import { ScreenRegister } from "../screen-renderer/screen-renderer";

/**
 * Which side of the thread a message sits on.
 *
 * `mine` and `theirs` rather than any role word: ruling 36 names the two
 * sides and nothing else, and the same component draws four different kinds
 * of conversation (ch27.10), in each of which "mine" means someone else.
 */
export type ThreadSide = "mine" | "theirs";

export interface ThreadAttachment {
  /** Stable key. Falls back to the index. */
  id?: string;
  /** The file's name, as the reader would recognise it. */
  name: React.ReactNode;
  /** Its size, already formatted — "240 KB". A node, so a locale decides. */
  size?: React.ReactNode;
  /** Where it opens. Absent, the chip is a label rather than a link. */
  href?: string;
}

export interface ThreadMessage {
  /** Stable key. Falls back to the index. */
  id?: string;
  /** Which side. Defaults to `theirs`, the safer read for an unknown author. */
  side?: ThreadSide;
  /** Who said it. Drawn above the bubble when it differs from the last one. */
  author?: React.ReactNode;
  /** Which organisation they speak for — ch27.10 draws it beside the name. */
  authorMeta?: React.ReactNode;
  /** Initials for the avatar outside the bubble. */
  initials?: React.ReactNode;
  /** A photograph for the avatar. Falls back to `initials` when it fails. */
  image?: string;
  /** Alt text for `image`. Empty is correct when the name is already beside it. */
  imageAlt?: string;
  /** What was said. A node, so a mention pill or a link rides along. */
  body?: React.ReactNode;
  /** When. Already formatted, tabular, beside the author. */
  time?: React.ReactNode;
  /**
   * Not visible to the other side. ch27.10 marks it in the thread rather
   * than hiding it: a note nobody can see is a note nobody trusts. Drawn as
   * a quiet `Badge` above the bubble; the words carry the meaning.
   */
  internal?: boolean;
  /** Files on the message. Each is its own chip under the body. */
  attachments?: readonly ThreadAttachment[];
  /**
   * A media block — an image, a preview. Its own bubble, on the sender's own
   * side (ruling 36), which is why it is a node and not a `src`.
   */
  media?: React.ReactNode;
  /** The read receipt under the last `mine` bubble — "read 12:09". */
  receipt?: React.ReactNode;
  /**
   * A day heading above this message — "13 Jun 2026". Already formatted; a
   * component that grouped by day would have to know a calendar it cannot
   * see.
   */
  daySeparator?: React.ReactNode;
}

const BUBBLE_BASE = [
  // `.kw-msg__bubble` — the box radius, 12/16 inset, caption at normal leading.
  "rounded-[var(--radius)] px-4 py-3",
  "text-caption",
  // A bubble holds pasted URLs and stack traces. Without this one unbreakable
  // string makes the bubble wider than its 62%.
  "min-w-0 break-words",
];

const BUBBLE_SIDE: Record<ThreadSide, string> = {
  /** Ruling 36 — theirs, on paper. */
  theirs: "bg-card",
  /** Ruling 36 — yours, on the charcoal fill with off-beige ink. */
  mine: "bg-surface-inverse text-ink-on-inverse",
};

export interface TicketThreadProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "children" | "onSubmit"> {
  /** The conversation, oldest first. An empty array draws the empty register. */
  messages: readonly ThreadMessage[];
  /**
   * A band above the composer — an approval strip, a status line, a notice
   * that the conversation is closed. A node, so whatever the composition puts
   * there brings its own drawing.
   */
  banner?: React.ReactNode;
  /**
   * Draw the composer. On by default. Off for a read-only transcript, which
   * is a real case: a closed conversation is still worth reading.
   */
  composer?: boolean;
  /** The composer's value, when the call site owns it. */
  value?: string;
  /** The composer's starting value, when it does not. */
  defaultValue?: string;
  /** Fires on every keystroke. */
  onValueChange?: (value: string) => void;
  /** Fires on send. The composer clears itself only when it owns its value. */
  onSend?: (value: string) => void;
  /** Fires when the attach control is pressed. Absent, no attach control. */
  onAttach?: () => void;
  /** The composer is not editable and cannot send. A fill and an ink. */
  disabled?: boolean;
  /**
   * A send is in flight. The composer becomes non-editable and sets
   * `aria-busy` — `input.tsx`'s answer, and the right one: typing into a
   * field whose value has not been accepted loses what you typed.
   */
  sending?: boolean;
  /** Which body is drawn. Only the messages swap; the composer stays. */
  state?: "ready" | "loading" | "empty" | "error";
  /** The thread's accessible name. Defaulted so no call site ships a nameless log. */
  label?: string;
  /** The composer's placeholder. The kit's own is a prompt, not a label. */
  placeholder?: string;
  /** The composer field's accessible name, when no visible label sits above it. */
  composerLabel?: string;
  /** The send control's label. */
  sendLabel?: string;
  /** The attach control's accessible name — it is an icon and has no words. */
  attachLabel?: string;
  /** What a quiet `Badge` says over a message the other side cannot see. */
  internalLabel?: string;
  /* -- 27.10's CARD composer ------------------------------------------------
     "The composer is a soft-paper card at the bottom of the thread with the
     internal switch, the audience line, and a round PaperPlaneRight furthest right —
     the send glyph alone, no label. There is no paperclip anywhere in chat."
     Passing `onInternalChange` OR `audience` turns the pill composer into
     that card; without either, chapter 22's pill ships unchanged, which is
     what a record's comments and the portal (which has no internal switch)
     still draw. */
  /** The internal switch's value. Card composer only. */
  internal?: boolean;
  /** The switch was pressed. Its presence mounts the switch chip. */
  onInternalChange?: (value: boolean) => void;
  /** The words on the internal switch chip. */
  internalChoiceLabel?: React.ReactNode;
  /**
   * The audience line — "who will see what you type", in words, beside the
   * send. 27.10: "the composer says in words who will see what you type."
   */
  audience?: React.ReactNode;
  /** How many skeleton bubbles the loading body draws. */
  loadingMessages?: number;
  /** What a screen reader hears while the thread loads. */
  loadingLabel?: string;
  /** The empty register's sentence. */
  emptyTitle?: React.ReactNode;
  /** The line under it. */
  emptyDescription?: React.ReactNode;
  /** The error register's sentence. */
  errorTitle?: React.ReactNode;
  /** The line under it. */
  errorDescription?: React.ReactNode;
  /** The retry. */
  errorAction?: React.ReactNode;
}

/**
 * A conversation.
 *
 * TEN STATES
 *  1. default        — a column of bubbles, theirs at the inline start on
 *                      paper and mine at the inline end on charcoal, avatars
 *                      outside, 62% maximum width, then the composer.
 *  2. hover          — does not apply to a bubble. A message is not a target;
 *                      the kit draws no hover for `.kw-msg` and none is
 *                      invented (GAPS-COL3 TCK-3). The composer's two
 *                      controls are Buttons in everything but markup and
 *                      carry their own named hover tokens; the attachment
 *                      chip, where it is a link, takes the `--accent` wash.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the control's own radius. The composer is a pill
 *                      and its ring follows that; nothing here sets
 *                      `overflow: hidden`, so the ring is never shaved.
 *  4. active/pressed — does not apply to a bubble. The send control's press
 *                      resolves into the message appearing, which is a far
 *                      louder acknowledgement than a nudge.
 *  5. disabled       — `disabled`: the composer takes `--btn-disabled-fill` /
 *                      `--btn-disabled-label` and cannot be typed in or sent
 *                      from. A fill and an ink, never an opacity. The
 *                      messages above stay exactly as they are: a closed
 *                      conversation is still readable, and greying the
 *                      transcript would say it had been withdrawn.
 *  6. loading        — TWO different things, kept apart. The THREAD loading
 *                      is `state="loading"` and draws skeleton bubbles with
 *                      the composer kept in place. A SEND in flight is
 *                      `sending`: the field becomes non-editable and sets
 *                      `aria-busy`, and the send control shows it is busy
 *                      without the row reflowing.
 *  7. empty          — `state="empty"`, or `messages: []`: chapter 21's
 *                      register above the composer, which stays — a
 *                      conversation with nothing in it is exactly the moment
 *                      the composer matters most. When there is nothing to
 *                      say either, the register renders `null` and only the
 *                      composer is drawn.
 *  8. error          — `state="error"`: the register in its error tone,
 *                      `role="alert"`, above the composer. A failed SEND is
 *                      not this: it belongs to the call site's own notice, so
 *                      the reader's text is never thrown away by a state
 *                      change inside this component.
 *  9. selected       — does not apply. A message is not a choice. Where a
 *                      thread supports reactions or picking a message to
 *                      quote, the control is a `Button` in the message's own
 *                      `body`.
 * 10. read-only      — `composer={false}`: the transcript renders with no
 *                      composer at all, which is the honest drawing for a
 *                      conversation nobody may add to. `disabled` is the
 *                      other case — may add later, not now — and keeps the
 *                      composer visible so the reader can see that.
 *
 * THREE BREAKPOINTS
 *  mobile   — 62% at 320 is 198px of bubble, which is tight but is what
 *             ruling 36 states, and the ruling states ONE figure rather than
 *             a range. It is kept, for the reason `status-stepper.tsx` keeps
 *             its fold count: a width-triggered change would need a
 *             breakpoint the kit never states, and one reader on a phone and
 *             another on a laptop would be looking at two different shapes
 *             of the same conversation while talking about it. What
 *             DOES respond is the bubble's own text, which wraps, and the
 *             composer, whose attach control drops out of the row before the
 *             field becomes unusable — it is reachable from the message's own
 *             attachment list, which the field is not.
 *  tablet   — unchanged.
 *  desktop  — unchanged. The thread fills the column it is given and the
 *             62% is measured against that column, not against the viewport,
 *             so a thread in a narrow panel on a wide screen is still
 *             correct without a media query.
 *
 * RTL — safe, and this is the component where the sides matter most. `mine`
 * is `self-end` and `theirs` is `self-start`, both LOGICAL, so in Arabic,
 * Urdu and Persian the reader's own messages sit on the reading end exactly
 * as they do in English. The avatar is placed by `flex-row-reverse`, which
 * mirrors with the writing direction rather than naming a side. The receipt
 * is `self-end` with a logical `pe-*`. No physical side appears in this file.
 */
const TicketThread = React.forwardRef<HTMLDivElement, TicketThreadProps>(
  (
    {
      className,
      messages,
      banner,
      composer = true,
      value,
      defaultValue = "",
      onValueChange,
      onSend,
      onAttach,
      disabled = false,
      sending = false,
      state = "ready",
      label = "Conversation",
      placeholder = "Write a reply…",
      composerLabel = "Message",
      sendLabel = "Send",
      attachLabel = "Attach a file",
      internalLabel = "Internal only",
      internal = false,
      onInternalChange,
      internalChoiceLabel = "Internal only",
      audience,
      loadingMessages = 3,
      loadingLabel = "Loading…",
      emptyTitle,
      emptyDescription,
      errorTitle,
      errorDescription,
      errorAction,
      ...props
    },
    ref,
  ) => {
    /* Uncontrolled by default, controlled the moment `value` is passed —
       the same contract every field in this system offers. */
    const [internalValue, setInternalValue] = React.useState(defaultValue);
    const controlled = value !== undefined;
    const text = controlled ? value : internalValue;

    const setText = (next: string) => {
      if (!controlled) setInternalValue(next);
      onValueChange?.(next);
    };

    const resolved = state === "ready" && messages.length === 0 ? "empty" : state;
    const canSend = text.trim().length > 0 && !disabled && !sending;

    const send = () => {
      if (!canSend) return;
      onSend?.(text);
      // Only a field that owns its value may clear it; a controlled composer
      // is cleared by the call site when the send actually succeeds.
      if (!controlled) setInternalValue("");
    };

    let body: React.ReactNode;

    if (resolved === "loading") {
      /* Skeleton bubbles, alternating sides so the shape of a conversation is
         already there when the words arrive. `Skeleton` owns the pulse. */
      body = (
        <div className="flex flex-col gap-[var(--space-2h)]">
          {Array.from({ length: loadingMessages }, (_, index) => (
            <div
              key={`loading-${index}`}
              className={cn(
                "flex max-w-[62%] items-end gap-2",
                index % 2 === 0 ? "self-start" : "self-end flex-row-reverse",
              )}
            >
              <Skeleton
                announce={false}
                className="size-[var(--avatar-sm)] shrink-0"
              />
              <Skeleton
                variant="card"
                announce={index === 0}
                label={loadingLabel}
                className="w-[12rem]"
              />
            </div>
          ))}
        </div>
      );
    } else if (resolved !== "ready") {
      body =
        resolved === "error" ? (
          <ScreenRegister
            tone="error"
            title={errorTitle}
            description={errorDescription}
            action={errorAction}
          />
        ) : (
          <ScreenRegister tone="empty" title={emptyTitle} description={emptyDescription} />
        );
    } else {
      body = (
        /* `.kw-thread` — a column at `--space-2h`. `role="log"` rather than
           `list`: a conversation is appended to, and `log` is what makes a
           screen reader announce a new message without re-reading the
           thread. */
        <div
          role="log"
          aria-label={label}
          aria-live="polite"
          className="flex flex-col gap-[var(--space-2h)]"
        >
          {messages.map((message, index) => {
            const side: ThreadSide = message.side ?? "theirs";
            const mine = side === "mine";
            const key = message.id ?? String(index);
            const hasAvatar =
              message.initials !== undefined || message.image !== undefined;

            return (
              <React.Fragment key={key}>
                {message.daySeparator !== undefined && message.daySeparator !== null ? (
                  /* The day heading. Micro, tertiary, centred, tabular — the
                     kit's own treatment for a quiet divider line. */
                  <span
                    data-slot="thread-day"
                    className="self-center py-2 text-micro tabular-nums text-ink-tertiary"
                  >
                    {message.daySeparator}
                  </span>
                ) : null}

                <div
                  data-slot="thread-message"
                  data-side={side}
                  /* `.kw-msg` — 8 between the avatar and the bubble, bottom
                     aligned, 62% maximum. `flex-row-reverse` puts the avatar
                     outside on the sender's own side and mirrors with the
                     writing direction on its own. */
                  className={cn(
                    "flex max-w-[62%] min-w-0 items-end gap-2",
                    mine ? "self-end flex-row-reverse" : "self-start",
                  )}
                >
                  {hasAvatar ? (
                    /* `.kw-comment__avatar` — 24, pill, raised paper, micro
                       at weight 500. `Avatar size="sm"` is that exactly. */
                    <Avatar size="sm" className="flex-none">
                      {message.image ? (
                        <AvatarImage src={message.image} alt={message.imageAlt ?? ""} />
                      ) : null}
                      <AvatarFallback>{message.initials}</AvatarFallback>
                    </Avatar>
                  ) : null}

                  <div className="flex min-w-0 flex-col gap-1">
                    {/* Author, org and time — ch27.10 draws all three above
                        the bubble, at the caption and badge steps. */}
                    {message.author !== undefined ||
                    message.authorMeta !== undefined ||
                    message.time !== undefined ||
                    message.internal ? (
                      <span
                        className={cn(
                          "flex flex-wrap items-baseline gap-2 text-badge",
                          mine && "justify-end",
                        )}
                      >
                        {message.author !== undefined && message.author !== null ? (
                          <span className="text-caption font-[var(--font-weight-medium)]">
                            {message.author}
                          </span>
                        ) : null}
                        {message.authorMeta !== undefined && message.authorMeta !== null ? (
                          <span className="text-ink-tertiary">{message.authorMeta}</span>
                        ) : null}
                        {/* Quiet, not coloured: an internal note is a scope,
                            not a status, and the words carry it. */}
                        {message.internal ? <Badge>{internalLabel}</Badge> : null}
                        {message.time !== undefined && message.time !== null ? (
                          <span className="tabular-nums text-ink-tertiary">
                            {message.time}
                          </span>
                        ) : null}
                      </span>
                    ) : null}

                    {/* Ruling 36 — images sit as their OWN bubble, same side
                        as the sender. Its inset steps down so the block reads
                        edge to edge inside the radius (t22.css T22-3). */}
                    {message.media ? (
                      <div
                        data-slot="thread-media"
                        className={cn(
                          BUBBLE_BASE,
                          BUBBLE_SIDE[side],
                          "overflow-hidden p-[var(--space-1h)]",
                        )}
                      >
                        {message.media}
                      </div>
                    ) : null}

                    {message.body !== undefined && message.body !== null ? (
                      <div
                        data-slot="thread-bubble"
                        className={cn(BUBBLE_BASE, BUBBLE_SIDE[side])}
                      >
                        {message.body}
                      </div>
                    ) : null}

                    {/* Attachments. One chip per file, under the bubble and
                        on the sender's own side. A chip that opens is an
                        anchor, so the global ring lands on it. */}
                    {message.attachments && message.attachments.length > 0 ? (
                      <span
                        className={cn(
                          "flex flex-wrap gap-2",
                          mine && "justify-end",
                        )}
                      >
                        {message.attachments.map((file, fileIndex) => {
                          const chip = (
                            <>
                              <Paperclip size={16} aria-hidden="true" />
                              <span className="truncate">{file.name}</span>
                              {file.size !== undefined && file.size !== null ? (
                                <span className="tabular-nums text-ink-tertiary">
                                  {file.size}
                                </span>
                              ) : null}
                            </>
                          );
                          const chipClasses =
                            "inline-flex max-w-full items-center gap-2 rounded-pill bg-card px-3 py-1 text-badge";
                          return file.href ? (
                            <a
                              key={file.id ?? String(fileIndex)}
                              href={file.href}
                              className={cn(
                                chipClasses,
                                "motion-row-hover hover:bg-accent",
                              )}
                            >
                              {chip}
                            </a>
                          ) : (
                            <span
                              key={file.id ?? String(fileIndex)}
                              className={chipClasses}
                            >
                              {chip}
                            </span>
                          );
                        })}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* `.kw-msg__receipt` — micro, disabled ink, tabular, at the
                    inline end under the bubble. */}
                {message.receipt !== undefined && message.receipt !== null ? (
                  <span
                    data-slot="thread-receipt"
                    /* Tertiary, not disabled — the artifact's `--fg4`. See `chat.tsx`. */
                    className="self-end pe-[var(--space-1h)] text-micro tabular-nums text-ink-tertiary"
                  >
                    {message.receipt}
                  </span>
                ) : null}
              </React.Fragment>
            );
          })}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        data-slot="ticket-thread"
        data-state={resolved}
        className={cn("flex w-full min-w-0 flex-col gap-4", className)}
        {...props}
      >
        {body}

        {/* The band above the composer — an approval strip, a closed notice. */}
        {banner ? <div data-slot="thread-banner">{banner}</div> : null}

        {composer && (onInternalChange !== undefined || audience !== undefined) ? (
          /* 27.10's composer — a soft-paper CARD, not the pill: the field on
             top; below it the internal switch chip, the audience line in
             words, and a round mango PaperPlaneRight carrying the glyph alone. The kit:
             sheet, radius 24, 14×16 padding, 12 between the rows; chip 32
             tall on the card fill; send 40×40. No paperclip — "a message is
             text, files live on the record." */
          <form
            data-slot="thread-composer"
            data-variant="card"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
            className={cn(
              "flex min-w-0 flex-col gap-3 rounded-[var(--radius)] bg-surface-panel px-4 py-3.5",
              disabled && "bg-[var(--btn-disabled-fill)] text-[var(--btn-disabled-label)]",
            )}
          >
            <input
              type="text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={placeholder}
              aria-label={composerLabel}
              aria-busy={sending || undefined}
              disabled={disabled}
              readOnly={sending}
              className={cn(
                "min-w-0 appearance-none border-0 bg-transparent p-0",
                "[font:inherit] text-body-s text-foreground",
                "placeholder:text-ink-tertiary",
                "disabled:cursor-not-allowed disabled:text-[var(--btn-disabled-label)]",
              )}
            />
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {onInternalChange !== undefined ? (
                <label
                  className={cn(
                    "inline-flex h-8 cursor-pointer items-center gap-2 rounded-pill bg-card px-3.5",
                    "text-caption text-foreground",
                    (disabled || sending) && "cursor-not-allowed",
                  )}
                >
                  <Checkbox
                    checked={internal}
                    onCheckedChange={(next) => {
                      onInternalChange(next === true);
                    }}
                    disabled={disabled || sending}
                  />
                  {internalChoiceLabel}
                </label>
              ) : null}
              {audience === undefined || audience === null ? null : (
                <span className="ms-auto min-w-0 text-badge text-ink-tertiary">
                  {audience}
                </span>
              )}
              <button
                type="submit"
                disabled={!canSend}
                aria-label={sendLabel}
                className={cn(
                  "inline-flex size-10 shrink-0 cursor-pointer appearance-none items-center justify-center",
                  "rounded-pill border-0 bg-primary text-ink-on-accent",
                  "transition-colors duration-[var(--duration-colour)] ease-kwapso",
                  "disabled:cursor-not-allowed disabled:bg-[var(--btn-disabled-fill)] disabled:text-[var(--btn-disabled-label)]",
                  audience === undefined || audience === null ? "ms-auto" : "",
                )}
              >
                <PaperPlaneTilt size={14} aria-hidden="true" />
              </button>
            </div>
          </form>
        ) : composer ? (
          /* `.kw-composer` — a pill on raised paper, 8 inside, 16 at the
             leading edge where the text starts. */
          <form
            data-slot="thread-composer"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
            className={cn(
              "flex items-center gap-2 rounded-pill bg-card",
              "ps-4 pe-2 py-2",
              // A fill and an ink, never an opacity, and the hover on the
              // controls inside is suppressed with them.
              disabled && "bg-[var(--btn-disabled-fill)] text-[var(--btn-disabled-label)]",
            )}
          >
            {onAttach ? (
              <button
                type="button"
                onClick={onAttach}
                disabled={disabled || sending}
                aria-label={attachLabel}
                className={cn(
                  "hidden shrink-0 cursor-pointer appearance-none items-center justify-center",
                  // The attach control drops out before the field becomes
                  // unusable; the files are still reachable from the thread.
                  "sm:inline-flex",
                  "size-[var(--control-height-dense)] rounded-pill border-0 bg-transparent",
                  /* `color: var(--fg3)` — tertiary, not secondary. */
                  "text-ink-tertiary transition-colors duration-[var(--duration-colour)] ease-kwapso",
                  "enabled:hover:bg-accent enabled:hover:text-foreground",
                  "disabled:cursor-not-allowed disabled:bg-[var(--btn-disabled-fill)] disabled:text-[var(--btn-disabled-label)]",
                )}
              >
                <Paperclip size={16} aria-hidden="true" />
              </button>
            ) : null}

            {/* `.kw-composer__ghost` as a real field (t22.css T22-5): the UA
                chrome is reset, typed text is primary ink and the tertiary
                ink moves to the placeholder. No ring is set here — the shared
                `:focus-visible` rule lands on the form's pill. */}
            <input
              type="text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={placeholder}
              aria-label={composerLabel}
              aria-busy={sending || undefined}
              disabled={disabled}
              readOnly={sending}
              className={cn(
                "min-w-0 flex-1 appearance-none border-0 bg-transparent p-0",
                "[font:inherit] text-caption text-foreground",
                "placeholder:text-ink-tertiary",
                "disabled:cursor-not-allowed disabled:text-[var(--btn-disabled-label)]",
              )}
            />

            {/* `.kw-composer__send` — dense height, pill, inverse fill,
                badge at weight 500. Disabled is a fill and an ink; the
                control stays in the row so nothing reflows as you type. */}
            <button
              type="submit"
              disabled={!canSend}
              className={cn(
                "inline-flex shrink-0 cursor-pointer appearance-none items-center gap-2",
                /* `padding: 0 15px` — the ladder's 16, which is exactly what
                   `Button size="sm"` ships and what `comments.tsx` uses for
                   the identical send. 12 made the chapter's two composers
                   different widths. */
                "h-[var(--control-height-dense)] rounded-pill border-0 px-4",
                "bg-surface-inverse text-ink-on-inverse",
                "text-badge font-[var(--font-weight-medium)]",
                "transition-colors duration-[var(--duration-colour)] ease-kwapso",
                "disabled:cursor-not-allowed disabled:bg-[var(--btn-disabled-fill)] disabled:text-[var(--btn-disabled-label)]",
              )}
            >
              {/* WORDS ONLY. Both of chapter 22's composers draw the send as
                  a label and nothing else; the one glyph the chapter puts in a
                  composer is the separate attach control above. (27.9's
                  round glyph-only Post is the ACTIVITY LOG's composer, which
                  is a different object.) */}
              {sendLabel}
            </button>
          </form>
        ) : null}
      </div>
    );
  },
);

TicketThread.displayName = "TicketThread";

export { TicketThread };
