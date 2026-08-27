// Shared contract between the workers (who produce these) and the web app
// (who consumes them). ONE master copy — never redeclare these shapes.

// The one import this file makes, and it is the reason the rule above holds: a
// savings figure has a shape, and that shape lives beside the arithmetic that
// produces it (shared/workers/savings.ts). Re-declaring `ProcessSaving` here to
// keep the file import-free would be the exact duplication this file exists to
// prevent — and the copy that drifts would be the one describing money.
import type { ProcessSaving } from "./workers/savings"

/** A signed-in person, as the auth worker returns them to the browser. */
export type SessionUser = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  imageUrl: string | null
  /** true once the onboarding screen (name + optional photo) is completed */
  onboardingComplete: boolean
  /** the team this person is currently working in (one at a time, locked) */
  currentTeamId: string | null
  /** The team this SESSION is locked to, or null for an ordinary browser session.
   * Only auth's internal `/internal/mcp-session` bridge mints a pinned session, and
   * only for a verified personal access token — so a non-null value is the one
   * unspoofable statement that the caller on the other end is a MACHINE. It travels
   * with `/api/auth/me`, which is how a downstream worker can tell a token's call
   * from a person's without inventing a header a browser could also send. */
  pinnedTeamId: string | null
  /** The language this person reads kwapso in, or null if they never chose.
   *
   * It rides on the session for the same reason `currentTeamId` does: every
   * worker already resolves the caller through `whoAmI`, so a refusal message,
   * an email and the assistant's prose can all be composed in the reader's own
   * language without a single door looking it up — and none of them can disagree
   * about it. Null means English (shared/i18n.ts `toLanguage`), kept distinct
   * from a deliberate choice of English so that only the un-chosen could ever be
   * guessed at from a browser header. */
  language: string | null
  /** HOW BIG THIS PERSON WANTS THE APP. One of SCALE_STEPS (shared/scale.ts).
   * Null means never chosen, which reads as comfortable — kept distinct from a
   * deliberate choice of comfortable for the same reason `language` is. It sits
   * on the session rather than in one browser's storage so it follows the person
   * between devices, and because the viewport is locked against pinch-zoom this
   * is the only way anybody can make the app bigger (UI-RULEBOOK S4, S5). */
  scale: string | null
}

/** One team as the tenancy worker lists them for the signed-in person. */
export type TeamSummary = {
  id: string
  name: string
  logoUrl: string | null
  /** the member_roles row id (inside the team's own database) this person holds */
  roleId: string
  /** creating | ready | failed — a team is usable once 'ready' */
  dbStatus: string
  /** THE AGENCY'S OWN DETAILS (db/core/0025) — the four facts a business owner
   * reaches for when an invoice, a contract or a client's supplier form asks.
   * `legalName` is what goes on a contract, which is often not the short name in
   * the rail; `legalNumbers` is one block of text on purpose, because which
   * numbers a business carries is a fact about its country. All four null until
   * somebody fills them in. */
  legalName?: string | null
  legalAddress?: string | null
  legalNumbers?: string | null
  phone?: string | null
}

/** One member of a team — membership (per-team) joined with identity (global,
 * read fresh from the users table) and their role title (from the team's DB). */
export type TeamMember = {
  userId: string
  email: string
  firstName: string | null
  lastName: string | null
  imageUrl: string | null
  roleId: string
  roleTitle: string
  /** true if this is the signed-in viewer */
  isYou: boolean
  /** true if they hold the team's locked Admin role */
  isAdmin: boolean
  /** TRUE IF THIS IS A CLIENT LOGIN, NOT ONE OF OURS.
   *
   * A portal login is an ordinary team member — grant → invite → accept is the
   * only way to make a working one — so a client contact has always been in this
   * list, and therefore in every dropdown built from it. That is right for the
   * admin screens (they are a member; somebody has to be able to see and remove
   * them) and wrong everywhere work is handed out, which is what the front door
   * uses this to decide (web/lib/people.ts). The fact is a `portal_users` row in
   * the team's own database, the same table the account fence reads. */
  isClient: boolean
  joinedAt: string
}

/** The four access switches for one module (matches the library
 * PermissionMatrix component's RightSet). */
export type RightSet = {
  read: boolean
  create: boolean
  edit: boolean
  delete: boolean
}

/** A whole role's permission sheet: one RightSet per module key. */
export type PermissionValue = Record<string, RightSet>

/** A per-team dropdown value ("selectable data"): a `value` inside a `type` group
 * (e.g. "Video link" in "File type"). Managed on the team Settings page; powers
 * the Ticket-type / Sprint-type pickers. */
export type SelectableValue = {
  id: string
  type: string
  value: string
  isDefault: boolean
  /** false = deactivated (retired). The manager shows these greyed with an Activate
   * button; form pickers filter to active. Always present. */
  active: boolean
  /** WHAT A VALUE CARRIES BESIDES ITS WORD — all four optional, all four null on
   * most rows, and that is the point: a dropdown value is a label first.
   *
   * They arrived with the delivery catalogue (team-schema 0025), which had ten
   * rows describing how the agency runs an engagement and nowhere to put them
   * once the Delivery method page went. A sprint type was already the same idea
   * wearing a different name, so the enrichment moved onto it rather than into a
   * table of its own.
   *
   * `mark` is the type mark UI-RULEBOOK defines — one glyph where an icon sits,
   * never in a sentence. `nameDe` is a curated label for readers of German, not
   * a translation seam: everything else the app says is translated at build time
   * from the string catalogue. `standardDays` is a suggested length, never a
   * rule — a sprint's dates are the ones somebody agreed with the client. */
  mark: string | null
  nameDe: string | null
  description: string | null
  standardDays: number | null
  /** WHO WROTE THE WORD, AND WHEN — read by the SINGLE-ROW door only.
   *
   * Optional because the LIST door does not select them, and that is the
   * decision rather than an oversight: the record footer is the one place that
   * asks, so putting two more columns on the list would carry them for every
   * value on every read to answer a question no row in a list is asking. A list
   * row therefore has them absent; a row read through `selectableOne` has them. */
  createdAt?: string | null
  createdByName?: string | null
}

/** A role's permission matrix as the tenancy worker returns it: the module rows
 * (key + label), the saved value, the role title, and whether it's the locked
 * Admin role (shown view-only). */
export type RolePermissions = {
  modules: { key: string; label: string }[]
  value: PermissionValue
  isDefault: boolean
  title: string
  /** whether the signed-in viewer may edit roles (member_roles:edit) — drives
   * the screen's edit-vs-view mode and whether Save shows. */
  canEdit: boolean
}

/** One invite to a team. `status` is the display status — "pending" past its
 * expiry is reported as "expired"; an admin-cancelled one is "revoked". */
export type Invite = {
  id: string
  email: string
  roleId: string
  roleTitle: string
  status: "pending" | "accepted" | "revoked" | "expired"
  createdAt: string
  expiresAt: string
}

/** An invite the signed-in person has RECEIVED (matched by their email) — for
 * the invites inbox. Read from the global invite_index + teams row, so it
 * works for ANY signed-in user without opening a team database. */
export type ReceivedInvite = {
  id: string
  teamId: string
  teamName: string
  teamLogoUrl: string | null
  roleId: string
  createdAt: string
  expiresAt: string
}

/** The per-team invite_logs audit for ONE invite (M4) — surfaced on the invite
 * detail beside the routing data. The inviter snapshot is FROZEN at invite time
 * (it won't change if the inviter later edits their profile). */
export type InviteAudit = {
  inviterName: string | null
  inviterEmail: string | null
  inviterImageUrl: string | null
  /** did the invitee already have an account when invited? */
  inviteeHasAccount: boolean
  accepted: boolean
  acceptedAt: string | null
  shelfLifeHours: number
}

/** One role in a team (from the team's own member_roles table). */
export type TeamRole = {
  id: string
  title: string
  description: string | null
  /** the locked Admin role (cannot be edited or deleted) */
  isDefault: boolean
  /** how many active members currently hold this role */
  memberCount: number
  /** false = deactivated (kept, never deleted; holders keep their access) */
  active: boolean
  /** the audit block, for the detail Overview tab (same shape every record shows) */
  createdAt?: string | null
  createdByName?: string | null
  updatedAt?: string | null
  editedByName?: string | null
}

/** The signed-in person's current working context — powers the app shell. */
export type ActiveContext = {
  /** the team you're currently working in (null only if you have no teams) */
  team: TeamSummary | null
  /** your role in that team (id + title, read from the team's own database) */
  role: { id: string; title: string } | null
  /** how many active members the current team has */
  memberCount: number
  /** every team you belong to — feeds the team switcher */
  teams: TeamSummary[]
}

/** One row of a record's Activity tab (and the team-wide feed). The same row
 * surfaces in the team / user / role scopes by the relation it carries. */
export type ActivityItem = {
  id: string
  /** short type, e.g. "Member role changed" */
  type: string
  /** the human sentence shown in the feed */
  description: string
  /** who did it (name snapshot), or null if unknown */
  actorName: string | null
  createdAt: string
}

/** A team's Overview-tab metadata (who made it + when). */
export type TeamMeta = {
  name: string
  createdAt: string
  creatorName: string | null
  creatorEmail: string | null
  updatedAt: string | null
}

/** Every /api error body looks like this. */
export type ApiError = {
  error: string
  /** plain-English message safe to show the user */
  message: string
}

/* ----------------------------- next-build modules ----------------------------- */

/** THE ticket lifecycle — the one list, for every side of the app. The server
 * validates against it, the stepper renders from it, and the agent's tool
 * descriptions name it. It was written out four times over; a fifth status was
 * four edits and TypeScript caught none of them. Now it's one edit.
 *
 * A STATUS IS A FACT, NOT A BUTTON (the tester's sentence, 17 Aug 2026). Five of
 * these seven are now reached by something HAPPENING rather than by somebody
 * choosing them, and the two that a person does reach are doors of their own
 * with their own words, not a dropdown:
 *
 *   awaiting_validation  the client's main stakeholder has not said yes yet, and
 *                        only for the kinds that wait (Aurora's ap2: extras,
 *                        requests and feedback wait; questions and issues go
 *                        straight in). Set by `createTicket`, cleared by
 *                        `/help/validate`;
 *   new                  raised, nobody here has read it;
 *   triaged              somebody on duty read it (`/help/triage-read`);
 *   scheduled            work exists AND some of it is in a sprint — flipped by
 *                        lib/ready-flip `scheduledFlip`;
 *   in_progress          a timer started on the ticket or on one of its stories
 *                        — flipped by lib/ready-flip `progressFlip`;
 *   ready                every story closed — flipped by `readyFlipForTicket`;
 *   resolved             a PERSON sent the answer (`/help/resolve`), which is
 *                        refused until a resolution is written.
 */
export const HELP_STATUSES = [
  "awaiting_validation",
  "new",
  "triaged",
  "scheduled",
  "in_progress",
  "ready",
  "resolved",
] as const
export type HelpStatus = (typeof HELP_STATUSES)[number]

/** THE KINDS THAT WAIT FOR THE CLIENT TO CONFIRM (Aurora's ap2, over the owner's
 * "everything waits"). Matched case-insensitively against the team's OWN editable
 * `Ticket type` vocabulary — the words are a team's to rename, and a rule that
 * hard-matched the seeded spelling would silently stop waiting the day somebody
 * typed "Requests". A question or an issue is somebody stuck; making them ask
 * their own colleague for permission first is the version of this rule that gets
 * the feature switched off. */
export const VALIDATED_TICKET_TYPES = ["extra", "request", "feedback"] as const

/** Does a ticket of this type wait for the account's main stakeholder? */
export function ticketTypeWaitsForValidation(helpType: string | null | undefined): boolean {
  if (!helpType) return false
  const word = helpType.trim().toLowerCase().replace(/s$/, "")
  return (VALIDATED_TICKET_TYPES as readonly string[]).includes(word)
}

/** The states a ticket is NOT yet finished in — "still ours to do something
 * about". Derived from the one list above rather than retyped, so a sixth state
 * cannot be added and silently left out of the sentence that matters most.
 * `ready` counts as unfinished: every story is done, but nobody has told the
 * client yet, and that telling is the resolution. */
export const OPEN_HELP_STATUSES = HELP_STATUSES.filter((s) => s !== "resolved")

/** A support ticket (team-wide; the My/All tabs filter by raiser). The built-in
 * `status` is the source of truth; `helpType` is a cosmetic selectable value. */
export type HelpTicket = {
  id: string
  helpType: string | null
  description: string
  screenRecordingLink: string | null
  sourceScreen: string | null
  status: HelpStatus
  resolved: boolean
  resolvedAt: string | null
  /** THE NUMBER THE CLIENT QUOTES (SCOPE ch.02, "BERG-T0412") — the account's own
   * short code, a T, and a sequence counted PER ACCOUNT. Null on a ticket with no
   * client, or one whose client has no code yet: a reference nobody can say out
   * loud is worse than none, because it looks like it means something. */
  ref: string | null
  /** WHERE THE PERSON PUT IT. Drag-rank is the only priority signal in the
   * product (SCOPE ch.07 — there is no priority dropdown and there will not be
   * one), so this is the list's order, not a tiebreak. A sparse text key: see
   * shared/workers/rank.ts. */
  rank: string | null
  /** WHEN WE FIRST READ IT. Until this is set the account still owns the wording
   * and may edit it; after, the record of what they asked for holds still while
   * the conversation about it moves. Null = nobody here has touched it yet. */
  lockedAt: string | null
  /** Put away without being lost (the glossary's Archive). Null = live. */
  archivedAt: string | null
  /** BOTH TITLES, never one overwriting the other. 788 of the tickets arriving
   * from Glide exist only in German; a translation SETS `titleEn` and leaves
   * `titleDe` exactly as the person wrote it. */
  titleDe: string | null
  titleEn: string | null
  /** OUR UNSENT WORKING TEXT — what we will tell them when the request is
   * answered, assembled from each story's closing note as the work finishes so
   * nobody is composing from a blank page at the end of a fortnight.
   *
   * Null on the way OUT to a client login, always. It is a draft: half of it may
   * be wrong, and all of it is written in the register colleagues use with each
   * other. The resolution the client reads is the one a person SENDS. */
  draftResolution: string | null
  /** HOW MUCH WORK IS ON IT, and nothing else about that work. "3 pieces of
   * work, 1 done" is exactly what a client is shown (.plans/BUILD-1 §7) — never
   * a title, an assignee or a date, because those are the answer to "which staff
   * member is doing it" (SCOPE ch.06). Staff read the same two numbers and click
   * through to the backlog for the rest. */
  storyCount: number
  doneStoryCount: number
  /** Who raised it, and who last touched it. All three are null on the way OUT,
   * and only to a client login, when the person is on the AGENCY's side of the
   * fence — SCOPE ch.06, "the portal shows work status but never which staff
   * member is doing it". See toTicket in workers/content/src/lib/help.ts. */
  raiserId: string | null
  raiserName: string | null
  editorName: string | null
  createdAt: string
  updatedAt: string | null
  /** The account this question was raised FOR — the company a client contact was
   * standing in when they asked. `null` on the agency's own tickets. It is what
   * the account fence reads, and what a live ping carries so a colleague's
   * question can reach their screen without reaching anyone else's. */
  accountId: string | null
  /** WHICH SYSTEM IT IS ABOUT (CHECKLIST 5.8). A request that names no app is a
   * request nobody can route: the app is what says whose work it is, which
   * sprint it could be scheduled into, and who the stakeholder to tell is. */
  appId: string | null
  appName: string | null
  /** WHICH SECTION OF THAT APP (Aurora, 19 Aug 2026: "please implement MODULES
   * under apps, so i can group all the tickets I am creating in an organized
   * way"). 94% of the 1,820 tickets in the legacy data carried one, which is why
   * the form asks for it rather than hoping triage adds it later.
   *
   * The NAME and the MARK ride the row (R35) — a ticket list shows the section
   * with its emoji, and never a bare id it would have to go and resolve. */
  moduleId: string | null
  moduleName: string | null
  moduleMark: string | null
  /** WHO ASKED (CHECKLIST 5.9) — the CONTACT, a person row on the account, not
   * the login that typed it. Staff raise most of a client's history on their
   * behalf, so "who raised it" and "who typed it" are different people and the
   * record has to be able to say both. */
  raisedByContactId: string | null
  raisedByContactName: string | null
  /** WHEN THE CLIENT'S MAIN STAKEHOLDER CONFIRMED THEY WANT IT. Only the kinds
   * that wait ever carry one (see `ticketTypeWaitsForValidation`); null on a
   * ticket that never had to wait, which is why the STATUS and not this column
   * is what a screen reads. */
  validatedAt: string | null
}

/** A FILE OR A LINK ON A TICKET (CHECKLIST 5.10) — several of each, from either
 * front door. One row shape for both, because "here is the thing I mean" is one
 * act: a `file` carries the R2 key we stored it under, a `link` carries only a
 * URL. Deactivate-never-delete, like everything else here. */
export type HelpAttachment = {
  id: string
  ticketId: string
  kind: "file" | "link"
  /** what a person reads in the list — the file's name, or the link's label */
  label: string
  /** the file's key inside the tickets bucket, or the link's URL */
  url: string
  contentType: string | null
  sizeBytes: number | null
  createdAt: string
  /** null on the way OUT to a client login when the person is on the agency's
   * side of the fence — the same redaction `toTicket` makes about a raiser. */
  addedByName: string | null
}

/** ONE THING A STORY SHOWS FOR ITSELF — a file in the shared media bucket, or a
 * link somebody pasted. The same shape `HelpAttachment` has one table along, and
 * for the same reasons: "here is the thing I mean" is one act, and `kind` decides
 * only how `url` is read. */
export type StoryAttachment = {
  id: string
  storyId: string
  kind: "file" | "link"
  /** what a person reads in the list — the file's name, or the link's label */
  label: string
  /** the file's key inside the shared media bucket, or the link's URL */
  url: string
  contentType: string | null
  sizeBytes: number | null
  createdAt: string
  addedByName: string | null
}

/** One reply on a ticket. `isAgent` marks the AI-drafted first reply; a mention
 * is notification-only (every member can see every ticket via the All tab).
 *
 * `authorId` and `authorName` are BOTH nullable because the wire is where staff
 * anonymity is kept (SCOPE ch.06): to a client login, a reply written on the
 * agency's side of the fence arrives with no id and no name. Nulling only the
 * name left a stable per-person handle in the payload — a pseudonym, which is
 * anonymity right up until one email addresses the same person by name. */
export type HelpMessage = {
  id: string
  ticketId: string
  body: string
  taggedUserIds: string[]
  isAgent: boolean
  authorId: string | null
  authorName: string | null
  createdAt: string
}

/** One stakeholder on a ticket. Origin tells the UI why they're here (and that
 * derived ones can't be removed — nothing on a ticket can). No assignee. */
export type HelpStakeholder = {
  userId: string
  name: string | null
  email: string
  imageUrl: string | null
  origin: "raiser" | "admin" | "mentioned" | "added"
}

/** A target in the owner-maintained global import catalog. */
export type ImportableTarget = {
  id: string
  tableKey: string
  displayName: string
  description: string | null
  requiredColumns: { key: string; label: string; required: boolean }[]
  active: boolean
}

/** A saved agent conversation thread (per team — the agent's memory). */
export type AgentThread = {
  id: string
  title: string | null
  lastMessageAt: string | null
  createdAt: string
}

/** One message in an agent thread. `toolCalls` records the actions the agent took
 * (and their status); `source` is in-app vs which MCP client. */
export type AgentMessage = {
  id: string
  threadId: string
  role: "user" | "assistant" | "tool"
  content: string | null
  toolCalls?: { tool: string; status: "pending" | "done" | "failed"; summary?: string }[]
  source: string | null
  createdAt: string
}

/** A team's AI quota snapshot (the credit-based model): a free daily allowance plus
 * a purchasable credit balance. `remaining` = free left today + credits; `blocked`
 * means both are exhausted (the agent warns, then hard-stops for the day). */
export type AgentQuota = {
  freeDaily: number
  freeUsedToday: number
  freeRemaining: number
  creditBalance: number
  remaining: number
  blocked: boolean
  /** TESTING ENVIRONMENTS ONLY — the daily allowance is not enforced here, so a
   * turn is never refused for running out. The counters beside this stay TRUE:
   * `freeUsedToday`, the credit balance and the usage log all keep recording, so
   * what a team costs is still answerable. Only the REFUSAL is off.
   *
   * A boolean beside the number rather than a very large `freeDaily`, for the
   * reason the whole codebase prefers `hasMore` / `complete` / `totalCapped`: a
   * sentinel value has to be recognised to be understood, and anything that
   * doesn't recognise it renders "999,975 of 1,000,000 free left today" to a
   * person. A flag is either read or ignored, and ignoring it is safe here —
   * `blocked` is already false. */
  unlimited: boolean
}

/** One row of the agent usage log — a plain trail of what the AI did, one per turn.
 * `credits` = AI units the turn consumed; `source` = where they came from; `summary` =
 * the user's message, trimmed. Newest-first; team-scoped. */
export type UsageLogRow = {
  id: string
  createdAt: string
  actorName: string | null
  credits: number
  source: "free" | "credit" | "mixed"
  summary: string
  /** what the summary IS: an action taken (team-visible) or the author's prompt
   * (their own). NULL on back-filled rows → treated as private. */
  kind?: "action" | "prompt" | null
}

/** One column an import maps a file onto (matches a catalog target's columns). */
export type ImportColumn = { key: string; label: string; required: boolean }

/* ---- Agentic multi-file import (AGENTIC-IMPORT.md) ---- */

/** The safe, fixed vocabulary of per-column normalizers the agent may pick from
 * (no arbitrary code runs — a transform key maps to a pure function). */
export type TransformKey = "trim" | "titlecase" | "lowercase" | "uppercase" | "iso_date" | "boolean"

/** One file's step in the plan: which target it feeds, how its columns map, the
 * chosen normalizations, the references it carries, and a reject prediction. */
export type ImportPlanStep = {
  fileId: string
  fileName: string
  target: string
  targetName: string
  mapping: Record<string, string | null> // our column key → their header (null = unmapped)
  transforms: Record<string, TransformKey> // our column key → normalizer
  references: { column: string; target: string; mode: "id" | "value" }[]
  rowCount: number
  predictedRejects: number
  /** The predicted rejections themselves (row + reason), computed from the file's
   * ROWS at plan time so a bad file is visible BEFORE running — capped in size (the
   * count above is always the full number). Uses the same scan as execution, so the
   * plan never over- or under-promises what the run will do. */
  predictedRejections?: ImportRejection[]
  notes?: string
}

/** The reviewable plan: the ordered steps + any warnings (cycle, unknown target…). */
export type ImportPlan = {
  order: string[] // tableKeys, dependency order (parents first)
  steps: ImportPlanStep[] // one per file, already in run order
  warnings: string[]
  bySource: "agent" | "fallback" // did the model plan it, or the deterministic fallback?
}

export type ImportRejection = { file: string; row: number; reason: string }

/** The per-target tally + every rejected row's reason, produced by execution. */
export type ImportBatchReport = {
  perTarget: { target: string; targetName: string; created: number; skipped: number; failed: number }[]
  created: number
  skipped: number
  failed: number
  rejections: ImportRejection[]
}

/** The whole batch as the wizard sees it (files + plan + report + status). */
export type ImportBatchView = {
  id: string
  status: string
  files: { fileId: string; name: string; headers: string[]; rowCount: number }[]
  plan: ImportPlan | null
  report: ImportBatchReport | null
  createdAt: string
}

/** One line of the team's import HISTORY (who ran what, when, into which tables,
 * with the totals) — summaries only, never row contents. */
export type ImportBatchSummary = {
  id: string
  status: string
  by: string
  at: string
  completedAt: string | null
  files: { name: string; rowCount: number }[]
  targets: string[]
  created: number
  skipped: number
  failed: number
}

/** One personal access token (the MCP front desk) as the settings screen sees it. */
export type McpTokenSummary = {
  id: string
  label: string
  teamId: string
  createdAt: string
  /** When it stops working (every token has a deadline — core migration 0016). */
  expiresAt: string | null
  lastUsedAt: string | null
  revokedAt: string | null
}

/** One action the agent proposes that needs the user's confirmation before it runs.
 * `summary` is the one-line label; `details` is the PAYLOAD behind it — the body
 * the gated door will receive, in plain lines (shared/workers/confirm-payload.ts).
 * Both are built by the one `pendingCall` seam: a confirm you cannot read is not
 * a confirm, so the panel never shows the label without what it will do. */
export type PendingCall = {
  name: string
  input: Record<string, unknown>
  summary: string
  details: string[]
}

/** The result of one agent chat turn: a finished reply, or a pause for confirmation. */
export type ChatOutcome =
  | { done: true; threadId: string; reply: string; quota: AgentQuota; overQuota?: boolean }
  | {
      done: false
      threadId: string
      assistantText: string
      needsConfirm: PendingCall[]
      quota: AgentQuota
    }

/** One event on the agent's SSE stream (wire format: `data: <json>\n\n`). Keys are
 * terse + stable. `text` + `step_*` may repeat any number of times; exactly ONE terminal
 * event (confirm | final | error) ends every stream. EVERYTHING the assistant says
 * arrives as `text` events (streamed deltas, or one chunk for a non-streaming model /
 * a server note) — `final` only settles the turn (thread/quota/reply fallback), so the
 * client renders the accumulated text and never loses an earlier explanation. The
 * `summary` on step_* uses the same name-resolved logic as the confirm-panel summaries. */
export type StreamEvent =
  /** append this delta to the current assistant reply bubble (word-by-word). */
  | { t: "text"; d: string }
  /** a tool is about to run (human, id→name-resolved summary). */
  | { t: "step_start"; tool: string; summary: string; ids?: Record<string, string> }
  /** that tool finished — ok true, or false on failure (`error` = the door's short,
   * human reason, e.g. which permission was missing — shown on the failed step row). */
  | { t: "step_end"; tool: string; ok: boolean; summary: string; error?: string }
  /** WHAT THE ASSISTANT JUST READ OUT OF THE KNOWLEDGE BASE — Law R23 on the wire.
   *
   * Until this existed, a retrieval's citations reached the MODEL and stopped
   * there: the client is sent `step_start`/`step_end` and never a tool's result,
   * so the panel could not have drawn a source under an answer if it had wanted
   * to. This carries the answer seam's own two lists, unchanged and unassembled,
   * so the turn's citation marks and the sources under it come from the same
   * retrieval the answer was written from.
   *
   * It belongs to the turn that is streaming when it arrives, and it repeats: a
   * turn that asks two questions retrieves twice. */
  | { t: "sources"; citations: KnowledgeCitation[]; passages: KnowledgePassage[] }
  /** TERMINAL: needs confirmation; the client shows the yes/no panel. Carries the
   * `threadId` so a FIRST-turn confirm (a brand-new conversation whose opening
   * message proposes a dangerous action) can be resolved — the thread is already
   * saved server-side, but the client only learns its id from `final`, which a
   * paused turn never reaches. Without it, approve/decline no-op (dead buttons). */
  | { t: "confirm"; threadId: string; calls: PendingCall[]; text?: string }
  /** TERMINAL: run complete; carries the full ChatOutcome (reply/quota/threadId). */
  | { t: "final"; outcome: ChatOutcome }
  /** TERMINAL: something went wrong; a safe message to show. */
  | { t: "error"; message: string }

// ── The customer spine (SCOPE ch.03) ─────────────────────────────────────────
// One table for every company and every person. What the workers hand the client
// carries `id` as THE identifier and `code` as a label — never the other way
// round, on either side of the wire.

/** One account — a company (`entity`) or a person (`individual`). */
export type Account = {
  id: string
  accountType: "entity" | "individual"
  /** the account this one sits under; null at the top of its tree */
  parentAccountId: string | null
  name: string
  email: string | null
  phone: string | null
  /** THE POSTAL ADDRESS, in four fields rather than one free-text line. A
   * country typed free is a country spelled five ways, and "which city are our
   * German clients in?" is a question one text column cannot answer. `country`
   * is picked from the Country dropdown group; the other three are typed. */
  street: string | null
  postalCode: string | null
  city: string | null
  country: string | null
  /** what this company does, from the Industry dropdown group */
  industry: string | null
  /** a paragraph about them, authored as rich text (HTML) */
  about: string | null
  /** their mark, and the wide image their record leads with */
  logoUrl: string | null
  coverUrl: string | null
  /** the human reference staff assign when work starts (BERG). GENERATED, not
   * typed: the first four letters of the name, uppercased, with a numeric suffix
   * when that is already taken. Display only — every route addresses a row by
   * its ULID `id`, so re-coding an account never re-points its records. */
  code: string | null
  currency: string | null
  /** the language this account is written to. The account's own default; a
   * contact may override it, and staff switch their own. */
  locale: string | null
  timezone: string | null
  /** may this account see money figures on its own work? `null` on the way OUT
   * to a client login — the agency's own switch ABOUT them, never for them. */
  commercialsVisible: boolean | null
  /** false once archived (deactivate-never-delete) */
  active: boolean
  /** the audit block, for the detail Overview tab (the same shape every record
   * shows — see TeamRole). */
  createdAt?: string | null
  createdByName?: string | null
  updatedAt?: string | null
  editedByName?: string | null
}

/** A person's relationship to an account — the "contact of" row. */
/** THE CLIENT'S OWN ORGANISATION — who does the work at a client, what an hour
 * of them costs, and what they run on. A role exists so a step's minutes can
 * become money; a tool exists so a step that replaces one can be subtracted. */
export type ClientDepartment = {
  id: string
  accountId: string
  name: string
  active: boolean
  /** how many roles sit in it — counted by the list door in one statement, not
   * one query per row. */
  roleCount: number
}

export type ClientRole = {
  id: string
  accountId: string
  name: string
  /** What an hour costs the CLIENT, in cents. `null` is a real answer — "nobody
   * has said yet" — and is deliberately not zero, which would read as "this
   * person is free" and would come out of the arithmetic as a saving of nothing
   * with nothing to say a number was missing. */
  centsPerHour: number | null
  active: boolean
  /** SEVERAL, deliberately: "one role is doing things across multiple
   * departments, especially in slightly smaller companies" (the owner). */
  departmentIds: string[]
  /** The contacts holding it — their own `accounts` rows. There is no separate
   * person table here, because a second address book is one that goes out of
   * step with the first. */
  peopleIds: string[]
}

export type ClientTool = {
  id: string
  accountId: string
  name: string
  mark: string | null
  active: boolean
  /** The price in force on the day asked about — null when it has never been
   * priced. Read from `client_tool_prices`, never a column on the tool, which is
   * what stops the two ever disagreeing. */
  cents: number | null
  billingPeriod: "month" | "year" | null
  effectiveOn: string | null
}

export type ClientToolPrice = {
  id: string
  toolId: string
  cents: number
  billingPeriod: "month" | "year"
  /** the day this price started being true */
  effectiveOn: string
}

export type AccountLink = {
  id: string
  accountId: string
  personAccountId: string
  personName: string
  relationship: string | null
  isMainStakeholder: boolean
  active: boolean
}

/** One account opened: the record, the account it sits under, the people linked
 * to it and who can log in — plus the two EXACT server totals its tabs badge
 * (R16: a badge is a COUNT(*), never the length of a capped list). */
export type AccountDetail = {
  account: Account
  parent: Account | null
  /** the PEOPLE inside this company. Empty for a person (they are somebody's
   * contact, not somebody with contacts) and empty for any caller without
   * `contacts:read` — the address book is its own grant. */
  links: AccountLink[]
  /** the COMPANIES this person is a contact of — the same link table read from
   * the other end, which is why companies and people stayed one table: a person
   * can be a contact at two companies and a parent pointer has room for one.
   * Empty for a company. `personName` on each row carries the COMPANY's name. */
  companies: AccountLink[]
  portalUsers: PortalUser[]
  linksTotal: number
  /** the exact server COUNT(*) behind `companies` (R16) */
  companiesTotal: number
  portalUsersTotal: number
}

/** A client-side person's login. Absent = no portal access; present and inactive
 * = revoked (their records are untouched). */
export type PortalUser = {
  id: string
  accountId: string
  userId: string
  email: string | null
  /** null = the whole account's world; otherwise the Apps they're narrowed to */
  appRestriction: string | null
  grantedAt: string
  grantedByName: string | null
  active: boolean
}

/* ------------------------------ knowledge base ------------------------------ */

/** ONE SOURCE — a piece of material the assistant may read. Two families in one
 * shape: a `note` a person typed here (the body is the truth), and a MIRROR of a
 * row the app already owns (`ticket` / `account` / `app` — the row is the
 * truth and the sweep keeps the body in step). `compartment` is which slice of
 * the knowledge base it belongs to: "agency", or "account:<id>". */
export type KnowledgeSource = {
  id: string
  kind: string
  /** the table this mirrors, or null for a note somebody typed */
  originTable: string | null
  originRowId: string | null
  compartment: string
  accountId: string | null
  /** the built system, the ticket and the sprint this is about — the rest of the
   * "notebook" a question is routed by. Null where it does not apply. */
  appId: string | null
  ticketId: string | null
  sprintId: string | null
  /** when the material is FROM, which is not when it was indexed */
  recordDate: string | null
  title: string
  /** what this record is ABOUT, in a sentence or two — derived from the record
   * itself, never generated. What a list shows, and what the router searches. */
  summary: string | null
  /** the material. On a LIST this is always null (a page of 300-page contracts
   * is not a list); on a detail it is as much as a screen shows. */
  body: string | null
  /** how much material there really is. With `bodyTruncated` it is what lets a
   * screen say "the first part of 412 KB" instead of showing an excerpt as if it
   * were the document. */
  bodyBytes: number
  bodyTruncated: boolean
  sourceUrl: string | null
  /** THE FILE THIS SOURCE WAS READ FROM, when it was one (kind 'file').
   *
   * `fileUrl` is a capability URL into the agency's own media (/media/internal/,
   * served by the agency door and no other). `fileType` is the type the browser
   * declared — a LABEL for a screen, never handed to a renderer; the object
   * itself is stored with no renderable type at all.
   *
   * `fileNote` is the honest half, and the one a screen must never hide: why
   * this file's words are missing, or why there are fewer of them than the file
   * holds. `fileUrl` set with a null `body` and this note is the whole of
   * "stored, not searchable" — a state the product allows on purpose, because
   * the alternative was refusing half of what somebody has on their desktop. */
  fileUrl: string | null
  fileName: string | null
  fileType: string | null
  fileBytes: number
  fileNote: string | null
  /** WHO MAY READ THIS SOURCE, in narrowing order (12.3):
   *   "team"    — anyone who may read the knowledge base;
   *   "app"     — only the people staffed to `visibleToAppId` (plus an admin),
   *               which is the same sentence the app record itself says (8.11);
   *   "private" — only its owner.
   * Derived from the two id columns, never stored twice: "private" wins over
   * "app" when both are set, so no row can be in a state a reader has to guess. */
  visibility: "team" | "app" | "private"
  ownerUserId: string | null
  /** the app whose people may read it, or null for the whole team. NOT `appId`
   * above — that one says what a mirrored source is ABOUT and belongs to the
   * sweep, which rewrites it on every pass. */
  visibleToAppId: string | null
  /** that app's name, so a list can say whose it is without a second read */
  visibleToAppName: string | null
  indexedAt: string | null
  chunkCount: number
  /** how far through this source the indexer has got. Below `chunkCount` means
   * a large document is still going in — it is searchable as far as it got. */
  indexedChunks: number
  /** why it could not be indexed whole, in words, or null */
  indexError: string | null
  active: boolean
  createdAt: string
  creatorName: string | null
  editorName: string | null
  updatedAt: string | null
}

/** One piece of a source, as retrieval hands it back: the text, and where it came
 * from. `score` is 0…1 — the blend of the vector's similarity and the lexical
 * index's, rounded for the wire. */
export type KnowledgePassage = {
  sourceId: string
  title: string
  kind: string
  url: string | null
  /** THE RECORD THIS CAME OUT OF, as a path under the team (`tickets/<id>`).
   * A reader who disagrees with an answer has to be able to go and look at the
   * ticket, the map or the meeting itself — not only at the source row that
   * mirrors it. Null where there is no record screen to open: a note somebody
   * typed IS the record, and a document out of Drive is reached through `url`. */
  recordPath: string | null
  compartment: string
  seq: number
  text: string
  score: number
}

/** Where an answer came from. Law R23: an answer with no citation is not an
 * answer, so this list is empty exactly when `found` is false. */
export type KnowledgeCitation = {
  sourceId: string
  title: string
  kind: string
  url: string | null
  /** the record itself, one hop past the source — see `KnowledgePassage`. */
  recordPath: string | null
  /** WHAT THE LIVE ROW SAYS RIGHT NOW, read at the moment of answering rather
   * than taken from the index — so a ticket that was "in progress" when it was
   * indexed and is "done" now cannot be quoted as in progress. Null for a source
   * that mirrors nothing (a note somebody typed IS the truth). */
  liveStatus: string | null
  checkedAt: string | null
}

/** What the knowledge base answers with: the evidence, the reasoning about WHERE
 * it looked (`reason`), and — when it was asked to write one — the answer itself.
 *
 * RETRIEVAL STILL WRITES NOTHING. `answer` is composed by a model that was handed
 * exactly the `passages` and `citations` below and nothing else, and it is decided
 * in the SAME seam they are (Law R23), so it cannot exist without them. A caller
 * that did not ask for it, or a question nothing answers, gets null and the
 * evidence — which is what this type has always been. */
export type KnowledgeAnswer = {
  question: string
  found: boolean
  /** the sentence to say when there is nothing — never an invented answer */
  message: string
  /** THE WRITTEN ANSWER, or null when nobody asked for one, nothing was found, or
   * the model could not be reached. Markdown, and it may carry the app's visual
   * blocks (shared/agent-blocks.ts) — the same string shape an assistant reply is,
   * rendered by the same one renderer. Null is never an error: it means the
   * passages below are the whole answer, exactly as they were before. */
  answer: string | null
  /** the compartments searched; empty means the whole knowledge base */
  compartments: string[]
  /** WHY those compartments, in a sentence a person can disagree with */
  reason: string
  /** what the record summaries say this question is ABOUT. Evidence for the
   * reader; deliberately NOT an input to the ranking — see §3 of
   * workers/content/src/lib/knowledge.ts. */
  records: { sourceId: string; title: string }[]
  passages: KnowledgePassage[]
  citations: KnowledgeCitation[]
  /** how many chunks the search considered (the bounded candidate set) */
  candidates: number
}

// ── Process maps, versions and the money (SCOPE ch.02 · .plans/BUILD-3) ───────
// App → Process → Step, and the two rate cards. The one rule these shapes carry
// on their face: an INTERNAL number (what our own hour costs, what an app costs
// us to run, what a margin is) is a separate type from anything the client side
// can ask for — never an optional field on a shared one. See R24.

/** WHAT AN HOUR OF A ROLE COSTS (CHECKLIST 8.13). The third rate card, and the
 * second INTERNAL one: `AccountRate` is what a client is charged, `InternalRate`
 * is what a kind of our own work costs us, and this is what an hour of a KIND OF
 * PERSON is worth — the number Aurora's savings model multiplies hours by.
 *
 * Its own type rather than a flag on `InternalRate`, for the reason those two are
 * already two types: one shape with a discriminator is one wrong filter away
 * from showing a client a number about us. */
export type RoleRate = {
  id: string
  /** the role, in the team's own words. Free text: the person who does a
   * client's invoicing is THEIR bookkeeper, not one of our logins. */
  roleName: string
  centsPerHour: number
  active: boolean
  createdAt: string
  createdByName: string | null
  updatedAt: string | null
  editedByName: string | null
}

/** WHAT ONE APP HAS GIVEN BACK — hours, and what those hours are worth (8.13).
 * The money is the ONE savings seam's own arithmetic (shared/workers/savings):
 * each step's saving times the CLIENT-role rate frozen on that step — the same
 * figure the process screen shows, because for six days this panel priced a
 * SECOND way (a process-level role against the internal rate card) and the two
 * answers disagreed on the owner's own screen: €2,766.35 on the map, 0.00 one
 * tab over. One arithmetic, one seam, or the numbers stop being believable.
 * Still a staff door (the portal has its own hours-only view). */
export type AppMoneyBack = {
  appId: string
  savedSecondsPerMonth: number
  /** the sum of the priced steps only — see `unpricedProcesses`. */
  moneyCentsPerMonth: number
  /** how many processes carry NO priced step at all. Shown, never hidden: a
   * total that silently left work out is the sort of number that costs the
   * screen its credit. */
  unpricedProcesses: number
  lines: {
    processId: string
    name: string
    savedSecondsPerMonth: number
    /** null when no step is priced — distinct from "priced at zero". */
    moneyCentsPerMonth: number | null
    /** the money's own coverage: how many of this map's steps carry a rate. */
    pricedSteps: number
    totalSteps: number
  }[]
  /** R25 — the sentence the figure may not be shown without, carried on the
   * payload so the screen never assembles it. */
  caption: string
}

/** An App: the built system, the thing with its own address (SCOPE ch.02). */
export type AppRow = {
  id: string
  /** whose system it is; null is the agency's own */
  accountId: string | null
  name: string
  url: string | null
  stage: string | null
  /** THE CLIENT'S OWN MARK, as a `/media/...` path we host. An app is the one
   * record a person recognises by sight, so this is what the tile shows; where
   * it is null the tile keeps the stage mark it has always drawn. It rides for
   * every reader, staffed or not — the overview IS the picture. */
  logoUrl: string | null
  /** what it costs US to run each month, in cents. `null` on the way OUT to a
   * client login — an internal number, withheld on the row (see listApps). */
  toolCostCentsPerMonth: number | null
  // ── THE FOUR CONTEXT FIELDS ────────────────────────────────────────────────
  // What the system is, the situation it was built into, what we did about it,
  // and who actually uses it. Prose, all four — they are what somebody joining
  // the account reads first, and what the assistant answers "what is this app
  // for?" out of. They ride on the LIST row rather than a detail door because
  // the apps set is bounded and read whole: the record is the list's own row.
  about: string | null
  clientContext: string | null
  solution: string | null
  keyActors: string | null
  /** WHETHER THIS READER MAY OPEN IT (8.11). Everyone sees an app in the
   * overview; only the staff on it and an admin open its detail. False means the
   * four context fields and the address above arrived NULL because the door
   * withheld them, not because nobody has filled them in. */
  canOpen: boolean
  /** OUR people on this app, the lead first. Empty when `canOpen` is false. */
  staff: { userId: string; isLead: boolean }[]
  /** THE CLIENT's people on this app, the main one first. Each `contactId` is an
   * `accounts` row of type individual — a contact is a person's own account row
   * (there is no contacts table, and CHECKLIST 15.1 says why). */
  stakeholders: { contactId: string; isMain: boolean }[]
  active: boolean
  createdAt?: string | null
  createdByName?: string | null
  updatedAt?: string | null
  editedByName?: string | null
}

/** A DELIVERABLE: one piece of material we handed over on an app — a handover
 * doc, an API reference, a recorded walkthrough, an SOP (CHECKLIST 8.7).
 *
 * It hangs off exactly one app, always, which is why `appId` is not optional:
 * the legacy app hung them off apps too, and a handover doc with no system to
 * hand over is not a record anybody could file. */
export type Deliverable = {
  id: string
  appId: string
  /** whose system it was built for, copied off the app at creation and never
   * edited — the account fence, ready, on a module no client door names yet. */
  accountId: string | null
  title: string
  /** the word the card shows in small caps (VIDEO, SOP). A dropdown value from
   * the team's own "Deliverable kind" vocabulary, so it grows. */
  kind: string | null
  /** the day it was handed over, written YYYY-MM-DD. */
  datedOn: string | null
  /** THE MATERIAL: an object we host (a /media/internal/… URL the upload door
   * minted) or a link we do not (a Loom recording, a Google Doc, an API
   * reference). One field for both shapes — "here is the thing I mean" is one
   * act, and two fields would be two ways to be wrong about which is set. */
  url: string | null
  /** the picture worth showing on the card, when there is one. */
  imageUrl: string | null
  /** WHEN THIS WAS MADE VISIBLE TO THE CLIENT, or null — which is the default and
   * the safe state (Client visibility, glossary). A moment rather than a flag so
   * the client's own screen can say since when; WHO turned it on is a line in the
   * record's history, not a second copy on the row. */
  visibleToClientAt: string | null
  active: boolean
  createdAt: string
  creatorName: string | null
  updatedAt: string | null
  editorName: string | null
}

/** ONE DELIVERABLE, AS THE CLIENT SEES IT — a different shape from `Deliverable`
 * on purpose, and the shape is half the fencing.
 *
 * What is missing is the point. No `creatorName` or `editorName`: SCOPE ch.06 is
 * that the portal shows the work and never which staff member is doing it, and a
 * shape with nowhere to put a name cannot leak one by a later careless mapper.
 * No `active`: an archived deliverable is simply absent, not present-and-faded,
 * because "we put this away" is our word about our own shelf. No
 * `visibleToClientAt` as a switch either — every row the client can read is
 * visible by construction, so it travels as `sharedOn`, which is a date they can
 * be told rather than a state they could infer things from.
 *
 * `appName` rather than `appId` alone: a client reads their handover material by
 * the system it belongs to, and an id is not a thing anybody recognises. */
export type ClientDeliverable = {
  id: string
  appId: string
  appName: string | null
  title: string
  kind: string | null
  datedOn: string | null
  url: string | null
  imageUrl: string | null
  /** the day the agency made it visible to them (`visible_to_client_at`). */
  sharedOn: string
}

/** One process in a list: what it is, and how much of it there is. */
/** A MODULE — one section of an app, and the thing a ticket says it is about.
 *
 * The two trees this product keeps apart meet on the app and nowhere else: an
 * ACCOUNT has processes (how the client's business works, versioned, what every
 * saving is drilled through), and an APP has modules (how the software we built
 * is divided — Settings, Documents, Tasks). A ticket carries a module because a
 * ticket is about a screen. A saving carries a process because a saving is about
 * a job of work. Nothing joins them, on purpose.
 *
 * `mark` and `nameDe` mirror `selectable_data`'s enrichment columns so a module
 * is edited with the same affordances as any other vocabulary — an emoji and a
 * German name — without being a team-wide vocabulary, which it cannot be: 124 of
 * the 160 distinct names in the legacy data belong to exactly one app. */
export type AppModule = {
  id: string
  appId: string
  appName: string
  accountId: string | null
  name: string
  /** the emoji shown beside the name, as on a dropdown value */
  mark: string | null
  /** the German name, for a client whose account reads in German */
  nameDe: string | null
  description: string | null
  /** WHAT THIS SECTION GIVES THE CLIENT — carried over from the legacy data,
   * where every module named its own benefit ("Time savings, transparency, and
   * automated monitoring"). Not shown on a picker; it is what a handover
   * document is written from. */
  benefit: string | null
  /** open tickets filed against this module */
  ticketCount: number
  active: boolean
  createdAt: string
}

export type ProcessSummary = {
  id: string
  appId: string
  appName: string
  accountId: string | null
  name: string
  description: string | null
  /** WHO DOES THIS WORK — the role whose hours the saving is measured in
   * (CHECKLIST 8.13). Free text against the team's own words: the person who
   * does a client's invoicing is THEIR bookkeeper, not one of our logins. Null
   * until somebody says, and an app's money figure then reports this process's
   * hours with no price beside them rather than inventing one. */
  roleName: string | null
  /** WHICH of the client's roles that word now names — migration 0052 turned
   * every typed word into a record, and this is the pointer. It is the DEFAULT a
   * new step starts from (0053); a step's own role is what the money is actually
   * computed against. `roleName` stays as the word the map was mapped with. */
  roleId: string | null
  /** THE DAY THE SAVING IS MEASURED FROM. Null on a map nobody has dated, which
   * reads as the day the map was created. */
  auditDate?: string | null
  /** how many versions have been cut (1 = the baseline alone) */
  versionCount: number
  /** steps in the CURRENT version */
  stepCount: number
  active: boolean
  createdAt: string
}

/** One version of a process. v1 is the pre-kwapso baseline, always. */
export type ProcessVersion = {
  id: string
  processId: string
  versionNo: number
  label: string | null
  isBaseline: boolean
  createdAt: string
  createdByName: string | null
}

/** One step of one version. */
export type ProcessStep = {
  id: string
  processId: string
  versionId: string
  /** the SAME step across versions — what makes the saving a subtraction */
  stepKey: string
  name: string
  description: string | null
  position: number
  secondsPerRun: number
  runsPerMonth: number
  /** true once the work stopped happening (kept, at zero seconds — never deleted) */
  removed: boolean
  /** WHO DOES THIS STEP — one of the client's own roles. Null until somebody
   * says, which is a real answer: the step's minutes then report with no money
   * beside them rather than at a price nobody agreed. */
  roleId: string | null
  /** the role's own name, read alongside so a step can be read without a second
   * lookup — and so an older version still says the word it was mapped with */
  roleName: string | null
  /** WHAT AN HOUR OF THAT ROLE COSTS THE CLIENT, in cents. Null when the role is
   * unnamed OR when its cost has not been looked up yet — two different reasons
   * for the same honest gap, told apart by whether `roleId` is set. */
  roleCentsPerHour: number | null
  /** WHAT IT IS DONE IN — exactly ONE, by both respondents' ruling. Aurora's
   * reason is the good one: "if it's multiple tools, it's multiple steps". A step
   * done in two systems has a handoff in the middle of it, and the handoff is
   * what a process map exists to show. Null is ordinary, not missing. */
  toolId: string | null
  toolName: string | null
  toolMark: string | null
  /** HOW OFTEN, IN THE PERIOD SOMEBODY SAYS IT IN. `runsPerMonth` above is this
   * converted, once, in the one place that conversion lives. */
  runsPerPeriod: number
  frequencyPeriod: "day" | "week" | "month" | "year"
  /** THE WORD ON A FORK. Two steps at the SAME position are branches of one
   * decision; this is what distinguishes them ("if approved" / "if rejected").
   * Null on an ordinary step, which is nearly all of them. */
  branchLabel: string | null
  /** WHICH ARM OF A FORK THIS STEP IS ON — the step_key of the branch HEAD it
   * continues, or null for an ordinary step on the trunk.
   *
   * A fork used to be able to say only two things: steps sharing a position are
   * branches, and a single step below them is the rejoin. So a step meant to
   * continue ONE arm was drawn centred under both and read as a join. This is
   * the third thing it can say, and the picture library has been able to draw it
   * all along (`FlowBranch.chain`). */
  branchOf: string | null
  /** THE WAY BACK. The step key this one can return to — "if rejected, go back
   * to step two". Rejections and rework are real work and a map that cannot draw
   * them is describing a process nobody runs. */
  loopsBackTo: string | null
  /** WHICH DAY THIS DESCRIPTION STARTED BEING TRUE — set only when the step came
   * out of the dated history rather than off the live row. */
  effectiveOn?: string
}

/** One process opened: its versions, the steps of ONE of them, the exact totals
 * its tabs are badged with (R16), and the subtraction the map exists to produce.
 *
 * `steps` is the SHOWN version's, not always the current one's — `shownVersionId`
 * says which, and it is the latest unless the reader asked for an older one. The
 * two travel together deliberately: a list of steps with no version beside it is
 * how a reader ends up checking today's times against last year's total. */
export type ProcessLink = {
  id: string
  /** the OTHER map — never this one */
  processId: string
  name: string
  note: string | null
  /** `to` = this map hands over to it; `from` = it hands over to this one. Read
   * both ways on purpose: making somebody remember which way round they typed a
   * connection is how a feature stops being used. */
  direction: "to" | "from"
}

export type ProcessDetail = {
  process: ProcessSummary
  versions: ProcessVersion[]
  steps: ProcessStep[]
  /** which version `steps` belongs to (the latest, unless one was asked for) */
  shownVersionId: string
  /** the exact server count of that version's steps — what the Steps tab badges */
  shownStepCount: number
  commentsTotal: number
  /** baseline minus latest, step by step, through the ONE savings seam — so this
   * screen's figure and the client's portal can never disagree. `null` for an
   * archived map, which is out of the value picture by construction. */
  saving: ProcessSaving | null
  /** the sentence the figure above must be quoted with (R25), carried with it */
  savingsCaption: string
  /** THE DAY THE SAVING IS MEASURED FROM — Alex's visit, not "version 1"
   * (Aurora's ruling). A version number is a thing WE did; this is the moment
   * the client recognises as "before". */
  auditDate: string
  /** the day the slider is parked on, or null for today's live map */
  asOf: string | null
  /** every day this map changed, plus the audit date — the stops the slider
   * snaps to, so no position on it is a day nothing happened */
  revisionDates: string[]
  /** the maps this one hands over to, and the ones that hand over to it. LOOSE
   * by ruling: naming a link changes no duration and no saving on either side. */
  links: ProcessLink[]
}

/** A comment on a process map — a conversation, never an edit. */
export type ProcessComment = {
  id: string
  processId: string
  body: string
  /** set = this comment is the staff explanation for that step's regression */
  explainsStepKey: string | null
  fromStaff: boolean
  createdAt: string
  /** null when a client login is reading a STAFF comment: the portal never says
   * which staff member is doing the work (SCOPE ch.06). */
  createdByName: string | null
}

/** What an account is CHARGED per hour, by kind of work. A client may be shown
 * this when their price visibility is switched on. */
export type AccountRate = {
  id: string
  accountId: string
  label: string
  centsPerHour: number
  currency: string | null
  active: boolean
  createdAt?: string | null
  createdByName?: string | null
  updatedAt?: string | null
  editedByName?: string | null
}

/** What an hour of OUR work costs US. A separate type from AccountRate on
 * purpose: the two are the same shape and opposite audiences, and one type with
 * a `kind` field is one wrong filter away from the figure SCOPE says a client
 * must never see. No shape the client side can ask for carries one of these. */
export type InternalRate = {
  id: string
  label: string
  centsPerHour: number
  currency: string | null
  /** the rate a margin applies to an hour of logged time whose kind of work the
   * work log does not yet name. At most one, enforced by a partial unique index. */
  isDefault: boolean
  active: boolean
  createdAt?: string | null
  createdByName?: string | null
  updatedAt?: string | null
  editedByName?: string | null
}

/* ─────────────────────────── the work engine ─────────────────────────────── */
// A ticket is what an account ASKS FOR; a story is one piece of work WE DO about
// it (.plans/BUILD-1 §2). The four nouns are kept apart in the words, in the
// glossary, and here in the types — a single "work item" type with a kind field
// is how they stop being kept apart on the screens.

/** The four states a story moves through (SCOPE ch.07). The review step is
 * deliberate: work is checked before it is called done. FIXED — the code trusts
 * this list; the team-editable "Story status" dropdown is display-only. */
export const STORY_STATUSES = ["open", "in_progress", "in_review", "done"] as const
export type StoryStatus = (typeof STORY_STATUSES)[number]

/** ONE PIECE OF WORK WE DO. The only place an assignee and a due date live — a
 * ticket deliberately has neither and derives its picture from these. */
export type Story = {
  id: string
  /** BERG-S0188 — the account's own short code, an S, and a per-account sequence.
   * Null on a story with no account, or one whose account has no code yet. */
  ref: string | null
  title: string
  detail: string | null
  status: StoryStatus
  /** WHAT KIND OF WORK IT IS (CHECKLIST 6.2) — Fix, Feature or Change, and
   * editable on the Dropdown values screen like every other vocabulary here.
   * REQUIRED on the way in; nullable on the way out because 3,677 stories
   * arrived from the previous system without one, and a column that refused to
   * describe them would be a column that lied about what is in the table. */
  storyType: string | null
  /** WHY IT MAY BE REVIEWED. Written before a story can move to `in_review`
   * (CHECKLIST 6.9): the timers have to be stopped and this has to say what was
   * done. The FILE is optional — Aurora's ruling, over "all three always" —
   * because plenty of work has nothing to show. */
  reviewNote: string | null
  reviewFileUrl: string | null
  reviewFileName: string | null
  /** the request this work answers, when there is one. Four out of five stories
   * in the real history stand on their own. */
  ticketId: string | null
  ticketRef: string | null
  sprintId: string | null
  sprintName: string | null
  appId: string | null
  processId: string | null
  /** WHICH STEP OF WHICH MAP THIS WORK CHANGED — a step KEY, so it means the same
   * step across every version of that map. A story cannot close without this or
   * `changesNoStep`; that pair is the hook the savings maths hangs off. */
  stepKey: string | null
  changesNoStep: boolean
  /** EVERY PROCESS THIS WORK TOUCHES (CHECKLIST 6.5). `processId` above is the
   * FIRST of these, kept because the savings maths and the import both address a
   * story's map by one id; this is the full set, and one piece of work commonly
   * changes two. An EMPTY list is only allowed when `changesNoStep` is ticked —
   * Aurora's ruling that "no process" must be CHOSEN rather than left blank. */
  processIds: string[]
  assigneeId: string | null
  assigneeName: string | null
  reviewerId: string | null
  reviewerName: string | null
  startsOn: string | null
  /** THE STORY'S OWN due date, kept for the rows that already carry one and
   * never asked for again — the form stopped offering it on 17 Aug 2026. */
  dueOn: string | null
  /** WHEN IT IS ACTUALLY DUE: the end date of the sprint this work sits in. A
   * story is one piece of a block that was sold with an end date on it, so the
   * block's date is the promise; two dates for one promise is two dates that
   * disagree the first time a sprint moves. Null on a story with no sprint. */
  sprintEndsOn: string | null
  closedAt: string | null
  /** what we will tell the client. Closing a story appends this to the ticket's
   * DRAFT resolution — a draft, never a sent message. */
  closingNote: string | null
  rank: string | null
  accountId: string | null
  createdAt: string
  updatedAt: string | null
  createdByName: string | null
  editedByName: string | null
}

/** A BLOCK OF DELIVERY WORK SOLD TO ONE ACCOUNT. It carries the flat price, which
 * is the revenue half of the margin (workers/tenancy/src/lib/internal-money.ts
 * reads it and never writes it). Whole cents, like every money column here. */
export type Sprint = {
  id: string
  ref: string | null
  name: string
  goal: string | null
  sprintType: string | null
  accountId: string | null
  accountName: string | null
  appId: string | null
  appName: string | null
  /** WHICH PACKAGE IT WAS SOLD INSIDE, if any. A sprint can be sold on its own —
   * null is ordinary, not missing — but where it belongs to a wave the sprint's
   * own screen has to say so, or a reader has to go and look for it. Read
   * alongside like the account and the app, for the same reason: one round trip. */
  waveId: string | null
  waveName: string | null
  startsOn: string | null
  endsOn: string | null
  soldPriceCents: number
  currency: string | null
  /** the MOMENT it completed, not a status word. It used to be what an automatic
   * version cut keyed off; that decision was purged on 24 Aug 2026 (a version is
   * cut by hand), and the moment is still the honest way to ask "is it done?". */
  completedAt: string | null
  active: boolean
  /** exact server counts of the work inside it (R16) — never a loaded length. */
  storyCount: number
  openStoryCount: number
  createdAt: string
  createdByName: string | null
}

/** ONE ROW OF TIME: who, what they worked on, and how long, in whole seconds.
 * A TIMER is one of these with no `endedAt` yet — there is no second concept and
 * no state machine, which is what makes starting one a single click. */
export type WorkLog = {
  id: string
  /** what it is against — one of WORK_LOG_TARGETS. Never a to-do (that is
   * somebody else's time) and never an account on its own. */
  targetTable: string
  targetId: string
  /** what the thing it is against is CALLED, so a list of time reads as a list
   * of work rather than a list of ids. */
  targetLabel: string | null
  /** The target's own short reference (`BERG-T0412`). NULL when the record has
   * no account, or its account has no short code — the agency's own work, most
   * often. Callers fall back to the label rather than showing a blank. */
  targetRef: string | null
  userId: string
  userName: string | null
  /** the kind of work, so the margin can group by it. Null until a team starts
   * saying — the margin applies its default internal rate and says so. */
  kind: string | null
  note: string | null
  startedAt: string
  /** null = still running */
  endedAt: string | null
  seconds: number
  billable: boolean
  /** a runaway timer somebody binned. The row survives; every sum subtracts it. */
  discarded: boolean
  accountId: string | null
}

/** A timer still running, as the header shows it: what it is on, where clicking
 * it goes, and when it started (the browser counts up from there rather than
 * asking the server every second). */
export type RunningTimer = {
  id: string
  targetTable: string
  targetId: string
  targetLabel: string | null
  /** The target's own short reference (`BERG-T0412`). NULL when the record has
   * no account, or its account has no short code — the agency's own work, most
   * often. Callers fall back to the label rather than showing a blank. */
  targetRef: string | null
  startedAt: string
  /** whole seconds elapsed at the moment the server answered */
  elapsedSeconds: number
  /** true once it has been running longer than RUNAWAY_HOURS — the Monday prompt */
  runaway: boolean
}

/** SOMETHING WE ARE WAITING ON THE CLIENT FOR. The one row in the work engine a
 * client login can write to: they complete it and upload a file against it from
 * their own portal. Never carries a work log — that would be their time in our
 * margin. */
export type Todo = {
  id: string
  /** BERG-D0007 — a to-do always belongs to a client, so it always has one (as
   * long as that client has a short code). */
  ref: string | null
  title: string
  detail: string | null
  dueOn: string | null
  completedAt: string | null
  completedByName: string | null
  /** what they sent us, and what it was called on their machine. One file: the
   * request is "send us the logo", and a second attachment is a second to-do. */
  fileUrl: string | null
  fileName: string | null
  /** withdrawn without being deleted — we stopped needing it. */
  cancelled: boolean
  accountId: string
  accountName: string | null
  ticketId: string | null
  createdAt: string
}

/** THE TWO PILES OF A TO-DO, as SERVER views — the panel's own two words.
 *
 * Not a client filter, and not one list with a checkbox over it: the collection
 * PAGES (R14), so sieving the loaded rows for the completed ones would show "the
 * done among the newest fifty" under a badge counting all of them (R16). Each
 * view is also its own ORDERING — open by when it is due, done by when it was
 * done — which is what lets a single keyset cursor page either one.
 *
 * `all` USED TO BE THE SECOND WORD and is retired rather than renamed: the two
 * views sort by different columns, so "everything, in one order" is a question
 * with no honest keyset answer. A caller asking for the retired word gets the
 * open list, which is what it got before `all` existed. */
export const TODO_VIEWS = ["open", "done"] as const
export type TodoViewName = (typeof TODO_VIEWS)[number]

/** KWAPSO'S OWN INTERNAL ADMIN. Nobody outside the agency ever sees one. Work
 * logs DO attach — forty minutes on our own VAT return is real time and costs us
 * the same as forty minutes of delivery. */
export type Task = {
  id: string
  ref: string | null
  title: string
  detail: string | null
  assigneeId: string | null
  assigneeName: string | null
  /** WHEN IT HAS TO BE DONE. The field is `due_on` in the table and the word on
   * every screen is "Deadline" — the tester's, and the one this build uses. */
  dueOn: string | null
  status: "open" | "done"
  completedAt: string | null
  /** usually null — our own admin belongs to no client. A task that IS about one
   * (chasing an invoice, preparing a review) may name it, which is what puts its
   * time in the right margin. */
  accountId: string | null
  accountName: string | null
  /** THE EISENHOWER PAIR, which replaced a high/medium/low word. `priority` is
   * `(important × 2) + urgent + 1`, 1 to 4, computed from the two rather than
   * stored — a derived column is a column that can disagree with its inputs. */
  important: boolean
  urgent: boolean
  priority: 1 | 2 | 3 | 4
  /** which of the agency's five departments it belongs to — a word from the
   * `Department` dropdown group, editable on that screen. It is also what decides
   * the SECOND field: Production names an app, Sales a client, Admin may. */
  department: string | null
  appId: string | null
  appName: string | null
  /** the one thing attached to it — a photo of the letter, the form to file. It
   * lives in the agency's own bucket, served at /media/internal/ by the agency
   * gateway alone (R21): a task is ours, and so is its evidence. */
  fileUrl: string | null
  fileName: string | null
  createdAt: string
  createdByName: string | null
}

/** THE SIX PILES of our own admin, as SERVER views — the tab strip's own words.
 *
 * Not client filters, for the reason the ticket strip is a server scope: the list
 * is capped (R14), so sieving the loaded rows for the overdue ones would show
 * "the overdue among the newest N" under a badge counting all of them (R16).
 *
 * `open` is the everyday one and keeps its old name on the wire — the door has
 * answered to `?view=open` and `?view=all` since it shipped, and a rename would
 * be a contract change to relabel a tab. */
export const TASK_VIEWS = ["open", "overdue", "upcoming", "completed", "calendar", "all"] as const
export type TaskViewName = (typeof TASK_VIEWS)[number]

/* ── THE PULSE — the team's week as numbers a screen can draw ──────────────── */

/** One week of logged time. The worker knows no locale, so it hands back the
 * Monday that opens the week and the screen spells it in the reader's language. */
export type PulseWeek = {
  /** the Monday, `YYYY-MM-DD`, in UTC (the server owns the boundary so the chart
   * and every badge beside it mean the same week). */
  weekStart: string
  /** whole seconds logged inside it. EXACT — hours are the number an invoice is
   * argued about, so this is never a bounded display tally. */
  seconds: number
}

/** What `GET /api/content/insights` answers with.
 *
 * A `null` SECTION IS A RIGHT THE CALLER'S ROLE DOES NOT HOLD, and it is
 * deliberately not a zero: "you may not look at this" and "there are none of
 * these" are different sentences, and a chart drawn on the second one would be a
 * confident lie about the first (R18 — a cross-module read carries the caller's
 * rights). Every screen reading this must render nothing for a null section
 * rather than an empty state. */
export type TeamPulse = {
  tickets: {
    /** everything not yet resolved. */
    open: number
    /** the live stages in the lifecycle's own order — a chart of them reads left
     * to right as the work moves, and a stage nobody is in stays at zero rather
     * than vanishing, because an empty column is information too. */
    byStage: { stage: HelpStatus; count: number }[]
  } | null
  work: {
    /** the backlog: stories that are not done. */
    storiesOpen: number
    /** admin due today or earlier, and how much of it is ticked off. */
    tasksDue: number
    tasksDueDone: number
    /** the last eight weeks of logged time, oldest first. */
    weeks: PulseWeek[]
  } | null
  meetings: {
    /** this week's meetings, Monday to Sunday, decided by the server. */
    thisWeek: number
  } | null
}

/** What `GET /api/content/work-logs/summary` answers with — the numbers on top
 * of one record's list of time.
 *
 * EVERY FIGURE IS OVER THE WHOLE FILTER, never the page under it. The list is
 * keyset-paged (R14), so a browser adding up the rows it happens to hold would
 * answer "the newest fifty entries" while looking exactly like an answer about
 * the record. `total` and `totalSeconds` are the SAME two numbers the list door
 * returns, from the same function, so the badge and the header cannot disagree
 * (R16).
 *
 * NOTHING HERE IS MONEY. What an hour costs us is derived in the one file R24
 * fences and never travels on this object. */
export type WorkLogSummary = {
  /** how many entries — a badge number, bounded like every other count. */
  total: number
  /** did that count stop early? R16 says a total that hit the ceiling SAYS SO in
   * the same object, and this door answers with `json` rather than `pagedJson`,
   * which is where every paged door gets the flag for free. Without it the only
   * thing hedging was `formatCount`'s "+", which is a rendering decision — a
   * caller reading the number itself (an export, the agent) had nothing to read. */
  totalCapped: boolean
  /** whole seconds across all of them. EXACT, for the reason PulseWeek says. */
  totalSeconds: number
  /** HOW MANY PEOPLE HAVE WORKED ON IT — the door's own bounded count over the
   * whole filter, and NOT `people.length`, which is the top `WORK_LOG_GROUP_CAP`
   * by hours. A record worked on by more than fifty people read "People on it:
   * 50" for ever (R16: a capped list's length is a ceiling, not a total).
   *
   * No `peopleCapped` beside it: the ceiling is `TOTAL_COUNT_CAP`, so reaching it
   * means a million distinct people logged time against one story, and
   * `formatCount` renders the "+" if that day ever comes. */
  peopleTotal: number
  /** who spent it, biggest first — the top `WORK_LOG_GROUP_CAP` of them, which is
   * what a bar chart can show. `userName` is the snapshot on the row, so time
   * logged by somebody since removed from the team still has a name on it. */
  people: { userId: string; userName: string | null; seconds: number }[]
  /** what kind of work it was, biggest first. `null` is the real bucket for time
   * logged without a kind, which is most of it — not a dropped row. */
  kinds: { kind: string | null; seconds: number }[]
  /** the last eight weeks, oldest first — the SAME eight windows Home draws, so
   * two screens can never be looking at two different Mondays. */
  weeks: PulseWeek[]
}

/* A MEETING HAS NO STATUS, and that is a decision rather than an omission. It
 * had two words, `scheduled` and `held`, and the second was a flag somebody had
 * to remember to tick about a fact the CLOCK already knows: a meeting's own
 * `startsAt` says whether it has happened. Two sources of truth for one question
 * disagree the first time anybody forgets, in both directions. Cancelling was
 * never one of the words anyway — it is the module's `delete`, and the row
 * survives it (`active`). */

/** ONE PERSON ON A CALENDAR EVENT — the "stakeholders" a meeting record carries.
 *
 * As Google states them and nothing more: this is the MIRROR of the invitation,
 * so it says who was asked and what they answered, and it deliberately does not
 * say who they are to us. That second question is a different fact with a
 * different lifetime — a contact added to an account next week should light up
 * on a meeting held last week — so it is answered by a read (`meetingPeople`)
 * rather than frozen into the row at sync time. */
export type MeetingGuest = {
  email: string
  name: string
  /** Google's own word: `needsAction`, `declined`, `tentative` or `accepted`. */
  response: string
  organizer: boolean
  optional: boolean
  /** a meeting ROOM rather than a person — Google puts both on one list. */
  resource: boolean
}

/** A file hanging off a calendar event: an agenda, a deck, or the transcript Google
 * Meet files against the event once the call is over. */
export type MeetingAttachment = {
  fileId: string
  title: string
  mimeType: string
  iconUrl: string | null
  url: string | null
}

/** WHO ON AN INVITATION WE ALREADY KNOW. The answer to the second half of the
 * owner's "stakeholders" ask: an address that matches one of our own people, or
 * a contact on one of our accounts, is a RECORD rather than a string.
 *
 * Both halves can be null — most addresses on most invitations are neither, and
 * saying so plainly is better than a screen that implies every guest is filed
 * somewhere. */
export type MeetingPersonLink = {
  email: string
  /** one of our own team members. */
  memberUserId: string | null
  memberName: string | null
  /** a contact on one of our accounts, and the client it sits under. */
  accountId: string | null
  accountName: string | null
}

/** A CONVERSATION WE HAD, or are about to have — the record Glide never kept.
 * Its 350 meetings were folded into work logs, which kept the hours and lost the
 * agenda; these two fields are why this is a record of its own. */
export type Meeting = {
  id: string
  /** the short code a client quotes, when the meeting names one (BERG-M0007). */
  ref: string | null
  title: string
  /** which client it is with. Null = an internal meeting of our own. */
  accountId: string | null
  accountName: string | null
  /** WHICH SYSTEM IT WAS ABOUT, and the app's name so a row can say it without a
   * second lookup. Nullable: plenty of meetings are about the account rather
   * than one of its systems, and the first kickoff call is one of them. */
  appId: string | null
  appName: string | null
  /** why we meet, out of the settled taxonomy under Delivery method. */
  purposeId: string | null
  purposeName: string | null
  /** what we mean to talk about, and what was decided. The two fields no other
   * record in the app has anywhere to put. */
  agenda: string | null
  notes: string | null
  location: string | null
  /** WHEN IT IS, AND THEREFORE WHETHER IT HAS HAPPENED. There is no separate
   * status: this against the clock is the answer, and it is the only one that
   * cannot go stale. */
  startsAt: string
  endsAt: string | null
  /** the Google Calendar entry this meeting mirrors, and the link that opens it
   * in Google's own web app. Set by the sweep — nothing in this product puts an
   * entry in a calendar — and unique on the row, so one calendar event can never
   * become two meetings. */
  googleEventId: string | null
  googleEventUrl: string | null
  /* ── THE REST OF THE CALENDAR EVENT, MIRRORED ────────────────────────────────
   * Everything below is Google's fact about the same entry, copied onto the row
   * by the calendar sweep so that a meeting can SAY who was in the room, where
   * to join and what was attached — without every reader holding a connection
   * and every list costing fifty calls to Google.
   *
   * The direction is one-way, and now it is one-way in BOTH senses: nothing in
   * this product writes to a calendar at all, so Google's calendar is the source
   * and every column below is a copy of it. `googleSyncedAt` says when that copy
   * was last true, which is the honest thing a mirror can offer. */
  /** the join link — Meet, or whatever conferencing system is on the entry. */
  googleJoinUrl: string | null
  /** who called the meeting. Often not on the guest list at all. */
  googleOrganizer: string | null
  /** Google's own word: `confirmed`, `tentative` or `cancelled`. */
  googleStatus: string | null
  /** the IANA zone the entry is written in — an hour is not a fact without it. */
  googleTimeZone: string | null
  /** the repeat rule as Google states it (`RRULE:FREQ=WEEKLY;BYDAY=MO`). */
  googleRecurrence: string | null
  googleGuests: MeetingGuest[]
  googleAttachments: MeetingAttachment[]
  /** when the mirror above was last brought into step with Google. */
  googleSyncedAt: string | null
  /** TRUE when this row was read IN off somebody's calendar rather than typed here
   * and pushed out. It decides what a re-sync may overwrite: Google owns the
   * words of a row it authored, kwapso owns the words of a row it authored, and
   * the notes belong to a person either way. */
  fromCalendar: boolean
  /** WHICH TRANSCRIPT WAS READ, and WHEN (CHECKLIST 9.2 + 9.4). The timestamp is
   * the idempotence predicate as much as it is a fact: reading a transcript
   * ticks the meeting held and writes a work log for every one of OUR people who
   * was in the room, and both of those must happen exactly once. */
  transcriptFileId: string | null
  transcriptCapturedAt: string | null
  /** the document itself, in Google — so "read the transcript" has somewhere to
   * go on any screen, whoever is looking. */
  transcriptUrl: string | null
  /** WHICH OF THE THREE HUNTS FOUND IT: `attachment` (Google put it on the
   * calendar entry itself), `drive` (a document in a folder somebody shared) or
   * `mail` (a notice from Google naming the document). They do not prove the
   * same thing — the first is a fact and the other two are matches — so the
   * screen says which. Null until one is captured. */
  transcriptFoundBy: string | null
  /** WHEN THE WORDS BECAME ANSWERABLE — null until the knowledge sweep has
   * indexed this meeting. Distinct from `transcriptCapturedAt`, which only says
   * the transcript was fetched from Google: for a window between the two, the
   * meeting HAS its transcript and asking the knowledge base about it still
   * finds nothing. That gap was invisible on every screen. */
  knowledgeIndexedAt: string | null
  /* THE WORDS THEMSELVES ARE NOT HERE, and that is deliberate. A page of
   * meetings is fifty; a transcript is up to a megabyte. Putting one on
   * the other would make the list read the heaviest response in the app to show
   * a column nobody scrolls. The text has its own door
   * (`GET /api/content/meetings/transcript`), read once, by the one screen that
   * displays it. */
  /** THE GOOGLE SERIES this entry belongs to, when it is one of a repeating set
   * (9.7). Null on a one-off. */
  recurringEventId: string | null
  active: boolean
  createdAt: string
  creatorName: string | null
  updatedAt: string | null
  editorName: string | null
}

/* ─────────────────────── THE AGENCY'S OWN HOUSEKEEPING ──────────────────────
 * Four modules carrying the seven legacy tables that describe how the agency
 * runs ITSELF. Every one of these shapes has the same three closing fields —
 * `active`, the creator and the editor — because they are all the same kind of
 * record: something a member of the agency wrote down about the agency, which is
 * retired rather than deleted and whose history is worth reading.
 *
 * None of them carries an `accountId`. That is not an omission: these rows
 * belong to no client, so there is nothing for the account fence to fence, and
 * every door on all three refuses a client login outright instead (R21).
 * ────────────────────────────────────────────────────────────────────────── */

/** One piece of the agency's brand material — the legacy `branding` table. */
export type BrandAsset = {
  id: string
  name: string
  category: string | null
  description: string | null
  /** an object we host (/media/internal/…) or a link somewhere else. */
  fileUrl: string | null
  /** `#RRGGBB`, for an asset that IS a colour rather than a file of one. A brand
   * colour was 24 links to flat rectangles drawn by someone else's website until
   * 0043 — nine of them at a domain one letter off the one we meant. The value
   * was in the URL the whole time. */
  colorHex: string | null
  active: boolean
  createdAt: string
  creatorName: string | null
  updatedAt: string | null
  editorName: string | null
}

/** Why the agency meets — the legacy `purposes` table. The one legacy lookup
 * that could not become a dropdown value, because it carries a department. */
export type MeetingPurpose = {
  id: string
  name: string
  /** pick-or-created into the "Department" dropdown group. */
  department: string | null
  description: string | null
  active: boolean
  createdAt: string
  creatorName: string | null
  updatedAt: string | null
  editorName: string | null
}

/** The person behind a member row: how they work and what they are like. Visible
 * to the team, never to a client — there is no portal door on this module. */
export type StaffProfile = {
  id: string
  /** the GLOBAL user id (members live in the core database). */
  userId: string
  headline: string | null
  personalityType: string | null
  strengths: string | null
  weaknesses: string | null
  roleModels: string | null
  about: string | null
  photoUrl: string | null
  active: boolean
  createdAt: string
  creatorName: string | null
  updatedAt: string | null
  editorName: string | null
}

/** A credential a member holds — the legacy `certificates` table. */
export type StaffCertificate = {
  id: string
  userId: string
  title: string
  issuer: string | null
  /** the day it was granted / the day it lapses (YYYY-MM-DD), either may be null. */
  issuedOn: string | null
  expiresOn: string | null
  fileUrl: string | null
  active: boolean
  createdAt: string
  creatorName: string | null
  updatedAt: string | null
  editorName: string | null
}

// ── GOOGLE, CONNECTED ONE PERSON AT A TIME ───────────────────────────────────
// Four services, one shape. Nothing here ever carries a token: the tokens live
// encrypted in the team database and are read by exactly one file
// (workers/content/src/lib/google.ts). A type that COULD hold one would
// eventually hold one, on a wire, in a log, in somebody's browser devtools.

/** The four Google services a person may connect, each asked for separately. */
export const GOOGLE_SERVICES = ["drive", "gmail", "calendar", "chat"] as const
export type GoogleService = (typeof GOOGLE_SERVICES)[number]

/** The two services whose material is reached through SHARED sources — Drive
 * folders and Chat spaces. Sharing is the act: nothing in a Drive or a Chat is
 * reachable until somebody hands it over, and what they hand over carries a
 * shelf and a client with it. */
export const GOOGLE_NAMED_SERVICES = ["drive", "chat"] as const
export type GoogleNamedService = (typeof GOOGLE_NAMED_SERVICES)[number]

/** The two services that are reached WHOLESALE unless somebody narrows them —
 * the mailbox and the calendar. There is nothing to hand over here: a person
 * connects Gmail and every message is in reach, connects Calendar and their own
 * calendar is. So the act on these two is the opposite one — SCOPE, which says
 * which containers may be read and leaves the rest alone. */
export const GOOGLE_SCOPED_SERVICES = ["gmail", "calendar"] as const
export type GoogleScopedService = (typeof GOOGLE_SCOPED_SERVICES)[number]

/** HOW MUCH OF A CONNECTION KWAPSO MAY READ.
 *
 * 'everything' is the default and is what every connection did before scope
 * existed. 'only' means the containers this person named and nothing else — and
 * 'only' with nothing named means NOTHING, which is the safe direction and the
 * whole reason this is a mode rather than an empty list. Without it, switching
 * off a last named label would hand somebody's whole mailbox back through a
 * gesture that reads as a narrowing. */
export const GOOGLE_SCOPE_MODES = ["everything", "only"] as const
export type GoogleScopeMode = (typeof GOOGLE_SCOPE_MODES)[number]

/** GOOGLE'S OWN WORDS for the kinds of thing that sit in a calendar, passed
 * straight to events.list as repeated `eventTypes` — so a kind left out is never
 * fetched rather than fetched and dropped. An empty allow-list means every kind,
 * which is the untouched state and the only way to spell it. */
export const GOOGLE_EVENT_TYPES = [
  "default",
  "outOfOffice",
  "focusTime",
  "workingLocation",
  "birthday",
  "fromGmail",
] as const
export type GoogleEventType = (typeof GOOGLE_EVENT_TYPES)[number]

/** Who may read what you shared. Declared at the moment you share it, shown on
 * the row afterwards, and the only thing that decides whether a colleague's
 * question can be answered from your material. */
export const GOOGLE_SHELVES = ["private", "team"] as const
export type GoogleShelf = (typeof GOOGLE_SHELVES)[number]

/** One person's link to one Google service, as a screen sees it. */
export type GoogleConnection = {
  id: string
  /** the GLOBAL user id — a connection belongs to a person, never to a team. */
  userId: string
  service: GoogleService
  /** which Google account this is, so a person with two can tell them apart. */
  googleEmail: string
  /** what Google actually granted, space-separated, exactly as it said it. A
   * person who unticked a box at the consent screen has a connection that works
   * for less than we asked for, and the screen has to be able to say so. */
  grantedScopes: string
  /** THE OTHER DIRECTION, and the harder one to notice: what Google granted that
   * this app never asked for.
   *
   * A grant at Google is an additive SET per OAuth client, so narrowing a scope
   * in our own code changes nothing about a person who already approved the
   * wider one — their next connect returns the old power and the app looks
   * fixed. Computed server-side against the request itself
   * (`unrequestedScopes`), never in the browser, and normally empty. When it is
   * not, the settings card says so plainly and the fix is to disconnect (which
   * revokes at Google) and connect again. */
  extraScopes: string[]
  /** AND WHAT THIS CONNECTION IS SHORT OF — the same subtraction the other way.
   *
   * A grant is only ever widened by CONSENT, so a scope added to the app after
   * somebody connected leaves them quietly unable to do the thing it was added
   * for, and the refusal they get names a status code rather than a cause. Live
   * on the owner's own account (CHECKLIST 14.5): `gmail.modify` post-dated his
   * Gmail connection, so filing a message under a label was "blocked on you"
   * with no screen anywhere saying what to do. Same fix as `extraScopes` —
   * disconnect, connect again — which is why they sit side by side. */
  missingScopes: string[]
  /** the last time we used it, and the last thing that went wrong if anything
   * did (an expired grant, a revoked account). Both are how a person finds out
   * their connection stopped working without waiting for an answer to be wrong. */
  lastUsedAt: string | null
  lastError: string | null
  /** HOW MUCH OF IT KWAPSO MAY READ. Meaningful on Gmail and Calendar, where
   * connecting alone puts everything in reach; Drive and Chat are already
   * narrowed by what somebody chose to share, so this stays 'everything' on
   * them and no screen offers to change it. */
  scopeMode: GoogleScopeMode
  /** WHICH KINDS OF EVENT, on a calendar connection. Empty means every kind. */
  scopeEventTypes: GoogleEventType[]
  active: boolean
  createdAt: string
  creatorName: string | null
  updatedAt: string | null
  editorName: string | null
}

/** WHAT WAS SHARED. Two of these are Drive, and the difference between them is
 * the owner's own question — "In Drive, why is it that it's only folder-wise?
 * What if it had to be file-wise, or does that file have to be in a folder?" It
 * did not have to. A folder is a place to look inside; a file is the thing
 * itself, and sharing one no longer means sharing everything filed beside it.
 *
 * A Chat share is always a space, which is why this is one word rather than a
 * boolean on the Drive rows: three shapes, three names, and no row that has to
 * be read together with its service to know what it is. */
export const GOOGLE_SHARE_KINDS = ["folder", "file", "space"] as const

/** AND THE TWO A PERSON SCOPES TO rather than shares. A calendar and a Gmail
 * label are containers in the same sense a folder is — a place the read runs
 * against — but nobody hands one over: they exist in reach already, and naming
 * one is how somebody says "this, and not the rest". Same table, same audit,
 * same switch; a different verb on the screen. */
export const GOOGLE_SCOPE_KINDS = ["calendar", "label"] as const

/** Every kind of container a `google_sources` row can be. */
export const GOOGLE_SOURCE_KINDS = [...GOOGLE_SHARE_KINDS, ...GOOGLE_SCOPE_KINDS] as const
export type GoogleSourceKind = (typeof GOOGLE_SOURCE_KINDS)[number]

/** A Drive folder, a single Drive file, a Chat space one person shared — or a
 * calendar or Gmail label they scoped kwapso to. */
export type GoogleSource = {
  id: string
  connectionId: string
  userId: string
  service: GoogleService
  /** Google's own id for it — a folder id, a `spaces/AAAA…` space name, a
   * calendar id, or a Gmail label id. */
  externalId: string
  name: string
  shelf: GoogleShelf
  kind: GoogleSourceKind
  /** WHICH CLIENT this folder or space is about — the compartment everything
   * inside it is filed under when the knowledge base reads it. Null means the
   * agency's own, exactly as it does on a knowledge source. Asked at the moment
   * of naming, beside the shelf: both questions are about where the material
   * ends up, and neither can be inferred from the material itself. */
  accountId: string | null
  accountName: string | null
  active: boolean
  createdAt: string
  creatorName: string | null
  updatedAt: string | null
  editorName: string | null
}

/** ONE DRIVE FILE, AS A SCREEN SEES IT — the metadata that makes a list of
 * documents look like documents rather than like a list of strings.
 *
 * `iconUrl` is Google's own small type icon (the Docs blue, the Sheets green): a
 * static, unauthenticated, cacheable link, so it goes straight into a page.
 * `hasThumbnail` is the opposite kind of fact and is deliberately a boolean —
 * Google's preview link is authenticated and expires, so the ADDRESS never
 * leaves the worker and a screen asks our own door for the bytes instead
 * (`googleDriveThumbnailUrl`). */
export type DriveFileRow = {
  id: string
  name: string
  mimeType: string
  modifiedTime: string | null
  webViewLink: string | null
  /** which named folder it came out of, or "" when the FILE itself was named. */
  folderId: string
  iconUrl: string | null
  hasThumbnail: boolean
  ownerName: string
  /** bytes, when Google states one. A Google Doc has no size in the ordinary
   * sense, so this is null more often than not. */
  sizeBytes: number | null
}

/** One thing read out of Google, in the shape the retrieval lane wants it. See
 * workers/content/src/lib/google-read.ts for where that lane plugs in. */
export type GoogleItem = {
  service: GoogleService
  /** the kwapso source row it came through, when it came through one. */
  sourceId: string | null
  externalId: string
  title: string
  /** a link a person can click to open it where it actually lives. */
  url: string | null
  /** the readable text, when the caller asked for it (a list read leaves it ""). */
  text: string
  updatedAt: string | null
  /** who may read it — carried WITH the item, so nothing downstream has to go
   * back and ask. A `private` item may only ever be shown to its owner. */
  shelf: GoogleShelf
  ownerUserId: string
  /** WHOSE MATERIAL IT IS — the client's, or nobody's. Carried on the item for
   * the same reason the shelf is: the thing that knows which account a mail or a
   * folder belongs to is the read that fetched it (the contact it was with, the
   * folder it came out of), and asking again downstream would be guessing at
   * text instead of reading a decision. Null = the agency's own compartment. */
  accountId: string | null
}
