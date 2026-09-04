#!/usr/bin/env node
/**
 * build-screen-builder.mjs — one command, one standalone page.
 *
 *     node scripts/build-screen-builder.mjs
 *     open tools/screen-builder/index.html
 *
 * Runs the catalogue derivation (scripts/build-kit-catalogue.mjs), compiles
 * the kit's stylesheet through the SAME Tailwind pipeline both front doors use
 * (@tailwindcss/postcss over tools/screen-builder/styles.css, fonts inlined so
 * the file stands alone), bundles the builder and every kit part it draws with
 * esbuild, and writes ONE index.html. That file is regenerable output and is
 * git-ignored; the catalogue beside it is committed and locked by
 * web/test/kit-catalogue.test.ts.
 *
 * Re-run after `node scripts/sync-design.mjs <tag>` — that is what "live"
 * honestly means here (the page cannot read Aurora's private repository), and
 * the page prints the tag it was built from so the owner can always tell.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"

import esbuild from "esbuild"
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"

import { CATALOGUE_PATH, buildCatalogue } from "./build-kit-catalogue.mjs"
import { ROOT } from "./lib/i18n-source.mjs"

const TOOL = join(ROOT, "tools", "screen-builder")
const OUT = join(TOOL, "index.html")

const MIME = { ".woff2": "font/woff2", ".woff": "font/woff", ".otf": "font/otf", ".ttf": "font/ttf", ".svg": "image/svg+xml", ".png": "image/png" }

async function compileCss() {
  const from = join(TOOL, "styles.css")
  const result = await postcss([tailwind()]).process(readFileSync(from, "utf8"), { from })
  let inlined = 0
  const css = result.css.replace(/url\((["']?)([^"')]+)\1\)/g, (whole, q, ref) => {
    if (/^(data:|https?:)/.test(ref)) return whole
    const path = resolve(dirname(from), ref)
    const ext = ref.slice(ref.lastIndexOf(".")).toLowerCase()
    if (!existsSync(path) || !MIME[ext]) return whole
    inlined++
    return `url("data:${MIME[ext]};base64,${readFileSync(path).toString("base64")}")`
  })
  return { css, inlined }
}

async function bundle() {
  const result = await esbuild.build({
    entryPoints: [join(TOOL, "app.tsx")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    minify: true,
    legalComments: "none",
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".svg": "dataurl", ".png": "dataurl", ".jpg": "dataurl", ".woff2": "dataurl", ".otf": "dataurl", ".ttf": "dataurl", ".css": "text" },
    alias: { "@shared": join(ROOT, "shared") },
    logLevel: "warning",
  })
  return result.outputFiles[0].text
}

const escapeJsonForHtml = (s) => s.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--")

async function main() {
  const catalogue = buildCatalogue()
  mkdirSync(dirname(CATALOGUE_PATH), { recursive: true })
  writeFileSync(CATALOGUE_PATH, JSON.stringify(catalogue, null, 1) + "\n")
  const c = catalogue.counts
  console.log(`catalogue: kit ${catalogue.kit.tag}, ${c.components} parts (${c.withVariants} with variants), ${c.cvaSites} cva sites, ${c.variantOptions} variant options, ${c.typedEnumProps + c.typedBooleanProps} typed props`)

  const [{ css, inlined }, js] = await Promise.all([compileCss(), bundle()])
  console.log(`css: ${(css.length / 1024).toFixed(0)} KB, ${inlined} asset url(s) inlined`)
  console.log(`js: ${(js.length / 1024).toFixed(0)} KB`)

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>kwapso screen builder · kit ${catalogue.kit.tag}</title>
<style id="kit-css">${css.replace(/<\/style/gi, "<\\/style")}</style>
</head>
<body class="bg-background text-foreground">
<div id="app"></div>
<script id="catalogue" type="application/json">${escapeJsonForHtml(JSON.stringify(catalogue))}</script>
<script>${js.replace(/<\/script/gi, "<\\/script")}</script>
</body>
</html>
`
  writeFileSync(OUT, html)
  console.log(`wrote ${relative(ROOT, OUT)} (${(html.length / 1024 / 1024).toFixed(2)} MB) — open it in a browser`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
