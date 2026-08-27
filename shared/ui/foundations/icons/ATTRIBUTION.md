# Where this art comes from

The glyphs in this folder are the **Iconoir** pack — 1,383 icons, MIT licensed,
from [github.com/iconoir-icons/iconoir](https://github.com/iconoir-icons/iconoir)
(© 2021 Luca Burgio). The licence is beside this file as `LICENSE-iconoir`, and
MIT permits redistribution inside this repository.

They replaced the placeholder set on 2026-08-26. Until then every one of the 96
`.svg` files was the same rounded square with dots in it, and the consuming apps
painted lucide art over them at sync time to avoid shipping that.

## What was changed on the way in, and why

The pack is vendored rather than depended on, because `docs/RULES.md` §9.3 says
the dependency list is closed. Four normalisations were applied, all mechanical
and all reproducible by re-running the conversion:

1. **The root `<svg>` was reduced to a `viewBox` and `fill="none"`.** Iconoir
   puts `stroke`, `stroke-width` and the line joins on the root; the generator
   keeps only the viewBox and the children, so those defaults would have been
   lost. They live in `icon-base.tsx` now and are painted once for the whole
   set. Per-element `stroke-width` (195 files) and `fill="currentColor"`
   (83 files) survive untouched — a child attribute beats the root.

2. **`fill="black"` became `fill="currentColor"`** in `PiggyBank` and
   `EmojiPuzzled`. Those are the pig's eye and the face's eyes: ink, drawn as a
   literal. As shipped they stayed black in dark mode, which is a bug in the
   pack rather than a rule of ours — this fixes it.

3. **`fill="white"` became `fill="none"`** in `Snapchat`, a backing plate behind
   an outline glyph. Invisible on white, wrong on dark.

4. **Two `<defs><clipPath>` blocks were stripped** (`Git`,
   `RhombusArrowRight`). Each clipped to a full-viewBox rect — a Figma export
   artefact that clips nothing — and each carried a `fill="white"` that the
   colour guard is fatal on.

## The commission names

`docs/RULES.md` §9.1 forbids renaming or dropping an export, and the two
consuming apps hold 104 call sites against the commission's spellings. Iconoir
spells 60 of those differently: a left chevron is `nav-arrow-left`, a group of
people is `group`, an ellipsis is `more-horiz`. Those 60 are re-exported from
`index.ts` as **aliases** onto Iconoir's art, so no call site changes and no art
is duplicated. The mapping is data in `aliases.json`.

**Seven are approximations**, because Iconoir draws no equivalent distinction.
They are listed here so the difference is a recorded decision rather than
something noticed on a screen later:

| commission name | Iconoir glyph | why it is not exact |
|---|---|---|
| `AlarmClockOff` | `bell-off` | no alarm-off; the muted-bell reading |
| `ArchiveRestore` | `undo-action` | no un-archive; "undo the archiving" |
| `CalendarClock` | `calendar-rotate` | no calendar-clock |
| `CalendarRange` | `calendar-arrow-down` | no calendar-range |
| `CircleStop` | `pause` | no stop-in-circle |
| `FileSpreadsheet` | `page` | no spreadsheet page |
| `SearchX` | `search-window` | no search-with-cross |

One is arguably an improvement: `Power` maps to `switch-off`. The house meaning
of `Power` is "switch off / deactivate", which `switch-off` says plainly and a
power symbol only implies.
