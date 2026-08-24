/* ============================================================================
   ScreenShell — the four levels every screen in both doors sits on.

   WHY THIS FILE EXISTS AT ALL, AND WHY IT IS A SHAPE

   The client, 2026-08-23, on what the build kept getting wrong: "where I see
   you miss a lot is in the things that have a container and the ones that lay
   in the background directly."

   REBUILT 2026-08-24, ON A CLIENT RULING AND ON THE ARTIFACT'S OWN SCREENS.
   The ladder this file drew until today put the header band on SOFT PAPER,
   inside a soft-paper screen card. The client, verbatim, twice, looking at
   the running build:

       "the header section, the title, is also in white like the background!
        see screenshot / both in main screen and detail screen"
       "in this screenshot client and accounts must be with white background!!"

   "CLIENTS" is the eyebrow and "Accounts" is the title — the HEADER BAND.
   And the artifact's own assembled screens agree about everything except
   that one band. Read off chapter 27, from the inline `background:`
   declarations, on all sixty screen frames:

     · THE SCREEN FRAME IS OFF-BEIGE. `background: var(--page)` — #FFFEF9 —
       on 60 of 60 frames in the chapter. Not one is soft paper. The build had
       it soft paper, and that was the error under all the others.
     · THE RAIL IS A CONTAINER AND IT IS SOFT PAPER. `background: var(--sheet)`
       on 28 of 28 rails (22 expanded at 208, 6 collapsed at 56). The build
       painted nothing here and got away with it only because the card behind
       it happened to be soft paper.
     · THE BODY REGION PAINTS NOTHING. It is a padded div; the frame's own
       off-beige shows through. There is no rounded top-left corner on it
       anywhere in the artifact — grep finds zero.
     · THE PANEL IS SOFT PAPER, `var(--sheet)` at radius 24, and cards in it
       are `var(--card)` off-beige.
     · 26.02 states the whole thing in one sentence: "the page stays
       off-beige, cards stay soft paper."
     · THE ONE DISAGREEMENT: the artifact draws the header band
       `background: var(--sheet)` on 23 of 23 screens. THE CLIENT RULING BEATS
       IT. The band is off-beige, and it is the only place this file departs
       from the chapter.

       off-beige PAGE                    #FFFEF9   the ground
       └─ off-beige SCREEN               #FFFEF9   the same tone; a box, not a step
          ├─ RAIL         IS a container           the spine — soft paper by
          │                                        default, ink or mango by
          │                                        setting. Full height, flush,
          │                                        square.
          ├─ header band  NOT a container          off-beige · CLIENT RULING
          └─ body         NOT a container          off-beige
             └─ soft-paper PANEL         #F7F2EB   the collection / the record body
                └─ off-beige CARDS                 rows, tiles, figures in cards

   SO THERE ARE TWO PAPERS, NOT FOUR LEVELS: the ground (off-beige) and the
   paper on it (the rail, and the panel). Everything between them is the
   ground. A card inside a panel comes back to off-beige, and a filled control
   on any off-beige level goes to soft paper — which is ruling 01, unchanged,
   just now applied at one level instead of two.

   It is a SHAPE and not a collection, a primitive or a per-route div, for
   three reasons and each one on its own would be enough:

     1. BOTH SCREENS SHARE IT, UNCHANGED. `SHELL.md`: "The shell above is
        identical on both. The rail never changes between them." A main screen
        and a detail screen differ in exactly three places and none of them is
        here. A thing two screens share and neither owns is the definition of
        a shape — section 9's "needs designing once and applies many times".
     2. IT ARRANGES, IT DOES NOT DRAW. A shape composes; the only classes it
        writes are layout for its own wrapper and the paper tone of each
        level, which IS the arrangement here. It draws no control, no rail
        content and no header content: all three arrive as nodes.
     3. PUTTING IT IN A ROUTE WOULD DUPLICATE IT ~40 TIMES. The instruction
        was explicit — do not duplicate the body pane into every route. There
        is exactly one place the four levels are written down, and this is it.

   WHAT IT DELIBERATELY DOES NOT DO
   · It does not draw the rail's CONTENTS. The rail's contents are the
     application's nav (`rail` is a node). The shell owns the rail's
     PLACEMENT, its width, ITS SPINE FILL — the column is what has to be
     painted full-height and flush, and a component sitting inside the
     column's own padding cannot do that — and the one thing about it that is
     design law: it is dropped entirely below the narrow breakpoint, because
     the kit draws no hamburger anywhere.

     AMENDED 2026-08-24, AND THE AMENDMENT IS A DEFAULT AND NOT A REDEFINITION.
     That sentence stayed true for a day and cost forty screens their
     navigation: nothing in `components/` or `compositions/` drew a rail, and
     all 44 files that reach this shell thread `rail` through from a prop
     nobody supplied. So `rail` now DEFAULTS to `<Rail />` — shape 0c, the
     kit's own placeholder register — and the shell still draws no navigation
     of its own: it places a node, and when nobody hands it one it places the
     kit's specimen instead of nothing.

     WHY THE DEFAULT IS HERE AND NOT IN THE 29 ROUTES. Every route already
     passes `rail={rail}` straight through, so one default reaches all of them
     with no route able to forget; twenty-nine defaults would be twenty-nine
     chances to drift, and the four routes that must have NO rail — both
     logins, the system's onboarding and the portal's root — do not render
     this shell at all (they keep their own, and each says so in its header).
     `rail={null}` is the opt-out and nothing in the repo needs it today.
   · It does not draw the header band's contents. `MainScreen` and
     `DetailScreen` each build their own — that is one of the three places
     they differ.
   · It does not draw a footer. A footer belongs to a detail screen's record
     and lives inside the body pane, in normal flow (`SHELL.md`: "in normal
     flow, once per record"). It is not a level of the shell.

   THE PAPER LAW, AND WHERE IT IS ENFORCED
   26.04, verbatim: "The page itself is off-beige and every panel on it is
   soft paper: never the other way round."

   The screen re-resolves `--btn-secondary-fill` and `--pill-fill` to SOFT
   PAPER, which is ruling 01 ("a filled paper button in the other tone, so a
   band and its buttons are never the same tone"). The band is off-beige now,
   so its Export pill has to be soft paper or it is a 1.000 against the band
   it stands on — which is exactly the failure the client's ruling would
   otherwise have caused, and it is the whole of what changed here. The panel
   flips them back on its own; neither call site has to know which.

   The rail column is a paper of its own and re-resolves them again, to the
   paper one rung off ITS ground — `--spine-chip-fill` — so the member chip
   at the foot reads on all three spines without the rail naming a colour.

   NARROW — the kit's own rule, not a guess
   `SHELL.md`: "Drops the rail entirely — no hamburger is drawn anywhere in
   the kit. Drops controls, never counts." The rail column is absent below
   `md`, not collapsed and not behind a button. Nothing else about the shell
   changes: the ground, the band and the body are all still drawn, because
   the paper law has to hold at 380 as well as at 1440. AND THE NARROW
   SPECIMENS NOW AGREE WITH IT — 27.22/23/24 draw the phone with the content
   directly on the frame's own off-beige and no second surface under it,
   which is what this file draws once the body stops painting. The deviation
   this header used to record is gone with the level that caused it.

   NO RADIUS, NO INSET, AND THAT IS THE CLIENT'S SCREENSHOTS
   The artifact wraps every assembled screen in `border-radius: 24px;
   overflow: hidden; box-shadow: var(--sh2)` because a screen in that document
   is a specimen sitting on a page of prose. In the product it is the window.
   26.02's own page-width note says so: "the real product's content area is
   fluid, not centered: sidebar fixed width, everything else — header,
   toolbar, body — stretches to fill the remaining browser width." And the
   client's spine screenshots show the fill "running the full height of the
   viewport, flush to the leading edge, square at the outer corners" — which
   a 24px `overflow: hidden` would round off. So the shell fills its box: no
   page padding, no screen radius, no clip.

   RENDERING CONTEXT
   No `"use client"`. This module holds no state, calls no hook and creates no
   handler during its own render — it places nodes.
   ========================================================================= */

import * as React from "react";

import { cn } from "../../lib/utils";
import { Rail } from "./rail";
import type { ScreenDensity } from "../states/states";

/**
 * The rail's fixed measure. The kit states it in words — "Fixed 208px,
 * collapsible to an icon rail" (26.02) — and 208 is 13rem against the 16px
 * reference every measurement in this system is authored against (ruling 28).
 *
 * Exported because an application that draws its own rail content needs to
 * know the column it is being drawn into, and reading it off the class string
 * is not an interface.
 */
export const RAIL_WIDTH = "13rem";

/**
 * The three spines 26.02 offers in Settings · Appearance, and the client's
 * D3 ruling keeps all three. "Three spines, no fourth."
 */
export type ScreenSpine = "ink" | "paper" | "mango";

/* THE BREAKPOINT IS WRITTEN OUT AS A LITERAL EVERY TIME, and that is not
   verbosity. Tailwind scans SOURCE TEXT: a class assembled at runtime from a
   `const WIDE = "md"` is never seen by the compiler and never emitted, so the
   rail silently stayed hidden at 1440 the first time this file was built. The
   same trap had just cost the whole repository 69 classes — `demo.css` was
   missing `@source "../compositions/**"`, so every class used only in a
   composition was compiled away — and this is the second face of it. Every
   variant below is a literal `md:` in the file. */

export interface ScreenShellProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "children" | "title"> {
  /**
   * The navigation rail's CONTENTS. The column they sit in IS a container and
   * IS painted — the spine — and this shell paints it, because the fill has
   * to run the column's full height and reach its edges.
   *
   * Dropped entirely below the narrow breakpoint. Pass it anyway: the shell
   * decides, not the call site, so no route can ship a hamburger.
   *
   * DEFAULTS TO `<Rail />` — the kit's own placeholder register — so a screen
   * that passes nothing still has navigation in it. `null` draws none, which
   * is the only way to get a shell with no rail and is what a screen outside
   * the navbar would pass if it used this shell (none does).
   */
  rail?: React.ReactNode;
  /** Accessible name for the rail's column. */
  railLabel?: string;

  /**
   * THE SPINE — 26.02's per-member Settings · Appearance choice, and CLIENT
   * RULING D3 ("d3 offer teh threee!").
   *
   * `ink` charcoal · `paper` soft paper · `mango` the brand fill. It is
   * stamped as `data-spine` on the screen root and every value it moves is a
   * token in tokens.css §7b, which is 26.02's own instruction: "the rail's
   * fills must be tokens, not literals, so a switch re-paints without
   * touching markup." Nothing else on the screen changes with it — the same
   * sentence says "the page stays off-beige, cards stay soft paper."
   *
   * DEFAULT `mango`, ON A CLIENT RULING OF 2026-08-24, verbatim: "the define
   * spine by default is the one with the mango sidebar". This overrides both
   * 26.02's captions (which call ink "the staff default" and paper "the
   * portal default") and the artifact's own 28 assembled rails, every one of
   * which is `var(--sheet)`. A client ruling beats the artifact.
   *
   * ONE THING FOLLOWS AUTOMATICALLY AND IT IS THE ONE 26.02 NAMES: on the
   * mango spine the lit row inverts to charcoal, so the rail stops spending
   * a mango. See `ambient` for the other one.
   */
  spine?: ScreenSpine;

  /**
   * A decorative field laid ON the screen card, under the rail and the header
   * band. A NODE, not a flag, for two reasons: the shell arranges and does not
   * draw, and ruling 05/06 scopes the mango field to exactly three screens —
   * auth, splash and the portal's landing screen — so the scoping stays at the
   * three call sites that are allowed it rather than becoming a boolean every
   * screen in the system can reach for.
   *
   * IT IS ON THE SCREEN AND NOT ON THE PAGE, AND THAT IS A JUDGEMENT.
   * The body is opaque, so a field behind it is a field nobody sees; the
   * screen is the level the rail and the header band are laid out on, and it
   * is the only level where a flourish still reads. Recorded here because the
   * portal's landing screen drew this field across a whole screen before the
   * levels existed.
   *
   * IT IS DROPPED ON THE MANGO SPINE, AND THAT IS 26.02'S OWN SENTENCE.
   * The mango spine card, verbatim: "Full brand spine. ONE PER WORKSPACE,
   * NEVER COMBINED WITH A MANGO HEADER." Since 2026-08-24 the mango spine is
   * the DEFAULT, so that sentence stopped being a caution about an exotic
   * setting and became a live rule — and it has exactly one live case in this
   * repo: `PortalHome` passes `<AmbientBackground variant="brand" />` (ruling
   * 05/06 scopes the mango field to auth, splash and portal home; auth and
   * splash render no shell, so portal home is the only one that reaches
   * here). A mango field laid across the screen the rail and the header band
   * sit on, on a workspace whose rail is already mango, is precisely two
   * mango chrome regions at once.
   *
   * THE SPINE WINS AND THE FIELD YIELDS, because "one per workspace" makes
   * the spine the workspace-level statement and the field a per-screen
   * flourish. Enforced HERE rather than in the route, for the same reason the
   * narrow rail is: one place decides, and no route can forget. The screen
   * publishes `data-ambient="suppressed"` so the drop is observable rather
   * than mysterious, and passing a NON-brand ambient node is unaffected —
   * only the mango spine suppresses, and only because the field is mango.
   */
  ambient?: React.ReactNode;

  /**
   * The header band — eyebrow, title, and the screen's actions. Lies ON the
   * screen's OFF-BEIGE and is NOT a container: it paints no fill, takes no
   * radius and carries no rule. CLIENT RULING, 2026-08-24: "in this
   * screenshot client and accounts must be with white background!!" — this is
   * the one place the build departs from chapter 27, which draws the band
   * `var(--sheet)` on all 23 of its assembled screens.
   *
   * `MainScreen` and `DetailScreen` build their own; this slot only places it.
   */
  header?: React.ReactNode;

  /** Everything below the header band. Goes in the body, on the off-beige. */
  children?: React.ReactNode;

  /**
   * The two-door measure (commission §9). The system door is the wide one,
   * the portal the narrow calm one; it changes the air the shell spends, not
   * its structure.
   */
  density?: ScreenDensity;

  /**
   * Whether the PAGE level is drawn. `false` renders the screen alone, for a
   * document that already paints its own off-beige ground — a demo stage, a
   * specimen page, an application that owns `<body>`.
   *
   * The default is `true` and it is the honest one: the page is the ground,
   * and a shell that assumed somebody else had painted it was how the whole
   * ladder went wrong in the first place.
   */
  page?: boolean;
}

/* ----------------------------------------------------------------------------
   THE PAGE — off-beige, the ground.

   NO PADDING. It had `p-5 / lg:p-7` while the screen was a soft-paper card
   sitting on a sheet; the card is off-beige now, so the padding was a band of
   off-beige around a box of off-beige — invisible air that pushed the spine
   off the leading edge, which is the one thing the client's screenshots pin
   down. It stays as a LEVEL because it is the tone `<body>` has to be and
   because `page={false}` has to mean something, but it draws no inset.
   -------------------------------------------------------------------------- */
const PAGE = cn("min-h-full w-full bg-surface-page text-foreground");

/* ----------------------------------------------------------------------------
   THE SCREEN — off-beige, the same tone as the page. A BOX, NOT A STEP.

   `background: var(--page)` on 60 of 60 assembled screens in chapter 27. It
   is a level of the STRUCTURE (it is what the rail and the content column are
   laid out inside) and not a level of the PAPER LADDER, and saying so plainly
   is better than keeping a fourth paper nobody can measure.

   No radius and no `overflow-hidden`: nothing inside it needs clipping now
   that the body draws no corner, and both would round the spine the client
   asked to be square.

   A filled control on this ground is SOFT PAPER, the OTHER tone (ruling 01).
   This is the rebinding that keeps the header band's Export pill visible once
   the band itself went off-beige.
   -------------------------------------------------------------------------- */
const SCREEN = cn(
  "relative isolate flex min-h-full w-full min-w-0",
  "bg-surface-page text-foreground",
  "[--btn-secondary-fill:var(--surface-panel)]",
  "[--pill-fill:var(--surface-panel)]",
);

/* ----------------------------------------------------------------------------
   THE BODY — off-beige, and NOT a container.

   In the artifact this is a bare padded div: 27.1 draws `padding: 22px 28px
   26px` with no `background` and no radius, and so does every screen after
   it. The tone is written out anyway rather than left transparent, because a
   transparent body inside a screen somebody re-parents is a body with no
   ground, and that is the class of bug this whole rebuild is correcting.

   The rebindings are the screen's, restated. They are redundant TODAY — the
   two levels are the same tone — and they are kept so that a panel nested
   inside the body can flip them back and get the right answer without
   reaching two levels up.
   -------------------------------------------------------------------------- */
const BODY = cn(
  "min-w-0 flex-1 bg-surface-page",
  "[--btn-secondary-fill:var(--surface-panel)]",
  "[--pill-fill:var(--surface-panel)]",
);

/* ----------------------------------------------------------------------------
   THE RAIL COLUMN — the spine. THE ONE PAPER AT THIS LEVEL.

   `background: var(--sheet)` on 28 of 28 rails in the artifact. The build
   painted nothing here, which read correctly only for as long as the card
   behind it was also soft paper.

   The fill is on the COLUMN and not inside `Rail`, for one reason that
   settles it: the active row is full-bleed, so it has to reach the column's
   own edges, and the column's padding is the shell's. The shell publishes
   that padding as `--rail-inset` and the row bleeds back out through it.

   `--pill-fill` and `--btn-secondary-fill` re-resolve again here, to the
   paper one rung off the SPINE rather than off the page, so the member chip
   reads on charcoal and on mango without `rail.tsx` naming a colour.
   -------------------------------------------------------------------------- */
const RAIL_COLUMN = cn(
  "bg-[var(--spine-fill)] text-[var(--spine-ink)]",
  "[--btn-secondary-fill:var(--spine-chip-fill)]",
  "[--pill-fill:var(--spine-chip-fill)]",
  "p-[var(--rail-inset)]",
);

/** How much air each door spends. Structure is identical; only the inset moves. */
const DENSITY_RAIL: Record<ScreenDensity, string> = {
  comfortable: "[--rail-inset:var(--space-6)]",
  calm: "[--rail-inset:var(--space-5)]",
};

const DENSITY_HEADER: Record<ScreenDensity, string> = {
  comfortable: "px-[var(--space-7)] pt-[var(--space-7)] pb-[var(--space-6)]",
  calm: "px-[var(--space-6)] pt-[var(--space-6)] pb-[var(--space-5)]",
};

const DENSITY_BODY: Record<ScreenDensity, string> = {
  comfortable: "p-[var(--space-6)] lg:p-[var(--space-7)]",
  calm: "p-[var(--space-5)] lg:p-[var(--space-6)]",
};

/**
 * The ground, the spine, and everything between them.
 *
 * TEN STATES
 *  1. default        — page, screen, rail column, header band, body.
 *  2. hover          — none. Nothing here is pressable; the rail's and the
 *                      body's controls own theirs.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — none, same reason as 2.
 *  5. disabled       — does not apply. A shell is not a control, and a region
 *                      the reader may not see is ABSENT (ch24.6), which is
 *                      what `rail={null}` does.
 *  6. loading        — NOT the shell's. Law 4: "a state is a body swap …
 *                      either way the rail, header and tabs stay drawn and
 *                      stay put." The shell is what stays put, so it has no
 *                      loading form and deliberately takes no `state` prop.
 *  7. empty          — same. An empty screen is a full shell with a register
 *                      in its body.
 *  8. error          — same, except the one exception law 4 names: a dead
 *                      session replaces the window, and a screen that does
 *                      that renders no shell at all rather than an empty one.
 *  9. rtl            — logical properties throughout. No physical side is
 *                      named anywhere in the file any more; the rail takes
 *                      its edge from flex order, which follows the writing
 *                      mode on its own.
 * 10. dark           — every fill is a token. The ground is #141310 at page,
 *                      screen, band and body; the spine is #1C1B18 (ink) /
 *                      #26241F (paper) / #FED069 (mango), which are 26.02's
 *                      own stated dark values; the panel below is #1C1B18.
 *
 * THREE BREAKPOINTS
 *  mobile  — no rail. Header band and body stack full width on the ground.
 *  tablet  — the rail arrives at `md` and the shell is in its wide form.
 *  desktop — the same form; only the body's inset steps up at `lg`.
 */
const ScreenShell = React.forwardRef<HTMLDivElement, ScreenShellProps>(
  (
    {
      rail,
      railLabel = "Sections",
      spine = "mango",
      ambient,
      header,
      children,
      density = "comfortable",
      page = true,
      className,
      ...props
    },
    ref,
  ) => {
    /* THE DEFAULT RAIL, and it has to be computed rather than a default
       parameter now: `Rail` needs the spine to pick which cut of the mark to
       load, and a default parameter cannot see a sibling parameter's value.
       `undefined` still means "the kit's specimen" and `null` still means
       "no rail at all", exactly as before. */
    const railNode = rail === undefined ? <Rail spine={spine} /> : rail;

    /* 26.02: "One per workspace, never combined with a mango header." The
       mango spine IS the workspace's one brand fill, so the screen-level
       mango field yields to it. See the `ambient` prop doc for the whole
       argument and for why this lives here and not in the route. */
    const fieldSuppressed = spine === "mango" && ambient !== undefined;

    const card = (
      <div
        data-slot="screen-shell-card"
        data-level="screen"
        data-spine={spine}
        data-ambient={fieldSuppressed ? "suppressed" : undefined}
        className={SCREEN}
      >
        {/* THE FIELD, if this is one of the three screens allowed one and the
            spine has not already spent the workspace's mango. It is placed,
            never drawn: the node decides what it is and the screen's own
            `relative isolate` decides where it can reach. */}
        {fieldSuppressed ? null : ambient}

        {/* THE RAIL COLUMN — THE SPINE, and the one container at this level.
            Soft paper by default, charcoal or mango by setting; full height,
            flush to the leading edge, square, because the screen above it
            takes no radius and clips nothing. Absent below the breakpoint. */}
        {railNode ? (
          <div
            data-slot="screen-shell-rail"
            data-level="rail"
            aria-label={railLabel}
            className={cn(
              "hidden md:flex",
              "w-[13rem] flex-none flex-col",
              RAIL_COLUMN,
              /* THE ICON RAIL. 26.02: the rail is "collapsible to an icon
                 rail", and a 32-wide column of glyphs inside a 208 column is
                 not one. The rail publishes `data-rail-collapsed` on its own
                 root and the column takes its content's width instead — a CSS
                 relationship, so the collapsed state stays the rail's single
                 source of truth and this shell grows no prop for it. */
              "has-[[data-rail-collapsed]]:w-auto",
              DENSITY_RAIL[density],
            )}
          >
            {railNode}
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* THE HEADER BAND — not a container, and now literally so.
              ch24.6, verbatim: "The header band is transparent — it takes the
              page tone." The page tone is off-beige, and after the client's
              ruling the tone it takes is the page's own, not a paper. */}
          {header ? (
            <div
              data-slot="screen-shell-header"
              data-level="header-band"
              className={cn("min-w-0", DENSITY_HEADER[density])}
            >
              {header}
            </div>
          ) : null}

          {/* THE BODY — the ground, padded. Every panel on it is soft paper. */}
          <div
            data-slot="screen-shell-body"
            data-level="body"
            className={cn(BODY, DENSITY_BODY[density])}
          >
            {children}
          </div>
        </div>
      </div>
    );

    if (!page) {
      return (
        <div ref={ref} data-slot="screen-shell" className={cn("min-w-0", className)} {...props}>
          {card}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        data-slot="screen-shell"
        data-level="page"
        className={cn(PAGE, className)}
        {...props}
      >
        {card}
      </div>
    );
  },
);

ScreenShell.displayName = "ScreenShell";

export { ScreenShell };
