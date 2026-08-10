// WHO ASKED — every assistant turn records the SURFACE it came from.
//
// `agent_messages.source` exists for one question: was this a person in the app, or
// a machine holding a personal access token? Both callers reach the SAME handler
// (the MCP's agent_chat / agent_confirm forward to it), and the handler used to
// stamp the literal "in-app" for both — so a token-driven turn was written into the
// team's history as if somebody had typed it. Nothing exceeded its rights; the
// damage is that after a token leak the column could not answer the one thing it
// was cut for.
//
// The surface is derived from the SESSION (`pinnedTeamId` — only auth's internal
// bridge mints a pinned session, and only for a verified token), never from a
// header: a header would let a browser call itself "mcp" and a machine call itself
// "in-app", which is the same hole facing both ways.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const agentRoutes = readFileSync(join(__dirname, "..", "src", "routes", "agent.ts"), "utf8")
const authUsers = readFileSync(join(__dirname, "..", "..", "auth", "src", "lib", "users.ts"), "utf8")
const sharedTypes = readFileSync(join(__dirname, "..", "..", "..", "shared", "types.ts"), "utf8")

function handlerBody(name: string): string {
  const start = agentRoutes.indexOf(`export async function ${name}`)
  expect(start, `${name} must exist`).toBeGreaterThan(-1)
  const next = agentRoutes.indexOf("\nexport ", start + 1)
  return agentRoutes.slice(start, next === -1 ? undefined : next)
}

describe("an assistant turn records which surface asked", () => {
  for (const handler of ["postAgentChat", "postAgentConfirm"]) {
    it(`${handler} never hard-codes the surface`, () => {
      const body = handlerBody(handler)
      expect(
        /source:\s*"(in-app|mcp)"/.test(body),
        `${handler} pins source to a literal — a machine's turn would be filed as a person's`
      ).toBe(false)
    })

    it(`${handler} derives the surface from the caller's session`, () => {
      const body = handlerBody(handler)
      expect(body, `${handler} must pass the derived surface`).toMatch(/source:\s*callerSurface\(user\)/)
      // …and it must actually have the session to derive it from.
      expect(body, `${handler} must take the session user out of teamContext`).toMatch(
        /teamContext\(request, env\)/
      )
      expect(body.slice(0, body.indexOf("teamContext"))).toContain("user")
    })
  }

  it("the surface comes from the session pin, not from anything the caller can set", () => {
    const start = agentRoutes.indexOf("function callerSurface")
    expect(start, "callerSurface must exist").toBeGreaterThan(-1)
    const body = agentRoutes.slice(start, agentRoutes.indexOf("\n}", start))
    expect(body, "the pin is the signal").toContain("pinnedTeamId")
    expect(body).toContain('"mcp"')
    expect(body).toContain('"in-app"')
    // A header, a query param or a body field would all be caller-controlled.
    expect(/headers\.get|searchParams|body\./.test(body), "a caller must not be able to state its own surface").toBe(
      false
    )
  })

  it("the session pin actually reaches a downstream worker (auth carries it on /me)", () => {
    expect(sharedTypes, "SessionUser must carry the pin").toMatch(/pinnedTeamId:\s*string \| null/)
    const start = authUsers.indexOf("export function toSessionUser")
    const body = authUsers.slice(start, authUsers.indexOf("\n}", start))
    expect(body, "auth must map the session row's team_pin onto it").toMatch(
      /pinnedTeamId:\s*row\.team_pin/
    )
  })
})
