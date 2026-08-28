/* ============================================================================
   Map — the plate, its pins and the list beside them (0 direct call sites).

   WHAT THIS IS, AND WHAT IT IS NOT
   It is a FRAME plus the artifact's map VIEW, not a renderer. No mapping
   library is on the permitted dependency list and none is added, so this
   component does not draw tiles, markers or a projection. The plate arrives
   one of three ways: a `src` (a provider's embed URL, framed and sandboxed),
   `children` (the application's own renderer, handed the plate), or nothing
   at all — the muted plate the artifact draws, with the caller's own pins
   placed on it as percentages the application projected. Logged in full as
   GAPS-G.md MAP-1.

   DESIGN SOURCE — the artifact, 27.29 "Map", read in full
   · "The list is always beside it — A map is paired with the records in view,
     never shown alone. Pins are for orientation; the list is for reading,
     selecting and opening. Selecting in one marks the other."
   · "It says who is missing — Records without an address are counted in words
     under the list and remain reachable in the list view. A map that silently
     omits two accounts is a map that lies about the size of the business."
     The artifact's own line, verbatim, is the default: "Two accounts have no
     address and are not on the map. They are in the list view." — and because
     the count is data, it is a prop.
   · "Pins take the status accents — Sky, forest, poppy — the same three as
     every chart, with a paper capsule label on the ones that matter and bare
     dots for the rest. Never mango: a pin is a state, not the brand."
   · "The plate stays muted — A desaturated, low-contrast base with no
     saturated tiles, no satellite imagery and no coloured roads — the pins
     must be the only bright thing on it. Labels on the plate sit in paper
     capsules, never over raw map detail."
   · "Two controls only — Zoom in, zoom out, both round paper wells on the
     plate. No compass, no layer switcher, no fullscreen — and the map never
     takes the whole window: it stays inside the panel with the frame around
     it."
   · "Narrow demotes the map — Below 720px the plate becomes a 170px header
     strip and the list carries the screen." Both numbers are the artifact's.
   The box itself is the media well the kit does draw —
   design-mothership/specimens/_fragments/t22.css → `.kw-msg__media`, shared
   with `image` through `imageVariants`.

   THE LAW THIS FILE OBEYS
   · NO CSS `border`, anywhere, at any thinness. The plate had a hairline and
     the list rows had a black/grey border pair; both are gone. Separation is
     colour and fill, which is the only separation the brand allows.
   · SELECTION IS NOT A BORDER, AND IT IS NOT CHARCOAL EITHER. A selected row
     takes `--surface-selected` (override 44; it was `--surface-panel` under
     override 40, until the K1 reversal put that paper under the rows) — the
     SAME wash `TableRow` and `List` give a
     selected record, which is override 40's whole point: the system holds
     ONE answer for a selected record, not three. This row used to take
     chapter 10's on-state (`--surface-inverse` with `--ink-on-inverse`),
     which is the mark for a two-state CONTROL — a checkbox, a mode toggle, a
     day in the date grid — and not for a record in a list. A charcoal row in
     a list of accounts was the loudest thing on the screen and did not match
     the same account picked in a table two clicks away. Its pin still grows
     its paper capsule at the same moment, which is "selecting in one marks
     the other".
   · NO EMPTY-BOX DRAWING. The artifact forbids it in the same breath in
     27.28: "never a camera glyph, never a dashed box". The no-location and
     empty registers are TYPE — a sentence on the quiet ground — and the
     placeholder `Route` glyph that used to sit there is deleted.
   · Media boxes take `--radius` (24), and `overflow-hidden` clips whatever
     the provider paints to it.
   · Pins are `--info` (sky), `--success` (forest) and `--destructive`
     (poppy), plus a neutral. Never `--surface-brand`.
   · The registers sit on `--surface-quiet`. Never an opacity.
   · Every string is a prop with a default.
   · Focus is the one global rule. Nothing here defines a ring.

   RENDERING CONTEXT
   `"use client"`. Load state is state, and the list selects.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { imageVariants } from "../image/image";
import { Loader2, TriangleAlert } from "../../foundations/icons";

/**
 * Scripts and same-origin, nothing else — every embedded map provider needs
 * both and none of them needs form submission or top-level navigation from
 * inside the frame. Same default as `web-embed`; a call site may replace it.
 */
const DEFAULT_SANDBOX = "allow-scripts allow-same-origin";

/**
 * The three status accents the artifact names for a pin, plus the bare dot
 * for a record whose state does not matter here. Mango is deliberately not a
 * member: "a pin is a state, not the brand".
 */
export type MapPinStatus = "sky" | "forest" | "poppy" | "neutral";

const PIN_FILL: Record<MapPinStatus, string> = {
  sky: "bg-[var(--info)]",
  forest: "bg-[var(--success)]",
  poppy: "bg-[var(--destructive)]",
  neutral: "bg-surface-inverse",
};

export interface MapPin {
  /** Matches a list item's `id`, so selecting in one marks the other. */
  id: string;
  /** What the paper capsule says. Drawn only when `label` is on. */
  name?: React.ReactNode;
  /** Where the application projected it, 0–100 across the plate. DATA, not a design value. */
  x: number;
  /** Where the application projected it, 0–100 down the plate. DATA, not a design value. */
  y: number;
  /** Sky, forest, poppy — or the neutral dot. */
  status?: MapPinStatus;
  /** "a paper capsule label on the ones that matter and bare dots for the rest". */
  label?: boolean;
}

export interface MapItem {
  /** Matches a pin's `id`. */
  id: string;
  /** The record's name. One line. */
  name: React.ReactNode;
  /** The quiet second line — "Barcelona · 2 apps". */
  meta?: React.ReactNode;
}

export interface MapProps extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  /**
   * A provider's embed URL. Framed in a sandboxed iframe. Leave it off and
   * pass `children`, or nothing at all, and the muted plate is the base.
   */
  src?: string;
  /**
   * The frame's accessible name — announced, never drawn. Defaulted so no
   * call site ships an unnamed frame, and a prop so it translates. It says
   * what the map is OF; "Map" alone is the fallback, not the goal.
   */
  title?: string;
  /**
   * The box the plate reserves, as a CSS `aspect-ratio`. 4/3 by default
   * rather than the 16/9 the other media boxes use: a map is read in two
   * dimensions and a letterbox throws away the one a reader pans in most.
   * `null` lets the plate take its height from the parent. Ignored below
   * 720px when `items` are present — see `narrow`.
   */
  ratio?: string | number | null;
  /** The pins. Placed by the caller's own projection; see `MapPin`. */
  pins?: MapPin[];
  /** The records in view. "A map is paired with the records in view, never shown alone." */
  items?: MapItem[];
  /** The marked record. Marks the row AND its pin. */
  selectedId?: string | null;
  /** Fired with the record's id when a row or a pin is chosen. */
  onSelectItem?: (id: string) => void;
  /**
   * The count over the list — the artifact's "In view · 5 of 7". A node, so
   * the caller writes its own sentence in its own language.
   */
  inViewLabel?: React.ReactNode;
  /**
   * "It says who is missing." The artifact's own line is the default, and it
   * is a prop because the number is data and the sentence is language.
   * Pass `null` when nothing is missing.
   */
  missingLabel?: React.ReactNode;
  /** The two controls, and there are only two. Translatable. */
  zoomInLabel?: string;
  zoomOutLabel?: string;
  /** Pressed when a zoom well is used. Off means the wells are not drawn. */
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  /** Busy. Held automatically until an embedded frame reports it has loaded. */
  loading?: boolean;
  /**
   * Force the failure register. Required for the `src` path: a cross-origin
   * frame fires `load` for a refused embed exactly as it does for a good one,
   * so only the application can know that the map did not come.
   */
  error?: boolean;
  /** Announced while the map is loading. Translatable. */
  loadingLabel?: string;
  /** Said, in type, when there is nothing to put on the map. Translatable. */
  emptyLabel?: string;
  /** Said, in type, when the map cannot be displayed. Translatable. */
  errorLabel?: string;
  /** The list's accessible name. Translatable. */
  listLabel?: string;
  /** Defer an embedded map until the box is near the viewport. Default `true`. */
  lazy?: boolean;
  /** Replaces the sandbox on the embedded frame wholesale. See the header. */
  sandbox?: string;
  /** Render nothing when there is no map, no pins, no items and no children. */
  hideWhenEmpty?: boolean;
  /** The application's own map surface. Ignored when `src` is given. */
  children?: React.ReactNode;
}

/* The register: type on the quiet ground. No glyph, no box, no dashed rule —
   27.28's rule, applied here because a map with nothing on it is the same
   case as a tile with no image. */
const REGISTER = "absolute inset-0 grid place-content-center justify-items-center gap-2 px-4 text-center";

/**
 * The map view: a muted plate with status-accent pins, the records beside it,
 * and the sentence that says who is missing.
 *
 * TEN STATES
 *  1. default        — the muted plate with its pins, the list beside it on
 *                      desktop and under it on narrow, and the missing line
 *                      under the list.
 *  2. hover          — a list row takes `--accent`, the kit's neutral row
 *                      wash. A pin grows nothing: hovering a dot that is 9px
 *                      across is not an affordance, and the row beside it is.
 *  3. focus-visible  — NOT here. tokens.css §8 rings the rows, the pins and
 *                      the two zoom wells at their own radii.
 *  4. active/pressed — does not apply to the plate. A row's press resolves
 *                      into the selected state, which is louder than a nudge.
 *  5. disabled       — does not apply. A map that may not be interacted with
 *                      is a static picture, which is `Image`. GAPS-G.md MAP-3.
 *  6. loading        — "Loading map" on the quiet ground with the spinner,
 *                      `aria-busy` announced.
 *  7. empty          — no plate and no pins: the sentence, in type, on the
 *                      quiet ground. Never an icon, never a dashed box.
 *  8. error          — the sentence, announced once, with the one glyph the
 *                      kit does draw for a failure.
 *  9. selected       — `--surface-selected` on the row (override 44), and the pin
 *                      takes its paper capsule. No border, in either place.
 * 10. read-only      — always. This component never writes a location.
 *
 * THREE BREAKPOINTS
 *  mobile   — the artifact's own rule: "Below 720px the plate becomes a 170px
 *             header strip and the list carries the screen." The plate loses
 *             its ratio and takes 170px; the zoom wells go, because "on
 *             narrow the map is a picture, not a tool".
 *  tablet   — from 720px the plate and the list sit side by side, the list at
 *             the artifact's fixed 250px column.
 *  desktop  — UNCHANGED from tablet.
 *
 * RTL — safe. The grid columns mirror, every inset is logical, and a pin is
 * placed with `insetInlineStart` so a projected x follows the reading
 * direction rather than a named side.
 */
const Map = React.forwardRef<HTMLDivElement, MapProps>(
  (
    {
      className,
      src,
      title = "Map",
      ratio = "4 / 3",
      pins,
      items,
      selectedId = null,
      onSelectItem,
      inViewLabel,
      missingLabel,
      zoomInLabel = "Zoom in",
      zoomOutLabel = "Zoom out",
      onZoomIn,
      onZoomOut,
      loading = false,
      error = false,
      loadingLabel = "Loading map",
      emptyLabel = "No location to show",
      errorLabel = "The map could not be loaded",
      listLabel = "Records in view",
      lazy = true,
      sandbox = DEFAULT_SANDBOX,
      hideWhenEmpty = false,
      style,
      children,
      ...props
    },
    ref,
  ) => {
    const [loaded, setLoaded] = React.useState(false);

    React.useEffect(() => {
      setLoaded(false);
    }, [src]);

    const embedded = src !== undefined && src !== null && src !== "";
    const hasPins = (pins?.length ?? 0) > 0;
    const hasList = (items?.length ?? 0) > 0;
    const empty = !embedded && !children && !hasPins;
    // A supplied renderer reports its own readiness through `loading`; only an
    // embedded frame can be waited on from here.
    const busy = !error && !empty && (loading || (embedded && !loaded));
    const zooms = onZoomIn !== undefined || onZoomOut !== undefined;

    if (empty && !hasList && hideWhenEmpty && !error) return null;

    const plateStyle: React.CSSProperties = {
      ...(ratio === null || ratio === undefined ? null : { aspectRatio: String(ratio) }),
      ...(hasList ? null : style),
    };

    const plate = (
      <div
        data-slot="map-plate"
        data-state={error ? "error" : busy ? "loading" : empty ? "empty" : "default"}
        role="group"
        aria-label={title}
        aria-busy={busy || undefined}
        style={plateStyle}
        /* No border. The plate is a paper tone against the card it sits on,
           which is the only separation the brand allows. On narrow the
           artifact demotes it to a 170px strip and drops the ratio with it. */
        className={cn(
          imageVariants(),
          /* 170px strip below 720px. A definite width AND a definite height
             make `aspect-ratio` inert, so the ratio simply stops applying
             until the plate gets its height back at 45rem. */
          hasList && "h-[10.625rem] min-[45rem]:h-auto min-[45rem]:self-start",
        )}
      >
        {!error && embedded ? (
          <iframe
            data-slot="map-frame"
            src={src}
            title={title}
            sandbox={sandbox}
            referrerPolicy="strict-origin-when-cross-origin"
            loading={lazy ? "lazy" : "eager"}
            onLoad={() => setLoaded(true)}
            className="block size-full border-0 bg-transparent"
          />
        ) : null}

        {!error && !embedded && children ? (
          <div data-slot="map-surface" className="size-full">
            {children}
          </div>
        ) : null}

        {/* The pins. Sky, forest, poppy — never mango — with a paper capsule
            on the ones that matter and a bare dot for the rest. */}
        {!error && !busy && hasPins
          ? pins!.map((pin) => {
              const marked = selectedId !== null && selectedId === pin.id;
              const capsule = pin.label === true || marked;

              return (
                <button
                  key={pin.id}
                  type="button"
                  data-slot="map-pin"
                  data-status={pin.status ?? "neutral"}
                  data-selected={marked ? "true" : undefined}
                  aria-pressed={marked}
                  onClick={() => onSelectItem?.(pin.id)}
                  style={{ insetInlineStart: `${pin.x}%`, top: `${pin.y}%` }}
                  className={cn(
                    "absolute flex -translate-y-1/2 cursor-pointer items-center gap-2",
                    /* The reset line, WITHOUT `[font:inherit]`: Tailwind emits
                       that arbitrary property AFTER the named utilities in the
                       bundle, where it silently outranks any control's own
                       type step (the accordion/mode-toggle bug). The pin's
                       type lives on its capsule label span, so preflight's
                       `button { font: inherit }` already does the whole job —
                       measured identical live. */
                    "border-0 p-0",
                    // A bare dot is a mark, and a mark is 6 (ruling 03) — but
                    // a round dot is round, so the pill radius is the one it
                    // takes, exactly as every other dot in the kit does.
                    capsule
                      ? "rounded-pill bg-card ps-2 pe-3 py-1 shadow-sm"
                      : "rounded-pill bg-transparent",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "block size-[0.5625rem] shrink-0 rounded-pill",
                      PIN_FILL[pin.status ?? "neutral"],
                    )}
                  />
                  {capsule && pin.name !== undefined ? (
                    <span className="whitespace-nowrap text-badge text-foreground">
                      {pin.name}
                    </span>
                  ) : null}
                </button>
              );
            })
          : null}

        {/* Two controls only: zoom in, zoom out, both round paper wells. */}
        {zooms && !error && !busy && !empty ? (
          /* Gone on narrow — "on narrow the map is a picture, not a tool". */
          <div
            data-slot="map-zoom"
            className={cn(
              "absolute bottom-3 end-3 hidden flex-col gap-2",
              hasList ? "min-[45rem]:flex" : "flex",
            )}
          >
            <button
              type="button"
              aria-label={zoomInLabel}
              onClick={onZoomIn}
              disabled={onZoomIn === undefined}
              className={cn(
                "grid size-[var(--control-height-dense)] cursor-pointer place-content-center",
                "rounded-pill border-0 bg-card text-foreground shadow-sm",
                "hover:bg-accent",
                "transition-colors duration-[var(--duration-colour)] ease-kwapso",
              )}
            >
              {/* TYPE, not a glyph: the artifact draws the two wells as
                  "+" and "−", and the delivered set has no minus icon. */}
              <span aria-hidden="true" className="text-sm leading-none">+</span>
            </button>
            <button
              type="button"
              aria-label={zoomOutLabel}
              onClick={onZoomOut}
              disabled={onZoomOut === undefined}
              className={cn(
                "grid size-[var(--control-height-dense)] cursor-pointer place-content-center",
                "rounded-pill border-0 bg-card text-foreground shadow-sm",
                "hover:bg-accent",
                "transition-colors duration-[var(--duration-colour)] ease-kwapso",
              )}
            >
              <span aria-hidden="true" className="text-sm leading-none">−</span>
            </button>
          </div>
        ) : null}

        {busy ? (
          <span
            data-slot="map-loading"
            role="status"
            aria-label={loadingLabel}
            className={cn(REGISTER, "bg-surface-quiet")}
          >
            <Loader2 size={20} aria-hidden="true" className="motion-spinner text-ink-tertiary" />
            <span aria-hidden="true" className="text-caption text-ink-secondary">
              {loadingLabel}
            </span>
          </span>
        ) : null}

        {/* TYPE, NOT AN ICON. The artifact forbids the empty-box drawing. */}
        {empty && !error ? (
          <span data-slot="map-empty" className={REGISTER}>
            <span className="text-caption text-ink-secondary">{emptyLabel}</span>
          </span>
        ) : null}

        {error ? (
          <span
            data-slot="map-error"
            role="img"
            aria-label={errorLabel}
            className={cn(REGISTER, "bg-surface-quiet")}
          >
            <TriangleAlert size={20} aria-hidden="true" className="text-ink-tertiary" />
            <span aria-hidden="true" className="text-caption text-ink-secondary">
              {errorLabel}
            </span>
          </span>
        ) : null}
      </div>
    );

    /* No list: the plate IS the component, exactly as it was before. */
    if (!hasList) {
      return (
        <div
          ref={ref}
          data-slot="map"
          className={cn("relative w-full", className)}
          style={style}
          {...props}
        >
          {plate}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        data-slot="map"
        style={style}
        className={cn(
          // Narrow stacks — the plate is a header strip and the list carries
          // the screen. From 720px the list is the artifact's 250px column.
          "grid w-full gap-4",
          "min-[45rem]:grid-cols-[1fr_15.625rem]",
          className,
        )}
        {...props}
      >
        {plate}

        <div data-slot="map-list" className="flex min-w-0 flex-col gap-2">
          {inViewLabel !== undefined && inViewLabel !== null ? (
            <p
              data-slot="map-in-view"
              className="m-0 text-micro uppercase font-[var(--font-weight-medium)] text-ink-tertiary"
            >
              {inViewLabel}
            </p>
          ) : null}

          <ul aria-label={listLabel} className="m-0 flex list-none flex-col gap-1 p-0">
            {items!.map((item) => {
              const marked = selectedId !== null && selectedId === item.id;
              return (
                <li key={item.id} className="min-w-0">
                  <button
                    type="button"
                    data-slot="map-list-item"
                    data-selected={marked ? "true" : undefined}
                    aria-current={marked ? "true" : undefined}
                    onClick={() => onSelectItem?.(item.id)}
                    className={cn(
                      // NO BORDER, selected or not. A card is a box and takes
                      // 24; separation from the row above it is the gap and
                      // the fill, never a rule.
                      "flex w-full cursor-pointer flex-col items-start gap-0.5",
                      "rounded-[var(--radius)] border-0 px-4 py-3 text-start",
                      "transition-colors duration-[var(--duration-colour)] ease-kwapso",
                      marked
                        ? /* Override 44 — the kit's ONE selected-record wash,
                             identical to `TableRow selected` and `List`
                             selected. Override 40 made it `--surface-panel`;
                             the K1 reversal moved that paper under the rows,
                             so it is `--surface-selected` now: one rung
                             further from the page than the panel. No hover on
                             top of it: it is already the marked row.
                             OVERRIDE 77 (2026-08-27, D15-B) — 44 overturned:
                             `--surface-selected` now points at
                             `--surface-raised`, i.e. `--card` — WHICH IS THIS
                             LIST'S OWN UNSELECTED ROW FILL. The marked row
                             measures 1.000 against its neighbours in BOTH
                             palettes; only the missing hover wash and
                             `aria-current` distinguish it. Recorded loudly
                             in register row 77 — the client chose the lift
                             from a drawing that printed the 1.000. */
                          "bg-surface-selected text-foreground"
                        : "bg-card text-foreground hover:bg-accent",
                    )}
                  >
                    <span className="w-full truncate text-sm font-[var(--font-weight-medium)]">
                      {item.name}
                    </span>
                    {item.meta !== undefined && item.meta !== null ? (
                      <span
                        className={cn(
                          "w-full truncate text-badge",
                          /* One ink either way now: the wash is a paper
                             tone, not an accent, so the meta line keeps the
                             tertiary step it has on an unselected row. */
                          "text-ink-tertiary",
                        )}
                      >
                        {item.meta}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* "Records without an address are counted in words under the list." */}
          {missingLabel !== undefined && missingLabel !== null ? (
            <p data-slot="map-missing" className="m-0 text-badge text-ink-tertiary">
              {missingLabel}
            </p>
          ) : null}
        </div>
      </div>
    );
  },
);

Map.displayName = "Map";

export { Map };
