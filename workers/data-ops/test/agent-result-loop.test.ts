// WHY THE ASSISTANT CALLED THE SAME TOOL FOUR TIMES — and the two things that
// stop it, tested as the pure logic they are (no model, no DB, no network).
//
// Asked "How many open tickets does Confia have?" on staging, the assistant called
// list_support_tickets four times in a row with the same arguments. That reads like
// a model fault and it is not one. A list door answers through `pagedJson`, whose
// shape is `{tickets: […50…], total, hasMore, nextCursor}` — the ROWS FIRST — and
// the loop handed the model `JSON.stringify(data).slice(0, 2000)`. A ticket is
// about thirty fields including a free-text description, so two thousand characters
// is three or four rows, and then the cut lands mid-object and takes `total`,
// `hasMore` and `nextCursor` with it.
//
// `total` is the exact count the question asked for. `nextCursor` is the only way
// to read further. list_help_tickets' own description PROMISES both. The model got
// neither, and no word saying they had been removed — so it did the one thing still
// open to it, which was to ask again. At one AI unit of the team's daily allowance
// per attempt, that is a money bug as well as an honesty one.
//
// So there are two guards, and only the first is the fix:
//   • trimResult drops ROWS, never the tail, and says what it dropped;
//   • repeatGuard makes an identical READ in one turn answer from the first call.

import { describe, expect, it } from "vitest"

import { readBudget, repeatGuard, trimResult } from "../src/lib/agent"
import type { ToolCall } from "../src/lib/model"

/** A ticket shaped like the door's own row (help.ts TICKET_COLS) — thirty-odd
 * fields, a real description. Nothing here is padding: the whole point is that a
 * page of these overruns the ceiling within a handful of rows. */
const ticket = (n: number) => ({
  id: `01JQ${String(n).padStart(22, "0")}`,
  ref: `CONF-T0${400 + n}`,
  helpType: "Bug",
  description:
    "The invoice run finished but three of the dispatch notes never reached the printer, and the client says the same thing happened last month on the same day of the cycle.",
  status: n % 3 === 0 ? "resolved" : "in_progress",
  resolved: n % 3 === 0,
  resolvedAt: null,
  accountId: "01JACCOUNTCONFIA0000000000",
  rank: `a${n}`,
  lockedAt: null,
  archivedAt: null,
  draftResolution: null,
  titleDe: "Rechnungslauf",
  titleEn: "Invoice run",
  creatorId: "01JUSER0000000000000000000",
  creatorName: "Aurora Blum",
  editorName: null,
  createdAt: "2026-08-01T09:12:44.000Z",
  updatedAt: "2026-08-14T16:02:10.000Z",
  raiserIsClient: true,
  editorIsClient: false,
  storyCount: 2,
  doneStoryCount: 1,
})

/** Exactly what `pagedJson("tickets", …)` builds: rows first, then the summary. */
const page = (rows: number) => ({
  tickets: Array.from({ length: rows }, (_, i) => ticket(i + 1)),
  total: 37,
  hasMore: true,
  nextCursor: "eyJrIjoiMjAyNi0wOC0xNCIsImkiOiIwMUpRIn0",
})

describe("trimResult: the summary survives, the rows are what go", () => {
  it("the OLD trim really did delete the answer — this is the bug, in one line", () => {
    const whole = JSON.stringify(page(50))
    expect(whole.length, "a page of tickets must genuinely overrun the ceiling").toBeGreaterThan(2000)
    const old = whole.slice(0, 2000)
    // The three fields the model needed, none of them reachable.
    expect(old).not.toContain('"total"')
    expect(old).not.toContain('"hasMore"')
    expect(old).not.toContain('"nextCursor"')
    // …and what it DID get would not even parse, so there was nothing to count.
    expect(() => JSON.parse(old)).toThrow()
  })

  it("keeps total, hasMore and nextCursor whatever else has to go", () => {
    const trimmed = trimResult(page(50))
    const parsed = JSON.parse(trimmed.split("\n")[0]) as {
      tickets: unknown[]
      total: number
      hasMore: boolean
      nextCursor: string
    }
    expect(parsed.total).toBe(37)
    expect(parsed.hasMore).toBe(true)
    expect(parsed.nextCursor).toBe("eyJrIjoiMjAyNi0wOC0xNCIsImkiOiIwMUpRIn0")
    // Some rows survive — a summary with no example is not a useful answer either.
    expect(parsed.tickets.length).toBeGreaterThan(0)
    expect(parsed.tickets.length).toBeLessThan(50)
  })

  it("says how much it dropped, rather than letting the model think it saw everything", () => {
    const trimmed = trimResult(page(50))
    expect(trimmed).toMatch(/of 50 tickets are shown/)
    // The note is a statement of fact, never a direction — everything inside a tool
    // result is data the model must not take orders from, and that has to hold for
    // the sentences we write ourselves.
    expect(trimmed).not.toMatch(/\byou (must|should)\b|\bdo not\b|\bcall\b/i)
  })

  it("leaves a result that already fits completely alone", () => {
    const small = page(2)
    expect(trimResult(small)).toBe(JSON.stringify(small))
    expect(trimResult("a short answer")).toBe("a short answer")
  })

  it("a plain string longer than the allowance is cut, and admits it", () => {
    // 50,000 rather than the 5,000 this used to use: the promise is unchanged —
    // a string too big to hand over is cut and says so — but what "too big"
    // means moved when a read of ONE THING stopped being held to the summary
    // budget. Five thousand characters of a document now arrive whole, which is
    // the entire point of RECORD_CHARS.
    const trimmed = trimResult("x".repeat(50_000))
    expect(trimmed.length).toBeLessThan(50_000)
    expect(trimmed).toMatch(/Trimmed here/)
  })

  it("never returns more than the ceiling plus its own note", () => {
    const [body] = trimResult(page(50)).split("\n")
    expect(body.length).toBeLessThanOrEqual(2000)
  })
})

/* ------------------------- THE ZERO-ROWS BUG ------------------------------ */
//
// The other end of the same fault. Dropping rows "from the END in whole rows" is
// right for fifty tickets and catastrophic for one document: a single 8,680-char
// source does not fit a 2,000-char budget, so NO row fits, so the model was handed
// `{"sources":[]}` and the sentence "0 of 1 sources are shown". An empty list is
// not a trimmed answer — it is the answer "there is nothing", to a question that
// had something.
//
// Measured against the live staging door on 28 Aug 2026: a source read by id gave
// the model 220 of 8,680 characters (2.5%); one matching meeting gave it 233 of
// 2,531 (9.2%). The owner had asked whether a scope document covered what a call
// discussed, and the assistant answered — correctly — that it could not read
// either one in full.
describe("a read of ONE THING reaches the model", () => {
  /** A source row the way the knowledge door really answers one: the material IS
   * the row, and it is far past the summary budget on its own. */
  const source = (chars: number) => ({
    sources: [{ id: "01J", title: "Great wave venture scope", kind: "file", body: "s".repeat(chars) }],
    total: 1,
    hasMore: false,
    nextCursor: null,
  })

  it("does not come back empty — the bug, in one line", () => {
    const parsed = JSON.parse(trimResult(source(8_000)).split("\n")[0]) as { sources: unknown[] }
    expect(parsed.sources, "one source asked for, one source returned").toHaveLength(1)
  })

  it("hands the whole document over when it fits the allowance", () => {
    const whole = source(8_000)
    expect(trimResult(whole)).toBe(JSON.stringify(whole))
  })

  it("keeps the row and cuts its longest field when it does NOT fit", () => {
    const trimmed = trimResult(source(80_000))
    const parsed = JSON.parse(trimmed.split("\n")[0]) as { sources: { body: string }[]; total: number }
    expect(parsed.sources, "the row survives being too big").toHaveLength(1)
    expect(parsed.total, "the summary fields survive, as they always did").toBe(1)
    expect(parsed.sources[0].body, "and the reader is told the body was cut").toMatch(/cut here: body is 80000 characters in full/)
    expect(trimmed).toMatch(/characters are missing in total/)
  })

  it("a PAGE is still summarised — the many-rows path is untouched", () => {
    const trimmed = trimResult(page(50))
    expect(trimmed).toMatch(/of 50 tickets are shown/)
    expect(trimmed.split("\n")[0].length).toBeLessThanOrEqual(2000)
  })

  it("says what it did as a fact, never as an instruction", () => {
    const trimmed = trimResult(source(80_000))
    expect(trimmed).not.toMatch(/\byou (must|should)\b|\bdo not\b|\bcall\b/i)
  })
})

/* ------------------------ THE TURN'S READING BUDGET ----------------------- */
//
// The record budget is thirty times the summary budget and a turn may take twelve
// steps, so the ceiling that used to be per-result has to exist per-TURN or a
// single turn could hand the model half a million characters — and because every
// step re-sends the whole conversation, the last step pays for all of it.
describe("readBudget: a turn may read a lot, but not without end", () => {
  it("gives a full record allowance while there is room", () => {
    const b = readBudget()
    expect(b.allowance()).toBe(40_000)
  })

  it("falls back to the summary budget once the turn has read its fill", () => {
    const b = readBudget()
    b.spend(119_000)
    expect(b.allowance(), "what is left, never less than a usable summary").toBe(2000)
    b.spend(50_000)
    expect(b.allowance(), "and it never goes negative on the next read").toBe(2000)
  })

  it("a spent budget still lets a document arrive shortened rather than empty", () => {
    const b = readBudget()
    b.spend(200_000)
    const doc = { sources: [{ id: "01J", body: "s".repeat(9000) }], total: 1 }
    const parsed = JSON.parse(trimResult(doc, b.allowance()).split("\n")[0]) as { sources: unknown[] }
    expect(parsed.sources).toHaveLength(1)
  })
})

describe("repeatGuard: the same read twice in one turn is answered once", () => {
  const read = (input: Record<string, unknown>): ToolCall => ({
    id: "c1",
    name: "list_help_tickets",
    input,
  })

  it("hands back the first result instead of running the tool again", () => {
    const g = repeatGuard()
    expect(g.recall(false, read({ scope: "all" }))).toBeNull()
    g.remember(false, read({ scope: "all" }), "OK. Result data: {…}")
    expect(g.recall(false, read({ scope: "all" }))).toBe("OK. Result data: {…}")
  })

  it("a DIFFERENT question is a different call — paging on must still work", () => {
    const g = repeatGuard()
    g.remember(false, read({ scope: "all" }), "page one")
    expect(g.recall(false, read({ scope: "all", cursor: "abc" }))).toBeNull()
    expect(g.recall(false, read({ scope: "mine" }))).toBeNull()
  })

  it("the order the model wrote the arguments in does not make it a new call", () => {
    const g = repeatGuard()
    g.remember(false, { id: "c1", name: "list_help_tickets", input: { scope: "all", view: "archived" } }, "same")
    expect(
      g.recall(false, { id: "c2", name: "list_help_tickets", input: { view: "archived", scope: "all" } })
    ).toBe("same")
  })

  it("a WRITE is never short-circuited — that decision belongs to the door", () => {
    // The safety line: a read is idempotent, so replaying it IS the same answer. A
    // write is not, and swallowing the second one would be this seam quietly making
    // a call the door and the confirm panel exist to make.
    const g = repeatGuard()
    const write: ToolCall = { id: "c1", name: "invite_member", input: { email: "sam@x.com" } }
    g.remember(true, write, "OK")
    expect(g.recall(true, write)).toBeNull()
  })

  it("forgets nothing within a turn, but each turn starts clean", () => {
    const first = repeatGuard()
    first.remember(false, read({ scope: "all" }), "yesterday")
    // A new guard is what the loop builds per turn — asking again next message must
    // really re-read, or the assistant would answer from a stale list for ever.
    expect(repeatGuard().recall(false, read({ scope: "all" }))).toBeNull()
  })
})
