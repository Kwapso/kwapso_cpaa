# What to upload, and exactly where

**Re-checked against the folder on 2026-08-24, after your uploads.** Four of
the eight are now closed. Everything below says what it is, where it goes, and
**what breaks without it** — so you can tell the difference between a real
blocker and a nice-to-have.

| # | | what it is | still owed? |
|---|---|---|---|
| 1 | ⬜ | The 96 icon glyphs | **YES — the biggest one left** |
| 2 | ⬜ | Five glyphs the 96 do not cover | **YES** |
| 3 | ⬜ | Two chart colours | **YES — two hex values, no files** |
| 4 | ✅ | Vector logo masters | arrived today, wired |
| 5 | ✅ | App icons and favicons | built from your masters |
| 6 | ✅ | Font files | arrived, wired, licence confirmed — closed |
| 7 | ✅ | Photography | arrived; two slots are your call, not files |
| 8 | ⬜ | Six module icons, and who owns the registry | **YES — answers, no files** |

---

## 1 · Icon artwork — the 96 glyphs · **STILL NEEDED**

**What it is.** Every icon in the system is a placeholder today: a rounded
frame with a per-name dot pattern, deliberately not final. The **names, the
React API and the six sizes are final** — only the drawing is missing.

**What breaks without it.** Nothing crashes and nothing is mis-sized, so this
is not urgent in the engineering sense. What it costs is the *review*: every
screen in the demo has the same dotted square in twelve places, so nobody
looking at a screen can judge whether the icon reads at 16px, whether two
icons in one row are distinguishable, or whether the set feels like one hand
drew it. Those are the only questions icons have.

**Where.** `foundations/icons/` — drop each SVG over the placeholder of the same name.

```
foundations/icons/AlarmClock.svg     foundations/icons/AppWindow.svg     foundations/icons/Archive.svg
foundations/icons/ArrowDown.svg      foundations/icons/ArrowLeft.svg     … 96 in total
```

**Filenames must match exactly** — PascalCase, and they are what the apps
import (`import { ArrowRight } from "kwapso-design/foundations/icons"`). Run
`ls foundations/icons/*.svg` for the list, or ask me for it as plain text.

**Any grid.** The generator reads each file's own `viewBox`, so draw at 24,
28.45 or anything else.

**After.** One command regenerates the React exports. No component and no call
site changes.

**One shortcut worth taking.** `assets/icons/` holds **30 real kwapso glyphs**
from the kit export, under kit names (`account.svg`, `arrow-down.svg`) rather
than the 96 export names. If those 30 are final art, say so and I will map them
across — that is a third of the set closed for the cost of one sentence from
you.

---

## 2 · Five glyphs the 96 do not include · **STILL NEEDED**

**What it is.** Five things components need that no name in the 96 covers.
Each currently ships a substitute that is visibly wrong:

| what is needed | what ships today | what that costs |
|---|---|---|
| broken image | `TriangleAlert` | a missing picture reads as an error |
| a place mark for the map | `Route` | the map's pins are the wrong shape |
| light / dark / system | **the three words** | the control is ~14rem wide |
| manual / automatic / AI actor | substitutions | flow nodes cannot be told apart |
| zoom out | the character `−` | it is type, not an icon, and it shows |

**Where.** `foundations/icons/`, named however you like — tell me the names and I will wire
them. Same rules as §1.

---

## 3 · Two data-safe chart hues · **STILL NEEDED — and this one is a real bug**

**What it is.** Not files — **two hex values**.

The kit has three series colours (sky, forest, poppy) and says they cycle, so
`--chart-4` and `--chart-5` currently repeat 1 and 2. Verified in
`foundations/tokens/tokens.css` today, unchanged: `--chart-4: var(--chart-1)`.

**What breaks without it.** Measured: **chart-1 against chart-4 is 1.000.** A
five-series chart draws two invisible pairs — two lines exactly on top of each
other in the same colour, and a legend that says they are different. That is
not a rough edge, it is a chart that lies.

The same delivery settles `--warning`, which today falls back to a paper tone
because the palette has no amber, so a warning and a quiet surface are the same
colour.

**Where.** Just tell me the hexes. Constraints: never mango (brand, not data),
never grey (reads as disabled), and each must separate from sky, forest and
poppy **and from each other** in both palettes. Send them and I will measure
all ten pairs and report the numbers before anything ships.

---

## 4 · Vector logo masters · ✅ **DELIVERED 2026-08-24**

You sent all six. They are in `assets/logos/`, they are true vectors (paths,
not a raster in a wrapper), and they are now what the whole system draws:

```
Isotype-black.svg   Isotype-white.svg
Logotype-black.svg  Logotype-white.svg
Logotype-no-isotype-black.svg   Logotype-no-isotype-white.svg
```

**Nothing further is needed here.** Two notes, for the record rather than as a
request:

- **They carry canvas padding, and I trimmed it in the build, not in your
  files.** Each master has an invisible frame path around the whole canvas, and
  the artwork sits inside it: the isotype's ink is 55.5% of its box, the
  lockup's viewBox reads 3.596:1 while the lockup itself is 4.9986:1. Your
  masters are untouched; `assets/build-assets.mjs` writes trimmed copies
  (`*-ink.svg`) and the components load those. If you ever re-export
  **trimmed**, nothing breaks — the build measures rather than assumes.
- The old workaround is gone. The PNGs needed the mark scaled 180% inside a
  clipping box to come out the right size; that is deleted, along with the PNG
  derivatives it needed.

---

## 5 · App icons and favicons · ✅ **BUILT — nothing owed**

You sent `app-icon-system.png` and `app-icon-portal.png`, which answered "one
set or two" as **two**. Everything derived from them now exists, in both sets:

```
assets/app-icons/system/            assets/app-icons/portal/
  favicon.svg      vector             favicon.svg
  favicon.ico      32 + 16            favicon.ico
  apple-touch-icon.png  180           apple-touch-icon.png
  icon-192.png     192                icon-192.png
  icon-512.png     512                icon-512.png
  maskable-512.png 512                maskable-512.png
```

Both sets are wired into a browser tab so you can actually look at them —
`demo/` wears the **system** icon, `mini-app/` wears the **portal** one, so you
can put the two pages side by side and judge whether two sets is right.

Three things worth knowing:

- **`favicon.ico` is a real ICO**, two sizes, not a PNG with the extension
  changed. Browsers accept the lie; the filename should not tell it.
- **`apple-touch-icon.png` has no alpha channel at all**, flattened on the
  kit's off-beige `#FFFEF9` rather than pure white. iOS composites on white and
  a transparent mark disappears.
- **`maskable-512.png` needed no extra padding.** Android crops a maskable icon
  to the middle 80%; measured on your master, the mark occupies the middle
  55.5%, so it is already well inside. Shrinking it further would have made the
  icon smaller than you drew it for no benefit.

**One question, and it is the only open thing in this section.**
`favicon.svg` can carry a `prefers-color-scheme` block so one file is black on
a light tab and reversed on a dark one. I have **not** given it one, because
you asked for *"smaller versions of the app icons"* and an app icon is a
full-bleed field — the tab's own colour never touches the mark, so a media
query would have to invent a second colourway the brand does not have. If you
want the favicon to be a bare mark that flips instead of a tile that does not,
say so and it is a small change.

---

## 6 · Font files · ✅ **CLOSED — nothing owed**

**The licence question is answered and this section is finished.** You said:
*"yes, the license for the font allows it. also this is an internal app."*
That was the only thing this section was ever waiting on. `LicenseAgreement.pdf`
sits in `assets/fonts/` alongside the files as the paper record; nobody read it
and nobody needs to — the call was yours and you made it.

**What is in the repo now.**

```
assets/fonts/Saans-Light.woff2               55 KB   ← what browsers fetch
assets/fonts/Saans-Medium.woff2              62 KB
assets/fonts/SerrifCondensed-Light.woff2     63 KB
assets/fonts/*.otf                                   ← your masters, kept
assets/fonts/*.ttf                                   ← your masters, kept
assets/fonts/LicenseAgreement.pdf
assets/fonts/build-fonts.mjs                         ← remakes the woff2
```

The `.woff2` are generated from your OTFs, not re-drawn: same outlines, same
metrics, **66% fewer bytes** (523 KB of OTF becomes 180 KB). Every page load in
both apps pays the smaller number. If you ever send an updated cut, drop the
new `.otf` in and one command regenerates the rest.

**Three `@font-face` rules are wired** in `foundations/tokens/tokens.css` §5.0 — Saans
Light at 300, Saans Medium at 500, SerrifCondensed Light at 300. Those weights
were read out of the files themselves rather than assumed. Verified in a
browser: all three faces report `loaded`, the `.woff2` are fetched `200`, and
rendered text measures differently from the fallback, which is the only proof
that a font is actually being used.

**One thing changed that you should know about, because it is a design
question and not a bug.** Every screen in this system was drawn and measured
against the fallback type. Saans is a slightly narrower letter on a slightly
wider zero, so the reading-measure token — `66ch`, taken straight from
chapter 03's own drawing — now sets **about 94 characters a line where it used
to set about 88**. Chapter 03's prose asks for "never more than sixty-eight".
That contradiction predates the fonts; the real type widened it. Nothing is
broken and nothing overflows — no screen scrolls sideways at any of the three
widths, in either palette — but if you want the measure to match the prose,
the number is **48ch**, and that is your call rather than mine to make
quietly.

---

## 7 · Photography · ✅ **THE ONE THAT MATTERED IS DELIVERED**

You sent `exterior-mockup.png` — the phone on a metal tray, kwapso portal on
screen — and said *"we will replace it later, but so far for the external
screens image use the attached (the phone mockup)"*.

It is in and it is drawn on **all six outside screens** (sign in, link sent,
session expired, invitation, password/security, the portal's door), because
they share one shell. **Replacing it is one file:** drop a new picture over
`assets/photography/exterior-mockup.png`, tell me, and all six change together.
No screen names a path.

1264 KB of PNG became three JPEGs — 62 / 118 / 190 KB — served by size, so a
tablet downloads 62 KB and a phone downloads **nothing**, because the picture
is not drawn below 48rem and is never fetched there. Details and the crop
reasoning are in `assets/photography/README.md`.

**Two slots are still empty, and both are a decision rather than an upload:**

- **The gallery's tiles** and **the company hub's header image** (3/1). These
  are almost certainly *content an application uploads*, not design assets — a
  client's own pictures, not kwapso's. If you agree, say **"those are content"**
  and I will stop listing them. If they are meant to ship with the kit, they go
  in `assets/photography/` with any filenames and I will wire them.
- The gallery already has a rule for the empty case and it is a good one: the
  kit says a record with no image shows its **title on paper**, not a
  placeholder icon.

**Nice to have, not needed: WebP.** It would cut another quarter off the
photograph. This machine cannot encode it — `sips` lists the format and then
refuses to write it, and there is no other encoder here. Not worth adding a
dependency to a repo whose whole delivery is source with no build step. If your
export tool can produce WebP at 960 / 1440 / 1920 alongside the master, drop
them in and I will wire them; otherwise the JPEGs are fine and nobody will
notice.

---

## 8 · The six module icons, and who owns the registry · **STILL NEEDED**

**What it is.** Ruling 34: *"Every module is identified by one icon from the
kit's forty, chosen once and used on the tile, in the rail, on the record and
in search. Modules are never identified by a letter."* **Chosen once** means
permanent, so it belongs in a registry rather than a demo array.

The kit draws six modules — Bookings, Trainings, Roster, Invoices, Reports,
Admin — and never says which icon each takes. They are a *client's* modules;
kwapso's own nine already have a registry.

**What breaks without it.** The module tile requires an icon and has **no
fallback**, deliberately — a fallback is how a letter ends up on a wall. So a
tenant with no registry cannot render a module wall at all. That is the
intended behaviour, not a bug, but it does mean this blocks a real screen.

**Where.** No files. Tell me two things:

1. **Which of the 96 icons each of the six takes.**
2. **Where the per-tenant registry should live** — config an application owns,
   or something the kit ships a default for.

---

## Sending them

Drop files straight into the folders above; I pick them up from disk. For the
things that are answers rather than files — the two hexes, the module icons,
the registry owner, gallery-and-hub-are-content — just say them. (The font
licence was one of these and is now answered; §6 is closed.)

**If you only do one thing:** §1, the 96 glyphs. It is the only item left that
changes how every screen looks.
