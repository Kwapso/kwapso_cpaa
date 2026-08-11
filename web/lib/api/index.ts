// The ONE place the web app talks to the workers. Same-origin /api calls —
// the gateway routes them — so cookies flow automatically, no config needed.
//
// The plumbing — one fetch wrapper, one error class, one paged shape, the two
// URL/POST one-liners — is shared with the client portal (shared/web/api.ts).
// Only the DOOR LISTS are this app's own, and they live one file per WORKER
// beside this one: a path under `/api/tenancy/…` is answered by the tenancy
// worker and nothing else, so that is the seam they split on.
//
// It was one 565-line file, and it grew by a block every time a module shipped.
// The split is not tidiness: BOTH gateway suites derive the app's whole attack
// surface from this code, and they used to read ONE file by name — so a door
// added in any new file beside it would have been invisible to the check that
// proves every door reaches a worker AND to the check that proves none of them
// reaches the client portal. They now walk this DIRECTORY.
//
// Callers are unchanged: `import { tenancy } from "@/lib/api"` still resolves
// here.

export { ApiFailure } from "@shared/web/api"
export type { PagedResponse } from "@shared/web/api"

export { auth } from "./auth"
export { tenancy } from "./tenancy"
export { content } from "./content"
export { dataOps, type UsageLogRow } from "./data-ops"
export { mcp } from "./mcp"
export type { AgentStreamEvent } from "./stream"
