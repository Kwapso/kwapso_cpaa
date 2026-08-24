/* ============================================================================
   ModeToggle — light / dark / system (7 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/_fragments/t10.css → `.kw-seg` / `.kw-seg__btn`
   / `.kw-seg__btn--active` — the kit's segmented SELECTION control: a raised
   pill track with `--shadow-rest`, `--space-1` of padding and gap, dense-height
   (32) pills inside it, secondary ink going to primary ink on hover, and the
   selected segment on `--surface-inverse` with `--ink-on-inverse` at 500.
   Hover on this control is an INK move with no fill change — that is the kit's
   drawing, and none is invented here.

   WHY A SEGMENTED CONTROL AND NOT A TWO-STATE SWITCH
   `tokens/tokens.css` defines dark TWICE, on purpose:

     @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }
     :root[data-theme="dark"] { … }

   Read those two selectors together and there are THREE states, not two:

     · light  — `data-theme="light"`. Wins over the media query.
     · dark   — `data-theme="dark"`. Wins over the media query.
     · system — NO ATTRIBUTE AT ALL. The media query decides, and it keeps
                deciding: the page follows the reader's machine when it flips
                at sunset, without this component being on screen.

   A two-state toggle always writes an attribute. The first time it is touched
   the "system" state stops existing for that reader and cannot be got back
   from inside the application — the page is pinned to whatever was chosen that
   afternoon, for good. That is a real regression, so this control has three
   segments and "system" is a first-class choice that REMOVES the attribute and
   REMOVES the stored key.

   WHY THIS IS HAND-ROLLED AND NOT `next-themes`
   Two reasons, both hard, recorded in GAPS-G.md MDT-1:
     1. `next-themes` is not installed. It is on the commission's permitted
        list, but it is absent from this repository's `package.json` and from
        `node_modules`, so importing it fails `tsc --noEmit`, which is the
        verification gate this batch is held to. Adding a dependency is not
        this batch's decision to make.
     2. Even installed, its "system" state does not match this token file.
        `next-themes` resolves system to a concrete value and writes it to the
        attribute; with `attribute="data-theme"` a system reader gets
        `data-theme="dark"` written onto the root. The attribute is then always
        present, `:root:not([data-theme="light"])` never gets to do its job,
        and the mechanism tokens.css was built around is bypassed. The brief
        asked for confirmation that its system state writes no attribute: it
        writes one.

   THE FLASH, AND WHOSE JOB IT IS
   This component applies the stored choice on mount, which is one paint late.
   Removing that paint needs a blocking script in the document head, above the
   application — which is the app shell's file, not a primitive's. Drop this in
   `app/layout.tsx` as a `<script dangerouslySetInnerHTML>`, before children:

     try {
       var m = localStorage.getItem("theme");
       if (m === "light" || m === "dark") {
         document.documentElement.setAttribute("data-theme", m);
         document.documentElement.style.colorScheme = m;
       }
     } catch (e) {}

   Note what it does NOT do: when there is no stored value it writes nothing,
   which is the system state. Same contract as this file. GAPS-G.md MDT-2.

   THE LAW THIS FILE OBEYS
   · The attribute is exactly `data-theme`, with exactly the values `light`
     and `dark`, and no attribute for system. Those three facts are the
     contract with tokens.css §6 and §7 and may not drift.
   · Radius is `--radius-pill`, on the track and on every segment.
   · Disabled is a fill and an ink (`--btn-disabled-fill` /
     `--btn-disabled-label`), never an opacity.
   · Hover is the kit's ink move. Never mango: mango is a brand fill, and a
     mango hover would put the brand on whichever segment the pointer happened
     to be over.
   · Focus is the one global rule (tokens.css §8). Nothing here defines a ring.
   · All three labels are props with defaults, so "Light" / "Dark" / "System"
     translate for Arabic, Urdu and Persian, as does the group's name.

   RENDERING CONTEXT
   `"use client"`. State, storage, a subscription and the document element.
   ========================================================================= */

"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

/* ----------------------------------------------------------------------------
   The mechanism. Module-level, browser-guarded, and deliberately tiny.
   ------------------------------------------------------------------------- */

/** The three states. Order is the reading order of the control. */
const MODE_ORDER = ["light", "dark", "system"] as const;

/** `light` and `dark` write the attribute; `system` removes it. */
export type ThemeMode = (typeof MODE_ORDER)[number];

/** The one attribute name tokens.css §6 and §7 are written against. */
const THEME_ATTRIBUTE = "data-theme";

/** Instances of this control in the same document, kept in step with each other. */
const listeners = new Set<() => void>();

function isMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * What is stored. A missing or unreadable key IS the system state — no stored
 * choice and "I choose to follow the machine" are deliberately the same thing,
 * so clearing site data returns a reader to system rather than to a guess.
 * Storage can throw (private mode, blocked storage), hence the try.
 */
function readStoredMode(storageKey: string): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

/**
 * Put the choice on the document. This is the whole mechanism, and the
 * `system` branch is the half that a two-state toggle cannot express.
 *
 * `color-scheme` is set alongside the attribute so the browser's own furniture
 * — form controls, scrollbars, the canvas behind an overscroll — matches. It
 * is a CSS keyword, not a colour: no token is being decided here.
 */
function applyMode(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (mode === "system") {
    root.removeAttribute(THEME_ATTRIBUTE);
    root.style.colorScheme = "light dark";
  } else {
    root.setAttribute(THEME_ATTRIBUTE, mode);
    root.style.colorScheme = mode;
  }
}

/** Persist, apply, and tell every other instance. */
function commitMode(storageKey: string, mode: ThemeMode): void {
  if (typeof window !== "undefined") {
    try {
      if (mode === "system") window.localStorage.removeItem(storageKey);
      else window.localStorage.setItem(storageKey, mode);
    } catch {
      // Storage refused. The attribute below still lands, so the choice holds
      // for this page view; it just will not survive a reload. Swallowing is
      // right: a colour preference is not worth throwing at a reader.
    }
  }
  applyMode(mode);
  listeners.forEach((listener) => listener());
}

/**
 * `useSyncExternalStore`'s subscribe. Two sources: this tab (the set above)
 * and any other tab (the `storage` event), so choosing dark in one window does
 * not leave a second window disagreeing with its own storage.
 */
function subscribeToMode(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  if (typeof window === "undefined") return () => listeners.delete(onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

/* ----------------------------------------------------------------------------
   The drawing. `.kw-seg` / `.kw-seg__btn`, transcribed.
   ------------------------------------------------------------------------- */

const modeToggleVariants = cva([
  // `.kw-seg` — a raised pill track, 4 of padding, 4 between the segments.
  "inline-flex items-center gap-1 p-1",
  "rounded-pill bg-[var(--surface-raised)] shadow-sm",
]);

const SEGMENT_BASE = [
  // The kit's reset line on a bare control.
  "inline-flex cursor-pointer appearance-none items-center justify-center",
  "border-0 bg-transparent [font:inherit]",
  // `.kw-seg__btn` — dense height, 16 inline padding, full pill.
  "h-[var(--control-height-dense)] px-4 rounded-pill whitespace-nowrap",
  // 14/300 with the pill's own leading.
  "text-sm leading-none text-ink-secondary",
  // Hover is an INK move only — the kit changes no fill here.
  "enabled:hover:text-foreground",
  "transition-colors duration-[var(--duration-colour)] ease-kwapso",
];

/** `.kw-seg__btn--active` — the inverse fill, and it keeps its ink on hover. */
const SEGMENT_SELECTED = [
  "bg-surface-inverse text-ink-on-inverse font-medium",
  "enabled:hover:text-ink-on-inverse",
];

/** A fill and an ink, applied in JS so no `disabled:` utility can lose a race. */
const SEGMENT_DISABLED =
  "cursor-not-allowed bg-transparent text-[var(--btn-disabled-label)]";

const TRACK_DISABLED = "bg-[var(--btn-disabled-fill)] shadow-none";

export interface ModeToggleProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onChange">,
    VariantProps<typeof modeToggleVariants> {
  /**
   * Controlled value. Leave it off and the control reads and writes the
   * document itself, which is what all seven call sites want; pass it when an
   * application already owns the preference and syncs it to a profile.
   */
  mode?: ThemeMode;
  /** The state before anything is stored and on the server. `"system"`. */
  defaultMode?: ThemeMode;
  /** Called with the new mode after it has been applied. */
  onModeChange?: (mode: ThemeMode) => void;
  /**
   * The `localStorage` key. `"theme"` by default — the same key the head
   * script in this file's header reads, and they must agree.
   */
  storageKey?: string;
  /** The group's accessible name. Translatable. */
  label?: string;
  /** Segment one. Translatable. */
  lightLabel?: string;
  /** Segment two. Translatable. */
  darkLabel?: string;
  /**
   * Segment three — the one a two-state toggle destroys. Translatable.
   * "System" means: write no attribute and let the machine decide, now and
   * every time it changes its mind.
   */
  systemLabel?: string;
  /** A fill and an ink on the whole track. Never an opacity. */
  disabled?: boolean;
}

/**
 * The colour-theme control: three states, one of which is "don't decide".
 *
 * TEN STATES
 *  1. default        — three segments on the raised track, secondary ink.
 *  2. hover          — the kit's ink move to `--ink-primary`, no fill change.
 *                      Suppressed on the selected segment (which keeps
 *                      `--ink-on-inverse`) and on a disabled control.
 *  3. focus-visible  — NOT here. tokens.css §8 rings the focused segment at the
 *                      segment's own pill radius. Only one segment is in the tab
 *                      order at a time (roving tabindex, as a radio group must
 *                      be); the arrow keys move between all three.
 *  4. active/pressed — does not apply as a separate skin. Pressing a segment
 *                      selects it, and selection is state 9 — drawing a fourth
 *                      fill for the 120ms in between would read as a flicker.
 *                      The kit draws no pressed state on `.kw-seg__btn`.
 *  5. disabled       — `disabled`: `--btn-disabled-fill` track,
 *                      `--btn-disabled-label` ink, elevation withdrawn, hover
 *                      suppressed, every segment `disabled` natively.
 *  6. loading        — does not apply. There is nothing to fetch: the value is
 *                      in `localStorage` and on the document element, and both
 *                      answer synchronously. A spinner here would be theatre.
 *  7. empty          — does not apply. There is always exactly one mode; the
 *                      absence of a stored choice IS `system`, which is drawn.
 *  8. error          — does not apply. Blocked storage is the one failure and
 *                      it is not the reader's problem to see: the choice still
 *                      applies to this page view, it just does not persist.
 *                      Reporting it would put an error on screen about a colour.
 *  9. selected       — the whole point: `--surface-inverse` /
 *                      `--ink-on-inverse` at 500, and `aria-checked` on the
 *                      chosen radio.
 * 10. read-only      — does not apply. A control that can be read but not set
 *                      is `disabled` here; a theme has no third party writing to
 *                      it that the reader must not fight.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The track is `inline-flex` and sizes
 *  itself to its three labels at every width, and the segments are already at
 *  the kit's dense height in all three. It does not collapse to an icon on a
 *  phone, deliberately: the delivered icon set has no sun, no moon and no
 *  system glyph, so a collapsed version would be three unlabelled shapes that
 *  the reader has to learn. GAPS-G.md MDT-3.
 *
 * RTL — safe. The segments are laid out by DOM order in a flex row, so they
 * mirror in Arabic, Urdu and Persian; `px-*` is padding-inline; and the arrow
 * keys are direction-aware — in an RTL document ArrowLeft moves to the NEXT
 * segment, which is the one the reader sees to the inline end.
 */
const ModeToggle = React.forwardRef<HTMLDivElement, ModeToggleProps>(
  (
    {
      className,
      mode: controlledMode,
      defaultMode = "system",
      onModeChange,
      storageKey = "theme",
      label = "Colour theme",
      lightLabel = "Light",
      darkLabel = "Dark",
      systemLabel = "System",
      disabled = false,
      ...props
    },
    ref,
  ) => {
    const getSnapshot = React.useCallback(() => readStoredMode(storageKey), [storageKey]);
    // The server, and the browser's hydrating render, both answer with
    // `defaultMode`. Anything else would render one thing on the server and
    // another on the first client paint, which React reports as a mismatch and
    // a reader sees as a flicker.
    const getServerSnapshot = React.useCallback(() => defaultMode, [defaultMode]);

    const storedMode = React.useSyncExternalStore(
      subscribeToMode,
      getSnapshot,
      getServerSnapshot,
    );

    const controlled = controlledMode !== undefined;
    const mode = controlled ? controlledMode : storedMode;

    // Bring the document into line with storage once, after hydration. An app
    // that ships the head script from this file's header has already done it
    // and this is a no-op; an app that has not gets the right theme one paint
    // late, rather than not at all.
    React.useEffect(() => {
      if (controlled) return;
      applyMode(storedMode);
    }, [controlled, storedMode]);

    // A controlled call site owns the value; this component still owns the
    // document, or nothing would paint.
    React.useEffect(() => {
      if (!controlled || controlledMode === undefined) return;
      applyMode(controlledMode);
    }, [controlled, controlledMode]);

    const segmentRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

    const select = (next: ThemeMode) => {
      if (disabled) return;
      if (!controlled) commitMode(storageKey, next);
      else applyMode(next);
      onModeChange?.(next);
    };

    const moveTo = (index: number) => {
      const wrapped = (index + MODE_ORDER.length) % MODE_ORDER.length;
      const next = MODE_ORDER[wrapped];
      if (!isMode(next)) return;
      select(next);
      segmentRefs.current[wrapped]?.focus();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      const current = MODE_ORDER.indexOf(mode);
      // Which visual direction "next" is depends on the document, not on the
      // key cap. Read it from the element rather than assuming.
      const rtl =
        typeof window !== "undefined" && event.currentTarget instanceof Element
          ? window.getComputedStyle(event.currentTarget).direction === "rtl"
          : false;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          moveTo(current + 1);
          break;
        case "ArrowUp":
          event.preventDefault();
          moveTo(current - 1);
          break;
        case "ArrowRight":
          event.preventDefault();
          moveTo(rtl ? current - 1 : current + 1);
          break;
        case "ArrowLeft":
          event.preventDefault();
          moveTo(rtl ? current + 1 : current - 1);
          break;
        case "Home":
          event.preventDefault();
          moveTo(0);
          break;
        case "End":
          event.preventDefault();
          moveTo(MODE_ORDER.length - 1);
          break;
        default:
          break;
      }
    };

    const labels: Record<ThemeMode, string> = {
      light: lightLabel,
      dark: darkLabel,
      system: systemLabel,
    };

    return (
      <div
        ref={ref}
        data-slot="mode-toggle"
        data-mode={mode}
        role="radiogroup"
        aria-label={label}
        aria-disabled={disabled || undefined}
        onKeyDown={handleKeyDown}
        className={cn(modeToggleVariants(), disabled && TRACK_DISABLED, className)}
        {...props}
      >
        {MODE_ORDER.map((value, index) => {
          const selected = value === mode;
          return (
            <button
              key={value}
              ref={(node) => {
                segmentRefs.current[index] = node;
              }}
              type="button"
              role="radio"
              data-slot="mode-toggle-segment"
              data-mode={value}
              aria-checked={selected}
              // Roving tabindex: one stop for the whole group, arrows inside.
              tabIndex={selected ? 0 : -1}
              disabled={disabled}
              onClick={() => select(value)}
              className={cn(
                SEGMENT_BASE,
                selected && SEGMENT_SELECTED,
                disabled && SEGMENT_DISABLED,
              )}
            >
              {labels[value]}
            </button>
          );
        })}
      </div>
    );
  },
);

ModeToggle.displayName = "ModeToggle";

export { ModeToggle, modeToggleVariants };
