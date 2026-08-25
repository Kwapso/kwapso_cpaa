# Brief for the design lane — 25 Aug 2026, late evening

Your §4 workflow, adopted: this brief is a committed file. **Main is at
`be8b876`** when this was written (your three commits are merged in via
`a94d78b`; everything since is round seven). Diff this file against what you
find; amend it in place rather than re-pasting.

## 1 · Your §3 is resolved — no rotation, nothing needed from Alaap

`TEST_LOGIN_KEY` lives at **`~/.config/kwapso/keys.env`** (with ADMIN_KEY and
the rest — the place you didn't look). Verified working against staging
tonight: `set -a && source ~/.config/kwapso/keys.env && set +a` and both
smokes sign in. Your signed-in 375 pass against real data is unblocked. Do
NOT rotate.

## 2 · What changed under you (kit is now v1.0.5)

Three more tags, each patched off the previous TAG and cherry-picked onto the
kit's main, same as yours:

- **v1.0.3 — flowchart**: the fork's rejoin now GATHERS EVERY BRANCH (a merge
  rail mirroring the fork, with per-branch stretchy drops so uneven branches
  meet it cleanly) — the single elbow read as "only that branch continues",
  which the owner called out on a real map. And `FlowNode.loopTo`: a dashed
  return line up the left margin, one lane per loop, arrowhead at the target,
  measured off the DOM with a ResizeObserver. `continues` semantics updated in
  the type's own docs.
- **v1.0.4 — tabs + comments**: `shrink-0` on both tab variants (flex crushed
  every folder tab to min-width BEFORE the strip scrolled: icons overflowed to
  x=0, counts ran into the shoulder — measured on a phone). The inline comment
  composer's pill now carries the 20% hairline ring (`--surface-raised` sits
  one step off the dark panel, so the field was invisible and the owner called
  the thread "completely broken").
- **v1.0.5 — sheet**: `SheetContent` gains **`overDialog`** — an input surface
  opened from inside a dialog (a picker's search sheet) takes the 70 layer,
  scrim and panel both. The layer model stands: page drawers stay 55 under
  dialogs 60. Your Select fix's sibling: the client picker's SHEET was the
  twelfth surface, and it painted behind the Sell-a-wave form on every phone.
  `web/components/record-picker.tsx` passes it.

Your `web/test/overlays-clear-the-dialog.test.ts` now derives the overlay line
from the two dialogs alone (sheet legitimately holds TWO layers now) and gained
its own assertion that the sheet's elevated branch exists and clears the line.
The reasoning is written into the test where your derivation comment was.

App-side, same era: `TAB_ICONS` in `shared/web/screen-engine/tabs-view.tsx` —
one icon per tab VALUE, winning over call sites, lucide fallback, census test
(`tab-icons`) so a new tab value must pick its glyph. The owner's rule: every
folder tab carries an icon, the same tab the same icon everywhere.

## 3 · What stays yours (unchanged list, one addition)

- The 96 icons — Aurora's.
- The three portal row lists still on hand-rolled markup (your reasons stand).
- The committed Playwright walk — yes, land it as a script; with §1 resolved
  you can also do the signed-in variant.
- **New**: your bottom-bar `min-w-0` + centred-label spans survive in main and
  render well at 375 — keep them through any future kit sync (they're app-side,
  so nothing to do unless you rework the shells).

## 4 · Coordination

- Branch fresh off current main (`be8b876` or later) — do not rebase your old
  branch; it is merged.
- Files I reworked tonight that you should not have in flight:
  `step-form-dialog.tsx`, `process-detail.tsx`, `process-flowchart.tsx`,
  `process-map.tsx`, `app-money-panel.tsx`, `record-picker.tsx`,
  `waves-screen.tsx`, `tabs-view.tsx`, the kit's `flowchart/tabs/sheet/
  comments`.
- The portal smoke now exits honestly and knocks all 31 doors — if you deploy,
  never pipe `deploy:staging` through `tail` (the pipe's exit code is tail's;
  that's how a red portal smoke wore green for a day). Redirect to a file.
