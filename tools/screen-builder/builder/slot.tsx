import { Component, type ErrorInfo, type ReactNode, useEffect, useRef } from "react"

import type { PartProps, Sample } from "../samples/index"
import type { PlacedPart } from "./types"

/* ONE PLACED PART ON THE CANVAS: the sample rendered with the chosen values,
 * inside a wrapper the builder owns (select, move, remove). The wrapper is the
 * tool's chrome and is deliberately plain — it is not a kit part and does not
 * pretend to be one.
 *
 * WIRING IS OBSERVED, NOT DECLARED. A sample spreads `p.of("Button")` onto the
 * export the options belong to; if it never asks for an export, the panel's
 * controls for that export would silently do nothing. So `of` records what
 * was asked for during render and the slot reports it up, and the panel
 * marks the rest "not wired in this sample". Nobody maintains a list. */

export function Slot({
  placed,
  sample,
  selected,
  index,
  count,
  onSelect,
  onMove,
  onRemove,
  onWired,
}: {
  placed: PlacedPart
  sample: Sample | undefined
  selected: boolean
  index: number
  count: number
  onSelect: () => void
  onMove: (delta: number) => void
  onRemove: () => void
  onWired: (exports: string[]) => void
}) {
  const asked = useRef(new Set<string>())
  asked.current = new Set()
  const p: PartProps = {
    of: (exportName) => {
      asked.current.add(exportName)
      return placed.values[exportName] ?? {}
    },
  }
  const body = sample ? sample.render(p) : <p className="text-sm text-ink-tertiary">No dummy data written for this part.</p>
  const wiredKey = [...asked.current].sort().join(",")
  useEffect(() => {
    onWired(wiredKey ? wiredKey.split(",") : [])
  }, [wiredKey, onWired])

  return (
    <div
      data-slot-id={placed.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/kit-move", placed.id)
        e.dataTransfer.effectAllowed = "move"
      }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      style={{ background: placed.sandbox.background }}
      className={`group relative ${selected ? "outline-2 outline-offset-2 outline-primary" : "hover:outline-1 hover:outline-offset-2 hover:outline-border"}`}
    >
      <div className={`absolute -top-3 right-2 z-10 flex items-center gap-1 rounded-pill border border-border bg-card px-2 py-0.5 text-[11px] text-ink-secondary shadow-sm ${selected ? "" : "opacity-0 group-hover:opacity-100"}`}>
        <span className="font-mono">{placed.part}</span>
        <button type="button" title="Move up" disabled={index === 0} onClick={(e) => (e.stopPropagation(), onMove(-1))} className="px-1 disabled:opacity-30">
          ↑
        </button>
        <button type="button" title="Move down" disabled={index === count - 1} onClick={(e) => (e.stopPropagation(), onMove(1))} className="px-1 disabled:opacity-30">
          ↓
        </button>
        <button type="button" title="Remove" onClick={(e) => (e.stopPropagation(), onRemove())} className="px-1 text-destructive">
          ×
        </button>
      </div>
      <PartBoundary key={JSON.stringify(placed.values)}>{body}</PartBoundary>
    </div>
  )
}

class PartBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
  componentDidCatch(_e: Error, _info: ErrorInfo) {}
  render() {
    if (this.state.error)
      return (
        <p className="rounded-[var(--radius)] border border-destructive p-3 font-mono text-xs text-destructive">
          This part threw with these values: {this.state.error}
        </p>
      )
    return this.props.children
  }
}
