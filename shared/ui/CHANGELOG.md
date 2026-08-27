# Changelog

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
