// TURNING A FILE INTO WORDS — the whole of the third way into the knowledge
// base, in one file, because it is one decision made three times over.
//
// ════════════════════════════════════════════════════════════════════════════
// THE DECISION: WE ACCEPT EVERYTHING AND WE LIE ABOUT NOTHING.
//
// The owner's sentence was "any type of file that is sitting locally on my
// desktop". A converter that reads a dozen formats cannot honour that on its
// own, so the feature is built as two promises that are kept separately:
//
//   1. THE FILE IS ALWAYS KEPT. Whatever it is — a deck, a zip, a Sketch file,
//      a font — it is stored, it becomes a source, it appears in the list, and
//      it can be opened again. Refusing half of what a person has on their
//      desktop is not "any type of file".
//   2. THE WORDS ARE ONLY EVER CLAIMED WHEN THEY EXIST. A file we could not
//      read has NO body, is indexed into NO searchable pieces, and carries a
//      sentence saying so that every screen showing it repeats. A knowledge
//      base that quietly holds a document it never read is worse than one that
//      refused it, because the refusal is visible and the silence is not.
//
// Those two together are what "stored, not searchable" means on the screen, and
// nothing here may ever produce a third state where a source LOOKS indexed and
// is not.
//
// ════════════════════════════════════════════════════════════════════════════
// THE EXTRACTOR IS `env.AI.toMarkdown()`, AND NOTHING ELSE.
//
// No parsing dependency. Cloudflare's Markdown Conversion is a method on the AI
// binding this worker already holds for its embeddings, so a PDF, a Word
// document, a spreadsheet, an image or a saved web page becomes markdown with
// no new package, no new secret and no new socket. What it supports is written
// down below, from Cloudflare's own published table, because a list nobody can
// find is a list the next person re-derives by trial and error.
//
// Two things it does NOT support are worth saying out loud, since both are
// things a person will absolutely drop on this screen:
//   • POWERPOINT (.pptx / .ppt). A deck stores and lists; its words do not.
//   • ANYTHING ARCHIVED (.zip, .tar) and any proprietary design format.
// Neither is refused. Both say so.
//
// PLAIN TEXT DOES NOT GO THROUGH IT AT ALL. A .txt, a .md or a .log IS already
// its own words: decoding the bytes is exact, instant, free, and cannot fail in
// a way a converter can. Sending it to a conversion service would be a network
// round-trip to be told what we already have.

import { GuardError } from "@shared/workers/gating"
import { DOCUMENT_LIMIT_BYTES } from "@shared/workers/validate"
import type { Env } from "../env"

/** WHAT `toMarkdown` CAN READ TODAY — Cloudflare's own published table
 * (developers.cloudflare.com/workers-ai/features/markdown-conversion/supported-formats),
 * read on 2026-08-14 and written down here rather than linked, because a
 * capability we depend on has to be visible at the code that depends on it.
 *
 * Matched on the DECLARED mime first and the file's EXTENSION second: a browser
 * that has never met `.numbers` sends `application/octet-stream`, and the name
 * is then the only thing that knows. Neither is trusted for anything but this
 * choice — a wrong guess costs one conversion attempt, whose failure is already
 * handled below.
 *
 * If this list is stale, the failure is soft and honest in both directions: a
 * newly-supported format we have not listed is stored and labelled unreadable
 * (a person can re-upload it once the list catches up), and a format dropped
 * from the service comes back as a conversion error, which is the same
 * "stored, not searchable" ending by the other road. Nothing silently claims to
 * have been read. */
const CONVERTIBLE_MIMES = new Set([
  "application/pdf",
  // Images: object detection + a description, on Workers AI. The one family
  // here that is a JUDGEMENT rather than a reading — see `convert`.
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/svg+xml",
  "image/gif",
  "image/bmp",
  "text/html",
  "application/xml",
  // Microsoft Office — spreadsheets and Word. NOT PowerPoint: the service does
  // not list it, and a deck is one of the likeliest things to be dropped here.
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroenabled.12",
  "application/vnd.ms-excel.sheet.binary.macroenabled.12",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Open Document
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.text",
  "text/csv",
  "application/vnd.apple.numbers",
])

/** The same list by file extension, for the case where the browser declared
 * nothing useful. Kept beside the mimes rather than derived from them: the
 * service's own table lists extensions the mime set does not name one-to-one
 * (`.htm`, `.et`, `.xls`), and a derivation would quietly drop them. */
const CONVERTIBLE_EXTENSIONS = new Set([
  "pdf",
  "jpeg", "jpg", "png", "webp", "svg", "gif", "bmp",
  "html", "htm",
  "xml",
  "xlsx", "xlsm", "xlsb", "xls", "et", "docx",
  "ods", "odt",
  "csv",
  "numbers",
])

/** FILES THAT ARE ALREADY THEIR OWN WORDS. Decoded here, never converted. The
 * extension list is what a person's desktop actually holds; `text/*` catches the
 * rest, because anything a browser is willing to call text is text. */
const PLAIN_TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "log", "json", "yaml", "yml", "rtf", "tsv",
])

/** WHAT WE CAN SAY ABOUT A FILE WE COULD NOT READ, by the family it belongs to.
 * A person who is told "we can't read this" wants to know whether that is a
 * mistake they can fix, and for two of these it is (export the deck as a PDF,
 * unzip the archive) — so the sentence says so. Everything unlisted falls
 * through to the general one, which is still true and still says the two things
 * that matter: it is kept, and it is not searchable. */
const UNREADABLE_REASON: Record<string, string> = {
  pptx: "We keep presentations but can't read their words yet — export it as a PDF and add that too if you want it searchable.",
  ppt: "We keep presentations but can't read their words yet — export it as a PDF and add that too if you want it searchable.",
  key: "We keep presentations but can't read their words yet — export it as a PDF and add that too if you want it searchable.",
  zip: "This is an archive, so there is nothing to read until it is unpacked — the file is kept, and the assistant can't answer from it.",
  doc: "This is the old Word format, which we can't read — save it as .docx or a PDF and add that too if you want it searchable.",
}

/** What one file became. `text` null means we could not read it, and then `note`
 * always says why: the two travel together so that no caller can store one
 * without the other, which is the only way "never pretend a file was indexed"
 * survives a future edit. */
export type ExtractedFile = {
  text: string | null
  /** why there are no words, or why there are fewer than the file holds — in
   * plain sentences a person reads on the screen. Null when the whole file was
   * read. */
  note: string | null
}

/** How long we will wait for one document to be converted.
 *
 * R11 EXEMPTS THIS AND IT IS WRITTEN ANYWAY. The law's own sentence is that a
 * BINDING call is Cloudflare-bounded and therefore exempt, and `env.AI` is a
 * binding — the same reason `env.AI.run` on the embedding path carries no
 * signal. But a conversion is not an embedding: it is a variable amount of work
 * on a file whose size a person chose, on a service marked Beta, and the thing
 * R11 exists to prevent (one slow sub-request holding a worker open while a
 * person watches a spinner) is exactly the failure available here. So the
 * ceiling is written, and what happens past it is the same honest ending as any
 * other conversion failure: the file is kept, and it says it could not be read.
 *
 * Twenty seconds is roughly a large scanned PDF's real conversion time with
 * room to spare, and well inside the request the caller is waiting on. */
const CONVERT_TIMEOUT_MS = 20_000

/** The file's extension, lowercased, or "". */
function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".")
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : ""
}

/** Is this something we can read at all, and how? Exported because the DOOR
 * says so to the person before anything is stored, and a screen that promises
 * one thing while the extractor does another is the disagreement this prevents. */
export function readability(
  contentType: string,
  fileName: string
): "text" | "convert" | "unreadable" {
  const ext = extensionOf(fileName)
  if (contentType.startsWith("text/") && !CONVERTIBLE_MIMES.has(contentType)) return "text"
  if (PLAIN_TEXT_EXTENSIONS.has(ext)) return "text"
  if (CONVERTIBLE_MIMES.has(contentType)) return "convert"
  if (CONVERTIBLE_EXTENSIONS.has(ext)) return "convert"
  return "unreadable"
}

/** The sentence for a file whose words we cannot get at. */
export function unreadableNote(fileName: string): string {
  return (
    UNREADABLE_REASON[extensionOf(fileName)] ??
    "We couldn't read this kind of file, so it is kept here but the assistant can't answer from it. Anything you type into the note below IS searchable."
  )
}

/** CUT TO WHAT ONE ROW CAN HOLD, and say that it was cut.
 *
 * A 600-page PDF converts to more text than a D1 row may carry
 * (`DOCUMENT_LIMIT_BYTES`). The typed-note door REFUSES at that ceiling and
 * saves nothing, which is right there — a person pasting text can split it. It
 * would be wrong here: the FILE is already accepted and already kept, and
 * throwing away the first million characters we successfully read because there
 * were more is a worse answer than an incomplete one. So it is cut, and the cut
 * is stated on the row in both numbers, exactly as `indexSource` states its own
 * overflow — the rule is "never silently trimmed", not "never trimmed".
 *
 * Cut by BYTES, walking back to a whole character: a slice that lands mid-
 * codepoint is a broken word in an answer somebody quotes. */
export function capToRow(text: string): ExtractedFile {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(text).length
  if (bytes <= DOCUMENT_LIMIT_BYTES) return { text, note: null }
  // Bytes-per-character is at least 1, so the byte budget is a safe upper bound
  // on the characters to keep; step back until the encoding fits.
  let end = Math.min(text.length, DOCUMENT_LIMIT_BYTES)
  while (end > 0 && encoder.encode(text.slice(0, end)).length > DOCUMENT_LIMIT_BYTES) {
    // Overshoot is at most 3 bytes per character, so this converges in a few
    // passes from the ratio rather than one character at a time.
    end = Math.floor(end * (DOCUMENT_LIMIT_BYTES / encoder.encode(text.slice(0, end)).length))
  }
  return {
    text: text.slice(0, end),
    note: `This file holds ${mb(bytes)} of text and one source can hold ${mb(DOCUMENT_LIMIT_BYTES)} — the first ${mb(DOCUMENT_LIMIT_BYTES)} is searchable and the whole file is kept. Add the rest as a second source if you need it.`,
  }
}

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`

/** READ A FILE. The one entry point, and the only place that decides whether a
 * source has words.
 *
 * Never throws for a file it could not read — that is an OUTCOME, not an error,
 * and the caller's job is to store the file either way. It throws only for the
 * one thing that is genuinely the caller's fault (an empty file), because a
 * source with nothing in it and nothing to open is not a source. */
export async function extractFile(
  env: Env,
  file: { bytes: Uint8Array; contentType: string; fileName: string }
): Promise<ExtractedFile> {
  if (!file.bytes.length) throw new GuardError(400, "invalid_input", "That file is empty.")

  const how = readability(file.contentType, file.fileName)
  if (how === "unreadable") return { text: null, note: unreadableNote(file.fileName) }

  if (how === "text") {
    // `fatal: false` on purpose: a log file with one bad byte in it is still a
    // log file, and the replacement character is a truer answer than refusing.
    const decoded = new TextDecoder("utf-8", { fatal: false, ignoreBOM: false }).decode(file.bytes).trim()
    return decoded
      ? capToRow(decoded)
      : { text: null, note: "This file has no text in it, so there is nothing for the assistant to read." }
  }

  try {
    const converted = await withTimeout(
      env.AI.toMarkdown({
        name: file.fileName,
        // The type the browser declared, handed on so the converter can pick a
        // reader. It is not trusted anywhere else — the stored object is
        // labelled application/octet-stream regardless (shared/workers/image.ts).
        blob: new Blob([file.bytes as unknown as ArrayBuffer], { type: file.contentType }),
      }),
      CONVERT_TIMEOUT_MS
    )
    if (converted.format === "error")
      return {
        text: null,
        note: `We couldn't read this file (${converted.error}). It is kept here, but the assistant can't answer from it.`,
      }
    const text = (converted.data ?? "").trim()
    return text
      ? capToRow(text)
      : {
          text: null,
          note: "We read this file and found no text in it — an image with nothing written on it, or a scan we couldn't make out. It is kept here either way.",
        }
  } catch (e) {
    // Loud in the log, honest on the row. ERROR-HANDLING.md's rule is never to
    // swallow: the console line is what an operator finds, and the note is what
    // the person who uploaded it reads.
    console.error("knowledge file conversion failed:", e)
    return {
      text: null,
      note: "We couldn't read this file just now — it is kept here, and you can add it again later to try once more.",
    }
  }
}

/** The R11-shaped ceiling on a binding call that has no AbortSignal of its own.
 * The conversion keeps running in the background if it is slow; what this bounds
 * is how long the PERSON waits, which is the thing that was at risk. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`conversion timed out after ${ms}ms`)), ms)
    ),
  ])
}
