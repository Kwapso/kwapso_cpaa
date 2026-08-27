// THE KIT'S AUTH ARTWORK, LOADED THE WAY NEXT LOADS AN ASSET.
//
// The two-panel sign-in shell is the kit's (`AuthShell`, compositions ch27.16)
// and so is every pixel below: the lockup is `assets/logos/logotype-*-ink.svg`
// and the picture is `assets/photography/exterior-mockup-*.jpg`, the client's
// own files, unmodified. Nothing here is drawn.
//
// WHY THE KIT'S OWN `Logotype` AND `AuthPhotograph` ARE NOT CALLED. They cannot
// run in this app, and it is a bundler difference rather than a bug in either
// side. Both take the artwork through a static import — `import logo from
// "….svg"` — and both assume that import evaluates to a URL STRING, which is
// what Vite gives them in the kit's own repository. Next gives a
// `StaticImageData` object (`{ src, width, height }`) instead, so:
//
//   · `AuthPhotograph` does not compile here at all. `next build` stops on
//     `compositions/templates/sign-in.tsx:208` — "Type 'StaticImageData' is not
//     assignable to type 'string | Blob | undefined'" — and its `srcSet`
//     template would have interpolated the object as "[object Object] 960w".
//   · `brand.tsx` DOES compile, because its `Artwork` fields are typed `string`
//     and Next declares `*.svg` as `any`. It would then render
//     `src="[object Object]"` on a screen with nothing else on it.
//
// The kit's own header predicted the class of failure — "AND THEY MUST RESOLVE
// TO A URL, NOT A COMPONENT" — for SVGR; this is the same sentence with a
// different toolchain on the end of it. `mark` and `media` are props on
// `AuthShell` precisely so a door can pass its own ("Both stay props, so a door
// can pass its own or `null`"), so this file passes the same artwork through
// `.src` and changes nothing else. It is a SHIM and should be deleted the day
// the kit resolves its own assets to URLs — reported upstream to
// Kwapso/kwapso-ui-ux rather than fixed here, because `shared/ui/` is pinned.
//
// WHY TWO CUTS AND NOT `dark:`. Copied, deliberately, from the rule the kit
// states in `controls/brand/brand.tsx`: this system's dark is NOT Tailwind's
// `dark:`. `tokens.css` spells it twice —
//
//     @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }
//     :root[data-theme="dark"]
//
// — so a bare `dark:` gets the wrong cut for the two readers who have chosen
// against their machine. Both cuts are in the markup and CSS picks one, which
// also means no JavaScript, no hydration mismatch and no flash of the wrong
// artwork on first paint.

import logotypeBlack from "@shared/ui/assets/logos/logotype-black-ink.svg"
import logotypeWhite from "@shared/ui/assets/logos/logotype-white-ink.svg"
import photo960 from "@shared/ui/assets/photography/exterior-mockup-960.jpg"
import photo1440 from "@shared/ui/assets/photography/exterior-mockup-1440.jpg"
import photo1920 from "@shared/ui/assets/photography/exterior-mockup-1920.jpg"

/** On the black cut: stand down as soon as the palette is dark, either way. */
const HIDE_WHEN_DARK =
  "[:root[data-theme=dark]_&]:hidden [@media(prefers-color-scheme:dark)]:[:root:not([data-theme=light])_&]:hidden"

/** On the reversed cut: absent by default, present under either dark rule. */
const SHOW_WHEN_DARK =
  "hidden [:root[data-theme=dark]_&]:block [@media(prefers-color-scheme:dark)]:[:root:not([data-theme=light])_&]:block"

/**
 * The lockup — the kwapso glyph with the name beside it, for the slot ch27.16
 * puts "directly above the title where an eyebrow would otherwise go".
 *
 * The height is the kit's `lg` step (2.5rem, the height of the one filled
 * button further down the same column) and the width follows from the
 * artwork's own measured ink ratio of 4.9986:1, which is why `w-auto` and
 * `aspect-*` are both here: the box is final before the file arrives, so
 * nothing under the mark moves when it does.
 *
 * DECORATIVE, and that is the kit's own naming rule rather than a shortcut: a
 * logo is decoration when a wordmark in real type already names the product,
 * and the heading beside this one does. Both cuts carry `alt=""` so a reader
 * is told "kwapso" once, by the heading, and never twice.
 */
export function AuthLogotype() {
  return (
    <span className="flex" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logotypeBlack.src}
        alt=""
        decoding="async"
        className={`block h-10 w-auto aspect-[4.9986] ${HIDE_WHEN_DARK}`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logotypeWhite.src}
        alt=""
        decoding="async"
        className={`h-10 w-auto aspect-[4.9986] ${SHOW_WHEN_DARK}`}
      />
    </span>
  )
}

/**
 * The photograph on the shell's inline start, filling the box `AuthShell`
 * gives it — which is contained, radius 24 and absent below `md`, so a phone
 * never lays this out and a lazy image with no layout box is never fetched.
 *
 * THE CROP IS THE KIT'S MEASUREMENT, not a choice made here. The source is
 * 16:9 and the slot is a tall column, so `cover` keeps the full height and
 * throws width away; the kit measured the handset's centre at 51.3% of the
 * frame and set the horizontal position to 51% so the phone keeps a real
 * margin at the narrowest column. See `compositions/templates/sign-in.tsx`.
 */
export function AuthPhotograph() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo1440.src}
      srcSet={`${photo960.src} 960w, ${photo1440.src} 1440w, ${photo1920.src} 1920w`}
      sizes="50vw"
      alt=""
      loading="lazy"
      decoding="async"
      className="absolute inset-0 size-full object-cover object-[51%_50%]"
    />
  )
}
