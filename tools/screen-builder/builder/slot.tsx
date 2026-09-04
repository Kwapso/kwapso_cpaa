import { Component, type ErrorInfo, type ReactNode, useEffect, useRef } from "react"

import { Alert, AlertDescription, AlertTitle } from "../../../shared/ui/components/alert/alert"
import { Badge } from "../../../shared/ui/components/badge/badge"
import { Button } from "../../../shared/ui/components/button/button"
import { Text } from "../../../shared/ui/components/typography/typography"
import { ArrowDown, ArrowUp, X } from "../../../shared/ui/foundations/icons"
import type { PartProps, Sample } from "../samples/index"
import type { PlacedPart } from "./types"

/* ONE PLACED PART ON THE CANVAS: the sample rendered with the chosen values,
 * inside a wrapper the builder owns (select, move, remove). The handle strip
 * is kit parts — a `Badge` for the name and three icon `Button`s — floated
 * over the part's top-right corner by a wrapper of this file's own, which is
 * the one thing here the kit does not supply (see the README's gap list).
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
  const body = sample ? sample.render(p) : <Text tone="tertiary">No dummy data written for this part.</Text>
  const wiredKey = [...asked.current].sort().join(",")
  useEffect(() => {
    onWired(wiredKey ? wiredKey.split(",") : [])
  }, [wiredKey, onWired])

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn()
  }

  return (
    <div
      data-slot-id={placed.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/kit-move", placed.id)
        e.dataTransfer.effectAllowed = "move"
      }}
      onClick={stop(onSelect)}
      style={{ background: placed.sandbox.background }}
      className={`group relative rounded-[var(--radius)] ${selected ? "outline-2 outline-offset-4 outline-primary" : "hover:outline-1 hover:outline-offset-4 hover:outline-border"}`}
    >
      <div className={`absolute -top-[var(--space-4)] right-[var(--space-3)] z-10 flex items-center gap-[var(--space-1)] ${selected ? "" : "opacity-0 group-hover:opacity-100"}`}>
        <Badge variant="inverse" size="pill">
          {placed.part}
        </Badge>
        <Button variant="secondary" size="sm" aria-label="Move up" title="Move up" disabled={index === 0} onClick={stop(() => onMove(-1))}>
          <ArrowUp />
        </Button>
        <Button variant="secondary" size="sm" aria-label="Move down" title="Move down" disabled={index === count - 1} onClick={stop(() => onMove(1))}>
          <ArrowDown />
        </Button>
        <Button variant="destructive" size="sm" aria-label="Remove" title="Remove" onClick={stop(onRemove)}>
          <X />
        </Button>
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
        <Alert variant="destructive">
          <AlertTitle>This part threw with these values</AlertTitle>
          <AlertDescription>
            <code>{this.state.error}</code>
          </AlertDescription>
        </Alert>
      )
    return this.props.children
  }
}
