-- THE EMAIL-CHANGE THROTTLE COUNTS BY TARGET NOW, SO GIVE IT AN INDEX.
--
-- The send throttle on the email-change door used to be one per-USER count,
-- served by idx_email_change_codes_user. It is two counts now (email-change.ts):
-- the caller's hourly ceiling AND the target address's, because the person who
-- receives that mail never asked for it — a per-account cap bounds what one
-- account spends, and accounts are free to anyone with an inbox.
--
-- The second count reads by new_email, which nothing indexed. This table is
-- never pruned and its length is attacker-influenced, so an unindexed scan on a
-- door an attacker drives gets slower exactly when it matters most.
CREATE INDEX IF NOT EXISTS idx_email_change_codes_target
  ON email_change_codes (new_email, created_at);
