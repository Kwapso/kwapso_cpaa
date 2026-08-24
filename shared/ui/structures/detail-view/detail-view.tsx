/* ============================================================================
   DetailView — a record's overview panel.

   DESIGN SOURCE
   design-mothership/specimens/kwapso-patterns.css, CH23. The kit draws this
   shape twice — a record's identity block and the hero band above it — and
   both are transcribed:

     .kw-accountcard        display: flex; flex-direction: column;
                              gap: var(--space-4);
     .kw-accountcard__id    display: flex; align-items: center;
                              gap: var(--space-3);
     .kw-avatar-lg          --avatar-lg (48), pill, --surface-brand /
                              --ink-on-accent, --text-body-s, --weight-strong
     .kw-accountcard__name  --text-body-l (18), --weight-strong
     .kw-accountcard__role  --text-caption, --ink-tertiary
     .kw-accountcard__kv    the label/value grid — `DescriptionList` draws it

     .kw-stagehero          background: var(--surface-panel);
                              border-radius: var(--radius-card);
                              padding: var(--space-6) var(--space-6);
                              display: flex; flex-direction: column;
                              gap: var(--space-3);
     .kw-stagehero__title   --text-h2, --weight-strong, --tracking-h2
     .kw-stagehero__meta    --text-caption, --ink-tertiary

   design-mothership/specimens/kwapso-ui.css → `.kw-empty`;
   kwapso-patterns.css CH21 → `.kw-register`. Both transcribed below.

   THE LAW THIS FILE OBEYS
   · THE GROUND IS `--surface-panel`, NOT `--background`. PATTERN §11, ruled
     2026-08-22: in light, `--background`, `--card`, `--surface-raised` and
     `--popover` are the same colour, so a card drawn on the page tone has
     contrast 1.000 against its ground and is held up by its shadow alone.
     This component contains `Card`s, so it lays them on the panel tone — and
     that is also exactly what the kit does, with `.kw-stagehero` on
     `--surface-panel` and `.kw-card .kw-on-panel` sitting on it.
   · THE MARK IS 48 AND STAYS 48. Ruling 30 states three mark sizes
     absolutely, and `avatar.tsx` argues why: a mark's size is WHAT IT IS —
     24 in a dense row, 32 in a list, 48 on a record header. A 48 that shrank
     to 32 on a phone would start meaning "list item" at that width.
   · THE PAIRS ARE `DescriptionList`'S. This file draws no `<dl>`, no label
     ink and no grid; it hands `items` straight to the collection that owns
     that drawing, so a record's pairs and a drawer's pairs cannot diverge.
   · A SECTION IS A `Card`. Its header, its title, its description, its inset
     and its 24 radius are all `card.tsx`'s; none of them is redrawn here.
   · Focus is ONE global rule (tokens.css §8). Nothing here rings.
   · Disabled is a fill and an ink — and it does not apply, for the reason in
     state 5.
   · Every user-facing string is a prop with a default.
   · No product vocabulary (commission §11). A record, its header, its
     sections, its aside, its footer.

   RENDERING CONTEXT
   No `"use client"`. This module holds no hook, no state and no handler of
   its own; the primitives it renders carry their own directives.
   ========================================================================= */

import * as React from "react";

import { cn } from "../../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../../controls/avatar/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../controls/card/card";
import { Skeleton } from "../../controls/skeleton/skeleton";
import { Headline, Hint } from "../../controls/typography/typography";
import {
  DescriptionList,
  type DescriptionListItem,
} from "../description-list/description-list";
import { CollectionRegister } from "../collection-frame/collection-frame";

/* ============================================================================
   A section
   ========================================================================= */

export interface DetailViewSection {
  /** React key, and the section's own anchor id when `anchored`. */
  id: string;
  /** The section's name. Drawn by `CardTitle`. */
  title?: React.ReactNode;
  /** A line under the name. Drawn by `CardDescription`. */
  description?: React.ReactNode;
  /**
   * The section's own label/value pairs. Handed straight to
   * `DescriptionList`; a section with both `items` and `content` draws the
   * pairs first and the content under them.
   */
  items?: DescriptionListItem[];
  /** Anything else — a chart, a list, a table, a form. */
  content?: React.ReactNode;
  /**
   * Put this section in the ASIDE column rather than the main one. At and
   * above 64rem the aside is the narrower of the two; below it every section
   * is one column and this flag only decides the order.
   */
  aside?: boolean;
  /** A control at the section's head — "edit", "add", "show all". */
  action?: React.ReactNode;
}

/* ============================================================================
   The registers — transcribed, local
   ========================================================================= */

/* `.kw-empty` (kwapso-ui.css, the last block): a centred column, `--space-2`
   between its lines, `--space-8` / `--space-6` inset, tertiary ink at 14. */
function EmptyRegister({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-slot="detail-view-empty"
      /* Left-aligned -- 27.21, DEF-2. */
      className="flex flex-col items-start gap-2 px-6 py-[var(--space-8)] text-start text-sm text-ink-tertiary"
    >
      {children}
    </div>
  );
}

/* ============================================================================
   THE ERROR REGISTER IS THE SHARED ONE — `CollectionRegister`.

   CH21's `.kw-register` was declared LOCALLY in six files, byte-for-byte the
   same markup in every one of them, and one record could show two different
   copies of it at once (a `detail-view` rendering a `DescriptionList`). The
   values inside all six were corrected in place on 2026-08-23, so nothing
   drew wrongly; six chances to drift is the defect, and this is the follow-up
   GAPS-FIDELITY-DE L-2 wrote out. `variant="block"` IS `.kw-register` — the
   panel tone at the 24 radius, `--space-7` inset, left-aligned per 27.21 —
   and `tone="error"` is the 7px poppy dot CH21 puts on exactly one of its
   four registers.

   `.kw-empty` STAYS LOCAL, and that is not an oversight. It is a different
   kit object: one line of words at the 14 step in tertiary ink, not an
   eyebrow / title / body / action column. `CollectionRegister`'s `inline`
   variant carries `.kw-empty`'s box but not its step or its ink, so folding
   the two together would either shrink this register's words or hand every
   inline register a container ink its title would inherit. Logged rather
   than forced.
   ========================================================================= */

/* ----------------------------------------------------------------------------
   Two initials, cut on code points so a name outside the basic plane is not
   cut through the middle of one. `Avatar` cuts to two again itself.
   ------------------------------------------------------------------------- */
function initialsOf(name: string | undefined): string {
  if (!name) return "";
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return Array.from(words[0]).slice(0, 2).join("");
  return [words[0], words[words.length - 1]].map((word) => Array.from(word)[0] ?? "").join("");
}

/* ============================================================================
   DetailView
   ========================================================================= */

export interface DetailViewProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  /** The record's name. `.kw-stagehero__title` — the h2 step at its own tracking. */
  title?: React.ReactNode;
  /** The line under it. `.kw-accountcard__role` — caption in tertiary ink. */
  subtitle?: React.ReactNode;
  /** A quieter line under that — an id, a date, a count. `.kw-stagehero__meta`. */
  meta?: React.ReactNode;
  /**
   * The record's mark, at 48. Only drawn when `initials`, `avatarSrc` or
   * `avatarFallback` is given — a record with no mark is a heading, not a
   * heading with an empty circle beside it.
   */
  initials?: string;
  /** A photograph for the mark. `Avatar` falls back to the initials silently. */
  avatarSrc?: string;
  /** Anything else inside the mark — a glyph for a record that is not a person. */
  avatarFallback?: React.ReactNode;
  /**
   * The mark's fill. `brand` is the kit's own `.kw-avatar-lg`, mango with a
   * charcoal label; `default` is the raised paper one. Mango is opt-in
   * because the kit rules one per view.
   */
  avatarVariant?: "default" | "brand" | "quiet";
  /** Status chips beside the name — `Badge`s, from the call site. */
  badges?: React.ReactNode;
  /** The header's controls. An `ActionRow` from the call site, or bare `Button`s. */
  actions?: React.ReactNode;
  /**
   * A progression across the head of the record — a `StatusStepper` from the
   * call site. A slot rather than a prop set, because only the call site
   * knows which stages exist and what pressing one does.
   */
  progress?: React.ReactNode;
  /** A notice across the head — an `Alert` from the call site. */
  notice?: React.ReactNode;

  /** The record's own label/value pairs, under the header. `DescriptionList` draws them. */
  items?: DescriptionListItem[];
  /** Which `DescriptionList` layout the header pairs take. */
  itemsLayout?: "rows" | "grid";
  /** Which `DescriptionList` density the header pairs take. */
  density?: "default" | "dense";

  /** The sections, in the order they should read. */
  sections?: DetailViewSection[];
  /** Anything after the sections — a whole extra region the call site composes. */
  children?: React.ReactNode;
  /** The audit line at the foot — "changed by … at …". Tertiary ink, above a rule. */
  footer?: React.ReactNode;

  /**
   * `panel` lays the whole view on `--surface-panel` with its own inset, which
   * is what makes the `Card` sections visible in LIGHT (PATTERN §11). `plain`
   * draws no ground and no inset, for a view already inside a panel — a
   * drawer body, a tab panel that painted the tone itself.
   */
  ground?: "panel" | "plain";

  /* ---- the three states --------------------------------------------------- */
  /**
   * The record has not arrived. The FRAME stays and its parts become
   * `Skeleton`s — a shell that disappears makes the page jump when the data
   * lands, which is `card.tsx`'s own rule for the same situation.
   */
  loading?: boolean;
  /** The record could not be read. CH21's register instead of the view. */
  error?: boolean;
  /** The register's eyebrow. Ruling 26: the poppy dot never speaks alone. */
  errorEyebrow?: string;
  /** The register's title line. */
  errorTitle?: string;
  /** The register's sentence. */
  errorBody?: React.ReactNode;
  /** The register's one next step — usually `Button variant="secondary"` (T21-3). */
  errorAction?: React.ReactNode;
  /** The words when the record exists but has nothing in it. */
  emptyLabel?: string;
  /** A control under the empty words. */
  emptyAction?: React.ReactNode;
}

/**
 * A record's overview.
 *
 * TEN STATES
 *  1. default        — the panel ground, the header band, the pairs, the
 *                      section cards, the audit footer.
 *  2. hover          — does not apply to the view, and its section cards do
 *                      not take `interactive` either: `card.tsx` states that
 *                      a card which is not a target has no hover, because a
 *                      whole page of reacting boxes is noise. The controls
 *                      inside the header and the sections carry every hover
 *                      there is.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the control's own radius. This file sets no
 *                      `overflow: hidden` anywhere, so a ring on a control at
 *                      a card's edge is never shaved.
 *  4. active/pressed — the controls'. A record is not pressed.
 *  5. disabled       — does not apply to the view, deliberately. A record the
 *                      reader may not ACT on disables its own controls — each
 *                      of which draws a fill and an ink — and keeps its values
 *                      legible. Greying a whole record hides information for
 *                      no reason, and dimming paper would be an opacity.
 *  6. loading        — `loading`: the frame stays and its parts become
 *                      `Skeleton`s. The title, the subtitle, the mark and each
 *                      section's body are placeholders; `aria-busy` is on the
 *                      root and the empty register is suppressed, because
 *                      "this record is empty" is not yet known.
 *  7. empty          — a record with no pairs, no sections and no children:
 *                      `.kw-empty`, the centred register, INSIDE the frame so
 *                      the header still says which record is empty.
 *  8. error          — `error`: `.kw-register`, the left-aligned panel card —
 *                      a 7 poppy dot, its eyebrow, a title, a sentence and one
 *                      next step. Announced as an alert. It replaces the view,
 *                      because a record that could not be read has no header
 *                      to show either.
 *  9. selected       — does not apply. A detail view is the thing that was
 *                      selected; there is nothing further to choose here.
 * 10. read-only      — ALWAYS. This component displays a record. Editing one
 *                      is `Form`, which is a different component on purpose,
 *                      and a call site puts it in a section's `content` or
 *                      behind a control in `actions`.
 *
 * THREE BREAKPOINTS
 *  mobile   — ONE column. Every section, aside or not, is full width and
 *             reads in order. The header band stays a ROW — the 48 mark plus
 *             a name fits at 320 and stacking it would waste the only width
 *             there is — but the actions WRAP below the name rather than
 *             squeezing beside it. The panel inset is 24.
 *  tablet   — still one column, and this is a decision rather than an
 *             oversight: two columns of record at 48rem gives each about
 *             22rem, which is narrower than the 40ch a paragraph wants. What
 *             tablet gets instead is the header's pairs going to two columns,
 *             which `DescriptionList` does at exactly this width.
 *  desktop  — TWO columns from 64rem, in a 2:1 ratio: the main sections and
 *             the aside. A ratio rather than a measure, so nothing invents a
 *             sidebar width the kit never states (GAPS-COL2 DVW-1). The panel
 *             inset grows to 32, which is the top of the kit's own stated
 *             24–32 range for a card inset.
 *
 * RTL — safe. The grid is on the inline axis and follows the document
 * direction; every inset is `px-*` / `p-*`; the mark leads because it is the
 * first child, not because it is placed at a side. Nothing writes `left`,
 * `right`, `pl-*` or `pr-*`.
 */
const DetailView = React.forwardRef<HTMLDivElement, DetailViewProps>(
  (
    {
      className,
      title,
      subtitle,
      meta,
      initials,
      avatarSrc,
      avatarFallback,
      avatarVariant = "default",
      badges,
      actions,
      progress,
      notice,
      items,
      itemsLayout = "grid",
      density = "default",
      sections,
      children,
      footer,
      ground = "panel",
      loading = false,
      error = false,
      errorEyebrow = "Load failed",
      errorTitle = "This record could not be read",
      errorBody,
      errorAction,
      emptyLabel = "Nothing recorded yet",
      emptyAction,
      ...props
    },
    ref,
  ) => {
    if (error) {
      return (
        <CollectionRegister
          variant="block"
          tone="error"
          role="alert"
          eyebrow={errorEyebrow}
          title={errorTitle}
          body={errorBody}
          actions={errorAction}
        />
      );
    }

    const all = sections ?? [];
    const main = all.filter((section) => section.aside !== true);
    const side = all.filter((section) => section.aside === true);

    const hasBody =
      main.length > 0 || side.length > 0 || React.Children.count(children) > 0;
    const hasPairs = (items?.length ?? 0) > 0;
    const isEmpty = !loading && !hasBody && !hasPairs;

    const hasMark =
      initials !== undefined || avatarSrc !== undefined || avatarFallback !== undefined;

    return (
      <div
        ref={ref}
        data-slot="detail-view"
        data-ground={ground}
        aria-busy={loading || undefined}
        className={cn(
          "flex min-w-0 flex-col gap-[var(--space-6)]",
          // PATTERN §11: the region that CONTAINS cards takes the panel tone,
          // or the cards vanish in light. The inset is the kit's own 24–32
          // card range, read as 24 up to 64rem and 32 above it — the same
          // reading `card.tsx` makes for its own inset.
          ground === "panel" &&
            "rounded-[var(--radius)] bg-surface-panel p-[var(--space-6)] lg:p-[var(--space-7)]",
          className,
        )}
        {...props}
      >
        {/* THE HEADER BAND — `.kw-accountcard` / `.kw-stagehero`. */}
        {title !== undefined ||
        subtitle !== undefined ||
        meta !== undefined ||
        hasMark ||
        badges !== undefined ||
        actions !== undefined ||
        progress !== undefined ? (
          <header data-slot="detail-view-header" className="flex min-w-0 flex-col gap-3">
            {/* `.kw-accountcard__id` — a row at --space-3. The actions wrap
                below at mobile rather than squeezing beside the name. */}
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              {hasMark ? (
                <Avatar size="lg" shape="pill" variant={avatarVariant} aria-hidden="true">
                  {avatarSrc !== undefined ? <AvatarImage src={avatarSrc} alt="" /> : null}
                  <AvatarFallback>
                    {avatarFallback ?? initials ?? (typeof title === "string" ? initialsOf(title) : "")}
                  </AvatarFallback>
                </Avatar>
              ) : null}

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {loading ? (
                  <Skeleton className="h-5 w-1/2" />
                ) : title !== undefined && title !== null ? (
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Headline as="h2" size="h2" className="min-w-0">
                      {title}
                    </Headline>
                    {badges}
                  </div>
                ) : null}

                {loading ? (
                  <Skeleton className="w-1/3" announce={false} />
                ) : subtitle !== undefined && subtitle !== null ? (
                  <Hint as="div">{subtitle}</Hint>
                ) : null}
              </div>

              {actions !== undefined && actions !== null ? (
                <div className="flex min-w-0 flex-wrap items-center gap-3">{actions}</div>
              ) : null}
            </div>

            {meta !== undefined && meta !== null && !loading ? (
              /* `.kw-stagehero__meta` — caption in tertiary ink. */
              <Hint as="div" className="min-w-0">
                {meta}
              </Hint>
            ) : null}

            {progress}
            {notice}
          </header>
        ) : null}

        {/* The record's own pairs, under the header and above the sections.
            `DescriptionList` owns the whole drawing. */}
        {hasPairs || loading ? (
          <DescriptionList
            items={items}
            layout={itemsLayout}
            density={density}
            loading={loading}
            hideWhenEmpty
          />
        ) : null}

        {isEmpty ? (
          <EmptyRegister>
            <span role="status">{emptyLabel}</span>
            {emptyAction}
          </EmptyRegister>
        ) : null}

        {/* THE BODY. One column up to 64rem; a 2:1 pair above it. A ratio, not
            a measure — the kit states no sidebar width (GAPS-COL2 DVW-1). */}
        {hasBody || loading ? (
          <div
            data-slot="detail-view-body"
            className={cn(
              "grid min-w-0 grid-cols-1 gap-[var(--space-6)]",
              side.length > 0 && "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
            )}
          >
            <div className="flex min-w-0 flex-col gap-[var(--space-6)]">
              {loading && main.length === 0 ? (
                <Card>
                  <CardContent>
                    <Skeleton variant="text" lines={3} />
                  </CardContent>
                </Card>
              ) : null}
              {main.map((section) => (
                <Section key={section.id} section={section} density={density} loading={loading} />
              ))}
              {children}
            </div>

            {side.length > 0 ? (
              <div className="flex min-w-0 flex-col gap-[var(--space-6)]">
                {side.map((section) => (
                  <Section key={section.id} section={section} density={density} loading={loading} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {footer !== undefined && footer !== null ? (
          /* The audit line. One hairline above it and the caption step in
             tertiary ink — the kit's own treatment for a timestamp. */
          <footer data-slot="detail-view-footer" className="shadow-[var(--hairline-over)] pt-4">
            <Hint as="div" numeric>
              {footer}
            </Hint>
          </footer>
        ) : null}
      </div>
    );
  },
);

DetailView.displayName = "DetailView";

/* ----------------------------------------------------------------------------
   One section. Local: a section outside the view that lays out its columns is
   just a `Card`, which the call site already has.

   Everything visible here is `card.tsx`'s: the 24 radius, the `--card` fill,
   the header's inset, the title's step, the description's ink. This function
   only decides WHICH parts to render.
   ------------------------------------------------------------------------- */
function Section({
  section,
  density,
  loading,
}: {
  section: DetailViewSection;
  density: "default" | "dense";
  loading: boolean;
}) {
  const hasHead =
    section.title !== undefined ||
    section.description !== undefined ||
    section.action !== undefined;

  return (
    <Card id={section.id} data-slot="detail-view-section">
      {hasHead ? (
        <CardHeader>
          <div className="flex min-w-0 flex-wrap items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {section.title !== undefined ? <CardTitle>{section.title}</CardTitle> : null}
              {section.description !== undefined ? (
                <CardDescription>{section.description}</CardDescription>
              ) : null}
            </div>
            {section.action}
          </div>
        </CardHeader>
      ) : null}

      <CardContent>
        {loading ? (
          <Skeleton variant="text" lines={3} announce={false} />
        ) : (
          <div className="flex min-w-0 flex-col gap-4">
            {section.items !== undefined && section.items.length > 0 ? (
              <DescriptionList items={section.items} density={density} hideWhenEmpty />
            ) : null}
            {section.content}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { DetailView };
