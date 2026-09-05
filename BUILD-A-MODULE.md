# BUILD-A-MODULE.md, how to add a module to the Kwapso System, end to end

A **module** is one team-scoped thing users work with: a collection of records
that live in the team's own database, are gated by the role matrix, publish live
changes, log activity, and show up as a screen. `brand_assets` (the module a person
reads as the **brand library**) and `help` (the module a person reads as
**Tickets**. DATA-MODEL.md says why the key stayed) are
modules. So are `member_roles`, `team_members` and `selectable_data`. This
document is the golden path for adding the next one. Read it top to bottom, then
follow the checklist at the end.

It is grounded in the real code. The worked example is **the brand library**
(`workers/content/src/lib/brand-assets.ts`,
`workers/content/src/routes/brand-assets.ts`, the `brand.list` / `brand.detail`
recipes in `web/lib/screens.ts`), because it is the smallest module that still
exercises every layer: a per-team table, a permission row, gated CRUD, boundary
validation, an audit block, deactivate-not-delete, a pick-or-create vocabulary
field, an upload door, an activity write, `publishChange`, a screen recipe, a
record detail with Overview + Activity tabs, and a count badge.

Where your module needs something the brand library doesn't have, this document
names the module that does: **Tickets** (`help`) for a collection that GROWS and
therefore pages, and **`knowledge-detail.tsx`** for a record detail the screen
engine can't express.

Keep the **prime directive** in view the whole way: add the *least* code that
solves the problem, and reuse the seams below. Every seam already exists, you are
filling in a module-shaped hole, not inventing plumbing.

Assume, for the walkthrough, you are adding a module called **`notes`** (a team's
shared notes). Substitute your real name everywhere you see `notes` / `note`.

---

## The shape of a module (what you will touch)

| Layer | File(s) | What you add |
|---|---|---|
| 1. Table + migration | `workers/tenancy/src/team-schema.ts` | a `CREATE TABLE`, appended as a new `TEAM_MIGRATIONS` entry |
| 2. Register + permissions | `shared/team-modules.ts`. `TEAM_MODULES` + `MODULE_LABELS` (**not** `team-schema.ts`, which only re-exports them; the list moved to `shared/` the moment data-ops needed it too), then `buildTeamSeed` back in `team-schema.ts` | one module key, one label, seed rows for the two default roles |
| 3. Worker handler | `workers/content/src/{routes,lib}/notes.ts` + `index.ts` `ROUTES` | gated CRUD → validate → audit → activity → `publishChange` |
| 4. Web client + screen | `web/lib/api/content.ts`, `web/lib/screens.ts`, `web/lib/pages.ts`, `web/lib/live-resources.ts`, `web/components/deep-link/shape.tsx`, `web/lib/use-screen-data.ts`, `web/components/deep-link/module-content.tsx` | api wrapper, a list recipe, a nav section, a cache key + fetcher, a shaper, the read, the render |
| 5. Record detail | a `<module>.detail` recipe, or `web/components/note-detail.tsx` | Overview + Activity tabs (Law R2). Nothing to register: name the file `<module>-detail.tsx` and the R2/R8 census picks it up off disk from that day (it also catches any component that renders an `<ActivityPanel>`, whatever it is called) |
| 6. Tests | the existing seam/rule tests + `shared/rules/registry.ts` | nothing to register for the detail — the laws already walk it; pin any tab that shows no collection, with its reason |

The workers involved: **content** (`workers/content`) is the right home for a
content-shaped module (records users author). Every team-DB read/write goes through
the one REST door (`shared/workers/d1-rest.ts`); the gateway
(`workers/gateway/src/index.ts`) forwards `/api/content/*` to it. You do **not**
add a worker for a new module, you add routes to an existing one.

---

## Layer 1, the per-team table + migration

Every team has its **own** D1 database (locked, ARCHITECTURE.md). The one master
definition of what lives inside it is `TEAM_MIGRATIONS` in
`workers/tenancy/src/team-schema.ts`. A new table is a **new entry appended to that
array**. Never an edit to an existing migration (existing databases have already
run them). The runner stamps each applied version into the per-team `_migrations`
table and only applies what's missing.

Look at how the brand library did it (migration `0018_agency_internal`,
team-schema.ts):

```sql
CREATE TABLE brand_assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  file_url TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);
CREATE INDEX idx_brand_assets_category ON brand_assets (category);
```

The **shape rules**, every one visible above and non-negotiable:

- **`id TEXT PRIMARY KEY`**, a ULID (`shared/workers/id.ts`). Every row everywhere
  gets one, so rows can move between databases during sharding without collisions.
- **Three audit blocks**, `created_*`, `updated_*`/`editor_*`, `deactivated_*`/
  `deactivator_*` (actor id + email + name + timestamp). This is what powers the
  Overview tab and satisfies "keep an audit block on every write" (CLAUDE.md).
- **Deactivate, never delete**, the `deactivated_at` column *is* your delete. There
  is no `DELETE`. Retiring a row sets `deactivated_at`; reactivating clears it. Data
  and history survive (ARCHITECTURE.md §4).
- **Indexes** for the columns you'll filter/join on (e.g. the brand library has
  `idx_brand_assets_category`, because Category is a filter facet on its list;
  Tickets has `idx_help_status`).

Append your migration. The version prefix is monotonic:

```ts
// workers/tenancy/src/team-schema.ts — appended to TEAM_MIGRATIONS
{
  version: "0006_notes",
  sql: `
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT,
  category TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);
CREATE INDEX idx_notes_category ON notes (category);
`,
},
```

**How it rolls out.** A *brand-new* team runs every migration on creation
(`applyTeamSchema`, `workers/tenancy/src/lib/teams.ts`). *Existing* teams get it
from the migration robot: `POST /api/tenancy/admin/migrate-teams`
(`workers/tenancy/src/routes/admin.ts`), guarded by `ADMIN_KEY`, which finds
every ready team, diffs its `_migrations` against `TEAM_MIGRATIONS`, and applies
the gap. After you ship a new migration, the owner runs migrate-teams once. That is
the whole story, no per-table binding, no wrangler migration file.

---

## Layer 2, register the module + its permissions

**Permissions are the spine.** A module the matrix doesn't know about can't be
gated, so the server would refuse every request. Registering is three edits across
**two** files: the module key and its label live in `shared/team-modules.ts`, the
seed loop in `workers/tenancy/src/team-schema.ts`.

> **Why two files, and why it is worth knowing.** The list used to sit in
> `team-schema.ts` and moved to `shared/` the moment data-ops needed the same list
> to build the import/export matrix, one list, two consumers, so neither can drift.
> `team-schema.ts` re-exports it, so old imports still resolve and the move is
> invisible at every call site. That is exactly what makes it easy to edit the wrong
> file: the re-export line is the one you land on when you grep.

### 2a. Add the module key

```ts
// TEAM_MODULES (shared/team-modules.ts) — one row per module
export const TEAM_MODULES = [
  "teams", "team_members", "member_roles", "help",
  "selectable_data", "screens", "agent",
  // …plus the modules the product has grown since — the customer spine, the
  // knowledge base, the work engine, the agency's own housekeeping
  // (`brand_assets`, `delivery`, `staff_profiles`), the Google switches. Read the
  // real list in the file; it only ever gets longer.
  "notes",                       // ← new
] as const
```

### 2b. Give it a matrix label

`MODULE_LABELS` is keyed off `TEAM_MODULES`, so TypeScript **forces** you to add a
label, you cannot register a module without a human-readable row for the Roles
screen:

```ts
const MODULE_LABELS: Record<(typeof TEAM_MODULES)[number], string> = {
  // …
  notes: "Notes",              // ← new; shown as a row in the permission matrix
}
```

`TEAM_MODULE_CATALOG` (the matrix rows) is derived from these two, one source for
both the worker gate and the Roles UI.

### 2c. Seed the two default roles

`buildTeamSeed` (team-schema.ts) writes the starter permission sheet every new
team gets: **Admin** (full) and **Viewer** (read-only). The loop already iterates
`TEAM_MODULES`, so your module is seeded automatically. Admin gets
`read/create/edit/delete = 1,1,1,1`, Viewer gets `1,0,0,0`. You only touch this if
your module needs a *different* Viewer default (the brand library left it as
read-only; `agent` is the one special case, everyone may use it, so Viewer gets
`1,1,0,0`). For a normal module, do nothing here.

The four rights are the **tall permission sheet** `role_permissions`
(`role_id`, `module`, `can_read`, `can_create`, `can_edit`, `can_delete`, with
`UNIQUE (role_id, module)`). Future modules add **rows, never columns**.

> After this layer, the module exists and is gate-able, but nothing reads or writes
> it yet.

---

## Layer 3, the worker handler

Content modules follow one handler shape, and the brand library is the template.
Two files: `lib/notes.ts` (the CRUD + business rules, unit-testable, no HTTP) and
`routes/notes.ts` (the thin HTTP handlers: open context → gate → validate →
delegate to lib → publish → return). Then one line per route in `index.ts`.

### 3a. The lib: CRUD through the one door

`lib/brand-assets.ts` is the pattern. Team-DB access is **only** through
`shared/workers/d1-rest.ts`:

- **Reads** use `d1Query(cfg, guard.databaseId, sql, params)`, parameterised, so
  values are bound, not interpolated.
- **Writes** use `d1ExecScript(cfg, guard.databaseId, script)`, the REST API
  forbids params on multi-statement scripts, so you build the SQL with **`sqlString(...)`**
  (single-quote doubling; it also `String()`-coerces any non-string so the one door
  never 500s). Never string-concatenate a raw value into SQL.

A create, distilled from `createBrandAsset` (brand-assets.ts):

```ts
export async function createNote(
  cfg: D1Rest, guard: MemberGuard, actor: Actor, input: NoteInput
): Promise<string> {
  const title = requireText(input.title, "Title", TEXT_LIMITS.short)     // ← boundary validation
  const body  = optionalText(input.body, "Body", TEXT_LIMITS.long) ?? null
  const category = optionalText(input.category, "Category", TEXT_LIMITS.short) ?? null

  const id = ulid()
  const now = new Date().toISOString()
  await d1ExecScript(cfg, guard.databaseId,
    `INSERT INTO notes (id, title, body, category, created_at, creator_id, creator_email, creator_name)
     VALUES (${sqlString(id)}, ${sqlString(title)}, ${sqlString(body)}, ${sqlString(category)},
             ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`)

  await logActivity(cfg, guard.databaseId, actor, {                       // ← activity write
    type: "Note created",
    description: `${actor.name} added the "${title}" note`,
    relatedTable: "notes", relatedRowId: id,
  })
  return id
}
```

**Deactivate, not delete**, copy `setBrandAssetActive` (brand-assets.ts): one
`UPDATE` that either stamps the `deactivator_*` block + `deactivated_at`, or clears
them to reactivate. Never write a `DELETE`. Fetch-or-404 first (`assetOrThrow`,
brand-assets.ts) so a bad id is a clean 404, not a silent no-op, and keep the
current-status predicate inside the `UPDATE` with `RETURNING id`, so a repeat moves
zero rows and stays silent (Law R17, below).

Return rows shaped into a **shared type** (`shared/types.ts`), not raw DB columns,
`toAsset` (brand-assets.ts) maps `file_url → fileUrl`, `deactivated_at === null
→ active`, etc. The client and the AI agent both consume the shared type. Add
`export type Note = { … }` to `shared/types.ts` alongside `BrandAsset`.

### 3b. Boundary validation, bad input is a 400, never a 500 (Law)

Never trust the request body. Route bodies are `as`-cast, so a field typed `string`
can arrive as a number, array, object, or a multi-MB string, or carry NUL bytes D1
rejects. Use `shared/workers/validate.ts` at the top of every write:

- `requireText(value, field, max)`, required; throws a `GuardError(400,…)` on a
  non-string, blank, or over-long value.
- `optionalText(value, field, max)`, null/blank → `undefined`; otherwise validated.
- `TEXT_LIMITS`, `short: 200` (titles/labels), `link: 2048`, `long: 20000`
  (bodies/descriptions), `message: 10000` (chat).

Both strip NULs, trim, cap length, and throw the `GuardError` the worker's central
catch maps to a clean 400. This seam is **locked** by
`workers/content/test/validate.test.ts`.

### 3c. The route: open → gate → validate → publish

The handler is thin. Every team-scoped handler opens with `teamContext` and gates
with `requireRight` (`shared/workers/gating.ts`), in practice through the
`gated` / `gatedBody` wrapper (`shared/workers/route.ts`), which is those two steps
plus the defensive body read, collapsed into one awaited call so fifty handlers
don't restate the same three lines. Your create, in the shape `postCreateBrandAsset`
(routes/brand-assets.ts) is written in:

```ts
export async function postCreateNote(request: Request, env: Env): Promise<Response> {
  // gatedBody = teamContext (who + team + db, or throws) → requireRight → a
  // defensive body read (a malformed body becomes {}, never a throw).
  const { actor, cfg, guard, body } = await gatedBody<NoteInput>(request, env, "notes", "create")
  requireText(body.title, "Title", TEXT_LIMITS.short)                // 400 on bad input
  const id = await createNote(cfg, guard, actor, body)
  await publishChange(env, guard.teamId, "notes", id, "add")          // ← LAW R1: live-sync
  return json({ notes: await listNotes(cfg, guard), total: await countNotes(cfg, guard) })
}
```

`teamContext` (gating.ts) returns `{ user, actor, cfg, guard }`: it asks the auth
worker who you are (401 if signed out), reads your active team (409 if none),
confirms you're an **active member** of it (403 `not_member`, gating.ts), and
hands back the guard carrying your `roleId` + the team's `databaseId`.
`requireRight` (gating.ts) reads the tall sheet and throws `403 forbidden` if
your role lacks that right on `"notes"`. The check is on the **real module key**,
security is never just hiding UI, and the **AI agent goes through these same gated
endpoints** as the signed-in user, so it can never exceed your rights.

Map right → HTTP verb consistently, exactly as the brand library does:

| Action | Right | Route |
|---|---|---|
| list / read one | `read` | `GET /api/content/notes` |
| create | `create` | `POST /api/content/notes` |
| edit | `edit` | `POST /api/content/notes/update` |
| deactivate / reactivate | `delete` | `POST /api/content/notes/active` |

Throw, don't catch: any rule failure is a `throw new GuardError(status, code, msg)`
(gating.ts); the worker's central `try/catch` (`index.ts`) turns it into the
response. You never build error responses by hand inside a handler.

### 3d. The live-sync law (R1), `publishChange`

**Every mutation publishes a live change.** After a successful write, call
`publishChange(env, guard.teamId, resource, id, op)`
(`shared/workers/realtime.ts`). The payload carries only `{resource, id, op}`.
**never row data**, so every open screen re-pulls *just that one row* through the
permission-checked endpoint (row-level live-sync; nothing can leak). `op` is
advisory (`add` | `edit` | `remove`); the client re-pulls and decides keep-or-drop.
Publishing is best-effort, a live-layer hiccup never breaks the write. For a bulk
endpoint, publish **one ping per changed row** (see `postBulkHelpStatus`,
routes/help.ts), not one list-wide ping. (The only sanctioned id-less coarse pings
are CSV import and the `agent_usage` quota meter, listed in CACHING.md; a new
module doesn't add one.)

### 3e. Register the routes

Add a line per route to the `ROUTES` table in `workers/content/src/index.ts`.
Every non-GET route is **classified**, `mutation` (must publish) or `housekeeping`
(the reviewed deny-list of writes that intentionally broadcast nothing, e.g. the R2
file upload). This classification is not decoration: `publish-seam.test.ts` reads it
and fails CI if a `mutation` handler's source doesn't contain a `publishChange` call.

```ts
"GET  /api/content/notes":        { handler: getNotes,        kind: "read" },
"POST /api/content/notes":        { handler: postCreateNote,  kind: "mutation" },
"POST /api/content/notes/update": { handler: postUpdateNote,  kind: "mutation" },
"POST /api/content/notes/active": { handler: postSetNoteActive, kind: "mutation" },
```

The gateway already forwards `/api/content/*` to this worker
(`workers/gateway/src/index.ts`), no gateway change needed.

> **Optional: file uploads.** If your module attaches files (as the brand library
> does), follow `postUploadBrandAsset` and `postStreamBrandAsset`
> (routes/brand-assets.ts). The buffered door accepts a base64 data URL and
> `parseUploadDataUrl`s it with a byte cap; the streamed twin takes the file AS the
> request body, checks `content-length` before a byte is read, and holds the
> declared type to `INLINE_SAFE_UPLOAD`, because the object is served back under
> that type, so a script-capable one would be stored XSS on our own origin. Both
> mint the key with `mediaKey(guard.teamId)`, so the key carries nothing the caller
> sent, and both return a `/media/internal/…` URL. They are classified
> **`housekeeping`** (they write a file, not a record, no row to patch) and need a
> matching R2 bucket binding + a gateway serving branch (gateway index.ts).

---

## Layer 4, the web side

The web app never fetches ad hoc. Every piece below is small and formulaic.

### 4a. The api client wrapper (`web/lib/api/content.ts`)

Add your calls to the `content` namespace. Same-origin `/api` calls; the shared
`api<T>()` helper throws a typed `ApiFailure` on non-OK. Mirror the brand-library
block (content.ts). Note the `total` on every list-shaped response, which is R16's
exact server count, not `rows.length`:

```ts
export const content = {
  // …existing help / brand-assets / knowledge…
  notes:       () => api<{ notes: Note[]; total: number }>("/api/content/notes"),
  notesOne:    (id: string) =>
    api<{ notes: Note[] }>(`/api/content/notes?id=${enc(id)}`).then((r) => r.notes[0] ?? null),
  createNote:  (input: Partial<Note>) =>
    api<{ notes: Note[]; total: number }>("/api/content/notes", post(input)),
  updateNote:  (input: Partial<Note> & { id: string }) =>
    api<{ notes: Note[]; total: number }>("/api/content/notes/update", post(input)),
  setNoteActive: (id: string, active: boolean) =>
    api<{ notes: Note[]; total: number }>("/api/content/notes/active", post({ id, active })),
}
```

### 4b. The nav entry + the count badge (`web/lib/pages.ts`, Law R8)

Add a `TeamSection` (pages.ts). `module` is the read-right that reveals it;
`segment` is the URL segment; `placement` is `"sidebar"` (a first-class page, like
Tickets or the brand library), `"tab"` (an admin section in the team tab strip), or
`"contextual"` (reached from a button, like Meeting purposes, which is the taxonomy
behind the Meetings screen rather than a destination of its own).

**Law R8, the count badge is derived.** Any `placement:"tab"` section that leads
with a collection **must** declare a `countCacheKey`, the cache-key prefix whose
exact server total *is* the badge count, so a new tab can't ship a forgotten or
hand-listed count. Sidebar sections don't need one.

R8 covers the **other** tab strip too, the tabs on one record's own screen (step
6). Don't stop at this one; a module whose team tab is counted and whose record
Activity tab isn't is only half in-rule.

```ts
{ key: "notes", title: "Notes", module: "notes", segment: "notes",
  placement: "sidebar", countCacheKey: "notes" },
```

**Widen the `TeamSection["key"]` union first.** `key` in `pages.ts` is a CLOSED
hand-maintained union (`"overview" | "members" | …`), so adding `{ key: "notes", … }`
is a TypeScript error until you add `"notes"` to that union, `npm run check` fails at
the `web` typecheck otherwise. Add your key to the union, then add the section.

Also give the concept one icon in `CONCEPT_ICON` (pages.ts), the single icon
vocabulary, reused at page/tab/button level. If it's a top-level URL like
`/notes`, add `"notes"` to `TOP_LEVEL_MODULES` (`web/components/deep-link/route.ts`)
and the gateway's top-level shell loop (gateway index.ts).

**Importable? Declare a target + a sample.** If your module accepts CSV import, add a `TargetDef` in `workers/data-ops/src/lib/targets.ts` (columns, the gated create endpoint, optional `references`, a `sample` example row, and `exportPath` if the module also has a CSV export door). See AGENTIC-IMPORT.md. The downloadable sample file is then automatic (tests enforce every target yields one AND that the sample itself imports cleanly), and, because the agent's capability brief is generated from the same catalog (Law R9), the assistant automatically knows your module can be imported/exported the moment you declare it. Nothing else to teach it.

**Add your product words to the glossary (Law R6).** Any new term your UI shows,
`invoices`, `purchase order`, `SKU`, goes in `shared/glossary.ts` (one term, one
clear ≤140-char definition), and UI copy must use exactly that word, never a synonym.
`web/test/rules.test.ts` checks the glossary is well-formed (`glossary-wellformed`).

### 4c. The screen recipe (`web/lib/screens.ts`)

A **list** is described as *data*, a `ScreenRecipe` the library engine renders. Copy
`brandListRecipe` (screens.ts). `listCollection(...)` turns on client-side
search over the shaped columns and adds a filter bar per facet:

```ts
export const notesListRecipe: ScreenRecipe = {
  type: "list", display: "list", surface: "none",
  binding: { module: "notes" },
  gate: { module: "notes", right: "read" },
  fields: [field("name", "Note"), field("detail", "Details")],
  actions: [],
  collection: listCollection("No notes yet.", "Search notes…", [
    { field: "category", label: "Category", control: "select" },
    { field: "state",    label: "Status",   control: "select" },
  ]),
}
```

Register it in `BASE_RECIPES` under `"notes.list"` (screens.ts), and map the URL
segment to its permission module in `MODULE_PERMISSION` (screens.ts), for a
content module the segment *is* the module: `notes: "notes"`. Each facet `field`
must be a real column on the *shaped* rows (next step). A team can override any
recipe at runtime; `resolveRecipe` merges override-over-base defensively, so a bad
override can never blank the screen.

> The **detail** screen for the brand library IS a recipe (`brandDetailRecipe`,
> screens.ts): a name, a category, a description, a file and an audit block are
> description-list rows, and the history is an activity block, so there is nothing
> for a host to compose. Reach for a host-composed component only when the record
> carries a control the engine has no block for, a knowledge source's own words and
> the switches over them, a ticket's thread and status stepper, a process map's
> numbered steps and the arithmetic between two versions. See Layer 5.

### 4d. The shaper (`web/components/deep-link/shape.tsx`)

Pure functions turn the loaded shared-type rows into the flat rows the recipe reads.
Copy `shapeBrandList` (shape.ts). `name`/`detail` are what the row renders;
any extra key is a **facet column** the filter engine reads (it must match the
recipe's facet `field`):

```ts
export function shapeNotesList(items: Note[]): ScreenData {
  return {
    rows: items.map((n) => ({
      id: n.id,
      name: n.active ? n.title : `${n.title} (inactive)`,   // inactive stays visible (deactivate-not-delete)
      detail: n.category || "—",
      category: n.category || "—",                            // facet column
      state: n.active ? "Active" : "Inactive",                // facet column
    })),
  }
}
```

The suffix on a retired row is not decoration, it is how a person tells a live row
from a put-away one at a glance. Use the word your module's glossary entry uses:
roles say `(inactive)`, the brand library says `(archived)`, because **Archive** is
the term for putting a record away without losing it.

### 4e. Wire it into the resolver (`deep-link-screen.tsx`)

`deep-link-screen.tsx` is the one shell backing the whole `/t/*` tree, and it now
splits three ways: `web/lib/use-screen-data.ts` owns the cache-first reads,
`web/lib/use-screen-actions.ts` owns the write callbacks, and
`web/components/deep-link/module-content.tsx` renders. Add one piece to each,
mirroring the brand library.

- **Cache-first read** with `useCached(key, fetcher)` (`shared/web/store.ts`): it
  returns cached data instantly and revalidates in the background, and a live ping
  patches the one row in place. Key by team so a team switch re-fetches, and read
  it only on the module that needs it:

  ```ts
  // web/lib/use-screen-data.ts — the brand library's line, in your module's name
  const notesQ = useCached(enabled && module === "notes" ? notesKey(teamId as string) : null,
    () => listFetch.notes(teamId as string))
  ```

  The key builder lives beside the live registry (`web/lib/live-resources.ts`) for
  the reason `brandAssetsKey` does: the registry, the screen read and the count
  sidecar all have to say the same string, and three places typing it is three
  places to mistype it. That fetcher also primes the `total:` sidecar (R16), so the
  badge and the rows can never disagree.

- **List branch**, shape, apply `withDataDrivenCollection` (hides dead search/facets
  when there are no rows), render `<ScreenRenderer>` inside a `SectionWithCreate`
  gated by `can("notes", "create")`.

- **Detail branch**, render the detail recipe, or delegate to your bespoke
  component: `if (module === "notes") return <NoteDetailScreen teamId={teamId}
  noteId={recordId} />`.

- **Create handler**, a small callback that calls the api, then
  **`primeCache(notesKey(teamId), next)`** so the new row appears instantly for
  the actor (everyone else gets the realtime ping), and `invalidate` on the record's
  activity key after an edit so its Activity tab reflects the new row. See
  `saveInternalRecord` (`web/lib/use-screen-actions.ts`), which does both for the
  brand library.

**The cache/live contract in one line:** the mutating call primes the actor's cache
with the fresh list; other devices get the `publishChange` ping → re-pull the one
changed row. Never refetch the whole collection on a change. (CACHING.md.)

---

## Layer 5, the record detail: Overview + Activity tabs (Law R2)

**Every record-detail screen exposes Overview + Activity tabs**, via the library
`TabsView` + `ActivityFeed`.

**Try the recipe first.** If your record is facts and history, its `tabs` are recipe
*data* and you get R2 for free, `brandDetailRecipe` (screens.ts) is six
description-list rows and an activity block, and that is the whole detail screen.

For a **bespoke** detail this is on you to render, and `knowledge-detail.tsx` is the
shortest template: three tabs, of which one is the record's own words and two are the
standard pair.

Its reads, all cache-first:

```ts
// the list row, as the instant paint (cache-first), …
const sourcesQ = useCached(knowledgeKey(teamId), () => content.knowledge().then(r => r.sources))
// …the record itself, read by id — the list row is not the record (EDGE-CASES.md), …
const oneQ     = useCached(`knowledge:one:${sourceId}`, () => content.knowledgeOne(sourceId))
// …and its history, through the ONE generic (table, id) path, with the exact total.
const activity = useRecordActivity("knowledge_sources", sourceId)
```

The activity read is the **one generic (table, id) path**. Law R5. You do **not**
write a per-module history query; `useRecordActivity("notes", id)`
(`web/lib/use-record-activity.ts`) reads it through `tenancy.recordActivity`, gated
server-side by the module's read right, and hands back page one's rows *and* the
door's exact total.

The Overview tab is built from `auditItems(...)`
(`web/lib/audit-overview.ts`), the shared audit block (created by/when, edited
by/when, status) that keeps Overviews consistent across the app. The tabs render
through the library `TabsView` (knowledge-detail.tsx):

```tsx
const tabsConfig = { ...defaultTabsConfig, variant: "line", tabs: [
  { value: "source",   label: "Source",   icon: "file-text", badge: "", badgeVariant: "" },
  { value: "overview", label: "Overview", icon: "info",      badge: "", badgeVariant: "" },
  { value: "activity", label: "Activity", icon: "history",
    badge: formatCount(activity.total), badgeVariant: "" },   // ← R8/R16: the exact total
]}
// renderPanel: overview → <OverviewList items={overviewItems}/>,
//              activity → <ActivityPanel activity={activity}/>
```

Note which tabs carry a badge: the ones that reveal a collection do, and the one
that shows the record itself does not, that difference is Law R8, and an uncounted
tab needs a reasoned `RECORD_TAB_COUNT_EXCEPTIONS` line.

After an edit or (de)activate, prime the list cache with the returned rows and
`invalidate(\`activity:record:<table>:<id>\`)` so the Activity tab reflects the new
row (`saveInternalRecord` / `setInternalActive` in
`web/lib/use-screen-actions.ts` do exactly this). Action buttons carry their kit
icon (CLAUDE.md): edit = `Pencil`, deactivate = `Power`, destructive actions get the
red colour + a confirm.

> Note the two R2 flavours: a **recipe** detail (like `memberDetailRecipe` or
> `brandDetailRecipe`) carries the tabs as recipe *data* and gets them for free; a
> **bespoke** detail (Tickets, the knowledge base, process maps, and your Notes if it
> comes to that) must render `TabsView` + `ActivityFeed` itself and is checked
> by the `record-detail-tabs` test.

---

## Layer 6, the tests each Law makes you write

The laws are machine-checked; they read source off disk, so you can't fool them. You
mostly don't *write* tests, you make existing ones pass, and register your module
where a test looks for it.

| Law | What it checks | What you do |
|---|---|---|
| **R1** publish-seam | `workers/content/test/publish-seam.test.ts` reads `ROUTES` + handler source: every `mutation` must contain a `publishChange` call; non-GET routes must be classified. | Classify each route (3e) and actually publish (3d). A `housekeeping` route (e.g. upload) must be added to the test's reviewed `HOUSEKEEPING` set. |
| **R2** record-detail-tabs | `web/test/rules.test.ts` DERIVES the bespoke record details off disk — a component under `web/components` named `*-detail.tsx`, or one that renders an `<ActivityPanel>` — and asserts each contains `TabsView` + `<ActivityPanel>`. | Nothing to register. Name it `note-detail.tsx` and Layer 5 is forced from the moment the file exists. (It used to be a hand-kept list, and four record details were missing from it; `RECORD_DETAIL_NOT` is now the reasoned residue, for a file that is NOT a record detail.) |
| **R3** no-handrolled-toggles | No component fakes a tab strip with `variant={x === y ? …}`. | Use `TabsView` for any tab strip (the Tickets list's All / My / Archived strip does). |
| **R4/R7** forms | Every dialog in `FORM_DIALOGS` imports `FormShell` and `useFormDraft`. | If you add a `note-form-dialog`, add it to `FORM_DIALOGS` (registry.ts) and build it on `FormShell` + `useFormDraft`. |
| **R5** generic-activity-path | The activity read has a generic `record` scope; the web reads via `recordActivity`. | Read history only via `tenancy.recordActivity(...)` (Layer 5). No new SQL. |
| **R8** tab-counts-derived | Both tab surfaces. Team strip: every `placement:"tab"` collection section declares a `countCacheKey`. Record detail: every tab is badged from the collection it reveals (recipe → the `withTabCounts` seam; bespoke → its own tabs config, read out of your source). | Declare `countCacheKey` (4b). On your detail (Layer 5), badge Activity with `formatCount(activity.total)` from `useRecordActivity`, and for each tab that shows no collection, add a reasoned `RECORD_TAB_COUNT_EXCEPTIONS` line (registry.ts). |
| **boundary** validate | `workers/content/test/validate.test.ts` locks `requireText`/`optionalText`. | Validate every write at the top (3b). Bad input → 400, never 500. |

Also add a plain unit test for your lib's business rules, the lib functions are pure
and HTTP-free precisely so this is easy. `workers/content/test/agency-internal.test.ts`
is the model for the brand library's half of that: it exercises the typed-field rules
its writes stand on (a date is a real calendar day or a clean 400; a link is
http/https/mailto or it is dropped) and then proves, by reading the doors off disk,
that not one of them can be reached by a client login.

Then, before you commit: **`npm run check`** (TypeScript across every workspace + the
full test suite, including the rule + seam tests). It is the gate. A broken law turns
it red.

---

## The copy-paste checklist

```
LAYER 1 — table + migration  (workers/tenancy/src/team-schema.ts)
[ ] Append a NEW entry to TEAM_MIGRATIONS (version "NNNN_<module>"); never edit an old one
[ ] Table has: id TEXT PRIMARY KEY (ULID); the 3 audit blocks (created_/editor_/deactivator_)
[ ] Deactivate-not-delete: a deactivated_at column, NO DELETE anywhere
[ ] Indexes for the columns you filter/join on

LAYER 2 — register + permissions  (shared/team-modules.ts, then team-schema.ts)
[ ] Add the module key to TEAM_MODULES          (shared/team-modules.ts)
[ ] Add its label to MODULE_LABELS (TS forces this) (same file)
[ ] buildTeamSeed already seeds it (Admin 1111 / Viewer 1000) — only touch for a special Viewer default

LAYER 3 — worker handler  (workers/content/src/{lib,routes}/<module>.ts + index.ts)
[ ] Add the shared type to shared/types.ts; shape DB rows → it (toX mapper)
[ ] lib CRUD via d1Query (reads) / d1ExecScript + sqlString (writes) + ulid ids
[ ] Boundary-validate every write: requireText / optionalText + TEXT_LIMITS → GuardError(400)
[ ] Audit block on every write (actor id/email/name + timestamp)
[ ] Deactivate/reactivate handler (stamp/clear deactivator_*), fetch-or-404 first
[ ] logActivity(...) with relatedTable/relatedRowId on state changes
[ ] Route handlers: teamContext → requireRight(module, right) → validate → lib → publishChange → json
[ ] publishChange(env, teamId, "<module>", id, op) after EVERY mutation (R1); one ping per row for bulk
[ ] Add each route to ROUTES with kind read | mutation | housekeeping

LAYER 4 — web client + screen
[ ] web/lib/api/content.ts: add the content.<module> wrappers (each list carries `total`)
[ ] web/lib/pages.ts: add the TeamSection (+ countCacheKey if a collection tab, R8) + CONCEPT_ICON
[ ] web/lib/screens.ts: add <module>ListRecipe, BASE_RECIPES["<module>.list"], MODULE_PERMISSION
[ ] web/components/deep-link/shape.ts: add shape<Module>List (name/detail + facet columns)
[ ] web/lib/live-resources.ts: a <module>Key(teamId) builder + a listFetch entry that primes total:
[ ] web/lib/use-screen-data.ts: the useCached read; use-screen-actions.ts: the write callbacks
[ ] deep-link/module-content.tsx: the list branch + the detail branch
[ ] (top-level URL?) add to TOP_LEVEL_MODULES + the gateway shell loop + web/app/<segment>/

LAYER 5 — record detail  (a <module>.detail recipe, or web/components/<module>-detail.tsx)
[ ] Facts + history only? A detail RECIPE gets R2 for free — try that before a component
[ ] Bespoke detail renders TabsView + Overview (auditItems) + Activity (ActivityFeed) — R2
[ ] Activity via useRecordActivity("<module>", id) — the ONE generic path (R5); no new history SQL
[ ] Every record tab badged from the collection it reveals — Activity = formatCount(activity.total) (R8/R16);
    a tab that shows no collection gets a reasoned RECORD_TAB_COUNT_EXCEPTIONS line
[ ] Actions carry kit icons from `@shared/ui/foundations/icons` (PencilSimple edit, Power deactivate); destructive = red + confirm

LAYER 6 — words  (every module ships copy, and copy is translated — LANGUAGES.md)
[ ] Every new product word is in shared/glossary.ts (R6), and the copy uses THAT word (R34)
[ ] Every user-visible sentence sits inside t("…") — the whole sentence with a {hole},
    never a fragment like t("of") (R33). A field config's label:/helpText: goes through
    shared/web/field.tsx instead, because t is a hook and the config is a constant
[ ] Run `npm run lang` and COMMIT the catalogue change with the code (R28). Both deploy
    commands refuse on a stale catalogue, so this is not optional — and a sentence missing
    from the catalogue ships in English to somebody who chose German, silently

LAYER 7 — tests + ship
[ ] (bespoke detail?) name the file "<module>-detail.tsx" — the R2/R8 census derives it off disk, nothing to register
[ ] (form dialog?) register in FORM_DIALOGS; build on FormShell + useFormDraft — R4/R7
[ ] Add a unit test for the lib's business rules
[ ] npm run check is GREEN

AFTER SHIP
[ ] Owner runs POST /api/tenancy/admin/migrate-teams (x-admin-key) to roll the migration to existing teams
```

---

## Anti-patterns (each breaks a Law or a locked decision)

- **A `DELETE` statement.** There is no delete, deactivate. (ARCHITECTURE.md §4.)
- **Raw string interpolation into SQL.** Use `d1Query` params or `sqlString(...)`.
- **A mutation with no `publishChange`.** Fails `publish-seam.test.ts` (R1).
- **`body.field.trim()` without `requireText`/`optionalText`.** A non-string 500s;
  bad input must be a 400 (locked by validate.test.ts).
- **A detail without Overview + Activity tabs.** Fails `record-detail-tabs` (R2).
- **A per-module activity query.** Read history only via the generic `record` path (R5).
- **A collection tab with a hand-listed count.** Declare a `countCacheKey` (R8).
- **A record tab with no count.** Every tab that reveals a collection carries it,
  a record's Activity tab included (R8); an uncounted tab needs a reasoned
  `RECORD_TAB_COUNT_EXCEPTIONS` line.
- **Refetching the whole list on a change.** Row-level live-sync only. (CACHING.md.)
- **A new worker for a new module, or a second copy of a library component.**
  Add routes to an existing worker; the library is lego you assemble. It lives
  in `shared/ui/` and this repo owns it, so a primitive that is wrong is fixed
  THERE, once, never re-implemented in `web/components/`. (CLAUDE.md.)
```

## The hardening checklist (R13–R19 — a new module must satisfy these)
Beyond the golden path, a module that ships without these turns the build red:

- **Import story (R13):** declare a `TargetDef` in `workers/data-ops/src/lib/targets.ts`
  OR add a reasoned `CATALOG_EXEMPT` line in `shared/rules/registry.ts`.
- **Bounded reads — or real paging (R14):** every `list*` in the module's lib
  carries a hard cap from `shared/workers/limits.ts` with its comment. Ask first
  whether the collection GROWS with ordinary use (rows accumulate and are never
  curated away — tickets, orders, events, a feed). If it does, it must PAGE
  instead: add it to `GROWING_COLLECTIONS` in the registry, page by key through
  `shared/workers/paging.ts`, answer through `pagedJson` (rows + exact total +
  `hasMore` + an opaque cursor), and render `<LoadMore>` on its screen — the
  check verifies all three ends, including that the client can reach page two.
  A bounded collection (roles, members, dropdown values) may still just cap.
- **Live listener (R15):** add a `TEAM_RESOURCES` row-level entry in
  `web/lib/live-resources.ts` (or a `SIMPLE_INVALIDATIONS` / reasoned `DEAF_EXEMPT`
  entry) for every resource the module publishes. A paged screen needs nothing
  extra: its rows live in a cache key with the cursor in a sidecar, so the same
  registry keeps it live (CACHING.md §12).
- **Count (R16):** the list door returns an exact `total`; the screen renders the
  badge through `formatCount` and, if it's a sidebar page, a `CollectionHeading`.
- **Idempotent transitions (R17):** any deactivate/reactivate/status write carries
  the current-status predicate + `RETURNING id` and publishes only when a row moved.
- **Activity gate (R18):** every `relatedTable` the module writes is in
  `ACTIVITY_GATE_MAP` (or a pinned `ACTIVITY_TABLE_EXEMPT` reason).
- **Filter parity (R19):** any GET agent/MCP tool exposes + forwards every param
  its door parses.
- **Body parity (R22):** any POST agent/MCP tool exposes + forwards every field
  its door reads off the body, or names a reason in `NARROWED_BODY_FIELDS`.
- **A tool, or a written reason (the door census):** every non-admin door on
  tenancy / content / data-ops / auth must have a tool on some machine surface or
  a line in `TOOLLESS_DOORS` (`workers/mcp/test/filter-parity.test.ts`). A byte
  upload is the usual honest exemption — see the three there.
- **A trace, or a written reason:** every WRITE tool maps to a screen in
  `web/lib/agent-trace.ts` or joins `SCREENLESS_WRITE_TOOLS` with its reason.

**Two seams a new module reuses rather than rewrites** (both earned by the
agency-internal build, which needed five copies of the first and four of the
second before they were lifted):

- **Pick-or-create a vocabulary value** — `ensureSelectableValue`
  (`workers/content/src/lib/vocabulary.ts`), with the group name declared once in
  `shared/selectable-groups.ts` (`brandCategory`, `department`, `country`, …). A
  free-typed category / department / country becomes a canonical dropdown value
  instead of a fifth spelling of the same word.
- **A typed field a form collects** — `optionalDate` / `safeExternalLink`
  (`workers/content/src/lib/internal-fields.ts`). A date is a real calendar day or
  a clean 400; a link is http/https/mailto or it is dropped.
