/* ============================================================================
   FileUpload — the drop zone and the list of what was dropped (8 direct call
   sites).

   DESIGN SOURCE
   CH16 · "Filters, search, upload" — the artifact DRAWS this. The header used
   to open "The kit draws NO file upload … there is no dashed rule anywhere in
   the system to borrow", and both halves are false against the 2026-08-23
   artifact: CH16 draws a `Dropzone` block and an `Upload list` block, and its
   declaration set contains the system's one and only `border: 1px dashed
   var(--hair2)`. GAPS-C.md FUP-1 was written against the older reading and is
   superseded for the zone's own skin; the parts it assembled that the artifact
   does NOT draw (the browse control, the per-file error message) still stand.
     · the box — `--radius` (24), card fill, and a 1px DASHED `--hair-strong`
       edge, all three CH16's own (`padding: 32px 24px`, `gap: 8px`,
       `border: 1px dashed var(--hair2)`).
     · the drag-over wash — `.motion-drop-target[data-over="true"]` from
       motion/motion.css, which is already `--accent`, the neutral row/item
       wash. Nothing new is defined here.
     · the row — 56 (`--control-height-row`), the kit's table row, at the
       24 box radius on the faint fill.
     · the per-file message — chapter 9's `.kw-field__error`, reused verbatim
       through `field`'s exported class list so the two are one drawing.

   THE LAW THIS FILE OBEYS
   · THE ZONE'S EDGE IS THE ONE `border` PROPERTY IN `primitives/`, because it
     is the one DASHED stroke the artifact draws and a dash cannot be an inset
     shadow. Everything else in this file — and every other edge in the system
     — is still an inset shadow (review 1A · fix 2). A BUTTON still carries no
     edge at all, which is why the browse control is a real `Button` and not an
     outlined box.
   · Disabled is a fill and an ink (`--hair-faint` / `--ink-disabled`), never
     an opacity, and the hover shift is suppressed.
   · Error is the 65% poppy hairline chapter 9 states, through `color-mix` so
     dark re-resolves to poppy-lift — the same expression `input.tsx` uses.
     The MESSAGE stays ink; poppy is the hairline and the dot.
   · Focus is ONE global rule (tokens.css §8). The zone defines no ring; the
     file input inside it is visually hidden but NOT display:none, so it stays
     focusable and the global rule can reach it.
   · Every user-facing string is a prop with a default.

   RENDERING CONTEXT
   `"use client"`. Drag state, a ref to the hidden input, and four pointer
   handlers.
   ========================================================================= */

"use client";

import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { Button } from "../button/button";
import { fieldErrorClasses } from "../field/field";
import { FileText, Upload, X } from "../../icons";

/** One row in the list under the zone. */
export interface FileUploadItem {
  /** Stable key, and the handle `onRemove` is called with. */
  id: string;
  /** What the row says. Comes from the file, so it is never translated. */
  name: string;
  /** Bytes. Rendered through `formatSize`; omit and the row shows no size. */
  size?: number;
  /**
   * This one file failed — too large, wrong type, the upload broke. Drawn as
   * chapter 9's message: a small poppy dot and INK words, under the name.
   */
  error?: React.ReactNode;
}

const zoneVariants = cva(
  [
    /* LEFT-ALIGNED, and never centred. CH16 draws the dropzone
       `display: flex; flex-direction: column; gap: 8px; align-items: flex-start`
       and writes no `text-align` on it at all. This block used to say
       `items-center justify-center text-center`, which is the same fault
       DEF-2 found on `CollectionRegister` and which 27.21 answers in one
       line — "left-aligned like everything else". A zone that centres its
       prompt also centres it against every left-aligned form it sits in.
       Audited 2026-08-23, GAPS-FIDELITY-BC UPL-B1. */
    "flex w-full flex-col items-start gap-2",
    // The box: 24 radius, 32 block / 24 inline inset (CH16's `32px 24px`),
    // card fill, one dashed edge. The fill moves with FLD-B5: the artifact
    // draws its surfaces on `var(--card)` and the two are identical in light,
    // so this is a dark-only correction — on the page tone the zone read as a
    // hole punched in the panel instead of as paper laid on it.
    "rounded-[var(--radius)] px-6 py-8 bg-card",
    "transition-[box-shadow,background-color,color]",
    "duration-[var(--duration-colour)] ease-kwapso",
    // motion.css owns the drag-over fill; this file writes no keyframe and no
    // duration of its own for it.
    "motion-drop-target",
  ],
  {
    variants: {
      /** Mutually exclusive. Resolved once, in JS, below. */
      state: {
        default: [
          /* UPL-C1 — THE EDGE IS A 1px DASHED `--hair-strong`, AND IT IS A
             REAL `border`. Not a slip and not an extension of the pattern:
             `border: 1px dashed var(--hair2)` is a declaration the ARTIFACT
             ITSELF draws, in CH16, on this exact shape, alongside the
             `padding: 32px 24px` and the `gap: 8px` this file already takes
             from the same block. It is the only dashed declaration anywhere
             in the artifact's twenty-seven chapters, and p06 renders it.

             What this replaces is the reasoning, not just the class. The
             block used to read the no-border law as forbidding it, citing
             ch26's "the dashed '+ filter' slot is the only bordered control
             in the system". Two things are wrong with that citation. First,
             ch26 draws no border at all — the sentence is prose, and CH11,
             which actually draws `+ filter`, gives it no edge in any of its
             88 declarations. Second, a drop zone is not a control: it is a
             region, and the sentence ch26 writes is about controls. The one
             dashed stroke the artifact draws is this one.

             Dashed cannot be an inset shadow, so this is the single place in
             `primitives/` that writes a `border` property. The stroke is the
             token, not a literal: `--hair-strong` IS the artifact's
             `var(--hair2)`. */
          "border border-dashed border-[var(--hair-strong)] text-foreground",
          /* NO HOVER. The zone used to sit at 8% and promote to 20% on
             pointer, which is the same inversion override 42 removed from
             every field: 20% is the RESTING edge the artifact draws, and
             there is nowhere above it to go. CH16 draws this zone at rest and
             draws no hover for it. The next thing it does is state `over`. */
          // Over: the edge goes to ink. The fill is motion.css's. This is a
          // drag state, not a focus state.
          "data-[over=true]:border-[var(--foreground)]",
        ],
        /** Chapter 9's 65%, token-driven so dark re-resolves to poppy-lift.
         *  Spelled as the mix rather than as `--hairline-error`, because that
         *  token is an inset SHADOW and this edge has to be dashed; the
         *  expression is the token's own, so no second value exists. */
        error: [
          "border border-dashed",
          "border-[color-mix(in_srgb,var(--destructive)_65%,transparent)]",
          "text-foreground",
        ],
        /** A fill and an ink. Never looks droppable, so hover does not move. */
        disabled: [
          "cursor-not-allowed border border-dashed border-[var(--hair)]",
          "bg-hair-faint text-ink-disabled",
        ],
      },
    },
    defaultVariants: { state: "default" },
  },
);

/** SI symbols, not words — but still a prop, because not every locale uses them. */
const DEFAULT_SIZE_UNITS = ["B", "kB", "MB", "GB", "TB"] as const;

function formatSizeDefault(bytes: number, units: readonly string[]): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const rounded = unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

export interface FileUploadProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onChange" | "children"> {
  /** The words in the middle of the zone. Translatable. */
  prompt?: React.ReactNode;
  /** The browse control's label. Translatable. */
  browseLabel?: string;
  /** A quiet line under the control — "PDF or PNG, up to 10 MB". No default. */
  hint?: React.ReactNode;
  /** Passed to the hidden input. `image/*`, `.pdf`, whatever the app allows. */
  accept?: string;
  /** More than one file at a time. */
  multiple?: boolean;
  /** Native `name`, so the zone works inside an uncontrolled form. */
  name?: string;
  /** Called with everything the reader dropped or picked. */
  onFilesSelected?: (files: File[]) => void;
  /** What has been picked so far. Rendered as rows under the zone. */
  files?: FileUploadItem[];
  /** Called with a row's `id`. The remove control appears only when given. */
  onRemove?: (id: string) => void;
  /** The remove control's accessible name. Translatable. */
  removeLabel?: string;
  /** Nothing has been picked yet and the call site wants to say so. No default. */
  emptyLabel?: React.ReactNode;
  /** Byte-size units, in ascending order. Translatable. */
  sizeUnits?: readonly string[];
  /** Replace the size formatting wholesale, for a locale the units cannot express. */
  formatSize?: (bytes: number) => string;
  /**
   * The zone as a whole failed — nothing was accepted, the batch was too
   * large. A node is the message; `true` marks it invalid silently. A single
   * file's failure belongs on that file's row instead.
   */
  error?: React.ReactNode | boolean;
  /** An upload is in flight. The browse control spins and `aria-busy` is set. */
  loading?: boolean;
  /** Nothing may be added. A fill and an ink, and drops are refused. */
  disabled?: boolean;
  /**
   * The list may be read but not changed. The zone is withdrawn entirely and
   * the remove controls go with it — chapter 9's rule that a system-set value
   * loses its box, applied to a whole control.
   */
  readOnly?: boolean;
}

/**
 * The system's file drop zone.
 *
 * TEN STATES
 *  1. default        — 24 box, one hairline, glyph, prompt, browse control.
 *  2. hover          — hairline to `--hair-strong`, exactly as a field. A colour
 *                      shift, never a fade.
 *  3. focus-visible  — NOT here. tokens.css §8 rings the hidden file input and
 *                      the browse control; the zone is not focusable and adds
 *                      no ring of its own.
 *  4. active/pressed — the browse control's 1-unit nudge, which `button` owns.
 *                      The zone itself is not pressed; its equivalent moment
 *                      is the drag-over below.
 *  5. disabled       — `--hair-faint` fill, `--ink-disabled` ink, hover frozen,
 *                      drops refused, browse control disabled.
 *  6. loading        — `loading`: `aria-busy` on the zone and the browse
 *                      control keeps its fill and grows a spinner. The zone
 *                      stays droppable — a second file may be added while the
 *                      first is still going up.
 *  7. empty          — no rows. The zone alone IS the empty state; no row is
 *                      invented to fill the space. `emptyLabel` adds a line
 *                      only if the call site asks for one.
 *  8. error          — `error`: 65% poppy hairline on the zone, ink message
 *                      under it. A single file's failure is `item.error` and
 *                      draws on that row instead.
 *  9. selected       — expressed as the list. A picked file is a row, not a
 *                      highlighted zone; there is nothing else here to select.
 * 10. read-only      — `readOnly`: the zone is not rendered at all and the
 *                      rows lose their remove controls.
 *
 * DRAG-OVER — the state the kit has no drawing for and this component cannot
 * do without. `data-over="true"` on the zone; the fill is motion.css's
 * `.motion-drop-target`, the edge goes to ink. The counter is kept in state
 * because `dragleave` fires when the pointer crosses a CHILD's edge, so a
 * naive boolean flickers over the glyph and the words.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The zone is `w-full` and its inset
 *  is 32 at every width; the rows are the 56 table row at every width. Drag
 *  and drop does not exist on a touch device, and nothing needs to change for
 *  that: the browse control is the whole interaction there and it is already
 *  a 40 control with a 44-tall row around it.
 *
 * RTL — safe. The zone is centred, the rows are ordered by `gap` and
 * `justify-between`, every inset is logical, and no side is named.
 */
const FileUpload = React.forwardRef<HTMLDivElement, FileUploadProps>(
  (
    {
      className,
      prompt = "Drop files here",
      browseLabel = "Choose a file",
      hint,
      accept,
      multiple = false,
      name,
      onFilesSelected,
      files,
      onRemove,
      removeLabel = "Remove",
      emptyLabel,
      sizeUnits = DEFAULT_SIZE_UNITS,
      formatSize,
      error,
      loading = false,
      disabled = false,
      readOnly = false,
      ...props
    },
    ref,
  ) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    // A depth counter, not a boolean: `dragleave` fires for every child edge
    // the pointer crosses, and a boolean would flash the wash off and on.
    const depth = React.useRef(0);
    const [over, setOver] = React.useState(false);

    const invalid = error !== undefined && error !== null && error !== false && error !== "";
    const message = typeof error === "boolean" ? undefined : error;
    const inert = disabled || readOnly;

    const state = disabled ? "disabled" : invalid ? "error" : "default";
    const rows = files ?? [];

    const open = () => {
      if (inert) return;
      inputRef.current?.click();
    };

    const emit = (list: FileList | null) => {
      if (!list || list.length === 0) return;
      onFilesSelected?.(Array.from(list));
    };

    const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
      if (inert) return;
      event.preventDefault();
      depth.current += 1;
      setOver(true);
    };

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
      if (inert) return;
      // Without this the browser navigates to the dropped file.
      event.preventDefault();
    };

    const handleDragLeave = () => {
      if (inert) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
      if (inert) return;
      event.preventDefault();
      depth.current = 0;
      setOver(false);
      emit(event.dataTransfer?.files ?? null);
    };

    const size = (bytes: number) =>
      formatSize ? formatSize(bytes) : formatSizeDefault(bytes, sizeUnits);

    return (
      <div
        ref={ref}
        data-slot="file-upload"
        data-disabled={disabled ? "" : undefined}
        data-invalid={invalid ? "" : undefined}
        className={cn("flex w-full min-w-0 flex-col gap-3", className)}
        {...props}
      >
        {readOnly ? null : (
          <div
            data-slot="file-upload-zone"
            data-state={state}
            data-over={over ? "true" : undefined}
            aria-busy={loading || undefined}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={open}
            className={cn(zoneVariants({ state }))}
          >
            {/* Visually hidden rather than `hidden`: a hidden input is not
                focusable, and the global focus rule must be able to reach the
                control a keyboard reader tabs to. */}
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              accept={accept}
              multiple={multiple}
              name={name}
              disabled={inert}
              aria-hidden="true"
              tabIndex={-1}
              onChange={(event) => {
                emit(event.currentTarget.files);
                // Same file twice in a row must still fire a change.
                event.currentTarget.value = "";
              }}
            />

            {/* UPL-C2 — the glyph sits in a WELL, and the well is CH16's:
                `width: 40px; height: 40px; border-radius: 999px;
                background: var(--sheet)`. The build drew a bare glyph on the
                zone's own fill, so the one mark in an otherwise empty 32×24
                box had nothing holding it. 40 is `--control-height-button`,
                the same box every icon-only control in the system uses, and
                `--surface-panel` is the artifact's `--sheet`.

                The glyph itself stays at 24. CH16 draws it at 18, which is
                not on the icon ladder (16/20/22/24/28/32 — override 20 admits
                28 and stops), and admitting a seventh size to gain six pixels
                inside a well that is now the right size is not a trade this
                pass makes. Logged. */}
            <span
              aria-hidden="true"
              className={cn(
                "grid size-[var(--control-height-button)] shrink-0 place-content-center",
                "rounded-pill bg-[var(--surface-panel)]",
              )}
            >
              <Upload
                size={24}
                className={disabled ? "text-ink-disabled" : "text-ink-tertiary"}
              />
            </span>

            {/* CH16 draws the prompt at `font-size: 14px; font-weight: 500` —
                the zone's one line of Medium, and the only thing in the box
                that is not quiet. GAPS-FIDELITY-BC UPL-B2. */}
            <p className="text-sm font-[var(--font-weight-medium)]">{prompt}</p>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              loading={loading}
              onClick={(event) => {
                event.stopPropagation();
                open();
              }}
            >
              {browseLabel}
            </Button>

            {hint !== undefined && hint !== null ? (
              <p className="text-badge text-ink-tertiary">{hint}</p>
            ) : null}
          </div>
        )}

        {message !== undefined && message !== null ? (
          <p data-slot="file-upload-error" className={cn(fieldErrorClasses)}>
            <span
              aria-hidden="true"
              className="size-[0.375rem] shrink-0 rounded-pill bg-destructive"
            />
            <span className="min-w-0">{message}</span>
          </p>
        ) : null}

        {rows.length > 0 ? (
          <ul data-slot="file-upload-list" className="flex list-none flex-col gap-2 p-0">
            {rows.map((file) => (
              <li
                key={file.id}
                data-slot="file-upload-item"
                data-invalid={file.error ? "" : undefined}
                className={cn(
                  "flex min-h-[var(--control-height-row)] items-center gap-3",
                  "rounded-[var(--radius)] bg-hair-faint px-4 py-3",
                )}
              >
                <FileText size={20} aria-hidden="true" className="text-ink-tertiary" />

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-sm font-[var(--font-weight-light)]">
                    {file.name}
                  </span>
                  {file.error ? (
                    <span className={cn(fieldErrorClasses)}>
                      <span
                        aria-hidden="true"
                        className="size-[0.375rem] shrink-0 rounded-pill bg-destructive"
                      />
                      <span className="min-w-0">{file.error}</span>
                    </span>
                  ) : file.size !== undefined ? (
                    <span className="text-badge tabular-nums text-ink-tertiary">
                      {size(file.size)}
                    </span>
                  ) : null}
                </div>

                {onRemove && !readOnly && !disabled ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={removeLabel}
                    onClick={() => onRemove(file.id)}
                  >
                    <X aria-hidden="true" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : emptyLabel !== undefined && emptyLabel !== null ? (
          <p data-slot="file-upload-empty" className="text-badge text-ink-tertiary">
            {emptyLabel}
          </p>
        ) : null}
      </div>
    );
  },
);

FileUpload.displayName = "FileUpload";

export { FileUpload, zoneVariants as fileUploadZoneVariants };
