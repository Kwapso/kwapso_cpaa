// AN IMAGE LOOKS LIKE AN IMAGE, AND ONLY WHEN THE BROWSER WILL ACTUALLY DRAW IT.
//
// The three panels that list attachments drew a paperclip beside every filename,
// which is technically correct and reads as broken: the owner attached two
// screenshots to a story to show what the work did, and the story answered with
// `Screenshot 2026-08-27 at 12.56.45 PM.png`.
//
// The claim worth a test is not "images render" — it is the ONE BOUNDARY that
// decides which files are images HERE, and it is not `image/`. An SVG says
// `image/svg+xml`, is not `INLINE_SAFE_UPLOAD`, and so `storedContentType` wrote
// it into R2 as `application/octet-stream`; putting it in an `<img src>` draws
// the browser's torn-paper glyph. The predicate has to be the SAME sentence as
// the storage rule, which is why it lives one line under it — and this is what
// proves the two agree rather than merely sitting near each other.
//
// The rest is the ladder: a picture where there is one, the type's own glyph
// where there is not, in the same box either way, so a list of a screenshot and
// a PDF does not go ragged down its leading column.

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { AttachmentMark } from "@shared/web/attachment-mark"

afterEach(cleanup)

const FILE = "/media/story/T1/01AAAAAAAAAAAAAAAAAAAAAAAA"

const drawn = (ui: React.ReactElement) => {
  const { container } = render(ui)
  const img = container.querySelector("img")
  return { img, box: container.querySelector("span") }
}

describe("an attachment shows the thing itself where the thing is a picture", () => {
  it("draws the stored bytes for a type the browser will render", () => {
    for (const contentType of ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]) {
      cleanup()
      const { img } = drawn(<AttachmentMark kind="file" url={FILE} contentType={contentType} />)
      expect(img, `${contentType} must draw`).not.toBe(null)
      expect(img!.getAttribute("src")).toBe(FILE)
    }
  })

  it("does NOT draw an SVG — it is image/* and it is stored neutralised", () => {
    // The whole reason `isRenderableImage` is not `startsWith("image/")`. Getting
    // this wrong is not a styling slip: it is a torn-paper glyph where the row
    // used to have a perfectly good paperclip.
    const { img } = drawn(<AttachmentMark kind="file" url={FILE} contentType="image/svg+xml" />)
    expect(img).toBe(null)
  })

  it("draws a glyph, not a picture, for a document and for a link", () => {
    for (const [kind, contentType] of [
      ["file", "application/pdf"],
      ["file", "text/markdown"],
      // A row written before the column existed says nothing about itself, and
      // "nothing" must read as "not a picture" rather than as a guess.
      ["file", null],
      ["link", null],
    ] as const) {
      cleanup()
      const { img, box } = drawn(<AttachmentMark kind={kind} url={FILE} contentType={contentType} />)
      expect(img, `${kind}/${contentType} must not draw a picture`).toBe(null)
      expect(box?.querySelector("svg"), `${kind}/${contentType} must still show its glyph`).not.toBe(null)
    }
  })

  it("never points an <img> at a LINK, whatever the row claims about its type", () => {
    // A link's `url` is somebody else's website. A `src` on one is a request to
    // it from a page a colleague is reading, and the row is writable by a client
    // login on the ticket door — so the kind decides, not the content type.
    const { img } = drawn(
      <AttachmentMark kind="link" url="https://someone-else.example/tracker.png" contentType="image/png" />
    )
    expect(img).toBe(null)
  })
})
