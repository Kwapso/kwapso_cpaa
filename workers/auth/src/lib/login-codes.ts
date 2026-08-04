// ONE mint for login codes. The real send door (email/start) and the staging-only
// admin test-login door both go through THIS function, so the hashed-at-rest
// storage, the TTL and the per-hour throttle can never differ between them.
// WHY it exists: login codes must never appear anywhere but the user's inbox —
// the old staging echo (code in the API response + a toast) was deleted outright, and automated tests now sign in through the admin door instead.

import { ulid } from "../../../../shared/workers/id"
import type { Env } from "../env"
import { CODE_TTL_MINUTES, MAX_CODES_PER_HOUR } from "./constants"
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
  // Throttle: at most MAX_CODES_PER_HOUR codes per email per hour — shared by
  // BOTH doors, so the test door can't be used to spray codes either.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM login_codes WHERE email = ? AND created_at > ?"
  )
    .bind(email, hourAgo)
    .first<{ n: number }>()
  if ((recent?.n ?? 0) >= MAX_CODES_PER_HOUR)
    return { error: "too_many_codes", message: "Too many codes requested. Try again in an hour.", status: 429 }

  const code = randomCode()
  const now = new Date()
  await env.DB.prepare(
    `INSERT INTO login_codes (id, email, code_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(
      ulid(),
      email,
      await sha256Hex(`${code}:${email}`),
      new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000).toISOString(),
      now.toISOString()
    )
    .run()
  return { code }
}
