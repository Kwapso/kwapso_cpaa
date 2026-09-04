import { controlsFor } from "./options"
import type { Catalogue, Screen } from "./types"

/* SAVE IS A DOWNLOAD. No server, no sync, no persistence beyond the file the
 * owner hands to a developer or an agent. Two files, two buttons: the JSON is
 * the screen (re-loadable here), the summary is the same screen in words a
 * person or an agent reads first — every chosen option with the class string
 * the kit applies for it, and every sandbox control flagged as one. */

export function screenJson(screen: Screen, catalogue: Catalogue): string {
  return JSON.stringify(
    {
      tool: "kwapso screen builder",
      kit: catalogue.kit,
      catalogueGeneratedAt: catalogue.generatedAt,
      savedAt: new Date().toISOString(),
      name: screen.name,
      parts: screen.parts.map((p) => ({ part: p.part, values: p.values, sandbox: p.sandbox })),
    },
    null,
    2,
  )
}

export function screenSummary(screen: Screen, catalogue: Catalogue): string {
  const lines: string[] = []
  lines.push(`# ${screen.name || "Untitled screen"}`, "")
  lines.push(`Built with the kwapso screen builder against kit ${catalogue.kit.tag} (${catalogue.kit.sha.slice(0, 7)}, synced ${catalogue.kit.syncedAt}).`)
  lines.push("Parts stack top to bottom at the page's one width. Every option below is one the kit declares; anything under \"sandbox\" is NOT a kit option and cannot ship as drawn.", "")
  screen.parts.forEach((placed, i) => {
    const part = catalogue.components.find((c) => c.name === placed.part)
    lines.push(`## ${i + 1}. ${placed.part}`)
    if (part) lines.push(`Source: ${part.files.join(", ")}`)
    const chosen: string[] = []
    if (part)
      for (const e of controlsFor(part).exports)
        for (const c of e.controls) {
          const v = placed.values[e.exportName]?.[c.name]
          if (v === undefined) continue
          if (c.kind === "variant") {
            const o = c.options.find((x) => x.name === v)
            chosen.push(`- <${e.exportName}> ${c.name}="${String(v)}" → \`${o?.classes ?? "(unresolved)"}\``)
          } else chosen.push(`- <${e.exportName}> ${c.name}=${JSON.stringify(v)}`)
        }
    lines.push(...(chosen.length ? chosen : ["- kit defaults (no option changed)"]))
    if (placed.sandbox.background) lines.push(`- sandbox (NOT a kit option): background ${placed.sandbox.background}`)
    lines.push("")
  })
  if (screen.parts.length === 0) lines.push("(empty)")
  return lines.join("\n")
}

export function parseScreen(text: string): Screen {
  const raw = JSON.parse(text) as { name?: unknown; parts?: unknown }
  if (!Array.isArray(raw.parts)) throw new Error("not a screen file: no parts array")
  const parts = raw.parts.map((p: { part?: unknown; values?: unknown; sandbox?: unknown }, i: number) => {
    if (typeof p.part !== "string") throw new Error(`part ${i + 1} has no name`)
    return {
      id: `p${Date.now().toString(36)}${i}`,
      part: p.part,
      values: (p.values && typeof p.values === "object" ? p.values : {}) as Screen["parts"][number]["values"],
      sandbox: (p.sandbox && typeof p.sandbox === "object" ? p.sandbox : {}) as Screen["parts"][number]["sandbox"],
    }
  })
  return { name: typeof raw.name === "string" ? raw.name : "", parts }
}

export function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "screen"
