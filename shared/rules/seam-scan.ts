// THE ONE SCANNER BEHIND THE SEAM SUITES — R1 (every mutation publishes) and
// R10 (every write gates).
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
            `${route} is a reviewed identity-gated write (${identityGated[route]}) — it must still verify WHO the caller is via whoAmI`
          ).toBe(true)
          continue
        }
        expect(
          GATE_RE.test(code),
          `${route} (${handler}) changes state with no permission gate — open it with requireRight / gated / gatedBody / requireAnyImportRight / adminGuard, or add it to identityGated with a reason`
        ).toBe(true)
      }
    })

    it("every identity-gated exception still names a route that exists", () => {
      for (const route of Object.keys(identityGated))
        expect(routes[route], `identityGated lists ${route}, which is not a route`).toBeDefined()
    })

    it("every identity-gated exception states a real reason", () => {
      for (const [route, why] of Object.entries(identityGated))
        expect(why.length, `${route} is an exception to R10 — that needs a real reason`).toBeGreaterThan(20)
    })
  })
}
