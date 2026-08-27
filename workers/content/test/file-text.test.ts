import { stripComments } from "@shared/rules/source-scan"
import { readFileSync } from "node:fs"
import { join } from "node:path"
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

import { DRIVE_BYTES_CAP, boundedBytes, extractFileText, fileShape, looksLikeProse, readsLikeWords } from "../src/lib/file-text"

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

// ── the byte ceiling, which is a different ceiling from the text one ─────────
//
// `DRIVE_TEXT_CAP` bounds the WORDS we keep. It could never bound a .docx,
// because a .docx has no words until it has been decompressed — so the file was
// pulled in whole with `arrayBuffer()` and measured afterwards. One large
// presentation in a shared folder is enough to exceed a worker's memory, and
// when it does the error is "Memory limit would be exceeded before EOF" and
// every OTHER document in the same pass dies with it. That is the fault this
// bounds: not one unreadable file, a whole unreadable sweep.
describe("a file too big to read", () => {
  /** A body that hands out `chunk` repeatedly until `total` bytes are gone. */
  function streamOf(total: number, chunk = 64 * 1024): Response {
    let sent = 0
    return new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (sent >= total) return controller.close()
          const size = Math.min(chunk, total - sent)
          sent += size
          controller.enqueue(new Uint8Array(size))
        },
      })
    )
  }

  it("reads a file under the cap whole", async () => {
    const bytes = await boundedBytes(streamOf(200_000))
    expect(bytes).not.toBeNull()
    expect(bytes!.byteLength).toBe(200_000)
  })

  it("gives up on one past the cap rather than buffering it", async () => {
    expect(await boundedBytes(streamOf(DRIVE_BYTES_CAP + 1))).toBeNull()
  })

  it("answers null rather than half a ZIP", async () => {
    // Not a truncated buffer, unlike the text read: half a sentence is still a
    // sentence, half a ZIP decodes to nothing at all.
    const bytes = await boundedBytes(streamOf(DRIVE_BYTES_CAP * 2))
    expect(bytes).toBeNull()
  })

  it("answers null for a response with no body at all", async () => {
    expect(await boundedBytes(new Response(null))).toBeNull()
  })
})

// -- BINARY ARTWORK IN A RETRIEVAL INDEX ------------------------------------
//
// MEASURED ON STAGING, 27 Aug 2026. The largest "documents" the team held were
// not documents: four Adobe Illustrator logos at 106, 106, 106 and 107 chunks,
// two Outlook templates at 92 and 26, and seven PDFs of vectorised artwork
// between 29 and 62. Roughly 580 chunks of PostScript, OLE headers and page
// geometry - and because they were the BIGGEST sources, they carried weight in
// every neighbourhood while saying nothing.
//
// TWO SEPARATE HOLES LET THEM IN, and the second is the interesting one.
describe("a file whose bytes are not words is not material", () => {
  // HOLE ONE: `.eps` and `.oft` were neither a known text extension nor a known
  // opaque one, so `fileShape` called them "text" - the branch that skipped
  // `extractFileText` entirely and decoded the bytes straight into a source.
  it("artwork and mail templates are opaque, so nothing is even downloaded", () => {
    for (const name of ["HOGO_LOGO_schwarz.eps", "HogoEinsatzliste.oft", "Brand.OTF"])
      expect(fileShape(name, ""), name).toBe("opaque")
  })

  it("and if one is read anyway, its bytes do not read as prose", () => {
    const eps =
      "%!PS-Adobe-3.1 EPSF-3.0\n%%Title: Adobe Illustrator Artwork\n%%BoundingBox: 0 0 523 134\n" +
      String.fromCharCode(0, 1, 2, 3, 4, 5, 6, 7).repeat(200)
    expect(looksLikeProse(eps)).toBe(false)
  })

  // HOLE TWO, and this is why an extension list was never going to be enough.
  // `looksLikeProse` counts READABLE characters, and a vectorised logo's page
  // description is entirely readable - numbers and one-letter operators,
  // printable to the last byte. Three real PDFs passed it on staging and went in
  // as 52, 45 and 46 chunks of drawing instructions.
  // SHAPED LIKE THE REAL THING RATHER THAN LIKE THE IDEA OF IT. A first draft of
  // this fixture was a row of two-letter operators (rg, gs, cm, BT, Tf) and
  // scored 0.4, because a two-letter operator is letter-shaped. Real page
  // geometry measured 0.000 on staging: it is overwhelmingly COORDINATES, with
  // the operators scattered between them, and that is what makes the test honest.
  const geometry = Array.from(
    { length: 60 },
    (_, i) =>
      `${72 + i}.${i}25 ${720 - i}.5 ${523 + i}.75 ${134 + i}.125 ${i}.5 ${i * 3}.0 ` +
      `${i * 7}.25 ${i * 11}.125 m ${i * 13}.5 ${i * 17}.75 l`
  ).join(" ")
  const vollmacht =
    "Vollmacht zur Auskunftserteilung. Hiermit bevollmaechtige ich die Confia Solutions " +
    "saemtliche Auskuenfte bei meiner Versicherung einzuholen und Unterlagen entgegenzunehmen. " +
    "Diese Vollmacht gilt bis auf Widerruf und kann jederzeit schriftlich zurueckgezogen werden."

  it("page geometry is readable and is still not words", () => {
    expect(looksLikeProse(geometry), "every character of it is printable").toBe(true)
    expect(readsLikeWords(geometry), "and not one of them is a word").toBe(false)
  })

  // THE HALF THAT MUST NOT BREAK. A power of attorney and a customer sheet are
  // exactly the material this base exists to answer from, and an extension test
  // would have thrown them out with the logos.
  it("but a power of attorney is words, and survives both tests", () => {
    expect(looksLikeProse(vollmacht)).toBe(true)
    expect(readsLikeWords(vollmacht)).toBe(true)
  })

  // AND THE STRICTER TEST IS NOT LET LOOSE ON EVERYTHING. A spreadsheet export
  // and a data file are not prose either, and they are not this problem - they
  // have their own shape and their own path.
  it("and it is never asked about a CSV, which would fail it and should not", () => {
    expect(fileShape("contacts.csv", "")).toBe("text")
    expect(fileShape("export.json", "")).toBe("text")
  })
})

// -- AND THE TWO PLACES THE GUARDS ARE ACTUALLY APPLIED ----------------------
//
// The tests above prove the two predicates. They do NOT prove that anything
// calls them, and that distinction is the whole bug: `looksLikeProse` existed,
// was correct, and rejected every one of the four Illustrator logos - it was
// simply never asked, because a `.eps` resolved to shape "text" and that branch
// returned its bytes without going near `extractFileText`. A predicate nobody
// calls is not a guard.
//
// So the wiring is censused off the source, the way this codebase censuses every
// other seam it cannot exercise directly (R19/R22 read handler source for the
// same reason). Blunt on purpose: it catches the regression that actually
// happened, which is somebody deleting a call.
describe("the guards are applied, not merely defined", () => {
  // COMMENTS STRIPPED FIRST, and the first version of this census did not do it
  // and was worthless because of it: the comment INSIDE the pdf branch names
  // `readsLikeWords` while explaining why it is there, so the assertion passed
  // happily with the call itself deleted. The repo's other source censuses use
  // this same helper for this same reason.
  const LIB = stripComments(readFileSync(join(__dirname, "..", "src", "lib", "file-text.ts"), "utf8"))
  const API = stripComments(readFileSync(join(__dirname, "..", "src", "lib", "google-api.ts"), "utf8"))

  it("a PDF must pass BOTH tests before its text is kept", () => {
    const branch = /if \(shape === "pdf"\) \{[\s\S]*?\n  \}/.exec(LIB)?.[0] ?? ""
    expect(branch, "the pdf branch has moved - this census has gone blind").toContain("pdfText")
    expect(branch).toContain("looksLikeProse")
    expect(branch, "page geometry is readable; only the word test refuses it").toContain("readsLikeWords")
  })

  it("and the streamed read does not hand back bytes nobody checked", () => {
    const fn = /export async function driveFileText[\s\S]*?\n\}/.exec(API)?.[0] ?? ""
    expect(fn, "driveFileText has moved - this census has gone blind").toContain("DRIVE_TEXT_CAP")
    expect(
      fn,
      "the shape-is-text path returned raw bytes for six of this team's largest sources"
    ).toContain("looksLikeProse")
  })
})
