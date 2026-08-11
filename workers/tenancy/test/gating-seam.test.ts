// R10 — the gating seam for TENANCY. The scan itself is shared
// (shared/rules/seam-scan.ts); what lives here is the only thing that is
// genuinely this worker's — the reviewed exceptions, each a conscious line.

import { join } from "node:path"

import { gatingSeam } from "@shared/rules/seam-scan"
import { ROUTES } from "../src/index"

/** The IDENTITY-gated writes: they can't ask "does your ROLE allow this?"
 * because the answer is about WHO you are, not what you may do. Each gates on
 * whoAmI and proves ownership itself. */
const IDENTITY_GATED: Record<string, string> = {
  "POST /api/tenancy/bootstrap":
    "teamless onboarding — the caller has no team yet, so there is no role to check",
  "POST /api/tenancy/switch-team":
    "flips the caller's OWN current-team pointer; membership is validated inside",
  "POST /api/tenancy/teams":
    "creates the caller's own team — they become its Admin, so no prior right exists",
  "POST /api/tenancy/invitations/accept":
    "acceptance is proved by the invite's email matching the signed-in account",
  "POST /api/tenancy/portal/switch-account":
    "flips the caller's OWN current-account pointer; the companies they may stand in come from the guard corridor, not the body",
}

gatingSeam({
  name: "tenancy",
  routes: ROUTES,
  src: join(__dirname, "..", "src"),
  minRoutes: 14,
  identityGated: IDENTITY_GATED,
})
