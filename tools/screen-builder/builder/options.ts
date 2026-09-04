import type { CvaSite, Part, TypedProp } from "./types"

/* WHAT A PART'S CONTROLS ARE, derived from the catalogue and nothing else.
 *
 * A control belongs to a kit EXPORT: a cva variant group belongs to the
 * export whose body calls the cva function (`usedBy`, read off the AST), and a
 * typed enum/boolean prop belongs to the export its `<Name>Props` type names.
 * A cva that no export calls (a helper for an internal row) is listed under
 * `internal` so the owner still sees it exists, without a control that would
 * do nothing. Nothing in this file adds an option; it only files the ones the
 * generator found under the export they belong to. */

export type Control =
  | { kind: "variant"; name: string; options: { name: string; classes: string | null; note: string | null }[]; defaultValue: unknown; from: string; where: string }
  | { kind: "enum"; name: string; values: string[]; note: string | null; from: string; where: string }
  | { kind: "boolean"; name: string; note: string | null; from: string; where: string }

export type ExportControls = { exportName: string; controls: Control[] }

export function controlsFor(part: Part): { exports: ExportControls[]; internal: CvaSite[]; total: number } {
  const byExport = new Map<string, Control[]>()
  const add = (exportName: string, c: Control) => {
    if (!byExport.has(exportName)) byExport.set(exportName, [])
    byExport.get(exportName)!.push(c)
  }
  const exportNames = new Set(part.exports.map((e) => e.name))
  const internal: CvaSite[] = []

  for (const site of part.cva) {
    if (site.usedBy.length === 0) {
      internal.push(site)
      continue
    }
    for (const owner of site.usedBy)
      for (const g of site.groups)
        add(owner, { kind: "variant", name: g.name, options: g.options, defaultValue: site.defaults[g.name], from: site.name ?? "cva", where: `${site.file}:${site.line}` })
  }

  for (const t of part.typedProps) {
    // `ButtonProps` → `Button`. Failing that, the export that calls the cva the
    // type extends. Failing that, the props are typed for nothing the file
    // exports, and they are not offered.
    const byName = t.type.replace(/Props$/, "")
    let owner: string | null = exportNames.has(byName) ? byName : null
    if (!owner)
      for (const v of t.variantsFrom) {
        const site = part.cva.find((s) => s.name === v)
        if (site && site.usedBy.length === 1) owner = site.usedBy[0]
      }
    if (!owner) continue
    for (const p of t.props) add(owner, typedControl(p, t.type, t.file))
  }

  const exportsOut = [...byExport.entries()]
    .map(([exportName, controls]) => ({ exportName, controls: dedupe(controls) }))
    .sort((a, b) => a.exportName.localeCompare(b.exportName))
  const total = exportsOut.reduce((n, e) => n + e.controls.length, 0)
  return { exports: exportsOut, internal, total }
}

function typedControl(p: TypedProp, type: string, file: string): Control {
  return p.kind === "enum"
    ? { kind: "enum", name: p.name, values: p.values ?? [], note: p.note, from: type, where: file }
    : { kind: "boolean", name: p.name, note: p.note, from: type, where: file }
}

/** A prop typed AND driven by a cva (`size?: "sm" | "lg"` beside a `size`
 * variant group) is one control, and the cva's — it carries the classes. */
function dedupe(controls: Control[]): Control[] {
  const seen = new Set<string>()
  const variants = controls.filter((c) => c.kind === "variant")
  for (const v of variants) seen.add(v.name)
  return [...variants, ...controls.filter((c) => c.kind !== "variant" && !seen.has(c.name) && seen.add(c.name))]
}

/** Every option a part offers, counted the way the report counts them. */
export function optionCount(part: Part): number {
  return controlsFor(part).exports.reduce(
    (n, e) => n + e.controls.reduce((m, c) => m + (c.kind === "variant" ? c.options.length : c.kind === "enum" ? c.values.length : 1), 0),
    0,
  )
}
