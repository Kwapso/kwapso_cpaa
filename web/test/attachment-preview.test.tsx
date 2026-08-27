// A FILES AND LINKS TAB SHOWS WHAT IT HOLDS.
//
// The owner, 27 Aug 2026: "everywhere that we have file uploads, can we just
// make sure that wherever we have this files and links tab, we do our best to
// preview them rather than me clicking on everything." His story carried four
// screenshots and showed four lines of text differing only in a timestamp.
//
// The claim worth a test is not "images render" — it is the ONE BOUNDARY that
// decides which files are pictures HERE, and it is not `image/`. An SVG says
// `image/svg+xml`, is not `INLINE_SAFE_UPLOAD`, and so `storedContentType`
// wrote it into R2 as `application/octet-stream`; an `<img src>` at one draws
// the browser's torn-paper glyph. The predicate has to be the SAME sentence as
// the storage rule, and this is what proves the two agree rather than merely
// sitting near each other.
//
// The second claim is the fence: a LINK is never previewed, whatever its row
// says about its type. A link's `url` is somebody else's website and the row is
// writable by a client login on the ticket door.

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { AttachmentPreview, hasPreview } from "@shared/web/attachment-preview"

afterEach(cleanup)

const FILE = "/media/ticket/T1/01AAAAAAAAAAAAAAAAAAAAAAAA"

const shown = (ui: React.ReactElement) => {
  const { container } = render(ui)
  return container.querySelector("img")
}

describe("a picture on a record previews; everything else does not pretend to", () => {
  it("draws the stored bytes for every type the browser will render", () => {
    for (const contentType of ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/avif"]) {
      cleanup()
      const img = shown(<AttachmentPreview kind="file" url={FILE} contentType={contentType} />)
      expect(img, `${contentType} must preview`).not.toBe(null)
      expect(img!.getAttribute("src")).toBe(FILE)
      expect(hasPreview("file", contentType)).toBe(true)
    }
  })

  it("does NOT preview an SVG — it is image/* and it is stored neutralised", () => {
    // The whole reason `isRenderableImage` is not `startsWith("image/")`.
    expect(shown(<AttachmentPreview kind="file" url={FILE} contentType="image/svg+xml" />)).toBe(null)
    expect(hasPreview("file", "image/svg+xml")).toBe(false)
  })

  it("renders NOTHING for a document or a link — never an empty well", () => {
    // A media box holds its space when empty, which is right for a well and
    // wrong for a list: it would put a grey rectangle under every PDF row.
    for (const [kind, contentType] of [
      ["file", "application/pdf"],
      ["file", "text/markdown"],
      ["file", "application/vnd.ms-excel"],
      // A row written before the column existed says nothing about itself, and
      // "nothing" must read as "not a picture" rather than as a guess.
      ["file", null],
      ["link", null],
    ] as const) {
      cleanup()
      const { container } = render(
        <AttachmentPreview kind={kind} url={FILE} contentType={contentType} />
      )
      expect(container.innerHTML, `${kind}/${contentType} must draw nothing`).toBe("")
      expect(hasPreview(kind, contentType)).toBe(false)
    }
  })

  it("never points an <img> at a LINK, whatever the row claims about its type", () => {
    expect(
      shown(
        <AttachmentPreview
          kind="link"
          url="https://someone-else.example/tracker.png"
          contentType="image/png"
        />
      )
    ).toBe(null)
  })

  it("refuses a url the href seam refuses, rather than putting it in a src", () => {
    // R20's render-side twin: the column is writable by a machine caller, so
    // what reaches `src` is checked here and not trusted because we wrote it.
    expect(
      shown(<AttachmentPreview kind="file" url="javascript:alert(1)" contentType="image/png" />)
    ).toBe(null)
  })

  it("defers the fetch — these are the ORIGINAL bytes, up to 10MB each", () => {
    // A ticket holds up to TICKET_ATTACHMENT_CAP (50) attachments and nothing
    // in this product makes a thumbnail, so `loading="lazy"` is not a nicety.
    const img = shown(<AttachmentPreview kind="file" url={FILE} contentType="image/png" />)
    expect(img!.getAttribute("loading")).toBe("lazy")
  })

  it("is out of the tab order and hidden from a screen reader", () => {
    // The row's NAME is the same link to the same file. Two stops per
    // attachment, and the filename read twice, is the cost of a picture that
    // carries nothing the name beside it does not already say.
    const { container } = render(
      <AttachmentPreview kind="file" url={FILE} contentType="image/png" />
    )
    const a = container.querySelector("a")!
    expect(a.getAttribute("aria-hidden")).toBe("true")
    expect(a.getAttribute("tabindex")).toBe("-1")
    expect(a.getAttribute("href")).toBe(FILE)
  })
})
