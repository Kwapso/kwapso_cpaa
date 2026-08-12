// THE PURE HALF OF THE KNOWLEDGE BASE — turning a piece of material into the
// things retrieval actually scores: chunks, terms, and a vector. No database, no
// network, no env — AND NO IMPORTS AT ALL, which is a property worth keeping
// rather than an accident: `scripts/knowledge-retrieval-bench.mjs` imports this
// file straight into plain Node so that the "before" arm of every measurement is
// really the shipped code. One `@shared/…` import here and that stops working,
// which is exactly how it was found. The one constant that wanted to live here
// and could not — the derived chunk ceiling — is in knowledge.ts beside the
// validator it is derived from.
//
// Two sections, in the order the pipeline uses them:
//   1. TEXT   — hash (has this changed?), chunk (what does a citation point at?),
//               tokenise (what does stage one of retrieval match on?).
//   2. VECTOR — the quantised embedding codec and its similarity, so stage two
//               can re-rank a bounded candidate set with no float array in D1.

/* ---------------------------------- text ---------------------------------- */

/** How big one chunk gets. Small enough that a citation points at something a
 * person can read in the answer; big enough that a paragraph's meaning survives
 * being cut out of its source. */
export const CHUNK_TARGET_CHARS = 900


/** Distinct terms one chunk contributes to the inverted index. The tail of a
 * long chunk is mostly names and numbers that match nothing; the head is what
 * carries it. Bounded so one pathological chunk cannot write thousands of rows. */
const MAX_TERMS_PER_CHUNK = 120

/** The most common English words carry no signal and match everything, so a
 * question containing them would drag the whole compartment into stage one.
 * Deliberately short — a stopword list that grows starts deleting meaning (the
 * classic: "to be or not to be" tokenises to nothing). */
const STOPWORDS = new Set(
  ("the a an and or but if then than that this these those there here of to in on at by for with from as is are was were be been being do does did done have has had it its it's we our you your they their he she his her not no so such about into over under after before between out up down what which who whom when where why how all any both each few more most other some only own same too very can will just should now".split(
    " "
  ))
)

/** A STABLE content hash — "has this source changed since we indexed it?" and
 * nothing else. Two 32-bit FNV-1a passes with different offsets, printed as 16
 * hex characters: a missed change would leave the assistant quoting a ticket
 * nobody wrote any more, so 32 bits of it was not enough on its own. Not a
 * security primitive and never used as one. */
export function contentHash(text: string): string {
  let a = 0x811c9dc5
  let b = 0x01000193
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193) >>> 0
    b = Math.imul(b ^ (c + i), 0x811c9dc5) >>> 0
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0")
}

/** Strip the HTML a rich-text body carries down to the words inside it. The
 * article editor stores markup; a chunk is what a person READS, and a citation
 * that quoted `<p class="x">` back at them would be a bug you can see. */
export function plainText(input: string): string {
  return input
    // A NUL byte is a 500 on the way into SQLite, and the boundary seam that
    // strips them (shared/workers/validate.ts) only ever sees a REQUEST — a
    // mirrored source's words come from a row that was written long ago, by an
    // import or a migration or an older version of a door. One that carried a
    // NUL would fail the sweep, get recorded, and fail again every fifteen
    // minutes forever. Cheapest possible insurance, at the one place every piece
    // of indexable text passes through.
    .split(String.fromCharCode(0)).join("")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t ]+/g, " ")
    // A tag becomes a space, so "<b>invoices</b>." would read "invoices ." — a
    // citation shows these words to a person, and a stray space is nothing to
    // the tokeniser but a typo we introduced to a reader.
    .replace(/ +([,.;:!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Cut a source's text into chunks on the boundaries a person would: paragraphs
 * first, then sentences, then — only for text that has neither, like a pasted
 * table — a hard cut, so one unbroken 50,000-character line still gets indexed
 * instead of becoming one chunk nothing can cite precisely.
 *
 * IT NO LONGER TRUNCATES. It returns every piece the text really has, and the
 * caller decides what to do about a text that is too big — because a function
 * that quietly returned the first two hundred pieces made "the whole document
 * went in" impossible to tell from "the first eight pages went in", at the one
 * place nobody was looking. Returns [] for empty text, never [""]. */
export function chunkText(input: string): string[] {
  const text = plainText(input)
  if (!text) return []
  const chunks: string[] = []
  let current = ""

  const flush = () => {
    const t = current.trim()
    if (t) chunks.push(t)
    current = ""
  }

  // Paragraph → sentence → hard cut, in that order of preference.
  for (const paragraph of text.split(/\n{2,}/)) {
    for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
      for (const piece of hardCut(sentence)) {
        if (current && current.length + piece.length + 1 > CHUNK_TARGET_CHARS) flush()
        current = current ? `${current} ${piece}` : piece
      }
    }
    // A paragraph break is the strongest boundary there is — end the chunk here
    // when it is already worth ending, rather than gluing two topics together.
    if (current.length >= CHUNK_TARGET_CHARS * 0.6) flush()
  }
  flush()
  return chunks
}

/** A run of text with no sentence boundary in it, cut into target-sized pieces. */
function hardCut(sentence: string): string[] {
  if (sentence.length <= CHUNK_TARGET_CHARS) return [sentence]
  const out: string[] = []
  for (let i = 0; i < sentence.length; i += CHUNK_TARGET_CHARS)
    out.push(sentence.slice(i, i + CHUNK_TARGET_CHARS))
  return out
}

/** The words a piece of text contributes to the inverted index, with how often
 * each appears (capped, so a template repeating "invoice" forty times does not
 * outrank a source that is actually about invoices).
 *
 * The SAME function reads a question, which is the point: the index and the
 * query have to agree about what a word is, or stage one silently matches
 * nothing. Anything that isn't a letter or a digit is a separator, so an email
 * address, a reference code and a hyphenated name all break into their parts. */
export function tokenise(text: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const raw of plainText(text).toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || raw.length > 24) continue
    if (STOPWORDS.has(raw)) continue
    counts.set(raw, Math.min((counts.get(raw) ?? 0) + 1, 8))
    if (counts.size >= MAX_TERMS_PER_CHUNK) break
  }
  return counts
}

/** A question's terms, in order of how much they narrow the search: rarer-looking
 * words (longer ones, and anything with a digit in it — a reference, a date, an
 * invoice number) first, so a capped term list keeps the ones that matter. */
export function questionTerms(question: string, max: number): string[] {
  return [...tokenise(question).keys()]
    .sort((a, b) => score(b) - score(a))
    .slice(0, max)
  function score(t: string): number {
    return t.length + (/\d/.test(t) ? 10 : 0)
  }
}

/* --------------------------------- vector --------------------------------- */

/** An embedding, stored. Unit-normalised, then each component quantised to a
 * signed byte and base64'd — 384 dimensions become 512 characters instead of
 * ~4,600 of JSON, and the dot product of two of them is the cosine of the two
 * vectors to within a rounding error that never changed a ranking in testing.
 *
 * Returns null for anything that isn't a finite, non-zero vector, so a model
 * that answers with nulls (or with an error object) stores NOTHING rather than a
 * vector of zeroes that would sit at cosine 0 to every question forever. */
export function encodeEmbedding(vector: number[]): string | null {
  if (!Array.isArray(vector) || vector.length === 0) return null
  let norm = 0
  for (const v of vector) {
    if (typeof v !== "number" || !Number.isFinite(v)) return null
    norm += v * v
  }
  norm = Math.sqrt(norm)
  if (norm === 0) return null
  let binary = ""
  for (const v of vector) {
    const q = Math.max(-127, Math.min(127, Math.round((v / norm) * 127)))
    binary += String.fromCharCode(q < 0 ? q + 256 : q)
  }
  return btoa(binary)
}

/** The stored form, back as signed bytes. Null for anything unreadable — a row
 * written by an older encoding, or a truncated string — so a bad vector degrades
 * that chunk to its lexical score instead of throwing inside a search. */
export function decodeEmbedding(encoded: string | null | undefined): Int8Array | null {
  if (!encoded) return null
  try {
    const binary = atob(encoded)
    const out = new Int8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      const b = binary.charCodeAt(i)
      out[i] = b > 127 ? b - 256 : b
    }
    return out.length ? out : null
  } catch {
    return null
  }
}

/** Cosine similarity of two stored embeddings, in −1…1. Two vectors of different
 * lengths are not comparable (a model was changed under the index), and answering
 * 0 for them is the honest reading: no evidence either way, decided by the
 * lexical half instead. */
export function similarity(a: Int8Array | null, b: Int8Array | null): number {
  if (!a || !b || a.length !== b.length) return 0
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum / (127 * 127)
}
