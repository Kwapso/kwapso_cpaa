// The breadcrumb trail for the current URL — pure, no React. Derived from the URL
// spine (the library Breadcrumbs collapses the middle on small screens), so a
// top-level page (/learning) reads as its own page and a /t page sits under
// Settings › team. The last crumb is the current page, so it carries no href.

import { sectionTitle } from "@/components/deep-link/route"
import { personName } from "@/lib/identity"
import { type Crumb } from "@/lib/pages"
import type { Account, Invite, Learning, TeamMember, TeamRole } from "@shared/types"

/** The already-loaded lists a record's own name can be read out of. Undefined =
 * still loading, and a crumb with no label is simply left off. */
export type CrumbRecords = {
  accounts: Account[] | undefined
  members: TeamMember[] | undefined
  roles: TeamRole[]
  invites: Invite[] | undefined
  learning: Learning[] | undefined
}

/** The record's own name for the last crumb — read from the list already in cache
 * (never a fresh fetch), with a plain fallback while that list is loading. */
function recordLabel(module: string | null, recordId: string | null, records: CrumbRecords): string {
  if (module === "accounts") return records.accounts?.find((a) => a.id === recordId)?.name ?? "Account"
  if (module === "members") {
    const member = records.members?.find((m) => m.userId === recordId)
    return member ? personName(member) : "Member"
  }
  if (module === "roles") return records.roles.find((r) => r.id === recordId)?.title ?? "Role"
  if (module === "invites") return records.invites?.find((i) => i.id === recordId)?.email ?? "Invite"
  if (module === "learning") return records.learning?.find((l) => l.id === recordId)?.title ?? "Article"
  if (module === "help") return "Ticket"
  return ""
}

export function buildCrumbs({
  topLevel,
  module,
  recordId,
  teamName,
  teamPath,
  sectionPath,
  records,
}: {
  topLevel: boolean
  module: string | null
  recordId: string | null
  teamName: string
  teamPath: string
  sectionPath: string
  records: CrumbRecords
}): Crumb[] {
  const crumbs: Crumb[] = []
  const last = () => {
    const label = recordLabel(module, recordId, records)
    if (label) crumbs.push({ label })
  }
  if (topLevel) {
    // A top-level page (Learning / Help) — its OWN page, not under Settings.
    crumbs.push({ label: sectionTitle(module ?? ""), href: recordId ? sectionPath : undefined })
    if (recordId) last()
    return crumbs
  }
  crumbs.push({ label: "Settings", href: "/settings" }, { label: teamName, href: teamPath })
  if (module && module !== "team") {
    crumbs.push({ label: sectionTitle(module), href: sectionPath })
    if (recordId) last()
  }
  return crumbs
}
