#!/usr/bin/env node
/* ============================================================================
   generate-icons.mjs
   icons/<Name>.svg  ->  icons/icons.generated.tsx  +  icons/index.ts

     node icons/generate-icons.mjs
     node icons/generate-icons.mjs --check   (verify only, writes nothing)

   THE SWAP PROCEDURE, which is the reason this script exists:
     1. drop the real <Name>.svg files over the placeholders
     2. run this script
     3. done — no component, no call site, no export name changes

   The generator reads each file's own viewBox, so incoming art may be drawn
   on any grid (28.35 kwapso, 24 lucide, anything) without touching code.

   Guards, all fatal:
     · a name in the required list with no .svg file
     · an .svg file that is not in the required list
     · a hardcoded colour in the art (icons take currentColor, or they cannot
       work in both themes)
     · a missing or malformed viewBox
   ============================================================================ */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECK_ONLY = process.argv.includes("--check");

/* The 93 from commission section 8. Order preserved: the six house-fixed
   action icons first, then the remaining 87 as listed. */
const COMMISSION_93 = [
  // Actions — the mapping is fixed by house rules and must not be reassigned
  "Pencil", "Power", "UserMinus", "Ban", "Plus", "Upload",
  // The remaining 87
  "AlarmClock", "AlarmClockOff", "AppWindow", "ArchiveRestore", "Archive", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowUpDown", "ArrowUpRight", "BadgeCheck",
  "Banknote", "Building2", "CalendarClock", "CalendarDays", "CalendarRange",
  "CalendarSync", "ChartNoAxesColumn", "Check", "CheckCheck", "ChevronLeft",
  "ChevronRight", "ChevronsUpDown", "CircleStop", "ClipboardCheck", "ClipboardCopy",
  "Clock", "Copy", "CornerDownRight", "Download", "ExternalLink", "Eye", "EyeOff",
  "FileSpreadsheet", "FileText", "GitBranch", "Hammer", "History", "Home", "House",
  "Inbox", "KeyRound", "Languages", "LibraryBig", "LifeBuoy", "Link", "Link2",
  "ListOrdered", "ListTodo", "Loader2", "Lock", "LogOut", "Mail", "MailOpen",
  "MoreHorizontal", "Package", "Palette", "PanelLeftClose", "PanelLeftOpen",
  "Paperclip", "PenLine", "PiggyBank", "Play", "RefreshCw", "RotateCcw", "Route",
  "Search", "SearchX", "Send", "Settings", "Settings2", "Share", "Shield", "ShieldOff",
  "Sparkles", "SquareArrowOutUpRight", "Timer", "Trash2", "TriangleAlert", "Undo2",
  "UserCheck", "UserPlus", "UserRound", "Users", "Video", "X",
];

/* Additive. Commission rule 3 permits adding; it forbids removing or renaming.
   Each is required by a section-6 primitive that the 93 cannot serve, and each
   is recorded in manifest.json -> iconsAdded. */
const ADDED = {
  ChevronDown: "accordion, select, dropdown-menu and collapsible all need a down chevron; the 93 have ChevronLeft, ChevronRight and ChevronsUpDown but no ChevronDown",
  ChevronUp: "select's scroll-up affordance and the collapsed half of a disclosure",
  Star: "the `rating` primitive in section 6 has no glyph in the 93",
};

const REQUIRED = [...COMMISSION_93, ...Object.keys(ADDED)];

const fail = [];

/* -- read the art ----------------------------------------------------------- */

const onDisk = readdirSync(HERE)
  .filter((f) => f.endsWith(".svg"))
  .map((f) => f.slice(0, -4));

for (const n of REQUIRED) if (!onDisk.includes(n)) fail.push(`MISSING ART — ${n}.svg does not exist`);
for (const f of onDisk) if (!REQUIRED.includes(f)) fail.push(`UNKNOWN ART — ${f}.svg is not a required name`);

const icons = [];
for (const name of REQUIRED) {
  let raw;
  try {
    raw = readFileSync(join(HERE, `${name}.svg`), "utf8");
  } catch {
    continue; // already reported as MISSING ART
  }

  const vb = raw.match(/viewBox\s*=\s*"([^"]+)"/);
  if (!vb) { fail.push(`NO VIEWBOX — ${name}.svg`); continue; }
  if (!/^[\d.\s-]+$/.test(vb[1]) || vb[1].trim().split(/\s+/).length !== 4)
    fail.push(`BAD VIEWBOX — ${name}.svg has viewBox="${vb[1]}"`);

  /* Strip the outer <svg> and keep the art. */
  const inner = raw
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>[\s\S]*$/, "")
    .replace(/<\?xml[^>]*\?>/g, "")
    .replace(/<defs\s*>\s*<\/defs>/g, "")
    .trim();

  /* An icon that names a colour cannot work in both themes. Scan the WHOLE
     file, not the stripped art — a fill on the root <svg> is the easiest
     place for one to hide, and stripping the root would have swallowed it. */
  const hex = raw.match(/#[0-9a-fA-F]{3,8}\b/g);
  if (hex) fail.push(`HARDCODED COLOUR — ${name}.svg contains ${[...new Set(hex)].join(", ")}`);
  const named = raw.match(/(?:fill|stroke|stop-color|flood-color)\s*=\s*"(?!none"|currentColor"|inherit")[a-zA-Z]+"/g);
  if (named) fail.push(`HARDCODED COLOUR — ${name}.svg has ${[...new Set(named)].join(", ")}`);
  if (/\bstyle\s*=\s*"[^"]*(?:fill|stroke)\s*:\s*(?!none|currentColor|inherit)/.test(raw))
    fail.push(`HARDCODED COLOUR — ${name}.svg sets fill/stroke in a style attribute`);

  /* The exact failure mode the kwapso kit's own icon set has: a class="cls-1"
     pointing at an empty <defs>, so the glyph renders black instead of taking
     currentColor. It looks correct in light and vanishes in dark. */
  const cls = raw.match(/class\s*=\s*"([^"]+)"/g);
  if (cls && !/<style|<defs\s*>\s*[^<\s]/.test(raw))
    fail.push(
      `ORPHAN CLASS — ${name}.svg carries ${[...new Set(cls)].join(", ")} with no style rule behind it. ` +
        `That is the kwapso kit's own bug: the glyph renders black, not currentColor, and disappears in dark.`
    );

  /* SVG attribute names -> JSX. */
  const jsx = inner
    .replace(/([a-z]+)-([a-z])/g, (m, a, b) =>
      /^(stroke|fill|clip|font|marker|stop|text|paint|shape|color|vector|dominant|alignment|baseline|letter|word|writing|image|pointer)$/.test(a)
        ? a + b.toUpperCase()
        : m
    )
    .replace(/class=/g, "className=")
    .replace(/\s*\/>/g, " />");

  icons.push({ name, viewBox: vb[1].trim(), jsx });
}

if (fail.length) {
  console.error("\ngenerate-icons: FAILED\n" + "-".repeat(21));
  for (const f of fail) console.error("  " + f);
  console.error("");
  process.exit(1);
}

/* -- emit ------------------------------------------------------------------- */

const header = `/* GENERATED by icons/generate-icons.mjs — do not hand-edit.
 *
 * ${COMMISSION_93.length} icons from commission section 8, plus ${Object.keys(ADDED).length} additive names.
 *
 * THE ARTWORK IS PLACEHOLDER, pending final icons. The names, the API and the
 * five sizes are FINAL — replace icons/<Name>.svg and re-run this script and
 * nothing downstream changes.
 */
import * as React from "react";
import { createIcon } from "./icon-base";
`;

const body = icons
  .map(
    ({ name, viewBox, jsx }) =>
      `\nexport const ${name} = createIcon({\n  displayName: "${name}",\n  viewBox: "${viewBox}",\n  children: (\n    <>\n      ${jsx}\n    </>\n  ),\n});`
  )
  .join("\n");

const index = `/* One named React export per icon, plus the shared types.
 *
 * ${COMMISSION_93.length} commission names + ${Object.keys(ADDED).length} additive (${Object.keys(ADDED).join(", ")}).
 * Artwork is placeholder; names, API and sizes are final.
 */
export { createIcon, ICON_SIZES } from "./icon-base";
export type { IconProps, IconSize, IconComponent } from "./icon-base";
export * from "./icons.generated";
`;

if (!CHECK_ONLY) {
  writeFileSync(join(HERE, "icons.generated.tsx"), header + body + "\n");
  writeFileSync(join(HERE, "index.ts"), index);
}

console.log("\ngenerate-icons: OK\n" + "-".repeat(17));
console.log(`  commission names        ${COMMISSION_93.length}`);
console.log(`  additive names          ${Object.keys(ADDED).length}  (${Object.keys(ADDED).join(", ")})`);
console.log(`  total exports           ${icons.length}`);
console.log(`  viewBoxes               ${[...new Set(icons.map((i) => i.viewBox))].join(" · ")}`);
console.log(`  guards                  art present OK · no stray files OK · currentColor OK`);
console.log(CHECK_ONLY ? "\n  --check: nothing written\n" : "\n  wrote icons.generated.tsx + index.ts\n");
