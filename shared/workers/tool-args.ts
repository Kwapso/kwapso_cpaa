// THE ARGUMENT LANGUAGE both machine surfaces speak — the JSON-Schema shapes a
// tool declares its inputs in, and the one runtime check that refuses a wrongly
// typed argument at the boundary.
//
// Split out of tool-catalog.ts because it has a different reader. The catalogue
// is read by anybody asking WHAT this app can do; this file is read by whoever is
// wiring a surface up to it — mcp/src/lib/tools.ts building an inputSchema, and
// the executors turning a bad argument into a clean 400. Neither has to scroll
// past a hundred and fifty tool definitions to find it.

import { GuardError } from "./gating"

export const S = { type: "string" } as const
export const B = { type: "boolean" } as const
export const N = { type: "number" } as const
export const obj = (props: Record<string, unknown>, required: string[] = []): Record<string, unknown> => ({
  type: "object",
  properties: props,
  required,
})

/** A STRING FROM A FIXED SET. Two jobs in one declaration: the model is told
 * which values exist, and `checkArgTypes` REFUSES anything else at the boundary
 * before a builder or a router ever sees it.
 *
 * Earned by `set_record_active`, whose `record` argument selects one of
 * twenty-one doors. Declared as a bare string, an unrecognised kind type-checked
 * fine and then fell through to the CANONICAL door — so
 * `{record: "ticket", id: "<a ticket id>"}` was forwarded to the ACCOUNTS
 * archive door, and the caller was told an account does not exist about an
 * account they never named. The narrower and realer shape is an unrecognised
 * kind carrying a valid ACCOUNT id, which archives that account having been
 * asked to archive something else. A type check cannot catch that; an enum can,
 * and it can only be declared where the allowed set already lives. */
export const enumOf = (values: readonly string[]): Record<string, unknown> => ({
  type: "string",
  enum: [...values],
})

/** Read a tool input field as a string. A value of the WRONG TYPE reads as absent
 * rather than being coerced: `String({})` is `"[object Object]"`, which is a
 * perfectly valid 17-character name as far as the door's text validation is
 * concerned, so a machine could invent a record called "[object Object]" through
 * a door that was doing exactly what it was told. A browser form cannot produce a
 * non-string; a JSON-RPC client can send anything.
 *
 * Reading as absent is the FLOOR, not the refusal — the refusal is
 * `checkArgTypes` below, which both executors run before the builders, so a
 * wrong-typed argument is answered with a 400 that says which field. This stays
 * lenient so it can also be used in the step SUMMARIES (which run before the
 * executor and must never throw a label). */
export const str = (input: Record<string, unknown>, key: string): string => {
  const v = input[key]
  return typeof v === "string" ? v : ""
}

/** REFUSE A WRONG-TYPED ARGUMENT, once, at the boundary of both machine surfaces.
 * The tool's own JSON-Schema already declares each field's type for the model;
 * this is the same declaration enforced. Only the field types the catalog uses are
 * checked (string / boolean / number / object / array) and only for keys the caller
 * actually sent — an omitted optional stays omitted. Throws the GuardError both
 * executors already know how to turn into a clean 400. */
export function checkArgTypes(schema: Record<string, unknown>, input: Record<string, unknown>): void {
  const props = (schema.properties ?? {}) as Record<string, { type?: string; enum?: string[] }>
  for (const [key, spec] of Object.entries(props)) {
    const v = input[key]
    if (v === undefined || v === null) continue
    // A FIXED SET IS CHECKED AGAINST ITS MEMBERS, not just its type. Before the
    // type check, because "must be one of…" is the more useful sentence and a
    // non-string is not one of them either.
    if (spec?.enum) {
      if (!spec.enum.includes(v as string))
        throw new GuardError(
          400,
          "invalid_input",
          `"${key}" must be one of: ${spec.enum.join(", ")}.`
        )
      continue
    }
    const want = spec?.type
    const ok =
      want === "string" ? typeof v === "string"
      : want === "boolean" ? typeof v === "boolean"
      : want === "number" ? typeof v === "number" && Number.isFinite(v)
      : want === "array" ? Array.isArray(v)
      : want === "object" ? typeof v === "object" && !Array.isArray(v)
      : true // an undeclared type is nothing to check against
    if (!ok)
      throw new GuardError(
        400,
        "invalid_input",
        `"${key}" must be ${want === "array" ? "a list" : want === "object" ? "an object" : `a ${want}`}.`
      )
  }
}
