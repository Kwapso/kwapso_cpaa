// Per-module SHAPING — pure functions turning already-loaded app data into the
// flat ScreenData (records / rows / sets) each recipe reads. No hooks, no
// fetching: the resolver guards loading/errors then calls these, so they're
// trivially unit-testable and keep the resolver lean.

import { type ScreenData } from "@kwapso/ui/registry/collections/screen-renderer/screen-renderer"

import { formatActivityWhen, formatDate, formatDateTime } from "@shared/web/format"
import { personName } from "@/lib/identity"
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
  Task,
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
 * library's hyphen labels. */
export const HELP_STATUS: Record<HelpTicket["status"], string> = {
  new: "New",
  triaged: "Triaged",
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
      // THE NUMBER THE CLIENT QUOTES, first (SCOPE ch.02 — "BERG-T0412"). The
      // whole point of a reference is that somebody can say it out loud, and it
      // was rendered on no screen at all: the column shipped, the sequence
      // shipped, the machine surface returned it, and a person could not see it.
      name: t.ref ? `${t.ref} · ${truncate(t.description)}` : truncate(t.description),
      detail: [
        t.helpType || "General",
        HELP_STATUS[t.status],
        // How much work is on it, and nothing else about that work — the same
        // two numbers a client is shown on their own side of the fence.
        t.storyCount > 0 ? `${t.doneStoryCount} of ${t.storyCount} done` : null,
        t.archivedAt ? "archived" : null,
      ]
        .filter(Boolean)
        .join(" · "),
      // Facet column (read by the filter engine, not the renderer).
      status: HELP_STATUS[t.status],
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
      // Facet columns (read by the filter engine, not the renderer).
      kind: KNOWLEDGE_KIND[s.kind] ?? s.kind,
      filed: knowledgeFiledUnder(s, accountNames),
      state: s.active ? "In use" : "Not in use",
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
      detail:
        [
          formatDate(m.startsAt),
          m.accountName ?? "ours",
          m.purposeName,
          !m.active ? "cancelled" : m.status === "held" ? "held" : null,
        ]
          .filter(Boolean)
          .join(" · ") || "—",
      // Facet columns (read by the filter engine, not the renderer).
      client: m.accountName ?? "Ours",
      purpose: m.purposeName ?? "Not said",
      state: !m.active ? "Cancelled" : m.status === "held" ? "Held" : "Scheduled",
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
        detail:
          [ACCOUNT_TYPE[a.accountType], a.code, accountStatus(a.status), parent]
            .filter(Boolean)
            .join(" · ") || "—",
        // Facet columns (read by the filter engine, not the renderer).
        type: ACCOUNT_TYPE[a.accountType],
        status: accountStatus(a.status) || "—",
        archived: a.active ? "No" : "Yes",
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

/** ONE TASK, as a record. The only work-engine detail that is a recipe rather
 * than a component: an app, a sprint and a story each carry a collection tab or
 * a status track that no engine block draws, and a task carries neither — it is
 * a title, a date and a tick. */
export function shapeTaskDetail(task: Task, activity: ActivityItem[]): ScreenData {
  return {
    record: {
      id: task.id,
      name: task.ref ? `${task.ref} · ${task.title}` : task.title,
      detail: task.status === "done" ? "Done" : "Open",
      status: task.status === "done" ? "Done" : "Open",
      assignee: task.assigneeName || "Nobody yet",
      due: task.dueOn ? formatDate(task.dueOn) : "—",
      detailText: task.detail || "—",
      created: formatDateTime(task.createdAt),
      createdBy: task.createdByName || "—",
    },
    sets: { activity: shapeActivity(activity) },
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
