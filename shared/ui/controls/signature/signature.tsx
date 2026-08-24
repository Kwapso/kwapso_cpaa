/* ============================================================================
   Signature — the sign-off capture field (0 direct call sites; reached
   through the screen engine as a field type).

   WHAT THIS IS, AND WHY — READ THIS FIRST
   The commission names `signature` / `Signature` and describes it nowhere,
   and the string "signature" does not occur once in the kit. It was resolved
   rather than guessed silently; the reasoning, the rejected reading and the
   recommendation are in GAPS-CE SIG-1. In short: it sits in section 6 among
   `choice`, `rating`, `notes`, `image`, `map`, `video` and `web-embed` —
   which is a list of FIELD TYPES a screen engine renders, not a list of
   layout parts — and the kit's checklist view has rows whose last column is
   a sign-off ("Process map signed off", "Go-live sign-off"). So this is the
   control that captures one: a pointer-drawn mark inside a field shell.

   DESIGN SOURCE — COMPOSED FROM DRAWN PARTS, NOTHING NEW INVENTED
   design-mothership/specimens/_fragments/t9.css + kwapso-ui.css →
     `.kw-textbox`, chapter 9's "the one 24px-radius shell": page fill, ONE
     hairline on `--hair`, `--radius` (24), and the same six states every
     other chapter-9 field draws — hover to `--hair-strong`, error at 65%
     poppy, read-only loses its edge entirely, disabled a
     faint fill with disabled ink. `textarea.tsx` already carries that skin
     and this file matches it class for class, including its `min-h-[6rem]`,
     so the signing area is the same box as the long-text area rather than a
     second one at a size the kit never states.
   The clear control is the dense pill `search-input.tsx` already ships for
     its own clear, on the neutral `--accent` row wash.

   THE LAW THIS FILE OBEYS
   · A box takes the box radius. 24, never a pill and never `--radius-sm`.
   · The stroke is drawn in the CURRENT INK, read off the canvas's own
     computed `color` at draw time, so it is charcoal in light and off-beige
     in dark with no colour named anywhere in this file. That is also what
     makes an existing signature re-render correctly after a theme flip.
   · Disabled is a fill and an ink (`--hair-faint` / `--ink-disabled`), never
     an opacity, and the hover shift is suppressed so a dead field never looks
     signable.
   · Read-only loses its edge ENTIRELY — chapter 9's rule, and it is exactly
     right here: a signature that has been given is a system-set value, not a
     field you failed to fill in.
   · Focus is ONE global rule (tokens.css §8). The canvas is focusable so a
     keyboard user can reach the field and its clear control; no ring is
     defined here and nothing sets `outline: none`.
   · The exclusive state is resolved ONCE in JS, so no two class sets race:

       disabled  >  read-only  >  error  >  default

   · Every user-facing string is a prop with a default, including the hint
     inside the empty box and the accessible description of a signature that
     has already been given.

   WHAT THIS FILE DELIBERATELY DOES NOT DO
   It does not draw a baseline, a cross, an "x" or a dotted rule inside the
   box. The kit contains no dashed or dotted stroke anywhere — `file-upload`
   already refused to invent one for its drop zone — and a printed signing
   line is a paper convention the kwapso surface does not have.

   RENDERING CONTEXT
   `"use client"`. A canvas, pointer capture, a resize observer and state.
   ========================================================================= */

"use client";

import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { RotateCcw } from "../../icons";

const shellVariants = cva(
  [
    "relative w-full min-w-0 overflow-hidden",
    // Chapter 9's one 24-radius shell: 6rem tall at least, one hairline.
    "min-h-[6rem] rounded-[var(--radius)]",
    "bg-background text-foreground",
    "transition-[box-shadow,background-color,color]",
    "duration-[var(--duration-colour)] ease-kwapso",
  ],
  {
    variants: {
      /** Mutually exclusive. Resolved once, in JS, below. */
      state: {
        default: [
          /* ch02's hairline carve-out covers a field; the artifact draws it as
             an inset shadow, never a `border` (review 1A · fix 2). */
          "shadow-[var(--hairline)]",
          // A colour shift, never a fade.
          "hover:shadow-[var(--hairline-strong)]",
          /* Focus adds nothing: the global ring IS the treatment, and a
             second stroke inside it reads as one thick line (fix 4). */
        ],
        /** Chapter 9's field error: poppy at 65%, token-driven through color-mix. */
        error: ["shadow-[var(--hairline-error)]", "hover:shadow-[var(--hairline-error)]"],
        /** "System-set values lose the edge entirely." Faint fill, no hairline. */
        readOnly: ["shadow-none bg-hair-faint", "hover:shadow-none"],
        /** A fill and an ink. Never looks signable, so hover does not move. */
        disabled: [
          "cursor-not-allowed shadow-[var(--hairline)] bg-hair-faint text-ink-disabled",
          "hover:shadow-[var(--hairline)]",
        ],
      },
    },
    defaultVariants: { state: "default" },
  },
);

/** One stroke: the points of a single pen-down to pen-up, in unit coordinates. */
type Stroke = ReadonlyArray<readonly [number, number]>;

export interface SignatureProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onChange" | "defaultValue"> {
  /**
   * The signature already given, as the strokes it was captured from, in
   * coordinates normalised to the box (0–1 on both axes). Normalised rather
   * than pixels so the same mark re-renders correctly at any width and at all
   * three text-size steps. `null` means unsigned.
   */
  value?: readonly Stroke[] | null;
  /** The signature the field starts with when it manages its own state. */
  defaultValue?: readonly Stroke[];
  /** Fired when the mark changes: after each stroke, and on clear (with `[]`). */
  onValueChange?: (value: readonly Stroke[]) => void;
  /** The field cannot be signed. A fill and an ink, never an opacity. */
  disabled?: boolean;
  /** A signature that has been given and may not be changed. Loses its edge. */
  readOnly?: boolean;
  /** The field failed validation. Also accepted as `aria-invalid`. */
  error?: boolean;
  /**
   * The signature has not arrived yet. Takes the read-only skin and announces
   * `aria-busy`, exactly as `input.tsx` does — signing over a mark that has
   * not loaded would throw away whichever one lost.
   */
  loading?: boolean;
  /**
   * The field's accessible name. Defaulted so no call site ships a nameless
   * field, and a prop because the apps run in Arabic, Urdu and Persian.
   */
  label?: string;
  /**
   * The quiet words inside an empty box. Tertiary ink, the same tier a
   * placeholder takes. Set to an empty string for a box with no hint.
   */
  placeholder?: string;
  /** What a screen reader hears once a signature exists. */
  signedLabel?: string;
  /** The clear control's accessible name. */
  clearLabel?: string;
  /**
   * How thick the pen is, in rem against the 16 authoring base. `0.125` is
   * the 2 stroke chapter 10 already uses for the checkbox tick, which is the
   * only hand-drawn mark the kit has. Not a px: it scales with the text-size
   * control like everything else.
   */
  strokeWidth?: number;
}

/**
 * The system's signature field.
 *
 * TEN STATES
 *  1. default        — page fill, one hairline, the box radius, the hint in
 *                      tertiary ink.
 *  2. hover          — hairline to `--hair-strong`. A colour shift, never a
 *                      fade, and suppressed when the field cannot be signed.
 *  3. focus-visible  — the RING, and nothing else; tokens.css §8
 *                      and this file adds none. The canvas is a real tab stop
 *                      so the field can be reached, and the clear control is
 *                      the next one.
 *  4. active/pressed — does not apply as a skin. The pen-down IS the feedback:
 *                      ink appears under the pointer. A box that also changed
 *                      colour while being signed would fight the mark.
 *  5. disabled       — `--hair-faint` fill, `--ink-disabled` ink, hover
 *                      frozen, pointer events off, clear control withdrawn,
 *                      out of the tab order.
 *  6. loading        — `loading`: the read-only skin, non-signable,
 *                      `aria-busy`. Same rule and same reason as `input`.
 *  7. empty          — the hint, in tertiary ink. An unsigned field draws
 *                      nothing else — no baseline, no cross, no dotted rule
 *                      (see the header) — and it is not an error until it is
 *                      submitted.
 *  8. error          — `error` or `aria-invalid`: the 65% poppy hairline, the
 *                      same one chapter 9 gives every other field. The
 *                      MESSAGE beside it is ink and belongs to `Field`.
 *  9. selected       — does not apply. A signature is given or it is not;
 *                      there is nothing here to select.
 * 10. read-only      — `readOnly`: the edge goes away entirely, the pad leaves
 *                      the tab order (review 1A · fix 5), the faint
 *                      fill carries the state, the clear control is withdrawn
 *                      and the mark stays exactly as it was drawn.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED, and the normalised coordinates are
 *  what let it be. The box is `w-full` at every width and at least 6rem tall,
 *  inheriting its measure from the parent the way every chapter-9 field does;
 *  the mark is stored in unit coordinates and re-rendered against whatever
 *  width the box currently has, so a signature captured on a phone renders
 *  correctly in a desktop table cell instead of being clipped. A phone is in
 *  fact the BEST case for this field — a finger is the intended pen — so
 *  nothing has to grow: the whole box is already far past the 44 touch row.
 *
 * RTL — safe, with one thing worth saying. The shell, the hint and the clear
 * control use logical insets only, so the clear chip sits at the reading-end
 * corner in Arabic, Urdu and Persian. The MARK is not mirrored: a signature
 * is a person's own hand, and flipping it would forge it. That is deliberate,
 * not an oversight.
 */
const Signature = React.forwardRef<HTMLDivElement, SignatureProps>(
  (
    {
      className,
      value,
      defaultValue,
      onValueChange,
      disabled = false,
      readOnly = false,
      error,
      loading = false,
      label = "Signature",
      placeholder = "Sign here",
      signedLabel = "Signed",
      clearLabel = "Clear",
      strokeWidth = 0.125,
      "aria-invalid": ariaInvalid,
      ...props
    },
    ref,
  ) => {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const [uncontrolled, setUncontrolled] = React.useState<readonly Stroke[]>(
      () => defaultValue ?? [],
    );
    // The stroke currently under the pointer, kept out of committed state so a
    // pen-down does not reconcile the whole field on every pointer move.
    const liveRef = React.useRef<Array<readonly [number, number]>>([]);
    const [, nudge] = React.useReducer((n: number) => n + 1, 0);

    const strokes = value ?? uncontrolled;
    const invalid = error ?? (ariaInvalid === true || ariaInvalid === "true");
    const locked = readOnly || loading;
    const inert = disabled || locked;

    // One exclusive state, resolved here so no two class sets can race.
    const state = disabled ? "disabled" : locked ? "readOnly" : invalid ? "error" : "default";
    const signed = strokes.length > 0;

    /* Painting. Everything is measured off the element and its computed
       colour, so no size and no colour is written in this file. */
    const paint = React.useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const box = canvas.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;

      const density = window.devicePixelRatio || 1;
      const bitmapWidth = Math.round(box.width * density);
      const bitmapHeight = Math.round(box.height * density);
      if (canvas.width !== bitmapWidth) canvas.width = bitmapWidth;
      if (canvas.height !== bitmapHeight) canvas.height = bitmapHeight;

      const pen = canvas.getContext("2d");
      if (!pen) return;

      pen.setTransform(density, 0, 0, density, 0, 0);
      pen.clearRect(0, 0, box.width, box.height);

      // The ink is whatever the element's own `color` resolves to, which is a
      // token, which flips with the palette for free.
      pen.strokeStyle = window.getComputedStyle(canvas).color;
      // rem against the root, so the pen scales with the text-size control.
      const rootSize = parseFloat(
        window.getComputedStyle(document.documentElement).fontSize || "16",
      );
      pen.lineWidth = strokeWidth * rootSize;
      pen.lineCap = "round";
      pen.lineJoin = "round";

      const draw = (stroke: Stroke) => {
        if (stroke.length === 0) return;
        pen.beginPath();
        stroke.forEach(([x, y], i) => {
          const px = x * box.width;
          const py = y * box.height;
          if (i === 0) pen.moveTo(px, py);
          else pen.lineTo(px, py);
        });
        // A single tap is a dot, not an invisible zero-length line.
        if (stroke.length === 1) pen.lineTo(stroke[0][0] * box.width, stroke[0][1] * box.height);
        pen.stroke();
      };

      strokes.forEach(draw);
      draw(liveRef.current);
    }, [strokes, strokeWidth]);

    React.useEffect(() => {
      paint();
    }, [paint]);

    // The box takes its width from the parent, so the mark has to be re-laid
    // whenever that changes. Normalised coordinates make that lossless.
    React.useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || typeof ResizeObserver === "undefined") return;
      const watcher = new ResizeObserver(() => paint());
      watcher.observe(canvas);
      return () => watcher.disconnect();
    }, [paint]);

    const commit = (next: readonly Stroke[]) => {
      if (value === undefined) setUncontrolled(next);
      onValueChange?.(next);
    };

    const pointAt = (event: React.PointerEvent<HTMLCanvasElement>): readonly [number, number] => {
      const box = event.currentTarget.getBoundingClientRect();
      return [
        Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1),
        Math.min(Math.max((event.clientY - box.top) / box.height, 0), 1),
      ] as const;
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (inert) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      liveRef.current = [pointAt(event)];
      nudge();
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (inert || liveRef.current.length === 0) return;
      // Signing is a continuous gesture; the browser must not turn it into a
      // scroll halfway through, which is what `touch-none` below prevents.
      liveRef.current = [...liveRef.current, pointAt(event)];
      paint();
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (inert || liveRef.current.length === 0) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const finished = liveRef.current;
      liveRef.current = [];
      commit([...strokes, finished]);
    };

    const handleClear = () => {
      if (inert) return;
      liveRef.current = [];
      commit([]);
    };

    return (
      <div
        ref={ref}
        data-slot="signature"
        data-readonly={locked ? "true" : undefined}
        data-state={state}
        data-signed={signed ? "" : undefined}
        className={cn(shellVariants({ state }), className)}
        {...props}
      >
        <canvas
          ref={canvasRef}
          data-slot="signature-canvas"
          // The field is reachable by keyboard even though it cannot be
          // signed with one: a reader has to be able to land on it, hear what
          // it is, and tab on to the clear control.
          /* Review 1A · fix 5: a read-only pad is not a focus target either. */
          tabIndex={disabled || locked ? -1 : 0}
          role="img"
          aria-label={signed ? `${label}: ${signedLabel}` : label}
          aria-invalid={invalid || undefined}
          aria-busy={loading || undefined}
          aria-readonly={locked || undefined}
          aria-disabled={disabled || undefined}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={cn(
            "block h-full min-h-[6rem] w-full",
            // The gesture is a signature, not a scroll.
            "touch-none",
            inert ? "cursor-not-allowed" : "cursor-crosshair",
          )}
        />

        {!signed && placeholder !== "" ? (
          <span
            aria-hidden="true"
            data-slot="signature-placeholder"
            className={cn(
              "pointer-events-none absolute inset-0 grid place-content-center",
              "text-sm font-[var(--font-weight-light)]",
              disabled ? "text-ink-disabled" : "text-muted-foreground",
            )}
          >
            {placeholder}
          </span>
        ) : null}

        {signed && !inert ? (
          <button
            type="button"
            data-slot="signature-clear"
            onClick={handleClear}
            aria-label={clearLabel}
            className={cn(
              // The dense square at the pill radius on the neutral row wash —
              // the same clear control `search-input` already ships.
              "absolute top-2 end-2 grid size-[var(--control-height-dense)] place-content-center",
              "cursor-pointer rounded-pill border-0 bg-transparent text-ink-secondary",
              "hover:bg-accent hover:text-foreground",
              "transition-colors duration-[var(--duration-colour)] ease-kwapso",
            )}
          >
            <RotateCcw size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    );
  },
);

Signature.displayName = "Signature";

export { Signature, shellVariants as signatureShellVariants };
