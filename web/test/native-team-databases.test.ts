// A DIRECT TEAM DATABASE IS DECLARED TWICE, AND THE TWO MUST AGREE.
//
// The data door reaches a team database directly where the deployment holds a
// binding for it and over Cloudflare's REST door where it does not (`natives` in
// shared/workers/d1-rest.ts). Measured on staging, 24 Aug 2026: the REST door
// costs ~400ms per statement for SQL the database finishes in 0.95ms, so the
// difference between the two paths is most of what a screen spends.
//
// WHY IT TAKES TWO LINES OF CONFIG. The door routes by DATABASE ID — that is
// what `requireMember` puts on the guard — and a D1 binding cannot be asked its
// own id at runtime. So a direct database is a binding (`TEAM_DB_0`) plus a var
// naming what it points at (`TEAM_DB_0_ID`), and the two are written out
// separately by a person.
//
// WHICH IS THE WHOLE REASON THIS FILE EXISTS. The failure it guards against is
// not loud: a var pointing at the WRONG id does not crash, it simply never
// matches the id the guard carries, so every query quietly falls back to the
// REST door and the environment is slow for a reason nothing reports. The
// opposite slip is worse and quieter still — a var pointing at ANOTHER team's
// database id would route this team's reads at a binding for a different
// database. Neither is visible from the outside; both are obvious from the
// config, read together, which is what this does.
//
// It is derived from the configs on disk, so a fourth worker or a second team
// is covered the day it is added, with nothing to remember here.

import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { sourceFiles } from "@shared/rules/source-scan"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")

/** jsonc → JSON. The configs carry `//` comments (and the entries this rule is
 * about are heavily commented), so they cannot be handed to JSON.parse as they
 * are. */
function parseJsonc(raw: string): Record<string, unknown> {
  const stripped = raw.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")
  return JSON.parse(stripped) as Record<string, unknown>
}

type Env = {
  worker: string
  env: string
  bindings: { binding: string; database_id: string }[]
  vars: Record<string, string>
}

/** Every named environment in every worker config, flattened — the top level
 * counts as one, because a config with no `env` block still deploys.
 *
 * Read through `sourceFiles`, like every other law here: a rule that walks the
 * disk itself is one that quietly stops covering a directory the shared walk
 * learns to skip. */
function environments(): Env[] {
  const out: Env[] = []
  for (const file of sourceFiles(join(ROOT, "workers"), {
    extensions: ["wrangler.jsonc"],
    relativeTo: ROOT,
  })) {
    const worker = file.rel.split("/")[1] ?? file.rel
    const cfg = parseJsonc(file.source)
    const collect = (name: string, block: Record<string, unknown>) => {
      out.push({
        worker,
        env: name,
        bindings: (block.d1_databases as Env["bindings"]) ?? [],
        vars: (block.vars as Record<string, string>) ?? {},
      })
    }
    collect("top", cfg)
    for (const [name, block] of Object.entries((cfg.env ?? {}) as Record<string, unknown>))
      collect(name, block as Record<string, unknown>)
  }
  return out
}

const ENVS = environments()

/** `TEAM_DB_<n>` → the id its binding names. */
function directBindings(e: Env): Map<string, string> {
  const out = new Map<string, string>()
  for (const b of e.bindings) if (/^TEAM_DB_\d+$/.test(b.binding)) out.set(b.binding, b.database_id)
  return out
}

/** `TEAM_DB_<n>` → the id its var claims. */
function declaredIds(e: Env): Map<string, string> {
  const out = new Map<string, string>()
  for (const [k, v] of Object.entries(e.vars)) {
    const m = /^(TEAM_DB_\d+)_ID$/.exec(k)
    if (m) out.set(m[1], v)
  }
  return out
}

const where = (e: Env) => `${e.worker} (${e.env})`

describe("a direct team database is declared consistently, or not at all", () => {
  it("there is at least one config to check — this file cannot pass by finding nothing", () => {
    expect(ENVS.length).toBeGreaterThan(0)
  })

  it("every TEAM_DB_<n> binding has a TEAM_DB_<n>_ID var beside it", () => {
    for (const e of ENVS) {
      const ids = declaredIds(e)
      for (const [name] of directBindings(e))
        expect(
          ids.has(name),
          `${where(e)} binds ${name} but never says which database it is. The data door ` +
            `routes by id, so an unnamed binding is one nothing can ever route to — every ` +
            `read falls back to the REST door and the environment is slow for a reason ` +
            `nothing reports. Add "${name}_ID" to that environment's vars.`
        ).toBe(true)
    }
  })

  it("…and every TEAM_DB_<n>_ID var has the binding it names", () => {
    for (const e of ENVS) {
      const bindings = directBindings(e)
      for (const [name] of declaredIds(e))
        expect(
          bindings.has(name),
          `${where(e)} declares ${name}_ID but binds no ${name}. The var alone reaches ` +
            `nothing; it is a promise of a direct path that does not exist.`
        ).toBe(true)
    }
  })

  it("the two agree about WHICH database — the slip that would read another team's rows", () => {
    for (const e of ENVS) {
      const ids = declaredIds(e)
      for (const [name, bound] of directBindings(e)) {
        const declared = ids.get(name)
        if (declared === undefined) continue // named by the check above
        expect(
          declared,
          `${where(e)}: ${name} is bound to ${bound} but ${name}_ID says ${declared}. ` +
            `These must be the same database. If the var names ANOTHER team's database, ` +
            `that team's id routes this team's reads at the wrong binding — which no test ` +
            `outside this one would notice, because both databases answer.`
        ).toBe(bound)
      }
    }
  })

  it("a direct binding never points at a CORE database", () => {
    // The core database is already bound as `DB` and is reached natively
    // everywhere. Naming it here as well would put the global database behind
    // the per-team routing, where a team id would decide when to read it.
    for (const e of ENVS) {
      const core = e.bindings.find((b) => b.binding === "DB")?.database_id
      if (!core) continue
      for (const [name, bound] of directBindings(e))
        expect(
          bound,
          `${where(e)}: ${name} points at the CORE database. Team routing must never ` +
            `resolve to the global one.`
        ).not.toBe(core)
    }
  })

  it("no two direct bindings in one environment name the same database", () => {
    for (const e of ENVS) {
      const seen = new Map<string, string>()
      for (const [name, id] of directBindings(e)) {
        const first = seen.get(id)
        expect(
          first,
          `${where(e)}: ${name} and ${first} both point at ${id}. The door keys by id, so ` +
            `one of them is unreachable and the duplicate is a copy-paste that has not ` +
            `been finished.`
        ).toBeUndefined()
        seen.set(id, name)
      }
    }
  })
})
