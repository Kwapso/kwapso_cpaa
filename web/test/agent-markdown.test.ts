// The agent's reply is UNTRUSTED text. These lock the markdown renderer's XSS
// boundary: raw HTML is escaped, only http/https/mailto links survive, and — the
// bug security_sentry caught — a crafted URL can't break out of the href attribute.

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { toHtml } from "@shared/web/markdown-html"

describe("AgentMarkdown toHtml — XSS-safe", () => {
  it("neutralizes an attribute-breakout link (a stray quote in the href)", () => {
    const html = toHtml('click [here](https://a.com/"onmouseover="alert(document.cookie))')
    // A quote can no longer reach the href at all: safeHref refuses a candidate
    // carrying markup characters outright, so this renders as PLAIN TEXT with no
    // anchor — stronger than the old behaviour, which built the anchor and relied
    // on escapeAttr to encode the quote inside it. Two assertions, because "no
    // anchor" and "no live handler anywhere" fail for different regressions.
    expect(html, "a URL carrying a quote must not become a link at all").not.toContain("<a ")
    expect(html, "no rendered tag may carry an event handler").not.toMatch(/<[^>]*\son\w+\s*=/i)
    // …and the text itself is still shown, escaped, so the reply isn't silently eaten.
    expect(html).toContain("alert(document.cookie)")
  })

  it("drops a javascript: link to plain (escaped) text", () => {
    const html = toHtml("[x](javascript:alert(1))")
    expect(html).not.toContain("<a ")
  })

  it("escapes raw HTML in the reply", () => {
    expect(toHtml("<img src=x onerror=alert(1)>")).not.toContain("<img")
    expect(toHtml("<script>alert(1)</script>")).not.toContain("<script>")
  })

  it("still renders a normal link, bold, and a list", () => {
    expect(toHtml("see [docs](https://x.com)")).toContain('href="https://x.com"')
    expect(toHtml("**bold**")).toContain("<strong>bold</strong>")
    expect(toHtml("- one\n- two")).toContain("<ul>")
  })

  // THE OWNER'S OWN TABLE, 30 Aug 2026. He asked the assistant who the main
  // contact at FluClinic was; it answered with a two-column markdown table and
  // the panel rendered raw pipes and dashes, because `mdBlocks` had no table
  // block and the paragraph branch swallowed it. The model was not wrong to emit
  // one — "contact / is this the main stakeholder" is a table and nothing else.
  it("renders the assistant's markdown table as a real table, not as pipes", () => {
    const html = toHtml(
      "| Contact | Main stakeholder? |\n" +
        "|---------|-------------------|\n" +
        "| Paras Maroo | No |\n" +
        "| Petya Bletsova | No |"
    )
    expect(html, "a pipe table must become a table element").toContain("<table>")
    expect(html).toContain("<th>Contact</th>")
    expect(html).toContain("<th>Main stakeholder?</th>")
    expect(html).toContain("<td>Paras Maroo</td>")
    expect(html).toContain("<td>Petya Bletsova</td>")
    // The tell for the bug: the delimiter row must not survive as text anywhere.
    expect(html, "the |---| row is syntax, not content").not.toContain("---")
    expect(html, "no raw pipe should reach the reader").not.toContain("|")
  })

  it("leaves an ordinary sentence containing a pipe alone", () => {
    // The lookahead is what makes this safe: a line of pipes is prose unless the
    // NEXT line is a delimiter. Without that rule this sentence opens a table.
    const html = toHtml("run a | b to pipe it")
    expect(html).not.toContain("<table>")
    expect(html).toContain("<p>")
  })

  it("pads a ragged row rather than shifting its columns", () => {
    const html = toHtml("| a | b |\n|---|---|\n| only-one |")
    expect(html).toContain("<table>")
    // Two cells in the body row, the second empty — a short row must never make
    // the next column's value slide left under the wrong heading.
    expect(html).toContain("<td>only-one</td><td></td>")
  })

  it("escapes inside a table cell, like everywhere else", () => {
    const html = toHtml("| x |\n|---|\n| <img src=x onerror=alert(1)> |")
    expect(html).toContain("<table>")
    expect(html).not.toContain("<img")
    expect(html).not.toMatch(/<[^>]*\son\w+\s*=/i)
  })

  // A cell has no other way to hold two lines — GFM has no newline in a pipe
  // row — so a model writes `<br>`. Escaped, that reached the owner as the
  // literal text "<br>", twelve times in one answer, which is what made a
  // correct answer read as broken.
  it("turns <br> in a cell into a real line break", () => {
    const html = toHtml("| who | points |\n|---|---|\n| Ana | first<br>second |")
    expect(html).toContain("first<br />second")
    expect(html).not.toContain("&lt;br&gt;")
  })

  it("accepts the spellings a model actually writes", () => {
    expect(toHtml("| a |\n|---|\n| x<br/>y |")).toContain("x<br />y")
    expect(toHtml("| a |\n|---|\n| x<br />y |")).toContain("x<br />y")
    expect(toHtml("| a |\n|---|\n| x<BR>y |")).toContain("x<br />y")
  })

  // THE REVERSAL IS ONE TAG AND IT TAKES NOTHING. If this ever goes red, the
  // allowance has been widened and the escape boundary is no longer a boundary.
  it("brings back no other tag, and no br carrying anything", () => {
    const withAttr = toHtml("| a |\n|---|\n| x<br onload=alert(1)>y |")
    expect(withAttr).not.toMatch(/<br[^/>]*\son\w+/i)
    expect(withAttr).toContain("&lt;br")
    for (const tag of ["<script", "<img", "<a href=\"javascript:", "<iframe", "<style"]) {
      const html = toHtml(`| a |\n|---|\n| ${tag}>bad</> |`)
      expect(html).not.toContain(tag)
    }
  })
})

// ── A TABLE STAYS INSIDE ITS BUBBLE ─────────────────────────────────────────
//
// The owner screenshotted the assistant panel on 1 Sep 2026 with a table pushing
// the whole conversation sideways and its right-hand columns cut off. Measured
// live on staging at 375px, in the browser, before touching anything: the
// wrapper around the table was 504px wide with a scrollWidth of 504 — so
// `overflow-x-auto` had NOTHING to scroll, because the box had grown to its own
// content — and the bubble around it was 540px inside a column of 241.
//
// THE CAUSE IS A PAIR, WHICH IS WHY THIS TEST IS A PAIR. The table carries a
// 28rem floor so it does not crush into one word per cell (added 31 Aug 2026
// after exactly that, and correct). Every ancestor up to the chat bubble is
// SHRINK-TO-FIT, and `min-w-0` lets a box shrink without stopping it being sized
// by its contents — so the floor travelled straight up and widened the bubble.
// `contain: inline-size` is the one word that stops it: the wrapper's width
// stops depending on what is inside it, the bubble sizes to the prose beside the
// table, and the scroll finally engages. Measured after: wrapper 205 with
// scrollWidth 504, bubble 241 in its 273 column, document scrollWidth back to
// the viewport's own 375.
//
// A FLOOR WITHOUT CONTAINMENT IS THE BUG, so neither half may be removed alone.
// Read off the disk because layout is not something jsdom can be asked about —
// this locks the two classes that have to travel together, and the browser
// measurement above is what says they are the right two.
describe("a markdown table scrolls inside the bubble instead of widening it", () => {
  const src = readFileSync(join(__dirname, "..", "components", "agent-markdown.tsx"), "utf8")
  const wrapper = /<div className="([^"]*overflow-x-auto[^"]*)">\s*\n\s*<table/.exec(src)

  it("the table's own wrapper is the one this scan found", () => {
    expect(wrapper, "the table wrapper did not parse — this check has gone blind").toBeTruthy()
  })

  it("the wrapper's width does not depend on the table inside it", () => {
    expect(
      wrapper?.[1],
      "without contain-inline-size the table's floor widens every ancestor up to the bubble"
    ).toContain("contain-inline-size")
  })

  it("and it still fills the room it is given, with a floor of its own", () => {
    // `w-full` so a contained box is not zero-width; the floor so a message that
    // is NOTHING BUT a table does not collapse to the bubble's padding (measured
    // at 36px without it).
    expect(wrapper?.[1]).toContain("w-full")
    expect(wrapper?.[1], "a contained, table-only bubble collapses without a floor").toMatch(
      /min-w-\[\d+rem\]/
    )
  })

  it("the table keeps the floor that stops it crushing", () => {
    expect(src, "the 28rem floor is the other half of the pair").toMatch(
      /<table className="[^"]*min-w-\[28rem\]/
    )
  })
})
