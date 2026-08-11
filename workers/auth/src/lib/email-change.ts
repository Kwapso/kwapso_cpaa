// Email-change flow — change the address you sign in with. A 6-digit code goes
// to the NEW email (proving you control it); on verify we switch users.email,
// write an audit row (email_change_logs), sign out the user's OTHER devices, and
// warn the OLD email. All in the GLOBAL core DB — identity lives there, never in
// a team's database. The code lives in its own table so it can't be replayed as
// a login (see db/core/0005_email_change.sql).

import type { SessionUser } from "@shared/types"
import { ulid } from "@shared/workers/id"
import { publishSignOut } from "@shared/workers/realtime"
import type { Env } from "../env"
import { logAccountActivity } from "./account-activity"
import { randomCode, sha256Hex } from "./crypto"
import {
  normalizeEmail,
  sendEmailChangeCode,
  sendEmailChangedNotice,
  validateNewEmail,
} from "./email"
import { signOutOtherSessions } from "./sessions"
import { findUserByEmail, toSessionUser, type UserRow } from "./users"
import {
  CODE_TTL_MINUTES,
  MAX_CHANGE_CODES_PER_TARGET_PER_HOUR,
  MAX_CODE_ATTEMPTS,
  MAX_CODES_PER_HOUR,
} from "./constants"

/** A handled failure — the route turns this into the HTTP error response. */
export type ChangeFail = { error: string; message: string; status: number }

/** Step 1: validate the new address + send it a 6-digit confirmation code.
 * The code goes ONLY to the new inbox — never into the response (same law as
 * login: a code appears nowhere but the user's inbox, in any environment). */
export async function startEmailChange(
  env: Env,
  user: UserRow,
  newEmailRaw: string
): Promise<Record<string, never> | ChangeFail> {
  const shape = validateNewEmail(user.email, newEmailRaw)
  if (shape) return { ...shape, status: 400 }
  const newEmail = normalizeEmail(newEmailRaw)

  // THE ROW IS THE BUDGET (the discipline login-codes.ts already learned).
  //
  // This used to be SELECT COUNT(*) → compare → INSERT → send: four statements
  // with awaits between them, so a hundred simultaneous requests all read "none
  // this hour" and all sent. A read-then-write throttle is a suggestion under
  // load. The count now rides the INSERT's own WHERE, and SQLite serializes it —
  // one statement, so a burst spends exactly one budget.
  //
  // TWO ceilings, because this door has TWO victims:
  //   • the CALLER's, so one account can't spend the hour;
  //   • the TARGET's, so any number of accounts can't gang up on one inbox.
  // The second is the one that matters here. Unlike every other throttle in this
  // file, the person who receives this mail never asked for it and has no
  // account here — the caller names them. A per-user cap alone bounds what an
  // ACCOUNT spends, and accounts are free to anyone with an inbox of their own.
  //
  // ONE refusal for both, on purpose: "you have asked too often" and "this
  // address has been asked about too often" are different sentences, and telling
  // them apart would say whether someone ELSE is already asking about that
  // address. A throttle must not become an oracle.
  const now = new Date()
  const nowIso = now.toISOString()
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
  const code = randomCode()
  const id = ulid()

  const charged = await env.DB.prepare(
    `INSERT INTO email_change_codes (id, user_id, new_email, code_hash, expires_at, created_at)
     SELECT ?, ?, ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM email_change_codes WHERE user_id = ? AND created_at > ?) < ?
        AND (SELECT COUNT(*) FROM email_change_codes WHERE new_email = ? AND created_at > ?) < ?`
  )
    .bind(
      id,
      user.id,
      newEmail,
      await sha256Hex(`${code}:${newEmail}`),
      new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000).toISOString(),
      nowIso,
      user.id, hourAgo, MAX_CODES_PER_HOUR,
      newEmail, hourAgo, MAX_CHANGE_CODES_PER_TARGET_PER_HOUR
    )
    .run()
  if ((charged.meta.changes ?? 0) === 0)
    return {
      error: "too_many_codes",
      message: "Too many codes requested. Try again in an hour.",
      status: 429,
    }

  const sent = await sendEmailChangeCode(env, newEmail, code)
  if (sent) return {}

  // Nothing left, so hand the charge back — this table IS the ledger, and a slot
  // spent on mail nobody received refuses the person, not the attacker.
  // ONLY on this path. A send that THREW is deliberately left charged: which
  // addresses the mail service rejects is something a caller can choose, so an
  // uncharge there would hand an attacker an unlimited retry and a row in the
  // error log each time. "No email key configured" is one state for the whole
  // environment, which nobody can induce per request.
  await env.DB.prepare("DELETE FROM email_change_codes WHERE id = ?").bind(id).run()
  return {
    error: "email_not_configured",
    message: "Email sending isn't set up yet.",
    status: 503,
  }
}

/** Step 2: check the code, switch the email, log it, sign out others, warn old. */
export async function verifyEmailChange(
  env: Env,
  user: UserRow,
  newEmailRaw: string,
  code: string,
  currentTokenHash: string
): Promise<{ user: SessionUser } | ChangeFail> {
  const newEmail = normalizeEmail(newEmailRaw)
  if (!/^\d{6}$/.test(code))
    return { error: "invalid_input", message: "Enter the 6-digit code.", status: 400 }

  // Re-check uniqueness at the last moment (someone may have grabbed it during
  // the 10-minute window); the UNIQUE constraint is the final backstop.
  const existing = await findUserByEmail(env, newEmail)
  if (existing && existing.id !== user.id)
    return { error: "email_taken", message: "That email is already in use.", status: 409 }

  const row = await env.DB.prepare(
    `SELECT id, code_hash, attempts, expires_at FROM email_change_codes
     WHERE user_id = ? AND new_email = ? AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`
  )
    .bind(user.id, newEmail)
    .first<{ id: string; code_hash: string; attempts: number; expires_at: string }>()

  const nowIso = new Date().toISOString()
  if (!row || row.expires_at <= nowIso)
    return { error: "code_expired", message: "That code expired. Request a new one.", status: 400 }

  // ATOMIC attempt cap (same pattern as login): consume a slot in the statement
  // that checks the limit, so concurrent guesses can't each read a stale count.
  const slot = await env.DB.prepare(
    "UPDATE email_change_codes SET attempts = attempts + 1 WHERE id = ? AND attempts < ? AND consumed_at IS NULL"
  )
    .bind(row.id, MAX_CODE_ATTEMPTS)
    .run()
  if ((slot.meta.changes ?? 0) === 0)
    return { error: "too_many_attempts", message: "Too many wrong tries. Request a new code.", status: 429 }
  if (row.code_hash !== (await sha256Hex(`${code}:${newEmail}`)))
    return { error: "wrong_code", message: "That code isn't right. Check and try again.", status: 400 }

  const oldEmail = user.email
  // CLAIM THE CODE FIRST, and with the predicate ON the write (R17 / the login
  // door's twin): `consumed_at IS NULL` is in the SELECT above, but a SELECT is
  // not a write — two verifies holding one code both read it unspent, and the
  // consume that didn't check would let both switch the address, writing the
  // change twice into the person's security history. Zero rows moved = already
  // spent, and the answer is the one a later retry already gets.
  const consumed = await env.DB.prepare(
    "UPDATE email_change_codes SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL"
  )
    .bind(nowIso, row.id)
    .run()
  if ((consumed.meta.changes ?? 0) === 0)
    return { error: "code_expired", message: "That code expired. Request a new one.", status: 400 }

  // The code is spent; now the switch + its audit row, together.
  try {
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET email = ?, updated_at = ? WHERE id = ?").bind(newEmail, nowIso, user.id),
      env.DB.prepare(
        `INSERT INTO email_change_logs (id, user_id, old_email, new_email, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(ulid(), user.id, oldEmail, newEmail, nowIso),
    ])
  } catch (e) {
    // The `users.email` UNIQUE index is the real authority, and the pre-check
    // above is only a fast path — someone else can take the address inside the
    // window. Report it in the door's own words rather than as a 500 (the same
    // kindness createInvite does for a raced invite).
    if (!String((e as Error)?.message ?? "").includes("UNIQUE")) throw e
    return { error: "email_taken", message: "That email is already in use.", status: 409 }
  }

  // Chosen behavior: drop other devices, then warn the old address (best-effort).
  await signOutOtherSessions(env, user.id, currentTokenHash)
  // Live: push the OTHER devices to login instantly (the acting device keeps its
  // still-valid session). Best-effort.
  await publishSignOut(env, user.id)
  await sendEmailChangedNotice(env, oldEmail, newEmail).catch((e) =>
    console.error("email-change notice failed:", e)
  )

  // Record it in the person's own account history (best-effort; the security
  // record with both addresses already went into email_change_logs above).
  await logAccountActivity(env, user.id, {
    type: "email_changed",
    description: `Changed your sign-in email to ${newEmail}`,
  })

  return { user: toSessionUser({ ...user, email: newEmail }) }
}
