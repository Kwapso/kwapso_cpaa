// READING THE WORDS OUT OF A FILE THAT IS NOT A TEXT FILE.
//
// ══════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS, measured rather than assumed.
//
// On 2026-08-20 the owner asked what a shared Drive folder actually grabs. The
// answer, counted off his own indexed data, was worse than anybody thought:
//
//   410 Drive documents indexed
//   191 of them (46%) held UNDER 50 CHARACTERS
//
// A Google Doc is exported as plain text and reads fine. Everything else was
// downloaded raw and decoded as UTF-8 — and a .docx is a ZIP, so the decoder hit
// the first non-text byte and stopped, leaving `PK` and three more characters. A
// .png left eight. The assistant could name those files and could not read a
// word of them, which is a large part of "it does not give me satisfactory
// answers".
//
// PDFs were worse than empty: 26 of them, each about 47,000 characters of
// `%PDF-1.6 /Metadata /OCProperties` — file plumbing, indexed as if it were
// prose, competing with real passages in every search.
//
// ── WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT ───────────────────────
//
// Office files are ZIP archives of XML, and a Worker can open them: the ZIP
// format is a directory of entries, and `DecompressionStream("deflate-raw")` is
// in the runtime. So .docx, .xlsx and .pptx are unzipped, the right parts are
// read, and the text between the tags comes out.
//
// A PDF is not a container of text — it is a program that DRAWS text, and doing
// it properly means a font-aware layout engine. What is done here is the honest
// subset: the content streams are inflated and the string literals inside the
// text-showing operators are read. That gets real sentences out of most business
// PDFs (exported decks, invoices, letters) and nothing at all out of a scanned
// one, which has no text in it to find.
//
// AN EMPTY ANSWER IS A RESULT, and the caller must treat it as one. A scan, a
// photo, a video: there are no words in the file, and "" is the truthful answer.
// What must never happen again is the THIRD case — bytes that are not words
// being handed on as if they were.
// ══════════════════════════════════════════════════════════════════════════════

/** How much of one file's text we keep. The same ceiling `driveFileText` has
 * always had, applied after extraction rather than to raw bytes. */
export const FILE_TEXT_CAP = 100_000

/** WHAT KIND OF FILE THIS IS, from the name and the mime together.
 *
 * BOTH, because neither is reliable alone: Drive reports a .docx as
 * `application/vnd.openxmlformats-officedocument.wordprocessingml.document` but
 * reports plenty of files as `application/octet-stream`, and a name can be
 * missing an extension. The mime is trusted first and the extension is the
 * fallback, which is the order that is right when they disagree. */
export type FileShape = "office" | "pdf" | "text" | "opaque"

const OFFICE_MIMES = [
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/msword",
]
const OFFICE_EXTS = [".docx", ".xlsx", ".pptx"]
/** Extensions whose bytes ARE their words. Everything the old reader got right. */
const TEXT_EXTS = [".txt", ".md", ".csv", ".tsv", ".json", ".xml", ".html", ".htm", ".yml", ".yaml", ".log", ".sql", ".ts", ".js", ".py", ".css", ".rtf"]
/** Files with no words in them at all — asked about so the caller can skip the
 * download entirely rather than spend a request proving it. */
const OPAQUE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico", ".mp4", ".mov", ".avi", ".mkv", ".webm", ".mp3", ".wav", ".m4a", ".aac", ".zip", ".gz", ".tar", ".rar", ".7z", ".dmg", ".exe", ".ttf", ".otf", ".woff", ".woff2", ".psd", ".ai", ".sketch", ".fig"]

export function fileShape(name: string, mime: string): FileShape {
  const lower = (name || "").toLowerCase()
  const m = (mime || "").toLowerCase()
  if (m === "application/pdf" || lower.endsWith(".pdf")) return "pdf"
  if (OFFICE_MIMES.some((o) => m.startsWith(o)) || OFFICE_EXTS.some((e) => lower.endsWith(e))) return "office"
  if (m.startsWith("image/") || m.startsWith("video/") || m.startsWith("audio/")) return "opaque"
  if (OPAQUE_EXTS.some((e) => lower.endsWith(e))) return "opaque"
  if (m.startsWith("text/") || TEXT_EXTS.some((e) => lower.endsWith(e))) return "text"
  // An unknown mime with an unknown extension is READ, not refused: the old
  // behaviour for plain files, and `looksLikeProse` below is what stops the
  // result being garbage.
  return "text"
}

/* ────────────────────────────── the ZIP reader ──────────────────────────── */

type ZipEntry = { name: string; body: Uint8Array }

/** Every entry in a ZIP, by name, inflated.
 *
 * WALKED FROM THE LOCAL HEADERS rather than the central directory, and that is
 * the simpler correct choice here: the central directory is authoritative about
 * a corrupt archive, and an Office file written by Office is not corrupt. What
 * the local walk costs is nothing; what it saves is parsing two structures.
 *
 * Only the two compression methods that exist in practice: 0 (stored) and 8
 * (deflate). Anything else is skipped rather than guessed at. */
async function unzip(bytes: Uint8Array, wanted: (name: string) => boolean): Promise<ZipEntry[]> {
  const out: ZipEntry[] = []
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = 0
  while (at + 30 <= bytes.length) {
    if (view.getUint32(at, true) !== 0x04034b50) break // not a local file header
    const method = view.getUint16(at + 8, true)
    const flags = view.getUint16(at + 6, true)
    let compressed = view.getUint32(at + 18, true)
    const nameLen = view.getUint16(at + 26, true)
    const extraLen = view.getUint16(at + 28, true)
    const nameAt = at + 30
    const name = new TextDecoder().decode(bytes.subarray(nameAt, nameAt + nameLen))
    const dataAt = nameAt + nameLen + extraLen
    // A STREAMED ENTRY puts its size AFTER the data (bit 3), so the header says
    // zero and the length has to be found. Office does not write these, so
    // rather than scan for the data descriptor this stops — an honest partial
    // read of the entries before it beats a guess at where this one ends.
    if (flags & 0x08 && !compressed) break
    if (!compressed) { at = dataAt; continue }
    if (wanted(name) && (method === 0 || method === 8)) {
      const raw = bytes.subarray(dataAt, dataAt + compressed)
      out.push({ name, body: method === 0 ? raw : await inflate(raw) })
    }
    at = dataAt + compressed
  }
  return out
}

/** Raw DEFLATE, through the runtime's own stream. Returns empty on a stream the
 * decompressor rejects — one broken part of an archive is not the whole file. */
async function inflate(raw: Uint8Array): Promise<Uint8Array> {
  try {
    const ds = new DecompressionStream("deflate-raw")
    // A one-chunk stream rather than a Blob — the Workers runtime has
    // ReadableStream everywhere and Blob's typings are not part of its lib.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(raw)
        controller.close()
      },
    }).pipeThrough(ds)
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch {
    return new Uint8Array()
  }
}

/* ───────────────────────────── the Office parts ─────────────────────────── */

/** The XML parts that hold the words, per format. Named rather than "every .xml
 * part", because an Office file is full of XML that is styling, relationships
 * and metadata — reading it all would put theme names and font tables into the
 * knowledge base beside the prose. */
function officeParts(name: string): (part: string) => boolean {
  if (name.endsWith("word/document.xml")) return () => true
  return (part) =>
    part === "word/document.xml" ||
    part === "xl/sharedStrings.xml" ||
    part.startsWith("ppt/slides/slide") ||
    part.startsWith("ppt/notesSlides/notesSlide") ||
    (part.startsWith("xl/worksheets/sheet") && part.endsWith(".xml")) ||
    part === "word/footnotes.xml" ||
    part === "word/endnotes.xml"
}

/** THE WORDS BETWEEN THE TAGS, with the paragraph breaks kept.
 *
 * Office puts every run of text in its own element, so a naive strip glues
 * sentences to each other ("theendof onerun" ). The block-level tags below are
 * turned into whitespace FIRST so words stay apart and paragraphs stay
 * paragraphs; then the remaining tags go. */
function xmlText(xml: string): string {
  return xml
    // A cell, a paragraph, a line break and a slide are all "start a new line".
    .replace(/<\/(w:p|a:p|w:tr|c|si)>/g, "\n")
    .replace(/<(w:br|w:cr|a:br)\b[^>]*\/?>/g, "\n")
    // A run boundary is a word boundary, never a letter boundary.
    .replace(/<\/(w:t|a:t|t)>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    // `&amp;` LAST, so `&amp;lt;` does not become a tag.
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

async function officeText(bytes: Uint8Array): Promise<string> {
  const parts = await unzip(bytes, officeParts(""))
  if (!parts.length) return ""
  // Slides in order, then everything else — a deck read out of order is a deck
  // whose passages quote the wrong section.
  parts.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }))
  const decoder = new TextDecoder()
  return parts.map((p) => xmlText(decoder.decode(p.body))).filter(Boolean).join("\n\n").slice(0, FILE_TEXT_CAP)
}

/* ─────────────────────────────────── PDF ────────────────────────────────── */

/** THE STRINGS A PDF DRAWS.
 *
 * A PDF's page content is a little program: `(Hello) Tj` shows a string,
 * `[(He)-20(llo)] TJ` shows several with kerning between them. Those literals
 * are the text. Everything else in the file — the object graph, the fonts, the
 * colour spaces — is machinery, and it is machinery that was being indexed as
 * prose before this existed.
 *
 * The streams are usually Flate-compressed, so each one is inflated first; an
 * uncompressed PDF is read as-is. What this cannot do is a SCANNED page, which
 * holds an image and no text at all — that comes back empty, which is true. */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const latin = new TextDecoder("latin1")
  const whole = latin.decode(bytes)
  const chunks: string[] = []
  // Every `stream … endstream`, inflated where it will inflate.
  const re = /stream\r?\n?([\s\S]*?)endstream/g
  let m: RegExpExecArray | null
  let budget = 0
  while ((m = re.exec(whole)) && budget < 400) {
    budget++
    const start = m.index + m[0].indexOf(m[1])
    const raw = bytes.subarray(start, start + m[1].length)
    const inflated = await inflate(raw)
    const body = inflated.length ? latin.decode(inflated) : m[1]
    if (!/(Tj|TJ)\b/.test(body)) continue
    chunks.push(drawnStrings(body))
    if (chunks.join("").length > FILE_TEXT_CAP) break
  }
  return chunks.join("\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, FILE_TEXT_CAP)
}

/** The literals inside the text-showing operators of one content stream. */
function drawnStrings(body: string): string {
  const out: string[] = []
  const re = /\((?:\\.|[^\\()])*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    const lit = m[0]
      .slice(1, -1)
      .replace(/\\([nrtbf])/g, (_, c) => ({ n: "\n", r: "\n", t: "\t", b: "", f: "\n" })[c as string] ?? "")
      .replace(/\\([0-7]{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
      .replace(/\\(.)/g, "$1")
    if (lit.trim()) out.push(lit)
  }
  // `ET` ends a text object, which is the closest thing a content stream has to
  // a line ending; without it a whole page arrives as one run-on line.
  return out.join(" ").replace(/\s*\bET\b\s*/g, "\n")
}

/* ──────────────────────────────── the door ──────────────────────────────── */

/** IS THIS PROSE, OR IS IT BYTES THAT SURVIVED A DECODER?
 *
 * The guard the old reader's comment claimed and never had. A file that is
 * mostly control characters and replacement marks is not text we read — it is
 * text we failed to read, and the honest answer is nothing rather than a
 * plausible-looking 47,000 characters of file structure. */
export function looksLikeProse(text: string): boolean {
  if (text.length < 8) return false
  const sample = text.slice(0, 4000)
  let readable = 0
  for (const ch of sample) {
    const c = ch.codePointAt(0) ?? 0
    if (ch === "\n" || ch === "\t" || (c >= 32 && c !== 0xfffd)) readable++
  }
  return readable / sample.length > 0.85
}

/** ONE FILE'S WORDS, whatever kind of file it is. Empty means "there are no
 * words in this", which is a true and useful answer. */
export async function extractFileText(
  bytes: Uint8Array,
  name: string,
  mime: string
): Promise<string> {
  const shape = fileShape(name, mime)
  if (shape === "opaque") return ""
  if (shape === "office") return officeText(bytes)
  if (shape === "pdf") {
    const text = await pdfText(bytes)
    return looksLikeProse(text) ? text : ""
  }
  const text = new TextDecoder().decode(bytes).slice(0, FILE_TEXT_CAP)
  return looksLikeProse(text) ? text : ""
}
