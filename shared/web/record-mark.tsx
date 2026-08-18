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
// A PERSON, A COMPANY AND A THING ARE DIFFERENT KINDS OF RECORD and keep their
// own treatment, because consistency means one rule applied consistently, not one
// picture everywhere:
//
//   • a PERSON is a circle, and their photo fills it (`object-cover` — a face
//     cropped to a circle is what a face in a circle is). No photo → initials.
//   • a COMPANY, an APP, an ASSET is a rounded square, and its logo is shown
//     WHOLE inside it (`object-contain`). A wordmark is the usual case and
//     cropping one to a square is how a logo becomes unreadable.
//   • the FALLBACK is the record type's own glyph where the type has one (the
//     team's type mark, an app's stage mark), and the first letter of its name
//     where it does not. Never an empty box, and never a broken picture.
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
// THROUGH `safeSrc`, ALWAYS. A stored path is a value out of a database that a
// machine caller can write, so what reaches `src` is checked here — R20's
// render-side twin — rather than trusted because we happen to have written it.
//
// IT IS `aria-hidden`. A mark carries no meaning the record's own name does not
// already say, and a screen reader announcing "F" before every row is noise. The
// name is always beside it; that is the pair UI-CONVENTIONS §5 requires.

import * as React from "react"

import { safeSrc } from "./rich-text"

/** The three places a mark is ever drawn, and the size each one is: the leading
 * slot of a row, the square on a card in a tile grid, and the square in a
 * record's header band (UI-RULEBOOK G3). THREE, not "whatever the caller passes"
 * — a size handed in as a class name would put two Tailwind size rules on one
 * element and leave the winner to stylesheet order, and it is how a fourth,
 * fifth and sixth size arrive without anybody deciding on one. */
const BOX = {
  row: "size-9 text-lg",
  tile: "size-12 text-2xl",
  band: "size-14 text-3xl sm:size-[72px]",
} as const

export function RecordMark({
  picture: stored,
  mark,
  name,
  shape = "square",
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
  /** A person is a circle; everything else is a rounded square (R31: two radii). */
  shape?: "square" | "round"
  size?: keyof typeof BOX
  className?: string
}) {
  const [broken, setBroken] = React.useState(false)
  const picture = safeSrc(stored ?? undefined)
  const round = shape === "round"
  // The mark first, then the initial, then a neutral placeholder glyph. Every
  // branch puts SOMETHING in the box: a record with no type, no picture and no
  // name is still a record, and an empty grey square reads as a screen that
  // failed to finish loading.
  const fallback = mark || name?.trim()?.[0]?.toUpperCase() || "·"
  return (
    <span
      aria-hidden
      className={`bg-muted text-muted-foreground grid shrink-0 place-items-center overflow-hidden leading-none ${
        round ? "rounded-full" : "rounded-xl"
      } ${BOX[size]} ${className}`}
    >
      {picture && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          // `key` on the src resets the failure when the picture CHANGES, so a
          // corrected logo is not permanently written off by one bad load.
          key={picture}
          src={picture}
          alt=""
          className={`size-full ${round ? "object-cover" : "object-contain"}`}
          onError={() => setBroken(true)}
        />
      ) : (
        fallback
      )}
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
  const [broken, setBroken] = React.useState(false)
  const picture = safeSrc(stored ?? undefined)
  if (!picture || broken) return <>{fallback}</>
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={picture} src={picture} alt="" className={className} onError={() => setBroken(true)} />
  )
}
