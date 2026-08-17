// THE TOKENS ARE ENCRYPTED IN THE COLUMN — the one file that can read them back.
//
// WHY, when D1 is already encrypted at rest. "At rest" protects the disk, and
// the disk is not the threat here. A Google refresh token is a standing key to
// one colleague's mailbox that survives their password change, their MFA reset
// and their laptop being replaced; and this database is reachable by anything
// holding the account's D1 REST token — a backup, a CSV export somebody wrote
// for a different reason, a debugging `SELECT *` pasted into a chat window. So
// the value in the column is ciphertext, and the key lives in a secret the
// database has no copy of. A dump of `google_connections` without GOOGLE_TOKEN_KEY
// is a list of email addresses.
//
// AES-GCM, 256-bit, a fresh random IV per value, and the IV travels with the
// ciphertext (`v1.<iv>.<ct>`) because a scheme where the reader has to remember
// which IV went with which row is a scheme that will one day reuse one — and IV
// reuse under GCM is not a weakened cipher, it is a broken one.
//
// FAIL CLOSED, in both directions. No key configured → connecting refuses with a
// clear message rather than writing a plaintext token "for now"; a value that
// will not decrypt → a refusal, never a silent empty string that would look to
// every caller above like "this person has not connected anything".

import { GuardError } from "@shared/workers/gating"

/** The version tag on every stored value. It is here so that changing the scheme
 * later is a migration somebody can write rather than a guess about which rows
 * are which — a stored secret with no format marker is a secret you can only
 * ever add to, never replace. */
const FORMAT = "v1"

/** What this file is given from outside: the one secret, base64, 32 bytes. */
export type TokenKeyEnv = { GOOGLE_TOKEN_KEY?: string }

/** Is token storage configured on this deploy? ONE answer, asked by the connect
 * door before it sends anybody to Google — so nobody completes a consent screen
 * only to be told on the way back that we cannot keep what they just granted. */
export function tokenStorageReady(env: TokenKeyEnv): boolean {
  return typeof env.GOOGLE_TOKEN_KEY === "string" && env.GOOGLE_TOKEN_KEY.trim().length > 0
}

/** Import the key, refusing clearly if it is missing or the wrong size. A
 * 16-byte key silently "works" in some crypto stacks and is half the strength
 * somebody thinks they configured, so the length is checked rather than assumed. */
async function key(env: TokenKeyEnv): Promise<CryptoKey> {
  if (!tokenStorageReady(env))
    throw new GuardError(
      503,
      "google_key_missing",
      "Google connections aren't set up on this environment yet."
    )
  const raw = base64ToBytes((env.GOOGLE_TOKEN_KEY as string).trim())
  if (raw.length !== 32)
    throw new GuardError(
      503,
      "google_key_invalid",
      "Google connections aren't set up correctly on this environment."
    )
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ])
}

/** Encrypt one token for storage. */
export async function sealToken(env: TokenKeyEnv, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    await key(env),
    new TextEncoder().encode(plain) as BufferSource
  )
  return `${FORMAT}.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ct))}`
}

/** Read one token back. Anything that is not a well-formed, authentic value of
 * the current format is a refusal — a token we cannot read is a connection that
 * cannot work, and saying so is the only answer that leads somebody to the fix
 * (reconnect) instead of to a mystery. */
export async function openToken(env: TokenKeyEnv, stored: string): Promise<string> {
  const parts = stored.split(".")
  if (parts.length !== 3 || parts[0] !== FORMAT) throw unreadable()
  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(parts[1]) as BufferSource },
      await key(env),
      base64ToBytes(parts[2]) as BufferSource
    )
  } catch (e) {
    // A GuardError from key() is a configuration answer and keeps its own words;
    // anything else is a value that will not authenticate under this key.
    if (e instanceof GuardError) throw e
    throw unreadable()
  }
  return new TextDecoder().decode(plain)
}

function unreadable(): GuardError {
  return new GuardError(
    409,
    "google_token_unreadable",
    "That Google connection can't be read any more. Disconnect it and connect again."
  )
}

/** base64 → bytes, refusing rubbish rather than throwing a raw DOMException.
 * (The same lesson auth's google.ts records: `atob` raises on a character
 * outside the alphabet, and an unhandled raise on a stored value becomes a 500
 * and an error-log row.) */
function base64ToBytes(b64: string): Uint8Array {
  let binary: string
  try {
    binary = atob(b64)
  } catch {
    throw unreadable()
  }
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = ""
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
