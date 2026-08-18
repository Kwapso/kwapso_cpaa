// THE DROPDOWN GROUPS THE CODE ITSELF NAMES.
//
// Most groups in `selectable_data` are a team's own business — they type them on
// the Dropdown values screen and nothing in the code knows they exist. These four
// are different: a worker pick-or-creates into them (the way a meeting purpose's
// department is pick-or-created into "Department"), or the legacy migration lands
// a set of rows in them. So the string has to be said in ONE place, or the
// screen that offers a value and the door that writes one drift into two groups
// with the same meaning and different names — which is the exact failure the
// module exists to prevent, committed by the module itself.
//
// A group is not a row: the table holds (type, value) pairs, so a group EXISTS
// once it has a value. That is why the two migrated ones ship with a starting
// vocabulary (DEFAULT_SELECTABLE in workers/tenancy/src/team-schema.ts) and the
// two module vocabularies do not — those fill themselves from the first value
// anybody writes, or from the rows the legacy import brings.

export const SELECTABLE_GROUPS = {
  /** A meeting purpose's department — the legacy `departments` table, eight rows,
   * a vocabulary for the same reason. */
  department: "Department",
  /** A brand asset's category — logos, decks, templates, photography. */
  brandCategory: "Brand asset category",
  /** WHERE AN ACCOUNT IS. The first of the two ungrouped legacy sets: ten country
   * labels that carried no group at all. The alternative was a field on the
   * account; the owner ruled for a group, because a country typed free into an
   * address is a country spelled five ways by five people. */
  country: "Country",
  /** HOW BIG AN ACCOUNT IS. The second ungrouped set — five size bands. */
  companySize: "Company size",
  /** WHERE AN APP HAS GOT TO. It was a free-typed text field until 17 Aug 2026,
   * which is how one inventory carried "live", "Live" and "in dev" for the same
   * three apps. The eight names the agency already uses live in
   * `shared/app-stages.ts` beside the mark and the active/inactive answer each
   * one implies; the rows themselves are ordinary dropdown values, editable like
   * every other vocabulary. */
  appStage: "App stage",
  /** WHAT KIND OF THING WE HANDED OVER — the word in small caps on a
   * deliverable's card. A vocabulary rather than an enum for the same reason
   * every other word here is one: the owner's list ("handover materials /
   * handover docs / API documentation / loom or teller reviews / SOPs") ends in
   * "etc.", and an enum has no room for the etc. */
  deliverableKind: "Deliverable kind",
} as const

export type SelectableGroup = (typeof SELECTABLE_GROUPS)[keyof typeof SELECTABLE_GROUPS]

/** The starting vocabulary for `deliverableKind`, in the owner's own words.
 *
 * It lives beside the group name rather than loose in the schema because the
 * migration that ships it to EXISTING teams and the seed a NEWBORN team runs
 * both read it — and a starting set written twice is a set that ends up
 * different in a team made yesterday and a team made last month (the duplicate
 * dropdown values migration 0026 is what that costs). Editable like every other
 * vocabulary: a team adds its own on the Dropdown values screen. */
export const DELIVERABLE_KINDS = [
  "Handover doc",
  "API documentation",
  "Video",
  "SOP",
  "Other",
] as const
