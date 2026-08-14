// THE ONE PROMISE THIS FEATURE MAKES, under test: a file is always kept, and
// its words are only ever claimed when they exist.
//
// Everything here is about the seam between those two halves. The interesting
// cases are not "does a PDF convert" (that is Cloudflare's job and it has its
// own service); they are the four ways this code could quietly LIE — by
// refusing a file it should have kept, by claiming words it never read, by
// trimming a document without saying so, or by turning a conversion failure
// into a 500 that loses the upload.

import { describe, expect, it, vi } from "vitest"

import { DOCUMENT_LIMIT_BYTES } from "@shared/workers/validate"
import { GuardError } from "@shared/workers/gating"
import {
  capToRow,
  extractFile,
  readability,
  unreadableNote,
} from "../src/lib/knowledge-files"
import type { Env } from "../src/env"

/** A stand-in for the AI binding: only `toMarkdown` is ever reached here. */
function aiEnv(toMarkdown: (...args: unknown[]) => unknown): Env {
  return { AI: { toMarkdown } } as unknown as Env
}

const bytes = (text: string) => new TextEncoder().encode(text)

describe("readability: which files we can read, and how", () => {
  it("reads plain text itself, without a conversion round-trip", () => {
    expect(readability("text/plain", "notes.txt")).toBe("text")
    expect(readability("text/markdown", "README.md")).toBe("text")
    // A browser that declares nothing useful — the extension is then the only
    // thing that knows.
    expect(readability("application/octet-stream", "server.log")).toBe("text")
  })

  it("converts the formats Cloudflare's toMarkdown supports", () => {
    expect(readability("application/pdf", "contract.pdf")).toBe("convert")
    expect(
      readability(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "brief.docx"
      )
    ).toBe("convert")
    expect(readability("text/csv", "rates.csv")).toBe("convert")
    expect(readability("image/png", "whiteboard.png")).toBe("convert")
    // …including by extension alone, which is the ONLY thing that knows for the
    // formats no browser has a mime for.
    expect(readability("application/octet-stream", "budget.numbers")).toBe("convert")
    expect(readability("application/octet-stream", "old.xls")).toBe("convert")
  })

  // The case the owner will meet first, and the one that must never be a
  // refusal: toMarkdown does not read PowerPoint.
  it("calls a deck, an archive and a design file unreadable — never refused", () => {
    expect(
      readability(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "pitch.pptx"
      )
    ).toBe("unreadable")
    expect(readability("application/zip", "assets.zip")).toBe("unreadable")
    expect(readability("application/octet-stream", "logo.sketch")).toBe("unreadable")
  })

  it("says something a person can act on for the kinds it knows", () => {
    expect(unreadableNote("pitch.pptx")).toContain("PDF")
    expect(unreadableNote("assets.zip")).toContain("archive")
    // And something true for the ones it does not.
    expect(unreadableNote("logo.sketch")).toContain("kept here")
  })
})

describe("capToRow: a document longer than one row can hold", () => {
  it("leaves an ordinary document alone and says nothing", () => {
    expect(capToRow("a short contract")).toEqual({ text: "a short contract", note: null })
  })

  it("cuts to the row's ceiling and SAYS it cut — never silently", () => {
    const out = capToRow("x".repeat(DOCUMENT_LIMIT_BYTES + 5_000))
    expect(new TextEncoder().encode(out.text as string).length).toBeLessThanOrEqual(
      DOCUMENT_LIMIT_BYTES
    )
    expect(out.note).toBeTruthy()
    expect(out.note).toContain("searchable")
  })

  it("never cuts mid-character — a broken word would end up in a quoted answer", () => {
    // Every character is three bytes, so a naive byte slice lands mid-codepoint.
    const out = capToRow("漢".repeat(DOCUMENT_LIMIT_BYTES))
    const kept = out.text as string
    expect(kept.length).toBeGreaterThan(0)
    expect(kept).not.toContain("�")
    // Round-tripping through the encoder must reproduce it exactly.
    expect(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(new TextEncoder().encode(kept))).toBe(kept)
    expect(new TextEncoder().encode(kept).length).toBeLessThanOrEqual(DOCUMENT_LIMIT_BYTES)
  })
})

describe("extractFile: the file is kept, the words are only claimed when they exist", () => {
  it("decodes plain text without touching the conversion service at all", async () => {
    const toMarkdown = vi.fn()
    const out = await extractFile(aiEnv(toMarkdown), {
      bytes: bytes("the dispatch runbook"),
      contentType: "text/plain",
      fileName: "runbook.txt",
    })
    expect(out).toEqual({ text: "the dispatch runbook", note: null })
    expect(toMarkdown).not.toHaveBeenCalled()
  })

  it("converts a document and hands back its words", async () => {
    const toMarkdown = vi.fn().mockResolvedValue({
      format: "markdown",
      data: "# Contract\n\nThe dispatch window is four hours.",
    })
    const out = await extractFile(aiEnv(toMarkdown), {
      bytes: bytes("%PDF-1.4 …"),
      contentType: "application/pdf",
      fileName: "contract.pdf",
    })
    expect(out.text).toContain("four hours")
    expect(out.note).toBeNull()
    expect(toMarkdown).toHaveBeenCalledOnce()
  })

  // THE HEART OF IT. Three different ways a file can end up with no words, and
  // every one of them must produce the SAME shape: no text, and a sentence.
  it("gives an unreadable kind no words and a reason", async () => {
    const toMarkdown = vi.fn()
    const out = await extractFile(aiEnv(toMarkdown), {
      bytes: bytes("PK"),
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      fileName: "pitch.pptx",
    })
    expect(out.text).toBeNull()
    expect(out.note).toBeTruthy()
    // Not even attempted — a conversion we know will fail is a wasted call.
    expect(toMarkdown).not.toHaveBeenCalled()
  })

  it("gives a conversion ERROR no words and a reason — never a throw", async () => {
    const out = await extractFile(
      aiEnv(vi.fn().mockResolvedValue({ format: "error", error: "corrupt document" })),
      { bytes: bytes("%PDF-broken"), contentType: "application/pdf", fileName: "broken.pdf" }
    )
    expect(out.text).toBeNull()
    expect(out.note).toContain("corrupt document")
  })

  it("gives a conversion CRASH no words and a reason — never a throw", async () => {
    const out = await extractFile(
      aiEnv(vi.fn().mockRejectedValue(new Error("upstream down"))),
      { bytes: bytes("%PDF-1.4"), contentType: "application/pdf", fileName: "contract.pdf" }
    )
    expect(out.text).toBeNull()
    expect(out.note).toBeTruthy()
  })

  it("gives an EMPTY conversion no words and a reason (a scan with nothing on it)", async () => {
    const out = await extractFile(
      aiEnv(vi.fn().mockResolvedValue({ format: "markdown", data: "   \n  " })),
      { bytes: bytes("PNG"), contentType: "image/png", fileName: "blank.png" }
    )
    expect(out.text).toBeNull()
    expect(out.note).toContain("no text")
  })

  it("caps an enormous conversion to what one row holds, and says so", async () => {
    const out = await extractFile(
      aiEnv(vi.fn().mockResolvedValue({ format: "markdown", data: "y".repeat(DOCUMENT_LIMIT_BYTES * 2) })),
      { bytes: bytes("%PDF-1.4"), contentType: "application/pdf", fileName: "book.pdf" }
    )
    expect(new TextEncoder().encode(out.text as string).length).toBeLessThanOrEqual(
      DOCUMENT_LIMIT_BYTES
    )
    expect(out.note).toBeTruthy()
  })

  // The ONE thing that is genuinely the caller's fault, and therefore the one
  // thing that is a 400 rather than an outcome: a source with no file and no
  // words behind it is not a source.
  it("refuses an empty file, in words, as a clean 400", async () => {
    await expect(
      extractFile(aiEnv(vi.fn()), {
        bytes: new Uint8Array(),
        contentType: "application/pdf",
        fileName: "nothing.pdf",
      })
    ).rejects.toBeInstanceOf(GuardError)
  })
})
