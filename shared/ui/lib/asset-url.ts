/* ASSET IMPORTS RESOLVE TO A URL, WHATEVER THE BUNDLER THINKS THEY ARE.
 *
 * `import photo from "./photo.jpg"` does not mean one thing. Vite — what this
 * repository builds with — evaluates it to a URL STRING. Next evaluates it to a
 * `StaticImageData` object, `{ src, width, height }`. webpack with
 * `asset/resource` gives a string; with `asset/inline` a data URI. The kit
 * cannot know, and until now it assumed.
 *
 * The assumption did not degrade quietly, which is the good half:
 * `compositions/templates/sign-in.tsx` fails to COMPILE under Next, and because
 * `AuthShell` imports `AuthPhotograph` at module scope, TypeScript reports it
 * on every importer whether or not the photograph is ever rendered. So four
 * compositions — screens/sign-in, screens/splash, templates/rail,
 * templates/sign-in — are not merely unstyled under Next, they are
 * UNIMPORTABLE, and passing your own artwork through `media` does not save you.
 *
 * The bad half is `controls/brand/brand.tsx`, which COMPILES under Next because
 * its `Artwork` fields are typed `string` and Next declares `*.svg` as `any` —
 * and renders `src="[object Object]"` on a sign-in screen with nothing else on
 * it. A build failure is a good day; that is a bad one.
 *
 * The kit's own SVGR note already said the shape of this — "AND THEY MUST
 * RESOLVE TO A URL, NOT A COMPONENT" — so this is the same sentence with a
 * different toolchain on the end of it, and this file is the place it stops
 * being a note.
 */

/** What a bundler may hand back for an asset import. */
export type ImportedAsset = string | { src: string; default?: unknown } | { default: string };

/** The URL, whichever shape arrived. Never throws: a shape nobody anticipated
 * returns "" rather than "[object Object]", because an empty src draws nothing
 * and a stringified object draws the browser's torn-paper glyph on a screen
 * that is otherwise blank. */
export function assetUrl(asset: ImportedAsset | undefined | null): string {
  if (!asset) return "";
  if (typeof asset === "string") return asset;
  if (typeof asset === "object") {
    const o = asset as Record<string, unknown>;
    if (typeof o.src === "string") return o.src;
    if (typeof o.default === "string") return o.default;
    const d = o.default as Record<string, unknown> | undefined;
    if (d && typeof d.src === "string") return d.src;
  }
  return "";
}
