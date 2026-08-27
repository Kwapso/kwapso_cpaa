# BUILD A SCREEN

How to build a screen this system does not already ship — so that it looks
native, passes the gate, and does not have to be revisited.

You do not need a designer to ask. Everything a designer would tell you is
already written down, and this document tells you where and in what order.

**This is the composing document.** `docs/BUILD-A-COMPONENT.md` is for the rare
case where the thing you need does not exist at any tier. Read that one only
after this one has told you that you are in that case, because **you are
almost certainly not**. There are 67 controls, 42 structures, 15
templates, 17 screens, 8 overlays and 5 states already built. The most common mistake in this repository
has never been building the wrong screen; it has been drawing one that could
have been composed.

**Read `docs/RULES.md` too.** It is the shorter list of things you must not
break, and every rule there applies to a screen as well as to a component.

---

## Contents

1. [The four tiers, and which one you are in](#1--the-four-tiers-and-which-one-you-are-in)
2. [Start from a shape](#2--start-from-a-shape)
3. [What composing looks like, and what drawing looks like](#3--what-composing-looks-like-and-what-drawing-looks-like)
4. [The ten states](#4--the-ten-states)
5. [Narrow](#5--narrow)
6. [Seven rules that are easy to break by accident](#6--seven-rules-that-are-easy-to-break-by-accident)
7. [How to check your work](#7--how-to-check-your-work)
8. [When the artifact and the build disagree](#8--when-the-artifact-and-the-build-disagree)
9. [A screen, start to finish](#9--a-screen-start-to-finish)

---

## 1 · The four tiers, and which one you are in

| tier | folder | what lives there | count |
|---|---|---|---|
| 0 | `controls/` | a button, a field, a badge, a dialog | 66 |
| 2 | `structures/` | a table, a board, a thread, a heat map | 40 |
| 3 | `compositions/templates/` | the SHAPE of a screen, nothing product-specific in it | 15 |
| 3 | `compositions/screens/` | the finished pages named as exceptions | 17 |
| 3 | `compositions/overlays/` | what opens **over** a screen rather than replacing it | 8 |
| 3 | `compositions/states/` | the same screen with nothing in it | 5 |

> **`compositions/system/`, `portal/` and `shapes/` no longer exist.** The
> 2026-08-24 restructure deleted 24 files and 11,731 lines of example collection
> and detail routes: the kit ships the TEMPLATE and the application builds the
> page. If you are looking for one, you want `compositions/templates/`.

A route answers *"where am I"*. A screen answers *"what is happening"* — the
session expired, the import needs approving, the collection is empty, six
tickets are waiting to be triaged.

### 1.1 Check it does not already exist

```bash
ls compositions/templates      # 15 + the barrel
ls compositions/screens        # 17 + the barrel
ls compositions/overlays       # 8 + the barrel
ls compositions/states         # 5 + the barrel
```

`manifest.json` is the catalogue and its `compositions` block is **generated
from the folders**, not typed — so it cannot go stale the way it once did, when
it read `[]` while all 29 routes existed, compiled and rendered.

### 1.2 A new screen is almost never a new component

Before you add anything at tier 0 or 2, answer this: *is the thing I am missing
a new kind of object, or an arrangement of objects that exist?* An arrangement
is a screen. If you are about to write a `<div>` with a fill on it, stop and
look for the collection that already draws that.

---

## 2 · Start from a shape

`compositions/templates/` holds the twelve arrangements that recur. Every one of
the 29 routes and 24 screens is built out of them.

| | shape | what it is |
|---|---|---|
| 1 | `RecordChrome` | one record: band, hero, facts strip, panel, footer |
| 2 | `CollectionScreen` | figures → tabs → toolbar → rows → pager |
| 3 | `StatStrip` | three or four figures, with sparks |
| 4 | `StepperHero` | the stage rail over a form |
| 5 | `FormScreen` | a form as a page or a panel |
| 6 | `Assistant` | the copilot surface |
| 7 | `SignIn` | the two-panel auth shell, and `SignInSplash` |
| 8 | `ImportFlow` | the stepped data-in page |
| 9 | `SearchResults` | results across kinds |
| 10 | `PortalHome` | the client door's landing |
| 11 | `PortalConversation` | the client-facing thread |
| 12 | `ShapeStateBody` | the loading, empty, no-results and error treatment **all eleven others import**, so no shape invents a register of its own |

Number 12 is the one people miss. If your screen needs to say "there is nothing
here" or "this failed", you do not write that sentence — `ShapeStateBody` owns
it, and owning it centrally is why every register in the system says the same
thing in the same words in the same place.

---

## 3 · What composing looks like, and what drawing looks like

Composing, from `compositions/screens/session-expired.tsx`:

```tsx
return (
  <AuthShell
    data-slot="screen-session-expired"
    mark={mark}
    media={media}
    title={title}
    description={reason}
    {...props}
  >
    <div className="flex w-full min-w-0 flex-col gap-[var(--space-6)]">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <Text as="span" size="sm" tone="secondary">{destinationLabel}</Text>
        <Badge variant="outline">{destinationRef}</Badge>
      </div>
      …
```

Every class in that file is **layout** — `flex`, `gap`, `min-w-0`, `truncate`.
Not one is a fill, a radius, a ring or a type step. `Text` decides the type,
`Badge` decides the chip, `AuthShell` decides the page.

Drawing, which is the mistake:

```tsx
/* WRONG — every one of these is a decision that is not yours to make */
<span className="rounded-full bg-[#E2DDD4] px-2 py-1 text-[12px] text-[#4a4946]">
  {destinationRef}
</span>
```

That is a `Badge`. It is also four rule violations: a literal hex twice, a px
font size, and a value that will not flip in dark.

**The test:** if you have written a fill, a radius, a ring, a shadow or a font
size in a screen file, you have gone wrong. Search your diff for `bg-[#`,
`text-[1`, `rounded-[` and `border` before you open a review.

---

## 4 · The ten states

Every delivered file carries a TEN STATES block in its header. It is a
convention, it is checked, and `demo/gen-states.mjs` parses it.

From `compositions/screens/not-found.tsx`:

```
 * TEN STATES
 *  1. default        — THIS IS the state, in one of three cases.
 *  2. hover          — owned by the Buttons.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by `Button`.
 *  5. disabled       — does not apply. Every route offered is live.
 *  6. loading        — does not apply. A record still being fetched is 27.6.
 *  7. empty          — does not apply, and the distinction matters: the
 *                      COLLECTION is not empty, so this is never 27.21.
 *  8. error          — does not apply. A record that could not be FETCHED is
 *                      ruling 06's block failure; a record that is GONE is
 *                      this screen, and the two say different true things.
 *  9. selected       — does not apply.
 * 10. read-only      — always. Nothing here is editable.
```

Note what that block is doing. "Does not apply" is never a shrug — each one
says *why*, and three of them draw a distinction that would otherwise be
collapsed. Writing the block is how you find out that "not found" and "empty"
are different screens.

### Two rules about the block

**"Renders nothing" is never a passing state** unless the artifact says the
screen is blank there. `SignInSplash` had "no mark passed: the brand field
alone. Correct, not broken" as state 7 — and the state it was describing was a
box of height zero. The portal's `/` drew nothing at all during boot, and the
block said that was fine.

**A state you suppress at a call site is a bug in that call site.** Five
`StatStrip` call sites carried `state={state === "error" ? "ready" : state}`,
which meant a screen printed "LIVE ACCOUNTS 4 of 6 on the books" directly above
"we can't show this right now". Pass `state={state}`. If the shape's behaviour
in a state is wrong, fix the shape — that is why it is a shape.

---

## 5 · Narrow

Every screen states its 380px behaviour explicitly, in its header, in words.

**"Unchanged" is a claim to be checked, not a default to be written.** Real
examples from this build, each one a decision someone had to make:

- `company-hub` keeps **four** figures at 380, because its chapter says the
  retainer is never the one cut.
- `triage-sitting` keeps its three figures on one line, because nothing in this
  kit scrolls a strip sideways.
- `password-security` turns session rows into **cards** at 380 — and keeps both
  password fields, because dropping the current-password field on a phone is a
  security change, not a layout one.
- `module-wall` goes to two columns, which needed one class, because
  `CardGrid`'s base is one.

Three breakpoints exist: mobile (base), tablet (`sm:`, 40rem), desktop (`lg:`,
64rem). Say what happens at each if anything does.

---

## 6 · Seven rules that are easy to break by accident

Each of these has already caught someone in this repository. The specifics are
the point.

### 6.1 No CSS `border`. Ever.

Separation is a fill or an inset shadow, never a stroke. Use the `--hairline`
family. Four `border-b border-border` row dividers survived a sweep that was
supposed to remove all of them, in `list`, `calendar-view`, `activity-feed` and
`checklist`.

### 6.2 Disabled is a fill and an ink. Hover is a token. Never an opacity.

An opacity dims the text and the fill together and lands somewhere nobody
chose. Two components printed a meta line at full strength for weeks rather
than reach for `opacity: .7`, and the right answer turned out to be two new
tokens — `--ink-on-accent-secondary` and `--ink-on-inverse-secondary`.

### 6.3 One mango action per screen.

Mango is a fill and never a data colour. If your screen has two mango controls,
one of them is not the action.

### 6.4 Registers are left-aligned.

Composition 27.21: *"Type and one button carry it, left-aligned like everything
else."* None of the four registers CH21 draws is centred, and 27.21 says it
in words.

> **A correction, kept visible on purpose.** This document first said "the
> artifact writes `text-align` zero times in 240,000 characters." That was
> false. It writes it **110 times** — 70 `right`, 29 `center`, 11 `left`. The
> zero came from searching a *text* extract of the artifact, which strips
> inline CSS, and 240,000 was that extract's size rather than the artifact's.
> The ruling stands on 27.21's sentence and on the registers themselves; the
> evidence quoted for it did not. Check what your search is searching.
Eleven registers were centred anyway, and two screens had independently written
a local workaround before anyone traced it to the shared component. If you find
yourself working around a component's alignment, the component is wrong.

### 6.5 `min-h-full` computes to zero.

Percentage min-height resolves against the parent's height. Every call site in
this build mounted the auth shell in an auto-height parent, so `min-h-full`
computed to **0** and the portal's `/` drew nothing. Use `min-h-dvh` when the
shell is the window, and **verify every screen as a bare mount** — a screen
that only draws inside a helpful parent is not delivered.

### 6.6 No px, no literal hex, no font size.

`foundations/tokens/tokens.css` is the only place a colour or a size is decided. Everything
is rem against a 16px authoring base; the root renders at 15px. Above 32px use
the named `--space-*` steps.

### 6.7 Every user-facing string is a prop with a default.

Including the words in a register, the label on a button and the sentence under
an empty state. A screen with a hard-coded string cannot be translated and
cannot be reused by the other door.

---

## 7 · How to check your work

In this order, because this is the order that actually catches things.

```bash
npx tsc --noEmit               # exit 0
node foundations/tokens/build-tokens.mjs   # four guards, one warning
npm run build
```

Four guards fail the build: **drift** (the two dark blocks must match byte for
byte), **orphans** (no dark-only token), **px leaks**, and **dead selectors** (a
`.bg-*` class this stylesheet selects on must be one the Tailwind bridge can
actually produce). A fifth check, **unresolved** `var()` chains, warns rather
than fails. Each was added after a bug it would have caught, and each is proven
by deliberate breakage.

### Then render and look

Serve the repo and open the demo:

```bash
python3 -m http.server 8080
```

`http://localhost:8080/demo/dist/` — one section at a time, because of the
paint ceiling below. Drive
your screen at **1440 and 380, in light and dark**. Four renders minimum.

**Reading the diff does not count.** Every defect listed in section 6 survived
a diff review and died on a render. So did these:

- a `#F7F2EB` button on a `#F7F2EB` panel — invisible, and found by rendering
  `Card` > `CardFooter` > `Button variant="secondary"`
- a badge fill at 1.13:1 against its own surface in dark
- `.bg-surface-raised` painting nothing at all while the rebind keyed on it
  fired anyway
- an inactive folder tab at contrast 1.000 against its own ground

### Two measurement traps

**A hidden or zero-width browser pane returns a blank screenshot and nonsense
numbers.** One route measured 24,552px at a collapsed viewport and about
5,000px at a real one. Front the tab and assert `innerWidth` before trusting
any measurement.

**Chrome stops painting past about 20,000px.** The demo renders one section at
a time for exactly this reason. A blank demo is usually this, not your code.

---

## 8 · When the artifact and the build disagree

`KWAPSO-SPEC.md` is the artifact, extracted verbatim. **It is the king.** Where
it and the build disagree, the build is wrong.

With sixteen exceptions — and they are written down.

**Read the OVERRIDE REGISTER at the top of that file before you "correct" the
build back to a chapter.** It lists every place a client decision beats the
artifact text, what it beats, and when it was taken. Some of them are subtle
enough to look like bugs: the focus ring is 1px where ruling 24 says 2, forest
is `#20955B` where the palette page says `#1F9259`, the panel keeps the card's
paper where 27.1 says the opposite.

`verify/decisions.html` holds the side-by-side that settled each one. Open it
the same way as the demo.

And when the artifact does not settle your question at all: **do not invent a
kwapso value.** Write the question down in a `GAPS-*.md` file, quoting the
composition number, and build the most defensible thing you can while saying
plainly in the header that you did. Every value in this system can be traced to
a chapter, a ruling or a logged question — that traceability is the deliverable.

---

## 9 · A screen, start to finish

1. **Find the composition number.** Search `KWAPSO-SPEC.md` for what you are
   building. The artifact numbers its screens 27.1 to 27.45.
2. **Read the register.** Check whether an override applies to it.
3. **Pick the shape.** One of the twelve, or a route you are adding a state to.
4. **Read two neighbours.** The screens next to yours in
   `compositions/screens/` are the house pattern; match their header, their
   prop naming and their ten-states block.
5. **Write it.** Compose. No fill, no radius, no ring, no type step.
6. **Write the header** — what it is, which composition, what it is built from,
   what it does at 380, and the ten states with a reason on every line.
7. **Run the gate.** tsc, tokens, build.
8. **Render it.** 1440 and 380, light and dark, as a bare mount.
9. **Log what you could not settle** in `GAPS-*.md`, quoting the chapter.
10. **Add it to the barrel** — `compositions/screens/index.ts`, as a named
    block, never `export *`. A wildcard cannot be merged by two people editing
    at once; a list of named blocks can.

---

*Every claim in this document is checkable against a file in this repository.
If one of them is not true any more, that is a defect in the document and it
should be fixed here rather than worked around in a screen.*
