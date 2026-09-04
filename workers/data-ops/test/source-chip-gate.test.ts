// THE SOURCE CHIPS, ON THE LIVE GOOGLE DOORS — the half that was missing.
//
// THE FAILURE THIS LOCKS. The owner unticked Gmail above the assistant's input,
// asked "what is the latest email i got in my primary inbox?", and the assistant
// searched his live mail and answered from it. The chips narrowed the indexed
// CORPUS (`ask_knowledge`) and narrowed nothing else, so twenty live Google
// tools — ten of them WRITES, two of which send mail — sat behind a control that
// looked like it covered them. Green build throughout: no law read the chips
// against the tool catalogue, because until now there was nothing to read.
//
// THREE THINGS ARE CHECKED HERE AND THEY FAIL DIFFERENTLY.
//
//   1. THE DECISION, BY RUNNING IT. `chipRefusal` is called, not read — every
//      Google tool against every chip that could gate it. R22 is why: a
//      `buildBody` that was only ever READ shipped a narrower contract than its
//      door accepted for six weeks under a green build.
//   2. THE WIRING, off `runToolCall`'s own source. A decision nothing consults
//      is a comment. The gate must sit AHEAD of the door and ahead of the repeat
//      cache, and the refusal must come back `ok: false` so the turn stops and
//      explains itself.
//   3. THE COVERAGE, derived from the DOORS rather than from a list. Which
//      services a door really opens is read off its handler's own
//      `accessTokenFor` calls in the content worker — the same census R19/R22/R27
//      stand on — so a Google tool added tomorrow, or one that quietly starts
//      reading a second service, cannot be silently ungated.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  CHIP_SERVICES,
  chipForService,
  googleServiceOfPath,
  servicesForChips,
  SOURCE_CHIPS,
  SOURCE_CHIP_KEYS,
} from "@shared/knowledge-chips"
import { GOOGLE_SERVICES } from "@shared/types"
import { chipRefusal } from "../src/lib/agent"
import { googleServicesOf, TOOL_CATALOG, type AgentTool } from "../src/lib/tools"

const ROOT = join(__dirname, "..", "..", "..")
const AGENT_SRC = readFileSync(join(__dirname, "..", "src", "lib", "agent.ts"), "utf8")

/** Every tool that reaches a live Google service, off the catalogue itself. */
const GOOGLE_TOOLS = TOOL_CATALOG.filter((t) => t.path.startsWith("/api/content/google/"))

/** A GOOGLE DOOR NO CHIP NARROWS, with the reason it does not — data, and
 * rot-checked both ways below so the list can only shrink. */
const UNGATED_GOOGLE_TOOLS: Record<string, string> = {
  list_google_connections:
    "it reads WHICH services are connected and what has been handed over — metadata about the doors themselves, never material read through one. It is also the tool the assistant is told to call FIRST when it is unsure what it can reach, so gating it would make an unticked chip look like a disconnected account, which is a different sentence and a worse one.",
}

describe("the chips gate the live Google doors (the decision, run)", () => {
  it("nothing named is every service, never none", () => {
    // Same sentence as `kindsForChips`, and the same reason: all six chips are on
    // by default, so "nothing named" is what a person who never touched them
    // sends. Reading it as "no service" would switch Google off for everybody.
    expect(servicesForChips(undefined)).toBeNull()
    expect(servicesForChips([])).toBeNull()
    expect(servicesForChips(["not-a-chip"])).toBeNull()
    for (const tool of GOOGLE_TOOLS) {
      expect(chipRefusal(tool, undefined), tool.name).toBeNull()
      expect(chipRefusal(tool, []), tool.name).toBeNull()
    }
  })

  it("every chip on refuses nothing", () => {
    for (const tool of GOOGLE_TOOLS)
      expect(chipRefusal(tool, [...SOURCE_CHIP_KEYS]), tool.name).toBeNull()
  })

  it("unticking a chip refuses every tool on its service — reads and writes alike", () => {
    const others = SOURCE_CHIP_KEYS.filter((k) => k !== "mail")
    const mailTools = GOOGLE_TOOLS.filter((t) => googleServicesOf(t).includes("gmail"))
    // The canary: if this census went blind, "every mail tool is refused" would
    // be vacuously true over an empty list.
    expect(mailTools.length, "the mail census found tools").toBeGreaterThanOrEqual(8)
    expect(mailTools.some((t) => t.write), "and writes among them").toBe(true)
    expect(mailTools.some((t) => !t.write), "and reads among them").toBe(true)
    for (const tool of mailTools) {
      const refusal = chipRefusal(tool, [...others])
      expect(refusal, `${tool.name} must be refused when Gmail is unticked`).toBeTruthy()
      expect(refusal).toContain("Gmail")
      // It must say what to do about it, or the person is left guessing at their
      // own switch — the whole reason this is a refusal and not an omission.
      expect(refusal).toContain("Reading from")
    }
  })

  it("and refuses NOTHING on a service whose chip is still on", () => {
    const withoutMail = SOURCE_CHIP_KEYS.filter((k) => k !== "mail")
    const chatTools = GOOGLE_TOOLS.filter(
      (t) => googleServicesOf(t).length > 0 && !googleServicesOf(t).includes("gmail")
    )
    expect(chatTools.length).toBeGreaterThan(5)
    for (const tool of chatTools) expect(chipRefusal(tool, [...withoutMail]), tool.name).toBeNull()
  })

  it("a door that reads TWO services needs both chips", () => {
    // `google_mail_to_drive` is `/drive/save-mail` and reads somebody's MAIL to
    // write the document. Its path says drive; unticking Gmail must still stop it.
    const tool = TOOL_CATALOG.find((t) => t.name === "google_mail_to_drive") as AgentTool
    expect(tool, "the two-service tool still exists").toBeTruthy()
    expect(googleServicesOf(tool).sort()).toEqual(["drive", "gmail"])
    expect(chipRefusal(tool, SOURCE_CHIP_KEYS.filter((k) => k !== "mail"))).toContain("Gmail")
    expect(chipRefusal(tool, SOURCE_CHIP_KEYS.filter((k) => k !== "drive"))).toContain("Google Drive")
    expect(chipRefusal(tool, [...SOURCE_CHIP_KEYS])).toBeNull()
  })

  it("a chip does not touch the app's own live rows", () => {
    // `query_records` is a question about this database with its own permission
    // at its own door. Silently shrinking it makes a COUNT WRONG rather than a
    // search narrower — see `injectSources`.
    const records = TOOL_CATALOG.find((t) => t.name === "query_records") as AgentTool
    expect(records).toBeTruthy()
    expect(chipRefusal(records, ["mail"])).toBeNull()
    expect(googleServicesOf(records)).toEqual([])
  })
})

describe("the gate is wired ahead of the door (the wiring)", () => {
  const body = (() => {
    const start = AGENT_SRC.indexOf("async function runToolCall(")
    expect(start, "runToolCall is still the one step seam").toBeGreaterThan(0)
    const end = AGENT_SRC.indexOf("\n/**", start)
    return AGENT_SRC.slice(start, end > start ? end : AGENT_SRC.length)
  })()

  it("runToolCall consults the chips", () => {
    expect(body).toContain("chipRefusal(")
  })

  it("…BEFORE it opens the door, and before the repeat cache can answer for it", () => {
    const gate = body.indexOf("chipRefusal(")
    const door = body.indexOf("executeTool(")
    const cache = body.indexOf("ctx.repeats.recall(")
    // `indexOf` returns -1 for a call that is not there, and -1 is less than
    // everything — so an absent gate would pass the ordering below vacuously.
    expect(gate, "the gate is actually in this function").toBeGreaterThan(0)
    expect(door, "the door is still called here").toBeGreaterThan(0)
    expect(cache, "the repeat cache is still here").toBeGreaterThan(0)
    // A door that is asked and then ignored has still been asked; and a tool
    // allowed earlier in a thread must not answer out of a cache after its chip
    // is unticked.
    expect(gate).toBeLessThan(door)
    expect(gate).toBeLessThan(cache)
  })

  it("a chip-blocked call can never become a stored PROPOSAL", () => {
    // THE HOLE A DOOR-LEVEL REFUSAL DOES NOT COVER, and the worst one: a call
    // that CONFIRMS never reaches `runToolCall` in the turn that proposes it.
    // The plan loop stores the proposal server-side and `confirmAndRun` executes
    // it later, from a request that carries no chips at all — nothing persists
    // them. `google_send_mail` always confirms. So it would have been proposed
    // while Gmail was unticked, approved by somebody reading a panel that said
    // nothing about chips, and sent.
    const loop = (() => {
      const start = AGENT_SRC.indexOf("async function runPlanLoop(")
      expect(start, "runPlanLoop is still the plan loop").toBeGreaterThan(0)
      return AGENT_SRC.slice(start)
    })()
    const blocked = loop.indexOf("const blockedByChips")
    const anyConfirm = loop.indexOf("const anyConfirm")
    const proposal = loop.indexOf('status: "proposed"')
    expect(blocked, "the turn is measured against the chips").toBeGreaterThan(0)
    expect(anyConfirm).toBeGreaterThan(0)
    expect(proposal, "the proposal is still stored here").toBeGreaterThan(0)
    // Decided BEFORE the confirm question is asked, and the answer must depend
    // on it — a `blockedByChips` computed and then ignored is the same as none.
    expect(blocked).toBeLessThan(anyConfirm)
    expect(blocked).toBeLessThan(proposal)
    expect(
      loop.slice(anyConfirm, loop.indexOf("\n", anyConfirm + 200)),
      "anyConfirm must read blockedByChips, or a blocked turn still proposes"
    ).toContain("blockedByChips")
  })

  it("…and a call beside it that would have asked for approval is held back, not run", () => {
    // The other half of the same hole. With `anyConfirm` false, the turn falls
    // into the ordinary execution loop — where a confirm-needing call would have
    // run with no panel at all, which is worse than what it replaced.
    const loop = AGENT_SRC.slice(AGENT_SRC.indexOf("async function runPlanLoop("))
    const guard = loop.indexOf("blockedByChips.size && t && !blockedByChips.has(tc.id)")
    expect(guard, "the held-back branch is in the execution loop").toBeGreaterThan(0)
    const branch = loop.slice(guard, guard + 400)
    expect(branch).toContain("requiresConfirm(t, tc.input)")
    expect(branch).toContain("HELD_BACK_BY_CHIPS")
    expect(branch, "and it does NOT reach the door").toContain("continue")
  })

  it("…and a refused call comes back failed, so the turn stops and explains itself", () => {
    // The refusal is written down exactly like a step that ran — see
    // `refuseStep`, which both the door gate and the held-back branch use, so
    // the audit trail cannot depend on which one decided.
    const start = AGENT_SRC.indexOf("async function refuseStep(")
    expect(start, "refuseStep is still the one refusal shape").toBeGreaterThan(0)
    const fn = AGENT_SRC.slice(start, AGENT_SRC.indexOf("\n}", start))
    expect(fn).toContain("ok: false")
    expect(fn, "a reopened chat still shows it in red").toContain('status: "failed"')
    // The model is handed the reason as the tool's own RESULT, so the wrap-up
    // that follows a failed step says WHICH chip, not "something went wrong" —
    // and says it in the reader's own language, which a canned English sentence
    // in this file could not.
    expect(fn).toContain("content: reason")
    expect(fn, "and it is emitted, not swallowed").toContain("step_end")
    // …and the door gate goes through it rather than writing its own.
    expect(body).toContain("refuseStep(ctx, tc, summary, refused)")
  })
})

describe("no Google door can be silently ungated (the coverage)", () => {
  it("the chips name exactly the services the app has", () => {
    expect([...CHIP_SERVICES].sort()).toEqual([...GOOGLE_SERVICES].sort())
    for (const s of GOOGLE_SERVICES) expect(chipForService(s), s).toBeTruthy()
  })

  it("every chip with a live service has a word for the refusal to say", () => {
    const map = /const CHIP_WORD: Record<string, string> = \{([\s\S]*?)\n\}/.exec(AGENT_SRC)
    expect(map, "the word map parsed — this scan has not gone blind").toBeTruthy()
    const named = [...(map as RegExpExecArray)[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1])
    const withService = SOURCE_CHIPS.filter((c) => c.services.length).map((c) => c.key)
    expect(named.sort()).toEqual([...withService].sort())
  })

  it("every Google tool resolves to a chip, or says in writing why it does not", () => {
    expect(GOOGLE_TOOLS.length, "the Google block is still here").toBeGreaterThanOrEqual(20)
    for (const tool of GOOGLE_TOOLS) {
      const services = googleServicesOf(tool)
      if (services.length) {
        expect(
          UNGATED_GOOGLE_TOOLS[tool.name],
          `${tool.name} IS gated, so its exemption is dead — delete it`
        ).toBeUndefined()
        continue
      }
      expect(
        UNGATED_GOOGLE_TOOLS[tool.name],
        `${tool.name} reaches a live Google door and no chip narrows it. Give it a service, or a reasoned exemption.`
      ).toBeTruthy()
    }
  })

  it("and every exemption still names a tool that exists", () => {
    for (const name of Object.keys(UNGATED_GOOGLE_TOOLS)) {
      const tool = GOOGLE_TOOLS.find((t) => t.name === name)
      expect(tool, `${name} is exempted from a gate it no longer needs — delete the line`).toBeTruthy()
      expect(UNGATED_GOOGLE_TOOLS[name].length, `${name}'s reason is a sentence`).toBeGreaterThan(40)
    }
  })

  it("a path segment that is not a service reaches no chip, and is not mistaken for one", () => {
    expect(googleServiceOfPath("/api/content/google/gmail/messages")).toBe("gmail")
    expect(googleServiceOfPath("/api/content/google/calendar/event/transcript")).toBe("calendar")
    expect(googleServiceOfPath("/api/content/google/connections")).toBeNull()
    expect(googleServiceOfPath("/api/content/help/tickets")).toBeNull()
  })
})

describe("what the DOORS say they read (derived, not declared)", () => {
  // The other oracle. `googleServicesOf` reads the tool's own path and its
  // `alsoReads`; this reads the HANDLER, in the content worker, and demands the
  // two agree. A tool cannot be believed about the door it opens.
  const index = readFileSync(join(ROOT, "workers", "content", "src", "index.ts"), "utf8")
  const routes = readFileSync(join(ROOT, "workers", "content", "src", "routes", "google.ts"), "utf8")

  const handlerOf = new Map<string, string>()
  for (const m of index.matchAll(
    /"(GET|POST) (\/api\/content\/google\/[^"]*)":\s*\{\s*\n?\s*handler:\s*(\w+)/g
  ))
    handlerOf.set(`${m[1]} ${m[2]}`, m[3])

  const bodyOf = new Map<string, string>()
  const marks = [...routes.matchAll(/export async function (\w+)\(/g)]
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? (marks[i + 1].index as number) : routes.length
    bodyOf.set(m[1], routes.slice(m.index as number, end))
  })

  /** The services one handler resolves a token for, off its own source. */
  function servicesOfHandler(handler: string): string[] {
    const body = bodyOf.get(handler) ?? ""
    return [
      ...new Set(
        [...body.matchAll(/accessTokenFor\([^)]*?,\s*"(\w+)"\s*\)/g)].map((m) => m[1])
      ),
    ]
  }

  it("the census found the doors — it has not gone blind", () => {
    expect(handlerOf.size, "Google routes").toBeGreaterThanOrEqual(25)
    expect(bodyOf.size, "handler bodies").toBeGreaterThanOrEqual(25)
    // THE CANARY. A regex that matched nothing would make every assertion below
    // vacuously true, so one door with a KNOWN two-service answer is named here:
    // if this comes back with anything but both, the scan is broken, not the app.
    expect(servicesOfHandler("postGoogleDriveSaveMail").sort()).toEqual(["drive", "gmail"])
    expect(servicesOfHandler("getGoogleMail")).toEqual(["gmail"])
  })

  it("every service a Google door opens is covered by its tool's chips", () => {
    for (const tool of GOOGLE_TOOLS) {
      const handler = handlerOf.get(`${tool.method} ${tool.path}`)
      expect(handler, `no route found for ${tool.name} (${tool.method} ${tool.path})`).toBeTruthy()
      const doorSays = servicesOfHandler(handler as string)
      const toolSays = googleServicesOf(tool)
      for (const service of doorSays)
        expect(
          toolSays,
          `${tool.name}'s door opens ${service} and no chip stops it — add it to alsoReads`
        ).toContain(service)
    }
  })

  it("and no tool claims a service its door never opens", () => {
    for (const tool of GOOGLE_TOOLS) {
      const extra = tool.alsoReads ?? []
      if (!extra.length) continue
      const doorSays = servicesOfHandler(handlerOf.get(`${tool.method} ${tool.path}`) as string)
      for (const service of extra)
        expect(
          doorSays,
          `${tool.name} declares reading ${service} and its door no longer does — delete the line`
        ).toContain(service)
    }
  })
})
