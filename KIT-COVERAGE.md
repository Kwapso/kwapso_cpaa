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

`[x]` = the app imports it today. `[ ]` = it does not. `(absent)` = the owner named
it and the kit has no such part, which is worth knowing rather than silently dropping.

Regenerate the ticks with:

    grep -rhoE '@shared/ui/(components|compositions|foundations)/[A-Za-z0-9/_-]+' web/ web-portal/ shared/web/ | sed 's#@shared/ui/##' | sort -u

## Charts and graphs

- [x] `chart`
- [ ] `gantt`
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
- [ ] `title`
- [ ] `article-body`

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

- [ ] `folder`

## Navigation

- [ ] `breadcrumb`
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
- [ ] `use-virtual-rows`
- [ ] `visibility`
- [ ] `data-preview-table`
- [x] `description-list`

## Data display

- [ ] `progress`
- [ ] `progress-dashboard`
- [x] `stat-grid`
- [ ] `tree`
- [ ] `stopwatch`

## Feedback and overlay

- [x] `alert`
- [x] `alert-dialog`
- [x] `dialog`
- [x] `sheet`
- [x] `skeleton`
- [x] `sonner`
- [x] `spinner`

## Notes and notifications

- [ ] `notes`
- [ ] `notifications`
- [x] `comments`
- [x] `ticket-thread`

## Forms and data

- [ ] `form`
- [ ] `import-wizard`
- [x] `permission-matrix`

## Collection views

- [x] `list`
- [ ] `kanban`
- [x] `card-grid`
- [ ] `calendar-view`
- [x] `data-table`
- [ ] `spreadsheet`
- [ ] `matrix`
- [ ] `swimlane`
- [ ] `timeline`
- [ ] `agenda`
- [ ] `gallery`
- [ ] `split`
- [ ] `queue`
- [x] `activity-feed`
- [ ] `checklist`
- [ ] `chat`
- [x] `run-steps`
- [ ] `tiles`
- [ ] `map`
- [ ] `compare`
- [x] `flowchart`
- [ ] `flowdetail`
- [x] `collection-frame`
- [ ] `screen-renderer`
- [ ] `copilot-overlay`
- [x] `agent-chat`

## Detail and examples

- [ ] `detail-view`
- [x] `record-detail`
- [ ] `brand`
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
- [ ] `screens/page-failure`
- [ ] `screens/portal-boot`
- [ ] `screens/portal-home`
- [ ] `screens/portal-impact`
- [ ] `screens/profile`
- [ ] `screens/session-expired`
- [ ] `screens/settings`
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
- [ ] `templates/rail`
- [x] `templates/record-chrome`
- [ ] `templates/record-route`
- [ ] `templates/screen-shell`
- [ ] `templates/search-results`
- [ ] `templates/sign-in`
- [ ] `templates/stat-strip`
- [x] `templates/stepper-hero`

## Foundations

- [x] `icons`
- [x] `tokens`
- [ ] `motion` — the owner named motions; check what actually animates

---

**Components 66/115 · Compositions 4/47**
