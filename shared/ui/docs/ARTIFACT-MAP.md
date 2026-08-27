# ARTIFACT MAP

Open the artifact at any chapter, look the name up here, land on the file.

**Why the two sets of names differ.** The artifact names things for a reader;
this repository names them for the two applications that import it. `Button`,
`DataTable` and `--surface-panel` are the names the apps already use, and the
one test the whole commission is measured by is that an engineer can delete
the old component folder, drop this one in, change no application code, and
have both apps run. Renaming exports would fail that test. So the code keeps
the app's names, the demo carries the artifact's labels, and this file is the
bridge.

Generated against the artifact version published 2026-08-23 and the repo at
the commit that added it. If a row here is wrong, the row is the defect.

**Paths updated 2026-08-26.** `controls/` and `structures/` merged into one
`components/` — client ruling, verbatim: "i still don't understand the
difference between controls / structures. please merge them, and rename to
components." Every `controls/x/` and `structures/x/` cell below now reads
`components/x/`. See the chapter 19 section for the map correction that
rode along with the same pass.

---

## The six parts

### Part A · Foundations

| ch | the artifact's name | where it lives | what it is |
|---|---|---|---|
| 01 | **Colour & surfaces** | `foundations/tokens/tokens.css` | the raw palette and the semantic layer |
| 02 | **Tokens — light & dark** | `foundations/tokens/tokens.css` | dark declared twice, drift-guarded |
| 03 | **Typography** | `foundations/tokens/tokens.css` | 13 steps + micro/badge/caption, each with its own leading and tracking |
| 04 | **Iconography** | `foundations/icons/` | 96 exports, six sizes |
| 05 | **Space, radius, elevation, motion** | `foundations/tokens/tokens.css + foundations/motion/motion.css` | the scale, the four radii, 57 motion classes |
| 06 | **Focus & keyboard** | `foundations/tokens/tokens.css §8` | one global :focus-visible rule; no component writes a ring |
| 07 | **State matrix & do / don't** | `docs/RULES.md` | the ten states, as a convention every file carries |

### Part B · Controls

| ch | the artifact's name | where it lives | what it is |
|---|---|---|---|
| 08 | **Buttons** | `components/button/` | Button |
| 09 | **Text inputs** | `components/input|textarea|field/` | Input · Textarea · Field |
| 10 | **Selection controls** | `components/checkbox|radio-group|switch|choice|rating/` | Checkbox · RadioGroup · Switch · Choice · Rating |
| 11 | **Chips, badges, avatars** | `components/badge|avatar/` | Badge · Avatar |
| 12 | **Tooltips, menus, palette** | `components/tooltip|dropdown-menu|command/` | Tooltip · DropdownMenu · Command |

CORRECTED 2026-08-23 — **Rating was filed under 11 and belongs to 10.** The
artifact draws it in chapter 10, Selection controls ("Rating — used only in
feedback capture, never as a data display"); chapter 11 draws status pills,
filter chips, badges, tags, avatars and record marks, and never mentions it.
`rating.tsx` cites chapter 10 in its own header. The row moved; nothing was
renamed.

### Part C · Structure

| ch | the artifact's name | where it lives | what it is |
|---|---|---|---|
| 13 | **Cards & containers** | `components/card|sheet|dialog/` | Card · Sheet · Dialog |
| 14 | **Folder shapes** | `components/folder/` | FolderShape · FolderPanel, and Tabs variant="folder" |
| 15 | **Navigation** | `components/tabs|breadcrumb|pagination/` | Tabs · Breadcrumb · Pagination |
| 16 | **Filters, search, upload** | `components/filter-bar|search-input|file-upload/` | FilterBar · SearchInput · FileUpload |

### Part D · Data

| ch | the artifact's name | where it lives | what it is |
|---|---|---|---|
| 17 | **Tables & lists** | `components/data-table|list/` | DataTable · List |
| 18 | **Data display** | `components/chart|stat-grid|progress-dashboard/` | Chart · StatGrid · ProgressDashboard |
| 19 | **Collection views · all 24** | `components/` | the table below |

### Part E · States & messages

| ch | the artifact's name | where it lives | what it is |
|---|---|---|---|
| 20 | **Feedback & overlays** | `components/sonner|dialog|sheet|alert/` | Toaster · Dialog · Sheet · Alert |
| 21 | **Empty & error states** | `compositions/templates/states.tsx` | ShapeStateBody — every register in the system |
| 22 | **Notifications & threads** | `components/comments|ticket-thread|activity-feed/` | Comments · TicketThread · ActivityFeed |
| 23 | **Auth & account** | `compositions/templates/sign-in.tsx` | SignIn · SignInSplash |

### Part F · Screens

| ch | the artifact's name | where it lives | what it is |
|---|---|---|---|
| 24 | **Tier 1 specimens** | `compositions/templates/` | the 12 recurring shapes |
| 25 | **Assembled pages** | `compositions/templates/` | same 12 — a page is a shape with content in it |
| 26 | **Assembled screens** | `compositions/system/ · compositions/portal/` | 29 routes: 22 system, 7 portal |
| 27 | **Compositions · 45** | `compositions/screens/ + the routes` | the table below |

---

## 19 · Collection views · all 24

The artifact numbers these 01–24 inside the chapter and names them in one
word each. **All 24 are built.**

The ex-`structures/` half of `components/` (see CORRECTED 2026-08-26, below)
holds **42** folders, which is a different count and not a discrepancy: **all
24 of the 24 views, map included,** plus **18 supporting components** at the
same tier (the collection frame, record detail, comments, the import wizard,
the pulse band and so on) that the artifact draws inside other chapters.
24 + 18 = 42.

CORRECTED 2026-08-26 — **map was wrongly filed as a control and this row
said so.** Client ruling, verbatim: "about structures - map is a collection
view. recategorize." Row 21 below used to read `controls/map/` (this
document was written before the 2026-08-24 move and was never updated when
map left the primitives), and demo/artifact.ts's own chapter table had the
same mistake baked in — `map` was keyed in PRIMITIVE_CHAPTERS, with a
comment asserting outright that it "is the one view that is NOT in this
folder: it is a primitive." Both were wrong. Map has been a collection view
since the component itself moved on 2026-08-24; only the documentation and
one internal lookup table lagged. Both are corrected as of this pass, and
`controls/` and `structures/` are now one folder, `components/`, per the
same day's second ruling — "merge them, and rename to components" — so the
count above is 42 rather than the pre-merge 40, with map's own row moving
from 23-of-24-plus-17 to 24-of-24-plus-18.

CORRECTED 2026-08-23. This paragraph said "the 24 views, plus 16 supporting
components", which does add to 40 but counts `map` twice — once as a view in
this folder, which it is not, and once out of the supporting total. The
supporting components are: agent-chat, article-body, collection-frame,
comments, copilot-overlay, data-preview-table, description-list, detail-view,
form, import-wizard, permission-matrix, progress-dashboard, pulse-band,
record-detail, screen-renderer, stat-grid, ticket-thread.

| # | the artifact's name | where it lives | export |
|---|---|---|---|
| 01 | **list** | `components/list/` | `List` |
| 02 | **kanban** | `components/kanban/` | `Kanban` |
| 03 | **grid** | `components/card-grid/` | `CardGrid` |
| 04 | **gantt** | `components/gantt/` | `Gantt` |
| 05 | **calendar** | `components/calendar-view/` | `CalendarView` |
| 06 | **table** | `components/data-table/` | `DataTable` |
| 07 | **matrix** | `components/matrix/` | `Matrix` |
| 08 | **swimlane** | `components/swimlane/` | `Swimlane` |
| 09 | **timeline** | `components/timeline/` | `Timeline` |
| 10 | **agenda** | `components/agenda/` | `Agenda` |
| 11 | **gallery** | `components/gallery/` | `Gallery` |
| 12 | **split** | `components/split/` | `Split` |
| 13 | **queue** | `components/queue/` | `Queue` |
| 14 | **feed** | `components/activity-feed/` | `ActivityFeed` |
| 15 | **checklist** | `components/checklist/` | `Checklist` |
| 16 | **heatmap** | `components/heatmap/` | `Heatmap` |
| 17 | **chat** | `components/chat/` | `Chat` |
| 18 | **steps** | `components/run-steps/` | `RunSteps` |
| 19 | **chart** | `components/chart/` | `Chart` |
| 20 | **tiles** | `components/tiles/` | `Tiles` |
| 21 | **map** | `components/map/` | `Map` |
| 22 | **compare** | `components/compare/` | `Compare` |
| 23 | **flowchart** | `components/flowchart/` | `Flowchart` |
| 24 | **flowdetail** | `components/flowdetail/` | `Flowdetail` |

---

## 27 · Compositions

**The artifact's own contents page says 39. There are 45**, numbered 27.1 to
27.45 with no gaps. The difference is exactly the last six — Find, Triage
sitting, Module wall, Company hub, Import proposal and Splash — so the
contents count was not updated when they were added. Worth correcting
upstream; the chapter itself is right.

A composition is not always a file. Some are a whole screen, some are a state
of one, some are a component's own behaviour. The **file** column names where
the artifact's rules for it are written down and obeyed.

| # | the artifact's title | file | export |
|---|---|---|---|
| 27.1 | **Main page — a top-level collection** | `compositions/templates/collection-screen.tsx` | `CollectionScreen` |
| 27.2 | **Add form** | `compositions/templates/form-screen.tsx` | `FormScreen` |
| 27.3 | **Record edit** | `compositions/templates/form-screen.tsx` | `FormScreen` |
| 27.4 | **Delete confirmation** | `components/alert-dialog/alert-dialog.tsx` † | `AlertDialog` |
| 27.5 | **Archive** | `compositions/screens/archive.tsx` | `ArchiveScreen` |
| 27.6 | **Loading** | `compositions/templates/states.tsx` | `ShapeStateBody` |
| 27.7 | **Access denied** | `compositions/screens/access-denied.tsx` | `AccessDeniedScreen` |
| 27.8 | **Record detail** | `compositions/templates/record-chrome.tsx` | `RecordChrome` |
| 27.9 | **Activity log** | `components/activity-feed/activity-feed.tsx` | `ActivityFeed` |
| 27.10 | **Chat** | `components/chat/chat.tsx` † | `Chat` |
| 27.11 | **Dashboard** | `compositions/system/home.tsx` | `HomeRoute` |
| 27.12 | **Permissions** | `components/permission-matrix/permission-matrix.tsx` | `PermissionMatrix` |
| 27.13 | **Tabs and sub-tabs** | `components/tabs/tabs.tsx` † | `Tabs` |
| 27.14 | **Onboarding** | `compositions/screens/onboarding.tsx` | `OnboardingOptionGroup` |
| 27.15 | **Member profile** | `compositions/system/profile.tsx` | `ProfileRoute` |
| 27.16 | **Sign in** | `compositions/screens/sign-in.tsx` | `AuthShell` |
| 27.17 | **Link sent** | `compositions/screens/link-sent.tsx` | `LinkSentScreen` |
| 27.18 | **Invite acceptance** | `compositions/screens/invite-acceptance.tsx` | `InviteAcceptanceScreen` |
| 27.19 | **Session expired** | `compositions/screens/session-expired.tsx` | `SessionExpiredScreen` |
| 27.20 | **Password and security** | `compositions/screens/password-security.tsx` | `PasswordSecurityScreen` |
| 27.21 | **Empty collection** | `compositions/screens/empty-collection.tsx` | `EmptyCollectionScreen` |
| 27.22 | **No results** | `compositions/screens/no-results.tsx` | `NoResultsScreen` |
| 27.23 | **Not found** | `compositions/screens/not-found.tsx` | `NotFoundScreen` |
| 27.24 | **Board view** | `components/kanban/kanban.tsx` † | `Kanban` |
| 27.25 | **Calendar view** | `components/calendar-view/calendar-view.tsx` † | `CalendarView` |
| 27.26 | **Timeline view** ‡ | `components/gantt/gantt.tsx` † | `Gantt` |
| 27.27 | **Split list and preview** | `components/split/split.tsx` | `Split` |
| 27.28 | **Gallery** | `components/gallery/gallery.tsx` | `Gallery` |
| 27.29 | **Map** | `components/map/map.tsx` | `Map` |
| 27.30 | **Import** | `compositions/screens/import.tsx` | `ImportScreen` |
| 27.31 | **Export** | `compositions/screens/export.tsx` | `ExportScreen` |
| 27.32 | **Bulk edit** | `compositions/screens/bulk-edit.tsx` | `BulkEditScreen` |
| 27.33 | **Filter builder** | `compositions/screens/filter-builder.tsx` | `FilterBuilderScreen` |
| 27.34 | **Notifications** | `compositions/screens/notifications.tsx` | `NotificationsScreen` |
| 27.35 | **Validation and save failure** | `compositions/templates/form-screen.tsx` | `FormScreen` |
| 27.36 | **Linked records** | `compositions/screens/linked-records.tsx` | `LinkedRecordsScreen` |
| 27.37 | **Quick view** | `compositions/screens/quick-view.tsx` | `QuickView` |
| 27.38 | **Multi-step form** | `compositions/screens/multi-step-form.tsx` | `MultiStepForm` |
| 27.39 | **A record with nothing in it yet** | `compositions/screens/new-empty-record.tsx` | `NewEmptyRecordScreen` |
| 27.40 | **Find** | `compositions/templates/search-results.tsx` | `SearchResults` |
| 27.41 | **Triage sitting** | `compositions/screens/triage-sitting.tsx` | `TriageSittingScreen` |
| 27.42 | **Module wall** | `compositions/screens/module-wall.tsx` | `ModuleWallScreen` |
| 27.43 | **Company hub** | `compositions/screens/company-hub.tsx` | `CompanyHubScreen` |
| 27.44 | **Import proposal** | `compositions/screens/import-proposal.tsx` | `ImportProposalScreen` |
| 27.45 | **Splash** | `compositions/screens/splash.tsx` | `SplashScreen` |

CORRECTED 2026-08-23 — **27.5 Archive was filed "not built" and is built.**
`compositions/screens/archive.tsx` is 477 lines, exports `ArchiveScreen`,
opens by quoting 27.5 verbatim, and is drawn in the demo under "nothing
there". All forty-five compositions now name a file; none of the forty-five
is missing.

‡ **27.26's title and its body describe two different components.** It is
headed *"Timeline view"*, and its text reads *"a lane per app or owner, bars
for sprints and deliverables, weeks across the top … the one view where a
bar's length carries meaning"* — which is a **gantt**, not a timeline.
`gantt.tsx` transcribes those six rules verbatim; `timeline.tsx` draws a
spine with dots on it and is chapter 19's view 09. The row follows the body,
because the body is what was built from. The artifact owes a correction on
the title. Found by the agent drawing the fourteen (GAPS-DEMO6 D6-8).

† **These six are a component's own behaviour, not a screen.** Chapter 27 draws
them as postures a collection takes — a board, a calendar, a timeline, a
delete confirmation, a chat, a tab set — but each is implemented from its own
chapter (12, 17, 18, 19) and so its file does not cite a 27.x number. The
mapping is still the right one; there is simply nothing in that file that
knows it is also a composition.

**A composition is not always a file.** Some are a whole screen, some are a
state of one, some are a component's behaviour. The file column names where
the artifact's rules for it are written down and obeyed. Where two files share
one row — `form-screen.tsx` carries 27.2, 27.3 and 27.35 — that is the
artifact drawing one shape three times, not a duplication here.

---

## What the demo calls things

**Nothing, any more.** As of 2026-08-23 the demo carries the artifact's names
throughout: the View control's six options are the six parts, every section
header states its part, its chapter number and the chapter's own words before
it says anything the code calls things, and the primitives and collections
rails are grouped and ordered by chapter. The label layer is
`demo/artifact.ts`, which reads this file. No export, component, token, prop
or folder was renamed, and every section still prints its own source path.

| the button says | the state is still | artifact |
|---|---|---|
| **A · Foundations** | `sheets` | **Part A · Foundations** — 01–06; 07 is the states table at the foot of every section |
| **B + C · Controls & structure** | `primitives` | **Part B · Controls** + **Part C · Structure** — 08–16 |
| **D + E · Data, states & messages** | `collections` | **Part D · Data** + **Part E · States & messages** — 17–23 |
| **F · Specimens & pages** | `shapes` | **Part F**, 24–25 — Tier 1 specimens and Assembled pages |
| **F · Assembled screens** | `routes` | **Part F**, 26 — Assembled screens |
| **F · Compositions** | `screens` | **Part F**, 27 — Compositions, 25 of the 45 |

A handful of sections sit outside their view's part range and their own
heading says so: the toast, the drawer and the alerts are chapter 20's and are
in the controls view; the note is 22's; `map` and the timer are 19's. That is
the artifact's filing, not a slip — a chapter is where a reader looks a thing
up, and the view is only where the code keeps it.

