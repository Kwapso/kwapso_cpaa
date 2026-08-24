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

import { sectionTitle, trailPath } from "@/components/deep-link/route"
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

/** A row as it arrives — from a loaded list, or from the record's own by-id door.
 * They are the same row, which is the whole reason one table can name both. */
type Row = Record<string, unknown>

const str = (row: Row, field: string): string => {
  const v = row[field]
  return typeof v === "string" && v.trim() ? v : ""
}

/** HOW EACH RECORD TYPE SAYS ITS OWN NAME — the one table, read three ways.
 *
 * By the CRUMB, over a row out of the list already in cache. By the TRAIL
 * RESOLVER (trail-names.ts), over a row read by id when the loaded page never
 * reached it. And by the CHECK, which proves every URL segment that can carry a
 * record id has a line here.
 *
 * IT USED TO BE A RUN OF `if (module === "x")`, and that shape had two failures
 * in it at once when the owner hit it on 24 Aug 2026 at
 * `/accounts/…/apps/…/processes/…`:
 *
 *   "does it not make sense that all of the breadcrumbs should hold the name of
 *    the record of the detail screen which was open, rather than the name of
 *    the module?"
 *
 * `processes` had NO branch, so the deepest crumb resolved to "" and was dropped
 * — the record he was looking at went unnamed. And `accounts` had one, but the
 * accounts list is PAGED at fifty and Confia is row 118 of 131, so the lookup
 * found nothing and the crumb said the generic word "Account" with the client's
 * name on the screen underneath it.
 *
 * Both are the same defect: A NAME THAT DEPENDS ON A LIST HAPPENING TO BE
 * LOADED. So `list` is optional and `resource` is not — every record type can be
 * READ by id, and the loaded list is only ever the fast path. `fallback` is what
 * shows for the instant before that read lands, never the resting state.
 *
 * `idField` is here because a member is found by `userId` and everything else by
 * `id`, which is exactly the kind of detail a hand-written branch gets right
 * once and a new one gets wrong. */
export const RECORD_FACE: Record<
  string,
  {
    /** the field this record is FOUND by inside its list */
    idField: string
    /** which already-loaded list its rows arrive in, when one is loaded at all */
    list?: keyof CrumbRecords
    /** the TEAM_RESOURCES key whose `fetchOne` reads one row by id */
    resource: string
    /** the name it says out loud, from its own row */
    name: (row: Row) => string
    /** the word shown for the instant before that name arrives */
    fallback: string
  }
> = {
  accounts: { idField: "id", list: "accounts", resource: "accounts", name: (r) => str(r, "name"), fallback: "Account" },
  members: {
    idField: "userId",
    list: "members",
    resource: "members",
    name: (r) => personName(r as unknown as TeamMember),
    fallback: "Member",
  },
  roles: { idField: "id", list: "roles", resource: "member_roles", name: (r) => str(r, "title"), fallback: "Role" },
  invites: { idField: "id", list: "invites", resource: "invites", name: (r) => str(r, "email"), fallback: "Invite" },
  knowledge: {
    idField: "id",
    list: "knowledge",
    resource: "knowledge",
    name: (r) => str(r, "title"),
    fallback: "Source",
  },
  // The work engine. A story, a sprint, a task, a meeting and a ticket are said
  // out loud by their REFERENCE (BERG-S0188), which is the whole point of having
  // one — so when the record carries one, that is what the crumb shows.
  apps: { idField: "id", list: "apps", resource: "apps", name: (r) => str(r, "name"), fallback: "App" },
  sprints: {
    idField: "id",
    list: "sprints",
    resource: "sprints",
    name: (r) => str(r, "ref") || str(r, "name"),
    fallback: "Sprint",
  },
  stories: {
    idField: "id",
    list: "stories",
    resource: "stories",
    name: (r) => str(r, "ref") || str(r, "title"),
    fallback: "Story",
  },
  tasks: {
    idField: "id",
    list: "tasks",
    resource: "tasks",
    name: (r) => str(r, "ref") || str(r, "title"),
    fallback: "Task",
  },
  meetings: {
    idField: "id",
    list: "meetings",
    resource: "meetings",
    name: (r) => str(r, "ref") || str(r, "title"),
    fallback: "Meeting",
  },
  // A TICKET HAS A NAME AND USED TO BE TOLD IT DID NOT. This returned the
  // constant "Ticket" — the one record type whose crumb could never say which
  // record it was — while every ticket carries the reference the client quotes
  // down the phone. No list is named here on purpose: tickets are 1,820 rows
  // behind a paged door, so the by-id read is the honest path rather than the
  // exception.
  tickets: { idField: "id", resource: "help", name: (r) => str(r, "ref"), fallback: "Ticket" },
  // A PROCESS MAP, which had no line here at all — the omission the owner
  // caught. No list either: `processes` is a contextual section, so its
  // collection is not among the ones a nested screen loads.
  processes: { idField: "id", resource: "processes", name: (r) => str(r, "name"), fallback: "Process" },
  // A wave has no reference of its own — it is said out loud by its name, which
  // is the only thing that tells two identical packages apart. No `list`: the
  // trail resolver reads it by id through TEAM_RESOURCES.
  waves: { idField: "id", resource: "waves", name: (r) => str(r, "name"), fallback: "Wave" },
}

/** DOES A LOADED LIST ALREADY HOLD THIS RECORD'S NAME — the question the crumb
 * asks first and the trail resolver asks in reverse (it reads exactly the levels
 * this answers no for). One function, so the two can never disagree about which
 * level still needs a read. */
export function namedByList(module: string, recordId: string, records: CrumbRecords): string {
  const face = RECORD_FACE[module]
  if (!face?.list) return ""
  const list = records[face.list] as Row[] | undefined
  const row = list?.find((r) => r[face.idField] === recordId)
  return row ? face.name(row) : ""
}

/** The record's own name for a crumb — from the list already in cache, then from
 * whatever the trail resolver has read by id, and only then the generic word. */
function recordLabel(
  module: string | null,
  recordId: string | null,
  records: CrumbRecords,
  resolved: ReadonlyMap<string, string> = new Map()
): string {
  const face = RECORD_FACE[module ?? ""]
  if (!face || !recordId) return ""
  return (
    namedByList(module as string, recordId, records) ||
    resolved.get(`${module}:${recordId}`) ||
    face.fallback
  )
}

/** THE PATH UP TO AND INCLUDING ONE LEVEL, so every crumb above the last is a
 * link that lands exactly where it says.
 *
 * `/accounts/CONFIA/sprints/S1/tickets/T9` at level 1 is
 * `/accounts/CONFIA/sprints/S1` — the sprint, still inside the client. It is
 * `trailPath` in route.ts, which the SHELL now builds its own address with too:
 * the crumbs and the screen cannot disagree about where a nested record lives,
 * because there is one function that answers it. */
const pathTo = (
  levels: { module: string; id: string }[],
  upto: number,
  teamPath: string,
  topLevel: boolean
): string => trailPath(levels, teamPath, topLevel, { upto })

export function buildCrumbs({
  topLevel,
  module,
  recordId,
  levels,
  teamName,
  teamPath,
  sectionPath,
  records,
  resolved,
  t,
}: {
  topLevel: boolean
  module: string | null
  recordId: string | null
  /** The whole trail, deepest last (route.ts). Empty or one level = the flat
   * case this has always handled. */
  levels?: { module: string; id: string }[]
  teamName: string
  teamPath: string
  sectionPath: string
  records: CrumbRecords
  /** NAMES READ BY ID for the levels no loaded list could name — `module:id` →
   * the record's own name (trail-names.ts). Empty until those reads land, which
   * is why every label still has a fallback behind it. */
  resolved?: ReadonlyMap<string, string>
  /** The reader's language. Applied ONLY to a SECTION title — the words we
   * wrote for a destination. A record's own name and a team's own name are
   * somebody's typing and go through untouched. */
  t: (english: string) => string
}): Crumb[] {
  // STEP TWO — the record itself, the page you are on, so it carries no href.
  const here = recordId ? recordLabel(module, recordId, records, resolved) : ""

  // A NESTED ADDRESS SHOWS THE WHOLE WAY IN (the owner, 24 Aug 2026, widening
  // his own earlier two-step ruling, and asking for it explicitly without a
  // depth limit): "If I share a link where I've gone into an app, then into a
  // sprint, and into a ticket, and from that ticket I've gone to a team member…
  // they should literally go in through the same nest."
  //
  // WHY THIS DOES NOT REOPEN THE THING HE OBJECTED TO. The ruling this widens
  // was earned by "Settings › Bergman S.A. › Members › Aurora" on a page reached
  // in one click — the whole ROUTE recited on a screen that sits inside none of
  // it. A nested address is the opposite case: every step really is a record the
  // one after it lives inside, and the crumb is the only way back out.
  //
  // ONE CRUMB PER ANCESTOR, then the last level's collection and its record —
  // which is exactly the shape he described for the two-level case, "Confia ›
  // Stories › BERG-S0188", and simply keeps going for deeper ones.
  const trail = levels ?? []
  if (trail.length > 1) {
    const crumbs: Crumb[] = trail.slice(0, -1).map((l, i) => ({
      // A record whose list is not loaded falls back to its section's name, so a
      // shared link opened cold still shows an unbroken trail rather than gaps.
      label: recordLabel(l.module, l.id, records, resolved) || t(sectionTitle(l.module)),
      href: pathTo(trail, i, teamPath, topLevel),
    }))
    const last = trail[trail.length - 1]
    // NO GENERIC RUNG ABOVE A NESTED RECORD. It used to push the last level's
    // SECTION name — "Confia › Sprints › CONFIA-SPR0020" — and the owner caught
    // both things wrong with it on 24 Aug 2026:
    //
    //   "it is behaving and showing me the word 'story' like I went to the
    //    stories page and then did it… whenever I click on story, it has no
    //    response, no output."
    //
    // He is right twice. He never visited the Sprints page — he opened a client
    // and went in from there — so a rung saying he did is a route he did not
    // walk, which is the exact thing the two-step ruling was made to stop. And
    // the rung was DEAD: `pathTo` at the last index includes that level's id, so
    // the link pointed at the page already open. Clicking it navigated to where
    // he was, which is indistinguishable from a broken link.
    //
    // A nested COLLECTION is the one case where this level is a destination
    // rather than a description — `/accounts/CONFIA/sprints` IS the sprints of
    // that client — so there it stays, and it is the page you are on, so it
    // carries no href either.
    if (!last.id) crumbs.push({ label: t(sectionTitle(last.module)) })
    else if (here) crumbs.push({ label: here })
    return crumbs
  }

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
