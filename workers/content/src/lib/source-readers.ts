// WHICH READER TURNS THIS THING INTO WORDS — one declared table, asked by every
// door, chosen by none of them.
//
// ── WHY THIS EXISTS, AND IT IS A REPAIR RATHER THAN A PRECAUTION ────────────
//
// Until 27 Aug 2026 this app had TWO readers and no table, and which one a file
// got was decided by the door it walked through:
//
//   the UPLOAD door  -> `extractFile`, which converts with `env.AI.toMarkdown`
//                       and reads PDFs, images, html, Office and OpenDocument
//   the DRIVE lane   -> `extractFileText`, hand-rolled, which reads .pptx that
//                       the converter cannot — and reads a PDF as glyph indices
//                       and an image not at all
//
// So a PDF somebody uploaded was searchable and the SAME PDF sitting in a Drive
// folder was 46 chunks of page geometry. Nobody decided that. It is what happens
// when the reader is picked at the call site instead of declared, and it had
// already happened twice before anybody looked.
//
// The two are COMPLEMENTARY, which is the whole argument for a table rather than
// a winner: the right answer for `.pptx` is the unzip reader and the right answer
// for a PDF is the converter, so what a door needs is a PREFERENCE PER TYPE with
// somewhere to fall back to — not one reader per door.
//
// ── WHY IT IS SAFE TO CHANGE WHAT A READER RETURNS ─────────────────────────
//
// Because the sweep repairs what it already stored, and that is tested rather
// than assumed (`google-ingest.test.ts`, "a Drive file that stops being readable
// repairs itself"). Every walk re-hydrates each file and hydration REPLACES the
// body, so a better reader means a different body, a different content hash, a
// hash-skip that declines to skip, and a source re-chunked from the new text —
// keeping its id, its compartment, its fence and its history.
//
// That is what makes a new reader repair the documents already in the base
// without anybody re-uploading anything, and it is why this table can be edited
// with confidence rather than only appended to.
//
// ── THE ONE RULE (R42) ─────────────────────────────────────────────────────
//
// Every accepted type resolves to a declared reader ON EVERY DOOR, or to an
// honest refusal — and no door chooses its own. The last clause is the
// load-bearing one: a door that reaches past this table is the defect this file
// was written to end, and `source-readers.test.ts` reads both doors off the disk
// to say so.

import type { Ai } from "@cloudflare/workers-types"

import { looksLikeProse, officeText, readsLikeWords } from "./file-text"

/** Everything a reader needs from the worker. Narrow on purpose: a reader has no
 * business with a database, a guard or a token. */
export type ReaderEnv = { AI: Ai }

/** THE READERS THEMSELVES. Three, and the names are what the table below and the
 * law refer to — a name here that nothing declares is as much a defect as a type
 * that resolves to nothing. */
export type ReaderName =
  /** Cloudflare's own document conversion. Reads a PDF properly (it is the one
   * that handles subsetted fonts, which is what defeats a hand-rolled parser),
   * and describes an image. Costs a model call. */
  | "markdown"
  /** OOXML unzipped in-process. The only reader that handles `.pptx`, and a free
   * fallback for `.docx`/`.xlsx` when the converter is unavailable. */
  | "office-zip"
  /** The bytes ARE the words. No call, no cost. */
  | "plain"

/** A KIND OF THING SOMEBODY BRINGS, and the readers to try for it in order. */
export type SourceType = {
  /** What a person calls it — used in the sentence shown for a refusal. */
  label: string
  mimes: readonly string[]
  extensions: readonly string[]
  /** IN ORDER. The first that yields usable text wins; a reader that yields
   * nothing is not a failure, it is the next one's turn. */
  readers: readonly ReaderName[]
  /** Why THIS order for THIS type. Read by a person, and rot-checked by the law:
   * an entry with no reason is an entry nobody thought about. */
  why: string
  /** Hold the result to the word-shape test as well as the readable-character
   * one. Only where a reader can plausibly return readable NON-words — a PDF
   * whose page geometry is printable to the last byte. */
  mustReadLikeWords?: true
}

/** THE TABLE. Order within a type matters; order between types does not. */
export const SOURCE_TYPES: readonly SourceType[] = [
  {
    label: "PDF",
    mimes: ["application/pdf"],
    extensions: ["pdf"],
    readers: ["markdown"],
    // The hand-rolled reader is deliberately NOT a fallback here. It returns
    // glyph indices for any document using a subsetted font, which is most of
    // them, and a fallback that returns confident rubbish is worse than none —
    // every PDF in the agency's base scored 0.000 on letter-shaped tokens.
    why: "only the converter handles subsetted fonts; the hand-rolled reader returns glyph indices",
    mustReadLikeWords: true,
  },
  {
    label: "Image",
    mimes: ["image/jpeg", "image/png", "image/webp", "image/svg+xml", "image/gif", "image/bmp"],
    extensions: ["jpeg", "jpg", "png", "webp", "svg", "gif", "bmp"],
    readers: ["markdown"],
    why: "the converter describes what is in the picture; nothing else here can read an image at all",
  },
  {
    label: "PowerPoint",
    mimes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    extensions: ["pptx"],
    readers: ["office-zip"],
    // The one type where the hand-rolled reader is AHEAD: the converter does not
    // list PowerPoint, and a deck is one of the likeliest things to be dropped.
    why: "the converter does not read decks; the unzip reader does, in slide order",
  },
  {
    label: "Word document",
    mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    extensions: ["docx"],
    readers: ["markdown", "office-zip"],
    why: "the converter keeps structure; the unzip reader is a free fallback when it is unavailable",
  },
  {
    label: "Spreadsheet",
    mimes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel.sheet.macroenabled.12",
      "application/vnd.ms-excel.sheet.binary.macroenabled.12",
      "application/vnd.ms-excel",
      "application/vnd.oasis.opendocument.spreadsheet",
      "application/vnd.apple.numbers",
    ],
    extensions: ["xlsx", "xlsm", "xlsb", "xls", "et", "ods", "numbers"],
    readers: ["markdown", "office-zip"],
    why: "same as Word — the converter first, the unzip reader as a free fallback",
  },
  {
    label: "Open Document text",
    mimes: ["application/vnd.oasis.opendocument.text"],
    extensions: ["odt"],
    readers: ["markdown"],
    why: "the converter reads it; the unzip reader is OOXML and would not",
  },
  {
    label: "Web page",
    mimes: ["text/html", "application/xml"],
    extensions: ["html", "htm", "xml"],
    readers: ["markdown", "plain"],
    why: "the converter strips the furniture; plain text is the honest fallback",
  },
  {
    label: "Plain text",
    mimes: ["text/plain", "text/markdown"],
    extensions: [
      "txt", "md", "markdown", "log", "json", "yaml", "yml", "rtf", "tsv",
      "sql", "ts", "js", "py", "css",
    ],
    readers: ["plain"],
    why: "the bytes are the words; a model call here would cost something and add nothing",
  },
  {
    label: "Comma-separated values",
    mimes: ["text/csv"],
    extensions: ["csv"],
    readers: ["markdown", "plain"],
    // Its own entry rather than plain text, because the door has always
    // converted it and the converter turns a sheet into a table a reader can
    // follow. `plain` behind it is the free fallback the old door had no room
    // for: a CSV whose conversion fails is still perfectly readable as itself.
    why: "the converter makes a table; the bytes are a true fallback when it cannot",
  },
]

/** THINGS WITH NO WORDS IN THEM — declared, so that "we cannot read this" is a
 * decision somebody wrote down rather than the absence of one.
 *
 * Video and audio sit here TODAY and are the next entries to move up, not
 * permanent members: transcription is a reader this table has room for and the
 * app does not yet have. Saying so here is what stops the next person reading
 * this list as a judgement about what is possible. */
export const UNREADABLE_TYPES: readonly { label: string; mimes: readonly string[]; extensions: readonly string[]; why: string }[] = [
  {
    label: "Artwork",
    mimes: ["application/postscript"],
    extensions: ["eps", "ai", "psd", "sketch", "fig", "svgz"],
    why: "vector artwork has no prose in it; its page description is printable and meaningless",
  },
  {
    label: "Archive",
    mimes: ["application/zip", "application/x-tar", "application/gzip"],
    extensions: ["zip", "gz", "tar", "rar", "7z", "dmg", "exe"],
    why: "an archive is other files; reading it means unpacking it, which is a different feature",
  },
  {
    label: "Font",
    mimes: ["font/ttf", "font/otf", "font/woff", "font/woff2"],
    extensions: ["ttf", "otf", "woff", "woff2"],
    why: "a font is shapes for letters, not letters",
  },
  {
    label: "Mail template",
    mimes: [],
    extensions: ["oft", "msg"],
    why: "an Outlook template is an OLE container; there is no reader here for one",
  },
  {
    label: "Video",
    mimes: ["video/mp4", "video/quicktime", "video/webm"],
    extensions: ["mp4", "mov", "avi", "mkv", "webm"],
    why: "NOT permanent — transcription is a reader this table has room for and the app has not built",
  },
  {
    label: "Audio",
    mimes: ["audio/mpeg", "audio/wav", "audio/mp4"],
    extensions: ["mp3", "wav", "m4a", "aac"],
    why: "NOT permanent — the same transcription reader as video",
  },
]

function extensionOf(name: string): string {
  const dot = (name || "").lastIndexOf(".")
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ""
}

const matches = (t: { mimes: readonly string[]; extensions: readonly string[] }, name: string, mime: string) =>
  t.mimes.includes((mime || "").toLowerCase().split(";")[0].trim()) || t.extensions.includes(extensionOf(name))

/** WHAT KIND OF THING IS THIS, out of the two declared lists.
 *
 * `null` means neither list names it — which is NOT the same as unreadable. An
 * unknown extension with no mime is READ as plain text, the behaviour this app
 * has always had, because a file somebody's desktop calls `.notes` is usually
 * words. What stops that being garbage is the prose guard, not this function. */
export function classify(name: string, mime: string): SourceType | null {
  return SOURCE_TYPES.find((t) => matches(t, name, mime)) ?? null
}

/** Is this a thing we have decided we cannot read? */
export function declaredUnreadable(name: string, mime: string): { label: string; why: string } | null {
  return UNREADABLE_TYPES.find((t) => matches(t, name, mime)) ?? null
}

/** THE READERS TO TRY, IN ORDER. Empty means an honest refusal — R42's other
 * half. Every door asks this and no door decides for itself. */
export function readersFor(name: string, mime: string): readonly ReaderName[] {
  if (declaredUnreadable(name, mime)) return []
  const type = classify(name, mime)
  if (type) return type.readers
  // Unknown, and read as plain text on purpose — see `classify`.
  return ["plain"]
}

/** THE R11-SHAPED CEILING on a binding call with no AbortSignal of its own. The
 * conversion keeps running in the background if it is slow; what this bounds is
 * how long the caller waits — a person at the upload door, or a sweep with forty
 * more files behind this one. */
const CONVERT_TIMEOUT_MS = 20_000

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`conversion timed out after ${ms}ms`)), ms)
    ),
  ])
}

/** Run one named reader. Nothing here decides WHETHER to run; that is the
 * table's job and this is the doing.
 *
 * Exported because the UPLOAD door runs the chain itself: it has a person
 * standing in front of it and says a different sentence for each way a read can
 * end, which the sweep has no use for. It asks this table which readers, in
 * which order — that is R42 — and keeps its own words about the answer. */
export async function runReader(
  reader: ReaderName,
  env: ReaderEnv,
  file: { bytes: Uint8Array; name: string; mime: string }
): Promise<{ text: string; error?: string }> {
  if (reader === "plain")
    return { text: new TextDecoder("utf-8", { fatal: false, ignoreBOM: false }).decode(file.bytes).trim() }
  if (reader === "office-zip") return { text: await officeText(file.bytes) }
  const out = await withTimeout(
    env.AI.toMarkdown(
      { name: file.name, blob: new Blob([file.bytes as unknown as ArrayBuffer], { type: file.mime }) },
      // NO PDF METADATA, and it is a MEASURED decision rather than a preference —
      // moved here from the upload door so BOTH doors get it. The converter's
      // default prepends the producer, creation date, PDF version and half a
      // dozen `IsSomethingPresent=false` lines. On the first real document put
      // through that door — a one-page runbook — the preamble was 80% of the 834
      // bytes extracted and it was what came back as the PASSAGE. It also poisons
      // the embedding: every PDF then shares four hundred identical characters
      // and resembles every other PDF more than it resembles any question.
      { conversionOptions: { pdf: { metadata: false } } }
    ),
    CONVERT_TIMEOUT_MS
  )
  const said = out as { format?: string; error?: string; data?: unknown }
  // THE REASON TRAVELS WITH THE FAILURE. The upload door says it to the person —
  // "we couldn't read this file (corrupt document)" is a sentence they can act
  // on and "we found no text" is not — so a shared reader that swallowed it
  // would have taken something real away from the door it was meant to serve.
  if (said?.format === "error") return { text: "", error: said.error || "conversion failed" }
  return { text: typeof said?.data === "string" ? (said.data ?? "").trim() : "" }
}

/** ONE FILE'S WORDS, by the table.
 *
 * Tries each declared reader in order and keeps the first result that survives
 * the guards. A reader that yields nothing is not an error — it is the next
 * one's turn — and a reader that THROWS is the same, because one unreadable file
 * must never take a whole folder's sweep down with it (`driveFileText`'s own 403
 * note records the day that happened).
 *
 * Empty means "there are no words in this", which is a true and useful answer
 * and the one the door turns into "stored, not searchable". */
export async function readSource(
  env: ReaderEnv,
  file: { bytes: Uint8Array; name: string; mime: string }
): Promise<string> {
  const type = classify(file.name, file.mime)
  for (const reader of readersFor(file.name, file.mime)) {
    let text = ""
    try {
      text = (await runReader(reader, env, file)).text
    } catch {
      continue
    }
    if (!text || !looksLikeProse(text)) continue
    if (type?.mustReadLikeWords && !readsLikeWords(text)) continue
    return text
  }
  return ""
}
