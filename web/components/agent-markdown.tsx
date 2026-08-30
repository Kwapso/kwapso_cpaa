"use client"

// AgentMarkdown — render the assistant's reply. A reply is a markdown string that
// may carry VISUAL BLOCKS (shared/agent-blocks.ts): fenced regions the app draws as
// real components instead of paragraphs of figures. So this splits the reply into
// segments (web/lib/agent-segments) and renders each one the right way:
//
//   text  → the shared markdown grouping (@shared/web/markdown-html), rendered as
//           REACT and injected with RichText's PROSE classes so a reply reads like
//           any other rich text in the app.
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
//
// ════════════════════════════════════════════════════════════════════════════
// WHY THE PROSE IS REACT NOW, AND NOT ONE INJECTED STRING.
//
// A citation mark is a `<Cite for="…">` — the design kit's own component (RULING
// D7-2), which reads the turn's sources out of context and draws the source's
// NUMBER. It has to sit inside the sentence it belongs to, and a component
// cannot be injected into an HTML string.
//
// The obvious alternative was to render the string as before and split its
// OUTPUT at each mark. That tears a paragraph in half: a `<p>` opened in one
// injected fragment and closed in the next is two block elements to the browser,
// so every citation would break its own line. So the BLOCK structure is built
// here in React from the shared grouping (`mdBlocks`), and only the INLINE
// markup of each line is still injected — the same escape-first subset, from the
// same `inline` the string renderer uses. There is no second markdown
// implementation and no widened HTML surface: what reaches `innerHTML` is
// strictly less than it was.

import * as React from "react"

import { Cite } from "@shared/ui/components/agent-chat/agent-chat"
import { inline, mdBlocks, type MdBlock } from "@shared/web/markdown-html"
import { splitCites } from "@shared/agent-cites"
import { splitReply } from "@/lib/agent-segments"
import { AgentBlockView } from "@/components/agent-blocks"
import { PROSE } from "@shared/web/rich-text-view"

/** One line of prose — the inline markup injected as before, with the kit's
 * citation mark standing where the model put it. A line with no mark is one
 * span, exactly as it always was. */
function Line({ escaped }: { escaped: string }) {
  const parts = splitCites(escaped)
  return (
    <>
      {parts.map((part, i) =>
        part.t === "cite" ? (
          // Renders NOTHING when this turn carries no such source — the kit's
          // own behaviour, and the reason a model reaching back to an earlier
          // question's passages cannot draw a mark with nothing under it.
          <Cite key={i} for={part.sourceId} />
        ) : (
          <span key={i} dangerouslySetInnerHTML={{ __html: inline(part.text) }} />
        )
      )}
    </>
  )
}

function Block({ block }: { block: MdBlock }) {
  // A TABLE SCROLLS IN ITS OWN BOX. The assistant panel is 327px wide on a phone
  // and a three-column table is not going to fit; the alternative — letting it
  // widen the panel — pushes the whole conversation sideways. `min-w-0` on the
  // wrapper is what actually lets it shrink inside the flex column above.
  if ("rows" in block) {
    return (
      <div className="my-2 min-w-0 overflow-x-auto">
        <table className="w-full border-collapse text-left text-caption">
          {block.head.length > 0 && (
            <thead>
              <tr>
                {block.head.map((c, i) => (
                  <th key={i} className="border-b px-2 py-1 font-[var(--font-weight-medium)] whitespace-nowrap">
                    <Line escaped={c} />
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {row.map((c, i) => (
                  <td key={i} className="border-b px-2 py-1 align-top">
                    <Line escaped={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  // `"items" in block` rather than a test on `tag` — see the note in
  // markdown-html.ts: a discriminant that is itself a union of literals cannot
  // be narrowed away, so the paragraph branch below would not see its `lines`.
  if ("items" in block) {
    const List = block.tag
    return (
      <List>
        {block.items.map((item, i) => (
          <li key={i}>
            <Line escaped={item} />
          </li>
        ))}
      </List>
    )
  }
  const Tag = block.tag
  return (
    <Tag>
      {block.lines.map((l, i) => (
        <React.Fragment key={i}>
          {/* The soft line break the string renderer joins with — a newline
              inside one paragraph, not a new one. */}
          {i > 0 ? <br /> : null}
          <Line escaped={l} />
        </React.Fragment>
      ))}
    </Tag>
  )
}

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
              className="my-2 overflow-x-auto rounded-[var(--radius)] border bg-muted p-3 text-xs whitespace-pre-wrap text-muted-foreground"
            >
              {seg.text}
            </pre>
          )
        const blocks = mdBlocks(seg.text)
        if (!blocks.length) return null
        return (
          <div key={i} className={PROSE}>
            {blocks.map((b, j) => (
              <Block key={j} block={b} />
            ))}
          </div>
        )
      })}
    </div>
  )
}
