// A CONFIRM YOU CANNOT READ IS NOT A CONFIRM.
//
// The yes/no panel is the designated defence against the assistant being talked
// into something — the model reads team data an attacker can author, so the last
// line is a human clicking "Go ahead". It used to show the tool's one-line
// summary and nothing else: "Set access rights for the Sub Admin role" hid WHICH
// rights, and a privilege grant nobody could read is a privilege grant nobody
// reviewed.
//
// This suite locks the payload OPEN, and it is DERIVED (never a list of tools):
// every confirming tool in the catalog is fed a sample built from its own schema,
// and every field of the body it would POST must be visible in the panel's lines.
// A tool added tomorrow is covered the moment it exists. The earlier version of
// this defence was a green test that asserted the WRONG intent (that a confirm
// happened, not that it was readable) — so these assertions read the rendered
// lines, not the fact that a function was called.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { describePayload, fieldLabel, pendingCall } from "../../../shared/workers/confirm-payload"
import { TEAM_MODULE_CATALOG } from "../../../shared/team-modules"
import { getTool, requiresConfirm, TOOL_CATALOG, type AgentTool } from "../src/lib/tools"

/** A sample input for a tool, built from the tool's OWN schema — so the coverage
 * below can't miss a field somebody added without telling this test. */
function sampleInput(tool: AgentTool): Record<string, unknown> {
  const props = (tool.schema.properties ?? {}) as Record<string, { type?: string }>
  const input: Record<string, unknown> = {}
  for (const [key, spec] of Object.entries(props)) {
    switch (spec.type) {
      case "boolean":
        input[key] = true
        break
      case "number":
        input[key] = 7
        break
      case "array":
        input[key] = ["01ROW1", "01ROW2", "01ROW3", "01ROW4"]
        break
      case "object":
        // The only object field today is a role's permission sheet.
        input[key] = { learning: { read: true, create: true } }
        break
      default:
        input[key] = `sample ${key}`
    }
  }
  return input
}

/** Every (tool, input) pair that stops for the yes/no panel. BOTH directions of
 * the toggles are tried: the (de)activate tools and the filter-bulk's dry run
 * confirm only when the input is the destructive one, and that is exactly the
 * call whose payload has to be readable. */
const CONFIRMING: [AgentTool, Record<string, unknown>][] = TOOL_CATALOG.flatMap((t) =>
  [sampleInput(t), { ...sampleInput(t), active: false, dryRun: false }]
    .filter((input) => requiresConfirm(t, input))
    .slice(0, 1)
    .map((input): [AgentTool, Record<string, unknown>] => [t, input])
)

describe("the confirm panel shows the payload it asks an admin to approve", () => {
  it("finds the confirming tools (the derivation itself must not go quiet)", () => {
    const names = CONFIRMING.map(([t]) => t.name)
    expect(names.length, names.join(", ")).toBeGreaterThanOrEqual(12)
    // The ones that only confirm on the way DOWN must be in the set, or their
    // payload would go unchecked precisely when it matters.
    for (const n of ["set_learning_active", "set_dropdown_active", "set_help_status_by_filter"])
      expect(names, `${n} must be covered in its destructive direction`).toContain(n)
  })

  // THE LAW. Not "details exist" — every field of the body the door will receive
  // has to be READABLE in the panel.
  it("names every field of the body it will POST — derived from each tool's own schema", () => {
    for (const [tool, input] of CONFIRMING) {
      const body = tool.buildBody ? tool.buildBody(input) : input
      const lines = pendingCall(tool, input).details
      const text = lines.join("\n")
      expect(lines.length, `${tool.name} must show what it will do, not just its name`).toBeGreaterThan(0)

      for (const [key, value] of Object.entries(body)) {
        if (value === undefined || value === null) continue
        if (value && typeof value === "object" && !Array.isArray(value)) {
          // A permission sheet: every module row must be there (see below).
          expect(text, `${tool.name}.${key} must be spelled out`).toContain("Learning: read, create")
          continue
        }
        if (typeof value === "string" && value) {
          expect(text, `${tool.name} hides the value of "${key}"`).toContain(value)
          continue
        }
        // Booleans and numbers can't be searched for by value ("true" is not the
        // word a manager reads), so the FIELD has to be named instead — with the
        // renderer's OWN label, asked for here rather than retyped.
        const named = fieldLabel(tool.name, key)
        expect(
          lines.some((l) => l.startsWith(`${named}:`)),
          `${tool.name} hides "${key}" — no line reads "${named}: …"`
        ).toBe(true)
      }
    }
  })

  it("spells a role's access rights out module by module — including the ones being taken away", () => {
    // The door writes EVERY module: a module the payload doesn't mention is set to
    // no access. A panel showing only what's granted would let a silent removal
    // through, which is the same escalation risk in reverse.
    const lines = describePayload("set_role_permissions", {
      roleId: "01ROLE",
      value: { learning: { read: true, create: true, edit: false }, help: { read: true } },
    })
    const text = lines.join("\n")
    expect(text).toContain("Learning: read, create")
    expect(text).toContain("Help: read")
    expect(text).toContain("Members: no access")
    expect(text).toContain("Roles & permissions: no access")
    // Every module in the app's own words, none skipped.
    for (const m of TEAM_MODULE_CATALOG)
      expect(text, `${m.label} must appear`).toContain(`${m.label}:`)
    // "edit: false" is not access — it must not read as granted.
    expect(text).not.toContain("Learning: read, create, edit")
  })

  it("reads in the app's words, with ids resolved to people (never a bare ULID)", () => {
    const names = { "01USER": "Jane Doe", "01ROLE": "Sub Admin" }
    expect(describePayload("set_member_role", { userId: "01USER", roleId: "01ROLE" }, names)).toEqual([
      "Member: Jane Doe",
      "Role: Sub Admin",
    ])
    // An id nobody could resolve still SHOWS — falling back to the raw value beats
    // showing nothing at all.
    expect(describePayload("remove_member", { userId: "01GHOST" })).toEqual(["Member: 01GHOST"])
  })

  it("keeps a long or multi-line value on its line, and never echoes a secret", () => {
    const long = "x".repeat(400)
    const [line] = describePayload("raise_help_ticket", { description: `first\nsecond   third ${long}` })
    expect(line.startsWith("Description: first second third")).toBe(true)
    expect(line.includes("\n")).toBe(false)
    expect(line.length).toBeLessThan(200)
    // No tool carries a credential today; the guard is for the one that does.
    expect(describePayload("some_future_tool", { apiKey: "sk-live-123", password: "hunter2" })).toEqual([
      "Api key: hidden",
      "Password: hidden",
    ])
    expect(describePayload("some_future_tool", { apiKey: "sk-live-123" }).join()).not.toContain("sk-live")
  })

  it("says how many rows a bulk change touches, and names the first few", () => {
    const text = describePayload("bulk_set_help_status", {
      ids: ["01A", "01B", "01C", "01D", "01E"],
      status: "resolved",
    }).join("\n")
    expect(text).toContain("5 in total — 01A, 01B, 01C, …")
    expect(text).toContain("New status: resolved")
  })

  it("carries the summary AND the payload together — one seam, so they can't drift", () => {
    const call = pendingCall(getTool("set_role_active")!, { roleId: "01ROLE", active: false }, { "01ROLE": "Sub Admin" })
    expect(call.summary).toBe("Deactivate the Sub Admin role")
    expect(call.details).toEqual(["Role: Sub Admin", "Switched on: No"])
  })
})

describe("the agent loop builds its proposals through that one seam", () => {
  // The seam guard, in the house style: read the source off disk. A future edit
  // that goes back to mapping `{name, input, summary}` by hand would compile
  // (details is only required by the type) — but it would ship a panel that shows
  // a label with nothing under it, which is exactly the gap this closes.
  const agentSrc = readFileSync(join(__dirname, "..", "src", "lib", "agent.ts"), "utf8")

  it("needsConfirm comes from pendingCall(), not a hand-rolled summary", () => {
    expect(agentSrc).toMatch(/needsConfirm:[^\n]*pendingCall\(/)
    expect(agentSrc).toContain('from "../../../../shared/workers/confirm-payload"')
  })
})
