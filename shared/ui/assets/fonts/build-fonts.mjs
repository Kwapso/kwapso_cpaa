#!/usr/bin/env node
/* ============================================================================
   build-fonts.mjs
   The .otf masters in this folder  ->  .woff2 beside them.

     node assets/fonts/build-fonts.mjs
     node assets/fonts/build-fonts.mjs --check   (verifies, writes nothing)

   Why this exists rather than a one-off conversion:

   The .otf files the client sent are the masters and stay in the repo. woff2
   is the same outlines in roughly half the bytes — these three faces ship to
   two production apps on every page load, so the difference is real. But a
   converted binary with no recorded provenance is a file nobody can rebuild,
   and the next person to receive an updated cut would have to rediscover how
   the last one was made. This script is that record.

   wawoff2 is the Emscripten build of Google's own `woff2` library — the same
   code as `woff2_compress` — so it takes sfnt input with either outline
   flavour: CFF (what an .otf carries) or glyf (a .ttf). It is a devDependency
   because this repo already has a node toolchain; a Python `fonttools` route
   would work identically but would be a second toolchain for the two
   consuming apps' CI to discover.

   The conversion is lossless in the sense that matters: woff2 is a container
   and a compression scheme, not a re-render. The glyph outlines, the metrics
   and the tables come out byte-identical after decompression.

   WHY THE .ttf FILES STAY. The client sent each face twice, .otf and .ttf, and
   nothing in this repo references the .ttf — no stylesheet, no import, no
   build script; they are not bundled and they are never fetched, so they cost
   457 KB of git and nothing else. They are kept anyway, because the two
   flavours are not interchangeable: the .otf carry CFF outlines and the .ttf
   carry glyf, and regenerating one from the other is a curve conversion, not
   a repack. If a consumer ever needs TTF — a React Native target, a
   server-side PDF renderer — having the client's own cut beats having one we
   approximated. Delete them only on a decision that says so out loud.

   THE LICENCE. `LicenseAgreement.pdf` sits in this folder as the paper record.
   It has not been read and does not need to be: the client confirmed in
   writing on 2026-08-24 that the licence permits shipping these files inside
   this repo, and that the consuming apps are internal. That is their call and
   it is made.
   ============================================================================ */

import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { compress, decompress } from "wawoff2";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECK_ONLY = process.argv.includes("--check");

/* The three faces the system uses. The names are the client's filenames; the
   family and weight each one answers to are settled in tokens/tokens.css §5,
   not here — this script only moves bytes. */
const MASTERS = [
  "Saans-Light.otf",
  "Saans-Medium.otf",
  "SerrifCondensed-Light.otf",
];

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const fail = [];
const rows = [];

for (const master of MASTERS) {
  const src = join(HERE, master);
  const out = src.replace(/\.otf$/, ".woff2");

  if (!existsSync(src)) {
    fail.push(`missing master — ${master}`);
    continue;
  }

  const input = readFileSync(src);
  const packed = Buffer.from(await compress(input));

  /* Round-trip before writing. A woff2 that decompresses to a different byte
     count than it went in as is a corrupt conversion, and the failure mode is
     a browser that silently declines the face and falls back — which looks
     almost right, which is the whole hazard this job exists to avoid. */
  const back = Buffer.from(await decompress(packed));
  if (back.length !== input.length) {
    fail.push(
      `round-trip mismatch — ${master}: ${input.length} in, ${back.length} out`,
    );
    continue;
  }

  if (CHECK_ONLY) {
    if (!existsSync(out)) {
      fail.push(`missing woff2 — ${master.replace(/\.otf$/, ".woff2")}`);
      continue;
    }
    if (statSync(out).size !== packed.length) {
      fail.push(`stale woff2 — ${master.replace(/\.otf$/, ".woff2")} does not match its master`);
      continue;
    }
  } else {
    writeFileSync(out, packed);
  }

  rows.push({
    name: master,
    from: input.length,
    to: packed.length,
    saved: 1 - packed.length / input.length,
  });
}

if (fail.length) {
  console.error("\nbuild-fonts: FAILED\n-------------------");
  for (const f of fail) console.error("  " + f);
  console.error("");
  process.exit(1);
}

console.log("\nbuild-fonts: OK\n---------------");
for (const r of rows) {
  console.log(
    `  ${r.name.padEnd(28)} ${kb(r.from).padStart(9)} -> ${kb(r.to).padStart(9)}` +
      `   -${(r.saved * 100).toFixed(0)}%`,
  );
}
const from = rows.reduce((a, r) => a + r.from, 0);
const to = rows.reduce((a, r) => a + r.to, 0);
console.log(`  ${"three faces".padEnd(28)} ${kb(from).padStart(9)} -> ${kb(to).padStart(9)}   -${((1 - to / from) * 100).toFixed(0)}%`);
console.log(CHECK_ONLY ? "\n  --check: nothing written\n" : "\n  wrote three .woff2 beside their masters\n");
