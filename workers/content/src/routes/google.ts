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
// THE THREE SWITCHES, and which door each one guards:
//   • google:create      — may connect a Google account (and name a folder/space);
//   • google_mail:create — kwapso may SEND mail as you;
//   • google_events:create — kwapso may put an EVENT in your calendar.
// The last two are demanded ON TOP of `google:edit`, so a role that can send but
// cannot otherwise use the connection is not a state anybody can reach. And they
// are demanded of the PERSON pressing "send it from kwapso" exactly as they are
// of the assistant: it is the same act, by the same product, out of the same
// mailbox, so it is the same permission.

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
  calendarCreate,
  calendarList,
  chatMessages,
  chatPost,
  chatSpaces,
  driveFileText,
  driveFolders,
  driveList,
  driveUpload,
  gmailDraft,
  gmailMessage,
  gmailSearch,
  gmailSend,
  gmailSendDraft,
  knownContactQuery,
} from "../lib/google-api"
import { knownContactEmails } from "../lib/google-read"
import { getSprint } from "../lib/stories"
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

/** GET /api/content/google/pick?service=drive&q= — the folders or spaces this
 * person could name. A read, and the only way to learn an id worth naming:
 * everything it returns is something the CALLER's own account can already see. */
export async function getGooglePick(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "google", "create")
  await refusePortalCaller(cfg, guard)
  const url = new URL(request.url)
  const service = asNamedService(queryText(url.searchParams.get("service"), "Service"))
  const q = queryText(url.searchParams.get("q"), "Search", TEXT_LIMITS.short)
  const { token } = await accessTokenFor(env, cfg, guard, service)
  const options =
    service === "drive"
      ? (await driveFolders(token, q)).map((f) => ({ externalId: f.id, name: f.name }))
      : (await chatSpaces(token)).map((s) => ({ externalId: s.name, name: s.displayName }))
  return json({ options })
}

/** POST /api/content/google/sources — name a Drive folder or a Chat space.
 *
 * `shelf` is required in spirit and defaulted to `private` in code: the safe
 * answer is the one you get by not deciding. The screen asks the question in
 * words at the moment of sharing ("who will be able to read this?"), because a
 * person who thinks a folder is theirs alone and finds a colleague quoting it
 * back is the failure this whole column exists to prevent. */
export async function postGoogleSource(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{
    service?: unknown
    externalId?: unknown
    name?: unknown
    shelf?: unknown
  }>(request, env, "google", "create")
  await refusePortalCaller(cfg, guard)
  const id = await addNamedSource(cfg, guard, actor, {
    // Through the text seam, then the module's own allow-list — see the note on
    // the disconnect door for why the order is not optional (R20 is positional).
    service: asNamedService(requireText(body.service, "Service", TEXT_LIMITS.short)),
    externalId: requireText(body.externalId, "Folder or space", TEXT_LIMITS.short),
    name: requireText(body.name, "Name", TEXT_LIMITS.short),
    shelf: asShelf(optionalText(body.shelf, "Shelf", TEXT_LIMITS.short)),
  })
  await publishChange(env, guard.teamId, "google", id)
  return json({ sources: await listNamedSources(cfg, guard) })
}

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

/** GET /api/content/google/drive/files?q= — files in the folders I named, and
 * nowhere else. A person with no named folders gets an empty list, which is the
 * honest answer: they have shared nothing. */
export async function getGoogleDriveFiles(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "google", "read")
  await refusePortalCaller(cfg, guard)
  const q = queryText(new URL(request.url).searchParams.get("q"), "Search", TEXT_LIMITS.short)
  const { token } = await accessTokenFor(env, cfg, guard, "drive")
  const folders = (await listNamedSources(cfg, guard, "drive")).filter((s) => s.active)
  return json({ files: await driveList(token, folders.map((f) => f.externalId), q) })
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
    description: `${actor.name} had a reply to ${to} drafted — "${subject}"`,
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

// ── CALENDAR ─────────────────────────────────────────────────────────────────

/** GET /api/content/google/calendar/events?from=&to= — my own diary, in a window. */
export async function getGoogleEvents(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "google", "read")
  await refusePortalCaller(cfg, guard)
  const url = new URL(request.url)
  const { token } = await accessTokenFor(env, cfg, guard, "calendar")
  return json({
    events: await calendarList(token, {
      from: queryText(url.searchParams.get("from"), "From", TEXT_LIMITS.short),
      to: queryText(url.searchParams.get("to"), "To", TEXT_LIMITS.short),
    }),
  })
}

/** POST /api/content/google/calendar/events — put something in my calendar.
 *
 * The owner's second switch (`google_events:create`), and the asymmetry with
 * mail is deliberate and theirs: the assistant may create events WITHOUT asking,
 * mail ALWAYS asks. An event is a suggestion in a diary somebody owns and can
 * delete in one click; a sent mail is in somebody else's inbox forever. The
 * agent tool for this one therefore carries no confirm panel, and the mail tools
 * carry one — see workers/data-ops/src/lib/tools.ts. */
export async function postGoogleEvent(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{
    summary?: unknown
    description?: unknown
    start?: unknown
    end?: unknown
    allDay?: unknown
  }>(request, env, "google", "edit")
  await refusePortalCaller(cfg, guard)
  await requireRight(cfg, guard, "google_events", "create")
  const summary = requireText(body.summary, "Title", TEXT_LIMITS.short)
  const { token, connectionId } = await accessTokenFor(env, cfg, guard, "calendar")
  const event = await calendarCreate(token, {
    summary,
    description: optionalText(body.description, "Details", TEXT_LIMITS.long),
    start: requireText(body.start, "Start", TEXT_LIMITS.short),
    end: requireText(body.end, "End", TEXT_LIMITS.short),
    allDay: body.allDay === true,
  })
  await recordGoogleAct(cfg, guard, actor, {
    connectionId,
    type: "Event created",
    description: `kwapso put "${summary}" in ${actor.name}'s calendar`,
  })
  await publishChange(env, guard.teamId, "google", connectionId)
  return json({ event })
}

/**
 * POST /api/content/google/calendar/sprint — a sprint's dates, in my calendar.
 *
 * FROM kwapso TO GOOGLE, the first of the two the owner named. A sprint is a
 * block of sold work with a start and an end, so it becomes an ALL-DAY entry
 * spanning them — a sprint does not begin at 09:00, and inventing a time would
 * be inventing a fact.
 *
 * THE SECOND ONE IS NOT BUILT, and it is not built because it has nothing to
 * push: "meetings booked in kwapso appearing in Calendar" needs a MEETING, and
 * the app has no meetings table — only `meeting_purposes`, which is a taxonomy
 * of WHY we meet, with no date, no attendee and no duration on it. When a
 * meetings module lands, it becomes a second door beside this one and reuses
 * everything below the first line.
 *
 * THREE GATES: `work:read` (you may not push a sprint you cannot see),
 * `google:edit`, and the events switch. */
export async function postGoogleSprintEvent(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ sprintId?: unknown }>(
    request,
    env,
    "work",
    "read"
  )
  await refusePortalCaller(cfg, guard)
  await requireRight(cfg, guard, "google", "edit")
  await requireRight(cfg, guard, "google_events", "create")
  const sprint = await getSprint(cfg, guard, requireText(body.sprintId, "Sprint", TEXT_LIMITS.short))
  if (!sprint) return fail(404, "sprint_not_found", "That sprint doesn't exist.")
  if (!sprint.startsOn || !sprint.endsOn)
    return fail(409, "sprint_undated", "That sprint has no start and end date yet.")
  const { token, connectionId } = await accessTokenFor(env, cfg, guard, "calendar")
  const event = await calendarCreate(token, {
    summary: `${sprint.ref ? `${sprint.ref} · ` : ""}${sprint.name}`,
    description: [sprint.goal, sprint.accountName].filter(Boolean).join(" — "),
    start: sprint.startsOn,
    // Google's all-day END is EXCLUSIVE: an entry ending on the 14th shows up to
    // the 13th. So the last day of the sprint has to be its end date plus one, or
    // every sprint in the calendar is a day short of what was sold.
    end: dayAfter(sprint.endsOn),
    allDay: true,
  })
  await recordGoogleAct(cfg, guard, actor, {
    connectionId,
    type: "Sprint added to calendar",
    description: `kwapso put the "${sprint.name}" sprint in ${actor.name}'s calendar`,
  })
  await publishChange(env, guard.teamId, "google", connectionId)
  return json({ event })
}

/** YYYY-MM-DD, one day later — see the exclusive-end note above. */
function dayAfter(date: string): string {
  const at = Date.parse(`${date.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(at)) throw new GuardError(400, "invalid_input", "That sprint's dates aren't readable.")
  return new Date(at + 86_400_000).toISOString().slice(0, 10)
}

// ── GOOGLE CHAT ──────────────────────────────────────────────────────────────

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
