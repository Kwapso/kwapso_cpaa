// THE AGENT'S WIRE FORMAT, and the one reader that decodes it.
//
// Split out of the door lists because it is plumbing, not a door: no `/api/`
// path literal lives here, so the gateway suites that walk this directory for
// the app's attack surface find nothing to walk in it — which is correct.

import { ApiFailure } from "@shared/web/api"
import type {
  ApiError,
  ChatOutcome,
  ModelFailure,
  KnowledgeCitation,
  KnowledgePassage,
  PendingCall,
} from "@shared/types"

/** One Server-Sent Event from an agent turn. `text` deltas + `step_*` may repeat any
 * number of times; exactly one TERMINAL event (`confirm` | `final` | `error`) ends the
 * stream. Everything the assistant says arrives as `text` events — `final` only
 * settles the turn. Keys are terse + stable — the wire contract data-ops emits. */
export type AgentStreamEvent =
  | { t: "text"; d: string }
  | { t: "step_start"; tool: string; summary: string; ids?: Record<string, string> }
  | { t: "step_end"; tool: string; ok: boolean; summary: string; error?: string }
  /** WHAT THE ASSISTANT JUST READ — the answer seam's own citations and passages
   * (Law R23), for the turn that is streaming. The one tool result that reaches
   * this side, because a citation mark in the reply has to have something under
   * it to point at. Repeats: a turn that asks twice retrieves twice. */
  | { t: "sources"; citations: KnowledgeCitation[]; passages: KnowledgePassage[] }
  | { t: "confirm"; threadId: string; calls: PendingCall[]; text?: string }
  | { t: "final"; outcome: ChatOutcome }
  /** `reason` is set when the failure was the MODEL door and could be
   * classified — the screen says its own sentence for that reason (R28/R33: a
   * worker cannot translate) and falls back to `message` when it is absent. */
  | { t: "error"; message: string; reason?: ModelFailure }

/** Read a POST's `text/event-stream` body, splitting on the blank-line record
 * separator and calling `onEvent` for each `data:` line's JSON. Shared by the two
 * streaming agent callers. Throws ApiFailure if the response isn't OK (before any
 * event flows) so callers surface a clean message like the non-streaming path. */
export async function streamSse(
  path: string,
  body: unknown,
  onEvent: (ev: AgentStreamEvent) => void
): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
  })
  if (!res.ok || !res.body) {
    const err = (await res.json().catch(() => null)) as ApiError | null
    throw new ApiFailure(res.status, err?.error ?? "unknown", err?.message ?? "Something went wrong. Try again.")
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  // Events are separated by a blank line ("\n\n"); a partial record stays buffered
  // until its terminator arrives. Parse each record's `data:` payload as one event.
  const flush = (raw: string) => {
    const line = raw.split("\n").find((l) => l.startsWith("data:"))
    if (!line) return
    const json = line.slice(5).trim()
    if (!json) return
    try {
      onEvent(JSON.parse(json) as AgentStreamEvent)
    } catch {
      /* skip a malformed frame rather than break the stream */
    }
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep: number
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      flush(buffer.slice(0, sep))
      buffer = buffer.slice(sep + 2)
    }
  }
  // A final record with no trailing blank line (some servers omit it on close).
  if (buffer.trim()) flush(buffer)
}
