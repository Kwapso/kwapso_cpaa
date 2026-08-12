// THE one list of team modules a role's permission sheet covers — shared truth.
// Tenancy builds the permission matrix from it (tall sheet: one row per role ×
// module) and data-ops builds the import/export matrix columns from it, so the
// two can never drift. Adding a module here is the ONLY way it appears in either.

/** The modules every role's permission sheet covers today. Future modules just
 * add rows, never columns. */
export const TEAM_MODULES = [
  "teams",
  "team_members",
  "member_roles",
  "accounts",
  "portal_users",
  "learning",
  "help",
  "knowledge",
  "selectable_data",
  "screens",
  "agent",
  "processes",
  "commercials",
  "work",
] as const

/** Plain-English label for each module, shown as the rows of the permission
 * matrix. Keyed off TEAM_MODULES so a new module can't be added without a
 * label. ONE source for both the workers and the Roles screen. */
const MODULE_LABELS: Record<(typeof TEAM_MODULES)[number], string> = {
  teams: "Team",
  team_members: "Members",
  member_roles: "Roles & permissions",
  // The customer spine. `accounts` covers the account records AND the links
  // between them (a link is the SHAPE of an account, not a record of its own);
  // granting someone a login is separately gated because it hands out sight of
  // customer data, which is a bigger decision than editing a phone number.
  accounts: "Accounts",
  portal_users: "Portal access",
  learning: "Learning",
  // The module KEY stays `help` — it is the permission string every role's sheet
  // already carries, the table the rows live in, and the path the API answers on.
  // The LABEL is what a person reads, and the word for this is Tickets.
  help: "Tickets",
  // The knowledge base: the material the assistant is allowed to read. Its four
  // rights mean exactly what they say — `read` is "ask it questions", and
  // `delete` is "take a source away from it". A person who cannot delete a
  // source cannot ask the assistant to delete one either, because the assistant
  // acts through this same sheet.
  knowledge: "Knowledge base",
  selectable_data: "Dropdown data",
  screens: "Screens",
  agent: "AI agent",
  // THE MAP AND THE MONEY, kept apart on purpose — one is the client's own world
  // and the other is the agency's books.
  //
  // `processes` covers the whole App → Process → Step chain, its versions, and
  // the comments a client leaves on a map. It is CUSTOMER material: a contact
  // sees their own company's maps and the value they got, so every door on it
  // carries the account fence.
  //
  // `commercials` covers the two rate cards and the margin. It is AGENCY
  // material, and no client login ever passes one of its doors — which is why
  // it is a second module and not four more rights on the first.
  processes: "Process maps",
  commercials: "Rates & margin",
  // THE WORK ENGINE — what we DO, as opposed to what an account asks for. One
  // module covers stories, the sprints they sit in and the time logged against
  // them, because they are one record from a reader's point of view: a piece of
  // work, when it is due, and how long it took. It is AGENCY material — a client
  // sees a COUNT of the stories on their own ticket and never a title, an
  // assignee or a date (SCOPE ch.06) — so no client login holds it and every
  // door on it refuses a portal caller.
  //
  // To-dos are deliberately NOT here: a to-do is aimed at the client and they
  // must be able to complete one, so it is its own module with its own right.
  work: "Work",
}

/** The matrix rows: { key, label } per module, in display order. */
export const TEAM_MODULE_CATALOG: { key: string; label: string }[] =
  TEAM_MODULES.map((key) => ({ key, label: MODULE_LABELS[key] }))

/** The four rights each module row carries, in matrix order. */
export const MODULE_RIGHTS = ["read", "create", "edit", "delete"] as const
