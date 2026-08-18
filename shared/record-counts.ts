// WHAT HANGS OFF ONE RECORD — the one registry behind every tab badge that is
// NOT the record's own read.
//
// THE BUG THIS EXISTS FOR. A record's collection tabs were badged from a sidecar
// cache key (`total:<prefix>:<recordId>`) that only the tab PANEL's own list
// fetch ever primed. `useCachedValue` is a pure cache read — it never fetches —
// so until you clicked the tab the sidecar was empty, `formatCount` rendered
// nothing, and an unopened tab looked exactly like an empty one. The owner's
// sentence: "until I don't click on the tab, I am always assuming that there is
// no information in that tab because there's no badge count." Contacts was the
// control case that proved it: its total rides the record's own read, so it was
// there on arrival while Apps, Sprints and To-dos beside it were blank.
//
// THE FIX IS HIS: fetch the COUNTS eagerly, keep the ROWS lazy. This registry is
// the counts half — one bounded door per worker returning every child total for
// one record in one round trip, primed into THE SAME sidecar keys the badges
// already read, so the badge code barely changes and no second counting path
// exists for R16 to have to arbitrate.
//
// IT IS SHARED BECAUSE THREE SURFACES HAVE TO AGREE ABOUT THE SAME LIST:
//
//   • the DOORS (workers/tenancy + workers/content) decide which figures they
//     owe and which module's read right each one costs (R18: a cross-module read
//     carries the CALLER'S rights, section by section — never one right standing
//     in for five);
//   • the SCREEN decides which doors to ask and where to park each answer;
//   • the LIVE layer decides which pings move which record's counts (R15) — a
//     count that never invalidates is worse than a blank one, because a blank
//     badge looks unloaded and a stale badge looks right.
//
// Three hand-written copies of one list is how two of them come to disagree, and
// R8's whole sentence is that a badge's collection is DERIVED rather than
// hand-listed. So it is written once, here, and every surface reads it.
//
// NOTHING HERE COUNTS ANYTHING. `key` names the sidecar and `module` names the
// gate; the arithmetic stays in the module's own existing `count*` function, so
// "12 sprints" on the tab and "12" in the list can never be two expressions that
// happen to agree.

/** One collection hanging off one record.
 *
 * `key` is the `totalKey()` PREFIX its badge reads — the same string the tab
 * panel's own fetch primes when you eventually open it, which is what makes the
 * eager count and the lazy rows land in one place instead of two.
 *
 * `module` is the read right this figure costs, and it is per-COLLECTION rather
 * than per-door on purpose (R18). Gating a whole record's counts on one module
 * would either hand somebody a number they may not see or hide one they may:
 * gate an app's counts on `work` and a support manager loses the ticket badge;
 * gate them on `help` and a delivery lead loses the sprint one.
 *
 * `resource` is the live-channel resource whose pings move this figure (R15).
 *
 * `door` is the worker that owns the counting function. It is a fact about the
 * CODE, not about the data — every team's rows live in one database — and it is
 * here because a domain worker binds only AUTH and REALTIME, so neither can
 * answer for the other's modules without a second implementation of its counts. */
export type RecordChild = {
  key: string
  module: string
  resource: string
  door: "tenancy" | "content"
}

/** THE RECORDS WITH CHILD COLLECTIONS, keyed by the TABLE their screen is about
 * — the same word the activity feed and the live registry already use for a
 * record, so a caller naming a record names it once.
 *
 * `accounts` carries the union of what a COMPANY's screen shows (apps, sprints,
 * to-dos, the rate card) and what a PERSON's shows (to-dos, tickets, meetings):
 * one table underneath, two screens on top (account-detail.tsx hands an
 * individual to contact-detail.tsx), and one key for one table is what keeps
 * this a registry rather than a list of screens. The union is not the waste it
 * looks like — the door skips any collection whose module the caller cannot
 * read, so a developer without `help:read` never pays for the ticket count.
 *
 * A record whose every badge already rides its own read is deliberately ABSENT:
 * a role, a source, a meeting, a task (activity only, and the activity total
 * comes back with the feed); a process map (its steps, versions and conversation
 * all ride the record's own door); a story (its Time tab fetches at the top of
 * the screen because the header timer needs it anyway). Adding them here would
 * buy a round trip and change no badge. */
export const RECORD_CHILDREN: Record<string, RecordChild[]> = {
  accounts: [
    // The systems we have built them. An app belongs to ONE account, always.
    { key: "apps-account", module: "processes", resource: "apps", door: "tenancy" },
    // What we have SOLD them, and what we are waiting on them for.
    { key: "sprints-account", module: "work", resource: "sprints", door: "content" },
    { key: "todos-account", module: "todos", resource: "todos", door: "content" },
    // A PERSON's three. `tickets-account` and `meetings-account` are read on the
    // contact screen; a company's screen never draws them, and priming a sidecar
    // nobody reads costs one number in a payload.
    { key: "tickets-account", module: "help", resource: "help", door: "content" },
    { key: "meetings-account", module: "meetings", resource: "meetings", door: "content" },
    // WHAT WE CHARGE THEM. Already primed by this screen's own rate read (the
    // Overview needs the headline rate to price the hours), so this entry
    // changes no badge on a warm screen — it is here so the registry is the
    // WHOLE answer to "what hangs off an account" and the check over it needs no
    // exception list. The alternative was one reasoned exemption for one number,
    // which is more prose than the count costs.
    { key: "account-rates", module: "commercials", resource: "account_rates", door: "tenancy" },
  ],
  apps: [
    { key: "sprints-app", module: "work", resource: "sprints", door: "content" },
    { key: "stories-app", module: "work", resource: "stories", door: "content" },
    { key: "processes-app", module: "processes", resource: "processes", door: "tenancy" },
    { key: "meetings-app", module: "meetings", resource: "meetings", door: "content" },
    { key: "tickets-app", module: "help", resource: "help", door: "content" },
  ],
  help: [
    // The work answering this request. One story may answer many tickets and one
    // ticket may need many stories, so it is a collection on the record.
    { key: "stories-ticket", module: "work", resource: "stories", door: "content" },
    // The files and links on it. Same module as the ticket itself — an
    // attachment is part of the request, not a thing of its own.
    { key: "help-attachments", module: "help", resource: "help", door: "content" },
  ],
  sprints: [{ key: "stories-sprint", module: "work", resource: "stories", door: "content" }],
}

/** Which collections one worker owes for one record — the door's own slice of
 * the registry. A door answers about its own modules and stays silent about the
 * other's, and the screen merges the two answers into one set of sidecars. */
export function childrenFor(table: string, door: RecordChild["door"]): RecordChild[] {
  return (RECORD_CHILDREN[table] ?? []).filter((c) => c.door === door)
}

/** Every record kind this registry knows — the allow-list the doors hold the
 * `table` parameter to (R20: a query field must sit inside a checker, and an
 * `.includes` over a derived set is one). */
export const COUNTED_RECORD_TABLES = Object.keys(RECORD_CHILDREN)

/** What either door answers with: one figure per collection it owes.
 *
 * THREE STATES, AND ALL THREE STAY APART even though two of them render the
 * same. `formatCount` shows nothing for a zero AND nothing for a missing number,
 * which is exactly the ambiguity that made an unclicked tab read as empty — so
 * the distinction has to survive in the DATA whatever the badge does with it:
 *
 *   • a NUMBER — counted, and this is how many there are (`0` included: there
 *     are none, and we know it);
 *   • `null` — the caller's role does not hold that collection's read right, so
 *     nobody counted. "You may not look" is not "there are none" (R18);
 *   • ABSENT from this map, and absent from the sidecar cache — not counted yet.
 *     The state today's bug consists of, and the only one that ever resolves. */
export type RecordCounts = { counts: Record<string, number | null> }
