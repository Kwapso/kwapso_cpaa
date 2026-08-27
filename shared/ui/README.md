# kwapso-design

The kwapso design system as **React + TypeScript source**. Tokens, icons,
motion and components that two production Next.js apps vendor directly.

*"Work, structured."*

---

## What this is, and what the last attempt got wrong

A previous handover delivered a *specification* — tokens, rulings, prose and
CSS classes with plain-HTML demo pages. It was rigorous and it could not be
installed, because a CSS class is not a React component. The apps got
re-coloured and kept their old shape.

The test for everything here is one sentence:

> An engineer deletes the old component folder, drops this one in its place,
> changes no application code, and both apps run and look completely new.

**Their names, our values.** Every custom property and every export is spelled
exactly as the applications already read it, so `manifest.json`'s
`renamedFrom` is empty and nothing needs a bridge. The *values* are the kwapso
kit's.

## Using it

```bash
npm install
npm run check      # tokens + icons + tsc, all three gates
npm run dev        # the demo
```

```css
@import "kwapso-design/tokens/tokens.css";
@import "kwapso-design/motion/motion.css";
```

The two CSS paths did **not** move. `tokens/`, `icons/` and `motion/` are the
foundations and the agreed structure groups them under a `foundations/`
folder; that move is not made yet, because thirteen decision pages under
`verify/` link `tokens/tokens.css` directly and those pages are the record of
what the client was looking at when they ruled.

```tsx
import { Button } from "kwapso-design/controls/button/button";
import { DataTable } from "kwapso-design/structures/data-table/data-table";
import { MainScreen } from "kwapso-design/compositions/templates";
import { Pencil } from "kwapso-design/icons";
```

### THE IMPORT PATHS MOVED ON 2026-08-24 — the whole table

The folders were renamed to the four words the client uses. **No export was
renamed** except the two named at the foot, and nothing changed what it does.
Rewrite an app's imports with these six rules and it compiles.

| was | is |
|---|---|
| `components/primitives/<x>/<x>` | `controls/<x>/<x>` |
| `components/collections/<x>/<x>` | `structures/<x>/<x>` |
| `components/lib/utils` | `lib/utils` |
| `compositions/shapes` · `compositions/shapes/<x>` | `compositions/templates` · `compositions/templates/<x>` |
| `compositions/system/<x>` · `compositions/portal/<x>` | **gone.** Four of each survive as `compositions/screens/<x>` — see below |
| `compositions/screens/<x>` | one of `compositions/screens/` · `compositions/overlays/` · `compositions/states/` |

Four moved ACROSS tiers rather than just down a path:

| was | is |
|---|---|
| `components/primitives/map/map` | `structures/map/map` |
| `compositions/screens/notifications` → `NotificationsScreen` | `controls/notifications/notifications` → **`Notifications`** |
| `compositions/shapes/portal-conversation` | `structures/portal-conversation/portal-conversation` |
| `compositions/system/t` → `RecordRoute` | `compositions/templates/record-route` → `RecordRoute` |

And four route files were renamed as they became screens:

| was | is |
|---|---|
| `compositions/system/login` | `compositions/screens/sign-in-system` |
| `compositions/portal/login` | `compositions/screens/sign-in-portal` |
| `compositions/portal/home` | `compositions/screens/portal-home` |
| `compositions/portal/root` | `compositions/screens/portal-boot` |

**The cheapest migration is the barrels.** `compositions/index.ts` re-exports
all four folders, so `import { MainScreen, QuickView, ArchiveScreen } from
"kwapso-design/compositions"` resolves whichever of the four a name lives in
and an app never has to know. Importing the folder directly is cheaper at
build time and is what application code should settle on.

**TWO EXPORTS CHANGED NAME, and only two.** `NotificationsScreen` is now
`Notifications` (it is a control, and the panel is all that is left of it —
read its header), and `NotificationsScreenProps` is `NotificationsProps`.

**ONE EXPORT IS AMBIGUOUS AND THE TOP BARREL PICKS FOR YOU.** `IMPORT_STEPS`
is exported by both `compositions/templates/import-flow` and
`compositions/overlays/import`, because import is written three times in this
repository. `compositions/index.ts` exports the template's. Import the folder
directly if you want the other.

**24 FILES WERE DELETED**, 11,731 lines of example pages — every collection
route and every detail route. If an app imported one of them it now builds
the screen from `compositions/templates`, which is the point of the change.
`AccountsRoute`, `AppsRoute`, `TicketsRoute` and the twenty-one others are
gone and are not coming back.

Light and dark come along automatically. Pin a theme with `data-theme="light"`
or `"dark"` on `<html>`; leave it off to follow the system. Move the text size
with `data-scale="small" | "medium" | "large"`.

## Layout

```
tokens/       tokens.css is the ONLY file where a colour or a size is decided
icons/        1,383 React exports — the Iconoir pack (MIT), drawn as
              strokes on a 24 grid. The commission's 96 spellings are
              aliases onto it; see icons/ATTRIBUTION.md
motion/       100 rules, all 16 of the commission's motion cases
assets/fonts/ Saans and SerrifCondensed — the client's real type, shipped
              here as .woff2 (what browsers fetch) with the .otf/.ttf masters
              beside them. `LicenseAgreement.pdf` is the paper record: the
              client confirmed in writing on 2026-08-24 that the licence
              permits redistribution inside this repo and that both consuming
              apps are internal. Nobody read the PDF and nobody needs to —
              that decision is the client's and it is made. The @font-face
              block lives in tokens/tokens.css §5.0; `build-fonts.mjs`
              regenerates the .woff2 if a new cut ever arrives.
controls/      67 components — the primitives. One folder each
structures/    42 collection views — tables, boards, threads, gantt, heat,
               timeline, map. The things that draw MANY records
lib/           the cn helper and use-has-room
compositions/  the client: "everything currently compositions/xyz is
               compositions (and then sections inside of it)"
  templates/   15 — the SHAPE of a screen with nothing product-specific in
               it. MainScreen, DetailScreen, the shell, the rail. THIS IS
               WHAT THE KIT SHIPS INSTEAD OF ONE FILE PER COLLECTION
  screens/     17 — the finished pages the client named as exceptions:
               home, settings, profile, onboarding, brand, company hub, the
               external doors
  overlays/    8 — what opens OVER a screen rather than replacing it
  states/      5 — the same screen with nothing in it
docs/          RULES · BUILD-A-COMPONENT · BUILD-A-SCREEN · TOKENS ·
               ARTIFACT-MAP — all five delivered
demo/          four views: foundations · controls · structures · compositions
verify/        decision artefacts and a smoke build — NOT delivered
KWAPSO-SPEC.md the artifact, verbatim. The king. Its OVERRIDE REGISTER lists
               every place a client decision beats the artifact text — read it
               before "correcting" the build back to a chapter.
manifest.json  the machine-checkable contract
GAPS.md        every unresolved question and every ruling, with reasoning
```

## Four rules that are easy to break by accident

1. **No px in a component.** Everything is rem against a 16px authoring base;
   the root renders at 15px and a user control moves it to 13 or 17.
2. **No colour defined only inside a media query.** Light lives on bare
   `:root`; dark is defined twice, once under `prefers-color-scheme` and once
   under `[data-theme]`. `build-tokens.mjs` fails if the two drift.
3. **Disabled is a fill and an ink. Hover is a token.** Never an opacity.
4. **Focus is one global rule.** No component defines a ring, and nothing sets
   `outline: none`.

## Status

Commission steps 1–6 delivered; 7 and 8 in progress. This repo previously held
the specification-era kit (tags v0.1.0–v0.3.0); `assets/` is carried forward
from it, everything else is superseded.

| | |
|---|---|
| Tokens — 276, both palettes, three scales | done |
| Icons — 1,383 exports, six sizes | done — Iconoir (MIT) |
| Motion — 100 rules | done |
| Controls — 67 | done |
| Structures — 42 | done |
| Compositions — 45: 15 templates · 17 screens · 8 overlays · 5 states | done |
| Demo | four views: foundations · controls · structures · compositions |
| Docs | 5 of 5 |

**Where to look first.** `verify/decisions.html` is the record of every design
question that has been settled and why — fifteen of them, each with the
side-by-side that settled it. Serve the repo (`python3 -m http.server 8080`)
and open it; the same server runs the demo at `/demo/dist/`.

`GAPS.md` holds everything unsettled. Read it before trusting a value.

## Versioning

Apps pin to a tag. A design change reaches an app only when someone
deliberately bumps it. A version that is not tagged here does not exist.
