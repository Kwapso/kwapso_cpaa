# RULES

The laws a consuming app must not break.

Every rule here has its reason attached, because a rule without a reason gets
broken the first time it is inconvenient. Where the reason is "someone looked
at it and it was wrong", the artefact that was looked at is named.

Nothing in this file is new. Each law is already enforced by a build gate, a
token comment, `controls/PATTERN.md`, or a recorded ruling in
`GAPS.md`. The pointer is given so you can read the full argument.

**Who this is for.** Anyone writing application code against
`kwapso-design`, and anyone adding to it. If you are adding a *component*,
read `docs/BUILD-A-COMPONENT.md` as well — it is longer and stricter.

---

## 0 · The one-sentence test

> An engineer deletes the old component folder, drops this one in its place,
> changes no application code, and both apps run and look completely new.

Every rule below exists to keep that sentence true. A law that only holds when
someone remembers it is not a law, so most of these are enforced mechanically:

```bash
npm run check
```

runs four things — the token guards, the icon generator's check mode, the demo
state generator's check mode, and `tsc --noEmit`. If any of them fails, the
change does not ship. The guards are described where each rule needs them.

---

## 1 · Size and scale

### 1.1 No `px` in a component. rem only, against a 16px authoring base.

**The rule.** Every measurement in a `.tsx` file is `rem`, or a token that is
`rem`. A `px` literal outside a comment is a rejection.

**The reason.** `:root` renders at **15px**, not 16. A user control moves it:

```css
:root                      { font-size: 15px; }   /* tokens.css §1 */
:root[data-scale="small"]  { font-size: 13px; }
:root[data-scale="medium"] { font-size: 15px; }
:root[data-scale="large"]  { font-size: 17px; }
```

Everything is *authored* against a 16px reference (kit ruling 28) and *renders*
against whichever step the app has set on `<html>`. A `rem` value follows that
control. A `px` value does not — it freezes at its literal size while the text
beside it grows, so the control silently stops working for that one property
and nobody notices until a user at `data-scale="large"` reports that a label
overflows its chip.

The two apps deliberately sit on different steps. The portal is one step above
the system app. Neither is forced by this repo; each sets `data-scale` itself.

**The three exceptions, and they are the only three.** All live in
`tokens/tokens.css`, which is the one file where a size is decided:

| Value | Where | Why it may not scale |
|---|---|---|
| `--focus-width: 2px` · `--focus-offset: 2px` | tokens.css §3 | A focus ring must stay 2px at every text scale; a ring that grew with the type would swamp a dense control. |
| `--radius-pill: 999px` | tokens.css §4 | "Fully round" is not a measurement. |
| shadow geometry | `--shadow-rest` / `-lifted` / `-overlay` | A drop shadow is not type and does not scale. |

The build enforces exactly this list — `PX_ALLOWED` in
`tokens/build-tokens.mjs`. **Guard 3, PX LEAK**, fails the build on anything
else.

**One more px exists and it is a library constraint, not a choice.** Radix's
`sideOffset`, `alignOffset` and `collisionPadding` accept a bare `number`,
read as px, computed in JS by the positioning engine. Every anchored surface
(`dropdown-menu`, `popover`, `hover-card`, `tooltip`, `select`) passes `8`, and
that 8 does not scale. The alternative — zeroing the offset and adding a
token-driven margin — desynchronises from Radix's own collision measurements.
`GAPS.md` ANC-2, ruled: accept it.

### 1.2 The Tailwind spacing trap: `p-8` is 32, which is `--space-7`.

**The rule.** Tailwind numerics are safe **up to and including 32px / `p-8`**.
Above 32px, use the named token in an arbitrary value: `p-[var(--space-8)]`,
`gap-[var(--space-9)]`, `mt-[var(--space-10)]`.

**The reason.** `tokens.css` sets `--spacing: 0.25rem` in `@theme`, which makes
Tailwind's whole numeric ladder rem-based and kwapso-correct — `p-4` is 1rem,
`gap-2` is `--space-2`, `h-3` is 0.75rem. That works because both ladders are
linear 4n *below* 32px. Above it they diverge:

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| kwapso `--space-n` | 4 | 8 | 12 | 16 | 20 | 24 | **32** | **48** | **64** | **96** | **128** |
| Tailwind `p-n` | 4 | 8 | 12 | 16 | 20 | 24 | 28 | **32** | 36 | 40 | 44 |

So `--space-7` is 32 and `p-7` is 28. `p-8` is 32 and `--space-8` is 48. The
numbers stop lining up at exactly the point where the mistake is least visible
in review — nobody reads `p-12` and thinks "that is not on the scale". Written
in the tokens file at §4, under the spacing block.

Only **1px and 2px** live off the scale at all, as grid lines and optical
nudges. Never as layout.

### 1.3 Control heights come from a token, never from a number.

Five heights exist and each has a name (`tokens.css` §4, kit ruling 28):

```
--control-height-dense   2rem      32   dense control, in-overlay, in-field
--control-height-field   2.375rem  38   a field sitting inside a row
--control-height-button  2.5rem    40   THE standing control height
--control-height-input   2.75rem   44   the touch row, and the text field
--control-height-row     3.5rem    56   the table row
--control-height-pill    1.625rem  26
```

**The reason.** A hand-written `h-10` is 40px today and stays 40px if the kit
ever moves the standing control height. `h-[var(--control-height-button)]` is
one edit away from being right everywhere. This is also why a button reads
`h-[var(--control-height-button)] px-5` rather than `h-10 px-5`.

---

## 2 · Colour

### 2.1 No colour defined only inside a media query.

**The rule.** Light values live on bare `:root`. Dark is defined **twice** —
once under `prefers-color-scheme: dark` (§6) and once under
`[data-theme="dark"]` (§7) — and the two blocks must declare an identical set
of names with identical values.

**The reason.** A token defined in only one of the two blocks renders
differently for "system dark" than for "I picked dark". A user whose OS is dark
and who has never touched the theme control sees one colour; a user who
explicitly chose dark sees another. That bug is invisible in review, invisible
in a static check of the file, and miserable to find by eye, because reproducing
it requires you to notice which of two identical-looking paths you are on.

A name defined in dark but **not** in light is worse: its only definition is
inside a media query, so it does not exist at all for a light-mode reader, and
`var(--thing)` falls through to nothing.

**The build fails on both.** `tokens/build-tokens.mjs`:

- **Guard 1 · DRIFT** — the two dark blocks must be identical.
- **Guard 2 · ORPHAN** — a name defined in dark but not in light.
- **Guard 4 · UNRESOLVED** — a `var()` chain that points at nothing.

The two blocks are byte-identical on purpose. When you add a dark value, paste
it into both. Do not try to be clever.

### 2.2 No hex, `rgb()`, `hsl()` or named colour in a `.tsx` file. Ever.

**The reason.** `tokens/tokens.css` is the only file where a colour is decided.
A hex in a component is a colour that does not flip in dark, does not respond
to a palette change, and cannot be found by grepping the token file. The whole
theming mechanism is "one variable, two definitions"; a literal opts out of it.

Three routes to a value, in order of preference — `PATTERN.md` §3:

1. **A bridged Tailwind utility.** `bg-background`, `text-muted-foreground`,
   `border-border`, `bg-surface-quiet`, `text-ink-disabled`, `bg-hair-faint`,
   `border-hair-strong`, `text-ink-on-accent`, `bg-destructive`, `bg-success`,
   `bg-warning`, `bg-info`, `bg-primary`, `rounded-pill`, `ease-kwapso`. The
   full bridge is `tokens.css` §10.
2. **A Tailwind numeric**, where §1.2 says it is safe.
3. **`var(--token)` in an arbitrary value**, for everything not bridged:
   `bg-[var(--btn-primary-fill)]`, `h-[var(--control-height-button)]`,
   `size-[var(--avatar-md)]`, `rounded-[var(--radius)]`.

**`color-mix` is allowed and an alpha is not.** `color-mix(in srgb,
var(--destructive) 65%, transparent)` produces a *colour*, computed from a
token, that re-resolves when the palette flips. `opacity-65` applied to an
element produces a see-through element. The first is in the palette's language;
the second is not. Real uses: `input.tsx`'s 65% error border,
`button.tsx`'s `currentColor 25%` busy ring, the modal scrim.

One caveat, verified in a compiled bundle: Tailwind emits an arbitrary
`color-mix` with the *undiluted* fallback ahead of an `@supports` block, so a
browser without `color-mix` renders the token at full strength.
`GAPS.md` AMB-2.

### 2.3 Disabled is a fill and an ink. Hover is a token. Never an opacity.

**The rule.**

```
disabled  →  cursor-not-allowed bg-[var(--btn-disabled-fill)] text-[var(--btn-disabled-label)]
hover     →  a named token: --btn-*-hover, --hair-strong, bg-accent
```

`disabled:opacity-50` and `hover:opacity-*` are rejections. So is any other
opacity standing in for a state colour.

**The reason.** An alpha applied to a token is a colour the palette does not
contain. It is not a designed value; it is whatever falls out of compositing
that particular token over whatever paper happens to be behind it — which is a
different colour on a page, on a panel, and in a card, and a different colour
again in dark. `--btn-disabled-fill` is one decided colour in each palette. A
50% mango is a hundred colours, none of them chosen.

For a field the disabled pair is `bg-hair-faint text-ink-disabled`, and the
hover shift is **suppressed** as well, so a disabled field never looks
clickable (`input.tsx`).

**What this rule does *not* forbid.** Opacity animating over time, on something
that is not a control and has no states: the skeleton breathes between .30 and
.75 opacity, which is the kit's own drawing. `GAPS.md` CTRL-3 states the
distinction explicitly.

### 2.4 Charcoal on every accent, both modes. Never white on red.

**The rule.** Every accent fill in this system carries charcoal type. A
destructive button is charcoal on poppy. A success chip is charcoal on forest.
An info tag is charcoal on sky. `--primary-foreground`,
`--destructive-foreground`, `--success-foreground` and `--ink-on-accent` are
**all already charcoal**. Trust them; never reach for white.

**The reason.** It is the kwapso accent law, and the palette is built around it:
a new accent is admitted only if it carries charcoal type at *both* its light
and its dark value (`tokens.css` §2). That admission test is why forest was
lightened from `#1F9259` to `#20955B` — charcoal on the old green measured
4.44:1, under AA's 4.5 for the 12px badge label. The correction is also a
warning: the first proposal was to *darken* the green, which moves the fill
toward the charcoal label and drops the ratio to 3.50. On this palette,
contrast against an accent is repaired by making the accent **lighter**.
Ruled 2026-08-22, from `verify/open-decisions.html`; recorded in `tokens.css`
§2 and `GAPS.md` 4B.

### 2.5 Mango is a brand fill. Never a status, never a hover, never a data colour.

**The rule.** `--primary` / `--surface-brand` is mango. It may be a primary
button, `Badge variant="default"`, `Card variant="brand"`. It may not be a
status colour, a hover wash, or a chart series.

**The neutral hover wash is `--accent`** — `rgba(26,25,24,.05)` in light,
`rgba(255,254,249,.05)` in dark. That is the kit's own value for the command
palette's active row and the destructive menu item.

**The reasons, three of them, each observed rather than argued:**

- *As a hover:* put mango on a row hover and every menu row in a toolbar turns
  mango on the way past. The brand stops being a signal and becomes a cursor
  trail. `GAPS.md` BTN-1.
- *As a default:* `Badge` originally defaulted to mango, because the kit draws
  `.kw-badge--accent` in mango. The kit **also** rules one mango per view. Both
  are the kit. Looking at the two side by side in
  `verify/badge-default-comparison.html`, an eight-row list came out with six
  mango chips and the colour stopped carrying any signal. Ruled 2026-08-22: an
  unqualified `<Badge>` is **quiet**. `variant="default"` is untouched and
  still mango, so mango is opt-in — for the pile you are actually working.
  `GAPS.md` BDG-3.
- *As data:* charts never use mango (brand, not data) and never grey (reads as
  disabled). `tokens.css` §3, charts block.

### 2.6 A card's ground is `--surface-panel`, not `--background`.

**The rule.** Any region that contains raised cards uses `bg-surface-panel`.
Reach for `bg-background` only for the page shell itself, behind the panels.

```tsx
<main className="bg-background">                 {/* the page shell */}
  <section className="bg-surface-panel p-6">     {/* the ground */}
    <Card variant="raised">…</Card>              {/* --card, now visible */}
  </section>
</main>
```

**The reason.** In **light**, `--background`, `--card`, `--surface-raised` and
`--popover` are all `#FFFEF9`. Identical. A raised card drawn on the page tone
therefore has contrast **1.000** against its ground and is held up by its
shadow alone. In dark the papers separate properly (1.079–1.198), which is why
this only bites in light and why it survived every static check — it was found
by looking at `verify/open-decisions.html`, not by reading a file. Ruled
2026-08-22 (2B). `PATTERN.md` §11.

**The generalisation, and read this before you place a card.** A card takes
**the other paper tone from the band it sits in**:

| Band | Card | Result |
|---|---|---|
| `bg-background` (off-beige page) | `<Card>` — default, `bg-surface-panel` | soft paper on off-beige · visible |
| `bg-surface-panel` (soft-paper band) | `<Card variant="raised">` — `bg-card` + `shadow-sm` | off-beige on soft paper · visible |
| `bg-surface-panel` | `<Card>` — default | **panel on panel · invisible** |
| `bg-background` | `<Card variant="raised">` | **off-beige on off-beige · shadow only** |

`Card`'s **default variant is `bg-surface-panel`**, not `bg-card`, precisely
because `--card` on the page draws nothing (`GAPS.md` CRD-7). So §2.6's "put
cards on a panel" and "a bare `<Card>` is soft paper" are two halves of one
rule, and the two bad rows above are what you get from applying either half on
its own. The same unresolved upstream mechanism governs which paper tone a
secondary *button* sits on (`GAPS.md` X-2 / kit GAP-10).

### 2.7 A button carries no border. A coloured pill carries no border.

**The rule.** No outline, no hairline, no stroke on a `Button`, in any state.
`variant="outline"` does not exist on `Button` and never will. A secondary
button is a **filled** button in the other paper tone (`--btn-secondary-fill`).

No border on a **coloured** pill either — "colour is the whole treatment", kit
ruling 26. `Badge variant="outline"` is the single *uncoloured* variant and is
therefore the only badge that draws a hairline.

**The reason.** A header band and the buttons inside it are never the same
paper tone, which is what separates them; adding a stroke says the same thing
twice and makes the control look like a field. Keyboard focus adds the shared
ring — that is the one exception, and it is an outline at an offset, not a
border. `tokens.css` §3, button internals; `button.tsx` header.

Form fields and selection controls are the two blessed places a hairline is
allowed at all.

---

## 3 · Focus

### 3.1 Focus is ONE global rule. Write nothing.

```css
/* tokens.css §8 — the whole system's focus treatment */
:focus-visible {
  outline: var(--focus-width) solid var(--focus);
  outline-offset: var(--focus-offset);
}
```

**The rule.** No component defines a ring. Nothing sets `outline: none`,
`focus:outline-none`, `outline-hidden` or `outline-none`, anywhere, for any
reason. No `focus:ring-*`, `focus-visible:ring-*` or `ring-offset-*`.

**The reason.** One rule rings every control at once, at the control's own
radius, because an outline follows border-radius for free. Keyboard shows it; a
mouse does not, because `:focus-visible` is the browser's own judgement of
that. Sixty-five components each writing their own ring is sixty-five chances
for one of them to be 1px, or the wrong colour, or absent. And a single
`outline: none` — usually added to "clean up" a click — removes a control from
keyboard use with no visible symptom for anyone using a mouse.

A field **may** move its own **border** to ink on focus. That is a border
colour, not a ring: `input.tsx` does exactly this and defines no ring.

### 3.2 The inverse-surface exception, and how it works.

```css
.bg-surface-inverse,
[data-surface="inverse"] {
  --focus: var(--focus-inverse);
}
```

**The reason.** `--focus` is charcoal in light. `--surface-inverse` **is**
charcoal. A control on a charcoal panel was therefore drawing its ring at
contrast **1.000** — invisible, in both palettes, because the same collision
happens in reverse in dark. WCAG 1.4.11 wants 3:1. Found by tabbing through
the rendered demo, not by reading the file.

The fix rebinds the **token**, not the rule. Custom properties inherit, so
every descendant's `:focus-visible` picks the flipped value up automatically,
"one ring spec for every control at once" still holds, and no component
changed. Both the utility class and the data attribute are honoured, so a call
site can mark an inverse region either way.

**What this means for you.** If you build an inverse region by any route other
than the `bg-surface-inverse` class, add `data-surface="inverse"` to it. A
charcoal panel that declares neither has invisible focus for every control
inside it.

---

## 4 · Shape

### 4.1 Only four radii exist.

| Radius | Token | Write it as | For |
|---|---|---|---|
| **24** | `--radius` | `rounded-[var(--radius)]` · 51 uses | boxes — cards, panels, sections, rows, menus, textareas |
| **999** | `--radius-pill` | `rounded-pill` · 106 uses | pills — buttons, chips, badges, avatars, fields, switches, sliders |
| **6** | `--radius-select` / `--radius-md` | `rounded-select` **or** `rounded-[var(--radius-select)]` | the square selection **mark** (the checkbox) |
| **4** | `--radius-sm` / `--radius-bar` | `rounded-[var(--radius-sm)]` · 4 uses | bars, heat cells, the rotated decision node |

`rounded-pill`, `rounded-select` and `rounded-bar` are the three registered in
the `@theme inline` bridge. The other two forms are arbitrary values, which is
why they are written `rounded-[var(--…)]`. **`rounded-sm` is *not* bridged** —
it is Tailwind's own key re-pointed by `:root`, so it carries the same
import-order dependency as `rounded-lg` (§4.2) and no shipped component uses
it. Write `rounded-[var(--radius-sm)]`.

**The reason.** Kit ruling 03: a third box radius is forbidden, so the
seven-step Tailwind radius ladder flattens onto three values. `--radius-lg`,
`--radius-xl`, `--radius-2xl` and `--radius-3xl` are **all re-pointed to
1.5rem (24)**.

### 4.2 `rounded-lg` is 24. Do not reach for it meaning "slightly rounded".

**The rule.** Do not use `rounded-lg`, `rounded-xl`, `rounded-2xl`,
`rounded-md` or `rounded-sm` in a component. Use one of the four forms above.

**Two reasons, and the second is the load-bearing one:**

1. `rounded-lg` renders at **24px**, not 8. Everything the apps draw at
   `rounded-lg` today lands at 24, which is the intended migration — but a
   *new* component whose author typed `rounded-lg` meaning "8-ish" gets a
   card-sized corner on a 32px chip.
2. Those keys resolve correctly **only if `tokens.css` happens to load after
   Tailwind's theme.** Verified in the compiled bundle: Tailwind's own theme
   emits `--radius-lg: 0.5rem` and `tokens.css`'s `:root` emits
   `--radius-lg: 1.5rem`; the kwapso value wins by cascade order alone. A
   component may not depend on import order. The same is true of
   `rounded-sm`. `rounded-pill`, `rounded-select` and `rounded-bar` are
   registered in the `@theme inline` bridge and have no such dependency.

**A fifth radius invented for one component is a rejection.**

### 4.3 The four radii do not map onto "everything selectable is 6".

Read strictly, ruling 03 would make every selection control 6. What the kit
actually **draws** is one shape at 6 — the square checkbox mark — and pills
everywhere else: radio, switch track and knob, slider bar and fill, segment,
select trigger. A literal reading produces a 6px-radius radio button (a rounded
square where a radio has been a circle since 1973) and a 6px select trigger in
a form full of pill-shaped `Input`s.

The operative sentence is `GAPS.md` GEN-1's: *6 is the radius of a square
**mark**. A control whose shape is a channel, a disc or a capsule is a pill; a
control that is a field takes the field's radius; a surface is 24.*

---

## 5 · States

### 5.1 States that exclude each other are resolved in JS, not stacked as variants.

**The rule.**

```tsx
const state = disabled ? "disabled" : locked ? "readOnly" : invalid ? "error" : "default";
// … then one cva `state` variant emits exactly ONE class set.
```

Write the precedence down in the file header. `input.tsx` is the model, and its
precedence is `disabled > read-only (and loading) > error > default`.

**The reason.** `disabled:border-x`, `[readonly]:border-y` and
`aria-invalid:border-z` carry **identical CSS specificity**. Which one paints
is then decided by the order Tailwind happens to emit them in — which is a
property of the build, not of your component, and can change when a class is
added somewhere else entirely. A component may not depend on that.

**States that stack are utilities, with a guard**, so they cannot fight:
`enabled:hover:bg-[…]` rather than `hover:bg-[…]`, so a disabled control never
matches a hover rule in the first place.

**Where a variant and a state conflict**, compose in JS and let
`tailwind-merge` drop the loser — `button.tsx` appends its `DISABLED_FILLED`
string *after* the cva result rather than writing `disabled:` utilities.

### 5.2 `enabled:` does not work on an anchor. This is a system-wide trap.

**The rule.** If your component can render as an `<a>` — via `asChild`, or
because it is a link by nature — do **not** import `buttonVariants`, and do not
guard with `enabled:`.

**The reason.** `:enabled` matches form elements only. On an `<a>`,
`enabled:hover:bg-[var(--btn-primary-hover)]` **never matches at all**. The
hover silently disappears: no error, no type failure, nothing visible in review
until someone hovers a link in a browser. Every interactive rule in
`button.tsx` is `enabled:`-guarded, so every one of them is dead on an anchor.

`pagination` handles this correctly and is the model: it copies the geometry
from `button.tsx` with a comment saying so, and re-expresses the guard as a JS
branch on the resolved state (`disabled > current > idle`). `GAPS.md` PAG-2.

### 5.3 All ten states are named, applicable or not.

Every component's JSDoc carries this block, numbered, with **every line
present**:

```
 * TEN STATES
 *  1. default        — …
 *  2. hover          — …
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — …
 *  5. disabled       — …
 *  6. loading        — …
 *  7. empty          — …
 *  8. error          — …
 *  9. selected       — …
 * 10. read-only      — …
```

**The reason.** Silently omitting a state is a rejection; naming it and saying
in one line why it does not apply is not. The difference is that a reader can
tell "we decided this does not apply" apart from "we forgot". `skeleton.tsx`
has seven of the ten not applying and all seven are written down.

**This block is not decoration — it is parsed.** `demo/gen-states.mjs` lifts it
out of each of the 65 file headers and emits `demo/states.generated.ts`, which
is what the demo renders. A note reading "NOT here", "does not apply" or "not
apply" is rendered as an explanation; anything else is rendered as an example.
`npm run check` runs the generator in `--check` mode and **fails if the
generated file is stale**. Edit the JSDoc, re-run `npm run build:states`.

### 5.4 Loading has three answers, and prefer nothing to a placeholder.

| Shape | Answer | Where |
|---|---|---|
| A **control** | keeps its own fill, grows a spinner, sets native `disabled` and `aria-busy`, and skips the disabled *skin* | `button.tsx` |
| A **field** | takes the read-only skin, becomes non-editable, sets `aria-busy` | `input.tsx` |
| A **value** | renders nothing | `badge.tsx` |

**The reasons.** The kit draws a submitting button as itself, not as a dead one
— so `loading` on a Button keeps the variant fill, and only genuinely
`disabled` takes the disabled skin. Typing into a field whose value has not
arrived loses what you typed, so a loading field is locked. And a count that
has not arrived is **not "0"** — a badge with no positive count renders `null`
(`.kw-badge:empty { display: none }`). Never invent a dash or a zero to fill a
hole.

`loading` is a boolean. There is no `loading="lazy" | "eager"`.

---

## 6 · Motion

### 6.1 A component adds ONE class from `motion/motion.css`. It writes no duration.

```tsx
<DialogContent className={cn("motion-dialog", className)} />
<li className="motion-row" data-state="open" />
<button className="motion-button" />
```

57 classes, covering all 16 cases of the commission's section 10. If a
component needs motion this file does not have, the fix is **a new class
there**, not a local transition.

**The reason.** Every duration and every curve in `motion.css` is a `var()` —
there is not one literal `200ms` or `cubic-bezier(...)` in a rule body. The feel
of the whole system changes by editing `tokens/tokens.css` and nowhere else. A
local transition is a value that edit will miss.

Most classes are **stateful**: they read `data-state="open" | "closed"`, which
every Radix primitive already sets, so one class covers entrance and exit.
Non-Radix components reach the same keyframes through explicit `-in` / `-out`
classes.

### 6.2 The entrance signature is fade plus a rise. No bounce, no parallax.

Opacity 0 → 1 and `translateY(--motion-rise)` → 0, over `--duration-entrance`,
on `--ease-entrance`. **8px** (`--motion-rise`) for a panel, dialog or page;
**4px** (`--motion-rise-tight`) for a row, a menu item, a chunk.

Nothing enters by scaling up, spinning in, or flying from a corner. No curve in
this system overshoots. No two layers move at different rates to fake depth —
depth is carried by `--shadow-*`, which is paper, not physics.

Exits fall by the **tight** distance whatever they rose by, because a dismissal
that retraces its entrance exactly reads as an undo, not as a close.

### 6.3 Reduced motion is handled at the token layer. Except for three things.

`tokens.css` §9 zeroes all seven non-looping durations under
`prefers-reduced-motion: reduce`, so every transition and every keyframe
animation that resolves its duration from a token completes instantly at its
end state. **No component has to remember.**

Three things it deliberately does not cover:

1. **Loops.** `--duration-spin`, `--duration-pulse`, `--duration-caret` and
   `--duration-bar` are *not* zeroed. A zero-length infinite animation does not
   run at all, and a frozen spinner is worse than a moving one — it is the only
   thing telling the reader work is still happening. The loops that are
   decoration rather than status are switched off explicitly in
   `motion.css` §18.
2. **Transforms that persist as a state** rather than playing over a duration —
   the drag lift is the one case. A zero duration makes it snap rather than
   removes it.
3. **A Tailwind keyframe animation you write yourself.** `animate-spin` and
   friends are not covered by the token zeroing and need
   `motion-reduce:animate-none` written by hand. Or slow it instead of freezing
   it, which is what `button.tsx`'s busy ring does:
   `motion-reduce:[animation-duration:2.4s]`.

---

## 7 · Strings, numbers and direction

### 7.1 Every user-facing string is a prop with a default.

```tsx
label = "Loading…"        // ✔ a default, overridable per locale
thousandSuffix = "k"      // ✔ even a one-letter suffix is a string
<span>Loading…</span>     // ✘ rejection
```

**The reason.** The apps run in **Arabic, Urdu and Persian**. A hardcoded
`"Loading…"` inside a component cannot be translated by the application, and
the only fix is a fork of the component.

That includes strings a screen reader announces but a user never sees:
`aria-label`, `aria-valuetext`, the visually-hidden line under a chart.

**The best default is no string at all.** Where a component can avoid holding
one, do that instead. `button.tsx` keeps its children while loading and takes
an optional `loadingLabel`, so it hardcodes nothing.

### 7.2 Every printed number goes through `Intl`.

**The reason.** `String.padStart` and template literals produce ASCII digits in
every locale. A document served as `ar-EG-u-nu-arab` should get Arabic-Indic
numerals with nothing passed and no component knowing anything about numbering
systems — which is exactly what `Intl.NumberFormat(undefined, …)` does. Naming
no locale is the point: the runtime's own resolution wins.

Five components take a formatter prop as the escape hatch:
`Rating.formatNumber`, `ProgressToggle.formatNumber`,
`StatusStepper.formatNumber` / `formatProgress` / `formatOverflow`,
`Stopwatch.formatDuration`. `Badge` takes `formatCount` plus two translatable
suffixes. Separators (`:`, `/`) are left as punctuation — same glyph in all
three scripts; a locale that disagrees replaces the whole formatter.
`GAPS.md` LOC-1.

### 7.3 LTR only — but write logical properties anyway.

**The decision.** RTL is **out of scope**, by client decision on 2026-08-22.
Kit ruling 10 had already put it out of scope; the commission asked for
`rtl: true`; the client settled it as LTR-only. `manifest.json → rtl` is
`false`.

**The rule that survives it.** Use logical properties only: `px-*` (which is
`padding-inline`), `ms-*`, `me-*`, `start-*`, `end-*`. Never `pl-*`, `pr-*`,
`left-*`, `right-*`.

**The reason for keeping the rule after the decision.** All 65 primitives were
written with logical properties throughout, and `motion.css` carries `[dir=rtl]`
mirrors for the sheet, the tab indicator and the stepper connector. That was
not reverted, because reverting 65 files to physical properties is pure risk
for zero gain — logical properties resolve **identically** in LTR. If RTL is
ever wanted, the components are most of the way there and the missing piece is
a Radix `DirectionProvider` at the app root. A new physical property is a step
back from a door that is currently open.

`manifest.json → notDelivered`, first entry.

---

## 8 · The token file

### 8.1 Never edit `tokens/tokens.json`. It is generated.

```bash
# edit tokens/tokens.css, then:
npm run build:tokens     # regenerates tokens.json
npm run check:tokens     # guards only, writes nothing
```

The file's own first line says so: *"GENERATED by tokens/build-tokens.mjs from
tokens.css. Do not hand-edit."* A hand edit is overwritten by the next build,
silently, and in the meantime the four guards are checking a file that no
longer describes the CSS.

### 8.2 `tokens.css` is the only file where a colour or a size is decided.

No component writes a px, a hex, or a font-size. Commission rules 5 and 13,
restated in the tokens file's own header as convention 1.

### 8.3 The raw palette (`--kw-*`) is internal.

`tokens.css` §2 holds the seven brand colours, four unlit papers and two lifted
accents, and marks them *"Never consumed by a component; §3 is the layer
components read."*

There is exactly **one** logged exception in the whole repository, and it is
worth understanding because it shows what a legitimate exception looks like:
the modal and drawer scrims. The kit states them as literals and explicitly
declines to draw a dark twin — charcoal in both palettes. But every semantic
token that is charcoal in light **flips to off-beige in dark**
(`--foreground`, `--surface-inverse`, `--focus`), so mixing from any of them
produces a *white scrim in dark mode*. `dialog`, `alert-dialog` and `sheet`
therefore write `color-mix(in srgb, var(--kw-charcoal) 36%, transparent)`,
commented at the point of use in all three. Reaching one layer down and saying
so is more honest than reaching sideways to `--ink-on-accent` and hiding it.
`GAPS.md` OVL-2, which also carries the recommended `--scrim` /
`--scrim-drawer` tokens that would close it.

---

## 9 · API and packaging

### 9.1 Never rename or drop an export, a component, or a variant value.

**The rule.** The export list is a **minimum**. You may **add** a variant; you
may never rename or drop one. Variant values are the commission's, spelled
exactly: `default`, `secondary`, `destructive`, `outline`, `sm`, `lg`, `icon`.

**The reason.** 1,122 existing call sites import these names, and
`manifest.json → renamedFrom` is empty **by design** — no alias bridge exists,
because none is needed. A rename means either a bridge or a sweep of two
applications, which is the failure this whole delivery exists to prevent.

An added variant takes the kit's own word for it (`inverse`, `cancel`, `info`),
never a coined one, and carries a comment saying it is an addition and which
specimen draws it.

### 9.2 No default exports.

Named exports only, at the bottom of the file: the component, and the `cva`
function when other components need the same skin. Same reason as 9.1 — 1,122
call sites import by name, and a default export makes the imported name a
property of the call site rather than of the component.

### 9.3 The dependency list is closed.

Permitted: `react`, `react-dom`, `next`, `tailwindcss` v4, `clsx`,
`tailwind-merge`, `class-variance-authority`, `@radix-ui/*`, `recharts`,
`sonner`, `next-themes`.

Anything else is a rejection. `cmdk` was wanted for the command palette and the
machinery was hand-built instead (`GAPS.md` CMD-1); a mapping library was
wanted for `Map` and the component was scoped around its absence (`MAP-1`).

**The reason.** Two production applications vendor this source directly. Every
dependency here becomes a dependency of both, forever, with their bundle size
and their CVE surface.

If you *do* add a permitted dependency that was not installed, save it to
`package.json` at the resolved version and record it in
`manifest.json → extraDependencies`. `sonner` was once present in
`node_modules` and in neither file, which means `npm ci` against the delivered
manifest would not have installed it and `sonner/sonner.tsx` would have failed
to resolve. `GAPS.md` DEP-1.

### 9.4 Never re-implement `cn`.

```tsx
import { cn } from "../../lib/utils";     // two levels up. The only route.
```

One implementation, `clsx` + `twMerge`, in `lib/utils.ts`. A second
one is a second merge policy, and the difference between them shows up as a
class that stops overriding.

### 9.5 No product vocabulary in a primitive.

No "ticket", "sprint", "account", "system" — in a name, a prop, a default
string, or a comment. `List`, not `TicketList`.

**The reason.** A primitive that knows what a ticket is cannot be used for
anything that is not a ticket, and the name is then wrong in every other
context it gets pulled into. Collections in `structures/` are where
domain shapes live.

---

## 10 · Wiring it up

### 10.1 Import order is part of the contract.

```css
@import "kwapso-design/tokens/tokens.css";
@import "kwapso-design/motion/motion.css";
```

and for the Tailwind build:

```css
@import "tailwindcss" source(none);
@import "../tokens/tokens.css";
@source "../components/**/*.{ts,tsx}";
```

**Two reasons, both verified against a compiled bundle:**

1. **`tokens.css` must come after Tailwind.** Several keys — `--radius-lg`,
   `--text-sm--line-height` and its siblings — exist in *both* Tailwind's
   default theme and kwapso's `:root`, and the kwapso value wins by cascade
   order alone. Load them the other way round and `rounded-lg` is 8 and
   `text-sm` gets Tailwind's leading instead of the kit's 1.45.
2. **`source(none)` plus an explicit `@source`.** Tailwind v4's automatic
   source detection scans markdown. `PATTERN.md` §9 and this file both quote
   real forbidden class names — `disabled:opacity-50`, `outline-none`,
   `rounded-lg` — so with automatic detection on, every one of them gets
   compiled into the bundle and a reviewer grepping the output finds exactly
   the thing the list forbids. With `source(none)` the explicit `@source` scans
   only component source. Verified with tailwindcss 4.3.3: the bundle then
   contains **no** `opacity-*`, `outline-none`, `outline-hidden`, `ring-*`,
   `rounded-lg`, `rounded-md`, `rounded-xl` or `rounded-2xl` rule at all.

### 10.2 Theme and scale are set on `<html>`, by the app.

```html
<html data-theme="dark" data-scale="large">
```

Leave `data-theme` off to follow the system. Leave `data-scale` off to get the
15px default. This repo forces neither — see §1.1 and §2.1 for why both
mechanisms exist.

An anti-flash script for the stored theme belongs to the **app shell**, not to
a primitive: it has to run before first paint, which is before any component
mounts. `GAPS.md` MDT-2.

### 10.3 Pin a tag. A version that is not tagged here does not exist.

Apps pin to a git tag. A design change reaches an app only when someone
deliberately bumps it. This is the whole safety mechanism: the design system can
move without any application moving with it.

---

## 11 · Honesty

### 11.1 A logged gap is fine. A guess that looks like law is not.

If the kit does not settle something, write the entry in `/GAPS.md` — the
component, what is unspecified, what you did, and **why** — and keep going.

**The reason.** Every value in this system can be traced. A derived value that
says it is derived can be corrected in one edit by whoever rules on it. A
derived value that looks stated gets built on, and by the time it is found
wrong it has twelve dependents. `GAPS.md`'s entries marked **CONTRADICTION** are
not gaps in the kit — they are two parts of the kit disagreeing, or the kit
disagreeing with the commission, with both sides quoted so the controlling
session can rule.

### 11.2 Things you must know before you trust a value

These are unresolved *today*. They are not bugs to work around silently; they
are open questions with owners.

| | State | What to do |
|---|---|---|
| **`--chart-4` / `--chart-5`** | Placeholders repeating `--chart-1` and `--chart-2`. A five-series chart shows two indistinguishable pairs. | Do not ship a five-series chart. Bundle the fix with the new brand colours. |
| **`--warning`** | Provisionally the **quiet chip**, pending new colours. There is no amber in the kwapso palette. | A warning badge is currently visually identical to `Badge variant="secondary"`. The word carries the whole meaning. |
| **`--hair-faint`** | Role disputed — line colour or surface? Two chapters of the kit assign it differently. | It is currently used as a *surface* (disabled and read-only field fills). `Separator` deliberately offers no `faint` variant so the dispute is not frozen by accident. |
| **Icon artwork** | All 96 are **placeholder**. Names, React API, five sizes and `currentColor` wiring are final. | Build against the names. The swap is one command. |
| **Fonts** | Saans and SerrifCondensed are named first in `--font-sans` / `--font-serif` with real fallback stacks. The files are not shipped — a licence question. | Nothing renders blank. Expect the fallback until the licence resolves. |
| **`AvatarImage`** | Kit ruling 30 forbids photographs; 45 call sites already use it. | Built, with the two-character fallback enforced. Needs a ruling either way. |

The full list with reasoning is `manifest.json → notDelivered` and `STATUS.md`.

---

## Appendix · The rejection list, in one screen

Copy this into a review checklist.

**Colour and size**
- Any `#hex`, `rgb()`, `hsl()` or named colour in a `.tsx` file
- Any `px` value outside a comment
- Any hardcoded font size
- `rounded-lg` / `rounded-xl` / `rounded-2xl` / `rounded-md`
- A fifth radius, invented for one component

**Focus**
- `focus:outline-none`, `outline-hidden`, `outline-none`, anywhere, for any reason
- `focus:ring-*`, `focus-visible:ring-*`, `ring-offset-*`, or any per-component focus treatment

**States**
- `disabled:opacity-50`, or any opacity used as a disabled state
- `hover:opacity-*`, or any opacity used as a hover state
- A hover that uses `--primary` / mango
- A missing state — all ten are named, applicable or not
- A state stacked as a same-specificity utility against another state
- `enabled:` on anything that can render as an `<a>`

**Colour semantics**
- White type on an accent
- A border on a Button, in any state
- A border on a coloured pill

**API**
- A renamed or dropped export; a renamed or dropped variant value
- A default export
- A re-implemented `cn`
- A dependency outside the permitted list

**Strings and structure**
- Any user-facing string that is not a prop with a default
- A printed number that did not go through `Intl`
- `pl-*` / `pr-*` / `left-*` / `right-*`
- Product vocabulary in a primitive
- A missing `displayName`
- Blanket `"use client"`

**Honesty**
- A silent invention

---

## Where to read further

| For | Read |
|---|---|
| What a token means and when to reach for it | `docs/TOKENS.md` |
| Adding a new component | `docs/BUILD-A-COMPONENT.md`, then `controls/PATTERN.md` — the deeper reference, and the one a reviewer will hold you to |
| Why a value is what it is | `GAPS.md` — every ruling carries its reasoning |
| What is delivered and what is not | `manifest.json`, `STATUS.md` |
| The four exemplars | `button/` · `badge/` · `input/` · `skeleton/` |
