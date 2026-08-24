// Notes — the HTML sanitizer for the editor's seeded content. The editor stores
// and re-loads HTML, so a hostile saved value (e.g. `<img src=x onerror=...>`)
// must never be injected raw. This is deny-by-default on BOTH tags and
// attributes: only a small set of formatting tags survive, every attribute is
// stripped (kills on*, style, href, src), and executable/loadable elements are
// dropped outright. Runs in the browser (returns "" without a DOM, so SSR seeds
// empty and the client effect re-fills).

/** Formatting tags the editor can legitimately produce. Everything else is
 * unwrapped (its text is kept) or, if dangerous, dropped (see DROP_TAGS). */
const ALLOWED_TAGS = new Set([
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "S",
  "STRIKE",
  "MARK",
  "UL",
  "OL",
  "LI",
  "P",
  "DIV",
  "BR",
  "HR",
  "SPAN",
  "BLOCKQUOTE",
  "H1",
  "H2",
  "H3",
])

/** Elements removed with their whole subtree — they carry code, load resources,
 * or are interactive form controls, none of which a notes body should contain. */
const DROP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "NOSCRIPT",
  "TEMPLATE",
  "LINK",
  "META",
  "BASE",
  "SVG",
  "MATH",
  "IMG",
  "PICTURE",
  "VIDEO",
  "AUDIO",
  "SOURCE",
  "TRACK",
  "CANVAS",
  "FORM",
  "INPUT",
  "BUTTON",
  "SELECT",
  "OPTION",
  "TEXTAREA",
  "FRAME",
  "FRAMESET",
  "APPLET",
])

/**
 * Return a safe HTML string: only ALLOWED_TAGS survive, with ALL attributes
 * stripped; DROP_TAGS (and comments) are removed entirely; any other tag is
 * unwrapped so its text is preserved. Returns "" when there's no DOM (SSR).
 */
export function sanitizeNotesHtml(html: string): string {
  if (!html || typeof document === "undefined") return ""

  const tpl = document.createElement("template")
  tpl.innerHTML = html
  const root = tpl.content

  // 1) Drop dangerous elements outright (subtree and all).
  root
    .querySelectorAll([...DROP_TAGS].map((t) => t.toLowerCase()).join(","))
    .forEach((el) => el.remove())

  // 2) Unwrap any non-allowed tag, keeping its children/text. Repeat to a fixed
  //    point, since unwrapping can expose another disallowed wrapper.
  let changed = true
  while (changed) {
    changed = false
    root.querySelectorAll("*").forEach((el) => {
      if (ALLOWED_TAGS.has(el.tagName)) return
      const parent = el.parentNode
      if (!parent) return
      while (el.firstChild) parent.insertBefore(el.firstChild, el)
      parent.removeChild(el)
      changed = true
    })
  }

  // 3) Strip EVERY attribute from every surviving element (kills on*, style,
  //    href, src, and anything else).
  root.querySelectorAll("*").forEach((el) => {
    while (el.attributes.length > 0) el.removeAttribute(el.attributes[0].name)
  })

  // 4) Remove comment nodes.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT)
  const comments: Node[] = []
  while (walker.nextNode()) comments.push(walker.currentNode)
  comments.forEach((c) => c.parentNode?.removeChild(c))

  return tpl.innerHTML
}
