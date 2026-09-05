// THE ONE SCANNER BEHIND THE SEAM SUITES — R1 (every mutation publishes), R10
// (every write gates) and the activity seam (every mutation leaves a trail).
//
// A TEST module. Nothing in any worker's src/ imports it, and wrangler bundles
// from src/, so it never ships. It lives in shared/rules/ because that is where
// the law machinery lives: registry.ts is the laws as DATA, this is the two
// oldest laws as CODE.
//
// WHY IT EXISTS. The per-worker suites were copies. Not "similar" — copies:
// content and data-ops were 97% identical, and each publish-seam.test.ts also
// carried a SECOND, WEAKER gating check beside the real one, so R10 was
// enforced twice per worker with two different regexes. The weaker one had no
// comment stripping and no leading word boundary, which meant `ungatedBody(`
// read as a present gate and a doc comment thirty lines below a handler could
// satisfy a rule the handler broke. Three copies of a security check is not
// three checks; it is one check and two things that look like it.
//
// So: one implementation, and the per-worker files carry only what is genuinely
// per-worker — the reviewed deny-lists, each entry a conscious line with a
// reason. That data stays beside the worker it describes, because that is what
// a reviewer reads.
//
// The file-reading it stands on — the directory walk and stripComments — lives in
// source-scan.ts beside this file, shared with every other law that reads source.
//
// It reads handler SOURCE off disk rather than calling anything, on purpose: a
// gate that is present in the code is the only kind that can be proved without
// running the whole worker, and a mutation that "forgets" to publish is invisible
// to any behavioural test that doesn't already know what it forgot.

import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "./source-scan"

/** A worker's declarative route table, as every domain worker exports it. */
export type SeamRoutes = Record<string, { handler: { name: string }; kind: string }>

/** Every `export async function NAME` body under a directory of .ts files, keyed
 * by name. Each body runs to the next top-level export, which is why
 * stripComments is load-bearing: the slice swallows the doc comment introducing
 * the NEXT function. The walk RECURSES — a handler that moves into
 * routes/<something>/ must not fall out of R1 and R10 by being moved. */
export function indexFunctions(dir: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const file of sourceFiles(dir, { extensions: [".ts"] })) {
    const starts = [...file.source.matchAll(/export\s+async\s+function\s+(\w+)/g)]
    starts.forEach((m, i) =>
      out.set(m[1], file.source.slice(m.index, starts[i + 1]?.index ?? file.source.length))
    )
  }
  return out
}

/** The permission gates. Any ONE of these opening a handler satisfies R10. The
 * leading boundary is load-bearing: without it `ungatedBody(` contains
 * `gatedBody(` and a removed gate reads as a present one — the scan would pass
 * its own sabotage. */
const GATE_RE =
  /(?<![A-Za-z0-9_$.])(?:requireRight|gatedBody|gated|requireAnyImportRight|adminGuard)\s*(?:<[^(<>]*>)?\s*\(/

const WHOAMI_RE = /(?<![A-Za-z0-9_$.])whoAmI\s*\(/

const PUBLISH_RE = /publish(Change|UserChange|SignOut)\s*\(/

/** What every seam suite needs to find a worker's handlers. */
type Worker = {
  /** The worker's name, for the test titles ("content", "tenancy", …). */
  name: string
  /** Its ROUTES table, imported from src/index.ts. */
  routes: SeamRoutes
  /** Its src/ directory (`join(__dirname, "..", "src")`). */
  src: string
  /** The floor the route table must clear — a scan over an empty table passes
   * every assertion below and proves nothing. */
  minRoutes: number
}

/**
 * R1 — THE LIVE-SYNC SEAM (CACHING.md "Every mutation publishes"). Fails CI the
 * moment a state-changing route ships without broadcasting a live change ping,
 * so a new mutation that forgets turns the build red instead of silently
 * shipping stale screens.
 *
 * `housekeeping` is the ONLY set allowed to broadcast nothing, and it is locked
 * to what the route table declares — you cannot dodge live-sync by quietly
 * flipping a mutation to "housekeeping".
 *
 * `indirectPublishers` are lib functions a handler may publish THROUGH; each is
 * asserted to publish itself, so the chain is real rather than assumed.
 */
export function publishSeam(worker: Worker & {
  housekeeping: string[]
  indirectPublishers?: string[]
}) {
  const { name, routes, src, minRoutes, housekeeping } = worker
  const indirect = worker.indirectPublishers ?? []

  describe(`live-sync seam (${name}): every mutation publishes`, () => {
    const routeFns = indexFunctions(join(src, "routes"))
    const libFns = indexFunctions(join(src, "lib"))

    it("finds the route table (the scan itself must not go blind)", () => {
      expect(Object.keys(routes).length).toBeGreaterThanOrEqual(minRoutes)
      expect(Object.values(routes).some((r) => r.kind === "mutation")).toBe(true)
    })

    it("classifies every non-GET route as mutation or housekeeping (never silently read)", () => {
      for (const [route, def] of Object.entries(routes)) {
        if (route.startsWith("GET ")) expect(def.kind, `${route} is a GET`).toBe("read")
        else expect(["mutation", "housekeeping"], `${route} must be classified`).toContain(def.kind)
      }
    })

    it("locks the housekeeping deny-list to the reviewed set", () => {
      const declared = Object.entries(routes)
        .filter(([, d]) => d.kind === "housekeeping")
        .map(([r]) => r)
      expect(new Set(declared)).toEqual(new Set(housekeeping))
    })

    it("every mutation handler actually broadcasts a change ping", () => {
      for (const [route, def] of Object.entries(routes)) {
        if (def.kind !== "mutation") continue
        const body = routeFns.get(def.handler.name)
        expect(body, `handler source for ${route} (${def.handler.name})`).toBeTruthy()
        const code = stripComments(body as string)
        const direct = PUBLISH_RE.test(code)
        const viaLib = indirect.some((fn) => new RegExp(`\\b${fn}\\s*\\(`).test(code))
        expect(direct || viaLib, `${route} must publish (directly or via a lib publisher)`).toBe(true)
      }
    })

    it("the indirect lib publishers really do publish (so the chain is honest)", () => {
      for (const fn of indirect) {
        const body = libFns.get(fn)
        expect(body, `lib source for ${fn}`).toBeTruthy()
        expect(PUBLISH_RE.test(stripComments(body as string)), `${fn} must contain a publish call`).toBe(true)
      }
    })
  })
}

/**
 * R10 — THE GATING SEAM. The security counterpart to the publish seam: it fails
 * CI the moment a state-changing route ships without a permission gate.
 *
 * Every non-GET route must OPEN with one of the gates — requireRight, the
 * gated()/gatedBody() wrappers, requireAnyImportRight, or adminGuard — unless it
 * is a reviewed IDENTITY-gated write, which gates on whoAmI and proves ownership
 * itself. Those can't ask "does your ROLE allow this?" because the answer is
 * about WHO you are, not what you may do (teamless onboarding, an own-pointer
 * flip, accepting an invite addressed to you).
 *
 * `identityGated` maps route → the reason. Adding a line is a conscious decision
 * — that is the point: you cannot dodge the gate by quietly listing a route as
 * an exception without saying why.
 */
export function gatingSeam(worker: Worker & { identityGated?: Record<string, string> }) {
  const { name, routes, src, minRoutes } = worker
  const identityGated = worker.identityGated ?? {}

  describe(`gating-seam (${name}): no ungated door can ship`, () => {
    const routeFns = indexFunctions(join(src, "routes"))

    it("finds the route table (the scan itself must not go blind)", () => {
      expect(Object.keys(routes).length).toBeGreaterThanOrEqual(minRoutes)
      expect(Object.values(routes).some((r) => r.kind === "mutation")).toBe(true)
    })

    it("every non-GET route opens with a permission gate", () => {
      for (const [route, def] of Object.entries(routes)) {
        if (route.startsWith("GET ")) continue
        const handler = def.handler.name
        const body = routeFns.get(handler)
        expect(body, `handler ${handler} (${route}) must be an exported async function in routes/`).toBeDefined()
        const code = stripComments(body as string)
        if (identityGated[route]) {
          expect(
            WHOAMI_RE.test(code),
            `${route} is a reviewed identity-gated write (${identityGated[route]}), it must still verify WHO the caller is via whoAmI`
          ).toBe(true)
          continue
        }
        expect(
          GATE_RE.test(code),
          `${route} (${handler}) changes state with no permission gate. Open it with requireRight / gated / gatedBody / requireAnyImportRight / adminGuard, or add it to identityGated with a reason`
        ).toBe(true)
      }
    })

    it("every identity-gated exception still names a route that exists", () => {
      for (const route of Object.keys(identityGated))
        expect(routes[route], `identityGated lists ${route}, which is not a route`).toBeDefined()
    })

    it("every identity-gated exception states a real reason", () => {
      for (const [route, why] of Object.entries(identityGated))
        expect(why.length, `${route} is an exception to R10, that needs a real reason`).toBeGreaterThan(20)
    })
  })
}

/** Every top-level `function NAME` body under a directory, EXPORTED OR NOT.
 *
 * `indexFunctions` above takes only `export async function`, which is right for
 * R1 and R10: those laws ask about a route HANDLER, and a handler is exported by
 * construction. It is wrong for a call-graph walk, and provably so — a first cut
 * of the activity census reported the calendar sweep as writing no history,
 * because `syncCalendar` is a six-line wrapper round `runCalendarSync`, which is
 * module-private and holds the `logActivity` call. The slice attributed that
 * body to whatever export happened to precede it, so the walk could never find
 * it under any name it knew.
 *
 * So this indexes both, and slices between top-level declarations rather than
 * between exports. Same file walk, same stripComments contract; a different
 * question, and one where a private helper is exactly what is being looked for. */
export function indexAllFunctions(dir: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const file of sourceFiles(dir, { extensions: [".ts"] })) {
    const starts = [...file.source.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm)]
    starts.forEach((m, i) =>
      out.set(m[1], file.source.slice(m.index, starts[i + 1]?.index ?? file.source.length))
    )
  }
  return out
}

/** The two activity writers. `logActivity` swallows and records; `writeActivity`
 * throws. Either satisfies this seam — the question here is whether the trail
 * gains a line at all, not which contract the caller chose. */
const ACTIVITY_RE = /(?<![A-Za-z0-9_$.])(logActivity|writeActivity)\s*\(/

/** How far the walk follows a handler into the libs before giving up.
 *
 * FOUR, measured rather than picked: the deepest real chain in the app is a
 * handler → a lib entry point → a private worker → the writer, and raising the
 * ceiling to eight changed not one verdict across all three workers. A ceiling
 * that is too low reports a false silence; one with no ceiling walks the whole
 * worker from every route and reports that everything logs, which is the same
 * check as no check. */
const MAX_HOPS = 4

/**
 * THE ACTIVITY SEAM — every mutation leaves a line in the team's trail, or says
 * in writing why it does not.
 *
 * R1's sibling, one table over. R1 asks whether a state change reaches a
 * SCREEN; this asks whether it reaches the HISTORY, which is the question
 * anybody asks weeks later and the one nothing checked: 146 of 150 mutations
 * wrote a line, the other four were nobody's decision, and there was no way to
 * tell the difference between a deliberate silence and a forgotten one.
 *
 * `silent` is that difference, written down. Each entry is a route that
 * deliberately writes no activity row and the reason it does not, and it is
 * rot-checked BOTH ways: an entry naming a route that does not exist fails, and
 * so does an entry whose route turns out to log after all — so the list can only
 * ever describe what is really true, and it shrinks when somebody instruments
 * one of them.
 *
 * It reads source off disk and walks the call graph, because almost nothing logs
 * in the handler: a handler gates and validates, and the lib function behind it
 * is where the row is written. A check that only looked at the handler would
 * report every door in the app as silent.
 */
export function activitySeam(worker: Worker & { silent: Record<string, string> }) {
  const { name, routes, src, minRoutes, silent } = worker

  describe(`activity seam (${name}): every mutation leaves a trail, or says why not`, () => {
    const routeFns = indexAllFunctions(join(src, "routes"))
    // The libs a handler reaches into: this worker's own, plus the shared ones —
    // `logMemberJoined` lives in a lib and `logActivity` itself is shared, so a
    // walk that only knew one of the two would stop one hop short of the answer.
    const libFns = new Map([
      ...indexAllFunctions(join(src, "lib")),
      ...indexAllFunctions(join(__dirname, "..", "workers")),
    ])

    /** Does this function, or anything it calls within MAX_HOPS, write a row? */
    const writesActivity = (fn: string, seen = new Set<string>(), depth = 0): boolean => {
      if (depth > MAX_HOPS || seen.has(fn)) return false
      seen.add(fn)
      const body = routeFns.get(fn) ?? libFns.get(fn)
      if (!body) return false
      const code = stripComments(body)
      if (ACTIVITY_RE.test(code)) return true
      for (const call of code.matchAll(/(?<![A-Za-z0-9_$.])(\w{4,})\s*\(/g))
        if (libFns.has(call[1]) && writesActivity(call[1], seen, depth + 1)) return true
      return false
    }

    it("finds the route table (the scan itself must not go blind)", () => {
      expect(Object.keys(routes).length).toBeGreaterThanOrEqual(minRoutes)
      expect(Object.values(routes).some((r) => r.kind === "mutation")).toBe(true)
    })

    it("every mutation writes an activity row, or is a reviewed silence", () => {
      const unreasoned: string[] = []
      for (const [route, def] of Object.entries(routes)) {
        if (def.kind !== "mutation") continue
        if (silent[route]) continue
        if (!writesActivity(def.handler.name)) unreasoned.push(`${route} (${def.handler.name})`)
      }
      expect(
        unreasoned,
        `these mutations leave no line in the team's activity trail. Write one through logActivity, or add the route to the silent list with the reason it should not: ${unreasoned.join(", ")}`
      ).toEqual([])
    })

    it("every reviewed silence still names a route that exists", () => {
      for (const route of Object.keys(silent))
        expect(routes[route], `the silent list names ${route}, which is not a route`).toBeDefined()
    })

    it("every reviewed silence states a real reason", () => {
      for (const [route, why] of Object.entries(silent))
        expect(
          why.length,
          `${route} writes no history, that needs a real reason`
        ).toBeGreaterThan(30)
    })

    it("no reviewed silence has quietly started logging (the list can only shrink)", () => {
      const stale: string[] = []
      for (const route of Object.keys(silent)) {
        const def = routes[route]
        if (def && writesActivity(def.handler.name)) stale.push(route)
      }
      expect(
        stale,
        `these routes DO write activity now, so their silent-list entries are stale and should be deleted: ${stale.join(", ")}`
      ).toEqual([])
    })
  })
}
