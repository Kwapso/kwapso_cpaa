/* ============================================================================
   WebEmbed — foreign content in a kwapso box (0 direct call sites).

   DESIGN SOURCE
   The kit draws no embed. The frame is the media well it does draw —
   design-mothership/specimens/_fragments/t22.css → `.kw-msg__media`, shared
   with `image` through `imageVariants` so every media box in the system is
   one drawing. The failure and loading registers follow
   kwapso-patterns.css → `.kw-register` (caption body, secondary ink).
   The one thing added on top of the media well is a hairline; the reason is
   written below and logged as GAPS-G.md EMB-2.

   THE LAW THIS FILE OBEYS
   · Media boxes take `--radius` (24). The iframe is clipped to it by the
     frame's `overflow-hidden`, so a page with square corners inside still
     reads as a kwapso box.
   · THE ONE DEPARTURE FROM `image`: this frame carries the `--border`
     hairline. An embed paints content this system does not control, and
     off-beige-on-off-beige has no edge at all. The hairline is the kit's
     neutral rule at its stated token, not an invented stroke, and it is the
     same permission a neutral chip has.
   · The placeholder ground is `--surface-quiet`. Never an opacity.
   · Focus is the one global rule. The iframe and the open control are both
     focusable and both are rung by tokens.css §8.
   · Every string is a prop with a default, including the iframe's `title` —
     which is not decoration: it is the frame's accessible name and the only
     thing a screen reader has to go on.

   THE SANDBOX IS DEFAULTED CLOSED, AND UNTIL 2026-09-02 IT WAS NOT
   An embed is foreign code. The default is `allow-scripts` and NOTHING else —
   no same-origin, no forms, no popups, no top-level navigation, no downloads.

   IT USED TO BE `allow-scripts allow-same-origin`, AND THAT PAIR IS NOT A
   SANDBOX. The HTML standard says so about this exact combination: with both
   tokens set, framed content served from the embedder's own origin can reach
   its own DOM through `window.parent`/`frames`, rewrite its own `sandbox`
   attribute and reload itself out of the sandbox entirely — so the default
   permitted the one thing the paragraph above claimed it prevented. The
   header said "defaulted closed" and the constant said otherwise; the code
   was the wrong half. Dropping `allow-same-origin` puts the frame in an
   opaque origin, which is what actually walls it off from this app's cookies,
   `localStorage` and DOM, and it costs an ordinary third-party embed nothing:
   a video, a map or a form on somebody else's origin was already cross-origin
   and was never reading ours.

   THE ONE LEGITIMATE NEED IS AN OPT-IN PROP, NOT A DEFAULT. A first-party
   embed — our own page, in our own frame, that has to reach its own storage —
   passes `allowSameOrigin`. It is a named boolean rather than a hand-typed
   `sandbox` string on purpose: the dangerous pair is then one greppable word
   at the call site instead of a token buried in a string nobody re-reads, and
   the call site states the trust rather than inheriting it. A call site that
   needs something else again passes its own `sandbox`, which replaces the
   default wholesale.

   THERE IS NO WAY TO REMOVE THE ATTRIBUTE, and the header used to claim
   there was: it said `sandbox={undefined}` dropped it. That was never true —
   `sandbox` is a defaulted parameter, so `undefined` is exactly the value
   that selects the default — and it is not wanted either. An unsandboxed
   frame is not a state "defaulted closed" can have.

   This is a security default, not a design one; logged as GAPS-G.md EMB-3.

   RENDERING CONTEXT
   `"use client"`. Load and failure are state.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { imageVariants } from "../image/image";
import {
  ArrowSquareOut,
  CircleNotch,
  Warning,
} from "../../foundations/icons";

/**
 * Scripts, and nothing else. Stated as a constant so a reader can see what
 * "the default" is without reading the JSX. `allow-same-origin` is
 * deliberately absent — paired with `allow-scripts` it lets framed content
 * remove its own sandbox. See the header.
 */
const DEFAULT_SANDBOX = "allow-scripts";

/**
 * The default plus `allow-same-origin`, for a first-party embed that has said
 * so. Composed from the constant above rather than written out again, so the
 * two can never disagree about what "the default plus one token" is.
 */
const SAME_ORIGIN_SANDBOX = `${DEFAULT_SANDBOX} allow-same-origin`;

export interface WebEmbedProps
  extends Omit<React.ComponentPropsWithoutRef<"iframe">, "className" | "loading"> {
  /**
   * The frame's accessible name. Defaulted so no call site ships an unnamed
   * frame, and a prop so it translates. It is announced, not drawn.
   */
  title?: string;
  /**
   * The box the embed reserves, as a CSS `aspect-ratio`. 16/9 by default, the
   * same box the media skeleton draws. `null` lets the frame size itself,
   * which is what a fixed-height embed in a panel wants.
   */
  ratio?: string | number | null;
  /** Busy. Held automatically until the frame reports it has loaded. */
  loading?: boolean;
  /**
   * Force the failure register. This is the important one for an embed: a
   * cross-origin iframe fires `load` for a 404, a 500 and a refused frame
   * alike, and fires `error` for almost nothing. The browser cannot tell this
   * component that the embed failed, so the call site has to.
   */
  error?: boolean;
  /** Announced while the embed is loading. Translatable. */
  loadingLabel?: string;
  /** Shown and announced when the embed cannot be displayed. Translatable. */
  errorLabel?: string;
  /**
   * Draw a control that opens the embedded URL in a new tab. Off by default:
   * an embed that works does not need an escape hatch, and one that is
   * offered unasked is a second call to action on somebody else's content.
   */
  showOpenLink?: boolean;
  /** The open control's accessible name. Translatable. */
  openLabel?: string;
  /** Defer the load until the box is near the viewport. Default `true`. */
  lazy?: boolean;
  /** Render nothing when there is no `src`. Default `false` — the box holds. */
  hideWhenEmpty?: boolean;
  /**
   * Add `allow-same-origin` to the sandbox. Default `false`, and it must stay
   * the exception: together with the default's `allow-scripts` it lets a
   * SAME-ORIGIN document reach `window.parent`, rewrite its own `sandbox`
   * attribute and reload itself unsandboxed — which is no sandbox at all.
   *
   * Pass it only for a frame whose `src` is ours: our own page, needing its
   * own cookies or `localStorage`. A third-party embed is already
   * cross-origin, so this buys it nothing and gives away the wall.
   *
   * Ignored when the call site passes its own `sandbox`; that string replaces
   * the default wholesale and is the call site's own business.
   */
  allowSameOrigin?: boolean;
  /** Classes for the <iframe> itself. The root's come from `className`. */
  mediaClassName?: string;
  /** Merged onto the frame, last, so a call site always wins. */
  className?: string;
}

/**
 * A sandboxed iframe in a kwapso media box.
 *
 * TEN STATES
 *  1. default        — the embedded page, clipped to the box radius, inside a
 *                      hairline.
 *  2. hover          — on the open control only (`--accent`). The frame has no
 *                      hover of its own: everything inside it belongs to
 *                      somebody else and this component must not imply that
 *                      the box is a target.
 *  3. focus-visible  — NOT here. tokens.css §8 rings the iframe and the open
 *                      control. Neither is given a ring by this file, and the
 *                      iframe is deliberately left keyboard-reachable.
 *  4. active/pressed — the open control takes the kit's 1px nudge. Nothing else
 *                      is pressable.
 *  5. disabled       — does not apply, and must not be faked. There is no such
 *                      thing as a disabled embed: content that may not be shown
 *                      is `error` with a reason, and a greyed frame that still
 *                      loads a third party's page would be a lie about what the
 *                      browser is doing. Logged as GAPS-G.md EMB-4.
 *  6. loading        — spinner on the quiet ground until `load` fires or the
 *                      passed `loading` goes false. `aria-busy` announced.
 *  7. empty          — no `src`: the quiet frame inside its hairline, holding
 *                      its box. `hideWhenEmpty` collapses it instead.
 *  8. error          — the failure register, and the one an application must
 *                      drive itself — see the `error` prop.
 *  9. selected       — does not apply.
 * 10. read-only      — always. This component never writes anything.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED at the frame. `w-full` with the height
 *  from `ratio`. What is inside is a whole other page and this system cannot
 *  make it responsive; where an embed has a minimum usable width the
 *  composition should give it a full-bleed column on a phone, which is the
 *  composition's grid and not this component's business.
 *
 * RTL — safe. The open control sits at the INLINE end (`end-*`), so it moves
 * to the visual start in Arabic, Urdu and Persian without a second rule. The
 * embedded document's own direction is its own affair.
 */
const WebEmbed = React.forwardRef<HTMLIFrameElement, WebEmbedProps>(
  (
    {
      className,
      mediaClassName,
      src,
      title = "Embedded content",
      ratio = "16 / 9",
      loading = false,
      error = false,
      loadingLabel = "Loading…",
      errorLabel = "This content could not be loaded",
      showOpenLink = false,
      openLabel = "Open in a new tab",
      lazy = true,
      hideWhenEmpty = false,
      allowSameOrigin = false,
      /* NOT defaulted in the destructure. The default depends on
         `allowSameOrigin`, and a defaulted parameter cannot see a sibling's
         resolved value without asserting an evaluation order a reader has to
         work out. Resolved on its own line below instead. */
      sandbox,
      referrerPolicy = "strict-origin-when-cross-origin",
      style,
      onLoad,
      ...props
    },
    ref,
  ) => {
    const [loaded, setLoaded] = React.useState(false);

    React.useEffect(() => {
      setLoaded(false);
    }, [src]);

    /* A call site's own `sandbox` wins outright — including an empty string,
       which is the maximally restrictive sandbox and a real thing to ask for,
       so the test is `!== undefined` and never a truthiness check. */
    const frameSandbox =
      sandbox !== undefined
        ? sandbox
        : allowSameOrigin
          ? SAME_ORIGIN_SANDBOX
          : DEFAULT_SANDBOX;

    const empty = src === undefined || src === null || src === "";
    const busy = !error && !empty && (loading || !loaded);

    if (empty && hideWhenEmpty && !error) return null;

    const frameStyle: React.CSSProperties = {
      ...(ratio === null || ratio === undefined ? null : { aspectRatio: String(ratio) }),
      ...style,
    };

    return (
      <div
        data-slot="web-embed"
        data-state={error ? "error" : busy ? "loading" : empty ? "empty" : "default"}
        aria-busy={busy || undefined}
        style={frameStyle}
        /* The frame's edge is same-tone separation, drawn as an inset shadow
           and never a border (review 1A · fix 2). */
        className={cn(imageVariants(), "shadow-[var(--hairline)]", className)}
      >
        {!empty && !error ? (
          <iframe
            ref={ref}
            data-slot="web-embed-frame"
            src={src}
            title={title}
            sandbox={frameSandbox}
            referrerPolicy={referrerPolicy}
            loading={lazy ? "lazy" : "eager"}
            onLoad={(event) => {
              setLoaded(true);
              onLoad?.(event);
            }}
            className={cn("block size-full border-0 bg-transparent", mediaClassName)}
            {...props}
          />
        ) : null}

        {showOpenLink && !empty && !error ? (
          <a
            data-slot="web-embed-open"
            href={src}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={openLabel}
            className={cn(
              // The dense square at the pill radius, on raised paper so it
              // stays legible over whatever the embed happens to paint.
              "absolute end-2 top-2 grid size-[var(--control-height-dense)]",
              "place-content-center rounded-pill",
              "bg-[var(--surface-raised)] text-ink-secondary shadow-sm",
              "hover:bg-accent hover:text-foreground",
              "active:translate-y-[0.0625rem]",
              "transition-[background-color,color,translate]",
              "duration-[var(--duration-colour)] ease-kwapso",
            )}
          >
            <ArrowSquareOut size={16} aria-hidden="true" />
          </a>
        ) : null}

        {busy ? (
          <span
            data-slot="web-embed-loading"
            role="status"
            aria-label={loadingLabel}
            className="absolute inset-0 grid place-content-center bg-surface-quiet"
          >
            <CircleNotch size={20} aria-hidden="true" className="motion-spinner text-ink-tertiary" />
          </span>
        ) : null}

        {error ? (
          <span
            data-slot="web-embed-error"
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

WebEmbed.displayName = "WebEmbed";

export { WebEmbed };
