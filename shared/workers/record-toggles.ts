// SWITCH A RECORD OFF, OR BACK ON — the twenty-one doors that are one act.
//
// WHAT THIS REPLACED. The catalogue used to carry twenty-one tools whose whole
// difference was the noun in the path: `set_account_active`, `set_role_active`,
// `set_app_active`, `set_wave_active`, and so on down to
// `set_staff_certificate_active`. Every one of them took an id and a boolean,
// posted it to `<module>/active`, and rode the same idempotent predicate R17
// requires (the current-status test travels with the UPDATE, so a re-run moves
// zero rows, writes no activity and pings nobody). Twenty-one names for one
// operation, and about 2,500 tokens of schema re-sent to the model on every
// step of every turn, whether or not anybody was archiving anything.
//
// R17 is the argument for the collapse, not a coincidence beside it: a law that
// says these all share one shape is a law saying they are one operation.
//
// WHAT IS DELIBERATELY NOT HERE. `set_deliverable_visibility` is the twenty-
// second door of the same shape and it stays its own tool. Its boolean does not
// mean "is this record live" — it means "may the CLIENT see this" — and its
// confirm rule runs the other way (showing a client something asks; hiding it
// again does not). Folding it in would give one argument two meanings, so a
// model that had just learned `active:false` archives a record would use it to
// publish one. A saving of about a hundred tokens is not worth that sentence.
//
// ── HOW THE CONFIRM RULE SURVIVED THE COLLAPSE ───────────────────────────────
//
// The twenty-one did NOT all behave alike, and that is the part a tidy-up would
// have quietly lost. Three behaviours were in there: seven confirmed BOTH ways
// (an access write — deactivating a role removes access and reactivating hands
// it back), eleven confirmed only when switching OFF, and three never confirmed
// at all. So `confirm` is declared per entry, reproducing exactly what each door
// did before — and `alwaysConfirms` in tool-gates.ts may only UPGRADE that to
// "always", never downgrade it, by running the same `isPrivilegeWrite`
// derivation the individual tools rode. A toggle added tomorrow on a privilege
// module or a fence table therefore confirms the moment it exists, even if
// whoever added it wrote "off".
//
// `workers/mcp/test/record-toggles.test.ts` pins the whole matrix — every
// entry, both directions — against what the twenty-one tools answered, so the
// collapse is a refactor rather than a rewrite with a nice comment on it.

/** One door in the family. `path` and `binding` are LITERALS: the record name a
 * caller sends only ever selects an entry here, and can never contribute to a
 * URL. */
export type RecordToggle = {
  binding: "TENANCY" | "CONTENT"
  path: string
  /** The body field this door reads the record's id from. Two doors say
   * `roleId`; the rest say `id`. The tool exposes both (R22: a tool must offer
   * every field its door reads) and the builder sends the one that door wants. */
  idField: "id" | "roleId"
  /** This door ALSO needs the app the record hangs off (deliverables). */
  needsAppId?: boolean
  /** The permission the door asks for. Data here rather than in `TOOL_GATES`
   * because a single collapsed tool has no single gate — and because
   * `alwaysConfirms` reads it to decide whether this is an access write. */
  gate: string
  /** What the record is called in a sentence a person reads on the panel. */
  noun: string
  /** The verb for switching it ON, and for switching it OFF. */
  on: string
  off: string
  /** What this door did before the collapse: ask both ways, ask only when
   * switching off, or never ask. Never downgraded by the derivation. */
  confirm: "always" | "off" | "never"
  /** The sentence an outside developer reads. The MCP surface still publishes
   * these one tool at a time — `set_account_active`, `set_role_active` and the
   * rest, historical names and all — because a tool name there is an EXTERNAL
   * contract somebody has scripts against, and an MCP client fetches its
   * catalogue ONCE rather than re-sending it on every model step. The collapse
   * pays for itself on the surface that is billed by the token; on the one that
   * is not, it would only break things. Same map, two projections. */
  summary: string
}

/** THE ALLOW-LIST OF TOGGLEABLE RECORDS. A record name that is not a key here
 * reaches no door at all — the same shape as the query grammar's module map, and
 * for the same reason: what a machine may name is a fixed set written in our own
 * source, never a string it composes. */
export const RECORD_TOGGLES: Record<string, RecordToggle> = {
  account: {
    binding: "TENANCY",
    path: "/api/tenancy/accounts/active",
    idField: "id",
    gate: "accounts:delete",
    noun: "account",
    on: "Restore",
    off: "Archive",
    confirm: "off",
    summary:
      "Archive an account (`active: false`) or restore it (`active: true`), never deleted; every record it carries survives.",
  },
  // FENCE WRITE (account_links) → both ways. Unlinking takes a company away from
  // a client login; RELINKING hands it straight back.
  contact_link: {
    binding: "TENANCY",
    path: "/api/tenancy/accounts/links/active",
    idField: "id",
    gate: "contacts:delete",
    noun: "contact link",
    on: "Relink",
    off: "Unlink",
    confirm: "always",
    summary:
      "Unlink a contact from an account (`active: false`) or link them back (`active: true`), by the CONTACT LINK's id, get_account returns it. The person's own account is untouched either way.",
  },
  // PRIVILEGE WRITE (portal_users) → both ways: revoking takes sight of a
  // customer's world away, restoring hands it back.
  portal_access: {
    binding: "TENANCY",
    path: "/api/tenancy/portal-users/active",
    idField: "id",
    gate: "portal_users:delete",
    noun: "portal login",
    on: "Restore",
    off: "Revoke",
    confirm: "always",
    summary:
      "Revoke a portal login (`active: false`) or restore it (`active: true`), by the PORTAL ACCESS row's id, get_account and list_portal_access both return it. The login dies; every record stays.",
  },
  // PRIVILEGE WRITE (member_roles) → both ways, and the one door that reads
  // `roleId` rather than `id`.
  role: {
    binding: "TENANCY",
    path: "/api/tenancy/roles/active",
    idField: "roleId",
    gate: "member_roles:delete",
    noun: "role",
    on: "Activate",
    off: "Deactivate",
    confirm: "always",
    summary:
      "Switch a role off (deactivate, holders keep access) or back on (reactivate), never deleted. Takes `roleId`.",
  },
  dropdown_value: {
    binding: "TENANCY",
    path: "/api/tenancy/selectable/active",
    idField: "id",
    gate: "selectable_data:delete",
    noun: "dropdown value",
    on: "Activate",
    off: "Deactivate",
    confirm: "off",
    summary:
      "Switch a dropdown value off (deactivate) or back on (reactivate), never deleted. A value marked as one of the team's defaults refuses to switch off — take the mark off with `set_dropdown_default` first.",
  },
  app: {
    binding: "TENANCY",
    path: "/api/tenancy/apps/active",
    idField: "id",
    gate: "processes:delete",
    noun: "app",
    on: "Restore",
    off: "Archive",
    confirm: "off",
    summary:
      "Archive an app (`active: false`) or restore it (`active: true`). Never deleted, its maps, its versions and every saving computed from them stay exactly where they are. An archived app drops out of the value figures.",
  },
  app_module: {
    binding: "TENANCY",
    path: "/api/tenancy/app-modules/active",
    idField: "id",
    gate: "processes:delete",
    noun: "module",
    on: "Switch on",
    off: "Switch off",
    confirm: "off",
    summary:
      "Switch a module off (`active: false`) or back on (`active: true`). Never deleted: every ticket already filed against it keeps naming it and still reads correctly — it simply stops being offered on the ticket form.",
  },
  process: {
    binding: "TENANCY",
    path: "/api/tenancy/processes/active",
    idField: "id",
    gate: "processes:delete",
    noun: "process map",
    on: "Restore",
    off: "Archive",
    confirm: "off",
    summary:
      "Archive a process map (`active: false`) or restore it (`active: true`). Never deleted: every version, every step and the whole conversation survive, and an archived map simply stops counting toward the value figures.",
  },
  // `work:edit`, not `work:delete` — the work module offers no delete right, and
  // the door says so itself.
  wave: {
    binding: "TENANCY",
    path: "/api/tenancy/waves/active",
    idField: "id",
    gate: "work:edit",
    noun: "wave",
    on: "Bring back",
    off: "Switch off",
    confirm: "always",
    summary:
      "Switch a wave off, or bring it back (by `id`). Never a delete: the sprints inside it keep their history, and a package a client paid for stays readable.",
  },
  // The client's own organisation. None of the three ever asked, and none of
  // them is an access write, so none of them starts asking now.
  client_department: {
    binding: "TENANCY",
    path: "/api/tenancy/client/departments/active",
    idField: "id",
    gate: "processes:delete",
    noun: "department",
    on: "Bring back",
    off: "Switch off",
    confirm: "never",
    summary:
      "Switch a department off, or bring it back. `active` false retires it; true restores it. Nothing is deleted — a retired department is still the one an old map was drawn against.",
  },
  client_role: {
    binding: "TENANCY",
    path: "/api/tenancy/client/roles/active",
    idField: "id",
    gate: "processes:delete",
    noun: "role in the client's organisation",
    on: "Bring back",
    off: "Switch off",
    confirm: "never",
    summary:
      "Switch a role off in the client's own organisation, or bring it back. Nothing is deleted: a retired role is still the one a two-year-old map was drawn against, and deleting it would quietly turn that map's saving into nothing.",
  },
  client_tool: {
    binding: "TENANCY",
    path: "/api/tenancy/client/tools/active",
    idField: "id",
    gate: "processes:delete",
    noun: "tool",
    on: "Bring back",
    off: "Switch off",
    confirm: "never",
    summary:
      "Switch a tool off, or bring it back. Nothing is deleted — its price history is what an old map reads to cost itself.",
  },
  // MONEY. Both rate cards asked both ways before the collapse and still do:
  // what a client was charged last year, and what our own hour costs, are two
  // records nobody should be able to switch off without being asked.
  account_rate: {
    binding: "TENANCY",
    path: "/api/tenancy/rates/active",
    idField: "id",
    gate: "commercials:delete",
    noun: "rate",
    on: "Activate",
    off: "Deactivate",
    confirm: "always",
    summary:
      "Deactivate a rate (`active: false`) or bring it back (`active: true`). Never deleted, what an account was charged last year has to stay true.",
  },
  internal_rate: {
    binding: "TENANCY",
    path: "/api/tenancy/internal-rates/active",
    idField: "id",
    gate: "commercials:delete",
    noun: "internal rate",
    on: "Activate",
    off: "Deactivate",
    confirm: "always",
    summary:
      "Deactivate one of our own cost lines (`active: false`) or bring it back. Never deleted.",
  },
  meeting: {
    binding: "CONTENT",
    path: "/api/content/meetings/active",
    idField: "id",
    gate: "meetings:delete",
    noun: "meeting",
    on: "Reinstate",
    off: "Cancel",
    confirm: "off",
    summary:
      "Cancel a meeting (`active: false`) or put it back (`active: true`), by id. Nothing is deleted, the record and its notes survive, because a question like 'didn't we speak in March?' has to stay answerable.",
  },
  knowledge_source: {
    binding: "CONTENT",
    path: "/api/content/knowledge/active",
    idField: "id",
    gate: "knowledge:delete",
    noun: "knowledge source",
    on: "Give the assistant back",
    off: "Take away the assistant's sight of",
    confirm: "off",
    summary:
      "Take a source away from the assistant (`active: false`) or give it back (`active: true`), by id. Nothing is deleted: the row and its history survive, its searchable pieces do not, and the sweep will not quietly re-add a source somebody took away.",
  },
  // The one door that needs a second id: a deliverable is addressed by the app
  // whose shelf it sits on as well as by itself.
  deliverable: {
    binding: "CONTENT",
    path: "/api/content/deliverables/active",
    idField: "id",
    needsAppId: true,
    gate: "deliverables:delete",
    noun: "deliverable",
    on: "Restore",
    off: "Archive",
    confirm: "off",
    summary:
      "Archive a deliverable (`active: false`) or put it back (`active: true`). Needs `appId`, the app whose shelf it sits on. Never deleted, and the file behind it is never thrown away either way, restoring one whose bytes had gone would hand back a broken link.",
  },
  brand_asset: {
    binding: "CONTENT",
    path: "/api/content/brand-assets/active",
    idField: "id",
    gate: "brand_assets:delete",
    noun: "brand asset",
    on: "Restore",
    off: "Archive",
    confirm: "off",
    summary:
      "Archive a brand asset, or put it back. The FILE is never deleted either way, restoring an asset whose bytes had been thrown away would hand back a broken link.",
  },
  meeting_purpose: {
    binding: "CONTENT",
    path: "/api/content/delivery/purposes/active",
    idField: "id",
    gate: "delivery:delete",
    noun: "meeting purpose",
    on: "Restore",
    off: "Archive",
    confirm: "off",
    summary:
      "Archive a meeting purpose, or put it back, never deleted.",
  },
  staff_profile: {
    binding: "CONTENT",
    path: "/api/content/staff/profiles/active",
    idField: "id",
    gate: "staff_profiles:delete",
    noun: "staff profile",
    on: "Restore",
    off: "Take down",
    confirm: "always",
    summary:
      "Take a staff profile down, or put it back, never deleted.",
  },
  staff_certificate: {
    binding: "CONTENT",
    path: "/api/content/staff/certificates/active",
    idField: "id",
    gate: "staff_profiles:delete",
    noun: "certificate",
    on: "Restore",
    off: "Archive",
    confirm: "off",
    summary:
      "Archive a certificate, or put it back, never deleted.",
  },
}

/** The entry a caller named, or undefined. `hasOwnProperty`, not bracket
 * access — `record=__proto__` resolves an inherited member on a bare object
 * literal and would then read as a live door. */
/** THE KINDS, as an allow-list both machine surfaces declare in their schema.
 *
 * DERIVED from the map above, never typed out beside it. `set_record_active`
 * used to take `record` as a free string and forward an unrecognised one to the
 * ACCOUNTS door — so a caller asking to archive a ticket silently archived a
 * client. Both surfaces now declare this as an enum, which turns that into a 400
 * naming the kinds; a hand-written second list would have re-opened the same hole
 * the first time somebody added a toggle and updated only one of the three. */
export const RECORD_TOGGLE_NAMES = Object.keys(RECORD_TOGGLES)

export function recordToggle(name: string | undefined): RecordToggle | undefined {
  if (!name) return undefined
  return Object.prototype.hasOwnProperty.call(RECORD_TOGGLES, name)
    ? RECORD_TOGGLES[name]
    : undefined
}
