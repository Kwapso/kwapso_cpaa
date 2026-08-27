/* ============================================================================
   Alert — the inline, non-interrupting notice (0 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/kwapso-patterns.css → `.kw-alert`,
   `.kw-alert__dot` and the four severity rules, drawn in
   `_fragments/t20-feedback.html` block (e). The kit's own caption under the
   specimen is the whole design brief:

       "The state lives in the dot. The panel stays neutral — accents never
        become a background."

   THE LAW THIS FILE OBEYS
   · The panel is ALWAYS `--surface-raised` and the ink is always the normal
     ink. A destructive alert is not a poppy panel; it is a neutral panel with
     a poppy dot. Filling a panel with poppy is on the kit's own Don't list
     ("Fill a panel with sky, forest, or poppy").
   · Radius is `--radius` (24). An alert is a box, not a bar and not a pill.
   · The warning dot is MANGO — the artifact's own `var(--mango)` in the ch20
     specimen, restored 2026-08-26. ALR-2's poppy re-pointing is retired: it
     had decayed to the quiet fill when the `--warning` BADGE token moved
     under ruling 3B, leaving the dot with no colour at all. Override 17
     makes the drawn mark legal (mango counts ACTIONS, not marks).
   · No border. Same-tone separation is the fill, per ruling 03/26.
   · Every string is a prop. This component in fact holds none: the dot is
     `aria-hidden` and the body copy is the caller's children.

   RENDERING CONTEXT
   No `"use client"`. No hook, no state, no browser API, no event handler.
   ========================================================================= */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

/* ----------------------------------------------------------------------------
   The panel. Identical for every severity — which is the design, not an
   oversight — so it is a plain array rather than an empty cva (PATTERN §1).
   ------------------------------------------------------------------------- */
const alertClasses = [
  // `.kw-alert`: a leading rail for the dot, the copy taking the rest.
  "flex items-start gap-3",

  // Neutral raised paper in both themes. `--surface-raised` is `--card`.
  "bg-card text-card-foreground",

  // A box takes the box radius. There is no fifth radius.
  "rounded-[var(--radius)]",

  // `.kw-alert` inset: 14 block / 16 inline, both logical.
  "px-4 py-[var(--space-3h)]",

  // The caption step. The kit overrides its leading to the normal tier, so
  // that is restated rather than inherited from the step.
  "text-caption leading-[var(--leading-normal)]",
];

/* ----------------------------------------------------------------------------
   The dot IS the variant. Eight (8) across, pill, nudged down 0.3125rem so it
   optically centres on the first line of caption copy — the kit's own figure,
   transcribed, not derived.
   ------------------------------------------------------------------------- */
const alertDotVariants = cva(
  ["mt-[0.3125rem] size-2 shrink-0 rounded-pill", "motion-step"],
  {
    variants: {
      variant: {
        /**
         * Commission's `default`. The kit draws no neutral alert dot; charcoal
         * is carried from `--dot-building`, the kit's own neutral status dot.
         * GAPS-E ALR-1.
         */
        default: "bg-foreground",
        /** `.kw-alert--danger` — poppy, via `--destructive`. */
        destructive: "bg-destructive",
        /* ---- Added, not required. Commission §2 rule 3 permits additions,
           and all three are drawn by the kit; without them a call site would
           have to hand-roll a dot colour. --------------------------------- */
        /** `.kw-alert--success` — forest. */
        success: "bg-success",
        /** `.kw-alert--info` — sky. */
        info: "bg-info",
        /**
         * `.kw-alert--warning` — MANGO, the artifact's own drawing. ch20's
         * specimen sets this dot `var(--mango)` and the 2026-08-26 fidelity
         * re-audit put it back: it had been re-pointed at poppy on ALR-2's
         * reasoning and then silently followed `--warning` down to the quiet
         * fill when ruling 3B (a BADGE ruling, "Overdue" vs "Blocked")
         * repointed that token — leaving the dot neither poppy nor mango and
         * nearly invisible. Override 17 makes the artifact's drawing legal:
         * one mango per screen counts ACTIONS, and a dot is a mark.
         * `--primary` IS mango (`--kw-mango`) and is not the badge token, so
         * 3B's chip ruling is untouched.
         */
        warning: "bg-primary",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface AlertProps
  extends React.ComponentPropsWithoutRef<"div">,
    VariantProps<typeof alertDotVariants> {
  /**
   * A screen-reader-only word for the severity, read before the body copy.
   * The kit's law is that a dot never carries meaning alone; in an alert the
   * body copy normally says it in words already, so the default is **no
   * string at all** rather than an English one that cannot be translated
   * (PATTERN §7 — "the best default is no string"). Pass one where the copy
   * does not name the severity itself.
   */
  severityLabel?: string;
}

/**
 * An inline notice inside the layout. Not a toast, not a dialog.
 *
 * TEN STATES
 *  1. default        — neutral raised panel, severity in the dot.
 *  2. hover          — does not apply. An alert is not a target; it holds no
 *                      control of its own. A dismiss or an action inside one
 *                      is a `Button` and carries `Button`'s hover.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      and an alert is not focusable in the first place.
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply. A notice cannot be switched off; the
 *                      call site stops rendering it.
 *  6. loading        — does not apply. An alert states a fact that has already
 *                      happened. A pending fact is a `Skeleton` or a `Spinner`.
 *  7. empty          — no children renders `null`. An empty raised panel with
 *                      a coloured dot and nothing to say is noise.
 *  8. error          — `variant="destructive"`. It is the whole point of the
 *                      component rather than a state layered on top of it.
 *  9. selected       — does not apply.
 * 10. read-only      — does not apply. There is nothing to write to.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED, deliberately. The alert is a
 *  full-width block that inherits its measure from the parent, and its only
 *  intrinsic dimensions are the kit's inset (14/16) and the dot (8), neither
 *  of which the kit varies by width. The copy reflows; the dot rail does not
 *  move, so a two-line alert on mobile keeps the same hanging indent it has
 *  on desktop. Responsive width is the composition's grid, not this file.
 *
 * RTL — safe. The dot rail is `gap`-driven inside a flex row, so it moves to
 * the inline start under `dir="rtl"` with nothing written here. Every inset is
 * logical (`px-*` is padding-inline).
 */
const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = "default", severityLabel, children, role, ...props }, ref) => {
    // Empty: prefer nothing (PATTERN §4).
    if (React.Children.count(children) === 0) return null;

    return (
      <div
        ref={ref}
        data-slot="alert"
        data-variant={variant ?? "default"}
        /* A destructive alert interrupts; the other tones report. Both are
           overridable by the native `role` prop, which is why it is destructured
           and defaulted rather than hardcoded. */
        role={role ?? (variant === "destructive" ? "alert" : "status")}
        className={cn(alertClasses, className)}
        {...props}
      >
        <span aria-hidden="true" className={cn(alertDotVariants({ variant }))} />
        <div className="min-w-0 flex-1">
          {severityLabel ? <span className="sr-only">{severityLabel}</span> : null}
          {children}
        </div>
      </div>
    );
  },
);

Alert.displayName = "Alert";

/**
 * The alert's headline. Derived: the kit draws a single body line and no
 * title/description split, but the commission requires both exports —
 * GAPS-E ALR-3. Same step as the body, lifted only by weight, so a titled
 * alert does not become a card with a heading.
 */
const AlertTitle = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="alert-title"
      className={cn("font-[var(--font-weight-medium)] text-foreground", className)}
      {...props}
    />
  ),
);

AlertTitle.displayName = "AlertTitle";

/** The alert's body copy. Secondary ink under a title, normal ink without one. */
const AlertDescription = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="alert-description"
      className={cn("text-ink-secondary [&:not(:first-child)]:mt-1", className)}
      {...props}
    />
  ),
);

AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription, alertDotVariants };
