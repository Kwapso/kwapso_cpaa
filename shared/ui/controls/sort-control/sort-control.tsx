/* ============================================================================
   SortControl — pick a key, pick a direction (1 direct call site).

   DESIGN SOURCE
   · design-mothership/specimens/_fragments/t9.css → the chapter-9 field skin,
     which is what a closed picker wears: a full pill, one `--border`
     hairline at `--hair-strong` and going to ink on focus (override 42).
   · design-mothership/specimens/kwapso-ui.css → `.kw-btn` for the direction
     control's geometry, and `--accent` as the neutral hover. Never mango.
   · components/primitives/select/select.tsx — THE trigger and THE menu, used
     directly, so the two controls cannot disagree.
   The kit draws no sort control of its own; GAPS-G.md SRT-1 … SRT-4.

   REVIEW ROUND 1 · WHY THE NATIVE <select> IS GONE
   This file used to render a native `<select>`, on the argument that the
   platform's own picker survives a scroller, a sheet and a table header, and
   gives a phone a wheel for free. The review found what that argument cost:
   the OPEN MENU IS NOT THE APPLICATION'S. Its paper, its ink and its
   highlight are the user agent's, chosen from the machine's colour scheme —
   so on a reader whose OS is dark, "Sort by" opened a BLACK menu in the
   middle of the light app, and no token in this system could reach it. Dark
   in this kit is a token flip; a surface that answers to something other
   than the tokens is the bug, whether the wrong colour is written in this
   file or handed over by the browser.

   The menu is now `SelectContent`: `--popover` paper at the 24 radius under
   `--shadow-overlay`, `--accent` on the row you are on, portalled so it still
   escapes a scroller, and painted from the same variables as everything
   around it in both modes. The public API did not move — `options`, `value`,
   `defaultValue`, `onValueChange`, `direction`, the labels, `size`, `loading`
   and `disabled` are all unchanged, and `SortControl` is still the only
   export beside `sortControlVariants`. GAPS-REVIEW1B SRT-5 records the
   remaining half of the problem, which this file cannot fix: tokens.css
   declares no `color-scheme`, so every OTHER piece of user-agent furniture —
   scrollbars, the native date picker, an autofill panel — is still painted
   by the machine rather than by the app.

   THE LAW THIS FILE OBEYS
   · NO CSS `border`, anywhere. The field's hairline is an inset shadow, which
     is how the artifact draws its own (`box-shadow: inset 0 0 0 1px
     var(--hair)`, CH19) and how `select.tsx` now draws the same field.
   · Bars take `--radius-sm`, boxes `--radius`, chips and controls the pill.
     This is a control: `--radius-pill`, on the field and on the direction
     button both.
   · THE CHEVRON SITS AT THE INLINE END — `SelectTrigger` places it with
     `justify-between`, never a named side, so it moves to the visual start in
     Arabic, Urdu and Persian.
   · Focus is the one global rule (tokens.css §8). The field moves its own
     HAIRLINE to ink on focus, which is a fill colour and not a ring.
   · Disabled is a fill and an ink — the field's hairline at 8%, a step down
     from the resting 20% (override 42), and `--accent` withdrawn from the
     direction button. Neither is an opacity and neither is mango. The FIELD
     has no hover at all; the direction button, which is a button and not a
     field, keeps its `--accent` wash.
   · Every string is a prop with a default: "Sort by", "Ascending",
     "Descending", and the direction control's own name.

   RENDERING CONTEXT
   `"use client"`. It holds the uncontrolled key and direction, and attaches
   handlers.
   ========================================================================= */

"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../select/select";
import { ArrowDown, ArrowUp, Loader2 } from "../../icons";

export type SortDirection = "asc" | "desc";

export interface SortOption {
  /** Stable key, passed back to `onValueChange`. */
  value: string;
  /** What the row says. Translatable at the call site, where the data is. */
  label: string;
  disabled?: boolean;
}

const sortControlVariants = cva(["inline-flex min-w-0 items-center gap-2"], {
  variants: {
    /** Both heights are the kit's; neither is invented. */
    size: {
      /** 40 — `--control-height-button`, the standing control height. */
      default: "",
      /** 32 — `--control-height-dense`, for a table header or a toolbar. */
      sm: "",
    },
  },
  defaultVariants: { size: "default" },
});

/* What this control changes about `SelectTrigger`, and nothing else: the
   height (a toolbar control is 40 or 32, not the 44 form field) and the
   read-only skin, which `Select` has no state for. Everything the two share —
   the pill, the hairline, the open ink, the chevron — is `select.tsx`'s and
   is not restated here. OVERRIDE 42 reaches this control through that file:
   the resting edge is `--hair-strong`, disabled keeps 8%, and the hover
   `select.tsx` used to draw is gone with nothing in its place. */
const fieldVariants = cva(["w-auto"], {
  variants: {
    size: {
      /** 40 — `--control-height-button`, the standing control height. */
      default: "h-[var(--control-height-button)]",
      /** 32 — `--control-height-dense`, for a table header or a toolbar. */
      sm: "h-[var(--control-height-dense)]",
    },
    /** Mutually exclusive. Resolved once, in JS, below. */
    state: {
      default: "",
      /** A fill and an ink. `SelectTrigger`'s own `disabled:` rules do the rest. */
      disabled: "",
      /** Busy: the value has not arrived, so it may not be changed. The
          hairline goes entirely — "system-set values lose the border" —
          and the faint fill says the control is not yours right now. */
      readOnly: "cursor-default bg-hair-faint text-foreground shadow-none",
    },
  },
  defaultVariants: { size: "default", state: "default" },
});

const directionVariants = cva(
  [
    "grid shrink-0 cursor-pointer place-content-center",
    "appearance-none rounded-pill border-0 bg-transparent",
    "text-ink-secondary",
    "enabled:hover:bg-accent enabled:hover:text-foreground",
    "enabled:active:translate-y-[0.0625rem]",
    "transition-[background-color,color,translate]",
    "duration-[var(--duration-colour)] ease-kwapso",
  ],
  {
    variants: {
      size: {
        default: "size-[var(--control-height-button)]",
        sm: "size-[var(--control-height-dense)]",
      },
      state: {
        default: "",
        /** A fill and an ink. Never an opacity. */
        disabled:
          "cursor-not-allowed bg-[var(--btn-disabled-fill)] text-[var(--btn-disabled-label)]",
        readOnly: "cursor-default text-ink-tertiary",
      },
    },
    defaultVariants: { size: "default", state: "default" },
  },
);

export interface SortControlProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onChange" | "defaultValue">,
    VariantProps<typeof sortControlVariants> {
  /** The keys that can be sorted on. No options renders nothing at all. */
  options?: SortOption[];
  /** Controlled key. */
  value?: string;
  /** Uncontrolled starting key. Defaults to the first option. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Controlled direction. */
  direction?: SortDirection;
  /** Uncontrolled starting direction. */
  defaultDirection?: SortDirection;
  onDirectionChange?: (direction: SortDirection) => void;
  /**
   * The control's name — "Sort by". Drawn beside the field unless `hideLabel`,
   * and in either case it is the field's accessible name, so the control is
   * never nameless. Translatable.
   */
  label?: string;
  /** Hide the label visually. It still names the field for a screen reader. */
  hideLabel?: boolean;
  /** The direction control's name. Translatable. */
  directionLabel?: string;
  /** Announced as the direction control's current state. Translatable. */
  ascendingLabel?: string;
  /** Announced as the direction control's current state. Translatable. */
  descendingLabel?: string;
  /** Draw the direction control. Off for a list with one natural order. */
  showDirection?: boolean;
  /**
   * Busy. The field goes read-only and announces, and the direction control
   * stops: re-sorting a list that is still arriving asks the server twice for
   * two different answers and shows whichever lands last.
   */
  loading?: boolean;
  disabled?: boolean;
}

/**
 * The list-ordering control: a key and a direction.
 *
 * TEN STATES
 *  1. default        — the field with the current key, the chevron at the
 *                      inline end, the direction control beside it.
 *  2. hover          — does not apply to the FIELD half. CH09 draws no hover
 *                      on a field and the 20% the old one promoted to is now
 *                      the resting edge (override 42). `--accent` on the
 *                      direction control. Named tokens, not opacities.
 *  3. focus-visible  — NOT here. tokens.css §8 rings the field and the
 *                      direction control at the pill radius. The field also
 *                      moves its own hairline to ink, which is a fill colour.
 *  4. active/pressed — the direction control takes the kit's 1px nudge. The
 *                      field does not move: a picker opening is not a press.
 *  5. disabled       — both parts: `--hair-faint` / `--ink-disabled` on the
 *                      field, `--btn-disabled-fill` / `--btn-disabled-label` on
 *                      the direction control. A fill and an ink.
 *  6. loading        — the read-only skin, `aria-busy`, and the spinner sits
 *                      over the chevron. The direction control is inert for
 *                      the duration.
 *  7. empty          — no options: renders NOTHING. A sort control over a list
 *                      with nothing to sort by is chrome, and the kit's rule is
 *                      to prefer nothing over a disabled stub.
 *  8. error          — does not apply. A key is picked from a list this
 *                      component was given, so there is no invalid value to
 *                      report. A sort request that FAILED is a state of the
 *                      collection, which draws the register.
 *  9. selected       — the current key is the field's value and the current
 *                      direction is the arrow's own glyph, announced in words
 *                      by the control's accessible name.
 * 10. read-only      — shares the loading skin: the hairline goes and the
 *                      faint fill takes over, both controls inert, nothing
 *                      announced as busy unless it is.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The control is `inline-flex` and
 *  takes its width from the current value at every width; the list is at least
 *  as wide as the field and never taller than the space Radix measured, which
 *  is one rule at every width. Where a toolbar runs out of room, the
 *  toolbar scrolls — that is the composition's decision and `FilterBar` states
 *  the same answer for the same reason.
 *
 * RTL — safe, and this is the component where it matters most: the chevron
 * and the direction control both sit at the INLINE end (`justify-between`,
 * `end-*`, DOM order), so both move to the visual start in Arabic, Urdu and
 * Persian, and Radix mirrors the list's own alignment from `dir`. The up/down
 * arrows are vertical and mean the same thing in every script.
 */
const SortControl = React.forwardRef<HTMLDivElement, SortControlProps>(
  (
    {
      className,
      size = "default",
      options = [],
      value,
      defaultValue,
      onValueChange,
      direction,
      defaultDirection = "asc",
      onDirectionChange,
      label = "Sort by",
      hideLabel = false,
      directionLabel = "Sort direction",
      ascendingLabel = "Ascending",
      descendingLabel = "Descending",
      showDirection = true,
      loading = false,
      disabled = false,
      ...props
    },
    ref,
  ) => {
    const reactId = React.useId();
    const fieldId = `${reactId}-field`;
    const labelId = `${reactId}-label`;

    const [uncontrolledValue, setUncontrolledValue] = React.useState(
      () => defaultValue ?? options[0]?.value ?? "",
    );
    const valueControlled = value !== undefined;
    const currentValue = valueControlled ? value : uncontrolledValue;

    const [uncontrolledDirection, setUncontrolledDirection] =
      React.useState<SortDirection>(defaultDirection);
    const directionControlled = direction !== undefined;
    const currentDirection = directionControlled ? direction : uncontrolledDirection;

    // Nothing to sort by: render nothing.
    if (options.length === 0) return null;

    const state = disabled ? "disabled" : loading ? "readOnly" : "default";
    const inert = disabled || loading;

    const handleValue = (next: string) => {
      if (!valueControlled) setUncontrolledValue(next);
      onValueChange?.(next);
    };

    const flipDirection = () => {
      if (inert) return;
      const next: SortDirection = currentDirection === "asc" ? "desc" : "asc";
      if (!directionControlled) setUncontrolledDirection(next);
      onDirectionChange?.(next);
    };

    const DirectionGlyph = currentDirection === "asc" ? ArrowUp : ArrowDown;
    const glyphSize = size === "sm" ? 16 : 20;

    return (
      <div
        ref={ref}
        data-slot="sort-control"
        data-state={state}
        data-direction={currentDirection}
        className={cn(sortControlVariants({ size }), className)}
        {...props}
      >
        <label
          id={labelId}
          htmlFor={fieldId}
          className={cn(
            "shrink-0 text-caption text-ink-secondary",
            hideLabel && "sr-only",
            /* GENUINELY DISABLED — do not re-flag. GAPS-CONTRAST §2 row 7
               reports a `SortControl` label at 2.206:1 light / 3.689:1 dark;
               it is the `disabled` specimen, and this is the ONLY branch in
               this file that reaches for the exempt tier. A label bound by
               `htmlFor` to a dead control is part of an inactive user
               interface component, which WCAG 1.4.3 exempts by name. Nine of
               the ten labels the sweep measured read 8.083 / 11.312; the
               tenth is this one, and it is meant to. */
            disabled && "text-ink-disabled",
          )}
        >
          {label}
        </label>

        <span data-slot="sort-control-field" className="relative inline-flex min-w-0 items-center">
          <Select value={currentValue} onValueChange={handleValue} disabled={inert}>
            <SelectTrigger
              id={fieldId}
              data-slot="sort-control-select"
              aria-busy={loading || undefined}
              aria-labelledby={labelId}
              className={cn(fieldVariants({ size, state }))}
            >
              <SelectValue />
            </SelectTrigger>
            {/* The kit's own paper, in both modes. This is the whole of fix 4:
                the list is `--popover` at the 24 radius under the overlay
                shadow, not a surface the machine picked. */}
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Busy: the spinner sits OVER the field at the inline end, in front
              of the chevron, and takes no pointer events. Only drawn while
              loading — the chevron is `SelectTrigger`'s and stays its own. */}
          {loading ? (
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute end-3 grid place-content-center",
                "bg-hair-faint text-ink-tertiary",
              )}
            >
              <Loader2 size={16} className="motion-spinner" />
            </span>
          ) : null}
        </span>

        {showDirection ? (
          <button
            type="button"
            data-slot="sort-control-direction"
            disabled={inert}
            onClick={flipDirection}
            className={directionVariants({ size, state })}
          >
            <DirectionGlyph size={glyphSize} aria-hidden="true" />
            {/* The control's accessible name is its content, so it says both
                what the control is and which way the list is running now. */}
            <span className="sr-only">
              {directionLabel}
              {": "}
              {currentDirection === "asc" ? ascendingLabel : descendingLabel}
            </span>
          </button>
        ) : null}
      </div>
    );
  },
);

SortControl.displayName = "SortControl";

export { SortControl, sortControlVariants };
