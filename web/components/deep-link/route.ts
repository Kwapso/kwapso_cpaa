// The /t/* deep-link grammar — pure URL → route parsing (no React), shared by the
// deep-link screen. /t/<teamId>/<module>/<id>?panel|confirm. Kept separate so the
// resolver component stays focused on data + rendering.

import { parseScreenPath, parseScreenQuery, type ScreenQuery } from "@shared/ui/lib/recipe"

import { TEAM_SECTIONS, type TeamSection } from "@/lib/pages"

/** The team-area sections (the tab spine across /t/<teamId>/…) — the SAME set
 * as the section table's own keys, derived rather than written out a second
 * time. Two spellings of one union is two places a section can be added to, and
 * the copy that gets forgotten is the one nothing renders. */
export type SectionKey = TeamSection["key"]

/** WHICH SECTION A MODULE SEGMENT IS, read off the section table.
 *
 * It used to be a hand-written list of nineteen segments inside the deep-link
 * screen, and `time` was never on it — so Work logs resolved to `overview`,
 * whose placement is "tab", and a sidebar page drew the Settings tab strip over
 * itself. The list was the defect, not the missing line: the twentieth section
 * would have repeated it. `sectionTitle` below has always read this same table
 * the same way; this is its other half.
 *
 * The empty segment is the team overview itself, which is also where an
 * unrecognised module lands — so it is skipped here rather than special-cased. */
export function sectionFor(module: string): SectionKey {
  return TEAM_SECTIONS.find((s) => s.segment !== "" && s.segment === module)?.key ?? "overview"
}

export type Route = {
  teamId: string
  /** friendly URL module segment: team | members | roles | invites (| unknown) */
  module: string
  /** "" = the list / overview level (no record selected) */
  recordId: string
  query: ScreenQuery
  /** true when reached via a clean top-level module URL (/tickets, /accounts) rather
   * than /t/<teamId>/… — the host resolves the team from the active context, like
   * /home does. */
  topLevel: boolean
}

/** Top-level app URLs that resolve INSIDE the one deep-link shell (not nested under
 * /t/<teamId>) — the team sidebar pages (/tickets, /accounts) AND the account screens
 * (/home, /settings, /invitations). Everything here is in-app, so `go()` moves to it
 * with the History API (no reload); only pre-auth routes (/login, /onboarding) are left
 * out, so leaving the app is a real navigation. */
export const TOP_LEVEL_MODULES = [
  "accounts", "tickets", "processes",
  // The knowledge base was MISSING from this list while being a sidebar page, so
  // every tap on it left the History API and did a full reload — which throws
  // away the warm in-memory cache the whole caching model is built on. The four
  // work-engine destinations join it here on the way in rather than after the
  // same bug is noticed again.
  "knowledge", "apps", "sprints", "stories", "tasks", "time", "meetings",
  // The agency's own housekeeping — clean top-level URLs, like every other
  // sidebar page (`purposes` rides along because it has records of its own).
  "brand", "purposes",
  // The agency itself (CHECKLIST 10.1) — an account-level screen like Settings,
  // because it is about the team rather than a collection inside one.
  "home", "kwapso", "settings", "invitations", "profile",
]

/** The account-level screens the shell renders directly (not team-scoped module content). */
export const ACCOUNT_MODULES = ["home", "kwapso", "settings", "invitations", "profile"]

export function parseRoute(pathname: string, search: string): Route {
  const segs = pathname.split("/").filter(Boolean) // ["t", teamId, module?, id?] OR [module, id?]
  const query = parseScreenQuery(new URLSearchParams(search))
  if (segs[0] === "t") {
    const levels = parseScreenPath(segs.slice(2)) // [{module,id}, …]
    return {
      teamId: segs[1] ?? "",
      module: levels[0]?.module || "team",
      recordId: levels[0]?.id || "",
      query,
      topLevel: false,
    }
  }
  // Top-level module URL: /tickets, /tickets/<id>, /accounts, /accounts/<id>.
  const levels = parseScreenPath(segs)
  return {
    teamId: "",
    module: levels[0]?.module || "team",
    recordId: levels[0]?.id || "",
    query,
    topLevel: true,
  }
}

/** The friendly title for a module segment (for breadcrumbs). */
export function sectionTitle(module: string): string {
  return TEAM_SECTIONS.find((s) => s.segment === module)?.title ?? "Team"
}
