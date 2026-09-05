// WHAT KIND OF THING HAPPENED — the activity row's verb, as a closed set.
//
// THE PROBLEM. `activity.type` is a human sentence fragment: "Account archived",
// "Ticket raised", "Dropdown value no longer a default". Read by a person that is
// exactly right, and it is what the feed shows. Read by a QUERY it is 157
// distinct free-text literals across 139 call sites, no two modules agreeing on
// a word — so "show me every archive last quarter" is a LIKE over prose, and the
// answer silently misses `retired`, `withdrawn`, `taken down`, `switched off`
// and `binned`, every one of which is the same event wearing a different coat.
//
// So the row carries BOTH: `type` keeps the sentence, and `verb` says which of
// eight things it was. The prose is what a person reads; the verb is what a
// filter can stand on.
//
// DERIVED, NOT DECLARED AT THE CALL SITE. `activityVerb` reads the sentence the
// caller already writes, so none of the 139 sites changed and none can forget —
// which is the same argument `core` on the data-door config won, and for the
// same reason: a new argument on 139 call sites in five workers is the shape
// that ends with half of them never passing it, and half a vocabulary is worse
// than none because it looks complete.
//
// AND IT CANNOT ROT. `workers/tenancy/test/activity-trail.test.ts` reads every `type:`
// expression in the codebase off disk, composes the strings each one can
// actually produce, and asserts every single one classifies — no `other`, no
// guessing. A new module whose sentence this file cannot read turns the build
// red at the moment it is written, rather than shipping a row nothing can find.
// The two tables below are rot-checked the other way too: a word or a phrase
// nothing says any more is a failure, so the vocabulary can only ever describe
// what the app really says.

/** THE EIGHT. Not a taxonomy of the app's features — a taxonomy of what happens
 * to a RECORD, which is the question the trail exists to answer.
 *
 * `other` is the honest floor, exactly as `unknown` is for the origin: it is
 * what a sentence this file cannot read resolves to, so a mislabelled row is
 * never quietly filed under a verb it is not. The census makes it unreachable
 * for every sentence the code contains today, so a row that carries it is news. */
export const ACTIVITY_VERBS = [
  /** The record began: created, raised, sent, imported, linked, connected. */
  "created",
  /** Its content changed: edited, renamed, moved, re-set, re-shared. */
  "edited",
  /** It moved along its own lifecycle: in progress, ready, resolved, done. */
  "status",
  /** It was taken out of use, reversibly: archived, retired, revoked, withdrawn. */
  "archived",
  /** It was put back: restored, reactivated, reinstated, reopened. */
  "restored",
  /** The row is gone. The app does this in exactly one place, on purpose. */
  "deleted",
  /** Somebody READ something the trail records the reading of. */
  "viewed",
  /** A sentence this file could not read. Unreachable for today's vocabulary. */
  "other",
] as const

export type ActivityVerb = (typeof ACTIVITY_VERBS)[number]

/** THE LAST WORD DECIDES, and this is the vocabulary of last words the app
 * actually uses. Keyed on the final word of the sentence, lower-cased.
 *
 * Chosen over a per-sentence table because the app names things in a consistent
 * shape — "<what> <verb>" — so the last word is where the event lives, and a map
 * of 60 words covers 157 sentences and every sentence written next week. Where
 * that is not true, the phrase table below overrules it. */
export const VERB_BY_LAST_WORD: Record<string, ActivityVerb> = {
  // ── created ───────────────────────────────────────────────────────────────
  created: "created",
  added: "created",
  raised: "created",
  recorded: "created",
  sent: "created",
  arranged: "created",
  cut: "created",
  imported: "created",
  joined: "created",
  granted: "created",
  connected: "created",
  linked: "created",
  proposed: "created",
  // The Google lane, where the app acts inside somebody else's system and the
  // row here is the ONLY record in this product that it happened. Naming a
  // folder, writing a file, filing a mail, posting in a space — each brings
  // something into being on one side or the other.
  shared: "created",
  named: "created",
  written: "created",
  made: "created",
  filed: "created",
  posted: "created",
  // ── edited ────────────────────────────────────────────────────────────────
  edited: "edited",
  updated: "edited",
  changed: "edited",
  set: "edited",
  moved: "edited",
  configured: "edited",
  renamed: "edited",
  replaced: "edited",
  reordered: "edited",
  narrowed: "edited",
  staffed: "edited",
  rewritten: "edited",
  labelled: "edited",
  // ── status ────────────────────────────────────────────────────────────────
  done: "status",
  completed: "status",
  resolved: "status",
  ready: "status",
  triaged: "status",
  scheduled: "status",
  validated: "status",
  applied: "status",
  // ── archived ──────────────────────────────────────────────────────────────
  archived: "archived",
  deactivated: "archived",
  retired: "archived",
  removed: "archived",
  revoked: "archived",
  withdrawn: "archived",
  disconnected: "archived",
  unlinked: "archived",
  cancelled: "archived",
  discarded: "archived",
  binned: "archived",
  stopped: "archived",
  // ── restored ──────────────────────────────────────────────────────────────
  restored: "restored",
  reactivated: "restored",
  activated: "restored",
  reinstated: "restored",
  reopened: "restored",
  relinked: "restored",
  // ── deleted ───────────────────────────────────────────────────────────────
  deleted: "deleted",
  // ── viewed ────────────────────────────────────────────────────────────────
  read: "viewed",
}

/** WHERE THE LAST WORD LIES, and it is always for the same reason: the sentence
 * ends on a NOUN or a preposition, so the event is somewhere in the middle.
 *
 * Matched on the whole sentence, case-insensitively, and checked BEFORE the word
 * map — a phrase here is a deliberate ruling about one sentence, so it must not
 * be overridable by a coincidence of grammar. Rot-checked: a phrase nothing says
 * any more turns the build red, so this list can only ever shrink or describe
 * something real. */
export const VERB_BY_PHRASE: Record<string, ActivityVerb> = {
  // Ends on a noun. The calendar sweep BRINGS the meetings list up to date —
  // an edit of what is already there, not a birth, even when it creates rows.
  "calendar brought into step": "edited",
  // Ends on a preposition-phrase. Both are the deliverable's visibility to the
  // client changing, which is a property of the record, not its lifecycle.
  "deliverable hidden from the client": "edited",
  "deliverable shared with the client": "edited",
  // Ends on the adverb "back". An unsend: the message existed and no longer
  // does, which is this app's archive shape in somebody else's system.
  "message taken back": "archived",
  // Ends on the noun "default". The mark moves; the value stays in use either
  // way, so neither of these is an archive.
  "dropdown value made a default": "edited",
  "dropdown value no longer a default": "edited",
  // Ends on the adverb "off". A module switched off is out of use and can be
  // switched back on — the archive shape, said in the app's own words.
  "module switched off": "archived",
  // Ends on the noun "role" / the adverb "off". Attaching a person to a client
  // role creates the link; taking them off ends it.
  "person attached to role": "created",
  "person taken off role": "archived",
  // Ends on the adverb "down". A staff profile taken down is out of use.
  "staff profile taken down": "archived",
  // Ends on the adverb "again". The Google share was stopped and is back on.
  "shared again": "restored",
  // Ends on the noun "progress". Both halves of the work engine say it this way.
  "story in progress": "status",
  "ticket in progress": "status",
}

/** WHICH ENTRY DECIDED — the key `activityVerb` actually read the answer out of,
 * or `null` when nothing did.
 *
 * Exported for the rot check, and that is the whole reason it exists as its own
 * function: "is every word in the vocabulary still used?" can only be answered
 * by the same resolution the classifier runs. A check that re-implemented the
 * lookup would be a parser agreeing with itself, and it would go wrong exactly
 * where the classifier is cleverest — four words looked dead the first time this
 * was asked, purely because the check did not know about the preposition strip. */
export function verbLookupKey(type: string): string | null {
  const sentence = type.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase()
  if (VERB_BY_PHRASE[sentence]) return sentence
  const last = (s: string) => s.split(/\s+/).pop() ?? ""
  if (VERB_BY_LAST_WORD[last(sentence)]) return last(sentence)
  // WHERE, WHEN THE SENTENCE SAYS WHERE. The Google lane names the place the act
  // landed — "File written to Drive", "Mail filed in Drive", "Posted in a space"
  // — so the last word is a location and the verb is in front of it. One
  // trailing prepositional phrase is dropped and the sentence is read again.
  // Tried SECOND, never first: most sentences here end on the verb, and a strip
  // applied eagerly would turn "Ticket scheduled for Monday" into "Ticket".
  const trimmed = last(sentence.replace(/\s+(?:in|into|to|from|with|on|at|for)\s+.*$/, ""))
  return VERB_BY_LAST_WORD[trimmed] ? trimmed : null
}

/** THE ONE CLASSIFIER. Give it the sentence a caller wrote; get one of the
 * eight. A trailing parenthetical is stripped first — the bulk ticket move says
 * "Tickets resolved (bulk)", where the count-shaped aside is exactly the kind of
 * thing that will keep being added to the END of a sentence and must never be
 * the word the verb is read off. */
export function activityVerb(type: string): ActivityVerb {
  const key = verbLookupKey(type)
  if (!key) return "other"
  return VERB_BY_PHRASE[key] ?? VERB_BY_LAST_WORD[key]
}
