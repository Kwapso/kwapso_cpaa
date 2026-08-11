// THE APPROVAL GATE HAS ONE JOB: a dangerous call runs when — and only when —
// the person approved it. It ran TWICE on a double-tap, and it ran AFTER A "NO".
//
// confirmAndRun read the stored proposal, executed every call in it, and only
// then marked it "done" with an UPDATE that checked nothing. So two /confirm
// posts (a double-click, a retried request, a reconnecting stream) both read the
// same "proposed" calls and both executed them — a second invite, a second row,
// a second of whatever the model had asked permission for.
//
// The shape is CONCURRENCY.md's "a retryable operation that must run at most once
// claims it first" — the CSV importer's planned→running flip is its twin, locked
// the same way next door in import-idempotency.test.ts.
//
// AND THE OTHER ANSWER. This suite locked the approve path thoroughly and never
// touched decline — so it stayed green over a gate that only half worked. The
// decline branch appended "Okay — I've left that alone." and RETURNED, without
// spending the proposal, and it does not shadow it either: appendMessage writes
// tool_calls_json = NULL while getPendingProposal reads the newest assistant row
// that HAS a proposal. The refused calls therefore stayed "proposed" for ever and
// a later {approve:true} on the same thread executed exactly what the person had
// turned down. Sharpest on MCP, where agent_confirm is a tool an autonomous
// client calls: the operator declines, the client retries, the write lands.
//
// The decline half below is BEHAVIOURAL, against the real schema, because that is
// the only way to prove the thing that actually matters — that the refused call
// never reaches its door.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import type { ChatOutcome } from "@shared/types"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import { confirmAndRun } from "../src/lib/agent"
import { appendMessage, createThread, getPendingProposal } from "../src/lib/threads"
import { buildSpineDb, IDS, makeEnv } from "../../tenancy/test/spine-harness"

const lib = (name: string) => readFileSync(join(__dirname, "..", "src", "lib", name), "utf8")
const threads = lib("threads.ts")
const agent = lib("agent.ts")

const confirmBody = (() => {
  const start = agent.indexOf("export async function confirmAndRun")
  const next = agent.indexOf("\nexport ", start + 1)
  return agent.slice(start, next === -1 ? undefined : next)
})()

describe("an approved proposal runs at most once", () => {
  it("the consume is a compare-and-swap, not a blind overwrite", () => {
    const body = (() => {
      const start = threads.indexOf("export async function consumePendingProposal")
      const next = threads.indexOf("\nexport ", start + 1)
      return threads.slice(start, next === -1 ? undefined : next)
    })()
    expect(body, "consumePendingProposal must exist").toBeTruthy()
    // The row must still hold the text we read — that predicate IS the claim.
    expect(
      /UPDATE agent_messages[\s\S]*WHERE[\s\S]*AND tool_calls_json = /.test(body),
      "the claim must ride the write, or two confirms both 'win' it"
    ).toBe(true)
    // …and it must report who won, or checking it is impossible.
    expect(/Promise<boolean>/.test(body)).toBe(true)
  })

  it("confirmAndRun claims the proposal BEFORE it runs anything", () => {
    expect(confirmBody, "confirmAndRun must exist").toBeTruthy()
    const claimAt = confirmBody.indexOf("consumePendingProposal(")
    const runAt = confirmBody.indexOf("runToolCall(")
    expect(claimAt, "the claim must be in confirmAndRun").toBeGreaterThan(-1)
    expect(runAt, "the calls must be in confirmAndRun").toBeGreaterThan(-1)
    expect(runAt, "claim first, execute second — or a lost race still executes").toBeGreaterThan(claimAt)
  })

  it("…and the caller that LOSES the claim proceeds no further", () => {
    // Not fire-and-forget: the answer has to be read, and the loser has to stop
    // before the credit is metered and before any write happens.
    const claim = confirmBody.slice(confirmBody.indexOf("consumePendingProposal("))
    expect(
      /^[\s\S]{0,80}\)\)\s*\{/.test(claim) || /if\s*\([\s\S]{0,120}consumePendingProposal\(/.test(confirmBody),
      "the claim's result must gate what follows it"
    ).toBe(true)
    const meterAt = confirmBody.indexOf("consumeAiUnit(")
    expect(
      confirmBody.indexOf("consumePendingProposal("),
      "the loser must be turned away before the team is charged for a turn it won't run"
    ).toBeLessThan(meterAt)
  })
})

/* ------------------------------- and a "no" ------------------------------- */

const cfg = { accountId: "a", apiToken: "t" } as never
const guard = { userId: IDS.staffUser, teamId: IDS.team, roleId: IDS.adminRole, databaseId: "db_team" }
const actor = { id: IDS.staffUser, email: "staff@kwapso.app", name: "Staff" }
const db = () => holder.db as DatabaseSync

/** Every call the agent's tools would make to a real door. A refused proposal must
 * leave this EMPTY — that, not the wording of the reply, is the security claim. */
let doorCalls: string[] = []

/** The worker Env, plus the tenancy binding executeTool posts through. Without the
 * stub a sabotaged fix would crash instead of failing an assertion, and a red for
 * the wrong reason teaches nobody anything. */
function env(): never {
  return {
    ...(makeEnv(db, IDS.staffUser) as unknown as object),
    TENANCY: {
      fetch: async (url: string) => {
        doorCalls.push(new URL(url).pathname)
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } })
      },
    },
  } as never
}

const request = () => new Request("https://data-ops/api/agent/confirm", { headers: { Cookie: "session=x" } })

/** The reply of a FINISHED turn. `ChatOutcome` is a union — a turn paused for another
 * panel carries no reply at all — so reading one means proving the turn ended first.
 * (tsc asked the question; it is a fair one to have to answer.) */
function replyOf(outcome: ChatOutcome): string {
  expect(outcome.done, "the turn must have finished, not paused for another panel").toBe(true)
  return outcome.done ? outcome.reply : ""
}

/** A thread holding exactly one PROPOSED dangerous call, as a paused turn leaves it. */
async function threadAwaitingAnswer(): Promise<string> {
  const threadId = await createThread(cfg, guard, actor, "Grant a login")
  await appendMessage(cfg, guard, actor, threadId, {
    role: "assistant",
    content: "I can do that — may I?",
    toolCallsJson: JSON.stringify([
      { tool: "grant_portal_access", input: { accountId: IDS.victimAccount, personAccountId: IDS.clientPerson }, status: "proposed" },
    ]),
    source: "web",
  })
  return threadId
}

/** The stored statuses on the proposing row — the agent's audit of what happened. */
function storedStatuses(threadId: string): string[] {
  const row = db()
    .prepare(
      "SELECT tool_calls_json FROM agent_messages WHERE thread_id = ? AND role = 'assistant' AND tool_calls_json IS NOT NULL ORDER BY created_at DESC LIMIT 1"
    )
    .get(threadId) as { tool_calls_json: string } | undefined
  return (JSON.parse(row?.tool_calls_json ?? "[]") as { status?: string }[]).map((x) => x.status ?? "")
}

beforeEach(() => {
  holder.db = buildSpineDb()
  doorCalls = []
  // The metering tables live in the GLOBAL core database, which the spine harness
  // has no reason to carry. Run the REAL migrations rather than hand-copying a
  // CREATE TABLE — a fixture that drifts from the shipped schema is a test that
  // stops describing production (the harness's own rule, and it caught a missing
  // column here on the first run).
  for (const m of ["0009_agent_usage", "0010_agent_credits", "0011_agent_usage_log"])
    db().exec(readFileSync(join(__dirname, "..", "..", "..", "db", "core", `${m}.sql`), "utf8"))
  db().exec(`INSERT INTO agent_credits (team_id, balance) VALUES ('${IDS.team}', 100);`)
})

describe('a declined proposal is spent — "no" is durable', () => {
  it("the fixture really is a thread awaiting an answer (or every test below is hollow)", async () => {
    const threadId = await threadAwaitingAnswer()
    const pending = await getPendingProposal(cfg, guard, threadId)
    expect(pending.map((p) => p.name), "the proposal must be pending BEFORE the decline").toEqual([
      "grant_portal_access",
    ])
  })

  it("declining spends it, so nothing is left waiting", async () => {
    const threadId = await threadAwaitingAnswer()
    await confirmAndRun(env(), request(), cfg, guard, actor, { threadId, approve: false, source: "web" })
    expect(
      await getPendingProposal(cfg, guard, threadId),
      "a refused proposal must not stay pending — a later approval would run it"
    ).toEqual([])
  })

  it("…and a later YES on the same thread runs nothing", async () => {
    const threadId = await threadAwaitingAnswer()
    await confirmAndRun(env(), request(), cfg, guard, actor, { threadId, approve: false, source: "web" })
    doorCalls = [] // only what the RETRY does counts

    const retry = await confirmAndRun(env(), request(), cfg, guard, actor, {
      threadId,
      approve: true,
      source: "mcp:acme", // the shape that matters: an autonomous client retrying
    })

    // The claim, in the only terms that matter: the refused write never reached
    // its door. The reply's wording is the corroboration, not the proof.
    expect(doorCalls, "a call the person REFUSED must never reach the door").toEqual([])
    expect(replyOf(retry)).toBe("There's nothing waiting for your approval.")
  })

  it("and the audit says refused, not done", async () => {
    const threadId = await threadAwaitingAnswer()
    await confirmAndRun(env(), request(), cfg, guard, actor, { threadId, approve: false, source: "web" })
    // These rows ARE the agent's audit log. "proposed" would mean still live;
    // "done" would say the app carried out the thing the person turned down.
    expect(storedStatuses(threadId)).toEqual(["declined"])
  })

  it("an APPROVED proposal still runs — the fix must not deafen the yes", async () => {
    const threadId = await threadAwaitingAnswer()
    const ok = await confirmAndRun(env(), request(), cfg, guard, actor, {
      threadId,
      approve: true,
      source: "web",
    })
    expect(doorCalls, "the approved call must reach its door").toContain("/api/tenancy/portal-users")
    expect(replyOf(ok), "and it must not be turned away as if nothing were waiting").not.toBe(
      "There's nothing waiting for your approval."
    )
    expect(storedStatuses(threadId)).toEqual(["done"])
  })
})
