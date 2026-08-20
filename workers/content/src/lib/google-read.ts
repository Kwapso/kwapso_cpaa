// THE SEAM — one function that hands back what a person's Google connections
// can see, in one shape, with the shelf carried on every item.
//
// ══════════════════════════════════════════════════════════════════════════════
// WHERE THE RETRIEVAL LANE PLUGS IN
//
// This build's job ends at "the connection exists, is scoped, is permissioned,
// and can read and write". Making Google material ANSWERABLE — chunking it,
// embedding it, keeping it in step — belongs to the knowledge base, and that is
// a different lane's work. The join is here:
//
//   workers/content/src/lib/knowledge-ingest.ts owns the sweep. It walks a list
//   of KINDS (a ticket, an account, an article), reads a bounded slice of each
//   per tick from a cursor, and writes `knowledge_sources` rows. A Google kind is
//   one more entry in that list, and `readGoogleMaterial` below is the read it
//   should call — it already returns the four fields that ingest wants
//   (`title`, `text`, `url`, `updatedAt`) plus the two it MUST respect:
//
//     • `shelf`       — 'private' means this material may only ever answer its
//                       OWNER's question. A source indexed without that
//                       distinction is the failure the design round named
//                       exactly: a colleague asking about a document in YOUR
//                       Drive should be answered "only if you filed it as team
//                       material". Ingest must carry it onto the source row and
//                       the compartment logic must honour it.
//     • `ownerUserId` — whose connection it came through. `private` is
//                       meaningless without it.
//
//   And one thing that lane must NOT do: call this on a schedule with a
//   fabricated guard. Everything here is read with ONE PERSON'S OWN TOKEN, so a
//   sweep has to run per connected person, as that person, or not at all. The
//   knowledge cron's existing guard is deliberately a user id no row can hold
//   (see index.ts) — that guard resolves no connection here, which is the right
//   failure: nothing, rather than somebody's mail under a system account.
// ══════════════════════════════════════════════════════════════════════════════

import { d1Query, type D1Rest } from "@shared/workers/d1-rest"
import { LIST_HARD_CAP } from "@shared/workers/limits"
import { type MemberGuard } from "@shared/workers/gating"
import type { GoogleItem, GoogleService } from "@shared/types"
import type { ChatMessage } from "./google-api"
import {
  chatMessages,
  driveFileText,
  driveFilesById,
  driveList,
  calendarList,
  gmailMessage,
  gmailSearch,
  GMAIL_CONTACT_CAP,
} from "./google-api"
import {
  accessTokenFor,
  knownChatPeople,
  listNamedSources,
  rememberChatPeople,
  type GoogleEnv,
} from "./google"

/** Contact addresses one lookup will read. R14's spirit on the other axis: the
 * accounts table is a GROWING collection, so the read that feeds a Gmail query
 * is bounded here as well as capped inside the query builder — two ceilings
 * because they guard two different things (a database read, and a query string
 * Google will refuse if it is too long). */
const CONTACT_READ_CAP = 500

/**
 * THE KNOWN CONTACTS — every email address on one of the team's accounts.
 *
 * This is the entire definition of "a known contact" (the owner's rule: mail is
 * read only when it is to or from one). It reads the customer spine's own table,
 * which is the whole point — a contact becomes known by being added to an
 * account, not by anybody maintaining a second list here that would drift.
 *
 * Deactivated accounts are included on purpose: a past client's mail is still
 * mail with a known contact, and dropping them would make old threads vanish
 * from an assistant's sight the day somebody tidies up the accounts list.
 */
export async function knownContactEmails(cfg: D1Rest, guard: MemberGuard): Promise<string[]> {
  return (await knownContacts(cfg, guard)).map((c) => c.email)
}

/** A known contact, and WHOSE material a conversation with them is.
 *
 * `accountId` is the contact's PARENT where there is one, and the contact's own
 * row where there is not. That is the whole rule, and it is the difference
 * between a compartment that answers and one that does not: mail with Marta —
 * a person account sitting under Bergman — is BERGMAN's material, and filing it
 * under Marta would put it in a slice no question about Bergman ever searches.
 * A contact with no parent IS a client in their own right, so they are their own
 * compartment. */
async function knownContacts(
  cfg: D1Rest,
  guard: MemberGuard
): Promise<{ email: string; accountId: string }[]> {
  const rows = await d1Query<{ email: string; account_id: string }>(
    cfg,
    guard.databaseId,
    // R14 hard cap: the accounts table grows with every person an agency works
    // with, and this read feeds a bounded query string anyway.
    //
    // GROUPED rather than DISTINCT: two contacts can share an address (a shared
    // info@ on a company and on its own contact row), and a row per duplicate
    // would silently double the query string this feeds. `min(...)` picks one
    // deterministically — either is a correct compartment for that address.
    `SELECT lower(email) AS email, min(COALESCE(parent_account_id, id)) AS account_id FROM accounts
      WHERE email IS NOT NULL AND trim(email) <> ''
      GROUP BY lower(email) ORDER BY email LIMIT ${CONTACT_READ_CAP}`
  )
  return rows.map((r) => ({ email: r.email, accountId: r.account_id }))
}

/** The one account an address list points at, or null.
 *
 * A mail's `From` and `To` are RFC-2822 header text ("Marta <marta@berg.de>,
 * ops@berg.de"), not addresses — so the match is "does this header CONTAIN a
 * known address", lower-cased, and the first hit wins. Reading the first hit is
 * deliberate: a thread with two clients on it is one conversation, and picking
 * one compartment for it beats picking none. */
function accountForAddresses(
  contacts: { email: string; accountId: string }[],
  ...headers: string[]
): string | null {
  const haystack = headers.join(" ").toLowerCase()
  for (const c of contacts) if (c.email && haystack.includes(c.email)) return c.accountId
  return null
}

/** What a caller asks the seam for. */
export type GoogleReadRequest = {
  /** which services to read; defaults to all four the person has connected. */
  services?: GoogleService[]
  /** narrow within a service — a Drive/Chat search, a Gmail query. */
  search?: string
  /** read the full text of each item (Drive files only today; a mail list
   * carries snippets, and a body per message is a call per message). */
  withText?: boolean
  /** calendar only — the window to read. */
  from?: string
  to?: string
}

/**
 * Everything the CALLER's own connections can see, in one shape.
 *
 * A service the caller has not connected is simply absent from the answer, not
 * an error: "read what you can" is the honest behaviour for a seam that is asked
 * about four independent connections, and a person who has connected two of them
 * should not get a failure about the other two.
 *
 * `shelf` on every item is the load-bearing field. Drive and Chat items carry
 * the shelf of the source they came through. Gmail and Calendar are always
 * `private` and cannot be anything else — there is no screen on which somebody
 * declares their inbox to be team material, and inventing a way to would be
 * inventing a decision nobody made.
 */
/**
 * THE GOOGLE EVENTS THIS APP ALREADY HOLDS AS MEETINGS.
 *
 * ── THE MEASUREMENT ─────────────────────────────────────────────────────────
 *
 * On the owner's own staging data, 20 Aug 2026: 251 calendar entries in the
 * knowledge base, and 250 of them were the SAME EVENT as a meeting row, matched
 * on Google's own event id. "Week Planning" was in there 108 times. "Pickleball"
 * 99 times.
 *
 * The two arrive by different lanes and neither knew about the other. The
 * meetings sweep files a meeting — title, purpose, who was there, the
 * transcript when there is one, averaging 431 characters. The calendar sweep
 * files the same event straight off Google — a title and a date, averaging
 * THIRTY-FOUR characters.
 *
 * ── WHY IT IS WORTH A QUERY ─────────────────────────────────────────────────
 *
 * An eighth of the whole knowledge base was a second, thinner copy of something
 * already in it. That is not merely waste: retrieval hands back the passages
 * that match, so a hundred near-identical thirty-four-character titles compete
 * for room with the passages that could actually answer the question. The
 * owner's report was that the assistant's answers were unsatisfactory, and this
 * is the largest single reason found.
 *
 * THE MEETING WINS, always, and it is not close — it is the same event with the
 * work written on it. An event NOT in this set is a diary entry nobody made a
 * meeting for, which is exactly the case the calendar lane is for, and it still
 * files normally.
 */
async function meetingEventIds(cfg: D1Rest, guard: MemberGuard): Promise<Set<string>> {
  const rows = await d1Query<{ google_event_id: string }>(
    cfg,
    guard.databaseId,
    // R14 hard cap — a diary is bounded by how many conversations a team has had,
    // and this reads one column of it.
    `SELECT google_event_id FROM meetings
      WHERE google_event_id IS NOT NULL AND google_event_id <> '' AND deactivated_at IS NULL
      LIMIT ${LIST_HARD_CAP}`
  )
  return new Set(rows.map((r) => r.google_event_id))
}

/**
 * A SPACE'S MESSAGES, FOLDED INTO CONVERSATIONS.
 *
 * ── WHY A MESSAGE IS THE WRONG UNIT ─────────────────────────────────────────
 *
 * Chat was filed one source per message, and a chat message is mostly not a
 * thing anybody can answer from. Read off the owner's own spaces on 20 Aug 2026:
 * "yes!", "working.", "👏👏👏👏👏", "safe journey". Each of those was its own
 * source, its own passage and its own competitor for room in an answer — while
 * the exchange that gave them meaning was scattered across four other sources
 * that retrieval had no reason to return together.
 *
 * Google hands us the grouping for free: every message carries `thread.name`,
 * and nothing had ever read it. A thread is what a person means by "that
 * conversation about the voucher quantity", and it is the unit they would go
 * looking for.
 *
 * ── WHAT A FOLDED THREAD IS ─────────────────────────────────────────────────
 *
 * The whole exchange, oldest first, each line attributed to whoever said it, as
 * one body. So a passage that comes back from retrieval carries the question AND
 * the answer AND who gave it — which is the shape the owner asked for ("they
 * don't know who sent what message") and the shape a citation can point at.
 *
 * The thread's OWN id is the source id, so re-reading a space that has gained a
 * reply updates the conversation in place rather than filing a second copy of
 * it — the content hash changes, the source does not multiply. Its timestamp is
 * the LATEST message, because a conversation is as recent as its last reply and
 * the sweep's cursor orders by exactly that.
 *
 * A message Google gives no thread for is its own conversation of one, which is
 * both true and the safe default.
 */
function chatThreads(messages: ChatMessage[]): ChatMessage[] {
  const byThread = new Map<string, ChatMessage[]>()
  for (const m of messages) {
    const key = m.thread || m.id
    byThread.set(key, [...(byThread.get(key) ?? []), m])
  }
  const out: ChatMessage[] = []
  for (const [thread, group] of byThread) {
    // Oldest first: a conversation reads forwards, and the API hands them back
    // newest first.
    const ordered = [...group].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
    const first = ordered[0]
    const last = ordered[ordered.length - 1]
    if (!first || !last) continue
    // WHO IS IN IT, in the order they first spoke, for the title. A conversation
    // between two people is named by both of them rather than by whoever
    // happened to reply last.
    const voices = [...new Set(ordered.map((m) => m.sender).filter(Boolean))]
    out.push({
      ...first,
      id: thread,
      sender: voices.join(", "),
      // Named only if EVERY voice is — a conversation half of whose speakers are
      // "Somebody in this space" is not attributed, and saying it is would be
      // the one thing this lane must never do.
      senderNamed: ordered.every((m) => m.senderNamed),
      text: ordered.map((m) => `${m.sender}: ${m.text}`).join("\n"),
      // AS RECENT AS ITS LAST REPLY, which is what the sweep's cursor orders by.
      createdAt: last.createdAt,
      // The link opens the thread at its first message, which is where a person
      // wants to start reading it.
      url: first.url,
    })
  }
  return out
}

export async function readGoogleMaterial(
  env: GoogleEnv,
  cfg: D1Rest,
  guard: MemberGuard,
  request: GoogleReadRequest = {}
): Promise<{ items: GoogleItem[]; contactsUsed: number; contactsCapped: boolean }> {
  const wanted = request.services ?? (["drive", "gmail", "calendar", "chat"] as GoogleService[])
  const items: GoogleItem[] = []
  let contactsUsed = 0
  let contactsCapped = false
  // Read ONCE for the whole call, not per service: Gmail needs the addresses to
  // build its fence and both Gmail and Calendar need the account behind each
  // one, and that is the same read of the same table.
  const contacts =
    wanted.includes("gmail") || wanted.includes("calendar") ? await knownContacts(cfg, guard) : []

  if (wanted.includes("drive")) {
    const token = await tokenOrNull(env, cfg, guard, "drive")
    if (token) {
      const shared = (await listNamedSources(cfg, guard, "drive")).filter((s) => s.active)
      // TWO GRAINS OF THE SAME FENCE. A folder is a place to look inside; a file
      // named on its own IS the thing. Both are shares this person made, both
      // carry their own shelf and their own client, and the knowledge base must
      // see both or a deliberately shared contract would be the one document the
      // assistant cannot answer from.
      const folders = shared.filter((s) => s.kind === "folder")
      const files = shared.filter((s) => s.kind === "file")
      const shelfOf = new Map(folders.map((f) => [f.externalId, f]))
      const namedFileSource = new Map(files.map((f) => [f.externalId, f]))
      const found = [
        ...(await driveList(token, [...shelfOf.keys()], request.search)),
        // A named file ignores the search term for the same reason the door
        // above it does: somebody who shared exactly one document has already
        // narrowed it as far as narrowing goes.
        ...(await driveFilesById(token, [...namedFileSource.keys()])),
      ]
      for (const file of found) {
        // The folder it came out of, or — for a file named on its own — the row
        // that names the file itself.
        const source = shelfOf.get(file.folderId) ?? namedFileSource.get(file.id)
        items.push({
          service: "drive",
          sourceId: source?.id ?? null,
          externalId: file.id,
          title: file.name,
          url: file.webViewLink,
          text: request.withText ? await driveFileText(token, file.id) : "",
          updatedAt: file.modifiedTime,
          shelf: source?.shelf ?? "private",
          ownerUserId: guard.userId,
          // The SHARE says whose it is — a decision somebody made when they named
          // it, not a name matched out of the file's own text.
          accountId: source?.accountId ?? null,
        })
      }
    }
  }

  if (wanted.includes("gmail")) {
    const token = await tokenOrNull(env, cfg, guard, "gmail")
    if (token) {
      // WHAT THE CONTACTS ARE STILL FOR. They no longer FENCE the search — the
      // owner opened the mailbox on 20 Aug 2026 — but they still decide which
      // client a message belongs to a few lines below. So this reports how many
      // addresses were available to attribute with, and `capped` says whether
      // that attribution had to work from a subset.
      contactsUsed = Math.min(contacts.length, GMAIL_CONTACT_CAP)
      contactsCapped = contacts.length > GMAIL_CONTACT_CAP
      // THE CONTACT FENCE IS OFF (owner, 20 Aug 2026: "I'd read all my emails").
      //
      // It used to build a query from up to forty known contact addresses, so an
      // inbox of tens of thousands contributed THIRTY sources and every internal
      // thread, every supplier and every conversation with somebody not yet filed
      // as a contact was invisible to the assistant. Measured before the change:
      // 30 email sources against 436 meetings and 1,218 document passages.
      //
      // WHAT MAKES THAT HIS DECISION ALONE TO TAKE: mail is filed on the
      // `private` shelf a few lines below, and the knowledge base enforces that
      // on every read (`ownerClause`). Opening the net widens what can answer HIS
      // questions and nobody else's — no colleague, and no client.
      //
      // The contacts are still read, and still do the OTHER job below: deciding
      // which client a message belongs to. Losing the fence does not lose that.
      for (const mail of await gmailSearch(token, "", request.search))
        items.push({
          service: "gmail",
          sourceId: null,
          externalId: mail.id,
          title: mail.subject || "(no subject)",
          url: mail.url,
          text: mail.snippet,
          updatedAt: mail.date,
          // A mailbox is nobody's team material. See the doc comment above.
          shelf: "private",
          ownerUserId: guard.userId,
          // The fence GUARANTEES a known contact is on this message — that is
          // the whole reason it was returned — so the account is a lookup rather
          // than a guess. The cap is the one case it can miss: a query narrowed
          // to forty addresses can return a thread whose match is one of them,
          // which it always is.
          accountId: accountForAddresses(contacts, mail.from, mail.to),
        })
    }
  }

  if (wanted.includes("calendar")) {
    const token = await tokenOrNull(env, cfg, guard, "calendar")
    // EVENTS THIS APP ALREADY HOLDS AS MEETINGS, so they are not filed twice.
    // See `meetingEventIds` for the measurement that made this necessary.
    const alreadyMeetings = token ? await meetingEventIds(cfg, guard) : new Set<string>()
    if (token)
      for (const event of (await calendarList(token, { from: request.from, to: request.to })).events) {
        if (alreadyMeetings.has(event.id)) continue
        items.push({
          service: "calendar",
          sourceId: null,
          externalId: event.id,
          title: event.summary || "(no title)",
          url: event.url,
          text: event.description,
          updatedAt: event.start,
          shelf: "private",
          ownerUserId: guard.userId,
          // A meeting with a client on the invitation is that client's; one with
          // nobody but us in the room is the agency's own. The guest list is the
          // only place on an event where that is written down.
          accountId: accountForAddresses(contacts, event.attendees.map((a) => a.email).join(" ")),
        })
      }
  }

  if (wanted.includes("chat")) {
    const token = await tokenOrNull(env, cfg, guard, "chat")
    // WHO WE ALREADY KNOW, read ONCE for the whole sweep rather than per space —
    // and it is what stops a person reading as "Somebody in this space" in one
    // conversation while being named in the next (0049_chat_people).
    const known = token ? await knownChatPeople(cfg, guard) : new Map<string, string>()
    const fresh = new Map<string, string>()
    if (token)
      for (const space of (await listNamedSources(cfg, guard, "chat")).filter((s) => s.active)) {
        const page = await chatMessages(token, space.externalId, known)
        // WHAT THIS SPACE TAUGHT US IS AVAILABLE TO THE NEXT ONE, in this same
        // sweep, before anything is written down.
        for (const [id, name] of page.learned) { known.set(id, name); fresh.set(id, name) }
        // ONE SOURCE PER CONVERSATION, NOT PER MESSAGE. See `chatThreads`.
        for (const message of chatThreads(page.messages))
          items.push({
            service: "chat",
            sourceId: space.id,
            externalId: message.id,
            title: `${space.name} — ${message.sender}`,
            // THE LINK BACK, built from the message's own ids (`chatMessageUrl`).
            // This was `null` from the day it was written, which made Chat the
            // one Google kind the assistant could quote and nobody could go and
            // read in context.
            url: message.url,
            // ALREADY ATTRIBUTED LINE BY LINE by `chatThreads` above, which is
            // the half that actually answers the owner's complaint: retrieval
            // hands the assistant PASSAGES, and a passage holding only the words
            // has thrown the speaker away by the time anybody reads it. Adding a
            // sender here as well is what produced "Somebody in this space:
            // Somebody in this space:" on every line.
            text: message.text,
            updatedAt: message.createdAt,
            shelf: space.shelf,
            ownerUserId: guard.userId,
            // The space says whose it is, exactly as a Drive folder does.
            accountId: space.accountId,
          })
      }
    // WRITTEN DOWN ONCE, AT THE END. Everything this sweep learned, from every
    // space, so the next sweep starts knowing it — which is the whole point:
    // coverage that goes UP over time instead of depending on whether a mention
    // happens to be in the page in front of us.
    if (fresh.size) await rememberChatPeople(cfg, guard, fresh)
  }

  return { items, contactsUsed, contactsCapped }
}

/**
 * READ THE FULL TEXT OF A SLICE — the second half of "list is cheap, bodies are
 * not".
 *
 * A Drive listing is one call for fifty files; the TEXT of those fifty is fifty
 * more, and a Gmail listing carries a hundred-character snippet where the body
 * is the thing worth indexing. So the seam lists first and hydrates afterwards,
 * and the caller decides WHICH items are worth the calls — the knowledge sweep
 * narrows to its bounded slice before asking, so a tick costs one call per item
 * it is actually going to file rather than one per item it merely saw.
 *
 * `withText: true` on the read above still exists and still fetches everything:
 * that is the right shape for a caller reading one folder on purpose. This is
 * the right shape for a sweep.
 *
 * An item whose text cannot be read comes back with the text it already had (a
 * snippet, or nothing). A file with no text representation is not an error — it
 * is a file with nothing in it to answer questions from.
 */
export async function hydrateText(
  env: GoogleEnv,
  cfg: D1Rest,
  guard: MemberGuard,
  items: GoogleItem[]
): Promise<GoogleItem[]> {
  const out: GoogleItem[] = []
  // One token per service, resolved lazily — a slice that turns out to be all
  // Drive must not go and refresh a Gmail token it never uses.
  const tokens = new Map<GoogleService, string | null>()
  const tokenFor = async (service: GoogleService): Promise<string | null> => {
    if (!tokens.has(service)) tokens.set(service, await tokenOrNull(env, cfg, guard, service))
    return tokens.get(service) ?? null
  }
  for (const item of items) {
    if (item.service !== "drive" && item.service !== "gmail") {
      out.push(item)
      continue
    }
    const token = await tokenFor(item.service)
    if (!token) {
      out.push(item)
      continue
    }
    const text =
      item.service === "drive"
        ? await driveFileText(token, item.externalId)
        : (await gmailMessage(token, item.externalId)).text
    out.push({ ...item, text: text || item.text })
  }
  return out
}

/** A token, or null when this person simply has not connected that service.
 * ONLY the "not connected" refusal is swallowed — a revoked grant, an unreadable
 * token or a Google outage still throws, because those are things somebody needs
 * to be told about rather than an empty answer that looks like an empty Drive. */
async function tokenOrNull(
  env: GoogleEnv,
  cfg: D1Rest,
  guard: MemberGuard,
  service: GoogleService
): Promise<string | null> {
  try {
    return (await accessTokenFor(env, cfg, guard, service)).token
  } catch (e) {
    if (e instanceof Error && "code" in e && (e as { code?: unknown }).code === "google_not_connected")
      return null
    throw e
  }
}
