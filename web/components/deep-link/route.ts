// The /t/* deep-link grammar — pure URL → route parsing (no React), shared by the
// deep-link screen. /t/<teamId>/<module>/<id>?panel|confirm. Kept separate so the
// resolver component stays focused on data + rendering.

import { parseScreenPath, parseScreenQuery, type ScreenQuery } from "@kwapso/ui/lib/recipe"

import { TEAM_SECTIONS } from "@/lib/pages"

/** The team-area sections (the tab spine across /t/<teamId>/…). */
export type SectionKey =
  | "overview"
  | "members"
  | "roles"
  | "invites"
  | "dropdowns"
  // The agency's own cost card (see TEAM_SECTIONS for why it is a tab, and why
  // the account's card is not beside it).
  | "internal-rates"
  | "accounts"
  | "learning"
  | "tickets"
  | "knowledge"
  | "processes"
  // The work engine's four destinations (see TEAM_SECTIONS for why four).
  | "apps"
  | "sprints"
  | "stories"
  | "tasks"
  | "meetings"
  // The agency's own housekeeping (staff profiles has no section — the owner's
  // ruling puts a profile on the member's own page, not on a page of its own).
  | "marketing"
  | "brand"
  | "delivery"
  | "purposes"
  | "import"

export type Route = {
  teamId: string
  /** friendly URL module segment: team | members | roles | invites (| unknown) */
  module: string
  /** "" = the list / overview level (no record selected) */
  recordId: string
  query: ScreenQuery
  /** true when reached via a clean top-level module URL (/learning, /tickets) rather
   * than /t/<teamId>/… — the host resolves the team from the active context, like
   * /home does. */
  topLevel: boolean
}

/** Top-level app URLs that resolve INSIDE the one deep-link shell (not nested under
 * /t/<teamId>) — the team sidebar pages (/learning, /tickets) AND the account screens
 * (/home, /settings, /invitations). Everything here is in-app, so `go()` moves to it
 * with the History API (no reload); only pre-auth routes (/login, /onboarding) are left
 * out, so leaving the app is a real navigation. */
export const TOP_LEVEL_MODULES = [
  "accounts", "learning", "tickets", "processes",
  // The knowledge base was MISSING from this list while being a sidebar page, so
  // every tap on it left the History API and did a full reload — which throws
  // away the warm in-memory cache the whole caching model is built on. The four
  // work-engine destinations join it here on the way in rather than after the
  // same bug is noticed again.
  "knowledge", "apps", "sprints", "stories", "tasks", "meetings",
  // The agency's own housekeeping — clean top-level URLs, like every other
  // sidebar page (`purposes` rides along because it has records of its own).
  "marketing", "brand", "delivery", "purposes",
  "home", "settings", "invitations",
]

/** The account-level screens the shell renders directly (not team-scoped module content). */
export const ACCOUNT_MODULES = ["home", "settings", "invitations"]

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
  // Top-level module URL: /learning, /learning/<id>, /tickets, /tickets/<id>.
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
