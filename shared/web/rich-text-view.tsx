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

import { toHtml } from "@shared/web/markdown-html"
import { looksLikeHtml, sanitizeRichHtml } from "@shared/web/rich-text"

export const PROSE =
  "text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_blockquote]:border-border [&_blockquote]:text-muted-foreground [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold [&_h4]:mt-3 [&_h4]:font-semibold [&_hr]:border-border [&_hr]:my-3 [&_li]:my-0.5 [&_mark]:bg-primary/20 [&_mark]:text-foreground [&_mark]:rounded [&_mark]:px-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5"

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
  return <div className={`${PROSE} ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: safe }} />
}
