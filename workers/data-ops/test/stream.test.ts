// The streaming co-pilot's WIRE + PARSE contract, unit-tested with no network:
//  • sseFrame / terminalEvent — the SSE serialization the route writes (each event →
//    exactly `data: {...}\n\n`; a done outcome → `final`, a pause → `confirm`), and
//  • ClaudeModel's SSE PARSING — parseAnthropicStream fed a hand-built Messages stream
//    (text_delta chunks + a tool_use assembled from input_json_delta + message_stop):
//    onText must receive each text delta, and the returned ModelReply must carry the
//    joined text + the fully-parsed tool call.

import { describe, expect, it } from "vitest"

import { sseFrame, terminalEvent } from "../src/routes/agent"
import { parseOpenAiStream, toOpenAiMessages } from "../src/lib/model"
import type { ChatMessage } from "../src/lib/model"
import type { ChatOutcome, StreamEvent } from "@shared/types"
import type { AgentQuota } from "@shared/types"

const QUOTA: AgentQuota = {
  freeDaily: 25,
  freeUsedToday: 1,
  freeRemaining: 24,
  creditBalance: 0,
  remaining: 24,
  blocked: false,
  unlimited: false,
}

/** A response body as a stream of chunks, so a frame can be cut in half on purpose. */
function bodyOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
}

describe("toOpenAiMessages: the wire shape, and the round-trip the old one could not do", () => {
  it("a multi-tool turn replays as one assistant turn and one tool message per result", () => {
    // The exact shape the failure path builds: an assistant turn with 3 tool calls,
    // then 3 results, then a trailing user text (the wrap-up ask).
    //
    // THIS IS THE CHANGE OF 2026-08-28, and it is why an agent loop is possible on
    // this transport at all. The Anthropic shape needed the three results and the
    // ask COALESCED into one user message, because two user messages in a row were
    // rejected. The chat-completions shape carries a result as its own
    // `role:"tool"` message keyed by `tool_call_id`, so nothing is merged and the
    // model sees which answer belongs to which call.
    const convo: ChatMessage[] = [
      { role: "system", content: "SYS" },
      { role: "user", content: "do three things" },
      {
        role: "assistant",
        content: "on it",
        toolCalls: [
          { id: "t1", name: "create_role", input: {} },
          { id: "t2", name: "create_brand_asset", input: { label: "x" } },
          { id: "t3", name: "raise_help_ticket", input: {} },
        ],
      },
      { role: "tool", content: "FAILED: no permission", toolCallId: "t1", toolName: "create_role" },
      { role: "tool", content: "FAILED: no permission", toolCallId: "t2", toolName: "create_brand_asset" },
      { role: "tool", content: "OK", toolCallId: "t3", toolName: "raise_help_ticket" },
      { role: "user", content: "explain what failed" },
    ]
    const msgs = toOpenAiMessages(convo)

    // The system prompt STAYS — it is a message on this transport, not a top-level field.
    expect(msgs.map((m) => m.role)).toEqual([
      "system", "user", "assistant", "tool", "tool", "tool", "user",
    ])

    // The assistant turn carries its text and one tool_call per call, arguments as a STRING.
    expect(msgs[2]).toEqual({
      role: "assistant",
      content: "on it",
      tool_calls: [
        { id: "t1", type: "function", function: { name: "create_role", arguments: "{}" } },
        { id: "t2", type: "function", function: { name: "create_brand_asset", arguments: '{"label":"x"}' } },
        { id: "t3", type: "function", function: { name: "raise_help_ticket", arguments: "{}" } },
      ],
    })

    // Each result is its own message, keyed back to the call it answers.
    expect(msgs[3]).toEqual({ role: "tool", tool_call_id: "t1", content: "FAILED: no permission" })
    expect(msgs[5]).toEqual({ role: "tool", tool_call_id: "t3", content: "OK" })
  })

  it("an assistant turn with no tool calls stays a plain message", () => {
    const msgs = toOpenAiMessages([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ])
    expect(msgs).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ])
  })
})
describe("sseFrame: each event serializes to one data: frame", () => {
  it("wraps every event shape as `data: <json>\\n\\n`", () => {
    const cases: StreamEvent[] = [
      { t: "text", d: "hello" },
      { t: "step_start", tool: "invite_member", summary: "Invite a@b.com as role r1" },
      { t: "step_end", tool: "invite_member", ok: true, summary: "Invite a@b.com as role r1" },
      // A failed step carries the door's short reason so the red row can say WHY.
      {
        t: "step_end",
        tool: "create_role",
        ok: false,
        summary: 'Create the role "Sub admin"',
        error: 'You don\'t have permission to do that — your role is missing the "create" right on member roles.',
      },
      {
        t: "confirm",
        threadId: "t1",
        // The payload rides the wire with the summary — the panel can't show what
        // never left the server.
        calls: [
          { name: "remove_member", input: { userId: "u1" }, summary: "Remove Jane Doe", details: ["Member: Jane Doe"] },
        ],
        text: "About to remove",
      },
      { t: "error", message: "safe message" },
    ]
    for (const ev of cases) {
      const frame = sseFrame(ev)
      expect(frame.startsWith("data: ")).toBe(true)
      expect(frame.endsWith("\n\n")).toBe(true)
      // The payload is exactly the JSON of the event (round-trips cleanly).
      expect(JSON.parse(frame.slice("data: ".length, -2))).toEqual(ev)
    }
  })

  it("keeps the terse keys stable (t/d, no extra whitespace between frames)", () => {
    expect(sseFrame({ t: "text", d: "hi" })).toBe('data: {"t":"text","d":"hi"}\n\n')
  })
})

describe("terminalEvent: a ChatOutcome becomes the single terminal event", () => {
  it("a finished outcome → final (carrying the whole outcome)", () => {
    const outcome: ChatOutcome = { done: true, threadId: "t1", reply: "All set.", quota: QUOTA }
    expect(terminalEvent(outcome)).toEqual({ t: "final", outcome })
  })

  it("a pause-for-confirm outcome → confirm (carrying the thread id, pending calls + lead-in)", () => {
    const outcome: ChatOutcome = {
      done: false,
      threadId: "t1",
      assistantText: "I'll remove them once you confirm.",
      needsConfirm: [
        { name: "remove_member", input: { userId: "u1" }, summary: "Remove Jane Doe", details: ["Member: Jane Doe"] },
      ],
      quota: QUOTA,
    }
    const ev = terminalEvent(outcome)
    expect(ev).toEqual({
      t: "confirm",
      threadId: "t1",
      calls: outcome.needsConfirm,
      text: "I'll remove them once you confirm.",
    })
    // The payload travels WITH the proposal. A terminal event that carried only the
    // summary would leave the panel asking for a yes to something unreadable.
    expect(ev.t === "confirm" && ev.calls[0].details).toEqual(["Member: Jane Doe"])
    // The regression lock: the confirm event MUST carry the thread id, or a first-turn
    // confirm (a brand-new conversation) can never be resolved — the approve/decline
    // buttons no-op because the client never learned the thread id (dead-button bug).
    expect(ev.t === "confirm" && ev.threadId).toBe("t1")
  })

  it("a confirm with empty lead-in text drops the text key (but keeps the thread id)", () => {
    const outcome: ChatOutcome = {
      done: false,
      threadId: "t1",
      assistantText: "",
      needsConfirm: [
        {
          name: "revoke_invite",
          input: { inviteId: "i1" },
          summary: "Revoke the invite for a@b.com",
          details: ["Invite: a@b.com"],
        },
      ],
      quota: QUOTA,
    }
    expect(terminalEvent(outcome)).toEqual({ t: "confirm", threadId: "t1", calls: outcome.needsConfirm })
  })
})

describe("parseOpenAiStream: parses the chat-completions SSE into text + tool calls", () => {
  // A realistic (trimmed) chat-completions stream: two text deltas, then a tool call
  // whose argument JSON arrives across two chunks. The id and name appear only on the
  // FIRST chunk of a call, which is why the parser keys by `index`.
  const frames = [
    'data: {"choices":[{"delta":{"content":"Invit"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"ing them now."}}]}\n\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_9","type":"function","function":{"name":"invite_member","arguments":"{\\"email\\":\\"a@b.com\\","}}]}}]}\n\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"roleId\\":\\"r1\\"}"}}]}}]}\n\n',
    'data: {"usage":{"prompt_tokens":1200,"completion_tokens":40},"choices":[{"delta":{}}]}\n\n',
    "data: [DONE]\n\n",
  ]

  it("fires onText for each text delta and returns the joined text + parsed tool call", async () => {
    const deltas: string[] = []
    const reply = await parseOpenAiStream(bodyOf(frames.join("")), (d) => deltas.push(d))

    // Text deltas arrived in order, and only the text (not the argument JSON) streamed.
    expect(deltas).toEqual(["Invit", "ing them now."])
    expect(reply.text).toBe("Inviting them now.")

    // The argument JSON — split across two chunks — was stitched and parsed.
    expect(reply.toolCalls).toHaveLength(1)
    expect(reply.toolCalls[0]).toEqual({
      id: "call_9",
      name: "invite_member",
      input: { email: "a@b.com", roleId: "r1" },
    })
    // And the turn's cost came back with it.
    expect(reply.usage?.input).toBe(1200)
    expect(reply.usage?.output).toBe(40)
  })

  it("stitches a frame split across two body chunks (partial-frame buffering)", async () => {
    const whole = frames.join("")
    const cut = Math.floor(whole.length / 2)
    const deltas: string[] = []
    const reply = await parseOpenAiStream(bodyOf(whole.slice(0, cut), whole.slice(cut)), (d) =>
      deltas.push(d)
    )
    expect(reply.text).toBe("Inviting them now.")
    expect(reply.toolCalls[0].input).toEqual({ email: "a@b.com", roleId: "r1" })
  })

  it("a text-only turn yields no tool calls", async () => {
    const textOnly = [
      'data: {"choices":[{"delta":{"content":"Hello there."}}]}\n\n',
      "data: [DONE]\n\n",
    ].join("")
    const deltas: string[] = []
    const reply = await parseOpenAiStream(bodyOf(textOnly), (d) => deltas.push(d))
    expect(deltas).toEqual(["Hello there."])
    expect(reply.text).toBe("Hello there.")
    expect(reply.toolCalls).toEqual([])
  })

  it("a model that writes malformed arguments still yields a call, not a dead turn", async () => {
    // A door can refuse an argument-less call cleanly; a turn that dies parsing cannot
    // be recovered at all. So bad JSON degrades to {} rather than throwing.
    const bad =
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"list_roles","arguments":"{not json"}}]}}]}\n\n' +
      "data: [DONE]\n\n"
    const reply = await parseOpenAiStream(bodyOf(bad), () => {})
    expect(reply.toolCalls).toEqual([{ id: "c1", name: "list_roles", input: {} }])
  })
})
