// THE DRAFT IS NOT THE RECORD — proved against the real schema.
//
// Every assertion in this file reduces to one sentence, and it is the sentence
// both respondents were asked to repeat back before this was built: with eleven
// proposed steps sitting in the system and Alex having touched nothing, what is
// on the client's record? NOTHING.
//
// That is easy to say and easy to ship wrong, because a draft normalised into
// `process_steps` looks completely healthy in every screenshot until the day a
// savings figure is computed off it and a client is quoted a number derived from
// words a model put in their mouth. So this suite counts ROWS IN THE REAL TABLE
// after each act:
//
//   1 · creating a draft writes NOTHING to process_steps;
//   2 · applying writes ONLY the steps that survived the review;
//   3 · each KIND is a separate decision — accept the steps, reject the tools;
//   4 · a SECOND call about the same process REVISES a step rather than doubling
//       the map (and a zero it did not hear is a question, not an edit);
//   5 · discarding writes nothing at all;
//   6 · a draft on another client's process is refused at the fence;
//   7 · applying TWICE does not double the steps.
//
// Real migrations, real SQLite, real lib functions — the same harness the rest
// of the spine suites use, so a pass here is a statement about production.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import type { AccountScope } from "@shared/workers/account-scope"
import type { DraftStep, ProcessDraftPayload } from "@shared/process-drafts"
import { SAVINGS_CAPTION } from "@shared/workers/savings"
import {
  applyDraft,
  createDraft,
  discardDraft,
  draftContext,
  getDraft,
  listDrafts,
} from "../src/lib/process-drafts"
import { readProposal } from "../src/lib/process-extract"
import { addStep, listProcessSteps } from "../src/lib/processes"
import { buildSpineDb, IDS } from "./spine-harness"

const cfg = { accountId: "a", apiToken: "t" } as never
const actor = { id: IDS.staffUser, email: "staff@kwapso.app", name: "Staff" }
const guard = { userId: IDS.staffUser, teamId: IDS.team, roleId: IDS.adminRole, databaseId: "db_team" }
const staff = { kind: "staff" } as const

/** A CLIENT LOGIN STANDING SOMEWHERE ELSE. Not a caller who lacks a right —
 * their role holds every one (the harness grants both roles everything) — but a
 * caller standing at Delaval reaching for Bergman's map. If they get through,
 * the fence itself is broken and no permission would have saved anybody. */
const burglar: AccountScope = {
  kind: "portal",
  personAccountId: IDS.burglarPerson,
  appRestriction: null,
  appIds: null,
  roots: [IDS.burglarAccount],
  currentAccountId: IDS.burglarAccount,
  accountIds: [IDS.burglarAccount, IDS.burglarPerson],
}

/** The client's own roles and tools — what a proposal's role and tool names are
 * matched AGAINST. Written straight in: they are the client-organisation
 * module's doors, and this is the extraction's suite. */
function seedOrg(): void {
  const db = holder.db as DatabaseSync
  db.exec(`
    INSERT INTO client_roles (id, account_id, name, cents_per_hour, created_at)
      VALUES ('ROLE_CLERK', '${IDS.victimAccount}', 'Dispatch clerk', 4200, '2026-01-01T00:00:00.000Z'),
             ('ROLE_ADJ',   '${IDS.victimAccount}', 'Adjuster',       7500, '2026-01-01T00:00:00.000Z');
    INSERT INTO client_tools (id, account_id, name, mark, created_at)
      VALUES ('TOOL_SHEET', '${IDS.victimAccount}', 'The spreadsheet', NULL, '2026-01-01T00:00:00.000Z');
  `)
}

/** How many steps the client's record actually holds. THE number this suite is
 * about: it is read straight off the table rather than through a lib function,
 * because a lib function is exactly the thing that could be wrong. */
function stepRows(): number {
  const db = holder.db as DatabaseSync
  const row = db.prepare("SELECT COUNT(*) AS n FROM process_steps").get() as { n: number }
  return Number(row.n)
}

/** One proposed step, with the fields a caller cares about overridden. */
function step(over: Partial<DraftStep> & { key: string; name: string }): DraftStep {
  return {
    description: null,
    position: 1,
    secondsPerRun: 600,
    runsPerPeriod: 4,
    frequencyPeriod: "week",
    roleKey: null,
    toolKey: null,
    revisesStepId: null,
    askAbout: null,
    ...over,
  }
}

/** A proposal of three steps, the middle one done by the dispatch clerk in the
 * spreadsheet — so a review can accept the steps and reject the tools and there
 * is something to see either way. */
function threeSteps(): ProcessDraftPayload {
  return {
    processName: "Approving a supplier invoice",
    summary: "How Bergman gets an invoice from the post to paid.",
    steps: [
      step({ key: "s1", name: "Open the post", position: 1 }),
      step({
        key: "s2",
        // DELIBERATELY NOT the name of the step the harness already seeds. The
        // proof below is that a REJECTED proposal leaves no row, and a name
        // collision with an existing step would make that assertion pass (or
        // fail) for a reason that has nothing to do with the draft.
        name: "Match it to the purchase order",
        position: 2,
        secondsPerRun: 2400,
        runsPerPeriod: 20,
        frequencyPeriod: "month",
        roleKey: "m1",
        toolKey: "m1",
      }),
      step({ key: "s3", name: "Send it for approval", position: 3 }),
    ],
    roles: [{ key: "m1", said: "dispatch clerk", matchedId: "ROLE_CLERK", matchedName: "Dispatch clerk" }],
    tools: [{ key: "m1", said: "the spreadsheet", matchedId: "TOOL_SHEET", matchedName: "The spreadsheet" }],
  }
}

/** Keep everything — the ordinary review, where the reviewer agreed with all of it. */
const keepAll = { keepSteps: ["s1", "s2", "s3"], keepRoles: ["m1"], keepTools: ["m1"] }

beforeEach(() => {
  holder.db = buildSpineDb()
  seedOrg()
})

describe("the draft is not the record", () => {
  it("creating a draft writes NOTHING to process_steps", async () => {
    const before = stepRows()
    const id = await createDraft(cfg, guard, staff, actor, {
      processId: IDS.victimProcess,
      payload: threeSteps(),
      sourceText: "Alex: talk me through how an invoice gets paid…",
    })

    // THE COMPREHENSION CHECK, as a test. Three steps proposed, nobody has
    // touched anything: the client's record holds exactly what it held before.
    expect(stepRows()).toBe(before)

    // …and the proposal is real, sitting in its own table, readable.
    const detail = await getDraft(cfg, guard, staff, id)
    expect(detail.draft.status).toBe("proposed")
    expect(detail.payload.steps.map((s) => s.name)).toEqual([
      "Open the post",
      "Match it to the purchase order",
      "Send it for approval",
    ])
    // R25: the sentence the durations must be quoted with rides WITH them.
    expect(detail.savingsCaption).toBe(SAVINGS_CAPTION)
  })

  it("the draft is filed against the PROCESS's client, never against a request", async () => {
    const id = await createDraft(cfg, guard, staff, actor, {
      processId: IDS.victimProcess,
      payload: threeSteps(),
      sourceMeetingId: "MTG_1",
    })
    const detail = await getDraft(cfg, guard, staff, id)
    expect(detail.draft.accountId).toBe(IDS.victimAccount)
    expect(detail.draft.appId).toBe(IDS.victimApp)
    expect(detail.draft.processId).toBe(IDS.victimProcess)
    expect(detail.draft.sourceMeetingId).toBe("MTG_1")
    // The list agrees, counts the payload in SQL, and its total is the count OF
    // the rows it returned (R16).
    //
    // FOUND BY ROW RATHER THAN BY BEING THE ONLY ONE. The fixture seeds a draft
    // of its own so the leak suite has a real row to attack, so a bare
    // `total === 1` here was asserting "nothing else in the whole harness has a
    // draft" — a fact about the fixtures rather than about this door.
    const list = await listDrafts(cfg, guard, staff, { processId: IDS.victimProcess })
    expect(list.total).toBe(list.rows.length)
    const mine = list.rows.find((r) => r.id === id)
    expect(mine, "the draft just created is in its own process's list").toBeTruthy()
    expect(mine?.stepCount).toBe(3)
    expect(mine?.roleCount).toBe(1)
    expect(mine?.toolCount).toBe(1)
    expect(mine?.processName).toBe("Bergman invoice approval")
  })
})

describe("applying writes only what survived the review", () => {
  it("only the accepted steps land, and the rejected one is nowhere", async () => {
    const before = stepRows()
    const id = await createDraft(cfg, guard, staff, actor, {
      processId: IDS.victimProcess,
      payload: threeSteps(),
      sourceText: "…",
    })

    // The reviewer kept two of the three. This is the whole feature.
    const result = await applyDraft(cfg, guard, staff, actor, id, {
      keepSteps: ["s1", "s3"],
      keepRoles: ["m1"],
      keepTools: ["m1"],
    })
    expect(result).toEqual({ applied: true, stepsAdded: 2, stepsRevised: 0, skipped: 0 })
    expect(stepRows()).toBe(before + 2)

    const names = (await listProcessSteps(cfg, guard, staff, IDS.victimProcess)).map((s) => s.name)
    expect(names).toContain("Open the post")
    expect(names).toContain("Send it for approval")
    // THE DROPPED ONE IS NOT ON THE RECORD — not archived, not removed, not
    // there. A step nobody agreed to has no row.
    expect(names).not.toContain("Match it to the purchase order")

    // …and the draft says it has been applied, so nothing offers it again.
    expect((await getDraft(cfg, guard, staff, id)).draft.status).toBe("applied")
  })

  it("keeping NO steps writes nothing at all, and still closes the draft", async () => {
    const before = stepRows()
    const id = await createDraft(cfg, guard, staff, actor, {
      processId: IDS.victimProcess,
      payload: threeSteps(),
      sourceText: "…",
    })
    const result = await applyDraft(cfg, guard, staff, actor, id, {
      keepSteps: [],
      keepRoles: [],
      keepTools: [],
    })
    expect(result.applied).toBe(true)
    expect(result.stepsAdded).toBe(0)
    expect(stepRows()).toBe(before)
  })

  it("each KIND is its own decision — accept the steps, reject the tools", async () => {
    const id = await createDraft(cfg, guard, staff, actor, {
      processId: IDS.victimProcess,
      payload: threeSteps(),
      sourceText: "…",
    })
    // Both respondents' words: "you can accept the steps and reject the tools".
    await applyDraft(cfg, guard, staff, actor, id, {
      keepSteps: ["s1", "s2", "s3"],
      keepRoles: ["m1"],
      keepTools: [],
    })
    const written = (await listProcessSteps(cfg, guard, staff, IDS.victimProcess)).find(
      (s) => s.name === "Match it to the purchase order"
    )
    expect(written).toBeTruthy()
    // The ROLE was accepted, so the step carries it — and with it the hourly cost
    // frozen at write time, which is what turns minutes into money.
    expect(written?.roleId).toBe("ROLE_CLERK")
    expect(written?.roleCentsPerHour).toBe(4200)
    // The TOOL was rejected, so nothing was attached. Rejecting a proposal is
    // declining to take the model's word for something.
    expect(written?.toolId).toBeNull()
  })

  it("a role the reviewer accepted but nobody has on their record is not attached", async () => {
    const payload = threeSteps()
    payload.roles = [{ key: "m1", said: "the night porter", matchedId: null, matchedName: null }]
    const id = await createDraft(cfg, guard, staff, actor, { processId: IDS.victimProcess, payload })
    await applyDraft(cfg, guard, staff, actor, id, keepAll)
    const written = (await listProcessSteps(cfg, guard, staff, IDS.victimProcess)).find(
      (s) => s.name === "Match it to the purchase order"
    )
    // The step lands; the role does not, because inventing a client's role is not
    // this module's business and `addStep` would refuse an id that is not theirs.
    expect(written).toBeTruthy()
    expect(written?.roleId).toBeNull()
  })
})

describe("a second call proposes CHANGES, never a second map", () => {
  it("a revision edits the step it names instead of adding another", async () => {
    const before = stepRows()
    // The map already holds one step (the harness seeds it). A second call talks
    // about that same step: it is now faster.
    const payload: ProcessDraftPayload = {
      processName: null,
      summary: null,
      steps: [
        step({
          key: "s1",
          name: "Check it against the order",
          secondsPerRun: 900,
          runsPerPeriod: 20,
          frequencyPeriod: "month",
          revisesStepId: IDS.victimStep,
        }),
      ],
      roles: [],
      tools: [],
    }
    const id = await createDraft(cfg, guard, staff, actor, { processId: IDS.victimProcess, payload })
    const result = await applyDraft(cfg, guard, staff, actor, id, {
      keepSteps: ["s1"],
      keepRoles: [],
      keepTools: [],
    })

    expect(result).toEqual({ applied: true, stepsAdded: 0, stepsRevised: 1, skipped: 0 })
    // NO NEW ROW. This is ruling 5, and getting it wrong is a duplicated map.
    expect(stepRows()).toBe(before)
    const steps = await listProcessSteps(cfg, guard, staff, IDS.victimProcess)
    expect(steps).toHaveLength(1)
    expect(steps[0].secondsPerRun).toBe(900)

    // …AND IT IS DATED. An edit through the map's own door writes the revision
    // the history slider reads — which is the whole reason applying goes through
    // `updateStep` rather than through an UPDATE of this module's own.
    const db = holder.db as DatabaseSync
    const revisions = db
      .prepare("SELECT COUNT(*) AS n FROM process_step_revisions WHERE step_key = 'SK_VICTIM'")
      .get() as { n: number }
    expect(Number(revisions.n)).toBeGreaterThan(0)
  })

  it("a duration the call did not settle is a QUESTION, and never overwrites one that was agreed", async () => {
    const payload: ProcessDraftPayload = {
      processName: null,
      summary: null,
      steps: [
        step({
          key: "s1",
          name: "Check it against the order",
          // The extraction heard the step described and heard no timing at all.
          secondsPerRun: 0,
          runsPerPeriod: 0,
          revisesStepId: IDS.victimStep,
          askAbout: "Nobody said how long this takes.",
        }),
      ],
      roles: [],
      tools: [],
    }
    const id = await createDraft(cfg, guard, staff, actor, { processId: IDS.victimProcess, payload })
    await applyDraft(cfg, guard, staff, actor, id, { keepSteps: ["s1"], keepRoles: [], keepTools: [] })

    const steps = await listProcessSteps(cfg, guard, staff, IDS.victimProcess)
    // The agreed 40 minutes survives. A zero the conversation never contained
    // must not become a duration a client is later quoted from.
    expect(steps[0].secondsPerRun).toBe(2400)
    expect(steps[0].runsPerPeriod).toBe(20)
  })

  it("a revision whose step has moved to an older version is SKIPPED, never forced", async () => {
    const payload: ProcessDraftPayload = {
      processName: null,
      summary: null,
      steps: [step({ key: "s1", name: "A step that is not there", revisesStepId: "PS_NOT_HERE" })],
      roles: [],
      tools: [],
    }
    const before = stepRows()
    const id = await createDraft(cfg, guard, staff, actor, { processId: IDS.victimProcess, payload })
    const result = await applyDraft(cfg, guard, staff, actor, id, {
      keepSteps: ["s1"],
      keepRoles: [],
      keepTools: [],
    })
    expect(result).toEqual({ applied: true, stepsAdded: 0, stepsRevised: 0, skipped: 1 })
    expect(stepRows()).toBe(before)
  })
})

describe("discarding, and pressing twice", () => {
  it("discarding writes nothing to the map, and the second press moves nothing", async () => {
    const before = stepRows()
    const id = await createDraft(cfg, guard, staff, actor, {
      processId: IDS.victimProcess,
      payload: threeSteps(),
      sourceText: "…",
    })

    expect(await discardDraft(cfg, guard, staff, actor, id)).toBe(true)
    expect(stepRows()).toBe(before)
    expect((await getDraft(cfg, guard, staff, id)).draft.status).toBe("discarded")

    // R17: the status predicate rides the UPDATE, so a repeat moves zero rows —
    // no second history line, and (at the door) no second ping.
    expect(await discardDraft(cfg, guard, staff, actor, id)).toBe(false)
    expect(stepRows()).toBe(before)

    // …and a discarded draft cannot then be applied.
    const result = await applyDraft(cfg, guard, staff, actor, id, keepAll)
    expect(result.applied).toBe(false)
    expect(stepRows()).toBe(before)
  })

  it("applying twice does not double the steps", async () => {
    const before = stepRows()
    const id = await createDraft(cfg, guard, staff, actor, {
      processId: IDS.victimProcess,
      payload: threeSteps(),
      sourceText: "…",
    })

    const first = await applyDraft(cfg, guard, staff, actor, id, keepAll)
    expect(first.applied).toBe(true)
    expect(stepRows()).toBe(before + 3)

    // THE SECOND PRESS. A person who does not see the first one land — a slow
    // network, a double tap — presses again. The status predicate on the claim is
    // what stands between them and a client's map with every step on it twice.
    const second = await applyDraft(cfg, guard, staff, actor, id, keepAll)
    expect(second).toEqual({ applied: false, stepsAdded: 0, stepsRevised: 0, skipped: 0 })
    expect(stepRows()).toBe(before + 3)
    expect(await listProcessSteps(cfg, guard, staff, IDS.victimProcess)).toHaveLength(before + 3)
  })
})

describe("the fence", () => {
  it("a draft on another client's process is refused", async () => {
    // A caller standing at Delaval cannot file a proposal against Bergman's map.
    await expect(
      createDraft(cfg, guard, burglar, actor, { processId: IDS.victimProcess, payload: threeSteps() })
    ).rejects.toMatchObject({ status: 404 })

    // …nor read one that exists, nor apply it. The same 404 as a made-up id, so
    // a refusal is never an oracle for which drafts exist.
    const before = stepRows()
    const id = await createDraft(cfg, guard, staff, actor, {
      processId: IDS.victimProcess,
      payload: threeSteps(),
    })
    await expect(getDraft(cfg, guard, burglar, id)).rejects.toMatchObject({ status: 404 })
    await expect(applyDraft(cfg, guard, burglar, actor, id, keepAll)).rejects.toMatchObject({
      status: 404,
    })
    // And the refusal wrote nothing on the way out.
    expect(stepRows()).toBe(before)

    // A discard is an UPDATE carrying the fence, so it simply moves nothing.
    expect(await discardDraft(cfg, guard, burglar, actor, id)).toBe(false)
    expect((await getDraft(cfg, guard, staff, id)).draft.status).toBe("proposed")

    // …and the list they CAN see holds none of it.
    expect((await listDrafts(cfg, guard, burglar)).total).toBe(0)
  })

  it("the context handed to the model is read under the caller's own fence", async () => {
    await expect(draftContext(cfg, guard, burglar, IDS.victimProcess)).rejects.toMatchObject({
      status: 404,
    })
    const context = await draftContext(cfg, guard, staff, IDS.victimProcess)
    expect(context.accountId).toBe(IDS.victimAccount)
    expect(context.existingSteps).toEqual([{ id: IDS.victimStep, name: "Check it against the order" }])
  })
})

describe("what came back from the model, validated", () => {
  const input = {
    words: "",
    from: "pasted",
    processName: null,
    roles: [{ id: "ROLE_CLERK", name: "Dispatch clerk" }],
    tools: [{ id: "TOOL_SHEET", name: "The spreadsheet" }],
    existingSteps: [{ id: IDS.victimStep, name: "Check it against the order" }],
  }

  it("reads a well-formed answer, and resolves every id in CODE", () => {
    const payload = readProposal(
      `Here is the map:\n\`\`\`json\n${JSON.stringify({
        processName: "Approving an invoice",
        summary: "From the post to paid.",
        steps: [
          {
            name: "Open the post",
            secondsPerRun: 300,
            runsPerCount: 2,
            runsPerPeriod: "day",
            role: "dispatch clerk",
            tool: "the spreadsheet",
            revises: null,
          },
          {
            name: "Check it against the order",
            secondsPerRun: 900,
            runsPerCount: 20,
            runsPerPeriod: "month",
            revises: "Check it against the order",
          },
        ],
      })}\n\`\`\``,
      input
    )
    expect(payload.processName).toBe("Approving an invoice")
    expect(payload.steps).toHaveLength(2)
    expect(payload.steps[0].secondsPerRun).toBe(300)
    expect(payload.steps[0].frequencyPeriod).toBe("day")
    // THE NAMES ARE MATCHED AGAINST THE CLIENT'S OWN ROWS. Nothing the model said
    // became an id: a transcript is somebody else's words, and a model reading
    // one must never be an edit away from naming a row.
    expect(payload.roles[0].matchedId).toBe("ROLE_CLERK")
    expect(payload.tools[0].matchedId).toBe("TOOL_SHEET")
    expect(payload.steps[1].revisesStepId).toBe(IDS.victimStep)
  })

  it("a name nobody has on their record matches nothing, rather than nearly something", () => {
    const payload = readProposal(
      JSON.stringify({ steps: [{ name: "Pay it", role: "Dispatch clerks", tool: "Spreadsheets" }] }),
      input
    )
    // "Dispatch clerks" is not "Dispatch clerk". A near-miss that silently
    // attached the wrong role would price a step at somebody else's hourly cost
    // and leave no trace, because the screen only ever shows a role's NAME.
    expect(payload.roles[0].matchedId).toBeNull()
    expect(payload.tools[0].matchedId).toBeNull()
    expect(payload.steps[0].revisesStepId).toBeNull()
  })

  it("a duration the model invented in the wrong shape becomes ZERO, never a guess", () => {
    const payload = readProposal(
      JSON.stringify({
        steps: [
          { name: "A", secondsPerRun: "about ten minutes", runsPerCount: 4, runsPerPeriod: "week" },
          { name: "B", secondsPerRun: -600, runsPerCount: "lots", runsPerPeriod: "fortnight" },
          { name: "C", secondsPerRun: 1e21, runsPerCount: 3, runsPerPeriod: "month" },
        ],
      }),
      input
    )
    // Zero is the honest answer for "the conversation did not say", and it is a
    // blank a reviewer fills — never a plausible number a client is quoted from.
    expect(payload.steps[0].secondsPerRun).toBe(0)
    expect(payload.steps[1].secondsPerRun).toBe(0)
    expect(payload.steps[1].runsPerPeriod).toBe(0)
    // …and nothing outside the four periods the app converts from.
    expect(payload.steps[1].frequencyPeriod).toBe("month")
    // …and no number big enough to overflow a total nobody could then defend.
    expect(payload.steps[2].secondsPerRun).toBe(31 * 24 * 3600)
  })

  it("an answer that is not JSON at all is an EMPTY proposal, never a partial one", () => {
    expect(readProposal("I'm sorry, I can't help with that.", input).steps).toEqual([])
    expect(readProposal('{"steps": [{"name":', input).steps).toEqual([])
    expect(readProposal("[1, 2, 3]", input).steps).toEqual([])
    // A step with no name is not a step: a reviewer cannot decide about a blank.
    expect(readProposal(JSON.stringify({ steps: [{ secondsPerRun: 60 }] }), input).steps).toEqual([])
  })
})

describe("what a draft does NOT do to a map somebody is already building", () => {
  it("a step added by hand while a draft sits unapplied is untouched by it", async () => {
    const id = await createDraft(cfg, guard, staff, actor, {
      processId: IDS.victimProcess,
      payload: threeSteps(),
      sourceText: "…",
    })
    // Somebody carries on working while the proposal waits.
    await addStep(cfg, guard, staff, actor, {
      processId: IDS.victimProcess,
      name: "File the paperwork",
      secondsPerRun: 120,
      runsPerPeriod: 20,
      frequencyPeriod: "month",
    })
    await applyDraft(cfg, guard, staff, actor, id, keepAll)
    const names = (await listProcessSteps(cfg, guard, staff, IDS.victimProcess)).map((s) => s.name)
    expect(names).toContain("File the paperwork")
    expect(names).toHaveLength(5) // the seeded one, the hand-added one, three applied
  })
})
