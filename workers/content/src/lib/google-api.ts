// THE FOUR SERVICES' OWN CALLS — Drive, Gmail, Calendar and Google Chat.
//
// Every function here takes an ACCESS TOKEN and returns plain data. It knows
// nothing about rows, permissions or the caller: that is decided one layer up
// (google.ts resolves whose token it is; routes/google.ts decides whether they
// may) so that this file can be read as "what we ask Google for" and checked
// against the promises the product makes.
//
// THE THREE PROMISES THIS FILE HAS TO KEEP:
//   • DRIVE IS NAMED FOLDERS, NOT A DRIVE. Every list is scoped to folder ids
//     the caller named, and a request with no folder ids returns nothing rather
//     than everything. Fail closed is not a style here — "no filter" and "no
//     restriction" are one character apart in most query languages.
//   • GMAIL IS KNOWN CONTACTS. The query is BUILT from the addresses on the
//     team's own accounts and ANDed around whatever else was asked for, so a
//     free-text search cannot widen it. No contacts → no results.
//   • CHAT IS NAMED SPACES. Same shape as Drive, for the same reason.
//
// R11 — every call is a bare `fetch` to the internet and every one carries an
// AbortSignal timeout, through the single `googleFetch` below.
//
// R14's SPIRIT, on the other axis: an external read is as unbounded as a SELECT.
// Every list here carries a page size and asks for ONE page. A door that walked
// Google's pagination would be a door whose cost is set by how much material
// somebody happens to have.

import { GuardError } from "@shared/workers/gating"
import { GOOGLE_TIMEOUT_MS } from "./google-oauth"

/** Rows one Google list call will ask for. Google's own maximums are far higher;
 * this is what a screen and a model turn can actually use, and asking for more
 * would be paying for material nobody reads. */
export const GOOGLE_PAGE_SIZE = 50

/** Known contacts one Gmail query may name. A Gmail search string has a real
 * length limit, and an agency with 2,000 contacts would otherwise build a query
 * Google refuses — which would read, from the outside, exactly like "you have no
 * mail from anybody". Bounded, and the boundedness is reported to the caller so
 * the narrowing is never silent. */
export const GMAIL_CONTACT_CAP = 40

/** One shared call. Every Google request in the product goes through it, so the
 * timeout and the error shape are decided once.
 *
 * A non-2xx from Google is a 502 with the product's own words: the caller did
 * nothing wrong, and telling them "400" would invite them to fix a request they
 * did not write. 401/403 is the one worth naming separately — it is almost
 * always a grant somebody removed at Google's end, and the fix is "connect
 * again", which is a sentence rather than a status code. */
async function googleFetch(
  url: string,
  token: string,
  init?: { method?: string; body?: string; contentType?: string }
): Promise<unknown> {
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    // R11: a hung Google socket must not stall the worker.
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": init.contentType ?? "application/json" } : {}),
    },
    ...(init?.body ? { body: init.body } : {}),
  })
  if (res.status === 401 || res.status === 403)
    throw new GuardError(
      409,
      "google_access_lost",
      "Google wouldn't allow that any more — the connection may have been removed in your Google account. Connect it again in Settings."
    )
  if (!res.ok) throw new GuardError(502, "google_refused", "Google couldn't answer that just now. Try again.")
  return res.json()
}

/** Text out of a Google response, or "" — used everywhere a field may be absent
 * and an absent field is not an error. */
const str = (v: unknown): string => (typeof v === "string" ? v : "")

// ── DRIVE ────────────────────────────────────────────────────────────────────

export type DriveFile = {
  id: string
  name: string
  mimeType: string
  modifiedTime: string | null
  webViewLink: string | null
  /** which named folder it came out of — carried so the caller never has to
   * guess which shelf a file sits on. */
  folderId: string
}

/**
 * Files inside the folders the caller NAMED, and nowhere else.
 *
 * `folderIds` is the whole of the restriction, and the empty case is answered
 * first and explicitly: no named folders means no files. Writing it as an early
 * return rather than letting an empty `IN ()` fall through is deliberate — the
 * version of this that builds a query from an empty list is the version that
 * lists somebody's entire Drive.
 */
export async function driveList(
  token: string,
  folderIds: string[],
  search?: string
): Promise<DriveFile[]> {
  if (folderIds.length === 0) return []
  const out: DriveFile[] = []
  for (const folderId of folderIds) {
    const clauses = [`'${escapeDriveLiteral(folderId)}' in parents`, "trashed = false"]
    // The caller's own words are a NARROWING inside the folder, never a widening
    // of which folders are searched.
    if (search) clauses.push(`name contains '${escapeDriveLiteral(search)}'`)
    const url = new URL("https://www.googleapis.com/drive/v3/files")
    url.searchParams.set("q", clauses.join(" and "))
    url.searchParams.set("pageSize", String(GOOGLE_PAGE_SIZE))
    url.searchParams.set("fields", "files(id,name,mimeType,modifiedTime,webViewLink)")
    // Shared drives are ordinary folders to a person, so a folder somebody named
    // out of one must behave like any other.
    url.searchParams.set("supportsAllDrives", "true")
    url.searchParams.set("includeItemsFromAllDrives", "true")
    const data = (await googleFetch(url.toString(), token)) as { files?: unknown }
    for (const raw of Array.isArray(data.files) ? data.files : []) {
      const f = raw as Record<string, unknown>
      out.push({
        id: str(f.id),
        name: str(f.name),
        mimeType: str(f.mimeType),
        modifiedTime: str(f.modifiedTime) || null,
        webViewLink: str(f.webViewLink) || null,
        folderId,
      })
    }
  }
  return out
}

/** The folders a person could name — the picker behind "share a folder". Read
 * only: it lists folder NAMES and ids so somebody can choose one, and choosing
 * one is what makes its contents reachable. */
export async function driveFolders(token: string, search?: string): Promise<DriveFile[]> {
  const clauses = ["mimeType = 'application/vnd.google-apps.folder'", "trashed = false"]
  if (search) clauses.push(`name contains '${escapeDriveLiteral(search)}'`)
  const url = new URL("https://www.googleapis.com/drive/v3/files")
  url.searchParams.set("q", clauses.join(" and "))
  url.searchParams.set("pageSize", String(GOOGLE_PAGE_SIZE))
  url.searchParams.set("fields", "files(id,name,mimeType,modifiedTime,webViewLink)")
  url.searchParams.set("supportsAllDrives", "true")
  url.searchParams.set("includeItemsFromAllDrives", "true")
  const data = (await googleFetch(url.toString(), token)) as { files?: unknown }
  return (Array.isArray(data.files) ? data.files : []).map((raw) => {
    const f = raw as Record<string, unknown>
    return {
      id: str(f.id),
      name: str(f.name),
      mimeType: str(f.mimeType),
      modifiedTime: str(f.modifiedTime) || null,
      webViewLink: str(f.webViewLink) || null,
      folderId: "",
    }
  })
}

/** Google's own escape for a query literal: a backslash before `'` and `\`.
 * Without it a folder called `Ana's` ends the string mid-query and whatever
 * follows is parsed as Drive syntax — the same class of bug as an unescaped SQL
 * string, in somebody else's query language. */
function escapeDriveLiteral(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")
}

/** How many characters of one file we will read back. A Drive folder can hold a
 * 400-page document; a bounded read is what keeps one file from being a worker's
 * whole memory budget. */
export const DRIVE_TEXT_CAP = 100_000

/** One file's readable text. A Google Doc/Sheet/Slide is EXPORTED as plain text
 * (its bytes are not a document); anything else is downloaded as-is, and a
 * binary that has no text is honestly empty rather than mojibake. */
export async function driveFileText(token: string, fileId: string): Promise<string> {
  const meta = (await googleFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=mimeType,name&supportsAllDrives=true`,
    token
  )) as { mimeType?: unknown }
  const mime = str(meta.mimeType)
  const isGoogleDoc = mime.startsWith("application/vnd.google-apps")
  const url = isGoogleDoc
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`
  const res = await fetch(url, {
    // R11.
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401 || res.status === 403)
    throw new GuardError(409, "google_access_lost", "Google wouldn't allow that any more — connect it again in Settings.")
  // A file with no text representation (an image, a zip) is not an error: it is
  // a file with nothing to read, and the caller gets an empty string.
  if (!res.ok) return ""
  return (await res.text()).slice(0, DRIVE_TEXT_CAP)
}

/** Put a file INTO a folder the caller named. Multipart because Drive wants the
 * metadata and the bytes in one request; the boundary is random so a body that
 * happens to contain the boundary string cannot break the envelope. */
export async function driveUpload(
  token: string,
  input: { folderId: string; name: string; mimeType: string; text: string }
): Promise<DriveFile> {
  const boundary = `kwapso${crypto.randomUUID().replaceAll("-", "")}`
  const metadata = JSON.stringify({ name: input.name, parents: [input.folderId] })
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n${input.text}\r\n` +
    `--${boundary}--`
  const data = (await googleFetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,webViewLink",
    token,
    { method: "POST", body, contentType: `multipart/related; boundary=${boundary}` }
  )) as Record<string, unknown>
  return {
    id: str(data.id),
    name: str(data.name),
    mimeType: str(data.mimeType),
    modifiedTime: str(data.modifiedTime) || null,
    webViewLink: str(data.webViewLink) || null,
    folderId: input.folderId,
  }
}

// ── GMAIL ────────────────────────────────────────────────────────────────────

export type MailMessage = {
  id: string
  threadId: string
  from: string
  to: string
  subject: string
  snippet: string
  date: string | null
  /** the link that opens it in the person's own Gmail. */
  url: string
  /** empty on a list read; the body when one message is asked for. */
  text: string
}

/**
 * THE KNOWN-CONTACT FENCE, and the only place it is decided.
 *
 * The owner's rule is "only mail to or from a known contact at one of the
 * accounts". So the query is BUILT from those addresses — `{from:a to:a from:b
 * …}`, Gmail's OR group — and anything the caller asked for is ANDed with it.
 * That ordering is the whole guarantee: a caller cannot widen a query they can
 * only add terms to.
 *
 * No contacts → NO SEARCH AT ALL. Not "search everything", not "search with an
 * empty group" (which Gmail reads as no restriction). The empty case is the one
 * that turns this feature into a mailbox reader, so it is answered before a
 * query string exists.
 */
export function knownContactQuery(contacts: string[]): string | null {
  const usable = contacts.map((c) => c.trim().toLowerCase()).filter(Boolean).slice(0, GMAIL_CONTACT_CAP)
  if (usable.length === 0) return null
  const terms = usable.flatMap((c) => [`from:${c}`, `to:${c}`])
  return `{${terms.join(" ")}}`
}

export async function gmailSearch(
  token: string,
  contactQuery: string,
  search?: string
): Promise<MailMessage[]> {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages")
  url.searchParams.set("q", search ? `${contactQuery} (${search})` : contactQuery)
  url.searchParams.set("maxResults", String(GOOGLE_PAGE_SIZE))
  const data = (await googleFetch(url.toString(), token)) as { messages?: unknown }
  const ids = (Array.isArray(data.messages) ? data.messages : [])
    .map((m) => str((m as Record<string, unknown>).id))
    .filter(Boolean)
  // Gmail's search answers with ids only, so the headers are a second call each.
  // Bounded by the page size above, and run together rather than in sequence —
  // fifty round-trips one after another is a request nobody waits for.
  return Promise.all(ids.map((id) => gmailMessage(token, id, false)))
}

/** One message. `withBody` decides whether the text is read too — a list wants
 * fifty snippets, a reader wants one body, and asking for fifty bodies would be
 * fifty times the payload for something nobody looks at. */
export async function gmailMessage(
  token: string,
  id: string,
  withBody = true
): Promise<MailMessage> {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`)
  url.searchParams.set("format", withBody ? "full" : "metadata")
  if (!withBody) for (const h of ["From", "To", "Subject", "Date"]) url.searchParams.append("metadataHeaders", h)
  const data = (await googleFetch(url.toString(), token)) as Record<string, unknown>
  const payload = (data.payload ?? {}) as Record<string, unknown>
  const headers = new Map<string, string>()
  for (const raw of Array.isArray(payload.headers) ? payload.headers : []) {
    const h = raw as Record<string, unknown>
    headers.set(str(h.name).toLowerCase(), str(h.value))
  }
  return {
    id: str(data.id),
    threadId: str(data.threadId),
    from: headers.get("from") ?? "",
    to: headers.get("to") ?? "",
    subject: headers.get("subject") ?? "",
    snippet: str(data.snippet),
    date: headers.get("date") ?? null,
    url: `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(str(data.id))}`,
    text: withBody ? readMailText(payload).slice(0, DRIVE_TEXT_CAP) : "",
  }
}

/** Walk a MIME tree for the first text part. Gmail nests alternatives
 * arbitrarily deep, so this recurses rather than reaching for `parts[0]` and
 * hoping. Depth-bounded, because a malformed message must not be able to spend a
 * worker's stack. */
function readMailText(part: Record<string, unknown>, depth = 0): string {
  if (depth > 8) return ""
  const body = (part.body ?? {}) as Record<string, unknown>
  const mime = str(part.mimeType)
  if (mime.startsWith("text/") && str(body.data)) return decodeBase64Url(str(body.data))
  for (const raw of Array.isArray(part.parts) ? part.parts : []) {
    const found = readMailText(raw as Record<string, unknown>, depth + 1)
    if (found) return found
  }
  return ""
}

function decodeBase64Url(value: string): string {
  const b64 = value.replaceAll("-", "+").replaceAll("_", "/")
  try {
    const binary = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "="))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder().decode(bytes)
  } catch {
    // A part we cannot decode is a part with no text, not a crash. (auth's
    // google.ts records what an unguarded atob costs: a raw DOMException became a
    // 500 and an error-log row per request.)
    return ""
  }
}

export type MailDraft = { draftId: string; messageId: string; threadId: string; url: string }

/**
 * A REPLY, LEFT IN THEIR OWN DRAFTS. The owner's decision, word for word: "a
 * drafted reply lands as a Gmail DRAFT the person opens and sends — plus a clear
 * link from inside kwapso straight to it, and a 'send it from kwapso' option
 * beside that." So this door creates and returns the link; sending is a separate
 * act behind a separate switch.
 */
export async function gmailDraft(
  token: string,
  input: { to: string; subject: string; body: string; threadId?: string }
): Promise<MailDraft> {
  const raw = encodeMessage(input)
  const data = (await googleFetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
    token,
    {
      method: "POST",
      body: JSON.stringify({ message: { raw, ...(input.threadId ? { threadId: input.threadId } : {}) } }),
    }
  )) as Record<string, unknown>
  const message = (data.message ?? {}) as Record<string, unknown>
  return {
    draftId: str(data.id),
    messageId: str(message.id),
    threadId: str(message.threadId),
    // Gmail's own deep link to an open draft. `?compose=` takes the draft
    // MESSAGE's id, which is why that is the field carried back rather than the
    // draft id — the two are different and only one of them opens anything.
    url: `https://mail.google.com/mail/u/0/#drafts?compose=${encodeURIComponent(str(message.id))}`,
  }
}

/** Send one. Its own function rather than a flag on the draft, because it sits
 * behind its own permission and a boolean would make the difference between
 * "written" and "gone" a parameter somebody could get wrong. */
export async function gmailSend(
  token: string,
  input: { to: string; subject: string; body: string; threadId?: string }
): Promise<{ messageId: string; threadId: string }> {
  const data = (await googleFetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", token, {
    method: "POST",
    body: JSON.stringify({
      raw: encodeMessage(input),
      ...(input.threadId ? { threadId: input.threadId } : {}),
    }),
  })) as Record<string, unknown>
  return { messageId: str(data.id), threadId: str(data.threadId) }
}

/** Send an existing draft — the "send it from kwapso" button beside the link. */
export async function gmailSendDraft(
  token: string,
  draftId: string
): Promise<{ messageId: string; threadId: string }> {
  const data = (await googleFetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts/send", token, {
    method: "POST",
    body: JSON.stringify({ id: draftId }),
  })) as Record<string, unknown>
  return { messageId: str(data.id), threadId: str(data.threadId) }
}

/** RFC-2822 bytes, base64url, as Gmail wants them. The header values have their
 * line breaks stripped: a newline inside a subject is header injection, and the
 * extra header it would smuggle in is `Bcc:`. */
function encodeMessage(input: { to: string; subject: string; body: string }): string {
  const header = (v: string) => v.replaceAll(/[\r\n]+/g, " ").trim()
  const text =
    `To: ${header(input.to)}\r\n` +
    `Subject: ${header(input.subject)}\r\n` +
    "Content-Type: text/plain; charset=UTF-8\r\n" +
    "MIME-Version: 1.0\r\n\r\n" +
    input.body
  const bytes = new TextEncoder().encode(text)
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

// ── CALENDAR ─────────────────────────────────────────────────────────────────

export type CalendarEvent = {
  id: string
  summary: string
  description: string
  /** RFC-3339, or a plain date for an all-day entry — carried as Google gives it. */
  start: string
  end: string
  url: string | null
}

export async function calendarList(
  token: string,
  range: { from?: string; to?: string }
): Promise<CalendarEvent[]> {
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events")
  if (range.from) url.searchParams.set("timeMin", range.from)
  if (range.to) url.searchParams.set("timeMax", range.to)
  url.searchParams.set("maxResults", String(GOOGLE_PAGE_SIZE))
  url.searchParams.set("singleEvents", "true")
  url.searchParams.set("orderBy", "startTime")
  const data = (await googleFetch(url.toString(), token)) as { items?: unknown }
  return (Array.isArray(data.items) ? data.items : []).map(toEvent)
}

export async function calendarCreate(
  token: string,
  input: { summary: string; description?: string; start: string; end: string; allDay?: boolean }
): Promise<CalendarEvent> {
  // An all-day entry uses `date`; a timed one uses `dateTime`. Google treats the
  // two as different fields rather than a flag, and a sprint that runs for three
  // weeks is an all-day entry — a sprint does not start at 09:00.
  const when = (value: string) => (input.allDay ? { date: value.slice(0, 10) } : { dateTime: value })
  const data = (await googleFetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    token,
    {
      method: "POST",
      body: JSON.stringify({
        summary: input.summary,
        description: input.description ?? "",
        start: when(input.start),
        end: when(input.end),
      }),
    }
  )) as Record<string, unknown>
  return toEvent(data)
}

function toEvent(raw: unknown): CalendarEvent {
  const e = raw as Record<string, unknown>
  const start = (e.start ?? {}) as Record<string, unknown>
  const end = (e.end ?? {}) as Record<string, unknown>
  return {
    id: str(e.id),
    summary: str(e.summary),
    description: str(e.description),
    start: str(start.dateTime) || str(start.date),
    end: str(end.dateTime) || str(end.date),
    url: str(e.htmlLink) || null,
  }
}

// ── GOOGLE CHAT ──────────────────────────────────────────────────────────────

export type ChatSpace = { name: string; displayName: string }
export type ChatMessage = {
  id: string
  space: string
  sender: string
  text: string
  createdAt: string | null
}

/** The spaces a person could name — the picker, exactly as Drive has one. */
export async function chatSpaces(token: string): Promise<ChatSpace[]> {
  const url = new URL("https://chat.googleapis.com/v1/spaces")
  url.searchParams.set("pageSize", String(GOOGLE_PAGE_SIZE))
  const data = (await googleFetch(url.toString(), token)) as { spaces?: unknown }
  return (Array.isArray(data.spaces) ? data.spaces : []).map((raw) => {
    const s = raw as Record<string, unknown>
    return { name: str(s.name), displayName: str(s.displayName) || str(s.name) }
  })
}

/** Messages in ONE named space. `spaceName` is Google's `spaces/AAAA…`, and it
 * always comes from a row the caller created — never from a request parameter,
 * which is what keeps "named spaces only" true on this side of the boundary too. */
export async function chatMessages(token: string, spaceName: string): Promise<ChatMessage[]> {
  const url = new URL(`https://chat.googleapis.com/v1/${encodeURI(spaceName)}/messages`)
  url.searchParams.set("pageSize", String(GOOGLE_PAGE_SIZE))
  url.searchParams.set("orderBy", "createTime desc")
  const data = (await googleFetch(url.toString(), token)) as { messages?: unknown }
  return (Array.isArray(data.messages) ? data.messages : []).map((raw) => {
    const m = raw as Record<string, unknown>
    const sender = (m.sender ?? {}) as Record<string, unknown>
    return {
      id: str(m.name),
      space: spaceName,
      sender: str(sender.displayName) || str(sender.name),
      text: str(m.text),
      createdAt: str(m.createTime) || null,
    }
  })
}

export async function chatPost(token: string, spaceName: string, text: string): Promise<ChatMessage> {
  const data = (await googleFetch(
    `https://chat.googleapis.com/v1/${encodeURI(spaceName)}/messages`,
    token,
    { method: "POST", body: JSON.stringify({ text }) }
  )) as Record<string, unknown>
  return {
    id: str(data.name),
    space: spaceName,
    sender: "kwapso",
    text: str(data.text) || text,
    createdAt: str(data.createTime) || null,
  }
}
