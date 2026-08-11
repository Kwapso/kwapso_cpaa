// MCP — the personal access tokens behind the external machine surface.
//
// One of the five door lists behind `@/lib/api`. They are split by WORKER,
// because that is the boundary the doors already have: a path under
// `/api/mcp/…` is answered by the mcp worker and nothing else.
//
// THE WHOLE DIRECTORY IS THE ATTACK SURFACE the two gateway suites derive from —
// workers/gateway/test/agency-door.test.ts walks every file here to prove each
// door reaches a worker, and workers/portal-gateway/test/portal-door.test.ts
// walks the same files to prove none of them reaches the CLIENT door. They read
// the DIRECTORY, not one file, so a door added in a new domain file is covered
// the day it lands.

import type {
  McpTokenSummary,
} from "@shared/types"
import { api, post } from "@shared/web/api"

/** The MCP front desk (personal access tokens; the /mcp endpoint itself is for
 * machines with a Bearer token, not this session client). */
export const mcp = {
  tokens: () => api<{ tokens: McpTokenSummary[] }>("/api/mcp/tokens"),
  createToken: (label: string) =>
    api<{
      token: { id: string; label: string; teamId: string; createdAt: string; expiresAt: string }
      secret: string
    }>("/api/mcp/tokens", post({ label })),
  revokeToken: (id: string) => api<{ ok: true }>("/api/mcp/tokens/revoke", post({ id })),
}
