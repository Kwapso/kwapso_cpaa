# The Glide history, and what to do with it

Read `README.md` first for how the data was captured and how to pull it again.

This file is the **field reconciliation**: what the old data actually contains, where
each table lands in the new model, and — the part that matters — **the decisions that
are yours, not mine.** Nothing here has been migrated. Nothing will be until the
decisions at the bottom are answered.

Pulled 10 Aug 2026: **32 tables, 11,946 rows** across both Glide apps.

---

## 1 · What the data turned out to be

Four things worth knowing before any mapping.

**The two apps are one dataset.** Every table the client portal exposes has an
identical table id in the agency app. The portal was never a second database — it
was one database with a filter over it, decided per signed-in contact. That is
the account fence we already built, arrived at independently.

**Everything hangs off *apps*, not off customers.** This was the surprise. A customer
has apps; an app has modules, sprints, deliverables, assets, tickets and logged time.
The customer is the owner, but the **app is the unit of work**. Twenty-eight of them
across twenty customers.

**The history is bigger than it looks.** 1,820 tickets over two years (Jun 2024 →
May 2026), 913 backlog items, 3,677 tasks, 1,147 comments, 350 meetings, and
**2,187 hours of logged time**. This is not a seed — it is the agency's record.

**A lot of it is German.** 1,764 tickets carry a German title; 1,010 carry an English
one; 1,010 carry both. So roughly 754 tickets exist **only in German**. Language is
also a first-class field on the customer (German, Spanish, Catalan, English).

---

## 2 · How the tables link

Derived from the data itself — every column was tested against every table's row ids,
not read off a schema. `→` means "holds the row id of".

```
customers ─┬─ contacts (8Tvk0)
           ├─ apps (KH2hM) ─┬─ modules (1Ps1B) ─── assets (DBZWD)
           │                ├─ sprints (qw1XE)
           │                ├─ deliverables (Name)
           │                ├─ backlog (0e3PW, also → modules, → sprints)
           │                ├─ tickets (yfSX5, also → customers, → modules)
           │                └─ worklog (Name, also → tickets, → users)
           ├─ tasks (0rqK3, also → tickets, → apps, → departments)
           ├─ meetings (FrRxr, also → departments, → purposes, → apps)
           └─ comments (eZ6Lx, also → backlog)

users → roles          choices ← nearly everything (the dropdown table)
departments ← purposes, meetings, tasks
```

---

## 3 · Where each table lands

### The customer spine — already built, and it fits

| Glide | Rows | Lands in | Notes |
|---|---|---|---|
| `customers` | 20 | `accounts` (kind *entity*) | Name, description, industry, website, VAT number, language, source, and a full postal address (street, city, postcode, region, country). |
| `contacts` | 104 | `accounts` (kind *individual*) + `account_links` | 96 unique emails across 104 rows. One person (Dennis Franken) already appears twice — the same human held as two rows because Glide had no way to link one person to two companies. `account_links` is exactly that fix. |
| `users` | 6 | `team_members` | The agency staff. |
| `roles` | 4 | **not migrating** | The base has its own permission matrix; importing Glide's four rows would mean carrying a second, weaker model beside the spine. |
| `choices` | 154 | `selectable_data` | Sixteen groups: Status (41), Type (26), Category (12), Stage (10), Source (9), App (8), Format (5), Screen/Type (5), Language (4), Kind (4), Year (4), Priority (4), Scope (3), Requirements/Category (3), and 16 uncategorised values that are really country and company-size labels. |

**Three findings that settle open questions:**

- **Account logos exist.** `customers` carries two image columns and **18 of 20 accounts
  have one**. The open question "should accounts have a logo?" is answered by the data:
  they already do. It needs a column, and the value is a Google-hosted URL that will
  need re-hosting in R2 — Glide's storage will not outlive Glide.
- **Reference codes exist.** Tickets and backlog items already carry a short account
  code (`CONFIA`). SCOPE ch.02 specifies exactly this (`BERG`), and it is already the
  agency's habit rather than a new idea to teach.
- **Google is already wired in by hand.** 13 of 20 customers carry a Drive folder link
  and 12 carry Google Chat space URLs — three separate space columns each. The
  knowledge layer has a starting point, and it is per-account.

### The work engine — the module that does not exist yet

| Glide | Rows | Lands in | Notes |
|---|---|---|---|
| `apps` | 28 | **a new module** | The missing noun. Name, URL, image, description, status, plus three narrative fields (the client's background, their problem, the solution) and a contact list. Eight statuses from Blueprint through Maintenance to Archived. |
| `modules` | 246 | under apps | A feature within an app: name, description, and the benefit it delivers. |
| `tickets` | 1,820 | work-engine tickets | Reporter email, account, app, module, type, status, both languages, a markdown solution note, and a comma-separated list of staff. Types: Request 822, Issue 446, Question 310, Extra 170, Requirements 15. |
| `backlog` | 913 | **stories** | Title, body, rank, kind (Story / Bug / Cosmetic / Enhancement), and links to app, module and sprint. This is the closest thing to SCOPE's *story*. |
| `tasks` | 3,677 | to-dos | Links to tickets, apps, customers and departments, with a done flag and a full actor trail. |
| `worklog` | 2,940 | work logs | Start, end, person, target, and duration in hours. 2,187 hours in total. |
| `sprints` | 106 | sprints | App, status, start and end date. |
| `deliverables` | 8 | deliverables | Name, type, a content URL and a thumbnail. |
| `assets` | 54 | under modules | Includes per-asset numbers — quantity, unit cost, a computed total, hours saved — so some of the **savings math already exists as data**. |
| `comments` | 1,147 | activity / replies | Attached to backlog items and customers, with an attachment URL. |
| `meetings` | 350 | work logs | SCOPE ch.13 records the decision that meetings are logged as work. Has attendees, a purpose, a department, in-person vs remote, and a calendar id. |

### Agency-internal — no home yet, and possibly no need for one

`departments` (8) · `purposes` (27) · `program` (10) · `channels` (6) ·
`content` (251) · `certificates` (5) · `branding` (74)

`content` and `channels` are a marketing pipeline — 251 posts across six channels.
`branding` is a 74-row asset library. `program` and `purposes` support meetings and
the delivery method. None of these is client-facing, and none is in the scope
document. **My recommendation was to archive the rows and build none of it** — but
251 posts is not nothing, so it was the owner's call, not mine.

**ANSWERED, 2026-08-12: build all seven, as proper modules.** They landed as four
team modules and two dropdown groups (team migration `0014_agency_internal`; see
DATA-MODEL.md for the tables and the reasoning):

| Glide | Rows | Became |
|---|---|---|
| `content` | 251 | `marketing_posts`, in the **Marketing** module |
| `channels` | 6 | the **"Marketing channel"** dropdown group |
| `branding` | 74 | `brand_assets`, in the **Brand library** module |
| `program` | 10 | `programs`, in the **Delivery method** module |
| `purposes` | 27 | `meeting_purposes`, in the same module |
| `departments` | 8 | the **"Department"** dropdown group |
| `certificates` | 5 | `staff_certificates`, in the **Staff profiles** module |

Each module is a module in the full sense the owner asked for: a permission-matrix
row, gated API doors, agent and MCP tools, an import target with a sample file, a
CSV export, screens with record details, and its own tests. The two that became
dropdown GROUPS are bare labels with no fields of their own, and the base already
has one home for a team's editable vocabulary — a module built to hold a word is
ceremony, and a dropdown group is itself a permissioned, importable, machine-
readable thing.

**Where the columns came from.** The Glide rows were never pulled (the API key was
never granted to the build), so each table's columns are designed from the row
counts and descriptions above and are deliberately generous. Anything the real
data turns out to carry is a column on an existing table, not a redesign.

---

## 4 · The decisions that are yours

Each of these changes what gets built. I have given a recommendation, but none of
them should be settled by me quietly.

**1 · Which language is the record?**
754 tickets exist only in German; 1,010 exist in both. The new app has one title
field per ticket. *Recommendation:* keep the original language as the record and
carry the English as a separate translation field, so nothing is lost and the
client sees their own language. The alternative — English-only — silently discards
the original wording on three quarters of the history.

**2 · Three work tables, two nouns.**
Glide has `tickets`, `backlog` and `tasks`. SCOPE has *tickets* and *stories*.
`backlog` maps cleanly to stories. `tasks` (3,677 rows) is a third thing — it links
to tickets *and* apps *and* departments. *Recommendation:* tasks become to-dos,
which SCOPE ch.07 already has. But I have not read enough of them to be sure they
are not really stories, and 3,677 rows is too many to guess at.

**3 · How much history comes across?**
All of it, or the last N months, or only open work? *Recommendation:* all of it.
It is only ~12,000 rows, the client portal is far more convincing with two years
behind it, and a partial import is a decision you cannot reverse without redoing
the whole exercise.

**4 · The staff profiles.** — **ANSWERED, 2026-08-12: overruled, and rightly.**
The six `users` rows carry personality-test results, strengths, weaknesses and
role models. My recommendation was to leave them behind as "a team page, not a
system record". The owner asked for real storage instead — a table, and R2 for any
upload — and the overrule holds up: a profile edited by a colleague, with no
history and no permission behind it, is a page anybody can quietly change about
somebody else. They are now `staff_profiles`, one live row per person, on each
member's own page, visible to the team and reachable by no client login at all.

**5 · The Google-hosted files.**
Every logo, photo, asset and attachment is a `storage.googleapis.com/glide-prod...`
URL. Those links die with the Glide account. *Recommendation:* the import copies
each file into R2 as it goes. This is the one piece of the migration with a
deadline attached — do not cancel Glide before it runs.

**6 · The uncategorised dropdown values.** — **ANSWERED, 2026-08-12: overruled.**
Sixteen of the 154 choices have no group and are really countries and company-size
bands. My recommendation was to make them fields on the account; the owner ruled
for two proper GROUPS in `selectable_data` — "Country" and "Company size" — so
nobody types the same country five ways. Both groups ship seeded, for new teams
and existing ones alike. The sixteenth value, a stray hyphen, is binned: it is not
a value, it is a typo.

---

## 5 · What has NOT been done

No row has been written to any database. No schema has changed. No table has been
created. The import path described in `AGENTIC-IMPORT.md` is the mechanism when the
time comes — normalise, map, order the interdependent tables, resolve foreign keys,
reject honestly, and write through the gated door — but it needs the work engine to
exist first, and it needs the six answers above.
