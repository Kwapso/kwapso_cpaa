// The agent's reply is UNTRUSTED text. These lock the markdown renderer's XSS
// boundary: raw HTML is escaped, only http/https/mailto links survive, and — the
// bug security_sentry caught — a crafted URL can't break out of the href attribute.

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
})
