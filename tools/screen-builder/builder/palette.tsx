import { useMemo, useState } from "react"

import { Button } from "../../../shared/ui/components/button/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../shared/ui/components/collapsible/collapsible"
import { List, type ListRow } from "../../../shared/ui/components/list/list"
import { SearchInput } from "../../../shared/ui/components/search-input/search-input"
import { Hint, Text } from "../../../shared/ui/components/typography/typography"
import { CaretDown, DotsSixVertical } from "../../../shared/ui/foundations/icons"
import { optionCount } from "./options"
import type { Catalogue } from "./types"

/* THE PALETTE IS THE SHELL'S RAIL. Every catalogued part, grouped as the kit
 * groups them on disk: components/ is FLAT — one folder per part — so the
 * grouping is the alphabet, drawn as the kit's own `List`, with the
 * compositions (already-built screens) under a `Collapsible` beneath.
 *
 * Drawn from kit parts only: `SearchInput` to find, `List` for the rows (the
 * row's `action` slot carries the drag handle, a kit `Button`), `Text`/`Hint`
 * for the words. The rail can collapse to the icon register the navbar has;
 * a palette has no icon register, so when the shell collapses it this
 * publishes `data-rail-collapsed` (which is how the column narrows) and draws
 * nothing — the shell's own handle brings it back. */

export function Palette({
  catalogue,
  collapsed,
  onAdd,
  sampled,
}: {
  catalogue: Catalogue
  collapsed: boolean
  onAdd: (part: string) => void
  sampled: (part: string) => boolean
}) {
  const [q, setQ] = useState("")
  const parts = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return catalogue.components.filter((p) => !needle || p.name.includes(needle) || p.exports.some((e) => e.name.toLowerCase().includes(needle)))
  }, [catalogue, q])

  if (collapsed) return <div data-rail-collapsed="" />

  const rows: ListRow[] = parts.map((p) => {
    const hook = p.kind === "hook"
    const drawable = !hook && sampled(p.name)
    const n = optionCount(p)
    return {
      id: p.name,
      title: p.name,
      // The rail is 13rem wide; the count rides the second line so the name
      // keeps the first, and the trailing slot holds only the drag handle.
      description: hook ? "a hook draws nothing" : !drawable ? "no dummy data yet" : n === 0 ? "no options" : `${n} option${n === 1 ? "" : "s"}`,
      disabled: !drawable,
      action: drawable ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Drag ${p.name} onto the canvas`}
          title="Drag onto the canvas"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/kit-part", p.name)
            e.dataTransfer.effectAllowed = "copy"
          }}
        >
          <DotsSixVertical />
        </Button>
      ) : undefined,
    }
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[var(--space-3)]">
      <SearchInput label="Find a part" placeholder="Find a part" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ("")} />
      <Text size="caption" tone="tertiary">
        {catalogue.counts.components} parts · {catalogue.counts.withVariants} with variants · {catalogue.counts.withoutVariants} with none. Click a part to add it at the end, or drag its handle onto the canvas.
      </Text>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <List
          variant="rows"
          density="comfortable"
          label="Kit parts"
          rows={rows}
          state={rows.length === 0 ? "empty" : "ready"}
          emptyTitle="No part matches"
          onRowSelect={(_, row) => row.id && onAdd(row.id)}
        />
      </div>
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="text" size="sm">
            <CaretDown />
            {catalogue.counts.compositions} compositions (reference only)
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Hint>Already-built screens, templates, overlays and states. The builder assembles parts; these are what the kit already assembled.</Hint>
          <div className="max-h-48 overflow-y-auto">
            {catalogue.compositions.map((c) => (
              <Hint key={c.file} as="div">
                {c.group}/{c.name}
              </Hint>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
