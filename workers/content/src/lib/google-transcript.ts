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
    return { fileId: file.id, name: file.name || hit.title, url: file.webViewLink ?? hit.url, foundBy: "attachment" }
  } catch {
    return null
  }
}

/** ROUTE 2 — the folders this person named, by the meeting's title and then its
 * Meet code. Unchanged in substance from the hunt this module was extracted
 * from: the title is what a person would search for, and the code is what Google
 * names a transcript after when the entry had no title. */
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
      if (first) return { fileId: first.id, name: first.name, url: first.webViewLink, foundBy: "drive" }
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
      return { fileId: file.id, name: file.name, url: file.webViewLink, foundBy: "mail" }
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

/** THE WORDS THEMSELVES. Separate from the hunt because finding a transcript and
 * reading it are two costs — a screen listing what it found should not pay for a
 * hundred pages of text — and because a document that cannot be read is still a
 * document worth naming on the meeting. */
export async function transcriptText(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  fileId: string
): Promise<string> {
  try {
    return await driveFileText(await driveToken(env, cfg, guard), fileId)
  } catch {
    return ""
  }
}
