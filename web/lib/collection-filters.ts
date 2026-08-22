// WHAT EACH PAGED COLLECTION MAY BE NARROWED BY, in the words a person reads.
//
// The exact sibling of `collection-sorts.ts`, and for the exact same reason. A
// collection is asked three things — which rows, which of those, and in what
// order — and on a collection that PAGES all three are questions for the DOOR
// (SEARCH.md layer 2). Sorting got its screen-side half in one file on 18 Aug;
// this is the filtering half, arriving the same day and one control along.
//
// ── THE FAULT THAT EARNED IT ─────────────────────────────────────────────────
//
// The owner filtered the knowledge base by "From a meeting" and was shown TWO
// sources. The door, asked properly, answers 52; the app holds 170 meetings.
// `kind` was a `filterFacets` entry on a paged recipe, so the library's frame
// filtered the fifty rows it was holding — and page one happened to contain
// exactly two meetings, so the screen reported two with a straight face, under a
// badge (R16) correctly counting all 3,000-odd sources.
//
// That is the THIRD instance of one shape in a day. The search box searched page
// one until it was moved to the door; a column header sorted nothing at all; now
// the facets narrow page one. Each looked like an answer and was not, and the
// only thing they have in common is where they were answered.
//
// ── HOW THIS FILE ANSWERS IT ─────────────────────────────────────────────────
//
// `field` is the DOOR's OWN query parameter, never the shaped row's column. That
// is the whole substitution the old arrangement made: `{ field: "kind" }` on a
// recipe meant "the `kind` property of the row objects in the browser", and it
// read identically to "the `kind` parameter the door parses". One of those spans
// the collection and one of them spans whatever happened to be loaded.
//
// A facet's OPTIONS come from one of two places, and which one is a fact about
// the door rather than a style:
//
//   • a CLOSED vocabulary (a kind, a stage, yes/no) is declared here, in full,
//     because the door matches exactly these words and there are not many;
//   • a facet over ROWS (an account, an app, a sprint, a person) declares none —
//     the door matches an id, so the screen supplies them from the list it is
//     already holding, and a facet the screen has no rows for is dropped rather
//     than drawn empty.
//
// `web/test/rules.test.ts` (`facets-ask-the-door`) reads each door's own
// parameter parsing off disk and asserts every `field` below is one of them —
// the same derivation R19 makes of a tool's filters, and the same shape
// `paged-sort.test.ts` makes of a sort menu. A facet naming a parameter its door
// does not parse is a control that quietly answers nothing.

import type { FilterFacet } from "@shared/ui/lib/config"

import { KNOWLEDGE_KIND } from "@/components/deep-link/shape"

/** One option on a facet: the word the DOOR matches, and the word a person
 * reads. They are different on purpose — a door matches `meeting`, a person is
 * looking for "From a meeting" — and conflating them is how a filter comes to
 * send a display label to a database. */
export type FacetOption = { value: string; label: string }

/** One door filter, as a screen offers it. */
export type CollectionFacet = {
  /** THE DOOR'S OWN QUERY PARAMETER. Not the shaped row's column. */
  field: string
  /** what a person reads above the dropdown */
  label: string
  /** the CLOSED vocabulary, where the door has one. A facet over rows leaves
   * this out and the screen fills it in — see `translatedFacets`. */
  options?: FacetOption[]
}

/** Yes and no, which four of these facets need and none of them should spell
 * twice. The VALUES are the two words the doors allow-list; the labels are what
 * a person reads. */
const YES_NO: FacetOption[] = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
]

/** THE PAGED COLLECTIONS' door filters, keyed by the collection's name in
 * `GROWING_COLLECTIONS` (shared/rules/registry.ts), so a check can find the door
 * that owns each one without anything being hand-paired.
 *
 * A collection missing from here offers no filters at all, which is a decision
 * and is written down in `UNFILTERED` beside the check. */
export const COLLECTION_FILTERS: Record<string, CollectionFacet[]> = {
  accounts: [
    { field: "archived", label: "Archived", options: YES_NO },
  ],
  knowledge: [
    // WHAT A SOURCE IS. A closed vocabulary — the door allow-lists it against
    // KNOWLEDGE_KINDS — so every kind is offered whether or not one happens to
    // be on the page in front of you. Deriving these from the loaded rows was
    // half of the original fault: the filter could only offer what page one
    // already showed, which is the answer it was supposed to go and find.
    {
      field: "kind",
      label: "Type",
      options: Object.entries(KNOWLEDGE_KIND).map(([value, label]) => ({ value, label })),
    },
    // WHOSE IT IS — the compartment string, `agency` or `account:<id>`. Rows,
    // because the ids are the team's accounts.
    { field: "compartment", label: "Filed under" },
    // TAKEN AWAY, OR STILL READ. A source removed from the assistant's sight is
    // kept, not deleted (deactivate-never-delete), so both are ordinary rows in
    // this list and telling them apart is what this asks.
    {
      field: "active",
      label: "Status",
      options: [
        { value: "yes", label: "In use" },
        { value: "no", label: "Not in use" },
      ],
    },
  ],
  meetings: [
    { field: "accountId", label: "Client" },
    { field: "purposeId", label: "Why we met" },
    // NO STATUS FILTER, and the reason changed under this line while it was
    // being written. It used to offer Scheduled and Held; `held` was retired the
    // same day — a flag somebody had to remember to tick could disagree with the
    // calendar in both directions, so a meeting's own start time answers "has it
    // happened" and cannot go stale. There is nothing left to filter ON: past
    // and upcoming are a date comparison, and this door parses no date filter.
    //
    // The check beside this file caught it the moment the two lanes met, which
    // is exactly what it is for: an offered filter that cannot be honoured must
    // not be shown. A date filter on the meetings door would give this back.
  ],
  processes: [
    { field: "appId", label: "App" },
    { field: "archived", label: "Archived", options: YES_NO },
  ],
  stories: [
    // The four stages a piece of work moves through — the same words
    // STORY_STATUS_LABEL renders on the rows, because a filter and a row saying
    // the same thing differently is two vocabularies for one fact.
    {
      field: "status",
      label: "Status",
      options: [
        { value: "open", label: "Open" },
        { value: "in_progress", label: "In progress" },
        { value: "in_review", label: "In review" },
        { value: "done", label: "Done" },
      ],
    },
    { field: "assigneeId", label: "Who has it" },
    { field: "sprintId", label: "Sprint" },
    { field: "appId", label: "App" },
  ],
}

/** ONE COLLECTION'S FACETS, ready for `<PagedFind facets=…>`: the labels through
 * the reader's own language (R28), the closed vocabularies' labels too, and the
 * row-backed ones filled in from what the screen already holds.
 *
 * `rows` is keyed by the same door parameter, so a screen says
 * `{ appId: appOptions }` and never has to know which position that facet sits
 * in. Its labels are DATA — an account's name, an app's name — and are handed
 * through untranslated, for the reason `translateRecipe` leaves `field.column`
 * alone: a company is not a sentence.
 *
 * A facet with nothing to offer is DROPPED rather than drawn, which is the rule
 * `withDataDrivenCollection` already applies to the bounded lists: an empty
 * dropdown is a control that can only disappoint. */
export function translatedFacets(
  key: string,
  t: (english: string) => string,
  rows: Record<string, FacetOption[]> = {}
): FilterFacet[] {
  const out: FilterFacet[] = []
  for (const facet of COLLECTION_FILTERS[key] ?? []) {
    const options = facet.options
      ? facet.options.map((o) => ({ value: o.value, label: t(o.label) }))
      : (rows[facet.field] ?? [])
    if (options.length === 0) continue
    out.push({ field: facet.field, label: t(facet.label), control: "select", options })
  }
  return out
}
