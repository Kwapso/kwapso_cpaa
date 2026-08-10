// The error-RECORDING seam, machine-checked like the publish seam: every worker
// that binds the core DB must record unexpected crashes into the central
// error_logs table from a central catch (ERROR-HANDLING.md). A worker whose
// catch stops calling recordWorkerError silently loses its error history.
//
// THE ROSTER COMES FROM DISK, not from a list typed here. The list version named
// four workers and the fleet grew to eight: mcp complied by hand but unguarded
// (deleting its call kept the build green), realtime recorded nothing at all,
// and the two gateways could crash a stranger's request into a bare 1101 with
// nobody the wiser. A check that has to be edited whenever a worker is added is
// a check that will one day be forgotten — which is exactly what happened.
//
// Two obligations, decided by what a worker actually binds:
//   • binds the core DB  → it CAN record, so it MUST.
//   • binds no database  → it cannot record, so it must at least ANSWER: a
//     central catch that returns a clean response instead of a raw crash.

import { readdirSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const WORKERS_DIR = join(__dirname, "../..")

/** Every worker on disk, with its entry source and whether it binds the core DB. */
const FLEET = readdirSync(WORKERS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(WORKERS_DIR, d.name, "src/index.ts")))
  .map((d) => {
    const wrangler = join(WORKERS_DIR, d.name, "wrangler.jsonc")
    return {
      name: d.name,
      src: readFileSync(join(WORKERS_DIR, d.name, "src/index.ts"), "utf8"),
      // The binding is the fact that decides the obligation, so it is read from
      // the deploy config rather than assumed.
      bindsCoreDb: existsSync(wrangler) && /"d1_databases"/.test(readFileSync(wrangler, "utf8")),
    }
  })

describe("error seam: the roster is the fleet on disk", () => {
  it("finds every worker, and more than the four the old list named", () => {
    expect(FLEET.length).toBeGreaterThanOrEqual(8)
    for (const w of ["auth", "tenancy", "content", "data-ops", "mcp", "realtime", "gateway", "portal-gateway"])
      expect(
        FLEET.map((f) => f.name),
        `${w} must be in the roster this check derives`
      ).toContain(w)
  })

  for (const w of FLEET.filter((f) => f.bindsCoreDb)) {
    it(`${w.name} binds the core database, so it records crashes centrally`, () => {
      expect(w.src, `${w.name} must import the seam`).toMatch(
        /from "\.\.\/\.\.\/\.\.\/shared\/workers\/error-log"/
      )
      expect(w.src, `${w.name} must record in its catch`).toMatch(/recordWorkerError\(env\.DB/)
    })
  }

  for (const w of FLEET.filter((f) => !f.bindsCoreDb)) {
    it(`${w.name} cannot record, so it must at least answer rather than crash`, () => {
      // A public door especially: Cloudflare's raw 1101 tells a stranger the
      // worker fell over and tells us nothing at all.
      const body = catchBodyOf(w.src)
      expect(body, `${w.name} must wrap its handler in a central catch`).not.toBeNull()
      // Read the catch's OWN body, brace-balanced. A regex with a character
      // budget matched a `return` further down the file and stayed green while
      // the catch rethrew — a check that passes on the broken shape is worse
      // than none.
      //
      // Answering may be DELEGATED: the two public doors now share one crash seam
      // (recordGatewayCrash) instead of carrying the same block twice, and the
      // second copy is exactly the kind that drifts. So follow the delegation
      // through rather than demanding an inline fail() — a check that only
      // accepted the inline shape would force the duplicate back to stay green.
      expect(body, `${w.name}'s catch must ANSWER, not rethrow`).toMatch(
        /return (fail\(500|new Response|recordGatewayCrash\()/
      )
      if (/return recordGatewayCrash\(/.test(body ?? "")) {
        const seam = readFileSync(join(WORKERS_DIR, "..", "shared", "workers", "front-door.ts"), "utf8")
        const fn = seam.slice(seam.indexOf("export async function recordGatewayCrash"))
        expect(fn, "the shared crash seam must itself answer with a 500").toMatch(/return fail\(500/)
      }
      expect(body, `${w.name}'s catch must not rethrow`).not.toMatch(/^\s*throw\b/m)
    })
  }
})

/** The body of the first `catch (…) { … }` in the file, brace-balanced. */
function catchBodyOf(src: string): string | null {
  const at = src.search(/\}\s*catch\s*\([^)]*\)\s*\{/)
  if (at === -1) return null
  let i = src.indexOf("{", src.indexOf("catch", at))
  let depth = 0
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++
    else if (src[j] === "}" && --depth === 0) return src.slice(i + 1, j)
  }
  return null
}
