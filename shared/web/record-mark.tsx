"use client"

// THE SQUARE A RECORD IS KNOWN BY — its picture, or the placeholder that stands
// in for one. ONE component, for every record on both front doors.
//
// WHY IT EXISTS. On 19 Aug 2026 a census of both front ends found SEVENTEEN
// implementations of "what to draw when there is no picture", collapsing to
// thirteen visibly different answers: one letter in a circle, two letters in a
// circle, an emoji on a muted square, a letter on a muted square, a big letter on
// a wide block, a bare emoji with no box at all, a lucide glyph in a filled
// square, the same glyph in an unfilled one, a coloured dot — and, on most rows
// in the app, nothing whatever. None of them was wrong on its own screen. Read
// end to end they are thirteen decisions where the product has one thing to say,
// and drift like that is only ever visible in aggregate, which is exactly why
// nobody files it as a bug.
//
// THE RULE, in one sentence: a record shows its picture, and where it has none it
// shows a deliberate mark in the same box, at the same size, in the same slot.
//
// THE BOX AND THE FIT ARE TWO QUESTIONS, and reading them as one is what this
// component got wrong first. The BOX says what KIND OF RECORD this is. The FIT
// says what kind of PICTURE it is holding. They correlate — most circles hold
// faces and most squares hold wordmarks — but they are not the same question,
// and the day they disagreed the coupling had to go:
//
//   • the BOX. A CLIENT is a rounded square, whether it is a company or a sole
//     trader, because both sit in one column of one list and two shapes there
//     read as two kinds of thing when the product has one. A PERSON IN THEIR OWN
//     RIGHT — a team member, a staff profile — stays a circle. An APP, an ASSET
//     is a rounded square like the client it belongs to.
//   • the FIT. A FACE is cropped to its box (`object-cover`) — a face shown whole
//     inside a square is a face with grey bars down its sides. A LOGO is shown
//     WHOLE (`object-contain`); a wordmark is the usual case and cropping one to
//     a square is how a logo becomes unreadable.
//   • the FALLBACK is the record type's own glyph where the type has one (the
//     team's type mark, an app's stage mark), and the first letter of its name
//     where it does not. Never an empty box, and never a broken picture.
//
// WHY THE TWO CAME APART. Accounts were drawn a circle for an individual and a
// square for a company, which is the honest rule and was, side by side in one
// list, the wrong-looking one. Squaring the individuals is a one-word change —
// except that 31 of the 106 individual accounts hold a REAL FACE in `logo_url`
// (`scripts/glide-visuals.mjs` put them there), so squaring them while the fit
// still followed the shape would have letterboxed all 31 in the same commit that
// was meant to tidy them up. Hence `fit`: the caller squares the box and keeps
// the crop, and neither decision is hidden inside the other.
//
// A PICTURE THAT FAILS TO LOAD FALLS BACK TO THE MARK. That is the whole reason
// this holds state rather than being a ternary, and the reason it is a component
// rather than a class name: `logoUrl` being SET is not the same fact as the bytes
// still being there. Every stored path in this app is one cancelled Glide
// subscription, one un-reclaimed object or one hand-pasted URL away from a 404,
// and a 404 in an `<img>` is the browser's torn-paper glyph — the single ugliest
// thing this component exists to prevent. `AppMark` learned this first
// (web/test/app-mark.test.tsx); it is now every record's, not one screen's.
//
// AND FOR A YEAR IT DID NOT DO THAT, EITHER TIME, under a green suite. Both
// halves were found by MEASURING one on a page rather than by reading the file,
// which is the only way either could have been found: a mark that has quietly
// stopped falling back looks like a mark for a record with no picture.
//
//   1 · `onError` NEVER FIRES ON A COLD LOAD. The screens are prerendered, so
//       the browser has the `<img>` in the first HTML and starts fetching it
//       long before React hydrates and attaches a handler. A fetch that has
//       already failed by then fires its error event at nobody, `broken` stays
//       false, and the box renders EMPTY — the grey square this file's own
//       fallback note calls "a screen that failed to finish loading". Measured:
//       `complete === true`, `naturalWidth === 0`, and no fallback. The kit's
//       own `Image` documents exactly this race for the SUCCESS case and reads
//       `complete` after paint to close it; the failure case is its mirror and
//       is read the same way, off a callback ref that runs when the node
//       attaches.
//
//   2 · A CORRECTED PICTURE WAS WRITTEN OFF FOREVER — the thing the `key` here
//       carried a comment saying it prevented. It could not: once `broken` is
//       true the `<img>` is not rendered AT ALL, so a changed `key` has no
//       element to remount and the state it was meant to reset is the state
//       keeping the element off the page. Measured: good → bad gave the mark
//       correctly, and bad → good stayed on the mark.
//
// AND `naturalWidth === 0` IS A SAFE TEST HERE, which is not obvious and was not
// assumed: it is ALSO the answer for a picture that loaded fine but has no
// intrinsic size, and an SVG wordmark is exactly that shape — so the check could
// have hidden good artwork behind a fallback. It does not, MEASURED rather than
// reasoned, on all three shapes an SVG comes in: sized (reports 64), viewBox-only
// (reports 150, the viewBox), and neither (reports 300x150, CSS's default object
// size). A browser answers an intrinsic-less picture with the default object
// size, never zero, so only one that actually failed reads 0 — and the genuine
// 404 measured beside them did.
//
// NOT because these are only ever uploads. They are not: `safeSrc` checks the
// SCHEME and nothing else, so `INLINE_SAFE_UPLOAD`'s deliberate exclusion of SVG
// does not reach this — an `https://.../logo.svg` typed into `logo_url` by hand
// or written by a machine caller arrives here untouched, which is the case the
// hand-pasted-URL note above is already about. Pinning the reason to that
// allow-list would assert a coupling that does not exist and would send the next
// reader to the wrong file. What would break this is a BROWSER changing its
// answer for an intrinsic-less image; re-measure the three shapes above.
//
// SO THE FAILURE IS REMEMBERED AGAINST THE PICTURE IT BELONGS TO, not as a bare
// boolean. `failed` holds the src that broke; `broken` is that src still being
// the one we are asked to draw. A new picture is therefore not broken because
// nothing says it is — there is no reset to remember to perform, which is the
// same reason R24 prefers a missing import to a condition somebody can invert.
//
// THROUGH `safeSrc`, ALWAYS. A stored path is a value out of a database that a
// machine caller can write, so what reaches `src` is checked here — R20's
// render-side twin — rather than trusted because we happen to have written it.
//
// IT IS `aria-hidden`. A mark carries no meaning the record's own name does not
// already say, and a screen reader announcing "F" before every row is noise. The
// name is always beside it; that is the pair UI-CONVENTIONS §5 requires.

import * as React from "react"

import { safeSrc } from "./rich-text"

/** The four places a mark is ever drawn, and the size each one is: the dense
 * checkbox row of a checklist (and, since 2026-09-01, a `RecordPicker`'s own
 * closed control and open list — see below), the leading slot of an ordinary
 * row, the square on a card in a tile grid, and the square in a record's
 * header band (UI-RULEBOOK G3). NAMED, not "whatever the caller passes" — a
 * size handed in as a class name would put two Tailwind size rules on one
 * element and leave the winner to stylesheet order, and it is how a fourth,
 * fifth and sixth size arrive without anybody deciding on one. `choice` is the
 * one exception to that count, and it is the rule proving itself rather than
 * breaking it: added ONCE, here, on 2026-08-31, after `row` on a staff/
 * stakeholder checklist (`app-form-dialog.tsx`) had already had its hand-rolled
 * `size-6` className removed for fighting the `size` prop, and the client
 * still called the result "too big". `row` (36px) was never the smallest thing
 * this file could draw — the kit's OWN person mark
 * (`shared/ui/components/avatar/avatar.tsx`) scales 24/32/48
 * (`--avatar-sm/-md/-lg`), and this file's three sizes were decided without
 * reference to it. `choice` reuses `--avatar-sm` itself rather than a bare
 * `size-6`, so a dense checklist row draws the exact box the kit's own
 * smallest avatar draws, at `text-micro` to match the kit's own initial at
 * that size — a fourth NAMED, DECIDED size, which is the antidote the old
 * comment was describing, not the failure it warned about.
 *
 * AND THE SAME COMPLAINT CAME BACK ONE DAY LATER, against a control this file
 * never touches directly: `record-picker.tsx`'s own closed trigger and its
 * open candidate list, both hand-picked `row` (36px) at the time on the
 * reasoning that "a picker row and a list row are the same record at the same
 * size" — true of a COLLECTION row read on its own, and the wrong analogy for
 * a picker, whose whole job is a dense stack of candidates read AGAINST each
 * other, the same shape `choice` was named for. Both call sites moved to
 * `choice` on 2026-09-01; nothing in this file changed, because the drift was
 * never in the box, only in which named size two OTHER callers reached for. */
const BOX = {
  choice: "size-[var(--avatar-sm)] text-micro",
  row: "size-9 text-lg",
  tile: "size-12 text-2xl",
  band: "size-14 text-3xl sm:size-[72px]",
} as const

/** The picture-or-fallback CONTENT alone — no box, no background, no shape,
 * no `overflow-hidden`. `RecordMark` below is this wrapped in its own box;
 * this bare version exists for exactly one caller,
 * `shared/web/list-compat.tsx`, which feeds a record's mark into the
 * vendored kit's `List` (`shared/ui/components/list/list.tsx`) — a slot that
 * ALREADY draws its own circular `Avatar` around whatever it holds (its own
 * doc comment invites "an icon or any node in the well instead of initials").
 * A full `<RecordMark>` there nested a second, differently-shaped box inside
 * the kit's own: two avatars, one DOM tree, doubled paint. This is the same
 * safe-picture state machine `RecordMark` uses (see its header for why the
 * ref check exists), with nothing around it, so it can sit AS the kit's own
 * fallback content instead of bringing a competing box. */
export function RecordMarkGlyph({
  picture: stored,
  mark,
  name,
  cover = false,
}: {
  /** The stored path to the record's own picture, if it has one. */
  picture?: string | null
  /** The record type's glyph, when the type has one. */
  mark?: string | null
  /** The record's name — the last resort is its first letter. */
  name?: string | null
  /** Crop to fill (a face) vs show whole (a logo) — the same choice
   * `RecordMark`'s `fit` resolves; passed in already-resolved because the
   * caller here already built the `<RecordMark>` this replaces and knows it. */
  cover?: boolean
}) {
  const [failed, setFailed] = React.useState<string | null>(null)
  const picture = safeSrc(stored ?? undefined)
  // The failure belongs to a SRC, not to the component. See `RecordMark`'s header.
  const broken = failed !== null && failed === picture
  const fallback = mark || name?.trim()?.[0]?.toUpperCase() || "·"
  return picture && !broken ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={picture}
      ref={(node) => {
        if (node && node.complete && node.naturalWidth === 0) setFailed(picture)
      }}
      src={picture}
      alt=""
      className={`size-full ${cover ? "object-cover" : "object-contain"}`}
      onError={() => setFailed(picture)}
    />
  ) : (
    <>{fallback}</>
  )
}

export function RecordMark({
  picture,
  mark,
  name,
  shape = "square",
  fit,
  size = "row",
  className = "",
}: {
  /** The stored path to the record's own picture, if it has one. NOT called
   * `src`: a prop named `src` reads as a DOM attribute both to a person skimming
   * a call site and to the census that proves no URL reaches one unchecked
   * (web/test/rich-text.test.ts), and this one reaches the seam instead. */
  picture?: string | null
  /** The record type's glyph, when the type has one (a type mark, a stage mark). */
  mark?: string | null
  /** The record's name — the last resort is its first letter. */
  name?: string | null
  /** The BOX. A person in their own right is a circle; a client, an app, an asset
   * — everything else — is a rounded square (R31: two radii). */
  shape?: "square" | "round"
  /** The FIT, when it does not follow the box. Defaults to the shape's own answer
   * (a circle crops, a square contains), which is right nearly everywhere; pass it
   * explicitly for the case the default gets wrong — a FACE drawn in a SQUARE,
   * which is every individual client on the accounts list. */
  fit?: "cover" | "contain"
  /** Defaults to `row`. `choice` (24px) is for a checklist's own checkbox row
   * and for `record-picker.tsx`'s closed control + open candidate list — see
   * the header on `BOX` above for why. `row` stays the size for an ordinary
   * collection row read on its own, which a picker's stack of candidates is
   * not. */
  size?: keyof typeof BOX
  className?: string
}) {
  const round = shape === "round"
  // The fit follows the box unless the caller separates them.
  const cover = (fit ?? (round ? "cover" : "contain")) === "cover"
  return (
    <span
      aria-hidden
      className={`bg-muted text-muted-foreground grid shrink-0 place-items-center overflow-hidden leading-none ${
        round ? "rounded-pill" : "rounded-[var(--radius)]"
      } ${BOX[size]} ${className}`}
    >
      <RecordMarkGlyph picture={picture} mark={mark} name={name} cover={cover} />
    </span>
  )
}

/** THE WIDE PICTURE — an account's cover, a deliverable's still. The other shape
 * a record's picture comes in, and the same failure: two call sites, both a bare
 * `<img>` over a stored path, both drawing the browser's torn-paper glyph when
 * the object behind the path has gone.
 *
 * It is a second component rather than a `shape` on the one above because it is a
 * different thing on the page — a banner the eye reads as part of the record,
 * not a mark that stands in the slot an icon would. And its ABSENCE means
 * something different: a record with no cover shows no band at all, which is a
 * deliberate quiet, while a record with no mark still needs a mark. So `fallback`
 * may be null, and a picture that fails renders exactly what having no picture
 * renders — never a hole where a banner was. */
export function RecordCover({
  picture: stored,
  fallback = null,
  className = "",
}: {
  /** The stored path — named `picture` rather than `src` for the reason above. */
  picture?: string | null
  /** What stands in when there is no picture, or the picture will not load. */
  fallback?: React.ReactNode
  className?: string
}) {
  const [failed, setFailed] = React.useState<string | null>(null)
  const picture = safeSrc(stored ?? undefined)
  // Both failures above are this component's too, and for the same reason: it
  // is the same three lines over a wider box.
  if (!picture || failed === picture) return <>{fallback}</>
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={picture}
      ref={(node) => {
        if (node && node.complete && node.naturalWidth === 0) setFailed(picture)
      }}
      src={picture}
      alt=""
      className={className}
      onError={() => setFailed(picture)}
    />
  )
}
