// ONE place for the read/write size caps every worker shares (R14: no unbounded
// list endpoint). A cap is a hard ceiling with a comment at the query — beyond
// it, the screen must move to real server paging (LIMIT ? OFFSET ? + a total).
// WHY: one unbounded read stalls a worker at 100k rows; scale is a law, not a
// per-screen choice — the failure that earned it was a 24,000-row catalogue.

/** Hard cap on any collection list read (rows a screen loads in one go). */
export const LIST_HARD_CAP = 1000

/** Hard cap on a CSV export read — larger than a screen load (an export is a
 * deliberate download), still bounded so one request can't stream a whole shard. */
export const EXPORT_HARD_CAP = 10_000

/** Hard cap on a conversation/derived read (a ticket's replies, a chat thread's
 * messages, a per-member progress matrix). */
export const THREAD_HARD_CAP = 500

/** Max ids in one bulk write (the bulk doors + the agent's bulk tools declare
 * THIS constant in their schemas, so the number the model is told can never
 * drift from the number that physically fits). */
export const BULK_IDS_LIMIT = 500
