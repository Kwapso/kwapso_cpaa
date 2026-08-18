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
// Every list here carries a page size and a CEILING, and the ceiling is ours
// rather than Google's — a door that walked Google's pagination to the end would
// be a door whose cost is set by how much material somebody happens to have.
//
// One page is the ceiling for Drive, Gmail and Chat, where the order is "newest
// first" and the tail is genuinely the material nobody is asking about. The
// DIARY is the exception and it was found the hard way: it is ordered by start
// time, so its tail is TOMORROW, and a busy fortnight silently lost the far end
// of the window. It walks up to CALENDAR_MAX_PAGES and says so in the tail when
// it stops early — a bounded read that drops rows without saying so is exactly
// the fault R14 is about.

import { GuardError } from "@shared/workers/gating"
import { GOOGLE_TIMEOUT_MS } from "./google-oauth"

/** Rows one Google list call will ask for. Google's own maximums are far higher;
 * this is what a screen and a model turn can actually use, and asking for more
 * would be paying for material nobody reads. */
const GOOGLE_PAGE_SIZE = 50

/** THE WAYS A KNOWN CONTACT CAN BE ON A MESSAGE.
 *
 * `cc` was missing until 2026-08-18, and the gap was invisible because the two
 * terms that were there are the two anybody would think of. Real evidence off
 * the owner's own mailbox: `cc:alaap@kwapso.com` returns "Re: Declined: Strategy
 * Session w kwapso" — Alexander writing to an external address with him copied
 * in. Mail he can see, about his own agency, that kwapso could not find. A
 * three-way thread where the client replies to a colleague and copies you is not
 * an edge case; it is how half of an agency's mail arrives.
 *
 * `bcc` is deliberately absent and always will be: Gmail does not index it on
 * received mail, so the term would widen the query string without widening the
 * answer. */
const CONTACT_DIRECTIONS = ["from", "to", "cc"] as const

/** THE MOST TERMS ONE GMAIL QUERY MAY CARRY — the real ceiling, and the one the
 * contact cap is now DERIVED from rather than kept in step with by hand.
 *
 * A Gmail search string has a length limit, and an agency with 2,000 contacts
 * would otherwise build a query Google refuses — which reads, from the outside,
 * exactly like "you have no mail from anybody". The worst failure shape there
 * is: a fence that is working perfectly and an inbox that appears empty.
 *
 * Eighty is not a guess. It is the size of the query this product has been
 * asking Google with — forty contacts in two directions — and answering with,
 * so it is the one length there is evidence for. Adding `cc` above would have
 * taken the same forty contacts to a hundred and twenty terms and roughly 3,500
 * characters, well past anything that has ever been tried here.
 *
 * WHY THE BUDGET IS IN TERMS AND THE CAP IS ARITHMETIC. The next person to add a
 * fourth direction cannot forget to shrink the cap, because there is nothing to
 * remember: the query gets narrower in contacts instead of longer in characters,
 * automatically. A number that has to be kept in step by hand is a number that
 * one day is not. */
const GMAIL_QUERY_TERM_CAP = 80

/** Known contacts one Gmail query may name — DERIVED from the two constants
 * above, and today twenty-six (80 ÷ 3, rounded down: 78 terms). Down from forty,
 * because the third direction has to be paid for out of the same budget, and a
 * fence that covers twenty-six contacts three ways sees strictly more mail than
 * one that covered forty two ways.
 *
 * Bounded, and the boundedness is reported to the caller (`contactsCapped`), so
 * the narrowing is never silent. */
export const GMAIL_CONTACT_CAP = Math.floor(GMAIL_QUERY_TERM_CAP / CONTACT_DIRECTIONS.length)

/** One shared call. Every Google request in the product goes through it, so the
 * timeout and the error shape are decided once.
 *
 * A non-2xx from Google is a 502 with the product's own words: the caller did
 * nothing wrong, and telling them "400" would invite them to fix a request they
 * did not write. 401/403 is the one worth naming separately — it is almost
 * always a grant somebody removed at Google's end, and the fix is "connect
 * again", which is a sentence rather than a status code.
 *
 * `missingIsNull` is the one exception a caller may ask for, and only the
 * callers that BIN things do. For them a 404 is not a failure, it is the answer:
 * the draft was already gone, so nothing moved, so nothing should be recorded
 * (R17). Without it an idempotent second click reads as "Google couldn't answer
 * that just now" — a refusal about something that had already succeeded. It is
 * opt-in because everywhere else a 404 really is a broken request, and silently
 * returning null there would turn a bug into an empty answer. */
async function googleFetch(
  url: string,
  token: string,
  init?: { method?: string; body?: string; contentType?: string; missingIsNull?: boolean }
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
    // NOT THERE IS AN ANSWER, for the callers that asked to hear it — and it is
    // answered BEFORE the log line, because a draft that was already binned is a
    // normal outcome and an error tail describing it is exactly the noise that
    // makes a tail unreadable.
    if (res.status === 404 && init?.missingIsNull) return null
    const said = await res.text().catch(() => "")
    console.error(
      `google ${init?.method ?? "GET"} ${new URL(url).origin}${new URL(url).pathname} → ${res.status}: ${said.slice(0, 400)}`
    )
    if (res.status === 401 || res.status === 403)
      throw new GuardError(
        409,
        "google_access_lost",
        "Google wouldn't allow that any more, the connection may have been removed in your Google account. Connect it again in Settings."
      )
    throw new GuardError(502, "google_refused", "Google couldn't answer that just now. Try again.")
  }
  // A 2xx WITH NO BODY IS STILL A 2xx. `res.json()` throws on an empty body, and
  // Gmail answers a draft delete with 204 No Content — so the one call in this
  // file that succeeds without saying anything would have failed at the parser,
  // AFTER the draft was already gone. An empty answer reads as an empty object,
  // which is what every caller here already treats an absent field as.
  const text = await res.text()
  return text ? JSON.parse(text) : {}
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
   * guess which shelf a file sits on. Empty when the file was named DIRECTLY
   * rather than reached through a folder. */
  folderId: string
  /** GOOGLE'S OWN SMALL ICON for the type — the Docs blue, the Sheets green, the
   * PDF red. A link to Google's static icon host, tiny, cacheable and NOT
   * authenticated, so it is the one piece of Drive chrome that can be rendered
   * straight into a page. (The thumbnail below is the opposite, and the note on
   * it says why.) */
  iconUrl: string | null
  /** IS THERE A PICTURE OF THE FIRST PAGE — and deliberately not the link to it.
   *
   * Google's own `thumbnailLink` is an AUTHENTICATED url on
   * `googleusercontent.com` that expires within hours. It cannot be put in an
   * `<img src>`: a browser will not send our bearer token to Google's image
   * host, so the page shows a broken image to everybody, and the link rots
   * anyway. Carrying it to the client would be shipping a footgun with a
   * plausible name on it — the first reader to try it would write the bug.
   *
   * So the fact travels and the address does not. A screen learns whether a
   * preview EXISTS, and asks our own door for the bytes when it wants one
   * (`driveThumbnail` below, and the note there says why it is a proxy rather
   * than a copy in R2). */
  hasThumbnail: boolean
  /** whose file it is, in Google's terms — the first owner's name, or "". */
  ownerName: string
  /** bytes, when Google states one. A Google Doc has no size (it is not a file
   * in the ordinary sense), so this is null far more often than it is not. */
  sizeBytes: number | null
  /** THE FILE THIS ONE IS ONLY A POINTER TO, when it is one — and null for every
   * ordinary file.
   *
   * A Drive SHORTCUT is a real file with a real id, a real name and a real link,
   * and Google returns it from a folder listing exactly as it returns a document.
   * It simply has no content: its mime type is
   * `application/vnd.google-apps.shortcut` and the words live at
   * `shortcutDetails.targetId`.
   *
   * WHY IT IS ON THE SHAPE RATHER THAN HIDDEN IN THE READ. On 2026-08-18 a
   * meeting's transcript was found through a named folder, filed with a
   * plausible name and a working link, and read back as ZERO characters — the
   * folder held a shortcut to the document, not the document. The same file read
   * 13,128 characters when the calendar entry's own attachment named the real id.
   * Nothing failed: a pointer answered every question we asked it except the one
   * that mattered. A caller that keeps a file id (the transcript on a meeting, a
   * knowledge source) wants the DOCUMENT's id, so it is handed the target. */
  targetId: string | null
}

/** What we ask Google for about a file, in ONE place. Spelled once because it is
 * used by four reads and a mask that drifts between them is a field that is
 * present on one screen and mysteriously absent on the next.
 *
 * `shortcutDetails/targetId` is on it for the reason `targetId` above gives, and
 * it is FREE for every other file: Google omits the whole object rather than
 * charging for an empty one. */
const DRIVE_FILE_FIELDS =
  "id,name,mimeType,modifiedTime,webViewLink,iconLink,thumbnailLink,size,owners(displayName),shortcutDetails/targetId"

/** One Google file row → our shape. The single mapper, for the same reason the
 * field mask above is a single string. */
function toDriveFile(raw: unknown, folderId: string): DriveFile {
  const f = raw as Record<string, unknown>
  const owners = Array.isArray(f.owners) ? f.owners : []
  const size = Number(f.size)
  const shortcut = (f.shortcutDetails ?? {}) as Record<string, unknown>
  return {
    targetId: str(shortcut.targetId) || null,
    id: str(f.id),
    name: str(f.name),
    mimeType: str(f.mimeType),
    modifiedTime: str(f.modifiedTime) || null,
    webViewLink: str(f.webViewLink) || null,
    folderId,
    iconUrl: str(f.iconLink) || null,
    hasThumbnail: Boolean(str(f.thumbnailLink)),
    ownerName: str((owners[0] as Record<string, unknown> | undefined)?.displayName),
    sizeBytes: Number.isFinite(size) && size > 0 ? size : null,
  }
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
    url.searchParams.set("fields", `files(${DRIVE_FILE_FIELDS})`)
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
    for (const raw of Array.isArray(data.files) ? data.files : [])
      out.push(toDriveFile(raw, folderId))
  }
  return out
}

/**
 * THE FILES SOMEBODY NAMED ONE BY ONE — the other half of "what is shared".
 *
 * The owner's question was exactly right: "In Drive, why is it that it's only
 * folder-wise? What if it had to be file-wise, or does that file have to be in a
 * folder?" It did not have to. A folder was simply the only thing the sharing
 * form could spell, which meant sharing one contract with kwapso meant sharing
 * the folder it happens to sit in — and everything else in there.
 *
 * SAME FENCE, ONE STEP TIGHTER. `driveList` answers "what is inside the folders
 * you named"; this answers "the files you named", and neither can reach anything
 * else. The empty case is the same early return, for the same reason: a request
 * with no ids gets nothing, never everything.
 *
 * A file that has been deleted, or whose sharing was taken away at Google's end,
 * is simply ABSENT from the answer rather than an error. One id going stale must
 * not cost a person the other nine.
 */
export async function driveFilesById(token: string, fileIds: string[]): Promise<DriveFile[]> {
  if (fileIds.length === 0) return []
  const out: DriveFile[] = []
  // Bounded by the caller: these ids come from rows this person created, and
  // `listNamedSources` is itself capped. One call per file is Drive's own shape —
  // there is no batch get — so the cap is what keeps the cost knowable.
  for (const fileId of fileIds.slice(0, GOOGLE_PAGE_SIZE)) {
    const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`)
    url.searchParams.set("fields", DRIVE_FILE_FIELDS)
    url.searchParams.set("supportsAllDrives", "true")
    try {
      out.push(toDriveFile(await googleFetch(url.toString(), token), ""))
    } catch {
      // Gone, or no longer shared with this person. The other named files are
      // still the honest answer.
    }
  }
  return out
}

/** The FILES a person could name — the picker behind "share a file", exactly as
 * `driveFolders` is the one behind "share a folder". Folders are excluded
 * because they have their own picker and their own meaning; a list mixing the
 * two would make "what did I just share?" a question about an icon. */
export async function driveFilesPick(token: string, search?: string): Promise<DriveFile[]> {
  const clauses = [`mimeType != '${DRIVE_FOLDER_MIME}'`, "trashed = false"]
  if (search) clauses.push(`name contains '${escapeDriveLiteral(search)}'`)
  const url = new URL("https://www.googleapis.com/drive/v3/files")
  url.searchParams.set("q", clauses.join(" and "))
  url.searchParams.set("pageSize", String(GOOGLE_PAGE_SIZE))
  url.searchParams.set("fields", `files(${DRIVE_FILE_FIELDS})`)
  url.searchParams.set("orderBy", "modifiedTime desc")
  url.searchParams.set("supportsAllDrives", "true")
  url.searchParams.set("includeItemsFromAllDrives", "true")
  const data = (await googleFetch(url.toString(), token)) as { files?: unknown }
  return (Array.isArray(data.files) ? data.files : []).map((raw) => toDriveFile(raw, ""))
}

/**
 * THE PICTURE ITSELF, as bytes — not a link to one.
 *
 * Google's `thumbnailLink` is an authenticated url on `googleusercontent.com`
 * that expires within hours. Two ways to put one on a screen were considered:
 *
 *   • COPY IT INTO R2 and serve it from `/media/*`, like a ticket attachment.
 *     Rejected — it makes a second, stale copy of somebody's document in our
 *     storage, keeps it after they unshare the file, and has to be invalidated
 *     when they edit page one. A preview is worth having; it is not worth owning.
 *   • FETCH IT ON READ, through this door, with the caller's own token. Chosen.
 *     Nothing is stored, the fence is the ordinary one (a file this person named,
 *     resolved before we ever get here), and the picture is as current as the
 *     document. The cost is one Google call per preview, which is why the door
 *     above it caches at the edge for an hour and why a list renders ICONS —
 *     unauthenticated, tiny, free — and only a detail view asks for a thumbnail.
 *
 * Returns null rather than throwing when Google has no preview: a spreadsheet,
 * a file still being processed and a format Google cannot render all land here,
 * and none of them is a failure worth a red box.
 */
export async function driveThumbnail(
  token: string,
  fileId: string
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`)
  url.searchParams.set("fields", "thumbnailLink")
  url.searchParams.set("supportsAllDrives", "true")
  const meta = (await googleFetch(url.toString(), token)) as Record<string, unknown>
  const link = str(meta.thumbnailLink)
  if (!link) return null
  // R11 — the picture comes from a different host to every other call in this
  // file, so it carries its own timeout rather than inheriting one.
  const res = await fetch(link, {
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const body = await res.arrayBuffer()
  // A preview is a small image. Anything larger is not a thumbnail and is not
  // worth putting through a worker's memory.
  if (body.byteLength > DRIVE_THUMBNAIL_CAP) return null
  return { body, contentType: res.headers.get("content-type") ?? "image/jpeg" }
}

/** The most a preview may weigh. Google's own thumbnails are tens of kilobytes;
 * this is the ceiling that keeps a surprise from becoming a worker's whole
 * memory budget. */
const DRIVE_THUMBNAIL_CAP = 2 * 1024 * 1024

/** The folders a person could name — the picker behind "share a folder". Read
 * only: it lists folder NAMES and ids so somebody can choose one, and choosing
 * one is what makes its contents reachable. */
export async function driveFolders(token: string, search?: string): Promise<DriveFile[]> {
  const clauses = [`mimeType = '${DRIVE_FOLDER_MIME}'`, "trashed = false"]
  if (search) clauses.push(`name contains '${escapeDriveLiteral(search)}'`)
  const url = new URL("https://www.googleapis.com/drive/v3/files")
  url.searchParams.set("q", clauses.join(" and "))
  url.searchParams.set("pageSize", String(GOOGLE_PAGE_SIZE))
  url.searchParams.set("fields", `files(${DRIVE_FILE_FIELDS})`)
  url.searchParams.set("supportsAllDrives", "true")
  url.searchParams.set("includeItemsFromAllDrives", "true")
  const data = (await googleFetch(url.toString(), token)) as { files?: unknown }
  return (Array.isArray(data.files) ? data.files : []).map((raw) => toDriveFile(raw, ""))
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
  // A SHORTCUT IS FOLLOWED BEFORE ANYTHING IS READ, and this is the whole reason
  // the metadata call asks for a third field.
  //
  // A shortcut's mime type starts `application/vnd.google-apps` exactly as a Doc
  // does, so the branch below sent it to `export` — which Google refuses,
  // because there is nothing to export from a pointer. The refusal is a non-2xx,
  // the non-2xx is the honest "" of an image or a zip, and the caller therefore
  // received an empty string for a document with thirteen thousand words in it.
  // Silent, plausible, and wrong in the one direction that matters: it looked
  // like a file with no text rather than a file we did not open.
  //
  // ONE HOP, NOT A WALK. Drive does not let a shortcut point at a shortcut, so a
  // second resolution would only exist to survive something Google cannot make.
  const { mime, id } = await driveReadable(token, fileId)
  const isGoogleDoc = mime.startsWith("application/vnd.google-apps")
  const url = isGoogleDoc
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=text/plain&supportsAllDrives=true`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`
  const res = await fetch(url, {
    // R11.
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    headers: { Authorization: `Bearer ${token}` },
  })
  // A 401 IS about the grant: the token stopped being accepted between the
  // metadata call above and this one, and the caller has to hear that rather
  // than watch the rest of the folder quietly become empty strings.
  if (res.status === 401)
    throw new GuardError(409, "google_access_lost", "Google wouldn't allow that any more. Connect it again in Settings.")
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

/** Google's own mime type for a POINTER to a file. Named beside the folder one
 * above, and for the same reason: it is spelled in two places and a typo in
 * either is a silently wrong answer rather than an error. */
const DRIVE_SHORTCUT_MIME = "application/vnd.google-apps.shortcut"

/** WHICH FILE ACTUALLY HOLDS THE WORDS — the id `driveFileText` reads from, and
 * the type it has to read it as.
 *
 * For nearly every file this is the file itself and one call. For a shortcut it
 * is the second call that makes the difference between a document and an empty
 * string; a shortcut whose target we cannot read is returned as itself, so the
 * read below fails the ordinary honest way rather than throwing here. */
async function driveReadable(token: string, fileId: string): Promise<{ mime: string; id: string }> {
  const ask = async (id: string) =>
    (await googleFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=mimeType,name,shortcutDetails/targetId&supportsAllDrives=true`,
      token
    )) as { mimeType?: unknown; shortcutDetails?: unknown }
  const meta = await ask(fileId)
  const mime = str(meta.mimeType)
  if (mime !== DRIVE_SHORTCUT_MIME) return { mime, id: fileId }
  const target = str(((meta.shortcutDetails ?? {}) as Record<string, unknown>).targetId)
  if (!target) return { mime, id: fileId }
  try {
    return { mime: str((await ask(target)).mimeType), id: target }
  } catch {
    return { mime, id: fileId }
  }
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
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=${DRIVE_FILE_FIELDS}`,
    token,
    { method: "POST", body, contentType: `multipart/related; boundary=${boundary}` }
  )) as Record<string, unknown>
  return toDriveFile(data, input.folderId)
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
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(input.fileId)}?uploadType=multipart&supportsAllDrives=true&fields=${DRIVE_FILE_FIELDS},parents`,
    token,
    { method: "PATCH", body, contentType: `multipart/related; boundary=${boundary}` }
  )) as Record<string, unknown>
  // Whichever folder it was already in — a rewrite never moves a file, and
  // saying which shelf it sits on is the one thing the caller cannot see.
  return toDriveFile(data, str((Array.isArray(data.parents) ? data.parents[0] : "") as string))
}

/** A NEW FOLDER inside one the caller named. A folder is an ordinary Drive file
 * with Google's folder mime type — there is no separate endpoint — so this is the
 * upload's metadata half with no bytes at all. */
export async function driveCreateFolder(
  token: string,
  input: { parentId: string; name: string }
): Promise<DriveFile> {
  const data = (await googleFetch(
    `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=${DRIVE_FILE_FIELDS}`,
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
  return toDriveFile(data, input.parentId)
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
 * accounts". So the query is BUILT from those addresses — `{from:a to:a cc:a
 * from:b …}`, Gmail's OR group — and anything the caller asked for is ANDed with
 * it. That ordering is the whole guarantee: a caller cannot widen a query they
 * can only add terms to.
 *
 * "TO OR FROM" IS THREE TERMS, NOT TWO. `cc` is one of the ways a message is
 * addressed to somebody — see CONTACT_DIRECTIONS — and leaving it out was a
 * narrowing of the owner's own rule rather than an enforcement of it.
 *
 * No contacts → NO SEARCH AT ALL. Not "search everything", not "search with an
 * empty group" (which Gmail reads as no restriction). The empty case is the one
 * that turns this feature into a mailbox reader, so it is answered before a
 * query string exists.
 */
export function knownContactQuery(contacts: string[]): string | null {
  const usable = contacts.map((c) => c.trim().toLowerCase()).filter(Boolean).slice(0, GMAIL_CONTACT_CAP)
  if (usable.length === 0) return null
  const terms = usable.flatMap((c) => CONTACT_DIRECTIONS.map((d) => `${d}:${c}`))
  return `{${terms.join(" ")}}`
}

/**
 * GOOGLE'S OWN NOTICES ABOUT YOUR OWN MATERIAL — a second, narrower fence, and
 * the ONLY other one this product will build.
 *
 * The owner asked for it in as many words: kwapso should find "any emails that
 * come describing that a Google Doc has been created for a particular calendar
 * or particular meeting". Those mails exist and they are useful — a Meet
 * transcript announces itself by email minutes after the call — and every one of
 * them is from a Google no-reply address, which is by definition not a contact
 * on anybody's account. The known-contact fence therefore excludes them
 * perfectly, which is why this was invisible.
 *
 * WHY THIS IS NOT A WIDENING OF THE MAIL PROMISE. The promise is "only mail to or
 * from someone on one of your accounts", and it is about mail with PEOPLE — the
 * thing a person would mind kwapso reading. This names four robots, spelled out
 * here in the server's own source, that write to you about files you already own.
 * It cannot be steered: the addresses are a constant, the caller contributes only
 * the narrowing terms, and there is no request parameter anywhere that reaches
 * this list. A mail from a colleague can never match it.
 *
 * IT IS STILL A SECOND DOOR ON SOMEBODY'S MAILBOX, and it is used by exactly one
 * caller (the transcript hunt), never by the assistant's own mail tools and never
 * by the knowledge sweep — which read through `knownContactQuery` and are
 * unchanged.
 */
export function googleNoticeQuery(): string {
  return `{${GOOGLE_NOTICE_SENDERS.map((s) => `from:${s}`).join(" ")}}`
}

/** The robots. Meet announces a recording and a transcript from the first;
 * Drive's share notices come from the next two depending on whether the file was
 * shared to a person or a group; comments-noreply carries "so-and-so mentioned
 * you in <document>", which is the other way a meeting's notes doc arrives. */
const GOOGLE_NOTICE_SENDERS = [
  "meet-recordings-noreply@google.com",
  "drive-shares-noreply@google.com",
  "drive-shares-dm-noreply@google.com",
  "comments-noreply@docs.google.com",
]

/** THE DOCUMENT A NOTICE IS ABOUT. Google writes the link into the body in one
 * shape — `docs.google.com/document/d/<id>` — and the id is what makes the mail
 * worth reading: it turns "somebody made a doc" into a file we can open, read and
 * file against the meeting.
 *
 * Returns null rather than guessing when the body carries no document link. A
 * notice about a spreadsheet, a folder or a comment on something else is not a
 * transcript, and half-matching one would attach the wrong file to a meeting —
 * which is worse than attaching none. */
export function documentIdInText(text: string): string | null {
  const hit = /docs\.google\.com\/document\/d\/([A-Za-z0-9_-]{16,})/.exec(text)
  return hit?.[1] ?? null
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

// ── THE MAIL BIN ─────────────────────────────────────────────────────────────

/**
 * WHAT KWAPSO CAN PUT IN THE MAIL BIN — the owner's question, answered in his
 * own terms: "why is there no method for you to delete drafts?"
 *
 * THREE SHAPES, ONE ACT, because Gmail has three endpoints for it and a caller
 * should not have to know which. A DRAFT is a letter nobody has seen; a MESSAGE
 * is one letter in a conversation; a THREAD is the whole exchange. They are
 * different enough that a single id would be ambiguous — a draft id, a message
 * id and a thread id are three different strings that all look the same — and
 * similar enough that three doors would be three places for one permission,
 * one history line and one idempotence rule to be got wrong.
 */
export const GOOGLE_MAIL_BIN_KINDS = ["draft", "message", "thread"] as const
export type GoogleMailBinKind = (typeof GOOGLE_MAIL_BIN_KINDS)[number]

/** Gmail's own name for the bin. A label, not a place: a binned message keeps
 * its id and everything on it, which is why `googlePresence` above reads the
 * same word to decide whether a source has gone. */
const GMAIL_TRASH_LABEL = "TRASH"

/**
 * THE BIN, NEVER A DELETE — the house rule (deactivate, never delete) in
 * Google's own words, exactly as `driveTrash` above is.
 *
 * A binned message keeps its name, its thread and its labels, sits in Trash for
 * thirty days and comes back with one click. A PERMANENT delete is a different
 * act and deliberately unreachable: Gmail puts `users.messages.delete` behind
 * the full `https://mail.google.com/` scope — total mailbox control — and the
 * scopes this app holds (`gmail.compose` for a draft, `gmail.modify` for a
 * message or a thread) can bin and cannot destroy. So the promise is kept at
 * Google rather than by a line here somebody could edit, which is the same
 * reasoning the scope list itself gives about `drive.file`.
 *
 * R17 on each of the three: something already in the bin moves nothing, so the
 * caller writes no history row and rings no bell.
 *   • a MESSAGE and a THREAD are read first — a label check, the same one the
 *     label door makes before it writes;
 *   • a DRAFT cannot be read for its state, because a deleted draft is not in
 *     the bin, it is GONE (Gmail keeps the message it was drafting, never the
 *     draft). So absence IS the answer, and `missingIsNull` is how googleFetch
 *     hands a 404 back as one instead of as a refusal.
 */
export async function gmailTrash(
  token: string,
  kind: GoogleMailBinKind,
  id: string
): Promise<{ changed: boolean }> {
  if (kind === "draft") {
    const done = await googleFetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(id)}`,
      token,
      { method: "DELETE", missingIsNull: true }
    )
    return { changed: done !== null }
  }
  if (kind === "message") {
    if ((await gmailMessageLabelIds(token, id)).includes(GMAIL_TRASH_LABEL)) return { changed: false }
    await googleFetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}/trash`,
      token,
      { method: "POST" }
    )
    return { changed: true }
  }
  // A THREAD IS BINNED WHEN EVERY MESSAGE IN IT IS, and not before. Half a
  // conversation in the bin is a real state — somebody binned one reply — and
  // reading it as "already done" would leave the rest of the exchange in the
  // inbox while the answer said it had gone. `minimal` carries the labels and
  // no bodies: this asks where the messages are, not what they say.
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(id)}`)
  url.searchParams.set("format", "minimal")
  const thread = (await googleFetch(url.toString(), token)) as { messages?: unknown }
  const messages = Array.isArray(thread.messages) ? thread.messages : []
  const allBinned =
    messages.length > 0 &&
    messages.every((raw) => {
      const labels = (raw as { labelIds?: unknown }).labelIds
      return (Array.isArray(labels) ? labels : []).map((v) => str(v)).includes(GMAIL_TRASH_LABEL)
    })
  if (allBinned) return { changed: false }
  await googleFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(id)}/trash`,
    token,
    { method: "POST" }
  )
  return { changed: true }
}

// ── CALENDAR ─────────────────────────────────────────────────────────────────

/**
 * ONE PERSON ON AN INVITATION — the "stakeholders" the owner asked for, and the
 * reason this is an object rather than the bare address it used to be.
 *
 * An address alone answers "whose material is this" and nothing else. It cannot
 * say who called the meeting, who accepted, who never replied, or which of the
 * five lines is a meeting room rather than a person — and those are the facts
 * somebody actually reads off an invitation. One field carrying all of it beats
 * an address list plus a second list of statuses, which is two spellings of one
 * fact and a guarantee they will disagree.
 */
export type EventGuest = {
  /** lower-cased, so a match against a member or a contact is a comparison
   * rather than a guess. */
  email: string
  /** what Google shows for them, or "" — an invitation to somebody outside the
   * organisation often carries no name at all. */
  name: string
  /** Google's own word: `needsAction`, `declined`, `tentative` or `accepted`. */
  response: string
  /** whoever called the meeting. */
  organizer: boolean
  /** invited, but the meeting happens without them. */
  optional: boolean
  /** a ROOM, not a person. Google puts meeting rooms on the same list, and a
   * room shown as a stakeholder is a stakeholder nobody can ring. */
  resource: boolean
}

/**
 * A FILE HANGING OFF A DIARY ENTRY — an agenda doc, a deck, and the one this
 * whole lane turns on: the transcript Google Meet files against the event once
 * the call is over.
 *
 * `fileId` is a Drive id, so the transcript hunt can go straight to the document
 * rather than searching a folder for something whose name looks right. That is
 * the difference between finding a transcript and finding a file called
 * "Transcript" that belongs to a different call.
 */
export type EventAttachment = {
  fileId: string
  title: string
  mimeType: string
  /** Google's own small icon for the file type — a Docs blue, a Sheets green. */
  iconUrl: string | null
  url: string | null
}

export type CalendarEvent = {
  id: string
  summary: string
  description: string
  /** RFC-3339, or a plain date for an all-day entry — carried as Google gives it. */
  start: string
  end: string
  /** THE IANA ZONE the entry is written in (`Europe/Berlin`), or "". An hour is
   * not a fact without one: the same RFC-3339 stamp read in two places is two
   * different meetings to the people reading it. */
  timeZone: string
  /** true when Google gave a plain `date` rather than a `dateTime` — the entry
   * is a day, not an hour, and rendering 00:00 for it would invent a time. */
  allDay: boolean
  /** htmlLink — the entry in Google Calendar's own web app. The owner's first
   * ask: "a link that I can open the meeting within my calendar". */
  url: string | null
  /** WHERE THE CALL IS. `hangoutLink` when Google gives one, otherwise the video
   * entry point off `conferenceData` — Meet is not the only conferencing system
   * an entry can carry, and a Zoom link parked in `conferenceData` is the join
   * link for that meeting exactly as a Meet link is. */
  joinUrl: string | null
  /** Everybody invited. Carried because it is the ONE thing on an event that
   * says whose material it is: an entry with a known contact on it is that
   * client's, and an entry with nobody but us on it is ours. Without it the
   * knowledge base would have to guess a client out of a meeting's title, which
   * is the guess the compartment idea exists to avoid. */
  attendees: EventGuest[]
  /** WHO CALLED IT. Not the same question as who is on the list — an entry
   * organised by a client and one we called are different conversations, and the
   * organiser is often not on the attendee list at all. */
  organizer: { email: string; name: string }
  /** Files hanging off the entry — where a Meet transcript lands. */
  attachments: EventAttachment[]
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
  /** THE SERIES THIS INSTANCE BELONGS TO, or "" for a one-off (CHECKLIST 9.7).
   *
   * The calendar read asks for `singleEvents=true`, which expands a repeating
   * entry into its instances and puts the PARENT's id on every one of them. That
   * id was being thrown away here, which is why nothing in the app could tell
   * the eleventh Monday stand-up from a one-off — and why "recurring meetings
   * appear" had no fact to stand on. */
  recurringEventId: string
  /** THE REPEAT RULE ITSELF, as Google states it (`RRULE:FREQ=WEEKLY;BYDAY=MO`).
   * Only ever present on a series MASTER — an expanded instance carries the
   * parent's id above and no rule of its own — so it is "" on nearly every event
   * this app reads, and that absence is the honest answer rather than a gap. */
  recurrence: string[]
  /** WHEN GOOGLE LAST TOUCHED IT. The one field that makes a re-sync cheap to
   * reason about: an entry whose `updated` has not moved since we last read it
   * says nothing changed, without us comparing a dozen fields to find out. */
  updatedAt: string | null
}

/** Guests read off one event. R14's spirit on the other axis (see toEvent): a
 * read that stops at fifty is a bounded cost, whoever sent the invitation. It
 * used to do double duty as a WRITE ceiling too — the guest-list rewrite would
 * rather refuse than silently uninvite everybody past the cap — and that half
 * went with the writes: this product no longer changes anybody's diary. */
const EVENT_ATTENDEE_CAP = 50

/**
 * A WINDOW OF THE DIARY — AND THE ONLY WAY THIS PRODUCT TOUCHES A CALENDAR.
 *
 * ONE-WAY, ON PURPOSE AND BY THE OWNER'S INSTRUCTION (18 Aug 2026): "just
 * remember we want a one-way sync of whatever is in Google Calendar… anything in
 * my calendar should be up to date here. That's all." Every write this file once
 * held — create an entry, patch its title or times, add and remove guests, set a
 * location, call one off — is gone, and with it the four doors and six tools that
 * stood on them. What is left is this read and `calendarGet` beside it, so a
 * calendar cannot be changed FROM kwapso by a person, by the assistant, or by a
 * machine on the MCP surface: there is no function here that could send one, and
 * a missing function cannot be forgotten the way a condition can be inverted.
 *
 * AND THE GRANT NOW SAYS THE SAME THING. This note used to end by admitting that
 * the app still asked Google for the read/WRITE scope (`calendar.events`),
 * because a grant is additive at Google and narrowing it would cost every
 * connected person a reconnect. That was a promise kept in our own code with the
 * power still held — the weaker half of the pair the `drive.file` note is proud
 * of. The ask is `calendar.readonly` as of 18 August 2026, the reconnect is the
 * price, and google-oauth.ts spells out the three things that make the narrowing
 * REAL rather than cosmetic (revoke on disconnect, forced consent, and reading
 * back what Google actually granted).
 *
 * NO `fields` MASK, deliberately. Google's default is the whole event resource,
 * which is exactly what this app now wants — the guest list, the organiser, the
 * conference link, the attachments and the repeat rule are all on it. A mask
 * would make the response smaller and would make every future field somebody
 * needs a silent absence rather than a value: the failure mode of a typo'd mask
 * is not an error, it is a field that is quietly always empty. The read is
 * bounded by `maxResults` either way, which is the cost that actually matters.
 *
 * `showDeleted` is off by default and ON for the re-sync (see syncCalendar in
 * lib/meetings.ts). With `singleEvents=true` a cancelled instance simply is not
 * in the window unless it is asked for, so a diary that never asks can never
 * learn that Tuesday's call was called off — it only ever sees the entry stop
 * being returned, which is indistinguishable from the window having moved.
 */
export async function calendarList(
  token: string,
  range: { from?: string; to?: string; showDeleted?: boolean }
): Promise<CalendarWindow> {
  const out: CalendarEvent[] = []
  let pageToken = ""
  for (let page = 0; page < CALENDAR_MAX_PAGES; page++) {
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events")
    if (range.from) url.searchParams.set("timeMin", range.from)
    if (range.to) url.searchParams.set("timeMax", range.to)
    url.searchParams.set("maxResults", String(GOOGLE_PAGE_SIZE))
    url.searchParams.set("singleEvents", "true")
    url.searchParams.set("orderBy", "startTime")
    if (range.showDeleted) url.searchParams.set("showDeleted", "true")
    if (pageToken) url.searchParams.set("pageToken", pageToken)
    const data = (await googleFetch(url.toString(), token)) as { items?: unknown; nextPageToken?: unknown }
    for (const item of Array.isArray(data.items) ? data.items : []) out.push(toEvent(item))
    pageToken = str(data.nextPageToken)
    if (!pageToken) return { events: out, truncated: false }
  }
  // THE CAP WAS REACHED AND GOOGLE STILL HAS MORE. The one case this whole
  // function exists to stop being silent about — said in the tail, with the
  // window rather than the query string, because a diary's contents are the
  // person's and the dates are ours.
  //
  // AND NOW IT IS SAID TO THE CALLER TOO, not only to the log. The backfill walk
  // in lib/meetings.ts advances a cursor over a window measured in YEARS, so a
  // truncated slice it could not see would be a hole in the diary that closes
  // behind it for ever. `truncated` is what lets the walk stop at the last entry
  // it really read instead of at the date it hoped to reach.
  console.error(
    `[google] calendar window truncated at ${CALENDAR_MAX_PAGES * GOOGLE_PAGE_SIZE} events (${range.from ?? "any"} → ${range.to ?? "any"})`
  )
  return { events: out, truncated: true }
}

/** ONE WINDOW'S ANSWER: what was in it, and whether that was all of it. Two
 * fields rather than a bare array because "fifty entries" and "the first fifty
 * of an unknown number" are different answers and only one of them is safe to
 * move a cursor past. */
export type CalendarWindow = { events: CalendarEvent[]; truncated: boolean }

/** HOW MANY PAGES OF ONE DIARY WINDOW THIS APP WILL WALK.
 *
 * R14, on the axis this file's header calls "the other one": a read that stops
 * at fifty is a bounded cost, and a read that stops at fifty WITHOUT SAYING SO
 * is the fault the law exists for. `maxResults=50` and no `pageToken` is exactly
 * that — a fortnight with fifty-one entries in it loses the tail, the sweep
 * reports success, and the meetings that never appeared are the ones nobody
 * knows to look for.
 *
 * Five pages, so two hundred and fifty entries per window. The windows measured
 * on a real diary returned 43 and 21, so this is an order of magnitude of
 * headroom rather than a number anybody will meet; and the cost stays OURS
 * rather than being set by how busy somebody happens to be, which is the promise
 * the header makes on behalf of every list in this file. When it is met, the
 * tail is dropped LOUDLY — which is the whole difference. */
const CALENDAR_MAX_PAGES = 5

/** ONE event, by its id — the read behind the transcript hunt, which starts at a
 * diary entry and needs that entry's own attachments. Nothing here writes: the
 * calendar is READ-ONLY in this product (see the note above `calendarList`). */
export async function calendarGet(token: string, eventId: string): Promise<CalendarEvent> {
  return toEvent(
    await googleFetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
      token
    )
  )
}

/** THE VIDEO LINK OFF `conferenceData`, when there is no plain `hangoutLink`.
 * Google puts every way into the call on `entryPoints` — a dial-in number, a PIN,
 * an SIP address — and the one a person means by "the link" is the video one.
 * Falling back to the first entry point would hand somebody a phone number when
 * they asked for a meeting room. */
function conferenceVideoUri(conference: Record<string, unknown>): string {
  const points = Array.isArray(conference.entryPoints) ? conference.entryPoints : []
  for (const raw of points) {
    const p = raw as Record<string, unknown>
    if (str(p.entryPointType) === "video" && str(p.uri)) return str(p.uri)
  }
  return ""
}

function toEvent(raw: unknown): CalendarEvent {
  const e = raw as Record<string, unknown>
  const start = (e.start ?? {}) as Record<string, unknown>
  const end = (e.end ?? {}) as Record<string, unknown>
  const conference = (e.conferenceData ?? {}) as Record<string, unknown>
  const organizer = (e.organizer ?? {}) as Record<string, unknown>
  return {
    id: str(e.id),
    summary: str(e.summary),
    description: str(e.description),
    start: str(start.dateTime) || str(start.date),
    end: str(end.dateTime) || str(end.date),
    // The zone rides whichever half of the entry states one; Google writes it on
    // both and they agree.
    timeZone: str(start.timeZone) || str(end.timeZone),
    // `date` and no `dateTime` is Google's own way of saying "a day, not an hour".
    allDay: !str(start.dateTime) && Boolean(str(start.date)),
    url: str(e.htmlLink) || null,
    joinUrl: str(e.hangoutLink) || conferenceVideoUri(conference) || null,
    organizer: { email: str(organizer.email).toLowerCase(), name: str(organizer.displayName) },
    location: str(e.location),
    status: str(e.status),
    meetingCode: str(conference.conferenceId),
    recurringEventId: str(e.recurringEventId),
    recurrence: (Array.isArray(e.recurrence) ? e.recurrence : []).map(str).filter(Boolean),
    updatedAt: str(e.updated) || null,
    // Bounded like every other list here: an event with two hundred guests is
    // one somebody was BCC'd on, and reading all of them would make the cost of
    // one calendar read a number a stranger sets.
    attendees: (Array.isArray(e.attendees) ? e.attendees : [])
      .slice(0, EVENT_ATTENDEE_CAP)
      .map((raw2) => {
        const a = raw2 as Record<string, unknown>
        return {
          email: str(a.email).toLowerCase(),
          name: str(a.displayName),
          response: str(a.responseStatus),
          organizer: a.organizer === true,
          // `optional` is the Events resource's own field name; `optionalAttendee`
          // is what at least one Google client library projects it as. Reading
          // both costs one `||` and removes a whole class of "the badge never
          // shows" that nothing would report as an error.
          optional: a.optional === true || a.optionalAttendee === true,
          resource: a.resource === true,
        }
      })
      .filter((a) => a.email !== ""),
    // Same cap, same reason: an entry somebody attached a folder's worth of
    // material to must not decide what one read costs.
    attachments: (Array.isArray(e.attachments) ? e.attachments : [])
      .slice(0, EVENT_ATTENDEE_CAP)
      .map((raw2) => {
        const a = raw2 as Record<string, unknown>
        return {
          // THE ID, OR THE ID OUT OF THE LINK — and the fallback is not defensive
          // programming, it is the observed shape. Reading a real account's
          // entries on 2026-08-18, every Meet artifact ("Notes by Gemini") came
          // back with a `fileUrl` pointing at `docs.google.com/document/d/<id>`
          // and NO `fileId` beside it. A transcript hunt that insisted on the
          // field would have found nothing on the exact events it was written
          // for, and would have failed silently — there is no error in "this
          // event has no attachments we can use".
          fileId: str(a.fileId) || documentIdInText(str(a.fileUrl)) || "",
          title: str(a.title),
          mimeType: str(a.mimeType),
          iconUrl: str(a.iconLink) || null,
          url: str(a.fileUrl) || null,
        }
      })
      .filter((a) => a.fileId !== "" || a.url !== null),
  }
}

// ── GOOGLE CHAT ──────────────────────────────────────────────────────────────

export type ChatSpace = {
  /** Google's own resource name, `spaces/AAAA…`. The id, not a label. */
  name: string
  /** WHAT TO SHOW A PERSON. Google's own `displayName` where there is one, and a
   * made-up description of the space where there is not — see `toChatSpace`. */
  displayName: string
  /** Google's word: `SPACE`, `DIRECT_MESSAGE` or `GROUP_CHAT`, or "". */
  spaceType: string
  /** FALSE WHEN WE MADE THE LABEL UP. The owner screenshotted a list of raw ids
   * where names belonged, and the fix is not to invent a name and say nothing —
   * it is to say which of these two things the reader is looking at. A screen
   * that cannot tell them apart is a screen that will one day present a guess as
   * a fact. */
  named: boolean
}
export type ChatMessage = {
  id: string
  space: string
  /** WHO SAID IT, in something a person can read. Google's own `displayName`
   * where there is one and an honest description of the speaker where there is
   * not — never `users/112978…`. See `toChatSender`. */
  sender: string
  /** FALSE WHEN WE MADE THE LABEL UP — the same flag, for the same reason, as
   * `ChatSpace.named`. A screen that cannot tell Google's word from ours is a
   * screen that will one day present a guess as a fact. */
  senderNamed: boolean
  text: string
  createdAt: string | null
}

/**
 * A SPACE, WITH SOMETHING A PERSON CAN READ ON IT.
 *
 * THE BUG THIS FIXES, in the owner's own screenshot: a list of `spaces/lJXiZKAAAAE`
 * where names belonged. The old mapping was `displayName || name`, which reads as
 * a sensible fallback and is not one — Google leaves `displayName` EMPTY for
 * every direct message and every ad-hoc group chat, because those spaces have no
 * name. They are "me and Ana". So the fallback fired for the majority of a
 * person's spaces and put a resource id in a list of names.
 *
 * WHAT WE CAN AND CANNOT KNOW HERE, said plainly. `chat.spaces.readonly` — the
 * scope this connection holds — returns a space's TYPE but not its members, so
 * "Ana Ruiz" is not available to us at any price short of asking every connected
 * person to grant `chat.memberships.readonly` and reconnect. Given that, the
 * choice is between an id, an invented name, and an honest description. This
 * takes the third: the type, in words, with `named: false` on it so nothing
 * downstream can mistake our sentence for Google's.
 *
 * The id is still the answer of last resort, for a space whose type Google did
 * not state — but it now arrives labelled as one rather than dressed as a name.
 */
function toChatSpace(raw: unknown): ChatSpace {
  const s = raw as Record<string, unknown>
  const id = str(s.name)
  const given = str(s.displayName)
  if (given) return { name: id, displayName: given, spaceType: str(s.spaceType), named: true }
  const type = str(s.spaceType) || str(s.type)
  const described =
    type === "DIRECT_MESSAGE"
      ? "A direct message"
      : type === "GROUP_CHAT"
        ? "A group chat"
        : type === "SPACE"
          ? "An unnamed space"
          : ""
  return { name: id, displayName: described || id, spaceType: type, named: false }
}

/** The spaces a person could name — the picker, exactly as Drive has one. */
export async function chatSpaces(token: string): Promise<ChatSpace[]> {
  const url = new URL("https://chat.googleapis.com/v1/spaces")
  url.searchParams.set("pageSize", String(GOOGLE_PAGE_SIZE))
  const data = (await googleFetch(url.toString(), token)) as { spaces?: unknown }
  return (Array.isArray(data.spaces) ? data.spaces : []).map(toChatSpace)
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
    return {
      id: str(m.name),
      space: spaceName,
      ...toChatSender(m.sender),
      text: str(m.text),
      createdAt: str(m.createTime) || null,
    }
  })
}

/**
 * WHO SAID IT — the same fix as `toChatSpace`, one layer down, and it was left
 * behind by that one.
 *
 * THE BUG, in the owner's own words about his own screen: the space names were
 * put right and the senders still read `users/112978…`. The old mapping was
 * `displayName || name`, which reads as a sensible fallback and is not one —
 * Google's `messages.list` populates `displayName` for an APP and leaves it
 * empty for a person, so the fallback fired for every human being in the
 * conversation and printed a resource id where a name belonged.
 *
 * WHAT WE CAN AND CANNOT KNOW HERE, said plainly. The connection holds
 * `chat.spaces.readonly` and `chat.messages`, neither of which returns a
 * membership. Turning `users/112978…` into "Ana Ruiz" needs
 * `chat.memberships.readonly` — a wider grant, from every connected person,
 * re-consented — and this app does not ask for it. So the choice is between an
 * id, an invented name, and an honest description of the speaker, and this takes
 * the third exactly as the space fix did.
 *
 * `type` IS THE ONE THING GOOGLE DOES TELL US, and it is worth saying: "an app
 * in this space" and "somebody in this space" are different readers of a
 * conversation, and a transcript that ran the two together would read as a
 * person talking to themselves. The id remains the answer of last resort, for a
 * sender Google described in no way at all — but it now arrives labelled as one
 * rather than dressed as a name.
 */
function toChatSender(raw: unknown): { sender: string; senderNamed: boolean } {
  const s = (raw ?? {}) as Record<string, unknown>
  const given = str(s.displayName)
  if (given) return { sender: given, senderNamed: true }
  const type = str(s.type)
  const described = type === "BOT" ? "An app" : type === "HUMAN" ? "Somebody in this space" : ""
  return { sender: described || str(s.name), senderNamed: false }
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
    // OUR OWN NAME, and `named` because it is: we know exactly who said this one.
    sender: "kwapso",
    senderNamed: true,
    text: str(data.text) || text,
    createdAt: str(data.createTime) || null,
  }
}

// ── HAS IT GONE? ─────────────────────────────────────────────────────────────
//
// THE QUESTION THE KNOWLEDGE BASE HAS TO ASK, and the only shape of answer it
// may act on.
//
// Every other kind of material in this app is a row in a table the sweep walks,
// so "it was archived" is a column the sweep READS. Google's four kinds are not:
// they are a live listing, and a file somebody deleted is simply not in it. The
// sweep walks forward past a source it will never see again, and the assistant
// goes on quoting a document that no longer exists — indefinitely, because
// nothing ever tells the index to let go.
//
// ABSENCE IS NOT DELETION, and that is the whole reason this is a separate call
// rather than a set subtraction. An item can be missing from a listing because
// it fell outside a window, because it slid past a page cap, because a query
// stopped matching it, or because Google had a bad minute. Retiring on absence
// would empty somebody's index during an outage and call it tidying up.
//
// So the answer is THREE-VALUED and only one of the three does anything:
//
//   • "gone"    — Google said so. In the bin, called off, or no longer there at
//                 all (404). The source is retired: it stops being quoted, and
//                 the row and its history survive, because nothing here deletes.
//   • "there"   — Google handed it over. Nothing happens.
//   • "unknown" — anything else, including a refusal (403) and a timeout. A
//                 refusal is genuinely ambiguous: sharing withdrawn and a Shared
//                 Drive having a policy look identical from here, and one of
//                 those is not a deletion. Nothing happens, and the next sweep
//                 asks again — the cheapest possible way to be wrong.

/** What Google says about one item we still hold a source for. */
export type GooglePresence = "gone" | "there" | "unknown"

/** Which services can be asked this question directly. Chat is absent on
 * purpose: a Chat source is a SPACE somebody named in kwapso, so the positive
 * signal for it is the named source being switched off — a fact in this app's
 * own database, which lib/knowledge-google.ts reads without asking Google at
 * all. */
export type ProbableService = "drive" | "gmail" | "calendar"

/** Where each service is asked, and what its answer looks like when the thing is
 * in the bin rather than missing. Data rather than a switch, so the three read
 * as one decision and a fourth cannot be added without stating both halves. */
const PRESENCE_PROBES: Record<
  ProbableService,
  { url: (id: string) => string; goneWhen: (body: Record<string, unknown>) => boolean }
> = {
  // Drive's bin is a flag on the file, not a different place: a trashed file is
  // still fetchable, still named, and still emphatically not something the owner
  // can see any more.
  drive: {
    url: (id) =>
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=trashed&supportsAllDrives=true`,
    goneWhen: (b) => b.trashed === true,
  },
  // Gmail's bin is a LABEL, and a message keeps its id in it. `minimal` is the
  // cheapest format that carries labels and carries no body — this asks whether
  // a message exists, and reading its words to find that out would be paying for
  // somebody's mail to check that it is still theirs.
  gmail: {
    url: (id) =>
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=minimal`,
    goneWhen: (b) => (Array.isArray(b.labelIds) ? b.labelIds : []).includes("TRASH"),
  },
  // A cancelled event is the one of the three that is not deleted at all: Google
  // keeps it and marks it off, which is exactly what `showDeleted` on the diary
  // sweep exists to see. Same fact, asked one event at a time.
  calendar: {
    url: (id) =>
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`,
    goneWhen: (b) => str(b.status) === "cancelled",
  },
}

/**
 * ASK GOOGLE ABOUT ONE ITEM WE STILL HOLD.
 *
 * NOT THROUGH `googleFetch`, and that is the one thing worth explaining. That
 * function maps every non-2xx onto the product's own words — a 502 for the
 * caller, a 409 for a dead grant — which is right for a door somebody is
 * standing at and useless here: this call's entire purpose is to tell 404 apart
 * from every other failure, and `googleFetch` has already thrown that
 * distinction away by the time it returns. It carries its own R11 timeout for
 * the same reason every other fetch in this file does.
 *
 * Nothing about a person's material is read: two of the three probes name a
 * single field, and none asks for a body.
 */
export async function googlePresence(
  service: ProbableService,
  token: string,
  externalId: string
): Promise<GooglePresence> {
  const probe = PRESENCE_PROBES[service]
  try {
    const res = await fetch(probe.url(externalId), {
      // R11 — a hung Google socket must not stall the sweep.
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${token}` },
    })
    // NOT THERE AT ALL. The only status this reads as an answer rather than as a
    // failure — 403 and 5xx are both "ask again later" (see the essay above).
    if (res.status === 404) return "gone"
    if (!res.ok) return "unknown"
    return probe.goneWhen((await res.json()) as Record<string, unknown>) ? "gone" : "there"
  } catch {
    // A timeout, a torn socket, a body that is not JSON. None of them is Google
    // saying the material has gone.
    return "unknown"
  }
}
