// A WRONG-TYPED ARGUMENT IS REFUSED, not coerced.
//
// The tool builders used to read every field through a coercing helper: `String(v)`.
// A browser form cannot send a non-string, so this never showed up in the app — but a
// JSON-RPC client can send anything, and `{"name":{}}` arrived at the door as the
// perfectly valid 17-character string "[object Object]". The door validated it,
// accepted it, audited it, and the team acquired a record called "[object Object]"
// through a door that did exactly what it was told.
//
// So the type each tool DECLARES to the model is now the type enforced, checked once
// at the boundary of both surfaces before any builder runs.

import { describe, expect, it } from "vitest"

import { checkArgTypes, obj, S, B, N, str } from "@shared/workers/tool-args"
import { GuardError } from "@shared/workers/gating"
import { MCP_TOOLS } from "../src/lib/tools"

const schema = obj({ name: S, active: B, count: N, value: { type: "object" }, ids: { type: "array" } })

describe("tool arguments are type-checked at the boundary", () => {
  it("accepts the declared types, and an omitted optional", () => {
    expect(() => checkArgTypes(schema, { name: "Acme", active: true, count: 3 })).not.toThrow()
    expect(() => checkArgTypes(schema, {})).not.toThrow()
    expect(() => checkArgTypes(schema, { name: undefined, active: null })).not.toThrow()
    expect(() => checkArgTypes(schema, { value: { a: 1 }, ids: ["x"] })).not.toThrow()
  })

  it("refuses the object that used to become \"[object Object]\"", () => {
    expect(() => checkArgTypes(schema, { name: {} })).toThrow(GuardError)
    try {
      checkArgTypes(schema, { name: {} })
    } catch (e) {
      expect((e as GuardError).status).toBe(400)
      expect((e as GuardError).message).toContain("name")
    }
  })

  it("refuses every other wrong type, naming the field", () => {
    const bad: [Record<string, unknown>, string][] = [
      [{ name: 7 }, "name"],
      [{ name: ["a"] }, "name"],
      [{ active: "true" }, "active"],
      [{ count: "3" }, "count"],
      [{ count: Number.NaN }, "count"],
      [{ value: ["not an object"] }, "value"],
      [{ ids: "one,two" }, "ids"],
    ]
    for (const [input, field] of bad) {
      expect(() => checkArgTypes(schema, input), `${field} must be refused`).toThrow(GuardError)
      try {
        checkArgTypes(schema, input)
      } catch (e) {
        expect((e as GuardError).message).toContain(field)
      }
    }
  })

  it("str() no longer fabricates a value out of the wrong type", () => {
    expect(str({ name: "Acme" }, "name")).toBe("Acme")
    expect(str({ name: {} }, "name")).toBe("")
    expect(str({ name: 7 }, "name")).toBe("")
    expect(str({}, "name")).toBe("")
  })

  it("every MCP tool declares a schema this check can actually enforce", () => {
    for (const t of MCP_TOOLS) {
      const props = (t.inputSchema as { properties?: Record<string, { type?: string }> }).properties ?? {}
      for (const [key, spec] of Object.entries(props))
        expect(
          spec?.type,
          `${t.name}.${key} declares no type — the model is told nothing and the check has nothing to enforce`
        ).toBeTruthy()
    }
  })
})
