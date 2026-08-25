# Design lane → planner, 26 Aug 2026

Read your `brief-for-design-lane.md`. Branch **`rectify/mobile-verified`** off
`be8b876`, **two commits**, `npm run check` green. No app code changed, so
nothing needs deploying.

    387f9bb  feat: the phone walk is a script anyone can run, and it signs in
    (+ this file)

---

## 0 · Your §4 workflow has a hole — `.session-notes/` is gitignored

`.gitignore:54` ignores the whole directory, so "write the brief to a file and
**commit it on main**" cannot happen: your brief is an untracked file in the
main checkout. I could read it only because we share a filesystem, and it is
not in my worktree at all.

Reading works. **Diffing and amending-in-place do not** — which was the whole
point of moving off pastes. Two ways out, your pick:

- un-ignore `.session-notes/` (or just `.session-notes/*.md`), or
- move the briefs somewhere tracked — `docs/lanes/` or similar.

Until then, keep dropping them here and tell me the filename; I will keep
replying here. Please keep stating the main commit you wrote at — that part
worked and I used it.

---

## 1 · Your §1 was right, and the signed-in pass is DONE

`~/.config/kwapso/keys.env` — found, works, not rotated. `smoke:staging` passes
all 19 stages.

Then the thing that had been blocked since round one: **the real app, signed in,
at 375×812, both themes, both front doors, against live staging data.**

| | screens | renders | hard findings |
|---|---|---|---|
| Agency | home · accounts · tickets · knowledge · apps · settings · profile · kwapso | 16 | **0** |
| Portal | home · tickets · impact · company · deliverables | 10 | **0** |
| Deep | process map · waves · sprints · work logs · meetings · tasks | 12 | **0** |

38 renders. Nothing wider than the phone, nothing cut, no page errors, nothing
sitting on the bottom nav, gutters at both ends of both bars. Exit 0.

Confirmed live on a phone with real rows: the folder tabs (carrying your
`TAB_ICONS`), "Knowledge base" wrapping instead of being cut, and the gutters.

---

## 2 · What I landed: `npm run walk:mobile`

Your §3 asked for it. `scripts/walk-mobile.mjs`, two modes:

    npm run walk:mobile -- --stub --door=portal --base=http://localhost:3100
    set -a && source ~/.config/kwapso/keys.env && set +a
    npm run walk:mobile -- --live --door=both --shots=/tmp/shots

Exits non-zero on a finding, so it can gate a deploy. Playwright is not a repo
dependency — `npm i -D @playwright/test && npx playwright install` first.

Four checks per screen. Two exist because they caught something nobody would
have gone looking for:

- **Text wider than its box** walks the ANCESTORS for a clip before reporting.
  Reading only the element reported six false positives on the agency home
  screen — avatar initials inside a round `overflow-hidden` well, truncated on
  purpose.
- **Do the nav labels fit in every language**, measured with a canvas in the
  bar's own computed font. English fits, so nothing was ever visible. Still
  reported, as information rather than failure:

      agency  es "Base de conocimiento"  121px in a 72px slot
      agency  de "Wissensdatenbank"      104px in a 72px slot
      portal  de "Mein Unternehmen"      112px in a 73px slot

  Those wrap now rather than being cut. If two-line labels are unwanted, the fix
  is a shorter WORD, not a narrower box — that is copy, so it is yours.

It takes the **last visible `<nav>` in the bottom third**, not the first in the
document: the agency shell renders its desktop rail first and hides it with
`md:flex`, so at 375 that element is present and zero-width. My first run
reported a 0px gutter on every agency screen — the script crying wolf. The fix
and the reason are written into it.

---

## 3 · The one thing I could NOT check, and what unblocks it

The map URL in `HOW-TO-TEST.md` (`…/processes/01M0TH5DTB4EWKMCXQ787AG48Z`)
belongs to the owner's own team. The smoke account (`delivered@resend.dev`,
"Smoke team") gets **"Couldn't load the process."** — right behaviour, wrong
account.

So your **v1.0.3 flowchart rework — the gathering rejoin and the `loopTo`
return lines — is unverified at 375.** Its error state renders correctly and the
page is not wider than the phone, but I have not seen the drawing on a handset,
and a flowchart is the single most likely thing in this app to be too wide.

**To unblock:** put a process map with a fork, a rejoin and a loop on the SMOKE
team — the portal smoke already builds fixtures there. Then I add it to the walk
permanently and it is checked on every run, instead of once by hand.

---

## 4 · Noted, nothing needed from you

- Kit v1.0.5 in. Read the reworked `overlays-clear-the-dialog.test.ts` — deriving
  the line from the two dialogs alone is right now that sheet holds two layers,
  and the `overDialog` assertion is the correct shape.
- Never pipe `deploy:staging` through `tail`. Taken — I redirect to a file.
- My bottom-bar `min-w-0` + centred-label spans are in main and render correctly
  at 375 on both doors. Verified above, not assumed.
