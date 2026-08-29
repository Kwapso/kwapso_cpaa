# Composition mismatches — why the number stops where it stops

The owner's target is 47 of 47 kit compositions (`shared/ui/compositions/`)
imported into the app. This file is the record of a full pass over the 23
`templates/` and `overlays/` compositions assigned to one lane on 2026-08-29
(the other 24 — 18 whole `screens/` and 4 `states/` — belong to a different
lane's territory and are not covered here).

**Reading this file:** `[x]` means the composition fits and was adopted or
extended. `[!]` means a genuine, structural mismatch — forcing it would break
a decision this app made on purpose, and the reason is written under it.
`[ ]` means no current app equivalent exists to compare against, so there is
nothing safe to plug it into yet. `[?]` means it's a real candidate that
needs a human call before anyone touches it, for reasons stated under it.

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

## [x] The one adopted

**`shared/ui/components/collection-frame/collection-frame.tsx`'s underlying
capability** — not the composition, the primitive one layer down. This
app's own engine file, `shared/web/screen-engine/collection-frame.tsx`, had
no `state` concept at all (no loading register, ever) — a live collection's
whole header (search, filters, sort, create button) blanked on every load,
the exact bug already fixed on the 12 bespoke detail screens the same day.
Added `state?: "ready" | "loading" | "error"`, wired to the kit's
`ShapeStateBody` (shape `"collectionScreen"`) for all three registers,
threaded one layer further through `ScreenRenderer`/`renderList`
(`shared/web/screen-engine/screen-renderer.tsx`) so a `type: "list"` recipe
can carry it too. Verified live (route-mocked zero-row response, a
temporarily-patched host call site reverted before commit) at phone/laptop,
both themes. Committed `3115b132`, merged `e9b6c157`.

A genuine, small fix landed alongside it: no-results now offers a working
"Clear filters" button when a FACET is narrowing the list (the exact handler
the filter bar's own button already runs) — previously a dead-end sentence.
Deliberately NOT offered for search-only narrowing, because `SearchInput`
owns its own displayed text (`defaultValue`, uncontrolled) and a second
reset would desync the visible box from the state.

One real, visible trade made along the way: `config.emptyIcon` (a per-recipe
glyph) has no seam into `ShapeStateBody` — the composition's own law is "it
never draws a mark of its own," reading the kit's "no illustration, ever"
literally. Dropped rather than worked around, per the owner's kit-has-
final-authority ruling. This is a uniform visual change across every list
recipe's empty state (no icon above the sentence any more).

## [!] Confirmed mismatches (17)

### The ScreenShell-owns-the-rail family (6)

`templates/detail-screen.tsx`, `templates/record-route.tsx`,
`templates/collection-screen.tsx`, `templates/main-screen.tsx`,
`templates/screen-shell.tsx`, `templates/portal-home.tsx` — all six compose
`ScreenShell`, which draws its OWN navigation rail as one of its four
regions. This app already has ONE persistent, app-wide sidebar
(`web/components/app-shell.tsx`, mounted once in the root layout, not
per-screen) — any of these would duplicate navigation chrome. The right
GRAIN was already found for records: `RecordChrome` (a lower-level
composition, NOT wrapped in `ScreenShell`) is adopted today via a thin host
seam, `web/components/record-chrome.tsx`'s `RecordScreen`. That seam is what
made the state-swap rollout (12 detail screens, commits `73414c58` and
after) and today's collection-frame extension both possible without forcing
a rail anywhere.

`collection-screen.tsx` has a SECOND, independent reason even setting the
rail aside: its underlying kit primitive
(`shared/ui/components/collection-frame/collection-frame.tsx`) always draws
its own soft-paper panel box (`bg-surface-panel`, `rounded-[var(--radius)]`)
unconditionally, regardless of its `tone` prop. This app's collections are
already boxed by a host-side `CollectionCard`
(`web/components/deep-link/screen-bits.tsx:113-119`, a real `<Card>`, whose
own comment says "Card is the single box — no card-in-a-card"). Adopting the
kit's frame at the engine layer would double-box every collection unless
`CollectionCard` is also stripped from 40+ host call sites — a cross-
boundary change, not a safe engine-only swap.

`portal-home.tsx` additionally has nothing to gain even ignoring the rail:
the app's own `web-portal/components/home-screen.tsx` already implements
the identical product spec natively.

### Centred dialog vs. side-sheet (1)

`templates/form-screen.tsx` is a side-sheet (slides in from the right). This
app's `FormShell` (`shared/web/form-shell.tsx`) is a centred `Dialog`, used
on 32+ call sites. The kit's own doc header states "creating a record slides
a panel in from the right… centred modals are for confirmations only" — a
real UX-surface disagreement, not a styling gap. `templates/multi-step-form`
inherits the same mismatch (it composes `FormScreen`), and there is also no
multi-step wizard anywhere in the app to hang it on regardless.

### Requires a feature this product deliberately doesn't have (2)

`overlays/access-denied.tsx` is built around a "Request access" button. The
client portal's `NoAccess` screen has a written product rule against ever
offering a client that control — access is a decision only the agency makes
about a person they know, never a self-service request.

`overlays/delete-confirmation.tsx` requires a numbered record and a typed
reason logged to an "Archived" tab. This app never permanently deletes a
record (deactivate-not-delete is a house rule) and its confirm dialogs
(title/body/confirm) never collect a reason for any action.

### Wrong data shape (3)

`templates/import-flow.tsx`, `overlays/import.tsx`, `overlays/import-
proposal.tsx` all assume ONE FILE, ONE TABLE, manual column-by-column
mapping (a 4–5 step wizard: file → mapping → review → commit). This app's
real import is agentic, multi-file, **multi-table**, with dependency
ordering and FK resolution across tables (see `AGENTIC-IMPORT.md`) — a
graph, not a flat column list, and there is no manual per-column mapping UI
at all; the agent proposes the mapping. These three are also the exact
three-way duplicate the kit's own `compositions/index.ts` header names
(`overlays/import.tsx`, `templates/import-flow.tsx`, a `structures/import-
wizard/`) — the same shape written three times in the kit itself.

### Locked product rules the app already chose, on purpose (2)

`templates/stat-strip.tsx` lets each figure embed its own mini spark chart
inline. `web/components/pulse.tsx`'s own header states a deliberate,
opposite law: aggregate into a big NUMBER when there's enough data to
aggregate, reach for a CHART when data arrives by group or by time —
"everything here is one of those two shapes and nothing else is." Numbers
and charts stay two separate elements, never fused into one tile. This is
the same file the day's chart work (StageChart/WeeksChart/HoursByChart/
SprintBurndownChart/AppSavingsChart/MarginChart, 7→11 render sites) was
built inside of.

`templates/stepper-hero.tsx`'s `onStageSelect` makes a stage pressable — the
composition's own doc header says a stage moves the record when pressed.
This app has a LOCKED rule the other way, Checklist 5.2, verbatim: "a status
is a fact and not a button" — it came from a tester on 17 Aug 2026, and
`web/components/help-status-stepper.tsx` has no `onChange` at all, `disabled`
is always `true`. Same shape as `RecordRoute`'s `SYSTEM_STAGES` mismatch
(a generic vocabulary this app doesn't use, found the same day).

### Deliberately simpler than the kit's version (3)

`overlays/assistant.tsx`'s own law is "never modal, never traps focus — you
can type in a table while it's open." This app's `AgentPanel`
(`web/components/agent-panel.tsx`) is a genuine modal `Sheet`, and it also
live-drives the screen underneath it (`agent-host.tsx`) — a "screen trace"
mechanism the kit's model has no concept of at all. The app already uses the
kit's lower-level primitives (`AgentChat`, `RunSteps`, `CollectionRegister`)
directly; it's the whole-overlay shape that doesn't fit.

`overlays/export.tsx` is a dialog with a scope choice, a column checkbox
picker, and a CSV/Excel/PDF format choice. This app's actual export
(`web/components/deep-link/screen-bits.tsx:169-223`) is a plain `<a href>`
download link honoring the current filter querystring server-side — one
click, no dialog, no format choice. Deliberate simplicity, not a gap.

`overlays/filter-builder.tsx` needs per-field operators (equals / contains /
before / after…). Every facet in this app's own filter bar
(`shared/web/screen-engine/filter-bar.tsx:41-50`) is explicitly single-
valued and closed-vocabulary ("nothing sets `control: 'chips'`… nothing sets
`onSearch`") — there is no operator concept anywhere in the app's facet
model to plug this into.

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
selection UI at all. Adopting this would mean building a cross-cutting
selection primitive first — not a scoped swap.

`overlays/quick-view.tsx` — wants a Space/click-to-peek dialog instead of
navigating. The app's real row activation
(`shared/web/screen-engine/screen-renderer.tsx:683`) is Enter/Space →
navigate straight to the full record, with no peek pattern anywhere.
Adopting this means changing established navigation behavior across the
engine, not adding a missing piece.

## [?] Needs a human call (2)

**`templates/rail.tsx`** — the one PARTIAL genuine fit found in this pass.
It is a real, well-built `groups`/`items`/`member`-chip nav primitive, and
unlike the ScreenShell family it does NOT own a page shell — it's a bare
flex column (verified: no `ScreenShell` import, no rail-owns-rail problem).
The app's `AppShell` nav item list (the flat Home/Settings/section list,
`app-shell.tsx:177-230`) could plausibly adopt `Rail`'s API for that one
region. But: this app's sidebar also carries a TEAM SWITCHER (a multi-tenant
requirement) and a mobile top-bar + bottom-tab-bar, and `Rail` has no
vocabulary for either — both would stay bespoke regardless of adoption.
**Parked, not scheduled**: this is the single piece of chrome present on
every screen in the app, the highest blast radius available, for a partial
gain, while the owner reviews staging live. A documented candidate for a
deliberately-scheduled attempt (its own branch, screenshots, never merged
without sign-off) — not a task to fold into a batch.

**`templates/sign-in.tsx`** — genuinely wanted (UI-GAPS.md row 2, `auth-
card`, has said "waiting on library" since before this pass) and was
reported blocked by a Vite-vs-Next static-asset-import incompatibility
(UI-GAPS.md row 23). **That block is stale as of this pass**: verified
empirically (a throwaway probe import + `tsc --noEmit`, not a version
check) that the vendored copy in `shared/ui/` already carries the upstream
fix (`lib/asset-url.ts`) and `SignIn` compiles cleanly under this app's
Next toolchain today. UI-GAPS.md rows 2 and 23 are updated with this
finding. What's NOT yet done: confirming `SignIn` covers row 2's full
feature list (app name/logo/legal links — legal links aren't obviously
present) and rewiring the app's real flow logic
(`shared/web/use-email-sign-in.ts`, `shared/web/google-sign-in.tsx`) into
`SignIn`'s prop shape. Real, scoped work on the single most safety-
sensitive screen in the app — a candidate for a deliberate pass, not a
same-session swap.

## Why this file exists

A recorded mismatch is a result, not a stall. Without this list, the next
lane (or the next session) re-reads all 23 signatures from zero and either
re-discovers the same 17 reasons or — worse — forces one of them, because
"nobody wrote down why not" reads identically to "nobody checked."
