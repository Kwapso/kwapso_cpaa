// The MCP tool catalog can't quietly rot: every forwarded path must exist in the
// TARGET worker's own route table (tenancy/content/data-ops export ROUTES; auth's
// switchboard source is read off disk, rules-test style). Plus the token
// primitives + the JSON-RPC tool listing shape.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { ROUTES as TENANCY_ROUTES } from "../../tenancy/src/index"
import { ROUTES as CONTENT_ROUTES } from "../../content/src/index"
import { ROUTES as DATAOPS_ROUTES } from "../../data-ops/src/index"
import { TARGETS } from "../../data-ops/src/lib/targets"
import { TOOL_CATALOG } from "../../data-ops/src/lib/tools"
import { GATELESS_WRITES, SHARED_TOOLS, TOOL_GATES } from "../../../shared/workers/tool-catalog"
import { getMcpTool, MCP_TOOLS } from "../src/lib/tools"
import { newTokenSecret, sha256Hex } from "../src/lib/tokens"

const ROUTE_TABLES: Record<string, Set<string>> = {
  TENANCY: new Set(Object.keys(TENANCY_ROUTES)),
  CONTENT: new Set(Object.keys(CONTENT_ROUTES)),
  DATAOPS: new Set(Object.keys(DATAOPS_ROUTES)),
}
const authSource = readFileSync(join(__dirname, "../../auth/src/index.ts"), "utf8")

describe("MCP catalog ↔ the real doors (no drift)", () => {
  it("every forwarded path exists on its target worker", () => {
    for (const t of MCP_TOOLS) {
      if (t.binding === "AUTH") {
        expect(authSource, `auth must serve ${t.path}`).toContain(`${t.method} ${t.path}`)
        continue
      }
      const table = ROUTE_TABLES[t.binding]
      expect(table.has(`${t.method} ${t.path}`), `${t.binding} must serve ${t.method} ${t.path}`).toBe(
        true
      )
    }
  })

  it("every export the import catalog declares is an MCP tool (machine parity)", () => {
    for (const target of Object.values(TARGETS)) {
      if (!target.exportPath) continue
      const tool = MCP_TOOLS.find((t) => t.path === target.exportPath)
      expect(tool, `an MCP export tool must forward to ${target.exportPath}`).toBeDefined()
    }
  })

  // The OWNER doors (x-admin-key: migrate a team's schema, seed the catalogue, grant
  // credits, read the central error log) are protected structurally today — adminGuard
  // demands a header forwardToDoor never sends, so a tool pointed at one would simply be
  // refused. Structurally-safe is not the same as locked: nothing said a tool may not
  // forward there, so the day someone adds the header for a good reason, the protection
  // becomes a coincidence. The rule is that the machine surface has no owner doors on it
  // at all, and this is where that is written down.
  it("no tool on either surface forwards to an /admin/ door", () => {
    for (const t of [...MCP_TOOLS, ...TOOL_CATALOG])
      expect(
        t.path.includes("/admin/"),
        `${t.name} forwards to ${t.path} — owner-only maintenance is not a machine capability`
      ).toBe(false)
  })

  it("tools/list shape: every tool has a name, description, and an object schema", () => {
    for (const t of MCP_TOOLS) {
      expect(t.name).toMatch(/^[a-z_]+$/)
      expect(t.description.length).toBeGreaterThan(10)
      expect((t.inputSchema as { type?: string }).type).toBe("object")
    }
  })

  // The AGENT-only door paths (bulk / team-update / role-perms read) aren't in MCP_TOOLS,
  // so check them here too — every non-SELF agent tool must forward to a real door route.
  it("every AGENT tool path exists on its target worker (agent-side drift guard)", () => {
    const tables: Record<string, Set<string>> = {
      TENANCY: ROUTE_TABLES.TENANCY,
      CONTENT: ROUTE_TABLES.CONTENT,
    }
    for (const t of TOOL_CATALOG) {
      if (t.binding === "SELF") continue // run_import_batch executes in-process, no route
      expect(tables[t.binding]?.has(`${t.method} ${t.path}`), `${t.binding} must serve ${t.method} ${t.path} (agent tool "${t.name}")`).toBe(true)
    }
  })
})

// The unification's external + internal contracts (a green build must keep these).
describe("the shared tool catalog — contracts that must not silently drift", () => {
  it("preserves the 3 external MCP tool names via mcpName (renaming would break scripts)", () => {
    for (const n of ["create_invite", "create_help_ticket", "set_dropdown_value_active"])
      expect(getMcpTool(n), `MCP must still expose "${n}"`).toBeDefined()
    // …and the agent's canonical names for those endpoints are NOT the MCP names.
    for (const n of ["invite_member", "raise_help_ticket", "set_dropdown_active"])
      expect(getMcpTool(n), `"${n}" is the agent name, must NOT be an MCP tool name`).toBeUndefined()
  })

  // THE CONFIRM RULE IS ONLY AS COMPLETE AS THE MAP IT IS DERIVED FROM.
  // isPrivilegeWrite reads each tool's declared gate and, when there ISN'T one,
  // falls back to a path regex (`/api/tenancy/(roles|members|invites)`). Every
  // write today has a line, so the fallback never fires — but nothing said it had
  // to, so a privilege write added tomorrow on a path outside that regex would
  // skip the confirm panel in silence. The map is the law; the fallback is the
  // last resort. This asserts the last resort is never what decides.
  it("every write tool resolves to a declared gate (TOOL_GATES completeness)", () => {
    const writes = TOOL_CATALOG.filter((t) => t.write)
    expect(writes.length, "the scan must find writes at all").toBeGreaterThan(20)
    const ungated = writes.filter((t) => !TOOL_GATES[t.name] && !(t.name in GATELESS_WRITES)).map((t) => t.name)
    expect(
      ungated,
      `these writes have no line in TOOL_GATES — isPrivilegeWrite would decide their confirm rule from a PATH REGEX. Add the gate, or a reason in GATELESS_WRITES:\n  ${ungated.join("\n  ")}`
    ).toEqual([])
    // …and so does every SHARED write, whichever surface projects it.
    for (const s of SHARED_TOOLS)
      if (s.agent.write)
        expect(TOOL_GATES[s.name], `shared write "${s.name}" must declare its gate`).toBeTruthy()
  })

  // The reasoned half, held to the same ratchet as every other deny-list: a line
  // that stops being an offender must GO, so the list can only shrink.
  it("GATELESS_WRITES names only real, still-gateless writes — with a reason", () => {
    const byName = new Map(TOOL_CATALOG.map((t) => [t.name, t]))
    for (const [name, why] of Object.entries(GATELESS_WRITES)) {
      expect(byName.get(name)?.write, `${name} is excused in GATELESS_WRITES but is not a write tool — delete the line`).toBe(true)
      expect(TOOL_GATES[name], `${name} now HAS a gate — delete its GATELESS_WRITES line`).toBeUndefined()
      expect(why.length, `${name} needs a reason someone can disagree with`).toBeGreaterThan(40)
    }
  })

  it("restores the developer permission hint on every gated MCP write description", () => {
    for (const s of SHARED_TOOLS) {
      const gate = TOOL_GATES[s.name]
      if (!gate) continue
      const t = getMcpTool(s.mcpName ?? s.name)!
      expect(t.description, `${t.name} description must name its required right`).toContain(`Needs ${gate}.`)
    }
  })
})

describe("personal access tokens", () => {
  it("secrets are prefixed + 64 hex chars of entropy, and hash deterministically", async () => {
    const s1 = newTokenSecret()
    const s2 = newTokenSecret()
    expect(s1).toMatch(/^kwapso_mcp_[0-9a-f]{64}$/)
    expect(s1).not.toBe(s2)
    expect(await sha256Hex(s1)).toBe(await sha256Hex(s1))
    expect(await sha256Hex(s1)).not.toBe(await sha256Hex(s2))
  })
})
