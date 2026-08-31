// shared/web/rich-text.ts is the RENDER SECURITY BOUNDARY, in two halves:
//
//  • sanitizeRichHtml — user-authored article HTML (the Notes editor). What it
//    returns is injected into the page, so it must keep formatting but drop
//    scripts, inline handlers, and unsafe links.
//  • safeHref / safeSrc — the URL half. A person types an article's linked
//    resource; the assistant writes links into its replies (and the assistant is
//    steerable by anything it read). Neither may reach an href or a src unchecked.
//
// These lock both halves, plus the source-level rule that no screen may bind a
// user-supplied URL to an attribute without going through the seam.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { sourceFiles } from "@shared/rules/source-scan"
import { toHtml } from "@shared/web/markdown-html"
import { looksLikeHtml, richTextPlain, safeHref, safeSrc, sanitizeRichHtml } from "@shared/web/rich-text"

describe("sanitizeRichHtml", () => {
  it("keeps allowlisted formatting + lists", () => {
    const out = sanitizeRichHtml(
      "<strong>bold</strong> <em>it</em> <mark>hi</mark><ul><li>one</li><li>two</li></ul>"
    )
    expect(out).toContain("<strong>bold</strong>")
    expect(out).toContain("<em>it</em>")
    expect(out).toContain("<mark>hi</mark>")
    expect((out.match(/<li>/g) ?? []).length).toBe(2)
  })

  it("drops <script> entirely — tag and content", () => {
    const out = sanitizeRichHtml("<p>safe</p><script>window.pwned=1</script>")
    expect(out).not.toMatch(/script/i)
    expect(out).not.toContain("pwned")
    expect(out).toContain("safe")
  })

  it("drops non-allowlisted tags + handlers (img/onerror) but keeps text", () => {
    const out = sanitizeRichHtml('<img src=x onerror="alert(1)">hello')
    expect(out).not.toMatch(/img/i)
    expect(out).not.toMatch(/onerror/i)
    expect(out).toContain("hello")
  })

  it("neutralises a javascript: link (becomes a span, no anchor)", () => {
    const out = sanitizeRichHtml('<a href="javascript:alert(1)">click</a>')
    expect(out).not.toMatch(/javascript/i)
    expect(out).not.toContain("<a ")
    expect(out).toContain("click")
  })

  it("keeps a safe https link with rel hardening", () => {
    const out = sanitizeRichHtml('<a href="https://example.com">site</a>')
    expect(out).toContain('href="https://example.com"')
    expect(out).toContain('rel="noreferrer noopener"')
  })

  it("escapes raw angle brackets in text (no injection through text nodes)", () => {
    const out = sanitizeRichHtml("a &lt;b&gt; c")
    expect(out).not.toContain("<b>")
  })
})

// TWO FORMATS IN ONE COLUMN. The Notes editor writes HTML; the bodies that came
// with the legacy Glide catalogue are markdown, and there is no flag between
// them — so half the learning library rendered its own asterisks and hashes as
// literal text. `looksLikeHtml` is the discriminator the renderer asks, and the
// direction it must never get wrong is the HTML one: real markup put through a
// markdown converter is a rendering bug, while a misread markdown body costs a
// paragraph break.
describe("looksLikeHtml — which pipeline a body takes", () => {
  it("says HTML for anything the Notes editor emits", () => {
    for (const html of [
      "<p>Hello</p>",
      "<ul><li>one</li></ul>",
      '<a href="https://x.test">link</a>',
      "line<br>break",
      "<div>plain-ish</div>",
    ])
      expect(looksLikeHtml(html), html).toBe(true)
  })

  it("says NOT HTML for markdown and for plain text", () => {
    for (const md of [
      "## A heading\n\nSome **bold** text.",
      "- one\n- two",
      "Ordinary prose with no markup at all.",
      "A < B and C > D", // stray comparison signs are not a tag
      "",
      null,
      undefined,
    ])
      expect(looksLikeHtml(md), String(md)).toBe(false)
  })
})

// The markdown half, through the SAME converter the assistant's replies take
// (there is one markdown pipeline, and this is it). Escape-first, so what comes
// out is safe by construction rather than by a second sanitising pass.
describe("toHtml on an article body", () => {
  it("renders headings, bold and lists instead of printing their markers", () => {
    const out = toHtml("# Getting started\n\nDo the **first** thing.\n\n- one\n- two")
    expect(out).toContain("<h3>Getting started</h3>")
    expect(out).toContain("<strong>first</strong>")
    expect((out.match(/<li>/g) ?? []).length).toBe(2)
    expect(out).not.toContain("# Getting")
    expect(out).not.toContain("**")
  })

  it("clamps heading levels to the two the prose styles know", () => {
    // A body must not outrank the page title, and the two renderers must agree
    // about what a "##" looks like — sanitizeRichHtml clamps to h3/h4 too.
    expect(toHtml("## Two")).toContain("<h3>Two</h3>")
    expect(toHtml("#### Four")).toContain("<h4>Four</h4>")
  })

  it("escapes markup in a markdown body rather than rendering it", () => {
    const out = toHtml("A tag: <script>alert(1)</script>")
    expect(out).not.toContain("<script>")
    expect(out).toContain("&lt;script&gt;")
  })
})

describe("richTextPlain", () => {
  it("strips tags to plain text (previews / assistant)", () => {
    expect(richTextPlain("<p>Hello <strong>world</strong></p>")).toBe("Hello world")
    expect(richTextPlain(null)).toBe("")
  })
})

/** Live URLs, in every spelling that has ever worked in a browser: the plain
 * scheme, the case-shifted one, the one padded with the whitespace and control
 * characters the URL parser strips before it decides the protocol, and the
 * markup shapes that only *look* like URLs. Every one must come back undefined. */
const HOSTILE_URLS = [
  "javascript:alert(document.cookie)",
  "JaVaScRiPt:alert(1)",
  "  javascript:alert(1)",
  "	java\nscript:alert(1)", // tab + newline inside the scheme — stripped by the parser
  "data:text/html,<script>alert(1)</script>",
  "data:image/svg+xml,<svg onload=alert(1)></svg>",
  "vbscript:msgbox(1)",
  "blob:https://evil.example/1234",
  "<img src=x onerror=alert(1)>",
  "<script>alert(1)</script>",
]

describe("safeHref / safeSrc — the URL render boundary", () => {
  it("returns undefined for every live-URL scheme (nothing to click, nothing to load)", () => {
    for (const raw of HOSTILE_URLS) {
      expect(safeHref(raw), `safeHref must refuse ${JSON.stringify(raw)}`).toBeUndefined()
      expect(safeSrc(raw), `safeSrc must refuse ${JSON.stringify(raw)}`).toBeUndefined()
    }
  })

  it("keeps the addresses people actually paste", () => {
    for (const ok of ["https://example.com/a?b=1", "http://example.com", "/media/learning/x.pdf"]) {
      expect(safeHref(ok)).toBe(ok)
      expect(safeSrc(ok)).toBe(ok)
    }
    expect(safeHref(null)).toBeUndefined()
    expect(safeHref("")).toBeUndefined()
  })

  it("safeSrc is STRICTER than safeHref: mailto is a link, never a frame", () => {
    // An iframe/img src has no use for mailto — and the stricter list is what keeps
    // the src allowlist from ever growing towards the schemes that execute.
    expect(safeHref("mailto:someone@example.com")).toBe("mailto:someone@example.com")
    expect(safeSrc("mailto:someone@example.com")).toBeUndefined()
  })
})

/* ------------------------------------------------------------------------- */

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = join(HERE, "..")

/** Every .tsx that renders — this front door's components and app routes, AND
 * the components BOTH front doors share.
 *
 * `shared/web/` was outside the scan until 19 Aug 2026, which is a blind spot
 * rather than an omission: a component there renders on both hostnames, so an
 * unchecked URL in one would be the same defect twice over. It went unnoticed
 * because nothing shared drew a picture — and then `record-mark.tsx` became the
 * one component every record's picture on either door goes through, which is
 * exactly the file this census should be reading first. */
function screenFiles(): string[] {
  // BOTH front doors. The portal had an injection census but no URL census, so
  // a portal component could bind a data-derived href with a local regex while
  // its agency twin used the seam — and did, until the round-one security
  // sweep read the two side by side.
  return sourceFiles(
    [
      join(WEB, "components"),
      join(WEB, "app"),
      join(WEB, "..", "shared", "web"),
      join(WEB, "..", "web-portal", "components"),
      join(WEB, "..", "web-portal", "app"),
    ],
    {
      extensions: [".tsx"],
    }
  ).map((f) => f.path)
}

/** The `{...}` immediately after `at`, brace-balanced (JSX expressions nest). */
function braced(src: string, at: number): string {
  let depth = 0
  for (let i = at; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}" && --depth === 0) return src.slice(at + 1, i).trim()
  }
  return src.slice(at)
}

/**
 * URL-ish expressions that are NOT user-typed text, so they don't need the seam.
 * Data, not judgement in code — every exemption is a visible line with a reason,
 * the same shape the rules registry uses. Anything not on this list must pass
 * through safeHref/safeSrc or be a literal we wrote ourselves.
 */
const NOT_USER_TYPED: Record<string, string> = {
  // Written without `?.` — the scan normalises optional chaining before lookup, so
  // one entry covers `team.logoUrl` and `ctx?.team?.logoUrl` alike.
  "brand.logoUrl": "shared/brand.ts — a build-time constant, not a field anyone fills in",
  "download.href": "a screen-recipe constant (the export route we wrote)",
  // Keyed on the expression TEXT, local variable and all, so renaming the
  // binding invalidates the pin. It used to read `t.tableKey`, where `t` was
  // the target being mapped and SHADOWED the translator in the same JSX —
  // the rename to `s` is what made this line go red, and the shadow is worth
  // not putting back.
  "dataOps.importSampleHref(s.tableKey)": "an app-built URL from a catalogue key",
  // Uploads: the server writes these as `/media/<key>` (auth/profile.ts,
  // tenancy/teams.ts) — no caller ever supplies the string. `photo`/`logo` are the
  // object/data URL of the file the user just picked in THIS session.
  photo: "the local preview of the image just picked",
  "user.imageUrl": "server-minted /media path",
  "team.logoUrl": "server-minted /media path",
  "ctx.team.logoUrl": "server-minted /media path",
  "inv.teamLogoUrl": "server-minted /media path",
  "s.imageUrl": "server-minted /media path",
  "photo || (user.imageUrl as string)": "local preview, else server-minted /media path",
  "logo || (team.logoUrl as string)": "local preview, else server-minted /media path",
  // An account's logo and cover, in the form that edits them. Both come out of
  // one local `preview()` that is the seam plus the one case the seam cannot
  // express: a `data:` URL is REFUSED by safeSrc on purpose, and the file the
  // person picked two seconds ago in this browser is a data URL until the door
  // has stored it. So `preview` returns the picked file as-is and puts anything
  // else — which is only ever the stored `/media/...` path — through safeSrc.
  // Named here rather than inlined because the check reads the EXPRESSION, and
  // an inline ternary would hide the interesting half of it in a test message.
  logoPreview: "the file just picked in this session, else the stored path through safeSrc",
  coverPreview: "the file just picked in this session, else the stored path through safeSrc",
  // The portal's bottom nav — five route literals declared in the same file,
  // nothing a user or a row ever supplies.
  "dest.href": "the portal shell's own DESTINATIONS table of route literals",
  // THE SIGN-IN DOOR'S ARTWORK. Three static imports of files that ship in the
  // vendored design kit (`shared/ui/assets/`), so the string is written by the
  // BUNDLER — Next emits `/_next/static/media/<name>.<hash>.<ext>` — and there
  // is no path from a request body, a row or a person to any of them. `.src` is
  // there because Next resolves an asset import to a `StaticImageData` object
  // where the kit's own bundler gives a URL string; see
  // web-portal/components/auth-artwork.tsx, which records why.
  "logotypeBlack.src": "a bundler-emitted URL for a file in the design kit",
  "logotypeWhite.src": "a bundler-emitted URL for a file in the design kit",
  "photo1440.src": "a bundler-emitted URL for a file in the design kit",
}

describe("no screen binds an unchecked URL to an attribute", () => {
  it("every href/src expression is a literal, a seam call, or a reviewed exemption", () => {
    const offenders: string[] = []
    let seen = 0
    for (const file of screenFiles()) {
      const src = readFileSync(file, "utf8")
      for (const m of src.matchAll(/\b(href|src)=\{/g)) {
        seen++
        const expr = braced(src, m.index + m[0].length - 1)
        // A literal we wrote (template or quoted string) is our own route.
        if (/^[`"']/.test(expr)) continue
        // The seam, called inline…
        if (/\bsafe(Href|Src)\s*\(/.test(expr)) continue
        // …or a plain local this file assigned FROM the seam (the readable shape:
        // check once at the top, bind the result, use it). Nothing else counts —
        // a local assigned from anything else stays an offender.
        if (/^[A-Za-z_$][\w$]*$/.test(expr) && new RegExp(`\\b${expr}\\s*=\\s*safe(Href|Src)\\s*\\(`).test(src))
          continue
        if (expr.replace(/\?\./g, ".") in NOT_USER_TYPED) continue
        offenders.push(`${file.slice(WEB.length + 1)} → ${m[1]}={${expr}}`)
      }
    }
    // Tripwire: a scan that finds nothing reports "all clear" exactly like a
    // passing one, so prove it is still looking at real markup.
    expect(seen, "the href/src scan found no attribute bindings at all — it has gone blind").toBeGreaterThan(10)
    expect(
      offenders,
      `a URL reaches an attribute unchecked — wrap it in safeHref()/safeSrc() (or add a reasoned NOT_USER_TYPED entry): ${offenders.join(", ")}`
    ).toEqual([])
  })
})
