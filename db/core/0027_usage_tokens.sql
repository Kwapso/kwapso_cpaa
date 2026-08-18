-- 0027 — the usage log records what a turn cost in TOKENS, not only in units.
--
-- `credits` counts REQUESTS. That is the right shape for an allowance a person
-- reads on screen ("25 left today") and the wrong shape for a bill: two turns
-- that each spend one unit can differ tenfold in tokens. These four columns are
-- the provider's own `usage` block, recorded per command beside the unit it was
-- metered against, so "what did this month cost" is a query rather than an
-- estimate.
--
-- THE TWO CACHE COLUMNS ARE THE POINT. The agent's preamble (the tool catalogue
-- + the system prompt) is byte-identical on every turn and is now sent with a
-- prompt-cache breakpoint. Whether that saves anything depends entirely on the
-- HIT RATE, and a hit rate cannot be reconstructed after the fact — it has to be
-- written down while the turn is happening. cache_read ÷ (cache_read +
-- cache_write + input) is the answer, off this table.
--
-- NULLABLE ON PURPOSE. Rows written before this migration were never measured,
-- and a back-filled 0 would read as "measured, and it cost nothing" — which is
-- the one thing the numbers must never say. NULL means not recorded.
--
-- WITHOUT IT the INSERT in `logUsage` names columns that do not exist, and
-- because recording usage is contractually best-effort (it must never break the
-- turn the user cares about) it fails SILENTLY: the log simply stops filling
-- while the assistant looks perfectly healthy. Same failure shape as 0014 and
-- 0020 — apply it to kwapso-core AND kwapso-core-staging BEFORE deploying
-- data-ops or content.
ALTER TABLE agent_usage_log ADD COLUMN input_tokens INTEGER;      -- full-price prompt tokens
ALTER TABLE agent_usage_log ADD COLUMN output_tokens INTEGER;     -- tokens the model wrote
ALTER TABLE agent_usage_log ADD COLUMN cache_write_tokens INTEGER; -- prompt tokens written to the cache
ALTER TABLE agent_usage_log ADD COLUMN cache_read_tokens INTEGER;  -- prompt tokens served from the cache
