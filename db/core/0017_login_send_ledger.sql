-- THE SEND LEDGER IS ITS OWN TABLE, BECAUSE A LEDGER CANNOT MOVE.
--
-- The send budget used to be SUM(login_codes.sends) keyed on login_codes.sent_ip.
-- But `sent_ip` legitimately MOVES on a rotation — whoever just asked is the
-- person about to type the code, and that is what earns them the reserved
-- attempt lane. The accumulated `sends` moved with it.
--
-- So the ledger was a token, held by whoever wrote last. Two addresses taking
-- turns on one email never paid: at each write the heavy row belonged to the
-- other one, so each writer's own bucket read near zero. Worse, the whole
-- accumulated charge landed on the next legitimate asker, who was then refused
-- for sends they had never made — and told it was "a lot of codes from one
-- place".
--
-- One row per send, attributed at the moment it happens and never reassigned.
-- login_codes.sends stays as the row's own count; it is no longer a budget.
CREATE TABLE IF NOT EXISTS login_sends (
  id         TEXT PRIMARY KEY,
  -- The caller a send is charged to: CF-Connecting-IP, the shared "unknown"
  -- bucket, or the test door's own bucket. Never rewritten.
  ip         TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- The two reads the budget makes, both windowed on the trailing hour.
CREATE INDEX IF NOT EXISTS idx_login_sends_ip_time ON login_sends (ip, created_at);
CREATE INDEX IF NOT EXISTS idx_login_sends_time ON login_sends (created_at);
