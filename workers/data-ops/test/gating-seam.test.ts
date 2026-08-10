// R10 — the gating seam for DATA-OPS. The scan itself is shared
// (shared/rules/seam-scan.ts); what lives here is the only thing that is
// genuinely this worker's — the reviewed exceptions.
//
// Data-ops has NONE: the import steps gate on an import right (confirm gates
// `create` on every destination module), the assistant gates on `agent:create`,
// and the owner endpoints (grant-credits, seed-targets, errors/resolve) gate on
// adminGuard. That empty object is a statement, not an oversight.

import { join } from "node:path"

import { gatingSeam } from "../../../shared/rules/seam-scan"
import { ROUTES } from "../src/index"

gatingSeam({
  name: "data-ops",
  routes: ROUTES,
  src: join(__dirname, "..", "src"),
  minRoutes: 8,
  identityGated: {},
})
