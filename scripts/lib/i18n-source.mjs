// WHAT COUNTS AS A STRING THIS APP SAYS — the one definition, shared.
//
// The extractor writes the catalogue's keys from this, and the adoption codemod
// wraps exactly the same positions in `t(...)`. Two definitions would drift, and
// the day they drifted a string would be wrapped at the call site but missing
// from the catalogue — translated nowhere, and nothing red to show for it.
//
// It walks the real TypeScript syntax tree (the compiler is already a
// devDependency of web/) rather than matching text, because a JSX text node is
// not a quoted string, a prop value can be `foo="bar"` or `foo={"bar"}`, and a
// regex that finds all three also finds every Tailwind class and every cache key.

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import ts from "typescript"

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")

/** The two front doors, and the three folders in each that hold screens. */
export const APP_DIRS = ["web", "web-portal"]
  .flatMap((app) => ["app", "components", "lib"].map((dir) => join(ROOT, app, dir)))
  .sort()

/** The props whose value a person reads. Deliberately a closed list: widening it
 * is how a cache key or a column name ends up in the catalogue. */
export const VISIBLE_PROPS = new Set([
  "placeholder",
  "title",
  "label",
  "aria-label",
  "ariaLabel",
  "description",
  "alt",
  "emptyText",
  "cta",
  "submitLabel",
  "confirmLabel",
])

/** The toast calls whose first argument is the sentence a person sees. */
export const TOAST_METHODS = new Set(["success", "error", "info"])

/** JSX decodes HTML entities; a JavaScript string does not. So `&apos;` in
 * `<p>it&apos;s here</p>` is an apostrophe on screen, and moving that text into
 * `t("it&apos;s here")` would put the five literal characters there instead.
 * The entity is resolved once, here, so the catalogue is keyed by the sentence a
 * person actually reads and the codemod writes exactly that. */
const ENTITIES = {
  "&apos;": "'",
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&quot;": '"',
  "&ldquo;": "“",
  "&rdquo;": "”",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
  "&nbsp;": " ",
  "&amp;": "&",
}

export function decodeEntities(text) {
  // `&amp;` last would double-decode `&amp;apos;`; one pass, longest first.
  return text.replace(/&(?:apos|rsquo|lsquo|quot|ldquo|rdquo|mdash|ndash|hellip|nbsp|amp);/g,
    (hit) => ENTITIES[hit] ?? hit)
}

/** A JSX text node keeps its indentation and line breaks; a person sees one
 * line, because JSX collapses the whitespace before it paints. */
export function collapse(text) {
  return decodeEntities(text).replace(/\s+/g, " ").trim()
}

/** Never a sentence: a path, a URL, an icon/slug identifier, a lone number, a
 * bare punctuation run, a sample email address — or a HALF-SENTENCE.
 *
 * The half-sentence rule earns its place. A paragraph that interleaves prose
 * with a value — `<p>Give {name}'s own work back</p>` — parses as two text
 * nodes, and the second one is `'s own work back`. That is not a string anybody
 * can translate: it has no subject, its grammar depends on what the expression
 * put in front of it, and word order changes between languages anyway. So a
 * fragment that OPENS with punctuation is left in English at the call site
 * rather than machine-translated into nonsense. The fix for one of those is to
 * rewrite it as a whole sentence with a `{placeholder}` in it (shared/i18n.ts
 * `fill`), which is a copy decision, not an extraction one.
 *
 * Checked AFTER whitespace is collapsed and entities are resolved. */
export function isUserVisible(text) {
  if (text.length < 2) return false
  if (!/[A-Za-z]/.test(text)) return false // no letters → not prose
  if (text.startsWith("/") || text.includes("://")) return false // path or URL
  if (/^[.,;:%)\]}&—–…'’]/.test(text)) return false // opens mid-sentence
  if (/^\S+@\S+\.\S+$/.test(text)) return false // a sample address, not copy
  if (/^[a-z0-9]+(?:[-_.][a-z0-9]+)+$/.test(text)) return false // kebab / snake / dotted id
  if (/^[a-z0-9]+$/.test(text) && text.length <= 3) return false // "en", "de", "px"
  return true
}

/** The string behind a node, when it IS a plain string — a literal, or a
 * template with no `${}` in it. Anything computed is deliberately skipped: a
 * concatenation has no single English key, so it has to be split at the call
 * site before it can be translated. */
export function literalText(node) {
  if (!node) return null
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isJsxExpression(node)) return literalText(node.expression)
  return null
}

/** Every .ts/.tsx under `dir`, recursively, in a stable order. */
export function sourceFiles(dir) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return [] // a front door without that folder — nothing to read
  }
  const out = []
  for (const entry of [...entries].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(full))
    else if (/\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

export function parseFile(path) {
  return ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
}

/** Walk a parsed file and call `hit({ text, node, kind })` for every position a
 * person reads. The FIVE positions, and why each one:
 *
 *   jsx-text    <p>No tickets yet</p>          the words themselves
 *   attribute   placeholder="Search accounts"  a prop the reader sees
 *   property    { title: "Home" }              the nav registry and the screen
 *                                              recipes are DATA the engine
 *                                              renders, so their labels are copy
 *   toast       toast.success("Saved.")        the sentence after a write
 *   t-call      t("Save")                      a string ALREADY adopted
 *
 * The last one is what keeps the pair honest. Without it, wrapping a string in
 * `t(...)` would delete it from the extraction — the catalogue would lose its
 * key the moment the call site started using it, and the app would go back to
 * English with a green build. */
export function visitStrings(tree, hit) {
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      report(node.text, node, "jsx-text")
    } else if (ts.isJsxAttribute(node) && VISIBLE_PROPS.has(node.name.getText(tree))) {
      report(literalText(node.initializer), node, "attribute")
    } else if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      VISIBLE_PROPS.has(node.name.text)
    ) {
      report(literalText(node.initializer), node, "property")
    } else if (ts.isCallExpression(node)) {
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        TOAST_METHODS.has(node.expression.name.text) &&
        /(^|\.)toast$/.test(node.expression.expression.getText(tree)) &&
        node.arguments.length > 0
      ) {
        report(literalText(node.arguments[0]), node, "toast")
      } else if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === "t" &&
        node.arguments.length > 0
      ) {
        report(literalText(node.arguments[0]), node, "t-call")
      }
    }
    ts.forEachChild(node, visit)
  }

  function report(raw, node, kind) {
    if (raw === null || raw === undefined) return
    const text = collapse(raw)
    if (isUserVisible(text)) hit({ text, node, kind })
  }

  visit(tree)
}
