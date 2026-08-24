/* ============================================================================
   Avatar — the person mark (45 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/_fragments/t11.css → `.kw-avatar` and its three
   sizes, and `.kw-mark`, the square twin. The fragment's own header states
   the ruling both are drawn from:

       "Avatars — pill for a person (ruling 30), 24 / 32 / 48, flex none.
        Initials step down with the size: micro / badge / body-s."
       "Record marks — square for a thing (ruling 30), same three sizes,
        flex none. Two characters or a module icon, never three, never a
        photograph. Radius: --radius-select (6)."

   THE LAW THIS FILE OBEYS
   · Ruling 30: SQUARE FOR A THING, PILL FOR A PERSON, at 24 / 32 / 48
     (`--avatar-sm` / `--avatar-md` / `--avatar-lg`), and `flex: none` at
     every size so a mark never squeezes inside a tight row.
   · TWO initials, never three. A string fallback is cut to two characters by
     this component rather than by the call site, because 45 call sites cannot
     each be trusted to remember. A node fallback (a module icon) passes
     through untouched, which is the kit's other stated option.
   · The kit's mark holds no photograph at all. `AvatarImage` exists because
     the commission requires it and 45 call sites already pass one; the
     CONTRADICTION is logged as GAPS-F AVA-1 rather than resolved silently.
   · Charcoal on every accent. `variant="brand"` is mango with charcoal ink,
     and the kit rules ONE mango mark per view — it is opt-in, never default.
   · Focus is ONE global rule (tokens.css §8). An avatar is not focusable; a
     link around one is, and it takes the ring at its own radius.

   RENDERING CONTEXT
   `"use client"`. The image's load state is real state: the fallback has to
   know whether the photograph arrived, and `AvatarFallback` honours a
   `delayMs` timer. Radix's `@radix-ui/react-avatar` is not a dependency of
   this repository, so the small state machine is local — see GAPS-F AVA-2.
   ========================================================================= */

"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

/* ----------------------------------------------------------------------------
   The load state machine, shared between the three parts exactly as Radix
   shares it: the image reports, the fallback listens.

   `idle` is the state when no `AvatarImage` has mounted at all, which is the
   common case at these call sites — an initials-only mark. It shows the
   fallback immediately, with no delay, because there is nothing to wait for.
   ------------------------------------------------------------------------- */
type LoadStatus = "idle" | "loading" | "loaded" | "error";

interface AvatarContextValue {
  status: LoadStatus;
  setStatus: (status: LoadStatus) => void;
}

const AvatarContext = React.createContext<AvatarContextValue | null>(null);

function useAvatarContext(part: string): AvatarContextValue {
  const context = React.useContext(AvatarContext);
  if (!context) {
    throw new Error(`<${part}> must be rendered inside an <Avatar>.`);
  }
  return context;
}

const avatarVariants = cva(
  [
    // `position: relative` so a presence dot or a stack ring can be hung on
    // it by a composition without that composition re-declaring the box.
    "relative inline-grid place-content-center",
    // `flex: none` — ruling 30, stated for both the mark and the avatar.
    "shrink-0 grow-0",
    // A mark is never selected as text, and the photograph is clipped to the
    // mark's own shape.
    "select-none overflow-hidden",
    // Saans Medium. The kit's initials are always the heavier of the two
    // weights the family ships.
    "font-[var(--font-weight-medium)] leading-none uppercase",
  ],
  {
    variants: {
      /**
       * Ruling 30, as one prop. The kit's own two words, so nothing is
       * coined: a PILL is a person, a SQUARE is a thing (a record mark).
       */
      shape: {
        pill: "rounded-pill",
        square: "rounded-[var(--radius-select)]",
      },
      size: {
        /** 24 · `--avatar-sm`, initials at the micro step. */
        sm: "size-[var(--avatar-sm)] text-micro",
        /** 32 · `--avatar-md`, initials at the badge step. The kit's default. */
        md: "size-[var(--avatar-md)] text-badge",
        /**
         * 48 · `--avatar-lg`. The kit says "body-s" here, a name this token
         * set does not carry; 14 is `text-sm`, the step the kit's body-s
         * holds. Mapping logged as GAPS-F AVA-3.
         */
        lg: "size-[var(--avatar-lg)] text-sm",
      },
      variant: {
        /** `.kw-avatar` — raised paper, normal ink. */
        default: "bg-card text-foreground",
        /** `.kw-avatar--inverse` — charcoal fill, off-beige ink. */
        inverse: "bg-surface-inverse text-ink-on-inverse",
        /**
         * `.kw-avatar--mango` / `.kw-mark--mango` — the brand fill with
         * CHARCOAL ink. The kit's own comment on the square twin is "One mark
         * per view may take the mango fill", so this is opt-in and never the
         * default. Never a status.
         */
        brand: "bg-surface-brand text-ink-on-accent",
        /**
         * The overflow chip at the end of a stack: `.kw-avatarstack__more`,
         * the hairline used as a fill. Added, not required; without it a
         * stack's "+3" would hand-roll a colour.
         */
        quiet: "bg-border text-ink-secondary",
      },
    },
    defaultVariants: { shape: "pill", size: "md", variant: "default" },
  },
);

export interface AvatarProps
  extends React.ComponentPropsWithoutRef<"span">,
    VariantProps<typeof avatarVariants> {}

/**
 * A person's mark, or — with `shape="square"` — a thing's.
 *
 * TEN STATES
 *  1. default        — variant fill, initials or a photograph, at the size.
 *  2. hover          — does not apply. A mark is a label. Where one sits in a
 *                      hoverable row the ROW carries `--accent`, and where it
 *                      is itself a link the link carries the hover; a mark
 *                      that lit up on its own would make every list twinkle.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every focusable thing at
 *                      once, and an avatar is not focusable in the first
 *                      place.
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply. A person is not disabled. An inactive
 *                      record's mark takes `variant="quiet"`, which is a
 *                      meaning rather than a state.
 *  6. loading        — the PHOTOGRAPH's loading is a real state and it is
 *                      handled: while the image is in flight the fallback
 *                      holds the box, so nothing reflows when it lands and
 *                      nothing flashes empty. `AvatarFallback delayMs` exists
 *                      for the opposite case — suppressing the initials on a
 *                      fast connection.
 *  7. empty          — no image and no fallback children renders the bare
 *                      coloured box at the right size. Deliberately NOT
 *                      `null`: a missing mark in a list of rows shifts every
 *                      line beside it, and the box IS the information that
 *                      someone is there. This is the one place the system
 *                      does not prefer nothing.
 *  8. error          — an image that fails to load falls back to the initials
 *                      silently and permanently. That is the whole error
 *                      story; a broken-image glyph is never shown.
 *  9. selected       — does not apply. The kit draws no selected mark. A
 *                      selected ROW is the table's or the list's business.
 * 10. read-only      — always. A mark holds no value.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED, and this one is load-bearing rather
 *  than lazy. Ruling 30 states three sizes and states them absolutely, and a
 *  mark's size is what encodes WHAT IT IS: 24 in a dense row, 32 in a list,
 *  48 on a record header. If 48 shrank to 32 on a phone it would start
 *  meaning "list item" at that width. The row around it restacks; the mark
 *  does not. `flex: none` is what makes that survive a narrow viewport.
 *
 * RTL — safe. The box is square, the initials centre, and nothing is
 * positioned by side. A stack's overlap is the composition's, and it must use
 * `-ms-*` when it builds one (the kit's own `margin-left: -10` is physical
 * and is logged as GAPS-F AVA-4).
 */
const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  (
    { className, shape = "pill", size = "md", variant = "default", children, ...props },
    ref,
  ) => {
    const [status, setStatus] = React.useState<LoadStatus>("idle");
    const value = React.useMemo(() => ({ status, setStatus }), [status]);

    return (
      <AvatarContext.Provider value={value}>
        <span
          ref={ref}
          data-slot="avatar"
          data-shape={shape ?? "pill"}
          data-size={size ?? "md"}
          className={cn(avatarVariants({ shape, size, variant }), className)}
          {...props}
        >
          {children}
        </span>
      </AvatarContext.Provider>
    );
  },
);

Avatar.displayName = "Avatar";

export interface AvatarImageProps extends React.ComponentPropsWithoutRef<"img"> {
  /** Fires as the load state settles, mirroring the Radix API this replaces. */
  onLoadingStatusChange?: (status: LoadStatus) => void;
}

/**
 * The photograph. Unmounts itself when the source fails, so the fallback is
 * the only thing left rather than sitting behind a broken image.
 *
 * `alt` is not defaulted and not invented: a mark that repeats the name
 * beside it is noise to a screen reader, so the honest default is the empty
 * string the call site passes, and the call site is the only place that knows
 * whether the name is already in the row. PATTERN §7 — the best default is no
 * string.
 *
 * TEN STATES — see `Avatar`; the image owns loading and error and nothing
 * else.
 * THREE BREAKPOINTS — UNCHANGED. It fills the mark at every width.
 * RTL — safe. `object-cover` has no direction.
 */
const AvatarImage = React.forwardRef<HTMLImageElement, AvatarImageProps>(
  ({ className, onLoad, onError, onLoadingStatusChange, src, ...props }, ref) => {
    const { status, setStatus } = useAvatarContext("AvatarImage");

    /* The callback is held in a ref rather than listed as a dependency. A
       call site that passes an inline arrow gets a new identity every render,
       and an effect that re-ran on that would push a loaded image back to
       "loading" on any parent re-render — the initials would flash back over
       a picture that is already on screen. */
    const notify = React.useRef(onLoadingStatusChange);
    React.useEffect(() => {
      notify.current = onLoadingStatusChange;
    });

    /* Report "loading" as soon as a source is known, and treat a missing
       source as a failure rather than as a permanent wait — an <img> with no
       src fires neither load nor error. */
    React.useEffect(() => {
      const next: LoadStatus = src ? "loading" : "error";
      setStatus(next);
      notify.current?.(next);
    }, [src, setStatus]);

    if (status === "error") return null;

    return (
      <img
        ref={ref}
        data-slot="avatar-image"
        src={src}
        className={cn("size-full object-cover", className)}
        onLoad={(event) => {
          setStatus("loaded");
          notify.current?.("loaded");
          onLoad?.(event);
        }}
        onError={(event) => {
          setStatus("error");
          notify.current?.("error");
          onError?.(event);
        }}
        {...props}
      />
    );
  },
);

AvatarImage.displayName = "AvatarImage";

/**
 * Two initials, never three.
 *
 * A string child is cut to its first two characters here rather than at the
 * call site. `Array.from` is used instead of `slice`, so a two-character
 * name in a script outside the basic plane is not sliced through the middle
 * of a code point — the apps run in Arabic, Urdu and Persian.
 *
 * A non-string child (the kit's other stated option, a module icon) passes
 * through untouched.
 */
function twoInitials(children: React.ReactNode): React.ReactNode {
  if (typeof children !== "string") return children;
  return Array.from(children.trim()).slice(0, 2).join("");
}

export interface AvatarFallbackProps extends React.ComponentPropsWithoutRef<"span"> {
  /**
   * Hold the fallback back for this many milliseconds, so a photograph that
   * arrives quickly never shows initials first. Undefined shows it at once,
   * which is right for the common case here: most of the 45 call sites are
   * initials-only and have no image to wait for.
   */
  delayMs?: number;
}

/**
 * The initials under the photograph.
 *
 * TEN STATES — see `Avatar`. The fallback itself is either shown or not.
 * THREE BREAKPOINTS — UNCHANGED; the step comes from the mark's size.
 * RTL — safe. Centred, no inset, no direction.
 */
const AvatarFallback = React.forwardRef<HTMLSpanElement, AvatarFallbackProps>(
  ({ className, delayMs, children, ...props }, ref) => {
    const { status } = useAvatarContext("AvatarFallback");
    const [delayPassed, setDelayPassed] = React.useState(delayMs === undefined);

    React.useEffect(() => {
      if (delayMs === undefined) {
        setDelayPassed(true);
        return;
      }
      setDelayPassed(false);
      const timer = window.setTimeout(() => setDelayPassed(true), delayMs);
      return () => window.clearTimeout(timer);
    }, [delayMs]);

    if (status === "loaded" || !delayPassed) return null;

    return (
      <span
        ref={ref}
        data-slot="avatar-fallback"
        /* The photograph, when there is one, sits on top: the fallback holds
           the box underneath so nothing reflows as the image swaps in. */
        className={cn("absolute inset-0 grid place-content-center", className)}
        {...props}
      >
        {twoInitials(children)}
      </span>
    );
  },
);

AvatarFallback.displayName = "AvatarFallback";

export { Avatar, AvatarImage, AvatarFallback, avatarVariants };
