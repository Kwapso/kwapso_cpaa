// ONE mint for login codes. The real send door (email/start) and the staging-only
// admin test-login door both go through THIS function, so the hashed-at-rest
// storage, the TTL and the per-hour throttle can never differ between them.
// WHY it exists: login codes must never appear anywhere but the user's inbox —
// the old staging echo (code in the API response + a toast) was deleted outright, and automated tests now sign in through the admin door instead.

import { ulid } from "../../../../shared/workers/id"
import type { Env } from "../env"
import { CODE_TTL_MINUTES, MAX_CODES_PER_HOUR, RESEND_COOLDOWN_SECONDS } from "./constants"
import { randomCode, sha256Hex } from "./crypto"

export type MintFail = { error: string; message: string; status: number }

/** Create + store a login code for `email` (hashed at rest, TTL'd, throttled).
 * Returns the PLAIN code exactly once — the caller decides where it goes: the
 * real door emails it and never returns it; the admin test-login door returns
 * it to the ADMIN_KEY holder instead of emailing. */
export async function mintLoginCode(
  env: Env,
  email: string
): Promise<{ code: string } | MintFail> {
  // THROTTLE THE SEND, NEVER THE SIGN-IN. The old rule refused for an HOUR once
  // five codes had been asked for — so an anonymous caller could burn a real
  // person's five and lock them out of their own account, and a legitimate
  // operator retrying a flaky email locked themselves out. Now:
  //   • a short cooldown limits how often an email goes out at all;
  //   • past the hourly cap the request ROTATES the live code in place instead of
  //     being refused, so the row count stays bounded and the person who owns the
  //     inbox can always get in.
  // Rotation is the only option regardless: codes are hashed at rest, so nobody —
  // including this function — can re-send digits that already went out.
  const now = new Date()
  const cooldownFrom = new Date(now.getTime() - RESEND_COOLDOWN_SECONDS * 1000).toISOString()
  // CONSUMED codes don't count. Signing in on a laptop and then on a phone a
  // moment later is one person doing something ordinary: the first code is spent,
  // so there is nothing to wait for. Without this clause the cooldown punishes
  // the successful case — the one user who has already proved they own the inbox.
  const justSent = await env.DB.prepare(
    "SELECT id FROM login_codes WHERE email = ? AND created_at > ? AND consumed_at IS NULL LIMIT 1"
  )
    .bind(email, cooldownFrom)
    .first<{ id: string }>()
  if (justSent)
    return {
      error: "too_soon",
      message: `A code was just sent. Give it a moment, then ask again.`,
      status: 429,
    }

  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM login_codes WHERE email = ? AND created_at > ?"
  )
    .bind(email, hourAgo)
    .first<{ n: number }>()

  const code = randomCode()
  const hash = await sha256Hex(`${code}:${email}`)
  const expires = new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000).toISOString()

  if ((recent?.n ?? 0) >= MAX_CODES_PER_HOUR) {
    // At the cap: replace the newest unconsumed code rather than adding a row —
    // a fresh secret, a fresh TTL, a fresh attempt budget, no growth.
    const rotated = await env.DB.prepare(
      `UPDATE login_codes SET code_hash = ?, expires_at = ?, created_at = ?, attempts = 0
       WHERE id = (SELECT id FROM login_codes WHERE email = ? AND consumed_at IS NULL
                   ORDER BY created_at DESC LIMIT 1)`
    )
      .bind(hash, expires, now.toISOString(), email)
      .run()
    if ((rotated.meta.changes ?? 0) > 0) return { code }
    // Nothing live to rotate (all consumed): fall through and mint one. The
    // cooldown above is what bounds this path.
  }

  await env.DB.prepare(
    `INSERT INTO login_codes (id, email, code_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(ulid(), email, hash, expires, now.toISOString())
    .run()
  return { code }
}
