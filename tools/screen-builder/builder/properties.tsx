import { type Control, controlsFor } from "./options"
import type { Part, PlacedPart } from "./types"

/* ONLY THE PART'S REAL OPTIONS, from the catalogue. Every select lists exactly
 * the values the kit's cva (or its Props type) declares, spelled as the kit
 * spells them, and shows the Tailwind class string that value applies — the
 * string the kit wrote, so a developer reading the saved summary sees the
 * same words. A part with nothing configurable says so.
 *
 * The one control that is NOT a kit option — a background behind the part —
 * sits under its own heading that says exactly that. The owner asked to be
 * able to SHOW what he means; the app has one page width per door, a closed
 * palette and two radii, all machine-checked, so this cannot ship as it is
 * drawn here and the label says so where he will look for it. */

export function Properties({
  part,
  placed,
  wired,
  onChange,
  onSandbox,
}: {
  part: Part | null
  placed: PlacedPart | null
  wired: Set<string>
  onChange: (exportName: string, prop: string, value: unknown) => void
  onSandbox: (patch: PlacedPart["sandbox"]) => void
}) {
  if (!part || !placed)
    return (
      <aside className="text-sm text-ink-tertiary">
        <p>Select a part on the canvas to see its options.</p>
      </aside>
    )
  const { exports, internal, total } = controlsFor(part)
  return (
    <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1 text-sm">
      <header>
        <h2 className="font-[var(--font-weight-medium)] text-foreground">{part.name}</h2>
        <p className="font-mono text-xs text-ink-tertiary">{part.files.join(", ")}</p>
        {part.description && <p className="mt-1 text-xs text-ink-secondary">{part.description}</p>}
      </header>

      {total === 0 && (
        <p className="rounded-[var(--radius)] border border-border bg-card p-3 text-ink-secondary">
          No options in the kit for this part. It has no <code className="font-mono text-xs">cva()</code> variants and no enum or boolean props of its own. Nothing is invented here.
        </p>
      )}

      {exports.map((e) => (
        <section key={e.exportName} className="space-y-3">
          <h3 className="flex items-center justify-between font-mono text-xs text-ink-secondary">
            <span>&lt;{e.exportName}&gt;</span>
            {!wired.has(e.exportName) && <span className="text-warning-strong">not wired in this sample</span>}
          </h3>
          {e.controls.map((c) => (
            <ControlField key={c.name} control={c} value={placed.values[e.exportName]?.[c.name]} onChange={(v) => onChange(e.exportName, c.name, v)} />
          ))}
        </section>
      ))}

      {internal.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs text-ink-secondary">Internal variants (no export takes them as a prop)</h3>
          {internal.map((s) => (
            <details key={s.name} className="rounded-[var(--radius)] border border-border p-2 text-xs">
              <summary className="cursor-pointer font-mono">{s.name}</summary>
              {s.groups.map((g) => (
                <p key={g.name} className="mt-1">
                  <span className="text-ink-secondary">{g.name}:</span> {g.options.map((o) => o.name).join(", ")}
                </p>
              ))}
            </details>
          ))}
        </section>
      )}

      <section className="space-y-2 rounded-[var(--radius)] border border-dashed border-warning p-3">
        <h3 className="text-xs font-[var(--font-weight-medium)] text-warning-strong">Sandbox — not a kit option, not shippable</h3>
        <p className="text-xs text-ink-secondary">
          A background behind this part, to show what you mean. The app has one page width per door, a closed colour palette and two radii, all machine-checked; free placement and backgrounds do not exist there. This is saved under the word <code className="font-mono">sandbox</code> so nobody reads it as a kit option.
        </p>
        <label className="flex items-center gap-2 text-xs">
          <input type="color" value={placed.sandbox.background ?? "#ffffff"} onChange={(e) => onSandbox({ background: e.target.value })} aria-label="Sandbox background" />
          <span className="font-mono">{placed.sandbox.background ?? "none"}</span>
          {placed.sandbox.background && (
            <button type="button" className="underline" onClick={() => onSandbox({ background: undefined })}>
              clear
            </button>
          )}
        </label>
      </section>
    </aside>
  )
}

function ControlField({ control, value, onChange }: { control: Control; value: unknown; onChange: (v: unknown) => void }) {
  const source = (
    <p className="font-mono text-[11px] text-ink-tertiary">
      {control.from} · {control.where}
    </p>
  )
  if (control.kind === "boolean")
    return (
      <div className="space-y-1">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked ? true : undefined)} />
          <span className="font-mono text-xs">{control.name}</span>
        </label>
        {control.note && <p className="text-xs text-ink-secondary">{control.note}</p>}
        {source}
      </div>
    )
  const options = control.kind === "variant" ? control.options : control.values.map((v) => ({ name: v, classes: null, note: null }))
  const current = value === undefined ? (control.kind === "variant" ? control.defaultValue : undefined) : value
  const chosen = options.find((o) => o.name === current)
  return (
    <div className="space-y-1">
      <label className="block">
        <span className="font-mono text-xs">{control.name}</span>
        <select
          value={typeof current === "string" ? current : ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
          className="mt-1 h-8 w-full rounded-[var(--radius)] border border-border bg-card px-2 text-sm"
        >
          {control.kind === "enum" && <option value="">(unset)</option>}
          {options.map((o) => (
            <option key={o.name} value={o.name}>
              {o.name}
              {control.kind === "variant" && o.name === control.defaultValue ? " (default)" : ""}
            </option>
          ))}
        </select>
      </label>
      {chosen?.note && <p className="text-xs text-ink-secondary">{chosen.note}</p>}
      {control.kind === "variant" && chosen && (
        <p className="rounded-[var(--radius)] bg-accent p-1.5 font-mono text-[11px] leading-snug break-words text-ink-secondary">{chosen.classes ?? "(class string not statically readable — see catalogue.unresolved)"}</p>
      )}
      {source}
    </div>
  )
}
