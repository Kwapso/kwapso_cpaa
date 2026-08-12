// Shared contract between the workers (who produce these) and the web app
// (who consumes them). ONE master copy — never redeclare these shapes.

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
 * the Learning-category / Ticket-type pickers. */
export type SelectableValue = {
  id: string
  type: string
  value: string
  isDefault: boolean
  /** false = deactivated (retired). The manager shows these greyed with an Activate
   * button; form pickers filter to active. Always present. */
  active: boolean
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
 * the Invitations inbox. Read from the global invite_index + teams row, so it
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

/** A learning (how-to) item. `body` is the in-app text the agent reads to answer
 * help; `done` is the viewing user's own progress (merged in by the read). */
export type Learning = {
  id: string
  category: string | null
  title: string
  description: string | null
  contentType: string | null
  contentLink: string | null
  body: string | null
  sequence: number
  required: boolean
  active: boolean
  createdAt: string
  creatorName: string | null
  editorName: string | null
  updatedAt: string | null
  done?: boolean
}

/** One member's completion of one learning item (for the curator progress view). */
export type LearningProgressEntry = {
  learningId: string
  userId: string
  done: boolean
  doneAt: string | null
}

/** THE ticket lifecycle — the one list, for every side of the app. The server
 * validates against it, the stepper renders from it, and the agent's tool
 * descriptions name it. It was written out four times over; a fifth status was
 * four edits and TypeScript caught none of them. Now it's one edit. */
export const HELP_STATUSES = ["new", "triaged", "in_progress", "ready", "resolved"] as const
export type HelpStatus = (typeof HELP_STATUSES)[number]

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
  address: string | null
  /** the human reference staff assign when work starts (BERG). Display only. */
  code: string | null
  currency: string | null
  locale: string | null
  timezone: string | null
  /** may this account see money figures on its own work? `null` on the way OUT
   * to a client login — the agency's own switch ABOUT them, never for them. */
  commercialsVisible: boolean | null
  /** the commercial lifecycle (prospect / client / past client). `null` on the
   * way OUT to a client login: our view of the relationship is not their reading.
   * See toAccount in workers/tenancy/src/lib/accounts.ts. */
  status: string | null
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
  links: AccountLink[]
  portalUsers: PortalUser[]
  linksTotal: number
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
 * row the app already owns (`ticket` / `article` / `account` — the row is the
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
  title: string
  body: string | null
  sourceUrl: string | null
  /** "team" = anyone who may read the knowledge base; "private" = only its owner */
  visibility: "team" | "private"
  ownerUserId: string | null
  indexedAt: string | null
  chunkCount: number
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
}

/** What the knowledge base answers with. It never writes prose — the assistant
 * does that, with these passages in front of it — so what a caller receives is
 * the evidence plus the reasoning about WHERE it looked (`reason`), which is the
 * part a person needs to see when the answer is wrong. */
export type KnowledgeAnswer = {
  question: string
  found: boolean
  /** the sentence to say when there is nothing — never an invented answer */
  message: string
  /** the compartments searched; empty means the whole knowledge base */
  compartments: string[]
  /** WHY those compartments, in a sentence a person can disagree with */
  reason: string
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

/** An App: the built system, the thing with its own address (SCOPE ch.02). */
export type AppRow = {
  id: string
  /** whose system it is; null is the agency's own */
  accountId: string | null
  name: string
  url: string | null
  stage: string | null
  /** what it costs US to run each month, in cents. `null` on the way OUT to a
   * client login — an internal number, withheld on the row (see listApps). */
  toolCostCentsPerMonth: number | null
  active: boolean
  createdAt?: string | null
  createdByName?: string | null
  updatedAt?: string | null
  editedByName?: string | null
}

/** One process in a list: what it is, and how much of it there is. */
export type ProcessSummary = {
  id: string
  appId: string
  appName: string
  accountId: string | null
  name: string
  description: string | null
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
  /** the sprint whose completion cut it; null = the manual button. `null` on the
   * way out to a client login — which sprint we ran is the agency's own record. */
  cutFromSprintId: string | null
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
}

/** One process opened: its versions, its current steps, and the exact comment
 * total its tab is badged with (R16). */
export type ProcessDetail = {
  process: ProcessSummary
  versions: ProcessVersion[]
  steps: ProcessStep[]
  commentsTotal: number
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

/** The states a story is NOT yet finished in. Derived from the one list above
 * rather than retyped, so a fifth state cannot be added and silently left out of
 * the question the Ready flip asks ("is anything still open on this ticket?"). */
export const OPEN_STORY_STATUSES = STORY_STATUSES.filter((s) => s !== "done")

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
  assigneeId: string | null
  assigneeName: string | null
  reviewerId: string | null
  reviewerName: string | null
  startsOn: string | null
  dueOn: string | null
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
  startsOn: string | null
  endsOn: string | null
  soldPriceCents: number
  currency: string | null
  /** the MOMENT it completed, not a status word — the version cut on the money
   * side keys off exactly that (process_versions.cut_from_sprint_id). */
  completedAt: string | null
  active: boolean
  /** exact server counts of the work inside it (R16) — never a loaded length. */
  storyCount: number
  openStoryCount: number
  createdAt: string
  createdByName: string | null
}
