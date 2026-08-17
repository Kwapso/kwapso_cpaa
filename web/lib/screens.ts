// Base screen recipes — whole screens described as DATA, rendered by the library
// engine (@kwapso/ui ScreenRenderer). The host (deep-link-screen.tsx)
// shapes app types into the flat rows/records these recipes reference, supplies
// the per-module rights, dispatches the named actions, and owns the router. A
// team can OVERRIDE any recipe at runtime via the config store (M2); the
// resolver merges override-over-base. Keyed by `<module>.<view>`, where the
// module is the friendly URL segment used in the deep-link grammar
// (/t/<teamId>/<module>/<id>).

import type {
  RecipeAction,
  RecipeBlock,
  RecipeField,
  RecipeNode,
  RecipeTab,
  ScreenRecipe,
} from "@kwapso/ui/lib/recipe"
import {
  defaultCollectionConfig,
  defaultFieldConfig,
  type CollectionConfig,
  type FilterFacet,
} from "@kwapso/ui/lib/config"

import { CONCEPT_ICON } from "@/lib/pages"
import { formatCount } from "@shared/web/format-count"

/** What `useT()` hands back — the recipe layer takes the function, not the
 * hook, because a recipe is data and data has no React in it. */
type Translate = (english: string) => string

/** A plain text column/field for a recipe (label only — the host supplies the
 * already-formatted value in the row/record). */
export function field(column: string, label: string): RecipeField {
  return { column, type: "text", field: { ...defaultFieldConfig, label } }
}

/** A list collection config with Layer-1 (client-side, in-memory) search ON —
 * the library search/filters have landed (SEARCH.md · UI-GAPS #7), so every
 * bounded list searches its already-cached rows with zero new requests. The
 * engine auto-points the search at the recipe `fields` columns (the shaped text:
 * name / detail / email), so flipping `searchable` is all the wiring needed.
 *
 * `filterFacets` adds the user-facing FILTER bar (`userFilter`): each facet's
 * `field` must be a real column on the SHAPED rows (a chosen value becomes an
 * `is` Rule on it); options are auto-derived from the data. Threaded per-call
 * like the search placeholder. */
function listCollection(
  emptyText: string,
  searchPlaceholder: string,
  filterFacets: FilterFacet[] = [],
  opts: { paged?: boolean } = {}
): CollectionConfig {
  return {
    ...defaultCollectionConfig,
    searchPlaceholder,
    headerLayout: "inline",
    userFilter: filterFacets.length > 0,
    filterFacets,
    emptyText,
    // R14 meets R16: on a PAGED collection the frame's own "Showing X of Y" is
    // wrong in both numbers — it counts the loaded PREFIX, so it reads
    // "Showing 50 of 50" beside a badge that correctly says 55. The count is
    // shown exactly once, above, through the formatCount seam.
    showCount: !opts.paged,
    // …and its SEARCH BOX is wrong for the same reason, which took longer to
    // notice because a search that finds nothing looks like an answer. The frame
    // searches the array it holds — page one — so on a paged collection the box
    // is answered by the DOOR instead, from the host's own find bar
    // (components/paged-find.tsx · SEARCH.md layer 2). One box per screen, and
    // it is the one that can see past the cursor.
    searchable: !opts.paged,
  }
}

/** The permission module a friendly URL segment maps to. URLs stay readable
 * (members / roles / invites / team) while rights + gates use the real module
 * key the server enforces. */
export const MODULE_PERMISSION: Record<string, string> = {
  team: "teams",
  members: "team_members",
  roles: "member_roles",
  invites: "team_members",
  dropdowns: "selectable_data",
  // The address bar says `tickets` because that is the word for the thing; the
  // right the server enforces is still `help` — the string already written into
  // every role's permission sheet in every team database. This line is the only
  // place the two names meet.
  tickets: "help",
  // The knowledge base: the segment IS the module.
  knowledge: "knowledge",
  // The customer spine: the segment IS the module (portal_users is a second gate
  // ON the same screens, never a screen of its own — handing out a login is a
  // bigger decision than editing a phone number).
  accounts: "accounts",
  // Process maps: the segment IS the module. `commercials` is a second gate ON
  // these screens as well (the rate card on an account), because what a client is
  // charged is a bigger decision than how long a step takes.
  processes: "processes",
  // …and `commercials` has ONE screen of its own: our own cost card. Both halves
  // of the money gate on this single module, and they are reached in two
  // different places on purpose — an ACCOUNT's rate card is a tab on that
  // account's record (the question is always about one client), and OUR OWN cost
  // card is this team-wide tab, which no client login can reach at any hostname
  // (R24 · SCOPE, and workers/tenancy/src/lib/internal-money.ts says why).
  "internal-rates": "commercials",
  // THE WORK ENGINE, as four segments over two modules. Stories, sprints and
  // tasks all gate on `work` — they are one permission and three nouns. Apps
  // gate on `processes`
  // instead: an app is the thing a map hangs off, and the right that lets a
  // person see the App → Process → Step chain is the one that lets them see the
  // app at the top of it.
  stories: "work",
  sprints: "work",
  tasks: "work",
  // …and TIME is the fourth noun on the same permission. A work log had no
  // destination at all: the only list of one was a panel at the foot of the
  // Stories page, under the backlog, which is why a tester with 115 logged
  // entries reported that she could not find logged time.
  time: "work",
  apps: "processes",
  // MEETINGS is its own module, so the segment IS the module — and it is its own
  // module because the thing being permissioned is the NOTES. The taxonomy of
  // why we meet lives under `delivery`; what was said in the room does not.
  meetings: "meetings",
  // THE AGENCY'S OWN HOUSEKEEPING. Both of these are places where the URL
  // segment is NOT the permission module, for the same reason Tickets is: the
  // address bar says the word a person uses, while the gate says the string in
  // every role's permission sheet.
  //   • `brand` reads better in a URL than `brand_assets`, and an underscore in
  //     an address is a thing people mistype.
  //   • `purposes` gates on `delivery` — the module kept its name when its
  //     programme half was folded onto the sprint type (team-schema 0025) and
  //     left it with one table. Renaming a permission STRING already written
  //     into every role's sheet in every team database is a migration that can
  //     only ever take somebody's access away, which is the same reason Tickets
  //     still gates on `help`.
  brand: "brand_assets",
  purposes: "delivery",
  // Staff profiles has no segment at all: it is read on the member's own page.
}

/* --------------------------------- team --------------------------------- */

/** Team overview — the team's metadata (Overview) + its activity feed, the
 * landing screen at /t/<teamId>. Edit team is gated by teams:edit. */
const teamDetailRecipe: ScreenRecipe = {
  type: "detail",
  binding: { module: "team" },
  gate: { module: "teams", right: "read" },
  fields: [],
  actions: [
    {
      id: "team.edit",
      label: "Edit team",
      action: "team.edit",
      variant: "outline",
      gate: { module: "teams", right: "edit" },
    },
  ],
  header: { title: "name", avatar: "image" },
  tabs: [
    {
      key: "overview",
      label: "Overview",
      icon: CONCEPT_ICON.overview,
      block: {
        kind: "description",
        columns: 1,
        rows: [
          { label: "Created", column: "created" },
          { label: "Created by", column: "createdBy" },
          { label: "Last updated", column: "updated" },
        ],
      },
    },
    {
      key: "activity",
      label: "Activity",
      icon: CONCEPT_ICON.activity,
      block: { kind: "activity", source: "activity" },
    },
  ],
}

/* -------------------------------- members -------------------------------- */

/** Members list — clean rows (name + a role · joined summary line), tap a row to
 * open the member's detail. Mutating actions live on the detail (so the list
 * stays clean and we never show a self/last-admin action that would be refused). */
const membersListRecipe: ScreenRecipe = {
  type: "list",
  display: "list",
  surface: "none",
  binding: { module: "members" },
  gate: { module: "team_members", right: "read" },
  fields: [field("name", "Member"), field("detail", "Details")],
  actions: [],
  collection: listCollection("No members yet.", "Search members…", [
    { field: "role", label: "Role", control: "select" },
  ]),
}

/** Member detail (Overview + Activity). Actions change-role + remove are gated by
 * team_members edit/delete; the host hides them on your own row. */
const memberDetailRecipe: ScreenRecipe = {
  type: "detail",
  binding: { module: "members" },
  gate: { module: "team_members", right: "read" },
  fields: [],
  actions: [
    {
      id: "members.changeRole",
      label: "Change role",
      action: "members.changeRole",
      variant: "outline",
      gate: { module: "team_members", right: "edit" },
    },
    {
      id: "members.remove",
      label: "Remove from team",
      action: "members.remove",
      variant: "destructive",
      gate: { module: "team_members", right: "delete" },
    },
  ],
  header: { title: "name", subtitle: "email", avatar: "image" },
  tabs: [
    {
      key: "overview",
      label: "Overview",
      icon: CONCEPT_ICON.overview,
      block: {
        kind: "description",
        columns: 1,
        rows: [
          { label: "Role", column: "role" },
          { label: "Joined", column: "joined" },
          { label: "Email", column: "email" },
        ],
      },
    },
    {
      key: "activity",
      label: "Activity",
      icon: CONCEPT_ICON.activity,
      block: { kind: "activity", source: "activity" },
    },
  ],
}

/* --------------------------------- roles --------------------------------- */

/** Roles list — clean rows (title + a members/description summary line). Tapping
 * a role opens its detail (the permission grid + edit/deactivate live there). */
const rolesListRecipe: ScreenRecipe = {
  type: "list",
  display: "list",
  surface: "none",
  binding: { module: "roles" },
  gate: { module: "member_roles", right: "read" },
  fields: [field("name", "Role"), field("detail", "Details")],
  actions: [],
  collection: listCollection("No roles yet.", "Search roles…", [
    { field: "state", label: "Status", control: "select" },
  ]),
}

/* -------------------------------- invites -------------------------------- */

/** Invites list — clean rows (email + a role · status line). Tapping an invite
 * opens its detail, where Revoke lives (pending only). */
const invitesListRecipe: ScreenRecipe = {
  type: "list",
  display: "list",
  surface: "none",
  binding: { module: "invites" },
  gate: { module: "team_members", right: "read" },
  fields: [field("email", "Email"), field("detail", "Details")],
  actions: [],
  collection: listCollection("No invites yet.", "Search invites…", [
    { field: "status", label: "Status", control: "select" },
  ]),
}

/** Invite detail — who/what/when, plus Revoke (gated team_members:delete; the
 * host shows it only while the invite is still pending). */
const inviteDetailRecipe: ScreenRecipe = {
  type: "detail",
  binding: { module: "invites" },
  gate: { module: "team_members", right: "read" },
  fields: [],
  actions: [
    {
      id: "invites.revoke",
      label: "Revoke invite",
      action: "invites.revoke",
      variant: "destructive",
      gate: { module: "team_members", right: "delete" },
    },
  ],
  header: { title: "email" },
  tabs: [
    {
      key: "overview",
      label: "Overview",
      icon: CONCEPT_ICON.overview,
      block: {
        kind: "description",
        columns: 1,
        rows: [
          { label: "Role", column: "role" },
          { label: "Status", column: "status" },
          { label: "Invited by", column: "invitedBy" },
          { label: "Invited", column: "invited" },
          { label: "Expires", column: "expires" },
          { label: "Accepted", column: "accepted" },
        ],
      },
    },
    {
      key: "activity",
      label: "Activity",
      icon: CONCEPT_ICON.activity,
      block: { kind: "activity", source: "activity" },
    },
  ],
}

/* --------------------------------- tickets -------------------------------- */

/** Tickets list — clean rows (a truncated description + a type · status line).
 * The My/All scope is a host-owned toggle (the server filters by raiser); tapping
 * a row opens the ticket thread. "Raise ticket" is host-rendered above, gated by
 * the help:create right (the module key behind the Tickets section). */
const ticketsListRecipe: ScreenRecipe = {
  type: "list",
  display: "list",
  surface: "none",
  binding: { module: "tickets" },
  gate: { module: "help", right: "read" },
  fields: [field("name", "Ticket"), field("detail", "Details")],
  actions: [],
  collection: listCollection(
    "No tickets yet.",
    "Search tickets…",
    [{ field: "status", label: "Status", control: "select" }],
    { paged: true }
  ),
}

/* -------------------------------- accounts -------------------------------- */

/** Accounts list — every company and every person the team works with, in one
 * list (they are one table). A row's summary line carries what you'd read out
 * loud: what it is, its reference, where it stands, and the account it sits
 * under. PAGED (R14) — the list grows with ordinary use, so the frame's own
 * "Showing X of Y" stays off and the exact total is badged once, above. */
const accountsListRecipe: ScreenRecipe = {
  type: "list",
  display: "list",
  surface: "none",
  binding: { module: "accounts" },
  gate: { module: "accounts", right: "read" },
  fields: [field("name", "Account"), field("detail", "Details")],
  actions: [],
  // NO FACETS HERE, and that is the fix rather than a loss: type / status /
  // archived are the door's OWN filters now, asked from the host's find bar
  // (components/paged-find.tsx). In the frame they narrowed the loaded page —
  // "companies among the newest fifty" — while the exact count above them never
  // moved, which is what a manager reported as "filter by type, the count
  // doesn't change". A filter a person can pick has to be one the server applies.
  collection: listCollection("No accounts yet.", "Search accounts…", [], { paged: true }),
}

/* -------------------------------- knowledge ------------------------------- */

/** Knowledge list — everything the assistant is allowed to read, newest first.
 * A row's summary line says what it IS and where it is filed, because those are
 * the two questions somebody scanning this list is actually asking ("why does it
 * know that?" and "whose is it?"). PAGED (R14) — the sweep only ever adds — so
 * the frame's own "Showing X of Y" stays off and the exact total is badged once,
 * above. */
const knowledgeListRecipe: ScreenRecipe = {
  type: "list",
  display: "list",
  surface: "none",
  binding: { module: "knowledge" },
  gate: { module: "knowledge", right: "read" },
  fields: [field("name", "Source"), field("detail", "Details")],
  actions: [],
  collection: listCollection(
    "Nothing in the knowledge base yet.",
    "Search the knowledge base…",
    [
      { field: "kind", label: "Kind", control: "select" },
      { field: "filed", label: "Filed under", control: "select" },
      { field: "state", label: "Status", control: "select" },
    ],
    { paged: true }
  ),
}

/** THE DIARY — every conversation we have had or are about to have, newest
 * first. PAGED (R14): a meeting is an event, so the rows accumulate with
 * ordinary use and are never curated away — a cancelled call in March is still
 * the answer to "didn't we speak in March?". Glide's own two years are 350
 * rows before this app has held a conversation of its own. */
const meetingsListRecipe: ScreenRecipe = {
  type: "list",
  display: "list",
  surface: "none",
  binding: { module: "meetings" },
  gate: { module: "meetings", right: "read" },
  fields: [field("name", "Meeting"), field("detail", "Details")],
  actions: [],
  collection: listCollection("Nothing in the diary yet.", "Search meetings…", [
    { field: "client", label: "Client", control: "select" },
    { field: "purpose", label: "Why we met", control: "select" },
    { field: "state", label: "Status", control: "select" },
  ], { paged: true }),
}

/* ------------------------------ process maps ------------------------------ */

/** Process maps list — every way of working we have mapped, with the app it sits
 * in and how much of it there is. PAGED (R14): every app of every client grows
 * maps and none is ever deleted, because the savings computed from a baseline
 * have to stay checkable years later — so the frame's own "Showing X of Y" stays
 * off and the exact total is badged once, above. */
const processesListRecipe: ScreenRecipe = {
  type: "list",
  display: "list",
  surface: "none",
  binding: { module: "processes" },
  gate: { module: "processes", right: "read" },
  fields: [field("name", "Process"), field("detail", "Details")],
  actions: [],
  collection: listCollection(
    "No processes yet.",
    "Search processes…",
    [
      { field: "app", label: "App", control: "select" },
      { field: "archived", label: "Archived", control: "select" },
    ],
    { paged: true }
  ),
}

/* ------------------------------- the work ------------------------------- */

/** The backlog — every piece of work we are doing, in the order somebody dragged
 * it into. A row's summary line is what you would read out loud in a stand-up:
 * who has it, when it is due, and which request it answers. PAGED (R14): the
 * backlog only grows and a done story is never deleted, so the frame's own
 * "Showing X of Y" stays off and the exact total is badged once, above. */
const storiesListRecipe: ScreenRecipe = {
  type: "list",
  display: "list",
  surface: "none",
  binding: { module: "stories" },
  gate: { module: "work", right: "read" },
  fields: [field("name", "Story"), field("detail", "Details")],
  actions: [],
  collection: listCollection(
    "No work in hand.",
    "Search work…",
    [
      { field: "status", label: "Status", control: "select" },
      { field: "assignee", label: "Assignee", control: "select" },
      { field: "sprint", label: "Sprint", control: "select" },
      { field: "app", label: "App", control: "select" },
    ],
    { paged: true }
  ),
}

/** THE SPRINTS — the blocks the work was sold inside. A row's summary line is
 * what somebody would say about one out loud: whose it is, which system, when it
 * runs, and how much of it is finished. BOUNDED, not paged (R14): a sprint is a
 * contract, so this collection grows at the speed of signatures. */
const sprintsListRecipe: ScreenRecipe = {
  type: "list",
  display: "list",
  surface: "none",
  binding: { module: "sprints" },
  gate: { module: "work", right: "read" },
  fields: [field("name", "Sprint"), field("detail", "Details")],
  actions: [],
  collection: listCollection("No sprints yet.", "Search sprints…", [
    { field: "account", label: "Client", control: "select" },
    { field: "app", label: "App", control: "select" },
    { field: "state", label: "Status", control: "select" },
  ]),
}

/** THE APPS — the systems we have built, one per row, each belonging to exactly
 * one account (the owner's ruling: "an app belongs to ONE account, always").
 * BOUNDED: an agency has tens of these, not thousands — the collection that
 * grows underneath is the process maps. */
const appsListRecipe: ScreenRecipe = {
  type: "list",
  display: "list",
  surface: "none",
  binding: { module: "apps" },
  gate: { module: "processes", right: "read" },
  fields: [field("name", "App"), field("detail", "Details")],
  actions: [],
  collection: listCollection("No apps recorded yet.", "Search apps…", [
    { field: "account", label: "Client", control: "select" },
    { field: "stage", label: "Stage", control: "select" },
    { field: "state", label: "Archived", control: "select" },
  ]),
}

/** OUR OWN ADMIN. A task is never a client's — the summary line says who has it
 * and when it is due, and nothing about a customer unless the task itself names
 * one. BOUNDED (R14): admin is finished and ticked off as fast as it arrives. */
const tasksListRecipe: ScreenRecipe = {
  type: "list",
  display: "list",
  surface: "none",
  binding: { module: "tasks" },
  gate: { module: "work", right: "read" },
  fields: [field("name", "Task"), field("detail", "Details")],
  actions: [],
  collection: listCollection("Nothing on our own list.", "Search tasks…", [
    { field: "status", label: "Status", control: "select" },
    { field: "assignee", label: "Who has it", control: "select" },
  ]),
}

/** One task, as a record: its own fields and its history. A recipe rather than a
 * component for the same reason the four housekeeping details are — there is no
 * control on it the engine has no block for. */
const taskDetailRecipe: ScreenRecipe = {
  type: "detail",
  binding: { module: "tasks" },
  gate: { module: "work", right: "read" },
  fields: [],
  actions: [
    {
      id: "tasks.done",
      label: "Tick it off",
      action: "tasks.done",
      variant: "outline",
      gate: { module: "work", right: "edit" },
    },
  ],
  header: { title: "name", subtitle: "detail" },
  tabs: [
    {
      key: "overview",
      label: "Overview",
      icon: CONCEPT_ICON.overview,
      block: {
        kind: "description",
        columns: 1,
        rows: [
          { label: "Status", column: "status" },
          { label: "Who has it", column: "assignee" },
          { label: "Due", column: "due" },
          { label: "Detail", column: "detailText" },
          { label: "Added", column: "created" },
          { label: "Added by", column: "createdBy" },
        ],
      },
    },
    {
      key: "activity",
      label: "Activity",
      icon: CONCEPT_ICON.activity,
      block: { kind: "activity", source: "activity" },
    },
  ],
}
/* -------------------- the agency's own housekeeping ----------------------- */

/** THE FOUR RECORD SCREENS, AS RECIPES. Each of these details is the record's
 * own fields plus its history — a description block and an activity block — so
 * they are described as DATA rather than composed by hand, which is what the
 * engine is for. The bespoke details in this app (a ticket's conversation, a
 * map's arithmetic, an account's four collections) exist because no engine block
 * draws them; none of these four has that problem, and writing four
 * host-composed components to render two blocks each would be four files of
 * ceremony where a recipe already says it.
 *
 * The Overview tabs are pinned in RECORD_TAB_COUNT_EXCEPTIONS with their reason
 * (one record, not a collection); the Activity tabs are badged with the exact
 * server total by the withTabCounts seam (R8 for the place, R16 for the number).
 */
function internalDetailTabs(rows: { label: string; column: string }[]): RecipeTab[] {
  return [
    {
      key: "overview",
      label: "Overview",
      icon: CONCEPT_ICON.overview,
      block: { kind: "description", columns: 1, rows },
    },
    {
      key: "activity",
      label: "Activity",
      icon: CONCEPT_ICON.activity,
      block: { kind: "activity", source: "activity" },
    },
  ]
}

/** The two actions every internal record carries, gated on its own module. Edit
 * and archive are the whole write surface: these are records somebody keeps, not
 * records somebody works through, so there is no status to move along. */
function internalDetailActions(module: string, prefix: string, archiveLabel: string): RecipeAction[] {
  return [
    { id: `${prefix}.edit`, label: "Edit", action: `${prefix}.edit`, variant: "outline", gate: { module, right: "edit" } },
    {
      id: `${prefix}.archive`,
      label: archiveLabel,
      action: `${prefix}.archive`,
      variant: "destructive",
      gate: { module, right: "delete" },
    },
  ]
}

/** Brand library list — the material everything else is made with. */
const brandListRecipe: ScreenRecipe = {
  type: "list",
  display: "list",
  surface: "none",
  binding: { module: "brand" },
  gate: { module: "brand_assets", right: "read" },
  fields: [field("name", "Asset"), field("detail", "Details")],
  actions: [],
  collection: listCollection("Nothing in the brand library yet.", "Search the brand library…", [
    { field: "category", label: "Category", control: "select" },
    { field: "state", label: "Archived", control: "select" },
  ]),
}

const brandDetailRecipe: ScreenRecipe = {
  type: "detail",
  binding: { module: "brand" },
  gate: { module: "brand_assets", right: "read" },
  fields: [],
  actions: internalDetailActions("brand_assets", "brand", "Archive asset"),
  header: { title: "name", subtitle: "detail" },
  tabs: internalDetailTabs([
    { label: "Category", column: "category" },
    { label: "Description", column: "description" },
    { label: "File", column: "file" },
    { label: "Added", column: "created" },
    { label: "Added by", column: "createdBy" },
    { label: "Last updated", column: "updated" },
  ]),
}

/** Meeting purposes — why the agency meets, reached from the Meetings screen. */
const purposesListRecipe: ScreenRecipe = {
  type: "list",
  display: "list",
  surface: "none",
  binding: { module: "purposes" },
  gate: { module: "delivery", right: "read" },
  fields: [field("name", "Purpose"), field("detail", "Details")],
  actions: [],
  collection: listCollection("No meeting purposes yet.", "Search meeting purposes…", [
    { field: "department", label: "Department", control: "select" },
    { field: "state", label: "Archived", control: "select" },
  ]),
}

const purposesDetailRecipe: ScreenRecipe = {
  type: "detail",
  binding: { module: "purposes" },
  gate: { module: "delivery", right: "read" },
  fields: [],
  actions: internalDetailActions("delivery", "purpose", "Archive purpose"),
  header: { title: "name", subtitle: "detail" },
  tabs: internalDetailTabs([
    { label: "Department", column: "department" },
    { label: "Description", column: "description" },
    { label: "Added", column: "created" },
    { label: "Added by", column: "createdBy" },
    { label: "Last updated", column: "updated" },
  ]),
}

/* ------------------------------ the registry ------------------------------ */

/** The in-code BASE recipe for each screen key — the shipped default every team
 * inherits. A team can OVERRIDE one via the config store (per-team `screens`
 * table); the resolver merges override-over-base. Keys are `<module>.<view>`.
 * Roles DETAIL has no recipe — its permission grid has no engine block, so the
 * host composes it from the library PermissionMatrix (see role-detail.tsx). */
export const BASE_RECIPES: Record<string, ScreenRecipe> = {
  "team.detail": teamDetailRecipe,
  "members.list": membersListRecipe,
  "members.detail": memberDetailRecipe,
  "roles.list": rolesListRecipe,
  "invites.list": invitesListRecipe,
  "invites.detail": inviteDetailRecipe,
  "tickets.list": ticketsListRecipe,
  // Accounts DETAIL has no recipe — its people, its logins and the accounts
  // nested under it are collections with their own actions, which no engine
  // block draws (see account-detail.tsx).
  "accounts.list": accountsListRecipe,
  // Knowledge DETAIL has no recipe — its panel is the source's own text plus the
  // controls that take it away from the assistant or give it back, which no
  // engine block draws (see knowledge-detail.tsx).
  "knowledge.list": knowledgeListRecipe,
  // Process maps DETAIL has no recipe either — its steps carry an arithmetic no
  // engine block draws (a baseline, a latest, and the subtraction between them),
  // and its versions and conversation are collections with their own actions
  // (see process-detail.tsx).
  "processes.list": processesListRecipe,
  // THE WORK ENGINE'S FOUR. Three of them have a LIST recipe and a bespoke
  // detail, because each record carries a control no engine block draws: an
  // app's own sprints and stories, a sprint's backlog and its Complete button,
  // a story's status stepper and the time logged against it. A TASK carries
  // none of that — it is a title, a date and a tick — so it is the one of the
  // four whose detail is a recipe.
  "stories.list": storiesListRecipe,
  "sprints.list": sprintsListRecipe,
  "apps.list": appsListRecipe,
  "tasks.list": tasksListRecipe,
  "tasks.detail": taskDetailRecipe,
  // The diary. Its DETAIL has no recipe: two of its three tabs are prose
  // somebody wrote (the agenda, and the notes afterwards) and its header carries
  // the one button in this module that reaches outside the app — see
  // meeting-detail.tsx.
  "meetings.list": meetingsListRecipe,
  // The agency's own housekeeping — the only four DETAILS in the app that are
  // pure recipes (see the note above them for why they can be).
  "brand.list": brandListRecipe,
  "brand.detail": brandDetailRecipe,
  "purposes.list": purposesListRecipe,
  "purposes.detail": purposesDetailRecipe,
}

/** A structural guard for a parsed override. The config store treats a recipe as
 * OPAQUE JSON (it only checks it parses + is bounded), so the WEB app owns the
 * shape check. Without this, valid-but-malformed JSON (e.g. `{}`, `42`, a recipe
 * missing its `actions`/`fields` arrays) would reach the engine and throw when it
 * reads `recipe.actions`/`recipe.fields` — blanking the screen team-wide. */
export function isScreenRecipe(value: unknown): value is ScreenRecipe {
  if (typeof value !== "object" || value === null) return false
  const r = value as Record<string, unknown>
  return (
    typeof r.type === "string" &&
    Array.isArray(r.fields) &&
    Array.isArray(r.actions) &&
    typeof r.binding === "object" &&
    r.binding !== null
  )
}

/** Resolve the recipe for a screen key: a team's JSON override (if present AND a
 * structurally-valid recipe) wins over the in-code base. Defensive — a missing,
 * unparseable, OR shape-incomplete override falls back to the base, so a bad
 * override can never break the screen. */
export function resolveRecipe(
  key: string,
  overrides: Record<string, string> | undefined,
  /** The caller's language, as `t`. Omit it and the recipe comes back in
   * English — which is what a test wants, and what the rule scans read. */
  t?: Translate
): ScreenRecipe | null {
  const base = BASE_RECIPES[key] ?? null
  const raw = overrides?.[key]
  const chosen = (() => {
    if (!raw) return base
    try {
      const parsed: unknown = JSON.parse(raw)
      return isScreenRecipe(parsed) ? parsed : base
    } catch {
      return base
    }
  })()
  return t && chosen ? translateRecipe(chosen, t) : chosen
}

/** THE RECIPE'S OWN WORDS, in the reader's language — one pass, at the one place
 * every rendered recipe passes through (`resolveRecipe`).
 *
 * A recipe is DATA in a module with no React in it, so it cannot call a hook and
 * `t("Accounts")` cannot be written where the recipe is declared. Nor should it
 * be: the recipe is also what a team OVERRIDES and what the tests read, and both
 * of those want the English. So the English stays in the recipe — it is the
 * catalogue's key (shared/i18n.ts) — and the translation happens once, on the
 * way to the screen. One function instead of two hundred call sites, and a new
 * recipe is translated the day it is written without anybody remembering to.
 *
 * WHAT IS TRANSLATED AND WHAT IS NOT is the whole care in here. Every string
 * below is one WE wrote: a heading, a button, a column's label, an empty state,
 * a confirm. Deliberately untouched:
 *
 *   • `binding.module`, `field.column`, `facet.field`, `sortBy` — names of data,
 *     not words on a screen. Translating one silently unbinds the screen.
 *   • `header.title` / `header.subtitle` — despite the names, these are the
 *     record COLUMNS the header reads from (see ScreenHeader), so they belong in
 *     the list above.
 *   • `filterFacets[].options` — derived from the rows at render, which is
 *     somebody's own typing, and that is never translated.
 *
 * A fresh copy throughout; the base recipe is never mutated. */
export function translateRecipe(recipe: ScreenRecipe, t: Translate): ScreenRecipe {
  return {
    ...recipe,
    fields: recipe.fields.map((f) => ({
      ...f,
      field: {
        ...f.field,
        label: t(f.field.label),
        helpText: f.field.helpText ? t(f.field.helpText) : f.field.helpText,
      },
    })),
    actions: recipe.actions.map(translateAction),
    ...(recipe.confirm ? { confirm: translateConfirm(recipe.confirm, t) } : {}),
    ...(recipe.tabs
      ? {
          tabs: recipe.tabs.map((tab) => ({
            ...tab,
            label: t(tab.label),
            block: translateBlock(tab.block, t),
          })),
        }
      : {}),
    ...(recipe.collection ? { collection: translateCollection(recipe.collection, t) } : {}),
    ...(recipe.layout ? { layout: translateNode(recipe.layout, t) } : {}),
  }

  function translateAction(a: RecipeAction): RecipeAction {
    return {
      ...a,
      label: t(a.label),
      ...(a.confirm ? { confirm: translateConfirm(a.confirm, t) } : {}),
    }
  }
}

/** `{ title, body }` — the same shape on a screen-level confirm and on an
 * action's own, so it is read once. */
function translateConfirm<T extends { title: string; body: string }>(confirm: T, t: Translate): T {
  return { ...confirm, title: t(confirm.title), body: t(confirm.body) }
}

function translateCollection(c: CollectionConfig, t: Translate): CollectionConfig {
  return {
    ...c,
    title: c.title ? t(c.title) : c.title,
    emptyText: c.emptyText ? t(c.emptyText) : c.emptyText,
    searchPlaceholder: c.searchPlaceholder ? t(c.searchPlaceholder) : c.searchPlaceholder,
    sortOptions: c.sortOptions.map((o) => ({ ...o, label: t(o.label) })),
    filterFacets: c.filterFacets.map((f) => ({ ...f, label: t(f.label) })),
  }
}

function translateBlock(block: RecipeBlock, t: Translate): RecipeBlock {
  if (block.kind === "description") {
    return { ...block, rows: block.rows.map((r) => ({ ...r, label: t(r.label) })) }
  }
  if (block.kind === "list" && block.collection) {
    return { ...block, collection: translateCollection(block.collection, t) }
  }
  return block
}

function translateNode(node: RecipeNode, t: Translate): RecipeNode {
  if (node.node === "block") return { ...node, block: translateBlock(node.block, t) }
  return { ...node, children: node.children.map((child) => translateNode(child, t)) }
}

/** Tune a list recipe's collection chrome to the DATA it's about to show, so we
 * never render dead UI: no rows → hide search + filters entirely (the empty
 * state stands alone); rows present → keep the recipe's own search setting, and
 * keep a facet only when at least one of its rows carries a value (an all-empty
 * facet is a useless dropdown). A fresh copy — the base recipe is never mutated.
 *
 * It RESPECTS `searchable` rather than turning it on: a paged collection's box
 * belongs to the door (see `listCollection`), and this used to switch the
 * frame's own one back on the moment a row existed — which is every time.
 *
 * `emptyText` is the one thing a caller may override, and there is exactly one
 * caller: a screen mid-search, where "No accounts yet." is a sentence about the
 * collection and not about the question that just came back empty. */
export function withDataDrivenCollection(
  recipe: ScreenRecipe,
  rows: Record<string, unknown>[],
  emptyText?: string
): ScreenRecipe {
  const collection = recipe.collection
  if (!collection) return recipe
  const text = emptyText ?? collection.emptyText
  if (rows.length === 0) {
    return {
      ...recipe,
      collection: { ...collection, emptyText: text, searchable: false, userFilter: false },
    }
  }
  const facets = collection.filterFacets.filter((f) =>
    rows.some((row) => {
      const v = row[f.field]
      return v != null && String(v).trim() !== ""
    })
  )
  return {
    ...recipe,
    collection: {
      ...collection,
      emptyText: text,
      searchable: collection.searchable,
      userFilter: facets.length > 0,
      filterFacets: facets,
    },
  }
}

/** LAW R8, the record-detail half — WHICH collection a detail tab reveals, read
 * off the tab's OWN block rather than a hand-kept list of tab keys:
 *
 *   • `activity` → the feed it names (`block.source`)
 *   • `list`     → the module it binds to (`block.binding.module`)
 *   • anything else (a `description` / `fields` block) → the record ITSELF, so
 *     there is no collection and no count (each one pinned, with its reason, in
 *     RECORD_TAB_COUNT_EXCEPTIONS).
 *
 * Derived, so a new tab is classified by what it renders — never by someone
 * remembering to add its key somewhere. */
export function tabCountKey(tab: RecipeTab): string | null {
  if (tab.block.kind === "activity") return tab.block.source
  if (tab.block.kind === "list") return tab.block.binding.module
  return null
}

/** Badge a detail recipe's collection tabs with their EXACT server totals (LAW
 * R8 for the place, LAW R16 for the number — `formatCount` is the one seam, and
 * an absent/zero total renders nothing rather than a "0" that reads as empty
 * while the rows are still on their way). `totals` is keyed by the collection
 * `tabCountKey` names, so the host supplies numbers without knowing tab keys.
 * A fresh copy — the base recipe is never mutated. */
export function withTabCounts(
  recipe: ScreenRecipe,
  totals: Record<string, number | undefined>
): ScreenRecipe {
  if (!recipe.tabs?.length) return recipe
  return {
    ...recipe,
    tabs: recipe.tabs.map((tab) => {
      const key = tabCountKey(tab)
      return key === null ? tab : { ...tab, badge: formatCount(totals[key]) }
    }),
  }
}

/** Drop the named actions from a recipe (a fresh copy — the base is never
 * mutated). The host uses this to hide an action for a specific record, e.g. you
 * can't change your own role or remove yourself from the member detail. */
export function withoutActions(recipe: ScreenRecipe, ids: string[]): ScreenRecipe {
  // Defensive: an override could omit `actions` (resolveRecipe now guards this,
  // but don't blindly trust the shape here either).
  const actions = Array.isArray(recipe.actions) ? recipe.actions : []
  if (actions.length === 0) return recipe
  const drop = new Set(ids)
  return { ...recipe, actions: actions.filter((a: RecipeAction) => !drop.has(a.id)) }
}

/** Re-label (and optionally re-style) one action — for a TOGGLE, where the same
 * door does two opposite things and the button has to say which one it will do
 * NEXT (a fresh copy; the base recipe is never mutated).
 *
 * `RecipeAction.label` is a static string in the library, and the library is
 * lego this repo does not edit — so a control whose wording depends on the
 * record's state is the HOST's job, and this is the one seam for it.
 *
 * The task tick is why it exists. It read "Tick it off" whether or not the task
 * was already done: the write toggled correctly underneath, so pressing the
 * unchanged button a second time quietly REOPENED the thing you had just
 * finished — the tester's "it marks as done, but the button to tick it off stays
 * there". R17's shape (an idempotent transition) has a matching obligation on
 * the screen: a control that offers the same move again is a control that reads
 * as though nothing happened. */
export function withActionLabel(
  recipe: ScreenRecipe,
  id: string,
  label: string,
  variant?: RecipeAction["variant"]
): ScreenRecipe {
  const actions = Array.isArray(recipe.actions) ? recipe.actions : []
  if (actions.length === 0) return recipe
  return {
    ...recipe,
    actions: actions.map((a: RecipeAction) =>
      a.id === id ? { ...a, label, ...(variant ? { variant } : {}) } : a
    ),
  }
}
