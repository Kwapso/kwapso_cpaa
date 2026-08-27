# TOKENS

235 custom properties as of **v0.5.0**, grouped by the job they do.

> The live figure is always `tokens/tokens.json → counts.declared`, and it
> moves as work lands — step 7 is adding a `--folder-*` geometry group as this
> is written. Take the count as a marker, not a contract; take the *groups* as
> the contract.

This is a lookup. Find the role you need, read what the group is *for*, then
pick within it. Nothing here is alphabetical, because you never know a token's
name before you know what you are trying to paint.

**Source of truth:** `tokens/tokens.css`. It carries the reasoning inline and
is the only file in the system where a colour or a size is decided.
`tokens/tokens.json` is **generated** from it — never hand-edit it.

**Unresolved values are flagged** in this file with a **⚠** and gathered again
at the end. A reader must not discover those the hard way.

---

## 0 · The three mechanisms

Before the tables, the three things that make a token behave.

### The palette flip

Light values live on bare `:root`. Dark is defined **twice** — once under
`@media (prefers-color-scheme: dark)` for viewers who never chose, once under
`:root[data-theme="dark"]` so an explicit choice wins in both directions. The
two blocks are byte-identical, and `build-tokens.mjs` fails the build if they
drift.

**Consequence for you:** a token that is *not* listed in the dark tables below
does not flip. It is one value in both palettes, either because it is already
right in both (`--radius`, `--space-4`) or because it is a `var()` chain onto
something that flips (`--surface-page` → `--background`). **39 tokens flip.**

```html
<html data-theme="dark">   <!-- pin it -->
<html>                     <!-- follow the system -->
```

### The text-size control

`:root` renders at **15px**. Every measurement is authored in `rem` against a
**16px** reference, so `1rem` in this file is 16 at the authoring base and 15 as
shipped. `data-scale` on `<html>` moves the root:

| `data-scale` | root |
|---|---|
| `small` | 13px |
| *(none)* / `medium` | 15px |
| `large` | 17px |

Everything in `rem` follows. The px values in this file — three of them — do
not, and each says why at the point of use.

**The scale is root-only, and cannot be scoped to a subtree.** The selector is
`:root[data-scale=…]` and every type step is `rem`, which resolves against the
root and nothing else — so `data-scale` on a wrapper does nothing at all. One
consequence worth knowing before you design around it: **a single document
cannot show the system at 15px and the portal at 17px.** Anything that needs
both doors at once — a staff member previewing what a client sees, a support
tool with the portal embedded — needs an iframe or a second document. Ruled
2026-08-23 (override 16); the alternative, re-authoring the sixteen type
tokens as `calc()` against an inheriting `--scale`, was declined.

### The Tailwind bridge

`tokens.css` §10 is an `@theme inline` block that teaches Tailwind's utility
namespace where the tokens live. `inline` matters: the utility references the
runtime custom property rather than snapshotting a value, which is what lets a
single class flip with the palette.

A token **on the bridge** has a utility (`bg-surface-panel`). A token **not on
the bridge** is reached as an arbitrary value
(`h-[var(--control-height-button)]`). Both are correct; the utility is
preferred where it exists. The bridge is inert without Tailwind — nothing in it
decides a value.

---

## 1 · The raw palette — internal, do not consume

`tokens.css` §2. The seven official brand colours, the four unlit papers, the
two lifted accents. **No component reads these.** §2 onward is the layer
components read. There is exactly one logged exception in the whole repository
(the modal scrim — see `docs/RULES.md` §8.3).

| Token | Value | Note |
|---|---|---|
| `--kw-mango` | `#FED069` | **PRIMARY.** A fill, never a data colour. |
| `--kw-sky` | `#89BCE6` | informational |
| `--kw-off-beige` | `#FFFEF9` | the kwapso "white" |
| `--kw-soft-paper` | `#F7F2EB` | panels, the second paper tone |
| `--kw-charcoal` | `#1A1918` | the kwapso "black" |
| `--kw-forest` | `#20955B` | shipped · healthy |
| `--kw-poppy` | `#E94A32` | blocked · overdue · destructive |
| `--kw-unlit-page` | `#141310` | dark surfaces. Never grey. |
| `--kw-unlit-panel` | `#1C1B18` | |
| `--kw-unlit-raised` | `#26241F` | |
| `--kw-unlit-quiet` | `#2F2D28` | |
| `--kw-forest-lift` | `#2FB673` | dark only |
| `--kw-poppy-lift` | `#F2634B` | dark only |

**The admission test.** A new accent joins this list only if it carries
charcoal type at *both* its light and its dark value. That test is why
`--kw-forest` is `#20955B` and not the original `#1F9259`: charcoal on the
old green measured 4.44:1, under AA's 4.5 for the 12px badge label. Note the
direction of the repair — the green had to get **lighter**. Darkening moves
the fill toward the charcoal label and drops the ratio to 3.50.

---

## 2 · Surfaces — what paper is this drawn on

**Reach for these first.** In this system, separation between regions is
carried by *paper tone*, not by borders. Get the paper right and you usually
need no line at all.

| Token | Light | Dark | For |
|---|---|---|---|
| `--background` | `#FFFEF9` | `#141310` | The page shell. Behind the panels, and nothing else. |
| `--surface-page` | → `--background` | | Alias, reads better in layout code. |
| `--surface-panel` | `#F7F2EB` | `#1C1B18` | **The ground for a band that contains cards.** The second paper tone. |
| `--card` | `#FFFEF9` | `#26241F` | A raised card, sitting on a panel. |
| `--surface-raised` | → `--card` | | Alias. |
| `--popover` | `#FFFEF9` | `#26241F` | The floating layer: menu, popover, dialog, tooltip. `--shadow-overlay`, `--radius` (24). |
| `--muted` | `#FAF9F7` | `#2F2D28` | Inactive tabs, idle wells. |
| `--surface-idle` | → `--muted` | | Alias. |
| `--secondary` | `#F7F2EB` | `#3A3833` | A secondary *control* is a FILLED control in the other paper tone. |
| `--surface-quiet` | `#E2DDD4` | `#3A3833` | Disabled wells, skeletons, tracks, the quiet chip. **The dark value is lifted** — override 12. |
| `--surface-inverse` | `#1A1918` | `#FFFEF9` | Charcoal panel in light, off-beige in dark. Flips. |
| `--surface-brand` | `#FED069` | *same* | Mango. One per view. |
| `--accent` | `rgba(26,25,24,.05)` | `rgba(255,254,249,.05)` **⚠** | **The neutral hover/active wash.** A row, a menu item, a well. |

### Which paper, when

| You are drawing | Use |
|---|---|
| the page shell | `bg-background` |
| a band that contains cards | `bg-surface-panel` |
| a card on that band | `<Card variant="raised">` → `bg-card shadow-sm` |
| a card on the bare page | `<Card>` → default, which is `bg-surface-panel` |
| a menu, popover, dialog | `bg-popover` |
| a row hover | `bg-accent` |
| a nested detail block inside a card ("well") | `bg-accent` |
| the last block on a page — a sum, a decision, a next step | `bg-surface-inverse` |

**The trap this table exists to prevent.** In **light**, `--background`,
`--card`, `--surface-raised` and `--popover` are **all `#FFFEF9`**. Identical.
A raised card on the page tone has contrast 1.000 against its ground and is
held up by shadow alone. In dark the papers separate properly (1.079–1.198),
which is why this only bites in light. A card takes **the other paper tone
from the band it sits in** — always. See `docs/RULES.md` §2.6.

**⚠ `--accent` in dark is derived, not kit-stated.** The kit gives the light
wash and draws no dark twin. Derived by the kit's own hairline method: carry
the alpha, flip the ink. Charcoal at 5% on unlit paper would be invisible, so
holding the light value would have been a *broken* hover, not a cautious one.
`GAPS.md` T12-3 / `manifest.json → notDelivered`.

---

## 3 · Ink — what colour is the type

Four tiers, plus two that belong to a specific ground.

| Token | Light | Dark | For |
|---|---|---|---|
| `--foreground` | `#1A1918` | `#FFFEF9` | Tier 1. Body copy, headings, values. |
| `--ink-primary` | → `--foreground` | | Alias. |
| `--ink-secondary` | `#4a4946` | `#d5d1c9` | Tier 2. Supporting copy, a quiet chip's label. |
| `--muted-foreground` | `#5f5d59` | `#bdb9b1` | Tier 3. Labels, metadata, hints **and placeholders**. |
| `--ink-tertiary` | → `--muted-foreground` | | Alias. |
| `--ink-disabled` | `#a8a59f` | `#76746f` | Disabled only. |
| `--ink-on-inverse` | `#FFFEF9` | `#1A1918` | Type on `--surface-inverse`. Flips with it. |
| `--ink-on-accent` | `#1A1918` | *same* | **The accent law, as a token.** Charcoal, both modes. |
| `--ink-on-inverse-secondary` | `#BFBEBA` | `#5A5957` | The **second** tier on `--surface-inverse`. Flips with it. |
| `--ink-on-accent-secondary` | `#5E5030` | *same* | The second tier on mango. Mango does not flip, so neither does this. |

The last two exist because the artifact quietens a line on an accent with
`opacity: .7` and reaches for a `--invfg2` it never defines. An opacity is a
rejection, and `--ink-secondary` is the charcoal-on-paper tier, unreadable on
either accent. Each value is the accent's own ink carried toward its ground —
72% on charcoal, 70% on mango — resolved to a solid hex so nothing depends on
what is behind it. Measured: mango 5.42:1 under a 12.07:1 primary; inverse
9.44 light / 6.93 dark under 17.39. Override 13. **Reach for these on any
accent ground; never an opacity.**

Foreground pairs that always travel with their surface:
`--card-foreground`, `--popover-foreground`, `--accent-foreground`,
`--secondary-foreground` — all resolve to the tier-1 ink for their palette.

**Notes that matter.**

- Ruling 27 folded the old *hint* tier into tier 3, so a placeholder and a
  metadata label are the same ink. There is no separate placeholder token.
- **Disabled is exempt from contrast.** `--ink-disabled` deliberately does not
  clear AA. Disabled means disabled and nothing else.
- `--ink-on-accent` is charcoal in **both** palettes and is the only ink token
  that does not flip. That is the accent law: charcoal on mango, on poppy, on
  forest, on sky, in light and in dark. **Never white on red.**

---

## 4 · Lines — the three hairline weights

Borders are rare in this system. A button never has one. A coloured pill never
has one. Form fields and selection controls are the two blessed places.

| Token | Light | Dark | For |
|---|---|---|---|
| `--hair-faint` **⚠** | `rgba(26,25,24,.06)` | `rgba(255,254,249,.08)` | Role disputed. Currently used as a **fill**: the disabled and read-only field. |
| `--border` | `rgba(26,25,24,.08)` | `rgba(255,254,249,.12)` | Fields, selection controls, same-tone card separation, table rows. |
| `--hair` | → `--border` | | Alias. |
| `--input` | → `--border` | | Alias. |
| `--hair-strong` | `rgba(26,25,24,.20)` | `rgba(255,254,249,.24)` | Section rules. A field's and a selection mark's **resting** edge — CH09's `--hair2`, override 42. Not a hover; a field has none. |

**⚠ `--hair-faint`'s role is disputed and you should know before you use it.**
Two chapters of the kit assign the three weights differently: chapter 1 gives
6% to "same-tone splits", 8% to table rows and 20% to section rules; chapter 2
gives 8% to fields and selection controls and names no role for 6%. Design-
mothership GAP-4 is the open question. `tokens.css` carries the dispute forward
with the annotation `! GAP-4 role disputed`.

In practice this repository uses it as a **surface**: `input.tsx` draws the
disabled and read-only field as `bg-hair-faint`, following T9-3. The
alternatives (`--surface-idle`, `--surface-quiet`) are heavier and would make a
disabled field read as a filled well. **`Separator` deliberately offers no
`faint` variant** — giving the 6% weight a public name would freeze one side of
the dispute by accident. `GAPS.md` INP-4, SEP-2.

---

## 5 · Brand and status

| Token | Light | Dark | For |
|---|---|---|---|
| `--primary` | `#FED069` | *same* | Mango. **A brand fill.** Primary button, `Badge variant="default"`, `Card variant="brand"`. |
| `--primary-foreground` | `#1A1918` | *same* | Charcoal. |
| `--destructive` | `#E94A32` | `#F2634B` | Poppy. Blocked · overdue · destructive. |
| `--destructive-foreground` | `#1A1918` | *same* | Charcoal, **not white**. |
| `--success` | `#20955B` | `#2FB673` | Forest. Shipped · healthy · done. |
| `--success-foreground` | `#1A1918` | *same* | Charcoal. |
| `--info` | `#89BCE6` | *same* | Sky. Informational. |
| `--warning` **⚠** | → `--surface-quiet` | | **Provisional.** The quiet chip. |
| `--warning-foreground` **⚠** | → `--ink-secondary` | | |
| `--warning-strong` **⚠** | → `--ink-primary` | | |

### What mango may and may not be

**May:** a primary button, an opt-in `Badge variant="default"`, a brand card,
one per view.
**May not:** a status, a hover, a data series.

Three separate observations produced that rule. As a hover, every menu row in a
toolbar turns mango on the way past. As a badge *default*, an eight-row list
came out with six mango chips and the colour stopped carrying any signal —
which is why an unqualified `<Badge>` is now quiet, ruled 2026-08-22 from
`verify/badge-default-comparison.html`. As a data colour it is brand, not data.

**The neutral hover wash is `--accent`.** Never `--primary`.

### ⚠ `--warning` is a holding position

**There is no amber in the kwapso palette.** Seven brand colours and none of
them is one. The kit assigns "overdue" to Poppy, and ruling 26 states mango is
the brand, not a status.

The first answer was to fold warning into poppy. Seen side by side, that put
two different states in one colour — "Blocked" and "Overdue" were the same chip
— which was worse than losing the colour. So on 2026-08-22 (ruling 3B) warning
dropped to the **quiet chip**, and poppy now means blocked and nothing else.

**What this means today:** `<Badge variant="warning">` and
`<Badge variant="secondary">` render **identically**. The word carries the
whole difference. `--warning-strong` has no distinct tone; it resolves to
`--ink-primary` rather than inventing a deeper amber.

**This is provisional.** The client is adding colours. When an amber or
equivalent exists, `--warning` takes it and the block goes.

> Note: `badge.tsx`'s inline comment and `GAPS.md` BDG-1 both still describe
> the *earlier* answer (warning → poppy). `tokens.css` §3 is current and this
> table follows it.

---

## 6 · Charts

| Token | Light | Dark | |
|---|---|---|---|
| `--chart-1` | `#89BCE6` sky | *same* | |
| `--chart-2` | `#20955B` forest | `#2FB673` | |
| `--chart-3` | `#E94A32` poppy | `#F2634B` | |
| `--chart-4` **⚠** | → `--chart-1` | | placeholder |
| `--chart-5` **⚠** | → `--chart-2` | | placeholder |
| `--chart-negative` | `#E94A32` | `#F2634B` | A negative value or a downward delta. |

**Two standing prohibitions.** Never mango — brand, not data. Never grey — it
reads as disabled.

**⚠ Four and five are placeholders.** The kit designs three series and says
they cycle, so 4 and 5 repeat 1 and 2. **A five-series chart currently shows
two indistinguishable pairs.** Do not ship one. Two dedicated data-safe hues
need a kit ruling, and the client is bundling it with the new brand colours.
`GAPS.md` CHT-1, `manifest.json → notDelivered`.

---

## 7 · Focus

| Token | Light | Dark | |
|---|---|---|---|
| `--focus` | `#1A1918` | `#FFFEF9` | The ring colour. |
| `--ring` | → `--focus` | | Alias, for the Tailwind `ring` namespace. |
| `--focus-inverse` | `#FFFEF9` | `#1A1918` | The ring **on an inverse surface**. |
| `--focus-width` | `2px` | | Deliberately px — see below. |
| `--focus-offset` | `2px` | | Deliberately px. |

**You do not use these.** `tokens.css` §8 is one bare rule that rings every
control in the system at once, at the control's own radius:

```css
:focus-visible {
  outline: var(--focus-width) solid var(--focus);
  outline-offset: var(--focus-offset);
}
```

No component defines a ring. Nothing sets `outline: none`.

**Why the two px.** A ring must stay 2px at every text scale; a ring that grew
with the type would swamp a dense control. These are two of the three px values
the build's `PX_ALLOWED` list permits.

**Why `--focus-inverse` exists.** `--focus` is charcoal and `--surface-inverse`
**is** charcoal, so a control on a charcoal panel was drawing its ring at
contrast **1.000** — invisible, in both palettes. WCAG 1.4.11 wants 3:1. Found
by tabbing through the rendered demo. The fix rebinds the token rather than
adding a rule:

```css
.bg-surface-inverse,
[data-surface="inverse"] { --focus: var(--focus-inverse); }
```

Custom properties inherit, so every descendant picks it up. **If you build an
inverse region by some other route, add `data-surface="inverse"`.**

---

## 8 · Shape — exactly four radii

| Value | Token | Write it as | For |
|---|---|---|---|
| **24** | `--radius` · `--radius-card` | `rounded-[var(--radius)]` | Boxes. Cards, panels, sections, rows, menus, textareas. |
| **999** | `--radius-pill` | `rounded-pill` *(bridged)* | Pills. Buttons, chips, badges, avatars, fields, switches, sliders, radios. |
| **6** | `--radius-select` · `--radius-md` | `rounded-select` *(bridged)* | The square selection **mark** — the checkbox, and nothing else. |
| **4** | `--radius-sm` · `--radius-bar` | `rounded-[var(--radius-sm)]` | Bars, heat cells, the rotated decision node. "A bar is not a box." |

Three keys are on the `@theme inline` bridge — `--radius-pill`,
`--radius-select`, `--radius-bar` — and their utilities are order-independent.
`rounded-sm` is **not** bridged: it is Tailwind's own key re-pointed by
`:root`, so it carries the same import-order dependency as `rounded-lg` and no
shipped component uses it.

**Re-pointed, deliberately.** `--radius-lg`, `--radius-xl`, `--radius-2xl` and
`--radius-3xl` are **all `1.5rem` (24)**. Kit ruling 03 forbids a third box
radius, so the seven-step ladder flattens onto three values and everything the
apps draw at `rounded-lg` today lands at 24.

**Do not write `rounded-lg` in a new component.** Two reasons: it means 24, not
"slightly rounded"; and it resolves correctly only if `tokens.css` loads after
Tailwind's theme, because both define the key.

**Six is narrower than it sounds.** Read strictly, "selection controls take 6"
would give you a 6px-radius radio button. What the kit *draws* is one shape at
6 — the square mark — and pills everywhere else. The operative sentence
(`GAPS.md` GEN-1): *6 is the radius of a square **mark**. A control whose shape
is a channel, a disc or a capsule is a pill; a control that is a field takes
the field's radius; a surface is 24.*

**A fifth radius invented for one component is a rejection.**

---

## 9 · Elevation — three shadows, seven names

Paper shadows. Never blue, never inner.

| Token | Light | Dark | For |
|---|---|---|---|
| `--shadow-rest` | `0 1px 2px rgba(26,25,24,.05)` | `0 1px 2px rgba(0,0,0,.40)` | A raised card at rest. |
| `--shadow-lifted` | `0 6px 20px -6px rgba(26,25,24,.14)` | `0 6px 20px -6px rgba(0,0,0,.55)` | Something picked up — a dragged card, a hovered tile. |
| `--shadow-overlay` | `0 18px 48px -12px rgba(26,25,24,.22)` | `0 18px 48px -12px rgba(0,0,0,.70)` | The floating layer: dialog, drawer, menu, popover. |

The Tailwind names are `var()` chains onto those three, so they follow the
palette flip without being restated in dark:

| Utility | Resolves to |
|---|---|
| `shadow-2xs` `shadow-xs` `shadow-sm` | `--shadow-rest` |
| `shadow-md` `shadow-lg` | `--shadow-lifted` |
| `shadow-xl` `shadow-2xl` | `--shadow-overlay` |

**This bridge is load-bearing, not tidiness.** Tailwind v4 **inlines** its own
default shadow values into the utility instead of referencing a variable. Before
the seven keys were re-pointed in `@theme inline`, `shadow-md` emitted a generic
grey drop shadow no matter what `--shadow-md` said at `:root` — and, the worse
half, it **could not flip in dark**, because there was no variable in the rule
to flip. Found by compiling the bundle and reading it, not by review.
`GAPS.md` CTRL-7.

---

## 10 · Spacing — eleven steps and four half-steps

Kit ruling 28: eleven steps on the 4px grid, plus four half-steps on a 2px
sub-grid for use *inside* a component — "and there is no fifth".

| Token | rem | px | For |
|---|---|---|---|
| `--space-1` | `0.25rem` | 4 | dot to label, icon nudge |
| `--space-2` | `0.5rem` | 8 | chip padding, icon to label |
| `--space-3` | `0.75rem` | 12 | control gap, card grid gap |
| `--space-4` | `1rem` | 16 | form rows, list rows |
| `--space-5` | `1.25rem` | 20 | side padding, narrow |
| `--space-6` | `1.5rem` | 24 | card inset, panel inset |
| `--space-7` | `2rem` | **32** | card inset large, page pad |
| `--space-8` | `3rem` | **48** | block gap inside a section |
| `--space-9` | `4rem` | **64** | section gap |
| `--space-10` | `6rem` | **96** | section gap large |
| `--space-11` | `8rem` | **128** | chapter break |

Half-steps, inside a component only:

| Token | rem | px | For |
|---|---|---|---|
| `--space-1h` | `0.375rem` | 6 | tight inline runs |
| `--space-2h` | `0.625rem` | 10 | dense row gap |
| `--space-3h` | `0.875rem` | 14 | panel row gap |
| `--space-4h` | `1.125rem` | 18 | panel inset |

### The numbering trap — read this once and remember it

`tokens.css` sets `--spacing: 0.25rem` in `@theme`, which makes Tailwind's
whole numeric ladder rem-based and kwapso-correct. `p-4` is 1rem. `gap-2` is
`--space-2`. **Safe up to 32px / `p-8`.**

Above 32px the two ladders diverge, because kwapso goes 32 → 48 → 64 → 96 → 128
and Tailwind goes 4n:

|  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `--space-n` | 4 | 8 | 12 | 16 | 20 | 24 | **32** | **48** | **64** | **96** | **128** |
| Tailwind `p-n` | 4 | 8 | 12 | 16 | 20 | 24 | 28 | **32** | 36 | 40 | 44 |

So **`p-8` is 32, which is `--space-7`**, and `p-7` is 28, which is not on the
kwapso scale at all. Above 32px write the named token:
`p-[var(--space-8)]`, `gap-[var(--space-9)]`, `mt-[var(--space-10)]`.

Only **1px and 2px** live off the scale, as grid lines and optical nudges.
Never as layout.

---

## 11 · Type

### The two families

| Token | Value |
|---|---|
| `--font-sans` | `"Saans", system-ui, -apple-system, "Segoe UI", sans-serif` |
| `--font-serif` | `"SerrifCondensed", Georgia, "Times New Roman", serif` |

**⚠ The font files are not shipped** — redistribution is an open licence
question. Both families are named first with a real fallback stack behind them,
so nothing renders blank. Expect the fallback until the licence resolves.

### The weights — Saans ships two

| Token | Value |
|---|---|
| `--font-weight-light` · `--font-weight-normal` | `300` |
| `--font-weight-medium` · `--font-weight-semibold` · `--font-weight-bold` · `--font-weight-extrabold` | `500` |

Six commission names map onto the two weights Saans actually ships. **500 is the
"bold" of this system.** `font-bold` renders identically to `font-medium` —
that is correct, not a mistake. Display sizes lean on scale and tight tracking
rather than heavier weight.

`font-light` and `font-medium` are real Tailwind utilities. `font-[var(--font-weight-medium)]`
is the equivalent arbitrary form and both appear in shipped components.

### The steps — thirteen commission steps plus `caption`

Each step carries its **own line-height and letter-spacing as sibling
properties**, and all fourteen are registered in the `@theme inline` bridge, so
**one utility class sets all three**.

| Utility | Size | rem | Leading | Tracking | Weight | For |
|---|---|---|---|---|---|---|
| `text-micro` | 11 | `0.6875rem` | 1.3 | `0.08em` | 500 | UPPERCASE eyebrows **only** |
| `text-xs` | 12 | `0.75rem` | 1.35 | 0 | 500 | same step as `badge` |
| `text-badge` | 12 | `0.75rem` | 1.35 | 0 | 500 | badges, counts, status (ruling 02) |
| `text-caption` | 13 | `0.8125rem` | 1.4 | 0 | 300 | timestamps, helper text *(additive — the kit's step, kept)* |
| `text-sm` | 14 | `0.875rem` | 1.45 | 0 | 300 | **button and control labels** |
| `text-base` | 16 | `1rem` | 1.45 | 0 | 300 | body |
| `text-lg` | 18 | `1.125rem` | 1.4 | 0 | 300 | |
| `text-xl` | 20 | `1.25rem` | 1.3 | `-0.01em` | 500 | |
| `text-2xl` | 24 | `1.5rem` | 1.25 | `-0.014em` | 500 | |
| `text-3xl` | 32 | `2rem` | 1.18 | `-0.02em` | 500 | |
| `text-4xl` | 44 | `2.75rem` | 1.08 | `-0.025em` | 500 | |
| `text-5xl` | 56 | `3.5rem` | 1.06 | `-0.025em` | 500 | |
| `text-6xl` | 72 | `4.5rem` | 1.04 | `-0.026em` | 500 | |
| `text-7xl` | 96 | `6rem` | 1.02 | `-0.028em` | 500 | |

`xs` and `badge` are the same size deliberately: the kit has one step there and
no value was invented to separate the two commission names.

**Write `text-badge`, never `text-[length:var(--text-badge)]`.** The arbitrary
form still compiles, but it sets font-size **only** and silently drops the
step's leading and tracking. That is the exact bug the bridge was added to fix:
Tailwind's own theme has no `--text-*--letter-spacing` sub-key, so before
`CTRL-8` every `text-3xl` in the system emitted size and leading and dropped
the kit's tracking on the floor — while looking correct in the token file.

### The named leading tiers

Six tiers sit behind the per-step values, reachable by name when you need to
override:

| Token | Value |
|---|---|
| `--leading-tight` | `1.02` |
| `--leading-snug` | `1.18` |
| `--leading-h3` | `1.25` |
| `--leading-h4` | `1.3` |
| `--leading-normal` | `1.45` |
| `--leading-loose` | `1.60` |

### Tracking, by name

| Token | Value |
|---|---|
| `--tracking-display-xl` | `-0.028em` |
| `--tracking-display-l` | `-0.026em` |
| `--tracking-display-m` | `-0.025em` |
| `--tracking-h1` | `-0.025em` |
| `--tracking-h2` | `-0.02em` |
| `--tracking-h3` | `-0.014em` |
| `--tracking-h4` | `-0.01em` |
| `--tracking-normal` | `0em` |
| `--tracking-eyebrow` | `0.08em` (ruling 16) |
| `--tracking-serif` | `-0.005em` |

`--tracking-display-m` and `--tracking-h1` are the same value; both names are
kept because both are the kit's. `GAPS.md` TYP-1.

### Measure

| Token | Value | |
|---|---|---|
| `--measure-body` **⚠** | `62ch` | The kit's prose says 68 and the kit's CSS says 62/66. 62 taken; `GAPS.md` GAP-8 / AB-1. |

---

## 12 · Control geometry

### Heights — five, and one for a pill

| Token | rem | px | For |
|---|---|---|---|
| `--control-height-dense` | `2rem` | 32 | dense control — in a field, in an overlay |
| `--control-height-field` | `2.375rem` | 38 | a field sitting inside a row |
| `--control-height-button` | `2.5rem` | 40 | **THE standing control height** |
| `--control-height-input` | `2.75rem` | 44 | the touch row, and the text field |
| `--control-height-row` | `3.5rem` | 56 | the table row |
| `--control-height-pill` | `1.625rem` | 26 | |

**Note the 40 / 44 tension.** The kit sets **one** standing control height, 40,
at every width, and separately names 44 "the touch row". 40 is under the 44
most mobile guidance asks for, and the kit gives Button no responsive behaviour
at all. Built as drawn: 40 at all three breakpoints; `size="lg"` (44) is
available where a call site wants the touch row. Unruled — `GAPS.md` BTN-4.

### Icons — five delivery sizes

| Token | rem | px |
|---|---|---|
| `--icon-16` | `1rem` | 16 |
| `--icon-20` | `1.25rem` | 20 |
| `--icon-22` | `1.375rem` | 22 |
| `--icon-24` | `1.5rem` | 24 |
| `--icon-32` | `2rem` | 32 |
| `--icon-button` | → `--icon-16` | the glyph inside a button |

A component never writes the px. It asks for a size and gets the token, so an
icon rescales with the text-size control like everything else.

**⚠ All 96 icon exports are placeholder artwork** — a rounded frame with a
per-name dot pattern, deliberately and visibly not final. The **names**, the
React API, the five sizes and the `currentColor` wiring are **final**. Build
against them; the swap is `icons/<Name>.svg` plus one generator run.

### Marks and avatars

| Token | rem | px |
|---|---|---|
| `--avatar-sm` | `1.5rem` | 24 |
| `--avatar-md` | `2rem` | 32 |
| `--avatar-lg` | `3rem` | 48 |
| `--dot-status` | `0.4375rem` | 7 |

Kit ruling 30: square for a thing, pill for a person, at 24/32/48 with
`flex: none`. Two initials, never three. *(The ruling also says "never a
photograph", and 45 call sites already pass `AvatarImage` — `GAPS.md` AVA-1,
open.)*

---

## 13 · Status pill

Kit ruling 26: the **dot names the state; the label always says it in words**,
so the dot never carries meaning alone. No border on any coloured pill — colour
is the whole treatment.

| Token | Light | Dark | Means |
|---|---|---|---|
| `--pill-fill` | → `--background` | `#26241F` | |
| `--pill-label` | → `--foreground` | | |
| `--dot-shipped` | `#20955B` | `#2FB673` | shipped |
| `--dot-done` | `#20955B` | `#2FB673` | done |
| `--dot-building` | `#1A1918` | `#FFFEF9` | "in build" / "with us" — charcoal, not a colour |
| `--dot-review` | → `--info` | | in review |
| `--dot-blocked` | `#E94A32` | `#F2634B` | blocked |
| `--dot-archived` | → `--ink-disabled` | | archived |

Note there is no mango dot. Mango is the brand, not a status.

---

## 14 · Layout

| Token | rem | px | For |
|---|---|---|---|
| `--container-marketing` | `75rem` | 1200 | |
| `--container-app` | `77.5rem` | 1240 | |
| `--container-document` | `60rem` | 960 | |
| `--grid-columns` | `12` | | *No component consumes this today — `GAPS.md` CTN-2.* |

Which of the three measures is the default is not stated by the kit —
`GAPS.md` CTN-3.

**Breakpoints** are Tailwind v4's defaults: `sm` 40rem · `md` 48rem · `lg`
64rem · `xl` 80rem. The system's own three are mobile `<40rem`, tablet
`40–63.99rem`, desktop `≥64rem`. The one stated form breakpoint is **48rem**:
one column below, two above, never three — and it belongs to the `form` shell,
not to any field.

---

## 15 · Motion

Every duration and every curve in `motion/motion.css` is a `var()` onto these.
Change the feel of the whole system here and nowhere else.

### Curves — four, and none of them overshoots

| Token | Value | For |
|---|---|---|
| `--ease` · `--ease-entrance` | `cubic-bezier(.16, 1, .3, 1)` | **Entrances.** Expo-out: arrives fast, settles. |
| `--ease-exit` | `cubic-bezier(.4, 0, 1, 1)` | **Dismissals.** Accelerates away. |
| `--ease-move` | `cubic-bezier(.4, 0, .2, 1)` | **A to B on screen.** Symmetric. |
| `--ease-linear` | `linear` | **Loops only.** A rotation on any other curve visibly wobbles. |

`--ease` is an *entrance* curve. It is wrong for a dismissal, which should
accelerate away, and wrong for a move between two on-screen positions, which
needs symmetry. That is why there are four and not one. **No bounce, no
parallax** — kwapso law from the kit.

### Durations — shortest first

| Token | Value | For |
|---|---|---|
| `--duration-lift` | `90ms` | Drag pick-up. Must beat the pointer or the card feels detached from the finger; 120ms already lags. |
| `--duration-colour` | `120ms` | Colour swaps. |
| `--duration-exit` | `140ms` | Every dismissal. Shorter than an entrance — `--duration-entrance` run backwards feels like a hesitation. |
| `--duration-entrance` | `200ms` | Entrances — fade plus a 4–8px rise. |
| `--duration-settle` | `280ms` | Something travelling a real on-screen distance and coming to rest: a drop, a reordered row, a pull-to-refresh snap-back. |
| `--duration-overlay` | `360ms` | Overlays. |
| `--duration-advance` | `480ms` | A progress bar or stepper moving to a new value. The eye has to follow it — the slowest non-looping duration in the system. |

Two Tailwind defaults are pre-set so a bare `transition-colors` is already
kwapso-timed:

```css
--default-transition-timing-function: var(--ease);
--default-transition-duration:        var(--duration-colour);
```

Restate `duration-[var(--duration-colour)] ease-kwapso` in a component anyway,
so it does not depend on import order.

### Loops — and why these are *not* zeroed under reduced motion

| Token | Value | For |
|---|---|---|
| `--duration-spin` | `700ms` | One full rotation. **Kit-stated** (ch07 state matrix: "700ms spin / 1.4s bar"). |
| `--duration-bar` | `1400ms` | The indeterminate progress sweep. **Kit-stated**, same sentence. Not the spinner's clock — a bar crossing the full width needs twice the time a rotation does. |
| `--duration-pulse` **⚠** | `1600ms` | Skeleton breathe. **Derived** — the kit sets the opacity pair and the stagger but never a period. Slow enough to read as "waiting", not "broken". |
| `--duration-caret` | `1100ms` | Streaming caret blink. |
| `--motion-stagger` | `100ms` | **Kit-stated**: skeleton bars are "staggered 100ms down the list". |

`tokens.css` §9 zeroes the **seven non-looping** durations under
`prefers-reduced-motion: reduce`. These four are deliberately left alone: a
zero-length infinite animation does not run at all, and a frozen spinner is
worse than a moving one — it is the only signal that work is in progress. The
loops that are *decoration* rather than *status* (skeleton breathe, caret
blink, indeterminate sweep) are switched off explicitly in `motion.css` §18,
where the thing being animated is known.

### Distances

| Token | Value | For |
|---|---|---|
| `--motion-rise` | `0.5rem` (8) | Panels, dialogs, pages. |
| `--motion-rise-tight` | `0.25rem` (4) | Rows, menu items, chunks. **Also every exit**, whatever it rose by — a dismissal that retraces its entrance exactly reads as an undo, not as a close. |
| `--motion-lift-scale` | `1.015` | Drag pick-up. Not a bounce: no overshoot, it holds while dragging. |

Both distances are `rem`, so the entrance signature grows with the text-size
control.

### Bridged names

`ease-kwapso` → `--ease` · `ease-kwapso-exit` → `--ease-exit` ·
`ease-kwapso-move` → `--ease-move`.

---

## 16 · Button internals

A button carries **no border in any state**. A secondary button is a *filled*
button in the other paper tone — which is why a header band and the buttons
inside it are never the same paper tone.

| Token | Light | Dark |
|---|---|---|
| `--btn-primary-fill` | → `--primary` | |
| `--btn-primary-label` | → `--primary-foreground` | |
| `--btn-primary-hover` | `#F4BE4B` | *same* |
| `--btn-primary-pressed` | `#EDB646` | *same* |
| `--btn-secondary-fill` | → `--secondary` | |
| `--btn-secondary-label` | → `--secondary-foreground` | |
| `--btn-secondary-hover` **⚠** | `#F1ECE4` | `#454239` |
| `--btn-inverse-fill` | → `--surface-inverse` | |
| `--btn-inverse-label` | → `--ink-on-inverse` | |
| `--btn-inverse-hover` **⚠** | `#333230` | `#ECE8DF` |
| `--btn-cancel-fill` | `#E2DDD4` | `#26241F` |
| `--btn-cancel-label` | → `--ink-secondary` | → `--ink-tertiary` |
| `--btn-cancel-hover` **⚠** | `#D8D2C7` | `#322F29` |
| `--btn-destructive-fill` | → `--destructive` | |
| `--btn-destructive-label` | → `--destructive-foreground` | |
| `--btn-destructive-hover` **⚠** | `#D33E28` | `#E05540` |
| `--btn-disabled-fill` | → `--surface-quiet` | `#2F2D28` | **Pinned in dark.** `--surface-quiet` was lifted for legibility (override 12) and disabled must not follow it: at `#3A3833` a disabled control would sit lighter than an enabled secondary, which in dark is the panel tone `#1C1B18`. |
| `--btn-disabled-label` | → `--ink-disabled` | |

**⚠ The hover values marked above are not in the kit** (`GAPS.md` GAP-9). Each
is one step along the same hue from its fill. They are recorded rather than
presented as kit law.

**Which paper tone is "the other"** depends on the band the button sits in, and
that mechanism is unresolved upstream (kit GAP-10 / `GAPS.md` X-2).
`Button variant="secondary"` reads `--btn-secondary-fill` and does nothing
clever; if a container re-resolves that variable, the button follows with no
change to the component.

---

## 17 · Everything unresolved, in one place

Twenty tokens carry an unresolved flag in `tokens.json`. These are the ones
that will bite you.

| | State | What it means for you today |
|---|---|---|
| `--chart-4` · `--chart-5` | **Placeholder.** Repeat 1 and 2. | A five-series chart shows two indistinguishable pairs. Do not ship one. Bundled with the client's new colours. |
| `--warning` · `--warning-foreground` · `--warning-strong` | **Provisional.** The quiet chip. | `Badge variant="warning"` is visually identical to `variant="secondary"`. The word carries the meaning. Revisit when the new palette lands. |
| `--hair-faint` | **Role disputed.** Line or surface? | Used as a surface (disabled/read-only field fill). `Separator` offers no `faint` variant on purpose. Settle GAP-4 before relying on it. |
| `--accent` in dark | **Derived**, not kit-stated. | The light wash with the ink flipped. Correct-looking, unconfirmed. |
| `--measure-body` | Kit prose says 68, kit CSS says 62/66. | 62 taken. Three different reading measures exist across the kit — `GAPS.md` AB-1. |
| `--duration-pulse` | **Derived.** The kit never states a period. | 1600ms, chosen to read as "waiting" not "broken". |
| `--btn-*-hover` (five) | **Not in the kit.** | One step along the same hue. |
| `--font-sans` · `--font-serif` | Files **not shipped** — a licence question. | Fallback stacks render. Nothing is blank. |
| Icon artwork (all 96) | **Placeholder.** | Names, API, sizes, `currentColor` are final. |
| `--grid-columns` | Declared, consumed by nothing. | |
| No `--scrim` token exists | Three components mix from `--kw-charcoal` directly. | `GAPS.md` OVL-2 carries the two-line fix. |

Everything here is in `manifest.json → notDelivered` or `GAPS.md`, with the
full reasoning. Read it before trusting a value.

---

## 18 · Rebinding a token on a ground — and the trap in it

Some tokens are **relational**: what they should be depends on what they sit
on. `--focus` must flip on a charcoal panel, and so must every hairline. The
mechanism is a rebind block keyed on the ground:

```css
.bg-surface-inverse,
[data-surface="inverse"] {
  --focus: var(--focus-inverse);
  --hair:  var(--hair-inverse);
}
```

**That block alone does not work, and the way it fails is silent.**

A custom property's value is substituted at **computed-value time on the
element where it is declared**. `--hairline` is declared on `:root` as
`inset 0 0 0 1px var(--hair)`, so `:root`'s charcoal is baked into it *there*,
and the resolved string inherits down untouched. Rebinding `--hair` on a
descendant changes `--hair` and nothing else.

Measured on a live probe before this was fixed: on the inverse element
`--hair` read `rgba(255,254,249,.12)` — correctly flipped — while `--hairline`
on the **same element** still read `inset 0 0 0 1px rgba(26,25,24,.08)`.
Charcoal on charcoal. Every rule on a charcoal panel drew at **contrast
1.000**, in both palettes, and had done since the token was written.

**So the rule is: rebind the token AND redeclare every shape built from it**,
in the same block. `tokens.css` §10 now redeclares all nine `--hairline*`
shapes alongside `--hair`.

### The second half of the trap: the class has to match

The block selects on `.bg-surface-inverse` and `[data-surface="inverse"]`. A
component that writes the ground as `bg-[var(--surface-inverse)]` gets the
right *background* and **matches neither selector**, so it receives neither
the flipped hairline nor the flipped focus ring. Nine components did exactly
that. Use the bridged utility, not an arbitrary value.

`verify/hairline-probe.html` checks both spellings in both palettes and takes
about ten seconds to run. Run it after touching anything in that block.

## Changing a token

```bash
# 1 · edit tokens/tokens.css — the ONLY place a colour or size is decided
# 2 · if it is a dark value, paste it into BOTH dark blocks (§6 and §7)
npm run build:tokens     # regenerates tokens.json
npm run check            # all four gates
```

The four guards in `tokens/build-tokens.mjs`, each of which catches a bug that
is invisible in review:

| Guard | Fails on | Because |
|---|---|---|
| 1 · **DRIFT** | the two dark blocks disagreeing | a token in only one renders differently for "system dark" than for "I picked dark" |
| 2 · **ORPHAN** | a name defined in dark but not in light | its only definition is inside a media query |
| 3 · **PX LEAK** | a px outside the allowlist | a px does not scale, so the text-size control silently stops working for that property |
| 4 · **UNRESOLVED** | a `var()` chain pointing at nothing | |

The allowlist is exactly: `--shadow-*` geometry, `--focus-width`,
`--focus-offset`, `--radius-pill`.

Never edit `tokens/tokens.json`. It is generated, and a hand edit is
overwritten by the next build.
