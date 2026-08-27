/* ============================================================================
   VisibilityProvider · useVisibilityContext · useIsVisible · Visible
   Behaviour only, no design (commission §6).

   DESIGN SOURCE
   None, and that is correct: this primitive draws nothing. `Visible` renders
   a bare wrapper with no class of its own, so whatever is put inside it looks
   exactly as it would have looked without it.

   WHAT IT IS FOR
   "Is this on screen?" — asked once, answered by ONE `IntersectionObserver`
   shared by everything under the provider instead of one observer per
   element. That is what the provider is for: a table of two hundred rows that
   each want to know whether they are visible costs two hundred observers
   without it, and one with it.

   Three things in this system already want the answer: `Image` and `Video`
   deferring a fetch until their box is near the viewport, a long collection
   deciding when to ask for the next page, and any panel that should not run
   an animation while it is scrolled out of sight.

   THIS IS VIEWPORT VISIBILITY, NOT PERMISSION. Nothing here knows or asks
   whether a reader is allowed to see something; a primitive carries no
   product vocabulary and no authorisation. Stated because the export names
   could be read either way. GAPS-G.md VIS-1.

   THE LAW THIS FILE OBEYS
   · SSR-SAFE. No `window`, no `IntersectionObserver` at module scope. On the
     server, and in any runtime without the API, the answer is "visible" —
     content renders, nothing is hidden from a crawler, and nothing throws.
   · IT CLEANS UP. Every element is unobserved when its component unmounts,
     the shared observer is disconnected when the provider unmounts, and
     changing the provider's options rebuilds the observer and re-observes
     everything that was being watched.
   · `useVisibilityContext` returns `null` outside a provider rather than
     throwing. Every consumer here works standalone with a private observer,
     so the provider is an optimisation and never a requirement.

   RENDERING CONTEXT
   `"use client"`. Context, state, effects and a browser API.
   ========================================================================= */

"use client";

import * as React from "react";

/** Whether the runtime can answer the question at all. */
function supported(): boolean {
  return typeof window !== "undefined" && typeof IntersectionObserver !== "undefined";
}

export interface VisibilityContextValue {
  /**
   * Watch an element. Returns the unwatch function — call it on cleanup.
   * Returns `null` when the provider is disabled or the API is missing, which
   * tells the caller to fall back to "always visible" rather than wait
   * forever for a callback that will not come.
   */
  observe: ((element: Element, onChange: (entry: IntersectionObserverEntry) => void) => () => void) | null;
  /** The provider's own options, so a consumer can report what it is using. */
  rootMargin: string;
  threshold: number | number[];
}

const VisibilityContext = React.createContext<VisibilityContextValue | null>(null);

export interface VisibilityProviderProps {
  /**
   * The scroll box to measure against. `null` (the default) means the
   * viewport. Pass a ref's current element to watch inside a scrolling panel.
   */
  root?: Element | Document | null;
  /**
   * How far outside the root still counts as visible. The default reaches
   * ahead by a comfortable screen fraction so a deferred image has time to
   * arrive before it is scrolled to. A CSS margin string.
   */
  rootMargin?: string;
  /** How much of the element must be inside. Default `0` — any part of it. */
  threshold?: number | number[];
  /**
   * Turn the whole mechanism off. Everything under the provider reports
   * visible, immediately and permanently. For print, for tests, and for a
   * reader who has asked for no lazy behaviour.
   */
  disabled?: boolean;
  children?: React.ReactNode;
}

/**
 * One shared `IntersectionObserver` for everything beneath it.
 *
 * TEN STATES — none of them apply, and that is the point: this component
 * renders no element of its own. It is context and an observer. Its children
 * carry every state they had before it was wrapped around them.
 */
function VisibilityProvider({
  root = null,
  rootMargin = "25% 0%",
  threshold = 0,
  disabled = false,
  children,
}: VisibilityProviderProps) {
  const targets = React.useRef(new Map<Element, (entry: IntersectionObserverEntry) => void>());
  const observerRef = React.useRef<IntersectionObserver | null>(null);

  // An array threshold is a new identity on every render; comparing its
  // contents is what stops the observer being rebuilt sixty times a second.
  const thresholdKey = Array.isArray(threshold) ? threshold.join(",") : String(threshold);

  React.useEffect(() => {
    if (disabled || !supported()) {
      observerRef.current = null;
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          targets.current.get(entry.target)?.(entry);
        });
      },
      { root: root ?? null, rootMargin, threshold },
    );
    observerRef.current = observer;

    // Anything registered before this effect ran, or before the options
    // changed, is picked up here — which is what makes a rebuild seamless.
    targets.current.forEach((_, element) => observer.observe(element));

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
    // `threshold` is compared through `thresholdKey`; see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, root, rootMargin, thresholdKey]);

  const value = React.useMemo<VisibilityContextValue>(() => {
    if (disabled || !supported()) {
      return { observe: null, rootMargin, threshold };
    }
    return {
      observe: (element, onChange) => {
        targets.current.set(element, onChange);
        observerRef.current?.observe(element);
        return () => {
          targets.current.delete(element);
          observerRef.current?.unobserve(element);
        };
      },
      rootMargin,
      threshold,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, rootMargin, thresholdKey]);

  return <VisibilityContext.Provider value={value}>{children}</VisibilityContext.Provider>;
}

VisibilityProvider.displayName = "VisibilityProvider";

/**
 * The nearest provider, or `null`. Never throws: every consumer in this file
 * falls back to a private observer, so a provider is an optimisation.
 */
function useVisibilityContext(): VisibilityContextValue | null {
  return React.useContext(VisibilityContext);
}

export interface UseIsVisibleOptions {
  /**
   * Stop watching once it has been seen, and stay visible. Default `true` —
   * the common case is "load this when it is reached", and something that
   * flickers back to not-loaded when scrolled past is a bug, not a feature.
   */
  once?: boolean;
  /** What to report before the first answer arrives. Default `false`. */
  initialVisible?: boolean;
  /** Report visible always, without observing. */
  disabled?: boolean;
  /** Per-element overrides. Given, they build a private observer. */
  root?: Element | Document | null;
  rootMargin?: string;
  threshold?: number | number[];
}

export interface UseIsVisibleResult<T extends Element> {
  /** Attach to the element being watched. */
  ref: (node: T | null) => void;
  /** Is it in view? */
  visible: boolean;
  /** The last entry, for ratios and bounding boxes. `null` until one arrives. */
  entry: IntersectionObserverEntry | null;
}

/**
 * Is this element on screen?
 *
 * ```tsx
 * const { ref, visible } = useIsVisible<HTMLDivElement>();
 * <div ref={ref}>{visible ? <Chart /> : null}</div>
 * ```
 *
 * Uses the nearest `VisibilityProvider`'s shared observer when there is one
 * and no per-element option is given; builds a private one otherwise. In a
 * runtime with no `IntersectionObserver` — a server render, an old browser —
 * it reports visible, so content is never withheld by a missing API.
 */
function useIsVisible<T extends Element = Element>(
  options: UseIsVisibleOptions = {},
): UseIsVisibleResult<T> {
  const {
    once = true,
    initialVisible = false,
    disabled = false,
    root,
    rootMargin,
    threshold,
  } = options;

  const context = useVisibilityContext();
  const [node, setNode] = React.useState<T | null>(null);
  const [visible, setVisible] = React.useState(initialVisible);
  const [entry, setEntry] = React.useState<IntersectionObserverEntry | null>(null);
  const seenRef = React.useRef(false);

  const ref = React.useCallback((next: T | null) => {
    setNode(next);
  }, []);

  const usePrivate = root !== undefined || rootMargin !== undefined || threshold !== undefined;
  const thresholdKey = Array.isArray(threshold) ? threshold.join(",") : String(threshold);

  React.useEffect(() => {
    if (disabled || !supported()) {
      setVisible(true);
      return;
    }
    if (!node) return;
    if (once && seenRef.current) return;

    const handle = (next: IntersectionObserverEntry) => {
      setEntry(next);
      if (next.isIntersecting) {
        seenRef.current = true;
        setVisible(true);
      } else if (!once) {
        setVisible(false);
      }
    };

    if (!usePrivate && context?.observe) {
      return context.observe(node, handle);
    }

    const observer = new IntersectionObserver(
      (entries) => entries.forEach(handle),
      {
        root: root ?? null,
        rootMargin: rootMargin ?? "25% 0%",
        threshold: threshold ?? 0,
      },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // `threshold` is compared through `thresholdKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, disabled, once, usePrivate, context, root, rootMargin, thresholdKey]);

  return { ref, visible, entry };
}

export interface VisibleProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "children">,
    UseIsVisibleOptions {
  /**
   * Rendered once the wrapper is on screen. A function receives the answer,
   * for the case where something should render either way and only change.
   */
  children?: React.ReactNode | ((visible: boolean) => React.ReactNode);
  /**
   * Rendered while it is not. `null` by default — prefer nothing. Pass a
   * `Skeleton` where the box must hold its height, which is the usual reason
   * a deferred region reflows the page on arrival.
   */
  fallback?: React.ReactNode;
}

/**
 * Render children only once this box is on screen.
 *
 * The wrapper `<div>` carries no styling of its own and exists solely to be
 * the observed element — there has to be something in the document to
 * measure, and measuring the children would mean they had already rendered.
 * Give it a `className` and it lays out however the composition needs.
 *
 * TEN STATES
 *  1. default        — children, once seen.
 *  2. hover          — does not apply. This component draws nothing and is not
 *                      a target; children keep every state they had.
 *  3. focus-visible  — does not apply, and deliberately: the wrapper is never
 *                      focusable. Tabbing to a control inside a not-yet-shown
 *                      region is impossible because the control is not there —
 *                      which is why `once` defaults to true and a region never
 *                      un-renders once it has been reached.
 *  4. active/pressed — does not apply.
 *  5. disabled       — `disabled`: report visible and never observe.
 *  6. loading        — `fallback` is the waiting register, and the call site
 *                      chooses it. This component has nothing of its own to
 *                      fetch.
 *  7. empty          — no children: the wrapper renders empty. It is not
 *                      removed, because the box may be holding layout.
 *  8. error          — does not apply. There is no request to fail.
 *  9. selected       — does not apply.
 * 10. read-only      — always.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The wrapper has no width, no height
 *  and no display of its own; it is whatever the composition's grid makes it at
 *  each width. The observer's `rootMargin` is a percentage, so the reach-ahead
 *  distance scales with the viewport rather than being a phone-sized margin on
 *  a desktop.
 *
 * RTL — safe. Nothing here is positioned, and `IntersectionObserver` measures
 * a box, not a direction.
 */
const Visible = React.forwardRef<HTMLDivElement, VisibleProps>(
  (
    {
      children,
      fallback = null,
      once = true,
      initialVisible = false,
      disabled = false,
      root,
      rootMargin,
      threshold,
      ...props
    },
    forwardedRef,
  ) => {
    const { ref, visible } = useIsVisible<HTMLDivElement>({
      once,
      initialVisible,
      disabled,
      root,
      rootMargin,
      threshold,
    });

    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        ref(node);
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) {
          (forwardedRef as { current: HTMLDivElement | null }).current = node;
        }
      },
      [ref, forwardedRef],
    );

    return (
      <div ref={setRefs} data-slot="visible" data-visible={visible ? "" : undefined} {...props}>
        {typeof children === "function" ? children(visible) : visible ? children : fallback}
      </div>
    );
  },
);

Visible.displayName = "Visible";

export { VisibilityProvider, useVisibilityContext, useIsVisible, Visible };
