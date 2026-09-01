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
import { B, checkArgTypes, N, obj, S, str } from "@shared/workers/tool-args"
import { RECORD_TOGGLES, recordToggle } from "@shared/workers/record-toggles"
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
  /** The other doors this ONE tool forwards to — mirrors AgentTool's own
   * `routes`/`route` (workers/data-ops/src/lib/tools.ts), the same pattern one
   * level further out. `path` above stays the canonical door for catalog.test.ts's
   * per-tool drift guard; `routes` is every door this tool can actually reach, and
   * record-toggles.test.ts proves each one by RUNNING `route`, not by reading the
   * list beside it. */
  routes?: string[]
  /** Which of them THIS call goes to. A tool without one forwards to `path`. */
  route?: (input: Record<string, unknown>) => { binding: "TENANCY" | "CONTENT"; path: string }
}

/** Project a shared endpoint into an McpTool: the neutral wiring + the shared
 * description, under the MCP's own name (`mcpName`) where it historically differs. */
function toMcpTool(s: SharedTool): McpTool {
  const gate = TOOL_GATES[s.name]
  // THE PAUSE TRAVELS AS WORDS. In the app, agent.confirm is a yes/no panel a
  // person clicks; on this surface there is no panel — the connecting client
  // owns the confirming UI, and its model reads nothing but this description.
  // So a tool the app would stop for SAYS SO, in the same breath as its gate
  // hint: an auto-approving client that ignores the sentence was going to
  // ignore a flag too, but a well-behaved one now has the signal it needs.
  // (No backticked names in the sentence on purpose — R27 reads those.)
  const pause = s.agent.confirm
    ? " Destructive or access-widening: confirm with a person before calling this."
    : ""
  return {
    name: s.mcpName ?? s.name,
    // Restore the developer permission hint external MCP clients relied on ("… Needs
    // member_roles:create."); the door still enforces it regardless.
    description: (gate ? `${s.summary} Needs ${gate}.` : s.summary) + pause,
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
      "The pinned team's own record, its name, when it was created and by whom. The read half of update_team.",
    inputSchema: obj({}),
    binding: "TENANCY",
    method: "GET",
    path: "/api/tenancy/team-meta",
  },
  // ---- exports (READ right; the same full-field CSVs the Export buttons serve) ----
  {
    name: "export_roles_csv",
    description: "Every member role as CSV, full fields incl. the flattened permission matrix.",
    inputSchema: obj({}),
    binding: "TENANCY",
    method: "GET",
    path: "/api/tenancy/roles/export",
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
    name: "export_brand_assets_csv",
    description: "The whole brand library as CSV (full fields + audit).",
    inputSchema: obj({}),
    binding: "CONTENT",
    method: "GET",
    path: "/api/content/brand-assets/export",
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
      "The team's credential register as CSV, who holds what, who issued it, when it lapses. Staff PROFILES have no export: a credential register is the kind of thing somebody hands an auditor, and a one-click spreadsheet of what the team is bad at is not.",
    inputSchema: obj({}),
    binding: "CONTENT",
    method: "GET",
    path: "/api/content/staff/certificates/export",
  },
  {
    name: "export_accounts_csv",
    description:
      "Every account you can see as CSV, companies and people, full fields + audit. The columns lead with the import format, so the file goes straight back in through the importer. Narrows by the SAME four filters as list_accounts: `q` (name, reference, email), `type` ('entity' or 'individual'), `archived` ('yes' or 'no'), `parentId`. Without the contacts right the file is the COMPANIES, the same way the list is. THE FILE IS WHOLE OR IT IS AN ERROR, a collection bigger than one file comes back `export_too_large` rather than as a short CSV that looks complete; narrow it, or read list_accounts a page at a time.",
    inputSchema: obj({ q: S, type: S, archived: S, parentId: S }),
    binding: "TENANCY",
    method: "GET",
    path: "/api/tenancy/accounts/export",
    buildQuery: (i) => {
      const q: string[] = []
      for (const key of ["q", "type", "archived", "parentId"])
        if (typeof i[key] === "string" && i[key]) q.push(`${key}=${encodeURIComponent(String(i[key]))}`)
      return q.length ? `?${q.join("&")}` : ""
    },
  },
  // ---- the agentic import (plan is METERED on the app's own daily AI allowance) ----
  {
    name: "list_import_targets",
    description:
      "What this team may import into: every active import target, with the table key you pass to get_import_sample. Read this before building a file, the catalogue is per-team, and an owner can switch a target off.",
    inputSchema: obj({}),
    binding: "DATAOPS",
    method: "GET",
    path: "/api/data-ops/import/targets",
  },
  {
    name: "get_import_sample",
    description:
      "A sample CSV for one import target (`tableKey` from list_import_targets): the column headers the importer expects, plus one example row. It is a template, no team data in it.",
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
      "One import batch in full (by `id`): its files, the plan, which table each file feeds, the column mapping, the rows that will be skipped and why, and, once it has run, the per-row report. Re-READING a plan is free; re-PLANNING spends one of the team's assistant credits, so a client that lost a plan_import answer should come here first.",
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
      "How many assistant credits this team has left (the free daily ones plus any an admin has added). agent_chat, agent_confirm and plan_import each draw on it; every other tool here is free. When it runs out those three answer 429 until it resets, this is how a client sees that coming instead of discovering it. Needs agent:read.",
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
      "One saved conversation's messages, oldest first (by `id` from list_agent_threads), what was asked, what the assistant answered, and which actions it took. Needs agent:read.",
    inputSchema: obj({ id: S }, ["id"]),
    binding: "DATAOPS",
    method: "GET",
    path: "/api/data-ops/agent/thread",
    buildQuery: (i) => `?id=${encodeURIComponent(String(i.id ?? ""))}`,
  },
  {
    name: "agent_chat",
    description:
      "Talk to the team's assistant, it can answer from live data or act (as the token's owner, capped by their permissions). If it proposes a guarded action, call agent_confirm with the returned threadId. `sources` narrows which doors the assistant may read the KNOWLEDGE BASE through for this whole conversation — a list of any of: meetings, mail, drive, chat, records, articles. It is ENFORCED rather than suggested: the named set is put onto every retrieval the assistant makes on this turn, so a door left out cannot be read from however the assistant phrases its own call. Leave it off and it reads all of them, which is the normal case.",
    inputSchema: obj({ message: S, threadId: S, sources: { type: "array" } }, ["message"]),
    binding: "DATAOPS",
    method: "POST",
    path: "/api/data-ops/agent/chat",
    buildBody: (i) => ({
      message: i.message,
      ...(i.threadId ? { threadId: i.threadId } : {}),
      ...(Array.isArray(i.sources) && i.sources.length ? { sources: i.sources } : {}),
    }),
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
/** SWITCHING A RECORD OFF, OR BACK ON — twenty-one tools, generated from the
 * ONE map (`RECORD_TOGGLES`) that also feeds the agent's single
 * `set_record_active`.
 *
 * WHY THE TWO SURFACES DIFFER HERE, deliberately and for the first time. The
 * agent re-sends its whole catalogue on every model step, so twenty-one names
 * for one operation was about 2,500 tokens per step of pure repetition. An MCP
 * client fetches `tools/list` ONCE and then calls by name — it pays nothing per
 * step, and a tool name on that surface is an external contract somebody has
 * scripts against (`set_dropdown_value_active` is pinned by catalog.test.ts for
 * exactly that reason). So the collapse happens where it saves money and does
 * not happen where it would only break things.
 *
 * The names are `set_<record>_active`, which reproduces every historical name on
 * this surface EXACTLY — the dropdown one included, because the record is
 * `dropdown_value` and the published name was always
 * `set_dropdown_value_active`. Nothing was renamed to make this fit.
 *
 * One declaration, two projections: the same relationship the shared catalogue
 * already has with its two surfaces, one level of shape further apart. */
const RECORD_TOGGLE_TOOLS: McpTool[] = Object.entries(RECORD_TOGGLES).map(([record, e]) => {
  const name = `set_${record}_active`
  const gate = TOOL_GATES[name]
  return {
    name,
    // The same two additions `toMcpTool` makes to a shared tool: the developer
    // permission hint, and the sentence that stands in for the panel this
    // surface has no way to show.
    description:
      (gate ? `${e.summary} Needs ${gate}.` : e.summary) +
      (e.confirm === "never"
        ? ""
        : " Destructive or access-widening: confirm with a person before calling this."),
    inputSchema: obj(
      e.needsAppId
        ? { [e.idField]: S, appId: S, active: B }
        : { [e.idField]: S, active: B },
      e.needsAppId ? [e.idField, "appId", "active"] : [e.idField, "active"]
    ),
    binding: e.binding,
    method: "POST",
    path: e.path,
    buildBody: (i: Record<string, unknown>) => ({
      [e.idField]: str(i, e.idField),
      active: i.active === true,
      ...(e.needsAppId ? { appId: str(i, "appId") } : {}),
    }),
  }
})

/** THE GENERIC FORM, BESIDE THE TWENTY-ONE NAMED ONES — not instead of them.
 * R43 (workers/mcp/test/agent-mcp-tool-parity.test.ts) makes MCP a STRICT
 * SUPERSET of the agent's own catalog: every capability the agent has, MCP has
 * too, under some name. The agent's `set_record_active` (one tool, twenty-one
 * doors, `route`-resolved) had no MCP counterpart at all — not because the
 * capability was missing (all twenty-one doors are individually here), but
 * because nothing published the GENERIC shape. Publishing it costs nothing on
 * this surface (no per-step re-send) and gives an outside integration the same
 * "one call, any record kind" shape the agent has, which it may reasonably
 * want even though the twenty-one named calls remain the primary, pinned
 * contract. Same map, same router, same body-builder as the agent's own —
 * declared once in `@shared/workers/record-toggles`, projected twice. */
const RECORD_ACTIVE_GENERIC: McpTool = {
  name: "set_record_active",
  description:
    "Switch a record off, or back on, across any of the twenty-one record kinds this surface also " +
    "publishes as named tools (set_account_active, set_role_active, …) — this is the same operation, " +
    "generic. `record` says WHICH KIND: account, contact_link, portal_access, role, dropdown_value, " +
    "app, app_module, process, wave, client_department, client_role, client_tool, account_rate, " +
    "internal_rate, meeting, knowledge_source, deliverable, brand_asset, meeting_purpose, staff_profile " +
    "or staff_certificate. `id` is that record's id — except a role, which takes `roleId` — and a " +
    "deliverable also needs `appId`. `active` false switches it off (archive, deactivate, revoke, " +
    "cancel, unlink, depending on the kind) and true brings it back. NOTHING IS EVER DELETED, and " +
    "calling it twice changes nothing the second time. Each kind needs its own module's right — see " +
    "the matching set_<kind>_active tool's description for its exact gate. Destructive or " +
    "access-widening for SOME record kinds, never for others: confirm with a person before calling " +
    "this unless you already know the kind you are calling it for is one of the ones that runs straight " +
    "through.",
  inputSchema: obj({ record: S, id: S, roleId: S, active: B, appId: S }, ["record", "active"]),
  binding: "TENANCY",
  method: "POST",
  path: "/api/tenancy/accounts/active",
  routes: Object.values(RECORD_TOGGLES).map((e) => e.path),
  route: (i) => {
    const entry = recordToggle(str(i, "record"))
    return entry
      ? { binding: entry.binding, path: entry.path }
      : { binding: "TENANCY" as const, path: "/api/tenancy/accounts/active" }
  },
  buildBody: (i) => {
    const entry = recordToggle(str(i, "record"))
    const id = str(i, entry?.idField ?? "id") || str(i, "id") || str(i, "roleId")
    return {
      [entry?.idField ?? "id"]: id,
      active: i.active === true,
      ...(entry?.needsAppId ? { appId: str(i, "appId") } : {}),
    }
  },
}

export const MCP_TOOLS: McpTool[] = [
  ...SHARED_TOOLS.map(toMcpTool),
  ...RECORD_TOGGLE_TOOLS,
  RECORD_ACTIVE_GENERIC,
  ...MCP_ONLY,
]

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
  cookie: string,
  traceId: string
): Promise<{ ok: boolean; text: string }> {
  // A wrong-typed argument is refused before any builder sees it: a JSON-RPC client
  // can send `{"name":{}}`, and coercing that would create a record actually called
  // "[object Object]" through a door doing exactly what it was told.
  const timeoutMs = LONG_RUNNING.has(tool.name) ? LONG_DOOR_TIMEOUT_MS : DOOR_TIMEOUT_MS
  // A tool with `route` (today, only set_record_active) picks its real door PER
  // CALL from the input, the same way the agent's own executor does — `path`/
  // `binding` above stay the canonical fallback for the drift guard and for
  // every ordinary tool, which never sets `route` and takes this branch for free.
  const dest = tool.route ? tool.route(input) : { binding: tool.binding, path: tool.path }
  let res: Response
  try {
    checkArgTypes(tool.inputSchema, input)
    res = await forwardToDoor(env[dest.binding], {
      path: dest.path,
      method: tool.method,
      cookie,
      traceId,
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
        message: `${tool.name} didn't answer within ${Math.round(timeoutMs / 1000)} seconds. A write may or may not have landed. Read before retrying it.`,
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
