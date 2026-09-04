import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { NO_SAMPLE, SAMPLES } from "../samples/index"
import { DEVICE_WIDTHS, type DropIntent, PreviewFrame } from "./frame"
import { Palette } from "./palette"
import { Properties } from "./properties"
import { download, parseScreen, screenJson, screenSummary, slug } from "./save"
import { Slot } from "./slot"
import type { Catalogue, Device, PlacedPart, Screen, Theme } from "./types"

const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export function Builder({ catalogue, css }: { catalogue: Catalogue; css: string }) {
  const [screen, setScreen] = useState<Screen>({ name: "", parts: [] })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [device, setDevice] = useState<Device>("desktop")
  const [theme, setTheme] = useState<Theme>("light")
  const [wired, setWired] = useState<Record<string, string[]>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [canvasWidth, setCanvasWidth] = useState(1000)

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setCanvasWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const parts = useMemo(() => new Map(catalogue.components.map((c) => [c.name, c])), [catalogue])
  const selected = screen.parts.find((p) => p.id === selectedId) ?? null
  const sampled = useCallback((name: string) => name in SAMPLES && !(name in NO_SAMPLE), [])

  // "end" is resolved inside the updater: two clicks in one tick would both
  // read the same stale length and land in reverse order otherwise.
  const insert = (part: string, index: number | "end") => {
    const placed: PlacedPart = { id: newId(), part, values: {}, sandbox: {} }
    setScreen((s) => {
      const at = index === "end" ? s.parts.length : index
      return { ...s, parts: [...s.parts.slice(0, at), placed, ...s.parts.slice(at)] }
    })
    setSelectedId(placed.id)
  }
  const move = (id: string, index: number) => {
    setScreen((s) => {
      const from = s.parts.findIndex((p) => p.id === id)
      if (from < 0) return s
      const next = s.parts.slice()
      const [item] = next.splice(from, 1)
      next.splice(index > from ? index - 1 : index, 0, item)
      return { ...s, parts: next }
    })
  }
  const onDrop = useCallback((intent: DropIntent) => {
    if (intent.kind === "add") insert(intent.part, intent.index)
    else move(intent.id, intent.index)
  }, [])
  const setValue = (id: string, exportName: string, prop: string, value: unknown) =>
    setScreen((s) => ({
      ...s,
      parts: s.parts.map((p) => (p.id === id ? { ...p, values: { ...p.values, [exportName]: { ...p.values[exportName], [prop]: value } } } : p)),
    }))
  const setSandbox = (id: string, patch: PlacedPart["sandbox"]) =>
    setScreen((s) => ({ ...s, parts: s.parts.map((p) => (p.id === id ? { ...p, sandbox: { ...p.sandbox, ...patch } } : p)) }))
  const remove = (id: string) => {
    setScreen((s) => ({ ...s, parts: s.parts.filter((p) => p.id !== id) }))
    if (selectedId === id) setSelectedId(null)
  }
  const onWired = useCallback((id: string, exports: string[]) => {
    setWired((w) => (JSON.stringify(w[id]) === JSON.stringify(exports) ? w : { ...w, [id]: exports }))
  }, [])

  const load = async (file: File) => {
    try {
      const parsed = parseScreen(await file.text())
      const unknown = parsed.parts.filter((p) => !parts.has(p.part)).map((p) => p.part)
      setScreen({ ...parsed, parts: parsed.parts.filter((p) => parts.has(p.part)) })
      setSelectedId(null)
      setNotice(unknown.length ? `Dropped ${unknown.length} part(s) this kit does not have: ${unknown.join(", ")}` : `Loaded ${parsed.parts.length} part(s).`)
    } catch (e) {
      setNotice(`Could not load: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const gap = 24
  const showDesktop = device !== "phone"
  const showPhone = device !== "desktop"
  const room = canvasWidth - (device === "both" ? DEVICE_WIDTHS.phone + gap : 0)
  const desktopScale = Math.min(1, Math.max(0.2, room / DEVICE_WIDTHS.desktop))

  const canvas = (
    <div className="flex flex-col" onClick={() => setSelectedId(null)}>
      {screen.parts.length === 0 && (
        <p className="p-8 text-center text-sm text-ink-tertiary">Drag a part here, or click one in the list. Parts stack top to bottom — the app has no free placement, so neither does this.</p>
      )}
      {screen.parts.map((placed, i) => (
        <Slot
          key={placed.id}
          placed={placed}
          sample={SAMPLES[placed.part]}
          selected={placed.id === selectedId}
          index={i}
          count={screen.parts.length}
          onSelect={() => setSelectedId(placed.id)}
          onMove={(d) => move(placed.id, i + d + (d > 0 ? 1 : 0))}
          onRemove={() => remove(placed.id)}
          onWired={(exports) => onWired(placed.id, exports)}
        />
      ))}
    </div>
  )

  return (
    <div className="grid h-screen grid-cols-[260px_minmax(0,1fr)_320px] grid-rows-[auto_minmax(0,1fr)] gap-x-4 bg-background p-4 text-foreground">
      <header className="col-span-3 mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-3">
        <h1 className="text-base font-[var(--font-weight-medium)]">kwapso screen builder</h1>
        <p className="text-xs text-ink-secondary">
          kit <span className="font-mono">{catalogue.kit.tag}</span> · <span className="font-mono">{catalogue.kit.sha.slice(0, 7)}</span> · synced {catalogue.kit.syncedAt} · catalogue generated {catalogue.generatedAt.slice(0, 16).replace("T", " ")}
        </p>
        <p className="basis-full text-xs text-ink-tertiary">
          This page cannot read Aurora's GitHub — the kit repository is private and a browser page has no way in. What you see is the kit vendored at the tag above, and <code className="font-mono">node scripts/build-screen-builder.mjs</code> regenerates this page after <code className="font-mono">scripts/sync-design.mjs</code> pulls a new tag.
        </p>
        <div className="ml-auto flex items-center gap-2">
          <input
            value={screen.name}
            onChange={(e) => setScreen((s) => ({ ...s, name: e.target.value }))}
            placeholder="Screen name"
            aria-label="Screen name"
            className="h-8 w-44 rounded-[var(--radius)] border border-border bg-card px-2 text-sm"
          />
          <Segmented value={device} onChange={setDevice} options={[["desktop", `Desktop ${DEVICE_WIDTHS.desktop}`], ["phone", `Phone ${DEVICE_WIDTHS.phone}`], ["both", "Both"]]} />
          <Segmented value={theme} onChange={setTheme} options={[["light", "Light"], ["dark", "Dark"]]} />
          <label className="cursor-pointer rounded-pill border border-border px-3 py-1 text-xs hover:bg-accent">
            Load
            <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
          </label>
          <button type="button" className="rounded-pill border border-border px-3 py-1 text-xs hover:bg-accent" onClick={() => download(`${slug(screen.name)}.summary.md`, screenSummary(screen, catalogue), "text/markdown")}>
            Save summary
          </button>
          <button type="button" className="rounded-pill bg-[var(--btn-primary-fill)] px-3 py-1 text-xs text-[var(--btn-primary-label)]" onClick={() => download(`${slug(screen.name)}.screen.json`, screenJson(screen, catalogue), "application/json")}>
            Save screen
          </button>
        </div>
        {notice && (
          <p className="basis-full text-xs text-ink-secondary" role="status">
            {notice}
          </p>
        )}
      </header>

      <Palette catalogue={catalogue} onAdd={(part) => insert(part, "end")} sampled={sampled} />

      <main ref={canvasRef} className="min-h-0 overflow-auto rounded-[var(--radius)] border border-border bg-accent p-4">
        <p className="mb-3 text-xs text-ink-tertiary">Preview widths are a device choice, not a kit option. Dummy data throughout; nothing renders empty.</p>
        <div className="flex items-start" style={{ gap }}>
          {showDesktop && (
            <PreviewFrame width={DEVICE_WIDTHS.desktop} scale={device === "desktop" ? Math.min(1, canvasWidth / DEVICE_WIDTHS.desktop) : desktopScale} theme={theme} css={css} onDrop={onDrop}>
              {canvas}
            </PreviewFrame>
          )}
          {showPhone && (
            <PreviewFrame width={DEVICE_WIDTHS.phone} scale={1} theme={theme} css={css} onDrop={onDrop}>
              {canvas}
            </PreviewFrame>
          )}
        </div>
      </main>

      <Properties
        part={selected ? parts.get(selected.part) ?? null : null}
        placed={selected}
        wired={new Set(selected ? wired[selected.id] ?? [] : [])}
        onChange={(exportName, prop, value) => selected && setValue(selected.id, exportName, prop, value)}
        onSandbox={(patch) => selected && setSandbox(selected.id, patch)}
      />
    </div>
  )
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div role="radiogroup" className="flex overflow-hidden rounded-pill border border-border text-xs">
      {options.map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`px-3 py-1 ${value === v ? "bg-[var(--btn-inverse-fill)] text-[var(--btn-inverse-label)]" : "hover:bg-accent"}`}>
          {label}
        </button>
      ))}
    </div>
  )
}
