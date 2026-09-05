#!/usr/bin/env node
// WHAT THE ASSISTANT PAYS FOR BEFORE ANYBODY TYPES A WORD.
//
// Every model call in an agent turn re-sends the same preamble — the system
// prompt plus the whole tool catalogue — and a turn makes several. That preamble
// is the largest single line in this product's bill, and until 2026-09-05 its
// size was quoted in three places from three different measurements, none of
// them reproducible: "~109 KB" in tools.ts, "roughly 46,000 tokens" in
// prompt-cache.test.ts, "37.6K" and "49KB" in two paragraphs of model.ts.
//
// So this measures it, on the working tree, in one command, and prints the
// arithmetic COSTS.md quotes. It makes NO model call and costs nothing: it
// bundles two pure functions and reads the length of what they return.
//
//     node scripts/measure-preamble.mjs
//     node scripts/measure-preamble.mjs --json
//
// THE CANARY IS THE POINT. An import that silently resolves to an empty
// catalogue would print a beautifully small preamble and a wonderfully cheap
// turn — the shape of every wrong measurement in this repo's history. If either
// half comes back empty, or the tool count is implausible, this exits non-zero
// and says so rather than printing a number.

import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..")
const JSON_OUT = process.argv.includes("--json")

/** THE REPO'S OWN CALIBRATED CHARS-PER-TOKEN, not a guess.
 *
 * `scripts/query-bench.mjs` measured 118,850 characters of this app's real
 * material against 31,094 tokens the provider counted, which is 3.8223. Every
 * other number in this file is a measurement; this one is a conversion, and it
 * is stated rather than folded in so a reader can redo it against a different
 * corpus. Do not replace it with 4 — the difference is 5% on the biggest line
 * in the bill. */
const CHARS_PER_TOKEN = 118_850 / 31_094

/** Bundle the two functions out of the worker's TypeScript and run them.
 *
 * esbuild rather than node's own type stripping, because model.ts uses parameter
 * properties (`constructor(private env: Env)`) which strip-only mode refuses —
 * which is exactly how a previous attempt at this measurement failed to run at
 * all. */
function measure() {
  const dir = mkdtempSync(join(tmpdir(), "kwapso-preamble-"))
  try {
    const entry = join(dir, "entry.ts")
    writeFileSync(
      entry,
      [
        `import { SYSTEM, systemFor } from ${JSON.stringify(join(REPO, "workers/data-ops/src/lib/agent.ts"))}`,
        `import { toolSpecs } from ${JSON.stringify(join(REPO, "workers/data-ops/src/lib/tools.ts"))}`,
        `export const tools = toolSpecs()`,
        // The SAME function with an empty rights sheet: every tool that survives
        // is one carrying no declared gate, so it is sent to every caller
        // whatever their role. That count is the ceiling on what the existing
        // rights trim can ever save, and it has never been written down.
        `export const ungated = toolSpecs(new Set())`,
        `export const system = systemFor(null)`,
        `export const systemRaw = SYSTEM`,
      ].join("\n")
    )
    const out = join(dir, "bundle.mjs")
    execFileSync(
      join(REPO, "node_modules/.bin/esbuild"),
      [
        entry,
        "--bundle",
        "--format=esm",
        "--platform=neutral",
        `--outfile=${out}`,
        // The worker's own path aliases, so `@shared/...` resolves the way it
        // does at build time rather than being treated as a package.
        `--alias:@shared=${join(REPO, "shared")}`,
        "--log-level=error",
      ],
      { stdio: ["ignore", "ignore", "inherit"] }
    )
    return import(pathToFileURL(out).href)
  } finally {
    process.on("exit", () => rmSync(dir, { recursive: true, force: true }))
  }
}

const mod = await measure()
const tools = mod.tools
const system = mod.system

// ── THE CANARY ──────────────────────────────────────────────────────────────
const problems = []
if (!Array.isArray(tools) || tools.length === 0) problems.push("toolSpecs() returned no tools")
// 100, not 50: a caller holding NO rights at all legitimately gets 52 tools
// (the ungated ones), so a threshold under that would pass on a bundle where the
// rights trim had somehow been applied to everybody — which is precisely the
// silent shrink this canary is for. Measured 2026-09-05.
if (Array.isArray(tools) && tools.length < 100)
  problems.push(`toolSpecs() returned only ${tools.length} tools, which is far below the shipped catalogue`)
if (typeof system !== "string" || system.length < 1_000)
  problems.push("systemFor(null) returned no prompt worth the name")
if (Array.isArray(tools) && tools.some((t) => !t?.name || !t?.schema))
  problems.push("a tool spec came back without a name or a schema — the shape is wrong, so the size is meaningless")
if (problems.length) {
  console.error("REFUSING TO PRINT A MEASUREMENT:")
  for (const p of problems) console.error(`  · ${p}`)
  process.exit(1)
}

const toolChars = JSON.stringify(tools).length
const systemChars = system.length
const preambleChars = toolChars + systemChars
const tok = (chars) => Math.round(chars / CHARS_PER_TOKEN)

const result = {
  measuredAt: new Date().toISOString().slice(0, 10),
  tools: tools.length,
  toolChars,
  systemChars,
  preambleChars,
  charsPerToken: Number(CHARS_PER_TOKEN.toFixed(4)),
  preambleTokens: tok(preambleChars),
  toolTokens: tok(toolChars),
  systemTokens: tok(systemChars),
  // WHAT THE RIGHTS TRIM CAN SAVE, AT ITS ABSOLUTE BEST. `toolSpecs(held)` drops
  // a tool whose declared gate the caller does not hold and KEEPS a tool with no
  // declared gate at all (fail open, deliberately — tools.ts says why). So a
  // caller with no rights whatsoever still receives every ungated tool, and that
  // is the floor the trim cannot go below without somebody declaring more gates.
  ungatedTools: mod.ungated.length,
  floorChars: JSON.stringify(mod.ungated).length + systemChars,
  floorTokens: tok(JSON.stringify(mod.ungated).length + systemChars),
  // The five biggest tools by their own JSON, because "the catalogue is large"
  // is not actionable and "these five are 9% of it" is.
  biggest: [...tools]
    .map((t) => ({ name: t.name, chars: JSON.stringify(t).length }))
    .sort((a, b) => b.chars - a.chars)
    .slice(0, 5),
}

if (JSON_OUT) {
  console.log(JSON.stringify(result, null, 2))
} else {
  console.log(`measured            ${result.measuredAt} on the working tree, no model call made`)
  console.log(`tools in catalogue  ${result.tools}`)
  console.log(`tool JSON           ${toolChars.toLocaleString()} chars  (~${result.toolTokens.toLocaleString()} tokens)`)
  console.log(`system prompt       ${systemChars.toLocaleString()} chars  (~${result.systemTokens.toLocaleString()} tokens)`)
  console.log(`PREAMBLE            ${preambleChars.toLocaleString()} chars  (~${result.preambleTokens.toLocaleString()} tokens)`)
  console.log(`chars per token     ${result.charsPerToken}  (calibrated in scripts/query-bench.mjs)`)
  console.log()
  console.log(`ungated tools       ${result.ungatedTools} of ${result.tools} carry no declared gate, so every caller gets them`)
  console.log(
    `trim FLOOR          ${result.floorChars.toLocaleString()} chars  (~${result.floorTokens.toLocaleString()} tokens) ` +
      `— what a caller holding NO rights still receives, i.e. the best the rights trim can ever do`
  )
  console.log()
  console.log("the five largest tool definitions:")
  for (const b of result.biggest) console.log(`  ${b.chars.toLocaleString().padStart(7)}  ${b.name}`)
}
