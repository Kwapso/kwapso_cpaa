import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// THE ERROR STORE ONLY WORKS IF SOMEBODY READS IT.
//
// Two classes of message are console-only, never written down: a transient
// network blip (the browser's generic "Failed to fetch" when a navigation
// cancels an in-flight request) and the browser's own chatter. The one that
// prompted this was "ResizeObserver loop completed with undelivered
// notifications" — harmless by specification, repeats, and it was sitting at the
// top of the store competing for attention with a real database auth failure and
// a real mail-sending failure.
//
// The risk of a filter is the opposite mistake: filtering something real. So
// this checks BOTH directions — the noise is dropped AND an ordinary error still
// gets through. A filter that swallows everything would pass a one-sided test.
//
// The predicates are module-private (they are implementation, not API), so this
// exercises them through the source. If they are ever exported, rewrite this to
// call them.

const LOG = readFileSync(resolve(__dirname, "../lib/log.ts"), "utf8")

/** Rebuild a predicate from its source so the test runs the real regex. */
function predicate(name: string): (e: { name?: string; message: string }) => boolean {
  const at = LOG.indexOf(`function ${name}(`)
  expect(at, `${name} must exist in web/lib/log.ts`).toBeGreaterThan(-1)
  const open = LOG.indexOf("{", at)
  let depth = 0
  let close = open
  for (let i = open; i < LOG.length; i++) {
    if (LOG[i] === "{") depth++
    else if (LOG[i] === "}" && --depth === 0) {
      close = i
      break
    }
  }
  const body = LOG.slice(open + 1, close).replace(/:\s*Error/g, "")
  // eslint-disable-next-line no-new-func
  return new Function("e", body) as (e: { name?: string; message: string }) => boolean
}

const isBrowserNoise = predicate("isBrowserNoise")
const isBenignNetworkError = predicate("isBenignNetworkError")

const dropped = (m: string, n = "Error") =>
  isBrowserNoise({ name: n, message: m }) || isBenignNetworkError({ name: n, message: m })

describe("the error store keeps signal, not chatter", () => {
  it("drops the browser's own noise", () => {
    expect(dropped("ResizeObserver loop completed with undelivered notifications")).toBe(true)
    expect(dropped("ResizeObserver loop limit exceeded")).toBe(true)
  })

  it("drops a transient network blip", () => {
    expect(dropped("Failed to fetch")).toBe(true)
    expect(dropped("Load failed")).toBe(true)
    expect(dropped("anything", "AbortError")).toBe(true)
  })

  it("KEEPS a real failure — the direction that matters more", () => {
    // Every one of these is a row that was actually in the store and actually
    // told us something.
    expect(dropped("Cloudflare D1 API failed: Authentication error")).toBe(false)
    expect(dropped("Resend refused the email (403): domain is not verified")).toBe(false)
    expect(dropped("Cannot read properties of undefined (reading 'id')")).toBe(false)
    // And a message that merely mentions the noise is not the noise.
    expect(dropped("our chart broke while a ResizeObserver loop was running")).toBe(false)
  })

  it("is wired into the one reporting seam, not applied ad hoc", () => {
    expect(LOG, "reportError must consult both filters before beaconing").toMatch(
      /if \(isBenignNetworkError\(e\) \|\| isBrowserNoise\(e\)\) return/
    )
  })
})
