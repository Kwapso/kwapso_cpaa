/* ============================================================================
   Brand — the kwapso artwork, as three components (the isotype, the isotype
   with the name beside it, and the name alone).

   WHY THIS FILE EXISTS
   The client, 2026-08-24, verbatim: "you already have the assets, why i dont
   see the logo in the sidebar for example? and in the sign in and everywhere.
   also in the outside screens (sign in, link, etc) i want the isotype +
   logotype version, the one with the name on it".

   That was correct and it was a real defect. Six PNG masters had been in
   `assets/logos/` since 2026-08-23 and NOTHING in the delivery drew them: every
   composition took a `mark` prop with no default and a comment reading "no
   artwork ships with this repo", which had stopped being true. Only the demo
   drew a mark at all, and only by building its own <img> pair in
   `demo/placeholder.tsx`. Six screens each picking their own file is how a
   logo ends up at three different sizes in one product, so the picking is
   done once, here.

   And, on seeing the lockup the same day: "side by side the word! love it!"

   THE LOCKUP IS HORIZONTAL, AND THE FILES CONFIRM IT. Both masters were
   opened and looked at, not inferred: the glyph sits on the LEFT and "kwapso"
   runs to its right on one line. Nothing in this system stacks a mark above a
   name — where a header says the mark sits "directly above the title", that is
   the mark's position in the content COLUMN, not a vertical lockup.

   THE LOCKUP IS THE MARK EVERYWHERE, including the rail. Client, 2026-08-24:
   "no tagline on the sidebar, only this", against an image of this lockup. So
   there is no typeset wordmark beside it and no tagline under it; `Logotype`
   is what the rail draws and what every signed-out screen draws.

   ITS INTRINSIC RATIO IS 4.9986:1 — a fifth as tall as it is wide. Anyone
   fitting it into a fixed column (the rail's is ~208px) needs that number and
   should not have to measure a file to get it: at 208 wide the lockup is 41.6
   tall. `Wordmark` is 3.7722:1 and `Isotype` is square. THESE ARE NOT THE
   VIEWBOX RATIOS OF THE MASTERS — see "WHICH FILE IS LOADED" below, which is
   the one trap in this artwork.

   DESIGN SOURCE
   The artwork is the client's own export, unmodified in shape and never
   recoloured. Where it goes is the kit's:

     ch27.16, verbatim: "Sign in, link sent, invite and session expired are
       the same two-panel shell — photography left, one column of content
       right on off-beige, with the isotype sitting directly above the title
       where an eyebrow would otherwise go."

     ch27.45, verbatim: "The isotype centred on the brand field. No wordmark,
       no tagline, no version number."  <- SUPERSEDED FOR THE SPLASH by the
       client's 2026-08-24 instruction above; a client ruling beats the
       artifact. Both sides are carried on the splash's own call sites and in
       the register, never silently.

     ruling 09, verbatim: "Mango tile with the charcoal isotype for the client
       portal; charcoal tile with the mango isotype for the agency app."  <-
       why `on="brand"` exists and why it takes the black cut unconditionally.

   THE LAW THIS FILE OBEYS
   · THE PALETTE PICKS THE CUT, NOT THE CALLER. Black artwork on light paper,
     the reversed cut on unlit paper, and on mango always the black cut —
     "charcoal on EVERY accent, both modes, no exceptions". A caller says what
     the mark is SITTING ON (`on`), never which file to load.
   · NOTHING IS RECOLOURED. The client shipped two cuts; both are used as
     drawn. No filter, no mask, no `currentColor` fill.
   · NO LITERAL SIZE. Every step of the ladder is an existing token.
   · AN ACCESSIBLE NAME IS THE DEFAULT, not an opt-in. See "NAMING" below.
   · Focus is the one global rule (tokens.css §8). An <img> is not focusable
     and this file does not make one focusable.

   ---------------------------------------------------------------------------
   HOW THE CUT IS CHOSEN — AND WHY IT IS NOT `dark:`
   ---------------------------------------------------------------------------
   Two <img> elements, one shown and one hidden. No JS, no `useEffect`, no
   hydration mismatch, and no flash of the wrong cut on first paint.

   Tailwind's own `dark:` variant is `@media (prefers-color-scheme: dark)` and
   nothing else, and THIS SYSTEM'S DARK IS NOT THAT. tokens.css spells it in
   three places (§1, §6, §7):

       :root                                                    -> light
       @media (prefers-color-scheme: dark)
         :root:not([data-theme="light"])                        -> dark
       :root[data-theme="dark"]                                 -> dark

   So a reader who has explicitly chosen light on a dark machine, and a reader
   who has explicitly chosen dark on a light machine, both get the WRONG cut
   from a bare `dark:`. The two states that a naive rule breaks are the two
   states `ModeToggle` exists to produce.

   The pair below is written as Tailwind arbitrary variants naming exactly
   those two selectors, so the compiled CSS is structurally identical to
   tokens.css's own blocks and the component is correct in all three states —
   including "system", where no attribute is present at all. Verified by
   compiling: `:root[data-theme=dark] .… { display: block }` and
   `@media (prefers-color-scheme:dark) { :root:not([data-theme=light]) .… }`.

   This is deliberately NOT solved by adding `@custom-variant dark` to a
   stylesheet: `tokens/tokens.css` is the only file two production apps are
   guaranteed to import, and a component whose correctness depends on a
   variant declared in someone else's entry CSS is a component that renders
   wrong in the app that forgets. Everything needed is in the class list.

   A `<picture>` with a `prefers-color-scheme` media query was rejected for the
   same reason: `<source media>` cannot see `[data-theme]`.

   ---------------------------------------------------------------------------
   THE LADDER IS A WIDTH, AND THE HEIGHT FOLLOWS
   ---------------------------------------------------------------------------
   Ruled 2026-08-24 with the horizontal lockup. A 5:1 mark whose HEIGHT is
   pinned has a width nobody controls, and the first thing it does in a narrow
   auth column is run out of it. So the CSS fixes the width; the height is the
   image's own, from its intrinsic ratio.

   One step ladder, shared by all three cuts, expressed as the HEIGHT the
   drawing should land on and multiplied by that cut's measured aspect:

       width = var(--brand-step) * var(--brand-ratio)

   `--brand-step` is set by the `size` variant and is always an existing token.
   `--brand-ratio` is set by the component and is a MEASURED FACT about the
   artwork, printed by `assets/build-assets.mjs` — isotype 1, logotype 4.9986,
   wordmark 3.7722. Nothing here is a chosen number.

     size    --brand-step                     height   isotype w   logotype w
     ------  ------------------------------  --------  ----------  ----------
     sm      --icon-24                1.5rem   1.5rem     1.5rem      7.498rem
     md      --icon-32                  2rem     2rem       2rem      9.997rem
     lg      --control-height-button  2.5rem   2.5rem     2.5rem     12.497rem
     splash  --space-10                 6rem     6rem       6rem     29.992rem

   `lg` is the auth shell's, and 2.5rem is not arbitrary there: it is the
   height of the one mango Continue further down the same column.

   `max-w-full` is on the box, so the widest step gives way rather than pushing
   a column sideways — and because the width is what is constrained, giving way
   shrinks the whole lockup instead of letterboxing it.

   A FIXED COLUMN IS A `className`, NOT A NEW STEP. The ladder is four named
   places, not a general size prop, so a caller with a real column width —
   `Rail`'s is about 208px — passes `className="w-[...]"` and `cn` lets it win
   over the step. The height still follows `--brand-ratio`, so the override
   cannot distort the mark; it can only make it narrower or wider.

   WHICH FILE IS LOADED — ONE PER CUT, AND IT IS A VECTOR
   ---------------------------------------------------------------------------
   The client uploaded true vector masters on 2026-08-24 ("i just uploaded the
   svg"), so there is no raster ladder here and no size-to-file mapping to get
   wrong. Six files, 1-3 KB each, sharp at 16px and at 16cm.

   THE MASTERS ARE NOT TRIMMED, AND THEY LOOK AS IF THEY ARE. This is the one
   thing to know before touching this file. Each master carries a `fill:none`
   path tracing its whole canvas, so `svg.getBBox()` returns the viewBox and
   the file reads as tight. Measured on the inked paths only — in Node by
   `assets/build-assets.mjs` and independently in a browser, agreeing to three
   decimals:

     master                         viewBox            INK            ink ratio
     -----------------------------  -----------------  -------------  ---------
     Isotype-black.svg              130.24 x 130.07     72.25 x 72.26   0.9999
     Logotype-black.svg             489.18 x 136.02    441.47 x 88.32   4.9986
     Logotype-no-isotype-black.svg  380.87 x 136.02    333.16 x 88.32   3.7722

   So THE VIEWBOX RATIO IS NOT THE ARTWORK'S RATIO: the lockup's viewBox reads
   3.596:1 and the lockup is 4.9986:1. Sizing from the viewBox draws it 39% too
   tall for its width, and the isotype's ink is 55.5% of its canvas — exactly
   the number that made `demo/placeholder.tsx` blow its <img> up to 180% inside
   a clipping box when the masters were PNGs. Same padding, new file format.

   THE FILES THIS COMPONENT LOADS ARE THE TRIMMED ONES: `*-ink.svg`, emitted by
   `assets/build-assets.mjs`, which rewrites the viewBox to the measured ink box
   and drops the invisible frame. The path data is byte-identical to the
   client's — nothing is redrawn, rescaled or recoloured, including the
   reversed cut's own off-white (#fffdf8, which is NOT the page tone #FFFEF9
   and is not this component's to round off). So the box IS the glyph, and the
   180% hack is gone rather than moved.

   NO LAYOUT SHIFT, AND IT IS THE FIRST THING A READER SEES. The box's width is
   set in CSS and its height comes from `aspect-ratio: var(--brand-ratio)` —
   the same measured number that computed the width. Both are in the stylesheet,
   so the rectangle is final on the first frame and nothing under the mark moves
   when the file arrives. This is deliberately NOT done with the <img>'s
   `width`/`height` attributes: those are integers, and rounding 441.473 x 88.32
   to a pair of integers reserves a box a quarter of a percent off the real one,
   which is a visible nudge on a sign-in screen.

   ---------------------------------------------------------------------------
   NAMING
   ---------------------------------------------------------------------------
   A logo is not decoration when it is the only thing naming the application —
   which is exactly the case on every screen the client listed, where the mark
   sits alone above a title. It IS decoration when a wordmark in real type
   sits next to it, and announcing "kwapso, image, kwapso" is a defect.

   So the accessible name is ON by default (`role="img"` plus `aria-label` on
   the wrapper, both <img> children `alt=""`), and a caller that has already
   named the product in type passes `decorative`. Defaulting the other way
   would make silence the easy mistake, and silence is the worse one.

   The label is on the WRAPPER rather than on the two <img> elements so the
   name is announced exactly once whatever the palette is doing, and so it
   cannot double up if a stylesheet fails to load and both cuts render.

   RENDERING CONTEXT
   No `"use client"`. No hook, no state, no browser API, no event handler —
   this renders inside a Server Component unchanged, which is the point: the
   cut is chosen by CSS, so there is nothing to hydrate.

   TYPES. The SVG imports need a module declaration for `*.svg`. This repo gets
   it from `vite/client` (tsconfig `types`); an app vendoring this source
   already has the equivalent from its own bundler.

   AND THEY MUST RESOLVE TO A URL, NOT A COMPONENT. Some toolchains — SVGR
   under Create React App, `@svgr/webpack`, a few Next setups — turn a default
   SVG import into a React component instead of a string. If an app vendoring
   this kit does that, these six imports break loudly at build time rather than
   quietly, and the fix is that app's SVGR rule excluding `assets/logos/`, or
   `?url` on the import. Written down because the failure names SVGR nowhere.
   ========================================================================= */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

/* ----------------------------------------------------------------------------
   The artwork. Trimmed by assets/build-assets.mjs from the six vector masters
   the client uploaded; the masters stay beside them, untouched and never
   loaded by an application.

   Read the names off disk before editing these paths — the masters are
   `Isotype-*.svg` and `Logotype-*.svg` with a capital first letter while some
   of the PNGs are lowercase, and a case-sensitive filesystem will not forgive
   the difference the way this Mac does. The TRIMMED files below are all
   lowercase, which is the convention every derivative in `assets/` follows.
   ------------------------------------------------------------------------- */

import isotypeBlackSrc from "../../assets/logos/isotype-black-ink.svg";
import isotypeWhiteSrc from "../../assets/logos/isotype-white-ink.svg";
import logotypeBlackSrc from "../../assets/logos/logotype-black-ink.svg";
import logotypeWhiteSrc from "../../assets/logos/logotype-white-ink.svg";
import wordmarkBlackSrc from "../../assets/logos/wordmark-black-ink.svg";
import wordmarkWhiteSrc from "../../assets/logos/wordmark-white-ink.svg";

import { assetUrl } from "../../lib/asset-url";

/* THE SILENT HALF of the bundler disagreement, and the worse one. These fields
   are typed `string` and Next declares `*.svg` as `any`, so under Next this
   file COMPILES and renders `src="[object Object]"` — on a sign-in screen with
   nothing else on it. `assetUrl` is what makes the type true. */
const isotypeBlack = assetUrl(isotypeBlackSrc);
const isotypeWhite = assetUrl(isotypeWhiteSrc);
const logotypeBlack = assetUrl(logotypeBlackSrc);
const logotypeWhite = assetUrl(logotypeWhiteSrc);
const wordmarkBlack = assetUrl(wordmarkBlackSrc);
const wordmarkWhite = assetUrl(wordmarkWhiteSrc);

/** One cut's pair of files. There is no size ladder: a vector has no sizes. */
interface Artwork {
  /** Black ink, for light paper and for every accent field. */
  black: string;
  /** The reversed cut, #fffdf8, for unlit paper. */
  white: string;
}

const ISOTYPE: Artwork = { black: isotypeBlack, white: isotypeWhite };
const LOGOTYPE: Artwork = { black: logotypeBlack, white: logotypeWhite };
const WORDMARK: Artwork = { black: wordmarkBlack, white: wordmarkWhite };

/* ----------------------------------------------------------------------------
   The two selectors this system spells "dark" with, as arbitrary variants.
   See the header. Written once and shared by all three components so there is
   exactly one place the rule can be got wrong.
   ------------------------------------------------------------------------- */

/** On the black cut: stand down as soon as the palette is dark, either way. */
const HIDE_WHEN_DARK = [
  "[:root[data-theme=dark]_&]:hidden",
  "[@media(prefers-color-scheme:dark)]:[:root:not([data-theme=light])_&]:hidden",
];

/** On the reversed cut: absent by default, present under either dark rule. */
const SHOW_WHEN_DARK = [
  "hidden",
  "[:root[data-theme=dark]_&]:block",
  "[@media(prefers-color-scheme:dark)]:[:root:not([data-theme=light])_&]:block",
];

/* ----------------------------------------------------------------------------
   The box.
   ------------------------------------------------------------------------- */

const brandVariants = cva(
  [
    // Shrink-wraps the artwork and never stretches a flex parent.
    "inline-flex shrink-0 items-center",
    // THE WIDTH IS WHAT IS SET; the height is the image's own. See the header:
    // a 5:1 lockup with a pinned height has a width nobody controls, and in a
    // narrow auth column it runs straight out of it.
    "w-[calc(var(--brand-step)*var(--brand-ratio))]",
    // The widest step gives way rather than pushing a column sideways. Because
    // the WIDTH is the constrained axis, giving way shrinks the whole lockup
    // proportionally — there is no letterboxing and no distortion.
    //
    // FOUND 2026-08-24, NOT FIXED — `max-w-full` DOES NOT SAVE A LOCKUP
    // CENTRED IN A GRID. `max-width: 100%` resolves against the containing
    // block, and where the parent is `grid place-content-center` the grid
    // area is itself sized from this element's own max-content contribution.
    // The constraint is circular and the browser resolves it at the natural
    // width. Measured at a 380 viewport: splash, the system door and the
    // portal boot screen each set `--brand-step: var(--space-10)` (6rem), so
    // the lockup wants 6rem x 4.9986 = 450px and draws 450px, hanging 35px
    // off each side of the window.
    //
    // The fix is at the three CALL SITES, not here — a centred grid item
    // needs `min-width: 0` and a real `max-width` on the track, or the mark
    // needs a smaller `--brand-step` below the narrow breakpoint. Left alone
    // deliberately: the work this was found during is a move, a delete and a
    // relabel, and all three files predate it unchanged.
    "max-w-full",
  ],
  {
    variants: {
      /**
       * The height the drawing lands on, which the base rule turns into a
       * width by multiplying it by the cut's own aspect. Every value is an
       * existing token: there is no `--logo-*` ladder in tokens.css, and
       * inventing one would be a size decided outside the single file this
       * system allows to decide sizes.
       */
      size: {
        /** `--icon-24`, 1.5rem. Inline with a line of text, or a dense row. */
        sm: "[--brand-step:var(--icon-24)]",
        /** `--icon-32`, 2rem. The rail's mark and the app bar's. */
        md: "[--brand-step:var(--icon-32)]",
        /**
         * `--control-height-button`, 2.5rem. The auth shell, where ch27.16
         * puts the mark "directly above the title where an eyebrow would
         * otherwise go" — and where it stands exactly as tall as the one
         * mango Continue further down the same column.
         */
        lg: "[--brand-step:var(--control-height-button)]",
        /** `--space-10`, 6rem. The one centred mark on a full field. */
        splash: "[--brand-step:var(--space-10)]",
      },
    },
    defaultVariants: { size: "lg" },
  },
);

/**
 * Each cut's own aspect, as a class so it needs no inline style.
 *
 * These are MEASUREMENTS, not choices: `assets/build-assets.mjs` prints them
 * from the trimmed ink of the vector masters — 72.26/72.26, 441.473/88.32 and
 * 333.16/88.32 — and they are the viewBox ratios of the `*-ink.svg` files this
 * component loads. If the client re-exports the artwork, run the generator and
 * copy the three numbers it prints; nothing else in this file needs touching.
 */
const RATIO = {
  isotype: "[--brand-ratio:1]",
  logotype: "[--brand-ratio:4.9986]",
  wordmark: "[--brand-ratio:3.7722]",
} as const;

/**
 * Shared by both <img> children.
 *
 * `w-full` — the box owns the width. `aspect-[var(--brand-ratio)]` — the same
 * measured number that computed that width now gives the height, from the
 * STYLESHEET rather than from the file, so the rectangle is final on the first
 * frame and nothing under the mark moves when the SVG arrives. `h-auto` lets
 * the aspect resolve it.
 *
 * No display utility here: each cut adds its own, and the reversed one starts
 * hidden.
 */
const CUT_BASE = "block h-auto w-full aspect-[var(--brand-ratio)]";

/** What the mark is sitting on. Kit words, not coined ones. */
export type BrandField = "paper" | "brand" | "unlit";

interface BrandArtworkProps
  extends Omit<React.ComponentPropsWithoutRef<"span">, "children">,
    VariantProps<typeof brandVariants> {
  /**
   * The ground under the mark, which is what decides the cut:
   * · `paper`  — the page tone. Black on light, reversed on dark. The default,
   *              and the only value that swaps.
   * · `brand`  — the mango field (ruling 09's portal tile, ch27.45's splash in
   *              light). ALWAYS the black cut, in both palettes: charcoal on
   *              every accent, no exceptions. Only one <img> is rendered.
   * · `unlit`  — the dark field a splash takes when the stored theme is dark
   *              (ruling 22). Always the reversed cut, one <img>.
   */
  on?: BrandField;
  /**
   * The accessible name. A prop with a default, like every other string here;
   * the default is the brand name, which does not translate, but a call site
   * in another script may still want to spell it.
   */
  label?: string;
  /**
   * The mark is not the thing naming the application on this screen — a
   * wordmark in real type already is. Renders the artwork with no accessible
   * name at all rather than announcing the product twice. Default `false`,
   * because an unnamed logo is the worse failure of the two.
   */
  decorative?: boolean;
}

interface ArtworkCarrierProps extends BrandArtworkProps {
  /**
   * Which of the three drawings this is. Named `cut` and NOT `slot`: a
   * `<span>` has a real `slot` DOM attribute, so a prop of that name is
   * widened to `string` by the spread and a caller could quietly redirect the
   * ratio lookup. Caught by the compiler; recorded so it is not renamed back.
   */
  cut: keyof typeof RATIO;
  art: Artwork;
}

/**
 * The drawing shared by all three components. Private: `Isotype`, `Logotype`
 * and `Wordmark` are the public names, and a fourth generic export would let
 * a call site pick a file again, which is the thing this file exists to stop.
 */
const BrandArtwork = React.forwardRef<HTMLSpanElement, ArtworkCarrierProps>(
  (
    {
      className,
      cut,
      art,
      size = "lg",
      on = "paper",
      label = "kwapso",
      decorative = false,
      ...props
    },
    ref,
  ) => {
    const named: React.HTMLAttributes<HTMLSpanElement> = decorative
      ? { "aria-hidden": true }
      : { role: "img", "aria-label": label };

    return (
      <span
        ref={ref}
        data-slot={cut}
        data-on={on}
        data-size={size ?? "lg"}
        {...named}
        className={cn(brandVariants({ size }), RATIO[cut], className)}
        {...props}
      >
        {/* `unlit` never draws the black cut; `brand` and `paper` both do, and
            only `paper` stands it down when the palette flips. */}
        {on === "unlit" ? null : (
          <img
            data-slot="brand-cut"
            data-cut="black"
            src={art.black}
            alt=""
            /* Eager, and deliberately: this is the mark above the title on a
               screen with nothing else on it. `loading="lazy"` on something
               already in the viewport is a round trip the reader watches. */
            decoding="async"
            className={cn(CUT_BASE, on === "paper" ? HIDE_WHEN_DARK : null)}
          />
        )}
        {on === "brand" ? null : (
          <img
            data-slot="brand-cut"
            data-cut="white"
            src={art.white}
            alt=""
            decoding="async"
            /* On `unlit` this is the only cut, so it must not start hidden. */
            className={cn(CUT_BASE, on === "paper" ? SHOW_WHEN_DARK : null)}
          />
        )}
      </span>
    );
  },
);

BrandArtwork.displayName = "BrandArtwork";

export interface BrandProps extends BrandArtworkProps {}

/**
 * The mark alone — the kwapso glyph, no name beside it.
 *
 * Where it belongs: the rail, the app bar, a favicon-sized slot, and ch27.45's
 * splash as the artifact writes it. Where it does NOT belong, as of the
 * client's 2026-08-24 instruction, is the signed-out screens: those take
 * `Logotype`.
 *
 * TEN STATES
 *  1. default        — the cut the palette calls for, at the `size` height.
 *  2. hover          — does not apply. A logo is not a control. Where a call
 *                      site wraps one in a link, that element owns the hover;
 *                      a hover here would make every mark look pressable.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every real control at
 *                      once, at the control's own radius. An <img> is not
 *                      focusable and this file does not make it one.
 *  4. active/pressed — does not apply, for the same reason as hover.
 *  5. disabled       — does not apply. A brand mark has no disabled reading,
 *                      and greying one would be an opacity, which the system
 *                      forbids as a state.
 *  6. loading        — does not apply as a prop. The <img> carries its real
 *                      width and height so the box is reserved before the
 *                      bytes arrive; there is nothing to hold open and no
 *                      skeleton, because a 1.7KB raster that fails to arrive
 *                      is a broken deployment, not a slow one.
 *  7. empty          — does not apply. The artwork is not passed in; it is
 *                      this component. There is no state where it is absent.
 *  8. error          — no register, deliberately. If the file 404s the reader
 *                      sees the browser's own broken-image affordance, which
 *                      is the honest signal; an "image unavailable" caption
 *                      where the logo goes is worse than the gap.
 *  9. selected       — does not apply.
 * 10. read-only      — always. There is nothing here to write to.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED, and that is the design. The kit
 *  states one mark height per place the mark appears, not per viewport, so the
 *  step is chosen by WHERE it sits and never by how wide the window is. The
 *  only width-dependent behaviour is `max-w-full`, which keeps a wide cut from
 *  pushing a narrow column sideways; it never changes the chosen step.
 *
 * RTL — safe, and out of scope by client ruling. No side is named in this
 * file; the artwork itself is not mirrored, which is correct — a logotype is
 * never flipped.
 */
const Isotype = React.forwardRef<HTMLSpanElement, BrandProps>((props, ref) => (
  <BrandArtwork ref={ref} cut="isotype" art={ISOTYPE} {...props} />
));

Isotype.displayName = "Isotype";

/**
 * The lockup — the mark and the name together. Ink to the edge, ratio 4.9963:1.
 *
 * THE CLIENT'S SCREENS. 2026-08-24, verbatim: "in the outside screens (sign
 * in, link, etc) i want the isotype + logotype version, the one with the name
 * on it". This is that version, and it is the default `mark` on every
 * signed-out screen in `compositions/`.
 *
 * ITS HEIGHT IS THE WHOLE LOCKUP, not the glyph inside it. Measured on the
 * master: the mark occupies 444 of the lockup's 542 ink rows, so a `lg`
 * Logotype's glyph reads about four fifths the size of a `lg` Isotype's. That
 * is the artwork's own proportion and is not corrected here — the two are
 * never drawn side by side, and rescaling one to match the other would be
 * redrawing a lockup the client set.
 *
 * TEN STATES, THREE BREAKPOINTS, RTL — `Isotype`'s, exactly. The only
 * difference between the two components is which pair of files they load.
 */
const Logotype = React.forwardRef<HTMLSpanElement, BrandProps>((props, ref) => (
  <BrandArtwork ref={ref} cut="logotype" art={LOGOTYPE} {...props} />
));

Logotype.displayName = "Logotype";

/**
 * The name alone, with no glyph. Ratio 3.7676:1.
 *
 * Its one place is beside an `Isotype` that is already drawing the glyph —
 * `Rail`'s `mark` and `wordmark` are two props for exactly that reason, so the
 * name can be dropped when the rail collapses and the glyph kept. Pass
 * `decorative` on whichever of the pair is not carrying the accessible name,
 * or the rail announces "kwapso" twice.
 *
 * TEN STATES, THREE BREAKPOINTS, RTL — `Isotype`'s, exactly.
 */
const Wordmark = React.forwardRef<HTMLSpanElement, BrandProps>((props, ref) => (
  <BrandArtwork ref={ref} cut="wordmark" art={WORDMARK} {...props} />
));

Wordmark.displayName = "Wordmark";

export { Isotype, Logotype, Wordmark, brandVariants };
