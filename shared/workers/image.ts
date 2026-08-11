// Shared image helper: turn a base64 data URL (the web app downsizes images
// before upload) into bytes + content type for R2. Pure + web-safe (atob is a
// browser/worker global). Used for profile photos AND team logos — one copy.
//
// It also owns THE KEY, all three halves of it: what an uploaded object is
// called in R2 (mediaKey), which key a request may ask for (safeMediaKey), and
// which key a write may DESTROY (ownedMediaKey + reclaimMedia). `/media/*` is
// served with no session (SCOPE ch.06 — a deliberate, recorded decision), so the
// key IS the credential, and every sentence about that lives here.

import { logError, type CoreDb } from "./error-log"
import { ulid } from "./id"

export const MAX_IMAGE_BYTES = 2_500_000 // ~2.5MB after the client-side downsize

/** THE key an upload is stored under: the owning ids (so a bucket stays
 * readable, and a team's objects sit under one prefix) plus a RANDOM last
 * segment that makes the URL a CAPABILITY.
 *
 * That last segment is the whole point. Profile photos were `users/<userId>` and
 * team logos `teams/<teamId>` — keys anyone could DERIVE from an id they had
 * already seen (a member list, a `/t/<teamId>/…` URL, a live ping), which made
 * "no session, but you must know the key" mean "no session" for those two. The
 * ULID's 80 random bits are what the learning attachments always had, and what
 * ARCHITECTURE.md told the next person to add if the exposure ever mattered.
 *
 * A new key per upload also means an object is never overwritten in place, so a
 * changed photo can't be served stale from a cache that was told `immutable`. */
export function mediaKey(...owners: string[]): string {
  return [...owners, ulid()].join("/")
}

/** The key a `/media/*` request is asking for — or null when it is not a key we
 * would ever have written. Boundary validation, in the house style: a request
 * value is checked before it reaches a store, never trusted because "R2 has no
 * directory traversal anyway". Keys we mint are ids joined by `/`, so anything
 * with a dot-segment, a space, a control character, a backslash or a leading
 * slash is a probe, and the honest answer to a probe is the same 404 a missing
 * object gets. */
export function safeMediaKey(rawPath: string): string | null {
  let key: string
  try {
    key = decodeURIComponent(rawPath)
  } catch {
    return null // a malformed %-escape is not a key
  }
  if (!key || key.length > 512) return null
  if (key.includes("..") || key.includes("//")) return null
  return /^[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(key) ? key : null
}

/** THE ONLY KEY A DELETE MAY EVER BE HANDED: the R2 key inside a STORED media
 * URL, and only when that URL is one we minted for THIS owner.
 *
 * A key is a credential (see safeMediaKey), which makes it a REACH: hand a delete
 * a key that came from a request and any caller could destroy any object in the
 * bucket, including another team's — the destructive mirror of the exposure the
 * random tail was added to close. So a reclaim never takes a key from the caller.
 * It reads the URL off a row it has ALREADY gated, and re-proves the ownership
 * prefix from the caller's own guard: `users/<their id>/`, `teams/<their team>/`,
 * `<their team>/`. A foreign prefix, a deeper path, a probe, an absolute URL
 * somewhere else — all return null, and nothing is deleted.
 *
 * `owners` is the SAME argument list the key was minted with (mediaKey), so the
 * two can't drift apart. */
export function ownedMediaKey(
  storedUrl: unknown,
  base: string,
  ...owners: string[]
): string | null {
  if (typeof storedUrl !== "string") return null
  // ?v= (the cache-buster every stored URL carries) and any fragment are not key.
  const path = storedUrl.split("?")[0].split("#")[0]
  if (!path.startsWith(base)) return null
  const key = safeMediaKey(path.slice(base.length)) // the SAME shape rule the read door uses
  if (!key) return null
  const prefix = `${owners.join("/")}/`
  if (!key.startsWith(prefix)) return null
  // EXACTLY the random tail after the prefix: one segment, and a real one. An
  // empty tail is the prefix itself — a key that names a whole owner's folder
  // rather than one object, and the last thing a delete should ever be handed.
  const tail = key.slice(prefix.length)
  return tail && !tail.includes("/") ? key : null
}

/** Structural — the one method a reclaim touches, so this file still needs no R2
 * types (front-door.ts does the same for the read side). */
type ReclaimBucket = { delete(key: string): Promise<void> }

/** Delete the objects a row no longer points at. ALWAYS called AFTER the row has
 * moved, and always FAIL-SOFT.
 *
 * Nothing in this repo had ever deleted an R2 object, so every changed photo,
 * logo and attachment left its predecessor behind forever — and an attachment can
 * be a 25 MB video. Reclaiming is the fix, but the ORDER and the softness are the
 * rules that make it safe: delete before the write and a failed write leaves a row
 * pointing at nothing; throw on a bucket hiccup and a person loses the edit they
 * just saved. An orphan costs storage. A lost save costs trust. So the write is
 * the authority, this runs after it, and a failure is RECORDED, never thrown
 * (ERROR-HANDLING.md rule 1 — best-effort side-effects log, they don't swallow). */
export async function reclaimMedia(
  bucket: ReclaimBucket,
  keys: (string | null | undefined)[],
  log: { db: CoreDb; source: string; place: string }
): Promise<void> {
  for (const key of keys) {
    if (!key) continue // not ours to delete — ownedMediaKey already said so
    try {
      await bucket.delete(key)
    } catch (e) {
      await logError(log.db, {
        source: log.source,
        place: log.place,
        message: `media reclaim failed for ${key}: ${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }
}

/** MEASURE BEFORE YOU DECODE. How many bytes a data URL's base64 payload will
 * decode to, read straight off the ENCODED text: every 4 characters carry 3
 * bytes, less the padding. Nothing is allocated, so a caller can refuse an
 * oversize upload without `atob` first turning the request body into a decoded
 * copy of itself in memory — the byte count was always knowable for free, and
 * decoding to find it out is the door doing the attacker's work for them. */
export function dataUrlBytes(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1)
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad)
}

/** data:image/png;base64,AAAA... -> bytes + content type, or null if invalid or
 * over MAX_IMAGE_BYTES. The cap is enforced HERE, before the decode, so every
 * door that takes an image is bounded by construction; a door that wants to say
 * "too large" in its own words measures with `dataUrlBytes` first (profile.ts). */
export function parseDataUrl(
  dataUrl: string
): { contentType: string; bytes: Uint8Array } | null {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match) return null
  if (dataUrlBytes(dataUrl) > MAX_IMAGE_BYTES) return null
  try {
    const binary = atob(match[2])
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return { contentType: match[1], bytes }
  } catch {
    return null
  }
}

// Uploaded media is served BACK by the gateway with the declared content type, on
// the SAME origin as the app + /api. So the mime MUST be inline-safe: a script-capable
// type (text/html, application/xhtml+xml, image/svg+xml) would be stored XSS — a member
// could upload a page that runs JS in the app origin and rides any viewer's session.
// This allowlist is the boundary that stops it. Raster images, short A/V clips, and PDFs
// only — exactly what a learning attachment is.
const INLINE_SAFE_UPLOAD =
  /^(image\/(png|jpe?g|webp|gif|avif)|video\/(mp4|webm|ogg)|audio\/(mpeg|mp4|webm|ogg)|application\/pdf)$/

/** General data-URL parser for learning attachments: base64-decodes, enforces a
 * caller-supplied byte cap, and — critically — accepts ONLY an inline-safe media mime
 * (`INLINE_SAFE_UPLOAD`; never text/html or svg). Returns null if the input isn't a
 * well-formed base64 data URL, the mime isn't allow-listed, or the decoded payload is
 * over `maxBytes`. (parseDataUrl above is the tighter images-only sibling.) */
export function parseUploadDataUrl(
  dataUrl: unknown,
  maxBytes: number
): { contentType: string; bytes: Uint8Array } | null {
  if (typeof dataUrl !== "string") return null
  const match = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match) return null
  if (!INLINE_SAFE_UPLOAD.test(match[1])) return null // reject script-capable types (XSS)
  // The cap BEFORE the decode, for the same reason as parseDataUrl: `atob` on an
  // unmeasured payload allocates whatever the caller sent, and only then is it
  // refused for being too big.
  if (dataUrlBytes(dataUrl) > maxBytes) return null
  try {
    const binary = atob(match[2])
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return { contentType: match[1], bytes }
  } catch {
    return null
  }
}
