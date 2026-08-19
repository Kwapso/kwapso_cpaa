// WHERE A DROPDOWN VALUE ACTUALLY LIVES — the map that makes a rename a rename.
//
// THE FAULT THIS EXISTS TO CLOSE. A record stores its dropdown value as the WORD:
// `help.help_type` holds the string `'Request'` on 107 tickets. `selectable_data`
// holds the same word once, with the emoji beside it. Nothing joins them but the
// spelling.
//
// So HALF of "change it once, change it everywhere" already worked and half was
// broken, and the halves are easy to mistake for each other:
//
//   • the MARK is a real lookup. It exists only on the dropdown row and is read
//     by the word, so changing an emoji already reached every record instantly.
//   • the WORD is the JOIN KEY. Renaming it moved the dropdown row and left every
//     record behind — 107 tickets still saying "Request" while the vocabulary had
//     moved on to "Ask", their tab gone, their mark gone, and a new tab reading
//     "Ask 0" beside them.
//
// The alternative was to store the dropdown row's ID on every record and look the
// word up. That is the tidier data model and it is not worth what it costs here:
// the word is what the door filters by, what the CSV export carries, what the
// importer matches, and what four MCP tools take as an argument (R19/R22/R27 all
// name `helpType` as a WORD). Every one of those contracts would move to buy a
// user-visible result this map already buys.
//
// WHAT EACH GROUP IS. Three answers, and every group must give one — the check
// beside this file reads the seed and fails on a group that names none, so a new
// vocabulary cannot be added without saying where its words are kept:
//
//   • a `columns` entry — a real vocabulary. The words are stored on records, so
//     a rename REWRITES them, in the same script that renames the row.
//   • `"labels"` — the CODE owns the states (a ticket runs new → resolved as an
//     enum the server validates). The dropdown row supplies only the display word
//     and the mark, which is already a lookup, so a rename reaches every screen
//     with nothing to rewrite.
//   • `"unused"` — the group backs nothing at all. Five of the seventeen do: they
//     are legacy Glide vocabularies whose module never came, plus one retired by
//     a migration. They are recorded rather than deleted so the next person to
//     find them knows they were looked at, and so the check can tell "nothing
//     stores this" from "nobody has written the entry yet".

export type VocabularyHome =
  | { columns: { table: string; column: string }[] }
  | "labels"
  | "unused"

export const VOCABULARY_HOMES: Record<string, VocabularyHome> = {
  /* ---- real vocabularies: the word is stored on records ------------------ */
  "Ticket type": { columns: [{ table: "help", column: "help_type" }] },
  "Story type": { columns: [{ table: "stories", column: "story_type" }] },
  "Sprint type": { columns: [{ table: "sprints", column: "sprint_type" }] },
  "Brand asset category": { columns: [{ table: "brand_assets", column: "category" }] },
  "Deliverable kind": { columns: [{ table: "deliverables", column: "kind" }] },
  // TWO HOMES, which is the reason this is a list rather than one pair: a
  // department names both the team a meeting purpose belongs to and the team a
  // task sits with. A rename that reached one and not the other would be the
  // same bug in miniature, one table along.
  "Department": {
    columns: [
      { table: "meeting_purposes", column: "department" },
      { table: "tasks", column: "department" },
    ],
  },
  "Industry": { columns: [{ table: "accounts", column: "industry" }] },
  "Country": { columns: [{ table: "accounts", column: "country" }] },
  "App stage": { columns: [{ table: "apps", column: "stage" }] },

  /* ---- labels on states the code owns ------------------------------------ */
  // The server validates a ticket against HELP_STATUSES and a story against its
  // own list; these rows carry the WORD a person reads and the mark beside it.
  // Renaming one is already felt everywhere, because nothing stored it.
  "Ticket status": "labels",
  "Story status": "labels",
  // A sprint's state is DERIVED from its dates (`sprintState`), so there is even
  // less to rewrite here than for the two above — nothing stores it at all. The
  // rows carry the word the groups are headed with and the glyph beside it.
  "Sprint status": "labels",

  /* ---- groups that back nothing ------------------------------------------ */
  // Retired with the column it filled (team migration 0042). The migration
  // deactivates its rows; the entry stays so the check can tell a retired group
  // from an undeclared one.
  "Account status": "unused",
  // FOUR LEGACY GLIDE VOCABULARIES WHOSE MODULE NEVER CAME. Each is a list an
  // owner can edit on the Dropdown values screen today, and editing it changes
  // nothing anywhere, which is worse than the list not being there.
  "Company size": "unused",
  "File type": "unused",
  "Learning category": "unused",
  "Marketing channel": "unused",
  "Marketing status": "unused",
}

/** The groups whose words a rename has to rewrite, and where. */
export function storedWordColumns(group: string): { table: string; column: string }[] {
  const home = VOCABULARY_HOMES[group]
  return home && home !== "labels" && home !== "unused" ? home.columns : []
}
