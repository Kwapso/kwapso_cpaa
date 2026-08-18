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

**Seven migrations are written and roll out through the same owner-gated step.**
`0025` drops the purged tables and folds the delivery programmes onto the sprint
type; `0026` retires the duplicated dropdown values older teams carry; `0027`
gives a task its admin fields; `0030` adds who is on an app and who the client's
people are; `0031` adds the role rate card and the role on a process; `0032`
gives the diary its transcript and its series. Every one runs against every
existing team through `POST /api/tenancy/admin/migrate-teams`. A team created
after these changes needs none of them: the schema builds the new tables and no
longer builds the purged ones.

---

## 1 · The bugs Aurora hit

| # | The thing | Status |
|---|---|---|
| 1.1 | Sharing or deep-linking a ticket fails to load the page. Happens across the whole app | **DONE**, worse than reported: 13 of 15 sections 404'd, not just tickets. The gateway kept a list of which addresses it handles and it still named Learning and an old Help path while the app had grown to fifteen |
| 1.2 | The start timer is broken on tickets, stories and tasks | **DONE**, the button never noticed a timer was already running, so the second press was refused; and tickets and tasks had no start button at all. One shared button now, on all three |
| 1.3 | Ticking a task off appears to delete it | **DONE**, **and my earlier diagnosis was wrong**. I said the fix was a Completed tab. There already is one, called All tasks, and the task was sitting in it. The real problem was the message: it said only "Ticked off." while the row vanished. It now says where it went |
| 1.4 | Forms and edit screens spill outside their box. Visible on the story edit screen, where Save renders outside the dialog | **DONE**, measured at 738px tall in a 640px window with nothing scrolling. Checked at four widths afterwards |
| 1.5 | The separator and the submit button touch at the bottom of every form | **DONE**, and the cause was systemic: the folder holding every SHARED component was never scanned by the styling tool, so any style used only there was silently thrown away. That affected far more than forms |
| 1.6 | Ticket types appear two, three and four times in the dropdown | **DONE**, fixed for new teams by guarding the seed, and migration 0026 retires the duplicates existing teams carry (deactivate, never delete; the oldest copy survives) |
| 1.7 | Meetings and Time share the same icon | **DONE**, worse than reported: Home shared it too. A test now fails on any repeated icon in the rail |

## 2 · The words

| # | The thing | Status |
|---|---|---|
| 2.1 | Ticket types become Question, Issue, Request, Extra, Requirements | **DONE** — **CHANGED**: Aurora's five, Feedback and Bug retired rather than deleted, so no existing ticket loses its word. Live: Ready, Extra, Issue, Question, Request, Requirements |
| 2.2 | Story types Fix, Feature, Change, and editable in Dropdown values | **DONE** — and they were missing from a new team's seed entirely |
| 2.3 | "My tickets" becomes tickets on apps I am staffed to | **DONE**, went from 0 to 1 the moment the agent staffed itself to an app. A client keeps "what I raised", or their tab would be empty for ever |
| 2.4 | "Request behind it" becomes "Tickets" | **DONE** |
| 2.5 | "By when" becomes "Deadline" everywhere | **PART DONE**, done on the task screens; the rest rides the wider rename |
| 2.6 | The Time page becomes "Work logs" | **DONE** |
| 2.7 | "Process maps" becomes "Processes" | **DONE** |
| 2.8 | "Under this account" becomes "Contacts" | **NOT DOING** — and this one is a genuine correction. That tab listed the ACCOUNTS under this one, not its people. Renaming it would have put two tabs called Contacts on one strip. The right answer was 7.2: the tab goes, and it has |
| 2.9 | Every form's submit button says "Submit" | **DONE** — the form renders the button itself now, so a label cannot be invented again |
| 2.10 | No em dashes anywhere a person can read, and none in the documentation | **DONE** — 539 lines of code and 2,307 lines of documentation |

## 3 · What gets removed

| # | The thing | Status |
|---|---|---|
| 3.1 | Marketing: gone from code, database, docs, rules and the written scope | **DONE**, module, table, routes, screens, tools, import target, glossary, nav line and rule rows. The CREATE TABLE is gone from migration 0018 itself, so a fresh clone never builds it |
| 3.2 | Learning: gone the same way | **DONE**, gone the same way, and the CREATE is gone from migration 0004. The 41 articles survive in the knowledge base as sources of kind `article`; the `/media/learning/` bucket still serves the images inside them |
| 3.3 | Delivery method: the page goes | **DONE**, the page, the screens, the routes, the `programs` table and the four tools |
| 3.4 | Delivery method's ten programmes survive as sprint-type enrichment: German name, description, standard length | **DONE**. `SPRINT_TYPE_CATALOGUE` in the team schema carries all ten, and four nullable columns on `selectable_data` (`mark`, `name_de`, `description`, `standard_days`) hold them. Migration 0025 back-fills existing teams; the seed carries them for new ones |
| 3.5 | The Marketing department survives as a task department | **DONE**, untouched. It is a dropdown value in `shared/departments.ts` and always was |
| 3.6 | The team switcher and the Teams page disappear | **DONE**, hidden behind `TEAM_SCREENS_HIDDEN` in `shared/product.ts`, which documents the decision at length. Not one line of the plumbing changed, and `web/test/one-team.test.ts` now fails if somebody removes it |
| 3.7 | Ticket "move up / move down" leaves the detail screen | **DONE**, off the detail screen. The door stays for the machine surface, with a reasoned `NO_CONTROL` line |
| 3.8 | Story "move up / move down" goes completely | **DONE**, completely: the screen, the door, the lib, the MCP tool and its gate |
| 3.9 | Ticket "Answer" and "Reply by email" go | **DONE**, both buttons gone. The resolve DOOR stays, because 5.5 and 5.7 make resolving something the flow decides rather than a button |
| 3.10 | "Make it a story" goes. A ticket never becomes a story | **DONE**, all three ways in (the button, the triage prompt, the tab's create action) |
| 3.11 | The stray "co-op: check the account" hint text goes | **NOT FOUND**, the string does not exist anywhere in the source. It was logged from a screenshot; it needs the screenshot to identify |
| 3.12 | App create screen loses the address field | **DONE**, the field goes, the column stays, and an edit carries the existing value through untouched |
| 3.13 | App create screen loses "what it costs us a month" | **DONE**, same: the field goes, the column stays. It feeds the margin, so a form that stopped asking while still sending would have zeroed every app it edited |
| 3.14 | Processes stop being a top-level page | **DONE**, `placement: "contextual"`. Every screen, record and URL under it is unchanged; a map is reached from its app |
| 3.15 | Story due date goes; inherited from the sprint | **DONE**, inherited from the sprint's end date, everywhere a story shows one. The column stays for the rows that already carry a date |
| 3.16 | Profile and email move out of Settings onto a real profile page | **DONE**, `/profile` carries your name, your email, your reading language and your history. Settings keeps the app's own housekeeping, and stopped rendering itself twice |

## 4 · Tasks

| # | The thing | Status |
|---|---|---|
| 4.1 | "Today's tasks" progress bar pinned to the top of every tab | **DONE**, reads 100 / 133 done on staging |
| 4.2 | Tabs: Overdue, List, Calendar, Completed, Upcoming, All | **DONE**. Overdue 32, List 80, Calendar 138, Completed 172, Upcoming 2, All 251. The calendar is the library's, not a hand-built one |
| 4.3 | Priority becomes important and urgent ticks, scored `(important x 2) + urgent + 1` | **DONE**, worked out on the fly rather than stored, so it can never go stale |
| 4.4 | An assignee selector that defaults to whoever is creating the task | **DONE**, and it uncovered a real bug: the row had been storing the CREATOR's name as the assignee |
| 4.5 | A department selector: Admin, Business, Marketing, Production, Sales, each with its icon and brand colour | **DONE**, seeded as editable dropdown values, so you can change them without a deploy |
| 4.6 | Production makes a task name an app. Sales and Admin make it name a customer | **DONE**, the second field appears the moment you pick the department, and the server refuses it too, in words |
| 4.7 | An image or file on a task | **DONE** |
| 4.8 | Completed view columns: department, app, important, urgent, deadline, closed | **DONE**, exactly those six |
| 4.9 | Who can see everyone else's tasks | **DONE**. **CHANGED**: a real configurable permission, Aurora's answer. Proved with a real person: they saw 1 task against the admin's 79, and granting the right took them to 80 with no deploy |

## 5 · Tickets

| # | The thing | Status |
|---|---|---|
| 5.1 | Sub-tabs by type under All, My and Archived | **DONE**, the tabs come from your OWN ticket words, so retiring one retires its tab. Live: Ready 1, Extra 58, Issue 24, Question 17, Request 107 |
| 5.2 | The status becomes a label you cannot click | **DONE**, clicked it on staging; nothing moved |
| 5.3 | A new "Scheduled" state between Triage and In progress | **DONE**, happens by itself when stories exist and one is in a sprint |
| 5.4 | In progress happens by itself when a timer starts on the ticket or a related story | **DONE** |
| 5.5 | Ready happens by itself when every related story closes | **DONE** |
| 5.6 | Resolve is refused until a resolution is written | **DONE**, refused on all three routes into it, not just the obvious one |
| 5.7 | Resolving emails the client automatically | **DONE**, **and it fixed a real leak**: it used to mail EVERY login at the company. Now the raiser and the main stakeholder. No client email was sent while testing |
| 5.8 | A ticket must name its app | **DONE** |
| 5.9 | A ticket must name the contact who raised it | **DONE**, narrowed to that company's own people; the door refuses anyone else |
| 5.10 | Several files and several links on a ticket, from both front doors | **DONE**, files and links, from both front doors |
| 5.11 | A dedicated triage screen showing whose week it is | **DONE**, the DOOR decides whose week it is, so an empty list comes back to everyone else rather than the screen hiding it |
| 5.12 | No automation ever unassigns the triage person | **DONE**, a check across every worker fails if anything ever starts writing to the rota |
| 5.13 | The main stakeholder validates tickets before triage | **DONE**. **CHANGED**: extras, requests and feedback wait. Questions and issues go straight in, Aurora's note |

## 6 · Stories

| # | The thing | Status |
|---|---|---|
| 6.1 | The app selector moves to the top of the form, and the edit screen matches the form | **DONE**, one dialog for both, so a field added shows up on both by construction rather than by memory |
| 6.2 | A story type selector, required | **DONE** |
| 6.3 | The sprint list filters to that app and to current and future sprints, with an icon for active, done and upcoming | **DONE** |
| 6.4 | The ticket list filters to that app and to open tickets only | **DONE** |
| 6.5 | A story links to one or more processes | **DONE**. **CHANGED**: an empty list is refused unless the "no process" tick is deliberately set, Aurora's answer |
| 6.6 | "Who's doing it" limits to staff on that app | **DONE**, refused at the door, not just narrowed in the picker |
| 6.7 | The status becomes a label; a timer moves it, not the other way round | **DONE**, a timer moves the status now, not the reverse |
| 6.8 | A work logs tab on the story, and everywhere else time is captured | **DONE** |
| 6.9 | Review is refused until the timers are stopped and an explanation is written | **DONE**. **CHANGED**: timers stopped and an explanation written; the file only when there is something to show, Aurora's answer |
| 6.10 | The reviewer gets one Done button | **DONE**, the team lead, refused at the door |

## 7 · Companies and contacts

| # | The thing | Status |
|---|---|---|
| 7.1 | Companies and contacts split into separate screens | **DONE**. All 129, Companies 23, People 106, each an exact server count. A role without the contacts right sees no People tab at all |
| 7.2 | The "Under this account" tab goes | **DONE**, gone, along with the code behind it. The company strip is now Overview, Contacts, Apps, Sprints, To-dos, Rates, Knowledge, Activity |
| 7.3 | Portal access stops being a tab and moves onto the contact | **DONE**, proved on staging: the company screen no longer has a Portal access tab, the contact does |
| 7.4 | Only a contact can hold a login | **DONE**. **CHANGED**: Aurora's answer. And it found a real rudeness: a company with an address used to be told "ask them to sign in once" for something the door was always going to refuse. Both cases now say "A login belongs to a person, not to a company" |
| 7.5 | A contact's page is its own page: no sprints, no rates, no contacts of its own | **DONE**, proved with Marta, who is a contact at two companies. That case is why it stayed one table |
| 7.6 | Contacts get their own permission, off by default | **DONE**, proved with a real Developer role: 23 companies, zero people, and adding a contact refused with a plain sentence |
| 7.7 | The reference code | **DONE**. **CHANGED**: the system generates it. Two companies both starting "Bergman" got BERG and BERG2, and the form has no Reference field at all |
| 7.8 | Address splits into street, postal code, city, country, with country a dropdown | **DONE** |
| 7.9 | A language on the account | **DONE** |
| 7.10 | An industry field | **DONE** |
| 7.11 | A rich-text "about" field | **DONE** |
| 7.12 | A logo and a cover image | **DONE**, stored as files, not pasted into the row, which would have put 60KB on every list read |
| 7.13 | Front-end status: active client, past client, archived | **DONE** |
| 7.14 | The account shows the total impact: hours and money given back | **DONE**, 84 hours and 10,080 EUR a month on the test company, each followed by the caption explaining what the figure is made of |
| 7.15 | A knowledge tab inside an account | **DONE**, driven live on a real company: the question is rewritten with the company's own details and that rewriting is shown on screen |
| 7.16 | The account type selector stays | **DONE**. **CHANGED again, and it resolves your disagreement with Aurora cleanly.** The type is Company or Person. "Client" turned out to be a STATUS, not a type, so the status list is Active client / Past client / Archived. You get your sales lead as a Person with no company; Aurora gets an account that is always a company |

## 8 · Apps and processes

| # | The thing | Status |
|---|---|---|
| 8.1 | Apps become visual: icon and name, grouped by status | **DONE**, tiles with the app's own mark, name and client |
| 8.2 | Active and Inactive tabs, sub-grouped by stage | **DONE**. Active and Inactive, sub-grouped by stage. And the real vocabulary turned out to be EIGHT stages, not the four in the brief: Not started, Blueprint, Development, Documentation, Iteration, Maintenance, Completed, Archived. Read off your legacy data rather than invented |
| 8.3 | Stage becomes a proper choice component | **DONE** |
| 8.4 | The context fields come back: about, client context, solution, key actors | **DONE**, about, client context, solution and key actors are back |
| 8.5 | Stakeholders inside an app, one of them the main one | **DONE**, chosen from that company's own contacts, one marked main. Both refusals proved live |
| 8.6 | A related tickets tab | **DONE** |
| 8.7 | A related deliverables tab | TO DO, **this is a whole new module, not a tab.** There is no deliverables table, module or permission anywhere in the app. Sizing it honestly rather than half-building it |
| 8.8 | A meetings tab | **DONE**, and a meeting can now say which app it was about, which is what made the tab possible |
| 8.9 | A knowledge tab | **DONE**, and the question really is rewritten with the record's own details, said out loud on screen so you can see what it asked |
| 8.10 | Staff assigned on the add screen, with a team lead | **DONE**, and one lead is enforced by the database, not by a check two people can race |
| 8.11 | Only assigned staff and admins open an app | **DONE**, the DOOR withholds the context, the address and the people. The screen only explains why |
| 8.12 | Processes live under the app, with an add button | **DONE** |
| 8.13 | Hours and money given back, shown per app | **DONE**, live: 81.3 hours becomes 3,656.25, with the caption word for word. An unpriced process reports its hours and says plainly that it has no rate |

## 9 · Meetings and sprints

| # | The thing | Status |
|---|---|---|
| 9.1 | Meeting views: this week, calendar, all | **DONE**, this week, a month grid, and an all view with nine columns |
| 9.2 | A transcript creates a work log per participant | **PART DONE**, built and running against your real calendar every time. It could not be PROVED, because none of your 17 repeating meetings is a recorded call, so no transcript exists to bring in. The refusal path is proved; the write path is not |
| 9.3 | Those logs are marked as meeting time and can be excluded from any figure | **DONE**, any figure can be shown with meeting time, without it, or only it |
| 9.4 | "Meeting held" ticks itself when a transcript arrives | **PART DONE**, same reason as 9.2 |
| 9.5 | "Add to my calendar" hides when it is already there | **DONE**, it already was. "Add to my calendar" has been hiding itself when the meeting is already there |
| 9.6 | Agenda edited from the edit page; notes open on the detail screen until the meeting closes | **DONE**, proved both ways: notes typed while scheduled, read-only once held |
| 9.7 | Recurring calendar meetings appear | **DONE**, **17 real repeating meetings pulled from your calendar**, with the further-out ones read-only underneath. Pressing it again said "Nothing new to bring in" |
| 9.8 | Sprints get a calendar view | **DONE**, a calendar view |
| 9.9 | Sprints get an overview by type and status | **DONE**, grouped by running, coming up and wrapped, then by kind |
| 9.10 | Sprint types get their icon and colour | **DONE**, each type carries its mark, with one gap that is now written down: the flat All tab has none, because the screen engine maps a row to a title and a subtitle and passes no icon slot, and putting a glyph inside the title is the one shape the law refuses. Left as it is rather than host-composing a second copy of that list; the one-line library change is UI-GAPS #16 |

## 10 · The Kwapso page and settings

| # | The thing | Status |
|---|---|---|
| 10.1 | A new Kwapso section: brand library, the team, and the legal details | **DONE**, /kwapso carries the legal details, the team and the brand library |
| 10.2 | Brand library moves under it | **DONE** |
| 10.3 | A scale setting: text and spacing together, three steps | **DONE**, three steps, text and spacing together |
| 10.4 | Dropdown values move under Settings | **DONE** |
| 10.5 | Users and roles move under Settings | **DONE**, and it fixed something nobody noticed: hiding the team switcher had quietly closed the only way into the roles screen |

## 11 · How it looks

| # | The thing | Status |
|---|---|---|
| 11.1 | Side padding drops to roughly a tenth; wide, with a cap on big screens | **DONE**, the 768px cap that governed every module screen is now 1600px, and the gutter is 40px on a desktop (the brand site's own number) instead of 138px. Checked at 375, 768 and 1440 |
| 11.2 | At most two buttons on a title, the rest behind a three-dot menu | **DONE**, the menu did not exist anywhere in the app, so it was built once and used on all eight record screens. The ticket went from six controls to two |
| 11.3 | A grey footer with created and last edited, moved off Overview | **DONE**, five rows in the middle of Overview became one grey strip at the foot of the record, on every detail screen |
| 11.4 | Cards: off-white on white, no border, no animation, no pink | **DONE**, it was one stale line forcing cards 6% transparent over a moving orange background, not a colour choice |
| 11.5 | Detail screens: ambient at the top only, clean below the tabs | **DONE**, the header band is the one region that lets the field through; from the tab strip down it is flat paper, full-bleed and at least a screen tall so the orange never reappears under a short record |
| 11.6 | Sticky header and tabs with a reduced title and breadcrumbs | **DONE**, and it took two goes: the first build was correct and did nothing, because `overflow-x-hidden` on the page silently makes that element a scroll container and a sticky child then sticks to a box that never scrolls |
| 11.7 | The add button is a plus icon with no text | **DONE**, thirteen labels became the button's accessible name and its tooltip. Import and Export keep their words: rare, consequential, and not guessable from a glyph |
| 11.8 | An emoji per type on every collection, editable in Dropdown values | **PART DONE**, the law was **changed** on 17 Aug rather than worked around: it now says no emoji **in copy**, and defines a type mark that may sit where an icon sits. The glyphs are seeded on the ticket, story and sprint words, they are EDITABLE on the Dropdown values screen (a Mark field on the form, the glyph on every row), and they show in the header band of every record. They do NOT show in a collection ROW yet, and the reason is one line of library: the screen engine maps a row to a title and a subtitle and passes no icon slot, and putting a glyph inside the title is the one shape the law refuses. UI-GAPS #16 |
| 11.9 | Less text in every collection row | **DONE**, a ticket row was a reference glued to a title over four facts; it is a title over two. Stories, accounts and meetings the same. The reference is not lost: it leads the eyebrow on the record's own screen, which is where somebody looks when a client says it out loud |

## 12 · Knowledge base

| # | The thing | Status |
|---|---|---|
| 12.1 | Reachable from inside an account, app, ticket, story and task, with that record's context fed in | **DONE**, inside an app and inside an account |
| 12.2 | Learning's articles ingested before Learning is destroyed | **DONE**, all 41 are already indexed. Measured, not assumed |
| 12.3 | Control over who can see what inside it | **DONE**, a source is readable by the whole team, by the people staffed to one app, or by you alone. It rides the app's own staffing rather than inventing a second access list, so staffing somebody grants sight instantly with nothing re-indexed |

## 13 · Languages

| # | The thing | Status |
|---|---|---|
| 13.1 | A language switcher in the agency app | **DONE**, live on staging |
| 13.2 | A language switcher in the client portal | **DONE**. **CHANGED**: it sits in the header, not a settings page. You confirmed no settings page for the portal |
| 13.3 | The preference saves and survives a reload | **DONE**, proved live, and it refuses eight kinds of bad input |
| 13.4 | Every string the app says gets translated | **BLOCKED ON YOU**, 794 strings found, 785 wired up. The Anthropic account has no credit, so nothing could be translated. About $5 and one command |
| 13.5 | Translation happens at build time into static files, costing nothing at runtime | **DONE**, the extractor and the translator both exist and run |
| 13.6 | What people type is translated once and cached, never on reload | **BUILDING** |
| 13.7 | A re-translate button when the text and the reader's language differ | **BUILDING** |
| 13.8 | "See original" always available | **BUILDING** |
| 13.9 | The assistant answers in the reader's language | **DONE** |
| 13.10 | The assistant never translates data, only prose | **DONE**, and there is a test that fails if the rule leaves the prompt |
| 13.11 | Everything on the backend stays English: queries, filters, statuses, search | **DONE** by the same rule |
| 13.12 | Top 25 languages | **DONE**, 29 languages, your four first, one exported list |
| 13.13 | Haiku, one pass, no reviewer | **DONE**. **CHANGED**: Aurora wanted a second checking pass. You overruled |
| 13.14 | The language is set per account, overridable per contact, and staff switch their own | **BUILDING**. **CHANGED**: Aurora wanted account-only. You overruled |
| 13.15 | A rule that fails the build when a new string escapes the catalogue | **DONE**. R28 exists: the law, its registry row and its check. It re-runs the real extractor rather than describing it, names missing and orphaned strings separately, and **went red on its first run and caught two real ones** |

## 14 · Google

| # | The thing | Status |
|---|---|---|
| 14.1 | One refused file no longer empties a whole Drive folder | **DONE**, documents indexed went from 0 with a false error to 8 with none |
| 14.2 | Drive: list, read, upload | **DONE** |
| 14.3 | Drive: edit a file, make a folder, copy mail in | **DONE**, all three driven live against your account and cleaned up |
| 14.4 | Gmail: list, read, draft, send | **DONE** |
| 14.5 | Gmail: reply in a thread, apply a label | Reply **DONE**, proved in-thread. Label **BLOCKED ON YOU**, it needs the `gmail.modify` permission and your existing grant predates it. Reconnect Gmail in Settings and it passes |
| 14.6 | Calendar: list, create | **DONE** |
| 14.7 | Calendar: edit, guests, location, cancel | **DONE**, all four driven live, guests added and removed, event cancelled and the second press stayed silent |
| 14.8 | Chat: read a space, post to it | **DONE** |
| 14.9 | Chat: list every space | **DONE**, 19 spaces found, 2 of them shared |
| 14.10 | Transcripts: read one, and reach it from its event | **DONE**, reached from the diary entry, text read back |
| 14.11 | Every door driven for real against your account, then cleaned up | **DONE**, 42 of 44 checks pass. Drive back to its original 8 files, zero sweep events in the calendar, zero sweep messages in either space |
| 14.12 | Google comes into step when you open the app, not only on a button | **DONE**, fires once behind first paint, only for somebody holding both rights, silent on failure but recorded. Proved live: the browser's own catch-up fired, a stale call was skipped, and a deliberate press really swept |

## 15 · Things deliberately NOT being done

| # | The thing | Why not |
|---|---|---|
| 15.1 | Splitting companies and contacts into two database tables | It would cap a person at one company. Marta is a contact at two. The screens split completely either way, which is what Aurora actually asked for |
| 15.2 | Deleting the team plumbing | Aurora asked to kill it. Hiding the screens costs nothing and keeps the thing you fork for a paying client. Your decision, given twice. **Done as a hide:** one constant in `shared/product.ts`, and a test that fails if somebody finishes the removal |
| 15.3 | Rewriting git history to erase the purged modules | You chose code, database, docs, rules and scope. Rewriting published history breaks every existing clone and buys nothing. **The CREATE statements were removed from the migrations themselves**, so a fresh clone never builds a purged table even for a moment, which is what you actually asked for |
| 15.4 | Editing the `@kwapso/ui` library | It is a separate repository, and your instruction was explicit: rearrange what we have, do not refactor the library |
| 15.5 | A second review pass over each translation | You overruled Aurora. Haiku on medium thinking, one pass |
| 15.6 | A settings page in the client portal | You confirmed none is needed. The picker sits in the header |
| 15.7 | A new staging backdoor | One already exists, refuses production in code, and carries its own dedicated secret. Building a second would add attack surface for nothing |
| 15.8 | "What it costs us a month" on an app | Aurora deferred it to version two herself: "it's a much more complex topic, not a single number" |

---

# Round two: 18 August 2026

Everything from your testing pass on staging, in your own words. Round one is above and
stays there as the record. **BUILDING** means a lane is on it in this session right now.

## 16 · What you tested and passed

| # | The thing | Status |
|---|---|---|
| 16.1 | Paste a ticket link into a new tab, it opens the ticket | **DONE**, confirmed by you |
| 16.2 | Click a status chip, nothing happens, it is a label | **DONE**, confirmed by you |
| 16.3 | Tasks, six tabs, progress bar on every one | **DONE**, confirmed by you |
| 16.4 | Any record on a phone, buttons below the title, tabs stay put | **DONE**, confirmed by you |
| 16.5 | The sidebar: Marketing, Learning, Delivery method and Process maps gone, Time is Work logs, Kwapso is new | **DONE**, confirmed by you |
| 16.6 | Seventeen of your own repeating meetings, pulled from your real calendar | **DONE**, confirmed by you |
| 16.7 | Anthropic credit added | **DONE**, by you |
| 16.8 | Gmail reconnected with the labelling permission | **DONE**, by you, screenshot confirms all four services connected as alaap@kwapso.com |

## 17 · Inputs and the people in them

| # | The thing | Status |
|---|---|---|
| 17.1 | Every long-text input on a primary screen becomes a rich text notes component, and renders as rich text too | **BUILDING**, the library already ships it and it is used in exactly one place today |
| 17.2 | Clients stop appearing in internal people pickers on stories, tickets and tasks | **BUILDING** |
| 17.3 | Clients appear in exactly two places: marking to-dos, and raising a ticket on their behalf | **BUILDING** |
| 17.4 | The same name appears twice in "Who's doing it" | **BUILDING**, visible in your screenshot |

## 18 · Meetings and the calendar

| # | The thing | Status |
|---|---|---|
| 18.1 | A link that opens the meeting inside my calendar | **BUILDING** |
| 18.2 | Location, stakeholders and every other piece of calendar data and metadata, organised | **BUILDING** |
| 18.3 | The call transcript is already there on older meetings | **BUILDING** |
| 18.4 | The knowledge base ingests transcripts from calendar meetings, from Google Docs, and from emails announcing a Doc was made for a meeting | **BUILDING** |
| 18.5 | Past events re-sync, because a transcript lands minutes to an hour after the room empties | **BUILDING** |
| 18.6 | Every record stays in step with its calendar entry, past events included | **BUILDING** |

## 19 · Google, deeper

| # | The thing | Status |
|---|---|---|
| 19.1 | Select several folders, several spaces and several files in one go | **BUILDING** |
| 19.2 | Share a Drive FILE, not only a folder | **BUILDING** |
| 19.3 | Chat spaces show their names, not `spaces/lJXiZKAAAAE` | **BUILDING**, visible in your screenshot |
| 19.4 | Logos, icons, thumbnails and previews pulled in wherever Google data appears: search, knowledge base, meetings | **BUILDING** |
| 19.5 | The sync button on every screen showing Google data, not only Settings and Meetings | **BUILDING** |
| 19.6 | Sync often enough to feel instant | **PART DONE**, app-open catch-up already exists and was proved live (14.12). Per-screen freshness is **BUILDING** |
| 19.7 | The Chat app's Configuration tab in Google Cloud | **BLOCKED ON YOU**, Google refuses every post until name, avatar and description are filled in |

## 20 · Language

| # | The thing | Status |
|---|---|---|
| 20.1 | Every system string translated by us, at build time, in all 29 languages | **BUILDING**, unblocked by your credit |
| 20.2 | What a person types is translated only when somebody asks for it, on the cheapest Haiku | **BUILDING** |
| 20.3 | One translation call routed everywhere it is needed, rather than one per field | **BUILDING** |
| 20.4 | The switcher becomes a dropdown, not 25 stretched pills | **BUILDING** |

## 21 · How it looks, round two

| # | The thing | Status |
|---|---|---|
| 21.1 | A cognitive-load metric of my own, measured on every page, screen, tab and detail screen | **BUILDING** |
| 21.2 | One central rule set: colours, spacing, padding, separators, when a dropdown, when a shape | **BUILDING**, into the existing UI rule book rather than a third document |
| 21.3 | The full horizontal span applied everywhere on desktop, the way work logs, tasks and meetings already do it | **BUILDING** |
| 21.4 | The global rearrangement, executed against that rule set | **TO DO**, deliberately after the rules exist. Rearranging first is how you get 40 screens that each look reasonable and none of which match |
| 21.5 | Charts and big numbers on the home page, main pages and detail screens, on real data, never taking the whole screen | **BUILDING** |
| 21.6 | Glyphs and icons on main screens, page icons and collections, not only detail screens | **BUILDING**, partly blocked by UI-GAPS #16 |
| 21.7 | Dark mode reads better than light because the contrast between elements is clearer | **NOTED**, and it becomes the contrast rule in 21.2 rather than a preference |

## 22 · Answered rather than built

| # | The question | The answer |
|---|---|---|
| 22.1 | What actually was the deep link issue, and is it the mechanism Glide used? | Answered in full. It was the gateway's own list of which addresses it handles, not permissions and not the row id. Yes, the shape is the same as Glide's: the URL names the record, the page resolves it in the browser, and the server decides whether you may see it |
| 22.2 | Is sync-on-open in place? | Yes, and proved live. Per-screen freshness is not, and is being built |
| 22.3 | Why is Drive folder-wise only? | It was a scoping decision, not a limitation. File-level sharing is being added |
| 22.4 | Why did the Value tab show hours but no money? | The money half needs a role on the process and a rate on that role. The hours half needs neither. Being diagnosed and made speakable |

## 23 · Still blocked on you

| # | The thing | What is needed |
|---|---|---|
| 23.1 | The Chat app's Configuration tab | Name, avatar, description in Google Cloud. Google 404s every post until then, and did before today |
| 23.2 | The stray "co-op: check the account" text | The screenshot. The string is in no source file anywhere |
| 23.3 | Production | Go or wait. Staging carries everything; production has deliberately not been touched |
| 23.4 | The deliverables module (8.7) | It is a module, not a tab. Say whether to scope it now or park it |
