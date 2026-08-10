// Per-module SHAPING — pure functions turning already-loaded app data into the
// flat ScreenData (records / rows / sets) each recipe reads. No hooks, no
// fetching: the resolver guards loading/errors then calls these, so they're
// trivially unit-testable and keep the resolver lean.

import { type ScreenData } from "@kwapso/ui/registry/collections/screen-renderer/screen-renderer"

import { formatActivityWhen, formatDate, formatDateTime } from "@/lib/format"
import { personName } from "@/lib/identity"
import type {
  Account,
  ActivityItem,
  HelpTicket,
  Invite,
  InviteAudit,
  Learning,
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
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  reopened: "Reopened",
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
      name: truncate(t.description),
      detail: `${t.helpType || "Help"} · ${HELP_STATUS[t.status]}`,
      // Facet column (read by the filter engine, not the renderer).
      status: HELP_STATUS[t.status],
    })),
  }
}

export function shapeLearningList(items: Learning[]): ScreenData {
  return {
    rows: items.map((l) => ({
      id: l.id,
      // Inactive items stay visible to curators (deactivate-not-delete) — flag it
      // in the title, matching how roles show "(inactive)".
      name: l.active ? l.title : `${l.title} (inactive)`,
      detail: l.category || l.description || "—",
      // Facet columns (read by the filter engine, not the renderer).
      category: l.category || "—",
      state: l.active ? "Active" : "Inactive",
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
