# Changelog

The eras this project moved through, so a newcomer can read how it got here
without reading 350 commits. Newest first.

**Scope note.** This file records *what shipped and when*. It is not the place to
look for what is true today (README.md, then BASE-MANUAL.md), why a decision was
made (ARCHITECTURE.md), or what each audit round changed in detail
(BASE-IMPROVEMENTS.md § *When each piece landed*). Those already exist and this
file deliberately does not duplicate them.

**Reconstructed from git history**, not written as work happened. Dates are merge
dates and the groupings are one reader's reading of the branch names and merge
subjects. Treat them as a map, not a record. The commits themselves are the
record: `git log --merges --date=short --format="%ad %s"`.

The project is not versioned or tagged. There are no releases; `main` is what is
deployed. Adding tags at the era boundaries below would make this file navigable
and costs one command each.

---

## The grant catches up with the code, 19 Aug 2026
The day after the calendar became one-way, the owner closed the gap the previous
entry left open: *"the app must hold only a READ-ONLY Google Calendar grant."*

**The ask is `calendar.readonly`.** The interesting part is not the string, it is
that changing the string fixes nothing. A grant at Google is an additive SET per
OAuth client: an account that already approved `calendar.events` keeps holding
it, so the next connect returns a token that still carries the write scope, past
a consent screen that asks nothing new — a fix that looks done and is not. Three
things together make it real, and the essay above `GOOGLE_SCOPES` in
`workers/content/src/lib/google-oauth.ts` is the canonical account of them:
disconnect **revokes** at Google (the only act that empties the set), connect
**forces a fresh consent** and refuses incremental authorisation, and the token
response's granted scopes are **read back** and compared with the ask — in both
directions, so a connection that is wider than the ask *or* short of it says so
on the person's own Settings card. That last leg is what turned an assumption
into evidence; `workers/content/test/google-scopes.test.ts` locks all four.

**The other direction had already bitten.** `gmail.modify` was added to the Gmail
list after the first connections were made, so applying a label refused the owner
with a sentence blaming a grant nobody had touched (CHECKLIST 14.5, "blocked on
you", with no screen anywhere saying what to do). The same subtraction the other
way now names it, on the card and at the door.

**And the mail bin**, which the owner asked for in five words: *"why is there no
method for you to delete drafts?"* One door bins a draft, a message or a whole
conversation; a permanent delete is unreachable rather than un-built, because it
needs the full `https://mail.google.com/` scope and this app does not ask for it
on any surface.

---

## The calendar becomes one-way, 18 Aug 2026
The owner, twice in one day: *"disable the ability to create, edit, or delete
anything in the calendar from the frontend… scour through our entire
documentation and just make it one-way so we only grab and update the
information"*, and *"this held mark is held release. I don't care. It's too
complicated."*

Two things went, and they went for different reasons. **The calendar's write half
is gone entirely** — five functions in `lib/google-api.ts`, seven doors, eight
tools across the assistant and the MCP surface, the "Add to my calendar" action,
and the `google_events` permission ("Calendar on your behalf") that guarded them.
The refusal is a missing function rather than a condition somebody can invert,
which is the shape R24 already uses for internal money. The app's Google grant
still asked for the read/write `calendar.events` scope at the time, because
Google will not downgrade an existing grant and narrowing it would sign every
connected person out of their calendar until they reconnected; OPERATIONS.md
recorded what that switch would cost, so it stayed the owner's decision. **He
took it the next day** — see the 19 August entry: the ask is `calendar.readonly`,
the reconnect was paid, and the three things that make a narrowing real (revoke
on disconnect, forced consent, and reading back what Google granted) went in
with it.

**The `held` status is retired**, and the insight that made it simple is that a
meeting's own start time already says whether it has happened. A status column
was a second source of truth for a question the clock answers, and the two
disagreed in both directions. The `upcoming` view, the account rollup's "we last
met", the diary's state column and the meeting summary all key on `starts_at`
now; the notes are always editable, because nothing could ever know the
writing-up was finished. The columns stay, because what people ticked while the
idea existed is still history. The transcript import's idempotence never rode the
status — it rides `transcript_captured_at IS NULL`, a fact about the job rather
than about the meeting — so nobody's hours can be doubled, and a test now proves
it rather than the reading being trusted.

**And the read went the other way.** "Everything in my calendar" is now true in
practice: past and future, one-offs included, over a window five years back and a
year ahead, walked one ninety-day slice per call from a cursor on the caller's own
connection (`0038_calendar_one_way`). Forward-only, so it cannot leave a gap
behind it, and it stops at the last entry actually read when a slice holds more
than one bounded read will walk — bounded per request (R14), complete by
repetition.

---

## Three modules leave, 17 Aug 2026
The owner retired Marketing, Learning and the Delivery method page. Only one of
them took anything with it. Learning's 41 articles had already been indexed into
the knowledge base, so the material outlived the module, the sources survive
under the kind `article`, and the gateway still serves `/media/learning/*` so the
images inside them still load. The ten delivery programmes turned out to be the
sprint types wearing a second name, so everything they carried (a mark, the German
label, the sentence that explains the block, how long one normally runs) was
folded onto the sprint type as four nullable columns on `selectable_data`.
Marketing's posts are the one genuine loss, and the ruling was explicit; the
legacy rows are still in the Glide export. Marketing stays as a task
**department**, which is a dropdown value and always was. Two team migrations did
the work: `0025_purge_learning_marketing_programmes` and, alongside it,
`0026_retire_duplicate_dropdown_values`, which deactivated the 26 duplicated
dropdown values every team born before the seed was guarded had been carrying,
the reason a tester saw each ticket type two, three and four times in every
picker.

## The opening frame, 14 Aug 2026
The app opens on its own mark: a splash and a first screen that belong to this
product rather than to a framework default.

## Screens, doors and retrieval, 13 Aug 2026
Apps, sprints, stories and tasks became screens a person can click. Twelve
shipped doors got a control and the ratchet learned to see them. Knowledge
retrieval moved onto Vectorize, with Google material folded into the knowledge
base. The onboarding loop closed and the legacy history was imported.

## The work engine and the money, 12 Aug 2026
The largest single era. Five ticket states, reference numbers, drag order and a
wording lock; then stories, sprints, work logs, to-dos, tasks and triage, with the
client's half of each. Process maps arrived alongside the money, savings a client
can drill into, and a margin they never see, made structurally unreachable rather
than merely switched off. The knowledge base landed as one base with many
compartments where every answer names its sources. Per-person Google connections
(Drive, Gmail, Calendar, Chat) were scoped at Google rather than in the app.

## Two front doors, 10 and 11 Aug 2026
The client portal got a gateway of its own, forwarding a named, closed allow-list
of doors rather than a prefix fan-out, so the agency's material is unreachable
from the client internet by construction, not by condition. "Continue with Google"
arrived on both front doors. The section a person reads became **Tickets**
everywhere a person or a URL can see it, while the permission key, tables and API
path stayed `help` on purpose. A run of security work in the same fortnight: the
login door began counting its callers, machine tokens got a lifetime, the live
channel learned who was listening, the account fence was extended to every table
with an undecided one treated as closed, and both gateways' preview URLs were
switched off. The doc map was made machine-checked against the roster on disk.

## The hardening round, 4 Aug 2026
Six merges in one day, each a group of the Laws of the Base: bounded lists and
real keyset paging, idempotent transitions, a gated cross-module activity feed,
live listeners, honest counts with arbitration, a self-healing import catalogue,
and agent/MCP filter parity. Login codes became inbox-only in every environment,
the internal doors began failing closed, and nine fixes came out of an independent
no-prior-context security review.

## The machine surface, 7 Jul 2026
The mcp worker: personal access tokens bridged to team-pinned sessions, exposing
the same gated doors as MCP tools. The external surface got its own gating suite,
because a door that is safe from the browser is not automatically safe from a
machine.

## Agent modules, import and the error store, 23 Jun to 3 Jul 2026
The content worker (learning and tickets) and the data-ops worker (CSV import plus
the AI agent that acts as the signed-in user through the same gated endpoints).
Agentic multi-file import with foreign-key resolution. The agent's credit quota and
usage log. A central error store every worker records to.

## The base, 12 to 22 Jun 2026
Auth, tenancy, realtime and the agency gateway. Email-code login, teams, member
roles and the permission spine, invites, the per-team database created at runtime,
the `TeamChannel` Durable Object and the cache-first live layer, and the screen
engine with its deep-link grammar. The first production deploy failed on binding
order, which is why the deploy order is realtime-first and written down in three
places.
