// FINDING THE TRANSCRIPT OF A MEETING — three hunts, in order of how much they
// prove, behind one function.
//
// ══════════════════════════════════════════════════════════════════════════════
// WHY THREE, AND WHY THIS ORDER
//
// Google files a Meet transcript as an ordinary Google Doc. Where that document
// ENDS UP depends on settings nobody in this agency chose and most people have
// never seen: it may be attached to the calendar entry, it may land in a "Meet
// Recordings" folder in the organiser's Drive, and it is always announced by
// mail. Any one of the three can be the only route that works for a given call,
// which is why a single hunt kept coming back empty and why the owner's sentence
// names all three:
//
//   "The knowledge base should also be able to automatically ingest transcripts
//    attached to any calendar meetings, or any Google Docs, or any emails that
//    come describing that a Google Doc has been created for a particular
//    calendar or particular meeting."
//
// THE ORDER IS AN ORDER OF PROOF, not of convenience:
//
//   1. THE EVENT'S OWN ATTACHMENTS. The strongest by a distance: Google itself
//      put this file on THIS entry. There is no matching, no name to get wrong,
//      no other call it could belong to.
//   2. A SHARED DRIVE FOLDER, by the meeting's title and then its Meet code.
//      Good, and it is a MATCH rather than a fact — two calls called "Weekly"
//      produce two documents called "Weekly - Transcript". The Meet code is the
//      tiebreaker and is why it is tried second rather than not at all.
//
//      IT IS ALSO THE LEAST RELIABLE OF THE THREE, and that was learned by
//      looking rather than guessed. Reading a real account on 2026-08-18, five
//      "Notes by Gemini" documents sat under FIVE DIFFERENT parent folders —
//      Meet does not file them all in one place, so "share the folder your
//      transcripts land in" is advice with no single folder to follow. This
//      route works when somebody has shared the right folder and is silent when
//      they have not, which is precisely why it is not the only one.
//   3. GOOGLE'S OWN NOTICE IN THE MAIL. Last, because it is the most indirect:
//      a robot wrote to say a document exists, and we read the document id out of
//      its body. Narrowly fenced (`googleNoticeQuery`) and narrowed again by the
//      meeting's own words. Confirmed against real mail on 2026-08-18: a share
//      notice from `drive-shares-dm-noreply@google.com` carries the document as
//      a plain `https://docs.google.com/document/d/<id>/edit?usp=sharing` line in
//      its body, and its subject carries the meeting's own title.
//
// EVERY ROUTE STOPS AT THE FIRST HIT and says which route found it. A person
// asking "how do you know that is the transcript of this call" gets a different
// and honest answer for each of the three, and the row keeps the answer.
//
// AND A HIT HAS TO HAVE WORDS IN IT. `found` used to mean "a file whose name
// looks like a transcript exists"; it now means "and we read it". On 2026-08-18
// route 2 resolved a Drive SHORTCUT — same name as the document, different id,
// no content — and filed a transcript of zero characters with a plausible name
// and a working link, while route 1 read the same conversation as 13,128
// characters. Nothing reported a failure, because from every angle except the
// only one that matters the hunt had succeeded.
//
// So the read moved INTO the hunt, and an empty read is not a hit. That buys two
// things beyond honesty: a route that finds an unreadable candidate FALLS
// THROUGH to the next one, which is exactly what should have happened that day
// (route 3 had the real document); and a meeting whose transcript could not be
// read is left unclaimed, so the next sweep tries again instead of recording
// that the call is covered.
//
// NOTHING HERE IS A WIDENING OF THE MODULE'S FENCES. Route 1 reads an event this
// caller can already read. Route 2 searches only folders they NAMED. Route 3
// reads only mail from four Google robots about the caller's own files. A person
// who has shared nothing and connected nothing gets an honest empty answer
// rather than kwapso going looking through their Drive.
// ══════════════════════════════════════════════════════════════════════════════

import type { D1Rest } from "@shared/workers/d1-rest"
import type { MemberGuard } from "@shared/workers/gating"
import { accessTokenFor, listNamedSources } from "./google"
import {
  documentIdInText,
  driveFileText,
  driveFilesById,
  driveList,
  gmailMessage,
  gmailSearch,
  googleNoticeQuery,
  type CalendarEvent,
} from "./google-api"
import type { Env } from "../env"

/** WHICH HUNT FOUND IT. Kept on the meeting row, because the three do not prove
 * the same thing — see the essay above. */
export type TranscriptRoute = "attachment" | "drive" | "mail"

/** A transcript, and the receipt for how it was found. */
export type FoundTranscript = {
  fileId: string
  name: string
  url: string | null
  foundBy: TranscriptRoute
  /** THE WORDS, and they are why this is a `FoundTranscript` at all — see the
   * essay on `findTranscript`. Never empty: a route that could not read its
   * candidate did not find a transcript. */
  text: string
}

/** WHAT A TRANSCRIPT IS CALLED. Google Meet writes "<meeting> - Transcript"; the
 * Gemini note-taker writes "Notes by Gemini" and, in a German workspace,
 * "Transkript". A recording is deliberately NOT matched — an .mp4 has no words
 * this app can read, and filing one as "the transcript" would leave a meeting
 * claiming to hold a conversation nobody can search. */
const TRANSCRIPT_NAME = /transcript|transkript|notes by gemini/i

/** How many Google notices one hunt will open. Each is a message body — a real
 * call — and the notice we want is nearly always the newest one matching the
 * meeting's own title. A hunt that opened fifty would spend a person's whole
 * request on mail that is not about this meeting. */
const NOTICE_READ_CAP = 5

/**
 * THE HUNT. Returns the transcript, or null when none of the three found one.
 *
 * A route that FAILS (Drive not connected, no mail grant, Google refusing) does
 * not stop the others: each is wrapped, because "I could not read your mail" is
 * not an answer to "is there a transcript" when the answer was sitting on the
 * calendar entry all along. A total failure is still an honest null.
 *
 * A route that finds a file it CANNOT READ fails in exactly the same way, and
 * for the same reason — see the header. The words come back on the result, so
 * the caller that files them does not pay for a second read.
 */
export async function findTranscript(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  event: CalendarEvent
): Promise<FoundTranscript | null> {
  return (
    (await fromAttachments(env, cfg, guard, event)) ??
    (await fromNamedFolders(env, cfg, guard, event)) ??
    (await fromGoogleNotices(env, cfg, guard, event))
  )
}

/** ROUTE 1 — the file Google itself put on this entry. */
async function fromAttachments(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  event: CalendarEvent
): Promise<FoundTranscript | null> {
  const hit = event.attachments.find((a) => TRANSCRIPT_NAME.test(a.title) && a.fileId)
  if (!hit) return null
  // The attachment says a file id and a title; whether we can READ it is a
  // separate question (the Drive connection, and Google's own view of whether
  // this app may see that document). Asking now means a meeting never claims a
  // transcript whose words are unreachable.
  try {
    const [file] = await driveFilesById(await driveToken(env, cfg, guard), [hit.fileId])
    if (!file) return null
    return await withWords(env, cfg, guard, file, {
      name: file.name || hit.title,
      url: file.webViewLink ?? hit.url,
      foundBy: "attachment",
    })
  } catch {
    return null
  }
}

/** ROUTE 2 — the folders this person named, by the meeting's title and then its
 * Meet code. Unchanged in substance from the hunt this module was extracted
 * from: the title is what a person would search for, and the code is what Google
 * names a transcript after when the entry had no title.
 *
 * THE ROUTE THAT FILED AN EMPTY TRANSCRIPT, and it is worth naming which part
 * failed. Not the search — it found the right document, by the right name, in a
 * folder somebody deliberately shared. What it found was a SHORTCUT to that
 * document, which Drive returns from a folder listing exactly as it returns a
 * file. Two things now stop it: `targetId` off the listing, so the id we keep is
 * the DOCUMENT's rather than the pointer's, and `withWords`, so a candidate
 * whose text we cannot read is not a hit at all. */
async function fromNamedFolders(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  event: CalendarEvent
): Promise<FoundTranscript | null> {
  try {
    const folders = (await listNamedSources(cfg, guard, "drive"))
      .filter((s) => s.active && s.kind === "folder")
      .map((s) => s.externalId)
    if (folders.length === 0) return null
    const token = await driveToken(env, cfg, guard)
    for (const term of [event.summary, event.meetingCode].filter(Boolean)) {
      const hits = (await driveList(token, folders, term as string))
        .filter((f) => TRANSCRIPT_NAME.test(f.name))
        .sort((a, b) => (b.modifiedTime ?? "").localeCompare(a.modifiedTime ?? ""))
      const first = hits[0]
      if (first) {
        const found = await withWords(env, cfg, guard, first, {
          name: first.name,
          url: first.webViewLink,
          foundBy: "drive",
        })
        // An unreadable candidate is not "no transcript" — it is this route
        // having nothing, and route 3 is still to come. On the day this was
        // found, route 3 held the same conversation and could read it.
        if (found) return found
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * ROUTE 3 — the robot's mail, and the document id in its body.
 *
 * NARROWED TWICE. The fence names four Google no-reply addresses and nothing
 * else (`googleNoticeQuery` says why that is not a widening of the mail
 * promise); the meeting's own title is ANDed inside it, so a notice about
 * somebody else's document is not in the answer to begin with.
 *
 * A meeting with no title to search on is skipped rather than searched for
 * everything — "find me any Google notice at all and take the first document in
 * it" is precisely how the wrong transcript gets attached to the right meeting.
 */
async function fromGoogleNotices(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  event: CalendarEvent
): Promise<FoundTranscript | null> {
  const term = (event.summary || event.meetingCode || "").trim()
  if (!term) return null
  try {
    const { token: mailToken } = await accessTokenFor(env, cfg, guard, "gmail")
    const notices = (await gmailSearch(mailToken, googleNoticeQuery(), `"${term}"`)).slice(
      0,
      NOTICE_READ_CAP
    )
    for (const notice of notices) {
      // The search hands back headers only; the document link lives in the body,
      // so the body is a second call — which is why the cap above is small.
      const full = await gmailMessage(mailToken, notice.id)
      const fileId = documentIdInText(`${full.text}\n${full.snippet}`)
      if (!fileId) continue
      const [file] = await driveFilesById(await driveToken(env, cfg, guard), [fileId])
      // A document we cannot open is not a transcript we can file. The next
      // notice may name one we can.
      if (!file) continue
      if (!TRANSCRIPT_NAME.test(file.name)) continue
      const found = await withWords(env, cfg, guard, file, {
        name: file.name,
        url: file.webViewLink,
        foundBy: "mail",
      })
      // Same reasoning as the two `continue`s above it: a document with nothing
      // in it is not a transcript, and the next notice may name one that is.
      if (found) return found
    }
    return null
  } catch {
    return null
  }
}

/** The caller's own Drive token. Named once because all three routes need it and
 * two of them need it only after they have found something worth reading. */
async function driveToken(env: Env, cfg: D1Rest, guard: MemberGuard): Promise<string> {
  return (await accessTokenFor(env, cfg, guard, "drive")).token
}

/**
 * READ THE CANDIDATE, OR IT IS NOT A HIT — the one place a route turns a
 * plausible file into a transcript, and the whole of the empty-transcript fix.
 *
 * THE ID IS THE TARGET'S WHERE THERE IS ONE. A Drive shortcut has its own id,
 * its own name and its own link, and every one of them is a pointer's. Keeping
 * the pointer's id on a meeting would leave the row naming a file with no words
 * in it, so a caller that later re-read it would get the same nothing.
 *
 * AN EMPTY READ IS A FAILURE, not a transcript with no words. `driveFileText`
 * answers "" for everything it cannot turn into text — an image, a zip, a file
 * whose owner switched downloading off — and that is the right answer for the
 * knowledge sweep walking a folder of forty mixed files. It is the wrong answer
 * here, because a transcript IS its words: there is nothing else on it to keep.
 *
 * This is also the only reason `findTranscript` costs a read at all, and it
 * costs nothing extra: both callers read the text immediately afterwards, so the
 * call moved rather than multiplied.
 */
async function withWords(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  file: { id: string; targetId: string | null },
  found: Omit<FoundTranscript, "fileId" | "text">
): Promise<FoundTranscript | null> {
  const fileId = file.targetId ?? file.id
  try {
    const text = await driveFileText(env, await driveToken(env, cfg, guard), fileId)
    return text ? { ...found, fileId, text } : null
  } catch {
    return null
  }
}
