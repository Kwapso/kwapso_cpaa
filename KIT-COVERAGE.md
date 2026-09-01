# The kit coverage checklist

The owner narrated this list off the kit's own catalogue on 29 Aug 2026 and asked
that every lane work against it. His groupings and his order are kept; each line is
reconciled against the part that actually exists on disk, because a narration has
transcription in it ("as spec ratio" is aspect-ratio, "cue" is queue, "dialogue" is
dialog) and four lanes each guessing at that separately is four different lists.

Every item he named resolves to a real part once transcription is undone —
"more toggle" is mode-toggle, "status/stepper" is one part, "portal/conversation"
is one part, and headline/text/hint are three exports of typography. Nothing he
asked for is missing and nothing in the kit went unnamed.

`[x]` = the app REACHES it — directly, or through another part it already
reaches, in EITHER language the kit ships in. Counting only the app's own JS/TS
import lines understated this SEVEN times in one day: six parts arrive through
another kit part (`notes` through Comments, `folder` through tabs, `title`
through the kit's own record-detail, `progress` through file-upload, two more
filed as footnotes), and `motion` arrives through a CSS `@import` in both front
doors' globals.css — a reference no JS-import grep can see at all, in either
direction. 7 parts are reached that way today, JS or CSS. The
walk cannot over-count: nothing enters without a path back to a file the app
itself names, which is why `heatmap` stays unadopted even though `pulse-band`
imports it — pulse-band is not reached either. `[ ]` = not reached. `(absent)` =
named it and the kit has no such part, which is worth knowing rather than
silently dropping.

Regenerate with `node scripts/kit-coverage.mjs` — one command, no /tmp
preparation, never edited by hand.

## Charts and graphs

- [x] `chart`
- [x] `gantt`
- [ ] `heatmap`
- [ ] `pulse-band`
- [ ] `donut`
- [ ] `rings`
- [x] `kpi-progress`
- [ ] `radar`

## Colour and surface

- [x] `ambient-background`
- [x] `mode-toggle`
- [ ] `progress-toggle`

## Typography

- [x] `clamp`
- [x] `typography`
- [x] `title`
- [x] `article-body`

## Space and motion

- [ ] `container`
- [x] `spacer`

## Buttons

- [x] `button`

## Text inputs

- [x] `date-picker`
- [x] `field`
- [x] `input`
- [x] `label`
- [x] `select`
- [ ] `signature`
- [x] `textarea`

## Selection controls

- [x] `checkbox`
- [x] `choice`
- [x] `radio-group`
- [ ] `rating`
- [x] `slider`
- [x] `switch`
- [x] `toggle`
- [x] `toggle-group`

## Chips and badges

- [x] `avatar`
- [x] `badge`
- [x] `separator`

## Menus and tooltips

- [x] `command`
- [x] `dropdown-menu`
- [ ] `hover-card`
- [x] `popover`
- [x] `tooltip`

## Cards

- [x] `accordion`
- [x] `action-row`
- [ ] `aspect-ratio`
- [x] `card`
- [x] `collapsible`
- [x] `image`
- [x] `scroll-area`
- [ ] `video`
- [ ] `web-embed`

## Folder shapes

- [x] `folder`

## Navigation

- [x] `breadcrumb`
- [x] `breadcrumbs`
- [x] `pagination`
- [x] `status-stepper`
- [x] `tabs`

## Filter and search

- [x] `file-upload`
- [x] `filter-bar`
- [x] `search-input`
- [x] `use-debounce`

## Tables and lists

- [x] `sort-control`
- [x] `table`
- [x] `use-virtual-rows`
- [x] `visibility`
- [x] `data-preview-table`
- [x] `description-list`

## Data display

- [x] `progress`
- [ ] `progress-dashboard`
- [x] `stat-grid`
- [ ] `tree`
- [x] `stopwatch`

## Feedback and overlay

- [x] `alert`
- [x] `alert-dialog`
- [x] `dialog`
- [x] `sheet`
- [x] `skeleton`
- [x] `sonner`
- [x] `spinner`

## Notes and notifications

- [x] `notes`
- [ ] `notifications`
- [x] `comments`
- [x] `ticket-thread`

## Forms and data

- [x] `form`
- [x] `import-wizard`
- [x] `permission-matrix`

## Collection views

- [x] `list`
- [ ] `kanban`
- [x] `card-grid`
- [x] `calendar-view`
- [x] `data-table`
- [ ] `spreadsheet`
- [ ] `matrix`
- [ ] `swimlane`
- [ ] `timeline`
- [x] `agenda`
- [x] `gallery`
- [ ] `split`
- [ ] `queue`
- [x] `activity-feed`
- [x] `checklist`
- [ ] `chat`
- [x] `run-steps`
- [ ] `tiles`
- [ ] `map`
- [ ] `compare`
- [x] `flowchart`
- [ ] `flowdetail`
- [x] `collection-frame`
- [x] `screen-renderer`
- [ ] `copilot-overlay`
- [x] `agent-chat`

## Detail and examples

- [ ] `detail-view`
- [x] `record-detail`
- [x] `brand`
- [x] `portal-conversation`

## Components the kit ships that the list did not name (0)


## Compositions (47)

- [ ] `overlays/access-denied`
- [ ] `overlays/assistant`
- [ ] `overlays/bulk-edit`
- [ ] `overlays/delete-confirmation`
- [ ] `overlays/export`
- [ ] `overlays/filter-builder`
- [ ] `overlays/import`
- [ ] `overlays/import-proposal`
- [ ] `overlays/quick-view`
- [ ] `screens/brand`
- [ ] `screens/company-hub`
- [ ] `screens/home`
- [ ] `screens/invite-acceptance`
- [ ] `screens/link-sent`
- [ ] `screens/not-found`
- [ ] `screens/onboarding`
- [x] `screens/page-failure`
- [ ] `screens/portal-boot`
- [ ] `screens/portal-home`
- [ ] `screens/portal-impact`
- [ ] `screens/profile`
- [ ] `screens/session-expired`
- [x] `screens/settings`
- [ ] `screens/sign-in`
- [ ] `screens/sign-in-portal`
- [x] `screens/sign-in-system`
- [ ] `screens/splash`
- [ ] `states/archive`
- [ ] `states/empty-collection`
- [ ] `states/new-empty-record`
- [ ] `states/no-results`
- [x] `states/states`
- [ ] `templates/collection-screen`
- [ ] `templates/detail-screen`
- [ ] `templates/form-screen`
- [ ] `templates/import-flow`
- [ ] `templates/main-screen`
- [ ] `templates/multi-step-form`
- [ ] `templates/portal-home`
- [x] `templates/rail`
- [x] `templates/record-chrome`
- [ ] `templates/record-route`
- [x] `templates/screen-shell`
- [ ] `templates/search-results`
- [x] `templates/sign-in`
- [ ] `templates/stat-strip`
- [ ] `templates/stepper-hero`

## Foundations

- [x] `icons`
- [x] `motion`
- [x] `tokens`

---

**Components 85/115 · Foundations 3/3 · Compositions 8/47**
**Components + foundations combined (the owner's "118"): 88/118**
