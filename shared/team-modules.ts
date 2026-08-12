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
  "todos",
  // THE AGENCY'S OWN HOUSEKEEPING — four modules carrying the seven Glide tables
  // that describe how the agency runs ITSELF rather than what it does for a
  // client. None of them is customer material, so every door on all four refuses
  // a client login outright (R21) rather than fencing.
  "marketing",
  "brand_assets",
  "delivery",
  "staff_profiles",
  // GOOGLE — THREE MODULES, BECAUSE THE OWNER NAMED THREE SWITCHES.
  //
  // "May connect a Google account" is one switch per role. "kwapso may act in
  // Google on my behalf" is TWO more — sending mail, and creating events —
  // deliberately separate from each other AND from the `agent` right, so that
  // giving somebody the assistant does not silently give the assistant their
  // outbox. The tall sheet's unit of "a switch per role" is a module row, so
  // three switches are three rows. (`agent` is the precedent for a module whose
  // four rights are not all meaningful: nothing reads agent:edit either.)
  "google",
  "google_mail",
  "google_events",
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
  // TO-DOS — the one part of the work engine a client login can WRITE to, which
  // is exactly why it is its own module and not four more rights on `work`. A
  // contact completes theirs and uploads a file against it from the portal
  // (SCOPE ch.06, one of the six things a contact can do), so an owner grants
  // `todos: read + edit` to their Client role and grants nothing else.
  todos: "To-dos",

  // ── THE AGENCY'S OWN HOUSEKEEPING ──────────────────────────────────────────
  // Four modules, seven legacy tables, and one sentence that decides all of it:
  // none of this is any client's. It is what WE publish, the material we publish
  // it with, how we run our own delivery, and who our people are — so these
  // modules never appear in a portal, never carry an account fence, and every
  // door on them refuses a client login the way `learning` and `knowledge` do.
  //
  // Two of the seven legacy tables are NOT here, on purpose. `departments` (8
  // rows) and `channels` (6) are bare labels with no fields of their own, and the
  // base already has exactly one home for a team's editable vocabulary — the
  // dropdown values module, which carries its own permissions, screen, import,
  // export and machine tools. Giving each of them a table, a screen and a
  // permission row would be a module built to hold a word.
  marketing: "Marketing",
  brand_assets: "Brand library",
  // Programmes and meeting purposes: two thin tables, one area. The legacy
  // reconciliation groups them in a single sentence ("`program` and `purposes`
  // support meetings and the delivery method"), and they are read together, so
  // they are one module the same way apps, processes and steps are one.
  delivery: "Delivery method",
  // The person behind the member row: their profile and the certificates they
  // hold. Visible to the team, never to a client — which is why it is its own
  // permission row and not four more rights on `team_members`: an agency can
  // want everyone to see who their colleagues are without everyone being able to
  // change who is on the team.
  staff_profiles: "Staff profiles",

  // ── GOOGLE ─────────────────────────────────────────────────────────────────
  // What each right MEANS here, because three of these four are not the usual
  // reading and a permission nobody can read is a permission nobody can grant
  // safely:
  //   read   — see your own connections, and read what you have shared through
  //            them (files in the folders you named, mail with a known contact,
  //            your calendar, the spaces you named);
  //   create — CONNECT a Google account, and name a folder or a space for it;
  //   edit   — write back through a connection: put a file in a folder you
  //            named, leave a draft in your own Gmail, post in a space you named;
  //   delete — disconnect an account, or take a folder or space away again.
  //
  // The two acts that reach OUTSIDE the world you connected — mail that actually
  // leaves, and an event that lands in a calendar — are the owner's two extra
  // switches and live in their own modules below. Only `create` is read on
  // either: the module IS the switch. A space post is not a third switch because
  // the owner named two, and a space is one you named yourself; it sits under
  // `edit` with the other writes.
  google: "Google connections",
  // Read as a sentence with the role's name in front: "Ana may send mail on her
  // behalf" is the wrong reading — it is "kwapso may send mail on Ana's behalf".
  // The right is on the ROLE because that is where the agency decides it, and it
  // applies whether the assistant pressed the button or Ana did: pressing "send
  // it from kwapso" is the same act, done by the same product, from the same
  // mailbox.
  google_mail: "Mail on your behalf",
  google_events: "Calendar on your behalf",
}

/** The matrix rows: { key, label } per module, in display order. */
export const TEAM_MODULE_CATALOG: { key: string; label: string }[] =
  TEAM_MODULES.map((key) => ({ key, label: MODULE_LABELS[key] }))

/** The four rights each module row carries, in matrix order. */
export const MODULE_RIGHTS = ["read", "create", "edit", "delete"] as const
