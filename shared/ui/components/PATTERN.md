# The house pattern

Copy this. The four exemplars are `button/`, `badge/`, `input/`, `skeleton/`.
They cover the four shapes everything else follows:

| Exemplar   | Shape it sets                          | Copy it for |
|------------|----------------------------------------|-------------|
| `button`   | variant + size cva, disabled, loading  | `toggle`, `pagination`, `mode-toggle`, any control |
| `badge`    | status-coloured chip, empty-when-zero  | `alert`, status pills, tags, counts |
| `input`    | form field, exclusive states           | `textarea`, `select`, `search-input`, `checkbox`, `switch` |
| `skeleton` | stateful placeholder, composite parts  | `spinner`, `progress`, empty/loading registers |

---

## 1 · The canonical file

`components/primitives/<name>/<name>.tsx`. One folder, one file, one lowercase
kebab name matching the folder. Read `button.tsx` alongside this.

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
 *  1. default … 10. read-only — every one named. See §5.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — stated even when the answer is UNCHANGED. See §6.
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

**Fixed points, do not vary them:**

- `import { cn } from "../../lib/utils";` — two levels up from the component
  folder. Never re-implement `cn`, never import it from anywhere else.
- `cn(...)` is called **once**, on the root element, with the cva result first
  and the caller's `className` **last** so a call site can always win.
- `React.forwardRef` whenever the DOM node should be reachable — which is any
  component that renders a real element. `displayName` always.
- `data-slot="<name>"` on the root. Compositions target it; it costs nothing.
- Named exports at the bottom: the component, and the `cva` function when other
  components will need the same skin. No default export, ever — 1,122 call
  sites import by name.
- Props extend `React.ComponentPropsWithoutRef<"tag">`, so every native
  attribute keeps working without being listed.

**When there are no variants:** do not write an empty cva. Use a plain
`const nameClasses = [...]` array and `cn(nameClasses, className)`. `input.tsx`
uses a cva anyway, but only because it has an exclusive `state` variant — see §4.

---

## 2 · Naming

- **Variant values are the commission's**, spelled exactly. `default`,
  `secondary`, `destructive`, `outline`, `sm`, `lg`, `icon`. You may **add** a
  variant; you may never rename or drop one.
- An added variant takes the kit's own word for it (`inverse`, `cancel`,
  `info`), never a coined one, and carries a comment saying it is an addition
  and which specimen draws it.
- Boolean props are adjectives: `loading`, `error`, `announce`. Not `isLoading`.
- Local helpers are not exported. `BusyRing` in `button.tsx` stays private
  because `spinner/` owns the public `Spinner`.

---

## 3 · Where a value comes from

**No hex. No px. No font size. Ever.** Three routes, in this order of
preference:

1. **A bridged Tailwind utility.** `tokens.css` §10 maps a fixed list into
   `@theme inline`. If the name is on that list, use the utility:
   `bg-background`, `text-muted-foreground`, `border-border`, `bg-surface-quiet`,
   `text-ink-disabled`, `bg-hair-faint`, `border-hair-strong`, `text-ink-on-accent`,
   `bg-destructive`, `text-destructive-foreground`, `bg-success`, `bg-warning`,
   `bg-info`, `bg-primary`, `rounded-pill`, `ease-kwapso`.

2. **A Tailwind numeric, when the token layer already makes it right.**
   `--spacing: 0.25rem` is set in `@theme`, so `px-4` is 1rem, `gap-2` is
   `--space-2`, `h-3` is 0.75rem. Safe up to 32px / `p-8`.
   **Above 32px the ladders diverge** — kwapso goes 32 → 48 → 64 → 96 → 128
   and Tailwind goes 4n. Above `p-8`, use `p-[var(--space-8)]` and friends.

3. **`var(--token)` in an arbitrary value**, for everything not bridged:
   `bg-[var(--btn-primary-fill)]`, `h-[var(--control-height-button)]`,
   `size-[var(--avatar-md)]`, `rounded-[var(--radius)]`.

**Type — CORRECTED 2026-08-22, ignore any older copy of this section.**

All sixteen steps are real utilities. `tokens.css` registers them in the
`@theme inline` bridge, and each one sets **size, leading AND tracking** from
a single class:

```
text-micro  text-xs  text-sm  text-badge  text-caption  text-base  text-lg
text-xl  text-2xl  text-3xl  text-4xl  text-5xl  text-6xl  text-7xl
```

Write `text-badge`, never `text-[length:var(--text-badge)]`. The arbitrary
form still compiles, but it sets font-size **only** and silently drops the
step's leading and tracking — which is the exact bug the bridge was added to
fix (GAPS.md CTRL-8).

`font-light` (300) and `font-medium` (500) are real too. Saans ships those two
weights and no others, so `font-bold` renders identically to `font-medium` —
that is correct, not a mistake.

**Radius — only four exist,** and all four have real utilities:
`rounded-pill` (buttons, chips, badges, avatars) · `rounded-[var(--radius)]`
(24, boxes) · `rounded-select` (6, selection controls and marks) ·
`rounded-sm` (4, bars). Note `rounded-sm` and `rounded-lg` are re-pointed at
kwapso values, so `rounded-lg` is **24**, not 8 — do not reach for it meaning
"slightly rounded".

**Shadows are bridged too,** and this one is load-bearing: Tailwind v4 inlines
its own shadow literals unless a key is re-pointed, so `shadow-md` would
otherwise render a grey drop shadow that does not flip in dark. It is
re-pointed; use `shadow-sm` / `shadow-md` / `shadow-lg` / `shadow-xl` freely.
Do not use `rounded-lg` / `rounded-xl` / `rounded-2xl`: they resolve correctly
only if `tokens.css` happens to load after Tailwind's theme, and a component
may not depend on import order.

**Motion.** `tokens.css` already sets `--default-transition-duration` and
`--default-transition-timing-function`, so a bare `transition-colors` is
already kwapso-timed. Restate `duration-[var(--duration-colour)] ease-kwapso`
anyway, for the same import-order reason. `tokens.css` §9 zeroes the durations
under `prefers-reduced-motion`; a Tailwind keyframe animation is NOT covered by
that and needs `motion-reduce:animate-none` written by hand.

---

## 4 · Expressing a state

**States that exclude each other are resolved in JS, not stacked as variants.**

`disabled:border-x`, `[readonly]:border-y` and `aria-invalid:border-z` carry
identical CSS specificity. Which one paints is then decided by the order
Tailwind emits them in, and a component may not depend on that. So:

```tsx
const state = disabled ? "disabled" : locked ? "readOnly" : invalid ? "error" : "default";
// … then one cva `state` variant emits exactly one class set.
```

Write the precedence down in the file header. `input.tsx` is the model.

**States that stack are utilities**, with a guard so they cannot fight:
`enabled:hover:bg-[…]` rather than `hover:bg-[…]`, so a disabled control never
matches a hover rule in the first place.

**Where a variant and a state conflict**, compose in JS and let
tailwind-merge drop the loser — `button.tsx` appends `DISABLED_FILLED` after
the cva result rather than writing `disabled:` utilities.

### Disabled

```
cursor-not-allowed bg-[var(--btn-disabled-fill)] text-[var(--btn-disabled-label)]
```

A fill and an ink. `disabled:opacity-50` is a rejection. For a field the pair
is `bg-hair-faint text-ink-disabled`, and the hover shift is suppressed so a
disabled field never looks clickable.

### Hover

A named token. `--btn-*-hover` on a button, `bg-accent` for a neutral row or
item wash. **Never `--primary`** — mango is a brand fill, never a hover, or
every menu row turns mango. Never an opacity.

**A FIELD HAS NO HOVER.** Override 42: `--hair-strong` is the field's RESTING
edge, not its hover, and the hover that used to promote 8% to 20% came from
`kwapso-ui.css` and has no source in the artifact. Nothing replaced it — CH09
draws a field at rest, at focus and disabled, and that is the set. A component
that reaches for a field hover is adding a state the kit does not have.

### Focus

**Write nothing.** `tokens.css` §8 is a bare `:focus-visible` rule that rings
every control at once, at the control's own radius. No component may add a
ring; nothing may set `outline: none`, `focus:outline-none` or `outline-hidden`.
A field may move its own **border** to ink on focus — that is a border colour,
not a ring.

### Loading

Three different answers, pick the one the component's shape calls for:

- **A control** keeps its own fill and grows a spinner (`button.tsx`). Set the
  native `disabled` so it cannot be clicked twice, `aria-busy` so it is
  announced, and skip the disabled *skin* — the kit draws a submitting button
  as itself, not as a dead one.
- **A field** takes the read-only skin, becomes non-editable and sets
  `aria-busy` (`input.tsx`). Typing into a field whose value has not arrived
  loses what you typed.
- **A value** renders nothing (`badge.tsx`). A count that has not arrived is
  not "0".

A `loading` prop is a boolean. There is no `loading="lazy" | "eager"`.

### Empty

Say what nothing looks like, and prefer nothing. A badge with no count renders
`null`. A skeleton with `lines={0}` renders `null`. Never invent a dash or a
zero to fill the hole.

### The other five

`active/pressed`, `error`, `selected`, `read-only`, and sometimes `hover` and
`focus` genuinely do not apply to a given component. **Say so in the JSDoc,
with the reason, in one line.** Silently omitting a state is a rejection;
naming it and explaining is not. See `skeleton.tsx`, where seven of the ten do
not apply and all seven are written down.

---

## 5 · The ten states, as a checklist

Every component's JSDoc carries this block, numbered, with every line present:

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

---

## 6 · Breakpoints

Every component's JSDoc carries this block too, **including when the answer is
"unchanged"**, and says *why*:

```
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The kit states one control height
 *  (40) at every width, so the button does not grow, stack or collapse on its
 *  own. Where a 44 touch target is wanted the call site asks for size="lg".
```

Tailwind's default breakpoints apply: `sm:` 40rem, `md:` 48rem, `lg:` 64rem.
Chapter 9's one stated form breakpoint is 48rem (one column below, two above,
never three) and belongs to the `form` shell, not to any field.

A primitive should almost always be **unchanged** across all three and inherit
its width from the parent. Responsive behaviour is the composition's job. If
your primitive restacks by itself, be sure that is really the design.

---

## 7 · Strings

**Every user-facing string is a prop with a default.** The apps run in Arabic,
Urdu and Persian; a hardcoded `"Loading…"` inside a component cannot be
translated and is a rejection.

```tsx
label = "Loading…"        // ✔ a default, overridable per locale
thousandSuffix = "k"      // ✔ even a one-letter suffix is a string
<span>Loading…</span>     // ✘ rejection
```

That includes strings a screen reader announces but a user never sees:
`aria-label`, `aria-valuetext`, the visually-hidden line under a chart.

Where a component can avoid holding a string at all, do that instead — the
best default is no string. `button.tsx` keeps the children while loading and
takes an optional `loadingLabel`, so it hardcodes nothing.

**RTL is OUT OF SCOPE** — ruled by the client on 2026-08-22, and kit ruling 10
says the same. Keep using logical properties anyway: `px-*` (padding-inline), `ms-*`,
`me-*`, `start-*`, `end-*`. Never `pl-*`, `pr-*`, `left-*`, `right-*`.

---

## 8 · `"use client"`

Not blanket. Add it when the module itself uses a hook, holds state, touches a
browser API, reads context, or creates an event handler during its own render.

None of the four exemplars need it: they forward props and refs and nothing
more, so they render inside a Server Component unchanged. A call site that
passes `onClick` is the client boundary, exactly as it already was.

Everything Radix-backed (`dialog`, `dropdown-menu`, `select`, `popover`,
`accordion`, `tabs`, `tooltip`, `sheet`, `switch`, `checkbox`,
`radio-group`, `slider`, `toggle*`, `collapsible`, `hover-card`, `progress`,
`scroll-area`, `separator`, `avatar`, `aspect-ratio`) does need it, as does
anything with a `use*` hook, `sonner`, `next-themes`, or a `useEffect`.

---

## 9 · Rejections

These fail review. There is no discussion attached to any of them.

**Colour and size**
- Any `#hex`, `rgb()`, `hsl()` or named colour in a `.tsx` file.
- Any `px` value outside a comment. rem only, 16px authoring base.
- Any hardcoded font size. Use the step, or `text-[length:var(--text-*)]`.
- `rounded-lg` / `rounded-xl` / `rounded-2xl` / `rounded-md`. Four radii exist:
  `rounded-pill`, `rounded-[var(--radius)]`, `rounded-[var(--radius-select)]`,
  `rounded-[var(--radius-sm)]`.
- A fifth radius, invented for one component.

**Focus**
- `focus:outline-none`, `outline-hidden`, `outline-none`, anywhere, for any
  reason.
- `focus:ring-*`, `focus-visible:ring-*`, `ring-offset-*`, or any per-component
  focus treatment. §8 of `tokens.css` already did it.

**States**
- `disabled:opacity-50`, or any opacity used as a disabled state.
- `hover:opacity-*`, or any opacity used as a hover state.
- A hover that uses `--primary` / mango. Mango is a brand fill, never a hover
  and never a status.
- A missing state. All ten are named, applicable or not.
- A state stacked as a same-specificity utility against another state, where
  which one wins depends on stylesheet order.

**Colour semantics**
- White type on an accent. Charcoal on every accent, both modes. A destructive
  button is charcoal on poppy.
- A border on a Button, in any state. A secondary button is a FILLED button in
  the other paper tone. `variant="outline"` does not exist on Button.
- A border on a coloured pill. Colour is the whole treatment. Only the
  uncoloured `Badge variant="outline"` draws a hairline.

**API**
- A renamed or dropped export. A renamed or dropped variant value.
- A default export.
- A re-implemented `cn`.
- A dependency outside: react, react-dom, next, tailwindcss v4, clsx,
  tailwind-merge, class-variance-authority, @radix-ui/\*, recharts, sonner,
  next-themes.

**Strings and structure**
- Any user-facing string that is not a prop with a default.
- `pl-*` / `pr-*` / `left-*` / `right-*` — logical properties cost nothing in
  LTR and keep the RTL door open. RTL itself is out of scope (2026-08-22).
- Product vocabulary in a primitive. No "ticket", no "sprint", no "account",
  in a name, a prop, a default string or a comment. `List`, not `TicketList`.
- A missing `displayName`.
- Blanket `"use client"`.

**Honesty**
- A silent invention. If the kit does not settle it, write the entry in
  `/GAPS.md` — component, what is unspecified, what you did, why — and keep
  going. A logged gap is fine. A guess that looks like law is not.

---

## 10 · One note for whoever wires Tailwind up

The rejection list above quotes real class names — `disabled:opacity-50`,
`outline-none`, `rounded-lg`. Tailwind v4's automatic source detection scans
markdown, so if this file is inside the scanned tree those rules get compiled
into the bundle and a reviewer grepping the output finds the very thing the
list forbids. Exclude the docs:

```css
@import "tailwindcss" source(none);
@import "../foundations/tokens/tokens.css";
@source "../components/**/*.{ts,tsx}";
```

`source(none)` turns off automatic detection and the explicit `@source` scans
only the component source. Verified with tailwindcss 4.3.3: the four primitives
compile to kwapso values and the bundle contains **no** `opacity-*`,
`outline-none`, `outline-hidden`, `ring-*`, `rounded-lg`, `rounded-md`,
`rounded-xl` or `rounded-2xl` rule at all. Broad auto-detection puts every one
of those back, from this file's rejection list.

---

## 11 · A card's ground is the panel tone, not the page tone

Ruled 2026-08-22 (2B), from looking at it: `verify/open-decisions.html`.

In LIGHT, `--background`, `--card`, `--surface-raised` and `--popover` are all
`#FFFEF9`. Identical. A card drawn on the page tone therefore has contrast
**1.000** against its ground and is held up by its shadow alone. In dark the
papers separate properly (1.079–1.198), which is why this only bites in light
and why it survived every static check.

The kit is unambiguous: *"a raised card is `--card` over `--sheet`"* — off-beige
sitting on soft paper. So the ground was wrong, not the card.

**The rule.** Any region that contains cards uses `bg-surface-panel`. Reach for
`bg-background` only for the page shell itself, behind the panels.

```tsx
<main className="bg-background">                 {/* page shell */}
  <section className="bg-surface-panel p-6">     {/* the ground */}
    <Card variant="raised">…</Card>              {/* --card, now visible */}
  </section>
</main>
```

**`variant="raised"` is not optional here, and this example got it wrong until
2026-08-22.** A bare `<Card>` is `variant="default"`, which is
`bg-surface-panel` — the same fill as the ground above it, contrast 1.000. The
first version of this snippet demonstrated the exact bug the section exists to
prevent. Caught while writing `docs/RULES.md`; logged as GAPS-DOCS B-4.

Rule of thumb: `default` is for a card sitting on the **page**, `raised` for a
card sitting on a **panel**. If you are inside a `bg-surface-panel` region —
and per this section you usually are — you want `raised`.

No token changed and no component changed. This is a composition law, and it
belongs in `docs/RULES.md` when that gets written.
