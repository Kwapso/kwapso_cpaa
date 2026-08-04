// R10 — THE GATING SEAM (tenancy). The security counterpart to publish-seam: it
// fails CI the moment a state-changing route ships without a permission gate. It
// reads the route table from the worker and the handler source straight off disk,
// so an ungated door cannot hide behind a comment or a helper name.
//
// Every non-GET route must OPEN with one of the gates — requireRight, the
// gated()/gatedBody() wrappers, requireAnyImportRight, or adminGuard — unless it
// is a reviewed IDENTITY-gated write (listed below, each with its reason), which
// gates on whoAmI and validates ownership itself.

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { ROUTES } from "../src/index"

const SRC = join(__dirname, "..", "src")

/** Every `export async function NAME` body in a dir, keyed by name. */
function indexFunctions(dir: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const code = readFileSync(join(dir, file), "utf8")
    const starts = [...code.matchAll(/export\s+async\s+function\s+(\w+)/g)]
    starts.forEach((m, i) => {
      out.set(m[1], code.slice(m.index, starts[i + 1]?.index ?? code.length))
    })
  }
  return out
}

const routeFns = indexFunctions(join(SRC, "routes"))

/** The permission gates. Any ONE of these opening a handler satisfies R10. The
 * leading boundary is load-bearing: without it `ungatedBody(` contains
 * `gatedBody(` and a removed gate reads as a present one — the scan would pass
 * its own sabotage. */
const GATE_RE =
  /(?<![A-Za-z0-9_$.])(?:requireRight|gatedBody|gated|requireAnyImportRight|adminGuard)\s*(?:<[^>]*>)?\s*\(/

/** The reviewed IDENTITY-gated writes: they can't ask "does your ROLE allow
 * this?" because the answer is about WHO you are, not what you may do. Each
 * gates on whoAmI and proves ownership itself (matched with a leading boundary,
 * so a `notWhoAmI(` wrapper can't read as the real thing). Adding a line here is a conscious
 * decision — that's the point: you can't dodge the gate by quietly listing a
 * route as an exception without saying why. */
const IDENTITY_GATED: Record<string, string> = {
  "POST /api/tenancy/bootstrap":
    "teamless onboarding — the caller has no team yet, so there is no role to check",
  "POST /api/tenancy/switch-team":
    "flips the caller's OWN current-team pointer; membership is validated inside",
  "POST /api/tenancy/teams":
    "creates the caller's own team — they become its Admin, so no prior right exists",
  "POST /api/tenancy/invitations/accept":
    "acceptance is proved by the invite's email matching the signed-in account",
}

describe("gating-seam (tenancy): no ungated door can ship", () => {
  it("finds the route table (the scan itself must not go blind)", () => {
    expect(Object.keys(ROUTES).length).toBeGreaterThanOrEqual(14)
    expect(Object.values(ROUTES).some((r) => r.kind === "mutation")).toBe(true)
  })

  it("every non-GET route opens with a permission gate", () => {
    for (const [route, def] of Object.entries(ROUTES)) {
      if (route.startsWith("GET ")) continue
      const name = def.handler.name
      const body = routeFns.get(name)
      expect(body, `handler ${name} (${route}) must be an exported async function in routes/`).toBeDefined()
      if (IDENTITY_GATED[route]) {
        expect(
          /(?<![A-Za-z0-9_$.])whoAmI\s*\(/.test(body as string),
          `${route} is a reviewed identity-gated write (${IDENTITY_GATED[route]}) — it must still verify WHO the caller is via whoAmI`
        ).toBe(true)
        continue
      }
      expect(
        GATE_RE.test(body as string),
        `${route} (${name}) changes state with no permission gate — open it with requireRight / gated / gatedBody / requireAnyImportRight / adminGuard, or add it to IDENTITY_GATED with a reason`
      ).toBe(true)
    }
  })

  it("every identity-gated exception still names a route that exists", () => {
    for (const route of Object.keys(IDENTITY_GATED))
      expect(ROUTES[route], `IDENTITY_GATED lists ${route}, which is not a route`).toBeDefined()
  })
})
