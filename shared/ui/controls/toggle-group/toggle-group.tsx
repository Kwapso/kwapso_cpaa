/* ============================================================================
   ToggleGroup · ToggleGroupItem — the segmented control (3 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/_fragments/t10.css → `.kw-seg` and
     `.kw-seg__btn` / `.kw-seg__btn--active` (chapter 10, "Segmented"):
       container  inline-flex · gap --space-1 · padding --space-1 ·
                  --radius-pill · background --surface-raised ·
                  box-shadow --shadow-rest
       segment    --control-height-dense · padding-inline --space-4 · r999
       active     --surface-inverse fill · --ink-on-inverse label · weight 500
   design-mothership/specimens/_fragments/t10-selection.html → "Two to four
     options that change how the same data is drawn." (kit copy, verbatim)

   THE ONE CONFLICT THIS FILE RULES ON
   The active segment is INVERSE here, matching chapter 10 and matching
   `checkbox`, `radio-group`, `switch` and `toggle`; kwapso-ui.css ships the
   family's on-states MANGO. Both sides named in GAPS-B.md SEL-1.

   THE LAW THIS FILE OBEYS
   · The container is a raised pill with the rest shadow — "raised means what
     it means everywhere else in these fragments: raised surface plus the rest
     shadow". It carries NO border; the shadow is the whole treatment.
   · The segment skin is `toggle`'s, imported rather than restated, so the two
     cannot drift. That is why `toggleVariants` is exported there.
   · The kit draws the segmented control at the DENSE height, so this group
     defaults to `size="sm"` where a standalone `Toggle` defaults to 40. The
     two defaults differ on purpose and are both the kit's; logged as
     GAPS-B.md TGL-2.
   · Focus is ONE global rule (tokens.css §8). No ring here.

   RENDERING CONTEXT
   `"use client"`. `@radix-ui/react-toggle-group` holds state, owns roving
   focus and reads context.
   ========================================================================= */

"use client";

import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { toggleVariants } from "../toggle/toggle";

const toggleGroupClasses = [
  // The kit's raised pill: 4 of padding, 4 between segments, the rest shadow,
  // no border. `bg-card` is `--surface-raised`.
  "inline-flex items-center gap-1 p-1 rounded-pill border-0",
  "bg-card shadow-[var(--shadow-rest)]",
  "data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch",
];

/* ----------------------------------------------------------------------------
   The group's variant and size reach the items through context, so a call
   site sets density once on the container instead of on every segment. An
   item may still override by passing its own props, which is what the
   `??` fallbacks below are for.

   Defaulted to the kit's own drawing: the segmented control is dense.
   ------------------------------------------------------------------------- */
const ToggleGroupContext = React.createContext<VariantProps<typeof toggleVariants>>({
  variant: "default",
  size: "sm",
});

export type ToggleGroupProps = React.ComponentPropsWithoutRef<
  typeof ToggleGroupPrimitive.Root
> &
  VariantProps<typeof toggleVariants>;

export type ToggleGroupItemProps = React.ComponentPropsWithoutRef<
  typeof ToggleGroupPrimitive.Item
> &
  VariantProps<typeof toggleVariants>;

/**
 * The segmented control. `type="single"` is one choice of several;
 * `type="multiple"` is a set of independent toggles sharing one shell.
 *
 * The container needs an accessible name when the segments alone do not say
 * what is being chosen — pass `aria-label` or `aria-labelledby`. There is no
 * default, because a string baked into a component cannot be translated and
 * both apps run in Arabic, Urdu and Persian.
 *
 * TEN STATES
 *  1. default        — raised pill, `--shadow-rest`, 4 of padding.
 *  2. hover          — does not apply to the SHELL. The segments hover; the
 *                      container is a background and the kit gives it none.
 *  3. focus-visible  — NOT here. Radix gives the group roving focus, so the
 *                      ring lands on whichever SEGMENT holds the tab stop and
 *                      tokens.css §8 draws it.
 *  4. active/pressed — belongs to the segments.
 *  5. disabled       — passes to every segment through the native attribute.
 *                      The shell keeps its paper: greying the container as
 *                      well would say the group had vanished rather than that
 *                      it was frozen.
 *  6. loading        — does not apply. The kit draws two to four options that
 *                      change how the same data is drawn; the options are
 *                      known before the data is. The DATA's loading state
 *                      belongs to whatever the segments switch between.
 *  7. empty          — no children renders the empty pill: 8 of paper. A
 *                      segmented control with nothing to choose between
 *                      should not be on the page, and the kit draws no such
 *                      case; the caller renders nothing instead.
 *  8. error          — does not apply. Choosing a view cannot be invalid.
 *  9. selected       — belongs to the segments, one at a time under
 *                      `type="single"`, any number under `type="multiple"`.
 * 10. read-only      — does not apply. A set the user may not change is
 *                      `disabled`.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The kit caps the control at four
 *  options precisely so it never has to wrap or scroll; at every width it is
 *  one row of dense segments. A set that would need to collapse to an icon or
 *  move into a sheet is not a segmented control, it is a `Select`.
 *
 * RTL — safe. The row is ordered by `gap` and flexbox, both of which follow
 * the document direction; Radix mirrors its own arrow-key handling from
 * `dir`, which passes straight through.
 */
const ToggleGroup = React.forwardRef<
  React.ComponentRef<typeof ToggleGroupPrimitive.Root>,
  ToggleGroupProps
>(({ className, variant = "default", size = "sm", children, ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    data-slot="toggle-group"
    className={cn(toggleGroupClasses, className)}
    {...props}
  >
    <ToggleGroupContext.Provider value={{ variant, size }}>
      {children}
    </ToggleGroupContext.Provider>
  </ToggleGroupPrimitive.Root>
));

ToggleGroup.displayName = "ToggleGroup";

/**
 * One segment. Its skin is `toggle`'s, so the two can never drift apart.
 *
 * TEN STATES — identical to `Toggle`'s, which owns the drawing. In short:
 *  1. default        — no fill, secondary ink, dense height inside the shell.
 *  2. hover          — ink to `--foreground`, and only while off. Never a
 *                      wash: a wash under one segment would fight the inverse
 *                      of the segment beside it.
 *  3. focus-visible  — NOT here. tokens.css §8.
 *  4. active/pressed — the 1px nudge.
 *  5. disabled       — `--btn-disabled-label` ink, no fill on the default
 *                      variant. Inherited from the group or set here.
 *  6. loading        — does not apply; see the group.
 *  7. empty          — does not apply. A segment always carries a label.
 *  8. error          — does not apply.
 *  9. selected       — `--surface-inverse` fill, `--ink-on-inverse` label,
 *                      weight 500. Chapter 10 over kwapso-ui.css (SEL-1).
 * 10. read-only      — does not apply.
 *
 * THREE BREAKPOINTS — UNCHANGED, as the group.
 *
 * RTL — safe; see `Toggle`.
 */
const ToggleGroupItem = React.forwardRef<
  React.ComponentRef<typeof ToggleGroupPrimitive.Item>,
  ToggleGroupItemProps
>(({ className, variant, size, ...props }, ref) => {
  const context = React.useContext(ToggleGroupContext);

  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      data-slot="toggle-group-item"
      className={cn(
        toggleVariants({
          variant: variant ?? context.variant,
          size: size ?? context.size,
        }),
        className,
      )}
      {...props}
    />
  );
});

ToggleGroupItem.displayName = "ToggleGroupItem";

export { ToggleGroup, ToggleGroupItem, toggleGroupClasses };
