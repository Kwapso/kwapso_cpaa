// THE ASSISTANT MAY NOT HAND THE APP A LIST OF PEOPLE TO EMAIL WITHOUT ASKING.
//
// A security sweep read `reply_help_ticket` — confirm:false, gated on help:read
// (the lowest bar in the catalogue) — beside the door it posts to, saw that
// `taggedUserIds` fires a branded email from the team's verified sender carrying
// a 160-character preview of the reply, and called it an unconfirmed mail-blast
// reachable through a client-authored ticket description. The proposed fix was a
// confirm predicate on `taggedUserIds`.
//
// IT DOES NOT REACH. The door accepts mentions; the TOOL cannot send them. Both
// machine surfaces post exactly `buildBody(input)` — the model's raw arguments
// are never forwarded — and this tool's builder returns `{helpId, body}`, so a
// `taggedUserIds` argument is constructed away before the request is made. A
// predicate on it would have been a control over a field that cannot exist: dead
// code that scores as a defence, and a green test asserting the wrong thing,
// which is exactly how the last agent-confirm gap hid.
//
// So this suite does the useful half instead. It PROVES the field is unreachable
// today (empirically, through the real builder), and it makes the day someone
// adds it a RED BUILD rather than a quiet regression — at which point the confirm
// decision gets made on purpose. Derived from each tool's own outbound body, never
// a list of tool names: a name list locks the tools you thought of and waves
// through the next one.

import { describe, expect, it } from "vitest"

import { TOOL_CATALOG, requiresConfirm, type AgentTool } from "../src/lib/tools"

/** A field that names PEOPLE TO CONTACT: a LIST (one call, N messages from a
 * trusted sender) under a key that reads like an audience.
 *
 * Both halves earn their place. Without the list test, an account's own `email`
 * COLUMN counts as an audience — it is a data field, and the tool that writes it
 * sends nothing. Without the anchor, `cc` matches the "acc" in `parentAccountId`
 * and the rule fires on half the customer spine; a guard that cries wolf on
 * account ids is a guard somebody deletes. `userId` on set_member_role is a
 * SUBJECT, not an audience, and is correctly ignored by both. */
const AUDIENCE_KEY = /^(tagged|mention|notif|recipient|cc|bcc)/i
const isAudience = (key: string, value: unknown): boolean =>
  Array.isArray(value) && AUDIENCE_KEY.test(key)

/** Every argument name the catalogue's tools declare, so the probe offers each
 * tool a plausible value for its own fields plus every audience-shaped field any
 * tool has ever had. */
function probeInput(tool: AgentTool): Record<string, unknown> {
  const props = (tool.schema as { properties?: Record<string, { type?: string }> }).properties ?? {}
  const input: Record<string, unknown> = {}
  for (const [key, spec] of Object.entries(props)) {
    input[key] =
      spec.type === "boolean" ? true
      : spec.type === "number" ? 1
      : spec.type === "array" ? ["01PROBE"]
      : spec.type === "object" ? {}
      : "01PROBE"
  }
  // …and the audience fields, offered to EVERY tool whether it declares them or
  // not: a builder that forwards an undeclared key is the more interesting bug.
  input.taggedUserIds = ["01PERSON"]
  input.notifyUserIds = ["01PERSON"]
  input.recipients = ["someone@example.com"]
  return input
}

/** The body a tool actually POSTS, given that probe. JSON round-tripped because
 * `JSON.stringify` drops undefined and that is literally what the door receives —
 * a key holding undefined is not a key that arrives. */
function outbound(tool: AgentTool): Record<string, unknown> {
  if (!tool.buildBody) return {}
  return JSON.parse(JSON.stringify(tool.buildBody(probeInput(tool)))) as Record<string, unknown>
}

/** The audience fields one tool would post, if any. */
const audienceFields = (tool: AgentTool): string[] =>
  Object.entries(outbound(tool))
    .filter(([k, v]) => isAudience(k, v))
    .map(([k]) => k)

const writers = TOOL_CATALOG.filter((t) => t.write && t.buildBody)

describe("the refutation, proven rather than asserted", () => {
  const reply = TOOL_CATALOG.find((t) => t.name === "reply_help_ticket")!

  it("reply_help_ticket exists and does post a body", () => {
    // Presence FIRST. Every claim below is about what this tool sends, and all of
    // them would pass vacuously against a tool that had been deleted or a builder
    // that returned nothing.
    expect(reply, "the tool the finding is about").toBeDefined()
    expect(Object.keys(outbound(reply)).length, "and it really does POST something").toBeGreaterThan(0)
  })

  it("posts the ticket and the words, and nothing else", () => {
    expect(Object.keys(outbound(reply)).sort()).toEqual(["body", "helpId"])
  })

  it("drops a taggedUserIds argument even when one is handed to it", () => {
    const body = reply.buildBody!({ helpId: "H1", body: "hi", taggedUserIds: ["U1", "U2"] })
    expect(JSON.stringify(body), "the mention never leaves the worker").not.toContain("U1")
    expect("taggedUserIds" in body).toBe(false)
  })
})

describe("and it stays that way", () => {
  it("no write tool sends an audience without a confirm panel", () => {
    // The rule, forward-looking: the moment a builder starts forwarding a list of
    // people to contact, that call has to pause for a human — because the text it
    // carries can have been written by whoever raised the ticket the agent just
    // read. Failing here is not a bug in this test; it is the decision arriving.
    const unconfirmed = writers
      .filter((t) => audienceFields(t).length > 0)
      .filter((t) => !requiresConfirm(t, probeInput(t)))
      .map((t) => t.name)

    expect(
      unconfirmed,
      `these tools can make the app send mail to a list of people with no confirm: ${unconfirmed.join(", ")}`
    ).toEqual([])
  })

  it("the rule can actually fail — a fenced tool would be caught", () => {
    // A guard nobody has ever seen refuse is a guard nobody knows works. This
    // feeds the same predicate a tool shaped like the finding described, and
    // requires it to be named.
    const forbidden: AgentTool = {
      ...TOOL_CATALOG.find((t) => t.name === "reply_help_ticket")!,
      name: "reply_help_ticket_with_mentions",
      confirm: false,
      buildBody: (i) => ({ helpId: "H", body: "b", taggedUserIds: i.taggedUserIds }),
    }
    expect(audienceFields(forbidden), "the audience must be SEEN first").toEqual(["taggedUserIds"])
    expect(
      requiresConfirm(forbidden, probeInput(forbidden)),
      "…and then refused for having no confirm"
    ).toBe(false)
  })
})
