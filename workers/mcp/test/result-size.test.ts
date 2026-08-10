// A TRUNCATED ANSWER IS NOT AN ANSWER — it is a wrong one with a note attached.
//
// The cap on a tools/call result used to slice the body at 400,000 characters,
// append "…(truncated)" and return it as `ok`. A machine client therefore
// received invalid JSON — or half a CSV row — reported as a SUCCESSFUL call, and
// the only place the damage surfaced was wherever it tried to parse it. Worse,
// the client had no reason to re-ask: as far as the protocol was concerned, it
// had its answer.
//
// So the call FAILS over the cap, and the message says what to do instead.

import { describe, expect, it } from "vitest"

import { forwardTool, getMcpTool, MCP_TOOLS } from "../src/lib/tools"

/** A door that answers with `size` characters of valid JSON. */
const doorReturning = (size: number) =>
  ({
    TENANCY: { fetch: async () => new Response(JSON.stringify({ rows: "x".repeat(size) })) },
  }) as never

const tool = getMcpTool("export_accounts_csv")!

describe("one tools/call answer is whole, or it is an error", () => {
  it("an over-sized result is an ERROR, never a successful half-answer", async () => {
    const out = await forwardTool(doorReturning(500_000), tool, {}, "c")
    expect(out.ok, "the call must not report success").toBe(false)
    expect(out.text).not.toContain("truncated")
  })

  it("…and what comes back is parseable, and says how to get the data instead", async () => {
    const out = await forwardTool(doorReturning(500_000), tool, {}, "c")
    const body = JSON.parse(out.text) as { error: string; message: string; limit: number; size: number }
    expect(body.error).toBe("result_too_large")
    expect(body.size).toBeGreaterThan(body.limit)
    expect(body.message).toMatch(/filter|page|export/i)
  })

  it("a normal-sized result comes back byte-for-byte, still ok", async () => {
    const out = await forwardTool(doorReturning(100), tool, {}, "c")
    expect(out.ok).toBe(true)
    expect(JSON.parse(out.text)).toEqual({ rows: "x".repeat(100) })
  })

  it("a door's own refusal is still passed through as the door said it (not masked)", async () => {
    const denied = {
      TENANCY: {
        fetch: async () =>
          new Response(JSON.stringify({ error: "forbidden", message: "You don't have access to that." }), {
            status: 403,
          }),
      },
    } as never
    const out = await forwardTool(denied, tool, {}, "c")
    expect(out.ok).toBe(false)
    expect(out.text).toContain("You don't have access to that.")
  })
})

describe("the customer spine reached the machine surface", () => {
  // Named on purpose: the audit that earned this branch counted eleven
  // capabilities across accounts + portal access that existed for a person on
  // BOTH front doors and for a machine on neither.
  const REQUIRED = [
    "list_accounts", "get_account", "create_account", "update_account",
    "set_account_parent", "set_account_active", "link_contact", "set_contact_link_active",
    "export_accounts_csv",
    "list_portal_access", "grant_portal_access", "set_portal_access_active",
    "get_help_thread", "list_help_stakeholders", "add_help_stakeholder",
  ]

  it("every customer-spine capability is a tool", () => {
    const missing = REQUIRED.filter((n) => !getMcpTool(n))
    expect(missing, `missing from the machine surface: ${missing.join(", ")}`).toEqual([])
  })

  it("every one of them forwards to a door, never to its own implementation", () => {
    for (const name of REQUIRED) {
      const t = getMcpTool(name)!
      expect(t.path, `${name} must forward to a real /api door`).toMatch(/^\/api\//)
    }
  })

  it("no two tools answer to the same name (a projection collision would hide one)", () => {
    const names = MCP_TOOLS.map((t) => t.name)
    expect(names.length).toBe(new Set(names).size)
  })
})
