# NEEDS-A-SPEC.md

**For Aurora.** Everything the kwapso app renders that the design kit does not
specify, plus the handful of places the kit specifies something the app cannot
yet obey.

Written during the reskin of 2026-08-22, which vendored the component library
into this repo (`shared/ui/`) and dressed it in the kit. The rule the reskin
followed is the kit's own, from `GAPS.md`:

> If anything required by the app is not specified in the kit — a component, a
> state, a token, a breakpoint behavior — STOP styling that element. Add it to
> GAPS.md with the file, the element, and what's missing. Apply no improvised
> styling.

So **everything below wears the new tokens and keeps its old shape.** Nothing
here was redesigned on a guess. Where the kit gave a rule, the app obeys it;
where it did not, the component was dressed and left alone.

Ordered by how often a person sees it.

---

## 1 · Components the kit does not draw at all

The kit's Tier 1 covers button, card, pill, badge, field, selection controls,
tab, list, skeleton, spinner, link and empty. These render on nearly every screen
and have no specimen.

| Component | Where it is | What is unspecified | What it does today |
|---|---|---|---|
| **Dropdown menu** | every record's ⋯ actions, the profile menu, the team and account switchers, the language menu, row actions | the whole surface: item height, inset, separator, hover, the checked/disabled item, how far it sits from its trigger | `--popover` surface, 24 radius, `--shadow-lifted`, hover on the quiet tint |
| **Select** | account form, knowledge form, portal access, dropdown management, the language picker | trigger vs field: is a Select a pill like an input, or a box? Its listbox, its checkmark, its grouping | dressed as an input (pill, 44) with a boxed listbox |
| **Popover / Tooltip / Hover card** | the record picker (desktop), help affordances | arrow or no arrow, inset, max width, delay | `--popover`, 24 radius, `--shadow-lifted` |
| **Command palette (combobox)** | `record-picker.tsx` — the "which record?" control in ~18 forms | the search row, the empty state, the highlighted item, the grouping header, the mobile sheet variant | library defaults, re-tokened |
| **Accordion** | the savings drill-down on both doors (App → Process → Step) | the trigger row, the chevron, the nesting rule for two levels | a hairline between items, no fill |
| **Table** | tasks and meetings (`record-table.tsx`) | the kit has one specimen matrix, labelled specimen chrome. No zebra, no row hover, no sticky header, no selected row, and `--control-height-row` (56) is defined but unused | 56-row height, hairline rules, `bg-muted` on alternate rows |
| **Calendar** | tasks, meetings, sprints (`record-calendar.tsx`) | the month grid, the day cell, today, the event chip, the agenda row | library defaults, re-tokened |
| **Chart** | the Pulse band, the portal's savings chart | the series tokens exist and no chart specimen is drawn. Axis, grid, legend, tooltip, empty, the negative bar | Recharts defaults on `--chart-1..3` |
| **Progress bar (determinate)** | tasks "done today", the assistant's blocks | the kit specifies only an INDETERMINATE slider | a 4px track on the quiet surface |
| **Pagination** | nothing renders it — the app pages by cursor and a "Show older" button | — | unused; safe to ignore |

## 2 · The eighteen kwapso archetypes

The kit's own coverage note says these live in chapters 20–25, which "exceed the
256 KiB read cap and are unverified". They are the screens that make this product
this product, and each is composed from Tier 1 pieces the kit does specify — so
they are all wearing the new palette, and none has been rearranged.

The ones with no specimen at all, in the order a person meets them:

1. **Record chrome** — the four-region anatomy every detail screen wears: transparent header band, sticky tab strip, opaque panel, audit footer. 14 screens.
2. **The Pulse band** — a fixed-height stat + mini-chart strip on Home, whose panels render *nothing* when a right is absent.
3. **Status-stepper hero** — the ticket's 7 stages and the story's 4, drawn above the tab strip. See §4 for a colour question this raises.
4. **The assistant overlay** — floating launcher, right-hand sheet, streaming reply, typed blocks (metric / progress / table / flow), the confirm panel that lists proposed calls, and the ring it draws round a control it just drove.
5. **Knowledge Ask** — question box, written answer, cited passages, sources.
6. **Process map** — steps as boxes down the page with a version diff beside them, coloured faster / slower / removed.
7. **Portal home blocks** — "waiting on you" rows, "3 of 8 done" delivery blocks, the savings tile.
8. **Portal ticket conversation** — bespoke bubbles. Ruling 36 covers the bubble; the composer, the attachment strip and the "yes, go ahead" validation band are not covered.
9. **Import wizard** — upload → agent plan → review → run → per-row report.
10. **Paged find** — search + facets + sort + "Load more" + the exact-count pill, and the rule that the heading's count stands down under a counted tab.
11. **App tiles** — a wall of app cards grouped by stage.
12. **Arithmetic panels** — the margin and savings blocks, where every number shows its makeup.
13. **Timer bar** — a running work timer in the header of every agency screen.
14. **Triage strip** — a duty banner above the ticket list, plus a gated queue tab.

## 3 · What the kit specifies and the app cannot yet do

| Ruling | What it asks | Why not, and what happens instead |
|---|---|---|
| **The typeface** | Saans (Light 300 / Medium 500) and Serrif Condensed | `assets/fonts/` is empty — redistribution is a licence question. `--font-sans` names Saans FIRST and falls back to Inter, so the day the files land nothing has to change. The kit also bans a fallback stack ("if Saans fails to load, nothing renders"), which an app with no Saans cannot obey. |
| **Ruling 09 · app icons** | mango tile + charcoal isotype (portal), charcoal tile + mango isotype (agency) | The four SVGs on both doors are still the teal Brimba "B", and `assets/app-icons/` in the kit is empty. The manifest THEME colour is done (two values, per door); the artwork is not. |
| **Ruling 22 · splash** | mango in light, `#141310` in dark | Done. The two GLOWS in the composition (`#3a2c10` dark, `#f6b83f` light) are the composition's own and are not in the kit — left alone. |
| **Ruling 23 · email** | "a letter, not a banner. Isotype plus one mango button, no colour band" | The template still has its tint band (`accentHex.surface`, `#FFE9B0` — not a kwapso colour). An email cannot read a token, so this is a rewrite rather than a re-tone, and it changes what every login and notification looks like. Not attempted. |
| **Ruling 34 · icons** | 30 filled glyphs, `fill="currentColor"`, one icon per module for life, "modules are never identified by a letter" | **The app uses Lucide**, which is stroke-based, and CLAUDE.md mandates a Lucide action mapping (`Pencil` edit, `Power` deactivate, `UserMinus` remove, `Ban` revoke, `Plus` create, `Upload` import at `size-3.5`). The kit gives no Lucide equivalents and the two sets do not overlap. This is the biggest unstarted piece of the reskin. |
| **Ruling 28 · scale control** | `data-scale`, three steps at 13/15/17, both doors default to 15 | The app has its own control with a DIFFERENT value per door, because UI-RULEBOOK L5 locks the portal a step larger. `tokens.css` says CLAUDE.md overrides the kit where they disagree, so the app's stands. See `shared/scale.ts`. |
| **Responsive** | — | `responsive.md` is unwritten; the kit has no breakpoint specification at all. Both apps keep their existing responsive behaviour. |

## 4 · Questions only you can answer

**a · The status stepper's middle tones.** The library had one `--warning` token
and the kit has no warning colour, so it maps to `--info` (sky). That is right
for the state it mostly means — "nothing moves until somebody outside answers",
which is your definition of info word for word. But the same token also colours
`in_progress` and `in_review` on the two status steppers, and in your own pill
vocabulary "in build" is CHARCOAL (`--dot-building`), not sky. Changing those two
tones is a design decision about a screen you have not drawn, so nothing was
changed. Files: `web/components/help-status-stepper.tsx`,
`web/components/story-status-stepper.tsx`.

**b · Badge or pill?** Your kit has two components where the app has one. A
`.kw-badge` is a neutral or mango COUNT; a `.kw-pill` is a status, and its colour
lives only in a 7px dot with the state named in words beside it. The app's
`Badge` does both jobs and carries `success`, `warning` and `destructive` fills —
so today a resolved ticket is a green badge rather than a neutral pill with a
forest dot. Converting them is a real redesign of every collection row and every
record header. The geometry and the borders are already yours; the dot is not.

**c · `.kw-alert--warning` uses mango.** Your own specimen paints the warning
alert's dot with `var(--accent)`, and `exclusions.md` says mango is never a
status. One of the two is wrong.

**d · GAP-10, the paper-tone flip.** Adopted provisionally as your context-class
pair (`.kw-on-panel` / `.kw-on-page`), because it is the mechanism your specimens
actually build and it invents nothing. It is at the bottom of
`shared/ui/styles.css`. `--sheetFlip` / `--cardFlip` are still referenced
nowhere; if they were meant to be the mechanism, they need explaining.

**e · The ghost button.** Your quiet action is `--text`: a 40px underlined label.
That is wrong for the icon-only row actions and ⋯ triggers this app uses 29
times, so `ghost` survives as a borderless, opacity-free variant. It needs either
a spec or a ruling that those controls should be something else.

**f · The disabled text button.** In your CSS, `.kw-btn--text:disabled` inherits
the generic disabled rule and acquires `--btn-disabled-fill` — so a text button
becomes a filled 40px pill when disabled. Almost certainly unintended.

**g · Focus ring shape.** Chapter 6 says both "it follows the control's own
radius" and "the ring is always a pill". The app builds the first, because the
second would mean deforming an element's corners while focused, or
per-component ring machinery that ruling 24 forbids in the same breath. (Your
own repo logged this as F2-1 and reached the same conclusion.)

**h · Search input height.** Chapter 6 draws it at 40; `--control-height-input`
is 44. The app uses 44 everywhere. (Logged as F2-2.)

## 5 · Debt this reskin created or inherited

- **The vendored library has no tests.** Upstream has 200+, including XSS-sanitisation and link-scheme regressions, but its `package.json` excludes `**/*.test.*` from the published package — so they were never in `node_modules` and could not be copied. Anything held only by an upstream test is unguarded here. Not a design question, but it is the largest thing the move cost.
- **Screen-reader labels are untranslated.** A few library strings are `aria-label`s the app cannot override from a prop — "Close" on Dialog and Sheet, "Loading" on Spinner, "Toggle theme" on ModeToggle. A blind reader who chose German hears them in English. R28's walk deliberately stops at `shared/ui/`; the reasoning is in `VENDORED_UI_SCOPE`.
- **RTL is out of scope** (ruling 10) and the app offers three RTL languages (Arabic, Urdu, Persian) while setting no document direction. Both layouts hardcode `<html lang="en">`.
- **Dates follow the browser, copy follows the chosen language.** A German-browser user reading the app in English sees "13. Juni 2026" beside English copy. Pre-existing, not a reskin change, but it is a visible inconsistency on every screen with a date.
