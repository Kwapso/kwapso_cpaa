/* ============================================================================
   Notes — the stack of written remarks against something (16 direct call
   sites).

   DESIGN SOURCE
   design-mothership/specimens/kwapso-patterns.css, chapter 22. The kit's own
   section header there is the brief, and it uses this component's word:

       "CH22 · Notifications & threads
        Every note names a person and a record."

   The row is drawn as `.kw-comment`, figure for figure:

     .kw-comment        display: flex; gap: var(--space-2h);        (10)
     .kw-comment__avatar  --avatar-sm (24), pill, --surface-raised,
                          --text-micro, --weight-strong
     .kw-comment__avatar--mango   --surface-brand / --ink-on-accent
     .kw-comment__name  --text-caption, --weight-strong
     .kw-comment__time  --text-badge, --ink-tertiary, tabular-nums
     .kw-comment__body  --text-caption, --leading-normal,
                          margin-top: var(--space-1)

   The gap between rows is `.t22-comments { gap: var(--space-4) }` in
   specimens/_fragments/t22.css. The empty register is `.kw-empty` in
   kwapso-ui.css: a centred column, `--space-8` / `--space-6` inset, tertiary
   ink, `--space-2` between its lines.

   THE LAW THIS FILE OBEYS
   · The mark beside a note is a PERSON, so it is a pill, at 24 — ruling 30,
     and the reason this file imports `Avatar` rather than drawing a second
     circle. Two initials, never three; `Avatar` enforces that once for the
     whole system.
   · The timestamp's separation from the name is a GAP in a flex row, not the
     kit's own `margin-left: var(--space-2h)`, which would strand the time on
     the wrong side of an Arabic note.
   · One mango per view. `highlight` marks a single note (the reader's own, or
     the one being answered) and is opt-in; mango is a brand fill and never a
     status.
   · Every user-facing string is a prop with a default. The empty register is
     the obvious one and it is the only string this file holds.
   · An error is INK with a poppy dot, never poppy words — chapter 9's law,
     already drawn once in `field.tsx` and repeated here rather than
     reinvented.
   · Focus is ONE global rule (tokens.css §8). Nothing here is focusable and
     nothing here draws a ring.

   RENDERING CONTEXT
   No `"use client"`. This module holds no hook, no state and no handler; it
   renders `Avatar`, which carries its own directive, and a Server Component
   may render a Client Component unchanged.
   ========================================================================= */

import * as React from "react";

import { cn } from "../../lib/utils";
import { Avatar, AvatarFallback } from "../avatar/avatar";

/* ----------------------------------------------------------------------------
   Two initials from a person's name, for the common case where a call site
   has a name and no separately-stored initials.

   `Array.from` rather than `slice`, so a name in a script outside the basic
   plane is not cut through the middle of a code point — the apps run in
   Arabic, Urdu and Persian. `Avatar` cuts to two again on its own, so this is
   belt and braces rather than the only guard.
   ------------------------------------------------------------------------- */
function initialsOf(name: string | undefined): string {
  if (!name) return "";
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return Array.from(words[0]).slice(0, 2).join("");
  return [words[0], words[words.length - 1]]
    .map((word) => Array.from(word)[0] ?? "")
    .join("");
}

export interface NoteItem {
  /** React key. Required, because a note list reorders when one is added. */
  id: string;
  /** Who wrote it. Rendered at the caption step in Saans Medium. */
  author?: React.ReactNode;
  /**
   * The mark's letters. Derived from `author` when it is a plain string and
   * this is omitted; pass it explicitly where the name is a node, or where
   * the two initials are not the first and last word's.
   */
  initials?: string;
  /**
   * When. A node rather than a `Date`, because formatting a date is a locale
   * decision and this component must not make one — the apps run in four
   * languages and the kit's own instruction (chapter 26) is that the machine
   * form and the human form are different strings.
   */
  timestamp?: React.ReactNode;
  /** The note itself. */
  body: React.ReactNode;
  /**
   * Give this one note the mango mark. Opt-in and singular by convention:
   * the kit rules one mango per view and no component can enforce that.
   */
  highlight?: boolean;
}

export interface NotesProps extends React.ComponentPropsWithoutRef<"div"> {
  /**
   * The notes, newest-first or oldest-first as the call site prefers — this
   * component does not sort, because which end is "latest" is a product
   * decision.
   */
  items?: NoteItem[];
  /**
   * Fully-composed rows, for a call site whose note is richer than the shape
   * above (an attachment, a reaction, a quoted reply). Given children, `items`
   * is ignored and the stack is just the spacing.
   */
  children?: React.ReactNode;
  /**
   * Busy. Renders the empty stack with `aria-busy`, and NOT the empty
   * register: "there are no notes" is a fact that has not been established
   * yet, and flashing it before the data lands says something false. The
   * placeholder rows, if a call site wants them, are `Skeleton`.
   */
  loading?: boolean;
  /** The fetch failed. Shows `errorLabel` in the register, ink with a dot. */
  error?: boolean;
  /**
   * The words when there is nothing to show. A default so an unconfigured
   * call site is not blank, a prop so it can be translated.
   */
  emptyLabel?: string;
  /** The words when `error` is set. */
  errorLabel?: string;
  /**
   * Render nothing at all when the list is empty. The kit's own note under
   * `.kw-empty` is that hiding an empty block is a REAL pattern elsewhere and
   * must not be "fixed" into the register, so this is offered rather than
   * decided here. Default `false`: a notes panel that vanishes leaves the
   * reader unsure whether it failed or was never there.
   */
  hideWhenEmpty?: boolean;
}

/* ----------------------------------------------------------------------------
   The centred register — `.kw-empty`, transcribed. Also carries the error
   case, because the kit draws one empty-shaped block and distinguishes the
   two by its words and a dot, not by a second layout.

   The dot is 6 across, matching the size `field.tsx` kept from chapter 9's
   drawing rather than snapping to the 7 of `--dot-status`; the two components
   now draw the same error mark.
   ------------------------------------------------------------------------- */
function NotesRegister({ tone, children }: { tone: "empty" | "error"; children: React.ReactNode }) {
  return (
    <div
      data-slot="notes-register"
      data-tone={tone}
      className={cn(
        /* Left-aligned -- 27.21, DEF-2. */
        "flex flex-col items-start gap-2 text-start",
        "px-6 py-[var(--space-8)]",
        "text-sm",
        // Ink, never poppy — chapter 9. Only the dot carries the tone.
        tone === "error" ? "text-foreground" : "text-ink-tertiary",
      )}
    >
      {tone === "error" ? (
        <span aria-hidden="true" className="size-[0.375rem] shrink-0 rounded-pill bg-destructive" />
      ) : null}
      {children}
    </div>
  );
}

/**
 * A stack of notes.
 *
 * TEN STATES
 *  1. default        — the rows, `--space-4` apart.
 *  2. hover          — does not apply. A note is read, not operated. A note
 *                      list whose rows ARE targets is a collection, not this
 *                      primitive, and it would carry the `--accent` row wash.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once
 *                      and nothing in this file is focusable. A link inside a
 *                      note body is the caller's and takes the ring itself.
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply. A note cannot be switched off; it is a
 *                      thing that was written. The composer that adds one is
 *                      a `Textarea` and an `ActionRow`, and those disable.
 *  6. loading        — the stack renders with `aria-busy` and NO register.
 *                      Saying "nothing here yet" before the request answers
 *                      is a lie the reader acts on.
 *  7. empty          — the centred register at `--space-8` / `--space-6`,
 *                      tertiary ink, with `emptyLabel`. Or nothing at all
 *                      with `hideWhenEmpty`.
 *  8. error          — the same register, ink words and one poppy dot, with
 *                      `errorLabel`. Announced as an alert; the empty case is
 *                      only a status.
 *  9. selected       — does not apply. The kit draws no selected note.
 * 10. read-only      — always. This component displays notes; it never edits
 *                      one. Writing is the composer's, which is its own
 *                      assembly.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED, and the row is built so it does not
 *  need to change: the mark is 24 with `flex: none`, the body takes the rest
 *  with `min-w-0`, and the name-and-time line WRAPS, so a long name and a
 *  long timestamp fall onto two lines at 320 instead of squeezing the mark or
 *  pushing the note sideways. The mark stays 24 at every width — ruling 30's
 *  sizes encode what a mark is, and shrinking it on a phone would make it
 *  mean something else. Width comes entirely from the parent.
 *
 * RTL — safe, with one deliberate change from the kit. `.kw-comment__time`
 * separates itself with `margin-left: var(--space-2h)`, which is physical;
 * here the name and the time are two items in a flex row with a `gap`, so the
 * time follows the name in both directions. Everything else is `gap`-driven
 * and `mt-*` is on the block axis, which does not mirror.
 */
const Notes = React.forwardRef<HTMLDivElement, NotesProps>(
  (
    {
      className,
      items,
      children,
      loading = false,
      error = false,
      emptyLabel = "No notes yet",
      errorLabel = "These notes could not be loaded",
      hideWhenEmpty = false,
      ...props
    },
    ref,
  ) => {
    const composed = React.Children.count(children) > 0;
    const rows = composed ? undefined : (items ?? []);
    const isEmpty = !composed && (rows?.length ?? 0) === 0;

    if (isEmpty && !loading && !error && hideWhenEmpty) return null;

    return (
      <div
        ref={ref}
        data-slot="notes"
        aria-busy={loading || undefined}
        className={cn("flex min-w-0 flex-col gap-4", className)}
        {...props}
      >
        {error ? (
          <NotesRegister tone="error">
            <span role="alert">{errorLabel}</span>
          </NotesRegister>
        ) : isEmpty ? (
          /* Loading suppresses the register: see state 6. */
          loading ? null : (
            <NotesRegister tone="empty">
              <span role="status">{emptyLabel}</span>
            </NotesRegister>
          )
        ) : composed ? (
          children
        ) : (
          rows?.map((note) => (
            <article key={note.id} data-slot="note" className="flex gap-[var(--space-2h)]">
              <Avatar
                size="sm"
                shape="pill"
                variant={note.highlight ? "brand" : "default"}
                aria-hidden="true"
              >
                <AvatarFallback>
                  {note.initials ??
                    (typeof note.author === "string" ? initialsOf(note.author) : "")}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                {note.author !== undefined || note.timestamp !== undefined ? (
                  <div className="flex flex-wrap items-baseline gap-[var(--space-2h)]">
                    {note.author !== undefined ? (
                      <span
                        data-slot="note-author"
                        className="text-caption font-[var(--font-weight-medium)]"
                      >
                        {note.author}
                      </span>
                    ) : null}
                    {note.timestamp !== undefined ? (
                      <span
                        data-slot="note-time"
                        className="text-badge tabular-nums text-ink-tertiary"
                      >
                        {note.timestamp}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <div
                  data-slot="note-body"
                  className="mt-1 text-caption leading-[var(--leading-normal)]"
                >
                  {note.body}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    );
  },
);

Notes.displayName = "Notes";

export { Notes };
