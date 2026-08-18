// GOOGLE ROUTES — connecting an account, choosing what it shares, and reading
// and writing through it.
//
// EVERY DOOR HERE REFUSES A CLIENT LOGIN, AT THE DOOR (R21). Not "clients have
// no screen for this" — no client login may pass any of these, full stop: they
// get no assistant and no Google surface at all. The refusal is written on each
// handler rather than left to the portal gateway's allow-list, because the
// AGENCY gateway forwards by PREFIX and a client login is an ordinary team
// member holding an ordinary role. A door not named on the portal's list is
// still served to that same person at the other hostname. That mistake has been
// made twice in this codebase and caught twice.
//
// THE OTHER RULE EVERY DOOR HERE FOLLOWS: whose connection it is comes from the
// GUARD, never from the request. There is no `?userId=` anywhere in this file
// and there is nowhere to put one — the read functions in lib/google.ts take a
// guard and select on `guard.userId`. "The assistant sees only what that person
// can see" is therefore a property of the code's shape rather than a check
// somebody has to remember.
//
// THE TWO SWITCHES, and which door each one guards:
//   • google:create      — may connect a Google account (and name a folder/space);
//   • google_mail:create — kwapso may SEND mail as you.
// The second is demanded ON TOP of `google:edit`, so a role that can send but
// cannot otherwise use the connection is not a state anybody can reach. And it
// is demanded of the PERSON pressing "send it from kwapso" exactly as it is of
// the assistant: it is the same act, by the same product, out of the same
// mailbox, so it is the same permission.
//
// THERE WAS A THIRD, `google_events:create` — "kwapso may put an EVENT in your
// calendar" — and it went with the doors it guarded. The calendar is READ-ONLY
// here now: this file reads a diary and never writes one. See the note where the
// six write doors used to be, below the events read.

import { fail, json } from "@shared/workers/http"
import { queryText, requireText, optionalText, TEXT_LIMITS } from "@shared/workers/validate"
import { GuardError, requireRight, teamContext } from "@shared/workers/gating"
import { publishChange } from "@shared/workers/realtime"
import { refusePortalCaller } from "@shared/workers/account-scope"
import { gated, gatedBody } from "@shared/workers/route"
import {
  accessTokenFor,
  addNamedSource,
  asNamedService,
  asService,
  asShelf,
  disconnect,
  listConnections,
  listNamedSources,
  ownSourceOrThrow,
  recordGoogleAct,
  saveConnection,
  setNamedSourceActive,
} from "../lib/google"
import { tokenStorageReady } from "../lib/google-crypto"
import {
  buildConnectStart,
  connectCookie,
  connectCredentials,
  connectedEmail,
  CONNECT_COOKIE,
  exchangeConnectCode,
  readCookie,
} from "../lib/google-oauth"
import {
  calendarGet,
  calendarList,
  chatDelete,
  chatMessages,
  chatPost,
  chatSpaces,
  driveCreateFolder,
  driveFileText,
  driveFilesById,
  driveFilesPick,
  driveFolders,
  driveList,
  driveThumbnail,
  driveTrash,
  driveUpdate,
  driveUpload,
  gmailDraft,
  gmailLabelId,
  gmailLabelMessage,
  gmailMessage,
  gmailMessageLabelIds,
  gmailReply,
  gmailSearch,
  gmailSend,
  gmailSendDraft,
  gmailThread,
  knownContactQuery,
} from "../lib/google-api"
import { knownContactEmails } from "../lib/google-read"
import { findTranscript } from "../lib/google-transcript"
import type { Env } from "../env"

// ── the connection itself ────────────────────────────────────────────────────

/** GET /api/content/google/connections — my connections and what I have shared.
 *
 * `ready` says whether this DEPLOY can hold a connection at all (the OAuth app
 * and the token key are both configured). The card asks once and says so, rather
 * than offering a Connect button that fails at the far end of a consent screen. */
export async function getGoogleConnections(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "google", "read")
  await refusePortalCaller(cfg, guard)
  return json({
    connections: await listConnections(cfg, guard),
    sources: await listNamedSources(cfg, guard),
    ready: Boolean(connectCredentials(env)) && tokenStorageReady(env),
  })
}

/** GET /api/content/google/start?service=drive — bounce to Google's consent
 * screen for ONE service. Four separate consents on purpose: connecting Drive
 * must never quietly hand over a mailbox. */
export async function getGoogleStart(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "google", "create")
  await refusePortalCaller(cfg, guard)
  const service = asService(queryText(new URL(request.url).searchParams.get("service"), "Service"))
  // BOTH halves checked here, before anybody leaves: the OAuth app AND the key
  // that will hold what they grant. Sending somebody to a consent screen we
  // cannot store the result of is the one failure that costs them a decision
  // they have to make again.
  const creds = connectCredentials(env)
  if (!creds || !tokenStorageReady(env))
    return fail(503, "google_not_ready", "Google connections aren't set up on this environment yet.")
  const { url, setCookie } = await buildConnectStart(env, creds, service)
  return new Response(null, { status: 302, headers: { Location: url, "Set-Cookie": setCookie } })
}

/**
 * GET /api/content/google/callback — Google sends the browser back here.
 *
 * IT WRITES NOTHING, and that is a deliberate shape rather than an accident of
 * the flow. A GET that stores a credential is a GET that mutates, which the base
 * classifies as a read and therefore never asks to gate or to publish (R1/R10
 * both skip GETs, correctly, because a GET should not change anything). So this
 * door does the one thing a redirect target must do — check that the round-trip
 * is the one we started — and moves the authorization code into the same
 * HttpOnly one-shot cookie it arrived to find. The POST beside it consumes that
 * cookie, and IT is the gated, publishing mutation.
 *
 * The code therefore never travels in a URL we build, and never lands in browser
 * history or a Referer beyond Google's own redirect.
 *
 * Identity-gated rather than permission-gated: it verifies WHO is standing here
 * (teamContext) and refuses a client login, and the permission is checked one
 * step later where the credential is actually stored.
 */
export async function getGoogleCallback(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await refusePortalCaller(cfg, guard)

  const origin = (env.PUBLIC_APP_URL ?? "").replace(/\/+$/, "")
  /** Back to Settings with a word, and ALWAYS without the one-shot cookie — a
   * state that survives its round-trip is a replay waiting to happen. */
  const back = (outcome: string, keep?: string) =>
    new Response(null, {
      status: 302,
      headers: {
        Location: `${origin}/settings?google=${encodeURIComponent(outcome)}`,
        "Set-Cookie": keep ?? connectCookie("", 0, env.INSECURE_COOKIE),
      },
    })

  const url = new URL(request.url)
  // The QUERY half of the boundary (R20). Google's own values are small, but
  // anybody can call this address with a multi-megabyte `?code=`.
  const code = queryText(url.searchParams.get("code"), "Code", TEXT_LIMITS.link)
  const state = queryText(url.searchParams.get("state"), "State", TEXT_LIMITS.short)
  const cookie = readCookie(request, CONNECT_COOKIE)
  if (!code || !state || !cookie) return back("failed")

  const [cookieState, verifier, service] = cookie.split(".")
  if (!verifier || !service || state !== cookieState) return back("failed")

  // The code moves into the cookie, five minutes to be spent. Same cookie, same
  // Path and SameSite, so it is cleared by the same call that made it.
  return back("connected", connectCookie(`code.${code}.${verifier}.${service}`, 300, env.INSECURE_COOKIE))
}

/** POST /api/content/google/connect — finish the handshake and keep it.
 *
 * Takes NO body: everything it needs is in the HttpOnly cookie the callback
 * left, which is the point (a code in a body is a code that was in a URL, in
 * history, in somebody's screen recording). Gated on the switch the owner named
 * — "may connect a Google account" — and it publishes, because it changes a row
 * a screen is looking at. */
export async function postGoogleConnect(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await gated(request, env, "google", "create")
  await refusePortalCaller(cfg, guard)
  const creds = connectCredentials(env)
  if (!creds) return fail(503, "google_not_ready", "Google connections aren't set up on this environment yet.")

  const cookie = readCookie(request, CONNECT_COOKIE)
  const [marker, code, verifier, rawService] = (cookie ?? "").split(".")
  if (marker !== "code" || !code || !verifier || !rawService)
    return fail(409, "google_no_handshake", "That connection didn't finish. Start again from Settings.")
  const service = asService(rawService)

  const tokens = await exchangeConnectCode(env, creds, code, verifier)
  const id = await saveConnection(env, cfg, guard, actor, {
    service,
    googleEmail: await connectedEmail(tokens.accessToken),
    tokens,
  })
  await publishChange(env, guard.teamId, "google", id)
  // The one-shot cookie is spent whatever happened next.
  return json(
    { connections: await listConnections(cfg, guard), sources: await listNamedSources(cfg, guard) },
    200,
    { "Set-Cookie": connectCookie("", 0, env.INSECURE_COOKIE) }
  )
}

/** POST /api/content/google/disconnect — stop using one service, and ask Google
 * to drop the grant too. R17: a second click moves zero rows and says so. */
export async function postGoogleDisconnect(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ service?: unknown }>(
    request,
    env,
    "google",
    "delete"
  )
  await refusePortalCaller(cfg, guard)
  // THROUGH the text seam first, THEN the allow-list (R20 is positional: a body
  // field has to sit where something is checking it, and `asService` is this
  // module's word, not the seam's). requireText decides it is a string of sane
  // length; asService decides it is one of the four.
  const service = asService(requireText(body.service, "Service", TEXT_LIMITS.short))
  const result = await disconnect(env, cfg, guard, actor, service)
  if (result.changed) await publishChange(env, guard.teamId, "google")
  return json({
    ...result,
    connections: await listConnections(cfg, guard),
    sources: await listNamedSources(cfg, guard),
  })
}

// ── what a connection shares ─────────────────────────────────────────────────

/** GET /api/content/google/pick?service=drive&kind=file&q= — the folders, files
 * or spaces this person could name. A read, and the only way to learn an id
 * worth naming: everything it returns is something the CALLER's own account can
 * already see.
 *
 * `kind` is what the owner's question added — "In Drive, why is it that it's
 * only folder-wise?" — so Drive now has two pickers behind one door, because
 * they answer the same question about two shapes of the same thing. Absent, or
 * anything but `file`, means folders: the old behaviour is what a caller who
 * does not know about the new one gets.
 *
 * Every option carries its ICON and its type, because a list of Drive files
 * whose names all end in the same three words is a list nobody can pick from. */
export async function getGooglePick(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "google", "create")
  await refusePortalCaller(cfg, guard)
  const url = new URL(request.url)
  const service = asNamedService(queryText(url.searchParams.get("service"), "Service"))
  const q = queryText(url.searchParams.get("q"), "Search", TEXT_LIMITS.short)
  const kind = queryText(url.searchParams.get("kind"), "Kind", TEXT_LIMITS.short)
  const { token } = await accessTokenFor(env, cfg, guard, service)
  const options =
    service === "chat"
      ? (await chatSpaces(token)).map((s) => ({
          externalId: s.name,
          name: s.displayName,
          // WE MADE THIS LABEL UP, and the picker says so rather than presenting
          // "A direct message" as a name Google gave us. See `toChatSpace`.
          named: s.named,
          iconUrl: null,
          mimeType: "",
          hasThumbnail: false,
        }))
      : (kind === "file" ? await driveFilesPick(token, q) : await driveFolders(token, q)).map((f) => ({
          externalId: f.id,
          name: f.name,
          named: true,
          iconUrl: f.iconUrl,
          mimeType: f.mimeType,
          // WHETHER THERE IS A PREVIEW — the fact, never Google's own link to
          // one, which is authenticated and expires (see `DriveFile`). A picker
          // that knows this can show a picture of the contract somebody is about
          // to share, which is the difference between picking the right file and
          // picking the one with the right name.
          hasThumbnail: f.hasThumbnail,
        }))
  return json({ options })
}

/** POST /api/content/google/sources — name Drive folders, Drive FILES, or Chat
 * spaces. SEVERAL AT ONCE.
 *
 * THE OWNER'S TWO ASKS, ANSWERED IN ONE DOOR. "Can you make it so that I can
 * select multiple spaces, multiple folders, and multiple files at once?" and "In
 * Drive, why is it that it's only folder-wise?"
 *
 * WHY A LIST RATHER THAN A DOOR CALLED N TIMES. The three decisions that come
 * with a share — who may read it, whose material it is, and what kind of thing
 * it is — are the same for every item in one act of sharing. A client asked to
 * repeat them per item would either ask the person three questions per folder,
 * or ask once and send them N times, which is a promise the client keeps rather
 * than the door. One call, one set of answers, one history line per row.
 *
 * `shelf` is required in spirit and defaulted to `private` in code: the safe
 * answer is the one you get by not deciding. The screen asks the question in
 * words at the moment of sharing ("who will be able to read this?"), because a
 * person who thinks a folder is theirs alone and finds a colleague quoting it
 * back is the failure this whole column exists to prevent.
 *
 * A REPEAT IS NOT AN ERROR. `addNamedSource` answers a folder already shared
 * with the row it already has, so a list holding one new folder and four old
 * ones shares the one and says nothing about the four. */
export async function postGoogleSource(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{
    service?: unknown
    items?: unknown
    shelf?: unknown
    accountId?: unknown
  }>(request, env, "google", "create")
  await refusePortalCaller(cfg, guard)
  // Through the text seam, then the module's own allow-list — see the note on
  // the disconnect door for why the order is not optional (R20 is positional).
  const service = asNamedService(requireText(body.service, "Service", TEXT_LIMITS.short))
  const shelf = asShelf(optionalText(body.shelf, "Shelf", TEXT_LIMITS.short))
  // WHOSE MATERIAL IS IN IT — asked here, in the same breath as who may read
  // it, because both are decisions about where the contents end up and neither
  // can be read back off the contents. Left off = the agency's own.
  const accountId = optionalText(body.accountId, "Client", TEXT_LIMITS.short) ?? null
  // R20, the array shape, exactly as the calendar guest door does it:
  // `Array.isArray` decides it is a list, then every field inside goes through
  // the same text seam a single one would. A list is not a way in for values a
  // scalar could not carry.
  const items = shareList(Array.isArray(body.items) ? body.items : [])
  if (items.length === 0) return fail(400, "invalid_input", "Say what to share.")

  const ids: string[] = []
  for (const item of items)
    ids.push(
      await addNamedSource(cfg, guard, actor, {
        service,
        externalId: item.externalId,
        name: item.name,
        // A Chat share is always a space; a Drive share is a folder unless the
        // caller said file. Decided HERE from the service rather than trusted off
        // the request, so there is no way to spell a Chat "folder".
        kind: service === "chat" ? "space" : item.kind === "file" ? "file" : "folder",
        shelf,
        accountId,
      })
    )
  // One ping per row, because each is a row a screen is looking at (R1/R15).
  for (const id of ids) await publishChange(env, guard.teamId, "google", id)
  return json({ sources: await listNamedSources(cfg, guard), shared: ids.length })
}

/** The things one share request may name: a bounded list, every field through
 * the same text seam a single one would use. */
function shareList(value: unknown[]): { externalId: string; name: string; kind: string }[] {
  if (value.length > SHARE_CAP)
    throw new GuardError(400, "invalid_input", `That's more than ${SHARE_CAP} things in one go.`)
  return value.map((raw) => {
    const item = (raw ?? {}) as { externalId?: unknown; name?: unknown; kind?: unknown }
    return {
      externalId: requireText(item.externalId, "Folder, file or space", TEXT_LIMITS.short),
      name: requireText(item.name, "Name", TEXT_LIMITS.short),
      kind: optionalText(item.kind, "Kind", TEXT_LIMITS.short) ?? "folder",
    }
  })
}

/** Things one call may share. Small on purpose, for the same reason the guest
 * cap is: sharing is something a person does by picking, and a request naming
 * five hundred folders is a script wearing a form's clothes. */
const SHARE_CAP = 25

/** POST /api/content/google/sources/active — stop sharing one, or share it
 * again. Gated on `delete`, because taking material away IS this module's
 * delete: the row survives, the assistant's sight of it does not. */
export async function postGoogleSourceActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown; active?: unknown }>(
    request,
    env,
    "google",
    "delete"
  )
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Folder or space", TEXT_LIMITS.short)
  if (typeof body.active !== "boolean") return fail(400, "invalid_input", "id and active are required.")
  const changed = await setNamedSourceActive(cfg, guard, actor, id, body.active)
  if (changed) await publishChange(env, guard.teamId, "google", id)
  return json({ sources: await listNamedSources(cfg, guard) })
}

// ── DRIVE ────────────────────────────────────────────────────────────────────

/** GET /api/content/google/drive/files?q= — files in the folders I named PLUS
 * the files I named one by one, and nowhere else. A person who has shared
 * nothing gets an empty list, which is the honest answer.
 *
 * The two halves are the same fence at two grains (see `driveFilesById`): a
 * folder is a place to look inside, a file is the thing itself, and neither can
 * reach anything the person did not choose. A named file ignores `q` — somebody
 * who shared exactly one contract has already narrowed it as far as it goes, and
 * hiding it behind a search term would make a deliberate share disappear from
 * the list that exists to show what is shared. */
export async function getGoogleDriveFiles(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "google", "read")
  await refusePortalCaller(cfg, guard)
  const q = queryText(new URL(request.url).searchParams.get("q"), "Search", TEXT_LIMITS.short)
  const { token } = await accessTokenFor(env, cfg, guard, "drive")
  const shared = (await listNamedSources(cfg, guard, "drive")).filter((s) => s.active)
  const [inFolders, named] = await Promise.all([
    driveList(token, shared.filter((s) => s.kind === "folder").map((f) => f.externalId), q),
    driveFilesById(token, shared.filter((s) => s.kind === "file").map((f) => f.externalId)),
  ])
  return json({ files: [...inFolders, ...named] })
}

/**
 * GET /api/content/google/drive/thumbnail?fileId= — a PICTURE of a file, as
 * bytes.
 *
 * THE OWNER: "if there is any way we can begin to pull in metadata like the
 * logos or the preview URLs or anything like that… Previews are very helpful."
 * They are, and Google's own preview link cannot simply be handed to a browser:
 * it is authenticated with a bearer token and it expires within hours, so a page
 * that puts it in an `<img src>` shows a broken image to everybody except the
 * person whose request happened to mint it, and to them only until it rots.
 *
 * TWO WAYS TO SOLVE THAT, and the choice is written out in `driveThumbnail`:
 * copy the picture into R2 and serve it from `/media/*` like a ticket
 * attachment, or fetch it on read with the caller's own token. This is the
 * second. Nothing is stored, so there is no stale copy of somebody's document in
 * our storage to keep after they unshare it, and the preview is as current as
 * the document.
 *
 * THE FENCE IS GOOGLE'S OWN, exactly as it is on the file-text door beside it:
 * the call carries the CALLER's token, so a file id naming a document their
 * Google account cannot read is refused at Google rather than by a clause here
 * that could be forgotten.
 *
 * Cached at the edge for an hour, which is what makes a list of previews
 * affordable — and a file with no preview is a 404 with no body rather than an
 * error, because a spreadsheet having no picture is not a failure.
 */
export async function getGoogleDriveThumbnail(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "google", "read")
  await refusePortalCaller(cfg, guard)
  const fileId = queryText(new URL(request.url).searchParams.get("fileId"), "File", TEXT_LIMITS.short)
  if (!fileId) return fail(400, "invalid_input", "Say which file.")
  const { token } = await accessTokenFor(env, cfg, guard, "drive")
  const picture = await driveThumbnail(token, fileId)
  if (!picture) return fail(404, "google_no_preview", "There's no preview for that file.")
  return new Response(picture.body, {
    headers: {
      "Content-Type": picture.contentType,
      // PRIVATE, and that is not a detail. This is one person's document rendered
      // as an image; a shared cache holding it would serve it to the next caller
      // who asked for the same id, whoever they are.
      "Cache-Control": "private, max-age=3600",
    },
  })
}

/** GET /api/content/google/drive/file?fileId= — one file's readable text. */
export async function getGoogleDriveFile(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "google", "read")
  await refusePortalCaller(cfg, guard)
  const fileId = queryText(new URL(request.url).searchParams.get("fileId"), "File", TEXT_LIMITS.short)
  if (!fileId) return fail(400, "invalid_input", "Say which file.")
  const { token } = await accessTokenFor(env, cfg, guard, "drive")
  return json({ fileId, text: await driveFileText(token, fileId) })
}

/** POST /api/content/google/drive/upload — put a file INTO a folder I named.
 *
 * `sourceId` names one of the caller's OWN named folders — never a raw Google
 * folder id. That is what keeps "named folders only" true for writes as well as
 * reads: there is no way to spell a folder this person did not choose. */
export async function postGoogleDriveUpload(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{
    sourceId?: unknown
    name?: unknown
    text?: unknown
    mimeType?: unknown
  }>(request, env, "google", "edit")
  await refusePortalCaller(cfg, guard)
  const source = await ownSourceOrThrow(cfg, guard, requireText(body.sourceId, "Folder", TEXT_LIMITS.short))
  if (source.service !== "drive") return fail(400, "invalid_input", "That isn't a Drive folder.")
  const name = requireText(body.name, "File name", TEXT_LIMITS.short)
  const { token, connectionId } = await accessTokenFor(env, cfg, guard, "drive")
  const file = await driveUpload(token, {
    folderId: source.externalId,
    name,
    mimeType: optionalText(body.mimeType, "File type", TEXT_LIMITS.short) ?? "text/plain",
    text: requireText(body.text, "Contents", TEXT_LIMITS.long),
  })
  await recordGoogleAct(cfg, guard, actor, {
    connectionId,
    type: "File written to Drive",
    description: `${actor.name} wrote "${name}" into "${source.name}"`,
  })
  await publishChange(env, guard.teamId, "google", connectionId)
  return json({ file })
}

/**
 * POST /api/content/google/drive/update — rewrite a file that is already there.
 *
 * THE PAIR TO THE UPLOAD ABOVE, and the two are fenced differently on purpose.
 * The upload names one of the caller's OWN folders, because choosing where a new
 * file lands is a decision only they can make. A rewrite names a FILE, and the
 * fence is Google's own: the connection holds `drive.file`, which grants writing
 * only to files this app created or the person explicitly opened to it, so a file
 * id naming somebody's tax return is refused at Google rather than by a clause
 * here that could be forgotten. That is the same reasoning the scope list itself
 * gives — a promise kept at Google beats a promise kept in a line of our code.
 *
 * `text` is the WHOLE new contents, not an append. A door that appended would
 * need a door that replaced beside it, and two ways to write one file is how two
 * callers end up disagreeing about what the file says.
 */
export async function postGoogleDriveUpdate(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{
    fileId?: unknown
    name?: unknown
    text?: unknown
    mimeType?: unknown
  }>(request, env, "google", "edit")
  await refusePortalCaller(cfg, guard)
  const fileId = requireText(body.fileId, "File", TEXT_LIMITS.short)
  const { token, connectionId } = await accessTokenFor(env, cfg, guard, "drive")
  const file = await driveUpdate(token, {
    fileId,
    name: optionalText(body.name, "File name", TEXT_LIMITS.short),
    mimeType: optionalText(body.mimeType, "File type", TEXT_LIMITS.short) ?? "text/plain",
    text: requireText(body.text, "Contents", TEXT_LIMITS.long),
  })
  await recordGoogleAct(cfg, guard, actor, {
    connectionId,
    type: "File rewritten in Drive",
    description: `${actor.name} rewrote "${file.name}" in Drive`,
  })
  await publishChange(env, guard.teamId, "google", connectionId)
  return json({ file })
}

/** POST /api/content/google/drive/folder — a new folder inside one I named.
 *
 * `sourceId` is one of the caller's own named folders, exactly as the upload's
 * is: a folder can only be made somewhere they already chose. That keeps "named
 * folders only" true for the SHAPE of somebody's Drive as well as its contents —
 * there is no way to spell a parent this person did not name. */
export async function postGoogleDriveFolder(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ sourceId?: unknown; name?: unknown }>(
    request,
    env,
    "google",
    "edit"
  )
  await refusePortalCaller(cfg, guard)
  const source = await ownSourceOrThrow(cfg, guard, requireText(body.sourceId, "Folder", TEXT_LIMITS.short))
  if (source.service !== "drive") return fail(400, "invalid_input", "That isn't a Drive folder.")
  const name = requireText(body.name, "Folder name", TEXT_LIMITS.short)
  const { token, connectionId } = await accessTokenFor(env, cfg, guard, "drive")
  const folder = await driveCreateFolder(token, { parentId: source.externalId, name })
  await recordGoogleAct(cfg, guard, actor, {
    connectionId,
    type: "Folder made in Drive",
    description: `${actor.name} made the "${name}" folder inside "${source.name}"`,
  })
  await publishChange(env, guard.teamId, "google", connectionId)
  return json({ folder })
}

/**
 * POST /api/content/google/drive/save-mail — file a message, or a whole
 * conversation, into Drive as a document.
 *
 * THE ONE DOOR IN THIS MODULE THAT TOUCHES TWO SERVICES, and it needs both
 * connections because it is genuinely doing two things: reading mail as the
 * caller, and writing a file as the caller. Either one missing is answered by
 * the token seam in the ordinary way — "you haven't connected that yet" — rather
 * than by a half-done copy.
 *
 * `threadId` copies the WHOLE exchange, oldest first; `messageId` copies one
 * message. A thread is what a person means nine times in ten ("put the Bergman
 * negotiation in the client folder"), and a single message is what they mean
 * when they say "just that one".
 *
 * It is a text document rather than an .eml: the point of filing a conversation
 * is that somebody can READ it later — in Drive's own preview, in a search, and
 * through the knowledge base, which indexes text and cannot open a mail archive.
 */
export async function postGoogleDriveSaveMail(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{
    sourceId?: unknown
    messageId?: unknown
    threadId?: unknown
    name?: unknown
  }>(request, env, "google", "edit")
  await refusePortalCaller(cfg, guard)
  const source = await ownSourceOrThrow(cfg, guard, requireText(body.sourceId, "Folder", TEXT_LIMITS.short))
  if (source.service !== "drive") return fail(400, "invalid_input", "That isn't a Drive folder.")
  const messageId = optionalText(body.messageId, "Message", TEXT_LIMITS.short)
  const threadId = optionalText(body.threadId, "Conversation", TEXT_LIMITS.short)
  if (!messageId && !threadId)
    return fail(400, "invalid_input", "Say which message or which conversation.")

  const { token: mailToken } = await accessTokenFor(env, cfg, guard, "gmail")
  const messages = threadId
    ? await gmailThread(mailToken, threadId)
    : [await gmailMessage(mailToken, messageId as string)]
  if (messages.length === 0) return fail(404, "google_mail_not_found", "There's nothing in that conversation.")

  const { token: driveToken, connectionId } = await accessTokenFor(env, cfg, guard, "drive")
  const name =
    optionalText(body.name, "File name", TEXT_LIMITS.short) ??
    `${messages[0].subject || "(no subject)"}.txt`
  const file = await driveUpload(driveToken, {
    folderId: source.externalId,
    name,
    mimeType: "text/plain",
    text: messages
      .map((m) => `From: ${m.from}\nTo: ${m.to}\nDate: ${m.date ?? ""}\nSubject: ${m.subject}\n\n${m.text || m.snippet}`)
      .join("\n\n———\n\n"),
  })
  await recordGoogleAct(cfg, guard, actor, {
    connectionId,
    type: "Mail filed in Drive",
    description: `${actor.name} filed ${messages.length === 1 ? "a message" : `${messages.length} messages`} into "${source.name}"`,
  })
  await publishChange(env, guard.teamId, "google", connectionId)
  return json({ file, messagesSaved: messages.length })
}

/**
 * POST /api/content/google/drive/trash — put a file kwapso wrote back in the bin.
 *
 * NOT ONE OF THE ELEVEN THE OWNER ASKED FOR, and it is here because the other
 * three make it necessary: an assistant that can make a folder, write a file and
 * rewrite it, with no way to take any of it back, is an assistant whose mistakes
 * are permanent. The bin rather than a delete is the house rule in Google's own
 * words — the file keeps its name, its history and its sharing for thirty days
 * and one click restores it — so there is no act here anybody has to be afraid of.
 *
 * R17: a file already in the bin moves nothing, writes no history row and rings
 * no bell.
 */
export async function postGoogleDriveTrash(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ fileId?: unknown }>(
    request,
    env,
    "google",
    "delete"
  )
  await refusePortalCaller(cfg, guard)
  const fileId = requireText(body.fileId, "File", TEXT_LIMITS.short)
  const { token, connectionId } = await accessTokenFor(env, cfg, guard, "drive")
  const result = await driveTrash(token, fileId)
  if (result.changed) {
    await recordGoogleAct(cfg, guard, actor, {
      connectionId,
      type: "File binned in Drive",
      description: `${actor.name} put "${result.name}" in the Drive bin`,
    })
    await publishChange(env, guard.teamId, "google", connectionId)
  }
  return json({ changed: result.changed, name: result.name })
}

// ── GMAIL ────────────────────────────────────────────────────────────────────

/** GET /api/content/google/gmail/messages?q= — mail to or from a KNOWN CONTACT,
 * and only that. The contact fence is built server-side from the accounts table
 * and the caller's words are ANDed inside it, so `q` can narrow and can never
 * widen. No known contacts → nothing, said plainly. */
export async function getGoogleMail(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "google", "read")
  await refusePortalCaller(cfg, guard)
  const q = queryText(new URL(request.url).searchParams.get("q"), "Search", TEXT_LIMITS.short)
  const contacts = await knownContactEmails(cfg, guard)
  const fence = knownContactQuery(contacts)
  if (!fence)
    return json({ messages: [], contactsUsed: 0, note: "No contact on any account has an email address yet." })
  const { token } = await accessTokenFor(env, cfg, guard, "gmail")
  return json({ messages: await gmailSearch(token, fence, q), contactsUsed: contacts.length })
}

/** GET /api/content/google/gmail/message?messageId= — one message, with its text. */
export async function getGoogleMailMessage(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "google", "read")
  await refusePortalCaller(cfg, guard)
  const messageId = queryText(new URL(request.url).searchParams.get("messageId"), "Message", TEXT_LIMITS.short)
  if (!messageId) return fail(400, "invalid_input", "Say which message.")
  const { token } = await accessTokenFor(env, cfg, guard, "gmail")
  return json({ message: await gmailMessage(token, messageId) })
}

/** POST /api/content/google/gmail/draft — write a reply and LEAVE IT IN DRAFTS.
 *
 * The owner's decision, and the reason mail is the one thing the assistant never
 * does by itself: a draft is a sentence somebody can still change their mind
 * about. The answer carries the Gmail link so the person can open it where it
 * lives, and the id so "send it from kwapso" can send exactly that draft rather
 * than a second copy of it.
 *
 * Gated on `google:edit` only — nothing has left the building. */
export async function postGoogleMailDraft(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{
    to?: unknown
    subject?: unknown
    body?: unknown
    threadId?: unknown
  }>(request, env, "google", "edit")
  await refusePortalCaller(cfg, guard)
  const to = requireText(body.to, "To", TEXT_LIMITS.short)
  const subject = requireText(body.subject, "Subject", TEXT_LIMITS.short)
  const { token, connectionId } = await accessTokenFor(env, cfg, guard, "gmail")
  const draft = await gmailDraft(token, {
    to,
    subject,
    body: requireText(body.body, "Message", TEXT_LIMITS.long),
    threadId: optionalText(body.threadId, "Conversation", TEXT_LIMITS.short),
  })
  await recordGoogleAct(cfg, guard, actor, {
    connectionId,
    type: "Draft written",
    description: `${actor.name} had a reply to ${to} drafted, "${subject}"`,
  })
  await publishChange(env, guard.teamId, "google", connectionId)
  return json({ draft })
}

/**
 * POST /api/content/google/gmail/send — actually send it.
 *
 * TWO GATES, and the second one is the owner's switch: `google:edit` says you
 * may use your connection, `google_mail:create` says kwapso may send mail as
 * you. It is demanded here whoever pressed the button — the assistant, or the
 * person clicking "send it from kwapso" beside the draft link — because it is
 * the same act out of the same mailbox and a switch that only bound one of them
 * would be a switch that means nothing.
 *
 * `draftId` sends the draft that already exists; the three message fields send a
 * new message. Both are here rather than in two doors because the PERMISSION is
 * the thing this door is about, and splitting it would make the switch something
 * a future door could be written without.
 */
export async function postGoogleMailSend(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{
    draftId?: unknown
    to?: unknown
    subject?: unknown
    body?: unknown
    threadId?: unknown
  }>(request, env, "google", "edit")
  await refusePortalCaller(cfg, guard)
  await requireRight(cfg, guard, "google_mail", "create")
  const draftId = optionalText(body.draftId, "Draft", TEXT_LIMITS.short)
  const { token, connectionId } = await accessTokenFor(env, cfg, guard, "gmail")
  const to = optionalText(body.to, "To", TEXT_LIMITS.short)
  const sent = draftId
    ? await gmailSendDraft(token, draftId)
    : await gmailSend(token, {
        to: requireText(body.to, "To", TEXT_LIMITS.short),
        subject: requireText(body.subject, "Subject", TEXT_LIMITS.short),
        body: requireText(body.body, "Message", TEXT_LIMITS.long),
        threadId: optionalText(body.threadId, "Conversation", TEXT_LIMITS.short),
      })
  await recordGoogleAct(cfg, guard, actor, {
    connectionId,
    type: "Mail sent",
    description: `kwapso sent mail as ${actor.name}${to ? ` to ${to}` : ""}`,
  })
  await publishChange(env, guard.teamId, "google", connectionId)
  return json({ sent })
}

/**
 * POST /api/content/google/gmail/reply — answer inside the conversation.
 *
 * TWO GATES, the same two the send door has, and for the same reason: this
 * SENDS. A reply is not a softer act than a message — it is a message, in
 * somebody's inbox, with our name on it — so `google_mail:create` is demanded
 * here exactly as it is there, and the agent tool pauses for a yes/no panel.
 *
 * IT TAKES A MESSAGE AND A SENTENCE, and nothing else. Who it goes to, what it
 * is called and which conversation it belongs to are all written on the message
 * being answered (lib/google-api.ts gmailReply says how). Asking a caller for
 * those would be asking a caller to get them wrong, and the way they go wrong is
 * an answer that lands as a brand-new conversation — or in the wrong person's
 * inbox, because somebody pasted the To of the message they happened to be
 * looking at.
 *
 * The draft door beside it is still the normal way to answer mail. This is for
 * when a person has said, in as many words, send it.
 */
export async function postGoogleMailReply(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ messageId?: unknown; body?: unknown }>(
    request,
    env,
    "google",
    "edit"
  )
  await refusePortalCaller(cfg, guard)
  await requireRight(cfg, guard, "google_mail", "create")
  const { token, connectionId } = await accessTokenFor(env, cfg, guard, "gmail")
  const sent = await gmailReply(token, {
    messageId: requireText(body.messageId, "Message", TEXT_LIMITS.short),
    body: requireText(body.body, "Message", TEXT_LIMITS.long),
  })
  await recordGoogleAct(cfg, guard, actor, {
    connectionId,
    type: "Reply sent",
    description: `kwapso replied to ${sent.to} as ${actor.name}, "${sent.subject}"`,
  })
  await publishChange(env, guard.teamId, "google", connectionId)
  return json({ sent })
}

/**
 * POST /api/content/google/gmail/label — file a message under a label, or take
 * the label off.
 *
 * `label` is the NAME a person says ("Contracts"), never Gmail's own id, and the
 * match is case-insensitive — somebody who types "contracts" and gets a second
 * label beside their existing "Contracts" has been handed a filing system with
 * two drawers for one thing.
 *
 * ONE DOOR FOR BOTH DIRECTIONS, decided by `on`. Two doors would be two places
 * to get the label lookup right, and the asymmetry that matters is inside:
 * applying a label CREATES it when it is missing (that is what "file this under
 * Contracts" means to a person), and removing one never does — making a label in
 * order to take it off a message is a write nobody asked for.
 *
 * Gated on `google:edit` and NOT on the mail switch, which is a considered line
 * rather than an oversight: the owner's switch is about mail LEAVING the
 * building, and a label leaves nothing. Nobody else can see it. It is the same
 * reading that puts a Drive upload under `google:edit` — writing inside the
 * world this person connected.
 *
 * R17: a message that already carries the label (or already does not) moves
 * nothing, writes no history row and rings no bell.
 */
export async function postGoogleMailLabel(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{
    messageId?: unknown
    label?: unknown
    on?: unknown
  }>(request, env, "google", "edit")
  await refusePortalCaller(cfg, guard)
  const messageId = requireText(body.messageId, "Message", TEXT_LIMITS.short)
  const label = requireText(body.label, "Label", TEXT_LIMITS.short)
  if (typeof body.on !== "boolean")
    return fail(400, "invalid_input", "Say whether the label goes on or comes off.")
  const on = body.on
  const { token, connectionId } = await accessTokenFor(env, cfg, guard, "gmail")
  // Create it only when applying — see the doc comment above.
  const labelId = await gmailLabelId(token, label, on)
  // Nothing to take off: the label does not exist, so the message does not carry
  // it, so the answer the caller wanted is already true.
  if (!labelId) return json({ changed: false, label, on })
  const changed = (await gmailMessageLabelIds(token, messageId)).includes(labelId) !== on
  if (!changed) return json({ changed: false, label, on })
  await gmailLabelMessage(token, messageId, labelId, on)
  await recordGoogleAct(cfg, guard, actor, {
    connectionId,
    type: on ? "Message labelled" : "Label removed",
    description: `${actor.name} ${on ? "filed a message under" : "took a message out of"} "${label}"`,
  })
  await publishChange(env, guard.teamId, "google", connectionId)
  return json({ changed: true, label, on })
}

// ── CALENDAR ─────────────────────────────────────────────────────────────────

/** GET /api/content/google/calendar/events?from=&to= — my own diary, in a window. */
export async function getGoogleEvents(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "google", "read")
  await refusePortalCaller(cfg, guard)
  const url = new URL(request.url)
  const { token } = await accessTokenFor(env, cfg, guard, "calendar")
  const window = await calendarList(token, {
    from: queryText(url.searchParams.get("from"), "From", TEXT_LIMITS.short),
    to: queryText(url.searchParams.get("to"), "To", TEXT_LIMITS.short),
  })
  // `truncated` rides the answer rather than being swallowed: a window with more
  // entries than one read will walk is a HALF answer, and a caller told it was a
  // whole one plans a week around it.
  return json({ events: window.events, truncated: window.truncated })
}

/* THE CALENDAR IS READ-ONLY, AND THAT IS THE WHOLE OF IT.
 *
 * Six doors stood here — put an event in the diary, change what it says and
 * when, invite and uninvite guests, set where it is, call it off, and push a
 * sprint's dates in — plus the meeting push below them. Every one is gone, by
 * the owner's instruction on 18 August 2026: "disable the ability to create,
 * edit, or delete anything in the calendar from the frontend… scour through our
 * entire documentation and just make it one-way so we only grab and update the
 * information."
 *
 * WHAT THAT COSTS, SAID HONESTLY, because it is the reason to write this down
 * rather than to delete quietly: a meeting arranged in kwapso no longer appears
 * in anybody's Google Calendar, and a sprint's dates no longer become an all-day
 * block. The answer to both is to put it in Google, where it will be read back
 * here on the next sweep with its guests, its join link and its attachments —
 * which is the direction the whole module now runs in.
 *
 * THE REFUSAL IS STRUCTURAL, NOT A CONDITION. There is no flag here that turns
 * writing back on and no permission that grants it: lib/google-api.ts holds no
 * function that can send one, so the switch that used to guard these doors
 * (`google_events`, "Calendar on your behalf") was retired with them rather than
 * left on the Roles screen promising a capability nothing has. Same reasoning as
 * R24's — a condition can be inverted, a missing function cannot be forgotten.
 */

/**
 * GET /api/content/google/calendar/event/transcript?eventId= — what was SAID in
 * the meeting, reached from the meeting itself.
 *
 * THE JOIN THIS DOOR EXISTS TO MAKE. Google Meet files a transcript as an
 * ordinary Google Doc, named after the meeting, in the organiser's Drive — so
 * until now the only way to read one was to already know which document it was.
 * Nobody thinks that way. They think "what did we agree in Tuesday's call", and
 * Tuesday's call is a diary entry. This door starts where the person starts.
 *
 * THREE HUNTS, IN AN ORDER OF PROOF — the file Google itself attached to this
 * entry, then a document in a folder this person NAMED, then Google's own notice
 * in the mail naming the document it made. lib/google-transcript.ts holds them
 * and says why the order is what it is; `foundBy` comes back so that a person
 * asking "how do you know that is the transcript of THIS call" gets the honest
 * answer for whichever route found it — the first is a fact Google recorded, the
 * other two are matches.
 *
 * NONE OF THE THREE WIDENS A FENCE. The first reads an event this caller can
 * already read; the second searches only folders they named; the third reads
 * only mail from four Google robots about the caller's own files. A person who
 * has shared nothing gets an honest empty answer rather than kwapso going
 * looking through their whole Drive.
 */
export async function getGoogleEventTranscript(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "google", "read")
  await refusePortalCaller(cfg, guard)
  const eventId = queryText(new URL(request.url).searchParams.get("eventId"), "Event", TEXT_LIMITS.short)
  if (!eventId) return fail(400, "invalid_input", "Say which event.")
  const { token: calendarToken } = await accessTokenFor(env, cfg, guard, "calendar")
  const event = await calendarGet(calendarToken, eventId)

  const found = await findTranscript(env, cfg, guard, event)
  if (!found)
    return json({
      event,
      transcript: null,
      note: "No transcript for that meeting yet, not on the calendar entry, not in the folders you have shared, and not in any notice from Google.",
    })
  return json({
    event,
    transcript: {
      fileId: found.fileId,
      name: found.name,
      url: found.url,
      foundBy: found.foundBy,
      // The hunt read it — a candidate it could not read is not a transcript, so
      // this is never the empty string (lib/google-transcript.ts).
      text: found.text,
    },
  })
}

// ── GOOGLE CHAT ──────────────────────────────────────────────────────────────

/**
 * GET /api/content/google/chat/spaces — every space this person can see, and
 * which of them kwapso has been given.
 *
 * THE GAP THIS FILLS. Until now a space could only be read if you already knew
 * its id, which meant somebody had to have named it — so "which spaces are
 * there?" had no answer at all unless you were standing on the sharing form.
 * The picker beside it (`/google/pick`) answers a nearby question for that form,
 * gated on `google:create` and shaped as a list of options; this is the plain
 * READ, gated on `google:read`, and it carries the one thing the picker cannot:
 * whether each space is already shared, and under which row. That is the
 * difference between two doors and two answers to one question.
 *
 * Reading the LIST of spaces is not reading what is in them. The messages door
 * below still refuses any space this person has not named.
 */
export async function getGoogleChatSpaces(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "google", "read")
  await refusePortalCaller(cfg, guard)
  const { token } = await accessTokenFor(env, cfg, guard, "chat")
  const named = new Map(
    (await listNamedSources(cfg, guard, "chat")).map((s) => [s.externalId, s])
  )
  return json({
    spaces: (await chatSpaces(token)).map((s) => {
      const source = named.get(s.name)
      return {
        externalId: s.name,
        name: s.displayName,
        // Shared, and which row says so — so the caller can go straight to the
        // messages door without a second lookup, and can tell "I could share
        // this" from "I already have".
        sourceId: source?.id ?? null,
        shared: Boolean(source?.active),
      }
    }),
  })
}

/**
 * POST /api/content/google/chat/delete — take back something kwapso posted.
 *
 * NOT ONE OF THE ELEVEN, and here for the same reason the Drive bin is: posting
 * into a space colleagues read is the act in this module with no undo, and an
 * assistant that can post but not retract makes every wrong message permanent.
 *
 * `messageName` is Google's own full name (`spaces/AAA/messages/BBB`) and it
 * only ever comes back from posting in, or reading, a space this person named —
 * and the door re-checks the space anyway. Google refuses to delete a message
 * this app did not send, which is the second fence: kwapso can take back what
 * kwapso said and nothing else.
 */
export async function postGoogleChatDelete(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ sourceId?: unknown; messageName?: unknown }>(
    request,
    env,
    "google",
    "delete"
  )
  await refusePortalCaller(cfg, guard)
  const source = await ownSourceOrThrow(cfg, guard, requireText(body.sourceId, "Space", TEXT_LIMITS.short))
  if (source.service !== "chat") return fail(400, "invalid_input", "That isn't a Chat space.")
  const messageName = requireText(body.messageName, "Message", TEXT_LIMITS.short)
  if (!messageName.startsWith(`${source.externalId}/messages/`))
    return fail(400, "invalid_input", "That message isn't in that space.")
  const { token, connectionId } = await accessTokenFor(env, cfg, guard, "chat")
  await chatDelete(token, messageName)
  await recordGoogleAct(cfg, guard, actor, {
    connectionId,
    type: "Message taken back",
    description: `${actor.name} took a message back out of "${source.name}"`,
  })
  await publishChange(env, guard.teamId, "google", connectionId)
  return json({ removed: true })
}

/** GET /api/content/google/chat/messages?sourceId= — one NAMED space's messages.
 * `sourceId` is one of the caller's own rows, so a space they never named cannot
 * be spelled here at all. */
export async function getGoogleChat(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "google", "read")
  await refusePortalCaller(cfg, guard)
  const sourceId = queryText(new URL(request.url).searchParams.get("sourceId"), "Space", TEXT_LIMITS.short)
  if (!sourceId) return fail(400, "invalid_input", "Say which space.")
  const source = await ownSourceOrThrow(cfg, guard, sourceId)
  if (source.service !== "chat") return fail(400, "invalid_input", "That isn't a Chat space.")
  const { token } = await accessTokenFor(env, cfg, guard, "chat")
  return json({ messages: await chatMessages(token, source.externalId), space: source.name })
}

/** POST /api/content/google/chat/messages — post in a space I named.
 *
 * Under `google:edit` rather than a switch of its own: the owner named TWO extra
 * switches (mail and events) and a third would be re-deciding something already
 * settled. The reasoning that makes it fit: a space is one this person chose and
 * named themselves, so posting in it is writing inside the world they connected
 * — the same shape as putting a file in a folder they named. */
export async function postGoogleChat(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ sourceId?: unknown; text?: unknown }>(
    request,
    env,
    "google",
    "edit"
  )
  await refusePortalCaller(cfg, guard)
  const source = await ownSourceOrThrow(cfg, guard, requireText(body.sourceId, "Space", TEXT_LIMITS.short))
  if (source.service !== "chat") return fail(400, "invalid_input", "That isn't a Chat space.")
  const { token, connectionId } = await accessTokenFor(env, cfg, guard, "chat")
  const message = await chatPost(token, source.externalId, requireText(body.text, "Message", TEXT_LIMITS.long))
  await recordGoogleAct(cfg, guard, actor, {
    connectionId,
    type: "Posted in a space",
    description: `kwapso posted in "${source.name}" as ${actor.name}`,
  })
  await publishChange(env, guard.teamId, "google", connectionId)
  return json({ message })
}
