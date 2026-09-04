# Follow-up: give the portal its toolbar, and stop R48 passing on an empty room

Paste into the session that ran the portal sweep — it already has the worktree and the
context. The owner ruled on 4 Sep 2026: **add search to the portal AND widen the rule.**

## Re-sync first — main has moved

    cd ../kwapso-portal-sweep
    git fetch origin && git checkout -b fix/portal-toolbar origin/main && npm install

Three lanes merged since your sweep: the knowledge-base fixes (#19), your own report (#20)
and the screen builder (#21). Main is `7e9256de`, gate green at **4,001 tests**.

## What you found, and what was decided

Your report: the portal tickets list has 45 rows and growing, no search, no filter, and
R48 is silent there. That is now the ruling's target.

**Measured here, confirming your reading.** R48's check (`web/test/rules.test.ts:2530`)
runs two censuses. The first walks `BASE_RECIPES` — agency only. The second walks
`<ToolbarRow>` call sites across BOTH `web/` and `web-portal/`, so the portal IS in scope
— and matches nothing, because the portal has zero call sites. The law passes there by
finding no rooms to inspect.

## Two halves, and the second is the one that lasts

**1 · The toolbar, on the portal's tickets list.** `web-portal/components/tickets-screen.tsx`
renders `CollectionHeading` then a bare `.map()` of `TicketRow` (around :105). It needs a
search box at minimum. Whether it also gets status filtering is yours to judge — the
screen's own comment argues against tabs (R3) and that argument still stands; it does not
argue against search.

Respect the portal's own idiom. It is the calm door: `max-w-3xl`, larger baseline type,
one column, no spine, no scale control. Do not import the agency's `ToolbarRow` wholesale
if it fights that; the portal is allowed its own shape as long as it has the function.

**2 · The check must census ROOMS, not toolbars.** This is the half that matters. If you
only add a `<ToolbarRow>`, census (ii) starts covering that one screen and stays blind to
the next portal collection somebody adds without one. The law would be exactly as vacuous,
one screen later.

So the portal census needs a positional oracle for "this is a collection screen" that does
not depend on the fix being present. `CollectionHeading` is the obvious candidate — it is
the portal's own count seam (R16) and every portal collection already renders it. Derive
the room list from that, then assert each room has search or a named, reasoned exemption in
the same registry R48 already uses. Rot-check it so the list can only shrink.

**Prove it the hard way.** Delete the search you just added and confirm the check goes RED.
If it stays green, you have written the same vacuous test again. The whole reason this
ruling exists is that R48 reported green over a surface it could not see.

## Constraints

- `npm run check` green, read by EXIT CODE. Baseline **4,001 tests**.
- Any user-visible sentence: `node scripts/i18n-extract.mjs` before you commit.
  **Never run `scripts/i18n-translate.mjs`** — it spends the owner's own key.
- Every Cloudflare command takes `cf-exec`. Do not deploy; the planner sequences that.
- Do not touch `shared/ui/` (hash-pinned).
- Branch, PR, report back. Say plainly anything in this brief that turned out wrong.
