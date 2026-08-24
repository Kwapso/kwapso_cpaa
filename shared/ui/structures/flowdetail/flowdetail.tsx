"use client";

/* ============================================================================
   Flowdetail — collection view 24, "the same tree, click a step for its full
   record" (0 direct call sites; a body swap for `CollectionFrame`).

   DESIGN SOURCE
   Kit chapter 19 ("Collection views"), view 24, read out of
   `Design Mothership/kit-current/Kwapso UI Kit.dc.html`. The chapter's own
   line for it, verbatim from the view table:

       flowdetail · "Same tree, click a step for its full record"
                  · fits "Process documentation, training, handover"
                  · switch label "Detail"

   SAME TREE MEANS THE SAME COMPONENT
   "Same tree" is not a resemblance, it is an instruction: this file draws no
   nodes, no connectors and no legend. It is `Flowchart density="compact"` —
   which IS view 24's drawing, transcribed there — with the selection wired up
   and the step panel beside it. If the two trees ever diverge, one of them is
   wrong.

   THE DRAWING, transcribed
     · the split — the tree at `flex: 1 1 auto` and the panel at
                   `width: 230px; flex: 0 0 230px`, `gap: 16px`, the tree
                   scrolling on its own
     · the panel — `var(--card)` at radius 24, `padding: 20px`, scrolling on
                   its own: the eyebrow "Step detail" at 11 uppercase
                   tertiary, the step's name at 18/500, then six pairs, each
                   `padding: 9px 0` with `inset 0 -1px 0 var(--hair)` under
                   all but the last
     · the pairs — Actor · Role · Description · Tool · Time · Cost, the label
                   at 10 uppercase tertiary above a 13 value

   COMPOSE, DO NOT REBUILD
   The panel is `DetailView`, on `ground="plain"` inside a `Card` — its
   `items` are exactly the artifact's six pairs, drawn by `DescriptionList`
   with the label above the value, which is `layout="grid"`. The eyebrow, the
   pair labels and the six field names are all props with defaults: the
   applications run in more than one language and this file hardcodes no word.

   THE SIX PAIRS ARE THE DEFAULT, NOT THE LAW
   `fields` is a prop. The artifact's six are the default because they are
   what it draws; a process whose steps carry a seventh fact passes its own
   list without touching this file.

   RENDERING CONTEXT
   `"use client"` — this module holds the uncontrolled selection in
   `React.useState` and creates a handler during its own render (PATTERN §8).
   ========================================================================= */

import * as React from "react";

import { cn } from "../../lib/utils";
import { Card } from "../../controls/card/card";
import { CollectionRegister } from "../collection-frame/collection-frame";
import { DetailView } from "../detail-view/detail-view";
import { Flowchart, type FlowStep } from "../flowchart/flowchart";

/**
 * The full record of one step, as the artifact's panel draws it. Every value
 * is optional: a pair with nothing in it is dropped rather than printed as a
 * dash, which is the system's standing preference (PATTERN §4).
 */
export interface FlowStepRecord {
  /** Matches `FlowNode.id`. This is how a pressed node finds its record. */
  id: string;
  /** The step's name, at the head of the panel. */
  label?: React.ReactNode;
  /** "Actor" — the artifact's value is the node's kind: Manual, Auto, AI. */
  actor?: React.ReactNode;
  /** "Role" — who does it. */
  role?: React.ReactNode;
  /** "Description" — the paragraph. */
  description?: React.ReactNode;
  /** "Tool" — what it is done in. */
  tool?: React.ReactNode;
  /** "Time" — how long it takes. */
  time?: React.ReactNode;
  /** "Cost" — what it costs. */
  cost?: React.ReactNode;
}

/** The six field keys, in the artifact's own order. */
export const FLOW_STEP_FIELDS = [
  "actor",
  "role",
  "description",
  "tool",
  "time",
  "cost",
] as const;

export type FlowStepField = (typeof FLOW_STEP_FIELDS)[number];

export interface FlowdetailProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onSelect"> {
  /** The tree, top to bottom. Handed straight to `Flowchart`. */
  steps?: FlowStep[];
  /** One record per step, found by id. A step with no record shows the panel's own empty line. */
  records?: FlowStepRecord[];

  /** The selected step, when the call site owns the selection. */
  selectedId?: string;
  /** Which step is selected before anyone presses one. Defaults to the first step in the tree. */
  defaultSelectedId?: string;
  /** Reports every press, controlled or not. */
  onSelectStep?: (id: string) => void;

  /** Which pairs the panel prints, in order. The artifact's six are the default. */
  fields?: readonly FlowStepField[];
  /** The pair labels. Props, because the applications run in more than one language. */
  fieldLabels?: Record<FlowStepField, string>;
  /** The micro uppercase line above the step's name. */
  panelEyebrow?: string;
  /** What the panel says before anything is selected, or for a step with no record. */
  panelEmptyLabel?: string;
  /** How wide the panel is. The artifact's figure is 230 at the 16 authoring base. */
  panelWidth?: string;

  /** Whether the tree draws its legend. The artifact draws it, under both columns. */
  legend?: boolean;
  /** Accessible name for the view as a whole. */
  label?: string;
  /** Accessible name for the panel, for the reader who tabs into it. */
  panelLabel?: string;

  /** Neither the tree nor the record has arrived. Cold cache only. */
  loading?: boolean;
  /** The request failed. Beats `empty`. */
  error?: boolean;
  /** Force the empty register even with steps present. */
  empty?: boolean;
  emptyState?: React.ReactNode;
  errorState?: React.ReactNode;
  loadingLabel?: string;
  emptyLabel?: string;
  emptyBody?: string;
  errorLabel?: string;
  errorBody?: string;
}

/** The first id in the tree, whatever kind of band it sits in. */
const firstId = (steps: FlowStep[]): string | undefined => {
  for (const step of steps) {
    if (step.type === "node" || step.type === "decision") return step.node.id;
    if (step.type === "branch" && step.branches.length > 0) return step.branches[0].node.id;
  }
  return undefined;
};

/**
 * The same tree, with the pressed step's full record beside it.
 *
 * TEN STATES
 *  1. default        — the tree at the inline start, the panel at the end.
 *  2. hover          — belongs to the tree's nodes, and the artifact draws
 *                      none: view 24's pressable node takes a ring when it is
 *                      selected and nothing when it is pointed at.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *                      Every node is a real `button`, so the tree is
 *                      keyboard-reachable in document order without this file
 *                      writing a roving-tabindex of its own.
 *  4. active/pressed — the node's, which is a `button`.
 *  5. disabled       — does not apply. A step that is no longer used is the
 *                      tree's `removed` FILL, never a dimmed node.
 *  6. loading        — `loading`: the tree draws its own placeholder trunk
 *                      and `DetailView loading` fills the panel, so the split
 *                      does not move when the process lands.
 *  7. empty          — no steps, or `empty`: the quiet register in place of
 *                      both columns. A panel beside no tree is a hole with an
 *                      inset. A step with no RECORD is the panel's own
 *                      `panelEmptyLabel`, which is a different, smaller
 *                      emptiness.
 *  8. error          — `error`: the register with a poppy dot, in place of
 *                      both columns. Beats `empty`.
 *  9. selected       — the whole point of the view. Uncontrolled, it starts
 *                      on the first step in the tree — the artifact's own
 *                      default (`flowSelectedId = … || 'orderIntake'`), which
 *                      is its first node. Controlled with `selectedId`.
 * 10. read-only      — always. Pressing a step reads its record; nothing here
 *                      writes one.
 *
 * THREE BREAKPOINTS, and the 380 answer
 *  · mobile (base) — the two columns STACK: the tree first, the panel under
 *    it. The panel is drawn at 230 and the tree's fork at 37.5rem; side by
 *    side they need about 40rem before the tree is unreadable, and at 380
 *    there is not room for both. Stacking keeps both readable and keeps the
 *    reading order — press a step, then read it — which is also the order a
 *    screen reader takes. The tree itself still scrolls sideways inside its
 *    own box (its own breakpoint block says why). The kit draws this view at
 *    one width only; logged as GAPS-TRACK2B FD-2.
 *  · tablet (`sm:`, 40rem) — the drawn split: tree at `1fr`, panel at its own
 *    measure, `gap: 16px`.
 *  · desktop (`lg:`) — UNCHANGED from tablet. The artifact's panel is a fixed
 *    measure at every width and only the tree grows.
 *
 * RTL — safe, and unused: the system is LTR only (ruling 10). The split is a
 * flex row and no side is named.
 */
const Flowdetail = React.forwardRef<HTMLDivElement, FlowdetailProps>(
  (
    {
      className,
      steps = [],
      records = [],
      selectedId,
      defaultSelectedId,
      onSelectStep,
      fields = FLOW_STEP_FIELDS,
      fieldLabels = {
        actor: "Actor",
        role: "Role",
        description: "Description",
        tool: "Tool",
        time: "Time",
        cost: "Cost",
      },
      panelEyebrow = "Step detail",
      panelEmptyLabel = "Pick a step to read it.",
      panelWidth = "14.375rem",
      legend = true,
      label,
      panelLabel,
      loading = false,
      error = false,
      empty = false,
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
    /* Uncontrolled unless `selectedId` is given — the shape every selection
       in this system takes. The fallback is the artifact's own: the first
       step in the tree. */
    const [ownSelection, setOwnSelection] = React.useState<string | undefined>(
      defaultSelectedId,
    );
    const controlled = selectedId !== undefined;
    const current = controlled ? selectedId : (ownSelection ?? firstId(steps));

    const select = React.useCallback(
      (id: string) => {
        if (!controlled) setOwnSelection(id);
        onSelectStep?.(id);
      },
      [controlled, onSelectStep],
    );

    /* Exclusive states resolved in JS (PATTERN §4). */
    const state = loading
      ? "loading"
      : error
        ? "error"
        : steps.length === 0 || empty
          ? "empty"
          : "default";

    if (state === "error") {
      return (
        <div ref={ref} data-slot="flowdetail" data-state={state} className={cn("min-w-0", className)} {...props}>
          {errorState ?? (
            <CollectionRegister tone="error" eyebrow={errorLabel} body={errorBody} />
          )}
        </div>
      );
    }

    if (state === "empty") {
      return (
        <div ref={ref} data-slot="flowdetail" data-state={state} className={cn("min-w-0", className)} {...props}>
          {emptyState ?? (
            <CollectionRegister tone="quiet" eyebrow={emptyLabel} body={emptyBody} />
          )}
        </div>
      );
    }

    const record = records.find((r) => r.id === current);

    const items = fields
      .map((field) => ({ id: field, label: fieldLabels[field], value: record?.[field] }))
      .filter((pair) => pair.value !== undefined && pair.value !== null);

    return (
      <div
        ref={ref}
        data-slot="flowdetail"
        data-state={state}
        aria-busy={loading || undefined}
        aria-label={label}
        className={cn("flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start", className)}
        {...props}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <Flowchart
            steps={steps}
            density="compact"
            selectedId={current}
            onSelect={select}
            legend={legend}
            loading={loading}
            loadingLabel={loadingLabel}
          />
        </div>

        <Card
          data-slot="flowdetail-panel"
          variant="raised"
          aria-label={panelLabel}
          className="w-full shrink-0 p-5 sm:w-[var(--flowdetail-panel-width)]"
          style={
            { "--flowdetail-panel-width": panelWidth } as React.CSSProperties
          }
        >
          <span className="text-micro font-[var(--font-weight-medium)] uppercase text-ink-tertiary">
            {panelEyebrow}
          </span>

          <DetailView
            ground="plain"
            loading={loading}
            title={record?.label}
            items={items}
            itemsLayout="grid"
            density="dense"
            emptyLabel={panelEmptyLabel}
            /* The artifact's panel head is 18/500 — the card-title step — not
               the record page's h2. Retargeted rather than re-drawn, so the
               panel stays `DetailView` and does not become a second one. */
            className="mt-2 gap-4 [&>header_h2]:text-lg"
          />
        </Card>
      </div>
    );
  },
);

Flowdetail.displayName = "Flowdetail";

export { Flowdetail };
