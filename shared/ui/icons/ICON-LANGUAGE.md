# ICON-LANGUAGE.md

The drawing language of the kwapso icon set, measured off the kit's own SVG
source, plus the name map for the 93 icons the commission requires.

**Status: analysis and specification only. No glyph has been drawn.**

Sources read in full for this document:

- 30 filled SVGs — `design-mothership/assets/icons/*.svg`
- 7 outline SVGs — `design-mothership/assets/icons-open/*.svg`
- `design-mothership/assets/README.md` (ruling 34, the kit's own grid claim)
- `design-mothership/GAPS.md` (GAP-F1-1 … GAP-F1-6 already cover iconography)
- `design-mothership/exclusions.md` (rulings 03, 10, 24, 28)
- `~/Downloads/DESIGN-SYSTEM-COMMISSION.md` § 8 (the 93 fixed names)

Every number below marked **[measured]** was read out of a path `d` attribute or
a `viewBox` and, where it is a derived quantity, the derivation is shown. Every
number marked **[recommendation]** is mine, not the kit's, and is labelled as
such because the kit does not settle it.

---

## 0 · Executive summary

| | |
|---|---|
| Canonical viewBox | `0 0 28.35 28.35` **[recommendation]** — the modal actual, and exactly 10 mm at 72 dpi. The kit's prose says "28.45 grid"; only 2 of 30 files are that. |
| Stem weight | **2.18** at a 28.35 box = 0.0769 of the box **[measured]** |
| Construction | `stroke-width: 2.18`, `stroke-linejoin: round`, `stroke-linecap: butt`, expanded to outlines **[measured — see § 2.4]** |
| Fill | Filled outlines only. **Zero stroke attributes in all 37 files** **[measured]** |
| Counters | Opposite winding under default nonzero. No `fill-rule` anywhere **[measured]** |
| Diagonals | 45° only, drawn by an axis step of 2.18/√2 = **1.54** **[measured]** |
| Verdict counts | **13 REUSE · 7 SUBSTITUTE · 73 DRAW · 10 orphaned kit glyphs** |

Three places the kit contradicts itself or its own documentation are recorded in
§ 6. The most consequential: **no icon file declares `fill` at all**, so the
claim in `assets/README.md:6` that they are `fill: currentColor` is false as
shipped.

---

## 1 · What was measured

### 1.1 Fill vs stroke — verified, not assumed

Greps across all 37 files:

| Probe | Result |
|---|---|
| `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin` | **0 files** |
| `fill=` | **0 files** |
| `currentColor` | **0 files** |
| `fill-rule`, `clip-rule`, `evenodd` | **0 files** |
| `#rrggbb` / `rgb()` | **0 files** |
| `<style>` block or `.cls-1 { }` rule | **0 files** |
| `transform=` | **0 files** |
| `<path>` count per file | **exactly 1**, in every one of the 37 |

**Every glyph is a single filled path.** What look like strokes are closed
filled outlines. This is confirmed by reading, per instruction, not assumed.

**No file hardcodes a colour** — but no file sets `currentColor` either. 23 of
the 30 filled icons carry `class="cls-1"` against an **empty** `<defs></defs>`,
so the class resolves to nothing. The other 7 (`audit`, `bar-graph`,
`deliverables`, `feedback`, `like`, `mail`, `search`) are bare
`<path d="…">` with no attributes at all. All 37 therefore render at the SVG
initial fill value, **black** — not the ink token, not `currentColor`.

> Contradiction 1. `assets/README.md:6` states the set is `fill: currentColor`.
> As shipped it is not. Every delivered file must gain `fill="currentColor"` on
> the `<svg>` element (or the React wrapper must supply it), and the vestigial
> `class="cls-1"` and empty `<defs>` should be stripped.

### 1.2 viewBox spread

Every viewBox is `0 0 w h` and is a **tight bounding box of the artwork**, not a
grid. That is why they are ragged.

| File | viewBox | File | viewBox |
|---|---|---|---|
| account | 28.35 × 28.35 | globe | 28.35 × 28.35 |
| arrow-diagonal | 28.35 × 28.35 | goal | 28.68 × 28.36 |
| arrow-down | 28.35 × 28.35 | help | 28.36 × 28.36 |
| arrow-right | 28.35 × 28.35 | like | **30.71** × 28.35 |
| assets | 25.36 × 28.20 | mail | 28.87 × 28.45 |
| audit | **22.23** × 28.29 | plus | 27.80 × 28.35 |
| bar-graph | 28.35 × 28.45 | quick-action | 24.30 × 28.35 |
| bookmark | 22.33 × 28.45 | search | 28.35 × 28.35 |
| bug | 25.08 × 28.35 | sector-graph | 28.35 × 28.35 |
| calendar | 28.45 × 28.45 | settings | 27.87 × 28.45 |
| chat | 28.35 × 28.35 | sprint | 28.20 × 28.20 |
| clock | 28.35 × 28.35 | star | 29.67 × 28.35 |
| currency | 28.45 × 28.45 | tag | **27.68** × **27.68** |
| deliverables | 28.23 × 28.23 | download | **33.43** × **28.66** |
| desktop | 28.35 × 28.45 | feedback | 28.35 × 28.35 |

All 7 `icons-open` files are `28.35 × 28.35`.

**[measured]** Width range 22.23 → 33.43. Height range 27.68 → 28.66.
Exactly-28.35-square: 10 of 30 filled + all 7 open = 17 of 37.
Exactly the kit's claimed 28.45 on both axes: **2 of 30** (`calendar`,
`currency`).

28.35 pt = 10.000 mm (1 mm = 2.83465 pt). The artboard was a 10 mm square in
Illustrator and the exporter wrote the artwork bbox rather than the artboard.

**Measured consequence.** Dropped into equal square boxes with default
`preserveAspectRatio="xMidYMid meet"`, the glyphs render at different scales.
Taking a 28.35 file as 1.00:

| File | rendered scale | File | rendered scale |
|---|---|---|---|
| download | **0.848** (15 % small) | mail | 0.982 |
| like | 0.923 | goal | 0.988 |
| star | 0.955 | tag | **1.024** (2.4 % large) |

An 18 % spread across the set. Already logged upstream as **GAP-F1-1**
("Needs a ruling on a canonical grid (and possibly re-exported square
viewBoxes)"). This spec answers it — see § 2.1.

### 1.3 Stem weight

**2.18 units at a 28.35 box = 0.07690 of the box. [measured]**

Read directly off axis-aligned runs:

| File | Evidence |
|---|---|
| `clock` | hand `h2.18`; horizontal arm spans y 13.08 → 15.26 = 2.18 |
| `arrow-down` | shaft `V7.63 h2.18 v9.36` |
| `arrow-right` | shaft `H7.63 v-2.18 h9.36` |
| `arrow-diagonal` | bracket `v7.22 h-2.18`; `h7.22` … `0,-2.18` |
| `plus` | both bars 2.18; `v-2.18` / `h2.18` |
| `help` | question-mark stem base `h2.18` |
| `search` | ring wall = outer r 6 − inner r 3.82 = **2.18** |

Files authored on the 28.45 artboard use **2.19** — `calendar` (frame wall
26.26 → 28.45), `currency` (`v2.19`, `h2.19`). 2.19/28.45 = 0.07698, the same
ratio to four places. Token frequency across the filled set:
`2.18` ×25, `2.19` ×21, `1.09` ×23, `4.36` ×23, `1.54` ×16, `4.38` ×10.

Rendered stem, per delivery size:

| Size | 16 | 20 | 22 | 24 | 32 |
|---|---|---|---|---|---|
| px | 1.231 | 1.538 | 1.692 | **1.846** | 2.462 |

One measured outlier: `download.svg`'s arrow shaft is **2.38** in a 33.43 box
= 2.018 normalised to 28.35, i.e. **7 % lighter than the set** once the
viewBox is corrected. Fix on re-export.

Two more, on 45° runs only (see § 1.4 for the method): `audit`'s magnifier
handle steps 1.39 → **1.97** perpendicular (10 % light); `deliverables`'
crease steps 1.45 → **2.05**. Both should be pulled to 2.18 on re-export.

### 1.4 The 45° rule

A diagonal band of stem *w* is drawn by offsetting **w/√2** along each axis.
2.18/√2 = **1.5415**, and the kit writes **1.54** — sixteen times.

Verified geometrically rather than taken on faith. In `arrow-down.svg` the
outer leg of the arrowhead runs (8.30, 15.29) → (13.40, 20.39), i.e. the line
`x − y + 6.99 = 0`. The inner offset point is (9.84, 13.75). Perpendicular
distance = |9.84 − 13.75 + 6.99| / √2 = 3.08 / √2 = **2.178**. That is the stem.

Same 1.54 step in `arrow-right`, `arrow-diagonal`, `search` (the handle).
Every diagonal *stroke run* in the set is exactly 45°; there is no shallower
diagonal anywhere. (Silhouettes — `star`, `like`, `quick-action`, `goal` — of
course carry other angles; the 45° law governs stroke-as-fill runs only.)

### 1.5 Corners and terminals

**The whole set is a round-join, butt-cap stroke converted to outlines.
[measured]** Establishing it:

*Round join, radius = ½ stem = 1.09.* `clock.svg`:
`M21.8,15.26 h-7.63 c-.6,0,-1.09,-.49,-1.09,-1.09 V4.36 h2.18 v8.72 h6.54 v2.18Z`.
The **convex** corner of the L, at (13.08, 14.17), is the filleted one —
`c-.6,0-1.09-.49-1.09-1.09` is a quarter-circle of radius 1.09. The **concave**
corner at (15.26, 13.08) is a hard 90° mitre. That is exactly what
`stroke-linejoin: round` produces. Confirmed identically in `arrow-diagonal`
(fillet at (19.12, 10.32), mitre at (16.94, 12.95)).

*Round join on a 45° apex.* `arrow-right.svg` opens
`M20.39,13.4 c.43.43.43,1.12,0,1.54` — a 1.54 chord across the arrowhead apex.
A round join of radius 1.09 on a 90° corner has chord 1.09 × √2 = 1.5415. ✔

*Butt caps.* Free terminals are flat: `arrow-down`'s shaft ends at `V7.63`;
`clock`'s hands end flat at y 4.36 and x 21.8; all four arms of `plus` end flat.

*One deliberate exception.* `download.svg`'s arrow shaft is round-capped:
`v-6.67 c0-.66,.53-1.19,1.19-1.19 s1.19,.53,1.19,1.19 v6.67` — a semicircle of
r 1.19 = ½ its stem.

*Degenerate curves.* `plus.svg` writes its corners as `c` commands with
collinear control points (`c-.73,0,-3.58,0,-4.36,0`). These are straight lines,
not fillets — a crossing pair of butt-capped bars has no joins at all.

**The kit states no icon corner radius.** Ruling 03's radii (24 px boxes,
999 px pills, 6 px marks/selection, 4 px bars) govern UI geometry, not glyph
interiors. Not stated by the kit.

### 1.6 Container shapes

**Outer radius = 2 × wall; inner radius = 1 × wall. [measured]**

| File | outer R | wall | inner r |
|---|---|---|---|
| `calendar` (28.45 box) | 4.38 | 2.19 | 2.19 |
| `desktop` (28.35 box) | 4.36 | 2.18 | 2.18 |

4.36 = exactly 2 stems, and 4.36/28.35 = 0.1538. Other measured container
radii: `mail` 4.12, `tag` 4.18, `audit` 2.55 / 2.82, `icons-open/chat` 3.20.
The cluster is 4.12–4.38 with two smaller outliers in `audit`.

`bar-graph` bars **[measured]**: three bars, each **7.09** wide (28.35 / 4 =
7.0875), gaps **3.545** (half a bar), tops rounded at r ≈ 2.95 (0.83 × the
bar's half-width) with a 1.18 flat between the two corner arcs, bottoms square.
Bar tops at y 14.24 / 7.12 / 0 → heights in the ratio 1 : 1.5 : 2. All three
bleed the bottom edge.

### 1.7 Circles, dots and counters

| Element | Measured value | Source |
|---|---|---|
| Container disc | r = **14.175**, centred, **full bleed, zero padding** | `M14.17,0C6.35,0,0,6.35,0,14.17s…` — 10 files |
| Punctuation dot | r = **1.09**, i.e. **d = one stem** | `help.svg` question-mark dot |
| Dots in a row | r = **1.64**, pitch **5.45**, cy 14.17 | `chat.svg`, cx 8.72 / 14.17 / 19.62. d = 3.28 = 1.5 stems |
| Head (person) | r = **6.0** at (14.18, 9.81) | `account.svg` |
| Bare bust head | r = **4.0** at (14.17, 9.60) | `icons-open/account.svg` |
| Lens (magnifier) | outer r **6.0**, inner r **3.82**, at (12.54, 12.54) | `search.svg`, wall 2.18 |
| Gear hub | r = **5.47** at (13.93, 14.22) | `settings.svg` |
| Porthole | r = **3.02** | `sprint.svg` |
| Tag eyelet | r = **1.57** | `tag.svg` |
| Small lens | r = **2.53** | `audit.svg` |

**Counters use winding, not `fill-rule`. [measured]** In `search.svg` the lens
counter starts at (8.72, 12.54) — the left of the lens — and its first control
vector is (0, −2.11), so it runs left → top → right: **clockwise on screen**.
The enclosing disc starts at (14.17, 0) — the top — and its first control runs
toward (6.35, 0) then (0, 6.35): top → left → bottom, **counter-clockwise on
screen**. Same relationship in `account.svg`, `clock.svg`, `settings.svg`,
`tag.svg`, `sprint.svg`.

> **Outer contour counter-clockwise on screen; every counter clockwise.
> Never add `fill-rule="evenodd"` — the set does not use it and mixing the two
> conventions inside one delivery is how a hole silently fills in.**

### 1.8 Optical padding — the kit does not have a safe area

Clear margin per side if each glyph is centred in a 28.35 square **[measured]**:

| Margin | Files |
|---|---|
| **negative** (overflows the box) | download −2.54, like −1.18, star −0.66, mail −0.26, goal −0.17 |
| **0.00** (full bleed) | account, arrow-diagonal, arrow-down, arrow-right, chat, clock, currency, feedback, globe, help, search, sector-graph, bar-graph |
| 0.24 – 0.34 | settings 0.24, plus 0.28, tag 0.34 |
| 1.50 – 3.06 | assets 1.50, bug 1.64, quick-action 2.03, bookmark 3.01, audit 3.06 |

There is no consistent safe area to report. The kit does not operate one.
§ 2.2 recommends one.

### 1.9 Enclosure — the one strong compositional rule in the set

Sorting the 30 filled glyphs by whether the meaning is a **counter inside a
full-bleed disc** or a **positive silhouette** produces a clean 30/30 split
**[measured]**:

**Disc-enclosed (12):** `account` `arrow-diagonal` `arrow-down` `arrow-right`
`chat` `clock` `currency` `feedback` `globe` `help` `plus` `search`
(`plus`'s disc is r 13.9, not 14.175 — a drawing slip, not a variant.)

**Positive silhouette (17):** `assets` `audit` `bar-graph` `bookmark` `bug`
`calendar` `deliverables` `desktop` `download` `goal` `like` `mail`
`quick-action` `settings` `sprint` `star` `tag`

**Disc as datum (1):** `sector-graph` — the disc *is* the information.

The rule that generates that split exactly:

> **A glyph that is only a mark — an arrow, a hand, a question mark, a cross,
> a magnifier, a row of dots, a person, a currency symbol, a set of graticules
> — is set as a counter knocked out of the full-bleed disc.
> A glyph that is an object with its own silhouette — a sheet, a folder, an
> envelope, a monitor, a gear, a bookmark, a star, a heart, a tag, a bar chart
> — is drawn as a positive silhouette and is never enclosed.**

This is the single most load-bearing fact for the drawing agents: a new arrow
that is *not* disc-enclosed will look foreign next to `arrow-down.svg`, and a
new envelope that *is* enclosed will look foreign next to `mail.svg`.

### 1.10 `icons-open/` is a different hand — do not derive from it

**[measured]** The 7 outline files are not a variant of the same drawing:

- **Stem 2.40 – 2.50**, i.e. 10–15 % heavier than 2.18. `clock`: outer arc
  r 9, inner arc r 6.6 → wall **2.40**; its bars are `h2.4`. `globe`: 9 / 6.6 →
  **2.40**, bars `h2.4`. `search`: 7.5 / 5 → **2.50**. `feedback`: 8.5 / 6 →
  **2.50**.
- **Different optical area.** `icons-open/clock`'s ring outer radius is 9 in a
  28.35 box — 5.3 units of clear margin per side, against the filled set's
  full-bleed 14.175.
- **Different curve primitive.** 5 of 7 use SVG arc commands (`A`);
  the filled set uses zero arcs, only cubics.
- **2 of the 7 are not outlines at all.** `icons-open/account.svg` is a solid
  filled bust; `icons-open/chat.svg` is a solid filled bubble with dot counters
  (r 1.35, corner radius 3.2). Neither is a stroked form.

The commission never asks for an outline treatment. Treat `icons-open/` as
reference for two shapes only — the **bare bust** in `account.svg` (head r 4.0
at (14.17, 9.60), shoulders as a 7.05-radius cap between x 5.77 and 22.58),
which is the correct base for `Users` / `UserPlus` / `UserCheck` /
`UserMinus`, and the **un-enclosed bubble** in `chat.svg`. Ignore its weights.

---

## 2 · THE DRAWING LANGUAGE SPEC

A different agent should be able to draw a new glyph from this section alone
and have it sit next to `clock.svg` without looking foreign.

### 2.1 Canonical viewBox

```
viewBox="0 0 28.35 28.35"
```

**[recommendation]** — the kit's prose calls it "the 28.45 grid" but only 2 of
30 files are that on both axes, 10 are exactly 28.35 square, and 28.35 is
exactly 10 mm, which is what the artboard actually was. Adopt 28.35 square for
all 93, **including re-exports of the 13 REUSE and 7 SUBSTITUTE files**, so the
whole set renders at one scale. This closes GAP-F1-1; record the deviation from
the kicker's "28.45" wording in `manifest.json`.

Every file:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28.35 28.35" fill="currentColor">
  <path d="…"/>
</svg>
```

No `class`, no `<defs>`, no `<g>`, no `transform`, no `fill-rule`, one `<path>`.
Matching the kit's own file shape with the two fixes from § 1.1 applied.

**Re-export corrections required on the 20 carried-over files:** re-centre in a
28.35 square (`download`, `like`, `star`, `mail`, `goal`, `tag`, `audit`,
`bookmark`, `quick-action`, `assets`, `bug`, and the 28.45-authored files);
pull `download`'s stem from 2.38 to 2.18 and `audit`'s handle from 1.97 to
2.18; snap `plus`'s disc from r 13.9 to r 14.175.

### 2.2 Safe area

**Not stated by the kit** — § 1.8 shows the set has no consistent margin.

**[recommendation]** Two admitted extents, both derived from measured kit
values rather than invented:

- **Container extent — 28.35 square, full bleed.** For the disc (r 14.175
  centred at 14.175, 14.175) and for any glyph whose silhouette *is* its
  container: `calendar`, `desktop`, `settings`, `tag`, `bar-graph`. These
  already bleed and must not be shrunk, or the 13 reused files change shape.
- **Glyph extent — 26.17 square**, i.e. **one half-stem (1.09) of clear on
  every side**. For everything else. 1.09 is the kit's own fillet radius, so
  the margin is a kit unit, not a new one.

Centre of the box is (14.175, 14.175) in both cases. Never place optical mass
so that a glyph's *visual* centre drifts more than 0.5 units off centre; the
kit centres everything (`chat`'s dot row on cy 14.17, `search`'s lens on
(12.54, 12.54) with the handle balancing it to the lower-right).

### 2.3 Stem weight

**2.18** for every stroke-as-fill run, at the 28.35 box. No secondary weight
exists in the filled set and none may be introduced.

Derived companions, all kit-measured:
- half-stem / fillet radius / dot radius: **1.09**
- 45° axis step: **1.54** (= 2.18/√2)
- container outer radius: **4.36** (= 2 stems)
- container inner radius: **2.18** (= 1 stem)
- container wall: **2.18**

### 2.4 How a stroke is constructed as a fill

The set is a `stroke-linejoin: round`, `stroke-linecap: butt`,
`stroke-width: 2.18` stroke that has been outlined. Reproduce that, by hand or
by outlining an actual stroke and cleaning up:

1. Draw the **centreline** of the run.
2. Offset **±1.09** perpendicular to it.
3. At a free terminal, close **square** (butt) across the 2.18.
4. At a corner, fillet the **convex/outer** side with a circular arc of
   radius **1.09** and leave the **concave/inner** side a hard mitre.
   *(This is the direction the kit uses — see `clock.svg` in § 1.5. Getting it
   backwards is the single most likely way to produce a foreign-looking glyph.)*
5. On a 45° run, step the offset **1.54 in x and 1.54 in y**.
6. Wind the outer contour **counter-clockwise on screen**; wind every counter
   **clockwise**. Do not write `fill-rule`.
7. Emit as **one** `<path>`, subpaths concatenated, closed with `Z`.

**Round caps** are permitted only where an arrow shaft terminates freely inside
a container, matching `download.svg` (semicircle of r 1.09). Everywhere else,
butt.

### 2.5 Diagonals

**45° only** for any stroke-as-fill run. Draw with the 1.54 axis step. Where
45° genuinely cannot carry the form, the kit gives no precedent —
**not stated by the kit**. **[recommendation]** use 1:2 (26.57°) and record it
in `manifest.json` rather than inventing a third angle per glyph.

Silhouettes are exempt: `star` (36°/72°), `like`, `quick-action`, `goal` all
carry free angles because they are outlines of objects, not strokes.

### 2.6 Circles and dots

| Purpose | Radius | Basis |
|---|---|---|
| Container disc | **14.175** at (14.175, 14.175), full bleed | 10 kit files |
| Punctuation / terminal dot | **1.09** (d = 1 stem) | `help` |
| Dot in a row of three | **1.64**, pitch **5.45** | `chat` |
| Person head, disc-enclosed | **6.00** at (14.18, 9.81) | `account` |
| Person head, bare bust | **4.00** at (14.17, 9.60) | `icons-open/account` |
| Ring (magnifier, badge, buoy) | outer **6.00** / inner **3.82** | `search` — wall 2.18 |
| Small aperture / eyelet | **1.57** | `tag` |

A ring is always drawn as two concentric circles, outer CCW and inner CW, wall
exactly 2.18. Never as a stroked circle.

### 2.7 Overlaid marks (badges)

**Not stated by the kit** — no kit glyph carries a badge.

**[recommendation]** For `UserCheck`, `UserPlus`, `UserMinus`, `BadgeCheck`,
`ClipboardCheck`, `SearchX`, `CalendarClock`, `AlarmClockOff` and their kin:

- The badge mark is inscribed in a **d = 11.34** circle (0.4 × the box) whose
  centre is **(21.0, 21.0)** — bottom-right quadrant.
- The host glyph is **cleared by 1.09** (one half-stem) all round the badge,
  cut out of the host, so the two never touch.
- The badge mark itself is a **bare positive form** at stem 2.18, never a
  second disc. You cannot nest a full-bleed disc inside a glyph.
- A slash (`Ban`, `EyeOff`, `ShieldOff`, `AlarmClockOff`) is a **45° run at
  stem 2.18** from (5.0, 5.0) to (23.35, 23.35), with the host cleared by 1.09
  on both sides of it. Defined once here so the four agents do not each invent
  one.

### 2.8 Optical balance at 16 px

At 16 px the box is 28.35 units → 16 px, so **1 unit = 0.5644 px** and the
stem renders at **1.231 px**. It will be antialiased grey, not a crisp line.

**[recommendation], all three grounded in measured kit minima:**

1. **Minimum positive feature: 2.18 units (one stem) = 1.231 px at 16.**
   The kit's smallest positive feature is exactly that — the `help` dot at
   d 2.18. Nothing may be thinner.
2. **Minimum negative gap: 2.18 units.** The kit's tightest measured gap is
   `chat`'s inter-dot clearance, 5.45 − 3.28 = **2.17**. Anything tighter
   closes up at 16 and the glyph becomes a blob.
3. **A disc-enclosed glyph must contain at least one closed counter region
   ≥ 6.0 units across.** `search`'s lens counter is 7.64 across, `account`'s
   head is 12. `clock` is the kit's own worst case and is already marginal at
   16. Below 6.0 the disc reads as a solid dot.

**Do not pixel-fit. [recommendation]** The kit does not: `clock`'s hand edges
sit at 13.08 and 15.26, which at 16 px land on 7.38 and 8.61 px — nowhere near
a boundary. Twenty of the 93 are reused unfitted; a pixel-fitted new glyph
would sit visibly crisper beside them. Keep everything centred on 14.175 and
accept the antialiasing. Consistency beats sharpness in a mixed set.

**Sizes.** The commission asks for five — 16 / 20 / 22 / 24 / 32. The kit fixes
**four** (16 / 20 / 24 / 32, per GAP-F1-2); **22** appears only in the kit's
rendered markup and is off-scale with no token, recorded as GAP-F1-3. All five
are the same drawing scaled; there is no size-specific master.

### 2.9 Colour

`fill="currentColor"` on every `<svg>`. No colour inside a glyph, per
`exclusions.md` ("ink by default", "no colour outside the seven"). No gradient
— banned outright. No two-tone glyph: the set has no precedent for one and the
counter-winding construction cannot express one in a single path.

### 2.10 Direction and RTL

`exclusions.md` records **ruling 10: RTL is out of scope**. The commission's
`manifest.json` sketch carries `"rtl": true`. These conflict, and it is not an
icon decision — but the drawing agents need an answer before they start.

**[recommendation]** Draw LTR only, mark the directional icons in `index.ts`,
and mirror at runtime with `[dir="rtl"] [data-icon-directional] { transform: scaleX(-1) }`.
No mirrored twin files. The 14 directional names: `ArrowLeft` `ArrowRight`
`ArrowUpRight` `ChevronLeft` `ChevronRight` `CornerDownRight` `LogOut`
`PanelLeftClose` `PanelLeftOpen` `Route` `Send` `Share`
`SquareArrowOutUpRight` `Undo2`.

---

## 3 · THE NAME MAP — all 93

Verdict key: **REUSE** = the kit file already *is* this icon ·
**SUBSTITUTE** = closest kit form, not literally the requested thing ·
**DRAW** = no kit equivalent, draw in the § 2 language.

Every match below was made by opening the SVG and reading the path, not by
filename. Where a DRAW row names a kit file, that file supplies the exact base
geometry the new glyph must inherit.

### 3.1 The six house-fixed action icons — must not be reassigned

| Name | Role | Verdict | Basis / construction |
|---|---|---|---|
| `Pencil` | edit | **DRAW** | No pencil in the kit. Butt-capped 45° body at 2.18 stem, mitred nib. Enclosure: **bare silhouette** (it is an object). |
| `Power` | deactivate | **DRAW** | Broken ring + vertical stem. Ring outer r 6 / inner r 3.82 per `search`'s wall; stem 2.18 from (14.175, 4.2). Enclosure: **disc-enclosed** (it is a mark). |
| `UserMinus` | remove | **DRAW** | Bare bust from `icons-open/account.svg` (head r 4.0 at (14.17, 9.6)); minus bar 2.18 × 8.0 badged per § 2.7. |
| `Ban` | revoke | **DRAW** | Ring (outer 6 / inner 3.82) + the § 2.7 slash. Note: **not** the full-bleed disc — a full-bleed Ban has no room for the slash to read. |
| `Plus` | create | **REUSE** | `plus.svg` — disc r 13.9 with a cross knocked out; arms 4.36 long, bars 2.18, all four ends butt. Snap the disc to r 14.175 on re-export. |
| `Upload` | import | **DRAW** | Mirror of `download.svg`'s arrow (round-capped shaft, 1.69 head steps) inside the same folder body; pull the stem to 2.18. |

### 3.2 The remaining 87

| # | Name | Verdict | Kit file / basis and what was seen |
|---|---|---|---|
| 1 | `AlarmClock` | DRAW | `clock.svg` face verbatim (disc r 14.175, hands 2.18, pivot fillet 1.09) + two bells. Bells must sit inside the 26.17 glyph extent, so the disc shrinks to r ≈ 11.5 for this one — record it. |
| 2 | `AlarmClockOff` | DRAW | As above + the § 2.7 slash. |
| 3 | `AppWindow` | **SUBSTITUTE** | `desktop.svg` — rounded frame, outer R 4.36 / wall 2.18 / inner r 2.18, plus a neck and a 5.55-deep base plinth. It is a **monitor**, not a titlebar'd window. Reviewer judges whether the plinth must go. |
| 4 | `ArchiveRestore` | DRAW | `Archive` body + an up-arrow head reusing Batch A's head geometry. |
| 5 | `Archive` | DRAW | Rounded box, R 4.36 / wall 2.18, with a full-width lid band 2.18 deep separated by a 2.18 gap. |
| 6 | `ArrowDown` | **REUSE** | `arrow-down.svg` — full-bleed disc; shaft 2.18 wide from y 7.63 to the head; head legs at 45° via 1.54 steps; apex round join r 1.09. |
| 7 | `ArrowLeft` | DRAW | Mirror `arrow-right.svg` about x = 14.175. New file, identical geometry. |
| 8 | `ArrowRight` | **REUSE** | `arrow-right.svg` — full-bleed disc, shaft `H7.63 v-2.18 h9.36`, head via 1.54 steps, apex `c.43.43.43,1.12,0,1.54`. |
| 9 | `ArrowUp` | DRAW | Rotate `arrow-down.svg` 180° about (14.175, 14.175). |
| 10 | `ArrowUpDown` | DRAW | Two opposed shafts, 2.18, in one disc. Shaft pitch 5.45 (borrow `chat`'s dot pitch so the pair sits at a kit interval). |
| 11 | `ArrowUpRight` | **REUSE** | `arrow-diagonal.svg` — disc with an L-bracket at top-right (fillet at (19.12, 10.32), arms 7.22) and a 45° shaft down-left. This is the out-arrow exactly. |
| 12 | `BadgeCheck` | DRAW | Scalloped rosette silhouette + the tick from `Check`, badged per § 2.7. |
| 13 | `Banknote` | **SUBSTITUTE** | `currency.svg` — full-bleed disc (28.45 box) with a generic currency mark knocked out: two 2.19 bars at y 10.94 and 15.32 crossed by a C-curve. Reads "money"; it is not a rectangular bill. |
| 14 | `Building2` | DRAW | Two abutting rounded blocks, R 4.36, with 2.18 window counters on a 5.45 pitch. |
| 15 | `CalendarClock` | DRAW | `calendar.svg` frame verbatim (outer R 4.38, wall 2.19, inner r 2.19, two 2.19 tabs above) + `clock.svg`'s hands badged per § 2.7. |
| 16 | `CalendarDays` | **SUBSTITUTE** | `calendar.svg` — the kit's calendar has an **empty body**, no day dots. Shipping it as `CalendarDays` is honest; adding dots would force all four calendar variants to gain them. Reviewer judges. |
| 17 | `CalendarRange` | DRAW | `calendar.svg` frame + a 2.19 range bar spanning two of three columns. |
| 18 | `CalendarSync` | DRAW | `calendar.svg` frame + the two-arrow cycle lifted from `feedback.svg`, scaled into the body. |
| 19 | `ChartNoAxesColumn` | **REUSE** | `bar-graph.svg` — three bars 7.09 wide, gaps 3.545, round tops r ≈ 2.95, flat bottoms, **no axes**. Literally this icon. |
| 20 | `Check` | DRAW | Bare tick, stem 2.18, both runs at 45°, round join at the vee, butt caps. **This is the set's most-copied part** — see § 5 sequencing. |
| 21 | `CheckCheck` | DRAW | Two `Check` ticks offset 5.45 in x. |
| 22 | `ChevronLeft` | DRAW | Bare 45° vee, stem 2.18, round join r 1.09, butt caps, arm length 7.09. |
| 23 | `ChevronRight` | DRAW | Mirror of the above. |
| 24 | `ChevronsUpDown` | DRAW | Two chevrons, pitch 5.45, apexes outward. |
| 25 | `CircleStop` | DRAW | Full-bleed disc r 14.175 + a rounded-square counter, side 11.34, corner r 2.18. |
| 26 | `ClipboardCheck` | DRAW | Clipboard body (R 4.36, wall 2.18) + clasp + `Check` badged. |
| 27 | `ClipboardCopy` | DRAW | Clipboard body + the offset-sheet motif from `Copy`. |
| 28 | `Clock` | **REUSE** | `clock.svg` — full-bleed disc; hands `M21.8,15.26 h-7.63 c…-1.09 V4.36 h2.18 v8.72 h6.54 v2.18Z`; stem 2.18, pivot fillet 1.09, hour to y 4.36, minute to x 21.8. |
| 29 | `Copy` | DRAW | Two sheets, R 4.36 / wall 2.18, offset **4.36** (2 stems) in x and y, the front one clearing the back by 2.18. This offset is the family constant for `ClipboardCopy`, `Archive`, `LibraryBig`. |
| 30 | `CornerDownRight` | DRAW | 2.18 run down then right, round join r 1.09 at the elbow (same construction as `arrow-diagonal`'s bracket), 1.54-step head. |
| 31 | `Download` | **REUSE** | `download.svg` — a **folder** (tab notch `h-8.56 c-.32,0-.62-.13-.84-.35 l-3.38-3.38`) with a round-capped down-arrow, shaft 2.38, head 1.69 steps. Re-export to 28.35 square (currently 33.43 × 28.66, renders 15 % small) and pull the stem to 2.18. |
| 32 | `ExternalLink` | DRAW | Open box (R 4.36 / wall 2.18, top-right corner missing) + `arrow-diagonal.svg`'s exact bracket and 45° shaft. **Same drawing as #74.** |
| 33 | `Eye` | DRAW | Lens almond from two 45°-tangent arcs, wall 2.18, pupil r 3.82 (borrowing `search`'s inner lens radius). |
| 34 | `EyeOff` | DRAW | `Eye` + the § 2.7 slash. |
| 35 | `FileSpreadsheet` | DRAW | `FileText` sheet + a 2.18-ruled 2×2 grid in the lower half. |
| 36 | `FileText` | DRAW | Sheet, R 4.36 / wall 2.18, folded top-right corner at 45° (side 5.45), three 2.18 rules on a 4.36 pitch. Family base for #35, #26, #27, #29, #51. |
| 37 | `GitBranch` | DRAW | Two 2.18 verticals joined by a 4.36-radius arc; three nodes at r 2.18 (dot d = 2 stems, larger than the § 2.6 punctuation dot because these are targets, not punctuation). |
| 38 | `Hammer` | DRAW | Bare silhouette; head block R 2.18, 45° handle at 2.18. |
| 39 | `History` | DRAW | `clock.svg` disc + a single counter-clockwise arc-arrow lifted from `feedback.svg` (see #71). |
| 40 | `Home` | DRAW | Roof as a 45° gable at 2.18 over a body of wall 2.18, R 4.36 at the two lower corners only. **Same drawing as #41.** |
| 41 | `House` | DRAW | Duplicate of `Home`. Ship both names, one path. Record in `iconSubstitutions`. |
| 42 | `Inbox` | DRAW | Tray: box R 4.36 / wall 2.18 with a 2.18 shelf broken by a central 8.72 notch. |
| 43 | `KeyRound` | DRAW | Ring outer r 6 / inner r 3.82 (`search`'s wall) + a 2.18 shaft with two 2.18 wards. |
| 44 | `Languages` | **SUBSTITUTE** | `globe.svg` — full-bleed disc with graticules and continents knocked out. A globe is the near-universal language switcher; it also rescues the kit's only globe from orphaning. There is no `Globe` in the 93. |
| 45 | `LibraryBig` | DRAW | Three vertical blocks, R 2.18, widths 5.45 / 5.45 / 7.09, gaps 2.18 — the shelf reading of the `Copy` offset family. |
| 46 | `LifeBuoy` | **SUBSTITUTE** | `help.svg` — full-bleed disc with a question mark knocked out: stem 2.18, dot r 1.09 at (14.18, 21.82). In this language, `help.svg` **is** the help mark. Strong substitution. |
| 47 | `Link` | DRAW | Two 45° capsule links, wall 2.18, overlapping by 4.36. |
| 48 | `Link2` | DRAW | Open variant of #47 — same two capsules, joined by a 2.18 bar instead of overlapping. |
| 49 | `ListOrdered` | DRAW | Three 2.18 rules on a 7.09 pitch + numerals set as 2.18 strokes in the left 7.09 column. |
| 50 | `ListTodo` | DRAW | Three 2.18 rules + three 5.45 checkboxes, R 2.18, wall 2.18. |
| 51 | `Loader2` | DRAW | Partial ring, outer r 6 / inner r 3.82 (wall 2.18), 270° sweep, butt terminals. Must stay a **single path** so `motion.css` can spin it. |
| 52 | `Lock` | DRAW | Body R 4.36 / wall 2.18; shackle a semicircular ring outer r 6 / inner r 3.82, butt terminals into the body. |
| 53 | `LogOut` | DRAW | Open bracket (three sides of a box, wall 2.18) + a right-pointing 2.18 shaft with a 1.54-step head. |
| 54 | `Mail` | **REUSE** | `mail.svg` — envelope, R 4.12, with a V-flap and a chevron fold; body 28.87 × 28.45. Re-export square. |
| 55 | `MailOpen` | DRAW | `mail.svg` body verbatim with the flap rotated open; must match its R 4.12 and fold angles exactly. |
| 56 | `MoreHorizontal` | DRAW | Three dots, **r 1.64 at cx 8.72 / 14.17 / 19.62, cy 14.175** — `chat.svg`'s exact dot geometry with the bubble removed. |
| 57 | `Package` | DRAW | Box R 4.36 / wall 2.18 with a 2.18 vertical seam and a 45° lid crease. |
| 58 | `Palette` | DRAW | Disc with a bitten edge (thumb-hole r 3.02, from `sprint`) + four r 1.64 dots on `chat`'s pitch. |
| 59 | `PanelLeftClose` | DRAW | Box R 4.36 / wall 2.18 + a 2.18 vertical divider at x 9.45 + a left-pointing chevron in the wide pane. |
| 60 | `PanelLeftOpen` | DRAW | As above, chevron reversed. |
| 61 | `Paperclip` | **REUSE** | `assets.svg` — read the path: a 45° ribbon with a 7.11-radius outer hook, a 5.14-radius mid hook and a 1.0-radius inner return. Structurally identical to the standard paperclip. Kwapso's filename says "assets"; the **form is a paperclip**. Pull its 1.42 steps to 1.54. |
| 62 | `PenLine` | DRAW | `Pencil` body + a 2.18 rule beneath it, gap 2.18. Must match `Pencil` exactly. |
| 63 | `PiggyBank` | DRAW | Bare silhouette; body a rounded blob, snout r 2.18, eye r 1.09, slot 2.18 × 5.45. |
| 64 | `Play` | DRAW | Solid triangle, apex at (21.5, 14.175), corners filleted r 1.09 to match the set's round joins. **Not** `quick-action.svg` — that is a lightning bolt. |
| 65 | `RefreshCw` | **SUBSTITUTE** | `feedback.svg` — full-bleed disc with **two curved arrows knocked out**, each terminating in a triangular head (`1.88 → 1.69 → 1.38` head chords), rotationally symmetric. Geometrically it is a refresh cycle; only the kit's *name* ("a feedback loop") differs. See § 4 for the consequence. |
| 66 | `RotateCcw` | DRAW | Exactly one half of `feedback.svg` — a single arc-arrow. Lift the arc radii and head chords verbatim. |
| 67 | `Route` | DRAW | Two nodes (r 2.18, matching `GitBranch`) joined by a 2.18 dogleg with 4.36-radius corners. |
| 68 | `Search` | **REUSE** | `search.svg` — full-bleed disc; lens ring outer r 6 / inner r 3.82 (wall 2.18) at (12.54, 12.54); handle a 45° bar at 2.18 via 1.54 steps ending (19.65, 21.19). |
| 69 | `SearchX` | DRAW | `search.svg`'s lens and handle + an X badged per § 2.7. |
| 70 | `Send` | **REUSE** | `deliverables.svg` — read the path: two lobes meeting at a 45° crease from (20.21, 9.47) to (11.98, 17.70), a 5.29/9.99 tail and a 9.99/5.29 wing. It is a **paper plane**. Kwapso's filename says "deliverables"; the form is Send. Pull its 1.45 crease step to 1.54. |
| 71 | `Settings` | **REUSE** | `settings.svg` — cog silhouette with hub counter r 5.47 at (13.93, 14.22). |
| 72 | `Settings2` | DRAW | Sliders: two 2.18 rules on a 7.09 pitch, each with a 5.45 × 4.36 handle at R 2.18. |
| 73 | `Share` | DRAW | Three nodes r 2.18 joined by two 2.18 runs — same node size as `GitBranch` and `Route`. |
| 74 | `SquareArrowOutUpRight` | DRAW | **Same drawing as #32 `ExternalLink`.** Ship both names, one path; record in `iconSubstitutions`. |
| 75 | `Shield` | DRAW | Bare silhouette; shoulders R 4.36, point at (14.175, 26.17), wall solid. |
| 76 | `ShieldOff` | DRAW | `Shield` + the § 2.7 slash. |
| 77 | `Sparkles` | **SUBSTITUTE** | `quick-action.svg` — a lightning bolt, 24.30 × 28.35, apex (15.68, 0.13), single closed silhouette with 1.01-radius fillets. It is the kit's own "quick action" mark and the assistant *is* the quick-action surface. **Judgement call** — the alternative is a DRAW four-point sparkle. Flagged in § 6. |
| 78 | `Timer` | DRAW | `clock.svg` face + a 2.18 crown stem and a 8.72 top bar. |
| 79 | `Trash2` | DRAW | Bin body R 2.18 / wall 2.18, lid bar 2.18 with a 5.45 handle, two 2.18 interior rules. |
| 80 | `TriangleAlert` | DRAW | Triangle silhouette, corners filleted r 2.18, with a 2.18 bar and an r 1.09 dot knocked out (the dot is `help.svg`'s exact punctuation dot). |
| 81 | `Undo2` | DRAW | 2.18 run with a 4.36-radius return bend and a 1.54-step head. |
| 82 | `UserCheck` | DRAW | Bare bust from `icons-open/account.svg` (head r 4.0 at (14.17, 9.6)) + `Check` badged. |
| 83 | `UserPlus` | DRAW | Bare bust + a plus badged; plus arms 4.36 at 2.18, matching `plus.svg`. |
| 84 | `UserRound` | **REUSE** | `account.svg` — full-bleed disc with head r 6 at (14.18, 9.81) and a shoulder arc knocked out (`M5.66,22.62c2.07-2.59,5.2-4.09,8.51-4.09,3.31,0,6.44,1.5,8.51,4.09`). |
| 85 | `Users` | DRAW | Two bare busts from `icons-open/account.svg`, the rear one clipped by a 1.09 clearance. |
| 86 | `Video` | DRAW | Body R 4.36 / wall 2.18 + a 45° lens wedge on the right, apex clearance 2.18. |
| 87 | `X` | DRAW | Two 45° runs at 2.18 crossing at (14.175, 14.175), arms 7.09, butt caps. No fillet at the crossing — see `plus.svg`, which has none. |

### 3.3 Verdict totals

| Verdict | Count |
|---|---|
| REUSE | **13** — Plus, ArrowDown, ArrowRight, ArrowUpRight, ChartNoAxesColumn, Clock, Download, Mail, Paperclip, Search, Send, Settings, UserRound |
| SUBSTITUTE | **7** — AppWindow, Banknote, CalendarDays, Languages, LifeBuoy, RefreshCw, Sparkles |
| DRAW | **73** |
| **Total** | **93** ✔ |

20 of the 30 kit glyphs find a commission home. 10 do not — § 4.

---

## 4 · Kit glyphs with no commission name

These are kwapso vocabulary the commission does not ask for. **Flagged, not
decided** — the fate of each is a ruling, not my call.

| Kit file | What it actually is (read from the path) | Why it is orphaned |
|---|---|---|
| `audit.svg` | Two overlapping rounded sheets (R 2.55 / 2.82) with a magnifier over them, lens r 2.53, handle 1.97 | No "audit"/"review"/"inspect" name in the 93. The `RecordDetail` collection has an **audit footer** (commission § 7) with nothing to mark it. |
| `bookmark.svg` | Ribbon, 22.33 × 28.45, notched bottom (apex at y 21.62), square top | No `Bookmark` in the 93. |
| `bug.svg` | Insect: body, six legs at 2.06–2.14, two antennae, no head counter | No `Bug` in the 93. |
| `chat.svg` | Full-bleed disc, speech tail at the lower-left (the 4.58/1.78 tab), three dots r 1.64 | **The sharpest loss.** Four conversation collections — `Chat`, `Comments`, `TicketThread`, `AgentChat` — and the 93 contain **no message/chat icon at all**. |
| `goal.svg` | Flagpole 2.17 wide, full height, with a wavy pennant | No `Flag`/`Goal`/`Target`. `StatusStepper` and `ProgressDashboard` have nothing to mark a terminal stage. |
| `like.svg` | Heart, 30.71 × 28.35, two 8.56-radius lobes | No `Heart`/`ThumbsUp`. |
| `sector-graph.svg` | Donut/pie: a 12.46-radius body with a quadrant sector exploded out (the 15.26/13.08 split) | The `Chart` collection is specified as "bar, line, area" only — no pie. |
| `sprint.svg` | Rocket with a porthole r 3.02 at (18.13, 10.07) and a 9.07-radius exhaust bloom | No `Rocket`. Also: "sprint" is product vocabulary, banned in tiers 0–2 by commission § 11, so it could not keep its name regardless. |
| `star.svg` | Five-point star, 29.67 × 28.35, points on a 36°/72° construction | No `Star` in the 93 — **but the `rating` primitive (commission § 6) cannot be built without one.** |
| `tag.svg` | Tag, R 4.18, eyelet r 1.57 at (5.74, 5.74) | No `Tag`/`Label`. `Badge` has 59 direct calls and no mark. |

**The whole `icons-open/` tier is orphaned too.** All 7 outline variants
duplicate a filled name and the commission never asks for an outline treatment.
Note that 2 of those 7 (`chat`, `sector-graph`) are outline variants of glyphs
that are *themselves* orphaned — so those two forms disappear twice over.

### 4.1 Names the components will want that the 93 do not contain

Not orphans, the reverse: gaps in the commission's own list, surfaced here
because a drawing agent will hit them.

| Missing | Wanted by |
|---|---|
| `ChevronDown` / `ChevronUp` | `Accordion` (16 calls), `Select` (43), `DropdownMenu` (35), `Collapsible`, `Tabs`. The list has `ChevronLeft`, `ChevronRight`, `ChevronsUpDown` but no plain down-chevron — the most-needed disclosure mark in the library. |
| `Star` | `rating` primitive |
| a message/bubble mark | `Chat`, `Comments`, `TicketThread`, `AgentChat` |
| `Filter` / `SlidersHorizontal` | `FilterBar`, `SearchableFacet`, `RangeFacet` (`Settings2` may cover it) |
| `GripVertical` | `Kanban` draggable cards |
| `Minus` | `Checkbox` indeterminate state |

These are the commission's gaps, not the kit's. Record in `notDelivered` or
raise them before drawing starts — the drawing cost of six more glyphs is
trivial; discovering them after the batches close is not.

---

## 5 · The DRAW list in four batches

73 glyphs, grouped by **form family** so that within-family consistency
survives being split across four agents. Every agent works from § 2 and from
the base files named in § 3.

### Batch A — Directional and rotational · 18

`ArrowLeft` `ArrowUp` `ArrowUpDown` `ChevronLeft` `ChevronRight`
`ChevronsUpDown` `CornerDownRight` `Undo2` `RotateCcw` `History` `Upload`
`ExternalLink` `SquareArrowOutUpRight` `Share` `LogOut` `PanelLeftClose`
`PanelLeftOpen` `GitBranch`

**Why together.** Every one is a shaft, an arrowhead, a chevron vee or an arc
at stem 2.18. They share the 1.54 diagonal step, the r 1.09 round join at the
apex, the butt terminal, and — critically — **the enclosure decision**: the
kit's three existing arrows are all disc-enclosed, so this agent decides once
whether the new arrows and chevrons follow, and everything downstream inherits
that. Split across agents, the arrowheads would not match.

**Publishes for other batches:** the canonical arrowhead (consumed by C's
`ArchiveRestore`) and the arc-arrow (consumed by D's `CalendarSync`).

### Batch B — Marks, people and state · 18

`Check` `CheckCheck` `X` `BadgeCheck` `Ban` `CircleStop` `Play` `Loader2`
`MoreHorizontal` `UserCheck` `UserPlus` `UserMinus` `Users` `Power` `Shield`
`ShieldOff` `Eye` `EyeOff`

**Why together.** Two reasons. First, `Check` and `X` are the badge marks that
five other glyphs across three batches overlay — one hand must fix the tick's
vee angle and arm ratio. Second, `Power` / `Shield` / `ShieldOff` / `Ban` /
`Loader2` / `CircleStop` are all the same construction: a closed or broken loop
of wall 2.18 with something crossing it, and they will only look like siblings
if drawn together. The four bust glyphs (`UserCheck` / `UserPlus` /
`UserMinus` / `Users`) all derive from one base and must not be separated.

**Sequencing dependency:** Batch B ships `Check` and `X` **first** and
publishes both paths; Batch C's `ClipboardCheck` and Batch D's `SearchX` and
`ListTodo` consume them verbatim.

### Batch C — Containers, sheets and boxes · 18

`FileText` `FileSpreadsheet` `Copy` `ClipboardCopy` `ClipboardCheck`
`LibraryBig` `Archive` `ArchiveRestore` `Package` `Inbox` `MailOpen` `Trash2`
`Home` `House` `Building2` `Video` `Palette` `Lock`

**Why together.** Every one is a rounded-rect or roofed body at outer R 4.36 /
wall 2.18 / inner r 2.18. One hand fixes the sheet proportion and the
**4.36 two-sheet offset** used by `Copy`, `ClipboardCopy`, `Archive` and
`LibraryBig` — the most visible family tell in the whole set. `MailOpen` must
match `mail.svg`'s R 4.12 and fold angles exactly, so it belongs to the
container hand rather than a mail hand. `Home` and `House` are one drawing
under two names and must not be drawn twice.

### Batch D — Time, calendars, lists, tools · 19

`AlarmClock` `AlarmClockOff` `Timer` `CalendarClock` `CalendarRange`
`CalendarSync` `ListOrdered` `ListTodo` `SearchX` `Link` `Link2` `Route`
`TriangleAlert` `PiggyBank` `Settings2` `Pencil` `PenLine` `Hammer` `KeyRound`

**Why together.** All four calendar variants sit here so the frame from
`calendar.svg` is applied by one hand — split, they would drift. All three
clock-derived glyphs (`AlarmClock`, `AlarmClockOff`, `Timer`) sit with them
because they share the same host-plus-attachment problem: the disc must shrink
to make room, and it must shrink by the same amount in all three. `Pencil` and
`PenLine` are one body and a rule, inseparable. `Link` / `Link2` / `Route` are
the capsule-and-node family. The remainder (`TriangleAlert`, `PiggyBank`,
`Settings2`, `Hammer`, `KeyRound`) are singletons with no family, distributed
here to balance the count.

### Batch balance

| Batch | Count | Shared constant it owns |
|---|---|---|
| A | 18 | arrowhead, 1.54 step, arc-arrow, arrow enclosure decision |
| B | 18 | the tick, the X, the loop-and-crossing construction, the bust |
| C | 18 | R 4.36 / wall 2.18 body, the 4.36 two-sheet offset |
| D | 19 | the calendar frame, the clock-plus-attachment shrink |
| **Total** | **73** ✔ | |

**Cross-batch constants defined once in § 2 so no agent invents them:** the
45° slash (§ 2.7) used by B's `Ban`/`EyeOff`/`ShieldOff` and D's
`AlarmClockOff`; the badge placement (§ 2.7) used by all four; the node dot
r 2.18 used by A's `GitBranch` and D's `Route` and B-adjacent `Share`; the
punctuation dot r 1.09 used by D's `TriangleAlert`.

---

## 6 · Where the kit contradicts itself, or is silent

Recorded per the repo's no-invention rule. Items 1–3 are contradictions; 4–7
are silences with a labelled recommendation attached above.

1. **`fill: currentColor` is documented but not shipped.** `assets/README.md:6`
   describes the set as `fill: currentColor`. **Zero of 37 files contain a
   `fill` attribute.** 23 carry `class="cls-1"` against an empty `<defs>`; the
   other 7 carry nothing. They all render black. *New.* Fix: add
   `fill="currentColor"`, strip the dead class and `<defs>`.

2. **"The 28.45 grid" vs the actual viewBoxes.** The kit's iconography kicker
   says "Filled · 28.45 grid". Two of 30 files are 28.45 on both axes; ten are
   28.35 square; the range is 22.23–33.43 wide and 27.68–28.66 tall. Already
   logged upstream as **GAP-F1-1**, still open. Resolved here by
   recommendation (§ 2.1: 28.35 square, re-export all).

3. **Stem weight is not uniform across the two tiers.** Filled set: **2.18**
   (25 occurrences) / **2.19** on the 28.45 artboard (21 occurrences) — the
   same 0.0769 ratio, so consistent. `icons-open/`: **2.40–2.50**, 10–15 %
   heavier, on a much smaller optical area. Within the filled set,
   `download` (2.02 normalised), `audit` (1.97) and `deliverables` (2.05) are
   light. *New.* Fix listed in § 2.1.

4. **No stated icon corner radius.** Ruling 03 governs UI boxes, not glyph
   interiors. Not stated by the kit. Derived from measurement instead: round
   join at r 1.09, container R 4.36 (§ 1.5, § 1.6).

5. **No stated safe area.** § 1.8 shows there is none in practice.
   Recommendation in § 2.2 (26.17 glyph extent, 28.35 container extent).

6. **Size steps: four in the kit, five in the commission.** The kit fixes
   16 / 20 / 24 / 32 (GAP-F1-2); the commission adds **22**, which appears in
   the kit's markup but is off-scale and untokenised (GAP-F1-3). Not a blocker
   — all five are the same drawing scaled — but it should be ruled.

7. **RTL: ruling 10 says out of scope; the commission's manifest sketch says
   `"rtl": true`.** Fourteen icons are directional. Recommendation in § 2.10
   (draw LTR, mirror at runtime). Needs a ruling before Batch A starts.

### Two judgement calls a reviewer should look at before drawing begins

- **`Sparkles` ← `quick-action.svg`** (a lightning bolt). Justified by role —
  the bolt is the kit's own quick-action mark and the assistant is the
  quick-action surface — but "sparkles" is a strong AI convention and a
  reviewer may want a four-point sparkle drawn instead. Cheap to reverse now;
  expensive after Batch B closes.
- **`CalendarDays` ← `calendar.svg`** (empty body, no day dots). Adding dots
  would force all four calendar variants to gain them and would change a REUSE
  into a redraw. Decide before Batch D starts.

### One ruling-34 note

Ruling 34 — *"one icon per module, for life; modules are never identified by a
letter"* (`assets/README.md:8`) — is about the 18 permission modules, not about
the 93 names, and none of the 93 is a module mark. But the 93 do contain **two
pairs that resolve to a single drawing**: `Home` / `House`, and
`ExternalLink` / `SquareArrowOutUpRight`. Both must ship under both names, one
path each, recorded in `manifest.json` → `iconSubstitutions`.

---

*Analysis only. Measured against `design-mothership` `assets/icons` (30) and
`assets/icons-open` (7) on 2026-08-22. Every value marked [measured] is read
from the source; every value marked [recommendation] is not the kit's.*
