# Merge note — this lane against lane/design-audit

`lane/design-audit` (design_audit_1) is the session that produced this lane's finding.
Its commit `d7a700cc` touches **35 files**, removing `tracking-tight` (32 sites) and
converting hand-rolled eyebrows to `text-micro` (16 sites).

**Exactly one file overlaps with this lane: `web/components/record-chrome.tsx`.**

That overlap is benign and the resolution is decided in advance: this lane replaces
the app's `record-chrome.tsx` with the kit's `RecordChrome`, so design-audit's
one-line `tracking-tight` removal inside it is moot. **Take this lane's version of
that file.**

The other 34 files must survive the merge unchanged — they are `tracking-tight` and
eyebrow fixes on screens this lane does not touch.

Both branches are off `main`. Neither has been merged.

---

## What this lane changed

**One root cause, two complaints.** The app imported none of `@shared/ui/compositions`.

| | before | after |
|---|---|---|
| `/tickets` outer strip | `variant: "line"` — the reason he saw folders on every section but this one | the folder, by **deleting** the override; `defaultTabsConfig` was already folder |
| record header | `eyebrow` above the title, breadcrumb bar on top | the kit's `RecordChrome`: no eyebrow, ID + collection as chips **below** the title, actions in the title's row, no crumb trail |

**`RecordScreen` is now an adapter, not a drawing.** It renders the kit's
`RecordChrome` and maps this app's twelve call sites onto it — the house pattern from
`screen-engine/tabs-view.tsx` ("keep the CONTRACT, render every pixel through the
kit"). `RecordHeader` and `RecordBody` are deleted, 156 lines.

**The tabs go in `panel`, not `tabs`.** `RecordDetail` draws its own strip only when
`tabs` is non-empty (record-detail.tsx:681, :761), so our `TabsView` in the panel
gives exactly one strip. Two strips on one screen is the defect this lane removes.

**A rot check fired and was right.** `motion-is-the-kits` pinned `record-chrome.tsx`
for a `transition-[height]` on the collapsing header, and its own reason ended
"Delete this pin the day the kit draws one." Deleting the hand-rolled collapse made
the pin describe nothing and the check went red before anybody read the diff. The pin
is gone and the list is empty.

## Two rules of ours that lost, as the reconciliation predicted

- **T1** ("agency `<h1>` is `text-2xl`"). The kit's record title is the `h2` step —
  `text-3xl` — for the system door, `text-2xl` only for the portal's calmer density.
  The title is visibly bigger and that is the kit's decision, not a regression.
- **D1/C4** (four regions, opaque paper below the tabs). `RecordBody` existed to stop
  the ambient field at the tab strip; the kit's `AmbientBackground` has no
  translucency to stop, so the rule described nothing.

## One open question answered against my own earlier note

The reconciliation flagged **M3** ("the tab strip scrolls sideways") as a possible
contradiction, because BUILD-A-SCREEN says "nothing in this kit scrolls a strip
sideways". `record-chrome.tsx:349` settles it: *"The strip scrolls rather than wraps,
which is `Tabs`' own behaviour."* The BUILD-A-SCREEN sentence is about a **figure**
strip. M3 is not a contradiction and should move out of that list.
