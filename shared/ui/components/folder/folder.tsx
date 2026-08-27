/* ============================================================================
   Folder — the kwapso brand silhouette, as one path (new; 0 call sites yet).

   DESIGN SOURCE
   kit chapter 14, "Folder shapes — 9-slice · fixed corners & shoulder,
   stretchable fillers", plus the four brand slices shipped in
   `assets/folder/`. Chapter 24.3 ("Tabs") and 24.6 ("Record chrome") draw the
   same shape as a tab on a real screen and are the source for the tab strip's
   own numbers; chapter 27's collection anatomy states the 47.5 tab height.

   Chapter 14's own drawn markup assembles the shape from six positioned
   slices. THIS FILE DOES NOT. It draws one `<path>`, because a 9-slice made of
   images cannot take `currentColor`, cannot flip with the palette, and loads
   six assets to draw one outline. The path is a transcription of the slices,
   not a redrawing of them: every control point below is lifted verbatim from
   the shipped SVG and reassembled into a single contour.

   THE UNIT, AND WHY THERE IS ONE
   Chapter 14: "Assembled from the six brand slices at a uniform 1.6x scale."
   The slices' own coordinates are therefore the source of truth and 1.6 is the
   bridge to the kit's stated pixels. The rem base is 16, so

       1 brand unit  =  1.6 / 16 rem  =  0.1 rem, exactly.

   Every stated figure in the chapter falls out of that with no rounding:

       tab.svg       247.94 x 56.04   lip      19.05   -> 30.48  ("30.48px lip")
       corner-tr.svg  62.92 x 37      top row  36.99   -> 59.18  ("59.18px")
       corner-bl.svg 247.94 x 39.96   bottom   39.96   -> 63.94  ("63.94px")
       corner-br.svg  62.92 x 39.96   corner   62.92   -> 100.67 ("100.67 wide")
       ch24 tab                       height   29.6875 -> 47.5   ("47.5px")

   One correction falls out of it too. `corner-tr.svg` is 37 units tall, which
   would make the top row 59.20, but the chapter says 59.18 — and 59.18 is
   36.99, which is exactly `tab.svg`'s height below its own shoulder
   (56.04 - 19.05). The tab slice is authoritative and the corner slice is
   0.01 units generous. This file uses neither: the top row is not a number
   here at all, it is whatever is left after the two corner radii.

   THE LAW THIS FILE OBEYS
   · The shoulder is a CURVE, never a slant. It is the `S` in tab.svg,
     reversed, control point for control point.
   · The rounded top-left corner always survives. It is drawn at a fixed
     6.6 units at every size and is never in a stretchable run.
   · Only FLAT runs take the width and the height. Every curve is a fixed
     length in brand units, so nothing is ever scaled non-uniformly and the
     viewBox never crops through a curve — chapter 14's two hard rules.
   · Allowed fills are soft paper, off-beige, mango and charcoal. Sky, forest
     and poppy never fill a folder shape, so no status fill exists here.
   · Focus is ONE global rule (tokens.css §8). Nothing here rings anything and
     nothing sets `outline: none`. The shape is `aria-hidden` and not a target.
   · No px and no hex. The path's numbers are SVG user units in a viewBox,
     which is unitless by definition; every CSS length is a token.

   WHY IT MEASURES
   A single path cannot be stretched by CSS without distorting its curves, and
   `preserveAspectRatio` can only letterbox, not 9-slice. So the viewBox is
   recomputed to the element's own box — the same move `tabs.tsx` already makes
   for its indicator, and for the same reason: the measured number is not a
   design value, it is the size the browser has already computed, so it
   rescales with the text-size control by construction. With the viewBox equal
   to the box, one user unit is one brand unit at every size and the curves
   cannot distort.

   RENDERING CONTEXT
   `"use client"`. Refs, layout effects and two observers.
   ========================================================================= */

"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

/* ============================================================================
   The slices, transcribed

   Unitless SVG user units, straight off `assets/folder/*.svg`. These are the
   brand-unit twins of the `--folder-*` tokens (unit = rem x 10); tokens.css
   states the relation and carries the CSS side of the same numbers.
   ========================================================================= */

/** One brand unit as rem. 1.6x scale over a 16px authoring base. */
const UNIT_REM = 0.1;

const SHAPE = {
  /** tab.svg: the shoulder drops from y=0 to y=19.05. `--folder-lip`. */
  lip: 19.05,
  /** tab.svg `C2.96,0 0,2.96 0,6.6` — the top-left radius. */
  radiusLip: 6.6,
  /** …and its control inset, 6.6 - 2.96. Kappa, as the artwork drew it. */
  insetLip: 3.64,
  /** corner-tr / corner-br / corner-bl all use 7.3. */
  radius: 7.3,
  /** …and their control inset, verbatim from `c0,-4.03 -3.27,-7.3 …`. */
  inset: 4.03,
  /** tab.svg: the shoulder spans x=129.84 to x=148.29. `--folder-shoulder`. */
  shoulder: 18.45,
  /** tab.svg: the shoulder's near control point, 133.48 - 129.84. */
  shoulderLead: 3.64,
  /** tab.svg: where the flat lip ends. The default lip. `--folder-lip-width`. */
  lipWidth: 129.84,
} as const;

/** `radius - inset`; the far control offset on the three 7.3 corners. */
const OFF = SHAPE.radius - SHAPE.inset; // 3.27

/** Three decimals is finer than a device pixel at any of the three scales. */
const n = (v: number) => Math.round(v * 1000) / 1000;

const clamp = (v: number, lo: number, hi: number) =>
  hi < lo ? lo : v < lo ? lo : v > hi ? hi : v;

/* ----------------------------------------------------------------------------
   The two shared openings: the top-left corner, and the lip that runs into the
   shoulder. Both crops start with exactly these, which is the whole point —
   the rounded top-left corner survives, and the shoulder is the same curve
   whether it lands on a body or on a tab's cut edge.
   ------------------------------------------------------------------------- */
function lipAndShoulder(tab: number): string[] {
  const { lip, radiusLip, insetLip, shoulder, shoulderLead } = SHAPE;
  return [
    // Left edge, stopping under the top-left curve.
    `M0,${n(radiusLip)}`,
    // The top-left corner. tab.svg's `C2.96,0 0,2.96 0,6.6`, travelled the
    // other way: 0,2.96 -> 2.96,0 -> 6.6,0.
    `C0,${n(radiusLip - insetLip)} ${n(radiusLip - insetLip)},0 ${n(radiusLip)},0`,
    // THE LIP. A flat run, so it is allowed to take a length.
    `H${n(tab)}`,
    // THE SHOULDER. tab.svg's `S133.48,0 129.84,0`, reversed. `S` after an `h`
    // means its first control point sits on the current point, so reversed the
    // curve is: lead control at +3.64 on the lip line, then both the far
    // control and the end point at the shoulder's landing. That coincidence is
    // the artwork's, not a shortcut — it is what makes the curve leave the lip
    // horizontally and arrive at the body on a slope.
    `C${n(tab + shoulderLead)},0 ${n(tab + shoulder)},${n(lip)} ${n(tab + shoulder)},${n(lip)}`,
  ];
}

/**
 * The whole folder: lip, shoulder, body, four corners.
 *
 * `w` and `h` are the box in brand units. Only `H`, `V` and the lip run take
 * them; every `C` below is a fixed-length transcription.
 */
function folderPath(w: number, h: number, tab: number): string {
  const { lip, radius } = SHAPE;
  return [
    ...lipAndShoulder(tab),
    // The body's top edge — flat, stretchable.
    `H${n(w - radius)}`,
    // Top-right. corner-tr.svg `V7.3 c0,-4.03 -3.27,-7.3 -7.3,-7.3`, reversed.
    `C${n(w - OFF)},${n(lip)} ${n(w)},${n(lip + OFF)} ${n(w)},${n(lip + radius)}`,
    // The right edge — flat, stretchable.
    `V${n(h - radius)}`,
    // Bottom-right. corner-br.svg `c4.03,0 7.3,-3.27 7.3,-7.3`, reversed.
    `C${n(w)},${n(h - OFF)} ${n(w - OFF)},${n(h)} ${n(w - radius)},${n(h)}`,
    // The bottom edge — flat, stretchable.
    `H${n(radius)}`,
    // Bottom-left. corner-bl.svg `c0,4.03 3.27,7.3 7.3,7.3`, reversed.
    `C${n(OFF)},${n(h)} 0,${n(h - OFF)} 0,${n(h - radius)}`,
    "Z",
  ].join(" ");
}

/**
 * The lip crop: the same opening, then straight down and straight back.
 *
 * This is chapter 14's own crop — `viewBox="0 0 148.29 29.6875"` in the kit's
 * tab markup — and it passes through flat regions only: down the shoulder's
 * landing edge, across a bottom that is covered by the panel. No corner is
 * rounded on the cut, because the cut is not an edge of the shape.
 */
function lipPath(w: number, h: number, tab: number): string {
  return [...lipAndShoulder(tab), `V${n(h)}`, "H0", "Z"].join(" ");
}

/* ============================================================================
   Measurement

   One hook, one mechanism, used by both components. It returns the element's
   box in REM, not px, because everything this file draws is authored in rem
   against the 16px base and the root renders at 13/15/17 (tokens.css §1).
   ========================================================================= */

/* `useLayoutEffect` warns when React renders this module on the server, which
   it does: "use client" marks the hydration boundary, not a browser-only file.
   The measurement must still run BEFORE paint on the client, or the shape
   arrives one frame late and visibly pops. */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

interface BoxRem {
  width: number;
  height: number;
}

/** Near enough that no device pixel could tell, at any of the three scales. */
const same = (a: BoxRem | null, b: BoxRem) =>
  a !== null && Math.abs(a.width - b.width) < 0.001 && Math.abs(a.height - b.height) < 0.001;

/**
 * The element's border box, in rem. `null` until measured.
 *
 * Two things move it and both are watched: the box itself resizing, and the
 * ROOT FONT SIZE changing, which is the text-size control (tokens.css §1 puts
 * it on `<html>` as `data-scale`). The second one does not resize the html
 * element, so a ResizeObserver alone would miss it and every folder on the
 * page would keep the geometry of the previous scale.
 */
function useBoxRem(ref: React.RefObject<Element | null>): BoxRem | null {
  const [box, setBox] = React.useState<BoxRem | null>(null);

  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const measure = () => {
      const root = document.documentElement;
      const rem = Number.parseFloat(getComputedStyle(root).fontSize) || 16;
      const rect = node.getBoundingClientRect();
      const next = { width: rect.width / rem, height: rect.height / rem };
      setBox((prev) => (same(prev, next) ? prev : next));
    };

    measure();

    const resizes = new ResizeObserver(measure);
    resizes.observe(node);

    const scale = new MutationObserver(measure);
    scale.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-scale", "style", "class"],
    });

    return () => {
      resizes.disconnect();
      scale.disconnect();
    };
  }, [ref]);

  return box;
}

/* ============================================================================
   FolderShape
   ========================================================================= */

export interface FolderShapeProps
  extends Omit<React.ComponentPropsWithoutRef<"svg">, "children"> {
  /**
   * `full` — the whole folder: lip, shoulder, body, four corners.
   * `lip` — chapter 14's own crop, for a folder TAB: the lip and the shoulder
   * over a straight cut, with the box's bottom left open because the panel
   * covers it.
   */
  crop?: "full" | "lip";
  /**
   * Width of the flat lip, in rem, measured from the shape's inline start to
   * where the shoulder begins. Defaults to the artwork's own 12.984rem
   * (129.84 brand units) on `full`. `"fill"` runs the lip to the far edge less
   * the shoulder, which is what a tab does — its lip IS its width — and is the
   * default on `lip`. Clamped so the shoulder always lands inside the box.
   */
  tabWidth?: number | "fill";
}

/**
 * The kwapso folder outline, at whatever size its box is.
 *
 * Fill is `currentColor`, so the caller picks the tone with a `text-*` class
 * and it flips with the palette on its own. Chapter 14 allows four:
 * `text-surface-panel` (soft paper), `text-card` (off-beige),
 * `text-surface-brand` (mango), `text-surface-inverse` (charcoal). Sky, forest
 * and poppy never fill a folder shape.
 *
 * TEN STATES
 *  1. default        — the outline, filled with `currentColor`.
 *  2. hover          — does not apply. A shape is not a target; the control
 *                      that contains it moves its own `color` and the fill
 *                      follows, which is how the folder tab changes tone.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      and this is `aria-hidden` decoration, never focusable.
 *  4. active/pressed — does not apply, same reason.
 *  5. disabled       — does not apply to the shape. A disabled folder tab
 *                      passes `--btn-disabled-fill` as its colour.
 *  6. loading        — does not apply. There is nothing to fetch; the outline
 *                      is computed, not loaded.
 *  7. empty          — before the first measurement the path is not emitted at
 *                      all. Drawing a guessed box and correcting it would show
 *                      a wrong shape; drawing nothing shows the ground. On the
 *                      client the layout effect runs before paint, so this is
 *                      invisible. See the shape's log for the SSR case.
 *  8. error          — does not apply.
 *  9. selected       — does not apply.
 * 10. read-only      — does not apply.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED, and that is the whole design: the
 *  shape responds continuously to its own box at every width rather than at
 *  three points. The curves are a fixed rem length at every size, so a narrow
 *  folder is the same folder with shorter flat runs.
 *
 * RTL — out of scope by decision, LTR only. The lip is on the inline start in
 * the artwork and this file draws it on the left; mirroring it needs a kit
 * ruling on whether the brand shape flips at all, not a transform.
 */
const FolderShape = React.forwardRef<SVGSVGElement, FolderShapeProps>(
  ({ className, crop = "full", tabWidth, ...props }, ref) => {
    const own = React.useRef<SVGSVGElement | null>(null);
    const box = useBoxRem(own);

    const setRef = React.useCallback(
      (node: SVGSVGElement | null) => {
        own.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<SVGSVGElement | null>).current = node;
      },
      [ref],
    );

    const drawn = React.useMemo(() => {
      if (!box || box.width <= 0 || box.height <= 0) return null;

      const { lip, radius, radiusLip, shoulder, lipWidth } = SHAPE;

      // The box, in brand units.
      const w = box.width / UNIT_REM;
      const h = box.height / UNIT_REM;

      if (crop === "lip") {
        // A tab's lip runs the whole width less the shoulder, so the shape has
        // no independent width: the width IS the lip plus the shoulder.
        const width = Math.max(w, radiusLip + shoulder);
        const height = Math.max(h, lip);
        const requested = tabWidth === undefined || tabWidth === "fill"
          ? width - shoulder
          : tabWidth / UNIT_REM;
        const tab = clamp(requested, radiusLip, width - shoulder);
        return { w: width, h: height, d: lipPath(width, height, tab) };
      }

      // A folder needs room for both corner radii under the lip, and for the
      // shoulder to land before the top-right corner starts.
      const width = Math.max(w, radiusLip + shoulder + 2 * radius);
      const height = Math.max(h, lip + 2 * radius);
      const requested =
        tabWidth === undefined
          ? lipWidth
          : tabWidth === "fill"
            ? width - shoulder - radius
            : tabWidth / UNIT_REM;
      const tab = clamp(requested, radiusLip, width - shoulder - radius);
      return { w: width, h: height, d: folderPath(width, height, tab) };
    }, [box, crop, tabWidth]);

    return (
      <svg
        ref={setRef}
        data-slot="folder-shape"
        data-crop={crop}
        aria-hidden="true"
        focusable="false"
        /* The viewBox is recomputed to the measured box, so its aspect ratio
           and the element's are the same number and `none` cannot distort
           anything. It is preferred over the default `meet` only so a
           sub-unit rounding difference letterboxes nothing and leaves no
           hairline of ground showing along an edge. */
        preserveAspectRatio="none"
        viewBox={drawn ? `0 0 ${n(drawn.w)} ${n(drawn.h)}` : undefined}
        className={cn("block size-full", className)}
        {...props}
      >
        {drawn ? <path d={drawn.d} fill="currentColor" /> : null}
      </svg>
    );
  },
);

FolderShape.displayName = "FolderShape";

/* ============================================================================
   FolderPanel
   ========================================================================= */

/**
 * The four fills chapter 14 allows, under the names `card.tsx` already gives
 * the same four tones, so the system has one vocabulary for them and not two.
 * There is no fifth: "Sky, forest, and poppy never fill a folder shape."
 */
const folderPanelVariants = cva(["relative isolate flex flex-col"], {
  variants: {
    variant: {
      /** Soft paper. Chapter 14's own drawing of the panel. */
      default: "text-foreground",
      /** Off-beige — the raised tone, and what 24.3 and 24.6 draw on a screen. */
      raised: "text-card-foreground",
      /** Mango, CHARCOAL ink. The accent law, no exceptions. */
      brand: "text-ink-on-accent",
      /** Charcoal, off-beige ink. */
      inverse: "text-ink-on-inverse",
    },
  },
  defaultVariants: { variant: "default" },
});

/** The tone the SHAPE is painted in, as a `color` for `currentColor`. */
const PANEL_FILL: Record<
  NonNullable<VariantProps<typeof folderPanelVariants>["variant"]>,
  string
> = {
  default: "text-surface-panel",
  raised: "text-card",
  brand: "text-surface-brand",
  inverse: "text-surface-inverse",
};

export interface FolderPanelProps
  extends React.ComponentPropsWithoutRef<"section">,
    VariantProps<typeof folderPanelVariants> {
  /**
   * What sits in the tab lip. A node rather than a string, so a caller can put
   * a count or a mark beside the label without this file holding either — and
   * so nothing user-facing is hardcoded here at all.
   */
  header?: React.ReactNode;
  /** Extra classes for the lip. */
  headerClassName?: string;
  /** Extra classes for the body. */
  bodyClassName?: string;
}

/**
 * A section whose header lives in the tab lip and whose body starts flush
 * where the shoulder lands.
 *
 * Chapter 14 states the composition rule and it cannot be enforced from here,
 * so it is written down instead: use the folder panel ONCE PER PAGE, for the
 * section that carries the page's subject. Two folder panels on one screen
 * cancel each other out.
 *
 * The lip sizes itself to its header and never less than the artwork's own
 * 12.984rem, and the measured width is fed back to the shape as its lip — so
 * the label is inside the lip and never across the join, at any string length
 * in any locale.
 *
 * TEN STATES
 *  1. default        — the outline in the variant's tone, header in the lip.
 *  2. hover          — does not apply. A panel is a region, not a target. A
 *                      folder panel that is also a link is not drawn anywhere
 *                      in the kit and is not invented here.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      and a panel is not one. Controls inside it ring
 *                      themselves; nothing here clips them, because the shape
 *                      is a sibling behind the content and sets no overflow.
 *  4. active/pressed — does not apply, same reason.
 *  5. disabled       — does not apply. A section is not a control.
 *  6. loading        — does not apply to the panel. A body whose contents have
 *                      not arrived renders a `Skeleton` inside it; swapping the
 *                      whole shape for a placeholder would move the heading the
 *                      reader is already looking at.
 *  7. empty          — a panel with no children still draws: the shape holds
 *                      its minimum height and the lip holds its header. That is
 *                      a real state, not a hole — the section exists and has
 *                      nothing in it yet.
 *  8. error          — does not apply. The body carries its own `Alert`.
 *  9. selected       — does not apply. A panel is not one of a set.
 * 10. read-only      — does not apply.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The panel is a block at the parent's
 *  width and the shape follows it continuously; the body's inset does not step
 *  down on a narrow screen, because chapter 14 states one inset and a folder
 *  that changed its proportions by width would stop being the same silhouette.
 *  What is inside the body does its own responding.
 *
 * RTL — out of scope by decision, LTR only. Logical properties throughout, but
 * the shape itself does not mirror; see `FolderShape`.
 */
const FolderPanel = React.forwardRef<HTMLElement, FolderPanelProps>(
  (
    { className, headerClassName, bodyClassName, variant = "default", header, children, ...props },
    ref,
  ) => {
    const lipRef = React.useRef<HTMLDivElement | null>(null);
    const lip = useBoxRem(lipRef);

    return (
      <section
        ref={ref}
        data-slot="folder-panel"
        data-variant={variant}
        className={cn(
          folderPanelVariants({ variant }),
          "min-h-[var(--folder-min-height)]",
          className,
        )}
        {...props}
      >
        {/* Behind the content: a negative z-index child paints under in-flow
            siblings, and `isolate` on the section keeps it from sliding under
            whatever the panel was dropped into. */}
        <FolderShape
          className={cn("absolute inset-0 -z-10", PANEL_FILL[variant ?? "default"])}
          tabWidth={lip ? lip.width : undefined}
        />

        {/* THE LIP. Exactly the shoulder's drop tall, so `items-center` centres
            the header in the lip and the body below it starts flush where the
            shoulder lands — which is the whole definition of this component.
            It is `w-fit` over the artwork's own lip so a long header grows the
            lip rather than spilling across the join, and capped so the lip can
            never push the shoulder past the far corner. */}
        <div
          ref={lipRef}
          data-slot="folder-panel-header"
          className={cn(
            "flex h-[var(--folder-lip)] w-fit shrink-0 items-center",
            "min-w-[var(--folder-lip-width)]",
            "max-w-[calc(100%_-_var(--folder-shoulder)_-_var(--folder-radius))]",
            // ch14 draws the lip label at 12/500. `text-xs` is the 12 step;
            // the weight is stated because the step does not carry one.
            "px-6 text-xs font-[var(--font-weight-medium)] whitespace-nowrap",
            headerClassName,
          )}
        >
          {header}
        </div>

        <div
          data-slot="folder-panel-body"
          className={cn(
            "px-8 pt-6 pb-[var(--folder-body-inset-end)]",
            bodyClassName,
          )}
        >
          {children}
        </div>
      </section>
    );
  },
);

FolderPanel.displayName = "FolderPanel";

export { FolderShape, FolderPanel, folderPanelVariants };
