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
// ── THE SECOND HALF, BUILT 4 SEP 2026 ───────────────────────────────────────
//
// THE OWNER'S ASK WAS TWO THINGS AND ONLY ONE WAS BUILT: "choose which data
// sources it should use OR WHICH TOOLS IT SHOULD CALL". A chip narrowed the
// CORPUS — the indexed copy of a folder or a mailbox, read through
// `ask_knowledge` — and narrowed nothing else. So the owner unticked Gmail,
// asked for the latest message in his primary inbox, and the assistant searched
// his live mail through `google_mail_search` and answered from it. The control
// said one thing and the app did another, which is the one failure a control
// cannot survive: a person who unticks Mail and reads an answer out of their
// mail is right to stop trusting every other switch in the product too.
//
// SO A CHIP ALSO NAMES THE LIVE GOOGLE SERVICES IT SPEAKS FOR, and a service
// whose chip is unticked is REFUSED AT THE DOOR for that turn — not merely left
// out of the prompt. Left out is a hope about what a model does with a
// catalogue; refused is a fact it cannot talk its way past, and it also says WHY
// in words the assistant can repeat ("Gmail is unticked for this
// conversation"), which "the tool was never offered" cannot.
//
// THE WRITE TOOLS FOLLOW THE SAME CHIP. Decided here rather than left to the
// reader: somebody who unticks Gmail does not expect mail SENT on their behalf
// in that conversation, and "it only stopped me READING your mail" is not a
// sentence anybody would accept afterwards. The chip is the only control in
// front of the input box, so it means the service, not the verb. The cost of
// being wrong in this direction is one tick to put it back; the cost in the
// other direction is a message in somebody else's inbox.
//
// AND `query_records` IS STILL NOT NARROWED — see `injectSources` in
// workers/data-ops/src/lib/agent.ts. That is a question about the app's live
// rows with its own permission at its own door, and silently shrinking it would
// make a COUNT WRONG rather than a search narrower. The Google doors are the
// opposite case: they read material a person believes they have just switched
// off.
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

/** One chip: the key that travels on the wire, the KINDS of indexed material it
 * covers, and the LIVE GOOGLE SERVICES it speaks for.
 *
 * Two lists because there are two halves to one idea. `kinds` is the corpus —
 * the sweep's own copy, searched through `ask_knowledge`. `services` is the live
 * door — somebody's actual mailbox, Drive, Chat or calendar, read this second
 * through the Google tools. A person who unticks "Gmail" means both, and before
 * 4 Sep 2026 it meant only the first.
 *
 * `services` are STRINGS for the same reason `kinds` are: this file may not
 * import a worker's list, and the two are held together by a check instead
 * (`workers/data-ops/test/source-chip-gate.test.ts`), which asserts the chips
 * name EXACTLY the four services `GOOGLE_SERVICES` declares — so a fifth service
 * cannot arrive ungated. */
export type SourceChip = { key: string; kinds: readonly string[]; services: readonly string[] }

/** THE CHIPS, IN THE ORDER THEY ARE DRAWN. Grouped by where a person believes
 * the material CAME FROM, which is not the same axis as `KNOWLEDGE_KINDS` — a
 * reader thinks "my mail" and "the app", not "email" and "ticket, account, app,
 * story, sprint, process, contact, todo, task". Four of the six are one Google
 * service each, because that IS how a person names them. */
export const SOURCE_CHIPS: readonly SourceChip[] = [
  // A conversation we had — the meeting we own AND the calendar entry it came
  // from, because a person untick ing "Meetings" means both.
  // …AND THE CALENDAR ITSELF is the live door behind it. Unticking "Meetings"
  // stops the assistant reading somebody's calendar and the transcript of a call
  // that sits in it, which is what a person means by the word.
  { key: "meetings", kinds: ["meeting", "event"], services: ["calendar"] },
  { key: "mail", kinds: ["email"], services: ["gmail"] },
  { key: "drive", kinds: ["document"], services: ["drive"] },
  { key: "chat", kinds: ["message"], services: ["chat"] },
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
    // No live Google door: the app's own rows are read through `query_records`,
    // which a chip deliberately does not narrow (see the essay above).
    services: [],
  },
  // WHAT SOMEBODY WROTE OR UPLOADED ON PURPOSE — a note typed into the knowledge
  // base, a file added to it, and the articles that outlived the Learning module.
  // Somebody typed or uploaded these INTO the base; there is no live service
  // behind them to switch off.
  { key: "articles", kinds: ["note", "file", "article"], services: [] },
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

/* ── THE LIVE HALF: which Google doors a set of chips leaves open ──────────── */

/** Every Google service some chip speaks for, read off the chips themselves so
 * there is no second list to keep in step. Held to `GOOGLE_SERVICES` by
 * `workers/data-ops/test/source-chip-gate.test.ts`. */
export const CHIP_SERVICES: readonly string[] = [
  ...new Set(SOURCE_CHIPS.flatMap((c) => [...c.services])),
]

/** THE SERVICE ONE GOOGLE DOOR SPEAKS TO, off the DOOR'S OWN PATH.
 *
 * Every Google door in the content worker is `/api/content/google/<service>/…`,
 * so the service is a fact about the path rather than a list somebody keeps —
 * the same reasoning R19/R22 use when they read a door's own source instead of
 * trusting a table beside it. A segment no chip claims (`connections`) returns
 * null and is not narrowed by anything; the check names the ones allowed to do
 * that and turns red on a new one, so a fifth service cannot slip through as
 * "unclaimed".
 *
 * IT IS NOT THE WHOLE TRUTH FOR EVERY DOOR — one of them reads a second
 * service's material and files it under this one (`google_mail_to_drive`). That
 * is what `alsoReads` on the tool is for, and the check derives it from the
 * handler's own `accessTokenFor` calls rather than believing the tool. */
export function googleServiceOfPath(path: string): string | null {
  const prefix = "/api/content/google/"
  if (!path.startsWith(prefix)) return null
  const segment = path.slice(prefix.length).split("/")[0]
  return CHIP_SERVICES.includes(segment) ? segment : null
}

/** THE LIVE SERVICES A SET OF CHIPS LEAVES OPEN — and, exactly as
 * `kindsForChips` does it, null means EVERY service rather than none.
 *
 * The same sentence for the same reason: the chips are all on by default, so
 * "nothing named" is what a caller who has never touched them sends, and reading
 * it as "no service" would switch every Google door off for everybody who never
 * pressed anything. */
export function servicesForChips(keys: readonly string[] | null | undefined): string[] | null {
  if (!keys || keys.length === 0) return null
  const wanted = new Set(keys)
  const named = SOURCE_CHIPS.filter((c) => wanted.has(c.key))
  // A list of keys nobody declared is not a narrowing — same shape as
  // `kindsForChips`, and the reason is the same: a typo must not switch the
  // Google doors off.
  return named.length ? [...new Set(named.flatMap((c) => [...c.services]))] : null
}

/** WHICH CHIP A PERSON MUST TICK TO GET THIS SERVICE BACK. Null for a service no
 * chip speaks for, which cannot happen while the check is green. */
export function chipForService(service: string): string | null {
  return SOURCE_CHIPS.find((c) => c.services.includes(service))?.key ?? null
}
