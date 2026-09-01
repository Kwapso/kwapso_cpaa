/* ============================================================================
   Badge — the status-coloured chip (59 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/kwapso-ui.css → `.kw-badge`
   design-mothership/specimens/_fragments/t11.css → `.kw-badge--inverse`,
   `.kw-badge--danger`, `.kw-tag--*` (chapter 11, chips and pills).

   THE LAW THIS FILE OBEYS
   · No border on any COLOURED pill — "colour is the whole treatment"
     (kit ruling 26). `variant="outline"` is the single uncoloured variant and
     is the only one that draws a hairline; it exists here because the
     commission requires it and because a Badge, unlike a Button, is not a
     control (see GAPS.md BDG-2).
   · Charcoal on every accent, both modes. `--destructive-foreground`,
     `--success-foreground` and `--primary-foreground` are all already
     charcoal. Trust them; never reach for white.
   · Mango (`--primary`) is a brand fill, never a status. It carries
     `variant="default"` — a count or a "3 new" — and never "warning" or
     "in build". It is OPT-IN: an unqualified <Badge> is quiet. Ruled
     2026-08-22 against verify/badge-default-comparison.html, because
     defaulting to mango put it on most rows of a list and broke the
     one-mango-per-view rule that the same kit states.
   · Radius is `--radius-pill`.
   · Separation is a FILL, never a border or a shadow — GAPS-RULINGS.md R-4c.
     `secondary`'s quiet fill is a rebindable custom property precisely so the
     one case where `--surface-quiet` reads too close to its ground (an
     ambient `--muted` field, not a card) has a real escape hatch: a caller
     rebinds `--badge-quiet-fill` to a darker quiet tone. It never reaches for
     an edge instead — this file draws no `border` anywhere but `outline`'s
     inset hairline, and that carve-out is `outline`'s alone (GAPS-REVIEW1A
     Q4), not a pattern to extend to `secondary`.
   · A count renders EMPTY, never "0" (kit `.kw-badge:empty { display:none }`).
     That is this component's empty state and its loading state both.
   · CH11 draws THREE pill geometries and this file now carries two of them:
     the 20-tall COUNTER (`size="counter"`, the default — today's geometry,
     untouched) and the 26-tall STATUS PILL / TAG (`size="pill"` —
     `--control-height-pill`, `padding: 6px 14px`, drawn label 12.5 folded to
     the badge step per the half-step rule in GAPS-FIDELITY-A L3: status text
     takes 12). Logged as GAPS-KIT-BC BDG-B1 with this exact addition written
     out; applied 2026-08-26 on the client's re-audit instruction.
   · THE STATE LIVES IN THE DOT (`dot` prop + `variant="status"`). CH11:
     "neutral fill, charcoal label, the state lives in the dot. Mango is the
     brand, never a status dot — 'in build' takes charcoal." The six dot
     tones are the six `--dot-*` tokens; ruling 04's portal three reuse them
     (With us → building, Your answer → review, Done → done). Ruling 26's
     dark clause (override 10): ONLY the charcoal-dot pill takes the mango
     fill on dark — `--pill-fill-building` / `--pill-label-building` resolve
     to the neutral pair in light and to mango/charcoal in dark, so the
     special case is the token's, not this file's.

   RENDERING CONTEXT
   No `"use client"`. No hook, no state, no browser API, no event handler.
   ========================================================================= */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center",
    "rounded-pill whitespace-nowrap",
    // `text-badge` is a real utility — tokens.css registers the three
    // kwapso-only steps in the @theme bridge, so one class sets size, leading
    // and tracking together. `leading-none` overrides the step's own leading,
    // which a fixed-height pill does not want.
    "text-badge leading-none font-medium",
    // Every number in a badge, a column or a KPI is tabular.
    "tabular-nums",
  ],
  {
    variants: {
      size: {
        /** The counter — 20 min-width · 20 tall · 8 inline padding. */
        counter: "h-5 min-w-5 px-2",
        /**
         * The status pill and the tag — CH11's second geometry:
         * `--control-height-pill` (26) tall, 14 inline (`--space-3h`, the
         * drawn `padding: 6px 14px`), dot-to-label gap 8 (`--space-2`).
         */
        pill: "h-[var(--control-height-pill)] gap-2 px-[var(--space-3h)]",
      },
      variant: {
        /** `.kw-badge--accent` — the brand fill, charcoal label. */
        default: "bg-primary text-primary-foreground",
        /**
         * `.kw-badge` base — the quiet counter.
         *
         * THE FILL IS A CUSTOM PROPERTY WITH A FALLBACK, NOT A BARE TOKEN —
         * see GAPS-RULINGS.md R-4c. `--surface-quiet` reads fine everywhere
         * this badge ships today (panel, card, page); the one case it does
         * NOT — measured, not assumed — is a quiet badge sitting on `--muted`
         * (tokens.css's own "inactive tabs, idle wells", an ambient field
         * rather than a card): 1.175 in dark, worse than the panel case
         * already logged in GAPS-CONTRAST.md Tier C. A caller who KNOWS a
         * badge sits on that ground rebinds `--badge-quiet-fill` locally to a
         * darker quiet tone — a FILL shift, same mechanism `tabs.tsx` TAB-C1
         * uses for the folder tab's two papers — never a border or a shadow.
         * Every existing call site is unaffected: with nothing rebound, this
         * resolves to exactly `--surface-quiet`, unchanged.
         */
        secondary: "bg-[var(--badge-quiet-fill,var(--surface-quiet))] text-ink-secondary",
        /* The one uncoloured variant, and so the one that carries an edge.
           No `border` property — review 1A · fix 2 — so the edge is the
           artifact's own inset hairline. ch02's carve-out names fields,
           selection controls and same-tone card separation and does NOT name
           a badge; the pixels are unchanged from the previous drawing and the
           question of whether an uncoloured badge should carry any edge at
           all is logged in GAPS-REVIEW1A.md (Q4). */
        outline: "shadow-[var(--hairline)] bg-transparent text-foreground",
        /** `.kw-badge--danger` — poppy fill, CHARCOAL label. Not white on red. */
        destructive: "bg-destructive text-destructive-foreground",
        /** `.kw-tag--forest` — forest fill, charcoal label. Lifts on dark. */
        success: "bg-success text-success-foreground",
        /**
         * The kwapso palette holds no amber. `--warning` resolves to poppy by
         * decision in tokens.css §3 — a warning badge is a danger badge until a
         * kit ruling admits a distinct tone. Logged as GAPS.md BDG-1.
         */
        warning: "bg-warning text-warning-foreground",

        /* ---- Added, not required (commission §2 rule 3 permits additions).
           Both are drawn by the kit; without them a call site would hand-roll
           a fill and put a hex back into application code. ----------------- */

        /** `.kw-badge--inverse` — charcoal fill, off-beige label. Flips with the palette. */
        inverse: "bg-surface-inverse text-ink-on-inverse",
        /** `.kw-tag--sky` — the informational tone. Charcoal label, as every accent. */
        info: "bg-info text-ink-on-accent",
        /**
         * CH11's status pill ground — `--pill-fill` / `--pill-label`, the
         * neutral pair that flips with the palette. The state lives in the
         * `dot`; the fill never carries it. Usually paired with
         * `size="pill"`; the fill is legal at either size.
         */
        status: "bg-[var(--pill-fill)] text-[var(--pill-label)]",
      },
      /* The dot's tone, mirrored into cva so the two status special cases
         above can key on it. The dot itself is drawn in JSX below — a class
         cannot render an element. */
      dotTone: {
        shipped: "",
        building: "",
        review: "",
        blocked: "",
        archived: "",
        done: "",
      },
    },
    compoundVariants: [
      /* Ruling 26's dark clause, read narrowly (override 10): the
         charcoal-dot pill — "in build" / "with us" — is the ONE pill that
         takes an accent fill on dark. The tokens hold the flip (identical to
         the neutral pair in light, mango/charcoal in dark), so this line is
         palette-free. */
      {
        variant: "status",
        dotTone: "building",
        class: "bg-[var(--pill-fill-building)] text-[var(--pill-label-building)]",
      },
      /* CH11 draws the Archived pill's label in tertiary ink — the one status
         whose words go quiet along with its dot. */
      { variant: "status", dotTone: "archived", class: "text-ink-tertiary" },
    ],
    defaultVariants: {
      /* RULED 2026-08-22, by looking at it side by side (verify/
         badge-default-comparison.html): an unqualified <Badge> is QUIET, not
         mango. The kit draws `.kw-badge--accent` in mango AND rules one mango
         per view; both are the kit, and defaulting to mango broke the second
         one — eight rows of a list came out with six mango chips and the
         colour stopped meaning anything.

         `variant="default"` is untouched and still mango. Mango is now
         opt-in, which is what "the pile you are working" needs it to be. */
      variant: "secondary",
      size: "counter",
    },
  },
);

/** The six dot tones — one per `--dot-*` token, and no mango (never a status). */
const DOT_FILL = {
  shipped: "bg-[var(--dot-shipped)]",
  building: "bg-[var(--dot-building)]",
  review: "bg-[var(--dot-review)]",
  blocked: "bg-[var(--dot-blocked)]",
  archived: "bg-[var(--dot-archived)]",
  done: "bg-[var(--dot-done)]",
} as const;

export type BadgeDot = keyof typeof DOT_FILL;

/**
 * The kit's default abbreviation: 999 → "999", 1300 → "1.3k", 2_000_000 → "2m+".
 * Digits come from the runtime's own numeral system, and the two suffixes are
 * props, so Arabic, Urdu and Persian are a prop away rather than a fork.
 */
function abbreviate(value: number, thousandSuffix: string, millionSuffix: string): string {
  const n = Math.floor(value);
  if (n >= 1_000_000) return `${Math.floor(n / 1_000_000)}${millionSuffix}`;
  if (n >= 1_000) {
    const tenths = Math.floor(n / 100) / 10;
    return `${Number.isInteger(tenths) ? tenths : tenths.toFixed(1)}${thousandSuffix}`;
  }
  return String(n);
}

export interface BadgeProps
  extends React.ComponentPropsWithoutRef<"span">,
    Omit<VariantProps<typeof badgeVariants>, "dotTone"> {
  /**
   * CH11's 7px status dot (`--dot-status`), drawn before the label. The dot
   * names the state and the label says it in words — ruling 26, so a call
   * site should never pass `dot` without a text label. Ruling 04's portal
   * vocabulary reuses the same tones: With us → `building`,
   * Your answer → `review`, Done → `done`. Usually paired with
   * `variant="status"` and `size="pill"`.
   */
  dot?: BadgeDot;
  /**
   * A count, abbreviated by the kit's rule and rendered as the badge's label.
   * Zero or negative renders nothing at all — the kit never shows "0".
   * Ignored when `children` are given.
   */
  count?: number;
  /** Abbreviation suffix at 1 000. Translatable; the kit's English is "k". */
  thousandSuffix?: string;
  /** Abbreviation suffix at 1 000 000. Translatable; the kit's English is "m+". */
  millionSuffix?: string;
  /**
   * Replace the whole count formatter — the escape hatch for a locale whose
   * numerals or magnitude words the two suffixes cannot express.
   */
  formatCount?: (value: number) => string;
  /** Busy. Renders nothing: a count that has not arrived is not "0". */
  loading?: boolean;
  /**
   * Render nothing when there is no label. Default `true`, matching the kit's
   * `.kw-badge:empty { display: none }`. Set `false` to keep an empty pill as
   * a layout placeholder.
   */
  hideWhenEmpty?: boolean;
}

/**
 * A status-coloured chip.
 *
 * TEN STATES
 *  1. default        — variant fill + variant ink.
 *  2. hover          — does not apply. A badge is a label, not a control. If a
 *                      call site wraps one in a button, the button owns hover.
 *  3. focus-visible  — does not apply for the same reason. Where a call site
 *                      does make it focusable, tokens.css §8 rings it globally
 *                      and this file must not add a ring.
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply. A label cannot be disabled; an inactive
 *                      record uses `variant="secondary"`, which is a meaning,
 *                      not a state.
 *  6. loading        — `loading`: renders nothing. Kit law — a count renders
 *                      empty, never "0", when zero OR loading.
 *  7. empty          — no children and no positive count: renders nothing
 *                      (`hideWhenEmpty`, default true).
 *  8. error          — expressed as `variant="destructive"`. A badge has no
 *                      error state of its own; it IS the error's report.
 *  9. selected       — does not apply. The selectable chip is `filter-bar`'s,
 *                      which carries its own remove control.
 * 10. read-only      — always. A badge is never editable.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. Geometry is fixed (20 tall as a
 *  counter, 26 as a status pill or tag) in all three; the badge never wraps
 *  (`whitespace-nowrap`) and never truncates. A row that runs out of width is
 *  the parent's problem to wrap or scroll — a badge that shrank would stop
 *  being the same size as its neighbours.
 *
 * RTL — safe. `px-*` is padding-inline, the dot leads by flex order, and
 * nothing is positioned by side.
 */
const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      className,
      /* Must match cva's defaultVariants above — a JS default in the
         destructure wins over cva, so the two have to agree or the ruling
         silently does not apply. */
      variant = "secondary",
      size = "counter",
      dot,
      count,
      thousandSuffix = "k",
      millionSuffix = "m+",
      formatCount,
      loading = false,
      hideWhenEmpty = true,
      children,
      ...props
    },
    ref,
  ) => {
    // Loading and zero are the same picture: nothing.
    if (loading) return null;

    let label: React.ReactNode = children;

    if (label === undefined || label === null || label === "") {
      if (count !== undefined) {
        if (count <= 0) return null;
        label = formatCount
          ? formatCount(count)
          : abbreviate(count, thousandSuffix, millionSuffix);
      } else if (hideWhenEmpty) {
        return null;
      }
    }

    return (
      <span
        ref={ref}
        data-slot="badge"
        data-dot={dot}
        className={cn(badgeVariants({ variant, size, dotTone: dot }), className)}
        {...props}
      >
        {dot ? (
          /* `--dot-status` — the kit's one dot size (7). aria-hidden: the dot
             never carries the meaning alone (ruling 26); the label says it. */
          <span
            aria-hidden="true"
            className={cn("size-[var(--dot-status)] shrink-0 rounded-pill", DOT_FILL[dot])}
          />
        ) : null}
        {label}
      </span>
    );
  },
);

Badge.displayName = "Badge";

export { Badge, badgeVariants };
