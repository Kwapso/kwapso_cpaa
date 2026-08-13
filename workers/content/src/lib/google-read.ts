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
import { type MemberGuard } from "@shared/workers/gating"
import type { GoogleItem, GoogleService } from "@shared/types"
import {
  chatMessages,
  driveFileText,
  driveList,
  calendarList,
  gmailMessage,
  gmailSearch,
  knownContactQuery,
  GMAIL_CONTACT_CAP,
} from "./google-api"
import { accessTokenFor, listNamedSources, type GoogleEnv } from "./google"

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
export async function knownContacts(
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
      const folders = (await listNamedSources(cfg, guard, "drive")).filter((s) => s.active)
      const shelfOf = new Map(folders.map((f) => [f.externalId, f]))
      for (const file of await driveList(token, [...shelfOf.keys()], request.search)) {
        const source = shelfOf.get(file.folderId)
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
          // The folder says whose it is — a decision somebody made when they
          // named it, not a name matched out of the file's own text.
          accountId: source?.accountId ?? null,
        })
      }
    }
  }

  if (wanted.includes("gmail")) {
    const token = await tokenOrNull(env, cfg, guard, "gmail")
    if (token) {
      contactsUsed = Math.min(contacts.length, GMAIL_CONTACT_CAP)
      contactsCapped = contacts.length > GMAIL_CONTACT_CAP
      const fence = knownContactQuery(contacts.map((c) => c.email))
      // No known contacts → no search. Not an empty filter — nothing at all.
      for (const mail of fence ? await gmailSearch(token, fence, request.search) : [])
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
    if (token)
      for (const event of await calendarList(token, { from: request.from, to: request.to }))
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
          accountId: accountForAddresses(contacts, event.attendees.join(" ")),
        })
  }

  if (wanted.includes("chat")) {
    const token = await tokenOrNull(env, cfg, guard, "chat")
    if (token)
      for (const space of (await listNamedSources(cfg, guard, "chat")).filter((s) => s.active))
        for (const message of await chatMessages(token, space.externalId))
          items.push({
            service: "chat",
            sourceId: space.id,
            externalId: message.id,
            title: `${space.name} — ${message.sender}`,
            url: null,
            text: message.text,
            updatedAt: message.createdAt,
            shelf: space.shelf,
            ownerUserId: guard.userId,
            // The space says whose it is, exactly as a Drive folder does.
            accountId: space.accountId,
          })
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
