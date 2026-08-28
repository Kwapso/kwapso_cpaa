// WHY THE ASSISTANT COULDN'T ANSWER — one classification, made once, at the
// only place that can still see the provider's own answer.
//
// ════════════════════════════════════════════════════════════════════════════
// THE FAULT THIS EXISTS FOR. Every way a model turn can fail arrived at the
// person as one sentence: "The assistant had trouble just now and couldn't
// reply." That sentence is true of a refused key, an exhausted rate limit, a
// provider outage and a worker with no key configured at all — four different
// situations, three of which somebody can actually do something about, and one
// of which (a key that has been switched off) will not fix itself no matter how
// many times a person tries again. Telling them all to "try again in a moment"
// is the app guessing, out loud, wrongly.
//
// Earned on 2026-08-27: the model door answered `403 forbidden — "Request not
// allowed"` and the app said "had trouble just now". The owner would have
// retried, seen the same sentence, and concluded the assistant was broken.
//
// THE REASON IS A CODE, NEVER A SENTENCE, and that is the load-bearing part of
// the shape rather than a style preference. A worker cannot call `t(...)` — the
// translator is a client hook — so any English a worker writes is English a
// German reader gets (Law R28's oldest hole, and `knowledgeAnswer`'s `message`
// already sits in it). So this classifies, and the SCREEN says the words, in
// the reader's own language, from the catalogue.

/** A `429`'s own hint about how long to wait, when the provider sends one. */
const RETRY_AFTER = /retry-after[":\s]+(\d{1,5})/i

/**
 * WHY a model turn failed, as a closed set. Lives in `shared/types.ts` beside
 * the stream events that carry it, because both a worker and a screen name it.
 */
export type { ModelFailure } from "@shared/types"
import type { ModelFailure } from "@shared/types"

/** A model failure that knows WHY. The loop catches this, records it, and hands
 * the reason to the screen; anything else stays an unclassified `unavailable`. */
export class ModelError extends Error {
  constructor(
    readonly reason: ModelFailure,
    message: string
  ) {
    super(message)
    this.name = "ModelError"
  }
}

/**
 * A provider's HTTP answer → the one reason a person needs to hear.
 *
 * ORDER MATTERS AND IT IS NOT THE STATUS ORDER. A provider signals an exhausted
 * BALANCE with a 400 carrying `credit_balance_too_low`, which is a completely
 * different situation from a malformed request even though it is the same
 * status — and it is the one an owner can fix in two minutes. So the BODY is
 * read before the status is trusted.
 *
 * WHAT IS DELIBERATELY NOT DISTINGUISHED: a 401 from a 403. One is a key that
 * is wrong and the other is a key that is not allowed, and no person outside
 * the provider's own console can act on the difference. Both mean "the key is
 * not working", both need the same look at the same account, so they are one
 * reason with one sentence. A taxonomy finer than the actions available to the
 * reader is a taxonomy that makes them guess.
 */
export function classifyModelHttp(status: number, body: string): ModelFailure {
  const text = body.toLowerCase()
  if (text.includes("credit_balance") || text.includes("insufficient_quota") || text.includes("billing"))
    return "provider_out_of_credit"
  if (status === 401 || status === 403) return "refused"
  if (status === 429) return "rate_limited"
  // 529 is Anthropic's own "overloaded"; 502/503/504 are the ordinary gateway
  // shapes of the same thing. All four clear on their own, which is the only
  // property the sentence for them depends on.
  if (status === 529 || status === 502 || status === 503 || status === 504) return "overloaded"
  return "unavailable"
}

/** The provider's own "wait this long", in whole seconds, when it sent one and
 * it is short enough to be worth repeating to a person. Anything longer than an
 * hour is not a number anybody waits for, so it is dropped and the sentence
 * says "later" instead of a figure nobody trusts. */
export function retryAfterSeconds(body: string): number | undefined {
  const hit = RETRY_AFTER.exec(body)
  if (!hit) return undefined
  const seconds = Number(hit[1])
  return Number.isFinite(seconds) && seconds > 0 && seconds <= 3600 ? seconds : undefined
}
