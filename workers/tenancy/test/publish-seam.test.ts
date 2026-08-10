// R1 — the live-sync seam for TENANCY (CACHING.md "Every mutation publishes").
// The scan itself is shared (shared/rules/seam-scan.ts); what lives here is the
// only thing that is genuinely this worker's — the reviewed housekeeping set and
// the lib functions a handler may publish THROUGH.
//
// R10 used to be checked HERE as well, in a second, weaker copy sitting beside
// the real one in gating-seam.test.ts (it listed the same five identity-gated
// routes, without their reasons). It is gone: one law, one check.

import { join } from "node:path"

import { publishSeam } from "../../../shared/rules/seam-scan"
import { ROUTES } from "../src/index"

/** The ONLY writes allowed to broadcast nothing. Changing this set is a
 * conscious, reviewed decision — that's the point: you can't dodge live-sync by
 * quietly flipping a mutation to "housekeeping". */
const HOUSEKEEPING = [
  "POST /api/tenancy/switch-team", // flips the caller's own current-team pointer
  "POST /api/tenancy/admin/migrate-teams", // ops: roll team-schema migrations
  "POST /api/tenancy/admin/move-module", // ops: relocate a module's DB
  "POST /api/tenancy/portal/switch-account", // flips the caller's own current-account pointer
  "POST /api/tenancy/admin/create-team", // ops: seed a team where the user door is closed
]

/** A handler may publish indirectly through one of these; the shared scan
 * asserts each publishes itself, so the chain is real, not assumed. */
const INDIRECT_PUBLISHERS = ["createTeam", "acceptPendingInvites", "acceptInvite"]

publishSeam({
  name: "tenancy",
  routes: ROUTES,
  src: join(__dirname, "..", "src"),
  minRoutes: 14,
  housekeeping: HOUSEKEEPING,
  indirectPublishers: INDIRECT_PUBLISHERS,
})
