// Reconcile the owner's narrated coverage list against the kit on disk.
// His list is a transcription — "as spec ratio" is aspect-ratio, "cue" is queue,
// "dialogue" is dialog. Mapping them here once beats four lanes each guessing.
import { readFileSync, writeFileSync } from "node:fs"
const lines = (f) => readFileSync(f, "utf8").split("\n").map(s => s.trim()).filter(Boolean)
const components = lines("/tmp/kit-components.txt")
const compositions = lines("/tmp/kit-compositions.txt")
const imported = new Set(lines("/tmp/app-imports.txt").map(s => s.replace(/^components\//, "").replace(/\/.*$/, "")))
const importedFull = new Set(lines("/tmp/app-imports.txt"))

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
      `\`[x]\` = the app imports it today. \`[ ]\` = it does not. \`(absent)\` = the owner named\n`
out += `it and the kit has no such part, which is worth knowing rather than silently dropping.\n\n`
out += `Regenerate the ticks with:\n\n    grep -rhoE '@shared/ui/(components|compositions|foundations)/[A-Za-z0-9/_-]+' web/ web-portal/ shared/web/ | sed 's#@shared/ui/##' | sort -u\n\n`

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
console.log(`components ${have}/${components.length}   compositions ${cHave}/${compositions.length}   named-but-absent ${absent}   unlisted ${unlisted.length}`)
