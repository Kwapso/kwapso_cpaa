// kwapso CONTENT worker — team-DB content modules (Tickets, the work engine
// and the Knowledge base). This file is just the SWITCHBOARD: it maps each route to
// a handler (grouped by domain under ./routes/*) and centrally maps thrown
// GuardErrors to clean HTTP responses. The shared opening (whoAmI / teamContext
// / requireRight) lives in the shared gating seam.
//
// IT HAS TWO CRONS, and the scheduled handler branches on which one fired:
//   • every 15 minutes — keep the knowledge base in step with the rows this
//     worker owns. Bounded per tick, resumable from a cursor;
//   • once a morning — the triage digest: what has been sitting unread past
//     three days, and on Mondays who logged no time last week. One message, to
//     the person whose week it is, and never to a client.
// Both record their failures (R12): unattended work has nobody watching.
//
//   GET  /api/content/help                -> the team's tickets (?scope=mine|all, ?id → one)
//   GET  /api/content/help/thread         -> one ticket's replies (?id=<ticketId>)
//   POST /api/content/help                -> raise a ticket
//   POST /api/content/help/update         -> edit a ticket
//   POST /api/content/help/status         -> move a ticket along its fixed lifecycle
//   POST /api/content/help/bulk-status    -> move MANY tickets to one status → {updated,skipped}
//   POST /api/content/help/bulk-status-by-filter -> the SET-shaped bulk (facets → status)
//   POST /api/content/help/rank           -> drag-rank a ticket between two others
//   POST /api/content/help/archive        -> archive / restore a ticket (any state)
//   POST /api/content/help/reply          -> add a reply to a ticket's thread
//   POST /api/content/help/resolve        -> answer it: resolve + reply + email them
//   GET  /api/content/help/stakeholders   -> a ticket's stakeholders (?id=<ticketId>)
//   POST /api/content/help/stakeholders   -> manually add a stakeholder (add-only)
//   GET  /api/content/stories             -> the backlog (?id → one; status/ticketId/sprintId/assigneeId/view filters)
//   POST /api/content/stories             -> write one piece of work down
//   POST /api/content/stories/update      -> edit a story
//   POST /api/content/stories/status      -> move a story along its four states
//   GET  /api/content/sprints             -> the blocks of work sold (?accountId → one client's)
//   POST /api/content/sprints             -> start a sprint
//   POST /api/content/sprints/update      -> edit one (name, kind, dates, PRICE)
//   POST /api/content/sprints/complete    -> mark a sprint finished / reopen it
//   GET  /api/content/work-logs           -> time, newest first (scope/target/user filters)
//   GET  /api/content/work-logs/running   -> what the caller has running right now
//   POST /api/content/work-logs           -> write time down by hand
//   POST /api/content/work-logs/start     -> start a timer (the one click)
//   POST /api/content/work-logs/stop      -> stop one (?endedAt = "at five on Friday")
//   POST /api/content/work-logs/update    -> correct a row (leaves a trail)
//   POST /api/content/work-logs/runaway   -> keep it / stop it then / bin it
//   POST /api/content/work-logs/auto-stop -> the caller's own timer preference
//   GET  /api/content/todos               -> what we are waiting on a client for (fenced)
//   POST /api/content/todos               -> ask a client for something (emails them)
//   POST /api/content/todos/complete      -> the client marks it done, with a file
//   POST /api/content/todos/cancel        -> we stopped needing it (nothing deleted)
//   GET  /api/content/portal/delivery     -> the client's sprints, as named blocks with dates
//   GET  /api/content/tasks               -> our own internal admin
//   POST /api/content/tasks               -> write down a piece of admin
//   POST /api/content/tasks/done          -> tick it / put it back
//   GET  /api/content/triage              -> whose week it is + the tickets nobody has read
//   POST /api/content/triage              -> put somebody on triage duty for a week
//   GET  /api/content/knowledge           -> the sources the assistant may read (?id → one)
//   GET  /api/content/knowledge/ask       -> answer a question from them, with citations
//   GET  /api/content/knowledge/sync      -> how far the sweep has got with each kind
//   POST /api/content/knowledge           -> add a source
//   POST /api/content/knowledge/upload    -> …or hand it a FILE, and read it
//   POST /api/content/knowledge/upload-stream -> the same, file as the raw body
//   POST /api/content/knowledge/update    -> correct a source
//   POST /api/content/knowledge/active    -> take a source away from the assistant / give it back
//   POST /api/content/knowledge/sync      -> bring the base into step, one bounded slice
//   POST /api/content/knowledge/sync-google -> …and MY OWN Google material, as me
//   GET  /api/content/meetings            -> the diary (?id → one; account/purpose/status/view/q filters)
//   POST /api/content/meetings            -> put a meeting in the diary
//   POST /api/content/meetings/update     -> correct it / write the notes up
//   POST /api/content/meetings/held       -> it happened / it hasn't yet
//   POST /api/content/meetings/active     -> cancel it / put it back
//   GET  /api/content/brand-assets        -> the brand library (?id → one)
//   POST /api/content/brand-assets[/update|/active|/upload] -> write / edit / archive / store bytes
//   GET  /api/content/delivery/purposes   -> why we meet (?id → one)
//   GET  /api/content/staff/profiles      -> the team's own profiles (?userId → one)
//   GET  /api/content/staff/certificates  -> what people hold (?userId → one person's)
//   GET  /api/content/health

import { brand } from "@shared/brand"
import { fail, json } from "@shared/workers/http"
import { GuardError } from "@shared/workers/gating"
import { recordWorkerError } from "@shared/workers/error-log"
import { requestId } from "@shared/workers/trace"
import type { Env } from "./env"
import {
  getHelp,
  getHelpStakeholders,
  getHelpThread,
  postAddStakeholder,
  postBulkHelpStatus,
  postCreateHelp,
  postHelpArchive,
  postHelpRank,
  postHelpReply,
  postHelpStatus,
  postUpdateHelp,
  postBulkHelpStatusByFilter,
  postResolveHelp,
  getHelpAttachments,
  postHelpAttachment,
  postRemoveHelpAttachment,
  postHelpTriageRead,
  postValidateHelp,
} from "./routes/help"
import {
  getSprints,
  getStories,
  postCreateSprint,
  postCreateStory,
  postSprintComplete,
  postStoryStatus,
  postUpdateSprint,
  postUpdateStory,
} from "./routes/stories"
import {
  getRunningTimers,
  getWorkLogs,
  postAutoStop,
  postLogTime,
  postResolveRunaway,
  postStartTimer,
  postStopTimer,
  postUpdateWorkLog,
} from "./routes/work-logs"
import {
  getTasks,
  getTodos,
  postCancelTodo,
  postCompleteTodo,
  postCreateTask,
  postCreateTodo,
  postTaskDone,
  getPortalDelivery,
} from "./routes/todos"
import { getTriage, postSetTriageDuty } from "./routes/triage"
import {
  getKnowledge,
  getKnowledgeAsk,
  getKnowledgeSync,
  postCreateKnowledge,
  postKnowledgeSync,
  postKnowledgeSyncGoogle,
  postSetKnowledgeActive,
  postUpdateKnowledge,
  postStreamKnowledgeFile,
  postUploadKnowledgeFile,
} from "./routes/knowledge"
import {
  getMeetings,
  postCreateMeeting,
  postMeetingHeld,
  postSetMeetingActive,
  postUpdateMeeting,
} from "./routes/meetings"
import {
  getBrandAssets,
  getBrandAssetsExport,
  postCreateBrandAsset,
  postSetBrandAssetActive,
  postUpdateBrandAsset,
  postStreamBrandAsset,
  postUploadBrandAsset,
} from "./routes/brand-assets"
import {
  getMeetingPurposes,
  getMeetingPurposesExport,
  postCreateMeetingPurpose,
  postSetMeetingPurposeActive,
  postUpdateMeetingPurpose,
} from "./routes/delivery"
import {
  getStaffCertificates,
  getStaffCertificatesExport,
  getStaffProfiles,
  postCreateStaffCertificate,
  postSaveStaffProfile,
  postSetStaffCertificateActive,
  postSetStaffProfileActive,
  postUpdateStaffCertificate,
  postStreamStaffFile,
  postUploadStaffFile,
} from "./routes/staff"
import {
  getGoogleCallback,
  getGoogleChat,
  getGoogleChatSpaces,
  getGoogleConnections,
  getGoogleDriveFile,
  getGoogleDriveFiles,
  getGoogleEvents,
  getGoogleEventTranscript,
  getGoogleMail,
  getGoogleMailMessage,
  getGooglePick,
  getGoogleStart,
  postGoogleChat,
  postGoogleChatDelete,
  postGoogleConnect,
  postGoogleDisconnect,
  postGoogleDriveFolder,
  postGoogleDriveSaveMail,
  postGoogleDriveTrash,
  postGoogleDriveUpdate,
  postGoogleDriveUpload,
  postGoogleEvent,
  postGoogleEventCancel,
  postGoogleEventGuests,
  postGoogleEventLocation,
  postGoogleEventUpdate,
  postGoogleMailDraft,
  postGoogleMailLabel,
  postGoogleMailReply,
  postGoogleMailSend,
  postGoogleSource,
  postGoogleSourceActive,
  postGoogleSprintEvent,
  postGoogleMeetingEvent,
} from "./routes/google"
import { sweepAll } from "./lib/knowledge-ingest"
import { sendTriageDigest, teamMemberNames } from "./lib/notify"
import { dutyFor, loggedNothingLastWeek, needsTriage } from "./lib/triage"
import { d1ConfigFrom } from "@shared/workers/gating"
import { CRON_TEAM_CAP } from "@shared/workers/limits"
import { publishChange } from "@shared/workers/realtime"

/** THE MORNING TICK, as the expression wrangler.jsonc registers it. Named here
 * rather than matched by hand so the scheduled handler and the config cannot
 * drift into a cron that fires and does nothing. */
const DIGEST_CRON = "0 7 * * *"

/** How often each tick fires, in milliseconds — the rotation's step size (see
 * teamSlice). Beside the expressions above rather than derived from them, because
 * parsing a cron string to get a period is a lot of machinery to answer a
 * question two constants already answer. */
const SWEEP_EVERY_MS = 15 * 60 * 1000
const DIGEST_EVERY_MS = 24 * 60 * 60 * 1000

/** THE TEAMS THIS TICK WORKS ON — a ROTATING window, not the first page.
 *
 * Both crons used to read `ORDER BY id LIMIT CRON_TEAM_CAP` and both said, in a
 * comment, that "the remaining teams wait for the next tick". They did not. The
 * order never changed and neither did the window, so the same 200 teams were
 * swept and mailed every time and every team past the 200th was skipped —
 * forever, not late. Team ids are ULIDs, so "the first 200 by id" is "the 200
 * oldest": the newest tenants were the ones getting nothing, silently, which is
 * the worst possible direction for it to fail in.
 *
 * The fix keeps every property the cap was bought for — bounded work per tick,
 * nothing to remember between ticks — and adds the one it was missing: the window
 * MOVES. `scheduledTime` divided by the tick's own period is a counter that
 * advances once per fire, and modulo the number of windows it walks the whole
 * estate and comes back round. No cursor table, no migration, no state to get
 * out of step, and it is deterministic — a re-run of the same tick does the same
 * teams.
 *
 * OFFSET, DELIBERATELY. Keyset paging is the house rule for anything a person
 * scrolls (shared/workers/paging.ts), and it is the wrong tool here: this needs
 * "the Nth window of the whole estate", which is what an offset IS. `teams` is
 * one row per tenant — thousands, not millions — and this runs twice a day and
 * every fifteen minutes on a table that size. If it ever became the expensive
 * part of a tick, the estate would be big enough to deserve a real work queue,
 * which is the Tier-C answer the scaling review names.
 *
 * A LATE TEAM IS THE COST, and it is named honestly: with more than
 * CRON_TEAM_CAP teams the sweep's lap takes ceil(total/cap) ticks (fifteen
 * minutes each) and the digest's lap takes that many DAYS. Fifteen minutes late
 * is what the sweep was designed for. Days late is not a daily digest, and the
 * tick says so out loud rather than looking healthy. */
export async function teamSlice(
  env: Env,
  scheduledTime: number,
  everyMs: number,
  job: string
): Promise<{ id: string; database_id: string }[]> {
  const READY = `db_status = 'ready' AND deactivated_at IS NULL`
  const counted = await env.DB.prepare(`SELECT COUNT(*) AS n FROM teams WHERE ${READY}`).first<{
    n: number
  }>()
  const total = counted?.n ?? 0
  if (total === 0) return []
  const windows = Math.ceil(total / CRON_TEAM_CAP)
  const window = windows <= 1 ? 0 : Math.floor(scheduledTime / everyMs) % windows
  if (windows > 1)
    console.warn(
      `${job}: ${total} teams needs ${windows} ticks per lap — this tick takes window ${window + 1}/${windows}. ` +
        `A team is now visited once every ${windows} ticks; past a few windows this wants a work queue, not a bigger cap.`
    )
  const rows = await env.DB.prepare(
    `SELECT id, database_id FROM teams WHERE ${READY}
      ORDER BY id LIMIT ${CRON_TEAM_CAP} OFFSET ${window * CRON_TEAM_CAP}`
  ).all<{ id: string; database_id: string }>()
  return rows.results ?? []
}

/**
 * THE LIVE-SYNC SEAM (locked, CACHING.md "Every mutation publishes"). Every
 * route is classified so a new one CAN'T be added without consciously deciding
 * how it goes live — that's the structural can't-forget guarantee (a guard test,
 * publish-seam.test.ts, enforces it):
 *   • "read"        — a GET; changes nothing, broadcasts nothing.
 *   • "mutation"    — changes state, so it MUST broadcast a change ping
 *                     (publishChange / publishUserChange — directly or via a lib).
 *   • "housekeeping" — the deny-list: a write that intentionally broadcasts
 *                      NOTHING (a private session pointer, or an ops-only action
 *                      with no client-visible row). Adding one is a reviewed choice.
 */
type RouteKind = "read" | "mutation" | "housekeeping"
type Handler = (request: Request, env: Env) => Promise<Response>
export const ROUTES: Record<string, { handler: Handler; kind: RouteKind }> = {
  // Stores a file in R2 but changes NO record (no row to patch) → housekeeping.
  "GET /api/content/help": { handler: getHelp, kind: "read" },
  "GET /api/content/help/thread": { handler: getHelpThread, kind: "read" },
  "POST /api/content/help": { handler: postCreateHelp, kind: "mutation" },
  "POST /api/content/help/update": { handler: postUpdateHelp, kind: "mutation" },
  "POST /api/content/help/status": { handler: postHelpStatus, kind: "mutation" },
  "POST /api/content/help/bulk-status": { handler: postBulkHelpStatus, kind: "mutation" },
  // The SET-shaped bulk: facet filter → one status (counts first; publishes only when moved).
  "POST /api/content/help/bulk-status-by-filter": { handler: postBulkHelpStatusByFilter, kind: "mutation" },
  // Drag-rank + archive: the two moves SCOPE ch.07 gives a ticket besides its status.
  "POST /api/content/help/rank": { handler: postHelpRank, kind: "mutation" },
  "POST /api/content/help/archive": { handler: postHelpArchive, kind: "mutation" },
  "POST /api/content/help/reply": { handler: postHelpReply, kind: "mutation" },
  // COME BACK TO THE CLIENT — the second and last thing that emails one.
  "POST /api/content/help/resolve": { handler: postResolveHelp, kind: "mutation" },
  // THE TWO ACTS ON THE LADDER A MACHINE CANNOT INFER (CHECKLIST 5.11, 5.13).
  // Everything else about a ticket's status now happens by itself — a timer
  // starts, a sprint is picked, the last story closes — so these two are doors
  // with their own words rather than values in a dropdown of seven.
  "POST /api/content/help/validate": { handler: postValidateHelp, kind: "mutation" },
  "POST /api/content/help/triage-read": { handler: postHelpTriageRead, kind: "mutation" },
  // Several files and several links on one ticket, from BOTH front doors.
  "GET /api/content/help/attachments": { handler: getHelpAttachments, kind: "read" },
  "POST /api/content/help/attachments": { handler: postHelpAttachment, kind: "mutation" },
  "POST /api/content/help/attachments/remove": { handler: postRemoveHelpAttachment, kind: "mutation" },
  "GET /api/content/help/stakeholders": { handler: getHelpStakeholders, kind: "read" },
  "POST /api/content/help/stakeholders": { handler: postAddStakeholder, kind: "mutation" },
  // THE WORK ENGINE — what we DO about a request, and the block of work it was
  // sold inside. Every one of these doors refuses a client login at the door
  // (R21): a story names the staff member doing the work, which the portal never
  // shows. A client's view of a story is a COUNT on their own ticket.
  "GET /api/content/stories": { handler: getStories, kind: "read" },
  "POST /api/content/stories": { handler: postCreateStory, kind: "mutation" },
  "POST /api/content/stories/update": { handler: postUpdateStory, kind: "mutation" },
  "POST /api/content/stories/status": { handler: postStoryStatus, kind: "mutation" },
  "GET /api/content/sprints": { handler: getSprints, kind: "read" },
  "POST /api/content/sprints": { handler: postCreateSprint, kind: "mutation" },
  "POST /api/content/sprints/update": { handler: postUpdateSprint, kind: "mutation" },
  "POST /api/content/sprints/complete": { handler: postSprintComplete, kind: "mutation" },
  // TIME. A timer is a work log with no end yet, so there is one table and one
  // pair of doors rather than a timer service beside a timesheet.
  "GET /api/content/work-logs": { handler: getWorkLogs, kind: "read" },
  "GET /api/content/work-logs/running": { handler: getRunningTimers, kind: "read" },
  "POST /api/content/work-logs": { handler: postLogTime, kind: "mutation" },
  "POST /api/content/work-logs/start": { handler: postStartTimer, kind: "mutation" },
  "POST /api/content/work-logs/stop": { handler: postStopTimer, kind: "mutation" },
  "POST /api/content/work-logs/update": { handler: postUpdateWorkLog, kind: "mutation" },
  "POST /api/content/work-logs/runaway": { handler: postResolveRunaway, kind: "mutation" },
  // A PRIVATE PREFERENCE about how the caller's own timers behave. It changes no
  // record anybody else can see and no screen anybody else is looking at, so it
  // broadcasts nothing — a reviewed housekeeping line, not a forgotten publish.
  "POST /api/content/work-logs/auto-stop": { handler: postAutoStop, kind: "housekeeping" },
  // THE OTHER TWO NOUNS. A to-do is aimed at the CLIENT (fenced, and two of its
  // doors are on the portal's surface); a task is our own admin (refused to a
  // client login, like the rest of the work engine).
  "GET /api/content/todos": { handler: getTodos, kind: "read" },
  "POST /api/content/todos": { handler: postCreateTodo, kind: "mutation" },
  "POST /api/content/todos/complete": { handler: postCompleteTodo, kind: "mutation" },
  "POST /api/content/todos/cancel": { handler: postCancelTodo, kind: "mutation" },
  // The CLIENT's own picture of the work they bought — named blocks with dates
  // and two counts, in a shape that has nowhere to put a price.
  "GET /api/content/portal/delivery": { handler: getPortalDelivery, kind: "read" },
  "GET /api/content/tasks": { handler: getTasks, kind: "read" },
  "POST /api/content/tasks": { handler: postCreateTask, kind: "mutation" },
  "POST /api/content/tasks/done": { handler: postTaskDone, kind: "mutation" },
  // TRIAGE — whose week it is, and what has been sitting unread. Both refused to
  // a client login: an unread request is our failure, not an SLA we promised.
  "GET /api/content/triage": { handler: getTriage, kind: "read" },
  "POST /api/content/triage": { handler: postSetTriageDuty, kind: "mutation" },
  "GET /api/content/knowledge": { handler: getKnowledge, kind: "read" },
  "GET /api/content/knowledge/ask": { handler: getKnowledgeAsk, kind: "read" },
  "GET /api/content/knowledge/sync": { handler: getKnowledgeSync, kind: "read" },
  "POST /api/content/knowledge": { handler: postCreateKnowledge, kind: "mutation" },
  // A file becomes a source: stored whole, read where we can, and honest about
  // it where we cannot. A MUTATION, not housekeeping — unlike the brand-library
  // upload door below, this one writes the record as well as the bytes.
  "POST /api/content/knowledge/upload": { handler: postUploadKnowledgeFile, kind: "mutation" },
  "POST /api/content/knowledge/upload-stream": { handler: postStreamKnowledgeFile, kind: "mutation" },
  "POST /api/content/knowledge/update": { handler: postUpdateKnowledge, kind: "mutation" },
  "POST /api/content/knowledge/active": { handler: postSetKnowledgeActive, kind: "mutation" },
  // A slice of the sweep, by hand — it writes source rows, so it publishes (a
  // coarse ping: a slice touches many rows and no one row is the change).
  "POST /api/content/knowledge/sync": { handler: postKnowledgeSync, kind: "mutation" },
  // THE PERSONAL HALF. Same engine, different kinds — and a different actor: every
  // byte it reads comes through the CALLER's own Google token, which is why it is
  // a door and never a cron (lib/knowledge-google.ts's header says why at length).
  "POST /api/content/knowledge/sync-google": { handler: postKnowledgeSyncGoogle, kind: "mutation" },

  // ── MEETINGS ───────────────────────────────────────────────────────────────
  // The conversations we have, with the agenda and the notes kept. Every door
  // refuses a client login (R21): a meeting's notes are OUR record, written for
  // us and often about the client rather than for them.
  "GET /api/content/meetings": { handler: getMeetings, kind: "read" },
  "POST /api/content/meetings": { handler: postCreateMeeting, kind: "mutation" },
  "POST /api/content/meetings/update": { handler: postUpdateMeeting, kind: "mutation" },
  "POST /api/content/meetings/held": { handler: postMeetingHeld, kind: "mutation" },
  "POST /api/content/meetings/active": { handler: postSetMeetingActive, kind: "mutation" },

  // ── THE AGENCY'S OWN HOUSEKEEPING ──────────────────────────────────────────
  // Three modules, four tables, and one thing every door below has in common: it
  // opens with `refusePortalCaller`. None of this material is a client's, so
  // there is no fenced slice of it to serve one — only a refusal (R21).
  "GET /api/content/brand-assets": { handler: getBrandAssets, kind: "read" },
  "GET /api/content/brand-assets/export": { handler: getBrandAssetsExport, kind: "read" },
  "POST /api/content/brand-assets": { handler: postCreateBrandAsset, kind: "mutation" },
  "POST /api/content/brand-assets/update": { handler: postUpdateBrandAsset, kind: "mutation" },
  "POST /api/content/brand-assets/active": { handler: postSetBrandAssetActive, kind: "mutation" },
  // Stores a file in R2 but changes NO record (no row to patch) → housekeeping,
  // which is what separates it from the knowledge upload door above.
  "POST /api/content/brand-assets/upload": { handler: postUploadBrandAsset, kind: "housekeeping" },
  "POST /api/content/brand-assets/upload-stream": { handler: postStreamBrandAsset, kind: "housekeeping" },
  "GET /api/content/delivery/purposes": { handler: getMeetingPurposes, kind: "read" },
  "GET /api/content/delivery/purposes/export": { handler: getMeetingPurposesExport, kind: "read" },
  "POST /api/content/delivery/purposes": { handler: postCreateMeetingPurpose, kind: "mutation" },
  "POST /api/content/delivery/purposes/update": { handler: postUpdateMeetingPurpose, kind: "mutation" },
  "POST /api/content/delivery/purposes/active": { handler: postSetMeetingPurposeActive, kind: "mutation" },
  "GET /api/content/staff/profiles": { handler: getStaffProfiles, kind: "read" },
  // One door for "there wasn't a profile" and "there was" — see routes/staff.ts.
  "POST /api/content/staff/profiles": { handler: postSaveStaffProfile, kind: "mutation" },
  "POST /api/content/staff/profiles/active": { handler: postSetStaffProfileActive, kind: "mutation" },
  "POST /api/content/staff/upload": { handler: postUploadStaffFile, kind: "housekeeping" },
  "POST /api/content/staff/upload-stream": { handler: postStreamStaffFile, kind: "housekeeping" },
  "GET /api/content/staff/certificates": { handler: getStaffCertificates, kind: "read" },
  "GET /api/content/staff/certificates/export": { handler: getStaffCertificatesExport, kind: "read" },
  "POST /api/content/staff/certificates": { handler: postCreateStaffCertificate, kind: "mutation" },
  "POST /api/content/staff/certificates/update": { handler: postUpdateStaffCertificate, kind: "mutation" },
  "POST /api/content/staff/certificates/active": { handler: postSetStaffCertificateActive, kind: "mutation" },

  // ── GOOGLE, CONNECTED ONE PERSON AT A TIME ─────────────────────────────────
  // Four services, each asked for separately, each connected to the CALLER's own
  // account. Every door below opens with `refusePortalCaller`: clients get no
  // assistant and no Google surface at all, and the refusal lives on the handler
  // because the agency gateway forwards by prefix (R21).
  //
  // Two of these are the browser's half of an OAuth round-trip and are worth
  // reading together. `/start` bounces to Google's consent screen. `/callback`
  // is where Google sends the browser back — and it CHANGES NO ROW: it checks
  // the round-trip is the one we started and moves the authorization code into
  // the same HttpOnly one-shot cookie, so the gated, publishing POST beside it
  // is what actually stores the credential. A GET that wrote a token would be a
  // mutation the seam tests are right to skip and wrong to have to trust.
  "GET /api/content/google/connections": { handler: getGoogleConnections, kind: "read" },
  "GET /api/content/google/start": { handler: getGoogleStart, kind: "read" },
  "GET /api/content/google/callback": { handler: getGoogleCallback, kind: "read" },
  "POST /api/content/google/connect": { handler: postGoogleConnect, kind: "mutation" },
  "POST /api/content/google/disconnect": { handler: postGoogleDisconnect, kind: "mutation" },
  // What a connection shares: the picker, and the named folders and spaces.
  "GET /api/content/google/pick": { handler: getGooglePick, kind: "read" },
  "POST /api/content/google/sources": { handler: postGoogleSource, kind: "mutation" },
  "POST /api/content/google/sources/active": { handler: postGoogleSourceActive, kind: "mutation" },
  // READING and WRITING, for all four. Every write publishes because every write
  // moves the connection's own row: `last_used_at`, plus a history row saying
  // what kwapso did as whom. An act in somebody else's system that left no trace
  // in ours would be the one write in the base with no audit block.
  "GET /api/content/google/drive/files": { handler: getGoogleDriveFiles, kind: "read" },
  "GET /api/content/google/drive/file": { handler: getGoogleDriveFile, kind: "read" },
  "POST /api/content/google/drive/upload": { handler: postGoogleDriveUpload, kind: "mutation" },
  // WRITING is not just putting a file in. Rewriting one, making a folder to put
  // it in, filing a conversation as a document — and the bin, without which the
  // other three are three ways to make a mess nobody can tidy.
  "POST /api/content/google/drive/update": { handler: postGoogleDriveUpdate, kind: "mutation" },
  "POST /api/content/google/drive/folder": { handler: postGoogleDriveFolder, kind: "mutation" },
  "POST /api/content/google/drive/save-mail": { handler: postGoogleDriveSaveMail, kind: "mutation" },
  "POST /api/content/google/drive/trash": { handler: postGoogleDriveTrash, kind: "mutation" },
  "GET /api/content/google/gmail/messages": { handler: getGoogleMail, kind: "read" },
  "GET /api/content/google/gmail/message": { handler: getGoogleMailMessage, kind: "read" },
  "POST /api/content/google/gmail/draft": { handler: postGoogleMailDraft, kind: "mutation" },
  "POST /api/content/google/gmail/send": { handler: postGoogleMailSend, kind: "mutation" },
  // Answering INSIDE a conversation, and filing one under a label. The reply
  // door demands the mail switch exactly as the send door does — it sends.
  "POST /api/content/google/gmail/reply": { handler: postGoogleMailReply, kind: "mutation" },
  "POST /api/content/google/gmail/label": { handler: postGoogleMailLabel, kind: "mutation" },
  "GET /api/content/google/calendar/events": { handler: getGoogleEvents, kind: "read" },
  "POST /api/content/google/calendar/events": { handler: postGoogleEvent, kind: "mutation" },
  // The four questions a person asks about an entry that already exists — what it
  // says and when, who is coming, where it is, and whether it is happening at all.
  // Four doors because a person changes one at a time, and because only one of
  // them puts something in a third party's inbox (routes/google.ts says more).
  "POST /api/content/google/calendar/event/update": { handler: postGoogleEventUpdate, kind: "mutation" },
  "POST /api/content/google/calendar/event/guests": { handler: postGoogleEventGuests, kind: "mutation" },
  "POST /api/content/google/calendar/event/location": { handler: postGoogleEventLocation, kind: "mutation" },
  "POST /api/content/google/calendar/event/cancel": { handler: postGoogleEventCancel, kind: "mutation" },
  // What was SAID in the meeting, reached from the meeting — Meet files its
  // transcript as an ordinary Doc, so until now you had to already know which one.
  "GET /api/content/google/calendar/event/transcript": {
    handler: getGoogleEventTranscript,
    kind: "read",
  },
  // FROM kwapso TO Google: a sprint's dates as a calendar entry, and the meeting
  // door beside it — the two halves of "what we book here shows up there".
  "POST /api/content/google/calendar/sprint": { handler: postGoogleSprintEvent, kind: "mutation" },
  // …and the second half of that sentence, now that a meeting is a row. It moves
  // the MEETING (it remembers the entry it became) as well as the connection, so
  // it publishes twice — once for each screen that just went stale.
  "POST /api/content/google/calendar/meeting": { handler: postGoogleMeetingEvent, kind: "mutation" },
  // Which spaces are there at all — the question that had no answer while a space
  // could only be read by naming one you already knew. Reading the LIST is not
  // reading what is in them; the messages door still refuses an unnamed space.
  "GET /api/content/google/chat/spaces": { handler: getGoogleChatSpaces, kind: "read" },
  "GET /api/content/google/chat/messages": { handler: getGoogleChat, kind: "read" },
  "POST /api/content/google/chat/messages": { handler: postGoogleChat, kind: "mutation" },
  // …and taking one back, for the same reason the Drive bin exists.
  "POST /api/content/google/chat/delete": { handler: postGoogleChatDelete, kind: "mutation" },
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    const route = `${request.method} ${pathname}`

    try {
      if (route === "GET /api/content/health") return json({ ok: true })
      const def = ROUTES[route]
      if (!def) return fail(404, "not_found", "No such content action.")
      return await def.handler(request, env)
    } catch (e) {
      if (e instanceof GuardError) return fail(e.status, e.code, e.message)
      console.error("content worker error:", e)
      // Record the crash in the central error log (core DB) — best-effort,
      // never blocks the response. Clean GuardError refusals never reach here.
      await recordWorkerError(env.DB, "content", `${request.method} ${new URL(request.url).pathname}`, e, requestId(request))
      const message = e instanceof Error ? e.message : ""
      if (message.startsWith("cloud_key_missing:"))
        return fail(503, "cloud_key_missing", `${brand.name}'s cloud key isn't set up yet — content is paused.`)
      // Set, but no longer ours — see d1-rest.ts.
      if (message.startsWith("cloud_key_rejected:"))
        return fail(503, "cloud_key_rejected", `${brand.name} can't reach its databases right now. You're still signed in — this is our end, and we're on it.`)
      return fail(500, "internal", "Something went wrong on our side. Try again.")
    }
  },

  /** THE KNOWLEDGE SWEEP — every 15 minutes, per team, bounded.
   *
   * WHY A CRON AT ALL, when every write already re-indexes what it touched: a
   * mirrored source follows a row this worker does not own the only copy of
   * (a ticket edited through the agent, a row that arrived by import), and an
   * event that is missed is missed forever. A sweep with a cursor cannot miss;
   * it can only be late, and late is the failure mode §3 says is survivable
   * ("an hour behind breaks nothing important").
   *
   * ACTS ON A TEAM, NOT AS A PERSON. There is no caller here, so there is no
   * permission to act under — and the guard it builds is deliberately not a
   * person: `userId` is a value no user row can hold, so if any future read on
   * this path grew the personal fence (`owner_user_id = ?`), it would match
   * NOTHING rather than one unlucky member's private material. Fail-closed by
   * construction, not by remembering.
   *
   * R12: every failure is recorded — per team, so one broken database cannot
   * hide the rest, and the sweep goes on to the next one. */
  async scheduled(controller, env): Promise<void> {
    // TWO CRONS, ONE HANDLER. The sweep runs every fifteen minutes and the digest
    // once a morning, so the tick tells us which job it is. Branching on the
    // EXPRESSION rather than on a clock reading is what keeps that honest: "is it
    // about 7am?" is a question with a different answer in every timezone and a
    // wrong one whenever a tick is late.
    if (controller.cron === DIGEST_CRON) return morningDigest(env, controller.scheduledTime)
    let teams: { id: string; database_id: string }[] = []
    try {
      // Bounded like every other read (R14), and ROTATING — see teamSlice. A cron
      // that would run for an hour is a cron that gets killed halfway with nothing
      // recorded; past the ceiling the remaining teams wait for a LATER tick, and
      // each one resumes from its own kind's cursor when its window comes round.
      teams = await teamSlice(env, controller.scheduledTime, SWEEP_EVERY_MS, "knowledge sweep")
    } catch (e) {
      console.error("knowledge sweep: could not list teams:", e)
      await recordWorkerError(env.DB, "content", "cron/knowledge-sweep", e)
      return
    }

    for (const team of teams) {
      try {
        const guard = {
          userId: "system:knowledge-sweep",
          teamId: team.id,
          roleId: "system",
          databaseId: team.database_id,
        }
        const results = await sweepAll(env, d1ConfigFrom(env), guard)
        const indexed = results.reduce((n, r) => n + r.indexed, 0)
        if (indexed > 0) await publishChange(env, team.id, "knowledge")
        // A kind that failed recorded itself on its own row (knowledge_ingest);
        // it is recorded HERE too, because that row is only read by someone who
        // already suspects something, and the 90-day error log is where anyone
        // looks when they don't.
        for (const r of results)
          if (r.error)
            await recordWorkerError(
              env.DB,
              "content",
              `cron/knowledge-sweep (${team.id}/${r.kind})`,
              new Error(r.error)
            )
      } catch (e) {
        console.error(`knowledge sweep failed for team ${team.id}:`, e)
        await recordWorkerError(env.DB, "content", `cron/knowledge-sweep (${team.id})`, e)
      }
    }
  },
} satisfies ExportedHandler<Env>

/** THE MORNING DIGEST (.plans/BUILD-1 §6 and §5, in one send).
 *
 * ONE MESSAGE PER TEAM, to the person whose week it is: what has been sitting
 * unread past three days, and — on a Monday — who logged no time last week. Two
 * nudges in one envelope, because the second thing that arrives in the same
 * inbox on the same morning is the one people start filtering.
 *
 * NOTHING CLIENT-FACING. A ticket that has been sitting is our failure, not the
 * client's business, and telling them would turn an internal prompt into an SLA
 * nobody promised (§6 is explicit). Every recipient comes off the team's own
 * membership.
 *
 * ACTS ON A TEAM, NOT AS A PERSON — the same guard shape the knowledge sweep
 * uses, and for the same reason: `userId` is a value no user row can hold, so a
 * read that ever grew a personal fence would match NOTHING rather than one
 * unlucky member's private material. Fail-closed by construction.
 *
 * R12: every failure is recorded, per team, and the loop goes on to the next one.
 * Unattended work has nobody watching. */
async function morningDigest(env: Env, scheduledTime: number): Promise<void> {
  let teams: { id: string; database_id: string }[] = []
  try {
    // Bounded like every other read (R14), and ROTATING — see teamSlice. It used
    // to say "past this ceiling the rest wait for tomorrow", and tomorrow read the
    // same first 200 teams: every tenant past the 200th oldest never received a
    // digest at all.
    teams = await teamSlice(env, scheduledTime, DIGEST_EVERY_MS, "morning digest")
  } catch (e) {
    console.error("morning digest: could not list teams:", e)
    await recordWorkerError(env.DB, "content", "cron/morning-digest", e)
    return
  }

  const now = new Date()
  // MONDAY decides whether the weekly half rides along. getUTCDay() is 1 on
  // Monday; the digest is a UTC job, like the cron that fires it.
  const isMonday = now.getUTCDay() === 1
  const cfg = d1ConfigFrom(env)

  for (const team of teams) {
    try {
      const guard = {
        userId: "system:morning-digest",
        teamId: team.id,
        roleId: "system",
        databaseId: team.database_id,
      }
      const [onDuty, waiting, members] = await Promise.all([
        dutyFor(cfg, guard, now),
        needsTriage(cfg, guard, now),
        teamMemberNames(env, team.id),
      ])
      const missingTime = isMonday ? await loggedNothingLastWeek(cfg, guard, now, members) : []
      // The person on duty, or — when nobody has been named — everybody, because
      // a backlog with no owner is worse than a slightly noisy morning, and the
      // mail's own footnote asks them to fix exactly that.
      const to = onDuty
        ? members.filter((m) => m.userId === onDuty.userId)
        : members
      await sendTriageDigest(env, team.id, to, {
        waiting: waiting.total,
        oldestDays: waiting.waiting[0]?.days ?? 0,
        onDutyName: onDuty?.userName ?? null,
        missingTime,
      })
    } catch (e) {
      console.error(`morning digest failed for team ${team.id}:`, e)
      await recordWorkerError(env.DB, "content", `cron/morning-digest (${team.id})`, e)
    }
  }
}
