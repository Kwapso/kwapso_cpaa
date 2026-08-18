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
})
