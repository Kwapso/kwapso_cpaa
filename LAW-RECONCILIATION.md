# Law reconciliation — the base's UI laws against the kit's rulebook

**Status: PROPOSAL. Nothing has been deleted.** The owner ruled on 2026-08-27
that the kit is canon ("the ui ux kit wins eveytime… feel free to override the
old laws with the new ones, and if any of the old laws cannot be replaced,
ensure that they still make sense with the new UI/UX kit. If they don't, remove
them"). This is the list that ruling asks for, to be read by the owner and by
the planning session before a line is cut.

Sources: `shared/rules/registry.ts` and `RULES.md` on our side;
`shared/ui/docs/RULES.md` (§1–§11) and `shared/ui/docs/BUILD-A-SCREEN.md` on the
kit's — readable in this repo for the first time as of the commit before this
one.

---

## The headline, and it is not what anyone expected

**Fourteen of our seventeen UI laws have no kit counterpart at all.** They are
not style rules the kit supersedes; they are product and correctness rules the
kit has no view on and should not acquire one. "Kit wins" therefore changes
almost nothing — which is the reassuring version of the answer.

**The three that DO collide are worth the whole exercise, and one of them is a
latent bug rather than a matter of taste.**

---

## 1 · The collision that matters: R31 vs kit §4.2

**Our R31 mandates the exact spelling the kit forbids.**

R31 says a rectangular surface is `rounded-xl` and a pill is `rounded-full`.
Kit §4.2 opens: *"Do not use `rounded-lg`, `rounded-xl`, `rounded-2xl`,
`rounded-md` or `rounded-sm` in a component."* It asks for
`rounded-[var(--radius)]` and `rounded-pill`.

Today the app writes `rounded-xl` **157 times**, `rounded-full` 23 times,
`rounded-t-xl` 4 times, and `rounded-[var(--radius)]` / `rounded-pill` zero
times. Our own check enforces the forbidden spelling.

**Substantively the two agree** — `rounded-xl` resolves to 24, the same value
`--radius` carries, because the kit's `tokens.css` re-points Tailwind's whole
radius ladder. So nothing looks wrong today, and nobody would file this.

**The kit's second reason is the load-bearing one, and it is a real fragility:**

> Those keys resolve correctly **only if `tokens.css` happens to load after
> Tailwind's theme.** Verified in the compiled bundle: Tailwind's own theme
> emits `--radius-lg: 0.5rem` and `tokens.css`'s `:root` emits
> `--radius-lg: 1.5rem`; the kwapso value wins by cascade order alone.

So all 157 corners are correct **by import order**, not by declaration. Anything
that reorders the imports in `globals.css` — a refactor, a Tailwind upgrade, a
new `@import` placed above the token file — silently turns every card corner
from 24px to 12px across both front doors, with no test failing anywhere.

**Proposal: rewrite R31 to the kit's spelling, keep our check.** The law's words
become the kit's (`rounded-[var(--radius)]`, `rounded-pill`, `rounded-select`);
the check stays ours, because the kit enforces nothing. ~184 call sites, purely
mechanical. **This is the one item I would do regardless of the canon ruling**,
because it closes a silent failure.

---

## 2 · R32 vs kit §2.2 — same rule, ours is the enforced one

Kit §2.2: *"No hex, `rgb()`, `hsl()` or named colour in a `.tsx` file. Ever."*
Ours: every colour resolves through a token, no Tailwind ramp, no hex.

Ours is **stricter** (it also bans Tailwind's colour ramps, which the kit does
not mention) and it is the only one of the two with a machine-check.

**Proposal: keep R32 as-is; replace its prose with a pointer to kit §2.2 plus
the one sentence the kit lacks (no Tailwind ramp).** Nothing to delete.

---

## 3 · R28 / R33 vs kit §7.1 — adjacent, not overlapping

Kit §7.1: *"Every user-facing string is a prop with a default."* That is a rule
about how a COMPONENT is built. R28 (the catalogue matches the code) and R33
(every extracted position asks for its translation) are about how an APP is
translated. They do not compete; the kit's rule is what makes ours possible.

**Proposal: keep both, and note the dependency in each.**

---

## 4 · The fourteen with no kit counterpart — keep, unchanged

| Law | What it is about | Why the kit has no view |
|---|---|---|
| R2 | record detail exposes Overview + Activity | product structure |
| R3 | collection tabs use the library TabsView | now a special case of R39 — see note |
| R4 | every form renders through FormShell | product structure |
| R6 | one glossary of product terms | the kit forbids product vocabulary in itself (§9.5) |
| R7 | form dialogs persist their draft | behaviour, not design |
| R8 | every tab carries its collection's count | product |
| R16 | a collection shows its count exactly once | product |
| R25 | a savings figure states what it is made of | product, and close to a legal claim |
| R28 | the translation catalogue matches the code | app infrastructure |
| R29 | the page has one width | no kit rule on page containers |
| R33 | every extracted position asks for translation | app infrastructure |
| R34 | the glossary is the dictionary the screens speak | product vocabulary |
| R35 | a record never appears without its face | product |
| R38 | a record detail reads by id, never from a page | correctness / data, not design |

**A note on R3.** It says "collection tab strips use the library `TabsView`, no
hand-rolled toggles" — which is now the specific case of R39's general sentence.
It could fold into R39 once the un-shadowing lands. **I am not proposing that
yet**, because R3's check also asserts the icon and count badge, which R39 does
not. Revisit after stage 4.

---

## 5 · Out of scope, stated explicitly

The planning session raised R21 (a client login reaching agency doors), R24 (an
internal cost figure reaching the client's side) and R26 (the vector fence) —
security invariants each earned by a live incident, and rightly protected from a
design kit's opinion.

**None of the three is in scope and none ever was.** All three carry
`dimension: "arch"`. This reconciliation touches only the seventeen laws marked
`dimension: "ui"`, and the list above is all of them. A design kit has no view on
who may read what, and nothing here proposes it acquire one.

**The general principle, for the next time this comes up:** the kit is canon on
SHAPE — radius, palette, spacing, motion, focus, icons. It is not an authority
on who may read what, on what a number means, or on what the product calls a
thing. Where a kit rule and a base law meet on a security or correctness
question, the base law wins and the kit is the side that needs amending.

---

## What I propose to do

1. **R31 → the kit's spelling**, ~184 call sites, and the check updated with it.
   Closes a silent failure. Would do this regardless.
2. **R32 prose → a pointer to kit §2.2**, plus our extra clause. Check unchanged.
3. **R28 / R33 → note the dependency on kit §7.1.** No behaviour change.
4. **Everything else: unchanged.** No law deleted.

**Nothing is deleted by this proposal.** The ruling permitted deletion; the
reading did not turn up a law that deserves it.
