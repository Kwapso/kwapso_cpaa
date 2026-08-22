# UI-RULEBOOK.md

How screens in this app are arranged, so that a person reading one has less to hold in
their head. This is a **rearrangement** rule book, not a redesign: every rule here is
expressible with the components `shared/ui/` already ships and the tokens the theme
already defines. Nothing in this document asks anyone to change a component — which was
originally because nobody here could (the library was an npm package from another
repository until 2026-08-22), and is now a deliberate scope line: these are arrangement
decisions, and they should hold whatever the reskin does to the lego underneath them.

**Its relationship to the other law books.** [UI-CONVENTIONS.md](UI-CONVENTIONS.md) is
the *enforced* law (R2, R3, R4, R6, R7, R8, R16 and the action-icon mapping); it stays
in force and nothing here contradicts it. This file is the layer above: the arrangement
decisions those laws leave open. Where a rule here would change an enforced law, it says
so out loud and proposes the in-rule route (see [Rule G1](#g1-a-record-type-carries-a-glyph)
and [Conflicts to settle before building](#conflicts-to-settle-before-building)).

**Where the rules come from.** Two sources, cited on every rule:

- The legacy Glide apps the team is leaving, which they liked. Cited as
  `A-3.55.34` (agency screenshots, `~/Downloads/agency app laptop and mobile screenshots/Screenshot 2026-08-17 at 3.55.34 PM.png`)
  and `P-4.10.31` (client portal screenshots, same date, `kwapso portal laptop and mobile screenshots/`).
  One agency file is dated 2026-08-14 and is cited as `A-4.21.24 (08-14)`.
- The brand site `https://kwapso.com`, whose real stylesheet is
  `https://cdn.prod.website-files.com/688b4337fa679990e06aceaa/css/kwapso-2.webflow.shared.57dc3eb31.css`.
  Cited as `brand.css`.

Where a rule is an inference rather than a direct reading, it is marked **(inferred)**.

**Format.** Each rule has an id you can cite in a pull request, one sentence of law,
the concrete implementation, and its evidence.

---

## Contents

- [0. The diagnosis: three findings that explain most of the complaints](#0-the-diagnosis-three-findings-that-explain-most-of-the-complaints)
- [1. Colour and surface](#1-colour-and-surface) (C1 to C11)
- [2. Page layout and width](#2-page-layout-and-width) (L1 to L7)
- [3. Detail screens](#3-detail-screens) (D1 to D10)
- [4. Collections](#4-collections) (K1 to K9)
- [5. Buttons and actions](#5-buttons-and-actions) (B1 to B9)
- [6. Forms and dialogs](#6-forms-and-dialogs) (F1 to F9)
- [7. Typography](#7-typography) (T1 to T7)
- [8. Spacing, and the scale setting](#8-spacing-and-the-scale-setting) (S1 to S6)
- [9. Mobile](#9-mobile) (M1 to M6)
- [10. Copy](#10-copy) (W1 to W5)
- [11. Record type glyphs](#11-record-type-glyphs) (G1 to G4)
- [12. Density: the glance budget](#12-density-the-glance-budget-n1-to-n12) (N1 to N12)
- [What the old app did better](#what-the-old-app-did-better)
- [Do not do](#do-not-do)
- [Conflicts to settle before building](#conflicts-to-settle-before-building)
- [Rule index](#rule-index)

---

## 0. The diagnosis: three findings that explain most of the complaints

Read this before the rules. Three concrete facts in the codebase account for the
majority of what the owner and Aurora reported, and two of them are one-line fixes.

### Finding 1: the card is not pink, it is transparent

The theme is already right. `shared/ui/styles.css` sets
`--card: #f7f2ea` (kw-soft-paper) on `--background: #fffef9` (kw-off-beige). The brand
site independently sets `--color-scheme--dark-background: #f7f2eb` for every card and
`--color-scheme--background: #fffdf8` for the page (`brand.css`, confirmed by computed
style at two viewport widths: `rgb(247,242,235)` on `.bento-hero`, `rgb(255,253,248)` on
`body`). Those are the same two colours to within one unit. **The card colour the owner
is asking for is the token that is already there.** Note the page is warm off-white, not
white; the separation between page and card is about three per cent lightness, and that
near-invisible step is the signature of the brand.

What makes it read pink is two files fighting:

1. ~~The library defines the card surface as fully opaque paper.~~ **CORRECTED
   2026-08-19: it never did, and this line is why a dialog shipped unreadable.**
   `.glass` in the library is
   `background-color: color-mix(in oklch, var(--card) 72%, transparent)` with a
   `backdrop-filter`, and the comment above it reads *"Frosted glass: a
   translucent pane that blurs (refracts) what's behind it."* The quoted brand
   line does not appear in `styles.css` at all. Two further claims in this
   section are also untrue of it: `--card` is `oklch(1 0 0)`,
   not `#f7f2ea`, which appears nowhere in the file. A paragraph of confident
   detail about a dependency, written once and never re-read against it, is how
   `shared/web/library-overrides.css` came to delete the one rule holding a
   dialog together. (The library stopped being a dependency on 2026-08-22 and now
   sits in `shared/ui/`, which makes it cheaper to re-read but no more likely to
   be re-read. The habit is the point, not the address.)
   **What is true now:** `.glass` is still translucent and is still what a CARD
   uses, deliberately. Every FLOATING surface — dialog, sheet, alert-dialog,
   popover, dropdown, hover-card, select, command — is opaque `bg-card` /
   `bg-popover`, which upstream settled in v0.13.0 and the vendored copy carries.
   **Its guard did not come across:** upstream held that with a census test that
   failed the build if a ninth floating surface shipped without an opaque fill,
   and the vendoring copied `registry/`, `lib/` and `styles.css` — not the
   library's own suite. A ninth one is on the person who adds it.
2. `shared/web/library-overrides.css:12-14` then makes it translucent again:
   `.glass { background-color: color-mix(in oklch, var(--card) 94%, transparent); }`
3. `web/app/globals.css:32-56` paints three blurred mango pools (`#fecc6d`) behind
   everything, drifting on 47s and 61s loops (`kw-drift-a`, `kw-drift-b`).

`Card` carries `glass` in its base class
(`shared/ui/registry/primitives/card/card.tsx:27`), so **every card,
dialog, popover, dropdown menu and sheet in the agency app is six per cent see-through
onto a slowly moving orange field.** Warm beige plus a mango bleed reads as pink, and
because the field drifts, the card colour changes while you look at it. That is both the
"pink card" and the "animations" complaint, from one override.

### Finding 2: two thirds of a wide screen is empty margin

`web/components/deep-link-screen.tsx:330` is the only width cap in the agency app and it
governs every module screen:

```
className={`mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-xl transition-shadow ...`}
```

`max-w-3xl` is 768px. On the 1283 CSS-pixel laptop the screenshots were taken at, the
main region after the 240px sidebar and `px-4` is about 1043px, so each side gutter is
about 138px. On a 2560-pixel display the gutters are over 700px each. Meanwhile the
Glide app runs edge to edge with roughly a 45px gutter and no cap at all
(`A-4.06.36`, `A-4.05.42`). See [L1](#l1-one-page-container-one-cap).

### Finding 3: nothing in this app has an overflow menu

`MoreHorizontal`, `MoreVertical` and `EllipsisVertical` appear **zero times** across
`web/`, `web-portal/` and `shared/`. `DropdownMenu` is imported in exactly four files,
all of them chrome switchers (`profile-menu.tsx`, `team-switcher.tsx`,
`web-portal/components/account-switcher.tsx`, `shared/web/language-menu.tsx`). So every
action a record has is a visible button, which is why the ticket detail grew six on the
title line plus two below (`web/components/help-detail.tsx:418-539`). The three-dot menu
is net-new work, and it is the single highest-leverage change in this document. The old
app had one on every record (`A-3.57.42`, `A-4.05.52`, `A-4.07.25`).

---

## 1. Colour and surface

### C1: the page is off-beige, the card is soft paper, and that is the whole surface system

Two surfaces only. The page is `bg-background` (`#fffef9`). Anything raised off it is
`bg-card` (`#f7f2ea`). There is no third tone, no tinted panel, no coloured section.

Evidence: `brand.css` defines exactly two paper values, `--color-scheme--background: #fffdf8`
and `--color-scheme--dark-background: #f7f2eb`, and every card class on the site
(`.blueprint__card`, `.bento-small-item`, `.ab-team__bento`, `.blueprint__workshop-item`,
`.infographic-dashboard`, `.nk-solution__container-wrapper`, `.contact-form__field`) uses
the second one. `styles.css:84,87` already carries both.

### C2: cards have no border, no shadow and no hover animation

> **AMENDED by [N5](#n5-the-surface-step-is-measured-not-assumed) (18 Aug 2026): the card
> KEEPS its border.** The light theme separates page from card by only ΔL\* 3.22, which is
> below the threshold at which the eye reads two surfaces as separate, so a borderless card
> is invisible in light mode. Dark mode separates them by ΔL\* 10.32, which is why the same
> screen reads better there. `shadow-none` and `hover-lift-none` stand unchanged. Read N5
> before acting on this rule.

```tsx
<Card className="hover-lift-none shadow-none">
```

All three utilities exist today. `Card`'s base class is
`"glass hover-lift rounded-xl border text-card-foreground shadow-sm"`
(`card.tsx:14`); `hover-lift-none` is the library's own documented opt-out
(`styles.css:376-379`). Apply this in `CollectionCard`
(`web/components/deep-link/screen-bits.tsx:32-38`) and it lands on every engine list at
once.

Evidence: a runtime census of all 709 rendered elements on kwapso.com found
**`box-shadow !== none` on zero of them**, and `.bento-hero` computes `border: 0px none`.
The whole site has exactly one border, `1px solid rgba(25,24,23,.15)` on the services
mega-menu panel. Separation between surfaces is achieved purely by tone. In the old app
the deliverable cards (`P-4.10.19`), module tiles (`A-4.00.11`) and roadmap rows
(`P-4.10.12`) are flat filled rectangles with no outline.

### C3: the ambient field never sits behind a content surface

Keep `<AmbientBackground />` mounted once in `web/app/layout.tsx:48`. Do not unmount it
and do not fork it. Instead, **remove the translucency** so it cannot show through:
scope `shared/web/library-overrides.css` to overlays only.

```css
/* Overlays that float free of the page keep the soft surface.
   Cards do not: a card is paper on paper, never a window onto the field. */
[data-slot="dialog-content"],
[data-slot="sheet-content"],
[data-slot="popover-content"],
[data-slot="dropdown-menu-content"] {
  background-color: color-mix(in oklch, var(--card) 94%, transparent);
}
```

This restores the library's opaque `.glass` for `Card` and fixes the pink cast and the
drifting card colour in one edit. See [Finding 1](#finding-1-the-card-is-not-pink-it-is-transparent).

### C4: on a detail screen the ambient shows only in the header band

The header band (see [D2](#d2-the-header-band-is-the-only-ambient-surface-on-the-screen))
is the one region that lets the field through: `bg-transparent`. Everything from the tab
strip down sits on an opaque `bg-background` region so the page reads calm and flat.

```tsx
<div className="bg-background relative z-0">   {/* tabs and below */}
```

Evidence: `A-3.57.42`, `A-3.59.09`, `P-4.10.05`. In every old detail screen the tinted
band stops at the tab underline and the panel below it is plain.

### C5: mango is a fill, never a border and never a gradient

`--primary` (`#fed069`) may fill a primary button, a chip or a selected state. It is
never a gradient on a content surface. Text on mango is always `--primary-foreground`
(`#1a1918`).

**A link is not mango.** The brand site sets `a { color: var(--color-scheme--base); text-decoration: none }`,
so links are plain ink and undecorated; mango is an interaction colour, not a link
colour. The one place mango is allowed as a stroke is a `variant="outline"` primary
button, which the brand site does use (`2px solid #ffd066`, 16 elements, filling solid on
hover), so that single case is permitted.

Evidence: `styles.css:93-97` states this as the brand rule; `--ring` is deliberately ink
(`rgba(26,25,24,0.35)`), not primary, for the same reason. Runtime census of kwapso.com:
mango appears as a background on 11 elements and a border on 16, and as text on 8, all of
them buttons or highlight marks.

### C6: sky, forest and poppy are marks, not backgrounds

`--success` (`#1f9259`), `--destructive` (`#e94a32`) and `--chart-1` (`#89bce6`) colour
text, icons, chart series and badge foregrounds. They never fill a section, a row or a
card.

Evidence: `styles.css:117-121` and `brand.css` (`--color-scheme--forest`, `--red`,
`--sky` appear on marks only).

### C7: status is a badge, never a row tint

A status is a `Badge` with the existing variants (`default`, `secondary`, `outline`,
`destructive`, `success`, `warning`). Never colour the whole row.

Evidence: `A-4.05.42` and `A-4.06.45` show "Change", "Fix", "Feature" and "Scheduled" as
small pale pills inside otherwise plain rows. `Badge` is already the most-used library
primitive in this repo (28 importing files).

### C8: a warning band is amber text on an amber tint, full width, directly under the header

```tsx
<div className="bg-warning/10 text-warning-foreground flex items-start gap-2 rounded-xl px-4 py-3 text-sm">
```

Use `--warning` (`#e8b244`). One band maximum, above the tabs, never inside a tab panel.

Evidence: `A-4.07.25` and `A-4.07.28`, the "This ticket is awaiting resolution since 17
August 2026" band, sitting between the header band and the first content panel.

### C9: an informational callout is muted, not coloured

```tsx
<div className="bg-muted text-foreground flex items-start gap-3 rounded-xl p-4 text-sm">
```

`--muted` is `#efece4`. Reserve colour for status; explanation is grey.

Evidence: `P-4.09.52` (the portal welcome note) and `P-4.10.31` (the "Please fill in all
fields carefully" box at the top of the new-ticket form) are both plain grey boxes with a
small circled information glyph.

### C10: there is one ink, stepped by opacity, not a grey ramp

Text has four values and no more:

| Role | Class | Resolves to |
|---|---|---|
| Everything readable: headings, body, links, nav | `text-foreground` | `#1a1918` |
| Secondary: timestamps, meta lines, footer links, placeholders | `text-muted-foreground` | `#6b6965` |
| Faint: an inactive option, a disabled label | `text-foreground/30` | 30% ink |
| Hairline: the one border colour | `border-[--border]` | `#e8e4dc` |

Do not introduce a fifth grey, and do not reach for `text-neutral-*`, `text-gray-*` or
`text-zinc-*`, which are not in this palette at all.

Evidence: a runtime census of kwapso.com found exactly **four** text colours across 166
text elements: `rgb(25,24,23)` on 132 of them, the inverse `rgb(255,253,248)` on 24 (over
photography), mango on 8 (buttons), and `rgba(25,24,23,0.3)` on 2 (the inactive language
link). The brand site has no grey ramp: `--color-scheme--dark-grey: #bab8b4` is exactly
the ink at 30 per cent over the page, and the one hard-coded grey in the stylesheet,
`#8a8784`, is the ink at 50 per cent over the card. This app's `--muted-foreground`
(`#6b6965`) is the same idea, darkened one step to clear WCAG AA on the card surface
(`styles.css:108-113`); use it rather than an opacity of your own.

### C11: motion is 200ms, one easing curve, and it respects reduced motion

Where a transition is genuinely needed (a hover on an interactive control, a menu
opening, a sticky header collapsing), use `duration-200` and the house curve
`cubic-bezier(.645,.045,.355,1)`. Nothing else animates. No scroll-triggered reveals, no
parallax, no card entrance animation.

The theme already disables `.hover-lift`, `.animate-rise` and `.ss-typing` under
`@media (prefers-reduced-motion: reduce)` (`styles.css:436-448`) and the ambient field is
disabled the same way (`web/app/globals.css:86-91`). Any transition you add joins that
block.

Evidence: kwapso.com uses `cubic-bezier(.645,.045,.355,1)` at `.2s` in five rules and
ships an explicit `prefers-reduced-motion` block. It has **zero** Webflow scroll
interactions (`data-w-id` appears nowhere in the markup), which for a marketing site is a
deliberate restraint worth carrying into a working tool.

---

## 2. Page layout and width

### L1: one page container, one cap

Replace `max-w-3xl` at `web/components/deep-link-screen.tsx:330` with:

```tsx
className="mx-auto flex w-full max-w-[1600px] flex-col gap-6"
```

and set the shell gutters at `web/components/app-shell.tsx:373`:

```tsx
<main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 pb-24 sm:px-6 lg:px-10 md:pb-8">
```

Arithmetic, so the change is checkable. At the 1283 CSS-pixel laptop the screenshots use,
the main region is about 1043px. Today: `px-4` then a 768px cap gives a **138px gutter
each side**. After: `sm:px-6` and no cap reached gives a **24px gutter**, a reduction to
roughly one sixth. At 2560px the 1600px cap keeps a comfortable measure instead of a
1300px void. The owner asked for "roughly a tenth"; this is the honest number that also
survives tablet.

Also delete `rounded-xl transition-shadow` from that same string. It rounds and animates
a container that has no surface, which is the only remaining `transition-shadow` in the
app.

Evidence: [Finding 2](#finding-2-two-thirds-of-a-wide-screen-is-empty-margin);
`A-4.06.36`, `A-4.05.42`, `A-4.08.47` all run edge to edge with a small fixed gutter.
And the brand's own answer, measured: `.nk-container` is `max-width: 1920px` with
`padding: 100px 40px 20px`, computing to a **40px** horizontal page padding at every
desktop width. `lg:px-10` is exactly that 40px, and it is exactly the brand's
`--margin--m` token. The app caps tighter than 1920px only because it carries a 240px
sidebar the marketing site does not; if the owner wants it wider still, raise the cap and
change nothing else.

### L2: prose is capped, the page is not

Line length is a property of the text block, not the page. Any paragraph, article body
or description gets `max-w-[72ch]`. Tables, lists, card grids and calendars take the full
container.

Evidence: `A-4.05.52` puts the description in a roughly 840px column beside a narrow
related-record rail, while the story table on the same screen spans the whole width.
(inferred: the exact `72ch` value; Glide's column is fixed pixels.)

### L3: above roughly 1024px, a detail screen is two columns

Main content left, related records right, at about a 2:1 ratio.

```tsx
<div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
```

The right rail holds the related-record cards (see [D8](#d8-a-related-record-is-a-card-not-a-row-of-labels))
and short sub-collections. Below `lg` it stacks, right rail last.

Evidence: `A-4.05.52`, `A-4.06.12`, `A-4.07.25`. Every wide detail screen in the old app
is this shape.

### L4: the collection index screen may be two panes

Where a collection is normally read filtered by one parent (stories by app, tickets by
app), a left selector pane and a right collection pane is allowed at `lg` and above.

Evidence: `A-4.06.36` and `A-4.06.45`, the Planning screen: an App picker on the left,
the Sprints/Tickets/Backlog/Meetings tab strip and its collection on the right.

### L5: the portal keeps its own, narrower cap and larger type

`web-portal/components/portal-shell.tsx:162` stays `max-w-3xl px-5 py-8`. The portal is a
reading surface for one client, not a working surface, and it already sets
`:root { font-size: 17px }` rising to `18px` at `md`
(`web-portal/app/globals.css:25-34`). Do not unify the two caps.

Evidence: `P-4.09.52` and `P-4.10.05` are noticeably narrower and larger-typed than any
agency screen. (inferred: keeping the divergence deliberate rather than accidental.)

### L6: the shell frame never scrolls

The desktop sidebar, the mobile top bar and the mobile bottom tab bar stay fixed; only
`<main>` scrolls. This is already true (`app-shell.tsx:303,345,378`) and is restated here
because [D3](#d3-the-header-and-tabs-stick) adds a second sticky layer inside `<main>`
and the two must not fight. The shell owns `z-20`; the in-content sticky header takes
`z-10`.

### L7: exactly one `<h1>` per screen, and it is the record or collection name

Today `home-screen.tsx`, `settings-screen.tsx` and `invitations-screen.tsx` disagree
(`text-2xl` heading, uppercase `<h2>` labels, and no heading at all respectively), and
`help-detail.tsx:410` renders the ticket title as `<p className="truncate text-sm font-medium">`.
Every screen gets one `<h1>` at the scale set in [T1](#t1-one-heading-scale-per-front-door).

Evidence: `A-4.07.25` gives the ticket the same large title every other record gets.

---

## 3. Detail screens

### D1: a detail screen has exactly four regions, in this order

1. **Breadcrumb bar** (sticky, dark, from the shell)
2. **Header band**: type mark, eyebrow, title, status line, at most two buttons
3. **Tab strip** (sticky, on plain background)
4. **Tab panel**, and pinned at the very bottom of the panel, the **audit footer**

Nothing else may sit between 2 and 3.

Evidence: `A-3.57.42`, `A-3.59.09`, `A-4.05.45`, `A-4.05.52`, `P-4.10.05`, `P-4.10.12`.
The shape is identical on every record type in both old apps. The one permitted
exception is a warning band between 2 and 3 ([C8](#c8-a-warning-band-is-amber-text-on-an-amber-tint-full-width-directly-under-the-header), `A-4.07.25`).

### D2: the header band is the only ambient surface on the screen

```tsx
<header className="flex flex-wrap items-start gap-4 px-4 pt-6 pb-8 sm:px-6 lg:px-10">
```

Transparent, so the ambient field shows. Its layout is: a 56px (mobile) to 72px (desktop)
rounded square holding the type glyph or logo, then a column with the eyebrow, the title
and the status line, then the action group pushed right with `ml-auto`.

Evidence: `A-3.59.09` (app detail), `A-4.05.45` (sprint detail), `A-4.05.52` (story
detail), `A-4.07.25` (ticket detail), `P-4.10.05` (portal app detail). Same band, five
record types, two apps.

### D3: the header and tabs stick

On scroll, the header band collapses to a single sticky line (glyph at 28px, title at
`text-sm font-medium`, breadcrumb trail visible) and the tab strip pins directly under
it. The full title, the eyebrow and the status line scroll away.

```tsx
<div className="bg-background sticky top-0 z-10 border-b">
  {/* collapsed title line, then the TabsView */}
</div>
```

Detect the collapse with an `IntersectionObserver` on a zero-height sentinel placed at the
bottom of the full header band. No library change: `TabsView` takes a `className`.

Evidence: compare `A-4.00.19` (header full, tabs at y≈653) with `A-4.00.30` and
`A-4.00.37` (header scrolled away, the same tab strip pinned at y≈494 with the tab labels
and badges intact). The tabs demonstrably stick in the old app.

### D4: the eyebrow names the type, in caps, above the title

```tsx
<p className="text-muted-foreground text-xs font-medium tracking-[0.5px] uppercase">
  {typeLabel}{ref ? ` ${ref}` : ""}
</p>
```

"MEETING", "TASK", "APP PRODUCTION", "REQUEST #3512", "CHANGE #3182", "ROADMAP". The
reference number joins the eyebrow, not the title.

The brand site has exactly one label style and this is it: `.nk-subheading` is Saans 500
at 12px on 18px, uppercase, letter-spacing 0.5px. `text-xs` (14px, the theme floor) plus
`font-medium` (500) plus `tracking-[0.5px]` is that style expressed in this theme.

Evidence: `A-3.57.42`, `A-3.58.01`, `A-3.59.09`, `A-4.05.52`, `A-4.07.25`, `P-4.10.05`.
Note the old app puts the type and the number together (`CHANGE #3182`) and leaves the
title as pure prose. This app currently prefixes the ref into the title string
(`web/components/deep-link/shape.ts:128`, `${t.ref} · ${truncate(t.description)}`), which
is why titles read as noise.

### D5: one status line under the title, dot-separated, three facts maximum

```tsx
<p className="text-muted-foreground text-sm">{parts.join(" · ")}</p>
```

"Scheduled · Assigned to Ishita". "Active · 10 August to 22 August 2026". "In progress".

Evidence: `A-4.05.45`, `A-4.05.52`, `A-4.07.25`. Never more than three parts in any old
screenshot.

### D6: a title carries at most two buttons; everything else goes in the three-dot menu

The full rule and the ranking are in [B1](#b1-two-visible-actions-maximum-on-any-title).

### D7: the audit footer is pinned to the bottom of the panel and is grey

"Created by X on DATE" and "Last edited by Y on DATE" leave the Overview tab and become a
footer strip at the end of every tab panel.

```tsx
<footer className="bg-muted text-muted-foreground mt-8 flex flex-wrap gap-x-6 gap-y-1
                   rounded-xl px-4 py-3 text-xs">
  <span>Created by {createdBy} on {createdAt}</span>
  <span>Last edited by {updatedBy} on {updatedAt}</span>
</footer>
```

Evidence for the treatment: `brand.css` `.nk-footer { background-color: var(--color-scheme--dark-background); }`,
which is the *same* beige as every card, sitting straight on the page with no rule or
divider above it, and `.footer-credits { font-size: 12px; font-weight: 300; }`. Its link
items carry `opacity: .5` deliberately. The brand's own footer is the paper tone, small,
light and faded, which is exactly the register an audit line needs: present, findable,
and never competing with the record. Evidence for the
content and the move: `A-4.07.25` currently shows "Created on / Created by" as the last
two rows of the Input panel, and `P-4.10.05` compresses the same two facts into a single
subtitle line, "Created on 6 August 2026 · Paras Maroo".

Today the audit block is assembled by `web/lib/audit-overview.ts` and rendered into
Overview. Move the call site, keep the function.

### D8: a related record is a card, not a row of labels

```tsx
<a className="bg-card flex items-center gap-3 rounded-xl p-4">
  {logo}
  <div className="min-w-0">
    <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">APP</p>
    <p className="truncate font-medium">HORST</p>
  </div>
  <ChevronRight className="text-muted-foreground ml-auto size-4" />
</a>
```

Evidence: `A-3.59.09` ("CUSTOMER / Kwapso"), `A-4.05.45` ("APP / HORST"), `A-4.05.52`
("APP / HORST", "MODULE / Besetzungen"), `A-4.00.30`. Uppercase relationship name,
bold value, chevron only when it navigates.

### D9: a sub-collection inside a detail gets a heading and one icon-only button

Worklog, Tasks, Backlog and Stories inside a record each render as `text-lg font-medium`
plus a single icon button in the top right.

Evidence: `A-4.06.12` (Worklog with a stopwatch button, Tasks with a plus button),
`A-4.07.34` (Backlog with a plus button).

### D10: field labels inside a panel are small caps grey; a field group is a description list

```tsx
<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">DESCRIPTION</p>
```

For label-and-value pairs use the library `DescriptionList` with
`{ ...defaultDescriptionListConfig, columns: 2, surface: "none" }`. Hairline separators
between rows, no card, no border around the group.

Evidence: `A-3.57.42`, `A-3.58.01`, `A-4.05.52` ("TICKET", "DESCRIPTION", "BUILD NOTES",
"SCREENSHOTS", "MEMBER", "DURATION"). `DescriptionList` already ships with exactly this
config shape.

---

## 4. Collections

### K1: a collection row is a title plus one meta line, and nothing else

Two lines. The title, and one dot-separated subtitle carrying **at most three** facts.
Cut the rest.

Today `web/components/deep-link/shape.tsx` and `stories-screen.tsx:48-59` build subtitles
of four and five parts, and prefix the reference into the title as well. The reductions:

| Row | Today | Rule |
|---|---|---|
| Ticket (`shape.ts:128-138`) | `ref · description` + type, status, "N of M done", "archived" | title only; subtitle `status · type` |
| Story (`stories-screen.tsx:48-59`) | `ref · title` + status, assignee, due, sprint, ticket ref | title only; subtitle `status · assignee · due` |
| Task (`tasks-screen.tsx:47-56`) | `ref · title` + done, assignee, due | title only; subtitle `assignee · due` |
| Account (`shape.ts:268-271`) | name + type, code, status, parent | name; subtitle `type · status` |
| Meeting (`shape.ts:217-225`) | title + date, account, purpose, whether it has happened | title; subtitle `date · account` |

The reference number moves to the glyph's `title` attribute and to the detail eyebrow
([D4](#d4-the-eyebrow-names-the-type-in-caps-above-the-title)), where it belongs.

Evidence: `A-3.58.53` (contact rows: name plus company, nothing else), `P-4.10.05`
(ticket rows: title plus "Created on 6 August 2026 · Paras Maroo"), `A-4.00.11` (sprint
rows: name plus date range). The one place the old app shows more fields is a **table**,
never a list ([K2](#k2-a-table-is-for-scanning-a-list-is-for-reading)).

### K2: a table is for scanning, a list is for reading

If a person needs to compare rows on the same attribute, use `DataTable` with named
column headers. If they need to find one record, use `List`. Do not smuggle table content
into list subtitles, which is what the five-part subtitle above is.

Evidence: `A-4.05.42` (a real table: NAME, TYPE, MODULE, ASSIGNED TO, CREATED ON with
uppercase headers) versus `A-3.58.53` (a real list). Both exist in the old app and they
are never mixed.

### K3: the count lives in the heading, formatted "N adjective plural"

"9 Open Stories". "16 Open Tickets". "21 Active Apps". "1 Open Issues".

This is R16's `formatCount` seam plus `CollectionHeading`
(`web/components/collection-heading.tsx`), which already renders the count as a chip
beside the `<h1>`. The change is the wording: the number leads, and the heading names the
filter state it is counting.

Evidence: `A-3.59.37`, `A-3.59.42`, `A-4.05.42`, `A-4.07.02`, `A-4.00.30`.

### K4: a tab that reveals a collection carries the count as a badge, and the heading stands down

Already law (R8, R16) and already arbitrated by
`web/components/counted-tabs.tsx`. Restated because the old app is a clean model of it:
"Backlog 11", "Tickets 16", "Ready 1", "Issues 1", "Questions 4", "Requests 24",
"Extras 170".

Evidence: `A-4.00.30`, `A-4.07.02`, `A-4.08.47`.

### K5: rows are separated by a hairline, never boxed individually

One `Card` around the whole collection ([C2](#c2-cards-have-no-border-no-shadow-and-no-hover-animation)),
then `divide-y divide-[--border]` on the row container. No border per row, no gap per row.

Evidence: `A-3.58.53`, `A-3.59.42`, `P-4.10.05`. Note `web-portal/components/ticket-row.tsx:39`
currently boxes each row (`rounded-xl border p-4`), and
`web-portal/components/waiting-on-you.tsx` and `delivery-block.tsx` do the same. Those
three are the migration targets.

### K6: rows group under a plain status heading

`text-lg font-medium`, no chip, no rule, no count.

Evidence: "Ready", "Pending", "In progress", "Blocked", "Scheduled", "Planned",
"Wrapped", "Not started" in `A-4.00.44`, `A-4.05.42`, `A-4.06.45`, `P-4.10.12`.

### K7: the collection toolbar is one row: heading, search, filter, add

Left to right on `sm` and up: `<h1>` with count, then `ml-auto`, then the search input,
then the filter button, then the add button. This is `headerLayout: "inline"`, already
the standard (UI-CONVENTIONS.md §6).

Evidence: `A-3.59.37`, `A-4.05.42`, `A-4.07.02`.

### K8: the filter control is an icon-only button when it has no active filter

A funnel glyph in a `variant="ghost" size="icon"` button. It grows a label and a count
only once a filter is applied.

Evidence: `A-4.00.19`, `A-4.05.45` (bare funnel button beside the search field) versus
`A-3.59.37` (a wider "Filter" dropdown when the screen has facets in play).

### K9: a card grid is used only when the record has an image

Apps, accounts and deliverables have logos or thumbnails, so they may render as
`CardGrid`. Tickets, stories, tasks and sprints do not, so they never do.

Evidence: `A-3.58.58` (customer cards with cover images), `P-4.10.19` (deliverable cards
with video thumbnails) against `A-4.06.45` (stories as a table).

---

## 5. Buttons and actions

### B1: two visible actions maximum on any title

A record title carries at most **one primary** and **one secondary** button. Everything
else goes into a three-dot menu at the end of the group.

Ranking, when you have to choose which two survive:

1. The action that **moves the record forward** in its lifecycle (Answer, Start, Complete,
   In progress). This is the primary, `variant="default"`.
2. The action a person takes **most often that is not destructive**. Secondary,
   `variant="outline"`.
3. Everything else: Edit, Archive, Deactivate, Translate, Reply by email, Make it a
   story, Move up, Move down, Read the transcript, Take it back out.

Concrete target, `web/components/help-detail.tsx:418-539`, which is Aurora's seven:

| Action | Line today | Where it goes |
|---|---|---|
| Answer | 434 | primary button |
| Reply by email | 446 | menu |
| Translate | 419 | menu |
| Make it a story | 460 | menu |
| Edit | 471 | menu |
| Archive / Take it back out | 486, 497 | menu, destructive styling |
| Move up / Move down | 520, 530 | menu |

That is one visible button and a menu. `story-detail.tsx` keeps "Start timer" as primary
and "Edit" as secondary, moving "Move up" and "Move down" into the menu.
`sprint-detail.tsx`, `account-detail.tsx`, `app-detail.tsx` and `meeting-detail.tsx`
already have two or fewer and need no change.

Evidence: `A-4.05.52` shows exactly this: one "In progress" primary and a three-dot menu
containing Blocked, Edit, Archive, Delete. `A-3.58.01` shows "Start" plus a menu with
Edit and Delete. `P-4.10.05` shows "Open App" plus "New Ticket" and nothing else.
`A-3.57.42` and `A-4.07.25` show a menu alone.

### B2: the three-dot menu

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline" size="icon" aria-label="More actions">
      <MoreHorizontal className="size-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem>…</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem className="text-destructive">…</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

Every item keeps the icon from the UI-CONVENTIONS.md §4 mapping at `size-3.5`.
Destructive items sit last, after a `DropdownMenuSeparator`, in `text-destructive`, and
still open their confirm step. Only these `DropdownMenu*` names exist; there is no
`DropdownMenuRadioGroup` in this library.

Evidence: `A-4.05.52` (Blocked, Edit, Archive, Delete, with Delete last), `A-4.06.01`
(the same menu on mobile, In progress promoted into it), `A-3.57.48` (Edit, Delete).

### B3: the add button is a plus glyph with no text, everywhere

```tsx
<Button size="icon" onClick={onCreate} aria-label={`New ${nounSingular}`}>
  <Plus className="size-4" />
</Button>
```

`Button` already has `size="icon"` (`size-9`, `rounded-full`), which produces the round
dark button the old app uses. Change `web/components/deep-link/screen-bits.tsx:95-98`,
which is the single seam for every collection add button in the agency app, and
`web-portal/components/tickets-screen.tsx:62`.

The thirteen labels this deletes ("New task", "New story", "New meeting", "New role",
"New account", "Invite", "Raise ticket", "Add a source", "Map a process",
"Start a sprint", "Record an app", "Upload a file", plus the portal's) become the
`aria-label` and the tooltip. That also ends the two competing naming families
("New <noun>" and "<verb> a <noun>").

Evidence: `A-3.55.34`, `A-3.59.42`, `A-4.00.30`, `A-4.00.44`, `A-4.06.12`, `A-4.07.02`,
`A-4.07.11`, `A-4.07.34`. The old app uses a bare plus in every one, on desktop and
mobile, on top-level collections and on sub-collections.

The one exception: the portal's "New Ticket" keeps its label, because a client visits
rarely and needs the invitation (`P-4.10.05`, `P-4.10.12`, `P-4.10.19`).

### B4: import and export keep their labels and their icons

`Upload` plus "Import CSV", `Download` plus "Export CSV". These are rare, consequential
and not guessable from a glyph.

Evidence: (inferred) the old app has no import surface to copy; this follows from
UI-CONVENTIONS.md §4 and from the same reasoning as the portal exception in B3.

### B5: a full-width outlined button is the pattern for a secondary action inside a panel

```tsx
<Button variant="outline" className="w-full gap-1.5">
  <Plus className="size-4" /> Task
</Button>
```

Evidence: `A-4.07.34` ("+ Task"), `A-4.07.25` ("Translate"), `A-3.59.09` ("Edit"),
`P-4.09.55` (the portal's full-width primary).

### B6: destructive stays red and still confirms

Unchanged from UI-CONVENTIONS.md §4. Moving an action into the menu does not remove its
confirm step.

### B7: a view switch is a labelled pill, not a plus

Calendar / Grid / List switches are `Button` with an icon and a label, filled when active.
Do not make them icon-only; they are modes, not actions.

Evidence: `A-4.08.47` and `A-4.08.56` ("Grid" as a filled dark pill with a grid glyph).

### B8: action rows wrap and the group is pushed right with `ml-auto`

Already law (UI-CONVENTIONS.md, C4). Restated because [B1](#b1-two-visible-actions-maximum-on-any-title)
shrinks these rows to two items and the wrap rule must survive the edit.

### B9: pagination is numbered, centred, at the foot of the collection

`Button variant="ghost" size="icon"` for previous and next, numbered pages between.

Evidence: `A-4.06.45`. This app currently uses a "Load more" button
(`web-portal/components/tickets-screen.tsx:88`), which R14's keyset paging supports
either way. (inferred: adopting the old app's numbered form; both satisfy R14.)

---

## 6. Forms and dialogs

### F1: every submit button says "Submit"

One word, every form, both front doors. This replaces 30 distinct labels currently in
use, including "Save changes" (13 sites), "Add it" (7), "Save" (4), "Create role",
"Add value", "Add source", "Add file", "Add contact", "Add account",
"Add step", "Record it", "Map it", "Start it", "Log it", "Put it in the diary",
"Share it", "Send it", "Send it from kwapso", "Send and resolve", "Send invite",
"Ask and email", "Raise ticket", "Give access", "Save profile", "Email me a code",
"Continue", "Start my own team".

The busy label is "Submitting…" everywhere, replacing "Saving…", "Sending…",
"Creating…", "Adding…", "Sharing…", "Raising…", "Switching on…".

Implement by giving `FormShell` a footer it renders itself rather than by editing 37 call
sites one at a time. The library's own `Form` collection already defaults
`submitLabel: "Submit"` (`shared/ui/registry/collections/form/form.tsx:40`),
so this aligns the host with the library rather than diverging from it.

Evidence: `P-4.10.31` and `P-4.10.36`, the portal's New Ticket form. The button says
**Submit**, with **Cancel** beside it. It is the only form in either old app.

### F2: the dialog is a three-row grid and never spills

This fixes the reported bug directly. `shared/web/form-shell.tsx` currently renders a
flat `flex flex-col` with no height bound, so a tall form pushes past `DialogContent`.

```tsx
<form className="grid max-h-[85dvh] grid-rows-[auto_1fr_auto]" onSubmit={onSubmit}>
  <div className="flex flex-col gap-1.5 px-6 pt-6 pb-4">{title}{subtitle}</div>
  <div className="overflow-y-auto overscroll-contain border-t px-6 py-5">
    <div className="flex flex-col gap-4">{children}</div>
  </div>
  <div className="bg-card flex flex-wrap justify-end gap-2 border-t px-6 py-4">{footer}</div>
</form>
```

`85dvh` rather than `85vh` so the mobile browser chrome does not clip the action row.

Evidence: `P-4.10.31` (desktop: a fixed header, a scrolling body, an action bar pinned at
the bottom of the sheet) and `P-4.10.36` (mobile: the same, as a bottom sheet with a drag
handle and a sticky Cancel/Submit bar).

### F3: the separator becomes the action bar's top edge

The two `<Separator />` elements at `form-shell.tsx:40` and `:42` are replaced by
`border-t` on the two regions that follow them, as in F2. A hairline that is the top edge
of a padded bar can never collide with the button inside it, at any type scale. This
retires the `pt-6` workaround and its 11-line comment at `form-shell.tsx:43-53`, which
documents the collision being fixed here.

Note that `form-shell.tsx` is the only file in either front door importing
`primitives/separator`, so this change removes the app's last use of it. That is correct:
a separator is a divider between peers, and a form's action bar is not a peer of its
fields.

Evidence: `P-4.10.31`, `P-4.10.36`. The old form has no free-standing rule anywhere; the
bar's own edge does the work. Also the code comment cited above, which records the owner
reporting the collision on staging in August 2026.

### F4: Cancel sits beside Submit, and its position flips on mobile

Desktop: Submit then Cancel, right-aligned. Mobile: Cancel left, Submit right, both
`flex-1`.

Evidence: `P-4.10.31` (desktop, Submit then Cancel) and `P-4.10.36` (mobile, Cancel then
Submit, each half-width). The old app deliberately reverses them, so the destructive-ish
option is never under the thumb's resting position on a phone.

### F5: a field is label left, requirement right, control below

```tsx
<div className="flex items-baseline justify-between">
  <Label className="font-medium">{label}</Label>
  {required && <span className="text-muted-foreground text-xs">Required</span>}
</div>
```

Evidence: `P-4.10.31`, `P-4.10.36`. Every field in the old form carries "Required" as a
small grey word on the right of its label. This app currently marks required fields with
a `.required-ring` and no words.

### F6: a character-limited text field shows its counter under the input, right-aligned

`text-xs text-muted-foreground`, format `0/50`.

Evidence: `P-4.10.31`, `P-4.10.36`.

### F7: a short enumerated choice is a row of chips, not a select

Three to five options with a glyph each become pill buttons. Six or more stay a `Select`.

Evidence: `P-4.10.31`, `P-4.10.36`, the Type field: Request, Question, Issue as three
outlined pills, each with its type glyph. They wrap to two rows on mobile rather than
becoming a dropdown.

### F8: the form's explanatory note is a muted callout at the top, inside the scroll region

Never a floating tooltip, never a subtitle longer than one line.

Evidence: `P-4.10.31` (the "Please fill in all fields carefully…" grey box) and
`P-4.09.52`. See [C9](#c9-an-informational-callout-is-muted-not-coloured).

### F9: a dialog on a phone is a bottom sheet

Below `sm`, use the library `Sheet` with `side="bottom"` and a `rounded-t-3xl` top, not
a centred `Dialog`. Keep `FormShell` inside it unchanged, which keeps R4 satisfied.

Evidence: `P-4.10.36`, `A-3.58.16`. Both old apps present forms as bottom sheets on a
phone, with a drag handle.

---

## 7. Typography

### T1: one heading scale per front door

| Level | Agency (`web/`) | Portal (`web-portal/`) |
|---|---|---|
| Screen title `<h1>` | `text-2xl font-medium tracking-tight` | `text-3xl font-medium tracking-tight` |
| Section `<h2>` | `text-lg font-medium` | `text-lg font-medium` |
| Field group label | `text-xs font-medium uppercase tracking-wide text-muted-foreground` | same |
| Body | `text-sm` | `text-base` |
| Meta | `text-xs text-muted-foreground` | `text-xs text-muted-foreground` |

Note the weight: `font-medium`, not `font-semibold`. The brand loads exactly two weights,
Saans Light 300 and Saans Medium 500 (`styles.css:26-49`, `brand.css`
`--font-styles--heading: Saans`), so `font-semibold` (600) has no face and the browser
synthesises it. There are 26 raw `<h1>` tags in the repo, all `font-semibold`, and the
portal's `<h2>` alternates `font-medium` and `font-semibold` between four files. This
table settles it.

Evidence: a weight census of the brand stylesheet returns `font-weight: 300` in 77 rules
and `500` in 70, and nothing else outside Webflow's own normalize boilerplate. The body
font and the heading font are literally the same token there
(`--font-styles--body` and `--font-styles--heading` both resolve to `Saans, Arial, sans-serif`),
so the entire brand is one family in two weights. A third weight is not a styling
decision, it is a font the library would have to ship.

### T2: `--text-xs` is 14px and that is the floor

`styles.css:216` sets `--text-xs: 0.875rem` and calls it "the kwapso floor". Never write
`text-[11px]` or `text-[10px]`. The two places that do today
(`app-shell.tsx:388`, the mobile tab labels at `text-[11px]`) should move to `text-xs`.

### T3: uppercase is only ever a label, never a title and never a sentence

`tracking-[0.5px] uppercase` at `text-xs font-medium` marks an eyebrow, a table column
head or a field group. Nothing longer than three words.

Evidence: `A-3.57.42`, `A-4.05.42`, `A-4.05.52`, `P-4.10.19`. The old app never
uppercases a title. On the brand site `text-transform: uppercase` appears in exactly ten
rules and every one of them is a small label (`.nk-subheading`, `.contact-form__label`,
`.cs-header__back`, the language switcher); the 120px hero headline is sentence case.
Letter-spacing of 0.5px is the house default there, applied in 43 rules and explicitly
reset to `normal` on display sizes, which is why it belongs on labels and not on titles.

### T4: numbers and dates are `tabular-nums`

Any column of durations, counts, prices or dates gets `tabular-nums` so the digits line
up.

Evidence: (inferred) from `A-4.06.12`, where the Worklog MEMBER/DURATION columns are
clearly aligned on the digit.

### T5: a long title wraps to two lines and clamps; it never truncates on one

```tsx
<h1 className="line-clamp-2 text-2xl font-medium tracking-tight">{title}</h1>
```

`help-detail.tsx:410` currently uses `truncate` on a single line, which hides the end of
every real ticket title.

Evidence: `A-4.05.52` and `A-4.06.01`, where the story title "Rename field 'Austritt/ÜL-Ende'
to 'DV-Ende' on the placement creation screen" wraps to two lines on desktop and three on
mobile, complete.

### T6: Serrif Condensed is not used in product UI

The second brand face is for taglines and pull quotes on the marketing site. Product
screens are Saans only.

Evidence: `styles.css:20-23` names its purpose; no old-app screenshot shows a serif.

### T7: the radius vocabulary is two values, and the class you write is `rounded-xl`

> **AMENDED by [N9](#n9-two-radii-one-fill-no-shadow) (18 Aug 2026)** with the census: 57
> of the app's 125 radius classes are off-vocabulary, `rounded-lg` alone 48 of them, and
> because every step already computes to 24px **changing all 57 is a visual no-op**.

Every Tailwind radius step from `rounded-sm` to `rounded-3xl` resolves to the same
`var(--radius)` = 24px (`styles.css:261-266`). Pills come from `rounded-full`. Since
`rounded-lg`, `rounded-xl` and `rounded-2xl` are literally identical, pick one and write
it everywhere so the source stops implying a hierarchy that does not exist. Use
`rounded-xl`.

One divergence to be aware of and **not** to "fix" unilaterally: the brand site's panel
radius is **10px** (`--radius--radius: 10px`, 40 rendered elements), while the library's
is 24px, recorded as a locked "two radii only" decision in `shared/ui/styles.css` (the
line number this used to cite no longer resolves — read the radius block in that file).
The pill value agrees (the site uses 50px, the library uses `rounded-full`). If the 24px
panels read too soft beside the marketing site, that is a token change in
`shared/ui/styles.css`, made once — and since 2026-08-22 that file is in this repo, so
it is a change this repo makes rather than one it asks for. It is still not a
per-component override in the host.

---

## 8. Spacing, and the scale setting

### S1: the vertical rhythm is 4, 8, 16, 24, 40

> **AMENDED by [N7](#n7-five-gaps-and-each-one-means-something) (18 Aug 2026),** which
> attaches a MEANING to each of the five steps and drops the `gap-3` line below (S1 named
> the scale and then broke it in its own next sentence). N7 also carries the census: 210 of
> the app's 516 gaps are off-scale, and `gap-6`, the gap that means "these are separate",
> is used eleven times in the whole app. Implement N7's table, not this list.

`gap-1` / `gap-2` / `gap-4` / `gap-6` / `gap-10`. Nothing between them.

- Between fields in a form: `gap-4`
- Between panels on a screen: `gap-6`
- Between major sections: `gap-10`

Evidence: `brand.css` `--margin--s: 10px`, `--base: 20px`, `--m: 40px`, `--l: 60px`,
`--xl: 80px`, `--xxl: 100px`, a doubling scale; its gap census is 10px (44 rules), 20px
(38), 16px (18), 40px (12). Card padding on the brand site is 40px, and section vertical
rhythm is 100px top. The portal already uses `gap-10` between sections
(`web-portal/components/home-screen.tsx:58`, `company-screen.tsx:60`, `impact-screen.tsx:132`).

### S2: horizontal gutters are `px-4 sm:px-6 lg:px-10`

One string, used by the shell and by the header band so they align to the same left edge.
See [L1](#l1-one-page-container-one-cap).

### S3: card padding is `p-4`, panel padding is `p-6`

`CollectionCard` already uses `p-4` (`screen-bits.tsx:35`). Detail panels use `p-6`, which
matches `CardHeader` and `CardContent` defaults so no override is needed there.

### S4: the scale setting is three steps, and it sets one CSS variable

Add a display preference with three steps, following the language preference exactly:
`shared/web/language-section.tsx` for the settings panel and
`shared/web/language-menu.tsx` for the portal header. Persist it the same way language is
persisted, through `setLanguage` at `web/lib/api/auth.ts:63`, so it follows the person
between devices rather than living in one browser.

| Step | Root font size | Effect |
|---|---|---|
| Compact | `15px` | |
| Comfortable (default) | `16px` agency, `17px` portal | today's values |
| Large | `18px` agency, `19px` portal | |

One variable, set on `<html>`. Because every size token in the theme is in `rem`
(`--text-xs: 0.875rem`, `--text-sm: 0.9375rem`, `--text-base: 1rem`) and every spacing
class is a Tailwind `rem` step, **text and spacing move together from one number**, which
is precisely what the iPhone's setting does. No component takes a size prop and no
component needs one.

Where it lives: `web/components/screens/settings-screen.tsx`, beside `LanguageSection`
at line 128; and in the portal header beside `ModeToggle`
(`web-portal/components/portal-shell.tsx:154-155`), because the portal has no settings
screen by design.

Evidence: (inferred) from the owner's brief. The mechanism is forced by
`web-portal/app/globals.css:25-34`, which already changes the whole portal's size by
setting `:root { font-size }` and nothing else, proving the approach works in this
codebase.

### S5: the scale setting is what makes the locked viewport honest

`web/app/layout.tsx` sets `maximumScale: 1, userScalable: false`. With pinch-zoom
disabled, S4 is the only way a person can make this app bigger. Do not ship the viewport
lock without the setting.

### S6: touch targets stay at 44px on coarse pointers at every scale step

`web-portal/app/globals.css:38-44` already enforces this for `button`, `a[role="button"]`
and `[role="tab"]`. Copy that block into `web/app/globals.css`. At the Compact step the
`rem`-derived height of `size="sm"` drops below 44px, so the floor must be absolute.

---

## 9. Mobile

### M1: mobile is not desktop shrunk

Already locked (ARCHITECTURE.md §6, UI-CONVENTIONS.md §4). Every rule below is an
application of it.

### M2: on a phone the title carries one button and the menu

The primary action stays; the secondary joins the three-dot menu. The menu grows, the row
does not wrap.

Evidence: `A-3.58.16` (the task's "Start" moves into the menu, leaving only the menu),
`A-4.06.01` (the story's "In progress" moves into the menu), `P-4.10.08` and `P-4.10.16`
(the portal keeps "Open App" and folds "New Ticket" into a three-dot). This is the old
app's own collapse rule and it is the reason the two-button limit works at all.

### M3: the tab strip scrolls horizontally, does not wrap, and hides its scrollbar

`overflow-x-auto no-scrollbar` on the `TabsList`. `no-scrollbar` is a library utility
(`styles.css:355-361`), written for exactly this ("used by overflowing tab bars"). The
active tab scrolls into view on mount.

Evidence: `A-4.00.19`, `A-4.00.30`, `A-4.00.44`, `A-4.00.49`. Eight tabs scroll
horizontally on a phone with the active one centred and the neighbours half-visible.

### M4: a two-column detail stacks, main content first

Evidence: `A-4.06.19` versus `A-4.06.12`.

### M5: a two-pane collection becomes a filter control above the list

The left selector pane becomes a single `Select` at the top of the screen.

Evidence: `A-4.06.39` and `A-4.06.49`. The App picker that is a full left column at
desktop becomes one dropdown showing "HORST" with a clear X on a phone.

### M6: the audit footer stays a footer on mobile

It does not become a card and it does not move into a tab. Same `bg-muted` strip, same
`text-xs`, wrapping to two lines.

Evidence: (inferred) from [D7](#d7-the-audit-footer-is-pinned-to-the-bottom-of-the-panel-and-is-grey);
the brand footer at `brand.css` `.nk-footer__bottom-wrapper` keeps its treatment and only
changes direction at the mobile breakpoint (`flex-flow: column`).

---

## 10. Copy

### W1: no em dashes anywhere a person can read

Use a comma, a full stop, a colon or a pair of brackets. In a dot-separated meta line use
` · `. For a date range use "10 August to 22 August 2026", not a dash.

There are about **53** em dashes in user-visible strings today (the ~2,100 total
occurrences are overwhelmingly in code comments, which are not covered by this rule).
Highest counts: `web/components/google-connections.tsx` (4),
`web/components/access-tokens.tsx` (4), then `time-panel.tsx`,
`staff-profile-dialog.tsx`, `process-detail.tsx`, `meeting-form-dialog.tsx`,
`meeting-detail.tsx`, `knowledge-detail.tsx`, `help-form-dialog.tsx`,
`google-source-dialog.tsx`, `deep-link/write-panels.tsx`, `app-form-dialog.tsx` (2 each).

Representative rewrites:

| Today | Rule |
|---|---|
| `"Couldn't read that image. Try another one."` | `"Couldn't read that image. Try another one."` |
| `"It starts with no access, you'll choose what it can do in the next step."` | `"It starts with no access. You'll choose what it can do next."` |
| `"That file is over 25 MB, please pick a smaller one."` | `"That file is over 25 MB. Please pick a smaller one."` |
| `"Ours, not a client's"` | `"Ours, not a client's"` |
| `"Answered, and emailed to them."` | `"Answered, and emailed to them."` |

Evidence: the old app breaks this rule and it shows. `P-4.09.52`: "We fix most bugs
within 48 hours (Mon–Fri), even faster in urgent cases." `P-4.10.31`: "Feel free to
attach screenshots, a picture is worth a thousand words."

### W2: the empty-value placeholder is an en dash, and it is the one exception

The 73 standalone `"—"` placeholders in `web/components/deep-link/shape.tsx` and elsewhere
are a different construct from prose punctuation. Standardise them on `"–"` (en dash) or,
better, on nothing at all where `hideEmpty` on `DescriptionList` can drop the row instead.
`defaultDescriptionListConfig` already sets `hideEmpty: true`.

### W3: a collection heading names the filter it is showing

"Open tickets", not "Tickets", when the list is filtered. See
[K3](#k3-the-count-lives-in-the-heading-formatted-n-adjective-plural).

### W4: the glossary still wins

R6 is unchanged. Every noun in this document that names a product concept comes from
`shared/glossary.ts`: ticket, story, task, sprint, account, contact, activity, overview,
status, work log, reference number.

### W5: sentence case, including inside the three-dot menu

"Reply by email", not "Reply By Email". Unchanged from UI-CONVENTIONS.md §5, restated
because the new menu is a new surface where the habit can slip.

---

## 11. Record type glyphs

### G1: a record type carries a glyph

Every ticket, story, task, sprint and roadmap phase shows a small pictograph in the
leading slot of its row and in the header band's square, so the type is readable without
reading.

> **DECIDED, 17 Aug 2026: option 1.** UI-CONVENTIONS.md §5 now reads "no emoji IN COPY"
> and defines a TYPE MARK with four conditions it must meet. The law was changed first,
> deliberately and in writing, exactly as this section asked. **G2 below applies as
> written.** The reasoning is recorded in §5 itself: the owner asked for these twice in
> writing, Aurora asked for the same thing independently, and the agency's legacy data has
> carried a glyph and a colour on every ticket, story and sprint type for years. A rule
> that forbids what the business already does had stopped describing reality.

**Superseded, kept for the record.** UI-CONVENTIONS.md §5 previously said
"**No emoji.** Anywhere. (This is a hard design-language rule.)" and
`shared/rules/registry.ts` pins it. The in-rule route, in order of preference:

1. **Amend UI-CONVENTIONS.md §5** to read "no emoji **in copy**", and add the glyph to
   §4 as a *type mark*, which is what it is: it occupies the slot a lucide icon would,
   it is `aria-hidden`, it never appears inside a sentence, and it is always accompanied
   by the type word in the eyebrow or the column header. Then G2 applies as written.
2. **Or** implement G2 with lucide glyphs from `CONCEPT_ICON` (`web/lib/pages.ts:250-305`)
   instead, which changes nothing in the law book but gives up the colour that makes a
   type readable at a glance in a long list.

Do not ship option 1 by quietly writing emoji into components. Change the law first, or
take option 2.

Evidence for the request: `A-4.00.11`, `A-4.05.42`, `A-4.06.45`, `A-4.07.02`, `P-4.10.12`.
The old app puts a coloured pictograph on every row of every work collection and it is
the single fastest read on the screen.

### G2: the mapping, if option 1 is taken

One map, one file, sitting beside `CONCEPT_ICON` in `web/lib/pages.ts`. No emoji appear
in this document, so each glyph is named by its Unicode name and codepoint.

| Record | Glyph | Codepoint |
|---|---|---|
| Ticket, request | Thought balloon | U+1F4AD |
| Ticket, question | Red question mark | U+2753 |
| Ticket, issue | Warning sign | U+26A0 U+FE0F |
| Story, feature | Sparkles | U+2728 |
| Story, change | Twisted rightwards arrows | U+1F500 |
| Story, fix | Bug | U+1F41B |
| Task | Check mark button | U+2705 |
| Sprint, implementation | Gem stone | U+1F48E |
| Sprint, validation | Eyes | U+1F440 |
| Sprint, refinement | Sparkles | U+2728 |
| Sprint, enhancement | Rocket | U+1F680 |
| Sprint, training | Graduation cap | U+1F393 |

Every one of these is read directly off a screenshot: `A-4.05.42` (change, fix),
`A-4.06.45` (feature, change), `A-4.07.02` (issue), `A-4.06.36` (question, request),
`A-3.55.53` and `P-4.10.12` (gem, eyes, sparkles, rocket, graduation cap),
`A-4.00.11` (rocket, graduation cap).

The glyph is rendered as:

```tsx
<span aria-hidden className="shrink-0 text-base leading-none">{RECORD_GLYPH[type]}</span>
```

### G3: in the header band the glyph sits in a rounded square

`size-14 sm:size-[72px] rounded-xl bg-muted grid place-items-center text-3xl`.

Evidence: `A-3.57.42`, `A-3.58.01`, `A-4.05.45`, `A-4.05.52`, `A-4.07.25`. When the
record has a real logo (an app, an account) the logo replaces the glyph in the same
square, `object-contain` per UI-CONVENTIONS.md C5.

### G4: a glyph never carries meaning on its own

Every glyph is paired with its type word somewhere on the same screen: the eyebrow on a
detail, the "TYPE" column or the group heading on a collection. Screen readers get the
word, not the pictograph.

Evidence: `A-4.05.42` shows the glyph in the NAME column and the word in the TYPE column
of the same row.

---

## 12. Density: the glance budget (N1 to N12)

The eleven sections above decide what a thing looks like. This one decides **how much of
it may be on screen at once**, and it is the section the rearrangement work executes
against. It exists because the complaint that started this rule book was not "the wrong
colour" or "the wrong button", it was *"looking at so much information in one go is
overwhelming"* and *"it is feeling a bit twisted, like there is too much to do"*.

Those are two different faults and they need two different measures. Too much is a
**count**. Twisted is a **grouping** failure: things that are near each other are not
about each other, so the eye keeps regrouping and never settles. A screen can be twisted
while holding very little, and calm while holding a lot.

### The glance score, and how to compute it

Five measures, twenty points each, one hundred total. Higher is calmer. Nothing here is a
judgement call: every input is a count you can take off the JSX.

**The three things you count.**

| Term | Definition |
|---|---|
| **information unit** | one thing the eye has to decode on its own: a heading, a label-and-value pair (**one** unit, not two), a badge, a button, an avatar or type mark, a standalone number, an input, a date, an icon that carries meaning. A decorative glyph beside its own word is **not** a unit ([G4](#g4-a-glyph-never-carries-meaning-on-its-own)); it rides with the word. |
| **band** | the units that share one horizontal line: a list row, a header band, a toolbar, a status line, one row of a table. Two facts joined by ` · ` on one line are two units on one band. |
| **block** | anything with its own heading, its own container, or `gap-6` or more of air around it: a heading, a card, a panel, a callout, a toolbar, a tab strip, a stat row, a banner. |

**The five measures.**

| # | Measure | What you count | 20 | 16 | 12 | 8 | 4 | 0 |
|---|---|---|---|---|---|---|---|---|
| **H** | horizontal load | units on the busiest band | ≤3 | 4 | 5 | 6 | 7 | ≥8 |
| **H** | *(table row)* | columns in the widest table | ≤4 | 5 | 6 | 7 | 8 | ≥9 |
| **V** | vertical load | blocks between the top of the content region and the first row of primary content | ≤2 | 3 | 4 | 5 | 6 | ≥7 |
| **G** | glance cost | units above the fold: `3 + 2(V−1) + T + min(5, rows) × H`, where `T` is the tabs in the strip | ≤20 | ≤25 | ≤35 | ≤50 | ≤70 | >70 |
| **F** | grouping fidelity | conforming bands ÷ total bands (see below) | 1.0 | ≥0.9 | ≥0.8 | ≥0.7 | ≥0.6 | <0.6 |
| **S** | span utilisation | content width ÷ the width content is allowed to fill, at 1440 | ≥0.90 | ≥0.80 | ≥0.70 | ≥0.60 | ≥0.50 | <0.50 |

**Verdict bands.** 85 and above is *calm*. 70 to 84 is *fine*. 55 to 69 is *busy*. Below
55 is *overwhelming*, and an overwhelming screen is a defect in the same way too much code
is a defect.

**Why these numbers and not others.** They are all taken from rules this book already
made, so the metric cannot disagree with the rest of the document:

- **H ≤ 4** because [D5](#d5-one-status-line-under-the-title-dot-separated-three-facts-maximum)
  already caps a status line at three facts, and a band usually carries a title as well.
  A **table** gets six because its column header labels every cell, which is work the eye
  does not have to repeat, and that is the whole of [K2](#k2-a-table-is-for-scanning-a-list-is-for-reading).
- **V ≤ 3** because [D1](#d1-a-detail-screen-has-exactly-four-regions-in-this-order) says a
  detail screen has four regions and the third one is the content. Header, strip, content.
- **G ≤ 25** is the glance model: the header plus the first five rows. Five, not twelve,
  because past the fifth row a person has stopped glancing and started scanning, and the
  complaint is about the glance.
- **S** measures against *the width content is allowed to fill*, not the viewport. In the
  agency app that is 1120px at 1440 (1440 less the 240px rail less the two 40px gutters);
  in the portal it is the portal's own 768px cap, which is a locked decision
  ([L5](#l5-the-portal-keeps-its-own-narrower-cap-and-larger-type)) and not a failure. A
  door card (sign-in, onboarding, a refusal) has no content to spread, so **S is not
  measured** there and the screen is scored out of 80 and normalised.

**Grouping fidelity, stated so two people get the same number.** Walk every band and every
boundary on the screen. A **band** conforms when every unit on it answers the same question
about the same subject. A **boundary** between two blocks conforms when it carries
**exactly one** grouping cue ([N6](#n6-one-cue-per-boundary-and-the-container-is-earned)).
Zero cues and two cues both fail, and they fail for the same reason: the eye is being told
nothing, or told twice.

**What the app scores today.** 53 screens measured across both front doors, mean **75.9**
(*fine*): 21 calm, 12 fine, 13 busy, 7 overwhelming. The agency app means 74.4 and the
portal 84.4. The full table, and the work that follows from it, live in
`.session-notes/ui-rearrangement-plan.md`.

---

### N1: at most four units on a band, six in a table row

The fifth fact moves to a second line, into the three-dot menu, or off the screen. It does
not get squeezed onto the end.

The worst bands in the app today, all counted off the source:

| Band | File | Units |
|---|---|---|
| The language switcher | `shared/web/language-section.tsx:72` | **29** |
| Meetings, `?view=all` table | `web/components/meetings-screen.tsx:72` | 9 columns |
| A work-log row | `web/components/time-panel.tsx` | 8 |
| A process step row | `web/components/process-detail.tsx` | 8 |
| A sprint overview row | `web/components/sprints-screen.tsx` | 7 |
| A story's work-log row | `web/components/story-detail.tsx:214` | 7 |
| A process version row | `web/components/process-detail.tsx:287` | 7 |
| The portal's `StepLine` | `web-portal/components/impact-screen.tsx:72` | 7 |

The fix is never a smaller font. It is
[K1](#k1-a-collection-row-is-a-title-plus-one-meta-line-and-nothing-else): a title and one
meta line, and the meta line is three facts. Everything else is on the record, one click
away, and the click is cheaper than the crowd.

### N2: at most three blocks before the primary content

Count from the top of the content region to the first row of the thing the screen is
named after. A collection's primary content is its rows; a record's is the first field of
its open tab.

The standard collection screen stacks **CollectionHeading, PagedFind, action row,
CollectionCard**, which is V=3 and passes. Every screen that fails does so by inserting
something between the heading and the rows:

- **Tickets** puts a TriageStrip, an outer tab strip and an inner tab strip in there
  (`web/components/tickets-collection.tsx:148-193`). V=6.
- **Sprints** adds a state heading and a kind label above the first row
  (`web/components/sprints-screen.tsx:212`). V=5.
- **Processes** puts the whole ImpactPanel, an accordion three levels deep, above the list
  (`web/components/processes-screen.tsx:67`). V=4.
- **Knowledge base** puts the ask box above the list
  (`web/components/deep-link/collection-content.tsx:461`). V=4.

The rule is not "delete them". It is: **a block that is not the primary content, and not
required to filter it, goes below the primary content.** The person came for the list.

### N3: at most twenty-five units above the fold

This is the rule that says scrolling is free. The owner asked for screens where "users are
more than happy to scroll", and the way to earn that is to make the top of the screen
worth arriving at, not to fit more into it.

`G = 3 + 2(V−1) + T + min(5, rows) × H`. Because `T` (the tabs) is in there, a nine-tab
record detail spends nine of its twenty-five before it has said anything. Account detail
has 8 tabs, App detail has 9. See [N10](#n10-the-control-follows-the-option-count) for
what to do about that.

### N4: every band answers one question

This is the "twisted" rule, and it is the one that does not show up in a count.

A band fails when its units are co-located rather than related. Two live examples:

- **Dropdown values** (`web/components/selectable-screen.tsx:115`) puts a filter bar that
  says "Showing X of Y" on the same band as a search box and a status Select. The count is
  a *result*, the search and the select are *causes*. Three units, one band, two different
  questions.
- **Internal rates** (`web/components/internal-rate-card.tsx:138`) puts the label, the
  rate, "Used when unnamed", "Retired", Edit and Retire on one row: two facts, two states
  and two actions, in one left-to-right sweep.

The repair is always the same shape: split the band by the question it answers. Facts on
one line, state as a badge at the end of that line, actions in the trailing slot or the
menu. Never facts and actions interleaved.

### N5: the surface step is measured, not assumed

**The rule.** Two surfaces read as separate only when their perceptual lightness differs
by **ΔL\* ≥ 8**. A hairline reads as a line only when it differs from **both** surfaces it
divides by **ΔL\* ≥ 4**.

**Why this rule exists.** The owner reported that "the dark mode looks much better than
light mode because the contrast between UI elements is much clearer on dark mode". That is
not a preference, it is arithmetic, and here it is. Measured in a browser against the
tokens the deployed app actually resolves (`shared/brand.ts` overrides `--background`,
`--primary` and `--secondary`; the rest come from `shared/ui/styles.css`):

| Boundary | Light ΔL\* | Dark ΔL\* | Dark advantage |
|---|---|---|---|
| page to card | **3.22** | **10.32** | 3.2× |
| card to hairline | 4.98 | 11.31 | 2.3× |
| page to hairline | 8.20 | 13.51 | 1.6× |

Light: page `oklch(0.99 0.004 95)` = L\* 98.89, card `#f7f2ea` = L\* 95.67, contrast
1.084:1. Dark: page `oklch(0.2 0.004 80)` = L\* 7.28, card `#2c2b2a` = L\* 17.60, contrast
1.280:1.

**What follows from it.** In dark mode the fill step alone (10.32) groups a card, so the
card is legible with no border at all. In light mode the fill step (3.22) is below the
threshold, so **a filled card with no border is invisible in light mode** and the eye gets
no grouping cue from it whatsoever. That is the mechanical reason the same screen feels
tidier in dark: dark mode is doing grouping work that light mode is not.

**AMENDS [C2](#c2-cards-have-no-border-no-shadow-and-no-hover-animation).** C2 said a card
has no border, on the evidence of a runtime census of kwapso.com. That evidence stands for
kwapso.com, which puts four cards on a page inside enormous whitespace. It does not
transfer to a screen holding twelve blocks. **A card keeps `border`; it still keeps `no
shadow` and `hover-lift-none`.** One drawn cue, never two, and the fill is a surface
rather than a drawn cue. If a future theme raises the light page-to-card step past ΔL\* 8,
the border comes off and this amendment is deleted.

**Never hard-code a colour.** Every colour resolves through a token
([C10](#c10-there-is-one-ink-stepped-by-opacity-not-a-grey-ramp)). Two live breaches, both
cheap:

- `web/components/import-screen.tsx` uses `amber-500`, `amber-600`, `emerald-600` and
  `emerald-500` at lines 309, 310, 423, 425, 482, 484. **11 class occurrences, one file,
  the only file in either front door that touches a banned Tailwind ramp.** They mean
  warning and success, and both are tokens already: `text-warning` and `text-success`.
- `shared/departments.ts:33-37` hard-codes `#F4C600`, `#6738E8`, `#B1E847`, `#f584e3` and
  `#C497FE`. Five colours, none of them in kwapso's seven. A department is a mark, so it
  belongs on `--chart-1` to `--chart-5`
  ([C6](#c6-sky-forest-and-poppy-are-marks-not-backgrounds)).

The rest of the hex literals in the repo are legitimate and stay: `shared/brand.ts` is the
branding seam by design, `shared/workers/email-template.ts` is email (no CSS variable
survives an email client), `shared/web/pwa.ts` and `shared/web/splash.ts` are OS-level
theme colours, and `shared/web/google-sign-in.tsx` is Google's own mark.

### N6: one cue per boundary, and the container is earned

**Three cues, and a boundary gets exactly one.**

| Cue | Qualifies when | Written as |
|---|---|---|
| whitespace | ≥24px and nothing else in the gap | `gap-6` |
| a hairline | ΔL\* ≥ 4 from both surfaces ([N5](#n5-the-surface-step-is-measured-not-assumed)) | `border` / `border-t` / `divide-y` |
| a filled surface | it is a container, and it carries the hairline as one unit | `bg-card rounded-xl border p-4` |

Whitespace plus a container is **one** cue, because the container is the boundary. Two
containers with a border between them is two, and that is over-separation.

**When a block gets a container at all.** This is the rule that removes the most clutter,
and it is countable:

> A block earns a container when it holds a **collection of two or more rows** or a **form
> of two or more fields**. Nothing else does.

A heading, a paragraph, a single stat, a single action, a callout, an audit footer: bare on
the page, separated by `gap-6`. Today the app draws **130 border classes across 58 files**,
plus 6 `divide-y`. The heaviest are `web/components/import-screen.tsx` (9),
`web/components/process-detail.tsx` (8), `web-portal/components/impact-screen.tsx` (7),
`web/components/app-shell.tsx` (6) and `web/components/internal-rate-card.tsx` (5).
Import's review phase draws a bordered card per step inside a bordered plan inside a
bordered screen, and that is the twisted feeling arriving as geometry.

`<Separator>` is used **zero** times and stays that way: a separator inside a block is a
hairline, and a separator between blocks is `gap-6`. `shadow-*` is used **once**
(`web/components/agent-host.tsx:45`), on the floating assistant button, which is the one
thing on screen that genuinely hovers. No other shadow ships.

### N7: five gaps, and each one means something

**AMENDS [S1](#s1-the-vertical-rhythm-is-4-8-16-24-40),** which named the scale
(4, 8, 16, 24, 40) and then in its own next line used `gap-3` for a row. This is the
version with the meanings attached, and it is the one to implement:

| Class | px | Means |
|---|---|---|
| `gap-1` | 4 | parts of one thing: an icon and its label, a value and its unit |
| `gap-2` | 8 | siblings inside one group: fields in a field group, chips in a row, the buttons of one action group |
| `gap-4` | 16 | rows inside one block: list rows, the mark and the title column of a header band |
| `gap-6` | 24 | **between blocks. This is the gap that says "these are separate."** |
| `gap-10` | 40 | between page sections that each carry their own heading, on a screen with three or more of them |

**Nothing between them, and nothing outside them.** The census says the app does not obey
this today. Of **516 gap classes**: `gap-2` 153, `gap-1.5` **125**, `gap-3` **85**,
`gap-4` 57, `gap-1` 34, and `gap-6` only **11**. So 210 of 516 gaps (40.7%) are off-scale,
and the one gap that means "these are separate" is used eleven times in the whole app.

That single number is the mechanical explanation for "too much in one go". The app is
built almost entirely out of 6px and 12px gaps, which is the spacing of *parts of one
thing*. Everything therefore looks like it belongs to everything else, so the eye has
nowhere to rest and no way to tell where one idea ends and the next begins.

The conversion is mechanical: `gap-1.5` becomes `gap-1` inside a control and `gap-2`
between controls; `gap-3` becomes `gap-2` inside a group and `gap-4` between rows; `gap-5`
and `gap-8` become `gap-6`. `space-y-*` is used twice
(`web/components/install-prompt.tsx:114,128`) and both become `gap-*` on a flex column.

### N8: one width, one set of gutters, and no screen sets its own

**The full horizontal span rule, settled.** The owner named the inconsistency exactly:
*"on many pages, like work logs, tasks, or meetings, we are using a lot of the horizontal
space with minimal padding from the sidebar and the right side of the screen, which is
good. I just don't know why it's not applied to other places."*

Here is why. Work logs, tasks and meetings render through `DeepLinkScreen`, whose one
container is `mx-auto flex w-full max-w-[1600px] flex-col gap-6`
(`web/components/deep-link-screen.tsx:336`). At 1440 that is 1120px of content in 1120px
of available room, **S = 100%**. Six screens do not go through it and cap themselves
instead:

| Screen | File | Cap | S at 1440 |
|---|---|---|---|
| Home | `web/components/screens/home-screen.tsx:32` | `max-w-2xl` (672) | 60% |
| Settings | `web/components/screens/settings-screen.tsx:89` | `max-w-2xl` | 60% |
| Profile | `web/components/screens/profile-screen.tsx:58` | `max-w-2xl` | 60% |
| Invitations | `web/components/screens/invitations-screen.tsx:13` | `max-w-2xl` | 60% |
| Kwapso | `web/components/screens/kwapso-screen.tsx:65` | `max-w-3xl` (768) | 69% |
| The shell's own loading skeleton | `web/components/app-shell.tsx:489` | `max-w-2xl` | 60% |

The last one is worth its own sentence: the skeleton is 672px wide and the content that
replaces it is 1120px, so **every cold load of the agency app visibly snaps sideways.**

**The rule.** `max-w-[1600px]` lives in exactly one place and no screen sets a width. The
gutters are `px-4 sm:px-6 lg:px-10` and live in exactly one place
([S2](#s2-horizontal-gutters-are-px-4-smpx-6-lgpx-10)), which is also the brand site's own
40px margin. Padding inside is
[S3](#s3-card-padding-is-p-4-panel-padding-is-p-6): card `p-4`, panel `p-6`, dialog through
`FormShell`, and nothing else.

The `max-w-*` values that survive this rule, and the only ones: `max-w-[1600px]` (the one
page container), `max-w-3xl` (the portal's own cap,
[L5](#l5-the-portal-keeps-its-own-narrower-cap-and-larger-type)), `max-w-sm` and
`max-w-md` (door cards and dialogs), and `max-w-[85%]` (a chat bubble). Everything else
goes.

**Prose is capped, the page is not** ([L2](#l2-prose-is-capped-the-page-is-not)). A wide
page does not mean a 1120px line of text: a paragraph inside it still wears its own
measure. Width is for tables, lists and columns, not for sentences.

### N9: two radii, one fill, no shadow

**AMENDS [T7](#t7-the-radius-vocabulary-is-two-values-and-the-class-you-write-is-rounded-xl)**
with the census. Every Tailwind radius step from `sm` to `3xl` resolves to the same 24px in
this theme (`styles.css`: "no component can accidentally drift onto an in-between size"),
so the vocabulary is about the source and not the pixels. Today: `rounded-xl` 58,
**`rounded-lg` 48**, `rounded-full` 8, `rounded-md` 5, `rounded-2xl` 2, `rounded-t-2xl` 1,
`rounded-sm` 1, `rounded-none` 1.

**57 of 125 radius classes are off-vocabulary, and changing every one of them is a visual
no-op**, because they all already compute to 24px. That makes it the cheapest rule in this
document to enforce and the easiest to check.

Write `rounded-xl` for a rectangular surface and `rounded-full` for a pill. Nothing else.

### N10: the control follows the option count

One decision rule for dropdown against pills against tabs against radio. Read the two
questions in order.

**Question one: does the control change the VIEW, or set a VALUE?**

**Question two: how many options, and are they mutually exclusive?**

| Options | Mutually exclusive | Changes the view | Sets a value |
|---|---|---|---|
| 2 to 6 | yes | **tabs** (`TabsView`, [R3](#r3-no-hand-rolled-toggles)) | **chips** ([F7](#f7-a-short-enumerated-choice-is-a-row-of-chips-not-a-select)), or **radio** when each option needs a sentence of explanation |
| 7 or more | yes | **a dropdown** that reads as a view switch, with the current view on the trigger | **a `Select`** |
| any | no | **a filter facet** in the collection toolbar ([K7](#k7-the-collection-toolbar-is-one-row-heading-search-filter-add)) | **checkboxes**, up to 5, all visible; a multi-select popover above that |

**And one measurable override that beats both questions: a row of chips or pills that
wraps to a second line at 1440px is a dropdown.** Wrapping is the control telling you it
has outgrown its shape.

**This rule predicts the live case.** `shared/web/language-section.tsx:72` renders one
`Button` per entry in `LANGUAGES`, and `shared/i18n.ts:71-104` holds **29** of them. It
sets a value, the options are mutually exclusive, there are 29, and they wrap to roughly
six rows inside the 672px Profile column. Both tests say **dropdown**, and it is the single
worst band in either front door (H=29, against a budget of 4).

**The objection in that file's own header comment is real, and the rule answers it.** It
says a dropdown "makes somebody who cannot read the current language hunt for the control
that fixes that". That is true of a dropdown showing a language *code*. So the language
switcher carries a named exception: **its trigger shows the flag and the language's own
name for itself, never a code, and the menu is searchable.** Someone who reads no English
still sees the flag and Deutsch on the trigger, and finds their own name in the list. The
portal already does exactly this (`shared/web/language-menu.tsx`), so this is the two front
doors agreeing rather than a new pattern.

Three more controls meet the same test today, and two of them take the same answer:

- `shared/web/scale-section.tsx:84` renders 3 buttons. **Three is chips. It passes, leave
  it alone.** ([S4](#s4-the-scale-setting-is-three-steps-and-it-sets-one-css-variable))
- `web/components/time-panel.tsx:117` renders one button per assigned story, unbounded.
  Past six it is a dropdown.
- `web/components/tickets-collection.tsx:168-178` builds an inner strip of
  `4 + N ticket types`, so it crosses six the moment a team defines three types. The tab
  strip stops at six and the rest becomes a filter facet, which is what it always was:
  ticket type is a *filter*, not a *view*.

### N11: a glyph on every destination and every collection heading

**EXTENDS UI-CONVENTIONS.md §5 and [G1](#g1-a-record-type-carries-a-glyph).** The owner
wants marks on the main screens, the nav and the collections, not only on detail screens.
Here is what is achievable today without touching the library, and what is not.

**Achievable now:**

- The nav rail already resolves its glyph from `CONCEPT_ICON` in `web/lib/pages.ts:262`.
  Every destination has one; keep it that way, and add the concept there before the screen.
- A tab strip already takes an icon per tab: `TabsView` is given `icon` on every team
  section (`web/components/team-section-nav.tsx:42-59`), and
  [R3](#r3-no-hand-rolled-toggles) is written around "icon + count badge". Any strip that
  is missing icons can have them today.
- A **collection heading** may carry its concept glyph beside the title.
  `CollectionHeading` is the host's own component
  (`web/components/collection-heading.tsx`), so this is a host change.
- A **group heading** inside a collection may carry the type mark: the sprints overview
  already does it (`web/components/sprints-screen.tsx`), and so does the header band
  (`TypeMark` in `web/components/record-chrome.tsx`).
- Any **host-composed** row may carry a mark, because the library `List` has the slot:
  `item.leading` (`registry/collections/list/list.tsx:19,94`). Home and Settings use it
  today.

**Not achievable, and do not work around it:** a **recipe-driven** collection row cannot
carry one. `ScreenRenderer.renderList` maps a row to `{ id, title, subtitle }` and passes
no `leading` (logged as **UI-GAPS #16**). That is every ticket, story and account list plus
the Sprints "All" tab. The only host-side workaround would be to put the glyph inside the
title string, and a pictograph inside a sentence is the one shape §5 refuses. **So the mark
is simply absent there and the word carries the meaning on its own**, until the library
ships the one-line fix.

### N12: what to do when a screen is over budget, in order

Do these in order and stop when the screen passes. The order is by load removed per unit of
risk.

1. **Widen it.** If S < 0.9, delete the screen's own `max-w-*` ([N8](#n8-one-width-one-set-of-gutters-and-no-screen-sets-its-own)). Zero behaviour change, and on an admin screen it is usually the whole fix.
2. **Split the busiest band.** If H > 4, move facts past the third onto the record and states into a badge at the end of the line ([N1](#n1-at-most-four-units-on-a-band-six-in-a-table-row), [K1](#k1-a-collection-row-is-a-title-plus-one-meta-line-and-nothing-else)).
3. **Move the actions.** Everything past one primary and one secondary goes into the three-dot menu ([B1](#b1-two-visible-actions-maximum-on-any-title), [B2](#b2-the-three-dot-menu)). Never remove the confirm when you move a destructive action.
4. **Push the non-primary blocks below the primary content.** If V > 3, the block that is not the list and not a filter on the list goes under the list ([N2](#n2-at-most-three-blocks-before-the-primary-content)).
5. **Take away containers.** Any block that is not a collection of two or more rows, or a form of two or more fields, loses its border ([N6](#n6-one-cue-per-boundary-and-the-container-is-earned)).
6. **Fix the gaps.** Off-scale gaps to the five values, and `gap-6` between blocks ([N7](#n7-five-gaps-and-each-one-means-something)).
7. **Collapse the control.** Seven or more options, or a wrapping row, becomes a dropdown ([N10](#n10-the-control-follows-the-option-count)).

Only after all seven does anything get deleted. Nothing in this section asks for a feature
to be removed, and none of it needs a library change.

---

## What the old app did better

Four things Glide got right that this app currently gets wrong. Each is the reason a
whole section above exists.

### 1. It hid the actions people rarely take

`A-4.05.52`: a story detail with one visible button, "In progress", and a three-dot menu
holding Blocked, Edit, Archive and Delete. `A-3.57.42`: a meeting detail with nothing but
a three-dot. `P-4.10.05`: a portal app detail with exactly "Open App" and "New Ticket".

Here, `web/components/help-detail.tsx:418-539` puts Translate, Answer, Reply by email,
Make it a story, Edit, Archive, Move up and Move down on the same screen region, and the
codebase contains no overflow menu at all. The old app made the primary action obvious by
removing its competitors. See [B1](#b1-two-visible-actions-maximum-on-any-title) and
[B2](#b2-the-three-dot-menu).

### 2. It kept context while you scrolled

`A-4.00.19` compared with `A-4.00.30` and `A-4.00.37`: the header band scrolls away and
the tab strip pins to the top of the viewport, badges intact, so you always know which
record and which tab you are in. Nothing in this app is sticky below the shell chrome,
so scrolling a long ticket loses the title, the tabs and the record entirely. See
[D3](#d3-the-header-and-tabs-stick).

### 3. It put almost nothing in a collection row

`A-3.58.53`: contact rows are a name and a company. `P-4.10.05`: ticket rows are a title
and "Created on 6 August 2026 · Paras Maroo". `A-4.00.11`: sprint rows are a name and a
date range. When more facts were genuinely needed it switched to a table with column
headers (`A-4.05.42`) rather than cramming them into a subtitle.

Here, `web/components/deep-link/shape.ts:128-138` builds a ticket subtitle out of four
facts and prefixes the reference into the title as well; `stories-screen.tsx:48-59` uses
five. The result is a wall of text with no shape. See
[K1](#k1-a-collection-row-is-a-title-plus-one-meta-line-and-nothing-else) and
[K2](#k2-a-table-is-for-scanning-a-list-is-for-reading).

### 4. It used the whole screen

`A-4.06.36`, `A-4.05.42`, `A-4.08.47`: content runs edge to edge with a gutter of roughly
45px and no width cap, so a table of nine stories shows five columns without truncating
any of them. This app caps every module screen at 768px
(`web/components/deep-link-screen.tsx:330`), so the same table would truncate at column
two while 138px of empty page sits on either side, and over 700px on a large display. See
[L1](#l1-one-page-container-one-cap).

### Honourable mention: the one form said "Submit"

`P-4.10.31` and `P-4.10.36`. One word, with Cancel beside it, in a bar pinned to the
bottom of a scrolling sheet. This app has 31 different words for the same act. See
[F1](#f1-every-submit-button-says-submit) and [F2](#f2-the-dialog-is-a-three-row-grid-and-never-spills).

---

## Do not do

1. **Do not change a component in `shared/ui/` to satisfy a rule in this document.**
   Not because you can't — the library was vendored into this repo on 2026-08-22 and it
   is ours to edit — but because this is a *rearrangement* rule book, and every rule in
   it is implementable from `web/`, `web-portal/` and `shared/` without touching a
   component. If you reach a rule you cannot express that way, stop: either the rule is
   wrong or it belongs in the reskin's own work, and UI-CONVENTIONS.md §1 is where a
   real component change gets decided. **And never edit UPSTREAM** (`swift-struck-ui`),
   which other Swift Struck products still depend on — nothing here is ever pushed,
   PR'd or synced back to it.
2. **Do not re-implement a library primitive locally** because a prop is missing. Eleven
   library components ship unused already (`Title`, `Headline`, `Text`, `Hint`,
   `Container`, `Spacer`, `Clamp`, `ActionRow`, `RecordDetail`, `DetailView`,
   `CollectionFrame` directly). Check whether the thing you want exists before you build
   it.
3. **Do not invent a prop.** `tone`, `level`, `as` and `size` on anything other than
   `Button` and `Spacer` do not exist. `variant` exists only on `Button`, `Badge`,
   `Title` and the tabs family, and `Button`'s six values are not `Badge`'s six values.
   `surface: "card" | "none"` exists on exactly five components: `List`, `DataTable`,
   `ActivityFeed`, `DescriptionList`, `RecordDetail`.
4. **Do not add a third surface colour.** Two paper tones, `--background` and `--card`,
   and that is the system ([C1](#c1-the-page-is-off-beige-the-card-is-soft-paper-and-that-is-the-whole-surface-system)).
   Likewise do not add a fifth grey, and never reach for Tailwind's `neutral`, `gray`,
   `zinc`, `stone` or `slate` scales: none of them is in this palette
   ([C10](#c10-there-is-one-ink-stepped-by-opacity-not-a-grey-ramp)).
5. **Do not replace a card's border with a shadow.** Flat fill plus one hairline, and
   nothing else. (This item said "do not put a border on a card" until
   [N5](#n5-the-surface-step-is-measured-not-assumed) measured the light theme's
   page-to-card step at ΔL\* 3.22 and found the borderless card invisible there. The
   no-shadow half is unchanged and is not negotiable.)
6. **Do not make a content surface translucent.** The ambient field belongs behind the
   header band, nowhere else ([C3](#c3-the-ambient-field-never-sits-behind-a-content-surface)).
7. **Do not animate a card.** No hover lift, no scale, no shadow transition, no colour
   transition. `hover-lift-none` exists for this.
8. **Do not hand-roll a tab strip or a toggle.** R3 is machine-checked and the check hunts
   `variant={x === y ? … : …}`.
9. **Do not bypass `FormShell`.** R4 is machine-checked. [F2](#f2-the-dialog-is-a-three-row-grid-and-never-spills)
   changes `FormShell` itself, which keeps every call site compliant for free.
10. **Do not write emoji into a component** until UI-CONVENTIONS.md §5 has been amended.
    See [G1](#g1-a-record-type-carries-a-glyph).
11. **Do not write an em dash into a user-visible string.**
12. **Do not add a per-screen width.** One container, one cap
    ([L1](#l1-one-page-container-one-cap)). The four different `max-w-*` values in `web/`
    today are the problem this replaces.
13. **Do not give a component a size prop for the scale setting.** One root font size,
    everything in `rem` ([S4](#s4-the-scale-setting-is-three-steps-and-it-sets-one-css-variable)).
14. **Do not remove a confirm step** when you move a destructive action into the three-dot
    menu.
15. **Do not change the portal's cap or type size to match the agency app.** The
    divergence is deliberate ([L5](#l5-the-portal-keeps-its-own-narrower-cap-and-larger-type)).

---

## Conflicts to settle before building

Five rules here cross something already written down. The first three need the owner's
ruling before they are implemented. The last two are settled, and the row says how.

| Rule | What it crosses | Proposed resolution |
|---|---|---|
| [G1](#g1-a-record-type-carries-a-glyph), [G2](#g2-the-mapping-if-option-1-is-taken) | UI-CONVENTIONS.md §5, "**No emoji.** Anywhere." | Amend §5 to "no emoji in copy" and add the type mark to §4, or fall back to lucide glyphs. Law changes first, code second. |
| [C3](#c3-the-ambient-field-never-sits-behind-a-content-surface) | UI-CONVENTIONS.md §7, "Surfaces that float over it … use the frosted `.glass`" | **SETTLED 2026-08-19 IN THE LIBRARY, not by an override.** The premise here was wrong twice: the library's comment said the opposite, and the proposed `[data-slot="dialog-content"]` selector matches nothing — `data-slot` appears zero times in the installed registry. Every floating surface is opaque at v0.13.0 and a census enforces it; a card keeps `.glass` on purpose. |
| [F3](#f3-the-separator-becomes-the-action-bars-top-edge) | `shared/web/form-shell.tsx:43-53`, an 11-line comment defending `pt-6` as "the ONE value that governs it everywhere" | The comment documents the exact bug being fixed. Replace the value with a structure that cannot have the bug, and replace the comment with one sentence saying so. |
| [N5](#n5-the-surface-step-is-measured-not-assumed) | [C2](#c2-cards-have-no-border-no-shadow-and-no-hover-animation) and "Do not do" #5, both of which said a card has no border | **SETTLED 18 Aug 2026 by measurement, not by preference.** The light theme's page-to-card step is ΔL\* 3.22, below the threshold at which two flat surfaces read as separate; the dark theme's is 10.32. A borderless card is therefore invisible in light mode, which is exactly the difference the owner reported between the two themes. The card keeps its hairline; the no-shadow rule is untouched. Delete this row and restore C2 the day a theme change raises the light step past ΔL\* 8. |
| [N10](#n10-the-control-follows-the-option-count) | `shared/web/language-section.tsx:5-11`, whose header comment argues AGAINST a dropdown | The comment's objection is about a dropdown showing a language CODE, and it is right about that. N10 answers it with a named exception rather than by overruling it: the trigger shows the flag and the language's own name for itself, and the menu is searchable. The portal already ships that control. |

One more, not a conflict but worth a decision: [T1](#t1-one-heading-scale-per-front-door)
moves 26 headings from `font-semibold` to `font-medium` because the brand ships no 600
weight. If the owner prefers the heavier look, the answer is a third font face in the
library, not a synthesised weight in the host.

---

## Rule index

**95 rules.**

| Section | Rules |
|---|---|
| 1. Colour and surface | C1 to C11 (11) |
| 2. Page layout and width | L1 to L7 (7) |
| 3. Detail screens | D1 to D10 (10) |
| 4. Collections | K1 to K9 (9) |
| 5. Buttons and actions | B1 to B9 (9) |
| 6. Forms and dialogs | F1 to F9 (9) |
| 7. Typography | T1 to T7 (7) |
| 8. Spacing and the scale setting | S1 to S6 (6) |
| 9. Mobile | M1 to M6 (6) |
| 10. Copy | W1 to W5 (5) |
| 11. Record type glyphs | G1 to G4 (4) |
| 12. Density: the glance budget | N1 to N12 (12) |

### The seven files that carry most of it

The original seven, which round one of the feedback (`b1615a7`, 17 Aug 2026) has since
implemented. Kept as the record of what landed and where:

| File | Rules | What changed |
|---|---|---|
| `shared/web/library-overrides.css` | C3, C11 | The `.glass` override deleted outright. Killed the pink and the drift. **Done.** |
| `web/components/deep-link/screen-bits.tsx` | C2, B3, S3 | `CollectionCard` flattened; the add button became an icon. **Done.** |
| `web/components/deep-link-screen.tsx` | L1 | One line: `max-w-3xl` became `max-w-[1600px]`. **Done.** |
| `web/components/app-shell.tsx` | L1, S2, T2 | Gutters and the 11px tab labels. **Done.** |
| `shared/web/form-shell.tsx` | F1, F2, F3 | The three-row grid, the pinned action bar, "Submit". **Done.** |
| `web/components/help-detail.tsx` | B1, B2, L7, T5 | Six buttons became one plus a menu; the title became an `<h1>`. **Done**, via the new `web/components/record-chrome.tsx`. |
| `web/components/deep-link/shape.tsx` | K1, W1, W2 | Subtitles dropped to three facts. **Done.** |

### The seven files that carry the density round

Section 12's turn. If you implement nothing else from it, these seven edits deliver the
majority of the change. Every one is ordered, with its exact diff, in
`.session-notes/ui-rearrangement-plan.md`.

| File | Rules | What changes |
|---|---|---|
| `web/components/screens/*.tsx` (5 files) + `app-shell.tsx:489` | N8 | Delete six `max-w-2xl` / `max-w-3xl` caps. Six screens go from 60% span to 100%, and the cold-load width jump stops. |
| `shared/web/language-section.tsx` | N1, N10 | 29 pills become one dropdown showing the flag and the native name. Removes the single worst band in either front door. |
| `web/components/time-panel.tsx` | N1, N4 | The 8-fact work-log row becomes a title plus a three-fact meta line. |
| `web/components/process-detail.tsx` | N1, N4, N6 | The 8-fact step row, and three nested bordered containers, become one. |
| `web/components/meetings-screen.tsx` | N1 | The 9-column all-view table drops to six columns. |
| `web/components/tickets-collection.tsx` | N2, N10 | Six blocks before the first ticket become three; the derived type strip becomes a facet. |
| `web/components/import-screen.tsx` | N5, N6 | The only file in either app using a banned Tailwind ramp, and the heaviest border user (9). |
