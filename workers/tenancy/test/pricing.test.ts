// THE RATE CARD, AND THE ARITHMETIC ON TOP OF IT.
//
// A wrong price does not fail anything. It produces a confident number that
// somebody plans with — which is how a 12-cent bench run came to be reported as
// $2.40, and how the same file later printed a Claude-priced figure for a
// Cloudflare model. There is nothing about a cost report that goes red when it
// is wrong, so this is the thing that does.
//
// It pins three properties:
//
//   · the CONSTANTS are what COSTS.md quotes, to the digit, so the prose and the
//     code cannot drift apart in a commit that only touches one of them;
//   · the ARITHMETIC is right, including the two decisions that look like bugs
//     and are not — a cached prompt token is charged at full input rate, and an
//     unpriced model answers with a NEGATIVE number rather than zero;
//   · the neuron conversion agrees with the dollar one, because reconciling the
//     rate card against the account's own meter is the whole reason both are
//     here, and a conversion nobody checks is a conversion nobody can use.
//
// It lives in tenancy's suite because tenancy is the worker that SPENDS this
// table — the nightly ops digest turns metered tokens into money with it.

import { describe, expect, it } from "vitest"

import {
  aiCostUsd,
  aiNeurons,
  emailCostUsd,
  MODEL_PRICES,
  NEURON_USD_PER_1000,
  PRICES_READ_ON,
  r2StorageUsdPerMonth,
  R2_USD_PER_GB_EGRESS,
  RESEND_FREE_PER_DAY,
  UNPRICED_MODEL,
  usd,
  vectorizeQueryCostUsd,
  vectorizeStorageUsdPerMonth,
} from "@shared/workers/pricing"

const KIMI = "@cf/moonshotai/kimi-k2.6"

describe("the published prices are the ones COSTS.md quotes", () => {
  it("every rate matches developers.cloudflare.com, read 2026-09-05", () => {
    expect(PRICES_READ_ON).toBe("2026-09-05")
    expect(MODEL_PRICES[KIMI]).toEqual({
      inPerM: 0.95,
      outPerM: 4.0,
      neuronsPerMIn: 86_364,
      neuronsPerMOut: 363_636,
    })
    expect(MODEL_PRICES["@cf/openai/gpt-oss-120b"].inPerM).toBe(0.35)
    expect(MODEL_PRICES["@cf/meta/llama-4-scout-17b-16e-instruct"].outPerM).toBe(0.85)
    expect(MODEL_PRICES["@cf/baai/bge-m3"].inPerM).toBe(0.012)
    // An embedding model writes no tokens. A non-zero output rate here would
    // silently inflate every knowledge figure in COSTS.md.
    expect(MODEL_PRICES["@cf/baai/bge-m3"].outPerM).toBe(0)
    expect(NEURON_USD_PER_1000).toBe(0.011)
    expect(RESEND_FREE_PER_DAY).toBe(100)
  })

  it("R2 egress is zero, and it is a stated number rather than an omission", () => {
    // The most load-bearing fact in COSTS.md's storage section. Written as a
    // constant so a future reader finds a decision rather than a missing line.
    expect(R2_USD_PER_GB_EGRESS).toBe(0)
  })
})

describe("the arithmetic", () => {
  it("prices a turn at the published per-token rate", () => {
    // 34,672 input + 400 output, the shape measure-preamble.mjs reports for one
    // step of a real turn.
    const cost = aiCostUsd(KIMI, { input: 34_672, output: 400 })
    expect(cost).toBeCloseTo((34_672 / 1e6) * 0.95 + (400 / 1e6) * 4.0, 10)
    // COSTS.md § 2 quotes $0.0345 for one step. If this moves, that moves.
    expect(cost).toBeCloseTo(0.0345, 4)
  })

  it("charges a CACHED prompt token at full input rate, deliberately", () => {
    // Two thirds of September's prompt tokens came back cached (measured on
    // staging, 2026-09-05) and Cloudflare publishes no cached rate for this
    // model — so full price is the conservative answer AND the only one the
    // published table supports. A discount appearing here without a source is
    // how every total in the system would quietly become optimistic.
    const split = aiCostUsd(KIMI, { input: 1_000, output: 0, cacheRead: 1_000 })
    const whole = aiCostUsd(KIMI, { input: 2_000, output: 0 })
    expect(split).toBe(whole)
  })

  it("answers a NEGATIVE number for an unpriced model, never zero", () => {
    // The `neurons ?? 0` mistake, refused by construction: a missing measurement
    // must not be able to flow into a total as "this was free".
    expect(aiCostUsd("@cf/nobody/never-priced", { input: 1e6 })).toBe(UNPRICED_MODEL)
    expect(aiNeurons("@cf/nobody/never-priced", { input: 1e6 })).toBe(UNPRICED_MODEL)
    expect(UNPRICED_MODEL).toBeLessThan(0)
    expect(usd(UNPRICED_MODEL)).toBe("unpriced")
  })

  it("the neuron figure and the dollar figure describe the same call", () => {
    // The reconciliation. Neurons are what the account's analytics answer in, so
    // a per-token dollar figure is only checkable if the same inputs produce the
    // matching neuron count. One million input tokens, by definition.
    expect(aiNeurons(KIMI, { input: 1e6 })).toBeCloseTo(86_364, 6)
    // …and at $0.011 per 1,000 neurons that is within a whisker of the published
    // dollar rate, which is the sanity check on the whole table: if these two
    // ever disagree by more than rounding, one of them was mistyped.
    const viaNeurons = (86_364 / 1_000) * NEURON_USD_PER_1000
    expect(viaNeurons).toBeCloseTo(MODEL_PRICES[KIMI].inPerM, 2)
  })

  it("prices email, Vectorize and R2 the way COSTS.md does", () => {
    // One email at the Pro plan's margin: $20 / 50,000.
    expect(emailCostUsd(1)).toBeCloseTo(0.0004, 10)
    expect(emailCostUsd(1_000)).toBeCloseTo(0.4, 10)
    // A two-stage knowledge search, 2,048 queried dimensions.
    expect(vectorizeQueryCostUsd(2_048)).toBeCloseTo(0.00002048, 12)
    // The measured index: 9,173 chunks at 1,024 dimensions.
    expect(vectorizeStorageUsdPerMonth(9_173, 1_024)).toBeCloseTo((9_173 * 1_024 / 1e8) * 0.05, 10)
    // One gibibyte for a month, over the included 10 GB.
    expect(r2StorageUsdPerMonth(1024 * 1024 * 1024)).toBeCloseTo(0.015, 10)
  })

  it("writes money at four decimals below a dollar, because these figures are fractions of a cent", () => {
    // Rounding a per-action cost to two decimals makes every one of them $0.00,
    // which is exactly the impression this file exists to prevent.
    expect(usd(0.0019)).toBe("$0.0019")
    expect(usd(2_186)).toBe("$2186.00")
  })
})
