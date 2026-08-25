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
gives Meetings its transcript and its series. Every one runs against every
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
| 9.4 | "Meeting held" ticks itself when a transcript arrives | **WITHDRAWN 18 Aug 2026.** The owner: *"this held mark is held release. I don't care. It's too complicated."* A meeting's own start time already says whether it has happened, so the status was a second source of truth for a question the clock answers. Retired; the transcript still writes the work logs (9.2) and is still idempotent, on `transcript_captured_at` rather than on any status |
| 9.5 | "Add to my calendar" hides when it is already there | **WITHDRAWN 18 Aug 2026.** There is no "Add to my calendar": the calendar is one-way, kwapso reads a calendar and never writes one |
| 9.6 | Agenda edited from the edit page; notes open on the detail screen | **DONE**. The notes used to close once a meeting was ticked held; nothing could know the writing-up was finished, so the field shut on exactly the people it was built for. They are open now until the meeting is cancelled |
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
| 13.4 | Every string the app says gets translated | **MOSTLY DONE, the last stretch is YOUR CALL.** 1,441 sentences now, translated into German, Spanish and Catalan — a sentence rather than a bug, which is why the key IS the English. Two things changed since this line was written. Your account has credit again. And the seed now wins ON SCREEN, not only inside the generator (`SPOKEN = overlay(CATALOGUE, SEED)`), so a translation can be written by hand and reach a reader without spending anything — which it could not before: the only documented way to add one was to run the generator, and the generator spends your key. Finishing the last 300 by machine is one command and your permission; I have not run it |
| 13.5 | Translation happens at build time into static files, costing nothing at runtime | **DONE**, the extractor and the translator both exist and run |
| 13.6 | What people type is translated once and cached, never on reload | **BUILDING** |
| 13.7 | A re-translate button when the text and the reader's language differ | **BUILDING** |
| 13.8 | "See original" always available | **BUILDING** |
| 13.9 | The assistant answers in the reader's language | **DONE** |
| 13.10 | The assistant never translates data, only prose | **DONE**, and there is a test that fails if the rule leaves the prompt |
| 13.11 | Everything on the backend stays English: queries, filters, statuses, search | **DONE** by the same rule |
| 13.12 | Top 25 languages | **REVERSED 2026-08-20 on the owner's call.** Four languages — English, German, Spanish, Catalan — because those are the four somebody here can read well enough to notice a wrong sentence. The other 25 were large, not checked. R28 now fails on a translation for a language `LANGUAGES` does not declare |
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
| 14.5 | Gmail: reply in a thread, apply a label | Reply **DONE**, proved in-thread. Label **BLOCKED ON YOU**, it needs the `gmail.modify` permission and your existing grant predates it. **19 Aug 2026: the app now SAYS so** — the Settings card names a connection short of a permission, and the label door refuses with "your Gmail connection was made before kwapso could do that" instead of a 403 blaming a grant you never touched. It still needs the reconnect, and the calendar reconnect is the same one |
| 14.13 | Gmail: bin a draft, a message, a conversation | **BUILT 19 Aug 2026**, not yet driven live: `POST /api/content/google/gmail/trash` + `google_mail_trash`. The draft half works on your current grant; the message and conversation halves need the same `gmail.modify` as 14.5. The bin only — a permanent delete needs the full-mailbox scope and this app asks for it nowhere |
| 14.6 | Calendar: list, create | **LIST DONE. CREATE WITHDRAWN 18 Aug 2026**, the calendar is one-way. **19 Aug 2026: the GRANT is read-only too** (`calendar.readonly`), which needs a reconnect to take effect — a narrower ask alone changes nothing, because a grant at Google is additive per OAuth client |
| 14.7 | Calendar: edit, guests, location, cancel | **WITHDRAWN 18 Aug 2026.** All four were built and driven live; all four are gone, with the doors and the tools under them. The owner: *"disable the ability to create, edit, or delete anything in the calendar from the frontend"* |
| 14.8 | Chat: read a space, post to it | **DONE** |
| 14.9 | Chat: list every space | **DONE**, 19 spaces found, 2 of them shared |
| 14.10 | Transcripts: read one, and reach it from its event | **DONE**, reached from the calendar event, text read back |
| 14.11 | Every door driven for real against your account, then cleaned up | **DONE**, 42 of 44 checks pass. Drive back to its original 8 files, zero sweep events in the calendar, zero sweep messages in either space |
| 14.12 | Google comes into step when you open the app, not only on a button | **DONE**, fires once behind first paint, only for somebody holding both rights, silent on failure but recorded. Proved live: the browser's own catch-up fired, a stale call was skipped, and a deliberate press really swept |

## 15 · Things deliberately NOT being done

| # | The thing | Why not |
|---|---|---|
| 15.1 | Splitting companies and contacts into two database tables | It would cap a person at one company. Marta is a contact at two. The screens split completely either way, which is what Aurora actually asked for |
| 15.2 | Deleting the team plumbing | Aurora asked to kill it. Hiding the screens costs nothing and keeps the thing you fork for a paying client. Your decision, given twice. **Done as a hide:** one constant in `shared/product.ts`, and a test that fails if somebody finishes the removal |
| 15.3 | Rewriting git history to erase the purged modules | You chose code, database, docs, rules and scope. Rewriting published history breaks every existing clone and buys nothing. **The CREATE statements were removed from the migrations themselves**, so a fresh clone never builds a purged table even for a moment, which is what you actually asked for |
| 15.4 | Editing the UI library | **This one has since been overtaken.** At the time it was a separate repository and your instruction was explicit: rearrange what we have, do not refactor the library. On 2026-08-22 the library was vendored into this repo at `shared/ui/` for the reskin, because a token remap cannot change a component's shape, so for three days editing it was on the table. Overtaken a second time on 2026-08-25: the vendored copy is PINNED to `github.com/Kwapso/design` at the tag in `shared/ui/VERSION.json`, a hand-edit turns the build red (`web/test/vendored-kit.test.ts`), and a component fix is made upstream in the kit repo, tagged, and pulled. The rearrange-first instruction still stands for everything in UI-RULEBOOK.md |
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
| 17.1 | Every long-text input on a primary screen becomes a rich text notes component, and renders as rich text too | **DONE** |
| 17.2 | Clients stop appearing in internal people pickers on stories, tickets and tasks | **DONE** |
| 17.3 | Clients appear in exactly two places: marking to-dos, and raising a ticket on their behalf | **DONE** |
| 17.4 | The same name appears twice in "Who's doing it" | **DONE**, and it was not a duplicate row — two different people with one display name. Any name that is not unique now carries its email |

## 18 · Meetings and the calendar

| # | The thing | Status |
|---|---|---|
| 18.1 | A link that opens the meeting inside my calendar | **DONE** |
| 18.2 | Location, stakeholders and every other piece of calendar data and metadata, organised | **DONE** |
| 18.3 | The call transcript is already there on older meetings | **PART DONE**, all three routes built. Nothing was ingested end to end: the lane could not reach the app's own Google connection |
| 18.4 | The knowledge base ingests transcripts from calendar meetings, from Google Docs, and from emails announcing a Doc was made for a meeting | **PART DONE**, same reason. It rides the existing knowledge seam, which also closed a gap nobody had noticed — agendas and notes were never answerable at all |
| 18.5 | Past events re-sync, because a transcript lands minutes to an hour after the room empties | **DONE** |
| 18.6 | Every record stays in step with its calendar entry, past events included | **DONE** |
| 18.7 | The sync is ONE WAY, and everything in the calendar reaches Meetings | **DONE 18 Aug 2026.** Seven write doors, five library functions, eight tools and the "Calendar on your behalf" switch removed, so the refusal is a missing function rather than a permission. The read went the other way: past AND future, one-offs included, over a window five years back and a year ahead, walked one 90-day slice per call from a resumable cursor — bounded per request (R14), complete by repetition |

## 19 · Google, deeper

| # | The thing | Status |
|---|---|---|
| 19.1 | Select several folders, several spaces and several files in one go | **DONE** |
| 19.2 | Share a Drive FILE, not only a folder | **DONE** |
| 19.3 | Chat spaces show their names, not `spaces/lJXiZKAAAAE` | **DONE** |
| 19.4 | Logos, icons, thumbnails and previews pulled in wherever Google data appears: search, knowledge base, meetings | **DONE** |
| 19.5 | The sync button on every screen showing Google data, not only Settings and Meetings | **DONE** |
| 19.6 | Sync often enough to feel instant | **DONE** |
| 19.7 | The Chat app's Configuration tab in Google Cloud | **BLOCKED ON YOU**, Google refuses every post until name, avatar and description are filled in |

## 20 · Language

| # | The thing | Status |
|---|---|---|
| 20.1 | Every system string translated by us, at build time, in every language we speak | **DONE** |
| 20.2 | What a person types is translated only when somebody asks for it, on the cheapest Haiku | **DONE** |
| 20.3 | One translation call routed everywhere it is needed, rather than one per field | **DONE** |
| 20.4 | The switcher becomes a dropdown, not 25 stretched pills | **DONE** |

## 21 · How it looks, round two

| # | The thing | Status |
|---|---|---|
| 21.1 | A cognitive-load metric of my own, measured on every page, screen, tab and detail screen | **DONE** |
| 21.2 | One central rule set: colours, spacing, padding, separators, when a dropdown, when a shape | **DONE** |
| 21.3 | The full horizontal span applied everywhere on desktop, the way work logs, tasks and meetings already do it | **DONE** |
| 21.4 | The global rearrangement, executed against that rule set | **DONE**, 21 screens rearranged. Mean glance score 61 to 83. Of 516 gaps 210 were off any scale and the gap meaning "these are separate" was used eleven times in the whole app; zero off-scale now, and that gap is used thirty-seven times |
| 21.5 | Charts and big numbers on the home page, main pages and detail screens, on real data, never taking the whole screen | **DONE** |
| 21.6 | Glyphs and icons on main screens, page icons and collections, not only detail screens | **PART DONE**, glyphs on every collection heading and the nav. Rows, tabs, empty states and stat cards still need one line of the library each (UI-GAPS 16, 17, 19, 20) |
| 21.7 | Dark mode reads better than light because the contrast between elements is clearer | **DONE** |

## 22 · Answered rather than built

| # | The question | The answer |
|---|---|---|
| 22.1 | What actually was the deep link issue, and is it the mechanism Glide used? | Answered in full. It was the gateway's own list of which addresses it handles, not permissions and not the row id. Yes, the shape is the same as Glide's: the URL names the record, the page resolves it in the browser, and the server decides whether you may see it |
| 22.2 | Is sync-on-open in place? | Yes, and proved live. Per-screen freshness is not, and is being built |
| 22.3 | Why is Drive folder-wise only? | It was a scoping decision, not a limitation. File-level sharing is being added |
| 22.4 | Why did the Impact tab show hours but no money? | The money half needs a role on the process and a rate on that role. The hours half needs neither. Being diagnosed and made speakable |

## 23 · Still blocked on you

| # | The thing | What is needed |
|---|---|---|
| 23.1 | The Chat app's Configuration tab | **DONE** by you |
| 23.2 | The stray "co-op: check the account" text | **DONE**, it is gone |
| 23.3 | Production | **PARKED** by you until staging is signed off |
| 23.4 | The deliverables module (8.7) | **DONE**, you defined it and it is built |

## 24 · Found while building round two

Nobody asked for these. They are the faults the work walked into.

| # | The thing | Status |
|---|---|---|
| 24.1 | Half the app could not be reached on a phone or a tablet | **DONE**, you reported it. Ten sections, five slots on the bottom bar, and nothing catching the other five — the rail beside it is desktop-only, so Tasks, Work logs, Meetings, Apps and Sprints had no way in at all. The comment above that line promised a "More" entry that was never built |
| 24.2 | The Gmail promise on the Settings screen had stopped being true | **DONE**, finding the transcripts needed a second, narrow fence over four Google robot senders, and the screen still said "only mail to or from someone on one of your accounts". It was invisible precisely because the first fence works: Google's own no-reply addresses are nobody's contact |
| 24.3 | None of the four privacy sentences was translated | **DONE**, they sat in a data table as bare properties, so somebody reading in German was told in English what kwapso may read from their mailbox |
| 24.4 | Every process map in the app was born with no role | **DONE**, the form has asked "who does it" since the rate card shipped and nothing behind it read the answer. No role, no rate, no price — which is why you saw hours and no money |
| 24.5 | A story could store the literal word "Assignee" as the person doing it | **DONE**, it resolved the name from the activity feed and fell back to the label |
| 24.6 | The calendar sweep would have reported success while never reaching tomorrow | **DONE**, caught in the lane's own review: one straddling window spent its whole page on the past |
| 24.7 | The charting library put 114 KB on every route | **DONE**, the whole app is one shell, and lazy-loading the component alone does nothing because its config lives in the same module. Isolated behind one dynamic import per app: the agency shell is 4 KB over baseline and the client's impact screen is 100 KB lighter than before |
| 24.8 | Three real defects in the translation generator | **DONE**, no checkpoint inside a language, curly quotes read as invented keys, and one bad value binning its whole batch of seven good ones |

## 25 · Asked for after the first round-two build

| # | The thing | Status |
|---|---|---|
| 25.1 | The Kwapso logo loop becomes the loader when the app boots | **BUILDING**, ported out of the 1 MB export into dependency-free SVG that paints before the app loads. The file you sent is not being shipped |
| 25.2 | A new account is always a company, with no type dropdown on create or edit | **BUILDING**. Edit already had none |
| 25.3 | A contact created under an account is always a person | **BUILDING**, and it needs a new capability: today "Add contact" only links somebody who already exists |

## 26 · The knowledge base, after you tested it on two real accounts

| # | The thing | Status |
|---|---|---|
| 26.1 | Anything with a client's id on it is searchable from that client's record | **DONE**, four kinds added: process maps, tasks, to-dos and contacts |
| 26.2 | The material is rich enough to answer with | **DONE**, an account now carries its people, systems, sold work, mapped ways of working, open tickets, what we are waiting on and when we last met |
| 26.3 | Every passage links to the record it came from | **DONE** |
| 26.4 | Drive, Gmail, Chat, Calendar and transcripts are searched too | **DONE** for the four Google kinds; transcripts ride the meeting record |
| 26.5 | A written answer, not a list of sources | **DONE** |
| 26.6 | Charts, flows and diagrams appear when they help, with no toggle | **DONE**, one new shape: a flow of boxes joined by labelled arrows |
| 26.7 | The client portal gets none of this yet | **CHANGED**, your decision. It has no knowledge surface at all today, and none is being added — the fence is being built as if a client could reach it tomorrow, so switching it on later is a decision rather than a rebuild |
| 26.8 | A re-index after the text changes | **DONE**, and it needed doing twice — the first run signed in as a test address and indexed an empty team |

## 27 · Tabs

| # | The thing | Status |
|---|---|---|
| 27.1 | A record's tab badges appear on arrival, not after you click the tab | **DONE** |
| 27.2 | An empty tab and an uncounted tab stop looking the same | **DONE** |
| 27.3 | The rows still load only when you open the tab | **DONE** |

## 28 · The rest of round two

| # | The thing | Status |
|---|---|---|
| 28.1 | Every collection can be sorted, and the sort reaches past page one | **DONE**. Three date columns were genuinely wrong and silent — April sorted before January, because a rendered date is text. On the tab you screenshotted, three columns held one repeated value, so sorting them legitimately did nothing |
| 28.2 | A record on a calendar opens | **DONE**. The library's calendar event had no click handler and no callback of any kind, so this was true of all three calendars |
| 28.3 | "+N more" on a calendar day opens that day | **DONE**, it was dead text naming records with no way to reach them |
| 28.4 | An agenda view | **DONE**, and the answer to your question was no, it had never been built. It is the default below 640px, because a month grid at 375 renders each entry as a dot and a hyphen |
| 28.5 | Dropdowns are searchable on a phone | **DONE**, 32 pickers. Below the phone breakpoint it is a sheet, not a popover, because the keyboard covers a popover and the box you are typing in |
| 28.6 | Every email that names a record carries a button to it | **DONE**, 12 emails classified. Seven link, five deliberately do not — a login code with a link in it is the shape of every phishing message ever sent |
| 28.7 | A related record can be created from the record it relates to | **DONE**, six tabs gained the create they described and did not have |
| 28.8 | A work logs tab wherever time is tracked, with the numbers | **DONE**, four records — the door always allowed four and the tab existed on one |
| 28.9 | Deliverables | **DONE**, a tab on an app: kind, title, date, and a file or a link |
| 28.10 | The emoji is called Emoji, and you can edit it | **DONE**, the door has accepted it since the day it shipped and the screen never sent it |
| 28.11 | The checkbox groups breaking out of their outline | **DONE**, the required ring is for one control; four fields wrap groups and now say so |
| 28.12 | "My tickets" | **DONE**, gone. The door keeps it for the client portal, where the question means something |
| 28.13 | Prompt caching on the assistant | **DONE**, 3.8x cheaper on the safe setting, 5.7x on the longer one. Break-even for your 3x bar is a 39% warm rate |

## 29 · Found on the way, nobody reported

| # | The thing | Status |
|---|---|---|
| 29.1 | 224 sentences the app says had never reached the translation catalogue | **DONE**, a string inside a JSX expression was invisible to the extractor. They shipped in English to anybody who chose another language |
| 29.2 | Two blocks rendered English on a German screen because a variable shadowed the translator | **DONE** |
| 29.3 | The build check that catches a mangled boot loader never ran | **DONE**, it skipped whenever there was no build, and nothing in the gate built |
| 29.4 | Two record screens no law had ever walked | **DONE**, and the list they were missing from is gone — the census is derived from the code now |
| 29.5 | The work logs badges were blank until you clicked, and the guard could not see them | **DONE**, the guard matched lowercase and the key has a capital letter |
| 29.6 | A count shown twice on one screen, and a capped list's length sold as a count | **DONE** |
| 29.7 | The morning digest reached clients | **DONE**, a client login is an ordinary team member, so the fallback mailed everybody the agency's own backlog |
| 29.8 | A hard-coded colour two lanes old | **DONE**, caught by a law written hours later |
| 29.9 | A shared file that only bundled in one worker | **DONE**, found by the deploy itself |

## 30 · The overnight round — what you asked for as you went to bed

| # | The thing | Status |
|---|---|---|
| 30.1 | The accounts strip reads Companies, Contacts, All | **DONE**, and Companies is the view you land on. Contacts group under their company, with a caption while more are still loading |
| 30.2 | No trace of the word "people" | **DONE**, zero occurrences in any sentence the app says. It split two ways, because it meant two things: someone at a client is a **contact**, one of ours is a **member**. Renaming both to "contacts" would have made the UI lie — a task cannot be given to a client contact and the code prevents it |
| 30.3 | The parent-account dropdown off the create and edit forms | **DONE**, and the capability it removed came back where it belongs: a contact who changes employer is moved on **her own record**, not by a picker on a company's form |
| 30.4 | "Created by X on 5d ago" | **DONE**, one seam, ten detail screens. The "on" was in no catalogue at all, so a German reader saw broken English inside a German sentence |
| 30.5 | Clients see deliverables, once marked visible | **DONE**, opt-in per record. Every deliverable that exists today stays hidden, because the column's default is the one SQLite hands out for free — nothing to migrate and nothing to mistype |
| 30.6 | The read-only calendar scope | **DONE and live**. Read off the deployed authorize URL, not the source: `calendar.readonly`, fresh consent forced, inherited scopes off. **Four disconnects, then four connects** — the four services are one grant at Google, and disconnecting only Calendar is the one order that silently fails |
| 30.7 | Delete a draft | **DONE**, to Google's Trash, recoverable for 30 days. Permanent deletion is unreachable, not merely unbuilt — it needs full mailbox access this app asks for nowhere |
| 30.8 | The Glide pictures | **DONE**, 87 of 87 on our own storage, every one serving real bytes. Nothing points at a Glide URL any more |
| 30.9 | The Glide files that are not pictures | **DONE**, 47 files and 32 MB, plus **six records the original mapping never saw**. Two clips are deliberately left — they belong to the module you purged on 17 August |
| 30.10 | Visuals and placeholders everywhere | **DONE**, seventeen placeholder implementations became one rule. The portal had exactly **one image in its entire front end** |
| 30.11 | No two words for one thing | **DONE**, ten defects across 41 places — including "request" as a third word for a ticket, on your portal. Five judgement calls decided and closed. It is now a law (R34), which caught its first live case within hours |
| 30.12 | The boot loader | **DONE**. It was **frozen on every device**, not just phones — React replaced the mark ~300 ms in and orphaned the animator, then it stood still for three seconds. The phone-only part was a blur tuned for a frame rate a phone never gets |

## 31 · Found overnight, nobody reported

| # | The thing | Status |
|---|---|---|
| 31.1 | Account logos, covers and app logos could not be set **at all** from the app's own picker | **DONE**, the field was checked against the 20,000-character prose cap, 166× below the real limit. It shipped green because the test used a 110-character one-pixel image. Found three more of the same, including a team logo with **no length cap at any size** |
| 31.2 | Deliverables shipped invisible to the whole agency, Admin included | **DONE**, migration `0036` omitted the permission grant every other module carries |
| 31.3 | Every form field label was English in every language | **DONE**. 440 real cases: the words were translated and then never asked for. Now one wrapper and a law (R33) |
| 31.4 | A colour swatch in your brand library loads from a **typosquatted domain** | **OPEN**, nine of them, on a host that is not the one they meant. It can serve anything it likes into your brand library, and one is already broken. A colour should be a value, not a remote image |
| 31.5 | The ship gate went red three times with nothing wrong | **DONE**, slow tests against a 5-second budget. Fixed as one decision, not three patches |
| 31.6 | A stale build accused the minifier of mangling the code | **DONE**, it now says "stale build" and names the command that fixes it |
| 31.7 | Two lanes minted the same migration number, and git merged both without a conflict | **DONE**, versions are proved unique and ascending — the duplicate is silent otherwise, and skips a live team's upgrade |
| 31.8 | `.gitignore` left a symlink to your customer export one `git add -A` from being committed | **DONE** |
| 31.9 | The staging smoke never touches the client portal | **OPEN**, half the product is deployed unverified |
| 31.10 | Two copies of your mark animate at once during boot | **YOUR CALL**, it costs a third of the frame rate on a throttled phone, and 2.7 s of it draws behind an opaque screen where nobody can see it |
