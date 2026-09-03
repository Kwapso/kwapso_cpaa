# RESKIN-REPORT.md

**What happened:** the component library was moved into this repo, the npm
dependency was deleted, and both front doors were re-themed to the kwapso design
kit (`design-mothership`).

**Branch:** `reskin`, 14 commits, 325 files, off `origin/main` at `7e06d92`.
**Date:** 2026-08-22. **State:** `npm run check` green (235 test files), both
apps building, both deployed to staging.

---

## The short version

The app used to *rent* its components: every button, table and dialog lived in
`@kwapso/ui`, a separate npm package installed from GitHub. A theme can repaint a
rented button; it cannot reshape one. The kit's secondary button is a filled
button in the other paper tone **with no border in any state**, and no
arrangement of token values turns a bordered button into that.

So the library was copied into `shared/ui/` and the package deleted. Stages 1–4
changed nothing anybody could see; stages 5–13 changed the look.

| | |
|---|---|
| Components now owned in-repo | 94 (65 primitives, 26 collections, the token tier) |
| Imports repointed | 592 across 158 files |
| Dependency | gone from all three `package.json`, from `node_modules`, and from the lockfile |
| Per-component focus rings deleted | 150, across 38 files, replaced by one rule |
| Off-vocabulary radii collapsed | 61 |
| `variant="outline"` call sites rewritten | 113 + 6 dynamic |
| Font weights collapsed to 300/500 | 59 |
| Hand-set `text-[9–11px]` sizes deleted | 54 |
| Off-scale spacing steps snapped | 17 |
| New guards added | 3 (`theme-tokens`, `focus-ring`, `design-scale`) |
| Law exemptions added | 2 · **deleted again** 1 |

---

## Stage by stage

### 1 · Vendor the code
Kwapso UI copied out of `node_modules/@kwapso/ui` into `shared/ui/`, folder
shape and relative imports untouched, so a diff against upstream stays readable
and the copy could not acquire a rewriting mistake. Its 33 dependencies moved to
the ROOT `package.json` at the exact pinned versions, because `shared/` is a
root-level directory outside both npm workspaces.

**The part that was not mechanical.** Three laws scan `shared/`, so landing 96
files in it turned the build red, and each had to say which side of the line this
code sits on:

- **R32 (closed palette) — HELD, no exemption.** The library named a Tailwind ramp in `container.tsx` and carried a dead `#14b8a6` fallback in `map.tsx`. Both FIXED, in components neither door renders, so R32 keeps its full reach. An exemption is the answer only when the alternative is worse.
- **R28 (catalogued strings) — out of scope, restating a position it already held.** `resolveImport` had always refused `@kwapso/ui` as "somebody else's code and not ours to translate". Vendoring changed the address, not what the code is. Reversing it would put ~150 library strings into the catalogue in English, and only `i18n-translate.mjs` turns those into German, which spends real money.
- **R31 (two radii) — out of scope, dated, self-deleting.** With a rot check asserting the directory still offended. **It collected at stage 10** (below).

### 2 · Repoint the imports
A scripted rewrite of the specifier — 592 imports, 158 files — matching only a
QUOTED specifier, so the twenty prose mentions were left alone by construction
rather than by luck.

**The risk here was the CSS, not the TypeScript.** The library's classes reach the
build through one line: `@source "./registry"` inside `styles.css`, resolved
relative to that file. Get it wrong and Tailwind silently strips every class it
believes unused — a green build and an unstyled app.

*Proved, in a way the still-installed package could not fake:* `rounded-t-2xl`
and `ss-typing` appear nowhere in `web/`, `web-portal/` or `shared/web/` — only in
`shared/ui/` — and both were in the built CSS.

### 3 · Drop the dependency
Removed from all three `package.json`, `node_modules` deleted and reinstalled
from scratch, `transpilePackages` gone from both `next.config.ts`. Both apps
build with the package absent, and the CSS came out **byte-identical** to the
previous commit (agency 80,335 · portal 72,499) — the strongest available
evidence that nothing about the rendering changed.

**The SHA is recorded and the version is not.** Three sources disagreed about
what was installed: `package.json` asked for `#v0.15.0`, the installed
`package.json` said `0.15.0`, and the lockfile's cached metadata said `0.11.0`.
The library's own README warns about exactly this. `shared/ui/README.md` records
`f679b456bca6571be97af43ba8a6846fa9b7291b`, which is what was actually on disk.

**The tests did not come, and could not have.** Upstream has 200+, including
XSS-sanitisation and link-scheme regressions, but its `files` list ends with
`"!**/*.test.*"` — the published package never contained them. Anything held only
by an upstream test is unguarded here now. **This is the largest thing the move
cost** and no amount of care during the copy could have prevented it.

Twenty comments and fifteen docs said the library was "a separate repo this one
never edits". Replaced rather than deleted: upstream is a live dependency of
other Kwapso products and is never edited, PR'd or synced back from here.

### 4 · The laws that named the library
Mostly already true, and checking that was the point. R2 and R3 stand on
`TabsView`, R4 on `form-shell` — none was ever at risk. Two checks read a PATH and
went red the moment `node_modules` was deleted (`type-mark-slots`, the
`table-header-sorts` seam guard); both repointed and both **proved to still bite**
by breaking what they guard.

R33's import ban turned out to be stronger than its own description: the law text
named `@kwapso/ui/registry/primitives/field/field`, but the check has always
matched the path TAIL `primitives/field/field`, so it kept biting through a move
to a completely different specifier. Only the prose was wrong, and it was wrong in
the direction that matters — a reader would have concluded the ban was scoped to a
package name.

### 5 · Fill the token map
Aurora shipped `library-map.md` as a deliberate stub, left blank rather than
guessed, because a wrongly mapped token "looks done while shipping the old
design". Filled from the code — 34 real tokens plus the six `brand.ts` injected —
and committed to `design/library-map.md` so it cannot drift.

**The four collisions:**

- **(a) `--accent` means opposite things.** The library's is a subtle tinted SURFACE (hovers, highlighted rows); the kit's is the brand mango. Resolved by NOT mapping the names to each other: the library's takes `--surface-panel` and goes on being a tint; the mango goes to `--primary`, already the brand-fill token. Mapping by name would have turned every hover in both apps bright yellow.
- **(b) `--warning` has no counterpart** and mango is banned as a status. The app means two things by it: "nothing moves until somebody outside answers" (which the code says in those words) and "work is happening". Mapped to `--info` (sky), because the kit defines info as "in review, awaiting an answer" — meaning one, word for word — and meaning one is the only place the colour tells a client to act. Meaning two is logged, not absorbed.
- **(c) Five chart series into three:** the cycle restarts, per the kit. `chart-4` → sky, `chart-5` → forest.
- **(d) Fourteen kit tokens had no counterpart.** Before vendoring that was a dead end; now it is a variable to add. All fourteen added and listed.

### 6 · The four gaps — decided
`GAPS.md` said "3 open" and listed four (GAP-10 was uncounted, and is the
largest). All four decided from the kit's own evidence, **pending Aurora's
review**. Three needed no new value: the kit had already built the answer and only
its prose disagreed.

| Gap | Decision | Why |
|---|---|---|
| **GAP-4** hairlines | **8%** (`--hair`) | The kit's own `.kw-card--hairline` — the one component whose job is same-tone separation — renders at 8%, and the 6% token is consumed nowhere in the kit at all. A weight with no consumer is a leftover, not an assignment. |
| **GAP-8** body measure | **62ch** | "Never exceeds sixty-eight characters" is a CEILING; 62 and 66 are values. 62 is the only one consistent with all three statements at once, and it is what `tokens.css` already ships. |
| **GAP-9** dark hovers | **The four shipped values stand** | The rule both modes obey is "a hover moves the fill AWAY from the page it sits on" — darker on a light fill, lighter on a dark one. The kit's own dark inverse button DARKENS on hover, so "lift on dark" was wrong too. Two things the gap asked for turn out not to be missing: mango never changes across modes, so it needs no dark hover; and the text button's whole treatment is an underline in tokens that already flip. |
| **GAP-10** paper-tone flip | **The kit's own context classes**, provisionally | Could not be left open: the kit's law says a header band and its buttons are never the same tone "or filled buttons disappear", so with no mechanism a secondary button on a panel vanishes. `.kw-on-panel` / `.kw-on-page` is the mechanism the kit's specimens already build; it invents nothing and degrades safely. `--sheetFlip` / `--cardFlip` are still referenced nowhere and were NOT adopted — that would be guessing at an intent rather than reading one. |

Recorded in the kit's `GAPS.md` and copied to `design/gap-decisions.md`, because
the kit directory is not version-controlled and a re-download would take the
decisions with it.

### 7 · The R31 conflict
The kit deliberately breaks the two-radius law in one place and says so: 6px on a
selection control, "the ONE named exception. Nothing else may." Admitted as
`RADIUS_EXCEPTION` — data, one reason, rot-checked — in the shape R32 already
uses. The ratchet points the way that keeps a vocabulary from widening: an
exception nothing USES turns the build red. The kit's SECOND exception (4px for a
bar) is deliberately absent, because nothing draws one and an unused exception is
what the ratchet exists to catch.

### 8 · Colour — the stage that makes it look reskinned
The kwapso palette replaces the library's "Teal" preset outright. Names are the
library's, values are the kit's, because 94 components reference those names and a
token is a name for a JOB.

Dark is defined twice on purpose — `.dark, [data-theme="dark"]` for an explicit
choice, a guarded `prefers-color-scheme` block for a viewer who never chose, whose
`:not(.light)` is what lets an explicit light choice survive a dark OS.
`web/test/theme-tokens.test.ts` compares them declaration by declaration and
catches a single changed hex digit.

**Four things the kit bans outright were removed, each invisible to every existing
check:** the body's three brand glows and its `color-mix(black 16%)` vignette; a
fractal-noise film grain at 5% over the whole app; `.glass`'s 16px backdrop blur
and 72% translucency; and `.hover-lift`'s brand-tinted shadow and mango border.

The `.glass` one closed a nine-day-old bug at its source. `library-overrides.css`
carries the post-mortem: an override existed for six weeks because dialog text was
unreadable over the moving background, was deleted on a false claim, and left the
app with no opaque dialog surface — during which the app-creation form was
reported unreadable over the client logo grid. **The translucency was the cause
every time.**

**A whole layer of fighting was deleted.** `brand.ts` held six oklch values that
`BrandTheme` injected over the library at raised specificity — a corrective layer
that existed only because the library could not be edited. Its own comment records
the bill: `--primary` overridden while `--primary-foreground` was left at pure
white, so every primary button was white-on-pale-mango at ~1.4:1. The library's
theme IS the kwapso palette now, so `BrandTheme` is gone and the two tokens sit
three lines apart where they cannot drift.

Also: `#fecc6d` hand-copied three times into `globals.css` (the one live brand
literal no re-theme could reach, in a file R32 does not scan) now resolves through
`var(--primary)`; the manifest theme colour was an off-palette teal and is now TWO
values per ruling 09; the browser-chrome tint was two neutral greys; and the
splash's dark field was a COLD near-black on the first frame a person sees.

### 9 · Type
The kit's thirteen steps expressed where Tailwind can act on them, so each size
carries its own leading and tracking. Two new names — `text-badge` (12) and
`text-micro` (11) — exist because the kit bans hand-set 9/10/11px and this app had
**54 of them**, nearly all on a Badge: the largest token-purity residue in the
audit, and now moving with the text-size control for the first time.

Two weights, enforced twice: 59 call sites rewritten, and the ramp pinned in
`@theme` so no class in the vocabulary can produce a third.

**Saans is named first and is not here** — the kit's `assets/fonts/` is empty
(a licence question), so the family leads the stack and Inter stays behind it.

**The text-size control stays the app's, on the kit's own instruction.** The kit
ships `data-scale` at 13/15/17 with both doors defaulting to 15; this app has one
already with a different value per door, because UI-RULEBOOK L5 locks the portal a
step larger. `tokens.css` names its standing law in its own header: "CLAUDE.md
overrides the kit where the two disagree."

### 10 · Shape and depth — and the ratchet collected
45 off-vocabulary radii became `rounded-xl`, 16 became `rounded-full` (listed per
file, because "which of these is a pill" is a design question). Every Tailwind
step is pinned to one `--radius`, so a future `rounded-lg` gets the box radius
rather than a number nobody chose.

**Then the exemption written on day one turned red and was deleted.** The R31
scope entry for `shared/ui/` carried a rot check asserting the directory still
offended; collapsing the radii made that false, the check named its own exemption,
and the entry, the skip and the ratchet block went with the commit that earned it.
That is the mechanism working once, in public.

Three elevations, no fourth reachable: seven Tailwind shadow steps pinned to
rest/lifted/overlay, referencing the flipping tokens so a shadow is genuinely
darker in dark mode.

### 11 · Spacing
Of ~1,500 spacing classes, exactly **17** sat off the kit's scale. Snapped to the
step whose documented job matches: `pl-7`→`pl-6`, `gap-10`→`gap-12` (the kit's
"block gap inside a section", 9 screens), `p-10`→`p-8`, `px-10`→`px-8`.

One had an argument attached and is worth naming: `lg:px-10` was the shell's page
gutter, commented as "exactly the brand site's own 40px `--margin--m`". It snapped
anyway — the kit IS the brand's design system now, and a value inherited from the
old marketing site is what a re-theme exists to reconcile. Its bleed pair `-mx-10`
moved with it.

`web/test/design-scale.test.ts` refuses any step ruling 28 does not admit.

### 12 · Motion
The curve was already right: the library used `cubic-bezier(.16,1,.3,1)` inline,
which is what the kit names — the same ease-out-expo, arrived at twice. What was
wrong is that it sat inline in three places beside two plain `ease`s, so
`.hover-lift` moved a card on one curve while its shadow arrived on another.

Setting `--default-transition-timing-function` and `--default-transition-duration`
made every `transition-*` utility in both apps inherit the kit's curve **without
one class changing**. `duration-300`/`duration-500` (a sheet opening in 500ms and
closing in 300) both became 360; `ss-rise` fell 12px and now falls 8, the top of
the kit's stated 4–8px range.

### 13 · Components
Where the kit specifies a component, reshaped; where it does not, dressed in the
new tokens with nothing structural changed — and every one of those is in
`NEEDS-A-SPEC.md`.

**The focus ring is the big one.** 150 per-component utilities across 38 files,
replaced by one `:focus-visible` rule. They disagreed with each other about width
and offset, and some were on `focus:` so a mouse click lit them up. Every one sat
beside an `outline-none` suppressing the browser's own indicator — so removing the
rings and leaving the suppression would have left those controls with **no focus
indicator at all**, worse than before and total for anyone not using a mouse. The
two came out together and `focus-ring.test.ts` refuses either half coming back,
including a check that the ONE rule still exists (a census of absences passes
perfectly against an app with no focus styling).

**The button** is where "no borders, ever" stops being a slogan: `outline` deleted
as a variant, 113 call sites plus 6 dynamic references rewritten to `secondary`,
and `ActionVariant` narrowed so a screen recipe asking for it fails at the type
level. Press drops 1px instead of scaling. Disabled is a fill and a label.

The rest of Tier 1 to the kit's numbers: input 44 with a hairline that steps up
twice; textarea a 24 box; badge 20 tall, tabular, `empty:hidden`, no border on a
coloured pill; checkbox 22 at the 6px exception; switch 44×26; card separated by
TONE with its border gone; tabs as real line tabs with zero horizontal padding so
the underline sits under the WORD.

---

## Verification

`npm run check` green throughout — 235 test files at the end, up from 232.

**Both apps deployed to staging and driven by hand**, logged in as a real user
against real data (1,820 tickets, 130 accounts):

| Checked | Result |
|---|---|
| Agency sign-in, code entry, session | works; disabled→enabled button, spinner, toast all correct |
| Home / the Pulse band | stat cards, bar chart in sky (`chart-1`), area chart in forest (`chart-2`) |
| Tickets collection | 1,820 rows, dual tab strips with count badges, search, sort, paging |
| Ticket detail | record chrome, 7-stage status stepper, line tabs with counts, composer, audit footer |
| Accounts + account detail | 24 companies, 9 tabs with counts, cover, description list |
| Contact detail + portal-access tab | renders; the R21 fence correctly refused a client login for a team member |
| Form dialogs | FormShell, rich text, pickers, focus ring visible, busy state ("Submitting…"), toast |
| Confirm dialogs | AlertDialog at 24 radius on the raised surface |
| Assistant overlay | right sheet, quota badge, example-prompt empty state, pill composer |
| Dropdown menus | popover surface, destructive item in poppy |
| Light **and** dark | both, on every screen above |
| Portal sign-in, code, no-access | all three correct; portal has no ambient field, as designed |

**What I could NOT verify by eye:** the portal's five authenticated screens (home,
tickets, impact, deliverables, company). They need a client contact's login, and
the app correctly refused to make one for my address — *"that person is a member
of your team, a client login would lock them out of the agency app"* (R21 working
as designed). Creating a login for a real client contact would have emailed them,
so I did not. Those screens are covered by the build and by the portal's own 7
test files, not by a screenshot.

**One bug found by opening the app rather than by a test**, which is the point of
opening the app: making `Input` a pill turned the six one-time-code cells into
circles. Fixed to the kit's 44×52 box — and doing so surfaced a genuine
contradiction in the kit, now logged (see below).

**Test data:** I created one contact ("Reskin Check", `alaap@kwapso.com`) on the
aWs account to attempt a portal login, and removed the link afterwards. The person
row survives, because this codebase deactivates rather than deletes. Worth tidying.

---

## Flagged for Aurora

`NEEDS-A-SPEC.md` is the full list. The four that matter most:

1. **The icon system is the biggest unstarted piece.** Ruling 34 wants 30 filled glyphs, one per module for life. The app uses **Lucide**, which is stroke-based, and CLAUDE.md mandates a Lucide action mapping. The two sets do not overlap and the kit gives no equivalents.
2. **Badge or pill?** Your kit has two components where the app has one — a neutral/mango COUNT, and a status whose colour lives only in a 7px dot. The app's Badge does both and carries success/warning/destructive fills. Converting is a redesign of every collection row.
3. **A code cell cannot be both "a box" and 24px at 44 wide.** CSS clamps a corner radius to half the shorter side, so ruling 03's own numbers render as a stadium — the one shape the ruling was written to prevent.
4. **`.kw-alert--warning` uses mango**, and `exclusions.md` says mango is never a status. One of the two is wrong.

Plus the two the kit contradicts itself on and where the app followed the
achievable sentence: the focus ring's shape (F2-1) and the search input's height
(F2-2).

---

## What I could not do, and why

- **The portal's authenticated screens, by eye.** See Verification. Not a defect — the app refused correctly.
- **The app icons.** Four SVGs on both doors are still the teal Brimba "B". The kit's `assets/app-icons/` is empty, so there is nothing to install. The manifest THEME colour is done (ruling 09, two values per door); the artwork is not.
- **The typeface.** `assets/fonts/` is empty — a redistribution licence question. Saans leads the stack; Inter renders.
- **The email template** (ruling 23: "a letter, not a banner"). It still has its tint band. An email cannot read a token, so this is a rewrite rather than a re-tone, and it changes what every login and notification looks like. Out of scope for a re-theme.
- **Port the library's tests.** They were never in the published package.
- **RTL.** Out of scope by ruling 10, while the app offers three RTL languages.
- **`~60 translucent surfaces`** (`bg-muted/40` and friends). The kit bans opacity HOVERS and does not rule on translucent surfaces; these are mostly in components it has not drawn. The clearly-banned subset — every `disabled:opacity-*` — was fixed.

## One thing that is not this reskin's doing

`lucide-react` logs `DynamicIcon: Name not found` on some screens. It is
non-fatal (the call sites already pass a `fallback`), it comes from an icon name
stored in team DATA rather than from code, and none of those call sites was
touched. Worth chasing separately.
