/* ============================================================================
   Command — the command palette (7 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/_fragments/t12.css → `.kw-palette`,
     `.kw-palette__input`, `.kw-palette__query`, `.kw-palette__list`,
     `.kw-palette__label`, `.kw-palette__row`, `.kw-palette__row--active`,
     `.kw-palette__mark`, `.kw-palette__meta`, plus `.kw-keyhint` and
     `.kw-menu__hr`, which chapter 12 shares between the palette and the
     dropdown.
   design-mothership/specimens/_fragments/t12-overlaysmall.html — the drawn
     palette: a leading search glyph, the query, an `esc` key chip, then
     eyebrow-labelled groups of pill rows, the first of them active.
   The chapter rule for every floating surface in it: "Overlay shadow, 24px
     radius, no blur." Max width 38.75rem (620), which is the kit's figure.
   Motion is motion/motion.css §4: `.motion-anchored` for the surface and
     `.motion-menu-item` for the rows. No keyframe, no duration and no curve
     is written in this file.

   THE MACHINERY IS HAND-BUILT, AND THAT IS DELIBERATE
   shadcn's `command` is a skin over `cmdk`. `cmdk` is NOT on the commission's
   permitted dependency list (§2 rule 8), and rule 8 is not a preference. So
   the filter, the roving highlight, the keyboard and the empty register are
   implemented here, against the same export names and the same prop shapes,
   so the 7 existing call sites compile unchanged. Recorded in GAPS-CE CMD-1
   together with the two behaviours that are deliberately not reproduced.

   THE LAW THIS FILE OBEYS
   · The surface is `--popover` at `--radius` (24) under `--shadow-overlay`.
     No border, no blur, no arrow — one radius and one elevation.
   · The active row's wash is `--accent`, which tokens.css defines as the
     kit's own `rgba(26,25,24,.05)` — quoted in the kit as the palette's
     active row. NEVER `--primary`: mango is a brand fill, and a mango row
     would make every arrow-key press look like a brand moment.
   · POINTER HOVER AND KEYBOARD HIGHLIGHT ARE THE SAME WASH, driven by one
     `data-active` attribute, so the palette can never show two live rows.
     That is the same rule `dropdown-menu.tsx` states for `data-highlighted`.
   · Disabled is an ink (`--ink-disabled`) and the row stops being a target.
     Never an opacity.
   · Focus is ONE global rule (tokens.css §8), and it lands on the INPUT,
     which is the only tab stop in the palette. The rows are `role="option"`
     and are pointed at with `aria-activedescendant`, which is what a
     combobox is; giving each row its own tab stop would put fifty tab stops
     between the reader and the escape key.
   · Every user-facing string is a prop with a default — the empty register's
     words, the input's accessible name, the list's accessible name.
   · Logical properties only. The glyph leads and the shortcut trails by DOM
     order inside a flex row, so both mirror in Arabic, Urdu and Persian.

   RENDERING CONTEXT
   `"use client"`. Context, state, refs, effects and keyboard handlers.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { MagnifyingGlass } from "../../foundations/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../dialog/dialog";

/* ----------------------------------------------------------------------------
   Matching.

   The default folds case and strips combining marks before comparing, which
   matters far more in Arabic, Urdu and Persian than it does in English: a
   reader who types without harakat should still find a record stored with
   them. `localeCompare` cannot do a substring, so the normalisation is
   explicit.
   ------------------------------------------------------------------------- */
function fold(input: string): string {
  return input.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
}

function defaultFilter(value: string, search: string): boolean {
  if (search === "") return true;
  return fold(value).includes(fold(search));
}

/* ----------------------------------------------------------------------------
   The one context. Items read the query and the active row from it, and
   register their searchable text with it so `CommandEmpty` can know whether
   anything matched without every item re-rendering on every keystroke.
   ------------------------------------------------------------------------- */
interface CommandContextValue {
  search: string;
  activeValue: string | null;
  setActiveValue: (value: string | null) => void;
  matches: (value: string) => boolean;
  register: (id: string, text: string) => () => void;
  listId: string;
  itemId: (value: string) => string;
}

const CommandContext = React.createContext<CommandContextValue | null>(null);

/* Three internal contexts, not exported: the query setter, the list node the
   root navigates, and the list's accessible name. They exist because none of
   them is a prop of a public part, and cloning children to inject them would
   break a call site that wraps a row in its own component. */
const CommandSearchContext = React.createContext<((value: string) => void) | null>(null);
const CommandListRefContext =
  React.createContext<React.MutableRefObject<HTMLDivElement | null> | null>(null);
const CommandLabelContext = React.createContext<string>("Command palette");

function useCommand(part: string): CommandContextValue {
  const context = React.useContext(CommandContext);
  if (!context) {
    throw new Error(`<${part}> must be rendered inside <Command>.`);
  }
  return context;
}

/* ----------------------------------------------------------------------------
   Surfaces and rows.
   ------------------------------------------------------------------------- */

/* `.kw-palette` — 620 wide, the box radius, the overlay shadow, clipped so
   the input's hairline meets the corner cleanly. */
const SURFACE = [
  "flex w-full max-w-[38.75rem] flex-col overflow-hidden",
  "bg-popover text-popover-foreground",
  "rounded-[var(--radius)] shadow-xl", // bridged to --shadow-overlay
] as const;

/* `.kw-palette__input` — the query row: 18 block / 24 inline, 12 between the
   parts, over one bottom hairline. Drawn as the artifact draws a hairline: an
   inset shadow, never a `border` property (review 1A · fix 2). */
const INPUT_ROW = [
  "flex shrink-0 items-center gap-3",
  "px-[var(--space-6)] py-[var(--space-4h)]",
  /* The query line's rule — same-tone separation, as an inset shadow (fix 2). */
  "shadow-[var(--hairline-under)]",
] as const;

/* `.kw-palette__row` — a pill, not a rectangle, exactly as a menu row is. */
const ITEM = [
  "relative flex w-full cursor-pointer select-none items-center gap-[var(--space-2h)]",
  "rounded-pill px-3 py-[var(--space-2h)]",
  "text-sm text-foreground",
  "motion-menu-item",
  // ONE attribute for pointer and keyboard, so two rows can never be live.
  "data-[active=true]:bg-accent",
  "data-[disabled=true]:pointer-events-none data-[disabled=true]:cursor-not-allowed",
  "data-[disabled=true]:text-ink-disabled",
  "[&_svg]:pointer-events-none [&_svg]:size-[var(--icon-16)] [&_svg]:shrink-0",
] as const;

/* ----------------------------------------------------------------------------
   Command — the root.
   ------------------------------------------------------------------------- */

export interface CommandProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onChange" | "defaultValue"> {
  /** The query, controlled. */
  value?: string;
  /** The query the palette starts with when it manages its own. */
  defaultValue?: string;
  /** Fired with the new query on every keystroke. */
  onValueChange?: (value: string) => void;
  /**
   * Decides whether an item matches. Replace it for fuzzy matching, for a
   * server-side search, or to always return `true` when the results already
   * arrive filtered. The default folds case and strips combining marks.
   */
  filter?: (value: string, search: string) => boolean;
  /**
   * The list's accessible name. Defaulted so no call site ships a nameless
   * listbox, and a prop because the apps run in Arabic, Urdu and Persian.
   */
  label?: string;
}

/**
 * The palette itself, without a surrounding dialog — for a palette embedded
 * in a page, a filter panel, or a sheet.
 *
 * TEN STATES
 *  1. default        — the raised surface, the query row over its hairline,
 *                      grouped pill rows beneath it.
 *  2. hover          — the row under the cursor takes `--accent`, the same
 *                      wash the arrow keys move. A fill swap, never a fade
 *                      and never a movement: a row that shifts under the
 *                      cursor is a row you cannot click (motion.css §4).
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once
 *                      and the ring lands on the input, which is the
 *                      palette's only tab stop. The rows are pointed at with
 *                      `aria-activedescendant`.
 *  4. active/pressed — does not apply as a skin. Pressing a row runs its
 *                      command and closes the palette; the acknowledgement is
 *                      what happens next.
 *  5. disabled       — a disabled row keeps its place, takes
 *                      `--ink-disabled` and stops being a target. It is also
 *                      skipped by the arrow keys, so the highlight never
 *                      lands somewhere Enter would do nothing.
 *  6. loading        — belongs to the caller: it renders a `Spinner` in place
 *                      of the leading glyph, or a `Skeleton` inside the list.
 *                      This file draws no busy palette, because a palette
 *                      that blanked while a query was in flight would throw
 *                      away the results the reader is already reading.
 *                      GAPS-CE CMD-3.
 *  7. empty          — `CommandEmpty` renders exactly when no item matches,
 *                      and it renders nothing at all when the query is empty
 *                      and the list is simply not narrowed yet. Chapter 21's
 *                      rule for an empty register — "say what happened, then
 *                      the one next step" — is the caller's copy to write.
 *  8. error          — does not apply, and must not be faked. A failed search
 *                      is a state of the request; a palette showing "no
 *                      results" over a dead endpoint is a lie. The caller
 *                      replaces the list with the error register.
 *  9. selected       — the active row IS the selection, and it is the
 *                      `--accent` wash rather than the inverse fill chapter
 *                      10 gives a MARK. That is the kit's own drawing: a
 *                      palette row is a transient highlight you are moving
 *                      through, not an answer you have given.
 *
 *                      THE WORD DOES TWO JOBS IN THIS SYSTEM, AND THIS FILE
 *                      HOLDS THE OTHER ONE. Override 40 made
 *                      `--surface-panel` the single answer for a SELECTED
 *                      RECORD — `TableRow`, `List`, `map`'s list row and now
 *                      `Card` all take it. This palette's "selected" is not
 *                      that: it is a KEYBOARD HIGHLIGHT that moves under the
 *                      arrow keys and is gone the moment the palette closes.
 *                      Nothing was chosen. So it keeps `--accent`, and the
 *                      ruling deliberately left it alone. If the two ever
 *                      have to be told apart in review, the test is whether
 *                      the mark survives the component unmounting: a record
 *                      selection does, a cursor does not.
 * 10. read-only      — does not apply. A palette exists to be typed into.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED in drawing. The surface is `w-full`
 *  up to the kit's 620 and stops there, so a phone gets a full-width palette
 *  and a desktop gets 620 with no second design. The list scrolls inside
 *  itself rather than growing the surface (`max-h` on `CommandList`), which
 *  is what keeps the query row and the escape route on screen at 320.
 *
 * RTL — safe. The glyph leads and the key chip trails because of DOM order
 * inside a flex row, not because a side is named, so both swap in Arabic,
 * Urdu and Persian. Every inset is logical.
 */
const Command = React.forwardRef<HTMLDivElement, CommandProps>(
  (
    {
      className,
      value,
      defaultValue = "",
      onValueChange,
      filter = defaultFilter,
      label = "Command palette",
      children,
      ...props
    },
    ref,
  ) => {
    const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
    const search = value ?? uncontrolled;

    const [activeValue, setActiveValue] = React.useState<string | null>(null);
    const [items, setItems] = React.useState<ReadonlyMap<string, string>>(() => new Map());

    const baseId = React.useId();
    const listId = `${baseId}-list`;
    const itemId = React.useCallback((v: string) => `${baseId}-item-${v}`, [baseId]);

    /* Registration only changes when an item mounts or unmounts, never when
       the query changes — so typing costs one render of the root, not one
       effect per row. */
    const register = React.useCallback((id: string, text: string) => {
      setItems((prev) => {
        const next = new Map(prev);
        next.set(id, text);
        return next;
      });
      return () => {
        setItems((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      };
    }, []);

    const matches = React.useCallback(
      (text: string) => filter(text, search),
      [filter, search],
    );

    const setSearch = (next: string) => {
      if (value === undefined) setUncontrolled(next);
      onValueChange?.(next);
    };

    const listRef = React.useRef<HTMLDivElement | null>(null);

    /* Navigation reads the DOM rather than the registry, so the order is the
       order the reader sees even when groups mount conditionally. */
    const rows = React.useCallback((): HTMLElement[] => {
      const list = listRef.current;
      if (!list) return [];
      return Array.from(
        list.querySelectorAll<HTMLElement>('[data-slot="command-item"][data-disabled="false"]'),
      );
    }, []);

    const move = React.useCallback(
      (step: 1 | -1 | "first" | "last") => {
        const all = rows();
        if (all.length === 0) return;
        if (step === "first") return setActiveValue(all[0].dataset.value ?? null);
        if (step === "last") return setActiveValue(all[all.length - 1].dataset.value ?? null);

        const at = all.findIndex((node) => node.dataset.value === activeValue);
        // Wrapping is on purpose: a palette is a loop, and pressing down at
        // the bottom to reach the top is faster than eleven presses back up.
        const next = at === -1 ? 0 : (at + step + all.length) % all.length;
        setActiveValue(all[next].dataset.value ?? null);
      },
      [activeValue, rows],
    );

    // A new query means a new list; the highlight goes to the top of it.
    React.useEffect(() => {
      const all = rows();
      setActiveValue(all.length > 0 ? (all[0].dataset.value ?? null) : null);
    }, [search, items, rows]);

    // Keep the highlighted row in view when the arrows walk past the fold.
    React.useEffect(() => {
      if (activeValue === null) return;
      const node = listRef.current?.querySelector<HTMLElement>(
        `[data-slot="command-item"][data-value="${CSS.escape(activeValue)}"]`,
      );
      node?.scrollIntoView({ block: "nearest" });
    }, [activeValue]);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          return move(1);
        case "ArrowUp":
          event.preventDefault();
          return move(-1);
        case "Home":
          event.preventDefault();
          return move("first");
        case "End":
          event.preventDefault();
          return move("last");
        case "Enter": {
          if (activeValue === null) return;
          event.preventDefault();
          const node = listRef.current?.querySelector<HTMLElement>(
            `[data-slot="command-item"][data-value="${CSS.escape(activeValue)}"]`,
          );
          // Selecting through a click keeps ONE code path for pointer and
          // keyboard, so the two can never do different things.
          node?.click();
          return;
        }
        default:
          return;
      }
    };

    const context: CommandContextValue = {
      search,
      activeValue,
      setActiveValue,
      matches,
      register,
      listId,
      itemId,
    };

    return (
      <CommandContext.Provider value={context}>
        <div
          ref={ref}
          data-slot="command"
          className={cn(SURFACE, className)}
          onKeyDown={handleKeyDown}
          {...props}
        >
          {/* The query row and the list both need the setter and the list
              node, and neither is a prop of the public parts, so they travel
              on two internal contexts rather than through cloning. */}
          <CommandSearchContext.Provider value={setSearch}>
            <CommandListRefContext.Provider value={listRef}>
              <CommandLabelContext.Provider value={label}>
                {children}
              </CommandLabelContext.Provider>
            </CommandListRefContext.Provider>
          </CommandSearchContext.Provider>
        </div>
      </CommandContext.Provider>
    );
  },
);

Command.displayName = "Command";

/* ----------------------------------------------------------------------------
   CommandInput
   ------------------------------------------------------------------------- */

export interface CommandInputProps
  extends Omit<React.ComponentPropsWithoutRef<"input">, "value" | "onChange" | "type"> {
  /**
   * The input's accessible name. The palette carries no visible label — the
   * glyph is the label — so one is defaulted rather than left to be
   * forgotten. Ignored when the call site passes `aria-label` itself.
   */
  label?: string;
  /** Draw something after the query. The kit puts an `esc` key chip here. */
  shortcut?: React.ReactNode;
}

/**
 * `.kw-palette__input` — the query row: the search glyph, the bare input, and
 * whatever the caller trails after it.
 *
 * TEN STATES — the row draws none of its own; the INPUT is bare (no border,
 * no fill, no radius) because the palette surface around it is the field.
 * 1 default · 2 hover does not apply (there is no border to shift and no
 * second surface to wash) · 3 focus-visible is tokens.css §8, and it lands
 * here because this is the palette's only tab stop · 4 pressed, 5 disabled,
 * 8 error, 9 selected and 10 read-only do not apply to a query box · 6
 * loading belongs to the caller, which swaps the glyph for a `Spinner` · 7
 * empty is the placeholder in tertiary ink.
 *
 * THREE BREAKPOINTS — UNCHANGED; the row inherits the surface's width.
 * RTL — safe. The glyph leads by DOM order; `px-*` is padding-inline.
 */
const CommandInput = React.forwardRef<HTMLInputElement, CommandInputProps>(
  ({ className, label = "Search", shortcut, onKeyDown, ...props }, ref) => {
    const { search, activeValue, listId, itemId } = useCommand("CommandInput");
    const setSearch = React.useContext(CommandSearchContext);

    return (
      <div data-slot="command-input-row" className={cn(INPUT_ROW)}>
        <MagnifyingGlass size={16} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
        <input
          ref={ref}
          type="text"
          data-slot="command-input"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeValue === null ? undefined : itemId(activeValue)}
          aria-label={props["aria-labelledby"] ? undefined : (props["aria-label"] ?? label)}
          value={search}
          onChange={(event) => setSearch?.(event.currentTarget.value)}
          onKeyDown={onKeyDown}
          className={cn(
            "min-w-0 flex-1 appearance-none border-0 bg-transparent p-0",
            // The kit sets the query at the body step, one above a field's 14.
            "text-base font-[var(--font-weight-light)] text-foreground",
            "placeholder:text-muted-foreground",
            className,
          )}
          {...props}
        />
        {shortcut !== undefined && shortcut !== null ? (
          <span
            data-slot="command-input-shortcut"
            aria-hidden="true"
            className={cn(
              "shrink-0 rounded-pill bg-hair-faint px-2 py-1",
              "text-badge font-[var(--font-weight-medium)] text-ink-tertiary",
            )}
          >
            {shortcut}
          </span>
        ) : null}
      </div>
    );
  },
);

CommandInput.displayName = "CommandInput";

/* ----------------------------------------------------------------------------
   CommandList
   ------------------------------------------------------------------------- */

/**
 * `.kw-palette__list` — the scroll region, inset `--space-2h` (10) so the
 * pill rows stop short of the surface's corners.
 *
 * TEN STATES — none apply. It is a scroll region; every state belongs to the
 * rows inside it or to `CommandEmpty`.
 * THREE BREAKPOINTS — the one responsive decision in this file: the list is
 * capped so it scrolls inside the surface instead of growing it, which is
 * what keeps the query row and the escape key on screen on a phone.
 * RTL — safe; the scrollbar follows the document direction on its own.
 */
const CommandList = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => {
    const { listId } = useCommand("CommandList");
    const label = React.useContext(CommandLabelContext);
    const shared = React.useContext(CommandListRefContext);

    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        if (shared) shared.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      },
      [ref, shared],
    );

    return (
      <div
        ref={setRefs}
        id={listId}
        role="listbox"
        aria-label={label}
        data-slot="command-list"
        className={cn("max-h-[20rem] overflow-y-auto p-[var(--space-2h)]", className)}
        {...props}
      />
    );
  },
);

CommandList.displayName = "CommandList";

/* ----------------------------------------------------------------------------
   CommandEmpty
   ------------------------------------------------------------------------- */

export interface CommandEmptyProps extends React.ComponentPropsWithoutRef<"div"> {
  /**
   * What to say when nothing matched. A default is given so no call site can
   * ship a blank hole, and it is a prop — like every string in this system —
   * because the apps run in Arabic, Urdu and Persian. Pass `children`
   * instead for chapter 21's fuller register (a line plus the one next step).
   */
  label?: string;
}

/**
 * The empty register. Renders exactly when the query has narrowed the list to
 * nothing — never when the query is empty and the list is simply everything.
 *
 * TEN STATES — none apply; it IS state 7 for the palette as a whole.
 * THREE BREAKPOINTS — UNCHANGED. RTL — safe; `text-center` names no side.
 */
const CommandEmpty = React.forwardRef<HTMLDivElement, CommandEmptyProps>(
  ({ className, label = "No results", children, ...props }, ref) => {
    const { search } = useCommand("CommandEmpty");
    const [empty, setEmpty] = React.useState(false);
    const probe = React.useRef<HTMLDivElement | null>(null);

    /* Counted off the DOM rather than off the registry, so an item hidden by
       a caller's own conditional counts as absent too. */
    React.useEffect(() => {
      const list = probe.current?.closest('[data-slot="command-list"]');
      setEmpty((list?.querySelectorAll('[data-slot="command-item"]').length ?? 0) === 0);
    });

    return (
      <div ref={probe}>
        {search !== "" && empty ? (
          <div
            ref={ref}
            data-slot="command-empty"
            role="presentation"
            /* Left-aligned -- 27.21, DEF-2. */
            className={cn("px-3 py-[var(--space-6)] text-start text-sm text-ink-tertiary", className)}
            {...props}
          >
            {children ?? label}
          </div>
        ) : null}
      </div>
    );
  },
);

CommandEmpty.displayName = "CommandEmpty";

/* ----------------------------------------------------------------------------
   CommandGroup
   ------------------------------------------------------------------------- */

export interface CommandGroupProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  /** The eyebrow above the group — "Records", "Actions" in the kit's drawing. */
  heading?: React.ReactNode;
}

/**
 * `.kw-palette__label` wrapping a `.kw-eyebrow`: micro, 500, uppercase, the
 * eyebrow tracking, tertiary ink — all four of which `text-micro` and one
 * `uppercase` set between them.
 *
 * A group whose every row has been filtered out renders nothing at all,
 * heading included. A heading over an empty group is the palette's own
 * version of inventing a dash to fill a hole.
 *
 * TEN STATES — none apply to the group; the rows inside it own all ten.
 * THREE BREAKPOINTS — UNCHANGED. RTL — safe; `px-*`, `pt-*`, `pb-*`.
 */
const CommandGroup = React.forwardRef<HTMLDivElement, CommandGroupProps>(
  ({ className, heading, children, ...props }, ref) => {
    const [populated, setPopulated] = React.useState(true);
    const inner = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
      setPopulated((inner.current?.querySelectorAll('[data-slot="command-item"]').length ?? 0) > 0);
    });

    return (
      <div
        ref={ref}
        data-slot="command-group"
        data-empty={populated ? undefined : ""}
        role="group"
        className={cn(populated ? undefined : "hidden", className)}
        {...props}
      >
        {heading !== undefined && heading !== null ? (
          <div
            data-slot="command-group-heading"
            aria-hidden="true"
            className="text-micro uppercase font-[var(--font-weight-medium)] text-ink-tertiary px-3 pt-[var(--space-2h)] pb-1"
          >
            {heading}
          </div>
        ) : null}
        <div ref={inner}>{children}</div>
      </div>
    );
  },
);

CommandGroup.displayName = "CommandGroup";

/* ----------------------------------------------------------------------------
   CommandItem
   ------------------------------------------------------------------------- */

export interface CommandItemProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onSelect"> {
  /**
   * What this row matches on and what `onSelect` receives. Falls back to the
   * row's own text, so a call site that only passes children still filters.
   */
  value?: string;
  /**
   * Extra words this row should match on that are not printed in it — a
   * synonym, an id, a transliteration. Joined onto `value` for matching only.
   */
  keywords?: readonly string[];
  /** Run the command. Fired by a click and by Enter, through the same path. */
  onSelect?: (value: string) => void;
  /** The row keeps its place, takes disabled ink, and the arrows skip it. */
  disabled?: boolean;
}

/**
 * `.kw-palette__row` — a pill row: an optional 22 mark, the words, and
 * whatever trails (`CommandShortcut`, or the kit's `.kw-palette__meta`).
 *
 * TEN STATES
 *  1. default        — transparent pill, 14 ink.
 *  2. hover          — `--accent`, the same wash the keyboard moves, through
 *                      the same `data-active` attribute so the two can never
 *                      disagree about which row is live.
 *  3. focus-visible  — NOT here, and the row is deliberately not a tab stop:
 *                      the palette is a combobox and the caret stays in the
 *                      input. tokens.css §8 rings that input.
 *  4. active/pressed — does not apply; running the command is the feedback.
 *  5. disabled       — `--ink-disabled`, pointer events off, skipped by the
 *                      arrows. An ink, never an opacity.
 *  6. loading        — does not apply to a row. A command that is running has
 *                      already closed the palette.
 *  7. empty          — a row with no children is a bug at the call site, not
 *                      a state to draw.
 *  8. error          — does not apply.
 *  9. selected       — `data-active`: the `--accent` wash. See the root's
 *                      note on why this is a wash and not chapter 10's
 *                      inverse, and on why override 40's selected-RECORD
 *                      wash does not reach a keyboard cursor.
 * 10. read-only      — does not apply.
 *
 * THREE BREAKPOINTS — UNCHANGED. `whitespace-nowrap` is deliberately NOT set:
 * the kit's specimen rows do not wrap because they are short, and a row that
 * cannot wrap on a 320 screen loses its own end instead of its second line.
 * RTL — safe; `gap` and DOM order carry the layout.
 */
const CommandItem = React.forwardRef<HTMLDivElement, CommandItemProps>(
  ({ className, value, keywords, onSelect, disabled = false, children, ...props }, ref) => {
    const { activeValue, setActiveValue, matches, register, itemId } = useCommand("CommandItem");
    const own = React.useRef<HTMLDivElement | null>(null);
    const [text, setText] = React.useState(value ?? "");

    // With no explicit `value`, the row matches on what it actually says.
    React.useEffect(() => {
      if (value !== undefined) return setText(value);
      setText(own.current?.textContent ?? "");
    }, [value, children]);

    const haystack = React.useMemo(
      () => [text, ...(keywords ?? [])].join(" "),
      [text, keywords],
    );

    React.useEffect(() => {
      if (text === "") return;
      return register(text, haystack);
    }, [register, text, haystack]);

    if (text !== "" && !matches(haystack)) return null;

    const active = activeValue === text;

    const setRefs = (node: HTMLDivElement | null) => {
      own.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    };

    return (
      <div
        ref={setRefs}
        id={itemId(text)}
        role="option"
        aria-selected={active}
        aria-disabled={disabled || undefined}
        data-slot="command-item"
        data-value={text}
        data-active={active}
        data-disabled={disabled}
        // Guarded, so a pointer crossing one row does not dispatch a state
        // update per pixel of travel.
        onPointerMove={() => !disabled && !active && setActiveValue(text)}
        onClick={() => !disabled && onSelect?.(text)}
        className={cn(ITEM, className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);

CommandItem.displayName = "CommandItem";

/* ----------------------------------------------------------------------------
   CommandShortcut
   ------------------------------------------------------------------------- */

/**
 * `.kw-keyhint` — the shortcut, pushed to the inline end in micro/500 on
 * TERTIARY ink, tabular so a column of them lines up. Shared by the palette
 * and the dropdown in chapter 12, and identical to
 * `DropdownMenuShortcut` on purpose: two drawings of one hint would drift.
 *
 * CORRECTED 2026-08-23, GAPS-CONTRAST §2 rows 6 and 9. This shipped as
 * `--ink-disabled` under a comment claiming "that is the kit's own drawing —
 * the tier below tertiary is where the kit puts hints". **The kit draws no
 * such tier.** Ruling 27 folded the old quiet grey into tertiary and CH01
 * states the consequence in one line: *"#a8a59f now means disabled and
 * nothing else."* Chapter 12 — the chapter that draws this hint — never
 * writes `--fgdis`; it writes `--fg3` / `--fg4`, which ruling 27 resolves to
 * the SAME `#5f5d59` that `--ink-tertiary` carries. So the artifact's own
 * value for a hint is tertiary, and the claim in the old comment was
 * invented. This is the same slip GAPS-FIDELITY-DE fixed in five other
 * places (chat receipt, ticket-thread, list row number, copilot basis line).
 *
 * A shortcut row is not a disabled control, so it is not exempt: it measured
 * **2.158 / 2.203 / 2.433 light** and **2.607 / 2.868 / 3.321 dark** against
 * 4.5. It also carries `aria-hidden`, so it is already gone from assistive
 * tech — a low-vision reader who can still see the screen was the only
 * consumer left, and the exempt tier was the one thing they could not read.
 *
 * TEN STATES — none apply; it is a static hint inside a row that owns all ten.
 * THREE BREAKPOINTS — UNCHANGED. RTL — safe; `ms-auto` is margin-inline-start.
 */
const CommandShortcut = React.forwardRef<HTMLSpanElement, React.ComponentPropsWithoutRef<"span">>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      data-slot="command-shortcut"
      aria-hidden="true"
      className={cn(
        "ms-auto text-micro font-[var(--font-weight-medium)] text-ink-tertiary tabular-nums",
        className,
      )}
      {...props}
    />
  ),
);

CommandShortcut.displayName = "CommandShortcut";

/* ----------------------------------------------------------------------------
   CommandSeparator
   ------------------------------------------------------------------------- */

/**
 * `.kw-menu__hr` — one hairline on `--hair`, inset 12 from each side so it
 * stops short of the surface's corners, with 10 of air above and below.
 * Drawn as a border so no length is written here.
 *
 * TEN STATES — none apply. A rule is not a control.
 * THREE BREAKPOINTS — UNCHANGED. RTL — safe; `mx-*` is margin-inline.
 */
const CommandSeparator = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="command-separator"
      role="separator"
      /* A menu separator is same-tone separation: an inset shadow, not a
         border (review 1A · fix 2). */
      className={cn("mx-3 my-[var(--space-2h)] h-px shadow-[var(--hairline-over)]", className)}
      {...props}
    />
  ),
);

CommandSeparator.displayName = "CommandSeparator";

/* ----------------------------------------------------------------------------
   CommandDialog
   ------------------------------------------------------------------------- */

export interface CommandDialogProps extends CommandProps {
  /** Whether the palette is open. */
  open?: boolean;
  /** Fired when the palette wants to open or close. */
  onOpenChange?: (open: boolean) => void;
  /**
   * The dialog's accessible title. Required by the accessibility tree and
   * hidden on screen, because the palette's own glyph and placeholder already
   * say what it is. A prop, and translatable.
   */
  title?: string;
  /** The dialog's accessible description, also hidden on screen. */
  description?: string;
}

/**
 * The palette in a modal. The surface is the palette's own — chapter 12's
 * 620 at 24 under the overlay shadow — so `DialogContent`'s 460 measure and
 * its 32 inset are both overridden here rather than inherited; `cn` lets the
 * later classes win.
 *
 * The dialog's built-in close chip is withdrawn (`showClose={false}`): the
 * kit draws an `esc` key chip in the query row instead, which is what a
 * palette's exit looks like, and a corner cross over a search field would sit
 * where the shortcut chip goes.
 *
 * TEN STATES — the palette's, unchanged. The dialog adds the scrim and the
 * focus trap and draws no state of its own.
 * THREE BREAKPOINTS — `DialogContent`'s gutter: 24 on mobile, 32 from `sm`.
 * The palette inside it is `w-full` up to 620 at every width.
 * RTL — safe. The dialog is centred by a grid, not a translate.
 */
function CommandDialog({
  open,
  onOpenChange,
  title = "Command palette",
  description = "Search for a record or run a command.",
  children,
  className,
  ...props
}: CommandDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={false}
        className="w-full max-w-[38.75rem] overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        {/* The palette fills the dialog it was given and drops its own
            elevation: the dialog already carries `--shadow-overlay`, and two
            of them stacked is a darker shadow than the kit draws. The radius
            is left alone because both surfaces are `--radius` and the outer
            one clips anyway. */}
        <Command
          className={cn("max-w-full shadow-none", className)}
          {...props}
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

CommandDialog.displayName = "CommandDialog";

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
