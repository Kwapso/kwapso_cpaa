// THE REFERENCE NUMBER — the short code a client quotes on the phone and in
// every email we send them. One shape, team-wide, after the client's
// 2026-08-31 ruling and its own follow-up a moment later:
//
//  • THE TEAM-WIDE SHAPE — "T412", "B188", "S12", "M9", "A3", "W1", "I7" — a
//    single sequence PER KIND, shared by every account in the team, with no
//    account code anywhere in the string. Tickets, stories, sprints,
//    meetings, apps, waves and now the client-facing INPUT (né to-do) all
//    wear this.
//
//    WHY TEAM-WIDE AND NOT PER-ACCOUNT (the design question the client left
//    open): once the account code is gone from the string, two different
//    clients' tickets can both mint "T0001" and print IDENTICALLY wherever
//    they meet — and they do meet. `tickets-collection.tsx`'s `TriageQueue`
//    is a personal, CROSS-ACCOUNT list ("yours, unread") rendered as
//    `ref + description` with nothing naming the account on the row at all;
//    a triager scanning that queue would see two unrelated "T0001"s with no
//    way to tell them apart short of opening both. Sprint and meeting detail
//    screens DO carry an account chip next to their own black ID chip, but
//    the ticket queue does not, and a scheme has to be safe on its worst
//    screen, not its best one. Per-TEAM counters (one row per kind — the
//    team's own database already IS the tenant boundary, so "per team" here
//    is simply "no account_id in the key") make that collision structurally
//    impossible instead of merely unlikely, at the cost of a continuity
//    ("which account is busiest") nobody had asked to keep once the prefix
//    carrying it was the thing being removed.
//
//  • THE OLD ACCOUNT-CODED SHAPE — "BERG-D0412" — is GONE. The to-do (now
//    called Input on both screens) was the one holdout when the 2026-08-31
//    ruling landed, kept back only because the client had not named it yet.
//    She has now: Input mints team-wide with kind `I`, the same door every
//    other kind uses, and `ref_counters` — the table that carried nothing but
//    the to-do's counter after that first ruling — is dropped outright
//    (migration 0060). There is no second live shape to keep in step.
//
// The shape keeps the SAME race-safety this file has always relied on: ONE
// statement, `INSERT … ON CONFLICT DO UPDATE … RETURNING`, so two callers
// minting the same kind at once are serialised by the database rather than by
// a read-then-write (CONCURRENCY.md rule 1: the counter rides the write).

import { d1Query, type D1Rest } from "./d1-rest"
import type { MemberGuard } from "./gating"

/** The kinds minted TEAM-WIDE, with no account code anywhere in the string.
 * `story` and `sprint` swapped letters in the 2026-08-31 ruling — story is now
 * `B` (its old `S` went to sprint, which dropped the three-letter `SPR`) —
 * `app`/`wave` gained a reference for the first time in that same ruling, and
 * `input` (the client-facing to-do) joined a moment later, on the client's own
 * follow-up naming it. */
export const TEAM_REF_KINDS = {
  ticket: "T",
  story: "B",
  sprint: "S",
  meeting: "M",
  app: "A",
  wave: "W",
  input: "I",
} as const
export type TeamRefKind = (typeof TEAM_REF_KINDS)[keyof typeof TEAM_REF_KINDS]

/** Allocate the next TEAM-wide reference for one kind (ticket / story / sprint
 * / meeting / app / wave / input).
 *
 * Never null: nothing about this shape depends on an account existing, so
 * WHETHER to mint one at all — a ticket with no client, an internal meeting —
 * is each caller's own decision, made before it gets here (most still gate on
 * their own `accountId`, to keep "the number a client quotes" meaning what it
 * says; an app is not gated, because it is ours whether or not a client is
 * named on it, and it never carried that meaning to begin with). */
export async function nextTeamRef(cfg: D1Rest, guard: MemberGuard, kind: TeamRefKind): Promise<string> {
  const taken = await d1Query<{ next_no: number }>(
    cfg,
    guard.databaseId,
    `INSERT INTO team_ref_counters (kind, next_no) VALUES (?, 2)
     ON CONFLICT(kind) DO UPDATE SET next_no = next_no + 1
     RETURNING next_no`,
    [kind]
  )
  const no = (taken[0]?.next_no ?? 2) - 1
  return `${kind}${String(no).padStart(4, "0")}`
}
