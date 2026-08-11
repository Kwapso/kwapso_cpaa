// THE CRASH-CLASS GUARD (React #310/#300): a hook called BELOW a top-level early
// return renders fine until the day the early return fires first — then the hook
// count changes between renders and the whole tree white-screens. The fix for one
// file is hoisting; THIS check makes the class unshippable at any size: it walks
// every component/hook function in web source and fails any use*() call that
// appears after an early return in the same function. Worth more than any single
// fix — the containment half is the ErrorBoundary in the root layout.
//
// A SCANNER WITH A BLIND SPOT IS A CHECK THAT IS SILENTLY OFF, so the scanner is
// itself locked by fixtures below. Three real blind spots have been found this way
// (each waved a whole file through): a `React.`-namespaced hook; a destructured
// param's `{` mistaken for the body; and — the subtle one — a guard written the
// ordinary way, `if (!ready) {\n return null\n}`, whose return sits at brace depth
// 2 and so never registered as a return at all. Hence the rule the walk now uses:
// a return counts unless it is inside a NESTED FUNCTION (a callback's own return
// is its own; an `if`/`try`/`switch` block's return is the component's).

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { sourceFiles } from "@shared/rules/source-scan"

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = join(HERE, "..")

/** Every component, hook and page in the agency app. */
function scannedFiles(): string[] {
  return sourceFiles(
    ["components", "lib", "app"].map((d) => join(WEB, d)),
    { extensions: [".ts", ".tsx"], skipTests: true }
  ).map((f) => f.path)
}

/** Strip strings/template literals/comments so braces inside them don't skew the
 * depth walk (heuristic, good enough for house-style code).
 *
 * NOT the shared stripComments: this one is LENGTH-PRESERVING — it blanks each
 * comment and string with the same number of characters, because every index the
 * brace walk below computes has to keep pointing at the same place in the
 * original text. The shared one deletes, which would shift every offset. Two
 * different jobs, so two functions, and this is the reason. */
function stripNoise(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length))
    .replace(/`(?:\\.|[^`\\])*`/g, (m) => `"${" ".repeat(Math.max(0, m.length - 2))}"`)
    .replace(/"(?:\\.|[^"\\])*"/g, (m) => `"${" ".repeat(Math.max(0, m.length - 2))}"`)
    .replace(/'(?:\\.|[^'\\])*'/g, (m) => `'${" ".repeat(Math.max(0, m.length - 2))}'`)
}

/** `{` openers that are a BLOCK, not a function body — their returns belong to
 * the enclosing component, which is exactly what makes them early returns. */
const BLOCK_KEYWORDS = new Set(["if", "for", "while", "switch", "catch"])

/** Does the `{` at this index open a nested function body (arrow, function
 * expression, object method) rather than a plain block / object literal? */
function opensNestedFunction(src: string, brace: number): boolean {
  let j = brace - 1
  while (j >= 0 && /\s/.test(src[j])) j--
  if (j >= 1 && src[j] === ">" && src[j - 1] === "=") return true // `=> {`
  if (src[j] !== ")") return false // `try {`, `else {`, `do {`, an object literal…
  let paren = 1
  let k = j - 1
  while (k >= 0 && paren > 0) {
    if (src[k] === ")") paren++
    else if (src[k] === "(") paren--
    k--
  }
  while (k >= 0 && /\s/.test(src[k])) k--
  const end = k
  while (k >= 0 && /[\w$]/.test(src[k])) k--
  return !BLOCK_KEYWORDS.has(src.slice(k + 1, end + 1))
}

/** Component/hook function starts in a source: [name, index just past the `(`].
 * Both house shapes count — a shape the scan can't see is a file with the check
 * silently OFF. */
function functionStarts(src: string): Array<[string, number]> {
  const out: Array<[string, number]> = []
  const re =
    /(?:function\s+((?:[A-Z]|use[A-Z])\w*)\s*\(|(?:const|let|var)\s+((?:[A-Z]|use[A-Z])\w*)\s*(?::[^=;\n]*)?=\s*(?:async\s+)?\()/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) out.push([m[1] ?? m[2], re.lastIndex])
  return out
}

/** Offenders in ONE source: every hook call that appears after an early return
 * in the same component/hook function. `label` is what the failure names. */
export function findOffendersIn(src: string, label: string): string[] {
  const offenders: string[] = []
  src = stripNoise(src)
  for (const [name, afterParen] of functionStarts(src)) {
    // The body brace is the first `{` AFTER the parameter list closes — a
    // destructured param (`({ off }: …)`) has braces of its own, and taking the
    // first `{` blindly would "scan" the param object and skip the body.
    let paren = 1
    let p = afterParen
    while (p < src.length && paren > 0) {
      if (src[p] === "(") paren++
      else if (src[p] === ")") paren--
      p++
    }
    const bodyStart = src.indexOf("{", p)
    if (bodyStart === -1) continue
    // A concise arrow body (`= (x) => (`) has no braces of its own; walking on
    // would wander into unrelated JSX. It also can't hold a hook after a return.
    const gap = src.slice(p, bodyStart)
    if (gap.includes("=>") && !/=>\s*$/.test(gap)) continue
    // Walk the body tracking brace depth AND how many of those braces opened a
    // nested function. A hook ON the return statement itself (`return useX(…)`)
    // is legal — a return only counts once its own statement has ENDED (parens
    // balanced back + a newline; this codebase omits semicolons).
    let depth = 0
    let fnDepth = 0
    const braceIsFn: boolean[] = []
    let sawReturn = false
    let inReturn = false
    let returnParen = 0
    for (let i = bodyStart; i < src.length; i++) {
      const c = src[i]
      if (c === "{") {
        const nested = depth > 0 && opensNestedFunction(src, i)
        braceIsFn.push(nested)
        if (nested) fnDepth++
        depth++
      } else if (c === "}") {
        depth--
        if (braceIsFn.pop()) fnDepth--
        if (depth === 0) break // function body ended
      }
      if (inReturn) {
        if (c === "(" || c === "[") returnParen++
        else if (c === ")" || c === "]") returnParen--
        else if (c === "\n" && returnParen <= 0) {
          inReturn = false
          sawReturn = true // the early return statement has fully ended
        }
        continue
      }
      // A return ANYWHERE that isn't inside a nested function is the component's
      // own — including inside an `if`/`try`/`switch` block, the ordinary way a
      // guard clause is written.
      if (fnDepth === 0 && depth >= 1 && src.startsWith("return", i) && !/[\w$.]/.test(src[i - 1] ?? " ")) {
        inReturn = true
        returnParen = 0
        i += 5
        continue
      }
      if (depth === 1) {
        // Bare hooks AND namespaced ones (React.useState) both count.
        const hook = /^(?:React\.)?use[A-Z]\w*(?=[(<])/.exec(src.slice(i, i + 60))
        if (hook && !/[\w$.]/.test(src[i - 1] ?? " ")) {
          if (sawReturn) offenders.push(`${label} → ${name} calls ${hook[0]} after an early return`)
          i += hook[0].length - 1
        }
      }
    }
  }
  return offenders
}

function findOffenders(): string[] {
  return scannedFiles().flatMap((f) => findOffendersIn(readFileSync(f, "utf8"), f.slice(WEB.length)))
}

describe("hooks never follow a top-level early return (the React #310 crash class)", () => {
  it("every component/hook calls all its hooks before any early return", () => {
    const offenders = findOffenders()
    expect(
      offenders,
      `hoist these hooks above the early returns (a conditional hook count white-screens the tree): ${offenders.join("; ")}`
    ).toEqual([])
  })

  // The scanner itself must be able to see (a scan that finds no functions has
  // silently gone blind — this is the sanity tripwire).
  it("the scan actually parses the codebase (sees many components)", () => {
    let fns = 0
    for (const file of scannedFiles()) fns += functionStarts(readFileSync(file, "utf8")).length
    expect(fns).toBeGreaterThan(40)
  })

  // THE SCANNER'S OWN LOCK. Each shape below was, or could be, a blind spot that
  // switched the check off for a whole file. A regression here is worse than a
  // bad component: it is a check that cannot fail.
  it("catches every shape an early return is written in", () => {
    const shapes: Array<[string, string]> = [
      ["one-line guard", "function A() {\n  if (!x) return null\n  const [v] = useState(0)\n  return v\n}"],
      // The one that hid: the return sits at brace depth 2.
      ["braced guard", "function B() {\n  if (!ready) {\n    return null\n  }\n  const [v] = useState(0)\n  return v\n}"],
      ["React-namespaced hook", "function C() {\n  if (!x) return null\n  const v = React.useMemo(() => 1, [])\n  return v\n}"],
      ["destructured params", "function D({ off }: P) {\n  if (off) return null\n  const [v] = useState(0)\n  return v\n}"],
      ["arrow component", "const E = ({ off }: P) => {\n  if (off) return null\n  const [v] = useState(0)\n  return v\n}"],
      ["return inside try", "function F() {\n  try {\n    return read()\n  } catch {}\n  const [v] = useState(0)\n  return v\n}"],
      ["custom hook", "function useG() {\n  if (!x) {\n    return null\n  }\n  const v = useRef(0)\n  return v\n}"],
    ]
    for (const [what, src] of shapes) expect(findOffendersIn(src, what), `blind to: ${what}`).toHaveLength(1)
  })

  it("does not cry wolf on legal code", () => {
    const legal: Array<[string, string]> = [
      // A callback's own return is the callback's, not the component's.
      ["return in a callback", "function A() {\n  const r = xs.map((x) => {\n    if (!x) return null\n    return x\n  })\n  const [v] = useState(0)\n  return [r, v]\n}"],
      ["return in an effect", "function B() {\n  useEffect(() => {\n    if (!x) return\n    go()\n  }, [])\n  const [v] = useState(0)\n  return v\n}"],
      // A hook ON the return statement runs before the function ends.
      ["hook on the return", "function C() {\n  return useMemo(() => 1, [])\n}"],
      ["hooks then return", "function D() {\n  const [v] = useState(0)\n  if (!v) return null\n  return v\n}"],
    ]
    for (const [what, src] of legal) expect(findOffendersIn(src, what), `false positive: ${what}`).toEqual([])
  })
})
