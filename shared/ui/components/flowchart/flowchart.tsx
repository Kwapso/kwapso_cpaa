"use client";

/* ============================================================================
   Flowchart — collection view 23, "nodes and arrows, branches where a
   decision splits it" (0 direct call sites; a body swap for
   `CollectionFrame`, and the tree `Flowdetail` puts a panel beside).

   DESIGN SOURCE
   Kit chapter 19 ("Collection views"), view 23, read out of
   `Design Mothership/kit-current/Kwapso UI Kit.dc.html`. The chapter's own
   line for it, verbatim from the view table:

       flowchart · "Nodes and arrows, branches where a decision splits it"
                 · fits "Processes, approval paths, audit logic"
                 · switch label "Flow"

   and view 24 beside it, which this file also draws (see `density`):

       flowdetail · "Same tree, click a step for its full record"
                  · fits "Process documentation, training, handover"
                  · switch label "Detail"

   THE DRAWING, transcribed
     · the tree   — a centred column: chain node, 1px connector, chain node,
                    connector, DECISION, connector, a fork rail, a row of
                    branches, an elbow that re-centres one branch onto the
                    trunk, the trunk again, a second DECISION, a second fork,
                    a second row of branches with their own sub-chains
     · a node     — radius 24, `padding: 12px 18px` on the trunk and
                    `12px 14px` in a branch, `max-width: 200px`, centred text,
                    the kind glyph at 12 beside a 13/500 label, the role at 11
                    under it
     · a decision — a `96x96` box holding a `68x68` square at `top: 14px;
                    left: 14px`, `transform: rotate(45deg)`,
                    `border-radius: 4px` — RULING 03's third exception, by
                    name: "a diamond is a rotated square that needs its
                    corner". The label and glyph sit unrotated over it.
     · a connector— `width: 1px; height: 22-24px; background: var(--hair2)`
     · a fork     — a 20-tall rail: one horizontal 1px line spanning the outer
                    branch centres and one 1px drop per branch
     · an elbow   — 38 tall: a drop from the continuing branch, a horizontal
                    run back to the centre, a drop onto the trunk
     · the legend — sticky at the foot, pushed to the inline end, the three
                    kind glyphs then the four node fills, on
                    `inset 0 1px 0 rgba(26,25,24,.10)`

   RULING 03, THE THIRD EXCEPTION
   "24px on every box, 999px on every pill, 6px on marks and selection
   controls, 4px on a bar, a heat cell or the rotated decision node — a bar is
   not a box, and a diamond is a rotated square that needs its corner."
   The diamond here is the only 4 in this file. Every other box is 24.

   COMPOSE, DO NOT REBUILD
   A node is a `Card`, in one of the four fills the artifact draws, mapped
   one for one onto variants that already exist:
     `var(--card)` -> `raised` · `var(--mango)` -> `brand` ·
     `var(--inv)`  -> `inverse` · `var(--idle)` -> a removed step, which is
     the one fill `Card` has no variant for and is drawn here as
     `bg-surface-idle` on a plain box (GAPS-TRACK2B FLW-3).
   No `border` anywhere: the connectors are 1px FILLS, which is what the
   artifact draws, and the pending legend swatch takes `--hairline`.

   THE GLYPHS ARE SUBSTITUTIONS
   The artifact draws three bespoke marks — a cursor for manual, a gear for
   auto, a four-point star for AI. The delivered icon set has `UserRound`,
   `Settings` and `Sparkles` and no cursor; the substitution is logged as
   GAPS-TRACK2B FLW-1 and every glyph is overridable per node by a prop.

   RENDERING CONTEXT
   `"use client"` — with `onSelect` this module creates an event handler
   during its own render (PATTERN §8).
   ========================================================================= */

import * as React from "react";

import { cn } from "../../lib/utils";
import { Card } from "../card/card";
import { Skeleton } from "../skeleton/skeleton";
import {
  Gear,
  Sparkle,
  User,
} from "../../foundations/icons";
import { CollectionRegister } from "../collection-frame/collection-frame";

/* ----------------------------------------------------------------------------
   The vocabulary. All four fills and all three actors are the artifact's own
   words, taken from its legend: Manual · Auto · AI · Removed · Pending ·
   Decision · Done.
   ------------------------------------------------------------------------- */

/** Who does the step. The artifact's three, and its legend names them. */
export type FlowKind = "manual" | "auto" | "ai";

/**
 * The step's fill, in the artifact's own legend words:
 *   `pending`  — the paper node, a step not yet reached
 *   `done`     — the charcoal node
 *   `decision` — mango, and only a decision takes it (one accent, one meaning)
 *   `removed`  — the quiet well, "legacy path, no longer used"
 */
export type FlowTone = "pending" | "done" | "decision" | "removed";

/** The fill -> the `Card` variant that already draws it, where one exists. */
const TONE_VARIANT = {
  pending: "raised",
  done: "inverse",
  decision: "brand",
  /* No `Card` variant is the idle well; drawn here and logged as FLW-3. */
  removed: "default",
} as const;

/** The quiet step's fill and ink, which `Card` has no variant for. */
const REMOVED_FILL = "bg-surface-idle text-ink-tertiary";

/**
 * The role line's ink, one entry per tone. RULED M2, 2026-08-23,
 * verify/decisions.html M.
 *
 * The artifact quietens the role with `opacity: .65`, which PATTERN 9
 * rejects. On the two paper fills the tertiary tier was already the same
 * intent expressed as an ink. On mango and charcoal there was NO quieter tier
 * at all - the accent law puts charcoal on mango and named nothing under it -
 * so those two roles printed at full strength and the label and the role read
 * as equals. `--ink-on-accent-secondary` and `--ink-on-inverse-secondary` now
 * exist for exactly this. Asked as GAPS-TRACK2B FLW-5.
 */
const ROLE_INK = {
  pending: "text-ink-tertiary",
  removed: "text-ink-tertiary",
  decision: "text-ink-on-accent-secondary",
  done: "text-ink-on-inverse-secondary",
} as const;

const KIND_ICON = {
  manual: User,
  auto: Gear,
  ai: Sparkle,
} as const;

export interface FlowNode {
  /**
   * React key, and the id `onSelect` reports. Required: a tree is re-read
   * from its process definition constantly and a positional key would carry
   * the wrong step's selection.
   */
  id: string;
  /** The step, in words. The 13/500 line. */
  label: React.ReactNode;
  /** Who does it — the quiet line under the label. */
  role?: React.ReactNode;
  /** Which glyph rides beside the label. No kind draws no glyph. */
  kind?: FlowKind;
  /** Which fill the node takes. */
  tone?: FlowTone;
  /**
   * The 10px line ABOVE a branch node — the artifact's "Score above 82%",
   * "Partial availability". Drawn only inside a branch, which is the only
   * place the artifact draws it.
   */
  condition?: React.ReactNode;
  /** A glyph of the call site's own, in place of the kind's. */
  icon?: React.ReactNode;
  /**
   * The id of an EARLIER node this step sends the work back to. Drawn as a
   * dashed return line up the left margin, one lane per loop, with an
   * arrowhead where it lands — the quiet cue that a reader can follow with a
   * finger. The words on the node ("sends it back to step 3") stay the call
   * site's own; the line never replaces the sentence.
   */
  loopTo?: string;
}

export interface FlowBranch {
  /** The branch's head — the node hanging off the fork. */
  node: FlowNode;
  /** Steps below it, stacked with a connector between each. */
  chain?: FlowNode[];
  /**
   * This fork RE-JOINS the trunk below it. Marking ANY branch draws the
   * rejoin, and the rejoin gathers EVERY branch: each column drops a rail to
   * one horizontal run, and one centre drop carries on to the trunk — the
   * mirror of the fork above. (It was one elbow from one branch, and the owner
   * read it as only that branch continuing: "if it's a join, then both splits
   * … should be drawn from all of them", 25 Aug 2026.) A fork whose ways never
   * meet again marks none.
   */
  continues?: boolean;
}

/**
 * One band of the tree, top to bottom. A `decision` is the rotated node and
 * everything else is a box; a `branch` is the fork and the row under it.
 */
export type FlowStep =
  | { type: "node"; node: FlowNode }
  | { type: "decision"; node: FlowNode }
  | { type: "branch"; branches: FlowBranch[] };

export interface FlowchartProps extends Omit<React.ComponentPropsWithoutRef<"div">, "onSelect"> {
  /** The tree, top to bottom. This view never re-orders it. */
  steps?: FlowStep[];

  /**
   * `default` is view 23's drawing — 200-wide nodes, a 96 decision, the kind
   * glyph on every node and the role under it. `compact` is view 24's, which
   * is the same tree at the density that leaves room for the step panel
   * beside it. Both are drawn; there is no third.
   */
  density?: "default" | "compact";
  /**
   * The narrowest a branch column may be drawn before the tree scrolls
   * sideways instead of squeezing. A node's label plus its condition line
   * need about this much before both wrap to three lines. rem only.
   */
  branchMinWidth?: string;

  /** Which step is selected. Drawn as the ink ring the artifact draws. */
  selectedId?: string;
  /** Pressing a node reports its id. Given, every node becomes a real button. */
  onSelect?: (id: string) => void;

  /** Whether the legend is drawn at the foot. The artifact draws it. */
  legend?: boolean;
  /** The three actor words, in legend order. */
  kindLabels?: { manual: string; auto: string; ai: string };
  /** The four fill words, in legend order. */
  toneLabels?: { removed: string; pending: string; decision: string; done: string };

  /** Accessible name for the tree as a whole. */
  label?: string;

  /** The tree has not arrived. Cold cache only. */
  loading?: boolean;
  /** The request failed. Beats `empty`. */
  error?: boolean;
  /** Force the empty register even with steps present. */
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


/* ----------------------------------------------------------------------------
   The RETURN LINES. A step that sends the work back says so in words on its
   own face (the call site's sentence); this layer adds the line a finger can
   follow — dashed, up the left margin, one lane per loop so two loops never
   share a rail, an arrowhead where the work lands. Measured off the DOM after
   layout (the tree is DOM, not SVG, so the only honest geometry is the
   browser's own), re-measured whenever the tree resizes, and drawn in
   ink-tertiary at 1px dashed — quieter than a node, louder than a hairline.
   ------------------------------------------------------------------------- */
type LoopPath = { d: string; arrow: string; key: string };

function measureLoops(
  container: HTMLElement,
  loops: { from: string; to: string }[],
): LoopPath[] {
  const box = container.getBoundingClientRect();
  const rectOf = (id: string) => {
    const el = container.querySelector(`[data-flow-id="${CSS.escape(id)}"]`);
    return el ? el.getBoundingClientRect() : null;
  };
  /* Outer loops take the outer lanes: sort by the vertical span they cover so
     a loop nested inside another never crosses it. */
  const measured = loops
    .map((l, i) => {
      const from = rectOf(l.from);
      const to = rectOf(l.to);
      if (!from || !to) return null;
      return {
        key: `${l.from}->${l.to}`,
        x1: from.left - box.left,
        y1: from.top - box.top + from.height / 2,
        x2: to.left - box.left,
        y2: to.top - box.top + to.height / 2,
        span: Math.abs(from.top - to.top),
        i,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.span - b.span);

  const LANE = 8;
  const R = 6;
  return measured.map((m, lane) => {
    const inner = Math.min(m.x1, m.x2);
    const lx = Math.max(3, inner - 12 - lane * LANE);
    const up = m.y2 < m.y1 ? -1 : 1;
    const d =
      `M ${m.x1} ${m.y1} ` +
      `L ${lx + R} ${m.y1} ` +
      `Q ${lx} ${m.y1} ${lx} ${m.y1 + up * R} ` +
      `L ${lx} ${m.y2 - up * R} ` +
      `Q ${lx} ${m.y2} ${lx + R} ${m.y2} ` +
      `L ${m.x2 - 2} ${m.y2}`;
    const ax = m.x2 - 2;
    const arrow = `M ${ax} ${m.y2} l -5 -3.5 l 0 7 Z`;
    return { d, arrow, key: m.key };
  });
}

/* ----------------------------------------------------------------------------
   The connector rails. Percentages, never lengths: the fork has to hit the
   centre of each branch column whatever the container is, and the artifact's
   own 16.67 / 50 / 83.33 are exactly `(i + 0.5) / 3`.
   ------------------------------------------------------------------------- */
const centreOf = (index: number, count: number) => `${((index + 0.5) / count) * 100}%`;

/**
 * Nodes and arrows, branches where a decision splits it.
 *
 * TEN STATES
 *  1. default        — the tree, top to bottom, and the legend at its foot.
 *  2. hover          — NONE without `onSelect`: a printed process is a
 *                      reading and the artifact draws no hover on a node.
 *                      WITH `onSelect` every node is a real `button` and
 *                      `Card`'s own `interactive` wash is deliberately NOT
 *                      added either — view 24 draws the pressable tree with
 *                      no hover fill, only a ring on the selected step.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the control's own radius. The tree sets no
 *                      `overflow: hidden` on a node, so a focused step shows
 *                      its ring in full.
 *  4. active/pressed — the `button`'s, when `onSelect` is given. A node that
 *                      answers no press has no pressed state.
 *  5. disabled       — does not apply, and `removed` is not it. "Legacy path,
 *                      no longer used" is a FILL and an ink — the quiet well
 *                      with tertiary type — never a dimmed node, because
 *                      dimming is an opacity and an opacity is a rejection.
 *  6. loading        — `loading`: three `Skeleton` nodes down the trunk, at
 *                      the node's own measure, so the tree does not jump when
 *                      the process lands.
 *  7. empty          — no steps, or `empty`: the quiet register. A process
 *                      nobody has mapped says so in a sentence.
 *  8. error          — `error`: the register with a poppy dot. Beats `empty`.
 *  9. selected       — `selectedId`: the artifact's ink ring on the node or
 *                      on the diamond's rotated face. One at a time; the tree
 *                      has one reader and one selection.
 * 10. read-only      — without `onSelect`, always. The tree never edits the
 *                      process; a step's record is opened, not typed into.
 *
 * THREE BREAKPOINTS, and the 380 answer
 *  · mobile (base) — the tree SCROLLS sideways inside its own box. The trunk
 *    is centred and its nodes are capped at 12.5rem, so the trunk itself fits
 *    at 380; a three-way fork does not, and the artifact's fork is drawn as
 *    thirds of one rail. Restacking the branches into a list would delete the
 *    fork, which is the one thing this view exists to draw — a flowchart
 *    whose branches are a bulleted list is a checklist. So the fork keeps its
 *    geometry and the reader moves it. The kit states no narrow behaviour for
 *    either flow view; logged as GAPS-TRACK2B FLW-6.
 *  · tablet (`sm:`) / desktop (`lg:`) — UNCHANGED. The fork is capped at the
 *    artifact's own 41.25rem (37.5rem compact) and centres in whatever is
 *    left, exactly as drawn.
 *
 * RTL — safe, and unused: the system is LTR only (ruling 10). Every rail is
 * placed with `inset-inline-*` and no side is named.
 */
const Flowchart = React.forwardRef<HTMLDivElement, FlowchartProps>(
  (
    {
      className,
      steps = [],
      density = "default",
      branchMinWidth = "7.5rem",
      selectedId,
      onSelect,
      legend = true,
      kindLabels = { manual: "Manual", auto: "Auto", ai: "AI" },
      toneLabels = {
        removed: "Removed",
        pending: "Pending",
        decision: "Decision",
        done: "Done",
      },
      label,
      loading = false,
      error = false,
      empty = false,
      loadingState,
      emptyState,
      errorState,
      loadingLabel = "Loading…",
      emptyLabel = "No steps yet",
      emptyBody = "This process has not been mapped.",
      errorLabel = "Unavailable",
      errorBody = "We can’t show this right now. Try again in a moment.",
      ...props
    },
    ref,
  ) => {
    const compact = density === "compact";

    /* Every (from, to) pair the tree declares, wherever the node sits. */
    const loops = React.useMemo(() => {
      const out: { from: string; to: string }[] = [];
      const ids = new Set<string>();
      const see = (n: FlowNode) => {
        ids.add(n.id);
        if (n.loopTo) out.push({ from: n.id, to: n.loopTo });
      };
      for (const step of steps) {
        if (step.type === "branch") {
          for (const b of step.branches) {
            see(b.node);
            for (const n of b.chain ?? []) see(n);
          }
        } else see(step.node);
      }
      return out.filter((l) => ids.has(l.to) && l.to !== l.from);
    }, [steps]);

    const treeRef = React.useRef<HTMLDivElement | null>(null);
    const [loopPaths, setLoopPaths] = React.useState<LoopPath[]>([]);
    React.useLayoutEffect(() => {
      const el = treeRef.current;
      if (!el || loops.length === 0) {
        setLoopPaths((prev) => (prev.length === 0 ? prev : []));
        return;
      }
      const draw = () => setLoopPaths(measureLoops(el, loops));
      draw();
      /* The tree reflows when a label wraps, the text size changes, or the
         panel resizes — the observer is what keeps the lines attached. */
      const ro = new ResizeObserver(draw);
      ro.observe(el);
      return () => ro.disconnect();
    }, [loops, steps, density]);

    /* Exclusive states resolved in JS (PATTERN §4). */
    const state = loading
      ? "loading"
      : error
        ? "error"
        : steps.length === 0 || empty
          ? "empty"
          : "default";

    /* The two drawn densities, as two sets of the artifact's own figures. */
    const nodeWidth = compact ? "max-w-[11.875rem]" : "max-w-[12.5rem]";
    const forkWidth = compact ? "max-w-[37.5rem]" : "max-w-[41.25rem]";
    /* TWO connector lengths, because the artifact draws two. Inside a
       chain the drop is 22 (20 compact); BETWEEN bands it is 24 (22
       compact). One value for both made every chain-internal connector 2
       too long. */
    const chainGap = compact ? "h-5" : "h-[1.375rem]";
    const trunkGap = compact ? "h-[1.375rem]" : "h-6";
    const diamondBox = compact ? "size-[5.5rem]" : "size-24";
    const diamondFace = compact ? "size-[3.875rem]" : "size-[4.25rem]";
    const diamondInset = compact ? "top-[0.8125rem] start-[0.8125rem]" : "top-[var(--space-3h)] start-[var(--space-3h)]";
    const forkRail = compact ? "h-[1.125rem]" : "h-5";

    /* A 1px rule is a FILL, not a border — the artifact draws it that way and
       PATTERN §9 rejects the alternative. */
    const RAIL = "bg-hair-strong";

    /* ---- one node ------------------------------------------------------- */
    const renderNode = (node: FlowNode, place: "trunk" | "branch") => {
      const tone = node.tone ?? "pending";
      const Glyph = node.kind ? KIND_ICON[node.kind] : undefined;
      const selected = selectedId !== undefined && selectedId === node.id;
      const pressable = onSelect !== undefined;

      const inset =
        place === "trunk"
          ? compact
            ? "px-4 py-3"
            : "px-[var(--space-4h)] py-3"
          : compact
            ? "p-[var(--space-2h)]"
            : "px-[var(--space-3h)] py-3";

      const body = (
        <>
          <span className="flex items-center justify-center gap-[var(--space-1h)]">
            {node.icon ?? (Glyph ? <Glyph size={12} aria-hidden="true" className="shrink-0" /> : null)}
            <span className="text-caption font-[var(--font-weight-medium)]">{node.label}</span>
          </span>
          {node.role === undefined ? null : (
            <span
              className={cn(
                "block text-micro tracking-[var(--tracking-normal)]",
                ROLE_INK[tone],
              )}
            >
              {node.role}
            </span>
          )}
        </>
      );

      return (
        <Card
          key={node.id}
          data-slot="flow-node"
          data-flow-id={node.id}
          data-tone={tone}
          data-selected={selected || undefined}
          variant={TONE_VARIANT[tone]}
          /* The selected ring is the artifact's `inset 0 0 0 2px #1A1918`,
             taken at the system's named ink hairline — 1px. RULED: override
             33 (2026-08-23, `verify/open.html` N2-1). FLW-4's substitution
             stands and T3A-27's reading of override 4 as covering selection
             stands with it; CH26.05's "2px" is the overridden side. */
          className={cn(
            "w-full text-center",
            inset,
            tone === "removed" && REMOVED_FILL,
            selected && "shadow-[var(--hairline-ink)]",
          )}
        >
          {pressable ? (
            <button
              type="button"
              onClick={() => onSelect?.(node.id)}
              aria-pressed={selected}
              className="flex w-full flex-col items-center"
            >
              {body}
            </button>
          ) : (
            body
          )}
        </Card>
      );
    };

    /* ---- one chain of nodes, connectors between -------------------------- */
    const renderChain = (nodes: FlowNode[], place: "trunk" | "branch") =>
      nodes.map((node, i) => (
        <div
          key={node.id}
          className={cn("flex w-full flex-col items-center", nodeWidth)}
        >
          {renderNode(node, place)}
          {i < nodes.length - 1 ? (
            <span aria-hidden="true" className={cn("w-px", chainGap, RAIL)} />
          ) : null}
        </div>
      ));

    /* ---- the rotated decision node --------------------------------------- */
    const renderDecision = (node: FlowNode) => {
      const tone = node.tone ?? "decision";
      const Glyph = node.kind ? KIND_ICON[node.kind] : undefined;
      const selected = selectedId !== undefined && selectedId === node.id;
      const pressable = onSelect !== undefined;

      const face = (
        <>
          <span
            aria-hidden="true"
            className={cn(
              "absolute rotate-45 rounded-[var(--radius-bar)]",
              diamondFace,
              diamondInset,
              tone === "decision" && "bg-surface-brand",
              tone === "done" && "bg-surface-inverse",
              tone === "pending" && "bg-card",
              tone === "removed" && "bg-surface-idle",
              selected && "shadow-[var(--hairline-ink)]",
            )}
          />
          <span
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center gap-1 px-[var(--space-2h)] text-center",
              tone === "decision" && "text-ink-on-accent",
              tone === "done" && "text-ink-on-inverse",
            )}
          >
            {node.icon ?? (Glyph ? <Glyph size={12} aria-hidden="true" className="shrink-0" /> : null)}
            <span className="text-micro font-[var(--font-weight-medium)] tracking-[var(--tracking-normal)]">
              {node.label}
            </span>
          </span>
        </>
      );

      return (
        <div
          data-slot="flow-decision"
          data-flow-id={node.id}
          data-tone={tone}
          data-selected={selected || undefined}
          className={cn("relative shrink-0", diamondBox)}
        >
          {pressable ? (
            <button
              type="button"
              onClick={() => onSelect?.(node.id)}
              aria-pressed={selected}
              className="absolute inset-0"
            >
              {face}
            </button>
          ) : (
            face
          )}
        </div>
      );
    };

    /* ---- the fork rail above a row of branches --------------------------- */
    const renderFork = (count: number) => (
      <div aria-hidden="true" className={cn("relative w-full", forkRail, forkWidth)}>
        {/* The horizontal run, from the first branch's centre to the last. */}
        <span
          className={cn("absolute top-0 h-px", RAIL)}
          style={{ insetInlineStart: centreOf(0, count), insetInlineEnd: centreOf(0, count) }}
        />
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className={cn("absolute top-0 w-px -translate-x-1/2", forkRail, RAIL)}
            style={{ insetInlineStart: centreOf(i, count) }}
          />
        ))}
      </div>
    );

    /* ---- the merge rail that gathers every branch back onto the trunk ----
       The MIRROR of the fork: one horizontal run spanning the outer branch
       centres, fed by the stretchy drops each branch column already drew down
       its own remaining height (see the branch cells), and one centre drop
       carrying on. It replaced a single elbow from a single branch, which the
       owner read — correctly — as only that branch continuing. */
    const renderMerge = (count: number) => (
      <div
        aria-hidden="true"
        data-slot="flow-merge"
        className={cn("relative w-full", forkRail, forkWidth)}
      >
        <span
          className={cn("absolute top-0 h-px", RAIL)}
          style={{ insetInlineStart: centreOf(0, count), insetInlineEnd: centreOf(0, count) }}
        />
        <span
          className={cn("absolute top-0 w-px -translate-x-1/2", forkRail, RAIL)}
          style={{ insetInlineStart: "50%" }}
        />
      </div>
    );

    /* ---- the whole tree --------------------------------------------------- */
    const renderSteps = () => {
      const out: React.ReactNode[] = [];

      steps.forEach((step, index) => {
        const last = index === steps.length - 1;

        if (step.type === "node") {
          out.push(
            <React.Fragment key={`n-${index}`}>
              {renderChain([step.node], "trunk")}
              {last ? null : <span aria-hidden="true" className={cn("w-px", trunkGap, RAIL)} />}
            </React.Fragment>,
          );
          return;
        }

        if (step.type === "decision") {
          out.push(
            <React.Fragment key={`d-${index}`}>
              {renderDecision(step.node)}
              {last ? null : <span aria-hidden="true" className={cn("w-px", trunkGap, RAIL)} />}
            </React.Fragment>,
          );
          return;
        }

        const count = step.branches.length;
        /* ANY branch marked = the fork rejoins, and the rejoin gathers all. */
        const rejoins = !last && step.branches.some((b) => b.continues === true);

        out.push(
          <React.Fragment key={`b-${index}`}>
            {/* Fork rail, branches and elbow share ONE box, so the rail's
                percentages always hit the centres of the columns beside it —
                including once the fork is wider than the viewport and the
                tree has started to scroll. */}
            <div
              className={cn("flex w-full flex-col items-center", forkWidth)}
              style={{ minWidth: `calc(${count} * ${branchMinWidth})` }}
            >
            {renderFork(count)}
            <div
              className="grid w-full gap-[var(--space-3h)]"
              style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
            >
              {step.branches.map((branch) => (
                <div key={branch.node.id} className="flex min-w-0 flex-col items-center gap-1">
                  {branch.node.condition === undefined ? null : (
                    <span
                      className={cn(
                        "text-center text-micro tracking-[var(--tracking-normal)] text-ink-tertiary",
                      )}
                    >
                      {branch.node.condition}
                    </span>
                  )}
                  <div className={cn("flex w-full flex-col items-center", nodeWidth)}>
                    {renderNode(branch.node, "branch")}
                  </div>
                  {(branch.chain ?? []).map((node) => (
                    <div
                      key={node.id}
                      className={cn("flex w-full flex-col items-center", nodeWidth)}
                    >
                      <span aria-hidden="true" className={cn("h-5 w-px", RAIL)} />
                      {renderNode(node, "branch")}
                    </div>
                  ))}
                  {/* THE DROP TO THE MERGE. Grid cells stretch to the tallest
                      branch, so a SHORT branch's rail has ground to cover
                      before the horizontal run — flex-1 is exactly that
                      remaining height, and on the tallest branch it is the
                      ordinary connector gap. Drawn only when the fork rejoins:
                      a fork whose ways end draws nothing below its leaves. */}
                  {rejoins ? (
                    <span aria-hidden="true" className={cn("w-px flex-1", chainGap, RAIL)} />
                  ) : null}
                </div>
              ))}
            </div>
            {rejoins ? renderMerge(count) : null}
            </div>
          </React.Fragment>,
        );
      });

      return out;
    };

    return (
      <div
        ref={ref}
        data-slot="flowchart"
        data-state={state}
        data-density={density}
        aria-busy={loading || undefined}
        aria-label={label}
        className={cn("flex min-w-0 flex-col", className)}
        {...props}
      >
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

        {state === "loading"
          ? (loadingState ?? (
              <div
                role="status"
                aria-label={loadingLabel}
                className="flex flex-col items-center gap-6"
              >
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton
                    key={i}
                    className={cn("h-[3.25rem] w-full", nodeWidth)}
                    announce={i === 0}
                    label={loadingLabel}
                  />
                ))}
              </div>
            ))
          : null}

        {state === "default" ? (
          <div
            data-slot="flowchart-tree"
            className="flex min-w-0 flex-1 flex-col overflow-x-auto"
          >
            <div
              ref={treeRef}
              className="relative flex min-w-max flex-col items-center px-1 pt-[var(--space-2h)] pb-1"
            >
              {renderSteps()}
              {loopPaths.length > 0 ? (
                <svg
                  aria-hidden="true"
                  data-slot="flow-loops"
                  className="pointer-events-none absolute inset-0 size-full overflow-visible text-ink-tertiary"
                >
                  {loopPaths.map((l) => (
                    <g key={l.key}>
                      <path
                        d={l.d}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeDasharray="3 3"
                      />
                      <path d={l.arrow} fill="currentColor" stroke="none" />
                    </g>
                  ))}
                </svg>
              ) : null}
            </div>
          </div>
        ) : null}

        {legend && state === "default" ? (
          <div
            data-slot="flowchart-legend"
            /* Sticky at the foot, on the panel's own fill so the tree scrolls
               under it, and separated by the artifact's `inset 0 1px 0`. */
            className="sticky bottom-0 mt-6 flex w-full justify-end bg-surface-panel pt-[var(--space-3h)] shadow-[var(--hairline-over)]"
          >
            <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-4 pb-[var(--space-1h)]">
              {(["manual", "auto", "ai"] as const).map((kind) => {
                const Glyph = KIND_ICON[kind];
                return (
                  <span
                    key={kind}
                    className="flex items-center gap-[var(--space-1h)] text-ink-tertiary"
                  >
                    <Glyph size={12} aria-hidden="true" className="shrink-0" />
                    <span className="text-micro tracking-[var(--tracking-normal)]">
                      {kindLabels[kind]}
                    </span>
                  </span>
                );
              })}

              <span aria-hidden="true" className={cn("h-[0.875rem] w-px", RAIL)} />

              {(["removed", "pending", "decision", "done"] as const).map((tone) => (
                <span
                  key={tone}
                  className="flex items-center gap-[var(--space-1h)] text-ink-tertiary"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-[0.6875rem] shrink-0 rounded-pill",
                      /* The LEGEND's removed swatch is a 14% ink wash, not
                         `--idle`: `--idle` is #FAF9F7 and this legend stands
                         on soft paper #F7F2EB, so an 11px `--idle` dot
                         measures 1.01 against its own ground and disappears.
                         The node's own `--idle` fill is untouched. 14% is not
                         a named tier (the family is 6 / 8 / 20), so this
                         takes the nearest named wash. */
                      tone === "removed" && "bg-hair-strong",
                      /* `inset 0 0 0 1px rgba(26,25,24,.18)` — the 20% tier,
                         which is what the divider beside it already uses.
                         `--hairline` is the 8% one. */
                      tone === "pending" && "bg-card shadow-[var(--hairline-strong)]",
                      tone === "decision" && "bg-surface-brand",
                      tone === "done" && "bg-surface-inverse",
                    )}
                  />
                  <span className="text-micro tracking-[var(--tracking-normal)]">
                    {toneLabels[tone]}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  },
);

Flowchart.displayName = "Flowchart";

export { Flowchart, KIND_ICON };
