/* ============================================================================
   ScreenRenderer — a whole screen drawn from a declarative recipe
   (17 direct call sites, the most-called collection in the system).

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" → chapter 19 "Collection views" and chapter 27
   "Compositions". Three quotes carry the whole design and each is verbatim:

     ch19, the chapter's own contract line:
       "Every view carries the same contract: search, filters, three actions,
        view switch. Only the body below the toolbar changes."

     ch27 · Law 1 · One spine:
       "Rail, then header band, then one body column. 208px rail of soft
        paper, a header that carries eyebrow, title and actions, a body of
        cards on off-beige. No screen invents a second spine — no page-level
        split panes, no floating action bars."

     ch27 · Law 4 · A state is a body swap:
       "Loading, empty and archived are the same composition with the body
        replaced; adding, editing and denial are the same composition with a
        layer over it. Either way the rail, header and tabs stay drawn and
        stay put. Only a whole-page failure is allowed to replace the frame."

   ch27.1, the screen every other screen is measured against, states the
   region ORDER outright: "Figures → tabs → toolbar → rows → pager".

   Chapter 21's registers (`.kw-register` in
   design-mothership/specimens/kwapso-patterns.css) and `.kw-empty` in
   kwapso-ui.css are what a swapped body is swapped FOR, and they are drawn
   here as `ScreenRegister`.

   THE LAW THIS FILE OBEYS
   · ONE SPINE. There is no `aside`, no split pane and no second column at
     any width. Law 1 forbids it in those words, so the recipe has no way to
     express one and a call site cannot accidentally build one.
   · A STATE IS A BODY SWAP. `state` replaces `body` and NOTHING else: the
     header band, the hero, the tab strip, the toolbar and the footer all
     stay drawn and stay put. `fatal` is the single exception the law names
     (ch27.19, a signed-out session) and it is opt-in.
   · A BLOCK THE READER MAY NOT SEE RENDERS NOTHING. `visible: false` is not
     a placeholder, not a lock, not a dimmed panel — the block is absent.
     ch24.6: "Permissions HIDE actions rather than disabling them, so a
     client never sees a button they can't press."
   · THE HEADER BAND IS TRANSPARENT (ch24.6, verbatim: "The header band is
     transparent — it takes the page tone"). It paints no fill of its own.
     The BODY ground is `--surface-panel`, because it holds cards and
     PATTERN §11 rules that a card's ground is the panel tone.
   · Only four radii, no px, no hex, no font size. Every gap above 32 is a
     `--space-*` token.
   · Focus is ONE global rule (tokens.css §8). Nothing here rings anything.

   THE RECIPE, AND WHY IT IS SHAPED THIS WAY
   The commission's test is that "an engineer drops yours in and changes no
   application code", and section 11's test is that a new screen can be built
   "without asking a designer". Both point the same way: a screen must be
   describable as DATA. So:

     · Every slot that holds a COMPONENT is `ScreenBlock[]` — one uniform
       shape, `{ kind, id?, span?, visible?, props? }`.
     · Every slot that holds TEXT is a `ReactNode` — a title is a string, not
       a component, and wrapping it in a block would be ceremony.
     · `kind` is resolved through a REGISTRY, not through a switch in this
       file. That is the load-bearing decision. A switch would force this
       file to import all 26 collections, which (a) makes the most-imported
       file in the system depend on every other one, (b) breaks the moment a
       collection is added, and (c) means an application cannot add a block
       type of its own without editing library code — the exact failure
       commission §0 names. The registry is merged down the tree, so an app
       registers once at the root and every nested `ScreenRenderer` sees it.
     · `node` is a built-in kind whose `props.children` is any ReactNode. It
       is the escape hatch, so a recipe is never a cage: anything the
       registry does not know can still be dropped in, in one line.
     · An unknown `kind` renders NOTHING and warns in development. A screen
       with one mis-typed block must not become a blank page or a crash.

   THE THREE DOORS ARE ONE COMPONENT
   Commission §9 describes two doors: one dense, wide and used all day by
   staff, the other narrow, calm and larger-typed for occasional readers.
   ch27's own heading for the pair is "Two doors, one grammar". That is
   `density`, and it is the only knob: `comfortable` is the wide door at full
   width, `calm` centres a narrower column and opens the gaps one step.
   Nothing else in the drawing differs, which is what stops the two products
   reading as one screen with a different logo while keeping them one family.
   The `calm` measure is a chosen number — GAPS-COL3 SCR-2.

   RENDERING CONTEXT
   `"use client"`. Registry context, `useMemo`, and Radix Tabs underneath.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent, TabsCount } from "../tabs/tabs";
import { Badge } from "../badge/badge";
import { Title } from "../title/title";
import { Skeleton } from "../skeleton/skeleton";

/* ============================================================================
   The recipe
   ========================================================================= */

/**
 * Which body is drawn. Law 4: this swaps the BODY and nothing else.
 *
 * `empty` and `error` are deliberately separate from one another AND from a
 * filtered-out result, which ch27.22 insists on: "It is a different screen
 * from 27.21 and must never be mistaken for it: nothing here is missing,
 * something here is switched on." A call site says which by choosing the
 * register's own strings; the two registers differ in mark and in tone.
 */
export type ScreenState = "ready" | "loading" | "empty" | "error";

/** How much of the body grid a block takes. Resolved at all three widths. */
export type ScreenBlockSpan = "full" | "twoThirds" | "half" | "third";

/**
 * One thing on a screen.
 *
 * `kind` is a free string on purpose: the registry decides what exists, and
 * an application may add its own. The four built-ins are `node`, `space`,
 * `heading` and `text`; everything else comes from the registry a call site
 * supplies.
 */
export interface ScreenBlock {
  /** Looked up in the registry. Unknown kinds render nothing. */
  kind: string;
  /** React key, and the element's `id` so a tab or a stage can scroll to it. */
  id?: string;
  /** Grid span. Defaults to `full` — one body column is the law's default. */
  span?: ScreenBlockSpan;
  /**
   * The reader is allowed to see this. `false` renders NOTHING — no
   * placeholder, no lock, no dimmed panel. ch24.6: permissions hide.
   * Defaults to `true`, so a recipe that says nothing about rights shows
   * everything, and hiding is always an explicit decision.
   */
  visible?: boolean;
  /**
   * This one block is waiting / has nothing / failed, while the rest of the
   * screen is fine. Law 4 applies inside a panel exactly as it applies to a
   * screen. Undefined inherits the screen's own state.
   */
  state?: ScreenState;
  /** Handed to the registered renderer verbatim. */
  props?: Record<string, unknown>;
}

/** What a registered renderer is given besides its own block. */
export interface ScreenBlockContext {
  /** The screen's density, so a block can match it without being told twice. */
  density: ScreenDensity;
  /** The screen's state, already resolved for this block. */
  state: ScreenState;
  /** Draw a nested list of blocks — a panel that contains blocks of its own. */
  renderBlocks: (blocks: readonly ScreenBlock[] | undefined) => React.ReactNode;
}

export type ScreenBlockRenderer = (
  block: ScreenBlock,
  context: ScreenBlockContext,
) => React.ReactNode;

/** kind → how to draw it. Merged, so an app extends rather than replaces. */
export type ScreenBlockRegistry = Record<string, ScreenBlockRenderer>;

/** One tab on the strip. Mirrors `TabsViewItem` without importing its shape. */
export interface ScreenTab {
  /** Unique within the strip; also the value `onTabChange` reports. */
  value: string;
  /** What the tab says. A node, so a count can ride along. */
  label: React.ReactNode;
  /**
   * A live count beside the label, drawn by `TabsCount` — ch14's quiet
   * number here, since `ScreenRenderer` always states `variant="folder"`
   * (ruling E). Zero renders nothing.
   */
  count?: number;
  /** The tab's own body. Absent, the screen's `body` is shown for every tab. */
  body?: ScreenBlock[];
  /** Dead tab: a fill and an ink, never an opacity. `Tabs` draws it. */
  disabled?: boolean;
}

/** Wide staff screen, or the narrow calm one. §9's two doors. */
export type ScreenDensity = "comfortable" | "calm";

/**
 * The screen, as data. Every field is optional except `body`, and `body` may
 * be empty — a screen with nothing in it draws its empty register rather
 * than a hole.
 */
export interface ScreenRecipe {
  /** The micro line over the heading. Micro uppercase; `Title` draws it. */
  eyebrow?: React.ReactNode;
  /** The screen's name. Renders as the heading of the transparent band. */
  title?: React.ReactNode;
  /** The quiet line under the heading — a record's id, its owner, a date. */
  meta?: React.ReactNode;
  /**
   * The live record count. ch24.7: "count is live and abbreviates down
   * (1.3k, 1m+) · renders empty, never '0'". `Badge` already implements that
   * rule exactly, so the count is a `Badge` and nothing is re-derived here.
   */
  count?: number;
  /** A mark before the title — an `Avatar`, an icon well. */
  mark?: React.ReactNode;
  /** The controls at the inline end of the header band. */
  headerActions?: ScreenBlock[];
  /**
   * Figures. ch27.1's first region — the stat strip, a status stepper hero,
   * an identity band. Above the tab strip, per ch23 and ch27.1.
   */
  hero?: ScreenBlock[];
  /** The tab strip. Absent, no strip is drawn and `body` is the only body. */
  tabs?: ScreenTab[];
  /** Controlled tab value. */
  tab?: string;
  /** Uncontrolled starting tab. Defaults to the first item. */
  defaultTab?: string;
  /** Fires when the reader switches tabs. */
  onTabChange?: (value: string) => void;
  /**
   * ch19's one contract, in the order the kit states: "search, then facets,
   * then sort, then the live count — actions pinned right" (ch24.7). The
   * ORDER is the call site's; this row only lays them out and wraps them.
   */
  toolbar?: ScreenBlock[];
  /** THE BODY. The one region a state swap replaces. */
  body?: ScreenBlock[];
  /** The pager, or a record's audit line. Below the body, inside the panel. */
  footer?: ScreenBlock[];
  /** Which body is drawn. Law 4. */
  state?: ScreenState;
  /**
   * The whole frame is replaced, not just the body. ch27.19 is the only
   * composition allowed to do this — "a signed-out session replaces the
   * whole window, because there is nothing behind it we are allowed to
   * show". Off by default; law 4 is the rule and this is its one exception.
   */
  fatal?: boolean;
}

/* ============================================================================
   The register — what a swapped body is swapped for
   ========================================================================= */

/**
 * Which of chapter 21's registers is drawn.
 *
 * `empty` and `noResults` are DIFFERENT registers on purpose. ch27.22, on the
 * filtered-to-nothing screen: "It is a different screen from 27.21 and must
 * never be mistaken for it: nothing here is missing, something here is
 * switched on." So the two carry different marks — an inbox for a collection
 * nobody has filled, a struck-through search for one whose filters excluded
 * everything — and the caller's words say which.
 */
export type ScreenRegisterTone = "loading" | "empty" | "noResults" | "error";

export interface ScreenRegisterProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  /** Which register. `loading` draws skeleton lines, not a spinner. */
  tone?: ScreenRegisterTone;
  /**
   * CH21's own eyebrow line, above the mark and the title — SCR-4's own
   * comment below used to log this as missing; it is not, any more. Undefined
   * draws none. On `tone="error"` it is led by the 7px poppy dot
   * (`.t21-dot`, `--dot-status`), transcribed from `form.tsx`'s local
   * `Register` — the ONE place in the kit that already drew this correctly —
   * so the two do not keep two different pictures of the same chapter.
   * Ruling 26: the dot never speaks alone, so it only ever appears beside
   * these words, never on its own.
   */
  eyebrow?: React.ReactNode;
  /**
   * The mark over the title. `undefined` takes the tone's own default icon;
   * `null` draws none — a register inside a small panel is better bare.
   */
  mark?: React.ReactNode;
  /**
   * The one sentence that says what happened. Chapter 21's own instruction
   * is the chapter subtitle: "Say what happened, then the one next step."
   * No default: a component cannot know what happened, and PATTERN §7's best
   * default is no string.
   */
  title?: React.ReactNode;
  /** The line under it, at most 40ch — `.kw-register__body`'s own measure. */
  description?: React.ReactNode;
  /**
   * The one next step. ch27.21: an empty collection "is the one empty state
   * allowed to carry an action, because the action is the whole point of the
   * screen." Everything else leaves this undefined.
   */
  action?: React.ReactNode;
  /**
   * How many skeleton lines the loading register draws. ch24.4: "Two to five
   * list lines, or one block." Five is the top of the kit's own range and
   * the one that keeps a page from jumping when rows arrive.
   */
  lines?: number;
  /**
   * What a screen reader hears while the loading register is up. A prop, so
   * Arabic, Urdu and Persian are a translation rather than a fork.
   */
  loadingLabel?: string;
}

/* NO MARK. NONE OF THE THREE. GAPS-COL3 SCR-4 added an `Inbox`, a `SearchX`
   and a `TriangleAlert` at 32 on the premise that "chapter 21's page draws
   marks but the specimen set never transcribed them". Re-checked against the
   artifact TEMPLATE, which carries every inline style: that premise is
   false. Chapter 21 draws four registers and not one holds an icon — they
   hold a micro uppercase eyebrow, and the failure one puts a 7px poppy DOT
   in front of it. 27.21 and 27.22, the two in-body registers this component
   actually is, draw no eyebrow and no mark either: a 22/500 line, a 14.5
   paragraph, the action row, and nothing above them. And the ONLY
   `width="32" height="32"` icon in the whole artifact is chapter 04's
   icon-size ladder specimen.

   So the three marks were invented, and they are gone. `mark` stays a prop
   with its documented `null` / node contract, so a caller that wants one
   still passes one; what changes is that the kit no longer draws a picture
   the artifact never drew.

   THE EYEBROW HALF, CLOSED 2026-09-02. This paragraph used to end "The
   EYEBROW half of CH21's register is still missing here and needs a new
   prop, so it is logged, not smuggled in" — and that gap is exactly what the
   client meant, verbatim, weeks later and about a different symptom: "but i
   gave you a specific design inside a card, you took it only partially."
   27 call sites in the other repo were moved onto `ShapeStateBody` (which
   renders THIS component) for their load-failure state, and every one of
   them lost the eyebrow her reference card showed next to a small red dot —
   because this component never drew one. `form.tsx` had already drawn it
   correctly, transcribed straight off chapter 21, in a LOCAL `Register` of
   its own (`.t21-dot`, `--dot-status`, poppy, leading the micro uppercase
   words); it simply never reached this shared one. `eyebrow` above is that
   same recipe, moved here so the two components stop disagreeing about one
   chapter. The dot is scoped to `tone="error"` — ch21 draws it on the
   FAILURE register only; the other three carry an eyebrow with no dot. */
const REGISTER_MARK: Record<ScreenRegisterTone, React.ReactNode> = {
  loading: null,
  empty: null,
  noResults: null,
  error: null,
};

/**
 * Chapter 21's register, and the body a state swap swaps in.
 *
 * `.kw-register` is a `--surface-panel` box at radius 24 with a 32 inset;
 * `.kw-empty` is the centred column inside it at `--space-8` block padding,
 * tertiary ink, centred text. Both are drawn: the box is the panel the body
 * grid already provides, so this component draws the COLUMN and lets the
 * caller's panel be the box.
 *
 * The loading register draws SKELETON LINES, never a spinner. ch24.4:
 * "Never a spinner where a shape is known."
 *
 * TEN STATES
 *  1. default        — the centred column: mark, title, description, action.
 *  2. hover          — does not apply. A register is a statement, not a
 *                      target. Its `action` is a Button and hovers itself.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply. A register cannot be switched off; a
 *                      screen that has nothing to say does not render one.
 *  6. loading        — `tone="loading"`: skeleton lines, `aria-busy`.
 *  7. empty          — `tone="empty"`: the inbox mark and the caller's words.
 *                      A register with no title, no description and no
 *                      action renders `null` — nothing invented to fill a
 *                      hole, which is the system's rule everywhere.
 *  8. error          — `tone="error"`: the warning mark. Poppy is NOT used
 *                      for the mark: poppy means blocked, and a failed fetch
 *                      is not a blocked record. Nor is `--warning`, which
 *                      stopped being the quiet chip on 2026-09-02 and is now
 *                      the client's orange — a register is a statement, not
 *                      a chip, and this column carries no fill at all. The
 *                      mark takes tertiary ink with the rest of the column.
 *                      GAPS-COL3 SCR-4.
 *  9. selected       — does not apply.
 * 10. read-only      — always.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. A centred column at 40ch already
 *  fits 320 and does not grow past its measure on a wide screen, which is
 *  the whole reason the kit gives it a measure rather than a width.
 *
 * RTL — safe. `text-center` has no direction and every inset is logical.
 */
const ScreenRegister = React.forwardRef<HTMLDivElement, ScreenRegisterProps>(
  (
    {
      className,
      tone = "empty",
      eyebrow,
      mark,
      title,
      description,
      action,
      lines = 5,
      loadingLabel = "Loading…",
      children,
      ...props
    },
    ref,
  ) => {
    if (tone === "loading") {
      return (
        <div
          ref={ref}
          data-slot="screen-register"
          data-tone="loading"
          role="status"
          aria-busy="true"
          aria-label={loadingLabel}
          className={cn("flex w-full flex-col gap-3", className)}
          {...props}
        >
          {/* ch24.4 — list lines, not a spinner. `Skeleton` owns the pulse.
              `announce={false}`: the register above already announces, and
              two live regions saying the same thing is worse than one. */}
          <Skeleton variant="text" lines={lines} announce={false} />
          {children}
        </div>
      );
    }

    const resolvedMark = mark === undefined ? REGISTER_MARK[tone] : mark;
    const bare =
      resolvedMark === null &&
      eyebrow === undefined &&
      title === undefined &&
      description === undefined &&
      action === undefined &&
      React.Children.count(children) === 0;

    // Nothing to say: say nothing. The kit never draws an empty empty-state.
    if (bare) return null;

    return (
      <div
        ref={ref}
        data-slot="screen-register"
        data-tone={tone}
        role={tone === "error" ? "alert" : undefined}
        className={cn(
          // `.kw-empty` -- a LEFT-ALIGNED column, 48 block / 24 inline,
          // tertiary. 27.21, DEF-2: the artifact never writes `text-align`.
          /* No container gap: the title, the body and the action row each
             carry their own block-start measure (12 / 8 / 20, chapter 21's
             own), and a gap on top of those was adding a second 8 to each. */
          "flex w-full flex-col items-start text-start",
          "px-6 py-[var(--space-8)]",
          "text-sm text-ink-tertiary",
          className,
        )}
        {...props}
      >
        {eyebrow !== undefined && eyebrow !== null ? (
          /* Transcribed from `form.tsx`'s local `Register` — see the note on
             `eyebrow` above. `text-micro` sets the step, the leading and the
             tracking but not the weight, same as there. */
          <span
            data-slot="screen-register-eyebrow"
            className="inline-flex items-center gap-[var(--space-2h)]"
          >
            {tone === "error" ? (
              <span
                aria-hidden="true"
                className="size-[var(--dot-status)] shrink-0 rounded-pill bg-destructive"
              />
            ) : null}
            <span className="text-micro font-[var(--font-weight-medium)] uppercase text-ink-tertiary">
              {eyebrow}
            </span>
          </span>
        ) : null}
        {resolvedMark ? (
          <span
            data-slot="screen-register-mark"
            className={cn("text-ink-tertiary", eyebrow !== undefined && eyebrow !== null && "mt-3")}
          >
            {resolvedMark}
          </span>
        ) : null}
        {title !== undefined && title !== null ? (
          /* `.kw-register__title` — the h3 step, 12 under the mark. */
          <span
            data-slot="screen-register-title"
            className="mt-3 text-2xl font-[var(--font-weight-medium)] text-foreground"
          >
            {title}
          </span>
        ) : null}
        {description !== undefined && description !== null ? (
          /* `.kw-register__body` — caption, secondary ink, 40ch measure. */
          <span
            data-slot="screen-register-body"
            className="mt-2 max-w-[40ch] text-caption text-ink-secondary"
          >
            {description}
          </span>
        ) : null}
        {action ? (
          /* `.kw-register__row` — 20 over the row, 12 between controls. */
          <span
            data-slot="screen-register-row"
            /* `gap: 10px`, and NOT centred: the column is `items-start`
               and `justify-center` was a leftover from the centred era that
               DEF-2 retired. Chapter 21 writes no `justify-content` on any
               of its four action rows. */
            className="mt-5 flex flex-wrap items-center gap-[var(--space-2h)]"
          >
            {action}
          </span>
        ) : null}
        {children}
      </div>
    );
  },
);

ScreenRegister.displayName = "ScreenRegister";

/* ============================================================================
   The registry
   ========================================================================= */

/* The four built-ins. They exist so that a recipe is never blocked on a
   registry entry: `node` takes any JSX, `space` opens a gap, `heading` and
   `text` cover the two things a screen says in words. Nothing product-shaped
   is built in — that is what the registry is for. */
const BUILT_IN_REGISTRY: ScreenBlockRegistry = {
  /** The escape hatch. `props.children` is drawn as-is. */
  node: (block) => (block.props?.children as React.ReactNode) ?? null,
  /** A deliberate gap in the body grid, for a recipe that wants breathing. */
  space: () => <span aria-hidden="true" className="block h-6" />,
  /** A band heading inside the body. `Title` draws it, including the rule. */
  heading: (block) => (
    <Title
      as={(block.props?.as as "h2" | "h3" | "h4" | undefined) ?? "h3"}
      size={(block.props?.size as "h2" | "h3" | "h4" | undefined) ?? "h3"}
      eyebrow={block.props?.eyebrow as React.ReactNode}
      rule={(block.props?.rule as boolean | undefined) ?? true}
    >
      {block.props?.children as React.ReactNode}
    </Title>
  ),
  /** A paragraph. Caption step, secondary ink, at the body measure. */
  text: (block) => (
    <p className="max-w-[var(--measure-body)] text-caption text-ink-secondary">
      {block.props?.children as React.ReactNode}
    </p>
  ),
};

const ScreenRegistryContext = React.createContext<ScreenBlockRegistry>(BUILT_IN_REGISTRY);

export interface ScreenRegistryProviderProps {
  /** Merged over what is already in scope, so nesting extends rather than replaces. */
  registry: ScreenBlockRegistry;
  children?: React.ReactNode;
}

/**
 * Publish block kinds to every `ScreenRenderer` underneath.
 *
 * An application registers its collections once, at the root, and all 17
 * screens can then be written as data. A nested provider adds to the set
 * rather than replacing it, so a section can add a kind of its own without
 * knowing what the root registered.
 */
function ScreenRegistryProvider({ registry, children }: ScreenRegistryProviderProps) {
  const inherited = React.useContext(ScreenRegistryContext);
  const merged = React.useMemo(
    () => ({ ...inherited, ...registry }),
    [inherited, registry],
  );
  return (
    <ScreenRegistryContext.Provider value={merged}>{children}</ScreenRegistryContext.Provider>
  );
}

/** Read the block kinds in scope — for a call site building its own body. */
function useScreenRegistry(): ScreenBlockRegistry {
  return React.useContext(ScreenRegistryContext);
}

/* ============================================================================
   Geometry
   ========================================================================= */

/* The body grid. Six columns at `lg:` so halves and thirds can share a row;
   two at `md:`; one on a phone. Every span is stated at all three widths so
   nothing is left to a default. */
const SPAN_CLASSES: Record<ScreenBlockSpan, string> = {
  full: "col-span-1 md:col-span-2 lg:col-span-6",
  twoThirds: "col-span-1 md:col-span-2 lg:col-span-4",
  half: "col-span-1 md:col-span-1 lg:col-span-3",
  third: "col-span-1 md:col-span-1 lg:col-span-2",
};

const DENSITY_SHELL: Record<ScreenDensity, string> = {
  /** The staff screen: full width, the kit's page inset. */
  comfortable: "gap-6",
  /**
   * The portal: a centred column and one step more air. 60rem is a CHOSEN
   * number — the kit gives the wide shell 1240 and gives the narrow one only
   * the word "narrow" (GAPS-COL3 SCR-2).
   */
  calm: "gap-[var(--space-7)] mx-auto w-full max-w-[60rem]",
};

const DENSITY_BODY_GAP: Record<ScreenDensity, string> = {
  /* 16. The two chapters that draw this column draw it at 16 (27.12) and 18
     (27.30); neither draws 12. `--space-4` is the step they land on. The
     calm door's 24 is a chosen number and stays. */
  comfortable: "gap-4",
  calm: "gap-6",
};

/* ============================================================================
   ScreenRenderer
   ========================================================================= */

export interface ScreenRendererProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title" | "children">,
    ScreenRecipe {
  /**
   * Extra block kinds for this screen and everything nested inside it.
   * Merged over the registry already in scope; a `ScreenRegistryProvider` at
   * the application root is the usual place to put the permanent set.
   */
  registry?: ScreenBlockRegistry;
  /** Which door. `comfortable` is the staff screen; `calm` is the portal. */
  density?: ScreenDensity;
  /**
   * Classes for the body region only — the one region a state swap replaces.
   */
  bodyClassName?: string;
  /** The loading register's announced string. */
  loadingLabel?: string;
  /** The empty register's sentence. Undefined draws the mark alone. */
  emptyTitle?: React.ReactNode;
  /** The line under it. */
  emptyDescription?: React.ReactNode;
  /** ch27.21's one permitted action on an empty state. */
  emptyAction?: React.ReactNode;
  /**
   * Which empty register. `empty` is ch27.21 — nobody has added a record
   * yet. `noResults` is ch27.22 — records exist and the filters excluded
   * them all, "a different screen … and it must never be mistaken for it".
   */
  emptyTone?: "empty" | "noResults";
  /** The error register's sentence. */
  errorTitle?: React.ReactNode;
  /** The line under it — chapter 21: "say what happened, then the one next step". */
  errorDescription?: React.ReactNode;
  /** The retry, usually. */
  errorAction?: React.ReactNode;
  /** How many skeleton lines the loading body draws. */
  loadingLines?: number;
  /**
   * The accessible name of the tab strip. Undefined leaves it unnamed, which
   * is right when the header band's heading already names the screen and the
   * call site wires `aria-labelledby` — so nothing is hardcoded here.
   */
  tabsLabel?: string;
  /**
   * Called with the `kind` of a block no registered renderer matches. The
   * block draws nothing either way; this only lets an application log the
   * recipe bug through its own channel. Absent, an unknown block is silent.
   */
  onUnknownBlock?: (kind: string) => void;
}

/**
 * A whole screen, from data.
 *
 * TEN STATES
 *  1. default        — `state="ready"`: header band, hero, tab strip,
 *                      toolbar, the body's blocks, footer.
 *  2. hover          — does not apply to the frame. Every hover on a screen
 *                      belongs to a control or a row inside it, and each of
 *                      those carries its own named token. A frame that
 *                      responded to the pointer would light up on every
 *                      mouse move.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *                      Nothing in this file sets `overflow: hidden`, so a
 *                      ring inside the body is never shaved; the ONE
 *                      scrolling box is the tab strip, and `TabsList` already
 *                      carries the scroll padding that keeps its ring whole.
 *  4. active/pressed — does not apply, for the same reason as hover.
 *  5. disabled       — does not apply to a screen. A screen a reader may not
 *                      open is not disabled, it is not rendered: ch24.6 says
 *                      permissions HIDE. A single block hides with
 *                      `visible: false`, and a whole screen is the router's
 *                      decision, not this component's.
 *  6. loading        — `state="loading"`: LAW 4. The body is replaced with
 *                      skeleton lines and everything else stays exactly where
 *                      it was, so the page is never seen to be built twice
 *                      (ch27.6: "the destination screen with its body
 *                      unfilled").
 *  7. empty          — `state="empty"`: the body is replaced with chapter
 *                      21's register. The frame stays (ch27.21). A screen
 *                      whose `body` array is empty resolves to this by
 *                      itself, so a recipe cannot render a hole by accident.
 *  8. error          — `state="error"`: the register in its error tone,
 *                      `role="alert"`. `fatal` is the one case that replaces
 *                      the frame instead (ch27.19), and it is opt-in.
 *  9. selected       — the selected TAB, owned by `Tabs`. A screen itself is
 *                      never selected.
 * 10. read-only      — always. A screen holds no value; the fields inside it
 *                      do, and each carries its own read-only skin.
 *
 * THREE BREAKPOINTS
 *  mobile  — one body column. The header band wraps its actions under the
 *            heading (`Title` does this itself). The toolbar wraps. The tab
 *            strip SCROLLS on the inline axis rather than wrapping —
 *            `TabsList`'s own answer, and the right one here because a
 *            two-line strip stops reading as one row of peers.
 *  tablet  — two body columns from `md:` (48rem), so a pair of half-width
 *            panels sits side by side. Everything else is unchanged.
 *  desktop — six body columns from `lg:` (64rem), which is what lets thirds
 *            and halves share a row. In `density="calm"` the whole shell is
 *            centred at 60rem instead of filling the width, which is the
 *            only geometric difference between the two doors.
 *  At no width does a second spine appear — law 1 — and at no width does a
 *  region move to another region. What changes is column count and wrapping.
 *
 * RTL — safe. Every inset is logical, the grid mirrors on its own, the
 * header band's actions are pushed by `Title`'s `ms-auto`, and the tab
 * strip's indicator is measured against the computed direction inside
 * `Tabs`. Nothing in this file names an inline side.
 */
const ScreenRenderer = React.forwardRef<HTMLDivElement, ScreenRendererProps>(
  (
    {
      className,
      registry,
      density = "comfortable",
      eyebrow,
      title,
      meta,
      count,
      mark,
      headerActions,
      hero,
      tabs,
      tab,
      defaultTab,
      onTabChange,
      toolbar,
      body,
      footer,
      state = "ready",
      fatal = false,
      bodyClassName,
      loadingLabel = "Loading…",
      emptyTitle,
      emptyDescription,
      emptyAction,
      emptyTone = "empty",
      errorTitle,
      errorDescription,
      errorAction,
      loadingLines = 5,
      tabsLabel,
      onUnknownBlock,
      ...props
    },
    ref,
  ) => {
    const inherited = React.useContext(ScreenRegistryContext);
    const resolvedRegistry = React.useMemo(
      () => (registry ? { ...inherited, ...registry } : inherited),
      [inherited, registry],
    );

    /* One renderer, used by every region and handed to every block so a
       panel can draw blocks of its own. Kept in a callback because the
       registry is the only thing it closes over that can change. */
    const renderOne = React.useCallback(
      (block: ScreenBlock, index: number, inheritedState: ScreenState): React.ReactNode => {
        // A block the reader may not see renders NOTHING. Not a placeholder.
        if (block.visible === false) return null;

        const draw = resolvedRegistry[block.kind];
        if (!draw) {
          /* An unknown kind is a recipe bug, not a reason to blank the
             screen or to throw. Draw nothing and hand the kind to whoever
             asked to be told — this file reports through a callback rather
             than `console`, because a library has no business choosing an
             application's logging channel or reading its build environment. */
          onUnknownBlock?.(block.kind);
          return null;
        }

        const blockState = block.state ?? inheritedState;
        const context: ScreenBlockContext = {
          density,
          state: blockState,
          renderBlocks: (nested) => renderMany(nested, blockState),
        };

        return (
          <div
            key={block.id ?? `${block.kind}-${index}`}
            id={block.id}
            data-slot="screen-block"
            data-kind={block.kind}
            className={cn("min-w-0", SPAN_CLASSES[block.span ?? "full"])}
          >
            {draw(block, context)}
          </div>
        );
      },
      // `renderMany` is declared below; it is only ever CALLED after both
      // callbacks exist, so the forward reference is safe and keeps the two
      // out of a dependency cycle.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [resolvedRegistry, density, onUnknownBlock],
    );

    const renderMany = React.useCallback(
      (blocks: readonly ScreenBlock[] | undefined, inheritedState: ScreenState) => {
        if (!blocks || blocks.length === 0) return null;
        return blocks.map((block, index) => renderOne(block, index, inheritedState));
      },
      [renderOne],
    );

    /* A region that is not the body never takes the screen's state: law 4
       says the header, the hero and the tabs "stay drawn and stay put". They
       are drawn as `ready` even while the body waits. */
    const chrome = (blocks: readonly ScreenBlock[] | undefined) => renderMany(blocks, "ready");

    /* Whether the body has anything in it decides `empty` on its own, so a
       recipe that forgets to set the state still cannot render a hole. */
    const resolvedState: ScreenState =
      state === "ready" && (!body || body.length === 0) && !tabs ? "empty" : state;

    const registerFor = (tone: ScreenRegisterTone) =>
      tone === "loading" ? (
        <ScreenRegister tone="loading" lines={loadingLines} loadingLabel={loadingLabel} />
      ) : tone === "error" ? (
        <ScreenRegister
          tone="error"
          title={errorTitle}
          description={errorDescription}
          action={errorAction}
        />
      ) : (
        <ScreenRegister
          tone={emptyTone}
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      );

    /* ---- The one exception to law 4. ---------------------------------- */
    if (fatal) {
      return (
        <ScreenRegistryContext.Provider value={resolvedRegistry}>
          <div
            ref={ref}
            data-slot="screen-renderer"
            data-state="fatal"
            data-density={density}
            className={cn(
              "flex min-h-full w-full items-center justify-center bg-background p-6",
              className,
            )}
            {...props}
          >
            <div className="w-full max-w-[40rem] rounded-[var(--radius)] bg-surface-panel p-[var(--space-7)]">
              <ScreenRegister
                tone="error"
                title={errorTitle}
                description={errorDescription}
                action={errorAction}
              />
            </div>
          </div>
        </ScreenRegistryContext.Provider>
      );
    }

    /* ---- The body, drawn once and reused by every tab that has none. --- */
    const bodyGrid = (blocks: readonly ScreenBlock[] | undefined, forState: ScreenState) => (
      <div
        data-slot="screen-body"
        data-state={forState}
        className={cn(
          "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6",
          DENSITY_BODY_GAP[density],
          bodyClassName,
        )}
      >
        {forState === "ready" ? (
          renderMany(blocks, "ready")
        ) : (
          <div className={SPAN_CLASSES.full}>{registerFor(forState)}</div>
        )}
      </div>
    );

    const hasHeader =
      eyebrow !== undefined ||
      title !== undefined ||
      meta !== undefined ||
      mark !== undefined ||
      (headerActions && headerActions.length > 0) ||
      count !== undefined;

    return (
      <ScreenRegistryContext.Provider value={resolvedRegistry}>
        <div
          ref={ref}
          data-slot="screen-renderer"
          data-state={resolvedState}
          data-density={density}
          className={cn("flex w-full flex-col", DENSITY_SHELL[density], className)}
          {...props}
        >
          {/* ---- The header band. TRANSPARENT: it takes the page tone. --- */}
          {hasHeader ? (
            <div
              data-slot="screen-header"
              className="flex items-start gap-[var(--space-3h)]"
            >
              {mark ? <span className="flex-none pt-1">{mark}</span> : null}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Title
                  as="h1"
                  size={density === "calm" ? "h3" : "h2"}
                  rule={false}
                  eyebrow={
                    eyebrow !== undefined || count !== undefined ? (
                      <>
                        {eyebrow}
                        {/* Live, abbreviating, empty at zero — `Badge`'s law. */}
                        <Badge count={count} className="ms-2 align-middle" />
                      </>
                    ) : undefined
                  }
                  actions={chrome(headerActions)}
                >
                  {title}
                </Title>
                {meta !== undefined && meta !== null ? (
                  <span
                    data-slot="screen-meta"
                    className="text-badge tabular-nums text-ink-tertiary"
                  >
                    {meta}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* ---- Figures. ch27.1's first region, above the strip. -------- */}
          {hero && hero.length > 0 ? (
            <div
              data-slot="screen-hero"
              className={cn(
                "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6",
                DENSITY_BODY_GAP[density],
              )}
            >
              {chrome(hero)}
            </div>
          ) : null}

          {/* ---- Tabs → toolbar → body → footer. -------------------------
              CLIENT RULING E, 2026-08-22: "folder tabs are for main screens,
              line tabs for detail screens." ScreenRenderer draws ch19
              COLLECTION VIEWS ONLY — the toolbar contract quoted at the top
              of this file (search, filters, actions, view switch) is the
              main-screen contract, and this component has no record/detail
              mode at all. So `folder` is stated here rather than left to
              `Tabs`'s own generic default, which is `line` (right for the
              majority of `Tabs` consumers, wrong for this one). Leaving it
              unstated was the exact regression `CollectionFrame` already
              closed for itself — see that file's `tabsVariant` default. */}
          {tabs && tabs.length > 0 ? (
            <Tabs
              variant="folder"
              value={tab}
              defaultValue={defaultTab ?? tabs[0].value}
              onValueChange={onTabChange}
              className="gap-[var(--space-3h)]"
            >
              <TabsList aria-label={tabsLabel}>
                {tabs.map((item) => (
                  <TabsTrigger key={item.value} value={item.value} disabled={item.disabled}>
                    {item.label}
                    {/* FIX, matching the bug override 45 already fixed once
                        in `CollectionFrame`: this strip is always
                        `variant="folder"` (see the block above), and ch14's
                        "counts are quiet, never badges" forbids the `Badge`
                        chip that used to sit here. `TabsCount` draws the
                        quiet number for the resolved variant on its own. */}
                    <TabsCount count={item.count} />
                  </TabsTrigger>
                ))}
              </TabsList>

              {toolbar && toolbar.length > 0 ? (
                <div
                  data-slot="screen-toolbar"
                  className="flex flex-wrap items-center gap-3"
                >
                  {chrome(toolbar)}
                </div>
              ) : null}

              {tabs.map((item) => (
                <TabsContent key={item.value} value={item.value}>
                  {bodyGrid(item.body ?? body, resolvedState)}
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <>
              {toolbar && toolbar.length > 0 ? (
                <div
                  data-slot="screen-toolbar"
                  className="flex flex-wrap items-center gap-3"
                >
                  {chrome(toolbar)}
                </div>
              ) : null}
              {bodyGrid(body, resolvedState)}
            </>
          )}

          {/* ---- The pager, or a record's audit line. -------------------- */}
          {footer && footer.length > 0 ? (
            <div
              data-slot="screen-footer"
              className="flex flex-wrap items-center gap-3"
            >
              {chrome(footer)}
            </div>
          ) : null}
        </div>
      </ScreenRegistryContext.Provider>
    );
  },
);

ScreenRenderer.displayName = "ScreenRenderer";

export {
  ScreenRenderer,
  ScreenRegister,
  ScreenRegistryProvider,
  useScreenRegistry,
  BUILT_IN_REGISTRY as screenBuiltInRegistry,
};
