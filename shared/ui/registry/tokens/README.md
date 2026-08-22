# Layer 0 — Tokens

The single source of truth for every visual value in Swift Struck UI: colors, radii,
surfaces, and (later) spacing and typography scales.

> **Re-skinning this library?** Read the
> [contrast checklist](#re-skinning-the-contrast-checklist) below **before** you
> ship. Swapping token values is a five-minute edit that can silently break
> readability across every page.

## Where they live

The canonical tokens are defined as CSS variables in
[`styles.css`](../../styles.css) at the repo root, inside the `:root` / `.dark` /
`@theme` blocks. This folder holds any **TypeScript** token helpers that
components need to read at runtime (e.g. a typed list of theme names, or
platform-specific token maps for the future native skins).

## The one rule

- Nothing here imports a primitive or a collection. Tokens are the root of the
  dependency graph. (`npm run guardrails` enforces this.)

## How other layers use tokens

Components reference tokens through Tailwind utilities, never raw values:

```tsx
// ✅ resolves to a token — re-themes for free
<div className="bg-background text-foreground rounded-lg" />

// ❌ never do this — invisible to theming, a future migration headache
<div style={{ background: "#ffffff", borderRadius: "10px" }} />
```

Adding a new token means editing root `styles.css` once. Every consumer updates
automatically.

---

# Re-skinning: the contrast checklist

Because tokens are the only source of truth, a re-skin is just new values in
`styles.css` — no component changes. That is the point, and it is also the risk:
**a token you think of as "the brand colour" is rendered as body text somewhere.**

This is not hypothetical. A fork of this library changed only the token values
and the icon set — 5 lines of visible text differed across three pages — and
produced **209 failing-contrast text nodes** in light mode. The worst was a pale
yellow `--primary` at **1.30:1**, because `--primary` is what
[`article-body`](../collections/article-body/article-body.tsx) uses for **link
text**.

Light mode is the tight one. Dark mode has more headroom, but check both.

## Which tokens carry a floor

| Token                                        | Rendered as                                                            | Floor     | Measured against                                     |
| -------------------------------------------- | ---------------------------------------------------------------------- | --------- | ---------------------------------------------------- |
| `--foreground`                               | body text                                                              | **4.5:1** | `--background`                                       |
| `--card-foreground` · `--popover-foreground` | text on those surfaces                                                 | **4.5:1** | `--card`/`--popover`                                 |
| `--muted-foreground`                         | secondary text, captions, chart axis **and legend** labels (~105 uses) | **4.5:1** | the **tinted** surface it sits on — see trap 2       |
| `--primary`                                  | **link text**, active tab/step labels, selected state, checked marks   | **4.5:1** | `--background`                                       |
| `--success` · `--destructive`                | inline status text and icons                                           | **4.5:1** | `--background`                                       |
| `--warning-strong`                           | warning **text and icons** on a light surface (e.g. "3 issues")        | **4.5:1** | `--background`                                       |
| `--warning`                                  | warning **fill** only — badge/stepper/dot background, never text       | **4.5:1** | its own label, `--warning-foreground` — not the page |
| `--accent-foreground`                        | text on `--accent`                                                     | **4.5:1** | `--accent`                                           |
| `--*-foreground` on a solid fill             | label inside a filled Button/Badge                                     | **4.5:1** | its **own fill**, not the page                       |
| `--ring`                                     | focus ring — the only visible focus affordance                         | **3:1**   | both the field **and** the page behind it            |
| `--chart-1` … `--chart-5`                    | bars, areas, pie slices, rating stars, calendar dots — **never text**¹ | **3:1**   | `--background` (and each other, for adjacent slices) |

¹ Only because the chart component forces it. Recharts colours legend labels
with the series colour unless you override it — see trap 4.

**No floor** (these are the _denominator_, not the numerator): `--background`,
`--card`, `--popover`, `--muted`, `--secondary`, `--accent`. Darkening any
surface silently lowers every ratio above it, so re-run the check after you
touch one.

`--border` / `--input` sit in between. As used here a control is also identified
by its fill and label, so no hard floor applies — but if your skin makes the
border the _only_ affordance for an input, WCAG 1.4.11 pulls it to **3:1**.

## Four traps

1. **Text floors and graphics floors are different — don't collapse them.**
   Darkening the chart palette to 4.5:1 "to be safe" turns an amber accent to
   ochre for **zero** accessibility gain (we did exactly this in v0.9.2 and
   reverted it in v0.9.4). Keep graphics tokens ≥ 3:1 and no further. The
   converse is the real danger: the amber we started with was **2.13:1** and
   failed even the graphics floor.
2. **Measure `--muted-foreground` on your tinted surfaces, not on white.** This is
   the one that hides. Ours read a comfortable 4.73:1 on plain white while
   **failing at 4.14–4.35:1** on the surfaces it actually sits on — a hovered list
   row, a chat bubble, an inactive tab, a command-menu highlight. 198 of 207 nodes
   passed; the 9 that mattered were invisible to a check against `--background`.
   Fixed in v0.9.5 by darkening the token to `oklch(0.525 0 0)`.
3. **A fill tone and a text tone are two different tokens.** `--warning` is a
   _fill_: a badge background with near-black `--warning-foreground` on top, which
   is fine. As **text** on a light surface the same amber is **1.92:1** — unusable.
   So the library carries a separate `--warning-strong` for warning text and
   icons. If your skin has a light accent colour, it needs the same split; don't
   darken the fill to fix the text, or you lose the fill's own pairing.
4. **A dependency can turn your fill token into text without you writing a line.**
   Auditing our own components said the chart palette was graphics-only, so it
   sat at the 3:1 floor. Recharts then coloured its **legend labels** with the
   series colour by default — putting `--chart-2` into 12px text at **3.05:1** and
   `--chart-1` at 4.07:1. Nothing in our source asked for it. The chart component
   now pins the legend label to `--muted-foreground` and lets the swatch keep the
   series colour. **Audit the rendered page, not just your own JSX** — the console
   snippet below reads whatever actually shipped, third-party defaults included.

## How to check your own values

Paste this into the browser console on your themed site. It reads the **resolved**
token values, rasterises them (a naive `oklch()` string parse gets this wrong),
and prints pass/fail per floor. Run it once in light mode and once in dark.

```js
;(() => {
  const FLOOR = {
    foreground: 4.5,
    "card-foreground": 4.5,
    "popover-foreground": 4.5,
    "muted-foreground": 4.5,
    primary: 4.5,
    success: 4.5,
    destructive: 4.5,
    "warning-strong": 4.5, // the TEXT tone; --warning is a fill, see trap 3
    "accent-foreground": 4.5,
    ring: 3,
    "chart-1": 3,
    "chart-2": 3,
    "chart-3": 3,
    "chart-4": 3,
    "chart-5": 3,
  }
  const cx = document.createElement("canvas").getContext("2d")
  const rgb = (c) => {
    cx.fillStyle = "#000"
    cx.fillStyle = c.trim()
    cx.fillRect(0, 0, 1, 1)
    const d = cx.getImageData(0, 0, 1, 1).data
    return [d[0], d[1], d[2]]
  }
  const lum = ([r, g, b]) => {
    const f = (v) =>
      (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }
  const cs = getComputedStyle(document.documentElement)
  const bg = rgb(cs.getPropertyValue("--background"))
  console.table(
    Object.entries(FLOOR).map(([t, floor]) => {
      const r = ratio(rgb(cs.getPropertyValue("--" + t)), bg)
      return { token: "--" + t, ratio: +r.toFixed(2), floor, ok: r >= floor }
    })
  )
})()
```

It compares everything to `--background`, which is the right denominator for most
tokens and a close-enough one for the rest. For the two cases it can't see —
`--muted-foreground` on a tinted card, and a `*-foreground` on its own fill —
sample the two real colours off the rendered page and compare those directly.

Then spot-check by eye: **links, placeholder text, chart axis labels, disabled
states, and the focus ring**. Those are where the failures actually land.

## Where our own values stand

Light mode, measured on the live site with the snippet above. Dark mode sits
comfortably at 5.7–10:1 throughout.

**Every token carrying a floor now clears it.** As of v0.9.5 there are no known
gaps — if you find one, it's a bug, not accepted debt.

| Token                  | Value     | vs `--background` | Floor |      |
| ---------------------- | --------- | ----------------- | ----- | ---- |
| `--foreground`         | `#0a0a0a` | 19.80:1           | 4.5   | ✅   |
| `--accent-foreground`  | `#003732` | 13.19:1           | 4.5   | ✅   |
| `--muted-foreground`   | `#6a6a6a` | 5.39:1            | 4.5   | ✅   |
| `--warning-strong`     | `#946a00` | 4.88:1            | 4.5   | ✅   |
| `--destructive`        | `#e7000b` | 4.77:1            | 4.5   | ✅   |
| `--primary` / `--ring` | `#0a8379` | 4.63:1            | 4.5   | ✅   |
| `--success`            | `#008839` | 4.58:1            | 4.5   | ✅   |
| `--chart-1`            | `#0d8d82` | 4.08:1            | 3     | ✅   |
| `--chart-3`            | `#3a84ca` | 3.94:1            | 3     | ✅   |
| `--chart-4`            | `#be64d2` | 3.53:1            | 3     | ✅   |
| `--chart-5`            | `#47a34e` | 3.17:1            | 3     | ✅   |
| `--chart-2`            | `#ce8300` | 3.06:1            | 3     | ✅   |
| `--warning` (fill)     | `#eab312` | 1.92:1            | —\*   | ✅\* |

\* `--warning` is a **fill**, so the check that matters is its own label sitting on
it: `--warning-foreground` on `--warning` is **9.33:1**. Its 1.92:1 against the
page is not a text failure — it's why `--warning-strong` exists (trap 3). One
caveat to carry into your own skin: where a `bg-warning` **dot** appears with no
text beside it, that low page-contrast is doing real work, so keep such dots
paired with a label rather than relying on colour alone.

`--muted-foreground` is the one to re-check by hand, because the table above
measures it against `--background` and that is not where it fails. On the tinted
surfaces it actually sits on it reads **4.71:1** (hovered list row), **4.82:1**
(command-menu highlight) and **4.95:1** (chat bubble / `--muted`) — all clear,
but all lower than the 5.39 the table shows.

### Labels on fills (light)

The other check the table can't do. Each is measured against its own fill:

| Pair                                          | Ratio  |     |
| --------------------------------------------- | ------ | --- |
| `--warning-foreground` on `--warning`         | 9.33:1 | ✅  |
| `--destructive-foreground` on `--destructive` | 4.76:1 | ✅  |
| `--primary-foreground` on `--primary`         | 4.62:1 | ✅  |
| `--success-foreground` on `--success`         | 4.57:1 | ✅  |

Those top out where they do because the fills are already at the text floor
against the page; the labels are **pure white** (`oklch(1 0 0)`) rather than the
conventional off-white `0.985`, which was worth ~0.2 and moved `--primary` and
`--success` from failing to passing. If you re-skin, don't "tidy" them back to
off-white.

### Labels on fills (dark) — closed

Dark mode is comfortable for text on the page (5.7–19:1). Two **filled** controls
were not, and are now fixed: `--primary-foreground` on the dark `--primary` was
**3.30:1** and `--destructive-foreground` on the dark `--destructive` was
**2.77:1**, both carrying a near-white label. They now carry the _near-black_
foreground that dark `--success` and `--warning` always used:

| Pair                                               | Ratio   |     |
| -------------------------------------------------- | ------- | --- |
| `--warning-foreground` on dark `--warning`         | 10.44:1 | ✅  |
| `--success-foreground` on dark `--success`         | 7.07:1  | ✅  |
| `--destructive-foreground` on dark `--destructive` | 6.19:1  | ✅  |
| `--primary-foreground` on dark `--primary`         | 5.20:1  | ✅  |

The general rule, worth carrying into your own skin: **a bright fill in a dark
theme wants a dark label.** Dark-mode brand fills are usually _lighter_ than
their light-mode counterparts, so the label that worked in light mode is often
exactly wrong here. Check every fill/label pair in both modes, not one.
