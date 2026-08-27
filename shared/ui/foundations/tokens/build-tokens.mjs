#!/usr/bin/env node
/* ============================================================================
   build-tokens.mjs
   tokens.css  ->  tokens.json.  Four guards FAIL the build; UNRESOLVED warns.

     node foundations/tokens/build-tokens.mjs
     node foundations/tokens/build-tokens.mjs --check    (guards only, writes nothing)

   The guards exist because each of them catches a bug that is invisible in
   review and miserable to find by eye:

     1 · DRIFT      the two dark blocks must declare an identical set of
                    names with identical values. A token defined in only one
                    of them renders differently for "system dark" than for
                    "I picked dark".
     2 · ORPHAN     a name defined in dark but not in light has its only
                    definition inside a media query. Commission rule 6.
     3 · PX LEAK    a px value outside the short allowlist. Commission rule
                    5 — a px does not scale, so the text-size control
                    silently stops working for that property.
     4 · UNRESOLVED a var() chain that points at nothing. WARNS; the others
                    fail.
     5 · DEAD       a `.bg-* / .text-* / .border-*` class this stylesheet
        SELECTOR    SELECTS ON that the @theme bridge cannot produce. Tailwind
                    never generates the class, so it paints nothing while any
                    rebind keyed on it fires anyway -- and a missing background
                    looks exactly like a deliberate one. T3A-33.
   ============================================================================ */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "tokens.css");
const OUT = join(HERE, "tokens.json");
const CHECK_ONLY = process.argv.includes("--check");

/* px is legitimate in exactly these places. Everything else is a leak. */
const PX_ALLOWED = [
  /^--shadow-/,        // shadow geometry is not type, and does not scale
  /^--focus-width$/,   // a ring stays 2px at every text scale
  /^--focus-offset$/,
  /^--radius-pill$/,   // 999px is "fully round", not a measurement
  /^--hairline/,       // a hairline is 1px BY DEFINITION and must not scale:
                       // the artifact draws every one of them as an inset
                       // 1px shadow, and a hairline that grew with the
                       // text-size control would stop being a hairline.
];

const fail = [];
const warn = [];

/* -- 1 · read and de-comment ------------------------------------------------ */

const raw = readFileSync(SRC, "utf8");
const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");

/* -- 2 · pull out the blocks we care about ---------------------------------- */

/** Return the body of the block whose header starts at `from`. */
function bodyAt(text, from) {
  const open = text.indexOf("{", from);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return { body: text.slice(open + 1, i), end: i };
    }
  }
  return null;
}

/** Every `--name: value;` pair in a block body, in source order. */
function declarations(body) {
  const out = new Map();
  const re = /(--[A-Za-z0-9_-]+)\s*:\s*([^;}]+)[;}]?/g;
  let m;
  while ((m = re.exec(body))) out.set(m[1], m[2].trim().replace(/\s+/g, " "));
  return out;
}

/** Merge every bare `:root { }` block (skipping [data-*] and nested ones). */
function collectLight(text) {
  const merged = new Map();
  const re = /(^|\})\s*:root\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    const blk = bodyAt(text, m.index);
    if (!blk) continue;
    for (const [k, v] of declarations(blk.body)) merged.set(k, v);
  }
  return merged;
}

function blockAfter(text, needle) {
  const i = text.indexOf(needle);
  if (i < 0) return null;
  const blk = bodyAt(text, i);
  return blk ? declarations(blk.body) : null;
}

/* The @media block: find the at-rule, then the :root selector inside it. */
const mediaIdx = css.indexOf("@media (prefers-color-scheme: dark)");
if (mediaIdx < 0) fail.push("no `@media (prefers-color-scheme: dark)` block found");
const mediaBody = mediaIdx >= 0 ? bodyAt(css, mediaIdx)?.body ?? "" : "";

const light = collectLight(css.slice(0, mediaIdx < 0 ? undefined : mediaIdx));
const darkMedia = blockAfter(mediaBody, ':root:not([data-theme="light"])');
const darkExplicit = blockAfter(css, ':root[data-theme="dark"]');

if (!darkMedia) fail.push('no `:root:not([data-theme="light"])` block inside the media query');
if (!darkExplicit) fail.push('no `:root[data-theme="dark"]` block found');

/* -- 3 · GUARD 1 — drift ---------------------------------------------------- */

if (darkMedia && darkExplicit) {
  const a = [...darkMedia.keys()];
  const b = [...darkExplicit.keys()];
  const onlyMedia = a.filter((k) => !darkExplicit.has(k));
  const onlyExplicit = b.filter((k) => !darkMedia.has(k));
  const mismatched = a
    .filter((k) => darkExplicit.has(k))
    .filter((k) => darkMedia.get(k) !== darkExplicit.get(k));

  if (onlyMedia.length || onlyExplicit.length || mismatched.length) {
    fail.push("DRIFT — the two dark blocks are not the same block.");
    for (const k of onlyMedia) fail.push(`    only in @media          ${k}`);
    for (const k of onlyExplicit) fail.push(`    only in [data-theme]    ${k}`);
    for (const k of mismatched)
      fail.push(
        `    value differs           ${k}\n` +
          `        @media       ${darkMedia.get(k)}\n` +
          `        [data-theme] ${darkExplicit.get(k)}`
      );
  }
}

/* -- 4 · GUARD 2 — orphans -------------------------------------------------- */

for (const k of darkMedia?.keys() ?? []) {
  if (!light.has(k)) fail.push(`ORPHAN — ${k} is defined in dark but never on bare :root`);
}

/* -- 5 · GUARD 3 — px leaks ------------------------------------------------- */

const pxCheck = (map, where) => {
  for (const [k, v] of map) {
    if (!/\d\s*px\b/.test(v)) continue;
    if (PX_ALLOWED.some((re) => re.test(k))) continue;
    fail.push(`PX LEAK — ${k} (${where}) = ${v}`);
  }
};
pxCheck(light, "light");
if (darkMedia) pxCheck(darkMedia, "dark");

/* -- 5b · GUARD 4 — a selector that keys on a class Tailwind never makes ----

   `.bg-surface-raised` appeared in the relational rebind block below and
   `--color-surface-raised` was never registered in the `@theme inline` bridge.
   Tailwind therefore generated no such utility: the class emitted NO
   background -- measured rgba(0,0,0,0) on a live screen -- while the rebind it
   triggers fired anyway, so a screen asking for the raised tone got a
   transparent box and a rebound button at the same time. Silent in review,
   because a missing background looks exactly like a deliberate one.

   The rule: every `.bg-* / .text-* / .border-*` class this stylesheet SELECTS
   ON must be a class the bridge can actually produce. Found live by Track 3A
   (T3A-33).                                                                 */

const SELECTED_CLASSES = [...raw.matchAll(/^\s*\.(bg|text|border)-([a-z0-9-]+)\s*,?\s*$/gm)]
  .map((m) => ({ util: m[1], token: m[2] }));
const bridgeBlock = raw.slice(raw.indexOf("@theme inline"));
const BRIDGED = new Set([...bridgeBlock.matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((m) => m[1]));

for (const { util, token } of SELECTED_CLASSES) {
  if (BRIDGED.has(token)) continue;
  fail.push(
    `DEAD SELECTOR — .${util}-${token} is selected on, but --color-${token} is not in ` +
      `the @theme bridge, so Tailwind never generates that class and it paints nothing`,
  );
}

/* -- 6 · resolve var() chains ----------------------------------------------- */

function resolver(map) {
  const seen = new Set();
  return function resolve(value, key = "") {
    if (typeof value !== "string") return value;
    let out = value;
    for (let pass = 0; pass < 12 && out.includes("var("); pass++) {
      out = out.replace(/var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,([^)]*))?\)/g, (all, ref, fb) => {
        if (ref === key || seen.has(ref + "|" + key)) return all;
        if (map.has(ref)) return map.get(ref);
        if (fb !== undefined) return fb.trim();
        warn.push(`UNRESOLVED — ${key || "?"} points at ${ref}, which is not defined`);
        return all;
      });
    }
    return out.trim();
  };
}

const darkMap = new Map(light);
for (const [k, v] of darkExplicit ?? []) darkMap.set(k, v);

const resolveLight = resolver(light);
const resolveDark = resolver(darkMap);

/* -- 7 · report ------------------------------------------------------------- */

const banner = (s) => `\n${s}\n${"-".repeat(s.length)}`;

if (fail.length) {
  console.error(banner("build-tokens: FAILED"));
  for (const f of fail) console.error("  " + f);
  console.error("");
  process.exit(1);
}

/* -- 8 · emit --------------------------------------------------------------- */

const tokens = {};
for (const [k, v] of light) {
  const rl = resolveLight(v, k);
  const dv = darkExplicit?.has(k) ? darkExplicit.get(k) : v;
  const rd = resolveDark(dv, k);
  const entry = { light: rl };
  if (rd !== rl) entry.dark = rd;
  if (v.includes("var(")) entry.raw = v;
  if (/GAP/.test(raw.slice(Math.max(0, raw.indexOf(k) - 400), raw.indexOf(k)))) {
    // best-effort: the nearest preceding comment mentions a GAP
    entry.unresolved = true;
  }
  tokens[k] = entry;
}

const doc = {
  $comment:
    "GENERATED by foundations/tokens/build-tokens.mjs from tokens.css. Do not hand-edit. " +
    "Names are the commission's (section 4); values are the kwapso design kit's.",
  generatedFrom: "foundations/tokens/tokens.css",
  base: { remBase: "16px", rootRenders: "15px", scales: { small: "13px", medium: "15px", large: "17px" } },
  themes: ["light", "dark"],
  counts: {
    declared: light.size,
    flipInDark: darkExplicit?.size ?? 0,
    unresolvedFlagged: Object.values(tokens).filter((t) => t.unresolved).length,
  },
  tokens,
};

if (!CHECK_ONLY) writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n");

console.log(banner("build-tokens: OK"));
console.log(`  declared on :root        ${light.size}`);
console.log(`  redefined in dark        ${darkExplicit?.size ?? 0}  (x2 blocks, identical)`);
console.log(`  guards                   drift OK · orphans OK · px OK · selectors OK`);
if (warn.length) {
  console.log(`\n  ${warn.length} warning(s):`);
  for (const w of [...new Set(warn)]) console.log("    " + w);
}
console.log(CHECK_ONLY ? "\n  --check: nothing written\n" : `\n  wrote ${OUT}\n`);
