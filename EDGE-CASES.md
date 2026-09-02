# Edge cases + gotchas

The non-obvious traps in this base, the places where the obvious change is the
wrong one. Each entry is **the trap → why it exists → the rule to follow**, with
the file that proves it. Read this before you touch navigation, the client
cache, the per-team data door, the agent, or a deploy. If you find yourself
"simplifying" something below, stop: most of these are load-bearing.

The canon lives in [ARCHITECTURE.md](ARCHITECTURE.md), [CACHING.md](CACHING.md),
[CONCURRENCY.md](CONCURRENCY.md), and [RULES.md](RULES.md). This file is the
field guide to the sharp edges those decisions leave behind.

---

## 1 · The static-export SPA: ONE shell, all navigation soft (no reload in-app)

**The trap.** The Kwapso System ships as a Next.js **static export** (`web/out`, served by
the gateway) with **no service worker**. In a static export the framework router
has no data file for an arbitrary deep path, so a `router.push` to one is a
**full-page reload** (session re-check, every screen refetches, the in-memory
cache is wiped). Reach for `router.push` to move between app screens and you tear
the whole SPA, a running agent included, down.

**Why it's a non-issue now.** The **entire post-auth app is ONE client-resolved
shell**, `deep-link-screen.tsx` mounts once and never unmounts, and it resolves
*every* app URL from `window.location`: the team tree `/t/**`, the sidebar pages
(`/accounts`, `/tickets`, `/knowledge`, the work-engine screens, …), AND the
account screens `/home` + `/settings` +
`/invitations` (each renders `<DeepLinkScreen/>` and is dispatched to a screen
component. `ACCOUNT_MODULES` in `deep-link/route.ts`). So there is no cross-route
boundary left to cross *inside the app*. Only the **pre-auth** routes (`/login`,
`/onboarding`) sit outside the shell, entering or leaving the app is the one real
navigation, and a reload there is fine (one-time).

**The rule.** In-app navigation goes through the **History API**, never the
router. `go()` in `deep-link-screen.tsx` pushes state for any `isInAppPath` (the
whole `/t/*` tree + every `TOP_LEVEL_MODULES` entry in
`web/components/deep-link/route.ts`. Read the list there, this sentence would
only be a copy that drifts) and swaps the screen from local `route`
state; the
segment never changes, so nothing reloads. Deep components that can't reach `go()`
(the profile menu, team switcher, invite inbox) call **`softNavigate`** from
`web/lib/nav.ts`, the shell registers its `go()` there on mount (`registerHostGo`),
so those links are soft too. The shell subscribes to `popstate` so Back/Forward
re-read the URL and re-render in place.

**Consequences of the one-shell model:**
- **Team-switch from Settings no longer reloads.** `/settings` is in the shell now,
  so `switchTeam` + a soft `go('/t/<newTeam>')` stays in place.
- **Agent screen-tracing drives from ANYWHERE.** Because crossing into `/t` is now
  soft, the trace engine (`screen-trace.tsx`) always hands its target to the shell,
  which `go()`s there, the old "narrate off-host because a reload would kill the
  agent" branch is gone.
- **The one-shell is the machine-checked invariant.** No in-app link may use
  `router.push` (that was the reload); the account modules must each render a screen.

**AND THE SHELL ONLY GETS SERVED IF THE WORKER RUNS.** The half of this trap that
lives in configuration, found on 2026-08-17 when a tester said sharing a ticket
link "fails to load". `workers/gateway/src/index.ts` serves the right shell for any
depth under `/t/*` and under every module in `SHELL_MODULES`, and always had. But
`assets.run_worker_first` in `workers/gateway/wrangler.jsonc` is an **ARRAY**, and an
array means every path NOT listed **skips the Worker entirely** and is answered by
the asset layer, which with `not_found_handling: "404-page"` is a 404. That array
read `["/api/*", "/media/*", "/t/*", "/learning/*", "/help/*", "/mcp"]`, and
NEITHER of the two module prefixes in it was a URL segment any more: `/help/*`
stopped being one when the section was renamed to `tickets`, and `/learning/*`
went with the module itself. So `/tickets/<id>`, `/stories/<id>`, `/tasks/<id>`
and eleven more 404'd on a shared link or a reload, while
`/t/<team>/tickets/<id>` worked perfectly, which is why it read as random rather
than as one bug.

Neither half looks wrong alone: the loop looks complete, the array looks like a
deliberate short list. And `web/test/nav.test.ts` had checked the loop against
`TEAM_SECTIONS` since the pages shipped, going green the whole time, **a passing
test about one half of a two-part contract reads as coverage of the whole.**
`workers/gateway/test/shell-routing.test.ts` now derives the required prefixes from
`SHELL_MODULES` and fails if the config disagrees, in **every** environment (wrangler
envs do not inherit an `assets` block). **Adding a top-level module page is two
edits, not one.**

**version-watch heals the stale tab, it doesn't prevent reloads.** Because there
is no service worker, a long-lived tab holds the **old shell + its hashed
chunks** across a deploy. `web/components/version-watch.tsx` handles the two
failure modes: (1) a `ChunkLoadError` from a now-missing chunk → reload **once**
(a `sessionStorage` timestamp, `version_watch_reloaded_at`, and a 30-second
cooldown stop a reload loop); (2) on focus/return, fetch `/` and compare the
`main-app-<hash>.js` fingerprint, if it moved, offer a **gentle "reload" toast**,
never a surprise reload mid-task. Don't mistake this for cache-busting: it heals
an *already-stale* tab; it does not make cross-route navigation soft.

**…and (1) arrives through the ErrorBoundary, not through `window.onerror`.**
Fixed 2026-08-18, and the trap is worth stating because the code looked right for
months. A missing chunk almost always belongs to a **lazy route**: React consumes
the rejected import and re-throws it in the RENDER phase, which dispatches
neither `error` nor `unhandledrejection` — so version-watch's own two listeners
never heard the failure they exist for, and `web/components/error-boundary.tsx`
showed a crash card reading "Loading chunk 67631 failed." at a manager. The heal
is therefore invited in from `componentDidCatch` (`healStaleShell`, exported from
version-watch, one seam, one cooldown), and the boundary renders "A new version
of the app is ready." instead of the stack for that one class. The window
listeners stay: a bare `import()` in an event handler does reach them. Locked by
`web/test/stale-shell-heals.test.tsx`. **The client portal has no version-watch
at all** — the same stale tab there still ends at a crash card (UI-GAPS).

**The AI co-pilot is mounted at the ROOT, and its open state persists.** The
assistant panel is the one surface that spans *all* screens, so it lives in a single
root-mounted host (`web/components/agent-host.tsx`, rendered once in
`app/layout.tsx`), **not** inside any per-route `AppShell`. Root-mounting is what
carries it across *soft* navigation, which since the one-shell re-architecture is
**all** in-app navigation, crossing into `/t` from a top-level route no longer
reloads anything. (This paragraph used to open "must survive this reload" and assert
that the crossing *was* a hard reload, citing the section above it, which by then
said the opposite, as do the two bullets below. The `sessionStorage` mirror it
described is still there and still earns its place; what changed is *why*.) The
panel's open flag is **mirrored to `sessionStorage`** (`web/lib/agent-open.ts`) for
the two events that genuinely still wipe in-memory state, a real page refresh (F5)
and a `version-watch` chunk reload, after which the host reopens the panel and
`useAgentChat` resumes the saved thread, so the conversation survives even though
the live stream was cut. Two consequences to respect:
- **The screen-trace always soft-drives (one shell), never `router.push`es.** The
  engine (`web/lib/screen-trace.tsx`) hands its target to the shell, which `go()`s
  there via the History API from any screen, no reload. (Before the one-shell
  re-architecture, crossing into `/t` from a top-level route was a hard reload, so
  the trace had to narrate off-host instead; that's gone.) No in-app `router.push`
  is locked out by `web/test/agent-host.test.ts`.
- **The open state still mirrors to `sessionStorage`.** In-app nav no longer
  reloads, so the panel survives it just by being root-mounted. The
  `sessionStorage` mirror (`web/lib/agent-open.ts`) now only matters for a genuine
  page refresh (F5) or a `version-watch` chunk reload, it reopens the panel and
  `useAgentChat` resumes the saved thread.
- **The session cache is reactive.** `useActiveTeam` holds the session in a
  pub-sub'd module cache, so a component mounted *before* login (the root host)
  picks up the session the instant another instance logs in / creates a team,
  without it, the launcher only appeared after a manual reload.

---

## 2 · The list cache doubles as the detail data source

**The trap.** A record-detail screen has no "get one record" fetch. It reads the
one record **out of the cached list**. So if you trim a column out of a list
`SELECT` to make the list "lean," you can silently blank a field on the detail
screen (or the agent's reading copy).

**Why.** The client cache is keyed by collection (`help:<teamId>`,
`members:<teamId>`, …). A detail screen subscribes to that **same key**
and `.find()`s its row, so the first tap paints instantly from the warm list
cache, and a row-level live patch updates detail and list together. From
`web/components/help-detail.tsx`:

```ts
const ticketsQ = useCached<HelpTicket[]>(`help:${teamId}`, () =>
  content.help("all").then((r) => r.tickets)
)
const ticket = ticketsQ.data?.find((t) => t.id === helpId) ?? null
```

This is deliberate (CACHING.md): **derive detail from the list, never
double-fetch a collection for a derived value.**

**The rule.** The list `SELECT`s are intentionally **"fat"**, they carry every
field the detail screen renders, not just the columns the list *shows*. Look at
`TICKET_COLS` in `workers/content/src/lib/help.ts`: one column list serves both
the list and the single-row read, and it carries `screen_recording_link` and
`source_screen`, things only the detail screen renders, beside the
`description` the list card shows. **Don't blindly trim a list SELECT to reduce payload.**
Before removing a column, grep the matching `*-detail.tsx` for the field. If a
column is genuinely list-only bloat, fine, but the default assumption is that
every selected column is load-bearing for detail.

(The single-row endpoint that `patchRow` calls on a live ping is the *only* true
"get one" read, and it exists to patch one row into the cached list, not to
back a detail screen. See CACHING.md §3.)

---

## 3 · Every per-team query is an HTTP round-trip

**The trap.** Team databases are created at **runtime**, so a worker can't bind
them, it talks to them over Cloudflare's **D1 REST API** with a scoped token
(`CF_D1_TOKEN`). That means `d1Query(...)` is **a network hop**, not a local
call. Write a loop of ten `await d1Query(...)`s and you've written ten serial
HTTP requests.

**Why.** `shared/workers/d1-rest.ts` is the one door to per-team data (locked
rule: one door). Every `d1Query` / `d1ExecScript` posts to
`https://api.cloudflare.com/client/v4/accounts/<id>/d1/database/<dbId>/query`.
The core global DB is different, it's the native `env.DB` binding (local,
cheap); only per-team data pays the REST tax.

**The rules.**

- **Batch dependent writes into one multi-statement script.** `d1ExecScript`
  runs several statements in a single hop. `appendMessage` in
  `workers/data-ops/src/lib/threads.ts` inserts the message
  **and** updates the thread's `last_message_at` in **one** script:

  ```sql
  INSERT INTO agent_messages (...) VALUES (...);
  UPDATE agent_threads SET last_message_at = ... WHERE id = ...;
  ```

  The catch: the script API forbids bound params, so you inline values with
  `sqlString()` / `sqlValue()` (which coerce-then-escape, `''`-doubling, so a
  non-string body can't 500 the one SQL door).

- **`Promise.all` genuinely independent reads.** `d1QueryAcross` in
  `d1-rest.ts` fans a query across shard databases with
  `Promise.all(databaseIds.map(...))`, the template for parallelising reads
  that don't depend on each other.

- **Deny-before-read must still hold when you batch a gate.** Every route gates
  *before* it reads (`await requireRight(cfg, guard, "member_roles", "read")` in
  `workers/tenancy/src/routes/roles.ts`, before any `d1Query`). If you
  restructure a handler to run reads in parallel for speed, the permission gate
  must still resolve, and throw its `GuardError`, **before** any data query
  fires. Never `Promise.all([requireRight(...), d1Query(...)])`: that races the
  read against its own gate and can leak a row to someone who was about to be
  denied. Gate first; read second.

---

## 4 · The agent acts *as you*, the request host is a placeholder

**The trap.** The AI agent is not a privileged service. It executes each action
by calling the **same gated endpoint** the UI calls, **forwarding the caller's
session cookie**. Two consequences bite if you forget it: (a) the agent's rights
are exactly the signed-in user's, no more; (b) the URL host the agent's inner
requests carry is a **fake internal host**, not the public app origin.

**Why (a), permissions are the spine.** `executeTool` in
`workers/data-ops/src/lib/tools.ts` fetches the real endpoint
over a service binding with `headers: { Cookie: request.headers.get("Cookie") }`
and `https://internal<path>`. The real door re-runs `requireRight` and
re-validates the body. There is **no separate agent role**, a tool can never
exceed what the user could do by hand. So: adding a new agent capability is not
"grant the agent access"; it's "add a tool that points at an *already-gated*
endpoint." Actions that aren't normal CRUD (controlling other device
**sessions**, **deleting** the team) are simply **absent from the catalog**
(`TOOL_CATALOG`) and structurally unreachable; the `identityBlocked` guard is
belt-and-braces.

**Why (b), the `https://internal` host is fake.** Because the module workers
have no public route (`workers_dev:false`), the agent reaches them over service
bindings with a **placeholder host** (`https://internal…`). Any user-facing link
baked from `new URL(request.url)` on that path would point at the dead host.

**The rule.** **Outbound links in email must use `PUBLIC_APP_URL`, never the
request host.** `sendInvite` in `workers/tenancy/src/lib/invites.ts` (lines
200–213):

```ts
// PUBLIC_APP_URL MUST win — an agent-sent invite hits tenancy over a service
// binding with a placeholder host, so a link built from the request origin
// would bake in a dead "https://internal" URL.
const base = env.PUBLIC_APP_URL || new URL(request.url).origin
// ...
ctaUrl: `${base}/invitations`
```

The request-origin fallback is only for the human path (a real browser request
where the origin is the public gateway). Any new worker that emails a link must
prefer `PUBLIC_APP_URL`. It's a per-env **var** in `workers/tenancy/wrangler.jsonc`
(set on staging + production). Leave it unset and agent-sent emails point
nowhere.

---

## 5 · The confirm model: destructive + privilege grants (+ bulk)

**The trap.** It's tempting to make the agent "ask before every write," or to
confirm every privilege change. That's the wrong model here, it double-checks
the user on ordinary, reversible building. The confirm behaviour is narrow and
specific: **destructive acts pause, and so does every write that decides who can
do what, or who can see whose.** Nothing else does.

**Why.** Since every write is **already gated** as the user (§4) and every write
is **reversible + audited**, the confirm panel isn't a permission check, it's
the app double-checking an act that *removes or overwrites at scale*, the same
way the manual UI reserves its red confirm for Remove / Revoke / Deactivate.
Over-confirming turns a helpful agent into a nagging one, so ordinary
constructive work, writing an article, replying to a ticket, renaming the team,
adding a dropdown value, runs straight away.

**The one carve-out, and why it changed (2026-08-04).** The rule was
destructive-ONLY: privilege writes ran free, trading defence-in-depth for a
smoother agent (owner decision, 2026-07-10). A fresh no-prior-context security
review rated the result HIGH, with a concrete chain: any member with
`help:create` writes instructions into a ticket description (20,000 characters
of someone else's text); an admin later asks the assistant anything that calls
`list_help_tickets`; that text lands in the model's context, and
`set_role_permissions` / `set_member_role` / `create_role` / `invite_member` all
execute AS the admin with no panel. Fencing untrusted content as DATA and one
system-prompt sentence are soft defences against that; a panel the admin must
click is a hard one.

So privilege writes confirm, and the set is **DERIVED, never listed**:
`isPrivilegeWrite()` reads each tool's own entry in `TOOL_GATES` and returns true
for anything gated on `member_roles:`, `team_members:` or `portal_users:`
(falling back to the door it posts to, so an agent-only tool can't slip through
by being absent from the map). Deriving it is not tidiness, a hand-written list
of four had already waved through `update_role`, which sat at `confirm: false`
beside the four that confirmed.

**And the second half, added 2026-08-11: the ACCOUNT FENCE.** Deriving from
module names is honest about permissions and blind to *who can see whose*.
`link_contact` is gated `accounts:create` and `set_account_parent` is gated
`accounts:edit`, so neither looked like a privilege write, while
`accountScope()` resolves a client login's whole world from exactly the rows they
write (the parent pointer, `account_links`, `portal_users`). Linking a contact to
a company, or re-parenting an account, hands an outside company sight of data it
could not see a second ago, with no permission changing hands and no panel. Both
ran silently, and `set_contact_link_active` ran silently in the *relink*
direction for the same reason. So the derivation grew a second half, which reads
the fence's own inputs: `FENCE_INPUTS` is declared in
`shared/workers/account-scope.ts` beside the SQL that reads them, and
`isPrivilegeWrite()` matches a tool's door and body fields against it, the
parent pointer is a single named column, so archiving an account is *not* a fence
write and stays free.

Twice since, the same bug came back wearing a different column, because *the
derivation did not know about that kind of column*. There are **three** kinds, all
declared in `account-scope.ts` beside the fence itself, and together they say who
can see whose:

- **`FENCE_INPUTS`**, what `accountScope()` READS to decide **where you stand**
  (`portal_users`, `account_links`, `accounts.parent_account_id`).
- **`FENCED_ROW_OWNERS`**, the column deciding **which rows stand with you**
  (`help.account_id`). Writing it moves a row *across* the fence, and a ticket
  carries its whole reply history with it.
- **`FENCE_IDENTITY_INPUTS`**, the column a grant resolves **who you are** from
  (`accounts.email`). The portal-grant door reads a person's email off their
  account row and hands the login to the platform user holding that address, so
  re-pointing it decides who walks in. It is *not* a line in `FENCE_INPUTS`: that
  list is machine-checked to mean "columns the corridor reads", and `email` is not
  one, filing it there would buy a panel by making a true list untrue.

A write added tomorrow to any of those tables confirms the moment it exists:
`requiresConfirm` derives it at runtime, so the safe behaviour doesn't wait for
anyone to remember; `workers/data-ops/test/agent.test.ts` requires the catalog to
DECLARE `confirm: true` so it reads honestly; and
`workers/tenancy/test/fence-confirm.test.ts` derives the fence-writing doors from
the **doors' own source** (which table each handler publishes) rather than from
any list, so a new door that the name-matching misses still turns the build red.
Everything else constructive runs free, so the friction the 2026-07-10 decision
removed stays removed.

**The rule** (`requiresConfirm` in `workers/data-ops/src/lib/tools.ts`, the one
place it's decided; a tool's `confirm` is a boolean, or a predicate for the
input-aware toggles):

| Behaviour | Tools | Why |
|---|---|---|
| **Pause for a yes/no panel** | the destructive acts, `remove_member`, `revoke_invite`, and `set_record_active` — ONE tool over the twenty-one (de)activate doors since 29 Aug 2026 (`RECORD_TOGGLES`). It asks **both ways** for an access write (record `role`, `portal_access`, `contact_link`, `wave`, `account_rate`, `internal_rate`, `staff_profile`) and **only when switching off** for the rest (`account`, `dropdown_value`, `app`, `app_module`, `process`, `meeting`, `knowledge_source`, `deliverable`, `brand_asset`, `meeting_purpose`, `staff_certificate`); the client's own organisation (`client_department`, `client_role`, `client_tool`) never asked and still does not. The MCP surface still publishes the twenty-one separately — see MCP.md. | It removes/withdraws access, or switches an existing record OFF. Reversible, but destructive-feeling, the app double-checks, exactly as the red UI action does. |
| **Pause for a yes/no panel (privilege writes)** | DERIVED, every write gated on `member_roles:`, `team_members:` or `portal_users:` (today: `create_role`, `update_role`, `set_role_active`, `set_role_permissions`, `set_member_role`, `remove_member`, `invite_member`, `revoke_invite`, `grant_portal_access`, `set_portal_access_active`) | They decide WHO CAN DO WHAT, and the model reaches them while reading team data an attacker can author. A silent one is a silent privilege escalation. Derived, so the next such tool is covered the day it lands. |
| **Pause for a yes/no panel (account-fence writes)** | DERIVED from `FENCE_INPUTS`, every write whose door writes `portal_users`, `account_links`, or `accounts.parent_account_id` (today: `create_account`, `set_account_parent`, `link_contact`, `set_contact_link_active`, plus the two portal-access writes above) | They decide WHO CAN SEE WHOSE. `accountScope()` builds a client login's whole world from these rows, so a silent link or re-parent widens what an outside company reads, without touching a permission. Both directions confirm: a relink hands a company back as surely as an unlink takes it away. |
| **Pause for a yes/no panel (row-owner writes)** | DERIVED from `FENCED_ROW_OWNERS`, every tool exposing the column that says which account owns a row (today: `raise_help_ticket`, `update_help_ticket`, via `help.account_id`) | It moves a ROW across the fence rather than moving the fence. Naming a client on an agency ticket publishes that whole conversation into their portal in one call. |
| **Pause for a yes/no panel (identity writes)** | DERIVED from `FENCE_IDENTITY_INPUTS`, every tool exposing the column a portal grant resolves a person from (today: `create_account`, `update_account`, via `accounts.email`) | It decides WHO a later login goes to. The grant door reads a person's email off their account row and grants to whoever holds that address, and anyone can put a `users` row behind an address by signing in once. `create_account` always confirmed for this reason; `update_account` did not, so the address could be re-pointed in silence under the trace line "Edit account 01J…". |
| **Confirm-with-a-count** | `bulk_set_help_status`, `set_help_status_by_filter`, `run_import_batch` | High-blast: "Set 12 tickets to resolved" / a whole imported file is confirmed by the count before it runs. |
| **Run straight away** | every OTHER constructive write, `update_team`, `create_dropdown_value`, `update_dropdown_value`, the content (re)activations, and all single content edits | Ordinary re-gated + reversible + audited CRUD; the server gates each call, so no panel. |

The system prompt (`agent.ts`) tells the model **not** to also ask in
chat for a confirmed action, the app shows one yes/no panel, and a chat-level
"are you sure?" on top would double-check the user.

**What runs on confirm comes from the server, not the client.** When a turn
proposes a dangerous call, the **full proposal** (name + input) is stored
server-side as `status:"proposed"` on the assistant message
(`agent.ts`). `/confirm` executes the **server-recorded** proposal
(`confirmAndRun` → `getPendingProposal`), ignoring any `calls` the client sends,
so a client can't approve a call the model never proposed. After running, the
proposal is flipped `"proposed" → "done"` (`consumePendingProposal`) so a stray
re-POST can't replay a remove/revoke.

---

## 6 · SSE streaming: one terminal event, no early return, keep the isolate alive

**The trap.** The agent chat endpoint streams. If you `return` from the handler
before the stream drains, or emit two terminal events, or let a proxy buffer the
body, the client hangs or double-settles.

**Why.** A client that sends `Accept: text/event-stream` gets a live stream of
text deltas + `step_start`/`step_end` events; anything else gets the plain JSON
outcome (`wantsStream` in `workers/data-ops/src/routes/agent.ts`).
The stream is a `TransformStream` whose **readable side is returned immediately**
while an async IIFE writes to the writable side (`streamRun`).

**The rules.**

- **Return the readable, then write asynchronously. Don't await the run first.**
  Returning the `Response` with an open body is what keeps the Worker isolate
  alive: Cloudflare keeps the isolate running as long as the response body
  stream is unclosed. The `void (async () => { … })()` in `streamRun` is
  deliberate, no `waitUntil`, no `await` before the `return`. Await the run and
  you've defeated streaming.

- **Exactly one terminal event.** The **route** owns the single terminal frame:
  a finished `ChatOutcome` becomes one `final` (or `confirm`) event via
  `terminalEvent`; a throw becomes one `error` event. The agent
  loop emits *progress* (`text`, `step_start`, `step_end`) but **never** the
  terminal. See the `Emit` contract note in `agent.ts`. Two terminal
  events double-settle the client.

- **The `confirm` terminal event MUST carry the `threadId`.** A paused turn never
  reaches `final` (which is where the client otherwise learns the thread id), so
  the confirm frame is the *only* place a **first-turn confirm**, a brand-new
  conversation whose opening message proposes a dangerous act, hands the client
  the thread it must POST back to `/confirm`. Drop it and `resolve()` bails on
  `!threadId`: the Go-ahead / Not-now buttons silently no-op (the dead-button bug,
  fixed 2026-07-10). The client adopts `ev.threadId` in the `confirm` case of
  `use-agent-chat.tsx`. Locked by `workers/data-ops/test/stream.test.ts`
  ("a pause-for-confirm outcome → confirm (carrying the thread id …)").

- **Disable proxy buffering.** The response sets
  `Cache-Control: no-cache, no-transform` and **`X-Accel-Buffering: no`** (lines
  58–66). Without the latter, an intermediary buffers the whole body and the
  "live" deltas arrive all at once at the end. Keep both headers.

- **Every error is a friendly event, never a raw 500.** The `catch` in
  `streamRun` writes `{ t: "error", message }` and the loop's own `catch`
  turns a model hiccup into a saved, friendly turn. A raw 500 must never reach
  the stream.

- **Everything the assistant says goes out as `text` events.** Streamed deltas
  from the model, and one `say()` chunk for server notes (the quota message, the
  failure wrap-up, the pause note), so the client renders the *accumulated*
  text and an early lead-in ("I can't create teams, but…") is never overwritten
  by a later note. `final` only settles the turn (thread/quota + a fallback
  reply for a turn that streamed nothing). If you add a new server note, route
  it through `say()` in `runPlanLoop`, don't just return it.

- **A failed step explains itself.** `step_end` carries `error` (the door's
  short reason, e.g. which permission the role is missing), the tool row is
  persisted with its outcome (`done`/`failed` + the reason in the summary), and
  the loop's failure path asks the MODEL for an unmetered wrap-up turn
  (`failureWrapUp`) instead of a canned note, the FAILED results are already in
  the convo, so the reply can say what was refused and why.

- **Empty assistant turns are NOT painted (the "blank pills").** A multi-step
  turn saves one assistant message per model call, and a call that only ran tools
  carries no text. Those empty messages are kept server-side (the model replay
  needs them) but **dropped on render**, `toChatItems` in
  `web/lib/use-agent-chat.tsx` filters `role:"assistant"` with blank content, or
  they'd paint as empty grey bubbles between the step rows when a saved thread is
  reopened. The tool rows already show what happened.

---

## 7 · The agent context window: bounded steps, windowed history, per-device resume

**The trap.** The full conversation is **not** replayed to the model. Assume it
is and you'll be surprised when the model "forgets" an old turn, or you'll blow
the token budget trying to feed it everything.

**Why + the rules** (`workers/data-ops/src/lib/agent.ts`):

- **`MAX_STEPS = 12`** caps the tool loop so a runaway plan can't spin
  forever; hitting it ends the turn with "I took several steps and paused here."
- **`MAX_HISTORY = 24`** windows what's *replayed* to the model:
  `history.slice(-MAX_HISTORY)`. The **full** thread stays in the DB
  (audit + panel rehydration); only the recent slice is sent as context. So
  cost/context is bounded, but "the model saw the whole thread" is false.
- Only **user + assistant text** is replayed across requests (`replayable`,
). Intermediate `tool_use`/`tool_result` pairs live **within a
  single loop** and are dropped from cross-request history, pairing them across
  turns breaks provider APIs.
- Tool results are handed back **fenced as DATA**, capped at 2000 chars
  (`fence`), never as instructions, a big list can't blow context,
  and data can't smuggle in a prompt. **The cap drops ROWS, not the tail, and it
  says so** (`trimResult`): a list door answers `{rows: […], total, hasMore,
  nextCursor}` with the rows FIRST, so cutting the string used to delete the exact
  count, the paging cursor and any way of knowing they were gone, and the model,
  asked "how many open tickets does this client have?", called the same tool four
  times in a row because nothing it was handed could answer. Every non-row field
  now survives the trim, whole rows go from the end, and a plain sentence says how
  many of how many are shown. Behind it, `repeatGuard` makes an identical **read**
  (same tool, same arguments) within one turn answer from the first call, reads
  only, because a read is idempotent and a write's second run is the door's and the
  confirm panel's decision, not the transport's. **The fence outlived the provider it was built for:**
  Claude's `tool_result` block is structural, but the Workers AI adapter (deleted
  2026-08-27 with the escape hatch) flattened tool history into plain turns, where
  an attacker's ticket description read exactly like the user's own words. The
  explicit `<tool_result from="…">` marker it needed is still fitted where the
  same shape occurs — tenancy's meeting-transcript extraction and content's
  composed knowledge answer both hand untrusted prose to a model as ordinary
  text — the system prompt still names it, and a closing marker inside the
  payload is escaped so the fence can't be closed from within.

**Resume is per-device and best-effort.** The panel remembers the last thread
per team in **`localStorage`** (`agent-panel.tsx`) so reopening
resumes that conversation instead of minting a fresh one. It's a nicety, not a
guarantee: another device won't see it, and a write failure is swallowed. Thread
ownership is enforced server-side regardless, `ownThreadOrThrow`
(`threads.ts`) 404s a thread that isn't the caller's.

---

## 8 · Credits are shared per **team**, not per user

**The trap.** The agent's daily allowance and credit balance are **team-wide**,
keyed by `team_id`. It's natural to assume "my 25 free requests", but it's the
*team's* 25, shared across everyone on it, resetting daily.

**Why.** The quota lives over the **global core DB** so it works without opening
a team database. `agent_usage` is keyed by **`(team_id, period)`** where
`period` is `YYYY-MM-DD` (the daily free counter); `agent_credits` is keyed by
`team_id` (the purchasable balance). See `getQuota` / `consumeAiUnit` in
`shared/workers/credits.ts` and DATA-MODEL.md. It is SHARED rather than
data-ops' own because the allowance is spent in more than one place now: by the
assistant, and by the knowledge base writing an answer out of the passages it found
(R23). One allowance, one counter, one ceiling — every spender declares the same
`AGENT_FREE_DAILY` and `credits-invariant.test.ts` compares their configs.

**The rules / subtleties.**

- One model call costs **one unit**, metered before EACH call inside a turn,
  so a multi-step turn costs one unit per step (capped by `MAX_STEPS`); a
  declined confirm costs nothing; running dry mid-plan stops the turn with a
  saved, plain reply. The app's own daily allowance first (`AGENT_FREE_DAILY`:
  code default 25/day, but BOTH environments ship 50), then a purchased credit.
- **The credit decrement is race-safe; the free counter is deliberately not.**
  The paid path is `UPDATE agent_credits SET balance = balance - 1 … WHERE
  team_id = ? AND balance > 0`, the `WHERE balance > 0` means it can never go
  negative (that's real money). The free counter is a best-effort
  `INSERT … ON CONFLICT DO UPDATE SET used = used + 1`; under heavy concurrency
  it may **overshoot by a hair**, which is fine, free units cost nothing.
- **Confirmed actions are metered up front.** `confirmAndRun` spends one unit
  **before any write** (`agent.ts`) so an out-of-credit team can't
  drive confirmed actions for free; the resumed loop skips re-metering that
  first step (`prepaid`).
- **Usage logging is never fatal.** `logUsage` (credits.ts)
  swallows every error, a missing table or write hiccup must not break the turn
  the user cares about.

---

## 9 · The last-admin race, the count is the friendly path, the WHERE is the lock

**The trap.** Guarding "a team must keep at least one admin" with a `SELECT
COUNT(*)` **before** the write is a classic time-of-check/time-of-use race: two
admins demoting/removing each other simultaneously can both pass the count and
zero out the team's admins.

**Why + the rule.** The count is kept as the fast, friendly rejection, but the
real guarantee is **inside the write statement**. `changeMemberRole` and
`removeMember` in `workers/tenancy/src/lib/members.ts` re-check the admin floor in the `UPDATE … WHERE`:

```sql
UPDATE team_members SET deactivated_at = ?
WHERE id = ? AND deactivated_at IS NULL
  AND ( ? IS NULL OR role_id != ?
        OR (SELECT COUNT(*) FROM team_members
            WHERE team_id = ? AND role_id = ? AND deactivated_at IS NULL) > 1 )
```

`if (!res.meta?.changes) throw new GuardError(409, "last_admin", …)`. **D1
serializes the write**, so the second racer's `WHERE` sees the post-first-write
state and matches zero rows, no Durable Object needed. This is the pattern
CONCURRENCY.md prescribes: *reach for a DO only when a single atomic SQL write
can't express the invariant.* Keep both layers when you copy this, the count for
the nice error, the `WHERE` for the actual safety. Unique indexes play the same
role for uniqueness invariants (one atomic write, DB-enforced); don't replace an
index or an atomic `WHERE` with an application-level check.

---

## 10 · Sharding exists but is **not** wired into the hot reads yet

**The trap.** `d1-rest.ts` and `workers/tenancy/src/lib/sharding.ts` contain a
full split/move machinery, `resolveModuleDatabases`, `queryModule`,
`d1QueryAcross`, `moveModuleToOwnDatabase`. It's easy to assume the hot read
paths already route through it. They don't.

**Why.** Sharding was built up front (a locked decision) as a relief valve:
**alarm** (nightly size check) → **mover** (relocate a module to its own DB) →
**split** (merged reads across shards). But today every module hot-read queries
`guard.databaseId` **directly**, `listHelp`, `listMembers`,
`listRoles`, `listSelectable` all call `d1Query(cfg, guard.databaseId, …)`, not
`queryModule`. Grep confirms: no hot read path imports `queryModule` /
`resolveModuleDatabases` / `d1QueryAcross`.

**The rules.**

- **A static multi-statement batch (§3) is safe now**, a team's module lives in
  exactly one database, so inlined multi-statement scripts and single-DB queries
  are correct.
- **But revisit if a module is ever split.** Once `moveModuleToOwnDatabase` puts
  a module's tables in a second database, older rows live in the main DB and new
  writes go to the override DB (`resolveModuleDatabases` returns
  `[override, main]`). A **read** that must see both then has to go through
  `queryModule` / `d1QueryAcross` (merged read), and a **cross-table
  multi-statement script** that assumes both tables are co-located will break.
  When you wire a module onto the split path, audit its batched scripts: any
  script touching two tables that could land in different shards must be
  reworked into merged reads + per-DB writes.
- **AND A CONCATENATION CANNOT PAGE, SORT OR COUNT** (scaling review 2026-08-14).
  `d1QueryAcross` runs one statement against every shard and concatenates the rows.
  That is right for "give me the rows" and quietly wrong for three shapes, each of
  which *looks* correct while there is only one database, which is every
  environment until the mover runs:
  - `LIMIT n` → each shard returns up to n, so you get the top n **of each shard**,
    up to n × shards rows. A keyset page built on that has the wrong rows in it and
    takes its `nextCursor` from the last row of a concatenation, which is a position
    in no shard's ordering: page two repeats and skips, silently.
  - `ORDER BY` → sorted within each shard, unsorted between them. The fix is a merge
    sort, which needs the sort key — something the seam cannot know.
  - `COUNT(…)` and friends → one row per shard, and every caller here reads
    `rows[0].n`. R16's *exact* count would report the first shard's total as the whole.

  `d1QueryAcross` now **throws** on all three when handed more than one database, so
  the day somebody points a paged or counted read at the split path they get a
  refusal instead of a plausible number. Making it correct, a cursor token encoding
  a position per shard, plus folding aggregates, is real work with a decision in it,
  and it is the prerequisite for wiring any PAGED module onto the split path. One
  database is untouched: every read today takes that branch.
  Locked by `workers/tenancy/test/merged-read-guard.test.ts`.
- **The mover has to survive the size it exists for.** It is what an 80% alarm tells
  you to run, so it only ever sees a table too big for its database, and two of its
  steps could not survive that. The copy paged with `LIMIT/OFFSET` (quadratic reads,
  and a window that shifts under a concurrent write); the emptying was one
  `DELETE FROM <table>;`, which D1 refuses past 30 seconds, **after** the routing
  flip has committed, so a timeout left both databases holding the rows and every
  merged read double-counting, with nothing saying so. It now copies by primary key
  and empties in `RETENTION_DELETE_CAP`-sized bites, counting what is left and
  **refusing by name** if the source did not drain.
  Locked by `workers/tenancy/test/mover-drain.test.ts`.

---

## 11 · Deploy is realtime-FIRST, migrations before workers

**The trap.** Deploying the workers in "logical" order (auth first, gateway
last) fails, and deploying a worker before its migration 500s at runtime.

**Why + the rules** (OPERATIONS.md, "Deploy order"):

- **Deploy order: `realtime → auth → tenancy → content → data-ops → mcp → gateway
  → portal-gateway`.** Realtime is **first** because every other worker
  service-binds it (they publish change pings; the gateway routes its WebSocket).
  Deploying a binder before its target fails with **"Worker not found"**, this bit
  the very first production deploy when `kwapso-realtime` didn't exist yet.
  `data-ops` binds `CONTENT` + `TENANCY`, so both precede it; the **two gateways**
  are last, for the same reason as each other, each routes to the workers behind
  it. The root scripts already encode this order. Use them.
- **Apply new migrations to BOTH databases before deploying the workers that
  need them.** Core migrations (e.g. `0008 importable_databases`, `0009
  agent_usage`, `0010 agent_credits`) go to `kwapso-core` **and**
  `kwapso-core-staging`; the team-schema migrations, the whole
  `TEAM_MIGRATIONS` array in `workers/tenancy/src/team-schema.ts`, `0001_team_base`
  through `0021_meetings` today, roll to **every** team DB via `POST
  /api/tenancy/admin/migrate-teams` (x-admin-key). Read the range off that array
  rather than out of any doc: this line named `0004`–`0008` for thirteen migrations
  after that stopped being true.
  Deploy the worker before the migration and its first query hits a missing
  table. Production is owner-gated: migrations first, then the realtime-first
  deploy.

---

## Quick reference, the "don't do that" list

| If you're about to… | Stop, because… | Instead |
|---|---|---|
| Use `router.push` to move within `/t/*` | Static export → hard reload, cache wiped | `go()` (History API), `deep-link-screen.tsx` |
| Trim a column from a list `SELECT` | Detail reads the record out of the list cache | Grep the `*-detail.tsx` first; lists are intentionally fat |
| Loop `await d1Query(...)` N times | Each is an HTTP round-trip | Multi-statement `d1ExecScript`, or `Promise.all` independent reads |
| `Promise.all([requireRight, d1Query])` | Races the read against its own gate | Gate first, read second |
| Build an email link from `new URL(request.url)` | Agent's request host is `https://internal` | `env.PUBLIC_APP_URL` first |
| Make the agent confirm EVERY write | Every write is already gated as the user + reversible | Destructive acts + every privilege write (derived from the gate map) pause; bulk confirms with a count; every other constructive write runs free (§5) |
| `await` the run before returning the stream | Kills streaming; isolate may drop | Return the readable, write async (`streamRun`) |
| Guard an invariant with a pre-write `COUNT` only | TOCTOU race | Re-check in the `UPDATE … WHERE`; count is just the friendly error |
| Assume hot reads route through sharding | They query `guard.databaseId` directly | Fine today; revisit any batched script if a module is split |
| Add a top-level module page and only teach the gateway's handler | `run_worker_first` is an allow-list; an unlisted path never reaches the Worker | Add `/mod/*` to the assets block in EVERY env too (§1) |
| Reach for a Tailwind class in `shared/web/` | It is outside both front doors' source roots | Already covered by `@source "."` in library-overrides.css. Keep that import |
| Deploy auth-first / worker-before-migration | Binder-before-target 500s; missing table | realtime-FIRST; migrations to both DBs first |
| Split `lib/accounts.ts` because it is "1,136 lines" | 369 of those are comments, and a law pins every spine statement to that one file | Measure CODE lines; check what pins the file before proposing a split (§ *A long file that a law is holding open*) |

## The catalogue is data; the code is truth (R13)
**The trap.** An import TargetDef lives in code, but a target only becomes one the
picker OFFERS once a ROW exists in the core `importable_databases` table, and rows
are DATA, which no deploy carries. So staging (seeded once by hand) could import
modules that production, running byte-identical code, silently could not, and
nothing anywhere said so. Any capability gated on a seeded row has this bug.

**The rule.** The catalogue reconciles itself against the code on READ:
`reconcileCatalog` INSERT-only upserts a row per `TargetDef` (`ON CONFLICT DO
NOTHING`). INSERT-only is the whole point, a target the owner deliberately
switched OFF keeps its row and stays off; only a NEVER-EXISTED target gets one. So
the picker must NOT pre-filter `is_active` in SQL (filter in memory), otherwise
"switched off" and "never existed" are indistinguishable and the reconcile would
resurrect a deliberate off. Reachable from both doors (the picker always; the
by-key door on a miss). Shipping the code now ships the capability.

## Two surfaces, one count (R16 arbitration)
**The trap.** A collection count can live in two places, a tab badge and a
`CollectionHeading`, so a screen can show the same number twice ("24k" on the tab
and "24k" in the heading right beneath). The obvious fix, a `showHeadingCount`
prop, is WRONG: whether a counted tab strip exists is a PER-PERMISSION answer (the
strip renders null for a viewer who lacks the right that reveals it), so every
caller re-derives it and is silently wrong for the roles nobody tests with.

**The rule.** Arbitrate with a React CONTEXT (`counted-tabs.tsx`): `CountedTabs`
marks a badged tab's panel, `CountedAbove` marks a counted sibling strip, and the
heading calls the hook ABOVE its early return and renders null when marked. The
tab wins; the heading stands down. (R16 owns the NUMBER; the tab-tie law R8 owns
WHICH collection a tab describes, if they conflict, R16 prevails.)

## A class in `shared/web/` only exists if Tailwind was told to look there
**The trap.** Tailwind v4 finds its own sources, rooted at the project it is built
inside. Both front doors are their own npm workspaces (`web/`, `web-portal/`), so
that root is the front door, and `shared/web/` is **outside both**. Every class
used ONLY by a shared component was therefore never generated. It fails silently
and selectively: a class survives if anything under `web/` happens to use it too,
so `py-4` worked and `pt-6` did not, in the same file, on the same day.

That is not hypothetical. `shared/web/form-shell.tsx` carried an eleven-line comment
defending `pt-6` as "the ONE value that governs it everywhere", written when the
owner reported the separator colliding with the submit button. Measured on staging,
that div's computed `padding-top` was **0px** and `.pt-6` was in no stylesheet the
app shipped. The documented fix had never once run, and the bug was re-reported
three months later.

**The rule.** `shared/web/library-overrides.css`, the one stylesheet BOTH doors
already `@import`, carries `@source ".";`. It lives there rather than in each
`globals.css` for the reason the front-door helpers are shared: a per-door line is a
line one door can be given and the other forgotten. Locked by
`web/test/shared-web-is-styled.test.ts`. If you add a THIRD front door, its
`globals.css` must import that file or every shared component loses its styling.

## A hook below an early return (the white screen)
**The trap.** A `use*` hook placed AFTER a top-level `if (…) return` renders fine
until the day that return fires first, then React sees a different hook count
between renders (#310/#300) and blanks the whole tree. It is invisible in review
and ships easily.

**The rule.** Hoist every hook above the returns. `web/test/hooks-order.test.ts`
makes the class unshippable, it fails any depth-1 hook call after a depth-1
return, and the mounted root `ErrorBoundary` (`web/app/layout.tsx`) contains any
that still slips through as a readable card, never a blank page. (The scanner
walks past the parameter list to find the real function body, and catches
`React.`-namespaced hooks too, both learned from its own sabotage test.)

## A long file that a law is holding open
**The trap.** Three files look like the obvious targets for a "split the god-file"
refactor, `workers/tenancy/src/lib/accounts.ts`, `workers/content/src/lib/knowledge.ts`
and `workers/tenancy/src/lib/processes.ts`. Two of them are long **on purpose**,
and the first is long *by law*: `test/account-leak.test.ts` walks every file under
`lib/` and `routes/` and fails the build if a statement against `accounts`,
`account_links` or `portal_users` appears anywhere except `lib/accounts.ts`. Move
one `SELECT` into a sibling and the message is immediate, *"spine SQL outside the
one fenced file"*. That is the R21 fence's whole structural argument: a file cannot
be forgotten the way a WHERE clause can.

`knowledge.ts` is the same shape from the other end. It is not an unsplit
god-file, it is what is LEFT after five splits (`knowledge-ingest`, `-vectors`,
`-summary`, `-text`, `-google` are already siblings), and what remains is pinned:
R23's `cited-answers.test.ts` reads `lib/knowledge.ts` for the one answer builder
and forbids any door assembling that shape by hand, and R26's vector fence reads
it too. `processes.ts` carries the same `AccountScope` fence as the spine, with the
burglar suite trying every door's handle.

**The rule.** Measure a file by its CODE lines, not its total, the comments here
are the documentation, and by real code these are 767, 1,009 and 921 lines, not
1,136 / 1,683 / 1,142. Then check what pins it before proposing a split: a law that
names a path is a decision, not an oversight. If a split is genuinely wanted, the
law moves first, the check, the registry entry and RULES.md together, and that is
a deliberate change with the owner in the room, never a tidy-up.
