# Composition mismatches — why the number stops where it stops

The owner's target is 47 of 47 kit compositions (`shared/ui/compositions/`)
imported into the app. It began as the record of a full pass over the 23
`templates/` and `overlays/` compositions assigned to one lane on 2026-08-29,
**re-examined the same day** after a peer's correction (below) turned two of
the seventeen rejections into doors — and it now also carries the `screens/`
and `states/` findings from the second lane's pass, so one file answers "why
did this one stop" for the whole catalogue rather than two files each
answering half.

**Reading this file:** `[x]` means the composition fits and was adopted. `[~]`
means it is now judged ADOPTABLE — a real opt-out or override was found on
re-examination — but has not been rolled out yet; each one names what a
prototype still needs to prove. `[!]` means a genuine, structural mismatch
survives re-examination under the three conditions below, and the reason is
written under it. `[ ]` means no current app equivalent exists to compare
against. `[?]` means it's a real candidate that needs a human call.

Every verdict here was reached by reading the composition's actual props
interface and doc header, then reading the app's real current equivalent
side by side — never by matching on a name. See CLAUDE.md's own warning: an
audit on 27 Aug 2026 matched five app-side files against kit files sharing
their name and reported 4,122 lines of "shadowed kit code" that did not
exist, because `visibility`/`notes`/`collection-frame`/`screen-renderer` do
different jobs from their kit namesakes. The same discipline applies here in
reverse — a composition can share a NAME's job and still not share its
CONTRACT (RecordChrome vs. DetailScreen is the example the app already lived
through).

## A note on the numbers: adoptions the census cannot see

`KIT-COVERAGE.md`'s `[x]`/`[ ]` count is a census of DIRECT imports — it
greps `@shared/ui/...` import strings in `web/`, `web-portal/` and
`shared/web/`. That undercounts real adoption whenever this app reaches a
kit part THROUGH another kit part it already imports, because the inner
import never appears in the app's own source. Two confirmed so far:

- **`notes`** shows unchecked, but `comments/comments.tsx` (already
  adopted, `[x]`) imports it directly (`import { Notes } from
  "../notes/notes"`) and is built on top of it. Every place `Comments`
  renders in this app is already drawing `Notes`'s row.
- **`folder`** shows unchecked, but `tabs/tabs.tsx` (already adopted,
  `[x]`) imports it for the `variant="folder"` tab strip already in use
  (`web/components/deep-link/screen-bits.tsx`'s `SectionWithCreate`,
  `folderTabs` slot).

Neither is a gap to close — both are already reaching this app, just
invisible to a grep that only looks one import deep. The real number of
kit parts genuinely serving this app is `[x]`'s count plus at least these
two, and there is currently no automated way to find the rest of them (the
check would need to walk each `[x]` component's own import graph, not
just the app's). Worth a `kit-coverage.mjs` enhancement if the owner wants
the number itself to be trustworthy rather than a floor.

## THE 2026-08-29 CORRECTION — READ THIS BEFORE TRUSTING AN OLDER VERDICT

The first pass over these 23 checked whether a claim about a composition was
**true** and not whether it was **dispositive** — the same shallow-review
mistake the peer who caught it named twice that day. Re-reading all
seventeen `[!]` verdicts under three conditions a first read had missed:

1. **An optional prop is not a mismatch.** Several "requires X" claims were
   never checked against the component's own opt-out. `ScreenShell`'s `rail`
   prop defaults to `<Rail />` but the file's own header states
   `rail={null}` is a real, supported opt-out; `DeleteConfirmationDialog`'s
   `confirmWord` accepts `null` for the one-press case with no typed word at
   all; `AccessDeniedScreen`'s "Request access" control and its "who can
   grant it" well are ONE conditional block, gated on `grantor`, and an
   `undefined` grantor renders neither; `StepperHero`'s `onStageSelect` is
   optional and its own register 10 states the read-only case in words.
   Four "requires a feature we don't have" verdicts were actually "requires
   a feature we don't have **unless you don't pass the prop that turns it
   on**," and nobody had checked.
2. **The kit is no longer fixed.** The owner has granted permission to fix
   genuine bugs in Kwapso/design upstream, tag, and re-import — never to
   hand-edit `shared/ui/` directly (hash-pinned; that turns the build red),
   and never to reshape the aesthetic. Where a composition's own behaviour
   (not its data shape) was the blocker, that changes what "mismatch" means:
   it's a fix to propose upstream, not a wall.
3. **Assemble from components where no composition exists.** A `[ ]` verdict
   ("no current app equivalent") is not the end of the question — the kit's
   own components can sometimes be assembled into the missing shape by the
   kit's own rules, rather than left as a gap.

Two corrections are recorded below in full because they change the actual
architecture question — the ScreenShell-owns-the-rail family and
`DeleteConfirmationDialog` — and one has already shipped (`StepperHero`,
verified live). The rest hold: an optional prop or an upstream fix was
checked for and genuinely does not exist. Where a verdict changed, the
superseded reasoning is removed rather than kept beside the new one — "a
record of why something was rejected is only useful while it is true."

## [x] Adopted

**`shared/ui/compositions/templates/stepper-hero.tsx`, read-only, for the
ticket status track** (`web/components/help-status-stepper.tsx`).
`RecordChrome`'s own `headerExtra` slot forwards to the kit's `hero` prop —
named for exactly this composition. `door="system"` (7 stages) matches
`HELP_STATUSES` exactly; no `onStageSelect` is passed, which register 10 of
the composition's own doc states in words: "the strip states, and nothing
moves" — the identical read-only contract `StatusStepper` already gave this
screen directly, now with the hero treatment (fold-after-5, the current
stage's only mango, tabular stage numbers) `StatusStepper` alone never drew.
Verified live at 390/768/1280/1920, both themes
(`scripts/lane-shots/verify-stepper-hero.mjs`) — the "+2" fold reads cleanly
at every width including the narrowest phone wrap. No new i18n strings (no
`copy`/label props passed). Committed `811cc5ef`.

**Not** applied to `story-status-stepper.tsx`: stories have 4 stages, and
the kit's only 4-stage progression (`door="delivery"`) is a **vertical
wizard rail**, not the horizontal record hero — the composition's own header
says so in words: "the kit draws no four-stage record vocabulary." Forcing
`door="delivery"` would swap a horizontal pill row for a sidebar-shaped
stepper on every story. Left on `StatusStepper` directly, which was already
the correct, minimal adoption for that screen.

**`shared/ui/components/collection-frame/collection-frame.tsx`'s underlying
STATE capability** (loading/error, not the full component — see `[~]`
below) — `shared/web/screen-engine/collection-frame.tsx`, wired to the kit's
`ShapeStateBody`. Committed `3115b132`, merged `e9b6c157`. Full detail
unchanged from the first pass; see git history rather than repeat it here.

**The ScreenShell-owns-the-rail family (6 templates) — LANDED.**
`templates/detail-screen.tsx`, `record-route.tsx`, `collection-screen.tsx`,
`main-screen.tsx`, `screen-shell.tsx` and `portal-home.tsx` were first
rejected because all six compose `ScreenShell`, which draws a rail, and
this app already has one persistent, app-wide sidebar
(`web/components/app-shell.tsx`). That check never read whether the rail's
CONTENTS were forced — they are not: `rail={null}` is a real, documented
opt-out, confirmed both by reading the prop doc and by a peer's render
probe (zero `nav`/`aside` elements, no 13rem column in the markup, for all
six). What survived that correction was a real, different question:
`ScreenShell` is a per-route composition and `AppShell` is the persistent
one R37 requires — using the templates as documented (each instantiating
its own `<ScreenShell rail={…}>` per screen) would remount the rail's DOM
on every navigation even though the outer app-wide shell never unmounts.

Resolved by composing bare `screen-shell.tsx` ONCE, at the layout level —
`web/components/app-shell.tsx` now renders `<ScreenShell spine="paper"
rail={…}>{children}</ScreenShell>` instead of its own hand-rolled
`<aside>`/`<div>` structure, with the rail's actual content (TeamSwitcher,
both nav groups, ProfileMenu, the collapse toggle) re-homed as the `rail`
node, byte-identical otherwise. `spine="paper"` is explicit — the shell's
own default is `spine="mango"`, a later ruling this app hasn't adopted.

VERIFIED NAVIGATING, not at rest, because a bad prototype here looks fine
in a still frame and only fails on navigation
(`scripts/lane-shots/verify-screen-shell-appshell.mjs`): an `ElementHandle`
for the rail's root node was captured on initial load, then four real
in-app navigations were driven (Home → Accounts → Tickets → Stories →
Home), re-querying the same selector after each click and comparing
against the ORIGINAL handle with `===` — object identity, not a "looks the
same" check. PASS on all four; R37 holds. Also verified at 390/768/1280/
1920, both themes. The sticky-height risk this integration raised (a bare
flex rail column stretches to the tallest sibling — the exact "flash" bug
the removed `<aside>` comment described) is solved by the rail content
cancelling the shell column's own `--rail-inset` padding with an equal
negative margin and re-spending it on itself, so it can carry its own
`sticky top-0 h-[100svh] overflow-y-auto` independent of a column the shell
owns.

Caught two real mistakes before landing: an arbitrary `pb-20` (80px, not on
the kit's admitted spacing scale — `design-scale.test.ts` caught it) where
the old code's `pb-24` (96px, admitted) was the value actually needed; and
`web/test/shell-nav.test.ts` had two assertions that string-matched the old
`<aside>` tag directly, which failed against the new shape even though the
property they guard (rail is one window tall, pinned, scrolls internally)
still held — fixed on main (`4bc9b1f9`) to find the rail by what it does
rather than by its tag, so it now passes on either shape.

**One known, accepted consequence, not a bug to "fix" later:** on a screen
with nothing to show in the header slot (no breadcrumbs, no running timer —
e.g. Home on a phone), `ScreenShell` still spends the header band's density
padding, because it only checks whether the `header` prop is a truthy
node, not whether what's inside it renders anything. Gating `header` on
content would also drop the desktop `TimerBar` row on breadcrumb-less
pages — trading a cosmetic gap for a functional loss — so it stays. A
record page (RecordChrome draws its own header inside the body, not this
slot) shows no such gap.

Prototyped on `experiment/screen-shell-appshell` (`b84d208d`, `fab6965e`
after rebasing on the `shell-nav.test.ts` fix), landed on this branch by
merge after the planner's review.

### The other five ScreenShell-family templates — collected now that the rail objection is gone

The six-composition family's rejection was the duplicate-rail objection.
That fell for all six at once (above). Read the remaining five individually
rather than assuming the correction makes all of them fit — it doesn't,
evenly.

**`templates/record-route.tsx` and `templates/detail-screen.tsx` —
ALREADY REALIZED, no new import needed.** Read both in full: each is
nothing but `ScreenShell` (header slot left EMPTY — override 73 moved
records off a separate header band entirely, "everything the record needs
to say lives in `RecordChrome`'s body pane") wrapping `RecordChrome`;
`record-route.tsx` additionally wires `stages` into `StepperHero`'s hero
slot and computes "Edit steps down to secondary while a stage is
highlighted" (ruling 26: never two mangos). This app already assembles
exactly that shape, out of the same two-to-three parts, already adopted
individually: `AppShell` is now `ScreenShell` (this file), every record
screen composes `RecordChrome` through the `RecordScreen` host seam
(`web/components/record-chrome.tsx`), and `StepperHero` is in the hero
slot wherever a record has stages worth showing (`help-status-stepper.tsx`,
this session). There is no additional composition to import — the shape
these two templates document is already built, from parts, under different
file names. The one real difference is a decision already made rather than
a gap: `AppShell`'s `ScreenShell` header carries a persistent
breadcrumb+timer row on every screen including records, where
`record-route`/`detail-screen`'s reference leaves that band empty. That's
this app's own choice (one header treatment everywhere) against the kit's
(records get none) — not a technical mismatch, and reversing it would be a
product call, not an adoption.

**`templates/main-screen.tsx` and `templates/collection-screen.tsx` — MOSTLY
REALIZED; one real, unbuilt architecture question.** `collection-screen.tsx`
literally renders `MainScreen` internally ("RENDERS `MainScreen` rather than
assembling chrome of its own") — same finding covers both. Structure:
`ScreenShell` wrapping `CollectionFrame` with `tone="bare"` `inset={false}`
— the EXACT fix this file's own `useKitPanel` entry above landed
independently, confirmed correct by reading the kit's own reference
afterward rather than before. What's NOT yet built: `MainScreen`'s header
band carries a real, PER-SCREEN heading (eyebrow, title, a meta line, header
actions, via the kit's `Title` component) — this app's collection headings
(`CollectionHeading`) render INSIDE the body instead, because `AppShell`'s
`ScreenShell` header is currently generic (the same breadcrumb+timer row on
every screen, threaded in via one `breadcrumbs` prop from
`deep-link-screen.tsx`) rather than carrying per-screen content. Making the
header genuinely per-screen would mean widening that one prop channel from
"a breadcrumb array" to "arbitrary per-screen header content" — plausible
(the channel already exists and is already per-route), but real, scoped
architecture work on the same file the rail question already touched, not
folded into this pass. Recording it here as the one concrete next question
for whoever picks this back up, rather than a vague "more to check."

**`templates/portal-home.tsx` — no gain, verdict unchanged.** Reread in
full: this composition isn't in the design artifact at all — the kit's own
header says so ("the honest first sentence is that the kit does not draw
this screen... assembled from the rules the kit DOES state about the
portal"). `web-portal/components/home-screen.tsx` already implements the
identical, portal-specific spec (three-thing "waiting on you," the
three-series savings chart, the scoped ambient field) natively. Nothing
here to adopt that isn't already built, independent of the rail-family
correction.

**Net effect on the family's count:** two of six templates
(`screen-shell.tsx` itself, landed) are truly new; two more
(`record-route.tsx`, `detail-screen.tsx`) describe a shape this app had
already assembled from already-adopted parts before today, under other
names; two (`main-screen.tsx`/`collection-screen.tsx`, one finding) are
mostly there with one real open question; one (`portal-home.tsx`) has
nothing to gain. None of the five is imported directly and none will show
in `KIT-COVERAGE.md`'s count as a result — a different shape of the same
"the census can't see it" problem this file already tracks, this time by
recomposition rather than a transitive import.

## [~] Adoptable — a real opt-out exists, not yet rolled out

### `overlays/delete-confirmation.tsx` — split verdict

**`DeleteConfirmationDialog`: CORRECTED to adoptable.** The first pass
rejected this composition wholesale because "this app never permanently
deletes a record" and "confirm dialogs never collect a reason." That was
checked against `ArchiveConfirmationDialog` (below) and wrongly applied to
its sibling. `DeleteConfirmationDialog`'s own prop doc: "Pass `null` for the
one-press case — the field and the hint are then not drawn at all." With
`confirmWord={null}`, the composition is exactly this app's existing confirm
shape — a title naming the record, body copy, Keep/[verb] — because `verb`,
`confirm` and the body text are all overridable via `labels`/`body`/
`bodyNarrow`. This is a real candidate to replace this app's own bespoke
deactivate-confirm dialogs, and it comes with something they don't have:
the composition's own rule for WHEN to require the typed word — "a single
record deletes on one press. Ten or more, or anything a client can see,
requires typing the word" — a real safety net for a high-stakes deactivation
(an Account visible to a client, say) this app has no equivalent of today.
Not prototyped this pass; the next step is finding this app's actual
deactivate-confirm call sites and checking the copy override surface covers
them before swapping one in.

**`ArchiveConfirmationDialog`: still `[!]`, reasoning unchanged.** Its
`reason` field is not optional in any sense the first pass missed — the
confirm press is disabled until the reason field is armed (`reason.trim().length
>= 3`), and the reason is written into an "Archived tab" this app has no
concept of. This is a real product feature (audit-trail reasons on a
reversible action) this app deliberately does not have, not a prop away from
fitting, and adding it is a product decision beyond a UI-adoption pass.

### `overlays/access-denied.tsx` — CORRECTED to adoptable

The first pass rejected this because the client portal has a written rule
against ever offering a client a self-service "Request access" control. Now
checked against the actual render: `grantor` is optional, and the "who can
grant it" well AND the `Request` link are drawn from ONE conditional block
gated on `grantor !== undefined` — there is no way to get the well without
the button (`Request`'s `onClick` is unconditional inside that block, so
`onRequest` alone does not neutralize it; only omitting `grantor` does).
Passing `grantor={null}` removes the self-service affordance cleanly, while
keeping the denial sentence, the blurred page-behind layer and a `Back`
button. **Update from a peer's render-probe sweep:** the composition's
DEFAULT parameter (`grantor = DEFAULT_GRANTOR`) meant an app that merely
*omitted* the prop, rather than passing `null` explicitly, would still have
rendered a real name and a live `Request` link — a genuine kit bug (the
prop's own doc said "undefined draws no grantor block at all," which was
never true against the actual default), now fixed upstream (kit v1.2.4/
v1.2.5) so `grantor={null}` is the clean, confirmed-by-rendering opt-out.
Pass `null` explicitly, not nothing. This is a real fit for the client
portal's `NoAccess` screen. If the portal still wants to name a contact,
that has to be prose in the description text, not the interactive grantor
row. Not prototyped this pass.

### `templates/stat-strip.tsx` — CORRECTED, partially adoptable

The first pass rejected this outright because `pulse.tsx`'s own law is
"aggregate into a big NUMBER **or** reach for a CHART, never fuse them into
one tile." Unchecked: `StatStrip`'s own header calls the mini chart "the
headline numbers, **each with an optional mini chart**" — `spark` is
optional per tile. Without it, `StatStrip` is exactly a row of headline
numbers with a delta, which is what several of `pulse.tsx`'s bespoke
big-number tiles (via the generic `BandCard` wrapper) already are by hand.
This is a real candidate to replace those specific tiles with the kit's own
component rather than a hand-rolled one — not a candidate for the tiles that
already carry a real chart, which stay exactly as `pulse.tsx`'s law says.
Confirmed by a peer's render probe: `StatStrip` with figures and no `spark`
draws no chart element at all. Not prototyped this pass; needs a scan of
which `pulse.tsx`/`impact-panel.tsx` tiles are number-only today before
swapping any in.

### `templates/form-screen.tsx` (+ `templates/multi-step-form.tsx`) — CORRECTED, per a peer's render probe

The first pass rejected this outright: the composition is a side-sheet, this
app's `FormShell` (`shared/web/form-shell.tsx`, 32+ call sites) is a centred
`Dialog`, and the kit's own doc header states the UX position in words ("a
centred modal is for confirmations only"). A peer rendered `FormScreen` with
`surface="page"` rather than reading the prop table, and found it draws a
**plain div** — no dialog role, no sheet, no scrim. The side-sheet chrome
lives entirely in `surface="panel"`; `surface="page"` is the form BODY
alone. That is the same grain this app already found for records
(`RecordChrome`, not `DetailScreen`'s `ScreenShell` wrapper) — the lower-
level content composes into `FormShell`'s own centred `Dialog`, and the
side-sheet-vs-centred-modal disagreement never has to be litigated because
`FormScreen`'s outer sheet is simply never used. Not prototyped this pass;
next step is reading what `surface="page"` actually expects as its steps/
fields contract and whether it fits `FormShell`'s own field-rendering, before
touching any of the 32+ call sites. `multi-step-form` still has nothing to
attach to (no wizard exists in the app) and is unaffected by this correction.

## [!] Confirmed mismatches, re-examined and unchanged (6)

Four groups below, plus `ArchiveConfirmationDialog` and `StepperHero` for
stories, each recorded once under its sibling's entry rather than twice.

### `overlays/import.tsx`, `templates/import-flow.tsx`, `overlays/import-proposal.tsx`

Re-checked for an opt-out: the five-step state machine
(`IMPORT_STEPS`: upload → map → check → run → report) is the composition's
entire premise, not a configurable subset — there is no prop that skips the
manual per-column mapping step. This app's real import is agentic,
multi-file, multi-table, with dependency ordering and FK resolution (see
AGENTIC-IMPORT.md) and no manual per-column mapping UI exists to plug a step
into. One genuine "assemble from components" candidate surfaced on
re-reading: the RUN and REPORT steps' visual shape (a live progress rail, a
per-row failure list) is closer to a reusable primitive than the wizard
around it, and might be worth lifting standalone for this app's own commit
step — flagged, not attempted this pass.

### `overlays/assistant.tsx`

**Reasoning corrected, verdict unchanged.** The first pass's phrasing
implied the kit's version was the modal one; re-reading, it's the reverse —
the composition's own ruling 31 makes it **non-modal by default** ("never
traps focus… you can type in a table while it's open"), and this app's
`AgentPanel` is the one that is modal (a real `Sheet`) on purpose, because it
also live-drives the screen underneath it through a "screen trace" mechanism
the kit has no concept of. Letting someone type in the same table the agent
is actively manipulating is a real correctness question (whose edit wins),
not a styling preference — this is a product decision about concurrent
agent/user control of one screen, not a prop the kit exposes either way. A
peer's render probe confirms the kit's half is real, not just documented:
`Assistant open` renders `role="dialog"` but never `aria-modal="true"` — it
genuinely does not trap focus.

### `overlays/export.tsx`

Re-checked: `columns` is not optional, and the composition's whole premise
(a scope choice + a column picker + a format choice) has no reduced mode.
This app's actual export is a one-click `<a href>` honoring the current
filter querystring server-side — a deliberately simpler shape, confirmed
unchanged. A peer's render probe agrees: `ExportScreen` with no `formats`
and no `columns` still draws the scope radio — the one HELD verdict out of
six re-tested by rendering. Export really is a scope decision in this
composition, not an omitted default.

### `overlays/filter-builder.tsx`

Re-checked: `operators` is optional as a prop, but every condition ROW still
structurally carries an operator slot and the AND-chained, add/remove-row
interaction model has no analog in this app's single-valued, closed-
vocabulary facet chips (`shared/web/screen-engine/filter-bar.tsx`). Omitting
the operator list does not collapse the composition into a chip row; it just
leaves the operator dropdown emptier. A peer tested this rather than
inferring it: `operators={[]}` with one condition still renders 2
comboboxes, same as a real `operators` list — the control is there either
way, just empty. There is no escape hatch. Confirmed unchanged.

`ArchiveConfirmationDialog` (the mandatory-reason sibling of
`DeleteConfirmationDialog`) and `StepperHero` for `story-status-stepper.tsx`
(the 4-stage door mismatch) are also still real, unresolved mismatches, but
each is recorded once already — under the `[~]`/`[x]` entry for its sibling
composition — rather than duplicated here.

## [ ] No current app equivalent (3)

`templates/multi-step-form.tsx` — no wizard forms exist anywhere in the app
(also inherits the `form-screen` mismatch above). A peer's render probe adds
a second, independent confirmation: `MultiStepForm` itself warns at runtime
when no step depends on an earlier one — the kit's own component agreeing
there is no wizard here to hang it on.

`templates/search-results.tsx` — assumes a global "search everything from
anywhere" command-palette. No such control exists anywhere in either front
door; the only search-like control (`record-picker.tsx`) is a per-field
relation picker inside a form, not global search.

`overlays/quick-view.tsx` — wants a Space/click-to-peek dialog instead of
navigating. The app's real row activation
(`shared/web/screen-engine/screen-renderer.tsx:683`) is Enter/Space →
navigate straight to the full record, with no peek pattern anywhere.
Adopting this means changing established navigation behavior across the
engine, not adding a missing piece.

## [?] Needs a human call (3)

**`templates/sign-in.tsx`** — landed. The other lane shipped
`sign-in-system` (the agency login now renders the kit's `LoginRoute`
through `web/components/auth-card.tsx`) after this file's first pass flagged
the asset-import blocker as stale. See UI-GAPS.md rows 2 and 23.

**`templates/rail.tsx`** remains parked, not scheduled, per the owner's own
review of staging live. The bigger question it used to be entangled with —
"should `AppShell` itself be rebuilt on `ScreenShell`" — is now SETTLED
(see `[x]` above: it has landed), which actually sharpens what's left of
this one: `AppShell`'s rail COLUMN is the kit's own now, and only its
CONTENTS (the nav buttons, drawn by this app's own `navButton` function)
are still hand-rolled rather than the kit's `Rail` composition. **One
stated reason for parking it was
wrong, corrected by a peer's render probe**: `mark`, `wordmark` and
`tagline` are all `React.ReactNode` slots at the rail's head and each takes
an arbitrary node — rendered live with a real button in each slot — so the
team switcher (a multi-tenant requirement this app's sidebar carries) has a
home in `Rail` after all. The mobile half of the original reason still
holds: `ScreenShell` drops the rail entirely below `md` by design and draws
no hamburger anywhere, so the mobile top-bar and bottom-tab-bar stay bespoke
regardless of whether `Rail` is adopted. The verdict (parked, not scheduled,
a deliberate future attempt) is unchanged — only the stated reason for half
of it was.

**`overlays/bulk-edit.tsx`** — CORRECTED from `[ ]` to `[?]`. The first pass
said this "requires a row-selection mechanism... nothing in
`shared/web/screen-engine/` or either front door has any row-selection UI
at all... adopting this means building a cross-cutting selection primitive
first." That reason is **inverted**: `BulkEditScreen` IS the selection
primitive, not a consumer of one waiting to be built. A peer's render probe
(after first getting a false negative from `input[type=checkbox]` — the kit
uses Radix's `[role=checkbox]`, and the empty-records case renders exactly
one selection mark, the header select-all, proving the corrected selector
can actually tell a difference): the open composition renders 7 selection
marks across its own rows, and passing `selectedIds` brings up its own
"selected" panel. It brings the rows, the marks, the select-all and the
panel — nothing has to be built first. What is left is not a structural
mismatch, it's a product question this app has never been asked: does it
want bulk edit on any collection at all. Filed as a human call, not a
rejection.

## The kit's real `CollectionFrame` primitive (not a template — a component;
carried here because it is the other half of the "kit overrides the app"
ruling)

**CORRECTED blast-radius.** The first pass estimated adopting the kit's own
`components/collection-frame/collection-frame.tsx` (which draws its own
heading, tabs, 5-slot toolbar and soft-paper panel — not just the
loading/empty/error registers this app already uses via `ShapeStateBody`)
would require stripping this app's `CollectionCard` wrapper from "40+ host
call sites." That number was never checked. It is wrong: `CollectionCard` is
defined once (`web/components/deep-link/screen-bits.tsx`) and consumed at
exactly one other file, `web/components/deep-link/collection-content.tsx`
(6 call sites there, one direct and five through `SectionWithCreate`, which
always wraps in `CollectionCard`). The kit's own `CollectionFrame` component
is not adopted anywhere today — only its `CollectionRegister` sub-export is
(`web/components/agent-panel.tsx`), which is the empty/error/busy notice,
not the frame.

The owner has ruled the double-box question directly: "make the kit
override whatever we have." Given the corrected, much smaller footprint,
this is genuinely adoptable — but it is a real rewrite, not a box swap: the
kit's `CollectionFrame` fixes the toolbar's slot ORDER (search → filters →
period → view-switch → actions) and expects the header/count/tabs to be
built through its own `heading`/`count`/`tabs` props, so this app's engine
(`shared/web/screen-engine/collection-frame.tsx`) would need its search box,
`FilterBar` and `SortControl` re-plumbed into those slots (the kit's own doc
names the precedent for `SortControl` sharing the `viewSwitch` slot) rather
than the bespoke header markup it draws today. All of the DATA logic
(`selectRows`, facets, the remembered-question state) is unaffected — this
is a presentation-layer rewrite of one file, but that one file is the visual
contract of every collection screen in both doors.

**Prototyped and verified, one caller, not yet rolled out further.** Commit
`989dea7e`: a `useKitPanel` flag (default `false`) on the engine's
`CollectionFrame`, wired temporarily to the roles collection only, verified
at 390/768/1280/1920, both themes, plus a live search interaction, then
reverted so every other call site is byte-identical. Two real bugs surfaced
by the screenshots and fixed before commit: passing `config.showCount`
straight into the kit's `heading`+`count` Badge drew an ORPHANED count chip
on a title-less collection — a second count for the one collection, which is
what R16 exists to catch — and the fix's own first draft then clipped the
search input on a phone by fighting it for space inside one flex slot; both
are written up in the commit message rather than repeated here.

**A third bug, found only after the ScreenShell family landed** (commit
`ca10f067`): the planner's own flagged risk — "a collection drawn through
the kit's panel INSIDE the kit's shell is a combination neither prototype
tested" — was real. `KitCollectionFrame`'s default `tone="page"` plus its
default inset drew a visible second box once `AppShell` started nesting
this frame inside `ScreenShell`'s already off-beige, already-padded body
pane — exactly the nesting the kit's own `tone` doc names by name. Fixed
with `tone="bare"` `inset={false}`, unconditionally: this frame never
renders anywhere else in this app. Re-verified at all four widths, both
themes, after the fix.

**`empty-collection`'s genuinely-empty half — ADOPTED** (commit `960ae29e`).
`states/empty-collection.tsx`'s own `emptyBody` register (Headline + Text +
Button, "left-aligned, type only… no dashed placeholder rectangle") is
assembled directly in the `useKitPanel` branch for the not-narrowed empty
case, reusing `config.emptyText` and `createAction` — nothing new needed,
which is the test the planner set for "adoption" rather than "a feature":
everything the body needs already exists. The rest of that composition
(a figure strip of zero-reading stats above the tabs, tabs carrying
zero-badges) is NOT adopted — `CollectionConfig` has no "figures" concept
and no per-tab zero-badge concept, and inventing either is real, separate
scope. Verified on `roles` with the list route-mocked to zero rows, all
four widths, both themes
(`scripts/lane-shots/verify-empty-body.mjs`). Two create buttons appear
at once (toolbar + body) — matches the composition's own documented
design ("this screen carries TWO mango actions… the header's +, which
acts on the page, and the register's Add the first"), not a bug.

**`no-results` — DELIBERATELY NOT ADOPTED this pass; here is what it would take.**
`states/no-results.tsx`'s own `emptyBody` register says three things a
plain sentence doesn't: the exact total row count, which facet is
excluding the most rows ("the narrowest" one), and how many rows would
show if just that one facet were cleared (a live "clear this one, not all
of them" number, not just the “Clear filters” button this app already
has). All three numbers are real UI value — genuinely more informative
than the current no-results sentence — but the middle one requires the
engine to answer a question it has never had to answer: for the CURRENT
combination of query + facet values, if each active facet were cleared
ONE AT A TIME, which single facet would let back in the most rows? That's
a comparison across every active facet, re-running `selectRows` per
candidate (or an equivalent shortcut), and it has real edge cases nobody
has hit yet because nothing computes it today: two facets tied for
"narrowest" (which one does the sentence name?), a facet that excludes
every remaining row on its own (would-show-if-cleared = the full
unfiltered count, which reads differently from "some but not all"), and a
search term interacting with a facet (does the recomputation re-apply the
search, or just the other facets — the sentence's grammar depends on the
answer). None of this is visible until someone hits it on a real filtered
list with more than one facet on at once. It is also not urgent:
no-results already has a working "Clear filters" button (this session's
first pass), so the current plain sentence is not a dead end, just plainer
than the kit's — "plain and correct beats rich and speculative" is the
planner's own call on the trade. Left on `ShapeStateBody` + the existing
sentence + button, unchanged, pending a dedicated pass that builds and
tests the narrowest-facet computation on its own, against real filtered
data.

## The `screens/`+`states/` lane's pass, 2026-08-29 — the pattern behind every rejection below

One sentence answers "why does the number stop" for this whole section, and
it is the same sentence four separate investigations landed on
independently: **the kit ships the general case, and this app already made
a more specific decision.** Not-found's collection stays fine while ours has
no collection to reason about; the static splash is the generic loading
answer while our animated one is a dated, owner-motivated fix; invite-
acceptance assumes nobody has an account yet while ours deliberately lets
any signed-in person see every invite waiting for them; sign-in-portal
assumes a generic client portal never shows a social row while SCOPE ch.06
is a specific, documented reason ours does. A more generic decision wearing
the kit's clothes is a downgrade even when it compiles cleanly — the test
each entry below applies is never "does the kit ship something with this
name," it is "is the kit's version the same decision as ours, or a more
generic one."

## [x] `screens/page-failure.tsx` — adopted, 2026-08-29

The portal's `session.state === "unavailable"` branch
(`web-portal/components/portal-shell.tsx`) was a hand-rolled whole-page
takeover — "We can't reach your account" + a Retry button, replacing the
entire shell. This is exactly the register `PageFailureScreen`'s doc header
names as the one case (alongside a dead session) that law 4 allows to
replace the frame at all, and its `500` variant's shape (headline, body,
one paper "Reload" action) matched the hand-built version's intent line for
line. Swapped in `variant="500"` with the existing copy passed through as
`labels`, `onAction={refresh}`; kept the outer centring wrapper as-is since
the composition itself is only the card, not a page layout.

## States (4) — routed to `screens_detail_charts`, findings recorded 2026-08-29

The screens/states brief described the four `states/` compositions as
"nearly done — empty-collection and no-results already draw through
ShapeStateBody and simply are not imported by name." Reading the actual call
sites shows that undersells what's really there and oversells what a fix
would cost:

**`states/empty-collection.tsx` (`EmptyCollectionScreen`) and
`states/no-results.tsx` (`NoResultsScreen`)** — `ShapeStateBody`
(`shared/ui/compositions/states/states.tsx`) genuinely IS wired into
`shared/web/screen-engine/collection-frame.tsx` today, for loading, error,
and the empty/no-results split (`filtered` is exactly that switch) — this
part is real, working, and not aspirational. But `EmptyCollectionScreen` and
`NoResultsScreen` themselves — the standalone whole-screen compositions with
their own figures, tabs, rail and `onExport` prop — are unimported anywhere
in `web/` or `web-portal/` (confirmed by grep: both symbols appear only
inside their own files and the `states/index.ts` barrel). Reaching them
would mean editing `collection-frame.tsx` itself, which is the shared engine
seam `screens_detail_charts` owns — not an import to add from outside it.

**`states/archive.tsx` (`ArchiveScreen`)** is not a screen this app can swap
in in place of one file: "archive" here is a *tab* embedded separately
inside 20+ collection screens (`tickets-collection.tsx`, `work-panels.tsx`,
`account-detail-panels.tsx`, `contact-detail.tsx`, and others), each
swapping its own columns/rows in place. `ArchiveScreen` itself has zero call
sites outside its own module.

**UPDATE, prototyped on Tickets — one real piece of it IS one seam.**
`ArchiveScreen`'s composed structure is really three separable laws: (1) a
one-line "band" stating archiving's consequences, inside the panel above
the toolbar (the kit's own `band` slot — its doc names `states/archive.tsx`
as the only composition that draws one); (2) archived rows going quiet in
ink only (secondary/tertiary, no strikethrough); (3) the Status/Updated →
Archived by/Archived column swap. Only (1) is generic — it needs nothing
the engine doesn't already have. Added as a new `band` prop on
`CollectionFrame`'s `useKitPanel` branch (and threaded through
`ScreenRendererProps`/`renderList`), wired temporarily to Tickets'
already-existing Archived tab (`helpScope === "archived"`, itself a
pre-existing, working, server-backed scope — not new), verified rendering
correctly with no double-box even nested inside the kit's own shell (the
third combination of the day: archive band + kit frame + kit shell), then
reverted for the prototype commit (`a4548833`). **Turned on for real on
Tickets** in a follow-up commit (`4c1d2f9d`) — `useKitPanel` and the band
are now live on `tickets-collection.tsx`, verified at all four widths, both
themes, on both the All-tickets and Archived tabs (the band wraps to three
clean lines on a phone with no clipping).

(2) and (3) are confirmed, not assumed, to be per-collection surgery: both
need each collection's own `renderItems`/column definitions to know it's
rendering the archived view and style/reshape accordingly — Tickets'
own fields partly live in a recipe in `web/lib/screens.ts` (a different
lane's file), and every one of the 20+ collections defines its columns
differently. Stopped here per the planner's own condition ("if the rollout
starts needing per-screen surgery rather than one seam change, stop and
tell me") rather than open dozens of files to chase full parity with the
composition. The band is real and now live on Tickets; the other 19
archive tabs can adopt the same `band` prop later with no new engine work,
which is what makes it a seam rather than a one-off. (2)/(3) are not built
and would be a deliberate, scoped, per-collection decision — not a batch
item.

**`states/new-empty-record.tsx` (`NewEmptyRecordScreen`)** has no standalone
screen to replace at all — every record-detail file
(`role-detail.tsx`, `sprint-detail.tsx`, `story-detail.tsx`,
`app-detail.tsx`, `meeting-detail.tsx`, `task-detail.tsx`,
`selectable-detail.tsx`, `knowledge-detail.tsx`, and others) hand-rolls its
own `copy={{ emptyTitle: … }}` into its own `CollectionFrame`/
`ShapeStateBody` call. The register it would replace is scattered across as
many files as there are record types, all inside `screens_detail_charts`'s
territory.

## Screens (1) — `screens/not-found.tsx` mismatch, found 2026-08-29

`NotFoundScreen` is built for one specific register: a URL for **one record**
that was deleted, moved, or never existed **inside an otherwise-fine
collection** — its own doc header states this three times ("the collection
is fine — one record inside it is not," "the frame stays drawn... because
the collection is fine," law 4's "only a whole-page failure... may replace
the frame"). Every prop follows from that: a `record` number said twice (a
chip and a sentence), a real collection eyebrow/count, the collection's own
Export and create actions staying drawn in the header.

The app's actual `<NotFound />` (`web/components/deep-link/screen-bits.tsx`)
is called from a different failure entirely: `module-content.tsx` and
`collection-content.tsx` reach it when a URL segment names no module at all,
or when `resolveRecipe()` returns nothing for a module that has no detail
recipe configured — i.e. there is no collection to speak of, fine or
otherwise, so there is nothing to put in the composition's eyebrow, count,
or header actions. Forcing the swap would mean inventing collection context
that doesn't exist at these call sites. Left as-is; `screens/page-failure.tsx`
(below) is the composition that actually matches a case in this app.

## [!] `screens/splash.tsx` and `screens/portal-boot.tsx` — mismatch, found 2026-08-29

Both compositions' "booting" register is `SignInSplash`
(`compositions/templates/sign-in.tsx`) — confirmed by reading it: a static
centred mark on a field, explicitly "NO ANIMATION. It hands over; it does
not fade. Nothing here imports `motion/` and nothing sets a transition,"
and "this screen IS the loading state... no spinner, no progress bar."

This app's actual boot screen, `shared/web/mark-loader.tsx` (`MarkLoader`,
used by both `web/` and `web-portal/`), is a deliberately more capable
system the kit's static mark does not model at all: a continuously looping
SVG animation published once as `window.__ksMark` and driven by an inline
pre-hydration script so the mark is moving before the React bundle even
arrives, plus `useMarkHold` — a fix, dated 26 Aug 2026, for an owner-reported
bug ("the animation does not get a chance to complete") that holds the
loader on screen until the animation reaches a real stopping point rather
than being torn off mid-frame. The file's own history describes removing a
*second*, competing splash overlay that used to run alongside this one for
exactly the double-render/frame-rate cost swapping back in a second static
splash would reintroduce. Adopting `SignInSplash` here would be a visible
regression against two documented, deliberate fixes — not a lateral swap.

`portal-boot.tsx`'s other half (`PortalIndexRoute`'s `boot="failed"` case,
`ShapeStateBody` with `shape="portalHome"`) models the same real condition
`web-portal/components/portal-shell.tsx`'s `session.state === "unavailable"`
already covers — and that branch is now `screens/page-failure.tsx` (see
above), adopted because chapter 21's own law names it as the one register
built for "app could not draw a frame at all." Two kit chapters offer two
different answers for the same failure; `page-failure` was already chosen
on the more specific textual match ("only a whole-page failure... may
replace the frame") and general-page-failure `PageFailureScreen`'s three-
case coverage in this app. Not re-litigated here without a reason to prefer
the other.

## [!] `screens/invite-acceptance.tsx` — mismatch, found 2026-08-29

The composition's own doc header states the model it assumes: an
unauthenticated person clicks an emailed invite link, lands on ONE screen
naming that single invite (who invited them, into which account, what
role), and pressing Accept "goes straight into onboarding (27.14) with the
name and email already filled from the invite" — no account exists yet at
the point this screen is shown.

This app's real invite flow is a deliberately different shape, stated in
`web/components/invitations.tsx`'s own comment: "The fix for 'I was invited
but have no way to see/accept it': this works for ANY signed-in user, not
just a teamless one at onboarding." A person signs in first, however they
like (Google or email+code, at whatever address), lands in the app, and
`InvitationsScreen`/`InvitationsPanel` (`web/app/invitations/page.tsx`,
"where the invite email's 'Join' button lands") shows an INBOX of every
pending invite for that address — plural, post-authentication, no
onboarding hand-off. The kit's single-invite pre-account screen and this
app's authenticated multi-invite inbox are different products, not two
renderings of the same one.

## [!] `screens/link-sent.tsx` — mismatch, found 2026-08-29

Built entirely around a magic link: "We sent you a link," opened on
possibly a different device, "works once and expires in 15 minutes," with
a live resend countdown and no code to type anywhere.

This app's sign-in (`shared/web/use-email-sign-in.ts`, driving both
`web/components/auth-card.tsx` and `web-portal/components/sign-in.tsx`)
sends a 6-digit CODE, typed into a field on the same device, in the same
form the email step was submitted from — there is no separate device, no
link to click, and no "waiting room" screen at all: the UI swaps straight
from the email field to a code field on the same screen. Every one of
27.17's stated behaviors (open-elsewhere-and-land-where-you-left-off,
one-time link, no code) describes a mechanism this app does not have.

## [!] `screens/session-expired.tsx` — mismatch, found 2026-08-29, not built

Unlike the rest of this section, this is not a "the app already made a more
specific decision" case — there is no current app equivalent to compare
against at all, and the reason is that giving it one is real, unstarted
plumbing on the AUTH path, the one path where a half-built screen locks
somebody out of their own account. Three blockers, in the order they were
found:

1. Nothing persists the signed-out user's email anywhere. The composition's
   whole point is a pre-filled `email` field ("we know who it was"), but
   `web/lib/use-active-team.ts`'s 401 branch clears the session cache and
   redirects to `/login` — by the time a screen could read it, it is gone.
2. No `returnTo`/`redirectTo` mechanism exists anywhere in the login flow —
   checked `web/app/login/page.tsx`, `web/components/auth-card.tsx`, and
   `shared/web/use-email-sign-in.ts`. The composition's destination chip and
   "back to where you were" promise has nothing to restore TO.
3. The destination chip wants a friendly record title
   (`destinationTitle`), and `use-active-team.ts` runs generically on every
   page — it has no per-page context to derive one from.

The app's current behaviour (silent redirect on a genuine 401; the session
cache is deliberately KEPT on a mere outage, since a 500 is not a sign-out —
see that file's own comment) is correct and is not being touched. If this
screen is wanted, it is a scoped brief of its own — storage for the last
identity, a redirect-back contract the whole login flow has to honour, and a
decision about the destination title — not an adoption to fold into a batch.

## [!] `screens/sign-in-portal.tsx` — a decision for the owner, not a rejection, found 2026-08-29

Everything except one line is a clean fit: two-step email→code flow, one
mango Continue, resend with a live countdown, "Wrong address?" back — all of
it maps directly onto what `shared/web/use-email-sign-in.ts` already
provides, the same pattern `sign-in-system` already proved for the agency
door.

The one line is real and it is a law, not a missing prop: `PortalLoginRoute`
states "there is never a social sign-in row: the account is the company's,
not a Google profile's," and does not even expose a `providers` prop —
only the lower-level `SignIn` template does. `web-portal/components/
sign-in.tsx` offers Google today, on purpose, and says why in its own
comment: "signing in with Google never creates access; the invite does"
(SCOPE ch.06) — Google proves identity, the invite still gates access
either way, so a provider row creates nothing a code doesn't already grant.

Passing `providers` through the lower `SignIn` template to route around
`PortalLoginRoute`'s law would work, and that is exactly why it was not
done: it would leave the app quietly contradicting a rule the kit states out
loud, with nothing anywhere recording that a decision had been made. A
deviation nobody can find is worse than a mismatch everybody can read. Kept
as-is, recorded as a question the owner may want to answer once, in one
word: the kit says a client portal never shows a social sign-in row; this
app ships Google on the portal per SCOPE ch.06 because it proves identity
without granting access. Keep ours, or change the kit's law?

## Components (KIT-COVERAGE.md's checklist, from screens_collections's pass)

Findings from a bottom-up component sweep (Detail and examples, Collection
views, Forms and data, Notes and notifications, Feedback and overlay, Data
display), reported by a peer for this file since it now covers the whole
catalogue's "why not," not just the 23 compositions it started with.

**Shipped, not a finding:** `brand` — `web-portal/components/portal-shell.tsx`
now renders the kit's real `Logotype`/`AuthPhotograph` instead of the
`auth-artwork.tsx` shim, verified by probe-compile after UI-GAPS row 23's
asset-url fix landed. Committed `2eebb832`.

**Confirmed mismatches:**
- `form` — `FormShell` is already this app's own locked, machine-checked
  law (R4, `forms-use-formshell`: "the one wrapper every form renders
  through"), and the kit's `Form` states the identical job description for
  itself. Adopting it would build a second seam for a role one already
  fills.
- `import-wizard` — the same "one file, one table, manual column mapping"
  mismatch already on record for the import trio, one primitive layer
  down (`ImportWizard` composes `Form`+`Field`+`Select` for the mapping
  step this app's agentic import has no place for).
- `progress`, `progress-dashboard` — `pulse.tsx`'s own locked law ("big
  NUMBER or CHART, nothing else") already cited for `stat-strip`, ruling
  out a third shape. No progress-bar/dashboard concept exists anywhere in
  the app's savings/hours/margin screens.
- `notifications` — no bell/inbox concept anywhere in either front door
  (grepped both). This app's live-update model is realtime in-place sync,
  not a notification log. A real gap, but a new FEATURE, not a swap.
- `tree`, `stopwatch` — no current app equivalent (no hierarchical UI
  outside the already-adopted flowchart/process-maps; work logs are
  entered retrospectively, never clocked).
- Most of Collection views (kanban, calendar-view, spreadsheet, matrix,
  swimlane, timeline, agenda, gallery, split, queue, chat, tiles, map,
  compare, flowdetail, copilot-overlay — ~16 types) — no current app
  equivalent. The recipe engine's view-type union has a fixed set (list/
  table, card-grid, activity-feed, etc.) and none of these has an obvious
  existing collection to attach to. This was an architecture-level read
  (the engine's own type union), not a per-composition render — flagged as
  worth a second look if anyone disagrees with treating it as one category
  rather than 16 individual verdicts, since only `brand` among this whole
  batch was actually rendered before being decided.

**Not a real gap:** `notes` reads `[ ]` in KIT-COVERAGE.md but is a census
blind spot — `Comments` (already `[x]`) imports `Notes` internally
(`shared/ui/components/comments/comments.tsx:87`) and is built directly on
top of it. The coverage script only counts direct import strings, so it
can't see a transitive one. Worth a rot-check-style note if the script ever
grows a "transitively used" column.

**Too big for a same-session swap, flagged for its own dedicated pass:**
`detail-view` — a whole "record overview panel" primitive (header + avatar
+ kv + sections + aside + footer). Adopting it for real would mean
restructuring the many hand-composed `*-detail.tsx` files, which might
genuinely reduce real duplication but is scoped work, not a batch item. Not
picked up this pass.

**`checklist` — CLOSED, no current app equivalent.** Two candidates
considered, both real mismatches rather than one render-check away from
fitting:
- `work-panels.tsx`'s `TodosPanel` (client to-dos) has no tick/checkbox at
  all — completion is a "Done" badge only, and the sole staff action on an
  open row is Withdraw. These are things staff is WAITING ON THE CLIENT
  for; only the client's own action closes one. `checklist`'s whole
  interaction model is a person ticking a mark to move a row open→done —
  wiring that on here would offer a control that lies about who can press
  it.
- `tasks-screen.tsx`'s "Ours to do" list (real staff tasks, genuine
  tick-to-complete via `task-detail.tsx`'s `onToggleDone`) is closer in
  spirit but already deliberately richer than `checklist`'s fixed
  5-column row (mark/number/title/owner/when): six server-driven view tabs
  with exact R14/R16 counts, priority, assignee, department glyph, due
  date. `checklist` has no slot for most of that — adopting it would be a
  downgrade, not a fit.

Filed in the same bucket as most of Collection views.

`screen-renderer` and `collection-frame` are left alone here — the app's
own files under those names do a different job from their kit namesakes
(see the warning at the top of this file), and `collection-frame` is the
subject of this file's own `useKitPanel` prototype above.

### Folder shapes, Navigation, Filter and search, Tables and lists

Picked up by a peer after finishing their assigned six and confirming the
top ten were someone else's — nobody had explicitly owned these four
groups.

**Another census blind spot**, same shape as `notes`→`Comments`: `folder`
shows unchecked but `tabs.tsx` (already `[x]`) imports it internally for
the `variant="folder"` tab strip already in use
(`web/components/deep-link/screen-bits.tsx`'s `SectionWithCreate`,
`folderTabs` slot). Already adopted, just not directly.

**No current need**, not a mismatch: `breadcrumb` (the composable 7-part
version) — this app has exactly one `Breadcrumbs` call site
(`web/components/app-shell.tsx`), a plain URL-derived array with no
per-crumb customization, and the already-adopted `breadcrumbs` one-prop
wrapper handles it completely. The lower-level parts exist for a Next
`<Link>` via `asChild`, a mark, or a non-route step — none apply here.

**Confirmed mismatch, same family already documented:** `data-preview-table`
— `DataTable` plus per-row confidence/error marks for a single-table
import review. `web/components/import-screen.tsx` has no table at all in
its review step (Badge-only, card-based), consistent with
AGENTIC-IMPORT.md's real shape (multi-table, agent-proposed, FK-resolved) —
one more layer down on the same root mismatch as the import trio.

**No fit, three considered:** `visibility` (`VisibilityProvider`/
`useIsVisible`, a shared `IntersectionObserver`). The kit's own three
stated use cases are each already handled a different way here: `Image`/
`Video` use native `loading="lazy"`, not this hook (confirmed neither
imports it internally, so no transitive adoption either); long collections
use explicit `LoadMore` buttons, not scroll-triggered pagination (a
deliberate UX choice, not a gap); no scroll-triggered animations exist to
pause.

**One real candidate, not implemented:** `use-virtual-rows` — a
behaviour-only hook that windows a >100-row list to what's near the
viewport. `web/components/selectable-screen.tsx` (the dropdown-values
screen) is a concrete attachment point: it fetches via
`tenancy.selectable()`, a single flat GET with no cursor, capped at
`LIST_HARD_CAP` (1,000), and maps every row into the DOM with no windowing
— a team with a lot of accumulated dropdown values could genuinely hit
hundreds of rows in one render. Not wired in: it needs load-testing against
a team that actually has that many values, and a wrong row-height
measurement or a missed ARIA index would be a worse regression than the
unbounded list it replaces. Flagged for a dedicated look with real data.

## Why this file exists

A recorded mismatch is a result, not a stall. Without this list, the next
lane (or the next session) re-reads all 23 signatures from zero and either
re-discovers the same reasons or — worse — forces one of them, because
"nobody wrote down why not" reads identically to "nobody checked." The
2026-08-29 correction is the same argument turned on the record itself:
stale verdicts are why the peer flagged this file for a re-read rather than
treating it as settled, and updating it in place (rather than appending a
second opinion beside the first) is what keeps that true going forward.
