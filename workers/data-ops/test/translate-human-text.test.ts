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

import {
  TRANSLATE_BATCH_CHARS,
  TRANSLATE_MAX_BATCHES,
  TRANSLATE_MAX_CHARS,
  TRANSLATE_MAX_TEXTS,
} from "@shared/workers/limits"
import { PROVIDER_DEFAULT_MAX_TOKENS } from "@shared/workers/model-text"
import { answerCeiling, readTranslations, translateBatches } from "../src/routes/agent"

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

describe("the answer that actually came back, on 21 Aug 2026", () => {
  // NOT AN INVENTED SHAPE. This is the failure the owner hit on ticket
  // CONFIA-T0016 and it was reproduced against the same model with the same
  // system prompt: a correct three-element array of correct English, refused by
  // `JSON.parse` because the model carried the German's paragraph breaks
  // through as RAW newlines. `finish_reason` was "stop" — nothing was
  // truncated, nothing was malformed in any way a reader would notice. The door
  // called it unreadable and charged nobody, on every ticket with a blank line
  // in it, which is nearly every real ticket.
  const german = ["falsches Datum\n\nbei Eingabe eines Stornodatums", "Die Aufgaben-Logik\n\n- Liegt das Storno", "Hello :)"]

  it("reads an array whose strings carry raw newlines", () => {
    const answer = '["Incorrect date\n\nWhen entering a cancellation date", "The task logic\n\n- If the cancellation date", "Hello :)"]'
    expect(() => JSON.parse(answer)).toThrow() // the exact reason it was refused
    expect(readTranslations(answer, german)).toEqual([
      "Incorrect date\n\nWhen entering a cancellation date",
      "The task logic\n\n- If the cancellation date",
      "Hello :)",
    ])
  })

  it("leaves an ALREADY-escaped newline exactly as the model wrote it", () => {
    const answer = '["one\\ntwo"]'
    expect(readTranslations(answer, ["eins\nzwei"])).toEqual(["one\ntwo"])
  })

  it("does not touch newlines BETWEEN elements, which were always legal", () => {
    const answer = '[\n  "one",\n  "two"\n]'
    expect(readTranslations(answer, ["eins", "zwei"])).toEqual(["one", "two"])
  })

  it("still gives up on an answer the repair cannot save", () => {
    expect(readTranslations("I am unable to translate this text.", german)).toBeNull()
    expect(readTranslations('["unclosed', german)).toBeNull()
  })

  it("carries tabs and carriage returns through the same repair", () => {
    const answer = '["a\tb\r\nc"]'
    expect(readTranslations(answer, ["x"])).toEqual(["a\tb\r\nc"])
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

  it("spends ONE unit for the whole press, whatever it costs us to answer it", () => {
    // The owner's rule in one assertion: one press, one unit. A spend per piece —
    // or per BATCH, now that a press makes several calls — would be a bill that
    // grows with how long a conversation got.
    //
    // THIS USED TO ALSO ASSERT ONE `cheapText` CALL, and that was the wrong
    // intent wearing the right one's clothes. "One call" was the implementation
    // of "one unit" on the day it was written, and it stopped being true the
    // moment the text outgrew a single answer: a 3.3 KB source needs more than a
    // thousand tokens back, and the model was silently cutting the array off at
    // the provider's 256. A test that pinned the mechanism would have gone red
    // for the fix and stayed green for the fault.
    expect(handler.match(/consumeAiUnit\(/g) ?? [], "one spend, for the whole press").toHaveLength(1)
    expect(handler.match(/refundSpend\(/g) ?? [], "the unit comes back only when NOTHING did").toHaveLength(1)
  })

  it("ASKS THE MODEL FOR ROOM — the whole of the fault, in one line of the door", () => {
    // Left unset, Workers AI allows 256 completion tokens and cuts the answer
    // off mid-string; the half-written array does not parse, and the screen said
    // "the translation came back empty" about an answer that was never empty.
    expect(handler, "the door must size the answer it asks for").toMatch(/maxTokens:\s*answerCeiling\(/)
  })

  it("cuts a press into batches, and caps how many it may make", () => {
    expect(handler).toContain("translateBatches(")
    expect(handler).toContain("TRANSLATE_MAX_BATCHES")
  })

  it("writes NOTHING — the record still says what its author typed", () => {
    // The whole reason this door is housekeeping rather than a mutation. If a
    // write ever appears here, the line in shared/i18n.ts has moved and that is
    // a decision, not a refactor.
    for (const write of ["d1Query", "d1ExecScript", "forwardToDoor", "publishChange"])
      expect(handler.includes(write), `the translate door must not ${write}`).toBe(false)
  })
})

// THE PACKING, RUN. `translateBatches` decides how a press is cut up and
// `answerCeiling` decides how much room each cut is allowed — both are
// arithmetic, and arithmetic that is read rather than run is arithmetic nobody
// has checked. The second one is the fault itself: a ceiling of 256 tokens is
// what turned a 3.3 KB meeting write-up into "the translation came back empty".
describe("one press, cut into calls the model can finish", () => {
  it("puts a whole screen of short pieces in one call", () => {
    expect(translateBatches(["Guten Tag", "Danke", "Bis bald"])).toEqual([[0, 1, 2]])
  })

  it("starts a new batch rather than going past the budget", () => {
    const half = "x".repeat(Math.ceil(TRANSLATE_BATCH_CHARS * 0.6))
    expect(translateBatches([half, half, half])).toEqual([[0], [1], [2]])
  })

  it("never splits a piece — one bigger than the budget is a batch of its own", () => {
    // Half a paragraph translated without the other half is worse than the
    // paragraph left in the language it was written in.
    const huge = "x".repeat(TRANSLATE_BATCH_CHARS + 500)
    expect(translateBatches([huge, "Danke"])).toEqual([[0], [1]])
  })

  it("carries POSITIONS, so a screen's blank fields cannot shift the answer", () => {
    // A screen hands over its optional fields without filtering them. A batch
    // that dropped the blanks and answered a shorter list would line the whole
    // screen up one paragraph out.
    expect(translateBatches(["Guten Tag", "", "Danke"])).toEqual([[0, 2]])
    expect(translateBatches(["", ""])).toEqual([])
  })

  it("asks for MORE than the provider's 256 for a real-sized batch", () => {
    // THE REGRESSION. On 2026-08-18 this door asked for nothing, got 256, and
    // reported an interrupted answer as an empty one.
    const body = "Das Formular lädt nicht. ".repeat(140) // ~3.5 KB, the reported source
    expect(body.length).toBeGreaterThan(3_000)
    expect(answerCeiling([body])).toBeGreaterThan(PROVIDER_DEFAULT_MAX_TOKENS * 4)
  })

  it("never asks for LESS than the provider would have given anyway", () => {
    expect(answerCeiling(["Hallo"])).toBeGreaterThanOrEqual(PROVIDER_DEFAULT_MAX_TOKENS)
    expect(answerCeiling([])).toBeGreaterThanOrEqual(PROVIDER_DEFAULT_MAX_TOKENS)
  })

  it("keeps one press bounded — the caps are a set, not a wish", () => {
    expect(TRANSLATE_MAX_BATCHES).toBeGreaterThan(0)
    expect(TRANSLATE_BATCH_CHARS).toBeGreaterThanOrEqual(TRANSLATE_MAX_CHARS)
  })
})
