// WHAT A THING COSTS — the one place a published price is written down, and the
// arithmetic that turns a measured row into money.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
//
// Until 2026-09-05 the repository held no price at all. `grep -rn '\$' *.md`
// returned nothing, and every cost fact lived in a source comment or a test:
// "about $5 a month per tool" in one, "16,593 neurons, about $0.18" in another,
// both true, neither reachable from the other, and neither in a unit anybody
// bills in. So "what does a seat cost me?" was an archaeology exercise, and the
// one measured figure disagreed with the published rate by 8.4x with nothing to
// reconcile it against.
//
// The rule this file follows is the same one CONVENTIONS.md applies to caps: a
// number that governs money is DATA with its source beside it, not a literal at
// the call site. COSTS.md is the prose; this is the arithmetic, and the two must
// not disagree — `workers/tenancy/test/pricing.test.ts` pins every constant here
// against the figures COSTS.md quotes.
//
// ── HOW TO KEEP IT HONEST ───────────────────────────────────────────────────
//
// Every constant carries the page it was read from and the day it was read.
// When a vendor changes a price, change it HERE, change the date, and re-run
// `node scripts/ai-spend.mjs` — the estate's real spend is computed from these
// numbers and the meter rows, so a stale rate is a wrong answer rather than a
// stale comment. Nothing in here was measured by SPENDING: every figure is off a
// public pricing page, read on the date stated.
//
// ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
//
// Anthropic. The workers call it nowhere (every model call is Workers AI over
// the `AI` binding); it bills only from `scripts/`, on the owner's PERSONAL key,
// which is a development cost and not the product's. COSTS.md inventories it as
// a billing surface anyway, because a surface nobody has written down is the one
// that surprises somebody.

/** THE DAY EVERY PRICE BELOW WAS READ OFF ITS VENDOR'S OWN PAGE.
 *
 * One date for the lot, because they were read in one sitting and a table with
 * per-row dates invites the half-refresh that leaves you unable to say when the
 * total was true. Re-read them together or not at all. */
export const PRICES_READ_ON = "2026-09-05"

/** WORKERS AI, PER MILLION TOKENS, from
 * developers.cloudflare.com/workers-ai/platform/pricing (read PRICES_READ_ON).
 *
 * Cloudflare bills NEURONS ($0.011 per 1,000, with 10,000/day free on the
 * Workers Paid plan) and publishes a per-token rate beside a neuron rate for
 * each model. The per-token rate is what a turn can be priced against before it
 * runs, so it is what this table holds; `neuronsPerMIn`/`neuronsPerMOut` are
 * kept beside it because the ACCOUNT's analytics answer in neurons, and being
 * able to reconcile the two is the whole reason the 8.4x disagreement went
 * unresolved for a week.
 *
 * Only the models this app can actually reach are listed. A model added to a
 * wrangler var without a line here is priced at zero, which is why
 * `aiCostUsd` refuses to guess — see `UNPRICED_MODEL`. */
export const MODEL_PRICES: Record<
  string,
  { inPerM: number; outPerM: number; neuronsPerMIn: number; neuronsPerMOut: number }
> = {
  // The assistant's engine, pinned in workers/data-ops/wrangler.jsonc in BOTH
  // environments and matched by DEFAULT_AGENT_MODEL.
  "@cf/moonshotai/kimi-k2.6": {
    inPerM: 0.95,
    outPerM: 4.0,
    neuronsPerMIn: 86_364,
    neuronsPerMOut: 363_636,
  },
  // The previous engine, kept because staging history and every bench run before
  // 1 Sep 2026 was measured on it — pricing an old row at today's engine would
  // silently rewrite what those runs cost.
  "@cf/openai/gpt-oss-120b": {
    inPerM: 0.35,
    outPerM: 0.75,
    neuronsPerMIn: 31_818,
    neuronsPerMOut: 68_182,
  },
  // The cheap path: the model that WRITES a knowledge answer (R23) and the
  // inline text jobs in shared/workers/model-text.ts.
  "@cf/meta/llama-4-scout-17b-16e-instruct": {
    inPerM: 0.27,
    outPerM: 0.85,
    neuronsPerMIn: 24_545,
    neuronsPerMOut: 77_273,
  },
  // Embeddings. Input only — it writes no tokens.
  "@cf/baai/bge-m3": {
    inPerM: 0.012,
    outPerM: 0,
    neuronsPerMIn: 1_075,
    neuronsPerMOut: 0,
  },
}

/** $ per 1,000 neurons, and the daily neurons a Workers Paid account gets free.
 * Same page, same date. The free allowance is per ACCOUNT per day, not per team
 * — which is why a per-team allowance (AGENT_FREE_DAILY) is a product decision
 * and not a passthrough of this one. */
export const NEURON_USD_PER_1000 = 0.011
export const FREE_NEURONS_PER_DAY = 10_000

/** VECTORIZE, from developers.cloudflare.com/vectorize/platform/pricing (read
 * PRICES_READ_ON). Dimensions, not vectors: a query costs
 * (dimensions x vectors compared) and storage costs (dimensions x vectors held).
 * Included monthly on Workers Paid: 50M queried, 10M stored. */
export const VECTORIZE_USD_PER_M_QUERIED_DIMS = 0.01
export const VECTORIZE_USD_PER_100M_STORED_DIMS = 0.05

/** RESEND, from resend.com/pricing (read PRICES_READ_ON). Free is 3,000/month
 * AND 100/day — the daily half is the one that bites first on a busy morning.
 * Pro is $20/month for 50,000, so a marginal email inside the plan is
 * 20/50000 = $0.0004; past it, $0.90 per 1,000. */
export const RESEND_FREE_PER_MONTH = 3_000
export const RESEND_FREE_PER_DAY = 100
export const RESEND_PRO_USD_PER_MONTH = 20
export const RESEND_PRO_EMAILS = 50_000
export const RESEND_OVERAGE_USD_PER_1000 = 0.9

/** THE WORKERS PAID PLAN, from the cloudflare_usage skill's own pricing
 * reference (`~/.claude/skills/cloudflare_usage/references/pricing.md`, dated
 * 2026-07, itself sourced from developers.cloudflare.com/workers/platform/pricing).
 * Only the lines this app can move are here. R2 has NO egress charge at all,
 * which is the single most load-bearing fact in the storage section of COSTS.md
 * — every file this product serves is served for the cost of the request. */
export const PLAN_USD_PER_MONTH = 5
export const WORKERS_USD_PER_M_REQUESTS = 0.3
export const D1_USD_PER_M_ROWS_WRITTEN = 1.0
export const D1_USD_PER_GB_MONTH = 0.75
export const R2_USD_PER_GB_MONTH = 0.015
export const R2_USD_PER_M_CLASS_A = 4.5
export const R2_USD_PER_M_CLASS_B = 0.36
export const R2_USD_PER_GB_EGRESS = 0

/** Included monthly allowances on the same plan, so a figure can say "and this
 * is still inside what you already pay for" rather than only "this is what it
 * would cost at the margin". */
export const INCLUDED_WORKERS_REQUESTS = 10_000_000
export const INCLUDED_D1_ROWS_WRITTEN = 50_000_000
export const INCLUDED_D1_STORAGE_GB = 5
export const INCLUDED_R2_STORAGE_GB = 10
export const INCLUDED_R2_CLASS_A = 1_000_000

/** What `aiCostUsd` answers with when it is handed a model nothing has priced.
 * A NEGATIVE number, on purpose: zero is a plausible cost and would flow into a
 * total as "this was free", which is exactly the mistake
 * `neurons: usage.neurons ?? 0` made in the bench — a missing measurement
 * presented as a measurement of nothing. A caller must check. */
export const UNPRICED_MODEL = -1

/** WHAT ONE MODEL CALL COST, from the tokens the provider reported.
 *
 * `cacheRead` is priced at FULL input rate, and that is a decision rather than an
 * oversight — one taken after measuring, because the assumption underneath it
 * turned out to be wrong.
 *
 * model.ts records that the `x-session-affinity` header "does nothing through
 * `env.AI.run`, which is the door the worker actually uses", and concluded the
 * shipped path never gets a cache hit. The meter disagrees. Read off
 * `agent_usage_log` on staging, 2026-09-05 (`node scripts/ai-spend.mjs`):
 *
 *     Aug 2026   6,291,515 fresh input   5,945,863 cache-read   657,244 cache-write
 *     Sep 2026     902,555 fresh input   1,778,240 cache-read         0 cache-write
 *
 * September is entirely on the Workers AI path (the Anthropic key was disabled
 * on 28 Aug, and the zero cache-WRITE column is the tell — Cloudflare reports
 * `prompt_tokens_details.cached_tokens` and never a write). So two thirds of
 * September's prompt tokens were served from a prefix cache that the code says
 * cannot exist.
 *
 * WHAT IS STILL UNKNOWN IS THE RATE. Cloudflare publishes ONE input price for
 * kimi-k2.6 and no cached-token rate beside it (read 2026-09-05), so there is
 * nothing to price a cached token at except the input rate — and guessing a
 * discount would make every total in this system quietly optimistic. Full price
 * is therefore the conservative answer AND the one the published table supports.
 * If a cached rate appears, it goes here with its source and the totals fall;
 * they will never rise.
 *
 * Returns UNPRICED_MODEL for a model with no line in the table — never 0. */
export function aiCostUsd(
  model: string,
  usage: { input?: number; output?: number; cacheRead?: number }
): number {
  const p = MODEL_PRICES[model]
  if (!p) return UNPRICED_MODEL
  const input = (usage.input ?? 0) + (usage.cacheRead ?? 0)
  const output = usage.output ?? 0
  return (input / 1_000_000) * p.inPerM + (output / 1_000_000) * p.outPerM
}

/** The same call in Cloudflare's own billing unit, so a figure computed here can
 * be checked against the account's Workers AI analytics without a conversion
 * anybody has to do by hand. This is the reconciliation that was missing. */
export function aiNeurons(
  model: string,
  usage: { input?: number; output?: number; cacheRead?: number }
): number {
  const p = MODEL_PRICES[model]
  if (!p) return UNPRICED_MODEL
  const input = (usage.input ?? 0) + (usage.cacheRead ?? 0)
  const output = usage.output ?? 0
  return (input / 1_000_000) * p.neuronsPerMIn + (output / 1_000_000) * p.neuronsPerMOut
}

/** What N emails cost at the margin, inside the Pro plan. Below the free tier
 * this is an overestimate and deliberately so — a cost model that answers "free"
 * for the thing you are about to do a lot more of is not a cost model. */
export function emailCostUsd(count: number): number {
  return count * (RESEND_PRO_USD_PER_MONTH / RESEND_PRO_EMAILS)
}

/** One Vectorize search: dimensions compared = (index dimensions x vectors the
 * namespace holds is NOT how Cloudflare bills it) — the billed figure is the
 * QUERIED dimensions, which is the query vector's own dimension count per
 * search. Pass `dims x searches`. */
export function vectorizeQueryCostUsd(queriedDims: number): number {
  return (queriedDims / 1_000_000) * VECTORIZE_USD_PER_M_QUERIED_DIMS
}

/** A month of holding N vectors of D dimensions. The knowledge base's index is
 * account-wide and partitioned by namespace (R26), so this is one number for the
 * whole estate rather than a per-team one. */
export function vectorizeStorageUsdPerMonth(vectors: number, dims: number): number {
  return ((vectors * dims) / 100_000_000) * VECTORIZE_USD_PER_100M_STORED_DIMS
}

/** A month of holding N bytes in R2, at the margin above the included 10 GB. */
export function r2StorageUsdPerMonth(bytes: number): number {
  return (bytes / (1024 * 1024 * 1024)) * R2_USD_PER_GB_MONTH
}

/** Money, written the way a person reads it. Four decimal places because the
 * interesting figures in this system are fractions of a cent per action and
 * rounding them to two makes every one of them $0.00. */
export function usd(amount: number): string {
  if (amount === UNPRICED_MODEL) return "unpriced"
  return `$${amount.toFixed(amount >= 1 ? 2 : 4)}`
}
