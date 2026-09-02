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
  icon: "home" | "settings" | "kwapso"
  need?: { module: string; right: "read" }
  /** Which section of the rail it sits under — see NavGroup below. `"none"` is
   * a destination the rail draws with NO heading above it at all (not an empty
   * one — Rail's own group heading is a clickable disclosure control, so an
   * item that wants no section cannot be a group with a blank label). It is a
   * REQUIRED, explicit choice for the same reason the two-bucket version was:
   * a destination nobody decided about should not default into a section by
   * accident. */
  group: NavGroup | "none"
  /** Whether this destination renders in the rail (and the mobile bottom bar /
   * "everything else" sheet) at all. Defaults to true. Settings and Kwapso are
   * the two exceptions (client feedback, 31 Aug 2026): both pages are
   * unchanged and still reachable, just not FROM the rail — `ProfileMenu` is
   * the one door to both now, so the app's own admin material sits with the
   * account menu instead of taking a row (or a whole section) beside the
   * team's own work. */
  inRail?: boolean
}

/** THE RAIL IS THREE NAMED SECTIONS, PLUS ONE DESTINATION OUTSIDE ALL OF THEM
 * (client feedback, 31 Aug 2026 — superseding the two-bucket "daily/occasional"
 * split below the divider that shipped 13 Aug 2026). The client's own words,
 * verbatim: "My work: today, tasks, meetings / build: Apps, sprints, stories /
 * accounts: accounts, contacts / kwapso, welcome have no section."
 *
 *   • "my-work"  — the work a person actually does most days: the team's own
 *                  admin, what clients have asked for, and when they're meeting.
 *   • "build"    — the systems being built and the blocks that work was sold
 *                  inside: apps, sprints, the backlog, the packages they sit in.
 *   • "accounts" — who the team works with.
 *
 * Home carries `group: "none"` instead of one of the three — see `NavItem.group`.
 * The grouping is still a fact about a destination, living beside the
 * destination rather than in the shell.
 *
 * "TODAY" AND "WELCOME," RECONCILED AGAINST THE REAL DATA. The client's two
 * words map to the app's ONE landing screen ("Home" — `web/components/screens/
 * home-screen.tsx`, no separate "Today" or "Welcome" page exists anywhere in
 * the codebase; `shared/i18n-strings.json` carries no "Welcome" string at all).
 * "Welcome" is read as Home here: it is the rail's one remaining standalone
 * entry, the same anchor the client's own screenshot showed it as. "Today" is
 * therefore NOT a second, duplicated Home entry inside My work — the rail's
 * own dedupe (`web/test/nav.test.ts`, "a destination appears twice on the
 * rail") treats showing one destination under two labels as the bug it would
 * be for a person clicking around. FLAGGED, not guessed past: if "Today" was
 * meant to be Home MOVING into My work rather than Home being called "Welcome"
 * and staying put, that's a one-line change once confirmed.
 *
 * KWAPSO GOT A FOURTH NAMED SECTION AND LOST IT AGAIN, THE SAME DAY. The
 * client asked for one ("create a new section called kwapso, pages inside
 * (under): team, branding. put this section the last one") and, later on 31
 * Aug 2026, reversed it in as many words: "remove the whole kwapso section
 * from the sidebar and move with your profile and settings." So the section,
 * its heading and its three rows (Details · Team · Branding) are gone from
 * the rail — not folded into one of the three sections above, because the
 * client's own instruction names where they go instead, and it isn't a rail
 * section. See `ProfileMenu` (web/components/profile-menu.tsx) for where the
 * three destinations live now: one "Kwapso" entry landing on `/kwapso`'s own
 * default tab, the same shape Settings already has in this menu —
 * `KwapsoScreen`'s own tab strip (Details · The team · Brand library) is how
 * Team and Branding stay reachable without a second and third menu row each.
 *
 * CONTACTS HAD NO FIRST-CLASS PAGE, until the client answered the question
 * this note used to flag: "contacts as a real sidebar page, also remove the
 * tab from inside accounts" (31 Aug 2026). It is a rail destination now — its
 * own `contacts` module (`MODULE_PERMISSION`), its own recipe
 * (`contacts.list`, screens.ts), the SAME `contacts:read` right the
 * account-scoped tab it replaces already checked. See the `contacts` entry
 * below for the whole of it.
 *
 * THE UNNAMED SIDEBAR PAGES (Knowledge base, Tickets, Work logs, Waves) were
 * not in the client's list. They keep the closest reading of their old half:
 * the three daily ones join My work, and Waves — the shelf a sprint sits
 * inside — joins Build beside Apps and Sprints. */
export type NavGroup = "my-work" | "build" | "accounts"

/** Render order for the rail's three named sections — a second, independent
 * fact from which section a destination is IN (`NavGroup`), so reordering the
 * sections themselves is a one-line change here rather than a reshuffle of
 * every entry's `group`. */
export const NAV_GROUP_ORDER: readonly NavGroup[] = ["my-work", "build", "accounts"]

/** The heading each section draws — the application's word, per `RailGroup.heading`. */
export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  "my-work": "My work",
  build: "Build",
  accounts: "Accounts",
}

export const NAV: NavItem[] = [
  // STANDALONE — no section heading above it (see NavGroup). The client's
  // "Welcome"; see the note on NavGroup for why this is Home and not a second,
  // duplicated entry.
  // OFF THE RAIL (client, 31 Aug 2026): "rename home to welcome. remove home
  // from navbar, make that when we click the icon kwapso on top of sidebar it
  // takes us there." Not deleted — the route and screen stand, reached from
  // the brand mark instead of a rail row, same pattern `settings` uses below.
  { slug: "home", path: "/home", title: "Welcome", icon: "home", group: "none", inRail: false },
  // THE AGENCY ITSELF, as a destination (CHECKLIST 10.1, 17 Aug 2026). Who we
  // are: the material we make our own work with, the people who make it, and the
  // details that go on a contract. "As a business owner you use this all the
  // time" is the whole case for it being a page rather than a corner of
  // Settings — Settings is where you change how the app behaves, and none of
  // this is a setting.
  //
  // OFF THE RAIL, THE SAME DAY IT WENT ON (client, 31 Aug 2026). It was a NAV
  // entry rather than a team section from the start — gated by no module of
  // its own, since every person in the team may look up the company's phone
  // number, with everything INSIDE it gated panel by panel instead (the brand
  // library on `brand_assets:read`, the people on `team_members:read`, editing
  // the legal details on `teams:edit`) — and it briefly grew into its own
  // three-row rail SECTION (Details · Team · Branding, one per tab on
  // `KwapsoScreen`) before the client reversed that in the same breath as
  // Settings: "remove the whole kwapso section from the sidebar and move with
  // your profile and settings." So this is one entry again, landing on the
  // page's own default tab — `ProfileMenu` (web/components/profile-menu.tsx)
  // is the door now, exactly the shape `settings` below already has, and the
  // page's own tab strip (Details · The team · Brand library) is how the
  // other two stay reachable without a second and third row in this menu.
  { slug: "kwapso", path: "/kwapso", title: "Details", icon: "kwapso", group: "none", inRail: false },
  // OFF THE RAIL (client, 31 Aug 2026: "remove settings from navbar, this is
  // only accessible through clicking profile"). The page and the route are
  // unchanged — `ProfileMenu` (web/components/profile-menu.tsx) is the one door
  // to it now. `group` is unused while `inRail` is false; kept a real value
  // rather than a cast so the field is never accidentally read as "unset".
  { slug: "settings", path: "/settings", title: "Settings", icon: "settings", group: "none", inRail: false },
]

/** How many slots the phone's bottom bar has. Five is what a thumb can hit
 * reliably across the width of a small phone; a sixth makes every one of them
 * too narrow to aim at. */
export const BOTTOM_NAV_SLOTS = 5

/** The mobile bottom-bar set: only destinations the user can reach, in the SAME
 * order as the desktop rail (the owner's locked order; no centre-pinning).
 * Generic over the link shape so the shell can pass its composed Home + team
 * sidebar pages + Settings list, not just the bare NAV.
 *
 * WHEN THERE ARE MORE SECTIONS THAN SLOTS, THE LAST SLOT STOPS BEING A SECTION
 * and becomes the door to the rest — so the bar shows four sections and a More.
 * The alternative, showing five and dropping the remainder, is what this
 * function used to do: `items.slice(0, 5)`, with a comment saying extras "would
 * fold into a More entry". Nothing folded them anywhere. The desktop rail is
 * `hidden md:flex`, so on a phone or a tablet those sections had no way in at
 * all — five of the ten were unreachable, including Tasks, Work logs, Meetings,
 * Apps and Sprints. A cap is only a cap if something catches what falls off,
 * and a comment describing the catch is not the catch. */
export function bottomNavItems<T extends { slug: string }>(items: T[]): T[] {
  return items.length <= BOTTOM_NAV_SLOTS ? items : items.slice(0, BOTTOM_NAV_SLOTS - 1)
}

/** The sections the bar could not fit — empty when they all fit. Together with
 * `bottomNavItems` this is a PARTITION of the list: every reachable section is
 * in exactly one of the two, which is the property `web/test/nav.test.ts` locks
 * so nothing can go missing again. */
export function overflowNavItems<T extends { slug: string }>(items: T[]): T[] {
  return items.length <= BOTTOM_NAV_SLOTS ? [] : items.slice(BOTTOM_NAV_SLOTS - 1)
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
    | "contacts"
    | "tickets"
    | "knowledge"
    | "processes"
    | "waves"
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
    // in `my-work` beside Tasks: a calendar is something somebody opens before
    // their first call, not an inventory they consult twice a year.
    | "meetings"
    // The agency's own housekeeping. The brand library is a sidebar page rather
    // than an admin tab: it is somebody's actual work, not a setting. Meeting
    // purposes is CONTEXTUAL, reached from the Meetings screen — it is the
    // taxonomy behind that page, not a destination of its own. Staff profiles
    // has NO section at all: the owner's ruling is that a profile lives on the
    // member's own page, so its screens hang off Members instead and its module
    // never appears in this table.
    | "brand"
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
  /** Which of the rail's three named sections this destination sits in.
   * Required on every `placement: "sidebar"` section and meaningless on the
   * others — a tab is not in the rail at all, and a contextual page is reached
   * from a button. */
  group?: NavGroup
}

export const TEAM_SECTIONS: TeamSection[] = [
  // Overview leads with team metadata, not a collection → no countCacheKey (LAW R8 exception).
  { key: "overview", title: "Overview", module: "teams", segment: "", placement: "tab" },
  { key: "members", title: "Members", module: "team_members", segment: "members", placement: "tab", countCacheKey: "members" },
  { key: "roles", title: "Member roles", module: "member_roles", segment: "roles", placement: "tab", countCacheKey: "member_roles" },
  { key: "invites", title: "Invites", module: "team_members", segment: "invites", placement: "tab", countCacheKey: "invites" },
  // Choices ("selectable data", formerly "Dropdown values") — the team's own
  // vocabulary. It lived as a tab beside the other admin sections until
  // Settings grew real tabs of its own (2026-09-01): it is now the "Choices"
  // tab on Settings, and `placement: "contextual"` (not "tab") is what takes
  // it OFF the team area's own strip — the same treatment Import already
  // gets, and for the same reason: this section is reached from a specific
  // destination rather than switched to from every other team page. The
  // segment/module/route stay exactly as they were (`/t/<teamId>/dropdowns`
  // still resolves — a value's own detail address does not move under it),
  // so nothing that already links here breaks; Settings' Choices tab is
  // simply the one place that link is offered now.
  { key: "dropdowns", title: "Choices", module: "selectable_data", segment: "dropdowns", placement: "contextual", countCacheKey: "selectable" },
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
  // Kwapso — and THEN partitions by `group`, drawing a heading over each named
  // run (Home and Kwapso carry `group: "none"` and draw no heading at all: see
  // `NavGroup` in this file). So a page's place on the rail is two facts and no
  // third: where its line sits in this list, and which group it declares.
  // Moving a page is moving its line.
  //
  // THREE NAMED SECTIONS, client feedback 31 Aug 2026 — superseding the
  // daily/occasional split fixed 13 Aug 2026 below (kept for the record; the
  // sections it named no longer exist as headings, only as ordering history):
  //   [was] daily       Home · Accounts · Knowledge base · Tickets · Stories · Tasks
  //   [was] occasional  Meetings · Apps · Sprints · Brand library · Settings
  //
  // The new sequence, this list's real order:
  //   My work   Tasks · Meetings · Knowledge base · Tickets · Work logs
  //   Build     Apps · Sprints · Stories · Waves
  //   Accounts  Accounts · Contacts
  //   (none)    Home, Kwapso — see NAV in this file
  //
  // ACCOUNTS MOVED OUT OF THE DAILY SET into a named section of its own — the
  // client's own word for the group is the same as the page's, which reads as
  // one idea rather than two the way "occasional → Accounts" did. MEETINGS
  // moved the other way, UP into My work: the client's explicit list ("My
  // work: today, tasks, meetings") puts it beside Tasks, not beside Apps and
  // Sprints. STORIES moved out of the old daily run to sit with the rest of
  // the work engine in Build (the client's explicit order there is "Apps,
  // sprints, stories" — this list's order IS that order, so the line moved
  // rather than the client's sequence being re-derived some other way).
  //
  // FOUR PAGES LEFT THE RAIL on 17 Aug 2026 and only one of them lost anything.
  // Marketing and Learning were purged outright (the owner's ruling), Delivery
  // method's programmes were folded onto the sprint type, and PROCESS MAPS
  // stopped being a destination because a map is read inside the app it belongs
  // to — its screens and its records are all still here, reached from the app.
  { key: "accounts", title: "Accounts", module: "accounts", segment: "accounts", placement: "sidebar", countCacheKey: "accounts", group: "accounts" },
  // CONTACTS — every person linked into the customer spine, across every
  // account, promoted to a real sidebar page (client, 31 Aug 2026: "contacts as
  // a real sidebar page, also remove the tab from inside accounts" — see the
  // note this entry replaces, below the old two-bucket history a few lines
  // down). It was a tab on ONE account's own record (`account-detail.tsx`,
  // `contacts:read`) until now; that tab is gone, and an account's Overview
  // carries the same add/link/remove controls for ITS OWN people instead (see
  // account-detail.tsx's own note on why).
  //
  // SAME module, SAME right, SAME door as before (`accounts`, narrowed to
  // `type=individual`) — this is a second address for rows the app already
  // fetched, not a new capability. Its count key is the SAME exact server total
  // the old Companies/Contacts/All strip badged (`accounts-individual`),
  // primed by the one `listFetch.accounts` read either page already makes.
  { key: "contacts", title: "Contacts", module: "contacts", segment: "contacts", placement: "sidebar", countCacheKey: "accounts-individual", group: "accounts" },
  // THE WORK ENGINE'S OWN ADMIN, first in My work per the client's explicit
  // list ("My work: today, tasks, meetings" — Home/"today" is `NAV`'s
  // standalone entry, not repeated here; see the note on `NavGroup`).
  { key: "tasks", title: "Tasks", module: "work", segment: "tasks", placement: "sidebar", countCacheKey: "tasks", group: "my-work" },
  // MEETINGS — the client's own list puts it beside Tasks, not beside Apps and
  // Sprints: a calendar is something somebody opens before their first call,
  // which is a My-work habit and not the occasional one it used to sit with.
  { key: "meetings", title: "Meetings", module: "meetings", segment: "meetings", placement: "sidebar", countCacheKey: "meetings", group: "my-work" },
  // The knowledge base — what the assistant is allowed to read, and the one
  // screen where a person can see it, add to it, correct it and take something
  // out. Gated by its own module, so a role without it never sees the
  // destination at all. Not named in the client's list — kept in My work, the
  // closest reading of the daily half it used to sit in.
  { key: "knowledge", title: "Knowledge base", module: "knowledge", segment: "knowledge", placement: "sidebar", countCacheKey: "knowledge", group: "my-work" },
  // Tickets is the one place in this table where the URL segment is NOT the
  // permission module. The section, the page and the address bar say `tickets`,
  // because that is the word for the thing (glossary, SCOPE ch.02). The right the
  // server enforces is still `help`: it is the string sitting in every role's
  // permission sheet, in every team database, and renaming it would be a data
  // migration that could only ever take somebody's access away. `MODULE_PERMISSION`
  // in lib/screens.ts is the one seam that translates between the two. Not named
  // in the client's list — kept in My work for the same reason as Knowledge base.
  { key: "tickets", title: "Tickets", module: "help", segment: "tickets", placement: "sidebar", countCacheKey: "help", group: "my-work" },
  // TIME — a work log is the row every figure in this app is eventually built
  // on, and there was nowhere to go and look at one until 24 Aug 2026: the whole
  // list lived in a panel at the FOOT of the Stories page, under the backlog,
  // and a story's own Time tab showed the handful logged against that story.
  // Both are the right place for what they do — a start button belongs beside
  // the work, and a story's hours belong on the story — and neither is a place
  // a person goes to find "the time I logged". A tester with 115 entries
  // reported she could not find any of it.
  //
  // "WORK LOGS", not "Time" (CHECKLIST 2.6). It was headed Time on the argument
  // that the glossary defines a work log as "one row of time" — but the glossary
  // TERM is `Work log`, and the story record's own tab had already moved to that
  // word, so the rail was the last screen calling one thing two names (Law R6).
  // The URL segment is deliberately left alone: `/time` is a link people have
  // already sent each other, and a slug is not a word anybody reads. Not named
  // in the client's list — kept in My work, the closest reading of daily.
  { key: "time", title: "Work logs", module: "work", segment: "time", placement: "sidebar", countCacheKey: "work-logs", group: "my-work" },
  // ── BUILD: the work engine's other three destinations, in the client's own
  // explicit order ("build: Apps, sprints, stories") ──────────────────────────
  // Apps → Sprints → Stories, plus our own admin above. Each is a section AND a
  // tab on the record above it, because the owner's comprehension answer on
  // where a person starts looking was "it should not matter — all three should
  // get her there". One path is a dead end in somebody's head; three are a
  // product. Apps gates on `processes`, not `work`: an app is the thing a
  // process hangs off, and the module that owns the App → Process → Step chain
  // is the one whose right a person needs to see any of it.
  { key: "apps", title: "Apps", module: "processes", segment: "apps", placement: "sidebar", countCacheKey: "apps", group: "build" },
  // PROCESSES — App → Process → Step, and the value drilled through them.
  // CONTEXTUAL since 17 Aug 2026: the owner's ruling is that a process lives under
  // the APP it belongs to, and it is reached from that app's own screen. Nothing
  // under it changed — the list, the record, the versions, the steps and the
  // arithmetic are all still here, and `/t/<team>/processes/<id>` still opens a
  // process. What went is the line on the nav rail, because "which app is this
  // a process of?" is a question a rail full of them makes somebody ask every time.
  //
  // It keeps its count key: the heading on the screen still badges the exact
  // server total of the PROCESSES, keyed off the same `processes:<teamId>` cache
  // the list reads.
  { key: "processes", title: "Processes", module: "processes", segment: "processes", placement: "contextual", countCacheKey: "processes" },
  { key: "sprints", title: "Sprints", module: "work", segment: "sprints", placement: "sidebar", countCacheKey: "sprints", group: "build" },
  // STORIES — the page that used to be called Work. The sprints moved out to a
  // section of their own, so what is left on it is the backlog — and the word
  // for that in the glossary is Story. The URL segment moved with the title
  // rather than being kept for old links: nothing outside this app has ever
  // linked to /work, and a segment that disagrees with its heading is a cost
  // paid for ever (Tickets pays it because a permission STRING in every team's
  // database is behind it — there is no such string here, the module is `work`
  // either way). LAST in Build, per the client's explicit order ("Apps,
  // sprints, stories") — moved out of the old daily/My-work run it shared with
  // Tasks, since the client's own grouping puts it with the rest of the work
  // engine rather than with the team's day-to-day admin.
  { key: "stories", title: "Stories", module: "work", segment: "stories", placement: "sidebar", countCacheKey: "stories", group: "build" },
  // WAVES — what a client BOUGHT: a package of sprints. Its own destination
  // beside Sprints rather than a tab on one, because the question it answers is
  // "what did they buy?" and a sprint answers "what are we doing this fortnight?".
  // Not named in the client's Build list — kept beside Apps and Sprints, the
  // closest reading of the occasional half it used to sit in.
  { key: "waves", title: "Waves", module: "work", segment: "waves", placement: "sidebar", countCacheKey: "waves", group: "build" },
  // THE AGENCY'S OWN HOUSEKEEPING — one sidebar page, gated by its own read
  // right so a role without it never sees the destination at all. Its count is
  // an exact server total (R16) keyed off the same cache the list reads, so the
  // badge and the rows can never disagree.
  // BRAND LIBRARY — CONTEXTUAL since 17 Aug 2026 (CHECKLIST 10.2). Nothing
  // under it changed: the screen, the records and `/brand/<id>` are all still
  // here. What went is the line on the rail, because the brand library is one of
  // the three things the Kwapso page is FOR, and a rail that lists both the
  // section and the page it lives on reads as two ideas. It keeps its count key:
  // the heading on the screen still badges the exact server total.
  { key: "brand", title: "Brand library", module: "brand_assets", segment: "brand", placement: "contextual", countCacheKey: "brand_assets" },
  // Meeting purposes: its own segment, reached CONTEXTUALLY from a button on the
  // Meetings screen. It is not a sidebar page because it is not a destination —
  // it is the taxonomy behind one, and a nav rail that lists a page and the
  // vocabulary behind it reads as two ideas.
  { key: "purposes", title: "Meeting purposes", module: "delivery", segment: "purposes", placement: "contextual", countCacheKey: "purposes" },
  // Import has NO read-right of its own — it's gated per-target (create on
  // member_roles or dropdown values). Reached CONTEXTUALLY from an "Import CSV"
  // button on those pages (which land on /t/<team>/import/<tableKey>), never a tab.
  { key: "import", title: "Import", module: "import", segment: "import", placement: "contextual" },
]

/** The ONE icon vocabulary for the app — each concept (page / section / record
 * kind) gets a single, distinct lucide icon (kebab-case name), reused at the
 * page, section-tab and button level so "members" always looks the same wherever
 * it appears. Add a concept here, not a one-off icon at a call site. */
export const CONCEPT_ICON = {
  home: "home",
  settings: "settings",
  // The agency itself — a building would be the team, so this is the badge on
  // the door: who we are, said once.
  kwapso: "badge-check",
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
  knowledge: "library-big",
  tickets: "life-buoy",
  // The map and the numbers drilled through it: a process is a route someone
  // follows, a step is one stop on it, a version is a point in its history, and
  // impact is the time it gives back.
  processes: "route",
  steps: "list-checks",
  versions: "git-branch",
  impact: "piggy-bank",
  comments: "message-square",
  // The work engine: a story is a piece of work in hand, a sprint is the block
  // it was sold inside, an app is the system it runs on, a task is our own
  // admin, a to-do is what we are waiting on a client for, and a timer is the
  // clock running on any of it.
  stories: "hammer",
  sprints: "calendar-range",
  // The package a client bought — several sprints arriving together.
  waves: "layers",
  apps: "app-window",
  // WHAT WE HAND OVER on a system: the parcel, because that is what a
  // deliverable is — the thing that leaves our hands and arrives in theirs.
  deliverables: "package",
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
  // TRIAGE — the first read of a new request (the glossary's word). It earns a
  // line in the vocabulary rather than an icon at the tab that shows it, for the
  // reason this map exists: the day triage grows a second surface, the two would
  // otherwise pick two icons for one idea. A funnel, because that is what triage
  // does to a queue.
  triage: "list-filter",
  // DASHBOARD — a collection's own summary view, charts rather than rows
  // (Tickets' own tab strip, following Triage's precedent above: a line here
  // rather than an icon chosen at the tab, so a second collection that grows
  // a Dashboard tab reaches for this instead of picking a second icon for one
  // idea). Distinct from `overview`'s "layout-dashboard" — that one is a
  // RECORD's own summary tab; this is a chart.
  dashboard: "layout-dashboard",
  import: "upload",
  activity: "history",
  // The agency's own housekeeping: the material we make our own work with, why
  // we meet, and who our people are.
  brand: "palette",
  purposes: "calendar-check",
  staff: "id-card",
} as const


/** A breadcrumb step. `href` omitted = the current (non-link) page. */
export type Crumb = { label: string; href?: string }

/** Is `path` the active nav destination for the current `pathname`? */
export function isNavActive(path: string, pathname: string): boolean {
  return pathname === path || pathname.startsWith(path + "/")
}
