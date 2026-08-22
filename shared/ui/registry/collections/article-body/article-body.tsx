"use client"

// ArticleBody — renders a learning item's in-app written body (a small, SAFE
// markdown subset: headings, bullet lists, **bold**, and [links](url) — built as
// React nodes, never injected HTML), plus its external link and a content-type
// chip. Flat, token-driven, dark-mode.

import * as React from "react"
import { ExternalLink } from "lucide-react"

import { safeHref } from "../../../lib/url"
import { cn } from "../../../lib/utils"
import { Badge } from "../../primitives/badge/badge"

// Inline: **bold** and [text](url). Returns React nodes — no dangerous HTML.
function inline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g
  let last = 0
  let k = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1]) {
      nodes.push(<strong key={k++}>{m[1]}</strong>)
    } else {
      // Guard every link href: a dangerous scheme collapses to an inert "#".
      const href = safeHref(m[3])
      nodes.push(
        <a
          key={k++}
          href={href}
          target={href === "#" ? undefined : "_blank"}
          rel="noreferrer"
          className="text-primary underline underline-offset-4"
        >
          {m[2]}
        </a>
      )
    }
    last = re.lastIndex
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function renderBody(md: string): React.ReactNode {
  const blocks: React.ReactNode[] = []
  let list: string[] = []
  let k = 0
  const flush = () => {
    if (list.length) {
      const items = list
      blocks.push(
        <ul key={k++} className="flex list-disc flex-col gap-1 pl-5 text-sm">
          {items.map((li, i) => (
            <li key={i}>{inline(li)}</li>
          ))}
        </ul>
      )
      list = []
    }
  }
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd()
    if (/^##\s/.test(line)) {
      flush()
      blocks.push(
        <h4 key={k++} className="text-sm font-semibold">
          {inline(line.replace(/^##\s/, ""))}
        </h4>
      )
    } else if (/^#\s/.test(line)) {
      flush()
      blocks.push(
        <h3 key={k++} className="text-base font-semibold">
          {inline(line.replace(/^#\s/, ""))}
        </h3>
      )
    } else if (/^[-*]\s/.test(line)) {
      list.push(line.replace(/^[-*]\s/, ""))
    } else if (line.trim() === "") {
      flush()
    } else {
      flush()
      blocks.push(
        <p key={k++} className="text-sm leading-relaxed break-words">
          {inline(line)}
        </p>
      )
    }
  }
  flush()
  return <div className="flex flex-col gap-3">{blocks}</div>
}

function ArticleBody({
  title,
  contentType,
  body,
  externalUrl,
  className,
}: {
  title?: React.ReactNode
  /** A chip, e.g. "Article", "Video", "Guide". */
  contentType?: string
  /** The in-app body (safe markdown subset). */
  body?: string
  externalUrl?: string
  className?: string
}) {
  // Guard the external link: a dangerous scheme drops the button entirely.
  const externalHref = externalUrl ? safeHref(externalUrl) : "#"
  return (
    <div className={cn("flex w-full flex-col gap-4", className)}>
      {(title || contentType) && (
        <div className="flex flex-wrap items-center gap-2">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          {contentType && <Badge variant="secondary">{contentType}</Badge>}
        </div>
      )}
      {body && renderBody(body)}
      {externalUrl && externalHref !== "#" && (
        <a
          href={externalHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-primary underline underline-offset-4"
        >
          Open the full resource
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      )}
    </div>
  )
}

export { ArticleBody }
