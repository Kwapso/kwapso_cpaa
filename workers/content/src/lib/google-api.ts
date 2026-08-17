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
const GOOGLE_PAGE_SIZE = 50

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
  // WHAT GOOGLE ACTUALLY SAID, in the log and nowhere else.
  //
  // These two refusals are clean GuardErrors, so they never reach the worker's
  // central catch and never wrote a line anywhere — which made "Google couldn't
  // answer that just now" the least diagnosable sentence in the product. It cost
  // a live sweep an afternoon: a door failed, the caller was told to try again,
  // and there was no way for anyone — owner or developer — to learn that Google
  // had said `PERMISSION_DENIED` about a scope nobody had granted.
  //
  // The CALLER's answer does not change (Google's own wording is about a request
  // they did not write). What changes is that the tail now says which call, what
  // status, and Google's reason — with the URL's query string dropped, because
  // that is where a person's search words live, and never the token.
  if (!res.ok) {
    const said = await res.text().catch(() => "")
    console.error(
      `google ${init?.method ?? "GET"} ${new URL(url).origin}${new URL(url).pathname} → ${res.status}: ${said.slice(0, 400)}`
    )
    if (res.status === 401 || res.status === 403)
      throw new GuardError(
        409,
        "google_access_lost",
        "Google wouldn't allow that any more — the connection may have been removed in your Google account. Connect it again in Settings."
      )
    throw new GuardError(502, "google_refused", "Google couldn't answer that just now. Try again.")
  }
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

/** Google's own mime type for a folder. Named once because it is spelled in two
 * places — the picker's query and the folder create below — and a typo in either
 * is a silently wrong answer rather than an error. */
const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder"

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
    // ONE PAGE, so WHICH page matters. Newest-changed first is what a person
    // scanning a folder wants, and it is what makes the knowledge sweep's window
    // the RIGHT fifty files rather than an arbitrary fifty: a document edited
    // this morning must not be invisible because the folder also holds two
    // hundred that have not moved since 2023.
    url.searchParams.set("orderBy", "modifiedTime desc")
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
  const clauses = [`mimeType = '${DRIVE_FOLDER_MIME}'`, "trashed = false"]
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
const DRIVE_TEXT_CAP = 100_000

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
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain&supportsAllDrives=true`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`
  const res = await fetch(url, {
    // R11.
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    headers: { Authorization: `Bearer ${token}` },
  })
  // A 401 IS about the grant: the token stopped being accepted between the
  // metadata call above and this one, and the caller has to hear that rather
  // than watch the rest of the folder quietly become empty strings.
  if (res.status === 401)
    throw new GuardError(409, "google_access_lost", "Google wouldn't allow that any more — connect it again in Settings.")
  // A 403 IS NOT, and this line used to treat them alike. The metadata call
  // ahead of this one goes through googleFetch, which throws on 401/403 — so the
  // token is already proven good ON THIS FILE, and a refusal here is about the
  // FILE: downloading switched off by its owner, a Shared Drive retention rule,
  // Google's abusive-file flag. It belongs with the image and the zip below — a
  // file with nothing we can read — not with a broken connection.
  //
  // Why it matters more than one file's text: the caller in google-read.ts reads
  // a whole named folder in an uncaught loop. On 2026-08-17 one such file made
  // that sweep index NOTHING out of a live folder and record "connect it again
  // in Settings" against a grant that was never broken, while Gmail, Calendar
  // and Chat indexed 25, 25 and 2 the same minute. A dead token still stops the
  // loop, which is right; one awkward file no longer does.
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

/**
 * REWRITE A FILE THAT IS ALREADY THERE — the other half of "put a file in".
 *
 * The FENCE HERE IS GOOGLE'S, not a clause of ours, and that is the strongest
 * shape available: the connection asks for `drive.file` alongside `drive.readonly`,
 * and `drive.file` grants writing only to files this app created or the person
 * explicitly opened to it. So a file id naming somebody's tax return is refused
 * at Google with a 403 — which arrives here as "Google wouldn't allow that any
 * more" — rather than by a check we could forget to write. The same reasoning the
 * scope list itself gives: a promise kept at Google beats a promise kept in a
 * line of our code.
 *
 * `name` renames it in the same call, because a document whose contents changed
 * completely and whose title still says "draft" is a small lie the next reader
 * has to discover.
 */
export async function driveUpdate(
  token: string,
  input: { fileId: string; name?: string; mimeType: string; text: string }
): Promise<DriveFile> {
  const boundary = `kwapso${crypto.randomUUID().replaceAll("-", "")}`
  const metadata = JSON.stringify(input.name ? { name: input.name } : {})
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n${input.text}\r\n` +
    `--${boundary}--`
  const data = (await googleFetch(
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(input.fileId)}?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,webViewLink,parents`,
    token,
    { method: "PATCH", body, contentType: `multipart/related; boundary=${boundary}` }
  )) as Record<string, unknown>
  return {
    id: str(data.id),
    name: str(data.name),
    mimeType: str(data.mimeType),
    modifiedTime: str(data.modifiedTime) || null,
    webViewLink: str(data.webViewLink) || null,
    // Whichever folder it was already in — a rewrite never moves a file, and
    // saying which shelf it sits on is the one thing the caller cannot see.
    folderId: str((Array.isArray(data.parents) ? data.parents[0] : "") as string),
  }
}

/** A NEW FOLDER inside one the caller named. A folder is an ordinary Drive file
 * with Google's folder mime type — there is no separate endpoint — so this is the
 * upload's metadata half with no bytes at all. */
export async function driveCreateFolder(
  token: string,
  input: { parentId: string; name: string }
): Promise<DriveFile> {
  const data = (await googleFetch(
    "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,webViewLink",
    token,
    {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        mimeType: DRIVE_FOLDER_MIME,
        parents: [input.parentId],
      }),
    }
  )) as Record<string, unknown>
  return {
    id: str(data.id),
    name: str(data.name),
    mimeType: str(data.mimeType),
    modifiedTime: str(data.modifiedTime) || null,
    webViewLink: str(data.webViewLink) || null,
    folderId: input.parentId,
  }
}

/**
 * TAKE IT BACK — the bin, never a permanent delete.
 *
 * The base's own rule is deactivate-never-delete, and Drive's trash IS that
 * rule in Google's words: the file keeps its name, its history and its sharing
 * for thirty days, and the person can put it back with one click. A permanent
 * delete would be the one act in this module nobody could undo, so it is not
 * written here and there is nowhere to ask for it.
 *
 * It answers whether anything MOVED (R17): trashing a file that is already in
 * the bin changes nothing, and a door that recorded an act for it would put a
 * line in somebody's history describing something that did not happen.
 */
export async function driveTrash(token: string, fileId: string): Promise<{ changed: boolean; name: string }> {
  const meta = (await googleFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=name,trashed&supportsAllDrives=true`,
    token
  )) as { name?: unknown; trashed?: unknown }
  if (meta.trashed === true) return { changed: false, name: str(meta.name) }
  const data = (await googleFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name`,
    token,
    { method: "PATCH", body: JSON.stringify({ trashed: true }) }
  )) as Record<string, unknown>
  return { changed: true, name: str(data.name) || str(meta.name) }
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
  return toMailMessage((await googleFetch(url.toString(), token)) as Record<string, unknown>, withBody)
}

/** One Gmail message object → the product's shape. Extracted from the single
 * read the day the thread read needed the same parser: two copies of a MIME
 * walker is two places for the same bug, and the second copy is always the one
 * that forgets the depth bound. */
function toMailMessage(data: Record<string, unknown>, withBody: boolean): MailMessage {
  const payload = (data.payload ?? {}) as Record<string, unknown>
  const headers = headerMap(payload)
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

/** A message's headers, lower-cased by name. Header names are case-insensitive
 * by the spec and Google is inconsistent about them (`Message-ID` and
 * `Message-Id` both arrive), so the lookup key is decided once, here. */
function headerMap(payload: Record<string, unknown>): Map<string, string> {
  const out = new Map<string, string>()
  for (const raw of Array.isArray(payload.headers) ? payload.headers : []) {
    const h = raw as Record<string, unknown>
    out.set(str(h.name).toLowerCase(), str(h.value))
  }
  return out
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
 * extra header it would smuggle in is `Bcc:`.
 *
 * `inReplyTo` / `references` are what make a reply a REPLY rather than a new
 * message that happens to share a subject line. Gmail's own `threadId` keeps it
 * in the sender's thread; these two headers are what every OTHER mail client on
 * the receiving side reads, and without them the answer lands in the recipient's
 * inbox as a separate conversation. */
function encodeMessage(input: {
  to: string
  subject: string
  body: string
  inReplyTo?: string
  references?: string
}): string {
  const header = (v: string) => v.replaceAll(/[\r\n]+/g, " ").trim()
  const text =
    `To: ${header(input.to)}\r\n` +
    `Subject: ${header(input.subject)}\r\n` +
    (input.inReplyTo ? `In-Reply-To: ${header(input.inReplyTo)}\r\n` : "") +
    (input.references ? `References: ${header(input.references)}\r\n` : "") +
    "Content-Type: text/plain; charset=UTF-8\r\n" +
    "MIME-Version: 1.0\r\n\r\n" +
    input.body
  const bytes = new TextEncoder().encode(text)
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

/** Messages a whole conversation will be read as. R14's spirit again: a thread
 * with a hundred replies is one somebody has been arguing in for a month, and
 * copying all of it into a document is a cost set by how much other people
 * wrote. The newest are what a person filing a conversation actually wants. */
const THREAD_MESSAGE_CAP = 25

/**
 * A WHOLE CONVERSATION, oldest first — what "file this exchange" means.
 *
 * Gmail's thread read hands back the same message objects the single read does,
 * so this is `gmailMessage`'s parser over a list rather than a second one. The
 * order is Gmail's own (oldest first), which is the order a person reads a
 * conversation in and therefore the order it belongs in a document.
 */
export async function gmailThread(token: string, threadId: string): Promise<MailMessage[]> {
  const url = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}`
  )
  url.searchParams.set("format", "full")
  const data = (await googleFetch(url.toString(), token)) as { messages?: unknown }
  return (Array.isArray(data.messages) ? data.messages : [])
    .slice(0, THREAD_MESSAGE_CAP)
    .map((raw) => toMailMessage(raw as Record<string, unknown>, true))
}

/**
 * REPLY INSIDE THE CONVERSATION — and the reason it takes a MESSAGE id rather
 * than a to/subject/threadId triple.
 *
 * Everything a reply needs is already written on the message being answered: who
 * to send it to (its `From`), what to call it (its `Subject`, with one `Re:`),
 * which conversation it belongs to (its `threadId`), and the two headers that
 * make other mail clients thread it (`Message-ID` → `In-Reply-To`, plus the
 * chain in `References`). A door that asked a caller for those would be a door
 * that lets a caller get them wrong — and the way they go wrong is a reply that
 * arrives as a brand-new conversation, or worse, addressed to the wrong person
 * because somebody pasted the To of the message they were looking at.
 *
 * So the ONLY thing this takes is which message, and what to say.
 */
export async function gmailReply(
  token: string,
  input: { messageId: string; body: string }
): Promise<{ messageId: string; threadId: string; to: string; subject: string }> {
  const url = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(input.messageId)}`
  )
  url.searchParams.set("format", "metadata")
  for (const h of ["From", "Reply-To", "Subject", "Message-ID", "References"])
    url.searchParams.append("metadataHeaders", h)
  const data = (await googleFetch(url.toString(), token)) as Record<string, unknown>
  const headers = headerMap((data.payload ?? {}) as Record<string, unknown>)
  // `Reply-To` wins where the sender asked for it — that header exists precisely
  // to say "answer me here", and ignoring it sends the answer somewhere the
  // person who wrote it said not to.
  const to = headers.get("reply-to") || headers.get("from")
  if (!to) throw new GuardError(409, "google_no_sender", "That message doesn't say who to reply to.")
  const subject = headers.get("subject") ?? ""
  const messageId = headers.get("message-id") ?? ""
  const sent = (await googleFetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", token, {
    method: "POST",
    body: JSON.stringify({
      raw: encodeMessage({
        to,
        subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
        body: input.body,
        inReplyTo: messageId,
        references: [headers.get("references") ?? "", messageId].filter(Boolean).join(" "),
      }),
      threadId: str(data.threadId),
    }),
  })) as Record<string, unknown>
  return {
    messageId: str(sent.id),
    threadId: str(sent.threadId),
    to,
    subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
  }
}

// ── GMAIL LABELS ─────────────────────────────────────────────────────────────

export type MailLabel = { id: string; name: string }

/** Every label on the mailbox — the person's own, and Gmail's built-in ones.
 * R14's spirit: one page, and a mailbox with more labels than this has a
 * filing problem no list length will fix. */
export async function gmailLabels(token: string): Promise<MailLabel[]> {
  const data = (await googleFetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", token)) as {
    labels?: unknown
  }
  return (Array.isArray(data.labels) ? data.labels : [])
    .slice(0, GMAIL_LABEL_CAP)
    .map((raw) => {
      const l = raw as Record<string, unknown>
      return { id: str(l.id), name: str(l.name) }
    })
    .filter((l) => l.id && l.name)
}

/** Labels one read will carry back. See GOOGLE_PAGE_SIZE — same reasoning, a
 * larger number because labels are cheap and a person really can have eighty. */
const GMAIL_LABEL_CAP = 200

/**
 * FIND A LABEL BY THE NAME A PERSON SAYS, and make it if it isn't there.
 *
 * Gmail's API speaks label IDs (`Label_47`); people speak label names
 * ("Contracts"). The match is case-insensitive because that is how a person
 * believes labels work — somebody who types "contracts" and gets a SECOND label
 * beside their existing "Contracts" has been given a filing system with two
 * drawers for one thing, which is worse than an error.
 *
 * `create` is false when REMOVING: making a label in order to take it off a
 * message is a write nobody asked for, and the honest answer to "remove a label
 * that doesn't exist" is that nothing changed.
 */
export async function gmailLabelId(
  token: string,
  name: string,
  create: boolean
): Promise<string | null> {
  const wanted = name.trim().toLowerCase()
  const existing = (await gmailLabels(token)).find((l) => l.name.toLowerCase() === wanted)
  if (existing) return existing.id
  if (!create) return null
  const data = (await googleFetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", token, {
    method: "POST",
    body: JSON.stringify({
      name: name.trim(),
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    }),
  })) as Record<string, unknown>
  return str(data.id) || null
}

/** Which labels are on one message right now. Read before a write so the door
 * can answer "nothing moved" honestly (R17) instead of asking Gmail to apply a
 * label that is already there and calling it a change. */
export async function gmailMessageLabelIds(token: string, messageId: string): Promise<string[]> {
  const url = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`
  )
  url.searchParams.set("format", "minimal")
  const data = (await googleFetch(url.toString(), token)) as { labelIds?: unknown }
  return (Array.isArray(data.labelIds) ? data.labelIds : []).map((v) => str(v)).filter(Boolean)
}

/** Put a label on one message, or take it off. One call either way — Gmail's
 * modify endpoint takes both lists, and writing two functions for one endpoint
 * would be two places for the same mistake. */
export async function gmailLabelMessage(
  token: string,
  messageId: string,
  labelId: string,
  on: boolean
): Promise<void> {
  await googleFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`,
    token,
    {
      method: "POST",
      body: JSON.stringify(on ? { addLabelIds: [labelId] } : { removeLabelIds: [labelId] }),
    }
  )
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
  /** Everybody invited, lower-cased. Carried because it is the ONE thing on an
   * event that says whose material it is: an entry with a known contact on it is
   * that client's, and an entry with nobody but us on it is ours. Without it the
   * knowledge base would have to guess a client out of a meeting's title, which
   * is the guess the compartment idea exists to avoid. */
  attendees: string[]
  /** WHERE — a room, an address, or nothing. Free text at Google, because that
   * is what a person types. */
  location: string
  /** Google's own word: `confirmed`, `tentative` or `cancelled`. Carried so a
   * cancelled entry can be recognised as cancelled rather than as missing —
   * which is the difference between "the meeting is off" and "I can't find it". */
  status: string
  /** The Google Meet code on the entry (`abc-defg-hij`), or "". It is how a
   * meeting's own recordings and transcripts are named, so it is the thread from
   * a diary entry to what was said in the room. */
  meetingCode: string
}

/** Guests read off one event — and the most this app will REWRITE in one go.
 * R14's spirit on the other axis (see toEvent), doing double duty: a read that
 * stops at fifty is a bounded cost, and a guest-list write that stops at fifty
 * is a refusal rather than a silent uninvitation (see calendarGuests). */
const EVENT_ATTENDEE_CAP = 50

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

/** ONE event, by its id. The read behind every calendar WRITE below: each of
 * them has to know what is there before it can say what changed, and a door that
 * patches without looking is a door that cannot answer "nothing moved" (R17). */
export async function calendarGet(token: string, eventId: string): Promise<CalendarEvent> {
  return toEvent(
    await googleFetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
      token
    )
  )
}

/**
 * THE ONE WRITE ON AN EXISTING EVENT — everything above it is a caller deciding
 * WHICH fields to hand over.
 *
 * A PATCH rather than a PUT, and that is the whole safety of this family: Google's
 * update replaces the event with what you send, so a door that only wanted to fix
 * a title would silently drop the guest list, the location and the conference
 * link somebody spent a morning arranging. Sending only the changed fields makes
 * "edit the time" mean the time.
 *
 * `sendUpdates` decides whether the guests hear about it. Google's default is to
 * tell nobody, which is wrong for every change a person makes on purpose: an
 * appointment moved without a word is an appointment two people turn up to at
 * different hours.
 */
async function calendarPatch(
  token: string,
  eventId: string,
  patch: Record<string, unknown>,
  sendUpdates: "all" | "none" = "all"
): Promise<CalendarEvent> {
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`
  )
  url.searchParams.set("sendUpdates", sendUpdates)
  return toEvent(
    await googleFetch(url.toString(), token, { method: "PATCH", body: JSON.stringify(patch) })
  )
}

/** Change what an entry SAYS and WHEN it is. Every field is optional and an
 * absent one is left exactly as it was — see calendarPatch for why that is the
 * difference between an edit and an overwrite. */
export async function calendarUpdate(
  token: string,
  eventId: string,
  input: {
    summary?: string
    description?: string
    location?: string
    start?: string
    end?: string
    allDay?: boolean
  }
): Promise<CalendarEvent> {
  const when = (value: string) => (input.allDay ? { date: value.slice(0, 10) } : { dateTime: value })
  return calendarPatch(token, eventId, {
    ...(input.summary === undefined ? {} : { summary: input.summary }),
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.location === undefined ? {} : { location: input.location }),
    ...(input.start === undefined ? {} : { start: when(input.start) }),
    ...(input.end === undefined ? {} : { end: when(input.end) }),
  })
}

/**
 * WHO IS COMING — added and removed in one call, against the list Google
 * currently holds.
 *
 * READ-MODIFY-WRITE, because Google has no "add one guest" operation: the
 * attendee list is a field, and writing it means writing all of it. Which is
 * exactly why this reads the RAW list rather than the one `toEvent` carries —
 * that one is capped at fifty for the sake of a bounded read, and rewriting a
 * capped list would silently uninvite everybody past the cap. An event with more
 * guests than we will rewrite is REFUSED, in words, rather than quietly trimmed.
 *
 * Matching is by address, lower-cased: `Ana <ana@x.de>` and `ana@x.de` are one
 * person, and a remove that missed because of a capital letter would leave
 * somebody invited to a meeting they were told they were off.
 */
export async function calendarGuests(
  token: string,
  eventId: string,
  input: { add: string[]; remove: string[] }
): Promise<{ event: CalendarEvent; changed: boolean }> {
  const current = (await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?fields=attendees`,
    token
  )) as { attendees?: unknown }
  const rows = Array.isArray(current.attendees) ? current.attendees : []
  if (rows.length > EVENT_ATTENDEE_CAP)
    throw new GuardError(
      409,
      "google_too_many_guests",
      `That event has more than ${EVENT_ATTENDEE_CAP} guests — change the guest list in Google Calendar itself.`
    )
  const drop = new Set(input.remove.map((e) => e.trim().toLowerCase()).filter(Boolean))
  const kept = rows.filter((raw) => !drop.has(str((raw as Record<string, unknown>).email).toLowerCase()))
  const have = new Set(kept.map((raw) => str((raw as Record<string, unknown>).email).toLowerCase()))
  const added = input.add
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e && !have.has(e))
    .map((email) => ({ email }))
  // NOTHING MOVED (R17): nobody was on the list to drop and nobody new to add.
  // The door answers that honestly instead of writing the same list back and
  // mailing every guest a change notification about it.
  if (added.length === 0 && kept.length === rows.length)
    return { event: await calendarGet(token, eventId), changed: false }
  return {
    event: await calendarPatch(token, eventId, { attendees: [...kept, ...added] }),
    changed: true,
  }
}

/** Call it off. `cancelled` rather than a delete, which is Google's own version
 * of the house rule: the entry stays in everybody's calendar marked cancelled,
 * the guests are told, and nobody is left holding an appointment that silently
 * evaporated. A second call moves nothing and says so (R17). */
export async function calendarCancel(
  token: string,
  eventId: string
): Promise<{ event: CalendarEvent; changed: boolean }> {
  const before = await calendarGet(token, eventId)
  if (before.status === "cancelled") return { event: before, changed: false }
  return { event: await calendarPatch(token, eventId, { status: "cancelled" }), changed: true }
}

function toEvent(raw: unknown): CalendarEvent {
  const e = raw as Record<string, unknown>
  const start = (e.start ?? {}) as Record<string, unknown>
  const end = (e.end ?? {}) as Record<string, unknown>
  const conference = (e.conferenceData ?? {}) as Record<string, unknown>
  return {
    id: str(e.id),
    summary: str(e.summary),
    description: str(e.description),
    start: str(start.dateTime) || str(start.date),
    end: str(end.dateTime) || str(end.date),
    url: str(e.htmlLink) || null,
    location: str(e.location),
    status: str(e.status),
    meetingCode: str(conference.conferenceId),
    // Bounded like every other list here: an event with two hundred guests is
    // one somebody was BCC'd on, and reading all of them would make the cost of
    // one calendar read a number a stranger sets.
    attendees: (Array.isArray(e.attendees) ? e.attendees : [])
      .slice(0, EVENT_ATTENDEE_CAP)
      .map((a) => str((a as Record<string, unknown>).email).toLowerCase())
      .filter(Boolean),
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

/**
 * TAKE A MESSAGE BACK. The counterpart to chatPost, and the reason it exists is
 * not symmetry: a message posted into a space somebody else reads is the one act
 * in this module with no undo, and giving an assistant the power to post without
 * the power to retract is how a wrong message stays wrong.
 *
 * `messageName` is Google's own full name (`spaces/AAA/messages/BBB`), which
 * only ever comes back from a post or a read of that same space — so a message
 * in a space this person never named cannot be spelled here.
 *
 * Google refuses to delete a message this app did not send (the `chat.messages`
 * grant is per-app), which is the fence: kwapso can take back what kwapso said
 * and nothing else.
 */
export async function chatDelete(token: string, messageName: string): Promise<void> {
  await googleFetch(`https://chat.googleapis.com/v1/${encodeURI(messageName)}`, token, {
    method: "DELETE",
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
