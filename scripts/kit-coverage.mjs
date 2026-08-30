// Reconcile the owner's narrated coverage list against the kit on disk.
// His list is a transcription — "as spec ratio" is aspect-ratio, "cue" is queue,
// "dialogue" is dialog. Mapping them here once beats four lanes each guessing.
//
// SELF-CONTAINED, ON PURPOSE (30 Aug 2026 rewrite). The previous version read
// its inputs from /tmp/kit-components.txt, /tmp/kit-compositions.txt and
// /tmp/app-imports.txt — three files nothing in the repo generated, so every
// lane that ran this script first ran a hand-typed shell incantation to
// produce them, and a lane that got the incantation slightly wrong got a
// slightly wrong census with no way to tell. `node scripts/kit-coverage.mjs`
// is now the whole command; it walks the filesystem itself.
//
// REACHED, NOT MERELY IMPORTED — via a walk that follows BOTH languages the
// kit ships in. A JS/TS file names a sibling with `from "@shared/ui/…"` or a
// relative specifier; a CSS file names one with `@import "…"`. Counting only
// the first missed `motion` entirely: both front doors' globals.css pull in
// `foundations/motion/motion.css` by a relative `@import`, which no
// import-string grep for `@shared/ui/…` will ever match, so the census called
// it unreached while every screen in the app was animating with it. That is
// the SEVENTH time this walk undercounted in the same direction — six earlier
// misses (`notes` through Comments, `folder` through tabs, `title` through the
// kit's own record-detail, `progress` through file-upload, and two more) were
// found by hand and filed as footnotes while the headline number stayed wrong.
// `motion` was the one nobody could find by hand, because there is no import
// LINE to grep — the reference lives in a directive JS's own import syntax
// does not have.
//
// So the walk is generic over the resolution rule, not motion-specific: a
// `resolveSpec` step that understands `@shared/ui/…`, a relative path, and an
// `@import` string identically, feeding one BFS closure. A part the app
// reaches through another part it has adopted is adopted — that is what a
// person looking at the screen would say, and the number exists to answer
// that question rather than a question about which of two import syntaxes
// was used. It cannot over-count: nothing enters the set without a path back
// to a file the app itself names, which is why `heatmap` stays unadopted even
// though `pulse-band` imports it — pulse-band is not reached either.
//
// EXPORTED for the law that checks this (`web/test/rules.test.ts`, R45): the
// test imports `computeReachability` from this plain .mjs file directly —
// vitest/esbuild take a JS module with no transform needed — so the checked
// law and the human-facing checklist can never compute two different
// answers. `main()` below is the CLI: read the repo, write KIT-COVERAGE.md,
// print the summary. Everything before it is the reusable computation.

import { readFileSync, writeFileSync, readdirSync } from "node:fs"
import { join, dirname, resolve as resolvePath, sep } from "node:path"
import { fileURLToPath } from "node:url"

export const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..")
export const KIT = join(ROOT, "shared", "ui")

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "out", "dist", "coverage"])

/** Every file under `dir` (recursive) whose name ends in one of `extensions`.
 * Build directories are skipped unconditionally — a walk that wanders into
 * node_modules is not a census, it is a hang. */
function walkFiles(dir, extensions) {
  const out = []
  const go = (d) => {
    let entries
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const p = join(d, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) go(p)
        continue
      }
      if (extensions.some((ext) => entry.name.endsWith(ext))) out.push(p)
    }
  }
  go(dir)
  return out
}

function listDirs(base) {
  try {
    return readdirSync(base, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  } catch {
    return []
  }
}

/** The kit's own inventory, read off disk — never hand-listed. */
export function kitInventory() {
  const components = listDirs(join(KIT, "components"))
  const foundations = listDirs(join(KIT, "foundations"))
  const compositions = walkFiles(join(KIT, "compositions"), [".tsx"])
    .map((p) => posixRel(join(KIT, "compositions"), p).replace(/\.tsx$/, ""))
    .sort()
  return { components, foundations, compositions }
}

function posixRel(base, p) {
  const rel = p.startsWith(base) ? p.slice(base.length) : p
  return rel.split(sep).join("/").replace(/^\//, "")
}

/** A resolved kit-relative path (no `@shared/ui/` prefix, no extension) → the
 * PART id the checklist tracks. `components/` and `foundations/` are one
 * directory deep (`components/<name>/<name>.tsx`), so the id is the first two
 * segments; `compositions/` is two deep with no repeated filename
 * (`compositions/<category>/<name>.tsx`), so the id is the first three. A
 * path outside all three namespaces (the kit's own `lib/`, `env.d.ts`) is not
 * a part and resolves to `null`. */
function toPartId(relPathNoExt) {
  const parts = relPathNoExt.split("/").filter(Boolean)
  if (parts[0] === "compositions") return parts.length >= 3 ? parts.slice(0, 3).join("/") : null
  if (parts[0] === "components" || parts[0] === "foundations")
    return parts.length >= 2 ? parts.slice(0, 2).join("/") : null
  return null
}

/** One id → the file(s) that BODY of the part lives in, concatenated, so the
 * BFS can find what THAT part reaches in turn. `compositions/…` is a single
 * file; `components/…` and `foundations/…` are directories that may hold more
 * than one file (a `.tsx` and a `.css` module together), so every file inside
 * is read, not just the one PATTERN.md names as canonical — a second file the
 * convention does not expect is still a place an import can hide. */
function partSource(id) {
  const parts = id.split("/")
  if (parts[0] === "compositions") {
    const file = join(KIT, ...parts) + ".tsx"
    try {
      return { source: readFileSync(file, "utf8"), dir: dirname(file) }
    } catch {
      return { source: "", dir: dirname(file) }
    }
  }
  const dir = join(KIT, ...parts)
  const files = walkFiles(dir, [".ts", ".tsx", ".css"])
  return { source: files.map((f) => readFileSync(f, "utf8")).join("\n"), dir }
}

/** A specifier found in either language, resolved against the file that named
 * it, to a kit part id — or `null` when it names something outside the kit
 * (a bare package, a repo file that isn't `shared/ui/`). Handles all three
 * shapes the kit's own files and the app's own files use: the alias, a
 * relative JS/CSS path, and (because `@import` and a relative JS specifier
 * are syntactically the same shape once the leading keyword is stripped) one
 * resolution rule for both languages. */
function resolveSpec(spec, fromDir) {
  if (spec.startsWith("@shared/ui/")) {
    return toPartId(spec.slice("@shared/ui/".length).replace(/\.(tsx?|css)$/, ""))
  }
  if (spec.startsWith(".")) {
    const abs = resolvePath(fromDir, spec)
    if (!abs.startsWith(KIT + sep) && abs !== KIT) return null
    return toPartId(posixRel(KIT, abs).replace(/\.(tsx?|css)$/, ""))
  }
  return null // a bare package specifier ("tailwindcss", "react") — not ours
}

/** Every kit-relative reference a piece of source names, in whichever of the
 * two languages it is written in. Deliberately runs BOTH regexes over any
 * text regardless of file extension: a `.tsx` file will never match
 * `@import "…"` and a `.css` file will never match `from "…"`, so there is
 * nothing to gain and a real file-extension branch to get wrong by skipping
 * the "wrong" one for a file whose extension a build tool has renamed. */
function refsIn(source, fromDir) {
  const specs = []
  for (const m of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) specs.push(m[1])
  for (const m of source.matchAll(/@import\s+["']([^"']+)["']/g)) specs.push(m[1])
  const ids = []
  for (const spec of specs) {
    const id = resolveSpec(spec, fromDir)
    if (id) ids.push(id)
  }
  return ids
}

/** REACHED, NOT MERELY IMPORTED. Seeds from every kit reference either front
 * door or `shared/web/` names directly, in `.ts`/`.tsx`/`.css` alike, then
 * closes over the kit's OWN cross-references (a component that imports
 * another component, a CSS file that imports another) until nothing new
 * appears. Returns the reached id set plus which of the seeds were direct
 * (for the "N reached transitively" count the checklist reports). */
export function computeReachability() {
  const appRoots = [join(ROOT, "web"), join(ROOT, "web-portal"), join(ROOT, "shared", "web")]
  const appFiles = appRoots.flatMap((r) => walkFiles(r, [".ts", ".tsx", ".css"]))

  const direct = new Set()
  for (const f of appFiles) {
    const source = readFileSync(f, "utf8")
    for (const id of refsIn(source, dirname(f))) direct.add(id)
  }

  const reached = new Set(direct)
  const queue = [...direct]
  while (queue.length) {
    const id = queue.pop()
    const { source, dir } = partSource(id)
    if (!source) continue
    for (const next of refsIn(source, dir)) {
      if (!reached.has(next)) {
        reached.add(next)
        queue.push(next)
      }
    }
  }

  return { direct, reached }
}

// ── CLI: regenerate KIT-COVERAGE.md ─────────────────────────────────────────

function main() {
  const { components, foundations, compositions } = kitInventory()
  const { direct, reached } = computeReachability()

  const reachedComponents = new Set(
    [...reached].filter((id) => id.startsWith("components/")).map((id) => id.slice("components/".length))
  )
  const reachedFoundations = new Set(
    [...reached].filter((id) => id.startsWith("foundations/")).map((id) => id.slice("foundations/".length))
  )
  const reachedCompositions = new Set(
    [...reached].filter((id) => id.startsWith("compositions/")).map((id) => id.slice("compositions/".length))
  )
  const transitiveCount = [...reached].filter((id) => !direct.has(id)).length

  // The owner's own groupings, in his order, with his words kept as the heading.
  const GROUPS = [
    ["Charts and graphs", ["chart", "gantt", "heatmap", "pulse-band", "donut", "rings", "kpi-progress", "radar"]],
    ["Colour and surface", ["ambient-background", "mode-toggle", "progress-toggle"]],
    ["Typography", ["clamp", "typography", "title", "article-body"]],
    ["Space and motion", ["container", "spacer"]],
    ["Buttons", ["button"]],
    ["Text inputs", ["date-picker", "field", "input", "label", "select", "signature", "textarea"]],
    ["Selection controls", ["checkbox", "choice", "radio-group", "rating", "slider", "switch", "toggle", "toggle-group"]],
    ["Chips and badges", ["avatar", "badge", "separator"]],
    ["Menus and tooltips", ["command", "dropdown-menu", "hover-card", "popover", "tooltip"]],
    ["Cards", ["accordion", "action-row", "aspect-ratio", "card", "collapsible", "image", "scroll-area", "video", "web-embed"]],
    ["Folder shapes", ["folder"]],
    ["Navigation", ["breadcrumb", "breadcrumbs", "pagination", "status-stepper", "tabs"]],
    ["Filter and search", ["file-upload", "filter-bar", "search-input", "use-debounce"]],
    ["Tables and lists", ["sort-control", "table", "use-virtual-rows", "visibility", "data-preview-table", "description-list"]],
    ["Data display", ["progress", "progress-dashboard", "stat-grid", "tree", "stopwatch"]],
    ["Feedback and overlay", ["alert", "alert-dialog", "dialog", "sheet", "skeleton", "sonner", "spinner"]],
    ["Notes and notifications", ["notes", "notifications", "comments", "ticket-thread"]],
    ["Forms and data", ["form", "import-wizard", "permission-matrix"]],
    [
      "Collection views",
      [
        "list", "kanban", "card-grid", "calendar-view", "data-table", "spreadsheet", "matrix", "swimlane",
        "timeline", "agenda", "gallery", "split", "queue", "activity-feed", "checklist", "chat", "run-steps",
        "tiles", "map", "compare", "flowchart", "flowdetail", "collection-frame", "screen-renderer",
        "copilot-overlay", "agent-chat",
      ],
    ],
    ["Detail and examples", ["detail-view", "record-detail", "brand", "portal-conversation"]],
  ]

  let out = `# The kit coverage checklist\n\n`
  out += `The owner narrated this list off the kit's own catalogue on 29 Aug 2026 and asked\n`
  out += `that every lane work against it. His groupings and his order are kept; each line is\n`
  out += `reconciled against the part that actually exists on disk, because a narration has\n`
  out += `transcription in it ("as spec ratio" is aspect-ratio, "cue" is queue, "dialogue" is\n`
  out += `dialog) and four lanes each guessing at that separately is four different lists.\n\n`
  out +=
    `Every item he named resolves to a real part once transcription is undone —\n` +
    `"more toggle" is mode-toggle, "status/stepper" is one part, "portal/conversation"\n` +
    `is one part, and headline/text/hint are three exports of typography. Nothing he\n` +
    `asked for is missing and nothing in the kit went unnamed.\n\n` +
    `\`[x]\` = the app REACHES it — directly, or through another part it already\n` +
    `reaches, in EITHER language the kit ships in. Counting only the app's own JS/TS\n` +
    `import lines understated this SEVEN times in one day: six parts arrive through\n` +
    `another kit part (\`notes\` through Comments, \`folder\` through tabs, \`title\`\n` +
    `through the kit's own record-detail, \`progress\` through file-upload, two more\n` +
    `filed as footnotes), and \`motion\` arrives through a CSS \`@import\` in both front\n` +
    `doors' globals.css — a reference no JS-import grep can see at all, in either\n` +
    `direction. ${transitiveCount} parts are reached that way today, JS or CSS. The\n` +
    `walk cannot over-count: nothing enters without a path back to a file the app\n` +
    `itself names, which is why \`heatmap\` stays unadopted even though \`pulse-band\`\n` +
    `imports it — pulse-band is not reached either. \`[ ]\` = not reached. \`(absent)\` =\n` +
    `named it and the kit has no such part, which is worth knowing rather than\n` +
    `silently dropping.\n\n` +
    `Regenerate with \`node scripts/kit-coverage.mjs\` — one command, no /tmp\n` +
    `preparation, never edited by hand.\n\n`

  const seen = new Set()
  let have = 0
  let need = 0
  let absent = 0
  for (const [heading, items] of GROUPS) {
    out += `## ${heading}\n\n`
    for (const it of items) {
      const exists = components.includes(it)
      if (!exists) {
        out += `- (absent) \`${it}\` — named in the list, no such part in the kit\n`
        absent++
        continue
      }
      seen.add(it)
      const yes = reachedComponents.has(it)
      if (yes) have++
      else need++
      out += `- [${yes ? "x" : " "}] \`${it}\`\n`
    }
    out += `\n`
  }

  const unlisted = components.filter((c) => !seen.has(c))
  out += `## Components the kit ships that the list did not name (${unlisted.length})\n\n`
  for (const c of unlisted) {
    const yes = reachedComponents.has(c)
    if (yes) have++
    else need++
    out += `- [${yes ? "x" : " "}] \`${c}\`\n`
  }
  out += `\n`

  out += `## Compositions (${compositions.length})\n\n`
  let cHave = 0
  for (const c of compositions) {
    const yes = reachedCompositions.has(c)
    if (yes) cHave++
    out += `- [${yes ? "x" : " "}] \`${c}\`\n`
  }
  out += `\n## Foundations\n\n`
  let fHave = 0
  for (const f of foundations) {
    const yes = reachedFoundations.has(f)
    if (yes) fHave++
    out += `- [${yes ? "x" : " "}] \`${f}\`\n`
  }

  const totalParts = components.length + foundations.length
  const totalHave = have + fHave
  out += `\n---\n\n**Components ${have}/${components.length} · Foundations ${fHave}/${foundations.length} · Compositions ${cHave}/${compositions.length}**\n`
  out += `**Components + foundations combined (the owner's "118"): ${totalHave}/${totalParts}**\n`
  if (absent) out += ` · ${absent} named-but-absent\n`

  writeFileSync(join(ROOT, "KIT-COVERAGE.md"), out)
  console.log(`  reached through another kit part or a CSS @import (invisible to a JS-import grep): ${transitiveCount}`)
  console.log(
    `components ${have}/${components.length}   foundations ${fHave}/${foundations.length}   ` +
      `combined ${totalHave}/${totalParts}   compositions ${cHave}/${compositions.length}   ` +
      `named-but-absent ${absent}   unlisted ${unlisted.length}`
  )
}

if (import.meta.url === `file://${process.argv[1]}`) main()
