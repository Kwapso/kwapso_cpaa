# BUILD A COMPONENT

How to add a new component to this system so that it looks native, passes the
gate, and does not have to be revisited.

You do not need to have seen this system before, and you do not need a designer
to ask. Everything a designer would tell you is already written down; this
document tells you where, and in what order.

**The deeper reference is `components/PATTERN.md`.** This document
is its public-facing form: the same law, arranged as a procedure, with the
reasons pulled forward. Where the two could ever be read as disagreeing,
`PATTERN.md` wins — it is what a reviewer holds you to, and it carries detail
this file compresses.

**Read `docs/RULES.md` too.** It is the shorter list of things you must not
break, and every rule there applies to a new component as well as to an
application.

---

## Contents

1. [Before you write anything](#1--before-you-write-anything)
2. [Where the file goes](#2--where-the-file-goes)
3. [The file, end to end](#3--the-file-end-to-end)
4. [The header comment — four sections, all required](#4--the-header-comment--four-sections-all-required)
5. [Where every value comes from](#5--where-every-value-comes-from)
6. [Variants, with cva](#6--variants-with-cva)
7. [The ten states](#7--the-ten-states)
8. [Three breakpoints](#8--three-breakpoints)
9. [Strings, numbers and direction](#9--strings-numbers-and-direction)
10. [`"use client"`](#10--use-client)
11. [Traps that have already caught someone](#11--traps-that-have-already-caught-someone)
12. [Register it](#12--register-it)
13. [Run the gate](#13--run-the-gate)
14. [When the kit does not settle it](#14--when-the-kit-does-not-settle-it)
15. [The rejection list](#15--the-rejection-list)
16. [A worked example, start to finish](#16--a-worked-example-start-to-finish)

---

## 1 · Before you write anything

### 1.1 Check it does not already exist

```bash
ls components          # 108 folders
grep -n '"YourName"' manifest.json
```

`manifest.json` is the catalogue: every component, its file, its exports, its
props and its states. If the name is in there, extend that component rather
than adding a second one.

### 1.2 One tier, not two

**RETIRED 2026-08-26.** This section used to be "Decide: primitive or
collection?", with a table sorting every component into `controls/` (a
button, a field, a badge) or `structures/` (a table, a board, a thread) —
two folders, two sets of rules. The client, verbatim: "i still don't
understand the difference between controls / structures. please merge
them, and rename to components." They merged, flat, into one `components/`
folder — no subfolder split either, so there is no `components/controls/`
or `components/structures/` to sort into. There is no decision to make any
more: every component goes in `components/`, one folder per component.

**What the old table was actually protecting, and why it still matters even
though the folder split is gone.** The distinction was never really about
which folder a file sat in — it was about SCOPE. Some components know
about one control or one shape and nothing else (a button knows nothing
about tickets); others are an assembly of those, shaped around a domain
concept (a `DataTable` is built out of buttons and badges, and a
`TicketThread` knows what a thread is). That difference in scope is still
real and still worth thinking about when you write a component — it is just
no longer expressed as a folder choice:

- **No product vocabulary in a small, single-purpose component.** No
  "ticket", no "sprint", no "account", no "system" — in a name, a prop, a
  default string, or a comment. `List`, not `TicketList`. A component that
  knows what a ticket is cannot be used for anything that is not a ticket,
  and the name is then wrong in every other context it gets pulled into.
- **A component built from other components should build from the small,
  general ones, not from another domain-shaped one.** The one recorded
  exception is the shared empty/error register, and even that runs one way
  only. `GAPS.md` COL3-3.

If you are unsure which kind you are writing, look at four or five
components near it alphabetically in `components/` and match the nearest
one's shape — the folder itself carries no signal any more, but the file
you are about to write should still look like the ones next to it.

### 1.3 Pick the exemplar you are copying

Four components set the four shapes everything else follows. Open the one that
matches and read it alongside this document — it is faster than any prose.

| Exemplar | Shape it sets | Copy it for |
|---|---|---|
| `button/` | variant + size cva, disabled, loading | `toggle`, `pagination`, `mode-toggle`, any control |
| `badge/` | status-coloured chip, empty-when-zero | `alert`, status pills, tags, counts |
| `input/` | form field, exclusive states | `textarea`, `select`, `search-input`, `checkbox`, `switch` |
| `skeleton/` | stateful placeholder, composite parts | `spinner`, `progress`, empty/loading registers |

### 1.4 Find what the kit draws

Every component in this repository names its **DESIGN SOURCE** — a specimen
file and a class. Yours must too. If the kit draws nothing for your component,
that is not a blocker; it is a `GAPS.md` entry (see §14). What it is *not* is a
blank line in your header.

---

## 2 · Where the file goes

```
components/<name>/<name>.tsx
```

One folder, one file, one lowercase kebab name **matching the folder**.

- `components/status-chip/status-chip.tsx` ✔
- `components/StatusChip/index.tsx` ✘

The folder name is also the demo's anchor id and the manifest key, so a
mismatch breaks two things quietly.

---

## 3 · The file, end to end

This is the whole skeleton. Everything in it is required.

```tsx
/* ============================================================================
   <Name> — one line on what it is (<n> direct call sites).

   DESIGN SOURCE
   Which kwapso specimen file and which class you drew from. Name it. If you
   drew from nothing, that is a GAPS.md entry, not a blank line.

   THE LAW THIS FILE OBEYS
   The three or four kit rulings that actually bind this component, in your
   own words, so the next reader does not have to re-derive them.

   RENDERING CONTEXT
   Why this file does or does not carry "use client".
   ========================================================================= */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const nameVariants = cva(
  [
    "base classes",            // an array, one concern per line, commented
  ],
  {
    variants: {
      variant: { /** one JSDoc line per variant, naming its kit source */ },
      size: { /** ditto */ },
    },
    compoundVariants: [
      // emitted last, so tailwind-merge lets them override a variant or a size
    ],
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface NameProps
  extends React.ComponentPropsWithoutRef<"button">,
    VariantProps<typeof nameVariants> {
  /** Every added prop gets a JSDoc line. Strings say why the default is safe. */
  loading?: boolean;
}

/**
 * One-line summary.
 *
 * TEN STATES
 *  1. default … 10. read-only — every one named. See §7.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — stated even when the answer is UNCHANGED. See §8.
 *
 * RTL — one line: safe, or what needs care.
 */
const Name = React.forwardRef<HTMLButtonElement, NameProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <element
      ref={ref}
      data-slot="name"
      className={cn(nameVariants({ variant }), className)}
      {...props}
    />
  ),
);

Name.displayName = "Name";

export { Name, nameVariants };
```

### The fixed points — do not vary them

| Fixed point | Reason |
|---|---|
| `import { cn } from "../../lib/utils";` — two levels up, always | One merge policy. A second implementation of `cn` is a second policy, and the difference shows up as a class that stops overriding. Never re-implement it, never import it from anywhere else. |
| `cn(...)` called **once**, on the root, cva result first, **caller's `className` last** | So a call site can always win without a component rewrite. |
| `React.forwardRef` whenever the DOM node should be reachable — i.e. any component that renders a real element | Radix, form libraries and focus management all need the node. |
| `displayName` always | Otherwise the component is `ForwardRef` in every stack trace and every devtools tree. |
| `data-slot="<name>"` on the root | Compositions target it. It costs nothing. 90 files already carry one. |
| **Named exports at the bottom. No default export, ever.** | 1,122 call sites import by name. A default export makes the imported name a property of the call site, not of the component. Export the `cva` function too, when other components will need the same skin. |
| Props extend `React.ComponentPropsWithoutRef<"tag">` | Every native attribute keeps working without being listed. |
| Never rename or drop an export or a variant value | `manifest.json → renamedFrom` is **empty by design** — no alias bridge exists because none is needed. You may **add**; you may never rename or remove. |

**When there are no variants:** do not write an empty cva. Use a plain
`const nameClasses = [...]` array and `cn(nameClasses, className)`.

---

## 4 · The header comment — four sections, all required

Not decoration. Each section answers a question the next reader will otherwise
have to answer by archaeology.

**DESIGN SOURCE.** The specimen file and the class. Quote the kit's own figures
verbatim if you need to — a paraphrased figure is not a citation, and the
verification grep tolerates `px` and hex inside comments for exactly this
reason (`GAPS.md` XC-3). `PATTERN.md` demands the source be named figure for
figure.

**THE LAW THIS FILE OBEYS.** The three or four rulings that actually bind *this*
component, in your own words. From `button.tsx`:

> · A button carries NO border in any state. No outline, no hairline, no
>   stroke. A secondary button is a FILLED button in the other paper tone
>   (`--btn-secondary-fill`). This is why `variant="outline"` does not exist
>   here and does exist on Badge.

That paragraph stops the next person from "fixing" the missing outline variant.

**RENDERING CONTEXT.** Why the file does or does not carry `"use client"`. See
§10.

**A precedence line, if you have exclusive states.** `input.tsx` writes its
out:

> `disabled > read-only (and loading) > error > default`

---

## 5 · Where every value comes from

**No hex. No px. No font size. Ever.** Three routes, in this order of
preference.

### Route 1 — a bridged Tailwind utility

`tokens.css` §10 maps a fixed list into `@theme inline`. If the name is on that
list, use the utility:

```
bg-background        text-foreground          text-muted-foreground
bg-surface-panel     bg-surface-quiet         bg-surface-inverse
text-ink-secondary   text-ink-disabled        text-ink-on-accent
text-ink-on-inverse  bg-hair-faint            border-hair-strong
border-border        bg-accent                bg-primary
bg-destructive       text-destructive-foreground
bg-success           bg-warning               bg-info
rounded-pill         rounded-select           rounded-bar
shadow-sm  shadow-md  shadow-lg  shadow-xl
text-micro  text-badge  text-caption  (and every other text-* step)
ease-kwapso  ease-kwapso-exit  ease-kwapso-move
```

### Route 2 — a Tailwind numeric, where the token layer makes it right

`--spacing: 0.25rem` is set in `@theme`, so Tailwind's whole numeric ladder is
rem-based and kwapso-correct. `px-4` is 1rem, `gap-2` is `--space-2`, `h-3` is
0.75rem.

**Safe up to 32px / `p-8`. Above that the two ladders diverge** — kwapso goes
32 → 48 → 64 → 96 → 128 and Tailwind goes 4n, so `p-8` is 32 (which is
`--space-7`) and `p-7` is 28 (which is not on the kwapso scale at all). Above
`p-8`, write `p-[var(--space-8)]` and friends.

### Route 3 — `var(--token)` in an arbitrary value

For everything not bridged:

```tsx
"bg-[var(--btn-primary-fill)]"
"h-[var(--control-height-button)]"
"size-[var(--avatar-md)]"
"rounded-[var(--radius)]"
"font-[var(--font-weight-medium)]"
```

### Type — one class sets all three

All fourteen steps are real utilities and each sets **size, leading AND
tracking** from a single class:

```
text-micro  text-xs  text-badge  text-caption  text-sm  text-base  text-lg
text-xl  text-2xl  text-3xl  text-4xl  text-5xl  text-6xl  text-7xl
```

**Write `text-badge`, never `text-[length:var(--text-badge)]`.** The arbitrary
form still compiles, but it sets font-size **only** and silently drops the
step's leading and tracking — which is the exact bug the bridge was added to
fix. Tailwind's own theme has no `--text-*--letter-spacing` sub-key, so before
that fix every `text-3xl` in the system dropped the kit's tracking on the
floor, while looking perfectly correct in the token file. `GAPS.md` CTRL-8.

`font-light` (300) and `font-medium` (500) are real. Saans ships those two
weights and no others, so `font-bold` renders identically to `font-medium` —
that is correct, not a mistake.

### Radius — only four exist

`rounded-pill` (999) · `rounded-[var(--radius)]` (24) · `rounded-select` (6) ·
`rounded-[var(--radius-sm)]` (4).

**Do not use `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-md` or
`rounded-sm`.** Two reasons: `rounded-lg` is re-pointed to **24**, not 8, so
reaching for it meaning "slightly rounded" gives you a card corner on a chip;
and none of those keys is on the `@theme inline` bridge, so they resolve
correctly only if `tokens.css` happens to load after Tailwind's theme — which a
component may not depend on. The three that *are* bridged and therefore
order-independent are `rounded-pill`, `rounded-select` and `rounded-bar`.

A fifth radius invented for one component is a rejection.

### Shadows — bridged, and load-bearing

Use `shadow-sm` / `shadow-md` / `shadow-lg` / `shadow-xl` freely. Tailwind v4
inlines its own shadow literals unless a key is re-pointed, so before the
bridge `shadow-md` rendered a generic grey drop shadow that **did not flip in
dark** — no matter what the token said. Found by compiling the bundle and
reading it. `GAPS.md` CTRL-7.

### Motion — one class, no local transition

`tokens.css` already sets `--default-transition-duration` and
`--default-transition-timing-function`, so a bare `transition-colors` is
already kwapso-timed. **Restate `duration-[var(--duration-colour)] ease-kwapso`
anyway**, for the same import-order reason.

For anything larger than a colour swap, add **one class** from
`foundations/motion/motion.css` — there are 57, covering all 16 commission cases:

```tsx
<DialogContent className={cn("motion-dialog", className)} />
<li className="motion-row" data-state="open" />
```

If the motion you need is not there, **add a class to `motion.css`**, not a
local transition. Every duration and curve in that file is a `var()`; a local
transition is a value that the next token edit will miss.

`tokens.css` §9 zeroes the durations under `prefers-reduced-motion`. **A
Tailwind keyframe animation is NOT covered** and needs `motion-reduce:animate-none`
written by hand — or slow it rather than freeze it, which is what
`button.tsx`'s busy ring does: `motion-reduce:[animation-duration:2.4s]`.

---

## 6 · Variants, with cva

### Naming

- **Variant values are the commission's**, spelled exactly: `default`,
  `secondary`, `destructive`, `outline`, `sm`, `lg`, `icon`. You may **add** a
  variant; you may never rename or drop one.
- An added variant takes **the kit's own word** for it (`inverse`, `cancel`,
  `info`), never a coined one, and carries a comment saying it is an addition
  and which specimen draws it.
- Boolean props are adjectives: `loading`, `error`, `announce`. Not
  `isLoading`.
- Local helpers are **not exported**. `BusyRing` in `button.tsx` stays private
  because `spinner/` owns the public `Spinner`.

### Compound variants go last

```tsx
compoundVariants: [
  // The kit pads a text button to --space-2, whatever its height.
  { variant: "text", class: "px-2" },
  // A link is not a box: no height, no padding, no nudge on press.
  { variant: "link", class: "h-auto p-0 enabled:active:translate-y-0" },
],
```

cva emits compound classes **after** the variant classes, so `tailwind-merge`
resolves them as the winner. That is how a variant overrides a size.

### A cva default and a destructure default must agree

```tsx
defaultVariants: { variant: "secondary" },
...
({ variant = "secondary", ... }) => …     // must match
```

**A JS default in the destructure wins over cva's**, silently. `badge.tsx`
carries a comment saying exactly this, because getting it wrong means the
ruling you just applied does not apply.

---

## 7 · The ten states

### 7.1 States that exclude each other are resolved in JS

```tsx
const state = disabled ? "disabled" : locked ? "readOnly" : invalid ? "error" : "default";
// … then one cva `state` variant emits exactly ONE class set.
```

**Why.** `disabled:border-x`, `[readonly]:border-y` and `aria-invalid:border-z`
carry **identical CSS specificity**. Which one paints is then decided by the
order Tailwind happens to emit them in — a property of the build, not of your
component, and it can change when a class is added somewhere else entirely.

**States that stack are utilities, with a guard**, so they cannot fight:
`enabled:hover:bg-[…]`, never bare `hover:bg-[…]` — see the anchor trap in
§11.1 first.

**Where a variant and a state conflict**, compose in JS and let
`tailwind-merge` drop the loser. `button.tsx` appends its disabled skin string
after the cva result rather than writing `disabled:` utilities.

### 7.2 Disabled

```
cursor-not-allowed bg-[var(--btn-disabled-fill)] text-[var(--btn-disabled-label)]
```

A fill and an ink. **`disabled:opacity-50` is a rejection.** An alpha of a token
is a colour the palette does not contain — it is whatever falls out of
compositing that token over whatever paper happens to be behind it, which
differs on a page, on a panel, in a card, and again in dark.

For a field the pair is `bg-hair-faint text-ink-disabled`, and the hover shift
is **suppressed** so a disabled field never looks clickable.

For a variant with no box to fill (`ghost`, `link`), disabled is **ink only** —
a fill there would invent a shape. `button.tsx` keeps two skins for this reason.

### 7.3 Hover

A named token. `--btn-*-hover` on a button, `--hair-strong` on a field border,
`bg-accent` for a neutral row or item wash.

**Never `--primary`.** Mango is a brand fill, never a hover — put it on a row
hover and every menu row in a toolbar turns mango on the way past. **Never an
opacity.**

### 7.4 Focus — write nothing

`tokens.css` §8 is a bare `:focus-visible` rule that rings every control at
once, at the control's own radius. No component may add a ring; nothing may set
`outline: none`, `focus:outline-none` or `outline-hidden`, anywhere, for any
reason.

A field **may** move its own **border** to ink on focus — that is a border
colour, not a ring.

**One thing you may have to do.** If your component draws a charcoal (inverse)
region by any route other than the `bg-surface-inverse` class, put
`data-surface="inverse"` on it. `--focus` is charcoal and `--surface-inverse`
*is* charcoal, so without the rebinding the ring draws at contrast 1.000 —
invisible, in both palettes.

### 7.5 Loading — three answers, pick the one your shape calls for

| Shape | Answer |
|---|---|
| **A control** | Keeps its own fill and grows a spinner. Set the native `disabled` so it cannot be clicked twice, and `aria-busy` so it is announced. **Skip the disabled *skin*** — the kit draws a submitting button as itself, not as a dead one. |
| **A field** | Takes the read-only skin, becomes non-editable, sets `aria-busy`. Typing into a field whose value has not arrived loses what you typed. |
| **A value** | Renders nothing. A count that has not arrived is not "0". |

`loading` is a boolean. There is no `loading="lazy" | "eager"`.

### 7.6 Empty — prefer nothing

Say what nothing looks like, and prefer nothing. A badge with no count renders
`null`. A skeleton with `lines={0}` renders `null`. **Never invent a dash or a
zero to fill the hole.**

### 7.7 The ones that do not apply

`active/pressed`, `error`, `selected`, `read-only`, and sometimes `hover` and
`focus` genuinely do not apply to a given component. **Say so in the JSDoc,
with the reason, in one line.** Silently omitting a state is a rejection;
naming it and explaining is not — the difference is that a reader can tell "we
decided" apart from "we forgot".

`skeleton.tsx` has seven of the ten not applying, and all seven are written
down.

### 7.8 The block, verbatim — and it is parsed

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

**This is not prose. It is data.** `demo/gen-states.mjs` lifts the block out of
each file header and emits `demo/states.generated.ts`, which is what the demo
renders — so the demo's answer for "which states apply" is the component
author's own answer, read from the first copy rather than re-typed into a
second one that drifts.

A note whose text contains **"NOT here"**, **"does not apply"** or **"not
apply"** is rendered as a one-line explanation. Everything else is rendered as
a live example *and* its note.

```bash
npm run build:states     # after you edit the block
npm run check:states     # exit 1 if states.generated.ts is stale
```

`npm run check` runs the check. A stale generated file fails the gate.

---

## 8 · Three breakpoints

Every component's JSDoc carries this block too, **including when the answer is
"unchanged"**, and says *why*:

```
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The kit states one control height
 *  (40) at every width, so the button does not grow, stack or collapse on its
 *  own. Where a 44 touch target is wanted the call site asks for size="lg".
```

Tailwind's defaults apply: `sm:` 40rem, `md:` 48rem, `lg:` 64rem.

**A primitive should almost always be *unchanged* across all three** and
inherit its width from the parent. Responsive behaviour is the composition's
job. If your primitive restacks by itself, be sure that is really the design —
chapter 9's one stated form breakpoint (48rem: one column below, two above,
never three) belongs to the `form` shell, not to any field.

---

## 9 · Strings, numbers and direction

### 9.1 Every user-facing string is a prop with a default

```tsx
label = "Loading…"        // ✔ a default, overridable per locale
thousandSuffix = "k"      // ✔ even a one-letter suffix is a string
<span>Loading…</span>     // ✘ rejection
```

The apps run in **Arabic, Urdu and Persian**. A hardcoded string cannot be
translated by the application, and the only fix is a fork of the component.

That includes strings a screen reader announces but a user never sees:
`aria-label`, `aria-valuetext`, the visually-hidden line under a chart.

**The best default is no string.** Where a component can avoid holding one, do
that instead. `button.tsx` keeps its children while loading and takes an
optional `loadingLabel`, so it hardcodes nothing at all.

### 9.2 Every printed number goes through `Intl`

```tsx
new Intl.NumberFormat(undefined, { minimumIntegerDigits: 2 }).format(n)
```

**Naming no locale is the point** — the runtime's own resolution wins, so a
document served as `ar-EG-u-nu-arab` gets Arabic-Indic numerals with nothing
passed. `String.padStart` and template literals produce ASCII digits in every
locale, which is the exact bug this avoids.

Give the caller a formatter prop as the escape hatch (`formatCount`,
`formatDuration`, `formatNumber`). Separators (`:`, `/`) stay as punctuation —
same glyph in all three scripts; a locale that disagrees replaces the whole
formatter. `GAPS.md` LOC-1.

### 9.3 Logical properties only

`px-*` (padding-inline), `ms-*`, `me-*`, `start-*`, `end-*`. Never `pl-*`,
`pr-*`, `left-*`, `right-*`.

**RTL is out of scope** by client decision on 2026-08-22, and
`manifest.json → rtl` is `false`. The rule survives the decision anyway: all 65
primitives are written this way, logical properties resolve **identically** in
LTR, and a new physical property is a step back from a door that is currently
open. Write the one-line `RTL —` note in your JSDoc regardless; every other
component has one.

---

## 10 · `"use client"`

**Not blanket.** Add it when the module itself:

- uses a hook,
- holds state,
- touches a browser API,
- reads context, or
- creates an event handler during its own render.

None of the four exemplars need it: they forward props and refs and nothing
more, so they render inside a Server Component unchanged. A call site that
passes `onClick` is the client boundary, exactly as it already was.

**Everything Radix-backed does need it** — `dialog`, `dropdown-menu`, `select`,
`popover`, `accordion`, `tabs`, `tooltip`, `sheet`, `switch`, `checkbox`,
`radio-group`, `slider`, `toggle*`, `collapsible`, `hover-card`, `progress`,
`scroll-area`, `separator`, `avatar`, `aspect-ratio` — as does anything with a
`use*` hook, `sonner`, `next-themes`, or a `useEffect`.

Say which case you are in, in the header's RENDERING CONTEXT block.

> A note if you run a verification grep: `"use client"` is a string literal, not
> a comment, and the word `client` sits inside it on a word boundary — so a
> product-vocabulary grep for `\b(ticket|sprint|account|system|client)\b` flags
> every React client module in the repository. It is a false positive in the
> check, not a product word in a primitive. `GAPS.md` G-0.

---

## 11 · Traps that have already caught someone

Each of these cost real time once. None of them is visible in review.

### 11.1 `enabled:` does not work on an anchor

`:enabled` matches **form elements only**. On the `<a>` that a
`PaginationLink`, a `BreadcrumbLink` or any `asChild` nav control renders,
`enabled:hover:bg-[var(--btn-primary-hover)]` **never matches at all**. The
hover silently disappears — no error, no type failure, nothing to see until
someone hovers a link in a browser.

**So:** if your component can render as an `<a>`, do **not** import
`buttonVariants`, and do not guard with `enabled:`. Copy the geometry with a
comment saying so, and re-express the guard as a JS branch on the resolved
state — `pagination` is the model, with `disabled > current > idle`. Adding
unguarded `hover:` utilities on top of `buttonVariants` leaves both rules in
the class list and makes the outcome depend on Tailwind's emission order.
`GAPS.md` PAG-2.

### 11.2 A card on the wrong paper is invisible

In **light**, `--background`, `--card`, `--surface-raised` and `--popover` are
all `#FFFEF9`. A raised card drawn on the page tone has contrast **1.000**
against its ground. In dark the papers separate properly, which is why this
only bites in light and why it survived every static check — it was found by
looking at a rendered page.

A card takes **the other paper tone from the band it sits in**. `Card`'s
default variant is `bg-surface-panel` (visible on the page);
`variant="raised"` is `bg-card shadow-sm` (visible on a panel). Getting this
backwards gives you a card held up by shadow alone. `PATTERN.md` §11,
`GAPS.md` CRD-7, `docs/RULES.md` §2.6.

### 11.3 An arbitrary type value drops leading and tracking

`text-[length:var(--text-badge)]` compiles and sets font-size only. Use
`text-badge`. See §5.

### 11.4 A Tailwind keyframe animation ignores reduced motion

The token layer zeroes durations; it does not touch `animate-spin`. Write
`motion-reduce:animate-none`, or slow it.

### 11.5 Tailwind's source detection scans markdown

This document and `PATTERN.md` quote real forbidden class names —
`disabled:opacity-50`, `outline-none`, `rounded-lg`. With Tailwind v4's
automatic detection on, every one of them gets compiled into the bundle, and a
reviewer grepping the output finds exactly the thing the list forbids. The
build must be:

```css
@import "tailwindcss" source(none);
@import "../foundations/tokens/tokens.css";
@source "../components/**/*.{ts,tsx}";
```

`source(none)` turns off automatic detection; the explicit `@source` scans only
component source. Verified with tailwindcss 4.3.3: the bundle then contains
**no** `opacity-*`, `outline-none`, `outline-hidden`, `ring-*`, `rounded-lg`,
`rounded-md`, `rounded-xl` or `rounded-2xl` rule at all. `PATTERN.md` §10.

### 11.6 The dependency list is closed

Permitted: `react`, `react-dom`, `next`, `tailwindcss` v4, `clsx`,
`tailwind-merge`, `class-variance-authority`, `@radix-ui/*`, `recharts`,
`sonner`, `next-themes`. **Anything else is a rejection.**

Two production applications vendor this source directly; every dependency here
becomes a dependency of both, forever. `cmdk` was wanted for the command
palette and the machinery was hand-built instead; a mapping library was wanted
for `Map` and the component was scoped around its absence.

If you add a *permitted* dependency that was not installed, save it to
`package.json` at the resolved version **and** record it in
`manifest.json → extraDependencies`. `sonner` was once in `node_modules` and in
neither file, so `npm ci` against the delivered manifest would not have
installed it. `GAPS.md` DEP-1, XC-2.

---

## 12 · Register it

A component that exists but is not registered is invisible to the contract, to
the demo and to the next reader.

### 12.1 `manifest.json`

Add an entry under `components`, keyed by folder name:

```json
"badge": {
  "file": "components/badge/badge.tsx",
  "exports": ["Badge"],
  "props": {
    "variant": ["default", "secondary", "outline", "destructive",
                "success", "warning", "inverse", "info"]
  },
  "states": ["default", "hover", "focus", "active", "disabled",
             "loading", "empty", "error", "selected", "read-only"]
}
```

`exports` lists every named export. `props` lists each variant axis and every
value on it. `states` is the ten, always all ten.

### 12.2 The demo

Every primitive gets a section. The registry is alphabetical, split across five
files by first letter:

```
demo/sections/a-b.tsx  c-d.tsx  f-m.tsx  n-s.tsx  t-z.tsx
demo/sections/index.tsx     ← merges them, and asserts the count
```

Import your component **from its real path** and add one line to the right
file's exported array:

```tsx
{ slug: "badge", title: "Badge", render: () => <BadgeSection /> },
```

`slug` is the folder name and the anchor id. `index.tsx` asserts
`SECTIONS.length === EXPECTED_PRIMITIVES` at module load and logs loudly if it
does not — bump `EXPECTED_PRIMITIVES` when you add one.

**The demo never re-implements a component or copies its classes.** If
something looks wrong there, that is a finding about the component, logged in
`GAPS-DEMO.md`, not something to paper over in the demo.

### 12.3 `CHANGELOG.md`

Under the next version. Apps pin to a tag, so a change that is not in a tag
does not exist for them.

---

## 13 · Run the gate

```bash
npm run check
```

Four things, all of which must pass:

| | What it checks |
|---|---|
| `node foundations/tokens/build-tokens.mjs --check` | dark-block drift · orphan tokens · px leaks · unresolved `var()` chains |
| `node foundations/icons/generate-icons.mjs --check` | the generated icon module is not stale |
| `node demo/gen-states.mjs --check` | `states.generated.ts` matches the TEN STATES blocks |
| `tsc --noEmit` | types |

Then look at it. `npm run dev` opens the demo: every component, every state,
both themes, three scales. **Several of this system's rulings were only found
by looking** — the invisible card, the invisible focus ring on charcoal, the
six-mango list. A static check would not have caught any of the three.

Check yours in **both themes** and at **`data-scale="small"` and `"large"`**
before you call it done.

---

## 14 · When the kit does not settle it

You will hit something the kit does not draw. That is expected — `GAPS.md` has
several hundred entries. What matters is what you do next.

**Do not guess silently.** Write the entry in `/GAPS.md`:

```markdown
### XYZ-1 · <one line naming exactly what is unspecified>

**Unspecified.** What the kit says, what it does not say, and where you
looked. Quote it.

**Built.** What you actually did.

**Why.** The reasoning — including what you rejected and why it was worse.

**Recommendation.** What a ruling should say, so someone can close this in
one edit.
```

If the kit contradicts *itself*, or contradicts the commission, mark the entry
**CONTRADICTION** and quote **both sides** so the controlling session can rule
rather than re-derive.

**Why this matters more than it sounds.** Every value in this system can be
traced. A derived value that says it is derived can be corrected in one edit by
whoever rules on it. A derived value that looks stated gets built on, and by
the time it is found wrong it has twelve dependents. *A logged gap is fine. A
guess that looks like law is not.*

Then add it to `manifest.json → notDelivered` if it affects what a consuming
app can rely on.

---

## 15 · The rejection list

These fail review. There is no discussion attached to any of them.

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

**Colour semantics**
- White type on an accent. Charcoal on every accent, both modes
- A border on a Button, in any state
- A border on a coloured pill. Only the uncoloured `Badge variant="outline"` draws a hairline

**API**
- A renamed or dropped export; a renamed or dropped variant value
- A default export
- A re-implemented `cn`
- A dependency outside the permitted list

**Strings and structure**
- Any user-facing string that is not a prop with a default
- `pl-*` / `pr-*` / `left-*` / `right-*`
- Product vocabulary in a primitive
- A missing `displayName`
- Blanket `"use client"`

**Honesty**
- A silent invention

---

## 16 · A worked example, start to finish

You have been asked for a **`StatusChip`** — a status dot plus a word.

**1 · Does it exist?** `grep StatusChip manifest.json` — no. But
`grep -n 'dot-' foundations/tokens/tokens.css` finds `--dot-shipped`, `--dot-building`,
`--dot-review`, `--dot-blocked`, `--dot-archived`, `--dot-done`, plus
`--pill-fill`, `--pill-label` and `--dot-status: 0.4375rem`. **The kit has
already designed this.** Kit ruling 26.

**2 · Primitive or collection?** Primitive — it is one shape, it holds no
domain logic, and "status" is a system word, not a product word.

**3 · Exemplar.** `badge/` — a chip.

**4 · Read the ruling.** Ruling 26: *the dot names the state; the label always
says it in words, so the dot never carries meaning alone.* No border on any
coloured pill. Mango is the brand, not a status — which is why there is no
mango dot in the token list.

**5 · Values.** Fill `--pill-fill`, ink `--pill-label`, dot
`size-[var(--dot-status)]` in the per-state dot colour, `rounded-pill`,
`text-badge`, `h-[var(--control-height-pill)]`, gap `--space-1` ("dot to
label"). Every one of those is a token; nothing was invented.

**6 · Variants.** One axis, `status`, with the six values the tokens name.
Each gets a JSDoc line naming its token. No `default` value carries mango.

**7 · States.** The dot has no hover, no focus, no pressed — it is a label, not
a control. Write all three as `does not apply` with the reason, exactly as
`badge.tsx` does. `empty` renders `null`. `loading` renders `null` — a status
that has not arrived is not "unknown".

**8 · Strings.** The word beside the dot is `children`, so the component
hardcodes nothing. If you add an `aria-label`, it is a prop with a default.

**9 · Breakpoints.** UNCHANGED, and say why: fixed geometry at every width, the
row that runs out of space is the parent's problem.

**10 · `"use client"`.** No — no hook, no state, no handler.

**11 · Register.** `manifest.json`, `demo/sections/n-s.tsx`, bump
`EXPECTED_PRIMITIVES`, `CHANGELOG.md`.

**12 · Gate.** `npm run check`, then `npm run dev` and look at it in both
themes and at both extreme scales.

**13 · Anything unsettled?** The kit names six dot colours and no "unknown" or
"paused". If you need one, that is a `GAPS.md` entry with a recommendation —
not a seventh colour you picked.

---

## Where to read further

| For | Read |
|---|---|
| The full house pattern, with detail this file compresses | `components/PATTERN.md` — **the deeper reference** |
| The laws a consuming app must not break | `docs/RULES.md` |
| What every token means and when to reach for it | `docs/TOKENS.md` |
| Why a value is what it is | `GAPS.md` |
| The contract | `manifest.json` |
| The four exemplars | `button/` · `badge/` · `input/` · `skeleton/` |
