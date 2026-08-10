// THE FENCE GUARD — at last, a check for PORTAL_VISIBLE_READS.
//
// That list sat in shared/rules/registry.ts as data with NO test reading it, for
// its whole first life. Its own doc-comment promised "a file that reads one of
// these tables and is in neither state turns the build red", and nothing turned
// red, ever. This suite is that promise, kept — and it is deliberately built to
// catch the class of miss that produced it.
//
// TWO DESIGN CHOICES DO THE WORK:
//
// 1. THE TARGET SET IS DERIVED FROM THE PORTAL'S OWN DOOR TABLE. The registry's
//    comment says the lesson was "enumerate by WHAT A CLIENT CAN REACH, never by
//    what the account module happens to own" — but until this door existed there
//    was no machine-readable answer to "what can a client reach". Now there is:
//    workers/portal-gateway/src/index.ts. Every READ door named there is walked
//    through to the worker's ROUTES table, to the handler, to the lib functions
//    the handler calls. Open a door tomorrow and its fence is demanded today.
//
// 2. IT CHECKS FUNCTIONS, NOT FILES. The registry keys are files, and a
//    file-level check is exactly what let `help.ts` sit here declaring
//    `authorScope` while two of its exported readers — the ticket THREAD —
//    carried no fence at all. The leak was one function along from the entry
//    that claimed to cover it. So each reachable function must itself touch the
//    caller's stamp: its own declared fence, or the AccountScope it was handed.
//
// It cannot prove a fence is CORRECT — that is what the burglar suite in
// workers/tenancy/test/account-leak.test.ts is for. It proves no portal-reachable
// read is built without one, which is the failure that actually happened twice.

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { PORTAL_VISIBLE_READS } from "@shared/rules/registry"

const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(p, "utf8")

/** The portal's door table, read off the gateway's SOURCE rather than imported —
 * the worker is compiled against @cloudflare/workers-types, which has no place
 * in a browser-side test's type world, and reading source is what every other
 * rule guard in this codebase does. */
function portalDoors(): Record<string, string> {
  const src = read(join(ROOT, "workers", "portal-gateway", "src", "index.ts"))
  const table = /export const PORTAL_DOORS[^=]*=\s*\{([\s\S]*?)\n\}/.exec(src)
  expect(table, "PORTAL_DOORS not found in the portal gateway — did the table move?").toBeTruthy()
  const doors: Record<string, string> = {}
  for (const m of (table as RegExpExecArray)[1].matchAll(/"([A-Z]+ \/[^"]+)":\s*"(\w+)"/g))
    doors[m[1]] = m[2]
  return doors
}

const PORTAL_DOORS = portalDoors()

/** Which worker a door path belongs to: /api/<worker>/… — with the two names
 * that differ between the URL and the folder spelled out. */
const WORKER_DIR: Record<string, string> = {
  auth: "auth",
  tenancy: "tenancy",
  content: "content",
  realtime: "realtime",
}

function workerOf(path: string): string | null {
  const seg = path.split("/")[2]
  return WORKER_DIR[seg] ?? null
}

/** Every `export async function NAME` body in a directory, keyed by name — the
 * same source-indexing the burglar suite uses, so the two can't disagree about
 * what a handler's body is. */
function indexFunctions(dir: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const code = read(join(dir, file))
    const starts = [...code.matchAll(/export\s+async\s+function\s+(\w+)/g)]
    starts.forEach((m, i) => out.set(m[1], code.slice(m.index, starts[i + 1]?.index ?? code.length)))
  }
  return out
}

/** file → (function name → body) for one worker's lib/. EXPORTED functions are
 * what a handler can call; the private ones are indexed too, because a fence is
 * routinely expressed as a small helper beside the readers that use it (the
 * thread fence is exactly that shape) and a check that couldn't see through one
 * helper would push people to inline SQL to satisfy it. */
function indexLib(worker: string): Map<string, { exported: Map<string, string>; all: Map<string, string> }> {
  const dir = join(ROOT, "workers", worker, "src", "lib")
  const out = new Map<string, { exported: Map<string, string>; all: Map<string, string> }>()
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const code = read(join(dir, file))
    const exported = new Map<string, string>()
    const all = new Map<string, string>()
    const starts = [...code.matchAll(/(export\s+)?(?:async\s+)?function\s+(\w+)/g)]
    starts.forEach((m, i) => {
      const body = code.slice(m.index, starts[i + 1]?.index ?? code.length)
      all.set(m[2], body)
      if (m[1]) exported.set(m[2], body)
    })
    out.set(`workers/${worker}/src/lib/${file}`, { exported, all })
  }
  return out
}

/** Does this function reach the file's declared fence — itself, or through a
 * helper in the same file? Depth-limited, cycle-safe, and deliberately shallow:
 * a fence three hops from the statement it protects is a fence nobody reviewing
 * the read can see. */
function carriesFence(fn: string, fns: Map<string, string>, fence: string, seen = new Set<string>()): boolean {
  if (seen.has(fn) || seen.size > 4) return false
  seen.add(fn)
  const body = fns.get(fn)
  if (!body) return false
  // The stamp reaches a function two ways: the declared fence helper, or the
  // AccountScope it was handed.
  if (body.includes(fence) || /\bscope\b/.test(body)) return true
  for (const other of fns.keys())
    if (other !== fn && new RegExp(`(?<![\\w.])${other}\\s*\\(`).test(body))
      if (carriesFence(other, fns, fence, seen)) return true
  return false
}

/** The handler a route table maps a door to. Read off the worker's own ROUTES
 * source rather than imported, so this test needs no worker runtime. */
function handlerFor(worker: string, door: string): string | null {
  const src = read(join(ROOT, "workers", worker, "src", "index.ts"))
  const m = new RegExp(`"${door}"\\s*:\\s*\\{\\s*handler:\\s*(\\w+)`).exec(src)
  return m ? m[1] : null
}

/** The READ doors the portal gateway names, walked to their handler bodies. */
function portalReadHandlers(): { door: string; worker: string; body: string }[] {
  const out: { door: string; worker: string; body: string }[] = []
  for (const door of Object.keys(PORTAL_DOORS)) {
    if (!door.startsWith("GET ")) continue
    const path = door.slice(4)
    const worker = workerOf(path)
    // The realtime handshake returns no rows, and auth returns only the caller's
    // own identity — neither reads an account-owned table.
    if (!worker || worker === "realtime" || worker === "auth") continue
    const name = handlerFor(worker, door)
    expect(name, `${door} is named by the portal door but has no handler in workers/${worker}`).toBeTruthy()
    const body = indexFunctions(join(ROOT, "workers", worker, "src", "routes")).get(name as string)
    expect(body, `handler ${name} for ${door} not found in workers/${worker}/src/routes`).toBeTruthy()
    out.push({ door, worker, body: body as string })
  }
  return out
}

describe("portal fence — every read a client can reach carries the fence", () => {
  const handlers = portalReadHandlers()

  // Guard the derivation itself: a walk that silently found nothing would pass
  // every assertion below and prove exactly nothing.
  it("derives real read doors from the portal gateway's own table", () => {
    expect(handlers.length).toBeGreaterThanOrEqual(3)
    expect(handlers.map((h) => h.door)).toContain("GET /api/content/help/thread")
    expect(handlers.map((h) => h.door)).toContain("GET /api/tenancy/accounts/detail")
  })

  it("every lib file a portal read touches is declared in PORTAL_VISIBLE_READS", () => {
    const undeclared: string[] = []
    for (const { door, worker, body } of handlers) {
      for (const [file, { exported }] of indexLib(worker)) {
        for (const fn of exported.keys()) {
          if (!new RegExp(`(?<![\\w.])${fn}\\s*\\(`).test(body)) continue
          if (!(file in PORTAL_VISIBLE_READS)) undeclared.push(`${door} → ${file} (${fn})`)
        }
      }
    }
    expect(
      [...new Set(undeclared)],
      `these files answer a CLIENT and are not in PORTAL_VISIBLE_READS — declare the fence they carry, or a reasoned exemption: ${undeclared.join(", ")}`
    ).toEqual([])
  })

  it("every FUNCTION behind a portal read touches the caller's stamp", () => {
    const naked: string[] = []
    for (const { door, worker, body } of handlers) {
      for (const [file, { exported, all }] of indexLib(worker)) {
        const declared = PORTAL_VISIBLE_READS[file]
        if (!declared || declared.fence === null) continue // a reasoned exemption is a reviewed line
        for (const fn of exported.keys()) {
          if (!new RegExp(`(?<![\\w.])${fn}\\s*\\(`).test(body)) continue
          // A function that reaches NEITHER the declared fence nor an AccountScope
          // is reading a caller-supplied id with nothing on the WHERE but that id
          // — the exact shape of both leaks found so far.
          if (!carriesFence(fn, all, declared.fence)) naked.push(`${file} → ${fn}()  [reached by ${door}]`)
        }
      }
    }
    expect(
      [...new Set(naked)],
      `these reads answer a CLIENT with no fence on the statement: ${naked.join(", ")}`
    ).toEqual([])
  })

  it("every declared entry still names a file that exists (no rotting lines)", () => {
    for (const file of Object.keys(PORTAL_VISIBLE_READS))
      expect(() => read(join(ROOT, file)), `${file} is declared but missing`).not.toThrow()
  })

  it("an exemption states its reason", () => {
    for (const [file, e] of Object.entries(PORTAL_VISIBLE_READS))
      if (e.fence === null) expect(e.why.length, `${file} needs a real reason`).toBeGreaterThan(20)
  })
})

describe("portal fence — the portal never builds its own idea of scope", () => {
  function portalSources(): { file: string; src: string }[] {
    const out: { file: string; src: string }[] = []
    for (const dir of ["lib", "components", "app"]) {
      const walk = (p: string) => {
        for (const entry of readdirSync(join(__dirname, "..", p), { withFileTypes: true } as never) as unknown as {
          name: string
          isDirectory: () => boolean
        }[]) {
          const rel = `${p}/${entry.name}`
          if (entry.isDirectory()) walk(rel)
          else if (/\.tsx?$/.test(entry.name)) out.push({ file: rel, src: read(join(__dirname, "..", rel)) })
        }
      }
      walk(dir)
    }
    return out
  }

  const sources = portalSources()

  it("sees the portal's own source (guards the walk)", () => {
    expect(sources.length).toBeGreaterThan(10)
    expect(sources.map((s) => s.file)).toContain("lib/api.ts")
  })

  // The account id a screen reads with must be the one the SERVER handed it
  // through portal/context. A screen that took one from the address bar would be
  // asking the fence to be the only thing standing between a curious client and
  // another company — true, but a fence should never be load-bearing alone.
  it("no screen composes an account id from the URL", () => {
    const offenders = sources.filter(
      (s) => /accountId/.test(s.src) && /useParams|useSearchParams|location\.search/.test(s.src)
    )
    expect(
      offenders.map((o) => o.file),
      "an account id must come from portal/context, never from the address bar"
    ).toEqual([])
  })

  // The portal's client can only ask what its door will answer. This is the
  // cheap half of the guarantee; the gateway's closed-door suite is the real one.
  it("every /api path the portal client calls is a door the gateway names", () => {
    const named = new Set(Object.keys(PORTAL_DOORS).map((d) => d.split(" ")[1]))
    const called = new Set<string>()
    for (const { src } of sources) {
      // Comments are stripped first: a note explaining WHY a door is deliberately
      // not called must not read as a call to it.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
      for (const m of code.matchAll(/["'`](\/api\/[a-z0-9\-/]*)/g)) called.add(m[1].replace(/\/$/, ""))
    }
    const unreachable = [...called].filter((p) => !named.has(p))
    expect(
      unreachable,
      `the portal calls doors its own gateway will 404: ${unreachable.join(", ")}`
    ).toEqual([])
    expect(called.size, "guards the scan — the portal does call the API").toBeGreaterThan(5)
  })
})
