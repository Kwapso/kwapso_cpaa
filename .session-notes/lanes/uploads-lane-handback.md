# Uploads lane — what landed, and the one finding that changes the plan

Branch `lane/uploads-visible`, off `main` at `1ff94925` (merged in). `npm run
check` exit 0. Not merged, not deployed.

## Landed

| Commit | What |
|---|---|
| `96ea8fe1` | R2 · a story shows its attachments (Files and links tab + edit form reads them) |
| `50bc337f` | Finding A · the to-do's filename is a `safeHref` link |
| `f94a6b1a` | Finding B · a task shows the file stapled to it |
| `c0dabf1a` | **R40** · a stored file must reach a person, + `STORED_FILES` |
| `e31398fd` | dev · `DEV_API_ORIGIN` — look at a branch against real rows without deploying |

All three fixes verified by LOOKING, against real staging rows, through
`DEV_API_ORIGIN=https://kwapso-staging.kwapso.workers.dev npm run dev`:

- the owner's story `01M0YHZZ8BNADAHKVA25YA5ZAT` shows **Files and links · 4**,
  badged on arrival, both his screenshots listed and removable. Fetched the
  first: HTTP 200, `image/png`, 2,810,365 bytes — byte-identical to the
  planner's independent measurement;
- a task carrying a file shows **File · letter.png**; fetched, HTTP 200;
- a completed to-do — see below.

Two labelled rows remain on staging, both `R40 verification — … (safe to
delete)`: task `01M11ANQV3VHJRBYVJ7E67F9WQ`, to-do `01M11AQDHN26W7P1HA82SFMTSP`.

## THE FINDING THAT CHANGES THE PLAN

**The scan says the agency "sees the FILENAME and cannot open it". The agency
sees nothing at all — the row never renders once the file exists.**

`completeTodo` (`workers/content/src/lib/todos.ts:213-226`) is the ONLY writer of
`todos.file_url`, and it sets `completed_at` in the same UPDATE, guarded by
`completed_at IS NULL`. **A to-do carries a file if and only if it is completed.**

`listTodos` (`lib/todos.ts:100`) defaults to open-only:

```
if (filter.view !== "all") clauses.push("t.completed_at IS NULL")
```

`?view=all` exists on the door and **no caller in either front door has ever
passed it** — three call sites, `work-panels.tsx:709`, `live-resources.ts:217`,
and the account slice. Measured, not inferred: a to-do completed with a file
through the real doors returns `fileUrl` on the write, and `GET
/api/content/todos` then answers with zero rows; the account's To-dos tab renders
"Nothing outstanding with a client."

The tell was in the code all along. `work-panels.tsx` renders a `Done` badge for
`todo.completedAt` and dims the row via `live={!todo.completedAt}`. Both are
unreachable today. The panel was written for a list that includes completed
to-dos; something later defaulted the read to open-only and the badge quietly
died.

So the `safeHref` link in `50bc337f` is correct and currently inert. That is the
original bug one layer up, and it is why this is written down rather than ticked.

### Why it is not one parameter — and this is the crux

Flipping the two call sites to `view: "all"` breaks two laws:

- **R16.** The record-counts door's `todos-account` counter
  (`workers/content/src/routes/record-counts.ts`) calls `countTodos` with the
  default open filter. The list would show all and the badge would count open.
- **R14, and this is the real one.** `todos` is deliberately NOT in
  `GROWING_COLLECTIONS` — the panel's own comment says why: "a to-do shrinks as
  fast as it grows". That is true of OPEN to-dos and false of completed ones,
  which accumulate for ever. Including them makes it a growing collection, and
  R14 then requires real keyset paging, not a cap.

**So the honest fix is: `todos` joins `GROWING_COLLECTIONS` and pages** — opaque
cursor, exact total, `hasMore` through `pagedJson`, a `<LoadMore>` that can reach
page two, cursor sidecar in the live registry, count through the one seam. Same
shape `help` already uses for its archive, and for the same reason its own note
gives: "archive shipped as a door with no button, and giving it a button without
giving the put-away pile a screen would only move the dead end one step along."

That is a lane, not a tail. It also carries the owner's ruling ("yes they can see
it ofc!") for the portal half, which is the same door, the same counter and the
same seam — do them together or do the work twice. The bucket is checked and
permits it: `postCompleteTodo` writes `env.MEDIA` → `/media/<key>`
(`routes/todos.ts:145`), the client-visible bucket the portal gateway serves, not
`/media/internal/`.

## For whoever takes the eleven-door sweep

Start from `STORED_FILES` in `shared/rules/registry.ts` rather than a grep. R40
derives and rot-checks it, so it is a verified inventory: **4 bucket bindings, 17
write sites, 11 files.** Six were missing from the original scan —
`storeImageDataUrl` hides four `bucket.put`s behind a helper (accounts ×2,
apps ×2), and two doors were not listed at all: a member's own photo
(`workers/auth/src/lib/profile.ts`) and the TEAM logo
(`workers/tenancy/src/lib/teams.ts`). Both render fine.

Open questions the sweep still owns, none of them answered here:

- **replace / remove parity.** Only add-and-remove exists for story and ticket
  attachments; there is no edit path on `POST /api/content/stories/attachments`.
  A to-do's file can only ever be ADDED (`COALESCE(?, file_url)`,
  `lib/todos.ts:222`). A task's file is set at CREATE and never touched again.
- **images as images.** Every attachment renders as a filename-shaped link,
  including PNGs. A photo that reads as a document is technically correct and
  looks broken.
- **orphans.** `knowledge.ts:388` already admits bytes-in-R2-with-no-row is
  possible. Whether that is true elsewhere is unchecked.
- **reclamation.** `reclaimMedia` exists (`shared/workers/image.ts:145`) — which
  delete paths call it, and which leave the object for ever, is unchecked.

## Two corrections to the scan doc, now that R40's data has to be exact

- `safeHref` lives in `@shared/web/rich-text`, not `web/lib/safe-href`.
- `workers/tenancy/src/routes/processes.ts` writes an **APP's** logo
  (`AppRow.logoUrl`, rendered by `app-tiles.tsx:50`), not a process map's. The
  module is named for the permission, not for the record.

## One for the doc-rot list

There is no prettier config in this repo and prettier is not in the gate
(`npm run lint` is oxlint). Running `npx prettier --write` on two components
reformatted 500 lines and added semicolons throughout. Caught on the diffstat and
reverted. Worth a line in CONVENTIONS.md before someone commits one.
