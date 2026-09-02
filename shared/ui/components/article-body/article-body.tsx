/* ============================================================================
   ArticleBody — long-form written content (0 direct call sites).

   DESIGN SOURCE
   Kit chapter 03 ("Typography · Saans 300 / 500 · Serrif Condensed 300 ·
   thirteen steps"), the specimen captioned "Prose block", read out of
   `Design Mothership/kit-current/Kwapso UI Kit.dc.html`. Kept figure for
   figure:

     · eyebrow   — 11 / 500 / uppercase / 0.08em, tertiary ink
     · heading   — 24 / 500 / -0.014em, 12 under the eyebrow
     · paragraph — 16 / 1.45, secondary ink, `max-width: 66ch`,
                   `text-wrap: pretty`, 10 under the heading
     · list      — 15 / 1.6, secondary ink, `max-width: 66ch`,
                   inline-start inset 20, 14 under the paragraph

   The chapter's own body-copy caption is the rule the measure comes from:
   "Body copy runs at sixteen and never exceeds sixty-eight characters a
   line." Its link caption is the rule the anchors obey: "Ink, underlined on
   hover. Never blue, never coloured." Its truncation caption settles the
   difference between this component and a row: "One line ellipsis in rows;
   wrap in prose." Nothing here truncates.

   The editorial rules the chapter states — "Bulleted lists stay short and
   parallel", "No emoji, no exclamation marks", "Numbers get tabular figures"
   — are copy decisions, not drawing decisions. Only the third one is
   something a component can enforce, and it is: every number in this
   component's prose is tabular.

   Ruling 35 governs any picture inside the prose: "Photography sits under
   type, never behind it. A header image is a contained card with 24px corners
   at the top of a page. No text is ever placed on it, and no scrim is used to
   make text survive it." So an `img` here takes the box radius and nothing is
   ever laid over it.

   Ruling 13's pull-quote is chapter 13's, and it is the one serif in the
   system: `SerrifCondensed` at the h3 step on `--tracking-serif`, "one per
   page". A `blockquote` inside the prose is drawn as that.

   THE LAW THIS FILE OBEYS
   · The measure is `--measure-body`, and it is capped ONCE, on the root.
     SETTLED 2026-08-23, override 31 (verify/open.html C15-2), REASON
     CORRECTED by override 37 (verify/open.html N5): the token is `66ch`,
     CH03's own drawn value. Three figures used to disagree — 68 in CH03's
     prose, 66 in CH03's own drawing, 62 in the token with a `! GAP-8` beside
     it. 66 DOES NOT SATISFY THE PROSE and no `ch` figure near it can: `ch` is
     the width of a zero, 66ch measures 88 rendered characters in this face,
     and a true 68-character cap is about 52ch. The drawn value wins because
     it is the half a stylesheet can hold; CH03's prose is the side owed a
     correction. GAP-8 stays closed and GAPS-COL1 AB-1 with it. The component
     still holds no number of its own.
   · Type is never a hardcoded size. Every step here is one of the sixteen
     bridged utilities, which set size, leading AND tracking together.
   · A link is ink, underlined, never coloured. `--hair-strong` at rest moving
     to the current ink on hover, exactly as `Button variant="text"` draws it.
   · Blocks are separated by SPACE, not by strokes. The one rule this
     component draws is an explicit `hr`, which is the author asking for one.
   · Focus is one global rule (tokens.css §8). A link inside the prose takes it.
   · No product vocabulary. This component knows about headings, paragraphs
     and lists, and nothing about what they are for.

   RENDERING CONTEXT
   No `"use client"`. It forwards props and a ref, holds no state, calls no
   hook and creates no handler during its own render.
   ========================================================================= */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { Skeleton } from "../skeleton/skeleton";
import { CollectionRegister } from "../collection-frame/collection-frame";

/* ----------------------------------------------------------------------------
   The prose skin.

   Written as descendant selectors rather than as a set of components, because
   long-form content arrives as authored markup — a CMS field, a markdown
   render, a mail body — and a component cannot wrap elements it never sees.
   This is the one place in the system where that is the right shape, and it
   is why nothing here is exported as `ArticleParagraph`.

   Every rule below is the kit's figure at the nearest bridged step. The
   vertical rhythm is the kit's own: 10 between a heading and its paragraph,
   14 between paragraphs and lists, and the ladder's 48 (`--space-8`, "block
   gap inside a section") before a new section heading.
   ------------------------------------------------------------------------- */
const PROSE = [
  /* ---- flow ---------------------------------------------------------- */
  // 14 between blocks, which is the kit's list gap and its widest block gap.
  "[&>*+*]:mt-[var(--space-3h)]",
  // A paragraph follows its heading at the drawn 10.
  "[&>:is(h2,h3,h4)+p]:mt-[var(--space-2h)]",
  // A new section heading opens on the ladder's block gap.
  "[&>*+:is(h2,h3)]:mt-[var(--space-8)]",
  "[&>*+h4]:mt-6",

  /* ---- headings ------------------------------------------------------ */
  // The h2 / h3 / h4 steps: 32 / 24 / 20. Each utility carries its own
  // leading and tracking, which is the whole reason the step is used by name.
  "[&_h2]:text-3xl [&_h2]:font-[var(--font-weight-medium)]",
  "[&_h3]:text-2xl [&_h3]:font-[var(--font-weight-medium)]",
  "[&_h4]:text-xl [&_h4]:font-[var(--font-weight-medium)]",
  // A heading balances rather than orphaning its last word.
  "[&_:is(h2,h3,h4)]:text-balance",
  "[&_:is(h2,h3,h4)]:text-foreground",

  /* ---- paragraphs ---------------------------------------------------- */
  "[&_p]:text-pretty",

  /* ---- lists --------------------------------------------------------- */
  // The drawn 20 inline-start inset, as a logical property.
  "[&_:is(ul,ol)]:ps-5",
  "[&_ul]:list-disc [&_ol]:list-decimal",
  // 1.6 is the kit's list leading — `--leading-loose`.
  "[&_:is(ul,ol)]:leading-[var(--leading-loose)]",
  "[&_li+li]:mt-1",
  // A nested list is tighter against its parent item than two blocks are.
  "[&_li>:is(ul,ol)]:mt-1",
  "[&_ol]:tabular-nums",

  /* ---- links --------------------------------------------------------- */
  // Ink, underlined, never coloured. The rest position is the faint rule and
  // hover moves it to the current ink — `Button variant="text"`'s treatment.
  "[&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-[0.1875rem]",
  "[&_a]:decoration-hair-strong",
  "[&_a]:transition-colors [&_a]:duration-[var(--duration-colour)] [&_a]:ease-kwapso",
  "[&_a:hover]:decoration-current",

  /* ---- emphasis ------------------------------------------------------ */
  // Saans ships 300 and 500 and nothing else, so "bold" IS medium. That is
  // correct, not a mistake (PATTERN §3).
  "[&_:is(strong,b)]:font-[var(--font-weight-medium)] [&_:is(strong,b)]:text-foreground",
  "[&_:is(em,i)]:italic",

  /* ---- the one serif ------------------------------------------------- */
  // Chapter 13's pull-quote. One per page is an editorial rule, not one a
  // component can hold, so nothing here counts them.
  "[&_blockquote]:font-[family-name:var(--font-serif)] [&_blockquote]:tracking-[var(--tracking-serif)]",
  "[&_blockquote]:text-2xl [&_blockquote]:text-foreground",
  "[&_blockquote]:my-[var(--space-8)]",
  "[&_blockquote_p]:text-inherit",
  "[&_blockquote_footer]:mt-3 [&_blockquote_footer]:font-[family-name:var(--font-sans)]",
  "[&_blockquote_footer]:text-caption [&_blockquote_footer]:tracking-normal",
  "[&_blockquote_footer]:text-ink-tertiary",

  /* ---- code ---------------------------------------------------------- */
  // `.kw-codechip`'s tone at the bar radius, which ruling 03 gives to a code
  // cell. Not a fifth radius: `--radius-sm` is one of the four.
  "[&_code]:rounded-[var(--radius-sm)] [&_code]:bg-surface-quiet",
  "[&_code]:px-1 [&_code]:py-px [&_code]:text-caption [&_code]:text-ink-secondary",
  "[&_pre]:overflow-x-auto [&_pre]:rounded-[var(--radius)] [&_pre]:bg-surface-quiet",
  "[&_pre]:p-6 [&_pre]:text-caption [&_pre]:text-ink-secondary",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",

  /* ---- rules and media ----------------------------------------------- */
  // The author asked for a rule, so it is the heavy section weight.
  "[&_hr]:my-[var(--space-8)] [&_hr]:h-px [&_hr]:border-0 [&_hr]:bg-hair-strong",
  // Ruling 35: a contained card at the box radius, nothing laid over it.
  "[&_img]:block [&_img]:h-auto [&_img]:w-full [&_img]:rounded-[var(--radius)]",
  "[&_figure]:my-[var(--space-8)]",
  "[&_figcaption]:mt-3 [&_figcaption]:text-caption [&_figcaption]:text-ink-tertiary",

  /* ---- label / value pairs ------------------------------------------- */
  "[&_dt]:font-[var(--font-weight-medium)] [&_dt]:text-foreground",
  "[&_dd]:mt-1",
  "[&_dd+dt]:mt-3",

  /* ---- numbers ------------------------------------------------------- */
  // "Numbers get tabular figures" — the one editorial rule a component can
  // actually hold.
  "[&_:is(time,data)]:tabular-nums",
].join(" ");

const articleBodyVariants = cva(["min-w-0 text-ink-secondary", PROSE], {
  variants: {
    /**
     * Which body step the prose runs at. All three are steps on the kit's own
     * thirteen-step ladder; none is invented.
     */
    size: {
      /** body · 16 / 1.45. Chapter 03's stated body size for long-form. */
      default: "text-base",
      /** body-l · 18 / 1.4. The kit's "Lead paragraph, one step up from body". */
      lead: "text-lg",
      /** body-s · 14 / 1.45. "Dense UI text — rows, panels, secondary prose." */
      compact: "text-sm",
    },
    /**
     * Cap the line length. On by default: `--measure-body` is what stops a
     * wide screen from running prose to 140 characters a line. Off for prose
     * inside a column that is already narrow, where a second cap would leave
     * a ragged gutter.
     */
    measure: {
      true: "max-w-[var(--measure-body)]",
      false: "",
    },
  },
  defaultVariants: { size: "default", measure: true },
});

export interface ArticleBodyProps
  extends React.ComponentPropsWithoutRef<"div">,
    VariantProps<typeof articleBodyVariants> {
  /**
   * The micro uppercase line over the heading — the kit's prose block draws
   * one. Undefined draws nothing, which is why this component hardcodes no
   * eyebrow of its own.
   */
  eyebrow?: React.ReactNode;
  /**
   * The article's own heading, at the h3 step the kit draws it at. A node.
   * Left undefined where the composition's `Title` already carries it.
   */
  heading?: React.ReactNode;
  /** The heading element, so a page keeps a real outline. */
  headingAs?: "h1" | "h2" | "h3" | "h4" | "div";
  /**
   * Render as an `article` element rather than a `div`. On by default: this
   * component's whole job is long-form content, and `article` is what that is.
   */
  as?: "article" | "div" | "section";

  /** The content has not arrived. Cold cache only. */
  loading?: boolean;
  /** How many placeholder lines to draw while `loading`. */
  loadingLines?: number;
  /** The request failed. Beats `empty`. */
  error?: boolean;
  /**
   * Force the empty register even though `children` are present — for a body
   * that came back as an empty string rather than as nothing.
   */
  empty?: boolean;
  loadingState?: React.ReactNode;
  emptyState?: React.ReactNode;
  errorState?: React.ReactNode;
  loadingLabel?: string;
  emptyLabel?: string;
  emptyBody?: string;
  errorLabel?: string;
  errorBody?: string;
}

/**
 * Long-form written content.
 *
 * TEN STATES
 *  1. default        — the prose, capped at the measure, secondary ink with
 *                      primary ink on the headings and the emphasis.
 *  2. hover          — belongs to the links inside it, and only to them: the
 *                      underline moves from `--hair-strong` to the current
 *                      ink. Never a colour change, never an opacity. The
 *                      article itself is not a target.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the control's own radius. A link inside the prose is
 *                      a real anchor and is reached and ringed already.
 *  4. active/pressed — does not apply. Prose is not pressed.
 *  5. disabled       — does not apply. Text cannot be unavailable; an article
 *                      the reader may not see is not rendered at all.
 *  6. loading        — `loading`: `Skeleton variant="text"`, whose last line
 *                      is short the way a last line of prose is. Cold cache
 *                      only; a warm re-fetch keeps the stale copy and marks it
 *                      busy rather than blanking a page of reading.
 *  7. empty          — no children, or `empty`: the quiet register. NOT
 *                      `null`, because an article that came back with no body
 *                      is a fact worth saying, and a page that silently lost
 *                      its middle looks broken rather than empty.
 *  8. error          — `error`: the register with a poppy dot and its own
 *                      wording. Chapter 21's rule — say what happened, then
 *                      the one next step.
 *  9. selected       — does not apply as a component state. Text selection is
 *                      the browser's and is deliberately left alone: a custom
 *                      `::selection` colour would be a fifth accent.
 * 10. read-only      — always. This component renders content and never edits
 *                      it. An editor is a `Textarea`, not an article.
 *
 * THREE BREAKPOINTS
 *  · mobile (base) — one column, full width of its parent, capped by the
 *    measure which at 320 never binds. Every block is `w-full`, including
 *    pictures and code, and `pre` scrolls horizontally on its own rather than
 *    widening the page — a long code line is the one thing in prose that
 *    cannot wrap.
 *  · tablet (`sm:`) — UNCHANGED. The measure has still not bound at 40rem
 *    with a normal page inset, so nothing would change if it were written.
 *  · desktop — UNCHANGED in rules, but this is where `--measure-body` starts
 *    doing its work: the prose stops growing and the column gutters open
 *    instead. That is the intended and only responsive behaviour, and it is a
 *    property of the token rather than of a breakpoint — which is why there
 *    is no `lg:` anywhere in this file.
 *
 * RTL — safe, and unused: the system is LTR only. The list inset is `ps-5`
 * (padding-inline-start), every margin is on the block axis, and nothing here
 * names a physical side.
 */
const ArticleBody = React.forwardRef<HTMLDivElement, ArticleBodyProps>(
  (
    {
      className,
      size = "default",
      measure = true,
      eyebrow,
      heading,
      headingAs = "h2",
      as = "article",
      loading = false,
      loadingLines = 5,
      error = false,
      empty = false,
      loadingState,
      emptyState,
      errorState,
      loadingLabel = "Loading…",
      emptyLabel = "Nothing written yet",
      emptyBody = "There is no content here at the moment.",
      errorLabel = "Content unavailable",
      errorBody = "We can’t show this right now. Try again in a moment.",
      children,
      ...props
    },
    ref,
  ) => {
    const Root = as;
    const Heading = headingAs;

    const hasBody =
      children !== undefined && children !== null && children !== false && children !== "";

    /* Exclusive states resolved in JS (PATTERN §4): loading beats error beats
       empty. */
    const state = loading ? "loading" : error ? "error" : !hasBody || empty ? "empty" : "default";

    /* PROSE THAT ARRIVES AS SANITISED HTML RATHER THAN AS NODES.
       This interface extends the div props, so it has always ADVERTISED
       `dangerouslySetInnerHTML` — and the render below writes its own children
       (an eyebrow, a heading, a register, `children`), so React refused the
       combination outright: "Can only set one of `children` or
       `props.dangerouslySetInnerHTML`". The type accepted what the
       implementation could not deliver, which is the same fault `Stopwatch`
       carried at v1.2.7 with `children`.

       It matters here more than it did there. The kit's own Notes editor emits
       HTML, so a body that arrives as a string is the ORDINARY case for
       user-authored prose, not an exotic one — and the alternative a consumer
       is forced into, wrapping the string in one div, silently kills the
       vertical rhythm: every rule that spaces this prose is a DIRECT-child
       selector (`[&>*+*]`, `[&>*+:is(h2,h3)]`…), and a single wrapper leaves
       the root with one child for them to act on. Measured, not assumed: the
       wrapped render puts exactly 1 element under the root.

       So when a caller injects, the root takes the HTML and draws nothing of
       its own. No eyebrow, no heading, no register — React forbids children
       beside injected markup, and a caller supplying the whole body is not
       asking for them. Every other caller is untouched: this branch is not
       entered unless `dangerouslySetInnerHTML` is actually present.

       IT ADDS NO CLASS, NO COLOUR AND NO SPACING. The prose treatment, the
       measure and the size are the same variants the normal path resolves. */
    const injected = (props as { dangerouslySetInnerHTML?: { __html: string } })
      .dangerouslySetInnerHTML;
    if (injected) {
      return (
        <Root
          ref={ref as React.Ref<HTMLDivElement>}
          data-slot="article-body"
          data-state="default"
          className={cn(articleBodyVariants({ size, measure }), className)}
          {...props}
        />
      );
    }

    return (
      <Root
        ref={ref as React.Ref<HTMLDivElement>}
        data-slot="article-body"
        data-state={state}
        aria-busy={loading || undefined}
        className={cn(articleBodyVariants({ size, measure }), className)}
        {...props}
      >
        {eyebrow !== undefined && eyebrow !== null ? (
          <span
            data-slot="article-body-eyebrow"
            className="block text-micro font-[var(--font-weight-medium)] uppercase text-ink-tertiary"
          >
            {eyebrow}
          </span>
        ) : null}

        {heading !== undefined && heading !== null ? (
          <Heading
            data-slot="article-body-heading"
            /* The kit's 12 under the eyebrow, and nothing at all without one. */
            className={cn(
              "text-2xl font-[var(--font-weight-medium)] text-balance text-foreground",
              eyebrow !== undefined && eyebrow !== null && "mt-3",
            )}
          >
            {heading}
          </Heading>
        ) : null}

        {state === "loading"
          ? (loadingState ?? (
              <Skeleton variant="text" lines={loadingLines} label={loadingLabel} />
            ))
          : null}

        {state === "error"
          ? (errorState ?? (
              <CollectionRegister tone="error" eyebrow={errorLabel} body={errorBody} />
            ))
          : null}

        {state === "empty"
          ? (emptyState ?? (
              <CollectionRegister tone="quiet" eyebrow={emptyLabel} body={emptyBody} />
            ))
          : null}

        {state === "default" ? children : null}
      </Root>
    );
  },
);

ArticleBody.displayName = "ArticleBody";

export { ArticleBody, articleBodyVariants };
