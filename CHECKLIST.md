# Round one: the checklist

Every single thing asked for in the 37-page feedback document, Aurora's 36-minute
transcript, and both questionnaires. **Nothing has been dropped.** Where something is not
being done, the reason is written next to it and you can overrule it with one word.

**Status words, and they mean exactly this:**

| word | meaning |
|---|---|
| **DONE** | built, gated, and proved working on staging |
| **BUILDING** | a lane is on it right now in this session |
| **TO DO** | agreed, not started |
| **CHANGED** | you or Aurora decided something different from the original ask |
| **NOT DOING** | deliberately not done, with the reason |

Last updated 17 Aug 2026.

---

## 1 · The bugs Aurora hit

| # | The thing | Status |
|---|---|---|
| 1.1 | Sharing or deep-linking a ticket fails to load the page. Happens across the whole app | TO DO |
| 1.2 | The start timer is broken on tickets, stories and tasks | TO DO |
| 1.3 | Ticking a task off appears to delete it | **CHANGED** — the record is never deleted; it leaves the only list on screen and there is nowhere to find it. Fixed by adding the Completed tab (4.2) |
| 1.4 | Forms and edit screens spill outside their box. Visible on the story edit screen, where Save renders outside the dialog | TO DO |
| 1.5 | The separator and the submit button touch at the bottom of every form | TO DO |
| 1.6 | Ticket types appear two, three and four times in the dropdown | TO DO — two vocabularies are live at once. Fixed by 2.1 |
| 1.7 | Meetings and Time share the same icon | TO DO |

## 2 · The words

| # | The thing | Status |
|---|---|---|
| 2.1 | Ticket types become Question, Issue, Request, Extra, Requirements | TO DO — **CHANGED**: Aurora retires Feedback and Bug. You wanted Feedback kept. This is a "what", so Aurora wins by your own rule |
| 2.2 | Story types Fix, Feature, Change, and editable in Dropdown values | TO DO |
| 2.3 | "My tickets" becomes tickets on apps I am staffed to | TO DO — **CHANGED**: you chose "stories assigned to me". A "what", so Aurora wins |
| 2.4 | "Request behind it" becomes "Tickets" | TO DO |
| 2.5 | "By when" becomes "Deadline" everywhere | TO DO |
| 2.6 | The Time page becomes "Work logs" | TO DO |
| 2.7 | "Process maps" becomes "Processes" | TO DO |
| 2.8 | "Under this account" becomes "Contacts" | TO DO |
| 2.9 | Every form's submit button says "Submit" | TO DO |
| 2.10 | No em dashes anywhere a person can read, and none in the documentation | TO DO — **CHANGED**: Aurora extended it to the docs |

## 3 · What gets removed

| # | The thing | Status |
|---|---|---|
| 3.1 | Marketing: gone from code, database, docs, rules and the written scope | TO DO |
| 3.2 | Learning: gone the same way | TO DO — its 41 articles are **already** in the knowledge base, so nothing is lost. You approved dropping the production tables |
| 3.3 | Delivery method: the page goes | TO DO |
| 3.4 | Delivery method's ten programmes survive as sprint-type enrichment: German name, description, standard length | TO DO |
| 3.5 | The Marketing department survives as a task department | TO DO |
| 3.6 | The team switcher and the Teams page disappear | TO DO — **CHANGED**: Aurora said kill teams entirely. Hiding it keeps the fork you sell to a client next year. Your call, twice |
| 3.7 | Ticket "move up / move down" leaves the detail screen | TO DO |
| 3.8 | Story "move up / move down" goes completely | TO DO |
| 3.9 | Ticket "Answer" and "Reply by email" go | TO DO |
| 3.10 | "Make it a story" goes. A ticket never becomes a story | TO DO |
| 3.11 | The stray "co-op: check the account" hint text goes | TO DO |
| 3.12 | App create screen loses the address field | TO DO |
| 3.13 | App create screen loses "what it costs us a month" | TO DO — deferred to version two, Aurora's words |
| 3.14 | Processes stop being a top-level page | TO DO |
| 3.15 | Story due date goes; inherited from the sprint | TO DO |
| 3.16 | Profile and email move out of Settings onto a real profile page | TO DO |

## 4 · Tasks

| # | The thing | Status |
|---|---|---|
| 4.1 | "Today's tasks" progress bar pinned to the top of every tab | TO DO |
| 4.2 | Tabs: Overdue, List, Calendar, Completed, Upcoming, All | TO DO |
| 4.3 | Priority becomes important and urgent ticks, scored `(important x 2) + urgent + 1` | TO DO — the formula was read off your own screenshot |
| 4.4 | An assignee selector that defaults to whoever is creating the task | TO DO |
| 4.5 | A department selector: Admin, Business, Marketing, Production, Sales, each with its icon and brand colour | TO DO — all five came out of the legacy data with icons and hex colours already chosen |
| 4.6 | Production makes a task name an app. Sales and Admin make it name a customer | TO DO |
| 4.7 | An image or file on a task | TO DO |
| 4.8 | Completed view columns: department, app, important, urgent, deadline, closed | TO DO |
| 4.9 | Who can see everyone else's tasks | TO DO — **CHANGED**: a configurable permission, Aurora's answer, not "everyone" |

## 5 · Tickets

| # | The thing | Status |
|---|---|---|
| 5.1 | Sub-tabs by type under All, My and Archived | TO DO |
| 5.2 | The status becomes a label you cannot click | TO DO |
| 5.3 | A new "Scheduled" state between Triage and In progress | TO DO |
| 5.4 | In progress happens by itself when a timer starts on the ticket or a related story | TO DO |
| 5.5 | Ready happens by itself when every related story closes | TO DO |
| 5.6 | Resolve is refused until a resolution is written | TO DO |
| 5.7 | Resolving emails the client automatically | TO DO — **CHANGED**: goes to the raiser AND the app's main stakeholder, Aurora's answer |
| 5.8 | A ticket must name its app | TO DO |
| 5.9 | A ticket must name the contact who raised it | TO DO |
| 5.10 | Several files and several links on a ticket, from both front doors | TO DO |
| 5.11 | A dedicated triage screen showing whose week it is | TO DO |
| 5.12 | No automation ever unassigns the triage person | TO DO |
| 5.13 | The main stakeholder validates tickets before triage | TO DO — **CHANGED**: only extras, requests and feedback wait. Questions and issues go straight in, Aurora's note |

## 6 · Stories

| # | The thing | Status |
|---|---|---|
| 6.1 | The app selector moves to the top of the form, and the edit screen matches the form | TO DO |
| 6.2 | A story type selector, required | TO DO |
| 6.3 | The sprint list filters to that app and to current and future sprints, with an icon for active, done and upcoming | TO DO |
| 6.4 | The ticket list filters to that app and to open tickets only | TO DO |
| 6.5 | A story links to one or more processes | TO DO — **CHANGED**: an explicit "no process" option exists, Aurora's answer, rather than being impossible to save |
| 6.6 | "Who's doing it" limits to staff on that app | TO DO |
| 6.7 | The status becomes a label; a timer moves it, not the other way round | TO DO |
| 6.8 | A work logs tab on the story, and everywhere else time is captured | TO DO |
| 6.9 | Review is refused until the timers are stopped and an explanation is written | TO DO — **CHANGED**: the file is required only when there is something to show, Aurora's answer |
| 6.10 | The reviewer gets one Done button | TO DO — **CHANGED**: the app's team lead presses it, Aurora's answer, not anyone with the right |

## 7 · Companies and contacts

| # | The thing | Status |
|---|---|---|
| 7.1 | Companies and contacts split into separate screens | TO DO — **CHANGED**: one table underneath, split screens on top. Two tables would cap a person at one company, and Marta is at two. Your call, twice |
| 7.2 | The "Under this account" tab goes | TO DO |
| 7.3 | Portal access stops being a tab and moves onto the contact | TO DO |
| 7.4 | Only a contact can hold a login | TO DO — **CHANGED**: Aurora's answer, over your "both levels" |
| 7.5 | A contact's page is its own page: no sprints, no rates, no contacts of its own | TO DO |
| 7.6 | Contacts get their own permission, off by default | TO DO |
| 7.7 | The reference code | TO DO — **CHANGED**: the system generates it, Aurora's answer, so nobody types it and there is no conflict dialog |
| 7.8 | Address splits into street, postal code, city, country, with country a dropdown | TO DO |
| 7.9 | A language on the account | TO DO |
| 7.10 | An industry field | TO DO |
| 7.11 | A rich-text "about" field | TO DO |
| 7.12 | A logo and a cover image | TO DO |
| 7.13 | Front-end status: active client, past client, archived | TO DO |
| 7.14 | The account shows the total impact: hours and money given back | TO DO |
| 7.15 | A knowledge tab inside an account | TO DO |
| 7.16 | The account type selector stays | **CHANGED** — Aurora wanted it gone. You overruled explicitly: client, company, individual. A sales lead is an individual with no parent, which satisfies her case too |

## 8 · Apps and processes

| # | The thing | Status |
|---|---|---|
| 8.1 | Apps become visual: icon and name, grouped by status | TO DO |
| 8.2 | Active and Inactive tabs, sub-grouped by stage | TO DO |
| 8.3 | Stage becomes a proper choice component | TO DO |
| 8.4 | The context fields come back: about, client context, solution, key actors | TO DO |
| 8.5 | Stakeholders inside an app, one of them the main one | TO DO |
| 8.6 | A related tickets tab | TO DO |
| 8.7 | A related deliverables tab | TO DO |
| 8.8 | A meetings tab | TO DO |
| 8.9 | A knowledge tab | TO DO |
| 8.10 | Staff assigned on the add screen, with a team lead | TO DO |
| 8.11 | Only assigned staff and admins open an app | TO DO — **CHANGED**: everyone still sees it in the overview list, Aurora's note |
| 8.12 | Processes live under the app, with an add button | TO DO |
| 8.13 | Hours and money given back, shown per app | TO DO — **CHANGED**: Aurora's model is the rate of the ROLE that does the process, times hours saved, before minus after. That needs a rate-per-role table that does not exist yet |

## 9 · Meetings and sprints

| # | The thing | Status |
|---|---|---|
| 9.1 | Meeting views: this week, calendar, all | TO DO |
| 9.2 | A transcript creates a work log per participant | TO DO — **CHANGED**: our staff only, not the client's people, Aurora's answer. A client's hour is not our cost |
| 9.3 | Those logs are marked as meeting time and can be excluded from any figure | TO DO |
| 9.4 | "Meeting held" ticks itself when a transcript arrives | TO DO |
| 9.5 | "Add to my calendar" hides when it is already there | TO DO |
| 9.6 | Agenda edited from the edit page; notes open on the detail screen until the meeting closes | TO DO |
| 9.7 | Recurring calendar meetings appear | TO DO — **CHANGED**: a real record is created four weeks ahead, shown read-only before that, Aurora's note |
| 9.8 | Sprints get a calendar view | TO DO |
| 9.9 | Sprints get an overview by type and status | TO DO |
| 9.10 | Sprint types get their icon and colour | TO DO |

## 10 · The Kwapso page and settings

| # | The thing | Status |
|---|---|---|
| 10.1 | A new Kwapso section: brand library, the team, and the legal details | TO DO |
| 10.2 | Brand library moves under it | TO DO |
| 10.3 | A scale setting: text and spacing together, three steps | TO DO |
| 10.4 | Dropdown values move under Settings | TO DO |
| 10.5 | Users and roles move under Settings | TO DO |

## 11 · How it looks

| # | The thing | Status |
|---|---|---|
| 11.1 | Side padding drops to roughly a tenth; wide, with a cap on big screens | TO DO |
| 11.2 | At most two buttons on a title, the rest behind a three-dot menu | TO DO |
| 11.3 | A grey footer with created and last edited, moved off Overview | TO DO |
| 11.4 | Cards: off-white on white, no border, no animation, no pink | **DONE** — it was one stale line forcing cards 6% transparent over a moving orange background, not a colour choice |
| 11.5 | Detail screens: ambient at the top only, clean below the tabs | TO DO |
| 11.6 | Sticky header and tabs with a reduced title and breadcrumbs | TO DO |
| 11.7 | The add button is a plus icon with no text | TO DO |
| 11.8 | An emoji per type on every collection, editable in Dropdown values | TO DO — the app's own law said "no emoji, anywhere". The law was **changed** on 17 Aug rather than worked around: it now says no emoji **in copy**, and defines a type mark that may sit where an icon sits. The full glyph mapping is written |
| 11.9 | Less text in every collection row | TO DO |

## 12 · Knowledge base

| # | The thing | Status |
|---|---|---|
| 12.1 | Reachable from inside an account, app, ticket, story and task, with that record's context fed in | TO DO |
| 12.2 | Learning's articles ingested before Learning is destroyed | **DONE** — all 41 are already indexed. Measured, not assumed |
| 12.3 | Control over who can see what inside it | TO DO |

## 13 · Languages

| # | The thing | Status |
|---|---|---|
| 13.1 | A language switcher in the agency app | **DONE** — live on staging |
| 13.2 | A language switcher in the client portal | **DONE** — **CHANGED**: it sits in the header, not a settings page. You confirmed no settings page for the portal |
| 13.3 | The preference saves and survives a reload | **DONE** — proved live, and it refuses eight kinds of bad input |
| 13.4 | Every string the app says gets translated | **BLOCKED ON YOU** — 794 strings found, 785 wired up. The Anthropic account has no credit, so nothing could be translated. About $5 and one command |
| 13.5 | Translation happens at build time into static files, costing nothing at runtime | **DONE** — the extractor and the translator both exist and run |
| 13.6 | What people type is translated once and cached, never on reload | **BUILDING** |
| 13.7 | A re-translate button when the text and the reader's language differ | **BUILDING** |
| 13.8 | "See original" always available | **BUILDING** |
| 13.9 | The assistant answers in the reader's language | **DONE** |
| 13.10 | The assistant never translates data, only prose | **DONE** — and there is a test that fails if the rule leaves the prompt |
| 13.11 | Everything on the backend stays English: queries, filters, statuses, search | **DONE** by the same rule |
| 13.12 | Top 25 languages | **DONE** — 29 languages, your four first, one exported list |
| 13.13 | Haiku, one pass, no reviewer | **DONE** — **CHANGED**: Aurora wanted a second checking pass. You overruled |
| 13.14 | The language is set per account, overridable per contact, and staff switch their own | **BUILDING** — **CHANGED**: Aurora wanted account-only. You overruled |
| 13.15 | A rule that fails the build when a new string escapes the catalogue | TO DO |

## 14 · Google

| # | The thing | Status |
|---|---|---|
| 14.1 | One refused file no longer empties a whole Drive folder | **DONE** — documents indexed went from 0 with a false error to 8 with none |
| 14.2 | Drive: list, read, upload | **DONE** |
| 14.3 | Drive: edit a file, make a folder, copy mail in | **DONE** — all three driven live against your account and cleaned up |
| 14.4 | Gmail: list, read, draft, send | **DONE** |
| 14.5 | Gmail: reply in a thread, apply a label | Reply **DONE**, proved in-thread. Label **BLOCKED ON YOU** — it needs the `gmail.modify` permission and your existing grant predates it. Reconnect Gmail in Settings and it passes |
| 14.6 | Calendar: list, create | **DONE** |
| 14.7 | Calendar: edit, guests, location, cancel | **DONE** — all four driven live, guests added and removed, event cancelled and the second press stayed silent |
| 14.8 | Chat: read a space, post to it | **DONE** |
| 14.9 | Chat: list every space | **DONE** — 19 spaces found, 2 of them shared |
| 14.10 | Transcripts: read one, and reach it from its event | **DONE** — reached from the diary entry, text read back |
| 14.11 | Every door driven for real against your account, then cleaned up | **DONE** — 42 of 44 checks pass. Drive back to its original 8 files, zero sweep events in the calendar, zero sweep messages in either space |
| 14.12 | Google comes into step when you open the app, not only on a button | TO DO |

## 15 · Things deliberately NOT being done

| # | The thing | Why not |
|---|---|---|
| 15.1 | Splitting companies and contacts into two database tables | It would cap a person at one company. Marta is a contact at two. The screens split completely either way, which is what Aurora actually asked for |
| 15.2 | Deleting the team plumbing | Aurora asked to kill it. Hiding the screens costs nothing and keeps the thing you fork for a paying client. Your decision, given twice |
| 15.3 | Rewriting git history to erase the purged modules | You chose code, database, docs, rules and scope. Rewriting published history breaks every existing clone and buys nothing |
| 15.4 | Editing the `@kwapso/ui` library | It is a separate repository, and your instruction was explicit: rearrange what we have, do not refactor the library |
| 15.5 | A second review pass over each translation | You overruled Aurora. Haiku on medium thinking, one pass |
| 15.6 | A settings page in the client portal | You confirmed none is needed. The picker sits in the header |
| 15.7 | A new staging backdoor | One already exists, refuses production in code, and carries its own dedicated secret. Building a second would add attack surface for nothing |
| 15.8 | "What it costs us a month" on an app | Aurora deferred it to version two herself: "it's a much more complex topic, not a single number" |
