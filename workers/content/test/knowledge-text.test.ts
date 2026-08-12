// The pure half of the knowledge base: chunking, the inverted index's own
// tokeniser, the change hash, and the quantised vector codec.
//
// These are unit tests on purpose. Everything the retrieval quality depends on
// is deterministic and lives in one file with no database and no model in it, so
// "does a question find the right passage?" can be MEASURED (the backfill script
// does exactly that against the agency's own history) rather than guessed at.

import { describe, expect, it } from "vitest"

import {
  CHUNK_TARGET_CHARS,
  chunkText,
  contentHash,
  decodeEmbedding,
  encodeEmbedding,
  plainText,
  questionTerms,
  similarity,
  tokenise,
} from "../src/lib/knowledge-text"
import { MAX_CHUNKS_PER_SOURCE } from "../src/lib/knowledge"

describe("chunkText", () => {
  it("returns nothing for empty text (never one empty chunk)", () => {
    expect(chunkText("")).toEqual([])
    expect(chunkText("   \n\n  ")).toEqual([])
  })

  it("keeps a short source as one readable piece", () => {
    expect(chunkText("The dispatch screen logs people out after ten minutes.")).toEqual([
      "The dispatch screen logs people out after ten minutes.",
    ])
  })

  it("cuts long text into pieces around the target size, keeping every word", () => {
    const sentence = "Bergman reported the dispatch outage again this morning. "
    const chunks = chunkText(sentence.repeat(120))
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(CHUNK_TARGET_CHARS + 200)
    // Nothing is dropped on the floor: every chunk is non-empty and the whole
    // set still carries the words. (A chunker that silently loses its tail is
    // the failure you only find when an answer is missing its evidence.)
    expect(chunks.join(" ")).toContain("dispatch outage")
    expect(chunks.every((c) => c.trim().length > 0)).toBe(true)
  })

  it("still splits text with no sentence boundaries at all (a pasted table)", () => {
    const chunks = chunkText("x".repeat(CHUNK_TARGET_CHARS * 3))
    expect(chunks.length).toBe(3)
  })

  it("chunks a whole book rather than stopping at a ceiling", () => {
    // IT USED TO STOP AT 200 — about eight pages — and say nothing. A 300-page
    // contract went in as its first eight pages, and "the whole document is in
    // there" was indistinguishable from "the beginning of it is". The refusal
    // now lives at the door, in bytes, before anything is saved; this function
    // reports what the text really is.
    const book = "Sentence number one here. ".repeat(20_000)
    const chunks = chunkText(book)
    expect(chunks.length).toBeGreaterThan(500)
    // Nothing is lost between the pieces: every sentence of the book is in one.
    expect(chunks.join(" ").length).toBeGreaterThan(book.length * 0.99)
    // The backstop is still a number, and it is DERIVED from the door's ceiling
    // rather than chosen beside it — 1.5 MB of text cannot make more than this.
    // It lives in knowledge.ts, beside the validator it comes from: this file
    // deliberately imports NOTHING, so that the benchmark can load it into plain
    // Node and measure the shipped chunker rather than a copy of it.
    expect(MAX_CHUNKS_PER_SOURCE).toBeGreaterThan(1_500)
  })

  it("strips a NUL byte, which SQLite refuses and no request boundary can catch here", () => {
    // The validation seam strips NULs from a REQUEST. A mirrored source's words
    // come from a row written long ago — by an import, a migration, an older
    // door — and one NUL in it would fail the sweep every fifteen minutes,
    // forever, on a row nobody is looking at.
    const withNul = `dispatch${String.fromCharCode(0)} outage`
    expect(plainText(withNul)).toBe("dispatch outage")
    expect(chunkText(withNul)[0]).not.toContain(String.fromCharCode(0))
    expect([...tokenise(withNul).keys()]).toEqual(["dispatch", "outage"])
  })

  it("reads the words out of rich text, not the markup", () => {
    expect(plainText("<p>Marta asked about <b>invoices</b>.</p><script>alert(1)</script>")).toBe(
      "Marta asked about invoices."
    )
  })
})

describe("tokenise", () => {
  it("drops stopwords and anything too short to narrow a search", () => {
    const terms = [...tokenise("The invoice is in the app").keys()]
    expect(terms).toContain("invoice")
    expect(terms).toContain("app")
    expect(terms).not.toContain("the")
    expect(terms).not.toContain("is")
  })

  it("splits on anything that is not a letter or a digit", () => {
    const terms = [...tokenise("marta@bergman.example raised BERG-T0412").keys()]
    expect(terms).toEqual(expect.arrayContaining(["marta", "bergman", "example", "berg", "t0412"]))
  })

  it("caps how much one repeated word can weigh", () => {
    expect(tokenise("invoice ".repeat(50)).get("invoice")).toBe(8)
  })

  it("puts the narrowing words of a question first", () => {
    // A reference number and the long words beat the short generic ones, so a
    // capped term list keeps what actually finds the record.
    const terms = questionTerms("what did they say about invoice BERG-T0412 delivery", 4)
    expect(terms[0]).toBe("t0412")
    expect(terms).toContain("delivery")
  })
})

describe("contentHash", () => {
  it("is stable for the same text and moves for a one-character change", () => {
    const a = contentHash("Bergman dispatch rollout")
    expect(contentHash("Bergman dispatch rollout")).toBe(a)
    expect(contentHash("Bergman dispatch rollouts")).not.toBe(a)
    // The skip that pays for the sweep hangs off this: a hash that collided on a
    // small edit would leave the assistant quoting text nobody wrote any more.
    expect(contentHash("Bergman dispatch rollout ")).not.toBe(a)
  })
})

describe("the vector codec", () => {
  it("round-trips a vector and scores itself at 1", () => {
    const v = [0.2, -0.5, 0.9, 0.1]
    const encoded = encodeEmbedding(v) as string
    expect(encoded).toBeTruthy()
    const decoded = decodeEmbedding(encoded)
    expect(decoded).not.toBeNull()
    // Not exactly 1, and it should not be: each component is rounded to a byte,
    // so a vector's similarity to ITSELF carries the quantisation error. It is
    // biggest on a tiny vector like this one (four dimensions) and vanishes at
    // the 384 the real model returns. Ranking is unaffected — every score pays
    // the same rounding — which is the property that actually matters.
    expect(similarity(decoded, decoded)).toBeGreaterThan(0.98)
  })

  it("scores an unrelated direction near zero and an opposite one below it", () => {
    const a = decodeEmbedding(encodeEmbedding([1, 0, 0, 0]))
    const b = decodeEmbedding(encodeEmbedding([0, 1, 0, 0]))
    const c = decodeEmbedding(encodeEmbedding([-1, 0, 0, 0]))
    expect(similarity(a, b)).toBeCloseTo(0, 2)
    expect(similarity(a, c)).toBeLessThan(-0.9)
  })

  it("refuses a vector it cannot store, rather than storing zeroes", () => {
    // A model having a bad minute answers with nulls or an error object; a
    // vector of zeroes would sit at cosine 0 to every question, forever, and
    // look exactly like a real embedding.
    expect(encodeEmbedding([])).toBeNull()
    expect(encodeEmbedding([0, 0, 0])).toBeNull()
    expect(encodeEmbedding([1, Number.NaN])).toBeNull()
    expect(encodeEmbedding(["x" as never])).toBeNull()
  })

  it("reads an unreadable stored value as no evidence, never as a crash", () => {
    expect(decodeEmbedding(null)).toBeNull()
    expect(decodeEmbedding("")).toBeNull()
    expect(similarity(null, decodeEmbedding(encodeEmbedding([1, 0])))).toBe(0)
    // Two different models under one index: not comparable, so no evidence
    // either way — the lexical half decides instead of a wrong number.
    expect(similarity(decodeEmbedding(encodeEmbedding([1, 0])), decodeEmbedding(encodeEmbedding([1, 0, 0])))).toBe(0)
  })
})
