-- Google login was parked (2026-06-12): the Kwapso System's scope decision — the generic
-- base narrowed to email one-time codes only. Not a security finding.
-- google_sub was a UNIQUE column, which SQLite can't drop in place — so the
-- users table is rebuilt without it (standard SQLite column-removal pattern).
--
-- REVERSED FOR KWAPSO (2026-08-11) — read this before you conclude Google is off.
-- kwapso's SCOPE re-decides it (ch.03 "OTP + Google sign-in", ch.06 "email
-- one-time code … or Google — same person as long as the email matches"), and
-- SCOPE wins where it speaks. "Continue with Google" is BUILT and deployed on
-- both front doors. This migration is NOT reverted and google_sub is NOT coming
-- back: the identity key is the verified EMAIL, so a person who used a code
-- yesterday and Google today is one row, and there is no second key to keep in
-- step. See ARCHITECTURE.md §5 for the flow and OPERATIONS.md for the secrets.
-- The generic Kwapso System base may still default to email-only; this
-- deployment is what turned Google back on.

PRAGMA defer_foreign_keys = true;

CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  image_url TEXT,
  onboarding_completed_at TEXT,
  current_team_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deactivated_at TEXT
);

INSERT INTO users_new
  SELECT id, email, first_name, last_name, image_url,
         onboarding_completed_at, current_team_id,
         created_at, updated_at, deactivated_at
  FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
