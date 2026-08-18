# Search & filters, the ruleset (DESIGNED 2026-06-18)

How Brimba (and every app on this base) searches and filters records across
collections. Glide configured this at the component level and searched "anything
shown on the detail screen"; we keep that feel but make it **layered** so it
stays cheap for small lists and scales to large record counts. Search/filter is
**declared in the screen recipe** (per the [screen engine](SCREEN-ENGINE-PLAN.md));
the engine picks the right layer automatically.

## The split (who owns what)

- **Library** owns the *presentation + pure logic*: the search box, the filter
  UI, and the in-memory filter/search math, all wired into the existing
  config-driven collection system (`CollectionConfig` + `selectRows`). It exposes
  a **server-side seam** (`serverSide` + `onQueryChange`) but never queries a
  database itself. (The exact library build is tracked in [UI-GAPS.md](UI-GAPS.md)
  #7; the ready-to-paste prompt for the library session lives with that work.)
- **App / workers** own the *data*: which fields are searchable/filterable per
  recipe, the query endpoints (`?q=` + filter params), and the per-team
  **FTS5** index for record-level "search anything."

> **Scope. Read this before you conclude the app has no full-text search.** This
> document owns **record search**: finding rows in a collection you are looking at.
> It does **not** own the **knowledge base**, which is a different question
> (*"what do we know about X?"*, answered from passages, with citations) and a
> different mechanism (§ *The fourth layer*, below). Both are search; only one of
> them is what a search box over a list does.

## The three layers

A collection picks exactly one based on its expected size (declared in the recipe).

### Layer 1, client-side (small, bounded lists) · the default today
The list is already fetched and cached ([CACHING.md](CACHING.md) `useCached`), so
search + filters run **in memory** over that array, instant, zero new requests.
Right for members, roles, invites, dropdown values: lists that are bounded per
team. This is `selectRows` (limit → filter + facets → search → sort → paginate)
running in the browser. No worker work at all.

### Layer 2, server-side query (growing lists) · every PAGED collection
When a list can outgrow "fetch it all", in practice, every collection in
`GROWING_COLLECTIONS` (Law **R14**), the search box and the filters are answered
by the **door**, not by the browser. The reason is the one R14 already gives about
paging: the client holds page one, so filtering it in memory answers "among the
newest fifty" while the exact count above (R16) still says 3,677. Two numbers,
both true, neither about what was asked. Reported from staging, in a manager's
words, as *"it only searches on loaded screen"*.

The host owns this, in **one** component, `web/components/paged-find.tsx`:

- the recipe turns the frame's own search box OFF (`listCollection(…, { paged: true })`
  sets `searchable: false`), so a paged screen has exactly one box and it is the
  honest one;
- what is typed (debounced by the library `SearchInput`) and picked (the library
  `FilterBar`) becomes the door's own query parameters, `?q=` plus that door's
  filters;
- the matches land in a cache key of their **own** (`find:<listKey>:<question>`),
  with their own cursor sidecar, so `<LoadMore>` pages the SEARCH rather than the
  list underneath it, and clearing the box leaves the unfiltered list exactly as
  it was;
- the exact server total **of that question** renders through `formatSearchTotal`
 , the one seam in the app allowed to end in a "+", beside the collection's own
  R16 badge, which never moves. A collection total and a filtered total are two
  different numbers, and the screen now says both, each labelled.

Every door's count is taken over the same `WHERE` as its rows, so the filtered
total can never be a number the list cannot reach.

The check that keeps it true is `web/test/paged-search.test.ts`: for every growing
collection with a list screen, its door parses `q`, its recipe leaves the frame's
box off, and a `<PagedFind>` is wired to that collection's own cache key.

> The library's `CollectionFrame` has a `serverSide` + `onQueryChange` seam of its
> own, which would be the neater home for this, but `ScreenRenderer` does not pass
> it through, and the library is not edited from this repo (UI-GAPS #15).

### Layer 3, full-text "search anything" (FTS5)
For record modules where Glide-style "match anything on the detail screen" is
wanted (tickets, imported datasets), each per-team database gets a
**SQLite FTS5** virtual table mirroring the record table's text columns. The
worker queries it with `MATCH` and returns ranked hits. This is what makes search
span *all* of a record's fields, not just a column, at scale.

## FTS5 design (per-team, per record module)

D1 *is* SQLite, so FTS5 lives **inside each team's own database**, isolation by
physics, same as every other per-team table ([ARCHITECTURE.md](ARCHITECTURE.md) §1).
Pattern, added by the module's team-schema migration when that module is built:

```sql
-- one virtual table per searchable record table (e.g. help, the tickets table)
CREATE VIRTUAL TABLE help_fts USING fts5(
  description, help_type, status,        -- the text fields shown on the detail
  content='help', content_rowid='rowid'
);
-- triggers keep it in lock-step with the base table (no app code to forget)
CREATE TRIGGER help_ai AFTER INSERT ON help BEGIN
  INSERT INTO help_fts(rowid, description, help_type, status)
  VALUES (new.rowid, new.description, new.help_type, new.status);
END;
CREATE TRIGGER help_ad AFTER DELETE ON help BEGIN
  INSERT INTO help_fts(help_fts, rowid, description, help_type, status)
  VALUES('delete', old.rowid, old.description, old.help_type, old.status);
END;
CREATE TRIGGER help_au AFTER UPDATE ON help BEGIN
  INSERT INTO help_fts(help_fts, rowid, ...) VALUES('delete', old.rowid, ...);
  INSERT INTO help_fts(rowid, ...) VALUES (new.rowid, ...);
END;
```

Query path (in the module's worker): `SELECT h.* FROM help_fts f JOIN help h
ON h.rowid = f.rowid WHERE help_fts MATCH ? ORDER BY rank LIMIT ?`, then the
**same permission gate** as every read runs first (a viewer with no
right gets nothing back; FTS never bypasses [permissions](ARCHITECTURE.md) §3),
and the account fence narrows it further for a client login. Archived rows are
filtered in the JOIN, never hard-deleted ([records rule](ARCHITECTURE.md) §4).
Note the missing `OFFSET`: tickets are a `GROWING_COLLECTIONS` member, so an
FTS read pages by key like every other read of them (Law **R14**), the ranked
hits are ordered and cursored, never skipped over.

Rules for FTS5 here:
- **One virtual table per searchable record table**, created by that module's
  team-schema migration and rolled to every team via `migrate-teams` (the locked
  maintenance path). New module = new migration, never a change to others.
- **Triggers keep it in sync**. Never write the FTS table from app code, so it
  can't drift from the base rows.
- **Mirror only the text fields the detail screen shows** (Glide parity), not ids
  or audit columns.
- The same FTS table sits behind the splitter read-path (`d1QueryAcross`) if a
  module is ever moved to its own database.

## How the recipe declares it (the one knob)

Each field in a screen recipe carries `searchable` / `filterable`; the collection
declares `searchPlaceholder`, `userFilter`, `filterFacets`, and a size hint that
maps to a layer (`serverSide` off = Layer 1; on = Layer 2; a `fullText` flag =
Layer 3). The engine wires `searchable` fields → the library `searchKeys`,
`filterable` fields → filter facets, and chooses client vs server by the hint,
so turning on search for a new screen is a recipe edit, not new plumbing.

## The fourth layer, the knowledge base (BUILT 2026-08-11, retrieval rebuilt 2026-08-12)

Layers 1–3 answer *"which rows match these words?"*. The knowledge base answers
*"what do we know about this?"*, and because the answer is prose rather than a row,
it is built and governed completely differently. It is **not** a fourth setting on a
recipe and no collection opts into it; it is its own subsystem in the content
worker, reached at `GET /api/content/knowledge/ask`, in the app's Knowledge base
screen, and through `ask_knowledge` on the machine surface.

Three things about it belong here, so that a reader who came to this file looking
for "how does search work" leaves knowing it exists:

- **It does not use FTS5, and that is deliberate**, which is why Layer 3 below
  being unbuilt is not a contradiction. Its word index is `knowledge_terms`, an
  ORDINARY indexed table, because the operation that matters is the DELETE: a
  re-index removes one source's postings, which on FTS5 is a scan of every posting
  in the team and here is one keyed delete. It also behaves identically in the test
  harness and in D1, which a virtual table kept in step by triggers does not.
- **The ranking half is vectors, not words**, one account-wide Cloudflare Vectorize
  index, every team in its own NAMESPACE. Law **R26** is both halves of why that is
  safe: a namespace is a PARTITION Vectorize applies *before* the search (not a
  filter somebody wrote correctly today), and nothing readable comes out of the index
  at all, it is asked for ids and scores only, and every passage in every answer is
  read back out of the team's own database under the caller's own fence. **The vector
  store narrows; the database decides.**
- **An answer carries its sources or it is not an answer** (Law **R23**). Retrieval
  never writes prose: it hands back the passages, the sources they came from, the
  compartment it searched and the reasoning that chose it, and when it finds nothing
  it says so, with a sentence for the assistant to repeat instead of inventing one.
- **The answer is now WRITTEN, and written from exactly those passages** (2026-08-18).
  Retrieval still generates nothing. `?compose=1` asks the door for one cheap model
  call that composes the reply *with the decided passages and citations in front of
  it* and hands the prose back to the same seam, which lets it exist only where
  `found` is true — so a written answer can never outlive its sources. It may carry
  the app's visual blocks (`shared/agent-blocks.ts`), and the model decides when a
  picture helps: there is no switch on the screen. It costs one unit of the team's
  AI allowance and gates on the `agent` module, so retrieval stays free for anyone
  who only wants the material. `workers/content/src/lib/knowledge-compose.ts`.

DATA-MODEL.md § *THE KNOWLEDGE BASE* is the owning reference (the four tables, the
compartment model, the two fences); BOOTSTRAP.md §3b is how you stand the index up.

## The third question: SORTING (BUILT 2026-08-18)

A collection is asked three things — **which rows** (the filters), **which of
those** (the search), and **in what order**. This document has always owned the
first two. The third had no layer, no seam and, in most of the app, no control at
all, and the reason it went unnoticed for so long is worth stating: sorting looks
like a presentation detail until you notice it is answered in exactly the same
place a search is, and can be wrong in exactly the same way.

**The rule is the same sentence as Layer 2's.** A **bounded** collection is
entirely in the browser, so ordering it there is honest and free (Layer 1). A
**paged** one is not: the browser holds page one, so a sort applied there arranges
fifty of 254 rows and calls the result sorted — the same lie the search box told,
one control along. **A sort on a paged collection is a question for the DOOR.**

- The door's half is `shared/workers/sorting.ts`: a caller sends a NAME
  (`sort=deadline`), the door looks it up in a `SortMenu` declared in our own
  source, and no request text ever reaches a statement. Each menu entry pairs its
  SQL expression with the field that mirrors it off a row, because a keyset page
  is three things that must agree — the `ORDER BY`, the "everything after this
  row" predicate, and the value the next cursor is minted from — and written
  apart they drift into a page two that starts somewhere page one did not stop.
- The screen's half is `web/lib/collection-sorts.ts` (the names and the words a
  person reads) and `<PagedFind>`, which carries the sort beside the search box
  and the filters because they are three halves of one question.
- **Changing the sort resets to page one, structurally.** A different order is a
  different question, so it lands in a different cache key with its own cursor
  sidecar — nothing remembers to reset, because there is nothing to reset. The
  belt under that brace: every cursor carries the ordering it was minted inside
  (`<name>:<dir>`), and a door hands back the ordinary `invalid_cursor` 400 for
  one minted under a different one. A stale cursor does not fail loudly on its
  own — it silently skips an arbitrary slice and returns a page that reads like
  an answer, which is worse than an error.
- **The default order is never sent.** A screen nobody has touched asks the door
  nothing, reads the collection's own cache key and looks exactly as it did
  before this existed.

`workers/content/test/paged-sort.test.ts` proves the behaviour end to end against
a real database — sixty tickets, page size fifty, and the row that has to arrive
at the top is the one ten rows past the cursor — and `web/test/paged-sort.test.ts`
proves the wiring: the screen's option names are read against each door's own
menu, every paged list screen has the control, no sort name reaches a statement
unvalidated (R20), and no menu names a number R24 keeps off the client's side.

### The census (derived 2026-08-18, from the code)

**Every collection either front door renders**, with what it can be ordered by
and where that ordering is decided.

| Where | What is drawn | Order decided by |
| --- | --- | --- |
| **Six paged list screens** — accounts, tickets, the knowledge base, process maps, the backlog, the diary | recipe → `CollectionFrame` (+ a table on the diary's *All*) | **the DOOR**, `<PagedFind sorts=…>` · five to six named orders each |
| **Eight bounded list recipes** — members, roles, invites, sprints, apps, tasks, the brand library, meeting purposes | recipe → `CollectionFrame` | **the browser**, honestly: the whole collection is loaded. Options are DERIVED from the recipe's own first field + surviving facets (`frameSortOptions`), so a new column brings its own sort and a list with one sortable column gets no control at all |
| **The two tables** — Tasks (all views but Calendar), the diary's *All* | recipe `display:"table"` → the host's `RecordTable` (`web/components/record-table.tsx`) | by **clicking a column header**, and *which side* decides follows the same split as the search box: Tasks is BOUNDED so the browser orders all of it; the diary PAGES so a header asks the DOOR, through the same `found.order` handle the picker above the table holds. A header REPLACES the door's default order (asc → desc → back to it). Two of the diary's six columns (App, Where) have no name in `MEETING_SORTS`, so they draw a plain header rather than a control that cannot work. **Corrected 2026-08-18** — see below |
| **Three calendars** — sprints, tasks, the diary | `CalendarView` | **not sortable, and must not be**: a month grid is ordered by the calendar |
| **Activity feeds** (every record's Activity tab, the team feed, account activity, assistant usage) | `ActivityFeed` | **not sortable**: a chronological history whose order IS its meaning. The profile screen's own feed runs oldest-first deliberately |
| **Conversations** — a ticket's thread, a process's comments, the assistant's chat | `TicketThread` / `Comments` / `AgentChat` | **not sortable**: reordering a conversation destroys it |
| **Ordered things** — a process's steps and versions, an import plan's steps, the assistant's run steps and numbered flows, knowledge passages + citations, the ticket-stage bars | bespoke | **not sortable**: the sequence is the content. A process's step order IS the process; an import's table order is a dependency order; the stage bars are the lifecycle's order and never the tally's, so they stay readable week to week |
| **The triage queue** | bespoke list | **not sortable**: it is a queue, ordered by who has waited longest, which is the only order that answers the question it exists for |
| **~30 record panels** — a company's contacts and logins, a story's time, an app's sprints/maps/meetings/tickets, attachments, stakeholders, rate cards, certificates, tokens, Google sources | bespoke `<ul>` rows | **no control**, deliberately for now: each is a short, bounded list inside one record where a person is reading rather than comparing. The ones that PAGE (a story's work logs, an app's tickets and meetings, an account's stories and maps) would need the door treatment, and are named in UI-GAPS #23 rather than left silent |
| **The whole client portal** — tickets, to-dos, sprints, contacts, the value screen's apps/maps/steps, attachments, the thread | all hand-composed; the portal has **no recipe engine** | **no control**, and only one of them wants it: the tickets list. Named in UI-GAPS #23 |

### The correction: the table headers were not sorting at all (2026-08-18, same day)

The census row above originally read "the browser, by clicking a column header",
and the section under it measured which COLUMNS compared wrongly. Both were
written on an assumption nobody had put a finger on, and it was false: **on both
tables a column header sorted nothing whatsoever.** Reported within hours, on the
deployed build, with a screenshot of Tasks → *List* in the door's own order under
a lit Deadline arrow.

The mechanism is one line of the library, and it is worth stating precisely
because the shape recurs. `DataTable` keeps the header's choice in its own state
and hands it to `CollectionFrame` as a config prop; the frame seeds its sort from
that prop ONCE, at mount (`React.useState(config.sortBy)`), and orders by its own
state ever after. So the header wrote to a value nobody read — while the ARROW,
which is the header's own state, moved exactly as it should. A control that looks
like it is working and is not is the failure mode this whole section is about,
committed one layer below where it was being looked for.

Three things follow, and they are the reason this correction is longer than the
row it fixes:

- **The fix in the row above is the host owning the header** (`RecordTable`), on
  the same bounded-vs-paged line SEARCH.md already draws for the search box. The
  library's half is UI-GAPS #22(b).
- **The measurements below stand, and until today none of them could be SEEN.**
  `formatDateSortable` was a correct fix, with a passing test, to a comparison
  that was never reached. That is not an argument against having made it; it is
  an argument about what its test proved.
- **What "verified" has to mean here.** Every check the lane wrote asked whether
  the pieces were present and consistent — the screen's option names against the
  door's menu, the recipe's control, the comparator's output. None asked whether
  the rows on a rendered screen move when somebody presses the thing. That
  question now has its own file, `web/test/table-header-sorts.test.tsx`, and it
  asserts nothing else.

### Which columns genuinely mis-sorted, and which only looked like it

Measured rather than assumed, because the two are indistinguishable from a
screenshot and the difference decides what to fix. (All of it now reachable —
see the correction above.)

- **Genuinely wrong, and silently**: the library compares a column as TEXT unless
  both values are already numbers, so any column whose value is a *rendered* date
  sorted alphabetically — April before January, and 2019 between 2018 and 2020
  only by luck. Three columns did this: **Deadline** and **Closed** on Tasks, and
  **When** on the diary's *All*. They now render through `formatDateSortable`
  ("2026-04-14"), which is the same trade `formatActivityWhen` already made in
  this app and for the same reason: the value being compared IS the value being
  shown, so the one whose job is to be compared is the one that gives.
- **Wrong, mildly**: **Department** on Tasks carries the department's own mark
  before its name ("➤ Sales"), so ordering it groups by mark rather than
  alphabetically. Left as it is — the mark is a deliberate design decision and
  the fix needs a per-column sort key the library does not have (UI-GAPS #22).
- **Correct, and correct by accident**: **Priority** renders as "1 · Whenever" …
  "4 · Do it now", so the leading digit makes lexical order equal numeric order.
  It works; it would stop working at ten levels.
- **Correct all along**: every text column — Task, Who has it, App, Client,
  Important, Urgent, and the diary's title/client/purpose/where/status/notes.
- **Not broken at all, and this is the one to be careful about**: on the Tasks
  *Overdue* tab, Priority reads "1 · Whenever" on every row, Department reads "—"
  on every row and Who-has-it reads "Nobody yet" on every row. Sorting a column
  whose every value is identical legitimately changes nothing. The Deadline
  column in that same screenshot was in correct date order. A control that
  appears to do nothing is not always a control that does nothing.

The other half of the report — "there are many places where I have no way to sort
a collection" — was simply true, and the table above is the answer: before this,
the only sortable thing in either front door was a column header on two screens.

## Status (updated 2026-08-18)

- **Layer 1 + the library search/filter UI**: SHIPPED, the library search/filter
  bar landed and the app turned it on across the BOUNDED collections (members /
  roles / invites / dropdown values / the brand library / meeting purposes) via
  the recipes (`listCollection` + `withDataDrivenCollection`, which hides
  search/filters when a list is empty or a facet has no options). See
  UI-CONVENTIONS §6.
- **Layer 2 (server-side query)**: SHIPPED 2026-08-17 for every PAGED collection,
  accounts, tickets, the knowledge base, the backlog, the diary and the process
  maps all search through their own door (`?q=`), and the accounts screen's three
  filters (type / status / archived) are door filters too, so the filtered count
  moves with them. Two doors learned `q` in the same change (tickets, stories);
  the other four already parsed it and simply had nothing asking.
  - **Not done, and named rather than left quiet:** the OTHER paged screens'
    facets (kind / filed / status on the knowledge base, client / purpose / status
    in the diary, app / archived on the maps, status / assignee / sprint / app on
    the backlog) are still the frame's own, so they narrow the loaded page. Their
    search is now honest and their counts do not claim otherwise — but the facets
    are the same class of defect as B4 was on accounts. UI-GAPS #15 carries it.
- **Layer 3 (FTS5 full-text)**: designed here, still NOT BUILT, the content/data-ops
  workers shipped (2026-06-23) without it because client-side search over the
  cached list covers current volumes. The FTS5 migration ships with the first
  module whose data outgrows the client-side layer. **Note what did NOT happen
  here:** the knowledge base (§ *The fourth layer*) shipped its own retrieval in
  August and deliberately did *not* use FTS5, for reasons that are about re-indexing
  cost rather than about search quality, so its arrival neither builds this layer
  nor argues against it.
- **The fourth layer (the knowledge base)**: BUILT 2026-08-11, retrieval rebuilt onto
  Vectorize 2026-08-12. Governed by Laws R23 and R26; owned by
  DATA-MODEL.md § *THE KNOWLEDGE BASE*.
- **Sorting**: SHIPPED 2026-08-18 (§ *The third question*). Every PAGED collection
  orders at its door; every bounded list recipe has a control derived from its own
  columns; the two tables compare their dates as dates. What is deliberately still
  unsorted, and why, is in the census above.
  - **Fixed the same day** (§ *The correction*): the two tables' column headers
    were drawing an active sort indicator and reordering nothing at all, on every
    column, because the library's frame reads its sort from config only at mount.
    The host now owns those headers (`web/components/record-table.tsx`) — the
    bounded one orders in the browser, the paged one asks its door — and
    `web/test/table-header-sorts.test.tsx` asserts the RENDERED ROW ORDER changes
    when a header is pressed, which is the one thing none of the lane's original
    checks asked. UI-GAPS #22(b) is now the library ask that would let the host
    table go; #23 (the paged panels inside a record, and the portal's tickets
    list) is unchanged and still app-side.
