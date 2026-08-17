// The MCP tool catalog — OPT-IN (an action is a tool ONLY if listed here), each one a
// thin FORWARD to an existing gated door with the bridged, team-pinned session cookie.
// No logic lives here: the real doors gate, validate, meter, audit and publish exactly
// as they do for a browser.
//
// The ~two dozen tenancy/content CRUD tools are DECLARED ONCE in the shared catalog
// (`shared/workers/tool-catalog.ts`) and shared with the in-app agent — this file
// PROJECTS each shared endpoint into an McpTool (`toMcpTool`: inputSchema = schema, the
// MCP's own name where it differs), then adds the MCP-ONLY tools below: whoami and the
// caller's own rights, the CSV exports, the import catalogue + the agentic-import batch
// tools, the app's own daily AI allowance, the saved conversations, and the
// agent_chat/agent_confirm bridge.
// catalog.test.ts machine-checks every forwarded path against the target workers' OWN
// route tables, and filter-parity.test.ts checks the other direction — every door that
// answers a person reaches a machine caller, or says in writing why it doesn't.

import { GuardError } from "@shared/workers/gating"
import { forwardToDoor } from "@shared/workers/http"
import { checkArgTypes, N, obj, S } from "@shared/workers/tool-args"
import { SHARED_TOOLS, type SharedTool } from "@shared/workers/tool-catalog"
import { TOOL_GATES } from "@shared/workers/tool-gates"
import type { Env } from "../env"

export type McpTool = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  binding: "AUTH" | "TENANCY" | "CONTENT" | "DATAOPS"
  method: "GET" | "POST"
  path: string
  buildBody?: (input: Record<string, unknown>) => Record<string, unknown>
  buildQuery?: (input: Record<string, unknown>) => string
}

/** Project a shared endpoint into an McpTool: the neutral wiring + the shared
 * description, under the MCP's own name (`mcpName`) where it historically differs. */
function toMcpTool(s: SharedTool): McpTool {
  const gate = TOOL_GATES[s.name]
  return {
    name: s.mcpName ?? s.name,
    // Restore the developer permission hint external MCP clients relied on ("… Needs
    // member_roles:create."); the door still enforces it regardless.
    description: gate ? `${s.summary} Needs ${gate}.` : s.summary,
    inputSchema: s.schema,
    binding: s.binding,
    method: s.method,
    path: s.path,
    buildBody: s.buildBody,
    buildQuery: s.buildQuery,
  }
}

/** Tools the MCP exposes but the agent does not: identity and rights, the CSV exports,
 * the scripted agentic-import batch flow, the AI allowance, the saved conversations, and
 * the assistant bridge (metered like any chat turn). The agent needs none of them — it
 * runs inside the app, where the screen already knows who the caller is, what they may
 * do, and what the allowance says. A machine client has no screen. */
const MCP_ONLY: McpTool[] = [
  {
    name: "whoami",
    description: "The token's owner + the team this token is pinned to.",
    inputSchema: obj({}),
    binding: "AUTH",
    method: "GET",
    path: "/api/auth/me",
  },
  {
    name: "my_permissions",
    description:
      "What this token may DO in its team: the caller's own access rights, module by module (read / create / edit / delete). whoami says who and where; this says what. Every door re-checks the same rights on every call, so this is how a client knows before it asks instead of learning from a 403.",
    inputSchema: obj({}),
    binding: "TENANCY",
    method: "GET",
    path: "/api/tenancy/my-permissions",
  },
  {
    name: "get_team",
    description:
      "The pinned team's own record — its name, when it was created and by whom. The read half of update_team.",
    inputSchema: obj({}),
    binding: "TENANCY",
    method: "GET",
    path: "/api/tenancy/team-meta",
  },
  {
    name: "list_learning_progress",
    description:
      "Every member's done state for the team's learning articles — the curator's view of who has finished what. (mark_learning_done sets it, for yourself only.) Needs learning:read.",
    inputSchema: obj({}),
    binding: "CONTENT",
    method: "GET",
    path: "/api/content/learning/progress",
  },
  // ---- exports (READ right; the same full-field CSVs the Export buttons serve) ----
  {
    name: "export_roles_csv",
    description: "Every member role as CSV — full fields incl. the flattened permission matrix.",
    inputSchema: obj({}),
    binding: "TENANCY",
    method: "GET",
    path: "/api/tenancy/roles/export",
  },
  {
    name: "export_learning_csv",
    description: "Every learning article as CSV (full fields + audit).",
    inputSchema: obj({}),
    binding: "CONTENT",
    method: "GET",
    path: "/api/content/learning/export",
  },
  {
    name: "export_dropdown_values_csv",
    description: "Every dropdown value as CSV (full fields + audit).",
    inputSchema: obj({}),
    binding: "TENANCY",
    method: "GET",
    path: "/api/tenancy/selectable/export",
  },
  // The agency's own housekeeping. Each is the READ half of an import target, so
  // a file exported here goes straight back in through the importer — which is
  // what makes the legacy migration reversible while it is still being checked.
  {
    name: "export_marketing_posts_csv",
    description:
      "Every marketing post the agency has published, as CSV (full fields + audit). Internal — these never appear in a client's portal.",
    inputSchema: obj({}),
    binding: "CONTENT",
    method: "GET",
    path: "/api/content/marketing/export",
  },
  {
    name: "export_brand_assets_csv",
    description: "The whole brand library as CSV (full fields + audit).",
    inputSchema: obj({}),
    binding: "CONTENT",
    method: "GET",
    path: "/api/content/brand-assets/export",
  },
  {
    name: "export_programmes_csv",
    description: "Every delivery programme as CSV (full fields + audit).",
    inputSchema: obj({}),
    binding: "CONTENT",
    method: "GET",
    path: "/api/content/delivery/programs/export",
  },
  {
    name: "export_meeting_purposes_csv",
    description: "Every meeting purpose as CSV, with its department (full fields + audit).",
    inputSchema: obj({}),
    binding: "CONTENT",
    method: "GET",
    path: "/api/content/delivery/purposes/export",
  },
  {
    name: "export_certificates_csv",
    description:
      "The team's credential register as CSV — who holds what, who issued it, when it lapses. Staff PROFILES have no export: a credential register is the kind of thing somebody hands an auditor, and a one-click spreadsheet of what the team is bad at is not.",
    inputSchema: obj({}),
    binding: "CONTENT",
    method: "GET",
    path: "/api/content/staff/certificates/export",
  },
  {
    name: "export_accounts_csv",
    description:
      "Every account you can see as CSV — companies and people, full fields + audit. The columns lead with the import format, so the file goes straight back in through the importer. Narrows by the SAME five filters as list_accounts: `q` (name, reference, email), `type` ('entity' or 'individual'), `status` (the team's own word, as stored), `archived` ('yes' or 'no'), `parentId`. THE FILE IS WHOLE OR IT IS AN ERROR — a collection bigger than one file comes back `export_too_large` rather than as a short CSV that looks complete; narrow it, or read list_accounts a page at a time.",
    inputSchema: obj({ q: S, type: S, status: S, archived: S, parentId: S }),
    binding: "TENANCY",
    method: "GET",
    path: "/api/tenancy/accounts/export",
    buildQuery: (i) => {
      const q: string[] = []
      for (const key of ["q", "type", "status", "archived", "parentId"])
        if (typeof i[key] === "string" && i[key]) q.push(`${key}=${encodeURIComponent(String(i[key]))}`)
      return q.length ? `?${q.join("&")}` : ""
    },
  },
  // ---- the agentic import (plan is METERED on the app's own daily AI allowance) ----
  {
    name: "list_import_targets",
    description:
      "What this team may import into: every active import target, with the table key you pass to get_import_sample. Read this before building a file — the catalogue is per-team, and an owner can switch a target off.",
    inputSchema: obj({}),
    binding: "DATAOPS",
    method: "GET",
    path: "/api/data-ops/import/targets",
  },
  {
    name: "get_import_sample",
    description:
      "A sample CSV for one import target (`tableKey` from list_import_targets): the column headers the importer expects, plus one example row. It is a template — no team data in it.",
    inputSchema: obj({ tableKey: S }, ["tableKey"]),
    binding: "DATAOPS",
    method: "GET",
    path: "/api/data-ops/import/sample",
    buildQuery: (i) => `?tableKey=${encodeURIComponent(String(i.tableKey ?? ""))}`,
  },
  {
    name: "start_import",
    description:
      "Start a file import: opens a batch. Add files with add_import_file, then plan_import, then run_import.",
    inputSchema: obj({}),
    binding: "DATAOPS",
    method: "POST",
    path: "/api/data-ops/import/batch",
    buildBody: () => ({}),
  },
  {
    name: "add_import_file",
    description: "Attach one CSV (text) to an import batch.",
    inputSchema: obj({ batchId: S, name: S, csv: S }, ["batchId", "csv"]),
    binding: "DATAOPS",
    method: "POST",
    path: "/api/data-ops/import/batch/file",
    buildBody: (i) => ({ batchId: i.batchId, name: i.name ?? "file.csv", csv: i.csv }),
  },
  {
    name: "plan_import",
    description:
      "Build the import plan (which table each file feeds, column mapping, dependency order, rows that will be skipped + why). Uses one AI request from the team's quota.",
    inputSchema: obj({ batchId: S }, ["batchId"]),
    binding: "DATAOPS",
    method: "POST",
    path: "/api/data-ops/import/batch/plan",
    buildBody: (i) => ({ batchId: i.batchId }),
  },
  {
    name: "run_import",
    description:
      "Run a PLANNED import in dependency order. Writes through the same gated doors the screens use (full audit trail); returns the per-row report.",
    inputSchema: obj({ batchId: S }, ["batchId"]),
    binding: "DATAOPS",
    method: "POST",
    path: "/api/data-ops/import/batch/confirm",
    buildBody: (i) => ({ batchId: i.batchId }),
  },
  {
    name: "list_imports",
    description: "The team's import history (who ran what, when, totals).",
    inputSchema: obj({}),
    binding: "DATAOPS",
    method: "GET",
    path: "/api/data-ops/import/batches",
  },
  {
    name: "get_import",
    description:
      "One import batch in full (by `id`): its files, the plan — which table each file feeds, the column mapping, the rows that will be skipped and why — and, once it has run, the per-row report. Re-READING a plan is free; re-PLANNING spends one request of the app's own daily AI allowance, so a client that lost a plan_import answer should come here first.",
    inputSchema: obj({ id: S }, ["id"]),
    binding: "DATAOPS",
    method: "GET",
    path: "/api/data-ops/import/batch",
    buildQuery: (i) => `?id=${encodeURIComponent(String(i.id ?? ""))}`,
  },
  // ---- the in-app assistant, over MCP (metered like any chat turn) ----
  {
    name: "get_ai_allowance",
    description:
      "How much of the app's own daily AI allowance this team has left (the free daily amount plus any credits an admin has added). agent_chat, agent_confirm and plan_import each draw on it; every other tool here is free. When it runs out those three answer 429 until it resets — this is how a client sees that coming instead of discovering it. Needs agent:read.",
    inputSchema: obj({}),
    binding: "DATAOPS",
    method: "GET",
    path: "/api/data-ops/agent/usage",
  },
  {
    name: "list_ai_usage",
    description:
      "Where the allowance went: the team's AI usage trail, newest first, one row per assistant turn. `limit` caps how many rows come back (default 50, most 200). Other members' prompts are redacted. Needs agent:read.",
    inputSchema: obj({ limit: N }),
    binding: "DATAOPS",
    method: "GET",
    path: "/api/data-ops/agent/usage-log",
    buildQuery: (i) => (Number.isFinite(Number(i.limit)) ? `?limit=${Number(i.limit)}` : ""),
  },
  {
    name: "list_agent_threads",
    description: "The caller's own saved assistant conversations (newest first). Needs agent:read.",
    inputSchema: obj({}),
    binding: "DATAOPS",
    method: "GET",
    path: "/api/data-ops/agent/threads",
  },
  {
    name: "get_agent_thread",
    description:
      "One saved conversation's messages, oldest first (by `id` from list_agent_threads) — what was asked, what the assistant answered, and which actions it took. Needs agent:read.",
    inputSchema: obj({ id: S }, ["id"]),
    binding: "DATAOPS",
    method: "GET",
    path: "/api/data-ops/agent/thread",
    buildQuery: (i) => `?id=${encodeURIComponent(String(i.id ?? ""))}`,
  },
  {
    name: "agent_chat",
    description:
      "Talk to the team's assistant — it can answer from live data or act (as the token's owner, capped by their permissions). If it proposes a guarded action, call agent_confirm with the returned threadId.",
    inputSchema: obj({ message: S, threadId: S }, ["message"]),
    binding: "DATAOPS",
    method: "POST",
    path: "/api/data-ops/agent/chat",
    buildBody: (i) => ({ message: i.message, ...(i.threadId ? { threadId: i.threadId } : {}) }),
  },
  {
    name: "agent_confirm",
    description: "Approve (or decline) the action(s) the assistant proposed on a thread.",
    inputSchema: obj({ threadId: S, approve: { type: "boolean" } }, ["threadId", "approve"]),
    binding: "DATAOPS",
    method: "POST",
    path: "/api/data-ops/agent/confirm",
    buildBody: (i) => ({ threadId: i.threadId, approve: i.approve === true }),
  },
]

/** The MCP's full catalog: every shared endpoint (projected) + the MCP-only tools. */
export const MCP_TOOLS: McpTool[] = [...SHARED_TOOLS.map(toMcpTool), ...MCP_ONLY]

export function getMcpTool(name: string): McpTool | undefined {
  return MCP_TOOLS.find((t) => t.name === name)
}

/** Cap what one tools/call returns (a 5 MB export would blow an MCP client). */
const MAX_RESULT_CHARS = 400_000

/** HOW LONG ONE DOOR MAY TAKE. A service binding is Cloudflare-bounded, so R11's
 * external-fetch law doesn't strictly bite here — but "not external" is not "never
 * hangs", and with no deadline at all a stuck door holds the MCP client's call open
 * with nothing to read and no reason to retry. So every forward carries one.
 *
 * Two tiers, because these tools do genuinely different amounts of work. A plain
 * door call is a read or a single gated write. The long tier is for the tools that
 * are SUPPOSED to take a while: running an import writes a whole file's rows one
 * gated write at a time, and the three assistant tools each wait on a model. Timing
 * those out at 30 seconds would break the thing working correctly. */
const DOOR_TIMEOUT_MS = 30_000
const LONG_DOOR_TIMEOUT_MS = 120_000
const LONG_RUNNING = new Set(["run_import", "plan_import", "agent_chat", "agent_confirm"])

/** Forward one tool call to its gated door with the bridged session cookie.
 *
 * A TRUNCATED ANSWER IS NOT AN ANSWER. The cap used to slice the body, append
 * "…(truncated)" and hand it back as `ok` — so a machine client received invalid
 * JSON (or half a CSV row) reported as a SUCCESSFUL call, and the only place the
 * damage showed up was wherever it tried to parse it. A client cannot re-ask a
 * question it was never told failed. So over the cap the call FAILS, and the
 * message says what to do instead: page, filter, or use the export door. */
export async function forwardTool(
  env: Env,
  tool: McpTool,
  input: Record<string, unknown>,
  cookie: string
): Promise<{ ok: boolean; text: string }> {
  // A wrong-typed argument is refused before any builder sees it: a JSON-RPC client
  // can send `{"name":{}}`, and coercing that would create a record actually called
  // "[object Object]" through a door doing exactly what it was told.
  const timeoutMs = LONG_RUNNING.has(tool.name) ? LONG_DOOR_TIMEOUT_MS : DOOR_TIMEOUT_MS
  let res: Response
  try {
    checkArgTypes(tool.inputSchema, input)
    res = await forwardToDoor(env[tool.binding], {
      path: tool.path,
      method: tool.method,
      cookie,
      query: tool.method === "GET" && tool.buildQuery ? tool.buildQuery(input) : "",
      body: tool.buildBody ? tool.buildBody(input) : {},
      timeoutMs,
    })
  } catch (e) {
    if (e instanceof GuardError)
      return { ok: false, text: JSON.stringify({ error: e.code, message: e.message }) }
    // An ABORT is the deadline above, and only that: it is reported as its own
    // thing because "it hung" and "it failed" call for different reactions from a
    // client. Anything else is a real crash and is re-thrown to the worker's
    // central catch, which records it — a timeout message in front of a genuine
    // fault would hide the fault (ERROR-HANDLING.md: never swallow).
    const aborted = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")
    if (!aborted) throw e
    return {
      ok: false,
      text: JSON.stringify({
        error: "door_timeout",
        message: `${tool.name} didn't answer within ${Math.round(timeoutMs / 1000)} seconds. A write may or may not have landed — read before retrying it.`,
      }),
    }
  }
  const raw = await res.text()
  if (raw.length > MAX_RESULT_CHARS)
    return {
      ok: false,
      text: JSON.stringify({
        error: "result_too_large",
        // "Use the export tool" is no advice at all when the tool IS the export —
        // that sentence sent a caller in a circle. An export answers with the
        // filters it declares, or with fewer rows.
        message: `${tool.name} answered with ${raw.length} characters; one call may return ${MAX_RESULT_CHARS}. ${
          tool.name.startsWith("export_")
            ? "Narrow the export with the filters it declares, or read the same rows through the paged list tool."
            : "Narrow it with a filter, take one page at a time, or pull the whole table through its export tool."
        }`,
        limit: MAX_RESULT_CHARS,
        size: raw.length,
      }),
    }
  return { ok: res.ok, text: raw }
}
