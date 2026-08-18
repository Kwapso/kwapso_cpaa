// The AI quota gate (owner's credit-based model). Each team gets a FREE daily
// allowance of AI requests; beyond that it spends from a purchasable credit balance;
// out of both, the app warns then hard-stops for the day. A caller consumes ONE
// unit per AI request (the real cost driver) at this single shared gate. Lives over
// the global core DB (agent_usage = the daily-free counter; agent_credits = the
// balance) so it works without opening a team database.
//
// IT IS SHARED BECAUSE THE ALLOWANCE IS. It sat in data-ops while data-ops was the
// only worker that spent a model. Content spends one now — it WRITES the answer the
// knowledge base found (R23) — and there is exactly one allowance between them: the
// team's. A second copy of this file would be a second daily counter with the same
// name, and the first person to notice would be the one who ran out twice.
//
// THE CEILING IS A VAR, SO EVERY SPENDER MUST READ THE SAME ONE. `AGENT_FREE_DAILY`
// and `AGENT_NO_DAILY_CAP` are declared in BOTH spenders' wrangler configs with the
// same values, and credits-invariant.test.ts compares them — a cap set on one worker
// and not the other is one allowance enforced at two different heights.

import type { D1Database } from "@cloudflare/workers-types"

import type { AgentQuota, UsageLogRow } from "@shared/types"
import type { Actor } from "@shared/workers/gating"
import { ulid } from "@shared/workers/id"
import { numberVar } from "@shared/workers/limits"

/** What this gate needs from a worker's env — structurally, so any worker that
 * spends the allowance can pass its own Env without importing another's. */
export type Env = {
  /** the global core database (agent_usage + agent_credits live here). */
  DB: D1Database
  /** free AI requests per team per day; unset means FREE_DAILY below. */
  AGENT_FREE_DAILY?: string
  /** testing environments only — stop ENFORCING the allowance, keep measuring it. */
  AGENT_NO_DAILY_CAP?: string
}

/** Free AI requests per team per day before credits are spent. */
export const FREE_DAILY = 25

/** TESTING ENVIRONMENTS ONLY. When `AGENT_NO_DAILY_CAP` is on, the allowance is
 * not ENFORCED — a turn is never refused for running out — but everything that
 * MEASURES keeps running: `agent_usage` still increments, credits are still
 * spent and refunded, and the usage log still fills. So "what did testing cost"
 * stays answerable; only the door that says no is propped open.
 *
 * It is a separate var rather than `AGENT_FREE_DAILY: "999999"` because the cap
 * is a number a PERSON reads on screen ("25 left today"), and a sentinel large
 * enough to be unreachable is also large enough to be nonsense in a sentence.
 *
 * Never set on production — `workers/data-ops/test/credits-invariant.test.ts`
 * fails the build if the production vars block carries it. */
function noDailyCap(env: Env): boolean {
  return env.AGENT_NO_DAILY_CAP === "true"
}

/** The cap the SQL enforces. Unlimited raises it out of reach rather than
 * branching the statement, so the claim stays ONE atomic INSERT…ON CONFLICT and
 * the race-safety argument below is the same argument in both modes. */
function capFor(env: Env): number {
  return noDailyCap(env) ? Number.MAX_SAFE_INTEGER : numberVar(env.AGENT_FREE_DAILY, FREE_DAILY)
}

/** Today's metering window, 'YYYY-MM-DD' (the free counter resets daily). */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** A team's current quota snapshot (free used today + purchasable balance). */
export async function getQuota(env: Env, teamId: string): Promise<AgentQuota> {
  const usage = await env.DB.prepare(
    "SELECT used FROM agent_usage WHERE team_id = ? AND period = ?"
  )
    .bind(teamId, today())
    .first<{ used: number }>()
  const credit = await env.DB.prepare("SELECT balance FROM agent_credits WHERE team_id = ?")
    .bind(teamId)
    .first<{ balance: number }>()
  const unlimited = noDailyCap(env)
  // The number a person READS is always the configured allowance, never the
  // unreachable sentinel capFor hands the SQL — so an uncapped environment shows
  // "3 used today", not "8 of 9007199254740991 free left".
  const cap = numberVar(env.AGENT_FREE_DAILY, FREE_DAILY)
  const freeUsedToday = usage?.used ?? 0
  const creditBalance = credit?.balance ?? 0
  const freeRemaining = Math.max(0, cap - freeUsedToday)
  return {
    freeDaily: cap,
    freeUsedToday,
    freeRemaining,
    creditBalance,
    remaining: freeRemaining + creditBalance,
    // Uncapped is never blocked, whatever the counters say — that IS the switch.
    blocked: !unlimited && freeRemaining + creditBalance <= 0,
    unlimited,
  }
}

export type ConsumeResult = {
  ok: boolean
  source: "free" | "credit" | "none"
  /** true when the team just ran out (free + credits both 0) or is nearly out. */
  warn: boolean
  quota: AgentQuota
}

/** Spend one AI unit for a team: the free daily allowance first, then a purchased
 * credit. The credit decrement is race-safe (`WHERE balance > 0`, so it can never go
 * negative — that's real money). The FREE counter claims its slot the same way: the
 * cap rides the UPDATE, so N simultaneous chats can't each read `used < cap` and all
 * proceed (that read-then-write is how a daily allowance becomes advisory). Returns
 * ok:false when both are exhausted — the caller hard-stops and says so. */
export async function consumeAiUnit(env: Env, teamId: string): Promise<ConsumeResult> {
  const now = new Date().toISOString()
  const period = today()
  const cap = capFor(env)
  // ONE statement checks the cap AND consumes the slot: the row is created at
  // used = 1, or incremented only while it is still under the cap. Zero rows
  // changed = the free allowance is spent, and we fall through to paid credits.
  const claimed = await env.DB.prepare(
    // The `SELECT ... WHERE ? > 0` is load-bearing: a bare VALUES row is inserted
    // unconditionally, so the ON CONFLICT guard below only ever protected the
    // SECOND request of the day. With AGENT_FREE_DAILY=0 the first one still went
    // through free — a cap of zero that granted one.
    `INSERT INTO agent_usage (team_id, period, used, updated_at)
     SELECT ?, ?, 1, ? WHERE ? > 0
     ON CONFLICT(team_id, period) DO UPDATE SET used = used + 1, updated_at = ?
     WHERE agent_usage.used < ?`
  )
    .bind(teamId, period, now, cap, now, cap)
    .run()
  if ((claimed.meta.changes ?? 0) > 0) {
    const quota = await getQuota(env, teamId)
    return { ok: true, source: "free", warn: quota.remaining === 0, quota }
  }

  const res = await env.DB.prepare(
    "UPDATE agent_credits SET balance = balance - 1, updated_at = ? WHERE team_id = ? AND balance > 0"
  )
    .bind(now, teamId)
    .run()
  if ((res.meta.changes ?? 0) === 0) {
    return { ok: false, source: "none", warn: true, quota: await getQuota(env, teamId) }
  }
  const quota = await getQuota(env, teamId)
  return { ok: true, source: "credit", warn: quota.creditBalance <= 3, quota }
}

/** Give back AI units a turn metered but that accomplished NOTHING the user wanted — a
 * refused/failed action (e.g. inviting someone already on the team) or a model error. A
 * blocked action must never cost the user. Mirrors consumeAiUnit in reverse: return paid
 * CREDITS to the balance, then un-count FREE units for today (bounded at zero). Best-effort
 * — a refund hiccup must never break the turn. */
export async function refundAiUnits(
  env: Env,
  teamId: string,
  freeUnits: number,
  creditUnits: number
): Promise<void> {
  const now = new Date().toISOString()
  try {
    if (creditUnits > 0)
      await env.DB.prepare(
        "UPDATE agent_credits SET balance = balance + ?, updated_at = ? WHERE team_id = ?"
      )
        .bind(creditUnits, now, teamId)
        .run()
    if (freeUnits > 0)
      await env.DB.prepare(
        "UPDATE agent_usage SET used = MAX(0, used - ?), updated_at = ? WHERE team_id = ? AND period = ?"
      )
        .bind(freeUnits, now, teamId, today())
        .run()
  } catch {
    /* refund is best-effort — a hiccup must never break the turn the user cares about */
  }
}

/** Owner/admin top-up: add credits to a team's balance (idempotent insert/accumulate).
 * Returns the new balance. Real payment integration will call this same path later. */
export async function grantCredits(env: Env, teamId: string, amount: number): Promise<number> {
  const now = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO agent_credits (team_id, balance, lifetime_granted, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(team_id) DO UPDATE SET balance = balance + ?, lifetime_granted = lifetime_granted + ?, updated_at = ?`
  )
    .bind(teamId, amount, amount, now, amount, amount, now)
    .run()
  const row = await env.DB.prepare("SELECT balance FROM agent_credits WHERE team_id = ?")
    .bind(teamId)
    .first<{ balance: number }>()
  return row?.balance ?? 0
}

/** Where a turn's AI units came from: all free, all paid credit, or a bit of each. */
export type UsageSource = "free" | "credit" | "mixed"

/** WHAT A TURN ACTUALLY COST IN TOKENS, as the provider reported it — the four
 * numbers Anthropic returns in its `usage` block, in our words.
 *
 * A UNIT IS NOT A COST. `credits` above counts REQUESTS, which is the right
 * shape for an allowance a person reads ("25 left today") and the wrong shape
 * for a bill: two turns that each spend one unit can differ tenfold in tokens.
 * So the log records both — the unit that was metered, and the tokens it bought.
 *
 * `cacheWrite` and `cacheRead` are the whole reason this exists. The prompt
 * cache is only worth what it actually HITS, and a hit rate is not something a
 * console can be asked for after the fact: it has to be written down while the
 * turn is happening. cacheRead ÷ (cacheRead + cacheWrite + input) is the answer,
 * off our own table, on our own data.
 *
 * It lives HERE, beside the row it is written into, rather than in the model
 * adapter that produces it, because `shared/` cannot import from a worker and
 * two shapes for one row is how the two halves drift apart. */
export type TokenUsage = {
  /** prompt tokens charged at full price (everything after the last cache hit). */
  input: number
  /** tokens the model generated. */
  output: number
  /** prompt tokens WRITTEN to the cache this turn (billed at a premium, once). */
  cacheWrite: number
  /** prompt tokens SERVED from the cache this turn (billed at a tenth). */
  cacheRead: number
}

/** A turn that reported nothing (the Workers AI path, or a call that threw). */
export const NO_TOKENS: TokenUsage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }

/** Add one model turn's tokens onto a running total. A turn can call the model
 * more than once (each step, plus the unmetered failure wrap-up), and the row is
 * per COMMAND — so the counts sum the same way the credits beside them do. */
export function addTokens(total: TokenUsage, turn: TokenUsage | undefined): TokenUsage {
  if (!turn) return total
  return {
    input: total.input + turn.input,
    output: total.output + turn.output,
    cacheWrite: total.cacheWrite + turn.cacheWrite,
    cacheRead: total.cacheRead + turn.cacheRead,
  }
}

/** What a usage row's summary IS: an ACTION the assistant took (team-visible —
 * the team is entitled to see actions taken in its name) or the PROMPT the
 * person typed (the author's own — showing a teammate's question would publish
 * it). Recorded per row so visibility never guesses. */
export type UsageKind = "action" | "prompt"

/** Record ONE agent turn in the usage log (the human trail, not the metering counter).
 * Best-effort by design: any error — a missing table, a write hiccup — is swallowed so a
 * logging failure can never break the turn the user actually cares about. */
export async function logUsage(
  env: Env,
  teamId: string,
  actor: Actor,
  credits: number,
  source: UsageSource,
  summary: string,
  kind: UsageKind,
  /** What the turn cost in TOKENS (including the prompt-cache split). OMITTED
   * means "not measured", and is written as NULL rather than as four zeroes —
   * the knowledge base spends its unit on a provider that reports nothing, and a
   * row of zeroes there would read as "measured, and it was free", which is the
   * one thing these numbers must never say. */
  tokens?: TokenUsage
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO agent_usage_log (id, team_id, actor_id, actor_name, created_at, credits, source, summary, kind,
                                    input_tokens, output_tokens, cache_write_tokens, cache_read_tokens)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        ulid(), teamId, actor.id, actor.name, new Date().toISOString(), credits, source, summary, kind,
        tokens?.input ?? null, tokens?.output ?? null, tokens?.cacheWrite ?? null, tokens?.cacheRead ?? null
      )
      .run()
  } catch {
    /* logging is never fatal — a missing table or write error must not break the turn */
  }
}

/** Fold a confirm-continuation's units INTO the command's existing log row — the propose
 * turn's row, which is the latest for this team+actor (the UI blocks new agent input while
 * a confirm is pending, so nothing else can slip in between). This keeps ONE user command
 * as ONE history entry whose credit count reconciles with the balance, instead of a
 * cryptic separate "(continued)" row (the reconciliation bug a teammate reported: balance
 * dropped 3 but the history read as 1+1). The `source` becomes 'mixed' if the added units
 * came from a different pool than the row already had. Best-effort like `logUsage`; if the
 * propose row somehow isn't there (its best-effort write failed), it writes a fresh row so
 * the units still surface rather than vanish. */
export async function foldUsageIntoLatest(
  env: Env,
  teamId: string,
  actor: Actor,
  addCredits: number,
  addSource: UsageSource,
  actions: string,
  /** The continuation's TOKENS, folded in beside its units for the same reason
   * they are: one command is one row, and a row whose credits reconcile while
   * its tokens don't is a bill that only half adds up. */
  tokens: TokenUsage = NO_TOKENS
): Promise<void> {
  if (addCredits <= 0) return
  try {
    // Fold the units in AND APPEND the confirm's actions to the command's title —
    // never replace. One command can pause for confirmation MORE THAN ONCE, and
    // replacing left a 10-credit turn titled by its last step alone (the actions
    // taken before the pause vanished from the log). Appending actions also makes
    // the row an 'action' row (team-visible): the folded turn DID something.
    const res = await env.DB.prepare(
      `UPDATE agent_usage_log
         SET credits = credits + ?,
             source = CASE WHEN source = ? THEN source ELSE 'mixed' END,
             summary = substr(CASE WHEN ? = '' THEN summary ELSE summary || ' · ' || ? END, 1, 300),
             kind = CASE WHEN ? = '' THEN kind ELSE 'action' END,
             input_tokens = COALESCE(input_tokens, 0) + ?,
             output_tokens = COALESCE(output_tokens, 0) + ?,
             cache_write_tokens = COALESCE(cache_write_tokens, 0) + ?,
             cache_read_tokens = COALESCE(cache_read_tokens, 0) + ?
       WHERE id = (
         SELECT id FROM agent_usage_log
         WHERE team_id = ? AND actor_id = ? ORDER BY created_at DESC LIMIT 1
       )`
    )
      .bind(
        addCredits, addSource, actions, actions, actions,
        tokens.input, tokens.output, tokens.cacheWrite, tokens.cacheRead,
        teamId, actor.id
      )
      .run()
    // No prior row to fold into (propose log failed) → don't lose the units.
    if ((res.meta.changes ?? 0) === 0)
      await logUsage(env, teamId, actor, addCredits, addSource, actions || "assistant action", "action", tokens)
  } catch {
    /* best-effort — a fold failure must never break the turn */
  }
}

/** The team's usage log, newest-first (the panel's "N left today" badge opens this).
 * VISIBILITY (C3 — the log tells the team where its credits went): an ACTION row's
 * summary is team-visible — the team is entitled to see what was done in its name;
 * a PROMPT row's summary is the author's own — a teammate sees who spent how many
 * credits and when, never the question they typed. Hiding BOTH (the old naive
 * "only my own rows" rule) showed an admin four blank rows with a teammate's name
 * on them, withholding the one thing the team is entitled to. Back-filled rows
 * (kind NULL) stay PRIVATE — they can't be classified after the fact, and a wrong
 * guess publishes somebody's question. */
export async function readUsageLog(
  env: Env,
  teamId: string,
  viewerId: string,
  limit: number
): Promise<UsageLogRow[]> {
  const res = await env.DB.prepare(
    `SELECT id, created_at AS createdAt, actor_name AS actorName, credits, source, kind,
            CASE WHEN kind = 'action' OR actor_id = ? THEN summary ELSE NULL END AS summary
     FROM agent_usage_log WHERE team_id = ? ORDER BY created_at DESC LIMIT ?`
  )
    .bind(viewerId, teamId, limit)
    .all<UsageLogRow>()
  return res.results ?? []
}
