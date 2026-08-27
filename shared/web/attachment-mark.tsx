"use client"

// AN IMAGE LOOKS LIKE AN IMAGE — the one square at the head of an attachment row,
// on all three panels that draw one (a story's, a ticket's, and the client's view
// of the same ticket).
//
// THE BUG. Every attachment in the product was drawn as a paperclip beside a
// filename. That is technically correct and it reads as broken: somebody pastes
// two screenshots onto a story to show what the work did, and the story answers
// with `Screenshot 2026-08-27 at 14.02.11.png` — the one shape a person cannot
// scan. The whole point of attaching a picture is that a picture is faster than
// the sentence describing it.
//
// IT IS `RecordMark`, NOT A NEW `<img>`, and that is the entire design. The
// square, the radius, the `safeSrc` check, the size ladder and — the one that
// matters here — the FALLBACK WHEN THE BYTES ARE GONE all already exist and are
// already the app's answer everywhere else. A hand-rolled thumbnail would have
// been a second answer to a question that has one, which is the census
// `record-mark.tsx` was written after (seventeen implementations, thirteen
// visibly different).
//
// SO EVERY ROW GETS THE SAME BOX, picture or no picture. A 36px thumbnail beside
// a 16px paperclip is a ragged column, and a list of attachments is exactly the
// list where some rows have a picture and some do not. R35's ladder, applied to
// the one record type that finally has a picture to put in it: its own image
// where it has one, its type's glyph where it does not.
//
// WHICH FILES COUNT AS A PICTURE is `isRenderableImage`, and it is asked one line
// under the function that decided how the bytes were stored, for the reason that
// file gives: an SVG is `image/svg+xml`, is stored neutralised, and would draw
// the browser's torn-paper glyph here.

import * as React from "react"

import { Link2, Paperclip } from "@shared/ui/icons"

import { isRenderableImage } from "@shared/workers/image"
import { RecordMark } from "./record-mark"

export function AttachmentMark({
  kind,
  url,
  contentType,
}: {
  kind: "file" | "link"
  /** `/media/<key>` for a file, the web address for a link. */
  url: string
  /** What the file DECLARED itself to be. Null on a link, and on any row written
   * before the column existed — both read as "not a picture", which is the safe
   * direction. */
  contentType: string | null
}) {
  const glyph =
    kind === "file" ? <Paperclip className="size-4" /> : <Link2 className="size-4" />
  return (
    <RecordMark
      // A LINK's `url` is somebody else's website, and a `src` on one is a
      // request to it from the page a colleague is reading. Only our own stored
      // bytes are ever drawn.
      picture={kind === "file" && isRenderableImage(contentType) ? url : null}
      // ALWAYS SET, so the ladder stops here rather than at an initial: an
      // attachment's type always has a glyph, and a picture that 404s should
      // fall back to the paperclip it would have shown anyway — never to the
      // first letter of a filename, which reads as a different kind of record.
      mark={glyph}
      fit="cover"
      size="row"
    />
  )
}
