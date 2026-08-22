# shared/ui — the component library, vendored

This is **Swift Struck UI v0.15.0** (`@swift-struck/ui`, installed here as
`@kwapso/ui`), copied into this repo on **2026-08-22** from
`node_modules/@kwapso/ui`. It is 94 components — 65 primitives, 26 collections
and the token tier — plus the nine `lib/` helpers and `styles.css`.

**It is ours now.** Not a mirror, not a cache, not a thing to keep in step with
anything. The app owns this code, changes it in place, and will diverge from
upstream on purpose.

## Why it moved

The app is being re-themed to the kwapso design kit (`design-mothership`), and a
theme is only most of a re-skin. A token remap repaints a button; it cannot
change the button's SHAPE. The kit specifies a secondary button as a filled
button in the other paper tone with no border in any state — and no arrangement
of token values turns a bordered button into that, because the border is written
into the component. Owning the source is what makes the rest of the kit
reachable.

The alternative was a growing pile of downstream overrides in
`shared/web/library-overrides.css`, each one fighting a line in a file we could
not edit. That file's own comment is a post-mortem of what that costs: one stale
override tinted every card in both apps for nine days because it was written
against a library behaviour that had already changed underneath it.

## The rule that has not changed: NEVER edit upstream from here

`github.com/alaap-swift-struck/swift-struck-ui` is a live dependency of other
Swift Struck products. **This is a copy. Their copy is untouched.** Do not push
here, do not open a PR from here, do not "sync back" a fix. If something in this
directory turns out to be a genuine upstream bug, report it there in its own
words, on its own terms, against their v0.15.0 — and then fix it here anyway,
because these two files are no longer the same file.

Nothing in this repo may install `@kwapso/ui` again. The package was removed
from every `package.json`; its 33 dependencies (Radix, cmdk, recharts, sonner,
lucide-react, class-variance-authority, clsx, tailwind-merge, leaflet,
react-leaflet, next-themes) now sit in the ROOT `package.json`, at the exact
versions the library pinned. They live at the root rather than in the two front
doors because `shared/` is a root-level directory outside both npm workspaces:
node resolution from a file in here walks up to the repo root, and one
declaration cannot drift from a second one.

## Layout, and why it was not tidied

```
shared/ui/
  registry/primitives/…    65 primitives, one folder each
  registry/collections/…   26 data-bound collections
  registry/tokens/…        the theme provider
  lib/…                    config, recipe, collection, text, url, … (9 files)
  styles.css               the theme: tokens, both palettes, motion utilities
```

The folder shape is upstream's, unchanged, and the internal imports are still
the relative paths they always were (`../../../lib/config`,
`../../primitives/button/button`). That is deliberate on both counts. The
relative imports resolve unaltered because `registry/` and `lib/` are still
siblings, so the copy needed no rewriting and could not acquire a rewriting
mistake; and a diff against upstream v0.15.0 is still readable line for line,
which is the only way to answer "what have we actually changed?" a year from now.

`styles.css` carries `@source "./registry"`, resolved relative to itself, so it
points at `shared/ui/registry` here exactly as it pointed at the package's own
registry before. That line is load-bearing: without it Tailwind never scans the
component source and strips every class it thinks is unused, which shows up as a
build that passes and an app with no styling.

## What the laws say about this directory

Three laws scan `shared/`, so three had to say which side of the line this code
sits on. The answers are data in `VENDORED_UI_SCOPE`
(`shared/rules/registry.ts`), with a reason each:

- **R32 · closed palette — HELD, no exemption.** The library named a Tailwind
  ramp in one file and a dead hex fallback in another. Both were FIXED rather
  than excused, so R32 keeps its full reach in here. Prefer this shape.
- **R28 · catalogued strings — out of scope.** The walk always refused this code
  as "somebody else's code and not ours to translate"; vendoring changed its
  address, not what it is. The screen-reader residue is recorded as debt in
  `NEEDS-A-SPEC.md`.
- **R31 · two radii — out of scope, dated.** The library still speaks
  `rounded-sm/md/lg/2xl`. The check asserts it STILL offends, so when the reskin
  collapses those into the kit's four radii, the exemption turns the build red
  and is deleted by the commit that earns it.

Everything else — lint, TypeScript, and the rest of the rule suite — applies to
this directory exactly as it applies to the rest of `shared/`. It is not a
quarantine; it is the app's code with three sentences written about it.
