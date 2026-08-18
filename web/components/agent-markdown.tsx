"use client"

// AgentMarkdown — render the assistant's reply. A reply is a markdown string that
// may carry VISUAL BLOCKS (shared/agent-blocks.ts): fenced regions the app draws as
// real components instead of paragraphs of figures. So this splits the reply into
// segments (web/lib/agent-segments) and renders each one the right way:
//
//   text  → the existing escape-first markdown path (@shared/web/markdown-html),
//           injected with RichText's PROSE classes so a reply reads like any other
//           rich text in the app.
//   block → a real component (@/components/agent-blocks). React children, never
//           injected HTML — the structured path never touches innerHTML at all.
//   code  → a fence we closed and REFUSED (bad JSON, an unknown kind, a value that
//           wasn't a number): the model's own text, inert, in a <pre>. Shown rather
//           than swallowed, because a block that silently vanished would read as the
//           assistant having answered nothing.
//
// THIS IS THE ONE SEAM BOTH CHATS SHARE. The agent panel renders every bubble
// through here (web/lib/use-agent-chat.tsx), and so does anything that answers from
// the knowledge base — a knowledge panel gets blocks by using this component, with
// no second renderer to keep in step.

import * as React from "react"

import { toHtml } from "@shared/web/markdown-html"
import { splitReply } from "@/lib/agent-segments"
import { AgentBlockView } from "@/components/agent-blocks"
import { PROSE } from "@shared/web/rich-text-view"

export function AgentMarkdown({ text }: { text: string }) {
  const segments = React.useMemo(() => splitReply(text), [text])
  if (!segments.length) return null
  return (
    <div className="flex min-w-0 flex-col">
      {segments.map((seg, i) => {
        if (seg.t === "block") return <AgentBlockView key={i} block={seg.block} />
        if (seg.t === "code")
          return (
            <pre
              key={i}
              className="my-2 overflow-x-auto rounded-xl border bg-muted p-3 text-xs whitespace-pre-wrap text-muted-foreground"
            >
              {seg.text}
            </pre>
          )
        const html = toHtml(seg.text)
        if (!html) return null
        return <div key={i} className={PROSE} dangerouslySetInnerHTML={{ __html: html }} />
      })}
    </div>
  )
}
