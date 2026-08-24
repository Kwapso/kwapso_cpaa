/* ============================================================================
   Image — the media box (0 direct call sites, and the shape `video`,
   `web-embed` and `map` all copy).

   DESIGN SOURCE
   The kit draws no standalone image component. The three things it DOES draw
   that bear on one are used instead, and nothing else is invented:
   · design-mothership/specimens/_fragments/t22.css → `.kw-msg__media` — the
     kit's only picture-shaped block. A ratio box on a paper tone at the card
     radius, with NO hairline and no glyph. That is the media well.
   · design-mothership/specimens/kwapso-patterns.css → `.kw-register` — what
     the kit shows when something is not there. The failure register's ink
     tiers and caption step are reused inside the frame.
   · components/primitives/skeleton/skeleton.tsx → `variant="media"` is
     `aspect-[16/9]` at `--radius`, so the skeleton this image replaces and
     the image itself occupy exactly the same box. That is why 16/9 is the
     default ratio here rather than a guess.
   Everything else this file needed is logged in GAPS-G.md (IMG-1 … IMG-5).

   THE LAW THIS FILE OBEYS
   · A media box takes `--radius` (24). Not the pill, not the mark radius.
     There is no `shape` prop, because a second radius here would be a fifth
     radius in the system.
   · The placeholder ground is `--surface-quiet` — a real paper tone that
     flips with the palette. It is NEVER an opacity of the image or of the
     ink; an alpha of a token is a colour the palette does not contain.
   · Focus is the one global rule (tokens.css §8). Nothing here defines a
     ring; an <img> is not focusable and this file does not make it one.
   · `alt` is a PROP WITH A DEFAULT, like every other string. The apps run in
     Arabic, Urdu and Persian; an alt baked into a component is both an i18n
     bug and an accessibility one. The default is the empty string, which is
     the honest one: a component cannot describe a picture it has never seen,
     and "" is the correct, spec-defined value for decoration.
   · The native `loading="lazy"|"eager"` attribute is NOT this component's
     `loading` prop. House rule: a `loading` prop is a boolean. The native
     attribute is reached through `lazy`, which defaults to true.

   RENDERING CONTEXT
   `"use client"`. A broken image is one of the most common things a real
   application shows, so load and failure are tracked as state here rather
   than left to the call site — that is a hook and two event handlers.
   ========================================================================= */

"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { Loader2, TriangleAlert } from "../../icons";

/* ----------------------------------------------------------------------------
   The frame. Shared drawing for every media state, so a picture that fails
   occupies exactly the box the picture that loads would have occupied and the
   page does not reflow when the network answers.
   ------------------------------------------------------------------------- */
const imageVariants = cva(
  [
    "relative isolate block w-full overflow-hidden",
    // Media box radius. The one radius a media box may take.
    "rounded-[var(--radius)]",
    // The ground under every state — a paper tone, never an alpha.
    "bg-surface-quiet",
  ],
  {
    variants: {
      /** How the picture fills the frame. Both are `object-fit`, not a crop. */
      fit: {
        /** Fills the box, trimming the overflow. The default for a well. */
        cover: "",
        /** Fits inside the box, letterboxed on the quiet ground. */
        contain: "",
      },
    },
    defaultVariants: {
      fit: "cover",
    },
  },
);

/** The picture itself. Kept out of the cva so the frame owns exactly one `cn`. */
const MEDIA_BASE = "block size-full";

export interface ImageProps
  extends Omit<React.ComponentPropsWithoutRef<"img">, "loading" | "className">,
    VariantProps<typeof imageVariants> {
  /**
   * Alternative text. A prop with a default, never a hardcoded string.
   * The default is `""` — the spec-defined value for a decorative picture —
   * because a component cannot describe an image it has not seen. Pass a
   * translated string wherever the picture carries meaning.
   */
  alt?: string;
  /**
   * The box the picture reserves, as a CSS `aspect-ratio`. Defaults to 16/9,
   * which is the box `Skeleton variant="media"` draws, so the placeholder and
   * the picture are the same size and nothing jumps on arrival.
   * Pass `null` to let the picture size itself — accepting the layout shift.
   */
  ratio?: string | number | null;
  /**
   * Busy. A control keeps its fill and grows a spinner; a media box does the
   * same — the quiet ground stays, the spinner sits on it, `aria-busy` is
   * announced. Set automatically while the browser is fetching; pass `true`
   * to hold the register open while the call site resolves a URL.
   */
  loading?: boolean;
  /**
   * Force the failure register. The component already detects a failed fetch
   * itself; this is for the case where the call site knows first (a 404 from
   * the API, a permission answer) and never gives this component a URL to try.
   */
  error?: boolean;
  /** Announced while the picture is being fetched. Translatable. */
  loadingLabel?: string;
  /** Shown and announced when the picture cannot be displayed. Translatable. */
  errorLabel?: string;
  /**
   * Defer the fetch until the box is near the viewport. Maps to the native
   * `loading` attribute, which this component's own boolean `loading` prop
   * has taken the name of. Default `true`.
   */
  lazy?: boolean;
  /**
   * Render nothing when there is no `src`. Default `false`: a media box with
   * no picture still holds the space it was given, the way the kit's media
   * well does. Set `true` where the box should collapse instead.
   */
  hideWhenEmpty?: boolean;
  /** Classes for the <img> itself. The root's classes come from `className`. */
  mediaClassName?: string;
  /** Merged onto the frame, last, so a call site always wins. */
  className?: string;
}

/**
 * A picture in a media box, with its loading and failure registers built in.
 *
 * TEN STATES
 *  1. default        — the picture, `object-fit` per `fit`, on the quiet ground.
 *  2. hover          — does not apply. A picture is not a control. Where a call
 *                      site wraps one in a link or a button, that element owns
 *                      the hover; adding one here would make every avatar and
 *                      every thumbnail look clickable.
 *  3. focus-visible  — NOT here. An <img> is not focusable and this file does
 *                      not make it one. tokens.css §8 rings whatever wrapper a
 *                      call site makes focusable, at that wrapper's radius.
 *  4. active/pressed — does not apply, for the same reason as hover.
 *  5. disabled       — does not apply. A picture cannot be disabled. A picture
 *                      that may not be shown is the ERROR register, not a
 *                      greyed one, and greying it would be an opacity anyway.
 *  6. loading        — the quiet ground plus the spinner, `aria-busy` set. Held
 *                      until the browser reports the bytes decoded, or until a
 *                      passed `loading` goes false.
 *  7. empty          — no `src`: the quiet frame alone, holding its box. It
 *                      draws no icon, because an empty well is a resting state
 *                      and not a failure. `hideWhenEmpty` collapses it instead.
 *  8. error          — the failure register: `TriangleAlert` over `errorLabel`
 *                      in secondary ink on the quiet ground, `role="img"` with
 *                      the label as its accessible name so the failure is
 *                      announced once and not read as decoration.
 *  9. selected       — does not apply. Selection belongs to whatever collection
 *                      holds the picture, and it draws the selection.
 * 10. read-only      — always. There is nothing here to write to.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED, and deliberately: the frame is
 *  `w-full` and takes its width from the parent at every width, with its height
 *  following from `ratio`. A media box that resized itself would stop matching
 *  the skeleton it replaces. Where a grid goes from one column to three, the
 *  grid is the composition's and the box follows it for free.
 *
 * RTL — safe. The frame names no side; the registers are centred; every inset
 * is logical. `object-fit` has no direction.
 */
const Image = React.forwardRef<HTMLImageElement, ImageProps>(
  (
    {
      className,
      mediaClassName,
      fit = "cover",
      src,
      alt = "",
      ratio = "16 / 9",
      loading = false,
      error = false,
      loadingLabel = "Loading…",
      errorLabel = "Image unavailable",
      lazy = true,
      hideWhenEmpty = false,
      style,
      onLoad,
      onError,
      ...props
    },
    ref,
  ) => {
    const innerRef = React.useRef<HTMLImageElement | null>(null);
    const setRefs = React.useCallback(
      (node: HTMLImageElement | null) => {
        innerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as { current: HTMLImageElement | null }).current = node;
      },
      [ref],
    );

    /** idle → the bytes have not arrived yet. Reset whenever the URL changes. */
    const [phase, setPhase] = React.useState<"idle" | "loaded" | "failed">("idle");

    React.useEffect(() => {
      setPhase("idle");
      // A picture already in the browser's cache can finish decoding before
      // React attaches onLoad, in which case the event never fires and the
      // spinner would sit over a picture that is already there. `complete`
      // is the only way to catch that, and it has to be read after paint.
      const node = innerRef.current;
      if (node && node.complete && node.naturalWidth > 0) setPhase("loaded");
    }, [src]);

    const empty = src === undefined || src === null || src === "";
    const failed = error || phase === "failed";
    const busy = !failed && !empty && (loading || phase !== "loaded");

    if (empty && hideWhenEmpty && !failed) return null;

    const frameStyle: React.CSSProperties = {
      ...(ratio === null || ratio === undefined ? null : { aspectRatio: String(ratio) }),
      ...style,
    };

    return (
      <div
        data-slot="image"
        data-state={failed ? "error" : busy ? "loading" : empty ? "empty" : "default"}
        aria-busy={busy || undefined}
        style={frameStyle}
        className={cn(imageVariants({ fit }), className)}
      >
        {!empty && !failed ? (
          <img
            ref={setRefs}
            data-slot="image-media"
            src={src}
            alt={alt}
            loading={lazy ? "lazy" : "eager"}
            decoding="async"
            onLoad={(event) => {
              setPhase("loaded");
              onLoad?.(event);
            }}
            onError={(event) => {
              setPhase("failed");
              onError?.(event);
            }}
            className={cn(
              MEDIA_BASE,
              fit === "contain" ? "object-contain" : "object-cover",
              mediaClassName,
            )}
            {...props}
          />
        ) : null}

        {busy ? (
          <span
            data-slot="image-loading"
            role="status"
            aria-label={loadingLabel}
            className="absolute inset-0 grid place-content-center bg-surface-quiet"
          >
            {/* `.motion-spinner` is motion.css's one rotation — the kit-stated
                700ms turn on the linear curve. It keeps running under reduced
                motion on purpose: a frozen spinner is the absence of the only
                signal that the fetch is still open. */}
            <Loader2 size={20} aria-hidden="true" className="motion-spinner text-ink-tertiary" />
          </span>
        ) : null}

        {failed ? (
          <span
            data-slot="image-error"
            role="img"
            aria-label={errorLabel}
            className={cn(
              "absolute inset-0 grid place-content-center justify-items-center gap-2",
              "px-4 text-center",
            )}
          >
            <TriangleAlert size={20} aria-hidden="true" className="text-ink-tertiary" />
            {/* Caption step, secondary ink — the register's body treatment. */}
            <span aria-hidden="true" className="text-caption text-ink-secondary">
              {errorLabel}
            </span>
          </span>
        ) : null}
      </div>
    );
  },
);

Image.displayName = "Image";

export { Image, imageVariants };
