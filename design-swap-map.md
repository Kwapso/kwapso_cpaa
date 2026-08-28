# The design-system swap: a map of what is and is not done

**Audit, not a fix.** Nothing in this branch changes a line of product code. Every claim below
was derived from the disk in this worktree (`audit/design-swap-map`, off `main` at `9e905323`)
and every line number was opened and read. `shared/ui/` is a pinned dependency — the kit gaps
found here are written up as **upstream notes** for `Kwapso/kwapso-ui-ux`, not patched locally.

Kit under audit: **v1.2.2**, sha `f1cb104`, synced 2026-08-28. 115 directories under
`shared/ui/components/` (113 components + 2 hooks), 47 compositions, ~100k lines.

---

## 0 · The one-paragraph answer

The swap is complete at the **import** level and barely started at the **composition** level.
Every control the app draws does come from the kit — R39 holds, with one reasoned exemption —
and the typeface, the palette, the radii and the spacing grid all resolve correctly through
kit tokens (I compiled the stylesheet to check; §6.1). What did **not** happen is the second
half: the app still assembles its own screens out of the three simplest kit parts. A typical
screen's entire kit vocabulary is `Button + Badge + Skeleton`. **58 of 115 component
directories are never imported by either front door, and 46 of 47 compositions are never
imported at all** — including `ScreenShell`, `Rail`, `EmptyCollection`, `ImportWizard` and
every one of the 19 finished screens the kit ships.

There is a **single root cause** behind most of that, and it is one file: `shared/ui/components/brand/brand.tsx`
imports six SVGs, and 33 of the 47 compositions reach it transitively (§3). Under Next those
imports evaluate to a `StaticImageData` object rather than a URL, so those compositions either
fail `next build` or render `src="[object Object]"`. Fix that one file upstream and 33
compositions become available in an afternoon. That is the highest-leverage item in this report.

---

## 1 · Screen-by-screen inventory

`div/span` = raw layout elements the screen draws itself. "Kit parts" = distinct
`@shared/ui/components/*` modules imported. `sonner` is a toast import, not a visual element —
it is listed for completeness but does not count as structure.

### 1.1 The agency door (`web/`)

| Screen | File | Lines | div/span | Kit parts imported |
|---|---|---:|---:|---|
| **Shell / nav rail** | [app-shell.tsx](web/components/app-shell.tsx) | 612 | 14 | breadcrumbs, sheet, sonner |
| Home | [screens/home-screen.tsx](web/components/screens/home-screen.tsx) | 112 | 6 | avatar, badge |
| Settings | [screens/settings-screen.tsx](web/components/screens/settings-screen.tsx) | 178 | 3 | avatar, badge |
| Profile | [screens/profile-screen.tsx](web/components/screens/profile-screen.tsx) | 132 | 2 | avatar, button, skeleton, activity-feed |
| Housekeeping | [screens/kwapso-screen.tsx](web/components/screens/kwapso-screen.tsx) | 208 | 12 | button, skeleton |
| Invitations | [invitations.tsx](web/components/invitations.tsx) | 112 | 0 | avatar, button, skeleton, spinner |
| Sign in | [temp/auth-card.tsx](web/components/temp/auth-card.tsx) | 133 | 9 | button, input, spinner |
| Onboarding | [app/onboarding/page.tsx](web/app/onboarding/page.tsx) | 281 | 7 | avatar, button, file-upload, input, mode-toggle, spinner |
| **Import** | [import-screen.tsx](web/components/import-screen.tsx) | 531 | **59** | button, badge, skeleton |
| Tickets | [tickets-collection.tsx](web/components/tickets-collection.tsx) | 606 | 6 | button, skeleton |
| Ticket detail | [help-detail.tsx](web/components/help-detail.tsx) | 838 | 3 | button, skeleton, badge, ticket-thread |
| Stories | [stories-screen.tsx](web/components/stories-screen.tsx) | 337 | 1 | skeleton |
| Story detail | [story-detail.tsx](web/components/story-detail.tsx) | 459 | 2 | button, skeleton |
| Tasks | [tasks-screen.tsx](web/components/tasks-screen.tsx) | 414 | 2 | skeleton, progress |
| Task detail | [task-detail.tsx](web/components/task-detail.tsx) | 300 | 1 | button, skeleton |
| Work logs | [time-screen.tsx](web/components/time-screen.tsx) | 53 | 1 | — |
| Meetings | [meetings-screen.tsx](web/components/meetings-screen.tsx) | 572 | 5 | button, skeleton |
| Meeting detail | [meeting-detail.tsx](web/components/meeting-detail.tsx) | 809 | 16 | button, skeleton, spinner, badge |
| Accounts | [account-detail.tsx](web/components/account-detail.tsx) | 1028 | 6 | button, skeleton, spinner, alert-dialog, badge |
| Contact detail | [contact-detail.tsx](web/components/contact-detail.tsx) | 666 | 7 | button, checkbox, label, spinner, alert-dialog, badge |
| Knowledge detail | [knowledge-detail.tsx](web/components/knowledge-detail.tsx) | 425 | 10 | badge, button, skeleton, spinner |
| Processes | [processes-screen.tsx](web/components/processes-screen.tsx) | 250 | 1 | skeleton |
| Process detail | [process-detail.tsx](web/components/process-detail.tsx) | 838 | 16 | badge, button, skeleton, spinner, alert-dialog, comments |
| Apps | [apps-screen.tsx](web/components/apps-screen.tsx) | 264 | 3 | input, skeleton |
| App detail | [app-detail.tsx](web/components/app-detail.tsx) | 755 | 1 | button, skeleton |
| Waves | [waves-screen.tsx](web/components/waves-screen.tsx) | 351 | 5 | alert-dialog, badge, button, skeleton |
| Sprints | [sprints-screen.tsx](web/components/sprints-screen.tsx) | 478 | 6 | badge, skeleton |
| Roles | [role-detail.tsx](web/components/role-detail.tsx) | 360 | 4 | button, skeleton, spinner, alert-dialog, **permission-matrix**, badge |
| Dropdowns | [selectable-screen.tsx](web/components/selectable-screen.tsx) | 431 | 11 | badge, button, input, select, skeleton |
| Rate cards | [internal-rate-card.tsx](web/components/internal-rate-card.tsx) | 477 | 11 | badge, button, label, input, skeleton, spinner, alert-dialog |
| Assistant | [agent-panel.tsx](web/components/agent-panel.tsx) | 367 | 9 | button, badge, spinner, sheet, **agent-chat**, collection-frame, run-steps |

The engine underneath them — [screen-renderer.tsx](shared/web/screen-engine/screen-renderer.tsx)
(882 lines) — is the one place that reaches deep into the kit: DataTable, RecordDetail,
DescriptionList, CardGrid, Card, ActivityFeed, DatePicker, FileUpload, Switch, Avatar. Screens
that go through a recipe therefore look far more "kit" than screens that don't. That is the
fault line the whole inventory sits on.

### 1.2 The client portal (`web-portal/`)

| Screen | File | Lines | div/span | Kit parts imported |
|---|---|---:|---:|---|
| **Shell** | [portal-shell.tsx](web-portal/components/portal-shell.tsx) | 351 | 11 | button, ambient-background, skeleton |
| Home | [home-screen.tsx](web-portal/components/home-screen.tsx) | 183 | 6 | button, skeleton |
| Tickets | [tickets-screen.tsx](web-portal/components/tickets-screen.tsx) | 107 | 4 | button, skeleton, spinner |
| Ticket | [ticket-screen.tsx](web-portal/components/ticket-screen.tsx) | 349 | 5 | badge, button, card, skeleton, textarea, **portal-conversation** |
| Deliverables | [deliverables-screen.tsx](web-portal/components/deliverables-screen.tsx) | 192 | 5 | skeleton |
| **Impact** | [impact-screen.tsx](web-portal/components/impact-screen.tsx) | 346 | **21** | accordion, badge, skeleton, comments |
| Company | [company-screen.tsx](web-portal/components/company-screen.tsx) | 120 | 4 | description-list, skeleton, badge, list |
| Sign in | [sign-in.tsx](web-portal/components/sign-in.tsx) | 148 | 8 | button, input, spinner |
| No access | [no-access.tsx](web-portal/components/no-access.tsx) | 67 | 1 | button, skeleton, icons |

### 1.3 The kit parts these screens should be using and are not

Every one of these is a component that exists in `shared/ui/components/`, is never imported by
either door, and has a hand-built counterpart in the app. Read from each kit file's own header.

| App file | Kit part it duplicates | Kit's own description |
|---|---|---|
| [import-screen.tsx](web/components/import-screen.tsx) | `import-wizard` | "upload → plan → review → run → report" — the exact five phases the app file implements |
| [import-screen.tsx:262](web/components/import-screen.tsx) mapping preview | `data-preview-table` | "imported rows before they are committed" |
| [record-calendar.tsx](web/components/record-calendar.tsx) | `calendar-view` | "month grid, day cell, event chip, agenda" |
| [process/steps-panel.tsx](web/components/process/steps-panel.tsx) | `checklist` | "ordered tasks with completion" |
| [timer-bar.tsx](web/components/timer-bar.tsx) | `stopwatch` | "the running timer pill — the floating layer's second tenant" |
| [triage-strip.tsx](web/components/triage-strip.tsx) | `queue` | "one record at a time: decide, and advance" |
| [app-tiles.tsx](web/components/app-tiles.tsx) | `tiles` | "one big tile per record — a body swap for CollectionFrame" |
| [load-more.tsx](web/components/load-more.tsx) + [collection-frame.tsx](shared/web/screen-engine/collection-frame.tsx) pager | `pagination` | "page N of M" |
| [impact-panel.tsx](web/components/impact-panel.tsx), [pulse-charts.tsx](web/components/pulse-charts.tsx), [impact-screen.tsx](web-portal/components/impact-screen.tsx) | `rings`, `kpi-progress`, `progress-dashboard`, `donut` | the chapter-19 chart-view cards |
| [process-map.tsx](web/components/process-map.tsx), [process-flowchart.tsx](web/components/process-flowchart.tsx) | `flowdetail`, `swimlane`, `gantt` | "the same tree, click a step for its full record" |
| [error-boundary.tsx](web/components/error-boundary.tsx) ×2 doors | `alert` (imported by 1 file in the whole repo) | — |
| [app-shell.tsx:372,543](web/components/app-shell.tsx) | `separator` | the kit's own header: "0 direct call sites; the divider every card stack, menu and toolbar reaches for" |
| 58 files hand-drawing headings with `text-2xl font-medium` etc. | `typography` (`Headline`/`Text`/`Hint`), `title` | — |
| 165 `title=` attributes | `tooltip` | — |

**The 58 never-imported component directories, in full:**
`action-row agenda article-body aspect-ratio brand breadcrumb calendar-view chat checklist choice
clamp compare container copilot-overlay data-preview-table detail-view donut flowdetail folder form
gallery gantt heatmap hover-card import-wizard kanban kpi-progress map matrix notes notifications
pagination progress-dashboard progress-toggle pulse-band queue radar rating rings screen-renderer
separator signature spacer split spreadsheet stopwatch swimlane tiles timeline title tooltip tree
typography use-virtual-rows video visibility web-embed`

---

## 2 · Controls, glyphs and toasts from somewhere other than the kit

**R39 holds.** No file in `web/`, `web-portal/` or `shared/web/` imports a UI package, with one
reasoned exemption ([registry.ts:405](shared/rules/registry.ts) — `screen-renderer.tsx` reaching
Radix directly for a four-presentation dialog the kit does not expose). Glyphs: 109 imports, all
`@shared/ui/foundations/icons`. Toasts: 107 imports, all `@shared/ui/components/sonner/sonner`.
Nothing to report there.

The subtler version — a hand-rolled control duplicating a kit part — is real:

**2.1 · 24 raw `<button>` elements.** The whole navigation system is one of them.
[app-shell.tsx:200](web/components/app-shell.tsx) (`navButton`),
[:384](web/components/app-shell.tsx) (collapse toggle), [:487](web/components/app-shell.tsx)
(mobile bottom nav), [:507](web/components/app-shell.tsx) (overflow), [:548](web/components/app-shell.tsx)
(sheet nav) — five hand-rolled controls in one file, and the kit ships `compositions/templates/rail.tsx`,
a 1,100-line finished navbar with `RailGroup`/`RailItem`/`RailMember`, collapse, tooltips, counts and
its own token family. The remaining 19 are in
[google-source-dialog.tsx](web/components/google-source-dialog.tsx) (4),
[google-scope-dialog.tsx](web/components/google-scope-dialog.tsx) (3),
[agent-panel.tsx](web/components/agent-panel.tsx) (2), [process-detail.tsx:660](web/components/process-detail.tsx),
[record-calendar.tsx:145](web/components/record-calendar.tsx),
[agent-history-dialog.tsx:75](web/components/agent-history-dialog.tsx),
[contact-panels.tsx:54](web/components/contact-panels.tsx),
[record-table.tsx:236](web/components/record-table.tsx),
[kwapso-screen.tsx:188](web/components/screens/kwapso-screen.tsx),
[timer-bar.tsx:151](web/components/timer-bar.tsx),
[wave-detail.tsx:324](web/components/wave-detail.tsx). Several are deliberate and documented
(the calendar cell and the process step both explain *why* a real `<button>`); the nav ones are not.

**2.2 · The rail has no surface, and the kit has a token family for it that nothing reads.**
[app-shell.tsx:357-358](web/components/app-shell.tsx) — the `<aside>` sets
`hidden shrink-0 flex-col border-r …` and **paints no background at all**. Active nav is
`bg-muted text-foreground`; hover is `hover:bg-muted/50`. The kit defines `--spine-fill`,
`--spine-ink`, `--spine-ink-quiet`, `--spine-active-fill` (mango), `--spine-active-ink`,
`--spine-active-hover`, `--spine-chip-fill`, `--spine-mark-fill` and three rail modes
(`ink | paper | mango`). **Nothing in either front door mentions `--spine` once** — the 13
grep hits for "spine" are all the phrase "customer spine", a different thing entirely.

The kit's own `screen-shell.tsx` header names this exact defect as a client complaint:
> "THE RAIL IS A CONTAINER AND IT IS SOFT PAPER. `background: var(--sheet)` on 28 of 28 rails.
> The build painted nothing here and got away with it only because the card behind it happened
> to be soft paper."

**2.3 · Hand-rolled separators.** [app-shell.tsx:372](web/components/app-shell.tsx) and
[:543](web/components/app-shell.tsx) are `<div className="bg-border my-2 h-px w-full" role="separator" />`.
Also [auth-card.tsx:92,94](web/components/temp/auth-card.tsx) and
[sign-in.tsx:111,113](web-portal/components/sign-in.tsx). The kit's `separator` is a Radix
Separator with two documented weights and an eyebrow slot, at 0 call sites.

**2.4 · `list-compat` silently drops three kit affordances.**
[list-compat.tsx:38](shared/web/list-compat.tsx) declares
`Omit<KitListProps, "rows" | "onRowSelect" | "variant" | "state">`. The adapter itself is right
(it draws through the kit), but omitting `state` means **no call site can put a list into the
kit's own `loading` / `empty` / `error` body**. That is precisely why every list screen hand-rolls
a Skeleton block above it. `density` (the kit offers 56 or 44 and "nothing between them") is
passed through but never set by any of the seven call sites.

---

## 3 · The root cause: 33 of 47 compositions cannot run under Next

I resolved the full import closure of every composition and looked for a static asset anywhere in it.

| | Count | |
|---|---:|---|
| Compositions the app **can** import today | **14** | `page-failure`, `form-screen`, `import-flow`, `record-chrome`, `search-results`, `stat-strip`, `stepper-hero`, `access-denied`, `assistant`, `delete-confirmation`, `export`, `import-proposal`, `quick-view`, `states` |
| Compositions blocked by an asset in their closure | **33** | everything else |
| Compositions actually imported today | **1** | `templates/record-chrome`, by [web/components/record-chrome.tsx:37](web/components/record-chrome.tsx) |

Two files cause all 33:

- **`shared/ui/components/brand/brand.tsx:238-243`** — six `import … from "../../assets/logos/*.svg"`,
  fed to `<img src={art.black}>`. 28 compositions reach it, including **`screen-shell`, `rail`,
  `main-screen`, `detail-screen`, `collection-screen`, `record-route`, `multi-step-form`,
  `empty-collection`, `no-results`, `archive`, `new-empty-record`, `home`, `settings`, `profile`,
  `portal-home`, `portal-impact`, `company-hub`, `not-found`, `onboarding`, `import`,
  `bulk-edit`, `filter-builder`**. Next types `*.svg` as `any`, so these *compile* and then render
  `src="[object Object]"`.
- **`shared/ui/compositions/templates/sign-in.tsx:166-168`** — three photography imports typed
  `string | Blob | undefined`. These **hard-fail `next build`**: `sign-in`, `sign-in-system`
  (via brand), `splash`, `link-sent`, `session-expired`, `invite-acceptance`.

This is already known and worked around in one place —
[web-portal/components/auth-artwork.tsx](web-portal/components/auth-artwork.tsx) is a 40-line
shim that imports the same assets and passes `.src` through, with a header that ends
"reported upstream to Kwapso/kwapso-ui-ux rather than fixed here, because `shared/ui/` is pinned."
**Correcting a belief worth correcting:** the blanket "kit compositions don't work under Next"
is too broad. Only these two files are the problem, and 14 compositions are importable *today*
with no upstream change at all.

> **UPSTREAM NOTE 1 — the highest-value item in this report.** In `brand.tsx` and
> `compositions/templates/sign-in.tsx`, resolve artwork to a URL string rather than assuming the
> bundler's return value is one (`typeof src === "string" ? src : src.src`), or accept the mark
> as a prop the way `AuthShell` already accepts `mark`/`media`. One change; 33 compositions
> become usable in both doors.

---

## 4 · Drift the enforced laws cannot see

R29 (one page width), R31 (two radii) and R32 (closed palette) are machine-checked and green, and
I did not re-audit them. Everything below is unchecked by anything.

### 4.1 · Dark mode: the ambient field's dark-mode dial-down is dead code — **verified**

[web/app/globals.css:117](web/app/globals.css) and [:121](web/app/globals.css) are
`.dark .ambient::before` / `.dark .ambient::after` — they lower the mango field to 34% / 26%
opacity in dark mode. **Nothing ever writes a `.dark` class.**
[shared/web/theme-provider.tsx:4-8](shared/web/theme-provider.tsx) says so in its own comment
("wrapped next-themes, which wrote a `.dark` CLASS on <html>. The design kit keys every token off
`data-theme` instead"), and its boot script writes `setAttribute("data-theme", m)`. I compiled the
agency stylesheet: `.dark` appears in the *entire* 209KB output only in those two rules, and
`classList` appears nowhere in either front door.

**Consequence:** on the agency app in dark mode, three blurred mango pools drift behind every
screen at full light-mode intensity. That is a two-word fix and it is the single most visible
item here.

### 4.2 · Loading states: every form in the app greys its own save button

Kit rule 5.4: *"A control keeps its own fill, grows a spinner, sets native `disabled` and
`aria-busy`, and skips the disabled skin."* `button.tsx:286` implements it exactly:
`const showDisabledSkin = disabled && !loading`.

[shared/web/form-shell.tsx:74-75](shared/web/form-shell.tsx):
```tsx
<Button type="submit" disabled={submit.busy || submit.disabled} className="gap-1">
  {submit.busy ? <Spinner /> : submit.icon}
```
`busy` is passed as `disabled`, so `showDisabledSkin` is true and the button loses its mango fill
the moment you press it. The kit's `loading` prop is used **6 times in the whole repo** against
**43 `<Spinner>` renders**. R4 routes **38 files** through FormShell, so this is one seam and every
form in both doors.

### 4.3 · Empty states: sixteen collections, no next action, no heading

Every recipe collection renders [collection-frame.tsx:372](shared/web/screen-engine/collection-frame.tsx):
```tsx
<div className="rounded-[var(--radius)] border border-dashed p-8 text-center text-sm text-muted-foreground">
```
— a dashed box, an optional concept glyph, and one grey sentence. The sixteen sentences are
"No members yet.", "No roles yet.", "No invites yet.", "No tickets yet.", "No accounts yet.",
"Nothing in the knowledge base yet.", "Nothing in Meetings yet.", "No processes yet.",
"No work in hand.", "No sprints yet.", "No apps recorded yet.", "Nothing on our own list.",
"Nothing in the brand library yet." … **None offers a way out.**

The kit's `compositions/states/empty-collection.tsx` takes `eyebrow`, `heading`, `zero`, `title`,
`body`, `create` and `secondary` — and its default labels are `"Add the first"` / `"Import a list"`,
with a portal preset of `"Raise your first request"`. Blocked today by §3.

`archive`, `no-results` and `new-empty-record` are three more finished states, unused.

### 4.4 · Error and refusal states are one line of grey text, not screens

[screen-bits.tsx:84-104](web/components/deep-link/screen-bits.tsx): `NoAccess`, `NotFound` and
`LoadError` each render a single `<p>` with a 16px glyph. `NotFound` is literally
*"That screen doesn't exist."* on an otherwise blank page. `module-content.tsx:152` renders
`<p className="text-muted-foreground text-sm">That record no longer exists.</p>` with no frame at all.

The kit ships `compositions/screens/not-found.tsx`, `page-failure.tsx`, `session-expired.tsx` and
`compositions/overlays/access-denied.tsx`. **`page-failure` and `access-denied` are in the
importable-today list of §3** — nothing is blocking those two.

Elsewhere, **58 files carry `text-destructive` / `border-destructive` / `bg-destructive` classes
directly** (89 occurrences — error text, warning boxes, destructive buttons) while the kit's `Alert` is imported by exactly
one file ([assistant-limit-notice.tsx:47](web/components/assistant-limit-notice.tsx)).

### 4.5 · Opacity standing in for a state colour — 15 screens

Kit rule 2.3: *"Disabled is a fill and an ink. Hover is a token. Never an opacity… An alpha applied
to a token is a colour the palette does not contain."*

**`opacity-60` is the app's house style for "deactivated".** [work-panels.tsx:82](web/components/work-panels.tsx),
[internal-rate-card.tsx:167,386](web/components/internal-rate-card.tsx),
[selectable-screen.tsx:260](web/components/selectable-screen.tsx),
[account-rate-card.tsx](web/components/account-rate-card.tsx), [review-dialog.tsx](web/components/review-dialog.tsx),
[deliverables-panel.tsx](web/components/deliverables-panel.tsx), [contact-panels.tsx](web/components/contact-panels.tsx),
[process-map.tsx](web/components/process-map.tsx), [story-form-dialog.tsx](web/components/story-form-dialog.tsx),
[help-form-dialog.tsx](web/components/help-form-dialog.tsx),
[work-logs-panel.tsx](web/components/work-logs-panel.tsx),
[account-detail-panels.tsx](web/components/account-detail-panels.tsx), [pulse.tsx:147](web/components/pulse.tsx),
[account-switcher.tsx](web-portal/components/account-switcher.tsx). Plus `opacity-40` on
[record-calendar.tsx:370](web/components/record-calendar.tsx) (out-of-month days) and
[record-table.tsx:249](web/components/record-table.tsx) (the sort glyph).

**And 50 alpha-composited token colours** — `bg-muted/50` ×9, `bg-muted/40` ×9, `border-border/60` ×4,
`bg-warning/10`, `bg-destructive/10`, `bg-primary/20`, `border-destructive/40`, `bg-accent/50`…
**15 of them are hover states**, which the rule names specifically. R32 does not catch these
because they are tokens, not ramps.

Since deactivation is a real product state (§"deactivate, never delete" is a house law), this
probably wants **one decided token pair**, not fifteen 60% composites.

### 4.6 · Type scale: token-clean, semantically empty

Every size class in both doors resolves to a kit token: `text-sm` ×342, `text-xs` ×203,
`text-badge` ×51, `text-lg` ×24, `text-2xl` ×24, `text-micro` ×16, `text-3xl` ×8, `text-base` ×6,
`text-xl` ×2. No off-token step, no arbitrary font size. Good.

But 545 of those 676 uses are `text-sm`/`text-xs`, **58 raw `<h1>`–`<h6>` carry their own classes**,
and the kit's four semantic type components — `Headline`, `Text`, `Hint` (`typography`) and `Title` —
are imported **zero** times. `text-caption` is defined and never used. The result is a page whose
type is technically on-system and has almost no hierarchy: heading, body and caption are all
"14 or 12, sometimes bolder".

### 4.7 · Spacing rhythm: clean, with a small caveat

Every numeric spacing class in both doors lands on the kit's grid; the only strays are 24 uses of
the 2px sub-grid, which the kit reserves for optical nudges and not layout —
`py-0.5` ×7, `gap-0.5` ×2, `gap-y-0.5` ×1 are being used as layout
([collection-heading.tsx:61](web/components/collection-heading.tsx),
[process-map.tsx:136,191,197](web/components/process-map.tsx),
[app-money-panel.tsx:124](web/components/app-money-panel.tsx)). Nothing above `p-8`/32px is used
except values that happen to coincide with the token. This is the healthiest dimension in the audit.

### 4.8 · Density: control heights are numbers, not tokens

Kit rule 1.3: *"Control heights come from a token, never from a number."* The kit defines
`--control-height-dense` 32, `-field` 38, `-button` 40, `-input` 44, `-row` 56, `-pill` 26.
The app uses `h-8` ×8, `h-9` ×4, `h-7` ×3, `h-10` ×2, `h-11` ×2, `h-14` ×2 and
`h-[3.75rem]` (60px, [app-shell.tsx:413](web/components/app-shell.tsx)). `h-9` (36) and `h-7` (28)
match **no** token: [selectable-screen.tsx:227,232](web/components/selectable-screen.tsx) shrinks a
kit `Input` and `SelectTrigger` to 36; [client-org-panel.tsx:324,348](web/components/client-org-panel.tsx)
sets 28px pills.

Two `px` literals violate rule 1.1 (rem only): `h-[190px]` on a Skeleton at
[impact-screen.tsx:78](web-portal/components/impact-screen.tsx) and `sm:size-[72px]` at
[record-mark.tsx:127](shared/web/record-mark.tsx). Both trivial. (`max-w-[1600px]`,
`h-[3px]` and the `svh`/`dvh` values are the page container and grid lines, and are fine.)

The portal is on a deliberately different density — 17/18px root and a 44px coarse-pointer floor
in [web-portal/app/globals.css](web-portal/app/globals.css) — which is a documented decision,
not drift.

### 4.9 · Mobile

- **No table in either door passes `minWidth`.** The kit's `Table` exposes it precisely so a narrow
  table *"overflows its container and scrolls rather than crushing its columns"*, and it is
  `undefined` by default. Zero call sites set it, so every table crushes on a phone. Affected:
  [record-table.tsx](web/components/record-table.tsx) (Tasks, Meetings),
  [agent-blocks.tsx:154](web/components/agent-blocks.tsx), and every `DataTable` the engine draws.
- **Two `overflow-x-auto` containers exist in the whole app** — a code block in
  [agent-markdown.tsx:113](web/components/agent-markdown.tsx) and a scroll box in
  [import-screen.tsx:406](web/components/import-screen.tsx). Everything else relies on the kit's
  own inner container, and `globals.css` clips `html`/`body` on the x-axis, so anything wider than
  its box is silently cut rather than scrolled.
- **Ten substantial components carry zero breakpoints**, led by
  [import-screen.tsx](web/components/import-screen.tsx) (91 `className` attributes, 0 breakpoints),
  [meeting-detail.tsx](web/components/meeting-detail.tsx) (56/0),
  [work-panels.tsx](web/components/work-panels.tsx) (52/0), then `agent-blocks`, `draft-review`,
  `story-form-dialog`, `staff-panel`, `account-detail-panels`, `team-switcher`, `time-panel`.
- **The mobile chrome sits on the page tone.** [app-shell.tsx:413](web/components/app-shell.tsx)
  and [:482](web/components/app-shell.tsx) paint the phone header and bottom nav `bg-card` — and
  in light mode the kit states plainly that `--background`, `--card` and `--surface-raised` are
  the same `#FFFEF9` (rule 2.6, contrast 1.000). Both are held up by a hairline alone.

### 4.10 · An upstream bug the app has not hit yet

`font-[var(--font-sans)]` and `font-[var(--font-serif)]` appear in
[shared/ui/components/typography/typography.tsx:98-99](shared/ui/components/typography/typography.tsx)
and [components/article-body/article-body.tsx:139,143](shared/ui/components/article-body/article-body.tsx).
Tailwind 4.3 parses `font-[…]` as **font-weight**, not font-family. Compiled output, verbatim:
```css
.font-\[var\(--font-sans\)\] { --tw-font-weight: var(--font-sans); font-weight: var(--font-sans); }
```
So `Headline serif` sets an invalid `font-weight` and never changes the family. Latent only
because neither component is imported today — but `typography` is exactly what §4.6 recommends
adopting, so it would bite on contact.

> **UPSTREAM NOTE 2.** Use `font-family:` via a `style` prop or a real theme key; `font-[…]`
> is the weight namespace in Tailwind v4.

---

## 5 · Ranked: worst-looking screens first

Ranked by how far the screen is from the kit *and* how much a person looks at it. One line each.

| # | Screen | Why |
|---|---|---|
| 1 | **Dark mode, everywhere (agency)** — [globals.css:117](web/app/globals.css) | The mango field's dark-mode dial-down keys off a `.dark` class nothing has written since the theme provider moved to `data-theme`; three orange pools drift at full light intensity behind every dark screen. |
| 2 | **Import** — [import-screen.tsx](web/components/import-screen.tsx) | 531 lines, 59 hand-drawn divs, three kit parts; the kit ships `ImportWizard` for these exact five phases plus `DataPreviewTable`, `RunSteps` and `ImportFlow`; zero breakpoints in 91 class attributes; errors are `text-destructive bg-destructive/10` boxes where `Alert` exists. |
| 3 | **The navigation rail** — [app-shell.tsx:357](web/components/app-shell.tsx) | Paints no background at all, so the app's spine has no surface; five hand-rolled `<button>`s and two hand-rolled separators where the kit ships a finished `Rail` and eight `--spine-*` tokens nothing reads. |
| 4 | **Every empty collection** — [collection-frame.tsx:372](shared/web/screen-engine/collection-frame.tsx) | Sixteen screens whose zero-state is a dashed box, a glyph and one grey sentence with no action — and it is the screen every brand-new team meets on every page. |
| 5 | **Every form's save button** — [form-shell.tsx:74](shared/web/form-shell.tsx) | 38 forms grey out their own primary button the instant you submit, because `busy` is passed as `disabled`; the kit's `loading` prop exists to keep the fill. |
| 6 | **Portal impact** — [impact-screen.tsx](web-portal/components/impact-screen.tsx) | 21 hand-drawn divs, an `[190px]` px literal, four raw headings; the kit has `portal-impact`, `Rings`, `KpiProgress` and `ProgressDashboard` for precisely this screen, and it is the page the client is *meant* to be impressed by. |
| 7 | **Process detail / process map** — [process-detail.tsx](web/components/process-detail.tsx), [process-map.tsx](web/components/process-map.tsx), [steps-panel.tsx](web/components/process/steps-panel.tsx) | 1,600 lines across three files with 48 hand-drawn divs and a hand-rolled date slider; kit has `flowdetail`, `swimlane`, `gantt`, `checklist`, `slider`. |
| 8 | **Not-found / no-access / load-error** — [screen-bits.tsx:84](web/components/deep-link/screen-bits.tsx) | Every refusal and every 404 in the agency app is one line of 14px grey text on a blank page; `page-failure` and `access-denied` are importable *today*. |
| 9 | **Agency home** — [home-screen.tsx](web/components/screens/home-screen.tsx) | The first screen after sign-in is an avatar, a raw `<h1 text-2xl>`, a badge and a list of links — two kit parts; kit `home` has a stat strip and tiles. |
| 10 | **Deactivated rows, 15 screens** | `opacity-60` as the universal "switched off" treatment, which the kit rejects by name: a 60% token is a colour the palette does not contain, and it lands differently on a page, a panel and a card. |
| 11 | **Tables on a phone** — [record-table.tsx](web/components/record-table.tsx), `DataTable` via the engine | No call site passes `minWidth`, so columns crush instead of scrolling, and the page's `overflow-x: clip` means the overflow is cut rather than reachable. |
| 12 | **Meeting detail** — [meeting-detail.tsx](web/components/meeting-detail.tsx) | 809 lines, 16 hand-drawn divs, four kit parts, zero breakpoints; the longest record screen in the app with no responsive handling. |
| 13 | **Sign-in, both doors** — [auth-card.tsx](web/components/temp/auth-card.tsx), [sign-in.tsx](web-portal/components/sign-in.tsx) | Hand-rolled hairline dividers and hand-built two-panel layout; the kit's `sign-in` screens are the ones hard-blocked by the asset bug (§3), so this one genuinely waits on upstream. |
| 14 | **Housekeeping** — [kwapso-screen.tsx](web/components/screens/kwapso-screen.tsx) | 12 divs, two kit parts, a raw `<button>` and a raw heading — an admin screen that looks like scaffolding. |
| 15 | **Dropdown values** — [selectable-screen.tsx](web/components/selectable-screen.tsx) | Shrinks kit `Input` and `SelectTrigger` to `h-9`, an off-token height, so its controls are visibly a different size from every other screen's. |

---

## 6 · What is genuinely done (so nobody re-audits it)

Each of these is the thing a reader would most suspect, checked and cleared:

**6.1 · The typeface really did change.** I compiled `web/app/globals.css` through the project's
own Tailwind 4.3 + `@tailwindcss/postcss` and read the output. `tokens.css` declares
`--font-sans: "Saans", …` in an **unlayered** `:root` (line 6975 of the output) which beats
Tailwind's `@layer theme` default (line 6), `--default-font-family` resolves to it, and
`html { font-family: var(--default-font-family, …) }` picks it up. The three `@font-face` blocks
are emitted with resolvable paths into `shared/ui/assets/fonts/`. Saans and SerrifCondensed are live.

**Caveat:** both `web/app/layout.tsx:15` and `web-portal/app/layout.tsx:13` still do
`Inter({ subsets: ["latin"], variable: "--font-inter" })` and set the variable on `<html>`.
`--font-inter` is referenced **nowhere** in either door. Both front doors fetch a Google font on
every page load and throw it away. Safe deletion, two lines.

**6.2 · R39 is real.** One exemption, documented, naming its upstream fix.

**6.3 · Spacing is on the grid** (§4.7) and **the type scale is on-token** (§4.6).

**6.4 · `library-overrides.css` is empty of overrides** — only an `@source` line and a
scroll-lock fix that genuinely belongs to the app. That is the discipline working.

**6.5 · The screen engine is properly kit-drawn.** `screen-renderer.tsx` reaches 15 kit
components. Any screen expressed as a recipe already looks like the kit; the gap is entirely in
the bespoke hosts.

---

## 7 · Suggested batches for when the feedback lands

Ordered by ratio of screens fixed to work done, so notes can be answered in groups.

1. **One line:** delete `.dark` from `globals.css:117,121` (or re-key to `data-theme`) → dark mode
   across the whole agency app.
2. **One seam:** `form-shell.tsx:74` — pass `loading={submit.busy}` instead of folding busy into
   `disabled` → 38 forms.
3. **One seam:** `collection-frame.tsx:372` — give the empty state a heading and the section's
   create action → 16 collections.
4. **Two files:** swap `NotFound`/`NoAccess`/`LoadError` onto the kit's `page-failure` and
   `access-denied`, which need no upstream change → every refusal and 404.
5. **One decision:** replace `opacity-60` with a decided deactivated token pair → 15 screens.
6. **Upstream, then large:** fix `brand.tsx` artwork resolution → unlocks `ScreenShell`, `Rail`,
   `EmptyCollection` and 30 more compositions; then the rail, the home screen and the shell
   become adoption rather than authoring.
7. **Per-screen, in rank order:** Import (→ `ImportWizard`), Portal impact (→ `Rings`/`KpiProgress`),
   Process (→ `Flowdetail`/`Checklist`), calendar (→ `CalendarView`), timer (→ `Stopwatch`),
   triage (→ `Queue`), tiles (→ `Tiles`).
8. **Cross-cutting:** pass `minWidth` on every table; adopt `Headline`/`Text`/`Hint` for the 58
   raw headings (after Upstream Note 2 lands); delete the two dead `Inter` imports.

---

## 8 · Card-on-card census (requested by the planner, 2026-08-28)

Requested after the assistant-drawer fix ([99d165e7](.)): find every region that contains cards
and stands on `bg-popover`, `bg-background` or `bg-card`. **Census only — nothing fixed.**

Kit re-read at **v1.2.3** (`3934658`). The bump changes only `components/agent-chat/agent-chat.tsx`
and `components/chat/chat.tsx` — `diff -rq` against the v1.2.2 tree confirms no other file moved —
so nothing in this report is affected by it.

### 8.1 · Every `<Card>` render site in both doors, and its ground

There are **six**, and **not one passes `variant`**. All are therefore `variant="default"` =
`bg-surface-panel`, which PATTERN.md §11 reserves for a card sitting on the **page**.

| Site | Ground it stands on | Verdict |
|---|---|---|
| [screen-bits.tsx:114](web/components/deep-link/screen-bits.tsx) `CollectionCard` — wraps **every** agency collection | `<main>` → `<body>` → **nothing** (§8.3) | panel on UA canvas — visible, but not the designed ground |
| [screen-renderer.tsx:646](shared/web/screen-engine/screen-renderer.tsx) `Card` inside `CardGrid` | `CollectionCard`, i.e. `--surface-panel` | **FAULT — see §8.2** |
| [staff-panel.tsx:194](web/components/staff-panel.tsx), [:237](web/components/staff-panel.tsx) | member record body → `<main>` → `<body>` → nothing | panel on UA canvas — visible |
| [ticket-screen.tsx:257](web-portal/components/ticket-screen.tsx), [:319](web-portal/components/ticket-screen.tsx) | portal `<main>` inside `<body class="bg-background">` | **correct** — panel on page, exactly §11 |

### 8.2 · One live fault: the knowledge base collection

`display: "cards"` appears on exactly one recipe —
[screens.ts:457](web/lib/screens.ts), the knowledge base, whose own comment says it is
*"the one collection that earns them… a card gives the source's own glyph room to be seen
before the title is read, which is the whole point of drawing it (R35)."*

The render path is
[collection-content.tsx:604](web/components/deep-link/collection-content.tsx) →
`SectionWithCreate` → `CollectionCard` (`<Card>`, `--surface-panel`) →
`ScreenRenderer` → `<CardGrid>` → `<Card>` (`--surface-panel`).

**Panel on panel — the same token on both sides.** This is worse than the assistant instance
the planner fixed: `--popover` and `--card` merely *share a value* (so it is a 1.000 that could
in principle diverge), whereas these two are literally `var(--surface-panel)` against
`var(--surface-panel)`, so the contrast is 1.000 in **every** palette, present and future. The
one collection in the app that was given cards deliberately, for a stated reason, draws them
invisibly. Per §11 the fix is `variant="raised"` on the grid's card, which no site currently passes.

### 8.3 · The structural cause: the agency `<body>` paints no ground at all

[web/app/layout.tsx:32](web/app/layout.tsx) is `<body className="min-h-[100svh] antialiased">`.
[web-portal/app/layout.tsx:28](web-portal/app/layout.tsx) is
`<body className="bg-background min-h-[100svh] antialiased">`.

I compiled the agency stylesheet and read every `html`/`body` rule in the 209KB output: they are
Tailwind's preflight (`line-height`, `font-family`, `tab-size`), `scrollbar-gutter: stable`,
`overflow-x: clip` and `max-width: 100vw`. **Not one rule sets a background on `html` or `body`,
and `tokens.css` paints neither.** So the agency app's page ground is the browser canvas — white
under `color-scheme: light` (tokens.css:89) — and not `--background` `#FFFEF9`.

That is why the agency door does *not* show the card-on-card fault where the portal would: white
is not soft paper, so a `--surface-panel` card on it happens to be visible. The bug is masked by a
second bug. It also means the kit's "two papers on off-beige ground" model
(`compositions/templates/screen-shell.tsx`) is not what either the light or the dark agency screen
is actually drawing.

### 8.4 · Two things that look like the fault and are not — checked, cleared

- **`<List>` — nine call sites, zero faults.** The kit's `List` fills `bg-card` at
  `variant="panel"` and `variant="cards"`. All six `list-compat` sites pass `surface="none"`
  ([record-calendar](web/components/record-calendar.tsx), [profile-screen](web/components/screens/profile-screen.tsx),
  [settings-screen](web/components/screens/settings-screen.tsx) ×2, [invitations](web/components/invitations.tsx),
  [home-screen](web/components/screens/home-screen.tsx), [sprints-screen](web/components/sprints-screen.tsx),
  [screen-renderer](shared/web/screen-engine/screen-renderer.tsx) ×2) → `variant="rows"`, no fill.
  Both portal sites ([delivery-block:50](web-portal/components/delivery-block.tsx),
  [company-screen:98](web-portal/components/company-screen.tsx)) import the kit's `List` directly
  and pass `variant="rows"`. The `<List>` at
  [agent-markdown.tsx:78](web/components/agent-markdown.tsx) is `block.tag` — a markdown
  `<ul>`/`<ol>`, not the kit component.
- **`ScreenLayer` at `bg-card`** ([screen-renderer.tsx:240](shared/web/screen-engine/screen-renderer.tsx))
  holds forms, not cards. A `variant="raised"` card would be invisible there; none exists.

### 8.5 · Correction to §2.4 of this report

§2.4 said `list-compat` omitting `state` means "no call site can put a list into the kit's own
loading/empty/error body". That holds for the **six `list-compat` sites**, but the portal's two
sites import the kit's `List` directly and
[company-screen.tsx:100](web-portal/components/company-screen.tsx) does pass
`state` and `emptyTitle`. The portal is ahead of the agency door here, not behind it.
