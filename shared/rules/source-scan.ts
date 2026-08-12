// THE ONE WAY A LAW READS SOURCE OFF DISK.
//
// A TEST module, like seam-scan.ts beside it. Nothing in any worker's src/ or
// either front end's app/ imports it, and wrangler bundles from src/, so it never
// ships. It lives in shared/rules/ because that is where the law machinery lives:
// registry.ts is the laws as DATA, seam-scan.ts is R1 + R10 as CODE, and this is
// the file-reading every one of them stands on.
//
// WHY IT EXISTS. Thirteen test files each hand-rolled a recursive readdirSync
// walker, and they did not agree. Some took `.ts`, some `.tsx`, some both minus
// `.test.ts`; some recursed and some read one directory flat. That is not a
// tidiness problem. web/test/rules.test.ts enforces R3/R4/R7/R16 over a RECURSIVE
// walk of web/components — which has three subdirectories — while
// web-portal/test/rules.test.ts enforced the same four laws over a FLAT read of
// web-portal/components. Both said "every component". They meant different sets.
// The portal's folder happens to be flat today, so the law is green and correct;
// the first portal component to move into a subdirectory would leave it green and
// wrong. A law that silently stops applying is worse than one that fails, because
// nothing goes red.
//
// So: one walker, and every option it has is EXPLICIT at the call site. The
// default is to recurse, because "every file under here" is what a law almost
// always means; a caller that genuinely wants one directory has to say
// `recursive: false` and can be asked why.
//
// Build directories are skipped unconditionally — a walk that wanders into
// node_modules is not a check, it is a hang.

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

/** Never walked: generated output and installed packages are not this repo's source. */
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "out", "dist", "coverage"])

/** One source file, in the three shapes the callers ask for: the absolute path
 * (to read again), the path relative to the scan's base (what a failure message
 * should name), and the text. */
export type SourceFile = {
  /** Absolute path on disk. */
  path: string
  /** Path relative to `relativeTo` (defaults to the root it was found under). */
  rel: string
  /** The file's contents. */
  source: string
}

export type WalkOptions = {
  /** Which file extensions count. No default — a law states its own subject. */
  extensions: string[]
  /** Walk subdirectories. Defaults to TRUE; say `false` only when one directory
   * is genuinely the whole subject (repo-root docs, say) and mean it. */
  recursive?: boolean
  /** Leave test files out — the scan's subject is usually the code, not its
   * checks. Defaults to false, so a caller that needs it says so. */
  skipTests?: boolean
  /** Base for `rel`. Defaults to the root each file was found under. */
  relativeTo?: string
}

/** Every source file under `roots`, read. Sorted, so a failure message lists the
 * same offenders in the same order on every machine. */
export function sourceFiles(roots: string | string[], options: WalkOptions): SourceFile[] {
  const dirs = typeof roots === "string" ? [roots] : roots
  const recursive = options.recursive ?? true
  const out: SourceFile[] = []

  for (const root of dirs) {
    const base = options.relativeTo ?? root
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) {
          if (recursive && !SKIP_DIRS.has(entry.name)) walk(path)
          continue
        }
        if (!options.extensions.some((ext) => entry.name.endsWith(ext))) continue
        if (options.skipTests && /\.test\.tsx?$/.test(entry.name)) continue
        out.push({ path, rel: relative(base, path), source: readFileSync(path, "utf8") })
      }
    }
    walk(root)
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

/** node:path's own `relative` is not in the workers' Node shim (they compile with
 * @cloudflare/workers-types and no @types/node), and the only case here is a path
 * that already starts with its base — so this is a prefix strip, not a path
 * algebra. It falls back to the absolute path rather than lying about a
 * relationship it can't compute. */
function relative(base: string, path: string): string {
  if (!path.startsWith(base)) return path
  const rest = path.slice(base.length)
  return rest.startsWith("/") ? rest.slice(1) : rest
}

/** Comments are NOT code, and this repo's comments DISCUSS the very seams being
 * scanned — "no requireRight (it's about you)", "no LIMIT needed here". Without
 * this, a handler whose real gate was deleted stays GREEN, satisfied by the prose
 * below it, and a comment describing the ABSENCE of a bound satisfies the bound.
 *
 * LINE COMMENTS GO FIRST, and the order is load-bearing. Block-first looked
 * right for years and had a hole a sentence wide: a `//` comment mentioning a
 * path like `/api/content/<star>` contains the two characters `/` and `*` side
 * by side, so the block regex opened a comment THERE and ran to the next `*​/`
 * anywhere below — swallowing the rest of the function. Every seam scan then
 * read that function as containing no publish call, no gate and no LIMIT.
 *
 * It cost exactly that: a comment added to `postHelpStatus` explaining WHY the
 * door refuses a client login turned the R1 publish check red, on a handler
 * whose `publishChange` had not moved. A scanner a comment can blind is a
 * scanner that reports "all clear" for the wrong reason — and the direction of
 * this one was lucky. The same shape in reverse (a function whose gate is eaten)
 * reads as an offender; a function whose OFFENCE is eaten reads as clean.
 *
 * Line comments only when the `//` isn't part of a `https://` URL. Still
 * deliberately LOSSY and deliberately NOT string-aware: R14 reads `LIMIT` out of
 * SQL held in template literals, so a stripper that blanked string contents
 * would blind it. When a caller needs JSONC instead, that is stripJsoncComments
 * below — a different job, named apart.
 *
 * EIGHT COPIES OF THIS FUNCTION EXISTED: three named ones with three different doc
 * comments (one guarding the mcp worker — the external machine surface) and five
 * inline repetitions of the same two regexes. Harden the pattern in one and the
 * other seven are checks that only look like it. */
export function stripComments(src: string): string {
  return src.replace(/(^|[^:])\/\/[^\n]*/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, " ")
}

/** JSONC → JSON, for a caller that is about to JSON.parse the result (the
 * wrangler configs). A DIFFERENT JOB from stripComments, which is why it is a
 * different function with a different name, and why nobody should fold the two
 * together:
 *
 *  • It must not eat a `//` inside a string — `"https://…"` in a var would
 *    otherwise truncate the file and leave the caller parsing a fragment, which
 *    is how a worker reads as closed while being open.
 *  • It must be exact, not heuristic. A lossy answer here is not a weaker check,
 *    it is a parse error or a silently wrong config.
 *  • And it is wrong for TypeScript: it tracks only `"`, so one unbalanced double
 *    quote inside a template literal puts it in string mode for the rest of the
 *    file and it stops removing comments at all — exactly the failure the seam
 *    scans strip comments to prevent.
 *
 * Character by character, tracking quote and escape state, which is the only way
 * to be sure. web/test/source-scan.test.ts holds the fixtures proving each is
 * wrong at the other's job. */
export function stripJsoncComments(src: string): string {
  let out = ""
  let inString = false
  let escaped = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inString) {
      out += c
      if (escaped) escaped = false
      else if (c === "\\") escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
      out += c
      continue
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++
      out += "\n"
      continue
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++
      i++
      continue
    }
    out += c
  }
  return out
}
