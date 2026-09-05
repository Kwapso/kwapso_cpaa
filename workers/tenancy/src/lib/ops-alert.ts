// THE NIGHTLY OPS DIGEST — the half of the error store and the AI meter that
// was measured and never read.
//
// ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
//
// Both of these systems were built properly and then left waiting for somebody
// to come and look.
//
//   · `error_logs` records every unexpected failure in eight workers and two
//     front doors, keeps ninety days of it, and has a resolve workflow. Nothing
//     tells anybody a row appeared. Measured on staging, 2026-09-05: 5,086 rows,
//     live yesterday, last resolved 2026-08-17 — nineteen days and about 1,200
//     rows ago. `D1_ERROR: no such column: spine` appeared five times on
//     2026-09-01 and nobody was told.
//
//   · `agent_usage` meters every AI unit a team spends, `consumeAiUnit` refuses
//     the turn at the cap, and `refundAiUnits` gives back what bought nothing.
//     Nothing fires BEFORE the cap. The first thing anybody learns is a person
//     saying "the assistant stopped working", which is the meter doing its job
//     and the estate finding out last.
//
// ── WHY IT LIVES HERE ───────────────────────────────────────────────────────
//
// Tenancy already owns the estate's nightly work, already holds the core
// binding, and already has the ONE alert channel somebody chose: `ALERT_TO`, the
// address the 80%-full database alarm goes to. This is deliberately NOT a new
// channel. A second address to configure is a second address to forget, and the
// question "where should alerts go" is the owner's to answer once — he has
// answered it, and this uses the answer.
//
// ── THE SHAPE, AND WHAT IT REFUSES TO DO ────────────────────────────────────
//
// ONE MAIL A NIGHT, and none at all on a quiet night. Every part of it is a
// CHANGE — a signature seen for the first time, a signature that jumped, a team
// about to run out — never a standing total, because a nightly repeat of a
// standing problem is the mail people filter, and the thing you want unfiltered
// is the one that says something moved. That is the same ruling the size alarm
// follows (sharding.ts, "once per NEW alarm").
//
// EVERY READ IS BOUNDED and says so (R14). NOTHING IS WRITTEN: this reads three
// tables and sends one email. And it never throws into the cron — the caller
// records its failure the way it records the size alarm's (R12), because a
// digest that silently stopped is the same blindness this exists to end.

import { FREE_DAILY } from "@shared/workers/credits"
import {
  ERROR_LOG_RETENTION_DAYS,
  numberVar,
  OPS_HISTORY_CAP,
  OPS_QUOTA_TEAM_CAP,
  OPS_SIGNATURE_CAP,
} from "@shared/workers/limits"
import { sendBrandedEmail } from "@shared/workers/notify"
import { aiCostUsd, usd } from "@shared/workers/pricing"
import { brand } from "@shared/brand"
import type { Env } from "../env"

/** How much bigger than its recent daily average a signature has to get before
 * it counts as a spike. Three, because two is inside the noise of a working day
 * (one person retrying a broken screen produces two) and ten only ever fires on
 * a total outage, which somebody has already noticed. */
const SPIKE_FACTOR = 3

/** …and the floor under it, so a signature that went from one row a week to
 * four is not "a 28x spike". A number this small only reaches the mail with the
 * factor above it as well. */
const SPIKE_FLOOR = 10

/** Fraction of a team's daily AI allowance that counts as "about to run out".
 * 0.8 matches the database alarm's own threshold, on purpose: two alarms with
 * two different definitions of "nearly full" is a thing somebody has to hold in
 * their head. */
const QUOTA_WARN_AT = 0.8

/** HOW A FAILURE IS IDENTIFIED ACROSS TWO NIGHTS.
 *
 * A signature is the worker plus the first 80 characters of the message. Not the
 * `place`, which carries record ids on the cron rows and would make every team's
 * copy of one outage a different failure; not the whole message, for the same
 * reason. Measured against the live store: 5,086 rows collapse to 109 distinct
 * messages, so the prefix is already doing the discriminating and 80 characters
 * is comfortably inside the shortest of them.
 *
 * Computed in SQL so the grouping happens in the database rather than over five
 * thousand rows in a worker. */
const SIGNATURE_SQL = `source || ' · ' || substr(message, 1, 80)`

/** …AND THE HALF SQLITE CANNOT DO.
 *
 * Grouping on the message prefix is right and it is not enough, because plenty
 * of failures carry an ID INSIDE the first eighty characters. Measured against
 * the live store on 2026-09-05, the day before this shipped:
 *
 *     content · Error: D1_ERROR: internal error; reference = vf4c1
 *     content · Error: D1_ERROR: internal error; reference = p333t
 *     content · Error: D1_ERROR: internal error; reference = oa3pj
 *     …three more
 *
 * One fault. Six "new signatures", six lines in the mail, every night it
 * recurred — which is the noise this digest exists NOT to be. SQLite has no
 * REGEXP, so the grouping stays in the database (it is what bounds the rows
 * read) and the FOLDING happens here, over the handful of groups that came back.
 *
 * The rule is narrow on purpose: a run of four or more characters that mixes
 * LETTERS AND DIGITS is an identifier, not a word — no English word looks like
 * that — and a run of two or more digits is a count or an id. Ordinary prose
 * survives untouched, which is what keeps two genuinely different failures from
 * collapsing into one. */
export function foldSignature(sig: string): string {
  return sig
    .replace(/\b(?=[a-z]*\d)(?=\d*[a-z])[a-z0-9]{4,}\b/gi, "#")
    .replace(/\d{2,}/g, "#")
    .replace(/#(?:[\s:_-]*#)+/g, "#")
}

export type Signature = { sig: string; n: number }

export type OpsDigest = {
  /** Failures whose signature does not appear anywhere in the comparison
   * window — genuinely new, which is the only kind worth waking somebody for. */
  fresh: Signature[]
  /** Signatures that existed and jumped. */
  spiking: (Signature & { was: number })[]
  /** Signatures that did not fit under the cap, stated rather than dropped. */
  notShown: number
  /** Teams at or past QUOTA_WARN_AT of their free daily allowance with no
   * purchased credits left behind it. */
  nearQuota: { teamId: string; used: number; allowance: number; credits: number }[]
  /** Teams that did not fit under the cap. */
  moreTeams: number
  /** Yesterday's AI spend across the estate, in real money, from the tokens the
   * provider actually reported. */
  spend: { turns: number; input: number; output: number; usd: number; model: string }
}

/** Yesterday, as the store spells it. The window is a full 24 hours ending now
 * rather than a calendar day, because the cron's hour is a deployment detail and
 * "since this time yesterday" is true whatever hour somebody moves it to. */
function since(now: Date, hours: number): string {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString()
}

/** Merge rows whose signatures fold together, biggest first. */
function fold(rows: { sig: string; n: number }[]): Signature[] {
  const merged = new Map<string, number>()
  for (const r of rows) {
    const key = foldSignature(r.sig)
    merged.set(key, (merged.get(key) ?? 0) + Number(r.n))
  }
  return [...merged].map(([sig, n]) => ({ sig, n })).sort((a, b) => b.n - a.n)
}

/** READ THE NIGHT. Three reads, all bounded, none of them writing. */
export async function readOpsDigest(env: Env, now: Date, model: string): Promise<OpsDigest> {
  const day = since(now, 24)
  // R14: OPS_HISTORY_CAP — the comparison window is 30 days rather than the full
  // 90-day retention, and the reasoning is in limits.ts.
  const historyFrom = since(now, 24 * 30)

  // Last night's signatures, biggest first. R14: the read is capped at five
  // times the line budget rather than at the budget itself, because the FOLD
  // below merges rows — asking for exactly twenty raw groups could hand back
  // four folded ones and hide the rest.
  const todayRows = await env.DB.prepare(
    `SELECT ${SIGNATURE_SQL} AS sig, COUNT(*) AS n
       FROM error_logs
      WHERE at > ?
      GROUP BY sig
      ORDER BY n DESC
      LIMIT ${OPS_SIGNATURE_CAP * 5 + 1}`
  )
    .bind(day)
    .all<{ sig: string; n: number }>()
  const today = fold(todayRows.results ?? [])
  const notShown = Math.max(0, today.length - OPS_SIGNATURE_CAP)
  const shown = today.slice(0, OPS_SIGNATURE_CAP)

  // What those same signatures did BEFORE last night. Read as one grouped query
  // over the window rather than one query per signature: twenty round trips to
  // answer one question is the shape this repo's data door was measured to be
  // bad at (~400ms each).
  const priorRows = await env.DB.prepare(
    `SELECT sig, SUM(n) AS n FROM (
        SELECT ${SIGNATURE_SQL} AS sig, 1 AS n
          FROM error_logs
         WHERE at > ? AND at <= ?
         LIMIT ${OPS_HISTORY_CAP}
      ) GROUP BY sig`
  )
    .bind(historyFrom, day)
    .all<{ sig: string; n: number }>()
  // Folded the SAME way, or "have we seen this before" would answer no every
  // time an id changed — which is the whole failure the fold exists to end.
  const prior = new Map(fold(priorRows.results ?? []).map((r) => [r.sig, r.n]))

  const fresh: Signature[] = []
  const spiking: (Signature & { was: number })[] = []
  for (const row of shown) {
    const before = prior.get(row.sig) ?? 0
    if (before === 0) {
      fresh.push({ sig: row.sig, n: row.n })
      continue
    }
    // Its own daily rate over the window it was actually seen in, not over the
    // whole 30 days — a signature that started on Thursday has a Thursday-to-now
    // average, and dividing it by 30 would call every ordinary Friday a spike.
    const perDay = before / 30
    if (row.n >= SPIKE_FLOOR && row.n >= perDay * SPIKE_FACTOR)
      spiking.push({ sig: row.sig, n: row.n, was: Math.round(perDay) })
  }

  // THE METER, BEFORE THE LIMIT. `agent_usage` is keyed (team_id, period) with
  // period = 'YYYY-MM-DD', so today's row is the one that decides whether the
  // next turn is refused. R14: OPS_QUOTA_TEAM_CAP + 1, same reasoning as above.
  // The team's free daily allowance, through the ONE parse (`numberVar`) rather
  // than by hand — 0 and unset are different answers and `Number(x) || 25` gives
  // the same one for both, which is precisely the bug config-vars.test.ts exists
  // to catch. FREE_DAILY is the same default consumeAiUnit uses, so the digest
  // measures against the line that is actually enforced.
  const allowance = numberVar(env.AGENT_FREE_DAILY, FREE_DAILY)
  const quotaRows = await env.DB.prepare(
    `SELECT u.team_id AS teamId, u.used AS used, COALESCE(c.balance, 0) AS credits
       FROM agent_usage u
       LEFT JOIN agent_credits c ON c.team_id = u.team_id
      WHERE u.period = ? AND u.used >= ?
      ORDER BY u.used DESC
      LIMIT ${OPS_QUOTA_TEAM_CAP + 1}`
  )
    .bind(now.toISOString().slice(0, 10), Math.ceil(allowance * QUOTA_WARN_AT))
    .all<{ teamId: string; used: number; credits: number }>()
  const quota = quotaRows.results ?? []
  const moreTeams = Math.max(0, quota.length - OPS_QUOTA_TEAM_CAP)

  // WHAT LAST NIGHT ACTUALLY COST. `agent_usage_log` carries the tokens the
  // provider reported for each command (core 0027), so this is a measurement
  // rather than an estimate — the first one in the system that is stated in
  // money. A row whose token columns are NULL contributes zero tokens and is
  // still counted as a turn, so a total that looks impossibly cheap is visibly
  // a coverage problem rather than a cheap night.
  const spendRow = await env.DB.prepare(
    `SELECT COUNT(*) AS turns,
            COALESCE(SUM(input_tokens), 0) AS input,
            COALESCE(SUM(output_tokens), 0) AS output
       FROM agent_usage_log
      WHERE created_at > ?`
  )
    .bind(day)
    .first<{ turns: number; input: number; output: number }>()
  const input = spendRow?.input ?? 0
  const output = spendRow?.output ?? 0

  return {
    fresh,
    spiking,
    notShown,
    nearQuota: quota.slice(0, OPS_QUOTA_TEAM_CAP).map((r) => ({ ...r, allowance })),
    moreTeams,
    spend: {
      turns: spendRow?.turns ?? 0,
      input,
      output,
      usd: aiCostUsd(model, { input, output }),
      model,
    },
  }
}

/** Is there anything worth an envelope? Spend alone is not: a bill that is
 * simply continuing is not news, and a nightly cost email is the one people
 * filter first. It rides along WITH a reason to write, never as one. */
export function digestHasNews(d: OpsDigest): boolean {
  return d.fresh.length > 0 || d.spiking.length > 0 || d.nearQuota.length > 0
}

/** TELL A HUMAN — the same channel, the same failure contract and the same
 * loudness as `alertNewAlarms` beside it. Returns how many recipients it
 * reached; throws when it reached none, because a digest that could not be
 * delivered is the blindness it exists to end. */
export async function sendOpsDigest(
  env: Env,
  d: OpsDigest
): Promise<{ mailed: number; recipients: number }> {
  if (!digestHasNews(d)) return { mailed: 0, recipients: 0 }
  const to = (env.ALERT_TO ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
  if (!to.length)
    throw new Error(
      `${d.fresh.length} new and ${d.spiking.length} spiking error signature(s) and ${d.nearQuota.length} team(s) near their AI allowance, and ALERT_TO is not set, so nobody was emailed. Set ALERT_TO on the tenancy worker.`
    )

  const lines: string[] = []
  for (const f of d.fresh) lines.push(`NEW, ${f.n}x: ${f.sig}`)
  for (const s of d.spiking) lines.push(`UP, ${s.n}x today against about ${s.was}/day: ${s.sig}`)
  if (d.notShown)
    lines.push(
      `…and ${d.notShown} more signature(s) not listed — this is the ${OPS_SIGNATURE_CAP}-line ceiling, not the whole night.`
    )
  for (const q of d.nearQuota)
    lines.push(
      `Team ${q.teamId} has used ${q.used} of ${q.allowance} free AI units today with ${q.credits} credit(s) left.`
    )
  if (d.moreTeams) lines.push(`…and ${d.moreTeams} more team(s) near their allowance.`)
  lines.push(
    `Assistant spend in the last 24h: ${d.spend.turns} turn(s), ${d.spend.input} input and ${d.spend.output} output tokens on ${d.spend.model} = ${usd(d.spend.usd)}.`
  )

  const headline = d.fresh.length
    ? `${d.fresh.length} new error signature${d.fresh.length === 1 ? "" : "s"}`
    : d.spiking.length
      ? `${d.spiking.length} error signature${d.spiking.length === 1 ? "" : "s"} climbing`
      : `${d.nearQuota.length} team${d.nearQuota.length === 1 ? "" : "s"} near the AI allowance`

  let mailed = 0
  for (const address of to) {
    const ok = await sendBrandedEmail(env, address, `${brand.name}: ${headline}`, {
      heading: headline,
      intro: lines.join("\n"),
      // The action, not just the fact — the same rule the size alarm follows.
      footnote: `Read and resolve these at GET /api/data-ops/admin/errors (owner-gated, RUNBOOK.md). Rows older than ${ERROR_LOG_RETENTION_DAYS} days are swept nightly, so an unresolved signature does not wait forever to be looked at.`,
    })
    if (ok) mailed++
  }
  if (!mailed)
    throw new Error(
      `the nightly ops digest could not be emailed to any of ${to.length} recipient(s): ${headline}`
    )
  return { mailed, recipients: to.length }
}
