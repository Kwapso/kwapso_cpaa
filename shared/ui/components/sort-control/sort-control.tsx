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
   · THERE IS NO CHEVRON — `hideChevron` on `SelectTrigger`, client ruling
     below. Nothing in this file names a side, so the chip still mirrors.
   · Focus is the one global rule (tokens.css §8). The field moves its own
     HAIRLINE to ink on focus, which is a fill colour and not a ring.
   · Disabled is a fill and an ink — the field's hairline at 8%, a step down
     from the resting 20% (override 42), and the hover withdrawn from both
     halves. Neither is an opacity and neither is mango. AT REST, both halves
     now answer to `--btn-secondary-hover` — client, 2026-09-02: the field
     took `ViewSwitch`'s pill, hover included, so the chip no longer has a
     field half with no hover standing next to a button half with `--accent`'s.
     See `fieldVariants` and `directionVariants`'s own headers.
   · Every string is a prop with a default: "Sort by", "Ascending",
     "Descending", and the direction control's own name.

   ORDER FLIP (client, 2026-09-02) — verbatim: "on the sort by, cange the
   ordre: so on tge left of the fused we have the arrow and on the right the
   value and dropdow." The chip's DOM order is now [direction, field]: the
   arrow button first, the field (the value — and, until CHEVRON REMOVED
   below the same day, a chevron after it) second. Rounding follows
   the DOM, not the words "left"/"right" — `directionVariants` now owns
   `rounded-s-pill rounded-e-none` (its outer corner is the chip's START) and
   `fieldVariants`'s `fused` variant now owns `rounded-e-pill rounded-s-none`
   (its outer corner is the chip's END). Reasoned in logical terms so this
   still mirrors correctly under `dir="rtl"` — see the RTL paragraph on
   `SortControl` itself, updated to match.

   CHEVRON REMOVED (client, 2026-09-02, later the same day) — verbatim: "on
   the sort, rmeove the chevron after the word. i know its a button". The
   field now passes `hideChevron` to `SelectTrigger`; `ViewSwitch` took the
   same ruling in the same breath ("same on views - rmeove the chevron"), so
   the toolbar's three pills — filter chip, sort chip, view pill — are once
   again ONE family, and the family is now caret-free throughout. The filter
   chip never had one, which is why removing it from these two closes a gap
   rather than opening one.

   NOTHING ELSE MOVED. The direction segment is untouched — its own 40 square,
   its own start-pill rounding, its own arrow — because it is a separate and
   recently approved design. The field keeps `--space-4h` (18) of padding on
   both sides and `--control-height-button` (40), so the pill's HEIGHT and its
   INSET are exactly what they were; only the chevron's own 16 and the
   trigger's 8 of `gap-2` leave, which is 24 off a `w-auto` pill's WIDTH and
   nothing else. Measured: verify/toolbar-trio.

   THE BUSY SPINNER MOVED WITH IT, and it had to. It used to be absolutely
   positioned at `end-3`, ON TOP of the chevron, in the 24 the chevron
   reserved. With the chevron gone that 24 is gone too, and an opaque
   `--hair-faint` disc at `end-3` would have landed on the last ~10px of the
   VALUE instead. So the spinner is now an ordinary trailing CHILD of the
   trigger, taking the chevron's old place rather than floating over it: no
   overlap, and a loading pill is the exact width the resting pill used to be.
   `justify-between` needs no help here — the trigger is `w-auto`, so there is
   never free space for it to distribute and the two children sit on the
   trigger's own `gap-2`, as the value and the chevron did.

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
import { ArrowDown, ArrowUp, Loader2 } from "../../foundations/icons";

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
   height (a toolbar control is 40 or 32, not the 44 form field), the
   read-only skin, which `Select` has no state for, and — client, 2 Sep
   2026 — the FIELD's outer shape, now that it shares one chip with the
   direction control instead of standing beside it with a gap: this end
   keeps the pill, the other end squares off where the two meet. Everything
   else the two share — the open ink above all — is `select.tsx`'s and is not
   restated here. The chevron used to be on that shared list; it is now
   declined at the call site with `hideChevron`, which is a prop and not a
   class for the reason `select.tsx` gives on the prop itself.

   THE RESTING FILL IS NO LONGER `select.tsx`'s CH09 FIELD SKIN — a second,
   later ruling the same day. Client, verbatim: "all the components in
   toolbar (the sort, the filter, the view) i want them in the same pill
   aspect exactly. match filter and sort to the existing view selector
   component (i am happy with how that is)". `ViewSwitch` draws through this
   same `SelectTrigger` and overrides exactly this: `--btn-secondary-fill`,
   `shadow-none` (no hairline), `--btn-secondary-hover` on hover, weight 500.
   Until this ruling the field kept `select.tsx`'s own bordered-field skin —
   `bg-background`, the `--hair-strong` hairline, weight 300, no hover — which
   was CH09's own field law and correct for a lone select, but is a visibly
   different pill from `ViewSwitch` standing next to it: a different
   background token (`--background` against `--btn-secondary-fill`, the same
   colour only by coincidence in light mode and NOT in dark, where `--card`
   and `--background` split), a hairline `ViewSwitch` has none of, and no
   hover where `ViewSwitch` has one. Overriding it here — rather than
   defaulting `state: "default"` to the empty string `select.tsx` already
   gives every other trigger — is what the client's "match ... exactly"
   asks for. `select.tsx`'s OPEN/FOCUS ink hairline is untouched: it is
   `enabled:focus:`- and `enabled:data-[state=open]:`-scoped, so `shadow-none`
   here only drops the RESTING edge, exactly as `ViewSwitch`'s own header
   documents for its own copy of this override. */
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
      /** `ViewSwitch`'s own pill, restated here — see the note above. */
      default:
        "shadow-none bg-[var(--btn-secondary-fill)] text-[var(--btn-secondary-label)] enabled:hover:bg-[var(--btn-secondary-hover)] font-[var(--font-weight-medium)]",
      /** A fill and an ink. `SelectTrigger`'s own `disabled:` rules do the rest. */
      disabled: "",
      /** Busy: the value has not arrived, so it may not be changed. The
          hairline goes entirely — "system-set values lose the border" —
          and the faint fill says the control is not yours right now. */
      readOnly: "cursor-default bg-hair-faint text-foreground shadow-none",
    },
    /** `showDirection` reaching this half of the pair — see the file header.
        A list with one natural order (`showDirection: false`) keeps the
        field's own full pill, nothing squared off with nothing to meet it.
        Since the ORDER FLIP (client, 2026-09-02) the field is the SECOND
        (end) half of the chip, so it is the END corner that stays a pill. */
    fused: {
      true: "rounded-e-pill rounded-s-none",
      false: "",
    },
  },
  defaultVariants: { size: "default", state: "default", fused: false },
});

/* FUSED WITH THE FIELD (client, 2 Sep 2026) — her reference artifact draws
   one seamless chip, not a bordered field with a bare icon floating beside
   it on a gap. Only the OUTER corner stays a pill — `rounded-s-pill
   rounded-e-none` since the ORDER FLIP the same day (see the file header)
   made this control the FIRST (start) half of the chip; the shared inner
   edge squares off against the field's matching edge (`fused` on
   `fieldVariants` above).

   THE RESTING SKIN IS NOW THE FIELD'S NEW ONE, NOT `select.tsx`'s — same
   ruling, same day, second half. This half used to mirror the CH09 field
   hairline the field wore (`bg-background`, `--hair-strong`, `--accent`
   hover): two 1px inset shadows on the exact same line, reading as one
   continuous border. Now that the field itself has moved to `ViewSwitch`'s
   borderless `--btn-secondary-fill` pill (see `fieldVariants`'s header), a
   hairline mirrored from the field's OLD skin would put a border back on one
   half of a chip that no longer has one on the other — the seam the fusion
   was written to erase would reappear on this side alone. So this half now
   mirrors the field's CURRENT skin instead: the same `--btn-secondary-fill`,
   `shadow-none` at rest, and `--btn-secondary-hover` in place of the
   `--accent` wash, so a hover anywhere on the chip answers in the one colour
   the whole pill now stands on. The things that make this control a BUTTON
   and not a field are untouched: the active-press nudge, and the
   focus-visible ink shadow, which is this control's own fill-coloured
   answer to the global ring (tokens.css §8), not a border it borrows from
   the field. */
const directionVariants = cva(
  [
    "grid shrink-0 cursor-pointer place-content-center",
    "appearance-none rounded-s-pill rounded-e-none border-0",
    "enabled:active:translate-y-[0.0625rem]",
    "enabled:focus-visible:shadow-[inset_0_0_0_0.0625rem_var(--foreground)]",
    "transition-[background-color,box-shadow,color,translate]",
    "duration-[var(--duration-colour)] ease-kwapso",
  ],
  {
    variants: {
      size: {
        default: "size-[var(--control-height-button)]",
        sm: "size-[var(--control-height-dense)]",
      },
      state: {
        /** `ViewSwitch`'s own pill, restated here — see the note above. */
        default:
          "shadow-none bg-[var(--btn-secondary-fill)] text-ink-secondary enabled:hover:bg-[var(--btn-secondary-hover)] enabled:hover:text-foreground",
        /** Mirrors the field's own disabled edge (override 42: `--border`
            is the weak 8% stroke, never the resting 20%). */
        disabled: "cursor-not-allowed shadow-[inset_0_0_0_0.0625rem_var(--border)] bg-hair-faint text-ink-disabled",
        /** Mirrors the field's own read-only skin exactly — the hairline
            goes entirely and the faint fill carries the state alone. */
        readOnly: "cursor-default shadow-none bg-hair-faint text-foreground",
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
 *  1. default        — the field with the current key and NO chevron (client,
 *                      2026-09-02: "i know its a button"), the direction
 *                      control fused to its inline start.
 *  2. hover          — `--btn-secondary-hover` on BOTH halves, client,
 *                      2026-09-02: the field took `ViewSwitch`'s pill, hover
 *                      included, so the fused chip answers in one colour
 *                      wherever it is hovered rather than a field half with
 *                      none and a button half with `--accent`'s. Named
 *                      tokens, not opacities.
 *  3. focus-visible  — NOT here. tokens.css §8 rings the field and the
 *                      direction control at the pill radius. The field also
 *                      moves its own hairline to ink, which is a fill colour.
 *  4. active/pressed — the direction control takes the kit's 1px nudge. The
 *                      field does not move: a picker opening is not a press.
 *  5. disabled       — both parts: `--hair-faint` / `--ink-disabled` on the
 *                      field, `--btn-disabled-fill` / `--btn-disabled-label` on
 *                      the direction control. A fill and an ink.
 *  6. loading        — the read-only skin, `aria-busy`, and the spinner in
 *                      the place the chevron used to hold, at the field's
 *                      inline end. The direction control is inert for the
 *                      duration.
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
 * RTL — safe, and this is the component where it matters most. Since the
 * ORDER FLIP (client, 2026-09-02) the chip is [direction, field] in DOM
 * order: the direction control sits at the chip's inline START
 * (`rounded-s-pill`, first child, no literal side), and the field carries the
 * value alone — the chevron was removed the same day, so there is no longer a
 * second glyph inside the field to place. Reasoned in logical properties
 * throughout, so in Arabic, Urdu and Persian the whole chip mirrors: logical
 * start is the visual RIGHT, so the arrow renders on the right and the field
 * on the left — the same mirrored relationship LTR readers see reversed. The
 * busy spinner is the field's own inline-end child and mirrors with it. Radix
 * mirrors the list's own alignment from `dir`. The up/down arrows are
 * vertical and mean the same thing in every script.
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

        {/* THE PAIR, ONE CHIP — client, 2 Sep 2026. `sortControlVariants`'s
            own `gap-2` still separates the LABEL from this group; inside it
            the two halves sit with no gap at all, because they now draw one
            continuous hairline between them rather than leaving room for a
            border on each side of empty air (see `fieldVariants`'s `fused`
            and `directionVariants`'s own header). */}
        <span className="inline-flex min-w-0 items-center">
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

          <span data-slot="sort-control-field" className="inline-flex min-w-0 items-center">
            <Select value={currentValue} onValueChange={handleValue} disabled={inert}>
              <SelectTrigger
                id={fieldId}
                data-slot="sort-control-select"
                aria-busy={loading || undefined}
                aria-labelledby={labelId}
                /* NO CHEVRON — client, 2026-09-02: "on the sort, rmeove the
                   chevron after the word. i know its a button". See the file
                   header for what does and does not move with it. */
                hideChevron
                className={cn(fieldVariants({ size, state, fused: showDirection }))}
              >
                <SelectValue />
                {/* Busy: the spinner takes the chevron's old place at the
                    field's inline end — a real child, not an overlay, now
                    that there is no reserved 24 to float inside. It is
                    decoration (`aria-busy` on the trigger is what announces)
                    and the trigger is disabled for the duration, so it needs
                    no pointer rules of its own. */}
                {loading ? (
                  <span
                    aria-hidden="true"
                    data-slot="sort-control-spinner"
                    className="grid shrink-0 place-content-center text-ink-tertiary"
                  >
                    <Loader2 size={16} className="motion-spinner" />
                  </span>
                ) : null}
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
          </span>
        </span>
      </div>
    );
  },
);

SortControl.displayName = "SortControl";

export { SortControl, sortControlVariants };
