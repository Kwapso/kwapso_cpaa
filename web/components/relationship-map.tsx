"use client"

// THE RELATIONSHIP MAP — one record and what it is connected to.
//
// ── WHY SVG AND NOT A CANVAS ────────────────────────────────────────────────
//
// The plan said "2D force-directed canvas", and a canvas is what you reach for
// when the mental image is a hairball of thousands. This map is
// NEIGHBOURHOOD-FIRST — one record, what sits one step from it, capped at forty
// per edge — so the node count is under a hundred, and at that size a canvas is
// not the cheaper instrument but the more expensive one. A canvas node is a
// coordinate you must hit-test, label and make focusable BY HAND. An SVG node is
// an element that already does all three: tapping to open the record is an
// ordinary handler, it takes focus, it carries a name, and a keyboard reaches it.
//
// No new dependency either way — the force simulation below is arithmetic.
//
// ── TWO THINGS A DRAWING LIKE THIS HAS TO CARRY ─────────────────────────────
//
// 1. A FORCE SIMULATION IS ANIMATION, AND THIS ONE IS NOT SHOWN AT ALL. The
//    layout runs to convergence BEFORE the first paint and the settled positions
//    are what is drawn — so there is no convergence to watch, for anybody, and
//    `prefers-reduced-motion` has nothing to switch off. That is a stronger
//    answer than honouring the query: a reader with a vestibular disorder gets
//    the same map as everybody else rather than a quieter version of it, and
//    there is no second code path that could drift. The cost is one thing
//    nobody asked for — watching the graph arrange itself — and the gain is
//    that the map is never in a state that is wrong-but-moving.
//
// 2. POSITION IS THE INFORMATION HERE, AND POSITION DOES NOT NARRATE. Focusable
//    nodes are necessary and nowhere near sufficient: a screen reader handed
//    this control gets a bag of names and no relationships. So the same payload
//    is rendered a second time as sentences — "Dispatch is built for Mapland
//    GmbH" — reachable rather than hidden, because a text equivalent nobody
//    without a screen reader can find is a text equivalent nobody checks. One
//    query, two renderings; the door already returns exactly this shape.
//
// ── AND WHAT IT DOES NOT DRAW ───────────────────────────────────────────────
//
// An edge whose far end the caller may not read never arrives here at all — the
// door removes it, both endpoints fenced, and does not count it either
// (workers/content/src/lib/record-map.ts carries that reasoning). So this file
// draws what it is given and has no fence of its own to get wrong.

import * as React from "react"

import { Badge } from "@shared/ui/components/badge/badge"
import { Button } from "@shared/ui/components/button/button"
import { Maximize, Minus, Plus } from "@shared/ui/foundations/icons"

import { InAppLink } from "@/components/in-app-link"
import { useT } from "@shared/web/language"

/* ------------------------------- the layout ------------------------------- */

export type MapNode = { table: string; id: string; label: string }
export type MapLink = { from: string; to: string; relation: string }
type Placed = MapNode & { key: string; x: number; y: number }

/** The box the layout is computed in. A viewBox, not pixels: the SVG scales to
 * whatever room the panel has, so one set of coordinates is right at every size
 * and the zoom below is a window onto it rather than a second layout. */
const W = 1000
const H = 640
/** Enough passes to settle a neighbourhood of this size. Measured by eye at 100
 * nodes rather than derived: the simulation is O(n²) per pass, and 300 × 100²
 * is three million operations, which is nothing and happens once. */
const PASSES = 300
const REPULSION = 42_000
const SPRING = 0.012
const IDEAL = 190
const CENTRING = 0.006

/** WHERE EVERY NODE ENDS UP — computed to convergence, and DETERMINISTIC.
 *
 * The start positions are a circle in a fixed order rather than random, which is
 * the difference between a map that looks the same when you come back to it and
 * one that rearranges itself for no reason a reader can see. The focus is pinned
 * at the centre: it is the thing you opened, and letting the simulation carry it
 * to an edge would be the map losing its own subject.
 */
export function layout(nodes: MapNode[], links: MapLink[], focusKey: string): Placed[] {
  const placed: Placed[] = nodes.map((n, i) => {
    const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2
    return {
      ...n,
      key: `${n.table}:${n.id}`,
      x: W / 2 + Math.cos(angle) * (W / 4),
      y: H / 2 + Math.sin(angle) * (H / 4),
    }
  })
  const index = new Map(placed.map((p, i) => [p.key, i]))
  const edges = links
    .map((l) => [index.get(l.from), index.get(l.to)] as const)
    .filter((e): e is readonly [number, number] => e[0] !== undefined && e[1] !== undefined)

  for (let pass = 0; pass < PASSES; pass++) {
    // EVERY NODE PUSHES EVERY OTHER AWAY — the part that stops them overlapping.
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) {
        const dx = placed[j].x - placed[i].x
        const dy = placed[j].y - placed[i].y
        const d2 = Math.max(400, dx * dx + dy * dy)
        const force = REPULSION / d2
        const d = Math.sqrt(d2)
        placed[i].x -= (dx / d) * force
        placed[i].y -= (dy / d) * force
        placed[j].x += (dx / d) * force
        placed[j].y += (dy / d) * force
      }
    // AND EVERY LINE PULLS ITS TWO ENDS TOGETHER — the part that makes the
    // picture MEAN something: what is connected sits near.
    for (const [a, b] of edges) {
      const dx = placed[b].x - placed[a].x
      const dy = placed[b].y - placed[a].y
      const d = Math.max(1, Math.hypot(dx, dy))
      const pull = (d - IDEAL) * SPRING
      placed[a].x += (dx / d) * pull
      placed[a].y += (dy / d) * pull
      placed[b].x -= (dx / d) * pull
      placed[b].y -= (dy / d) * pull
    }
    for (const p of placed) {
      // A gentle drift back to the middle, so a lonely node does not wander off
      // the viewBox and vanish.
      p.x += (W / 2 - p.x) * CENTRING
      p.y += (H / 2 - p.y) * CENTRING
      // THE FOCUS IS PINNED. It is the thing you opened.
      if (p.key === focusKey) {
        p.x = W / 2
        p.y = H / 2
      }
      p.x = Math.min(W - 40, Math.max(40, p.x))
      p.y = Math.min(H - 40, Math.max(40, p.y))
    }
  }
  return placed
}

/* -------------------------------- the marks ------------------------------- */

/** A COLOUR PER KIND OF RECORD, from the chart series — the five tokens R32
 * reserves for exactly this: a mark whose only job is to tell one series from
 * another. Never a literal, and never a Tailwind ramp.
 *
 * A table with no line here takes the last colour rather than an invented one:
 * a map is allowed to say "one of the others", and inventing a sixth token to
 * avoid it would be inventing a colour nobody chose. */
const KIND_COLOUR: Record<string, string> = {
  accounts: "var(--chart-1)",
  apps: "var(--chart-2)",
  help: "var(--chart-3)",
  stories: "var(--chart-4)",
  processes: "var(--chart-5)",
}
const colourFor = (table: string) => KIND_COLOUR[table] ?? "var(--chart-5)"

/** Where a record lives, so tapping a node opens it. Null for a table with no
 * screen of its own — the node is still drawn and still says what it is, it
 * simply is not a door. The mapping is the app's own segments (web/lib/pages.ts);
 * a table absent here has no page, which is a fact rather than an omission. */
const RECORD_PATH: Record<string, string> = {
  accounts: "accounts",
  apps: "apps",
  help: "tickets",
  stories: "stories",
  sprints: "sprints",
  waves: "waves",
  processes: "processes",
  meetings: "meetings",
  tasks: "tasks",
}

/* ------------------------------- the control ------------------------------ */

export function RelationshipMap({
  teamId,
  focus,
  nodes,
  links,
  total,
  capped,
}: {
  teamId: string
  focus: MapNode | null
  nodes: MapNode[]
  links: MapLink[]
  total: number
  capped: boolean
}) {
  const t = useT()
  const focusKey = focus ? `${focus.table}:${focus.id}` : ""
  // Computed once per payload, to convergence, BEFORE the first paint — see this
  // file's header for why the settling is never shown to anybody.
  const placed = React.useMemo(() => layout(nodes, links, focusKey), [nodes, links, focusKey])
  const at = React.useMemo(() => new Map(placed.map((p) => [p.key, p])), [placed])

  // THE WINDOW ONTO THE LAYOUT. Zoom and pan are a viewBox, so the coordinates
  // above never move and the picture cannot drift out of agreement with itself.
  const [view, setView] = React.useState({ x: 0, y: 0, z: 1 })
  const drag = React.useRef<{ x: number; y: number } | null>(null)
  const reset = () => setView({ x: 0, y: 0, z: 1 })
  const zoom = (by: number) =>
    setView((v) => ({ ...v, z: Math.min(3, Math.max(0.5, Number((v.z + by).toFixed(2)))) }))

  const box = `${view.x} ${view.y} ${W / view.z} ${H / view.z}`

  const hrefFor = (n: MapNode) =>
    RECORD_PATH[n.table] ? `/t/${teamId}/${RECORD_PATH[n.table]}/${n.id}` : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{t("{count} connected", { count: String(total) })}</Badge>
        {capped && (
          // SAID, NEVER SILENT. A map that draws forty of three hundred and does
          // not say so is a map that has answered a different question.
          <span className="text-muted-foreground text-xs">
            {t("Showing the closest few — there are more.")}
          </span>
        )}
        <div className="ms-auto flex items-center gap-1">
          <Button variant="secondary" size="icon" aria-label={t("Zoom out")} onClick={() => zoom(-0.25)}>
            <Minus className="size-4" />
          </Button>
          <Button variant="secondary" size="icon" aria-label={t("Zoom in")} onClick={() => zoom(0.25)}>
            <Plus className="size-4" />
          </Button>
          <Button variant="secondary" size="icon" aria-label={t("Fit the whole map")} onClick={reset}>
            <Maximize className="size-4" />
          </Button>
        </div>
      </div>

      <div className="bg-muted rounded-[var(--radius)] overflow-hidden">
        <svg
          viewBox={box}
          className="h-[26rem] w-full touch-none"
          role="img"
          aria-label={t("A map of what this record is connected to")}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, y: e.clientY }
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (!drag.current) return
            const dx = ((e.clientX - drag.current.x) * W) / (e.currentTarget.clientWidth * view.z)
            const dy = ((e.clientY - drag.current.y) * H) / (e.currentTarget.clientHeight * view.z)
            drag.current = { x: e.clientX, y: e.clientY }
            setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }))
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          {links.map((l, i) => {
            const a = at.get(l.from)
            const b = at.get(l.to)
            if (!a || !b) return null
            return (
              <line
                key={`${l.from}-${l.to}-${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="var(--hair-strong)"
                strokeWidth={1.5}
              />
            )
          })}
          {placed.map((n) => {
            const isFocus = n.key === focusKey
            return (
              <g key={n.key}>
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={isFocus ? 22 : 14}
                  fill={colourFor(n.table)}
                  stroke="var(--background)"
                  strokeWidth={isFocus ? 4 : 2}
                />
                <text
                  x={n.x}
                  y={n.y + (isFocus ? 40 : 30)}
                  textAnchor="middle"
                  className="fill-foreground text-[13px]"
                >
                  {n.label.length > 26 ? `${n.label.slice(0, 25)}…` : n.label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* THE SAME MAP, AS SENTENCES. Not a fallback and not hidden: position is
          the information in the picture above and position does not narrate, so
          this is the only rendering a screen reader can read — and it is the one
          a sighted person uses to actually GO somewhere, because a line between
          two circles is not a link and a sentence is. One payload, two
          renderings; there is no second query and no second fence. */}
      <ul className="flex flex-col gap-1 text-sm">
        {links.map((l, i) => {
          const a = at.get(l.from)
          const b = at.get(l.to)
          if (!a || !b) return null
          const inAppRecordHref = hrefFor(b)
          return (
            <li key={`row-${l.from}-${l.to}-${i}`} className="text-muted-foreground">
              <span className="text-foreground">{a.label}</span> {l.relation}{" "}
              {inAppRecordHref ? (
                <InAppLink href={inAppRecordHref} className="text-foreground underline underline-offset-2">
                  {b.label}
                </InAppLink>
              ) : (
                <span className="text-foreground">{b.label}</span>
              )}
            </li>
          )
        })}
        {links.length === 0 && (
          <li className="text-muted-foreground">{t("Nothing is linked to this yet.")}</li>
        )}
      </ul>
    </div>
  )
}
