// WHAT A CLIENT MAY CLICK — the files-and-links section, rendered.
//
// The rule the screen states over `isFollowable`: a link is CLICKABLE only when
// it is plainly the web (http, https, or a path on this hostname); anything
// else still shows, in full, as plain text — refusing to draw it would hide
// what somebody sent, and refusing to FOLLOW it costs one copy-and-paste.
// Since 26 Aug 2026 the gate also rides safeHref (the one shared seam every
// data-derived href goes through), so a markup-bearing or scheme-obfuscated
// value cannot become an anchor even if it walks like a URL. This renders the
// real component over the four shapes that matter and reads the DOM.

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const fixture = vi.hoisted(() => {
  const base = {
    ticketId: "tkt_1",
    contentType: null,
    sizeBytes: null,
    createdAt: "2026-08-01T10:00:00.000Z",
    addedByName: null,
  }
  return {
    attachments: [
      { ...base, id: "a1", kind: "file" as const, label: "signed-quote.pdf", url: "/media/todo/team/abc" },
      { ...base, id: "a2", kind: "link" as const, label: "The staging site", url: "https://example.com/page" },
      { ...base, id: "a3", kind: "link" as const, label: "A pasted oddity", url: "ftp://example.com/file" },
      { ...base, id: "a4", kind: "link" as const, label: "A hostile paste", url: "javascript:alert(1)" },
    ],
  }
})

vi.mock("@/lib/api", () => ({
  ApiFailure: class ApiFailure extends Error {},
  support: {
    attachments: () =>
      Promise.resolve({ attachments: fixture.attachments, total: fixture.attachments.length }),
    attach: () => Promise.resolve({ attachments: fixture.attachments, total: fixture.attachments.length }),
    detach: () => Promise.resolve({ attachments: fixture.attachments, total: fixture.attachments.length }),
  },
}))

const { TicketAttachments } = await import("@/components/ticket-attachments")

describe("a link is followable, or it is words", () => {
  let root: Root | null = null
  let host: HTMLDivElement

  beforeEach(async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root?.render(React.createElement(TicketAttachments, { ticketId: "tkt_1" }))
    })
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    host.remove()
    root = null
  })

  const anchors = () => [...host.querySelectorAll("a[href]")]
  const hrefs = () => anchors().map((a) => a.getAttribute("href"))

  it("renders every attachment — nothing sent is hidden", () => {
    for (const a of fixture.attachments) expect(host.textContent).toContain(a.label)
  })

  it("a /media file and an https link are anchors", () => {
    expect(hrefs()).toContain("/media/todo/team/abc")
    expect(hrefs()).toContain("https://example.com/page")
  })

  it("an ftp link and a javascript: paste are words on the page, never anchors", () => {
    expect(hrefs()).not.toContain("ftp://example.com/file")
    expect(hrefs().some((h) => h?.toLowerCase().startsWith("javascript:"))).toBe(false)
    // …and the address is still PRINTED, because a name with no way to reach
    // the thing is worse than a line somebody can copy.
    expect(host.textContent).toContain("ftp://example.com/file")
  })
})
