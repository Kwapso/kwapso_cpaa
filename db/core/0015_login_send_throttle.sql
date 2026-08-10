-- 0015 — the login-code SEND throttle (security: the send door was capped per
-- ADDRESS only, so one anonymous caller could mail-bomb arbitrary addresses and
-- grow this table without bound). Two columns turn login_codes into its own
-- rate-limit ledger — no second table, no KV, no new moving part:
--
--   sent_ip  who asked for the most recent send of this code (CF-Connecting-IP,
--            or the single shared bucket 'unknown' when the edge header is
--            absent — a missing header must never mean "no limit").
--   sends    how many EMAILS this row has caused. A row is rotated in place past
--            the per-address hourly cap (see login-codes.ts), and a rotation
--            sends a fresh code WITHOUT adding a row — so counting rows would
--            miss it. The throttle counts SENDS, not rows.
--
-- Existing rows: sent_ip NULL (pre-throttle history — it shares no bucket with a
-- live caller), sends 1 (each old row caused exactly one email).

ALTER TABLE login_codes ADD COLUMN sent_ip TEXT;
ALTER TABLE login_codes ADD COLUMN sends INTEGER NOT NULL DEFAULT 1;

-- The two windows the throttle reads, both trailing-hour scans.
CREATE INDEX idx_login_codes_ip ON login_codes (sent_ip, created_at);
CREATE INDEX idx_login_codes_recent ON login_codes (created_at);
