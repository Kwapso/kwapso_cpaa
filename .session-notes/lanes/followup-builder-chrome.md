# Follow-up: the builder should look like the thing it builds

Paste into the session that built the screen builder — it has the worktree and the context.
The owner's words, 4 Sep 2026, on seeing it: *"this looks so ugly: sharp corners, no
padding. It does not look like the screen builder was designed by the Kwapso UI/UX."*

## Re-sync first

    cd ../kwapso-screen-builder
    git fetch origin && git checkout -b fix/builder-chrome origin/main && npm install

Your work merged as #21. Main is `7e9256de`, gate green at **4,001 tests**.

## What is actually wrong, measured

Part of his impression was my fault — I showed him a screenshot from an 800px preview pane
and the tool is built for 1440. At full width it is three clean columns. I have told him so.

But he is right underneath it, and this is the finding: **`tools/screen-builder/styles.css`
imports the kit's tokens, and the builder's own chrome then uses ZERO kit components.**
Thirteen `rounded-[var(--radius)]` on hand-rolled `<div>`s across `builder.tsx`,
`palette.tsx`, `properties.tsx`; not one import from `shared/ui/components/`. The tool wears
the kit's paint and none of its parts.

That is a bad look for a tool whose entire pitch is "these are the kit's real parts" — and
it is also the most honest possible test of the kit: if 116 components cannot furnish a
three-pane tool, that is worth knowing and worth writing down.

## The job

Rebuild the builder's own chrome out of real kit components. The palette list, the
properties panel, the toolbar, the frame, the buttons, the search field, the mode toggles.
Same relative-import style the samples already use.

**Where the kit genuinely cannot supply something, do not fake it — record it.** A short
list at the end of `tools/screen-builder/README.md`: what the tool needed, what the kit
lacks, what you used instead. That list is worth more to Aurora than the reskin is.

**Do not touch the catalogue, the samples, or the generator.** They were verified part by
part and their numbers were independently re-derived (116 parts, 40 with variants, 76
without, 244 options, 546 token declarations, unresolved 0). This is a chrome job only, and
`web/test/kit-catalogue.test.ts` must stay green untouched.

## Then it gets published

Once it looks right, the planner publishes the built page as a private link for the owner,
so he stops having to run a build command. Two things that matters for:

- The page must stay **fully self-contained** — it is today: 2.65 MB, no outbound calls
  (the only external URLs in the bundle are error-message strings inside libraries). Do not
  introduce a runtime fetch, a webfont link or a CDN script; the host blocks them silently
  and the page would degrade with no error.
- Keep the header line that names the kit tag, the sync date and the catalogue date. On a
  hosted snapshot that line is the only way to tell how stale it is.

## Constraints

- `npm run check` green, read by EXIT CODE. Baseline **4,001 tests**.
- Never edit `shared/ui/` — hash-pinned.
- Never run `scripts/i18n-translate.mjs`. `cf-exec` on every Cloudflare command.
- Branch, PR, report back — including anything here that turned out to be wrong.
