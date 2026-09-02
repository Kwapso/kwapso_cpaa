/* ============================================================================
   Select — the field that opens a list (43 direct call sites).

   DESIGN SOURCE
   The TRIGGER is a field. Chapter 9 draws it as one:
     design-mothership/specimens/_fragments/t9.css → `.kw-selectwrap`,
       `.kw-selectwrap__chevron` ("the field pill with a chevron … the select
       itself is a plain .kw-field__input"), chevron at `--icon-button` on
       `--ink-secondary`, with `--space-7` of room reserved for it.
     design-mothership/specimens/kwapso-ui.css → `.kw-field__input` for the
       skin `input.tsx` already carries: 44 tall, pill, page fill, one
       hairline at `--hair-strong` (override 42), focus hairline to ink.
     design-mothership/specimens/_fragments/t9-inputs.html lines 119-127 —
       the drawn specimen ("Sprint type" / "Maintenance").

   The LIST is an overlay. Chapter 12 draws every floating surface the same:
     design-mothership/specimens/_fragments/t12.css → `.kw-menu`
       (`--surface-raised` at `--radius-card` under `--shadow-overlay`, padded
       `--space-2h`) and `.kw-menu__item` (a pill row, `--space-2h`/`--space-3`
       of padding, 14/300, hover on the kit's own `--accent` wash).
     Chapter rule, verbatim: "Overlay shadow, 24px radius, no blur."

   THE LAW THIS FILE OBEYS
   · A select trigger is a FIELD and takes the field hairline — CH09's TWO
     strengths, `--hair-strong` at rest and `--border` (8%) disabled,
     override 42 — and
     the field's 44 height. That is the deliberate distinction from a button,
     which carries no border in any state.
   · The overlay is `--radius` (24), the overlay shadow and NO blur. Menus in
     this system are paper, not glass.
   · A menu row is a pill and its hover is `--accent`, the kit's neutral row
     wash. Never `--primary`: mango is a brand fill, never a hover, or every
     menu row turns mango.
   · Focus is ONE global rule (tokens.css §8). This file moves the trigger's
     HAIRLINE to ink on focus and while open, which is a fill colour and not a
     ring, and defines no ring. Nothing here sets `outline: none` — shadcn's
     select does, on both the trigger and every item, and that is a rejection.
   · Disabled is a fill and an ink (`--hair-faint` / `--ink-disabled`), never
     an opacity.
   · Motion is attached, not written: `.motion-anchored` from motion/motion.css
     opens the list on the kit's 4px rise and closes it on a straight fade,
     and `.motion-menu-item` carries the row's colour swap. No duration is
     written in this file.

   WHY `enabled:` GUARDS THE TRIGGER'S LIVE STATES
   A Select is disabled from the ROOT (`<Select disabled>`), so the trigger's
   own props never see it — a JS-resolved state like `input.tsx`'s would miss
   it entirely. Radix does put the native `disabled` attribute on the trigger
   button, so `:enabled` and `:disabled` are mutually exclusive there and
   exactly one class set can match. Everything live is `enabled:`-guarded;
   everything dead is `disabled:`-prefixed and therefore also outranks the
   unprefixed base. The one state still resolved in JS is error, because
   `error` and `aria-invalid` are two spellings of one thing.

   RENDERING CONTEXT
   `"use client"`. `@radix-ui/react-select` holds state, portals, measures and
   attaches handlers throughout.
   ========================================================================= */

"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { Check, ChevronDown, ChevronUp } from "../../foundations/icons";

/* ----------------------------------------------------------------------------
   Root, group and value are Radix's, unskinned.

   `Select` holds the open state and the value; `SelectGroup` is a labelled
   run of options and paints nothing on its own; `SelectValue` renders the
   chosen option's text inside the trigger and takes the `placeholder` from
   the call site — which is why this component hardcodes no string anywhere.
   ------------------------------------------------------------------------- */
const Select = SelectPrimitive.Root;
Select.displayName = "Select";

const SelectGroup = SelectPrimitive.Group;
SelectGroup.displayName = "SelectGroup";

const SelectValue = SelectPrimitive.Value;
SelectValue.displayName = "SelectValue";

const selectTriggerVariants = cva(
  [
    "flex w-full min-w-0 appearance-none items-center justify-between gap-2",

    // 44 tall · 18 inline padding (`--space-4h`, CH09) · full pill · one
    // hairline (FLD-B2). The hairline is
    // an INSET SHADOW, never a CSS `border`: the global rule is that no
    // component in this system carries one at any thinness, and the artifact
    // draws its own field hairline the same way — `box-shadow: inset 0 0 0
    // 1px var(--hair)` on the 999-radius search pill, CH19.
    "h-[var(--control-height-input)] px-[var(--space-4h)] rounded-pill",
    "bg-background text-foreground",

    // 14/300 — the control label step.
    "text-sm font-[var(--font-weight-light)] whitespace-nowrap cursor-pointer",

    // The chosen value must not push the chevron — or, on a `hideChevron`
    // trigger, whatever else the call site put beside it — out of the pill.
    "[&>span]:min-w-0 [&>span]:truncate [&>span]:text-start",

    // Nothing chosen yet: the placeholder is tertiary ink, exactly as a text
    // field's is. This IS the empty state; nothing else marks it.
    "data-[placeholder]:text-muted-foreground",

    "transition-[box-shadow,background-color]",
    "duration-[var(--duration-colour)] ease-kwapso",

    /* ---- Disabled. A fill, an ink and the WEAK edge — `--border` is 8% and
       the resting trigger is now 20%, which is what tells the two apart
       (override 42). The chevron greys with the label. ------------------ */
    "disabled:cursor-not-allowed disabled:shadow-[inset_0_0_0_0.0625rem_var(--border)]",
    "disabled:bg-hair-faint disabled:text-ink-disabled",
    "disabled:[&_svg]:text-ink-disabled",
  ],
  {
    variants: {
      /** Folded from `error` + `aria-invalid` in JS; see the header. */
      state: {
        default: [
          /* OVERRIDE 42 — THE RESTING EDGE IS `--hair-strong`, AND THERE IS
             NO HOVER. A select trigger is a FIELD, so CH09's two strengths
             govern it: `var(--hair2)` at rest, `var(--hair)` disabled. The
             build had them swapped and promoted 8% to 20% on hover, so a
             resting trigger and a disabled one carried the same stroke. The
             hover came from kwapso-ui.css and has no source in the artifact;
             it is gone and nothing replaces it. Only the INK changes here —
             the shape stays `inset 0 0 0 0.0625rem`, so the stroke is the
             same width it has always been.

             THE OPEN AND FOCUS INK BELOW IS NOT TOUCHED. CH09's "the
             hairline goes to ink" is the artifact's own answer to what a
             field does next, and it is the state the hover was standing in
             front of. Disabled keeps `--border` in the base block. */
          "shadow-[inset_0_0_0_0.0625rem_var(--hair-strong)] [&_svg]:text-ink-secondary",
          // Focus, and open: "the hairline goes to ink". The ring is global.
          "enabled:focus:shadow-[inset_0_0_0_0.0625rem_var(--foreground)]",
          "enabled:data-[state=open]:shadow-[inset_0_0_0_0.0625rem_var(--foreground)]",
        ],

        /**
         * Chapter 9: the border is poppy at 65%. `color-mix` keeps the 65%
         * token-driven, so dark re-resolves `--destructive` to poppy-lift and
         * the field is correct in both palettes with no second value. Same
         * treatment, same contradiction with kwapso-ui.css, as GAPS.md INP-2.
         */
        error: [
          "shadow-[inset_0_0_0_0.0625rem_color-mix(in_srgb,var(--destructive)_65%,transparent)]",
          "[&_svg]:text-ink-secondary",
          /* The hover freeze that used to sit here held the default's hover
             still. There is no longer a hover to hold — override 42. */
          "enabled:focus:shadow-[inset_0_0_0_0.0625rem_var(--destructive)]",
          "enabled:data-[state=open]:shadow-[inset_0_0_0_0.0625rem_var(--destructive)]",
        ],
      },
    },
    defaultVariants: { state: "default" },
  },
);

export interface SelectTriggerProps
  extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> {
  /**
   * The field has failed validation. Also sets `aria-invalid` when the call
   * site has not set it itself, so a form library that only speaks
   * `aria-invalid` reaches the same skin without this prop.
   */
  error?: boolean;
  /**
   * Draw NO chevron. Off by default, so a field keeps CH09's
   * `.kw-selectwrap__chevron` and every existing call site is untouched.
   *
   * Client, 2026-09-02, verbatim: *"on the sort, rmeove the chevron after the
   * word. i know its a button"* and *"same on views - rmeove the chevron"*.
   * The two that opt in are the TOOLBAR pills — `SortControl`'s field and
   * `ViewSwitch` — which the client has spent this week matching to the
   * filter chip, a pill that never carried a caret. In that row they read as
   * buttons, and she says so.
   *
   * THE OPT-OUT HAS TO LIVE HERE. The glyph is `SelectPrimitive.Icon`'s, so
   * no utility at a call site can take it away: `[&>svg]:hidden` would leave
   * this trigger's `gap-2` and the icon's 16 of room behind, and the pill
   * would keep the width of a chevron it no longer draws. Not rendering it is
   * the only way the room goes with it.
   *
   * The base is `justify-between`, so a trigger left holding ONE child puts
   * that child at the inline start on its own. A call site that puts a SECOND
   * child in — `ViewSwitch`'s leading view icon — says `justify-start` itself.
   */
  hideChevron?: boolean;
}

/**
 * The closed control: a field pill with a chevron — unless `hideChevron`, the
 * opt-out the two toolbar pills take (see the prop).
 *
 * TEN STATES
 *  1. default        — page fill, one hairline at `--hair-strong`, pill,
 *                      44 tall (override 42).
 *  2. hover          — does not apply. CH09 draws a field at rest, at focus
 *                      and disabled and no hover for any of them; the one
 *                      this file carried came from kwapso-ui.css. Nothing
 *                      replaces it — the next thing a trigger does is state
 *                      3, and state 3 is a real drawn move here.
 *  3. focus-visible  — the hairline goes to ink here; the RING is tokens.css §8
 *                      and this file adds none.
 *  4. active/pressed — the OPEN state, which takes the same ink hairline as
 *                      focus. A select has no separate pressed moment: the
 *                      press opens the list, and the list is the feedback.
 *  5. disabled       — `--hair-faint` fill, `--ink-disabled` label and
 *                      chevron, and the WEAK 8% edge against the resting
 *                      trigger's 20% (override 42). Set on `<Select
 *                      disabled>` or here; both reach the same skin.
 *  6. loading        — does not apply to the trigger itself. A select whose
 *                      OPTIONS have not arrived is `disabled` with the
 *                      placeholder showing; a select whose VALUE has not
 *                      arrived shows a `Skeleton` in its place, because
 *                      rendering the placeholder would say "nothing chosen",
 *                      which is an answer and a wrong one. See GAPS-B.md
 *                      SEL-5.
 *  7. empty          — the placeholder, in tertiary ink, via
 *                      `data-[placeholder]`. `SelectValue` takes the string
 *                      from the call site, so nothing here needs translating.
 *  8. error          — `error` or `aria-invalid`: poppy hairline at 65%. The
 *                      MESSAGE beside it is ink, never poppy, and belongs to
 *                      `field` (chapter 9: "error text poppy-free").
 *  9. selected       — the chosen option's text replaces the placeholder and
 *                      goes to primary ink. The trigger itself is never
 *                      "selected"; the selection lives on an item.
 * 10. read-only      — does not apply. Radix exposes none, and a value the
 *                      user may not change is `disabled` — which is exactly
 *                      how chapter 9 treats a system-set field, minus the
 *                      borderless skin a real read-only input gets.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. `w-full` and 44 tall at every
 *  width, which is already the touch row. A select does not become a sheet on
 *  a phone in this system: Radix's native-feeling list is already
 *  touch-scrollable, and a sheet would be a second drawing of the same
 *  control. Logged as GAPS-B.md SLC-4.
 *
 * RTL — safe. `px-*` is padding-inline, the chevron — when it is drawn at all
 * — is placed by `justify-between` rather than by a side, and Radix mirrors
 * the list's alignment from `dir`.
 */
const SelectTrigger = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  SelectTriggerProps
>(({ className, children, error, hideChevron = false, "aria-invalid": ariaInvalid, ...props }, ref) => {
  const invalid = error ?? (ariaInvalid === true || ariaInvalid === "true");

  return (
    <SelectPrimitive.Trigger
      ref={ref}
      data-slot="select-trigger"
      aria-invalid={invalid || undefined}
      className={cn(
        selectTriggerVariants({ state: invalid ? "error" : "default" }),
        className,
      )}
      {...props}
    >
      {children}
      {hideChevron ? null : (
        <SelectPrimitive.Icon asChild>
          {/* `--icon-button` (16) on `--ink-secondary`, as `.kw-selectwrap__chevron`
              draws it. The colour is set by the cva so the disabled skin can
              reach it. */}
          <ChevronDown className="size-[var(--icon-button)] shrink-0" />
        </SelectPrimitive.Icon>
      )}
    </SelectPrimitive.Trigger>
  );
});

SelectTrigger.displayName = "SelectTrigger";

/* ----------------------------------------------------------------------------
   Scroll affordances — local, not exported. Radix renders them only when the
   list overflows. They are chrome, not options: `cursor-default`, no hover,
   and the glyph is decoration so it stays `aria-hidden`.
   ------------------------------------------------------------------------- */
const scrollButtonClasses =
  "flex cursor-default items-center justify-center py-1 text-ink-secondary";

function SelectScrollUpButton() {
  return (
    <SelectPrimitive.ScrollUpButton className={scrollButtonClasses}>
      <ChevronUp className="size-[var(--icon-button)]" />
    </SelectPrimitive.ScrollUpButton>
  );
}

function SelectScrollDownButton() {
  return (
    <SelectPrimitive.ScrollDownButton className={scrollButtonClasses}>
      <ChevronDown className="size-[var(--icon-button)]" />
    </SelectPrimitive.ScrollDownButton>
  );
}

const selectContentClasses = [
  /* z-70, WITH THE OTHER THREE ANCHORED SURFACES, and 50 was not a smaller
     number — it was a broken control.
     ------------------------------------------------------------------
     This list is PORTALLED (see `SelectContent` below): it renders at the
     document root, so its z-index competes with every other overlay in the
     app rather than with the form it belongs to. The system's layers are
     sheet 55, dialog and alert-dialog 60, then popover, dropdown-menu,
     tooltip and hover-card at 70 — the four anchored surfaces that have to
     open OVER a dialog, because a dialog is where a form lives and a form is
     where you pick things.

     Select was the only portalled surface left under that line. Inside a
     dialog it opened BEHIND the dialog it was opened from: the list was
     painted, the options were there, and every click landed on the dialog in
     front of it. On a phone, where the list fills most of the screen, the
     effect is a form whose pickers simply do not work — reported from a
     handset with three dead pickers on one form.

     It is not a taste call and it has no downside: 70 is the layer the kit
     already assigns to "anchored to a control, must clear a dialog", and a
     Select is exactly that. */
  "relative z-[70] overflow-hidden",

  // Chapter 12's floating surface: raised paper at 24 under the overlay
  // shadow, padded `--space-2h`. No blur, no border, no arrow.
  "rounded-[var(--radius)] border-0 bg-card text-card-foreground",
  "shadow-[var(--shadow-overlay)] p-[var(--space-2h)]",

  // Never narrower than the field it belongs to, never taller than the space
  // Radix measured. Both are Radix's own custom properties.
  "min-w-[var(--radix-select-trigger-width)]",
  "max-h-[var(--radix-select-content-available-height)]",

  // The kit's 8 of air between a floating surface and its trigger, as a
  // margin rather than a Radix pixel offset — a margin is rem and scales with
  // the text-size control, and the block axis does not mirror.
  "data-[side=bottom]:mt-2 data-[side=top]:mb-2",

  // Attached, not written. motion/motion.css owns the rise and the fade.
  "motion-anchored",
];

export type SelectContentProps = React.ComponentPropsWithoutRef<
  typeof SelectPrimitive.Content
>;

/**
 * The open list. Portalled, so it escapes any `overflow: hidden` the form
 * happens to sit in.
 *
 * TEN STATES
 *  1. default        — raised paper at 24 under `--shadow-overlay`, no blur.
 *  2. hover          — does not apply to the SURFACE. The rows hover; the
 *                      paper they sit on does not.
 *  3. focus-visible  — NOT here. Focus lands on an ITEM, and tokens.css §8
 *                      rings that item at its own pill radius.
 *  4. active/pressed — belongs to the items.
 *  5. disabled       — does not apply. A disabled select never opens, so this
 *                      surface has no disabled form.
 *  6. loading        — does not apply. Radix mounts the list from the options
 *                      it was given; options that have not arrived mean the
 *                      trigger is `disabled`, not that the list draws a
 *                      spinner (GAPS-B.md SLC-2).
 *  7. empty          — no items renders the bare padded pill: 20 of paper
 *                      under the overlay shadow. The kit draws no empty menu
 *                      and this file invents no "No options" line, because a
 *                      string baked in here could not be translated. A caller
 *                      with nothing to offer passes a disabled `SelectItem`
 *                      whose label they own. Logged as GAPS-B.md SLC-3.
 *  8. error          — does not apply. Error belongs to the field.
 *  9. selected       — belongs to the items.
 * 10. read-only      — does not apply.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED in treatment; the SIZE is measured,
 *  not chosen: at least as wide as the trigger, at most as tall as the space
 *  Radix found. That is the same rule at every width, and it is why there is
 *  no phone variant.
 *
 * RTL — safe. Radix flips the list's alignment from `dir`; the 8 of air is on
 * the block axis, which does not mirror.
 */
const SelectContent = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Content>,
  SelectContentProps
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      data-slot="select-content"
      position={position}
      className={cn(selectContentClasses, className)}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          "h-full w-full",
          // In popper mode Radix does not size the viewport itself.
          position === "popper" && "min-w-[var(--radix-select-trigger-width)]",
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));

SelectContent.displayName = "SelectContent";

const selectItemClasses = [
  // `.kw-menu__item`: a pill row, 10 block / 12 inline, 14/300 on primary ink.
  "relative flex w-full cursor-pointer select-none items-center",
  "gap-[var(--space-2h)] rounded-pill py-[var(--space-2h)] px-3",
  "text-sm font-[var(--font-weight-light)] text-foreground",

  // Highlighted — keyboard or pointer, Radix says so with one attribute. The
  // kit's neutral row wash, never mango.
  "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",

  // Dead rows take an ink and no wash — Radix never highlights a disabled
  // item, so the two can never meet and there is nothing to race.
  "data-[disabled]:cursor-not-allowed data-[disabled]:text-ink-disabled",

  // Attached, not written. motion/motion.css owns the row's colour swap.
  "motion-menu-item",
];

export interface SelectItemProps
  extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> {
  /**
   * A glyph leading the label — one of the kit's forty, at the 16 delivery
   * size in secondary ink. Ruling 34 is the rule it serves: a module is
   * identified by its icon, in the rail, on the record AND in a picker, so a
   * picker that could only carry text was the picker being wrong.
   */
  icon?: React.ReactNode;
  /**
   * A picture leading the label — a logo, an avatar, a thumbnail. Drawn as
   * ruling 30's record mark: a 24 SQUARE at the 6 selection radius, `flex:
   * none`, the image contained rather than stretched. Ignored when `icon` is
   * given; a row carries one mark, never two.
   */
  image?: string;
  /**
   * The picture's alternative text. `""` by default, which is correct here:
   * the label beside it already says what the option is, so the image is
   * decorative and a screen reader must not read the name twice.
   */
  imageAlt?: string;
}

/**
 * One option — a label, and optionally an image OR an icon beside it.
 *
 * THE MARK SITS OUTSIDE `ItemText`, and that is load-bearing rather than
 * tidy: Radix clones `ItemText`'s children into the trigger to render the
 * chosen value. An `<img>` cloned into a 44 pill would be a second, unasked-
 * for drawing in the field. Keeping the mark a sibling means the list shows
 * the picture and the closed field shows the words.
 *
 * The chosen row is marked with a tick at the reading end, NOT with the
 * inverse fill the rest of chapter 10's family uses. A full inverse row would
 * sit on the same element as the `--accent` highlight wash and the two would
 * fight: moving the keyboard onto the already-chosen row would have to either
 * lose the selection or lose the highlight. The tick is a second channel and
 * survives both. Logged as GAPS-B.md SLC-1 — the kit draws no select list.
 *
 * TEN STATES
 *  1. default        — pill row, 14/300, primary ink.
 *  2. hover          — `--accent`, the kit's neutral row wash. Pointer and
 *                      keyboard are one state here because Radix reports them
 *                      as one attribute, which is right: a menu has a single
 *                      "the row you are on".
 *  3. focus-visible  — NOT here. Radix moves real DOM focus onto the row, so
 *                      tokens.css §8 rings it at its own pill radius. Nothing
 *                      in this file suppresses that, which is the one place
 *                      this component deliberately departs from shadcn.
 *  4. active/pressed — does not apply. The press commits the choice and
 *                      closes the list; a pressed skin would be shown for the
 *                      length of a frame.
 *  5. disabled       — `--ink-disabled`, not-allowed, and no wash. An option
 *                      that cannot be chosen still has to be readable, which
 *                      is why the row keeps its paper.
 *  6. loading        — does not apply to a row.
 *  7. empty          — does not apply. An option always carries a label; a
 *                      row with no children is a row that should not exist.
 *  8. error          — does not apply. An option cannot be invalid; the FIELD
 *                      can, and it draws that itself.
 *  9. selected       — a tick at the reading end, in primary ink. See the
 *                      note above for why this one member of the family is
 *                      not the inverse fill.
 * 10. read-only      — does not apply.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The row is 10 + 14 + 10 ≈ 40 tall,
 *  the kit's standing control height, at every width. It is under the 44
 *  touch row by 4; the kit draws menu rows at this density on every device
 *  and nothing here overrides it (GAPS-B.md SLC-5).
 *
 * RTL — safe. `px-*` is padding-inline, the tick is pushed out by `ms-auto`
 * (margin-inline-start), and the row's order follows the document direction.
 */
const SelectItem = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Item>,
  SelectItemProps
>(({ className, children, icon, image, imageAlt = "", ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    data-slot="select-item"
    className={cn(selectItemClasses, className)}
    {...props}
  >
    {icon !== undefined && icon !== null ? (
      <span
        aria-hidden="true"
        data-slot="select-item-icon"
        className={cn(
          "inline-flex size-[var(--icon-16)] shrink-0 items-center justify-center",
          "text-ink-secondary [&_svg]:size-[var(--icon-16)]",
        )}
      >
        {icon}
      </span>
    ) : image ? (
      <img
        src={image}
        alt={imageAlt}
        data-slot="select-item-image"
        /* Ruling 30's square record mark at 24, ruling 03's 6 for a mark.
           `object-contain` on the quiet ground rather than a crop, which is
           27.28's rule for every picture the system did not shoot itself. */
        className={cn(
          "size-[var(--avatar-sm)] shrink-0 object-contain",
          "rounded-[var(--radius-select)] bg-surface-quiet",
        )}
      />
    ) : null}
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <SelectPrimitive.ItemIndicator className="ms-auto grid place-content-center">
      <Check className="size-[var(--icon-button)]" />
    </SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
));

SelectItem.displayName = "SelectItem";

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
  selectTriggerVariants,
  selectItemClasses,
};
