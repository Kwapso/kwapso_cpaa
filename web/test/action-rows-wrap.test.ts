// @vitest-environment node
//
// A pure source scan: it reads files and parses them, and never touches a DOM.
// The workspace's default environment is jsdom, and standing one up costs a few
// seconds of a worker thread that this file has no use for — which is time taken
// off the render tests running beside it.
// ACTION ROWS NEVER CLIP (UI-CONVENTIONS C4) — the half of that rule nothing read.
//
// C4 has been the house rule for every detail header, form footer and toolbar
// since the owner reported a button cut off the edge of his phone: **`flex
// flex-wrap` on the ROW, `ml-auto` on the action GROUP**, and never `justify-end`
// on the parent alone, which pushes the overflow off the LEFT edge where the
// container hides it rather than showing it.
//
// It was written down and enforced by nobody, so the calendar's month controls
// shipped in a row that could not reflow: a segmented control and three buttons,
// about 307px of content against roughly 309px inside the page's padding and the
// collection card's at a 375px viewport. "Next month" was a pixel or two from the
// edge in English and off it in German, where "Agenda" is "Tagesordnung" — and
// there is no scrollable ancestor there, so off the edge is gone.
//
// WHAT THIS CHECKS, and why it is this and not "every flex row wraps". A group
// pushed with `ml-auto` is C4's own signature: it is somebody saying "these
// controls belong together, over on the right". That group is exactly the thing
// that ends up off the edge, and it has two honest shapes — it wraps ITSELF, or
// it sits in a row that wraps around it (which is the right answer when the
// group's own members must stay side by side, like Previous and Next). Anything
// else is a group that cannot reflow.
//
// ANCESTRY IS READ FROM THE SYNTAX TREE, not from indentation or a window of
// characters: "the row this group is in" is a question about the JSX, and the
// compiler is already a dependency here (catalogued-strings.test.ts reads the
// app the same way).

import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import ts from "typescript"
import { sourceFiles } from "@shared/rules/source-scan"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..", "..")

/** The two front doors' components — C4 is a rule about screens, and both apps
 * have them. */
const COMPONENT_DIRS = [join(ROOT, "web", "components"), join(ROOT, "web-portal", "components")]

/** The `className="…"` of one JSX element, when it is a plain string. A className
 * built from an expression is not something this check can read, and it says so
 * by simply not seeing it — under-reaching, rather than guessing. */
function classNameOf(node: ts.Node): string | null {
  const attrs = ts.isJsxElement(node)
    ? node.openingElement.attributes
    : ts.isJsxSelfClosingElement(node)
      ? node.attributes
      : null
  if (!attrs) return null
  for (const a of attrs.properties) {
    if (!ts.isJsxAttribute(a) || a.name.getText() !== "className") continue
    const init = a.initializer
    if (init && ts.isStringLiteral(init)) return init.text
    if (init && ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression))
      return init.expression.text
  }
  return null
}

const isRow = (cls: string) => /\bflex\b/.test(cls) && !/\bflex-col\b/.test(cls)
const wraps = (cls: string) => /\bflex-wrap\b/.test(cls)
/** `ml-auto` or a responsive `sm:ml-auto` — both are the same intent. */
const pushed = (cls: string) => /(^|[\s:])ml-auto\b/.test(cls) || /\bsm:ml-auto\b/.test(cls)

type Group = { file: string; line: number; cls: string; parent: string | null }

function actionGroups(): Group[] {
  const out: Group[] = []
  for (const dir of COMPONENT_DIRS) {
    for (const f of sourceFiles(dir, { extensions: [".tsx"] })) {
      // CHEAP FIRST. Parsing every component in both front doors costs about
      // fifteen seconds, and this check is only ever interested in a file that
      // contains the two characters `ml-auto` — seven of roughly two hundred and
      // fifty. The string test cannot produce a false NEGATIVE, because the
      // thing being looked for is that literal text in a className.
      if (!f.source.includes("ml-auto")) continue
      const tree = ts.createSourceFile(
        f.path,
        f.source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      )
      const visit = (node: ts.Node) => {
        const cls = classNameOf(node)
        if (cls && pushed(cls) && isRow(cls)) {
          // The nearest ENCLOSING JSX element that is itself a row.
          let parent: string | null = null
          for (let p = node.parent; p && !parent; p = p.parent) {
            const pc = ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p) ? classNameOf(p) : null
            if (pc && isRow(pc)) parent = pc
          }
          out.push({
            file: f.path.replace(`${ROOT}/`, ""),
            line: tree.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            cls,
            parent,
          })
        }
        ts.forEachChild(node, visit)
      }
      visit(tree)
    }
  }
  return out
}

describe("C4 — an action row reflows on a phone instead of clipping", () => {
  it("finds the action groups (a blind scan reports all clear exactly like a passing one)", () => {
    expect(
      actionGroups().length,
      "no `ml-auto` action group was found in either front door — the scan has gone blind"
    ).toBeGreaterThanOrEqual(5)
  })

  it("every pushed action group can reflow — itself, or in the row around it", () => {
    const stuck = actionGroups()
      .filter((g) => !wraps(g.cls) && !(g.parent && wraps(g.parent)))
      .map((g) => `${g.file}:${g.line} — "${g.cls}" inside "${g.parent ?? "(no flex row)"}"`)
    expect(
      stuck,
      "UI-CONVENTIONS C4: a group pushed right with `ml-auto` must be able to wrap — put `flex-wrap` on the " +
        "group, or on the row it sits in when its own members must stay side by side. Without it the last " +
        "control goes off the edge of a phone, and there is nothing to scroll to reach it"
    ).toEqual([])
  })
})
