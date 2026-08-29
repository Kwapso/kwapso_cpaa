// R43 — AGENT/MCP TOOL-SET PARITY: a tool that exists on one machine surface
// exists on the other too, or the gap is a named, reasoned line — never silence.
//
// R19/R22's coverage census (filter-parity.test.ts) asks whether a DOOR has a
// tool on SOME machine surface — the agent's own catalog, MCP's own, or the
// shared one both project from. That "some" is deliberate for R19/R22's own
// purpose (a door reachable from either surface is not a gap the OWNER asked
// about), but it has a blind spot of its own: a door with an AGENT tool and no
// MCP tool passes that census trivially, and the asymmetry between the two
// machine surfaces — which is exactly the sentence the owner asked to be made
// checkable ("same thing an agent can do, same thing from MCP") — is never
// itself examined. Twenty-five tools live on the agent and nowhere on MCP;
// twenty-three live on MCP and nowhere on the agent. Every one of them turned
// out to be a real, written decision (MCP.md §3's "intentionally NOT on the
// machine surface" list, and the mirror sentence in
// workers/mcp/src/lib/tools.ts's own MCP_ONLY comment) — but nothing before
// this file MACHINE-CHECKED that the decision was written down, or that it was
// still true. The comment introducing data-ops's own AGENT_ONLY array undercounts
// itself today: it names four tools and was never updated when the 21 Google
// tools joined it, which is the drift this test exists to catch happening again.
//
// Nothing here is hand-listed beyond the two reason tables: tool names come
// from TOOL_CATALOG and MCP_TOOLS themselves, exactly as filter-parity.test.ts
// reads doors off the route tables rather than prose.

import { describe, expect, it } from "vitest"

import { SHARED_TOOLS } from "@shared/workers/tool-catalog"
import { TOOL_CATALOG } from "../../data-ops/src/lib/tools"
import { MCP_TOOLS } from "../src/lib/tools"

const AGENT_TOOL_NAMES = new Set(TOOL_CATALOG.map((t) => t.name))
const MCP_TOOL_NAMES = new Set(MCP_TOOLS.map((t) => t.name))

// A handful of SHARED_TOOLS carry a DIFFERENT name on each surface
// (`invite_member` on the agent is `create_invite` on MCP, and three more) —
// deliberately, catalog.test.ts locks the four renames both ways. Naively
// diffing the two name sets would count each of those FOUR shared tools as
// asymmetric TWICE (once as "agent-only" under its agent name, once as
// "mcp-only" under its MCP name), which is not a gap, it is one capability
// wearing two labels. So every name is first resolved to its SHARED_TOOLS
// canonical (`s.name`) before either delta is computed — exactly the identity
// catalog.test.ts's rename-lock already treats as one tool.
const MCP_NAME_TO_CANONICAL = new Map(
  SHARED_TOOLS.filter((s) => s.mcpName).map((s) => [s.mcpName as string, s.name])
)
const canonical = (mcpName: string) => MCP_NAME_TO_CANONICAL.get(mcpName) ?? mcpName
const canonicalMcpNames = new Set([...MCP_TOOL_NAMES].map(canonical))

// Every SHARED_TOOLS entry projects into BOTH catalogs by construction
// (toAgentTool keeps `s.name`; toMcpTool keeps `s.mcpName ?? s.name`) — so a
// shared tool never appears in either delta below unless the projection
// itself breaks, which catalog.test.ts's rename-lock already guards. What
// lands here is only what was declared on ONE surface and never the other:
// AGENT_ONLY in workers/data-ops/src/lib/tools.ts, MCP_ONLY in
// workers/mcp/src/lib/tools.ts.
const agentOnly = [...AGENT_TOOL_NAMES].filter((n) => !canonicalMcpNames.has(n))
const mcpOnly = [...MCP_TOOL_NAMES].filter((n) => !AGENT_TOOL_NAMES.has(canonical(n)))

/** Agent tools with no MCP counterpart, each a real line from MCP.md §3
 * ("intentionally NOT on the machine surface, reasoned exclusions, not
 * gaps") or the SELF-runner's own comment. A RATCHET, like every other
 * deny-list in the base: a name MCP now also exposes is a stale exemption and
 * turns the build red. */
const AGENT_ONLY_TOOLS: Record<string, string> = {
  get_role_permissions:
    "a surface ASYMMETRY, not a gap (MCP.md §3 item 4): the in-app assistant reads one role's matrix by id because a person is looking at that one role's edit screen; MCP asks the same underlying question a different way, the flattened matrix across every role and module, through export_roles_csv. One question, one way to ask it per surface — a second tool here would be two answers to one question. DELETE THIS LINE only if MCP grows its own by-role-id read alongside export_roles_csv — until then, one question, one way to ask it, is the whole reason.",
  set_help_status_by_filter:
    "the SET-shaped bulk mutation (MCP.md §3 item 1): built around the app's yes/no confirm panel, where a person approves the TRUE match count from a dry run before a filter-matched write touches every ticket it matches. A headless MCP client has no such panel, so exposing this would be a blind mass-write with no person ever having seen the count. A machine client composes the single-record write (set_help_status) instead, which IS on this surface. DELETE THIS LINE only if MCP grows a real held-for-approval mechanism (not just a description sentence) — until then a filter-matched bulk write with nobody watching the count is the exact shape this law exists to keep off this surface.",
  bulk_set_help_status:
    "the ID-list bulk mutation, same reasoning as set_help_status_by_filter one line up (MCP.md §3 item 1): the app's confirm panel is the control on a high-blast write, and MCP has no panel of its own to put in front of it. set_help_status (one ticket at a time) is the machine-shaped equivalent and is fully on this surface. DELETE THIS LINE under the same condition as set_help_status_by_filter — a real MCP confirm mechanism, not a description sentence.",
  run_import_batch:
    "runs a file the person ATTACHED IN THE CHAT UI (binding SELF, no route — it executes inside data-ops rather than forwarding to a door). A headless MCP client has no chat turn to attach a file to, so it is given the machine-shaped equivalent instead: start_import -> add_import_file -> plan_import -> run_import, which is MCP_ONLY below for the mirror reason. Same capability, the shape each surface can actually receive a file through. DELETE THIS LINE (and its MCP_ONLY mirror) only if the two import paths are ever unified into one runner both surfaces call the same way — until then the split is the shape each surface can actually receive a file through, not an oversight.",
}

/** The reason all twenty-one Google tools share (MCP.md §3, "Google is almost
 * entirely off this surface, and that is on purpose"): the whole browse/change
 * Drive-Gmail-Chat-Calendar surface is agent-only, because a personal access
 * token is a secret that ends up pasted into somebody's CI config, and the
 * blast radius of a leaked one must not include a mailbox. agent_chat reaches
 * every one of these tools under the caller's own rights, with the same
 * confirm rules (mail always asks), for a client that genuinely needs Google
 * material through a machine — it spends the team's AI allowance to do it,
 * which is itself part of the fence: an unattended script cannot run this
 * unbounded the way a bearer-token call could. */
const GOOGLE_MCP_EXCLUSION =
  "one of the 21 Google tools MCP.md §3 excludes as a class: the browse/change surface over Drive, Gmail, Chat and Calendar is agent-only because a leaked personal access token's blast radius must not include a mailbox. Reach it through agent_chat instead, under the same rights and confirm rules, metered on the team's AI allowance. DELETE THIS LINE (for all 21) only if the owner reverses the leaked-token-must-not-reach-a-mailbox ruling in MCP.md §3 — this is a stated security posture, not a backlog item."
for (const name of [
  "list_google_connections",
  "google_drive_files",
  "google_drive_file",
  "google_drive_upload",
  "google_mail_search",
  "google_mail_message",
  "google_draft_reply",
  "google_send_mail",
  "google_calendar_events",
  "google_chat_messages",
  "google_chat_post",
  "google_drive_update",
  "google_drive_folder",
  "google_mail_to_drive",
  "google_drive_trash",
  "google_reply_mail",
  "google_label_mail",
  "google_mail_trash",
  "google_meeting_transcript",
  "google_chat_spaces",
  "google_chat_delete",
])
  AGENT_ONLY_TOOLS[name] = GOOGLE_MCP_EXCLUSION

/** MCP tools with no agent counterpart, each grounded in the MCP_ONLY comment
 * in workers/mcp/src/lib/tools.ts: "The agent needs none of them — it runs
 * inside the app, where the screen already knows who the caller is, what they
 * may do, and what the allowance says. A machine client has no screen." */
const IDENTITY_REASON =
  "identity/rights bootstrapping a browser session already has from the signed-in cookie (who am I, what may I do, what team am I pinned to). The in-app agent runs inside that same session and never needs to ask the app what the app already told it. DELETE THIS LINE (for all three) only if the agent is ever asked to introspect its own session identity mid-conversation rather than reading it from the app around it — no such need exists today."
const EXPORT_REASON =
  "the screen's Export-button shape, a whole-file CSV a person downloads and hands to someone else or re-imports elsewhere. The agent already has the underlying records through its own list_*/get_* tools and has no spreadsheet to hand anyone — a chat turn answers questions about data, it does not produce a download. DELETE THIS LINE (for all six) only if the agent grows a real reason to produce a downloadable file rather than answer a question — a chat turn has no file output today."
const IMPORT_BATCH_REASON =
  "the machine-shaped twin of run_import_batch (agent-only, above): a headless MCP client has no chat turn to attach a file to, so it opens a batch, adds files, plans and runs it as four explicit steps instead of one attachment. The agent's run_import_batch covers the same capability for a file dropped in the chat UI, which is the shape it actually receives a file in. DELETE THIS LINE (for all eight) under the same condition as run_import_batch's own line above — only if the two import paths are unified into one runner both surfaces call the same way."
const ASSISTANT_BRIDGE_REASON =
  "drives the in-app assistant from OUTSIDE the app (checking its own AI allowance mid-conversation, listing its own saved threads, or calling itself) is not a question the assistant asks about itself while it is already the thing answering. These exist so a headless MCP client — which has no chat window of its own — can start, read and approve a conversation with the assistant the way the app's chat panel does. DELETE THIS LINE (for all six) only if the in-app agent is ever asked to drive another chat turn of itself from inside one — a shape that does not exist today and should stay a deliberate absence, not a gap."
const MCP_ONLY_TOOLS: Record<string, string> = {
  whoami: IDENTITY_REASON,
  my_permissions: IDENTITY_REASON,
  get_team: IDENTITY_REASON,
  export_roles_csv: EXPORT_REASON,
  export_dropdown_values_csv: EXPORT_REASON,
  export_brand_assets_csv: EXPORT_REASON,
  export_meeting_purposes_csv: EXPORT_REASON,
  export_certificates_csv: EXPORT_REASON,
  export_accounts_csv: EXPORT_REASON,
  list_import_targets: IMPORT_BATCH_REASON,
  get_import_sample: IMPORT_BATCH_REASON,
  start_import: IMPORT_BATCH_REASON,
  add_import_file: IMPORT_BATCH_REASON,
  plan_import: IMPORT_BATCH_REASON,
  run_import: IMPORT_BATCH_REASON,
  list_imports: IMPORT_BATCH_REASON,
  get_import: IMPORT_BATCH_REASON,
  get_ai_allowance: ASSISTANT_BRIDGE_REASON,
  list_ai_usage: ASSISTANT_BRIDGE_REASON,
  list_agent_threads: ASSISTANT_BRIDGE_REASON,
  get_agent_thread: ASSISTANT_BRIDGE_REASON,
  agent_chat: ASSISTANT_BRIDGE_REASON,
  agent_confirm: ASSISTANT_BRIDGE_REASON,
}

describe("R43 — agent/mcp tool-set parity: a name on one surface is on both, or is a written decision", () => {
  it("finds tools on both surfaces, and an asymmetry on both sides (the census must not go blind)", () => {
    expect(TOOL_CATALOG.length).toBeGreaterThanOrEqual(150)
    expect(MCP_TOOLS.length).toBeGreaterThanOrEqual(150)
    expect(agentOnly.length, "no agent-only tools found — the delta computation itself is broken").toBeGreaterThan(0)
    expect(mcpOnly.length, "no mcp-only tools found — the delta computation itself is broken").toBeGreaterThan(0)
  })

  it("every agent-only tool is a named, reasoned line — no silent asymmetry", () => {
    const undocumented = agentOnly.filter((n) => !(n in AGENT_ONLY_TOOLS))
    expect(
      undocumented,
      `these tools exist on the agent and nowhere on MCP, with no reason on file — add a line to ` +
        `AGENT_ONLY_TOOLS in this file (and to MCP.md §3), or wire the missing MCP tool:\n  ${undocumented.join("\n  ")}`
    ).toEqual([])
  })

  it("every mcp-only tool is a named, reasoned line — no silent asymmetry", () => {
    const undocumented = mcpOnly.filter((n) => !(n in MCP_ONLY_TOOLS))
    expect(
      undocumented,
      `these tools exist on MCP and nowhere on the agent, with no reason on file — add a line to ` +
        `MCP_ONLY_TOOLS in this file, or wire the missing agent tool:\n  ${undocumented.join("\n  ")}`
    ).toEqual([])
  })

  it("every reasoned line still names a real, still-one-sided tool (the ratchet)", () => {
    for (const [name, why] of Object.entries(AGENT_ONLY_TOOLS)) {
      expect(AGENT_TOOL_NAMES.has(name), `${name} is named in AGENT_ONLY_TOOLS but is no longer an agent tool at all — delete the line`).toBe(true)
      expect(MCP_TOOL_NAMES.has(name), `${name} is excused in AGENT_ONLY_TOOLS but MCP now also exposes it — delete the line, the surfaces agree`).toBe(false)
      expect(why.length, `${name} needs a reason someone can disagree with`).toBeGreaterThan(40)
    }
    for (const [name, why] of Object.entries(MCP_ONLY_TOOLS)) {
      expect(MCP_TOOL_NAMES.has(name), `${name} is named in MCP_ONLY_TOOLS but is no longer an MCP tool at all — delete the line`).toBe(true)
      expect(AGENT_TOOL_NAMES.has(name), `${name} is excused in MCP_ONLY_TOOLS but the agent now also exposes it — delete the line, the surfaces agree`).toBe(false)
      expect(why.length, `${name} needs a reason someone can disagree with`).toBeGreaterThan(40)
    }
  })

  // Every SHARED_TOOLS name earns its parity for free by construction, so the
  // two deltas above should equal EXACTLY the hand-authored AGENT_ONLY / MCP_ONLY
  // arrays in the two tools.ts files — never more (an undocumented drift) and
  // never fewer (a stale exemption the ratchet test above would already catch,
  // named again here as a direct count so the two numbers this file's own
  // header prose states cannot go stale the way the AGENT_ONLY comment did).
  it("the agent-only count matches the reasoned table exactly (25, 26 Aug 2026)", () => {
    expect(agentOnly.length).toBe(Object.keys(AGENT_ONLY_TOOLS).length)
  })
  it("the mcp-only count matches the reasoned table exactly (23, 26 Aug 2026)", () => {
    expect(mcpOnly.length).toBe(Object.keys(MCP_ONLY_TOOLS).length)
  })
})
