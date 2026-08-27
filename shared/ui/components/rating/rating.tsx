/* ============================================================================
   Rating — the five-star capture control (0 direct call sites; reached
   through the screen engine as a field type).

   DESIGN SOURCE
   design-mothership/specimens/_fragments/t10.css → `.kw-rating`,
     `.kw-rating__star`, `.kw-rating__star--on` (chapter 10, selection
     controls): a flex row at `--space-1` (4), stars at 20 from the icon
     scale, ON at the primary ink and OFF at `--surface-quiet`.
   design-mothership/specimens/_fragments/t10-selection.html — the drawn
     specimen is `role="img"` with a single label ("Rated 4 of 5") and five
     `aria-hidden` glyphs, and the caption under it is the whole scope rule:
     "Used only in feedback capture, never as a data display."

   THE LAW THIS FILE OBEYS
   · The filled star is INVERSE (`--surface-inverse`), never mango. That is
     the standing chapter-10 ruling for every on-state in the system. t10.css
     writes `--ink-primary` for the same mark; the two tokens resolve to the
     SAME value in both palettes (charcoal in light, off-beige in dark), so
     there is nothing to reconcile — the ruling's token is used and this note
     records why the specimen reads differently.
   · The empty star is `--surface-quiet`. Not an alpha of the filled star: an
     alpha of a token is a colour the palette does not contain.
   · Focus is ONE global rule (tokens.css §8). Each star is a real button and
     the ring lands on it at its own radius. No ring is defined here and
     nothing sets `outline: none`.
   · Disabled is an ink, never an opacity — `--ink-disabled` on every star,
     filled or not, because a disabled control states "you may not answer",
     not "the answer is three".
   · The artwork is `Star` from `icons/`, never an inlined SVG. Its glyphs are
     placeholder; the name, the API and the five sizes are final.
   · Every announced string is a prop with a default, including the ones only
     a screen reader hears.

   THE ONE THING THAT NEEDED REAL CARE: THE ROW RUNS IN READING ORDER
   A rating is a horizontal scale, so its keyboard has an inline axis, and an
   inline axis mirrors. `ArrowRight` must RAISE the value in English and LOWER
   it in Arabic, Urdu and Persian, or the control argues with the writing
   direction. The direction is read from the element's own computed style at
   the moment of the keypress rather than from a prop, so a subtree that sets
   `dir` is handled without the call site knowing. `ArrowUp` / `ArrowDown` are
   bound to increase / decrease unconditionally — the block axis does not
   mirror in any of the three languages.

   RENDERING CONTEXT
   `"use client"`. This module holds hover state, resolves an uncontrolled
   value and attaches keyboard and pointer handlers during its own render.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { Star } from "../../foundations/icons";

/* `.kw-rating` — the row. Chapter 10 draws it `display: flex; gap: 8px`, so
   `--space-2` it is. It used to be 4, on the reasoning that five marks read as
   one control; the chapter draws 8 and the chapter is the artifact.
   GAPS-FIDELITY-BC RAT-B1. */
const rowClasses = ["inline-flex items-center gap-2"];

/* One star's box. A button, not a span: the row is operable, and the ring
   the token layer draws has to land on something. */
const starClasses = [
  "inline-grid shrink-0 place-content-center",
  "border-0 bg-transparent p-0",
  "rounded-[var(--radius-select)]",
  // The glyph inherits this, so the fill is one colour decision per star.
  "motion-step",
];

export interface RatingProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onChange" | "defaultValue"> {
  /** The chosen number of stars, controlled. `null` means nothing chosen yet. */
  value?: number | null;
  /** The starting value when the control manages its own. Default `0` — nothing chosen. */
  defaultValue?: number;
  /** How many stars there are. The kit draws five; the count is a prop, not a law. */
  max?: number;
  /** Fired with the new value. Absent, the control is display-only. */
  onValueChange?: (value: number) => void;
  /** The reader may see the value but not set it. Renders as one image, the way the kit draws it. */
  readOnly?: boolean;
  /** The control cannot be answered. A fill-free ink change, never an opacity. */
  disabled?: boolean;
  /** The field failed validation. Forwarded as `aria-invalid`; the stars are not recoloured. */
  invalid?: boolean;
  /** Submitted with a surrounding form, through one hidden input. */
  name?: string;
  /**
   * The control's accessible name. Defaulted so no call site ships a nameless
   * scale, and a prop because the apps run in Arabic, Urdu and Persian.
   */
  label?: string;
  /**
   * The whole control's value in words, used for the read-only image and for
   * `aria-valuetext`. The kit's own specimen says "Rated 4 of 5"; the digits
   * come from `formatNumber` so a locale with its own numerals gets them.
   */
  formatValue?: (value: number, max: number) => string;
  /**
   * One star's accessible name — what choosing it would mean. Separate from
   * `formatValue` because "4 of 5" describes a state and "Rate 4 of 5"
   * describes an action, and the two are different sentences in every
   * language.
   */
  formatItem?: (value: number, max: number) => string;
  /**
   * Turns a number into digits. Defaults to the runtime's own locale, so a
   * document in `ar-EG-u-nu-arab` gets Arabic-Indic numerals without this
   * file knowing anything about numbering systems.
   */
  formatNumber?: (value: number) => string;
}

/** The runtime's own numerals. No locale is named, so the document's wins. */
function defaultFormatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { useGrouping: false }).format(value);
}

/**
 * The system's rating control.
 *
 * TEN STATES
 *  1. default        — a row of `max` stars, `value` of them inverse and the
 *                      rest `--surface-quiet`.
 *  2. hover          — the stars up to the cursor preview the value they
 *                      would set. Derived: the kit draws a static specimen
 *                      and states no hover (GAPS-CE RAT-2). It is a fill
 *                      swap between two defined tones, never a fade, and it
 *                      is suppressed entirely when the control is disabled or
 *                      read-only so a dead scale cannot look live.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the star's own radius. Roving `tabIndex` means one
 *                      tab stop for the whole scale, which is what a radio
 *                      group is.
 *  4. active/pressed — does not apply. A star's press IS its value change and
 *                      the change is instant; chapter 10 draws no pressed
 *                      skin for any selection control.
 *  5. disabled       — every star to `--ink-disabled`, `cursor: not-allowed`,
 *                      no hover preview, out of the tab order. An ink, never
 *                      an opacity.
 *  6. loading        — does not apply, deliberately. A rating rendered at
 *                      zero while its value loads shows "rated nothing",
 *                      which is a wrong answer rather than a missing one. The
 *                      caller renders a `Skeleton` in its place until the
 *                      value exists — the rule GAPS-B.md SEL-5 sets for every
 *                      control that holds a value.
 *  7. empty          — `value` of `0` or `null`: all stars `--surface-quiet`
 *                      and `aria-valuenow` absent. Nothing is invented to
 *                      fill the hole; an unrated thing is drawn as unrated.
 *                      `max={0}` renders `null` — a scale with no steps is
 *                      not a control.
 *  8. error          — `invalid` sets `aria-invalid` and nothing else. The
 *                      stars stay as drawn: chapter 9's rule is that the
 *                      poppy lives on the control's border and the message,
 *                      and a star has no border to colour. The message
 *                      belongs to `Field`. GAPS-CE RAT-3.
 *  9. selected       — the filled star, `--surface-inverse`. Chapter 10's
 *                      inverse on-state, not mango.
 * 10. read-only      — `readOnly`: the kit's own drawing. The row collapses
 *                      to a single `role="img"` with one label and every star
 *                      `aria-hidden`, because five buttons you cannot press
 *                      is five tab stops that do nothing.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The kit states one star size (20)
 *  and one gap (4) and varies neither by width. The control is `inline-flex`,
 *  so it is exactly as wide as five stars at every width and never reflows.
 *  A 20 star inside a 20 button is under the 44 touch row; that is the same
 *  trade chapter 10 accepts for every mark in the chapter (GAPS-B.md SEL-6),
 *  and unlike a checkbox a rating has no label row to widen the target with —
 *  logged separately as GAPS-CE RAT-4 rather than silently grown on a phone.
 *
 * RTL — the row is `flex` in DOM order, so star 1 sits at the reading start
 * in Arabic, Urdu and Persian without a rule. The KEYBOARD mirrors too: see
 * the header. The glyph itself is not mirrored — a star is a symbol, not a
 * direction.
 */
const Rating = React.forwardRef<HTMLDivElement, RatingProps>(
  (
    {
      className,
      value,
      defaultValue = 0,
      max = 5,
      onValueChange,
      readOnly = false,
      disabled = false,
      invalid = false,
      name,
      label = "Rating",
      formatValue,
      formatItem,
      formatNumber = defaultFormatNumber,
      ...props
    },
    ref,
  ) => {
    const controlled = value !== undefined;
    const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
    const [preview, setPreview] = React.useState<number | null>(null);

    const current = controlled ? (value ?? 0) : uncontrolled;
    const live = disabled || readOnly ? current : (preview ?? current);

    // Empty: a scale with no steps is not a control.
    if (max <= 0) return null;

    const stars = Array.from({ length: max }, (_, i) => i + 1);
    const interactive = !readOnly && !disabled;

    const describe =
      formatValue ?? ((v: number, m: number) => `${formatNumber(v)} / ${formatNumber(m)}`);
    const describeItem = formatItem ?? describe;

    const commit = (next: number) => {
      if (!interactive) return;
      if (!controlled) setUncontrolled(next);
      onValueChange?.(next);
    };

    /* The inline axis mirrors; the block axis does not. Direction is read off
       the element at keypress time so a `dir` set anywhere above works. */
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!interactive) return;
      const key = event.key;
      if (
        key !== "ArrowLeft" &&
        key !== "ArrowRight" &&
        key !== "ArrowUp" &&
        key !== "ArrowDown" &&
        key !== "Home" &&
        key !== "End"
      ) {
        return;
      }
      event.preventDefault();

      if (key === "Home") return commit(1);
      if (key === "End") return commit(max);

      const rtl =
        typeof window !== "undefined" &&
        window.getComputedStyle(event.currentTarget).direction === "rtl";
      const forward =
        key === "ArrowUp" || (key === "ArrowRight" ? !rtl : key === "ArrowLeft" ? rtl : false);

      const next = forward ? Math.min(current + 1, max) : Math.max(current - 1, 0);
      commit(next);
    };

    /* Read-only is the kit's own drawing: one image with one label, and the
       glyphs are decoration inside it. */
    const rowProps = readOnly
      ? ({ role: "img", "aria-label": `${label}: ${describe(current, max)}` } as const)
      : ({
          role: "radiogroup",
          "aria-label": label,
          "aria-disabled": disabled || undefined,
          "aria-invalid": invalid || undefined,
          /* No `aria-valuetext`: a radiogroup is not a range widget and the
             attribute would be dropped. The value is announced by whichever
             radio is checked, whose name comes from `formatItem`. */
          onKeyDown: handleKeyDown,
          onPointerLeave: () => setPreview(null),
        } as const);

    return (
      <div
        ref={ref}
        data-slot="rating"
        data-state={current > 0 ? "rated" : "empty"}
        data-disabled={disabled ? "" : undefined}
        data-readonly={readOnly ? "" : undefined}
        className={cn(rowClasses, className)}
        {...rowProps}
        {...props}
      >
        {stars.map((star) => {
          const on = star <= live;
          const glyph = (
            <Star
              /* Chapter 10 draws the star at `width="22" height="22"`, which
                 is `--icon-22` — a real rung on the ladder, so nothing is
                 invented by taking it. Was 20. GAPS-FIDELITY-BC RAT-B1. */
              size={22}
              aria-hidden="true"
              className={cn(
                disabled
                  ? "text-ink-disabled"
                  : on
                    // Chapter 10's inverse on-state. Identical in value to
                    // t10.css's `--ink-primary`; see the header.
                    ? "text-[var(--surface-inverse)]"
                    : "text-surface-quiet",
              )}
            />
          );

          if (readOnly) {
            return (
              <span key={star} data-slot="rating-star" data-on={on ? "" : undefined}>
                {glyph}
              </span>
            );
          }

          return (
            <button
              key={star}
              type="button"
              data-slot="rating-star"
              data-on={on ? "" : undefined}
              role="radio"
              aria-checked={star === current}
              aria-label={describeItem(star, max)}
              disabled={disabled}
              // Roving tab stop: the whole scale is one stop, like a radio
              // group. With nothing chosen the first star holds it.
              tabIndex={star === (current || 1) ? 0 : -1}
              onClick={() => commit(star)}
              onPointerEnter={() => interactive && setPreview(star)}
              onFocus={() => interactive && setPreview(star)}
              onBlur={() => setPreview(null)}
              className={cn(
                starClasses,
                interactive ? "cursor-pointer" : "cursor-not-allowed",
              )}
            >
              {glyph}
            </button>
          );
        })}

        {name !== undefined ? (
          <input type="hidden" name={name} value={current > 0 ? String(current) : ""} />
        ) : null}
      </div>
    );
  },
);

Rating.displayName = "Rating";

export { Rating };
