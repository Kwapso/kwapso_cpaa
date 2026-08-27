// R42 — EVERY ACCEPTED TYPE RESOLVES TO A DECLARED READER ON EVERY DOOR, OR TO
// AN HONEST REFUSAL — AND NO DOOR CHOOSES ITS OWN.
//
// The last clause is the load-bearing one. Until 27 Aug 2026 this app had two
// readers and no table, and which one a file got was decided by the door it came
// through: an uploaded PDF was converted properly and the SAME PDF in a Drive
// folder was read by a hand-rolled parser and came out as glyph indices. Nobody
// decided that. It is what happens when a reader is picked at the call site.
//
// So this suite asks two questions the table cannot answer about itself:
//   • is every declared type actually resolvable, and every reader real?
//   • does either DOOR reach past the table for a reader of its own?
// The second is a census off the disk, because it is the only way to ask "was
// this table consulted?" — and because a predicate nobody calls is not a guard.

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { stripComments } from "@shared/rules/source-scan"

import {
  SOURCE_TYPES,
  UNREADABLE_TYPES,
  classify,
  declaredUnreadable,
  readersFor,
  type ReaderName,
} from "../src/lib/source-readers"

const SRC = join(__dirname, "..", "src", "lib")
const READERS: ReaderName[] = ["markdown", "office-zip", "plain"]

describe("R42 — the table is complete and every reader in it is real", () => {
  it("every declared type names at least one reader, and only real ones", () => {
    expect(SOURCE_TYPES.length).toBeGreaterThan(5)
    for (const t of SOURCE_TYPES) {
      expect(t.readers.length, `${t.label} declares no reader`).toBeGreaterThan(0)
      for (const r of t.readers)
        expect(READERS, `${t.label} names a reader that does not exist: ${r}`).toContain(r)
    }
  })

  // ROT CHECK. A reason nobody wrote is an entry nobody thought about, and the
  // order within a type is exactly the thing a later reader will want explained.
  it("and every entry says WHY it is in that order", () => {
    for (const t of [...SOURCE_TYPES, ...UNREADABLE_TYPES])
      expect(t.why.length, `${t.label} has no reason`).toBeGreaterThan(20)
  })

  it("nothing is both readable and declared unreadable", () => {
    for (const t of SOURCE_TYPES)
      for (const ext of t.extensions)
        expect(
          declaredUnreadable(`x.${ext}`, ""),
          `.${ext} is in ${t.label} AND in the unreadable list`
        ).toBeNull()
  })

  // THE TWO ANSWERS, EACH ON THE RIGHT SIDE. These are the exact pairing the
  // registry exists for: the converter cannot read a deck and the unzip reader
  // cannot read a PDF, so a single winner per door is wrong either way round.
  it("a deck goes to the unzip reader and a PDF goes to the converter", () => {
    expect(readersFor("pitch.pptx", "")).toEqual(["office-zip"])
    expect(readersFor("contract.pdf", "application/pdf")).toEqual(["markdown"])
    expect(readersFor("whiteboard.png", "image/png")).toEqual(["markdown"])
  })

  it("and a Word document falls back to the unzip reader when the converter cannot", () => {
    expect(readersFor("brief.docx", "")).toEqual(["markdown", "office-zip"])
  })

  it("artwork resolves to no reader at all — an honest refusal, not a guess", () => {
    for (const name of ["HOGO_LOGO.eps", "brand.ai", "list.oft", "clip.mp4", "call.mp3"])
      expect(readersFor(name, ""), name).toEqual([])
  })

  it("and a PDF is held to the word test, because page geometry is readable", () => {
    expect(classify("contract.pdf", "application/pdf")?.mustReadLikeWords).toBe(true)
  })
})

// ── AND THE CLAUSE A TABLE CANNOT ENFORCE ABOUT ITSELF ─────────────────────
//
// Censused off the disk with comments stripped — because a census that reads
// comments passes on the words explaining why the call is there, which is a
// mistake this repo made and fixed on the same day this file was written.
describe("R42 — no door chooses its own reader", () => {
  const doors = {
    "knowledge-files.ts (the upload door)": stripComments(readFileSync(join(SRC, "knowledge-files.ts"), "utf8")),
    "google-api.ts (the Drive lane)": stripComments(readFileSync(join(SRC, "google-api.ts"), "utf8")),
  }

  it("both doors ASK the table", () => {
    for (const [door, src] of Object.entries(doors))
      expect(src, `${door} must resolve its reader through source-readers`).toMatch(
        /readersFor\(|readSource\(/
      )
  })

  // THE MUTATION THIS EXISTS FOR: point a door at a reader the table did not
  // name for that type. Before the table, that was not a mutation — it was the
  // architecture.
  it("and neither reaches past it for a reader of its own", () => {
    for (const [door, src] of Object.entries(doors)) {
      expect(src, `${door} calls the converter directly instead of through the table`).not.toMatch(
        /\benv\.AI\.toMarkdown\b/
      )
      expect(src, `${door} calls the unzip reader directly instead of through the table`).not.toMatch(
        /\bofficeText\(/
      )
      expect(src, `${door} still classifies with fileShape instead of the table`).not.toMatch(
        /\bfileShape\(/
      )
    }
  })

  // AND THE READERS THEMSELVES STAY WHERE THEY ARE. `source-readers.ts` is the
  // only file allowed to name them, so "which reader" has one answer and one
  // place to change it.
  it("the readers are named in exactly one file", () => {
    const table = stripComments(readFileSync(join(SRC, "source-readers.ts"), "utf8"))
    expect(table).toMatch(/\benv\.AI\.toMarkdown\b/)
    expect(table).toMatch(/\bofficeText\(/)
  })
})
