// TRANSLATING WHAT A PERSON TYPED — the door's defence against an answer that
// came back wrong, and the shape of the door itself.
//
// THE LINE THIS DOOR SITS ON. shared/i18n.ts says the app translates what WE
// wrote and never what a PERSON typed. This door is the one place a READER may
// cross that line, for themselves, by pressing a button — so the two things
// worth locking are that it never crosses it on anybody's behalf (it writes
// nothing, it is refused to a client login, and it costs one unit per press),
// and that a model's bad answer degrades to the words that were typed rather
// than to a hole on the screen.
//
// THE PARSE IS RUN, NOT READ. Every branch below is a real answer a model has
// given at some point — a fenced block, a short array, a null in the middle, a
// paragraph of apology instead of JSON. A test that read the source for the word
// "JSON.parse" would pass for all of them.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { TRANSLATE_MAX_CHARS, TRANSLATE_MAX_TEXTS } from "@shared/workers/limits"
import { readTranslations } from "../src/routes/agent"

describe("a model's answer, read defensively", () => {
  const PIECES = ["Guten Tag", "Das Formular lädt nicht"]

  it("maps a well-formed answer in order", () => {
    expect(readTranslations('["Good day","The form does not load"]', PIECES)).toEqual([
      "Good day",
      "The form does not load",
    ])
  })

  it("reads it out of a markdown fence, because models keep adding one", () => {
    expect(readTranslations('```json\n["Good day","The form does not load"]\n```', PIECES)).toEqual([
      "Good day",
      "The form does not load",
    ])
  })

  it("reads it out of the prose a model wrapped around it", () => {
    expect(readTranslations('Sure! Here you go: ["Good day","The form does not load"]', PIECES))
      .toEqual(["Good day", "The form does not load"])
  })

  it("a SHORT answer leaves the rest in the words they were typed in", () => {
    // The failure this exists for: a hole where a paragraph was. The reader is
    // no worse off than before they pressed the button.
    expect(readTranslations('["Good day"]', PIECES)).toEqual(["Good day", "Das Formular lädt nicht"])
  })

  it("a null, a number or an empty string keeps that piece's original", () => {
    expect(readTranslations('[null,"The form does not load"]', PIECES)).toEqual([
      "Guten Tag",
      "The form does not load",
    ])
    expect(readTranslations('[7,"The form does not load"]', PIECES)).toEqual([
      "Guten Tag",
      "The form does not load",
    ])
    expect(readTranslations('["   ","The form does not load"]', PIECES)).toEqual([
      "Guten Tag",
      "The form does not load",
    ])
  })

  it("a blank piece stays blank rather than borrowing its neighbour's answer", () => {
    // A screen hands over its optional fields without filtering them, so the
    // array it sends can carry a gap. The answer must line up with what was
    // asked, position for position.
    expect(readTranslations('["Good day","ignored"]', ["Guten Tag", ""])).toEqual(["Good day", ""])
  })

  it("caps a translation that came back as an essay", () => {
    const essay = JSON.stringify([`${"x".repeat(TRANSLATE_MAX_CHARS + 500)}`, "The form"])
    const out = readTranslations(essay, PIECES) as string[]
    expect(out[0].length).toBe(TRANSLATE_MAX_CHARS)
  })

  // NULL IS THE REFUND SIGNAL. Everything above is an answer worth the unit it
  // cost; these are not, and the door gives the unit back for exactly these.
  it("answers null for prose, for an object, and for nothing at all", () => {
    for (const junk of [
      "I'm sorry, I can't help with that.",
      '{"Guten Tag":"Good day"}',
      "",
      "[",
      "[not json]",
    ])
      expect(readTranslations(junk, PIECES), JSON.stringify(junk)).toBe(null)
  })

  it("answers null when the array came back but nothing in it was usable", () => {
    expect(readTranslations("[null,null]", PIECES)).toBe(null)
  })
})

describe("the door itself", () => {
  const src = readFileSync(join(__dirname, "..", "src/routes/agent.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
  const handler = src.slice(
    src.indexOf("export async function postTranslateText"),
    src.indexOf("export function readTranslations")
  )

  it("refuses a client login BEFORE it asks about the right (R21)", () => {
    const refuse = handler.indexOf("refusePortalCaller")
    const right = handler.indexOf("requireRight")
    expect(refuse, "the door no longer refuses portal callers").toBeGreaterThan(-1)
    expect(refuse, "a fence checked after the gate is a fence a granted role walks past").toBeLessThan(right)
  })

  it("type-checks BOTH body fields, positionally (R20)", () => {
    expect(handler).toMatch(/requireText\(body\.language/)
    expect(handler, "a language is judged against LANGUAGES, never accepted as any string").toMatch(
      /isLanguage\(/
    )
    expect(handler).toMatch(/Array\.isArray\(body\.texts\)/)
  })

  it("caps the batch and each piece in it from the one place they are named", () => {
    expect(handler).toContain("TRANSLATE_MAX_TEXTS")
    expect(handler).toContain("TRANSLATE_MAX_CHARS")
    expect(TRANSLATE_MAX_TEXTS).toBeGreaterThan(0)
    expect(TRANSLATE_MAX_CHARS).toBeGreaterThan(0)
  })

  it("spends ONE unit for the whole press, and refunds it when nothing came back", () => {
    // The owner's rule in one assertion: one press, one call, one unit. A spend
    // per piece would be a bill that grows with how long a conversation got.
    expect(handler.match(/consumeAiUnit\(/g) ?? [], "one spend, for the whole array").toHaveLength(1)
    expect(handler.match(/cheapText\(/g) ?? [], "one call, for the whole array").toHaveLength(1)
    expect(handler.match(/refundSpend\(/g) ?? [], "every failure path gives the unit back").toHaveLength(2)
  })

  it("writes NOTHING — the record still says what its author typed", () => {
    // The whole reason this door is housekeeping rather than a mutation. If a
    // write ever appears here, the line in shared/i18n.ts has moved and that is
    // a decision, not a refactor.
    for (const write of ["d1Query", "d1ExecScript", "forwardToDoor", "publishChange"])
      expect(handler.includes(write), `the translate door must not ${write}`).toBe(false)
  })
})
