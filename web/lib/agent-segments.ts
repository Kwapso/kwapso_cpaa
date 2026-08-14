// SPLIT ONE REPLY INTO WHAT TO PAINT. The assistant's reply is still a markdown
// string; a visual block is a fenced region inside it (see shared/agent-blocks.ts),
// so a reply is a sequence of prose and blocks rather than one or the other.
//
// STREAMING IS THE HARD PART, AND IT IS THE REASON THIS IS A PURE FUNCTION. Replies
// arrive token by token and this runs on EVERY delta, so a block's fence is open and
// its JSON half-written for most of that block's life. `{"title":"Hours by acc` is
// not a block yet, and it is not prose either — painting it would flash raw JSON
// into the conversation, and parsing it optimistically would flicker a component in
// and out as the rows arrive. So an UNTERMINATED fence ends the segment list: the
// prose before it paints immediately, the unfinished block paints NOTHING, and the
// moment the closing ``` lands the whole block appears at once, already complete.
// A block is small (a title and a handful of rows), so that wait is imperceptible —
// and it is the only behaviour with no intermediate state to see.
//
// A fence that closes but does NOT parse becomes a `code` segment: the model's own
// text, inert, in a <pre>. Never markup, never silence — a refused block that
// vanished would look like the assistant answered nothing.

import { BLOCK_FENCE_PREFIX, parseAgentBlock, type AgentBlock } from "@shared/agent-blocks"

export type ReplySegment =
  /** Markdown prose — rendered by the existing escape-first toHtml path. */
  | { t: "text"; text: string }
  /** A validated block — rendered as a real component, never as HTML. */
  | { t: "block"; block: AgentBlock }
  /** A fence we closed but refused: shown as the model wrote it, inert. */
  | { t: "code"; text: string }

// Up to three leading spaces, the way markdown itself tolerates an indented fence —
// models indent one inside a list often enough to matter.
const OPEN = new RegExp("^ {0,3}```" + BLOCK_FENCE_PREFIX + "([A-Za-z0-9_-]+)\\s*$")
const CLOSE = /^ {0,3}```\s*$/

export function splitReply(reply: string): ReplySegment[] {
  const lines = reply.replace(/\r\n?/g, "\n").split("\n")
  const out: ReplySegment[] = []
  let prose: string[] = []

  const flush = () => {
    const text = prose.join("\n")
    // Whitespace-only runs between blocks are not a paragraph.
    if (text.trim()) out.push({ t: "text", text })
    prose = []
  }

  let i = 0
  while (i < lines.length) {
    const open = OPEN.exec(lines[i])
    if (!open) {
      prose.push(lines[i])
      i += 1
      continue
    }
    let j = i + 1
    while (j < lines.length && !CLOSE.test(lines[j])) j += 1
    if (j >= lines.length) {
      // Still streaming: everything from the opening fence on is inside a block
      // that hasn't closed. Paint what came before and stop — see the note above.
      flush()
      return out
    }
    flush()
    const body = lines.slice(i + 1, j).join("\n")
    const block = parseAgentBlock(open[1], body)
    out.push(block ? { t: "block", block } : { t: "code", text: body })
    i = j + 1
  }
  flush()
  return out
}
