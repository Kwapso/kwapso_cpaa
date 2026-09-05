# `scripts/` — what each one is for, and which ones are finished

Eighty-one files, and until now nothing said which of them you would ever run
again. That is the whole reason this page exists. A tidiness review on
5 Sep 2026 found twenty-one scripts named by nothing at all — not `package.json`,
not another script, not a doc — and the cost was not the disk space. It was that
**`final-gate.mjs`, the integrated pre-ship check, read exactly like an abandoned
one-off**, because both look identical from a directory listing.

So every script below is in one of four groups, and the group is the answer to
"should I run this?"

- **A gate or a step in a chain** — something a deploy, a build or `npm run …`
  actually invokes. Do not delete; something breaks.
- **A tool you run on purpose** — a seed, a smoke, a bench, a repair you might
  need again. Run it when the situation calls for it.
- **SPENT — a one-off that has been run** — it fixed a mess that no longer
  exists, and it is kept as the record of what was done to the data. Do not run
  it again without reading it first.
- **A lane's own verification shot** — a screenshot rig written to prove one
  change looked right, kept as evidence for that change.

**Deleting anything here is the owner's call, not a lane's.** The spent one-offs
each rewrote live rows; a script that says how the data got into its current
shape is worth more than the space it takes.

---

## Gates and chain steps — a deploy or a build runs these

| Script | What it does |
|---|---|
| `check-cloudflare-account.mjs` | **First in both deploy chains.** Refuses to deploy into another company's Cloudflare account. Also the one place the account id is derived (from the workers' own `CF_ACCOUNT_ID` vars) — five other scripts read it from here. |
| `check-team-migrations.mjs` | Refuses to finish a deploy while a live team database is behind the schema. Runs immediately after tenancy, and its own header explains at length why it cannot run earlier. |
| `i18n-extract.mjs` · `i18n-prune.mjs` | `npm run lang` and `lang:check` (R28). Extract makes `shared/i18n-strings.json` exactly what the two front doors say; prune makes the catalogue and the seed match `LANGUAGES`. Both deploy chains refuse on a stale catalogue. |
| `smoke-staging.mjs` · `smoke-portal.mjs` | The post-deploy smoke on each front door. |
| `sync-design.mjs` · `design-imports.mjs` · `kit-drift.mjs` | The vendored design kit: pull a tag, rewrite imports, and report drift (`npm run kit:drift`). `shared/ui/` is hash-pinned — OPERATIONS.md § "The design system" has the three-command loop. |
| `build-kit-catalogue.mjs` · `build-screen-builder.mjs` · `kit-coverage.mjs` | Build the kit catalogue and the screen builder. `kit-coverage.mjs` is imported by `web/test/rules.test.ts` — R46 stands on it. |
| `icon-map.mjs` · `gen-icons.mjs` | The icon vocabulary and the app icons. |
| `lib/*.mjs` | Shared helpers, not entry points: `api.mjs` (a timed fetch + the signed-in API), `cf-credentials.mjs` (account + token, never hard-coded), `front-doors.mjs` (the two public origins, derived from the wrangler configs), `i18n-source.mjs` (**the one definition of what a person reads** — R28 and R33 both stand on it), `shared-alias.mjs` (`@shared/*` for Node), `test-login-key.mjs`. |

## Run on purpose

### Before a ship

| Script | What it does |
|---|---|
| `final-gate.mjs` | **The integrated gate: everything the owner is about to test, in one run against deployed staging, after all lanes have merged.** No doc named it until this page did. |
| `walk-mobile.mjs` | `npm run walk:mobile` — walks both front doors at phone width, in every language. |
| `every-page-has-a-name.mjs` | Opens every destination in a real browser and asserts the page says what it is. Written the day the owner opened Sprints and found no title. |
| `lane-shots/walk-empty-team.mjs` | Walks the whole app against a team created through the app's own doors, with nothing in it. The empty-state sweep. |
| `smoke-mcp.mjs` | The external machine surface, end to end. |

### Data: seed, back up, reset

| Script | What it does |
|---|---|
| `backup.mjs` | Every database and every R2 bucket, to a folder. Refuses without a token — there is no half-backup mode. |
| `reset-all.mjs` | **Destructive.** Empties an environment; schema and migration history survive. |
| `wipe-knowledge.mjs` | **Destructive.** Empties one team's knowledge base — rows and vectors together, because emptying one without the other leaves a search that matches passages the database cannot read back. |
| `seed-staging.mjs` | The main seed. |
| `seed-the-quiet-screens.mjs` · `seed-knowledge-about-the-app.mjs` | Fill the screens a plain seed leaves empty; put the app's own documentation into the knowledge base. |
| `knowledge-backfill.mjs` | Re-read and re-embed the knowledge base. |
| `glide-pull.mjs` · `glide-transform.mjs` · `glide-files.mjs` · `glide-to-r2.mjs` · `glide-documents.mjs` · `glide-visuals.mjs` | The legacy Glide migration, in order. `glide/README.md` and `glide/RECONCILIATION.md` are the canon; `glide/data/` is git-ignored customer data. |

### Measure

| Script | What it does |
|---|---|
| `ai-spend.mjs` | Prices the estate off `agent_usage_log`, read-only. COSTS.md is the write-up. |
| `measure-preamble.mjs` | Reproduces the assistant's preamble and makes **no model call**. |
| `query-bench.mjs` · `agent-routing-bench.mjs` · `kb-bench.mjs` + `kb-bench-questions.mjs` · `knowledge-retrieval-bench.mjs` · `defect-fixes-bench.mjs` | Benches. Several call a model: read the header before running one. |
| `i18n-gaps.mjs` | Which strings have no translation, per language. LANGUAGES.md explains what the number means. |
| `google-sweep.mjs` | Exercises the Google read doors by hand. The four singular ones (`/drive/file`, `/gmail/message`, `/calendar/event/transcript`, `/chat/spaces`) are reached from **here and nowhere else** — see `web/test/reachable-screens.test.ts`, which now says so. |

### Repairs you might need again

| Script | What it does |
|---|---|
| `repair-mangled-titles.mjs` | Google mangles some display names upstream; this repairs the rows. |
| `prune-unreadable-files.mjs` | Drops knowledge sources whose file could not be read. |
| `prune-empty-meetings.mjs` | Removes meetings a sync created with nothing in them. |
| `clear-mismatched-transcripts.mjs` | Clears transcripts attached to the wrong meeting. `workers/content/test/transcript-end-to-end.test.ts` names it. |
| `backfill-ticket-raisers.mjs` | Fills a ticket's raiser where the import left it null. |
| `i18n-seed-merge.mjs` | Folds hand-written translations into `shared/i18n-seed.ts`. The way a word gets into the app without spending on a model. |
| `i18n-translate.mjs` · `i18n-translate-workers-ai.mjs` | Fill missing translations. **`i18n-translate.mjs` spends the owner's own personal API key and has rate-limited his account. It is his to authorise and never a lane's to run.** |

## SPENT — one-offs that have already been run

Each fixed a specific mess in live data on a specific date. They are kept as the
record of what was done, not as tools. **Read before running.**

| Script | The mess it fixed |
|---|---|
| `backfill-refs-2026-09-01.mjs` | Put the new team-wide reference scheme (`T412`, `B188`, `S12`…) onto rows that predated it. |
| `fold-duplicate-google-sources.mjs` | Folded the headstone rows a re-share left behind. |
| `fold-cross-door-duplicates.mjs` | Retired knowledge sources that were a second door onto a record the base already held. |
| `retire-stranded-chat-echoes.mjs` | The same, for Chat echoes. |
| `rechunk-stale-passages.mjs` | Re-chunked passages left behind when the record they came from was mended. |
| `prune-foreign-db-growth.mjs` | Cleared size readings for databases that were never ours — the nightly watch had been listing every database on a shared account. |
| `owner-questions-check.mjs` | The two questions the owner asked on 1 Sep 2026 that the assistant could not answer. Kept because it is the shape of the R47 finding. |
| `verify-virtual-rows.mjs` | Seeded a throwaway dropdown category through the app's own door to prove virtual rows hold up against real data. |
| `verify-virtual-scroll.mjs` | The companion measurement. `COMPOSITION-MISMATCHES.md` cites it. |

## Lane verification shots (`lane-shots/`)

Screenshot rigs, each written to prove one change looked right at four widths in
both themes against real staging. Kept as the evidence for that change; three are
cited by name in `COMPOSITION-MISMATCHES.md`.

`shoot.mjs` and `shoot-staging.mjs` are the two rigs everything else drives;
`example-screens.mjs` + `my-screens.mjs` are the copy-me pair a lane starts from.
The rest — `contrast-probe`, `repro-sidebar-scroll-lock`, `verify-archive-band`,
`verify-brand-gallery`, `verify-checklist-todos-done`, `verify-empty-body`,
`verify-kit-collection-frame`, `verify-record-states`,
`verify-screen-shell-appshell`, `verify-stepper-hero`, `verify-tickets-kitpanel`
— are one-shot evidence. Six of them are 0.64–0.88 similar to each other, which
is what a set of copies of one rig looks like; folding them into `shoot.mjs`
plus a screen list is an open recommendation, not a decision anyone has made.

---

### Keeping this page honest

It is a hand-written index and it will drift if nobody looks at it. The census
behind it is reproducible in one pass — walk `scripts/`, then grep every tracked
`.json` / `.md` / `.mjs` / `.ts` / `.tsx` / config file for each script's
basename; anything with zero hits is unnamed by the repo. Add a script, add its
row. If a row here names a file that is gone, delete the row.
