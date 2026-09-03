/* ============================================================================
   Video — the moving media box (1 direct call site).

   DESIGN SOURCE
   The kit draws no player. Every value here comes from something it does draw:
   · design-mothership/specimens/_fragments/t22.css → `.kw-msg__media` — the
     media well: a ratio box on a paper tone at the card radius, no hairline.
     Shared with `image` through `imageVariants`, so the two are one drawing.
   · design-mothership/specimens/kwapso-ui.css → `.kw-btn` geometry for the
     overlay play control: the standing control height (40), the pill radius,
     `--surface-raised` with `--shadow-rest`, and `--accent` as the neutral
     hover. Never mango: a play control is not the brand fill.
   · design-mothership/specimens/kwapso-patterns.css → `.kw-register` for the
     failure register's ink tiers and caption step.
   Everything the kit left open is in GAPS-G.md (VID-1 … VID-4).

   THE LAW THIS FILE OBEYS
   · A media box takes `--radius` (24), and the poster ground is
     `--surface-quiet` — a paper tone, never an opacity of anything. A video
     that has not loaded is not a faded video.
   · The overlay play control is a real <button> with a translatable
     accessible name ("Play"), not a decorative triangle. It is reachable by
     keyboard and rung by tokens.css §8 like every other control.
   · Focus is the one global rule. Nothing here defines a ring.
   · Disabled is a fill and an ink: the native controls are withdrawn and the
     ink drops to `--ink-disabled`. It is never an opacity.
   · Nothing autoplays and nothing loops unless the call site asks: both are
     native attributes and both pass straight through.

   RENDERING CONTEXT
   `"use client"`. Playback, buffering and failure are state, and the play
   control reaches the element through a ref.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { imageVariants } from "../image/image";
import {
  CircleNotch,
  Play,
  Warning,
} from "../../foundations/icons";

export interface VideoProps
  extends Omit<React.ComponentPropsWithoutRef<"video">, "className"> {
  /**
   * The box the player reserves, as a CSS `aspect-ratio`. 16/9 by default —
   * the same box `Skeleton variant="media"` draws, so the placeholder and the
   * player are the same size. `null` lets the media size itself.
   */
  ratio?: string | number | null;
  /**
   * Busy. Set by this component while the browser is buffering; pass `true`
   * to hold the register open while the call site resolves a URL.
   */
  loading?: boolean;
  /** Force the failure register — for when the call site knows first. */
  error?: boolean;
  /** Announced while the media is buffering. Translatable. */
  loadingLabel?: string;
  /** Shown and announced when the media cannot be played. Translatable. */
  errorLabel?: string;
  /**
   * The overlay play control's accessible name. Translatable, and defaulted
   * so no call site can ship an unnamed control.
   */
  playLabel?: string;
  /**
   * Draw the overlay play control. Defaults to the inverse of `controls`: with
   * the browser's own controls on there is already a play button and a second
   * one over the poster is two answers to one question.
   */
  showPlayControl?: boolean;
  /** Render nothing when there is no source. Default `false` — the box holds. */
  hideWhenEmpty?: boolean;
  /** Classes for the <video> itself. The root's come from `className`. */
  mediaClassName?: string;
  /** Merged onto the frame, last, so a call site always wins. */
  className?: string;
  /** A media box that may not be played. A fill and an ink, never an opacity. */
  disabled?: boolean;
}

/**
 * A video in a media box, with its buffering and failure registers built in.
 *
 * TEN STATES
 *  1. default        — the poster (or the first frame) in the media box; the
 *                      overlay play control if `showPlayControl`.
 *  2. hover          — on the play control only: `--accent`, the neutral wash.
 *                      The frame itself has no hover; a video is not a row.
 *  3. focus-visible  — NOT here. tokens.css §8 rings the play control and the
 *                      native control strip at their own radii.
 *  4. active/pressed — the play control takes the kit's 1px press nudge, the
 *                      same as every button. The frame does not move.
 *  5. disabled       — `disabled`: native controls withdrawn, play control
 *                      withdrawn, ink to `--ink-disabled` on the quiet ground.
 *                      A fill and an ink; never an opacity.
 *  6. loading        — buffering or `loading`: spinner on the quiet ground,
 *                      `aria-busy` announced. The poster stays behind it.
 *  7. empty          — no `src` and no <source> children: the quiet frame,
 *                      holding its box. `hideWhenEmpty` collapses it instead.
 *  8. error          — the failure register: `Warning` over `errorLabel`
 *                      in secondary ink, announced once via `role="img"`.
 *  9. selected       — does not apply. Selection belongs to the collection.
 * 10. read-only      — always, in the sense that matters: this component never
 *                      writes. Playback position is the browser's, not a value
 *                      this component owns or edits.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. `w-full` at every width with the
 *  height following `ratio`, so the player fills whatever column the
 *  composition gives it. `playsInline` is defaulted on, which is the one thing
 *  a phone genuinely needs: without it iOS takes the video fullscreen the
 *  moment it plays, which is a navigation the composition never asked for.
 *
 * RTL — safe. The registers and the play control are centred, no side is
 * named, and the native control strip mirrors itself.
 */
const Video = React.forwardRef<HTMLVideoElement, VideoProps>(
  (
    {
      className,
      mediaClassName,
      src,
      poster,
      ratio = "16 / 9",
      controls = true,
      playsInline = true,
      preload = "metadata",
      loading = false,
      error = false,
      disabled = false,
      loadingLabel = "Loading…",
      errorLabel = "Video unavailable",
      playLabel = "Play",
      showPlayControl,
      hideWhenEmpty = false,
      style,
      children,
      onError,
      onWaiting,
      onPlaying,
      onPlay,
      onPause,
      onLoadedData,
      onEnded,
      ...props
    },
    ref,
  ) => {
    const innerRef = React.useRef<HTMLVideoElement | null>(null);
    const setRefs = React.useCallback(
      (node: HTMLVideoElement | null) => {
        innerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as { current: HTMLVideoElement | null }).current = node;
      },
      [ref],
    );

    const [buffering, setBuffering] = React.useState(false);
    const [started, setStarted] = React.useState(false);
    const [failed, setFailed] = React.useState(false);

    React.useEffect(() => {
      setBuffering(false);
      setStarted(false);
      setFailed(false);
    }, [src]);

    const empty = (src === undefined || src === null || src === "") && !children;
    const isFailed = error || failed;
    const busy = !isFailed && !empty && (loading || buffering);
    const drawPlay =
      (showPlayControl ?? !controls) && !isFailed && !empty && !disabled && !started;

    if (empty && hideWhenEmpty && !isFailed) return null;

    const frameStyle: React.CSSProperties = {
      ...(ratio === null || ratio === undefined ? null : { aspectRatio: String(ratio) }),
      ...style,
    };

    const handlePlayControl = () => {
      const node = innerRef.current;
      if (!node) return;
      // `play()` returns a promise that rejects when the browser blocks the
      // gesture. Swallowing it silently would hide a real failure, so a
      // rejection puts the component into its failure register — which is
      // what the reader needs to see: this did not play.
      const attempt = node.play();
      if (attempt && typeof attempt.catch === "function") attempt.catch(() => setFailed(true));
    };

    return (
      <div
        data-slot="video"
        data-state={
          isFailed ? "error" : disabled ? "disabled" : busy ? "loading" : empty ? "empty" : "default"
        }
        aria-busy={busy || undefined}
        style={frameStyle}
        className={cn(imageVariants(), disabled && "text-ink-disabled", className)}
      >
        {!empty && !isFailed ? (
          <video
            ref={setRefs}
            data-slot="video-media"
            src={src}
            poster={poster}
            controls={controls && !disabled}
            playsInline={playsInline}
            preload={preload}
            onWaiting={(event) => {
              setBuffering(true);
              onWaiting?.(event);
            }}
            onPlaying={(event) => {
              setBuffering(false);
              setStarted(true);
              onPlaying?.(event);
            }}
            onPlay={(event) => {
              setStarted(true);
              onPlay?.(event);
            }}
            onPause={(event) => {
              setBuffering(false);
              onPause?.(event);
            }}
            onLoadedData={(event) => {
              setBuffering(false);
              onLoadedData?.(event);
            }}
            onEnded={(event) => {
              setStarted(false);
              onEnded?.(event);
            }}
            onError={(event) => {
              setBuffering(false);
              setFailed(true);
              onError?.(event);
            }}
            className={cn("block size-full object-cover", mediaClassName)}
            {...props}
          >
            {children}
          </video>
        ) : null}

        {drawPlay ? (
          <button
            type="button"
            data-slot="video-play"
            onClick={handlePlayControl}
            aria-label={playLabel}
            className={cn(
              // The standing control height, as a pill, on raised paper.
              "absolute inset-0 m-auto grid size-[var(--control-height-button)]",
              "cursor-pointer place-content-center rounded-pill border-0",
              "bg-[var(--surface-raised)] text-foreground shadow-sm",
              "hover:bg-accent",
              // The kit's press: one hairline down, no scale.
              "active:translate-y-[0.0625rem]",
              "transition-[background-color,color,translate]",
              "duration-[var(--duration-colour)] ease-kwapso",
            )}
          >
            <Play size={20} aria-hidden="true" />
          </button>
        ) : null}

        {busy ? (
          <span
            data-slot="video-loading"
            role="status"
            aria-label={loadingLabel}
            className="absolute inset-0 grid place-content-center"
          >
            <CircleNotch size={20} aria-hidden="true" className="motion-spinner text-ink-tertiary" />
          </span>
        ) : null}

        {isFailed ? (
          <span
            data-slot="video-error"
            role="img"
            aria-label={errorLabel}
            className={cn(
              "absolute inset-0 grid place-content-center justify-items-center gap-2",
              "bg-surface-quiet px-4 text-center",
            )}
          >
            <Warning size={20} aria-hidden="true" className="text-ink-tertiary" />
            <span aria-hidden="true" className="text-caption text-ink-secondary">
              {errorLabel}
            </span>
          </span>
        ) : null}
      </div>
    );
  },
);

Video.displayName = "Video";

export { Video };
