# library-map.md — the swap key, filled

**Status: FILLED.** Aurora shipped this file as a deliberate stub with the right
column complete and the left column blank, because the library's token names
were not knowable from outside it. They are knowable now: the library is
vendored at `shared/ui/`, and its tokens are defined in one place,
`shared/ui/styles.css`.

This is the repo's copy, committed so it cannot drift from the code it
describes. The kit's copy lives at `~/Desktop/design-mothership/tokens/library-map.md`.

**Source of the left column:** every custom property declared in
`shared/ui/styles.css` — 69 of them, of which 35 are the `--color-*` aliases the
`@theme inline` block exposes to Tailwind, so there are **34 real tokens** plus
`--radius` and its four steps. Plus the six values `shared/web/brand-theme.tsx`
injects from `shared/brand.ts`.

**How to read a row.** The library's token NAME is what all 94 components
reference, so the names survive the reskin and only their VALUES change. A row
saying `--primary → --accent` means: wherever `shared/ui/styles.css` sets
`--primary`, it now takes the kit's `--accent` value.

---

## The theming chain, before and after

Before, three layers deep and two of them fighting:

1. `shared/ui/styles.css` — the library's "Teal" preset, light in `:root, .light`, dark in `.dark`.
2. `shared/web/brand-theme.tsx` — a `<style>` tag at higher specificity, overriding **six** tokens (`--primary`, `--primary-foreground`, `--ring`, `--accent`, `--accent-foreground`, `--background`) with kwapso mango, from `shared/brand.ts`.
3. `web/app/globals.css` — the mango ambient field, with `#fecc6d` hand-copied out of `brand.ts`.

So the app's real palette was teal with six mango patches over it, and three
files had to be read to know what colour anything was.

After: **`shared/ui/styles.css` holds the kwapso palette outright.** `brand.ts`
stays as the fork seam (a future product changes it and re-skins), but it no
longer has to fight a preset that disagrees with it.

---

## Surfaces

| `shared/ui` token | → | kwapso token | Light | Dark |
|---|---|---|---|---|
| `--background` | → | `--surface-page` | `#FFFEF9` | `#141310` |
| `--card` | → | `--surface-panel` | `#F7F2EB` | `#1C1B18` |
| `--popover` | → | `--surface-raised` | `#FFFEF9` | `#26241F` |
| `--secondary` | → | `--surface-quiet` | `#E2DDD4` | `#2F2D28` |
| `--muted` | → | `--surface-quiet` | `#E2DDD4` | `#2F2D28` |
| `--accent` | → | **`--surface-panel`** — see collision (a) | `#F7F2EB` | `#1C1B18` |

`--surface-inverse` and `--surface-brand` have no library counterpart and are
ADDED — see *Tokens added to the library*.

## Ink

| `shared/ui` token | → | kwapso token | Light | Dark |
|---|---|---|---|---|
| `--foreground` | → | `--ink-primary` | `#1A1918` | `#FFFEF9` |
| `--card-foreground` | → | `--ink-primary` | `#1A1918` | `#FFFEF9` |
| `--popover-foreground` | → | `--ink-primary` | `#1A1918` | `#FFFEF9` |
| `--secondary-foreground` | → | `--ink-primary` | `#1A1918` | `#FFFEF9` |
| `--accent-foreground` | → | `--ink-primary` | `#1A1918` | `#FFFEF9` |
| `--muted-foreground` | → | `--ink-tertiary` | `#5f5d59` | `#bdb9b1` |
| `--primary-foreground` | → | `--ink-on-accent` | `#1A1918` | `#1A1918` |
| `--destructive-foreground` | → | `--ink-on-accent` | `#1A1918` | `#1A1918` |
| `--success-foreground` | → | `--ink-on-accent` | `#1A1918` | `#1A1918` |
| `--warning-foreground` | → | `--ink-on-accent` | `#1A1918` | `#1A1918` |

**`--muted-foreground` → tertiary, not secondary, and it is the one ink row worth
arguing about.** The library has a two-tier ink scale (`--foreground` +
`--muted-foreground`); the kit has four. The library's muted carries labels,
metadata, timestamps, placeholders and hints — which is the exact job description
of the kit's `--ink-tertiary` (rulings 25 + 27 folded the old hint tier into it).
`--ink-secondary` is a body-copy tone the library has no token for, so it is
ADDED and used where the kit's specimens call for it.

**Every `*-foreground` on a coloured fill becomes charcoal**, in both modes,
including on poppy. That is the accent rule, and the kit ruled on its hardest
case explicitly: charcoal on poppy is 4.59:1 and passes, off-beige on poppy
fails. Note the library had already discovered half of this from the other end —
its own comment says near-white on mango was 1.4:1 and read as a disabled
control.

## Hairlines

| `shared/ui` token | → | kwapso token | Light | Dark |
|---|---|---|---|---|
| `--border` | → | `--hair` | `rgba(26,25,24,.08)` | `rgba(255,254,249,.12)` |
| `--input` | → | `--hair-strong` | `rgba(26,25,24,.20)` | `rgba(255,254,249,.24)` |

`--hair-faint` has no library counterpart and is ADDED (unused for now — GAP-4
disputes its role, and the kit's own specimens never consume it).

**A borrowed border is not the same as a drawn one.** The library sets
`* { border-color: var(--color-border) }` in its base layer, so `--border` is the
default colour of every border in the app, including ones the kit forbids
outright (buttons, coloured pills). Mapping the token does not remove those
borders; removing them is component work, and it is why owning the source
mattered.

## Status and feedback

| `shared/ui` token | → | kwapso token | Light | Dark |
|---|---|---|---|---|
| `--primary` | → | `--accent` (brand mango) | `#FED069` | `#FED069` |
| `--ring` | → | `--focus` | `#1A1918` | `#FFFEF9` |
| `--destructive` | → | `--danger` | `#E94A32` | `#F2634B` |
| `--success` | → | `--success` | `#1F9259` | `#2FB673` |
| `--warning` | → | **`--info`** — see collision (b) | `#89BCE6` | `#89BCE6` |
| `--warning-strong` | → | **`--info`** — see collision (b) | `#89BCE6` | `#89BCE6` |

**`--ring` → `--focus`, not `--primary`.** The library ties the focus ring to the
brand colour ("RING follows PRIMARY"). Ruling 24 unties them: the ring is
charcoal on light and off-beige on dark, one spec for every control, and it is
not a brand surface. A mango ring on a mango button is invisible, which is the
practical half of the same point.

## Charts

| `shared/ui` token | → | kwapso token | Light | Dark |
|---|---|---|---|---|
| `--chart-1` | → | `--chart-1` (sky) | `#89BCE6` | `#89BCE6` |
| `--chart-2` | → | `--chart-2` (forest) | `#1F9259` | `#2FB673` |
| `--chart-3` | → | `--chart-3` (poppy) | `#E94A32` | `#F2634B` |
| `--chart-4` | → | `--chart-1` (the cycle restarts) | `#89BCE6` | `#89BCE6` |
| `--chart-5` | → | `--chart-2` (the cycle restarts) | `#1F9259` | `#2FB673` |

See collision (c). `--chart-negative` is ADDED.

## Type

| `shared/ui` token | → | kwapso token | Value |
|---|---|---|---|
| `--font-sans` | → | `--font-sans` | `"Saans", system-ui, sans-serif` — **but see the note below** |
| `--text-xs` (`0.8125rem`) | → | `--text-caption` | `0.8125rem` (13) — identical, no change |
| `--text-sm` (`0.9375rem`) | → | `--text-body-s` | `0.875rem` (14) |

**The font file does not exist yet.** `assets/fonts/` is empty in the kit and the
README says why: Saans and Serrif Condensed redistribution is an open licence
question, not a technical one. The kit also bans a fallback stack ("if Saans
fails to load, nothing renders"), which cannot be obeyed by an app that has no
Saans to load. So `--font-sans` keeps a real fallback stack until the files
arrive, and this is recorded in `NEEDS-A-SPEC.md` rather than pretended away.
`--font-serif` is ADDED and is currently unreachable for the same reason.

The library raised its own type floor (`xs` 12→13, `sm` 14→15) for exactly the
reason the kit bans hand-set micro sizes. The two systems agree; only `sm`
differs, by one pixel.

## Radius

| `shared/ui` token | → | kwapso token | Value |
|---|---|---|---|
| `--radius` | → | `--radius-card` | `1.5rem` (24) |
| `--radius-sm` | → | `--radius-select` | `0.375rem` (6) |
| `--radius-md` | → | `--radius-card` | `1.5rem` (24) |
| `--radius-lg` | → | `--radius-card` | `1.5rem` (24) |
| `--radius-xl` | → | `--radius-card` | `1.5rem` (24) |

The four steps are `calc()`s off one `--radius` today (`-4px`, `-2px`, `+0`,
`+4px`), which is why R31's own reasoning — "they are all `var(--radius)`" — is
not true of this code. Collapsing them onto the kit's vocabulary is what makes
that sentence true again, and it is what lets `VENDORED_UI_SCOPE["two-radii"]`
be deleted.

`--radius-sm` → `--radius-select` (6) rather than card, because the library uses
`rounded-sm` on exactly the controls the kit's 6px exception names: the checkbox
and the choice mark. `--radius-pill` and `--radius-bar` are ADDED.

## Elevation and motion

The library defines **no** shadow token and **no** motion token. It writes
shadows and easings inline (`.hover-lift` carries a brand-tinted
`0 12px 30px -12px`, which is a coloured shadow and banned). All seven are
ADDED: `--shadow-rest`, `--shadow-lifted`, `--shadow-overlay`, `--ease`,
`--duration-colour`, `--duration-entrance`, `--duration-overlay`.

---

## `shared/brand.ts`

| `brand.ts` value | → | kwapso token or asset |
|---|---|---|
| `accent.primary` (light/dark oklch) | → | `--accent` `#FED069`, **one value, both modes** |
| `accent.secondary` (light/dark oklch) | → | `--surface-panel` — it was the "soft tinted surface", which is the kit's second paper tone |
| `accent.ink` (light/dark oklch) | → | `--ink-on-accent` `#1A1918` |
| `screen.light` / `screen.dark` (oklch) | → | `--surface-page` `#FFFEF9` / `#141310` |
| `accentHex.primary` `#FED069` | → | `--accent` — already exactly the kit's mango |
| `accentHex.surface` `#FFE9B0` | → | no counterpart; it is the EMAIL's tint panel and stays a literal (R23: a letter, not a banner) |
| `accentHex.ink` `#1A1918` | → | `--ink-on-accent` — already exactly the kit's charcoal |
| `name` / `description` / `motto` | → | not colours. `motto` is already "Work, structured." |

**`brand.ts` survives, with a smaller job.** It was the fork seam ("change these
to re-skin the app") and it stays that, because a future product built on this
base still needs one file to change. What it stops being is a corrective layer
over a preset that disagrees with it — six overrides at raised specificity, which
is how `--primary-foreground` came to be forgotten and every primary button in
the app spent a while as white-on-pale-mango.

**Ruling 09 needs `brand.ts` to grow, not shrink.** The manifest theme colour
follows the app icon — mango for the client portal, charcoal for the agency — so
one brand colour has to become two values, per door. `shared/web/pwa.ts` reads
this today and hardcodes an off-palette teal (`#0e9e86`).

---

## The four collisions, and how each was resolved

### (a) `--accent` means the opposite thing in each system

The library's `--accent` is a **subtle tinted surface** — `oklch(0.96 0.02 185)`,
a barely-there teal wash used for hover states, highlighted menu items and
selected rows. The kit's `--accent` is the **brand mango**, a fill.

Getting this backwards turns every hover state in both apps bright yellow.

**Resolved:** the two names are not mapped to each other at all.

- The library's `--accent` (the surface) → the kit's **`--surface-panel`**. It keeps doing the job it was doing: a quiet tint one step off the page, which is what a hover on a row should be. The kit's own list-row spec agrees — a hovered row takes the other paper tone, not a brand colour.
- The kit's `--accent` (the mango) → the library's **`--primary`**, which is already the library's brand-fill token and is already mango via `brand.ts`.

So the mango lands where the library already put the brand, and the tint stays a
tint. Nothing in either app has to know the word "accent" changed sides.

### (b) The library has `--warning`; the kit has no warning colour

The kit's palette is accent / info / success / danger, and `semantic-map.md` is
explicit: *"There is no warning token. If one is needed that is a ruling, not an
addition."* Mango cannot take the job — "mango is never a status" is a named ban.

So the question is what the app actually MEANS by warning, and it turns out to
mean two things:

1. **"Nothing moves until somebody outside answers."** `awaiting_validation` on the ticket stepper and the portal's "Waiting for your go-ahead" pill. The code says so in as many words: *"the single stage where nothing will happen until somebody outside this building answers"*.
2. **"Work is happening."** `in_progress` and `in_review` on the two steppers.

The kit answers both without inventing anything, in its own pill vocabulary:
`--dot-review: var(--kw-sky)` for in-review/awaiting, and
`--dot-building: var(--ink-primary)` — charcoal — for in-build.

**Resolved:** `--warning` and `--warning-strong` → **`--info`** (sky). The kit's
own definition of info is *"informational, in review, awaiting an answer"*, which
is meaning (1) word for word, and meaning (1) is the load-bearing one — it is the
only place in the product where the colour is telling a client to act.

**The residue is logged, not silently absorbed.** Meaning (2) would be charcoal
in the kit's vocabulary, not sky, and the two status steppers are a component the
kit does not spec at all. Changing their tones is a design decision about a
screen Aurora has not drawn, so it is a question in `NEEDS-A-SPEC.md`, not a
change made here. `--warning-strong` (the on-surface text tone the library added
for contrast) has **zero** app-code uses and survives only for library-internal
call sites.

### (c) The library has five chart series; the kit has three

**Resolved, and the kit resolved it:** the cycle restarts. `--chart-4` →
`--chart-1` (sky), `--chart-5` → `--chart-2` (forest). Not two new colours.

This costs nothing today: the app's only charts are in `pulse-charts.tsx` and the
portal's `impact-chart.tsx`, and between them they use `chart-1` through
`chart-4`. The one four-series chart will repeat sky rather than introduce a
colour the palette does not contain. Mango is never a series; grey is never a
series.

### (d) The kit has tokens the library never had

There is no dead end here any more, and that is the whole point of vendoring:
an unmappable kit token is now a variable this repo adds to its own stylesheet.
Every one below is ADDED to `shared/ui/styles.css` and used where the kit's
specimens call for it.

| Added token | Why the library had no counterpart | Where it is used |
|---|---|---|
| `--surface-inverse` / `--ink-on-inverse` | the library has no inverted band | toast (a charcoal pill), "mine" message bubbles, inverse buttons |
| `--surface-raised` | the library reused `--popover` for both | mapped from `--popover`; no new name needed downstream |
| `--surface-idle` | no counterpart | the "later" stage chip |
| `--surface-brand` | the library only had `--primary` as a fill | mango cards, mention pills, the 48px person avatar |
| `--ink-secondary` | the library's ink scale is two tiers | body copy in dialogs, alerts, registers |
| `--ink-tertiary` | mapped from `--muted-foreground` | labels, metadata, timestamps, placeholders |
| `--ink-disabled` | the library expressed disabled as opacity | disabled ink, per the ink scale (`#a8a59f` / `#76746f`) — NOT the state matrix's `#5f5d59`, which is a kit contradiction (F3-1) |
| `--hair-faint` | no counterpart | nothing yet — GAP-4 disputes its role, and the kit's own specimens never consume it |
| `--font-serif` | no counterpart | nothing yet — the font file does not exist |
| `--shadow-rest` / `--shadow-lifted` / `--shadow-overlay` | the library wrote shadows inline | raised cards, notification panel, modal and drawer |
| `--ease`, `--duration-colour`, `--duration-entrance`, `--duration-overlay` | the library wrote easings inline | every transition |
| `--radius-pill`, `--radius-bar` | the library's scale is four `calc()`s off one radius | pills and buttons; bars and heat cells |
| `--focus`, `--focus-width`, `--focus-offset` | the library used `--ring` and a per-component ring | the one `:focus-visible` rule |

---

## Unmappable — the places the swap cannot reach

Each row is a decision, not a gap left open.

| `shared/ui` token or feature | Current value | Why it does not map | Decision |
|---|---|---|---|
| `--color-*` (35 aliases) | `var(--x)` | Tailwind plumbing, not design. `@theme inline` exposes each token as a utility. | Keep. They follow their sources automatically. |
| `--ss-angle` | `0deg` | An `@property` angle driving the required-field ring's conic gradient. Geometry, not colour. | Keep. |
| `--text-xs--line-height` / `--text-sm--line-height` | `1.125rem` / `1.375rem` | Tailwind's paired line-height syntax. The kit expresses leading as unitless ratios per step. | Rewrite as the kit's ratios. |
| `.hover-lift`'s brand-tinted shadow | `0 12px 30px -12px` mixed with `--primary` | A COLOURED shadow. "Never blue in a shadow" generalises: paper shadows only. | Re-specify against `--shadow-lifted`. |
| `.glass` backdrop blur | `blur(16px) saturate(1.4)` | "Introduce a third radius, a gradient, or a **blur**" is a named Don't. | Resolve during the shape stage; a translucent pane is not in the kit. |
| The body's four radial gradients + film grain | `styles.css` base layer | Gradients are banned, with one exception: the mango ambient field (ruling 19A). | Keep ONE field, re-specified against tokens; drop the rest. |
| Any border on a **button** or a **coloured pill** | `1px solid var(--border)` | No border exists on either, in any state. | Delete at the component. |
| Any per-component focus ring | `focus-visible:ring-*` across ~40 files | Ruling 24: one shared spec, and `outline: none` on a focusable is a named ban. | Delete all; add the one `:focus-visible` rule. |
| Font weights that are not 300 or 500 | `font-medium`, `font-semibold`, `font-bold` | Saans ships Light and Medium only. | Collapse to the nearer of the two. |
| `--chart-4`, `--chart-5` | teal / magenta | The kwapso cycle is three. | Restart the cycle (collision c). |
| `--warning`, `--warning-strong` | amber | No warning colour exists. | → `--info` (collision b), with the stepper question logged. |

---

## Five places no token reaches

Hand-checked, because no token-level change touches any of them.

1. **The mango field** — `web/app/globals.css` hand-copies `#fecc6d` three times, in a file the palette laws do not scan. Ruling 19A keeps the glow; it gets re-specified against `--accent`.
2. **The app icons** — four SVGs across both doors, still the teal Brimba "B". The kit has no replacement (`assets/app-icons/` is empty and says so).
3. **The manifest theme colour** — `shared/web/pwa.ts` hardcodes `#0e9e86`, an off-palette teal. Ruling 09 makes this TWO values: mango for the portal, charcoal for the agency.
4. **The pre-bundle splash** — `shared/web/splash.ts` paints before any stylesheet exists, so it must hold literals. Ruling 22: mango in light, `#141310` in dark.
5. **The email template** — mail clients strip CSS variables, so every colour travels as a literal. Ruling 23: a letter, not a banner.
