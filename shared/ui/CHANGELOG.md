# Changelog

## v1.2.29 — 2026-09-03

### Fixed — the leading breadcrumb tab's corner, reversed

Client, on the live product, the day after ruling for the square: "When I am
on the left tab, the top corner needs to be more rounded. That's not how the
tabs are, so go and fix it." Then, narrower: "not more rounded as a random,
but folders and tabs have a shape … the leftmost one is missing the roundness
on the corner … it's not subjective."

`components/breadcrumbs/breadcrumb-folders.tsx` — the `--folder-radius-lip`
patch that squared the leading tab's own top-left arc to match the card is
DELETED, not reduced. `CrumbShape` no longer takes a `lead` flag; every tab
draws the identical `FolderShape crop="lip"` element, measured in
`verify/tab-joint/` as byte-identical path data against a middle tab's.

`compositions/templates/screen-shell.tsx`'s card keeps `rounded-ss-none`. The
two squares were introduced together on 2026-09-02 but were never one
mechanism: the card's radius (24) is bigger than the strip's own overlap
(17.02), so an un-squared card corner shows ~7 of its own 24-unit arc peeking
out below the tab's dead-straight left edge, regardless of what the tab's own
top corner does. Un-squaring the tab removes none of that collision, so the
card's corner stands on its own argument now, spelled out in the file's
header.

### Fixed — the tab-to-content gap, made one rule instead of three numbers

Client: "there needs to be space between the tabs and the beginning of the
content … go and uniform that, and make sure that you don't hard-code page by
page, but rather you change the rule and you apply it everywhere," then,
same session: "make sure to maintain the space between tabs and content on
all screens, even when I scroll down."

Three kit files drew three different numbers for the same join —
`CollectionFrame`'s `gap-4`/`gap-5` (density-driven), `RecordDetail` and
`ScreenRenderer`'s `gap-[var(--space-3h)]` (14). `tabs.tsx` now exports
`TABS_STRIP_GAP` — `pb-[var(--space-5)]` (20), the number the live product's
own detail-screen mechanism already used and named "the blank page-tone
space the client asked for … a real token rather than a guess." All three
files read it.

It is PADDING on the strip's own wrapper, not a flex `gap`, so it survives a
strip that pins on scroll: a `gap` is a static distance between siblings and
stops meaning anything once one of them goes `position: sticky`, padding on
the pinned box does not. `RecordDetail`'s sticky strip (opacity + position)
moved onto that same wrapper, off `TabsList` itself, because `TabsList`'s own
hairline is anchored to ITS bottom edge and padding there would drag the rule
into the gap. Measured, at rest and after a real scroll, in
`verify/tab-joint/`.

### Added — the quiet-spine resting crumb, `--spine-quiet-crumb-rest`

Client, on the live product: the resting breadcrumb tabs on the Quiet spine
in light were reading as invisible — measured 1.000 against their own
ground, because the quiet spine IS `--surface-panel` and the rest fill was
too. Shown alternatives, she picked `#EDE8E1`, quiet-light only (1.094
against the ground, 1.207 against the live tab, the label at 5.39). Mango
(1.306) and quiet-dark (1.000, unmoved by this ruling — the live tab still
carries that strip) are untouched. `foundations/tokens/tokens.css` names the
value once, bound to `--spine-crumb-rest` on `[data-spine="quiet"]` in light
and reverted to `--surface-panel` in both dark blocks;
`breadcrumb-folders.tsx` reads `var(--spine-crumb-rest, var(--surface-panel))`
so mango needs no second declaration.

### Changed — tab hover is a weight move only, colour does not follow

Client: "when i hover over a tab i want that it gets the same weight as the
active tab (without changing the color) replicate the behaviour we already
have in navbar." `rail.tsx`'s `ROW_IDLE` is exactly that — a fixed ink at
every state, weight the only thing that steps on hover. `components/tabs/
tabs.tsx`'s `TRIGGER_SKIN` and `breadcrumb-folders.tsx`'s `TAB_REST` both
drop their `hover:text-foreground` (the breadcrumb's own override,
`hover:text-ink-secondary`, wins the merge against `BreadcrumbLink`'s shared
part). Weight alone previewing the active state, unchanged from 2026-09-02.
Measured in `verify/tab-joint/`, including the row's own content width at
rest and after a real hover, to catch the weight step reflowing the strip.

## v1.2.28 — 2026-09-02

### Added — `BreadcrumbFolders`, the breadcrumb drawn as a strip of folder tabs

Client, verbatim: *"REUSE THE EXISTING FOLDER TABS WITHOUT CHANGING ANYTHING ON
THE SHAPE. Each path level is a folder tab, stacked left to right. Every tab
before the last is the inactive color; the last (current location) is same
color as the big content card in the middle, the main color — the same hover,
and font weight rules apply as they already exist. Deeper paths just add more
tabs."*

`components/breadcrumbs/breadcrumb-folders.tsx`. It takes the SAME items array
`Breadcrumbs` takes and renders `breadcrumb/`'s own parts — the `<nav>`
landmark, the `<ol>`, the crumb `<li>`, `BreadcrumbLink`, `BreadcrumbPage` with
`aria-current="page"`, and `BreadcrumbEllipsis` for the fold — so the trail a
screen reader hears is unchanged and only the drawing is new.

```
<BreadcrumbFolders items={[…]} label? foldAfter?=4 ellipsisLabel? listClassName? />
```

**WHY `breadcrumbs/` AND NOT `breadcrumb/`.** `breadcrumb/`'s own header says
what it is: seven parts, and *"it elides nothing — it renders exactly the
crumbs it was written with."* A strip that folds its own middle is not that.
`breadcrumbs/` is the array form, and it already *"owns the rule about when a
deep trail collapses"* — so `collapse()` is exported from `breadcrumbs.tsx` and
reused rather than re-derived. A second file in an existing folder also costs
the demo nothing: `demo/content.tsx`'s guard is one folder → one slug and
`gen-states.mjs` keys on the folder, so both TEN STATES blocks land under
`breadcrumbs`. A new `components/breadcrumb-folder/` would have owed the demo a
section.

**THE FOLD.** Four levels render in full; at five or more everything between
the first and the parent collapses into one `···` tab. The rule is the client's
and the SHAPE of the fold is `collapse()`'s: the threshold is applied here
(`items.length > foldAfter`) because `collapse` couples its threshold to its
tail and the client's rule does not, but which crumbs survive and in what order
is decided once. The `···` tab is a `DropdownMenuTrigger` wearing the rest
fill, carrying `BreadcrumbEllipsis` — glyph `aria-hidden`, announced label
outside that wrapper — and it OPENS what it hides: the elided crumbs as real
`<a role="menuitem" href>` rows. `breadcrumb.tsx`'s own note on
`BreadcrumbEllipsis` already said this is where an expandable elision belongs.

**THE TWO PAPERS, AND WHERE THEY ARE RESOLVED.** `--kw-crumb-live:
var(--surface-raised)` and `--kw-crumb-rest: var(--surface-panel)`, both on the
`<nav>` — TAB-C1's mechanism, for TAB-C1's reason: a caller that rebinds
`--surface-panel` around the strip must not be able to make the live tab and
the card disagree. The live paper is the content card's own, by ruling;
`screen-shell.tsx` paints that card `--surface-raised`, so that is the token
and not `--card` and not `--spine-chip-fill` (the three agree in light and part
company on the mango spine in dark). The rest paper is one step off it in the
direction the palette already steps — the same step `screen-shell.tsx`'s CARD
block makes when it rebinds a filled control on the card to soft paper
(ruling 01) — so it is `--kw-soft-paper` in light and `--kw-unlit-panel` in
dark, derived, with nothing per spine anywhere in the file.

**THE LEADING TAB IS SQUARE ON ITS TOP-LEFT, DRAWN ADDITIVELY.**
`FolderShape`'s top-left radius is a fixed 6.6 brand units at every size and is
not a prop; squaring it in the path would be changing the silhouette, which the
client forbade in the same breath as asking for the square corner. So the
corner is FILLED IN: one `--folder-radius-lip` square of the shape's own
`currentColor`, laid over the arc's exact bounding box (one brand unit is
0.1rem and the arc runs x,y ∈ [0, 6.6], so 0.66rem covers it and nothing else).
`folder.tsx` is untouched. Only the tab that leads the strip gets the patch,
because that is the only tab whose corner the card below squares too.

**MEASURED — `verify/breadcrumb-folder/`, kept.** A measuring harness, not a
picture: the Browser pane renders it at about 42×46px whatever the viewport
says, so every figure is `getComputedStyle` / `getBoundingClientRect` read off
the live document and printed as JSON. At the harness's 15px root:

```
levels        1 → 1 tab, current "Clients"      · 1 square corner
              2 → 2 tabs, no fold               · 1 square corner
              4 → 4 tabs, no fold               · 1 square corner
              6 → 4 tabs, folded, current last  · 1 square corner

live tab      EQUAL to the card in all four cases:
              quiet light  #FFFEF9 = #FFFEF9    quiet dark  #26241F = #26241F
              mango light  #FFFEF9 = #FFFEF9    mango dark  #26241F = #26241F

overlap       strip bottom − card top = 15.95px
              --folder-tab-overlap    = 15.96px  (1.06375rem × 15; 17.02 at
                                                  the 16px authoring base)
tab height    44.53px = 2.96875rem × 15         (47.5 at the base)
square patch  9.89 × 9.89px = 0.66rem × 15, colour equal to the shape's fill

type/weight   rest 300 · --ink-secondary   live 500 · --foreground
              13 (12.1875px) on BOTH — the size never moves between states
```

Rest fill against the ground the strip stands on (`--spine-fill`):

```
MANGO · LIGHT   ground #FED069 · rest #F7F2EB 1.306 · live #FFFEF9 1.440
MANGO · DARK    ground #FED069 · rest #1C1B18 11.843 · live #26241F 10.661
QUIET · LIGHT   ground #F7F2EB · rest #F7F2EB 1.000 · live #FFFEF9 1.103
QUIET · DARK    ground #1C1B18 · rest #1C1B18 1.000 · live #26241F 1.111
rest vs live    1.103 light, 1.111 dark — the same step the card has
```

**ONE FIGURE IS LOGGED, NOT FIXED, AND IT IS OWED A CLIENT RULING.** On the
QUIET spine a resting tab measures **1.000** against the ground, in both
palettes, because the quiet spine IS `--surface-panel` — tokens.css §7b says so
in as many words, and that identity is the whole reason the client cut to two
spines. A resting crumb there has no edge and reads as a label until it is
hovered; the live tab still carries the strip at 1.103 / 1.111. The alternative
is `--muted` (#FAF9F7 / #2F2D28, "inactive tabs, idle wells"), the kit's third
paper and the retired folder tab's own idle fill: it clears the ground on quiet
and costs mango-light, where rest and live would sit 1.021 apart instead of
1.103. The client named soft paper, on mango, so soft paper is what this draws.
`--kw-crumb-rest` is the one lever and needs no edit to this file.

### Removed — the folder tab VARIANT. `TabsVariant` is line-only

Client, verbatim: *"the whole concept of folders as tabs gets killed. All the
current folders as tabs we have will become line tabs. Completely kill and
remove folder tabs… I don't want any dead body around… the only tabs that we
will have are the line tabs because folders will only be used for the
breadcrumbs."*

**The distinction, because it decides what was over-deleted and what was not:
the folder TAB VARIANT died; the folder SHAPE lives.** `components/folder/`
is byte-identical. `--folder-tab-overlap`, `--folder-tab-height`,
`--folder-tab-min-width`, `--folder-shoulder` and `--folder-radius-lip` all
stay, because the breadcrumb reads every one of them. No token was touched.

`components/tabs/tabs.tsx` — `TabsVariant` is `"line"`. Gone with the second
member: the `FolderShape` import, `LIST_SKIN.folder`, `TRIGGER_SKIN.folder`,
`TRIGGER_SELECTED.folder`, `TRIGGER_SELECTED_WITH_INDICATOR.folder`,
`TRIGGER_DISABLED.folder`, `FOLDER_SHAPE_FILL` (both halves), `INDICATOR_SKIN.
folder`, `TABS_COUNT_SKIN.folder`, the `--kw-folder-live` / `--kw-folder-idle`
pair on the root and its whole TAB-C1 block, the `gap-0` branch, the
`resolved !== "folder"` half of the indicator's switch, the
`:not([data-slot=folder-shape])` guard on the shared icon rule, and
`TabsContent`'s card branch with TAB-C2's argument for it. Six `Record<
TabsVariant, string>` maps became six constants, `TabsVariantContext` went with
them, and the `variant` OVERRIDES on `TabsList` and `TabsTrigger` went too —
both existed only to let one strip differ from its root. `variant` stays on
`Tabs` and `TabsView` as the compile fence, exactly as the `pill` deletion left
it: `variant="folder"` now fails to build rather than drifting.

`TRIGGER_DISABLED` also lost its FILL. A line tab has no resting box, so
`--btn-disabled-fill` was the silhouette's half of the pair and left with the
silhouette; a dead tab is an ink and a cursor.

**The default was the conversion.** `CollectionFrame.tabsVariant` defaulted to
`"folder"` under ruling E, so every collection in the kit drew a folder strip
through it. The prop is deleted, and with it the two rebindings that moved the
shape's fills without editing `tabs.tsx` (`--card: var(--surface-panel)` on
`Tabs`, `--surface-panel: var(--muted)` on `TabsList`) and the
`rounded-t-[var(--radius)] bg-surface-page` band the strip stood on — removed
rather than left inert, because an inert rebinding is what the next reader
"fixes". Ruling J2's zero gap goes with them: the frame's stack takes its
ordinary band gap at every density, because a line strip has no feet to hide.
`ScreenRenderer` stopped stating `variant="folder"`, and the demo's own folder
strip (`demo/sections/f-m.tsx`) and two-variant matrix (`t-z.tsx`) are one
strip and one breadcrumb now.

**The redundant `line`s are deleted, which is the "no dead body" half.**
`RecordDetail` stated `variant="line"` so a record would not inherit the folder
default; there is no folder default, so the line is gone. So are the two
`verify/` harnesses' folder halves — `verify/tabs-hover/` keeps the line
question it was built to answer, `verify/folder/` and `verify/kit-bc/` now show
the lip crop in its one real consumer.

**Ruling E is superseded, and the rule it stated is rewritten rather than
deleted.** `SHELL.md`'s "TWO TAB SHAPES, NEVER MIXED, NEVER A THIRD ROW" is now
"ONE TAB SHAPE, AND THE FOLDER IS THE BREADCRUMB", with the strip's geometry,
its two papers and the fold stated there; `GAPS-RULINGS.md` R-2 carries a
superseded banner naming every line of its own "what was done" that v1.2.28
undoes. CH27.13 is vindicated twice over; CH24.3's folder tabs on a record are
twice stale; CH27.1's "figures, folder tabs, then the collection panel" is
stale by one word and its ORDER is not.

### Fixed — `DropdownMenuItem asChild` crashed the tree

Found by the breadcrumb's fold, which is a menu of links and has to be one.
The row rendered `{leadingSlotOrNull}{children}`, which is TWO children even
when the leading slot is `null` — and Radix's `asChild` routes through `Slot`,
which throws *"Expected a single React element child"* on more than one. So
`<DropdownMenuItem asChild><a … /></DropdownMenuItem>` unmounted the whole
subtree, on a prop the component inherits from Radix and never removed. A row
with no icon and no image now passes its child through alone. Written as a
ternary rather than a fragment for the same reason a fragment would not have
helped: a fragment around the pair is still a second child.


### Changed — ONE SHELL. `MainScreen` and `DetailScreen` collapse into `ScreenShell`

Client, verbatim: *"Let's completely get rid of these three variations. Let's
just do one shell, and then let's just explain that there are variations for
the title if it's main screen with no parents or not. Also, just define which
pages have a footer."*

She asked for the proposal validated rather than agreed with. **The kit already
agreed, in writing, in both files.** `detail-screen.tsx`'s own header: *"`SHELL.md`'s
table is exhaustive: a main screen and a detail screen differ in EXACTLY THREE
PLACES … THE SHELL AND THE RAIL ARE IDENTICAL TO A MAIN SCREEN'S. Neither file
draws either one: `ScreenShell` does, once, and both hand it the same rail."*
`main-screen.tsx` carried the same sentence with the names swapped, and
`SHELL.md`'s own section opened *"The shell above is identical on both."* Three
named differences on one shared shape is a shape with three slots.

**There are four, and the fourth is one nobody had counted: the FIGURE STRIP.**
`SHELL.md`'s table has six rows and none is the figures; the client's list has
four items and none is the figures. The table was not wrong — it compares what
the two screens each draw in a shared region, and a record has no strip *and
nothing in its place*, so there was no cell to fill. That is an absence, not a
difference, and `record-chrome.tsx` had already made the identical argument
about the stage progression. It is a slot now, and it is still DATA rather than
a node, for `main-screen.tsx`'s own reason: `SHELL.md` says the strip lies BARE
on the body pane, and a route handed a slot would have to remember
`surface="bare"` forty times.

**THE FOUR SLOTS.**

| slot | a top-level collection | a record |
|---|---|---|
| title step | the door's own — h2 system, h3 portal | one rung down — h3 / h4 |
| identity | — | `recordNumber` · `collectionLabel` · `chips`, **under** the title |
| figures | the bare strip, first in the body | — |
| footer | none | declared, and last in the body |

**THE TITLE'S STEP IS DERIVED AND NO CALL SITE CAN NAME ONE.** The breadcrumb
decides it: a one-tab trail is a top-level location. `ScreenShell` is told the
trail's LENGTH — `breadcrumbDepth`, the same array the caller hands its
breadcrumb strip, default 1 — and owns the mapping from a length to a step.
`SHAPE_HEADING_SIZE` is imported unchanged for the root case, so the door's
step is still the one number `ScreenRenderer`, `CollectionFrame` and
`RecordChrome` all read; the only new typography in the file is one rung DOWN,
and it is a relation rather than a size, which is how it can be written at all
in a folder whose law is that no file in it writes a type step. The depth rule
is "root or not", never one rung per crumb: `Title`'s ladder has three rungs
and calm's nested step lands on the last of them, so a five-deep trail and a
two-deep trail take the same step. **Measured**, at the product's own 15px root
(ruling 18, not ruling 28's 16px authoring reference): depth 1 → `h2`, **30px**,
tracking -0.6px; depth 2 → `h3`, **22.5px**, tracking -0.315px; no breadcrumb
at all → `h2`, **30px**, because a screen with no trail has no parent.

**WHY THE SHELL IS TOLD RATHER THAN LOOKING.** The `breadcrumb` slot stays a
plain node — another agent's `BreadcrumbFolders` is what goes in it, and this
change imports nothing from it. The shell will not inspect that node: its own
rule, written before this change, is that *"a shell that inspected its children
to police them would be guessing at element types across a `React.Fragment` and
would be wrong the first time somebody wrapped their trail in a provider."*
Counting `<li>`s in CSS is the same guess wearing a selector, and could not
reach `Title`'s `size` prop anyway without the shell writing a type step by
hand. So the caller states a fact about navigation, which is the caller's, and
the shell owns the typography, which is not.

**THE IDENTITY ROW KEEPS OVERRIDE 73 AND ENFORCES MORE OF IT THAN BEFORE.**
The black ID chip first, then the collection chip, then the rest, on the line
directly under the title — and the shell wraps the first two in
`Badge variant="inverse"` and `Badge` itself rather than taking finished nodes,
because *"the black chip is always the ID. we always use black chips for IDs"*
is a rule and a slot would have made it a request. Measured on the record case:
first chip fill **rgb(26, 25, 24)**, chip row top **11.25px** below the title's
box (`--space-3` at the 15px root), `identityBelowTitle: true`.

**ONE OF `detail-screen.tsx`'s CLAIMS WAS STALE AND IS CORRECTED, NOT CARRIED.**
It said "the header band is left EMPTY" and that `RecordChrome` carries the
title. That was override 73 read through August's shell, whose band sat under a
breadcrumb-and-eyebrow bar — the bar the client told us to remove. There is no
such bar: the trail left the band entirely on 2026-09-02 and lives on the
GROUND as folder tabs. So a record's title and chips are in the BAND now, and
override 73 is satisfied more literally than it was — *"the chips are directly
underneath the title"*, *"the edit button should be aligned with the title"*,
and no second bar anywhere. `RecordChrome` is no longer handed `title`,
`recordNumber`, `collectionLabel`, `chips`, `tags`, `meta` or `actions`; it
keeps the banner, the stages, the sub-view tabs, the panel and the audit
footer, and `RecordDetail`'s own `Title` renders `null`, which is that
component's documented empty state.

**THE MANGO IS ONE MECHANISM, NOT TWO.** `SHELL.md`'s third difference was "the
`+` on a main screen, `Edit` on a detail screen". Both are *the screen's one
mango*, both stand at the inline end of the title's row, both drop below the
narrow breakpoint. `onCreate` draws the glyph (26.01: "create is always the
glyph, never the word"); `onEdit` draws the pencil AND the word (26.01's one
stated exception). Passing both is two mangos, which ruling 26 forbids, so the
shell keeps the create, drops the edit and warns in development — an
enforcement neither template had. The four-reason argument that the header's
`+` stays mango on the mango spine moved into `screen-shell.tsx` unabridged,
including the one question it leaves open for the client.

**THE FOOTER IS DECLARED.** `footer`, `footerVisible`, `narrowFooter`; last in
the card's body, in normal flow, inside the same scroller as `children` —
`SHELL.md`'s "in normal flow, once per record", drawn rather than asserted.
**This is a real loss of enforcement and it is recorded as one:** "no footer
slot on this shape" was how `MainScreen` made `SHELL.md`'s *"appears on zero
main screens"* impossible to break, and with one shell a collection can reach
the slot. The client asked for a declaration; a declaration you can make is one
you can make wrongly. `SHELL.md` now says so at the footer section.

### Changed — the card's top-left corner is square

Client, choosing between the options put to her: *"I choose option 1 to square
it."* The breadcrumb strip attaches to the card's leading edge and its leading
tab is square on its own top-left, so the tab and the card read as one
silhouette.

**NO FIFTH RADIUS IS INVENTED.** Kit ruling 03 flattens the whole ladder onto
`--radius` (24) and `rounded-pill` (999), and `docs/RULES.md` calls a fifth
radius invented for one component a rejection. The card takes `--radius` on all
four corners and then REMOVES one: `rounded-ss-none` is zero, and zero is the
absence of a radius rather than a new one. Written as a removal after the
radius, in that order, so the file reads as "the system's one box radius, minus
one corner". `rounded-ss`, not `rounded-tl` — start-start, so the corner mirrors
with the trail in RTL for free. **Measured**: start-start **0px**, the other
three **22.5px** each (`--radius` at the 15px root), on all three harness cases.

**TWO SQUARES, TWO OBJECTS, NOT ONE DRAWN TWICE.** `BreadcrumbFolders` fills its
leading tab's arc in with a `--folder-radius-lip` patch, because the folder
silhouette's corner is a fixed path it may not edit. The shell removes the
CARD's corner, which is a CSS radius it owns. Different elements, different
mechanisms, one joint; neither file draws the other's.

**THE JOINT'S GEOMETRY IS THE SHELL'S HALF AND IT WAS WRONG.** The breadcrumb
wrapper paid `pb-[var(--space-3)]`, which was right for a line of trail text
floating above the card and is wrong for a strip that attaches: the strip
carries its own `margin-block-end: calc(var(--folder-tab-overlap) * -1)`, and
any padding here is subtracted from it — 12 against 15.96 would have left 3.96
of the approved overlap. It is zero now. The wrapper also declares no
`z-index`, no `isolate`, no `transform`, `opacity` or `filter`, so the strip's
`z-[1]` / `z-[3]` resolve against the SCREEN's `isolate` around the card's new
`z-[2]` — which is the contract `breadcrumb-folders.tsx` states in its own
words (*"kept so a caller that draws its card at `z-[2]` gets ch14's 'clipped by
the card edge' for the rest tabs and an attached live tab"*). This shell is that
caller and now says so.

### Added — `verify/one-shell/`

Vite + React, port 5251, kept. Five cases: a top-level collection (one
breadcrumb tab, big title, figures, no footer), a record (two tabs, the smaller
title, identity chips under the title, a footer), a shell passing NONE of the
optional slots, and then the same collection and the same record again through
the two deprecated adapters — because "the adapters still produce the same
screen" is a claim no type-check can hold. Screenshots are useless — the
Browser pane renders it at roughly 42 × 46 px whatever is asked — so the page
measures itself with
`getComputedStyle`, `getBoundingClientRect` and `elementFromPoint` once
`document.fonts.ready` resolves, and prints the readings as text. It gates on
the fonts rather than on a frame deliberately: a hidden or throttled pane never
services `requestAnimationFrame`, so a probe written against one prints
"measuring…" forever in exactly the pane it runs in.

The breadcrumb is a **stand-in and deliberately not `BreadcrumbFolders`** — the
slot takes a plain node and the harness must not turn that into an import. It
reproduces only the three things the real strip does to the joint: the negative
`--folder-tab-overlap` margin, the `z-[1]` / `z-[3]` pair, and a squared leading
corner.

**Read off the live cascade at 1440 × 900, light, root 15px:**

| | A collection | B record | C bare | D `MainScreen` | E `DetailScreen` |
|---|---|---|---|---|---|
| `data-title-step` | `h2` | `h3` | `h2` | `h2` | `h3` |
| title font-size | 30px | 22.5px | 30px | 30px | 22.5px |
| title tracking | -0.6px | -0.315px | -0.6px | -0.6px | -0.315px |
| card radius start-start | **0px** | **0px** | **0px** | **0px** | **0px** |
| card radius, other three | 22.5px | 22.5px | 22.5px | 22.5px | 22.5px |
| card `z-index` | 2 | 2 | 2 | 2 | 2 |
| breadcrumb slot `padding-bottom` | 0px | 0px | — | 0px | 0px |
| breadcrumb slot `z-index` / `isolation` | auto / auto | auto / auto | — | auto / auto | auto / auto |
| trail overlap onto the card | 15.95px | 15.95px | — | 15.95px | 15.95px |
| lead tab's leading edge vs the card's | 0px | 0px | — | 0px | 0px |
| hit 4px inside the card, under the live tab | tab | tab | — | tab | tab |
| hit 4px inside the card, under a rest tab | — | **card** | — | — | **card** |
| identity row present | false | true | false | false | true |
| first chip's fill | — | `rgb(26, 25, 24)` | — | — | `rgb(26, 25, 24)` |
| identity top − title bottom | — | **+11.25px** | — | — | **+11.25px** |
| shell `footer` slot drawn | — | ✓ | — | — | — |
| `RecordDetail`'s own footer drawn | — | — | — | — | ✓ |
| figures / body stack | ✓ / ✓ | — / ✓ | — / — | ✓ / ✓ | — / — |

**D matches A and E matches B on every design number**, which is the adapters
proven rather than assumed. Their only two divergences are both correct and
both expected: `DetailScreen` routes the record's footer through
`RecordChrome` → `RecordDetail` rather than through the shell's slot (same
region, same normal flow, one footer), and it therefore has one thing in the
body and gets `children` alone rather than the stack.

`--folder-tab-overlap` is `1.06375rem` = **15.96px at the product's 15px root**
(17.02 at ruling 28's 16px authoring reference, which is the number the token's
own comment states). The measured overlap of **15.95** is that value, so the
strip lands exactly where it means to. The two hit tests are ch14's "clipped by
the card edge" proven rather than reasoned about, and they **scroll the card
into view first** — `elementFromPoint` is defined in viewport coordinates and
returns `null` outside them, so a case below the fold answers "nothing is here",
and a probe that read that as "the card won" printed a passing number for a test
that never ran. It did, on the first run, for both adapter cases. The bare case
reports no body stack, which is the shell drawing `children` alone in the padded
body — byte-for-byte the markup it drew before the collapse.

### Deprecated — `MainScreen` and `DetailScreen`

Both survive, both keep their prop types, and **neither holds any design**. Each
is a mapping from old prop names onto `ScreenShell`'s slots plus the one
composition below the band that was never the shell's — `CollectionFrame` for a
collection, `RecordChrome` for a record. Every ruling their headers carried was
MOVED into `screen-shell.tsx`, unabridged, into a section named after it; their
headers now carry a list of where each one went and nothing else.

**The client said *"I don't want any dead body around"* about the folder tab
variant and the same instinct applies — to the design, which is gone.** There is
exactly one place a screen's shape is decided. What kept the two names alive is
this file's own existing argument for `Rail.collapsible`: *"the kit is vendored
into two applications this repo cannot see and removing a prop is a build break
for a change that is purely visual."* Nineteen call sites in this repo import
one of the two names, several of them in files under concurrent edit today.
**Deleting them is owed**: one line each in `compositions/templates/index.ts`
plus nineteen mechanical call-site rewrites.

**Migration, for a caller of either.** No prop was removed or renamed, so
nothing breaks. Two things about the RENDER moved:

- `MainScreen` — the figure strip is placed by the shell rather than by
  `CollectionFrame`: same place on the screen, one level up in the markup, and
  the gap between it and the panel is the shell's `--space-6` / `--space-5`
  instead of the frame's. `tabsVariant="folder"` is gone with the folder tab
  variant the client retired the same day, so this file no longer passes it —
  which is also the one `tsc` error that stood in the tree before this change.
- `DetailScreen` — the record's title, identity chips, tags, meta and actions
  move from the body pane into the header band. `RecordChrome` keeps the
  banner, stages, tabs, panel and audit footer.

A screen written today composes `ScreenShell` directly:
`<ScreenShell breadcrumb={…} breadcrumbDepth={2} title={…} recordNumber={…}
onEdit={…} footer={…}>`.

**`ScreenShell.header` is deprecated too** and still works: passing it replaces
the built band entirely, so there is one band either way and never two. Exactly
two call sites still hand the shell a finished band —
`demo/shapes/templates-0.tsx`'s catalogue specimen and `verify/shell-chat/`'s
harness — and both are another session's files today. Each is a small,
mechanical move to `title` / `eyebrow` / `actions` / `meta`, and it is owed.

**NOT DONE, AND NAMED RATHER THAN LEFT TO BE FOUND.**

- `SHELL.md`'s "THE TWO SCREENS" section is rewritten here as "ONE SCREEN, AND
  FOUR SLOTS", editing around another agent's concurrent rewrite of its
  tab-shape section rather than over it.
- The nineteen `MainScreen` / `DetailScreen` call sites, the two `header` call
  sites and the deletion of the two exports are all owed; none was attempted,
  because each meant editing a file this pass did not own.
- **`compositions/templates/record-route.tsx` composes `ScreenShell` and
  `RecordChrome` directly with an empty band** — override 73's own fix, made
  before the collapse existed — so the live record route still draws its title
  and chips in the BODY while `DetailScreen` now draws them in the BAND. Two
  spellings of a record, which is precisely what this change exists to remove.
  It is one mechanical move (`title`, `recordNumber`, `collectionLabel`,
  `chips`, `tags`, `meta`, `actions` up to the shell) and it was not made
  because that file is under concurrent edit today.

## v1.2.27 — 2026-09-02

**Three gaps the app was working around, closed in the kit.** All three were
approved on staging tonight and all three shipped there as app-side
workarounds; the standing rule is that an approved fix goes back to the kit
before anything else moves, so the app can now delete them. Verified in
`verify/toolbar-writeback/` — a measuring harness, not a picture: every figure
below is `getComputedStyle` / `getBoundingClientRect` read off the live
document in both palettes.

### Fixed — the "+ filter" pill was still not `SelectTrigger`'s box. Four measures, not one

Client, verbatim, on the pills v1.2.20 had already been through once: *"the
filter button-pill it's still differnet than the other 2. fix and uniform
it"*. v1.2.20 moved four properties onto `CHIP_ADD` — `--control-height-button`
(40), `--btn-secondary-fill`, `--btn-secondary-label`, `--btn-secondary-hover`
— and stopped there. Measured off this repository's own source, four were
left, and they are why the three pills still did not read as one family:

| | `CHIP_ADD` before | `SelectTrigger` |
|---|---|---|
| inline padding | 12 (`px-3`) | **18** (`--space-4h`) |
| type step | 12 (`--text-badge`) | **14** (`--text-sm`) |
| leading | 1 (`leading-none`) | **1.45** (`--text-sm`'s own) |
| weight | inherited (300 / 400) | **500** (`--font-weight-medium`, `ViewSwitch`'s override) |

`CHIP_ADD` now takes `px-[var(--space-4h)]`, `text-sm` and
`font-[var(--font-weight-medium)]`. `leading-none` is REMOVED rather than
restated as 1.45: `text-sm` already carries `--text-sm--line-height`, and the
`leading-none` on top of it was the whole reason this pill's string was set
solid where the other two were not.

Measured on the real toolbar ground (`collectionPanelVariants`' soft paper with
`--btn-secondary-fill` re-resolved to off-beige), Filter / Sort / View, at the
harness's 15px root:

```
height             MATCH 37.5px      (2.5rem)
padding-inline     MATCH 16.875px    (1.125rem)   was 11.25px on Filter
font-size          MATCH 13.125px    (0.875rem)   was 11.25px
line-height        MATCH 19.0312px   (×1.45)      was 11.25px
font-weight        MATCH 500                      was 400
background         MATCH  light rgb(255,254,249) · dark rgb(38,36,31)
radius             999 on all three (Sort is a fused pair: each half flat on
                   the joined edge, the silhouette 999 999 999 999)
```

**`filterChipVariants` deliberately did NOT move.** A removable facet chip, and
the "Clear filters" control that shares its drawing, stay at `--text-badge` on
`px-3` — measured 11.25px / 400. Those are CH11's `.kw-chip`, drawn at badge
type in the fragment `filter-bar.tsx` cites, and the ruling names "the filter
button-pill" against "the other 2", which is the add slot against `SortControl`
and `ViewSwitch`. A chip is not one of the other 2. The consequence — a bar
drawing both chips and the add slot now carries two type steps in one row — is
logged on the register rather than hidden, with the client question it needs.

### Added — `CompactFacet`, the short facet that is also searchable

`FilterBar` shipped two facets and neither is short: `SearchableFacet` is
always expanded (heading, search pill, every option as a checkbox row) and
`RangeFacet` is two numeric fields. A toolbar or a filter panel that wants ONE
FIELD reading "Any client" had nothing to reach for, so the consuming app
composed one out of the kit's `Select` — and `FacetLabel` was private to this
file, so its two classes were written out again over there.

**The cost was a feature, and it was measured.** A `Select` scrolls and takes
typeahead; it does not SEARCH. The app's Waves screen filters 131 clients, and
the day that facet became a compact select those 131 became a plain scroll —
the one thing `SearchableFacet`'s search pill exists to prevent. Neither facet
could be short AND searchable, so the app had to choose, and choosing short
dropped the search.

`CompactFacet` is a trigger over the same filtered list `SearchableFacet`
draws. `searchable` defaults to **false** — a facet over eight words does not
need a search field. It reuses rather than redraws: `selectTriggerVariants` for
the closed field (literally the recipe the sort and view pills are drawn
through), `FacetRegister` for busy / empty / failed, and — new in this version
— `FACET_OPTION_ROW` and `FacetSearch`, two shared pieces `SearchableFacet` was
rewired onto in the same pass, so the two facets cannot draw two different
lists. The panel is `PopoverContent` sized by `selectContentClasses`' own rule:
never narrower than the field, free to grow to its longest option, capped by
the width Radix measured.

`FacetLabel` is now **exported**, and the export is the point: it was the
private constant a consuming app had to copy.

One value or none, not a set — `SearchableFacet` stays the multi-select
drawing. A compact facet shows its value in its trigger, and a trigger holding
a set has to summarise it ("3 selected"), which is a wording the kit has not
been given. Logged, not guessed. It is also not a `combobox`: the trigger is a
disclosure button over a `listbox`, because the text input inside is a search
over the options and not the value, and announcing the two as one control would
tell a screen-reader reader that typing sets the facet.

Measured, light and dark: closed field 41.25px tall (`--control-height-input`)
at 16.875px inline padding, 13.125px / 300 — CH09's field step, NOT the toolbar
pills' 500, because a facet is a field and lives in the panel the Filter pill
opens. `size="dense"` gives 30px for a column of facets inside that panel. The
open panel measures exactly the trigger's width (195px against a 195px field),
`--space-2h` inset, 22.5px radius, the overlay shadow; the searchable one draws
the 30px search pill and 132 rows (131 clients plus the "Any client" row) in a
210px list that scrolls; the plain one draws no search pill and 3 rows. The two
closed facets put no panel in the document at all.

### Added — `CollectionFrame` grows a `toolbarPanel` slot, between the toolbar and the rows

Client, verbatim: *"the expanded toolbar shoudl not be an overlay, but literaly
expand the space"*. A filter panel opened off the toolbar's own pill has to
push the rows down. This frame owns every line of markup between its toolbar
and its body, so there was nowhere in flow for such a panel to land: the app
wrapped the whole frame in a context provider, published a DOM node as the
first child of the body and `createPortal`'d the panel into it — roughly 90
lines of shipped app code to reach a position the component can simply offer.

`toolbarPanel` is that position. A placement and not a drawing, exactly as
`band` and `period` are, drawn only when a node is passed. This is the SECOND
use of override 28's precedent (2026-08-23, "the contract can grow a slot"),
and the header says so rather than leaving a reader to wonder: the region order
inside the panel is now **band → toolbar → toolbar panel → rows → pager**.

Measured, two identical frames side by side, one with the slot filled:

```
slot position           static          (an overlay would be absolute)
slot between toolbar
  and body               true           and a sibling of the body
panel column row-gap    18.75px
toolbar → body, shut    18.75px         the gap alone
toolbar → body, open   157.50px
body pushed down by    138.75px         = 120 slot height + 18.75 gap
```

**And the `filters` wrapper keeps no `position`, which is the answer rather
than an omission.** The question came in as "anything a host puts in `filters`
has nothing to anchor against". It does not need one: the ruling above is that
a toolbar control's panel expands the space, so its place is `toolbarPanel`, in
flow — and adding `relative` there would publish the anchor for exactly the
shape the ruling refuses, in the one file a call site cannot edit. Everything
that legitimately floats off a control in this system is Radix-portalled and
positions itself against its own trigger; a positioned ancestor is not what any
of them read. The wrapper stays, though, because it earns its three utilities:
`gap-2` is what holds a multi-control `filters` slot at the chip measure rather
than the toolbar's `gap-3`, `flex-wrap` is what lets a long facet row break
instead of pushing the view switch off the line, and `min-w-0` is what lets it
shrink at all. Measured `position: static` on the live frame.

### What the consuming app can now delete

`shared/web/screen-engine/filter-bar.tsx`'s `FILTER_PILL_MATCHES_THE_OTHER_TWO`
override (four classes on the adapter's wrapper), its `SelectFacet` and the
`ANY_VALUE` sentinel under it, its hand-copied `FacetLabel` classes, and the
`FilterPanelProvider` / `FilterPanelOutlet` / `createPortal` machinery that
existed only to reach a position `toolbarPanel` now names. Its rot-check —
`web/test/filter-row-is-the-kits.test.tsx`, "THE FILTER PILL'S BOX IS THE SORT
AND VIEW PILLS' BOX" — is designed to go red on this version and will: it
asserts `CHIP_ADD` does NOT contain the three classes it now contains.

### Not delivered, logged on the register

Three entries added to `manifest.json` → `notDelivered`: the mixed type steps
in a chip row (needs a client ruling), a multi-select compact facet (needs a
summary wording the kit has not been given), and arrow-key navigation inside a
facet's option list (a behaviour change to a shipped component, and its own
change rather than a rider on a write-back).

## v1.2.26 — 2026-09-02

**The client cut the three sidebar spines to two: MANGO and QUIET.** `ink` and
`paper` cease to exist as spines. Mango is untouched, down to the byte. Quiet's
two grounds are her own, chosen off rendered screenshots — light `#F7F2EB`,
dark `#1C1B18` — and they are the first and third of today's three spine
fills, one taken from paper-in-light and one from ink-in-dark.

**Those two values cost no new hex, because they already had a name.** They are
`--surface-panel` in each palette exactly. So the quiet spine is not a new pair
of colours: it is the system's own **panel → raised** elevation step, worn by
the rail. `--spine-fill` is `--surface-panel`, the chip one rung off it is
`--surface-raised`, and the floating content card beside the rail is
`--surface-raised` too.

### Why she cut to two — the number, measured

The old paper spine's dark fill was `--kw-unlit-raised` `#26241F`, which is
also what `--card` resolves to in dark. A content card floating on that rail
measured **1.000** against it: no edge at all, in the one place the shell has
nothing but a shadow to fall back on. `screen-shell.tsx` had already routed
this as a token fact rather than a layout one. Quiet takes the ink spine's dark
ground instead, and the step comes back — **measured live in `verify/spines/`,
ground versus card on all three grounds the system now has:**

| ground | rail | card | ground vs card |
|---|---|---|---|
| quiet · light | `#F7F2EB` | `#FFFEF9` | **1.103** |
| quiet · dark | `#1C1B18` | `#26241F` | **1.111** |
| mango · light | `#FED069` | `#FFFEF9` | **1.440** |
| mango · dark | `#FED069` | `#26241F` | **10.661** |
| *(was)* paper · dark | `#26241F` | `#26241F` | *1.000* |

Quiet's step is the same size in both palettes, which the three-spine
arrangement never managed: paper stepped 1.103 in light and 1.000 in dark.

### Removed — four flip-halves, and a fifth renamed

§4 carried six "halves that flip" for the spines. Four had no consumer once
their spine went, and `grep` over the kit is what proved it — each was read by
exactly one `[data-spine=…]` block and nothing else:

| token | only consumer | outcome |
|---|---|---|
| `--spine-ink-fill` | `[data-spine="ink"]`, and `settings.tsx`'s picture *of* the ink spine | removed |
| `--spine-ink-quiet-label` | `[data-spine="ink"]` (twice) | removed |
| `--spine-ink-member-fill` | `[data-spine="ink"]` | removed |
| `--spine-paper-fill` | `[data-spine="paper"]` | removed → `var(--surface-panel)` |
| `--spine-paper-chip` | `[data-spine="paper"]` | removed → `var(--surface-raised)` |
| `--spine-paper-member-fill` | `[data-spine="paper"]` | **renamed** `--spine-quiet-member-fill` |

`--spine-paper-chip` only ever meant *"the paper one rung off the spine"* —
27.1 draws a `var(--card)` chip on a `var(--sheet)` rail. Once the rail **is**
the panel, one rung off it is the raised paper by definition, in both palettes,
with no half to state. Light is byte-identical at `#FFFEF9`; dark moves
`#2F2D28` → `#26241F` because the ground moved `#26241F` → `#1C1B18` underneath
it. The step against the rail is 1.127 before, **1.111** after.

**One half survives, and it is the one the client's own ruling forces.** The
member-chip ruling of 2026-09-02 — *the chip at the rail's foot is BLACK
whenever the app is in dark mode (any spine) or whenever the spine is mango
(either palette)* — bites in one palette only, so quiet needs a light value
(`--surface-raised`, `#FFFEF9`, today's chip) and a dark one (`--kw-charcoal`).
Mango still needs no dark half. `--spine-quiet-member-fill` resolves to exactly
what `--spine-paper-member-fill` resolved to: `#FFFEF9` / `#1A1918`.

### Changed — bare `:root` keeps the quiet values, for two better reasons

`:root` and `[data-spine="quiet"]` share a block, as `:root` and
`[data-spine="paper"]` used to. The old reason was thin — paper happened to be
first. Two hold it now, and neither is *"mango is the default"*, which is a
settings default (override 56) and not a stylesheet fallback:

- **Quiet is the only spine statable in the absence of a ground.** Every value
  in the block resolves through `--surface-panel`, `--foreground` and `--hair`,
  so on bare `:root` it is simply *"the rail is a panel"*, correct in either
  palette with nothing stamped. Mango's block is palette-independent literals
  chosen *for* a mango ground; on bare `:root` it would paint every unshelled
  rail brand yellow and rebind `--btn-secondary-fill` to off-beige inside it.
- **It is the safe landing for a stale value.** An account whose stored spine is
  still `"ink"` or `"paper"` matches no block, inherits `:root`, and paints
  **quiet** rather than nothing. Verified in `verify/spines/`: a specimen
  stamped `data-spine="paper"` reads back all thirteen names identical to
  quiet's. There is no transitional alias anywhere in the file and no token is
  left defined for a spine that no longer exists — the cascade does the job.

### Changed — Settings and onboarding, and a picture that cannot drift

`SpinePicture` **stamps `data-spine` and reads `--spine-fill`** instead of
switching on a name and reaching for a token per spine. The old version had to
be edited in three places to follow this ruling, and two of the tokens it named
no longer exist. Stamping the attribute the real screen stamps makes the
picture resolve through tokens.css §7b itself — the same cascade the real rail
paints from — so it is correct by construction, and a future spine needs no
change there at all.

**The captions are new, and they are no longer 26.05's.** The old three
described fills — *"Charcoal spine, mango active row."*, *"Soft-paper spine,
the quiet one."* — which worked when the reader was choosing between three
colours and the caption told her which. With two options named Mango and Quiet,
the name carries the colour and the caption has nothing left to add by
repeating it, so these say what the choice is like to live with:

| | Settings | Onboarding |
|---|---|---|
| **Mango** | Warm colour down the sidebar. Easy to find your place. | Warm, and easy to find. |
| **Quiet** | A calm sidebar that lets the work stand out. | Calm, and out of the way. |

The field's help line goes with them: *"Two looks for the sidebar. The rest of
the app does not change."*

### Every name in the quiet block, both palettes

| token | light | dark | why |
|---|---|---|---|
| `--spine-fill` | `#F7F2EB` | `#1C1B18` | `--surface-panel`. The client's two chosen grounds, and one token states both. |
| `--spine-ink` | `#1A1918` | `#FFFEF9` | `--foreground`. 15.763 / 17.056 on the rail. |
| `--spine-ink-quiet` | `#5F5D59` | `#BDB9B1` | `--muted-foreground`. 5.899 / 8.807. |
| `--spine-ink-disabled` | `#A8A59F` | `#76746F` | `--btn-disabled-label`. 2.206 / 3.689 — exempt from contrast, but a real step under the quiet tier in both. |
| `--spine-active-fill` | `#FED069` | `#FED069` | The caption law: the active row is mango on this spine. |
| `--spine-active-ink` | `#1A1918` | `#1A1918` | `--ink-on-accent`. 12.072 on the row, both. |
| `--spine-active-hover` | `#F4BE4B` | `#F4BE4B` | `--btn-primary-hover`, declared in light only, so it does not flip — which is what a mango row under a charcoal label needs. 10.294 both. |
| `--spine-chip-fill` | `#FFFEF9` | `#26241F` | `--surface-raised`, one rung off the rail: 1.103 / 1.111. |
| `--spine-mark-fill` | `#1A1918` | `#FFFEF9` | `--surface-inverse`. 15.763 / 17.056 against the rail. |
| `--spine-mark-ink` | `#FFFEF9` | `#1A1918` | `--ink-on-inverse`. 17.386 on the plate, both. |
| `--spine-member-fill` | `#FFFEF9` | `#1A1918` | `--spine-quiet-member-fill` — the client's black-in-dark chip. |
| `--spine-member-ink` | `#1A1918` | `#FFFEF9` | `--spine-ink`, already correct on both fills: 17.386 either way. |
| `--spine-hair` | `rgba(26,25,24,.08)` | `rgba(255,254,249,.12)` | `--hair`, unchanged and needing no inverse half: the quiet spine **is** `--surface-panel`, the ground everything else that reads `--hair` stands on. 1.172 / 1.430 composited. |

### Logged, not fixed

- **The black member chip on the quiet rail in dark measures 1.019** — the
  chip's shape all but disappears and only its label carries (17.386). Not new
  and not a consequence of this cut: `#1C1B18` was the ink spine's dark ground,
  the chip was black on it under the same 2026-09-02 member ruling, and 1.019
  is what the client was looking at when she chose this ground. On the old
  paper spine's `#26241F` it measured 1.132.
- **A blocked row and a quiet row rest at the same ink on the mango spine.**
  Unchanged; the other half of that note left with the ink spine, because quiet
  keeps `--btn-disabled-label` and keeps its two tiers apart in both palettes.

### Verify

`verify/spines/` — Vite + React, one palette per load (`?t=dark`), four
specimens: quiet, mango, bare `:root`, and a stale `data-spine="paper"`. Each
draws a rail from `var(--spine-*)` and a content card at `--surface-raised` on
the same ground. Every figure above is read back with `getComputedStyle` from
the real cascade and the ratio computed in the page from those values;
`window.__spines` carries the whole table. **Nothing here is verified by
looking** — the Browser pane renders the harness at roughly 42×46px whatever is
done to it. The rails are drawn in the harness rather than imported, because
`rail.tsx` and `screen-shell.tsx` were being rewritten while it was written and
their `spine` prop type still spells the old three values.

### Changed — `ScreenShell` is the chat shape: the ground is the spine, and only the content floats

Client-approved, same day. Until today the rail sat in a **filled column**
inside an off-beige screen card and `--spine-fill` painted that column alone.
It now paints the **whole window**, and the content is the one thing on it with
a radius and an elevation.

- `--spine-fill` and `--spine-ink` move **out of `RAIL_COLUMN` and onto the
  PAGE and the SCREEN**. The rail column's class list drops from five classes
  to one (`p-[var(--rail-inset)]`); measured live, its own `background-color`
  goes `rgb(247,242,235)` → `rgba(0,0,0,0)`. **Not one class in `rail.tsx`
  changed for this**, because the rail never named a colour — what it reads
  (`--spine-ink`, `--spine-chip-fill`, `--spine-active-*`) simply arrives from
  a higher ancestor.
- The two chip rebindings (`--btn-secondary-fill` / `--pill-fill` →
  `--spine-chip-fill`) move up with the fill, so anything standing on the
  ground — the member chip, a control in the aside, the breadcrumb — resolves
  the same way the rail's own contents already did.
- **The content becomes a floating card**: `--surface-raised`,
  `rounded-[var(--radius)]`, `shadow-[var(--shadow-lifted)]`. The header band
  and the body live inside it and the two page-side rebindings
  (`--btn-secondary-fill` / `--pill-fill` → `--surface-panel`, ruling 01) move
  down onto it with the off-beige, so a call site sees the identical value it
  saw before.
- **The shadow is named, not aliased.** `--shadow-lg` is the same value; the
  alias reads as a rung on a size ladder and this is not a size. Measured
  ground-to-card: **quiet 1.103 light / 1.111 dark, mango 1.440 / 10.661**. On
  quiet the shadow is carrying the card's edge, not agreeing with it.
- **Full viewport height, no page scroll.** `page` draws `100dvh` with
  `overflow: hidden`; three scrollers live inside it. Measured at 1440×560 with
  every scroller driven to its maximum: `document.scrollHeight` stays equal to
  `clientHeight` (560) and `window.scrollY` stays 0, while the rail's `<nav>`
  travels 602, the card's body 1126 and the aside 242 — and the breadcrumb, the
  header band, the member chip and both handles move **0.00px**. v1.2.23's
  pinned foot is preserved and the header band is now pinned the same way.

### Added — a third column (`aside`), a breadcrumb slot, and the two edge handles

- **`aside`** — the assistant's column, flat on the same ground, mirroring the
  rail. **Additive**: omit it (or pass `null`) and there is no column, no
  gutter and no handle on that side. `ASIDE_WIDTH` is exported at `23.75rem`
  (380 at ruling 28's reference), reusing ch19's stated `max-width: 380px`
  rather than coining a number; **logged as owed** — the kit states no docked
  assistant width.
- **`breadcrumb`** — a slot on the ground, above the card, aligned to its
  leading edge (measured: both at x 217.5 wide, x 22.5 narrow). It **carries
  navigation text and nothing else** — a client rule, stated at the prop, not
  enforced in code, because a shell that inspected its children to police them
  would be guessing at element types. It takes `--spine-ink` by inheritance.
- **The edge handles.** A **3 × 34px** rounded bar in a **20 × 44px** invisible
  `<button>`, hover thickening to 5 × 44 on `--duration-colour` (120ms,
  `ease-kwapso`). **Position is the whole affordance** — outer rim when open,
  the column's inner edge when shut — so the bar always stands on the side the
  column will travel toward. No chevron: three pixels will not hold one.
- **The colour is `--spine-ink` and may never be a fixed charcoal.** Measured:
  a literal `#1A1918` on quiet's dark ground `#1C1B18` is **1.019**, an
  invisible control. `--spine-ink` measures **12.072** on mango, **15.763** on
  quiet-light and **17.056** on quiet-dark.
- **The geometry is in px, and that is a deliberate departure from ruling 28's
  rem.** 44 is a WCAG 2.5.5 target-size minimum, stated in CSS pixels, and must
  not shrink to 35.75 at `data-scale="small"`; a 3px bar is a hairline, and the
  kit already writes those in px (`--focus-width: 1px`). Everything else the
  shell draws stays on the rem ladder, because all of it is measure.
- **The rail's foot toggle goes away.** `Rail.collapsible` is `@deprecated`,
  stays off and is not removed — the kit is vendored into two applications this
  repo cannot see. The rail's footer holds only the member chip again.

### Changed — `ScreenSpine` is `"quiet" | "mango"`, and `Rail` loses a branch

Fulfilling this version's own "the `spine` prop type still spells the old
three". `screen-shell.tsx` and `rail.tsx` both narrow to the two live names,
and `Rail`'s `markField` drops from three branches to one:
`spine === "mango" ? "brand" : "paper"`. The `unlit` cut is **not re-homed onto
quiet** — it existed because `ink` was the one ground that stayed dark while
the palette went light, and quiet's ground follows the palette by definition.
`demo/shapes/templates-0.tsx` and `verify/spine-colors/` drop to two spines
(the latter from a 6-cell grid to 4; it still measures a live question).
TypeScript now rejects `"ink"` / `"paper"` at a call site while the cascade
still forgives a stale stored one, which is the right way round.

### Verify — `verify/shell-chat/`

Vite + React, **one case per URL** (`?rail=`, `?aside=`, `?spine=`, `?t=`,
`?mode=`), because the shell claims `100dvh` and stacking cases down one page
would give each a height the product does not have. `window.__shellProbe()` is
installed by the page itself so it survives navigation. **Nothing is verified
by looking** — the pane renders at roughly 42×46px. Measured at 1440×900,
against the kit's own 15px root (ruling 18), so `13rem` reads 195:

| case | rail handle hit | aside handle hit | aside column | card |
|---|---|---|---|---|
| both open | **0 → 20** (window's leading rim) | **1420 → 1440** (trailing rim) | 1083.75, w 356.25 | x 217.5, w 843.75 |
| both shut | **55 → 75** (collapsed column's inner edge, 75) | **1417.5 → 1437.5** (gutter's inner side) | **absent from the DOM**; dock = 22.5, the gutter alone | x 97.5, **w 1320** |
| rail open · aside shut | 0 → 20 | 1417.5 → 1437.5 | absent | w 1200 |
| rail shut · aside open | 55 → 75 | 1420 → 1440 | 1083.75, w 356.25 | w 963.75 |

The bar is **3.00 × 34.00** and the hit area **20.00 × 44.00** in every case, on
both spines and both palettes; both are `rounded-pill`, so the global
`:focus-visible` ring lands on the 20 × 44 target and never on the bar. **The
rail's handle travels 55px** between its two states and the aside's 2.5px —
the aside's small delta is the gutter and the target being nearly the same
width, and its real signal is the column itself arriving.

**The hover step is verified from the emitted rule, not by hovering.** The pane
reports `:hover` on the element but does not recalculate hover styles — a
hand-injected `.group:hover … { height: 44px }` does not apply either — so the
harness reads `.group-hover\:h-\[44px\]:is(:where(.group):hover *) { height:
44px }` and its width twin out of the stylesheet, inside a `@media (hover:
hover)` that matches, and reads `transition-property: height, width` /
`0.12s` / `cubic-bezier(0.16, 1, 0.3, 1)` off the bar.

**The rail's rows are unchanged, and that is a diff rather than a claim.**
`verify/shell-chat/before-shell.tsx` is a frozen v1.2.25 copy of the shell,
rendered against the same `Rail`. Across **all 20 rows**, x, width, height,
y-relative-to-the-nav's-scroll-origin, `background-color`, `color`,
`font-weight`, `border-radius` and `padding-left` are **identical — zero
differences**. The column is x 0, w 195, padding 22.5 in both; the member chip
keeps its rect, its `#FFFEF9` fill and its 999 radius. The only computed
difference anywhere in the rail is the column's own `background-color`, which
is the change.

**Narrow (380 × 800): both docks are `display: none`,** both handles collapse
to zero rects and leave the accessibility tree with them, and the card keeps
the ground's gutter on all four sides (x 22.5 → 357.5) with the breadcrumb
aligned to it. **That is the answer for `aside` on a phone: it is dropped, like
the rail, and no drawer is grown** — a drawer is a hamburger by another name,
and ch19 already gives the assistant a floating, non-modal form that needs no
column.

## v1.2.25 — 2026-09-02

The client released two brand colours — lavender `#B1A3CF` and orange
`#F7953E`, her own typed values — and they close the two oldest colour gaps in
the file. Both were real defects and both were the same defect twice: a
distinction the system draws in words, drawn in one colour on screen.

`--chart-4` and `--chart-5` repeated `--chart-1` and `--chart-2`, so a
four-series chart had one duplicated pair and a five-series chart had two.
`--warning` and `--warning-foreground` resolved to `--surface-quiet` and
`--ink-secondary`, which is *exactly* what `Badge variant="secondary"` already
draws — measured live in `verify/accents/` at a contrast of **1.000 on both the
fill and the ink, in both palettes**. `DataPreviewTable` draws that pair side by
side: `unchanged` takes `secondary` and `changed` takes `warning`, and its own
header reasons the two outcomes apart at length.

Both hexes are written in `tokens.css` §2 and nowhere else. The client also
attached a brand sheet drawing near-neighbours `#BDADD5` and `#F29436`; that
difference is back with her and unresolved. Every use is a `var()` at one of the
two names, so a correction is one line per colour.

### Added — two accents, admitted against the palette's own rule

§2 states the rule at its head: *"A new accent is admitted only if it carries
charcoal type at both its light and its dark value."* Charcoal measures
**7.53:1** on lavender and **7.79:1** on orange, against AA's 4.5. Each clears
it at a single value, so neither has a second one — for scale, the four accents
already in the file carry charcoal at mango 12.07, sky 8.69, forest 4.61 and
poppy 4.59, which puts the two admitted today second and third in the palette.

**Neither is a lift, and that is measured rather than reasoned by analogy.**
Forest and poppy carry `-lift` hexes because their own values land at 4.07 and
4.05 against a dark card; `--kw-sky` carries none and is not redefined in dark
because it measures 7.68 there. Lavender and orange measure 6.65 and 6.88 — in
sky's band, not forest's. A `-lift` would have been a hex invented against a
number that already passes, and a value that does not flip between palettes is
not given a dark half.

**Neither is an ink.** As TEXT both fail on both light papers — lavender 2.31 on
off-beige and 2.09 on soft paper, orange 2.23 and 2.02 — and both pass on a dark
card at 6.65 and 6.88. Nothing writes a word in either colour.

### Fixed — `--chart-4` and `--chart-5` are colours, not repeats

`--chart-4` = `--kw-lavender`, `--chart-5` = `--kw-orange`.

**The assignment is decided by hue distance**, because this palette's series are
told apart by hue and not by lightness. As HSL angles: poppy 7.9, orange 28.2,
forest 150.3, sky 207.1, lavender 259.1. Orange sits **20.3** from poppy, by far
the tightest pair in the set — every other pair is at least 52.0 apart. So
orange goes last, where a chart only reaches it at five series:

| | series | closest pair that is actually adjacent |
|---|---|---|
| four series | sky · forest · poppy · lavender | 52.0 (sky/lavender, and they are not neighbours) |
| five series | the above, then orange | 108.8 (poppy/lavender); 5 wraps to 1 at 178.9 |

The reverse assignment stands poppy and orange side by side at 3 and 4, 20.3
apart, in **every** four-series chart in the system.

Neither takes a dark entry, for the reason above — 2 and 3 are re-pointed in
dark at their lifts, 1 is not re-pointed at all, and these two follow 1.

**An observation about the whole set, recorded and not solved.** Every mark in
this palette is a pastel or mid-tone read against paper. On a light card: sky
2.00, orange 2.23, lavender 2.31, forest 3.77, poppy 3.79; on a light panel each
drops again (1.81 / 2.02 / 2.09 / 3.42 / 3.43). The already-shipped `--kw-sky`
is the *lowest* of the five, so the two admitted today land above the bar in the
file rather than under it — this is not a new defect and not these colours'
doing. What is worth stating plainly is that the set separates on hue alone:
forest and poppy differ in luminance by a ratio of **1.00** and lavender and
orange by **1.03**, so in greyscale, in print, or to a reader with a
colour-vision deficiency each of those pairs is one mark. A series in this
system needs a direct label, a pattern or a shape as well as its colour. That is
a charting rule and not a token.

### Fixed — `--warning` is a colour again, and it is the orange

The block this replaces was written as a holding position and named its own
exit in its last line: *"The client is adding colours; when an amber or
equivalent exists, `--warning` should take it and this block goes."* It exists.

`--warning` = `--kw-orange`. `--warning-foreground` = `--ink-on-accent`, and
**that half is not cosmetic** — it is the consumer the repoint would otherwise
have broken. `--ink-secondary` is an ink tuned for paper; on the new fill it
measures **4.00 in light**, under AA, and **1.48 in dark**, which is not a label,
it is a stain. Charcoal measures 7.79 on the new fill in both palettes. Neither
token takes a dark half, because the fill has none.

**Every consumer, found and checked.** `badge.tsx`'s `variant="warning"` is the
one and only place in `components/` or `compositions/` that reads either token,
as `bg-warning text-warning-foreground`; it is fixed by the repoint and needed no
edit beyond its comment. `DataPreviewTable` reaches it indirectly, mapping
`changed` → `warning`, and gets the colour its own header always argued for.
Nothing reads `--warning-strong` at all.

**Poppy is untouched** and still means blocked and nothing else. Ruling 3B moved
warning *off* poppy; this moves it off the quiet chip it was parked on, and 3B
stands.

**`--warning-strong` did not move, and that is a measurement rather than an
omission.** It is the ink half — the warning *word*, not the fill — with zero
call sites across the kit. Orange AS TEXT measures 2.23 on off-beige and 2.02 on
soft paper, so pointing it at `--kw-orange` would ship a word nobody can read;
minting it a darkened orange the way ruling 43 gave poppy `--kw-poppy-ink` would
invent a hex the client never typed, for a consumer that does not exist. Ruling
43 moved because every destructive word in the system was failing AA; nothing is
failing here. It stays `--ink-primary` and stays the one flagged token in
`manifest.json`'s `notDelivered` for this family.

**One divergence, logged rather than settled.** `Alert variant="warning"` draws
a **mango** dot — ch20's own drawing, restored by the 2026-08-26 fidelity
re-audit under override 17 after it had once already followed this very token
down to the quiet fill. It reads `--primary`, not `--warning`, so this ruling
does not reach it. A warning *badge* is now orange and a warning *alert dot* is
still mango: two components spelling one word in two colours. That needs a
client ruling, not a repoint of a value the artifact states outright.

### Considered and declined

* **A lavender or orange status dot.** There are exactly six `--dot-*` tokens
  and exactly six dot tones in `badge.tsx`; no state is without a colour, so a
  seventh would be inventing a semantic rather than filling a gap.
* **Splitting `--dot-shipped` from `--dot-done`.** They resolve identically
  (forest, 3.77 against a light pill and 5.95 against a dark one) but that is
  ruling 04's deliberate synonym — the system says "shipped" and the portal says
  "Done" for one state — not a collapsed distinction.
* **Moving `--info` or `--dot-review` off sky.** Sky also backs `--chart-1`, but
  those are different token families and are never drawn against each other in
  one view. Nothing collapses.
* **`--pill-fill-building`'s mango dark fill.** Which accent it should be is
  `GAPS-TRACK1.md` STA-1, an open client question that predates these colours.

### Verified

`verify/accents/` (Vite + React, port 5241, kept). Screenshots are useless in
this environment — the Browser pane renders at roughly 42×46px whatever the
viewport is emulated to — so nothing on that page is checked by eye.
`window.__ACCENTS__()` reads every swatch out of `getComputedStyle` on the live
element, flips `data-theme` on `<html>`, reads again, and returns both palettes
as JSON. The page names tokens and never a hex; R32 holds inside the harness.

Read back, light / dark: `--chart-4` `#B1A3CF` / `#B1A3CF` and `--chart-5`
`#F7953E` / `#F7953E` through the real `bg-chart-*` utilities, against
`--chart-2` and `--chart-3` flipping to their lifts as they always did; the
warning badge `#F7953E` under `#1A1918` at **7.79 in both palettes**; and the
old binding beside the quiet chip, which is the defect this release closes.

That last one, stated as the numbers it actually was rather than as one
headline — the first draft of this entry said "1.00 on fill and 1.00 on ink"
and only half of that was true:

| | fill | ink |
|---|---|---|
| light | 1.21 | 1.95 |
| dark | **1.00** | 1.51 |

In DARK the two chips were the same token — `--warning` and `--secondary` both
resolved to `--kw-unlit-secondary`, so "Will change" and "Unchanged" in
`DataPreviewTable` were one chip and the label carried the whole distinction.
In LIGHT they were two pale beiges a fifth of a step apart: bad, but not the
same colour. After: **2.02** light, **5.20** dark.

`tokens.json` regenerated and diffed — `--check` runs the guards only and does
not compare output. `unresolvedFlagged` falls 21 → 13. `npm run check` green.

## v1.2.24 — 2026-09-02

Four of the five entries below existed already, as corrections written
downstream in the app's `shared/web/library-overrides.css` because a vendored,
hash-pinned `shared/ui/` could not be hand-edited. Three of those blocks each
carried the same closing sentence — "the real fix is upstream; delete this the
day a synced tag ships it" — and none of them had ever travelled. They travel
here. An override is a second place a decision lives, and that file's own
header says what a second place costs: a rule written on 30 June was still
fighting a library fix that had shipped in v0.13.0, and it tinted every card
in both apps for nine days before anyone connected the two.

### Changed — the focus ring is drawn ON the edge it answers for, not 2px beside it

`--focus-offset` is `0px`. Client, 2026-08-31, over a plain "Price sold" text
input: "when in select something you draw an overline bigger [than] the
already existing outline. do not do that. just change the color of the
existing outline. everywhere where you show the selected whatever."

The fix is geometric and not chromatic — `--focus` is already the ink this
system uses for every other "selected" mark, so the colour was never the bug.
An `outline` paints outside its border box by `outline-offset`, while a
field's own edge is an INSET shadow painted immediately inside that same box,
and `input.tsx` says outright that the hairline does not move on focus (review
1A · fix 4 stopped it moving on purpose). At 2px those were therefore two
concentric strokes with a visible gap between them: precisely "an overline
bigger than the already existing outline", never a recolour of anything. At 0
the ring lands on the box the hairline is drawn against, so a focused control
reads as its own edge changing colour and weight in place.

`--focus-width` and `--focus` do not move: still 1px, still charcoal
(off-beige on an inverse ground), still `:focus-visible` only, still §8's one
rule for every control at once. Only where it is drawn changed. This is the
SECOND override of kit ruling 24 — the width went to 1px on 2026-08-22 (B2) —
and §3 now carries both rulings in full beside the values. `docs/TOKENS.md`
and `docs/RULES.md` both stated `2px` for the width AND the offset; the width
had been wrong in the docs since 22 Aug and both rows are corrected here.

Measured in `verify/writeback/` §A, on a focused `Input`, both palettes: a
`1px solid` outline at `outline-offset: 0px` on the control's own 999px
radius, immediately outside the border box its own `0 0 0 1px inset` hairline
is drawn inside. Rebinding the token back to `2px` on the live page moved the
ring to `2px` and nothing else, which is the whole of the change.

`rail.tsx`'s scroll gutter needed no edit and got none: it is written as
`calc(var(--focus-offset) + var(--focus-width))` and states no literal, so it
narrows from 3px to 1px and still clears the ring exactly.

### Fixed — the assistant's mark rides the bubble's top, not its full height

`AgentChat`'s turn row was `flex items-end`, which bottom-aligned the mark
against the row's tallest child on every turn. A one-line reply hides this
completely — there is only one line to align against either way — which is why
it survived to be reported from an app, on a genuinely tall answer where the
mark sat level with the bubble's BOTTOM rather than beside the first line a
reader's eye starts at.

The kit already drew this the other way one component over: `chat.tsx`'s own
`Message` is `items-start` and states the ruling in its own words, "CH19 view
16 levels the 24 mark with the TOP of the bubble". `AgentChat` was the one
surface still drawing the older behaviour, so this is not a new rule — it is
the already-ruled alignment reaching the last component that had not picked it
up. The thinking turn takes the same row shape for the same reason; its own
dots are never tall enough to show the difference, which is not a reason for
two sibling rows to disagree.

The avatar's `mb-1` went with it. It was the bottom-aligned row's nudge, and
at `items-start` a cross-axis END margin moves the mark nowhere — it only
padded the row's own height on a short turn.

Measured in `verify/writeback/` §B on a 163.875px bubble: the mark's top is
now 0.000px from the bubble's top. Forcing the old `items-end` + `mb-1` back
on the live row puts it 141.125px lower, 4px clear of the bubble's bottom.
Row height is 163.875px either way — the mark moved, the layout did not.

### Fixed — the composer's ring belongs to the pill, not to the bare field inside it

Client, 2026-09-01, over the assistant's message field: "when i select the
text field, the 'select' outline is inside? should outline the full component!
but remember, this should only change the color of the outline (like in the
add/edit screens)."

`AgentChat`'s composer is a decorated pill (`bg-card`, its own radius and
padding) wrapped around a BARE `<textarea>` — `border-0`, `shadow-none`, no
fill and no radius of its own. Focus lands on the textarea, which has no
visible box, so the ring drew a plain rectangle sized to it, sitting inside
the rounded pill the reader perceives as the field.

`tokens.css` §8 has named and solved this shape since review 1A · fix 4, for
`search-input.tsx` and `filter-bar.tsx`'s facet field: the bare node hands its
ring to the shell it sits in through `:has()` and suppresses its own. This
composer was simply never marked with either attribute. It is marked now —
`data-focus-shell` on the pill, `data-focus-proxy` on the Textarea, on the
INSTANCE and not in `textarea.tsx`, because a standalone Textarea is its own
visible box and already rings correctly. No ring is written in the component;
§8 still owns the only one, and §8's own tally of who carries the pair is
updated rather than left one file short.

Measured in `verify/writeback/` §C, with the textarea focused: the pill draws
`1px solid rgb(26,25,24)` at offset 0 on its own `999px` radius across its
full 487.5 × 45 box, and the textarea's own `outline-style` is `none` — its
408.75 × 30 rectangle is no longer ringed. Typed to three lines, the ring
follows the pill into the stadium radius without a second rule, because an
outline always takes the radius of the box it is drawn on.

### Fixed — `WebEmbed`'s sandbox default was the documented escape hatch

`DEFAULT_SANDBOX` was `"allow-scripts allow-same-origin"` while the file's own
header said "THE SANDBOX IS DEFAULTED CLOSED". The header was right about the
intent and the code was the wrong half: the HTML standard says of this exact
pair that framed content served from the embedder's origin can reach its own
DOM through `window.parent`, rewrite its own `sandbox` attribute and reload
itself out of the sandbox entirely. The default permitted the one thing the
paragraph above it claimed to prevent.

The default is now `allow-scripts` and nothing else, which puts the frame in
an opaque origin — the thing that actually walls it off from this app's
cookies, storage and DOM. It costs an ordinary third-party embed nothing: a
video, a map or a form on somebody else's origin was already cross-origin and
was never reading ours.

The one legitimate need is an opt-in prop rather than a default. A first-party
embed — our own page, needing its own storage — passes `allowSameOrigin`. A
named boolean, not a hand-typed `sandbox` string, so the dangerous pair is one
greppable word at the call site instead of a token buried in a string nobody
re-reads, and the call site states the trust rather than inheriting it.

A second untrue sentence went with it: the header claimed
`sandbox={undefined}` removed the attribute entirely. It never did —
`sandbox` was a defaulted parameter, so `undefined` is exactly the value that
selects the default — and it is not wanted either. An unsandboxed frame is not
a state "defaulted closed" can have. `sandbox` is no longer defaulted in the
destructure (the default depends on `allowSameOrigin` now) and a call site's
own string still replaces everything wholesale, empty string included.

Measured in `verify/writeback/` §D, off the rendered `<iframe>`'s own
attribute: default `allow-scripts`; with `allowSameOrigin`, `allow-scripts
allow-same-origin`; with `sandbox="allow-forms"`, `allow-forms`.

`map.tsx` carries the same pair and KEEPS it, deliberately: its `src` is a
provider's embed URL by its own definition, where the pair grants the provider
its own storage and grants it nothing of ours. Its comment said "same default
as `web-embed`", which is no longer true and is rewritten — including the part
that is a judgement and not a ruling, since nothing in the type system makes
that `src` third-party. Whether it should follow is logged there, unruled: the
demo makes no network calls, so which providers actually break without
`allow-same-origin` cannot be measured in this repo.

### Fixed — the right is called `create`, and the matrix called it `add`

`PermissionMatrix` shipped `RIGHTS = ["see", "add", "edit", "delete"]` and
`WRITE_RIGHTS = ["add", "edit", "delete"]`. The client SAID "add" on
2026-08-24 and the ids were transcribed straight out of that sentence, but the
application that enforces these switches has one name for the right and it is
`create` — `shared/workers/gating.ts` types it `"read" | "create" | "edit" |
"delete"`, the sheet stores `can_create`, and the glossary's own definition of
an access right reads "read, create, edit, or delete". An id is a key two
systems match on, not a transcript.

The label follows the id rather than keeping a second word for the same
switch, which was already this file's own stated rule — "keeping a second set
of words for the same four things is how two lists drift" — and had been
broken by this id since the day it was written. The slot letters stay four
distinct initials: S · C · E · D. The demo's own permission data and section
summary move with it, and the header's three passages that spelled the order
"see · add · edit · delete" are corrected rather than left describing a build
that no longer exists.

`see` is left alone and the divergence is recorded rather than tidied away:
the enforcing name for that one is `read`, it was not asked for, and it is a
word in front of a reader where `Create` versus `Add` is not.

Measured in `verify/writeback/` §E, off the rendered grid: the slot letters
read S · C · E · D, the legend reads "See · Create · Edit · Delete", and a
slot's accessible name reads "Owner · Accounts · Create: held".

**Downstream note.** The app maps both vocabularies in one place
(`web/components/role-detail.tsx`, `RIGHT_TO_KIT` / `KIT_TO_RIGHT`). Its
`create: "add"` / `add: "create"` halves become `create: "create"` /
`create: "create"` when this tag is vendored, and `KIT_TO_RIGHT`'s type will
not compile until they do.

### Housekeeping — `tokens.json` caught up on two tokens it had never seen

Rebuilding the generated file for `--focus-offset` also picked up
`--spine-paper-member-fill` and `--spine-ink-member-fill`, which have been in
`tokens.css` since the spine work and had never reached the JSON. Nothing
flagged it, because `build-tokens.mjs --check` runs the four guards and does
not diff the emitted file against the one on disk — worth knowing, since the
same silence would hide the next one. Declared count 279 → 281.

## v1.2.23 — 2026-09-02

### Fixed — the rail's collapse toggle and member chip no longer scroll with the entries

Client, verbatim: "when i svroll down the expand/collpase button in navbar
also moved. make sure this does not happen."

`Rail` (`rail.tsx`) scoped no scroll region of its own anywhere — the file
contained no `overflow-y-auto` and no `min-h-0` before today. Its `<nav>`
carried `flex-1` and nothing else, so a rail with more entries than fit
simply grew past the bottom of its column, and the only box a consuming
application could then put `overflow-y-auto` on was the whole `<Rail>`,
foot included. That is why the collapse toggle and the member chip — real
siblings AFTER the `<nav>`, already structurally at the foot — travelled
upward with the list.

The scroll is the composition's now, and it is the `<nav>`'s: `min-h-0`
(without which `flex-1` still floors that item at its content's height and
nothing can ever overflow) plus `overflow-y-auto`. The toggle and the chip
sit outside the scroller and cannot move, in both rail states. The rail
root also gained `max-h-full` alongside its existing `min-h-full`, so the
rail is EXACTLY its column wherever the column has a height to be exact
about; against an auto-height parent 100% resolves against nothing and the
rail grows exactly as it always did.

The `<nav>` also takes a `calc(--focus-offset + --focus-width)` negative
margin and an equal padding. That is not spacing: a scroll container clips
its other axis too, and tokens.css §8 rings every control off its edge, so
a focused row against the new box's edges would have had its ring sliced.
The two cancel exactly — 212 elements across the harness's three static
cases were compared before and after, and the only computed difference in
any of them is that padding/margin pair on the `<nav>`, which paints
nothing. No row shape, no active pill, no spine colour, no chip styling, no
token moved.

`verify/rail/` gains a `scroll` case: two height-bounded columns, expanded
and collapsed, each with more entries than fit and each keeping the
application's own outer `overflow-y-auto` in place, because the fix has to
hold with that wrapper still there. Measured on it, scrollTop 0 → max: the
toggle and the chip move 0px in both states while the rows move the full
675px (expanded) / 472px (collapsed). Before the fix the same probe moved
the toggle and the chip 630px / 473px, in lockstep with the rows.

## v1.2.22 — 2026-09-02

### Changed — the rail's active row is an inset pill, not a full-bleed one

Client, after the rounding itself finally landed: "allow a bit of blank
space on the sides so it's not touching the edge." `ROW_EXPANDED` used to
cancel the rail's own ambient `--rail-inset` with a negative inline margin
to reach the column's true edge, then pay the inset back as padding so the
icon/label still landed where an idle row's already sat. Dropping the
cancel-and-respend leaves the row inside the same padding every other row
already sits in — the blank space is exactly `--rail-inset`, the value the
shell already publishes on the column, not a new number. `rounded-pill`
and the row's height are unchanged; only the outer box's own bleed is
gone. Two other passages in this file described the old full-bleed
mechanic as current and were updated to match (the geometry summary's
"FULL-BLEED" bullet, and the brand mark's own alignment comment); a third,
the historical record of the square-vs-pill reversal, is left alone since
it correctly describes what was true at the time.

## v1.2.21 — 2026-09-02

### Changed — the fused sort chip's order flipped: arrow on the left, field on the right

Client, verbatim: "on the sort by, cange the ordre: so on tge left of the
fused we have the arrow and on the right the value and dropdow." The chip's
DOM order in `SortControl` (`sort-control.tsx`) is now `[direction, field]` —
the arrow button first, the field (value + chevron) second — reversing the
order set the same day in v1.2.20's fusion.

Rounding was reasoned in logical terms throughout, not swapped by literal
side: `directionVariants` now carries `rounded-s-pill rounded-e-none` (its
outer corner is the chip's START, since it is now the first half) and
`fieldVariants`'s `fused` variant carries `rounded-e-pill rounded-s-none`
(its outer corner is now the chip's END). The file's own RTL paragraph is
rewritten to match: the direction control sits at the chip's inline start,
the field's own chevron stays at ITS inline end via `SelectTrigger`'s
`justify-between`, unaffected by the outer reorder.

Verified in `verify/sort-chip/`, extended with an explicit `dir="rtl"` row.
Read back via `getBoundingClientRect` and computed `border-radius`: in LTR
the direction control sits left of the field with `border-radius: 999px 0 0
999px` against the field's `0 999px 999px 0` (one seamless pill, rounded
outer corners only); in RTL the two swap physical sides (direction right of
field) and each one's rounded corner follows it, confirming the reorder is
driven by logical properties and not hardcoded sides. Separately confirmed,
and NOT part of this fix: `SelectTrigger`'s own corner is governed by Radix,
which stamps `dir="ltr"` on itself absent a mounted `DirectionProvider` —
`demo/App.tsx` already documents this as a pre-existing, out-of-scope
limitation (client ruling 10: the system is LTR-only). That limitation
existed identically before this reorder, just mirrored to the other corner,
and is unrelated to the swap.

### Changed — tabs now use the rail's exact idle/active font weights, not just its hover preview

Client: tabs should use "the same weights as in navbar." The rail's own
`ROW_IDLE` (`compositions/templates/rail.tsx`) states an idle row's weight
explicitly as `--font-weight-light` (300) and its active row (and an
inactive row's hover) as `--font-weight-medium` (500). Tabs
(`components/tabs/tabs.tsx`) already got the HOVER half of this right
tonight — `enabled:hover:font-[var(--font-weight-medium)]` on both
variants — but the RESTING state carried no weight class at all. A
`<button>` inherits `font: inherit` from Preflight and nothing in
`text-sm`/`text-caption` sets a weight, so an idle tab's computed weight was
the browser's default 400 — a third value the rail never draws.

`TRIGGER_SKIN.line` and `TRIGGER_SKIN.folder` both now carry
`font-[var(--font-weight-light)]` at rest, alongside the untouched hover and
active rules, so a tab's idle/hover/active sequence reads the identical
three numbers (300/500/500) the rail's nav rows do.

Verified in `verify/tabs-hover/`, extended with `data-probe` attributes and
a live computed-`font-weight` readout. Read back via
`getComputedStyle(...).fontWeight`: idle tabs read `300` and active tabs
read `500` in both `line` and `folder`, matching the rail exactly. The
hover rule was confirmed present and correctly compiled — `.enabled\:hover\
:font-\[var\(--font-weight-medium\)\]:enabled:hover { font-weight:
var(--font-weight-medium); }` — in the built stylesheet; genuine `:hover`
could not be triggered reliably through this session's browser automation,
but the compiled rule and token are identical to the one the rail already
uses and already ships.

### Investigated — `ScalePicture`'s three states drew a different AMOUNT of content, not just a different size

Client, verbatim: "the representation is worng, chnaging the size chnages
the size of the text, not how much data is show. so your display is
wrong." Confirmed: `ScalePicture` (`compositions/screens/settings.tsx`) drew
"compact" with a SECOND metadata line ("Sprint 24 · shipped"), "default"
with one, and "large" with a SHORTER one (just "Status", the "· 4 open"
dropped) — so scrubbing the setting looked like it changed how much the
app shows. `shared/scale.ts` (kwapso_system) confirms the real mechanism is
a single root font-size per step; it never adds, removes or shortens a row.

Redrawn to show the SAME content — one title, one metadata line, word for
word — at three point sizes (12/10, 14/12, 16/14), with the block's own gap
and padding stepping up alongside the type so "spacing scales too" is
visible without touching content.

Verified in `verify/scale-picture/`: reads back each step's rendered text
nodes. All three arrays are identical (`["Record title", "Status · 4
open"]`); computed `font-size`/`gap`/`padding` increase monotonically
compact → default → large.

### Fixed — the error register was missing the eyebrow and dot the client's own reference card showed

Client: "but i gave you a specific design inside a card, you took it only
partially" — about the 27 call sites in kwapso_system moved onto
`ShapeStateBody` for their load-failure state. Her reference card ("LOAD
FAILED") showed a small red dot beside an uppercase eyebrow, a bold title,
a description, and TWO buttons (Retry + a plain-text Copy) side by side.

Traced `ShapeStateBody` (`compositions/states/states.tsx`) into
`ScreenRegister` (`components/screen-renderer/screen-renderer.tsx`) and
found the eyebrow was genuinely absent — `screen-renderer.tsx`'s own SCR-4
comment already logged it: "The EYEBROW half of CH21's register is still
missing here and needs a new prop, so it is logged, not smuggled in." The
kit had already drawn it correctly once, in `form.tsx`'s own LOCAL
`Register` (chapter 21's failure eyebrow: a 7px poppy dot, `--dot-status`,
`bg-destructive`, then an uppercase micro word at weight 500) — it had
simply never reached the shared component `ShapeStateBody` renders through.
The two-button action row needed no fix: `ScreenRegister`'s `action` slot is
already a `flex flex-wrap` row, so a Retry and a secondary Copy both fit one
`action` node exactly as a single button does — the 27 call sites passing
only one plain button is a call-site choice in the other repo, not a kit
limitation, and is not this repo's to fix.

Added `eyebrow` to `ScreenRegisterProps`, transcribed straight off
`form.tsx`'s own recipe, with the poppy dot scoped to `tone="error"` only
(the other three registers get an eyebrow with no dot, matching chapter
21). Added `errorEyebrow` to `ShapeStateCopy` (default "Load failed",
matching `form.tsx`'s own default for the identical register), wired into
`ShapeStateBody`'s call to `ScreenRegister`.

Verified in `verify/state-error/`, rendering `ShapeStateBody` at
`state="error"` inside a `--surface-panel` card with a Retry + "Copy error
code" action pair. Screenshot shows the dot, the "LOAD FAILED" eyebrow, the
bold title, the description and both buttons side by side, matching the
reference. Read back the dot's own computed `background-color`:
`rgb(233, 74, 50)` — exactly `--kw-poppy` / `#E94A32`.

## v1.2.20 — 2026-09-02

### Changed — Filter and Sort brought to the toolbar's one pill, matching `ViewSwitch` exactly

Client, verbatim: "all the components in toolbar (the sort, the filter, the
view) i want them in the same pill aspect exactly. match filter and sort to
the existing view selector component (i am happy with how that is)."
`ViewSwitch` was the reference: `--control-height-button` (40) tall,
`--btn-secondary-fill` solid with no hairline, `--btn-secondary-hover` on
hover, weight 500 — `select.tsx`'s trigger, overridden exactly that way.
Measured against it, `FilterBar`'s chips and `SortControl`'s field were both
off, in different ways.

`FilterBar`'s three toolbar-row pills (`filterChipVariants` — an applied
facet chip and the "Clear filters" control it's shared with — and `CHIP_ADD`,
the "+ filter" idle affordance) all took `--control-height-pill` (26, `.kw-
chip`'s own drawn height, right for a chip inside a facet's results but short
for this row) and `--surface-raised` for their fill — a token that happens to
equal `--btn-secondary-fill` in light mode only, and visibly splits from it in
dark. `CHIP_ADD` also carried "the one bordered control in the system": a
dashed `1px dashed var(--hair-strong)` outline, ch26's drawn "not yet set"
cue. The client's ruling is explicit that this dash goes too. All three now
take `--control-height-button`, `--btn-secondary-fill`, `--btn-secondary-
label`, and `CHIP_ADD` gains `--btn-secondary-hover` on hover and drops its
border entirely.

`SortControl`'s field (`fieldVariants`) was already the right height, but
still wore `select.tsx`'s CH09 field skin wholesale: `bg-background`, a
resting `--hair-strong` hairline, weight 300, no hover — correct for a lone
select, and a visibly different pill from `ViewSwitch` standing next to it.
It now overrides the same four properties `ViewSwitch` does. The direction
button fused to it (`directionVariants`, the 2 Sep fusion) mirrored the
field's OLD skin to draw one continuous hairline across both halves; mirroring
that same skin now that the field has moved would have put the hairline back
on one side of a chip built specifically to erase it, so the direction half
was brought to the same `--btn-secondary-fill`/`shadow-none`/`--btn-secondary-
hover` skin instead of a bare hairline mirror. Its own active-press nudge and
focus-visible ink shadow are untouched.

`RangeFacet` and `SearchableFacet` draw no toolbar-row pills of their own —
their fields and search pill live inside a facet's popover, not the bar —
and are unchanged.

Verified in `verify/toolbar-pills/`: Search, Filter (idle and one facet
picked), the fused Sort chip and `ViewSwitch` rendered on the real toolbar
ground (`collectionPanelVariants`'s panel, not a generic `.bg-surface-panel`),
in both palettes. Computed `height`/`background-color`/`box-shadow` now read
identical across all five controls in both light and dark; before this
change they matched only by light-mode coincidence.

## v1.2.19 — 2026-09-02

### Added — three more client rulings on the rail and on tabs: the member chip's fill, weight as a third nav signal, and hover-weight on tab labels

Three follow-ups to v1.2.18, same review.

**The rail's member chip is black in dark mode, and always black on mango.**
Verbatim: the foot chip's fill should be black whenever the app is in dark
mode (any spine) or whenever the spine is mango (either palette); light-paper
and light-ink are unchanged. `MemberChip`'s `shell` read `--spine-chip-fill`,
which also re-binds `--btn-secondary-fill` / `--pill-fill` for anything else a
route renders inside the rail column (`screen-shell.tsx`'s `RAIL_COLUMN`), so
repointing it would have blackened controls the client never saw. Two new
tokens instead, read only by the chip: `--spine-member-fill` (paper and ink
keep today's chip in light, both go to `--kw-charcoal` in dark; mango is
`--kw-charcoal` unconditionally, needing no dark half — same law as the rest
of tokens.css §7b) and `--spine-member-ink` (reuses `--spine-ink` on paper and
ink, since that was already the right value against both the old fill and the
new black one; mango gets its own `--kw-off-beige`, because on mango the
chip's fill just became the same charcoal the name text already was, and the
text has to invert rather than vanish against its own background). Two new
helper variables, `--spine-paper-member-fill` / `--spine-ink-member-fill`,
carry the light/dark split alongside the four existing ones in §4.

### Changed — font-weight is now a third, explicit signal on the rail's nav rows

Alongside fill and colour, an inactive row now hovers to `--font-weight-
medium` — `ACTIVE_TREATMENT`'s own weight, the heaviest this face ships,
`--font-weight-semibold`/`bold`/`extrabold` all alias to the same 500 — with
NO `--spine-active-fill` wash added: "the pill is earned by being current, not
by being pointed at." Resting weight (`--font-weight-light`, 300) is unchanged
in value but is now named on `ROW_IDLE` instead of merely inherited from the
body default, so it survives a rail rendered somewhere that default doesn't
reach. `rail.tsx` only; the collapsible toggle shares `ROW_IDLE` and picks up
the same hover for free.

### Changed — an inactive tab's hover previews the active weight, in both variants

`components/tabs/tabs.tsx`'s `TRIGGER_SKIN.line` and `.folder` each gain one
line, `enabled:hover:font-[var(--font-weight-medium)]`, beside the existing
`enabled:hover:text-foreground` — which is untouched, per the client's
explicit instruction that colour does not move. A no-op on an already-active
trigger (already at that weight, unconditionally), so neither needs a
`data-[state=inactive]` guard.

## v1.2.18 — 2026-09-02

### Fixed — the rail's idle nav text was gray on every spine; the client wants full ink, always

Live against all six spine × theme combinations, the client's verdict was
verbatim: "nav text should ALWAYS be either pure black or pure white — never
gray — depending on what it sits on." `rail.tsx`'s `ROW_IDLE` was reading
`--spine-ink-quiet`, D5 = C's deliberate muted resting tier (26.01's ghost,
darkening to full on hover) — correct for the hierarchy ruling it implements,
but not what this client instruction asks for on this component. The idle
label now reads `--spine-ink` outright, the same full-contrast token the row
used to darken TO on hover (so the hover rule is gone, not redundant-but-kept):
charcoal on mango and on paper-in-light, off-beige on ink and on
paper-in-dark, at rest and unconditionally. The mango spine's own resting
colour does not visibly change — D3/D5 already pin its quiet ink to
`--ink-on-accent`, so `--spine-ink-quiet` and `--spine-ink` were already the
same value there — which is why her mango findings read as already-correct
once this was checked live. Scoped to the destination label alone:
`--spine-ink-quiet` itself is untouched in `tokens.css`, so the group heading
and the idle count badge — neither of them "nav text" — keep the quiet tier
exactly as D5 = C drew it. The active row's own ink (`--spine-active-ink`)
was not touched; it was never the complaint. Separately, the reported
dark-mode-mango logo defect (the mark must always be the black cut on any
mango ground, per `brand.tsx`'s own law) could not be reproduced against this
repo's current `rail.tsx` → `brand.tsx` path — `markField` already resolves
mango to `"brand"` in both palettes, `BrandArtwork` renders only the black
`<img>` for that field with no dark-mode class applied to it, and a repo-wide
search turned up no second render path and no CSS filter or recolour
targeting `[data-slot="brand-cut"]`. Verified correct, live, in all six
combinations at `verify/spine-colors/`; left alone rather than "fixed" with
no defect to point at.

## v1.2.17 — 2026-09-02

### Changed — `SortControl`'s field and direction button fuse into one chip

The client's reference artifact draws the sort control as one seamless chip;
the built control drew the field's own full pill beside a borderless
direction glyph, separated by a gap — two boxes, not one, and the artifact
was explicit that this reads wrong. Both halves now draw the SAME resting/
disabled/read-only hairline (`select.tsx`'s own convention, not restated
elsewhere) right up to where they meet, and each squares off only its
shared inner corner (`fieldVariants`'s new `fused` variant, on when
`showDirection` is true) — two 1px inset shadows on the same line read as
one border, with no wrapper duplicating `select.tsx`'s state logic and no
change to `showDirection: false`'s field-alone shape. The two remain
separately focusable and clickable (WCAG's two-hit-target reasoning this
file already documents is unchanged) — only the seam between them is gone.

## v1.2.15 — 2026-09-01

Five UI-level decisions the client confirmed against live `kwapso_system`
screens the night of 2026-08-31, re-imported here rather than left as the
app's own CSS overrides — see GAPS-RULINGS.md R-4 for the full record,
including which of these are bug fixes against this kit's OWN pre-existing
rules and which are genuinely new decisions made that night. Both kinds are
covered below; neither is unauthorized drift.

### Fixed — a folder tab's count was a `Badge` a second time, and a line tab's was a `Badge` a first time

`screen-renderer.tsx` put a `<Badge count={…} />` inside every folder-variant
tab, which is the exact defect override 45 had already fixed once elsewhere
(`collection-frame.tsx`) — ch14's "counts are quiet, never badges" was never
swept into this file. `record-detail.tsx`'s line-variant tabs had the same
`Badge`, which CH27's own "underline strip with a quiet count" forbids too.
Both now go through one new component, `TabsCount` (`components/tabs/tabs.tsx`),
so the shape lives in one place instead of three.

### Added — an active line-variant tab's count is a small mango circle, by ruling

The client's new decision, on top of the fix above: `line`'s count stays quiet
at rest, and on the ACTIVE tab only, becomes a small fully circular mango fill
with primary-ink text (`TabsCount`, same file). `folder`'s count is unchanged
by this — ch14's law was never in question, only whether the build kept it.

### Verified — the rail's active-item pill is already a deliberate, named shape

No code change. `compositions/templates/rail.tsx`'s collapsed active item
already reads `rounded-pill` (999px) by the kit's own name, not an accidental
clamp of radius and row height; its expanded active row is deliberately
SQUARE, per an existing 2026-08-24 ruling (KWAPSO-SPEC.md row 55) that reversed
an earlier pill build on the client's own screenshots. Checked and left alone.

### Added — Badge's quiet fill gets a documented, non-border fallback for an ambient ground

`badge.tsx`'s `secondary` fill is now `bg-[var(--badge-quiet-fill,
var(--surface-quiet))]` rather than a bare token — every existing call site is
pixel-identical — so a caller whose badge sits on `--muted` (measured at 1.175
contrast in dark, worse than the already-exempted panel case in
GAPS-CONTRAST.md) can rebind one custom property to a darker quiet tone. A
fill shift only, never a border or a shadow, matching this kit's law
throughout.

### Added — a hairline divider between a rail's named sections

`compositions/templates/rail.tsx` groups now separate with a thin inset-shadow
hairline (never before the first group), reading a new spine-aware token,
`--spine-hair` (`foundations/tokens/tokens.css` §7b) — one value per rail
spine, following the same "the mango spine never flips with the palette" law
`--spine-active-hover` already states in the same block.

### Not changed — no floating rail collapse toggle exists in this kit

Checked and confirmed there is nothing to fix or document: this kit's collapse
control is an in-flow row at the foot of the rail's own column
(`data-slot="rail-collapse"`), per KWAPSO-SPEC.md line 4316, not a floating
control overlapping the rail's edge.

## v1.2.14 — 2026-08-31

### Added — `AgentChat onAttach`/`attachLabel`, and a per-turn `eyebrow`

Two gaps a consuming app logged rather than worked around by hand-editing the
vendored copy (Brimba's `agent-panel.tsx`, ITEM 4 and ITEM 7, 31 Aug – 1 Sep
2026): the composer had no attach slot, and a turn had no field for anything
drawn ABOVE the bubble, on the panel's own ground.

`TicketThread` already carries both shapes, for the same composition
(ch27.10 — "the assistant… [is] the same composition with a different header
and a different participant list"): `onAttach`/`attachLabel` draw a real
paperclip button inside the composer's own pill, left of the field; its
author/authorMeta/time row draws outside the bubble, above it. `AgentChat`
had neither, so a caller reaching for either had to lay a control outside
the composer's own row by hand, or squeeze a timestamp inside the bubble's
own padding via a negative margin escape hatch.

Both are mirrored onto `AgentChat`, not re-invented: `onAttach`/`attachLabel`
render the identical control `TicketThread` does (absent by default — a
caller with nothing to attach gets the unchanged composer), and `eyebrow`
takes the author/time row's visual register (tertiary ink, the micro step,
tabular figures) as a single node per turn, since a two-party assistant
conversation has no second author field to draw — the sighted counterpart to
the `sr-only` role name already beside it, not a second one.

Not carried over: `TicketThread`'s `hidden sm:inline-flex` on its attach
button, which exists because that thread can fall back to a per-message
attachment list on a narrow screen. `AgentChat` has no such fallback, so its
attach control stays in the row at every width.

## v1.2.13 — 2026-08-31

Three, from three lanes, batched so a consuming app syncs once. Two are the
same shape: a rule the file's own words make CONDITIONAL, drawn
unconditionally.

**v1.2.12 IS A DUD — DO NOT SYNC IT.** It points at the same commit as v1.2.11
and carries nothing of its own. I created it by accident: a malformed shell
heredoc executed the tag command before the commit existed, and it reached the
remote before I caught it. It is left in place rather than deleted, because
deleting a pushed tag on a shared remote is destructive and other lanes watch
this repository. Syncing it is harmless — you get v1.2.11 — but you get none of
the three changes below.

### Fixed — the upload zone opened the file picker for a caller's own controls

The dashed zone carries `onClick={open}` and `hint` renders INSIDE it, so an
anchor or a button passed to `hint` fired the OS file picker as well as doing
its own job, and the caller could not prevent it because the caller does not own
the zone. THIS FILE ALREADY KNEW: its own Browse button calls
`event.stopPropagation()` before `open()` for exactly this reason. The courtesy
was never extended to a consumer's controls. A click that landed on a control is
now that control's click, which also stops the hidden input's own programmatic
`click()` bubbling back and re-entering `open()`.

### Fixed — `CardHeader` drew its under-hairline with nothing beneath it

Its own sentence says it "carries the hairline that separates it from the BODY";
chapter 13's caption, transcribed at the top of the same file, is "header, body,
and footer are hairline-separated inside one 24px shell"; the file's own law
restates it as "one shell, TWO hairlines". All three presume a region on the
other side of the line.

It drew unconditionally. A header-only card is a shape THIS KIT DEMONSTRATES —
four of the seven card specimens in its own demo have a header and no content —
so the kit drew a separator against nothing in more than half its own examples.
Measured by a consuming app on real data: where a row of cards stretches to its
tallest member and a title wraps to two lines, the rule lands 0px from the
card's own bottom edge, reading as a second border in a lighter tone.

`:not(:last-child)` is the whole fix — no prop, no value, no colour, no caller
change. A header followed by a body OR a footer still draws it.

### Added — `ImportWizard uploadAside`

A node beneath the zone and OUTSIDE `FileUpload`, for what a reader needs beside
choosing a file rather than as part of it. Not a workaround for the click bug
above: `hint` renders as a `<p>`, so a list or a table inside it is invalid
markup and the browser builds a different tree than the caller wrote; and
anything inside the dashed target reads as part of the drop area. Both hold
whatever the zone does about clicks. `undefined` renders the same single element
as before.

## v1.2.10 — 2026-08-31

### Fixed — `ArticleBody` advertised `dangerouslySetInnerHTML` and refused it

The interface extends the div props, so it has always ADVERTISED the prop; the
render writes its own children, so React refused the combination outright —
*"Can only set one of `children` or `props.dangerouslySetInnerHTML`"*. Same
fault `Stopwatch` carried at v1.2.7 with `children`: a type accepting what the
implementation cannot deliver.

It matters more here. The kit's own Notes editor emits HTML, so a body that
arrives as a string is the ORDINARY case for user-authored prose — and the
workaround a consumer is forced into, wrapping the string in one div, silently
kills the vertical rhythm, because every rule that spaces this prose is a
DIRECT-child selector (`[&>*+*]`, `[&>*+:is(h2,h3)]`…). Measured: a wrapped
render leaves exactly one element under the root for them to act on.

When a caller injects, the root now takes the HTML and draws nothing of its own.
No class, no colour and no spacing is added — the prose treatment, the measure
and the size are the same variants the normal path resolves — and the branch is
not entered unless the prop is actually present, so no existing caller moves.

### Logged — a non-editorial quote register (manifest.json → notDelivered)

`ArticleBody` draws every `blockquote` as ruling 13's pull-quote, one per page
by editorial rule, with no second register and no opt-out. The law-book does not
rule on quotes at all. A quoted reply inside a ticket or a meeting note — several
per page, none editorial — has no answer, and inventing one would be a guess that
looks like law. Logged with a recommendation so it can be closed in one edit.

## v1.2.9 — 2026-08-29

### Fixed — `media={null}` never drew the single column its own doc promised

`media`'s prop doc says, verbatim: *"Pass a node to override, or `null` to draw
a single column."* Both auth frames wrote `md:grid-cols-2` unconditionally, so
`null` removed the photograph and left a two-column grid with one empty column.
Measured at 1710 on the consuming app's live sign-in: content 840 wide at x=0,
870px of nothing beside it, every word pinned to the left half.

`SignIn` (templates) and `AuthShell` (screens) both carried it; the second is
shared by sign-in, invite-acceptance, link-sent and session-expired.

### Fixed — `SignIn` had no page inset, so its content sat flush to the window

`AuthShell` states the auth page inset in words — *"the page inset steps
24 → 32"*, ch05's "24–32px card inset" range — and draws it.
`SignIn` drew none. Measured: at 1710 WITH a photograph the title's right edge
was 0px from the window, and on a 390 phone it touched both edges. Independent
of the media bug, and true before it. `SignIn` now uses its sibling's tokens and
breakpoint rather than a number invented for it.

**This changes the with-photograph render**, which is stated rather than
buried: the shell gains its inset, so at 1710 the columns go 840/840 → 810/810
and the content's right margin 0 → 30. The column COUNT, the breakpoint and the
content's start (x=870) are unchanged. No call site in either front door passes
`media`, so nothing in the consuming app moves.

### Note — the same shape, three times in one day

The single column was DOCUMENTED and not enforced. So was PATTERN.md §10's
`@source` advice, which asked every consumer to remember. So was
`AccessDeniedScreen`'s empty register, which its own default made unreachable.
A sentence in a doc is not a mechanism.

## v1.2.8 — 2026-08-29

### Docs — PATTERN.md §10 records that the kit now ships its own exclusion

§10 already described this exact bug and prescribed `source(none)`. It was
right and it was not enough: it asked every CONSUMER to remember, and a
consumer writing plain `@import "tailwindcss"` inherits Tailwind's automatic
walk regardless. Since v1.2.5 `tokens.css` scans code rather than directories
and carries `@source not` for markdown, so the exclusion travels with the thing
it describes. §10 now says so, and records the half no exclusion can reach —
three SOURCE COMMENTS that named a forbidden radius in order to forbid it, and
emitted it, fixed in v1.2.6 by describing rather than spelling.

### Docs — PATTERN.md §12, on checking the claims this document makes

Nine wrong answers in one day from probes that all looked like they worked, two
of which reached other people. Run the canary first; build it from the hardest
instance rather than the simplest; distrust any bound the moment a probe reports
nothing; plant a sentinel when a count cannot name its source. The worst failure
is the confident all-clear, because a wrong finding argues with the code and
dies, and a wrong all-clear agrees with everybody.

No component, token or behaviour changed.

## v1.2.7 — 2026-08-29

### Fixed — `Stopwatch` advertised `children` and threw them away

`StopwatchProps` extends the div props, so the TYPE said children were
accepted; the render writes its own explicit JSX children, and explicit
children beat a spread, so anything a caller passed was discarded in silence.
`children` is now omitted from the interface: the type tells the truth.

### Added — `Stopwatch leading`, because a second clock makes the first ambiguous

One stopwatch needs no name. Two running at once are two durations and nothing
else, and a name in a `title` tooltip is invisible on a phone. There was
nowhere to put the name, so the consuming app hand-drew a near-identical pill
beside this one — a duplicated component, which is what makes this a gap
rather than a preference.

`leading` is a PLACEMENT, not a drawing: nothing styles the node, the same way
`ScreenShell` places a rail and `CollectionFrame` places a toolbar. The pill's
fill, radius, glyph and disc are untouched, and `undefined` renders nothing at
all — not an empty wrapper. The three default renders (plain, readOnly,
disabled) were captured through the consuming app's React before and after and
are BYTE-IDENTICAL.

## v1.2.6 — 2026-08-29

### Fixed — three comments that compiled the class they forbid

The last of v1.2.4/v1.2.5's tail, and the sharpest form of it. Tailwind scans
every file it is pointed at, source and prose alike, and it cannot tell an
explanation from an intention. So `components/card/card.tsx` saying *there is
no fifth radius and X is re-pointed at 24, so it is never reached* — and two
comments in `tokens.css` doing the same — **emitted X**, which after v1.2.5
was the only thing left in a consuming app's whole build asking for a third
box radius. Measured in the kwapso app's real stylesheet, both doors.

All three now DESCRIBE the step instead of spelling it, with the reason
recorded at card.tsx's header so the next person does not undo it. Nothing
about any radius changed; the value was always 24.

## v1.2.5 — 2026-08-29

Five bugs, no design. Every one found by RUNNING the kit under the consuming
app's toolchain (Next + jsdom) rather than by reading it — which is the one
toolchain this repository's own `tsc` and Vite build cannot see.

### Fixed — the shipped `@source` scanned PROSE, and compiled it

`foundations/tokens/tokens.css` named three bare DIRECTORIES. Tailwind's own
file walk reads markdown, so `components/PATTERN.md` — the law-book, which
quotes class names in order to FORBID them — was compiled into every
consumer's stylesheet. Two of the results are not valid CSS:

    .text-\[length\:var\(--text-\*\)\] { font-size: var(--text-*) }
    .hover\:bg-\[…\]:hover              { background-color: … }

The first is a parse error reported on every build of both kwapso front
doors ("Unexpected token Delim('*')"). Beside them came `rounded-sm`, `-md`,
`-xl` and `-2xl` — the four box radii PATTERN.md exists to forbid and the
app's own R31 forbids again — emitted because the law-book names them.

The globs now say `**/*.{ts,tsx}`, which is what `demo/demo.css`,
`mini-app/mini.css` and `verify/entry.css` have said all along; the shipped
scan was the only one that did not. Measured with `source(none)` so nothing
else could be the cause: the directory form emits **71 lines the code form
does not, and the code form emits nothing the directory form does not.** A
strict subtraction of prose.

**And the globs were only half of it, which is why v1.2.5 exists.** A
consumer that writes `@import "tailwindcss"` WITHOUT `source(none)` also gets
Tailwind's automatic content walk — the consumer's own, rooted at their
project, reading markdown, reaching this vendored kit whatever the globs say.
Measured: tightening the globs cleaned a `source(none)` build and changed
NOTHING in the kwapso app's real Next build, which reported the same parse
error. So `@source not "../../**/*.md"` states the exclusion where it cannot
be forgotten, one line covering every consumer either way — and THAT is what
made the warning go from the app's build.

### Fixed — `BrandRoute` threw in every consumer's test run

`compositions/screens/brand.tsx` called `window.matchMedia` bare. `typeof
window === "undefined"` does not catch jsdom, which HAS a window and, by
default, no `matchMedia` — so any unit test an application writes about its
brand screen died with "window.matchMedia is not a function". Two other
files here already guard the same call the same way
(`overlays/delete-confirmation`, `overlays/quick-view`); this was the odd
one out. A missing `matchMedia` now means no palette-change event, which the
MutationObserver and the sentinel poll beside it already cover.

### Fixed — `AccessDeniedScreen` had no way to say "there is nobody to ask"

The prop said `Undefined draws no grantor block at all` and state 7 said
`an invented name would be worse than none`, and neither was reachable:
`grantor` defaulted to the specimen, so an application that supplied none
shipped **"Member name · workspace owner" and support reference "4182-AC"**
to a real reader on a real denial. `grantor={null}` and `reference={null}`
are now the opt-out — the same shape `ScreenShell` uses for `rail`, and the
documented empty register is reachable for the first time. The default is
unchanged, so nothing that renders today moves.

### Fixed — ten user-visible strings no application could translate

A string written into a render is a string that ships in English to somebody
who chose another language, on a screen that looks finished. Three screens
had one, and in every case every NEIGHBOURING string was already a prop —
they were missed, not decided:

* `LoginRoute` wrote `emailLabel="Work email"`, byte-for-byte `SignIn`'s own
  default for the same prop, so the literal added nothing and cost the route
  the prop. `emailLabel`, `emailHelp`, `codeLabel`, `backLabel` and
  `resendLabel` are now forwarded — the same four its portal sibling,
  `PortalLoginRoute`, has exposed through `labels` all along.
* `HomeRoute` wrote `countLabel`, `searchLabel` and `bodyLabel`. All three
  are ACCESSIBLE names, so the cost fell on the one reader who cannot see
  the screen.
* `OnboardingRoute` wrote ten: five `<Field label>`s, two help lines, a
  select placeholder and the appearance badge three times. They arrive as
  `fieldLabels`, a partial over `OnboardingFieldLabels`.

Every default is the word that shipped, and the eight affected default
renders were proved **byte-identical** before and after under the app's own
React.

### Fixed — `QuickView` logged a Radix warning into every console

The one of five dialog overlays with neither a `DialogDescription` nor an
explicit `aria-describedby={undefined}`. A peek has no summary line above
its facts, so the honest half of Radix's contract is the one taken rather
than inventing a sentence to quieten a log.

## Unreleased — 2026-08-26

**controls/ and structures/ merge into components/.** Client ruling,
verbatim: *"i still don't understand the difference between controls /
structures. please merge them, and rename to components."* The second
folder restructure in one day, and the one that changes a consuming app's
import prefix count from two down to one.

### Changed — one flat `components/`, not two tiers

67 control folders and 42 structure folders become 108 under one
`components/` — no `components/controls/` or `components/structures/`
subfolder, per the client's explicit "not even as a subfolder split." Every
folder moved with `git mv`, so `git log --follow` still works across the
second rename this repo's had today. **README.md carries the new import
table**, appended after the 2026-08-24 one rather than overwriting it.

### Removed — `PortalConversation`, deleted outright

Client ruling, verbatim: *"delete portal conversation."* Checked every real
call site first: `PortalConversation` and `PortalApprovalBand` had exactly
one consumer in the whole repository — a demo gallery specimen — and no
composition (template, screen, overlay or state) ever imported either
export. Deleted cleanly; nothing functional depended on it. `components/`
is 108 rather than 109 as a result.

### Fixed — the recurring `@source` failure, a third time

Same class of bug as 2026-08-24's restructure and D10-B before it: a moved
source folder compiles to zero classes while `tsc` and both builds stay
green, because Tailwind treats a missing `@source` as a smaller stylesheet,
not an error. `demo/demo.css`, `mini-app/mini.css` and eight `verify/`
harness stylesheets all still read `../controls/**` and `../structures/**`.
Fixed, and two of them had picked up a genuinely duplicated `../components/
**` line from a blind find-replace during the same pass — deduped, not
just renamed. Proved with a sentinel class, built, grepped the compiled
CSS, confirmed, removed.

### Fixed — map's chapter table still said "primitive"

Client ruling, verbatim: *"about structures - map is a collection view.
recategorize."* The component itself had been a structure since
2026-08-24; what was still wrong was `demo/artifact.ts`'s internal chapter
lookup (`map` was keyed in `PRIMITIVE_CHAPTERS`, with a comment asserting
it "is the one view that is NOT in this folder: it is a primitive"),
`docs/ARTIFACT-MAP.md`'s chapter-21 and 27.29 rows (`controls/map/`, never
updated after the 2026-08-24 move), and a missing `tier="structures"` on
the Map `<Section>` in `demo/collections/views-h-q.tsx` — the one section
in that file that didn't say so, which is why the demo rail filed it under
"— UNFILED" instead of "19 · Collection views." All four corrected.

### Changed — demo nav, three words now

`foundations · controls · structures · compositions` → `foundations ·
components · compositions`. The "Controls" and "Structures" bands merge
into one "Components" band; the rail still runs the two former tiers as
separate chapter-grouped sections (08–16, then 17–23) under that one view.
Also shortened all four `VIEW_META` captions to one line each — a client
screenshot of the Compositions caption's full paragraph, always rendered
at the top of the page, came with the instruction "remove this or put it
somewhere else. the goal is to have a slimmer top nav"; applied to all
four rather than singling one out, since all four were the same shape. The
fuller history lives in README.md's Layout section.

### Fixed — the folder tab's active fill and its own panel finally agree

Client, verbatim: *"very important: fix the folder tabs! the active needs
to be the same color as the container (white). all disabled have the same
color. and more! we have already reviewed folder tabs multiple times!
review your own work."* Read the whole history first, because this exact
component has three WITHDRAWN overrides behind it (30, 38, 39, all gone
with 2026-08-23's K1 reversal) and the register is explicit that the active
tab and its panel are BOTH soft paper `#F7F2EB` (`#1C1B18` dark) — not
white. So the question was never "does the client want white now" (a
fourth flip on the same ruling); it was whether the build actually renders
the register's own answer. It does not, in exactly one place.

**The bug, measured on the client's own specimen** (`demo/sections/t-z.tsx`'s
`Tabs variant="folder"` — Overview / Details / Disabled, the same three
tabs the screenshot shows): the active tab's fill is `--kw-folder-live`,
resolved straight to `--surface-panel` on the `Tabs` root (TAB-C1), and it
was already correct everywhere — `#F7F2EB` light, `#1C1B18` dark, standalone
or inside `CollectionFrame`. `TabsContent`'s own panel, on the same variant,
painted `bg-card` instead — and `--card` is the kit's OFF-BEIGE page tone
(`--kw-off-beige` `#FFFEF9` / `--kw-unlit-raised` `#26241F`), not the panel
tone, *unless* a caller separately rebinds `--card` to `--surface-panel`.
`collection-frame.tsx` does exactly that rebinding for its own internal
strip — which is why the mismatch never showed up there — but a bare
`<Tabs variant="folder">`, exactly what the demo specimen and the client's
screenshot both are, gets no such rebinding, so the panel measured one
whole paper lighter than the tab sitting on it: `#FFFEF9` vs `#F7F2EB`
(1.081 apart) light, `#26241F` vs `#1C1B18` (1.238 apart) dark. THAT is the
seam the client is seeing, and their read of it — "the active needs to
match the container" — is correct; it is simply the CONTAINER that was
wrong, not the tab. **Fix (TAB-C2, `components/tabs/tabs.tsx`):**
`TabsContent`'s folder skin now paints `bg-[var(--kw-folder-live)]` — the
identical property the active shape already reads — instead of `bg-card`,
so the panel and the active tab share one value in every container by
construction, and nothing needs a rebinding to agree twice.

**"All disabled have the same color" — checked, and it already was.**
Measured the disabled tab standalone and inside `CollectionFrame`, both
palettes: `#E2DDD4` light / `#2F2D28` dark in both places, because
`--btn-disabled-fill` is a fixed token the shape reads directly and never
depends on the surrounding `--card`/`--surface-panel` rebinding that caused
the panel bug above. No change needed there; logged so it is not
re-litigated as a fourth pass on this component. Measured live, both
palettes, standalone and inside `CollectionFrame`, before and after the fix.

## v1.0.7 — 2026-08-26

A patch off `v1.0.6`. One fix, found by watching a real reply stream.

### Fixed — the chat follows the words, not the flags

v1.0.6's follow was keyed on the message count and the streaming flag — but a
streaming reply GROWS its last message without changing either, so the effect
fired once and then watched 1,700px of answer walk below the fold (measured
live). A MutationObserver now follows growth, and only while the reader is
already near the foot — scrolling up mid-stream to re-read is respected, a
new turn still snaps down.

## v1.0.6 — 2026-08-26

A patch off `v1.0.5`; still none of the *Unreleased* restructure.

### Fixed — the agent chat fills its host, scrolls, and follows its foot

`agent-chat` was a plain flex column with no growing region and no internal
scroll. In a height-constrained host (the assistant slide-in hands it
`h-full`) everything huddled under the header — empty state and composer at
the top, a void beneath — and a long thread walked invisibly out of the panel
with no way to reach it. The owner's verdict from the screen: "the chat
function is completely broken."

The turns region now grows (`flex-1 min-h-0`) and scrolls, which is also what
pins the composer to the foot where a thumb expects it; the empty register
centres in the grown region; and the region follows its own newest words on a
new turn and while streaming. In the standalone auto-height card all of it is
inert — no free space, nothing to scroll, no surplus to follow.

## v1.0.5 — 2026-08-25

A patch off `v1.0.4`; still none of the *Unreleased* restructure.

### Added — `overDialog` on `SheetContent`

The layer model is right: a page drawer (55) sits under a dialog (60). But a
picker that opens a SEARCH SHEET from inside a dialog is not a page drawer —
it is an input surface anchored to a control, which is the 70 layer's whole
definition. Without a way to say so, a client picker's sheet opened BEHIND
the form asking for it on every phone: options visible in a sliver at the
screen's foot, nothing tappable (25 Aug 2026 — the same handset report that
found the Select, one surface later). `overDialog` lifts the scrim and the
panel to 70; dismissal already belonged to the topmost Radix layer.

## v1.0.4 — 2026-08-25

A patch off `v1.0.3`. Two measured fixes from a phone at 375, and like the
three before it this does NOT carry the restructure under *Unreleased*.

### Fixed — a tab never shrinks under its own words

In the scrolling strip the triggers are flex children, and flex shrinks them
to `min-width` BEFORE the strip overflows: every folder tab clamped to 144,
the icon overflowed the start padding to x=0 and the count ran into the
shoulder curve — read from the screen as "icons spilling out and badge
numbers cut off". `shrink-0` on both variants: a tab takes its content's
width, the STRIP scrolls.

### Fixed — the comment composer's pill has a boundary

`--surface-raised` in the dark palette sits one step off the panel, so the
inline composer's pill vanished: a reader saw a bare placeholder floating
over a dead Send and called the thread broken. The field was real; nothing
said so. The pill now carries the 20% hairline ring, the tier the thread's
own dividers already use.

## v1.0.3 — 2026-08-25

A patch off `v1.0.2`. Two changes to one structure, and like the two before it
this does NOT carry the restructure under *Unreleased*: an app pinned to the
v1.0.x line takes it without moving an import.

### Changed — the rejoin gathers every branch

`structures/flowchart/flowchart.tsx` drew a fork's rejoin as ONE elbow from
ONE branch (`continues`, "the first wins"). Read on a real process map, that
says only that branch carries on — the owner's exact reading: "if it's a join,
then both splits … should be drawn from all of them." The elbow is replaced by
a merge rail, the mirror of the fork above: every branch column drops a rail
down its own remaining height (so uneven branches meet the run cleanly), one
horizontal run spans the outer centres, one centre drop carries on to the
trunk. Marking ANY branch `continues` now draws the full merge; a fork whose
ways never meet again still marks none and draws nothing.

### Added — return lines for loops

A `FlowNode` may name `loopTo`: the id of an earlier node the work goes back
to. The chart draws it as a dashed 1px return line up the left margin in
ink-tertiary, one lane per loop so two never share a rail, with an arrowhead
where the work lands. Measured off the DOM after layout (the tree is DOM, so
the browser's geometry is the only honest one) and re-measured on resize. The
line is a cue, not a sentence — the words on the node stay the call site's.

## v1.0.2 — 2026-08-25

A patch off `v1.0.1`. One fix, and like v1.0.1 it does NOT carry the
restructure described under *Unreleased* below, so an app pinned to the v1.0.x
line can take it without moving a single import.

### Fixed — a Select inside a Dialog opened behind it

`controls/select/select.tsx` put its portalled list at `z-50`. The system's
layers are sheet 55, dialog and alert-dialog 60, then popover, dropdown-menu,
tooltip and hover-card at 70 — the four anchored surfaces that must clear a
dialog, because a dialog is where a form lives and a form is where you pick
things. Select was the only portalled surface left under that line.

Inside a dialog the list was painted behind the dialog it was opened from:
options visible, every click landing on the dialog in front. On a phone, where
the list fills most of the screen, the effect is a form whose pickers do not
work at all — reported from a handset with three dead pickers on one form.

Raised to `z-[70]`, which is the layer the kit already assigns to "anchored to
a control, must clear a dialog". `date-picker`'s panel also reads `z-50` and is
deliberately untouched: it is `absolute`, not portalled, so its number is scoped
to its own field rather than to the overlay stack.

## v1.0.1 — 2026-08-25

A patch off `v1.0.0`. It carries **one fix and nothing else** — in particular
it does NOT carry the restructure described under *Unreleased* below, so an app
pinned to `v1.0.0` can take it without moving a single import.

### Fixed — every chart was drawing its data and none of its furniture

`structures/chart/chart.tsx` built its grid, both axes, the zero line, the
tooltip and the legend inside a **fragment** and handed that to the recharts
chart. recharts does not read its children the way React renders them: it walks
them itself and drops anything whose `displayName` it cannot match. Its
fragment-descent line is guarded by `isFragment` from `react-is@18`, which
identifies an element by `Symbol.for("react.element")` — and React 19 stamps
`Symbol.for("react.transitional.element")`. So the guard answered false for
every fragment, and everything inside it was discarded without a warning.

The bars drew. Nothing else did. On every chart, in every app on this kit.

The furniture is now an **array of keyed elements**, which
`React.Children.forEach` flattens before `isFragment` is ever consulted. No
other file in the kit renders recharts, so this is the whole of it — but the
rule it earns is general: **never hand a fragment to a recharts chart.**

## Unreleased — 2026-08-24

**The restructure.** The repository takes the four names the client uses, and
the example pages go. Nothing changed what it does; this is a move, a delete
and a relabel. Every move is a `git mv`, so all 113 renamed files keep their
history.

### The tree

```
foundations/  tokens/ · icons/ · motion/   (moved in under D10-B — see below)
controls/     67   was components/primitives/
structures/   42   was components/collections/
lib/          2    was components/lib/
compositions/
  templates/  15   was compositions/shapes/
  screens/    17   the client's named exceptions, and only those
  overlays/   8    new — what opens OVER a screen
  states/     5    new — the same screen with nothing in it
```

`components/`, `compositions/shapes/`, `compositions/system/` and
`compositions/portal/` no longer exist. **README.md carries the full import
rewrite table**; six rules cover the whole surface.

### Removed — 24 files, 11,731 lines

Sixteen collection routes, two detail routes and three screens (9,504 lines),
on the client's ruling: *"we only needed the 'template' for main / detail
screens! ... we don't need the actual pages (only exception home, settings,
external pages (sign in etc). those are screens."* Plus `system/process-map`
(the structure already existed twice as `flowchart` and `flowdetail`),
`screens/onboarding` (a second copy of a screen that also existed as a route)
and `screens/password-security` (its own subtitle: *"A Settings tab, not a
special place"*). Each is listed separately in its commit so any one can be
vetoed on its own.

### Changed — two exports, and only two

`NotificationsScreen` → **`Notifications`**, and `NotificationsScreenProps` →
`NotificationsProps`. The client ruled notifications a component; the PANEL
branch is what became the control and the `MainScreen` page branch was
deleted. **The full-page inbox is gone** — CH27.34 asks for both surfaces by
name, and the control's own header records what the override costs.

`map` moved from the controls to the structures and `portal-conversation`
from the templates to the structures. No export was renamed by either.

### Fixed — four things that were quietly wrong

- **Four templates had no demo section at all**: `screen-shell`,
  `main-screen`, `detail-screen`, `rail` — the first four the client's own
  structure names. `demo/shapes` asserted `EXPECTED_SHAPES = 12` against a
  folder of 16, so the guard passed. All four are drawn now.
- **The `brand` control was invisible**, for the same reason —
  `EXPECTED_PRIMITIVES = 66` against a folder of 67. It was missing from
  `manifest.json` too, along with `folder`.
- **Every count in the demo is now read from its folder.** The header printed
  *"66 primitives · 26 collections · 12 shapes · 29 routes"* against 67, 40,
  16 and 30. Not one number is typed in any more, and every registry reports
  a missing file AND a phantom section BY NAME. It worked on the first load:
  it named a composition I had left out of my own placement table.
- **`manifest.json` had 163 dead file paths.** Rebuilt against the real tree.

### The one that would have shipped broken

Tailwind's `@source` globs in `demo/demo.css`, `mini-app/mini.css` and
fifteen `verify/` harness stylesheets all still read `../components/**`. That
folder had just been renamed, so **Tailwind silently compiled no class that
appears only in `controls/` or `structures/`** — an `Avatar` marked `sm` drew
at 480px because `size-8` was never generated. `tsc` was clean. Both builds
were clean. A missing `@source` is not an error, it is a smaller stylesheet.
It was found by looking at the page, and nothing else would have found it.

### Found and deliberately not fixed

Both are behavioural, both predate this work, and both are written into the
header of the file that owns them.

- `structures/progress-dashboard` draws its value in a fixed 34px
  `flex-none` span that cannot shrink or wrap. `screens/portal-impact` passes
  whole sentences into it, so at 380 the row's right edge lands at 479 in a
  380 window. **`documentElement.scrollWidth` does not report this** — it was
  found by measuring each element's own right edge against the viewport.
- `controls/brand`'s `max-w-full` does not constrain a lockup centred in a
  `grid place-content-center`: the grid area is sized from the element's own
  max-content, so the constraint is circular. Splash, the system door and the
  portal boot screen each draw a 450px lockup in a 380 window.

### `foundations/` — ruled `D10-B` and built

`foundations/` **is** a folder now. The client ruled `D10-B` after seeing the
full cost drawn in `verify/decide-2.html` §D10, and `tokens/`, `icons/` and
`motion/` moved into it by `git mv`, history intact.

**The count was eighty, not thirteen.** Re-grepped rather than trusted: eighty
tracked files reach the three folders by relative path, across 107 reference
lines.

| group | n | how it fails if missed |
|---|---|---|
| Decision & index pages under `verify/` | 14 | **silently** — plain HTML, one `<link>` each |
| Verify harnesses | 11 | 10 Tailwind entry sheets + 1 `.tsx` |
| Kit source | 42 | 20 `controls/` · 11 `structures/` · 11 `compositions/`; `tsc` catches these |
| Demo & mini-app | 7 | loud |
| Docs & prose | 6 | stale text only |
| Named without a `../` | 5 | `package.json` · `tsconfig.json` · `manifest.json` · `README.md` · `vite.config.ts` |

**Two references that grep did not count, because they point OUT of the moved
folders rather than into them, and both broke on the move:**

- `foundations/tokens/tokens.css` reached `../assets/fonts/` for its three
  `@font-face` rules. Left alone this fails **silently in the worst way** —
  the fonts 404, the page renders in the fallback, and computed
  `font-family` still reads `"Saans"`, so the obvious assertion passes while
  the page is wrong. Now `../../assets/fonts/`.
- `foundations/icons/icon-base.tsx` reached `../lib/utils`. Now `../../`.

**Consuming apps.** There is no `exports` map and no path alias — the kit is
vendored source, so every path is literal. Two stylesheet imports and one
import specifier change; `README.md`'s import table carries the rows.

```css
@import "kwapso-design/foundations/tokens/tokens.css";
@import "kwapso-design/foundations/motion/motion.css";
```
```tsx
import { Pencil } from "kwapso-design/foundations/icons";
```

`controls/`, `structures/`, `compositions/` and `lib/` are untouched.

**The verification is the work, not the move.** All fourteen decision pages
were reopened in a browser and asserted styled — stylesheet count, computed
body `font-family` against the kit stack, and computed background against the
token colour — because a missing stylesheet is not an error in HTML and no
build, test or console would have told anyone.

All fourteen pass in both palettes, plus `verify/whats-left.html`, which a
sibling agent was writing while this move was in flight and which this move
broke. Each page resolves its stylesheet (25 rules from the external sheet),
computes `font-family: Saans, system-ui, …`, and paints
`rgb(255, 254, 249)` in light and `rgb(20, 19, 16)` in dark.

**The assertion was checked against a negative control**, because an assertion
that cannot fail proves nothing: `needs-you.html` was re-served with its link
reverted to the old `../tokens/tokens.css` and the same check reported
`font: "Times"`, `background: rgba(0, 0, 0, 0)` and `0` rules from the
external sheet — §D10's drawing, reproduced. The check has teeth.

`document.fonts.check('300 1rem Saans')` is part of the assertion, because the
font-url break is the one failure that `font-family` alone cannot see: the
computed value still reads `"Saans"` while the browser paints the fallback.
`/assets/fonts/Saans-Light.woff2` returns 200 and the face loads on every page.

Demo and mini app verified at 380 / 834 / 1440 in both palettes — twelve
combinations, all green, icons rendering in each.

**Three verify harnesses do not build, and did not before this move:**
`kit-f`, `rulings-c` and `track3c` import `demo/screens/wall`,
`compositions/screens/triage-sitting` and `compositions/screens/notifications`,
all deleted in the restructure above; `overflow` imports `OnboardingScreen`,
which was renamed `OnboardingRoute`. `rail`, `kit-bc` and `kit-de` build clean.
Left alone — stale harnesses are their own repair, not this one.

## v0.4.0 — 2026-08-22

**The rewrite.** Everything below v0.4.0 was a design *specification* — tokens,
rulings, prose, and CSS classes with plain-HTML specimen pages. It was correct
and it could not be installed, because the two apps are React component
libraries and a CSS class is not a React component.

This tag replaces it with **React + TypeScript source**. Commission steps 1–5.

The v0.1.0–v0.3.0 tags still resolve and their history is intact — this is a
merge, not a force-push. Their entries are kept below.

### Added

- **`tokens/`** — 234 tokens under the commission's own names with the kwapso
  kit's values. Both palettes, three text scales, one global focus rule.
  `build-tokens.mjs` guards drift between the two dark blocks, orphans, and px
  leaks; each guard verified by deliberately breaking it.
- **`icons/`** — 96 React exports (93 commissioned + `ChevronDown`,
  `ChevronUp`, `Star`, which primitives needed and the commission did not
  name). Five sizes, `currentColor`, lucide-compatible props.
  **Artwork is placeholder**; names, API and sizing are final, so swapping in
  real art is: replace `icons/<Name>.svg`, run the generator, done.
- **`motion/motion.css`** — 57 classes covering all 16 cases of section 10.
  Every duration and curve from a token; `prefers-reduced-motion` honoured.
- **`components/primitives/`** — all 65, 169 exports, every name spelled as the
  1,122 existing call sites expect.
- **`demo/`** — every component, every state, both themes, three scales.
- **`manifest.json`** — the contract. `renamedFrom` is empty by design.
- **`GAPS.md`** — every unresolved question and every ruling, with reasoning.

### Decided by looking at it, not by argument

Each of these was settled from a side-by-side page in `verify/`:

- An unqualified `<Badge>` is **quiet**, not mango — six mango chips in an
  eight-row list made the colour meaningless.
- Modal footers are **end-aligned, primary last**, departing from the kit
  drawing because 229 existing footers are written cancel-first.
- A dark modal sits on the **raised** tone; the kit's page tone made it the
  same colour as the page behind it.
- `ProgressToggle` keeps its 18×8 drawing and gains a **24×24 target**.
- A card's ground is **`--surface-panel`**, not `--background` — in light they
  are the same colour and cards were carried by shadow alone.
- `--warning` drops to the quiet chip (**provisional**, pending new colours).
- Forest lightened `#1F9259` → `#20955B` so the success chip clears AA at 4.61.

### Known limitations

- **Icon artwork is placeholder.** Client is supplying the real set.
- **`--chart-4` / `--chart-5` repeat 1 and 2** — a five-series chart shows two
  indistinguishable pairs.
- **RTL is not supported**, by decision. Components use logical properties
  throughout, so the door is open, but nothing has been rendered RTL.
- **Fonts not shipped** — Saans and SerrifCondensed are a licence question.
  Both are named first with a real fallback stack.
- 27 findings from the visual audit are in `GAPS-DEMO.md`.

### Not in this tag

The 26 collections, the compositions, and the four documents.

---

# Before v0.4.0 — the specification era

Kept for the record. Do not build from these; `tokens/tokens.css` in this tag
supersedes every token file below.


## v0.3.0 — 2026-08-21

**Foundations (build order step 2), orchestrated build.** First step under the
subagent structure: four builder agents (shell, iconography, focus, state
matrix), each verified independently against kit v10 by the controlling
session before assembly — token purity, palette flip, focus discipline,
verbatim fidelity (15/15 matrix cells, 10/10 focus strings, 30/30 glyphs),
snap logging.

### Added

- **`specimens/patterns.html`** — the second specimen page (chapters 4–23 as
  they get built), with the same theme/scale controls as the core page and
  fragment markers for the steps ahead.
- **Ch4 Iconography** — 4 sizes, the four colour states, all 30 glyphs
  rendered from `assets/icons/` via CSS mask so external SVGs take
  `currentColor` (commented as technique, not design law).
- **Ch6 Focus & keyboard** — all kit prose verbatim; one theme-following demo
  card (no hand-drawn dark twin, per "dark is a token flip").
- **Ch7 State matrix** — the 8-state × 4-treatment matrix and all 14
  Dos/Don'ts, verbatim.
- **`assets/`** — the kit's own icon set (30 filled + 7 outline), folder
  9-slice pieces, logos. Fonts and app-icons deliberately absent (licence
  question / not yet designed — see assets/README.md).

### Gaps logged (merged into GAPS.md build log)

Nine entries from the builders; two are kit contradictions needing a ruling:
the ch6 ring-shape sentences (own-radius vs always-a-pill — repo builds to
own-radius) and the ch7 disabled-ink cell (#5f5d59 vs the ink scale's
#a8a59f). No inventions — every unspecified value was logged, not guessed.

### Explicitly NOT in this tag

Tier 1 patterns (ch9–13, 20–23), folder shapes + ch15–18, the floating layer,
the 45 compositions (blocked on an archetype decision), and the written docs.

---

## v0.2.0 — 2026-08-21

**The corrections + kit-sync pass.** Brings the tokens and existing specimens
into line with kit **v10** (the kit moved v7→v10 across four exports on
2026-08-21; each was reconciled and snapshotted). This tag contains **no new
components** — it fixes what v0.1.0 shipped that the kit has since settled
differently, and it is honest about that scope.

### Corrected (the six)

1. **Type scale replaced wholesale** — the 13 steps of kit v9/v10
   (96/72/56/44/32/24/20/18/16/14/13/12/11) with per-step tracking and
   leading. The old 64/46/38 scale is gone; `--text-meta` (12.5) is deleted —
   12.5 is retired as a step. New names: `--text-badge` (12, ruling 02),
   `--text-micro` (11, eyebrows), `--text-body-s` (14), `--text-caption` (13).
2. **Radius: three tokens → four** (ruling 03, stated in full in v10):
   `--radius-card` 24 · `--radius-pill` 999 · `--radius-select` 6 (marks and
   selection controls) · **new `--radius-bar` 4** (bars, heat cells, decision
   nodes). Code-input cells move OFF the 6px exception — they are 24px boxes.
3. **Spacing replaced** with ruling 28's scale: `--space-1…11`
   (4/8/12/16/20/24/32/48/64/96/128) + half-steps `--space-1h…4h` (6/10/14/18).
   The 13-step carried-forward scale is gone; specimen references remapped
   (one snap logged in GAPS.md: 56px page-chrome padding → 48).
4. **Focus rings restored** (ruling 24, reversed): `--focus` #1A1918/#FFFEF9,
   `--focus-width` 2px, `--focus-offset` 2px, one shared `:focus-visible` rule
   in the specimen CSS. Every `outline: none` removed. Verified live: the rule
   resolves to `2px solid` at `2px` offset in both palettes.
5. **Dark hairlines corrected** to .08/.12/.24 (v0.1.0 guessed the light
   triple).
6. **Light raised corrected**: `--surface-raised` = `--card` over `--sheet`
   (#FFFEF9 on #F7F2EB). The old `#FAF9F7` is the kit's `--idle` (inactive
   tabs) and now ships under its right name, `--surface-idle`.

Also: control heights per ruling 28 (32/38/40/44/56), `--avatar-lg` 38→48 per
ruling 30, `exclusions.md` and `library-map.md` re-stated for the reversed
focus ruling and the four-radius law, and the specimen page's "no focus
states" warning replaced with the restored-ring note.

### Added

- **`tools/snapshot.py`** — kit-export versioning: gzips each export into
  `kit-current/.history/`, diffs against the previous one (chapter spans,
  counts, radius census), and raises explicit rule-3 alarms for lost chapters,
  rulings or compositions. Alarms verified against a deliberately damaged
  export. The `.history/` archive itself stays local; only the tool is
  versioned here.

### Gap status

GAP-1/2/3/5/6/7/11 closed (see GAPS.md for who closed what — mostly the kit
itself, v8–v10). GAP-4 (hairline roles), GAP-8 (body measure), GAP-9 (dark
hovers) and GAP-10 (paper-tone flip mechanism) remain open. One kit-side
caveat stands: ruling 28's spacing scale has 0 references in the kit's own
markup, so composition geometry will be transcribed-and-snapped, each snap
logged.

### Explicitly NOT in this tag — the build order ahead

2. Foundations the repo has never had: ch4 iconography, ch6 focus utility
   page, ch7 state matrix
3. Tier 1 completion: ch9–13, 20–23 (incl. record marks, stage hero)
4. Folder shapes (ch14), then ch15–18 (incl. pulse band)
5. The floating layer: assistant + timer (rulings 29/31/32)
6. Archetypes & compositions (12 present, 4 partial — transcribed with
   spacing snapped and logged)
7. `ruleset.md`, `contract.md`, `responsive.md`; `library-map.md` remains a
   stub pending `@kwapso/ui` token names

---

## v0.1.0 — 2026-08-20

First tag. Tokens and Tier 1 specimens, extracted from the Claude Design project
**"UI Kwapso System"** (`Kwapso UI Kit.dc.html`, v6 · 25 chapters · 27 rulings).

### Added

- **`tokens/tokens.css`** — 126 tokens, both palettes, rem-relative.
  - Dark implemented as a real mechanism, not documentation: light on bare
    `:root`, dark redefined under both `prefers-color-scheme` and
    `[data-theme="dark"]` so an explicit choice wins in either direction.
  - Three-step text scale (`data-scale`) moving the root to 13 / 15 / 17px.
  - Four-weight ink scale per rulings 25 + 27.
  - Button, status-pill and chart tokens derived from the semantic layer.
- **`tokens/build-tokens.py`** — generates `tokens.json` from `tokens.css` so
  the two cannot drift. Fails loudly if the two dark blocks stop matching, which
  is the bug that makes "system dark" and "I picked dark" render differently.
- **`tokens/tokens.json`** — generated. Carries `unresolved` flags through to
  machine-readable form.
- **`specimens/kwapso-ui.css`** + **`specimens/index.html`** — Tier 1 components
  written as real CSS consuming the tokens, with live theme and scale controls.
  Buttons, status pills, badges, fields, selection controls, cards, list items,
  tabs, skeletons, empty states.
- **`GAPS.md`** — 11 open gaps.
- **`exclusions.md`** — the canonical "never build" list.
- **`tokens/semantic-map.md`** — raw → semantic, with the reasoning.
- **`tokens/library-map.md`** — ★ stub. kwapso column filled, library column
  deliberately blank.

### Superseded

Two earlier token files are now stale and must not be built from:

- `_ds/…/colors_and_type.css` — 5-step ink, tertiary `#76746f`, micro 11px, and
  **no dark values at all**.
- `kwapso-tokens.css` (root) — v5, 23 rulings, values still marked `PROPOSED`
  for rulings 24–27.

Both predate the final rulings. The kit itself was correct; the token files had
not been regenerated since the rulings closed.

### Verified

- Every probed token changes between light and dark — no token silently shared.
- Root font-size and all component sizes track the scale control together.
- No px leaks in consuming CSS beyond the deliberate 1px press-drop and a 1px
  tab-border offset.
- The `build-tokens.py` drift guard fails with exit 1 on an injected mismatch.

### Known limitations

- **`library-map.md` is a stub.** Blocked on `@kwapso/ui` token names, which are
  not knowable from outside that library. A wrong crosswalk is worse than none —
  unmapped tokens are exactly where old styling survives a swap.
- **`archetypes/` is empty.** `get_file` caps at 256 KiB and the kit exceeds it,
  truncating mid-chapter 19. The 18 kwapso-native archetypes live in chapters
  20–25 and are unverified. They need a read by an uncapped route.
- **No fonts committed.** Saans and Serrif Condensed redistribution is a
  licensing question, not a technical one. The specimen page falls back to
  `system-ui`, which contradicts the kit's stated "no fallback stack" rule —
  a fallback is what makes the page reviewable before the fonts land.
- **`ruleset.md`, `contract.md`, `responsive.md` not written.** Priority 5 in the
  coverage checklist, after specimens.
- **Ruling 24 (no focus states) is implemented as specced.** Keyboard-only users
  cannot see focus on buttons, tabs, rows, chips or menu items. This is an
  explicit, twice-recorded kwapso decision and a deliberate departure from WCAG
  2.4.7. Text fields keep their focus cue — the ruling does not cover them.

### Needs a decision before v1.0.0

In rough order of blast radius:

1. **GAP-11** — are the kit's px figures authored at base 16 or base 15? Affects
   every measurement in the system.
2. **GAP-3** — the 9 spacing steps. The current scale is carried forward from a
   superseded file.
3. **GAP-10** — a mechanism for the card/page paper-tone flip. Changes how every
   component is written, so it should land before the specimens harden.
4. **GAP-9** — dark button hover direction and values.
5. **GAP-6** — dark shadows, or a ruling that dark expresses elevation through
   surface tone alone.
