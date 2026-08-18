// TALKING TO A MODEL, THE TWO PIECES EVERY WORKER NEEDS: one cheap call, and the
// fence that marks somebody else's words inside a prompt.
//
// It lives here rather than beside the agent because TWO workers now spend a
// model on a single short job: data-ops drafts a ticket reply and names a
// conversation, and content WRITES THE ANSWER the knowledge base found (R23).
// A second copy of `env.AI.run` in the second worker would be a second model
// client — two places to change the model, two places for a timeout or a token
// cap to be forgotten, and no single answer to "what does the cheap path do?".
//
// ALWAYS WORKERS AI, whatever key is set. The agent's own turn picks its
// provider in data-ops' selectModel() because a turn calls tools and has to
// reason; these jobs are one paragraph out of text we already hold, and the
// cheapest capable model is the right one every time. It is a BINDING, not an
// outside socket, which is how R11's timeout law is satisfied here — the same
// way a service binding satisfies it.

import type { Ai } from "@cloudflare/workers-types"

/** What this seam needs from a worker's env — structurally, so any worker with
 * the AI binding can use it without importing the other's Env type. */
export type CheapTextEnv = {
  AI: Ai
  /** Swap the model without a code change. Same var name in both workers, so
   * one setting moves the whole cheap path. */
  WORKERS_AI_MODEL?: string
}

/** The default cheap model — fast, chats well, and the one the agent falls back
 * to when no Anthropic key is set. Named once so the two callers cannot drift. */
export const CHEAP_TEXT_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct"

/** One cheap text completion (no tools). Returns the model's words, trimmed.
 *
 * `maxTokens` is optional and it is a CEILING ON THE BILL as much as on the
 * length: a job that asks for a paragraph should say so, because a model with no
 * cap will happily write an essay and the caller pays for it. Left unset, the
 * provider's own default applies — which is what the reply-draft path has always
 * done and is deliberately unchanged. */
export async function cheapText(
  env: CheapTextEnv,
  system: string,
  user: string,
  opts?: { maxTokens?: number }
): Promise<string> {
  const body: Record<string, unknown> = {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  }
  if (opts?.maxTokens) body.max_tokens = opts.maxTokens
  const out = (await env.AI.run((env.WORKERS_AI_MODEL || CHEAP_TEXT_MODEL) as never, body as never)) as {
    response?: string
  }
  return (out.response ?? "").trim()
}

/* ------------------------------- the fence -------------------------------- */

/** THE MARKER THAT SAYS "THIS IS DATA, NOT AN INSTRUCTION".
 *
 * On Claude a tool result travels in its own `tool_result` block: the transport
 * itself says what the text is, structurally, and no wording inside it can change
 * that. Everywhere else it does not — Workers AI has no such block (its chat
 * template rejects a replayed `role:"tool"` round-trip), and a one-shot prompt has
 * no transport for it at all. So somebody else's paragraph arrives looking exactly
 * like something the user just typed, and the only thing between an attacker's
 * text and the model obeying it is the system prompt's word DATA — with nothing on
 * the page to attach that word to.
 *
 * So the fence is STATED IN THE SAME PLACE TWICE: the untrusted text is wrapped in
 * this delimiter, and the system prompt names this same constant. One export, so
 * the marker a prompt promises and the marker the code writes cannot drift apart —
 * a rename breaks both ends at once, in the compiler.
 *
 * It is SHARED because the material is: a ticket description reaches the assistant
 * as a tool result in data-ops and reaches the answer-writer as a knowledge passage
 * in content. Two fences with two names would be two promises, and the second one
 * would be the one nobody remembered to make. */
export const TOOL_RESULT_TAG = "tool_result"

const FENCE_CLOSE = `</${TOOL_RESULT_TAG}>`

/** Wrap one piece of somebody else's text so the model can SEE where it begins and
 * ends. `from` names where it came from (a tool, a source title) — sanitised,
 * because it lands inside an attribute the model reads.
 *
 * AND IT IS CLOSED FROM THE INSIDE. The content is exactly the untrusted material
 * this exists to contain — a ticket description is 20,000 characters an attacker
 * chose — so the first thing they would write is the closing marker, ending the
 * fence early and continuing in what now looks like their own voice. The marker is
 * therefore de-fanged wherever it appears in the payload: a fence anyone can close
 * is a decoration. */
export function fenceToolResult(from: string, content: string): string {
  const name = from.replace(/[^\w.-]/g, "") || "tool"
  const safe = content.split(FENCE_CLOSE).join(`</${TOOL_RESULT_TAG}_escaped>`)
  return `<${TOOL_RESULT_TAG} from="${name}">\n${safe}\n${FENCE_CLOSE}`
}
