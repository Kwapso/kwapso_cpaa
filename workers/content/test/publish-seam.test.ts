// R1 — the live-sync seam for CONTENT (CACHING.md "Every mutation publishes").
// The scan itself is shared (shared/rules/seam-scan.ts); what lives here is the
// only thing that is genuinely this worker's — the reviewed housekeeping set.
//
// R10 used to be checked HERE as well, in a second, weaker copy sitting beside
// the real one in gating-seam.test.ts. It is gone: one law, one check.

import { join } from "node:path"

import { publishSeam } from "../../../shared/rules/seam-scan"
import { ROUTES } from "../src/index"

/** The ONLY writes allowed to broadcast nothing. Changing this set is a
 * conscious, reviewed decision — that's the point: you can't dodge live-sync by
 * quietly flipping a mutation to "housekeeping". */
const HOUSEKEEPING = [
  // Stores an uploaded file in R2 but changes no record — there's no row to
  // patch, so nothing to broadcast (the create/edit that references the file
  // pings its own row).
  "POST /api/content/learning/upload",
]

publishSeam({
  name: "content",
  routes: ROUTES,
  src: join(__dirname, "..", "src"),
  minRoutes: 8,
  housekeeping: HOUSEKEEPING,
  // None today — every content mutation publishes directly in its route handler.
  indirectPublishers: [],
})
