# Search & filters — the ruleset (DESIGNED 2026-06-18)

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

> **Scope — read this before you conclude the app has no full-text search.** This
> document owns **record search**: finding rows in a collection you are looking at.
> It does **not** own the **knowledge base**, which is a different question
> (*"what do we know about X?"* — answered from passages, with citations) and a
> different mechanism (§ *The fourth layer*, below). Both are search; only one of
> them is what a search box over a list does.

## The three layers

A collection picks exactly one based on its expected size (declared in the recipe).

### Layer 1 — client-side (small, bounded lists) · the default today
The list is already fetched and cached ([CACHING.md](CACHING.md) `useCached`), so
search + filters run **in memory** over that array — instant, zero new requests.
Right for members, roles, invites, dropdown values: lists that are bounded per
team. This is `selectRows` (limit → filter + facets → search → sort → paginate)
running in the browser. No worker work at all.

### Layer 2 — server-side query (growing lists)
When a list can outgrow "fetch it all" (hundreds+ of rows), the recipe sets
`serverSide: true`. The collection then **does not** filter in memory: it
debounces the typed query + chosen facets and calls the module's list endpoint
with `?q=` + filter params; the worker returns a filtered **page**. Reads stay
cache-first (the cache key includes the query/facets); the live channel still
invalidates on writes. The worker does the filtering with ordinary indexed
`WHERE`/`LIKE` over the per-team database.

### Layer 3 — full-text "search anything" (FTS5)
For record modules where Glide-style "match anything on the detail screen" is
wanted (learning, tickets, imported datasets), each per-team database gets a
**SQLite FTS5** virtual table mirroring the record table's text columns. The
worker queries it with `MATCH` and returns ranked hits. This is what makes search
span *all* of a record's fields, not just a column, at scale.

## FTS5 design (per-team, per record module)

D1 *is* SQLite, so FTS5 lives **inside each team's own database** — isolation by
physics, same as every other per-team table ([ARCHITECTURE.md](ARCHITECTURE.md) §1).
Pattern, added by the module's team-schema migration when that module is built:

```sql
-- one virtual table per searchable record table (e.g. learning)
CREATE VIRTUAL TABLE learning_fts USING fts5(
  title, description, category,          -- the text fields shown on the detail
  content='learning', content_rowid='rowid'
);
-- triggers keep it in lock-step with the base table (no app code to forget)
CREATE TRIGGER learning_ai AFTER INSERT ON learning BEGIN
  INSERT INTO learning_fts(rowid, title, description, category)
  VALUES (new.rowid, new.content_title, new.content_description, new.category);
END;
CREATE TRIGGER learning_ad AFTER DELETE ON learning BEGIN
  INSERT INTO learning_fts(learning_fts, rowid, title, description, category)
  VALUES('delete', old.rowid, old.content_title, old.content_description, old.category);
END;
CREATE TRIGGER learning_au AFTER UPDATE ON learning BEGIN
  INSERT INTO learning_fts(learning_fts, rowid, ...) VALUES('delete', old.rowid, ...);
  INSERT INTO learning_fts(rowid, ...) VALUES (new.rowid, ...);
END;
```

Query path (in the module's worker): `SELECT l.* FROM learning_fts f JOIN learning l
ON l.rowid = f.rowid WHERE learning_fts MATCH ? ORDER BY rank LIMIT ? OFFSET ?` —
then the **same permission gate** as every read runs first (a viewer with no
right gets nothing back; FTS never bypasses [permissions](ARCHITECTURE.md) §3).
Deactivated rows are filtered in the JOIN, never hard-deleted ([records rule](ARCHITECTURE.md) §4).

Rules for FTS5 here:
- **One virtual table per searchable record table**, created by that module's
  team-schema migration and rolled to every team via `migrate-teams` (the locked
  maintenance path). New module = new migration, never a change to others.
- **Triggers keep it in sync** — never write the FTS table from app code, so it
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
`filterable` fields → filter facets, and chooses client vs server by the hint —
so turning on search for a new screen is a recipe edit, not new plumbing.

## The fourth layer — the knowledge base (BUILT 2026-08-11, retrieval rebuilt 2026-08-12)

Layers 1–3 answer *"which rows match these words?"*. The knowledge base answers
*"what do we know about this?"* — and because the answer is prose rather than a row,
it is built and governed completely differently. It is **not** a fourth setting on a
recipe and no collection opts into it; it is its own subsystem in the content
worker, reached at `GET /api/content/knowledge/ask`, in the app's Knowledge base
screen, and through `ask_knowledge` on the machine surface.

Three things about it belong here, so that a reader who came to this file looking
for "how does search work" leaves knowing it exists:

- **It does not use FTS5, and that is deliberate** — which is why Layer 3 below
  being unbuilt is not a contradiction. Its word index is `knowledge_terms`, an
  ORDINARY indexed table, because the operation that matters is the DELETE: a
  re-index removes one source's postings, which on FTS5 is a scan of every posting
  in the team and here is one keyed delete. It also behaves identically in the test
  harness and in D1, which a virtual table kept in step by triggers does not.
- **The ranking half is vectors, not words** — one account-wide Cloudflare Vectorize
  index, every team in its own NAMESPACE. Law **R26** is both halves of why that is
  safe: a namespace is a PARTITION Vectorize applies *before* the search (not a
  filter somebody wrote correctly today), and nothing readable comes out of the index
  at all — it is asked for ids and scores only, and every passage in every answer is
  read back out of the team's own database under the caller's own fence. **The vector
  store narrows; the database decides.**
- **An answer carries its sources or it is not an answer** (Law **R23**). Retrieval
  never writes prose: it hands back the passages, the sources they came from, the
  compartment it searched and the reasoning that chose it — and when it finds nothing
  it says so, with a sentence for the assistant to repeat instead of inventing one.

DATA-MODEL.md § *THE KNOWLEDGE BASE* is the owning reference (the four tables, the
compartment model, the two fences); BOOTSTRAP.md §3b is how you stand the index up.

## Status (updated 2026-08-12)

- **Layer 1 + the library search/filter UI**: SHIPPED — the library search/filter
  bar landed and the app turned it on across the collections (members / roles /
  invites / dropdowns / learning / tickets) via the recipes (`listCollection` +
  `withDataDrivenCollection`, which hides search/filters when a list is empty or
  a facet has no options). See UI-CONVENTIONS §6.
- **Layer 2 (server-side filters)**: available through the recipes' hints where a
  list is bounded; nothing needed beyond the shipped client-side layer at today's
  data sizes.
- **Layer 3 (FTS5 full-text)**: designed here, still NOT BUILT — the content/data-ops
  workers shipped (2026-06-23) without it because client-side search over the
  cached list covers current volumes. The FTS5 migration ships with the first
  module whose data outgrows the client-side layer. **Note what did NOT happen
  here:** the knowledge base (§ *The fourth layer*) shipped its own retrieval in
  August and deliberately did *not* use FTS5, for reasons that are about re-indexing
  cost rather than about search quality — so its arrival neither builds this layer
  nor argues against it.
- **The fourth layer (the knowledge base)**: BUILT 2026-08-11, retrieval rebuilt onto
  Vectorize 2026-08-12. Governed by Laws R23 and R26; owned by
  DATA-MODEL.md § *THE KNOWLEDGE BASE*.
