import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Alert, AlertDescription } from "../../../shared/ui/components/alert/alert"
import { Button } from "../../../shared/ui/components/button/button"
import { CollectionRegister } from "../../../shared/ui/components/collection-frame/collection-frame"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../shared/ui/components/collapsible/collapsible"
import { Field } from "../../../shared/ui/components/field/field"
import { Input } from "../../../shared/ui/components/input/input"
import { ModeToggle, type ThemeMode } from "../../../shared/ui/components/mode-toggle/mode-toggle"
import { ToggleGroup, ToggleGroupItem } from "../../../shared/ui/components/toggle-group/toggle-group"
import { Hint, Text } from "../../../shared/ui/components/typography/typography"
import { ScreenShell } from "../../../shared/ui/compositions/templates/screen-shell"
import { CaretDown, DeviceMobile, Desktop, DownloadSimple, FileText, FolderOpen, SquareSplitHorizontal } from "../../../shared/ui/foundations/icons"
import { NO_SAMPLE, SAMPLES } from "../samples/index"
import { DEVICE_PAD, DEVICE_WIDTHS, type DropIntent, PreviewFrame } from "./frame"
import { Palette } from "./palette"
import { Properties } from "./properties"
import { download, parseScreen, screenJson, screenSummary, slug } from "./save"
import { Slot } from "./slot"
import type { Catalogue, Device, PlacedPart, Screen, Theme } from "./types"

/* THE BUILDER WEARS THE KIT'S OWN SHELL. `ScreenShell` already has the three
 * regions a builder needs — a rail, a body card, and an assistant column — so
 * the palette is the rail, the canvas is the body, and the options panel is
 * the assistant. Nothing here is a hand-rolled column: the shell decides the
 * widths, the handles, the density and the ground, and the owner's remark
 * ("it does not look like the screen builder was designed by the Kwapso
 * UI/UX") is answered by the tool literally being drawn by it.
 *
 * What the shell calls "the navbar" and "the assistant" this tool calls the
 * parts and the options — the labels are ours, the regions are the kit's.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE CANVAS IS THE SUBJECT, AND IT GETS THE ROOM. 5 September 2026.
 * ─────────────────────────────────────────────────────────────────────────
 * The owner: "very incomplete look, very difficult to manage, very difficult
 * to adjust." Measured at 1440 before this pass: the options column held a
 * third of the window to say one sentence — "Select a part on the canvas to
 * see its options" — and the desktop preview was left about 500px to draw
 * 1280 in, so the whole screen being designed rendered at 39% and read as a
 * postage stamp inside a large empty card.
 *
 * The options column is now OPEN ONLY WHEN A PART IS SELECTED, through the
 * shell's own `asideOpen`/`onAsideOpenChange` pair and its own collapse
 * animation. Nothing else changed to buy the room: with the column shut the
 * same window leaves ~1030px for the preview, so a desktop screen draws at
 * around 80% instead of 39%, and the scale is printed beside the frame
 * rather than left to be guessed at. */

const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const GAP = 24

export function Builder({ catalogue, css }: { catalogue: Catalogue; css: string }) {
  const [screen, setScreen] = useState<Screen>({ name: "", parts: [] })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [device, setDevice] = useState<Device>("desktop")
  const [mode, setMode] = useState<ThemeMode>("light")
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [asideOpen, setAsideOpen] = useState(false)
  const [wired, setWired] = useState<Record<string, string[]>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [canvasWidth, setCanvasWidth] = useState(1000)

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setCanvasWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The options follow the selection. Not a one-way door: the shell's own
  // handle still closes and reopens the column by hand, which is why this is
  // an effect on the selection rather than `asideOpen = selected !== null`.
  useEffect(() => {
    setAsideOpen(selectedId !== null)
  }, [selectedId])

  const parts = useMemo(() => new Map(catalogue.components.map((c) => [c.name, c])), [catalogue])
  const selected = screen.parts.find((p) => p.id === selectedId) ?? null
  const sampled = useCallback((name: string) => name in SAMPLES && !(name in NO_SAMPLE), [])
  // The preview frame takes light or dark; "system" is left to the frame's
  // own media query, which tokens.css already answers.
  const theme: Theme | null = mode === "system" ? null : mode

  // "end" is resolved inside the updater: two clicks in one tick would both
  // read the same stale length and land in reverse order otherwise.
  const insert = (part: string, index: number | "end", values: PlacedPart["values"] = {}, sandbox: PlacedPart["sandbox"] = {}) => {
    const placed: PlacedPart = { id: newId(), part, values, sandbox }
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
  /* A copy lands DIRECTLY BELOW its original and carries its options — the
     point of duplicating a part is a second one just like it, and a copy that
     appeared at the end of the screen with the defaults back would be a
     slower way of adding a fresh one. */
  const duplicate = (id: string) => {
    const from = screen.parts.find((p) => p.id === id)
    const at = screen.parts.findIndex((p) => p.id === id)
    if (!from) return
    insert(from.part, at + 1, structuredClone(from.values), { ...from.sandbox })
  }
  /* A CLICKED PART LANDS AFTER THE SELECTED ONE, not at the far end of the
     screen. This was the fiddliest thing about actually building a screen in
     the tool: every part appended, so anything you wanted in the middle had
     to be added at the bottom and then walked up one press at a time. With
     nothing selected it still appends, which is the only sensible reading of
     "add" on an empty canvas. */
  const addAfterSelection = (part: string) => {
    const at = screen.parts.findIndex((p) => p.id === selectedId)
    insert(part, at < 0 ? "end" : at + 1)
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

  const showDesktop = device !== "phone"
  const showPhone = device !== "desktop"
  /* ONE SCALE FOR WHATEVER IS ON SCREEN. Side by side, the two frames used to
     be scaled by different factors — the phone at 1:1 and the desktop by
     whatever was left — so the pair lied about their relative size, which is
     the one thing a side-by-side comparison is for. */
  const natural = (showDesktop ? DEVICE_WIDTHS.desktop : 0) + (showPhone ? DEVICE_WIDTHS.phone : 0) + (device === "both" ? GAP : 0)
  const scale = Math.min(1, Math.max(0.2, canvasWidth / natural))

  const canvas = (
    <div className="flex flex-col gap-[var(--space-6)]" onClick={() => setSelectedId(null)}>
      {screen.parts.length === 0 && (
        <CollectionRegister eyebrow="Canvas" title="Nothing here yet" body="Drag a part here, or click one in the list. Parts stack top to bottom — the app has no free placement, so neither does this." />
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
          onDuplicate={() => duplicate(placed.id)}
          onRemove={() => remove(placed.id)}
          onWired={(exports) => onWired(placed.id, exports)}
        />
      ))}
    </div>
  )

  const actions = (
    <div className="flex flex-wrap items-center gap-[var(--space-3)]">
      <Field label="Screen name" hideLabel>
        {(c) => <Input id={c.id} className="w-[14rem]" value={screen.name} onChange={(e) => setScreen((s) => ({ ...s, name: e.target.value }))} placeholder="Screen name" />}
      </Field>
      <ToggleGroup type="single" value={device} onValueChange={(v) => v && setDevice(v as Device)} aria-label="Preview width">
        <ToggleGroupItem value="desktop" aria-label={`Desktop, ${DEVICE_WIDTHS.desktop} wide`}>
          <Desktop />
          Desktop
        </ToggleGroupItem>
        <ToggleGroupItem value="phone" aria-label={`Phone, ${DEVICE_WIDTHS.phone} wide`}>
          <DeviceMobile />
          Phone
        </ToggleGroupItem>
        <ToggleGroupItem value="both" aria-label="Both, side by side">
          <SquareSplitHorizontal />
          Both
        </ToggleGroupItem>
      </ToggleGroup>
      <ModeToggle mode={mode} onModeChange={setMode} label="Preview theme" />
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
      <Button variant="secondary" onClick={() => fileRef.current?.click()}>
        <FolderOpen />
        Load
      </Button>
      <Button variant="secondary" onClick={() => download(`${slug(screen.name)}.summary.md`, screenSummary(screen, catalogue), "text/markdown")}>
        <FileText />
        Save summary
      </Button>
      <Button onClick={() => download(`${slug(screen.name)}.screen.json`, screenJson(screen, catalogue), "application/json")}>
        <DownloadSimple />
        Save screen
      </Button>
    </div>
  )

  return (
    <ScreenShell
      rail={<Palette catalogue={catalogue} collapsed={railCollapsed} onAdd={addAfterSelection} sampled={sampled} />}
      railLabel="Parts"
      railCollapsed={railCollapsed}
      onRailCollapsedChange={setRailCollapsed}
      railCollapseLabel="Collapse the parts"
      railExpandLabel="Open the parts"
      aside={
        <Properties
          part={selected ? parts.get(selected.part) ?? null : null}
          placed={selected}
          wired={new Set(selected ? wired[selected.id] ?? [] : [])}
          onChange={(exportName, prop, value) => selected && setValue(selected.id, exportName, prop, value)}
          onSandbox={(patch) => selected && setSandbox(selected.id, patch)}
        />
      }
      asideLabel="Options"
      asideOpen={asideOpen}
      onAsideOpenChange={setAsideOpen}
      asideOpenLabel="Open the options"
      asideCloseLabel="Close the options"
      eyebrow={`kit ${catalogue.kit.tag} · ${catalogue.kit.sha.slice(0, 7)} · synced ${catalogue.kit.syncedAt}`}
      title="Screen builder"
      actions={actions}
      /* ONE LINE, AND THE REST BEHIND A DISCLOSURE. It used to be a paragraph
         standing between the toolbar and the canvas on every visit, saying
         the same two things it said the first time. */
      meta={
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="text" size="sm">
              <CaretDown />
              Kit parts with dummy data, at two widths. What this page cannot do
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Text size="sm" tone="tertiary" as="div">
              This page cannot read Aurora's GitHub — the kit repository is private and a browser page has no way in. What you see is the kit vendored at the tag above; <code>node scripts/build-screen-builder.mjs</code> regenerates this page after <code>scripts/sync-design.mjs</code> pulls a new tag. Preview widths are a device choice, not a kit option, and the catalogue was generated{" "}
              {catalogue.generatedAt.slice(0, 16).replace("T", " ")}.
            </Text>
          </CollapsibleContent>
        </Collapsible>
      }
    >
      <div ref={canvasRef} className="flex flex-col gap-[var(--space-4)]">
        {notice && (
          <Alert variant="info">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        {/* Centred: at the phone width the frame is 390 of ~1000, and left-aligned
            it read as a page pushed into a corner rather than as a phone. */}
        <div className="flex items-start justify-center" style={{ gap: GAP * scale }}>
          {showDesktop && (
            <PreviewFrame width={DEVICE_WIDTHS.desktop} pad={DEVICE_PAD.desktop} scale={scale} theme={theme} css={css} onDrop={onDrop}>
              {canvas}
            </PreviewFrame>
          )}
          {showPhone && (
            <PreviewFrame width={DEVICE_WIDTHS.phone} pad={DEVICE_PAD.phone} scale={scale} theme={theme} css={css} onDrop={onDrop}>
              {canvas}
            </PreviewFrame>
          )}
        </div>
        {/* The scale is stated rather than left to be guessed at: a person
            reading a wireframe needs to know whether a control looks small
            because it is small or because the whole page is at 62%. */}
        <Hint>
          {showDesktop && `Desktop ${DEVICE_WIDTHS.desktop}px`}
          {device === "both" && " · "}
          {showPhone && `Phone ${DEVICE_WIDTHS.phone}px`} · drawn at {Math.round(scale * 100)}% · dummy data throughout
        </Hint>
      </div>
    </ScreenShell>
  )
}
