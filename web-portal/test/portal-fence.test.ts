// THE FENCE GUARD — at last, a check for PORTAL_VISIBLE_READS.
//
// That list sat in shared/rules/registry.ts as data with NO test reading it, for
// its whole first life. Its own doc-comment promised "a file that reads one of
// these tables and is in neither state turns the build red", and nothing turned
// red, ever. This suite is that promise, kept — and it is deliberately built to
// catch the class of miss that produced it.
//
// THREE DESIGN CHOICES DO THE WORK:
//
// 1. THE TARGET SET IS DERIVED FROM THE PORTAL'S OWN DOOR TABLE. The registry's
//    comment says the lesson was "enumerate by WHAT A CLIENT CAN REACH, never by
//    what the account module happens to own" — but until this door existed there
//    was no machine-readable answer to "what can a client reach". Now there is:
//    workers/portal-gateway/src/index.ts. Every door named there is walked
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
// 3. A READ IS A READ WHATEVER VERB IT WEARS. This suite used to walk GET doors
//    only — `if (!door.startsWith("GET "))` — and that is precisely why it sat
//    green over the third leak: `POST /api/content/help` RAISES a ticket and
//    ANSWERS WITH THE LIST, so a client's first question came back carrying
//    every other client's tickets. It was never a GET, so it was never a target.
//    Now every portal door is walked, GET and POST, and the discriminator is
//    what the code DOES, not what the verb says: a reachable function that
//    SELECTs rows must be declared and must carry the fence; one that only
//    writes is a write (it stamps the caller's own row and has no list to leak).
//    Reachability follows route-LOCAL helpers too — the leak lived inside
//    `ticketPage`, a page builder the handler called, invisible to a walk that
//    stopped at exported names.
//
// It cannot prove a fence is CORRECT — that is what the burglar suite in
// workers/tenancy/test/account-leak.test.ts is for. It proves no portal-reachable
// read is built without one, which is the failure that has now happened three times.

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { PORTAL_VISIBLE_READS, PORTAL_VISIBLE_WRITES } from "@shared/rules/registry"

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

/** Every function body in a directory, keyed by name — exported or not. The
 * private ones matter: a handler's rows are routinely assembled by a route-LOCAL
 * page builder, and a walk that stopped at exported names could not see into the
 * one that leaked (`ticketPage`). */
function indexFunctions(dir: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const code = read(join(dir, file))
    const starts = [...code.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)]
    starts.forEach((m, i) => out.set(m[1], code.slice(m.index, starts[i + 1]?.index ?? code.length)))
  }
  return out
}

/** A handler's REACH: its own source plus every route-local helper it calls,
 * followed transitively. Flattened to one string so every check below reads the
 * whole of what the door actually runs, not just its top frame. */
function reachOf(name: string, fns: Map<string, string>, seen = new Set<string>()): string {
  if (seen.has(name) || seen.size > 6) return ""
  seen.add(name)
  const body = fns.get(name)
  if (!body) return ""
  let out = body
  for (const other of fns.keys())
    if (other !== name && new RegExp(`(?<![\\w.])${other}\\s*\\(`).test(body))
      out += reachOf(other, fns, seen)
  return out
}

/** Strip comments — a sentence ABOUT a SELECT is not a SELECT, and a note naming
 * the fence must never stand in for calling it. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/gm, "$1")

/** Does this function hand rows back — itself, or through a helper in the same
 * file? That is what makes a fence load-bearing. A function that only INSERTs or
 * UPDATEs stamps the caller's own row and has no collection to disclose. */
function readsRows(fn: string, fns: Map<string, string>, seen = new Set<string>()): boolean {
  if (seen.has(fn) || seen.size > 4) return false
  seen.add(fn)
  const body = fns.get(fn)
  if (!body) return false
  if (/\bSELECT\b/.test(code(body))) return true
  for (const other of fns.keys())
    if (other !== fn && new RegExp(`(?<![\\w.])${other}\\s*\\(`).test(body))
      if (readsRows(other, fns, seen)) return true
  return false
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

/** EVERY door the portal gateway names — GET and POST alike — walked to the full
 * source its handler runs. A POST that answers with a page is a read. */
function portalReadHandlers(): { door: string; worker: string; body: string }[] {
  const out: { door: string; worker: string; body: string }[] = []
  for (const door of Object.keys(PORTAL_DOORS)) {
    const path = door.slice(door.indexOf(" ") + 1)
    const worker = workerOf(path)
    // The realtime handshake returns no rows, and auth returns only the caller's
    // own identity — neither reads an account-owned table.
    if (!worker || worker === "realtime" || worker === "auth") continue
    const name = handlerFor(worker, door)
    expect(name, `${door} is named by the portal door but has no handler in workers/${worker}`).toBeTruthy()
    const routeFns = indexFunctions(join(ROOT, "workers", worker, "src", "routes"))
    expect(routeFns.has(name as string), `handler ${name} for ${door} not found in workers/${worker}/src/routes`).toBe(true)
    out.push({ door, worker, body: reachOf(name as string, routeFns) })
  }
  return out
}


/** The non-GET doors the portal opens, walked to the full source their handler
 * runs — the same transitive reach the read walk uses, so a fence resolved in a
 * route-local helper still counts. */
function portalWriteHandlers(): { door: string; worker: string; body: string }[] {
  const out: { door: string; worker: string; body: string }[] = []
  for (const door of Object.keys(PORTAL_DOORS)) {
    if (door.startsWith("GET ")) continue
    const path = door.slice(door.indexOf(" ") + 1)
    const worker = workerOf(path)
    if (!worker || worker === "realtime" || worker === "auth") continue
    const name = handlerFor(worker, door)
    expect(name, `${door} is named by the portal door but has no handler in workers/${worker}`).toBeTruthy()
    const routeFns = indexFunctions(join(ROOT, "workers", worker, "src", "routes"))
    // Guard the walk, exactly as the read side does: a handler this index cannot
    // find yields an EMPTY body, and an empty body satisfies every assertion
    // below. A write door that went unwalked would pass for the same reason the
    // GET-only walk passed over the leak.
    expect(
      routeFns.has(name as string),
      `handler ${name} for ${door} not found in workers/${worker}/src/routes`
    ).toBe(true)
    out.push({ door, worker, body: reachOf(name as string, routeFns) })
  }
  return out
}

describe("portal fence — every read a client can reach carries the fence", () => {
  const handlers = portalReadHandlers()

  // Guard the derivation itself: a walk that silently found nothing would pass
  // every assertion below and prove exactly nothing.
  it("derives real doors from the portal gateway's own table — POSTs included", () => {
    expect(handlers.length).toBeGreaterThanOrEqual(3)
    expect(handlers.map((h) => h.door)).toContain("GET /api/content/help/thread")
    expect(handlers.map((h) => h.door)).toContain("GET /api/tenancy/accounts/detail")
    // The door the GET-only walk could not see. A write that answers with a
    // collection is a read; keep it in the target set by name so the derivation
    // can never quietly narrow back.
    expect(handlers.map((h) => h.door)).toContain("POST /api/content/help")
    expect(handlers.map((h) => h.door)).toContain("POST /api/content/help/reply")
  })

  // Reachability follows route-local helpers, so the check sees what the door
  // actually runs. Guarded here because a broken walk would silently pass
  // everything below — which is exactly how the leak survived.
  it("sees through a route-local page builder into the lib it reads with", () => {
    const raise = handlers.find((h) => h.door === "POST /api/content/help")
    expect(raise, "POST /api/content/help must be a target").toBeTruthy()
    expect(
      /(?<![\w.])listTickets\s*\(/.test((raise as { body: string }).body),
      "the reach of POST /api/content/help must include the ticket list it answers with"
    ).toBe(true)
  })

  it("every lib file a portal READ touches is declared in PORTAL_VISIBLE_READS", () => {
    const undeclared: string[] = []
    for (const { door, worker, body } of handlers) {
      for (const [file, { exported, all }] of indexLib(worker)) {
        for (const fn of exported.keys()) {
          if (!new RegExp(`(?<![\\w.])${fn}\\s*\\(`).test(body)) continue
          if (!readsRows(fn, all)) continue // a pure write has no collection to leak
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
          if (!readsRows(fn, all)) continue
          // A function that reaches NEITHER the declared fence nor an AccountScope
          // is reading a caller-supplied id with nothing on the WHERE but that id
          // — the exact shape of all three leaks found so far.
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

describe("portal fence — every write a client can reach is declared and reasoned", () => {
  /** Every non-GET door, straight off the gateway's table. Declaration is
   * demanded of ALL of them, including auth's — "this one owns nothing yet" is
   * a claim that deserves to be written down and read, not assumed. */
  const writeDoors = Object.keys(PORTAL_DOORS).filter((d) => !d.startsWith("GET "))

  /** The subset whose handler can be walked. The auth worker answers from a
   * `switch`, not a declarative ROUTES table, and every one of its doors is a
   * stated no-fence line anyway — there is no record for a fence to protect. */
  const writes = portalWriteHandlers()

  it("derives real write doors from the portal gateway's own table", () => {
    expect(writeDoors.length, "the write walk found nothing — it has gone blind").toBeGreaterThanOrEqual(5)
    expect(writes.length, "no walkable write handler — the walk has gone blind").toBeGreaterThanOrEqual(3)
    expect(writes.map((w) => w.door)).toContain("POST /api/content/help/reply")
    expect(writes.map((w) => w.door)).toContain("POST /api/tenancy/portal/switch-account")
  })

  it("every non-GET door the portal opens is declared in PORTAL_VISIBLE_WRITES", () => {
    const undeclared = writeDoors.filter((d) => !(d in PORTAL_VISIBLE_WRITES))
    expect(
      undeclared,
      `these doors let a CLIENT change something and are not declared — name the fence the handler resolves, or write the reason it needs none: ${undeclared.join(", ")}`
    ).toEqual([])
  })

  it("a declared fence is actually resolved in the handler", () => {
    const naked: string[] = []
    for (const { door, body } of writes) {
      const declared = PORTAL_VISIBLE_WRITES[door]
      if (!declared || declared.fence === null) continue
      // Comments are not code: this repo's handlers DISCUSS their fences at
      // length ("the fence decides WHOSE ticket this is"), and prose that names
      // a fence must never stand in for calling one.
      const code = body.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/gm, "$1")
      if (!new RegExp(`(?<![\\w.])${declared.fence}\\s*\\(`).test(code)) naked.push(door)
    }
    expect(
      naked,
      `these writes claim a fence their handler never resolves: ${naked.join(", ")}`
    ).toEqual([])
  })

  it("an unfenced write states why it needs no fence", () => {
    for (const [door, e] of Object.entries(PORTAL_VISIBLE_WRITES))
      if (e.fence === null)
        expect(
          e.why.length,
          `${door} changes something with no account fence — that needs a real reason`
        ).toBeGreaterThan(40)
  })

  it("every declared entry still names a door the portal actually opens (no rotting lines)", () => {
    const open = new Set(Object.keys(PORTAL_DOORS))
    for (const door of Object.keys(PORTAL_VISIBLE_WRITES))
      expect(open.has(door), `PORTAL_VISIBLE_WRITES declares ${door}, which the portal no longer opens`).toBe(
        true
      )
  })
})

// THE FENCE'S WIDTH, not just its existence.
//
// Everything above proves a portal-reachable read is BUILT with a fence. It
// cannot tell a fence one person wide from a fence one company wide, and the
// owner has ruled which one help is: a contact sees their COMPANY's questions —
// the company they are standing in and everything nested beneath it, which is
// the account scope, and never one row further.
//
// So this pins the SHAPE of that fence to the seam that defines it. The
// behavioural proof (a colleague sees it, another company does not, a
// subsidiary's contact does not inherit the group's) is next door in
// workers/content/test/help-fence.test.ts, which drives the shipped handlers
// against a real database — a source scan cannot answer "who sees what", and a
// browser-side test cannot run a worker.
describe("portal fence — the help fence is the ACCOUNT fence", () => {
  const helpLib = read(join(ROOT, "workers", "content", "src", "lib", "help.ts"))

  it("the fence declared in the registry is the one the code exports", () => {
    const declared = PORTAL_VISIBLE_READS["workers/content/src/lib/help.ts"]?.fence
    expect(declared, "help.ts must declare its fence").toBeTruthy()
    expect(helpLib, `help.ts declares ${declared} but exports no such function`).toContain(
      `export function ${declared}(`
    )
  })

  it("it is built from accountScopeClause — a client sees their company, not just themselves", () => {
    const at = helpLib.indexOf("export function ticketFence(")
    expect(at, "ticketFence is the help fence — did it move?").toBeGreaterThan(-1)
    const body = code(helpLib.slice(at, helpLib.indexOf("\nexport ", at + 1)))
    // The account scope IS the fence. Narrowing it back to the raiser would make
    // two people at one company invisible to each other, which is what the owner
    // overruled; widening it past accountScopeClause would reach another client.
    expect(body, "the help fence must be the account fence").toMatch(/accountScopeClause\(\s*scope/)
    // The creator pin survives, but only as the My/All tab — ON TOP of the
    // fence, never instead of it.
    expect(body).toMatch(/tab === "mine"/)
  })
})

// A FENCE THAT REFUSES EVERYTHING IS A BROKEN DOOR — the live half.
//
// The portal's screens are kept fresh by pings on the team channel, and a client
// login's socket is fenced by mayHearChange, which has no database: it reads the
// caller's account set and the ping itself. An account-owned ping carries an
// ACCOUNT id, which that fence can check. A ticket ping carries a TICKET id,
// which it cannot — so a scope-stamped resource must be named in the fence's own
// list, or the portal listens for something it can never hear.
//
// That was not hypothetical. `help` and `help_threads` sat in PORTAL_LISTENERS
// from the day the portal shipped, and mayHearChange dropped every one of those
// pings on the floor: a client's support screen was live in the code and dead in
// the browser, and nothing said so.
describe("portal fence — every resource the portal listens for can actually be heard", () => {
  const fenceSrc = read(join(ROOT, "shared", "workers", "account-scope.ts"))
  const listSrc = read(join(__dirname, "..", "lib", "live-resources.ts"))

  const namesIn = (src: string, constName: string) => {
    const m = new RegExp(`${constName}\\s*=\\s*\\[([^\\]]*)\\]`).exec(src)
    expect(m, `${constName} not found — did it move?`).toBeTruthy()
    return [...(m as RegExpExecArray)[1].matchAll(/"(\w+)"/g)].map((x) => x[1])
  }

  it("derives both lists (guards the scan)", () => {
    expect(namesIn(fenceSrc, "ACCOUNT_OWNED_TABLES").length).toBeGreaterThan(2)
    expect(namesIn(fenceSrc, "SCOPE_STAMPED_RESOURCES").length).toBeGreaterThan(0)
  })

  it("no listener waits on a ping a client login can never receive", () => {
    const hearable = new Set([
      ...namesIn(fenceSrc, "ACCOUNT_OWNED_TABLES"),
      ...namesIn(fenceSrc, "SCOPE_STAMPED_RESOURCES"),
    ])
    // Anchored on the declaration rather than a `=`: the type annotation itself
    // contains one (`(a: string | null) => string[]`), so a lazy scan for the
    // assignment finds the arrow instead of the table.
    const from = listSrc.indexOf("PORTAL_LISTENERS")
    const open = listSrc.indexOf("= {", from)
    const table = open === -1 ? null : listSrc.slice(open, listSrc.indexOf("\n}", open))
    expect(table, "PORTAL_LISTENERS not found in the portal's live registry").toBeTruthy()
    const listened = [...(table as string).matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1])
    expect(listened.length, "the listener map did not parse").toBeGreaterThan(3)
    const deaf = listened.filter((r) => !hearable.has(r))
    expect(
      deaf,
      `the portal listens for these and mayHearChange silences every one — either the resource carries its account (SCOPE_STAMPED_RESOURCES) or the screen is dead: ${deaf.join(", ")}`
    ).toEqual([])
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
