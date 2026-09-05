import { useMemo, useState } from "react"

import { Button } from "../../../shared/ui/components/button/button"
import { Card } from "../../../shared/ui/components/card/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../shared/ui/components/collapsible/collapsible"
import { SearchInput } from "../../../shared/ui/components/search-input/search-input"
import { Hint, Text } from "../../../shared/ui/components/typography/typography"
import { CaretDown } from "../../../shared/ui/foundations/icons"
import { SAMPLES } from "../samples/index"
import { optionCount } from "./options"
import { PartThumb } from "./thumb"
import type { Catalogue } from "./types"

/* THE PALETTE IS THE SHELL'S RAIL, AND EVERY PART IN IT SHOWS ITSELF.
 *
 * REBUILT 5 September 2026 on the owner's verdict — "I cannot visualise a
 * component … 116 components … how am I supposed to know what everything is
 * just by how it looks", and, on the column it was drawn in, "part names are
 * truncated at about ten characters". Three things changed and they are one
 * change: a tile instead of a row, a live thumbnail on every tile
 * (`./thumb.tsx`), and a name that WRAPS instead of being cut. A cut-off name
 * in a tool whose only job is helping somebody choose a part is the worst
 * possible place to save space.
 *
 * WHY THE COLUMN IS WIDER THAN A RAIL, AND HOW. `screen-shell` fixes the rail
 * at `13rem` — 208px, the navbar's measure, which is where the truncation
 * came from. It also states the one hatch out, in its own words: a rail that
 * publishes `data-rail-collapsed` makes the column `w-auto` and "the column
 * takes its content's width instead … so a rail that collapses itself is
 * still seated correctly". This palette IS a rail that sizes itself: it
 * publishes that attribute in both states and declares its own width — the
 * grid when open, nothing at all when the shell's handle shuts it. No class
 * of the kit's is overridden and no width is invented in a wrapper; the
 * shell's own CSS relationship does the seating. Recorded in the README's
 * gap table, because the kit lacking a self-measuring rail is a real gap and
 * this is the workaround, not the answer.
 *
 * NO GROUPING IS OFFERED, and that is a finding rather than a shortcut. The
 * kit's own `docs/ARTIFACT-MAP.md` files parts by chapter, but it names only
 * 55 of the 116 — the other 61 have no chapter anywhere in the kit. Grouping
 * half of them and calling the rest "other" would be inventing a category,
 * which is the one thing this tool must never do. So: one searchable set.
 *
 * Drawn from kit parts only: `SearchInput` to find, `Card` (`interactive`,
 * with the `role`/`tabIndex` its own docblock asks a call site for) as the
 * tile, `Text`/`Hint` for the words, `Collapsible` for the compositions. */

/** The palette's own measure. Two tile columns is what the owner asked for
 * ("two or three columns of preview cards scan far better than 116 rows")
 * and 320 is the narrowest width at which two tiles still show a shape
 * rather than a texture. Read by `builder.tsx` for the canvas arithmetic. */
export const PALETTE_WIDTH = 320
const TILE_PICTURE = 92

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

  // Shut by the shell's own handle: draw nothing, and the `w-auto` rule above
  // narrows the column to this empty div.
  if (collapsed) return <div data-rail-collapsed="" />

  return (
    <div data-rail-collapsed="" className="flex min-h-0 flex-1 flex-col gap-[var(--space-3)]" style={{ width: PALETTE_WIDTH }}>
      <SearchInput label="Find a part" placeholder="Find a part" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ("")} />
      <Text size="caption" tone="tertiary">
        {parts.length === catalogue.counts.components ? `${catalogue.counts.components} parts` : `${parts.length} of ${catalogue.counts.components} parts`} · click to add after the selection, or drag one in
      </Text>

      {/* `overflow-anchor:none`: a tile's picture is sized from what it drew, so
            every tile that mounts changes its own height, and Chrome's scroll
            anchoring answers a height change above the fold by moving the
            scroll. Left on, the palette walked itself four rows down while the
            first screenful was still drawing. */}
        <div data-thumb-root="" className="-mx-[var(--space-1)] min-h-0 flex-1 overflow-y-auto px-[var(--space-1)] pb-[var(--space-2)] [overflow-anchor:none]">
        {parts.length === 0 ? (
          <Text size="sm" tone="secondary">
            No part matches “{q}”.
          </Text>
        ) : (
          <div className="grid grid-cols-2 items-start gap-[var(--space-2)]">
            {parts.map((p) => {
              const drawable = p.kind !== "hook" && sampled(p.name)
              const n = optionCount(p)
              return (
                <Card
                  key={p.name}
                  variant="well"
                  interactive={drawable}
                  role={drawable ? "button" : undefined}
                  tabIndex={drawable ? 0 : -1}
                  aria-disabled={drawable ? undefined : true}
                  draggable={drawable}
                  title={drawable ? `Add ${p.name}` : `${p.name} — ${p.kind === "hook" ? "a hook draws nothing" : "no dummy data yet"}`}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/kit-part", p.name)
                    e.dataTransfer.effectAllowed = "copy"
                  }}
                  onClick={() => drawable && onAdd(p.name)}
                  onKeyDown={(e) => {
                    if (drawable && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault()
                      onAdd(p.name)
                    }
                  }}
                  className={`gap-[var(--space-2)] p-[var(--space-2)] ${drawable ? "cursor-pointer" : "opacity-60"}`}
                >
                  <PartThumb name={p.name} sample={SAMPLES[p.name]} height={TILE_PICTURE} />
                  {/* The name WRAPS. It is never truncated, at any width — the
                      one thing the owner named twice. */}
                  <Text size="caption" className="break-words">
                    {p.name}
                  </Text>
                  <Hint>{p.kind === "hook" ? "a hook" : n === 0 ? "no options" : `${n} option${n === 1 ? "" : "s"}`}</Hint>
                </Card>
              )
            })}
          </div>
        )}
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
          <div className="max-h-40 overflow-y-auto">
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
