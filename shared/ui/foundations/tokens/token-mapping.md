# Token mapping — commission name → kwapso name → value

**Step 1 of section 14. Nothing is built on top of this until it is approved.**

Direction of travel: the commission's names are what **1,122 call sites** use
today. The kwapso kit's names and values are the **source of truth**. Every row
below where the two differ becomes one entry in `manifest.json`
→ `tokens.renamedFrom`, keyed by the commission name.

Section 4 of the commission declares **95 tokens**. All 95 are on this page.

| | count |
|---|---|
| Renamed or aliased (→ `manifest.renamedFrom`) | **53** |
| Name kept as-is (no manifest entry needed) | **37** |
| No kwapso equivalent — see §J (→ `manifest.notDelivered`) | **5** |
| **Total** | **95** |

Dark column blank = the token is not redefined in dark; the light value stands
in both palettes. That is deliberate, not an omission.

---

## A · Surface and ink — 21

| Commission name | kwapso name | Light | Dark | |
|---|---|---|---|---|
| `--background` | `--surface-page` | `#FFFEF9` | `#141310` | renamed |
| `--foreground` | `--ink-primary` | `#1A1918` | `#FFFEF9` | renamed |
| `--card` | `--surface-raised` | `#FFFEF9` | `#26241F` | renamed |
| `--card-foreground` | `--ink-primary` | `#1A1918` | `#FFFEF9` | renamed · collapses onto `--foreground` |
| `--popover` | `--surface-raised` | `#FFFEF9` | `#26241F` | renamed · ch12 draws every menu/popover on raised + `--shadow-overlay` + `--radius-card` |
| `--popover-foreground` | `--ink-primary` | `#1A1918` | `#FFFEF9` | renamed |
| `--muted` | `--surface-idle` | `#FAF9F7` | `#2F2D28` | renamed |
| `--muted-foreground` | `--ink-tertiary` | `#5f5d59` | `#bdb9b1` | renamed |
| `--secondary` | `--btn-secondary-fill` | `#F7F2EB` | `#3A3833` | renamed |
| `--secondary-foreground` | `--btn-secondary-label` | `#1A1918` | `#FFFEF9` | renamed |
| `--accent` | `--surface-hover` | `rgba(26,25,24,.05)` | *unstated — see §J-1* | renamed · **meaning collision, read §J-1** |
| `--accent-foreground` | `--ink-primary` | `#1A1918` | `#FFFEF9` | renamed |
| `--border` | `--hair` | `rgba(26,25,24,.08)` | `rgba(255,254,249,.12)` | renamed |
| `--input` | `--hair` | `rgba(26,25,24,.08)` | `rgba(255,254,249,.12)` | renamed · collapses onto `--border` |
| `--surface-inverse` | `--surface-inverse` | `#1A1918` | `#FFFEF9` | kept |
| `--ink-on-inverse` | `--ink-on-inverse` | `#FFFEF9` | `#1A1918` | kept |
| `--surface-brand` | `--surface-brand` | `#FED069` | `#FED069` | kept · mango is identical in both palettes |
| `--surface-idle` | `--surface-idle` | `#FAF9F7` | `#2F2D28` | kept |
| `--ink-secondary` | `--ink-secondary` | `#4a4946` | `#d5d1c9` | kept |
| `--ink-disabled` | `--ink-disabled` | `#a8a59f` | `#76746f` | kept |
| `--hair-faint` | `--hair-faint` | `rgba(26,25,24,.06)` | `rgba(255,254,249,.08)` | kept · GAP-4 open on its role |

## B · Brand and status — 9

| Commission name | kwapso name | Light | Dark | |
|---|---|---|---|---|
| `--primary` | `--btn-primary-fill` | `#FED069` | `#FED069` | renamed · mango |
| `--primary-foreground` | `--btn-primary-label` | `#1A1918` | `#1A1918` | renamed |
| `--destructive` | `--danger` | `#E94A32` | `#F2634B` | renamed · poppy, lifting in dark |
| `--destructive-foreground` | `--btn-destructive-label` | `#1A1918` | `#1A1918` | renamed · **charcoal, not white** |
| `--success` | `--success` | `#1F9259` | `#2FB673` | kept · forest, lifting in dark |
| `--success-foreground` | `--ink-on-accent` | `#1A1918` | `#1A1918` | renamed |
| `--warning` | `--kw-orange` | `#F7953E` | `#F7953E` | admitted 2026-09-02 · §J-2 |
| `--warning-foreground` | `--ink-on-accent` | `#1A1918` | `#1A1918` | charcoal, at 7.79:1 · §J-2 |
| `--warning-strong` | — | → `--ink-primary` | → `--ink-primary` | still unassigned · §J-2 |

`--destructive-foreground` is the one row most likely to look like a bug and is
not one. The kit's accent law is absolute: *"charcoal on EVERY accent, both
modes, no exceptions."* Today's destructive button is white-on-red; it becomes
charcoal-on-poppy.

## C · Charts — 6

| Commission name | kwapso name | Light | Dark | |
|---|---|---|---|---|
| `--chart-1` | `--chart-1` | `#89BCE6` sky | `#89BCE6` | kept |
| `--chart-2` | `--chart-2` | `#1F9259` forest | `#2FB673` | kept |
| `--chart-3` | `--chart-3` | `#E94A32` poppy | `#F2634B` | kept |
| `--chart-4` | — | — | — | **§J-3** |
| `--chart-5` | — | — | — | **§J-3** |
| `--chart-negative` | `--chart-negative` | `#E94A32` | `#F2634B` | kept |

## D · Focus — 4

| Commission name | kwapso name | Light | Dark | |
|---|---|---|---|---|
| `--ring` | `--focus` | `#1A1918` | `#FFFEF9` | renamed · collapses onto `--focus` |
| `--focus` | `--focus` | `#1A1918` | `#FFFEF9` | kept |
| `--focus-width` | `--focus-width` | `1px` | `1px` | **override 4** |
| `--focus-offset` | `--focus-offset` | `2px` | `2px` | kept |

Ruling 24 (reversed): one `:focus-visible` rule for the whole system, following
the control's own radius. No component defines its own ring and nothing
focusable may set `outline: none`. The two `px` values are intentional — a focus
ring must stay at its stated width at every text scale, and `tokens.css` is the
one file where a size is decided.

**The width is 1px, not ruling 24's 2px** — override 4 in `KWAPSO-SPEC.md`, the
client's own "the line is too thick" (`verify/decisions.html` B2). This table
said `2px` in both columns and was the last place in `tokens/` still carrying
the pre-override figure; the shipped token has been `1px` throughout.

## E · Shape — 8

Ruling 03 admits **exactly four radii** and states that a third box radius is
forbidden. The commission's seven-step Tailwind ladder therefore flattens onto
three values.

| Commission name | kwapso name | Value | |
|---|---|---|---|
| `--radius` | `--radius-card` | `1.5rem` / 24 | renamed |
| `--radius-sm` | `--radius-bar` | `0.25rem` / 4 | aliased · bars, heat cells, decision nodes |
| `--radius-md` | `--radius-select` | `0.375rem` / 6 | aliased · marks and selection controls |
| `--radius-lg` | `--radius-card` | `1.5rem` / 24 | aliased |
| `--radius-xl` | `--radius-card` | `1.5rem` / 24 | aliased |
| `--radius-2xl` | `--radius-card` | `1.5rem` / 24 | aliased |
| `--radius-3xl` | `--radius-card` | `1.5rem` / 24 | aliased |
| `--radius-select` | `--radius-select` | `0.375rem` / 6 | kept |

Additive: `--radius-pill` `999px` — buttons, chips, tags, avatars. It has no
commission name because the apps reach it through `rounded-full`.

**This is the largest single visual change in the whole remap.** Everything the
apps currently draw at `rounded-lg` (8px) lands at 24px.

## F · Elevation — 10

Three kit elevations; seven Tailwind aliases fold onto them.

| Commission name | kwapso name | Light | Dark |
|---|---|---|---|
| `--shadow-rest` | `--shadow-rest` | `0 1px 2px rgba(26,25,24,.05)` | `0 1px 2px rgba(0,0,0,.40)` |
| `--shadow-lifted` | `--shadow-lifted` | `0 6px 20px -6px rgba(26,25,24,.14)` | `0 6px 20px -6px rgba(0,0,0,.55)` |
| `--shadow-overlay` | `--shadow-overlay` | `0 18px 48px -12px rgba(26,25,24,.22)` | `0 18px 48px -12px rgba(0,0,0,.70)` |
| `--shadow-2xs` | `--shadow-rest` | ↑ | ↑ |
| `--shadow-xs` | `--shadow-rest` | ↑ | ↑ |
| `--shadow-sm` | `--shadow-rest` | ↑ | ↑ |
| `--shadow-md` | `--shadow-lifted` | ↑ | ↑ |
| `--shadow-lg` | `--shadow-lifted` | ↑ | ↑ |
| `--shadow-xl` | `--shadow-overlay` | ↑ | ↑ |
| `--shadow-2xl` | `--shadow-overlay` | ↑ | ↑ |

Paper shadows only — never blue, never inner.

## G · Type — 23

### Families (2)

| Commission name | kwapso name | Value | |
|---|---|---|---|
| `--font-sans` | `--font-sans` | `"Saans", system-ui, sans-serif` | kept |
| `--font-serif` | `--font-serif` | `"SerrifCondensed", Georgia, serif` | kept |

Named first, real stack behind, per section 4. The licence question on shipping
the two font files is open and goes to `manifest.notDelivered`.

### Weights (6)

Saans ships **Light 300 and Medium 500 only** — Medium is the bold of the
system. Six commission names onto two real weights.

| Commission name | kwapso name | Value |
|---|---|---|
| `--font-weight-light` | `--weight-body` | `300` |
| `--font-weight-normal` | `--weight-body` | `300` |
| `--font-weight-medium` | `--weight-strong` | `500` |
| `--font-weight-semibold` | `--weight-strong` | `500` |
| `--font-weight-bold` | `--weight-strong` | `500` |
| `--font-weight-extrabold` | `--weight-strong` | `500` |

Display sizes lean on scale and tight tracking, not on heavier weight.

### Sizes (13) — mapped by role, not by ordinal

| Commission name | kwapso name | rem | px @16 | Leading | Tracking | |
|---|---|---|---|---|---|---|
| `--text-micro` | `--text-micro` | `0.6875rem` | 11 | 1.3 | `0.08em` | kept · UPPERCASE eyebrows only |
| `--text-xs` | `--text-badge` | `0.75rem` | 12 | 1.3 | 0 | renamed |
| `--text-sm` | `--text-body-s` | `0.875rem` | 14 | 1.45 | 0 | renamed · button + control labels |
| `--text-badge` | `--text-badge` | `0.75rem` | 12 | 1.3 | 0 | kept · ruling 02 |
| `--text-base` | `--text-body` | `1rem` | 16 | 1.45 | 0 | renamed |
| `--text-lg` | `--text-body-l` | `1.125rem` | 18 | 1.45 | 0 | renamed |
| `--text-xl` | `--text-h4` | `1.25rem` | 20 | 1.3 | `-0.01em` | renamed |
| `--text-2xl` | `--text-h3` | `1.5rem` | 24 | 1.25 | `-0.014em` | renamed |
| `--text-3xl` | `--text-h2` | `2rem` | 32 | 1.18 | `-0.02em` | renamed |
| `--text-4xl` | `--text-h1` | `2.75rem` | 44 | 1.08 | `-0.025em` | renamed |
| `--text-5xl` | `--text-display-m` | `3.5rem` | 56 | 1.06 | `-0.025em` | renamed |
| `--text-6xl` | `--text-display-l` | `4.5rem` | 72 | 1.04 | `-0.026em` | renamed |
| `--text-7xl` | `--text-display-xl` | `6rem` | 96 | 1.02 | `-0.028em` | renamed |

Two things to notice:

- `--text-xs` and `--text-badge` both land on 12. The commission lists them as
  separate steps; the kit has one step there. No value is invented to separate
  them — they are the same size and the manifest says so.
- The kit's `--text-caption` (13px — timestamps, helper text) has **no
  commission name**. It ships as an additive token. If the apps want it they
  reach it by its kwapso name.

So the two thirteens are not the same thirteen: 13 commission names → 12 kit
steps, with one kit step (caption) reachable only under its own name.

### Tracking (2)

| Commission name | kwapso name | Value | |
|---|---|---|---|
| `--tracking-eyebrow` | `--tracking-eyebrow` | `0.08em` | kept · ruling 16 |
| `--tracking-serif` | `--tracking-serif` | `-0.005em` | kept |

## H · Motion — 6

| Commission name | kwapso name | Value | |
|---|---|---|---|
| `--ease` | `--ease` | `cubic-bezier(.16, 1, .3, 1)` | kept |
| `--duration-colour` | `--duration-colour` | `120ms` | kept |
| `--duration-entrance` | `--duration-entrance` | `200ms` | kept · fade + a 4–8px rise |
| `--duration-overlay` | `--duration-overlay` | `360ms` | kept |
| `--default-transition-timing-function` | `--ease` | ↑ | aliased |
| `--default-transition-duration` | `--duration-colour` | ↑ | aliased |

No bounce, no parallax.

## I · Button internals — 8

Every name kept. No manifest entries needed for this group.

| Commission name | kwapso name | Light | Dark | |
|---|---|---|---|---|
| `--btn-primary-hover` | same | `#F4BE4B` | `#F4BE4B` | mango is identical in both palettes |
| `--btn-primary-pressed` | same | `#EDB646` | `#EDB646` | |
| `--btn-secondary-fill` | same | `#F7F2EB` | `#3A3833` | |
| `--btn-secondary-label` | same | `#1A1918` | `#FFFEF9` | |
| `--btn-secondary-hover` | same | `#F1ECE4` | `#454239` | dark GAP-9 |
| `--btn-cancel-hover` | same | `#D8D2C7` | `#322F29` | both GAP-9 |
| `--btn-destructive-hover` | same | `#D33E28` | `#E05540` | dark GAP-9 |
| `--btn-inverse-hover` | same | `#333230` | `#ECE8DF` | dark GAP-9 |

Buttons carry **no border in any state** — no outline, no hairline, no stroke.
A secondary button is a *filled* button in the other paper tone, which is why a
header band and the buttons inside it are never the same paper tone. Keyboard
focus adds the shared ring; that is the one exception and it is an outline at an
offset, not a border.

---

## J · The five that have no kwapso value

Per commission rule 13 ("resolve it, or record it in `notDelivered` with your
recommendation") each carries a recommendation. None is invented into the build
until ruled on.

### J-1 · `--accent` — a name collision with two different meanings

The commission's `--accent` is the **hover/highlight wash on a menu row or list
item**. The kwapso kit's `--accent` is **mango, the brand fill**. Same spelling,
unrelated jobs. Left alone, every menu row in both apps turns mango on hover.

The kit states this wash exactly once — the command palette's active row and the
destructive menu item, at `rgba(26,25,24,.05)`. Neutral row hover is drawn
nowhere, and neither wash has a dark statement (logged as open gap **T12-3**).

**Recommendation, two parts:**

1. **Retire the kwapso `--accent`.** It is already a pure duplicate of
   `--surface-brand` (both are `var(--kw-mango)`), so nothing is lost and the
   spelling is freed. `--ink-on-accent` stays — it names the accent *law*
   ("charcoal on every accent"), which is a different idea.
2. Introduce **`--surface-hover`** = the kit-stated `rgba(26,25,24,.05)`, and
   map the commission's `--accent` onto it. The dark value still needs a
   ruling; until then it holds the light value in both palettes, following the
   scrim precedent already set in CH20.

### J-2 · `--warning` / `--warning-foreground` / `--warning-strong`

**SETTLED 2026-09-02 by the client, and the alternative this section named is
the one that happened.** The recommendation below closed with: *"The
alternative — admitting an eighth brand colour — is a kit decision, not a build
decision, and would need a new ruling."* The client released two, lavender
`#B1A3CF` and orange `#F7953E`, and `--warning` takes the orange.

`--warning` = `--kw-orange`, `--warning-foreground` = `--ink-on-accent`
(charcoal, 7.79:1 — the palette's own admission rule). `--warning-strong` is
the only one of the three still unassigned: it is the warning *word*, orange as
text measures 2.23 on off-beige and 2.02 on soft paper, and nothing in the kit
reads it.

**The history, kept because two components still quote it.** There was no amber
for most of this kit's life; the kit assigns *overdue* to **Poppy** and ruling
26 states plainly that mango is the brand, not a status. The recommendation
here was to fold warning into danger, which shipped and then failed side by side
— "Blocked" and "Overdue" as one chip — so ruling 3B (2026-08-22) moved warning
to the **quiet chip** instead. That was no better on measurement: it made
`--warning` / `--warning-foreground` byte-identical to what
`Badge variant="secondary"` draws. The orange ends both.

The one place the kit uses mango as a warning is the unsaved-changes band:
*"the one place mango appears as a band rather than a button."* That is a named
composition treatment, not a status colour, and it is untouched — as is
`Alert variant="warning"`'s mango dot, which reads `--primary`.

### J-3 · `--chart-4` / `--chart-5`

The kit gives three series colours (sky, forest, poppy) and says they **cycle**.
Never mango (brand, not data), never grey (reads as disabled). The commission
asks for a real five-colour designed series.

Cycling gives `--chart-4` = sky and `--chart-5` = forest, which means a
five-series chart has two indistinguishable pairs. That is a real legibility
problem the commission is right to raise, and it cannot be fixed without
admitting new colours.

**SETTLED 2026-09-02.** The recommendation below — ship the cycle, record it,
put "two more data-safe hues" to the kit as a ruling request — ran its course.
The client released two colours and both are now series of their own:
`--chart-4` = `--kw-lavender` `#B1A3CF`, `--chart-5` = `--kw-orange` `#F7953E`.
Neither is a tint of the existing three, which is what this section said it
would not pick without her call.

Lavender takes 4 and orange takes 5 on hue distance: as HSL angles the five sit
at poppy 7.9, orange 28.2, forest 150.3, sky 207.1, lavender 259.1, and orange
is 20.3 from poppy against a minimum of 52.0 for every other pair. At 4, orange
would neighbour poppy in every four-series chart; at 5 a chart only reaches it
at five series. Neither takes a dark lift — both measure in `--kw-sky`'s band
against a dark card (6.65 and 6.88 against sky's 7.68), not forest's (4.07).

**Still owed, and not these two colours' doing:** the set is told apart by hue
alone. Forest and poppy differ in luminance by a ratio of 1.00, lavender and
orange by 1.03. Label every series directly; colour is never the only channel.

---

## K · Three architectural notes that change how step 1 is written

### K-1 · The Tailwind v4 bridge is what makes renaming safe

Renaming `--background` only stays invisible to the apps because Tailwind v4
resolves `bg-background` through an `@theme` declaration. So `tokens.css` ships
two layers: the kwapso tokens as the real definitions, and an `@theme` block
pointing every Tailwind colour/size/radius/shadow name at them.

Utility classes therefore keep working untouched. What does **not** survive a
rename is app code that writes `var(--background)` directly in its own CSS or an
inline style. The manifest tells the engineer exactly where to look, but those
are edits.

**Recommendation:** ship a short, clearly-marked **compatibility block** at the
end of `tokens.css` aliasing all 53 old names to the new ones
(`--background: var(--surface-page);` …). It costs 53 lines, makes the drop-in
genuinely zero-edit, and can be deleted in a later tag once the call sites are
swept. I will include it unless you say otherwise.

### K-2 · The commission declares no spacing tokens at all

Section 4 has surfaces, type, radius, shadow, motion — and no space. The apps
get their spacing from Tailwind's numeric utilities. Setting `--spacing: 0.25rem`
in `@theme` makes the whole ladder rem-based, so `p-4` scales with the text-size
control and rule 5 holds.

But Tailwind's ladder is linear 4n and ruling 28's is not above step 7
(32 → 48 → 64 → 96 → 128). `p-8` is 32px, which is kwapso `--space-7`. The two
numbering systems disagree, and reading `p-8` as "step 8" would be wrong.

**Recommendation:** components use the named `--space-*` tokens above 32px and
Tailwind numerics below it, and `docs/RULES.md` says so in one line.

### K-3 · Line-height and tracking must ride the size tokens

The commission wants each of the 13 steps to carry its own line-height, and
letter-spacing above `xl`. The repo currently holds those as six shared
`--leading-*` tokens, which loses the per-step table.

Tailwind v4 supports exactly the shape needed —
`--text-h3`, `--text-h3--line-height`, `--text-h3--letter-spacing` — so one
utility sets all three. Step 1 emits the triples, and the shared `--leading-*`
names stay as additive aliases.

---

## L · Additive tokens — kwapso names with no commission counterpart

These ship because components need them. They are not renames and get no
manifest entry; they are listed so nothing arrives as a surprise.

- **Raw palette** — `--kw-mango` `--kw-sky` `--kw-off-beige` `--kw-soft-paper`
  `--kw-charcoal` `--kw-forest` `--kw-poppy`, the unlit papers
  `--kw-unlit-page|panel|raised|quiet`, the lifted accents
  `--kw-forest-lift` `--kw-poppy-lift`. Never consumed directly.
- **Surfaces** — `--surface-panel` `--surface-quiet` `--surface-hover` (new,
  §J-1)
- **Ink** — `--ink-tertiary` `--ink-on-accent`
- **Hairlines** — `--hair-strong`
- **Status** — `--info` (sky)
- **Type** — `--text-caption` (13), `--leading-*` (6), the per-step
  `--tracking-*` (9), `--measure-body`
- **Space** — `--space-1…11` and `--space-1h…4h`
- **Radius** — `--radius-pill`
- **Controls** — `--control-height-dense|field|button|input|row|pill`
  (32/38/40/44/56/26), `--icon-button`, `--dot-status`,
  `--avatar-sm|md|lg` (24/32/48)
- **Buttons** — the `*-fill` and `*-label` halves the commission does not name:
  `--btn-primary-fill` … `--btn-disabled-label`
- **Status pill** — `--pill-fill` `--pill-label`, and the dots
  `--dot-shipped|building|review|blocked|archived|done`
- **Layout** — `--container-marketing|app|document`, `--grid-columns`

---

## M · Two facts about scale that step 1 must not get wrong

- **Base 16, root renders 15.** Everything is authored in rem against a 16px
  reference; `:root` renders at 15px, and `data-scale` moves it to 13 / 15 / 17.
- **The two apps default differently.** The portal sits one step larger than the
  system app. `tokens.css` ships no forced default beyond 15px on `:root`; each
  app sets its own `data-scale` on `<html>`.
