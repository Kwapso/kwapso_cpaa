// R47 — EVERY MODULE A PERSON CAN SEE, THE ASSISTANT CAN ANSWER ABOUT; AND WHAT
// IS NOT IN THE CORPUS SAYS WHY.
//
// The owner's sentence, 1 Sep 2026: anything he can see in the app, the
// knowledge base should be able to see. He proved it false the way he proves
// everything — he asked it something. "What is Alex's full name?" was
// unanswerable, and NOT because retrieval failed: nothing anywhere in the base
// said who his own colleagues are. `staff_profiles` carries a `user_id` and no
// name column at all, and the names live in the GLOBAL core database, so no
// table the sweep could reach had ever held the answer.
//
// TWO CLAUSES, BECAUSE ONE WAS MEASURED AND FOUND TOOTHLESS. The first draft of
// this law asked only "is this module reachable by the assistant at all", and
// the census came back 21 of 22 green — every module already had a list tool.
// That is exactly why the failure was invisible: a tool answers when the model
// knows to call it, and a person asking a vague question reaches the CORPUS. So
// the law separates the two, and makes a corpus gap a written decision instead
// of an accident.
//
// THE MONEY IS THE CASE THAT SETTLES THE SHAPE. Internal rates and the margin
// are reachable by tool, on the doors R24 already fences — and they must NEVER
// be in the corpus, because the corpus has exactly one gate (`knowledge:read`)
// and no way to subtract a caller's denied modules the way the activity feed
// does (R18). A law that only asked "is it reachable" would have passed that in
// silence. A law that demanded a kind per module would have demanded the breach.
// Written down, it is the true sentence, and it is the owner's to read:
// reachable, but only by the people who could already see it.
//
// NOTHING HAND-LISTED. The modules come from the permission matrix, the kinds
// from the sweep, the tools from the agent's own catalogue, and each tool's gate
// from the source of the door it forwards to — the same door census R19, R22 and
// R27 stand on, which is why this file sits beside them.

import { describe, expect, it } from "vitest"

import { ASSISTANT_BLIND_MODULES, ACTIVITY_GATE_MAP, CORPUS_EXEMPT } from "@shared/rules/registry"
import { TEAM_MODULES, offeredRights } from "@shared/team-modules"
import { QUERY_MODULES } from "@shared/workers/query-grammar"
import { INGEST_KINDS } from "../../content/src/lib/knowledge-ingest"
import { TOOL_CATALOG } from "../../data-ops/src/lib/tools"
import { DOORS, handlerBody, key } from "./door-census"

/* ------------------------------- the census -------------------------------- */

/** Which permission module a TABLE belongs to — read off the two maps that
 * already answer that question for other laws, never a third copy. */
const TABLE_MODULE: Record<string, string> = { ...ACTIVITY_GATE_MAP }
for (const m of Object.values(QUERY_MODULES)) TABLE_MODULE[m.table] ??= m.module

/** Every module a person can SEE — the matrix's own rows, narrowed to the ones
 * that offer a `read` right at all. A module whose only right is `create`
 * (`google_mail`: "kwapso may send mail on this person's behalf") or `edit`
 * (`teams`) is a switch, not a sight, and there is nothing for the assistant to
 * be able to answer about. */
const VISIBLE = TEAM_MODULES.filter((m) => (offeredRights(m) as readonly string[]).includes("read"))

/** Modules with a knowledge kind mirroring them: the kind's own `table` through
 * the map above, or the `modules` a kind DECLARES when its text carries more
 * than one module's material (only `person` does — a member row joined to the
 * staff profile and certificates). */
const kindsByModule = new Map<string, string[]>()
for (const k of INGEST_KINDS)
  for (const mod of k.modules ?? [TABLE_MODULE[k.table]].filter(Boolean))
    kindsByModule.set(mod, [...(kindsByModule.get(mod) ?? []), k.kind])

/** Modules with a gated READ tool on the agent's own catalogue.
 *
 * TWO SOURCES, and the first is not a shortcut. `query_records` and
 * `describe_module` are ONE door that gates on whichever module the caller
 * names, so the grammar's own table is the honest list of what that pair
 * reaches — reading the generic handler's source would find no module name at
 * all. Every other read tool is resolved to its door in that worker's own
 * switchboard, and the module comes off the handler's own gate pair, the same
 * `"<module>", "<right>"` literal R36's census reads. */
const toolsByModule = new Map<string, string[]>()
const addTool = (mod: string, tool: string) =>
  toolsByModule.set(mod, [...(toolsByModule.get(mod) ?? []), tool])
for (const mod of Object.values(QUERY_MODULES)) addTool(mod.module, "query_records")
const doorByKey = new Map(DOORS.map((d) => [key(d), d]))
const unresolved: string[] = []
for (const tool of TOOL_CATALOG) {
  if (tool.write) continue
  const door = doorByKey.get(`${tool.method} ${tool.path}`)
  // A read tool whose door is not in the census is a SELF tool (the import
  // runner) or a door on a worker this census does not walk. Collected rather
  // than ignored, and asserted below to be a set nobody grew by accident.
  if (!door) {
    unresolved.push(tool.name)
    continue
  }
  const flat = handlerBody(door).replace(/\s+/g, " ")
  for (const m of flat.matchAll(/"([a-z_]+)"\s*,\s*"read"/g)) addTool(m[1], tool.name)
}

describe("assistant-coverage (R47): a person's sight and the assistant's reach", () => {
  it("the census found something — a blind check passes like a clean one", () => {
    expect(VISIBLE.length, "no module offers a read right, which cannot be true").toBeGreaterThan(15)
    expect(kindsByModule.size, "no knowledge kind resolved to a module").toBeGreaterThan(8)
    expect(toolsByModule.size, "no read tool resolved to a module").toBeGreaterThan(10)
    expect(DOORS.length, "the door census is empty").toBeGreaterThan(100)
  })

  it("every module a person can see, the assistant can answer about", () => {
    const blind: string[] = []
    for (const mod of VISIBLE) {
      const reachable = kindsByModule.has(mod) || toolsByModule.has(mod)
      if (reachable) continue
      if (Object.prototype.hasOwnProperty.call(ASSISTANT_BLIND_MODULES, mod)) continue
      blind.push(mod)
    }
    expect(
      blind,
      `these modules are on the permission matrix — a person can be granted them and see their screens — and the assistant can neither search them nor call a tool on them: ${blind.join(", ")}. Give each one a knowledge kind, a gated read tool, or a reasoned ASSISTANT_BLIND_MODULES line.`
    ).toEqual([])
  })

  it("a module reachable only by TOOL says why it is not in the corpus", () => {
    const undeclared: string[] = []
    for (const mod of VISIBLE) {
      if (kindsByModule.has(mod)) continue
      if (!toolsByModule.has(mod)) continue // the clause above owns this case
      if (Object.prototype.hasOwnProperty.call(CORPUS_EXEMPT, mod)) continue
      undeclared.push(mod)
    }
    expect(
      undeclared,
      `these modules are reachable by a tool but nothing of theirs is in the searchable corpus, and no line says why: ${undeclared.join(", ")}. A tool answers when the model knows to call it; a person asking a vague question reaches the corpus. So either give it a kind, or write down the reason in CORPUS_EXEMPT — in words the owner can check, not ours.`
    ).toEqual([])
  })

  /* ------------------------------ the rot checks --------------------------- */

  it("every exemption is still an exemption — both lists can only shrink", () => {
    for (const [mod, why] of Object.entries(ASSISTANT_BLIND_MODULES)) {
      expect(
        (VISIBLE as readonly string[]).includes(mod),
        `ASSISTANT_BLIND_MODULES names "${mod}", which is not a module offering a read right — delete the line`
      ).toBe(true)
      expect(
        kindsByModule.has(mod) || toolsByModule.has(mod),
        `ASSISTANT_BLIND_MODULES excuses "${mod}", but the assistant NOW reaches it (${[
          ...(kindsByModule.get(mod) ?? []),
          ...(toolsByModule.get(mod) ?? []),
        ].join(", ")}) — delete the line, the module is covered`
      ).toBe(false)
      expect(why.length, `the reason for "${mod}" is too short to be one`).toBeGreaterThan(80)
    }
    for (const [mod, why] of Object.entries(CORPUS_EXEMPT)) {
      expect(
        (VISIBLE as readonly string[]).includes(mod),
        `CORPUS_EXEMPT names "${mod}", which is not a module offering a read right — delete the line`
      ).toBe(true)
      expect(
        kindsByModule.has(mod),
        `CORPUS_EXEMPT excuses "${mod}" from the corpus, but ${(kindsByModule.get(mod) ?? []).join(
          ", "
        )} now files it — delete the line`
      ).toBe(false)
      expect(why.length, `the reason for "${mod}" is too short to be one`).toBeGreaterThan(80)
    }
  })

  it("no read tool resolves to a door this census cannot see", () => {
    // DERIVED, and pinned to the ONE shape that is legitimately unresolvable: a
    // `SELF` tool runs inside data-ops rather than forwarding to a door, so it
    // has no gate pair to read. Anything else appearing here means a read tool
    // now points at a path no switchboard declares, and the census would be
    // quietly crediting that module to nobody.
    const selfTools = new Set(TOOL_CATALOG.filter((t) => t.binding === "SELF").map((t) => t.name))
    expect(
      unresolved.filter((n) => !selfTools.has(n)),
      `these read tools name a door no worker's switchboard declares, so this census cannot tell which module they reach: ${unresolved.join(", ")}`
    ).toEqual([])
  })

  /* -------------------- and the kind declarations are honest ---------------- */

  it("a kind's declared modules are real, and it really reads what it claims", () => {
    const sweepSource = INGEST_KINDS
    for (const k of sweepSource) {
      for (const mod of k.modules ?? [])
        expect(
          (TEAM_MODULES as readonly string[]).includes(mod),
          `the "${k.kind}" kind claims module "${mod}", which is not on the permission matrix`
        ).toBe(true)
      // A kind with no declared modules must still resolve through its table,
      // or it is invisible to this census and its module reads as uncovered.
      if (!k.modules)
        expect(
          TABLE_MODULE[k.table],
          `the "${k.kind}" kind mirrors "${k.table}", which maps to no permission module — add it to ACTIVITY_GATE_MAP or declare the kind's own modules`
        ).toBeTruthy()
    }
  })
})
