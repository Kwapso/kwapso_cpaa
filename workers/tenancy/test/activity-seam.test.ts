// EVERY MUTATION LEAVES A TRAIL — for TENANCY. R1's sibling one table over: R1
// asks whether a change reaches a SCREEN, this asks whether it reaches the
// team's HISTORY. The scan is shared (shared/rules/seam-scan.ts); what lives
// here is the only thing that is genuinely this worker's — the routes that
// deliberately write nothing, each with the reason it should not.
//
// Tenancy currently has NONE, and that is a real result rather than an empty
// stub: all 69 of its mutations reach `logActivity` or `writeActivity`, which is
// the strongest coverage of the three team-data workers and is why the customer
// spine can be traced end to end.

import { join } from "node:path"

import { activitySeam } from "@shared/rules/seam-scan"
import { ROUTES } from "../src/index"

/** Routes that change state and deliberately write no activity row, each with
 * its reason. Rot-checked both ways: a line naming a route that does not exist
 * fails, and so does a line whose route turns out to log after all. */
const SILENT: Record<string, string> = {}

activitySeam({
  name: "tenancy",
  routes: ROUTES,
  src: join(__dirname, "..", "src"),
  minRoutes: 14,
  silent: SILENT,
})
