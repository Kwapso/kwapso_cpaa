// A confirmed command must stay ONE reconciling history entry. A command that pauses for a
// yes/no confirm spans two turns (propose + confirm); if the confirm-continuation wrote its
// own "(continued)" usage-log row, the history read as 1 + 1 while the balance dropped by 2
// (the reconciliation bug a teammate reported: balance -3, history 1+1). The confirm turn
// must instead FOLD its units into the propose row. These source-scans lock that in — no DB,
// like publish-seam / import-idempotency.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const credits = readFileSync(join(__dirname, "..", "src", "lib", "credits.ts"), "utf8")
const agent = readFileSync(join(__dirname, "..", "src", "lib", "agent.ts"), "utf8")

const confirmBody = (() => {
  const start = agent.indexOf("export async function confirmAndRun")
  const next = agent.indexOf("\nexport ", start + 1)
  return agent.slice(start, next === -1 ? undefined : next)
})()

describe("credit history reconciles with the balance (one row per command)", () => {
  it("foldUsageIntoLatest folds units into the latest command row (an UPDATE, not a new row)", () => {
    const start = credits.indexOf("export async function foldUsageIntoLatest")
    expect(start, "foldUsageIntoLatest must exist").toBeGreaterThan(-1)
    const body = credits.slice(start, credits.indexOf("\nexport ", start + 1))
    // It UPDATEs the newest row for this team+actor (the propose row) — not a fresh INSERT.
    expect(/UPDATE agent_usage_log/.test(body), "must UPDATE the existing row").toBe(true)
    expect(/ORDER BY created_at DESC LIMIT 1/.test(body), "must target the LATEST row").toBe(true)
    expect(/credits = credits \+ \?/.test(body), "must ADD the units, not overwrite").toBe(true)
    // Mixing pools flips the row to 'mixed' (free row + a credit unit → mixed).
    expect(/'mixed'/.test(body)).toBe(true)
  })

  it("confirmAndRun FOLDS its units instead of writing a separate '(continued)' row", () => {
    expect(confirmBody, "confirmAndRun must exist").toBeTruthy()
    // The confirm continuation folds (both the failure wrap-up path and the resumed loop).
    expect(/foldUsageIntoLatest/.test(confirmBody), "confirm turn must fold its units").toBe(true)
    expect(/fold: true/.test(confirmBody), "the resumed loop runs in fold mode").toBe(true)
    // It must NOT write its own row via logUsage — that was the split "(continued)" row.
    expect(/\blogUsage\(/.test(confirmBody), "confirm path must fold, never logUsage a new row").toBe(false)
  })

  // A row is TITLED by what the assistant DID (the WRITE actions run), falling back to the
  // user's prompt for a read-only / no-action turn — so a clarifying reply reads as the
  // question, not "List roles" (the credit-log-clarity feedback). And a fold APPENDS the
  // confirm's actions to the command's title — NEVER replaces: one command can pause for
  // confirmation more than once, and replacing left a 10-credit turn titled by its last
  // step alone (C3).
  it("the usage row is titled by the ACTION taken, and the fold APPENDS (never replaces)", () => {
    // agent.ts derives the title from the tally's actions, falling back to the prompt.
    expect(/function usageTitle/.test(agent), "usageTitle must exist").toBe(true)
    expect(/tally\.actions\.push/.test(agent), "each ran WRITE must be recorded as an action").toBe(true)
    const start = credits.indexOf("export async function foldUsageIntoLatest")
    const body = credits.slice(start, credits.indexOf("\nexport ", start + 1))
    // APPEND semantics: the new actions concatenate onto the existing summary…
    expect(/summary \|\| ' · ' \|\|/.test(body), "fold must APPEND to the title (summary || ' · ' || …)").toBe(true)
    // …and a bare replacement must not sneak back in.
    expect(/summary = \?,/.test(body), "fold must never REPLACE the title outright").toBe(false)
    // Folding real actions makes the row team-visible ('action' kind).
    expect(/kind = CASE/.test(body), "fold must mark the row an action row").toBe(true)
  })

  // C3: the row records WHICH kind of title it carries — an action (team-visible)
  // or the author's prompt (their own; back-filled NULL rows stay private).
  it("visibility rides the recorded kind — actions team-visible, prompts author-only", () => {
    const start = credits.indexOf("export async function readUsageLog")
    const body = credits.slice(start, credits.indexOf("\nexport ", start + 1) === -1 ? undefined : credits.indexOf("\nexport ", start + 1))
    expect(/kind = 'action' OR actor_id = \?/.test(body), "an action row's summary is team-visible; a prompt row's is the author's own").toBe(true)
    expect(/\bkind\b/.test(credits.slice(credits.indexOf("export async function logUsage"))), "logUsage must record the kind").toBe(true)
  })

  // A READ is not an action the user "did", so it must not title the row — only writes are
  // pushed; a read-only clarifying turn then falls back to the prompt (the question).
  it("only WRITES title the row — a read-only turn isn't logged as 'List roles'", () => {
    expect(
      /if \(t\?\.write\)\s*\{[\s\S]*?tally\.actions\.push/.test(agent),
      "tally.actions.push must be guarded by the tool being a write"
    ).toBe(true)
  })
})

// ONE STEP SEAM. The plan loop and confirmAndRun each carried their own copy of the
// tool-call loop, and the copies DRIFTED: the plan loop tallied only writes, the confirm
// copy tallied EVERY call ("confirmed calls are always writes" — they aren't; a turn that
// needs confirming stores ALL of its calls in the proposal, reads included). So the audit
// trail — the record of what the assistant did on someone's behalf — read differently
// depending on which loop happened to run it, and a plain list_members could flip a row
// from the author's own 'prompt' entry to a team-visible 'action' one.
//
// The check above stayed green through all of it: ONE guarded push anywhere in the file
// satisfied it, and the plan loop's copy provided one. These lock the seam itself.
describe("one tool-execution seam — the audit trail can't depend on which loop ran", () => {
  const seam = (() => {
    const start = agent.indexOf("async function runToolCall")
    return start === -1 ? "" : agent.slice(start, agent.indexOf("\n/**", start + 1))
  })()

  it("both loops run their steps through the ONE runToolCall", () => {
    expect(seam, "the shared step seam must exist").toBeTruthy()
    // A second executeTool call site IS a second copy of the step — how they drifted.
    expect((agent.match(/await executeTool\(/g) ?? []).length, "one place runs a tool").toBe(1)
    // …and both the plan loop and the confirm path reach it.
    expect((agent.match(/await runToolCall\(/g) ?? []).length, "both loops call the seam").toBe(2)
  })

  it("the step's audit row is written INSIDE the seam, so both paths persist it", () => {
    expect(/appendMessage\(/.test(seam), "the seam must persist the step").toBe(true)
    expect(/role: "tool"/.test(seam), "…as the step's own tool row").toBe(true)
    expect(
      /status: result\.ok \? "done" : "failed"/.test(seam),
      "…carrying the real outcome, so a reopened chat shows a failed step red, never a false green"
    ).toBe(true)
  })

  it("the tally is written-guarded in the seam, and nowhere else", () => {
    expect((agent.match(/tally\.actions\.push/g) ?? []).length, "one tally, in the one seam").toBe(1)
    expect(
      /if \(t\?\.write\) \{\n\s*tally\.actions\.push/.test(seam),
      "the push must sit directly under the write guard, inside the seam"
    ).toBe(true)
  })
})

// REFUND WHAT WAS NEVER SPENT — and only that.
//
// The rule used to be "if no WRITE succeeded this turn, hand back every paid unit", on
// BOTH failure exits. That refunded units the model had already been paid for (a turn
// meters one unit per step, and every step the model answered burned real tokens), and it
// fired on the failed-STEP exit — a failure any caller can produce on demand: ask to
// invite someone who is already a member. So the same turn could run forever, spending
// the app's Anthropic balance and handing its credit straight back every time. The credit
// lane became the unbounded one, in a function whose own comment explains at length why
// the FREE allowance must never be refunded for exactly that reason.
//
// A unit is SPENT the moment the model answers. Whether the answer pleased anyone,
// whether the door then refused the write — none of that un-burns the tokens. So exactly
// one unit is refundable: the one metered for the step whose model call THREW. These
// scans hold both halves — the refund that survives, and the two that must not come back.
describe("credit fairness — only a unit that bought nothing comes back", () => {
  const refundBody = (() => {
    const start = agent.indexOf("const refundUnspentUnit")
    return start === -1
      ? ""
      : agent
          .slice(start, agent.indexOf("\n  for (", start))
          .replace(/\/\*[\s\S]*?\*\//g, " ")
          .replace(/(^|[^:])\/\/[^\n]*/gm, "$1")
  })()

  it("refundAiUnits reverses BOTH pools (paid credits back, free units un-counted)", () => {
    const start = credits.indexOf("export async function refundAiUnits")
    expect(start, "refundAiUnits must exist").toBeGreaterThan(-1)
    const body = credits.slice(start, credits.indexOf("\nexport ", start + 1))
    expect(/balance = balance \+ \?/.test(body), "returns paid credits to the balance").toBe(true)
    expect(/used = MAX\(0, used - \?\)/.test(body), "un-counts today's free units, bounded at zero").toBe(true)
  })

  // The free allowance is not a price, it is the daily BOUND on how much model
  // spend this team can cause. Refunding it dissolves the bound.
  it("the app's own daily allowance is NEVER refunded — only the paid pool comes back", () => {
    expect(refundBody, "refundUnspentUnit must exist").toBeTruthy()
    // The free argument is a literal 0: nothing goes back to today's counter.
    expect(
      /refundAiUnits\(\s*env,\s*guard\.teamId,\s*0\s*,/.test(refundBody),
      "the refund must hand back ZERO free units"
    ).toBe(true)
    expect(
      /refundAiUnits\([^)]*tally\.free/.test(refundBody),
      "the free pool must never be an argument to the refund"
    ).toBe(false)
    // …and the turn still REMEMBERS the free units it spent, so the usage row and
    // the day's counter tell the same story.
    expect(
      /tally\.free\s*=\s*0/.test(refundBody),
      "zeroing the tally's free units hides a spend that really happened"
    ).toBe(false)
  })

  // ONE unit, and only a credit-lane one. The old shape handed back
  // `opts.tally.credit` — the whole turn's accumulated paid units, every earlier
  // one of which had already bought a completion.
  it("at most ONE unit comes back, never the turn's accumulated total", () => {
    expect(
      /refundAiUnits\(\s*env,\s*guard\.teamId,\s*0\s*,\s*1\s*\)/.test(refundBody),
      "the refund is a literal 1 — a turn's accumulated credits were already spent on completions"
    ).toBe(true)
    expect(
      /refundAiUnits\([^)]*tally\.credit\b/.test(refundBody),
      "handing back tally.credit refunds units the model was already paid for"
    ).toBe(false)
    expect(
      /stepUnit !== "credit"/.test(refundBody),
      "only THIS step's unit, and only from the paid lane, is refundable"
    ).toBe(true)
    // The tally is decremented by the same one, so the logged row and the balance agree.
    expect(/tally\.credits -= 1/.test(refundBody) && /tally\.credit -= 1/.test(refundBody), "the tally must follow the balance").toBe(true)
  })

  // The predicate is "was this unit spent", NOT "did the turn achieve anything".
  // okWrites answered the second question and is gone with it; if it comes back
  // as a refund guard, so does the hole.
  it("the refund does not ask whether the turn ACHIEVED anything", () => {
    expect(/okWrites/.test(agent), "okWrites was the old 'did it achieve anything' guard — it must not return").toBe(false)
  })

  // THE HOLE ITSELF: the failed-step exit is the one a caller reaches on demand.
  // The model answered (twice — the failure wrap-up reads the failure and
  // explains it), so the unit is spent and must stay spent.
  it("a FAILED STEP is not refunded — that exit is reachable on demand", () => {
    const loop = agent.slice(agent.indexOf("async function runPlanLoop"), agent.indexOf("export async function confirmAndRun"))
    const failedExit = loop.slice(loop.indexOf("if (failed) {"))
    expect(failedExit, "the plan loop's failed-step exit must exist").toBeTruthy()
    expect(
      /refund/i.test(failedExit.replace(/\/\/[^\n]*/g, "")),
      "a refused action costs its credit: the model answered, so the unit is spent"
    ).toBe(false)
    // …and confirmAndRun's own failure exit, for the same reason.
    expect(/refund/i.test(confirmBody.replace(/\/\/[^\n]*/g, "")), "the confirm path never refunds either").toBe(false)
  })

  it("…but a model call that THREW still hands its unit back (the fairness that survives)", () => {
    const loop = agent.slice(agent.indexOf("async function runPlanLoop"), agent.indexOf("export async function confirmAndRun"))
    const modelCatch = loop.slice(loop.indexOf("} catch (e) {"), loop.indexOf("if (!reply.toolCalls.length)"))
    expect(
      /await refundUnspentUnit\(\)/.test(modelCatch),
      "a model outage is ours, not the customer's — the unit bought no completion"
    ).toBe(true)
    // Called on that exit and NOWHERE else: one call site is the whole rule.
    expect((agent.match(/await refundUnspentUnit\(\)/g) ?? []).length, "exactly one refund call site").toBe(1)
  })

  // A confirm continuation's first step is PREPAID by confirmAndRun, and that
  // unit already bought its writes. It must never be refundable here.
  it("a prepaid confirm step has no unit of its own to refund", () => {
    const meter = agent.slice(agent.indexOf("for (let step = 0"), agent.indexOf("let reply: ModelReply"))
    expect(/stepUnit = null/.test(meter), "each step starts owing nothing").toBe(true)
    expect(
      /stepUnit = c\.source/.test(meter),
      "stepUnit is set only INSIDE the metering block, so a prepaid step leaves it null"
    ).toBe(true)
    expect(
      meter.indexOf("stepUnit = c.source") > meter.indexOf("if (!(loopOpts.prepaid && step === 0))"),
      "…and that assignment sits after the prepaid guard, never before it"
    ).toBe(true)
  })
})
