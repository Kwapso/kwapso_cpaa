// EVERY MUTATION LEAVES A TRAIL — for CONTENT. R1's sibling one table over: R1
// asks whether a change reaches a SCREEN, this asks whether it reaches the
// team's HISTORY. The scan is shared (shared/rules/seam-scan.ts); what lives
// here is the only thing that is genuinely this worker's — the routes that
// deliberately write nothing, each with the reason it should not.

import { join } from "node:path"

import { activitySeam } from "@shared/rules/seam-scan"
import { ROUTES } from "../src/index"

/** Routes that change state and deliberately write no activity row.
 *
 * All three are the same judgement said three times, and it is the judgement the
 * calendar sweep already wrote down in its own comment: THE ACTIVITY FEED IS A
 * RECORD OF WHAT PEOPLE DID TO RECORDS, and a row whose whole existence IS the
 * event does not need a second row saying it exists. Each of these creates a row
 * that carries its own full audit block (who, when) and is itself displayed as
 * history on the record it belongs to — so a line in the feed would be a
 * duplicate of something a person can already read, on the busiest write paths
 * in the app.
 *
 * Rot-checked both ways: a line naming a route that does not exist fails, and so
 * does a line whose route turns out to log after all — so this can only ever
 * describe what is really true, and it shrinks when one of them is instrumented.
 *
 * NOTE FOR WHOEVER REVISITS THIS. The judgement is defensible and it is not
 * obviously right — a reply is user-authored business content, and the SAME act
 * arriving from Gmail does log ("Reply sent", routes/google.ts). If the owner
 * wants ticket conversation in the trail, instrument `addReply` against the
 * TICKET (relatedTable "help"), not against `help_threads`, which no
 * ACTIVITY_GATE_MAP entry covers, and delete the first line below. */
const SILENT: Record<string, string> = {
  "POST /api/content/help/reply":
    "a reply IS a row in help_threads, carrying its own author snapshot and timestamp, and the ticket screen shows the whole conversation in order — so it is already history a person can read, and a feed line would say 'Ana replied' beside the reply itself. The ticket's own status moves, edits and archive all log.",
  "POST /api/content/work-logs":
    "a work log IS the record of the time; there is no other record it is a side effect of. It carries a full audit block and the Work screen lists it. Logging every clock-in would put the app's highest-frequency write on top of the cross-module feed and bury the edits that matter — and CORRECTING or binning one DOES log ('Work log edited', 'Work log binned'), which is the change somebody has to answer for later.",
  "POST /api/content/work-logs/stop":
    "stopping the timer finishes the same row the start created, and for the same reason as above it is the record rather than a change to one. R17 already means an already-stopped timer moves zero rows; the edit and the bin log.",
}

activitySeam({
  name: "content",
  routes: ROUTES,
  src: join(__dirname, "..", "src"),
  minRoutes: 8,
  silent: SILENT,
})
