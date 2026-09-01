// WHICH DOORS ONE CONVERSATION USES — the source chips, as data.
//
// THE OWNER'S ASK, 1 Sep 2026: five or six chips above the assistant's input,
// all ON by default, untick to narrow. Control when he wants it, and a
// diagnostic when an answer smells wrong — re-ask with one chip on and see which
// door lied.
//
// AND THE HONEST LIMIT, said here because it belongs beside the feature rather
// than in a message nobody keeps: THE CHIPS ARE A STEERING WHEEL, NOT CURATION.
// They narrow WHICH DOORS a conversation reads from. They cannot stop a junk
// source outranking a real one inside a ticked door — that is what the fold
// (`knowledge-google.ts`'s FOLD_TO_THE_APP_S_OWN_RECORD) is for. Both matter and
// they are different layers.
//
// ONE DEFINITION, TWO SIDES. The screen draws these, the retrieval door narrows
// by them, and the machine surfaces expose the same word — so the grouping lives
// here, in `shared/`, and not in any of the three. The kinds are STRINGS rather
// than an import of `KNOWLEDGE_KINDS`: that list belongs to the content worker
// and `shared/` may not depend on a worker. The two are held together by a check
// instead (`workers/content/test/knowledge-coverage.test.ts`), which asserts
// every kind the sweep writes sits in EXACTLY ONE chip — so a kind added
// tomorrow cannot be silently unreachable from the screen, and cannot be
// reachable from two chips that disagree.
//
// NO LABELS HERE. A chip's words are the caller's, translated at the point they
// are drawn (R28/R33) — a sentence in `shared/` that no front door said would be
// an orphan in the catalogue.

/** One chip: the key that travels on the wire, and the kinds it covers. */
export type SourceChip = { key: string; kinds: readonly string[] }

/** THE CHIPS, IN THE ORDER THEY ARE DRAWN. Grouped by where a person believes
 * the material CAME FROM, which is not the same axis as `KNOWLEDGE_KINDS` — a
 * reader thinks "my mail" and "the app", not "email" and "ticket, account, app,
 * story, sprint, process, contact, todo, task". Four of the six are one Google
 * service each, because that IS how a person names them. */
export const SOURCE_CHIPS: readonly SourceChip[] = [
  // A conversation we had — the meeting we own AND the calendar entry it came
  // from, because a person untick ing "Meetings" means both.
  { key: "meetings", kinds: ["meeting", "event"] },
  { key: "mail", kinds: ["email"] },
  { key: "drive", kinds: ["document"] },
  { key: "chat", kinds: ["message"] },
  // WHAT THE APP ITSELF HOLDS. Every kind that mirrors a row of this database —
  // a ticket, a client, a piece of work, a colleague. One chip rather than nine,
  // because "the app's own records" is one idea to the person reading it and
  // nine switches would be a permission matrix, not a steering wheel.
  {
    key: "records",
    kinds: [
      "ticket",
      "account",
      "app",
      "story",
      "sprint",
      "process",
      "contact",
      "todo",
      "task",
      "person",
      "dropdown",
      "portal_login",
    ],
  },
  // WHAT SOMEBODY WROTE OR UPLOADED ON PURPOSE — a note typed into the knowledge
  // base, a file added to it, and the articles that outlived the Learning module.
  { key: "articles", kinds: ["note", "file", "article"] },
] as const

/** Every chip key, for a schema's allow-list and for the screen's default. */
export const SOURCE_CHIP_KEYS: readonly string[] = SOURCE_CHIPS.map((c) => c.key)

/** THE KINDS A SET OF CHIPS COVERS — and the ONE place "no chips named" is
 * decided.
 *
 * An empty or absent list means EVERY kind, never none. That is not a
 * convenience: the chips are all on by default, so "nothing named" is what a
 * caller who has never touched them sends, and reading it as "search nothing"
 * would turn the default state into a base that answers no questions. A caller
 * who really wants one door names one door.
 *
 * An unknown key contributes nothing rather than throwing — the door validates
 * the input at the boundary (R20) and this is the shaping step behind it. */
export function kindsForChips(keys: readonly string[] | null | undefined): string[] | null {
  if (!keys || keys.length === 0) return null
  const wanted = new Set(keys)
  const kinds = SOURCE_CHIPS.filter((c) => wanted.has(c.key)).flatMap((c) => [...c.kinds])
  return kinds.length ? [...new Set(kinds)] : null
}
