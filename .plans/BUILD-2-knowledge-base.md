# Build 2 — the knowledge base, and the Google sources that feed it

**For a fresh agent with no prior context.** Everything you need is here or named
here. Read `CLAUDE.md` first, then this, then `SCOPE.html` on Google and the
assistant, then `MCP.md`.

This is the piece the agency's own team is most looking forward to. Today they
keep re-syncing things by hand into NotebookLM and Gemini notebooks, which cap
out and force a new notebook per project. The owner's words:

> *"What would also be really cool is if we had one centralised knowledge base,
> and it could dip into its own little compartmentalised vectorizations whenever
> it needs to. Essentially, we don't want to maintain one large knowledge base,
> and then it can organise itself into different apps and things like that on its
> own."*

And the hard constraint:

> *"We cannot do that after the app is already being used. It has to be ready and
> synced to the majority of our data before we go live."*

So this is **not** a post-launch nicety. It ships before the agency moves in.

---

## 0 · The rules you cannot break

- `CLAUDE.md` holds the Laws of the Base, R1–R37, **machine-checked**.
  `npm run check` must exit 0; a law without its check cannot ship.
- **Capture the real exit code**: `npm run check > /tmp/x.log 2>&1; echo $?`. A
  piped run reports the pipe's status, not npm's.
- **Every test proven to bite**: break it, watch it go red, restore, record the
  red output. Four tests recently passed while their bug was still present.
- **The agent has no privileges of its own.** It acts AS the signed-in user
  through the same gated endpoints and never exceeds their rights. There is no
  agent role. This applies to every knowledge-base tool you add.
- **`@kwapso/ui` is a separate repo.** Never edit it from here.
- **`glide/` is real customer data**, git-ignored throughout. Never commit it.
- **Stay lean.** A route on an existing worker beats a new worker; a column beats
  a table; a flag beats a code path.
- **R11**: every external call carries a fetch timeout. You will be making a lot
  of them.
- **R12**: anything on a cron records its failures.

## 1 · What it has to be

**One knowledge base, many compartments, chosen automatically.**

The owner does not want to maintain one enormous index, and he does not want to
create a notebook per project by hand. He wants a single thing that organises
itself — so that a question about Bergman's dispatch app searches Bergman's
dispatch material, and a question about the agency's own process searches the
agency's own.

The honest architecture for that: **one vector index, with compartments expressed
as metadata**, and retrieval that derives the compartment from the caller's
context (the account, the app, the ticket, the sprint they are looking at) rather
than from a menu. A compartment is not a separate index the user maintains — it
is a filter the system applies. Write down how you decided a question's
compartment; that reasoning is the product.

**It must be editable and it must be pretty.** The owner asked for *"robust and
instant syncing and editable beautiful looking rag knowledgebase"*. A source list
that can only be watched is not what was asked for: a person must be able to see
what the assistant knows, add to it, correct it, and remove something wrong —
through the library primitives (`@kwapso/ui`, `TabsView`, `FormShell`,
`CollectionHeading`) so it looks like the rest of the app.

**Answers cite their sources and admit ignorance.** Settled in SCOPE. An answer
with no source is a bug, not a style choice.

## 2 · What the agent must be able to do

The owner is explicit that the assistant is not just a reader:

> *"The agent should be able to, if I as a user have permissions to depend on the
> knowledge base, ask it questions and add or edit sources or remove sources. The
> agent should have that power too."*

So the knowledge base gets a `knowledge` module in the permission matrix
(`read` / `create` / `edit` / `delete`), and the agent gets tools for each,
gated by exactly those rights via `requireRight`. A person who cannot delete a
source cannot ask the assistant to delete one either.

**And then the point of it all:**

> *"Ideally the goal would be for us to give the agent a task. If the agent does
> not have enough context, it can dip into the knowledge base, extract data from
> there, and then perform bulk tasks, like ticketing triage or creating stories
> from tickets based on call transcripts."*

That is the acceptance test. Two concrete flows to build and demonstrate:

1. **Bulk triage.** "Triage everything that came in this week." The agent reads
   the untriaged tickets, retrieves what the knowledge base knows about each
   account and app, proposes a type and a rank for each, and **shows one confirm
   panel for the whole batch** before writing anything.
2. **Stories from a transcript.** "Turn Tuesday's call with Bergman into
   stories." The agent finds the Meet transcript, retrieves the app and process
   context, drafts stories against the right ticket, and confirms before writing.

Both are **bulk, destructive-adjacent writes** and both therefore hit the confirm
rule (`EDGE-CASES.md`, `shared/workers/confirm-payload.ts`): the panel shows the
body the door will receive, so what is approved is what happens. Read
`isPrivilegeWrite` and the fence-input derivation in
`shared/workers/tool-catalog.ts` — anything that widens what a client login can
see must confirm, derived from the fence's own inputs, never from a hand-kept
list.

## 3 · Where the material comes from

### In-app sources (build these first — no external dependency)

Tickets and their conversations, stories and closing notes, process maps and
their versions, learning articles, account records and their descriptions. These
are rows you already own, in team databases you already reach. They give you a
working knowledge base before a single Google credential is involved, and they
are how you prove retrieval works.

### Google (the owner wants all six live on day one)

From the briefing, all selected:

| Source | What it must do |
|---|---|
| **Calendar** | ~~Sprints and to-dos as events — **two-way**~~. **REVERSED BY THE OWNER, 18 August 2026**: *"just remember we want a one-way sync of whatever is in Google Calendar… anything in my calendar should be up to date here. That's all."* Kwapso now reads a diary and never writes one, and the write half that was built to satisfy the original instruction has been removed. The instruction this row recorded — *"it must be a two way sync.. changes in app affect google calendar and vice versa"* — is history, kept because it is why the write half existed at all. |
| **Drive** | A folder per account, auto-created |
| **Drive files** | Searchable in the app |
| **Gmail threads** | Searchable |
| **Chat spaces** | Searchable |
| **Meet transcripts** | Searchable — and they feed the story-drafting flow above |

Settled in SCOPE, do not re-decide:
- **Two connection layers**: personal OAuth (what a member can see) plus a
  service account (what the organisation can see). Which one a piece of material
  came through determines who may retrieve it.
- **Unmatched Gmail is never copied.** A thread that cannot be tied to an account
  does not enter the knowledge base.
- **Push where Google supports it, with a 15-minute sweep as the backstop.**
- **€50/month AI ceiling** on the whole assistant surface.
- **Google being down or an hour behind breaks nothing important** — the owner
  confirmed this. The app keeps working and catches up quietly. Build for that:
  ingestion is asynchronous, resumable, and never on the request path.

## 4 · The platform, and the one architectural decision you must make and justify

The stack is Cloudflare: Workers, per-team D1 over a REST door, R2, a Durable
Object for live channels, Workers AI already bound in `workers/data-ops`.

Ingestion is a different shape from everything else in this codebase — long
running, retryable, scheduled, and fanned out over thousands of documents. The
rest of the base is request/response.

**Decide, and write the decision into the code:**
- Does the knowledge base live as a `knowledge` module on `workers/content`
  (which already owns learning and tickets and binds R2), or does it earn a worker
  of its own? `CLAUDE.md` says prefer a route on an existing worker. Ingestion at
  this scale may genuinely earn one — argue it either way, but argue it.
- Vectors: Cloudflare Vectorize with metadata filtering is the obvious fit for
  "one index, many compartments". Confirm the current limits before you commit to
  it, and say what happens when a compartment outgrows them.
- Scheduling: cron, queues, or Workflows. Whatever you choose, **R12 applies** —
  a failed run records itself.
- **Tenancy is not negotiable.** Every vector, every chunk and every source row
  belongs to exactly one team, and retrieval can never cross that line. The
  per-team database model exists for this reason; do not put every team's vectors
  in one undifferentiated index and rely on a filter you wrote correctly today.

## 5 · The client portal

Default: **a client login never reaches the knowledge base.** It holds the
agency's internal material — call transcripts, internal mail, process notes — and
R21 now makes an unexplicit door a build failure.

Read `shared/workers/account-scope.ts` (`refusePortalCaller`) and the
`client-reachable-doors` check in `web/test/rules.test.ts`. Every knowledge door
must decide about portal callers *at the door*, not at the gateway allow-list —
that mistake has been made twice here and caught twice.

If a client-facing slice is ever wanted, it is a separate, deliberate feature
with its own fence. Not a flag on this one.

## 6 · The machine surface

The owner explicitly wants this on the external interface too. Every capability
you build must be reachable by an outside tool through MCP, drawing on **the same
gated code path** as the UI — same endpoint, same function, permission re-checked.
That is what `interface_lessness_meter` measures, and the base currently scores 93
of 100 with 87 doors and zero silent ones.

- One declaration, two projections: `shared/workers/tool-catalog.ts`.
- **R19**: a tool on a list door exposes and forwards every filter that door
  parses.
- **R9**: the assistant's capability brief is generated from the catalogue and the
  glossary, so the UI and the assistant can never disagree about what the app can
  do. A new module means a new entry, not a new sentence.
- Cost model (`MCP.md`): reads and exports are free endpoint hits; only the
  assistant's own turns draw the team's AI quota. Say which side each new tool
  falls on.

## 7 · Sequence

1. **The module and its permissions** — `knowledge` in the matrix, the doors, the
   fences, R21 satisfied from the first commit.
2. **Sources and chunks from in-app rows** — tickets, stories, articles, process
   maps. Prove retrieval works with no external dependency.
3. **The screens** — a source list that is genuinely editable, through the library
   primitives, with Overview + Activity tabs (R2) and a real count (R16).
4. **Retrieval with citations**, and compartment selection derived from context.
5. **The agent's four tools** — ask, add, edit, remove — each gated by the module
   right, each with the confirm rule where it writes.
6. **Google: the connector layer** — both connection types, token storage, the
   sweep, R11 timeouts, R12 failure recording.
7. **The six Google sources**, in the owner's order of value: Meet transcripts and
   Drive first (they feed the story-drafting flow), then Gmail, Chat, Calendar
   (~~two-way~~ one-way — see the table above), Drive folder auto-creation.
8. **The two bulk flows** — triage, and stories from a transcript.
9. **The backfill** — ingest the agency's real history so the knowledge base is
   *already useful* on the day they move in. This is the constraint that makes
   everything above pointless if skipped.

## 8 · What "done" looks like

- `npm run check` exits 0, every new law carrying its check.
- A member asks a question in the assistant and gets an answer **with sources**,
  drawn from the right compartment without being told which.
- The same question, asked through MCP by an outside tool, hits the same function
  and returns the same answer under the same permissions.
- A member without `knowledge:delete` cannot remove a source, and cannot ask the
  assistant to remove one either.
- A client login cannot reach any of it, proved by the R21 check rather than by
  inspection.
- Both bulk flows run end to end and **confirm before writing**.
- Google going down mid-sync loses nothing and recovers on its own.
- The quality gates: `lean_mean_check` ≥ 94, `interface_lessness_meter` ≥ 94,
  `security_sentry` no critical or high.

## 9 · Report back with

The architectural decision from §4 and the argument for it; the diff per step;
every test with its **sabotage-verified red output**; the retrieval quality you
actually measured (not an impression); what the backfill cost in time and in AI
spend against the €50/month ceiling; and anything in this document that turned out
to be wrong when you read the code — it was written from the owner's answers and
from source, and either can be stale.
