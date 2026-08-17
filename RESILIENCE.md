# RESILIENCE.md — the bad day

Every other doc here describes the system working. This one describes it not
working, and it answers three questions the rest of the canon never asks out
loud:

1. **What falls over when one worker does?**
2. **Who owns a fact, when more than one worker can write it?**
3. **How do the rows come back?**

Written 2026-08-14 out of an architecture review. Nothing here changes a locked
decision in [ARCHITECTURE.md](ARCHITECTURE.md) — it writes down consequences the
locked shape already has.

---

## 1 · Blast radius — auth is the single point of failure

**Say it plainly: `kwapso-auth` is depended on by seven of the eight workers.**
Every other worker service-binds it, because every gated request begins by asking
one question — *who is this?* — and there is exactly one master that can answer
(ARCHITECTURE §3: one session system, no auth vendor).

```
                        gateway ─┐                    portal-gateway ─┐
                                 │                                    │
   tenancy ─┐   content ─┐   data-ops ─┐   mcp ─┐   realtime ─┐       │
            └────────────┴─────────────┴────────┴─────────────┴───────┘
                                    ▼
                              kwapso-auth          fan-in 7 of 8
                                    │
                                    ▼
                            kwapso-realtime        fan-in 6 of 8
```

### The worst case, stated

> **If `kwapso-auth` is down, seven of the eight workers stop serving anything
> gated.** Both front doors still answer — the screens load from static assets,
> and cached screens still paint — but every API call behind them returns
> `503 auth_unavailable`, and the user sees an app that renders and cannot do
> anything. Sign-in is also unavailable, so nobody can get in behind them.

This is a deliberate consequence of "one session system, one master", not an
oversight. It is written here so it is a known cost rather than a discovery.

### What softens it, and what does not

| | |
|---|---|
| **A ceiling on the wait** | `AUTH_UNAVAILABLE_MS` (5s) in `shared/workers/gating.ts`. A slow auth degrades the request that hit it, not the worker behind it. Without a ceiling one unwell worker fills five others' queues, and the outage spreads by waiting. |
| **An honest code** | An auth outage throws `503 auth_unavailable`, never `null`. `null` means "not signed in", and callers turn that into a 401 that signs somebody out — so an outage that returned `null` would log every signed-in person out of a healthy app and send them all back to the door that is already struggling. |
| **No fallback identity — on purpose** | There is no cached session, no "assume signed in". Guessing on the identity read is guessing on the gate, and the permission spine is the product. Availability is not bought with a weaker fence. |
| **Realtime degrades, it does not fail** | `kwapso-realtime` has fan-in 6 and is the one dependency that is genuinely optional. `publishChange` is wrapped, capped at 2s, and swallows its own failure: a live-layer outage costs a screen its instant refresh and nothing else, because the write already committed and the client is cache-first ([CACHING.md](CACHING.md)). Same for member-notification email (`sendBrandedEmail`, 15s cap) — ARCHITECTURE §5 already locks the state change as the authority. |

### The recommendation this review did NOT act on

A read-through identity cache in the gating seam — a short-lived signed copy of
`/api/auth/me` — would let already-signed-in people keep working through an auth
outage. It is **not** built, because it is a change to how the permission spine
decides, and that is an owner's decision, not a reviewer's. The cost of leaving
it: an auth deploy that goes wrong is a total outage rather than a degraded one.

---

## 2 · Who owns a fact

Two components that can both write the same fact will eventually disagree about
it, and no log will explain why. Three tables in this codebase are written from
more than one worker in production. **None of them is a shared field** — each is
a clean split that nothing had written down until now.

| table | owner | the other writer | the split |
|---|---|---|---|
| `users` (core) | **auth** | tenancy | auth owns IDENTITY — the row itself, `email`, and the profile fields. tenancy writes exactly one column, `current_team_id`, because "which team is this person looking at" is a tenancy fact that happens to live on an auth-owned row. Pinned by `workers/tenancy/test/ownership.test.ts`. |
| `selectable_data` (team) | **tenancy** | content | tenancy owns the vocabulary — the Dropdown values screen creates, edits and deactivates. content only ever INSERTs a value that is absent, through the one pick-or-create seam (`ensureSelectableValue`), and never updates or deactivates one. A retired value stays retired. |
| `error_logs` (core) | **shared seam** | data-ops | `logError` is the only thing that ever INSERTs. data-ops' admin door only ever UPDATEs the resolution columns (`status`, `resolved_at`, `resolution_note`). Disjoint columns: the appender and the resolver cannot contradict each other. |

Everything else the probes flag is a false positive worth knowing about: the
`help`, `knowledge_*` and `sprints` writes attributed to tenancy are
`TEAM_MIGRATIONS` SQL in `workers/tenancy/src/team-schema.ts`. Tenancy owns
rolling team schema forward; that IS its job, and a migration is not a runtime
writer.

**If you add a second writer to a table, add a row above.** A split nobody wrote
down is a split the next person will not preserve.

---

## 3 · Live data can be recovered

### What is stateful

| store | holds | recoverable by |
|---|---|---|
| `kwapso-core` (D1) | users, teams, team_members, invites, mcp_tokens, error_logs | dump + Time Travel |
| one D1 **per team** | that team's everything: roles, permissions, tickets, work engine, knowledge, accounts, activity | dump + Time Travel, **per team** |
| R2 buckets (4) | uploaded media, ticket attachments, the agency's own files, and the legacy article media nothing writes to any more | object-by-object dump — **no Time Travel**, so the last run is the only copy |
| Vectorize index | knowledge embeddings | **derived** — rebuilt from the team databases |
| Durable Objects | open WebSockets | **nothing to recover** — holds no app data (ARCHITECTURE §2) |

### Taking a backup

```bash
node scripts/backup.mjs production
```

Read-only, refuses to run unless `CLOUDFLARE_ACCOUNT_ID` names this project's
account, and dumps the core database plus **every team database core points at**.
Each dump is read back and must contain real statements before it counts — a
zero-byte file in a backup folder is the most expensive kind of success. A
`manifest.json` lands beside the dumps listing what was captured and what was
not.

### Restoring

**Two paths. Reach for the first one first.**

**a · Time Travel — a database that still exists, inside 30 days.** The fastest
and the one to use for "the migration went wrong an hour ago".

```bash
npx wrangler d1 time-travel restore <database-name> --timestamp <ISO-8601>
```

**b · A dump — a database that is gone, or damage older than 30 days.**

```bash
npx wrangler d1 create <database-name>
npx wrangler d1 execute <database-name> --remote --file backups/<folder>/<database>.sql -y
```

**Per-tenant restore is the normal case, not a special one.** Because each team
has its own database, one team's rows come back without touching anybody else's:
restore that team's database and nothing about any other team moves. This is the
per-team-database decision (ARCHITECTURE §1) paying out on the bad day. If the
team database is recreated rather than restored in place, update
`teams.database_id` in core to the new id — that pointer is what the gating seam
resolves.

### What is NOT backed up, and what that costs

- ~~**R2 buckets.**~~ **Now covered** — `scripts/backup.mjs` copies every object
  in every bucket this environment owns, alongside the database dumps. R2 still
  has no equivalent of Time Travel, so the backup is the only copy: a bucket
  deleted between two runs is gone for the window between them.

  Two properties worth knowing before you trust it. The **bucket is the
  inventory**, not the database — every object is copied whether or not a row
  names it, because a key nobody references is usually an upload whose form was
  abandoned, and guessing from six upload routes' columns was how the first
  attempt would have quietly missed files. The databases are the **cross-check**:
  a row naming a key the bucket does not hold is reported as a failure, and that
  file was already lost before the backup ran. And a bucket the account holds
  that no config covers **fails the run** rather than being skipped, because a
  backup that reports success while incomplete is worse than none.
  `web/test/backup-covers-r2.test.ts` derives both halves from the source.
- **Secrets.** `RESEND_API_KEY`, `GOOGLE_CLIENT_*`, `GOOGLE_CONNECT_*`,
  `GOOGLE_TOKEN_KEY`, `CF_D1_TOKEN`, `INTERNAL_KEY`. Re-set from the owner's
  password manager per [OPERATIONS.md](OPERATIONS.md). **`GOOGLE_TOKEN_KEY` is
  the one that cannot be re-issued**: it decrypts stored Google refresh tokens,
  so losing it means every connected person reconnects.
- **The Vectorize index.** Derived. The knowledge sweep re-embeds from the team
  databases; the cost is model calls and a delay, not data.

### When the restore was last tested

> **2026-08-14 — rehearsed, partially.** All 20 core migrations were replayed
> into a scratch SQLite database, filled with rows, dumped, and reloaded into an
> empty database. Verified: 18 tables, 44 indexes and every row survived the
> round trip, byte-identical values included. **What this did NOT test:** the
> `wrangler d1 export` / `--remote` half against live Cloudflare, and Time Travel.
> Those need a real environment and are the next rehearsal.

**An untested restore is not a restore.** Re-run the rehearsal against staging
after any migration that changes a table's shape, and update the date above.
