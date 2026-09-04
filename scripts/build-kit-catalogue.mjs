#!/usr/bin/env node
/**
 * build-kit-catalogue.mjs — what the design kit offers, read off its own source.
 *
 *     node scripts/build-kit-catalogue.mjs            write tools/screen-builder/catalogue.json
 *     node scripts/build-kit-catalogue.mjs --check    exit 1 if the file on disk is stale
 *
 * THE ONE RULE. The owner, verbatim: "Don't magically add configurations on the
 * components or collections that Aurora has not put in the UI/UX kit. You should
 * only show me what is there as of this moment, live." So nothing in this file
 * is a list of options. Every option the screen builder offers is DERIVED here,
 * by parsing `shared/ui/components/**\/*.tsx` with the TypeScript compiler and
 * reading each `cva()` call: its variant groups, the exact option names, and the
 * Tailwind class string each option applies — taken from the source, never
 * retyped. A component with no `cva()` is catalogued with no variants, which the
 * tool then SAYS rather than papering over.
 *
 * WHAT "LIVE" HONESTLY MEANS. A browser page cannot read Aurora's private
 * repository. `shared/ui/` is the kit vendored at the tag in VERSION.json,
 * hash-pinned by web/test/vendored-kit.test.ts, and this script re-reads that
 * copy. So the loop is: `node scripts/sync-design.mjs <tag>`, then this script,
 * and the catalogue carries the tag, the sha and the generation time so the
 * owner can always see which kit he is looking at. A catalogue that is behind
 * the kit goes red in web/test/kit-catalogue.test.ts, the same way R28 refuses
 * a stale translation catalogue.
 *
 * WHAT IS DERIVED, AND FROM WHERE
 *   - components:   one entry per folder under shared/ui/components/ (the kit
 *                   groups them flat, one folder each; that is the grouping).
 *   - exports:      every value export of the file, read off the AST.
 *   - cva sites:    every `cva(base, { variants, defaultVariants,
 *                   compoundVariants })` call; base and every option class
 *                   string are evaluated statically (string literals, arrays,
 *                   `.join(" ")`, same-file constants, template literals,
 *                   `cn()`/`clsx()` joins). Anything it cannot evaluate is
 *                   recorded under `unresolved` WITH its source text — reported,
 *                   never guessed.
 *   - usedBy:       which export's body references the cva function, so the
 *                   tool knows which part a variant group belongs to.
 *   - typed props:  own members of every exported `*Props` type whose type is a
 *                   union of string literals (an enum the kit typed) or
 *                   `boolean`. These are the kit's other real options
 *                   (`loading`, `disabled`, a `size` typed without a cva).
 *   - notes:        the JSDoc line the kit wrote above each option, when there
 *                   is one — the kit's own words, shown beside the option.
 *   - compositions: listed for reference only (file + exports). The brief:
 *                   these are ALREADY-BUILT screens; the builder assembles parts.
 *   - manifestDrift: shared/ui/manifest.json carries a hand-kept `props` list
 *                   for 25 components. It is Aurora's, so it is cross-checked
 *                   against the source-derived groups and every disagreement is
 *                   reported. The SOURCE wins: a component draws what its cva
 *                   says, not what a JSON file remembers.
 *
 * EXPORTED for the lock (web/test/kit-catalogue.test.ts) and for the bundler
 * (scripts/build-screen-builder.mjs), so the checked catalogue, the committed
 * catalogue and the one the tool ships can never be three different answers.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, relative, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

import { ROOT, parseFile, sourceFiles } from "./lib/i18n-source.mjs"

export const KIT = join(ROOT, "shared", "ui")
export const CATALOGUE_PATH = join(ROOT, "tools", "screen-builder", "catalogue.json")

const COMPONENTS = join(KIT, "components")
const COMPOSITIONS = join(KIT, "compositions")

/* ---------------------------------------------------------------------------
   Static evaluation of a class-string expression. Returns a string, or null
   when the expression is not something a reader could resolve without running
   the file (a ternary, a function parameter, an imported name). Null is
   reported, never replaced with a guess.
   --------------------------------------------------------------------------- */

const collapse = (s) => s.replace(/\s+/g, " ").trim()

function topLevelConst(sf, name) {
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === name && decl.initializer) return decl.initializer
    }
  }
  return null
}

function evalClasses(node, sf, depth = 0) {
  if (!node || depth > 12) return null
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression?.(node) || ts.isTypeAssertionExpression(node))
    return evalClasses(node.expression, sf, depth + 1)
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return collapse(node.text)
  if (ts.isTemplateExpression(node)) {
    let out = node.head.text
    for (const span of node.templateSpans) {
      const v = evalClasses(span.expression, sf, depth + 1)
      if (v === null) return null
      out += v + span.literal.text
    }
    return collapse(out)
  }
  if (ts.isArrayLiteralExpression(node)) return joinAll(node.elements, sf, " ", depth)
  if (ts.isSpreadElement(node)) return evalClasses(node.expression, sf, depth + 1)
  if (ts.isIdentifier(node)) {
    const init = topLevelConst(sf, node.text)
    return init ? evalClasses(init, sf, depth + 1) : null
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = evalClasses(node.left, sf, depth + 1)
    const r = evalClasses(node.right, sf, depth + 1)
    return l === null || r === null ? null : collapse(l + r)
  }
  if (ts.isCallExpression(node)) {
    const callee = node.expression
    // `[...].join(" ")` — the kit's own idiom for a long base string.
    if (ts.isPropertyAccessExpression(callee) && callee.name.text === "join") {
      const sep = node.arguments[0] ? evalClasses(node.arguments[0], sf, depth + 1) ?? " " : ","
      const arr = callee.expression
      if (ts.isArrayLiteralExpression(arr)) return joinAll(arr.elements, sf, sep || " ", depth)
      const v = evalClasses(arr, sf, depth + 1)
      return v
    }
    // `cn(a, b)` / `clsx(a, b)` — a join.
    if (ts.isIdentifier(callee) && ["cn", "clsx", "cx"].includes(callee.text)) return joinAll(node.arguments, sf, " ", depth)
  }
  return null
}

function joinAll(nodes, sf, sep, depth) {
  const parts = []
  for (const n of nodes) {
    const v = evalClasses(n, sf, depth + 1)
    if (v === null) return null
    if (v) parts.push(v)
  }
  return collapse(parts.join(sep))
}

/** A literal value (for defaultVariants / compoundVariants conditions). */
function evalLiteral(node) {
  if (!node) return undefined
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  if (node.kind === ts.SyntaxKind.NullKeyword) return null
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(evalLiteral)
  return undefined
}

function propName(node) {
  const n = node.name
  if (!n) return null
  if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return n.text
  return null
}

/** The JSDoc / line comment written directly above a node, as one sentence. */
function leadingNote(node, sf) {
  const ranges = ts.getLeadingCommentRanges(sf.text, node.getFullStart()) ?? []
  if (ranges.length === 0) return null
  const last = ranges[ranges.length - 1]
  const raw = sf.text.slice(last.pos, last.end)
  const text = raw
    .replace(/^\/\*\*?|\*\/$/g, "")
    .split("\n")
    .map((l) => l.replace(/^\s*(\*|\/\/)\s?/, ""))
    .filter((l) => !/^[=\-─]{4,}\s*$/.test(l.trim())) // the kit's banner rules, not words
    .join(" ")
  return collapse(text) || null
}

function objectProps(node) {
  return node && ts.isObjectLiteralExpression(node) ? node.properties : []
}

function findProp(obj, name) {
  for (const p of objectProps(obj)) if (propName(p) === name) return p.initializer ?? p
  return null
}

/* ---------------------------------------------------------------------------
   cva sites
   --------------------------------------------------------------------------- */

function readCvaSite(call, sf) {
  const decl = call.parent
  const name = ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name) ? decl.name.text : null
  // `decl` rides along until usedBy is settled, then is deleted (not JSON).
  const line = sf.getLineAndCharacterOfPosition(call.getStart(sf)).line + 1
  const unresolved = []
  const note = (what, node) => unresolved.push({ what, source: collapse(node.getText(sf)).slice(0, 200) })

  const base = evalClasses(call.arguments[0], sf)
  if (base === null && call.arguments[0]) note("base", call.arguments[0])

  const config = call.arguments[1]
  const groups = []
  for (const g of objectProps(findProp(config, "variants"))) {
    const gname = propName(g)
    if (!gname) continue
    const options = []
    for (const o of objectProps(g.initializer)) {
      const oname = propName(o)
      if (oname === null) continue
      const valueNode = ts.isShorthandPropertyAssignment(o) ? o.name : o.initializer
      const classes = evalClasses(valueNode, sf)
      if (classes === null) note(`${gname}.${oname}`, valueNode)
      options.push({ name: oname, classes, note: leadingNote(o, sf) })
    }
    groups.push({ name: gname, options })
  }

  const defaults = {}
  for (const d of objectProps(findProp(config, "defaultVariants"))) {
    const dname = propName(d)
    if (dname) defaults[dname] = evalLiteral(d.initializer)
  }

  const compound = []
  const cv = findProp(config, "compoundVariants")
  if (cv && ts.isArrayLiteralExpression(cv)) {
    for (const entry of cv.elements) {
      const when = {}
      let classes = null
      for (const p of objectProps(entry)) {
        const pn = propName(p)
        if (pn === "class" || pn === "className") {
          classes = evalClasses(p.initializer, sf)
          if (classes === null) note("compound.class", p.initializer)
        } else if (pn) when[pn] = evalLiteral(p.initializer)
      }
      compound.push({ when, classes })
    }
  }

  return { name, line, base, groups, defaults, compound, unresolved, decl }
}

/* ---------------------------------------------------------------------------
   Exports, and which export uses which cva
   --------------------------------------------------------------------------- */

function valueExports(sf) {
  const names = new Map() // name → declaration node (or null for re-exports)
  const has = (node, kw) => node.modifiers?.some((m) => m.kind === kw)
  for (const stmt of sf.statements) {
    if (ts.isExportDeclaration(stmt) && !stmt.moduleSpecifier && stmt.exportClause && ts.isNamedExports(stmt.exportClause) && !stmt.isTypeOnly) {
      for (const el of stmt.exportClause.elements) {
        if (el.isTypeOnly) continue
        const local = (el.propertyName ?? el.name).text
        names.set(el.name.text, declarationOf(sf, local))
      }
    }
    if (has(stmt, ts.SyntaxKind.ExportKeyword)) {
      if (ts.isFunctionDeclaration(stmt) && stmt.name) names.set(stmt.name.text, stmt)
      if (ts.isVariableStatement(stmt))
        for (const d of stmt.declarationList.declarations) if (ts.isIdentifier(d.name)) names.set(d.name.text, d)
    }
  }
  return names
}

function declarationOf(sf, name) {
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name?.text === name) return stmt
    if (ts.isVariableStatement(stmt))
      for (const d of stmt.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name) return d
  }
  return null
}

function mentions(node, ident) {
  let found = false
  const visit = (n) => {
    if (found) return
    if (ts.isIdentifier(n) && n.text === ident) found = true
    else ts.forEachChild(n, visit)
  }
  if (node) visit(node)
  return found
}

/* ---------------------------------------------------------------------------
   Typed props: enum-of-literals and boolean members of exported *Props types
   --------------------------------------------------------------------------- */

function typedProps(sf) {
  const out = []
  for (const stmt of sf.statements) {
    const exported = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    if (!exported) continue
    let name, members = [], variantsFrom = []
    if (ts.isInterfaceDeclaration(stmt)) {
      name = stmt.name.text
      members = stmt.members
      for (const h of stmt.heritageClauses ?? [])
        for (const t of h.types) {
          const tn = t.expression.getText(sf)
          const arg = t.typeArguments?.[0]
          if (tn === "VariantProps" && arg && ts.isTypeQueryNode(arg)) variantsFrom.push(arg.exprName.getText(sf))
        }
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      name = stmt.name.text
      const collect = (t) => {
        if (ts.isTypeLiteralNode(t)) members.push(...t.members)
        else if (ts.isIntersectionTypeNode(t)) t.types.forEach(collect)
        else if (ts.isTypeReferenceNode(t) && t.typeName.getText(sf) === "VariantProps" && t.typeArguments?.[0] && ts.isTypeQueryNode(t.typeArguments[0]))
          variantsFrom.push(t.typeArguments[0].exprName.getText(sf))
      }
      collect(stmt.type)
    } else continue
    if (!/Props$/.test(name)) continue
    const props = []
    for (const m of members) {
      if (!ts.isPropertySignature(m) || !m.type) continue
      const pn = propName(m)
      if (!pn) continue
      const kind = classifyType(m.type, sf)
      if (!kind) continue
      props.push({ name: pn, optional: !!m.questionToken, ...kind, note: leadingNote(m, sf) })
    }
    out.push({ type: name, variantsFrom, props })
  }
  return out
}

function classifyType(t, sf) {
  if (ts.isParenthesizedTypeNode(t)) return classifyType(t.type, sf)
  if (t.kind === ts.SyntaxKind.BooleanKeyword) return { kind: "boolean" }
  if (ts.isUnionTypeNode(t)) {
    const values = []
    let bools = 0
    for (const u of t.types) {
      if (ts.isLiteralTypeNode(u)) {
        if (ts.isStringLiteral(u.literal)) values.push(u.literal.text)
        else if (u.literal.kind === ts.SyntaxKind.TrueKeyword || u.literal.kind === ts.SyntaxKind.FalseKeyword) bools++
        else if (u.literal.kind === ts.SyntaxKind.NullKeyword) continue
        else return null
      } else if (u.kind === ts.SyntaxKind.UndefinedKeyword) continue
      else if (u.kind === ts.SyntaxKind.BooleanKeyword) bools = 2
      else return null
    }
    if (values.length > 0 && bools === 0) return { kind: "enum", values }
    if (values.length === 0 && bools > 0) return { kind: "boolean" }
  }
  return null
}

/* ---------------------------------------------------------------------------
   The walk
   --------------------------------------------------------------------------- */

/** One source file's contribution: its exports, its cva sites, its typed props. */
function readFile(path) {
  const rel = relative(KIT, path)
  const sf = parseFile(path)
  const exports = valueExports(sf)

  const cva = []
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "cva") cva.push({ file: rel, ...readCvaSite(n, sf) })
    ts.forEachChild(n, visit)
  }
  visit(sf)

  // The cva functions themselves are exported too, sometimes under an alias
  // (`export { feedRowVariants as activityFeedRowVariants }`). Those are not
  // parts and do not USE a cva, so they are set aside by their DECLARATION,
  // which an alias cannot disguise.
  const cvaDecls = new Set(cva.map((s) => s.decl))
  const partExports = [...exports].filter(([, decl]) => !decl || !cvaDecls.has(decl))
  for (const site of cva) {
    site.usedBy = partExports.filter(([, decl]) => decl && mentions(decl, site.name)).map(([name]) => name)
    delete site.decl
  }

  return {
    file: rel,
    exports: partExports.map(([name]) => ({ name, file: rel })),
    cva,
    typedProps: typedProps(sf).map((t) => ({ file: rel, ...t })),
    description: leadingNote(sf.statements[0], sf)?.slice(0, 240) ?? null,
  }
}

/** One entry per FOLDER under components/ — the kit's own grouping (flat, one
 * folder per part; manifest.json keys by the same name). A folder holding two
 * .tsx files (breadcrumbs, collection-frame) is ONE part with both files read;
 * a folder holding only .ts (the two hooks) is a part the tool cannot draw and
 * says so, rather than a part that silently goes missing from the count. */
function componentEntry(folder) {
  const dir = join(COMPONENTS, folder)
  const files = sourceFiles(dir).map(readFile)
  const drawable = files.filter((f) => f.file.endsWith(".tsx"))
  return {
    name: folder,
    kind: drawable.length > 0 ? "component" : "hook",
    files: files.map((f) => f.file),
    exports: files.flatMap((f) => f.exports),
    cva: files.flatMap((f) => f.cva),
    typedProps: files.flatMap((f) => f.typedProps),
    description: (drawable[0] ?? files[0])?.description ?? null,
  }
}

function listCompositions() {
  const out = []
  for (const group of readdirSync(COMPOSITIONS, { withFileTypes: true })) {
    if (!group.isDirectory()) continue
    for (const path of sourceFiles(join(COMPOSITIONS, group.name))) {
      if (path.endsWith("/index.ts")) continue
      const sf = parseFile(path)
      out.push({ group: group.name, name: relative(join(COMPOSITIONS, group.name), path).replace(/\.tsx?$/, ""), file: relative(KIT, path), exports: [...valueExports(sf).keys()] })
    }
  }
  return out
}

function manifestDrift(components) {
  const manifest = JSON.parse(readFileSync(join(KIT, "manifest.json"), "utf8"))
  const drift = []
  const onDisk = new Map(components.map((c) => [c.name, c]))
  for (const [name, entry] of Object.entries(manifest.components ?? {})) {
    const c = onDisk.get(name)
    if (!c) {
      drift.push({ component: name, kind: "manifest-only", detail: "listed in manifest.json, no file under components/" })
      continue
    }
    for (const [group, values] of Object.entries(entry.props ?? {})) {
      const derived = c.cva.flatMap((s) => s.groups).find((g) => g.name === group)
      const typed = c.typedProps.flatMap((t) => t.props).find((p) => p.name === group && p.kind === "enum")
      const got = derived ? derived.options.map((o) => o.name) : typed ? typed.values : null
      if (!got) drift.push({ component: name, kind: "group-missing-in-source", group, manifest: values })
      else if (JSON.stringify([...values].sort()) !== JSON.stringify([...got].sort()))
        drift.push({ component: name, kind: "values-differ", group, manifest: values, source: got })
    }
  }
  for (const c of components) if (!manifest.components?.[c.name]) drift.push({ component: c.name, kind: "source-only", detail: "on disk, not in manifest.json" })
  return drift
}

export function buildCatalogue() {
  const version = JSON.parse(readFileSync(join(KIT, "VERSION.json"), "utf8"))
  const components = readdirSync(COMPONENTS, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => componentEntry(e.name))
    .sort((a, b) => a.name.localeCompare(b.name))
  const compositions = listCompositions()
  const tokensCss = readFileSync(join(KIT, "foundations", "tokens", "tokens.css"), "utf8")
  // Declarations count every `--name:` line (light and dark both declare);
  // `tokens` is the number of DISTINCT names, which is what a page can read.
  const tokenDeclarations = tokensCss.match(/^\s*(--[\w-]+)\s*:/gm) ?? []
  const tokens = new Set(tokenDeclarations.map((m) => m.trim().replace(/\s*:$/, ""))).size
  const icons = readdirSync(join(KIT, "foundations", "icons")).filter((f) => f.endsWith(".svg")).length

  const cvaSites = components.reduce((n, c) => n + c.cva.length, 0)
  const groups = components.flatMap((c) => c.cva.flatMap((s) => s.groups))
  const variantOptions = groups.reduce((n, g) => n + g.options.length, 0)
  const typed = components.flatMap((c) => c.typedProps.flatMap((t) => t.props))
  const unresolved = components.flatMap((c) => c.cva.flatMap((s) => s.unresolved.map((u) => ({ component: c.name, cva: s.name, ...u }))))

  return {
    kit: { repo: version.repo, tag: version.tag, sha: version.sha, syncedAt: version.syncedAt },
    generatedAt: new Date().toISOString(),
    counts: {
      components: components.length,
      hooks: components.filter((c) => c.kind === "hook").length,
      withVariants: components.filter((c) => c.cva.length > 0).length,
      withoutVariants: components.filter((c) => c.cva.length === 0).length,
      cvaSites,
      variantGroups: groups.length,
      variantOptions,
      typedEnumProps: typed.filter((p) => p.kind === "enum").length,
      typedBooleanProps: typed.filter((p) => p.kind === "boolean").length,
      compositions: compositions.length,
      icons,
      tokens,
      tokenDeclarations: tokenDeclarations.length,
      unresolved: unresolved.length,
    },
    components,
    compositions,
    manifestDrift: manifestDrift(components),
    unresolved,
  }
}

/** Everything except the timestamp — what "stale" is measured against. */
export function stableCatalogue(c) {
  const { generatedAt: _, ...rest } = c
  return JSON.stringify(rest)
}

function main() {
  const check = process.argv.includes("--check")
  const fresh = buildCatalogue()
  const c = fresh.counts
  console.log(`kit ${fresh.kit.tag} (${fresh.kit.sha.slice(0, 7)}, synced ${fresh.kit.syncedAt})`)
  console.log(`${c.components} components: ${c.withVariants} with variants, ${c.withoutVariants} without`)
  console.log(`${c.cvaSites} cva sites, ${c.variantGroups} variant groups, ${c.variantOptions} variant options`)
  console.log(`${c.typedEnumProps} typed enum props, ${c.typedBooleanProps} typed boolean props`)
  console.log(`${c.compositions} compositions (reference only), ${c.icons} icons, ${c.tokens} tokens (${c.tokenDeclarations} declarations, light + dark)`)
  if (fresh.unresolved.length) {
    console.log(`\n${fresh.unresolved.length} class strings the static reader could not resolve (reported, not guessed):`)
    for (const u of fresh.unresolved) console.log(`  ${u.component} ${u.cva} ${u.what}: ${u.source}`)
  }
  if (fresh.manifestDrift.length) {
    console.log(`\nmanifest.json disagrees with the source in ${fresh.manifestDrift.length} places (the source wins):`)
    for (const d of fresh.manifestDrift) console.log(`  ${d.component} ${d.kind}${d.group ? " " + d.group : ""}${d.manifest ? " manifest=" + JSON.stringify(d.manifest) : ""}${d.source ? " source=" + JSON.stringify(d.source) : ""}${d.detail ? " " + d.detail : ""}`)
  }
  if (check) {
    if (!existsSync(CATALOGUE_PATH)) {
      console.error(`\n${relative(ROOT, CATALOGUE_PATH)} is missing — run without --check`)
      process.exit(1)
    }
    const onDisk = JSON.parse(readFileSync(CATALOGUE_PATH, "utf8"))
    if (stableCatalogue(onDisk) !== stableCatalogue(fresh)) {
      console.error(`\n${relative(ROOT, CATALOGUE_PATH)} is STALE against shared/ui — run node scripts/build-kit-catalogue.mjs`)
      process.exit(1)
    }
    console.log("\ncatalogue is current")
    return
  }
  mkdirSync(dirname(CATALOGUE_PATH), { recursive: true })
  writeFileSync(CATALOGUE_PATH, JSON.stringify(fresh, null, 1) + "\n")
  console.log(`\nwrote ${relative(ROOT, CATALOGUE_PATH)}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
