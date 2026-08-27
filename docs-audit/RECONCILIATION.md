# The rule reconciliation — the app's UI rules against the kit's law-book

**Deliverable 2 of the design-audit lane. Nothing has been deleted or changed.**

The ruling this table serves is recorded in [RULING.md](RULING.md): *"Kwapso's UI/UX
rules have the final authority."*

## What I read

The whole kit law-book, 3,378 lines:

| file | lines |
|---|---|
| `shared/ui/docs/RULES.md` | 905 |
| `shared/ui/docs/BUILD-A-COMPONENT.md` | 949 |
| `shared/ui/docs/TOKENS.md` | 874 |
| `shared/ui/docs/BUILD-A-SCREEN.md` | 378 |
| `shared/ui/docs/ARTIFACT-MAP.md` | 272 |

Plus `shared/ui/components/PATTERN.md` (479), which BUILD-A-COMPONENT.md names as the
document that **wins over itself**: *"Where the two could ever be read as disagreeing,
`PATTERN.md` wins — it is what a reviewer holds you to."* A reconciliation that skipped it
would be reconciling against the second-strongest source.

Kit tag `v1.2.0`, sha `54c409c7`, synced 2026-08-27.

**`GAPS.md` does not ship with the kit.** The five documents cite it about ninety times as
the place a reasoning lives. Every one of those citations is unreadable here. Where the
kit's stated rule depends on a GAPS entry, I have taken the rule and noted that its
argument is not checkable in this repo. That is an upstream ask, listed in §7.

## The prior attempt, and why this is not a duplicate

`LAW-RECONCILIATION.md` (146 lines, in the tree already) did this against **two** of the
five documents — `RULES.md` and `BUILD-A-SCREEN.md`. It never opened TOKENS.md,
BUILD-A-COMPONENT.md, ARTIFACT-MAP.md or PATTERN.md.

Its headline — *"Fourteen of our seventeen UI laws have no kit counterpart at all"* — does
not survive reading the other three. Two examples it could not have found:

- It says **R29 has no kit counterpart** because there is "no kit rule on page containers".
  TOKENS.md §14 declares three, and `components/container/container.tsx` states the law in
  its own header: *"Three measures, and they are named, not chosen … **A fourth width
  would be a value this repository invented.**"*
- It says **R3 folds into R39**. ARTIFACT-MAP.md row 27.13 and `tabs.tsx` carry a whole tab
  *vocabulary* — which strip is a folder, which is a line, and where the second level goes
  — that neither R3 nor R39 has ever expressed.

It is also stale in one place: its lead item, "R31 → the kit's spelling", **has since
landed** (commit `ca2f8238`). Its §1 describes a state of the tree that no longer exists.

Nothing below inherits a verdict from it. Every row was re-derived.

## How each rule is classified

- **(a) same thing said twice** — the kit says it too. Ours is redundant as *law*, though it
  may still earn its place as the *enforcement* (the kit ships no test runner for this app).
- **(b) narrower and still useful** — the kit is silent or general; ours adds a
  this-app-specific constraint that does not contradict. Keeps.
- **(c) contradicting the kit** — ours says something the kit says differently. Ours is
  **wrong** under the ruling.

---

# 1 · The Laws of the Base — 18 in the UI family

17 carry `dimension: "ui"` in `shared/rules/registry.ts`; R37 carries `arch` but the brief
names it, so it is judged here too.

| Law | What ours says | What the kit says about the same subject | Verdict |
|---|---|---|---|
| **R2** record detail = Overview + Activity | every record detail exposes two named tabs via `TabsView` + `ActivityFeed` | ARTIFACT-MAP 27.8 → `RecordChrome`; ch22 → `ActivityFeed`. The kit ships the *shape* and names no required tab set. | **(b)** product structure the kit has no view on. But see R2′ below — the kit rules the *variant* ours never mentions. |
| **R3** no hand-rolled toggles | collection tab strips use `TabsView`, never a hand-rolled button toggle | Same sentence, generalised, as R39. The kit adds what ours lacks: `line` \| `folder` and when each applies. | **(a)** for the ban; **incomplete** for the vocabulary. |
| **R4** every form through `FormShell` | one title/subtitle · separator · fields · separator · actions | ARTIFACT-MAP 27.2/27.3/27.35 → `compositions/templates/form-screen.tsx`; `components/form/`; ch09's one form breakpoint is 48rem, "one column below, two above, never three". | **(b)** — but ours specifies a **separator** layout the kit forbids (§6.1, "No CSS `border`. Ever."). See F3 below. |
| **R6** one glossary | product terms live in one file, one definition each | §9.5 forbids product vocabulary *inside a primitive*. The kit has no dictionary of ours and must not acquire one. | **(b)** — complementary. The kit's rule is what makes ours possible. |
| **R7** forms persist drafts | `useFormDraft` per session | Silent. Behaviour, not design. | **(b)** |
| **R8** every tab carries its count | count on both tab surfaces, derived | ch14: *"counts are quiet, never badges"* — already honoured in `tabs-view.tsx`. The kit has no view on *which* tabs must carry one. | **(b)** |
| **R16** count exactly once | server `COUNT(*)`, one `formatCount` seam, tab badge wins | ch27.21, quoted in `collection-screen.tsx`: *"Zeros are shown, not hidden."* Ours renders zero as **nothing**; §5.4/PATTERN §4 also say a badge with no count renders `null`. | **(b)**, with a **kit-internal conflict** — see §7. |
| **R25** savings caption | a saving never renders without its caption | Silent. Close to a legal claim. | **(b)** |
| **R28** catalogued strings | the catalogue is exactly what the app says | §7.1 is about *components* holding strings. Ours is about an *app* translating them. | **(b)** — the kit's rule is the precondition for ours. |
| **R29** one page width | agency `max-w-[1600px]`, portal `max-w-3xl` (768) | TOKENS §14 + `container.tsx`: three measures — **1240 / 1200 / 960** — and *"A fourth width would be a value this repository invented."* `Container` has **0 call sites**. | **(c)** — and the one that needs the owner. See §6. |
| **R31** two radii | `rounded-[var(--radius)]`, `rounded-pill`, `rounded-select` | §4.1/§4.2 — identical, including the `rounded-select` exception and the import-order reason. | **(a)** — ours was rewritten to the kit's spelling on 2026-08-27. Now a faithful restatement plus the check the kit lacks. |
| **R32** closed palette | no ramp, no hex, everything through a token | §2.2 — *"No hex, `rgb()`, `hsl()` or named colour in a `.tsx` file. Ever."* | **(a)**, and ours is **stricter** (also bans Tailwind ramps) and is the only one with a machine check. |
| **R33** wrapped strings | every extracted position sits inside `t(...)` | Silent — app infrastructure. | **(b)** |
| **R34** glossary in copy | screens speak the glossary's words | Silent, by §9.5's design. | **(b)** |
| **R35** records carry their face | every record shows its picture or a deliberate mark; three sizes | Ruling 30: *square for a thing, pill for a person, at **24 / 32 / 48**, `flex: none`, two initials never three.* `--avatar-sm/md/lg`. | **(c)** — now verified. `shared/web/record-mark.tsx:125-127` is `row: size-9` (36), `tile: size-12` (48), `band: size-14 sm:size-[72px]` (56 → 72). One of three is on the ladder; `size-[72px]` is also a px literal. |
| **R37** in-app anchors | an in-app link is `<InAppLink>`, never a bare `<a href="/t/…">` | Silent. A soft-navigation concern, not a design one. | **(b)** |
| **R38** details ask the door | a detail reads its record by id | Silent — correctness, not design. | **(b)** |
| **R39** kit supplies the UI | no file in `web/`, `web-portal/`, `shared/web/` imports a UI package | §9.3, the closed dependency list, is the kit's own version of this pointed inward. Ours points it outward at the app. | **(a)** in spirit, **(b)** in reach — ours governs a surface the kit's rule does not. |

**One law the kit has and we do not — R2′.** Client ruling E, 2026-08-22, verbatim in
`collection-screen.tsx`: *"folder tabs are for main screens, line tabs for detail
screens."* ch27.13: *"folder tabs belong to collections and main screens only."*
`tabs.tsx`: *"The folder tab cuts a collection into subsets. The underline tab cuts a
record — or Settings — into sub-views."*

The app **has** internalised this (`tabs-view.tsx` defaults to `folder`, and
`rules.test.ts:2714-2798` enforces a reason on every `line`), but it is nowhere in
RULES.md or the registry — it lives only in a component comment and a test. Under the
ruling that is the right substance in the wrong place.

---

# 2 · UI-RULEBOOK.md — 95 named rules

## 2.1 · The contradictions (c) — 38 of 95

Each of these says something the kit says differently. Ours is wrong.

| Rule | Ours | The kit | Why ours loses |
|---|---|---|---|
| **C1** | *"Two surfaces only… **There is no third tone**, no tinted panel."* Names `bg-card` as `#f7f2ea`. | Eight surface tokens. §2.6: a card takes **the other paper tone from the band it sits in**. `--card` is `#FFFEF9`; `#F7F2EB` is `--surface-panel`. | C1 forbids the third tone the kit's whole card rule **requires**, and swaps the two names. This is the root of Finding 1. |
| **C2/N5** | the card **keeps its border**; `shadow-none` stands | `Card` default `bg-surface-panel`, `raised` = `bg-card shadow-sm`. `hairline` is an opt-in prop for **one** case: two cards of the *same* tone adjacent. | Same defect diagnosed (contrast 1.000 in light — the kit calls it CRD-7), two different fixes. The kit's is the paper tone; ours is a stroke the kit reserves. |
| **C3/C4/D2** | the ambient field is translucent and must be scoped away from cards | The kit **ships `components/ambient-background/`**: two neutral washes (`--accent`, `--hair-faint`), `aria-hidden`, `pointer-events-none`, no parallax, no scroll listener. | Ours is a workaround for a translucency the kit's own component does not have. |
| **C6** | sky/forest/poppy *"never fill a section, a row or a card"*; `--success` is `#1f9259` | `bg-success` / `bg-destructive` are **bridged fill utilities**; a destructive button is charcoal **on poppy**. `--kw-forest` was lightened to `#20955B` because charcoal on `#1F9259` measured 4.44:1, under AA. | C6 forbids fills the kit mandates, contradicts its own C7 two lines later, and quotes the **pre-correction** hex. |
| **C8** | a warning band is amber, `--warning` = `#e8b244`, `bg-warning/10` | *"**There is no amber in the kwapso palette.**"* `--warning: var(--surface-quiet)`. And §2.2: an alpha on a token is a rejection. | Wrong colour, a hex literal (R32), and an opacity used as a fill. |
| **C10** | *"one ink, stepped by **opacity**"*, `text-foreground/30`; hexes `#6b6965`, `#e8e4dc` | Four **solid** ink tokens. §2.3: an alpha of a token is *"a colour the palette does not contain… whatever falls out of compositing"*. Kit values are `#5f5d59`, `rgba(26,25,24,.08)`. | The mechanism is the exact one §2.3 rejects, and the three hexes are the old library's. |
| **C11** | *"200ms, one easing curve"*, `cubic-bezier(.645,.045,.355,1)` | **Seven** non-looping durations, **four** curves, and *"That is why there are four and not one."* That bezier appears nowhere in the kit. | One curve cannot express entrance vs. dismissal vs. move. §6.1: a component adds one `motion-*` class and writes no duration. |
| **D1** | a detail screen has **four** regions | `RecordChrome` (27.8): band, hero, facts strip, panel, **footer** — five. | Different decomposition of the same screen. |
| **D4/D10/T1/T3** | eyebrow = `text-xs font-medium tracking-[0.5px] uppercase` | `text-micro` — 11px, `0.08em`, weight 500 — *"UPPERCASE eyebrows **only**"*, one class sets all three. | Ours hand-rolls a step the kit ships, and `tracking-[0.5px]` is a **px literal** (§1.1). |
| **D7/F9/G3/N6** | `rounded-xl`, `rounded-t-3xl`, `rounded-xl` | §4.2 — those spellings are rejections. | Stale: R31 fixed the code on 2026-08-27; these documents were not updated with it. |
| **F3/K5/N6** | `border-t`, `divide-y divide-[--border]`, `bg-card rounded-xl border p-4` | BUILD-A-SCREEN §6.1: *"**No CSS `border`. Ever.** Separation is a fill or an inset shadow, never a stroke."* Names four survivors as defects. | Direct. But see §7 — the kit disagrees with itself here. |
| **B2/B5/F7** | `<Button variant="outline">` | §2.7: *"`variant="outline"` does not exist on `Button` and never will."* Kit Button variants: `default, secondary, destructive, text, ghost, link, inverse, cancel`. | The variant does not exist. **The code is already clean** (0 uses on `Button`); the three documents still teach it. |
| **F7** | a short choice is a hand-rolled row of pills | ch10 ships **`Choice`**. | The kit ships the control. |
| **S1/N7** | rhythm 4, 8, 16, 24, **40** (`gap-10`) | 4, 8, 12, 16, 20, 24, **32, 48**, 64, 96, 128. Above 32 the ladders diverge. | **40 is on neither ladder.** `gap-10` is Tailwind 40, and `--space-8` is 48. |
| **S2** | gutters `px-4 sm:px-6 lg:px-10` (16/24/40) | `Container`: `px-5 sm:px-8 lg:px-[var(--space-8)]` (20/32/48). | All three steps differ, and 40 is off-scale. |
| **S4/S5** | a three-step scale setting writing an inline `style.fontSize`; steps 15/16/18 agency, 16/17/19 portal | `data-scale` on `<html>`: 13 / 15 / 17. `tokens.css` header: *"The two apps deliberately sit on different steps — **this file forces neither, each app sets data-scale on `<html>` itself**."* | Four of the app's six values (16, 18, 19) are off the kit's ladder — **and the justification cites a sentence the kit never wrote.** See §4. |
| **T2** | *"`--text-xs` is 14px and that is the floor"*; never `text-[11px]` | `--text-xs: 0.75rem` (**12px**). `--text-micro: 0.6875rem` (**11px**) is a legitimate step for eyebrows. | Wrong value and wrong floor. The app no longer overrides the token, so the stated 14px is not true anywhere. |
| **T1** | `<h1>` = `text-2xl font-medium tracking-tight` | Each of the 14 steps carries its **own** tracking; `text-2xl` is already `-0.014em`. | `tracking-tight` overrides the kit's tracking with Tailwind's `-0.025em`. 32 sites. |
| **L2** | prose caps at `max-w-[72ch]` | `--measure-body`. | A fifth measure. (The kit is itself inconsistent here — §7.) |
| **W2** | the empty placeholder is an en dash *"or, better, nothing at all"* | *"**Never invent a dash or a zero to fill the hole.**"* | The kit rules flatly for the option W2 lists second. |
| **G1/G2/G3** | record types carry **emoji** pictographs, named by codepoint; `text-3xl`, `size-[72px]` | 1,383 icons; *"nothing else supplies an icon"* (R39). Our own CLAUDE.md voice rule: **no emoji**. | Contradicts the kit, R39, and our own voice rule. `size-[72px]` is a px literal. |
| **N9** | *"two radii, one fill, **no shadow**"*, `rounded-xl` / `rounded-full` | `Card variant="raised"` = `bg-card **shadow-sm**`, and `--shadow-rest` exists for exactly this. | "No shadow" removes the kit's raised card. Spellings stale. |
| **N10** | 2–6 exclusive options that change the view → **tabs** | ch27.13: the **sub-tab picker is a level-3 control inside the toolbar**, beside the view switcher and sort. | Routes a within-collection filter to a tab strip where the kit routes it to the toolbar. This is the /tickets defect, stated as a rule. |
| **M3** | the tab strip scrolls horizontally | BUILD-A-SCREEN §5: *"nothing in this kit scrolls a strip sideways"* — said of a **figure** strip. | **Flagged, not concluded.** The kit's sentence is about figures. Whether `Tabs` has its own overflow answer is in the census list. |

**All 38, so the count can be checked:** C1 C2 C3 C4 C6 C8 C10 C11 · L1 L2 L5 · D1 D2 D4
D7 D10 · K5 · F3 F7 F9 · T1 T2 T3 T7 · S1 S2 S4 S5 · M3 · W2 · G1 G2 G3 · N5 N6 N7 N9 N10.

Two of the 38 are contradictions in **prescription only**, and their reasoning is sound and
worth keeping:

- **N5** — the *method* (measure ΔL\*, never assume two surfaces read as separate) is the
  kit's own method, stated in almost the same words: *"found by looking at a rendered page,
  not by reading a file."* Only its conclusion — the card keeps its border — is (c).
- **N7** — attaching a *meaning* to each gap step is good and the kit does not do it. Only
  the 40 in the ladder is (c).

Nine of the 38 are **stale spellings, not disagreements**: D7, F9, G3, N9, T7 and parts of
N6 teach `rounded-xl` / `rounded-full` / `rounded-t-3xl`, which R31 retired from the *code*
on 2026-08-27. The documents were not updated with it. These are the cheapest to close and
carry no risk.

## 2.2 · The narrower-and-useful (b) — 49 of 95

Kept. The kit is silent or general and ours adds a this-app constraint that does not fight it.

**Layout and structure (10)** — L3, L4, L6, L7, D3, D5, D6, D8, D9 · and K1, K2, K3, K6, K7, K9 (6) for collections.
**Actions and forms (13)** — B1, B2, B4, B5, B6, B8, B9 · F1, F2, F4, F5, F6, F8.
**Type and copy (10)** — T4, T5, T6 · W1, W3, W4, W5 · C9 · S3, S6.
**Mobile (5)** — M1, M2, M4, M5, M6.
**Density, the glance budget (6)** — N1, N2, N3, N4, N11, N12.

**B2 and B5 are split, and the split is the point.** Their *substance* is (b) — "everything
beyond two actions goes in a three-dot menu", "a full-width secondary action inside a
panel" — and the kit has no view on either. Their *code samples* both write
`<Button variant="outline">`, which is (c): the variant does not exist. The rules keep;
the two snippets are wrong.

Two worth a note:

- **S6** (44px touch floor) sits inside a gap the kit *declares*: TOKENS §12 records the
  40/44 tension and says *"Unruled — `GAPS.md` BTN-4."* A decision inside a declared gap is
  the right shape. **But** ours enforces it with a global CSS rule on `button`, `a[role]`
  and `[role="tab"]`, which overrides the kit's own control heights everywhere at once.
  That mechanism is worth a look even though the decision is sound.
- **F1** ("every submit button says Submit") is app copy, which the kit leaves alone —
  but it lands on R34's territory, not the kit's.
## 2.3 · Same thing said twice (a) — 8 of 95

C5, C7, B3, B7, K4, K8, G4, N8.

| | ours | the kit's own words |
|---|---|---|
| **C5** | mango is a fill, never a border or a gradient; charcoal on it | §2.5 + ruling 26, and `--primary-foreground` is already charcoal |
| **C7** | status is a `Badge`, never a row tint | ruling 26 — the dot names the state, the label says it in words |
| **B3** | the add button is a plus glyph with no text | *"Create is always the glyph, never the word"* |
| **B7** | a view switch is a labelled pill, not a plus | the kit ships `ViewSwitch` — *"a paper caret pill, not a segmented control"* |
| **K4** | the tab badge carries the count, the heading stands down | ch14's quiet counts, already honoured in `tabs-view.tsx` |
| **K8** | an icon-only filter until a filter is active | the kit ships `FilterBar` |
| **G4** | a glyph never carries meaning on its own | ruling 26's dot-plus-label pairing |
| **N8** | one width, one set of gutters, no screen sets its own | `container.tsx` says exactly this — only the **value** differs, which is why R29/L1/L5 are (c) and N8's *principle* is (a) |

The pattern: our rule reached the kit's conclusion and wrote the *old library's* spelling
for it. **B3** is the cleanest example — "the add button is a plus glyph with no text,
everywhere" is `collection-screen.tsx`'s *"Create is always the glyph, never the word"*,
word for word, arrived at independently.

---

# 3 · UI-CONVENTIONS.md and CLAUDE.md

The rulebook is the big surface, but two other documents state UI law and both are named
by the ruling.

## 3.1 · UI-CONVENTIONS.md

| § | What it says | The kit | Verdict |
|---|---|---|---|
| **1** the library is lego, never re-implement it in the host | one name, `shared/ui/`; a primitive that needs changing changes upstream | §0's one-sentence test, and §10.3 *"Pin a tag. A version that is not tagged here does not exist."* | **(a)** — this is the kit's own governing sentence, restated for the app. |
| **2** recipe vs bespoke | engine-expressible → a recipe; else a host-composed component | BUILD-A-SCREEN §1.2: *"is the thing I am missing a new kind of object, or an arrangement of objects that exist? An arrangement is a screen."* | **(a)** — same decision, different words. |
| **3** restates R2/R3/R4/R6/R7/R8 | — | see §1 above | inherits those verdicts |
| **4** the action-icon mapping | Pencil / Power / UserMinus / Ban / Plus / Upload / Download / Mail | the kit draws 1,383 glyphs and names no action mapping. R39 makes it the only source. | **(b)** — a vocabulary the kit has no view on. Worth keeping. |
| **4** icon size `size-3.5` inline, `size-4` on create/import | 14px and 16px | six delivery sizes — **16 / 20 / 22 / 24 / 28 / 32** — and `--icon-button` → `--icon-16`, *"the glyph inside a button"*. | **(c)** — 14 is a seventh size. `size-3.5` appears **195** times, `size-4` **88**: two sizes for one job, and the kit names one. |
| **4** two code samples | `<Button variant="outline" size="sm">` | the variant does not exist | **(c)** — the code is already clean; the document still teaches it. |
| **4** destructive = red + confirm | `text-destructive` + an `AlertDialog` | *"A destructive button is charcoal on poppy"* — `variant="destructive"` is a **fill**, not red text. | **(c)** in spelling, **(a)** in intent. The confirm half the kit has no view on. |
| **4** action rows wrap, never clip | `flex flex-wrap justify-end gap-2` | silent — responsive composition | **(b)**, and earned by a real bug. |
| **4** mobile is not desktop-shrunk (LOCKED) | stack by default, `sm:flex-row` | BUILD-A-SCREEN §5 — every screen states its 380 behaviour in words, and *"'Unchanged' is a claim to be checked, not a default to be written."* | **(a)** in principle; the kit asks for it **per screen, in the header**, which we do not do. |
| **5** voice: no emoji | — | silent on app copy | **(b)** — and it **contradicts our own G1/G2/G3**, which propose emoji record glyphs. |
| **6** collections boxed as one unit; data-driven filters | one `Card` around the collection | `CollectionFrame` / `CollectionScreen` fix heading → figures → tabs → toolbar → body, and *"The order is not the call site's."* | **(b)** where it agrees, but the kit owns the region order and we do not restate it. |
| **7** the living background; immovable contentless pages | `<AmbientBackground />` mounted once, translucency scoped away | the kit **ships** `components/ambient-background/` | **(c)** — see C3. |
| **9** density | points at UI-RULEBOOK §12 | silent | **(b)** |
| **—** one mark, one placeholder | three sizes, `row`/`tile`/`band` | ruling 30's 24/32/48 | **(c)** — see R35. |

## 3.2 · CLAUDE.md, the build-style bullets

Two of the UI bullets are law-shaped and both are already covered above:

- *"Action buttons carry an icon (from `@shared/ui/icons` … ~`size-3.5`, before the label)"*
  — **(c)** on the size, for the reason in §3.1. The `@shared/ui/icons`-and-nothing-else
  half is **(a)**, and is R39.
- *"Voice: warm, plain, sentence case, no jargon, no emoji."* — **(b)**, and it is the
  clause G1/G2/G3 break.

One bullet is worth keeping exactly as it is, because it is the thing that stops this lane
from over-reaching: *"Five of those share a NAME with a kit part and none of them
duplicates one … Before proposing to fold one into its namesake, read both signatures: the
names collide and the jobs do not."* That is correct and I have not touched them.

---

# 4 · The finding that is not a matter of taste

`shared/scale.ts` heads its own section:

> `── THIS CONTROL SUPERSEDES THE DESIGN KIT'S, AND THE KIT SAYS SO ──`
>
> *"This one does, **on the kit's own instruction**. `tokens.css` names its standing law
> in its header: **"CLAUDE.md — overrides the kit where the two disagree"**."*

**That sentence is not in the kit.**

```
grep -rn "CLAUDE.md"        shared/ui/   → 0 hits
grep -rn "overrides the kit" shared/ui/  → 0 hits
```

No version of `tokens.css` in this repo's history of `shared/ui/` contains it either
(checked across the last 15 commits touching that tree, both the pre- and post-restructure
paths).

What `tokens.css` **does** say, convention 2 of four:

> *"REM BASE IS 16, ROOT RENDERS AT 15. … `data-scale` moves it to 13/15/17. **The two
> apps deliberately sit on different steps — this file forces neither, each app sets
> data-scale on `<html>` itself.**"*

So the kit already accommodates the exact divergence `scale.ts` argues it cannot express.
`scale.ts`'s case — *"ruling 18 gives both doors the same default … A single number cannot
say that"* — is made against a claim the kit does not make.

This matters beyond one file. It is the thing the kit's §11.1 exists to prevent:

> *"A logged gap is fine. **A guess that looks like law is not.** A derived value that
> looks stated gets built on, and by the time it is found wrong it has twelve dependents."*

`scale.ts`'s second argument is separately **true** and worth keeping: an inline
`style.fontSize` on `<html>` does beat any `:root[data-scale=…]` rule. That is a real
mechanical fact about which control wins. It is an argument about *precedence*, not about
*authority*, and it does not need a fabricated citation to stand up.

**I am not proposing to rip the scale control out.** It is wired to a database column, a
settings panel and a portal menu. What I am reporting is that its stated authority is not
real, so the ruling now decides it on the merits rather than on the kit's supposed
blessing — and the merits are: six values, four of them (16, 18, 19) off the kit's
13/15/17 ladder.

---

# 5 · The second finding: the app ships CSS written from prose

Kit §10.1 states the Tailwind wiring as part of the contract, and PATTERN §10 and
BUILD-A-COMPONENT §11.5 both repeat it:

```css
@import "tailwindcss" source(none);
@source "…";
```

> *"Tailwind v4's automatic source detection scans markdown. `PATTERN.md` §9 and this file
> both quote real forbidden class names … so with automatic detection on, every one of them
> gets compiled into the bundle and **a reviewer grepping the output finds exactly the thing
> the list forbids**."*

Both front doors write it bare — `web/app/globals.css:1` and `web-portal/app/globals.css:1`
are `@import "tailwindcss";`. Automatic detection is on.

**Measured, not inferred.** A class string that occurs **zero** times anywhere in this repo
— `skew-y-12` — written into a markdown file at the repo root, compiles into
`web/app/globals.css`'s output:

```
.skew-y-12   IN BUNDLE
```

Remove the file, and it is gone. So every class name in every `.md` file here — and
UI-RULEBOOK.md alone is 1,879 lines of them — is CSS in the shipped bundle of both doors.

**The sharpest instance.** `rounded-t-2xl` appears in exactly two files, `UI-RULEBOOK.md`
and `RESKIN-REPORT.md`, and in **no line of code anywhere**. It is in the bundle. The app
ships a rule for a radius spelling that exists only in the documents explaining why it was
banned — which is, word for word, the failure the kit predicted.

**The size of it.** Rebuilding with `source(none)` and two `@source` lines:

| | bytes |
|---|---|
| as shipped today | 207,871 |
| with `source(none)` | 201,402 |
| **written from prose** | **6,469** (~3%) |

**I am not fixing this in this lane, and the reason is specific.** My trial scoping still
emitted `rounded-md` and `rounded-2xl`, which I cannot yet account for — so I do not have
the correct `@source` set, and a wrong one does not fail loudly. It strips utility classes
from a working app. That is the shape of change that needs its own pass with a
before/after class diff, not a one-line edit at the end of an audit.

**One disclosure about this document.** `docs-audit/RECONCILIATION.md` quotes class names
too, and under the current wiring it therefore adds a few rules to the bundle itself. That
is a pre-existing condition it joins rather than creates, and it is named here rather than
worked around, because the kit's §11.1 asks for exactly that.

**A methodology note, because it nearly went in as a fact.** My first probe of this
"confirmed" markdown scanning using `rounded-t-2xl` and `bg-warning/10` as canaries. Both
already appear in root markdown, so the probe proved nothing — it was reading the existing
condition and calling it the experiment. My second probe then reported the two builds as
byte-identical, which was a caching artifact: both ran in one process against the same
`from:` path, so the second returned the first's cached result. Only the third probe — a
unique, well-formed class, in a fresh process — is the one the finding stands on.

---

# 6 · The one that needs the owner

**R29 / L1 / N8 — the page width.** The kit is unambiguous:

> *"Three measures, and they are named, not chosen … **A fourth width would be a value
> this repository invented.**"* — `container.tsx`, THE LAW THIS FILE OBEYS

1240 / 1200 / 960. The agency app uses **1600**. The portal uses **768**. Both are
inventions under that sentence.

**But the 1600 is the owner's own instruction**, recorded verbatim in N8:

> *"on many pages, like work logs, tasks, or meetings, we are using a lot of the horizontal
> space with minimal padding from the sidebar and the right side of the screen, which is
> good. I just don't know why it's not applied to other places."*

So the kit's authority and the owner's stated preference point opposite ways. That is a
ruling, not a fix, and I have not touched it.

**There is an in-rule way to give him what he asked for, and it is one line.** `Container`
ships a fourth *variant* that is not a fourth *width*:

```
full: "max-w-none"    /* a full-bleed band that still wants the gutters */
```

`<Container size="full">` is edge-to-edge with the kit's own gutters (20 → 32 → 48). That
delivers "use the horizontal space" without inventing a measure — and it is closer to what
he described than 1600 is, because 1600 still caps.

The three options, so he can pick rather than adjudicate:

1. **`Container size="full"`** — his words honoured, no invented width, kit gutters. My recommendation.
2. **`Container size="app"` (1240)** — strict obedience; narrower than today on a laptop, and against his stated preference.
3. **Keep 1600 as a logged, reasoned exception** — honest, but it is the "guess that looks like law" shape the kit warns about unless it is written down as a deviation.

The portal's 768 is a separate question with the same shape, and its shell is different —
it is on the looked-at list, not decided here.

---

# 7 · Where the kit disagrees with itself — upstream asks, not our decisions

Under the kit's own §11.1, a contradiction is quoted to the controlling session rather than
resolved locally. Four:

1. **Borders on table rows.** BUILD-A-SCREEN §6.1: *"No CSS `border`. Ever."* and names
   `list`, `calendar-view`, `activity-feed`, `checklist` as defects for having them.
   TOKENS.md §4: `--border` is for *"Fields, selection controls, same-tone card separation,
   **table rows**."* Both are the kit. Our K5/N6 sit exactly on the seam.
2. **`--measure-body`.** TOKENS.md says *"The kit's prose says 68 and the kit's CSS says
   62/66. **62 taken**."* The shipped CSS reads `--measure-body: 66ch` (line 666). The doc
   and the file it documents disagree.
3. **Zeros.** `collection-screen.tsx` quotes ch27.21: *"**Zeros are shown, not hidden.** A
   blank strip looks broken."* §5.4 and PATTERN §4: *"A badge with no positive count renders
   `null`."* Our R16 renders nothing, following the second. Which is right depends on
   whether a zero is a *count on a strip* or a *badge*, and the kit does not say.
4. **Stale folder names.** BUILD-A-SCREEN.md §1 still tables `controls/` (66) and
   `structures/` (40) as separate tiers; they merged into one `components/` on 2026-08-26,
   as ARTIFACT-MAP.md and BUILD-A-COMPONENT.md §1.2 both record. Same document, two ages.

Plus the one that is not a contradiction but a hole: **`GAPS.md` does not ship.** ~90
citations across the five documents point at a file the consuming app cannot read.

---

# 8 · The worked example: /tickets, answered from the kit

The owner found two tab strips stacked on `/tickets` and called them *"two vocabularies for
one idea"*. The brief asked what BUILD-A-SCREEN.md says about a second level of tabs, and
whether the answer is "make them match" or "the second level is a different control".

**It is the second, and the kit says so in one line.** `collection-screen.tsx`, quoting
chapter 27.13:

> *Sort is not one of ch19's four toolbar slots. It sits where the view switcher sits,
> which **ch27.13 already rules is the home of "the view switcher and the sub-tab picker" —
> level-3 controls inside the toolbar**.*

And the region order, ch27.1 verbatim:

> *"Figures, folder tabs, then the collection panel — toolbar, rows, pager inside it. A
> collection may drop the figure strip; it may not reorder what remains, and filters never
> sit above the tabs."*

**One** tab level in the region order. The second level is a **picker in the toolbar**.

## What the app actually does

Both strips are `variant: "line"` — `web/components/tickets-collection.tsx:163` and `:182`:

| strip | app | kit |
|---|---|---|
| All tickets / Archived | `line` | **folder** — it cuts a collection into subsets on a main screen |
| Ready / Extra / Issue / … / Triage | `line` | not a strip at all — the **sub-tab picker**, in the toolbar |

So the owner saw two things that look different because one carries icons and counts and
the other carries emoji marks and counts — but under the kit **neither is drawn correctly**,
and they are wrong in *different* ways. Matching them would have made a structural mistake
look intentional, which is exactly what the planner warned about.

The app's own reasoning for the inner strip is sound and is written down:

> *"A LINE, not the folder. This strip filters WITHIN the collection the outer folder
> already chose, and a folder tab is drawn to sit attached to a card — there is no second
> card under this one to attach to."*

That observation is correct. The kit's answer to it is: **then it is not a tab.** A control
with no card to attach to belongs in the toolbar, which is where ch27.13 puts it.

## The credit the app is owed

`shared/web/screen-engine/tabs-view.tsx` already defaults to `folder`, already deletes the
`pill` variant on the kit's ruling, already renders counts as quiet text because *"ch14:
counts are quiet, never badges"*, and `web/test/rules.test.ts:2714-2798` already fails a
`line` strip that carries no reason. The vocabulary is 80% landed. What is missing is that
the rule lives in a component comment and a test rather than in RULES.md, and that
`outerTabs` takes `line` without a stated reason.

## Disposition

**Report, do not fix.** Moving the inner strip into the toolbar changes what the screen
*is* — my brief reserves that. The outer strip's `line` → `folder` is a one-word change
and is a candidate for the fix pass, but it is load-bearing enough on a screen the owner
is looking at that I would rather it went in the same decision as the inner one.

---

# 9 · What this changes about the rest of the lane

The reconciliation decided four things about the censuses that follow:

1. **The tab vocabulary is checkable off the disk** — folder vs line vs toolbar-picker,
   against a screen's own kind (main vs detail). That census is now written from the kit's
   rule rather than ours.
2. **"What does the kit ship that the app never imports?"** is confirmed as the highest-yield
   census, and it has already returned three before the sweep even ran: `Container`
   (0 call sites, and the answer to §6), `ambient-background`, and `Choice`.
3. **Token-level censuses have a real target list** — off-ladder spacing (40), off-ladder
   type (`tracking-tight`, 32 sites), off-ladder icons (`size-3.5`, 195 sites, against a
   ladder of 16/20/22/24/28/32 where `--icon-button` is 16), and `--warning`'s amber.

---

4. **The build wiring is now on the list too** (§5), scoped as its own pass rather than a
   line at the end of this one.

## What I would put in front of the owner, and nothing else

He said he wants the broad things and does not want to babysit this. Three items actually
need him; everything else is either mine to fix or mine to scope.

1. **The page width** (§6). The kit says three measures and no fourth; he asked for the
   wide layout in his own words. `Container size="full"` gives him what he asked for
   without inventing a measure. One decision.
2. **The second tab level on /tickets** (§8). The kit's answer is that it is not a tab
   strip at all — it is the sub-tab picker and it lives in the toolbar. That changes what
   the screen is, so it is his call, not mine.
3. **The text-size control** (§4). Its claim to beat the kit rests on a sentence the kit
   never wrote. It is wired to a database column and two settings panels, so it is not a
   quiet revert.

The other 35 contradictions are mechanical and in-rule to fix: retired radius spellings in
prose, `text-micro` for eyebrows, `size-4` for button glyphs, the 40 step, the amber that
does not exist, an opacity where a token belongs.

---

*Every claim in this document is checkable against a file in this repo or a grep named in
it. Where I could not check something — `GAPS.md`'s reasoning, M3's tab overflow, the
correct `@source` set — it says so rather than guessing. One claim I made and then
withdrew is kept visible in §5, because the probe that produced it looked exactly like a
probe that works.*
