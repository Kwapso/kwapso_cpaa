// Sanitize user-authored rich text (the library Notes editor emits HTML) to a SAFE
// HTML string. We parse with DOMParser — a DETACHED document where <script> never
// executes and inline handlers never fire — keep only an ALLOWLIST of formatting tags
// with their text HTML-escaped, drop scripts/handlers entirely, and allow only
// http/https/mailto links. The result is safe to inject (same model as DOMPurify);
// the <RichText> component does exactly that. richTextPlain strips everything to
// plain text (list/card previews, and the copy the assistant reads).

// DOM tag (uppercase, as the parser reports) → the element we emit.
const TAG_MAP: Record<string, string> = {
  STRONG: "strong",
  B: "strong",
  EM: "em",
  I: "em",
  MARK: "mark",
  U: "u",
  S: "s",
  DEL: "s",
  CODE: "code",
  P: "p",
  DIV: "p",
  BR: "br",
  HR: "hr",
  BLOCKQUOTE: "blockquote",
  UL: "ul",
  OL: "ol",
  LI: "li",
  H1: "h3", // clamp heading levels — a body shouldn't outrank the page title
  H2: "h3",
  H3: "h4",
  H4: "h4",
  A: "a",
  SPAN: "span",
}
// Tags whose CONTENT is dropped entirely (never even render their text).
const DROP_CONTENT = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "NOSCRIPT", "TEMPLATE"])
const VOID_TAGS = new Set(["br", "hr"])

export const escapeText = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
// Attribute-value escaper — like escapeText but ALSO encodes the double-quote, so a
// value interpolated into `attr="..."` can never break out of the quotes (an href
// with a stray `"` otherwise injects a live event handler — attribute-breakout XSS).
export const escapeAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

// THE URL RENDER BOUNDARY. Any user-authored URL — an article's linked resource,
// a link the assistant wrote — is untrusted, and the browser will happily run
// `javascript:` from an href (on click) or from an iframe src (in THIS origin).
// So a URL only reaches an attribute through one of the two functions below,
// which resolve it against a base and check the RESOLVED protocol (so entity- and
// whitespace-obfuscated schemes decode before the check). Anything else → undefined,
// and the caller renders nothing rather than something live.
const LINK_SCHEMES = ["http:", "https:", "mailto:"]
// A src has no reason to be mailto:, and MUST never be javascript:/data:/blob:/vbscript:.
const SRC_SCHEMES = ["http:", "https:"]
// Characters that never appear unencoded in a real address (a genuine URL
// percent-encodes them) but are exactly the ones that break OUT of an HTML
// attribute. What this seam returns is put straight into `attr="..."` by callers
// that build HTML as strings, so refuse them here rather than trust every caller
// to escape: a value that needs escaping to be safe isn't a safe value.
const MARKUP_CHARS = /[<>"'`\\]/

function safeUrl(raw: string | null | undefined, allow: readonly string[]): string | undefined {
  if (!raw || MARKUP_CHARS.test(raw)) return undefined
  try {
    const u = new URL(raw, "https://x.invalid")
    return allow.includes(u.protocol) ? raw : undefined
  } catch {
    return undefined
  }
}

/** A URL safe to put in an `href` — http/https/mailto, or app-relative. */
export function safeHref(raw: string | null | undefined): string | undefined {
  return safeUrl(raw, LINK_SCHEMES)
}

/** A URL safe to put in a `src` (img / video / audio / iframe) — http/https or
 * app-relative only. Stricter than safeHref on purpose: a framed `javascript:`
 * URL executes with the page's own origin, which is a full XSS, not a broken image. */
export function safeSrc(raw: string | null | undefined): string | undefined {
  return safeUrl(raw, SRC_SCHEMES)
}

function serializeNode(node: ChildNode): string {
  if (node.nodeType === 3) return escapeText(node.textContent ?? "") // text
  if (node.nodeType !== 1) return "" // comments / others
  const el = node as Element
  if (DROP_CONTENT.has(el.tagName)) return ""
  const children = Array.from(el.childNodes).map(serializeNode).join("")
  const mapped = TAG_MAP[el.tagName]
  if (!mapped) return children // unknown tag → unwrap, keep its (escaped) text
  if (VOID_TAGS.has(mapped)) return `<${mapped}>`
  if (mapped === "a") {
    const href = safeHref(el.getAttribute("href"))
    return href
      ? `<a href="${escapeAttr(href)}" target="_blank" rel="noreferrer noopener">${children}</a>`
      : `<span>${children}</span>`
  }
  return `<${mapped}>${children}</${mapped}>`
}

/** IS THIS BODY HTML, OR IS IT MARKDOWN?
 *
 * The Notes editor emits HTML and always has. Bodies that arrived with the legacy
 * Glide catalogue were written in MARKDOWN, and the two sit in the same column
 * with no flag between them — so half the learning library rendered its own
 * asterisks and hashes as literal text. There is no discriminator to read, so the
 * body is asked the only question that has a reliable answer: does it contain an
 * element at all?
 *
 * A TAG IS THE TEST, not "does it look like markdown". Getting it wrong in the
 * markdown direction costs a paragraph break; getting it wrong in the HTML
 * direction would put real markup through a markdown converter, which is a
 * rendering bug at best. So HTML keeps the path it has always had, and everything
 * else — markdown and plain text alike — goes the other way, where a plain
 * paragraph is still just a paragraph.
 *
 * The RENDERING half is in components/rich-text.tsx: it picks the pipeline, and
 * there is exactly one of each. */
export function looksLikeHtml(s: string | null | undefined): boolean {
  return !!s && /<\/?[a-z][a-z0-9]*(\s[^<>]*)?>/i.test(s)
}

/** Parse + allowlist user HTML into a safe HTML string (safe to inject). */
export function sanitizeRichHtml(html: string | null | undefined): string {
  if (!html) return ""
  // SSR / build (no DOM): degrade to escaped plain text; the client re-renders richly.
  if (typeof DOMParser === "undefined") return escapeText(richTextPlain(html))
  const doc = new DOMParser().parseFromString(html, "text/html")
  return Array.from(doc.body.childNodes).map(serializeNode).join("")
}

/** Strip all tags → plain text (list/card previews, the assistant's reading copy). */
export function richTextPlain(html: string | null | undefined): string {
  if (!html) return ""
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
}
