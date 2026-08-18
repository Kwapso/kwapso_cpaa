// R1 — the live-sync seam for DATA-OPS (CACHING.md "Every mutation publishes").
// The scan itself is shared (shared/rules/seam-scan.ts); what lives here is the
// only thing that is genuinely this worker's — the reviewed housekeeping set.
//
// R10 used to be checked HERE as well, in a second, weaker copy sitting beside
// the real one in gating-seam.test.ts. It is gone: one law, one check.

import { join } from "node:path"

import { publishSeam } from "@shared/rules/seam-scan"
import { ROUTES } from "../src/index"

/** The ONLY writes allowed to broadcast nothing — a conscious, reviewed
 * decision. Here the import batch steps and the owner catalog seed are
 * housekeeping (the caller's own batch / global owner data, no team broadcast);
 * only the confirm WRITE creates shared rows, so only it publishes. */
const HOUSEKEEPING = [
  "POST /api/data-ops/admin/seed-targets",
  // The batch draft/file/plan steps only shape the caller's OWN batch (returned
  // in the same response) — no other screen needs a ping. Only /batch/confirm
  // writes shared rows, so only it publishes (it's classified "mutation").
  "POST /api/data-ops/import/batch",
  "POST /api/data-ops/import/batch/file",
  "POST /api/data-ops/import/batch/plan",
  // The agent's chat/confirm write only the caller's own private conversation;
  // any team-visible effect is published by the gated endpoint the executor calls.
  "POST /api/data-ops/agent/chat",
  "POST /api/data-ops/agent/confirm",
  // TRANSLATING A TICKET writes through content's OWN gated update door,
  // act-as-user — and that door publishes the ticket's row change on the way
  // through, which is the whole point of writing act-as-user rather than
  // reaching into the table. A second ping from here would be the same row said
  // twice; a first one from here would mean this worker had found a way into a
  // ticket that a person's edit does not use.
  "POST /api/data-ops/agent/translate-ticket",
  // TRANSLATING A SCREEN'S HUMAN-TYPED TEXT for the reader who asked writes
  // nothing at all — no row, no column, not even a cache. The words go back in
  // the same response to the one person who pressed the button, and the record
  // still says exactly what its author typed. There is no changed row to
  // broadcast, which is the difference between this door and the one above it.
  "POST /api/data-ops/agent/translate",
  // Resolving an error-log row is private maintainer bookkeeping in the core DB
  // (owner-only, x-admin-key) — no team screen shows it, so nothing to broadcast.
  "POST /api/data-ops/admin/errors/resolve",
]

publishSeam({
  name: "data-ops",
  routes: ROUTES,
  src: join(__dirname, "..", "src"),
  minRoutes: 8,
  housekeeping: HOUSEKEEPING,
  indirectPublishers: [],
})
