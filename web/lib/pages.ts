// The page registry — ONE source for the app's navigation, slugs and the
// per-tab permission a screen needs. The nav shell, breadcrumbs and the page
// guard all read from here, so adding a screen is a one-line change.

/** Top-level destinations (sidebar on desktop, bottom tabs on mobile).
 * `need` (optional) is a right required to see it — gated destinations vanish
 * from the nav for people who lack it. Home/Settings are universal. */
export type NavItem = {
  slug: string
  path: string
  title: string
  icon: "home" | "settings"
  need?: { module: string; right: "read" }
  /** Which half of the rail it sits in — see NavGroup below. */
  group: NavGroup
}

/** THE RAIL HAS TWO HALVES, with a divider between them (the owner's ruling, and
 * he rejected both alternatives put to him: "keep it under nine" would have hidden
 * real destinations behind a More, and "show everything flat" is the fourteen-item
 * wall this replaces).
 *
 *   • "daily"      — what somebody opens most days: the work in hand, what clients
 *                    have asked for, who they are, and our own admin.
 *   • "occasional" — what somebody opens when they need it: the blocks work was
 *                    sold in, the systems it runs on, the maps, and the material.
 *
 * The grouping is a fact about a destination, so it lives beside the destination
 * rather than in the shell — the shell just draws whatever the registry says. */
export type NavGroup = "daily" | "occasional"

export const NAV: NavItem[] = [
  { slug: "home", path: "/home", title: "Home", icon: "home", group: "daily" },
  { slug: "settings", path: "/settings", title: "Settings", icon: "settings", group: "occasional" },
]

/** The mobile bottom-bar set: only destinations the user can reach, capped at 5
 * (extras would fold into a "More" entry), in the SAME order as the desktop rail —
 * Home, Learning, Tickets, Settings (the owner's locked order; no centre-pinning).
 * Generic over the link shape so the shell can pass its composed Home + team
 * sidebar pages + Settings list, not just the bare NAV. */
export function bottomNavItems<T extends { slug: string }>(items: T[]): T[] {
  return items.slice(0, 5)
}

/** The sections of a team's area (the switcher across /t/<teamId>/…). `module` is
 * the read-right needed to see it; `segment` is the URL segment under the team
 * (empty = the team overview at /t/<teamId> itself). Activity lives as a tab on
 * the Overview screen, so it isn't a separate section. */
export type TeamSection = {
  key:
    | "overview"
    | "members"
    | "roles"
    | "invites"
    | "dropdowns"
    // WHAT OUR OWN HOUR COSTS US — the agency's own cost card, as a tab on the
    // team area beside the other admin sections. A TAB rather than a sidebar
    // page because it is one small settled list somebody sets and leaves, not a
    // destination anybody opens in a working day. Its twin — what an ACCOUNT is
    // charged — is deliberately NOT here: that card lives on the account's own
    // record, because the question is always about one client (R24 · SCOPE).
    | "internal-rates"
    | "accounts"
    | "learning"
    | "tickets"
    | "knowledge"
    | "processes"
    // THE WORK ENGINE, as four destinations rather than one page with four
    // panels on it. The owner's ruling: apps, sprints, stories and tasks each
    // get a section of their own AND a tab on the record above them — both
    // places, all four, because the path somebody takes to a piece of work is
    // not knowable in advance ("it should not matter — all three should get her
    // there"). `stories` is the old `work` page, renamed to the word the
    // glossary uses for what is on it now that the sprints have moved out.
    | "apps"
    | "sprints"
    | "time"
    | "stories"
    | "tasks"
    // MEETINGS — a section of its own, which is what the owner asked for. It sits
    // in `daily` beside Stories and Tasks: a diary is something somebody opens
    // before their first call, not an inventory they consult twice a year.
    | "meetings"
    // The agency's own housekeeping. Four sidebar pages rather than admin tabs:
    // a marketing calendar and a brand library are somebody's actual work, not a
    // setting. Staff profiles has NO section of its own — the owner's ruling is
    // that a profile lives on the member's own page, so its screens hang off
    // Members instead and its module never appears in this table.
    | "marketing"
    | "brand"
    | "delivery"
    | "purposes"
    | "import"
  title: string
  module: string
  segment: string
  /** Where this destination appears in navigation:
   *  - "tab": a tab on the team area (the admin sections under Settings → team)
   *  - "sidebar": a first-class left-sidebar page (team-scoped, gated by its read right)
   *  - "contextual": reached from a button on another page (e.g. Import) — never a tab or sidebar item */
  placement: "tab" | "sidebar" | "contextual"
  /** The team-scoped cache-key PREFIX whose loaded rows ARE this section's count
   * (deep-link-screen keys each collection `${prefix}:${teamId}`). Present on every
   * section that leads with a collection, so the tab-count badge is DERIVED from
   * the same rows the screen shows and can never be forgotten (LAW R8). Absent on
   * metadata/non-collection tabs (Overview) and non-tab destinations (Import). */
  countCacheKey?: string
  /** Which half of the sidebar rail this destination sits in. Required on every
   * `placement: "sidebar"` section and meaningless on the others — a tab is not
   * in the rail at all, and a contextual page is reached from a button. */
  group?: NavGroup
}

export const TEAM_SECTIONS: TeamSection[] = [
  // Overview leads with team metadata, not a collection → no countCacheKey (LAW R8 exception).
  { key: "overview", title: "Overview", module: "teams", segment: "", placement: "tab" },
  { key: "members", title: "Members", module: "team_members", segment: "members", placement: "tab", countCacheKey: "members" },
  { key: "roles", title: "Member roles", module: "member_roles", segment: "roles", placement: "tab", countCacheKey: "member_roles" },
  { key: "invites", title: "Invites", module: "team_members", segment: "invites", placement: "tab", countCacheKey: "invites" },
  // Dropdown values ("selectable data") — managed on the team page, a tab beside
  // the other admin sections. Gated by the selectable_data module.
  { key: "dropdowns", title: "Dropdown values", module: "selectable_data", segment: "dropdowns", placement: "tab", countCacheKey: "selectable" },
  // Internal rates — gated on `commercials`, so a role without that read right
  // never sees the tab at all. The segment says `internal-rates` in full rather
  // than `rates`: an ambiguous URL is how somebody eventually wires the wrong
  // card to it, and the two cards are the one pair in this app where mixing them
  // up is a rule broken rather than a bug (R24).
  { key: "internal-rates", title: "Internal rates", module: "commercials", segment: "internal-rates", placement: "tab", countCacheKey: "internal_rates" },
  // Accounts — the companies and people the team works with (the customer spine,
  // SCOPE ch.03). A first-class SIDEBAR page: it's the day's work, not an admin
  // setting. Its count is an exact server total (R16) keyed off the same
  // `accounts:<teamId>` cache the list reads, so the badge and the rows agree.
  //
  // ══ THE SIDEBAR ORDER IS THIS LIST'S ORDER ═══════════════════════════════
  // The shell composes Home, then these in the order they appear here, then
  // Settings — and THEN partitions by `group`, drawing the divider between the
  // two halves. So a page's place on the rail is two facts and no third: where
  // its line sits in this list, and which group it declares. Moving a page is
  // moving its line.
  //
  // The owner's sequence, fixed 13 Aug 2026:
  //   daily       Home · Accounts · Knowledge base · Tickets · Stories · Tasks
  //   occasional  Meetings · Apps · Process maps · Sprints · Marketing ·
  //               Brand library · Delivery method · Learning · Settings
  //
  // Two pages changed halves with it. KNOWLEDGE BASE moved up into the daily
  // set — it stopped being a library somebody consults and became the thing the
  // team asks first, which is a different habit and belongs above the fold.
  // MEETINGS moved down out of it: the diary is read when there is a meeting,
  // not every morning. LEARNING moved to the end of the occasional half, next
  // to Settings, which is where a how-to library is looked for.
  //
  // Accounts — the companies and people the team works with (the customer spine,
  // SCOPE ch.03). A first-class SIDEBAR page: it's the day's work, not an admin
  // setting. Its count is an exact server total (R16) keyed off the same
  // `accounts:<teamId>` cache the list reads, so the badge and the rows agree.
  { key: "accounts", title: "Accounts", module: "accounts", segment: "accounts", placement: "sidebar", countCacheKey: "accounts", group: "daily" },
  // The knowledge base — what the assistant is allowed to read, and the one
  // screen where a person can see it, add to it, correct it and take something
  // out. Gated by its own module, so a role without it never sees the
  // destination at all.
  { key: "knowledge", title: "Knowledge base", module: "knowledge", segment: "knowledge", placement: "sidebar", countCacheKey: "knowledge", group: "daily" },
  // Tickets is the one place in this table where the URL segment is NOT the
  // permission module. The section, the page and the address bar say `tickets`,
  // because that is the word for the thing (glossary, SCOPE ch.02). The right the
  // server enforces is still `help`: it is the string sitting in every role's
  // permission sheet, in every team database, and renaming it would be a data
  // migration that could only ever take somebody's access away. `MODULE_PERMISSION`
  // in lib/screens.ts is the one seam that translates between the two.
  { key: "tickets", title: "Tickets", module: "help", segment: "tickets", placement: "sidebar", countCacheKey: "help", group: "daily" },
  // ── THE WORK ENGINE, AS FOUR DESTINATIONS ────────────────────────────────
  // Apps → Sprints → Stories, plus our own admin beside them. Each is a section
  // AND a tab on the record above it, because the owner's comprehension answer
  // on where a person starts looking was "it should not matter — all three
  // should get her there". One path is a dead end in somebody's head; three are
  // a product.
  //
  // Stories is the page that used to be called Work. The sprints moved out to a
  // section of their own, so what is left on it is the backlog — and the word
  // for that in the glossary is Story. The URL segment moved with the title
  // rather than being kept for old links: nothing outside this app has ever
  // linked to /work, and a segment that disagrees with its heading is a cost
  // paid for ever (Tickets pays it because a permission STRING in every team's
  // database is behind it — there is no such string here, the module is `work`
  // either way).
  //
  // Stories and Tasks are daily. Sprints and apps are not: a sprint is a
  // contract and an app is an inventory, and neither is opened before lunch.
  { key: "stories", title: "Stories", module: "work", segment: "stories", placement: "sidebar", countCacheKey: "stories", group: "daily" },
  { key: "tasks", title: "Tasks", module: "work", segment: "tasks", placement: "sidebar", countCacheKey: "tasks", group: "daily" },
  // TIME — the fourth daily destination, and the one that had none.
  //
  // A work log is the row every figure in this app is eventually built on, and
  // there was nowhere to go and look at one: the whole list lived in a panel at
  // the FOOT of the Stories page, under the backlog, and a story's own Time tab
  // showed the handful logged against that story. Both are the right place for
  // what they do — a start button belongs beside the work, and a story's hours
  // belong on the story — and neither is a place a person goes to find "the time
  // I logged". A tester with 115 entries reported she could not find any of it.
  //
  // "Time" rather than "Work logs": the glossary defines a work log as "one row
  // of time", and the two screens that already show them are both headed Time.
  // The count is the exact number of ROWS (R16), keyed off the same cache the
  // list reads; the hours are a second, different number the screen says itself.
  { key: "time", title: "Time", module: "work", segment: "time", placement: "sidebar", countCacheKey: "work-logs", group: "daily" },
  // ── and below the divider ────────────────────────────────────────────────
  { key: "meetings", title: "Meetings", module: "meetings", segment: "meetings", placement: "sidebar", countCacheKey: "meetings", group: "occasional" },
  // Apps gate on `processes`, not `work`: an app is the thing a process map
  // hangs off, and the module that owns the App → Process → Step chain is the
  // one whose right a person needs to see any of it.
  { key: "apps", title: "Apps", module: "processes", segment: "apps", placement: "sidebar", countCacheKey: "apps", group: "occasional" },
  // Process maps — App → Process → Step, and the value drilled through them. Its
  // count is the exact server total of the PROCESSES (the collection the screen
  // leads with and the one that grows), keyed off the same `processes:<teamId>`
  // cache the list reads.
  { key: "processes", title: "Process maps", module: "processes", segment: "processes", placement: "sidebar", countCacheKey: "processes", group: "occasional" },
  { key: "sprints", title: "Sprints", module: "work", segment: "sprints", placement: "sidebar", countCacheKey: "sprints", group: "occasional" },
  // THE AGENCY'S OWN HOUSEKEEPING — three sidebar pages, each gated by its own
  // read right so a role without it never sees the destination at all. Their
  // counts are exact server totals (R16) keyed off the same caches the lists
  // read, so the badge and the rows can never disagree.
  //
  // `delivery` leads with the PROGRAMMES: a screen with two collections has to
  // badge one of them, and the programme is the thing somebody arrives looking
  // for (the meeting purposes sit under it on the same screen, with their own
  // heading and their own count).
  { key: "marketing", title: "Marketing", module: "marketing", segment: "marketing", placement: "sidebar", countCacheKey: "marketing", group: "occasional" },
  { key: "brand", title: "Brand library", module: "brand_assets", segment: "brand", placement: "sidebar", countCacheKey: "brand_assets", group: "occasional" },
  { key: "delivery", title: "Delivery method", module: "delivery", segment: "delivery", placement: "sidebar", countCacheKey: "programmes", group: "occasional" },
  // Learning STAYS VISIBLE — the owner was asked whether it could fold away and
  // said no. Last of the occasional half, beside Settings: nobody reads the
  // how-to library every morning, but the day they need it they must find it.
  { key: "learning", title: "Learning", module: "learning", segment: "learning", placement: "sidebar", countCacheKey: "learning", group: "occasional" },
  // Meeting purposes: the SAME module, its own segment, reached CONTEXTUALLY
  // from a button on the Delivery method screen. It is not a second sidebar page
  // because it is not a second destination — it is the other half of one, and a
  // nav rail that lists both halves of one idea reads as two ideas.
  { key: "purposes", title: "Meeting purposes", module: "delivery", segment: "purposes", placement: "contextual", countCacheKey: "purposes" },
  // Import has NO read-right of its own — it's gated per-target (create on
  // member_roles or learning). Reached CONTEXTUALLY from an "Import CSV" button on
  // those pages (which land on /t/<team>/import/<tableKey>), never a tab.
  { key: "import", title: "Import", module: "import", segment: "import", placement: "contextual" },
]

/** The ONE icon vocabulary for the app — each concept (page / section / record
 * kind) gets a single, distinct lucide icon (kebab-case name), reused at the
 * page, section-tab and button level so "members" always looks the same wherever
 * it appears. Add a concept here, not a one-off icon at a call site. */
export const CONCEPT_ICON = {
  home: "home",
  settings: "settings",
  team: "building",
  overview: "layout-dashboard",
  members: "users",
  roles: "shield-half",
  invites: "mail",
  dropdowns: "list",
  // The money, both halves. ONE icon, because a rate is a rate wherever it is
  // read — the audiences differ, the concept does not (UI-CONVENTIONS §4: a
  // concept gets one icon, reused at page, tab and button level).
  "internal-rates": "banknote",
  // The customer spine's own vocabulary: an account, the people on it, and a login.
  accounts: "building-2",
  contacts: "contact",
  portal: "key-round",
  learning: "graduation-cap",
  knowledge: "library-big",
  tickets: "life-buoy",
  // The map and the numbers drilled through it: a process is a route someone
  // follows, a step is one stop on it, a version is a point in its history, and
  // value is the time it gives back.
  processes: "route",
  steps: "list-checks",
  versions: "git-branch",
  value: "piggy-bank",
  comments: "message-square",
  // The work engine: a story is a piece of work in hand, a sprint is the block
  // it was sold inside, an app is the system it runs on, a task is our own
  // admin, a to-do is what we are waiting on a client for, and a timer is the
  // clock running on any of it.
  stories: "hammer",
  sprints: "calendar-range",
  apps: "app-window",
  tasks: "list-todo",
  // A meeting is two people and an hour — the icon says the hour, because that
  // is what distinguishes it from every other list in the rail.
  meetings: "calendar-clock",
  todos: "inbox",
  // TIME — the section, the story tab and the running clock in the header are
  // ONE concept wearing one icon (UI-CONVENTIONS §4), which is why this is `time`
  // and not `timer`: the key has to match the section key the rail looks it up
  // by, and a second entry for the same idea is how two icons for one concept
  // start.
  time: "timer",
  import: "upload",
  activity: "history",
  // The agency's own housekeeping: what we send out, the material we send it
  // with, how we run delivery, and who our people are.
  marketing: "megaphone",
  brand: "palette",
  delivery: "workflow",
  purposes: "calendar-check",
  staff: "id-card",
} as const


/** A breadcrumb step. `href` omitted = the current (non-link) page. */
export type Crumb = { label: string; href?: string }

/** Is `path` the active nav destination for the current `pathname`? */
export function isNavActive(path: string, pathname: string): boolean {
  return pathname === path || pathname.startsWith(path + "/")
}
