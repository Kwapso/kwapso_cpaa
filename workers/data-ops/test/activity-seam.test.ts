// EVERY MUTATION LEAVES A TRAIL — for DATA-OPS. R1's sibling one table over: R1
// asks whether a change reaches a SCREEN, this asks whether it reaches the
// team's HISTORY. The scan is shared (shared/rules/seam-scan.ts); what lives
// here is the only thing that is genuinely this worker's — the routes that
// deliberately write nothing, each with the reason it should not.
//
// The import itself is NOT in this list and must not be: it writes act-as-user
// through each target's own gated create door, so every imported row leaves the
// same line the same create would have left by hand, plus its own "Data
// imported" row naming the batch.

import { join } from "node:path"

import { activitySeam } from "@shared/rules/seam-scan"
import { ROUTES } from "../src/index"

/** Routes that change state and deliberately write no activity row, each with
 * its reason. Rot-checked both ways. */
const SILENT: Record<string, string> = {
  "POST /api/data-ops/admin/grant-credits":
    "the owner topping up a team's AI allowance through the ADMIN_KEY door. It is not a change to any team RECORD, so it has no related_table to hang on and would appear in the cross-module feed as a sentence about nothing anybody can open. The grant is audited where it belongs — on the allowance row's own audit block, in the global core database, beside the balance it moved.",
}

activitySeam({
  name: "data-ops",
  routes: ROUTES,
  src: join(__dirname, "..", "src"),
  minRoutes: 8,
  silent: SILENT,
})
