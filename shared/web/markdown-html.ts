// Render a markdown STRING as light, XSS-safe HTML — the assistant's replies, and
// any BODY that was written in markdown rather than in the Notes editor's HTML.
// The agent's output is UNTRUSTED, so we ESCAPE the raw text first (escapeText),
// THEN convert only a tiny, safe subset: inline code, links (each URL run through
// safeHref — http/https/mailto only, and the href escaped as an ATTRIBUTE so a
// crafted URL can't break out of the quotes), bold, italic, bullet + numbered
// lists, and blank-line paragraphs / soft line breaks. Pure string functions (no
// JSX) so they're unit-testable; the AgentMarkdown component just wraps toHtml.
//
// ONE GROUPING, TWO RENDERERS (2026-08-27). The grouping — which lines are a
// paragraph, which run is a list, which line is a heading — is now its own
// function (`mdBlocks`), and `toHtml` is the string renderer over it. The reason
// is the assistant's citation marks: a `<Cite>` is a REACT element that has to
// sit inside the sentence it belongs to, and a component cannot be injected into
// an HTML string, so web/components/agent-markdown.tsx renders the same blocks
// into React instead. Splitting `toHtml`'s OUTPUT at the marker was the obvious
// alternative and it tears paragraphs in half — a `<p>` opened in one fragment
// and closed in the next is two block elements to the browser, so every citation
// would break its own line. Two renderers over one grouping cannot disagree
// about what a "## " is; two markdown implementations would.

import { escapeAttr, escapeText, safeHref } from "@shared/web/rich-text"

// Inline spans, applied to ALREADY-ESCAPED text. Code runs first so its contents
// can't be re-interpreted as bold/italic; links before emphasis so a URL's own
// characters aren't mangled. `[^`]+` etc. avoid crossing markers.
//
// EXPORTED because the React renderer needs exactly this and nothing else: the
// block structure it builds itself, the inline markup it takes from here, so the
// escape-first boundary this file owns is never re-implemented beside it.
export function inline(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, (_m, code: string) => `<code>${code}</code>`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label: string, url: string) => {
      // The URL was escaped, so &amp; is back to & for the protocol check.
      const href = safeHref(url.replace(/&amp;/g, "&"))
      // escapeAttr (not escapeText) — the href sits inside quotes, so it must also
      // encode " or a crafted URL breaks out and injects an event handler.
      return href
        ? `<a href="${escapeAttr(href)}" target="_blank" rel="noreferrer noopener">${label}</a>`
        : m
    })
    .replace(/\*\*([^*]+)\*\*/g, (_m, b: string) => `<strong>${b}</strong>`)
    .replace(/(^|[^*])\*([^*\n]+)\*/g, (_m, pre: string, i: string) => `${pre}<em>${i}</em>`)
}

/** One block of a markdown string: a paragraph, a heading, or a list. Its lines
 * and items are ALREADY ESCAPED and not yet inlined — whoever renders the block
 * runs `inline` over each one, so the escape-first boundary is crossed exactly
 * once whichever renderer is used. */
export type MdBlock =
  | { tag: "p" | "h3" | "h4"; lines: string[] }
  | { tag: "ul" | "ol"; items: string[] }

// Group escaped lines into paragraphs, HEADINGS and lists. Consecutive "- "/"* "
// lines become one <ul>; "1." lines one <ol>; a "#"-prefixed line becomes a
// heading; other runs become a <p> with soft newlines as <br>. A blank line ends
// the current block.
//
// HEADINGS ARE CLAMPED to h3/h4 — the same two levels sanitizeRichHtml allows and
// the same two the PROSE classes style. A body must not outrank the page title,
// and the two renderers must not disagree about what a "## " looks like.
export function mdBlocks(text: string): MdBlock[] {
  const lines = escapeText(text).replace(/\r\n?/g, "\n").split("\n")
  const out: MdBlock[] = []
  let para: string[] = []
  let list: { tag: "ul" | "ol"; items: string[] } | null = null

  const flushPara = () => {
    if (para.length) out.push({ tag: "p", lines: para })
    para = []
  }
  const flushList = () => {
    if (list) out.push(list)
    list = null
  }

  for (const line of lines) {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line)
    const heading = /^(#{1,6})\s+(.*\S)\s*$/.exec(line)
    if (heading) {
      flushPara()
      flushList()
      out.push({ tag: heading[1].length <= 2 ? "h3" : "h4", lines: [heading[2]] })
    } else if (bullet) {
      flushPara()
      if (list?.tag !== "ul") {
        flushList()
        list = { tag: "ul", items: [] }
      }
      list.items.push(bullet[1])
    } else if (numbered) {
      flushPara()
      if (list?.tag !== "ol") {
        flushList()
        list = { tag: "ol", items: [] }
      }
      list.items.push(numbered[1])
    } else if (line.trim() === "") {
      flushPara()
      flushList()
    } else {
      flushList()
      para.push(line)
    }
  }
  flushPara()
  flushList()
  return out
}

/** The string renderer over `mdBlocks` — what every non-React caller uses. */
export function toHtml(text: string): string {
  return mdBlocks(text)
    // `"items" in b` rather than a test on `tag`: a member whose discriminant is
    // itself a union of literals ("ul" | "ol") cannot be narrowed AWAY by two
    // inequalities, so the paragraph branch would not see its own `lines`.
    .map((b) =>
      "items" in b
        ? `<${b.tag}>${b.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${b.tag}>`
        : `<${b.tag}>${b.lines.map(inline).join("<br>")}</${b.tag}>`
    )
    .join("")
}
