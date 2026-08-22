"use client"

// THE VISUAL BLOCKS, AS PAINTED. One renderer per kind in shared/agent-blocks.ts,
// composed from the library's own primitives (UI-CONVENTIONS: the library is lego —
// nothing here forks the component library, and a block that needs a primitive we don't have is
// composed in the host and said out loud rather than added to the library from here).
//
// THE SAFETY STORY, in one paragraph, because it is the point of the whole feature.
// A block's data is MODEL OUTPUT — as untrusted as any request body. It has already
// been through `parseAgentBlock`, which type-checks every field positionally and
// refuses the block outright on anything it can't vouch for. What survives is passed
// to React as CHILDREN, so this file never touches `dangerouslySetInnerHTML` and
// there is no markup for a crafted string to break out of. No field in the catalogue
// is a URL, so there is no href to sanitise either. That makes the structured path
// strictly safer than the markdown path beside it, which has to escape-then-allow.
//
// Widths are the other constraint: these render inside the assistant's side sheet
// (~400px) AND inside a full-width panel, so every block is composed to survive the
// narrow one — two columns at most, numbers that truncate, tables that scroll inside
// themselves rather than widening the conversation.

import * as React from "react"

import { StatGrid, defaultStatGridConfig } from "@shared/ui/registry/collections/stat-grid/stat-grid"
import { Progress } from "@shared/ui/registry/primitives/progress/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@shared/ui/registry/primitives/table/table"

import { ArrowDown, CornerDownRight } from "lucide-react"

import type { AgentBlock } from "@shared/agent-blocks"

/** A block's own heading, when the model gave it one. Sentence case is the model's
 * job (the prompt asks for the app's voice); this only decides the type ramp. */
function BlockTitle({ title }: { title?: string }) {
  if (!title) return null
  return <div className="mb-2 text-sm font-medium text-foreground">{title}</div>
}

/** Wraps every block so a reply reads as one column of things, whatever the mix. */
function BlockFrame({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="my-3">
      <BlockTitle title={title} />
      {children}
    </div>
  )
}

/* -------------------------------- metric -------------------------------- */

/** Headline numbers, on the library's StatGrid (the "big numbers" cards).
 *
 * TWO COLUMNS, ALWAYS. StatGrid's column config is viewport-breakpoint driven, so
 * asking for three inside a 400px sheet gives three ~120px cards on a desktop
 * screen — the breakpoint sees the window, not the panel. Two survives both hosts:
 * one column on a phone, two side by side anywhere else. */
function MetricBlock({ block }: { block: Extract<AgentBlock, { kind: "metric" }> }) {
  // The delta line is all-or-nothing across the grid (StatGrid's own config), so it
  // only appears when the model actually said something changed about at least one
  // card — otherwise every card grows an empty row with a lone arrow in it.
  const showDelta = block.items.some((m) => m.delta)
  const items = block.items.map((m, i) => ({
    id: String(i),
    label: m.label,
    value: m.value,
    // A card with nothing said about it, in a grid where others DO have a delta,
    // gets an em dash rather than an orphaned icon — the dashboard convention for
    // "nothing to report", and it invents no claim the model didn't make.
    delta: m.delta ?? (showDelta ? "—" : ""),
    trend: m.trend ?? ("flat" as const),
  }))
  return (
    <BlockFrame title={block.title}>
      <StatGrid items={items} config={{ ...defaultStatGridConfig, columns: 2, showDelta }} />
    </BlockFrame>
  )
}

/* --------------------------------- bars --------------------------------- */

/** ONE NUMBER COMPARED ACROSS A FEW THINGS. Horizontal, because the labels are
 * account and person names — vertical bars would turn every one of them into a
 * rotated stub. Each bar is the library Progress primitive driven to a percentage
 * of the largest value in the block.
 *
 * A NEGATIVE VALUE IS REAL HERE (a step that got slower, a month that fell), so the
 * bar is scaled on the largest MAGNITUDE and the number itself carries the sign in
 * the destructive colour. Scaling on the raw maximum instead would draw a −40 as a
 * longer bar than a +10, which is the chart lying about its own data. */
function BarsBlock({ block }: { block: Extract<AgentBlock, { kind: "bars" }> }) {
  const max = Math.max(...block.rows.map((r) => Math.abs(r.value)))
  // A unit that is a single symbol (£, $, €) reads as a prefix; a word ("h",
  // "tickets") reads as a suffix. Both are common and getting it wrong looks careless.
  const unit = block.unit ?? ""
  const prefix = unit.length === 1 && !/[a-z0-9]/i.test(unit)
  const show = (v: number) => {
    const n = v.toLocaleString("en-GB", { maximumFractionDigits: 2 })
    if (!unit) return n
    return prefix ? `${unit}${n}` : `${n} ${unit}`
  }
  return (
    <BlockFrame title={block.title}>
      <div className="flex flex-col gap-4">
        {block.rows.map((r, i) => (
          <div key={i} className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 items-baseline justify-between gap-2">
              <span className="truncate text-sm text-foreground" title={r.label}>
                {r.label}
              </span>
              <span
                className={`shrink-0 text-sm font-medium tabular-nums ${
                  r.value < 0 ? "text-destructive" : "text-foreground"
                }`}
              >
                {show(r.value)}
              </span>
            </div>
            {/* max can be 0 when every value is 0 — a flat set of empty bars is the
                honest picture, and it keeps the division out of NaN. */}
            <Progress value={max === 0 ? 0 : (Math.abs(r.value) / max) * 100} className="h-1.5" />
          </div>
        ))}
      </div>
    </BlockFrame>
  )
}

/* --------------------------------- table -------------------------------- */

/** A REAL TABLE. Today a markdown pipe table reaches the reader as literal
 * pipe characters — toHtml has never had a table rule — so this is the one block
 * that fixes something already broken rather than adding something new. The library
 * Table already scrolls inside its own wrapper, which is what keeps a six-column
 * answer from widening the whole conversation. */
function TableBlock({ block }: { block: Extract<AgentBlock, { kind: "table" }> }) {
  return (
    <BlockFrame title={block.title}>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              {block.columns.map((c, i) => (
                <TableHead key={i} className="whitespace-nowrap">
                  {c}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {block.rows.map((row, i) => (
              <TableRow key={i}>
                {row.map((c, j) => (
                  // A cell of PROSE wraps (the panel is ~400px and wrapping beats
                  // making someone drag the table sideways). A cell that is ONE
                  // token does not: "BERG-T0412" is a reference number — the thing
                  // in the glossary you say out loud — and CSS will happily break it
                  // at its hyphen into two lines that read as two references. Having
                  // a space in it is what tells the two apart, so nothing has to
                  // guess which column means what.
                  <TableCell key={j} className={`p-2.5 text-sm ${/\s/.test(c) ? "" : "whitespace-nowrap"}`}>
                    {c}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </BlockFrame>
  )
}

/* --------------------------------- steps -------------------------------- */

/** AN ORDERED SEQUENCE — the shape a process map wants, and the shape "what happens
 * next" wants. Composed here rather than taken from the library on purpose: the
 * nearest primitives are StatusStepper (a LIFECYCLE with a "you are here" stage) and
 * the RunSteps collection (steps that RAN, with outcomes). Neither is a plain
 * numbered flow, and giving a process's steps ticks or a current stage would state
 * something the assistant never said. See the report — this is the one primitive the
 * library is genuinely missing. */
function StepsBlock({ block }: { block: Extract<AgentBlock, { kind: "steps" }> }) {
  return (
    <BlockFrame title={block.title}>
      <ol className="flex flex-col">
        {block.steps.map((s, i) => (
          <li key={i} className="flex gap-2">
            {/* The number and the rule under it are one column, so the line joins
                consecutive steps and stops at the last one. */}
            <div className="flex flex-col items-center">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground tabular-nums">
                {i + 1}
              </span>
              {i < block.steps.length - 1 && <span className="w-px grow bg-border" aria-hidden="true" />}
            </div>
            <div className={`min-w-0 ${i < block.steps.length - 1 ? "pb-3" : ""}`}>
              <div className="text-sm text-foreground">{s.label}</div>
              {s.note && <div className="text-xs text-muted-foreground">{s.note}</div>}
            </div>
          </li>
        ))}
      </ol>
    </BlockFrame>
  )
}

/* --------------------------------- flow --------------------------------- */

/** A PROCESS THAT BRANCHES — nodes and labelled arrows, which `steps` cannot say.
 * A numbered list can only mean "and then"; a triage that goes one of two ways, a
 * sprint that sends work back, an app that has to be approved before it ships are
 * all shapes where the ARROW carries the meaning. The product's own process maps
 * (app → process → step) are exactly this, so the shape is earned by the data
 * rather than borrowed from a chart library.
 *
 * LAID OUT DOWN THE PAGE, NEVER AS A CANVAS, and that is the whole design. A real
 * graph layout needs width to be legible, and the narrow host here is ~400px — a
 * box-and-line canvas at that width is either a pile of overlapping labels or a
 * thing you drag sideways. So the nodes are drawn in the order the model listed
 * them (its own reading order), the arrow BETWEEN two consecutive nodes becomes
 * the connector that joins them, and every other arrow — a branch, a loop back, a
 * skip — is drawn under its source as a labelled jump naming the box it goes to.
 * Nothing is hidden and nothing is invented: every edge appears exactly once.
 *
 * Composed in the host, not taken from the library: there is no graph primitive in
 * the library in `shared/ui/`, and this file does not fork it (see UI-GAPS.md). */
function FlowBlock({ block }: { block: Extract<AgentBlock, { kind: "flow" }> }) {
  const labelOf = new Map(block.nodes.map((n) => [n.id, n.label]))
  return (
    <BlockFrame title={block.title}>
      <div className="flex flex-col">
        {block.nodes.map((node, i) => {
          const next = block.nodes[i + 1]
          // The arrow that happens to join these two in the reading order — it
          // becomes the connector rather than a chip, so an ordinary straight-
          // through process draws as one column with no repetition in it.
          const onward = next ? block.edges.find((e) => e.from === node.id && e.to === next.id) : undefined
          const jumps = block.edges.filter((e) => e.from === node.id && e !== onward)
          return (
            <div key={node.id} className="flex min-w-0 flex-col">
              <div className="rounded-xl border px-3 py-2">
                <div className="text-sm text-foreground">{node.label}</div>
                {node.note && <div className="text-xs text-muted-foreground">{node.note}</div>}
              </div>
              {jumps.map((e, j) => (
                // The corner says "this is a branch off the line"; the arrow says
                // which way it goes. Both, because "work to do  Split into stories"
                // on one line reads as two labels rather than a condition and a
                // destination — and a diagram that has to be guessed at is not one.
                <div key={j} className="flex min-w-0 flex-wrap items-baseline gap-1 py-1 pl-3 text-xs">
                  <CornerDownRight className="size-3.5 shrink-0 self-center text-muted-foreground" aria-hidden />
                  {e.label && (
                    <>
                      <span className="text-muted-foreground">{e.label}</span>
                      <span className="text-muted-foreground" aria-hidden>
                        →
                      </span>
                    </>
                  )}
                  <span className="min-w-0 text-foreground">{labelOf.get(e.to)}</span>
                </div>
              ))}
              {/* Only drawn when an arrow really joins these two. Two boxes with
                  nothing between them are two boxes with nothing between them —
                  a connector there would state a step nobody said existed. */}
              {onward && (
                <div className="flex min-w-0 items-center gap-1 py-1 pl-3">
                  <ArrowDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  {onward.label && <span className="min-w-0 text-xs text-muted-foreground">{onward.label}</span>}
                </div>
              )}
              {!onward && next && <div className="h-2" />}
            </div>
          )
        })}
      </div>
    </BlockFrame>
  )
}

/* ------------------------------- the switch ------------------------------ */

/** ONE RENDERER PER KIND. The mapped type over the catalogue's own union is the
 * compile-time half of Law R9's drawing clause: a kind added to shared/agent-blocks.ts
 * without a renderer here (or a renderer here for a kind that doesn't exist) fails
 * `tsc`, before any test runs. `agent-parity.test.ts` reads this same map off disk,
 * so R9's own check states the invariant rather than inheriting it. */
const BLOCK_RENDERERS: {
  [K in AgentBlock["kind"]]: (props: { block: Extract<AgentBlock, { kind: K }> }) => React.ReactElement
} = {
  metric: MetricBlock,
  bars: BarsBlock,
  table: TableBlock,
  steps: StepsBlock,
  flow: FlowBlock,
}

export function AgentBlockView({ block }: { block: AgentBlock }) {
  // The cast re-ties the map's per-kind parameter to this block after the lookup —
  // the narrowing tsc did on the union doesn't survive the indexed access.
  const Renderer = BLOCK_RENDERERS[block.kind] as (props: { block: AgentBlock }) => React.ReactElement
  return <Renderer block={block} />
}
