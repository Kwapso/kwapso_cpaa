# Composition mismatches — why the number stops where it stops

The owner's target is 47 of 47 kit compositions (`shared/ui/compositions/`)
imported into the app. This file is the record of a full pass over the 23
`templates/` and `overlays/` compositions assigned to one lane on 2026-08-29
(the other 24 — 18 whole `screens/` and 4 `states/` — belong to a different
lane's territory and are not covered here), **re-examined on 2026-08-29
after a peer's correction** (below) turned two of the seventeen rejections
into doors.

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

## [~] Adoptable — a real opt-out exists, not yet rolled out

### The ScreenShell-owns-the-rail family (6 templates)

**CORRECTED.** The first pass rejected `templates/detail-screen.tsx`,
`record-route.tsx`, `collection-screen.tsx`, `main-screen.tsx`,
`screen-shell.tsx` and `portal-home.tsx` because all six compose
`ScreenShell`, which draws a rail, and this app already has one persistent,
app-wide sidebar (`web/components/app-shell.tsx`). That check stopped at
"does ScreenShell draw a rail" and never read whether the rail's CONTENTS
were forced. They are not: `screen-shell.tsx`'s own header states, verbatim,
`rail={null}` is a real, documented opt-out ("nothing in the repo needs it
today" — because every current call site has one to pass), and the shell
"does not draw the rail's CONTENTS" in either case — it owns only the
column's placement, width and full-height paper fill. Passing this app's own
nav as the `rail` node, or `null`, produces no duplicate chrome.

What survives past that correction, and is the reason this is `[~]` and not
`[x]`: **`ScreenShell` is a per-route composition, and `AppShell` is a
persistent one.** R37 requires the post-auth app's shell to mount once and
never unmount (`deep-link-screen.tsx`); `AppShell` satisfies that by sitting
above the router and never re-rendering its own rail/nav DOM as the route
changes underneath it. The six `ScreenShell`-composing templates are each
meant to be the WHOLE PAGE a route/screen component returns — so using them
as documented (per-screen, each instantiating its own `<ScreenShell rail={…}>`)
would mount and unmount the rail's DOM on every navigation, even though the
OUTER app-wide shell never unmounts. That is a real regression class this
app does not have today (a stable rail instance across navigation — no
remount flicker, no lost scroll position, no interrupted team-switcher
state), not a duplicate-chrome problem, and it survives the rail-content
correction.

The tractable version of this adoption is composing bare `screen-shell.tsx`
**once, at the persistent layout level** — i.e. rebuilding `AppShell`'s own
markup to use `ScreenShell`'s four-level paper-law arrangement (the
off-beige page / soft-paper rail / off-beige body pane it documents at
length) with this app's own nav content as the `rail` node — rather than
adopting the five higher templates (`MainScreen`, `DetailScreen`,
`CollectionScreen`, `RecordRoute`, `PortalHome`) as per-screen wrappers.
Those five each also bundle header-band and body assumptions this app
already renders through `RecordChrome`/the collection engine, which is a
second-order integration question on top of the rail one.

**Not prototyped this pass.** This is the highest blast-radius single change
available in the whole checklist — the one piece of chrome present on every
screen in both doors — and a bad prototype is expensive to notice (it would
look right at rest and only show a remount on navigation, which a static
screenshot at four widths cannot catch; it needs a soft-navigation check,
not a screenshot). Recommending a dedicated pass: its own branch, the same
four-width/two-theme screenshots PLUS an explicit "does the rail's DOM node
identity survive an in-app navigation" check, reported before any merge —
not folded into a batch with the rest of this file.

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
Omitting `grantor` entirely removes the self-service affordance cleanly,
while keeping the denial sentence, the blurred page-behind layer and a
`Back` button. This is a real fit for the client portal's `NoAccess` screen.
If the portal still wants to name a contact, that has to be prose in the
description text, not the interactive grantor row. Not prototyped this
pass.

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
Not prototyped this pass; needs a scan of which `pulse.tsx`/`impact-panel.tsx`
tiles are number-only today before swapping any in.

## [!] Confirmed mismatches, re-examined and unchanged (10)

### `templates/form-screen.tsx` (+ `templates/multi-step-form.tsx`)

Re-checked for an opt-out: none exists. The side-sheet-vs-centred-dialog
disagreement is drawn into the composition's own layout, not gated by a
prop, and the kit's own doc header states the UX position in words ("a
centred modal is for confirmations only") rather than as a configurable
default. `FormShell` (`shared/web/form-shell.tsx`, 32+ call sites) is a
centred `Dialog` on purpose. `multi-step-form` inherits this and also has no
wizard anywhere in the app to hang it on regardless.

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
agent/user control of one screen, not a prop the kit exposes either way.

### `overlays/export.tsx`

Re-checked: `columns` is not optional, and the composition's whole premise
(a scope choice + a column picker + a format choice) has no reduced mode.
This app's actual export is a one-click `<a href>` honoring the current
filter querystring server-side — a deliberately simpler shape, confirmed
unchanged.

### `overlays/filter-builder.tsx`

Re-checked: `operators` is optional as a prop, but every condition ROW still
structurally carries an operator slot and the AND-chained, add/remove-row
interaction model has no analog in this app's single-valued, closed-
vocabulary facet chips (`shared/web/screen-engine/filter-bar.tsx`). Omitting
the operator list does not collapse the composition into a chip row; it just
leaves the operator dropdown emptier. Confirmed unchanged.

### `overlays/access-denied.tsx`'s cousin, `overlays/delete-confirmation.tsx`'s `ArchiveConfirmationDialog`

See `[~]` above — the split verdict is recorded there, not duplicated here.

### `templates/stepper-hero.tsx` for `story-status-stepper.tsx`

See `[x]` above — recorded once, not duplicated here.

## [ ] No current app equivalent (4)

`templates/multi-step-form.tsx` — no wizard forms exist anywhere in the app
(also inherits the `form-screen` mismatch above).

`templates/search-results.tsx` — assumes a global "search everything from
anywhere" command-palette. No such control exists anywhere in either front
door; the only search-like control (`record-picker.tsx`) is a per-field
relation picker inside a form, not global search.

`overlays/bulk-edit.tsx` — requires a row-selection mechanism (checkboxes
persisting across a list, an edit panel reporting "changes N records").
Nothing in `shared/web/screen-engine/` or either front door has any row-
selection UI at all. Adopting this means building a cross-cutting selection
primitive first — not a scoped swap.

`overlays/quick-view.tsx` — wants a Space/click-to-peek dialog instead of
navigating. The app's real row activation
(`shared/web/screen-engine/screen-renderer.tsx:683`) is Enter/Space →
navigate straight to the full record, with no peek pattern anywhere.
Adopting this means changing established navigation behavior across the
engine, not adding a missing piece.

## [?] Needs a human call (1)

**`templates/sign-in.tsx`** — landed. The other lane shipped
`sign-in-system` (the agency login now renders the kit's `LoginRoute`
through `web/components/auth-card.tsx`) after this file's first pass flagged
the asset-import blocker as stale. See UI-GAPS.md rows 2 and 23.

`templates/rail.tsx` remains parked, not scheduled, per the owner's own
review of staging live — but see the ScreenShell-family entry above: the
question this file now needs decided is no longer "should `Rail` replace
`AppShell`'s nav," it's "should `AppShell` itself be rebuilt on
`ScreenShell`," which is a bigger and different question than the one
`rail.tsx` originally posed alone.

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
contract of every collection screen in both doors. Not prototyped this pass;
recommending the same dedicated-branch treatment as the rail question, given
the reach, rather than rolling it into this batch.

## Why this file exists

A recorded mismatch is a result, not a stall. Without this list, the next
lane (or the next session) re-reads all 23 signatures from zero and either
re-discovers the same reasons or — worse — forces one of them, because
"nobody wrote down why not" reads identically to "nobody checked." The
2026-08-29 correction is the same argument turned on the record itself:
stale verdicts are why the peer flagged this file for a re-read rather than
treating it as settled, and updating it in place (rather than appending a
second opinion beside the first) is what keeps that true going forward.
