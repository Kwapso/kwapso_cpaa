#!/usr/bin/env node
/* ============================================================================
   generate-icons.mjs
   icons/<Name>.svg  ->  icons/icons.generated.tsx  +  icons/index.ts

     node foundations/icons/generate-icons.mjs
     node foundations/icons/generate-icons.mjs --check   (verify only, writes nothing)

   THE SWAP PROCEDURE, which is the reason this script exists:
     1. drop the real <Name>.svg files over the placeholders
     2. run this script
     3. done — no component, no call site, no export name changes

   The generator reads each file's own viewBox, so incoming art may be drawn
   on any grid (28.35 kwapso, 24 lucide, 256 Phosphor) without touching code.

   THE FOLDER IS THE SET. There is no separate required-names list and no
   alias table: every `.svg` file in this folder becomes one named export,
   spelled exactly as its filename. That is the whole contract — a name on
   phosphor.dev resolves the moment the matching <Name>.svg lands here.

   Client ruling, verbatim, overturning the earlier "never rename or drop an
   export" rule for this folder specifically (docs/RULES.md §9.1 records it):
   "I validate the icon mapping, so make sure to make the switch. Any
   previous icon that's on the repo or wherever, kill it. They are wrong.
   The only icons that we are using are these icons from Phosphor. If in the
   future you were to need more icons, we would also take them from
   Phosphor" — 2026-09-03.

   Guards, all fatal:
     · an .svg file whose name is not a valid JS identifier
     · a hardcoded colour in the art (icons take currentColor, or they cannot
       work in both themes)
     · a missing or malformed viewBox
   ============================================================================ */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECK_ONLY = process.argv.includes("--check");

const fail = [];

/* -- read the art ----------------------------------------------------------- */

/* EVERY glyph in the pack is generated. The folder IS the set: there is no
   separate required-names list to check names against, so a name that
   resolves is simply a file that exists. */
const onDisk = readdirSync(HERE)
  .filter((f) => f.endsWith(".svg"))
  .map((f) => f.slice(0, -4));

const REQUIRED = [...onDisk].sort();

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
for (const name of REQUIRED) {
  if (!IDENTIFIER.test(name))
    fail.push(`BAD NAME — ${name}.svg is not a valid export identifier`);
}

const icons = [];
for (const name of REQUIRED) {
  let raw;
  try {
    raw = readFileSync(join(HERE, `${name}.svg`), "utf8");
  } catch {
    continue; // already reported
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

const header = `/* GENERATED by foundations/icons/generate-icons.mjs — do not hand-edit.
 *
 * ${icons.length} glyphs, the Phosphor pack (MIT, github.com/phosphor-icons/core),
 * fill weight throughout except three named exceptions drawn at regular
 * weight (Plus, Power, Prohibit — see icon-base.tsx), under Phosphor's own
 * names. No alias table: a name here is a name on phosphor.dev.
 *
 * Every export carries a PURE annotation so a bundler can drop the ones an app
 * never imports. Without it a single module of this size ships whole.
 */
import * as React from "react";
import { createIcon } from "./icon-base";
`;

const body = icons
  .map(
    ({ name, viewBox, jsx }) =>
      `\nexport const ${name} = /*#__PURE__*/ createIcon({\n  displayName: "${name}",\n  viewBox: "${viewBox}",\n  children: (\n    <>\n      ${jsx}\n    </>\n  ),\n});`
  )
  .join("\n");

const index = `/* One named React export per icon, plus the shared types.
 *
 * ${icons.length} glyphs from the Phosphor pack (MIT), under Phosphor's own
 * names — the folder IS the contract. No alias table, no separate required-
 * names list: whatever lands in foundations/icons/ as <Name>.svg is what
 * this module exports as <Name>, spelled exactly the same.
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
console.log(`  glyphs in the pack      ${icons.length}`);
console.log(`  guards                  valid identifiers OK · viewBox present OK · no stray colour OK`);
console.log(CHECK_ONLY ? "\n  --check: nothing written\n" : "\n  wrote icons.generated.tsx + index.ts\n");
