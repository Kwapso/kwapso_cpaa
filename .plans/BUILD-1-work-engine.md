# Build 1 — the work engine

**For a fresh agent with no prior context.** Everything you need is here or named
here. Read `CLAUDE.md` first, then this, then `SCOPE.html` chapters 2–7.

This is **the spine of the agency app**. It is what the owner and his team will
live in every day, and it is what fills the client portal with something worth
logging in for. Nothing else in the product matters if this is wrong.

---

## 0 · The rules you cannot break

- `CLAUDE.md` holds the Laws of the Base, R1–R29. They are **machine-checked**:
  `npm run check` must exit 0, and a law without its check cannot ship
  (`registry-integrity`).
- **Capture the real exit code.** `npm run check | tail` reports the *pipe's*
  status. Use `npm run check > /tmp/x.log 2>&1; echo $?`.
- **Every test must be proven to bite.** Break the thing, watch the test go RED,
  restore it, and record the red output. In one recent session four tests passed
  while their bug was still present. Assume your first test is wrong.
- **The UI library is a separate repo.** `@kwapso/ui` is lego. Never edit it from
  here; if a primitive needs changing, say so.
- **Deactivate, never delete.** Data and audit survive.
- **Write through the gated doors.** Never raw SQL from a script, never a direct
  D1 write outside the worker's own data layer.
- **`glide/` is real customer data** — `glide/data/`, `glide/files/`,
  `glide/normalised.json`, `glide/r2-manifest.json` are all git-ignored. Never
  commit one. Never paste customer content into a commit message.
- **Stay lean.** "Too much code is a defect." A route on an existing worker, not
  a new worker. A column, not a table. A recipe, not a bespoke screen.

## 1 · The one decision that shapes everything

**The module is already called Tickets. There is ONE of it. Your job is to
extend it — types, states, triage, stories, reference numbers — not to build a
second one beside it.**

There was never a Help section *and* a ticket section. There was one module
wearing the wrong name, and the rename shipped on 11 Aug 2026. What a person sees
now says **Tickets** everywhere: the sidebar, the heading, the breadcrumb, the
address (`/tickets`, `/t/<teamId>/tickets/<id>` in the agency app,
`/tickets` in the portal), the dropdown vocabulary (`Ticket type`,
`Ticket status`) and the glossary. The portal says the same word the agency does —
one dictionary, both front doors (Law R6).

**Underneath, the name is still `help`, on purpose.** Do not "finish the rename"
by changing these; each is a data migration whose only possible outcome is
breaking something:

| Still `help` | Why it stays |
|---|---|
| the permission module key (`help:read/create/edit/delete`) | it is the string sitting in `role_permissions` in every team database — renaming it can only take somebody's access away |
| the tables `help` + `help_threads`, and `activity.related_table = 'help'` | renaming orphans every activity row already written about a ticket |
| the API paths `/api/content/help*` | they are `PORTAL_DOORS` entries, `PORTAL_VISIBLE_READS/WRITES` keys and R21's derivation input |
| the MCP tool names (`list_help_tickets`, `create_help_ticket`, …) | a published external contract — outside clients call these by name |

`web/lib/screens.ts` `MODULE_PERMISSION` is the ONE seam where the two names
meet (`tickets: "help"`), and `web/test/nav.test.ts` fails if it is removed —
without it the whole section renders NotFound.

The reasoning behind extending rather than starting fresh, so you do not
relitigate it: `workers/content/src/lib/help.ts` already holds a ticket, a
threaded conversation, a status lifecycle, an account fence, live updates, an
activity trail and a client-portal screen — all built and tested. A second ticket
means a second one of each of those, forever, plus two things called a ticket in
every conversation anyone has about this product.

So: **extend it.** Keep the existing rows working. Add the work engine's
vocabulary on top — the four types, the five states, drag-rank, triage, the
reference number, and the stories that hang off a ticket (§2 onward).

The client portal is **not** a separate application. `web-portal/` lives in this
repository, is served by `workers/portal-gateway`, and reads the *same rows* as
the agency app through the same content worker. Two permission-gated views, never
copies, never synced.

## 2 · The four nouns

The owner chose four kinds of work. Get the words exactly right — they go in
`shared/glossary.ts` (Law R6) and every screen uses them.

| Noun | What it is | Who raises it |
|---|---|---|
| **Ticket** | Something an account asks us for | The client, or us on their behalf |
| **Story** | A piece of work we do | Us, usually off a ticket |
| **To-do** | Something we are waiting on the CLIENT for | Us, aimed at them |
| **Task** | Our own internal admin | Us, for us |

The owner's own test: *"Aurora spends forty minutes writing kwapso's own quarterly
VAT return"* → a **task**. *"Marta at Bergman still hasn't sent us her brand logo
and we can't finish without it"* → a **to-do**.

### Ticket

- **Types:** Feedback, Bug, Question, Extra. (From SCOPE. Nothing else.)
- **States:** New → Triaged → In progress → Ready → Resolved.
- The account owns **New only**. The first staff touch locks the wording — a
  client can edit their own ticket *while it is still New*, and not after.
- **Comments stay open at every state.** Archive is available from any state.
- **No assignee and no due date on a ticket.** It derives its picture from its
  stories. This is deliberate — do not add them.
- **Drag-rank is the only priority signal.** There is no priority dropdown. A
  client may re-rank *their own company's* tickets.
- "Planned for sprint 4" is a **note in the portal**, never a state.
- Ticket flips to **Ready exactly once**, when the last of its stories closes.
  That transition is idempotent (R17): the current-status predicate rides the
  UPDATE, and zero rows moved means no activity row and no ping.
- **Reopening:** the client comments; a staff member decides whether to reopen or
  raise a new ticket. There is no client-side reopen button.

### Story

Fields, from SCOPE, and this list is the spec:
`ref, ticket?, app?, process?, step?, sprint_id, assignee, due dates, reviewer?,
status, closing_note`.

- **Stories have NO type.** The owner settled this explicitly: the ticket carries
  the type, and the process step carries the classification that matters. Do not
  add one, and do not inherit Glide's Fix/Feature/Change.
- **States:** Open, In progress, In review, Done. (The review step is deliberate.)
- **The only place assignees and dates live.** Anywhere else is a bug.
- **A story cannot close without naming the process step it changes, or
  explicitly saying it changes none.** Required. This is the hook the savings
  maths hangs off later — do not make it optional "for now".
- Closing a story is a **transaction** with the ticket's Ready flip.

### To-do

- Aimed at the client. They can **complete it and upload a file against it** from
  the portal.
- Carries a reference number.
- **A to-do is one of only two things that emails the client** (§7).
- **No work log ever attaches to a to-do** — it is somebody else's time, not ours.

### Task

- kwapso's own internal admin.
- Work logs DO attach to tasks.
- At import, Glide's 3,677 "tasks" are **split by their department tag** into our
  stories and our tasks. See §10.

## 3 · Apps, processes and sprints

- **App = the built system** — the thing with a URL and a stage, the way Glide has
  it today. Not the goal. Bergman wanting dispatch fixed, served by a driver app
  and a back-office screen, is **two Apps**.
- **A sprint belongs to one app or goal.** An account can have several sprints
  running at once, as it does today.
- **Sprint types:** Planning, Implementation, Iteration. A "blueprint" is a priced
  planning sprint — not a fourth type.
- A sprint row carries `sold_price` + currency (flat prices live here).
- **Version cut:** automatically when a sprint completes, plus a manual button.

## 4 · Reference numbers

- **Per account**, not global. The owner accepts that Glide's numbers will not
  survive the import. (Glide's are global today and fully interleaved — CONFIA
  runs 61–3447 while Padelbase runs 721–3444 — so continuity was never available.)
- Carried by: **tickets, stories, tasks, to-dos, sprints**, and the account's own
  short code.
- Format follows SCOPE: `BERG-T0412`, `BERG-S0188`.
- **The client quotes it.** It goes on every email we send them.
- Allocation must be **race-safe** (`CONCURRENCY.md`): two simultaneous tickets on
  one account must never take the same number. The counter rides the write; do not
  read-then-write.

## 5 · Work logs and timers

**The owner named "logging time takes too many clicks" as the single thing most
likely to make him quietly abandon this and go back to a spreadsheet.** Treat one
click as the acceptance bar, not an aspiration.

- **A work log attaches to a story, a ticket, or a task. Nothing else.** Not a
  to-do (someone else's time). Not an account on its own — the owner was explicit
  that an account-level-only log must not exist.
- **Time spent reading, triaging and resolving a ticket must be loggable against
  that ticket.** This is why tickets are in the list at all; do not drop it.
- One click to start. Whole seconds. **Manual entry always available.**
- A running timer appears in the header of **every** screen, and clicking it
  returns to what it is timing.
- **Parallel timers on different targets are allowed.** The same person on the
  same target twice is blocked. Auto-stop is a per-user setting, off by default.
- **Billable is a plain switch on each log, on by default.**
- **Runaway timers:** never auto-stop. Somebody starts one on Friday and goes
  home; on Monday offer one-tap fixes — stop it at 5pm, bin it, or keep the whole
  thing. (Real data: 6 of 2,940 Glide logs ran past 8 hours, longest 22.6h. Rare
  but real — worth the Monday prompt, not worth machinery.)
- Log edits are permission-based and **always leave a trail**.
- A weekly nudge for missing time.

## 6 · Triage

- **One named person is on triage duty, and it is visible whose week it is.**
- A ticket sitting in New for three days appears on a **needs-triage list** and in
  the **morning digest**. Internal nudge only — nothing client-facing, no SLA
  promise.

## 7 · The client's half

The portal is not a lesser copy of the agency app. It is the same rows, fenced.

**A contact sees their whole company's requests** — every request their colleagues
raise, not only their own. This shipped today; `workers/content/src/lib/help.ts`
carries `account_id` on the ticket and the fence is `accountScopeClause`. Build on
it; do not invent a second rule.

What a contact sees:
- Their company's tickets, in full, with the conversation.
- **Stories as a COUNT only** — "3 pieces of work, 1 done". Never the titles.
- **Sprints as a named block with dates** — it is what they bought.
- Money: **value for everyone; what they bought only for accounts where the owner
  switches it on.** Internal rates and margin never render in the portal under any
  flag, ever.

What a contact can DO:
- Raise a ticket.
- Edit their own ticket **while it is New**.
- Re-rank their company's tickets.
- Comment on any ticket at any state.
- Complete a to-do and upload a file against it.
- Comment on a process map.

**What a contact never sees: which staff member is doing the work** (SCOPE ch.06).
This is defended at the door, not at the gateway allow-list — see R21 and
`refusePortalCaller`.

**Email:** only **ticket resolutions** and **to-dos**. Nothing else emails the
client; everything else lives in the portal for them to look at.

## 8 · Language

- Keep **both** title fields (German and English). Each account sees their own
  language in the portal.
- **Add an AI translate button on each non-English ticket** that translates and
  *sets* the translated text (not a hover preview). It runs through the existing
  agent quota seam — read `MCP.md` on the cost model before wiring it.
- 1,764 tickets have a German title, 1,010 English, 788 exist **only** in German.
  Carry the original; never overwrite it with a translation.

## 9 · Glossary and naming

`shared/glossary.ts` is the single source of product terms (Law R6) and it
already says **Ticket** (rewritten with the rename) but has **no word** for story, sprint, work log, timer, triage, engagement
type, to-do or App. SCOPE ch.02 defines all of them. **Port ch.02 into the
glossary rather than inventing anything.**

Words SCOPE has retired — do not reintroduce them: *epic* (say App), *project*
(App, Sprint or Account), *work item* (Ticket or Story), *saga* (background job),
*phase* (dead, confirmed three times), *engagement as an object* (only ever
engagement type, a label).

## 10 · What comes from Glide

`glide/normalised.json` already holds the mapped history (produced by
`scripts/glide-transform.mjs`). Read `glide/RECONCILIATION.md`, but **trust the
data over the doc** — reading the real rows corrected it in seven places:

1. **Only 20 of 3,677 tasks link to a ticket.** 3,231 link to an *app*. The doc
   says tasks hang off tickets; at scale they do not.
2. **89% of logged time (2,605 of 2,940) attaches to nothing smaller than an app.**
   Our model requires a story, ticket or task — that is a real change of habit and
   the import must decide a home for each, not silently drop them.
3. **Tickets have no status column.** What looks like status is the *type*. Open
   vs resolved is a flag plus a date: 1,486 resolved, 334 open.
4. **The account code (CONFIA, Padelbase) lives on the ticket, not the customer.**
5. **103 people, not 96.** Eight contacts carry `"-"` as their email; de-duplicating
   on the raw value merges eight different people into one.
6. **Comments attach to tickets too** — 286 of 1,147. Those belong in the existing
   `help_threads` today, not in a future module.
7. Only 81 of 104 contacts name a company; 23 have no parent.

The owner wants **all of it** — twelve thousand rows, two years. Deferred tables
with no home today are listed in `normalised.json` under `deferred`.

## 11 · The order to build in

1. **Glossary first** (§9). Every screen and column name depends on it.
2. **Extend the ticket** (the `help` table): types, the five states, the ranking, `account_id`
   (already there), the reference number.
3. **Stories**, with the sprint link and the required process-step-on-close.
4. **The ticket↔story transaction**: Ready flips exactly once, idempotently (R17).
5. **Work logs**, with the one-click bar and the header timer.
6. **To-dos and tasks.**
7. **Triage duty, the needs-triage list, the morning digest.**
8. **The portal half** — counts, sprint blocks, the six client actions.
9. **The two emails.**
10. **The translate button.**

Ship each step green. Do not build all ten and then test.

## 12 · The laws this build will trip, and how

- **R1** every mutation publishes a live change → `publishChange`, row-level.
- **R10** every non-GET route opens with a permission gate.
- **R20** every body field through `shared/workers/validate.ts`, **positionally** —
  a cast is not a check.
- **R14** every list capped, and a GROWING collection (tickets, stories, work logs
  all grow) must **page by key**: opaque cursor, exact total, `hasMore`, through
  `pagedJson`, with a client that can reach page two.
- **R15** every published resource reaches a listener, via
  `web/lib/live-resources.ts` or `PORTAL_LISTENERS`. Note the portal's ticket pings
  were silently dead until today — a resource must be in
  `SCOPE_STAMPED_RESOURCES` and carry its account on the event, or the fence
  discards it.
- **R16** exact server COUNT through the one `formatCount` seam, shown once.
- **R17** state transitions idempotent — this bites hard on the Ready flip.
- **R18** activity feeds subtract denied modules; every `relatedTable` resolves
  through `ACTIVITY_GATE_MAP`.
- **R21** *(new today)* any door a client login can reach at the AGENCY origin
  must decide about portal callers explicitly. Read `refusePortalCaller` and the
  `client-reachable-doors` check in `web/test/rules.test.ts` before adding routes.
- **R2/R3/R4/R8** record detail = `TabsView` + `ActivityFeed`; no hand-rolled tab
  strips; every form through `FormShell`.
- **R9/R19** the agent and MCP see every new capability, with every door filter
  exposed and forwarded, and a confirm panel on anything that widens what a client
  can see (the fence-input derivation in `shared/workers/tool-catalog.ts`).

## 13 · What "done" looks like

- `npm run check` exits 0, with every new law carrying its own check.
- The staging seed (`scripts/seed-staging.mjs`) fills the new nouns from
  `glide/normalised.json` and its fence self-check still passes.
- A person can: raise a ticket in the portal, see it triaged, watch stories appear
  as a count, and read the resolution — while a contact at another company sees
  none of it.
- A staff member can log time in one click from any screen.
- The quality gates: `lean_mean_check` ≥ 94, `story_checks_out` clean,
  `security_sentry` no critical or high.

## 14 · Report back with

The diff summary per step; every test and its **sabotage-verified red output**;
anything in this document you found to be wrong when you read the code (say so —
this document was written from answers and source, and either can be stale); and
the final `npm run check` exit code and test total.
