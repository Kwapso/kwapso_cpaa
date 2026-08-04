// THE CRASH-CLASS GUARD (React #310/#300): a hook called BELOW a top-level early
// return renders fine until the day the early return fires first — then the hook
// count changes between renders and the whole tree white-screens. The fix for one
// file is hoisting; THIS check makes the class unshippable at any size: it walks
// every component/hook function in web source and fails any use*() call that
// appears after a depth-1 `return` in the same function. Worth more than any
// single fix — the containment half is the ErrorBoundary in the root layout.

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = join(HERE, "..")

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(tsx|ts)$/.test(e.name) && !e.name.endsWith(".test.ts")) out.push(p)
    }
  }
  for (const d of ["components", "lib", "app"]) walk(join(WEB, d))
  return out
}

/** Strip strings/template literals/comments so braces inside them don't skew the
 * depth walk (heuristic, good enough for house-style code). */
function stripNoise(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length))
    .replace(/`(?:\\.|[^`\\])*`/g, (m) => `"${" ".repeat(Math.max(0, m.length - 2))}"`)
    .replace(/"(?:\\.|[^"\\])*"/g, (m) => `"${" ".repeat(Math.max(0, m.length - 2))}"`)
    .replace(/'(?:\\.|[^'\\])*'/g, (m) => `'${" ".repeat(Math.max(0, m.length - 2))}'`)
}

/** Offenders: [file, functionName, hookName] for every depth-1 hook call that
 * appears AFTER a depth-1 `return` in the same component/hook function. */
function findOffenders(): string[] {
  const offenders: string[] = []
  for (const file of sourceFiles()) {
    const src = stripNoise(readFileSync(file, "utf8"))
    // Component/hook function starts: `function Name(` (Name = Component or useX).
    const fnRe = /function ((?:[A-Z]|use[A-Z])\w*)\s*\(/g
    let fm: RegExpExecArray | null
    while ((fm = fnRe.exec(src))) {
      const bodyStart = src.indexOf("{", fnRe.lastIndex)
      if (bodyStart === -1) continue
      // Walk the body tracking brace depth; note depth-1 returns + hook calls.
      // A hook ON the return statement itself (`return useX(...)`) is legal — a
      // return only counts as "early" once its own statement has ENDED (parens
      // balanced back + a newline; this codebase omits semicolons).
      let depth = 0
      let sawReturn = false
      let inReturn = false
      let returnParen = 0
      let i = bodyStart
      for (; i < src.length; i++) {
        const c = src[i]
        if (c === "{") depth++
        else if (c === "}") {
          depth--
          if (depth === 0) break // function body ended
        }
        if (inReturn) {
          if (c === "(" || c === "[") returnParen++
          else if (c === ")" || c === "]") returnParen--
          else if (c === "\n" && returnParen <= 0 && depth === 1) {
            inReturn = false
            sawReturn = true // the early return statement has fully ended
          }
          continue
        }
        if (depth === 1) {
          if (src.startsWith("return", i) && !/[\w$.]/.test(src[i - 1] ?? " ")) {
            inReturn = true
            returnParen = 0
            i += 5
            continue
          }
          const hook = /^use[A-Z]\w*(?=[(<])/.exec(src.slice(i, i + 60))
          if (hook && !/[\w$.]/.test(src[i - 1] ?? " ")) {
            if (sawReturn) offenders.push(`${file.slice(WEB.length)} → ${fm[1]} calls ${hook[0]} after an early return`)
            i += hook[0].length - 1
          }
        }
      }
    }
  }
  return offenders
}

describe("hooks never follow a top-level early return (the React #310 crash class)", () => {
  it("every component/hook calls all its hooks before any depth-1 return", () => {
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
    for (const file of sourceFiles()) {
      fns += [...readFileSync(file, "utf8").matchAll(/function (?:[A-Z]|use[A-Z])\w*\s*\(/g)].length
    }
    expect(fns).toBeGreaterThan(40)
  })
})
