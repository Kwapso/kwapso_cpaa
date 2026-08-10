// Shared image helper: turn a base64 data URL (the web app downsizes images
// before upload) into bytes + content type for R2. Pure + web-safe (atob is a
// browser/worker global). Used for profile photos AND team logos — one copy.
//
// It also owns THE KEY: what an uploaded object is called in R2, and which
// key a request is allowed to ask for. `/media/*` is served with no session
// (SCOPE ch.06 — a deliberate, recorded decision), so the key IS the credential
// and both halves of that sentence live here.

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

/** data:image/png;base64,AAAA... -> bytes + content type, or null if invalid. */
export function parseDataUrl(
  dataUrl: string
): { contentType: string; bytes: Uint8Array } | null {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match) return null
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
  try {
    const binary = atob(match[2])
    if (binary.length > maxBytes) return null
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return { contentType: match[1], bytes }
  } catch {
    return null
  }
}
