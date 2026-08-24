/* ============================================================================
   Toaster + toast — the transient confirmation (2 direct call sites for the
   mount, and `toast()` is called from everywhere).

   DESIGN SOURCE
   design-mothership/specimens/kwapso-patterns.css → CH20 `.kw-toast`,
     `.kw-toast--fixed`, `.kw-toast__action`, `.kw-toast__close`, drawn in
     `_fragments/t20-feedback.html` block (d):

       inline-flex · gap 12 · `--surface-inverse` fill with `--ink-on-inverse`
       ink · 999 radius · padding 12 / 14 / 12 / 24 · `--shadow-overlay` ·
       the caption step · a dense pill action · a 28 close chip

     and `.kw-toast--fixed`: centred, `--space-7` (32) up from the bottom
     edge, which is where `position` and `offset` default to below.
   Motion is motion/motion.css §5 (`.motion-toast`), which was written for
     this component: it reads sonner's own `data-state`, `data-removed` and
     `data-y-position`, so ONE class carries the entrance from the bottom,
     the entrance from the top, the exit, and the settle when the stack
     reflows. No keyframe, no duration and no curve is written in this file.

   THE PACKAGE
   `sonner` is on the commission's permitted list (§2 rule 8). It is used as
   the machinery only — the queue, the stack, the swipe, the timers, the
   focus behaviour — and `unstyled: true` turns off every one of its own
   visual defaults so nothing but kwapso classes reach the screen. That is
   also what keeps this file free of `!important`: there is no sonner
   stylesheet left to out-rank.

   THE LAW THIS FILE OBEYS
   · THE TOAST IS INVERSE, NOT MANGO AND NOT A STATUS COLOUR. One drawing for
     every kind of message. sonner's `richColors` is deliberately not enabled:
     a green toast and a red toast would put status colour on a surface, and
     the kit's own rule from the same chapter is "accents never become a
     background". A destructive outcome is said in WORDS, or it is an `Alert`.
     Both sides in GAPS-CE TST-2.
   · Charcoal on the accent: the action pill is the kit's own light wash over
     the inverse surface, not a mango chip.
   · Radius is `--radius-pill`. A toast is a pill, not a box.
   · Focus is ONE global rule (tokens.css §8). Neither the action nor the
     close defines a ring, and nothing sets `outline: none`.
   · Disabled and hover are tokens, never opacities. The kit draws its close
     chip at `opacity: .65`; that is a rejection here and is drawn as a mixed
     INK instead, which is a colour rather than a transparency of the whole
     element. GAPS-CE TST-1.
   · Every user-facing string belongs to the CALL SITE — `toast("…")` — so
     this file holds exactly one, the close control's accessible name, and it
     is a prop with a default.

   RENDERING CONTEXT
   `"use client"`. sonner is a stateful client component with a portal, a
   document-level hotkey and timers.
   ========================================================================= */

"use client";

import * as React from "react";
import { Toaster as SonnerToaster, toast, type ToasterProps as SonnerToasterProps } from "sonner";

import { cn } from "../../lib/utils";

/* `.kw-toast` — the pill. 12 block, 24 at the inline start (words need air
   from the edge), 14 at the inline end (the close chip already has its own).
   `shadow-xl` is bridged to `--shadow-overlay`. */
const TOAST = cn(
  "flex w-full items-center gap-3",
  "rounded-pill py-3 ps-[var(--space-6)] pe-[var(--space-3h)]",
  "bg-surface-inverse text-ink-on-inverse",
  "shadow-xl",
  "text-caption",
  // motion.css §5 — entrance, exit and the stack's settle, all from one class.
  "motion-toast",
);

/* `.kw-toast__action` — the dense pill. The kit fills it with
   `rgba(255,254,249,.14)`, which is the off-beige at 14%; `color-mix` against
   `currentColor` says the same thing in a way that stays correct when the
   inverse surface flips to beige in dark and the ink flips to charcoal. */
const ACTION = cn(
  "inline-flex shrink-0 items-center justify-center",
  "h-[var(--control-height-dense)] px-3 rounded-pill border-0",
  "bg-[color-mix(in_srgb,currentColor_14%,transparent)] text-current",
  "text-badge font-[var(--font-weight-medium)]",
  "cursor-pointer",
  "hover:bg-[color-mix(in_srgb,currentColor_24%,transparent)]",
  "transition-colors duration-[var(--duration-colour)] ease-kwapso",
);

/* THE LEADING SLOT — the bug fix of review round 1.
   sonner's pending mark is `.sonner-loading-wrapper`, and sonner's own
   stylesheet gives it `position: absolute; inset: 0` with an explicit 16
   square. That rule ships unconditionally; what `unstyled: true` switches off
   is the `[data-styled=true] [data-icon]` rule that makes the slot the
   POSITIONED, sized box the wrapper is measured against. With the slot left
   static, the wrapper resolved against the toast `<li>` instead and painted
   itself into the pill's top-left corner — outside the words, half off the
   box. Restoring the slot is the whole fix: a 16 square, `relative`, a flex
   child in the row, so the spinner sits INSIDE the pill immediately before
   the text with the row's own 12 gap between them.

   Nothing is invented: 16 is the delivery icon size, and `--gray11` is
   sonner's own loading-bar colour, a literal grey that would be all but
   invisible on the charcoal pill. It is re-pointed at `currentColor`, which
   IS the toast's ink token and flips with the surface in dark. */
const ICON = cn(
  "relative flex size-[var(--icon-16)] shrink-0 items-center justify-center",
  "[--gray11:currentColor]",
);

/* `.kw-toast__close` — a 28 chip. The kit's `.65` fade is drawn here as a
   mixed ink instead: an opacity would fade the glyph AND anything behind it,
   and an opacity is not a state in this system. */
const CLOSE = cn(
  "inline-grid size-[1.75rem] shrink-0 place-content-center",
  "rounded-pill border-0 bg-transparent",
  "text-[color-mix(in_srgb,currentColor_65%,transparent)]",
  "cursor-pointer",
  "hover:bg-[color-mix(in_srgb,currentColor_14%,transparent)] hover:text-current",
  "transition-colors duration-[var(--duration-colour)] ease-kwapso",
);

export interface ToasterProps extends SonnerToasterProps {
  /**
   * The close control's accessible name. sonner renders that button itself,
   * so this is the one string this file owns — and it is a prop because the
   * apps run in Arabic, Urdu and Persian.
   */
  closeLabel?: string;
}

/**
 * The toast host. Mounted once, near the root of the application; every
 * `toast()` call anywhere renders into it.
 *
 *     <Toaster />
 *     toast("Ticket created in W34", { action: { label: "View", onClick } })
 *
 * TEN STATES — a toast is itself a moment rather than a control, so most of
 * the ten belong to the two buttons inside it and each is named rather than
 * quietly dropped.
 *
 *  1. default        — the inverse pill, centred, 32 up from the bottom edge.
 *  2. hover          — the action pill and the close chip lift their wash one
 *                      defined step; the toast itself does not move. Pointing
 *                      at the stack also pauses sonner's dismissal timer,
 *                      which is behaviour rather than a skin.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *                      sonner's own hotkey (`alt`+`T` by default) moves focus
 *                      into the stack; the ring that shows where it landed is
 *                      the token layer's.
 *  4. active/pressed — does not apply as a skin. Pressing the action closes
 *                      the toast, which is the acknowledgement.
 *  5. disabled       — does not apply. A toast is showing or it is gone;
 *                      there is no dead toast. An action that cannot be taken
 *                      is not offered.
 *  6. loading        — `toast.loading()` and `toast.promise()` keep this exact
 *                      pill and swap their own leading mark; the kit draws no
 *                      second toast for a pending one, and blanking the words
 *                      would lose the sentence that explains the wait.
 *  7. empty          — nothing renders. sonner draws no stack when the queue
 *                      is empty, which is correct: an empty toast region is
 *                      not a state, it is the absence of one.
 *  8. error          — `toast.error()` uses the SAME inverse pill. The
 *                      severity is in the words. See the header for why there
 *                      is no poppy toast.
 *  9. selected       — does not apply.
 * 10. read-only      — every toast is read-only; there is nothing to write
 *                      to. `aria-readonly` is not set because the region is
 *                      already output-only by role and the attribute would
 *                      add nothing.
 *
 * THREE BREAKPOINTS
 *  mobile   — `mobileOffset` drops the gutter to `--space-4` (16) so a
 *             full-width toast is not pinched against the screen edges, and
 *             the pill is `w-full` inside sonner's own width, so it is as
 *             wide as the phone allows rather than a fixed 460 that would
 *             overflow. Chapter 19's floating-layer rule applies to the same
 *             corner of the screen — nothing may sit over a control — and the
 *             bottom offset is what keeps the stack clear of a bottom bar.
 *  tablet   — the kit's own `--space-7` (32) offset, bottom-centred.
 *  desktop  — UNCHANGED from tablet. A toast does not widen with the
 *             viewport; sonner's own measure is the design.
 *
 * RTL — safe, and it is handled at the right level. `dir="auto"` lets sonner
 * read the document's own direction, so the stack, the swipe axis and the
 * inline order of words / action / close all mirror in Arabic, Urdu and
 * Persian. Every inset written here is logical (`ps-*`, `pe-*`).
 */
function Toaster({
  className,
  closeLabel = "Dismiss",
  position = "bottom-center",
  offset = "var(--space-7)",
  mobileOffset = "var(--space-4)",
  dir = "auto",
  toastOptions,
  ...props
}: ToasterProps) {
  return (
    <SonnerToaster
      // No `data-slot` here: sonner's own props interface is closed, so an
      // extra attribute would not type-check. The container it renders
      // already carries `[data-sonner-toaster]`, which is the same hook.
      position={position}
      offset={offset}
      mobileOffset={mobileOffset}
      dir={dir}
      className={cn(className)}
      toastOptions={{
        // Every sonner default is switched off; only kwapso classes paint.
        unstyled: true,
        closeButtonAriaLabel: closeLabel,
        ...toastOptions,
        classNames: {
          toast: TOAST,
          content: "flex min-w-0 flex-1 flex-col gap-1",
          title: "min-w-0",
          description: "min-w-0 text-[color-mix(in_srgb,currentColor_75%,transparent)]",
          icon: ICON,
          actionButton: ACTION,
          cancelButton: ACTION,
          closeButton: CLOSE,
          // The pending mark is the system's own ring, not sonner's.
          loader: "motion-spinner",
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  );
}

Toaster.displayName = "Toaster";

export { Toaster, toast };
