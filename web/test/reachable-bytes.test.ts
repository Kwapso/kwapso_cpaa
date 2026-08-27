// R40 — A STORED FILE MUST REACH A PERSON.
//
// THREE INSTANCES OF ONE BUG, every one of them under a green build.
//
//   · a STORY's attachments were written by the edit dialog and the review
//     dialog, and rendered by no screen at all. The owner attached two
//     screenshots, saved, and never saw them again (fixed 96ea8fe1);
//   · a CLIENT uploaded a document through the portal's "Send a file", and the
//     agency was shown the FILENAME as plain text in a metadata line. The URL
//     was on the row and read by no component in either front door;
//   · a TASK's `file_url` was write-only from the day the door shipped. A
//     colleague photographed the letter, attached it, and the record went on
//     saying no file existed.
//
// In all three the door answered 200, the bytes were in R2 and the row was
// correct. That is exactly why nothing caught them: everything worked except the
// last step, and the last step is the only one a person experiences. R15 makes a
// published change reach a listener; R16 makes a count reach a screen; nothing
// made BYTES reach anybody.
//
// THE CHECK WALKS WRITE → READ, because that is the direction the failure runs.
// Starting from the screens would only ever find the files that ARE shown.
//
// AND IT ASKS A DIFFERENT QUESTION AT EACH END, on purpose — a check that
// derived both halves the same way would be a parser agreeing with itself:
//
//   · the WRITE census is grounded in the WRANGLER CONFIGS. Which bindings are
//     buckets is a deployment fact, not a naming convention, so `env.MEDIA.put(`
//     counts and `this.ctx.storage.kv.put(` does not, and nobody has to keep a
//     list of bucket names in a test file.
//   · the READ proof is grounded in the BROWSER. Bytes reach a person through an
//     attribute the browser fetches — `href`, `src`, `picture` — and through
//     nothing else. A field in a `<p>` is not a read. A field written back into
//     an edit form is not a read either, and that subtraction is the whole
//     discriminator: `todo.fileName` sat in a paragraph and `task.fileName` sat
//     in a form's initial values, which is how both looked handled.

import { readFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"
import { STORED_FILES } from "@shared/rules/registry"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..", "..")
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8")

/** THE BUCKET BINDINGS, from the deployment config rather than from a list here.
 *
 * A wrangler `r2_buckets` entry is the only thing that makes `env.X` a bucket, so
 * this is the honest source — and it means a bucket added next year is watched
 * the day its binding is declared. */
function bucketBindings(): Set<string> {
  const names = new Set<string>()
  for (const f of sourceFiles(join(ROOT, "workers"), { extensions: ["wrangler.jsonc"], relativeTo: ROOT })) {
    // The configs are JSONC with comments; the binding names are what we need
    // and they only ever appear inside an r2_buckets array.
    for (const block of f.source.matchAll(/"r2_buckets"\s*:\s*\[([\s\S]*?)\]/g))
      for (const m of block[1].matchAll(/"binding"\s*:\s*"([A-Z_]+)"/g)) names.add(m[1])
  }
  return names
}

/** Every worker source file that PUTS BYTES somewhere a person could later fetch
 * them — a bucket binding's own `.put(`, or the one shared seam that does it for
 * you (`storeImageDataUrl`, which hides a `bucket.put` behind a helper and is how
 * four of these doors write without the word `.put` appearing at all). */
function byteWriters(bindings: Set<string>): Map<string, number> {
  const out = new Map<string, number>()
  const bucketPut = new RegExp(`\\benv\\.(?:${[...bindings].join("|")})\\.put\\(`, "g")
  for (const f of sourceFiles(join(ROOT, "workers"), { extensions: [".ts"], relativeTo: ROOT, skipTests: true })) {
    const src = stripComments(f.source)
    const n = (src.match(bucketPut) ?? []).length + (src.match(/\bstoreImageDataUrl\(/g) ?? []).length
    if (n > 0) out.set(f.rel.split("\\").join("/"), n)
  }
  return out
}

/** DOES THIS FILE PUT THAT FIELD IN FRONT OF SOMEBODY?
 *
 * Two shapes, and only two, because those are the two the app actually uses:
 *
 *   direct    `href={safeHref(task.fileUrl)}`   `picture={a.fileUrl}`
 *   by way of `const link = safeHref(c.fileUrl)` … `href={link}`
 *
 * The indirection has to be followed rather than waved through, and the reason is
 * the mutation test at the bottom of this file: `story-attachments.tsx` calls
 * `safeHref(url)` inside a helper that only DECIDES whether to link. Accepting "it
 * was passed to safeHref somewhere" would have let the anchor be deleted with the
 * check still green — which is the exact bug, wearing the fix's clothes. */
function rendersField(src: string, property: string): boolean {
  const attr = (expr: string) =>
    new RegExp(`(?:href|src|picture)=\\{[^}]*\\b${expr}\\b`).test(src)
  if (attr(property)) return true
  for (const m of src.matchAll(
    new RegExp(`\\bconst\\s+(\\w+)\\s*=\\s*(?:safeHref|safeSrc)\\([^)]*\\b${property}\\b`, "g")
  ))
    if (attr(m[1])) return true
  return false
}

describe("R40 — every stored file reaches a person", () => {
  it("reachable-bytes: every door that stores bytes is claimed, and its field is rendered", () => {
    const bindings = bucketBindings()
    // TRIPWIRE. A census that finds nothing reports "all clear" in exactly the
    // same words as a passing one — and a renamed binding would empty this
    // silently, which is the failure mode this whole file is about.
    expect(
      bindings.size,
      "no r2_buckets bindings found in any wrangler config — the write census has gone blind"
    ).toBeGreaterThan(1)

    const writers = byteWriters(bindings)
    expect(
      writers.size,
      "no worker file writes bytes to a bucket — the write census has gone blind"
    ).toBeGreaterThan(5)

    // 1 · EVERY WRITE SITE IS CLAIMED. A new upload door arrives red.
    const claimed = new Set(STORED_FILES.map((e) => e.writtenIn))
    const unclaimed = [...writers.keys()].filter((f) => !claimed.has(f))
    expect(
      unclaimed,
      `these doors store bytes and no STORED_FILES entry says where a person meets them again (R40).\n` +
        `Add an entry naming the field and the screen that renders it — or, if nothing renders it, that is the bug:\n  ${unclaimed.join("\n  ")}`
    ).toEqual([])

    // 2 · ROT, the other way. An entry whose door no longer writes bytes is a
    // record of what the app used to do, and the list may only shrink.
    const stale = STORED_FILES.filter((e) => !writers.has(e.writtenIn))
    expect(
      stale.map((e) => `${e.writtenIn} (${e.field})`),
      "these STORED_FILES entries name a file that no longer stores bytes — delete them (R40)"
    ).toEqual([])

    // 3 · AND THE RENDER IS REAL. Read off the disk, in the file the entry names.
    const unreachable: string[] = []
    for (const e of STORED_FILES) {
      expect(e.why.trim(), `${e.field} needs a reason`).not.toBe("")
      const property = e.field.split(".").pop() as string
      if (!existsSync(join(ROOT, e.shownIn))) {
        unreachable.push(`${e.field}: ${e.shownIn} does not exist`)
        continue
      }
      if (!rendersField(stripComments(read(e.shownIn)), property))
        unreachable.push(
          `${e.field}: ${e.shownIn} never puts \`${property}\` in an href/src/picture — the bytes are stored and nobody can open them`
        )
    }
    expect(
      unreachable,
      `R40 — a stored file that no screen renders is a file nobody can reach:\n  ${unreachable.join("\n  ")}`
    ).toEqual([])
  })

  // THE SUBTRACTION, ASSERTED RATHER THAN ASSUMED. The rule turns on "a field
  // written back into an edit form is not a read", and that clause is invisible
  // in a passing run — every entry above happens to render properly, so nothing
  // above would notice if `rendersField` started accepting a form assignment.
  // These are the two real shapes that fooled a human reviewer.
  it("reachable-bytes: a form value and a paragraph are not renders", () => {
    expect(rendersField(`initial={{ fileName: "", fileUrl: task.fileUrl }}`, "fileUrl")).toBe(false)
    expect(rendersField(`<p>{[todo.accountName, todo.fileName].join(" · ")}</p>`, "fileName")).toBe(false)
    expect(rendersField(`values.fileUrl = picked`, "fileUrl")).toBe(false)
    // …and the two that ARE.
    expect(rendersField(`<a href={safeHref(task.fileUrl)}>open</a>`, "fileUrl")).toBe(true)
    expect(rendersField(`const link = safeHref(c.fileUrl)\n<a href={link}>x</a>`, "fileUrl")).toBe(true)
    expect(rendersField(`<RecordMark picture={a.logoUrl} />`, "logoUrl")).toBe(true)
  })
})
