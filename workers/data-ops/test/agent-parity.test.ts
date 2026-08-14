// Law R9 — agent-app parity (`agent-app-parity`). The agent's system prompt must
// carry a capability brief GENERATED from the import/export catalog, plus the
// glossary — read straight off the same code the screens render from. If a target,
// sample, export or product term exists in the app but not in the agent's head,
// this test goes red: the agent can never again tell a user a capability doesn't
// exist while the UI shows it (the "no bulk import for dropdown values" bug class).

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { GLOSSARY } from "@shared/glossary"
import { capabilityBrief } from "../src/lib/app-brief"
import { DROPDOWN_ORDER_RULE, KNOWLEDGE_CITATION_RULE, SYSTEM } from "../src/lib/agent"
import { TARGETS } from "../src/lib/targets"
import { sharedByName } from "@shared/workers/tool-catalog"
import {
  AGENT_BLOCKS,
  BLOCK_FENCE_PREFIX,
  BLOCK_KINDS,
  BLOCK_LIMITS,
  blockBrief,
  parseAgentBlock,
} from "@shared/agent-blocks"

const ROOT = join(__dirname, "..", "..", "..")

describe("agent-app parity (Law R9): the agent knows what the app can do", () => {
  it("the system prompt carries the generated capability brief", () => {
    expect(SYSTEM).toContain(capabilityBrief())
  })

  it("every import target is in the agent's head, by its exact display name", () => {
    for (const t of Object.values(TARGETS)) {
      expect(SYSTEM, `agent must know the "${t.displayName}" import`).toContain(t.displayName)
    }
  })

  it("the agent knows about sample files and the Import screen", () => {
    expect(SYSTEM).toMatch(/SAMPLE file/i)
    expect(SYSTEM).toContain("Import screen")
  })

  it("every exportable table is presented as exportable", () => {
    const brief = capabilityBrief()
    for (const t of Object.values(TARGETS)) {
      if (!t.exportPath) continue
      const line = brief.split("\n").find((l) => l.startsWith(`- ${t.displayName}`))
      expect(line, `brief line for ${t.displayName}`).toBeDefined()
      expect(line, `${t.displayName} must be presented as exportable`).toContain("EXPORT")
    }
  })

  it("every glossary term rides in the prompt (one dictionary — Law R6 meets R9)", () => {
    for (const g of Object.values(GLOSSARY)) {
      expect(SYSTEM, `glossary term "${g.term}"`).toContain(g.term)
    }
  })

  // R9, the vocabulary half: a dropdown write is gated on the option EXISTING, so
  // "create X and move everything onto it" is two calls whose ORDER is not
  // optional — create_dropdown_value first, the write second, same turn. The
  // model reads two surfaces and only obeys what BOTH say, so both are asserted:
  // drop it from either and a perfectly-planned turn ends having changed nothing
  // (the door refuses the write, the user has to say "go ahead" for a second turn).
  it("both surfaces state the dropdown ordering — create first, write second, same turn", () => {
    const create = sharedByName("create_dropdown_value")
    expect(create, "the create_dropdown_value tool must exist").toBeDefined()
    expect(SYSTEM, "the system rule wall must carry the dropdown-ordering rule").toContain(DROPDOWN_ORDER_RULE)

    for (const [surface, text] of [
      ["the tool's own description", create!.summary],
      ["the system rule wall", DROPDOWN_ORDER_RULE],
    ] as const) {
      const t = text.toLowerCase()
      expect(t, `${surface} must say the option is never invented`).toMatch(/never invents? (an|the) option/)
      expect(t, `${surface} must say both calls ride ONE turn`).toMatch(/(same|one) turn/)
      // The ordering is the whole point, so it is asserted structurally: whatever
      // is named FIRST must be the create call, and what follows must be the write.
      const at = t.indexOf("first")
      expect(at, `${surface} must name a first step`).toBeGreaterThan(-1)
      expect(
        t.slice(0, at),
        `${surface} states the order backwards — the CREATE call is the one that goes first`
      ).toMatch(/create_dropdown_value|call this|create the dropdown value/)
      expect(t.slice(at), `${surface} must name the write as the second step`).toMatch(/write|rows/)
      expect(t.slice(at), `${surface} must mark the write as the SECOND call`).toMatch(/second|then/)
    }
    // The rule is worthless if it doesn't name the tool the model must reach for.
    expect(DROPDOWN_ORDER_RULE).toContain("create_dropdown_value")
  })

  // R9 meets R23. The knowledge door makes a sourceless answer impossible to
  // RECEIVE — `found`, `passages` and `citations` are one decision, so an empty
  // result arrives with no passages and a sentence saying so. This is the other
  // half: what the model must DO with that. Both surfaces again, because the
  // model only obeys what both agree on — and because the failure this prevents
  // (answering a client's question from training data, confidently, with no
  // source) is the one the whole module exists for.
  it("both surfaces say an answer names its sources, and silence stays silence", () => {
    const ask = sharedByName("ask_knowledge")
    expect(ask, "the ask_knowledge tool must exist").toBeDefined()
    expect(SYSTEM, "the system rule wall must carry the citation rule").toContain(KNOWLEDGE_CITATION_RULE)

    for (const [surface, text] of [
      ["the tool's own description", ask!.summary],
      ["the system rule wall", KNOWLEDGE_CITATION_RULE],
    ] as const) {
      const t = text.toLowerCase()
      expect(t, `${surface} must say the answer comes from the passages, not from memory`).toMatch(
        /from memory/
      )
      expect(t, `${surface} must name what to do when there is nothing: say so`).toMatch(/say so/)
      expect(t, `${surface} must tie the refusal to the door's own flag`).toMatch(/found/)
    }
    // And it must name the tool the model has to reach for — a rule about
    // citations that never says how to get one is a rule about nothing.
    expect(KNOWLEDGE_CITATION_RULE).toContain("ask_knowledge")
  })

  /* ------------------------- R9, the DRAWING half ------------------------- */
  //
  // The assistant can now emit VISUAL BLOCKS — a fenced block the app renders as a
  // real component instead of a paragraph of figures. That is a capability, so it
  // is held to R9's own sentence: the prompt is GENERATED from the catalogue, so it
  // can never advertise a shape the renderer cannot draw, or hide one it can.
  //
  // Three surfaces have to agree and none of them is hand-listed here: the
  // CATALOGUE (shared/agent-blocks.ts), the PROMPT (scraped back out of the
  // generated brief, so a kind that never made it into the text is caught), and the
  // RENDERER (read off disk in web/, because the model's promise is only worth what
  // the browser actually paints).

  it("the system prompt carries the generated visual-block brief", () => {
    expect(SYSTEM).toContain(blockBrief())
  })

  it("the prompt advertises EXACTLY the kinds the catalogue declares", () => {
    // Derived from the brief's own fences — the same thing the model reads and the
    // same pattern the renderer matches on the way back in.
    const advertised = [
      ...blockBrief().matchAll(new RegExp("```" + BLOCK_FENCE_PREFIX + "([a-z]+)", "g")),
    ].map((m) => m[1])
    expect(new Set(advertised), "a kind is advertised that the catalogue doesn't declare, or vice versa").toEqual(
      new Set(BLOCK_KINDS)
    )
    // The cap the parser REFUSES on has to be the cap the prompt states, or the
    // model is told one number and judged by another.
    expect(blockBrief(), "the brief must state the row cap the parser enforces").toContain(
      String(BLOCK_LIMITS.rows)
    )
  })

  // Proved by RUNNING the parser, never by reading the shape — the lesson R22 paid
  // for. An example that drifted from its own validator would otherwise teach the
  // model, in the prompt, to emit exactly the thing the app refuses to draw.
  it("every example in the prompt actually parses", () => {
    for (const b of Object.values(AGENT_BLOCKS)) {
      const parsed = parseAgentBlock(b.kind, b.example)
      expect(parsed, `the ${b.kind} example the prompt teaches must parse`).not.toBeNull()
      expect(parsed!.kind).toBe(b.kind)
    }
  })

  it("the renderer draws exactly those kinds — read off disk, not asserted from here", () => {
    const src = readFileSync(join(ROOT, "web", "components", "agent-blocks.tsx"), "utf8")
    // The renderer map is one object literal keyed by kind (its TYPE is a mapped
    // type over AgentBlockKind, so tsc refuses a missing or extra key too — this
    // reads the same fact off the file so R9's own check states it).
    const map = /const BLOCK_RENDERERS[\s\S]*?=\s*\{([\s\S]*?)\n\}/.exec(src)
    expect(map, "web/components/agent-blocks.tsx must export one BLOCK_RENDERERS map").not.toBeNull()
    const drawn = [...map![1].matchAll(/^\s{2}([a-z]+):/gm)].map((m) => m[1])
    expect(new Set(drawn), "the prompt offers a block the renderer cannot draw, or hides one it can").toEqual(
      new Set(BLOCK_KINDS)
    )
  })
})
