// THE ONE DOOR CENSUS — every door a person can reach on the four workers that
// serve the app's own `/api` surface, each with what its own source says it
// READS: the query params it parses and the body fields it takes off the wire.
//
// Extracted from filter-parity.test.ts the day it got a second reader. R19/R22
// derive a tool's OBLIGATIONS from this census (a tool must expose and forward
// what its door parses); R27 derives a description's PERMISSIONS from it (a
// backticked identifier must name something the door really reads or returns).
// Two laws, one derivation — a second copy of the scan would be the thing this
// repo's own header warns about: one rule and one thing that looks like it,
// drifting apart under a green build.
//
// Nothing here is hand-listed: workers from the fixed four, doors from each
// worker's own switchboard, reads from each handler's own source (plus any
// helper in the same file it calls, one level deep — the R22 lesson: a law that
// stops looking when you tidy up is a law that rewards tidying up).

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { sourceFiles } from "@shared/rules/source-scan"

export const ROOT = join(__dirname, "..", "..", "..")

/** The workers whose doors these laws govern: every one that serves the app's own
 * `/api` surface to a signed-in caller. (realtime and the two gateways own no
 * doors of their own — they forward; mcp IS the surface being measured.) */
export const WORKERS = ["tenancy", "content", "data-ops", "auth"] as const
export type Worker = (typeof WORKERS)[number]

export type Door = { worker: Worker; method: "GET" | "POST"; path: string; handler: string }
export const key = (d: { method: string; path: string }) => `${d.method} ${d.path}`

/** The route-handler source for a worker: its routes/ directory if it has one,
 * else its index.ts (auth keeps its handlers in the switchboard file). */
function handlerSources(worker: Worker): string[] {
  const dir = join(ROOT, "workers", worker, "src", "routes")
  if (!existsSync(dir)) return [readFileSync(join(ROOT, "workers", worker, "src", "index.ts"), "utf8")]
  return sourceFiles(dir, { extensions: [".ts"] }).map((f) => f.source)
}

const indexSource = (worker: Worker) =>
  readFileSync(join(ROOT, "workers", worker, "src", "index.ts"), "utf8")

/** Every door on a worker, read off its OWN switchboard — the declarative ROUTES
 * table (tenancy / content / data-ops) or auth's switch. Excluded, and only
 * these three: `/admin/` (owner maintenance behind `x-admin-key`, a header no
 * tool can send — locked separately in catalog.test.ts), the health probe, and
 * `/internal/*` (service bindings only, never routed publicly). */
export function doorsOf(worker: Worker): Door[] {
  const src = indexSource(worker)
  const out: Door[] = []
  const add = (method: string, path: string, handler: string) => {
    if (path.includes("/admin/") || path.endsWith("/health")) return
    out.push({ worker, method: method as "GET" | "POST", path, handler })
  }
  for (const m of src.matchAll(/"(GET|POST) (\/api\/[^"]+)"\s*:\s*\{\s*handler:\s*(\w+)/g))
    add(m[1], m[2], m[3])
  for (const m of src.matchAll(/case "(GET|POST) (\/api\/[^"]+)":\s*\n\s*return await (\w+)\(/g))
    add(m[1], m[2], m[3])
  return out
}

/** One function's body: from its declaration to the next top-level `}` (or the
 * next export, whichever comes first) — never into the function that follows. */
export function fnBody(src: string, name: string): string {
  const at = src.search(new RegExp(`function ${name}\\(`))
  if (at === -1) return ""
  const ends = [src.indexOf("\n}\n", at), src.indexOf("\nexport ", at + 1)].filter((i) => i !== -1)
  return src.slice(at, ends.length ? Math.min(...ends) : undefined)
}

/** What a door READS — its own handler, PLUS any helper in the same file it
 * calls, one level deep.
 *
 * The one level is not a nicety, it is the law's blind spot closed. This scan
 * once read the handler alone, so the moment a door factored its parsing into a
 * `function accountQuery(url)` beside it — which is exactly what you do when two
 * doors must narrow by the same words — the door dropped out of the census
 * entirely and its tool's obligations silently became none. A law that stops
 * looking when you tidy up is a law that rewards tidying up.
 *
 * One level, and only helpers declared in the SAME source: a `createLearning`
 * imported from a lib declares its contract in a TYPE, which is not source a
 * scan can follow, and pretending otherwise would be worse than saying so. */
export function handlerBody(door: Door): string {
  for (const src of handlerSources(door.worker)) {
    const own = fnBody(src, door.handler)
    if (!own) continue
    const called = [...new Set([...own.matchAll(/\b([a-zA-Z_]\w*)\s*\(/g)].map((m) => m[1]))]
    return [own, ...called.filter((n) => n !== door.handler).map((n) => fnBody(src, n))].join("\n")
  }
  return ""
}

/** The params a door's handler parses, derived from ITS OWN source: its
 * `searchParams.get` calls are the truth. */
export function doorParams(door: Door): string[] {
  return [...handlerBody(door).matchAll(/searchParams\.get\("(\w+)"\)/g)].map((x) => x[1])
}

/** The BODY fields a door's handler reads, derived the same way: its `body.<field>`
 * reads are the truth. R20 is what makes this legible — a body may not be
 * destructured at the read, so every field a door takes off the wire appears
 * here, in one shape, whether it is validated with `requireText`, tested with
 * `typeof`, or checked with `Array.isArray`.
 *
 * SCOPE, stated honestly: this reads the HANDLER, exactly as the query half
 * does. A handler that hands the whole `body` object to a lib (createLearning,
 * createTicket) declares its contract in that lib's input TYPE, which is not
 * source a scan can follow — those tools were checked by hand and match. What
 * this catches is the case that actually bit: a field the DOOR names and the
 * TOOL doesn't. */
export function doorBodyFields(door: Door): string[] {
  return [...new Set([...handlerBody(door).matchAll(/\bbody\.(\w+)\b/g)].map((x) => x[1]))]
}

/** The whole source of the routes file that declares a door's handler (auth: the
 * switchboard file itself). R27 reads it for the door's module context — which
 * lib files this door's answers are shaped in. */
export function routesSource(door: Door): string {
  for (const src of handlerSources(door.worker))
    if (new RegExp(`function ${door.handler}\\(`).test(src)) return src
  return ""
}

/** The lib sources a door's routes file imports (`../lib/<name>`), read off
 * disk. This is where a door's ROWS get their shape — every lib here maps
 * snake_case columns into the camelCase fields the response actually carries
 * (`stepKey: r.step_key`), so a scan of these files is a scan of the module's
 * real row contract. One hop, and only the imports the routes file itself
 * declares — never hand-listed. */
export function moduleLibSources(door: Door): string[] {
  const src = routesSource(door)
  const out: string[] = []
  for (const m of src.matchAll(/from "\.\.\/lib\/([\w-]+)"/g)) {
    const p = join(ROOT, "workers", door.worker, "src", "lib", `${m[1]}.ts`)
    if (existsSync(p)) out.push(readFileSync(p, "utf8"))
  }
  return out
}

export const DOORS: Door[] = WORKERS.flatMap(doorsOf)
