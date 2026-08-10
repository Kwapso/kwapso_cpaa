// ONE mint for login codes. The real send door (email/start) and the staging-only
// admin test-login door both go through THIS function, so the hashed-at-rest
// storage, the TTL and every throttle can never differ between them.
// WHY it exists: login codes must never appear anywhere but the user's inbox —
// the old staging echo (code in the API response + a toast) was deleted outright, and automated tests now sign in through the admin door instead.

import { ulid } from "../../../../shared/workers/id"
import type { Env } from "../env"
import {
  CODE_TTL_MINUTES,
  MAX_CODES_PER_HOUR,
  MAX_SENDS_GLOBAL_PER_HOUR,
  MAX_SENDS_PER_IP_PER_HOUR,
  RESEND_COOLDOWN_SECONDS,
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
 * addresses, or somehow rotates the header — is bounded by the GLOBAL ceiling,
 * which no header value can move. */
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
  //   3. this caller's hourly send budget;
  //   4. the environment's hourly send budget.
  const minted = await env.DB.prepare(
    `INSERT INTO login_codes (id, email, code_hash, expires_at, created_at, sent_ip, sends)
     SELECT ?, ?, ?, ?, ?, ?, 1
      WHERE NOT EXISTS (SELECT 1 FROM login_codes
                         WHERE email = ? AND consumed_at IS NULL AND created_at > ?)
        AND ((SELECT COUNT(*) FROM login_codes WHERE email = ? AND created_at > ?) < ?
             OR NOT EXISTS (SELECT 1 FROM login_codes WHERE email = ? AND consumed_at IS NULL))
        AND ${SENDS_FROM_IP} < ?
        AND ${SENDS_EVERYWHERE} < ?`
  )
    .bind(
      ulid(), email, hash, expires, nowIso, sentIp,
      email, cooldownFrom,
      email, hourAgo, MAX_CODES_PER_HOUR,
      email,
      sentIp, hourAgo, MAX_SENDS_PER_IP_PER_HOUR,
      hourAgo, MAX_SENDS_GLOBAL_PER_HOUR
    )
    .run()
  if ((minted.meta.changes ?? 0) > 0) return { code }

  // At the address's cap: replace the newest unconsumed code rather than adding a
  // row — a fresh secret, a fresh TTL, a fresh attempt budget, no growth. The
  // cooldown and both send budgets ride this UPDATE too (a rotation is an email
  // like any other), and `sends` counts it so the budgets see it.
  const rotated = await env.DB.prepare(
    `UPDATE login_codes
        SET code_hash = ?, expires_at = ?, created_at = ?, attempts = 0,
            sends = sends + 1, sent_ip = ?
      WHERE id = (SELECT id FROM login_codes WHERE email = ? AND consumed_at IS NULL
                  ORDER BY created_at DESC LIMIT 1)
        AND NOT EXISTS (SELECT 1 FROM login_codes
                         WHERE email = ? AND consumed_at IS NULL AND created_at > ?)
        AND ${SENDS_FROM_IP} < ?
        AND ${SENDS_EVERYWHERE} < ?`
  )
    .bind(
      hash, expires, nowIso, sentIp,
      email,
      email, cooldownFrom,
      sentIp, hourAgo, MAX_SENDS_PER_IP_PER_HOUR,
      hourAgo, MAX_SENDS_GLOBAL_PER_HOUR
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
  if ((spent?.mine ?? 0) >= MAX_SENDS_PER_IP_PER_HOUR || (spent?.everyone ?? 0) >= MAX_SENDS_GLOBAL_PER_HOUR)
    return {
      error: "too_many_sends",
      message: `That's a lot of sign-in codes from one place. Try again a bit later.`,
      status: 429,
    }
  return {
    error: "too_soon",
    message: `A code was just sent. Give it a moment, then ask again.`,
    status: 429,
  }
}
