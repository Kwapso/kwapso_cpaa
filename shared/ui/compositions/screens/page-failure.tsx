/* ============================================================================
   PageFailureScreen — chapter 21's two whole-page failures: 404 and 500.

   MISSING UNTIL 2026-08-26. The client's fidelity re-audit against the
   original artifact found that neither card existed anywhere in the build:
   chapter 21 draws them as its closing pair and law 4 names them as the ONE
   state allowed to replace the frame ("Only a whole-page failure is allowed
   to replace the frame"), alongside the dead session (27.19).

   DESIGN SOURCE — "Kwapso UI Kit.dc.html" chapter 21, transcribed from its
   own markup:

     THE 404 CARD — the only charcoal-ground register in the chapter:
       `background: var(--inv); color: var(--invfg); border-radius: 24px;
        padding: 44px 34px` · the figure at 64/500, tabular, tracking -0.028,
        line-height 1 · "That page has moved on." at 22/500 · the paragraph in
        `--invfg2` at 13.5, max 44ch — "The link is old, or the record was
        archived. Everything current is one click away." · one MANGO button,
        "Today" — the route back to the day view, and the screen's one action.

     THE 500 CARD — the same geometry on soft paper:
       `background: var(--sheet)` · the figure in `--fg4` · "Something on our
        side broke." · "We've been notified and are on it. Your last save went
        through at 12:04." · "Reload" in the paper fill beside the error
        reference "Error 8F31-A2" in quiet ink, tabular.

   HOW THIS SITS BESIDE 27.23 — NOT A CONTRADICTION
   27.23 (record not found) rules "No status number, no illustration, no
   'oops'" — for a RECORD whose collection is fine, where the frame stays
   drawn. These two cards are the WHOLE-PAGE case law 4 carves out: the app
   itself could not draw a frame, so there is no frame to keep and the number
   is the honest statement of which failure this is. The 500's error reference
   is the support handle, drawn quiet, exactly as the artifact does.

   THE LAW THIS FILE OBEYS
   · THE 404 SAYS WHERE TO GO, IN MANGO — the one action, the one mango.
   · THE 500 NAMES THE LAST SAFE MOMENT. "Your last save went through at
     12:04" is the sentence that stops a support thread; the timestamp is a
     prop because ruling 07 owns date formats.
   · NEVER RED. A failure is stated in words on the kit's own papers.
   · EVERY STRING IS A PROP with the artifact's drawn value as its default.

   RENDERING CONTEXT
   No `"use client"`. No state, no hooks, no handlers created during render
   beyond the caller's own.
   ========================================================================= */

import * as React from "react";

import { Button } from "../../components/button/button";
import { cn } from "../../lib/utils";

/** Which whole-page failure. */
export type PageFailureVariant = "404" | "500";

/** Every user-facing string on the card. */
export interface PageFailureLabels {
  /** The 64px figure. */
  figure: string;
  /** The one-sentence headline. */
  headline: string;
  /** The paragraph. */
  body: string;
  /** The action's label — "Today" on the 404, "Reload" on the 500. */
  action: string;
  /** 500 only: the quiet error reference beside Reload. */
  reference?: string;
}

const NOT_FOUND_LABELS: PageFailureLabels = {
  figure: "404",
  headline: "That page has moved on.",
  body: "The link is old, or the record was archived. Everything current is one click away.",
  action: "Today",
};

const BROKE_LABELS: PageFailureLabels = {
  figure: "500",
  headline: "Something on our side broke.",
  body: "We've been notified and are on it. Your last save went through at 12:04.",
  action: "Reload",
  reference: "Error 8F31-A2",
};

export interface PageFailureScreenProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  /** Which of the two. */
  variant?: PageFailureVariant;
  /** Merged over the variant's own drawn strings. */
  labels?: Partial<PageFailureLabels>;
  /** The one action — Today's route on the 404, a reload on the 500. */
  onAction?: () => void;
  /** 500 only: pressing the reference (the artifact draws it pressable). */
  onReference?: () => void;
}

/**
 * A whole page that could not be drawn.
 *
 * TEN STATES
 *  1. default        — THIS IS the state; the card is the page.
 *  2. hover          — the action's own, from `Button`.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — the action's own.
 *  5. disabled       — does not apply. The one route out is always live.
 *  6. loading        — does not apply. A page that is loading is 27.6; this
 *                      is the page that could not load at all.
 *  7. empty          — does not apply.
 *  8. error          — THIS IS the composition. It never recolours further.
 *  9. selected       — does not apply.
 * 10. read-only      — always.
 *
 * THREE BREAKPOINTS — UNCHANGED. One column of type inside one card at every
 * width; the paragraph's 44ch measure is what responds.
 *
 * RTL — LTR only by client ruling. Every inset is logical.
 */
function PageFailureScreen({
  className,
  variant = "404",
  labels,
  onAction,
  onReference,
  ...props
}: PageFailureScreenProps) {
  const words: PageFailureLabels = {
    ...(variant === "500" ? BROKE_LABELS : NOT_FOUND_LABELS),
    ...labels,
  };
  const charcoal = variant === "404";

  return (
    <div
      data-slot="page-failure-screen"
      data-variant={variant}
      className={cn(
        "flex w-full min-w-0 flex-col items-start rounded-[var(--radius)]",
        "px-[var(--space-7)] py-[var(--space-8)]",
        charcoal
          ? "bg-surface-inverse text-ink-on-inverse"
          : "bg-surface-panel text-foreground",
        className,
      )}
      {...props}
    >
      {/* The figure: 64/500, tabular, one line. The 404's rides the charcoal
          at full ink; the 500's drops to `--fg4`, which the kit resolves as tertiary ink (see chat.tsx). */}
      <span
        data-slot="page-failure-figure"
        className={cn(
          "text-[4rem] font-[var(--font-weight-medium)] leading-none tracking-[-0.028em] tabular-nums",
          charcoal ? undefined : "text-ink-tertiary",
        )}
      >
        {words.figure}
      </span>

      <span className="mt-[var(--space-4h)] text-xl font-[var(--font-weight-medium)] tracking-[-0.014em]">
        {words.headline}
      </span>

      <span
        className={cn(
          "mt-2 max-w-[44ch] text-sm leading-normal",
          charcoal ? "text-ink-on-inverse-secondary" : "text-ink-secondary",
        )}
      >
        {words.body}
      </span>

      <div className="mt-[var(--space-5h)] flex flex-wrap items-center gap-[var(--space-2h)]">
        {/* The 404's route out is the one mango; the 500's Reload is paper. */}
        <Button variant={charcoal ? "default" : "secondary"} onClick={onAction}>
          {words.action}
        </Button>
        {words.reference === undefined ? null : (
          <Button variant="ghost" className="tabular-nums" onClick={onReference}>
            {words.reference}
          </Button>
        )}
      </div>
    </div>
  );
}

PageFailureScreen.displayName = "PageFailureScreen";

export { PageFailureScreen };
