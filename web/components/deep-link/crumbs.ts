// The breadcrumb trail for the current URL — pure, no React.
//
// TWO STEPS, and never more (the owner's ruling): WHERE YOU ARE, and WHAT IT IS
// INSIDE. On a record that reads "Stories › BERG-S0188"; on a collection it is
// the collection alone, because a page with nothing above it has nothing to say
// in a second crumb.
//
// It used to be four on a team page — "Settings › Bergman S.A. › Members ›
// Aurora" — which is the whole route rather than the position, and the route is
// something the person just walked. The team's own admin sections keep their
// team crumb because the team genuinely IS what they sit inside; the sidebar
// pages sit inside nothing, so they get one crumb and stop.

import { sectionTitle } from "@/components/deep-link/route"
import { personName } from "@/lib/identity"
import { type Crumb } from "@/lib/pages"
import type {
  Account,
  AppRow,
  Invite,
  KnowledgeSource,
  Sprint,
  Story,
  Meeting,
  Task,
  TeamMember,
  TeamRole,
} from "@shared/types"

/** The already-loaded lists a record's own name can be read out of. Undefined =
 * still loading, and a crumb with no label is simply left off. */
export type CrumbRecords = {
  accounts: Account[] | undefined
  members: TeamMember[] | undefined
  roles: TeamRole[]
  invites: Invite[] | undefined
  knowledge: KnowledgeSource[] | undefined
  apps: AppRow[] | undefined
  sprints: Sprint[] | undefined
  stories: Story[] | undefined
  tasks: Task[] | undefined
  meetings: Meeting[] | undefined
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
  if (module === "knowledge")
    return records.knowledge?.find((k) => k.id === recordId)?.title ?? "Source"
  // The work engine. A story and a sprint are said out loud by their REFERENCE
  // (BERG-S0188), which is the whole point of having one — so when the record
  // carries one, that is what the crumb shows.
  if (module === "apps") return records.apps?.find((a) => a.id === recordId)?.name ?? "App"
  if (module === "sprints") {
    const sprint = records.sprints?.find((s) => s.id === recordId)
    return sprint ? (sprint.ref ?? sprint.name) : "Sprint"
  }
  if (module === "stories") {
    const story = records.stories?.find((s) => s.id === recordId)
    return story ? (story.ref ?? story.title) : "Story"
  }
  if (module === "tasks") {
    const task = records.tasks?.find((t) => t.id === recordId)
    return task ? (task.ref ?? task.title) : "Task"
  }
  if (module === "meetings") {
    const meeting = records.meetings?.find((m) => m.id === recordId)
    return meeting ? (meeting.ref ?? meeting.title) : "Meeting"
  }
  if (module === "tickets") return "Ticket"
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
  t,
}: {
  topLevel: boolean
  module: string | null
  recordId: string | null
  teamName: string
  teamPath: string
  sectionPath: string
  records: CrumbRecords
  /** The reader's language. Applied ONLY to a SECTION title — the words we
   * wrote for a destination. A record's own name and a team's own name are
   * somebody's typing and go through untouched. */
  t: (english: string) => string
}): Crumb[] {
  // STEP TWO — the record itself, the page you are on, so it carries no href.
  const here = recordId ? recordLabel(module, recordId, records) : ""

  // The team's own area. The team IS what these sit inside, so it is step one —
  // and on the team overview itself there is nothing above it, so it stands alone.
  if (!topLevel) {
    if (!module || module === "team") return [{ label: teamName }]
    const section: Crumb = { label: t(sectionTitle(module)), href: recordId ? sectionPath : undefined }
    // On a section list, step one is the team; on a record, step one is the
    // section it came out of — always the thing DIRECTLY above, never the route.
    return recordId
      ? here
        ? [section, { label: here }]
        : [section]
      : [{ label: teamName, href: teamPath }, { label: t(sectionTitle(module)) }]
  }

  // A sidebar page (/stories, /tickets, /apps…). It sits inside nothing, so a
  // collection is one crumb and a record is two.
  const section: Crumb = { label: t(sectionTitle(module ?? "")), href: recordId ? sectionPath : undefined }
  return recordId && here ? [section, { label: here }] : [section]
}
