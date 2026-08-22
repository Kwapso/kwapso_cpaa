# The four kit gaps, decided 2026-08-22

**This is a repo copy of a decision made in the design kit.** The kit lives at
`~/Desktop/design-mothership` and is NOT version-controlled, so a re-download
would take these decisions with it. They are duplicated here because the reskin
in this repo was built on them: if one is overturned, this file is the list of
what has to move.

The kit's own copy is `GAPS.md` in that directory, and it is the one Aurora
reviews. This copy is a record, not a second authority — if the two ever
disagree, hers wins.

Summary: GAP-4 -> hairlines at 8%. GAP-8 -> body measure 62ch. GAP-9 -> a hover
moves the fill away from the page tone; the four values already in the kit stand.
GAP-10 -> the paper-tone flip is a context class, provisionally.

---

## The four decided on 2026-08-22, and why

Decided by the reskin session, **pending Aurora's review**. Each was taken from
the kit's own evidence rather than from taste, and the reasoning is written out
so overturning one is cheap.

### GAP-4 · Same-tone card separation is **8%** — `--hair`

Chapter 01 gives the job to 6%; chapter 02 gives it to 8%. The tie is broken by
what the kit BUILT rather than by what either chapter says:

- `.kw-card--hairline { border: 1px solid var(--hair); }` — the one component in the kit whose entire purpose is same-tone separation renders at **8%**.
- `--hair-faint` (the 6% token) is consumed **nowhere** in the kit. Not by a specimen, not by a pattern, not once. A weight with no consumer is not an assignment, it is a leftover.
- 8% is also already the fields-and-selection weight, and card separation and a field border are the same visual job at the same distance.

So this is not a new decision, it is reading the one the kit already made in
code. `--hair-faint` stays defined and unused; if 6% is later ruled correct, one
token reference changes.

### GAP-8 · Body measure is **62ch**

The three numbers are not equal claims. *"Never exceeds sixty-eight characters"*
is a **ceiling**; `62ch` and `66ch` are **values**. 62 is under 68, so it
contradicts nothing — it is the only one of the three that is consistent with all
three statements at once. It is also what `tokens.css` already ships and what the
kit most often renders.

Corroborating: the kit's other prose blocks are narrower still (`.kw-register__body`
at `40ch`, `.kw-errorpage__body` at `44ch`), so the system's instinct runs toward
tighter measures, not looser. Choosing 68 would have been the only choice that
moved every body block in the kit.

### GAP-9 · A hover moves the fill AWAY from the page tone — the four shipped values stand

The kit's light rule is *"hover darkens ~8%"*, and the note in the gap was right
that this is wrong on dark by construction. But the fix is not "lift on dark"
either, and the kit's own dark values show why: `--btn-inverse` in dark is
off-beige `#FFFEF9`, and its hover `#ECE8DF` **darkens**.

The rule both modes actually obey is one sentence: **a hover moves the fill away
from the page it sits on**, which is darker on a light fill and lighter on a dark
one, by roughly one step of the palette's own ladder. The unlit papers are built
as exactly such a ladder — `#141310` → `#1C1B18` → `#26241F` → `#2F2D28` — so the
step size is not invented either.

The four values `tokens.css` already ships all obey that sentence and are
therefore **adopted as law rather than replaced**:

| | fill | hover |
|---|---|---|
| `--btn-secondary` dark | `#3A3833` | `#454239` (lighter) |
| `--btn-cancel` dark | `#26241F` | `#322F29` (lighter) |
| `--btn-inverse` dark | `#FFFEF9` | `#ECE8DF` (darker — a light fill) |
| `--btn-destructive` dark | `#F2634B` | `#E05540` (darker — a light fill) |

The gap also asked for two things that turn out not to be missing:

- **A dark primary hover.** There is none because there should be none. Mango and sky are the two colours `semantic-map.md` says never change across modes, so mango's hover and pressed values do not change either. The file is already correct in leaving `--btn-primary-*` unoverridden.
- **A dark text/quiet button.** `.kw-btn--text` has no fill at all — its whole treatment is an underline in `--hair-strong` that goes to `--ink-primary` on hover. Both tokens already flip with the theme, so the dark definition exists and is inherited.

The `! GAP-9` markers come off those four values. The pressed state for the five
non-primary variants remains unspecified in both modes; that is a separate
absence and it is not invented here — the shared `translateY(1px)` still applies,
only the fill does not change.

### GAP-10 · The paper-tone flip is a **context class**, provisionally

This is the one that could not be left open, because leaving it open has a
visible cost rather than an abstract one. The kit's own law says *"a header band
and the buttons inside it are never the same paper tone, or filled buttons
disappear"* — so with no mechanism, a secondary button on a panel is a panel-tone
button on a panel, and it vanishes.

The kit has already built a candidate and rendered it:

```css
.kw-on-panel { --btn-secondary-fill: var(--surface-page);  --pill-fill: var(--surface-page); }
.kw-on-page  { --btn-secondary-fill: var(--surface-panel); --pill-fill: var(--surface-panel); }
```

**Adopted, because it invents nothing.** It is the kit's own code, it needs no
new token, and it degrades safely: a component that forgets to declare its tone
gets the default rather than a broken one. The alternatives were each a bigger
invention — `@container style()` is not broadly supported, and a React context
prop would put a design decision in a component API where CSS can hold it.

`--sheetFlip` / `--cardFlip` stay defined and unreferenced. They are the start of
a different mechanism, and until somebody explains what they were for, adopting
them would be guessing at an intent rather than reading one.

**Still flagged.** This is the kit's own word "provisional", carried forward
honestly. It changes how every container is written, so if Aurora rules a
different mechanism the cost is real — but it is a cost paid in one stylesheet
and a handful of container components, not in the token layer.

---
