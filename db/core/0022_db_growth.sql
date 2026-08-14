-- "WHEN WILL WE HIT THIS" — the question the size alarm could not answer.
--
-- The nightly check sizes every database and alarms at 80% of D1's 10 GB cap, and
-- 80% is a POSITION, not a warning. Two databases sitting at 8.1 GB are the same
-- alarm and completely different situations: one has been at 8 GB for a year, the
-- other crossed 6 GB last week and will hit the ceiling on Thursday. The mover
-- takes a while and needs a person, so the useful question is always "how long
-- have I got", and nothing in the app recorded enough to answer it.
--
-- ONE ROW PER DATABASE, NOT ONE PER NIGHT. A sample table would be the obvious
-- shape and the wrong one: an estate approaching the platform's 50,000-database
-- limit would add 50,000 rows a night to the very database this mechanism exists
-- to keep small — a growth watch that is itself the growth. So each database keeps
-- its CURRENT reading and its PREVIOUS one, and the nightly write moves current
-- into previous. Two points is all a rate needs, and the table's size is the
-- estate's size rather than the estate's size times its age.
--
-- WHY `prev_at` AND NOT "yesterday". The cron can be late, be skipped, or be
-- re-fired; a rate computed against an assumed 24 hours would be quietly wrong
-- exactly when the job has been unreliable, which is when you are most likely to
-- be reading it. The interval is stored, so the arithmetic is
-- (size_bytes - prev_size_bytes) / (at - prev_at), and it is honest about a gap.
CREATE TABLE IF NOT EXISTS db_growth (
  database_id TEXT PRIMARY KEY,
  database_name TEXT NOT NULL,
  -- tonight
  size_bytes INTEGER NOT NULL,
  at TEXT NOT NULL,
  -- the reading before it — NULL on a database's very first night, which is the
  -- honest answer to "how fast is it growing" when there is only one measurement.
  prev_size_bytes INTEGER,
  prev_at TEXT
);

-- The read is "which databases are filling fastest", so it is served by the
-- size, not by the id.
CREATE INDEX IF NOT EXISTS idx_db_growth_size ON db_growth (size_bytes DESC);
