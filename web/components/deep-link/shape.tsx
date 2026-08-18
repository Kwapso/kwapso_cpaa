// Per-module SHAPING — pure functions turning already-loaded app data into the
// flat ScreenData (records / rows / sets) each recipe reads. No hooks, no
// fetching: the resolver guards loading/errors then calls these, so they're
// trivially unit-testable and keep the resolver lean.

import { type ScreenData } from "@kwapso/ui/registry/collections/screen-renderer/screen-renderer"

import { formatActivityWhen, formatDate, formatDateSortable, formatDateTime } from "@shared/web/format"
import { personName } from "@/lib/identity"
import { richTextPlain } from "@shared/web/rich-text"
import type {
  Account,
  ActivityItem,
  BrandAsset,
  HelpTicket,
  Invite,
  InviteAudit,
  KnowledgeSource,
  Meeting,
  MeetingPurpose,
  TeamMeta,
  TeamMember,
  TeamRole,
} from "@shared/types"

/** Display status per invite state (one source for list + detail). */
export const INVITE_STATUS: Record<Invite["status"], string> = {
  pending: "Pending",
  accepted: "Accepted",
  revoked: "Revoked",
  expired: "Expired",
}

/** Activity items → the engine's activity-block row shape. */
export function shapeActivity(items: ActivityItem[]): Record<string, unknown>[] {
  return items.map((a) => ({
    id: a.id,
    description: a.description,
    actor: a.actorName ?? undefined,
    timestamp: formatActivityWhen(a.createdAt),
  }))
}

export function shapeTeamDetail(opts: {
  teamId: string
  name: string
  logoUrl: string | null
  meta: TeamMeta
  activity: ActivityItem[]
}): ScreenData {
  return {
    record: {
      id: opts.teamId,
      name: opts.name,
      image: opts.logoUrl ?? "",
      created: formatDateTime(opts.meta.createdAt),
      createdBy: opts.meta.creatorName || opts.meta.creatorEmail || "",
      updated: opts.meta.updatedAt ? formatDateTime(opts.meta.updatedAt) : "—",
    },
    sets: { activity: shapeActivity(opts.activity) },
  }
}

export function shapeMembersList(members: TeamMember[]): ScreenData {
  return {
    rows: members.map((m) => ({
      id: m.userId,
      name: personName(m),
      detail: `${m.roleTitle} · joined ${formatDate(m.joinedAt)}`,
      // Facet column (read by the filter engine, not the renderer).
      role: m.roleTitle,
    })),
  }
}

export function shapeRolesList(roles: TeamRole[]): ScreenData {
  return {
    rows: roles.map((r) => ({
      id: r.id,
      name: r.active ? r.title : `${r.title} (inactive)`,
      detail: r.description || `${r.memberCount} member${r.memberCount === 1 ? "" : "s"}`,
      // Facet column (read by the filter engine, not the renderer).
      state: r.active ? "Active" : "Inactive",
    })),
  }
}

export function shapeInvitesList(invites: Invite[]): ScreenData {
  return {
    rows: invites.map((i) => ({
      id: i.id,
      email: i.email,
      detail: `${i.roleTitle} · ${INVITE_STATUS[i.status]}`,
      // Facet column (read by the filter engine, not the renderer).
      status: INVITE_STATUS[i.status],
    })),
  }
}

/** Display label per ticket status (server's underscore form → friendly text).
 * One source for the list detail line; the thread's own status badge uses the
 * library's hyphen labels.
 *
 * SEVEN NOW, and every one of them is a FACT rather than a choice: two arrived on
 * 17 Aug 2026 for the two things a person could previously only assert by hand.
 * "Waiting on you" is deliberately not "Awaiting validation" — the client reads
 * the same word we do, and the plain sentence is the one that gets answered. */
export const HELP_STATUS: Record<HelpTicket["status"], string> = {
  awaiting_validation: "Waiting on you",
  new: "New",
  triaged: "Triaged",
  scheduled: "Scheduled",
  in_progress: "In progress",
  ready: "Ready",
  resolved: "Resolved",
}

/** Trim a ticket description to a single readable list line. */
function truncate(text: string, max = 80): string {
  const clean = text.trim().replace(/\s+/g, " ")
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

export function shapeHelpList(tickets: HelpTicket[]): ScreenData {
  return {
    rows: tickets.map((t) => ({
      id: t.id,
      // THE TITLE, AND ONLY THE TITLE (UI-RULEBOOK K1, CHECKLIST 11.9). The
      // reference used to be prefixed into it — `BERG-T0412 · Can you check…` —
      // which is why a page of tickets read as a wall of text with no shape. It
      // has not been lost: it leads the eyebrow on the record's own screen (D4),
      // where a person looks when a client rings up saying it out loud.
      name: truncate(richTextPlain(t.description)),
      // ONE LINE, TWO FACTS. How far along, and what kind. The story counts and
      // the archived flag went with the same edit: a subtitle carrying four
      // facts is table content smuggled into a list (K2).
      detail: [HELP_STATUS[t.status], t.helpType || "General"].filter(Boolean).join(" · "),
    })),
  }
}

/* -------------------------------- knowledge ------------------------------- */

/** What a source IS, in the words a person uses for it. A `note` is something
 * somebody wrote here; everything else MIRRORS a row the app already owns, and
 * saying which row it mirrors is the honest answer to "why does it know that?". */
export const KNOWLEDGE_KIND: Record<string, string> = {
  note: "Note",
  file: "From a file",
  ticket: "From a ticket",
  // A KIND WITH NO MODULE BEHIND IT ANY MORE. Learning went on 17 Aug 2026 and
  // its 41 articles stayed, already indexed — so this word still names what a
  // source IS even though nothing writes a new one.
  article: "From an article",
  account: "From an account",
  // EVERY KIND THE SWEEP WRITES NEEDS A WORD HERE. A kind missing from this map
  // falls through to its own bare name, so the Kind filter offered "sprint" and
  // "account_links" beside "From a ticket" — and the six kinds added on 18 Aug
  // would have made most of the filter read that way. Held to the kind list by
  // workers/content/test/knowledge-coverage.test.ts, which reads this map off
  // disk — so a new kind cannot ship without a word for it here.
  contact: "From a contact",
  app: "From an app",
  process: "From a process map",
  sprint: "From a sprint",
  story: "From a story",
  meeting: "From a meeting",
  todo: "From a to-do",
  task: "From a task",
  // The four that arrive through somebody's own Google connection — named for
  // the thing rather than the service, the same way the kinds themselves are.
  document: "From a document",
  email: "From an email",
  event: "From a calendar entry",
  message: "From a chat message",
}

/** Where a source is filed, as a person reads it: an account compartment shows
 * the account, the agency's own shows the agency. The id is deliberately NOT
 * printed — a ULID in a filter dropdown is noise; the account's own name is what
 * somebody is scanning for, and the detail screen names it in full. */
function knowledgeFiledUnder(source: KnowledgeSource, accountNames?: Map<string, string>): string {
  if (!source.accountId) return "The agency"
  return accountNames?.get(source.accountId) ?? "A client"
}

export function shapeKnowledgeList(
  sources: KnowledgeSource[],
  accountNames?: Map<string, string>
): ScreenData {
  return {
    rows: sources.map((s) => ({
      id: s.id,
      // A source taken AWAY from the assistant stays in the list (deactivate-not-
      // delete) and says so, the same way a retired article does — seeing what
      // you excluded is half of trusting what you did not.
      name: s.active ? s.title : `${s.title} (not in use)`,
      detail: `${KNOWLEDGE_KIND[s.kind] ?? s.kind} · ${knowledgeFiledUnder(s, accountNames)}${
        s.visibility === "private" ? " · private to you" : ""
      }`,
    })),
  }
}

/* -------------------------------- meetings -------------------------------- */

/** One meeting, as a row: when it was, who it was with and why. The date leads
 * because a diary is scanned by date — the title is what you read once you have
 * found the day. */
export function shapeMeetingsList(meetings: Meeting[]): ScreenData {
  return {
    rows: meetings.map((m) => ({
      id: m.id,
      // A CANCELLED meeting stays in the list (deactivate-not-delete) and says
      // so — "didn't we have a call in March?" is answered either way, and the
      // answer "yes, and we called it off" is a different one from silence.
      name: m.active ? m.title : `${m.title} (cancelled)`,
      // K1: when, and who with. The purpose is a column on the "all" view, which
      // is where a person compares meetings on it (K2).
      detail: [formatDate(m.startsAt), m.accountName ?? "ours"].filter(Boolean).join(" · ") || "—",
      // TABLE COLUMNS, not facets. `client` and `state` are two of the six the
      // "All" view draws, and the diary's filters are the DOOR's now
      // (web/lib/collection-filters.ts) — so these are read by the table and by
      // nothing else. `purpose` went with the facet that was its only reader.
      client: m.accountName ?? "Ours",
      purpose: m.purposeName ?? "Not said",
      // WHETHER IT HAS HAPPENED, FROM THE CLOCK. There used to be a `held` status
      // on the row and this read it; a flag somebody had to remember to tick
      // could disagree with the calendar in both directions, so the start time
      // answers it now and cannot go stale.
      state: !m.active ? "Cancelled" : Date.parse(m.startsAt) < Date.now() ? "Past" : "Upcoming",
      // THE COLUMNS THE "ALL" VIEW SHOWS (CHECKLIST 9.1: "all, with far more
      // columns"). They ride every row rather than a second shaper, because the
      // three views are three renderings of ONE list — a second shaper is a
      // second idea of what a meeting row is, and the two drift.
      // A TABLE COLUMN, and the one the "All" view is most often ordered by — so
      // it is the sortable spelling of a date. The subtitle above it keeps
      // `formatDate`, because that one is read rather than compared.
      when: formatDateSortable(m.startsAt),
      // The bare day the calendar view keys entries on — it wants a date, not a
      // moment, and formatting it for the grid is the grid's job.
      startsOn: m.startsAt.slice(0, 10),
      app: m.appName ?? "—",
      where: m.location ?? "—",
      written: m.notes ? "Yes" : "—",
      reference: m.ref ?? "—",
    })),
  }
}

/* -------------------------------- accounts -------------------------------- */

/** The two kinds an account can be, in the words the screens use. ONE source for
 * the list line, the detail header and the create form (SCOPE ch.03: companies
 * and people are one table, told apart by this). */
export const ACCOUNT_TYPE: Record<Account["accountType"], string> = {
  entity: "Company",
  individual: "Person",
}

/** A stored status ("past_client") as a person reads it ("Past client"). The
 * value is the team's own word, so we only tidy it — never translate it. */
export function accountStatus(raw: string | null): string {
  const s = (raw ?? "").replace(/[_-]+/g, " ").trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""
}

export function shapeAccountsList(accounts: Account[]): ScreenData {
  // The hierarchy, readable in the list itself: name the parent when it is on
  // the page we loaded (for a normal agency, the whole tree is), and otherwise
  // still say the account is nested. Both lines are true — one is just more
  // specific — so a paged list never claims an account is top-level when it
  // isn't. The record's own screen always shows its parent by name.
  const nameById = new Map(accounts.map((a) => [a.id, a.name]))
  return {
    rows: accounts.map((a) => {
      const parent = a.parentAccountId
        ? `under ${nameById.get(a.parentAccountId) ?? "another account"}`
        : ""
      return {
        id: a.id,
        // Archived rows stay visible (archive-never-delete), flagged like retired
        // roles and articles are.
        name: a.active ? a.name : `${a.name} (archived)`,
        // K1: three facts, no more. What it is, where it stands, and where it
        // sits in the tree. The CODE left the line — it is a lookup key, not
        // something anybody scans a list for, and it leads the eyebrow on the
        // record's own screen. The parent stayed, because "under Bergman S.A."
        // is a fact about this row that no other row carries.
        detail:
          [ACCOUNT_TYPE[a.accountType], accountStatus(a.status), parent].filter(Boolean).join(" · ") ||
          "—",
      }
    }),
  }
}

export function shapeMemberDetail(member: TeamMember, activity: ActivityItem[]): ScreenData {
  return {
    record: {
      id: member.userId,
      name: personName(member),
      email: member.email,
      role: member.roleTitle,
      joined: formatDate(member.joinedAt),
      image: member.imageUrl ?? "",
    },
    sets: { activity: shapeActivity(activity) },
  }
}

export function shapeInviteDetail(
  invite: Invite,
  audit: InviteAudit | null,
  activity: ActivityItem[]
): ScreenData {
  return {
    record: {
      id: invite.id,
      email: invite.email,
      role: invite.roleTitle,
      status: INVITE_STATUS[invite.status],
      invitedBy: audit?.inviterName || audit?.inviterEmail || "—",
      invited: formatDate(invite.createdAt),
      expires: formatDate(invite.expiresAt),
      accepted: audit?.accepted && audit.acceptedAt ? formatDate(audit.acceptedAt) : "—",
    },
    sets: { activity: shapeActivity(activity) },
  }
}

/* ------------------- the agency's own housekeeping ------------------------ */
// Two modules, one shaping pattern, and one thing to keep in view while reading
// them: an ARCHIVED row stays in the list. That is deactivate-not-delete showing
// through to the screen — the row is retired, not removed, so it is still there
// to restore — and the `(archived)` suffix plus the `state` facet are how a
// person tells the two apart at a glance. Roles have said "(inactive)" for the
// same reason since the base's first commit; these say "(archived)" because that
// is the word this app's glossary uses for putting a record away without losing
// it.

export function shapeBrandList(items: BrandAsset[]): ScreenData {
  return {
    rows: items.map((a) => ({
      id: a.id,
      name: a.active ? a.name : `${a.name} (archived)`,
      detail: a.category || a.description || "—",
      category: a.category || "—",
      state: a.active ? "Live" : "Archived",
    })),
  }
}

export function shapeBrandDetail(asset: BrandAsset, activity: ActivityItem[]): ScreenData {
  return {
    record: {
      id: asset.id,
      name: asset.name,
      detail: asset.category || "Uncategorised",
      category: asset.category || "—",
      description: asset.description || "—",
      file: asset.fileUrl || "No file yet",
      created: formatDateTime(asset.createdAt),
      createdBy: asset.creatorName || "—",
      updated: asset.updatedAt ? formatDateTime(asset.updatedAt) : "—",
    },
    sets: { activity: shapeActivity(activity) },
  }
}

export function shapePurposesList(items: MeetingPurpose[]): ScreenData {
  return {
    rows: items.map((p) => ({
      id: p.id,
      name: p.active ? p.name : `${p.name} (archived)`,
      detail: p.department || p.description || "—",
      department: p.department || "—",
      state: p.active ? "Live" : "Archived",
    })),
  }
}

export function shapePurposeDetail(purpose: MeetingPurpose, activity: ActivityItem[]): ScreenData {
  return {
    record: {
      id: purpose.id,
      name: purpose.name,
      detail: purpose.department || "No department",
      department: purpose.department || "—",
      description: purpose.description || "—",
      created: formatDateTime(purpose.createdAt),
      createdBy: purpose.creatorName || "—",
      updated: purpose.updatedAt ? formatDateTime(purpose.updatedAt) : "—",
    },
    sets: { activity: shapeActivity(activity) },
  }
}
