"use client"

// A FILES AND LINKS TAB SHOWS WHAT IT HOLDS. One component, all three panels
// that draw one — a story's, a ticket's, and the client's view of the same
// ticket.
//
// THE ASK (owner, 27 Aug 2026): "everywhere that we have file uploads, can we
// just make sure that wherever we have this files and links tab, we do our best
// to preview them rather than me clicking on everything." He had a story
// carrying four screenshots and four lines of text reading
// `Screenshot 2026-08-27 at 12.56.45 PM.png`, `…at 12.59.19 PM.png`, `…at
// 2.08.43 PM.png`. Nothing on the screen said which was which, so finding one
// meant opening all four.
//
// IT IS THE KIT'S `Image`, NOT A THUMBNAIL WE DREW. The standing rule is that
// we draw nothing the kit already draws, and the kit draws exactly this: a
// media well at `--radius` on `--surface-quiet`, with the spinner and the
// failure register built in, and `lazy` already true. Every one of those is a
// decision we would otherwise have got slightly differently in three files.
//
// AND IT IS NOT THE KIT'S `Gallery`, which is the obvious wrong answer and the
// kit says so itself. `structures/gallery` quotes its own brief: "Offered only
// where images exist … It is never offered for tickets, accounts or sprints —
// an image-led view of text records is a grid of empty boxes pretending to be
// content." A Files and links tab is precisely that mixed list: screenshots
// beside a PDF beside a Loom link. A Gallery of it would draw title-on-paper
// stand-ins for most of its tiles, and its caption is "two lines, hard", which
// has no room for the size, the person, the date and the two actions the row
// already carries. So the LIST stays (UI-RULEBOOK K5: one card, hairline rows)
// and the picture goes under the name, where it costs the row nothing when
// there is no picture to show.
//
// WHICH FILES GET ONE is `isRenderableImage`, which lives one line under
// `storedContentType` because they have to be the same sentence: an SVG is
// `image/svg+xml`, is not inline-safe, and is stored as octet-stream, so an
// `<img>` at one draws the browser's torn-paper glyph. Everything else — a PDF,
// a spreadsheet, a link — keeps the glyph its row already had. "Do our best"
// is honest about its limit: a first-page render of a PDF is a real piece of
// work and this is not it.
//
// CONTAINED, NOT COVERED. `fit="contain"` letterboxes the whole picture onto
// the quiet ground rather than trimming it to the box — the ruling the kit's
// own gallery chapter makes ("the brand shows the whole artefact"; "cover would
// cut a face out of the frame"). For telling two screenshots apart it is the
// difference between the answer and a crop of the answer.
//
// WHAT IT COSTS, said out loud. These are the ORIGINAL bytes: a ticket may
// carry fifty attachments (TICKET_ATTACHMENT_CAP) of up to 10MB each, and
// nothing in this product makes a thumbnail. So the fetch is bounded the two
// ways available without a server-side resize: the kit's `lazy` (native
// `loading="lazy"`, so a preview below the fold is not fetched until it is
// nearly on screen) and a capped display width, which keeps the tab scannable
// as well as cheap. A real thumbnail pipeline is the follow-up, and until it
// exists this is the honest ceiling.

import * as React from "react"

import { Image } from "@shared/ui/components/image/image"

import { isRenderableImage } from "@shared/workers/image"
import { safeHref } from "./rich-text"
import { useT } from "./language"

export function AttachmentPreview({
  kind,
  url,
  contentType,
}: {
  kind: "file" | "link"
  /** `/media/<key>` for a file, somebody else's web address for a link. */
  url: string
  /** What the file declared itself to be. Null on a link, and on any row
   * written before the column existed — both read as "not a picture", which is
   * the safe direction. */
  contentType: string | null
}) {
  const t = useT()
  // A LINK IS NEVER PREVIEWED, whatever its row claims about its type. A link's
  // `url` is somebody else's website, and an `<img src>` at one is a request to
  // that site from a page a colleague is reading — with the row writable by a
  // client login on the ticket door. The kind decides, not the content type.
  if (kind !== "file" || !isRenderableImage(contentType)) return null
  // Through the same seam the row's own link goes through, rather than trusted
  // because we happen to have written the column (R20's render-side twin).
  const src = safeHref(url)
  if (!src) return null
  return (
    // The picture opens the file, so seeing it and getting to it are one press.
    // ARIA-HIDDEN AND OUT OF THE TAB ORDER on purpose: the row's name is the
    // same link to the same file, and a screen reader announcing it twice — or
    // a keyboard user tabbing through two stops per attachment — is the cost of
    // a picture that carries no information a sighted reader does not already
    // have from the name beside it.
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      aria-hidden="true"
      tabIndex={-1}
      // `block`, and it matters: an anchor is inline by default, so a width
      // and a max-width on it are both ignored and the well grew to the whole
      // panel. Seen on screen, not in the source.
      className="block w-full max-w-xs"
    >
      <Image
        src={src}
        // The whole artefact, letterboxed — never a crop of a screenshot.
        fit="contain"
        // The kit's own default, and the box `Skeleton variant="media"` draws,
        // so nothing jumps when the bytes land.
        ratio="16 / 9"
        // Both are props with defaults IN ENGLISH inside the kit, which is a
        // library shared across apps and outside our catalogue. Said here, in
        // our words, so they are translated like every other sentence (R33).
        loadingLabel={t("Loading…")}
        errorLabel={t("Can't show this one")}
        // `alt=""` is the kit's default and the correct one: the name is right
        // there in the row, and describing the picture again would read it twice.
      />
    </a>
  )
}

/** Does this row have a picture under it? The row asks before it draws the
 * wrapper, so a row with nothing to show costs no empty box and no extra
 * element — the kit's media well holds its space when it is empty, which is
 * right for a well and wrong for a list. Same question `AttachmentPreview`
 * asks itself, exported so the two can never disagree. */
export function hasPreview(kind: "file" | "link", contentType: string | null): boolean {
  return kind === "file" && isRenderableImage(contentType)
}
