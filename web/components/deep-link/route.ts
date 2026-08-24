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
  /** THE WHOLE TRAIL, deepest last — `[{accounts, BERG}, {stories, S12}]` for
   * `/accounts/BERG/stories/S12`.
   *
   * The URL grammar has always supported this: `parseScreenPath` returns an
   * array of levels and always has. What was missing is that `parseRoute` read
   * `levels[0]` and dropped everything after it, so a nested address parsed
   * correctly and then rendered the OUTERMOST screen — and the panels, at the
   * other end, stripped the collection segment off the path before appending
   * (`basePath.replace(/\/accounts$/, "")`) so a nested address was never built
   * in the first place. Half a feature at each end, which is why opening a story
   * from a client lost the client.
   *
   * `module` and `recordId` are the DEEPEST level, which is what a screen
   * renders — so every existing consumer keeps working unchanged and a nested
   * URL simply shows the right thing. The trail is here for the crumbs and for
   * anything else that needs to know what a record was opened inside. */
  levels: { module: string; id: string }[]
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
    return { teamId: segs[1] ?? "", ...deepest(levels), levels, query, topLevel: false }
  }
  // Top-level module URL: /tickets, /tickets/<id>, /accounts, /accounts/<id>,
  // and now /accounts/<id>/stories/<id> — the nested form the grammar always
  // allowed and the router used to throw away.
  const levels = parseScreenPath(segs)
  return { teamId: "", ...deepest(levels), levels, query, topLevel: true }
}

/** WHAT A NESTED ADDRESS RENDERS: the innermost level.
 *
 * `/accounts/BERG/stories/S12` shows the STORY — you asked for the story, and
 * the client it sits in is context rather than the destination. Reading
 * `levels[0]` instead (which is what this did) showed the account and ignored
 * everything the person had actually clicked.
 *
 * An empty path is the team overview, which is what "" has always meant here. */
function deepest(levels: { module: string; id: string }[]): { module: string; recordId: string } {
  const last = levels[levels.length - 1]
  return { module: last?.module || "team", recordId: last?.id || "" }
}

/** THE ADDRESS OF A SCREEN, BUILT FROM THE TRAIL IT WAS OPENED THROUGH.
 *
 * THE OWNER, 24 Aug 2026, going Accounts → Confia → Apps → CONFIA → Sprints →
 * a sprint, and landing on `/apps/…/sprints/…`:
 *
 *   "that middle screen that I went to has just been erased. I spoke about
 *    nesting, not replacing."
 *
 * He was reading the symptom of one line. Every screen used to rebuild its own
 * address out of its CURRENT MODULE — `/${module}` — so at
 * `/accounts/CONFIA/apps/A1` the module is `apps` and the base became `/apps`.
 * The account was gone before a single link was built, and every link the screen
 * then handed to its panels was already missing it. One hop in, and the trail
 * was one level long again — which is why it looked like nesting worked and then
 * quietly stopped.
 *
 * So the address is DERIVED FROM THE TRAIL, in the one place both the shell and
 * the crumbs read it from. `withRecord: false` gives the COLLECTION the deepest
 * level belongs to, in its context — `/accounts/CONFIA/apps` — which is what a
 * detail screen hands its panels as their base, so the next hop appends rather
 * than restarts. Nothing caps how deep that goes, which was the point. */
export function trailPath(
  levels: { module: string; id: string }[],
  teamPath: string,
  topLevel: boolean,
  opts: { upto?: number; withRecord?: boolean } = {}
): string {
  const upto = opts.upto ?? levels.length - 1
  const withRecord = opts.withRecord ?? true
  const parts = levels
    .slice(0, upto + 1)
    .flatMap((l, i) => (i === upto && !withRecord ? [l.module] : [l.module, l.id]))
    .filter(Boolean)
  return (topLevel ? "" : teamPath) + "/" + parts.join("/")
}

/** The friendly title for a module segment (for breadcrumbs). */
export function sectionTitle(module: string): string {
  return TEAM_SECTIONS.find((s) => s.segment === module)?.title ?? "Team"
}
