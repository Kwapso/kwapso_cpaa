# app-icons

**Complete.** Two masters from the client, and a full derived set per door.

    app-icon-system.png   3000 x 2997   #0B0D0F field, reversed mark
    app-icon-portal.png   3000 x 2997   #FECC6D field, charcoal mark

Both are opaque, field to the edge. The client sent two, which answered "one
set or two" as **two**, and ruling 09 agrees: *"Mango tile with the charcoal
isotype for the client portal; charcoal tile with the mango isotype for the
agency app."*

## What is derived, in `system/` and in `portal/`

| file | size | notes |
|---|---|---|
| `favicon.svg` | vector | field colour and mark placement measured off the PNG master, drawn with the vector isotype. There is no app-icon SVG master, so this is a reconstruction — and every number in it came off the client's own file. |
| `favicon.ico` | 32 + 16 | a **real** ICO with 32-bit DIB entries, not a renamed PNG |
| `apple-touch-icon.png` | 180 | **no alpha channel at all**, flattened on the kit's off-beige `#FFFEF9` rather than pure white |
| `icon-192.png` | 192 | PWA manifest |
| `icon-512.png` | 512 | manifest, and the splash source on Android |
| `maskable-512.png` | 512 | full-bleed field. No extra padding: measured, the mark occupies the middle **55.5%**, comfortably inside the 80% Android crops to |

Regenerate with `node assets/build-assets.mjs`. Do not hand-edit anything in
`system/` or `portal/` — the next run overwrites it.

## Where they are wired

`demo/index.html` wears the **system** set, `mini-app/index.html` the
**portal** set, each with a `theme-color` matching its field — ruling 09: *"The
browser and manifest theme colour follows the icon, so a pinned tab reads as
the right door."* Two different sets across the two pages on purpose, so the
"one set or two" decision can be made with both in a tab bar at once.

## The one open question

`favicon.svg` carries **no** `prefers-color-scheme` block. That is deliberate,
not an omission: the client asked for "smaller versions of the app icons", and
an app icon is a full-bleed field, so the tab's own colour never touches the
mark and a media query would have to invent a second colourway the brand does
not have. If the favicon should instead be a bare mark that flips black and
reversed with the tab, that is a small change. `UPLOAD.md` §5.
