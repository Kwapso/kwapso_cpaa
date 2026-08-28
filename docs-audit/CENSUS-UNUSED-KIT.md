# Census 1 — what the kit ships that the app never imports

Derived off the disk: every folder under `shared/ui/components/` and every file under
`shared/ui/compositions/*/`, crossed against every `@shared/ui/…` specifier in `web/`,
`web-portal/` and `shared/web/`. Build artefacts excluded (`tsconfig.tsbuildinfo` names
every file in the tree and will fake a hit for anything).

| | |
|---|---|
| kit ships | **160** units |
| app imports | **56** |
| **never imported** | **104** |

**The headline is not the 104.** Most of it is honest: the kit draws a `map`, a `radar`, a
`signature`, a `gantt`, a `stopwatch` for products that need them and we do not. The
finding is narrower and worse.

---

## 1 · The whole composition layer is unused. All of it.

```
@shared/ui/compositions  →  0 imports, in every file of both front doors
```

That is **15 templates, 18 screens, 9 overlays and 5 states**. Every screen shape the kit
draws — `CollectionScreen`, `RecordChrome`, `FormScreen`, `MainScreen`, `ScreenShell`,
`StatStrip`, `SearchResults`, `ImportFlow` — and the app has built its own of nearly every
one.

This is the root cause of the /tickets defect rather than a separate finding.
`CollectionScreen` is the file that fixes the region order — *"the order is not the call
site's"* — and hard-codes `tabsVariant="folder"` because a collection is a main screen.
Nothing in the app imports it, so nothing enforces either.

## 2 · `RecordChrome` is built twice, and the kit's copy carries a client ruling ours has never seen

Not a name collision. Both files open by describing **the same four regions in the same
order**:

| | |
|---|---|
| kit | *"the four regions every record screen is made of: a transparent header band, a sticky tab strip, one opaque panel, and the audit footer. **Applies to 14 screens across the two apps.**"* |
| app | *"the four pieces every record detail wears… the header band, the tab strip, the tab panel, and the audit footer at the foot of the panel."* |

The kit's version carries **OVERRIDE 73, dated 2026-08-26** — the client, looking at
**our live `Tickets · Padelbase · 4182` page**, verbatim:

> *"notice how the chips are directly underneath the title… the edit button should be
> aligned with the title and the chips underneath it. also, **detail pages do not need this
> bar that you have on top where we have Padelbase and the number**. these are chips, so
> **the black chip is always the ID. we always use black chips for IDs**, and next to it,
> add a chip for Padelbase like in the example. of course, translate this to universal
> rules."*

The kit implemented it: `breadcrumb` and `breadcrumbLabel` were **removed from the API**,
the identity row moved from above the title to the line below it, and `actions` moved into
the title's own row.

**Our app still draws what he asked to have removed.** Verified:

- `web/components/app-shell.tsx:452` renders `<Breadcrumbs>` on record screens.
- `web/components/record-chrome.tsx:276-283` draws `eyebrow` **above** `<h1>`.

So a ruling the client gave on our own ticket page, one day ago, is sitting implemented in
a template we do not import. This is the most actionable thing in the audit and it is not
a matter of taste — it is his instruction, already translated into universal rules by the
people who own the rules.

It also confirms UI-RULEBOOK **D1** independently: D1 says four regions with a breadcrumb
bar first, and the client has since ruled the bar away.

## 3 · Two components the app hand-drew

| kit | app | verdict |
|---|---|---|
| `components/tiles` — collection view 20, *"one big tile per record, room-readable"*, a body swap for `CollectionFrame` | `web/components/app-tiles.tsx` — a logo square and two lines, for apps | **Same job.** Ours is a specialised instance of the kit's generic view; it should be a call site of `Tiles`, not a second implementation. |
| `components/container` — *"Three measures, and they are named, not chosen… a fourth width would be a value this repository invented"* | `max-w-[1600px]` / `max-w-3xl`, hand-written in two shells | **Same job.** Already ruled: the app moves to `Container size="full"`. |

`components/choice` is unused and F7 hand-rolls a row of outlined pills in its place — a
third instance, and its `variant="outline"` does not exist on `Button`.

## 4 · Cleared: name collides, job differs

The filename method that produced this list is the same one that, on 27 Aug, reported
"4,122 lines of shadowed kit code that does not exist." Each of these was checked by
reading **both signatures**, not both names:

| pair | why it is not a duplicate |
|---|---|
| `pulse-band` / `pulse.tsx` | The kit's is a 4×7 grid of **closed days**, a record-page block, `weeks`/`title`/`range`. Ours is big-number metrics and charts by group and time. Different shapes entirely — **a sixth entry for CLAUDE.md's list.** |
| `brand` / `brand-mark.tsx` | The kit's draws **kwapso's own** artwork, three lockups. Ours draws **the tenant's** logo or a monogram from `shared/brand.ts`, because this is a white-label base. Ours must stay; the kit's belongs anywhere kwapso's own mark appears. |
| `visibility`, `notes`, `screen-renderer`, `CollectionFrame` | Already cleared in CLAUDE.md, and re-confirmed. Different layer or different job in every case. |

## 5 · Two corrections to what I reported earlier

- **`ambient-background` is imported**, in both doors — `web/app/layout.tsx:3` and
  `web-portal/components/portal-shell.tsx:26`. I named it as a never-imported find and it
  is not one. What is stale is UI-CONVENTIONS §7 and rulebook C3, which instruct you to
  "remove the translucency" from a component that no longer has any — written against the
  old library. Still (c), but as a stale document rather than a hand-rolled duplicate.
- **The `rounded-t-2xl` example holds**, contrary to the correction relayed to me, and the
  suggested replacement is weaker. `rounded-t-2xl` lives in **markdown only** — UI-RULEBOOK
  and RESKIN-REPORT — and compiles as a real selector. `rounded-t-xl` lives in
  `shared/rules/registry.ts` and `web/test/rules.test.ts`, both **code files in scanned
  trees**, so it would ship under correct scoping too and proves nothing about markdown.
  The decisive proof remains the unique canary, and it is now self-demonstrating:
  `skew-y-12` occurs nowhere in this repo except `docs-audit/RECONCILIATION.md`, and it is
  in the bundle.

## Method note

The unit of the census is a **folder** under `components/` and a **file** under
`compositions/`, because that is how the kit is addressed (`@shared/ui/components/x/x`).
Specifiers are normalised to that unit, so importing one export of a component counts the
whole component as used — which makes the "never imported" number a **floor**, not a
ceiling. A component imported once and barely used still reads as used here.
