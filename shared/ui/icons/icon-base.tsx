"use client";

import * as React from "react";
import { cn } from "../lib/utils";

/* ============================================================================
   The one icon wrapper. Every one of the 93 exports is this component with a
   different `viewBox` and `children` baked in by generate-icons.mjs.

   THE ARTWORK IS PLACEHOLDER; THIS API IS FINAL.
   Swapping in real art means replacing icons/<Name>.svg and re-running the
   generator. No call site and no component changes — that is the whole point
   of the split.

   Call-site compatibility
   -----------------------
   The 93 names are lucide-react's names, so the applications' existing call
   sites are almost certainly lucide-shaped:

       <Pencil className="h-4 w-4" />
       <Loader2 className="animate-spin" size={16} />
       <Search strokeWidth={1.5} />

   All three keep working:
     · `className` is merged last, so Tailwind sizing utilities beat the
       width/height attributes and a caller can still size an icon the way
       they do today.
     · `size` is accepted as a number, a string, or one of the six delivery
       sizes.
     · `strokeWidth` / `absoluteStrokeWidth` DO SOMETHING NOW. They used to be
       accepted and ignored, because the placeholder glyphs were filled
       silhouettes with no stroke to weight. The art is the Iconoir pack, drawn
       as strokes on a 24 grid at 1.5, so the props are honest: `strokeWidth`
       sets the weight and `absoluteStrokeWidth` holds it constant in device
       pixels as the icon scales, which is lucide's meaning for both.
   ========================================================================= */

/**
 * The delivery sizes, in px as the commission names them.
 *
 * 28 is the sixth and it arrived late: 27.42 draws the module wall's icon at
 * 28 and the ladder had five. Client ruling T2, 2026-08-23 -- admit it rather
 * than snap the tile to 24 or 32, because the wall is the front door of the
 * product and the artifact drew it deliberately. verify/decisions.html T.
 */
export const ICON_SIZES = [16, 20, 22, 24, 28, 32] as const;
export type IconSize = (typeof ICON_SIZES)[number];

/** px -> the token that holds it. No component ever writes the px itself. */
const SIZE_TOKEN: Record<IconSize, string> = {
  16: "var(--icon-16)",
  20: "var(--icon-20)",
  22: "var(--icon-22)",
  24: "var(--icon-24)",
  28: "var(--icon-28)",
  32: "var(--icon-32)",
};

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, "ref"> {
  /**
   * One of the six delivery sizes, or any number / CSS length.
   *
   * A bare number is read as px-at-the-16px-authoring-base and converted to
   * rem, so `size={16}` scales with the text-size control instead of pinning
   * itself. That is deliberate and is the behaviour commission rule 5 asks
   * for; it is the one way this differs from lucide, which would hold 16px
   * flat at every scale step.
   */
  size?: IconSize | number | string;
  /**
   * Accessible name. When set the icon becomes `role="img"` and announces;
   * when absent it is `aria-hidden` decoration, which is right for an icon
   * sitting beside its own label.
   *
   * It is a prop, not a hardcoded string, because both apps run in Arabic,
   * Urdu and Persian and a string baked into a component cannot be
   * translated.
   */
  title?: string;
  /** Accepted for lucide call-site compatibility. Ignored — glyphs are filled. */
  strokeWidth?: number | string;
  /** Accepted for lucide call-site compatibility. Ignored. */
  absoluteStrokeWidth?: boolean;
}

function resolveSize(size: IconProps["size"]): string {
  if (size === undefined) return SIZE_TOKEN[24];
  if (typeof size === "number") {
    return (SIZE_TOKEN as Record<number, string | undefined>)[size] ?? `${size / 16}rem`;
  }
  const asNumber = Number(size);
  if (!Number.isNaN(asNumber)) {
    return (SIZE_TOKEN as Record<number, string | undefined>)[asNumber] ?? `${asNumber / 16}rem`;
  }
  return size;
}

export interface CreateIconOptions {
  displayName: string;
  viewBox: string;
  children: React.ReactNode;
}

export function createIcon({ displayName, viewBox, children }: CreateIconOptions) {
  const Icon = React.forwardRef<SVGSVGElement, IconProps>(function Icon(
    {
      size,
      title,
      className,
      strokeWidth = 1.5,
      absoluteStrokeWidth = false,
      ...props
    },
    ref
  ) {
    const dimension = resolveSize(size);

    /* `absoluteStrokeWidth` means "hold the stroke at this many DEVICE pixels
       as the icon scales", so it needs the size as a number. resolveSize hands
       back a CSS length (a rem token), and a caller may pass "1.5em" or a
       Tailwind class instead of a number at all — there is no px to divide by
       in those cases, so the weight is left alone rather than guessed. */
    const px = typeof size === "number" ? size : Number(size);
    const weight =
      absoluteStrokeWidth && Number.isFinite(px) && px > 0
        ? (Number(strokeWidth) * 24) / px
        : strokeWidth;
    const labelled = title !== undefined || props["aria-label"] !== undefined;

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={viewBox}
        width={dimension}
        height={dimension}
        /* THE WHOLE SET IS STROKED, so the root paints the stroke and the art
           carries only geometry. The art still names no colour of its own,
           which is how an icon works in both themes for free — it takes the
           ink of whatever it sits in.

           `fill` is none rather than currentColor, and that one word is what
           makes stroked art possible: an outline path under a filled root is
           a solid blob. The handful of glyphs with a genuinely filled part —
           the dot of an eye, a pip — set `fill="currentColor"` on that element
           themselves, and a child attribute beats this one. */
        fill="none"
        stroke="currentColor"
        strokeWidth={weight}
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
        aria-hidden={labelled ? undefined : true}
        role={labelled ? "img" : undefined}
        /* className last, so a caller's sizing utilities beat the width and
           height attributes set above. */
        className={cn("shrink-0", className)}
        {...props}
      >
        {title !== undefined ? <title>{title}</title> : null}
        {children}
      </svg>
    );
  });

  Icon.displayName = displayName;
  return Icon;
}

export type IconComponent = ReturnType<typeof createIcon>;
