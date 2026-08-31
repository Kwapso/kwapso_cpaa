"use client"

// Display a user-authored BODY safely, whichever of the two formats it is in.
//
// The library Notes editor emits HTML; bodies from the legacy Glide catalogue are
// markdown. One column holds both, with no flag to read (rich-text.ts
// `looksLikeHtml` explains why the test is "does it contain a tag"), so this
// component picks the pipeline — and there is exactly ONE of each:
//
//   HTML     → sanitizeRichHtml: parse in a detached document → strict allowlist
//              → escaped text. Unchanged; this is the path it has always taken.
//   markdown → toHtml (markdown-html.ts), the SAME converter the assistant's
//              replies go through. Escape-first, so its output is safe by
//              construction for the same reason the agent panel can inject it.
//
// Both branches produce known-safe HTML, which is what the one injection below is
// allowed to be. Neither is a second renderer and neither is a second markdown
// pipeline — that was the whole point.

import * as React from "react"

import { ArticleBody } from "@shared/ui/components/article-body/article-body"
import { toHtml } from "@shared/web/markdown-html"
import { looksLikeHtml, sanitizeRichHtml } from "@shared/web/rich-text"

/* THE QUOTED-REPLY OVERRIDE — DELETE THIS THE DAY THE KIT SHIPS A QUOTE
 * REGISTER, AND ADOPT HERS.
 *
 * This is the ONLY thing this file still decides for itself, and it exists for
 * exactly one reason: `ArticleBody` draws every `blockquote` as chapter 13's
 * PULL-QUOTE — the one serif in the system, h3 step, 24px, `my-[var(--space-8)]`,
 * "one per page" by editorial rule. This app's blockquotes are not editorial.
 * They are ordinary quoted replies a person typed inside a ticket or a meeting
 * note, several to a page, and the pull-quote treatment on those would be
 * WRONG rather than merely different.
 *
 * The kit has no second register and no opt-out — the treatment is
 * unconditional descendant CSS on ArticleBody's root — and its law-book does
 * not rule on quotes at all. Inventing one here, or upstream, would be putting
 * our drawing in front of the designer as if it were hers.
 *
 * SO THE GAP IS LOGGED UPSTREAM, NOT GUESSED. Kit `manifest.json` →
 * `notDelivered`, entry **"A non-editorial quote register on ArticleBody"**
 * (kit v1.2.11), with a recommendation, beside the four already there.
 *
 * WHEN THAT ENTRY IS CLOSED AND THE KIT SHIPS THE REGISTER:
 *   1. delete this constant and the `className` that applies it below;
 *   2. pass the kit's own quote variant instead;
 *   3. delete nothing else — every other prose rule here is already the kit's.
 * It is safe to delete the day step 2 is possible, and it should be deleted
 * then rather than kept "in case", because an override whose reason has quietly
 * stopped being true is indistinguishable from a permanent app opinion.
 *
 * The values below are what these 14 screens have always drawn, deliberately:
 * this override changes nothing the owner is looking at, it only holds the line
 * while the kit decides. */
const QUOTED_REPLY_UNTIL_THE_KIT_RULES = [
  "[&_blockquote]:font-[var(--font-sans)] [&_blockquote]:tracking-normal",
  "[&_blockquote]:text-sm [&_blockquote]:text-muted-foreground",
  "[&_blockquote]:my-[var(--space-3)] [&_blockquote]:border-l-2",
  "[&_blockquote]:border-border [&_blockquote]:ps-3",
].join(" ")

/* KEPT AS AN EXPORT, NARROWED IN MEANING. `agent-markdown.tsx` renders the
 * assistant's replies through the same words; it takes the quote override and
 * nothing else, because ArticleBody now supplies the prose. */
export const PROSE = QUOTED_REPLY_UNTIL_THE_KIT_RULES

export function RichText({
  html,
  className,
}: {
  html: string | null | undefined
  className?: string
}) {
  const safe = React.useMemo(
    () => (looksLikeHtml(html) ? sanitizeRichHtml(html) : toHtml(html ?? "")),
    [html]
  )
  if (!safe) return null
  /* THE PROSE IS THE KIT'S — `ArticleBody`, the same part its own screens draw
   * with. `size="compact"` is its 14/1.45 step, which is what these panels have
   * always used; `as="div"` because a ticket reply is not an <article>; and the
   * HTML is INJECTED rather than wrapped, because every rule that spaces this
   * prose is a direct-child selector and one wrapper div would leave the root
   * with a single child and silently kill the vertical rhythm (kit v1.2.11
   * made the injection possible; before it, the prop was typed and threw). */
  return (
    <ArticleBody
      as="div"
      size="compact"
      className={`${QUOTED_REPLY_UNTIL_THE_KIT_RULES} ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  )
}
