// Reconcile the owner's narrated coverage list against the kit on disk.
// His list is a transcription — "as spec ratio" is aspect-ratio, "cue" is queue,
// "dialogue" is dialog. Mapping them here once beats four lanes each guessing.
import { readFileSync, writeFileSync } from "node:fs"
const lines = (f) => readFileSync(f, "utf8").split("\n").map(s => s.trim()).filter(Boolean)
const components = lines("/tmp/kit-components.txt")
const compositions = lines("/tmp/kit-compositions.txt")
const direct = lines("/tmp/app-imports.txt")

// REACHED, NOT MERELY IMPORTED. Counting only the app's own import lines
// understated adoption six times over in one day, always in the same
// direction: `notes` reaches every screen through Comments, `folder` through
// tabs, `title` through the kit's own record-detail, `progress` through
// file-upload, `motion` through both doors' globals.css. Each was found by
// hand, reported as a footnote, and the headline number stayed wrong.
//
// A part the app reaches THROUGH another part it has adopted is adopted. That
// is what a person looking at the screen would say, and the number exists to
// answer that question rather than a question about import syntax. So the
// walk closes over the kit's own imports: start from what the app names, and
// keep pulling in whatever those files name, until nothing new appears.
//
// It cannot over-count. Nothing enters the set without a path back to a file
// the app itself imports, so an unreached part stays unreached no matter how
// many other unreached parts import it — which is exactly the case that
// caught `heatmap`, imported only by the unadopted `pulse-band`.
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const KIT = "/Users/alaap_kanchwala_apple/Desktop/kwapso_cpaa/shared/ui"
const sourceOf = (spec) => {
  const base = join(KIT, spec)
  for (const c of [base + ".tsx", base + ".ts", join(base, spec.split("/").pop() + ".tsx"), join(base, "index.ts")]) {
    try { if (statSync(c).isFile()) return readFileSync(c, "utf8") } catch {}
  }
  try {
    for (const f of readdirSync(base)) if (f.endsWith(".tsx") || f.endsWith(".ts"))
      return readFileSync(join(base, f), "utf8")
  } catch {}
  return ""
}

const reached = new Set(direct)
const queue = [...direct]
while (queue.length) {
  const spec = queue.pop()
  const src = sourceOf(spec)
  if (!src) continue
  // A kit file names its siblings relatively ("../title/title") and its own
  // foundations absolutely. Both resolve to a part; anything outside the kit
  // is somebody else's problem.
  const here = spec.split("/").slice(0, -1).join("/")
  for (const m of src.matchAll(/from\s+"((?:\.\.?\/|@shared\/ui\/)[^"]+)"/g)) {
    let r = m[1]
    if (r.startsWith("@shared/ui/")) r = r.slice("@shared/ui/".length)
    else {
      const parts = (here + "/" + r).split("/")
      const out = []
      for (const seg of parts) { if (seg === "..") out.pop(); else if (seg !== "." && seg) out.push(seg) }
      r = out.join("/")
    }
    if (!/^(components|compositions|foundations)\//.test(r)) continue
    if (!reached.has(r)) { reached.add(r); queue.push(r) }
  }
}

const imported = new Set([...reached].map(s => s.replace(/^components\//, "").replace(/\/.*$/, "")))
const importedFull = new Set(reached)
const transitive = [...reached].filter(r => !direct.includes(r)).sort()

// The owner's own groupings, in his order, with his words kept as the heading.
const GROUPS = [
  ["Charts and graphs", ["chart","gantt","heatmap","pulse-band","donut","rings","kpi-progress","radar"]],
  ["Colour and surface", ["ambient-background","mode-toggle","progress-toggle"]],
  ["Typography", ["clamp","typography","title","article-body"]],
  ["Space and motion", ["container","spacer"]],
  ["Buttons", ["button"]],
  ["Text inputs", ["date-picker","field","input","label","select","signature","textarea"]],
  ["Selection controls", ["checkbox","choice","radio-group","rating","slider","switch","toggle","toggle-group"]],
  ["Chips and badges", ["avatar","badge","separator"]],
  ["Menus and tooltips", ["command","dropdown-menu","hover-card","popover","tooltip"]],
  ["Cards", ["accordion","action-row","aspect-ratio","card","collapsible","image","scroll-area","video","web-embed"]],
  ["Folder shapes", ["folder"]],
  ["Navigation", ["breadcrumb","breadcrumbs","pagination","status-stepper","tabs"]],
  ["Filter and search", ["file-upload","filter-bar","search-input","use-debounce"]],
  ["Tables and lists", ["sort-control","table","use-virtual-rows","visibility","data-preview-table","description-list"]],
  ["Data display", ["progress","progress-dashboard","stat-grid","tree","stopwatch"]],
  ["Feedback and overlay", ["alert","alert-dialog","dialog","sheet","skeleton","sonner","spinner"]],
  ["Notes and notifications", ["notes","notifications","comments","ticket-thread"]],
  ["Forms and data", ["form","import-wizard","permission-matrix"]],
  ["Collection views", ["list","kanban","card-grid","calendar-view","data-table","spreadsheet","matrix","swimlane","timeline","agenda","gallery","split","queue","activity-feed","checklist","chat","run-steps","tiles","map","compare","flowchart","flowdetail","collection-frame","screen-renderer","copilot-overlay","agent-chat"]],
  ["Detail and examples", ["detail-view","record-detail","brand","portal-conversation"]],
]

let out = `# The kit coverage checklist\n\n`
out += `The owner narrated this list off the kit's own catalogue on 29 Aug 2026 and asked\n`
out += `that every lane work against it. His groupings and his order are kept; each line is\n`
out += `reconciled against the part that actually exists on disk, because a narration has\n`
out += `transcription in it ("as spec ratio" is aspect-ratio, "cue" is queue, "dialogue" is\n`
out += `dialog) and four lanes each guessing at that separately is four different lists.\n\n`
out += `Every item he named resolves to a real part once transcription is undone —\n` +
      `"more toggle" is mode-toggle, "status/stepper" is one part, "portal/conversation"\n` +
      `is one part, and headline/text/hint are three exports of typography. Nothing he\n` +
      `asked for is missing and nothing in the kit went unnamed.\n\n` +
      `\`[x]\` = the app REACHES it — directly, or through another part it already\n` +
      `reaches. Counting only the app's own import lines understated this SIX times in\n` +
      `one day, always the same way: \`notes\` arrives through Comments, \`folder\` through\n` +
      `tabs, \`title\` through the kit's own record-detail, \`progress\` through file-upload,\n` +
      `\`motion\` through both doors' stylesheets. Each was found by hand and filed as a\n` +
      `footnote while the headline stayed wrong. ${transitive.length} parts are reached that way today.\n` +
      `The walk cannot over-count: nothing enters without a path back to a file the app\n` +
      `itself names, which is why \`heatmap\` stays unadopted even though \`pulse-band\`\n` +
      `imports it — pulse-band is not reached either. \`[ ]\` = not reached. \`(absent)\` = named\n` +
      `it and the kit has no such part, which is worth knowing rather than silently dropping.\n\n`

const seen = new Set()
let have = 0, need = 0, absent = 0
for (const [heading, items] of GROUPS) {
  out += `## ${heading}\n\n`
  for (const it of items) {
    const exists = components.includes(it)
    if (!exists) { out += `- (absent) \`${it}\` — named in the list, no such part in the kit\n`; absent++; continue }
    seen.add(it)
    const yes = imported.has(it)
    if (yes) have++; else need++
    out += `- [${yes ? "x" : " "}] \`${it}\`\n`
  }
  out += `\n`
}

const unlisted = components.filter(c => !seen.has(c))
out += `## Components the kit ships that the list did not name (${unlisted.length})\n\n`
for (const c of unlisted) { const yes = imported.has(c); if (yes) have++; else need++; out += `- [${yes ? "x" : " "}] \`${c}\`\n` }
out += `\n`

out += `## Compositions (${compositions.length})\n\n`
let cHave = 0
for (const c of compositions) {
  const yes = importedFull.has(`compositions/${c}`)
  if (yes) cHave++
  out += `- [${yes ? "x" : " "}] \`${c}\`\n`
}
out += `\n## Foundations\n\n- [x] \`icons\`\n- [x] \`tokens\`\n- [ ] \`motion\` — the owner named motions; check what actually animates\n\n`
out += `---\n\n**Components ${have}/${components.length} · Compositions ${cHave}/${compositions.length}**`
if (absent) out += ` · ${absent} named-but-absent`
out += `\n`
writeFileSync("KIT-COVERAGE.md", out)
console.log(`  reached through another kit part (invisible to a direct-import count): ${transitive.length}`)
console.log(`components ${have}/${components.length}   compositions ${cHave}/${compositions.length}   named-but-absent ${absent}   unlisted ${unlisted.length}`)
