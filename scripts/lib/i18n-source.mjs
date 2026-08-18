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
  // A FIELD'S HELP TEXT is the sentence under the input, and it is copy by
  // definition: `helpText` is the library `FieldConfig`'s own property name
  // (@kwapso/ui/lib/config), so it cannot hold data the way a bare `title` can.
  // `translateRecipe` has translated `field.helpText` since the day it was
  // written; nothing was ever putting those sentences in the catalogue for it to
  // find, so the branch could only ever return the English it was given.
  "helpText",
  "cta",
  "submitLabel",
  "confirmLabel",
])

/** The same, plus the props a person reads ONLY when they are written as an
 * object property.
 *
 * `scope` is the whole reason this second set exists. WHAT CONNECTING A SERVICE
 * LETS US SEE (google-connections.tsx `SERVICE_COPY`) is four sentences of prose
 * kept under a `scope:` property, and they were user-visible copy sitting
 * outside the catalogue — so somebody reading the app in German was told in
 * English what kwapso may read from their mailbox. The sentence a person needs
 * MOST in their own language is the one about their own privacy.
 *
 * It was added to the one set with a note saying "narrow by construction: the
 * only string-literal `scope` props in either front door are those four". That
 * stopped being true the day `GoogleSyncButton` shipped: `scope="knowledge"` /
 * `scope="both"` is a UNION MEMBER the component switches on, and three of them
 * went into the catalogue and were machine-translated in twenty-eight languages.
 * A wrapped one would not merely be silly, it would not compile — the codemod
 * that wrapped them is what surfaced this — and a rule that says "wrap every
 * extracted position" cannot stand while a position is a type.
 *
 * A prop's NAME does not tell you whether its value is prose; where it is
 * WRITTEN does, here, because the prose is a property of a copy table and the
 * union member is a JSX attribute. So the attribute set stays closed and narrow
 * and the property set carries the one extra. */
export const VISIBLE_PROPERTIES = new Set([...VISIBLE_PROPS, "scope"])

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

/** Every plain string a node can RENDER AS — a literal, or a template with no
 * `${}` in it, or one of the branches of a choice between them.
 *
 * A CHOICE IS DESCENDED; A COMPOSITION IS NOT. That is the whole rule, and the
 * line falls where translatability falls:
 *
 *   `editing ? "Edit app" : "Record an app"`  two sentences, one shown → BOTH
 *   `name ?? "Nobody yet"`                    a fallback a reader sees   → BOTH
 *   `"Saved " + count + " rows"`              no single English key      → NEITHER
 *   `` `Filed under ${name}` ``               same                       → NEITHER
 *
 * Returning an ARRAY rather than one string is what closes R28's oldest hole.
 * A sentence inside a ternary is a JSX EXPRESSION, not a literal and not JSX
 * text, so the old single-valued version walked straight past it — and the
 * dialog titles and subtitles of most of the form dialogs in this app are
 * exactly that shape. They were in no catalogue, so they were translated
 * nowhere, so they reached a German reader in English on a screen that looked
 * finished. The only fix available at the call site was to wrap each branch in
 * `t(...)` by hand (web/components/account-form-dialog.tsx says so in a comment),
 * which works for the four somebody remembered and for none written afterwards.
 *
 * The two operands of `&&` are NOT treated alike: `cond && "Saved"` renders its
 * RIGHT side and tests its left, so descending into the left would harvest the
 * string out of a comparison (`kind === "asc" && …`) and put a sort direction in
 * the catalogue. `||` and `??` can render either side, so both are taken. No
 * other operator is descended, which is why `===` inside a condition is never
 * reached at all. */
export function literalTexts(node, out = []) {
  if (!node) return out
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    out.push(node.text)
    return out
  }
  if (ts.isJsxExpression(node) || ts.isParenthesizedExpression(node))
    return literalTexts(node.expression, out)
  if (ts.isConditionalExpression(node)) {
    literalTexts(node.whenTrue, out)
    return literalTexts(node.whenFalse, out)
  }
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      literalTexts(node.left, out)
      return literalTexts(node.right, out)
    }
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return literalTexts(node.right, out)
  }
  return out
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
 * person reads. The SEVEN positions, and why each one:
 *
 *   jsx-text    <p>No tickets yet</p>          the words themselves
 *   jsx-child   <p>{busy ? "Saving…" : "Save"}</p>
 *                                              the words themselves again, when
 *                                              they arrive through an expression
 *   attribute   placeholder="Search accounts"  a prop the reader sees
 *   property    { title: "Home" }              the nav registry and the screen
 *                                              recipes are DATA the engine
 *                                              renders, so their labels are copy
 *   field-label field("name", "Meeting")       a table's column heading, which is
 *                                              the same copy said through a
 *                                              constructor instead of an object
 *   toast       toast.success("Saved.")        the sentence after a write
 *   t-call      t("Save")                      a string ALREADY adopted
 *
 * The last one is what keeps the pair honest. Without it, wrapping a string in
 * `t(...)` would delete it from the extraction — the catalogue would lose its
 * key the moment the call site started using it, and the app would go back to
 * English with a green build.
 *
 * FIELD-LABEL IS THE SEVENTH, AND IT IS THE SAME WORDS AS `property`. A recipe
 * field is built by `field(column, label)` (web/lib/screens.ts), so its label is
 * an ARGUMENT rather than a `label:` property — and `property` only ever looked
 * at the second. Every column heading in the app was therefore outside the
 * catalogue: the recipes' own, and the tables a screen composes for itself. The
 * law that exists to catch a sentence shipping in English could not see the one
 * kind of sentence a person reads at the top of every column of every table.
 *
 * ONLY THE SECOND ARGUMENT, because the first is a COLUMN NAME — data, not
 * words. That is the same line `translateRecipe` draws when it translates
 * `field.label` and leaves `field.column` alone, and drawing it differently here
 * would put a database column in the catalogue and, one codemod later, in
 * German. Narrow by construction, exactly as `scope` above is.
 *
 * JSX-CHILD IS THE SIXTH, AND IT IS THE SAME WORDS AS THE FIRST. `<p>Save</p>`
 * and `<p>{busy ? "Saving…" : "Save"}</p>` are one sentence on screen and two
 * different syntax nodes underneath — a JsxText and a JsxExpression — and only
 * the first was ever looked at. A person cannot see which one a developer typed;
 * the reader who chose German only saw that one of the two was still in English.
 * Every OTHER kind of child expression (`{count}`, `{items.map(…)}`, `{cond &&
 * <Row/>}`) yields no plain string and is skipped by `literalTexts` without a
 * special case, which is why this position costs one branch rather than a
 * heuristic. */
export function visitStrings(tree, hit) {
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      report([node.text], node, "jsx-text")
    } else if (
      ts.isJsxExpression(node) &&
      node.parent &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      report(literalTexts(node), node, "jsx-child")
    } else if (ts.isJsxAttribute(node) && VISIBLE_PROPS.has(node.name.getText(tree))) {
      report(literalTexts(node.initializer), node, "attribute")
    } else if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      VISIBLE_PROPERTIES.has(node.name.text)
    ) {
      report(literalTexts(node.initializer), node, "property")
    } else if (ts.isCallExpression(node)) {
      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === "field" &&
        node.arguments.length >= 2
      ) {
        report(literalTexts(node.arguments[1]), node, "field-label")
      } else if (
        ts.isPropertyAccessExpression(node.expression) &&
        TOAST_METHODS.has(node.expression.name.text) &&
        /(^|\.)toast$/.test(node.expression.expression.getText(tree)) &&
        node.arguments.length > 0
      ) {
        report(literalTexts(node.arguments[0]), node, "toast")
      } else if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === "t" &&
        node.arguments.length > 0
      ) {
        report(literalTexts(node.arguments[0]), node, "t-call")
      }
    }
    ts.forEachChild(node, visit)
  }

  function report(raws, node, kind) {
    for (const raw of raws) {
      const text = collapse(raw)
      if (isUserVisible(text)) hit({ text, node, kind })
    }
  }

  visit(tree)
}
