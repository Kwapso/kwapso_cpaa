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

// A turn that changed NOTHING the user wanted — a refused action (inviting an existing
// member) or a model hiccup — must not cost a credit. The turn meters up front (before the
// outcome is known), then hands the units back on the failure exits when no write succeeded.
describe("credit fairness — a refused/failed turn is refunded", () => {
  it("refundAiUnits reverses BOTH pools (paid credits back, free units un-counted)", () => {
    const start = credits.indexOf("export async function refundAiUnits")
    expect(start, "refundAiUnits must exist").toBeGreaterThan(-1)
    const body = credits.slice(start, credits.indexOf("\nexport ", start + 1))
    expect(/balance = balance \+ \?/.test(body), "returns paid credits to the balance").toBe(true)
    expect(/used = MAX\(0, used - \?\)/.test(body), "un-counts today's free units, bounded at zero").toBe(true)
  })

  // …but the FREE allowance is not a price, it is the daily BOUND on how much
  // model spend this team can cause. Refunding it dissolved the bound: a turn
  // that reliably ends in a refusal (ask to invite someone who is already a
  // member) burns real tokens and hands its unit straight back, so the same turn
  // runs all day for nothing. Paid credits still come back — someone bought
  // those. The rule lived only in a comment; this is the check that holds it.
  it("the app's own daily allowance is NEVER refunded — only the paid pool comes back", () => {
    const start = agent.indexOf("const refundIfNothingDone")
    expect(start, "refundIfNothingDone must exist").toBeGreaterThan(-1)
    // Comments are not code — this very block explains the rule in prose, and a
    // scan satisfied by prose would stay green through the rule being deleted.
    const body = agent
      .slice(start, agent.indexOf("\n  for (", start))
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/gm, "$1")
    // The free argument is a literal 0: nothing goes back to today's counter.
    expect(
      /refundAiUnits\(\s*env,\s*guard\.teamId,\s*0\s*,/.test(body),
      "the refund must hand back ZERO free units"
    ).toBe(true)
    expect(
      /refundAiUnits\([^)]*tally\.free/.test(body),
      "the free pool must never be an argument to the refund"
    ).toBe(false)
    // …and the turn still REMEMBERS the free units it spent, so the usage row and
    // the day's counter tell the same story.
    expect(
      /tally\.free\s*=\s*0/.test(body),
      "zeroing the tally's free units hides a spend that really happened"
    ).toBe(false)
    expect(/tally\.credits = opts\.tally\.free/.test(body), "the logged row keeps the free units").toBe(true)
  })

  it("the agent refunds ONLY when nothing succeeded, on the failure exits", () => {
    expect(/refundAiUnits/.test(agent), "agent must use the refund").toBe(true)
    // Guarded on okWrites === 0 — a turn with a successful write keeps its charge.
    expect(/okWrites === 0/.test(agent), "refund only when no write succeeded this turn").toBe(true)
    expect(/okWrites \+= 1/.test(agent), "successful writes are counted so a partial success isn't refunded").toBe(true)
    // Wired into the two failure exits (a failed step, and a model hiccup) — not the answer path.
    expect(
      (agent.match(/refundIfNothingDone\(\)/g) ?? []).length >= 2,
      "refund is called on the failure exits"
    ).toBe(true)
  })
})
