-- THE COLUMN THAT JOINS THE ROWS. `error_logs` already answered "what broke and
-- where"; it could not answer "what else was involved in the same click". Eight
-- components handle one request between them, so a crash in tenancy and the
-- auth timeout that caused it were two rows with nothing but a timestamp in
-- common — and timestamps do not distinguish two people clicking at once.
--
-- `request_id` is minted at whichever public door the request arrived at and
-- carried on every internal hop (shared/workers/trace.ts). One query on this
-- column returns every worker that touched one failing request.
--
-- NULLABLE, and no backfill: rows written before this migration genuinely have
-- no id, and inventing one would make them look joinable when they are not.
-- Nothing reads it as a key, so a NULL costs only the join it never had.
ALTER TABLE error_logs ADD COLUMN request_id TEXT;

-- The one access pattern: "show me everything from this request." Partial, so
-- the index carries only the rows that can actually be looked up this way — the
-- pre-migration NULLs are not worth a page.
CREATE INDEX idx_error_logs_request ON error_logs (request_id) WHERE request_id IS NOT NULL;
