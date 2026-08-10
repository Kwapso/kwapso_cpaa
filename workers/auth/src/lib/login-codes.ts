// A login code's WHOLE life, in one file: minted here (mintLoginCode), spent here
// (verifyLoginCode). The real send door (email/start) and the staging-only admin
// test-login door both go through the same mint, so the hashed-at-rest storage,
// the TTL and every throttle can never differ between them — and the verify door
// sits beside it because the two halves share the same ledger row and the same
// question, "who is this caller, and what have they already spent?".
// WHY it exists: login codes must never appear anywhere but the user's inbox —
// the old staging echo (code in the API response + a toast) was deleted outright, and automated tests now sign in through the admin door instead.

import { ulid } from "../../../../shared/workers/id"
import type { Env } from "../env"
import {
  CODE_TTL_MINUTES,
  MAX_CODE_ATTEMPTS,
  MAX_CODE_ATTEMPTS_ELSEWHERE,
  MAX_CODES_PER_HOUR,
  MAX_SENDS_PER_IP_PER_HOUR,
  MAX_SENDS_PER_IP_WHEN_RATIONED,
  MAX_TEST_LOGIN_SENDS_PER_HOUR,
  TEST_LOGIN_BUCKET,
  RESEND_COOLDOWN_SECONDS,
  SENDS_EVERYWHERE_BEFORE_RATIONING,
} from "./constants"
import { randomCode, sha256Hex } from "./crypto"

export type MintFail = { error: string; message: string; status: number }

/** Which bucket a send is counted against. `CF-Connecting-IP` is written by the
 * Cloudflare edge on every request that reaches us through the gateway — a value
 * a client sets itself is overwritten there, so it can't be forged from outside.
 * FAIL TOWARD REFUSING: a request that arrives WITHOUT one (never the public
 * door in production) doesn't get a free pass — it joins a single shared
 * "unknown" bucket, so all header-less callers spend one caller's quota between
 * them. And the one thing an IP bucket can never bound — a caller who rotates
 * addresses, or somehow rotates the header — is what the environment's ration
 * answers: over the line, a rotated header buys another SMALL share, never an
 * escape, and never anybody else's turn. */
export function clientIp(request: Request): string {
  const raw = request.headers.get("CF-Connecting-IP") ?? ""
  // Attacker-shaped input on a pre-auth door: strip NULs (D1 rejects them → a
  // 500), trim, and cap at the longest real IPv6-with-zone. Truncate rather than
  // refuse — a strange header must not be able to break sign-in.
  const clean = raw.split(String.fromCharCode(0)).join("").trim().slice(0, 45)
  return clean || "unknown"
}

/** SUM of the emails sent from one bucket inside the window. Sends, not rows: a
 * rotation (below) emails a fresh code without inserting a row, so `COUNT(*)`
 * would let a caller sitting on a handful of rotatable rows send one email a
 * minute per address forever, having paid for them once. */
const SENDS_FROM_IP = "(SELECT COALESCE(SUM(sends), 0) FROM login_codes WHERE sent_ip = ? AND created_at > ?)"
const SENDS_EVERYWHERE = "(SELECT COALESCE(SUM(sends), 0) FROM login_codes WHERE created_at > ?)"

/** The caller's whole send budget, as ONE clause both write paths carry — so the
 * mint and the rotation can never enforce different rules.
 *
 *   line 1  this caller's hourly ceiling. Always.
 *   line 2  the environment's. Note it is an OR, not an AND: the global number
 *           does not refuse anyone by itself. Under the line, it is silent. Over
 *           it, every caller narrows to the small rationed share — so the flood,
 *           which is far over that share, stops, and the person asking for their
 *           first code this hour does not. See constants.ts for the trade-off
 *           this buys and what it costs.
 *
 * The binds are built by sendBudgetArgs BELOW, never by hand: eight values in one
 * order, where a swap would be a silent security hole rather than a broken test. */
const WITHIN_SEND_BUDGET = `${SENDS_FROM_IP} < ?
        AND (${SENDS_EVERYWHERE} < ? OR ${SENDS_FROM_IP} < ?)`

/** The eight values WITHIN_SEND_BUDGET reads, in its order. */
const sendBudgetArgs = (sentIp: string, hourAgo: string) => [
  sentIp, hourAgo, ceilingFor(sentIp),
  hourAgo, SENDS_EVERYWHERE_BEFORE_RATIONING,
  sentIp, hourAgo, rationedCeilingFor(sentIp),
]

/** The test door carries its own ceiling because it is not the thing these
 * budgets guard against — see TEST_LOGIN_BUCKET. Everyone else is a caller. */
const ceilingFor = (sentIp: string) =>
  sentIp === TEST_LOGIN_BUCKET ? MAX_TEST_LOGIN_SENDS_PER_HOUR : MAX_SENDS_PER_IP_PER_HOUR

/** …and it is not rationed when the environment is busy, for the same reason: it
 * sends no mail, so it is not what a busy hour is measuring. */
const rationedCeilingFor = (sentIp: string) =>
  sentIp === TEST_LOGIN_BUCKET ? MAX_TEST_LOGIN_SENDS_PER_HOUR : MAX_SENDS_PER_IP_WHEN_RATIONED

/** Create + store a login code for `email` (hashed at rest, TTL'd, throttled).
 * Returns the PLAIN code exactly once — the caller decides where it goes: the
 * real door emails it and never returns it; the admin test-login door returns
 * it to the TEST_LOGIN_KEY holder instead of emailing. `sentIp` is the bucket the
 * send is charged to (see clientIp). */
export async function mintLoginCode(
  env: Env,
  email: string,
  sentIp: string
): Promise<{ code: string } | MintFail> {
  // THROTTLE THE SEND, NEVER THE SIGN-IN. The old rule refused for an HOUR once
  // five codes had been asked for — so an anonymous caller could burn a real
  // person's five and lock them out of their own account, and a legitimate
  // operator retrying a flaky email locked themselves out. Now:
  //   • a short cooldown limits how often an email goes out at all;
  //   • past the hourly cap the request ROTATES the live code in place instead of
  //     being refused, so the row count stays bounded and the person who owns the
  //     inbox can always get in;
  //   • and the CALLER carries two ceilings of their own (per-IP + global), so
  //     the door can't be walked down a mailing list.
  // Rotation is the only option regardless: codes are hashed at rest, so nobody —
  // including this function — can re-send digits that already went out.
  const now = new Date()
  const nowIso = now.toISOString()
  const cooldownFrom = new Date(now.getTime() - RESEND_COOLDOWN_SECONDS * 1000).toISOString()
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()

  const code = randomCode()
  const hash = await sha256Hex(`${code}:${email}`)
  const expires = new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000).toISOString()

  // EVERY limit rides the write (CONCURRENCY.md — the predicate in the WHERE, the
  // changed-row count read back). Read-then-write was burstable: N concurrent
  // requests all read "0 codes this minute" and all sent one, so the cooldown
  // and the hourly cap were both suggestions under load. Now the four rules are
  // ONE atomic statement, and SQLite serializes it:
  //   1. the per-address cooldown — nothing unconsumed newer than cooldownFrom;
  //   2. the per-address hourly cap — unless nothing live is left to rotate, in
  //      which case a mint is the only way the inbox's owner gets back in;
  //   3. the caller's send budget (their own ceiling, plus the ration the
  //      environment's hour imposes on everyone when it's crowded).
  const minted = await env.DB.prepare(
    `INSERT INTO login_codes (id, email, code_hash, expires_at, created_at, sent_ip, sends)
     SELECT ?, ?, ?, ?, ?, ?, 1
      WHERE NOT EXISTS (SELECT 1 FROM login_codes
                         WHERE email = ? AND consumed_at IS NULL AND created_at > ?)
        AND ((SELECT COUNT(*) FROM login_codes WHERE email = ? AND created_at > ?) < ?
             OR NOT EXISTS (SELECT 1 FROM login_codes WHERE email = ? AND consumed_at IS NULL))
        AND ${WITHIN_SEND_BUDGET}`
  )
    .bind(
      ulid(), email, hash, expires, nowIso, sentIp,
      email, cooldownFrom,
      email, hourAgo, MAX_CODES_PER_HOUR,
      email,
      ...sendBudgetArgs(sentIp, hourAgo)
    )
    .run()
  if ((minted.meta.changes ?? 0) > 0) return { code }

  // At the address's cap: replace the newest unconsumed code rather than adding a
  // row — a fresh secret, a fresh TTL, a fresh attempt budget, no growth. The
  // cooldown and the send budget ride this UPDATE too (a rotation is an email like
  // any other), and `sends` counts it so the budget sees it. `sent_ip` moves to
  // this caller: whoever just paid for a send is the person about to type the
  // code, and that is what earns the reserved attempt lane (see verifyLoginCode).
  const rotated = await env.DB.prepare(
    `UPDATE login_codes
        SET code_hash = ?, expires_at = ?, created_at = ?, attempts = 0,
            sends = sends + 1, sent_ip = ?
      WHERE id = (SELECT id FROM login_codes WHERE email = ? AND consumed_at IS NULL
                  ORDER BY created_at DESC LIMIT 1)
        AND NOT EXISTS (SELECT 1 FROM login_codes
                         WHERE email = ? AND consumed_at IS NULL AND created_at > ?)
        AND ${WITHIN_SEND_BUDGET}`
  )
    .bind(
      hash, expires, nowIso, sentIp,
      email,
      email, cooldownFrom,
      ...sendBudgetArgs(sentIp, hourAgo)
    )
    .run()
  if ((rotated.meta.changes ?? 0) > 0) return { code }

  // Refused — say WHICH wall was hit, in one read, on the refusal path only.
  // Guessing would tell someone waiting on a 60-second cooldown to "try later",
  // and someone who has spent their hour to "wait a moment".
  const spent = await env.DB.prepare(
    `SELECT COALESCE(SUM(CASE WHEN sent_ip = ? THEN sends END), 0) AS mine,
            COALESCE(SUM(sends), 0) AS everyone
       FROM login_codes WHERE created_at > ?`
  )
    .bind(sentIp, hourAgo)
    .first<{ mine: number; everyone: number }>()
  const mine = spent?.mine ?? 0
  const crowded = (spent?.everyone ?? 0) >= SENDS_EVERYWHERE_BEFORE_RATIONING
  const rationed = crowded && mine >= MAX_SENDS_PER_IP_WHEN_RATIONED
  if (mine >= MAX_SENDS_PER_IP_PER_HOUR || rationed) {
    // The one moment worth an operator's attention: the environment is over its
    // hourly line AND the ration is actually turning callers away. A console line,
    // not a row — this door is anonymous, and an alert an attacker can write on
    // demand is just a slower way to fill the database. The durable version of
    // this signal belongs at the edge, with the rule that should be stopping them.
    if (rationed) console.warn(`login send rationed: ${spent?.everyone} sends this hour, ${mine} from this caller`)
    return {
      // True as written now, which it wasn't before: only a caller who is
      // themselves over a budget reaches this line. Someone caught by an
      // environment-wide wall they had no part in used to be told the same thing.
      error: "too_many_sends",
      message: `That's a lot of sign-in codes from one place. Try again a bit later.`,
      status: 429,
    }
  }
  return {
    error: "too_soon",
    message: `A code was just sent. Give it a moment, then ask again.`,
    status: 429,
  }
}

/** The code's five tries, split into two lanes by WHO is asking. A caller whose
 * address matches the one the code was last SENT to (`sent_ip`) may spend all
 * five; anyone else may spend at most MAX_CODE_ATTEMPTS_ELSEWHERE of them, and the
 * rest stay reserved for the person who asked.
 *
 * WHY: this door is unauthenticated and keyed on an email address alone, so
 * anyone who knows an address can post junk at their code. When the cap was one
 * shared pool, five junk requests killed a freshly minted code and the person who
 * asked for it could not sign in — and sign-in is the only way into the product.
 * A guess is free; an ask costs a send from a throttled budget. So the free thing
 * gets the small lane and the costed thing earns the reserved one.
 *
 * A stranger can still take the reserved lane by ASKING for a code themselves —
 * but that emails a fresh code to the inbox's owner, spends one of the stranger's
 * thirty hourly sends, and is undone the moment the owner asks again. Bounded,
 * costed, and recoverable in under a minute, which the old shared pool was not.
 *
 * The brute-force bound is UNCHANGED: five wrong guesses, whoever makes them,
 * against a 1,000,000-wide code that lives ten minutes. Rotating addresses buys a
 * guesser nothing — the small lane belongs to the CODE, not to each caller.
 * The limits of an address as a name, said out loud: someone behind the same
 * gateway as the person signing in shares their lane, and header-less callers
 * share the "unknown" bucket the same way they share a send budget (see
 * clientIp). Both are the price of the only identifier a pre-sign-in door has. */
const ATTEMPTS_LEFT = "attempts < (CASE WHEN sent_ip = ? THEN ? ELSE ? END)"

/** The three values ATTEMPTS_LEFT reads, in its order. */
const attemptsLeftArgs = (callerIp: string) => [callerIp, MAX_CODE_ATTEMPTS, MAX_CODE_ATTEMPTS_ELSEWHERE]

/** Step 2 of email login, minus the session: check `code` against the live code
 * for `email` and consume it. Returns the row's id on success — the caller signs
 * the person in. `callerIp` is the bucket the try is charged to (see clientIp). */
export async function verifyLoginCode(
  env: Env,
  email: string,
  code: string,
  callerIp: string
): Promise<{ id: string } | MintFail> {
  const row = await env.DB.prepare(
    `SELECT id, code_hash, expires_at FROM login_codes
     WHERE email = ? AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`
  )
    .bind(email)
    .first<{ id: string; code_hash: string; expires_at: string }>()

  const now = new Date().toISOString()
  if (!row || row.expires_at <= now)
    return { error: "code_expired", message: "That code expired. Request a new one.", status: 400 }

  // COUNT FAILURES, NOT TRIES. The cap exists to bound GUESSING, and someone
  // holding the right digits has not guessed — so a correct code costs nothing,
  // and a person who asked on their laptop and typed it on their phone (a
  // different address, so the small lane) is not competing with strangers for
  // tries they never needed. The old shape had to charge every try because the
  // comparison happened after the write; both statements below carry the budget
  // in their own WHERE, so the check and the spend are still ONE statement
  // (CONCURRENCY.md — N concurrent guesses can't each read a stale count).
  if (row.code_hash !== (await sha256Hex(`${code}:${email}`))) {
    const charged = await env.DB.prepare(
      `UPDATE login_codes SET attempts = attempts + 1
        WHERE id = ? AND consumed_at IS NULL AND ${ATTEMPTS_LEFT}`
    )
      .bind(row.id, ...attemptsLeftArgs(callerIp))
      .run()
    // Nothing moved = this caller's lane is spent. Same words either way: a
    // refusal must never tell a stranger how much of someone else's budget is
    // left, and a real person only needs to know to ask for a fresh code.
    if ((charged.meta.changes ?? 0) === 0)
      return { error: "too_many_attempts", message: "Too many wrong tries. Request a new code.", status: 429 }
    return { error: "wrong_code", message: "That code isn't right. Check and try again.", status: 400 }
  }

  // Right code — but it still needs a live lane, or a brute-forcer who finally
  // lands on the digits past the cap would be waved through.
  const consumed = await env.DB.prepare(
    `UPDATE login_codes SET consumed_at = ? WHERE id = ? AND ${ATTEMPTS_LEFT}`
  )
    .bind(now, row.id, ...attemptsLeftArgs(callerIp))
    .run()
  if ((consumed.meta.changes ?? 0) === 0)
    return { error: "too_many_attempts", message: "Too many wrong tries. Request a new code.", status: 429 }
  return { id: row.id }
}
