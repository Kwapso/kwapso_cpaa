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
  const rows = await d1Query<{ email: string }>(
    cfg,
    guard.databaseId,
    // R14 hard cap: the accounts table grows with every person an agency works
    // with, and this read feeds a bounded query string anyway.
    `SELECT DISTINCT lower(email) AS email FROM accounts
      WHERE email IS NOT NULL AND trim(email) <> '' ORDER BY email LIMIT ${CONTACT_READ_CAP}`
  )
  return rows.map((r) => r.email)
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
        })
      }
    }
  }

  if (wanted.includes("gmail")) {
    const token = await tokenOrNull(env, cfg, guard, "gmail")
    if (token) {
      const contacts = await knownContactEmails(cfg, guard)
      contactsUsed = Math.min(contacts.length, GMAIL_CONTACT_CAP)
      contactsCapped = contacts.length > GMAIL_CONTACT_CAP
      const fence = knownContactQuery(contacts)
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
          })
  }

  return { items, contactsUsed, contactsCapped }
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
