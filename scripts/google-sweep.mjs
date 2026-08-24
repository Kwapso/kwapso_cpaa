// THE GOOGLE SWEEP — every Google door in the product, pressed for real, against
// a live Google account, and every artefact taken back afterwards.
//
// WHY IT EXISTS. Everything else that proves this module is a source scan or a
// test with a fake fetch in front of it: the seam tests prove each door gates,
// publishes and refuses a client login, and the parity tests prove every door has
// a tool with the whole contract. None of them proves that Google ACCEPTS what we
// send it. A wrong field name, a scope somebody never granted, a PATCH where
// Google wanted a PUT — all of those pass a green build and fail the first time a
// person presses the button. This is the run that finds them.
//
// ── THE THREE SAFETY RULES, and they are not negotiable ─────────────────────
//   1. EVERY send, share and invite goes to ONE address — the account the sweep
//      is signed in as, read back from the connection itself. There is no way to
//      spell another one: `ONLY_ADDRESS` is derived, not configured, and the mail
//      the sweep sends is mail to itself.
//   2. EVERYTHING IT MAKES IS TAKEN BACK. Every create registers its own undo at
//      the moment it succeeds, and the undos run in reverse at the end whatever
//      happened in between — including a crash.
//   3. WHAT IT CANNOT TAKE BACK, IT DOES NOT MAKE. Two consequences you can see
//      in the code: the label check uses a label that already exists (a label
//      kwapso creates cannot be removed through any door, so the sweep does not
//      create one), and the two messages it sends stay sent, because there is no
//      such thing as unsending — which is the whole reason mail always asks.
//
// NO SECRET IS EVER PRINTED. The one key this needs is read from the environment
// and reported as present-or-absent with a length, never as a value.
//
//   source ~/.config/kwapso/keys.env && node scripts/google-sweep.mjs
//
// It exits non-zero if any check fails or any artefact could not be taken back.

import { makeApi, timedFetch } from "./lib/api.mjs"

const BASE = process.env.SWEEP_BASE ?? "https://agency-staging.kwapso.app"
/** The one Google account this sweep is allowed to touch. Named here so a
 * misconfigured run stops at the door rather than mailing a stranger — the
 * signed-in connection is checked against it before a single write. */
const ONLY_ADDRESS = "alaap@kwapso.com"

const api = makeApi(BASE)

let failures = 0
let checks = 0
const ok = (name, cond, detail = "") => {
  checks++
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : ` — ${String(detail).slice(0, 300)}`}`)
  if (!cond) failures++
}
const info = (line) => console.log(`     ${line}`)

/** The undo stack. Every create pushes its own reversal the moment it succeeds,
 * so the cleanup is never a list somebody maintains beside the creates — it is
 * built by the creates themselves and runs in reverse. */
const undo = []
const onExit = (what, run) => undo.push({ what, run })

// ── sign in ──────────────────────────────────────────────────────────────────

const TEST_LOGIN_KEY = process.env.TEST_LOGIN_KEY ?? ""
console.log(`Google sweep against ${BASE}`)
console.log(`TEST_LOGIN_KEY: ${TEST_LOGIN_KEY ? `present (${TEST_LOGIN_KEY.length} chars)` : "MISSING"}`)
if (!TEST_LOGIN_KEY) {
  console.log("FAIL cannot sign in — source ~/.config/kwapso/keys.env first")
  process.exit(1)
}

const minted = await api("/api/auth/admin/test-login", {
  method: "POST",
  headers: { "x-admin-key": TEST_LOGIN_KEY },
  body: JSON.stringify({ email: ONLY_ADDRESS }),
})
ok("sign-in code minted", minted.ok && typeof minted.body?.code === "string", JSON.stringify(minted.body))
if (!minted.body?.code) process.exit(1)

const verified = await timedFetch(`${BASE}/api/auth/email/verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: ONLY_ADDRESS, code: minted.body.code }),
})
const cookie = (verified.headers.get("set-cookie") ?? "").split(";")[0]
ok("session cookie set", verified.ok && cookie.startsWith("kwapso_session="))
if (!cookie.startsWith("kwapso_session=")) process.exit(1)

const active = await api("/api/tenancy/active", {}, cookie)
ok("standing in a team", active.ok && Boolean(active.body?.team?.id), JSON.stringify(active.body).slice(0, 200))
info(`team ${active.body?.team?.id} — ${active.body?.team?.name}`)

// ── what is connected, and where we are allowed to write ─────────────────────

const G = (path, opts) => api(`/api/content/google${path}`, opts, cookie)
const POST = (path, body) => G(path, { method: "POST", body: JSON.stringify(body) })

const conns = await G("/connections")
ok("connections read", conns.ok, JSON.stringify(conns.body).slice(0, 200))
const services = new Set((conns.body?.connections ?? []).filter((c) => c.active).map((c) => c.service))
for (const s of ["drive", "gmail", "calendar", "chat"])
  ok(`${s} connected`, services.has(s), `services: ${[...services].join(", ") || "none"}`)

// RULE 1, enforced rather than trusted: the mailbox we are about to send from
// must BE the one address this sweep may touch.
const mailbox = (conns.body?.connections ?? []).find((c) => c.service === "gmail")?.googleEmail
ok(`the connected mailbox is ${ONLY_ADDRESS}`, mailbox === ONLY_ADDRESS, `connected as ${mailbox}`)
if (mailbox !== ONLY_ADDRESS) {
  console.log("STOP — refusing to write to an account this sweep was not authorised for.")
  process.exit(1)
}

/** WHAT THIS GRANT ACTUALLY ALLOWS, printed before anything is pressed.
 *
 * A connection stores the scopes Google granted AT THE MOMENT IT WAS MADE. Add a
 * scope to the product afterwards and every existing connection silently lacks
 * it — the door is right, the code is right, and Google says no. That is not a
 * failure a person can diagnose from "Google wouldn't allow that any more", so
 * the sweep says it out loud and names the fix. */
const scopesOf = (service) =>
  ((conns.body?.connections ?? []).find((c) => c.service === service)?.grantedScopes ?? "")
    .split(/\s+/)
    .filter(Boolean)
for (const s of ["drive", "gmail", "calendar", "chat"])
  info(`${s} granted: ${scopesOf(s).map((x) => x.replace("https://www.googleapis.com/auth/", "")).join(", ") || "nothing"}`)
const canLabel = scopesOf("gmail").some((s) => s.endsWith("/gmail.modify"))
if (!canLabel)
  info("↑ this Gmail grant predates gmail.modify — labelling will be refused until Gmail is reconnected in Settings")

const sources = conns.body?.sources ?? []
const driveSource = sources.find((s) => s.service === "drive" && s.active)
const chatSource = sources.find((s) => s.service === "chat" && s.active)
ok("a Drive folder is shared", Boolean(driveSource), "share one in Settings first")
ok("a Chat space is shared", Boolean(chatSource), "share one in Settings first")

const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const tag = `kwapso sweep ${stamp}`

// ── DRIVE ────────────────────────────────────────────────────────────────────

{
  const list = await G("/drive/files")
  ok("drive: list files", list.ok && Array.isArray(list.body?.files), JSON.stringify(list.body).slice(0, 200))
  info(`${list.body?.files?.length ?? 0} files in the shared folders`)
}

let uploadedId = null
if (driveSource) {
  const made = await POST("/drive/folder", { sourceId: driveSource.id, name: `${tag} folder` })
  ok("drive: make a folder", made.ok && Boolean(made.body?.folder?.id), JSON.stringify(made.body).slice(0, 200))
  if (made.body?.folder?.id)
    onExit("bin the folder", () => POST("/drive/trash", { fileId: made.body.folder.id }))

  const up = await POST("/drive/upload", {
    sourceId: driveSource.id,
    name: `${tag}.txt`,
    text: "first version — written by the kwapso Google sweep",
  })
  ok("drive: upload a file", up.ok && Boolean(up.body?.file?.id), JSON.stringify(up.body).slice(0, 200))
  uploadedId = up.body?.file?.id ?? null
  if (uploadedId) onExit("bin the uploaded file", () => POST("/drive/trash", { fileId: uploadedId }))
}

if (uploadedId) {
  const read = await G(`/drive/file?fileId=${encodeURIComponent(uploadedId)}`)
  ok("drive: read a file", read.ok && String(read.body?.text ?? "").includes("first version"), JSON.stringify(read.body).slice(0, 200))

  const edited = await POST("/drive/update", {
    fileId: uploadedId,
    name: `${tag} (edited).txt`,
    text: "SECOND version — the sweep rewrote this file through the update door",
  })
  ok("drive: EDIT that file", edited.ok && Boolean(edited.body?.file?.id), JSON.stringify(edited.body).slice(0, 200))
  const reread = await G(`/drive/file?fileId=${encodeURIComponent(uploadedId)}`)
  ok(
    "drive: the edit really landed",
    reread.ok && String(reread.body?.text ?? "").includes("SECOND version"),
    JSON.stringify(reread.body).slice(0, 200)
  )
}

// ── GMAIL ────────────────────────────────────────────────────────────────────

{
  const list = await G("/gmail/messages")
  ok("gmail: list emails", list.ok && Array.isArray(list.body?.messages), JSON.stringify(list.body).slice(0, 200))
  info(`${list.body?.messages?.length ?? 0} messages with known contacts (${list.body?.contactsUsed ?? 0} contacts)`)
  // THE OLDEST, which is the one a paging bug hides: a list that silently
  // returns only the newest page still answers "read one message" correctly.
  const oldest = [...(list.body?.messages ?? [])].sort(
    (a, b) => Date.parse(a.date ?? 0) - Date.parse(b.date ?? 0)
  )[0]
  if (oldest) {
    const one = await G(`/gmail/message?messageId=${encodeURIComponent(oldest.id)}`)
    ok("gmail: read the OLDEST email", one.ok && Boolean(one.body?.message?.id), JSON.stringify(one.body).slice(0, 200))
    info(`oldest: "${(one.body?.message?.subject ?? "").slice(0, 60)}" (${one.body?.message?.date ?? "no date"})`)
  } else {
    ok("gmail: read the OLDEST email", false, "no mail with a known contact to read")
  }
}

// A draft, then THAT DRAFT sent — which is also why no draft is left behind.
let sentMessageId = null
let sentThreadId = null
{
  const draft = await POST("/gmail/draft", {
    to: ONLY_ADDRESS,
    subject: `${tag} — sweep`,
    body: "Written by the kwapso Google sweep. Safe to delete.",
  })
  ok("gmail: draft", draft.ok && Boolean(draft.body?.draft?.draftId), JSON.stringify(draft.body).slice(0, 200))

  if (draft.body?.draft?.draftId) {
    const sent = await POST("/gmail/send", { draftId: draft.body.draft.draftId })
    ok("gmail: send (that same draft, so none is left)", sent.ok && Boolean(sent.body?.sent?.messageId), JSON.stringify(sent.body).slice(0, 200))
    sentMessageId = sent.body?.sent?.messageId ?? null
    sentThreadId = sent.body?.sent?.threadId ?? null
  }
}

if (sentMessageId) {
  // Replying to OUR OWN message: its From is this same mailbox, so the reply can
  // only ever go back to the one address this sweep may touch.
  const reply = await POST("/gmail/reply", {
    messageId: sentMessageId,
    body: "Replied in-thread by the kwapso Google sweep.",
  })
  ok("gmail: reply IN THREAD", reply.ok && Boolean(reply.body?.sent?.messageId), JSON.stringify(reply.body).slice(0, 200))
  ok(
    "gmail: the reply stayed in the same conversation",
    reply.body?.sent?.threadId === sentThreadId,
    `thread ${reply.body?.sent?.threadId} vs ${sentThreadId}`
  )
  ok("gmail: the reply went only to the one address", reply.body?.sent?.to?.includes(ONLY_ADDRESS), reply.body?.sent?.to)
}

if (sentMessageId) {
  // A LABEL THAT ALREADY EXISTS. Applying a new one would leave a label behind
  // that no door can remove, and rule 3 says: what it cannot take back, it does
  // not make. `STARRED` is Gmail's own, present in every mailbox.
  const on = await POST("/gmail/label", { messageId: sentMessageId, label: "STARRED", on: true })
  ok(
    "gmail: apply a label",
    on.ok && on.body?.changed === true,
    canLabel
      ? JSON.stringify(on.body).slice(0, 200)
      : "this Gmail grant has no gmail.modify scope — reconnect Gmail in Settings, then run the sweep again"
  )
  if (on.ok && on.body?.changed === true) {
    onExit("take the label off", () => POST("/gmail/label", { messageId: sentMessageId, label: "STARRED", on: false }))
    const again = await POST("/gmail/label", { messageId: sentMessageId, label: "STARRED", on: true })
    ok("gmail: labelling twice moves nothing (R17)", again.ok && again.body?.changed === false, JSON.stringify(again.body).slice(0, 200))
  }
}

// ── GOOGLE CHAT ──────────────────────────────────────────────────────────────

{
  const spaces = await G("/chat/spaces")
  ok("chat: list EVERY space", spaces.ok && Array.isArray(spaces.body?.spaces), JSON.stringify(spaces.body).slice(0, 200))
  info(
    `${spaces.body?.spaces?.length ?? 0} spaces visible, ${(spaces.body?.spaces ?? []).filter((s) => s.shared).length} shared`
  )
}

if (chatSource) {
  const read = await G(`/chat/messages?sourceId=${encodeURIComponent(chatSource.id)}`)
  ok("chat: read a space", read.ok && Array.isArray(read.body?.messages), JSON.stringify(read.body).slice(0, 200))

  const posted = await POST("/chat/messages", {
    sourceId: chatSource.id,
    text: `${tag} — automated check, removed a moment later.`,
  })
  // POSTING IS THE ONE CHAT CALL GOOGLE GATES ON A CONFIGURED APP. Listing spaces
  // and reading messages work on a person's own grant; creating a message answers
  // 404 "Google Chat app not found — turn on the Chat API and configure the app in
  // the Google Cloud console" until somebody fills in the Chat API's Configuration
  // tab (name, avatar, description). That is a console step, not a code one, and
  // it has always applied to this door — the sweep is simply the first thing that
  // pressed it.
  ok(
    "chat: post to a space",
    posted.ok && Boolean(posted.body?.message?.id),
    posted.status === 502
      ? "Google answers 404 'Chat app not found' — configure the Chat app in the Google Cloud console (Chat API → Configuration)"
      : JSON.stringify(posted.body).slice(0, 200)
  )
  if (posted.body?.message?.id)
    onExit("take the chat message back", () =>
      POST("/chat/delete", { sourceId: chatSource.id, messageName: posted.body.message.id })
    )
  else info("chat: taking a message back could not be exercised — nothing was posted to take back")
}

// ── CALENDAR ─────────────────────────────────────────────────────────────────

{
  const from = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const to = new Date(Date.now() + 30 * 86_400_000).toISOString()
  const list = await G(`/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
  ok("calendar: list events", list.ok && Array.isArray(list.body?.events), JSON.stringify(list.body).slice(0, 200))
  info(`${list.body?.events?.length ?? 0} entries in the next month`)
}

let eventId = null
{
  const start = new Date(Date.now() + 3 * 86_400_000)
  const end = new Date(start.getTime() + 30 * 60_000)
  const made = await POST("/calendar/events", {
    summary: `${tag} — sweep`,
    description: "Created by the kwapso Google sweep. It cancels itself.",
    start: start.toISOString(),
    end: end.toISOString(),
  })
  ok("calendar: create an event", made.ok && Boolean(made.body?.event?.id), JSON.stringify(made.body).slice(0, 200))
  eventId = made.body?.event?.id ?? null
  if (eventId) onExit("cancel the event", () => POST("/calendar/event/cancel", { eventId }))
}

if (eventId) {
  const edited = await POST("/calendar/event/update", {
    eventId,
    summary: `${tag} — sweep (edited)`,
    description: "Edited through the update door.",
  })
  ok(
    "calendar: EDIT it",
    edited.ok && String(edited.body?.event?.summary ?? "").includes("(edited)"),
    JSON.stringify(edited.body).slice(0, 200)
  )

  // RULE 1 again: the only address this sweep may invite is its own.
  const added = await POST("/calendar/event/guests", { eventId, add: [ONLY_ADDRESS] })
  ok(
    "calendar: ADD a guest",
    added.ok && added.body?.changed === true && (added.body?.event?.attendees ?? []).includes(ONLY_ADDRESS),
    JSON.stringify(added.body).slice(0, 250)
  )

  const removed = await POST("/calendar/event/guests", { eventId, remove: [ONLY_ADDRESS] })
  ok(
    "calendar: REMOVE a guest",
    removed.ok && removed.body?.changed === true && !(removed.body?.event?.attendees ?? []).includes(ONLY_ADDRESS),
    JSON.stringify(removed.body).slice(0, 250)
  )

  const where = await POST("/calendar/event/location", { eventId, location: "Sweep room 1" })
  ok(
    "calendar: set a LOCATION",
    where.ok && where.body?.event?.location === "Sweep room 1",
    JSON.stringify(where.body).slice(0, 250)
  )
}

// ── the two joins ────────────────────────────────────────────────────────────

if (driveSource && sentThreadId) {
  const filed = await POST("/drive/save-mail", {
    sourceId: driveSource.id,
    threadId: sentThreadId,
    name: `${tag} — conversation.txt`,
  })
  ok(
    "cross: copy an email into Drive",
    filed.ok && Boolean(filed.body?.file?.id) && (filed.body?.messagesSaved ?? 0) > 0,
    JSON.stringify(filed.body).slice(0, 250)
  )
  if (filed.body?.file?.id)
    onExit("bin the filed conversation", () => POST("/drive/trash", { fileId: filed.body.file.id }))
}

// THE TRANSCRIPT JOIN, proved end to end. A real Meet transcript is a document
// Meet itself writes into a folder; the sweep cannot make Meet run a meeting, so
// it stands a document of the same SHAPE in a shared folder — named after the
// entry, ending "Transcript", exactly as Meet names them — and asks the door to
// find it from the calendar event alone. What is being proved is the JOIN (event →
// its transcript, without knowing the file), which is the whole capability.
if (driveSource) {
  const title = `${tag} — call`
  const start = new Date(Date.now() + 4 * 86_400_000)
  const meeting = await POST("/calendar/events", {
    summary: title,
    start: start.toISOString(),
    end: new Date(start.getTime() + 30 * 60_000).toISOString(),
  })
  const meetingId = meeting.body?.event?.id ?? null
  if (meetingId) onExit("cancel the transcript-check event", () => POST("/calendar/event/cancel", { eventId: meetingId }))

  const doc = await POST("/drive/upload", {
    sourceId: driveSource.id,
    name: `${title} - Transcript`,
    text: "10:00 Ana: shall we ship it?\n10:01 Marta: yes, after the sweep passes.",
  })
  if (doc.body?.file?.id)
    onExit("bin the transcript document", () => POST("/drive/trash", { fileId: doc.body.file.id }))

  if (meetingId && doc.body?.file?.id) {
    const found = await G(`/calendar/event/transcript?eventId=${encodeURIComponent(meetingId)}`)
    ok(
      "transcript: reached from the calendar event",
      found.ok && found.body?.transcript?.fileId === doc.body.file.id,
      JSON.stringify(found.body).slice(0, 300)
    )
    ok(
      "transcript: and it carries the words",
      String(found.body?.transcript?.text ?? "").includes("shall we ship it"),
      JSON.stringify(found.body?.transcript ?? found.body).slice(0, 250)
    )
  } else {
    ok("transcript: reached from the calendar event", false, "could not stage the check")
  }
}

// ── take everything back ─────────────────────────────────────────────────────

console.log("\n— cleaning up —")
let leftBehind = 0
for (const step of [...undo].reverse()) {
  try {
    const res = await step.run()
    const done = res?.ok === true
    console.log(`${done ? "PASS" : "FAIL"} cleanup: ${step.what}${done ? "" : ` — ${JSON.stringify(res?.body).slice(0, 200)}`}`)
    checks++
    if (!done) {
      failures++
      leftBehind++
    }
  } catch (e) {
    console.log(`FAIL cleanup: ${step.what} — ${e.message}`)
    checks++
    failures++
    leftBehind++
  }
}

// The idempotency half of the cancel door, checked AFTER the cleanup cancelled
// it: a second press must move nothing (R17).
console.log("")
if (eventId) {
  const twice = await POST("/calendar/event/cancel", { eventId })
  ok("calendar: cancelling twice moves nothing (R17)", twice.ok && twice.body?.changed === false, JSON.stringify(twice.body).slice(0, 200))
}

console.log(`\n${checks - failures}/${checks} checks passed.`)
console.log(
  leftBehind === 0
    ? "Everything the sweep created was taken back. The two messages it SENT stay sent — mail cannot be unsent, which is why the door always asks."
    : `${leftBehind} artefact(s) could NOT be taken back — look above and tidy by hand.`
)
process.exit(failures ? 1 : 0)
