// READING THE WORDS OUT OF A FILE THAT IS NOT A TEXT FILE.
//
// Earned by a measurement, not a hunch. On 2026-08-20, of 410 Drive documents
// in the owner's own knowledge base, 191 — 46% — held UNDER 50 CHARACTERS: a
// .docx is a ZIP, so the UTF-8 decoder hit the first non-text byte and stopped,
// leaving "PK" and three more. And 26 PDFs held about 47,000 characters EACH of
// PDF file plumbing, indexed as if it were prose and competing with real
// passages in every search.
//
// THE ARCHIVES HERE ARE BUILT BYTE BY BYTE rather than committed as fixtures,
// because a fixture proves the parser reads THAT file and this has to prove it
// reads the FORMAT. Every offset below is the ZIP spec's.

import { describe, expect, it } from "vitest"

import { extractFileText, fileShape, looksLikeProse } from "../src/lib/file-text"

/** A ZIP holding STORED (uncompressed) entries. Enough to exercise the directory
 * walk without depending on the runtime's deflate. */
function zipWith(parts: { name: string; body: string }[]): Uint8Array {
  const chunks: number[] = []
  const enc = new TextEncoder()
  for (const part of parts) {
    const name = enc.encode(part.name)
    const body = enc.encode(part.body)
    const head = new Uint8Array(30)
    const dv = new DataView(head.buffer)
    dv.setUint32(0, 0x04034b50, true) // local file header
    dv.setUint16(4, 20, true) // version
    dv.setUint16(6, 0, true) // flags
    dv.setUint16(8, 0, true) // method 0 = stored
    dv.setUint32(18, body.length, true) // compressed size
    dv.setUint32(22, body.length, true) // uncompressed size
    dv.setUint16(26, name.length, true)
    chunks.push(...head, ...name, ...body)
  }
  return new Uint8Array(chunks)
}

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

describe("what kind of file is this", () => {
  it("knows the shapes from the mime, and from the name when the mime is vague", () => {
    expect(fileShape("brief.docx", "application/octet-stream")).toBe("office")
    expect(fileShape("no-extension", DOCX)).toBe("office")
    expect(fileShape("logo.pdf", "")).toBe("pdf")
    expect(fileShape("notes.md", "")).toBe("text")
    expect(fileShape("shot.png", "image/png")).toBe("opaque")
    expect(fileShape("clip.mp4", "")).toBe("opaque")
  })

  // AN UNKNOWN FILE IS READ, NOT REFUSED — the old behaviour for plain files,
  // with `looksLikeProse` as the guard rather than a guess about the extension.
  it("reads an unrecognised file rather than refusing it", () => {
    expect(fileShape("data.weird", "application/x-thing")).toBe("text")
  })
})

describe("Word, Excel and PowerPoint", () => {
  it("reads the words out of a .docx and keeps the paragraphs apart", async () => {
    const xml =
      "<w:document><w:body>" +
      "<w:p><w:r><w:t>The voucher flow</w:t></w:r><w:r><w:t> was agreed</w:t></w:r></w:p>" +
      "<w:p><w:r><w:t>Pharmacies redeem in two steps.</w:t></w:r></w:p>" +
      "</w:body></w:document>"
    const text = await extractFileText(zipWith([{ name: "word/document.xml", body: xml }]), "brief.docx", DOCX)
    expect(text).toContain("The voucher flow")
    expect(text).toContain("Pharmacies redeem in two steps.")
    // TWO RUNS ARE ONE SENTENCE, NOT ONE WORD. Office splits a sentence across
    // runs at every formatting change, so a naive strip produces "flowwas".
    expect(text).toMatch(/voucher flow was agreed/)
    // …and two PARAGRAPHS are two lines.
    expect(text.split("\n").filter(Boolean).length).toBeGreaterThan(1)
  })

  it("reads a spreadsheet's shared strings", async () => {
    const xml = "<sst><si><t>Pharmoutcomes</t></si><si><t>Redemption API</t></si></sst>"
    const text = await extractFileText(
      zipWith([{ name: "xl/sharedStrings.xml", body: xml }]),
      "list.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    expect(text).toContain("Pharmoutcomes")
    expect(text).toContain("Redemption API")
  })

  it("ignores the parts of the archive that are machinery, not words", async () => {
    const text = await extractFileText(
      zipWith([
        { name: "word/document.xml", body: "<w:p><w:r><w:t>Real prose</w:t></w:r></w:p>" },
        { name: "word/theme/theme1.xml", body: "<a:theme><a:latin typeface='Calibri Light'/></a:theme>" },
        { name: "docProps/app.xml", body: "<Properties><Company>Nobody Ltd</Company></Properties>" },
      ]),
      "brief.docx",
      DOCX
    )
    expect(text).toContain("Real prose")
    // A font table and a company property are not what somebody wrote.
    expect(text).not.toContain("Calibri")
    expect(text).not.toContain("Nobody Ltd")
  })

  it("unescapes entities without turning them into tags", async () => {
    const body = "<w:p><w:r><w:t>Fish &amp; chips &lt;not a tag&gt;</w:t></w:r></w:p>"
    const text = await extractFileText(zipWith([{ name: "word/document.xml", body }]), "a.docx", DOCX)
    expect(text).toContain("Fish & chips <not a tag>")
  })
})

describe("what has no words in it", () => {
  it("returns nothing for an image, a video and an archive, without reading them", async () => {
    for (const [name, mime] of [["shot.png", "image/png"], ["clip.mp4", "video/mp4"], ["bundle.zip", ""]] as const)
      expect(await extractFileText(new Uint8Array([1, 2, 3, 4]), name, mime)).toBe("")
  })

  // THE GUARD THE OLD READER CLAIMED AND NEVER HAD. This is the exact failure
  // that put 47,000 characters of PDF structure into the index.
  it("refuses bytes that survived a decoder but are not prose", () => {
    expect(looksLikeProse("PK")).toBe(false)
    expect(looksLikeProse(String.fromCharCode(37, 80, 68, 70, 1, 2, 3, 4, 5, 6, 7, 8))).toBe(false)
    expect(looksLikeProse("The voucher flow was agreed on Tuesday.")).toBe(true)
  })

  it("hands back an empty string rather than a plausible-looking one", async () => {
    const junk = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x36, 0, 1, 2, 3, 4, 5, 6, 7])
    expect(await extractFileText(junk, "logo.pdf", "application/pdf")).toBe("")
  })
})

describe("plain text still reads exactly as it did", () => {
  it("passes a markdown file through untouched", async () => {
    const bytes = new TextEncoder().encode("# Sprint 3\n\nVouchers ship on Tuesday.")
    expect(await extractFileText(bytes, "notes.md", "text/markdown")).toContain("Vouchers ship on Tuesday.")
  })
})
