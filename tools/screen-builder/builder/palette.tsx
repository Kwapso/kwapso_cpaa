import { useMemo, useState } from "react"

import { optionCount } from "./options"
import type { Catalogue, Part } from "./types"

/* Every catalogued part, grouped as the kit groups them on disk: components/
 * is FLAT — one folder per part — so the grouping is the alphabet, and the
 * compositions (already-built screens) are a reference list underneath. */

export function Palette({ catalogue, onAdd, sampled }: { catalogue: Catalogue; onAdd: (part: string) => void; sampled: (part: string) => boolean }) {
  const [q, setQ] = useState("")
  const [showCompositions, setShowCompositions] = useState(false)
  const parts = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return catalogue.components.filter((p) => !needle || p.name.includes(needle) || p.exports.some((e) => e.name.toLowerCase().includes(needle)))
  }, [catalogue, q])

  return (
    <aside className="flex min-h-0 flex-col gap-3">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find a part"
        aria-label="Find a part"
        className="h-9 w-full rounded-[var(--radius)] border border-border bg-card px-3 text-sm text-foreground"
      />
      <p className="text-xs text-ink-tertiary">
        {catalogue.counts.components} parts · {catalogue.counts.withVariants} with variants · {catalogue.counts.withoutVariants} with none. Drag onto the canvas, or click to add at the end.
      </p>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {parts.map((p) => (
          <PaletteRow key={p.name} part={p} onAdd={onAdd} drawable={p.kind === "component" && sampled(p.name)} />
        ))}
        {parts.length === 0 && <li className="px-2 py-4 text-sm text-ink-tertiary">No part matches.</li>}
      </ul>
      <div className="border-t border-border pt-2">
        <button type="button" onClick={() => setShowCompositions((v) => !v)} className="text-xs text-ink-secondary underline underline-offset-2">
          {showCompositions ? "Hide" : "Show"} the {catalogue.counts.compositions} compositions (reference only)
        </button>
        {showCompositions && (
          <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto text-xs text-ink-tertiary">
            <li className="pb-1 text-ink-secondary">Already-built screens, templates, overlays and states. The builder assembles parts; these are what the kit already assembled.</li>
            {catalogue.compositions.map((c) => (
              <li key={c.file} className="font-mono">
                {c.group}/{c.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

function PaletteRow({ part, onAdd, drawable }: { part: Part; onAdd: (part: string) => void; drawable: boolean }) {
  const n = optionCount(part)
  const hook = part.kind === "hook"
  return (
    <li>
      <button
        type="button"
        draggable={drawable}
        disabled={!drawable}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/kit-part", part.name)
          e.dataTransfer.effectAllowed = "copy"
        }}
        onClick={() => drawable && onAdd(part.name)}
        title={hook ? "A hook draws nothing; it cannot be placed." : drawable ? part.description ?? part.name : "No dummy data written for this part yet — see NO_SAMPLE in samples/index.ts."}
        className="flex w-full items-center justify-between gap-2 rounded-[var(--radius)] px-2 py-1.5 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="truncate">{part.name}</span>
        <span className="shrink-0 text-xs text-ink-tertiary">{hook ? "hook" : n === 0 ? "no options" : `${n} option${n === 1 ? "" : "s"}`}</span>
      </button>
    </li>
  )
}
