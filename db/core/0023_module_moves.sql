-- THE MODULE MOVE, AS A RECORD RATHER THAN AS A HOPE.
--
-- `moveModuleToOwnDatabase` is the one relief valve for a team database that has
-- grown past what D1 will hold, and until now it was a single request: create a
-- database, copy every row of every table, verify, flip routing, drain the old
-- home. Every one of those steps is bounded and safe on its own. The REQUEST is
-- not — it is the tool you reach for precisely because a table has millions of
-- rows, and a Worker that is killed halfway through leaves:
--
--   • a new database holding some tables and part of one more,
--   • no row in `team_module_databases` (the flip is last, deliberately), so
--     nothing is routed anywhere and nothing is doubled — the safe half,
--   • and NOTHING that says any of it happened. So the only thing a person could
--     do was run it again, which created a SECOND database, orphaned the first,
--     and started the copy from row one. On a table big enough to need moving,
--     "start again from row one" is a plan that never finishes.
--
-- This table is what makes a retry a CONTINUATION. One row per (team, module)
-- move, holding the database that was created and how far each table got, so the
-- next call picks up at the last id it copied instead of at the beginning.
--
-- WHY THE PROGRESS IS A CURSOR AND NOT A ROW COUNT. Every team table has
-- `id TEXT PRIMARY KEY`, and the copy already walks by key rather than by offset.
-- "The last id I successfully copied" is therefore both the resume point and an
-- index seek — while a count would be a number that has to agree with reality,
-- and the whole reason this row exists is that the process can stop at any moment.
--
-- IT IS ALSO THE LOCK. `status = 'copying'` with a `claimed_at` is how two
-- concurrent calls do not both copy the same table into the same database. The
-- claim rides an UPDATE with the current status in its WHERE (CONCURRENCY.md rule
-- 1) — zero rows changed means somebody else has it.

CREATE TABLE IF NOT EXISTS team_module_moves (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  module TEXT NOT NULL,
  -- The database created for this move. Written BEFORE the first byte is copied,
  -- so a retry reuses it rather than creating another. This is the field whose
  -- absence caused the orphan.
  database_id TEXT NOT NULL,
  -- Where the source rows are coming FROM, recorded so a resume does not have to
  -- re-derive it and cannot re-derive it differently (a team's main database can
  -- be re-pointed by an earlier move of another module).
  source_database_id TEXT NOT NULL,
  -- The tables this move covers, as a JSON array, exactly as the caller named
  -- them. Recorded so a resume moves the SAME set: a second call that passed a
  -- shorter list would otherwise "finish" a move that had not moved everything.
  tables_json TEXT NOT NULL,
  -- 'copying' → 'copied' → 'routed' → 'drained' → 'done'. Named after what has
  -- ALREADY happened, never after what is next, so a row read halfway through is
  -- unambiguous about what is safe to redo.
  status TEXT NOT NULL DEFAULT 'copying',
  -- Per-table resume cursors: {"activity": "01J8...", "help": ""} — the last id
  -- copied into the new database for each table. A table absent from this object
  -- has not been started; a table whose cursor is the empty string has been
  -- claimed but has copied nothing yet.
  cursors_json TEXT NOT NULL DEFAULT '{}',
  -- Tables that have been copied AND verified, as a JSON array. Separate from the
  -- cursors because "I reached the last row" and "the counts agreed" are two
  -- facts, and only the second one licenses a drain.
  verified_json TEXT NOT NULL DEFAULT '[]',
  -- Tables emptied from the old home. Draining is the one step that is NOT
  -- reversible and the one whose incompleteness doubles every read, so it is
  -- tracked per table rather than inferred from status.
  drained_json TEXT NOT NULL DEFAULT '[]',
  rows_copied INTEGER NOT NULL DEFAULT 0,
  -- The claim (see the header): who holds this move right now, and since when. A
  -- stale claim is reclaimable — a Worker that was killed cannot release its own.
  claimed_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

-- ONE LIVE MOVE PER (TEAM, MODULE). The uniqueness is the invariant, not a
-- convention: two rows would mean two databases, and a merged read over three
-- homes counting everything twice. Partial, so a finished move does not block a
-- future one (a module moved, outgrown its own database and moved again is a real
-- sequence) — the same shape as the one-open-timer-per-person index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_module_moves_live
  ON team_module_moves (team_id, module)
  WHERE status <> 'done';

-- The resume lookup: "is there an unfinished move for this team and module?"
CREATE INDEX IF NOT EXISTS idx_module_moves_status
  ON team_module_moves (status, claimed_at);
