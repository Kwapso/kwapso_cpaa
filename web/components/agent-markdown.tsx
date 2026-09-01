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
  // widen the panel — pushes the whole conversation sideways.
  //
  // IT NEEDS A FLOOR, OR IT CRUSHES INSTEAD OF SCROLLING. `w-full` alone obeys
  // whatever room it is given, so `overflow-x-auto` never engaged: measured on
  // staging 31 Aug 2026, a two-column table sat at 295px with cells wrapping
  // every second word, and the wrapper reported NO overflow at all, because the
  // table had already shrunk to fit it. `max-content` is the wrong floor in the
  // other direction — the same table went to 2757px, one unwrapped line per
  // cell. 28rem is a readable minimum for two columns.
  //
  // AND THE FLOOR THEN PUSHED THE PANEL SIDEWAYS ANYWAY — the half the fix above
  // did not have, and the defect the owner screenshotted. `min-w-0` lets a box
  // SHRINK; it does nothing about a box being SIZED BY ITS CONTENTS, and every
  // ancestor of this wrapper up to the chat bubble is shrink-to-fit. So the
  // 28rem floor propagated straight up: measured live on staging at 375px on
  // 1 Sep 2026, the wrapper was 504px wide with a scrollWidth of 504 — no
  // overflow to scroll, because the box had grown to its content — and the
  // bubble around it was 540px inside a column of 241. The conversation scrolled
  // sideways and the table was cut off, which is exactly what the floor was
  // added to prevent.
  //
  // `contain: inline-size` IS THE MISSING WORD, and it is the only one: it makes
  // this box's width independent of its contents, so the floor stops travelling
  // upward, the bubble sizes to the prose beside the table, and `overflow-x-auto`
  // finally has something to scroll. `w-full` then fills the room the bubble
  // really has, and the 14rem floor is for the one case containment breaks on
  // its own — a message that is NOTHING BUT a table, where a contained box
  // contributes zero and the bubble collapses to its own padding (measured: 36px).
  // 14rem + the bubble's padding fits inside 85% of a 320px phone, so the floor
  // never reintroduces the overflow it is guarding against.
  //
  // MEASURED, same panel, same table, same width: wrapper 205px with a
  // scrollWidth of 504 (it scrolls), bubble 241 inside its 273 column, and the
  // document's own scrollWidth back to 375. `min-w-0` was kept and is doing
  // nothing here now; containment is what carries it.
  if ("rows" in block) {
    return (
      <div className="my-2 w-full min-w-[14rem] contain-inline-size overflow-x-auto">
        <table className="w-full min-w-[28rem] border-collapse text-left text-caption">
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
