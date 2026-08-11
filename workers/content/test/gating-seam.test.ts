// R10 — the gating seam for CONTENT. The scan itself is shared
// (shared/rules/seam-scan.ts); what lives here is the only thing that is
// genuinely this worker's — the reviewed exceptions.
//
// Content has NONE: every state-changing route gates on a `learning` or `help`
// right. That empty object is a statement, not an oversight — the day a content
// write needs an exception, it has to be written down here with a reason.

import { join } from "node:path"

import { gatingSeam } from "@shared/rules/seam-scan"
import { ROUTES } from "../src/index"

gatingSeam({
  name: "content",
  routes: ROUTES,
  src: join(__dirname, "..", "src"),
  minRoutes: 8,
  identityGated: {},
})
