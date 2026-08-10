-- 0016 — access tokens get a LIFE (security: they never expired, so a secret
-- copied into a CI config in 2026 was still a live key to that person's team
-- years later — and nothing capped how many one account could mint).
--
-- expires_at is the token's own deadline (MCP_TOKEN_TTL_DAYS in
-- shared/workers/limits.ts — 90 days), checked on EVERY /mcp request beside the
-- revoked_at check. Existing tokens are NOT killed by the deploy: each live one
-- is given a full term from now, so integrations keep working and their owners
-- have the whole window to re-issue.
--
-- The column is NULLABLE only because SQLite cannot add a NOT NULL column
-- without a default; the code treats a MISSING expiry as EXPIRED (fail closed),
-- so a row that somehow arrives without one is refused, never immortal.

ALTER TABLE mcp_tokens ADD COLUMN expires_at TEXT;

UPDATE mcp_tokens
   SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+90 days')
 WHERE expires_at IS NULL AND revoked_at IS NULL;

-- Revoked history keeps a deadline too, so nothing is left with an open end.
UPDATE mcp_tokens SET expires_at = revoked_at WHERE expires_at IS NULL;
