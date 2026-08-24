// WHAT A STORED BODY CAN DO WHEN IT IS PUT ON A SCREEN.
//
// The long-text fields on both front doors are rich text now — a ticket
// description, a task's detail, a story, a meeting's agenda and notes, a
// process and its steps, an app's about/context/solution, a sprint goal, a
// to-do, an article. Which means a body typed by ONE person is injected into
// ANOTHER person's page, and across the account fence in both directions: a
// client types a ticket in the portal and our staff read it in the agency app;
// we write a to-do and they read it in theirs.
//
// That is the stored-XSS shape, and this app has had one before. So the rule is
// not "we sanitise", it is "there is exactly ONE place that injects, and what it
// injects has been through the allow-list". Two tests, and they check different
// things on purpose:
//
//   1. THE CENSUS — every dangerouslySetInnerHTML on either front door is a
//      reviewed line with a reason. A second injection site cannot appear
//      without somebody writing down why, which is the failure this catches:
//      not a bad sanitizer, a screen that skipped it.
//   2. THE RENDER — the seam is actually rendered, with hostile bodies in it,
//      and the resulting DOM is inspected. sanitizeRichHtml's own unit tests
//      (rich-text.test.ts) assert about a STRING; this asserts about the page,
//      which is the thing a person is looking at.
//
// rich-text.test.ts covers the sanitizer and the URL boundary. This covers the
// screens.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"
import { RichText } from "@shared/web/rich-text-view"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..", "..")

afterEach(cleanup)

/* ------------------------- 1 · the injection census ------------------------ */

/**
 * The ONLY places either front door may hand a string to the browser as markup.
 * Data, not judgement in code — every entry is a visible line with the reason it
 * is safe, the same shape rich-text.test.ts's NOT_USER_TYPED uses. Anything else
 * is an offender, whatever it claims to have sanitised on the way in.
 */
const MAY_INJECT: Record<string, string> = {
  "shared/web/rich-text-view.tsx":
    "THE seam. Both branches produce known-safe HTML: sanitizeRichHtml (parse detached → allow-list) for a body with tags, toHtml (escape-first markdown) for one without.",
  "web/components/agent-markdown.tsx":
    "the assistant's own reply, through the same escape-first toHtml — the text is escaped before any markup is added, so its output is safe by construction",
  "shared/web/theme-provider.tsx":
    "the pre-paint theme boot script — a module constant written in this repo (apply localStorage's stored data-theme before first paint, the design kit's own prescribed snippet). No value from a request or a row reaches it.",
  "shared/web/mark-runtime.tsx":
    "two module constants (the mark's CSS and its animator script) written in this repo — no value from a request or a row reaches them",
  "shared/web/mark-loader.tsx":
    "the mark's own markup, a module constant built from module constants (shared/web/splash.ts → splashInner). It is server-rendered on purpose: an empty box in the exported HTML is a blank screen until the bundle lands.",
}

describe("no screen injects markup except through the one seam", () => {
  it("every dangerouslySetInnerHTML on either front door is a reviewed site", () => {
    const files = sourceFiles(
      [
        join(ROOT, "web", "components"),
        join(ROOT, "web", "app"),
        join(ROOT, "web", "lib"),
        join(ROOT, "web-portal", "components"),
        join(ROOT, "web-portal", "app"),
        join(ROOT, "web-portal", "lib"),
        join(ROOT, "shared", "web"),
      ],
      { extensions: [".ts", ".tsx"], skipTests: true, relativeTo: ROOT }
    )
    // Tripwire: a walk that found nothing reports "all clear" exactly like a
    // passing one, so prove it is still reading real screens.
    expect(files.length, "the screen walk found no files — it has gone blind").toBeGreaterThan(60)

    // stripComments is load-bearing: agent-blocks.tsx explains at length that it
    // never injects, and a census reading raw text would book it as an offender
    // for saying so.
    const injectors = files.filter((f) => stripComments(f.source).includes("dangerouslySetInnerHTML"))
    expect(
      injectors.length,
      "no injection site found at all — the census is looking at the wrong tree"
    ).toBeGreaterThan(2)

    const rel = (p: string) => p.split("/").join("/")
    const offenders = injectors.map((f) => rel(f.rel)).filter((r) => !(r in MAY_INJECT))
    expect(
      offenders,
      `a screen injects HTML on its own — render it with <RichText> instead, or add a reasoned MAY_INJECT entry: ${offenders.join(", ")}`
    ).toEqual([])

    // ROT CHECK, the other direction: an entry naming a file that no longer
    // injects is a permission nobody needs, and a list of stale permissions is
    // how the next real one gets waved through.
    const live = new Set(injectors.map((f) => rel(f.rel)))
    const stale = Object.keys(MAY_INJECT).filter((k) => !live.has(k))
    expect(stale, `MAY_INJECT names files that no longer inject anything: ${stale.join(", ")}`).toEqual([])
  })

  it("the portal renders bodies through the shared seam, not one of its own", () => {
    // The portal cannot import from web/ (its own rules suite locks that), so the
    // way it gets this wrong is by growing a second sanitizer. It has none: the
    // only sanitising vocabulary in its tree is the shared import.
    const portal = sourceFiles([join(ROOT, "web-portal")], {
      extensions: [".ts", ".tsx"],
      skipTests: true,
      relativeTo: ROOT,
    })
    const homegrown = portal.filter((f) =>
      /\b(DOMPurify|sanitize[A-Z]\w*)\s*(=|\()/.test(f.source) && !f.source.includes("@shared/web/rich-text")
    )
    expect(
      homegrown.map((f) => f.rel),
      "the portal has grown its own sanitizer — there is one, in shared/web/rich-text.ts"
    ).toEqual([])
  })
})

/* --------------------------- 2 · the rendered DOM -------------------------- */

/** Bodies a hostile author could store, in the shapes that have historically
 * worked: a script, a loader with an inline handler, a live-URL link, an
 * attribute breakout, and a frame — plus the markdown spellings of the same
 * ideas, because a body with no tags takes the OTHER branch of the seam. */
const HOSTILE_BODIES: [name: string, body: string][] = [
  ["a script tag", "<p>hello</p><script>window.__pwned = 1</script>"],
  ["an image with a handler", '<img src=x onerror="window.__pwned = 1">hello'],
  ["a javascript: link", '<a href="javascript:window.__pwned=1">hello</a>'],
  ["an attribute breakout", '<a href="https://x.test/&quot; onmouseover=&quot;window.__pwned=1">hello</a>'],
  ["a framed page", '<iframe src="javascript:window.__pwned=1"></iframe>hello'],
  ["an svg loader", "<svg onload=\"window.__pwned=1\"></svg>hello"],
  ["a body element with a handler", '<body onload="window.__pwned=1">hello</body>'],
  ["a markdown link to a live URL", "[hello](javascript:window.__pwned=1)"],
  ["markdown carrying a raw script", "hello\n\n<script>window.__pwned=1</script>"],
  ["a form asking for a password", '<form action="https://evil.test"><input type="password">hello</form>'],
]

describe("RichText — what a hostile stored body renders as", () => {
  for (const [name, body] of HOSTILE_BODIES) {
    it(`neutralises ${name}`, () => {
      const { container } = render(<RichText html={body} />)

      expect(container.querySelector("script"), "a script element reached the page").toBeNull()
      for (const tag of ["iframe", "img", "svg", "object", "embed", "form", "input", "style"])
        expect(container.querySelector(tag), `a <${tag}> reached the page`).toBeNull()

      // THE ASSERTIONS ARE ABOUT THE TREE, NOT THE TEXT. A refused markdown link
      // stays on the page as the literal characters somebody typed —
      // `[hello](javascript:…)` — which is inert and correct: it is a
      // paragraph's words, not an anchor. So what must be clean is every
      // ELEMENT and every ATTRIBUTE; text is text.
      for (const el of Array.from(container.querySelectorAll("*")))
        for (const attr of Array.from(el.attributes)) {
          expect(
            attr.name.toLowerCase().startsWith("on"),
            `${el.tagName} kept an inline handler (${attr.name})`
          ).toBe(false)
          expect(
            attr.value.toLowerCase().replace(/\s/g, ""),
            `${el.tagName}'s ${attr.name} carries a live URL`
          ).not.toContain("javascript:")
        }

      // Nothing clickable that would run code.
      for (const a of Array.from(container.querySelectorAll("a")))
        expect(a.getAttribute("href") ?? "").toMatch(/^(https?:|mailto:|\/)/)

      // …and the words a person meant to write are still on the screen. A
      // sanitizer that renders nothing passes every check above and is useless.
      expect(container.textContent).toContain("hello")
    })
  }

  it("leaves the rows that are still plain text reading exactly as written", () => {
    // Most stored bodies predate the editor: they are plain paragraphs, and a
    // couple of them are legacy Glide markdown. Both must come out readable —
    // this is the half a sanitiser change breaks silently.
    const { container } = render(
      <RichText html={"They rang about the invoice run.\n\nIt is fixed now."} />
    )
    expect(container.textContent).toContain("They rang about the invoice run.")
    expect(container.textContent).toContain("It is fixed now.")
    expect(container.querySelectorAll("p").length, "blank lines are paragraphs").toBe(2)

    const md = render(<RichText html={"## What happened\n\n- the sync stalled\n- we restarted it"} />)
    expect(md.container.textContent).toContain("What happened")
    expect(md.container.querySelectorAll("li").length).toBe(2)
    expect(md.container.textContent, "the markers must not print as text").not.toContain("##")
  })

  it("renders nothing at all for an empty or emptied body", () => {
    // contentEditable leaves a stray <br> when the last character is deleted —
    // richTextValue turns that into "" on the way in, and this is the other end:
    // an empty body must not draw an empty box on the screen.
    for (const empty of ["", null, undefined]) {
      const { container } = render(<RichText html={empty} />)
      expect(container.innerHTML).toBe("")
      cleanup()
    }
  })
})

/* ------------------- 3 · the seam has not been rewritten ------------------- */

describe("the seam keeps its one decision", () => {
  it("RichText injects only what its two pipelines returned", () => {
    const src = readFileSync(join(ROOT, "shared", "web", "rich-text-view.tsx"), "utf8")
    // The component's ONE expression. Written out here so that widening it — a
    // third branch, a raw fallback, a "trusted" flag — has to change this line
    // too, in front of somebody.
    expect(src).toContain("looksLikeHtml(html) ? sanitizeRichHtml(html) : toHtml(html ?? \"\")")
    expect(
      (src.match(/dangerouslySetInnerHTML/g) ?? []).length,
      "the seam injects in exactly one place"
    ).toBe(1)
    expect(src).toContain("__html: safe")
  })
})
