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
@import "kwapso-design/foundations/tokens/tokens.css";
@import "kwapso-design/foundations/motion/motion.css";
```

**The two CSS paths MOVED on 2026-08-24.** `tokens/`, `icons/` and `motion/`
are the foundations, and the agreed structure groups them under a
`foundations/` folder. The client ruled `D10-B` and the move is now made, so
each of the two lines above gains one `foundations/` segment. There is no
`exports` map and no path alias — the kit is vendored source, so every import
is a literal path into this tree and nothing sits in front of it to absorb the
rename. The three rows are at the foot of the table below.

```tsx
import { Button } from "kwapso-design/components/button/button";
import { DataTable } from "kwapso-design/components/data-table/data-table";
import { MainScreen } from "kwapso-design/compositions/templates";
import { Pencil } from "kwapso-design/foundations/icons";
```

**`controls/` and `structures/` MOVED AGAIN on 2026-08-26 — read the second
import-path table below, after the 2026-08-24 one.** Both examples above are
current as of today; if you are migrating from a version tagged before
2026-08-26, `Button` was `kwapso-design/controls/button/button` and
`DataTable` was `kwapso-design/structures/data-table/data-table`.

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

And on 2026-08-24 the three foundation folders moved too — ruling `D10-B`.
These are the only three rows that touch an app's **CSS**, and the icons row
is the only import specifier in the whole kit that changed:

| was | is |
|---|---|
| `kwapso-design/tokens/tokens.css` | `kwapso-design/foundations/tokens/tokens.css` |
| `kwapso-design/motion/motion.css` | `kwapso-design/foundations/motion/motion.css` |
| `kwapso-design/icons` | `kwapso-design/foundations/icons` |

Nothing else moved: `controls/`, `structures/`, `compositions/` and `lib/` are
untouched by `D10-B`.

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

### THE IMPORT PATHS MOVED AGAIN ON 2026-08-26, second time in one day

Client ruling, verbatim: *"i still don't understand the difference between
controls / structures. please merge them, and rename to components."*
`controls/` (67 folders) and `structures/` (42 folders) are now one flat
`components/` (108, after the separate deletion below) — no
`components/controls/` or `components/structures/` subfolder either, the
client does not want the two-tier distinction to exist even as a nesting.
This is the third time this repository's public import surface has changed
in one day (the primitives/collections → controls/structures rename that
morning, the foundations/ move under `D10-B`, and now this), and it is more
consequential than the previous two: a consuming app's import goes from
**two possible prefixes to one.**

| was | is |
|---|---|
| `controls/<x>/<x>` | `components/<x>/<x>` |
| `structures/<x>/<x>` | `components/<x>/<x>` |

Every other folder — `compositions/`, `foundations/`, `lib/` — is untouched
by this rename. No export was renamed and nothing changed what any component
does; only the folder segment changed, and it collapsed two segments into
one rather than renaming one to another.

**One component was deleted outright, not renamed.** Client ruling,
verbatim: *"delete portal conversation."* `structures/portal-conversation/
portal-conversation.tsx` (`PortalConversation`, `PortalApprovalBand`) is
gone and is not coming back under any path. It had no functional consumer
anywhere in either consuming application's actual screens — it was a demo
gallery specimen only — so if your app does not already import it, this
changes nothing for you. If it does, there is no replacement; the ruling was
to remove it.

## Layout

```
foundations/   the three that everything else is built out of
  tokens/      tokens.css is the ONLY file where a colour or a size is decided
  icons/       1,512 React exports — the Phosphor pack (MIT), fill weight
             throughout except three named exceptions at regular weight
             (Plus, Power, Prohibit). No alias table: a name here is a name
             on phosphor.dev. See foundations/icons/ATTRIBUTION.md
  motion/      100 rules, all 16 of the commission's motion cases
assets/fonts/ Saans and SerrifCondensed — the client's real type, shipped
              here as .woff2 (what browsers fetch) with the .otf/.ttf masters
              beside them. `LicenseAgreement.pdf` is the paper record: the
              client confirmed in writing on 2026-08-24 that the licence
              permits redistribution inside this repo and that both consuming
              apps are internal. Nobody read the PDF and nobody needs to —
              that decision is the client's and it is made. The @font-face
              block lives in foundations/tokens/tokens.css §5.0; `build-fonts.mjs`
              regenerates the .woff2 if a new cut ever arrives.
components/    108 — controls and structures merged into one flat folder on
               2026-08-26 (client: "i still don't understand the difference
               between controls / structures. please merge them, and rename
               to components"). One folder each, no subfolder split. Was 67
               single-purpose controls (buttons, fields, badges) plus 42
               collection views (tables, boards, threads, gantt, heat,
               timeline, map — the things that draw MANY records), minus
               portal-conversation (deleted the same day, see above) — the
               scope difference between the two kinds is real and still
               worth thinking about when you write one, it just is not a
               folder choice any more
lib/           the cn helper and use-has-room
compositions/  the client: "everything currently compositions/xyz is
               compositions (and then sections inside of it)"
  templates/   15 — the SHAPE of a screen with nothing product-specific in
               it. ScreenShell — THE screen since the 2026-09-02 collapse —
               the rail, and the eleven that stand on them. MainScreen and
               DetailScreen survive as deprecated adapters over the shell.
               THIS IS WHAT THE KIT SHIPS INSTEAD OF ONE FILE PER COLLECTION
  screens/     17 — the finished pages the client named as exceptions:
               home, settings, profile, onboarding, brand, company hub, the
               external doors
  overlays/    8 — what opens OVER a screen rather than replacing it
  states/      5 — the same screen with nothing in it
docs/          RULES · BUILD-A-COMPONENT · TOKENS (BUILD-A-SCREEN pending)
demo/          three views: foundations · components · compositions
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
| Icons — 1,512 exports, six sizes | done — Phosphor (MIT) |
| Motion — 100 rules | done |
| Components — 108 (controls + structures merged 2026-08-26; was 67 + 42, minus portal-conversation, deleted the same day) | done |
| Compositions — 45: 15 templates · 17 screens · 8 overlays · 5 states | done |
| Demo | three views: foundations · components · compositions |
| Docs | 3 of 4 — BUILD-A-SCREEN waits on the screens |

**Where to look first.** `verify/decisions.html` is the record of every design
question that has been settled and why — fifteen of them, each with the
side-by-side that settled it. Serve the repo (`python3 -m http.server 8080`)
and open it; the same server runs the demo at `/demo/dist/`.

`GAPS.md` holds everything unsettled. Read it before trusting a value.

## Versioning

Apps pin to a tag. A design change reaches an app only when someone
deliberately bumps it. A version that is not tagged here does not exist.
